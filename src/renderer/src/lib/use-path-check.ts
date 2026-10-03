import { useEffect, useState } from 'react'
import type { PathCheckRequest } from '../../../shared/worktrees'
import { api } from './api'
import type { PathCheckAnswer } from './path-check'
import { PATH_CHECK_DELAY_MS, pathCheckKey, problemFor } from './path-check'

/** What a dialog asks: the create's values, never `onExisting` (that is the create's own). */
export type PathCheckAsk = Omit<PathCheckRequest, 'onExisting'>

/**
 * Asks main whether the dialog's name would pass a path limit (BSLG-17..30),
 * 250 ms after the last change to its values (BSLG-23), and returns the
 * answer's message only while it belongs to the values shown now (BSLG-42).
 * A null request (no repository, blank branch) asks nothing and returns null.
 * While an answer is pending it returns null: the create re-checks in main.
 */
export function usePathCheck(req: PathCheckAsk | null): string | null {
  const [answer, setAnswer] = useState<PathCheckAnswer | null>(null)
  const repoPath = req?.repoPath
  const branch = req?.branch
  const baseBranch = req?.baseBranch
  const worktreeTemplate = req?.worktreeTemplate

  useEffect(() => {
    if (repoPath === undefined || branch === undefined) return
    const ask: PathCheckAsk = { repoPath, branch, baseBranch, worktreeTemplate }
    const key = pathCheckKey(ask)
    let stale = false
    const timer = setTimeout(() => {
      api
        .invoke('worktrees:check-paths', ask)
        .then(({ problem }) => {
          if (!stale) setAnswer({ key, problem })
        })
        // A failed ask stores no answer; the create still runs the check.
        .catch(console.error)
    }, PATH_CHECK_DELAY_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [repoPath, branch, baseBranch, worktreeTemplate])

  return req === null ? null : problemFor(answer, pathCheckKey(req))
}
