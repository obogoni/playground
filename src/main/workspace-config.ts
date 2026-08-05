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

/**
 * Per-workspace post-create commands (HWC-02): the same hand-authored
 * `<workspace>/.app/config.json`, under a `postCreateCommands` map keyed by repo
 * folder name. This is the **out-of-repo** home for a repo's worktree init
 * command — the fallback `repoPostCreateCommand` defers to — so automating a
 * shared team repo needs no `.app/config.json` committed into it.
 *
 * Read on use, no caching (HWC-14), and independent of the template keys beside
 * it: neither reader sees the other's (HWC-10).
 *
 * Key matching is **exact first**; failing that, a *unique* case-insensitive
 * match counts, because Windows folder names are case-insensitive (AD-005) — so
 * `"code"` for a folder named `Code` is a slip, not a different repo. Two or more
 * case-insensitive matches with no exact one are ambiguous: no command runs and
 * the ambiguity is logged rather than resolved arbitrarily (HWC-09).
 *
 * Returns the trimmed command, or null when the file, the map, or the entry is
 * absent / unreadable / wrong-typed / blank — in which case no hook runs at all
 * (HWC-05..08). Malformed JSON also yields null, but is logged (HWC-06).
 */
export function workspacePostCreateCommand(workspacePath: string, repoName: string): string | null {
  const filePath = join(workspacePath, '.app', 'config.json')
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  let commands: unknown
  try {
    commands = (JSON.parse(raw) as Record<string, unknown>)?.postCreateCommands
  } catch (err) {
    console.error(`Ignoring malformed workspace config ${filePath}:`, err)
    return null
  }
  if (!isKeyedObject(commands)) return null

  // Own enumerable keys only — `in` would inherit `toString`/`constructor` from
  // the parsed object's prototype and "match" a repo of that name.
  const keys = Object.keys(commands)
  if (keys.includes(repoName)) return stringOrNull(commands[repoName])

  const variants = keys.filter((key) => key.toLowerCase() === repoName.toLowerCase())
  if (variants.length > 1) {
    console.error(
      `Ignoring ambiguous postCreateCommands keys for "${repoName}" in ${filePath}: ${variants.join(', ')}`
    )
    return null
  }
  return variants.length === 1 ? stringOrNull(commands[variants[0]]) : null
}

/** A key/value object — excludes null and arrays, which also pass `typeof 'object'`. */
function isKeyedObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Trimmed non-empty string, else null (numbers/objects/blank all collapse to null). */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}
