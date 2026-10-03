import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installDiagnostics, NOOP_DIAGNOSTICS, type Diagnostics } from './diagnostics'
import { git, gitFailureLine, isTimeout } from './git'

/** The rejection `git()` produces, so the helpers are exercised against execFile's real error shape. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('expected the git call to fail')
}

describe('gitFailureLine', () => {
  it("returns git's first non-empty stderr line, trimmed", () => {
    const err = Object.assign(new Error('Command failed: git pull'), {
      stderr: '\r\n  fatal: Not possible to fast-forward, aborting.\r\nhint: second line\r\n'
    })
    expect(gitFailureLine(err)).toBe('fatal: Not possible to fast-forward, aborting.')
  })

  it("falls back to the Error message's first line when stderr is empty", () => {
    const err = Object.assign(new Error('spawn git ENOENT\n    at stack'), { stderr: '  \n' })
    expect(gitFailureLine(err)).toBe('spawn git ENOENT')
  })

  it('stringifies a thrown value that is not an Error', () => {
    expect(gitFailureLine('plain failure')).toBe('plain failure')
  })

  const failure = (stderr: string): Error =>
    Object.assign(new Error('Command failed: git worktree add'), { stderr })

  it("prefers git's fatal: line over a progress note before it (BSLG-12)", () => {
    const err = failure(
      "Preparing worktree (new branch 'x')\nfatal: cannot lock ref 'refs/heads/x': Filename too long\n"
    )
    expect(gitFailureLine(err)).toBe("fatal: cannot lock ref 'refs/heads/x': Filename too long")
  })

  it('prefers an error: line over a hint before it (BSLG-12)', () => {
    expect(gitFailureLine(failure('hint: a\nerror: b\n'))).toBe('error: b')
  })

  it('returns the first of error: and fatal: when both appear (BSLG-43)', () => {
    expect(gitFailureLine(failure('error: a\nfatal: b\n'))).toBe('error: a')
  })

  it('never picks a line that only contains fatal: further in (BSLG-44)', () => {
    expect(gitFailureLine(failure('hint: fatal: x\n'))).toBe('hint: fatal: x')
    expect(gitFailureLine(failure('hint: fatal: x\nfatal: y\n'))).toBe('fatal: y')
  })

  it('trims the prefixed line it returns (BSLG-12)', () => {
    expect(gitFailureLine(failure('note\n   fatal: z  \n'))).toBe('fatal: z')
  })

  describe('with real git failures (L-024)', () => {
    let repo: string

    beforeAll(async () => {
      repo = realpathSync.native(mkdtempSync(join(tmpdir(), 'git-line-')))
      await git(repo, ['init', '-q'])
    })

    afterAll(() => {
      rmSync(repo, { recursive: true, force: true })
    })

    it("returns git's fatal: line for a failed rev-parse (BSLG-12)", async () => {
      const err = await rejectionOf(git(repo, ['rev-parse', '--verify', 'no-such-ref']))
      expect(gitFailureLine(err)).toBe('fatal: Needed a single revision')
    })

    it("returns git's error: line for a failed checkout (BSLG-12)", async () => {
      const err = await rejectionOf(git(repo, ['checkout', 'no-such-path']))
      expect(gitFailureLine(err)).toBe(
        "error: pathspec 'no-such-path' did not match any file(s) known to git"
      )
    })
  })
})

describe('isTimeout', () => {
  it('is true when git() kills the process because timeoutMs elapsed', async () => {
    // A `!` alias that sleeps outlives the 200 ms limit, so only the timeout ends it.
    const err = await rejectionOf(
      git(tmpdir(), ['-c', 'alias.wait=!sleep 5', 'wait'], { timeoutMs: 200 })
    )
    expect(isTimeout(err)).toBe(true)
  })

  it('is false for a plain non-zero git exit', async () => {
    const err = await rejectionOf(git(tmpdir(), ['rev-parse', '--verify', 'no-such-ref']))
    expect(isTimeout(err)).toBe(false)
  })

  it('is false for a value that is not an error object', () => {
    expect(isTimeout('timed out')).toBe(false)
    expect(isTimeout(null)).toBe(false)
  })
})

describe('git', () => {
  const inherited = process.env.GIT_TERMINAL_PROMPT

  afterEach(() => {
    if (inherited === undefined) delete process.env.GIT_TERMINAL_PROMPT
    else process.env.GIT_TERMINAL_PROMPT = inherited
  })

  it('runs git with GIT_TERMINAL_PROMPT=0 even when the app inherited another value', async () => {
    process.env.GIT_TERMINAL_PROMPT = '1'
    // A `!` alias runs in git's own sh, so it echoes the environment git itself was given.
    const { stdout } = await git(tmpdir(), [
      '-c',
      'alias.envp=!echo "prompt=$GIT_TERMINAL_PROMPT"',
      'envp'
    ])
    expect(stdout.trim()).toBe('prompt=0')
  })

  it('gives git a stdin already at end of input (CRTO-06)', async () => {
    // With no timeoutMs, only an ended stdin lets `hash-object --stdin` return: it hashes
    // the empty input to git's empty-blob id.
    const { stdout } = await git(tmpdir(), ['hash-object', '--stdin'])
    expect(stdout.trim()).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  it('hands every argument to git literally, with no shell to parse it', async () => {
    const arg = 'a&b|c>d %PATH% $(x) `y` "q" ; e'
    // --sq-quote echoes its arguments back, single-quoted, exactly as git received them.
    const { stdout } = await git(tmpdir(), ['rev-parse', '--sq-quote', arg])
    expect(stdout.trim()).toBe(`'${arg}'`)
  })
})

interface GitRecord {
  requests: { cwd: string; args: string[] }[]
  starts: { cwd: string; args: string[] }[]
  readonly ends: number
  readonly maxRunning: number
}

/** A diagnostics fake that records what the runner reports, and how many processes run at once. */
function recordingGit(): GitRecord {
  const requests: { cwd: string; args: string[] }[] = []
  const starts: { cwd: string; args: string[] }[] = []
  let ends = 0
  let running = 0
  let maxRunning = 0
  const fake: Diagnostics = {
    ...NOOP_DIAGNOSTICS,
    enabled: true,
    gitRequested: (cwd, args) => {
      requests.push({ cwd, args: [...args] })
      return () => {
        starts.push({ cwd, args: [...args] })
        running++
        maxRunning = Math.max(maxRunning, running)
        return () => {
          ends++
          running--
        }
      }
    }
  }
  installDiagnostics(fake)
  return {
    requests,
    starts,
    get ends(): number {
      return ends
    },
    get maxRunning(): number {
      return maxRunning
    }
  }
}

