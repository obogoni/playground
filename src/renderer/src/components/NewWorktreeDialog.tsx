import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { WorkspaceNode } from '../../../shared/tree'
import { worktreePathFor } from '../../../shared/worktrees'
import { api } from '../lib/api'
import { defaultBaseFor, repoOptionsOf } from '../lib/repo-options'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'

interface NewWorktreeDialogProps {
  tree: WorkspaceNode[]
  initialRepoPath: string
  worktreeTemplate: string
  onClose: () => void
  onCreated: (worktreePath: string) => void
}

/**
 * Taskless new-worktree dialog (handoff §3 adapted: "NEW WORKTREE" header
 * instead of the task line, no template prefill). Creation failures render
 * inline and keep the dialog open for correction.
 */
export function NewWorktreeDialog({
  tree,
  initialRepoPath,
  worktreeTemplate,
  onClose,
  onCreated
}: NewWorktreeDialogProps): JSX.Element {
  const [repoPath, setRepoPath] = useState(initialRepoPath)
  const [baseBranch, setBaseBranch] = useState(() => defaultBaseFor(tree, initialRepoPath))
  const [branch, setBranch] = useState('')
  // Workspace worktree-template override (null = use the global one).
  const [worktreeOverride, setWorktreeOverride] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const repoOptions = repoOptionsOf(tree)
  const selectedRepo = repoOptions.find((r) => r.path === repoPath)

  // Read the selected workspace's worktree-template override on repo switch.
  const workspacePath = selectedRepo?.workspacePath
  useEffect(() => {
    if (workspacePath === undefined) return
    let stale = false
    api
      .invoke('workspaces:templates', { workspacePath })
      .then(({ worktreeTemplate: wtOverride }) => {
        if (!stale) setWorktreeOverride(wtOverride)
      })
      .catch(console.error)
    return () => {
      stale = true
    }
  }, [workspacePath])

  const effectiveWorktreeTemplate = worktreeOverride ?? worktreeTemplate
  // Gate only on a selected repo and a non-empty branch; if the template renders
  // an empty folder name, let main's empty-render guard return a readable error
  // instead of silently disabling the button.
  const canCreate = selectedRepo !== undefined && branch.trim() !== '' && !busy

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
        baseBranch: baseBranch.trim() || undefined,
        worktreeTemplate: effectiveWorktreeTemplate
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
            <div className="dialog-path-value">
              {worktreePathFor(repoPath, branch, effectiveWorktreeTemplate)}
            </div>
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
