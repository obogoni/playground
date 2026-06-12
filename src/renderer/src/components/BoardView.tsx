import { useState } from 'react'
import type { JSX } from 'react'
import type { ShortcutTool } from '../../../shared/shortcuts'
import type { PinnedTaskView, TasksSnapshot } from '../../../shared/tasks'
import { taskIdFromBranch } from '../../../shared/tasks'
import type { RepoNode, WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import { api } from '../lib/api'
import { stateClass, typeClass } from '../lib/task-pills'
import { Icon } from './Icon'
import './BoardView.css'

interface BoardViewProps {
  tree: WorkspaceNode[]
  snapshot: TasksSnapshot
  /** Worktree count per extracted task ID, from the current tree snapshot. */
  worktreeCounts: Map<number, number>
  onSnapshot: (snapshot: TasksSnapshot) => void
  onToast: (message: string) => void
}

export function BoardView({
  tree,
  snapshot,
  worktreeCounts,
  onSnapshot,
  onToast
}: BoardViewProps): JSX.Element {
  const [highlightId, setHighlightId] = useState<number | null>(null)
  // Unpinning the active task clears the highlight — a banner for a gone chip lies,
  // and the stored id must go with it so re-pinning the same task later doesn't
  // resurrect an old highlight. Render-phase adjustment per react.dev's
  // "adjusting state when a prop changes" pattern.
  const activeId = snapshot.tasks.some((task) => task.id === highlightId) ? highlightId : null
  if (highlightId !== null && activeId === null) {
    setHighlightId(null)
  }

  const toggleHighlight = (id: number): void => {
    setHighlightId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="board">
      <div className="board-strip">
        <span className="board-strip-label">Pinned</span>
        {snapshot.tasks.map((task) => (
          <TaskChip
            key={`${task.org}/${task.project}/${task.id}`}
            task={task}
            worktreeCount={worktreeCounts.get(task.id) ?? 0}
            active={task.id === activeId}
            onClick={() => toggleHighlight(task.id)}
          />
        ))}
        <PinForm onSnapshot={onSnapshot} />
      </div>
      <div className="board-canvas">
        {activeId !== null && (
          <div className="board-banner">
            Showing worktrees for <span className="board-banner-id">#{activeId}</span>
            <button
              type="button"
              className="board-banner-clear"
              title="Clear highlight"
              onClick={() => setHighlightId(null)}
            >
              <Icon name="x" size={12} strokeWidth={2.2} />
            </button>
          </div>
        )}
        {tree.length === 0 ? (
          <div className="board-empty">
            No workspaces yet — register one from the Tree direction&apos;s <strong>+</strong>{' '}
            button.
          </div>
        ) : (
          tree.map((workspace) => (
            <BoardWorkspace
              key={workspace.id}
              workspace={workspace}
              tasks={snapshot.tasks}
              activeId={activeId}
              onToast={onToast}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface TaskChipProps {
  task: PinnedTaskView
  worktreeCount: number
  active: boolean
  onClick: () => void
}

function TaskChip({ task, worktreeCount, active, onClick }: TaskChipProps): JSX.Element {
  return (
    <button
      type="button"
      className={`board-chip${active ? ' active' : ''}`}
      title={task.details?.state}
      onClick={onClick}
    >
      <span
        className={`board-chip-dot ${task.details ? stateClass(task.details.state) : 'faint'}`}
      />
      <span className="board-chip-id">#{task.id}</span>
      {task.details ? (
        <span className="board-chip-title">{task.details.title}</span>
      ) : (
        <span className="board-chip-title unavailable">details unavailable</span>
      )}
      <span className="board-chip-count">{worktreeCount}</span>
    </button>
  )
}

/** §2 dashed "Pin task" button — a prototype stub, made real as an inline input (spec §Decisions). */
function PinForm({ onSnapshot }: { onSnapshot: (snapshot: TasksSnapshot) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pinning, setPinning] = useState(false)

  const close = (): void => {
    setOpen(false)
    setInput('')
    setError(null)
  }

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
          close()
        } else {
          setError(result.error ?? 'Pin failed.')
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPinning(false))
  }

  if (!open) {
    return (
      <button type="button" className="board-pin-btn" onClick={() => setOpen(true)}>
        <Icon name="plus" size={13} strokeWidth={2.2} />
        Pin task
      </button>
    )
  }

  return (
    <span className="board-pin-form">
      <input
        className="board-pin-input"
        autoFocus
        value={input}
        placeholder="Paste ID or ADO URL…"
        spellCheck={false}
        disabled={pinning}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') pin()
          if (e.key === 'Escape') close()
        }}
        onBlur={() => {
          if (input.trim() === '') close()
        }}
      />
      {error && <span className="board-pin-error">{error}</span>}
    </span>
  )
}

interface BoardWorkspaceProps {
  workspace: WorkspaceNode
  tasks: PinnedTaskView[]
  activeId: number | null
  onToast: (message: string) => void
}

function BoardWorkspace({ workspace, tasks, activeId, onToast }: BoardWorkspaceProps): JSX.Element {
  return (
    <section className="board-workspace">
      <div className="board-workspace-header">
        <span className="board-workspace-folder">
          <Icon name="folder" size={16} />
        </span>
        <span className="board-workspace-name">{workspace.displayName}</span>
        <span className="board-workspace-path">{workspace.path}</span>
      </div>
      {workspace.missing ? (
        <div className="board-note error">
          <Icon name="alert" size={12} /> folder not found on disk
        </div>
      ) : workspace.repos.length === 0 ? (
        <div className="board-note">no git repos in this folder</div>
      ) : (
        workspace.repos.map((repo) => (
          <BoardRepo
            key={repo.path}
            repo={repo}
            tasks={tasks}
            activeId={activeId}
            onToast={onToast}
          />
        ))
      )}
    </section>
  )
}

interface BoardRepoProps {
  repo: RepoNode
  tasks: PinnedTaskView[]
  activeId: number | null
  onToast: (message: string) => void
}

function BoardRepo({ repo, tasks, activeId, onToast }: BoardRepoProps): JSX.Element {
  return (
    <div className="board-repo">
      <div className="board-repo-header">
        <Icon name="git-branch" size={13} />
        <span className="board-repo-name">{repo.name}</span>
      </div>
      {repo.error ? (
        <div className="board-note error">
          <Icon name="alert" size={12} /> {repo.error}
        </div>
      ) : (
        <div className="board-grid">
          {repo.worktrees.map((worktree) => (
            <BoardCard
              key={worktree.id}
              worktree={worktree}
              repoName={repo.name}
              tasks={tasks}
              activeId={activeId}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface BoardCardProps {
  worktree: WorktreeNode
  repoName: string
  tasks: PinnedTaskView[]
  activeId: number | null
  onToast: (message: string) => void
}

function BoardCard({ worktree, repoName, tasks, activeId, onToast }: BoardCardProps): JSX.Element {
  const taskId = taskIdFromBranch(worktree.branch)
  // First pin in config order wins when IDs collide across orgs (spec §Edge Cases).
  const pin = taskId === null ? null : (tasks.find((task) => task.id === taskId) ?? null)
  const highlighted = activeId !== null && taskId === activeId
  const dimmed = activeId !== null && !highlighted

  const launch = (tool: ShortcutTool): void => {
    api
      .invoke('shortcuts:launch', { tool, path: worktree.path })
      .then((result) => {
        if (!result.ok) onToast(result.error ?? 'Launch failed')
      })
      .catch((err) => onToast(err instanceof Error ? err.message : String(err)))
  }

  return (
    <article className={`board-card${highlighted ? ' highlighted' : ''}${dimmed ? ' dimmed' : ''}`}>
      <div className="board-card-header">
        <Icon name="git-fork" size={13} strokeWidth={2} />
        <span className="board-card-branch">{worktree.branch}</span>
        {worktree.dirty && <span className="board-dirty-dot" title="uncommitted changes" />}
      </div>
      {taskId === null ? (
        <div className="board-card-task untagged">
          {worktree.isDefault ? 'primary checkout — no task' : 'no task ID in branch'}
        </div>
      ) : pin === null ? (
        <div className="board-card-task untagged">#{taskId} — not pinned</div>
      ) : pin.details === null ? (
        <div className="board-card-task">
          <div className="board-card-task-row">
            <span className="board-card-task-id">#{taskId}</span>
            <span className="board-card-task-note">details unavailable</span>
          </div>
        </div>
      ) : (
        <div className="board-card-task">
          <div className="board-card-task-row">
            <span className={`task-pill ${typeClass(pin.details.type)}`}>
              <span className="task-pill-dot" />
              {pin.details.type}
            </span>
            <span className="board-card-task-id">#{taskId}</span>
            <span className="board-card-task-spacer" />
            <span className={`board-card-state ${stateClass(pin.details.state)}`}>
              <span className="board-card-state-dot" />
              {pin.details.state}
            </span>
          </div>
          <div className="board-card-task-title">{pin.details.title}</div>
        </div>
      )}
      <div className="board-card-footer">
        <button
          type="button"
          className="board-launch-btn blue"
          title="File Explorer"
          onClick={() => launch('explorer')}
        >
          <Icon name="folder" size={15} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          className="board-launch-btn green"
          title="Windows Terminal"
          onClick={() => launch('terminal')}
        >
          <Icon name="terminal" size={15} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="board-launch-btn accent"
          title="VS Code"
          onClick={() => launch('vscode')}
        >
          <Icon name="code" size={15} strokeWidth={1.9} />
        </button>
        <span className="board-card-footer-spacer" />
        <span className="board-card-repo">{repoName}</span>
      </div>
    </article>
  )
}
