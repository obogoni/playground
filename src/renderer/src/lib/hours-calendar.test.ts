import { describe, expect, it } from 'vitest'
import type { OpenPeriod, TimePeriod, TimeSnapshot } from '../../../shared/time'
import { buildWeekReport, weekRange, type Block, type WeekReport } from './hours-report'
import {
  assignColours,
  barBox,
  dimmedGroups,
  layoutLanes,
  legendEntries,
  lookClass,
  roleOf,
  timeAxis,
  visibleColumns,
  weekColumns,
  type ColourRole,
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

  it('rounds a start past the half hour down, never clipping the bar (HCAL-09)', () => {
    const r = report({ periods: [closed({ start: at(14, 9, 40), end: at(14, 17, 40) })] })
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

  it('draws a lone block after a parallel pair at full width again (HCAL-10)', () => {
    const [a, b] = [block(9, 11), block(10, 12)]
    const touching = block(12, 13)
    const later = block(15, 16)
    const laid = lay(a, b, touching, later)
    expect([a, b, touching, later].map((x) => placeOf(laid, x))).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
      [0, 1]
    ])
  })

  it('reuses a lane whose block ends exactly when the next starts (HCAL-10)', () => {
    const blocks = [block(9, 11), block(10, 12), block(11, 12)]
    const laid = lay(...blocks)
    expect(blocks.map((b) => placeOf(laid, b))).toEqual([
      [0, 2],
      [1, 2],
      [0, 2]
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

  /** Tasks 1..n on day `d`, one per hour from 8, task k lasting less than task k - 1. */
  const crowdedDay = (n: number, d: number): TimePeriod[] =>
    Array.from({ length: n }, (_, i) => work(i + 1, d, 8 + i, (10 - i) / 10))

  /**
   * Tasks given as [taskId, days], listed in falling week time: the k-th of n
   * (from 0) has (n - k) × 12 minutes, split evenly over its days, from
   * 6:00 + k × 20 minutes.
   */
  const week = (...tasks: [number, number[]][]): TimePeriod[] =>
    tasks.flatMap(([taskId, days], k) =>
      days.map((d) => {
        const start = at(d, 6, k * 20)
        return closed({
          id: `${taskId}-${d}`,
          sessionId: `s-${taskId}`,
          taskId,
          cwd: `D:\\acme\\app-${taskId}`,
          start,
          end: start + ((tasks.length - k) * 12 * MIN) / days.length
        })
      })
    )

  /** Tasks `from`..`to`, each on `days`. */
  const range = (from: number, to: number, days: number[]): [number, number[]][] =>
    Array.from({ length: to - from + 1 }, (_, i) => [from + i, days])

  const looksOf = (colours: Map<string, ColourRole>, ids: number[]): (ColourRole | undefined)[] =>
    ids.map((id) => colours.get(`task:${id}`))

  const SOLIDS: ColourRole[] = [
    'slot1',
    'slot2',
    'slot3',
    'slot4',
    'slot5',
    'slot6',
    'slot7',
    'slot8'
  ]
  const HATCHES: ColourRole[] = [
    'slot1-hatched',
    'slot2-hatched',
    'slot3-hatched',
    'slot4-hatched',
    'slot5-hatched',
    'slot6-hatched',
    'slot7-hatched',
    'slot8-hatched'
  ]

  it('gives three tasks on one day slots 1 to 3 in order of week time (HTF-02, HTF-03)', () => {
    const r = report({
      periods: [
        work(1, 14, 9, 1),
        work(2, 14, 11, 2),
        work(3, 14, 13, 4),
        // Task 1 also works Thursday: 1 h + 2.5 h = 3.5 h, above task 2's 2 h.
        work(1, 17, 9, 2.5)
      ]
    })
    const colours = assignColours(r)
    expect(colours.get('task:3')).toBe('slot1')
    expect(colours.get('task:1')).toBe('slot2')
    expect(colours.get('task:2')).toBe('slot3')
  })

  it('gives two tasks on different days different solids (HHAT-03, HHAT-04)', () => {
    const r = report({ periods: [work(1, 14, 9, 5), work(2, 15, 9, 1)] })
    const colours = assignColours(r)
    expect(colours.get('task:1')).toBe('slot1')
    expect(colours.get('task:2')).toBe('slot2')
  })

  it('breaks a tie in week time by the earlier first start (HTF-02)', () => {
    const r = report({ periods: [work(8, 14, 13, 2), work(9, 14, 9, 2)] })
    const colours = assignColours(r)
    expect(colours.get('task:9')).toBe('slot1')
    expect(colours.get('task:8')).toBe('slot2')
  })

  it('skips the slots of every task sharing any of its days (HTF-02)', () => {
    const r = report({
      periods: [
        // Task 1 on Monday and Wednesday, task 2 on Monday and Tuesday, task 3 on
        // Tuesday and Wednesday: no day holds all three.
        work(1, 14, 8, 3),
        work(1, 16, 8, 3),
        work(2, 14, 12, 2),
        work(2, 15, 8, 2),
        work(3, 15, 12, 1),
        work(3, 16, 12, 1)
      ]
    })
    const colours = assignColours(r)
    expect([1, 2, 3].map((id) => colours.get(`task:${id}`))).toEqual(['slot1', 'slot2', 'slot3'])
  })

  it('gives eight tasks on one day eight different slots in palette order (HTF-01, HTF-03)', () => {
    const colours = assignColours(report({ periods: crowdedDay(8, 14) }))
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((id) => colours.get(`task:${id}`))).toEqual([
      'slot1',
      'slot2',
      'slot3',
      'slot4',
      'slot5',
      'slot6',
      'slot7',
      'slot8'
    ])
  })

  it('gives a ninth task on one day hatched blue (HHAT-05, HHAT-07)', () => {
    const colours = assignColours(report({ periods: crowdedDay(9, 14) }))
    expect(colours.get('task:8')).toBe('slot8')
    expect(colours.get('task:9')).toBe('slot1-hatched')
  })

  it('assigns no slot in a week of folders only (HTF edge case)', () => {
    const r = report({
      periods: [work(null, 14, 8, 2), { ...work(null, 15, 8, 1), cwd: 'D:\\acme\\notes' }]
    })
    const colours = assignColours(r)
    expect([...colours.values()]).toEqual(['no-task', 'no-task'])
  })

  it('makes every folder No task however large, and one task uses only slot 1 (HCAL-11)', () => {
    const r = report({ periods: [work(null, 14, 8, 9), work(7, 15, 9, 1)] })
    const colours = assignColours(r)
    expect(colours.get('cwd:d:\\acme\\scratch')).toBe('no-task')
    expect(colours.get('task:7')).toBe('slot1')
    expect([...colours.values()].filter((role) => role.startsWith('slot'))).toEqual(['slot1'])
  })

  it('lists coloured tasks in the order they were coloured, then folders (HCAL-21)', () => {
    const r = report({
      periods: [
        work(null, 16, 6, 8),
        ...crowdedDay(9, 14),
        // Task 10 has the least time, alone on Tuesday: every solid and hatched
        // blue are used, so it takes hatched orange.
        work(10, 15, 9, 0.05)
      ]
    })
    const legend = legendEntries(r, assignColours(r))
    expect(legend.map((e) => [e.label, e.role])).toEqual([
      ['Task #1', 'slot1'],
      ['Task #2', 'slot2'],
      ['Task #3', 'slot3'],
      ['Task #4', 'slot4'],
      ['Task #5', 'slot5'],
      ['Task #6', 'slot6'],
      ['Task #7', 'slot7'],
      ['Task #8', 'slot8'],
      ['Task #9', 'slot1-hatched'],
      ['Task #10', 'slot2-hatched'],
      ['No task · scratch', 'no-task']
    ])
    expect(legend[0].totalMs).toBe(1 * HOUR)
    expect(legend[10].totalMs).toBe(8 * HOUR)
  })

  it('gives seven tasks alone on their own days seven solids (HHAT-04, HHAT-09)', () => {
    const colours = assignColours(
      report({
        periods: week(...[1, 2, 3, 4, 5, 6, 7].map((id): [number, number[]] => [id, [13 + id]]))
      })
    )
    expect(looksOf(colours, [1, 2, 3, 4, 5, 6, 7])).toEqual([
      'slot1',
      'slot2',
      'slot3',
      'slot4',
      'slot5',
      'slot6',
      'slot7'
    ])
  })

  it('spreads ten tasks over five days as eight solids then two hatched, neighbours apart (HHAT-05, HHAT-08)', () => {
    // Task k on weekday (k - 1) mod 5: tasks 1 and 6 on Monday, 2 and 7 on Tuesday, …
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const r = report({
      periods: week(...ids.map((id): [number, number[]] => [id, [14 + ((id - 1) % 5)]]))
    })
    const legend = legendEntries(r, assignColours(r))
    expect(legend.map((e) => [e.label, e.role])).toEqual([
      ['Task #1', 'slot1'],
      ['Task #2', 'slot2'],
      ['Task #3', 'slot3'],
      ['Task #4', 'slot4'],
      ['Task #5', 'slot5'],
      ['Task #6', 'slot6'],
      ['Task #7', 'slot7'],
      ['Task #8', 'slot8'],
      ['Task #9', 'slot1-hatched'],
      ['Task #10', 'slot2-hatched']
    ])
  })

  it('takes a solid before a hatched look on a use tie, even one whose hue its day holds (HHAT-05)', () => {
    // Tasks 1 to 15 on Monday, task 16 on Monday and Wednesday, tasks 17 to 23 on
    // Tuesday, task 24 on Wednesday. Task 24 may take red or hatched blue to
    // hatched violet, each used once; Wednesday holds hatched red, so only solid
    // before hatched puts red ahead of hatched blue.
    const colours = assignColours(
      report({
        periods: week(...range(1, 15, [14]), [16, [14, 16]], ...range(17, 23, [15]), [24, [16]])
      })
    )
    expect(colours.get('task:16')).toBe('slot8-hatched')
    expect(colours.get('task:23')).toBe('slot7')
    expect(colours.get('task:24')).toBe('slot8')
  })

  it('gives sixteen tasks on one day the solids in palette order, then hatched 1 to 8 (HHAT-07, HHAT-10)', () => {
    const colours = assignColours(report({ periods: week(...range(1, 16, [14])) }))
    expect(
      looksOf(
        colours,
        range(1, 16, []).map(([id]) => id)
      )
    ).toEqual([...SOLIDS, ...HATCHES])
  })

  it('makes a seventeenth task on one day Other (HHAT-12)', () => {
    const colours = assignColours(report({ periods: week(...range(1, 17, [14])) }))
    expect(colours.get('task:16')).toBe('slot8-hatched')
    expect(colours.get('task:17')).toBe('other')
  })

  it('gives a hatched pick a hue no same-day task holds (HHAT-06)', () => {
    // Task 1 on Monday and Tuesday, tasks 2 to 8 on Monday, task 9 on Tuesday.
    const colours = assignColours(
      report({ periods: week([1, [14, 15]], ...range(2, 8, [14]), [9, [15]]) })
    )
    expect(colours.get('task:1')).toBe('slot1')
    expect(colours.get('task:8')).toBe('slot8')
    expect(colours.get('task:9')).toBe('slot2-hatched')
  })

  it("never gives a hatched pick the previous task's hue (HHAT-06)", () => {
    // Tasks 1 to 7 on Monday, task 8 alone on Tuesday, task 9 on Monday.
    const colours = assignColours(
      report({ periods: week(...range(1, 7, [14]), [8, [15]], [9, [14]]) })
    )
    expect(colours.get('task:8')).toBe('slot8')
    expect(colours.get('task:9')).toBe('slot1-hatched')
  })

  it('gives a solid pick a hue its day does not hold, hatched or not (HHAT-06)', () => {
    // Tasks 1 to 8 on Monday, task 9 alone on Tuesday, tasks 10 to 16 on Monday,
    // task 17 on Tuesday: every look is used once, and hatched blue sits on Tuesday.
    const colours = assignColours(
      report({ periods: week(...range(1, 8, [14]), [9, [15]], ...range(10, 16, [14]), [17, [15]]) })
    )
    expect(colours.get('task:9')).toBe('slot1-hatched')
    expect(colours.get('task:16')).toBe('slot8-hatched')
    expect(colours.get('task:17')).toBe('slot2')
  })

  it("makes a task Other when its one free look is the previous task's (HHAT-13)", () => {
    // Tasks 1 to 15 on Monday, task 16 alone on Tuesday, task 17 on Monday.
    const colours = assignColours(
      report({ periods: week(...range(1, 15, [14]), [16, [15]], [17, [14]]) })
    )
    expect(colours.get('task:15')).toBe('slot7-hatched')
    expect(colours.get('task:16')).toBe('slot8-hatched')
    expect(colours.get('task:17')).toBe('other')
  })

  it('keeps the last coloured task as the previous one past an Other (HHAT edge case)', () => {
    // Tasks 1 to 15 on Monday and Wednesday, task 16 alone on Tuesday, task 17 on
    // Monday and task 18 on Wednesday: each one's only free look is task 16's.
    const colours = assignColours(
      report({ periods: week(...range(1, 15, [14, 16]), [16, [15]], [17, [14]], [18, [16]]) })
    )
    expect(colours.get('task:16')).toBe('slot8-hatched')
    expect(colours.get('task:17')).toBe('other')
    expect(colours.get('task:18')).toBe('other')
  })

  it('uses every look exactly twice for thirty-two tasks dealt across the seven days (HHAT edge case)', () => {
    const ids = Array.from({ length: 32 }, (_, i) => i + 1)
    const colours = assignColours(
      report({ periods: week(...ids.map((id): [number, number[]] => [id, [14 + ((id - 1) % 7)]])) })
    )
    const uses: Record<string, number> = {}
    for (const look of looksOf(colours, ids)) uses[String(look)] = (uses[String(look)] ?? 0) + 1
    expect(uses).toEqual(Object.fromEntries([...SOLIDS, ...HATCHES].map((look) => [look, 2])))
  })

  it('keeps neighbours, same-day tasks and small weeks apart in generated weeks (HHAT-08..11)', () => {
    // A seeded generator (mulberry32), so a failure replays.
    let seed = 152
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    for (let w = 0; w < 240; w++) {
      const n = 1 + (w % 24)
      const ids = Array.from({ length: n }, (_, i) => i + 1)
      const plan = ids.map((id): [number, number[]] => {
        const days = new Set<number>()
        const count = 1 + Math.floor(random() * 3)
        while (days.size < count) days.add(14 + Math.floor(random() * 7))
        return [id, [...days]]
      })
      const r = report({ periods: week(...plan) })
      const colours = assignColours(r)
      const looks = looksOf(colours, ids)
      const where = `week ${w}: ${JSON.stringify(plan)} → ${JSON.stringify(looks)}`

      const chips = legendEntries(r, colours)
        .map((e) => e.role)
        .filter((role) => role !== 'other' && role !== 'no-task')
      chips.slice(1).forEach((role, i) => expect(role, where).not.toBe(chips[i]))

      for (const day of r.days) {
        const dayLooks = day.groups
          .map((g) => colours.get(g.key))
          .filter((role) => role !== 'other')
        expect(new Set(dayLooks).size, where).toBe(dayLooks.length)
      }

      if (n <= 16) expect(new Set(looks).size, where).toBe(n)
      if (n <= 16) expect(looks, where).not.toContain('other')
      if (n <= 8)
        expect(
          looks.every((look) => SOLIDS.includes(look as ColourRole)),
          where
        ).toBe(true)
    }
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

describe('lookClass', () => {
  it('names a solid look by its slot alone (HHAT-01)', () => {
    expect(lookClass('slot1')).toBe('role-slot1')
    expect(lookClass('slot8')).toBe('role-slot8')
  })

  it('names a hatched look by its slot plus hatched (HHAT-01)', () => {
    expect(lookClass('slot3-hatched')).toBe('role-slot3 hatched')
  })

  it('never hatches Other or No task (HHAT-19)', () => {
    expect(lookClass('other')).toBe('role-other')
    expect(lookClass('no-task')).toBe('role-no-task')
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

describe('visibleColumns and dimmedGroups', () => {
  const FOLDER = 'cwd:d:/acme/scratch'
  /** `hours` of task `taskId` (or of the scratch folder when null) on day `d`, from `from` o'clock. */
  const work = (taskId: number | null, d: number, from: number, hours: number): TimePeriod =>
    closed({
      id: `${taskId}-${d}-${from}`,
      sessionId: `s-${taskId}`,
      taskId,
      cwd: taskId === null ? 'D:/acme/scratch' : `D:/acme/app-${taskId}`,
      start: at(d, from),
      end: at(d, from) + hours * HOUR
    })
  // Task 1 on Monday and Wednesday, task 2 on Tuesday and Wednesday, the folder on Thursday.
  const r = report({
    periods: [
      work(1, 14, 9, 2),
      work(1, 16, 9, 1),
      work(2, 15, 9, 3),
      work(2, 16, 13, 1),
      work(null, 17, 9, 1)
    ]
  })
  const cols = weekColumns(r, WEEK.start, LATER)

  it('keeps every column when nothing is selected (HTF-12)', () => {
    expect(visibleColumns(cols, null)).toEqual(cols)
  })

  it('keeps only the days where the selected task has time (HTF-10)', () => {
    expect(dates(visibleColumns(cols, 'task:1'))).toEqual([14, 16])
    expect(dates(visibleColumns(cols, 'task:2'))).toEqual([15, 16])
  })

  it('keeps only the days of a selected folder (HTF edge case)', () => {
    expect(dates(visibleColumns(cols, FOLDER))).toEqual([17])
  })

  it('keeps no column for a selection with no time this week (HTF-13)', () => {
    expect(visibleColumns(cols, 'task:99')).toEqual([])
  })

  it('dims nothing when nothing is focused (HTF-08)', () => {
    expect(dimmedGroups(r, null, null)).toEqual(new Set())
  })

  it('dims every other task and folder of the week while one is hovered (HTF-07)', () => {
    expect(dimmedGroups(r, 'task:1', null)).toEqual(new Set(['task:2', FOLDER]))
    expect(dimmedGroups(r, FOLDER, null)).toEqual(new Set(['task:1', 'task:2']))
  })

  it('dims every other group while one is selected (HTF-10)', () => {
    expect(dimmedGroups(r, null, 'task:2')).toEqual(new Set(['task:1', FOLDER]))
  })

  it('dims by the hovered group over the selected one (HTF-07)', () => {
    expect(dimmedGroups(r, 'task:1', 'task:2')).toEqual(new Set(['task:2', FOLDER]))
  })

  it('leaves the colours alone: a selection neither recolours nor rebuilds a day (HTF-15)', () => {
    const colours = assignColours(r)
    const before = [...colours]
    const shown = visibleColumns(cols, 'task:1')
    dimmedGroups(r, 'task:2', 'task:1')
    expect([...colours]).toEqual(before)
    expect(shown.map((c) => c.day)).toEqual([cols[0].day, cols[2].day])
    expect(shown[0].day).toBe(cols[0].day)
  })
})
