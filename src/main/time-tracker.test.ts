import { describe, expect, it } from 'vitest'
import type { OpenPeriod, PeriodSnapshotFields, TimePeriod } from '../shared/time'
import { TimeTracker, type TimeStorePort } from './time-tracker'

const T0 = Date.parse('2026-09-16T12:00:00.000Z')
const SEC = 1000
const MIN = 60 * SEC
const iso = (ms: number): string => new Date(ms).toISOString()

const SNAPSHOT: PeriodSnapshotFields = {
  workspacePath: 'D:\\acme',
  repoName: 'app',
  branch: 'feature/12345-fix-login-redirect',
  taskId: 12345,
  taskTitle: 'Fix login redirect'
}

interface FakeStore extends TimeStorePort {
  appended: TimePeriod[]
  rewrites: TimePeriod[][]
  openWrites: OpenPeriod[][]
}

function fakeStore(init: { periods?: TimePeriod[]; open?: OpenPeriod[] } = {}): FakeStore {
  const store: FakeStore = {
    appended: [],
    rewrites: [],
    openWrites: [],
    readPeriods: () => ({ periods: [...(init.periods ?? [])], skipped: 0 }),
    append: (p) => {
      store.appended.push(p)
    },
    rewrite: (ps) => {
      store.rewrites.push(ps)
    },
    readOpen: () => [...(init.open ?? [])],
    writeOpen: (open) => {
      store.openWrites.push(open)
    }
  }
  return store
}

interface Harness {
  tracker: TimeTracker
  store: FakeStore
  resolved: string[]
  advance: (ms: number) => void
  emits: () => number
}

const PINNED = new Map<number, string>([
  [12345, 'Fix login redirect'],
  [67890, 'Widget export']
])

function setup(
  init: { periods?: TimePeriod[]; open?: OpenPeriod[]; snapshot?: PeriodSnapshotFields } = {}
): Harness {
  const clock = { now: T0 }
  const store = fakeStore(init)
  const resolved: string[] = []
  let ids = 0
  let emits = 0
  const tracker = new TimeTracker({
    store,
    now: () => clock.now,
    newId: () => `p${++ids}`,
    resolveSnapshot: (cwd) => {
      resolved.push(cwd)
      return init.snapshot ?? SNAPSHOT
    },
    pinnedTitle: (id) => PINNED.get(id) ?? null,
    emit: () => {
      emits++
    }
  })
  return {
    tracker,
    store,
    resolved,
    advance: (ms: number) => {
      clock.now += ms
    },
    emits: () => emits
  }
}

const meta = (
  id = 's1',
  cwd = 'D:\\acme\\app-12345'
): { id: string; agent: string; cwd: string } => ({
  id,
  agent: 'Claude',
  cwd
})

