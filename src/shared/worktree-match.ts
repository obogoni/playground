/**
 * The deepest worktree path that contains `target`, returned as given, or null.
 *
 * Same rule as the renderer's `worktreeIdForPath` (AD-037), over a flat list so
 * main can use it: case-insensitive and separator-agnostic (the app is Windows
 * only, where `D:\repo` and `d:/repo` name one folder), a match only at a
 * separator boundary (`.wt-a` never claims `.wt-ab`), and the deepest of nested
 * worktrees wins.
 */
export function deepestContaining(worktreePaths: readonly string[], target: string): string | null {
  const wanted = comparable(target)
  let best: string | null = null
  let bestLength = -1
  for (const path of worktreePaths) {
    const candidate = comparable(path)
    if (candidate === '') continue
    if (wanted !== candidate && !wanted.startsWith(`${candidate}/`)) continue
    if (candidate.length > bestLength) {
      best = path
      bestLength = candidate.length
    }
  }
  return best
}

/**
 * The folder a session is attributed to: the worktree it follows, else the one
 * it was launched in (SFWT-11). The PTY, respawn, duplicate and title keep `cwd`.
 */
export function workCwdOf(session: { cwd: string; followedPath?: string }): string {
  return session.followedPath ?? session.cwd
}

/** One spelling of a path, for comparing two of them. */
function comparable(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}
