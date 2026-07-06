import { describe, expect, it } from 'vitest'
import type {
  BlockerQuestion,
  PermissionPreset,
  RespondDecision,
  StepDetail,
  StepEvent,
  StepKind
} from '../shared/workflows'
import type { AgentResult, AgentStepOptions, BlockedResolver } from './agent-step-runner'
import { refKey, type WorkItemRef } from './ado-gateway'
import { CancellationError, makeCtx, type CtxDeps, type CtxRuntime } from './workflow-ctx'

interface StepRec {
  stepId: number
  label: string
  kind: StepKind
  group?: string
  agent?: { prompt: string; permission: PermissionPreset }
}
interface FinishRec {
  stepId: number
  ok?: boolean
  detail?: StepDetail
  agentResult?: StepEvent['agentResult']
}
interface LogRec {
  message: string
  group?: string
  sessionId?: string
}

function makeRuntime(
  input: Record<string, string> = {},
  signal?: AbortSignal,
  requestInput?: (q: BlockerQuestion) => Promise<RespondDecision>
): {
  runtime: CtxRuntime
  steps: StepRec[]
  finishes: FinishRec[]
  logs: LogRec[]
  cancel: () => void
  asks: BlockerQuestion[]
  /** The `sessionId` forwarded to each `requestInput` call, in order (WHF-07). */
  reqSessions: Array<string | undefined>
} {
  const steps: StepRec[] = []
  const finishes: FinishRec[] = []
  const logs: LogRec[] = []
  const asks: BlockerQuestion[] = []
  const reqSessions: Array<string | undefined> = []
  let cancelled = false
  let seq = 0
  const runtime: CtxRuntime = {
    checkCancel() {
      if (cancelled) throw new CancellationError()
    },
    startStep(spec) {
      const id = seq++
      steps.push({ stepId: id, ...spec })
      return id
    },
    finishStep(stepId, out) {
      finishes.push({ stepId, ...out })
    },
    emitLog(message, group, sessionId) {
      logs.push({ message, group, sessionId })
    },
    input,
    signal,
    requestInput: requestInput
      ? async (q, sessionId) => {
          asks.push(q)
          reqSessions.push(sessionId)
          return requestInput(q)
        }
      : undefined
  }
  return { runtime, steps, finishes, logs, cancel: () => (cancelled = true), asks, reqSessions }
}

/** A fully-populated fake deps bag; tests reassign the one method they exercise. */
function makeDeps(): CtxDeps {
  return {
    worktree: {
      create: async () => ({ ok: true, path: 'C:/wt' }),
      remove: async () => ({ ok: true }),
      changedFiles: async () => []
    },
    runShell: async () => ({ code: 0, stdout: '', stderr: '' }),
    gitFetch: async () => {},
    ado: {
      getWorkItemWithRelations: async () => ({
        ok: true,
        item: { title: 'T', type: 'Task', state: 'Active' },
        childRefs: []
      }),
      getWorkItems: async () => ({ ok: true, details: new Map() })
    },
    notifier: () => {}
  }
}

const REF: WorkItemRef = { id: 1, org: 'o', project: 'p' }

describe('ctx.worktree (WF2-05)', () => {
  it('create delegates to deps.worktree.create and returns its result', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    const expected = { ok: true as const, path: 'C:/wt/feature' }
    let received: unknown[] = []
    deps.worktree.create = async (...args) => {
      received = args
      return expected
    }
    const ctx = makeCtx(deps, runtime)
    const result = await ctx.worktree.create('C:/repo', 'feature', 'main')
    expect(result).toBe(expected)
    expect(received).toEqual(['C:/repo', 'feature', 'main', undefined, undefined, undefined])
  })

  it('remove delegates with its options and returns its result', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    const expected = { ok: false as const, error: 'still dirty' }
    let received: unknown[] = []
    deps.worktree.remove = async (...args) => {
      received = args
      return expected
    }
    const ctx = makeCtx(deps, runtime)
    expect(await ctx.worktree.remove('C:/repo', 'C:/wt', { force: true })).toBe(expected)
    expect(received).toEqual(['C:/repo', 'C:/wt', { force: true }])
  })

  it('changedFiles delegates and returns the file list verbatim', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    const files = [{ path: 'a.ts', status: 'modified' as const }]
    deps.worktree.changedFiles = async () => files
    const ctx = makeCtx(deps, runtime)
    expect(await ctx.worktree.changedFiles('C:/wt')).toBe(files)
  })
})

