import type { ActivityState, SessionView } from '../../../shared/config'
import type { PinnedTaskView, WorkItemDetails } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'
import { deriveAttribution, linkedPinFor } from './session-attribution'

/** Short row status, ordered by precedence (RAIL-14). A running session whose
 *  agent reports what it is doing shows that instead of the bare `running`
 *  (ACTV-19); everything else is unchanged. */
export type RowStatus =
  | 'working'
  | 'compacting'
  | 'waiting'
  | 'approval'
  | 'input'
  | 'error'
  | 'shell'
  | 'running'
  | 'stopped'
  | 'path missing'

/** Row label for each activity state the agent's hooks can produce. */
const ACTIVITY_STATUS: Record<ActivityState, RowStatus> = {
  working: 'working',
  compacting: 'compacting',
  waiting: 'waiting',
  'needs-approval': 'approval',
  'needs-input': 'input',
  error: 'error',
  exited: 'shell'
}

/** Row action buttons, in render order (RAIL-16). */
export type RowAction = 'stop' | 'respawn' | 'remove'

/** Why a session has no task group; precedence `missing` > `detached` > `untagged`. */
export type OrphanReason = 'missing' | 'detached' | 'untagged'

export interface RailRow {
  /** session.id — selection key and focus-map key. */
  id: string
  session: SessionView
  /** Agent name, ordinal-suffixed when ambiguous inside the group (RAIL-13). */
  label: string
  status: RowStatus
  /** `<session.title> · <branch>`, cwd substituted when detached (RAIL-15). */
  tooltip: string
  /** In render order (RAIL-16). */
  actions: RowAction[]
}

interface RailGroupBase {
  /** `task:<id>` or `session:<id>` — the React key (RAIL-02). */
  key: string
  rows: RailRow[]
  /** role="group" aria-label (RAIL-19). */
  ariaLabel: string
}

export interface TaskGroup extends RailGroupBase {
  kind: 'task'
  taskId: number
  /** From the group's FIRST session's worktree; also the header title attr (RAIL-03). */
  branch: string
  /** Null when the id is unpinned or details have not resolved (RAIL-08). */
  details: WorkItemDetails | null
}

export interface OrphanGroup extends RailGroupBase {
  kind: 'orphan'
  reason: OrphanReason
  /** Branch, or the cwd folder leaf when detached (RAIL-09..11). */
  label: string
  /** `detached · <folder>` | `untagged worktree` | `worktree path missing`. */
  note: string
}

export type RailGroup = TaskGroup | OrphanGroup

/** CSS class for a row status — mirrors task-pills.ts's class-returning
 *  convention and folds the space out of `path missing`. */
export function statusClass(status: RowStatus): string {
  return status === 'path missing' ? 'missing' : status
}

/** Last non-empty path segment of a cwd, on either path separator. */
function folderLeaf(cwd: string): string {
  const segments = cwd.split(/[\\/]/).filter((segment) => segment !== '')
  return segments[segments.length - 1] ?? cwd
}

/** Status precedence `running` > `path missing` > `stopped` (RAIL-14), with a
 *  running session's activity taking the label when its agent reports one. */
function rowStatus(session: SessionView): RowStatus {
  if (session.status === 'running') {
    return session.activity ? ACTIVITY_STATUS[session.activity.state] : 'running'
  }
  if (session.pathMissing) return 'path missing'
  return 'stopped'
}

/** Stop when running (whatever the agent is doing); Remove alone on a
 *  non-running path-missing row; Respawn then Remove otherwise (RAIL-16). */
function rowActions(status: RowStatus): RowAction[] {
  if (status === 'stopped') return ['respawn', 'remove']
  if (status === 'path missing') return ['remove']
  return ['stop']
}

/** What a running agent is doing right now, appended to the row tooltip
 *  (ACTV-24..26). Empty when the session reports nothing. */
function activityDetail(session: SessionView): string {
  const activity = session.activity
  if (!activity) return ''
  const parts: string[] = []
  if (activity.tool) parts.push(activity.tool)
  if (activity.subagents > 0) {
    parts.push(`${activity.subagents} subagent${activity.subagents === 1 ? '' : 's'}`)
  }
  if (activity.error) parts.push(activity.error)
  return parts.map((part) => ` · ${part}`).join('')
}

export interface HeaderCounts {
  /** Live shells, the pre-feature counter. */
  running: number
  /** Agents actually doing something (ACTV-22). */
  working: number
  /** Agents blocked on the user or failed (ACTV-23). */
  needYou: number
}

export function headerCounts(sessions: SessionView[]): HeaderCounts {
  const states = sessions
    .filter((session) => session.status === 'running')
    .map((session) => session.activity?.state)
  return {
    running: states.length,
    working: states.filter((state) => state === 'working' || state === 'compacting').length,
    needYou: states.filter(
      (state) => state === 'needs-approval' || state === 'needs-input' || state === 'error'
    ).length
  }
}

