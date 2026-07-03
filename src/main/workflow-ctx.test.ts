import { describe, expect, it } from 'vitest'
import { refKey, type WorkItemRef } from './ado-gateway'
import { CancellationError, makeCtx, type CtxDeps, type CtxRuntime } from './workflow-ctx'

interface StepRec {
  label: string
  group?: string
}
interface LogRec {
  message: string
  group?: string
}

function makeRuntime(input: Record<string, string> = {}): {
  runtime: CtxRuntime
  steps: StepRec[]
  logs: LogRec[]
  cancel: () => void
} {
  const steps: StepRec[] = []
  const logs: LogRec[] = []
  let cancelled = false
  const runtime: CtxRuntime = {
    checkCancel() {
      if (cancelled) throw new CancellationError()
    },
    emitStep(label, group) {
      steps.push({ label, group })
    },
    emitLog(message, group) {
      logs.push({ message, group })
    },
    input
  }
  return { runtime, steps, logs, cancel: () => (cancelled = true) }
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