describe('TimeTracker lifecycle', () => {
  it('opens a period with its snapshot when a session starts (TIME-01, TIME-03)', () => {
    const t = setup()
    t.tracker.started(meta())

    expect(t.resolved).toEqual(['D:\\acme\\app-12345'])
    expect(t.tracker.snapshot().open).toEqual([
      {
        id: 'p1',
        sessionId: 's1',
        agent: 'Claude',
        cwd: 'D:\\acme\\app-12345',
        ...SNAPSHOT,
        start: iso(T0),
        lastSeen: iso(T0)
      }
    ])
    expect(t.store.openWrites.at(-1)).toEqual(t.tracker.snapshot().open)
  })

  it('appends one closed period with the end instant when the session ends (TIME-02)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(2 * MIN)
    t.tracker.ended('s1')

    const expected: TimePeriod = {
      id: 'p1',
      sessionId: 's1',
      agent: 'Claude',
      cwd: 'D:\\acme\\app-12345',
      ...SNAPSHOT,
      start: iso(T0),
      end: iso(T0 + 2 * MIN)
    }
    expect(t.store.appended).toEqual([expected])
    expect(t.tracker.snapshot()).toEqual({ periods: [expected], open: [], paused: [] })
    expect(t.store.openWrites.at(-1)).toEqual([])
  })

  it('appends once when ended is called twice', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(MIN)
    t.tracker.ended('s1')
    t.advance(MIN)
    t.tracker.ended('s1')

    expect(t.store.appended).toHaveLength(1)
  })

  it('discards a period shorter than 1 s (TIME-11)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(999)
    t.tracker.ended('s1')

    expect(t.store.appended).toEqual([])
    expect(t.tracker.snapshot().periods).toEqual([])
  })

  it('keeps a period of exactly 1 s', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(SEC)
    t.tracker.ended('s1')

    expect(t.store.appended).toHaveLength(1)
  })

  it('discards a period whose end precedes its start, e.g. the clock moved back (TIME-11)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(-5 * MIN)
    t.tracker.ended('s1')

    expect(t.store.appended).toEqual([])
  })

  it('pause closes the open period and marks the session paused (TIME-16)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(10 * MIN)
    t.tracker.pause('s1')

    expect(t.store.appended.map((p) => [p.start, p.end])).toEqual([[iso(T0), iso(T0 + 10 * MIN)]])
    expect(t.tracker.snapshot()).toMatchObject({ open: [], paused: ['s1'] })
  })

  it('resume opens a new period and clears the paused mark (TIME-18)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(10 * MIN)
    t.tracker.pause('s1')
    t.advance(30 * MIN)
    t.tracker.resume('s1')

    const snap = t.tracker.snapshot()
    expect(snap.paused).toEqual([])
    expect(snap.open.map((p) => [p.id, p.start])).toEqual([['p2', iso(T0 + 40 * MIN)]])
  })

  it('resume on a session that is not paused changes nothing', () => {
    const t = setup()
    t.tracker.started(meta())
    const before = t.tracker.snapshot()
    const emits = t.emits()
    t.advance(MIN)
    t.tracker.resume('s1')

    expect(t.tracker.snapshot()).toEqual(before)
    expect(t.emits()).toBe(emits)
  })

  it('suspend closes every open period at the suspend instant (TIME-06)', () => {
    const t = setup()
    t.tracker.started(meta('s1'))
    t.tracker.started(meta('s2', 'D:\\acme\\api-4821'))
    t.advance(5 * MIN)
    t.tracker.suspend()

    expect(t.store.appended.map((p) => [p.sessionId, p.end])).toEqual([
      ['s1', iso(T0 + 5 * MIN)],
      ['s2', iso(T0 + 5 * MIN)]
    ])
    expect(t.tracker.snapshot().open).toEqual([])
  })

  it('resume from suspend opens a period only for running sessions that are not paused (TIME-07, TIME-21)', () => {
    const t = setup()
    t.tracker.started(meta('running'))
    t.tracker.started(meta('paused'))
    t.tracker.started(meta('stopped'))
    t.advance(MIN)
    t.tracker.pause('paused')
    t.tracker.ended('stopped')
    t.tracker.suspend()
    t.advance(60 * MIN)
    t.tracker.resumeFromSuspend()

    const snap = t.tracker.snapshot()
    expect(snap.open.map((p) => [p.sessionId, p.start])).toEqual([['running', iso(T0 + 61 * MIN)]])
    expect(snap.paused).toEqual(['paused'])
  })

  it('resume of a paused session during suspend opens nothing until the machine resumes', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(MIN)
    t.tracker.pause('s1')
    t.tracker.suspend()
    t.tracker.resume('s1')
    expect(t.tracker.snapshot().open).toEqual([])

    t.advance(MIN)
    t.tracker.resumeFromSuspend()
    expect(t.tracker.snapshot().open.map((p) => p.start)).toEqual([iso(T0 + 2 * MIN)])
  })

  it('rewrites the sidecar with the open periods on every transition, so recovery never re-closes a closed period (TIME-04, TIME-05)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(MIN)
    const written = (): Array<[string, string]> => {
      const last = t.store.openWrites.at(-1) ?? []
      return last.map((p) => [p.id, p.start])
    }
    const writes = (fn: () => void): number => {
      const before = t.store.openWrites.length
      fn()
      return t.store.openWrites.length - before
    }

    expect(writes(() => t.tracker.pause('s1'))).toBe(1)
    expect(written()).toEqual([])

    t.advance(MIN)
    expect(writes(() => t.tracker.resume('s1'))).toBe(1)
    expect(written()).toEqual([['p2', iso(T0 + 2 * MIN)]])

    t.advance(MIN)
    expect(writes(() => t.tracker.suspend())).toBe(1)
    expect(written()).toEqual([])

    t.advance(MIN)
    expect(writes(() => t.tracker.resumeFromSuspend())).toBe(1)
    expect(written()).toEqual([['p3', iso(T0 + 4 * MIN)]])

    t.advance(MIN)
    expect(writes(() => t.tracker.ended('s1'))).toBe(1)
    expect(written()).toEqual([])
  })

  it('heartbeat advances lastSeen on every open period and writes the sidecar (TIME-04)', () => {
    const t = setup()
    t.tracker.started(meta('s1'))
    t.tracker.started(meta('s2'))
    t.advance(60 * SEC)
    t.tracker.heartbeat()

    const written = t.store.openWrites.at(-1) ?? []
    expect(written.map((p) => [p.sessionId, p.start, p.lastSeen])).toEqual([
      ['s1', iso(T0), iso(T0 + 60 * SEC)],
      ['s2', iso(T0), iso(T0 + 60 * SEC)]
    ])
    expect(t.store.appended).toEqual([])
  })

  it('recover closes sidecar periods at their last-seen instant, appends them and empties the sidecar (TIME-05)', () => {
    const leftover: OpenPeriod = {
      id: 'crashed',
      sessionId: 's9',
      agent: 'Claude',
      cwd: 'D:\\acme\\app-12345',
      ...SNAPSHOT,
      start: iso(T0 - 30 * MIN),
      lastSeen: iso(T0 - 10 * MIN)
    }
    const t = setup({ open: [leftover] })
    t.tracker.recover()

    const { lastSeen: _lastSeen, ...fields } = leftover
    void _lastSeen
    const closed: TimePeriod = { ...fields, end: iso(T0 - 10 * MIN) }
    expect(t.store.appended).toEqual([closed])
    expect(t.store.openWrites).toEqual([[]])
    expect(t.tracker.snapshot().periods).toEqual([closed])
  })

  it('closeAll closes every open period at the quit instant (TIME-09)', () => {
    const t = setup()
    t.tracker.started(meta('s1'))
    t.tracker.started(meta('s2'))
    t.advance(MIN)
    t.tracker.pause('s2')
    t.advance(MIN)
    t.tracker.closeAll()

    expect(t.store.appended.map((p) => [p.sessionId, p.end])).toEqual([
      ['s2', iso(T0 + MIN)],
      ['s1', iso(T0 + 2 * MIN)]
    ])
    expect(t.tracker.snapshot()).toMatchObject({ open: [], paused: [] })
    expect(t.store.openWrites.at(-1)).toEqual([])
  })

  it('a session started again after it ended starts unpaused (TIME-19)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(MIN)
    t.tracker.pause('s1')
    t.tracker.ended('s1')
    t.tracker.started(meta())

    const snap = t.tracker.snapshot()
    expect(snap.paused).toEqual([])
    expect(snap.open.map((p) => p.sessionId)).toEqual(['s1'])
  })

  it('a second started for the same session closes the previous open period first', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(MIN)
    t.tracker.started(meta())

    expect(t.store.appended.map((p) => [p.id, p.end])).toEqual([['p1', iso(T0 + MIN)]])
    expect(t.tracker.snapshot().open.map((p) => p.id)).toEqual(['p2'])
  })

  it('loads the closed periods already in the log', () => {
    const existing: TimePeriod = {
      id: 'old',
      sessionId: 'gone',
      agent: 'Claude',
      cwd: 'D:\\acme\\app-12345',
      ...SNAPSHOT,
      start: iso(T0 - 60 * MIN),
      end: iso(T0 - 30 * MIN)
    }
    expect(setup({ periods: [existing] }).tracker.snapshot().periods).toEqual([existing])
  })

  it('emits time:changed exactly once per state change', () => {
    const t = setup()
    const counts: number[] = []
    const step = (fn: () => void): void => {
      const before = t.emits()
      fn()
      counts.push(t.emits() - before)
    }
    step(() => t.tracker.started(meta()))
    step(() => t.advance(MIN))
    step(() => t.tracker.pause('s1'))
    step(() => t.tracker.resume('s1'))
    step(() => t.tracker.suspend())
    step(() => t.tracker.resumeFromSuspend())
    step(() => t.tracker.ended('s1'))
    step(() => t.tracker.closeAll())

    expect(counts).toEqual([1, 0, 1, 1, 1, 1, 1, 1])
  })

  it('exposes no screen lock API: lock and unlock leave periods unchanged by construction (TIME-08)', () => {
    const t = setup()
    const api = Object.getOwnPropertyNames(Object.getPrototypeOf(t.tracker))
    expect(api.filter((name) => /lock/i.test(name))).toEqual([])
  })
})