describe('ctx.sh (WF2-06)', () => {
  it('returns { code, stdout, stderr } and forwards cwd on a zero exit', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    let call: unknown
    deps.runShell = async (cmd, opts) => {
      call = { cmd, opts }
      return { code: 0, stdout: 'ok', stderr: '' }
    }
    const ctx = makeCtx(deps, runtime)
    expect(await ctx.sh('echo hi', { cwd: 'C:/x' })).toEqual({ code: 0, stdout: 'ok', stderr: '' })
    expect(call).toEqual({ cmd: 'echo hi', opts: { cwd: 'C:/x' } })
  })

  it('throws on a non-zero exit, carrying code/stdout/stderr on the error', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    deps.runShell = async () => ({ code: 2, stdout: 'partial', stderr: 'boom' })
    const ctx = makeCtx(deps, runtime)
    await expect(ctx.sh('bad', { cwd: 'C:/x' })).rejects.toMatchObject({
      code: 2,
      stdout: 'partial',
      stderr: 'boom'
    })
  })

  it('returns instead of throwing when allowFail is set and the exit is non-zero', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    deps.runShell = async () => ({ code: 1, stdout: 'o', stderr: 'e' })
    const ctx = makeCtx(deps, runtime)
    expect(await ctx.sh('bad', { cwd: 'C:/x', allowFail: true })).toEqual({
      code: 1,
      stdout: 'o',
      stderr: 'e'
    })
  })
})

describe('ctx.git.fetch (WF2-07)', () => {
  it('delegates to deps.gitFetch with the given options', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    let received: unknown
    deps.gitFetch = async (opts) => {
      received = opts
    }
    const ctx = makeCtx(deps, runtime)
    await ctx.git.fetch({ cwd: 'C:/wt', remote: 'origin', branch: 'main' })
    expect(received).toEqual({ cwd: 'C:/wt', remote: 'origin', branch: 'main' })
  })

  it('propagates a git fetch error', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    deps.gitFetch = async () => {
      throw new Error('git fetch failed')
    }
    const ctx = makeCtx(deps, runtime)
    await expect(ctx.git.fetch({ cwd: 'C:/wt' })).rejects.toThrow(/git fetch failed/)
  })
})

describe('ctx.ado.getTask (WF2-08)', () => {
  it('throws when the parent fetch reports an auth failure', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    deps.ado.getWorkItemWithRelations = async () => ({
      ok: false,
      reason: 'auth',
      error: 'run az login'
    })
    const ctx = makeCtx(deps, runtime)
    await expect(ctx.ado.getTask(REF)).rejects.toThrow(/az login/)
  })

  it('throws when the child batch reports an auth failure', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    deps.ado.getWorkItemWithRelations = async () => ({
      ok: true,
      item: { title: 'P', type: 'Task', state: 'Active' },
      childRefs: [{ id: 2, org: 'o', project: 'p' }]
    })
    deps.ado.getWorkItems = async () => ({ ok: false, reason: 'auth', error: 'token rejected' })
    const ctx = makeCtx(deps, runtime)
    await expect(ctx.ado.getTask(REF)).rejects.toThrow(/token rejected/)
  })

  it('composes the task plus its resolved child tasks on success', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    const child1: WorkItemRef = { id: 11, org: 'o', project: 'p' }
    const child2: WorkItemRef = { id: 12, org: 'o', project: 'p' }
    deps.ado.getWorkItemWithRelations = async () => ({
      ok: true,
      item: { title: 'Parent', type: 'Task', state: 'Active' },
      childRefs: [child1, child2]
    })
    const details = new Map([
      [refKey(child1), { title: 'C1', type: 'Task', state: 'New' }],
      [refKey(child2), { title: 'C2', type: 'Task', state: 'Done' }]
    ])
    let batchedRefs: WorkItemRef[] | undefined
    deps.ado.getWorkItems = async (refs) => {
      batchedRefs = refs
      return { ok: true, details }
    }
    const ctx = makeCtx(deps, runtime)
    const result = await ctx.ado.getTask(REF)
    expect(result.task).toEqual({ title: 'Parent', type: 'Task', state: 'Active' })
    expect(batchedRefs).toEqual([child1, child2])
    expect(result.children).toEqual([
      { ref: child1, details: { title: 'C1', type: 'Task', state: 'New' } },
      { ref: child2, details: { title: 'C2', type: 'Task', state: 'Done' } }
    ])
  })
})

