import { describe, expect, it } from 'vitest'
import type { OpenPeriod, TimePeriod, TimeSnapshot } from '../../../shared/time'
import { buildWeekReport, weekRange, type WeekReport } from './hours-report'

const MIN = 60_000
const HOUR = 60 * MIN
/** Local instant in September 2026; the week of the 14th runs Mon 14 → Sun 20. */
const at = (d: number, h: number, mi = 0, s = 0): number => new Date(2026, 8, d, h, mi, s).getTime()
const iso = (ms: number): string => new Date(ms).toISOString()

const WEEK = weekRange(new Date(2026, 8, 16, 12))
const NOW = at(21, 9)

interface Fields {
  id?: string
  sessionId?: string
  agent?: string
  cwd?: string
  taskId?: number | null
  taskTitle?: string | null
  start: number
}

function fields(p: Fields): Omit<TimePeriod, 'end'> {
  return {
    id: p.id ?? `p-${p.start}`,
    sessionId: p.sessionId ?? 's1',
    agent: p.agent ?? 'Claude',
    cwd: p.cwd ?? 'D:\\acme\\app-12345',
    workspacePath: 'D:\\acme',
    repoName: 'app',
    branch: null,
    taskId: p.taskId === undefined ? 12345 : p.taskId,
    taskTitle: p.taskTitle ?? null,
    start: iso(p.start)
  }
}

const closed = (p: Fields & { end: number }): TimePeriod => ({ ...fields(p), end: iso(p.end) })
const open = (p: Fields): OpenPeriod => ({ ...fields(p), lastSeen: iso(p.start) })
const snap = (s: Partial<TimeSnapshot>): TimeSnapshot => ({
  periods: [],
  open: [],
  paused: [],
  ...s
})
const report = (
  s: Partial<TimeSnapshot>,
  now = NOW,
  titles = new Map<number, string>()
): WeekReport => buildWeekReport(snap(s), now, WEEK.start, titles)

describe('weekRange', () => {
  it('starts on the Monday before a Sunday and ends the next Monday (TIME-32)', () => {
    expect(weekRange(new Date(2026, 8, 20, 23, 59))).toEqual({ start: at(14, 0), end: at(21, 0) })
  })

  it('starts on the same day for a Monday', () => {
    expect(weekRange(new Date(2026, 8, 14, 0, 0))).toEqual({ start: at(14, 0), end: at(21, 0) })
  })
})

