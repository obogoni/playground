import { taskIdFromBranch } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'
import type { IsolationLevel } from './isolation-level'

/** One working-directory chip in the New Session dialog, per level (ISO-05). */
export type LevelOption =
  | { level: 'workspace'; path: string; workspaceName: string }
  | { level: 'repo'; path: string; repoName: string; branch: string; workspaceName: string }
  | {
      level: 'worktree'
      path: string
      branch: string
      repoName: string
      workspaceName: string
      taskId: number | null
    }

/**
 * The chips for one level, in tree order. Workspace lists every non-missing
 * workspace (even one with no repos); Repo lists each primary checkout;
 * Worktree lists linked worktrees only, so no chip shows up at two levels.
 */
export function levelOptions(tree: WorkspaceNode[], level: IsolationLevel): LevelOption[] {
  if (level === 'workspace') {
    return tree
      .filter((ws) => !ws.missing)
      .map((ws) => ({ level, path: ws.path, workspaceName: ws.displayName }))
  }
  return tree.flatMap((ws) =>
    ws.repos.flatMap((repo) =>
      repo.worktrees
        .filter((wt) => wt.isDefault === (level === 'repo'))
        .map(
          (wt): LevelOption =>
            level === 'repo'
              ? {
                  level,
                  path: wt.path,
                  repoName: repo.name,
                  branch: wt.branch,
                  workspaceName: ws.displayName
                }
              : {
                  level,
                  path: wt.path,
                  branch: wt.branch,
                  repoName: repo.name,
                  workspaceName: ws.displayName,
                  taskId: taskIdFromBranch(wt.branch)
                }
        )
    )
  )
}
