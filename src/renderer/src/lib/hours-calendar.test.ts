import { describe, expect, it } from 'vitest'
import type { OpenPeriod, TimePeriod, TimeSnapshot } from '../../../shared/time'
import { buildWeekReport, weekRange, type Block, type WeekReport } from './hours-report'
import {
  assignColours,
  barBox,
  defaultDay,
  layoutLanes,
  legendEntries,
  roleOf,
  timeAxis,
  weekColumns,
  type LaidOutBlock
} from './hours-calendar'

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
const open = (p: Fields): OpenPeriod => ({ ...fields(p), lastSeen: iso(p.start) })
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

describe('layoutLanes', () => {
  /** A block on Wednesday from `from` to `to`, in fractional hours. */
  const block = (from: number, to: number): Block => ({
    start: at(16, 0) + from * HOUR,
    end: at(16, 0) + to * HOUR,
    durationMs: (to - from) * HOUR,
    periods: []
  })
  const lay = (...blocks: Block[]): LaidOutBlock[] =>
    layoutLanes(blocks.map((b, i) => ({ block: b, groupKey: `task:${i}` })))
  const placeOf = (laid: LaidOutBlock[], b: Block): [number, number] => {
    const item = laid.find((l) => l.block === b)
    return [item?.lane ?? -1, item?.lanes ?? -1]
  }

  const disjoint = [block(9, 10), block(11, 12), block(12, 13)]
  const pair = [block(9, 11), block(10, 12)]
  const chain = [block(9, 11), block(10, 13), block(12, 14)]
  const nested = [block(9, 17), block(10, 12), block(11, 13)]
  const four = [block(9, 12), block(9.5, 12), block(10, 12), block(10.5, 12)]

  it('keeps disjoint and touching blocks each in a single full-width lane (HCAL-10)', () => {
    const laid = lay(...disjoint)
    expect(disjoint.map((b) => placeOf(laid, b))).toEqual([
      [0, 1],
      [0, 1],
      [0, 1]
    ])
  })

  it('puts two overlapping blocks side by side (HCAL-10)', () => {
    const laid = lay(...pair)
    expect(pair.map((b) => placeOf(laid, b))).toEqual([
      [0, 2],
      [1, 2]
    ])
  })

  it('clusters a chain and lets the last block reuse the first lane (HCAL-10)', () => {
    const laid = lay(...chain)
    expect(chain.map((b) => placeOf(laid, b))).toEqual([
      [0, 2],
      [1, 2],
      [0, 2]
    ])
  })

  it('gives a block containing two overlapping others three lanes (HCAL-10)', () => {
    const laid = lay(...nested)
    expect(nested.map((b) => placeOf(laid, b))).toEqual([
      [0, 3],
      [1, 3],
      [2, 3]
    ])
  })

  it('narrows four simultaneous blocks into four lanes (edge case)', () => {
    const laid = lay(...four)
    expect(four.map((b) => placeOf(laid, b))).toEqual([
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4]
    ])
  })

  it('never lets two blocks in one lane overlap in time (HCAL-10)', () => {
    for (const blocks of [disjoint, pair, chain, nested, four]) {
      const laid = lay(...blocks)
      expect(laid).toHaveLength(blocks.length)
      for (const a of laid) {
        for (const b of laid) {
          if (a === b || a.lane !== b.lane) continue
          const overlaps = a.block.start < b.block.end && b.block.start < a.block.end
          expect(overlaps).toBe(false)
        }
        expect(a.lane).toBeLessThan(a.lanes)
      }
    }
  })
})

