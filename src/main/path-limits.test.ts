import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { git, type GitRunner } from './git'
import {
  GIT_MAX_WORKTREE_FOLDER,
  WINDOWS_MAX_FILE_PATH,
  WINDOWS_MAX_FOLDER_PATH,
  checkCreatePaths,
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

const folderMessage = (n: number): string =>
  `The worktree folder path is ${n} characters, over the 215 git accepts. Shorten the name, or use a shorter worktree template such as {repo}-{id}.`
const gitFolderMessage = (n: number): string =>
  `The worktree's git folder path is ${n} characters, over Windows' limit of 247 for a folder. Shorten the name, use a shorter worktree template, or enable core.longpaths in the repository.`

/** A worktree folder `C:\r-www…` of exactly `length` characters. */
function worktreeOf(length: number): string {
  return 'C:\\r-' + 'w'.repeat(length - 'C:\\r-'.length)
}

describe('pathLimitProblem: worktree folder (BSLG-27)', () => {
  it('passes a worktree folder of exactly 215', () => {
    expect(worktreeOf(215)).toHaveLength(215)
    expect(pathLimitProblem(input({ worktreePath: worktreeOf(215), longPaths: true }))).toBeNull()
  })

  it('refuses a worktree folder of exactly 216 with its length', () => {
    expect(pathLimitProblem(input({ worktreePath: worktreeOf(216), longPaths: true }))).toBe(
      folderMessage(216)
    )
  })

  it('refuses it whatever core.longpaths holds and whether or not a ref is written', () => {
    const worktreePath = worktreeOf(216)
    expect(pathLimitProblem(input({ worktreePath, longPaths: true, writesRef: false }))).toBe(
      folderMessage(216)
    )
    expect(pathLimitProblem(input({ worktreePath, longPaths: false, writesRef: true }))).toBe(
      folderMessage(216)
    )
  })

  it('measures a worktree folder written with / and a trailing separator as Windows does', () => {
    const worktreePath = worktreeOf(216).replaceAll('\\', '/') + '/'
    expect(pathLimitProblem(input({ worktreePath, longPaths: true }))).toBe(folderMessage(216))
  })
})

describe("pathLimitProblem: the worktree's git folder (BSLG-28)", () => {
  // A 40-character repository folder under C:\src, as in M4: the worktree folder stays short
  // while `.git\worktrees\<name>\refs` grows by the repository name.
  const repoDir = 'C:\\src\\' + 'r'.repeat(40)
  const commonDir = `${repoDir}\\.git`
  /** `C:\src\<name>` whose git folder `{commonDir}\worktrees\<name>\refs` is exactly `length`. */
  function worktreeWithGitFolder(length: number): string {
    const overhead = commonDir.length + '\\worktrees\\'.length + '\\refs'.length
    return 'C:\\src\\' + 'n'.repeat(length - overhead)
  }

  it('passes a git folder of exactly 247', () => {
    const worktreePath = worktreeWithGitFolder(247)
    const name = worktreePath.slice(worktreePath.lastIndexOf('\\') + 1)
    expect(`${commonDir}\\worktrees\\${name}\\refs`).toHaveLength(247)
    expect(worktreePath.length).toBeLessThanOrEqual(215)
    expect(pathLimitProblem(input({ commonDir, worktreePath }))).toBeNull()
  })

  it('refuses a git folder of exactly 248 with its length', () => {
    const worktreePath = worktreeWithGitFolder(248)
    expect(worktreePath.length).toBeLessThanOrEqual(215)
    expect(pathLimitProblem(input({ commonDir, worktreePath }))).toBe(gitFolderMessage(248))
  })

  it('refuses it when the create writes no ref', () => {
    const worktreePath = worktreeWithGitFolder(248)
    expect(pathLimitProblem(input({ commonDir, worktreePath, writesRef: false }))).toBe(
      gitFolderMessage(248)
    )
  })

  it('passes it when core.longpaths is on', () => {
    const worktreePath = worktreeWithGitFolder(248)
    expect(pathLimitProblem(input({ commonDir, worktreePath, longPaths: true }))).toBeNull()
  })
})

describe('pathLimitProblem: order when several limits are passed (BSLG-29)', () => {
  it('returns the ref message when the ref path and the worktree folder are both past', () => {
    const problem = pathLimitProblem(
      input({ branch: branchWithRefPath(260), worktreePath: worktreeOf(216) })
    )
    expect(problem).toBe(refMessage(260))
  })

  it('returns the reflog message when the reflog folder and the worktree folder are both past', () => {
    const problem = pathLimitProblem(
      input({ branch: branchWithReflogFolder(248), worktreePath: worktreeOf(216) })
    )
    expect(problem).toBe(reflogMessage(248))
  })

  it("returns the folder message when the worktree folder and the worktree's git folder are both past", () => {
    // A longer common dir pushes the git folder past 247 as well.
    const commonDir = 'C:\\src\\' + 'r'.repeat(40) + '\\.git'
    const worktreePath = worktreeOf(216)
    const name = worktreePath.slice(worktreePath.lastIndexOf('\\') + 1)
    expect(`${commonDir}\\worktrees\\${name}\\refs`.length).toBeGreaterThanOrEqual(248)
    expect(pathLimitProblem(input({ commonDir, worktreePath }))).toBe(folderMessage(216))
  })
})

const run = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/** Whether git, with the repository's own config, resolves the local branch. */
function gitSeesBranch(repo: string, branch: string): boolean {
  try {
    run(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`)
    return true
  } catch {
    return false
  }
}

describe('checkCreatePaths (real repositories)', () => {
  // A short worktree folder (`<root>\wt`), so only the ref rules can speak for these names.
  const SHORT_TEMPLATE = 'wt'
  const win32 = { platform: 'win32' as const, git }
  let root: string
  let repo: string
  /** The common git dir as Windows counts it, from the OS's canonical path, not the code under test. */
  let commonDir: string
  const savedGlobal = process.env.GIT_CONFIG_GLOBAL

  /** `user/dev/<tag>/bbb…`, whose ref path in `repo` is exactly `length` characters. */
  function branchWithRefPath(tag: string, length: number): string {
    const head = `user/dev/${tag}/`
    const overhead = `${commonDir}\\refs\\heads\\`.length + '.lock'.length
    return head + 'b'.repeat(length - overhead - head.length)
  }
  const refPathOf = (branch: string): number =>
    `${commonDir}\\refs\\heads\\${branch.replaceAll('/', '\\')}.lock`.length

  beforeAll(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'bss-pc-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    run(repo, 'init', '-b', 'main')
    run(repo, 'config', 'core.autocrlf', 'false')
    run(repo, 'config', 'core.longpaths', 'false')
    run(repo, 'config', 'user.email', 'test@test.local')
    run(repo, 'config', 'user.name', 'Test')
    run(repo, 'commit', '--allow-empty', '-m', 'init')
    commonDir = `${repo.replaceAll('/', '\\')}\\.git`
  })

  afterEach(() => {
    if (savedGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = savedGlobal
    run(repo, 'config', 'core.longpaths', 'false')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('runs no git and reports nothing off Windows (BSLG-22)', async () => {
    const calls: string[][] = []
    const recording: GitRunner = async (_cwd, args) => {
      calls.push(args)
      return { stdout: '' }
    }
    const branch = branchWithRefPath('linux', 270)
    const problem = await checkCreatePaths(
      { repoPath: repo, worktreeTemplate: SHORT_TEMPLATE, branch },
      {
        platform: 'linux',
        git: recording
      }
    )
    expect(problem).toBeNull()
    expect(calls).toEqual([])
  })

  it('runs no git and reports nothing on macOS either (BSLG-22)', async () => {
    const calls: string[][] = []
    const recording: GitRunner = async (_cwd, args) => {
      calls.push(args)
      return { stdout: '' }
    }
    const branch = branchWithRefPath('darwin', 270)
    const problem = await checkCreatePaths(
      { repoPath: repo, worktreeTemplate: SHORT_TEMPLATE, branch },
      {
        platform: 'darwin',
        git: recording
      }
    )
    expect(problem).toBeNull()
    expect(calls).toEqual([])
  })

  it('refuses a new branch whose ref path is 270 with that length (BSLG-17)', async () => {
    const branch = branchWithRefPath('new', 270)
    expect(refPathOf(branch)).toBe(270)
    expect(
      await checkCreatePaths(
        { repoPath: repo, worktreeTemplate: SHORT_TEMPLATE, branch, baseBranch: 'main' },
        win32
      )
    ).toBe(refMessage(270))
  })

  it.each(['true', 'yes'])(
    'reports nothing when the repository holds core.longpaths=%s (BSLG-21)',
    async (value) => {
      run(repo, 'config', 'core.longpaths', value)
      const branch = branchWithRefPath('lifted', 270)
      expect(
        await checkCreatePaths(
          { repoPath: repo, worktreeTemplate: SHORT_TEMPLATE, branch, baseBranch: 'main' },
          win32
        )
      ).toBeNull()
    }
  )

  it('reports nothing when core.longpaths is not a boolean, since git then refuses to run (BSLG-39)', async () => {
    const configFile = join(repo, '.git', 'config')
    run(repo, 'config', 'core.longpaths', 'maybe')
    try {
      expect(() => run(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir')).toThrow(
        /fatal: bad boolean config value 'maybe' for 'core.longpaths'/
      )
      const branch = branchWithRefPath('maybe', 270)
      expect(
        await checkCreatePaths(
          { repoPath: repo, worktreeTemplate: SHORT_TEMPLATE, branch, baseBranch: 'main' },
          win32
        )
      ).toBeNull()
    } finally {
      // git refuses to run inside the repository now, so the value is reset from outside it.
      run(root, 'config', '--file', configFile, 'core.longpaths', 'false')
    }
  })

  it("refuses when the global config holds true and the repository's own holds false (BSLG-40)", async () => {
    const globalConfig = join(root, 'global.gitconfig')
    writeFileSync(globalConfig, '[core]\n\tlongpaths = true\n', 'utf8')
    process.env.GIT_CONFIG_GLOBAL = globalConfig
    expect(run(root, 'config', '--global', '--type=bool', '--get', 'core.longpaths').trim()).toBe(
      'true'
    )
    const branch = branchWithRefPath('global', 270)
    expect(
      await checkCreatePaths(
        { repoPath: repo, worktreeTemplate: SHORT_TEMPLATE, branch, baseBranch: 'main' },
        win32
      )
    ).toBe(refMessage(270))
  })

  describe('a branch that already exists and git can read (BSLG-37)', () => {
    // M2's shape: a two-letter last segment, a reflog folder of 248 (past 247) and a ref path
    // of 251 (within 259). Made with core.longpaths on, for the test only, since git cannot
    // create that reflog folder without it.
    let branch: string
    let reflogFolder: number

    beforeAll(() => {
      const dirsLength = 248 - `${commonDir}\\logs\\refs\\heads\\`.length
      const dirs = 'user/' + 'd'.repeat(dirsLength - 'user/'.length)
      branch = `${dirs}/ab`
      reflogFolder = `${commonDir}\\logs\\refs\\heads\\${dirs.replaceAll('/', '\\')}`.length
      run(repo, '-c', 'core.longpaths=true', 'branch', branch, 'main')
    })

    it('is a branch of that shape that git resolves with core.longpaths off', () => {
      expect(reflogFolder).toBe(248)
      expect(refPathOf(branch)).toBe(251)
      expect(gitSeesBranch(repo, branch)).toBe(true)
    })

    it('reports nothing for a checkout with no base', async () => {
      expect(
        await checkCreatePaths({ repoPath: repo, worktreeTemplate: SHORT_TEMPLATE, branch }, win32)
      ).toBeNull()
    })

    it('reports nothing for Reuse', async () => {
      const req = {
        repoPath: repo,
        worktreeTemplate: SHORT_TEMPLATE,
        branch,
        baseBranch: 'main',
        onExisting: 'reuse' as const
      }
      expect(await checkCreatePaths(req, win32)).toBeNull()
    })

    it('reports nothing for a base with no choice yet (the dialog asks before the conflict prompt)', async () => {
      expect(
        await checkCreatePaths(
          { repoPath: repo, worktreeTemplate: SHORT_TEMPLATE, branch, baseBranch: 'main' },
          win32
        )
      ).toBe(null)
    })

    it('refuses Recreate with the reflog message (AC 18)', async () => {
      const req = {
        repoPath: repo,
        worktreeTemplate: SHORT_TEMPLATE,
        branch,
        baseBranch: 'main',
        onExisting: 'recreate' as const
      }
      expect(await checkCreatePaths(req, win32)).toBe(reflogMessage(248))
    })
  })

  it('treats a branch git cannot read with core.longpaths off as new (AC 17)', async () => {
    // T1: a ref path of 270 does not resolve under core.longpaths=false, so the checkout
    // would write a new ref.
    const branch = branchWithRefPath('unread', 270)
    run(repo, '-c', 'core.longpaths=true', 'branch', branch, 'main')
    expect(gitSeesBranch(repo, branch)).toBe(false)
    expect(
      await checkCreatePaths({ repoPath: repo, worktreeTemplate: SHORT_TEMPLATE, branch }, win32)
    ).toBe(refMessage(270))
  })

  it('reports nothing for a folder that is not a repository (BSLG-41)', async () => {
    const plain = join(root, 'plain')
    mkdirSync(plain)
    const branch = branchWithRefPath('plain', 270)
    expect(
      await checkCreatePaths(
        { repoPath: plain, worktreeTemplate: SHORT_TEMPLATE, branch, baseBranch: 'main' },
        win32
      )
    ).toBeNull()
  })
})
