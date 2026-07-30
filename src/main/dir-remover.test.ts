import type { RmOptions } from 'node:fs'
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
