import type { RunStatus, StepEvent, WorkflowRun } from '../shared/workflows'

/**
 * Pure `run-state` reducer (WF2-12). Folds the ordered `StepEvent` stream into a
 * `WorkflowRun` status (`pending → running → done|failed|cancelled`).
 *
 * The reducer is **clock-free and side-effect-free**: `startedAt`/`finishedAt`
 * are stamped by the manager (main process), never here. `initialRun` therefore
 * leaves `startedAt` empty for the manager to fill in.
 *
 * `WorkflowRun.events` is the reducer's own input log — every *accepted* event
 * is appended in order. An invalid transition (an out-of-order event, or any
 * event after a terminal status) is a guarded no-op: the run is returned
 * unchanged, and the event is NOT appended.
 */

const TERMINAL: ReadonlySet<RunStatus> = new Set<RunStatus>(['done', 'failed', 'cancelled'])

/** A fresh run in `pending`, before any event has been folded in. */
export function initialRun(
  id: string,
  workflowId: string,
  input: Record<string, string>
): WorkflowRun {
  return {
    runId: id,
    workflowId,
    status: 'pending',
    input,
    events: [],
    startedAt: ''
  }
}

/** Fold one event into the run. Guarded: invalid transitions return `run` as-is. */
export function reduce(run: WorkflowRun, event: StepEvent): WorkflowRun {
  // A terminal run is frozen — no further event can change it.
  if (TERMINAL.has(run.status)) return run

  switch (event.kind) {
    case 'run-started':
      if (run.status !== 'pending') return run
      return { ...run, status: 'running', events: [...run.events, event] }
    case 'step-started':
    case 'step-logged':
      if (run.status !== 'running') return run
      return { ...run, events: [...run.events, event] }
    case 'done':
      if (run.status !== 'running') return run
      return { ...run, status: 'done', events: [...run.events, event] }
    case 'failed':
      if (run.status !== 'running') return run
      return { ...run, status: 'failed', error: event.error, events: [...run.events, event] }
    case 'cancelled':
      if (run.status !== 'running') return run
      return { ...run, status: 'cancelled', events: [...run.events, event] }
    default:
      return run
  }
}