describe('TimeTracker edits', () => {
  /** Closed p1 (T0 → +1 h) and p2 (+1h30 → +2h30), open p3 since +2h30; now = T0 + 3 h. */
  function withHistory(): Harness {
    const t = setup()
    t.tracker.started(meta('s1'))
    t.advance(60 * MIN)
    t.tracker.pause('s1')
    t.advance(30 * MIN)
    t.tracker.resume('s1')
    t.advance(60 * MIN)
    t.tracker.pause('s1')
    t.tracker.resume('s1')
    t.advance(30 * MIN)
    return t
  }

  const ok = { ok: true }

  it('delete removes the period from the log and rewrites it (TIME-44, TIME-48)', () => {
    const t = withHistory()
    const emits = t.emits()

    expect(t.tracker.deletePeriod('p1')).toEqual(ok)

    expect(t.tracker.snapshot().periods.map((p) => p.id)).toEqual(['p2'])
    expect(t.store.rewrites).toHaveLength(1)
    expect(t.store.rewrites[0].map((p) => p.id)).toEqual(['p2'])
    expect(t.emits()).toBe(emits + 1)
  })

  it('adjust persists the new bounds (TIME-45, TIME-48)', () => {
    const t = withHistory()
    const emits = t.emits()
    const start = iso(T0 + 5 * MIN)
    const end = iso(T0 + 30 * MIN)

    expect(t.tracker.adjustPeriod('p1', start, end)).toEqual(ok)

    const p1 = t.tracker.snapshot().periods.find((p) => p.id === 'p1')
    expect([p1?.start, p1?.end]).toEqual([start, end])
    expect(t.store.rewrites).toHaveLength(1)
    expect(t.store.rewrites[0].find((p) => p.id === 'p1')).toMatchObject({ start, end })
    expect(t.store.rewrites[0].map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(t.emits()).toBe(emits + 1)
  })

  it('adjust accepts an end exactly at now and bounds on different days', () => {
    const t = withHistory()
    const now = T0 + 3 * 60 * MIN
    expect(t.tracker.adjustPeriod('p1', iso(T0 - 24 * 60 * MIN), iso(now))).toEqual(ok)
  })

  it.each([
    ['start equal to end', 60 * MIN, 60 * MIN, 'Start must be before end.'],
    ['start after end', 90 * MIN, 60 * MIN, 'Start must be before end.'],
    ['end in the future', 60 * MIN, 3 * 60 * MIN + 1, 'End cannot be in the future.'],
    ['length under 1 s', 60 * MIN, 60 * MIN + 999, 'A period must last at least 1 second.']
  ])('adjust rejects %s and persists nothing (TIME-46)', (_name, startOffset, endOffset, error) => {
    const t = withHistory()
    const before = t.tracker.snapshot()
    const emits = t.emits()

    expect(t.tracker.adjustPeriod('p1', iso(T0 + startOffset), iso(T0 + endOffset))).toEqual({
      ok: false,
      error
    })

    expect(t.tracker.snapshot()).toEqual(before)
    expect(t.store.rewrites).toEqual([])
    expect(t.emits()).toBe(emits)
  })

  it('rejects editing or deleting the open period (TIME-47)', () => {
    const t = withHistory()
    const openId = t.tracker.snapshot().open[0].id
    const rejected = { ok: false, error: 'This period is still open.' }

    expect(t.tracker.deletePeriod(openId)).toEqual(rejected)
    expect(t.tracker.adjustPeriod(openId, iso(T0), iso(T0 + MIN))).toEqual(rejected)
    expect(t.tracker.snapshot().open.map((p) => p.id)).toEqual([openId])
    expect(t.store.rewrites).toEqual([])
  })

  it('rejects a period that is no longer in the log (TIME-49)', () => {
    const t = withHistory()
    t.tracker.deletePeriod('p1')
    const rewrites = t.store.rewrites.length
    const emits = t.emits()
    const rejected = { ok: false, error: 'This period no longer exists.' }

    expect(t.tracker.deletePeriod('p1')).toEqual(rejected)
    expect(t.tracker.adjustPeriod('unknown', iso(T0), iso(T0 + MIN))).toEqual(rejected)
    expect(t.store.rewrites).toHaveLength(rewrites)
    expect(t.emits()).toBe(emits)
  })
})

describe('TimeTracker session task link', () => {
  const LINK = { id: 67890, title: 'Widget export' }
  /** SNAPSHOT (branch names #12345) with a link to #67890 applied over it. */
  const LINKED: PeriodSnapshotFields = {
    ...SNAPSHOT,
    taskId: 67890,
    taskTitle: 'Widget export',
    taskByHand: true
  }

  const openOf = (t: Harness): OpenPeriod[] => t.tracker.snapshot().open

  it('opens the period of a session started with a task on that task (HTSK-09, HTSK-36)', () => {
    const t = setup()
    t.tracker.started({ ...meta('s1'), task: LINK })
    t.tracker.started({ ...meta('s2'), task: { id: 67890, title: null } })

    expect(openOf(t)).toEqual([
      {
        id: 'p1',
        sessionId: 's1',
        agent: 'Claude',
        cwd: 'D:\\acme\\app-12345',
        ...LINKED,
        start: iso(T0),
        lastSeen: iso(T0)
      },
      {
        id: 'p2',
        sessionId: 's2',
        agent: 'Claude',
        cwd: 'D:\\acme\\app-12345',
        ...LINKED,
        start: iso(T0),
        lastSeen: iso(T0)
      }
    ])
  })

  it('records the branch snapshot unchanged, with no flag key, for a session without a task (HTSK-10)', () => {
    const t = setup()
    t.tracker.started(meta())

    const [open] = openOf(t)
    expect(open).toMatchObject(SNAPSHOT)
    expect('taskByHand' in open).toBe(false)
  })

  it('closes the open period at the change instant and opens one on the new task at the same instant (HTSK-12)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(10 * MIN)
    const emits = t.emits()

    t.tracker.taskChanged('s1', LINK)

    expect(t.store.appended).toEqual([
      {
        id: 'p1',
        sessionId: 's1',
        agent: 'Claude',
        cwd: 'D:\\acme\\app-12345',
        ...SNAPSHOT,
        start: iso(T0),
        end: iso(T0 + 10 * MIN)
      }
    ])
    const expectedOpen: OpenPeriod = {
      id: 'p2',
      sessionId: 's1',
      agent: 'Claude',
      cwd: 'D:\\acme\\app-12345',
      ...LINKED,
      start: iso(T0 + 10 * MIN),
      lastSeen: iso(T0 + 10 * MIN)
    }
    expect(openOf(t)).toEqual([expectedOpen])
    expect(t.store.openWrites.at(-1)).toEqual([expectedOpen])
    expect(t.emits()).toBe(emits + 1)
  })

  it('ends the old period and starts the new one at one instant while the clock moves (HTSK-12)', () => {
    // A real clock moves between two reads; every read here is 1 ms later.
    let now = T0
    const store = fakeStore()
    let ids = 0
    const tracker = new TimeTracker({
      store,
      now: () => (now += 1),
      newId: () => `p${++ids}`,
      resolveSnapshot: () => SNAPSHOT,
      pinnedTitle: (id) => PINNED.get(id) ?? null,
      emit: () => {}
    })
    tracker.started(meta())
    now += 10 * MIN

    tracker.taskChanged('s1', LINK)

    const [open] = tracker.snapshot().open
    expect(store.appended).toHaveLength(1)
    expect(open.start).toBe(store.appended[0].end)
  })

  it('changes nothing when the link is the one the session already has (HTSK-14)', () => {
    const t = setup()
    t.tracker.started({ ...meta('s1'), task: LINK })
    t.tracker.started(meta('s2'))
    t.advance(10 * MIN)
    const before = t.tracker.snapshot()
    const emits = t.emits()
    const writes = t.store.openWrites.length

    t.tracker.taskChanged('s1', { id: 67890, title: 'Another title' })
    t.tracker.taskChanged('s2', null)

    expect(t.store.appended).toEqual([])
    expect(t.tracker.snapshot()).toEqual(before)
    expect(openOf(t).map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(t.emits()).toBe(emits)
    expect(t.store.openWrites).toHaveLength(writes)
  })

  it("opens the next period on the branch's task when the link is removed (HTSK-13)", () => {
    const t = setup()
    t.tracker.started({ ...meta(), task: LINK })
    t.advance(10 * MIN)

    t.tracker.taskChanged('s1', null)

    expect(t.store.appended.map((p) => [p.id, p.taskId, p.end])).toEqual([
      ['p1', 67890, iso(T0 + 10 * MIN)]
    ])
    const [open] = openOf(t)
    expect(open).toMatchObject({ id: 'p2', ...SNAPSHOT, start: iso(T0 + 10 * MIN) })
    expect('taskByHand' in open).toBe(false)
  })

  it('opens nothing while paused, and the resume opens on the new task (HTSK-15)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(MIN)
    t.tracker.pause('s1')
    const appended = t.store.appended.length

    t.tracker.taskChanged('s1', LINK)

    expect(openOf(t)).toEqual([])
    expect(t.store.appended).toHaveLength(appended)

    t.advance(MIN)
    t.tracker.resume('s1')
    expect(openOf(t)).toEqual([
      expect.objectContaining({ id: 'p2', ...LINKED, start: iso(T0 + 2 * MIN) })
    ])
  })

  it('opens nothing while suspended, and the wake opens on the new task (HTSK-15)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(MIN)
    t.tracker.suspend()
    const appended = t.store.appended.length

    t.tracker.taskChanged('s1', LINK)

    expect(openOf(t)).toEqual([])
    expect(t.store.appended).toHaveLength(appended)

    t.advance(MIN)
    t.tracker.resumeFromSuspend()
    expect(openOf(t)).toEqual([
      expect.objectContaining({ id: 'p2', ...LINKED, start: iso(T0 + 2 * MIN) })
    ])
  })

  it('changes nothing for a session with no run (HTSK-16)', () => {
    const t = setup()
    t.tracker.started(meta('s1'))
    t.advance(MIN)
    t.tracker.ended('s1')
    const before = t.tracker.snapshot()
    const emits = t.emits()
    const writes = t.store.openWrites.length

    t.tracker.taskChanged('s1', LINK)
    t.tracker.taskChanged('never-started', LINK)

    expect(t.tracker.snapshot()).toEqual(before)
    expect(t.emits()).toBe(emits)
    expect(t.store.openWrites).toHaveLength(writes)
  })

  it('discards a part under 1 s and opens the new period (HTSK-12, TIME-11)', () => {
    const t = setup()
    t.tracker.started(meta())
    t.advance(500)

    t.tracker.taskChanged('s1', LINK)

    expect(t.store.appended).toEqual([])
    expect(t.tracker.snapshot().periods).toEqual([])
    expect(openOf(t)).toEqual([
      expect.objectContaining({ id: 'p2', ...LINKED, start: iso(T0 + 500) })
    ])
  })

  it('records #12345 with the flag for a link to #12345 in a worktree naming #67890 (HTSK-11, HTSK-36)', () => {
    const worktree: PeriodSnapshotFields = {
      workspacePath: 'D:\\acme',
      repoName: 'app',
      branch: 'feature/67890-widget-export',
      taskId: 67890,
      taskTitle: 'Widget export'
    }
    const t = setup({ snapshot: worktree })

    t.tracker.started({ ...meta('s1', 'D:\\acme\\app-67890'), task: { id: 12345, title: null } })

    expect(openOf(t)).toEqual([
      expect.objectContaining({
        branch: 'feature/67890-widget-export',
        taskId: 12345,
        taskTitle: 'Fix login redirect',
        taskByHand: true
      })
    ])
  })
})

