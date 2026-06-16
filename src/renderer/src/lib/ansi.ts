// CSI/OSC ANSI escape matcher. Built from a string (not a regex literal) so no
// raw control characters live in the source; the pattern still targets the ESC
// () and CSI () introducers, hence the no-control-regex exception.
const ANSI =
  // eslint-disable-next-line no-control-regex
  new RegExp('[\\u001b\\u009b][[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PRZcf-nqry=><]', 'g')

/**
 * Strip ANSI escape sequences and carriage returns from raw PTY text so a
 * scrollback tail renders as readable plain text in a card preview (AGCF-08).
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI, '').replace(/\r/g, '')
}
