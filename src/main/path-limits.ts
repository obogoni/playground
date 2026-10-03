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
  return null
}
