import { contextBridge, ipcRenderer } from 'electron';
import type { Workspace, Repo, Worktree, SimpleAgent, ResolvedLaunch, AgentWarning } from '../shared/types.js';

const api = {
  workspaces: {
    list: (): Promise<Workspace[]> => ipcRenderer.invoke('workspace:list'),
    add: (p: string, name?: string): Promise<Workspace> => ipcRenderer.invoke('workspace:add', p, name),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('workspace:remove', id),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('workspace:pickFolder')
  },
  repos: {
    scan: (workspaceId: string, workspacePath: string): Promise<Repo[]> =>
      ipcRenderer.invoke('repos:scan', workspaceId, workspacePath)
  },
  worktrees: {
    list: (repoPath: string): Promise<Worktree[]> => ipcRenderer.invoke('worktree:list', repoPath),
    create: (repoPath: string, branch: string, opts: { newBranch?: boolean; baseBranch?: string }): Promise<Worktree> =>
      ipcRenderer.invoke('worktree:create', repoPath, branch, opts),
    remove: (repoPath: string, worktreePath: string, opts: { force?: boolean } = {}): Promise<void> =>
      ipcRenderer.invoke('worktree:remove', repoPath, worktreePath, opts)
  },
  tabs: {
    start: (opts: { cwd: string; cmd: string; args: string[]; cols?: number; rows?: number }): Promise<string> =>
      ipcRenderer.invoke('tab:start', opts),
    write: (id: string, data: string): void => ipcRenderer.send('tab:write', id, data),
    resize: (id: string, cols: number, rows: number): void => ipcRenderer.send('tab:resize', id, cols, rows),
    dispose: (id: string): void => ipcRenderer.send('tab:dispose', id),
    onData: (cb: (id: string, data: string) => void) => {
      const listener = (_e: unknown, id: string, data: string) => cb(id, data);
      ipcRenderer.on('tab:data', listener);
      return () => ipcRenderer.removeListener('tab:data', listener);
    },
    onExit: (cb: (id: string, code: number) => void) => {
      const listener = (_e: unknown, id: string, code: number) => cb(id, code);
      ipcRenderer.on('tab:exit', listener);
      return () => ipcRenderer.removeListener('tab:exit', listener);
    }
  },
  agents: {
    listFor: (workspaceId: string | null): Promise<SimpleAgent[]> => ipcRenderer.invoke('agents:listFor', workspaceId),
    warnings: (): Promise<AgentWarning[]> => ipcRenderer.invoke('agents:warnings'),
    save: (agent: SimpleAgent): Promise<SimpleAgent> => ipcRenderer.invoke('agents:save', agent),
    delete: (id: string, scope: 'global' | 'workspace', workspaceId?: string): Promise<void> =>
      ipcRenderer.invoke('agents:delete', id, scope, workspaceId),
    resolveLaunch: (
      agentId: string,
      vars: Record<string, string>,
      workspaceId: string | null,
      cwd: string
    ): Promise<ResolvedLaunch> => ipcRenderer.invoke('agents:resolveLaunch', agentId, vars, workspaceId, cwd)
  },
  shortcuts: {
    explorer: (p: string): Promise<void> => ipcRenderer.invoke('shortcut:explorer', p),
    terminal: (p: string): Promise<void> => ipcRenderer.invoke('shortcut:terminal', p),
    vscode: (p: string): Promise<void> => ipcRenderer.invoke('shortcut:vscode', p)
  }
};

contextBridge.exposeInMainWorld('api', api);

export type ApiSurface = typeof api;
