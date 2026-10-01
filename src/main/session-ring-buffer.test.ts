import { describe, expect, it } from 'vitest'
import { SessionRingBuffer } from './session-ring-buffer'
import { TerminalModeTracker } from './terminal-mode-tracker'

describe('SessionRingBuffer', () => {
  it('round-trips appended chunks through snapshot', () => {
    const buf = new SessionRingBuffer()
    buf.append('hello ')
    buf.append('world')
    expect(buf.snapshot()).toBe('hello world')
  })

  it('preserves raw ANSI bytes verbatim', () => {
    const buf = new SessionRingBuffer()
    const ansi = '\x1b[31mred\x1b[0m\r\n'
    buf.append(ansi)
    expect(buf.snapshot()).toBe(ansi)
  })

  it('returns empty snapshot/tail for an empty buffer', () => {
    const buf = new SessionRingBuffer()
    expect(buf.snapshot()).toBe('')
    expect(buf.tail(5)).toBe('')
  })

  it('drops oldest bytes past the byte cap, keeping the tail', () => {
    const buf = new SessionRingBuffer({ maxBytes: 1000, maxLines: 100_000 })
    buf.append('a'.repeat(2000))
    const snap = buf.snapshot()
    expect(Buffer.byteLength(snap, 'utf8')).toBeLessThanOrEqual(1000)
    // the most recent bytes survive
    expect(snap.endsWith('a')).toBe(true)
    expect(snap).toBe('a'.repeat(snap.length))
  })

  it('cuts byte overflow at a line boundary so the head starts clean', () => {
    const buf = new SessionRingBuffer({ maxBytes: 12, maxLines: 100_000 })
    buf.append('old-line-1\nold-line-2\nkeep\n')
    const snap = buf.snapshot()
    expect(Buffer.byteLength(snap, 'utf8')).toBeLessThanOrEqual(12)
    expect(snap.startsWith('old-line-2') || snap.startsWith('keep')).toBe(true)
    expect(snap).toContain('keep')
  })

  it('drops oldest lines past the line cap', () => {
    const buf = new SessionRingBuffer({ maxBytes: 100_000, maxLines: 3 })
    buf.append('l1\nl2\nl3\nl4\nl5')
    expect(buf.snapshot()).toBe('l3\nl4\nl5')
  })

  it('tail(N) returns the last N lines', () => {
    const buf = new SessionRingBuffer()
    buf.append('one\ntwo\nthree\nfour')
    expect(buf.tail(2)).toBe('three\nfour')
    expect(buf.tail(10)).toBe('one\ntwo\nthree\nfour')
  })

  it('keeps the recent tail intact across many overflowing appends', () => {
    const buf = new SessionRingBuffer({ maxBytes: 100_000, maxLines: 5 })
    for (let i = 1; i <= 100; i++) buf.append(`line-${i}\n`)
    // steady state keeps the last `maxLines` split-parts (the trailing '\n'
    // contributes one empty part, so four numbered lines remain)
    expect(buf.snapshot()).toBe('line-97\nline-98\nline-99\nline-100\n')
    expect(buf.snapshot()).not.toContain('line-1\n')
  })
  it('replays the modes that were trimmed off the head (TSP-06, TSP-07)', () => {
    const buf = new SessionRingBuffer({ maxBytes: 100_000, maxLines: 3 })
    buf.append('\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?2004h\n')
    for (let i = 1; i <= 5; i++) buf.append(`l${i}\n`)

    expect(buf.snapshot()).toBe('\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?2004h' + 'l4\nl5\n')
  })

  it('replays trimmed modes when the byte cap does the cutting (TSP-06)', () => {
    const buf = new SessionRingBuffer({ maxBytes: 20, maxLines: 100_000 })
    buf.append('\x1b[?1049h\x1b[?1003h\x1b[?2004h old and long line\n')
    buf.append('keep\n')

    expect(buf.snapshot()).toBe('\x1b[?1049h\x1b[?1003h\x1b[?2004h' + 'keep\n')
  })

  it('emits no prefix for modes set and reset inside the dropped head (TSP-07)', () => {
    const buf = new SessionRingBuffer({ maxBytes: 100_000, maxLines: 2 })
    buf.append('\x1b[?1049h\x1b[?1003h\n')
    buf.append('\x1b[?1003l\x1b[?1049l\n')
    buf.append('l1\nl2\n')

    expect(buf.snapshot()).toBe('l2\n')
  })

  it('leaves snapshot byte-equal to the appended content while nothing is dropped (TSP-10)', () => {
    const buf = new SessionRingBuffer({ maxBytes: 100_000, maxLines: 100_000 })
    const content = '\x1b[?1049h\x1b[?1003h\x1b[?2004hprompt> \n'
    buf.append(content)

    expect(buf.snapshot()).toBe(content)
  })

  it('never puts the mode prefix in the tail preview (TSP-11)', () => {
    const buf = new SessionRingBuffer({ maxBytes: 100_000, maxLines: 3 })
    buf.append('\x1b[?1049h\x1b[?1003h\n')
    for (let i = 1; i <= 5; i++) buf.append(`l${i}\n`)

    expect(buf.tail(2)).toBe('l5\n')
    expect(buf.snapshot()).toContain('\x1b[?1049h')
  })
})

