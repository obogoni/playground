import type { WorkItemDetails } from '../shared/tasks'
import type {
  BlockerQuestion,
  PermissionPreset,
  RespondDecision,
  StepDetail,
  StepEvent,
  StepKind
} from '../shared/workflows'
import type { ChangedFile, CreateWorktreeResult, RemoveWorktreeResult } from '../shared/worktrees'
import type { AgentResult, AgentStepOptions, BlockedResolver } from './agent-step-runner'
import {
  refKey,
  type GetWorkItemsResult,
  type GetWorkItemWithRelationsResult,
  type WorkItemRef
} from './ado-gateway'

/** Title used for the native toast a `ctx.notify({ toast })` fires (WF2-09). */
const NOTIFY_TITLE = 'Workflow'

/**
 * Thrown when a run is cancelled: `runtime.checkCancel()` raises it at the next
 * `ctx.*` checkpoint, and the manager folds it into a `cancelled` status
 * (WF2-14). Exported so the manager (T8) can construct it too.
 */
export class CancellationError extends Error {
  constructor(message = 'Run cancelled') {
    super(message)
    this.name = 'CancellationError'
  }
}

/** The captured result of a shell command (WF2-06). */
export interface ShellResult {
  code: number
  stdout: string
  stderr: string
}

/** The error `ctx.sh` throws on a non-zero exit (unless `allowFail`) — carries evidence. */
export interface ShellError extends Error {
  code: number
  stdout: string
  stderr: string
}

export interface GitFetchOptions {
  cwd: string
  remote?: string
  branch?: string
}

/** A task with its immediate child tasks, as returned by `ctx.ado.getTask` (WF2-08). */
export interface AdoTaskResult {
  task: WorkItemDetails
  children: Array<{ ref: WorkItemRef; details: WorkItemDetails }>
}

/**
 * The injectable capability seams the `ctx` facade delegates to. Real
 * implementations (worktree-manager fns, a shell spawn, a no-shell git execFile,
 * an `AdoGateway`, an `electron.Notification`) are assembled in `index.ts` (T9);
 * tests supply hand-rolled fakes.
 */
export interface CtxDeps {
  worktree: {
    create(
      repoPath: string,
      branch: string,
      baseBranch?: string,
      worktreeTemplate?: string,
      updateBase?: boolean,
      onExisting?: 'reuse' | 'recreate'
    ): Promise<CreateWorktreeResult>
    remove(
      repoPath: string,
      worktreePath: string,
      opts?: { force?: boolean }
    ): Promise<RemoveWorktreeResult>
    changedFiles(worktreePath: string): Promise<ChangedFile[]>
  }
  runShell(cmd: string, opts: { cwd: string }): Promise<ShellResult>
  gitFetch(opts: GitFetchOptions): Promise<void>
  ado: {
    getWorkItemWithRelations(ref: WorkItemRef): Promise<GetWorkItemWithRelationsResult>
    getWorkItems(refs: WorkItemRef[]): Promise<GetWorkItemsResult>
  }
  notifier(title: string, message: string): void
  // SPEC_DEVIATION: design (§7 / Data Models) types `agent` as required. It is
  // typed optional here so `index.ts` — which wires the real runner in T11 — keeps
  // typechecking through this phase without an out-of-scope edit. Production always
  // injects it; `ctx.agent` throws a clear error if invoked without it.
  // Reason: preserve a green gate across the phase boundary (T9 ships before T11).
  agent?: {
    run(
      opts: AgentStepOptions,
      signal?: AbortSignal,
      onBlocked?: BlockedResolver
    ): Promise<AgentResult>
  }
}

/**
 * The per-run runtime seam supplied by the manager: cancellation checkpoint,
 * the two event emitters (auto-log), and the frozen trigger input. Tests supply
 * a recording fake.
 */
