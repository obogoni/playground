import { useMemo, useState } from 'react'
import type { JSX, KeyboardEvent, MouseEvent } from 'react'
import type { WriteResult } from '../../../shared/files'
import { renderMarkdown } from '../lib/markdown'
import './CommentComposer.css'

/**
 * Third-party markdown, rendered inertly (FPRA-10/21/22). `renderMarkdown`
 * emits no `href` at all, so nothing in here can navigate; a click on a link
 * hands its `data-href` — present only for `https:` — to `onOpenLink`, which
 * sends it to main to be checked again and opened (FPRA-23).
 */
export function MarkdownBody({
  source,
  onOpenLink,
  className
}: {
  source: string
  onOpenLink: (href: string) => void
  className?: string
}): JSX.Element {
  const html = useMemo(() => renderMarkdown(source), [source])
  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    event.preventDefault()
    const href = anchor.getAttribute('data-href')
    if (href) onOpenLink(href)
  }
  return (
    <div
      className={`markdown-body${className ? ` ${className}` : ''}`}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

interface CommentComposerProps {
  /** Sends the text. Called only from the Post button or Ctrl+Enter (FPRA-32). */
  onPost: (content: string) => Promise<WriteResult>
  /** Offered as Cancel when present: a reply or a new thread can be abandoned. */
  onCancel?: () => void
  /** Links in Preview open like any other rendered link (FPRA-23). */
  onOpenLink: (href: string) => void
  postLabel?: string
  placeholder?: string
  autoFocus?: boolean
}

/**
 * Writes one comment (FPRA-30/31/32). Markdown, with a Write / Preview switch
 * whose Preview is the same inert rendering every comment gets. Ctrl+Enter or
 * Post sends it, and nothing else does. A failure keeps the text exactly as
 * typed and shows the provider's message under it; a success clears it.
 */
export function CommentComposer({
  onPost,
  onCancel,
  onOpenLink,
  postLabel = 'Comment',
  placeholder = 'Write a comment… Markdown is supported.',
  autoFocus = false
}: CommentComposerProps): JSX.Element {
  const [text, setText] = useState('')
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const post = (): void => {
    if (busy || text.trim() === '') return
    setBusy(true)
    setError(null)
    void onPost(text).then((result) => {
      setBusy(false)
      if (result.ok) setText('')
      else setError(result.message)
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      post()
    }
  }

  return (
    <div className="comment-composer">
      <div className="comment-composer-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'write'}
          className={`comment-composer-tab${tab === 'write' ? ' active' : ''}`}
          onClick={() => setTab('write')}
        >
          Write
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preview'}
          className={`comment-composer-tab${tab === 'preview' ? ' active' : ''}`}
          onClick={() => setTab('preview')}
        >
          Preview
        </button>
      </div>
      {tab === 'write' ? (
        <textarea
          className="comment-composer-input"
          value={text}
          placeholder={placeholder}
          // A reply or a new thread opens when the reader asks for it, so it
          // takes the focus; the Overview's standing composer does not.
          autoFocus={autoFocus}
          disabled={busy}
          rows={4}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
      ) : text.trim() === '' ? (
        <div className="comment-composer-empty">Nothing to preview.</div>
      ) : (
        <MarkdownBody source={text} onOpenLink={onOpenLink} className="comment-composer-preview" />
      )}
      {error && (
        <div className="comment-composer-error" role="alert">
          {error}
        </div>
      )}
      <div className="comment-composer-actions">
        <span className="comment-composer-hint">Ctrl+Enter to post</span>
        {onCancel && (
          <button
            type="button"
            className="comment-composer-cancel"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="comment-composer-post"
          disabled={busy || text.trim() === ''}
          onClick={post}
        >
          {busy ? 'Posting…' : postLabel}
        </button>
      </div>
    </div>
  )
}
