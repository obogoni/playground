import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DiffSides,
  PrComment,
  PrDetail,
  PrFile,
  PrProvider,
  PrRef,
  PrSelection,
  PrSummary,
  PrThreadView,
  ThreadStateIntent,
  WriteResult
} from '../../../shared/files'
import type { LaunchResult } from '../../../shared/shortcuts'
import { api } from './api'
import { tabKeyOf } from './diff-view'
import {
  currentSummary,
  failureText,
  foundPrs,
  refOf,
  type PrFailure,
  type PrSearches
} from './pr-lookup'
import { prKey, revisionBanner } from './pr-view'
import type { UsePrLookup } from './use-pr-lookup'

/**
 * The revision that was latest when a PR diff's sides were asked for: what a
 * new thread on that diff is anchored against (FPRA-27; T1, S2).
 */
export interface SidesRevision {
  revision: string
  /** Azure DevOps' own: the iteration a new thread names (FPRA-27). */
  ado?: { iteration: number }
}

/** One PR file's two sides, and the revision that was latest when they were asked for. */
export interface PrSidesEntry extends SidesRevision {
  /** null while the read is in flight. */
  sides: DiffSides | null
}

/**
 * What only the Pull request mode holds for one worktree, in memory while the
 * app runs. The pull requests themselves — searches, details, the pick, the
 * rate-limit memory — live in the lookup it shares with the status bar (F6).
 * The mode itself persists with the others (FXPL-13); the choice among
 * several pull requests does not outlive the session (FPRA-04).
 */
interface WorktreePr {
  /**
   * PR diff sides by tab key (`pr:<prKey>:<path>`), each with the revision it
   * was read at (FPRA-34, FPRG-25).
   */
  sides: Record<string, PrSidesEntry>
}

const EMPTY: WorktreePr = { sides: {} }

export interface UsePullRequest {
  /** What each provider's search found, or why it has nothing; empty before the first search ends. */
  searches: PrSearches
  /** Every pull request any provider found, for the picker (FPRA-04, FPRG-07). */
  prs: PrSummary[]
  /** The pull request shown: the only one found, or the one picked among several. */
  current: PrSummary | null
  detail: PrDetail | null
  failure: PrFailure | null
  notice: string | null
  loading: boolean
  /** A reload found another revision than the open diffs show (FPRA-34, FPRG-25). */
  newIteration: boolean
  /** Shows one of several pull requests, remembered for this worktree (FPRA-04). */
  choose: (pr: PrRef) => void
  /** The refresh button: search again and read the pull request again (FPRA-33). */
  refresh: () => void
  /** The banner's action: the open diffs re-read at the latest revision (FPRA-34). */
  reloadDiffs: () => void
  /** The sides one PR diff tab shows, by its tab key. */
  sidesFor: (key: string) => PrSidesEntry | undefined
  /** Reads one file's two sides from the provider, once per revision (FPRA-16). */
  readSides: (pr: PrRef, file: PrFile) => void
  /** The four writes (FPRA-25/26/27/29); each is called only from a user's click (FPRA-32). */
  reply: (
    threadId: PrThreadView['id'],
    rootCommentId: number,
    content: string
  ) => Promise<WriteResult>
  /** A thread's new state, in its provider's terms (FPRA-26, FPRG-17). */
  setThreadState: (thread: PrThreadView, intent: ThreadStateIntent) => Promise<WriteResult>
  startThread: (
    file: PrFile,
    selection: PrSelection,
    at: SidesRevision,
    content: string
  ) => Promise<WriteResult>
  comment: (content: string) => Promise<WriteResult>
  /** Opens the pull request's page in the browser; main builds the URL (FPRA-14). */
  openInBrowser: () => Promise<LaunchResult>
  /** Opens one provider's create page for the branch (FPRA-05). */
  createPr: (provider: PrProvider) => Promise<LaunchResult>
  /** Opens a rendered markdown link; main refuses anything but https (FPRA-23). */
  openLink: (href: string) => Promise<LaunchResult>
}

/**
 * The Pull request mode's state (F4), per worktree.
 *
 * The providers are read on these occasions and no other (FPRA-33/35):
 * entering the mode, the window regaining focus — debounced by 5 s in the
 * shared lookup, as App debounces its own focus refresh — after each
 * successful write, and the refresh button; the lookup adds a selection and
 * the TopBar Refresh for the status bar (SPRL-01, 02). No timer ever starts a
 * request. Writes go out only through the four write functions, which the
 * views call from a click or Ctrl+Enter (FPRA-32).
 *
 * A write that succeeded is applied to what is on screen at once, so a reload
 * that fails afterwards leaves it visible, with a notice that the pull request
 * could not be refreshed (edge case).
 */
