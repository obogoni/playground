/**
 * The renderer's two decisions about a session's name (AD-040): how a pushed
 * change is applied to the list, and what label a row renders. Kept out of the
 * components so they carry unit tests — the components themselves are
 * hand-verified by convention (`TESTING.md`).
 */

import type { SessionView } from '../../../shared/config'

/**
 * Apply one `session:name` push to the list, in place — the `applyActivity`
 * shape (SNAME-02). `null` clears the name (SNAME-04). An id the list does not
 * hold is dropped: the next `sessions:list` carries the state anyway.
 */
export function applyName(sessions: SessionView[], id: string, name: string | null): SessionView[] {
  return sessions.map((session) =>
    session.id === id ? { ...session, ...(name ? { name } : { name: undefined }) } : session
  )
}

/** The row's label: the name Claude gives the session, else the agent's
 *  display name (SNAME-01, SNAME-03). The tile already identifies the agent. */
export function rowLabel(session: SessionView): string {
  return session.name ?? session.agent
}
