import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RespondDecision, RunStatus, StepEvent, WorkflowMeta } from '../shared/workflows'
import { AgentStepError, type AgentResult } from './agent-step-runner'
import { CancellationError, type Ctx, type CtxDeps } from './workflow-ctx'
import type { LoadedWorkflow, RunFn } from './workflow-loader'
import { WorkflowRunStore } from './workflow-run-store'
import { WorkflowManager, type EmitFn, type WorkflowLoader } from './workflow-manager'

// --- recording emit (mirrors session-manager.test.ts) ---

interface EmittedEvent {
  channel: string
  payload: unknown
}
type EmitFnRecorder = ((channel: string, payload: unknown) => void) & { events: EmittedEvent[] }

function recordingEmit(): EmitFnRecorder {
  const events: EmittedEvent[] = []
  const fn = ((channel: string, payload: unknown): void => {
    events.push({ channel, payload })
  }) as EmitFnRecorder
  fn.events = events
  return fn
}

// --- recording notifier (records title/message/opts of every toast) ---

interface NotifyCall {
  title: string
  message: string
  opts?: { runId?: string }
}
type NotifierRecorder = ((title: string, message: string, opts?: { runId?: string }) => void) & {
  calls: NotifyCall[]
}

function recordingNotifier(): NotifierRecorder {
  const calls: NotifyCall[] = []
  const fn = ((title: string, message: string, opts?: { runId?: string }): void => {
    calls.push({ title, message, opts })
  }) as NotifierRecorder
  fn.calls = calls
  return fn
}

/** Flush microtasks until `cond` holds (the manager pause loop is all microtask-driven). */
async function waitUntil(cond: () => boolean, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (cond()) return
    await new Promise<void>((r) => setTimeout(r, 0))
  }
  throw new Error('waitUntil: condition never held')
}

// --- injected fakes ---

const META: WorkflowMeta = { name: 'Test Workflow', inputs: [] }

/** A CtxDeps whose capability seams throw if touched — the manager tests never exercise them. */
function fakeCtxDeps(notifier?: NotifierRecorder): CtxDeps {
  const unused = (): never => {
    throw new Error('CtxDeps seam not used in this test')
  }
  return {
    worktree: { create: unused, remove: unused, changedFiles: unused },
    runShell: unused,
    gitFetch: unused,
    ado: { getWorkItemWithRelations: unused, getWorkItems: unused },
    notifier: notifier ?? ((): void => {})
  }
}

/** Wrap an author `run(ctx)` (typed against `Ctx`) into a `LoadedWorkflow`. */
function workflow(run: (ctx: Ctx) => Promise<void>): LoadedWorkflow {
  return { meta: META, run: run as RunFn }
}

