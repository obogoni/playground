import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Per-workspace config (PRD §Persistence — hybrid model): a hand-authored,
 * optionally checked-in `<workspace>/.app/config.json` carrying a branch
 * template override. Read on use — no caching, no watching — so on-disk edits
 * take effect at the next dialog open.
 *
 * Returns the trimmed template, or null when the file/key is absent, blank,
 * not a string, or unreadable (malformed JSON degrades silently to global).
 */
export function workspaceBranchTemplate(workspacePath: string): string | null {
  const filePath = join(workspacePath, '.app', 'config.json')
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  try {
    const template: unknown = JSON.parse(raw)?.branchTemplate
    return typeof template === 'string' && template.trim() !== '' ? template.trim() : null
  } catch (err) {
    console.error(`Ignoring malformed workspace config ${filePath}:`, err)
    return null
  }
}
