import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceRegistry } from './modules/WorkspaceRegistry.js';
import { RepoScanner } from './modules/RepoScanner.js';
import { WorktreeManager } from './modules/WorktreeManager.js';
import { TabSessionRegistry } from './modules/TabSession.js';
import { AgentLibrary } from './modules/AgentLibrary.js';
import { ShortcutLauncher } from './modules/ShortcutLauncher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const userData = app.getPath('userData');
const registry = new WorkspaceRegistry(path.join(userData, 'workspaces.json'));
const scanner = new RepoScanner();
const worktrees = new WorktreeManager();
const tabs = new TabSessionRegistry();
const agents = new AgentLibrary(path.join(userData, 'agents.json'));
const shortcuts = new ShortcutLauncher();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  tabs.disposeAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  tabs.disposeAll();
});

function registerIpc() {
  ipcMain.handle('workspace:list', () => registry.list());
  ipcMain.handle('workspace:add', async (_e, p: string, name?: string) => registry.add(p, name));
  ipcMain.handle('workspace:remove', async (_e, id: string) => registry.remove(id));
  ipcMain.handle('workspace:pickFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('repos:scan', async (_e, workspaceId: string, workspacePath: string) =>
    scanner.scan(workspaceId, workspacePath)
  );

  ipcMain.handle('worktree:list', async (_e, repoPath: string) => {
    const list = await worktrees.list(repoPath);
    return list.map(w => ({ ...w, repoPath }));
  });
  ipcMain.handle(
    'worktree:create',
    async (_e, repoPath: string, branch: string, opts: { newBranch?: boolean; baseBranch?: string }) =>
      worktrees.create(repoPath, branch, opts)
  );
  ipcMain.handle(
    'worktree:remove',
    async (_e, repoPath: string, worktreePath: string, opts: { force?: boolean }) =>
      worktrees.remove(repoPath, worktreePath, opts ?? {})
  );

  ipcMain.handle(
    'tab:start',
    async (_e, opts: { cwd: string; cmd: string; args: string[]; cols?: number; rows?: number }) => {
      const id = tabs.start(opts, (id, data) => {
        mainWindow?.webContents.send('tab:data', id, data);
      }, (id, code) => {
        mainWindow?.webContents.send('tab:exit', id, code);
      });
      return id;
    }
  );
  ipcMain.on('tab:write', (_e, id: string, data: string) => tabs.write(id, data));
  ipcMain.on('tab:resize', (_e, id: string, cols: number, rows: number) => tabs.resize(id, cols, rows));
  ipcMain.on('tab:dispose', (_e, id: string) => tabs.dispose(id));

  ipcMain.handle('agents:listFor', async (_e, workspaceId: string | null) => {
    const ws = workspaceId ? await registry.get(workspaceId) : undefined;
    return agents.listFor(ws);
  });
  ipcMain.handle('agents:warnings', () => agents.getWarnings());
  ipcMain.handle('agents:save', async (_e, agent: any) => {
    const ws = agent.workspaceId ? await registry.get(agent.workspaceId) : undefined;
    return agents.save(agent, ws);
  });
  ipcMain.handle('agents:delete', async (_e, id: string, scope: 'global' | 'workspace', workspaceId?: string) => {
    const ws = workspaceId ? await registry.get(workspaceId) : undefined;
    return agents.delete(id, scope, ws);
  });
  ipcMain.handle(
    'agents:resolveLaunch',
    async (_e, agentId: string, vars: Record<string, string>, workspaceId: string | null, cwd: string) => {
      const ws = workspaceId ? await registry.get(workspaceId) : undefined;
      return agents.resolveLaunch(agentId, vars, cwd, ws);
    }
  );

  ipcMain.handle('shortcut:explorer', (_e, p: string) => shortcuts.openExplorer(p));
  ipcMain.handle('shortcut:terminal', (_e, p: string) => shortcuts.openTerminal(p));
  ipcMain.handle('shortcut:vscode', (_e, p: string) => shortcuts.openVsCode(p));

  ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url));
}
