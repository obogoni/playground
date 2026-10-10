import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AdoThreadStatus,
  DiffSides,
  PrComment,
  PrDetail,
  PrDetailResult,
  PrFile,
  PrRef,
  PrSearch,
  PrSelection,
  PrSummary,
  PrThreadView,
  WriteResult
} from '../../../shared/files'
import type { LaunchResult } from '../../../shared/shortcuts'
import { api } from './api'
import { tabKeyOf } from './diff-view'
import { newIterationBanner } from './pr-view'
import { useLatestCallback } from './use-latest-callback'

/** How long a focus reload waits out another focus (FPRA-33), as App does for its own. */
const FOCUS_RELOAD_MS = 5000

/** One PR file's two sides, and the iteration that was latest when they were asked for. */
export interface PrSidesEntry {
  /** null while the read is in flight. */
  sides: DiffSides | null
  /** What a new thread on this diff is anchored against (FPRA-27; T1, S2). */
  iteration: number
}

/** Why a pull request could not be read: the "run `az login`" state, or an error. */
export type PrFailure = { kind: 'auth' } | { kind: 'error'; message: string }

/**
 * Everything the Pull request mode holds for one worktree, in memory while the
 * app runs. The mode itself persists with the others (FXPL-13); the choice
 * among several pull requests does not outlive the session (FPRA-04).
 */
interface WorktreePr {
  search: PrSearch | null
  /** The pull request picked among several (FPRA-04). */
  chosen: PrRef | null
  detail: PrDetail | null
  /** Why the detail could not be read, when there is none to show. */
  failure: PrFailure | null
  /** A reload failed while a pull request was on screen; it stays on screen (edge case). */
  notice: string | null
  loading: boolean
  /** The iteration the open PR diffs were read at (FPRA-34). */
  onScreen: number | null
  /** PR diff sides by tab key (`pr:<id>:<path>`). */
  sides: Record<string, PrSidesEntry>
}

const EMPTY: WorktreePr = {
  search: null,
  chosen: null,
  detail: null,
  failure: null,
  notice: null,
  loading: false,
  onScreen: null,
  sides: {}
}

export interface UsePullRequest {
  /** What the search found, or why there is nothing; null before the first search ends. */
  search: PrSearch | null
  /** The pull request shown: the only one found, or the one picked among several. */
  current: PrSummary | null
  detail: PrDetail | null
  failure: PrFailure | null
  notice: string | null
  loading: boolean
  /** A reload found a newer iteration than the open diffs show (FPRA-34). */
  newIteration: boolean
  /** Shows one of several pull requests, remembered for this worktree (FPRA-04). */
  choose: (pr: PrRef) => void
  /** The refresh button: search again and read the pull request again (FPRA-33). */
  refresh: () => void
  /** The banner's action: the open diffs re-read at the latest iteration (FPRA-34). */
  reloadDiffs: () => void
  /** The sides one PR diff tab shows, by its tab key. */
  sidesFor: (key: string) => PrSidesEntry | undefined
  /** Reads one file's two sides from the provider, once per iteration (FPRA-16). */
  readSides: (pr: PrRef, file: PrFile) => void
  /** The four writes (FPRA-25/26/27/29); each is called only from a user's click (FPRA-32). */
  reply: (threadId: number, rootCommentId: number, content: string) => Promise<WriteResult>
  setStatus: (threadId: number, status: Exclude<AdoThreadStatus, 'unknown'>) => Promise<WriteResult>
  startThread: (
    file: PrFile,
    selection: PrSelection,
    iteration: number,
    content: string
  ) => Promise<WriteResult>
  comment: (content: string) => Promise<WriteResult>
  /** Opens the pull request's page in the browser; main builds the URL (FPRA-14). */
  openInBrowser: () => Promise<LaunchResult>
  /** Opens the provider's create page for the branch (FPRA-05). */
  createPr: () => Promise<LaunchResult>
  /** Opens a rendered markdown link; main refuses anything but https (FPRA-23). */
  openLink: (href: string) => Promise<LaunchResult>
}

/**
 * The Pull request mode's state (F4), per worktree.
 *
 * Azure DevOps is read on four occasions and no other (FPRA-33/35): entering
 * the mode, the window regaining focus — debounced by 5 s, as App debounces
 * its own focus refresh — after each successful write, and the refresh button.
 * No timer ever starts a request. Writes go out only through the four write
 * functions, which the views call from a click or Ctrl+Enter (FPRA-32).
 *
 * A write that succeeded is applied to what is on screen at once, so a reload
 * that fails afterwards leaves it visible, with a notice that the pull request
 * could not be refreshed (edge case).
 */
