import type { JSX } from 'react'
import type { TimeSnapshot } from '../../../shared/time'
import { clockToggleTitle, formatHm, formatHms } from '../lib/time-format'
import { useSharedNow } from '../lib/shared-tick'
import { timeIndex } from '../lib/time-index'
import { Icon } from './Icon'

/** A `hh:mm` total only changes once a minute; this keeps it within a quarter of one. */
const TOTAL_TICK_MS = 15_000

interface SessionClockProps {
  snapshot: TimeSnapshot
  sessionId: string
  className?: string
  /** Adds `current run hh:mm:ss` as the tooltip (TIME-23). */
  withRunTooltip?: boolean
  /** Makes the clock a pause/resume button (STRP-07..12). Opt-in: the rail row
   *  shares this component, and a click there selects the session. */
  toggle?: { paused: boolean; onToggle: () => void }
}

/** A session's total as `hh:mm:ss`, ticking every second only while it has an
 *  open period (TIME-22, TIME-24). The tick lives here so the parent never
 *  re-renders once a second; every live clock shares one 1 s tick and reads
 *  the snapshot's index, not the whole history (PERF-14). */
export function SessionClock({
  snapshot,
  sessionId,
  className,
  withRunTooltip = false,
  toggle
}: SessionClockProps): JSX.Element {
  const live = snapshot.open.some((p) => p.sessionId === sessionId)
  const now = useSharedNow(live ? 1000 : null)
  const index = timeIndex(snapshot)
  if (toggle) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={toggle.paused}
        title={clockToggleTitle(index.currentRunMs(sessionId, now), toggle.paused)}
        onClick={toggle.onToggle}
      >
        <Icon name={toggle.paused ? 'play' : 'pause'} size={11} />
        {formatHms(index.sessionTotalMs(sessionId, now))}
      </button>
    )
  }
  return (
    <span
      className={className}
      title={
        withRunTooltip ? `current run ${formatHms(index.currentRunMs(sessionId, now))}` : undefined
      }
    >
      {formatHms(index.sessionTotalMs(sessionId, now))}
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

/** A worktree, task or folder total as clock icon + `hh:mm`; `00:00` when empty (TIME-30).
 *  Live totals share one 15 s tick (PERF-14). */
export function TotalClock({ totalAt, live, className }: TotalClockProps): JSX.Element {
  const now = useSharedNow(live ? TOTAL_TICK_MS : null)
  const text = formatHm(totalAt(now))
  return (
    <span className={className} title={`Time recorded: ${text}`}>
      <Icon name="clock" size={11} />
      {text}
    </span>
  )
}
