import type { Scheduler } from './file-watcher'

/** A burst of git-state events ends after this long with no event (RCNT-02). */
export const RECOUNT_QUIET_MS = 250
/** A burst that never goes quiet is recounted this long after its first event (RCNT-03). */
export const RECOUNT_MAX_WAIT_MS = 1_000
/**
 * A worktree's recount starts at least this long after its previous one ended
 * (RCNT-04). Counted from the end, so a run that waited for its git process
 * still leaves this gap before the next one starts.
 */
export const RECOUNT_MIN_INTERVAL_MS = 1_000

export interface WorktreeCount {
  dirty: boolean
  changes: number
}

export interface RecountSchedulerDeps {
  /** One `git status` for the worktree; `null` when git could not answer (SCRF-06). */
  recount: (worktreePath: string) => Promise<WorktreeCount | null>
  /** A recount that served at least one git-state event returned a count (RCNT-09). */
  onRecounted: (worktreePath: string, count: WorktreeCount) => void
  /** Monotonic milliseconds; `performance.now()` in the app. */
  now: () => number
  schedule: Scheduler
}

type Waiter = (count: WorktreeCount | null) => void

/** One worktree's waits and runs (RCNT-08). */
interface Lane {
  path: string
  /** A recount of this worktree is running (RCNT-05). */
  running: boolean
  /** The pending git-state burst; both null when none. */
  firstEventAt: number | null
  lastEventAt: number | null
  /** Requests waiting for the next recount to start (RCNT-14). */
  waiters: Waiter[]
  /** When this worktree's last recount ended (its runner settled); null before the first. */
  lastEndAt: number | null
  /** The armed timer's cancel, if any. */
  cancelTimer: (() => void) | null
}

/**
 * Decides when each worktree's `git status` runs (RCNT-02..15). Git-state
 * events wait for a quiet period, or the maximum wait under steady writes;
 * requests (a turn end, the tree build) skip the wait. A worktree runs one
 * recount at a time, and starts the next one at least
 * `RECOUNT_MIN_INTERVAL_MS` after the previous one ended. How many git
 * processes run across worktrees is `git()`'s pacer's business (PERF-22), not
 * this class's.
 */
export class RecountScheduler {
  private readonly deps: RecountSchedulerDeps
  private readonly lanes = new Map<string, Lane>()
  private stopped = false

  constructor(deps: RecountSchedulerDeps) {
    this.deps = deps
  }

  /** A git-state event for this worktree (RCNT-02..08). */
  notify(worktreePath: string): void {
    if (this.stopped) return
    const lane = this.laneOf(worktreePath)
    const now = this.deps.now()
    lane.firstEventAt ??= now
    lane.lastEventAt = now
    // While a recount runs, the burst waits for its end (RCNT-06).
    if (!lane.running) this.arm(lane)
  }

  /**
   * Count this worktree with no quiet period, answered by the first recount
   * that starts after the call (RCNT-13..15); `null` once stopped (RCNT-12).
   */
  request(worktreePath: string): Promise<WorktreeCount | null> {
    if (this.stopped) return Promise.resolve(null)
    const lane = this.laneOf(worktreePath)
    return new Promise((resolve) => {
      lane.waiters.push(resolve)
      if (!lane.running) this.arm(lane)
    })
  }

  /**
   * The watcher dropped this worktree: cancel its waiting git-state recount
   * (RCNT-11). Waiting requests are still answered (RCNT-41).
   */
  forget(worktreePath: string): void {
    const lane = this.lanes.get(worktreePath)
    if (!lane) return
    lane.cancelTimer?.()
    lane.cancelTimer = null
    lane.firstEventAt = null
    lane.lastEventAt = null
    if (lane.running) return
    if (lane.waiters.length > 0) this.arm(lane)
    // An idle lane holds nothing more, so the map keeps only worktrees in use.
    else this.lanes.delete(worktreePath)
  }

  /** Quit: cancel everything waiting, answer requests with null, emit nothing more (RCNT-12). */
  stop(): void {
    this.stopped = true
    for (const lane of this.lanes.values()) {
      lane.cancelTimer?.()
      lane.cancelTimer = null
      lane.firstEventAt = null
      lane.lastEventAt = null
      const waiters = lane.waiters
      lane.waiters = []
      for (const answer of waiters) answer(null)
    }
  }

  private laneOf(path: string): Lane {
    let lane = this.lanes.get(path)
    if (!lane) {
      lane = {
        path,
        running: false,
        firstEventAt: null,
        lastEventAt: null,
        waiters: [],
        lastEndAt: null,
        cancelTimer: null
      }
      this.lanes.set(path, lane)
    }
    return lane
  }

  /** When the lane's pending work may start, or `null` with nothing pending. */
  private dueOf(lane: Lane, now: number): number | null {
    let wanted: number
    if (lane.waiters.length > 0) wanted = now
    else if (lane.firstEventAt !== null && lane.lastEventAt !== null) {
      wanted = Math.min(
        lane.lastEventAt + RECOUNT_QUIET_MS,
        lane.firstEventAt + RECOUNT_MAX_WAIT_MS
      )
    } else return null
    return lane.lastEndAt === null
      ? wanted
      : Math.max(wanted, lane.lastEndAt + RECOUNT_MIN_INTERVAL_MS)
  }

  /**
   * Start the lane's recount if it is due, or set a timer that asks again.
   * Asking again on fire, rather than trusting this figure, lets a later event
   * push the quiet period out with one timer per lane.
   */
  private arm(lane: Lane): void {
    lane.cancelTimer?.()
    lane.cancelTimer = null
    if (this.stopped) return
    const now = this.deps.now()
    const due = this.dueOf(lane, now)
    if (due === null) return
    if (due <= now) {
      void this.start(lane)
      return
    }
    lane.cancelTimer = this.deps.schedule.after(due - now, () => {
      lane.cancelTimer = null
      this.arm(lane)
    })
  }

  private async start(lane: Lane): Promise<void> {
    lane.running = true
    const servedEvent = lane.firstEventAt !== null
    lane.firstEventAt = null
    lane.lastEventAt = null
    const waiters = lane.waiters
    lane.waiters = []
    let count: WorktreeCount | null
    try {
      count = await this.deps.recount(lane.path)
    } catch {
      // A runner that throws counts as no answer (RCNT-10).
      count = null
    }
    // Success, null or throw: the spacing counts from here (RCNT-04).
    lane.lastEndAt = this.deps.now()
    for (const answer of waiters) answer(count)
    if (servedEvent && count !== null && !this.stopped) this.deps.onRecounted(lane.path, count)
    lane.running = false
    // What came during the run gets one trailing recount (RCNT-06, RCNT-14).
    this.arm(lane)
  }
}
