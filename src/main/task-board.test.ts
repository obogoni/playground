import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkItemDetails } from '../shared/tasks'
import { refKey, type WorkItemRef } from './ado-gateway'
import { ConfigStore } from './config-store'
import { parseTaskInput, TaskBoard, type WorkItemSource } from './task-board'

const noDefaults = { defaultOrg: null, defaultProject: null }
const acme = { defaultOrg: 'acme', defaultProject: 'platform' }

const FIX_LOGIN: WorkItemDetails = { title: 'Fix login redirect', type: 'Bug', state: 'Active' }

/** Per-ref relations payload for the stub: the item's own details + its links. */
interface StubRelations {
  item: WorkItemDetails
  childRefs: WorkItemRef[]
  parentRefs: WorkItemRef[]
}

/**
 * Resolves only the items given; records every `getWorkItems` call's refs.
 * `relations` supplies per-ref `getWorkItemWithRelations` responses (defaults
 * to the item alone, no relations); `failAuth` fails both seams.
 */
function stubSource(
  items: Record<string, WorkItemDetails>,
  opts: { failAuth?: boolean; relations?: Record<string, StubRelations> } = {}
): WorkItemSource & { calls: WorkItemRef[][] } {
  const calls: WorkItemRef[][] = []
  const relations =
    opts.relations ??
    Object.fromEntries(
      Object.keys(items).map((key) => [
        key,
        { item: items[key], childRefs: [] as WorkItemRef[], parentRefs: [] as WorkItemRef[] }
      ])
    )
  return {
    calls,
    getWorkItems: async (refs) => {
      calls.push(refs)
      if (opts.failAuth) return { ok: false, reason: 'auth', error: 'az login required' }
      const details = new Map<string, WorkItemDetails>()
      for (const ref of refs) {
        const detail = items[refKey(ref)]
        if (detail) details.set(refKey(ref), detail)
      }
      return { ok: true, details }
    },
    getWorkItemWithRelations: async (ref) => {
      if (opts.failAuth) return { ok: false, reason: 'auth', error: 'az login required' }
      const entry = relations[refKey(ref)]
      if (!entry) return { ok: false, reason: 'auth', error: 'az login required' }
      return {
        ok: true,
        item: entry.item,
        childRefs: entry.childRefs,
        parentRefs: entry.parentRefs
      }
    }
  }
}

describe('parseTaskInput', () => {
  it('parses a full work item URL', () => {
    const result = parseTaskInput(
      'https://dev.azure.com/acme/platform/_workitems/edit/4821',
      noDefaults
    )

    expect(result).toEqual({
      ok: true,
      ref: {
        id: 4821,
        org: 'acme',
        project: 'platform',
        url: 'https://dev.azure.com/acme/platform/_workitems/edit/4821'
      }
    })
  })

  it('tolerates a title slug and query string after the id', () => {
    const result = parseTaskInput(
      'https://dev.azure.com/acme/platform/_workitems/edit/4821/fix-login-redirect?fullScreen=true',
      noDefaults
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.ref.id).toBe(4821)
  })

  it('decodes a percent-encoded project name and re-encodes the canonical url', () => {
    const result = parseTaskInput(
      'https://dev.azure.com/acme/My%20Project/_workitems/edit/7',
      noDefaults
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.ref.project).toBe('My Project')
      expect(result.ref.url).toBe('https://dev.azure.com/acme/My%20Project/_workitems/edit/7')
    }
  })

  it('resolves a bare ID against the configured defaults, trimming whitespace', () => {
    const result = parseTaskInput('  4821  ', acme)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.ref).toMatchObject({ id: 4821, org: 'acme', project: 'platform' })
  })

  it('refuses a bare ID when no defaults are configured', () => {
    const result = parseTaskInput('4821', noDefaults)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Settings')
  })

  it.each([
    ['', 'empty input'],
    ['12abc', 'not a number or url'],
    ['not a url at all', 'free text'],
    ['https://example.com/acme/platform/_workitems/edit/4821', 'wrong host'],
    ['https://dev.azure.com/acme/platform/_workitems/4821', 'missing edit segment'],
    ['https://dev.azure.com/acme/platform/_workitems/edit/', 'missing id'],
    ['0', 'zero id']
  ])('refuses malformed input %j (%s)', (input) => {
    expect(parseTaskInput(input, acme).ok).toBe(false)
  })
})

