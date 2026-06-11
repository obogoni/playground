import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { AppConfig } from '../../shared/config'
import type { TasksSnapshot } from '../../shared/tasks'
import type { WorkspaceNode, WorktreeNode } from '../../shared/tree'
import { NewWorktreeDialog } from './components/NewWorktreeDialog'
import { Sidebar } from './components/Sidebar'
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

function App(): JSX.Element {
  const [ui, setUi] = useState<UiState | null>(null)
  const [tree, setTree] = useState<WorkspaceNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  /** Repo path the new-worktree dialog was opened for; null = closed. */
  const [dialogRepoPath, setDialogRepoPath] = useState<string | null>(null)
  const [tasks, setTasks] = useState<TasksSnapshot>({
    tasks: [],
    auth: 'unknown',
    lastSyncAt: null
  })
  const [adoOrg, setAdoOrg] = useState<string | null>(null)

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
      })
      .catch((err) => {
        console.error(err)
        setUi({ theme: 'dark', direction: 'tree' })
      })
    refreshTree()
    // Cached pins paint immediately; the live fetch fills details in.
    api.invoke('tasks:list').then(setTasks).catch(console.error)
    refreshTasks()
  }, [refreshTree, refreshTasks])

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
    api
      .invoke('tree:get')
      .then((next) => {
        setTree(next)
        setSelectedId(worktreePath)
      })
      .catch(console.error)
  }

  if (!ui) {
    // One frame at most; avoids a default-theme flash before hydration.
    return <></>
  }

  const selected = findWorktree(tree, selectedId)

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
      />
      <main className="content">
        {ui.direction === 'tree' ? (
          <>
            <Sidebar
              tree={tree}
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
                onToast={setToast}
                onRemoved={worktreeRemoved}
              />
            ) : (
              <WorktreeDetailEmpty />
            )}
            <TasksPane snapshot={tasks} onSnapshot={setTasks} />
          </>
        ) : (
          <div className="content-placeholder">
            Board view — task-centric canvas lands here (M4)
          </div>
        )}
      </main>
      {dialogRepoPath && (
        <NewWorktreeDialog
          tree={tree}
          initialRepoPath={dialogRepoPath}
          onClose={() => setDialogRepoPath(null)}
          onCreated={worktreeCreated}
        />
      )}
      {toast && <Toast message={toast} onDismiss={dismissToast} />}
    </>
  )
}

export default App
