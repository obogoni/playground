import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkflowRun } from '../shared/workflows'
import { WorkflowRunStore } from './workflow-run-store'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wrs-'))
  dirs.push(dir)
  return dir
}

function makeRun(over: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    runId: 'run-1',
    workflowId: 'wf-1',
    status: 'running',
    input: { key: 'value' },
    events: [{ seq: 0, kind: 'run-started' }],
    startedAt: '2026-07-03T00:00:00.000Z',
    ...over
  }
}

describe('WorkflowRunStore', () => {
  it('round-trips the full record including events on save → load', () => {
    const store = new WorkflowRunStore(tempDir())
    const run = makeRun({
      events: [
        { seq: 0, kind: 'run-started' },
        { seq: 1, kind: 'step-started', label: 'sh' },
        { seq: 2, kind: 'done' }
      ]
    })
    store.save(run)
    expect(store.load('run-1')).toEqual(run)
  })

  it('overwrites the file on re-save, returning the latest record', () => {
    const store = new WorkflowRunStore(tempDir())
    store.save(makeRun({ status: 'running' }))
    const finished = makeRun({
      status: 'done',
      finishedAt: '2026-07-03T00:01:00.000Z',
      events: [
        { seq: 0, kind: 'run-started' },
        { seq: 1, kind: 'done' }
      ]
    })
    store.save(finished)
    expect(store.load('run-1')).toEqual(finished)
  })

  it('lists every saved run', () => {
    const store = new WorkflowRunStore(tempDir())
    store.save(makeRun({ runId: 'a' }))
    store.save(makeRun({ runId: 'b' }))
    store.save(makeRun({ runId: 'c' }))
    expect(
      store
        .list()
        .map((r) => r.runId)
        .sort()
    ).toEqual(['a', 'b', 'c'])
  })

  it('returns null loading a run that was never saved', () => {
    const store = new WorkflowRunStore(tempDir())
    expect(store.load('missing')).toBeNull()
  })

  it('creates the directory on save when it does not yet exist', () => {
    const nested = join(tempDir(), 'workflow-runs')
    expect(existsSync(nested)).toBe(false)
    const store = new WorkflowRunStore(nested)
    store.save(makeRun())
    expect(existsSync(nested)).toBe(true)
    expect(store.load('run-1')?.runId).toBe('run-1')
  })
})
