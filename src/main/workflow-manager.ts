import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { IpcEvent, IpcEvents } from '../shared/ipc-contract'
import type {
  BlockerQuestion,
  RespondDecision,
  RunStatus,
  StepEvent,
  WorkflowDef,
  WorkflowRun
} from '../shared/workflows'
import { initialRun, reduce } from './run-state'
import { CancellationError, makeCtx, type CtxDeps, type CtxRuntime } from './workflow-ctx'
import type { LoadedWorkflow } from './workflow-loader'
import type { WorkflowRunStore } from './workflow-run-store'

/**
 * Typed main→renderer push, bound to the live window's webContents by index.ts.
 * The manager only emits the `workflow:*` channels, but typing against the whole
 * shared `IpcEvents` map keeps it assignable from the one `emitToWindow` the app
 * shares with `SessionManager` (mirrors `session-manager.ts`'s `EmitFn`).
 */
export type EmitFn = <E extends IpcEvent>(channel: E, payload: IpcEvents[E]) => void

/** The loader seam — the two `workflow-loader` functions, injected so tests use fakes. */
export interface WorkflowLoader {
  discoverWorkflows(root: string): Promise<string[]>
  loadWorkflow(folder: string): Promise<LoadedWorkflow>
}

/** The DI object-bag (mirrors `SessionManagerDeps`) — every collaborator injected. */
export interface WorkflowManagerDeps {
  /** `~/.playground/workflows/` in production; a virtual/fixture root in tests. */
  workflowsRoot: string
  loader: WorkflowLoader
  ctxDeps: CtxDeps
  store: WorkflowRunStore
  emit: EmitFn
  /**
   * Manager-level lifecycle toasts (WF4-13): fired on block / done / failed. An
   * `opts.runId` marks a lifecycle toast so `index.ts` can attach a click-to-focus
   * handler (WF4-15). Distinct from WF2's `ctx.notify` author toast, which flows
   * through `ctxDeps.notifier` with no `runId`.
   */
  notifier: (title: string, message: string, opts?: { runId?: string }) => void
}

/**
 * A run's cancellation token. `cancelled` is flipped by `cancel` and polled by the
 * ctx `checkCancel` at each `ctx.*` boundary (WF2-14); `controller` drives the
 * `AbortSignal` handed to a long-running agent step so a running child is killed
 * mid-flight rather than only at the next checkpoint (WF3-20).
 */
interface CancelToken {
  cancelled: boolean
  controller: AbortController
}

/**
 * The DI orchestrator (WF2-13/14/15/17): lists workflows, runs one at a time in
 * the main process, and streams + persists the lifecycle. Mirrors
 * `SessionManager`'s `constructor(private readonly deps)` bag.
 *
 * Runs are **serial** — a single `#activeRunId` guards a second concurrent
 * `run()` (WF2-17). A single private `apply()` choke-point folds every event
 * through the pure reducer, stamps timestamps (the reducer is clock-free),
 * persists, then emits — so the stored log and the IPC stream never diverge.
 * Fail-fast, **no rollback**: created worktrees/branches are left in place.
 */
