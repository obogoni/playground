/**
 * Bounded per-session scrollback. A detached session keeps running in main and
 * accumulates its PTY output here so that, on re-attach, the renderer can be
 * handed everything it missed (`snapshot()`) before the live stream resumes.
 *
 * Raw PTY bytes — ANSI escape sequences included — are stored verbatim so the
 * replay reproduces colours/cursor moves exactly when written back to xterm.
 * The buffer is capped on two axes (bytes and lines); whichever cap is hit
 * first, the *oldest* content is dropped and the recent tail is preserved.
 *
 * Everything trimmed off the head is folded into a `TerminalModeTracker`, and
 * `snapshot()` prepends the mode prefix it yields: a TUI sets the alternate
 * screen, mouse tracking and bracketed paste once at startup, so those
 * sequences are long gone by the time a session switch replays the buffer.
 *
 * The content is a deque of the appended chunks with running byte and newline
 * totals, so an append costs O(chunk + trimmed) whatever is retained (PERF-01):
 * trims walk from the head and never re-split or re-measure the whole buffer.
 *
 * Pure (string ops only) and therefore fully unit-tested.
 */

import { TerminalModeTracker } from './terminal-mode-tracker'

export interface SessionRingBufferOptions {
  /** Hard cap on retained bytes (UTF-8); defaults to ~1 MB. */
  maxBytes?: number
  /** Hard cap on retained lines; defaults to ~5,000. */
  maxLines?: number
}

const DEFAULT_MAX_BYTES = 1_000_000
const DEFAULT_MAX_LINES = 5_000

/** Dropped head slots are compacted away once they are this many and half the deque. */
const COMPACT_AFTER = 1024

interface Chunk {
  text: string
  /** UTF-8 length of `text`. */
  bytes: number
  /** `'\n'` count of `text`. */
  newlines: number
}

function countNewlines(text: string): number {
  let n = 0
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++
  return n
}

/**
 * Walks `text` by code point from the start until at least `need` UTF-8 bytes
 * are covered and returns the index reached. A surrogate pair counts its real
 * 4 bytes and is never split; a lone surrogate counts the 3 bytes of the
 * replacement character it encodes to (PERF-02).
 */
function walkUtf8(text: string, need: number): number {
  let i = 0
  let bytes = 0
  while (i < text.length && bytes < need) {
    const c = text.charCodeAt(i)
    if (c < 0x80) {
      bytes += 1
      i += 1
    } else if (c < 0x800) {
      bytes += 2
      i += 1
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1)
      const pair = next >= 0xdc00 && next <= 0xdfff
      bytes += pair ? 4 : 3
      i += pair ? 2 : 1
    } else {
      bytes += 3
      i += 1
    }
  }
  return i
}

export class SessionRingBuffer {
  readonly maxBytes: number
  readonly maxLines: number
  /** Live chunks are `#chunks[#head..]`; slots before `#head` are dropped. */
  #chunks: Chunk[] = []
  #head = 0
  #bytes = 0
  #newlines = 0
  readonly #modes = new TerminalModeTracker()

  constructor(opts: SessionRingBufferOptions = {}) {
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
    this.maxLines = opts.maxLines ?? DEFAULT_MAX_LINES
  }

  /** Appends a raw PTY chunk, then drops oldest content past either cap. */
  append(chunk: string): void {
    if (chunk === '') return
    const entry = {
      text: chunk,
      bytes: Buffer.byteLength(chunk, 'utf8'),
      newlines: countNewlines(chunk)
    }
    this.#chunks.push(entry)
    this.#bytes += entry.bytes
    this.#newlines += entry.newlines
    this.#trimToLines()
    this.#trimToBytes()
    if (this.#head > COMPACT_AFTER && this.#head > this.#chunks.length / 2) {
      this.#chunks.splice(0, this.#head)
      this.#head = 0
    }
  }