/**
 * The pre-PERF-01 algorithm, verbatim, kept as the oracle for the rewrite: it
 * re-split and re-measured the whole buffer on every append (O(retained size)).
 */
class ReferenceRingBuffer {
  readonly maxBytes: number
  readonly maxLines: number
  #buf = ''
  readonly #modes = new TerminalModeTracker()

  constructor(opts: { maxBytes: number; maxLines: number }) {
    this.maxBytes = opts.maxBytes
    this.maxLines = opts.maxLines
  }

  append(chunk: string): void {
    if (chunk === '') return
    this.#buf += chunk
    this.#trimToLines()
    this.#trimToBytes()
  }

  snapshot(): string {
    return this.#modes.prefix() + this.#buf
  }

  tail(lines: number): string {
    if (lines <= 0 || this.#buf === '') return ''
    const parts = this.#buf.split('\n')
    return parts.slice(-lines).join('\n')
  }

  #trimToLines(): void {
    const parts = this.#buf.split('\n')
    if (parts.length > this.maxLines) {
      const dropped = parts.slice(0, parts.length - this.maxLines)
      this.#modes.feed(`${dropped.join('\n')}\n`)
      this.#buf = parts.slice(-this.maxLines).join('\n')
    }
  }

  #trimToBytes(): void {
    const excess = Buffer.byteLength(this.#buf, 'utf8') - this.maxBytes
    if (excess <= 0) return
    let removed = 0
    let i = 0
    while (i < this.#buf.length && removed < excess) {
      removed += Buffer.byteLength(this.#buf[i], 'utf8')
      i++
    }
    const nl = this.#buf.indexOf('\n', i)
    const cut = nl >= 0 ? nl + 1 : i
    this.#modes.feed(this.#buf.slice(0, cut))
    this.#buf = this.#buf.slice(cut)
  }
}

/** Seeded PRNG (mulberry32), so a failing stream is reproducible from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TEXT_TOKENS = ['a', 'b', 'z', ' ', 'é', '✻', 'Ωmega', 'word', '\r', '\x1b[31m', '\x1b[0m']
const MODE_TOKENS = [
  '\x1b[?1049h',
  '\x1b[?1049l',
  '\x1b[?2004h',
  '\x1b[?2004l',
  '\x1b[?1003h',
  '\x1b[?1003l',
  '\x1b[?1006h',
  '\x1b[?25l',
  '\x1b[?25h'
]

/**
 * A random BMP chunk stream: newline-dense and newline-free runs alternate, mode
 * sequences are sprinkled in, and the stream is cut at arbitrary points (so a
 * sequence can be split across chunks) into chunks of 1–4,096 UTF-16 units.
 */
function randomChunks(seed: number, count: number): string[] {
  const rand = mulberry32(seed)
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]
  let stream = ''
  let newlineOdds = 0
  while (stream.length < count * 120) {
    if (rand() < 0.02) newlineOdds = pick([0, 0, 0.05, 0.3, 0.6])
    const r = rand()
    if (r < newlineOdds) stream += rand() < 0.5 ? '\n' : '\r\n'
    else if (r < newlineOdds + 0.03) stream += pick(MODE_TOKENS)
    else stream += pick(TEXT_TOKENS)
  }
  const chunks: string[] = []
  let at = 0
  while (chunks.length < count && at < stream.length) {
    const r = rand()
    const size =
      r < 0.8
        ? 1 + Math.floor(rand() * 64)
        : r < 0.95
          ? 65 + Math.floor(rand() * 448)
          : 513 + Math.floor(rand() * 3584)
    chunks.push(stream.slice(at, at + size))
    at += size
  }
  return chunks
}

describe('SessionRingBuffer matches the reference algorithm (PERF-02, PERF-03)', () => {
  const caps = { maxBytes: 2_000, maxLines: 50 }

  for (const seed of [1, 42, 20261001]) {
    it(`compares snapshot() and tail(2) after every append (seed ${seed})`, () => {
      const ref = new ReferenceRingBuffer(caps)
      const buf = new SessionRingBuffer(caps)
      for (const [n, chunk] of randomChunks(seed, 1_500).entries()) {
        ref.append(chunk)
        buf.append(chunk)
        expect(buf.snapshot(), `snapshot after append ${n}`).toBe(ref.snapshot())
        expect(buf.tail(2), `tail after append ${n}`).toBe(ref.tail(2))
      }
    })

    it(`agrees when snapshot() is read only now and then (seed ${seed})`, () => {
      // snapshot() joins the retained chunks into one; reading it sparsely keeps
      // many chunks live, so the multi-chunk trim paths are compared too.
      const rand = mulberry32(seed ^ 0x5eed)
      const ref = new ReferenceRingBuffer(caps)
      const buf = new SessionRingBuffer(caps)
      let next = 1
      for (const [n, chunk] of randomChunks(seed + 7, 1_500).entries()) {
        ref.append(chunk)
        buf.append(chunk)
        expect(buf.tail(2), `tail after append ${n}`).toBe(ref.tail(2))
        if (--next === 0) {
          expect(buf.snapshot(), `snapshot after append ${n}`).toBe(ref.snapshot())
          next = 1 + Math.floor(rand() * 60)
        }
      }
      expect(buf.snapshot()).toBe(ref.snapshot())
    })
  }
})

