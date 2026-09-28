import type { ActivityState } from '../../../shared/config'
import type { WorkspaceNode } from '../../../shared/tree'
import { worktreeIdForPath } from './tree-selection'

/**
 * The tree with one worktree's `dirty`/`changes` replaced by a recount
 * (SCRF-01). Always a new tree when the worktree is present, even with an
 * unchanged count, so the status bar recomputes ahead/behind (SCRF-03); the
 * same tree when it is not, so a recount landing after its worktree was
 * removed changes nothing.
 */
export function patchWorktreeStatus(
  tree: WorkspaceNode[],
  worktreePath: string,
  status: { dirty: boolean; changes: number }
): WorkspaceNode[] {
  const holds = tree.some((ws) =>
    ws.repos.some((repo) => repo.worktrees.some((wt) => wt.path === worktreePath))
  )
  if (!holds) return tree
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