describe('ctx.notify (WF2-09)', () => {
  it('emits a log line and does not toast by default', async () => {
    const deps = makeDeps()
    const { runtime, logs } = makeRuntime()
    const notifierCalls: Array<{ title: string; message: string }> = []
    deps.notifier = (title, message) => notifierCalls.push({ title, message })
    const ctx = makeCtx(deps, runtime)
    await ctx.notify('hello')
    expect(logs.map((l) => l.message)).toContain('hello')
    expect(notifierCalls).toEqual([])
  })

  it('also fires the native notifier when toast is set', async () => {
    const deps = makeDeps()
    const { runtime, logs } = makeRuntime()
    const notifierCalls: Array<{ title: string; message: string }> = []
    deps.notifier = (title, message) => notifierCalls.push({ title, message })
    const ctx = makeCtx(deps, runtime)
    await ctx.notify('done', { toast: true })
    expect(logs.map((l) => l.message)).toContain('done')
    expect(notifierCalls).toHaveLength(1)
    expect(notifierCalls[0].message).toBe('done')
  })
})

describe('ctx.log / ctx.step (WF2-10)', () => {
  it('log emits exactly one log line with the message', async () => {
    const deps = makeDeps()
    const { runtime, logs } = makeRuntime()
    const ctx = makeCtx(deps, runtime)
    await ctx.log('working')
    expect(logs).toEqual([{ message: 'working', group: undefined }])
  })

  it('step opens a labeled group, nests child events under it, then pops it', async () => {
    const deps = makeDeps()
    const { runtime, steps, logs } = makeRuntime()
    const ctx = makeCtx(deps, runtime)
    await ctx.step('build', async () => {
      await ctx.log('inside')
    })
    await ctx.log('after')
    expect(steps.some((s) => s.label === 'build' && s.group === undefined)).toBe(true)
    expect(logs.find((l) => l.message === 'inside')?.group).toBe('build')
    expect(logs.find((l) => l.message === 'after')?.group).toBeUndefined()
  })
})

describe('ctx.input (WF2-11)', () => {
  it('exposes the trigger input as a frozen object', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime({ ticket: '123' })
    const ctx = makeCtx(deps, runtime)
    expect(ctx.input).toEqual({ ticket: '123' })
    expect(Object.isFrozen(ctx.input)).toBe(true)
    expect(() => {
      ;(ctx.input as Record<string, string>).ticket = 'x'
    }).toThrow()
  })
})