export function usePullRequest({
  worktreePath,
  active
}: {
  worktreePath: string | null
  /** The Files direction is showing, in Pull request mode. */
  active: boolean
}): UsePullRequest {
  const [byWorktree, setByWorktree] = useState<Record<string, WorktreePr>>({})
  const here = (worktreePath && byWorktree[worktreePath]) || EMPTY

  const live = useRef({ byWorktree })
  useEffect(() => {
    live.current = { byWorktree }
  })
  // The latest load per worktree; an answer to an older one is dropped.
  const loads = useRef(new Map<string, number>())

  const patch = useCallback(
    (wt: string, change: (state: WorktreePr) => Partial<WorktreePr>): void => {
      setByWorktree((prev) => {
        const current = prev[wt] ?? EMPTY
        return { ...prev, [wt]: { ...current, ...change(current) } }
      })
    },
    []
  )

  /**
   * One reload: the search when asked for, then the pull request it points at.
   * A pull request on screen that the search no longer lists is read once
   * more, so a pull request completed or abandoned elsewhere says so instead
   * of turning into "no pull request" (edge case). `chosen` is a pick made
   * just now, which the state read here does not hold yet.
   */
  const load = useLatestCallback(
    async (wt: string, withSearch: boolean, afterWrite: boolean, chosen?: PrRef): Promise<void> => {
      const ticket = (loads.current.get(wt) ?? 0) + 1
      loads.current.set(wt, ticket)
      const stale = (): boolean => loads.current.get(wt) !== ticket
      const before = live.current.byWorktree[wt] ?? EMPTY
      patch(wt, () => ({ loading: true }))

      let search = before.search
      if (withSearch) {
        search = await api
          .invoke('ado-pr:find', { worktreePath: wt })
          .catch((err: unknown): PrSearch => ({ kind: 'error', message: messageOf(err) }))
        if (stale()) return
        patch(wt, () => ({ search }))
      }

      const shown = before.detail
      const pr = currentOf(search, chosen ?? before.chosen) ?? (shown ? refOf(shown) : null)
      if (pr === null) {
        patch(wt, () => ({ detail: null, failure: null, notice: null, loading: false }))
        return
      }

      const result = await api
        .invoke('ado-pr:get', { worktreePath: wt, pr })
        .catch((err: unknown): PrDetailResult => ({ kind: 'error', message: messageOf(err) }))
      if (stale()) return

      if (result.kind === 'ok') {
        const detail = result.detail
        patch(wt, (state) => {
          const samePr = state.detail !== null && sameRef(refOf(state.detail), detail)
          // Diffs read at an older iteration stay as they are until the banner
          // is answered; with none open there is nothing to be behind.
          const hasDiffs = Object.keys(state.sides).some((key) =>
            key.startsWith(`pr:${detail.id}:`)
          )
          return {
            detail,
            failure: null,
            notice: null,
            loading: false,
            onScreen: samePr && hasDiffs ? state.onScreen : detail.iteration
          }
        })
        return
      }

      const failure: PrFailure =
        result.kind === 'auth' ? { kind: 'auth' } : { kind: 'error', message: result.message }
      patch(wt, (state) => {
        // What is on screen stays, with a notice, rather than being replaced
        // by an error about a refresh (edge case).
        if (state.detail !== null && sameRef(refOf(state.detail), pr)) {
          const why =
            failure.kind === 'auth' ? 'Azure DevOps sign-in failed — run az login' : failure.message
          return {
            loading: false,
            notice: `${afterWrite ? 'Posted, but the' : 'The'} pull request could not be refreshed: ${why}`
          }
        }
        return { detail: null, failure, notice: null, loading: false }
      })
    }
  )

  // FPRA-33: entering the mode, or arriving at another worktree while in it.
  useEffect(() => {
    if (!active || !worktreePath) return
    void load(worktreePath, true, false)
  }, [active, worktreePath, load])

  // FPRA-33: the window regaining focus, debounced against focus flapping.
  const target = useRef({ active, worktreePath })
  useEffect(() => {
    target.current = { active, worktreePath }
  })
  const lastFocusAt = useRef(0)
  useEffect(() => {
    const onFocus = (): void => {
      const now = Date.now()
      if (now - lastFocusAt.current < FOCUS_RELOAD_MS) return
      lastFocusAt.current = now
      const { active: on, worktreePath: wt } = target.current
      if (on && wt) void load(wt, true, false)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const choose = useCallback(
    (pr: PrRef): void => {
      if (!worktreePath) return
      const wt = worktreePath
      const chosen = refOf(pr)
      patch(wt, () => ({ chosen }))
      void load(wt, false, false, chosen)
    },
    [worktreePath, patch, load]
  )

  const refresh = useCallback((): void => {
    if (worktreePath) void load(worktreePath, true, false)
  }, [worktreePath, load])

  const reloadDiffs = useCallback((): void => {
    if (!worktreePath) return
    patch(worktreePath, (state) => {
      if (!state.detail) return {}
      const prefix = `pr:${state.detail.id}:`
      // Dropping the sides is the re-read: an open PR diff asks for sides it
      // does not hold, at the iteration that is latest now.
      const sides = Object.fromEntries(
        Object.entries(state.sides).filter(([key]) => !key.startsWith(prefix))
      )
      return { sides, onScreen: state.detail.iteration }
    })
  }, [worktreePath, patch])

  const readSides = useCallback(
    (pr: PrRef, file: PrFile): void => {
      if (!worktreePath) return
      const wt = worktreePath
      const state = live.current.byWorktree[wt] ?? EMPTY
      const key = tabKeyOf({ kind: 'pr-diff', id: pr.id, path: file.path })
      if (state.sides[key]) return
      const iteration = state.detail?.iteration ?? 0
      patch(wt, (s) => ({ sides: { ...s.sides, [key]: { sides: null, iteration } } }))
      api
        .invoke('ado-pr:file-sides', {
          worktreePath: wt,
          pr: { target: pr.target, id: pr.id },
          path: file.path,
          oldPath: file.oldPath
        })
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
            return { sides: { ...s.sides, [key]: { sides, iteration } } }
          })
        )
    },
    [worktreePath, patch]
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
      patch(wt, (state) => (state.detail ? { detail: apply(state.detail) } : {}))
      void load(wt, false, true)
      return result
    },
    [worktreePath, patch, load]
  )

  const detail = here.detail

  const reply = useCallback(
    (threadId: number, rootCommentId: number, content: string): Promise<WriteResult> => {
      if (!detail) return noPr()
      const pr = refOf(detail)
      return write(
        () => api.invoke('ado-pr:reply', { pr, threadId, rootCommentId, content }),
        (d) => ({
          ...d,
          threads: d.threads.map((thread) =>
            thread.id === threadId
              ? { ...thread, comments: [...thread.comments, ownComment(content)] }
              : thread
          )
        })
      )
    },
    [detail, write]
  )

  const setStatus = useCallback(
    (threadId: number, status: Exclude<AdoThreadStatus, 'unknown'>): Promise<WriteResult> => {
      if (!detail) return noPr()
      const pr = refOf(detail)
      return write(
        () => api.invoke('ado-pr:status', { pr, threadId, status }),
        (d) => ({
          ...d,
          threads: d.threads.map((thread) =>
            thread.id === threadId
              ? { ...thread, providerStatus: status, resolution: resolutionOf(status) }
              : thread
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
      iteration: number,
      content: string
    ): Promise<WriteResult> => {
      if (!detail) return noPr()
      const pr = refOf(detail)
      return write(
        () =>
          api.invoke('ado-pr:thread', {
            pr,
            iteration,
            changeTrackingId: file.changeTrackingId,
            selection,
            content
          }),
        (d) => ({
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
        })
      )
    },
    [detail, write]
  )

  const comment = useCallback(
    (content: string): Promise<WriteResult> => {
      if (!detail) return noPr()
      const pr = refOf(detail)
      return write(
        () => api.invoke('ado-pr:comment', { pr, content }),
        (d) => ({ ...d, threads: [...d.threads, ownThread(content, { kind: 'general' })] })
      )
    },
    [detail, write]
  )

  const openInBrowser = useCallback((): Promise<LaunchResult> => {
    if (!worktreePath || !detail) return Promise.resolve({ ok: false, error: 'No pull request.' })
    return api.invoke('ado-pr:open', { worktreePath, pr: refOf(detail) })
  }, [worktreePath, detail])

  const createPr = useCallback((): Promise<LaunchResult> => {
    if (!worktreePath) return Promise.resolve({ ok: false, error: 'No worktree is selected.' })
    return api.invoke('ado-pr:open', { worktreePath, create: true })
  }, [worktreePath])

  const openLink = useCallback(
    (href: string): Promise<LaunchResult> => api.invoke('ado-pr:open-link', { href }),
    []
  )

  const sidesFor = useCallback((key: string) => here.sides[key], [here.sides])

  return {
    search: here.search,
    current: currentSummary(here.search, here.chosen) ?? detail,
    detail,
    failure: here.failure,
    notice: here.notice,
    loading: here.loading,
    newIteration: detail !== null && newIterationBanner(here.onScreen, detail.iteration),
    choose,
    refresh,
    reloadDiffs,
    sidesFor,
    readSides,
    reply,
    setStatus,
    startThread,
    comment,
    openInBrowser,
    createPr,
    openLink
  }
}

/** The pull request a search points at: the only one, or the one picked among several. */
function currentSummary(search: PrSearch | null, chosen: PrRef | null): PrSummary | null {
  if (search?.kind !== 'found') return null
  if (search.prs.length === 1) return search.prs[0]
  return chosen ? (search.prs.find((pr) => sameRef(pr, chosen)) ?? null) : null
}

function currentOf(search: PrSearch | null, chosen: PrRef | null): PrRef | null {
  const summary = currentSummary(search, chosen)
  return summary ? refOf(summary) : null
}

function refOf(pr: PrRef): PrRef {
  return { target: pr.target, id: pr.id }
}

function sameRef(a: PrRef, b: PrRef): boolean {
  return (
    a.id === b.id &&
    a.target.org.toLowerCase() === b.target.org.toLowerCase() &&
    a.target.project.toLowerCase() === b.target.project.toLowerCase() &&
    a.target.repo.toLowerCase() === b.target.repo.toLowerCase()
  )
}

/**
 * Azure DevOps' resolved statuses, as main reads them: Active, Pending and a
 * thread with no status are open (FPRA-20).
 */
function resolutionOf(status: AdoThreadStatus): PrThreadView['resolution'] {
  return status === 'active' || status === 'pending' || status === 'unknown' ? 'active' : 'resolved'
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

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
