import type { JSX } from 'react'
import type { SessionView } from '../../../shared/config'
import type { WorkspaceNode } from '../../../shared/tree'
import { deriveAttribution } from '../lib/session-attribution'
import { Icon } from './Icon'
import { SessionRail } from './SessionRail'
import { TerminalPane } from './TerminalPane'
import './AgentsView.css'

interface AgentsViewProps {
  sessions: SessionView[]
  tree: WorkspaceNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
  onNew: () => void
}

/**
 * Agents direction (handoff §Screen Direction C): the 344px session rail on the
 * left and the terminal detail panel on the right. The active session is the
 * selected one, falling back to the first; only it streams (TerminalPane
 * attaches on mount).
 */
export function AgentsView({
  sessions,
  tree,
  selectedId,
  onSelect,
  onStop,
  onRespawn,
  onRemove,
  onNew
}: AgentsViewProps): JSX.Element {
  const active = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null

  return (
    <div className="agents-view">
      <SessionRail
        sessions={sessions}
        tree={tree}
        selectedId={active?.id ?? null}
        onSelect={onSelect}
        onStop={onStop}
        onRespawn={onRespawn}
        onRemove={onRemove}
        onNew={onNew}
      />
      {active ? (
        <SessionDetail
          session={active}
          tree={tree}
          onStop={onStop}
          onRespawn={onRespawn}
          onRemove={onRemove}
        />
      ) : (
        <div className="agents-detail-empty">
          <Icon name="terminal" size={26} />
          <p>No agent sessions yet.</p>
          <button type="button" className="agents-empty-new" onClick={onNew}>
            <Icon name="plus" size={14} strokeWidth={2.2} /> New session
          </button>
        </div>
      )}
    </div>
  )
}

interface SessionDetailProps {
  session: SessionView
  tree: WorkspaceNode[]
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
}

function SessionDetail({
  session,
  tree,
  onStop,
  onRespawn,
  onRemove
}: SessionDetailProps): JSX.Element {
  const { branch, taskId, detached } = deriveAttribution(tree, session.cwd)
  const running = session.status === 'running'

  return (
    <div className="agents-detail">
      <header className="agents-detail-bar">
        <div className="agents-detail-tile">{session.agent.charAt(0)}</div>
        <div className="agents-detail-titles">
          <span className="agents-detail-title">{session.title}</span>
          <span className="agents-detail-cwd">{session.cwd}</span>
        </div>
        <span className={`agents-detail-pill ${running ? 'green' : 'faint'}`}>
          {running ? 'running' : 'stopped'}
        </span>
        <div className="agents-detail-actions">
          {running ? (
            <button type="button" className="agents-detail-btn" onClick={() => onStop(session.id)}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="agents-detail-btn"
              disabled={session.pathMissing}
              onClick={() => onRespawn(session.id)}
            >
              <Icon name="refresh" size={13} /> Respawn
            </button>
          )}
          {!running && (
            <button
              type="button"
              className="agents-detail-btn red"
              onClick={() => onRemove(session.id)}
            >
              <Icon name="trash" size={13} /> Remove
            </button>
          )}
        </div>
      </header>

      <div className="agents-detail-strip">
        {detached ? (
          <span className="agents-strip-tag">detached</span>
        ) : (
          <>
            {branch && <span className="agents-strip-branch">{branch}</span>}
            {taskId !== null && <span className="agents-strip-task">#{taskId}</span>}
          </>
        )}
        {session.pathMissing && <span className="agents-strip-tag red">path missing</span>}
      </div>

      {running ? (
        <TerminalPane key={session.id} sessionId={session.id} />
      ) : (
        <div className="agents-detail-stopped">
          <p>This session is stopped.</p>
          {!session.pathMissing && (
            <button
              type="button"
              className="agents-empty-new"
              onClick={() => onRespawn(session.id)}
            >
              <Icon name="refresh" size={14} /> Respawn in {session.cwd}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
