import { useState } from 'react'
import type { JSX } from 'react'
import type { PinnedTaskView, TasksSnapshot } from '../../../shared/tasks'
import { api } from '../lib/api'
import { stateClass, typeClass } from '../lib/task-pills'
import { Icon } from './Icon'
import './TasksPane.css'

interface TasksPaneProps {
  snapshot: TasksSnapshot
  /** Worktree count per extracted task ID, from the current tree snapshot. */
  worktreeCounts: Map<number, number>
  onSnapshot: (snapshot: TasksSnapshot) => void
  onStartWork: (task: PinnedTaskView) => void
  /** Opens the New Session dialog for a task (0/1/many worktree resolution). */
  onSpawnAgent: (task: PinnedTaskView) => void
}

export function TasksPane({
  snapshot,
  worktreeCounts,
  onSnapshot,
  onStartWork,
  onSpawnAgent
}: TasksPaneProps): JSX.Element {
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
            worktreeCount={worktreeCounts.get(task.id) ?? 0}
            onUnpin={() => unpin(task)}
            onStartWork={() => onStartWork(task)}
            onSpawnAgent={() => onSpawnAgent(task)}
          />
        ))}
      </div>
    </aside>
  )
}

interface TaskCardProps {
  task: PinnedTaskView
  worktreeCount: number
  onUnpin: () => void
  onStartWork: () => void
  onSpawnAgent: () => void
}

function TaskCard({
  task,
  worktreeCount,
  onUnpin,
  onStartWork,
  onSpawnAgent
}: TaskCardProps): JSX.Element {
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
      <div className="task-card-footer">
        {worktreeCount > 0 ? (
          <span className="task-card-wt">
            <span className="task-card-wt-dot" />
            {worktreeCount} worktree{worktreeCount === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="task-card-wt none">No worktree yet</span>
        )}
        <button
          type="button"
          className={`task-start-btn ${worktreeCount > 0 ? 'ghost' : 'primary'}`}
          disabled={!task.details}
          title={
            task.details
              ? undefined
              : 'Details unavailable — the branch template needs the task type and title'
          }
          onClick={onStartWork}
        >
          <Icon name="git-fork" size={13} strokeWidth={2} />
          {worktreeCount > 0 ? 'New branch' : 'Start work'}
        </button>
        <button
          type="button"
          className="task-agent-btn"
          disabled={worktreeCount === 0}
          title={
            worktreeCount === 0
              ? 'Start work first — no worktree for this task yet'
              : 'Spawn an agent in this task’s worktree'
          }
          onClick={onSpawnAgent}
        >
          <Icon name="terminal" size={13} strokeWidth={2} />
          Agent
        </button>
      </div>
    </article>
  )
}