describe('TaskBoard', () => {
  let dir: string
  let store: ConfigStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wtm-tasks-'))
    store = new ConfigStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const URL_4821 = 'https://dev.azure.com/acme/platform/_workitems/edit/4821'
  const KEY_4821 = 'acme/platform/#4821'

  it('returns pins with null details and unknown auth before any fetch', () => {
    store.patch({ pinnedTasks: [{ id: 4821, org: 'acme', project: 'platform', url: URL_4821 }] })
    const board = new TaskBoard(store, stubSource({}))

    expect(board.list()).toEqual({
      tasks: [{ id: 4821, org: 'acme', project: 'platform', url: URL_4821, details: null }],
      auth: 'unknown',
      lastSyncAt: null
    })
  })

  it('pin validates, persists, and round-trips across a ConfigStore reload', async () => {
    const board = new TaskBoard(store, stubSource({ [KEY_4821]: FIX_LOGIN }))

    const result = await board.pin(URL_4821)

    expect(result.ok).toBe(true)
    expect(result.snapshot?.tasks).toEqual([
      { id: 4821, org: 'acme', project: 'platform', url: URL_4821, details: FIX_LOGIN }
    ])
    expect(result.snapshot?.auth).toBe('ok')
    expect(new ConfigStore(dir).get().pinnedTasks).toEqual([
      { id: 4821, org: 'acme', project: 'platform', url: URL_4821 }
    ])
  })

  it('refuses a duplicate pin without touching the persisted list', async () => {
    const board = new TaskBoard(store, stubSource({ [KEY_4821]: FIX_LOGIN }))
    await board.pin(URL_4821)

    const result = await board.pin('https://dev.azure.com/acme/platform/_workitems/edit/4821/slug')

    expect(result).toEqual({ ok: false, error: '#4821 is already pinned.' })
    expect(new ConfigStore(dir).get().pinnedTasks).toHaveLength(1)
  })

  it('refuses an unresolvable work item and persists nothing', async () => {
    const board = new TaskBoard(store, stubSource({}))

    const result = await board.pin(URL_4821)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('not found')
    expect(new ConfigStore(dir).get().pinnedTasks).toEqual([])
  })

  it('reports auth failure on pin without persisting, and list reflects it', async () => {
    const board = new TaskBoard(store, stubSource({}, { failAuth: true }))

    const result = await board.pin(URL_4821)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('az login')
    expect(new ConfigStore(dir).get().pinnedTasks).toEqual([])
    expect(board.list().auth).toBe('failed')
  })

  it('rejects malformed input before any fetch', async () => {
    const source = stubSource({ [KEY_4821]: FIX_LOGIN })
    const board = new TaskBoard(store, source)

    const result = await board.pin('https://dev.azure.com/acme/platform/_workitems/4821')

    expect(result.ok).toBe(false)
    expect(source.calls).toHaveLength(0)
  })

  it('unpin removes the task and the removal round-trips', async () => {
    const board = new TaskBoard(store, stubSource({ [KEY_4821]: FIX_LOGIN }))
    await board.pin(URL_4821)

    const snapshot = board.unpin({ id: 4821, org: 'acme', project: 'platform' })

    expect(snapshot.tasks).toEqual([])
    expect(new ConfigStore(dir).get().pinnedTasks).toEqual([])
  })

  it('refresh fills details for persisted pins and stamps auth/lastSyncAt', async () => {
    store.patch({ pinnedTasks: [{ id: 4821, org: 'acme', project: 'platform', url: URL_4821 }] })
    const board = new TaskBoard(store, stubSource({ [KEY_4821]: FIX_LOGIN }))

    const snapshot = await board.refresh()

    expect(snapshot.tasks[0].details).toEqual(FIX_LOGIN)
    expect(snapshot.auth).toBe('ok')
    expect(snapshot.lastSyncAt).toBeTypeOf('number')
  })

  it('refresh keeps the pinned list but drops details when auth fails', async () => {
    store.patch({ pinnedTasks: [{ id: 4821, org: 'acme', project: 'platform', url: URL_4821 }] })
    const board = new TaskBoard(store, stubSource({}, { failAuth: true }))

    const snapshot = await board.refresh()

    expect(snapshot.auth).toBe('failed')
    expect(snapshot.tasks).toEqual([
      { id: 4821, org: 'acme', project: 'platform', url: URL_4821, details: null }
    ])
  })

  it('refresh degrades items deleted in ADO to id-only while others resolve', async () => {
    store.patch({
      pinnedTasks: [
        { id: 4821, org: 'acme', project: 'platform', url: URL_4821 },
        {
          id: 7,
          org: 'acme',
          project: 'platform',
          url: 'https://dev.azure.com/acme/platform/_workitems/edit/7'
        }
      ]
    })
    const board = new TaskBoard(store, stubSource({ [KEY_4821]: FIX_LOGIN }))

    const snapshot = await board.refresh()

    expect(snapshot.tasks.find((t) => t.id === 4821)?.details).toEqual(FIX_LOGIN)
    expect(snapshot.tasks.find((t) => t.id === 7)?.details).toBeNull()
  })

  it('refresh without pins skips the fetch entirely', async () => {
    const source = stubSource({})
    const board = new TaskBoard(store, source)

    const snapshot = await board.refresh()

    expect(snapshot).toEqual({ tasks: [], auth: 'unknown', lastSyncAt: null })
    expect(source.calls).toHaveLength(0)
  })

  it('pin resolves a Task badge to its first non-Task ancestor (BPTK-01)', async () => {
    const faultRef: WorkItemRef = { id: 7, org: 'acme', project: 'platform' }
    const task: WorkItemDetails = { title: 'Write spec', type: 'Task', state: 'Active' }
    const fault: WorkItemDetails = { title: 'Billing broken', type: 'Fault', state: 'Active' }
    const source = stubSource(
      { [KEY_4821]: task, [refKey(faultRef)]: fault },
      {
        relations: {
          [KEY_4821]: { item: task, childRefs: [], parentRefs: [faultRef] },
          [refKey(faultRef)]: { item: fault, childRefs: [], parentRefs: [] }
        }
      }
    )
    const board = new TaskBoard(store, source)

    const result = await board.pin(URL_4821)

    expect(result.ok).toBe(true)
    expect(result.snapshot?.tasks[0].details).toEqual({ ...task, parentType: 'Fault' })
  })

  it('pin walks Task chains until a non-Task ancestor is found (BPTK-01)', async () => {
    const storyRef: WorkItemRef = { id: 9, org: 'acme', project: 'platform' }
    const taskRef2: WorkItemRef = { id: 10, org: 'acme', project: 'platform' }
    const task: WorkItemDetails = { title: 'Leaf task', type: 'Task', state: 'Active' }
    const nested: WorkItemDetails = { title: 'Parent task', type: 'Task', state: 'Active' }
    const story: WorkItemDetails = { title: 'As a user…', type: 'User Story', state: 'New' }
    const source = stubSource(
      {
        [KEY_4821]: task,
        [refKey(taskRef2)]: nested,
        [refKey(storyRef)]: story
      },
      {
        relations: {
          [KEY_4821]: { item: task, childRefs: [], parentRefs: [taskRef2] },
          [refKey(taskRef2)]: { item: nested, childRefs: [], parentRefs: [storyRef] },
          [refKey(storyRef)]: { item: story, childRefs: [], parentRefs: [] }
        }
      }
    )
    const board = new TaskBoard(store, source)

    const result = await board.pin(URL_4821)

    expect(result.ok).toBe(true)
    expect(result.snapshot?.tasks[0].details).toEqual({ ...task, parentType: 'User Story' })
  })

  it('pin keeps a Task badge when the parent chain has no non-Task ancestor', async () => {
    const task: WorkItemDetails = { title: 'Standalone task', type: 'Task', state: 'Active' }
    const source = stubSource({ [KEY_4821]: task })
    const board = new TaskBoard(store, source)

    const result = await board.pin(URL_4821)

    expect(result.ok).toBe(true)
    expect(result.snapshot?.tasks[0].details).toEqual({ ...task, parentType: null })
  })

  it('pin keeps a non-Task badge untouched (BPTK-01)', async () => {
    const source = stubSource({ [KEY_4821]: FIX_LOGIN })
    const board = new TaskBoard(store, source)

    const result = await board.pin(URL_4821)

    expect(result.ok).toBe(true)
    expect(result.snapshot?.tasks[0].details).toEqual(FIX_LOGIN)
  })

  it('refresh re-resolves Task badges from live relations', async () => {
    store.patch({ pinnedTasks: [{ id: 4821, org: 'acme', project: 'platform', url: URL_4821 }] })
    const bugRef: WorkItemRef = { id: 7, org: 'acme', project: 'platform' }
    const task: WorkItemDetails = { title: 'Repro it', type: 'Task', state: 'Active' }
    const bug: WorkItemDetails = { title: 'It crashes', type: 'Bug', state: 'Active' }
    const source = stubSource(
      { [KEY_4821]: task, [refKey(bugRef)]: bug },
      {
        relations: {
          [KEY_4821]: { item: task, childRefs: [], parentRefs: [bugRef] },
          [refKey(bugRef)]: { item: bug, childRefs: [], parentRefs: [] }
        }
      }
    )
    const board = new TaskBoard(store, source)

    const snapshot = await board.refresh()

    expect(snapshot.tasks[0].details).toEqual({ ...task, parentType: 'Bug' })
  })

  it('refresh degrades the Task badge to its own type when the parent fetch fails', async () => {
    store.patch({ pinnedTasks: [{ id: 4821, org: 'acme', project: 'platform', url: URL_4821 }] })
    const task: WorkItemDetails = { title: 'Lonely task', type: 'Task', state: 'Active' }
    const source = stubSource({ [KEY_4821]: task }, { failAuth: true })
    const board = new TaskBoard(store, source)

    const snapshot = await board.refresh()

    expect(snapshot.auth).toBe('failed')
    expect(snapshot.tasks[0].details).toBeNull()
  })

  it('pin resolves the badge before persisting, so a reload keeps parentType', async () => {
    const faultRef: WorkItemRef = { id: 7, org: 'acme', project: 'platform' }
    const task: WorkItemDetails = { title: 'Write spec', type: 'Task', state: 'Active' }
    const fault: WorkItemDetails = { title: 'Billing broken', type: 'Fault', state: 'Active' }
    const source = stubSource(
      { [KEY_4821]: task, [refKey(faultRef)]: fault },
      {
        relations: {
          [KEY_4821]: { item: task, childRefs: [], parentRefs: [faultRef] },
          [refKey(faultRef)]: { item: fault, childRefs: [], parentRefs: [] }
        }
      }
    )
    const board = new TaskBoard(store, source)

    const result = await board.pin(URL_4821)
    expect(result.ok).toBe(true)
    expect(new ConfigStore(dir).get().pinnedTasks).toHaveLength(1)
    expect(board.list().tasks[0].details).toEqual({ ...task, parentType: 'Fault' })
  })
})
