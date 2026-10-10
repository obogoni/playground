import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps, JSX } from 'react'
import type { AgentDef } from '../../shared/agents'
import type { ActivityState, AppConfig } from '../../shared/config'
import type { PrRef } from '../../shared/files'
import { DEFAULT_CONFIG } from '../../shared/config'
import type { PinnedTaskView, TasksSnapshot } from '../../shared/tasks'
import { taskIdFromBranch } from '../../shared/tasks'
import type { WorkspaceNode } from '../../shared/tree'
import { AgentsView } from './components/AgentsView'
import { BoardView } from './components/BoardView'
import { FilesView } from './components/FilesView'
import { HoursView } from './components/HoursView'
import { NewSessionDialog, type NewSessionSource } from './components/NewSessionDialog'
import { NewWorktreeDialog } from './components/NewWorktreeDialog'
import { PerfProfiler } from './components/PerfProfiler'
import { SessionNotices } from './components/SessionNotices'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { StartWorkDialog } from './components/StartWorkDialog'
import { StatusBar } from './components/StatusBar'
import { TasksPane } from './components/TasksPane'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { WorkflowsView } from './components/WorkflowsView'
import { WorktreeDetail, WorktreeDetailEmpty } from './components/WorktreeDetail'
import { api } from './lib/api'
import {
  SIDEBAR_BOUNDS,
  SIDEBAR_DEFAULT_WIDTH,
  TASKS_BOUNDS,
  TASKS_DEFAULT_WIDTH,
  resolvePaneWidth
} from './lib/pane-layout'
import { dropNotice, upsertNotice, type Notice } from './lib/session-notices'
import { findWorktree, worktreeIdForPath } from './lib/tree-selection'
import { worktreeForTurnEnd } from './lib/tree-status'
import { dropCollapsedId, isCollapsed, toggleCollapsedId } from './lib/workspace-collapse'
import { filesStateFor } from './lib/files-view'
import { useFiles } from './lib/use-files'
import { useGitHubStatus } from './lib/use-github-status'
import { usePrLookup } from './lib/use-pr-lookup'
import { barTargetFor } from './lib/status-bar'
import { useSessions } from './lib/use-sessions'
import { useTime } from './lib/use-time'
import { useLatestCallback } from './lib/use-latest-callback'
import { useTree } from './lib/use-tree'
import { useWorkflowRuns } from './lib/use-workflow-runs'
import './App.css'

type UiState = AppConfig['ui']

/** No folded workspace, with one identity so the memoized Sidebar keeps its props. */
const NO_COLLAPSED: string[] = []

/**
 * TopBar and Sidebar show no session, so an activity or name push must not
 * re-render them (PERF-09). Each profiler sits inside its memo, so the render
 * log shows real re-renders only (PERF-17).
 */
const MemoTopBar = memo(function ProfiledTopBar(props: ComponentProps<typeof TopBar>) {
  return (
    <PerfProfiler name="TopBar">
      <TopBar {...props} />
    </PerfProfiler>
  )
})

