/**
 * What a paste gesture turns into. Main reads the clipboard (text, copied
 * files, or an image it has just written to a temp PNG) and answers with a
 * `ClipboardPaste`; a drop resolves its files to paths and builds one locally.
 * `planPaste` is the single place that decides the exact chunks handed to
 * `term.paste`, so Ctrl+V, the right-click paste and a drop cannot drift apart.
 *
 * Paths go out one per paste, always double-quoted: opencode attaches only when
 * the whole paste is one path, and Claude Code strips the outer quotes per
 * piece. Windows paths cannot contain `"`, so quoting never needs escaping.
 *
 * Pure (string ops only) and therefore fully unit-tested.
 */

export type ClipboardPaste =
  | { kind: 'text'; text: string }
  | { kind: 'paths'; paths: string[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }

/**
 * Gap held between consecutive `term.paste` calls. Claude Code merges paste
 * chunks that arrive within 50 ms, so a shorter gap would glue two paths into
 * one unrecognised blob.
 */
export const PASTE_GAP_MS = 100

/** `"<path>"` — the one form both opencode and Claude Code recognise. */
export function quotePath(path: string): string {
  return `"${path}"`
}

/**
 * The ordered `term.paste` chunks for a paste: text goes out verbatim in one
 * chunk, paths go out quoted one by one, and anything that resolved to nothing
 * (empty clipboard, failed read, items with no path) sends zero bytes.
 */
export function planPaste(paste: ClipboardPaste): string[] {
  switch (paste.kind) {
    case 'text':
      return [paste.text]
    case 'paths':
      return paste.paths.filter((path) => path !== '').map(quotePath)
    default:
      return []
  }
}
