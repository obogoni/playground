import type { TimeSnapshot } from '../../../shared/time'
import { mergeIntervals, unionMs, type Interval } from '../../../shared/time-intervals'

/** Closed periods of one worktree or task, merged once per snapshot. */
interface ClosedUnion {
  /** Sorted, non-overlapping. */
  merged: Interval[]
  /** `prefix[i]` = total length of `merged[0..i)`. */
  prefix: number[]
}

interface IndexedOpen {
  sessionId: string
  cwd: string
  taskId: number | null
  start: number
}

/** The four `time-totals.ts` totals over one snapshot, its closed periods read once (PERF-14). */
export interface TimeIndex {
  sessionTotalMs(sessionId: string, now: number): number
  currentRunMs(sessionId: string, now: number): number
  worktreeTotalMs(cwd: string, now: number): number
  taskTotalMs(taskId: number, now: number): number
}

const cache = new WeakMap<TimeSnapshot, TimeIndex>()

/**
 * The index of `snapshot`, built on first use and cached by identity: a new
 * snapshot (`time:changed`) gets a new index, never a mutated one. Each call
 * at a new `now` touches only open periods and the merged closed intervals
 * they overlap, so a ticking clock does not rescan the history (PERF-14 AC 2).
 */
export function timeIndex(snapshot: TimeSnapshot): TimeIndex {
  let index = cache.get(snapshot)
  if (!index) {
    index = build(snapshot)
    cache.set(snapshot, index)
  }
  return index
}

function unionOf(intervals: Interval[]): ClosedUnion {
  const merged = mergeIntervals(intervals, 0)
  const prefix = [0]
  for (const { start, end } of merged) prefix.push(prefix[prefix.length - 1] + (end - start))
  return { merged, prefix }
}

/** Union of the closed intervals and the open ones, merging only the closed tail they reach. */
function unionAt(closed: ClosedUnion | undefined, opens: Interval[]): number {
  const merged = closed?.merged ?? []
  const prefix = closed?.prefix ?? [0]
  if (opens.length === 0) return prefix[merged.length]
  const earliest = Math.min(...opens.map((o) => o.start))
  let cut = merged.length
  while (cut > 0 && merged[cut - 1].end >= earliest) cut--
  return prefix[cut] + unionMs([...merged.slice(cut), ...opens])
}

function push<K>(map: Map<K, Interval[]>, key: K, interval: Interval): void {
  const list = map.get(key)
  if (list) list.push(interval)
  else map.set(key, [interval])
}

function build(snapshot: TimeSnapshot): TimeIndex {
  const closedBySession = new Map<string, number>()
  const byCwd = new Map<string, Interval[]>()
  const byTask = new Map<number, Interval[]>()
  for (const period of snapshot.periods) {
    const start = Date.parse(period.start)
    const end = Date.parse(period.end)
    closedBySession.set(
      period.sessionId,
      (closedBySession.get(period.sessionId) ?? 0) + (end - start)
    )
    const cwd = period.cwd.toLowerCase()
    push(byCwd, cwd, { start, end })
    if (period.taskId !== null) push(byTask, period.taskId, { start, end })
  }
  const closedByCwd = new Map([...byCwd].map(([k, v]) => [k, unionOf(v)]))
  const closedByTask = new Map([...byTask].map(([k, v]) => [k, unionOf(v)]))
  const open: IndexedOpen[] = snapshot.open.map((p) => ({
    sessionId: p.sessionId,
    cwd: p.cwd.toLowerCase(),
    taskId: p.taskId,
    start: Date.parse(p.start)
  }))

  const openUpTo = (keep: (o: IndexedOpen) => boolean, now: number): Interval[] =>
    open.filter(keep).map(({ start }) => ({ start, end: Math.max(start, now) }))
  const runMs = (sessionId: string, now: number): number =>
    openUpTo((o) => o.sessionId === sessionId, now).reduce((sum, i) => sum + (i.end - i.start), 0)

  return {
    sessionTotalMs: (sessionId, now) =>
      (closedBySession.get(sessionId) ?? 0) + runMs(sessionId, now),
    currentRunMs: runMs,
    worktreeTotalMs: (cwd, now) => {
      const key = cwd.toLowerCase()
      return unionAt(
        closedByCwd.get(key),
        openUpTo((o) => o.cwd === key, now)
      )
    },
    taskTotalMs: (taskId, now) =>
      unionAt(
        closedByTask.get(taskId),
        openUpTo((o) => o.taskId === taskId, now)
      )
  }
}
