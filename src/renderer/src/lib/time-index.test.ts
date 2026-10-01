import { describe, expect, it } from 'vitest'
import type { OpenPeriod, TimePeriod, TimeSnapshot } from '../../../shared/time'
import { timeIndex } from './time-index'
import { currentRunMs, sessionTotalMs, taskTotalMs, worktreeTotalMs } from './time-totals'

const MIN = 60_000
const at = (h: number, mi = 0, s = 0, ms = 0): number =>
  new Date(2026, 8, 16, h, mi, s, ms).getTime()
const iso = (ms: number): string => new Date(ms).toISOString()

const WT = 'D:\\acme\\app-12345'
const WT_UPPER = 'D:\\ACME\\APP-12345'
const OTHER = 'D:\\acme\\app-777'

interface Fields {
  sessionId?: string
  cwd?: string
  taskId?: number | null
  start: number
}

function fields(p: Fields): Omit<TimePeriod, 'id' | 'end'> {
  return {
    sessionId: p.sessionId ?? 's1',
    agent: 'Claude',
    cwd: p.cwd ?? WT,
    workspacePath: 'D:\\acme',
    repoName: 'app',
    branch: 'feature/12345-fix-login-redirect',
    taskId: p.taskId === undefined ? 12345 : p.taskId,
    taskTitle: null,
    start: iso(p.start)
  }
}

let seq = 0
function closed(p: Fields & { end: number }): TimePeriod {
  return { ...fields(p), id: `p-${seq++}`, end: iso(p.end) }
}

function open(p: Fields): OpenPeriod {
  return { ...fields(p), id: `o-${seq++}`, lastSeen: iso(p.start) }
}

function snap(s: Partial<TimeSnapshot>): TimeSnapshot {
  return { periods: [], open: [], paused: [], ...s }
}

/** The fixture shapes PERF-14 AC 3 names, each compared against `time-totals.ts`. */
const FIXTURES: Record<string, () => TimeSnapshot> = {
  empty: () => snap({}),
  'overlapping closed periods': () =>
    snap({
      periods: [
        closed({ sessionId: 's1', start: at(9), end: at(10) }),
        closed({ sessionId: 's2', start: at(9, 30), end: at(10, 30) }),
        closed({ sessionId: 's1', start: at(10, 30), end: at(11) }),
        closed({ sessionId: 's3', start: at(13), end: at(13, 20, 7, 123), taskId: 777 })
      ]
    }),
  'several open periods': () =>
    snap({
      periods: [closed({ sessionId: 's1', start: at(8), end: at(8, 45) })],
      open: [
        open({ sessionId: 's1', start: at(14) }),
        open({ sessionId: 's2', start: at(14, 10, 3, 9) }),
        open({ sessionId: 's3', start: at(15), cwd: OTHER, taskId: 777 })
      ]
    }),
  'case-differing cwd': () =>
    snap({
      periods: [
        closed({ sessionId: 's1', cwd: WT, start: at(9), end: at(10) }),
        closed({ sessionId: 's2', cwd: WT_UPPER, start: at(9, 30), end: at(11) }),
        closed({ sessionId: 's3', cwd: OTHER, start: at(12), end: at(13), taskId: null })
      ],
      open: [open({ sessionId: 's4', cwd: WT_UPPER, start: at(14) })]
    }),
  'open overlapping a closed one': () =>
    snap({
      periods: [
        closed({ sessionId: 's1', start: at(9), end: at(10) }),
        closed({ sessionId: 's2', start: at(13), end: at(15) }),
        closed({ sessionId: 's2', start: at(15, 30), end: at(16) })
      ],
      open: [
        open({ sessionId: 's1', start: at(14) }),
        open({ sessionId: 's3', cwd: WT_UPPER, start: at(14, 30) })
      ]
    })
}

/** Before every open start (open periods measure 0), mid-way, and after everything. */
const NOWS = [at(13, 59, 59, 999), at(14, 45, 12, 345), at(18)]
const SESSIONS = ['s1', 's2', 's3', 's4', 'missing']
const CWDS = [WT, WT_UPPER, OTHER, 'D:\\nowhere']
const TASKS = [12345, 777, 4242]

