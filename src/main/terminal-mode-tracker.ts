/**
 * Folds the DEC private mode changes of a byte stream into the terminal state
 * they leave behind, and encodes that state as a prefix that puts a fresh xterm
 * back into it.
 *
 * `SessionRingBuffer` feeds it everything it trims: opencode redraws
 * constantly, so the `?1049h` / `?1003h` / `?1006h` / `?2004h` it sent at
 * startup falls off the head long before a session switch replays the buffer.
 * Without the prefix the replayed terminal comes up on the normal screen with
 * mouse tracking and bracketed paste off, which is the dead wheel and the
 * unbracketed paste the user sees after coming back.
 *
 * Only the modes a TUI depends on are tracked; every other param is ignored.
 *
 * Pure (string ops only) and therefore fully unit-tested.
 */

// Both patterns are built from strings (not regex literals) so no raw control
// character lives in the source; they still target the ESC introducer, hence the
// no-control-regex exception — same convention as `renderer/src/lib/ansi.ts`.

/** `CSI ? <params> h|l` — the only sequences that change a tracked mode. */
// eslint-disable-next-line no-control-regex
const MODE_SEQUENCE = new RegExp('\\u001b\\[\\?([0-9;]*)([hl])', 'g')

/**
 * Trailing bytes that could still grow into a `CSI ? … h|l`: a lone `ESC`, an
 * `ESC [`, an `ESC [ ?`, or an `ESC [ ?` with its params so far. Kept for the
 * next `feed` so a sequence cut mid-flight is applied once it completes.
 */
// eslint-disable-next-line no-control-regex
const PARTIAL_SEQUENCE = new RegExp('\\u001b(?:\\[(?:\\?[0-9;]*)?)?$')

/** Mouse-tracking protocols; the last one set wins, any reset clears them all. */
const TRACKING = [9, 1000, 1002, 1003]
/** Mouse-encoding schemes; the last one set wins, any reset restores the default. */
const ENCODING = [1005, 1006, 1015, 1016]
/** Alternate-screen params; all three are replayed as 1049. */
const ALT_SCREEN = [47, 1047, 1049]

export class TerminalModeTracker {
  #alt = false
  #tracking = 0
  #encoding = 0
  #focus = false
  #bracketedPaste = false
  #cursorVisible = true
  #carry = ''

  /** Scans a chunk for mode changes, carrying an incomplete trailing sequence. */
  feed(text: string): void {
    const stream = this.#carry + text
    MODE_SEQUENCE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = MODE_SEQUENCE.exec(stream)) !== null) {
      const set = match[2] === 'h'
      for (const param of match[1].split(';')) {
        if (param !== '') this.#apply(Number(param), set)
      }
    }
    this.#carry = PARTIAL_SEQUENCE.exec(stream)?.[0] ?? ''
  }

  /**
   * The sequences that take a fresh xterm to the tracked state: one per mode
   * that differs from the default, in alt-screen, tracking, encoding, focus,
   * bracketed-paste, cursor order.
   */
  prefix(): string {
    let out = ''
    if (this.#alt) out += '\x1b[?1049h'
    if (this.#tracking !== 0) out += `\x1b[?${this.#tracking}h`
    if (this.#encoding !== 0) out += `\x1b[?${this.#encoding}h`
    if (this.#focus) out += '\x1b[?1004h'
    if (this.#bracketedPaste) out += '\x1b[?2004h'
    if (!this.#cursorVisible) out += '\x1b[?25l'
    return out
  }

  #apply(param: number, set: boolean): void {
    if (ALT_SCREEN.includes(param)) this.#alt = set
    else if (TRACKING.includes(param)) this.#tracking = set ? param : 0
    else if (ENCODING.includes(param)) this.#encoding = set ? param : 0
    else if (param === 1004) this.#focus = set
    else if (param === 2004) this.#bracketedPaste = set
    else if (param === 25) this.#cursorVisible = set
  }
}
