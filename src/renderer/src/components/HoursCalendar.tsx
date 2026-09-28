import type { CSSProperties, JSX } from 'react'
import {
  barBox,
  layoutLanes,
  roleOf,
  type CalendarColumn,
  type ColourRole,
  type TimeAxis
} from '../lib/hours-calendar'
import type { Block } from '../lib/hours-report'
import { WEEKDAYS, formatDayHeader, formatHmCompact } from '../lib/time-format'
import type { BlockFocus } from './HoursView'
import './HoursCalendar.css'

interface HoursCalendarProps {
  columns: CalendarColumn[]
  axis: TimeAxis
  /** Colour roles frozen for the shown week (HCAL-24). */
  colours: Map<string, ColourRole>
  now: number
  /** Local midnight of the selected day, or null. */
  selected: number | null
  focus?: BlockFocus
  onSelectDay: (date: number) => void
  onSelectBlock: (date: number, focus: BlockFocus) => void
}

const pad = (n: number): string => String(n).padStart(2, '0')
const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * The shown week as day columns on one hour axis, each merged block a bar in
 * its overlap lane, coloured by its task's role (HCAL-01..05, 08, 10..12,
 * 18..20, 22, 23). Every number comes from the pure `hours-calendar` model.
 */
export function HoursCalendar({
  columns,
  axis,
  colours,
  now,
  selected,
  focus,
  onSelectDay,
  onSelectBlock
}: HoursCalendarProps): JSX.Element {
  const hours = axis.endHour - axis.startHour
  const style = {
    '--hcal-cols': columns.length,
    '--hcal-hours': hours
  } as CSSProperties

  return (
    <div className="hcal" style={style}>
      <div className="hcal-corner" />
      {columns.map((column) => {
        const date = column.date.getTime()
        const total = formatHmCompact(column.totalMs)
        return (
          <button
            key={date}
            type="button"
            className={[
              'hcal-head',
              column.isToday && 'today',
              column.isFuture && 'future',
              selected === date && 'selected'
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={selected === date}
            aria-label={`${formatDayHeader(column.date)}, ${total}`}
            onClick={() => onSelectDay(date)}
          >
            <span className="hcal-head-day">
              {WEEKDAYS[column.date.getDay()]} {pad(column.date.getDate())}/
              {pad(column.date.getMonth() + 1)}
            </span>
            <span className="hcal-head-total">{total}</span>
          </button>
        )
      })}

      <div className="hcal-axis" aria-hidden="true">
        {Array.from({ length: hours + 1 }, (_, i) => (
          <span key={i} className="hcal-hour" style={{ top: `${(i / hours) * 100}%` }}>
            {pad(axis.startHour + i)}:00
          </span>
        ))}
      </div>

      {columns.map((column, index) => {
        const date = column.date.getTime()
        const entries =
          column.day && !column.isFuture
            ? column.day.groups.flatMap((group) =>
                group.blocks.map((block) => ({ block, groupKey: group.key, label: group.label }))
              )
            : []
        const labels = new Map(entries.map((e) => [e.block, e.label]))
        return (
          <div
            key={date}
            className={[
              'hcal-col',
              column.isToday && 'today',
              column.isFuture && 'future',
              selected === date && 'selected'
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {layoutLanes(entries).map(({ block, groupKey, lane, lanes }) => (
              <Bar
                key={`${groupKey}-${block.start}`}
                block={block}
                label={labels.get(block) ?? ''}
                role={roleOf(colours, groupKey)}
                box={barBox(block, axis, now)}
                lane={lane}
                lanes={lanes}
                tipLeft={index >= columns.length - 2}
                focused={
                  selected === date && focus?.groupKey === groupKey && focus.start === block.start
                }
                onActivate={() => onSelectBlock(date, { groupKey, start: block.start })}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

interface BarProps {
  block: Block
  label: string
  role: ColourRole
  box: ReturnType<typeof barBox>
  lane: number
  lanes: number
  /** Open the tooltip to the left, so the last columns keep it on screen. */
  tipLeft: boolean
  focused: boolean
  onActivate: () => void
}

function Bar({
  block,
  label,
  role,
  box,
  lane,
  lanes,
  tipLeft,
  focused,
  onActivate
}: BarProps): JSX.Element {
  const range = `${clock(block.start)}–${box.ongoing ? 'now' : clock(block.end)}`
  const duration = formatHmCompact(block.durationMs)
  const style = {
    '--bar-top': `${box.topPct}%`,
    '--bar-height': `${box.heightPct}%`,
    '--bar-lane': lane,
    '--bar-lanes': lanes
  } as CSSProperties

  return (
    <button
      type="button"
      className={[
        'hcal-bar',
        `role-${role}`,
        box.ongoing && 'ongoing',
        focused && 'focused',
        tipLeft && 'tip-left'
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-label={`${label}, ${range}, ${duration}`}
      onClick={onActivate}
    >
      <span className="hcal-bar-label">{label}</span>
      <span className="hcal-tip" aria-hidden="true">
        <strong className="hcal-tip-value">{duration}</strong>
        <span className="hcal-tip-range">{range}</span>
        <span className="hcal-tip-label">
          <span className="hcal-tip-key" />
          {label}
        </span>
      </span>
    </button>
  )
}
