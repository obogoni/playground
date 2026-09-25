/** Attribution resolved once when a period opens (TIME-03), so history survives
 * worktree removal, session removal, unpinning and branch renames. */
export interface PeriodSnapshotFields {
  workspacePath: string | null
  repoName: string | null
  branch: string | null
  /** From `taskIdFromBranch`; null when the branch carries no id (or HEAD is detached). */
  taskId: number | null
  /** Pinned task title from the TaskBoard cache at open time; null when unknown. */
  taskTitle: string | null
}

/** A closed span of time a session's terminal was alive and not paused. One JSON
 * line in `time-log.jsonl`. */
export interface TimePeriod extends PeriodSnapshotFields {
  /** randomUUID */
  id: string
  sessionId: string
  agent: string
  cwd: string
  /** UTC ISO 8601 */
  start: string
  /** UTC ISO 8601 */
  end: string
}

/** A period still running. Lives in `time-open.json` and in the snapshot; never
 * in the log. */
export interface OpenPeriod extends Omit<TimePeriod, 'end'> {
  /** UTC ISO, advanced by the heartbeat; the close instant after a crash (TIME-05). */
  lastSeen: string
}

/** Everything the renderer needs to compute totals and the weekly report. */
export interface TimeSnapshot {
  /** Closed periods from the log, after edits. */
  periods: TimePeriod[]
  open: OpenPeriod[]
  /** Session ids whose counting is manually paused (TIME-16). */
  paused: string[]
}

/** Outcome of a delete or adjust; rejections are returned, never thrown (TIME-46, TIME-49). */
export type TimeEditResult = { ok: true } | { ok: false; error: string }
