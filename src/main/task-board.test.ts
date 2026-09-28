import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkItemDetails } from '../shared/tasks'
import { refKey, type WorkItemRef } from './ado-gateway'
import { ConfigStore } from './config-store'
import type { PinnedTask } from '../shared/tasks'
import { openPinnedTask, parseTaskInput, TaskBoard, type WorkItemSource } from './task-board'

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

describe('openPinnedTask (PTOP-05..07)', () => {
  const url = (org: string, project: string, id: number): string =>
    `https://dev.azure.com/${org}/${project}/_workitems/edit/${id}`
  const pinned = (
    org: string,
    project: string,
    id: number,
    at = url(org, project, id)
  ): PinnedTask => ({
    id,
    org,
    project,
    url: at
  })

  /** An openExternal that records every address and optionally fails. */
  const opener = (
    fail?: Error
  ): { calls: string[]; openExternal: (u: string) => Promise<void> } => {
    const calls: string[] = []
    return {
      calls,
      openExternal: async (u) => {
        calls.push(u)
        if (fail) throw fail
      }
    }
  }

  it('opens exactly the stored URL', async () => {
    const o = opener()
    const tasks = [pinned('acme', 'platform', 12345)]

    const result = await openPinnedTask({ tasks, openExternal: o.openExternal }, tasks[0])

    expect(result).toEqual({ ok: true })
    expect(o.calls).toEqual(['https://dev.azure.com/acme/platform/_workitems/edit/12345'])
  })

  it('refuses a task that is no longer pinned and opens nothing (PTOP-05)', async () => {
    const o = opener()

    const result = await openPinnedTask(
      { tasks: [pinned('acme', 'platform', 1)], openExternal: o.openExternal },
      { id: 2, org: 'acme', project: 'platform' }
    )

    expect(result).toEqual({ ok: false, error: 'That task is no longer pinned.' })
    expect(o.calls).toEqual([])
  })

  it.each([
    ['an http URL', 'http://dev.azure.com/acme/platform/_workitems/edit/7'],
    ['a foreign host', 'https://example.com/acme/platform/_workitems/edit/7'],
    ['a look-alike host', 'https://dev.azure.com.example.com/acme/platform/_workitems/edit/7'],
    ['a prefixed host', 'https://xdev.azure.com/acme/platform/_workitems/edit/7'],
    [
      'the right host on another port',
      'https://dev.azure.com:8443/acme/platform/_workitems/edit/7'
    ],
    ['a URL that does not parse', 'not a url']
  ])('refuses %s and opens nothing (PTOP-06)', async (_label, stored) => {
    const o = opener()
    const tasks = [pinned('acme', 'platform', 7, stored)]

    const result = await openPinnedTask({ tasks, openExternal: o.openExternal }, tasks[0])

    expect(result).toEqual({ ok: false, error: 'Refusing to open an unexpected work item URL.' })
    expect(o.calls).toEqual([])
  })

  it("reports the system's message when the browser cannot open (PTOP-07)", async () => {
    const o = opener(new Error('No application is associated with https'))
    const tasks = [pinned('acme', 'platform', 3)]

    const result = await openPinnedTask({ tasks, openExternal: o.openExternal }, tasks[0])

    expect(result).toEqual({ ok: false, error: 'No application is associated with https' })
  })

  it("opens each project's own item when the same id is pinned twice (edge case)", async () => {
    const o = opener()
    const tasks = [pinned('acme', 'platform', 42), pinned('acme', 'billing', 42)]

    await openPinnedTask(
      { tasks, openExternal: o.openExternal },
      { id: 42, org: 'acme', project: 'billing' }
    )
    await openPinnedTask(
      { tasks, openExternal: o.openExternal },
      { id: 42, org: 'acme', project: 'platform' }
    )

    expect(o.calls).toEqual([url('acme', 'billing', 42), url('acme', 'platform', 42)])
  })

  it('opens the stored URL, never one the caller sends or one rebuilt from the ref (Goal 2)', async () => {
    const o = opener()
    const stored = 'https://dev.azure.com/acme/platform/_workitems/edit/12345?view=discussion'
    const tasks = [pinned('acme', 'platform', 12345, stored)]
    // A request carrying its own address, as a compromised renderer could send.
    const ref = {
      id: 12345,
      org: 'acme',
      project: 'platform',
      url: 'https://dev.azure.com/other/place/_workitems/edit/1'
    }

    await openPinnedTask({ tasks, openExternal: o.openExternal }, ref)

    expect(o.calls).toEqual([stored])
  })

  it('tells two orgs apart when id and project match (edge case)', async () => {
    const o = opener()
    const tasks = [pinned('acme', 'platform', 42), pinned('contoso', 'platform', 42)]

    await openPinnedTask(
      { tasks, openExternal: o.openExternal },
      { id: 42, org: 'contoso', project: 'platform' }
    )

    expect(o.calls).toEqual([url('contoso', 'platform', 42)])
  })

  it('reports a rejection that is not an Error by its own text (PTOP-07)', async () => {
    const tasks = [pinned('acme', 'platform', 3)]

    const result = await openPinnedTask(
      {
        tasks,
        openExternal: async () => {
          throw 'blocked by policy'
        }
      },
      tasks[0]
    )

    expect(result).toEqual({ ok: false, error: 'blocked by policy' })
  })
})
