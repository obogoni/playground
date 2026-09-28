/**
 * Time tracking formatters. Every duration floors to its smallest unit, so a
 * counter never over-reports and copied lines add up to what was shown.
 */

/** pt-BR weekday abbreviations, indexed by `Date.getDay()` (copy format, Q19). */
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const pad = (n: number): string => String(n).padStart(2, '0')

/** Live session counter: `hh:mm:ss` (TIME-22, TIME-23). */
export function formatHms(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
}

/** The clickable session clock's tooltip: the current run, plus what a click
 *  does (TIME-23, STRP-12). */
export function clockToggleTitle(runMs: number, paused: boolean): string {
  return `current run ${formatHms(runMs)} · click to ${paused ? 'resume' : 'pause'}`
}

/** Worktree and task totals: `hh:mm` (TIME-25, TIME-26, TIME-30). */
export function formatHm(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** Copied durations: `XhMM`, e.g. `2h28`, `0h05` (TIME-39). */
export function formatHmCompact(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  return `${Math.floor(minutes / 60)}h${pad(minutes % 60)}`
}

/** Local day header: `dd/MM/yyyy (ddd)`, e.g. `16/09/2026 (qua)` (TIME-39). */
export function formatDayHeader(date: Date): string {
  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
  return `${day} (${WEEKDAYS[date.getDay()]})`
}
