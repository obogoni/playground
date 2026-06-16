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
 * Pure (string ops only) and therefore fully unit-tested.
 */

export interface SessionRingBufferOptions {
  /** Hard cap on retained bytes (UTF-8); defaults to ~1 MB. */
  maxBytes?: number
  /** Hard cap on retained lines; defaults to ~5,000. */
  maxLines?: number
}

const DEFAULT_MAX_BYTES = 1_000_000
const DEFAULT_MAX_LINES = 5_000

export class SessionRingBuffer {
  readonly maxBytes: number
  readonly maxLines: number
  #buf = ''

  constructor(opts: SessionRingBufferOptions = {}) {
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
    this.maxLines = opts.maxLines ?? DEFAULT_MAX_LINES
  }

  /** Appends a raw PTY chunk, then drops oldest content past either cap. */
  append(chunk: string): void {
    if (chunk === '') return
    this.#buf += chunk
    this.#trimToLines()
    this.#trimToBytes()
  }

  /** Full retained scrollback, ready to write straight back to a terminal. */
  snapshot(): string {
    return this.#buf
  }

  /** The last `lines` lines, for a card's last-output preview. */
  tail(lines: number): string {
    if (lines <= 0 || this.#buf === '') return ''
    const parts = this.#buf.split('\n')
    return parts.slice(-lines).join('\n')
  }

  /** Drop oldest lines, keeping the most recent `maxLines`. */
  #trimToLines(): void {
    const parts = this.#buf.split('\n')
    if (parts.length > this.maxLines) {
      this.#buf = parts.slice(-this.maxLines).join('\n')
    }
  }

  /**
   * Drop oldest bytes until under `maxBytes`. The cut is advanced to the next
   * line boundary so the retained head starts cleanly rather than mid-escape.
   */
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
    this.#buf = nl >= 0 ? this.#buf.slice(nl + 1) : this.#buf.slice(i)
  }
}
