import type { BlockerQuestion, RunStatus, StepEvent } from '../../../shared/workflows'

/**
 * WF5 — the renderer's live view of one workflow run, folded from the
 * `workflow:*` IPC stream. Runs are ephemeral (this session only): there is no
 * read channel for persisted runs, so `foldRunEvent` reconstructs a run purely
 * from the events it observes (AD-011). This is the tested seam behind the
 * hand-verified `useWorkflowRuns` hook — the fold logic lives here, mirroring how
 * `tree-selection` holds the pure logic behind the tree UI.
 */

/** One row on a run's timeline: an executed step (label) or a log line. */
export type TimelineEntry =
  | { kind: 'step'; label: string; group?: string }
  | { kind: 'log'; message: string; group?: string }

/** A run as the renderer displays it — status badge, timeline, and blocked question. */
export interface RunView {
  runId: string
  /** Seeded by the hook when it starts a run; the `workflow:*` events omit it. */
  workflowId?: string
  status: RunStatus
  timeline: TimelineEntry[]
  /** Set while the run is paused awaiting a human answer; cleared on resume/terminal. */
  blocked?: BlockerQuestion
}

/**
 * The four `workflow:*` events, normalised into one discriminated union the fold
 * consumes. `status`/`step`/`log`/`blocked` mirror the `workflow:status`/
 * `workflow:step`/`workflow:log`/`workflow:blocked` IPC channels.
 */
export type WorkflowFoldEvent =
  | { type: 'status'; runId: string; status: RunStatus }
  | { type: 'step'; runId: string; step: StepEvent }
  | { type: 'log'; runId: string; message: string; group?: string }
  | { type: 'blocked'; runId: string; question: BlockerQuestion }

/** A defensive default for an event whose run the view has never seen (create-or-update). */
function emptyRun(runId: string): RunView {
  return { runId, status: 'pending', timeline: [] }
}

/** Upsert the run `runId` in `runs` (newest-first on create), applying `update`. */
function upsert(runs: RunView[], runId: string, update: (r: RunView) => RunView): RunView[] {
  const idx = runs.findIndex((r) => r.runId === runId)
  if (idx < 0) return [update(emptyRun(runId)), ...runs]
  const next = runs.slice()
  next[idx] = update(runs[idx])
  return next
}

/**
 * Fold one `workflow:*` event into the session's `RunView[]`. Pure — no I/O, no
 * React. An event for an unknown `runId` creates the run defensively (never
 * throws). A `status` that is not `blocked` clears any standing blocked question
 * (so resume → `running` and every terminal status drop the respond panel);
 * `status: 'blocked'` preserves it, because the accompanying `workflow:blocked`
 * event (carrying the question) arrives right after the status change.
 */
export function foldRunEvent(runs: RunView[], ev: WorkflowFoldEvent): RunView[] {
  switch (ev.type) {
    case 'status':
      return upsert(runs, ev.runId, (r) => ({
        ...r,
        status: ev.status,
        blocked: ev.status === 'blocked' ? r.blocked : undefined
      }))
    case 'step':
      return upsert(runs, ev.runId, (r) => ({
        ...r,
        timeline: [...r.timeline, { kind: 'step', label: ev.step.label ?? '', group: ev.step.group }]
      }))
    case 'log':
      return upsert(runs, ev.runId, (r) => ({
        ...r,
        timeline: [...r.timeline, { kind: 'log', message: ev.message, group: ev.group }]
      }))
    case 'blocked':
      return upsert(runs, ev.runId, (r) => ({ ...r, blocked: ev.question }))
  }
}
