import type { WorkspaceNode } from '../../../shared/tree'

export interface RepoOption {
  path: string
  name: string
  workspaceName: string
}

export function repoOptionsOf(tree: WorkspaceNode[]): RepoOption[] {
  return tree.flatMap((workspace) =>
    workspace.repos.map((repo) => ({
      path: repo.path,
      name: repo.name,
      workspaceName: workspace.displayName
    }))
  )
}

/** Primary-checkout branch, or '' when detached/bare (left to the user). */
export function defaultBaseFor(tree: WorkspaceNode[], repoPath: string): string {
  const repo = tree.flatMap((w) => w.repos).find((r) => r.path === repoPath)
  const branch = repo?.worktrees.find((w) => w.isDefault)?.branch ?? ''
  return branch.startsWith('(') ? '' : branch
}
