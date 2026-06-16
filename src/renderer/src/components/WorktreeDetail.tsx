import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { SessionView } from '../../../shared/config'
import type { ShortcutTool } from '../../../shared/shortcuts'
import type { PinnedTaskView } from '../../../shared/tasks'
import type { WorktreeNode } from '../../../shared/tree'
import { api } from '../lib/api'
import { stateClass, typeClass } from '../lib/task-pills'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { RemoveWorktreeConfirm } from './RemoveWorktreeConfirm'
import './WorktreeDetail.css'

interface WorktreeDetailProps {
  workspaceName: string
  repoName: string
  repoPath: string
  worktree: WorktreeNode
  /** Task ID extracted from the branch name; null when the branch carries none. */
  linkedTaskId: number | null
  /** The matching pinned task, when the extracted ID is pinned. */
  linkedPin: PinnedTaskView | null
  /** Sessions already running in this worktree (cwd === worktree.path). */
  sessions: SessionView[]
  /** Opens the New Session dialog pre-filled with this worktree's cwd. */
  onSpawnAgent: () => void
  /** Deep-links to a session (switches to Agents + selects it). */
  onOpenSession: (id: string) => void
  onToast: (message: string) => void
  onRemoved: (repoPath: string) => void
}

/** §1b launcher cards: tile color + label + mono command per tool. */
const LAUNCHERS: {
  tool: ShortcutTool
  label: string
  command: string
  icon: IconName
  tile: string
  /** Marks an elevated launcher (UAC) — renders the shield tile + admin badge. */
  admin?: boolean
}[] = [
  {
    tool: 'explorer',
    label: 'File Explorer',
    command: 'explorer.exe',
    icon: 'folder',
    tile: 'blue'
  },
  {
    tool: 'terminal',
    label: 'Windows Terminal',
    command: 'wt.exe',
    icon: 'terminal',
    tile: 'green'
  },
  { tool: 'vscode', label: 'VS Code', command: 'code', icon: 'code', tile: 'accent' },
  {
    tool: 'vs2022',
    label: 'Visual Studio 2022',
    command: 'devenv.exe',
    icon: 'shield',
    tile: 'amber',
    admin: true
  }
]

