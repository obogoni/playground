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
  /**
   * Ids the main agent's last `Stop` listed in `background_tasks`: subagents and
   * shells still running, whose results will wake it again. Absent until a
   * `Stop` carries the list (it is undocumented; measured on Claude Code 2.1.283).
   */
  background?: string[]
  /**
   * Background subagents that stopped but whose result has not reached the
   * main agent yet. It arrives as a `<task-notification>` prompt a few
   * milliseconds after a `Stop` that already lists nothing (measured).
   */
  owed?: string[]
}

interface BackgroundTask {
  id: string
  type: string
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

function backgroundTasks(payload: Record<string, unknown>): BackgroundTask[] | undefined {
  const value = payload.background_tasks
  if (!Array.isArray(value)) return undefined
  return value.filter(
    (task): task is BackgroundTask =>
      typeof task === 'object' &&
      task !== null &&
      typeof (task as Record<string, unknown>).id === 'string' &&
      typeof (task as Record<string, unknown>).type === 'string'
  )
}

/** Build the next state, keeping the private fields and dropping stale detail. */
function to(
  state: MachineState | null,
  next: ActivityState,
  detail: { tool?: string; error?: string } = {}
): MachineState {
  const subagentIds = state?.subagentIds ?? []
  return {
    ...state,
    view: {
      state: next,
      subagents: subagentIds.length,
      ...(detail.tool ? { tool: detail.tool } : {}),
      ...(detail.error ? { error: detail.error } : {})
    },
    subagentIds
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
      return withResultDelivered(to(state, 'working'), str(payload, 'prompt'))
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
      return applyStop(state, backgroundTasks(payload))
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
      return applySubagentStop(state, payload)
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
  if (type === 'idle_prompt') return applyIdlePrompt(state)
  return state
}

/**
 * The main agent ended a turn. Background work it started wakes it again with
 * its result, so the turn is the user's only when its `background_tasks` lists
 * nothing still running, subagents and shells alike (ASUB-01, ASUB-03). The
 * list is also the truth about live subagents, so it replaces the counted set
 * (ASUB-17). A `Stop` without the list — an older Claude Code — falls back to
 * the counted subagents (ASUB-16).
 */
function applyStop(state: MachineState | null, tasks: BackgroundTask[] | undefined): MachineState {
  const owing = (state?.owed ?? []).length > 0
  if (tasks === undefined) {
    const busy = owing || (state?.subagentIds.length ?? 0) > 0
    return { ...to(state, busy ? 'working' : 'waiting'), background: undefined }
  }
  const background = tasks.map((task) => task.id)
  const subagentIds = tasks.filter((task) => task.type === 'subagent').map((task) => task.id)
  const next = to(state, owing || background.length > 0 ? 'working' : 'waiting')
  return { ...withSubagents(next, subagentIds), background }
}

/**
 * A background subagent stopping is still listed in its own `SubagentStop`,
 * and its result will wake the main agent once more: until that result is
 * delivered, the job is not over (ASUB-14). Side agents and foreground
 * subagents are not listed, so they owe nothing.
 */
function applySubagentStop(
  state: MachineState | null,
  payload: Record<string, unknown>
): MachineState | null {
  const agentId = str(payload, 'agent_id')
  const next = applySubagent(state, agentId, 'stop')
  if (next === null || agentId === undefined) return next
  const listed = backgroundTasks(payload)?.some(
    (task) => task.id === agentId && task.type === 'subagent'
  )
  const owed = next.owed ?? []
  return listed && !owed.includes(agentId) ? { ...next, owed: [...owed, agentId] } : next
}

/** A `<task-notification>` prompt delivers the result of the task it names (ASUB-15). */
function withResultDelivered(state: MachineState, prompt: string | undefined): MachineState {
  if (prompt === undefined || state.owed === undefined) return state
  const owed = state.owed.filter((id) => !prompt.includes(`<task-id>${id}</task-id>`))
  return owed.length === state.owed.length ? state : { ...state, owed }
}

/**
 * `idle_prompt` fires 60 s after the main agent stops even while background
 * work runs (measured), so it means "your turn" only when the last `Stop`
 * listed nothing — or, without a list, when no subagent is live (ASUB-05,
 * ASUB-16). It stays the only signal after an interrupt, which fires nothing.
 */
function applyIdlePrompt(state: MachineState | null): MachineState | null {
  const busy =
    state?.background !== undefined
      ? state.background.length > 0
      : (state?.subagentIds.length ?? 0) > 0
  // A result still owed at this point was lost; waiting is the recovery.
  return busy ? state : { ...withSubagents(to(state, 'waiting'), []), owed: [] }
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
