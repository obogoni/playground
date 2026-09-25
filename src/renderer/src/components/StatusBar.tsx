import { useCallback, useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import type { AppConfig, SessionView } from '../../../shared/config'
import type { SyncState } from '../../../shared/git'
import type { WorkspaceNode } from '../../../shared/tree'
import { barTargetFor, splitBranch, syncSectionFor } from '../lib/status-bar'
import { useGitSync } from '../lib/use-git-sync'
import { Icon } from './Icon'
import { SyncPopover } from './SyncPopover'
import './StatusBar.css'

interface StatusBarProps {
  tree: WorkspaceNode[]
  selectedId: string | null
  sessions: SessionView[]
  selectedSessionId: string | null
  direction: AppConfig['ui']['direction']
  /** Report an operation outcome whose popover is gone (STBR-26). */
  onToast: (message: string) => void
  /**
   * Open the changed files of this worktree in the Files direction, in
   * uncommitted-changes mode (FXPL-31, superseding STBR-30/32).
   */
  onOpenChanges: (worktreeId: string) => void
  /** Refresh the tree after a successful operation (STBR-25). */
  onRefreshTree: () => void
}

/**
 * The window-wide status bar (STBR-01): always mounted, describing the tree
 * selection — or, in Agents, the selected session's worktree (STBR-02..05).
 * Repo, branch and the changed-file counter come from the tree snapshot; only
 * the sync section asks main, through `useGitSync`.
 */
export function StatusBar({
  tree,
  selectedId,
  sessions,
  selectedSessionId,
  direction,
  onToast,
  onOpenChanges,
  onRefreshTree
}: StatusBarProps): JSX.Element {
  const target = barTargetFor({ direction, tree, selectedId, sessions, selectedSessionId })
  const targetPath = target.kind === 'worktree' ? target.selected.worktree.path : null
  /** The sync popover is the only one left: the counter now navigates. */
  const [open, setOpen] = useState<'sync' | null>(null)
  const popoverPath = open === 'sync' ? targetPath : null
  const sync = useGitSync({ targetPath, tree, popoverPath, onToast, onRefreshTree })
  // Close only if this popover is still the open one: a click on the other
  // trigger has already switched `open` before the outside-click lands.
  const closeSync = useCallback(() => setOpen((o) => (o === 'sync' ? null : o)), [])
  const toggleSync = (e: MouseEvent): void => {
    // The popover's outside-click listener is attached while this very click
    // is still bubbling; stopping it here keeps the popover from closing at once.
    e.stopPropagation()
    if (open === 'sync') return setOpen(null)
    setOpen('sync')
    sync.openPopover()
  }

  if (target.kind === 'none') {
    return (
      <footer className="status-bar" role="status">
        <span className="status-bar-empty">No worktree selected</span>
      </footer>
    )
  }

  if (target.kind === 'folder') {
    // STBR-04: a folder outside every worktree has no sync section and no counter.
    return (
      <footer className="status-bar" role="status">
        <span className="status-bar-folder" title={target.path}>
          <Icon name="folder" size={12} />
          <span className="status-bar-folder-path">{target.path}</span>
        </span>
        <span className="status-bar-note">not a worktree</span>
      </footer>
    )
  }

  const { repoName, worktree } = target.selected
  const { head, tail } = splitBranch(worktree.branch)

  return (
    <footer className="status-bar" role="status">
      <span className="status-bar-repo">{repoName}</span>
      <span className="status-bar-branch" title={worktree.branch}>
        <Icon name="git-branch" size={12} />
        <span className="status-bar-branch-head">{head}</span>
        {tail && (
          <span className="status-bar-branch-tail">
            <bdi>{tail}</bdi>
          </span>
        )}
      </span>
      <span className="status-bar-spacer" />
      <span className="status-bar-anchor">
        <SyncSection state={sync.state} open={open === 'sync'} onToggle={toggleSync} />
        {open === 'sync' && sync.state && (
          <SyncPopover
            state={sync.state}
            commits={sync.commits}
            running={sync.running}
            outcome={sync.outcome}
            onRun={sync.run}
            onClose={closeSync}
          />
        )}
      </span>
      {/* A deleted folder has no changes to count or list (spec edge case). */}
      {!sync.state?.missing && (
        <span className="status-bar-anchor">
          <button
            type="button"
            className="status-bar-changes"
            title={`${worktree.changes} changed files`}
            onClick={() => onOpenChanges(worktree.path)}
          >
            <Icon name="pencil" size={11} />
            {worktree.changes}
          </button>
        </span>
      )}
    </footer>
  )
}

/**
 * The ahead/behind section, or the reason it cannot show counts (STBR-09, 12,
 * 13, 14). Only counts and no-upstream open the popover: the other states offer
 * no operation (STBR-13).
 */
function SyncSection({
  state,
  open,
  onToggle
}: {
  state: SyncState | null
  open: boolean
  onToggle: (e: MouseEvent) => void
}): JSX.Element {
  if (state === null) return <span className="status-bar-sync muted">…</span>
  const section = syncSectionFor(state)
  const trigger = (label: string, title: string, muted = false): JSX.Element => (
    <button
      type="button"
      className={`status-bar-sync${muted ? ' muted' : ''}${open ? ' open' : ''}`}
      title={title}
      aria-expanded={open}
      onClick={onToggle}
    >
      {label}
    </button>
  )
  switch (section.kind) {
    case 'counts':
      return trigger(`↓${section.behind} ↑${section.ahead}`, 'Commits to pull / to push')
    case 'no-upstream':
      return trigger('no upstream', 'Publish this branch', true)
    case 'detached':
      return <span className="status-bar-sync muted">detached HEAD</span>
    case 'no-remote':
      return <span className="status-bar-sync muted">no remote</span>
    case 'error':
      return (
        <span className="status-bar-sync error" title={section.message}>
          {section.message}
        </span>
      )
  }
}
