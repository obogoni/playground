import { describe, expect, it } from 'vitest'
import type { OpenPeriod, TimePeriod, TimeSnapshot } from '../../../shared/time'
import {
  currentRunMs,
  intervalsOf,
  sessionTotalMs,
  taskTotalMs,
  worktreeTotalMs
} from './time-totals'

const MIN = 60_000
const HOUR = 60 * MIN
const at = (h: number, mi = 0): number => new Date(2026, 8, 16, h, mi).getTime()
const iso = (ms: number): string => new Date(ms).toISOString()

const WT = 'D:\\acme\\app-12345'

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

function closed(p: Fields & { end: number }): TimePeriod {
  return { ...fields(p), id: `p-${p.start}-${p.end}`, end: iso(p.end) }
}

function open(p: Fields): OpenPeriod {
  return { ...fields(p), id: `o-${p.start}`, lastSeen: iso(p.start) }
}

function snap(s: Partial<TimeSnapshot>): TimeSnapshot {
  return { periods: [], open: [], paused: [], ...s }
}

describe('intervalsOf', () => {
  it('ends open periods at now and keeps closed ones as recorded', () => {
    const s = snap({
      periods: [closed({ start: at(9), end: at(10) })],
      open: [open({ start: at(11) })]
    })
    expect(intervalsOf(s, at(11, 30)).map(({ start, end }) => [start, end])).toEqual([
      [at(9), at(10)],
      [at(11), at(11, 30)]
    ])
  })
})

describe('sessionTotalMs', () => {
  it('sums every run of the session, the open period measured up to now (TIME-24)', () => {
    const s = snap({
      periods: [
        closed({ start: at(9), end: at(10) }),
        closed({ start: at(10, 30), end: at(11) }),
        closed({ sessionId: 's2', start: at(9), end: at(12) })
      ],
      open: [open({ start: at(13) })]
    })
    expect(sessionTotalMs(s, 's1', at(13, 15))).toBe(HOUR + 30 * MIN + 15 * MIN)
  })

  it('stops growing while the session is paused (TIME-17)', () => {
    const s = snap({ periods: [closed({ start: at(9), end: at(10) })], paused: ['s1'] })
    expect(sessionTotalMs(s, 's1', at(10, 5))).toBe(HOUR)
    expect(sessionTotalMs(s, 's1', at(15))).toBe(HOUR)
  })

  it('renders zero for a session with no time (TIME-30)', () => {
    expect(sessionTotalMs(snap({}), 's1', at(9))).toBe(0)
  })
})

describe('currentRunMs', () => {
  it('measures only the open period, up to now (TIME-23)', () => {
    const s = snap({
      periods: [closed({ start: at(9), end: at(10) })],
      open: [open({ start: at(11) })]
    })
    expect(currentRunMs(s, 's1', at(11, 20))).toBe(20 * MIN)
  })

  it('is zero when the session has no open period', () => {
    const s = snap({ periods: [closed({ start: at(9), end: at(10) })] })
    expect(currentRunMs(s, 's1', at(11))).toBe(0)
  })
})

describe('worktreeTotalMs', () => {
  it('counts two sessions of the same worktree 09–10 as 1 h (TIME-28)', () => {
    const s = snap({
      periods: [
        closed({ sessionId: 's1', start: at(9), end: at(10) }),
        closed({ sessionId: 's2', start: at(9), end: at(10) })
      ]
    })
    expect(worktreeTotalMs(s, WT, at(12))).toBe(HOUR)
  })

  it('matches the cwd case-insensitively and ignores other worktrees (TIME-25)', () => {
    const s = snap({
      periods: [
        closed({ cwd: 'd:\\ACME\\APP-12345', start: at(9), end: at(10) }),
        closed({ cwd: 'D:\\acme\\app-777', start: at(10), end: at(12) })
      ],
      open: [open({ start: at(13) })]
    })
    expect(worktreeTotalMs(s, WT, at(13, 30))).toBe(90 * MIN)
  })

  it('keeps periods of a removed session (TIME-29)', () => {
    const s = snap({ periods: [closed({ sessionId: 'gone', start: at(9), end: at(10) })] })
    expect(worktreeTotalMs(s, WT, at(12))).toBe(HOUR)
  })

  it('is zero for a worktree with no time (TIME-30)', () => {
    expect(worktreeTotalMs(snap({}), WT, at(12))).toBe(0)
  })
})

describe('taskTotalMs', () => {
  it('unions the periods carrying the task id across worktrees (TIME-26)', () => {
    const s = snap({
      periods: [
        closed({ cwd: WT, start: at(9), end: at(10) }),
        closed({ cwd: 'D:\\acme\\api-12345', start: at(9, 30), end: at(11) }),
        closed({ taskId: 777, start: at(11), end: at(12) }),
        closed({ taskId: null, start: at(12), end: at(13) })
      ]
    })
    expect(taskTotalMs(s, 12345, at(14))).toBe(2 * HOUR)
  })

  it('is zero for a task with no time (TIME-30)', () => {
    expect(taskTotalMs(snap({}), 12345, at(14))).toBe(0)
  })
})
