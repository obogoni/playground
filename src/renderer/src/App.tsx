import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { AppConfig, SessionView } from '../../shared/config'
import type { PinnedTaskView, TasksSnapshot } from '../../shared/tasks'
import { taskIdFromBranch } from '../../shared/tasks'
import type { WorkspaceNode, WorktreeNode } from '../../shared/tree'
import { AgentsView } from './components/AgentsView'
import { BoardView } from './components/BoardView'
import { NewSessionDialog, type NewSessionSource } from './components/NewSessionDialog'
import { NewWorktreeDialog } from './components/NewWorktreeDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { StartWorkDialog } from './components/StartWorkDialog'
import { TasksPane } from './components/TasksPane'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { WorktreeDetail, WorktreeDetailEmpty } from './components/WorktreeDetail'
import { api } from './lib/api'
import './App.css'

type UiState = AppConfig['ui']

interface SelectedWorktree {
  workspaceName: string
  repoName: string
  repoPath: string
  worktree: WorktreeNode
}

function findWorktree(tree: WorkspaceNode[], id: string | null): SelectedWorktree | null {
  if (!id) return null
  for (const workspace of tree) {
    for (const repo of workspace.repos) {
      const worktree = repo.worktrees.find((w) => w.id === id)
      if (worktree) {
        return {
          workspaceName: workspace.displayName,
          repoName: repo.name,
          repoPath: repo.path,
          worktree
        }
      }
    }
  }
  return null
}

