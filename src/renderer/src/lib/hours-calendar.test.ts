import { describe, expect, it } from 'vitest'
import type { TimePeriod, TimeSnapshot } from '../../../shared/time'
import { buildWeekReport, weekRange, type WeekReport } from './hours-report'
import { timeAxis, weekColumns } from './hours-calendar'

const MIN = 60_000
const HOUR = 60 * MIN
/** Local instant in September 2026; the week of the 14th runs Mon 14 → Sun 20. */
const at = (d: number, h: number, mi = 0, s = 0): number => new Date(2026, 8, d, h, mi, s).getTime()
const iso = (ms: number): string => new Date(ms).toISOString()

const WEEK = weekRange(new Date(2026, 8, 16, 12))
/** A Monday after the week of the 14th, so every day of it is past. */
const LATER = at(21, 9)

interface Fields {
  id?: string
  sessionId?: string
  cwd?: string
  taskId?: number | null
  start: number
}

function fields(p: Fields): Omit<TimePeriod, 'end'> {
  return {
    id: p.id ?? `p-${p.start}`,
    sessionId: p.sessionId ?? 's1',
    agent: 'Claude',
    cwd: p.cwd ?? 'D:\\acme\\app-12345',
    workspacePath: 'D:\\acme',
    repoName: 'app',
    branch: null,
    taskId: p.taskId === undefined ? 12345 : p.taskId,
    taskTitle: null,
    start: iso(p.start)
  }
}

const closed = (p: Fields & { end: number }): TimePeriod => ({ ...fields(p), end: iso(p.end) })
const report = (s: Partial<TimeSnapshot>, now = LATER): WeekReport =>
  buildWeekReport({ periods: [], open: [], paused: [], ...s }, now, WEEK.start, new Map())

const dates = (cols: { date: Date }[]): number[] => cols.map((c) => c.date.getDate())

describe('weekColumns', () => {
  it('always shows Monday to Friday in order, empty with no time (HCAL-01, HCAL-07)', () => {
    const cols = weekColumns(report({}), WEEK.start, LATER)
    expect(dates(cols)).toEqual([14, 15, 16, 17, 18])
    expect(cols.map((c) => c.date.getTime())).toEqual([
      at(14, 0),
      at(15, 0),
      at(16, 0),
      at(17, 0),
      at(18, 0)
    ])
    expect(cols.every((c) => c.day === null && c.totalMs === 0)).toBe(true)
  })

  it('adds Saturday only when it holds time, without Sunday (HCAL-02)', () => {
    const cols = weekColumns(
      report({ periods: [closed({ start: at(19, 10), end: at(19, 11) })] }),
      WEEK.start,
      LATER
    )
    expect(dates(cols)).toEqual([14, 15, 16, 17, 18, 19])
  })

  it('adds Sunday only when it holds time, without Saturday (HCAL-02)', () => {
    const cols = weekColumns(
      report({ periods: [closed({ start: at(20, 10), end: at(20, 11) })] }),
      WEEK.start,
      LATER
    )
    expect(dates(cols)).toEqual([14, 15, 16, 17, 18, 20])
  })

  it("totals each column as its day's union, zero when empty (HCAL-03)", () => {
    const r = report({
      periods: [
        closed({ id: 'a', sessionId: 's1', start: at(16, 9), end: at(16, 11) }),
        closed({ id: 'b', sessionId: 's2', taskId: 777, start: at(16, 10), end: at(16, 12) })
      ]
    })
    const cols = weekColumns(r, WEEK.start, LATER)
    const wednesday = cols.find((c) => c.date.getDate() === 16)
    expect(wednesday?.totalMs).toBe(3 * HOUR)
    expect(wednesday?.day).toBe(r.days[0])
    expect(cols.filter((c) => c.date.getDate() !== 16).map((c) => c.totalMs)).toEqual([0, 0, 0, 0])
  })

  it('marks today and dims later days only when the week contains now (HCAL-04, HCAL-05)', () => {
    const now = at(16, 15, 30)
    const current = weekColumns(report({}, now), WEEK.start, now)
    expect(current.map((c) => c.isToday)).toEqual([false, false, true, false, false])
    expect(current.map((c) => c.isFuture)).toEqual([false, false, false, true, true])

    const past = weekColumns(report({}), WEEK.start, LATER)
    expect(past.some((c) => c.isToday || c.isFuture)).toBe(false)
  })
})

describe('timeAxis', () => {
  it('rounds the earliest start down and the latest end up to whole hours (HCAL-09)', () => {
    const r = report({
      periods: [
        closed({ id: 'a', start: at(14, 9, 10), end: at(14, 12) }),
        closed({ id: 'b', start: at(17, 14), end: at(17, 17, 40) })
      ]
    })
    expect(timeAxis(r)).toEqual({ startHour: 9, endHour: 18 })
  })

  it('widens a short span symmetrically to 8 hours, kept within the day (HCAL-09)', () => {
    const mid = report({ periods: [closed({ start: at(15, 10), end: at(15, 11) })] })
    expect(timeAxis(mid)).toEqual({ startHour: 7, endHour: 15 })

    const early = report({ periods: [closed({ start: at(15, 1), end: at(15, 2) })] })
    expect(timeAxis(early)).toEqual({ startHour: 0, endHour: 8 })

    const late = report({ periods: [closed({ start: at(15, 23), end: at(15, 23, 30) })] })
    expect(timeAxis(late)).toEqual({ startHour: 16, endHour: 24 })
  })

  it('spans blocks on different days without clipping either (HCAL-09)', () => {
    const r = report({
      periods: [
        closed({ id: 'a', start: at(14, 3), end: at(14, 4) }),
        closed({ id: 'b', start: at(15, 17), end: at(15, 18) })
      ]
    })
    expect(timeAxis(r)).toEqual({ startHour: 3, endHour: 18 })
  })

  it('shows 09–17 for an empty week (HCAL-09)', () => {
    expect(timeAxis(report({}))).toEqual({ startHour: 9, endHour: 17 })
  })

  it('keeps an 8-hour axis around a single sub-minute block (edge case)', () => {
    const r = report({ periods: [closed({ start: at(16, 12), end: at(16, 12, 0, 30) })] })
    const axis = timeAxis(r)
    expect(axis).toEqual({ startHour: 9, endHour: 17 })
    expect(axis.endHour - axis.startHour).toBe(8)
  })
})
