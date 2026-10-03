import { useCallback, useEffect, useRef, useState } from 'react'
import type { CreateStep } from '../../../shared/worktrees'
import { api } from './api'
import { acceptsStep, progressLabel } from './create-progress'

export interface UseCreateProgress {
  /** The progress line while a create is in flight; null when none is (CRTO-16, CRTO-17). */
  label: string | null
  /** Start tracking a create: returns the `requestId` to send with it. */
  begin: () => string
  /** The create settled: drop the line and ignore any later step for it (CRTO-17). */
  end: () => void
}

/**
 * The create dialogs' progress line (CRTO-16, CRTO-17). One subscription to
 * `worktrees:create-step` for the dialog's life keeps the last step pushed for
 * the request in flight, and only for it; `begin` names a new request and `end`
 * forgets it, so a late step for a settled create is ignored.
 */
export function useCreateProgress(): UseCreateProgress {
  const requestId = useRef<string | null>(null)
  // null = no create in flight; `step: null` = in flight, no step pushed yet.
  const [progress, setProgress] = useState<{ step: CreateStep | null } | null>(null)

  useEffect(
    () =>
      api.on('worktrees:create-step', (event) => {
        if (!acceptsStep(requestId.current, event)) return
        setProgress({ step: event.step })
      }),
    []
  )

  const begin = useCallback((): string => {
    const id = crypto.randomUUID()
    requestId.current = id
    setProgress({ step: null })
    return id
  }, [])

  const end = useCallback((): void => {
    requestId.current = null
    setProgress(null)
  }, [])

  return { label: progress === null ? null : progressLabel(progress.step), begin, end }
}
