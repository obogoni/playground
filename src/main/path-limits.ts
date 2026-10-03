import type { PathCheckRequest } from '../shared/worktrees'
import { worktreePathFor } from '../shared/worktrees'
import { git, type GitRunner } from './git'

/**
 * Path limits a worktree create can pass on Windows (BSLG-17..30), checked
 * before git runs so the user reads the length and the way out instead of
 * git's progress note. The numbers are measured on git for Windows
 * (design.md, Measurements), not read from documentation.
 */

/** Longest file path Windows creates without long-path support: 259 passes, 260 fails (M1). */
export const WINDOWS_MAX_FILE_PATH = 259
/** Longest folder path Windows creates without long-path support: 247 passes, 248 fails (M2, M4). */
export const WINDOWS_MAX_FOLDER_PATH = 247
/** Longest worktree folder `git worktree add` accepts, with or without core.longpaths (M3, M6). */
export const GIT_MAX_WORKTREE_FOLDER = 215

export interface PathLimitInput {
  /** Absolute common git dir, either separator. */
  commonDir: string
  branch: string
  /** The folder the create will make (`worktreePathFor`). */
  worktreePath: string
  /** The repository's effective core.longpaths, read as a boolean. */
  longPaths: boolean
  /** False when the create checks out an existing local branch as it is. */
  writesRef: boolean
}

/** Backslashes only, no trailing separator: the form Windows counts. */
function windowsPath(path: string): string {
  return path.replaceAll('/', '\\').replace(/\\+$/, '')
}

/**
 * The first limit the create would pass, as the message the dialog shows, or
 * null when it passes none. The ref rules apply only when the create writes a
 * new local ref and core.longpaths does not lift Windows' limit.
 */
export function pathLimitProblem(input: PathLimitInput): string | null {
  const commonDir = windowsPath(input.commonDir)
  const branch = input.branch.replaceAll('/', '\\')
  if (input.writesRef && !input.longPaths) {
    const refPath = `${commonDir}\\refs\\heads\\${branch}.lock`
    if (refPath.length > WINDOWS_MAX_FILE_PATH) {
      return `The branch's ref path is ${refPath.length} characters, over Windows' limit of ${WINDOWS_MAX_FILE_PATH}. Shorten the name, or enable core.longpaths in the repository.`
    }
    const cut = branch.lastIndexOf('\\')
    if (cut !== -1) {
      const reflogFolder = `${commonDir}\\logs\\refs\\heads\\${branch.slice(0, cut)}`
      if (reflogFolder.length > WINDOWS_MAX_FOLDER_PATH) {
        return `The branch's reflog folder path is ${reflogFolder.length} characters, over Windows' limit of ${WINDOWS_MAX_FOLDER_PATH} for a folder. Shorten the name, or enable core.longpaths in the repository.`
      }
    }
  }
  // git hands `<worktree>\.git` to the new worktree as $GIT_DIR and refuses one past 220,
  // with or without core.longpaths (M3, M6).
  const worktreePath = windowsPath(input.worktreePath)
  if (worktreePath.length > GIT_MAX_WORKTREE_FOLDER) {
    return `The worktree folder path is ${worktreePath.length} characters, over the ${GIT_MAX_WORKTREE_FOLDER} git accepts. Shorten the name, or use a shorter worktree template such as {repo}-{id}.`
  }
  if (!input.longPaths) {
    const name = worktreePath.slice(worktreePath.lastIndexOf('\\') + 1)
    const gitFolder = `${commonDir}\\worktrees\\${name}\\refs`
    if (gitFolder.length > WINDOWS_MAX_FOLDER_PATH) {
      return `The worktree's git folder path is ${gitFolder.length} characters, over Windows' limit of ${WINDOWS_MAX_FOLDER_PATH} for a folder. Shorten the name, use a shorter worktree template, or enable core.longpaths in the repository.`
    }
  }
  return null
}

/** How the check reaches the platform and git; injectable so a test can stand in for either. */
export interface PathCheckDeps {
  platform: NodeJS.Platform
  git: GitRunner
}

const realDeps: PathCheckDeps = { platform: process.platform, git }

/**
 * The path check a create runs before any git write, and the dialog runs as the
 * name changes. Windows only (BSLG-22). Reads, in the repository: the common git
 * dir, the effective core.longpaths as a boolean, and whether the branch exists
 * locally. A repository the check cannot read gives no message, so git reports
 * its own error (BSLG-41); a non-boolean core.longpaths is one such case, since
 * git then refuses every command (BSLG-39).
 * Never writes core.longpaths (BSLG-26).
 */
export async function checkCreatePaths(
  req: PathCheckRequest,
  deps: PathCheckDeps = realDeps
): Promise<string | null> {
  if (deps.platform !== 'win32') return null
  let commonDir: string
  try {
    const { stdout } = await deps.git(req.repoPath, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir'
    ])
    commonDir = stdout.trim()
  } catch {
    return null
  }
  // Unset exits 1: off.
  const longPaths = await deps
    .git(req.repoPath, ['config', '--type=bool', '--get', 'core.longpaths'])
    .then(
      ({ stdout }) => stdout.trim() === 'true',
      () => false
    )
  const exists = await deps
    .git(req.repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${req.branch}`])
    .then(
      () => true,
      () => false
    )
  // An existing local branch is checked out as it is, which writes no ref, unless
  // Recreate deletes it and cuts it again from the base (BSLG-37, BSLG-38).
  const writesRef = !exists || (Boolean(req.baseBranch) && req.onExisting === 'recreate')
  return pathLimitProblem({
    commonDir,
    branch: req.branch,
    worktreePath: worktreePathFor(req.repoPath, req.branch, req.worktreeTemplate),
    longPaths,
    writesRef
  })
}
