import { weekRange, type DayReport, type WeekReport } from './hours-report'

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
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3_600_000
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