export function usePullRequest({
  worktreePath,
  active,
  lookup
}: {
  worktreePath: string | null
  /** The Files direction is showing, in Pull request mode. */
  active: boolean
  /** The lookup App shares with the status bar (F6). */
  lookup: UsePrLookup
}): UsePullRequest {
  const { load, choose: chooseIn, amend } = lookup
  const [byWorktree, setByWorktree] = useState<Record<string, WorktreePr>>({})
  const here = (worktreePath && byWorktree[worktreePath]) || EMPTY
  const entry = lookup.entryFor(worktreePath)
  const prs = foundPrs(entry.searches)
  const listed = currentSummary(prs, entry.chosen)
  // A pull request the search no longer lists stays on screen and is read
  // once more, so one completed or abandoned elsewhere says so (edge case).
  const shownRef = listed ?? entry.shown
  const read = shownRef ? entry.reads[prKey(shownRef)] : undefined
  const detail = read?.detail ?? null
  // What is on screen stays, with a notice, rather than being replaced by an
  // error about a refresh (edge case).
  const failure = read && !read.detail ? read.failure : null
  const notice =
    read?.detail && read.failure
      ? `${read.afterWrite ? 'Posted, but the' : 'The'} pull request could not be refreshed: ${failureText(read.failure)}`
      : null

  const live = useRef({ byWorktree })
  useEffect(() => {
    live.current = { byWorktree }
  })

  const patch = useCallback(
    (wt: string, change: (state: WorktreePr) => Partial<WorktreePr>): void => {
      setByWorktree((prev) => {
        const current = prev[wt] ?? EMPTY
        return { ...prev, [wt]: { ...current, ...change(current) } }
      })
    },
    []
  )

  // FPRA-33: entering the mode, or arriving at another worktree while in it.
  // The lookup the bar runs for the same selection is joined, not repeated.
  useEffect(() => {
    if (!active || !worktreePath) return
    void load(worktreePath, { search: true, userDriven: true })
  }, [active, worktreePath, load])

  const choose = useCallback(
    (pr: PrRef): void => {
      if (worktreePath) chooseIn(worktreePath, pr)
    },
    [worktreePath, chooseIn]
  )

  const refresh = useCallback((): void => {
    if (worktreePath) void load(worktreePath, { search: true, userDriven: true })
  }, [worktreePath, load])

  const reloadDiffs = useCallback((): void => {
    if (!worktreePath || !detail) return
    const prefix = `pr:${prKey(detail)}:`
    patch(worktreePath, (state) => ({
      // Dropping the sides is the re-read: an open PR diff asks for sides it
      // does not hold, at the revision that is latest now.
      sides: Object.fromEntries(
        Object.entries(state.sides).filter(([key]) => !key.startsWith(prefix))
      )
    }))
  }, [worktreePath, detail, patch])

  const readSides = useCallback(
    (pr: PrRef, file: PrFile): void => {
      if (!worktreePath) return
      const wt = worktreePath
      const state = live.current.byWorktree[wt] ?? EMPTY
      const key = tabKeyOf({ kind: 'pr-diff', pr, path: file.path })
      if (state.sides[key]) return
      const at: SidesRevision = { revision: detail?.revision ?? '' }
      if (detail?.ado) at.ado = detail.ado
      patch(wt, (s) => ({ sides: { ...s.sides, [key]: { ...at, sides: null } } }))
      const request = {
        worktreePath: wt,
        pr: { target: pr.target, id: pr.id },
        path: file.path,
        oldPath: file.oldPath
      }
      // GitHub reads the head side from the head repository, then from the
      // base repository when the fork is gone (FPRG-12, edge case).
      const read =
        pr.target.provider === 'github'
          ? api.invoke('github-pr:file-sides', request)
          : api.invoke('ado-pr:file-sides', request)
      read
        .catch(
          (err: unknown): DiffSides => ({
            original: { kind: 'error', message: messageOf(err) },
            modified: { kind: 'error', message: messageOf(err) },
            eolChanged: []
          })
        )
        .then((sides) =>
          patch(wt, (s) => {
            // A reload of the diffs dropped this entry while it was in flight.
            if (!s.sides[key]) return {}
            return { sides: { ...s.sides, [key]: { ...at, sides } } }
          })
        )
    },
    [worktreePath, detail, patch]
  )

  /**
   * One write, then what it changed on screen at once, then a reload of the
   * pull request (FPRA-33). A failure changes nothing: the composer keeps the
   * text and shows the message (FPRA-31).
   */
  const write = useCallback(
    async (send: () => Promise<WriteResult>, apply: (detail: PrDetail) => PrDetail) => {
      if (!worktreePath) return { ok: false, message: 'No worktree is selected.' } as const
      const wt = worktreePath
      const result = await send().catch(
        (err: unknown): WriteResult => ({ ok: false, message: messageOf(err) })
      )
      if (!result.ok) return result
      if (detail) {
        const pr = refOf(detail)
        amend(wt, pr, apply)
        void load(wt, { search: false, userDriven: false, afterWrite: true, only: [pr] })
      }
      return result
    },
    [worktreePath, detail, amend, load]
  )

  const reply = useCallback(
    (
      threadId: PrThreadView['id'],
      rootCommentId: number,
      content: string
    ): Promise<WriteResult> => {
      if (!detail) return noPr()
      const pr = refOf(detail)
      // GitHub answers the root comment alone (FPRG-16); Azure DevOps names the thread too.
      const send =
        pr.target.provider === 'github'
          ? () => api.invoke('github-pr:reply', { pr, rootCommentId, content })
          : typeof threadId === 'number'
            ? () => api.invoke('ado-pr:reply', { pr, threadId, rootCommentId, content })
            : null
      if (send === null) return notAdo()
      return write(send, (d) => ({
        ...d,
        threads: d.threads.map((thread) =>
          thread.id === threadId
            ? { ...thread, comments: [...thread.comments, ownComment(content)] }
            : thread
        )
      }))
    },
    [detail, write]
  )

  const setThreadState = useCallback(
    (thread: PrThreadView, intent: ThreadStateIntent): Promise<WriteResult> => {
      if (!detail) return noPr()
      const threadId = thread.id
      const pr = refOf(detail)
      if (intent.provider === 'github') {
        // GitHub names a thread by its node id (FPRG-17).
        if (typeof threadId !== 'string') return notGitHub()
        const { resolved } = intent
        return write(
          () => api.invoke('github-pr:resolve', { pr, threadId, resolved }),
          (d) => ({
            ...d,
            threads: d.threads.map((shown) =>
              shown.id === threadId
                ? {
                    ...shown,
                    resolution: resolutionOf(intent),
                    // GitHub offers the way back once a thread changed state,
                    // to whoever changed it, until the reload says (T1, S4).
                    can: shown.can && { ...shown.can, resolve: !resolved, reopen: resolved }
                  }
                : shown
            )
          })
        )
      }
      if (typeof threadId !== 'number') return notAdo()
      const { status } = intent
      return write(
        () => api.invoke('ado-pr:status', { pr, threadId, status }),
        (d) => ({
          ...d,
          threads: d.threads.map((shown) =>
            shown.id === threadId
              ? { ...shown, providerStatus: status, resolution: resolutionOf(intent) }
              : shown
          )
        })
      )
    },
    [detail, write]
  )

  const startThread = useCallback(
    (
      file: PrFile,
      selection: PrSelection,
      at: SidesRevision,
      content: string
    ): Promise<WriteResult> => {
      if (!detail) return noPr()
      const pr = refOf(detail)
      const send = threadSender(pr, file, selection, at, content)
      if (send === null) return notAdo()
      return write(send, (d) => ({
        ...d,
        threads: [
          ...d.threads,
          ownThread(content, {
            kind: 'placed',
            path: file.path,
            side: 'right',
            startLine: Math.min(selection.startLine, selection.endLine),
            endLine: Math.max(selection.startLine, selection.endLine)
          })
        ]
      }))
    },
    [detail, write]
  )

  const comment = useCallback(
    (content: string): Promise<WriteResult> => {
      if (!detail) return noPr()
      const pr = refOf(detail)
      // On GitHub a general comment is a PR comment, read back in the timeline
      // with no Reply or Resolve (FPRG-23, D4); on Azure DevOps a general thread.
      if (pr.target.provider === 'github') {
        return write(
          () => api.invoke('github-pr:comment', { pr, content }),
          (d) => ({
            ...d,
            timeline: [...(d.timeline ?? []), { author: 'You', at: Date.now(), content }]
          })
        )
      }
      return write(
        () => api.invoke('ado-pr:comment', { pr, content }),
        (d) => ({ ...d, threads: [...d.threads, ownThread(content, { kind: 'general' })] })
      )
    },
    [detail, write]
  )

  const openInBrowser = useCallback((): Promise<LaunchResult> => {
    if (!worktreePath || !detail) return Promise.resolve({ ok: false, error: 'No pull request.' })
    const pr = refOf(detail)
    return pr.target.provider === 'github'
      ? api.invoke('github-pr:open', { worktreePath, pr })
      : api.invoke('ado-pr:open', { worktreePath, pr })
  }, [worktreePath, detail])

  const createPr = useCallback(
    (provider: PrProvider): Promise<LaunchResult> => {
      if (!worktreePath) return Promise.resolve({ ok: false, error: 'No worktree is selected.' })
      // GitHub's compare page on the target repository (FPRG-08); main builds it.
      return provider === 'github'
        ? api.invoke('github-pr:open', { worktreePath, create: true })
        : api.invoke('ado-pr:open', { worktreePath, create: true })
    },
    [worktreePath]
  )

  const openLink = useCallback(
    (href: string): Promise<LaunchResult> => api.invoke('pr:open-link', { href }),
    []
  )

  const sidesFor = useCallback((key: string) => here.sides[key], [here.sides])

  return {
    searches: entry.searches,
    prs,
    current: listed ?? detail,
    detail,
    failure,
    notice,
    loading: entry.loading,
    newIteration: detail !== null && behind(here.sides, detail),
    choose,
    refresh,
    reloadDiffs,
    sidesFor,
    readSides,
    reply,
    setThreadState,
    startThread,
    comment,
    openInBrowser,
    createPr,
    openLink
  }
}