describe('TimeTracker reassign a closed period', () => {
  /** A closed period on a branch naming #67890, recorded on #67890. */
  const onBranch: TimePeriod = {
    id: 'old',
    sessionId: 'gone',
    agent: 'Claude',
    cwd: 'D:\\acme\\app-67890',
    workspacePath: 'D:\\acme',
    repoName: 'app',
    branch: 'feature/67890-widget-export',
    taskId: 67890,
    taskTitle: 'Widget export',
    start: iso(T0 - 3 * 60 * MIN),
    end: iso(T0 - 2 * 60 * MIN)
  }
  /** The same period after a hand-set move to #12345. */
  const moved: TimePeriod = {
    ...onBranch,
    taskId: 12345,
    taskTitle: 'Fix login redirect',
    taskByHand: true
  }
  const other: TimePeriod = {
    ...onBranch,
    id: 'other',
    start: iso(T0 - MIN * 90),
    end: iso(T0 - MIN * 80)
  }

  const rewrittenOld = (t: Harness): TimePeriod | undefined =>
    t.store.rewrites[0]?.find((p) => p.id === 'old')

  it('records the chosen task and keeps every other field (HTSK-25, HTSK-35, HTSK-36, HTSK-39)', () => {
    const t = setup({ periods: [onBranch, other] })
    const emits = t.emits()

    expect(
      t.tracker.reassignPeriod('old', { kind: 'task', id: 12345, title: 'Chosen title' })
    ).toEqual({ ok: true })

    const expected: TimePeriod = {
      ...onBranch,
      taskId: 12345,
      taskTitle: 'Chosen title',
      taskByHand: true
    }
    expect(t.store.rewrites).toEqual([[expected, other]])
    expect(t.tracker.snapshot().periods).toEqual([expected, other])
    expect(rewrittenOld(t)).toMatchObject({
      branch: onBranch.branch,
      cwd: onBranch.cwd,
      start: onBranch.start,
      end: onBranch.end,
      sessionId: onBranch.sessionId,
      agent: onBranch.agent,
      workspacePath: onBranch.workspacePath,
      repoName: onBranch.repoName
    })
    expect(t.emits()).toBe(emits + 1)
  })

  it('records a null task id and title for No task (HTSK-26)', () => {
    const t = setup({ periods: [onBranch] })
    const emits = t.emits()

    expect(t.tracker.reassignPeriod('old', { kind: 'none' })).toEqual({ ok: true })

    expect(t.store.rewrites).toEqual([
      [{ ...onBranch, taskId: null, taskTitle: null, taskByHand: true }]
    ])
    expect(t.emits()).toBe(emits + 1)
  })

  it("restores the branch's task and pinned title and removes the flag key for From branch (HTSK-27, HTSK-37)", () => {
    const t = setup({ periods: [moved] })
    const emits = t.emits()

    expect(t.tracker.reassignPeriod('old', { kind: 'branch' })).toEqual({ ok: true })

    expect(t.store.rewrites).toEqual([[onBranch]])
    expect('taskByHand' in (rewrittenOld(t) ?? {})).toBe(false)
    expect(t.emits()).toBe(emits + 1)
  })

  it("removes the flag key when the branch's own task is chosen (HTSK-37)", () => {
    const t = setup({ periods: [moved] })

    t.tracker.reassignPeriod('old', { kind: 'task', id: 67890, title: 'Widget export' })

    expect(t.store.rewrites).toEqual([[onBranch]])
    expect('taskByHand' in (rewrittenOld(t) ?? {})).toBe(false)
  })

  it('rejects the open period and a deleted id, rewriting nothing (HTSK-32)', () => {
    const t = setup({ periods: [onBranch] })
    t.tracker.started(meta())
    const openId = t.tracker.snapshot().open[0].id
    const before = t.tracker.snapshot()
    const emits = t.emits()

    expect(t.tracker.reassignPeriod(openId, { kind: 'none' })).toEqual({
      ok: false,
      error: 'This period is still open.'
    })
    expect(t.tracker.reassignPeriod('deleted', { kind: 'none' })).toEqual({
      ok: false,
      error: 'This period no longer exists.'
    })

    expect(t.store.rewrites).toEqual([])
    expect(t.tracker.snapshot()).toEqual(before)
    expect(t.emits()).toBe(emits)
  })
})

