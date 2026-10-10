import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type {
  PrFile,
  PrProvider,
  PrSearch,
  PrThreadView,
  PrTimelineEntry
} from '../../../shared/files'
import { providerName, resetTime, type PrFailure } from '../lib/pr-lookup'
import { REVIEWER_STATES } from '../lib/pr-status'
import { overviewGroups, prLabel } from '../lib/pr-view'
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
 * Before there is a pull request to show it says why, each provider on its
 * own line, naming itself (FPRG-07): a detached HEAD (FPRA-08), no remote on
 * the provider (FPRA-06), no sign-in (FPRA-07, the Tasks pane's words), a rate
 * limit (FPRG-26), or no active pull request, with Create PR (FPRA-05). With
 * one, it shows the header, the description, the reviewers and their votes
 * — GitHub's latest review states and its requested reviewers too (FPRG-09) —
 * every thread grouped by where it sits, GitHub's review bodies and PR
 * comments in General (FPRG-10), Activity collapsed, and a composer for a
 * general comment. Everything third parties wrote is rendered inertly.
 */
export function PrOverview({ pr, onOpenDiff, onToast }: PrOverviewProps): JSX.Element {
  const now = useSharedNow(DATE_TICK_MS)
  const [activityOpen, setActivityOpen] = useState(false)
  const { searches, prs, detail } = pr

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

  // FPRA-04, FPRG-07: several pull requests, on any provider, so the reader picks the one shown.
  const picker =
    prs.length > 1 ? <PrPicker prs={prs} current={pr.current} onChoose={pr.choose} /> : null

  // Each provider that answered, in a fixed order, so its lines do not move.
  const answered = PROVIDERS.flatMap((provider) => {
    const search = searches[provider]
    return search ? [{ provider, search }] : []
  })

  /** One line per provider, each saying why that provider has nothing to show. */
  const lines = (entries: typeof answered): ReactNode =>
    entries.map(({ provider, search }) => (
      <div key={provider} className="pr-overview-provider-line">
        {searchLine(provider, search, () => launch(pr.createPr(provider)))}
      </div>
    ))

  // A provider's sign-in, rate limit or failure is said even beside another
  // provider's pull requests, which it never hides (FPRG-07).
  const problems = (except: PrProvider | null): typeof answered =>
    answered.filter(({ provider, search }) => provider !== except && isProblem(search))

  const state = (body: ReactNode): JSX.Element => (
    <div className="pr-overview">
      {toolbar}
      {picker}
      <div className="pr-overview-state">{body}</div>
    </div>
  )

  if (!detail) {
    if (pr.failure) return state(failureLine(pr.failure))
    if (answered.length === 0) return state('Looking for this branch’s pull request…')
    // A detached HEAD is the branch's, not a provider's: said once (FPRA-08).
    if (answered.some(({ search }) => search.kind === 'detached')) {
      return state('HEAD is detached: there is no branch to look a pull request up for.')
    }
    if (prs.length > 0) {
      return state(
        <>
          {lines(problems(null))}
          {prs.length > 1
            ? 'This branch has several active pull requests. Choose the one to show.'
            : 'Reading the pull request…'}
        </>
      )
    }
    // No provider found one, and each says why (FPRA-05/06, FPRG-06). A
    // provider the repository has no remote on stays silent while another
    // provider has one.
    const anyRemote = answered.some(({ search }) => search.kind !== 'no-remote')
    return state(
      lines(anyRemote ? answered.filter(({ search }) => search.kind !== 'no-remote') : answered)
    )
  }

  const others = problems(detail.target.provider)
  const otherLines =
    others.length > 0 ? <div className="pr-overview-state">{lines(others)}</div> : null

  // Edge case: completed or abandoned elsewhere, so nothing stale is shown.
  if (detail.status !== 'active') {
    return state(
      <>
        {others.length > 0 && lines(others)}
        <p className="pr-overview-title-line">
          {prLabel(detail)} {detail.title}
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
        provider={detail.target.provider}
        location={location}
        onActivate={open ? () => onOpenDiff(open.file, open.at) : undefined}
        onReply={(content) => pr.reply(thread.id, thread.rootCommentId, content)}
        onSetState={(intent) => pr.setThreadState(thread, intent)}
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
      {otherLines}
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
          <span className="pr-overview-id">{prLabel(detail)}</span> {detail.title}
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
      <GeneralSection
        threads={groups.general}
        timeline={detail.timeline ?? []}
        now={now}
        threadItem={threadItem}
        onOpenLink={openLink}
      />

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

/**
 * The General section: threads on the pull request as a whole, then GitHub's
 * review bodies and PR comments in time order (FPRG-10, D4). A timeline entry
 * is read, never answered in place, so it carries no Reply or Resolve; it is
 * answered with the general comment below. A review with no text shows only
 * its state (edge case). Hidden when it has nothing to list.
 */
function GeneralSection({
  threads,
  timeline,
  now,
  threadItem,
  onOpenLink
}: {
  threads: PrThreadView[]
  timeline: PrTimelineEntry[]
  now: number
  threadItem: (thread: PrThreadView) => JSX.Element
  onOpenLink: (href: string) => void
}): JSX.Element | null {
  const count = threads.length + timeline.length
  if (count === 0) return null
  return (
    <section className="pr-overview-section">
      <h3 className="section-label">General ({count})</h3>
      {threads.length > 0 && <div className="pr-overview-threads">{threads.map(threadItem)}</div>}
      {timeline.length > 0 && (
        <ul className="pr-overview-timeline">
          {timeline.map((entry, i) => (
            <li
              key={`${entry.at}:${i}`}
              className="pr-overview-timeline-entry"
              data-review-state={entry.reviewState}
            >
              <div className="pr-overview-timeline-meta">
                <span className="pr-overview-timeline-author">{entry.author}</span>
                {entry.reviewState && (
                  <span className={`pr-overview-timeline-state ${entry.reviewState}`}>
                    {REVIEWER_STATES[entry.reviewState]}
                  </span>
                )}
                <span
                  className="pr-overview-timeline-date"
                  title={new Date(entry.at).toLocaleString()}
                >
                  {relativeTime(entry.at, now)}
                </span>
              </div>
              {entry.content.trim() !== '' && (
                <MarkdownBody source={entry.content} onOpenLink={onOpenLink} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The order the providers' lines are said in. */
const PROVIDERS: readonly PrProvider[] = ['azure-devops', 'github']

const SIGN_IN: Record<PrProvider, { title: string; command: string }> = {
  'azure-devops': { title: 'Azure DevOps sign-in needed', command: 'az login' },
  github: { title: 'GitHub sign-in needed', command: 'gh auth login' }
}

/** Where Azure DevOps reads "an Azure DevOps repository", GitHub reads "GitHub" (FPRG-06). */
const NOT_PUSHED: Record<PrProvider, string> = {
  'azure-devops':
    'No active pull request. This branch is not pushed to an Azure DevOps repository yet.',
  github: 'No open pull request. This branch is not pushed to GitHub yet.'
}

/** What a provider says beside another provider's pull requests: only what keeps it from searching. */
function isProblem(search: PrSearch): boolean {
  return search.kind === 'auth' || search.kind === 'rate-limited' || search.kind === 'error'
}

/**
 * Why one provider has nothing to show (FPRA-05/06/07, FPRG-04, 06, 26), or
 * null when it has nothing to say: it found pull requests, or the HEAD is
 * detached, which is said once for every provider.
 */
function searchLine(provider: PrProvider, search: PrSearch, onCreate: () => void): ReactNode {
  switch (search.kind) {
    case 'auth':
      return <SignIn provider={provider} />
    case 'rate-limited':
      return <RateLimited provider={provider} resetAt={search.resetAt} />
    case 'error':
      return <Failure provider={provider} message={search.message} />
    case 'no-remote':
      return `This repository has no ${providerName(provider)} remote, so there is no pull request to show.`
    case 'none':
      return search.createUrlAvailable ? (
        <>
          <p>No active pull request on {providerName(provider)} for this branch.</p>
          <button type="button" className="pr-overview-button primary" onClick={onCreate}>
            Create PR
          </button>
        </>
      ) : (
        NOT_PUSHED[provider]
      )
    case 'detached':
    case 'found':
      return null
  }
}

/** Why the pull request picked could not be read (FPRA-07, FPRG-04, 26). */
function failureLine(failure: PrFailure): ReactNode {
  switch (failure.kind) {
    case 'auth':
      return <SignIn provider={failure.provider} />
    case 'rate-limited':
      return <RateLimited provider={failure.provider} resetAt={failure.resetAt} />
    case 'error':
      return <Failure provider={failure.provider} message={failure.message} />
  }
}

/** The Tasks pane's sign-in prompt, word for word (FPRA-07), with each provider's command (FPRG-04). */
function SignIn({ provider }: { provider: PrProvider }): JSX.Element {
  const { title, command } = SIGN_IN[provider]
  return (
    <div className="pr-overview-auth">
      <div className="pr-overview-auth-title">{title}</div>
      Run <code>{command}</code> in a terminal, then refresh.
    </div>
  )
}

/** A provider refusing requests until a time; nothing retries before the reader refreshes (FPRG-26). */
function RateLimited({
  provider,
  resetAt
}: {
  provider: PrProvider
  resetAt: number
}): JSX.Element {
  return (
    <p>
      {providerName(provider)} is refusing requests until {resetTime(resetAt)}. Refresh after that.
    </p>
  )
}

function Failure({ provider, message }: { provider: PrProvider; message: string }): JSX.Element {
  return (
    <>
      <p>The pull request could not be read from {providerName(provider)}.</p>
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
