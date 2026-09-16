import type { DayReport } from './hours-report'
import { formatDayHeader, formatHmCompact } from './time-format'

const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * A day's hours as clipboard text for Clockify (TIME-39, TIME-40):
 * `dd/MM/yyyy (ddd) — total XhMM`, then `HH:MM–HH:MM  <label>  XhMM` per merged
 * block in chronological order, labels padded to the day's longest.
 */
export function formatDayCopy(day: DayReport): string {
  const lines = day.groups
    .flatMap((group) => group.blocks.map((block) => ({ label: group.label, block })))
    .sort((a, b) => a.block.start - b.block.start)
  const width = Math.max(0, ...lines.map(({ label }) => label.length))
  return [
    `${formatDayHeader(day.date)} — total ${formatHmCompact(day.totalMs)}`,
    ...lines.map(
      ({ label, block }) =>
        `${clock(block.start)}–${clock(block.end)}  ${label.padEnd(width)}  ${formatHmCompact(block.durationMs)}`
    )
  ].join('\n')
}
