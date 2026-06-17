import type { PinnedTaskView } from '../../../shared/tasks'
import { taskIdFromBranch } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'

/**
 * Session→worktree/task link, derived in the renderer (never stored — the
 * project's "link is derived, not stored" principle). A session's cwd is matched
 * against the worktree tree; a cwd that matches no worktree is `detached`.
 */
export interface SessionAttribution {
  branch: string | null
  taskId: number | null
  detached: boolean
}

export function deriveAttribution(tree: WorkspaceNode[], cwd: string): SessionAttribution {
  for (const ws of tree) {
    for (const repo of ws.repos) {
      const wt = repo.worktrees.find((w) => w.path === cwd)
      if (wt) return { branch: wt.branch, taskId: taskIdFromBranch(wt.branch), detached: false }
    }
  }
  return { branch: null, taskId: null, detached: true }
}

/**
 * The pinned task an extracted ID resolves to, or null when the ID is unpinned.
 * First-match-wins mirrors App.tsx's `linkedPin` rule for cross-org ID collisions.
 * Details may still be null on the returned pin until a fetch resolves them.
 */
export function linkedPinFor(
  tasks: PinnedTaskView[],
  taskId: number | null
): PinnedTaskView | null {
  if (taskId === null) return null
  return tasks.find((t) => t.id === taskId) ?? null
}
