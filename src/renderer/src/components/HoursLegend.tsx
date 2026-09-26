import type { JSX } from 'react'
import type { LegendEntry } from '../lib/hours-calendar'
import { formatHmCompact } from '../lib/time-format'
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
 * full text as the chip's title (HCAL-21).
 */
export function HoursLegend({ entries }: HoursLegendProps): JSX.Element | null {
  if (entries.length === 0) return null
  return (
    <ul className="hleg" aria-label="Colour legend">
      {entries.map((e) => (
        <li key={e.groupKey} className="hleg-chip" title={e.label}>
          <span className={`hleg-swatch role-${e.role}`} />
          <span className="hleg-label">{e.label}</span>
          <span className="hleg-total">{formatHmCompact(e.totalMs)}</span>
        </li>
      ))}
    </ul>
  )
}
