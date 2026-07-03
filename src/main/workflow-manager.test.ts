import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunStatus, StepEvent, WorkflowMeta } from '../shared/workflows'
import type { Ctx, CtxDeps } from './workflow-ctx'
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

// --- injected fakes ---

const META: WorkflowMeta = { name: 'Test Workflow', inputs: [] }

/** A CtxDeps whose capability seams throw if touched — the manager tests never exercise them. */
function fakeCtxDeps(): CtxDeps {
  const unused = (): never => {
    throw new Error('CtxDeps seam not used in this test')
  }
  return {
    worktree: { create: unused, remove: unused, changedFiles: unused },
    runShell: unused,
    gitFetch: unused,
    ado: { getWorkItemWithRelations: unused, getWorkItems: unused },
    notifier: (): void => {}
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

function makeManager(loader: WorkflowLoader): {
  manager: WorkflowManager
  store: WorkflowRunStore
  emit: EmitFnRecorder
} {
  const dir = mkdtempSync(join(tmpdir(), 'wm-'))
  dirs.push(dir)
  const store = new WorkflowRunStore(dir)
  const emit = recordingEmit()
  const manager = new WorkflowManager({
    workflowsRoot: '/virtual/workflows',
    loader,
    ctxDeps: fakeCtxDeps(),
    store,
    emit: emit as unknown as EmitFn,
    notifier: (): void => {}
  })
  return { manager, store, emit }
}

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
    const stepLabels = emit.events
      .filter((e) => e.channel === 'workflow:step')
      .map((e) => (e.payload as { step: StepEvent }).step.label)
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
      'step-logged',
      'step-started',
      'step-logged',
      'done'
    ])
    expect(persisted?.events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4])
    expect(persisted?.startedAt).not.toBe('')
    expect(persisted?.finishedAt).toBeTruthy()
    // The nested log carries the ctx.step group id.
    expect(persisted?.events[3]).toMatchObject({
      kind: 'step-logged',
      message: 'inside',
      group: 'phase'
    })
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
})
