import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type { PrFile, PrThreadView, ReviewerState } from '../../../shared/files'
import { overviewGroups } from '../lib/pr-view'
import { relativeTime } from '../lib/relative-time'
import { useSharedNow } from '../lib/shared-tick'
import type { DiffSpot } from '../lib/use-files'
import type { UsePullRequest } from '../lib/use-pull-request'
import { CommentComposer, MarkdownBody } from './CommentComposer'
import { Icon } from './Icon'
import { PrPicker } from './PrPicker'
import { PrThread } from './PrThread'
import './PrOverview.css'

/** Relative dates move by the minute; one shared tick re-renders them. */
const DATE_TICK_MS = 60_000

const REVIEWER_STATES: Record<ReviewerState, string> = {
  approved: 'Approved',
  'approved-with-suggestions': 'Approved with suggestions',
  'no-vote': 'No vote',
  'waiting-for-author': 'Waiting for author',
  rejected: 'Rejected'
}

interface PrOverviewProps {
  pr: UsePullRequest
  /**
   * Opens one file's PR diff (FPRA-12): at a line for an anchored thread, at
   * the top for a thread on the file as a whole ([owner 2026-10-10]).
   */
  onOpenDiff: (file: PrFile, at: DiffSpot | null) => void
  /** The launcher's failure toast, for Open in browser and Create PR. */
  onToast: (message: string) => void
}

/**
 * The Pull request mode's fixed Overview tab (FPRA-05..14, 29, 34).
 *
 * Before there is a pull request to show it says why: a detached HEAD
 * (FPRA-08), no Azure DevOps remote (FPRA-06), no sign-in (FPRA-07, the Tasks
 * pane's words), or no active pull request, with Create PR (FPRA-05). With
 * one, it shows the header, the description, the reviewers and their votes,
 * every thread grouped by where it sits, Activity collapsed, and a composer
 * for a general comment. Everything third parties wrote is rendered inertly.
 */