function fakeLoader(opts: {
  discover?: string[]
  load?: (folder: string) => Promise<LoadedWorkflow>
}): WorkflowLoader {
  return {
    discoverWorkflows: async (): Promise<string[]> => opts.discover ?? [],
    loadWorkflow: async (folder: string): Promise<LoadedWorkflow> =>
      opts.load ? opts.load(folder) : { error: 'no workflow' }
  }
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

function makeManager(
  loader: WorkflowLoader,
  agent?: NonNullable<CtxDeps['agent']>
): {
  manager: WorkflowManager
  store: WorkflowRunStore
  emit: EmitFnRecorder
  /** The manager-level lifecycle-toast notifier (WF4-13). */
  notifier: NotifierRecorder
  /** The author `ctx.notify` toast notifier (WF2-09) — a DISTINCT injection point (WF4-14). */
  ctxNotifier: NotifierRecorder
} {
  const dir = mkdtempSync(join(tmpdir(), 'wm-'))
  dirs.push(dir)
  const store = new WorkflowRunStore(dir)
  const emit = recordingEmit()
  const ctxNotifier = recordingNotifier()
  const ctxDeps = fakeCtxDeps(ctxNotifier)
  if (agent) ctxDeps.agent = agent
  const notifier = recordingNotifier()
  const manager = new WorkflowManager({
    workflowsRoot: '/virtual/workflows',
    loader,
    ctxDeps,
    store,
    emit: emit as unknown as EmitFn,
    notifier
  })
  return { manager, store, emit, notifier, ctxNotifier }
}

/** A loader whose author `run(ctx)` blocks on `ctx.ask`, capturing the decision it receives. */
function askingLoader(question = { title: 'Need input', body: 'which env?' }): {
  loader: WorkflowLoader
  received: () => RespondDecision | undefined
  caught: () => unknown
} {
  let received: RespondDecision | undefined
  let caught: unknown
  const loader = fakeLoader({
    load: async (): Promise<LoadedWorkflow> =>
      workflow(async (ctx) => {
        try {
          received = await ctx.ask(question)
        } catch (e) {
          caught = e
          throw e
        }
      })
  })
  return { loader, received: () => received, caught: () => caught }
}

/** Wait until a `workflow:blocked` event has been emitted for the active run. */
const untilBlocked = (emit: EmitFnRecorder): Promise<void> =>
  waitUntil(() => emit.events.some((e) => e.channel === 'workflow:blocked'))

/** The `runId` carried on the first `workflow:status` emit (fired synchronously on run-started). */
function activeRunId(emit: EmitFnRecorder): string {
  const evt = emit.events.find((e) => e.channel === 'workflow:status')
  if (!evt) throw new Error('no workflow:status emitted yet')
  return (evt.payload as { runId: string }).runId
}

describe('WorkflowManager', () => {
  it('list returns valid and broken definitions, others unaffected, order preserved (WF2-01/03)', async () => {
    const loader = fakeLoader({
      discover: ['alpha', 'broken', 'omega'],
      load: async (folder): Promise<LoadedWorkflow> =>
        folder.endsWith('broken')
          ? { error: 'SyntaxError: unexpected token' }
          : { meta: META, run: (async (): Promise<void> => {}) as RunFn }
    })
    const { manager } = makeManager(loader)

    const defs = await manager.list()

    expect(defs.map((d) => d.id)).toEqual(['alpha', 'broken', 'omega'])
    expect(defs).toContainEqual({ id: 'alpha', meta: META })
    expect(defs).toContainEqual({ id: 'omega', meta: META })
    expect(defs).toContainEqual({ id: 'broken', error: 'SyntaxError: unexpected token' })
  })

  it('run(happy) reaches done, streams status/step/log in order, and persists the events (WF2-13)', async () => {
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.log('first')
          await ctx.step('phase', async () => {
            await ctx.log('inside')
          })
        })
    })
    const { manager, store, emit } = makeManager(loader)

    const { runId } = await manager.run({ id: 'wf', input: { a: '1' } })

    // Streamed status: running first, done last.
    const statuses = emit.events
      .filter((e) => e.channel === 'workflow:status')
      .map((e) => (e.payload as { status: RunStatus }).status)
    expect(statuses[0]).toBe('running')
    expect(statuses.at(-1)).toBe('done')

    // Streamed step (from ctx.step) and logs (from ctx.log), in author order.
    // `workflow:step` now carries both step-started and step-finished (WHF-04);
    // the started event names the ctx.step label 'phase'.
    const stepLabels = emit.events
      .filter((e) => e.channel === 'workflow:step')
      .map((e) => (e.payload as { step: StepEvent }).step)
      .filter((s) => s.kind === 'step-started')
      .map((s) => s.label)
    expect(stepLabels).toEqual(['phase'])
    const logs = emit.events
      .filter((e) => e.channel === 'workflow:log')
      .map((e) => (e.payload as { message: string }).message)
    expect(logs).toEqual(['first', 'inside'])

    // running is emitted before any step/log; done is the final emit.
    expect(emit.events[0].channel).toBe('workflow:status')
    expect(emit.events.at(-1)).toEqual({
      channel: 'workflow:status',
      payload: { runId, status: 'done' }
    })

    // Persisted run mirrors the stream exactly (single choke-point, lockstep).
    const persisted = store.load(runId)
    expect(persisted?.status).toBe('done')
    expect(persisted?.events.map((e) => e.kind)).toEqual([
      'run-started',
      'step-logged', // first
      'step-started', // phase group opens
      'step-logged', // inside
      'step-finished', // phase group closes (WHF-02)
      'done'
    ])
    expect(persisted?.events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5])
    expect(persisted?.startedAt).not.toBe('')
    expect(persisted?.finishedAt).toBeTruthy()
    // The nested log carries the ctx.step group id.
    expect(persisted?.events[3]).toMatchObject({
      kind: 'step-logged',
      message: 'inside',
      group: 'phase'
    })
    // The group's step-started/step-finished share a stepId (WHF-01).
    const groupStart = persisted?.events.find((e) => e.kind === 'step-started')
    const groupFinish = persisted?.events.find((e) => e.kind === 'step-finished')
    expect(groupStart?.stepKind).toBe('group')
    expect(groupFinish?.stepId).toBe(groupStart?.stepId)
  })

  it('refuses a second concurrent run while one is active; the first still completes (WF2-17)', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.log('holding')
          await gate
        })
    })
    const { manager, store, emit } = makeManager(loader)

    const first = manager.run({ id: 'wf' })
    const runId = activeRunId(emit)

    await expect(manager.run({ id: 'wf' })).rejects.toThrow(/already active/i)

    release()
    const result = await first
    expect(result.runId).toBe(runId)
    expect(store.load(runId)?.status).toBe('done')
  })

  it('run(throw) ends failed with the error, stdout and exit code captured (WF2-15)', async () => {
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async () => {
          const err = new Error('command exploded') as Error & { code: number; stdout: string }
          err.code = 3
          err.stdout = 'partial output before the crash'
          throw err
        })
    })
    const { manager, store, emit } = makeManager(loader)

    const { runId } = await manager.run({ id: 'wf' })

    const persisted = store.load(runId)
    expect(persisted?.status).toBe('failed')
    expect(persisted?.error).toBe('command exploded')
    const failed = persisted?.events.find((e) => e.kind === 'failed')
    expect(failed).toMatchObject({
      kind: 'failed',
      error: 'command exploded',
      stdout: 'partial output before the crash',
      code: 3
    })
    // The terminal status was streamed.
    const lastStatus = emit.events.filter((e) => e.channel === 'workflow:status').at(-1)
    expect(lastStatus).toEqual({ channel: 'workflow:status', payload: { runId, status: 'failed' } })
  })

  it('cancel(runId) before the next ctx.* checkpoint ends the run cancelled (WF2-14)', async () => {
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          // The first instrumented checkpoint after cancellation must throw.
          await ctx.log('should not survive cancellation')
        })
    })
    const { manager, store, emit } = makeManager(loader)

    const runPromise = manager.run({ id: 'wf' })
    const runId = activeRunId(emit) // run-started emitted synchronously
    manager.cancel(runId) // set the token before the workflow reaches ctx.log

    const result = await runPromise
    expect(result.runId).toBe(runId)

    const persisted = store.load(runId)
    expect(persisted?.status).toBe('cancelled')
    // The cancelled checkpoint fired before ctx.log's own log line was recorded.
    expect(persisted?.events.some((e) => e.kind === 'step-logged')).toBe(false)
    const lastStatus = emit.events.filter((e) => e.channel === 'workflow:status').at(-1)
    expect(lastStatus).toEqual({
      channel: 'workflow:status',
      payload: { runId, status: 'cancelled' }
    })
  })

  const AGENT_OPTS = { prompt: 'p', expect: { type: 'object' as const }, cwd: 'C:/x' }

  it('hands makeCtx a runtime whose signal is a live, un-aborted AbortSignal (WF3-20)', async () => {
    let captured: AbortSignal | undefined
    const agent = {
      run: async (_opts: unknown, signal?: AbortSignal): Promise<AgentResult> => {
        captured = signal
        return { status: 'done', data: {}, sessionId: 's-1' }
      }
    }
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.agent(AGENT_OPTS)
        })
    })
    const { manager, store } = makeManager(loader, agent)

    const { runId } = await manager.run({ id: 'wf' })

    expect(captured).toBeInstanceOf(AbortSignal)
    expect(captured?.aborted).toBe(false) // a normal completion never fires the signal
    expect(store.load(runId)?.status).toBe('done')
  })

  it('cancel(runId) aborts the run signal, killing an in-flight agent step → cancelled (WF3-20)', async () => {
    let captured: AbortSignal | undefined
    let aborted = false
    let started: () => void = () => {}
    const startedP = new Promise<void>((resolve) => (started = resolve))
    const agent = {
      run: (_opts: unknown, signal?: AbortSignal): Promise<AgentResult> =>
        new Promise<AgentResult>((_resolve, reject) => {
          captured = signal
          signal?.addEventListener('abort', () => {
            aborted = true
            reject(new CancellationError()) // the runner rejects on abort after child.kill()
          })
          started()
        })
    }
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.agent(AGENT_OPTS)
        })
    })
    const { manager, store, emit } = makeManager(loader, agent)

    const runPromise = manager.run({ id: 'wf' })
    const runId = activeRunId(emit)
    await startedP // the agent step is now in-flight, awaiting on the signal

    manager.cancel(runId)
    await runPromise

    expect(captured).toBeInstanceOf(AbortSignal)
    expect(aborted).toBe(true) // cancel fired the abort, not merely the boolean token
    expect(store.load(runId)?.status).toBe('cancelled')
  })

  it('persists the agent step-logged sessionId on the run record (WF3-16)', async () => {
    const agent = {
      run: async (): Promise<AgentResult> => ({
        status: 'done',
        data: {},
        sessionId: 'sess-persisted-9'
      })
    }
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.agent(AGENT_OPTS)
        })
    })
    const { manager, store } = makeManager(loader, agent)

    const { runId } = await manager.run({ id: 'wf' })

    const logged = store
      .load(runId)
      ?.events.find((e) => e.kind === 'step-logged' && e.sessionId !== undefined)
    expect(logged?.sessionId).toBe('sess-persisted-9')
  })

  it('requestInput blocks the run, emits workflow:blocked, and fires a toast with the question (WF4-01/13)', async () => {
    const { loader } = askingLoader({ title: 'Need input', body: 'which env?' })
    const { manager, emit, store, notifier } = makeManager(loader)

    const runPromise = manager.run({ id: 'wf' })
    const runId = activeRunId(emit)
    await untilBlocked(emit)

    // Status folded to blocked and persisted.
    expect(store.load(runId)?.status).toBe('blocked')
    const statuses = emit.events
      .filter((e) => e.channel === 'workflow:status')
      .map((e) => (e.payload as { status: RunStatus }).status)
    expect(statuses).toContain('blocked')
    // The workflow:blocked event carries the exact question.
    const blockedEvt = emit.events.find((e) => e.channel === 'workflow:blocked')
    expect(blockedEvt?.payload).toEqual({
      runId,
      question: { title: 'Need input', body: 'which env?' }
    })
    // A native toast fired carrying the question body + the runId (lifecycle toast).
    expect(notifier.calls).toContainEqual({
      title: 'Need input',
      message: 'which env?',
      opts: { runId }
    })

    manager.respond(runId, { action: 'guidance', guidance: 'staging' })
    await runPromise
  })

  it('respond(guidance) resumes blocked→running and resolves ctx.ask with the decision (WF4-07)', async () => {
    const { loader, received } = askingLoader()
    const { manager, emit, store } = makeManager(loader)

    const runPromise = manager.run({ id: 'wf' })
    const runId = activeRunId(emit)
    await untilBlocked(emit)

    manager.respond(runId, { action: 'guidance', guidance: 'use staging' })
    await runPromise

    // ctx.ask resolved with the decision as-is.
    expect(received()).toEqual({ action: 'guidance', guidance: 'use staging' })
    // The event log shows blocked → resumed → done.
    const kinds = store.load(runId)?.events.map((e) => e.kind)
    expect(kinds).toContain('blocked')
    expect(kinds).toContain('resumed')
    expect(store.load(runId)?.status).toBe('done')
  })

  it('respond(abort) resolves ctx.ask to { action: abort } without throwing (WF4-07/11)', async () => {
    const { loader, received } = askingLoader()
    const { manager, emit } = makeManager(loader)

    const runPromise = manager.run({ id: 'wf' })
    const runId = activeRunId(emit)
    await untilBlocked(emit)

    manager.respond(runId, { action: 'abort' })
    await runPromise

    // ctx.ask returned abort as-is (the author's workflow did not throw on it).
    expect(received()).toEqual({ action: 'abort' })
  })

  it('respond for a wrong runId, or after the pending resolved, is a guarded no-op (WF4-07)', async () => {
    const { loader } = askingLoader()
    const { manager, emit, store } = makeManager(loader)

    const runPromise = manager.run({ id: 'wf' })
    const runId = activeRunId(emit)
    await untilBlocked(emit)

    // Wrong runId → no-op: the run stays blocked.
    manager.respond('not-the-active-run', { action: 'guidance', guidance: 'x' })
    expect(store.load(runId)?.status).toBe('blocked')

    // Correct respond releases it.
    manager.respond(runId, { action: 'abort' })
    await runPromise

    // A duplicate respond after settle (run no longer active) is a no-op, not a throw.
    expect(() => manager.respond(runId, { action: 'abort' })).not.toThrow()
  })

  it('cancel while blocked rejects the pending → cancelled and releases the serial guard (WF4-09)', async () => {
    let block = true
    let caught: unknown
    let received: RespondDecision | undefined
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          if (block) {
            try {
              received = await ctx.ask({ title: 't', body: 'b' })
            } catch (e) {
              caught = e
              throw e
            }
          } else {
            await ctx.log('second run ok')
          }
        })
    })
    const { manager, emit, store } = makeManager(loader)

    const runPromise = manager.run({ id: 'wf' })
    const runId = activeRunId(emit)
    await untilBlocked(emit)

    manager.cancel(runId)
    await runPromise

    expect(received).toBeUndefined() // ctx.ask rejected — it never returned a decision
    expect(caught).toBeInstanceOf(CancellationError)
    expect(store.load(runId)?.status).toBe('cancelled')

    // The serial guard was released: a subsequent run succeeds.
    block = false
    const second = await manager.run({ id: 'wf' })
    expect(store.load(second.runId)?.status).toBe('done')
  })

  it('a second workflows:run while blocked is refused by the serial guard (WF4-08)', async () => {
    const { loader } = askingLoader()
    const { manager, emit } = makeManager(loader)

    const runPromise = manager.run({ id: 'wf' })
    const runId = activeRunId(emit)
    await untilBlocked(emit)

    await expect(manager.run({ id: 'wf' })).rejects.toThrow(/already active/i)

    manager.respond(runId, { action: 'abort' })
    await runPromise
  })

  it('fires a lifecycle toast on done and failed, but none on cancelled (WF4-13)', async () => {
    // done → 'Workflow finished'
    const doneLoader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> => workflow(async () => {})
    })
    const { manager: m1, notifier: n1 } = makeManager(doneLoader)
    await m1.run({ id: 'wf' })
    expect(n1.calls.some((c) => c.title === 'Workflow finished')).toBe(true)

    // failed → 'Workflow failed' carrying the error
    const failLoader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async () => {
          throw new Error('boom')
        })
    })
    const { manager: m2, notifier: n2 } = makeManager(failLoader)
    await m2.run({ id: 'wf' })
    const failToast = n2.calls.find((c) => c.title === 'Workflow failed')
    expect(failToast).toBeTruthy()
    expect(failToast?.message).toContain('boom')

    // cancelled → NO lifecycle toast
    const cancelLoader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.log('x')
        })
    })
    const { manager: m3, emit: e3, notifier: n3 } = makeManager(cancelLoader)
    const p = m3.run({ id: 'wf' })
    const rid = activeRunId(e3)
    m3.cancel(rid)
    await p
    expect(n3.calls).toEqual([]) // cancel is silent
  })

  it('an author ctx.notify toast fires via the author notifier (no runId), distinct from lifecycle toasts (WF4-14)', async () => {
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.notify('author says hi', { toast: true })
        })
    })
    const { manager, notifier, ctxNotifier } = makeManager(loader)

    await manager.run({ id: 'wf' })

    // Author toast: through ctxDeps.notifier, WF2-09 shape ('Workflow' title, no runId).
    expect(ctxNotifier.calls).toContainEqual({
      title: 'Workflow',
      message: 'author says hi',
      opts: undefined
    })
    // The lifecycle done toast is a DIFFERENT notifier and carries a runId.
    const done = notifier.calls.find((c) => c.title === 'Workflow finished')
    expect(done?.opts?.runId).toBeTruthy()
    // The author toast did NOT flow through the lifecycle notifier.
    expect(notifier.calls.some((c) => c.message === 'author says hi')).toBe(false)
  })

  it('stamps a non-negative durationMs and correlates start↔finish by stepId (WHF-02)', async () => {
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.step('phase', async () => {})
        })
    })
    const { manager, store } = makeManager(loader)

    const { runId } = await manager.run({ id: 'wf' })

    const events = store.load(runId)!.events
    const started = events.filter((e) => e.kind === 'step-started')
    const finished = events.filter((e) => e.kind === 'step-finished')
    expect(started).toHaveLength(1)
    expect(finished).toHaveLength(1)
    expect(finished[0].stepId).toBe(started[0].stepId)
    expect(finished[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('assigns monotonic stepIds across the steps within a run (WHF-01)', async () => {
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.step('a', async () => {})
          await ctx.step('b', async () => {})
        })
    })
    const { manager, store } = makeManager(loader)

    const { runId } = await manager.run({ id: 'wf' })

    const started = store.load(runId)!.events.filter((e) => e.kind === 'step-started')
    expect(started.map((e) => e.stepId)).toEqual([0, 1])
  })

  it('resets the stepId counter between sequential runs (WHF-01)', async () => {
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.step('s', async () => {})
        })
    })
    const { manager, store } = makeManager(loader)

    const r1 = await manager.run({ id: 'wf' })
    const r2 = await manager.run({ id: 'wf' })

    const firstStepId = (rid: string): number | undefined =>
      store.load(rid)!.events.find((e) => e.kind === 'step-started')?.stepId
    expect(firstStepId(r1.runId)).toBe(0)
    expect(firstStepId(r2.runId)).toBe(0) // counter reset in the finally
  })

  it('carries the agent prompt/permission on start and result envelope on finish (WHF-05/06)', async () => {
    const agent = {
      run: async (): Promise<AgentResult> => ({
        status: 'done',
        data: { summary: 'shipped' },
        sessionId: 'sess-7'
      })
    }
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.agent({
            prompt: 'ship it',
            expect: { type: 'object' },
            cwd: 'C:/x',
            permission: 'write'
          })
        })
    })
    const { manager, store } = makeManager(loader, agent)

    const { runId } = await manager.run({ id: 'wf' })

    const events = store.load(runId)!.events
    const start = events.find((e) => e.kind === 'step-started' && e.stepKind === 'agent')
    expect(start?.agent).toEqual({ prompt: 'ship it', permission: 'write' })
    const finish = events.find((e) => e.kind === 'step-finished' && e.agentResult)
    expect(finish?.agentResult).toEqual({
      status: 'done',
      data: { summary: 'shipped' },
      sessionId: 'sess-7'
    })
  })

  it('fires workflow:run-started with {runId, workflowId, input, startedAt} (WHF-08)', async () => {
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> => workflow(async () => {})
    })
    const { manager, emit } = makeManager(loader)

    const { runId } = await manager.run({ id: 'wf', input: { ticket: '42' } })

    const started = emit.events.find((e) => e.channel === 'workflow:run-started')
    expect(started?.payload).toEqual({
      runId,
      workflowId: 'wf',
      input: { ticket: '42' },
      startedAt: expect.any(String)
    })
    expect((started?.payload as { startedAt: string }).startedAt).not.toBe('')
  })

  it('broadcasts both step-started and step-finished on workflow:step (WHF-04)', async () => {
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.step('phase', async () => {})
        })
    })
    const { manager, emit } = makeManager(loader)

    await manager.run({ id: 'wf' })

    const steps = emit.events
      .filter((e) => e.channel === 'workflow:step')
      .map((e) => (e.payload as { step: StepEvent }).step)
    expect(steps.some((s) => s.kind === 'step-started')).toBe(true)
    expect(steps.some((s) => s.kind === 'step-finished')).toBe(true)
  })

  it('broadcasts the terminal failed event on workflow:step with error/stdout/code (WHF-09)', async () => {
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async () => {
          const err = new Error('command exploded') as Error & { code: number; stdout: string }
          err.code = 3
          err.stdout = 'partial output before the crash'
          throw err
        })
    })
    const { manager, emit } = makeManager(loader)

    await manager.run({ id: 'wf' })

    const failedStep = emit.events
      .filter((e) => e.channel === 'workflow:step')
      .map((e) => (e.payload as { step: StepEvent }).step)
      .find((s) => s.kind === 'failed')
    expect(failedStep).toMatchObject({
      kind: 'failed',
      error: 'command exploded',
      stdout: 'partial output before the crash',
      code: 3
    })
  })

  it('surfaces AgentStepError.detail stdout/code onto the failed event + broadcast (WHF-10)', async () => {
    const agent = {
      run: async (): Promise<AgentResult> => {
        throw new AgentStepError('agent did not emit a valid result after one corrective retry', {
          stdout: 'agent stdout tail',
          stderr: 'boom',
          code: 7
        })
      }
    }
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.agent(AGENT_OPTS)
        })
    })
    const { manager, store, emit } = makeManager(loader, agent)

    const { runId } = await manager.run({ id: 'wf' })

    const persisted = store.load(runId)
    expect(persisted?.status).toBe('failed')
    const failed = persisted?.events.find((e) => e.kind === 'failed')
    expect(failed).toMatchObject({ stdout: 'agent stdout tail', code: 7 })
    // The evidence reached the renderer on workflow:step (WHF-09/10).
    const failedStep = emit.events
      .filter((e) => e.channel === 'workflow:step')
      .map((e) => (e.payload as { step: StepEvent }).step)
      .find((s) => s.kind === 'failed')
    expect(failedStep).toMatchObject({ stdout: 'agent stdout tail', code: 7 })
  })

  it('carries the agent sessionId on the workflow:blocked emit (WHF-07)', async () => {
    const agent = {
      run: async (
        _opts: unknown,
        _signal?: AbortSignal,
        onBlocked?: (
          q: { title: string; body: string },
          sessionId: string
        ) => Promise<RespondDecision>
      ): Promise<AgentResult> => {
        if (onBlocked) {
          await onBlocked({ title: 'Agent needs input', body: 'which env?' }, 'sess-block-1')
        }
        return { status: 'done', data: {}, sessionId: 'sess-block-1' }
      }
    }
    const loader = fakeLoader({
      load: async (): Promise<LoadedWorkflow> =>
        workflow(async (ctx) => {
          await ctx.agent(AGENT_OPTS)
        })
    })
    const { manager, emit } = makeManager(loader, agent)

    const runPromise = manager.run({ id: 'wf' })
    const runId = activeRunId(emit)
    await untilBlocked(emit)

    const blocked = emit.events.find((e) => e.channel === 'workflow:blocked')
    expect(blocked?.payload).toEqual({
      runId,
      question: { title: 'Agent needs input', body: 'which env?' },
      sessionId: 'sess-block-1'
    })

    manager.respond(runId, { action: 'guidance', guidance: 'staging' })
    await runPromise
  })
})
