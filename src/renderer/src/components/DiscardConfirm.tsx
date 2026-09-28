import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { SessionView } from '../../../shared/config'
import type { ChangedPath } from '../../../shared/files'
import { confirmLabel, discardGroups, sessionWarning } from '../lib/discard-view'
import { Icon } from './Icon'
import { StatusGlyph } from './StatusGlyph'
import './NewWorktreeDialog.css'
import './RemoveWorktreeConfirm.css'
import './DiscardConfirm.css'

/** One file a discard left as it was, with the reason `keptReason` wrote for it. */
export interface KeptRow {
  path: string
  reason: string
}

interface DiscardConfirmProps {
  /** Exactly what the request will send, captured when the dialog opened (FDSC-45). */
  entries: ChangedPath[]
  /** Sessions running in this worktree, by the remove-worktree rule (FDSC-12/13). */
  runningSessions: SessionView[]
  /** The confirmed discard is running (FDSC-16). */
  busy: boolean
  /** Files the finished discard kept; null until then, or when none was (FDSC-20). */
  kept: KeptRow[] | null
  onCancel: () => void
  onConfirm: () => void
  onClose: () => void
}

/** The two groups of the list, in the order their headings read (FDSC-11). */
const GROUPS = [
  { group: 'recycle', heading: 'These go to the Recycle Bin.' },
  { group: 'restore', heading: 'These go back to the last commit. This can’t be undone.' }
] as const

/**
 * The confirmation every discard goes through (FDSC-10..16), and the list of
 * what it kept when a file could not be discarded (FDSC-20/21). Presentational:
 * FilesView holds the entries, runs the request and says what was kept.
 *
 * While the discard runs, leaving is ignored: the request cannot be taken
 * back, and its answer, a kept list included, still has to land here.
 */
export function DiscardConfirm({
  entries,
  runningSessions,
  busy,
  kept,
  onCancel,
  onConfirm,
  onClose
}: DiscardConfirmProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus the panel on mount so Escape works, as the remove-worktree dialog does.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const leave = (): void => {
    if (busy) return
    if (kept) onClose()
    else onCancel()
  }

  const groups = discardGroups(entries)
  const warning = sessionWarning(runningSessions.length)

  return (
    <div className="dialog-backdrop" onClick={leave}>
      <div
        ref={panelRef}
        className="dialog-panel discard-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') leave()
        }}
      >
        <header className="rwc-header">
          <span className="rwc-warning-tile" aria-hidden="true">
            <Icon name="alert" size={20} />
          </span>
          <div className="rwc-title discard-title" id="discard-title">
            {kept ? 'Some changes were kept' : 'Discard changes?'}
          </div>
        </header>

        {kept ? (
          <div className="discard-list">
            {kept.map((row) => (
              <div key={row.path} className="discard-kept-row" data-path={row.path}>
                <span className="discard-path" title={row.path}>
                  {row.path}
                </span>
                <span className="discard-kept-reason">{row.reason}</span>
              </div>
            ))}
          </div>
        ) : (
          <>
            {warning !== null && (
              <div className="rwc-list discard-sessions">
                <div className="discard-sessions-warning">{warning}</div>
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
            <div className="discard-list">
              {GROUPS.filter(({ group }) => groups[group].length > 0).map(({ group, heading }) => (
                <div key={group} className="discard-group" data-group={group}>
                  <div className="discard-heading">{heading}</div>
                  {groups[group].map((entry) => (
                    <div key={entry.path} className="discard-row" data-path={entry.path}>
                      <StatusGlyph status={entry.status} />
                      <span className="discard-path" title={entry.path}>
                        {entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        <footer className="dialog-footer">
          {kept ? (
            <button type="button" className="dialog-btn-primary" onClick={onClose}>
              Close
            </button>
          ) : (
            <>
              <button type="button" className="dialog-btn-ghost" disabled={busy} onClick={onCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="dialog-btn-danger discard-confirm-btn"
                disabled={busy}
                onClick={onConfirm}
              >
                <Icon name="undo" size={15} />
                {busy ? 'Discarding…' : confirmLabel(entries.length)}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
