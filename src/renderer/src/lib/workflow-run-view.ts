import type {
  BlockerQuestion,
  PermissionPreset,
  RunStatus,
  StepDetail,
  StepEvent,
  StepKind
} from '../../../shared/workflows'

/**
 * WHF — the renderer's live view of one workflow run, folded from the enriched
 * `workflow:*` IPC stream. Runs are ephemeral (this session only): there is no
 * read channel for persisted runs, so `foldRunEvent` reconstructs a run purely
 * from the events it observes (AD-011). This is the tested seam behind the
 * hand-verified `useWorkflowRuns` hook — the fold logic lives here, mirroring how
 * `tree-selection` holds the pure logic behind the tree UI.
 *
 * The hifi rebuild (AD-012) folds the stream into a node-based `RunView`: each
 * `step-started` upserts a `StepNode`, each `step-finished` correlates by
 * `stepId` and stamps its outcome (ok/duration/agentResult/detail). Per-step
 * status and group rollup are derived here (`stepStatus`/`groupRollup`) — the
 * backend carries no group-status field (spec Out-of-Scope). `timeline` is kept
 * populated transitionally so the WF5 `RunDetail` keeps rendering until it is
 * rebuilt to consume `steps`/`logs`.
 */

/** The status the renderer paints on a step node (glyph + tint). */
export type StepStatus = 'pending' | 'running' | 'blocked' | 'done' | 'failed' | 'cancelled'

/** One executed step on a run's node timeline (upserted on start, stamped on finish). */
export interface StepNode {
  stepId: number
  kind: StepKind
  label: string
  /** Parent `ctx.step` group LABEL, for nesting (nesting is keyed by label, additive). */
  group?: string
  finished: boolean
  /** step-finished: false when the step's `fn` threw → failed glyph + group rollup. */
  ok?: boolean
  durationMs?: number
  /** step-started[agent]: the author prompt + permission preset (WHF-16). */
  agent?: { prompt: string; permission: PermissionPreset }
  /** step-finished[agent]: the validated `emit_result` envelope (WHF-16). */
  agentResult?: { status: 'done' | 'blocked'; data?: unknown; sessionId: string }
  /** step-finished[ado|worktree.changedFiles]: the detail-box payload (WHF-15). */
  detail?: StepDetail
}

/** One row on a run's legacy flat timeline: an executed step (label) or a log line. */
export type TimelineEntry =
  | { kind: 'step'; label: string; group?: string }
  | { kind: 'log'; message: string; group?: string }

/** A run as the renderer displays it — header, INPUTS strip, node timeline, blocked panel, footer. */
export interface RunView {
  runId: string
  /** Seeded by the `workflow:run-started` event (retires WF5's `pendingWf` hack). */
  workflowId?: string
  /** The trigger input, for the header INPUTS strip (WHF-18). */
  input: Record<string, string>
  /** ISO timestamp the run started, for the header relative time (WHF-17). */
  startedAt?: string
  status: RunStatus
  /** The node timeline (WHF-11..16). */
  steps: StepNode[]
  /** Free-standing log/notify lines (WHF-11). */
  logs: { message: string; group?: string }[]
  /** Set while the run is paused awaiting a human answer; cleared on resume/terminal. */
  blocked?: BlockerQuestion
  /** The blocked agent's session id, for the respond panel's `--resume` note (WHF-19). */
  blockedSessionId?: string
  /** failed: the failure evidence for the footer (WHF-20). */
  error?: string
  stdout?: string
  code?: number
  /**
   * Legacy flat timeline, kept populated transitionally so the WF5 `RunDetail`
   * keeps rendering until it is rebuilt to consume `steps`/`logs`.
   */
  timeline: TimelineEntry[]
}

/**
 * The enriched `workflow:*` events, normalised into one discriminated union the
 * fold consumes. `step-finished` is also accepted inside the `step` variant
 * (branched on `StepEvent.kind`) so the current hook — which forwards every
 * `workflow:step` payload as `{ type: 'step' }` — folds start and finish events
 * correctly before the hook is upgraded to dispatch explicit variants.
 */
export type WorkflowFoldEvent =
  | {
      type: 'run-started'
      runId: string
      workflowId: string
      input: Record<string, string>
      startedAt: string
    }
  | { type: 'status'; runId: string; status: RunStatus }
  | { type: 'step'; runId: string; step: StepEvent }
  | { type: 'step-finished'; runId: string; step: StepEvent }
  | { type: 'log'; runId: string; message: string; group?: string }
  | { type: 'blocked'; runId: string; question: BlockerQuestion; sessionId?: string }

/**
 * Per-step status. A finished step is terminal (`ok ? 'done' : 'failed'`);
 * an unfinished step derives from the run status: `running` → running,
 * `blocked` → blocked for the in-flight step (the last unfinished node) else
 * pending, `failed`/`cancelled` propagate, otherwise pending. Pure — a step's
 * paint is a function of its own outcome and the run it belongs to.
 */
