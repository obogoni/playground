import { useEffect } from 'react'
import type { JSX } from 'react'
import type { Notice } from '../lib/session-notices'
import { Icon } from './Icon'
import './SessionNotices.css'

/** How long an in-app session notice stays up before it dismisses itself. */
const NOTICE_MS = 8000

interface SessionNoticesProps {
  notices: Notice[]
  onOpen: (id: string) => void
  onDismiss: (id: string) => void
}

/**
 * In-app notices for sessions that stopped while another one is on screen
 * (NOTF-02): one per session, stacked bottom-right; a click opens the session
 * (NOTF-05). The single-slot `Toast` is neither clickable nor stackable.
 */
export function SessionNotices({ notices, onOpen, onDismiss }: SessionNoticesProps): JSX.Element {
  return (
    <div className="session-notices" aria-live="polite">
      {notices.map((notice) => (
        <SessionNoticeItem key={notice.id} notice={notice} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

interface SessionNoticeItemProps {
  notice: Notice
  onOpen: (id: string) => void
  onDismiss: (id: string) => void
}

function SessionNoticeItem({ notice, onOpen, onDismiss }: SessionNoticeItemProps): JSX.Element {
  const { id, key } = notice
  // Keyed on `key`: a newer notice for the same session restarts the timer.
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [id, key, onDismiss])

  return (
    <div className="session-notice">
      <button type="button" className="session-notice-open" onClick={() => onOpen(id)}>
        <span className="session-notice-title">{notice.title}</span>
        <span className="session-notice-body">{notice.body}</span>
      </button>
      <button
        type="button"
        className="session-notice-dismiss"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => onDismiss(id)}
      >
        <Icon name="x" size={12} strokeWidth={2.2} />
      </button>
    </div>
  )
}