export function WorktreeDetail({
  workspaceName,
  repoName,
  repoPath,
  worktree,
  linkedTaskId,
  linkedPin,
  sessions,
  onSpawnAgent,
  onOpenSession,
  onToast,
  onRemoved
}: WorktreeDetailProps): JSX.Element {
  // App keys this component by worktree id, so selection change remounts it:
  // copy feedback resets and the §1b fadeIn entrance replays for free.
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  /** When set, the running-sessions removal confirmation is open (AGCF-05). */
  const [confirmOpen, setConfirmOpen] = useState(false)

  const runningSessions = sessions.filter((s) => s.status === 'running')

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const copyPath = (): void => {
    navigator.clipboard
      .writeText(worktree.path)
      .then(() => setCopied(true))
      .catch(console.error)
  }

  // §1b/§Interactions remove guard: primary checkout outranks dirty in the note.
  const removable = !worktree.dirty && !worktree.isDefault
  const guardNote = worktree.isDefault
    ? 'This is the repo’s primary checkout — it can’t be removed here.'
    : worktree.dirty
      ? `${worktree.changes} uncommitted change${worktree.changes === 1 ? '' : 's'} — commit or stash before removing.`
      : null

  const doRemove = (): void => {
    setRemoving(true)
    setRemoveError(null)
    api
      .invoke('worktrees:remove', { repoPath, worktreePath: worktree.path })
      .then((result) => {
        if (result.ok) {
          onToast(`Removed ${worktree.branch}`)
          onRemoved(repoPath)
        } else {
          setRemoving(false)
          setRemoveError(result.error ?? 'Removal failed')
        }
      })
      .catch((err) => {
        setRemoving(false)
        setRemoveError(err instanceof Error ? err.message : String(err))
      })
  }

  // Running agents must be terminated first (AGCF-05): open the confirm dialog
  // when any session is live, otherwise remove straight away as before.
  const remove = (): void => {
    if (runningSessions.length > 0) setConfirmOpen(true)
    else doRemove()
  }

  // Terminate every running agent before removing (AGCF-05). If any stop fails,
  // abort: surface the error and leave the worktree intact rather than removing
  // it with sessions potentially still alive.
  const confirmRemove = (): void => {
    setRemoving(true)
    setRemoveError(null)
    Promise.all(runningSessions.map((s) => api.invoke('sessions:stop', { id: s.id })))
      .then(() => {
        setConfirmOpen(false)
        doRemove()
      })
      .catch((err) => {
        setRemoving(false)
        setConfirmOpen(false)
        setRemoveError(
          `Couldn’t terminate running agents: ${err instanceof Error ? err.message : String(err)}`
        )
      })
  }

  const launch = (tool: ShortcutTool): void => {
    api
      .invoke('shortcuts:launch', { tool, path: worktree.path })
      .then((result) => {
        if (!result.ok) onToast(result.error ?? 'Launch failed')
      })
      .catch((err) => onToast(err instanceof Error ? err.message : String(err)))
  }

  return (
    <div className="detail">
      <div className="detail-inner">
        <nav className="detail-breadcrumb">
          {workspaceName} / <span className="detail-breadcrumb-repo">{repoName}</span>
        </nav>
        <h1 className="detail-title">{worktree.branch}</h1>
        <div className="detail-status-row">
          {worktree.dirty ? (
            <span className="detail-pill amber">
              <span className="detail-pill-dot" />
              {worktree.changes} uncommitted change{worktree.changes === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="detail-pill green">
              <span className="detail-pill-dot" />
              Working tree clean
            </span>
          )}
          {worktree.isDefault && <span className="detail-pill neutral">primary</span>}
        </div>

        <section className="detail-section">
          <h2 className="detail-section-label">Linked task</h2>
          {linkedTaskId === null ? (
            <div className="detail-task-note">
              No task ID found in this branch name — this worktree is untagged.
            </div>
          ) : linkedPin === null ? (
            <div className="detail-task-note">#{linkedTaskId} — not pinned</div>
          ) : (
            <a className="detail-task-card" href={linkedPin.url} target="_blank" rel="noreferrer">
              <div className="detail-task-header">
                {linkedPin.details && (
                  <>
                    <span className={`task-pill ${typeClass(linkedPin.details.type)}`}>
                      <span className="task-pill-dot" />
                      {linkedPin.details.type}
                    </span>
                    <span className={`task-pill ${stateClass(linkedPin.details.state)}`}>
                      {linkedPin.details.state}
                    </span>
                  </>
                )}
                <span className="detail-task-spacer" />
                <span className="detail-task-open">
                  Open in Azure DevOps
                  <Icon name="external-link" size={13} strokeWidth={1.9} />
                </span>
              </div>
              <div className="detail-task-body">
                <span className="detail-task-id">#{linkedTaskId}</span>
                {linkedPin.details ? (
                  <span className="detail-task-title">{linkedPin.details.title}</span>
                ) : (
                  <span className="detail-task-unavailable">details unavailable</span>
                )}
              </div>
            </a>
          )}
        </section>

        <section className="detail-section">
          <h2 className="detail-section-label">Location</h2>
          <div className="detail-location">
            <span className="detail-location-path">{worktree.path}</span>
            <button type="button" className="detail-copy-btn" title="Copy path" onClick={copyPath}>
              <Icon name={copied ? 'check' : 'copy'} size={14} />
            </button>
          </div>
        </section>

        <section className="detail-section">
          <h2 className="detail-section-label">Open with</h2>
          <div className="detail-openwith">
            {LAUNCHERS.map((launcher) => (
              <button
                key={launcher.tool}
                type="button"
                className="detail-launcher"
                onClick={() => launch(launcher.tool)}
              >
                <span className={`detail-launcher-tile ${launcher.tile}`}>
                  <Icon name={launcher.icon} size={17} />
                </span>
                <span className="detail-launcher-labelrow">
                  <span className="detail-launcher-label">{launcher.label}</span>
                  {launcher.admin && <span className="detail-launcher-admin">admin</span>}
                </span>
                <span className="detail-launcher-command">{launcher.command}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="detail-section">
          <h2 className="detail-section-label">Agents</h2>
          <div className="detail-agents">
            <button type="button" className="detail-spawn-agent" onClick={onSpawnAgent}>
              <Icon name="terminal" size={15} />
              Spawn agent
            </button>
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className="detail-session-chip"
                onClick={() => onOpenSession(session.id)}
              >
                <span
                  className={`detail-session-dot ${session.status === 'running' ? 'green' : 'faint'}`}
                />
                {session.title}
              </button>
            ))}
          </div>
        </section>

        <div className="detail-danger">
          <button
            type="button"
            className={`detail-remove-btn ${removable ? 'armed' : ''}`}
            disabled={!removable || removing}
            onClick={remove}
          >
            <Icon name="trash" size={15} />
            Remove worktree
          </button>
          {guardNote && <span className="detail-danger-note">{guardNote}</span>}
          {removeError && <span className="detail-danger-note error">{removeError}</span>}
        </div>
      </div>
      {confirmOpen && (
        <RemoveWorktreeConfirm
          branch={worktree.branch}
          runningSessions={runningSessions}
          busy={removing}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  )
}

export function WorktreeDetailEmpty(): JSX.Element {
  return (
    <div className="detail">
      <div className="detail-empty">Select a worktree in the sidebar to inspect it.</div>
    </div>
  )
}