describe('auto-logging + cancellation (WF2-10 / WF2-14)', () => {
  it('every action primitive auto-emits a step-started labeled with its name', async () => {
    const deps = makeDeps()
    const { runtime, steps } = makeRuntime()
    const ctx = makeCtx(deps, runtime)
    await ctx.worktree.create('C:/r', 'b')
    await ctx.worktree.remove('C:/r', 'C:/w')
    await ctx.worktree.changedFiles('C:/w')
    await ctx.sh('echo', { cwd: 'C:/x' })
    await ctx.git.fetch({ cwd: 'C:/x' })
    await ctx.ado.getTask(REF)
    await ctx.notify('n')
    expect(steps.map((s) => s.label)).toEqual(
      expect.arrayContaining([
        'worktree.create',
        'worktree.remove',
        'worktree.changedFiles',
        'sh',
        'git.fetch',
        'ado.getTask',
        'notify'
      ])
    )
  })

  it('a set cancellation token makes the next ctx.* throw before running or emitting', async () => {
    const deps = makeDeps()
    const { runtime, steps, cancel } = makeRuntime()
    let ran = false
    deps.runShell = async () => {
      ran = true
      return { code: 0, stdout: '', stderr: '' }
    }
    const ctx = makeCtx(deps, runtime)
    cancel()
    await expect(ctx.sh('echo', { cwd: 'C:/x' })).rejects.toBeInstanceOf(CancellationError)
    expect(ran).toBe(false)
    expect(steps).toEqual([])
  })

  it('cancellation also halts ctx.log at its checkpoint', async () => {
    const deps = makeDeps()
    const { runtime, logs, cancel } = makeRuntime()
    const ctx = makeCtx(deps, runtime)
    cancel()
    await expect(ctx.log('x')).rejects.toBeInstanceOf(CancellationError)
    expect(logs).toEqual([])
  })
})

/** A recording fake for the injected `agent` capability. */
function fakeAgent(result: AgentResult): {
  agent: NonNullable<CtxDeps['agent']>
  calls: Array<{ opts: AgentStepOptions; signal?: AbortSignal; onBlocked?: BlockedResolver }>
} {
  const calls: Array<{
    opts: AgentStepOptions
    signal?: AbortSignal
    onBlocked?: BlockedResolver
  }> = []
  return {
    agent: {
      async run(opts, signal, onBlocked) {
        calls.push({ opts, signal, onBlocked })
        return result
      }
    },
    calls
  }
}

const AGENT_OPTS: AgentStepOptions = {
  prompt: 'review this diff',
  expect: { type: 'object' },
  cwd: 'C:/wt'
}

