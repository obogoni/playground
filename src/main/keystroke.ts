/**
 * Tells the user typing apart from what the terminal reports on its own.
 *
 * Claude Code turns on mouse tracking (`ESC[?1003h`), so moving the pointer
 * over an attached session sends bytes up the same `session:input` channel as
 * a keypress. Those bytes must never answer a permission dialog the user has
 * not touched, which is exactly what the keystroke rule would do (ACTV-12,
 * ACTV-33).
 */

// Built from a string, like `renderer/src/lib/ansi.ts`, so no raw control
// characters live in the source. Matches, in order: SGR mouse reports
// (`ESC[<b;x;yM` / `…m`), X10 reports (`ESC[M` plus exactly three bytes),
// urxvt reports (`ESC[b;x;yM`), and focus in/out (`ESC[I` / `ESC[O`).
const TERMINAL_REPORT = new RegExp(
  // eslint-disable-next-line no-control-regex
  '\\u001b\\[<\\d+;\\d+;\\d+[Mm]|\\u001b\\[M[\\s\\S]{3}|\\u001b\\[\\d+;\\d+;\\d+M|\\u001b\\[[IO]',
  'g'
)

/** True when the chunk carries anything the user actually typed. */
export function isKeystroke(data: string): boolean {
  return data.replace(TERMINAL_REPORT, '') !== ''
}
