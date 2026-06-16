import type { JSX } from 'react'
import type { SessionView } from '../../../shared/config'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'
import './StartWorkDialog.css'
import './RemoveWorktreeConfirm.css'

interface RemoveWorktreeConfirmProps {
  branch: string
  /** The worktree's running sessions — terminated before the worktree is removed. */
  runningSessions: SessionView[]
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Guards worktree removal when agents are still running in it (AGCF-05, handoff
 * §Dialog: Remove-worktree confirmation). Purely presentational: lists the
 * sessions that will be terminated; WorktreeDetail orchestrates the actual
 * `sessions:stop` → `worktrees:remove` on confirm.
 */
export function RemoveWorktreeConfirm({
  branch,
  runningSessions,
  busy,
  onCancel,
  onConfirm
}: RemoveWorktreeConfirmProps): JSX.Element {
  const count = runningSessions.length

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog-panel"
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
            <div className="rwc-title">Remove worktree?</div>
            <div className="rwc-body">
              {count} agent{count === 1 ? ' is' : 's are'} running in{' '}
              <span className="rwc-branch">{branch}</span>. Removing the worktree will terminate
              them.
            </div>
          </div>
        </header>
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
        <div className="rwc-note">A worktree with uncommitted changes still can’t be removed.</div>
        <footer className="dialog-footer">
          <button type="button" className="dialog-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="dialog-btn-danger" disabled={busy} onClick={onConfirm}>
            <Icon name="trash" size={15} />
            Terminate &amp; remove
          </button>
        </footer>
      </div>
    </div>
  )
}
