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

/**
 * The worktree a path lies in, by its selection id, or null when none does.
 *
 * A session records the folder it was spawned in, and that folder is a
 * worktree's — or one inside it, since an agent may be started deeper. The
 * deepest match wins, so a worktree nested inside another resolves to itself
 * rather than to its parent.
 *
 * Comparison is case-insensitive and separator-agnostic: the app is Windows
 * only, where `D:\repo` and `d:/repo` name the same folder, and the two
 * spellings do reach this from different sources.
 */
export function worktreeIdForPath(tree: WorkspaceNode[], path: string | null): string | null {
  if (!path) return null
  const target = comparable(path)
  let best: string | null = null
  let bestLength = -1
  for (const workspace of tree) {
    for (const repo of workspace.repos) {
      for (const worktree of repo.worktrees) {
        const candidate = comparable(worktree.id)
        if (candidate === '') continue
        if (target !== candidate && !target.startsWith(`${candidate}/`)) continue
        if (candidate.length > bestLength) {
          best = worktree.id
          bestLength = candidate.length
        }
      }
    }
  }
  return best
}

/** One spelling of a path, for comparing two of them. */
function comparable(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}
