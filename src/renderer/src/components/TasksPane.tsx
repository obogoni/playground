import { useState } from 'react'
import type { JSX } from 'react'
import type { PinnedTaskView, TasksSnapshot } from '../../../shared/tasks'
import { api } from '../lib/api'
import { Icon } from './Icon'
import './TasksPane.css'

interface TasksPaneProps {
  snapshot: TasksSnapshot
  onSnapshot: (snapshot: TasksSnapshot) => void
}

/** Handoff §Semantic color usage — type pills. */
function typeClass(type: string): string {
  switch (type.toLowerCase()) {
    case 'bug':
      return 'red'
    case 'feature':
      return 'accent'
    case 'chore':
      return 'amber'
    default:
      return 'muted'
  }
}

/** Handoff §Semantic color usage — state pills/dots. */
function stateClass(state: string): string {
  switch (state.toLowerCase()) {
    case 'active':
      return 'green'
    case 'new':
      return 'blue'
    case 'in progress':
      return 'amber'
    case 'resolved':
      return 'accent'
    case 'closed':
      return 'faint'
    default:
      return 'muted'
  }
}

export function TasksPane({ snapshot, onSnapshot }: TasksPaneProps): JSX.Element {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pinning, setPinning] = useState(false)

  const pin = (): void => {
    const value = input.trim()
    if (value === '' || pinning) return
    setPinning(true)
    setError(null)
    api
      .invoke('tasks:pin', { input: value })
      .then((result) => {
        if (result.ok && result.snapshot) {
          onSnapshot(result.snapshot)
          setInput('')
        } else {
          setError(result.error ?? 'Pin failed.')
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPinning(false))
  }

  const unpin = (task: PinnedTaskView): void => {
    api
      .invoke('tasks:unpin', { id: task.id, org: task.org, project: task.project })
      .then(onSnapshot)
      .catch(console.error)
  }

  return (
    <aside className="tasks-pane">
      <div className="pane-header">
        <span className="pane-header-label">Pinned tasks</span>
        <span className="tasks-count">
          {snapshot.tasks.length} item{snapshot.tasks.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="tasks-add-row">
        <input
          className="tasks-add-input"
          value={input}
          placeholder="Paste ID or ADO URL…"
          spellCheck={false}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pin()
          }}
        />
        <button type="button" className="tasks-pin-btn" disabled={pinning} onClick={pin}>
          <Icon name="plus" size={13} strokeWidth={2.2} />
          Pin
        </button>
      </div>
      {error && <div className="tasks-add-error">{error}</div>}
      <div className="tasks-body">
        {snapshot.auth === 'failed' && (
          <div className="tasks-auth-prompt">
            <div className="tasks-auth-title">Azure DevOps sign-in needed</div>
            Run <code>az login</code> in a terminal, then refresh.
          </div>
        )}
        {snapshot.tasks.length === 0 && snapshot.auth !== 'failed' && (
          <div className="tasks-empty">No pinned tasks — paste a work item ID or URL above.</div>
        )}
        {snapshot.tasks.map((task) => (
          <TaskCard
            key={`${task.org}/${task.project}/${task.id}`}
            task={task}
            onUnpin={() => unpin(task)}
          />
        ))}
      </div>
    </aside>
  )
}

function TaskCard({ task, onUnpin }: { task: PinnedTaskView; onUnpin: () => void }): JSX.Element {
  return (
    <article className="task-card">
      <div className="task-card-header">
        {task.details && (
          <>
            <span className={`task-pill ${typeClass(task.details.type)}`}>
              <span className="task-pill-dot" />
              {task.details.type}
            </span>
            <span className={`task-pill ${stateClass(task.details.state)}`}>
              {task.details.state}
            </span>
          </>
        )}
        <span className="task-card-spacer" />
        <span className="task-card-id">#{task.id}</span>
        <button type="button" className="task-unpin-btn" title="Unpin" onClick={onUnpin}>
          <Icon name="x" size={12} strokeWidth={2.2} />
        </button>
      </div>
      {task.details ? (
        <div className="task-card-title">{task.details.title}</div>
      ) : (
        <div className="task-card-unavailable">details unavailable</div>
      )}
    </article>
  )
}
