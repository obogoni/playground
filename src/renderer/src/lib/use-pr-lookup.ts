import { useCallback, useEffect, useRef, useState } from 'react'
import type { PrDetail, PrDetailResult, PrProvider, PrRef, PrSearch } from '../../../shared/files'
import { api } from './api'
import {
  EMPTY_LOOKUP,
  joinsRunning,
  landRead,
  landSearches,
  providersToAsk,
  prsToRead,
  refOf,
  type PrLookupEntry,
  type PrSearches
} from './pr-lookup'
import { prKey } from './pr-view'
import { useLatestCallback } from './use-latest-callback'

/** How long a focus reload waits out another focus (FPRA-33, FPRG-05, SPRL-02), as App does for its own. */
export const FOCUS_RELOAD_MS = 5000

/** How one lookup came about (FPRA-33, FPRG-26). */
export interface LookupHow {
  /** Search the providers again before reading the pull requests. */
  search: boolean
  /** The user asked for it — a selection, entering the mode, a pick, Refresh — not a focus or a write. */
  userDriven: boolean
  /** It follows a successful write, which the mode's notice says. */
  afterWrite?: boolean
  /** Read only these pull requests, not every one the searches found: a pick, a write. */
  only?: PrRef[]
}

export interface UsePrLookup {
  /** One worktree's searches, reads and pick; empty before its first lookup. */
  entryFor: (worktreePath: string | null) => PrLookupEntry
  /** One lookup for a worktree; its answers land in that worktree's entry, whichever is selected by then. */
  load: (worktreePath: string, how: LookupHow) => Promise<void>
  /** Refresh: search again and read every pull request, for the bar's worktree (SPRL-02). */
  refresh: () => void
  /** Picks one of several pull requests for a worktree and reads it (FPRA-04, SPRL-10, 13). */
  choose: (worktreePath: string, pr: PrRef) => void
  /** Applies what a successful write changed to the detail on screen, until the reload brings the provider's copy. */
  amend: (worktreePath: string, pr: PrRef, apply: (detail: PrDetail) => PrDetail) => void
}

interface Running {
  promise: Promise<void>
  userDriven: boolean
}

/**
 * The pull request lookup the status bar and the Pull request mode share
 * (F6), per worktree, in memory while the app runs. App mounts it above the
 * direction switch, so both surfaces read one cache and never double the
 * calls or disagree.
 *
 * A lookup searches both providers at once, each into its own entry, so one
 * that fails hides none of the other's pull requests (FPRG-07), then reads
 * every pull request found in full, for its reviewers. It runs when the bar's
 * worktree changes, when the window regains focus — debounced by 5 s — on
 * Refresh, and when the Pull request mode asks: entering it, a pick, its own
 * refresh, after a write (FPRA-33, SPRL-01, 02). No timer ever starts one.
 *
 * Each worktree's latest lookup wins: an answer to an older one is dropped,
 * and an answer always lands in its own worktree's entry, so a late answer
 * never paints another worktree (edge case). A search asked while an equal
 * one runs for the same worktree joins it instead of asking again (edge case:
 * the bar and the mode on one worktree).
 */
