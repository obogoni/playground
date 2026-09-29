import type { RepoNode, WorkspaceNode, WorktreeNode } from '../../../shared/tree'

/**
 * Where a session runs, derived from its cwd against the tree at render time
 * and never stored (AD-050). The levels are disjoint: a registered workspace
 * folder is `workspace`, a repo's primary checkout is `repo`, a linked
 * worktree is `worktree` (ISO-01).
 */
export type IsolationLevel = 'workspace' | 'repo' | 'worktree'

export interface IsolationMatch {
  level: IsolationLevel
  /** The matched node's path, in the tree's own spelling. */
  path: string
  workspace: WorkspaceNode
  /** Set for `repo` and `worktree`. */
  repo?: RepoNode
  /** Set for `repo` (the primary checkout) and `worktree`. */
  worktree?: WorktreeNode
}

/** Case-insensitive, `\` = `/`, one trailing separator ignored (ISO-02). */
export function normalizePath(path: string): string {
  const slashed = path.replace(/\\/g, '/').toLowerCase()
  return slashed.endsWith('/') ? slashed.slice(0, -1) : slashed
}

export function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b)
}

/**
 * The level a cwd runs at, or null when it matches no tree node (a browsed
 * folder, a repo subfolder). Worktree nodes are checked across the whole tree
 * before workspace paths, so a workspace that is itself a repo reads as `repo`
 * (ISO-02).
 */
export function isolationLevelOf(tree: WorkspaceNode[], cwd: string): IsolationMatch | null {
  for (const workspace of tree) {
    for (const repo of workspace.repos) {
      const worktree = repo.worktrees.find((w) => samePath(w.path, cwd))
      if (worktree) {
        return {
          level: worktree.isDefault ? 'repo' : 'worktree',
          path: worktree.path,
          workspace,
          repo,
          worktree
        }
      }
    }
  }
  const workspace = tree.find((ws) => samePath(ws.path, cwd))
  return workspace ? { level: 'workspace', path: workspace.path, workspace } : null
}

/** The cwd a workspace row's "Spawn agent here" opens, or null when the row
 *  must not offer it: spawning in a missing folder fails (ISO-04). */
export function workspaceSpawnCwd(workspace: WorkspaceNode): string | null {
  return workspace.missing ? null : workspace.path
}

/** The cwd a repo row's "Spawn agent here" opens: its primary checkout. Null
 *  when git failed or the tree holds no primary checkout (ISO-04). */
export function repoSpawnCwd(repo: RepoNode): string | null {
  if (repo.error) return null
  return repo.worktrees.find((w) => w.isDefault)?.path ?? null
}

/**
 * The tree node id the session detail's "Open worktree" selects, or null to
 * hide the button: a worktree session opens its worktree, a repo session its
 * primary checkout, and a workspace session has no node to select (ISO-10).
 */
export function openWorktreeTarget(
  tree: WorkspaceNode[],
  session: { cwd: string; pathMissing: boolean }
): string | null {
  if (session.pathMissing) return null
  return isolationLevelOf(tree, session.cwd)?.worktree?.id ?? null
}
