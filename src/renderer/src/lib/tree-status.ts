import type { ActivityState } from '../../../shared/config'
import type { WorkspaceNode } from '../../../shared/tree'
import { worktreeIdForPath } from './tree-selection'

/**
 * The tree with one worktree's `dirty`/`changes` replaced by a recount
 * (SCRF-01). The same tree when the count did not change (PERF-11) or when the
 * worktree is gone, so a recount that changes nothing re-renders nothing. The
 * status bar no longer relies on a new identity to re-read ahead/behind: it
 * listens for recounts of its own worktree (AD-052, amending SCRF-03).
 */
export function patchWorktreeStatus(
  tree: WorkspaceNode[],
  worktreePath: string,
  status: { dirty: boolean; changes: number }
): WorkspaceNode[] {
  const current = tree
    .flatMap((ws) => ws.repos.flatMap((repo) => repo.worktrees))
    .find((wt) => wt.path === worktreePath)
  if (!current || (current.dirty === status.dirty && current.changes === status.changes)) {
    return tree
  }
  return tree.map((ws) => ({
    ...ws,
    repos: ws.repos.map((repo) => ({
      ...repo,
      worktrees: repo.worktrees.map((wt) =>
        wt.path === worktreePath ? { ...wt, dirty: status.dirty, changes: status.changes } : wt
      )
    }))
  }))
}

/**
 * The worktree to recount because a session's turn just ended there: activity
 * went from `working` to `waiting` or `exited` (SCRF-07). The worktree is the
 * one holding the session's `cwd`; a `cwd` outside every worktree recounts
 * nothing (SCRF-08).
 */
export function worktreeForTurnEnd(
  tree: WorkspaceNode[],
  before: ActivityState | undefined,
  after: ActivityState | undefined,
  cwd: string
): string | null {
  if (before !== 'working' || (after !== 'waiting' && after !== 'exited')) return null
  return worktreeIdForPath(tree, cwd)
}