describe('ctx.agent (WF3-01 / WF3-16 / WF3-19)', () => {
  it('delegates to deps.agent.run with (opts, runtime.signal) and returns its result', async () => {
    const deps = makeDeps()
    const controller = new AbortController()
    const { runtime } = makeRuntime({}, controller.signal)
    const result: AgentResult = { status: 'done', data: { findings: [] }, sessionId: 'sess-1' }
    const { agent, calls } = fakeAgent(result)
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)

    const returned = await ctx.agent(AGENT_OPTS)

    expect(returned).toBe(result)
    expect(calls).toHaveLength(1)
    expect(calls[0].opts).toBe(AGENT_OPTS)
    expect(calls[0].signal).toBe(controller.signal)
  })

  it('returns a blocked result verbatim (ctx does not transform it) (WF3-17)', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    const blocked: AgentResult = {
      status: 'blocked',
      question: 'Which branch should I target?',
      sessionId: 'sess-b'
    }
    const { agent } = fakeAgent(blocked)
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)

    const returned = await ctx.agent(AGENT_OPTS)

    expect(returned).toEqual({
      status: 'blocked',
      question: 'Which branch should I target?',
      sessionId: 'sess-b'
    })
  })

  it('auto-emits a step-started labeled "agent" of kind agent (WF3-19)', async () => {
    const deps = makeDeps()
    const { runtime, steps } = makeRuntime()
    const { agent } = fakeAgent({ status: 'done', sessionId: 'sess-1' })
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)

    await ctx.agent(AGENT_OPTS)

    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ stepId: 0, label: 'agent', kind: 'agent', group: undefined })
  })

  it('records the returned sessionId on a step-logged event via emitLog (WF3-16)', async () => {
    const deps = makeDeps()
    const { runtime, logs } = makeRuntime()
    const { agent } = fakeAgent({ status: 'done', data: {}, sessionId: 'sess-xyz-42' })
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)

    await ctx.agent(AGENT_OPTS)

    const sessionLog = logs.find((l) => l.sessionId !== undefined)
    expect(sessionLog?.sessionId).toBe('sess-xyz-42')
    expect(sessionLog?.message).toContain('sess-xyz-42')
  })

  it('checks cancellation before spawning: a cancelled run throws and never delegates (WF3-19)', async () => {
    const deps = makeDeps()
    const { runtime, steps, cancel } = makeRuntime()
    const { agent, calls } = fakeAgent({ status: 'done', sessionId: 'sess-1' })
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)
    cancel()

    await expect(ctx.agent(AGENT_OPTS)).rejects.toBeInstanceOf(CancellationError)
    expect(calls).toEqual([])
    expect(steps).toEqual([])
  })

  it('passes permission through as-is; ctx does not default it (default resolved downstream)', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime()
    const { agent, calls } = fakeAgent({ status: 'done', sessionId: 'sess-1' })
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)

    await ctx.agent({ prompt: 'p', expect: { type: 'object' }, cwd: 'C:/x' })

    expect(calls[0].opts.permission).toBeUndefined()
  })

  it('wires onBlocked to runtime.requestInput so a blocked agent pauses via the manager (WF4-01)', async () => {
    const deps = makeDeps()
    const decision: RespondDecision = { action: 'guidance', guidance: 'do X' }
    const { runtime, asks, reqSessions } = makeRuntime({}, undefined, async () => decision)
    const { agent, calls } = fakeAgent({ status: 'done', data: {}, sessionId: 's1' })
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)

    await ctx.agent(AGENT_OPTS)

    // ctx.agent passed a 3rd onBlocked arg that delegates to runtime.requestInput.
    const onBlocked = calls[0].onBlocked
    expect(onBlocked).toBeTypeOf('function')
    const q: BlockerQuestion = { title: 'Agent needs input', body: 'which env?' }
    await expect(onBlocked!(q, 's1')).resolves.toEqual(decision)
    expect(asks).toEqual([q])
    // WHF-07: the agent's sessionId is forwarded through requestInput.
    expect(reqSessions).toEqual(['s1'])
  })
})

describe('ctx.ask (WF4-11 / WF4-12)', () => {
  it('delegates to runtime.requestInput with { title, body } and returns the decision as-is', async () => {
    const deps = makeDeps()
    const decision: RespondDecision = { action: 'guidance', guidance: 'use main' }
    const { runtime, asks } = makeRuntime({}, undefined, async () => decision)
    const ctx = makeCtx(deps, runtime)

    const got = await ctx.ask({ title: 'Pick a branch', body: 'which one?' })

    expect(got).toBe(decision)
    expect(asks).toEqual([{ title: 'Pick a branch', body: 'which one?' }])
  })

  it('resolves an abort decision WITHOUT throwing (WF4-11)', async () => {
    const deps = makeDeps()
    const { runtime } = makeRuntime({}, undefined, async () => ({ action: 'abort' }))
    const ctx = makeCtx(deps, runtime)
    await expect(ctx.ask({ title: 't', body: 'b' })).resolves.toEqual({ action: 'abort' })
  })

  it('auto-emits a step-started labeled "ask" of kind ask (WF4-12)', async () => {
    const deps = makeDeps()
    const { runtime, steps } = makeRuntime({}, undefined, async () => ({ action: 'abort' }))
    const ctx = makeCtx(deps, runtime)
    await ctx.ask({ title: 't', body: 'b' })
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ stepId: 0, label: 'ask', kind: 'ask', group: undefined })
  })

  it('checks cancellation before asking: a cancelled run throws and never requests input (WF4-12)', async () => {
    const deps = makeDeps()
    const { runtime, asks, steps, cancel } = makeRuntime({}, undefined, async () => ({
      action: 'abort'
    }))
    const ctx = makeCtx(deps, runtime)
    cancel()
    await expect(ctx.ask({ title: 't', body: 'b' })).rejects.toBeInstanceOf(CancellationError)
    expect(asks).toEqual([])
    expect(steps).toEqual([])
  })
})