describe('assignColours and legendEntries', () => {
  /** `hours` of task `taskId` (or of a folder when null) on day `d`, from `from` o'clock. */
  const work = (taskId: number | null, d: number, from: number, hours: number): TimePeriod =>
    closed({
      id: `${taskId}-${d}-${from}`,
      sessionId: `s-${taskId}`,
      taskId,
      cwd: taskId === null ? 'D:\\acme\\scratch' : `D:\\acme\\app-${taskId}`,
      start: at(d, from),
      end: at(d, from) + hours * HOUR
    })

  it('gives the three tasks with the most week time the three slots in order (HCAL-11)', () => {
    const r = report({
      periods: [
        work(1, 14, 9, 1),
        work(2, 14, 11, 2),
        work(3, 15, 9, 4),
        // Task 1 also works Thursday: 1 h + 2.5 h = 3.5 h, above task 2's 2 h.
        work(1, 17, 9, 2.5)
      ]
    })
    const colours = assignColours(r)
    expect(colours.get('task:3')).toBe('slot1')
    expect(colours.get('task:1')).toBe('slot2')
    expect(colours.get('task:2')).toBe('slot3')
  })

  it('breaks a tie in week time by the earlier first start (HCAL-11)', () => {
    const r = report({ periods: [work(8, 15, 9, 2), work(9, 14, 13, 2)] })
    const colours = assignColours(r)
    expect(colours.get('task:9')).toBe('slot1')
    expect(colours.get('task:8')).toBe('slot2')
  })

  it('folds a fourth and fifth task into Other (HCAL-11)', () => {
    const r = report({
      periods: [
        work(1, 14, 8, 5),
        work(2, 14, 14, 4),
        work(3, 15, 8, 3),
        work(4, 15, 12, 2),
        work(5, 16, 8, 1)
      ]
    })
    const colours = assignColours(r)
    expect([1, 2, 3, 4, 5].map((id) => colours.get(`task:${id}`))).toEqual([
      'slot1',
      'slot2',
      'slot3',
      'other',
      'other'
    ])
  })

  it('makes every folder No task however large, and one task uses only slot 1 (HCAL-11)', () => {
    const r = report({ periods: [work(null, 14, 8, 9), work(7, 15, 9, 1)] })
    const colours = assignColours(r)
    expect(colours.get('cwd:d:\\acme\\scratch')).toBe('no-task')
    expect(colours.get('task:7')).toBe('slot1')
    expect([...colours.values()].filter((role) => role.startsWith('slot'))).toEqual(['slot1'])
  })

  it('lists slots, then Other tasks, then folders, each with its week total (HCAL-21)', () => {
    const r = report({
      periods: [
        work(null, 14, 6, 8),
        work(1, 14, 15, 1),
        work(2, 15, 9, 2),
        work(3, 15, 12, 3),
        work(4, 16, 9, 4),
        work(4, 17, 9, 1)
      ]
    })
    const legend = legendEntries(r, assignColours(r))
    expect(legend.map((e) => [e.label, e.role, e.totalMs])).toEqual([
      ['Task #4', 'slot1', 5 * HOUR],
      ['Task #3', 'slot2', 3 * HOUR],
      ['Task #2', 'slot3', 2 * HOUR],
      ['Task #1', 'other', 1 * HOUR],
      ['No task · scratch', 'no-task', 8 * HOUR]
    ])
  })

  it('keeps frozen colours while live time reorders tasks, new ones neutral (HCAL-24)', () => {
    const frozen = assignColours(report({ periods: [work(1, 14, 9, 3), work(2, 14, 13, 1)] }))
    // Later the same week task 2 overtakes task 1 and task 6 and a folder appear.
    const live = report({
      periods: [work(1, 14, 9, 3), work(2, 14, 13, 5), work(6, 15, 9, 9), work(null, 15, 19, 1)]
    })
    expect(roleOf(frozen, 'task:1')).toBe('slot1')
    expect(roleOf(frozen, 'task:2')).toBe('slot2')
    expect(roleOf(frozen, 'task:6')).toBe('other')
    expect(roleOf(frozen, 'cwd:d:\\acme\\scratch')).toBe('no-task')
    expect(legendEntries(live, frozen).map((e) => [e.groupKey, e.role, e.totalMs])).toEqual([
      ['task:1', 'slot1', 3 * HOUR],
      ['task:2', 'slot2', 5 * HOUR],
      ['task:6', 'other', 9 * HOUR],
      ['cwd:d:\\acme\\scratch', 'no-task', 1 * HOUR]
    ])
  })
})

describe('defaultDay', () => {
  it("selects today in the current week, even before today's first period (HCAL-16)", () => {
    const now = at(16, 8)
    const r = report({ periods: [closed({ start: at(14, 9), end: at(14, 10) })] }, now)
    expect(defaultDay(weekColumns(r, WEEK.start, now))?.getTime()).toBe(at(16, 0))
  })

  it('selects the latest day with time in a past week (HCAL-16)', () => {
    const r = report({
      periods: [
        closed({ id: 'a', start: at(14, 9), end: at(14, 10) }),
        closed({ id: 'b', start: at(19, 9), end: at(19, 10) }),
        closed({ id: 'c', start: at(16, 9), end: at(16, 10) })
      ]
    })
    expect(defaultDay(weekColumns(r, WEEK.start, LATER))?.getTime()).toBe(at(19, 0))
  })

  it('selects nothing in a past week without time (HCAL-17)', () => {
    expect(defaultDay(weekColumns(report({}), WEEK.start, LATER))).toBeNull()
  })
})

describe('barBox', () => {
  const blockOf = (r: WeekReport, d: number): Block => {
    const day = r.days.find((x) => x.date.getDate() === d)
    if (!day) throw new Error(`no day ${d}`)
    return day.groups[0].blocks[0]
  }

  it('places a block from its start to its end on the axis (HCAL-08)', () => {
    const r = report({ periods: [closed({ start: at(16, 12), end: at(16, 13, 30) })] })
    const box = barBox(blockOf(r, 16), { startHour: 9, endHour: 18 }, LATER)
    expect(box.topPct).toBeCloseTo(100 / 3, 6)
    expect(box.heightPct).toBeCloseTo(100 / 6, 6)
    expect(box.ongoing).toBe(false)
  })

  it('ends an open block at now and marks it ongoing, not its earlier-day part (HCAL-23)', () => {
    const now = at(16, 14, 30)
    const r = report({ open: [open({ start: at(15, 22) })] }, now)
    const axis = { startHour: 0, endHour: 24 }

    const today = barBox(blockOf(r, 16), axis, now)
    expect(today.ongoing).toBe(true)
    expect(today.topPct).toBe(0)
    expect(today.heightPct).toBeCloseTo((14.5 / 24) * 100, 6)

    const yesterday = barBox(blockOf(r, 15), axis, now)
    expect(yesterday.ongoing).toBe(false)
    expect(yesterday.topPct).toBeCloseTo((22 / 24) * 100, 6)
    expect(yesterday.heightPct).toBeCloseTo((2 / 24) * 100, 6)
  })

  it('draws the part after midnight at the top of its own day (HCAL-13)', () => {
    const r = report({ periods: [closed({ start: at(14, 23), end: at(15, 1) })] })
    const axis = timeAxis(r)
    expect(axis).toEqual({ startHour: 0, endHour: 24 })

    const monday = barBox(blockOf(r, 14), axis, LATER)
    expect(monday.topPct).toBeCloseTo((23 / 24) * 100, 6)
    expect(monday.topPct + monday.heightPct).toBeCloseTo(100, 6)

    const tuesday = barBox(blockOf(r, 15), axis, LATER)
    expect(tuesday.topPct).toBe(0)
    expect(tuesday.heightPct).toBeCloseTo((1 / 24) * 100, 6)
  })
})
