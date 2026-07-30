import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  type RmOptions,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DELETE_RETRY_BUDGET_MS,
  DELETE_RETRY_INTERVAL_MS,
  type DirRemoverDeps,
  removeDirTree
} from './dir-remover'

const ROOT = 'C:\\tmp\\wtm-repo-feature'

/** A Node fs error the way `fs.rm` raises it: a `code` and the offending `path`. */
function fsError(code: string, path?: string): NodeJS.ErrnoException {
  const err = new Error(`${code}: operation not permitted`) as NodeJS.ErrnoException
  err.code = code
  if (path !== undefined) err.path = path
  return err
}

/**
 * Hand-rolled fs seam (no `vi.mock`, per TESTING.md): `fail` decides what the
 * n-th `rm` attempt throws, `entries` is what a recursive read of the root
 * reports afterwards.
 */
function fakeFs(opts: {
  fail?: (attempt: number) => NodeJS.ErrnoException | null
  entries?: string[]
  exists?: boolean
}): {
  deps: DirRemoverDeps
  attemptsAt: number[]
  calls: Array<{ path: string; options: RmOptions }>
} {
  const attemptsAt: number[] = []
  const calls: Array<{ path: string; options: RmOptions }> = []
  const deps: DirRemoverDeps = {
    exists: () => opts.exists ?? true,
    readEntries: async () => opts.entries ?? [],
    rm: async (path, options) => {
      attemptsAt.push(Date.now())
      calls.push({ path, options })
      const err = opts.fail?.(calls.length) ?? null
      if (err !== null) throw err
    }
  }
  return { deps, attemptsAt, calls }
}

/** Drives the deleter's own sleeps on the fake clock and returns its result. */
async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return promise
}

describe('removeDirTree', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports success without deleting anything when the path does not exist', async () => {
    // WRFT-02 AC 4: an already-absent directory is a no-op success, so the
    // caller still goes on to clean git's bookkeeping.
    const { deps, calls } = fakeFs({ exists: false })

    const result = await runWithTimers(removeDirTree(ROOT, deps))

    expect(result).toEqual({ ok: true })
    expect(calls).toHaveLength(0)
  })

  it('retries every lock-type error and succeeds once the lock clears', async () => {
    // WRFT-04 AC 1 (the retryable set) + AC 2 (a transient lock resolves itself).
    const lockCodes = ['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES']
    const { deps, calls } = fakeFs({
      fail: (n) => (n <= lockCodes.length ? fsError(lockCodes[n - 1], ROOT) : null)
    })

    const result = await runWithTimers(removeDirTree(ROOT, deps))

    expect(result).toEqual({ ok: true })
    expect(calls).toHaveLength(lockCodes.length + 1)
  })

  it('spaces retry attempts 250 ms apart', async () => {
    // WRFT-04 AC 1 — literal, not the constant (lesson L-004).
    const { deps, attemptsAt } = fakeFs({ fail: (n) => (n <= 2 ? fsError('EBUSY', ROOT) : null) })
    const startedAt = Date.now()

    await runWithTimers(removeDirTree(ROOT, deps))

    expect(attemptsAt.map((at) => at - startedAt)).toEqual([0, 250, 500])
  })

  it('gives up once the 3000 ms budget is exhausted', async () => {
    // WRFT-04 AC 3 — literal budget; the last attempt sits on the deadline and
    // nothing is attempted beyond it.
    const { deps, attemptsAt } = fakeFs({ fail: () => fsError('EBUSY', ROOT) })
    const startedAt = Date.now()

    const result = await runWithTimers(removeDirTree(ROOT, deps))

    expect(result.ok).toBe(false)
    expect(result.code).toBe('EBUSY')
    expect(Date.now() - startedAt).toBe(3000)
    expect(attemptsAt.at(-1)! - startedAt).toBe(3000)
  })

  it('reports a non-retryable error immediately without consuming the budget', async () => {
    // WRFT-04 AC 4: retrying e.g. EINVAL only burns the budget.
    const { deps, attemptsAt } = fakeFs({ fail: () => fsError('EINVAL', ROOT) })
    const startedAt = Date.now()

    const result = await runWithTimers(removeDirTree(ROOT, deps))

    expect(result.ok).toBe(false)
    expect(result.code).toBe('EINVAL')
    expect(attemptsAt).toHaveLength(1)
    expect(Date.now() - startedAt).toBe(0)
  })

  it('names the blocking path and how many entries are still on disk', async () => {
    // WRFT-04 AC 3: the leftover payload is what makes the failure actionable.
    const blocked = `${ROOT}\\sub\\deep.txt`
    const { deps } = fakeFs({
      fail: () => fsError('EBUSY', blocked),
      entries: ['sub', 'sub\\deep.txt', 'untracked.txt']
    })

    const result = await runWithTimers(removeDirTree(ROOT, deps))

    expect(result.leftover).toEqual({ blockedPath: blocked, remaining: 3 })
  })

  it('falls back to the removal root when the error carries no path', async () => {
    const { deps } = fakeFs({ fail: () => fsError('EPERM'), entries: ['a.txt'] })

    const result = await runWithTimers(removeDirTree(ROOT, deps))

    expect(result.leftover).toEqual({ blockedPath: ROOT, remaining: 1 })
  })

  it("deletes with maxRetries: 0 so Node's own retry ladder is never engaged", async () => {
    // WRFT-04 AC 1: measured 21 599 ms for maxRetries: 5 against a locked
    // directory, because Node retries at every level of the recursive walk.
    const { deps, calls } = fakeFs({ fail: (n) => (n === 1 ? fsError('EBUSY', ROOT) : null) })

    await runWithTimers(removeDirTree(ROOT, deps))

    expect(calls).toEqual([
      { path: ROOT, options: { recursive: true, force: true, maxRetries: 0 } },
      { path: ROOT, options: { recursive: true, force: true, maxRetries: 0 } }
    ])
  })
})