describe('git reports to diagnostics (PDIAG-09, PDIAG-15)', () => {
  afterEach(() => installDiagnostics(null))

  it('reports one start with its cwd and args, and its end before the awaited call returns', async () => {
    const rec = recordingGit()
    const { stdout } = await git(tmpdir(), ['--version'])
    expect(rec.ends).toBe(1)
    expect(stdout).toMatch(/^git version/)
    expect(rec.requests).toEqual([{ cwd: tmpdir(), args: ['--version'] }])
    expect(rec.starts).toEqual([{ cwd: tmpdir(), args: ['--version'] }])
  })

  it("reports one start and one end for a failing call, which still rejects with git's error", async () => {
    const rec = recordingGit()
    const err = await rejectionOf(git(tmpdir(), ['rev-parse', '--verify', 'no-such-ref']))
    expect(gitFailureLine(err)).toMatch(/^fatal: /)
    expect(rec.starts).toEqual([{ cwd: tmpdir(), args: ['rev-parse', '--verify', 'no-such-ref'] }])
    expect(rec.ends).toBe(1)
  })

  it('reports one start and one end for a timed-out call, which is still a timeout', async () => {
    const rec = recordingGit()
    // stdin is ended (CRTO-06), so the blocker is a `!` alias that sleeps past the limit.
    const err = await rejectionOf(
      git(tmpdir(), ['-c', 'alias.wait=!sleep 5', 'wait'], { timeoutMs: 200 })
    )
    expect(isTimeout(err)).toBe(true)
    expect(rec.starts).toHaveLength(1)
    expect(rec.ends).toBe(1)
  })

  it('reports six requests at once but starts at most 4 at a time, the paced start, and ends all six', async () => {
    const rec = recordingGit()
    const calls = Array.from({ length: 6 }, () => git(tmpdir(), ['--version']))
    expect(rec.requests).toHaveLength(6)
    expect(rec.starts).toHaveLength(0)
    await Promise.all(calls)
    expect(rec.starts).toHaveLength(6)
    expect(rec.maxRunning).toBeGreaterThanOrEqual(1)
    expect(rec.maxRunning).toBeLessThanOrEqual(4)
    expect(rec.ends).toBe(6)
  })
})
