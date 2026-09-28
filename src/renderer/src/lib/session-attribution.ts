import type { PinnedTaskView, SessionTask } from '../../../shared/tasks'
import { taskIdFromBranch } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'

/**
 * Session→worktree/task link, derived in the renderer. A session's cwd is
 * matched against the worktree tree; a cwd that matches no worktree is
 * `detached`. A task the user linked by hand wins over the branch's task
 * (HTSK-11); the branch and the detached state are still reported, so the
 * caller can show what the branch says.
 */
export interface SessionAttribution {
  branch: string | null
  taskId: number | null
  detached: boolean
  /** True when the task comes from the session's link, not its branch. */
  linked: boolean
  /** The link's stored title; null without a link or when the link has none. */
  linkTitle: string | null
}

export function deriveAttribution(
  tree: WorkspaceNode[],
  cwd: string,
  link?: SessionTask | null
): SessionAttribution {
  const { branch, detached } = worktreeOf(tree, cwd)
  if (link) return { branch, taskId: link.id, detached, linked: true, linkTitle: link.title }
  return {
    branch,
    taskId: branch === null ? null : taskIdFromBranch(branch),
    detached,
    linked: false,
    linkTitle: null
  }
}

function worktreeOf(
  tree: WorkspaceNode[],
  cwd: string
): { branch: string | null; detached: boolean } {
  for (const ws of tree) {
    for (const repo of ws.repos) {
      const wt = repo.worktrees.find((w) => w.path === cwd)
      if (wt) return { branch: wt.branch, detached: false }
    }
  }
  return { branch: null, detached: true }
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