export class WorkflowManager {
  #activeRunId: string | null = null
  #activeToken: CancelToken | null = null
  /** The in-flight run's current immutable snapshot (serial ⇒ at most one). */
  #activeRun: WorkflowRun | null = null
  /**
   * The monotonic step-id counter for the active run (serial ⇒ one at a time).
   * `startStep` hands out the next id + records its `t0`; `finishStep` computes
   * `durationMs` from it. The manager owns the clock so the reducer stays clock-free
   * (WHF-01/02). Both are reset in `run()`'s `finally`.
   */
  #stepSeq = 0
  #stepStart = new Map<number, number>()
  /**
   * The single in-flight human-in-the-loop pause (serial ⇒ at most one, WF4). Set
   * when a run blocks via `runtime.requestInput`; resolved by `respond` (guidance
   * or abort) or rejected by `cancel` (CancellationError). Cleared on settle and in
   * `run()`'s finally.
   */
  #pendingRespond: {
    resolve: (decision: RespondDecision) => void
    reject: (err: Error) => void
  } | null = null

  constructor(private readonly deps: WorkflowManagerDeps) {}

  /**
   * Every discovered workflow, valid (`{id,meta}`) or broken (`{id,error}`)
   * (WF2-01/03/04). A broken folder is listed with its error and NEVER blocks
   * the others.
   */
  async list(): Promise<WorkflowDef[]> {
    const ids = await this.deps.loader.discoverWorkflows(this.deps.workflowsRoot)
    const defs: WorkflowDef[] = []
    for (const id of ids) {
      defs.push(await this.#loadDef(id))
    }
    return defs
  }

  /** Load one workflow into a list entry; any failure lists it as broken (WF2-03). */
  async #loadDef(id: string): Promise<WorkflowDef> {
    try {
      const loaded = await this.deps.loader.loadWorkflow(join(this.deps.workflowsRoot, id))
      return 'error' in loaded ? { id, error: loaded.error } : { id, meta: loaded.meta }
    } catch (err) {
      return { id, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Start a run for workflow `id`, executing its `run(ctx)` in the main process
   * (WF2-13). Refuses with a clear error while another run is active (WF2-17).
   * Ends `done` on success, `cancelled` on a `CancellationError` (WF2-14), or
   * `failed` — capturing `error`/`stdout`/`code` — on any other throw (WF2-15).
   * No rollback; `finally` clears the active slot so the next run can start.
   */
  async run({ id, input }: { id: string; input?: Record<string, string> }): Promise<{
    runId: string
  }> {
    if (this.#activeRunId != null) {
      throw new Error(
        `A workflow run is already active (${this.#activeRunId}); runs are serial — ` +
          'cancel it before starting another.'
      )
    }

    const runId = randomUUID()
    const resolvedInput = input ?? {}
    const token: CancelToken = { cancelled: false, controller: new AbortController() }
    this.#activeRunId = runId
    this.#activeToken = token
    this.#activeRun = initialRun(runId, id, resolvedInput)

    const runtime: CtxRuntime = {
      checkCancel: (): void => {
        if (token.cancelled) throw new CancellationError()
      },
      // Open a step: hand out the next monotonic id, record its start clock, and
      // apply a `step-started` carrying its semantic kind + agent detail (WHF-01/05).
      startStep: (spec): number => {
        const id = this.#stepSeq++
        this.#stepStart.set(id, Date.now())
        this.#apply({
          kind: 'step-started',
          label: spec.label,
          group: spec.group,
          stepId: id,
          stepKind: spec.kind,
          agent: spec.agent
        })
        return id
      },
      // Close a step: stamp the manager-owned `durationMs` (reducer stays clock-free)
      // and apply a `step-finished` with the ok outcome + detail/agentResult (WHF-02/06).
      finishStep: (stepId, out): void => {
        const durationMs = Date.now() - (this.#stepStart.get(stepId) ?? Date.now())
        this.#stepStart.delete(stepId)
        this.#apply({
          kind: 'step-finished',
          stepId,
          durationMs,
          ok: out?.ok ?? true,
          detail: out?.detail,
          agentResult: out?.agentResult
        })
      },
      emitLog: (message: string, group?: string, sessionId?: string): void =>
        this.#apply({ kind: 'step-logged', message, group, sessionId }),
      input: resolvedInput,
      // The run's cancellation signal, forwarded by `ctx.agent` to the runner so an
      // in-flight agent child is killed on cancel (WF3-20).
      signal: token.controller.signal,
      // The ONE manager-owned pause primitive (WF4-01): both `ctx.ask` and the
      // agent block-loop's `onBlocked` funnel here. Store the pending settler, then
      // apply `blocked` (drives status + `workflow:blocked` + toast). The promise
      // does not settle until `respond` (resolve) or `cancel` (reject).
      requestInput: (question: BlockerQuestion, sessionId?: string): Promise<RespondDecision> =>
        new Promise<RespondDecision>((resolve, reject) => {
          this.#pendingRespond = { resolve, reject }
          this.#apply({ kind: 'blocked', question, sessionId })
        })
    }

    try {
      this.#apply({ kind: 'run-started' })
      const loaded = await this.deps.loader.loadWorkflow(join(this.deps.workflowsRoot, id))
      if ('error' in loaded) throw new Error(loaded.error)
      const ctx = makeCtx(this.deps.ctxDeps, runtime)
      await loaded.run(ctx)
      this.#apply({ kind: 'done' })
    } catch (err) {
      if (err instanceof CancellationError) {
        this.#apply({ kind: 'cancelled' })
      } else {
        const evidence = err as { stdout?: unknown; code?: unknown }
        this.#apply({
          kind: 'failed',
          error: err instanceof Error ? err.message : String(err),
          stdout: typeof evidence.stdout === 'string' ? evidence.stdout : undefined,
          code: typeof evidence.code === 'number' ? evidence.code : undefined
        })
      }
    } finally {
      this.#activeRunId = null
      this.#activeToken = null
      this.#activeRun = null
      this.#pendingRespond = null
      // Reset the per-run step clock/counter (serial — one run at a time) so the
      // next run's stepIds restart at 0 (WHF-01).
      this.#stepSeq = 0
      this.#stepStart.clear()
    }

    return { runId }
  }

  /**
   * Answer the active blocked run (WF4-07). For the active run with a pending
   * response: transition `blocked → running` (resumed) and resolve the pending with
   * the decision — uniform for `abort` and `guidance`. The agent path's
   * `abort → cancelled` is produced downstream by the runner throwing, not here.
   * A stray/duplicate/wrong-run respond is a guarded no-op.
   */
  respond(runId: string, decision: RespondDecision): void {
    if (runId !== this.#activeRunId || !this.#pendingRespond) return
    const pending = this.#pendingRespond
    this.#pendingRespond = null
    this.#apply({ kind: 'resumed' })
    pending.resolve(decision)
  }

  /**
   * Request cancellation of `runId`. Sets the token (read at the next `ctx.*`
   * checkpoint, WF2-14) AND aborts the controller so a running agent child is
   * killed mid-flight rather than surviving until the next checkpoint (WF3-20).
   */
  cancel(runId: string): void {
    if (runId === this.#activeRunId && this.#activeToken) {
      this.#activeToken.cancelled = true
      this.#activeToken.controller.abort()
      // A blocked run is awaiting a response — reject it so CancellationError bubbles
      // through `requestInput` → `loaded.run` → the catch → `cancelled` (WF4-09).
      if (this.#pendingRespond) {
        const pending = this.#pendingRespond
        this.#pendingRespond = null
        pending.reject(new CancellationError())
      }
    }
  }

  /** Discovery is on-demand (`list` re-scans), so there is nothing cached to clear (WF2-01). */
  reload(): void {
    // Intentional no-op stub: the `workflows:reload` channel exists, but v1 keeps
    // no discovery cache. A later milestone that caches will clear it here.
  }

  /**
   * The single choke-point (design: Tech Decisions): reduce → stamp timestamps →
   * persist → emit, in lockstep. A guarded no-op transition (the reducer returns
   * the run unchanged) neither persists nor emits.
   */
  #apply(event: Omit<StepEvent, 'seq'>): void {
    const current = this.#activeRun
    if (!current) return
    const full: StepEvent = { ...event, seq: current.events.length }
    const reduced = reduce(current, full)
    if (reduced === current) return // guarded no-op — nothing changed

    const stamped = this.#stamp(reduced, full)
    this.#activeRun = stamped
    this.deps.store.save(stamped)
    this.#emit(stamped, current.status, full)
  }

  /** Stamp `startedAt` on run-started and `finishedAt` on a terminal event (manager owns the clock). */
  #stamp(run: WorkflowRun, event: StepEvent): WorkflowRun {
    if (event.kind === 'run-started') {
      return { ...run, startedAt: new Date().toISOString() }
    }
    if (event.kind === 'done' || event.kind === 'failed' || event.kind === 'cancelled') {
      return { ...run, finishedAt: new Date().toISOString() }
    }
    return run
  }

  /**
   * Emit the matching IPC event(s) and fire native lifecycle toasts. Status on a
   * change; step/log for the auto-log events; `workflow:blocked` + a toast on a
   * `blocked` event; a lifecycle toast on `done`/`failed` (WF4-13). `cancelled` is
   * silent (no lifecycle toast) — the user initiated it.
   */
  #emit(run: WorkflowRun, prevStatus: RunStatus, event: StepEvent): void {
    const changed = run.status !== prevStatus
    if (changed) {
      this.deps.emit('workflow:status', { runId: run.runId, status: run.status })
    }
    if (event.kind === 'step-started') {
      this.deps.emit('workflow:step', { runId: run.runId, step: event })
    } else if (event.kind === 'step-logged') {
      this.deps.emit('workflow:log', {
        runId: run.runId,
        message: event.message ?? '',
        group: event.group
      })
    } else if (event.kind === 'blocked' && event.question) {
      // Pause signal for the renderer + native toast carrying the question (WF4-01/13).
      this.deps.emit('workflow:blocked', { runId: run.runId, question: event.question })
      this.deps.notifier(event.question.title, event.question.body, { runId: run.runId })
    }
    if (changed && run.status === 'done') {
      this.deps.notifier('Workflow finished', `${run.workflowId} completed`, { runId: run.runId })
    } else if (changed && run.status === 'failed') {
      this.deps.notifier('Workflow failed', `${run.workflowId}: ${run.error ?? 'failed'}`, {
        runId: run.runId
      })
    }
  }
}