describe('TimeTracker split a closed period', () => {
  const at = (hh: number, mm = 0, ss = 0): string =>
    `2026-09-15T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.000Z`

  /** 09:00–12:00 on develop, moved by hand to #12345. */
  const morning: TimePeriod = {
    id: 'morning',
    sessionId: 'gone',
    agent: 'Claude',
    cwd: 'D:\\acme\\app',
    workspacePath: 'D:\\acme',
    repoName: 'app',
    branch: 'develop',
    taskId: 12345,
    taskTitle: 'Fix login redirect',
    taskByHand: true,
    start: at(9),
    end: at(12)
  }
  const before: TimePeriod = { ...morning, id: 'before', start: at(7), end: at(8) }
  const after: TimePeriod = { ...morning, id: 'after', start: at(13), end: at(14) }

  it('replaces the period by [start, at] with its id and [at, end] with a new id, in place (HTSK-28, HTSK-35)', () => {
    const t = setup({ periods: [before, morning, after] })
    const emits = t.emits()

    expect(t.tracker.splitPeriod('morning', at(10))).toEqual({ ok: true })

    const expected = [
      before,
      { ...morning, end: at(10) },
      { ...morning, id: 'p1', start: at(10) },
      after
    ]
    expect(t.store.rewrites).toEqual([expected])
    expect(t.tracker.snapshot().periods).toEqual(expected)
    expect(t.emits()).toBe(emits + 1)
  })

  it('splits at exactly start + 1 s and at exactly end - 1 s (HTSK-28, HTSK-30)', () => {
    const t = setup({ periods: [morning] })

    expect(t.tracker.splitPeriod('morning', at(9, 0, 1))).toEqual({ ok: true })
    expect(t.tracker.splitPeriod('p1', at(11, 59, 59))).toEqual({ ok: true })

    expect(t.tracker.snapshot().periods.map((p) => [p.id, p.start, p.end])).toEqual([
      ['morning', at(9), at(9, 0, 1)],
      ['p1', at(9, 0, 1), at(11, 59, 59)],
      ['p2', at(11, 59, 59), at(12)]
    ])
  })

  const shortPeriod: TimePeriod = {
    ...morning,
    id: 'short',
    start: at(9),
    end: '2026-09-15T09:00:01.500Z'
  }

  it.each([
    ['at the start', 'morning', at(9), 'Split time must be inside the period.'],
    ['at the end', 'morning', at(12), 'Split time must be inside the period.'],
    ['before the start', 'morning', at(8), 'Split time must be inside the period.'],
    ['after the end', 'morning', at(13), 'Split time must be inside the period.'],
    [
      'a 1.5 s period in its middle',
      'short',
      '2026-09-15T09:00:00.750Z',
      'Each part must last at least 1 second.'
    ],
    [
      'leaving only the first part under 1 s',
      'morning',
      '2026-09-15T09:00:00.500Z',
      'Each part must last at least 1 second.'
    ],
    [
      'leaving only the second part under 1 s',
      'morning',
      '2026-09-15T11:59:59.500Z',
      'Each part must last at least 1 second.'
    ],
    ['an invalid date', 'morning', 'not-a-date', 'Split time must be a valid date.']
  ])(
    'rejects a split %s and leaves the log unrewritten (HTSK-29..31)',
    (_name, id, time, error) => {
      const t = setup({ periods: [morning, shortPeriod] })
      const snapshotBefore = t.tracker.snapshot()
      const emits = t.emits()

      expect(t.tracker.splitPeriod(id, time)).toEqual({ ok: false, error })

      expect(t.store.rewrites).toEqual([])
      expect(t.tracker.snapshot()).toEqual(snapshotBefore)
      expect(t.emits()).toBe(emits)
    }
  )

  it('rejects the open period and a deleted id (HTSK-32)', () => {
    const t = setup({ periods: [morning] })
    t.tracker.started(meta())
    const openId = t.tracker.snapshot().open[0].id

    expect(t.tracker.splitPeriod(openId, iso(T0))).toEqual({
      ok: false,
      error: 'This period is still open.'
    })
    expect(t.tracker.splitPeriod('deleted', at(10))).toEqual({
      ok: false,
      error: 'This period no longer exists.'
    })
    expect(t.store.rewrites).toEqual([])
  })

  it('splits a period crossing local midnight at its exact instants', () => {
    const start = new Date(2026, 8, 14, 23, 0, 0).toISOString()
    const midnight = new Date(2026, 8, 15, 0, 0, 0).toISOString()
    const end = new Date(2026, 8, 15, 1, 30, 0).toISOString()
    const t = setup({ periods: [{ ...morning, start, end }] })

    expect(t.tracker.splitPeriod('morning', midnight)).toEqual({ ok: true })

    expect(t.store.rewrites[0].map((p) => [p.id, p.start, p.end])).toEqual([
      ['morning', start, midnight],
      ['p1', midnight, end]
    ])
  })
})