  /**
   * Full retained scrollback, ready to write straight back to a terminal: the
   * modes trimmed off the head first, then the content that survived. The live
   * chunks are joined once and kept as one, so a repeated attach costs O(1).
   */
  snapshot(): string {
    if (this.#chunks.length - this.#head > 1) {
      const text = this.#chunks
        .slice(this.#head)
        .map((c) => c.text)
        .join('')
      this.#chunks = [{ text, bytes: this.#bytes, newlines: this.#newlines }]
      this.#head = 0
    }
    return this.#modes.prefix() + (this.#chunks[this.#head]?.text ?? '')
  }

  /** The last `lines` lines, for a card's last-output preview. */
  tail(lines: number): string {
    if (lines <= 0 || this.#head >= this.#chunks.length) return ''
    // The last `lines` lines are everything after the `lines`-th newline from the end.
    const parts: string[] = []
    let need = lines
    for (let k = this.#chunks.length - 1; k >= this.#head; k--) {
      const { text, newlines } = this.#chunks[k]
      if (newlines < need) {
        parts.push(text)
        need -= newlines
        continue
      }
      let at = text.length
      for (let n = 0; n < need; n++) at = text.lastIndexOf('\n', at - 1)
      parts.push(text.slice(at + 1))
      break
    }
    return parts.reverse().join('')
  }

  /** Drop oldest lines, keeping the most recent `maxLines`. */
  #trimToLines(): void {
    let excess = this.#newlines + 1 - this.maxLines
    if (excess <= 0) return
    const dropped: string[] = []
    while (excess > 0) {
      const head = this.#chunks[this.#head]
      if (head.newlines < excess) {
        excess -= head.newlines
        this.#dropHead(dropped)
        continue
      }
      let at = -1
      for (let n = 0; n < excess; n++) at = head.text.indexOf('\n', at + 1)
      this.#cutHead(at + 1, dropped)
      excess = 0
    }
    this.#modes.feed(dropped.join(''))
  }

  /**
   * Drop oldest bytes until under `maxBytes`. The cut is advanced to the next
   * line boundary so the retained head starts cleanly rather than mid-escape;
   * with no newline left it stays where the excess ran out.
   */
  #trimToBytes(): void {
    let excess = this.#bytes - this.maxBytes
    if (excess <= 0) return
    const dropped: string[] = []
    // Chunks the excess covers whole fall off without being scanned.
    while (this.#head < this.#chunks.length && this.#chunks[this.#head].bytes <= excess) {
      excess -= this.#chunks[this.#head].bytes
      this.#dropHead(dropped)
    }
    if (this.#head < this.#chunks.length) {
      const head = this.#chunks[this.#head]
      const walked = walkUtf8(head.text, excess)
      const walkedNewlines = countNewlines(head.text.slice(0, walked))
      if (this.#newlines === walkedNewlines) {
        // No line boundary after the walk point anywhere: cut right there.
        this.#cutHead(walked, dropped)
      } else if (head.newlines > walkedNewlines) {
        this.#cutHead(head.text.indexOf('\n', walked) + 1, dropped)
      } else {
        this.#dropHead(dropped)
        while (this.#chunks[this.#head].newlines === 0) this.#dropHead(dropped)
        this.#cutHead(this.#chunks[this.#head].text.indexOf('\n') + 1, dropped)
      }
    }
    this.#modes.feed(dropped.join(''))
  }

  /** Drops the whole head chunk, collecting its text for the mode tracker. */
  #dropHead(dropped: string[]): void {
    const head = this.#chunks[this.#head]
    this.#head++
    this.#bytes -= head.bytes
    this.#newlines -= head.newlines
    dropped.push(head.text)
  }

  /** Drops the head chunk's first `at` UTF-16 units, collecting them. */
  #cutHead(at: number, dropped: string[]): void {
    const head = this.#chunks[this.#head]
    if (at <= 0) return
    if (at >= head.text.length) {
      this.#dropHead(dropped)
      return
    }
    const cut = head.text.slice(0, at)
    const bytes = Buffer.byteLength(cut, 'utf8')
    const newlines = countNewlines(cut)
    this.#chunks[this.#head] = {
      text: head.text.slice(at),
      bytes: head.bytes - bytes,
      newlines: head.newlines - newlines
    }
    this.#bytes -= bytes
    this.#newlines -= newlines
    dropped.push(cut)
  }
}
