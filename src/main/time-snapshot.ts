import { execFileSync } from 'node:child_process'
import { basename, dirname, resolve } from 'node:path'
import { taskIdFromBranch } from '../shared/tasks'
import type { PeriodSnapshotFields } from '../shared/time'

export interface SnapshotInput {
  cwd: string
  /** Absolute `git rev-parse --git-common-dir`; null when git could not be read. */
  gitCommonDir: string | null
  /** `--abbrev-ref HEAD`; `HEAD` means detached. */
  branch: string | null
  /** Registered workspace paths (`AppConfig.workspaces`). */
  workspacePaths: string[]
  /** Pinned task id → cached title (`TaskBoard.list()`). */
  pinnedTitles: Map<number, string>
}

const NO_SNAPSHOT: PeriodSnapshotFields = {
  workspacePath: null,
  repoName: null,
  branch: null,
  taskId: null,
  taskTitle: null
}

/**
 * The attribution a period records when it opens (TIME-03). The repo is the
 * parent of the common git dir, so every worktree maps to its main repo; the
 * workspace is the repo's parent only when it is registered (AD-015 lexical
 * rule, case-insensitive). Unreadable git yields all nulls (TIME-12).
 */
export function buildSnapshot(input: SnapshotInput): PeriodSnapshotFields {
  if (input.gitCommonDir === null) return NO_SNAPSHOT
  const repo = dirname(resolve(input.gitCommonDir))
  const parent = dirname(repo).toLowerCase()
  const workspacePath =
    input.workspacePaths.find((path) => resolve(path).toLowerCase() === parent) ?? null
  const branch = input.branch === null || input.branch === 'HEAD' ? null : input.branch
  const taskId = branch === null ? null : taskIdFromBranch(branch)
  return {
    workspacePath,
    repoName: basename(repo),
    branch,
    taskId,
    taskTitle: taskId === null ? null : (input.pinnedTitles.get(taskId) ?? null)
  }
}

/** Shell seam, hand-verified: one git call, any failure (not a repo, git missing, timeout) → nulls. */
export function readGit(cwd: string): { gitCommonDir: string | null; branch: string | null } {
  try {
    const out = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir', '--abbrev-ref', 'HEAD'],
      {
        cwd,
        timeout: 2000,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    )
    const [gitCommonDir, branch] = out.split(/\r?\n/)
    return gitCommonDir && branch ? { gitCommonDir, branch } : { gitCommonDir: null, branch: null }
  } catch {
    return { gitCommonDir: null, branch: null }
  }
}
