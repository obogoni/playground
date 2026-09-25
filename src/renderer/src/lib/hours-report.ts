import type { TimeSnapshot } from '../../../shared/time'
import {
  clip,
  mergeIntervals,
  splitAtLocalMidnight,
  unionMs,
  type Interval
} from '../../../shared/time-intervals'
import { intervalsOf, type TimedPeriod } from './time-totals'

/** Periods at most this far apart render as one line (TIME-36). */
const MERGE_GAP_MS = 60_000

/** One raw period's piece inside a day, clipped to the week (TIME-38). */
export interface RawPeriodRow extends TimedPeriod {
  durationMs: number
}

/** A merged line `HH:MM–HH:MM`; `durationMs` is the union of its pieces, not the hull. */
export interface Block extends Interval {
  durationMs: number
  periods: RawPeriodRow[]
}

export interface GroupReport {
  /** `task:<id>`, or `cwd:<lowercased cwd>` for task-less time. */
  key: string
  label: string
  taskId: number | null
  /** The folder of a task-less group; null for a task group. */
  cwd: string | null
  totalMs: number
  blocks: Block[]
}

export interface DayReport {
  /** Local midnight of the day. */
  date: Date
  totalMs: number
  groups: GroupReport[]
}

export interface WeekReport {
  totalMs: number
  /** Only days with time, newest first (TIME-34). */
  days: DayReport[]
}

/** Monday 00:00 local of `date`'s week → the next Monday 00:00 (TIME-32). */
export function weekRange(date: Date): Interval {
  const sinceMonday = (date.getDay() + 6) % 7
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMonday)
  const next = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7)
  return { start: monday.getTime(), end: next.getTime() }
}

const localMidnight = (ms: number): number => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

const folderLeaf = (cwd: string): string =>
  cwd
    .split(/[\\/]/)
    .filter((segment) => segment !== '')
    .pop() ?? cwd

/**
 * The Hours view model for the week starting at `weekStart`: days → task or
 * No-task groups → merged blocks → raw pieces. Open periods end at `now`;
 * periods crossing midnight count on both days (TIME-32..38, TIME-40).
 * `liveTitles` (pinned task details) wins over a period's snapshot title.
 */
export function buildWeekReport(
  snapshot: TimeSnapshot,
  now: number,
  weekStart: number,
  liveTitles: Map<number, string>
): WeekReport {
  const week = weekRange(new Date(weekStart))
  const pieces: RawPeriodRow[] = intervalsOf(snapshot, now).flatMap((timed) => {
    const inWeek = clip(timed, week)
    if (!inWeek) return []
    return splitAtLocalMidnight(inWeek).map(({ start, end }) => ({
      ...timed,
      start,
      end,
      durationMs: end - start
    }))
  })

  const byDay = groupBy(pieces, (p) => localMidnight(p.start))
  const days = [...byDay.entries()]
    .sort(([a], [b]) => b - a)
    .map(([day, dayPieces]) => ({
      date: new Date(day),
      totalMs: unionMs(dayPieces),
      groups: [...groupBy(dayPieces, groupKey).entries()]
        .map(([key, groupPieces]) => buildGroup(key, groupPieces, liveTitles))
        .sort((a, b) => a.blocks[0].start - b.blocks[0].start)
    }))

  return { totalMs: unionMs(pieces), days }
}

function groupKey({ period }: RawPeriodRow): string {
  return period.taskId !== null ? `task:${period.taskId}` : `cwd:${period.cwd.toLowerCase()}`
}

function buildGroup(
  key: string,
  pieces: RawPeriodRow[],
  liveTitles: Map<number, string>
): GroupReport {
  const { taskId, cwd } = pieces[0].period
  const sorted = [...pieces].sort((a, b) => a.start - b.start)
  const blocks = mergeIntervals(sorted, MERGE_GAP_MS).map((hull) => {
    const members = sorted.filter((p) => p.start >= hull.start && p.start <= hull.end)
    return { ...hull, durationMs: unionMs(members), periods: members }
  })

  let label: string
  if (taskId === null) {
    label = `No task · ${folderLeaf(cwd)}`
  } else {
    const snapshotTitle = [...sorted].reverse().find((p) => p.period.taskTitle)?.period.taskTitle
    const title = liveTitles.get(taskId) ?? snapshotTitle
    label = title ? `Task #${taskId} ${title}` : `Task #${taskId}`
  }

  return {
    key,
    label,
    taskId,
    cwd: taskId === null ? cwd : null,
    totalMs: unionMs(pieces),
    blocks
  }
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}
