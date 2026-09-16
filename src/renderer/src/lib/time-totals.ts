import type { OpenPeriod, TimePeriod, TimeSnapshot } from '../../../shared/time'
import { unionMs, type Interval } from '../../../shared/time-intervals'

/** A closed or open period with its bounds in epoch ms; open ones end at `now`. */
export interface TimedPeriod extends Interval {
  period: TimePeriod | OpenPeriod
  open: boolean
}

/** Every period of the snapshot as an interval, open periods measured up to `now`. */
export function intervalsOf(snapshot: TimeSnapshot, now: number): TimedPeriod[] {
  const closed = snapshot.periods.map((period) => ({
    period,
    open: false,
    start: Date.parse(period.start),
    end: Date.parse(period.end)
  }))
  const open = snapshot.open.map((period) => {
    const start = Date.parse(period.start)
    return { period, open: true, start, end: Math.max(start, now) }
  })
  return [...closed, ...open]
}

const lengthOf = ({ start, end }: Interval): number => end - start

/** Sum of every run of the session, the open one up to `now` (TIME-24). */
export function sessionTotalMs(snapshot: TimeSnapshot, sessionId: string, now: number): number {
  return intervalsOf(snapshot, now)
    .filter(({ period }) => period.sessionId === sessionId)
    .reduce((sum, t) => sum + lengthOf(t), 0)
}

/** The session's open period up to `now`; 0 when it has none (TIME-23). */
export function currentRunMs(snapshot: TimeSnapshot, sessionId: string, now: number): number {
  return intervalsOf(snapshot, now)
    .filter(({ period, open }) => open && period.sessionId === sessionId)
    .reduce((sum, t) => sum + lengthOf(t), 0)
}

/** Union of every period run in `cwd`, compared case-insensitively (TIME-25, TIME-27, TIME-28). */
export function worktreeTotalMs(snapshot: TimeSnapshot, cwd: string, now: number): number {
  const key = cwd.toLowerCase()
  return unionMs(
    intervalsOf(snapshot, now).filter(({ period }) => period.cwd.toLowerCase() === key)
  )
}

/** Union of every period carrying `taskId`, across worktrees (TIME-26). */
export function taskTotalMs(snapshot: TimeSnapshot, taskId: number, now: number): number {
  return unionMs(intervalsOf(snapshot, now).filter(({ period }) => period.taskId === taskId))
}
