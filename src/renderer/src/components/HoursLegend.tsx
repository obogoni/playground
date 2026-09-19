import type { JSX } from 'react'
import type { LegendEntry } from '../lib/hours-calendar'
import { formatHmCompact } from '../lib/time-format'
import './HoursLegend.css'

interface HoursLegendProps {
  entries: LegendEntry[]
}

/**
 * Explains the calendar's colours: each coloured task, then Other tasks with
 * the tasks folded into it, then each task-less folder, all with their week
 * totals (HCAL-21).
 */
export function HoursLegend({ entries }: HoursLegendProps): JSX.Element | null {
  if (entries.length === 0) return null
  const others = entries.filter((e) => e.role === 'other')
  const othersMs = others.reduce((sum, e) => sum + e.totalMs, 0)

  return (
    <div className="hleg" aria-label="Colour legend">
      {entries
        .filter((e) => e.role.startsWith('slot'))
        .map((e) => (
          <LegendRow key={e.groupKey} entry={e} />
        ))}
      {others.length > 0 && (
        <div className="hleg-other">
          <div className="hleg-row">
            <span className="hleg-swatch role-other" />
            <span className="hleg-label">Other tasks</span>
            <span className="hleg-total">{formatHmCompact(othersMs)}</span>
          </div>
          <ul className="hleg-members">
            {others.map((e) => (
              <li key={e.groupKey} className="hleg-row">
                <span className="hleg-label">{e.label}</span>
                <span className="hleg-total">{formatHmCompact(e.totalMs)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {entries
        .filter((e) => e.role === 'no-task')
        .map((e) => (
          <LegendRow key={e.groupKey} entry={e} />
        ))}
    </div>
  )
}

function LegendRow({ entry }: { entry: LegendEntry }): JSX.Element {
  return (
    <div className="hleg-row">
      <span className={`hleg-swatch role-${entry.role}`} />
      <span className="hleg-label">{entry.label}</span>
      <span className="hleg-total">{formatHmCompact(entry.totalMs)}</span>
    </div>
  )
}
