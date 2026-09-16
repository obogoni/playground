import type { JSX, KeyboardEvent, MouseEvent } from 'react'
import { useRef, useState } from 'react'
import type { AgentDef } from '../../../shared/agents'
import type { SessionView } from '../../../shared/config'
import type { PinnedTaskView } from '../../../shared/tasks'
import type { TimeSnapshot } from '../../../shared/time'
import type { WorkspaceNode } from '../../../shared/tree'
import { agentTileStyle } from '../lib/agent-color'
import {
  adjacentRowId,
  buildRailGroups,
  flatRows,
  statusClass,
  type RailGroup,
  type RailRow,
  type RowAction
} from '../lib/rail-groups'
import { badgeTypeOf, stateClass, typeClass } from '../lib/task-pills'
import { taskTotalMs, worktreeTotalMs } from '../lib/time-totals'
import { Icon } from './Icon'
import { SessionClock, TotalClock } from './TimeCounter'
import './SessionRail.css'

/** Above this many live sessions the rail warns about resource use (AGCF-06). */
const CONCURRENCY_WARN_AT = 4

interface SessionRailProps {
  sessions: SessionView[]
  tree: WorkspaceNode[]
  agents: AgentDef[]
  tasks: PinnedTaskView[]
  /** Time snapshot for the row counters and group totals (TIME-22, TIME-26, TIME-27). */
  time: TimeSnapshot
  selectedId: string | null
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
  onNew: () => void
}

/** 344px master list (rail v2): header + one card per task group, one row per
 *  session. Every label, status, tooltip and action set comes from
 *  `buildRailGroups` — this component decides nothing. */
