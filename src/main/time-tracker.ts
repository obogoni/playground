import type { OpenPeriod, PeriodSnapshotFields, TimePeriod, TimeSnapshot } from '../shared/time'
import type { TimeLogStore } from './time-log-store'

/** A period shorter than this is noise (spawn failure, instant exit) and is discarded (TIME-11). */
export const MIN_PERIOD_MS = 1000

/** The store surface the tracker needs; `TimeLogStore` in production, a fake in tests. */
export type TimeStorePort = Pick<
  TimeLogStore,
  'readPeriods' | 'append' | 'rewrite' | 'readOpen' | 'writeOpen'
>

export interface TimeTrackerDeps {
  store: TimeStorePort
  now: () => number
  newId: () => string
  /** Attribution at open time (TIME-03); never throws, nulls when unresolvable (TIME-12). */
  resolveSnapshot: (cwd: string) => PeriodSnapshotFields
  /** Pushes `time:changed`; bound to the window by index.ts. */
  emit: () => void
}

/** A session whose PTY is alive: from `started` to `ended`. */
interface Run {
  agent: string
  cwd: string
  open: OpenPeriod | null
  paused: boolean
}

/**
 * Owns runs, open periods, the pause and suspend flags and every mutation of
 * the time log (AD-021). A period opens when a session's PTY starts and closes
 * when it ends, when the session is paused, on suspend and on quit; closing
 * appends one line unless the period is under 1 s (TIME-01..11). Open periods
 * live in the sidecar, heartbeated every 60 s, so a crash loses at most that
 * much (TIME-04, TIME-05).
 *
 * Deliberately blind to session activity (TIME-10) and to screen lock (TIME-08):
 * no method exists for either. Pause is in memory, per run (TIME-19).
 */
export class TimeTracker {
  readonly #runs = new Map<string, Run>()
  #periods: TimePeriod[]
  #suspended = false

  constructor(private readonly deps: TimeTrackerDeps) {
    this.#periods = deps.store.readPeriods().periods
  }

  /** Closes the periods a crashed run left open at their last-seen instant (TIME-05). */
  recover(): void {
    const leftovers = this.deps.store.readOpen()
    if (leftovers.length === 0) return
    for (const open of leftovers) this.#close(open, open.lastSeen)
    this.deps.store.writeOpen([])
    this.deps.emit()
  }

  /** `SessionLifecycle`: the session's PTY started (spawn, duplicate, respawn) (TIME-01, TIME-19). */
  started(meta: { id: string; agent: string; cwd: string }): void {
    const previous = this.#runs.get(meta.id)
    if (previous?.open) this.#close(previous.open, this.#nowIso())
    this.#runs.set(meta.id, {
      agent: meta.agent,
      cwd: meta.cwd,
      paused: false,
      open: this.#open(meta.id, meta.agent, meta.cwd)
    })
    this.#changed()
  }

  /** `SessionLifecycle`: the session stopped or its PTY exited (TIME-02). A second call is a no-op. */
  ended(id: string): void {
    const run = this.#runs.get(id)
    if (!run) return
    if (run.open) this.#close(run.open, this.#nowIso())
    this.#runs.delete(id)
    this.#changed()
  }

  /** Closes the session's open period and marks it paused (TIME-16). */
  pause(sessionId: string): void {
    const run = this.#runs.get(sessionId)
    if (!run || run.paused) return
    if (run.open) this.#close(run.open, this.#nowIso())
    run.open = null
    run.paused = true
    this.#changed()
  }

  /** Opens a new period for a paused session (unless suspended) and clears the mark (TIME-18). */
  resume(sessionId: string): void {
    const run = this.#runs.get(sessionId)
    if (!run || !run.paused) return
    run.paused = false
    if (!this.#suspended) run.open = this.#open(sessionId, run.agent, run.cwd)
    this.#changed()
  }

  /** OS `suspend`: every open period ends now (TIME-06). */
  suspend(): void {
    this.#suspended = true
    const at = this.#nowIso()
    for (const run of this.#runs.values()) {
      if (run.open) this.#close(run.open, at)
      run.open = null
    }
    this.#changed()
  }

  /** OS `resume`: a new period for every running session that is not paused (TIME-07, TIME-21). */
  resumeFromSuspend(): void {
    this.#suspended = false
    for (const [id, run] of this.#runs) {
      if (!run.paused && !run.open) run.open = this.#open(id, run.agent, run.cwd)
    }
    this.#changed()
  }

  /**
   * Advances every open period's last-seen instant and rewrites the sidecar
   * (TIME-04). Emits nothing: totals are measured against the renderer's clock,
   * so a refetch every minute would change nothing on screen.
   */
  heartbeat(): void {
    const at = this.#nowIso()
    for (const run of this.#runs.values()) {
      if (run.open) run.open = { ...run.open, lastSeen: at }
    }
    this.#writeOpen()
  }

  /** Quit: every open period ends now, before the process exits (TIME-09). */
  closeAll(): void {
    const at = this.#nowIso()
    for (const run of this.#runs.values()) {
      if (run.open) this.#close(run.open, at)
    }
    this.#runs.clear()
    this.#changed()
  }

  snapshot(): TimeSnapshot {
    const runs = [...this.#runs.entries()]
    return {
      periods: [...this.#periods],
      open: runs.flatMap(([, run]) => (run.open ? [run.open] : [])),
      paused: runs.filter(([, run]) => run.paused).map(([id]) => id)
    }
  }

  #open(sessionId: string, agent: string, cwd: string): OpenPeriod {
    const at = this.#nowIso()
    return {
      id: this.deps.newId(),
      sessionId,
      agent,
      cwd,
      ...this.deps.resolveSnapshot(cwd),
      start: at,
      lastSeen: at
    }
  }

  /** Appends the closed period, or discards it when shorter than 1 s or reversed (TIME-11). */
  #close(open: OpenPeriod, end: string): void {
    const { lastSeen: _lastSeen, ...fields } = open
    void _lastSeen
    if (Date.parse(end) - Date.parse(open.start) < MIN_PERIOD_MS) return
    const period: TimePeriod = { ...fields, end }
    this.#periods.push(period)
    this.deps.store.append(period)
  }

  #changed(): void {
    this.#writeOpen()
    this.deps.emit()
  }

  #writeOpen(): void {
    this.deps.store.writeOpen(this.snapshot().open)
  }

  #nowIso(): string {
    return new Date(this.deps.now()).toISOString()
  }
}
