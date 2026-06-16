import type { JSX, MouseEvent } from 'react'
import type { SessionView } from '../../../shared/config'
import type { WorkspaceNode } from '../../../shared/tree'
import { deriveAttribution } from '../lib/session-attribution'
import { Icon } from './Icon'
import './SessionRail.css'

interface SessionRailProps {
  sessions: SessionView[]
  tree: WorkspaceNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
  onNew: () => void
}

/** 344px master list (handoff §C): header + one card per session. */
export function SessionRail({
  sessions,
  tree,
  selectedId,
  onSelect,
  onStop,
  onRespawn,
  onRemove,
  onNew
}: SessionRailProps): JSX.Element {
  const runningCount = sessions.filter((s) => s.status === 'running').length

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
      <div className="session-rail-list">
        {sessions.length === 0 ? (
          <div className="session-rail-empty">No sessions yet.</div>
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              tree={tree}
              selected={session.id === selectedId}
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

interface SessionCardProps {
  session: SessionView
  tree: WorkspaceNode[]
  selected: boolean
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
}

function SessionCard({
  session,
  tree,
  selected,
  onSelect,
  onStop,
  onRespawn,
  onRemove
}: SessionCardProps): JSX.Element {
  const { branch, taskId, detached } = deriveAttribution(tree, session.cwd)
  const running = session.status === 'running'
  const statusClass = running ? 'green' : 'faint'

  const act = (event: MouseEvent, fn: () => void): void => {
    event.stopPropagation()
    fn()
  }

  return (
    <div
      className={`session-card${selected ? ' selected' : ''}`}
      onClick={() => onSelect(session.id)}
    >
      <div className="session-card-head">
        <div className="session-card-tile">{session.agent.charAt(0)}</div>
        <div className="session-card-titles">
          <span className="session-card-title">{session.title}</span>
          <span className="session-card-meta">
            {detached ? 'detached' : (branch ?? session.cwd)}
            {taskId !== null ? ` · #${taskId}` : ''}
          </span>
        </div>
        <span className={`session-card-dot ${statusClass}`} aria-label={session.status} />
      </div>
      <div className="session-card-tags">
        <span className="session-card-status">{running ? 'running' : 'stopped'}</span>
        {detached && <span className="session-card-tag">detached</span>}
        {session.pathMissing && <span className="session-card-tag red">path missing</span>}
      </div>
      <div className="session-card-footer">
        {running ? (
          <button
            type="button"
            className="session-card-btn"
            onClick={(e) => act(e, () => onStop(session.id))}
          >
            Stop
          </button>
        ) : session.pathMissing ? (
          <button
            type="button"
            className="session-card-btn red"
            onClick={(e) => act(e, () => onRemove(session.id))}
          >
            <Icon name="trash" size={13} /> Remove
          </button>
        ) : (
          <>
            <button
              type="button"
              className="session-card-btn"
              onClick={(e) => act(e, () => onRespawn(session.id))}
            >
              <Icon name="refresh" size={13} /> Respawn
            </button>
            <button
              type="button"
              className="session-card-btn red"
              onClick={(e) => act(e, () => onRemove(session.id))}
            >
              <Icon name="trash" size={13} /> Remove
            </button>
          </>
        )}
      </div>
    </div>
  )
}
