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

const localMidnight = (ms: number): number => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
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
