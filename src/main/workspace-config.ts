import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WorkspaceTemplates } from '../shared/config'

/**
 * Per-workspace config (PRD §Persistence — hybrid model): a hand-authored,
 * optionally checked-in `<workspace>/.app/config.json` carrying branch- and
 * worktree-name template overrides. Read on use — no caching, no watching — so
 * on-disk edits take effect at the next dialog open. The file is read once and
 * both templates extracted from it.
 *
 * Each template is the trimmed string, or null when the file/key is absent,
 * blank, not a string, or unreadable. Malformed JSON falls back to the global
 * templates silently from the UI's perspective, but is logged via console.error.
 */
export function workspaceTemplates(workspacePath: string): WorkspaceTemplates {
  const filePath = join(workspacePath, '.app', 'config.json')
  const none: WorkspaceTemplates = { branchTemplate: null, worktreeTemplate: null }
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch {
    return none
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return {
      branchTemplate: stringOrNull((parsed as Record<string, unknown>)?.branchTemplate),
      worktreeTemplate: stringOrNull((parsed as Record<string, unknown>)?.worktreeTemplate)
    }
  } catch (err) {
    console.error(`Ignoring malformed workspace config ${filePath}:`, err)
    return none
  }
}

/** Trimmed non-empty string, else null (numbers/objects/blank all collapse to null). */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}