describe('buildWeekReport', () => {
  it('has no days and a zero total for an empty week (TIME-43)', () => {
    expect(report({})).toEqual({ totalMs: 0, days: [] })
  })

  it('lists days with time newest first (TIME-34)', () => {
    const r = report({
      periods: [
        closed({ start: at(14, 9), end: at(14, 10) }),
        closed({ start: at(16, 9), end: at(16, 10) })
      ]
    })
    expect(r.days.map((d) => d.date.getDate())).toEqual([16, 14])
  })

  it('totals a day as the union of all its periods, parallel tasks counted once (TIME-34)', () => {
    const r = report({
      periods: [
        closed({ taskId: 12345, start: at(16, 9), end: at(16, 11) }),
        closed({ taskId: 777, start: at(16, 10), end: at(16, 12) })
      ]
    })
    expect(r.days[0].totalMs).toBe(3 * HOUR)
    expect(r.totalMs).toBe(3 * HOUR)
    expect(r.days[0].groups.map((g) => [g.key, g.totalMs])).toEqual([
      ['task:12345', 2 * HOUR],
      ['task:777', 2 * HOUR]
    ])
  })

  it('groups one day by task id, across worktrees, with the union total (TIME-35)', () => {
    const r = report({
      periods: [
        closed({ cwd: 'D:\\acme\\app-12345', start: at(16, 9), end: at(16, 10) }),
        closed({ cwd: 'D:\\acme\\api-12345', start: at(16, 9, 30), end: at(16, 10, 30) })
      ]
    })
    expect(r.days[0].groups).toHaveLength(1)
    expect(r.days[0].groups[0]).toMatchObject({
      key: 'task:12345',
      taskId: 12345,
      label: 'Task #12345',
      totalMs: 90 * MIN
    })
  })

  it('groups task-less periods per cwd as "No task · <folder leaf>" (TIME-35)', () => {
    const r = report({
      periods: [
        closed({ taskId: null, cwd: 'D:\\acme\\scratch', start: at(16, 9), end: at(16, 10) }),
        closed({ taskId: null, cwd: 'd:\\ACME\\scratch', start: at(16, 11), end: at(16, 12) }),
        closed({ taskId: null, cwd: 'D:\\contoso\\docs', start: at(16, 13), end: at(16, 14) })
      ]
    })
    expect(r.days[0].groups.map((g) => [g.label, g.taskId, g.totalMs])).toEqual([
      ['No task · scratch', null, 2 * HOUR],
      ['No task · docs', null, HOUR]
    ])
  })

  it('labels a task with the live title first, then the snapshot title (TIME-40)', () => {
    const periods = [
      closed({ taskId: 12345, taskTitle: 'Old title', start: at(16, 9), end: at(16, 10) }),
      closed({ taskId: 777, taskTitle: 'Snapshot title', start: at(16, 11), end: at(16, 12) })
    ]
    const r = report({ periods }, NOW, new Map([[12345, 'Fix login redirect']]))
    expect(r.days[0].groups.map((g) => g.label)).toEqual([
      'Task #12345 Fix login redirect',
      'Task #777 Snapshot title'
    ])
  })

  it('merges overlapping periods into one block measured as their union (TIME-36)', () => {
    const r = report({
      periods: [
        closed({ sessionId: 's1', start: at(16, 9), end: at(16, 10) }),
        closed({ sessionId: 's2', start: at(16, 9, 30), end: at(16, 11) })
      ]
    })
    const blocks = r.days[0].groups[0].blocks
    expect(blocks.map((b) => [b.start, b.end, b.durationMs])).toEqual([
      [at(16, 9), at(16, 11), 2 * HOUR]
    ])
  })

  it('merges periods 60 s apart and keeps 61 s apart separate (TIME-36)', () => {
    const r = report({
      periods: [
        closed({ start: at(16, 9), end: at(16, 10) }),
        closed({ start: at(16, 10, 1), end: at(16, 11) }),
        closed({ start: at(16, 11, 1, 1), end: at(16, 12) })
      ]
    })
    const blocks = r.days[0].groups[0].blocks
    expect(blocks.map((b) => [b.start, b.end, b.durationMs])).toEqual([
      [at(16, 9), at(16, 11), 2 * HOUR - MIN],
      [at(16, 11, 1, 1), at(16, 12), 59 * MIN - 1000]
    ])
  })

  it('splits a period crossing midnight onto both days (TIME-37)', () => {
    const r = report({ periods: [closed({ start: at(16, 23), end: at(17, 1, 30) })] })
    expect(r.days.map((d) => [d.date.getDate(), d.totalMs])).toEqual([
      [17, 90 * MIN],
      [16, HOUR]
    ])
    expect(r.days[1].groups[0].blocks[0]).toMatchObject({ start: at(16, 23), end: at(17, 0) })
  })

  it('measures an open period up to now (TIME-42)', () => {
    const r = report({ open: [open({ start: at(18, 14) })] }, at(18, 15, 20))
    expect(r.days[0].totalMs).toBe(80 * MIN)
    expect(r.days[0].groups[0].blocks[0].periods[0]).toMatchObject({
      open: true,
      end: at(18, 15, 20)
    })
  })

  it('excludes time outside the week and clips periods crossing its bounds (TIME-32)', () => {
    const r = report({
      periods: [
        closed({ start: at(10, 9), end: at(10, 17) }),
        closed({ start: at(13, 23), end: at(14, 1) }),
        closed({ start: at(21, 9), end: at(21, 10) })
      ]
    })
    expect(r.days.map((d) => [d.date.getDate(), d.totalMs])).toEqual([[14, HOUR]])
    expect(r.totalMs).toBe(HOUR)
  })

  it('attaches each raw period to the block it belongs to, with start, end, duration and agent (TIME-38)', () => {
    const r = report({
      periods: [
        closed({ id: 'a', agent: 'Claude', start: at(16, 9), end: at(16, 10) }),
        closed({ id: 'b', agent: 'opencode', start: at(16, 9, 30), end: at(16, 10, 30) }),
        closed({ id: 'c', agent: 'Claude', start: at(16, 14), end: at(16, 15) })
      ]
    })
    const blocks = r.days[0].groups[0].blocks
    expect(
      blocks.map((b) =>
        b.periods.map((p) => [p.period.id, p.period.agent, p.start, p.end, p.durationMs])
      )
    ).toEqual([
      [
        ['a', 'Claude', at(16, 9), at(16, 10), HOUR],
        ['b', 'opencode', at(16, 9, 30), at(16, 10, 30), HOUR]
      ],
      [['c', 'Claude', at(16, 14), at(16, 15), HOUR]]
    ])
  })
})
