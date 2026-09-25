import { useEffect, useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import type { CommitRow } from '../../../shared/files'
import { browseState, commitListState, uncommittedRowLabel } from '../lib/commit-view'
import { relativeTime } from '../lib/relative-time'
import type { UseFiles } from '../lib/use-files'
import { Icon } from './Icon'
import './CommitList.css'

/** How often the relative dates are re-rendered, so "3m ago" does not freeze. */
const TICK_MS = 60_000

interface CommitListProps {
  files: UseFiles
  onToast: (message: string) => void
}

/** Where the row menu is, and which commit opened it (FCMT-21/23). */
interface RowMenu {
  x: number
  y: number
  row: CommitRow
}

/**
 * The branch's own commits, newest first, with uncommitted work on top
 * (FCMT-02..15, 21..26).
 *
 * A row leads with the subject, because that is what the reader is scanning
 * for; the sha is in the tooltip and one right-click away. Copy sha and Open
 * in browser live in that menu rather than in the row: as buttons they
 * reserved their width whether they were shown or not, which left the author's
 * name a single letter wide.
 *
 * What it can show, in order: git's line when the branches could not be
 * listed, F1's base prompt when no base is known (FCMT-07), git's line when
 * the log failed, and otherwise the list — which may legitimately be empty
 * when the branch has added nothing of its own (FCMT-10).
 *
 * The base picker is not here: Commits mode shares it with diff-to-origin
 * mode, so `FileTree` renders one above both (FCMT-06).
 */
export function CommitList({ files, onToast }: CommitListProps): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const [menu, setMenu] = useState<RowMenu | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  // Any click or Escape dismisses the row menu, as it does in the sidebar.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const state = commitListState(files.bases, files.base, files.commits)
  if (state.kind === 'error') return <div className="file-tree-error">{state.message}</div>
  if (state.kind === 'loading') return <div className="file-tree-note">Loading…</div>
  if (state.kind === 'no-base') {
    // FCMT-07: the same prompt diff-to-origin mode shows, for the same reason —
    // the repository has no `origin/HEAD` to fall back on.
    return <div className="file-tree-note">Choose a base branch to compare this branch with.</div>
  }

  const page = state.page
  const uncommitted = uncommittedRowLabel(files.uncommittedCount)
  const browse = menu ? browseState(menu.row, page) : 'hidden'

  const openInBrowser = (sha: string): void => {
    files
      .openCommitInBrowser(sha)
      .then((result) => {
        if (!result.ok) onToast(result.error ?? 'Could not open this commit.')
      })
      .catch((err) => onToast(err instanceof Error ? err.message : String(err)))
  }

  return (
    <div className="commit-list">
      {uncommitted && (
        <button
          type="button"
          className="commit-uncommitted"
          onClick={() => files.setMode('uncommitted')}
        >
          {uncommitted}
        </button>
      )}
      {page.commits.length === 0 ? (
        <div className="file-tree-note">This branch has no commits of its own.</div>
      ) : (
        page.commits.map((row) => (
          <Row
            key={row.sha}
            row={row}
            now={now}
            onOpen={() => files.openCommit(row)}
            onMenu={(event) => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, row })
            }}
          />
        ))
      )}
      {page.hasMore && (
        <button type="button" className="commit-more" onClick={() => files.loadMoreCommits()}>
          Load more
        </button>
      )}
      {menu && (
        <div className="commit-ctx-menu" style={{ left: menu.x, top: menu.y }}>
          <button
            type="button"
            className="commit-ctx-item commit-copy"
            onClick={() => {
              // FCMT-22: the full sha. A short one is ambiguous in a large
              // repository and some tools refuse it outright.
              navigator.clipboard.writeText(menu.row.sha).catch(console.error)
              setMenu(null)
            }}
          >
            <Icon name="copy" size={13} /> Copy sha
          </button>
          {/* FCMT-26: with no upstream, or a host the app cannot address, there
              is nothing to disable toward, so the action is absent. */}
          {browse !== 'hidden' && (
            <button
              type="button"
              className="commit-ctx-item commit-browse"
              disabled={browse === 'disabled'}
              title={
                browse === 'disabled'
                  ? 'This commit has not been pushed yet'
                  : 'Open this commit on its provider'
              }
              onClick={() => {
                openInBrowser(menu.row.sha)
                setMenu(null)
              }}
            >
              <Icon name="external-link" size={13} /> Open in browser
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** One commit (FCMT-03/04/05/12). */
function Row({
  row,
  now,
  onOpen,
  onMenu
}: {
  row: CommitRow
  now: number
  onOpen: () => void
  onMenu: (event: MouseEvent) => void
}): JSX.Element {
  return (
    <div className="commit-row" data-sha={row.sha}>
      {/* FCMT-04: the whole message is the row's tooltip, subject included. */}
      <button
        type="button"
        className="commit-open"
        title={row.message}
        onClick={onOpen}
        onContextMenu={onMenu}
      >
        <span className="commit-subject">{row.subject}</span>
        <span className="commit-meta">
          <span className="commit-author">{row.author}</span>
          <span className="commit-date">{relativeTime(row.at, now)}</span>
          {row.isMerge && <span className="commit-badge commit-merge">merge</span>}
          {!row.pushed && <span className="commit-badge commit-unpushed">not pushed</span>}
        </span>
      </button>
    </div>
  )
}
