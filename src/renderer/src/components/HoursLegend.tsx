import type { JSX } from 'react'
import type { LegendEntry } from '../lib/hours-calendar'
import { formatHmCompact } from '../lib/time-format'
import { Icon } from './Icon'
import './HoursLegend.css'

interface HoursLegendProps {
  entries: LegendEntry[]
  /** The group picked to filter the week, or null (HTF-10, HTF-11). */
  pickedKey: string | null
  /** A chip under the pointer or keyboard focus, or null when it leaves (HTF-07..09). */
  onHover: (key: string | null) => void
  /** A chip clicked, or its × — picks the group, or clears the pick (HTF-10, HTF-12). */
  onTogglePick: (entry: LegendEntry) => void
}

/**
 * Explains the calendar's colours as a row of chips above it: each coloured
 * task, then each task folded into Other with the neutral swatch, then each
 * task-less folder, all with their week totals; a truncated label keeps its
 * full text as the chip's title (HCAL-21). Pointing at a chip fades the other
 * groups' bars; clicking it shows only its days, and the picked chip carries a
 * × that shows every day again (HTF-07, HTF-10..12).
 */
export function HoursLegend({
  entries,
  pickedKey,
  onHover,
  onTogglePick
}: HoursLegendProps): JSX.Element | null {
  if (entries.length === 0) return null
  return (
    <ul className="hleg" aria-label="Colour legend">
      {entries.map((e) => {
        const picked = e.groupKey === pickedKey
        return (
          <li
            key={e.groupKey}
            className={`hleg-chip${picked ? ' picked' : ''}`}
            title={e.label}
            onMouseEnter={() => onHover(e.groupKey)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(e.groupKey)}
            onBlur={() => onHover(null)}
          >
            <button
              type="button"
              className="hleg-pick"
              aria-pressed={picked}
              onClick={() => onTogglePick(e)}
            >
              <span className={`hleg-swatch role-${e.role}`} />
              <span className="hleg-label">{e.label}</span>
              <span className="hleg-total">{formatHmCompact(e.totalMs)}</span>
            </button>
            {picked && (
              <button
                type="button"
                className="hleg-clear"
                title="Show every day"
                aria-label={`Show every day, not only ${e.label}`}
                onClick={() => onTogglePick(e)}
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
