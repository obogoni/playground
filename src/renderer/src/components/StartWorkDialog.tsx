import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { PinnedTaskView } from '../../../shared/tasks'
import { branchNameFor } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'
import { worktreePathFor } from '../../../shared/worktrees'
import { api } from '../lib/api'
import { defaultBaseFor, repoOptionsOf } from '../lib/repo-options'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'
import './StartWorkDialog.css'

interface StartWorkDialogProps {
  tree: WorkspaceNode[]
  task: PinnedTaskView
  branchTemplate: string
  worktreeTemplate: string
  onClose: () => void
  onCreated: (worktreePath: string) => void
}

/**
 * Start-work dialog (handoff §3): same chassis as NewWorktreeDialog, plus the
 * task header line and a template-prefilled branch (STWK-02). The effective
 * template is the selected repo's workspace `.app/` override, falling back to
 * the global one (PWCF-03); the prefill re-renders on repo switch only while
 * the branch field is untouched — once edited it is never re-applied (PRD
 * story 11).
 */
export function StartWorkDialog({
  tree,
  task,
  branchTemplate,
  worktreeTemplate,
  onClose,
  onCreated
}: StartWorkDialogProps): JSX.Element {
  const repoOptions = repoOptionsOf(tree)
  const [repoPath, setRepoPath] = useState(repoOptions[0]?.path ?? '')
  const [baseBranch, setBaseBranch] = useState(() => defaultBaseFor(tree, repoPath))
  const [branch, setBranch] = useState(() =>
    task.details ? branchNameFor({ id: task.id, details: task.details }, branchTemplate) : ''
  )
  // Workspace worktree-template override (null = use the global one).
  const [worktreeOverride, setWorktreeOverride] = useState<string | null>(null)
  // Fast-forward the base from its remote before cutting the branch (WBR-04, default on).
  const [updateBase, setUpdateBase] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const branchEdited = useRef(false)

  const selectedRepo = repoOptions.find((r) => r.path === repoPath)

  const details = task.details
  const workspacePath = selectedRepo?.workspacePath
  // Read both .app/ overrides on repo switch: the branch override prefills the
  // branch (until edited); the worktree override drives the always-derived path.
  useEffect(() => {
    if (workspacePath === undefined) return
    let stale = false
    api
      .invoke('workspaces:templates', { workspacePath })
      .then(({ branchTemplate: branchOverride, worktreeTemplate: wtOverride }) => {
        if (stale) return
        setWorktreeOverride(wtOverride)
        if (details && !branchEdited.current) {
          setBranch(branchNameFor({ id: task.id, details }, branchOverride ?? branchTemplate))
        }
      })
      .catch(console.error)
    return () => {
      stale = true
    }
  }, [workspacePath, task.id, details, branchTemplate])

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
        worktreeTemplate: effectiveWorktreeTemplate,
        updateBase
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
                  branchEdited.current = true
                  setBranch(event.target.value)
                  setError(null)
                }}
              />
            </div>
          </div>
          {selectedRepo && (
            <div className="dialog-path-preview">
              <div className="dialog-path-label">Worktree will be created at</div>
              <div className="dialog-path-value">
                {worktreePathFor(repoPath, branch, effectiveWorktreeTemplate)}
              </div>
            </div>
          )}
          <label className={`dialog-check${baseBranch.trim() === '' ? ' disabled' : ''}`}>
            <input
              type="checkbox"
              checked={updateBase && baseBranch.trim() !== ''}
              disabled={baseBranch.trim() === ''}
              onChange={(event) => setUpdateBase(event.target.checked)}
            />
            <span className="dialog-check-text">
              Update base branch from remote
              <span className="dialog-check-note">
                {baseBranch.trim() === ''
                  ? 'No base branch — checks out the existing branch as-is.'
                  : `Fast-forward ${baseBranch.trim()} to its remote before creating the branch.`}
              </span>
            </span>
          </label>
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
