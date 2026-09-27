import { useCallback, useEffect, useState } from 'react'
import type { PeriodTaskChoice, TimeEditResult, TimeSnapshot } from '../../../shared/time'
import { api } from './api'

const EMPTY: TimeSnapshot = { periods: [], open: [], paused: [] }

export interface UseTime {
  snapshot: TimeSnapshot
  pause: (sessionId: string) => void
  resume: (sessionId: string) => void
  /** Resolves with main's verdict; the snapshot is refetched either way (TIME-49). */
  deletePeriod: (id: string) => Promise<TimeEditResult>
  adjustPeriod: (id: string, start: string, end: string) => Promise<TimeEditResult>
  /** Sets a closed period's task (HTSK-25..27); refetches like the edits above (HTSK-35). */
  reassignPeriod: (id: string, choice: PeriodTaskChoice) => Promise<TimeEditResult>
  /** Splits a closed period at a UTC ISO instant (HTSK-28); refetches (HTSK-35). */
  splitPeriod: (id: string, at: string) => Promise<TimeEditResult>
}

/**
 * Holds main's time snapshot and refetches it on every `time:changed` push.
 * It does not tick: components that show a live counter call `useNow`, so App
 * does not re-render every second.
 */
export function useTime(): UseTime {
  const [snapshot, setSnapshot] = useState<TimeSnapshot>(EMPTY)

  const refresh = useCallback((): void => {
    api.invoke('time:snapshot').then(setSnapshot).catch(console.error)
  }, [])

  useEffect(() => {
    refresh()
    return api.on('time:changed', refresh)
  }, [refresh])

  const pause = useCallback((sessionId: string): void => {
    api.invoke('time:pause', { sessionId }).catch(console.error)
  }, [])

  const resume = useCallback((sessionId: string): void => {
    api.invoke('time:resume', { sessionId }).catch(console.error)
  }, [])

  const deletePeriod = useCallback(
    (id: string): Promise<TimeEditResult> => api.invoke('time:delete', { id }).finally(refresh),
    [refresh]
  )

  const adjustPeriod = useCallback(
    (id: string, start: string, end: string): Promise<TimeEditResult> =>
      api.invoke('time:adjust', { id, start, end }).finally(refresh),
    [refresh]
  )

  const reassignPeriod = useCallback(
    (id: string, choice: PeriodTaskChoice): Promise<TimeEditResult> =>
      api.invoke('time:reassign', { id, choice }).finally(refresh),
    [refresh]
  )

  const splitPeriod = useCallback(
    (id: string, at: string): Promise<TimeEditResult> =>
      api.invoke('time:split', { id, at }).finally(refresh),
    [refresh]
  )

  return { snapshot, pause, resume, deletePeriod, adjustPeriod, reassignPeriod, splitPeriod }
}

/** `Date.now()`, refreshed every `intervalMs`; a null interval stops ticking. */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const tick = (): void => setNow(Date.now())
    // Catch up at once when ticking (re)starts, so a counter that stood still
    // does not show a stale value for a whole interval. Deferred, not called
    // synchronously, so the effect never sets state in its own body.
    const catchUp = setTimeout(tick, 0)
    const timer = intervalMs === null ? undefined : setInterval(tick, intervalMs)
    return () => {
      clearTimeout(catchUp)
      clearInterval(timer)
    }
  }, [intervalMs])

  return now
}
