import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import type { AppConfig, SessionView } from '../../../shared/config'
import type { PrProvider, PrRef } from '../../../shared/files'
import type { SyncState } from '../../../shared/git'
import type { LaunchResult } from '../../../shared/shortcuts'
import type { WorkspaceNode } from '../../../shared/tree'
import { api } from '../lib/api'
import { providerName, type PrLookupEntry } from '../lib/pr-lookup'
import {
  prChip,
  type PrChip,
  type PrChipItem,
  type PrReview,
  type ReviewMark
} from '../lib/pr-status'
import { prKey } from '../lib/pr-view'
import { barTargetFor, splitBranch, syncSectionFor } from '../lib/status-bar'
import { useGitSync } from '../lib/use-git-sync'
import { Icon } from './Icon'
import { SyncPopover } from './SyncPopover'
import './StatusBar.css'

interface StatusBarProps {
  tree: WorkspaceNode[]
  /** From `useTree`: bumped per `tree:get` result (STBR-11, PERF-13). */
  treeRevision: number
  /** From `useTree`: recount results by worktree path, stable (PERF-12, AD-052). */
  onRecounted: (cb: (worktreePath: string) => void) => () => void
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
  /** Open one pull request of this worktree in the Files direction's Pull request mode (SPRL-10, 13). */
  onOpenPullRequest: (worktreeId: string, pr: PrRef) => void
  /** Refresh the tree after a successful operation (STBR-25). */
  onRefreshTree: () => void
  /** The shared pull request lookup's entry for the worktree the bar describes (F6). */
  prEntry: PrLookupEntry
}

/**
 * The window-wide status bar (STBR-01): always mounted, describing the tree
 * selection — or, in Agents, the selected session's worktree (STBR-02..05).
 * Repo, branch and the changed-file counter come from the tree snapshot; only
 * the sync section asks main, through `useGitSync`.
 */
