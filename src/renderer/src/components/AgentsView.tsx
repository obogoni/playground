import { useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import type { AgentDef } from '../../../shared/agents'
import type { SessionView } from '../../../shared/config'
import type { WorkspaceNode } from '../../../shared/tree'
import { agentTileStyle } from '../lib/agent-color'
import { deriveAttribution } from '../lib/session-attribution'
import { Icon } from './Icon'
import { SessionRail } from './SessionRail'
import { TerminalPane } from './TerminalPane'
import './AgentsView.css'

interface AgentsViewProps {
  sessions: SessionView[]
  tree: WorkspaceNode[]
  agents: AgentDef[]
  selectedId: string | null
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
  onRename: (id: string, title: string) => void
  onDuplicate: (id: string) => void
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
  agents,
  selectedId,
  onSelect,
  onStop,
  onRespawn,
  onRemove,
  onRename,
  onDuplicate,
  onNew
}: AgentsViewProps): JSX.Element {
  const active = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null

  return (
    <div className="agents-view">
      <SessionRail
        sessions={sessions}
        tree={tree}
        agents={agents}
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
          agents={agents}
          onStop={onStop}
          onRespawn={onRespawn}
          onRemove={onRemove}
          onRename={onRename}
          onDuplicate={onDuplicate}
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
  agents: AgentDef[]
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
  onRename: (id: string, title: string) => void
  onDuplicate: (id: string) => void
}

function SessionDetail({
  session,
  tree,
  agents,
  onStop,
  onRespawn,
  onRemove,
  onRename,
  onDuplicate
}: SessionDetailProps): JSX.Element {
  const { branch, taskId, detached } = deriveAttribution(tree, session.cwd)
  const running = session.status === 'running'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)

  const startRename = (): void => {
    setDraft(session.title)
    setEditing(true)
  }
  const commitRename = (): void => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== '' && trimmed !== session.title) onRename(session.id, trimmed)
  }
  const onTitleKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') commitRename()
    else if (event.key === 'Escape') setEditing(false)
  }

  return (
    <div className="agents-detail">
      <header className="agents-detail-bar">
        <div className="agents-detail-tile" style={agentTileStyle(agents, session.agent)}>
          {session.agent.charAt(0)}
        </div>
        <div className="agents-detail-titles">
          {editing ? (
            <input
              className="agents-detail-rename"
              value={draft}
              autoFocus
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={onTitleKey}
            />
          ) : (
            <span className="agents-detail-title-row">
              <span className="agents-detail-title">{session.title}</span>
              <button
                type="button"
                className="agents-detail-rename-btn"
                title="Rename session"
                onClick={startRename}
              >
                <Icon name="pencil" size={13} />
              </button>
            </span>
          )}
          <span className="agents-detail-cwd">{session.cwd}</span>
        </div>
        <span className={`agents-detail-pill ${running ? 'green' : 'faint'}`}>
          {running ? 'running' : 'stopped'}
        </span>
        <div className="agents-detail-actions">
          <button
            type="button"
            className="agents-detail-btn"
            title="Duplicate session"
            onClick={() => onDuplicate(session.id)}
          >
            <Icon name="copy" size={13} /> Duplicate
          </button>
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
