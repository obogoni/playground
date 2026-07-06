import { useCallback, useEffect, useRef, useState } from 'react'
import type { RespondDecision, ScaffoldResult, WorkflowDef } from '../../../shared/workflows'
import { api } from './api'
import { foldRunEvent, type RunView } from './workflow-run-view'

export interface UseWorkflowRuns {
  defs: WorkflowDef[]
  runs: RunView[]
  selectedRunId: string | null
  /** The running/blocked run — serial execution ⇒ at most one. */
  activeRunId: string | null
  error: string | null
  refresh: () => void
  start: (id: string, input: Record<string, string>) => void
  cancel: (runId: string) => void
  respond: (runId: string, decision: RespondDecision) => void
  scaffold: (name: string) => Promise<ScaffoldResult>
  selectRun: (runId: string) => void
}

/**
 * WF5 — owns the workflow definitions list and this session's live run state
 * (AD-011). Mounted once in `App` (above the direction switch) so runs keep
 * accumulating from the `workflow:*` stream even while another direction is
 * active — that is what lets a WF4 `workflow:focus-run` toast restore a run's
 * full timeline. Mirrors `useSessions`: pure fold logic lives in
 * `workflow-run-view`; this hook is the (hand-verified) subscription + channel
 * wiring.
 *
 * `workflows:run` resolves its `{runId}` only when the run *finishes*, so the
 * runId is learned from the event stream instead: the first `workflow:status`
 * for a never-seen run is the just-triggered serial run — it is auto-selected and
 * tagged with the `workflowId` we started (`pendingWf`).
 */
export function useWorkflowRuns(): UseWorkflowRuns {
  const [defs, setDefs] = useState<WorkflowDef[]>([])
  const [runs, setRuns] = useState<RunView[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const knownIds = useRef<Set<string>>(new Set())
  const pendingWf = useRef<string | null>(null)

  const refresh = useCallback((): void => {
    api
      .invoke('workflows:list')
      .then(setDefs)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  useEffect(() => refresh(), [refresh])

  // Always-on run stream: fold status/step/log/blocked into the session's runs.
  useEffect(() => {
    const offStatus = api.on('workflow:status', ({ runId, status }) => {
      if (!knownIds.current.has(runId)) {
        knownIds.current.add(runId)
        const wf = pendingWf.current
        pendingWf.current = null
        setSelectedRunId(runId)
        setRuns((prev) =>
          foldRunEvent(prev, { type: 'status', runId, status }).map((r) =>
            r.runId === runId && wf ? { ...r, workflowId: wf } : r
          )
        )
      } else {
        setRuns((prev) => foldRunEvent(prev, { type: 'status', runId, status }))
      }
    })
    const offStep = api.on('workflow:step', ({ runId, step }) =>
      setRuns((prev) => foldRunEvent(prev, { type: 'step', runId, step }))
    )
    const offLog = api.on('workflow:log', ({ runId, message, group }) =>
      setRuns((prev) => foldRunEvent(prev, { type: 'log', runId, message, group }))
    )
    const offBlocked = api.on('workflow:blocked', ({ runId, question }) =>
      setRuns((prev) => foldRunEvent(prev, { type: 'blocked', runId, question }))
    )
    return () => {
      offStatus()
      offStep()
      offLog()
      offBlocked()
    }
  }, [])

  const start = useCallback((id: string, input: Record<string, string>): void => {
    setError(null)
    pendingWf.current = id
    // Fire-and-forget: the runId arrives via workflow:status; a rejection here is
    // the serial-run guard (WF2-17), surfaced instead of swallowed (WF5-20).
    api.invoke('workflows:run', { id, input }).catch((err) => {
      pendingWf.current = null
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [])

  const cancel = useCallback((runId: string): void => {
    api.invoke('workflows:cancel', { runId }).catch(console.error)
  }, [])

  const respond = useCallback((runId: string, decision: RespondDecision): void => {
    api.invoke('workflows:respond', { runId, decision }).catch(console.error)
  }, [])

  const scaffold = useCallback(
    (name: string): Promise<ScaffoldResult> =>
      api.invoke('workflows:scaffold', { name }).then((res) => {
        if (res.ok) refresh()
        return res
      }),
    [refresh]
  )

  const selectRun = useCallback((runId: string): void => setSelectedRunId(runId), [])

  const activeRunId =
    runs.find((r) => r.status === 'running' || r.status === 'blocked')?.runId ?? null

  return {
    defs,
    runs,
    selectedRunId,
    activeRunId,
    error,
    refresh,
    start,
    cancel,
    respond,
    scaffold,
    selectRun
  }
}
