import { describe, expect, it } from 'vitest'
import type { StepEvent, WorkflowRun } from '../shared/workflows'
import { initialRun, reduce } from './run-state'

let seq = 0
const ev = (e: Omit<StepEvent, 'seq'>): StepEvent => ({ seq: seq++, ...e })

const pending = (): WorkflowRun => initialRun('run-1', 'wf-1', { key: 'value' })
const running = (): WorkflowRun => reduce(pending(), ev({ kind: 'run-started' }))
const blocked = (): WorkflowRun =>
  reduce(running(), ev({ kind: 'blocked', question: { title: 'Q', body: 'ask' } }))

describe('initialRun', () => {
  it('starts a run in pending with its identity, input, and no events', () => {
    const run = initialRun('run-1', 'wf-1', { a: '1' })
    expect(run.status).toBe('pending')
    expect(run.runId).toBe('run-1')
    expect(run.workflowId).toBe('wf-1')
    expect(run.input).toEqual({ a: '1' })
    expect(run.events).toEqual([])
  })

  it('is clock-free: startedAt is left empty for the manager to stamp', () => {
    expect(initialRun('run-1', 'wf-1', {}).startedAt).toBe('')
    expect(initialRun('run-1', 'wf-1', {}).finishedAt).toBeUndefined()
  })
})

describe('reduce — valid transitions', () => {
  it('pending → running on run-started, appending the event', () => {
    const e = ev({ kind: 'run-started' })
    const next = reduce(pending(), e)
    expect(next.status).toBe('running')
    expect(next.events).toEqual([e])
  })

  it('running → running on step-started, appending the event', () => {
    const e = ev({ kind: 'step-started', label: 'sh' })
    const next = reduce(running(), e)
    expect(next.status).toBe('running')
    expect(next.events.at(-1)).toEqual(e)
    expect(next.events).toHaveLength(2)
  })

  it('running → running on step-logged, appending the event', () => {
    const e = ev({ kind: 'step-logged', message: 'hello' })
    const next = reduce(running(), e)
    expect(next.status).toBe('running')
    expect(next.events.at(-1)).toEqual(e)
  })

  it('running → done on done, appending the event', () => {
    const e = ev({ kind: 'done' })
    const next = reduce(running(), e)
    expect(next.status).toBe('done')
    expect(next.events.at(-1)).toEqual(e)
  })

  it('running → failed on failed, capturing error/stdout/code', () => {
    const e = ev({ kind: 'failed', error: 'boom', stdout: 'partial output', code: 2 })
    const next = reduce(running(), e)
    expect(next.status).toBe('failed')
    expect(next.error).toBe('boom')
    const last = next.events.at(-1)
    expect(last?.stdout).toBe('partial output')
    expect(last?.code).toBe(2)
  })

  it('running → cancelled on cancelled, appending the event', () => {
    const e = ev({ kind: 'cancelled' })
    const next = reduce(running(), e)
    expect(next.status).toBe('cancelled')
    expect(next.events.at(-1)).toEqual(e)
  })
})

describe('reduce — blocked/resumed/cancelled transitions (WF4-06)', () => {
  it('running → blocked on blocked, appending the event with question intact', () => {
    const q = { title: 'Agent needs input', body: 'which branch?' }
    const e = ev({ kind: 'blocked', question: q })
    const next = reduce(running(), e)
    expect(next.status).toBe('blocked')
    expect(next.events.at(-1)).toEqual(e)
    expect(next.events.at(-1)?.question).toEqual(q)
  })

  it('blocked → running on resumed, appending the event', () => {
    const e = ev({ kind: 'resumed' })
    const next = reduce(blocked(), e)
    expect(next.status).toBe('running')
    expect(next.events.at(-1)).toEqual(e)
  })

  it('blocked → cancelled on cancelled, appending the event', () => {
    const e = ev({ kind: 'cancelled' })
    const next = reduce(blocked(), e)
    expect(next.status).toBe('cancelled')
    expect(next.events.at(-1)).toEqual(e)
  })

  it('drives the abort sequence running → blocked → running → cancelled in order', () => {
    const b = blocked()
    const resumed = reduce(b, ev({ kind: 'resumed' }))
    const cancelled = reduce(resumed, ev({ kind: 'cancelled' }))
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.events.map((e) => e.kind)).toEqual([
      'run-started',
      'blocked',
      'resumed',
      'cancelled'
    ])
  })

  it('is non-terminal: a step-started/step-logged/done/failed while blocked is a guarded no-op', () => {
    const b = blocked()
    expect(reduce(b, ev({ kind: 'step-started', label: 'x' }))).toBe(b)
    expect(reduce(b, ev({ kind: 'step-logged', message: 'y' }))).toBe(b)
    expect(reduce(b, ev({ kind: 'done' }))).toBe(b)
    expect(reduce(b, ev({ kind: 'failed', error: 'z' }))).toBe(b)
    expect(b.status).toBe('blocked')
  })

  it('ignores blocked while still running-less (pending) and resumed while running', () => {
    const p = pending()
    expect(reduce(p, ev({ kind: 'blocked', question: { title: 't', body: 'b' } }))).toBe(p)
    const r = running()
    expect(reduce(r, ev({ kind: 'resumed' }))).toBe(r)
  })

  it('a terminal run ignores blocked and resumed', () => {
    const done = reduce(running(), ev({ kind: 'done' }))
    expect(reduce(done, ev({ kind: 'blocked', question: { title: 't', body: 'b' } }))).toBe(done)
    expect(reduce(done, ev({ kind: 'resumed' }))).toBe(done)
  })
})

