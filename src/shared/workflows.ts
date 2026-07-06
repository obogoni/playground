/**
 * WF2 — the workflows-engine type vocabulary shared by the main process, the
 * renderer, and the gate smoke script. `Ctx`/`CtxDeps`/`CtxRuntime` are
 * deliberately NOT here: they are main-only (live in `workflow-ctx.ts`) — the
 * renderer never receives `ctx`, only `WorkflowDef`/`WorkflowRun`/`StepEvent`
 * cross IPC.
 */

/** One declared trigger input a workflow's `meta` asks the user to supply. */
export interface WorkflowInput {
  key: string
  label: string
  required?: boolean
}

/** The author-exported description of a workflow (name + declared inputs). */
export interface WorkflowMeta {
  name: string
  description?: string
  inputs: WorkflowInput[]
}

/**
 * A discovered workflow as it appears in the list: either valid (`meta` loaded)
 * or broken (`error` explaining why it failed to load). A broken folder is still
 * listed — it never blocks the others (WF2-03/04).
 */
export type WorkflowDef =
  | { id: string; meta: WorkflowMeta }
  | { id: string; error: string }

/** The run lifecycle status folded from the event stream (WF2-12). */
export type RunStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'

/**
 * One entry in a run's ordered event stream — lifecycle transitions plus the
 * auto-logged `ctx.*` steps and log lines (WF2-10/12/15).
 */
export interface StepEvent {
  seq: number
  kind: 'run-started' | 'step-started' | 'step-logged' | 'done' | 'failed' | 'cancelled'
  /** step-started: the primitive name / `ctx.step` label. */
  label?: string
  /** step-logged: the log / notify line. */
  message?: string
  /** parent `ctx.step` group id, for nesting. */
  group?: string
  /** failed: the error message. */
  error?: string
  /** failed: captured stdout (from `ctx.sh`). */
  stdout?: string
  /** failed: captured exit code. */
  code?: number
  /** step-logged: the agent's captured `session_id`, for WF4 `--resume` (WF3-16). */
  sessionId?: string
}

/**
 * The persisted record of a single run: the event log plus its folded status.
 * `startedAt`/`finishedAt` are stamped by the manager (main), not the reducer,
 * so the reducer stays clock-free.
 */
export interface WorkflowRun {
  runId: string
  workflowId: string
  status: RunStatus
  input: Record<string, string>
  events: StepEvent[]
  error?: string
  /** ISO timestamp, stamped by the manager. */
  startedAt: string
  finishedAt?: string
}
