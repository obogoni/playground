import type { JSX } from 'react'
import type { TimeSnapshot } from '../../../shared/time'
import { formatHm, formatHms } from '../lib/time-format'
import { currentRunMs, sessionTotalMs } from '../lib/time-totals'
import { useNow } from '../lib/use-time'
import { Icon } from './Icon'

/** A `hh:mm` total only changes once a minute; this keeps it within a quarter of one. */
const TOTAL_TICK_MS = 15_000

interface SessionClockProps {
  snapshot: TimeSnapshot
  sessionId: string
  className?: string
  /** Adds `current run hh:mm:ss` as the tooltip (TIME-23). */
  withRunTooltip?: boolean
}

/** A session's total as `hh:mm:ss`, ticking every second only while it has an
 *  open period (TIME-22, TIME-24). The tick lives here so the parent never
 *  re-renders once a second. */
export function SessionClock({
  snapshot,
  sessionId,
  className,
  withRunTooltip = false
}: SessionClockProps): JSX.Element {
  const live = snapshot.open.some((p) => p.sessionId === sessionId)
  const now = useNow(live ? 1000 : null)
  return (
    <span
      className={className}
      title={
        withRunTooltip
          ? `current run ${formatHms(currentRunMs(snapshot, sessionId, now))}`
          : undefined
      }
    >
      {formatHms(sessionTotalMs(snapshot, sessionId, now))}
    </span>
  )
}

interface TotalClockProps {
  /** The union total at `now` (worktree, task or orphan folder). */
  totalAt: (now: number) => number
  /** True while a period counted by this total is open. */
  live: boolean
  className?: string
}

/** A worktree, task or folder total as clock icon + `hh:mm`; `00:00` when empty (TIME-30). */
export function TotalClock({ totalAt, live, className }: TotalClockProps): JSX.Element {
  const now = useNow(live ? TOTAL_TICK_MS : null)
  const text = formatHm(totalAt(now))
  return (
    <span className={className} title={`Time recorded: ${text}`}>
      <Icon name="clock" size={11} />
      {text}
    </span>
  )
}