describe('timeIndex equals time-totals (PERF-14 AC 3)', () => {
  for (const [name, make] of Object.entries(FIXTURES)) {
    describe(name, () => {
      const s = make()
      const index = timeIndex(s)
      for (const now of NOWS) {
        it(`sessionTotalMs and currentRunMs at ${iso(now)}`, () => {
          for (const id of SESSIONS) {
            expect(index.sessionTotalMs(id, now)).toBe(sessionTotalMs(s, id, now))
            expect(index.currentRunMs(id, now)).toBe(currentRunMs(s, id, now))
          }
        })
        it(`worktreeTotalMs at ${iso(now)}`, () => {
          for (const cwd of CWDS) {
            expect(index.worktreeTotalMs(cwd, now)).toBe(worktreeTotalMs(s, cwd, now))
          }
        })
        it(`taskTotalMs at ${iso(now)}`, () => {
          for (const task of TASKS) {
            expect(index.taskTotalMs(task, now)).toBe(taskTotalMs(s, task, now))
          }
        })
      }
    })
  }

  it('pins concrete values for the overlap fixture so the oracle cannot drift silently', () => {
    const s = FIXTURES['open overlapping a closed one']()
    const index = timeIndex(s)
    const now = at(15, 45)
    // 09–10 plus 13–16: the open 14:00 and 14:30 runs (to 15:45) sit inside 13–15 ∪ 15:30–16.
    expect(index.worktreeTotalMs(WT, now)).toBe(60 * MIN + 180 * MIN)
    expect(index.currentRunMs('s1', now)).toBe(105 * MIN)
    expect(index.sessionTotalMs('s2', now)).toBe(120 * MIN + 30 * MIN)
  })
})

describe('timeIndex cache (Edge Case: rebuilt once per snapshot)', () => {
  it('returns the same index for the same snapshot', () => {
    const s = FIXTURES['several open periods']()
    expect(timeIndex(s)).toBe(timeIndex(s))
  })

  it('returns a new index for a new snapshot, reflecting its periods', () => {
    const a = FIXTURES['several open periods']()
    const b = snap({ periods: [...a.periods, closed({ start: at(6), end: at(7) })], open: a.open })
    const ia = timeIndex(a)
    const ib = timeIndex(b)
    expect(ib).not.toBe(ia)
    expect(ib.sessionTotalMs('s1', at(18)) - ia.sessionTotalMs('s1', at(18))).toBe(60 * MIN)
  })
})

/** Wraps `periods` in a proxy that counts reads of each element. */
function counted(s: TimeSnapshot): { snapshot: TimeSnapshot; reads: Map<number, number> } {
  const reads = new Map<number, number>()
  const periods = new Proxy(s.periods, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        const i = Number(prop)
        reads.set(i, (reads.get(i) ?? 0) + 1)
      }
      return Reflect.get(target, prop, receiver)
    }
  })
  return { snapshot: { ...s, periods }, reads }
}

describe('timeIndex never visits closed periods per tick (PERF-14 AC 2)', () => {
  it('reads each closed period once to build, and none over 100 calls at different now', () => {
    const base = FIXTURES['open overlapping a closed one']()
    const { snapshot, reads } = counted(base)
    const index = timeIndex(snapshot)
    expect([...reads.keys()].sort()).toEqual([0, 1, 2])
    expect([...reads.values()]).toEqual([1, 1, 1])

    reads.clear()
    for (let i = 0; i < 100; i++) {
      const now = at(14) + i * 37_000
      index.sessionTotalMs('s1', now)
      index.currentRunMs('s2', now)
      index.worktreeTotalMs(WT, now)
      index.taskTotalMs(12345, now)
      timeIndex(snapshot).worktreeTotalMs(WT_UPPER, now)
    }
    expect(reads.size).toBe(0)
  })
})