describe('instrument start/finish seam (WHF-01/02/05/06)', () => {
  it('stamps each primitive with its semantic stepKind', async () => {
    const deps = makeDeps()
    const { runtime, steps } = makeRuntime()
    const { agent } = fakeAgent({ status: 'done', data: {}, sessionId: 's' })
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)

    await ctx.worktree.create('r', 'b')
    await ctx.worktree.remove('r', 'w')
    await ctx.worktree.changedFiles('w')
    await ctx.sh('echo', { cwd: 'x' })
    await ctx.git.fetch({ cwd: 'x' })
    await ctx.ado.getTask(REF)
    await ctx.notify('n')
    await ctx.agent(AGENT_OPTS)

    const kindByLabel = Object.fromEntries(steps.map((s) => [s.label, s.kind]))
    expect(kindByLabel).toEqual({
      'worktree.create': 'worktree',
      'worktree.remove': 'worktree',
      'worktree.changedFiles': 'worktree',
      sh: 'sh',
      'git.fetch': 'git',
      'ado.getTask': 'ado',
      notify: 'notify',
      agent: 'agent'
    })
  })

  it('assigns monotonic stepIds and finishes each with its matching id', async () => {
    const deps = makeDeps()
    const { runtime, steps, finishes } = makeRuntime()
    const ctx = makeCtx(deps, runtime)

    await ctx.sh('a', { cwd: 'x' })
    await ctx.sh('b', { cwd: 'x' })
    await ctx.sh('c', { cwd: 'x' })

    expect(steps.map((s) => s.stepId)).toEqual([0, 1, 2])
    expect(finishes.map((f) => f.stepId)).toEqual([0, 1, 2])
  })

  it('opens the step before the call and closes it only after the call resolves', async () => {
    const deps = makeDeps()
    const { runtime, steps, finishes } = makeRuntime()
    let startedAtCall = -1
    let finishedAtCall = -1
    deps.runShell = async () => {
      startedAtCall = steps.length
      finishedAtCall = finishes.length
      return { code: 0, stdout: '', stderr: '' }
    }
    const ctx = makeCtx(deps, runtime)

    await ctx.sh('x', { cwd: 'y' })

    expect(startedAtCall).toBe(1) // step-started emitted before the call ran
    expect(finishedAtCall).toBe(0) // not yet finished while the call was in flight
    expect(finishes).toHaveLength(1) // finished after it resolved
  })

  it('finishes ok:true on resolve and ok:false (then rethrows) on throw', async () => {
    const deps = makeDeps()
    const { runtime, finishes } = makeRuntime()
    const ctx = makeCtx(deps, runtime)

    await ctx.sh('ok', { cwd: 'x' })
    expect(finishes.at(-1)?.ok).toBe(true)

    deps.gitFetch = async () => {
      throw new Error('boom')
    }
    await expect(ctx.git.fetch({ cwd: 'x' })).rejects.toThrow(/boom/)
    expect(finishes.at(-1)?.ok).toBe(false)
  })

  it('carries the agent prompt + permission on start, defaulting permission to read', async () => {
    const deps = makeDeps()
    const { runtime, steps } = makeRuntime()
    const { agent } = fakeAgent({ status: 'done', data: {}, sessionId: 's' })
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)

    await ctx.agent({ prompt: 'do it', expect: { type: 'object' }, cwd: 'x' })

    const start = steps.find((s) => s.kind === 'agent')
    expect(start?.agent).toEqual({ prompt: 'do it', permission: 'read' })
  })

  it('passes an explicit agent permission through on start', async () => {
    const deps = makeDeps()
    const { runtime, steps } = makeRuntime()
    const { agent } = fakeAgent({ status: 'done', data: {}, sessionId: 's' })
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)

    await ctx.agent({ prompt: 'p', expect: { type: 'object' }, cwd: 'x', permission: 'write' })

    const start = steps.find((s) => s.kind === 'agent')
    expect(start?.agent).toEqual({ prompt: 'p', permission: 'write' })
  })

  it('carries the validated agent result envelope on finish', async () => {
    const deps = makeDeps()
    const { runtime, finishes } = makeRuntime()
    const { agent } = fakeAgent({ status: 'done', data: { summary: 'ok' }, sessionId: 'sess-9' })
    deps.agent = agent
    const ctx = makeCtx(deps, runtime)

    await ctx.agent(AGENT_OPTS)

    const finish = finishes.find((f) => f.agentResult)
    expect(finish?.agentResult).toEqual({
      status: 'done',
      data: { summary: 'ok' },
      sessionId: 'sess-9'
    })
  })

  it('extracts the ado detail payload (task + children details) on finish', async () => {
    const deps = makeDeps()
    const { runtime, finishes } = makeRuntime()
    const child1: WorkItemRef = { id: 11, org: 'o', project: 'p' }
    const child2: WorkItemRef = { id: 12, org: 'o', project: 'p' }
    deps.ado.getWorkItemWithRelations = async () => ({
      ok: true,
      item: { title: 'Parent', type: 'Task', state: 'Active' },
      childRefs: [child1, child2]
    })
    deps.ado.getWorkItems = async () => ({
      ok: true,
      details: new Map([
        [refKey(child1), { title: 'C1', type: 'Task', state: 'New' }],
        [refKey(child2), { title: 'C2', type: 'Task', state: 'Done' }]
      ])
    })
    const ctx = makeCtx(deps, runtime)

    await ctx.ado.getTask(REF)

    const finish = finishes.find((f) => f.detail?.kind === 'ado')
    expect(finish?.detail).toEqual({
      kind: 'ado',
      task: { title: 'Parent', type: 'Task', state: 'Active' },
      children: [
        { title: 'C1', type: 'Task', state: 'New' },
        { title: 'C2', type: 'Task', state: 'Done' }
      ]
    })
  })

  it('extracts the changed-files detail payload on finish', async () => {
    const deps = makeDeps()
    const files = [{ path: 'a.ts', status: 'modified' as const }]
    deps.worktree.changedFiles = async () => files
    const { runtime, finishes } = makeRuntime()
    const ctx = makeCtx(deps, runtime)

    await ctx.worktree.changedFiles('w')

    const finish = finishes.find((f) => f.detail?.kind === 'files')
    expect(finish?.detail).toEqual({ kind: 'files', files })
  })

  it('brackets ctx.step as a group step (kind group) around its nested children', async () => {
    const deps = makeDeps()
    const { runtime, steps, finishes } = makeRuntime()
    const ctx = makeCtx(deps, runtime)

    await ctx.step('phase', async () => {
      await ctx.sh('inner', { cwd: 'x' })
    })

    const group = steps.find((s) => s.label === 'phase')
    expect(group?.kind).toBe('group')
    // The nested child records the group LABEL as its parent group.
    expect(steps.find((s) => s.label === 'sh')?.group).toBe('phase')
    // The group itself finished ok.
    expect(finishes.some((f) => f.stepId === group?.stepId && f.ok === true)).toBe(true)
  })

  it('finishes ctx.step with ok:false and rethrows when its body throws', async () => {
    const deps = makeDeps()
    const { runtime, steps, finishes } = makeRuntime()
    const ctx = makeCtx(deps, runtime)

    await expect(
      ctx.step('phase', async () => {
        throw new Error('inner boom')
      })
    ).rejects.toThrow(/inner boom/)

    const group = steps.find((s) => s.label === 'phase')
    expect(finishes.find((f) => f.stepId === group?.stepId)?.ok).toBe(false)
  })
})
