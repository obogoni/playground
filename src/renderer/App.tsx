import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Workspace, Repo, Worktree, SimpleAgent } from '../shared/types.js';
import { Sidebar } from './components/Sidebar.js';
import { WorktreePane } from './components/WorktreePane.js';
import { NewWorktreeDialog } from './components/NewWorktreeDialog.js';
import { AgentsDialog } from './components/AgentsDialog.js';
import { Toast } from './components/Toast.js';

export interface TabSpec {
  id: string;
  key: string;
  label: string;
  ptyId: string | null;
  worktreePath: string;
  cmd: string;
  args: string[];
  agentId?: string;
  startedAt: number;
}

export interface PaneState {
  worktree: Worktree;
  tabs: TabSpec[];
  activeTabId: string | null;
}

export const App: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [reposByWs, setReposByWs] = useState<Record<string, Repo[]>>({});
  const [worktreesByRepo, setWorktreesByRepo] = useState<Record<string, Worktree[]>>({});
  const [agents, setAgents] = useState<SimpleAgent[]>([]);
  const [selectedWorktree, setSelectedWorktree] = useState<{ ws: Workspace; repo: Repo; wt: Worktree } | null>(null);
  const [panes, setPanes] = useState<Record<string, PaneState>>({});
  const [newWorktreeFor, setNewWorktreeFor] = useState<{ ws: Workspace; repo: Repo } | null>(null);
  const [agentsDialogOpen, setAgentsDialogOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    setWorkspaces(await window.api.workspaces.list());
  }, []);

  const refreshRepos = useCallback(async (ws: Workspace) => {
    const repos = await window.api.repos.scan(ws.id, ws.path);
    setReposByWs(prev => ({ ...prev, [ws.id]: repos }));
    return repos;
  }, []);

  const refreshWorktrees = useCallback(async (repo: Repo) => {
    try {
      const wts = await window.api.worktrees.list(repo.path);
      setWorktreesByRepo(prev => ({ ...prev, [repo.path]: wts }));
      return wts;
    } catch (err: any) {
      setToast(`Failed to list worktrees in ${repo.name}: ${err.message}`);
      return [];
    }
  }, []);

  const refreshAgents = useCallback(async (workspaceId: string | null) => {
    const list = await window.api.agents.listFor(workspaceId);
    setAgents(list);
  }, []);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    // when selection changes, fetch agents merged with workspace scope
    refreshAgents(selectedWorktree?.ws.id ?? null);
  }, [selectedWorktree?.ws.id, refreshAgents]);

  const onAddWorkspace = useCallback(async () => {
    const folder = await window.api.workspaces.pickFolder();
    if (!folder) return;
    await window.api.workspaces.add(folder);
    await refreshWorkspaces();
  }, [refreshWorkspaces]);

  const onRemoveWorkspace = useCallback(
    async (ws: Workspace) => {
      await window.api.workspaces.remove(ws.id);
      setReposByWs(prev => {
        const { [ws.id]: _drop, ...rest } = prev;
        return rest;
      });
      await refreshWorkspaces();
    },
    [refreshWorkspaces]
  );

  const onSelectWorktree = useCallback((ws: Workspace, repo: Repo, wt: Worktree) => {
    setSelectedWorktree({ ws, repo, wt });
    setPanes(prev => {
      if (prev[wt.path]) return prev;
      return { ...prev, [wt.path]: { worktree: wt, tabs: [], activeTabId: null } };
    });
  }, []);

  const onCloseWorkspace = onRemoveWorkspace;

  // ---- Tab/pane operations ---------------------------------------------------

  const startTab = useCallback(
    async (worktreePath: string, label: string, cmd: string, args: string[], agentId?: string) => {
      const tabKey = crypto.randomUUID();
      // Optimistic empty tab; ptyId fills once start resolves.
      setPanes(prev => {
        const pane = prev[worktreePath];
        if (!pane) return prev;
        const tab: TabSpec = {
          id: tabKey,
          key: tabKey,
          label,
          ptyId: null,
          worktreePath,
          cmd,
          args,
          agentId,
          startedAt: Date.now()
        };
        return {
          ...prev,
          [worktreePath]: { ...pane, tabs: [...pane.tabs, tab], activeTabId: tabKey }
        };
      });
      try {
        const ptyId = await window.api.tabs.start({ cwd: worktreePath, cmd, args });
        setPanes(prev => {
          const pane = prev[worktreePath];
          if (!pane) return prev;
          return {
            ...prev,
            [worktreePath]: {
              ...pane,
              tabs: pane.tabs.map(t => (t.id === tabKey ? { ...t, ptyId } : t))
            }
          };
        });
      } catch (err: any) {
        setToast(`Failed to start ${label}: ${err.message}`);
        setPanes(prev => {
          const pane = prev[worktreePath];
          if (!pane) return prev;
          const tabs = pane.tabs.filter(t => t.id !== tabKey);
          return {
            ...prev,
            [worktreePath]: {
              ...pane,
              tabs,
              activeTabId: pane.activeTabId === tabKey ? (tabs[tabs.length - 1]?.id ?? null) : pane.activeTabId
            }
          };
        });
      }
    },
    []
  );

  const closeTab = useCallback((worktreePath: string, tabId: string) => {
    setPanes(prev => {
      const pane = prev[worktreePath];
      if (!pane) return prev;
      const tab = pane.tabs.find(t => t.id === tabId);
      if (tab?.ptyId) {
        try { window.api.tabs.dispose(tab.ptyId); } catch {}
      }
      const tabs = pane.tabs.filter(t => t.id !== tabId);
      let activeTabId = pane.activeTabId;
      if (activeTabId === tabId) activeTabId = tabs[tabs.length - 1]?.id ?? null;
      return { ...prev, [worktreePath]: { ...pane, tabs, activeTabId } };
    });
  }, []);

  const activateTab = useCallback((worktreePath: string, tabId: string) => {
    setPanes(prev => {
      const pane = prev[worktreePath];
      if (!pane) return prev;
      return { ...prev, [worktreePath]: { ...pane, activeTabId: tabId } };
    });
  }, []);

  const launchPwsh = useCallback(
    (worktreePath: string) => startTab(worktreePath, 'pwsh', 'pwsh.exe', []),
    [startTab]
  );

  const launchAgent = useCallback(
    async (worktreePath: string, agent: SimpleAgent, vars: Record<string, string>) => {
      try {
        const resolved = await window.api.agents.resolveLaunch(
          agent.id,
          vars,
          selectedWorktree?.ws.id ?? null,
          worktreePath
        );
        await startTab(worktreePath, agent.name, resolved.command, resolved.args, agent.id);
      } catch (err: any) {
        setToast(`Failed to launch ${agent.name}: ${err.message}`);
      }
    },
    [selectedWorktree?.ws.id, startTab]
  );

  // ---- Worktree create/delete ------------------------------------------------

  const onCreateWorktree = useCallback(
    async (
      repo: Repo,
      branch: string,
      opts: { newBranch: boolean; baseBranch?: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        await window.api.worktrees.create(repo.path, branch, opts);
        await refreshWorktrees(repo);
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    },
    [refreshWorktrees]
  );

  const onDeleteWorktree = useCallback(
    async (ws: Workspace, repo: Repo, wt: Worktree) => {
      if (!confirm(`Delete worktree ${wt.path}?\n\nThis will remove the directory and prune git's worktree record.`)) return;
      try {
        await window.api.worktrees.remove(repo.path, wt.path, {});
        // close any open pane for this worktree
        setPanes(prev => {
          const pane = prev[wt.path];
          if (pane) for (const t of pane.tabs) if (t.ptyId) try { window.api.tabs.dispose(t.ptyId); } catch {}
          const { [wt.path]: _drop, ...rest } = prev;
          return rest;
        });
        if (selectedWorktree?.wt.path === wt.path) setSelectedWorktree(null);
        await refreshWorktrees(repo);
      } catch (err: any) {
        setToast(err.message);
      }
    },
    [refreshWorktrees, selectedWorktree?.wt.path]
  );

  // ---- Shortcuts -------------------------------------------------------------

  const runShortcut = useCallback(async (kind: 'explorer' | 'terminal' | 'vscode', p: string) => {
    try {
      await window.api.shortcuts[kind](p);
    } catch (err: any) {
      setToast(err.message);
    }
  }, []);

  const reposForSelected = selectedWorktree ? reposByWs[selectedWorktree.ws.id] ?? [] : [];

  const activePane = selectedWorktree ? panes[selectedWorktree.wt.path] ?? null : null;

  const agentsForWorkspace = useMemo(() => {
    return agents.filter(a => a.scope === 'global' || a.workspaceId === selectedWorktree?.ws.id);
  }, [agents, selectedWorktree?.ws.id]);

  return (
    <div className="app">
      <Sidebar
        workspaces={workspaces}
        reposByWs={reposByWs}
        worktreesByRepo={worktreesByRepo}
        selectedWorktreePath={selectedWorktree?.wt.path ?? null}
        onAddWorkspace={onAddWorkspace}
        onRemoveWorkspace={onCloseWorkspace}
        onExpandWorkspace={refreshRepos}
        onExpandRepo={refreshWorktrees}
        onSelectWorktree={onSelectWorktree}
        onNewWorktree={(ws, repo) => setNewWorktreeFor({ ws, repo })}
        onDeleteWorktree={onDeleteWorktree}
        onOpenAgents={() => setAgentsDialogOpen(true)}
      />
      {selectedWorktree && activePane ? (
        <WorktreePane
          ws={selectedWorktree.ws}
          repo={selectedWorktree.repo}
          worktree={selectedWorktree.wt}
          pane={activePane}
          agents={agentsForWorkspace}
          onLaunchPwsh={() => launchPwsh(selectedWorktree.wt.path)}
          onLaunchAgent={(agent, vars) => launchAgent(selectedWorktree.wt.path, agent, vars)}
          onCloseTab={tabId => closeTab(selectedWorktree.wt.path, tabId)}
          onActivateTab={tabId => activateTab(selectedWorktree.wt.path, tabId)}
          onShortcut={kind => runShortcut(kind, selectedWorktree.wt.path)}
        />
      ) : (
        <div className="pane-area">
          <div className="pane-empty">Select a worktree on the left to start working.</div>
        </div>
      )}
      {newWorktreeFor && (
        <NewWorktreeDialog
          repo={newWorktreeFor.repo}
          onCancel={() => setNewWorktreeFor(null)}
          onSubmit={async (branch, opts) => {
            const res = await onCreateWorktree(newWorktreeFor.repo, branch, opts);
            if (res.ok) setNewWorktreeFor(null);
            return res;
          }}
        />
      )}
      {agentsDialogOpen && (
        <AgentsDialog
          workspaceId={selectedWorktree?.ws.id ?? null}
          workspaceName={selectedWorktree?.ws.displayName ?? null}
          onClose={async () => {
            setAgentsDialogOpen(false);
            await refreshAgents(selectedWorktree?.ws.id ?? null);
          }}
          onError={msg => setToast(msg)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
};
