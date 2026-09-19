import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { TimeEditResult, TimeSnapshot } from '../../../shared/time'
import {
  buildWeekReport,
  weekRange,
  type Block,
  type DayReport,
  type GroupReport
} from '../lib/hours-report'
import {
  assignColours,
  legendEntries,
  timeAxis,
  weekColumns,
  type ColourRole
} from '../lib/hours-calendar'
import { formatDayCopy } from '../lib/hours-copy'
import { COPIED_FEEDBACK_MS } from '../lib/terminal-keys'
import { formatDayHeader, formatHmCompact } from '../lib/time-format'
import { useNow } from '../lib/use-time'
import { HoursCalendar } from './HoursCalendar'
import { HoursLegend } from './HoursLegend'
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

/** Colour roles frozen for one shown week (HCAL-24). */
interface FrozenColours {
  weekStart: number
  colours: Map<string, ColourRole>
}

/** The day open in the drawer, and the block a bar asked to focus (HCAL-15..19). */
interface Selection {
  weekStart: number
  /** Local midnight of the selected day. */
  date: number
  focus?: BlockFocus
  /** The selected day held time when last seen, so emptying it closes the drawer (edge case). */
  hadTime: boolean
}

/** Esc typed into a field belongs to the field, not to the drawer. */
const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.closest('input, textarea, select') !== null

/**
 * Hours direction (TIME-31..43, HCAL-01..26): one local week as a calendar of
 * day columns with the worked blocks drawn as bars, colour chips above it, and
 * a drawer beside it with the selected day's detail — groups, raw periods,
 * edit, delete and the Clockify Copy. The view fits the window; only the
 * drawer scrolls. Every number comes from the pure `hours-report`,
 * `hours-calendar` and `hours-copy` models.
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
  const wallClock = new Date()
  const currentWeekStart = weekRange(wallClock).start
  const columns = weekColumns(report, weekStart, wallClock.getTime())
  const axis = useMemo(() => timeAxis(report), [report])

  // Colours are assigned when a week loads and kept while it is shown, so live
  // time never repaints a bar (HCAL-24). A week first seen before the snapshot
  // arrived is assigned once its time does.
  const [frozen, setFrozen] = useState<FrozenColours>(() => ({
    weekStart,
    colours: assignColours(report)
  }))
  let colours = frozen.colours
  if (frozen.weekStart !== weekStart || (colours.size === 0 && report.days.length > 0)) {
    colours = assignColours(report)
    setFrozen({ weekStart, colours })
  }

  // Nothing is selected when the view opens or the week changes; the drawer
  // closes too when its day loses its last period (HCAL-16, edge case).
  const [selection, setSelection] = useState<Selection | null>(null)
  let current = selection
  const shownDay =
    selection && selection.weekStart === weekStart
      ? (columns.find((c) => c.date.getTime() === selection.date)?.day ?? null)
      : null
  if (selection && (selection.weekStart !== weekStart || (selection.hadTime && !shownDay))) {
    current = null
    setSelection(null)
  } else if (selection && !selection.hadTime && shownDay) {
    current = { ...selection, hadTime: true }
    setSelection(current)
  }

  const selectDay = (date: number): void => {
    const column = columns.find((c) => c.date.getTime() === date)
    setSelection({ weekStart, date, hadTime: Boolean(column?.day) })
  }
  const selectBlock = (date: number, focus: BlockFocus): void =>
    setSelection({ weekStart, date, focus, hadTime: true })
  const closeDrawer = (): void => setSelection(null)

  // Esc closes the drawer (HCAL-25).
  const drawerOpen = current !== null
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented && !isTextField(e.target)) setSelection(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

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
        {report.days.length === 0 && <div className="hours-empty">No time recorded this week.</div>}
        <HoursLegend entries={legendEntries(report, colours)} />
        <div className="hours-main">
          <HoursCalendar
            columns={columns}
            axis={axis}
            colours={colours}
            now={now}
            selected={current?.date ?? null}
            focus={current?.focus}
            onSelectDay={selectDay}
            onSelectBlock={selectBlock}
          />
          {current && (
            <aside
              className="hours-drawer"
              aria-label={`Details of ${formatDayHeader(new Date(current.date))}`}
            >
              <div className="hours-drawer-head">
                <span className="hours-drawer-hint">Esc closes</span>
                <button
                  type="button"
                  className="hours-drawer-close"
                  title="Close details"
                  aria-label="Close details"
                  onClick={closeDrawer}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
              {shownDay ? (
                <DayCard
                  key={shownDay.date.getTime()}
                  day={shownDay}
                  onDelete={onDelete}
                  onAdjust={onAdjust}
                  focus={current.focus}
                />
              ) : (
                <div className="hours-empty">
                  No time recorded on {formatDayHeader(new Date(current.date))}.
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * A request to highlight, expand and scroll to one block (HCAL-19). A fresh
 * object per request, so activating the same bar again re-expands its block.
 */
export interface BlockFocus {
  groupKey: string
  start: number
}

interface DayCardProps {
  day: DayReport
  onDelete: HoursViewProps['onDelete']
  onAdjust: HoursViewProps['onAdjust']
  /** The block to focus; absent, the card renders as the list view did. */
  focus?: BlockFocus
}

function DayCard({ day, onDelete, onAdjust, focus }: DayCardProps): JSX.Element {
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
        <GroupSection
          key={group.key}
          group={group}
          onDelete={onDelete}
          onAdjust={onAdjust}
          focus={focus?.groupKey === group.key ? focus : undefined}
        />
      ))}
    </section>
  )
}

interface GroupSectionProps {
  group: GroupReport
  onDelete: HoursViewProps['onDelete']
  onAdjust: HoursViewProps['onAdjust']
  focus?: BlockFocus
}

function GroupSection({ group, onDelete, onAdjust, focus }: GroupSectionProps): JSX.Element {
  return (
    <div className="hours-group">
      <div className="hours-group-head">
        <span className={`hours-group-label${group.taskId === null ? ' no-task' : ''}`}>
          {group.label}
        </span>
        <span className="hours-group-total">{formatHmCompact(group.totalMs)}</span>
      </div>
      {group.blocks.map((block) => (
        <BlockLine
          key={block.start}
          block={block}
          onDelete={onDelete}
          onAdjust={onAdjust}
          focus={focus?.start === block.start ? focus : undefined}
        />
      ))}
    </div>
  )
}

interface BlockLineProps {
  block: Block
  onDelete: HoursViewProps['onDelete']
  onAdjust: HoursViewProps['onAdjust']
  focus?: BlockFocus
}

function BlockLine({ block, onDelete, onAdjust, focus }: BlockLineProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [seenFocus, setSeenFocus] = useState<BlockFocus | undefined>(undefined)
  const ref = useRef<HTMLDivElement>(null)
  const open = block.periods.some((p) => p.open)

  // Expand on each new focus request, adjusting state while rendering rather
  // than in an effect; the user may still collapse it afterwards.
  if (focus !== seenFocus) {
    setSeenFocus(focus)
    if (focus) setExpanded(true)
  }

  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [focus])

  return (
    <div ref={ref} className={`hours-block${focus ? ' focused' : ''}`}>
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