export interface CtxRuntime {
  /** Throws `CancellationError` when the run has been cancelled (WF2-14). */
  checkCancel(): void
  /**
   * Open an instrumented step: record a `step-started` carrying its semantic
   * `kind`, the parent `ctx.step` group label, and (for an agent step) its
   * prompt/permission detail. Returns a monotonic `stepId` (the manager owns the
   * counter) that correlates this start with its later finish (WHF-01).
   */
  startStep(spec: {
    label: string
    kind: StepKind
    group?: string
    agent?: { prompt: string; permission: PermissionPreset }
  }): number
  /**
   * Close the step `stepId` opened by `startStep`: record a `step-finished` with
   * the manager-stamped `durationMs`, an `ok` outcome (`false` when the step's
   * `fn` threw), and an optional detail / agent-result payload for the renderer's
   * detail box (WHF-02/06/15).
   */
  finishStep(
    stepId: number,
    out?: { ok?: boolean; detail?: StepDetail; agentResult?: StepEvent['agentResult'] }
  ): void
  /** Record a `step-logged` log line; `sessionId` rides the event for the agent step (WF3-16). */
  emitLog(message: string, group?: string, sessionId?: string): void
  /** The trigger values (`workflows:run` payload) — exposed frozen as `ctx.input`. */
  input: Record<string, string>
  // SPEC_DEVIATION: design (§7) types `signal` as required. It is typed optional
  // here so `workflow-manager.ts` — which sets it in T10, after this task's commit —
  // keeps typechecking now without an out-of-scope edit. Production always provides it.
  // Reason: preserve a green gate across the T9→T10 ordering.
  /** The run's cancellation signal, forwarded to `deps.agent.run` for child-kill (WF3-20). */
  signal?: AbortSignal
  // SPEC_DEVIATION: design (§4) types `requestInput` as required. It is typed
  // optional here — mirroring `signal?`/`agent?` above — so `workflow-manager.ts`
  // (which implements it in T6, after this commit) keeps typechecking now without an
  // out-of-scope edit. Production always provides it; `ctx.ask` throws a clear error
  // if invoked without it, and `ctx.agent` falls back to WF3 (no engine pause).
  // Reason: preserve a green production typecheck across the T5→T6 ordering.
  /**
   * Pause the run awaiting a human answer (WF4-01); resolves with the decision.
   * `sessionId` scopes an agent block to its `--resume` session for the respond
   * panel's session note (WHF-07).
   */
  requestInput?(question: BlockerQuestion, sessionId?: string): Promise<RespondDecision>
}

/** The deterministic facade handed to a workflow's `run(ctx)`. */
export interface Ctx {
  worktree: {
    create(
      repoPath: string,
      branch: string,
      baseBranch?: string,
      worktreeTemplate?: string,
      updateBase?: boolean,
      onExisting?: 'reuse' | 'recreate'
    ): Promise<CreateWorktreeResult>
    remove(
      repoPath: string,
      worktreePath: string,
      opts?: { force?: boolean }
    ): Promise<RemoveWorktreeResult>
    changedFiles(worktreePath: string): Promise<ChangedFile[]>
  }
  sh(cmd: string, opts: { cwd: string; allowFail?: boolean }): Promise<ShellResult>
  git: { fetch(opts: GitFetchOptions): Promise<void> }
  ado: { getTask(ref: WorkItemRef): Promise<AdoTaskResult> }
  notify(message: string, opts?: { toast?: boolean }): Promise<void>
  log(message: string): Promise<void>
  step<T>(label: string, fn: () => Promise<T>): Promise<T>
  /** Run a headless agent step returning validated structured data (WF3-01). */
  agent(opts: AgentStepOptions): Promise<AgentResult>
  /** Pause the run and ask the human a question; resolves with their decision (WF4-11). */
  ask(opts: { title: string; body: string }): Promise<RespondDecision>
  input: Record<string, string>
}

