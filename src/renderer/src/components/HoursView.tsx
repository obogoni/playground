import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { TimeEditResult, TimeSnapshot } from '../../../shared/time'
import {
  buildWeekReport,
  weekRange,
  type Block,
  type DayReport,
  type GroupReport
} from '../lib/hours-report'
import { formatDayCopy } from '../lib/hours-copy'
import { COPIED_FEEDBACK_MS } from '../lib/terminal-keys'
import { formatDayHeader, formatHmCompact } from '../lib/time-format'
import { useNow } from '../lib/use-time'
import { Icon } from './Icon'
import { PeriodRow } from './PeriodRow'
import './HoursView.css'

/** An open period in the shown week refreshes the report at least this often (TIME-42). */
const LIVE_REFRESH_MS = 60_000

interface HoursViewProps {
  snapshot: TimeSnapshot
  /** Pinned task id → live title; wins over a period's snapshot title (TIME-40). */
  liveTitles: Map<number, string>
  onDelete: (id: string) => Promise<TimeEditResult>
  onAdjust: (id: string, start: string, end: string) => Promise<TimeEditResult>
}

const pad = (n: number): string => String(n).padStart(2, '0')
const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const shortDate = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

/**
 * Hours direction (TIME-31..43): one local week, Monday to Sunday, grouped by
 * day → task → merged block, with a per-day Copy in the Clockify text format.
 * Every number comes from the pure `hours-report` / `hours-copy` models.
 */
export function HoursView({
  snapshot,
  liveTitles,
  onDelete,
  onAdjust
}: HoursViewProps): JSX.Element {
  const [weekStart, setWeekStart] = useState(() => weekRange(new Date()).start)
  const week = weekRange(new Date(weekStart))
  // Open periods always run in the present, so any of them keeps the report
  // refreshing; for a past or future week the extra minute ticks change nothing.
  const live = snapshot.open.length > 0
  const now = useNow(live ? LIVE_REFRESH_MS : null)
  const report = useMemo(
    () => buildWeekReport(snapshot, now, weekStart, liveTitles),
    [snapshot, now, weekStart, liveTitles]
  )
  // Read the wall clock, not `now`: `now` stands still while nothing in the week is open.
  const currentWeekStart = weekRange(new Date()).start

  // Shift by calendar days, not 7 × 24 h, so a DST change never skews Monday.
  const shiftWeek = (weeks: number): void => {
    const monday = new Date(weekStart)
    setWeekStart(
      weekRange(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7 * weeks))
        .start
    )
  }

  return (
    <div className="hours-view">
      <header className="hours-head">
        <div className="hours-head-titles">
          <span className="hours-head-label">HOURS</span>
          <span className="hours-head-range">
            {shortDate(week.start)} – {shortDate(week.end - 1)}/
            {new Date(week.end - 1).getFullYear()}
          </span>
        </div>
        <span className="hours-head-total" title="Week total (union of every period)">
          <Icon name="clock" size={13} />
          {formatHmCompact(report.totalMs)}
        </span>
        <span className="hours-head-spacer" />
        <div className="hours-nav">
          <button
            type="button"
            className="hours-nav-btn"
            title="Previous week"
            aria-label="Previous week"
            onClick={() => shiftWeek(-1)}
          >
            ◀
          </button>
          <button
            type="button"
            className="hours-nav-btn"
            disabled={weekStart === currentWeekStart}
            onClick={() => setWeekStart(currentWeekStart)}
          >
            This week
          </button>
          <button
            type="button"
            className="hours-nav-btn"
            title="Next week"
            aria-label="Next week"
            onClick={() => shiftWeek(1)}
          >
            ▶
          </button>
        </div>
      </header>

      <div className="hours-body">
        {report.days.length === 0 ? (
          <div className="hours-empty">No time recorded this week.</div>
        ) : (
          report.days.map((day) => (
            <DayCard key={day.date.getTime()} day={day} onDelete={onDelete} onAdjust={onAdjust} />
          ))
        )}
      </div>
    </div>
  )
}

interface DayCardProps {
  day: DayReport
  onDelete: HoursViewProps['onDelete']
  onAdjust: HoursViewProps['onAdjust']
}

function DayCard({ day, onDelete, onAdjust }: DayCardProps): JSX.Element {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [copied])

  // A rejected write shows no confirmation, so the owner knows to retry (design §Errors).
  const copy = (): void => {
    navigator.clipboard
      .writeText(formatDayCopy(day))
      .then(() => setCopied(true))
      .catch(console.error)
  }

  return (
    <section className="hours-day">
      <header className="hours-day-head">
        <span className="hours-day-title">{formatDayHeader(day.date)}</span>
        <span className="hours-day-total">{formatHmCompact(day.totalMs)}</span>
        <span className="hours-head-spacer" />
        <button
          type="button"
          className={`hours-copy-btn${copied ? ' copied' : ''}`}
          title="Copy this day's lines for Clockify"
          onClick={copy}
        >
          <Icon name={copied ? 'check' : 'copy'} size={13} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </header>
      {day.groups.map((group) => (
        <GroupSection key={group.key} group={group} onDelete={onDelete} onAdjust={onAdjust} />
      ))}
    </section>
  )
}

interface GroupSectionProps {
  group: GroupReport
  onDelete: HoursViewProps['onDelete']
  onAdjust: HoursViewProps['onAdjust']
}

function GroupSection({ group, onDelete, onAdjust }: GroupSectionProps): JSX.Element {
  return (
    <div className="hours-group">
      <div className="hours-group-head">
        <span className={`hours-group-label${group.taskId === null ? ' no-task' : ''}`}>
          {group.label}
        </span>
        <span className="hours-group-total">{formatHmCompact(group.totalMs)}</span>
      </div>
      {group.blocks.map((block) => (
        <BlockLine key={block.start} block={block} onDelete={onDelete} onAdjust={onAdjust} />
      ))}
    </div>
  )
}

interface BlockLineProps {
  block: Block
  onDelete: HoursViewProps['onDelete']
  onAdjust: HoursViewProps['onAdjust']
}

function BlockLine({ block, onDelete, onAdjust }: BlockLineProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const open = block.periods.some((p) => p.open)

  return (
    <div className="hours-block">
      <button
        type="button"
        className="hours-block-line"
        aria-expanded={expanded}
        title={expanded ? 'Hide periods' : 'Show the periods in this line'}
        onClick={() => setExpanded((cur) => !cur)}
      >
        <span className={`hours-block-chevron${expanded ? ' expanded' : ''}`}>
          <Icon name="chevron-down" size={12} />
        </span>
        <span className="hours-block-range">
          {clock(block.start)}–{open ? 'now' : clock(block.end)}
        </span>
        <span className="hours-block-duration">{formatHmCompact(block.durationMs)}</span>
        <span className="hours-block-count">
          {block.periods.length} period{block.periods.length === 1 ? '' : 's'}
        </span>
      </button>
      {expanded && (
        <div className="hours-block-periods">
          {block.periods.map((row) => (
            <PeriodRow
              key={`${row.period.id}-${row.start}`}
              row={row}
              onDelete={onDelete}
              onAdjust={onAdjust}
            />
          ))}
        </div>
      )}
    </div>
  )
}
