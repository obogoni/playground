import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { workspacePostCreateCommand } from './workspace-config'

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

/**
 * The command a freshly created worktree runs — from the repo's own declaration
 * or, failing that, from the workspace that contains it (HWC-01, HWC-02). This is
 * what `withPostCreateHook` is wired to.
 *
 * `readCommand`'s signature is unchanged because both levels are derivable from
 * `repoPath` alone: `scanRepos` only ever finds a repo as a **direct child** of
 * its workspace (`repo-scanner.ts`), so the workspace is `dirname(repoPath)` and
 * the repo's key is `basename(repoPath)` (HWC-03). Trailing separators fold away
 * with them (HWC-11).
 *
 * The repo wins whenever it declares anything, so AD-013's behaviour is untouched
 * and **exactly one** command ever runs (HWC-01). Derivation is purely lexical —
 * no lookup against the registered workspaces — so a `repoPath` that is not a
 * workspace child simply finds no key and no command runs (HWC-13). Neither level
 * is cached, so an on-disk edit lands on the next create (HWC-14).
 */
export function resolvePostCreateCommand(repoPath: string): string | null {
  const own = repoPostCreateCommand(repoPath)
  if (own !== null) return own
  // A drive root or an empty path has no name to key on (HWC-12); `dirname` would
  // hand back the root itself, so bail rather than look up an empty repo name.
  const repoName = basename(repoPath)
  return repoName === '' ? null : workspacePostCreateCommand(dirname(repoPath), repoName)
}

/** Trimmed non-empty string, else null (numbers/objects/blank all collapse to null). */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}
