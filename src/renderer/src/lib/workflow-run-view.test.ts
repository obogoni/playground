import { describe, expect, it } from 'vitest'
import type { StepEvent } from '../../../shared/workflows'
import { foldRunEvent, type RunView } from './workflow-run-view'

const stepEvent = (over: Partial<StepEvent> = {}): StepEvent => ({
  seq: 0,
  kind: 'step-started',
  ...over
})

describe('foldRunEvent — status', () => {
  it('creates a run defensively for an unknown runId', () => {
    const runs = foldRunEvent([], { type: 'status', runId: 'r1', status: 'running' })
    expect(runs).toEqual([{ runId: 'r1', status: 'running', timeline: [], blocked: undefined }])
  })

  it('updates the status of an existing run', () => {
    const start: RunView[] = [{ runId: 'r1', status: 'running', timeline: [] }]
    const runs = foldRunEvent(start, { type: 'status', runId: 'r1', status: 'done' })
    expect(runs[0].status).toBe('done')
  })

  it('is idempotent on a repeated status value', () => {
    let runs = foldRunEvent([], { type: 'status', runId: 'r1', status: 'running' })
    runs = foldRunEvent(runs, { type: 'status', runId: 'r1', status: 'running' })
    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('running')
  })

  it('clears a standing blocked question on resume (status → running)', () => {
    const blocked: RunView[] = [
      { runId: 'r1', status: 'blocked', timeline: [], blocked: { title: 'Q', body: 'B' } }
    ]
    const runs = foldRunEvent(blocked, { type: 'status', runId: 'r1', status: 'running' })
    expect(runs[0].blocked).toBeUndefined()
    expect(runs[0].status).toBe('running')
  })

  it('clears a standing blocked question on a terminal status (cancelled)', () => {
    const blocked: RunView[] = [
      { runId: 'r1', status: 'blocked', timeline: [], blocked: { title: 'Q', body: 'B' } }
    ]
    const runs = foldRunEvent(blocked, { type: 'status', runId: 'r1', status: 'cancelled' })
    expect(runs[0].blocked).toBeUndefined()
    expect(runs[0].status).toBe('cancelled')
  })

  it('preserves a blocked question when status becomes blocked (question arrives next)', () => {
    const running: RunView[] = [
      { runId: 'r1', status: 'running', timeline: [], blocked: { title: 'old', body: 'x' } }
    ]
    const runs = foldRunEvent(running, { type: 'status', runId: 'r1', status: 'blocked' })
    expect(runs[0].blocked).toEqual({ title: 'old', body: 'x' })
    expect(runs[0].status).toBe('blocked')
  })
})

describe('foldRunEvent — timeline', () => {
  it('appends a step row with label and group', () => {
    const runs = foldRunEvent([{ runId: 'r1', status: 'running', timeline: [] }], {
      type: 'step',
      runId: 'r1',
      step: stepEvent({ label: 'create worktree', group: 'g1' })
    })
    expect(runs[0].timeline).toEqual([{ kind: 'step', label: 'create worktree', group: 'g1' }])
  })

  it('appends a log row with message and group', () => {
    const runs = foldRunEvent([{ runId: 'r1', status: 'running', timeline: [] }], {
      type: 'log',
      runId: 'r1',
      message: 'fetching',
      group: 'g1'
    })
    expect(runs[0].timeline).toEqual([{ kind: 'log', message: 'fetching', group: 'g1' }])
  })

  it('preserves arrival order across interleaved step and log events', () => {
    let runs: RunView[] = [{ runId: 'r1', status: 'running', timeline: [] }]
    runs = foldRunEvent(runs, { type: 'step', runId: 'r1', step: stepEvent({ label: 'A' }) })
    runs = foldRunEvent(runs, { type: 'log', runId: 'r1', message: 'a-log' })
    runs = foldRunEvent(runs, { type: 'step', runId: 'r1', step: stepEvent({ label: 'B' }) })
    expect(runs[0].timeline).toEqual([
      { kind: 'step', label: 'A', group: undefined },
      { kind: 'log', message: 'a-log', group: undefined },
      { kind: 'step', label: 'B', group: undefined }
    ])
  })
})

describe('foldRunEvent — blocked', () => {
  it('sets the blocked question on the run', () => {
    const runs = foldRunEvent([{ runId: 'r1', status: 'blocked', timeline: [] }], {
      type: 'blocked',
      runId: 'r1',
      question: { title: 'Proceed?', body: 'The agent needs input' }
    })
    expect(runs[0].blocked).toEqual({ title: 'Proceed?', body: 'The agent needs input' })
  })
})

describe('foldRunEvent — isolation & defensiveness', () => {
  it('creates a run for an unknown runId on a step event (never throws)', () => {
    const runs = foldRunEvent([], {
      type: 'step',
      runId: 'ghost',
      step: stepEvent({ label: 'x' })
    })
    expect(runs[0].runId).toBe('ghost')
    expect(runs[0].timeline).toEqual([{ kind: 'step', label: 'x', group: undefined }])
  })

  it('folds an event for one run without touching the others', () => {
    const start: RunView[] = [
      { runId: 'r1', status: 'running', timeline: [{ kind: 'log', message: 'keep' }] },
      { runId: 'r2', status: 'running', timeline: [] }
    ]
    const runs = foldRunEvent(start, { type: 'status', runId: 'r2', status: 'done' })
    expect(runs.find((r) => r.runId === 'r1')).toEqual(start[0])
    expect(runs.find((r) => r.runId === 'r2')?.status).toBe('done')
  })
})
