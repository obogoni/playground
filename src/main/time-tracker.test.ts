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

function setup(init: { periods?: TimePeriod[]; open?: OpenPeriod[] } = {}): Harness {
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
      return SNAPSHOT
    },
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
