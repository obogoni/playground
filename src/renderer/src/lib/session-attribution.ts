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
