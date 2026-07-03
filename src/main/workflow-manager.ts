import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { IpcEvent, IpcEvents } from '../shared/ipc-contract'
import type { RunStatus, StepEvent, WorkflowDef, WorkflowRun } from '../shared/workflows'
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
   * Reserved for manager-level lifecycle toasts (WF4). WF2's `ctx.notify` toast
   * flows through `ctxDeps.notifier`; the manager itself does not fire it yet.
   */
  notifier: (title: string, message: string) => void
}

/** A run's cancellation token — flipped by `cancel`, read by the ctx `checkCancel`. */
interface CancelToken {
  cancelled: boolean
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
    const token: CancelToken = { cancelled: false }
    this.#activeRunId = runId
    this.#activeToken = token
    this.#activeRun = initialRun(runId, id, resolvedInput)

    const runtime: CtxRuntime = {
      checkCancel: (): void => {
        if (token.cancelled) throw new CancellationError()
      },
      emitStep: (label: string, group?: string): void =>
        this.#apply({ kind: 'step-started', label, group }),
      emitLog: (message: string, group?: string): void =>
        this.#apply({ kind: 'step-logged', message, group }),
      input: resolvedInput
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
    }

    return { runId }
  }

  /** Request cancellation of `runId`; the token is read at the next `ctx.*` checkpoint (WF2-14). */
  cancel(runId: string): void {
    if (runId === this.#activeRunId && this.#activeToken) {
      this.#activeToken.cancelled = true
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

  /** Emit the matching IPC event(s): status on a change, step for step-started, log for step-logged. */
  #emit(run: WorkflowRun, prevStatus: RunStatus, event: StepEvent): void {
    if (run.status !== prevStatus) {
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
    }
  }
}