interface PendingGroup {
  key: string
  kind: 'task' | 'orphan'
  taskId: number | null
  branch: string | null
  details: WorkItemDetails | null
  reason: OrphanReason | null
  label: string
  note: string
  entries: { session: SessionView; branch: string | null; detached: boolean }[]
}

/**
 * The rail's complete view model, derived at render time from the props the
 * renderer already holds — no persisted grouping field is read or written
 * (RAIL-01). Sessions are walked once in their persisted order and nothing is
 * sorted, so group and row order cannot shift when a status changes (RAIL-04,
 * RAIL-05).
 */
export function buildRailGroups(
  sessions: SessionView[],
  tree: WorkspaceNode[],
  tasks: PinnedTaskView[]
): RailGroup[] {
  const pending: PendingGroup[] = []
  const byKey = new Map<string, PendingGroup>()

  for (const session of sessions) {
    const { branch, taskId, detached } = deriveAttribution(tree, session.cwd)
    const key = taskId !== null ? `task:${taskId}` : `session:${session.id}`
    let group = byKey.get(key)
    if (!group) {
      group =
        taskId !== null
          ? {
              key,
              kind: 'task',
              taskId,
              branch: branch ?? session.cwd,
              details: linkedPinFor(tasks, taskId)?.details ?? null,
              reason: null,
              label: '',
              note: '',
              entries: []
            }
          : orphanGroup(key, session, branch, detached)
      byKey.set(key, group)
      pending.push(group)
    }
    group.entries.push({ session, branch, detached })
  }

  return pending.map(toRailGroup)
}

/** Orphan classification and its note text (RAIL-09, RAIL-10, RAIL-11). */
function orphanGroup(
  key: string,
  session: SessionView,
  branch: string | null,
  detached: boolean
): PendingGroup {
  const folder = folderLeaf(session.cwd)
  const label = branch ?? folder
  const reason: OrphanReason = session.pathMissing ? 'missing' : detached ? 'detached' : 'untagged'
  const note =
    reason === 'missing'
      ? 'worktree path missing'
      : reason === 'detached'
        ? `detached · ${folder}`
        : 'untagged worktree'
  return {
    key,
    kind: 'orphan',
    taskId: null,
    branch,
    details: null,
    reason,
    label,
    note,
    entries: []
  }
}

function toRailGroup(group: PendingGroup): RailGroup {
  const rows = resolveRows(group)
  if (group.kind === 'task' && group.taskId !== null) {
    const branch = group.branch ?? ''
    return {
      key: group.key,
      kind: 'task',
      taskId: group.taskId,
      branch,
      details: group.details,
      ariaLabel: `#${group.taskId} ${group.details ? group.details.title : branch}`,
      rows
    }
  }
  return {
    key: group.key,
    kind: 'orphan',
    reason: group.reason ?? 'untagged',
    label: group.label,
    note: group.note,
    ariaLabel: group.label,
    rows
  }
}

/**
 * One row per session, fully resolved. An agent name appearing twice or more in
 * the same group is suffixed with its 1-based position among its namesakes
 * (RAIL-13); a name unique within its group stays bare.
 */
function resolveRows(group: PendingGroup): RailRow[] {
  const counts = new Map<string, number>()
  for (const entry of group.entries) {
    counts.set(entry.session.agent, (counts.get(entry.session.agent) ?? 0) + 1)
  }
  const seen = new Map<string, number>()

  return group.entries.map(({ session, branch, detached }) => {
    const ordinal = (seen.get(session.agent) ?? 0) + 1
    seen.set(session.agent, ordinal)
    const ambiguous = (counts.get(session.agent) ?? 0) > 1
    const status = rowStatus(session)
    return {
      id: session.id,
      session,
      label: ambiguous ? `${session.agent} ${ordinal}` : session.agent,
      status,
      tooltip: `${session.title} · ${detached || branch === null ? session.cwd : branch}${activityDetail(session)}`,
      actions: rowActions(status)
    }
  })
}

/** Every row in visual order, group boundaries flattened away — the order the
 *  keyboard walks (RAIL-21, RAIL-22). */
export function flatRows(groups: RailGroup[]): RailRow[] {
  return groups.flatMap((group) => group.rows)
}

/**
 * The id of the row `delta` steps from `fromId` in visual order. Clamps at both
 * ends — the first row's previous is itself and the last row's next is itself,
 * so a keypress never jumps the viewport end-to-end (RAIL-21, RAIL-22). An id
 * that is no longer in the model returns null and the caller no-ops.
 */
export function adjacentRowId(groups: RailGroup[], fromId: string, delta: 1 | -1): string | null {
  const rows = flatRows(groups)
  const index = rows.findIndex((row) => row.id === fromId)
  if (index === -1) return null
  const next = index + delta
  if (next < 0 || next >= rows.length) return fromId
  return rows[next].id
}
