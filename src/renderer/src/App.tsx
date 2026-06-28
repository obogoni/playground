import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { AgentDef } from '../../shared/agents'
import type { AppConfig } from '../../shared/config'
import type { PinnedTaskView, TasksSnapshot } from '../../shared/tasks'
import { taskIdFromBranch } from '../../shared/tasks'
import type { WorkspaceNode } from '../../shared/tree'
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
import { findWorktree } from './lib/tree-selection'
import { useSessions } from './lib/use-sessions'
import { useTree } from './lib/use-tree'
import './App.css'

type UiState = AppConfig['ui']

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

/** Worktree paths whose branch carries the given task ID (STWK-04). */
function worktreePathsForTask(tree: WorkspaceNode[], taskId: number): string[] {
  const paths: string[] = []
  for (const workspace of tree) {
    for (const repo of workspace.repos) {
      for (const worktree of repo.worktrees) {
        if (taskIdFromBranch(worktree.branch) === taskId) paths.push(worktree.path)
      }
    }
  }
  return paths
}

function App(): JSX.Element {
  const [ui, setUi] = useState<UiState | null>(null)
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
  /** Editable agent registry from config (AGCF-01); threaded to the agent UIs. */
  const [agents, setAgents] = useState<AgentDef[]>([])
  /** New-session dialog pre-fill; null = closed. */
  const [nsSource, setNsSource] = useState<NewSessionSource | null>(null)

  const update = (patch: Partial<UiState>): void => {
    setUi((prev) => (prev ? { ...prev, ...patch } : prev))
    api.invoke('config:patch', { ui: patch }).catch(console.error)
  }

  // Session + tree orchestration live in dedicated hooks; App composes them with
  // its UI/config state (toasts, view direction, dialogs).
  const {
    tree,
    selectedId,
    setSelectedId,
    refreshTree,
    refreshAndSelect,
    refreshAndSelectDefault
  } = useTree()
  const {
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
  } = useSessions({ onToast: setToast, onSwitchToAgents: () => update({ direction: 'agents' }) })

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
        setAgents(config.agents)
      })
      .catch((err) => {
        console.error(err)
        setUi({ theme: 'dark', direction: 'tree', defaultShell: 'pwsh' })
      })
    refreshTree()
    // Cached pins paint immediately; the live fetch fills details in.
    api.invoke('tasks:list').then(setTasks).catch(console.error)
    refreshTasks()
    refreshSessions()
  }, [refreshTree, refreshTasks, refreshSessions])

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

  // PRD start-work flow: refresh and select the new worktree, no auto-open.
  const worktreeCreated = (worktreePath: string): void => {
    setDialogRepoPath(null)
    setStartWorkTask(null)
    refreshAndSelect(worktreePath)
  }

  // Entry points (rail, worktree detail, board, tasks, sidebar) all funnel here
  // to open the New Session dialog with whatever pre-fill they carry.
  const openNewSession = (source: NewSessionSource = {}): void => {
    setNsSource(source)
  }

  // Deep-link from an entry-point chip: select the session and switch to Agents.
  const openSession = (id: string): void => {
    setSelectedSessionId(id)
    update({ direction: 'agents' })
  }

  // Reverse deep-link (ACTX-04): from an agent session, jump to its worktree's
  // Tree detail (where the launchers live). The worktree's path is its selection
  // id, so a session's cwd selects it directly.
  const openWorktreeForSession = (cwd: string): void => {
    setSelectedId(cwd)
    update({ direction: 'tree' })
  }

  // Pinned-task Agent button: 0 worktrees → caller disables; 1 → preselect it;
  // many → highlight the task's worktrees in the dialog.
  const spawnAgentForTask = (task: PinnedTaskView): void => {
    const paths = worktreePathsForTask(tree, task.id)
    if (paths.length === 0) return
    openNewSession({
      taskId: task.id,
      cwd: paths.length === 1 ? paths[0] : undefined,
      highlightWorktrees: paths.length > 1 ? paths : undefined
    })
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
              onSpawnAgent={(cwd) => openNewSession({ cwd })}
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
                sessions={sessions.filter((s) => s.cwd === selected.worktree.path)}
                onSpawnAgent={() => openNewSession({ cwd: selected.worktree.path })}
                onOpenSession={openSession}
                onToast={setToast}
                onRemoved={refreshAndSelectDefault}
              />
            ) : (
              <WorktreeDetailEmpty />
            )}
            <TasksPane
              snapshot={tasks}
              worktreeCounts={worktreeCounts}
              onSnapshot={setTasks}
              onStartWork={setStartWorkTask}
              onSpawnAgent={spawnAgentForTask}
            />
          </>
        ) : ui.direction === 'agents' ? (
          <AgentsView
            sessions={sessions}
            tree={tree}
            agents={agents}
            tasks={tasks.tasks}
            selectedId={selectedSessionId}
            onSelect={setSelectedSessionId}
            onStop={stopSession}
            onRespawn={respawnSession}
            onRemove={removeSession}
            onRename={renameSession}
            onDuplicate={duplicateSession}
            onOpenWorktree={openWorktreeForSession}
            onNew={() => openNewSession()}
          />
        ) : (
          <BoardView
            tree={tree}
            snapshot={tasks}
            worktreeCounts={worktreeCounts}
            onSnapshot={setTasks}
            onToast={setToast}
            onSpawnAgent={(cwd) => openNewSession({ cwd })}
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
            setAgents(config.agents)
            setSettingsOpen(false)
          }}
          onAgentsChanged={(config) => setAgents(config.agents)}
        />
      )}
      {nsSource && (
        <NewSessionDialog
          tree={tree}
          agents={agents}
          source={nsSource}
          onSpawn={(agentName, cwd, adhocCommand) => {
            setNsSource(null)
            spawnSession(agentName, cwd, adhocCommand)
          }}
          onClose={() => setNsSource(null)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={dismissToast} />}
    </>
  )
}

export default App
