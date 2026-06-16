import { useEffect, useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import type { PinnedTaskView } from '../../../shared/tasks'
import { taskIdFromBranch } from '../../../shared/tasks'
import type { RepoNode, WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import { stateClass, typeClass } from '../lib/task-pills'
import { Icon } from './Icon'
import './Sidebar.css'

interface SidebarProps {
  tree: WorkspaceNode[]
  tasks: PinnedTaskView[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddWorkspace: () => void
  onRemoveWorkspace: (id: string) => void
  onNewWorktree: (repoPath: string) => void
  /** Opens the New Session dialog pre-filled with a worktree-row cwd. */
  onSpawnAgent: (cwd: string) => void
}

interface RowMenu {
  x: number
  y: number
  cwd: string
}

export function Sidebar({
  tree,
  tasks,
  selectedId,
  onSelect,
  onAddWorkspace,
  onRemoveWorkspace,
  onNewWorktree,
  onSpawnAgent
}: SidebarProps): JSX.Element {
  const [menu, setMenu] = useState<RowMenu | null>(null)

  // Any click or Escape dismisses the row context menu.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const openMenu = (event: MouseEvent, cwd: string): void => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, cwd })
  }

  return (
    <aside className="sidebar">
      <header className="pane-header">
        <span className="pane-header-label">Workspaces</span>
        <button
          type="button"
          className="sidebar-add-btn"
          title="Register workspace folder"
          onClick={onAddWorkspace}
        >
          <Icon name="plus" size={14} />
        </button>
      </header>
      <div className="sidebar-body">
        {tree.length === 0 ? (
          <div className="sidebar-empty">
            <p>No workspaces yet.</p>
            <p>
              Register a folder containing your git repos with the <strong>+</strong> button above.
            </p>
          </div>
        ) : (
          tree.map((workspace) => (
            <Workspace
              key={workspace.id}
              workspace={workspace}
              tasks={tasks}
              selectedId={selectedId}
              onSelect={onSelect}
              onRemove={() => onRemoveWorkspace(workspace.id)}
              onNewWorktree={onNewWorktree}
              onRowContextMenu={openMenu}
            />
          ))
        )}
      </div>
      {menu && (
        <div className="sidebar-ctx-menu" style={{ left: menu.x, top: menu.y }}>
          <button
            type="button"
            className="sidebar-ctx-item"
            onClick={() => {
              onSpawnAgent(menu.cwd)
              setMenu(null)
            }}
          >
            <Icon name="terminal" size={13} /> Spawn agent here
          </button>
        </div>
      )}
    </aside>
  )
}

interface WorkspaceProps {
  workspace: WorkspaceNode
  tasks: PinnedTaskView[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: () => void
  onNewWorktree: (repoPath: string) => void
  onRowContextMenu: (event: MouseEvent, cwd: string) => void
}

function Workspace({
  workspace,
  tasks,
  selectedId,
  onSelect,
  onRemove,
  onNewWorktree,
  onRowContextMenu
}: WorkspaceProps): JSX.Element {
  return (
    <section className="sidebar-workspace">
      <div className="sidebar-workspace-row">
        <Icon name="chevron-down" size={13} />
        <span className="sidebar-workspace-folder">
          <Icon name="folder" size={14} />
        </span>
        <span className="sidebar-workspace-name">{workspace.displayName}</span>
        <button
          type="button"
          className="sidebar-remove-btn"
          title={`Remove ${workspace.displayName} from the app (files stay on disk)`}
          onClick={onRemove}
        >
          <Icon name="trash" size={12} />
        </button>
      </div>
      {workspace.missing ? (
        <div className="sidebar-note error">
          <Icon name="alert" size={12} /> folder not found on disk
        </div>
      ) : workspace.repos.length === 0 ? (
        <div className="sidebar-note">no git repos in this folder</div>
      ) : (
        workspace.repos.map((repo) => (
          <Repo
            key={repo.path}
            repo={repo}
            tasks={tasks}
            selectedId={selectedId}
            onSelect={onSelect}
            onNewWorktree={() => onNewWorktree(repo.path)}
            onRowContextMenu={onRowContextMenu}
          />
        ))
      )}
    </section>
  )
}

interface RepoProps {
  repo: RepoNode
  tasks: PinnedTaskView[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNewWorktree: () => void
  onRowContextMenu: (event: MouseEvent, cwd: string) => void
}

function Repo({
  repo,
  tasks,
  selectedId,
  onSelect,
  onNewWorktree,
  onRowContextMenu
}: RepoProps): JSX.Element {
  return (
    <div className="sidebar-repo">
      <div className="sidebar-repo-row">
        <Icon name="git-branch" size={13} />
        <span className="sidebar-repo-name">{repo.name}</span>
        <span className="sidebar-repo-count">{repo.worktrees.length}</span>
        <button
          type="button"
          className="sidebar-new-worktree-btn"
          title={`New worktree in ${repo.name}`}
          onClick={onNewWorktree}
        >
          <Icon name="plus" size={12} />
        </button>
      </div>
      {repo.error ? (
        <div className="sidebar-note error">
          <Icon name="alert" size={12} /> {repo.error}
        </div>
      ) : (
        <div className="sidebar-worktrees">
          {repo.worktrees.map((worktree) => (
            <WorktreeRow
              key={worktree.id}
              worktree={worktree}
              tasks={tasks}
              selected={worktree.id === selectedId}
              onSelect={() => onSelect(worktree.id)}
              onContextMenu={(e) => onRowContextMenu(e, worktree.path)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface WorktreeRowProps {
  worktree: WorktreeNode
  tasks: PinnedTaskView[]
  selected: boolean
  onSelect: () => void
  onContextMenu: (event: MouseEvent) => void
}

function WorktreeRow({
  worktree,
  tasks,
  selected,
  onSelect,
  onContextMenu
}: WorktreeRowProps): JSX.Element {
  const taskId = taskIdFromBranch(worktree.branch)
  // First pin in config order wins when IDs collide across orgs (spec §Edge Cases).
  const pin = taskId === null ? null : (tasks.find((task) => task.id === taskId) ?? null)

  return (
    <button
      type="button"
      className={`sidebar-worktree${selected ? ' selected' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <span className="sidebar-worktree-line1">
        <Icon name="git-fork" size={12} />
        <span className="sidebar-worktree-branch">{worktree.branch}</span>
        {worktree.dirty && <span className="sidebar-dirty-dot" title="uncommitted changes" />}
      </span>
      <span className="sidebar-worktree-line2">
        {taskId === null ? (
          <span className="sidebar-task-note">
            {worktree.isDefault ? 'primary checkout — no task' : 'no task ID in branch'}
          </span>
        ) : pin === null ? (
          <span className="sidebar-task-note">#{taskId} — not pinned</span>
        ) : pin.details === null ? (
          <>
            <span className="sidebar-task-id">#{taskId}</span>
            <span className="sidebar-task-note">details unavailable</span>
          </>
        ) : (
          <>
            <span className={`task-pill ${typeClass(pin.details.type)}`}>
              <span className="task-pill-dot" />
              {pin.details.type}
            </span>
            <span className="sidebar-task-id">#{taskId}</span>
            <span className="sidebar-task-title">{pin.details.title}</span>
            <span
              className={`sidebar-state-dot ${stateClass(pin.details.state)}`}
              title={pin.details.state}
            />
          </>
        )}
      </span>
    </button>
  )
}
