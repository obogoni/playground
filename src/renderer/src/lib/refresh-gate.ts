import type { FilesChanged } from '../../../shared/files'

/** One refresh at a time, and at most one waiting behind it (FWIG-18..21, 23). */
export interface RefreshGate<T> {
  /** Runs `job` now when idle; otherwise it becomes, or merges into, the one waiting job. */
  request(job: T): void
  /** Forgets the waiting job; the running one finishes. */
  dropWaiting(): void
}

/**
 * The single flight the Files hook sends its batch refreshes through.
 *
 * A request while idle runs at once, synchronously (FWIG-18). While a run is
 * in flight nothing else starts (FWIG-19): every request meanwhile merges into
 * one waiting job, which starts once the run settles (FWIG-20). A run counts
 * as running until its promise settles, fulfilled or rejected; a `run` that
 * throws before returning one releases the gate as a rejection would
 * (FWIG-21). `dropWaiting` forgets the waiting job, for a worktree or direction
 * change, and the running one finishes on its own (FWIG-23).
 *
 * A failed run is logged, never rethrown: the gate must keep releasing.
 */
export function createRefreshGate<T>(
  run: (job: T) => Promise<unknown>,
  merge: (waiting: T, next: T) => T,
  log: (...args: unknown[]) => void = console.error
): RefreshGate<T> {
  let running = false
  let waiting: { job: T } | null = null

  const release = (): void => {
    running = false
    const next = waiting
    waiting = null
    if (next) start(next.job)
  }

  const fail = (err: unknown): void => {
    log('refresh failed', err)
    release()
  }

  const start = (job: T): void => {
    running = true
    let settled: Promise<unknown>
    try {
      settled = run(job)
    } catch (err) {
      settled = Promise.reject(err)
    }
    settled.then(release, fail)
  }

  return {
    request(job) {
      if (!running) {
        start(job)
        return
      }
      waiting = waiting ? { job: merge(waiting.job, job) } : { job }
    },
    dropWaiting() {
      waiting = null
    }
  }
}

/**
 * Two `files:changed` batches as one (FWIG-20): the paths of both in the order
 * they were first seen, without duplicates; a git-state change when either had
 * one; and the later batch's worktree.
 */
export function mergeBatches(a: FilesChanged, b: FilesChanged): FilesChanged {
  return {
    worktreePath: b.worktreePath,
    paths: [...new Set([...a.paths, ...b.paths])],
    gitStateChanged: a.gitStateChanged || b.gitStateChanged
  }
}