describe('reduce — guarded (invalid) transitions return the run unchanged', () => {
  it('ignores an out-of-order done while still pending', () => {
    const run = pending()
    const next = reduce(run, ev({ kind: 'done' }))
    expect(next).toBe(run)
    expect(next.status).toBe('pending')
    expect(next.events).toEqual([])
  })

  it('ignores a step-started while still pending', () => {
    const run = pending()
    expect(reduce(run, ev({ kind: 'step-started', label: 'x' }))).toBe(run)
  })

  it('ignores a second run-started once already running', () => {
    const run = running()
    const next = reduce(run, ev({ kind: 'run-started' }))
    expect(next).toBe(run)
    expect(next.status).toBe('running')
  })

  it('ignores any event after a done terminal status', () => {
    const done = reduce(running(), ev({ kind: 'done' }))
    expect(reduce(done, ev({ kind: 'step-logged', message: 'late' }))).toBe(done)
    expect(reduce(done, ev({ kind: 'failed', error: 'late' }))).toBe(done)
  })

  it('ignores any event after a failed terminal status', () => {
    const failed = reduce(running(), ev({ kind: 'failed', error: 'x' }))
    expect(reduce(failed, ev({ kind: 'step-started', label: 'late' }))).toBe(failed)
  })

  it('ignores any event after a cancelled terminal status', () => {
    const cancelled = reduce(running(), ev({ kind: 'cancelled' }))
    expect(reduce(cancelled, ev({ kind: 'done' }))).toBe(cancelled)
  })
})

describe('reduce — step-finished fold (WHF-03)', () => {
  it('appends step-finished when running, clock-free, with no status change', () => {
    const e = ev({ kind: 'step-finished', stepId: 1, durationMs: 1400, ok: true })
    const next = reduce(running(), e)
    expect(next.status).toBe('running')
    expect(next.events.at(-1)).toEqual(e)
    expect(next.events.at(-1)?.durationMs).toBe(1400)
    expect(next.events).toHaveLength(2)
  })

  it('ignores step-finished while still pending (before run-started)', () => {
    const run = pending()
    const next = reduce(run, ev({ kind: 'step-finished', stepId: 1, durationMs: 5, ok: true }))
    expect(next).toBe(run)
    expect(next.status).toBe('pending')
    expect(next.events).toEqual([])
  })

  it('ignores step-finished after a terminal status (done/failed/cancelled)', () => {
    const done = reduce(running(), ev({ kind: 'done' }))
    expect(reduce(done, ev({ kind: 'step-finished', stepId: 1, durationMs: 5, ok: true }))).toBe(
      done
    )
    const failed = reduce(running(), ev({ kind: 'failed', error: 'x' }))
    expect(reduce(failed, ev({ kind: 'step-finished', stepId: 2, durationMs: 5, ok: false }))).toBe(
      failed
    )
    const cancelled = reduce(running(), ev({ kind: 'cancelled' }))
    expect(reduce(cancelled, ev({ kind: 'step-finished', stepId: 3, durationMs: 5 }))).toBe(
      cancelled
    )
  })

  it('preserves order: step-started then step-finished append in sequence', () => {
    const started = ev({ kind: 'step-started', label: 'sh', stepId: 7, stepKind: 'sh' })
    const finished = ev({ kind: 'step-finished', stepId: 7, durationMs: 52000, ok: true })
    const next = reduce(reduce(running(), started), finished)
    expect(next.events.map((e) => e.kind)).toEqual(['run-started', 'step-started', 'step-finished'])
    expect(next.events.map((e) => e.stepId)).toEqual([undefined, 7, 7])
  })
})

describe('reduce — sessionId pass-through (WF3-16)', () => {
  it('appends a step-logged event carrying sessionId with the field intact', () => {
    const e = ev({ kind: 'step-logged', message: 'agent session s-1', sessionId: 'sess-abc123' })
    const next = reduce(running(), e)
    expect(next.status).toBe('running')
    const last = next.events.at(-1)
    expect(last?.sessionId).toBe('sess-abc123')
    expect(last?.message).toBe('agent session s-1')
    expect(last?.kind).toBe('step-logged')
  })

  it('leaves sessionId undefined on a step-logged event without one (no fabrication)', () => {
    const e = ev({ kind: 'step-logged', message: 'plain log' })
    const next = reduce(running(), e)
    expect(next.events.at(-1)?.sessionId).toBeUndefined()
  })
})

describe('reduce — purity', () => {
  it('never mutates the input run on a valid transition', () => {
    const run = running()
    const before = run.events.length
    reduce(run, ev({ kind: 'step-started', label: 'x' }))
    expect(run.events).toHaveLength(before)
    expect(run.status).toBe('running')
  })
})
