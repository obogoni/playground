import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { SessionView } from '../../../shared/config'
import type { ChangedFile, ChangeStatus } from '../../../shared/worktrees'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'
import './StartWorkDialog.css'
import './RemoveWorktreeConfirm.css'

interface RemoveWorktreeConfirmProps {
  branch: string
  /** The worktree's running sessions — terminated before the worktree is removed. */
  runningSessions: SessionView[]
  /** Uncommitted changes to be discarded on a force-remove (FRWT-03); [] when clean. */
  changes: ChangedFile[]
  /** True while the fresh `worktrees:changes` fetch is in flight (FRWT-03). */
  loadingChanges: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Human label for a porcelain-derived change status. */
const STATUS_LABEL: Record<ChangeStatus, string> = {
  modified: 'Modified',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
  untracked: 'Untracked'
}

/**
 * Guards worktree removal when agents are running and/or uncommitted changes
 * would be discarded (AGCF-05 + FRWT-02/03). Purely presentational: lists the
 * sessions that will be terminated and the files that will be discarded;
 * WorktreeDetail orchestrates `sessions:stop` → `worktrees:remove { force }` on
 * confirm. Copy adapts to which guards apply (agents, changes, or both).
 */
export function RemoveWorktreeConfirm({
  branch,
  runningSessions,
  changes,
  loadingChanges,
  busy,
  onCancel,
  onConfirm
}: RemoveWorktreeConfirmProps): JSX.Element {
  const agentCount = runningSessions.length
  const changeCount = changes.length
  const hasAgents = agentCount > 0
  const hasChanges = changeCount > 0
  // Show the changes block while a dirty-opened dialog resolves its fresh fetch,
  // or once it has changes to list.
  const showChanges = loadingChanges || hasChanges
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus the panel on mount so Escape works and assistive tech announces the
  // dialog (the panel carries dialog semantics but holds no autofocus input).
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Adaptive consequence clause(s): "terminate N running agents" / "discard N
  // uncommitted changes", joined when both apply.
  const phrases: string[] = []
  if (hasAgents) phrases.push(`terminate ${agentCount} running agent${agentCount === 1 ? '' : 's'}`)
  if (hasChanges)
    phrases.push(`discard ${changeCount} uncommitted change${changeCount === 1 ? '' : 's'}`)
  else if (loadingChanges && !hasAgents) phrases.push('discard its uncommitted changes')

  // Confirm-button label by which guards apply (stays "Discard…" while a
  // dirty-opened dialog loads, so it doesn't flicker).
  const willDiscard = hasChanges || (loadingChanges && !hasAgents)
  const confirmLabel =
    hasAgents && willDiscard
      ? 'Terminate, discard & remove'
      : hasAgents
        ? 'Terminate & remove'
        : willDiscard
          ? 'Discard & remove'
          : 'Remove worktree'

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        ref={panelRef}
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rwc-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      >
        <header className="rwc-header">
          <span className="rwc-warning-tile" aria-hidden="true">
            <Icon name="alert" size={20} />
          </span>
          <div>
            <div className="rwc-title" id="rwc-title">
              Remove worktree?
            </div>
            <div className="rwc-body">
              Removing <span className="rwc-branch">{branch}</span>
              {phrases.length > 0
                ? ` will ${phrases.join(' and ')}.`
                : ' deletes the worktree.'}{' '}
              This can’t be undone.
            </div>
          </div>
        </header>

        {hasAgents && (
          <div className="rwc-list">
            {runningSessions.map((session) => (
              <div key={session.id} className="rwc-session-row">
                <span className="rwc-session-tile" aria-hidden="true">
                  {session.agent.charAt(0)}
                </span>
                <span className="rwc-session-title">{session.title}</span>
                <span className="rwc-session-status">
                  <span className="rwc-session-dot" /> running
                </span>
              </div>
            ))}
          </div>
        )}

        {showChanges && (
          <div className="rwc-list rwc-changes">
            {loadingChanges ? (
              <div className="rwc-changes-empty">Checking for uncommitted changes…</div>
            ) : hasChanges ? (
              changes.map((file) => (
                <div key={file.path} className="rwc-change-row">
                  <span className={`rwc-change-pill ${file.status}`}>
                    {STATUS_LABEL[file.status]}
                  </span>
                  <span className="rwc-change-path" title={file.path}>
                    {file.path}
                  </span>
                </div>
              ))
            ) : (
              <div className="rwc-changes-empty">No uncommitted changes.</div>
            )}
          </div>
        )}

        <footer className="dialog-footer">
          <button type="button" className="dialog-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="dialog-btn-danger" disabled={busy} onClick={onConfirm}>
            <Icon name="trash" size={15} />
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}
