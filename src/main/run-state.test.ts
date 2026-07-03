import { describe, expect, it } from 'vitest'
import type { StepEvent } from '../shared/workflows'
import { initialRun, reduce } from './run-state'

let seq = 0
const ev = (e: Omit<StepEvent, 'seq'>): StepEvent => ({ seq: seq++, ...e })

const pending = () => initialRun('run-1', 'wf-1', { key: 'value' })
const running = () => reduce(pending(), ev({ kind: 'run-started' }))

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

describe('reduce — purity', () => {
  it('never mutates the input run on a valid transition', () => {
    const run = running()
    const before = run.events.length
    reduce(run, ev({ kind: 'step-started', label: 'x' }))
    expect(run.events).toHaveLength(before)
    expect(run.status).toBe('running')
  })
})