/** Worktrees per extracted task ID across all workspaces (STWK-04, spec §Edge Cases). */
function countWorktreesByTask(tree: WorkspaceNode[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const workspace of tree) {
    for (const repo of workspace.repos) {
      for (const worktree of repo.worktrees) {
        const id = taskIdFromBranch(worktree.branch)
        if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
  }
  return counts
}

function App(): JSX.Element {
  const [ui, setUi] = useState<UiState | null>(null)
  const [tree, setTree] = useState<WorkspaceNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  /** Repo path the new-worktree dialog was opened for; null = closed. */
  const [dialogRepoPath, setDialogRepoPath] = useState<string | null>(null)
  /** Task the start-work dialog was opened for; null = closed. */
  const [startWorkTask, setStartWorkTask] = useState<PinnedTaskView | null>(null)
  const [tasks, setTasks] = useState<TasksSnapshot>({
    tasks: [],
    auth: 'unknown',
    lastSyncAt: null
  })
  const [adoOrg, setAdoOrg] = useState<string | null>(null)
  const [branchTemplate, setBranchTemplate] = useState('')
  const [worktreeTemplate, setWorktreeTemplate] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** Agent sessions (persisted ∪ running), reconciled by main. */
  const [sessions, setSessions] = useState<SessionView[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  /** New-session dialog pre-fill; null = closed. */
  const [nsSource, setNsSource] = useState<NewSessionSource | null>(null)

  const refreshSessions = useCallback((): void => {
    api.invoke('sessions:list').then(setSessions).catch(console.error)
  }, [])

  const refreshTree = useCallback((): void => {
    api
      .invoke('tree:get')
      .then((next) => {
        setTree(next)
        // Preserve selection only while the worktree still exists on disk.
        setSelectedId((id) => (findWorktree(next, id) ? id : null))
      })
      .catch(console.error)
  }, [])

  const refreshTasks = useCallback((): void => {
    api.invoke('tasks:refresh').then(setTasks).catch(console.error)
  }, [])

  useEffect(() => {
    api
      .invoke('config:get')
      .then((config) => {
        setUi(config.ui)
        setAdoOrg(config.ado.defaultOrg)
        setBranchTemplate(config.ado.branchTemplate)
        setWorktreeTemplate(config.ado.worktreeTemplate)
      })
      .catch((err) => {
        console.error(err)
        setUi({ theme: 'dark', direction: 'tree' })
      })
    refreshTree()
    // Cached pins paint immediately; the live fetch fills details in.
    api.invoke('tasks:list').then(setTasks).catch(console.error)
    refreshTasks()
    refreshSessions()
  }, [refreshTree, refreshTasks, refreshSessions])

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

  // PRD story 7: details re-fetch on app focus, debounced against focus flapping.
  const lastFocusRefresh = useRef(0)
  useEffect(() => {
    const onFocus = (): void => {
      if (Date.now() - lastFocusRefresh.current < 5_000) return
      lastFocusRefresh.current = Date.now()
      refreshTasks()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshTasks])

  useEffect(() => {
    if (ui) document.documentElement.dataset.theme = ui.theme
  }, [ui])

  const update = (patch: Partial<UiState>): void => {
    setUi((prev) => (prev ? { ...prev, ...patch } : prev))
    api.invoke('config:patch', { ui: patch }).catch(console.error)
  }

  const addWorkspace = (): void => {
    api
      .invoke('workspaces:add')
      .then((entry) => {
        if (entry) refreshTree()
      })
      .catch(console.error)
  }

  const removeWorkspace = (id: string): void => {
    api.invoke('workspaces:remove', { id }).then(refreshTree).catch(console.error)
  }

  // After a removal the selected row is gone — land on the repo's primary
  // checkout instead of the empty state (spec §Decisions).
  const worktreeRemoved = (repoPath: string): void => {
    api
      .invoke('tree:get')
      .then((next) => {
        setTree(next)
        const repo = next.flatMap((ws) => ws.repos).find((r) => r.path === repoPath)
        setSelectedId(repo?.worktrees.find((w) => w.isDefault)?.id ?? null)
      })
      .catch(console.error)
  }

  // PRD start-work flow: refresh and select the new worktree, no auto-open.
  const worktreeCreated = (worktreePath: string): void => {
    setDialogRepoPath(null)
    setStartWorkTask(null)
    api
      .invoke('tree:get')
      .then((next) => {
        setTree(next)
        setSelectedId(worktreePath)
      })
      .catch(console.error)
  }

  // Entry points (rail, worktree detail, board, tasks, sidebar) all funnel here
  // to open the New Session dialog with whatever pre-fill they carry.
  const openNewSession = (source: NewSessionSource = {}): void => {
    setNsSource(source)
  }

  const spawnSession = (agentName: string, cwd: string): void => {
    setNsSource(null)
    api
      .invoke('sessions:spawn', { agentName, cwd })
      .then((view) => {
        setSelectedSessionId(view.id)
        update({ direction: 'agents' })
        refreshSessions()
      })
      .catch((err) => {
        console.error(err)
        setToast("Couldn't start session")
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
    if (selectedSessionId === id) setSelectedSessionId(null)
    api.invoke('sessions:remove', { id }).then(refreshSessions).catch(console.error)
  }

  if (!ui) {
    // One frame at most; avoids a default-theme flash before hydration.
    return <></>
  }

  const selected = findWorktree(tree, selectedId)
  const worktreeCounts = countWorktreesByTask(tree)
  const linkedTaskId = selected ? taskIdFromBranch(selected.worktree.branch) : null
  // First pin in config order wins when IDs collide across orgs (spec §Edge Cases).
  const linkedPin =
    linkedTaskId === null ? null : (tasks.tasks.find((task) => task.id === linkedTaskId) ?? null)

  return (
    <>
      <TopBar
        theme={ui.theme}
        direction={ui.direction}
        sync={{
          auth: tasks.auth,
          lastSyncAt: tasks.lastSyncAt,
          org: adoOrg ?? tasks.tasks[0]?.org ?? null
        }}
        onThemeToggle={() => update({ theme: ui.theme === 'dark' ? 'light' : 'dark' })}
        onDirectionChange={(direction) => update({ direction })}
        onRefresh={() => {
          refreshTree()
          refreshTasks()
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="content">
        {ui.direction === 'tree' ? (
          <>
            <Sidebar
              tree={tree}
              tasks={tasks.tasks}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddWorkspace={addWorkspace}
              onRemoveWorkspace={removeWorkspace}
              onNewWorktree={setDialogRepoPath}
            />
            {selected ? (
              <WorktreeDetail
                key={selected.worktree.id}
                workspaceName={selected.workspaceName}
                repoName={selected.repoName}
                repoPath={selected.repoPath}
                worktree={selected.worktree}
                linkedTaskId={linkedTaskId}
                linkedPin={linkedPin}
                onToast={setToast}
                onRemoved={worktreeRemoved}
              />
            ) : (
              <WorktreeDetailEmpty />
            )}
            <TasksPane
              snapshot={tasks}
              worktreeCounts={worktreeCounts}
              onSnapshot={setTasks}
              onStartWork={setStartWorkTask}
            />
          </>
        ) : ui.direction === 'agents' ? (
          <AgentsView
            sessions={sessions}
            tree={tree}
            selectedId={selectedSessionId}
            onSelect={setSelectedSessionId}
            onStop={stopSession}
            onRespawn={respawnSession}
            onRemove={removeSession}
            onNew={() => openNewSession()}
          />
        ) : (
          <BoardView
            tree={tree}
            snapshot={tasks}
            worktreeCounts={worktreeCounts}
            onSnapshot={setTasks}
            onToast={setToast}
          />
        )}
      </main>
      {dialogRepoPath && (
        <NewWorktreeDialog
          tree={tree}
          initialRepoPath={dialogRepoPath}
          worktreeTemplate={worktreeTemplate}
          onClose={() => setDialogRepoPath(null)}
          onCreated={worktreeCreated}
        />
      )}
      {startWorkTask && (
        <StartWorkDialog
          tree={tree}
          task={startWorkTask}
          branchTemplate={branchTemplate}
          worktreeTemplate={worktreeTemplate}
          onClose={() => setStartWorkTask(null)}
          onCreated={worktreeCreated}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onSaved={(config) => {
            setAdoOrg(config.ado.defaultOrg)
            setBranchTemplate(config.ado.branchTemplate)
            setWorktreeTemplate(config.ado.worktreeTemplate)
            setSettingsOpen(false)
          }}
        />
      )}
      {nsSource && (
        <NewSessionDialog
          tree={tree}
          source={nsSource}
          onSpawn={spawnSession}
          onClose={() => setNsSource(null)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={dismissToast} />}
    </>
  )
}

export default App
