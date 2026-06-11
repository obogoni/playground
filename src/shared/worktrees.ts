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
 * PRD placement convention: flat sibling of the source repo,
 * `<parent-of-repo><sep><repo>-<sanitized-branch>`. String-based (no node:path)
 * so the renderer's live path preview and the main-process create share it.
 */
export function worktreePathFor(repoPath: string, branch: string): string {
  const cut = Math.max(repoPath.lastIndexOf('\\'), repoPath.lastIndexOf('/'))
  const sep = repoPath[cut]
  const parent = repoPath.slice(0, cut)
  const repoName = repoPath.slice(cut + 1)
  return `${parent}${sep}${repoName}-${sanitizeBranch(branch)}`
}

/** Result of worktrees:create — failures are returned, never thrown. */
export interface CreateWorktreeResult {
  ok: boolean
  /** Absolute path of the new worktree, present when ok is true. */
  path?: string
  /** Human-readable failure message, present when ok is false. */
  error?: string
}
