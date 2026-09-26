import { weekRange, type Block, type DayReport, type WeekReport } from './hours-report'

/** One day column of the week calendar (HCAL-01..05). */
export interface CalendarColumn {
  /** Local midnight of the day. */
  date: Date
  /** The day's union of periods; 0 when it holds no time (HCAL-03). */
  totalMs: number
  isToday: boolean
  /** A day after today: dimmed, no bars (HCAL-05). */
  isFuture: boolean
  day: DayReport | null
}

/** The hour span every column shares, in whole local hours (HCAL-09). */
export interface TimeAxis {
  startHour: number
  endHour: number
}

const MIN_AXIS_HOURS = 8
const EMPTY_AXIS: TimeAxis = { startHour: 9, endHour: 17 }

const localMidnight = (ms: number): number => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Local hour of `ms` within the day starting at `dayMidnight`; the next midnight is 24. */
function hourOfDay(ms: number, dayMidnight: number): number {
  if (localMidnight(ms) > dayMidnight) return 24
  const d = new Date(ms)
  return (
    d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3_600_000
  )
}

/**
 * The shown week's columns: Monday to Friday always, Saturday and Sunday only
 * when that day holds time (HCAL-01, HCAL-02).
 */
export function weekColumns(report: WeekReport, weekStart: number, now: number): CalendarColumn[] {
  const monday = new Date(weekRange(new Date(weekStart)).start)
  const today = localMidnight(now)
  const byDate = new Map(report.days.map((day) => [day.date.getTime(), day]))

  const columns: CalendarColumn[] = []
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset)
    const day = byDate.get(date.getTime()) ?? null
    if (offset >= 5 && !day) continue
    columns.push({
      date,
      totalMs: day?.totalMs ?? 0,
      isToday: date.getTime() === today,
      isFuture: date.getTime() > today,
      day
    })
  }
  return columns
}

/**
 * From the week's earliest block start to its latest block end, rounded out to
 * whole hours, widened symmetrically to at least 8 hours and kept within the
 * day; an empty week shows 09–17 (HCAL-09).
 */
export function timeAxis(report: WeekReport): TimeAxis {
  const blocks = report.days.flatMap((day) =>
    day.groups.flatMap((group) => group.blocks.map((block) => ({ block, day })))
  )
  if (blocks.length === 0) return EMPTY_AXIS

  let startHour = Math.min(
    ...blocks.map(({ block, day }) => Math.floor(hourOfDay(block.start, day.date.getTime())))
  )
  let endHour = Math.max(
    ...blocks.map(({ block, day }) => Math.ceil(hourOfDay(block.end, day.date.getTime())))
  )
  const missing = MIN_AXIS_HOURS - (endHour - startHour)
  if (missing > 0) {
    startHour -= Math.floor(missing / 2)
    endHour += Math.ceil(missing / 2)
  }
  if (startHour < 0) {
    endHour -= startHour
    startHour = 0
  }
  if (endHour > 24) {
    startHour -= endHour - 24
    endHour = 24
  }
  return { startHour, endHour }
}

/** A block placed in one of the side-by-side lanes of its overlap cluster (HCAL-10). */
export interface LaidOutBlock {
  block: Block
  groupKey: string
  /** 0-based lane, left to right. */
  lane: number
  /** Lanes of the block's overlap cluster; the column width is divided by it. */
  lanes: number
}

/**
 * One day's blocks in lanes: blocks overlapping in time form a cluster, each
 * takes the first lane free at its start, and the whole cluster shares its
 * lane count, so no bar is drawn over another (HCAL-10).
 */