export function usePrLookup({ target }: { target: string | null }): UsePrLookup {
  const [byWorktree, setByWorktree] = useState<Record<string, PrLookupEntry>>({})

  const live = useRef(byWorktree)
  useEffect(() => {
    live.current = byWorktree
  })
  const loads = useRef(new Map<string, number>())
  const running = useRef(new Map<string, Running>())

  const patch = useCallback((wt: string, change: (entry: PrLookupEntry) => PrLookupEntry): void => {
    setByWorktree((prev) => ({ ...prev, [wt]: change(prev[wt] ?? EMPTY_LOOKUP) }))
  }, [])

  const run = useLatestCallback(async (wt: string, how: LookupHow): Promise<void> => {
    const ticket = (loads.current.get(wt) ?? 0) + 1
    loads.current.set(wt, ticket)
    const stale = (): boolean => loads.current.get(wt) !== ticket
    const before = live.current[wt] ?? EMPTY_LOOKUP
    const { ask, limited } = providersToAsk(before, how.userDriven)
    patch(wt, (entry) => ({ ...entry, loading: true, limited }))

    let known: PrLookupEntry = { ...before, limited }
    if (how.search) {
      const answers = await Promise.all(
        ask.map((provider) =>
          findOn(provider, wt).catch(
            (err: unknown): PrSearch => ({ kind: 'error', message: messageOf(err) })
          )
        )
      )
      if (stale()) return
      const searches: PrSearches = Object.fromEntries(ask.map((p, i) => [p, answers[i]]))
      known = landSearches(known, searches, limited)
      patch(wt, (entry) => landSearches(entry, searches, limited))
    }

    const toRead = how.only
      ? how.only.filter((pr) => !known.limited.includes(pr.target.provider)).map(refOf)
      : prsToRead(known, known.shown ? [known.shown] : [])
    const results = await Promise.all(
      toRead.map((pr) =>
        getOn(wt, pr).catch(
          (err: unknown): PrDetailResult => ({ kind: 'error', message: messageOf(err) })
        )
      )
    )
    if (stale()) return
    patch(wt, (entry) => {
      const landed = toRead.reduce(
        (next, pr, i) => landRead(next, pr, results[i], how.afterWrite),
        entry
      )
      return { ...landed, loading: false }
    })
  })

  const load = useCallback(
    (wt: string, how: LookupHow): Promise<void> => {
      const current = running.current.get(wt)
      if (current && joinsRunning(current, how)) return current.promise
      const promise = run(wt, how)
      if (how.search && !how.only) {
        running.current.set(wt, { promise, userDriven: how.userDriven })
        void promise.finally(() => {
          if (running.current.get(wt)?.promise === promise) running.current.delete(wt)
        })
      }
      return promise
    },
    [run]
  )

  // SPRL-01: the bar's worktree changed — a selection, in any direction.
  useEffect(() => {
    if (target) void load(target, { search: true, userDriven: true })
  }, [target, load])

  // SPRL-02: the window regaining focus, debounced against focus flapping.
  const targetNow = useRef(target)
  useEffect(() => {
    targetNow.current = target
  })
  const lastFocusAt = useRef(0)
  useEffect(() => {
    const onFocus = (): void => {
      const now = Date.now()
      if (now - lastFocusAt.current < FOCUS_RELOAD_MS) return
      lastFocusAt.current = now
      const wt = targetNow.current
      if (wt) void load(wt, { search: true, userDriven: false })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const refresh = useCallback((): void => {
    const wt = targetNow.current
    if (wt) void load(wt, { search: true, userDriven: true })
  }, [load])

  const choose = useCallback(
    (wt: string, pr: PrRef): void => {
      const chosen = refOf(pr)
      patch(wt, (entry) => ({ ...entry, chosen, shown: chosen }))
      void load(wt, { search: false, userDriven: true, only: [chosen] })
    },
    [patch, load]
  )

  const amend = useCallback(
    (wt: string, pr: PrRef, apply: (detail: PrDetail) => PrDetail): void => {
      const key = prKey(pr)
      patch(wt, (entry) => {
        const read = entry.reads[key]
        if (!read?.detail) return entry
        return {
          ...entry,
          reads: { ...entry.reads, [key]: { ...read, detail: apply(read.detail) } }
        }
      })
    },
    [patch]
  )

  const entryFor = useCallback(
    (wt: string | null): PrLookupEntry => (wt && byWorktree[wt]) || EMPTY_LOOKUP,
    [byWorktree]
  )

  return { entryFor, load, refresh, choose, amend }
}

/** One provider's search for the worktree's branch (FPRA-02, FPRG-06). */
function findOn(provider: PrProvider, worktreePath: string): Promise<PrSearch> {
  return provider === 'github'
    ? api.invoke('github-pr:find', { worktreePath })
    : api.invoke('ado-pr:find', { worktreePath })
}

/** One pull request in full, from the provider it names. */
function getOn(worktreePath: string, pr: PrRef): Promise<PrDetailResult> {
  return pr.target.provider === 'github'
    ? api.invoke('github-pr:get', { worktreePath, pr })
    : api.invoke('ado-pr:get', { worktreePath, pr })
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
