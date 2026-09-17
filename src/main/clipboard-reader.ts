/**
 * Decides what a Ctrl+V (or right-click paste, or drop) should put into the
 * terminal. Runs in main because the renderer `clipboard` is deprecated from
 * Electron 40 and the Explorer file list needs a child process.
 *
 * Precedence is text, then files, then image. Copying from a browser, Word or
 * Teams puts text *and* an image on the clipboard, and attaching the image by
 * accident is the expensive mistake, so text always wins. An image with no file
 * list is a screenshot: it is written to a temp PNG and pasted as that path, so
 * the renderer only ever deals with text or paths.
 *
 * Electron, `child_process` and `fs` are injected (`ClipboardReaderDeps`), so
 * every decision here is unit-tested and the shell around it stays in
 * `index.ts`.
 */

import { join } from 'node:path'
import type { ClipboardPaste } from '../shared/paste'

/** The clipboard format Explorer sets when files are copied. */
const FILE_LIST_FORMAT = 'text/uri-list'

export interface ClipboardReaderDeps {
  readText(): string
  formats(): string[]
  readImagePng(): Buffer | null
  /** One line per copied path, from `[Windows.Forms.Clipboard]::GetFileDropList()`. */
  readFileDropList(): Promise<string>
  writeFile(path: string, data: Buffer): Promise<void>
  pasteDir: string
  now(): Date
  /** Six hex characters, so two images pasted in the same second differ. */
  rand(): string
}

/** What the clipboard holds, in paste precedence order. */
export function classifyClipboard(state: {
  text: string
  formats: string[]
  imageEmpty: boolean
}): 'text' | 'files' | 'image' | 'empty' {
  if (state.text !== '') return 'text'
  if (state.formats.includes(FILE_LIST_FORMAT)) return 'files'
  if (!state.imageEmpty) return 'image'
  return 'empty'
}

/** Absolute paths out of the file-list output; blank lines and CRLF are noise. */
export function parseFileDropList(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** `paste-yyyyMMdd-HHmmss-<rand>.png`, unique per paste within a second. */
export function pasteImageName(now: Date, rand: string): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `paste-${date}-${time}-${rand}.png`
}

/**
 * Reads the clipboard and resolves it to what the terminal should paste. A
 * failed file-list read (including its timeout) or a failed PNG write comes
 * back as `{ kind: 'error' }`; nothing here throws, so no paste ever hangs.
 */
export async function readClipboardPaste(deps: ClipboardReaderDeps): Promise<ClipboardPaste> {
  try {
    const text = deps.readText()
    const formats = deps.formats()
    // The image is only reachable once text and files are ruled out, and reading
    // it costs a clipboard round-trip, so it is read last.
    const png = text === '' && !formats.includes(FILE_LIST_FORMAT) ? deps.readImagePng() : null
    const kind = classifyClipboard({ text, formats, imageEmpty: png === null || png.length === 0 })

    if (kind === 'text') return { kind: 'text', text }
    if (kind === 'files') {
      return { kind: 'paths', paths: parseFileDropList(await deps.readFileDropList()) }
    }
    if (kind === 'image' && png) {
      const path = join(deps.pasteDir, pasteImageName(deps.now(), deps.rand()))
      await deps.writeFile(path, png)
      return { kind: 'paths', paths: [path] }
    }
    return { kind: 'empty' }
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}