export function PrOverview({ pr, onOpenDiff, onToast }: PrOverviewProps): JSX.Element {
  const now = useSharedNow(DATE_TICK_MS)
  const [activityOpen, setActivityOpen] = useState(false)
  const { search, detail } = pr

  const launch = (result: Promise<{ ok: boolean; error?: string }>): void => {
    void result
      .then((outcome) => {
        if (!outcome.ok) onToast(outcome.error ?? 'Could not open the browser.')
      })
      .catch((err: unknown) => onToast(err instanceof Error ? err.message : String(err)))
  }
  const openLink = (href: string): void => launch(pr.openLink(href))

  const toolbar = (
    <div className="pr-overview-toolbar">
      <button
        type="button"
        className="pr-overview-button"
        disabled={pr.loading}
        title="Read the pull request again"
        onClick={pr.refresh}
      >
        <Icon name="refresh" size={13} />
        <span>{pr.loading ? 'Refreshing…' : 'Refresh'}</span>
      </button>
      {detail && (
        <button
          type="button"
          className="pr-overview-button"
          title="Open this pull request in the browser"
          onClick={() => launch(pr.openInBrowser())}
        >
          <Icon name="external-link" size={13} />
          <span>Open in browser</span>
        </button>
      )}
    </div>
  )

  // FPRA-04: several pull requests, so the reader picks the one shown.
  const picker =
    search?.kind === 'found' && search.prs.length > 1 ? (
      <PrPicker prs={search.prs} current={pr.current} onChoose={pr.choose} />
    ) : null

  const state = (body: ReactNode): JSX.Element => (
    <div className="pr-overview">
      {toolbar}
      {picker}
      <div className="pr-overview-state">{body}</div>
    </div>
  )

  if (!detail) {
    if (pr.failure?.kind === 'auth' || search?.kind === 'auth') return state(<SignIn />)
    if (pr.failure?.kind === 'error') return state(<Failure message={pr.failure.message} />)
    if (search === null) return state('Looking for this branch’s pull request…')
    switch (search.kind) {
      case 'detached':
        return state('HEAD is detached: there is no branch to look a pull request up for.')
      case 'no-ado-remote':
        return state(
          'This repository has no Azure DevOps remote, so there is no pull request to show.'
        )
      case 'error':
        return state(<Failure message={search.message} />)
      case 'none':
        return state(
          search.createUrlAvailable ? (
            <>
              <p>No active pull request for this branch.</p>
              <button
                type="button"
                className="pr-overview-button primary"
                onClick={() => launch(pr.createPr())}
              >
                Create PR
              </button>
            </>
          ) : (
            'No active pull request. This branch is not pushed to an Azure DevOps repository yet.'
          )
        )
      case 'found':
        return state(
          search.prs.length > 1
            ? 'This branch has several active pull requests. Choose the one to show.'
            : 'Reading the pull request…'
        )
    }
  }

  // Edge case: completed or abandoned elsewhere, so nothing stale is shown.
  if (detail.status !== 'active') {
    return state(
      <>
        <p className="pr-overview-title-line">
          !{detail.id} {detail.title}
        </p>
        <p>This pull request was completed or abandoned.</p>
      </>
    )
  }

  const groups = overviewGroups(detail.threads)
  const fileOf = (path: string): PrFile | undefined =>
    detail.files.find((file) => file.path === path)

  const threadItem = (thread: PrThreadView): JSX.Element => {
    const { location, open } = whereIs(thread, fileOf)
    return (
      <PrThread
        key={thread.id}
        thread={thread}
        provider={detail.provider}
        location={location}
        onActivate={open ? () => onOpenDiff(open.file, open.at) : undefined}
        onReply={(content) => pr.reply(thread.id, thread.rootCommentId, content)}
        onSetStatus={(status) => pr.setStatus(thread.id, status)}
        onOpenLink={openLink}
      />
    )
  }

  const section = (title: string, threads: PrThreadView[]): JSX.Element | null =>
    threads.length === 0 ? null : (
      <section className="pr-overview-section">
        <h3 className="section-label">
          {title} ({threads.length})
        </h3>
        <div className="pr-overview-threads">{threads.map(threadItem)}</div>
      </section>
    )

  return (
    <div className="pr-overview">
      {toolbar}
      {picker}
      {pr.notice && (
        <div className="pr-overview-notice" role="status">
          {pr.notice}
        </div>
      )}
      {pr.newIteration && (
        <div className="pr-overview-banner" role="status">
          <span>New changes were pushed to this pull request.</span>
          <button type="button" className="pr-overview-button" onClick={pr.reloadDiffs}>
            Reload diffs
          </button>
        </div>
      )}

      <header className="pr-overview-header">
        <h2 className="pr-overview-title">
          <span className="pr-overview-id">!{detail.id}</span> {detail.title}
          {detail.isDraft && <span className="pr-overview-badge">Draft</span>}
        </h2>
        <div className="pr-overview-meta">
          <span>{detail.author}</span>
          <span>Active{detail.isDraft ? ' · draft' : ''}</span>
          <span className="pr-overview-branches">
            <code>{detail.sourceBranch}</code> → <code>{detail.targetBranch}</code>
          </span>
          <span title={new Date(detail.createdAt).toLocaleString()}>
            created {relativeTime(detail.createdAt, now)}
          </span>
        </div>
      </header>

      <section className="pr-overview-section">
        <h3 className="section-label">Reviewers</h3>
        {detail.reviewers.length === 0 ? (
          <div className="pr-overview-empty">No reviewers.</div>
        ) : (
          <ul className="pr-overview-reviewers">
            {detail.reviewers.map((reviewer) => (
              <li key={reviewer.name} className={`pr-overview-reviewer ${reviewer.state}`}>
                <span className="pr-overview-reviewer-name">
                  {reviewer.name}
                  {reviewer.isGroup && <span className="pr-overview-tag">group</span>}
                  {reviewer.isRequired && <span className="pr-overview-tag">required</span>}
                </span>
                <span className="pr-overview-vote">{REVIEWER_STATES[reviewer.state]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pr-overview-section">
        <h3 className="section-label">Description</h3>
        {detail.description.trim() === '' ? (
          <div className="pr-overview-empty">No description.</div>
        ) : (
          <MarkdownBody
            source={detail.description}
            onOpenLink={openLink}
            className="pr-overview-description"
          />
        )}
      </section>

      {section('Active', groups.active)}
      {section('Resolved', groups.resolved)}
      {section('Outdated', groups.outdated)}
      {section('General', groups.general)}

      <section className="pr-overview-section">
        <h3 className="section-label">Comment on the pull request</h3>
        <CommentComposer onPost={pr.comment} onOpenLink={openLink} />
      </section>

      <section className="pr-overview-section">
        <button
          type="button"
          className="pr-overview-activity-toggle"
          aria-expanded={activityOpen}
          onClick={() => setActivityOpen((open) => !open)}
        >
          <span className={`pr-overview-chevron${activityOpen ? ' open' : ''}`}>
            <Icon name="chevron-down" size={13} />
          </span>
          <span className="section-label">Activity ({groups.activity.length})</span>
        </button>
        {/* FPRA-13: collapsed by default, and nothing mounts while it is. */}
        {activityOpen && (
          <ul className="pr-overview-activity">
            {groups.activity.map((thread) => {
              const first = thread.comments[0]
              return (
                <li key={thread.id} className="pr-overview-activity-row">
                  <MarkdownBody source={first?.content ?? ''} onOpenLink={openLink} />
                  {first && (
                    <span className="pr-overview-activity-date">{relativeTime(first.at, now)}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

/** The Tasks pane's sign-in prompt, word for word (FPRA-07). */
function SignIn(): JSX.Element {
  return (
    <div className="pr-overview-auth">
      <div className="pr-overview-auth-title">Azure DevOps sign-in needed</div>
      Run <code>az login</code> in a terminal, then refresh.
    </div>
  )
}

function Failure({ message }: { message: string }): JSX.Element {
  return (
    <>
      <p>The pull request could not be read.</p>
      <div className="pr-overview-error">{message}</div>
    </>
  )
}

/**
 * Where a thread is listed as sitting (FPRA-11), and what activating it opens
 * (FPRA-12): an anchored thread opens its file's PR diff at its line, a thread
 * on a whole file at the top ([owner 2026-10-10]). An outdated thread is
 * named by its old line and opens nothing: there is no line left to show.
 */
function whereIs(
  thread: PrThreadView,
  fileOf: (path: string) => PrFile | undefined
): { location: string; open: { file: PrFile; at: DiffSpot | null } | null } {
  const place = thread.place
  const opening = (
    path: string,
    at: DiffSpot | null
  ): { file: PrFile; at: DiffSpot | null } | null => {
    const file = fileOf(path)
    return file ? { file, at } : null
  }
  switch (place.kind) {
    case 'placed':
      return {
        location: `${place.path}:${place.startLine}${place.side === 'left' ? ' (original)' : ''}`,
        open: opening(place.path, {
          line: place.startLine,
          side: place.side === 'right' ? 'modified' : 'original'
        })
      }
    case 'outdated':
      return { location: `${place.path}:${place.line}`, open: null }
    case 'general':
      return place.path
        ? { location: place.path, open: opening(place.path, null) }
        : { location: 'General', open: null }
    default:
      return { location: '', open: null }
  }
}
