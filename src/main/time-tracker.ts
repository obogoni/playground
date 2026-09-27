import type {
  OpenPeriod,
  PeriodSnapshotFields,
  PeriodTaskChoice,
  TimeEditResult,
  TimePeriod,
  TimeSnapshot
} from '../shared/time'
import type { SessionTask } from '../shared/tasks'
import { reassignFields, withSessionTask } from './period-task'
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
  /** Pinned title for a task id from the TaskBoard cache; null when unknown (HTSK-06). */
  pinnedTitle: (id: number) => string | null
  /** Pushes `time:changed`; bound to the window by index.ts. */
  emit: () => void
}

/** A session whose PTY is alive: from `started` to `ended`. */
interface Run {
  agent: string
  cwd: string
  /** The session's hand-set task; null = From branch (HTSK-10, HTSK-11). */
  task: SessionTask | null
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
  started(meta: { id: string; agent: string; cwd: string; task?: SessionTask }): void {
    const previous = this.#runs.get(meta.id)
    if (previous?.open) this.#close(previous.open, this.#nowIso())
    const run: Run = {
      agent: meta.agent,
      cwd: meta.cwd,
      task: meta.task ?? null,
      paused: false,
      open: null
    }
    run.open = this.#open(meta.id, run)
    this.#runs.set(meta.id, run)
    this.#changed()
  }

  /**
   * `SessionLifecycle`: the session's task link changed (HTSK-12..16). A running,
   * counting session closes its open period now and opens one on the new task at
   * the same instant; a paused or suspended one only keeps the link for its next
   * open. The same link, or a session with no run, changes nothing.
   */
  taskChanged(sessionId: string, task: SessionTask | null): void {
    const run = this.#runs.get(sessionId)
    if (!run || (run.task?.id ?? null) === (task?.id ?? null)) return
    run.task = task
    if (run.open) {
      const at = this.#nowIso()
      this.#close(run.open, at)
      run.open = this.#open(sessionId, run, at)
    }
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
    if (!this.#suspended) run.open = this.#open(sessionId, run)
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
      if (!run.paused && !run.open) run.open = this.#open(id, run)
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

  /** Removes a closed period and rewrites the log atomically (TIME-44, TIME-48). */
  deletePeriod(id: string): TimeEditResult {
    const rejected = this.#editTarget(id)
    if (rejected) return rejected
    this.#periods = this.#periods.filter((p) => p.id !== id)
    return this.#rewritten()
  }

  /** Replaces a closed period's bounds after validating them against now (TIME-45, TIME-46). */
  adjustPeriod(id: string, start: string, end: string): TimeEditResult {
    const rejected = this.#editTarget(id)
    if (rejected) return rejected
    const startMs = Date.parse(start)
    const endMs = Date.parse(end)
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return { ok: false, error: 'Start and end must be valid dates.' }
    }
    if (startMs >= endMs) return { ok: false, error: 'Start must be before end.' }
    if (endMs > this.deps.now()) return { ok: false, error: 'End cannot be in the future.' }
    if (endMs - startMs < MIN_PERIOD_MS) {
      return { ok: false, error: 'A period must last at least 1 second.' }
    }
    this.#periods = this.#periods.map((p) =>
      p.id === id
        ? { ...p, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() }
        : p
    )
    return this.#rewritten()
  }

  /**
   * Moves a closed period to another task, to No task or back to its branch's
   * task (HTSK-25..27). Only the task fields change; the flag is replaced, never
   * merged, so a choice without it removes the key (HTSK-37, HTSK-39).
   */
  reassignPeriod(id: string, choice: PeriodTaskChoice): TimeEditResult {
    const rejected = this.#editTarget(id)
    if (rejected) return rejected
    this.#periods = this.#periods.map((p) => {
      if (p.id !== id) return p
      const { taskByHand: _taskByHand, ...rest } = p
      void _taskByHand
      return { ...rest, ...reassignFields(p, choice, this.deps.pinnedTitle) }
    })
    return this.#rewritten()
  }

  /**
   * Splits a closed period at an instant strictly inside it, both parts at least
   * 1 s long (HTSK-28..31). The first part keeps the id; the second gets a new id
   * and follows it in the log; every other field is copied.
   */
  splitPeriod(id: string, at: string): TimeEditResult {
    const rejected = this.#editTarget(id)
    if (rejected) return rejected
    const atMs = Date.parse(at)
    if (Number.isNaN(atMs)) return { ok: false, error: 'Split time must be a valid date.' }
    const index = this.#periods.findIndex((p) => p.id === id)
    const period = this.#periods[index]
    const startMs = Date.parse(period.start)
    const endMs = Date.parse(period.end)
    if (atMs <= startMs || atMs >= endMs) {
      return { ok: false, error: 'Split time must be inside the period.' }
    }
    if (atMs - startMs < MIN_PERIOD_MS || endMs - atMs < MIN_PERIOD_MS) {
      return { ok: false, error: 'Each part must last at least 1 second.' }
    }
    const cut = new Date(atMs).toISOString()
    this.#periods = [
      ...this.#periods.slice(0, index),
      { ...period, end: cut },
      { ...period, id: this.deps.newId(), start: cut },
      ...this.#periods.slice(index + 1)
    ]
    return this.#rewritten()
  }

  snapshot(): TimeSnapshot {
    const runs = [...this.#runs.entries()]
    return {
      periods: [...this.#periods],
      open: runs.flatMap(([, run]) => (run.open ? [run.open] : [])),
      paused: runs.filter(([, run]) => run.paused).map(([id]) => id)
    }
  }

  #open(
    sessionId: string,
    run: Pick<Run, 'agent' | 'cwd' | 'task'>,
    at: string = this.#nowIso()
  ): OpenPeriod {
    return {
      id: this.deps.newId(),
      sessionId,
      agent: run.agent,
      cwd: run.cwd,
      ...withSessionTask(this.deps.resolveSnapshot(run.cwd), run.task, this.deps.pinnedTitle),
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

  /** Rejects an id that is open or no longer in the log (TIME-47, TIME-49); null when editable. */
  #editTarget(id: string): TimeEditResult | null {
    if (this.snapshot().open.some((p) => p.id === id)) {
      return { ok: false, error: 'This period is still open.' }
    }
    if (!this.#periods.some((p) => p.id === id)) {
      return { ok: false, error: 'This period no longer exists.' }
    }
    return null
  }

  #rewritten(): TimeEditResult {
    this.deps.store.rewrite([...this.#periods])
    this.deps.emit()
    return { ok: true }
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