describe('TimeTracker asynchronous attribution (PERF-21)', () => {
  const NULLS: PeriodSnapshotFields = {
    workspacePath: null,
    repoName: null,
    branch: null,
    taskId: null,
    taskTitle: null
  }

  /** A tracker whose sync snapshot is the cache miss and whose async read the test settles. */
  function asyncSetup(): Harness & {
    settle: (value: PeriodSnapshotFields | Error) => Promise<void>
    reads: string[]
  } {
    const clock = { now: T0 }
    const store = fakeStore()
    const resolved: string[] = []
    const reads: string[] = []
    const pending: { resolve: (v: PeriodSnapshotFields) => void; reject: (e: Error) => void }[] = []
    let ids = 0
    let emits = 0
    const tracker = new TimeTracker({
      store,
      now: () => clock.now,
      newId: () => `p${++ids}`,
      resolveSnapshot: (cwd) => {
        resolved.push(cwd)
        return NULLS
      },
      resolveSnapshotAsync: (cwd) =>
        new Promise((resolve, reject) => {
          reads.push(cwd)
          pending.push({ resolve, reject })
        }),
      pinnedTitle: (id) => PINNED.get(id) ?? null,
      emit: () => {
        emits++
      }
    })
    return {
      tracker,
      store,
      resolved,
      reads,
      advance: (ms: number) => {
        clock.now += ms
      },
      emits: () => emits,
      settle: async (value) => {
        const next = pending.shift()!
        if (value instanceof Error) next.reject(value)
        else next.resolve(value)
        await new Promise((r) => setTimeout(r, 0))
      }
    }
  }

  it('opens on the cached attribution and starts one async read for the cwd (AC 5)', () => {
    const t = asyncSetup()
    t.tracker.started(meta())
    expect(t.tracker.snapshot().open[0]).toMatchObject(NULLS)
    expect(t.reads).toEqual(['D:\\acme\\app-12345'])
  })

  it('patches an open period in place, rewrites the sidecar and emits (AC 6)', async () => {
    const t = asyncSetup()
    t.tracker.started(meta())
    const writes = t.store.openWrites.length
    const emits = t.emits()
    await t.settle(SNAPSHOT)
    const open = t.tracker.snapshot().open[0]
    expect(open).toEqual({
      id: 'p1',
      sessionId: 's1',
      agent: 'Claude',
      cwd: 'D:\\acme\\app-12345',
      ...SNAPSHOT,
      start: iso(T0),
      lastSeen: iso(T0)
    })
    expect(t.store.openWrites.length).toBe(writes + 1)
    expect(t.store.openWrites.at(-1)).toEqual([open])
    expect(t.emits()).toBe(emits + 1)
  })

  it('patches a period that already closed and was kept, rewriting the log and emitting (AC 6)', async () => {
    const t = asyncSetup()
    t.tracker.started(meta())
    t.advance(5 * SEC)
    t.tracker.ended('s1')
    const emits = t.emits()
    await t.settle(SNAPSHOT)
    const [period] = t.tracker.snapshot().periods
    expect(period).toEqual({
      id: 'p1',
      sessionId: 's1',
      agent: 'Claude',
      cwd: 'D:\\acme\\app-12345',
      ...SNAPSHOT,
      start: iso(T0),
      end: iso(T0 + 5 * SEC)
    })
    expect(t.store.rewrites).toEqual([[period]])
    expect(t.emits()).toBe(emits + 1)
  })

  it('changes nothing when the period was discarded under 1 s before the read answered (AC 7)', async () => {
    const t = asyncSetup()
    t.tracker.started(meta())
    t.advance(500)
    t.tracker.ended('s1')
    const emits = t.emits()
    const writes = t.store.openWrites.length
    await t.settle(SNAPSHOT)
    expect(t.tracker.snapshot().periods).toEqual([])
    expect(t.store.rewrites).toEqual([])
    expect(t.store.openWrites.length).toBe(writes)
    expect(t.emits()).toBe(emits)
  })

  it('writes and emits nothing when the read answers the attribution the period already has', async () => {
    const t = asyncSetup()
    t.tracker.started(meta())
    const emits = t.emits()
    const writes = t.store.openWrites.length
    await t.settle(NULLS)
    expect(t.store.openWrites.length).toBe(writes)
    expect(t.emits()).toBe(emits)
  })

  it('keeps the opened attribution when the read rejects (TIME-12)', async () => {
    const t = asyncSetup()
    t.tracker.started(meta())
    const emits = t.emits()
    await t.settle(new Error('git exploded'))
    expect(t.tracker.snapshot().open[0]).toMatchObject(NULLS)
    expect(t.emits()).toBe(emits)
  })

  it('keeps a hand-set task over the branch the read reports (HTSK-10)', async () => {
    const t = asyncSetup()
    t.tracker.started({ ...meta(), task: { id: 67890, title: 'Widget export' } })
    await t.settle(SNAPSHOT)
    expect(t.tracker.snapshot().open[0]).toMatchObject({
      branch: 'feature/12345-fix-login-redirect',
      repoName: 'app',
      taskId: 67890,
      taskTitle: 'Widget export',
      taskByHand: true
    })
  })
})
