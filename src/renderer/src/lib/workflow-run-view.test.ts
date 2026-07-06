import { describe, expect, it } from 'vitest'
import type { StepEvent } from '../../../shared/workflows'
import {
  foldRunEvent,
  groupRollup,
  stepStatus,
  type RunView,
  type StepNode
} from './workflow-run-view'

const stepEvent = (over: Partial<StepEvent> = {}): StepEvent => ({
  seq: 0,
  kind: 'step-started',
  ...over
})

const node = (over: Partial<StepNode> = {}): StepNode => ({
  stepId: 0,
  kind: 'sh',
  label: 'step',
  finished: false,
  ...over
})

const run = (over: Partial<RunView> = {}): RunView => ({
  runId: 'r1',
  status: 'running',
  input: {},
  steps: [],
  logs: [],
  timeline: [],
  ...over
})

describe('foldRunEvent — run-started', () => {
  it('seeds workflowId, input and startedAt and sets status running', () => {
    const runs = foldRunEvent([], {
      type: 'run-started',
      runId: 'r1',
      workflowId: 'implement-ticket',
      input: { branch: 'feat/x' },
      startedAt: '2026-07-06T10:00:00.000Z'
    })
    expect(runs[0]).toMatchObject({
      runId: 'r1',
      workflowId: 'implement-ticket',
      input: { branch: 'feat/x' },
      startedAt: '2026-07-06T10:00:00.000Z',
      status: 'running'
    })
  })

  it('updates an already-seen run in place (idempotent, no duplicate row)', () => {
    let runs = foldRunEvent([], {
      type: 'run-started',
      runId: 'r1',
      workflowId: 'wf',
      input: {},
      startedAt: 't0'
    })
    runs = foldRunEvent(runs, {
      type: 'run-started',
      runId: 'r1',
      workflowId: 'wf',
      input: { a: '1' },
      startedAt: 't1'
    })
    expect(runs).toHaveLength(1)
    expect(runs[0].input).toEqual({ a: '1' })
  })
})

describe('foldRunEvent — status', () => {
  it('creates a run defensively for an unknown runId', () => {
    const runs = foldRunEvent([], { type: 'status', runId: 'r1', status: 'running' })
    expect(runs).toEqual([
      {
        runId: 'r1',
        status: 'running',
        input: {},
        steps: [],
        logs: [],
        timeline: [],
        blocked: undefined,
        blockedSessionId: undefined
      }
    ])
  })

  it('updates the status of an existing run', () => {
    const runs = foldRunEvent([run()], { type: 'status', runId: 'r1', status: 'done' })
    expect(runs[0].status).toBe('done')
  })

  it('is idempotent on a repeated status value', () => {
    let runs = foldRunEvent([], { type: 'status', runId: 'r1', status: 'running' })
    runs = foldRunEvent(runs, { type: 'status', runId: 'r1', status: 'running' })
    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('running')
  })

  it('clears a standing blocked question + session on resume (status → running)', () => {
    const blocked = [
      run({ status: 'blocked', blocked: { title: 'Q', body: 'B' }, blockedSessionId: 'sess-1' })
    ]
    const runs = foldRunEvent(blocked, { type: 'status', runId: 'r1', status: 'running' })
    expect(runs[0].blocked).toBeUndefined()
    expect(runs[0].blockedSessionId).toBeUndefined()
    expect(runs[0].status).toBe('running')
  })

  it('clears a standing blocked question on a terminal status (cancelled)', () => {
    const blocked = [run({ status: 'blocked', blocked: { title: 'Q', body: 'B' } })]
    const runs = foldRunEvent(blocked, { type: 'status', runId: 'r1', status: 'cancelled' })
    expect(runs[0].blocked).toBeUndefined()
    expect(runs[0].status).toBe('cancelled')
  })

  it('preserves a blocked question when status becomes blocked (question arrives next)', () => {
    const running = [run({ blocked: { title: 'old', body: 'x' }, blockedSessionId: 's0' })]
    const runs = foldRunEvent(running, { type: 'status', runId: 'r1', status: 'blocked' })
    expect(runs[0].blocked).toEqual({ title: 'old', body: 'x' })
    expect(runs[0].blockedSessionId).toBe('s0')
    expect(runs[0].status).toBe('blocked')
  })
})