export function stepStatus(node: StepNode, run: RunView): StepStatus {
  if (node.finished) return node.ok === false ? 'failed' : 'done'
  switch (run.status) {
    case 'running':
      return 'running'
    case 'blocked':
      return node.stepId === inFlightStepId(run) ? 'blocked' : 'pending'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

/** The last still-unfinished step is the in-flight one (the blocked agent step). */
function inFlightStepId(run: RunView): number | undefined {
  for (let i = run.steps.length - 1; i >= 0; i--) {
    if (!run.steps[i].finished) return run.steps[i].stepId
  }
  return undefined
}

/**
 * A group's rollup pill = the worst child status, worst-first precedence
 * `failed > blocked > running > done > pending` (spec Edge "mixed child
 * statuses"). `cancelled` (unlisted by the spec) is slotted just below `failed`
 * as the other terminal-negative outcome.
 */
export function groupRollup(children: StepStatus[]): StepStatus {
  if (children.includes('failed')) return 'failed'
  if (children.includes('cancelled')) return 'cancelled'
  if (children.includes('blocked')) return 'blocked'
  if (children.includes('running')) return 'running'
  if (children.includes('done')) return 'done'
  return 'pending'
}

/** A defensive default for an event whose run the view has never seen (create-or-update). */
function emptyRun(runId: string): RunView {
  return { runId, status: 'pending', input: {}, steps: [], logs: [], timeline: [] }
}

/** Upsert the run `runId` in `runs` (newest-first on create), applying `update`. */
function upsert(runs: RunView[], runId: string, update: (r: RunView) => RunView): RunView[] {
  const idx = runs.findIndex((r) => r.runId === runId)
  if (idx < 0) return [update(emptyRun(runId)), ...runs]
  const next = runs.slice()
  next[idx] = update(runs[idx])
  return next
}

/** Upsert a `StepNode` on `step-started` (finished:false), carrying kind/label/group/agent. */
function startStep(r: RunView, step: StepEvent): RunView {
  const node: StepNode = {
    stepId: step.stepId ?? r.steps.length,
    kind: step.stepKind ?? 'sh',
    label: step.label ?? '',
    group: step.group,
    finished: false,
    agent: step.agent
  }
  const idx = r.steps.findIndex((s) => s.stepId === node.stepId)
  const steps =
    idx < 0 ? [...r.steps, node] : r.steps.map((s, i) => (i === idx ? { ...s, ...node } : s))
  return {
    ...r,
    steps,
    timeline: [...r.timeline, { kind: 'step', label: node.label, group: node.group }]
  }
}

/** Stamp a `StepNode` on `step-finished`, correlating by `stepId` (leaves others untouched). */
function finishStep(r: RunView, step: StepEvent): RunView {
  if (step.stepId === undefined) return r
  return {
    ...r,
    steps: r.steps.map((s) =>
      s.stepId === step.stepId
        ? {
            ...s,
            finished: true,
            ok: step.ok ?? true,
            durationMs: step.durationMs,
            agentResult: step.agentResult ?? s.agentResult,
            detail: step.detail ?? s.detail
          }
        : s
    )
  }
}

/**
 * Fold one enriched `workflow:*` event into the session's `RunView[]`. Pure — no
 * I/O, no React, clock-free (durations are manager-stamped upstream). An event
 * for an unknown `runId` creates the run defensively (never throws). A `status`
 * that is not `blocked` clears any standing blocked question (so resume →
 * `running` and every terminal status drop the respond panel); `status:
 * 'blocked'` preserves it, because the accompanying `workflow:blocked` event
 * (carrying the question + session id) arrives right after the status change.
 */
export function foldRunEvent(runs: RunView[], ev: WorkflowFoldEvent): RunView[] {
  switch (ev.type) {
    case 'run-started':
      return upsert(runs, ev.runId, (r) => ({
        ...r,
        workflowId: ev.workflowId,
        input: ev.input,
        startedAt: ev.startedAt,
        status: 'running'
      }))
    case 'status':
      return upsert(runs, ev.runId, (r) => ({
        ...r,
        status: ev.status,
        blocked: ev.status === 'blocked' ? r.blocked : undefined,
        blockedSessionId: ev.status === 'blocked' ? r.blockedSessionId : undefined
      }))
    case 'step':
      return upsert(runs, ev.runId, (r) => {
        switch (ev.step.kind) {
          case 'step-finished':
            return finishStep(r, ev.step)
          case 'failed':
            return {
              ...r,
              status: 'failed',
              error: ev.step.error,
              stdout: ev.step.stdout,
              code: ev.step.code
            }
          case 'step-started':
            return startStep(r, ev.step)
          default:
            return r
        }
      })
    case 'step-finished':
      return upsert(runs, ev.runId, (r) => finishStep(r, ev.step))
    case 'log':
      return upsert(runs, ev.runId, (r) => ({
        ...r,
        logs: [...r.logs, { message: ev.message, group: ev.group }],
        timeline: [...r.timeline, { kind: 'log', message: ev.message, group: ev.group }]
      }))
    case 'blocked':
      return upsert(runs, ev.runId, (r) => ({
        ...r,
        blocked: ev.question,
        blockedSessionId: ev.sessionId
      }))
  }
}