describe('SessionRingBuffer append cost (PERF-01)', () => {
  const SPINNER = '\x1b[2K\r✻ Working… (esc to interrupt) 12.4s\n'

  it('pins the default caps', () => {
    const buf = new SessionRingBuffer()
    expect(buf.maxBytes).toBe(1_000_000)
    expect(buf.maxLines).toBe(5_000)
  })

  it('appends 10,000 × 45 B to a buffer holding 1,000,000 bytes in under 250 ms', () => {
    expect(Buffer.byteLength(SPINNER, 'utf8')).toBe(45)
    const buf = new SessionRingBuffer()
    const line = 'x'.repeat(249) + '\n'
    for (let i = 0; i < 4_000; i++) buf.append(line)
    expect(Buffer.byteLength(buf.snapshot(), 'utf8')).toBe(1_000_000)

    const start = performance.now()
    for (let i = 0; i < 10_000; i++) buf.append(SPINNER)
    expect(performance.now() - start).toBeLessThan(250)
    expect(Buffer.byteLength(buf.snapshot(), 'utf8')).toBeLessThanOrEqual(1_000_000)
  }, 60_000)

  it('appends 10,000 × 45 B to a buffer holding 5,000 lines in under 250 ms', () => {
    const buf = new SessionRingBuffer()
    for (let i = 0; i < 5_000; i++) buf.append(`line ${i}\n`)
    expect(buf.snapshot().split('\n')).toHaveLength(5_000)

    const start = performance.now()
    for (let i = 0; i < 10_000; i++) buf.append(SPINNER)
    expect(performance.now() - start).toBeLessThan(250)
    expect(buf.snapshot().split('\n')).toHaveLength(5_000)
  }, 60_000)
})

describe('SessionRingBuffer edge cases (PERF-02, PERF-03)', () => {
  it('keeps only the tail of a single chunk larger than maxBytes, cut at a line boundary', () => {
    const buf = new SessionRingBuffer({ maxBytes: 20, maxLines: 100_000 })
    buf.append('aaaa\n'.repeat(10))
    expect(buf.snapshot()).toBe('aaaa\naaaa\naaaa\n')
  })

  it('counts a chunk with no newline as part of the current last line', () => {
    const buf = new SessionRingBuffer({ maxBytes: 100_000, maxLines: 2 })
    buf.append('a\n')
    buf.append('b')
    buf.append('c')
    expect(buf.snapshot()).toBe('a\nbc')
    buf.append('\nd')
    expect(buf.snapshot()).toBe('bc\nd')
    expect(buf.tail(1)).toBe('d')
  })

  it('applies a mode sequence split across chunks once both halves are trimmed', () => {
    const buf = new SessionRingBuffer({ maxBytes: 6, maxLines: 100_000 })
    buf.append('\x1b[?10')
    buf.append('49hXYZ')
    // The byte cap cut mid-sequence: the first half is trimmed, the rest is kept.
    expect(buf.snapshot()).toBe('49hXYZ')
    buf.append('\n')
    buf.append('ok')
    expect(buf.snapshot()).toBe('\x1b[?1049hok')
  })

  it('never splits an astral character at the byte-cap boundary', () => {
    // 1 + 1 + 4 + 6 = 12 bytes against a 9-byte cap: the 3-byte excess ends inside
    // the emoji, so the cut moves past the whole emoji.
    const buf = new SessionRingBuffer({ maxBytes: 9, maxLines: 100_000 })
    buf.append('ab😀cdefgh')
    expect(buf.snapshot()).toBe('cdefgh')
  })

  it('counts an astral character as its 4 UTF-8 bytes', () => {
    const exact = new SessionRingBuffer({ maxBytes: 5, maxLines: 100_000 })
    exact.append('x😀')
    expect(exact.snapshot()).toBe('x😀')

    const over = new SessionRingBuffer({ maxBytes: 5, maxLines: 100_000 })
    over.append('xx😀')
    expect(over.snapshot()).toBe('x😀')

    // 1 + 4 + 5 = 10 bytes against a 4-byte cap: the 6-byte excess covers 'a',
    // the emoji (4) and 'b', so exactly the 4 bytes 'cdef' remain.
    const walk = new SessionRingBuffer({ maxBytes: 4, maxLines: 100_000 })
    walk.append('a😀bcdef')
    expect(walk.snapshot()).toBe('cdef')
  })
})