describe('retry constants', () => {
  it('are a 250 ms interval and a 3000 ms budget', () => {
    // Pinned to literals so a mutation of either constant is caught (L-004).
    expect(DELETE_RETRY_INTERVAL_MS).toBe(250)
    expect(DELETE_RETRY_BUDGET_MS).toBe(3000)
  })
})

/**
 * Real filesystem, real child processes, real timers — the hazards that decide
 * whether deleting before deregistering is safe at all. These run against the
 * default (real-fs) deps, so they also pin that those defaults are wired.
 * Explicit per-test timeouts, per lesson L-005.
 */
describe('removeDirTree against the real filesystem', () => {
  let root: string
  let holders: ChildProcess[]

  beforeEach(() => {
    // realpathSync.native so the paths compare byte-equal to what Node reports
    // back in an error (tmpdir is a symlink/8.3 path on some machines).
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-rm-')))
    holders = []
  })

  afterEach(async () => {
    // Kill first, and even when the test failed: a live child whose cwd sits
    // inside the tree makes the cleanup below fail with EPERM on Windows.
    for (const holder of holders) await stopHolder(holder)
    rmSync(root, { recursive: true, force: true })
  })

  const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  /**
   * An external process holding `cwd` — the real agent-terminal case, and the
   * only honest fixture: Node's own handles do not block deletion because libuv
   * opens with FILE_SHARE_DELETE.
   */
  async function holdCwd(cwd: string): Promise<ChildProcess> {
    const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
      cwd,
      stdio: 'ignore'
    })
    holders.push(holder)
    await delay(400) // measured settle time before the lock is actually held
    return holder
  }

  function stopHolder(holder: ChildProcess): Promise<void> {
    if (holder.exitCode !== null || holder.signalCode !== null) return Promise.resolve()
    return new Promise((resolve) => {
      holder.once('exit', () => resolve())
      holder.kill()
    })
  }

  function makeTree(...files: string[]): string {
    const worktree = join(root, 'wt')
    mkdirSync(worktree, { recursive: true })
    for (const file of files) {
      mkdirSync(join(worktree, file, '..'), { recursive: true })
      writeFileSync(join(worktree, file), file, 'utf8')
    }
    return worktree
  }

  it('unlinks a junction instead of deleting through it', async () => {
    // WRFT-03 AC 1 + AC 2 — the AD-013 skills junction. This is the assertion
    // that fails against a git-based deleter: `git worktree remove --force`
    // recurses into the junction and empties the shared target, then reports
    // success (measured, spec finding D).
    const worktree = makeTree('a.txt')
    const shared = join(root, 'shared')
    mkdirSync(join(shared, 'nested'), { recursive: true })
    writeFileSync(join(shared, 'precious.txt'), 'keep me', 'utf8')
    writeFileSync(join(shared, 'nested', 'deep.txt'), 'keep me too', 'utf8')
    execFileSync('cmd', ['/c', 'mklink', '/J', join(worktree, '.skills'), shared])
    // The junction is live: a recursive walk really would reach the target.
    expect(readFileSync(join(worktree, '.skills', 'precious.txt'), 'utf8')).toBe('keep me')

    const result = await removeDirTree(worktree)

    expect(result).toEqual({ ok: true })
    expect(existsSync(worktree)).toBe(false)
    expect(readFileSync(join(shared, 'precious.txt'), 'utf8')).toBe('keep me')
    expect(readFileSync(join(shared, 'nested', 'deep.txt'), 'utf8')).toBe('keep me too')
  }, 30000)

  it('removes a worktree whose junction target is already gone', async () => {
    // WRFT-03 AC 3: a dangling junction is unlinked like any other entry.
    const worktree = makeTree('a.txt')
    const shared = join(root, 'shared')
    mkdirSync(shared)
    writeFileSync(join(shared, 'doomed.txt'), 'bye', 'utf8')
    execFileSync('cmd', ['/c', 'mklink', '/J', join(worktree, '.skills'), shared])
    rmSync(shared, { recursive: true, force: true })

    const result = await removeDirTree(worktree)

    expect(result).toEqual({ ok: true })
    expect(existsSync(worktree)).toBe(false)
  }, 30000)

  it('deletes read-only files', async () => {
    // Spec Edge Cases: read-only content must not turn into a leftover.
    const worktree = makeTree('sub/readonly.txt')
    const readonly = join(worktree, 'sub', 'readonly.txt')
    chmodSync(readonly, 0o444)
    execFileSync('cmd', ['/c', 'attrib', '+R', readonly])

    const result = await removeDirTree(worktree)

    expect(result).toEqual({ ok: true })
    expect(existsSync(worktree)).toBe(false)
  }, 30000)

  it('deletes a nested repository with its read-only object store', async () => {
    // Spec Edge Cases: git writes loose objects 0444, the classic rm-blocker.
    const worktree = makeTree('a.txt')
    const nested = join(worktree, 'vendor')
    mkdirSync(nested)
    const git = (...args: string[]): void => void execFileSync('git', args, { cwd: nested })
    git('init', '-b', 'main')
    git('config', 'user.email', 'test@test.local')
    git('config', 'user.name', 'Test')
    writeFileSync(join(nested, 'v.txt'), 'vendored', 'utf8')
    git('add', '.')
    git('commit', '-m', 'init')

    const result = await removeDirTree(worktree)

    expect(result).toEqual({ ok: true })
    expect(existsSync(worktree)).toBe(false)
  }, 30000)

  it('reports the blocked path when a live process holds a directory in the tree', async () => {
    // WRFT-04 AC 3 + AC 5, and WRFT-02 AC 1: nothing is deregistered because the
    // deletion never completes — the tree is still there to retry against.
    const worktree = makeTree('sub/deep.txt', 'untracked.txt')
    const held = join(worktree, 'sub')
    await holdCwd(held)

    const startedAt = Date.now()
    const result = await removeDirTree(worktree)
    const elapsed = Date.now() - startedAt

    expect(result.ok).toBe(false)
    expect(result.code).toBe('EBUSY')
    expect(result.leftover?.blockedPath).toBe(held)
    expect(result.leftover?.remaining).toBeGreaterThanOrEqual(1)
    expect(existsSync(held)).toBe(true)
    expect(elapsed).toBeLessThan(5000)
  }, 30000)

  it('counts the leftovers recursively, not just the direct children of the root', async () => {
    // WRFT-04 AC 3: `remaining` is the count of entries still present *under* the
    // worktree root. The exact-count tests above drive the injected `readEntries`
    // fake, so only a real-fs fixture can pin the real `readdir` wiring.
    //
    // The residue is deterministic by construction: the tree is directories only,
    // so a failed attempt deletes nothing, and the holder's cwd is nested three
    // levels down. A recursive read therefore reports 3 (`keep`, `keep\a`,
    // `keep\a\b`) where a non-recursive read of the root would report 1.
    const worktree = join(root, 'wt')
    const held = join(worktree, 'keep', 'a', 'b')
    mkdirSync(held, { recursive: true })
    await holdCwd(held)

    const result = await removeDirTree(worktree)

    expect(result.ok).toBe(false)
    expect(result.leftover).toEqual({ blockedPath: held, remaining: 3 })
    // The residue really is nested — which is what makes 3 distinguishable from 1.
    expect(existsSync(held)).toBe(true)
  }, 30000)

  it('succeeds on a retry once the holding process is gone', async () => {
    // WRFT-02 AC 2: the still-present tree is its own retry handle.
    const worktree = makeTree('sub/deep.txt')
    const holder = await holdCwd(join(worktree, 'sub'))

    const blocked = await removeDirTree(worktree)
    expect(blocked.ok).toBe(false)

    await stopHolder(holder)
    const retried = await removeDirTree(worktree)

    expect(retried).toEqual({ ok: true })
    expect(existsSync(worktree)).toBe(false)
  }, 30000)
})
