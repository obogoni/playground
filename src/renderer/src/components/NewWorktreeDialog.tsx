import { useState } from 'react'
import type { JSX } from 'react'
import type { WorkspaceNode } from '../../../shared/tree'
import { sanitizeBranch, worktreePathFor } from '../../../shared/worktrees'
import { api } from '../lib/api'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'

interface RepoOption {
  path: string
  name: string
  workspaceName: string
}

interface NewWorktreeDialogProps {
  tree: WorkspaceNode[]
  initialRepoPath: string
  onClose: () => void
  onCreated: (worktreePath: string) => void
}

function repoOptionsOf(tree: WorkspaceNode[]): RepoOption[] {
  return tree.flatMap((workspace) =>
    workspace.repos.map((repo) => ({
      path: repo.path,
      name: repo.name,
      workspaceName: workspace.displayName
    }))
  )
}

/** Primary-checkout branch, or '' when detached/bare (left to the user). */
function defaultBaseFor(tree: WorkspaceNode[], repoPath: string): string {
  const repo = tree.flatMap((w) => w.repos).find((r) => r.path === repoPath)
  const branch = repo?.worktrees.find((w) => w.isDefault)?.branch ?? ''
  return branch.startsWith('(') ? '' : branch
}

/**
 * Taskless new-worktree dialog (handoff §3 adapted: "NEW WORKTREE" header
 * instead of the task line, no template prefill). Creation failures render
 * inline and keep the dialog open for correction.
 */
export function NewWorktreeDialog({
  tree,
  initialRepoPath,
  onClose,
  onCreated
}: NewWorktreeDialogProps): JSX.Element {
  const [repoPath, setRepoPath] = useState(initialRepoPath)
  const [baseBranch, setBaseBranch] = useState(() => defaultBaseFor(tree, initialRepoPath))
  const [branch, setBranch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const repoOptions = repoOptionsOf(tree)
  const selectedRepo = repoOptions.find((r) => r.path === repoPath)
  const canCreate = sanitizeBranch(branch) !== '' && !busy

  const pickRepo = (path: string): void => {
    setRepoPath(path)
    setBaseBranch(defaultBaseFor(tree, path))
    setError(null)
  }

  const create = (): void => {
    setBusy(true)
    api
      .invoke('worktrees:create', {
        repoPath,
        branch,
        // Empty base falls back to checking out `branch` as an existing branch.
        baseBranch: baseBranch.trim() || undefined
      })
      .then((result) => {
        if (result.ok && result.path) {
          onCreated(result.path)
        } else {
          setError(result.error ?? 'Worktree creation failed')
          setBusy(false)
        }
      })
      .catch((err) => {
        setError(String(err))
        setBusy(false)
      })
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div className="dialog-kicker">New worktree</div>
          <div className="dialog-title-row">
            <span className="dialog-repo-title">{selectedRepo?.name ?? ''}</span>
          </div>
        </header>
        <div className="dialog-body">
          <div>
            <div className="dialog-field-label">Repository</div>
            <div className="dialog-repo-grid">
              {repoOptions.map((repo) => (
                <button
                  key={repo.path}
                  type="button"
                  className={`dialog-repo-chip${repo.path === repoPath ? ' selected' : ''}`}
                  onClick={() => pickRepo(repo.path)}
                >
                  <span className="dialog-repo-chip-name">{repo.name}</span>
                  <span className="dialog-repo-chip-ws">{repo.workspaceName}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="dialog-branch-row">
            <div>
              <div className="dialog-field-label">Base branch</div>
              <input
                className="dialog-input"
                value={baseBranch}
                onChange={(event) => {
                  setBaseBranch(event.target.value)
                  setError(null)
                }}
              />
            </div>
            <div>
              <div className="dialog-field-label">New branch</div>
              <input
                className="dialog-input"
                value={branch}
                autoFocus
                onChange={(event) => {
                  setBranch(event.target.value)
                  setError(null)
                }}
              />
            </div>
          </div>
          <div className="dialog-path-preview">
            <div className="dialog-path-label">Worktree will be created at</div>
            <div className="dialog-path-value">{worktreePathFor(repoPath, branch)}</div>
          </div>
          {error && (
            <div className="dialog-error">
              <Icon name="alert" size={13} /> {error}
            </div>
          )}
        </div>
        <footer className="dialog-footer">
          <button type="button" className="dialog-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn-primary"
            disabled={!canCreate}
            onClick={create}
          >
            <Icon name="plus" size={15} strokeWidth={2.2} />
            Create worktree
          </button>
        </footer>
      </div>
    </div>
  )
}
