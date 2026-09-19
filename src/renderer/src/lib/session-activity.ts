/**
 * The renderer's two decisions about a session's activity: how a pushed change
 * is applied to the list, and how the detail pane words it.
 *
 * Both live here rather than inside their components so they carry unit tests —
 * the components themselves are hand-verified by convention (`TESTING.md`), and
 * a rule that decides what the user reads should not be the untested half.
 */

import type { ActivityState, SessionActivity, SessionView } from '../../../shared/config'

/**
 * Apply one `session:activity` push to the list, in place. Activity changes on
 * every tool call, so the renderer patches the single session instead of
 * re-fetching the whole list (ACTV-07). An id the list does not hold is
 * dropped: the next `sessions:list` carries the state anyway.
 */
export function applyActivity(
  sessions: SessionView[],
  id: string,
  activity: SessionActivity | null
): SessionView[] {
  return sessions.map((session) =>
    session.id === id
      ? { ...session, ...(activity ? { activity } : { activity: undefined }) }
      : session
  )
}

/** Detail-pane wording. Fuller than the rail's short labels, per the handoff. */
const ACTIVITY_LABEL: Record<ActivityState, string> = {
  working: 'working',
  compacting: 'compacting',
  waiting: 'waiting for you',
  'needs-approval': 'needs approval',
  'needs-input': 'needs input',
  error: 'turn failed',
  exited: 'agent exited · shell'
}

/**
 * How the pill names a tool. An MCP tool arrives as `mcp__<server>__<tool>`,
 * which can run past 30 characters; the pill shows `MCP <server>` instead, the
 * server spelled exactly as configured (STRP-01, STRP-02). Anything that does
 * not split into two non-empty segments is shown as received (STRP-03, STRP-04).
 */
export function mcpToolLabel(tool: string): string {
  if (!tool.startsWith('mcp__')) return tool
  const rest = tool.slice('mcp__'.length)
  const split = rest.indexOf('__')
  if (split <= 0 || split + 2 >= rest.length) return tool
  return `MCP ${rest.slice(0, split)}`
}

/** Pill colour: green while the agent works, blue while it waits, pink while it
 *  is blocked on the user, red on a failed turn, amber once it has exited to the
 *  shell (ACTV-27). The tokens match the rail's row indicators. */
export function detailPillClass(session: SessionView): string {
  if (session.status !== 'running') return 'faint'
  switch (session.activity?.state) {
    case 'needs-approval':
    case 'needs-input':
      return 'pink'
    case 'error':
      return 'red'
    case 'exited':
      return 'amber'
    case 'waiting':
      return 'blue'
    default:
      return 'green'
  }
}

/** The state, plus what it is doing: `working · Bash · 2 subagents` (ACTV-24..27). */
export function detailPillText(session: SessionView): string {
  if (session.status !== 'running') return 'stopped'
  const activity = session.activity
  if (!activity) return 'running'
  const detail = [
    activity.tool && mcpToolLabel(activity.tool),
    activity.subagents > 0
      ? `${activity.subagents} subagent${activity.subagents === 1 ? '' : 's'}`
      : undefined,
    activity.error
  ].filter(Boolean)
  return [ACTIVITY_LABEL[activity.state], ...detail].join(' · ')
}

/** The pill's tooltip: the tool name exactly as the agent reported it, so the
 *  shortened `MCP <server>` never costs the technical name (STRP-05). */
export function detailPillTitle(session: SessionView): string | undefined {
  return session.activity?.tool
}
