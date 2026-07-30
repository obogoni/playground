import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Per-repo config (WPC-01): a hand-authored, optionally checked-in
 * `<repo>/.app/config.json` carrying the command a freshly created worktree runs
 * to initialize itself (e.g. a script that replicates agent skills into the new
 * checkout). Read on use — no caching, no watching — so an on-disk edit takes
 * effect at the next create.
 *
 * Deliberately separate from `workspaceTemplates`: same file name, different
 * level (repo vs workspace), independent keys — neither reader sees the other's
 * (WPC-21).
 *
 * Returns the trimmed command, or null when the file or key is absent, blank,
 * not a string, or unreadable — in which case no hook runs at all (WPC-06).
 * Malformed JSON also yields null, but is logged via console.error (WPC-07).
 */
export function repoPostCreateCommand(repoPath: string): string | null {
  const filePath = join(repoPath, '.app', 'config.json')
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return stringOrNull((parsed as Record<string, unknown>)?.postCreateCommand)
  } catch (err) {
    console.error(`Ignoring malformed repo config ${filePath}:`, err)
    return null
  }
}

/** Trimmed non-empty string, else null (numbers/objects/blank all collapse to null). */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}
