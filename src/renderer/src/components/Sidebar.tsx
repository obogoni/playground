import type { JSX } from 'react'
import type { RepoNode, WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import { Icon } from './Icon'
import './Sidebar.css'

interface SidebarProps {
  tree: WorkspaceNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddWorkspace: () => void
  onRemoveWorkspace: (id: string) => void
  onNewWorktree: (repoPath: string) => void
}

export function Sidebar({
  tree,
  selectedId,
  onSelect,
  onAddWorkspace,
  onRemoveWorkspace,
  onNewWorktree
}: SidebarProps): JSX.Element {
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
              selectedId={selectedId}
              onSelect={onSelect}
              onRemove={() => onRemoveWorkspace(workspace.id)}
              onNewWorktree={onNewWorktree}
            />
          ))
        )}
      </div>
    </aside>
  )
}

interface WorkspaceProps {
  workspace: WorkspaceNode
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: () => void
  onNewWorktree: (repoPath: string) => void
}

function Workspace({
  workspace,
  selectedId,
  onSelect,
  onRemove,
  onNewWorktree
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
            selectedId={selectedId}
            onSelect={onSelect}
            onNewWorktree={() => onNewWorktree(repo.path)}
          />
        ))
      )}
    </section>
  )
}

interface RepoProps {
  repo: RepoNode
  selectedId: string | null
  onSelect: (id: string) => void
  onNewWorktree: () => void
}

function Repo({ repo, selectedId, onSelect, onNewWorktree }: RepoProps): JSX.Element {
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
              selected={worktree.id === selectedId}
              onSelect={() => onSelect(worktree.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface WorktreeRowProps {
  worktree: WorktreeNode
  selected: boolean
  onSelect: () => void
}

function WorktreeRow({ worktree, selected, onSelect }: WorktreeRowProps): JSX.Element {
  return (
    <button
      type="button"
      className={`sidebar-worktree${selected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <span className="sidebar-worktree-line1">
        <Icon name="git-fork" size={12} />
        <span className="sidebar-worktree-branch">{worktree.branch}</span>
        {worktree.dirty && <span className="sidebar-dirty-dot" title="uncommitted changes" />}
      </span>
      {/* Task tags land in M3; until then every row carries the §1a untagged text. */}
      <span className="sidebar-worktree-line2">
        {worktree.isDefault ? 'primary checkout — no task' : 'no task ID in branch'}
      </span>
    </button>
  )
}
