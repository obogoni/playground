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
import { taskIdFromBranch, type PinnedTaskView } from '../shared/tasks'

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

/** The longest notification title; the Windows title line does not wrap (NOTF-33). */
export const MAX_TITLE_LENGTH = 60

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Title and body of a notification. With a task, the task leads the title and the
 * session moves to a second body line (NOTF-30..32); without one, the session is
 * the title.
 */
export function describeNotification(
  session: { agent: string; title: string },
  activity: SessionActivity,
  task: LinkedTask | null = null
): { title: string; body: string } {
  const prefix = `${session.agent} · `
  const sessionLine = session.title.startsWith(prefix) ? session.title : prefix + session.title
  if (task === null) {
    return { title: clip(sessionLine, MAX_TITLE_LENGTH), body: describeBody(activity) }
  }
  const taskLine = task.title === null ? `#${task.id}` : `#${task.id} · ${task.title}`
  return {
    title: clip(taskLine, MAX_TITLE_LENGTH),
    body: `${describeBody(activity)}\n${sessionLine}`
  }
}

/** The task a session works on: its number, and its title when a pin has it cached. */
export interface LinkedTask {
  id: number
  title: string | null
}

/**
 * The task a branch names, by the rail's own rules: the number in the last branch
 * segment, and the first pin with that id for the title (NOTF-30, NOTF-31). No
 * network: an unpinned or not-yet-fetched task is just its number.
 */
export function linkTask(branch: string | null, tasks: PinnedTaskView[]): LinkedTask | null {
  if (branch === null) return null
  const id = taskIdFromBranch(branch)
  if (id === null) return null
  const pin = tasks.find((task) => task.id === id)
  return { id, title: pin?.details?.title ?? null }
}
