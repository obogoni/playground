/**
 * WHF — a pure "N ago" formatter, extracted from `TopBar`'s inline helper so the
 * run header (WHF-17) and RECENT RUNS rows (WHF-22) share one implementation.
 *
 * Pure given `nowMs`: the caller ticks `nowMs` on a light interval so the label
 * updates as boundaries cross (spec Edge "relative time crosses a boundary …
 * updates within ~a minute"). Both arguments are epoch ms — an ISO `startedAt`
 * is converted by the caller via `Date.parse`.
 *
 * `< 1m` → "just now"; minutes → "Nm ago"; hours → "Nh ago".
 */
export function relativeTime(fromMs: number, nowMs: number): string {
  const minutes = Math.floor((nowMs - fromMs) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}
