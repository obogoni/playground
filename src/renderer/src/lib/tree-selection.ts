import type { WorkspaceNode, WorktreeNode } from '../../../shared/tree'

export interface SelectedWorktree {
  workspaceName: string
  repoName: string
  repoPath: string
  worktree: WorktreeNode
}

/** Resolve a selection id (a worktree's absolute path) to its full context. */
export function findWorktree(tree: WorkspaceNode[], id: string | null): SelectedWorktree | null {
  if (!id) return null
  for (const workspace of tree) {
    for (const repo of workspace.repos) {
      const worktree = repo.worktrees.find((w) => w.id === id)
      if (worktree) {
        return {
          workspaceName: workspace.displayName,
          repoName: repo.name,
          repoPath: repo.path,
          worktree
        }
      }
    }
  }
  return null
}

/** Keep the current selection only while its worktree still exists in the tree. */
export function selectionAfterRefresh(
  tree: WorkspaceNode[],
  currentId: string | null
): string | null {
  return findWorktree(tree, currentId) ? currentId : null
}

/**
 * After removing a worktree the selected row is gone — land on the repo's
 * primary checkout instead of the empty state, or nothing if it can't be found.
 */
export function selectionAfterRemove(tree: WorkspaceNode[], repoPath: string): string | null {
  const repo = tree.flatMap((ws) => ws.repos).find((r) => r.path === repoPath)
  return repo?.worktrees.find((w) => w.isDefault)?.id ?? null
}
