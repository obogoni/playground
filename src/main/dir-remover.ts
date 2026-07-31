import { existsSync, type RmOptions } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import type { RemovalLeftover } from '../shared/worktrees'

/**
 * Junction-safe, deadline-bounded removal of a directory tree (WRFT-03, WRFT-04).
 *
 * Why the app deletes a worktree itself instead of letting `git worktree remove`
 * do it: git for Windows treats a directory junction as an ordinary directory and
 * recurses into it, emptying the junction's *target* while reporting success —
 * which is exactly what the AD-013 skills junctions sit in. Node's `fs.rm` lstats
 * the junction as a link and unlinks it, so the target survives untouched
 * (measured; spec finding D).
 */

/** Pause between two deletion attempts (WRFT-04 AC 1). */
export const DELETE_RETRY_INTERVAL_MS = 250

/** Total wall-clock budget for waiting out a lock before giving up (WRFT-04 AC 3). */
export const DELETE_RETRY_BUDGET_MS = 3000

/**
 * The codes Windows raises while something still holds a handle inside the tree —
 * the only ones worth waiting on. Anything else would fail the same way after the
 * budget, so it is reported at once (WRFT-04 AC 4).
 */
const RETRYABLE_CODES = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES'])

/** Outcome of a removal attempt; failures are returned, never thrown. */
export interface DirRemovalResult {
  ok: boolean
  /** Node error code of the last failing attempt (EBUSY, EPERM, …). */
  code?: string
  /** What the give-up left behind; absent when `ok`. */
  leftover?: RemovalLeftover
}

/**
 * The three filesystem touch points, injected with real-fs defaults so the retry
 * policy is unit-testable without arranging a real lock (no `vi.mock` anywhere —
 * TESTING.md).
 */
export interface DirRemoverDeps {
  rm(path: string, options: RmOptions): Promise<void>
  exists(path: string): boolean
  /** Every entry under the root, recursively — the count the failure reports. */
  readEntries(path: string): Promise<string[]>
}

const realFs: DirRemoverDeps = {
  rm,
  exists: existsSync,
  readEntries: (path) => readdir(path, { recursive: true })
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Deletes `path` and everything under it, retrying only lock-type failures and
 * only until the budget runs out. An absent path is a success (WRFT-02 AC 4), so
 * a caller can always follow up with its bookkeeping step.
 */
export async function removeDirTree(
  path: string,
  deps: DirRemoverDeps = realFs
): Promise<DirRemovalResult> {
  if (!deps.exists(path)) return { ok: true }

  const startedAt = Date.now()
  for (;;) {
    try {
      // `maxRetries: 0` is load-bearing, not a default — do not raise it. Node
      // retries at *every* level of the recursive walk, so its ladder compounds:
      // against a cwd-locked directory `maxRetries: 5, retryDelay: 200` measured
      // 21 599 ms before failing, while a single attempt fails in 2 ms. All the
      // waiting belongs to the loop below, where the budget is wall-clock honest.
      await deps.rm(path, { recursive: true, force: true, maxRetries: 0 })
      return { ok: true }
    } catch (err) {
      const { code, path: blockedPath } = err as NodeJS.ErrnoException
      const retryable = code !== undefined && RETRYABLE_CODES.has(code)
      if (!retryable || Date.now() - startedAt >= DELETE_RETRY_BUDGET_MS) {
        return {
          ok: false,
          code,
          leftover: { blockedPath: blockedPath ?? path, remaining: await countEntries(path, deps) }
        }
      }
      await sleep(DELETE_RETRY_INTERVAL_MS)
    }
  }
}

/**
 * How much is still there, for the leftover report. The root can be unreadable
 * for the very reason the deletion failed, and a report is not worth throwing
 * over, so an unreadable root counts as zero.
 */
async function countEntries(path: string, deps: DirRemoverDeps): Promise<number> {
  try {
    return (await deps.readEntries(path)).length
  } catch {
    return 0
  }
}
