import { taskIdFromBranch } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'
import { isolationLevelOf, samePath, type IsolationLevel } from './isolation-level'

/** One working-directory chip in the New Session dialog, per level (ISO-05). */
export type LevelOption =
  | { level: 'workspace'; path: string; workspaceName: string }
  | {
      level: 'repo'
      path: string
      repoName: string
      branch: string
      workspaceName: string
      taskId: number | null
    }
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
                  workspaceName: ws.displayName,
                  taskId: taskIdFromBranch(wt.branch)
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

/** The level the dialog opens on: the source cwd's own, else Worktree, so the
 *  generic and task-driven entries behave as before (ISO-06). */
export function initialLevel(tree: WorkspaceNode[], sourceCwd: string | undefined): IsolationLevel {
  if (sourceCwd === undefined) return 'worktree'
  return isolationLevelOf(tree, sourceCwd)?.level ?? 'worktree'
}

/** The selection after a level switch: kept when the new level lists it,
 *  cleared otherwise so Spawn waits for a new pick (ISO-06). */
export function cwdAfterLevelChange(
  tree: WorkspaceNode[],
  level: IsolationLevel,
  cwd: string | null
): string | null {
  if (cwd === null) return null
  return levelOptions(tree, level).some((o) => samePath(o.path, cwd)) ? cwd : null
}

/** A browsed folder the tree knows takes its level and the tree's spelling,
 *  so its chip is the selection; any other folder stays detached (ISO-06). */
export function adoptBrowsed(
  tree: WorkspaceNode[],
  path: string
): { level: IsolationLevel | null; cwd: string } {
  const match = isolationLevelOf(tree, path)
  return match ? { level: match.level, cwd: match.path } : { level: null, cwd: path }
}