/**
 * Whether an open diff of this pull request was read at another revision than
 * the latest (FPRA-34, FPRG-25). Diffs read at an older revision stay as they
 * are until the banner is answered; with none open there is nothing to be
 * behind.
 */
function behind(sides: Record<string, PrSidesEntry>, detail: PrDetail): boolean {
  const prefix = `pr:${prKey(detail)}:`
  return Object.entries(sides).some(
    ([key, entry]) => key.startsWith(prefix) && revisionBanner(entry.revision, detail.revision)
  )
}

/**
 * The write that posts an anchored thread on the provider the pull request
 * names, or null when what it needs is missing. GitHub anchors it at the head
 * commit on screen, which is a GitHub PR's revision (FPRG-19, design N2);
 * Azure DevOps at the iteration on screen and the file's change tracking id
 * (FPRA-27).
 */
function threadSender(
  pr: PrRef,
  file: PrFile,
  selection: PrSelection,
  at: SidesRevision,
  content: string
): (() => Promise<WriteResult>) | null {
  if (pr.target.provider === 'github') {
    const headSha = at.revision
    return () => api.invoke('github-pr:thread', { pr, headSha, selection, content })
  }
  const changeTrackingId = file.changeTrackingId
  if (at.ado === undefined || changeTrackingId === undefined) return null
  const iteration = at.ado.iteration
  return () => api.invoke('ado-pr:thread', { pr, iteration, changeTrackingId, selection, content })
}