export function SessionRail({
  sessions,
  tree,
  agents,
  tasks,
  time,
  selectedId,
  onSelect,
  onStop,
  onRespawn,
  onRemove,
  onNew
}: SessionRailProps): JSX.Element {
  const runningCount = sessions.filter((s) => s.status === 'running').length
  const groups = buildRailGroups(sessions, tree, tasks)
  const rows = flatRows(groups)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  // Roving tabIndex: the focused row is the rail's single tab stop. It follows
  // the selection until an arrow key moves it, and falls back to the first row.
  const held = (id: string | null): boolean => id !== null && rows.some((row) => row.id === id)
  const tabStopId = held(focusedId)
    ? focusedId
    : held(selectedId)
      ? selectedId
      : (rows[0]?.id ?? null)

  const registerRow = (id: string, node: HTMLDivElement | null): void => {
    if (node) rowRefs.current.set(id, node)
    else rowRefs.current.delete(id)
  }

  // Arrows move focus only — the active session, and therefore the TerminalPane
  // mount, is untouched until Enter or Space (RAIL-21, RAIL-22, RAIL-23).
  const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = adjacentRowId(groups, id, event.key === 'ArrowDown' ? 1 : -1)
      if (next === null) return
      setFocusedId(next)
      rowRefs.current.get(next)?.focus()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(id)
    }
  }

  return (
    <aside className="session-rail">
      <header className="session-rail-header">
        <div className="session-rail-title-row">
          <span className="session-rail-title">AGENTS</span>
          <span className="session-rail-count">{runningCount} running</span>
        </div>
        <button type="button" className="session-rail-new" onClick={onNew}>
          <Icon name="plus" size={14} strokeWidth={2.2} /> New session
        </button>
      </header>
      {runningCount >= CONCURRENCY_WARN_AT && (
        <div className="session-rail-warning" role="status">
          <Icon name="alert" size={14} />
          <span>{runningCount} live sessions — each is a real OS process consuming resources.</span>
        </div>
      )}
      <div className="session-rail-list" role="listbox" aria-label="Agent sessions">
        {groups.length === 0 ? (
          <div className="session-rail-empty">No sessions yet.</div>
        ) : (
          groups.map((group) => (
            <TaskGroupCard
              key={group.key}
              group={group}
              agents={agents}
              time={time}
              selectedId={selectedId}
              tabStopId={tabStopId}
              registerRow={registerRow}
              onRowKeyDown={onRowKeyDown}
              onSelect={onSelect}
              onStop={onStop}
              onRespawn={onRespawn}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </aside>
  )
}

interface TaskGroupCardProps {
  group: RailGroup
  agents: AgentDef[]
  time: TimeSnapshot
  selectedId: string | null
  tabStopId: string | null
  registerRow: (id: string, node: HTMLDivElement | null) => void
  onRowKeyDown: (event: KeyboardEvent<HTMLDivElement>, id: string) => void
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
}

/** One group card: a header variant plus its rows. The card itself is never
 *  clickable — only its rows are (handoff §4.1). */
function TaskGroupCard({
  group,
  agents,
  time,
  selectedId,
  tabStopId,
  registerRow,
  onRowKeyDown,
  onSelect,
  onStop,
  onRespawn,
  onRemove
}: TaskGroupCardProps): JSX.Element {
  const holdsSelection = group.rows.some((row) => row.id === selectedId)
  // Task groups total by task id; an orphan group is one session, totalled by its cwd.
  const total =
    group.kind === 'task'
      ? {
          totalAt: (now: number) => taskTotalMs(time, group.taskId, now),
          live: time.open.some((p) => p.taskId === group.taskId)
        }
      : {
          totalAt: (now: number) => worktreeTotalMs(time, group.rows[0].session.cwd, now),
          live: time.open.some(
            (p) => p.cwd.toLowerCase() === group.rows[0].session.cwd.toLowerCase()
          )
        }

  return (
    <div
      className={`rail-group${holdsSelection ? ' selected' : ''}`}
      role="group"
      aria-label={group.ariaLabel}
    >
      {group.kind === 'task' ? (
        <div className="rail-group-header" title={group.branch}>
          <div className="rail-group-head-row">
            {group.details && (
              <span className={`task-pill ${typeClass(badgeTypeOf(group.details))}`}>
                <span className="task-pill-dot" />
                {badgeTypeOf(group.details)}
              </span>
            )}
            <span className="rail-group-id">#{group.taskId}</span>
            <span className="rail-group-spacer" />
            <TotalClock className="rail-group-time" {...total} />
            {group.details && (
              <span className={`task-pill ${stateClass(group.details.state)}`}>
                {group.details.state}
              </span>
            )}
          </div>
          {group.details ? (
            <span className="rail-group-title">{group.details.title}</span>
          ) : (
            <span className="rail-group-branch">{group.branch}</span>
          )}
        </div>
      ) : (
        <div className="rail-group-header" title={group.label}>
          <div className="rail-group-head-row">
            <Icon name="git-fork" size={12} />
            <span className="rail-group-name">{group.label}</span>
            <TotalClock className="rail-group-time" {...total} />
          </div>
          <span className={`rail-group-note ${group.reason}`}>{group.note}</span>
        </div>
      )}
      <div className="rail-group-rows">
        {group.rows.map((row) => (
          <SessionRow
            key={row.id}
            row={row}
            agents={agents}
            time={time}
            selected={row.id === selectedId}
            tabStop={row.id === tabStopId}
            registerRow={registerRow}
            onRowKeyDown={onRowKeyDown}
            onSelect={onSelect}
            onStop={onStop}
            onRespawn={onRespawn}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  )
}

interface SessionRowProps {
  row: RailRow
  agents: AgentDef[]
  time: TimeSnapshot
  selected: boolean
  tabStop: boolean
  registerRow: (id: string, node: HTMLDivElement | null) => void
  onRowKeyDown: (event: KeyboardEvent<HTMLDivElement>, id: string) => void
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
}

/** Icon, glyph size and tooltip verb for each action the model can list. */
const ACTION_ICON = {
  stop: { name: 'stop-square', size: 10, verb: 'Stop' },
  respawn: { name: 'refresh', size: 12, verb: 'Respawn' },
  remove: { name: 'trash', size: 12, verb: 'Remove' }
} as const

function SessionRow({
  row,
  agents,
  time,
  selected,
  tabStop,
  registerRow,
  onRowKeyDown,
  onSelect,
  onStop,
  onRespawn,
  onRemove
}: SessionRowProps): JSX.Element {
  const handlers: Record<RowAction, (id: string) => void> = {
    stop: onStop,
    respawn: onRespawn,
    remove: onRemove
  }

  // Action buttons live inside the selection control, so every one of them
  // stops the click from reaching the row (RAIL-17).
  const act = (event: MouseEvent, fn: () => void): void => {
    event.stopPropagation()
    fn()
  }

  // SPEC_DEVIATION: design.md types the row as `<button role="option">`; it is a
  // div instead.
  // Reason: the row contains the action buttons, and a button inside a button is
  // invalid HTML. Handoff §6 offers `role="option"` as the sanctioned alternative,
  // and the roles, focus and selection semantics the ACs name are unchanged.
  return (
    <div
      className={`rail-row${selected ? ' selected' : ''}`}
      role="option"
      aria-selected={selected}
      tabIndex={tabStop ? 0 : -1}
      ref={(node) => registerRow(row.id, node)}
      title={row.tooltip}
      onClick={() => onSelect(row.id)}
      onKeyDown={(event) => onRowKeyDown(event, row.id)}
    >
      <span className="rail-row-tile" style={agentTileStyle(agents, row.session.agent)}>
        {row.session.agent.charAt(0)}
      </span>
      <span className="rail-row-label">{row.label}</span>
      <span className={`rail-row-status ${statusClass(row.status)}`}>{row.status}</span>
      {/* The one addition AD-021 allows on a row beyond RAIL-12's list. */}
      <SessionClock className="rail-row-time" snapshot={time} sessionId={row.id} />
      <span className={`rail-row-dot ${statusClass(row.status)}`} />
      <span className="rail-row-actions">
        {row.actions.map((action) => (
          <button
            key={action}
            type="button"
            className={`rail-row-btn${action === 'remove' ? ' red' : ''}`}
            title={`${ACTION_ICON[action].verb} ${row.label} session`}
            aria-label={`${ACTION_ICON[action].verb} ${row.label} session`}
            onClick={(e) => act(e, () => handlers[action](row.id))}
          >
            <Icon name={ACTION_ICON[action].name} size={ACTION_ICON[action].size} />
          </button>
        ))}
      </span>
    </div>
  )
}
