import { describe, expect, it } from 'vitest'
import { SessionRingBuffer } from './session-ring-buffer'

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
})
