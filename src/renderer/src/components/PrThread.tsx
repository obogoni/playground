import { useState } from 'react'
import type { JSX } from 'react'
import type { AdoThreadStatus, PrProvider, PrThreadView, WriteResult } from '../../../shared/files'
import { OFFERED_STATUSES, statusLabel } from '../lib/pr-view'
import { relativeTime } from '../lib/relative-time'
import { useSharedNow } from '../lib/shared-tick'
import { CommentComposer, MarkdownBody } from './CommentComposer'
import { Icon } from './Icon'
import './PrThread.css'

/** Relative dates move by the minute; one shared tick re-renders them. */
const DATE_TICK_MS = 60_000

type SettableStatus = Exclude<AdoThreadStatus, 'unknown'>

/** What a provider's status control gets: the thread, and a way to change it. */
interface StatusControlProps {
  thread: PrThreadView
  busy: boolean
  onSetStatus: (status: SettableStatus) => void
}

/**
 * Azure DevOps' selector over its own thread statuses (FPRA-26). A thread read
 * with a status the app does not know shows it, and offers the known ones.
 */
function AdoStatusSelect({ thread, busy, onSetStatus }: StatusControlProps): JSX.Element {
  const status = thread.providerStatus ?? 'unknown'
  return (
    <select
      className="pr-thread-status"
      value={status}
      disabled={busy}
      title="Thread status"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onSetStatus(event.target.value as SettableStatus)}
    >
      {status === 'unknown' && (
        <option value="unknown" disabled>
          {statusLabel('unknown')}
        </option>
      )}
      {OFFERED_STATUSES.map((offered) => (
        <option key={offered} value={offered}>
          {statusLabel(offered)}
        </option>
      ))}
    </select>
  )
}

/**
 * The status control each provider offers, chosen by the thread's provider:
 * Azure DevOps' selector here. F5 adds GitHub's Resolve / Reopen toggle as an
 * entry, and the thread around it stays as it is.
 */
const STATUS_CONTROLS: Partial<Record<PrProvider, (props: StatusControlProps) => JSX.Element>> = {
  'azure-devops': AdoStatusSelect
}

interface PrThreadProps {
  thread: PrThreadView
  provider: PrProvider
  /** Where the thread sits, for the Overview's list — `file:line` or general (FPRA-11). */
  location?: string
  /** Opens the thread where it sits (FPRA-12); the location becomes a button when present. */
  onActivate?: () => void
  /** A reply under the thread's root comment (FPRA-25). Called only from the composer. */
  onReply: (content: string) => Promise<WriteResult>
  /** A new status (FPRA-26). Called only from the status control. */
  onSetStatus: (status: SettableStatus) => Promise<WriteResult>
  onOpenLink: (href: string) => void
}

/**
 * One review thread (FPRA-20/21/25/26): its comments, each with its author and
 * relative date and rendered inertly; Reply through the composer; and the
 * provider's status control.
 *
 * An active thread opens expanded and a resolved one collapsed to its status
 * and author, expandable (FPRA-20). Setting a status the reader chose moves
 * the thread with it: a resolved thread set to Active reopens and expands, an
 * open one resolved collapses.
 */
export function PrThread({
  thread,
  provider,
  location,
  onActivate,
  onReply,
  onSetStatus,
  onOpenLink
}: PrThreadProps): JSX.Element {
  const now = useSharedNow(DATE_TICK_MS)
  const [expanded, setExpanded] = useState(thread.resolution === 'active')
  const [replying, setReplying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const first = thread.comments[0]
  const Control = STATUS_CONTROLS[provider]

  const setStatus = (status: SettableStatus): void => {
    setBusy(true)
    setStatusError(null)
    void onSetStatus(status).then((result) => {
      setBusy(false)
      if (!result.ok) {
        setStatusError(result.message)
        return
      }
      // FPRA-26: Active reopens a resolved thread, and the reader sees it open.
      const reopened = status === 'active' || status === 'pending'
      setExpanded(reopened)
    })
  }

  const reply = (content: string): Promise<WriteResult> =>
    onReply(content).then((result) => {
      if (result.ok) setReplying(false)
      return result
    })

  return (
    <div
      className={`pr-thread ${thread.resolution}${expanded ? ' expanded' : ''}`}
      data-thread-id={thread.id}
    >
      <div className="pr-thread-head">
        <button
          type="button"
          className="pr-thread-toggle"
          aria-expanded={expanded}
          title={expanded ? 'Collapse' : 'Expand'}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className={`pr-thread-chevron${expanded ? ' open' : ''}`}>
            <Icon name="chevron-down" size={13} />
          </span>
          <span className="pr-thread-author">{first?.author ?? 'Unknown'}</span>
          {!expanded && first && <span className="pr-thread-snippet">{first.content}</span>}
        </button>
        {location &&
          (onActivate ? (
            <button
              type="button"
              className="pr-thread-location link"
              title={`Open ${location}`}
              onClick={onActivate}
            >
              {location}
            </button>
          ) : (
            <span className="pr-thread-location">{location}</span>
          ))}
        {Control ? (
          <Control thread={thread} busy={busy} onSetStatus={setStatus} />
        ) : (
          <span className="pr-thread-resolution">
            {thread.resolution === 'active' ? 'Active' : 'Resolved'}
          </span>
        )}
      </div>
      {statusError && (
        <div className="pr-thread-error" role="alert">
          {statusError}
        </div>
      )}
      {expanded && (
        <div className="pr-thread-body">
          {thread.comments.map((comment) => (
            <div key={comment.id} className="pr-thread-comment" data-comment-id={comment.id}>
              <div className="pr-thread-meta">
                <span className="pr-thread-meta-author">{comment.author}</span>
                <span className="pr-thread-meta-date" title={new Date(comment.at).toLocaleString()}>
                  {relativeTime(comment.at, now)}
                </span>
              </div>
              <MarkdownBody source={comment.content} onOpenLink={onOpenLink} />
            </div>
          ))}
          {replying ? (
            <CommentComposer
              postLabel="Reply"
              placeholder="Write a reply… Markdown is supported."
              autoFocus
              onPost={reply}
              onCancel={() => setReplying(false)}
              onOpenLink={onOpenLink}
            />
          ) : (
            <button type="button" className="pr-thread-reply" onClick={() => setReplying(true)}>
              Reply
            </button>
          )}
        </div>
      )}
    </div>
  )
}
