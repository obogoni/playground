import { describe, expect, it } from 'vitest'
import {
  GIT_MAX_WORKTREE_FOLDER,
  WINDOWS_MAX_FILE_PATH,
  WINDOWS_MAX_FOLDER_PATH,
  pathLimitProblem,
  type PathLimitInput
} from './path-limits'

const refMessage = (n: number): string =>
  `The branch's ref path is ${n} characters, over Windows' limit of 259. Shorten the name, or enable core.longpaths in the repository.`
const reflogMessage = (n: number): string =>
  `The branch's reflog folder path is ${n} characters, over Windows' limit of 247 for a folder. Shorten the name, or enable core.longpaths in the repository.`

const COMMON_DIR = 'C:\\r\\.git'
/** `C:\r\.git` + `\refs\heads\` + `.lock`: the ref path's length without the branch. */
const REF_OVERHEAD = COMMON_DIR.length + '\\refs\\heads\\'.length + '.lock'.length
/** `C:\r\.git` + `\logs\refs\heads\`: the reflog folder's length without the branch's folders. */
const REFLOG_OVERHEAD = COMMON_DIR.length + '\\logs\\refs\\heads\\'.length

/** A branch `user/dev/x/bbb…` whose ref path under `C:\r\.git` is exactly `refPath` characters. */
function branchWithRefPath(refPath: number): string {
  const head = 'user/dev/x/'
  return head + 'b'.repeat(refPath - REF_OVERHEAD - head.length)
}

/** A branch `user/ddd…/ab` whose reflog folder under `C:\r\.git` is exactly `reflogFolder` characters. */
function branchWithReflogFolder(reflogFolder: number): string {
  return 'user/' + 'd'.repeat(reflogFolder - REFLOG_OVERHEAD - 'user/'.length) + '/ab'
}

function input(overrides: Partial<PathLimitInput>): PathLimitInput {
  return {
    commonDir: COMMON_DIR,
    branch: 'feature/1-x',
    worktreePath: 'C:\\r-1',
    longPaths: false,
    writesRef: true,
    ...overrides
  }
}

describe('path limit constants', () => {
  it('pins the measured limits with literals', () => {
    expect(WINDOWS_MAX_FILE_PATH).toBe(259)
    expect(WINDOWS_MAX_FOLDER_PATH).toBe(247)
    expect(GIT_MAX_WORKTREE_FOLDER).toBe(215)
  })
})

describe('pathLimitProblem: ref path (BSLG-17, BSLG-19, BSLG-35)', () => {
  it('passes a ref path of exactly 259', () => {
    const branch = branchWithRefPath(259)
    expect(`${COMMON_DIR}\\refs\\heads\\${branch.replaceAll('/', '\\')}.lock`).toHaveLength(259)
    expect(pathLimitProblem(input({ branch }))).toBeNull()
  })

  it('refuses a ref path of exactly 260 with its length', () => {
    expect(pathLimitProblem(input({ branch: branchWithRefPath(260) }))).toBe(refMessage(260))
  })

  it('refuses a ref path of 287 with its length', () => {
    expect(pathLimitProblem(input({ branch: branchWithRefPath(287) }))).toBe(refMessage(287))
  })
})

describe('pathLimitProblem: reflog folder (BSLG-18, BSLG-19, BSLG-36)', () => {
  it('passes a reflog folder of exactly 247 (ref path 250)', () => {
    const branch = branchWithReflogFolder(247)
    expect(
      `${COMMON_DIR}\\logs\\refs\\heads\\${branch.slice(0, branch.lastIndexOf('/'))}`
    ).toHaveLength(247)
    expect(branch.length + REF_OVERHEAD).toBe(250)
    expect(pathLimitProblem(input({ branch }))).toBeNull()
  })

  it('refuses a reflog folder of exactly 248 (ref path 251) with its length', () => {
    const branch = branchWithReflogFolder(248)
    expect(branch.length + REF_OVERHEAD).toBe(251)
    expect(pathLimitProblem(input({ branch }))).toBe(reflogMessage(248))
  })
})

describe('pathLimitProblem: a branch with no / (BSLG-34)', () => {
  it('refuses a 260-character branch with the ref message', () => {
    const branch = 'b'.repeat(260)
    expect(pathLimitProblem(input({ branch }))).toBe(refMessage(260 + REF_OVERHEAD))
  })

  it('does not apply the reflog rule to the whole name when the ref path passes', () => {
    // 233 characters: ref path 259 passes; the name read as a folder would be 259, past 247.
    const branch = 'b'.repeat(259 - REF_OVERHEAD)
    expect(pathLimitProblem(input({ branch }))).toBeNull()
  })
})

describe('pathLimitProblem: each condition alone (BSLG-21, L-087)', () => {
  it('passes both rules when core.longpaths is on', () => {
    expect(pathLimitProblem(input({ branch: branchWithRefPath(287), longPaths: true }))).toBeNull()
    expect(
      pathLimitProblem(input({ branch: branchWithReflogFolder(248), longPaths: true }))
    ).toBeNull()
  })

  it('passes both rules when the create writes no ref', () => {
    expect(pathLimitProblem(input({ branch: branchWithRefPath(287), writesRef: false }))).toBeNull()
    expect(
      pathLimitProblem(input({ branch: branchWithReflogFolder(248), writesRef: false }))
    ).toBeNull()
  })

  it('returns the ref message when both the ref path and the reflog folder are past their limits', () => {
    const branch = 'user/' + 'd'.repeat(240) + '/ab'
    expect(REFLOG_OVERHEAD + 'user/'.length + 240).toBeGreaterThanOrEqual(248)
    expect(pathLimitProblem(input({ branch }))).toBe(refMessage(branch.length + REF_OVERHEAD))
  })
})

describe('pathLimitProblem: separators', () => {
  it.each(['C:/r/.git', 'C:\\r\\.git\\', 'C:/r/.git/'])(
    'measures %s as C:\\r\\.git',
    (commonDir) => {
      expect(pathLimitProblem(input({ commonDir, branch: branchWithRefPath(259) }))).toBeNull()
      expect(pathLimitProblem(input({ commonDir, branch: branchWithRefPath(260) }))).toBe(
        refMessage(260)
      )
      expect(pathLimitProblem(input({ commonDir, branch: branchWithReflogFolder(247) }))).toBeNull()
      expect(pathLimitProblem(input({ commonDir, branch: branchWithReflogFolder(248) }))).toBe(
        reflogMessage(248)
      )
    }
  )
})
