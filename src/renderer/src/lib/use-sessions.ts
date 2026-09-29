import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { SessionView } from '../../../shared/config'
import type { SessionTask } from '../../../shared/tasks'
import { api } from './api'
import { failureToast } from './failure-toast'
import { applyActivity } from './session-activity'
import { applyName } from './session-name'

export interface UseSessionsOptions {
  /** Show a transient error toast (spawn / duplicate / task change failures). */
  onToast: (message: string) => void
  /** Switch the app to the Agents view (after a successful spawn). */
  onSwitchToAgents: () => void
}

export interface UseSessions {
  sessions: SessionView[]
  selectedSessionId: string | null
  setSelectedSessionId: Dispatch<SetStateAction<string | null>>
  refreshSessions: () => void
  /** `task` links the new session by hand (HTSK-09); absent = From branch. */
  spawnSession: (agentName: string, cwd: string, adhocCommand?: string, task?: SessionTask) => void
  renameSession: (id: string, title: string) => void
  /** Links a session to a task, or back to its branch with null (HTSK-12, HTSK-13). */
  setSessionTask: (id: string, task: SessionTask | null) => void
  duplicateSession: (id: string) => void
  stopSession: (id: string) => void
  respawnSession: (id: string) => void
  removeSession: (id: string) => void
}

/**
 * Owns the agent session list and selection, the live status/exit subscription,
 * and every session action. Side effects that belong to the shell (error toasts,
 * switching to the Agents view on spawn) are injected via options so the hook
 * stays free of App's UI/config state.
 */
export function useSessions({ onToast, onSwitchToAgents }: UseSessionsOptions): UseSessions {
  const [sessions, setSessions] = useState<SessionView[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const refreshSessions = useCallback((): void => {
    api.invoke('sessions:list').then(setSessions).catch(console.error)
  }, [])

  // Keep the session list live: main pushes status on PTY exit / respawn, which
  // the rail + detail panel reflect without an explicit refresh.
  //
  // Activity is the exception: it changes on every tool call, so it is applied
  // in place instead of refetching the whole list per event (ACTV-07). An event
  // for a session the list does not hold yet is dropped; the next list() carries
  // the state anyway. The agent's own session name rides the same pattern
  // (SNAME-02).
  useEffect(() => {
    const offStatus = api.on('session:status', refreshSessions)
    const offExit = api.on('session:exit', refreshSessions)
    // A link set in main, e.g. by the session's agent (ATSK-06).
    const offTask = api.on('session:task', refreshSessions)
    const offActivity = api.on('session:activity', ({ id, activity }) => {
      setSessions((prev) => applyActivity(prev, id, activity))
    })
    const offName = api.on('session:name', ({ id, name }) => {
      setSessions((prev) => applyName(prev, id, name))
    })
    return () => {
      offStatus()
      offExit()
      offTask()
      offActivity()
      offName()
    }
  }, [refreshSessions])

  const spawnSession = (
    agentName: string,
    cwd: string,
    adhocCommand?: string,
    task?: SessionTask
  ): void => {
    api
      .invoke('sessions:spawn', { agentName, cwd, adhocCommand, task })
      .then((view) => {
        setSelectedSessionId(view.id)
        onSwitchToAgents()
        refreshSessions()
      })
      .catch((err) => {
        console.error(err)
        onToast(failureToast("Couldn't start session", err))
      })
  }

  const renameSession = (id: string, title: string): void => {
    api
      .invoke('sessions:rename', { id, title })
      .then(() => refreshSessions())
      .catch(console.error)
  }

  const setSessionTask = (id: string, task: SessionTask | null): void => {
    api
      .invoke('sessions:set-task', { id, task })
      .then(() => refreshSessions())
      .catch((err) => {
        console.error(err)
        onToast(failureToast("Couldn't change the session's task", err))
      })
  }

  const duplicateSession = (id: string): void => {
    api
      .invoke('sessions:duplicate', { id })
      .then((view) => {
        setSelectedSessionId(view.id)
        refreshSessions()
      })
      .catch((err) => {
        console.error(err)
        onToast(failureToast("Couldn't duplicate session", err))
      })
  }

  const stopSession = (id: string): void => {
    api.invoke('sessions:stop', { id }).then(refreshSessions).catch(console.error)
  }

  const respawnSession = (id: string): void => {
    api
      .invoke('sessions:respawn', { id })
      .then((view) => {
        setSelectedSessionId(view.id)
        refreshSessions()
      })
      .catch(console.error)
  }

  const removeSession = (id: string): void => {
    setSelectedSessionId((cur) => (cur === id ? null : cur))
    api.invoke('sessions:remove', { id }).then(refreshSessions).catch(console.error)
  }

  return {
    sessions,
    selectedSessionId,
    setSelectedSessionId,
    refreshSessions,
    spawnSession,
    renameSession,
    setSessionTask,
    duplicateSession,
    stopSession,
    respawnSession,
    removeSession
  }
}