describe('foldRunEvent — steps (upsert + finish)', () => {
  it('upserts a StepNode on step-started, carrying kind/label/group/agent', () => {
    const runs = foldRunEvent([run()], {
      type: 'step',
      runId: 'r1',
      step: stepEvent({
        stepId: 3,
        stepKind: 'agent',
        label: 'implement',
        group: 'Implement feat/x',
        agent: { prompt: 'do it', permission: 'write' }
      })
    })
    expect(runs[0].steps).toEqual([
      {
        stepId: 3,
        kind: 'agent',
        label: 'implement',
        group: 'Implement feat/x',
        finished: false,
        agent: { prompt: 'do it', permission: 'write' }
      }
    ])
  })

  it('stamps finished/ok/durationMs/agentResult/detail on step-finished by stepId', () => {
    let runs = foldRunEvent([run()], {
      type: 'step',
      runId: 'r1',
      step: stepEvent({ stepId: 5, stepKind: 'agent', label: 'implement' })
    })
    runs = foldRunEvent(runs, {
      type: 'step',
      runId: 'r1',
      step: stepEvent({
        kind: 'step-finished',
        stepId: 5,
        ok: true,
        durationMs: 1400,
        agentResult: { status: 'done', data: { summary: 's' }, sessionId: 'sess-9' }
      })
    })
    expect(runs[0].steps[0]).toMatchObject({
      stepId: 5,
      finished: true,
      ok: true,
      durationMs: 1400,
      agentResult: { status: 'done', data: { summary: 's' }, sessionId: 'sess-9' }
    })
  })

  it('carries a step-finished detail payload onto its node', () => {
    let runs = foldRunEvent([run()], {
      type: 'step',
      runId: 'r1',
      step: stepEvent({ stepId: 1, stepKind: 'worktree', label: 'changedFiles' })
    })
    runs = foldRunEvent(runs, {
      type: 'step-finished',
      runId: 'r1',
      step: stepEvent({
        kind: 'step-finished',
        stepId: 1,
        ok: true,
        detail: { kind: 'files', files: [{ path: 'a.ts', status: 'modified' }] }
      })
    })
    expect(runs[0].steps[0].detail).toEqual({
      kind: 'files',
      files: [{ path: 'a.ts', status: 'modified' }]
    })
  })

  it('marks ok:false when the finished step threw', () => {
    let runs = foldRunEvent([run()], {
      type: 'step',
      runId: 'r1',
      step: stepEvent({ stepId: 2, stepKind: 'sh', label: 'build' })
    })
    runs = foldRunEvent(runs, {
      type: 'step',
      runId: 'r1',
      step: stepEvent({ kind: 'step-finished', stepId: 2, ok: false, durationMs: 20 })
    })
    expect(runs[0].steps[0]).toMatchObject({ finished: true, ok: false })
  })

  it('leaves steps untouched when a step-finished stepId matches no node', () => {
    let runs = foldRunEvent([run()], {
      type: 'step',
      runId: 'r1',
      step: stepEvent({ stepId: 1, stepKind: 'sh', label: 'a' })
    })
    runs = foldRunEvent(runs, {
      type: 'step',
      runId: 'r1',
      step: stepEvent({ kind: 'step-finished', stepId: 99, ok: true })
    })
    expect(runs[0].steps).toHaveLength(1)
    expect(runs[0].steps[0].finished).toBe(false)
  })
})

describe('foldRunEvent — failure evidence', () => {
  it('reads error/stdout/code off a broadcast failed step event', () => {
    const runs = foldRunEvent([run()], {
      type: 'step',
      runId: 'r1',
      step: stepEvent({
        kind: 'failed',
        error: 'exit 1',
        stdout: 'boom\n',
        code: 1
      })
    })
    expect(runs[0]).toMatchObject({ status: 'failed', error: 'exit 1', stdout: 'boom\n', code: 1 })
  })
})

describe('foldRunEvent — logs & legacy timeline', () => {
  it('appends a log line to logs and mirrors it onto the legacy timeline', () => {
    const runs = foldRunEvent([run()], {
      type: 'log',
      runId: 'r1',
      message: 'fetching',
      group: 'g1'
    })
    expect(runs[0].logs).toEqual([{ message: 'fetching', group: 'g1' }])
    expect(runs[0].timeline).toEqual([{ kind: 'log', message: 'fetching', group: 'g1' }])
  })

  it('mirrors step-started rows onto the legacy timeline in arrival order', () => {
    let runs = [run()]
    runs = foldRunEvent(runs, {
      type: 'step',
      runId: 'r1',
      step: stepEvent({ stepId: 0, stepKind: 'sh', label: 'A' })
    })
    runs = foldRunEvent(runs, { type: 'log', runId: 'r1', message: 'a-log' })
    runs = foldRunEvent(runs, {
      type: 'step',
      runId: 'r1',
      step: stepEvent({ stepId: 1, stepKind: 'sh', label: 'B' })
    })
    expect(runs[0].timeline).toEqual([
      { kind: 'step', label: 'A', group: undefined },
      { kind: 'log', message: 'a-log', group: undefined },
      { kind: 'step', label: 'B', group: undefined }
    ])
  })
})

