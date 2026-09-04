import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { ParentWorkItem, PinnedTaskView } from '../../../shared/tasks'
import { branchNameFor } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'
import type { PostCreateHookResult } from '../../../shared/worktrees'
import { worktreePathFor } from '../../../shared/worktrees'
import { api } from '../lib/api'
import { defaultBaseFor, repoOptionsOf } from '../lib/repo-options'
import { BranchExistsChoice } from './BranchExistsChoice'
import { HookFailureNotice } from './HookFailureNotice'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'
import './StartWorkDialog.css'

interface StartWorkDialogProps {
  tree: WorkspaceNode[]
  task: PinnedTaskView
  branchTemplate: string
  worktreeTemplate: string
  /** `{dev}` placeholder value for the branch template; blank renders an empty segment (TEMPLATE-01). */
  devAlias?: string
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
  devAlias = '',
  onClose,
  onCreated
}: StartWorkDialogProps): JSX.Element {
  const repoOptions = repoOptionsOf(tree)
  const [repoPath, setRepoPath] = useState(repoOptions[0]?.path ?? '')
  const [baseBranch, setBaseBranch] = useState(() => defaultBaseFor(tree, repoPath))
  const [branch, setBranch] = useState(() =>
    task.details
      ? branchNameFor({ id: task.id, details: task.details }, branchTemplate, { devAlias })
      : ''
  )
  // The pinned task's first Hierarchy-Reverse parent (its US), resolved on open
  // (DIALOG-01). Absent/failed resolution stays null — empty {usId}/{usSlug}.
  const [parent, setParent] = useState<ParentWorkItem | null>(null)
  // Workspace worktree-template override (null = use the global one).
  const [worktreeOverride, setWorktreeOverride] = useState<string | null>(null)
  // Fast-forward the base from its remote before cutting the branch (WBR-04, default on).
  const [updateBase, setUpdateBase] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Set when create reports the branch already exists — swaps the footer for the
  // reuse/recreate choice (EXB-06).
  const [conflict, setConflict] = useState<'branch-exists' | null>(null)
  // Set when the worktree was created but the repo's init command failed — swaps
  // the footer for the advisory (WPC-13). Holds the created path so Continue can
  // proceed with the normal flow (WPC-14).
  const [hookFailure, setHookFailure] = useState<{
    path: string
    hook: PostCreateHookResult
  } | null>(null)
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
          setBranch(
            branchNameFor({ id: task.id, details }, branchOverride ?? branchTemplate, {
              devAlias,
              parent
            })
          )
        }
      })
      .catch(console.error)
    return () => {
      stale = true
    }
    // parent/devAlias included: the re-prefill re-runs when the parent US lands
    // or the alias changes, still guarded by branchEdited (DIALOG-02).
  }, [workspacePath, task.id, details, branchTemplate, parent, devAlias])

  // Resolve the parent US once per task; skipped while the pin has no live
  // details (auth down — the dialog is already disabled). Auth failure / no
  // parent degrade to null — empty {usId}/{usSlug}, never blocking (PARENT-04).
  useEffect(() => {
    if (!details) return
    let stale = false
    api
      .invoke('tasks:parent', { id: task.id, org: task.org, project: task.project })
      .then((result) => {
        if (!stale) setParent(result.ok ? result.parent : null)
      })
      .catch(() => {
        if (!stale) setParent(null)
      })
    return () => {
      stale = true
    }
  }, [task.id, task.org, task.project, details])

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

  // Single create path: the first click sends no mode and may come back with a
  // branch-exists conflict; the reuse/recreate buttons re-invoke with a mode,
  // which never re-prompts (EXB-06).
  const submit = (onExisting?: 'reuse' | 'recreate'): void => {
    setError(null)
    setConflict(null)
    setBusy(true)
    api
      .invoke('worktrees:create', {
        repoPath,
        branch,
        // Empty base falls back to checking out `branch` as an existing branch.
        baseBranch: baseBranch.trim() || undefined,
        worktreeTemplate: effectiveWorktreeTemplate,
        updateBase,
        onExisting
      })
      .then((result) => {
        if (result.ok && result.path) {
          // The worktree exists either way; a failed init command only earns an
          // advisory before the normal flow continues (WPC-13/15).
          if (result.hook && !result.hook.ok) {
            setHookFailure({ path: result.path, hook: result.hook })
            setBusy(false)
            return
          }
          onCreated(result.path)
          return
        }
        if (!onExisting && result.conflict === 'branch-exists') {
          setConflict('branch-exists')
          setBusy(false)
          return
        }
        setError(result.error ?? 'Worktree creation failed')
        setBusy(false)
      })
      .catch((err) => {
        setError(String(err))
        setBusy(false)
      })
  }

  return (
    // While the hook advisory is up the worktree already exists, so dismissing by
    // backdrop must continue the post-create flow, not silently drop it (WPC-14).
    <div
      className="dialog-backdrop"
      onClick={hookFailure ? () => onCreated(hookFailure.path) : onClose}
    >
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
        {hookFailure ? (
          <HookFailureNotice
            worktreePath={hookFailure.path}
            hook={hookFailure.hook}
            onProceed={() => onCreated(hookFailure.path)}
          />
        ) : conflict ? (
          <BranchExistsChoice
            branch={branch}
            busy={busy}
            onReuse={() => submit('reuse')}
            onRecreate={() => submit('recreate')}
            onCancel={() => setConflict(null)}
          />
        ) : (
          <footer className="dialog-footer">
            <button type="button" className="dialog-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="dialog-btn-primary"
              disabled={!canCreate}
              onClick={() => submit()}
            >
              <Icon name="plus" size={15} strokeWidth={2.2} />
              Create worktree
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}