const MemoSidebar = memo(function ProfiledSidebar(props: ComponentProps<typeof Sidebar>) {
  return (
    <PerfProfiler name="Sidebar">
      <Sidebar {...props} />
    </PerfProfiler>
  )
})

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
  /** In-app session notices, one per session (NOTF-02, NOTF-22). */
  const [notices, setNotices] = useState<Notice[]>([])
  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => dropNotice(prev, id))
  }, [])
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
  const [devAlias, setDevAlias] = useState('')
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
    refreshAndSelectDefault,
    recount,
    treeRevision,
    onRecounted
  } = useTree()
  const {
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
  } = useSessions({ onToast: setToast, onSwitchToAgents: () => update({ direction: 'agents' }) })
  // Always mounted (above the direction switch) so runs accumulate from the
  // workflow:* stream even while another direction is active (WF5-04, AD-011).
  const workflows = useWorkflowRuns()
  // Time snapshot (AD-021): refetched on time:changed; counters tick in their own
  // components, so App does not re-render every second.
  const time = useTime()
  // Live pinned titles for the Hours labels; the first pin of an id wins, like the rail (TIME-40).
  const liveTitles = useMemo(() => {
    const titles = new Map<number, string>()
    for (const task of tasks.tasks) {
      if (task.details && !titles.has(task.id)) titles.set(task.id, task.details.title)
    }
    return titles
  }, [tasks.tasks])
  // TopBar's props keep their identity across session pushes (PERF-09).
  const syncOrg = adoOrg ?? tasks.tasks[0]?.org ?? null
  const sync = useMemo(
    () => ({ auth: tasks.auth, lastSyncAt: tasks.lastSyncAt, org: syncOrg }),
    [tasks.auth, tasks.lastSyncAt, syncOrg]
  )
  // The gh chip's state (FPRG-02, 05): a string, so the memoized TopBar keeps its props.
  const gh = useGitHubStatus()

  // Same reason, and one more: the Files watch follows the direction, so leaving
  // Files has to send `files:watch(null)` instead of racing FilesView's unmount
  // (FXPL-23). The hook reads the persisted lens out of `ui` and writes it back
  // through `update`, the one config writer (FXPL-13).
  /**
   * The worktree the app closed on comes back on launch (FXPL-33).
   *
   * Restored once, and only after both the config and the tree have arrived —
   * the tree is what says whether that worktree still exists. A saved folder
   * that has since been removed selects nothing rather than a stale row.
   *
   * The write is held back until the restore has run. Persisting on every
   * change from the first render would save the mount's empty selection over
   * the stored one before there was anything to restore from.
   */
  const restored = useRef(false)
  const live = useRef(update)
  useEffect(() => {
    live.current = update
  })
  useEffect(() => {
    if (restored.current || !ui || tree.length === 0) return
    restored.current = true
    const saved = ui.selectedWorktree
    if (saved && findWorktree(tree, saved)) setSelectedId(saved)
  }, [ui, tree, setSelectedId])
  useEffect(() => {
    if (!restored.current) return
    live.current({ selectedWorktree: selectedId ?? undefined })
  }, [selectedId])

  const selected = findWorktree(tree, selectedId)
  // F6: the pull request lookup the status bar and the Pull request mode
  // share, mounted above the direction switch and following the worktree the
  // bar describes (SPRL-01, 02).
  const barTarget = barTargetFor({
    direction: ui?.direction ?? DEFAULT_CONFIG.ui.direction,
    tree,
    selectedId,
    sessions,
    selectedSessionId
  })
  const prLookup = usePrLookup({
    target: barTarget.kind === 'worktree' ? barTarget.selected.worktree.path : null
  })
  const files = useFiles({
    worktreePath: selected?.worktree.path ?? null,
    active: ui?.direction === 'files',
    ui: ui ?? DEFAULT_CONFIG.ui,
    onPersist: update,
    // The status bar re-reads the tree when a push, sync, publish or fetch
    // succeeds, and a window focus re-reads it too: both end in a `tree:get`
    // result, which bumps `treeRevision`. The Commits list follows that
    // revision to recompute its not-pushed markers (FCMT-32), and not the
    // tree's identity, so a recount patch never reloads it (RCNT-26).
    treeRevision,
    prLookup
  })

  /**
   * The status bar's changed-file counter lands in the Files direction on that
   * worktree, in uncommitted-changes mode (FXPL-31, superseding STBR-30/32).
   *
   * One config write does both halves: the mode is read back from `ui` on every
   * render, so the mode forced here *is* the mode that worktree restores next
   * time (FXPL-32). Direction and mode go in the same patch rather than two,
   * so a failed second write cannot leave the direction switched with the mode
   * unchanged.
   */
  const openChangedFiles = (worktreeId: string): void => {
    const current = ui ?? DEFAULT_CONFIG.ui
    setSelectedId(worktreeId)
    update({
      direction: 'files',
      files: {
        ...current.files,
        [worktreeId]: { ...filesStateFor(current, worktreeId), mode: 'uncommitted' }
      }
    })
  }

  /**
   * The status bar's PR chip lands in the Files direction on that worktree, in
   * Pull request mode, showing that pull request (SPRL-10, 13). Direction and
   * mode go in one config patch, as in `openChangedFiles`; the pick goes to
   * the shared lookup, which reads that pull request.
   */
  const openPullRequest = (worktreeId: string, pr: PrRef): void => {
    const current = ui ?? DEFAULT_CONFIG.ui
    const worktree = findWorktree(tree, worktreeId)
    if (!worktree) return
    setSelectedId(worktreeId)
    update({
      direction: 'files',
      files: {
        ...current.files,
        [worktreeId]: { ...filesStateFor(current, worktreeId), mode: 'pull-request' }
      }
    })
    prLookup.choose(worktree.worktree.path, pr)
  }

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
        setDevAlias(config.ado.devAlias)
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
      // Edits made in an editor reach the counts no other way (SCRF-09/10).
      refreshTree()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshTasks, refreshTree])

  // An agent's turn just ended: recount the worktree it worked in, so its
  // uncommitted edits show (SCRF-07/08). Read per push rather than off the
  // session list: two pushes landing in one render would hide the transition.
  // A push carries only the new state, so each session's last one is kept
  // here, seeded from the list the first time.
  const lastActivity = useRef(new Map<string, ActivityState | undefined>())
  const turnContext = useRef({ tree, sessions })
  useEffect(() => {
    turnContext.current = { tree, sessions }
  })
  useEffect(
    () =>
      api.on('session:activity', ({ id, activity }) => {
        const { tree: current, sessions: known } = turnContext.current
        const session = known.find((s) => s.id === id)
        const seen = lastActivity.current
        const before = seen.has(id) ? seen.get(id) : session?.activity?.state
        const after = activity?.state
        seen.set(id, after)
        if (!session) return
        const path = worktreeForTurnEnd(current, before, after, session.cwd)
        if (path) recount(path)
      }),
    [recount]
  )

  useEffect(() => {
    if (ui) document.documentElement.dataset.theme = ui.theme
  }, [ui])

  // A session notification, OS or in-app, opens its session in the agents
  // direction, like `openSession` below but stable for the subscription. A stopped
  // session is still in the list and gets selected (NOTF-05, NOTF-23).
  const openNotifiedSession = useCallback(
    (id: string): void => {
      setUi((prev) => (prev ? { ...prev, direction: 'agents' } : prev))
      api.invoke('config:patch', { ui: { direction: 'agents' } }).catch(console.error)
      setSelectedSessionId(id)
      setNotices((prev) => dropNotice(prev, id))
    },
    [setSelectedSessionId]
  )
  const noticeKey = useRef(0)
  useEffect(() => {
    const offNotice = api.on('session:notice', ({ id, title, body }) => {
      noticeKey.current += 1
      const key = noticeKey.current
      setNotices((prev) => upsertNotice(prev, { id, title, body, key }))
    })
    const offFocus = api.on('session:focus', ({ id }) => openNotifiedSession(id))
    return () => {
      offNotice()
      offFocus()
    }
  }, [openNotifiedSession])

  // A WF4 lifecycle-toast click asks the renderer to surface a run: switch to the
  // Workflows direction and open that run (WF5-17).
  const selectRun = workflows.selectRun
  useEffect(() => {
    const off = api.on('workflow:focus-run', ({ runId }) => {
      setUi((prev) => (prev ? { ...prev, direction: 'workflows' } : prev))
      api.invoke('config:patch', { ui: { direction: 'workflows' } }).catch(console.error)
      selectRun(runId)
    })
    return off
  }, [selectRun])

  // A tree refresh auto-pinned tasks its worktree branches carry (APIN-06).
  useEffect(() => api.on('tasks:changed', ({ snapshot }) => setTasks(snapshot)), [])

  const addWorkspace = useLatestCallback((): void => {
    api
      .invoke('workspaces:add')
      .then((entry) => {
        if (entry) refreshTree()
      })
      .catch(console.error)
  })

  const removeWorkspace = useLatestCallback((id: string): void => {
    api.invoke('workspaces:remove', { id }).then(refreshTree).catch(console.error)
    const folded = ui?.collapsedWorkspaces ?? NO_COLLAPSED
    if (isCollapsed(folded, id)) {
      update({ collapsedWorkspaces: dropCollapsedId(folded, id) })
    }
  })

  // Fold/unfold a workspace row in the tree sidebar (WSCL-01, WSCL-05).
  const toggleWorkspaceCollapsed = useLatestCallback((id: string): void => {
    update({ collapsedWorkspaces: toggleCollapsedId(ui?.collapsedWorkspaces ?? NO_COLLAPSED, id) })
  })

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

  /**
   * Picking a session also picks the worktree it runs in.
   *
   * The app has one current worktree, and every direction reads it — the
   * Files tree, the status bar, the launcher row. Without this the Files
   * direction kept showing whatever was last clicked in the Tree, so moving
   * between agents left it pointing at another agent's branch.
   *
   * A session spawned in a folder that is no worktree, or in one the tree no
   * longer holds, leaves the selection alone: there is nothing better to
   * point at than where the user already was.
   */
  const selectSession = (id: string | null): void => {
    setSelectedSessionId(id)
    const cwd = sessions.find((session) => session.id === id)?.cwd ?? null
    const worktreeId = worktreeIdForPath(tree, cwd)
    if (worktreeId) setSelectedId(worktreeId)
  }

  // Deep-link from an entry-point chip: select the session and switch to Agents.
  const openSession = (id: string): void => {
    selectSession(id)
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

  // Stable callbacks for the memoized TopBar and Sidebar (PERF-09). Hooks, so
  // they sit above the early return; `ui` is set whenever either can call them.
  const toggleTheme = useLatestCallback((): void =>
    update({ theme: ui?.theme === 'dark' ? 'light' : 'dark' })
  )
  const changeDirection = useLatestCallback((direction: UiState['direction']): void =>
    update({ direction })
  )
  const refreshAll = useLatestCallback((): void => {
    refreshTree()
    refreshTasks()
    prLookup.refresh()
  })
  const openSettings = useLatestCallback((): void => setSettingsOpen(true))
  const spawnAgentIn = useLatestCallback((cwd: string): void => openNewSession({ cwd }))
  const setSidebarWidth = useLatestCallback((w: number): void => update({ sidebarWidth: w }))
  const toggleSidebar = useLatestCallback((): void =>
    update({ sidebarCollapsed: !(ui?.sidebarCollapsed ?? false) })
  )

  if (!ui) {
    // One frame at most; avoids a default-theme flash before hydration.
    return <></>
  }

  const worktreeCounts = countWorktreesByTask(tree)
  const linkedTaskId = selected ? taskIdFromBranch(selected.worktree.branch) : null
  // First pin in config order wins when IDs collide across orgs (spec §Edge Cases).
  const linkedPin =
    linkedTaskId === null ? null : (tasks.tasks.find((task) => task.id === linkedTaskId) ?? null)
  // Persisted pane layout, defaulted and clamped on load (PANE-01, PANE-11, PANE-13).
  const sidebarWidth = resolvePaneWidth(ui.sidebarWidth, SIDEBAR_BOUNDS, SIDEBAR_DEFAULT_WIDTH)
  const sidebarCollapsed = ui.sidebarCollapsed ?? false
  const tasksWidth = resolvePaneWidth(ui.tasksWidth, TASKS_BOUNDS, TASKS_DEFAULT_WIDTH)
  const tasksCollapsed = ui.tasksCollapsed ?? false
  // Workspace ids folded in the sidebar tree; absent = every workspace expanded (WSCL-06).
  const collapsedIds = ui.collapsedWorkspaces ?? NO_COLLAPSED

  return (
    <>
      <MemoTopBar
        theme={ui.theme}
        direction={ui.direction}
        sync={sync}
        gh={gh}
        onThemeToggle={toggleTheme}
        onDirectionChange={changeDirection}
        onRefresh={refreshAll}
        onOpenSettings={openSettings}
      />
      <main className="content">
        {ui.direction === 'tree' ? (
          <>
            <MemoSidebar
              tree={tree}
              tasks={tasks.tasks}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddWorkspace={addWorkspace}
              onRemoveWorkspace={removeWorkspace}
              onNewWorktree={setDialogRepoPath}
              onSpawnAgent={spawnAgentIn}
              width={sidebarWidth}
              collapsed={sidebarCollapsed}
              onWidthChange={setSidebarWidth}
              onToggleCollapsed={toggleSidebar}
              collapsedIds={collapsedIds}
              onToggleCollapse={toggleWorkspaceCollapsed}
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
                time={time.snapshot}
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
              time={time.snapshot}
              onSnapshot={setTasks}
              onStartWork={setStartWorkTask}
              onSpawnAgent={spawnAgentForTask}
              onToast={setToast}
              width={tasksWidth}
              collapsed={tasksCollapsed}
              onWidthChange={(w) => update({ tasksWidth: w })}
              onToggleCollapsed={() => update({ tasksCollapsed: !tasksCollapsed })}
            />
          </>
        ) : ui.direction === 'agents' ? (
          <AgentsView
            sessions={sessions}
            tree={tree}
            agents={agents}
            tasks={tasks.tasks}
            time={time.snapshot}
            selectedId={selectedSessionId}
            onSelect={selectSession}
            onStop={stopSession}
            onRespawn={respawnSession}
            onRemove={removeSession}
            onRename={renameSession}
            onDuplicate={duplicateSession}
            onOpenWorktree={openWorktreeForSession}
            onNew={() => openNewSession()}
            onPauseTime={time.pause}
            onResumeTime={time.resume}
            onToast={setToast}
            onSetTask={setSessionTask}
          />
        ) : ui.direction === 'workflows' ? (
          <WorkflowsView
            defs={workflows.defs}
            runs={workflows.runs}
            selectedRunId={workflows.selectedRunId}
            activeRunId={workflows.activeRunId}
            error={workflows.error}
            onRun={workflows.start}
            onCancel={workflows.cancel}
            onRespond={workflows.respond}
            onReload={workflows.refresh}
            onScaffold={workflows.scaffold}
            onSelectRun={workflows.selectRun}
          />
        ) : ui.direction === 'hours' ? (
          <HoursView
            snapshot={time.snapshot}
            liveTitles={liveTitles}
            onDelete={time.deletePeriod}
            onAdjust={time.adjustPeriod}
            onSplit={time.splitPeriod}
            tasks={tasks.tasks}
            onReassign={time.reassignPeriod}
          />
        ) : ui.direction === 'files' ? (
          <FilesView
            worktreePath={selected?.worktree.path ?? null}
            // A selection the tree no longer resolves is a worktree whose folder
            // is gone; `refreshTree` clears it, but not before this render.
            pathMissing={selectedId !== null && selected === null}
            files={files}
            onToast={setToast}
            // The remove-worktree confirmation's rule for "a session runs in
            // this worktree" (WorktreeDetail), so the two dialogs agree (FDSC-12).
            runningSessions={sessions.filter(
              (s) => s.cwd === selected?.worktree.path && s.status === 'running'
            )}
            // The status bar's own refresh after a git operation (FDSC-31).
            onDiscarded={refreshTree}
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
      <PerfProfiler name="StatusBar">
        <StatusBar
          tree={tree}
          treeRevision={treeRevision}
          onRecounted={onRecounted}
          selectedId={selectedId}
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          direction={ui.direction}
          onToast={setToast}
          onOpenChanges={openChangedFiles}
          onOpenPullRequest={openPullRequest}
          prEntry={prLookup.entryFor(
            barTarget.kind === 'worktree' ? barTarget.selected.worktree.path : null
          )}
          onRefreshTree={refreshTree}
        />
      </PerfProfiler>
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
          devAlias={devAlias}
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
            setDevAlias(config.ado.devAlias)
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
          tasks={tasks.tasks}
          onSpawn={(agentName, cwd, adhocCommand, task, prompt) => {
            setNsSource(null)
            spawnSession(agentName, cwd, adhocCommand, task, prompt)
          }}
          onClose={() => setNsSource(null)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={dismissToast} />}
      <SessionNotices notices={notices} onOpen={openNotifiedSession} onDismiss={dismissNotice} />
    </>
  )
}

export default App
