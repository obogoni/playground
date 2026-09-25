/**
 * Read `claude agents --json` — the documented listing of live Claude Code
 * sessions — into `sessionId → name` without trusting its shape (AD-040,
 * SNAME-13). The listing carries more per entry (`pid`, `cwd`, `kind`,
 * `status`, …); only these two fields are relied upon, and an entry that lacks
 * either is skipped rather than failing the whole call.
 *
 * `null` means the output was not a JSON array at all (a usage banner, a
 * partial write): the caller treats that as a failed call and keeps every
 * current name (SNAME-12).
 */
export function parseAgentsListing(stdout: string): Map<string, string> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  const names = new Map<string, string>()
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const { sessionId, name } = entry as { sessionId?: unknown; name?: unknown }
    if (typeof sessionId !== 'string' || sessionId === '') continue
    if (typeof name !== 'string') continue
    const trimmed = name.trim()
    if (trimmed === '') continue
    // A session resumed in two terminals lists twice: the first name wins.
    if (!names.has(sessionId)) names.set(sessionId, trimmed)
  }
  return names
}
