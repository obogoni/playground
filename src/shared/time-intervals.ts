/** A span of time in epoch ms, `start` inclusive and `end` exclusive. */
export interface Interval {
  start: number
  end: number
}

/**
 * Sorts by start and merges intervals that overlap or sit at most `gapMs` apart
 * (TIME-36 uses 60 s). A merged interval is the hull of its members.
 */
export function mergeIntervals(intervals: Interval[], gapMs: number): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const { start, end } of sorted) {
    const last = merged[merged.length - 1]
    if (last && start - last.end <= gapMs) last.end = Math.max(last.end, end)
    else merged.push({ start, end })
  }
  return merged
}

/** Wall-clock length of the union: overlapping time counts once (TIME-25..28, TIME-34). */
export function unionMs(intervals: Interval[]): number {
  return mergeIntervals(intervals, 0).reduce((sum, { start, end }) => sum + (end - start), 0)
}

/** The part of `interval` inside `range`; null when nothing is left. */
export function clip(interval: Interval, range: Interval): Interval | null {
  const start = Math.max(interval.start, range.start)
  const end = Math.min(interval.end, range.end)
  return start < end ? { start, end } : null
}

/** Cuts an interval at every local midnight it crosses, one piece per local day (TIME-37). */
export function splitAtLocalMidnight(interval: Interval): Interval[] {
  const pieces: Interval[] = []
  let start = interval.start
  while (start < interval.end) {
    const day = new Date(start)
    const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
    const end = Math.min(midnight, interval.end)
    pieces.push({ start, end })
    start = end
  }
  return pieces
}
