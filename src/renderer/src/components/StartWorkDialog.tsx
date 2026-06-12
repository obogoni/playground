import { useState } from 'react'
import type { JSX } from 'react'
import type { PinnedTaskView } from '../../../shared/tasks'
import { branchNameFor } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'
import { sanitizeBranch, worktreePathFor } from '../../../shared/worktrees'
import { api } from '../lib/api'
import { defaultBaseFor, repoOptionsOf } from '../lib/repo-options'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'
import './StartWorkDialog.css'

interface StartWorkDialogProps {
  tree: WorkspaceNode[]
  task: PinnedTaskView
  branchTemplate: string
  onClose: () => void
  onCreated: (worktreePath: string) => void
}

/**
 * Start-work dialog (handoff §3): same chassis as NewWorktreeDialog, plus the
 * task header line and a template-prefilled branch (STWK-02). The template is
 * rendered once at open — editing never re-applies it (PRD story 11).
 */
export function StartWorkDialog({
  tree,
  task,
  branchTemplate,
  onClose,
  onCreated
}: StartWorkDialogProps): JSX.Element {
  const repoOptions = repoOptionsOf(tree)
  const [repoPath, setRepoPath] = useState(repoOptions[0]?.path ?? '')
  const [baseBranch, setBaseBranch] = useState(() => defaultBaseFor(tree, repoPath))
  const [branch, setBranch] = useState(() =>
    task.details ? branchNameFor({ id: task.id, details: task.details }, branchTemplate) : ''
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selectedRepo = repoOptions.find((r) => r.path === repoPath)
  const canCreate = selectedRepo !== undefined && sanitizeBranch(branch) !== '' && !busy

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
          <div className="dialog-kicker">Start work</div>
          <div className="dialog-title-row">
            <span className="dialog-task-id">#{task.id}</span>
            <span className="dialog-task-title">
              {task.details?.title ?? 'details unavailable'}
            </span>
          </div>
        </header>
        <div className="dialog-body">
          <div>
            <div className="dialog-field-label">Repository</div>
            {repoOptions.length === 0 ? (
              <div className="dialog-no-repos">
                No repositories — register a workspace in the sidebar first.
              </div>
            ) : (
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
            )}
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
              <div className="dialog-field-label">
                New branch <span className="dialog-label-note">· from template</span>
              </div>
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
          {selectedRepo && (
            <div className="dialog-path-preview">
              <div className="dialog-path-label">Worktree will be created at</div>
              <div className="dialog-path-value">{worktreePathFor(repoPath, branch)}</div>
            </div>
          )}
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