export function layoutLanes(entries: { block: Block; groupKey: string }[]): LaidOutBlock[] {
  const sorted = [...entries].sort(
    (a, b) => a.block.start - b.block.start || b.block.end - a.block.end
  )
  const laidOut: LaidOutBlock[] = []
  let cluster: LaidOutBlock[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity

  const closeCluster = (): void => {
    for (const item of cluster) item.lanes = laneEnds.length
    cluster = []
    laneEnds = []
  }

  for (const { block, groupKey } of sorted) {
    if (block.start >= clusterEnd) closeCluster()
    let lane = laneEnds.findIndex((end) => end <= block.start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = block.end
    clusterEnd = cluster.length === 0 ? block.end : Math.max(clusterEnd, block.end)
    const item = { block, groupKey, lane, lanes: 0 }
    cluster.push(item)
    laidOut.push(item)
  }
  closeCluster()
  return laidOut
}

/** Which colour treatment a group's bars wear (HCAL-11, HTF-01). */
export type ColourRole =
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'slot7'
  | 'slot8'
  | 'other'
  | 'no-task'

/** One legend line: a task or folder with its colour and week total (HCAL-21). */
export interface LegendEntry {
  groupKey: string
  label: string
  role: ColourRole
  totalMs: number
}

const SLOTS: ColourRole[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8']

/** Legend rank: every coloured task first, then Other, then folders (HCAL-21). */
const legendRank = (role: ColourRole): number => (role === 'no-task' ? 2 : role === 'other' ? 1 : 0)

const isFolder = (groupKey: string): boolean => groupKey.startsWith('cwd:')

interface WeekGroup {
  groupKey: string
  label: string
  totalMs: number
  firstStart: number
}

/** Each group across the week: total of its days, newest label, first block start. */
function weekGroups(report: WeekReport): WeekGroup[] {
  const groups = new Map<string, WeekGroup>()
  for (const day of report.days) {
    for (const group of day.groups) {
      const known = groups.get(group.key)
      if (known) {
        known.totalMs += group.totalMs
        known.firstStart = Math.min(known.firstStart, group.blocks[0].start)
      } else {
        groups.set(group.key, {
          groupKey: group.key,
          label: group.label,
          totalMs: group.totalMs,
          firstStart: group.blocks[0].start
        })
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.totalMs - a.totalMs || a.firstStart - b.firstStart)
}

/**
 * Tasks in order of week time each take the first slot no task sharing one of
 * its days holds yet; with all eight held, the task is Other. Task-less folders
 * are No task (HTF-02, HTF-04, HCAL-11).
 */
export function assignColours(report: WeekReport): Map<string, ColourRole> {
  const colours = new Map<string, ColourRole>()
  const dayKeys = report.days.map((day) => day.groups.map((group) => group.key))
  for (const { groupKey } of weekGroups(report)) {
    if (isFolder(groupKey)) {
      colours.set(groupKey, 'no-task')
      continue
    }
    const held = new Set(
      dayKeys
        .filter((keys) => keys.includes(groupKey))
        .flatMap((keys) => keys.map((k) => colours.get(k)))
    )
    colours.set(groupKey, SLOTS.find((slot) => !held.has(slot)) ?? 'other')
  }
  return colours
}

/** A group's role from colours frozen earlier; one that appeared since is neutral (HCAL-24). */
export function roleOf(colours: Map<string, ColourRole>, groupKey: string): ColourRole {
  return colours.get(groupKey) ?? (isFolder(groupKey) ? 'no-task' : 'other')
}

/**
 * Every task and folder of the week: coloured tasks in the order they were
 * coloured, so live time never reorders them (HCAL-24), then Other's tasks,
 * then folders (HCAL-21).
 */
export function legendEntries(report: WeekReport, colours: Map<string, ColourRole>): LegendEntry[] {
  const colouredAt = new Map([...colours.keys()].map((key, i) => [key, i]))
  return weekGroups(report)
    .map(({ groupKey, label, totalMs }) => ({
      groupKey,
      label,
      role: roleOf(colours, groupKey),
      totalMs
    }))
    .sort(
      (a, b) =>
        legendRank(a.role) - legendRank(b.role) ||
        (legendRank(a.role) === 0
          ? (colouredAt.get(a.groupKey) ?? 0) - (colouredAt.get(b.groupKey) ?? 0)
          : 0)
    )
}

/** Where a bar sits in its column, as percentages of the axis height (HCAL-08, HCAL-23). */
export interface BarBox {
  topPct: number
  heightPct: number
  /** The block holds a period still running now: its bar ends at now (HCAL-23). */
  ongoing: boolean
}

/**
 * A block's bar from its start to its end on `axis`. A block holding an open
 * period that reaches `now` ends at `now`; the report has already split a block
 * at local midnight, so each part sits in its own day (HCAL-08, HCAL-13).
 */
export function barBox(block: Block, axis: TimeAxis, now: number): BarBox {
  const dayMidnight = localMidnight(block.start)
  const ongoing = block.periods.some((period) => period.open && period.end >= now)
  const end = ongoing ? Math.max(block.end, now) : block.end
  const span = axis.endHour - axis.startHour
  const from = hourOfDay(block.start, dayMidnight)
  const to = hourOfDay(end, dayMidnight)
  return {
    topPct: ((from - axis.startHour) / span) * 100,
    heightPct: ((to - from) / span) * 100,
    ongoing
  }
}
