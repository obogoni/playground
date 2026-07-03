import type { WorkItemDetails } from '../shared/tasks'
import type { ChangedFile, CreateWorktreeResult, RemoveWorktreeResult } from '../shared/worktrees'
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
}

/**
 * The per-run runtime seam supplied by the manager: cancellation checkpoint,
 * the two event emitters (auto-log), and the frozen trigger input. Tests supply
 * a recording fake.
 */
export interface CtxRuntime {
  /** Throws `CancellationError` when the run has been cancelled (WF2-14). */
  checkCancel(): void
  /** Record a `step-started` for an executed primitive / `ctx.step` group (WF2-10). */
  emitStep(label: string, group?: string): void
  /** Record a `step-logged` log line (WF2-10). */
  emitLog(message: string, group?: string): void
  /** The trigger values (`workflows:run` payload) — exposed frozen as `ctx.input`. */
  input: Record<string, string>
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
   * The shared wrapper: cancellation checkpoint → auto step-started → real call.
   * Cancel is checked BEFORE the step is emitted, so a cancelled run emits no
   * step for the skipped primitive.
   */
  function instrument<A extends unknown[], R>(
    name: string,
    fn: (...args: A) => Promise<R>
  ): (...args: A) => Promise<R> {
    return async (...args: A): Promise<R> => {
      runtime.checkCancel()
      runtime.emitStep(name, currentGroup())
      return fn(...args)
    }
  }

  return {
    worktree: {
      create: instrument(
        'worktree.create',
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
        (repoPath: string, worktreePath: string, opts?: { force?: boolean }) =>
          deps.worktree.remove(repoPath, worktreePath, opts)
      ),
      changedFiles: instrument('worktree.changedFiles', (worktreePath: string) =>
        deps.worktree.changedFiles(worktreePath)
      )
    },

    sh: instrument('sh', async (cmd: string, opts: { cwd: string; allowFail?: boolean }) => {
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
      fetch: instrument('git.fetch', (opts: GitFetchOptions) => deps.gitFetch(opts))
    },

    ado: {
      getTask: instrument('ado.getTask', async (ref: WorkItemRef): Promise<AdoTaskResult> => {
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
      })
    },

    notify: instrument('notify', async (message: string, opts?: { toast?: boolean }) => {
      runtime.emitLog(message, currentGroup())
      if (opts?.toast) deps.notifier(NOTIFY_TITLE, message)
    }),

    async log(message: string): Promise<void> {
      runtime.checkCancel()
      runtime.emitLog(message, currentGroup())
    },

    async step<T>(label: string, fn: () => Promise<T>): Promise<T> {
      runtime.checkCancel()
      runtime.emitStep(label, currentGroup())
      groupStack.push(label)
      try {
        return await fn()
      } finally {
        groupStack.pop()
      }
    },

    input: Object.freeze({ ...runtime.input })
  }
}
