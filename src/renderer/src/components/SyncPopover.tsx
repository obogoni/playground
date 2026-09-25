import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { CommitLine, CommitLists, GitOp, SyncState } from '../../../shared/git'
import { relativeTime } from '../lib/relative-time'
import { fetchAgeLabel, syncSectionFor } from '../lib/status-bar'
import type { OpOutcome } from '../lib/use-git-sync'
import { Icon, type IconName } from './Icon'
import './SyncPopover.css'

interface SyncPopoverProps {
  state: SyncState
  /** Null while the lists load. */
  commits: CommitLists | null
  /** The operation running for this worktree, if any (STBR-23). */
  running: GitOp | null
  /** The last finished operation for this worktree, if any (STBR-18/24). */
  outcome: OpOutcome | null
  onRun: (op: GitOp, remote?: string) => void
  onClose: () => void
}

/** The Visual Studio Git Changes glyphs; Publish pushes, so it shares Push's. */
const OP_ICON: Record<GitOp, IconName> = {
  sync: 'git-sync',
  pull: 'git-pull',
  push: 'git-push',
  fetch: 'git-fetch',
  publish: 'git-push'
}

const RUNNING_LABEL: Record<GitOp, string> = {
  sync: 'Syncing…',
  pull: 'Pulling…',
  push: 'Pushing…',
  fetch: 'Fetching…',
  publish: 'Publishing…'
}

/** How a finished operation reads inline; failures stay until the next run (STBR-18). */
function outcomeLine({ result }: OpOutcome): { text: string; failed: boolean } {
  if (result.ok) return { text: 'Done.', failed: false }
  if (result.timedOut) {
    // STBR-24: the process was killed; a credential prompt may outlive it.
    return {
      text: `${result.error ?? 'Timed out.'} Git was stopped — finish this from a terminal.`,
      failed: true
    }
  }
  if (result.busy) {
    return { text: 'Another operation is already running for this worktree.', failed: true }
  }
  return { text: result.error ?? 'Git failed.', failed: true }
}

/**
 * The sync popover (STBR-15): the operations the section allows, the fetch age
 * (STBR-22), the commits each direction would move (STBR-16), a busy state
 * (STBR-23) and an inline outcome that does not close the popover (STBR-18).
 * Follows the `sidebar-ctx-menu` pattern: a positioned div dismissed by
 * Escape or by a click outside it.
 */
export function SyncPopover({
  state,
  commits,
  running,
  outcome,
  onRun,
  onClose
}: SyncPopoverProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [remote, setRemote] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
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

  // Keep the relative ages honest while the popover stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const section = syncSectionFor(state)
  const busy = running !== null
  const line = outcome && !busy ? outcomeLine(outcome) : null

  const button = (op: GitOp, label: string, disabled = false, arg?: string): JSX.Element => (
    <button
      type="button"
      className="sync-pop-btn"
      disabled={busy || disabled}
      onClick={() => onRun(op, arg)}
    >
      <Icon name={OP_ICON[op]} size={13} />
      {label}
    </button>
  )

  return (
    <div className="sync-pop" ref={ref}>
      <div className="sync-pop-actions">
        {section.kind === 'counts' && (
          <>
            {button('sync', 'Sync')}
            {button('pull', 'Pull')}
            {button('push', 'Push')}
            {button('fetch', 'Fetch')}
          </>
        )}
        {section.kind === 'no-upstream' &&
          (section.remotes.length > 1 ? (
            <>
              {/* STBR-20: several remotes — the user picks one before publishing. */}
              <select
                className="sync-pop-remote"
                value={remote}
                disabled={busy}
                onChange={(e) => setRemote(e.target.value)}
              >
                <option value="">Choose remote…</option>
                {section.remotes.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {button('publish', 'Publish', remote === '', remote)}
            </>
          ) : (
            button('publish', `Publish to ${section.remotes[0]}`, false, section.remotes[0])
          ))}
        {section.kind !== 'counts' && section.kind !== 'no-upstream' && (
          <span className="sync-pop-reason">
            {section.kind === 'error'
              ? section.message
              : section.kind === 'detached'
                ? 'HEAD is detached — nothing to sync.'
                : 'This repository has no remote.'}
          </span>
        )}
      </div>

      <div className="sync-pop-fetched">Last fetched: {fetchAgeLabel(state.lastFetchAt, now)}</div>

      {busy && (
        <div className="sync-pop-status" role="status">
          <span className="sync-pop-loader">
            <Icon name="loader" size={12} />
          </span>
          {RUNNING_LABEL[running]}
        </div>
      )}
      {line && (
        <div className={`sync-pop-status${line.failed ? ' failed' : ''}`} role="status">
          {line.text}
        </div>
      )}

      {section.kind === 'counts' && (
        <>
          <CommitList
            title="To pull"
            lines={commits?.incoming}
            more={commits?.moreIncoming ?? 0}
            now={now}
          />
          <CommitList
            title="To push"
            lines={commits?.outgoing}
            more={commits?.moreOutgoing ?? 0}
            now={now}
          />
        </>
      )}
    </div>
  )
}

/** One direction's commits: short hash, subject, relative date, and the `+N more` tail (STBR-16). */
function CommitList({
  title,
  lines,
  more,
  now
}: {
  title: string
  lines: CommitLine[] | undefined
  more: number
  now: number
}): JSX.Element {
  return (
    <div className="sync-pop-list">
      <div className="section-label">{title}</div>
      {lines === undefined ? (
        <div className="sync-pop-empty">Loading…</div>
      ) : lines.length === 0 ? (
        <div className="sync-pop-empty">None</div>
      ) : (
        <>
          {lines.map((c) => (
            <div key={c.sha} className="sync-pop-commit">
              <span className="sync-pop-sha">{c.sha}</span>
              <span className="sync-pop-subject" title={c.subject}>
                {c.subject}
              </span>
              <span className="sync-pop-age">{relativeTime(c.at, now)}</span>
            </div>
          ))}
          {more > 0 && <div className="sync-pop-more">+{more} more</div>}
        </>
      )}
    </div>
  )
}
