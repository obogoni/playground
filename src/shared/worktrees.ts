import { taskIdFromBranch } from './tasks'

/** Default worktree folder name — reproduces the historical `<repo>-<branch>`. */
export const DEFAULT_WORKTREE_TEMPLATE = '{repo}-{branch}'

/**
 * PRD branch sanitization for worktree paths: path separators and anything
 * outside [A-Za-z0-9._-] become '-', consecutive '-' collapse, ends trimmed.
 * The branch name itself is NOT sanitized — git validates it.
 */
export function sanitizeBranch(branch: string): string {
  return branch
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Renders the worktree folder name (the final path segment) from a template
 * with `{repo}` (repo folder basename), `{branch}` (the branch, sanitized with
 * the rest), and `{id}` (the branch's extracted task number via
 * `taskIdFromBranch`, empty when none). Unknown placeholders pass through
 * literally; a blank template falls back to `{repo}-{branch}`. The whole
 * result is sanitized, so the default reproduces the historical
 * `<repo>-<sanitized-branch>` byte-for-byte. May render to '' (e.g. `{id}` on a
 * branch with no number) — callers guard that.
 */
export function worktreeNameFor(repoPath: string, branch: string, template?: string): string {
  const cut = Math.max(repoPath.lastIndexOf('\\'), repoPath.lastIndexOf('/'))
  const repoName = repoPath.slice(cut + 1)
  const id = taskIdFromBranch(branch)
  const rendered = (template?.trim() || DEFAULT_WORKTREE_TEMPLATE)
    .replaceAll('{repo}', repoName)
    .replaceAll('{branch}', branch)
    .replaceAll('{id}', id === null ? '' : String(id))
  return sanitizeBranch(rendered)
}

/**
 * PRD placement convention: flat sibling of the source repo,
 * `<parent-of-repo><sep><rendered-name>`. String-based (no node:path) so the
 * renderer's live path preview and the main-process create share it. Only the
 * final segment is templated (`worktreeNameFor`); placement is unchanged.
 */
export function worktreePathFor(repoPath: string, branch: string, template?: string): string {
  const cut = Math.max(repoPath.lastIndexOf('\\'), repoPath.lastIndexOf('/'))
  const sep = repoPath[cut]
  const parent = repoPath.slice(0, cut)
  return `${parent}${sep}${worktreeNameFor(repoPath, branch, template)}`
}

/** Result of worktrees:create — failures are returned, never thrown. */
export interface CreateWorktreeResult {
  ok: boolean
  /** Absolute path of the new worktree, present when ok is true. */
  path?: string
  /** Human-readable failure message, present when ok is false. */
  error?: string
  /**
   * Set (with `ok: false` and no `error`) when a local branch of the requested
   * name already exists and the caller must choose to reuse or recreate it
   * (EXB-05). Distinct from an ordinary failure: the renderer prompts instead of
   * showing an error.
   */
  conflict?: 'branch-exists'
}

/** Result of worktrees:remove — failures (guards included) are returned, never thrown. */
export interface RemoveWorktreeResult {
  ok: boolean
  /** Human-readable refusal/failure message, present when ok is false. */
  error?: string
}

/**
 * A presentational label for a changed file in a worktree, derived from the
 * `git status --porcelain` two-char code. Not a faithful git state machine:
 * when index and worktree columns disagree, the single most-relevant label wins
 * (deleted > added > renamed > modified; `??` → untracked).
 */
export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'

/** One changed file as shown in the force-remove confirmation (FRWT-01). */
export interface ChangedFile {
  /** Worktree-relative path; for a rename, the destination (post-`-> `) path. */
  path: string
  status: ChangeStatus
}