/**
 * Whether a thread is open or done once a state change is applied (FPRA-20).
 * Azure DevOps' Active and Pending are open, as main reads them; its other
 * statuses are resolved. GitHub's thread is resolved or not.
 */
export function resolutionOf(intent: ThreadStateIntent): PrThreadView['resolution'] {
  if (intent.provider === 'github') return intent.resolved ? 'resolved' : 'active'
  return intent.status === 'active' || intent.status === 'pending' ? 'active' : 'resolved'
}

/**
 * What a successful write put on the pull request, shown until the reload
 * brings the provider's own copy. A negative id cannot collide with one the
 * provider assigned.
 */
function ownComment(content: string): PrComment {
  return { id: -Date.now(), author: 'You', content, at: Date.now() }
}

function ownThread(content: string, place: PrThreadView['place']): PrThreadView {
  const first = ownComment(content)
  return {
    id: first.id,
    rootCommentId: first.id,
    resolution: 'active',
    providerStatus: 'active',
    comments: [first],
    place
  }
}

function noPr(): Promise<WriteResult> {
  return Promise.resolve({ ok: false, message: 'No pull request is open.' })
}

/** A write only Azure DevOps takes, asked of something that is not Azure DevOps'. */
function notAdo(): Promise<WriteResult> {
  return Promise.resolve({ ok: false, message: 'This pull request is not on Azure DevOps.' })
}

/** A write only GitHub takes, asked of something that is not GitHub's. */
function notGitHub(): Promise<WriteResult> {
  return Promise.resolve({ ok: false, message: 'This pull request is not on GitHub.' })
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
