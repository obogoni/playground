import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { SessionView } from '../../../shared/config'
import { api } from './api'

export interface UseSessionsOptions {
  /** Show a transient error toast (spawn / duplicate failures). */
  onToast: (message: string) => void
  /** Switch the app to the Agents view (after a successful spawn). */
  onSwitchToAgents: () => void
}

export interface UseSessions {
  sessions: SessionView[]
  selectedSessionId: string | null
  setSelectedSessionId: Dispatch<SetStateAction<string | null>>
  refreshSessions: () => void
  spawnSession: (agentName: string, cwd: string, adhocCommand?: string) => void
  renameSession: (id: string, title: string) => void
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
  useEffect(() => {
    const offStatus = api.on('session:status', refreshSessions)
    const offExit = api.on('session:exit', refreshSessions)
    return () => {
      offStatus()
      offExit()
    }
  }, [refreshSessions])

  const spawnSession = (agentName: string, cwd: string, adhocCommand?: string): void => {
    api
      .invoke('sessions:spawn', { agentName, cwd, adhocCommand })
      .then((view) => {
        setSelectedSessionId(view.id)
        onSwitchToAgents()
        refreshSessions()
      })
      .catch((err) => {
        console.error(err)
        onToast("Couldn't start session")
      })
  }

  const renameSession = (id: string, title: string): void => {
    api
      .invoke('sessions:rename', { id, title })
      .then(() => refreshSessions())
      .catch(console.error)
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
        onToast("Couldn't duplicate session")
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
    duplicateSession,
    stopSession,
    respawnSession,
    removeSession
  }
}
