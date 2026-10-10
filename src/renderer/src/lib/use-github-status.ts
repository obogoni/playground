import { useEffect, useRef, useState } from 'react'
import type { GhStatus } from '../../../shared/files'
import { api } from './api'
import { FOCUS_RELOAD_MS } from './use-pr-lookup'

/**
 * The `gh` CLI's state for the TopBar chip (FPRG-02, 05): asked of main on
 * mount and again whenever the window regains focus, debounced by 5 s as the
 * Pull request mode debounces its own focus reload. Main answers
 * `no-github-remote` without starting `gh` when no registered repository has
 * a GitHub remote; the chip is hidden then, and while the first answer is
 * still on its way (null).
 */
export function useGitHubStatus(): GhStatus | null {
  const [status, setStatus] = useState<GhStatus | null>(null)
  const lastAskedAt = useRef(0)

  useEffect(() => {
    let live = true
    const ask = (): void => {
      lastAskedAt.current = Date.now()
      api
        .invoke('github:status')
        .then((next) => {
          if (live) setStatus(next)
        })
        .catch(console.error)
    }
    const onFocus = (): void => {
      if (Date.now() - lastAskedAt.current < FOCUS_RELOAD_MS) return
      ask()
    }
    ask()
    window.addEventListener('focus', onFocus)
    return () => {
      live = false
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return status
}
