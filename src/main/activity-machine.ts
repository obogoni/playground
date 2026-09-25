/**
 * Folds Claude Code's lifecycle-hook events into what a session's agent is
 * doing (AD-019). Pure: no I/O, no timers, no clock — the spec's Transition
 * Table is the whole contract, and every row is a unit test.
 *
 * Two rules shape everything here:
 *
 * 1. **Never invent a state.** A session holds no activity until an event sets
 *    one, and an event this module does not consume returns the state it was
 *    given, by reference, so the caller can skip an emit (ACTV-06, ACTV-13).
 * 2. **Never derive a false "your turn".** Where the hooks are silent — a user
 *    interrupt fires nothing (documented) — the last state stands rather than
 *    being guessed forward.
 */

import type { ActivityState, SessionActivity } from '../shared/config'

export interface MachineState {
  view: SessionActivity
  /** Live subagents by the `agent_id` the hooks report; the count is its size. */
  subagentIds: string[]
  /** State to restore when the compaction that interrupted it finishes. */
  beforeCompact?: ActivityState
}

/** Notification types that mean the agent is blocked on the user. */
const APPROVAL_NOTIFICATIONS = ['permission_prompt']
const INPUT_NOTIFICATIONS = ['elicitation_dialog', 'elicitation_url_dialog']

/**
 * SessionEnd reasons that do NOT mean the agent is gone: the CLI stays up and a
 * new session begins at its prompt, so the agent is waiting on the user.
 *
 * It waits rather than merely keeping its old state because **`SessionStart`
 * never reaches an http hook** — measured on Claude Code 2.1.273, both at launch
 * and mid-session after `/clear`: the same event delivered to a `command` hook
 * and not to an `http` one. So nothing else would ever correct the state.
 */
const CONTINUING_END_REASONS = ['clear', 'resume']

function str(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

/** Build the next state, keeping the subagent set and dropping stale detail. */
function to(
  state: MachineState | null,
  next: ActivityState,
  detail: { tool?: string; error?: string } = {}
): MachineState {
  const subagentIds = state?.subagentIds ?? []
  return {
    view: {
      state: next,
      subagents: subagentIds.length,
      ...(detail.tool ? { tool: detail.tool } : {}),
      ...(detail.error ? { error: detail.error } : {})
    },
    subagentIds,
    ...(state?.beforeCompact ? { beforeCompact: state.beforeCompact } : {})
  }
}

/** Same state and detail, with a different subagent set. */
function withSubagents(state: MachineState, subagentIds: string[]): MachineState {
  return {
    ...state,
    view: { ...state.view, subagents: subagentIds.length },
    subagentIds
  }
}

export function applyHookEvent(
  state: MachineState | null,
  payload: Record<string, unknown>
): MachineState | null {
  const event = str(payload, 'hook_event_name')
  if (event === undefined) return state

  switch (event) {
    case 'SessionStart':
      // Currently unreachable: Claude Code 2.1.273 does not deliver SessionStart
      // to http hooks (see CONTINUING_END_REASONS). Kept because it is the
      // correct mapping the day it does, and because a session that never
      // reports simply shows `running`, which is the documented degrade path.
      // A compaction re-starts the session mid-turn; the turn is still running,
      // and PostCompact is what resumes it.
      return str(payload, 'source') === 'compact' ? state : to(null, 'waiting')
    case 'UserPromptSubmit':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'ElicitationResult':
      return to(state, 'working')
    case 'PreToolUse':
      return to(state, 'working', { tool: str(payload, 'tool_name') })
    case 'PermissionRequest':
      return to(state, 'needs-approval', { tool: str(payload, 'tool_name') })
    case 'Elicitation':
      return to(state, 'needs-input')
    case 'Stop':
      return to(state, 'waiting')
    case 'StopFailure':
      return to(state, 'error', { error: str(payload, 'error') })
    case 'Notification':
      return applyNotification(state, str(payload, 'notification_type'))
    case 'PreCompact':
      return { ...to(state, 'compacting'), beforeCompact: state?.view.state }
    case 'PostCompact':
      // Nothing to restore means the app attached mid-compaction; working is the
      // cheap error (a stale "your turn" is the expensive one).
      return to(state, state?.beforeCompact ?? 'working')
    case 'SubagentStart':
      return applySubagent(state, str(payload, 'agent_id'), 'start')
    case 'SubagentStop':
      return applySubagent(state, str(payload, 'agent_id'), 'stop')
    case 'SessionEnd':
      return CONTINUING_END_REASONS.includes(str(payload, 'reason') ?? '')
        ? to(null, 'waiting')
        : to(null, 'exited')
    default:
      return state
  }
}

function applyNotification(
  state: MachineState | null,
  type: string | undefined
): MachineState | null {
  if (type === undefined) return state
  if (APPROVAL_NOTIFICATIONS.includes(type)) return to(state, 'needs-approval')
  if (INPUT_NOTIFICATIONS.includes(type)) return to(state, 'needs-input')
  if (type === 'idle_prompt') return to(state, 'waiting')
  return state
}

function applySubagent(
  state: MachineState | null,
  agentId: string | undefined,
  edge: 'start' | 'stop'
): MachineState | null {
  if (state === null || agentId === undefined) return state
  const held = state.subagentIds.includes(agentId)
  if (edge === 'start') {
    return held ? state : withSubagents(state, [...state.subagentIds, agentId])
  }
  return held
    ? withSubagents(
        state,
        state.subagentIds.filter((id) => id !== agentId)
      )
    : state
}

/**
 * The user typed into a session that is blocked on them. No hook fires between
 * a permission being granted and the approved tool finishing, so the keystroke
 * that answered the dialog is the only signal that work resumed (ACTV-12).
 */
export function applyKeystroke(state: MachineState | null): MachineState | null {
  if (state === null) return state
  const blocked = state.view.state === 'needs-approval' || state.view.state === 'needs-input'
  return blocked ? to(state, 'working') : state
}

/** Whether two views would render identically — the ACTV-06 emit gate. */
export function sameView(a: SessionActivity | null, b: SessionActivity | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.state === b.state && a.tool === b.tool && a.subagents === b.subagents && a.error === b.error
  )
}