export function StatusBar({
  tree,
  treeRevision,
  onRecounted,
  selectedId,
  sessions,
  selectedSessionId,
  direction,
  onToast,
  onOpenChanges,
  onOpenPullRequest,
  onRefreshTree,
  prEntry
}: StatusBarProps): JSX.Element {
  const target = barTargetFor({ direction, tree, selectedId, sessions, selectedSessionId })
  const targetPath = target.kind === 'worktree' ? target.selected.worktree.path : null
  /** The sync popover and the pull request menu; the counter navigates. */
  const [open, setOpen] = useState<'sync' | 'pr' | null>(null)
  const popoverPath = open === 'sync' ? targetPath : null
  const sync = useGitSync({
    targetPath,
    treeRevision,
    onRecounted,
    popoverPath,
    onToast,
    onRefreshTree
  })
  // Close only if this popover is still the open one: a click on the other
  // trigger has already switched `open` before the outside-click lands.
  const closeSync = useCallback(() => setOpen((o) => (o === 'sync' ? null : o)), [])
  const closePr = useCallback(() => setOpen((o) => (o === 'pr' ? null : o)), [])
  const togglePr = (e: MouseEvent): void => {
    e.stopPropagation()
    setOpen(open === 'pr' ? null : 'pr')
  }
  // The browser openers: main builds every URL from the pull request or the
  // branch (FPRA-05/14, FPRG-08); a failure is a toast, as in the Overview.
  const launch = (result: Promise<LaunchResult>): void => {
    void result
      .then((outcome) => {
        if (!outcome.ok) onToast(outcome.error ?? 'Could not open the browser.')
      })
      .catch((err: unknown) => onToast(err instanceof Error ? err.message : String(err)))
  }
  const browsePr = (worktreePath: string, pr: PrRef): void =>
    launch(
      pr.target.provider === 'github'
        ? api.invoke('github-pr:open', { worktreePath, pr })
        : api.invoke('ado-pr:open', { worktreePath, pr })
    )
  const createPr = (worktreePath: string, provider: PrProvider): void =>
    launch(
      provider === 'github'
        ? api.invoke('github-pr:open', { worktreePath, create: true })
        : api.invoke('ado-pr:open', { worktreePath, create: true })
    )

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
      {/* A deleted folder has no branch to look a pull request up for. */}
      {!sync.state?.missing && (
        <PrSection
          chip={prChip(prEntry.searches, prEntry.reads)}
          open={open === 'pr'}
          onToggle={togglePr}
          onClose={closePr}
          onOpen={(pr) => onOpenPullRequest(worktree.path, pr)}
          onBrowse={(pr) => browsePr(worktree.path, pr)}
          onCreate={(provider) => createPr(worktree.path, provider)}
        />
      )}
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

const MARK_GLYPH: Record<ReviewMark, string> = { rejected: '✕', changes: '⏸', approved: '✓' }

/** What each mark says to a screen reader: never colour alone (SPRL-04..06). */
const MARK_LABEL: Record<ReviewMark, string> = {
  rejected: 'Rejected',
  changes: 'Changes requested or waiting for the author',
  approved: 'Approved'
}

/** How a pull request's number reads on the chip (SPRL-03). */
function prNumber(pr: PrRef): string {
  return `#${pr.id}`
}

/** The review mark, labelled for screen readers; nothing when no reviewer voted or none was read. */
function ReviewMarkGlyph({ review }: { review: PrReview }): JSX.Element | null {
  if (review.kind !== 'read' || review.mark === null) return null
  const mark = review.mark
  return (
    <span className={`status-bar-pr-mark ${mark}`} role="img" aria-label={MARK_LABEL[mark]}>
      {MARK_GLYPH[mark]}
    </span>
  )
}

/** The chip's tooltip: the PR, its target, every reviewer and their state, then any provider note (SPRL-08, 19). */
function prTooltip(item: PrChipItem, notes: string[]): string {
  const { pr, review } = item
  const lines = [`${pr.title}`, `Into ${pr.targetBranch} · ${providerName(pr.target.provider)}`]
  if (review.kind === 'read') {
    lines.push('', ...(review.lines.length > 0 ? review.lines : ['No reviewers']))
  } else if (review.kind === 'failed') {
    lines.push('', review.reason)
  }
  if (notes.length > 0) lines.push('', ...notes)
  return lines.join('\n')
}

/**
 * The pull request chip (F6) for the bar's worktree, as `prChip` decided it:
 * one PR with its mark and a ↗, several behind a menu, a muted Create PR, a
 * muted `PR ?` with the reason, or nothing (SPRL-03..19). It only reads and
 * opens pages; nothing here writes to a provider.
 */
function PrSection({
  chip,
  open,
  onToggle,
  onClose,
  onOpen,
  onBrowse,
  onCreate
}: {
  chip: PrChip
  open: boolean
  onToggle: (e: MouseEvent) => void
  onClose: () => void
  onOpen: (pr: PrRef) => void
  onBrowse: (pr: PrRef) => void
  onCreate: (provider: PrProvider) => void
}): JSX.Element | null {
  switch (chip.kind) {
    case 'hidden':
      return null
    case 'unknown':
      return (
        <span className="status-bar-pr muted" title={chip.reason}>
          PR ?
        </span>
      )
    case 'create':
      return (
        <button
          type="button"
          className="status-bar-pr muted"
          title={`Create a pull request on ${providerName(chip.provider)}`}
          onClick={() => onCreate(chip.provider)}
        >
          Create PR
        </button>
      )
    case 'one': {
      const { pr, review } = chip.item
      return (
        <span className="status-bar-anchor status-bar-pr-group">
          <button
            type="button"
            className="status-bar-pr"
            title={prTooltip(chip.item, chip.notes)}
            onClick={() => onOpen(pr)}
          >
            PR {prNumber(pr)}
            {pr.isDraft && <span className="status-bar-pr-draft"> · Draft</span>}
            <ReviewMarkGlyph review={review} />
          </button>
          <BrowseButton pr={pr} onBrowse={onBrowse} />
        </span>
      )
    }
    case 'many':
      return (
        <span className="status-bar-anchor">
          <button
            type="button"
            className={`status-bar-pr${open ? ' open' : ''}`}
            title="Pull requests from this branch"
            aria-expanded={open}
            onClick={onToggle}
          >
            {chip.items.length} PRs
          </button>
          {open && (
            <PrMenu
              items={chip.items}
              notes={chip.notes}
              onClose={onClose}
              onOpen={onOpen}
              onBrowse={onBrowse}
            />
          )}
        </span>
      )
  }
}

function BrowseButton({ pr, onBrowse }: { pr: PrRef; onBrowse: (pr: PrRef) => void }): JSX.Element {
  return (
    <button
      type="button"
      className="status-bar-pr-browse"
      title="Open in the browser"
      aria-label={`Open pull request ${prNumber(pr)} in the browser`}
      onClick={() => onBrowse(pr)}
    >
      <Icon name="external-link" size={11} />
    </button>
  )
}

/**
 * The menu of a branch's pull requests (SPRL-12..14, 19): each item opens in
 * the app and has its own ↗; another provider's failure is a note at the
 * foot. Escape or a click outside it closes it, as the sync popover does.
 */
function PrMenu({
  items,
  notes,
  onClose,
  onOpen,
  onBrowse
}: {
  items: PrChipItem[]
  notes: string[]
  onClose: () => void
  onOpen: (pr: PrRef) => void
  onBrowse: (pr: PrRef) => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onClick = (e: globalThis.MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="status-bar-pr-menu" ref={ref} role="menu">
      {items.map((item) => (
        <div className="status-bar-pr-item" key={prKey(item.pr)}>
          <button
            type="button"
            role="menuitem"
            className="status-bar-pr-open"
            title={prTooltip(item, [])}
            onClick={() => {
              onClose()
              onOpen(item.pr)
            }}
          >
            <span className="status-bar-pr-number">{prNumber(item.pr)}</span>
            <span className="status-bar-pr-title">{item.pr.title}</span>
            <span className="status-bar-pr-target">→ {item.pr.targetBranch}</span>
            <span className="status-bar-pr-provider">{providerName(item.pr.target.provider)}</span>
            {item.pr.isDraft && <span className="status-bar-pr-draft">Draft</span>}
            <ReviewMarkGlyph review={item.review} />
          </button>
          <BrowseButton pr={item.pr} onBrowse={onBrowse} />
        </div>
      ))}
      {notes.map((note) => (
        <div className="status-bar-pr-note" key={note}>
          {note}
        </div>
      ))}
    </div>
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
