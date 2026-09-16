/**
 * Whether a session's activity transition notifies the user, on which surface,
 * and what it says. Pure: main supplies window focus, the attached session and
 * the switches, so every rule below is a table test.
 */

import type { SessionActivity } from '../shared/config'
import {
  NOTIFIABLE_STATES,
  type NotifiableState,
  type NotificationPrefs
} from '../shared/notifications'

/** One activity transition, as `SessionManager` reports it. */
export interface ActivityChange {
  id: string
  agent: string
  title: string
  before: SessionActivity | null
  after: SessionActivity | null
  /** Whether this session's terminal is the one on screen. */
  attached: boolean
}

export type NotificationSurface = 'os' | 'in-app'

export interface NotificationInput {
  before: SessionActivity | null
  after: SessionActivity | null
  attached: boolean
  windowFocused: boolean
  prefs: NotificationPrefs
}

function isNotifiable(state: string): state is NotifiableState {
  return (NOTIFIABLE_STATES as readonly string[]).includes(state)
}

export function decideNotification(input: NotificationInput): NotificationSurface | null {
  const { before, after, attached, windowFocused, prefs } = input
  if (after === null || !isNotifiable(after.state)) return null
  // A first event is not the end of a turn: an untouched session can report
  // `idle_prompt` before it ever ran one (NOTF-27).
  if (before === null) return null
  // Only entering a state notifies; a new tool or subagent count is the same stop.
  if (before.state === after.state) return null
  if (!prefs.enabled || !prefs.states[after.state]) return null
  if (windowFocused && attached) return null
  return windowFocused ? 'in-app' : 'os'
}

function describeBody(activity: SessionActivity): string {
  switch (activity.state) {
    case 'needs-approval':
      return activity.tool ? `Needs approval to run ${activity.tool}` : 'Needs your approval'
    case 'needs-input':
      return 'Needs your input'
    case 'error':
      return activity.error ? `Turn failed: ${activity.error}` : 'Turn failed'
    default:
      return 'Finished its turn'
  }
}

export function describeNotification(
  session: { agent: string; title: string },
  activity: SessionActivity
): { title: string; body: string } {
  const prefix = `${session.agent} · `
  const title = session.title.startsWith(prefix) ? session.title : prefix + session.title
  return { title, body: describeBody(activity) }
}