describe('foldRunEvent — blocked', () => {
  it('sets the blocked question and session id on the run', () => {
    const runs = foldRunEvent([run({ status: 'blocked' })], {
      type: 'blocked',
      runId: 'r1',
      question: { title: 'Proceed?', body: 'The agent needs input' },
      sessionId: 'sess-42'
    })
    expect(runs[0].blocked).toEqual({ title: 'Proceed?', body: 'The agent needs input' })
    expect(runs[0].blockedSessionId).toBe('sess-42')
  })
})

describe('foldRunEvent — isolation & defensiveness', () => {
  it('creates a run for an unknown runId on a step event (never throws)', () => {
    const runs = foldRunEvent([], {
      type: 'step',
      runId: 'ghost',
      step: stepEvent({ stepId: 0, stepKind: 'sh', label: 'x' })
    })
    expect(runs[0].runId).toBe('ghost')
    expect(runs[0].steps).toEqual([
      { stepId: 0, kind: 'sh', label: 'x', group: undefined, finished: false, agent: undefined }
    ])
  })

  it('folds an event for one run without touching the others', () => {
    const start = [run({ runId: 'r1', logs: [{ message: 'keep' }] }), run({ runId: 'r2' })]
    const runs = foldRunEvent(start, { type: 'status', runId: 'r2', status: 'done' })
    expect(runs.find((r) => r.runId === 'r1')).toEqual(start[0])
    expect(runs.find((r) => r.runId === 'r2')?.status).toBe('done')
  })
})

describe('stepStatus', () => {
  it('done when finished and ok', () => {
    expect(stepStatus(node({ finished: true, ok: true }), run({ status: 'done' }))).toBe('done')
  })

  it('failed when finished and ok:false', () => {
    expect(stepStatus(node({ finished: true, ok: false }), run({ status: 'running' }))).toBe(
      'failed'
    )
  })

  it('running when unfinished in a running run', () => {
    expect(stepStatus(node({ finished: false }), run({ status: 'running' }))).toBe('running')
  })

  it('blocked for the in-flight (last unfinished) step, pending for earlier ones', () => {
    const first = node({ stepId: 0, finished: true, ok: true })
    const inflight = node({ stepId: 1, finished: false })
    const r = run({ status: 'blocked', steps: [first, inflight] })
    expect(stepStatus(inflight, r)).toBe('blocked')
    const earlierUnfinished = node({ stepId: 2, finished: false })
    const r2 = run({ status: 'blocked', steps: [earlierUnfinished, inflight] })
    expect(stepStatus(earlierUnfinished, r2)).toBe('pending')
  })

  it('pending when unfinished in a pending run', () => {
    expect(stepStatus(node({ finished: false }), run({ status: 'pending' }))).toBe('pending')
  })

  it('cancelled propagates to unfinished steps', () => {
    expect(stepStatus(node({ finished: false }), run({ status: 'cancelled' }))).toBe('cancelled')
  })
})

describe('groupRollup', () => {
  it('failed beats everything', () => {
    expect(groupRollup(['done', 'running', 'blocked', 'failed', 'pending'])).toBe('failed')
  })

  it('blocked beats running/done/pending', () => {
    expect(groupRollup(['done', 'running', 'blocked', 'pending'])).toBe('blocked')
  })

  it('running beats done/pending (mixed case)', () => {
    expect(groupRollup(['done', 'pending', 'running'])).toBe('running')
  })

  it('done beats pending', () => {
    expect(groupRollup(['pending', 'done', 'pending'])).toBe('done')
  })

  it('pending when all pending', () => {
    expect(groupRollup(['pending', 'pending'])).toBe('pending')
  })

  it('empty children roll up to pending', () => {
    expect(groupRollup([])).toBe('pending')
  })
})
