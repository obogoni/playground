import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import type { FileContent } from '../shared/files'

/** Above this the viewer shows a placeholder and the file is never read (FXPL-20). */
export const MAX_VIEW_BYTES = 1024 * 1024

/** How much of a file decides whether it is binary — git's own heuristic. */
export const BINARY_SNIFF_BYTES = 8000

/**
 * Reads one worktree file for the viewer (FXPL-16/17/20/24). `stat` comes
 * first, so a huge file is reported by its size without ever being read. Never
 * throws: every outcome the tab has to render is a `kind` of the result.
 */
export async function readForView(worktreePath: string, relPath: string): Promise<FileContent> {
  const full = resolveInside(worktreePath, relPath)
  if (full === null) {
    return { kind: 'error', message: `${relPath} is outside the worktree` }
  }
  let size: number
  try {
    const info = await stat(full)
    if (!info.isFile()) return { kind: 'missing' }
    size = info.size
  } catch {
    return { kind: 'missing' }
  }
  if (size > MAX_VIEW_BYTES) return { kind: 'too-large', size }
  try {
    const bytes = await readFile(full)
    if (isBinary(bytes)) return { kind: 'binary', size }
    // Buffer→utf8 substitutes U+FFFD for bytes that are not valid UTF-8, which
    // is what the viewer should show rather than refusing the file (edge case).
    return { kind: 'text', text: bytes.toString('utf8'), size }
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * The absolute path `relPath` names inside `root`, or null when it escapes.
 * Lexical on purpose: the untracked skills junction (AD-013) sits inside the
 * worktree and reading through it is correct, so symlinks are not resolved.
 */
export function resolveInside(root: string, relPath: string): string | null {
  if (relPath === '' || isAbsolute(relPath)) return null
  const base = resolve(root)
  const full = resolve(base, relPath)
  if (full !== base && !full.startsWith(base + sep)) return null
  return full
}

/** True when the first 8000 bytes hold a NUL — the heuristic git itself uses. */
export function isBinary(head: Buffer): boolean {
  return head.subarray(0, BINARY_SNIFF_BYTES).includes(0)
}
