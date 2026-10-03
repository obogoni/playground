import type { Scheduler } from './file-watcher'

/** A burst of git-state events ends after this long with no event (RCNT-02). */
export const RECOUNT_QUIET_MS = 250
/** A burst that never goes quiet is recounted this long after its first event (RCNT-03). */
export const RECOUNT_MAX_WAIT_MS = 1_000
/** Two recounts of one worktree start at least this far apart (RCNT-04). */
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

/** One worktree's waits and runs (RCNT-08). */
interface Lane {
  path: string
  /** The pending git-state burst; both null when none. */
  firstEventAt: number | null
  lastEventAt: number | null
  /** When this worktree's last recount started; null before the first. */
  lastStartAt: number | null
  /** The armed timer's cancel, if any. */
  cancelTimer: (() => void) | null
}

/**
 * Decides when each worktree's `git status` runs (RCNT-02..12). Git-state
 * events wait for a quiet period, or the maximum wait under steady writes,
 * and two recounts of one worktree start at least `RECOUNT_MIN_INTERVAL_MS`
 * apart. How many git processes run across worktrees is `git()`'s pacer's
 * business (PERF-22), not this class's.
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
    this.arm(lane)
  }

  /** Quit: cancel everything waiting and emit nothing more (RCNT-12). */
  stop(): void {
    this.stopped = true
    for (const lane of this.lanes.values()) {
      lane.cancelTimer?.()
      lane.cancelTimer = null
      lane.firstEventAt = null
      lane.lastEventAt = null
    }
  }

  private laneOf(path: string): Lane {
    let lane = this.lanes.get(path)
    if (!lane) {
      lane = { path, firstEventAt: null, lastEventAt: null, lastStartAt: null, cancelTimer: null }
      this.lanes.set(path, lane)
    }
    return lane
  }

  /**
   * Start the lane's recount if it is due, or set a timer that asks again.
   * Asking again on fire, rather than trusting this figure, lets a later event
   * push the quiet period out with one timer per lane.
   */
  private arm(lane: Lane): void {
    lane.cancelTimer?.()
    lane.cancelTimer = null
    if (this.stopped || lane.firstEventAt === null || lane.lastEventAt === null) return
    const now = this.deps.now()
    const wanted = Math.min(
      lane.lastEventAt + RECOUNT_QUIET_MS,
      lane.firstEventAt + RECOUNT_MAX_WAIT_MS
    )
    const due =
      lane.lastStartAt === null
        ? wanted
        : Math.max(wanted, lane.lastStartAt + RECOUNT_MIN_INTERVAL_MS)
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
    lane.lastStartAt = this.deps.now()
    lane.firstEventAt = null
    lane.lastEventAt = null
    const count = await this.deps.recount(lane.path)
    if (count !== null && !this.stopped) this.deps.onRecounted(lane.path, count)
  }
}
