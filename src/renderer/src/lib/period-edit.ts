const pad = (n: number): string => String(n).padStart(2, '0')

/** An ISO instant as a `datetime-local` value in local time, to the second. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** A `datetime-local` value (local time) as a UTC ISO instant; null when empty or invalid. */
export function fromLocalInput(value: string): string | null {
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** Tooltip of the hand mark on a period row (HTSK-38). */
export function handMarkTitle(branch: string | null): string {
  return branch === null ? 'Assigned by hand (no branch)' : `Assigned by hand (branch: ${branch})`
}

/** The `Split at` field's initial value: the period's midpoint, rounded down
 *  to the second, as a `datetime-local` value (HTSK-33). */
export function splitDefault(startIso: string, endIso: string): string {
  const mid = (Date.parse(startIso) + Date.parse(endIso)) / 2
  return toLocalInput(new Date(Math.floor(mid / 1000) * 1000).toISOString())
}