/**
 * Build the per-run `ctx` facade. Every action primitive is constructed through
 * the shared `instrument` wrapper so it auto-checks cancellation and auto-emits
 * a `step-started` (WF2-10) with zero author effort. `ctx.step` opens a labeled
 * group whose child events nest under it; `ctx.log`/`ctx.notify` emit log lines;
 * `ctx.input` exposes the frozen trigger values.
 */
export function makeCtx(deps: CtxDeps, runtime: CtxRuntime): Ctx {
  // Group stack for `ctx.step` nesting: the top label is the current group id.
  const groupStack: string[] = []
  const currentGroup = (): string | undefined => groupStack.at(-1)

  /**
   * The shared wrapper: cancellation checkpoint → `startStep` → real call →
   * `finishStep`. Cancel is checked BEFORE the step is opened, so a cancelled run
   * emits NO step for the skipped primitive. The optional `hooks` extract per-kind
   * detail: `onStart` reads the agent prompt/permission off the call args (WHF-05);
   * `onFinish` reads the detail-box / agent-result payload off the resolved value
   * (WHF-06/15). A throwing `fn` finishes with `ok:false` and rethrows.
   */
  function instrument<A extends unknown[], R>(
    name: string,
    kind: StepKind,
    fn: (...args: A) => Promise<R>,
    hooks?: {
      onStart?: (args: A) => { prompt: string; permission: PermissionPreset }
      onFinish?: (result: R) => { detail?: StepDetail; agentResult?: StepEvent['agentResult'] }
    }
  ): (...args: A) => Promise<R> {
    return async (...args: A): Promise<R> => {
      runtime.checkCancel()
      const stepId = runtime.startStep({
        label: name,
        kind,
        group: currentGroup(),
        agent: hooks?.onStart?.(args)
      })
      try {
        const result = await fn(...args)
        runtime.finishStep(stepId, { ok: true, ...hooks?.onFinish?.(result) })
        return result
      } catch (err) {
        runtime.finishStep(stepId, { ok: false })
        throw err
      }
    }
  }

  return {
    worktree: {
      create: instrument(
        'worktree.create',
        'worktree',
        (
          repoPath: string,
          branch: string,
          baseBranch?: string,
          worktreeTemplate?: string,
          updateBase?: boolean,
          onExisting?: 'reuse' | 'recreate'
        ) =>
          deps.worktree.create(
            repoPath,
            branch,
            baseBranch,
            worktreeTemplate,
            updateBase,
            onExisting
          )
      ),
      remove: instrument(
        'worktree.remove',
        'worktree',
        (repoPath: string, worktreePath: string, opts?: { force?: boolean }) =>
          deps.worktree.remove(repoPath, worktreePath, opts)
      ),
      changedFiles: instrument(
        'worktree.changedFiles',
        'worktree',
        (worktreePath: string) => deps.worktree.changedFiles(worktreePath),
        { onFinish: (files) => ({ detail: { kind: 'files', files } }) }
      )
    },

    sh: instrument('sh', 'sh', async (cmd: string, opts: { cwd: string; allowFail?: boolean }) => {
      const result = await deps.runShell(cmd, { cwd: opts.cwd })
      if (result.code !== 0 && !opts.allowFail) {
        const err = new Error(`Command failed (exit ${result.code}): ${cmd}`) as ShellError
        err.code = result.code
        err.stdout = result.stdout
        err.stderr = result.stderr
        throw err
      }
      return result
    }),

    git: {
      fetch: instrument('git.fetch', 'git', (opts: GitFetchOptions) => deps.gitFetch(opts))
    },

    ado: {
      getTask: instrument(
        'ado.getTask',
        'ado',
        async (ref: WorkItemRef): Promise<AdoTaskResult> => {
          const parent = await deps.ado.getWorkItemWithRelations(ref)
          if (!parent.ok) throw new Error(parent.error || 'Azure DevOps authentication failed')
          const batch = await deps.ado.getWorkItems(parent.childRefs)
          if (!batch.ok) throw new Error(batch.error || 'Azure DevOps authentication failed')
          const children = parent.childRefs
            .map((childRef) => ({ ref: childRef, details: batch.details.get(refKey(childRef)) }))
            .filter(
              (child): child is { ref: WorkItemRef; details: WorkItemDetails } =>
                child.details !== undefined
            )
          return { task: parent.item, children }
        },
        {
          onFinish: (result) => ({
            detail: {
              kind: 'ado',
              task: result.task,
              children: result.children.map((child) => child.details)
            }
          })
        }
      )
    },

    notify: instrument('notify', 'notify', async (message: string, opts?: { toast?: boolean }) => {
      runtime.emitLog(message, currentGroup())
      if (opts?.toast) deps.notifier(NOTIFY_TITLE, message)
    }),

    async log(message: string): Promise<void> {
      runtime.checkCancel()
      runtime.emitLog(message, currentGroup())
    },

    // A `ctx.step` opens an instrumented GROUP: it brackets its `fn` with the same
    // start→finish pair (`kind:'group'`, WHF-01/02), and — while `fn` runs — pushes
    // its LABEL so nested child events carry it as their parent group. The group's
    // own start records the PARENT group label (`currentGroup()` before the push).
    async step<T>(label: string, fn: () => Promise<T>): Promise<T> {
      runtime.checkCancel()
      const stepId = runtime.startStep({ label, kind: 'group', group: currentGroup() })
      groupStack.push(label)
      try {
        const result = await fn()
        runtime.finishStep(stepId, { ok: true })
        return result
      } catch (err) {
        runtime.finishStep(stepId, { ok: false })
        throw err
      } finally {
        groupStack.pop()
      }
    },

    // `instrument` runs `checkCancel` (before spawn, WF3-19) and auto-emits a
    // `step-started` labeled `agent` carrying the prompt + permission preset
    // (WHF-05); the delegate forwards the run's cancellation `signal` so a running
    // child is killed on cancel (WF3-20), records the agent's `session_id` on a
    // `step-logged` event for WF4 `--resume` (WF3-16), and the finish carries the
    // validated `emit_result` envelope as `agentResult` (WHF-06).
    agent: instrument(
      'agent',
      'agent',
      async (opts: AgentStepOptions): Promise<AgentResult> => {
        if (!deps.agent) throw new Error('agent capability is not configured')
        // Wire the engine-driven pause: a `blocked` agent result funnels through the
        // manager's `requestInput` (WF4-01). The block↔guidance↔resume loop lives in
        // the runner (Approach A). Absent a runtime that supports `requestInput`, the
        // runner returns `blocked` as-is (WF3 back-compat). `onBlocked` forwards the
        // agent's `sessionId` so the respond panel can show the resume session note (WHF-07).
        const requestInput = runtime.requestInput
        const onBlocked: BlockedResolver | undefined = requestInput
          ? (q, sessionId) => requestInput(q, sessionId)
          : undefined
        const result = await deps.agent.run(opts, runtime.signal, onBlocked)
        runtime.emitLog(`agent session ${result.sessionId}`, currentGroup(), result.sessionId)
        return result
      },
      {
        onStart: (args) => ({
          prompt: args[0].prompt,
          permission: args[0].permission ?? 'read'
        }),
        onFinish: (result) => ({
          agentResult: { status: result.status, data: result.data, sessionId: result.sessionId }
        })
      }
    ),

    // `instrument` runs `checkCancel` then auto-emits a `step-started` labeled `ask`
    // (WF4-12); the delegate pauses the run via the manager's `requestInput` and
    // returns the human decision AS-IS — `abort` does NOT throw here (WF4-11), so the
    // author can branch on it. (The agent path's abort→cancelled is the runner's job.)
    ask: instrument(
      'ask',
      'ask',
      async (o: { title: string; body: string }): Promise<RespondDecision> => {
        if (!runtime.requestInput) throw new Error('ask capability is not configured')
        return runtime.requestInput({ title: o.title, body: o.body })
      }
    ),

    input: Object.freeze({ ...runtime.input })
  }
}
