import { app, shell, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { AdoGateway } from './ado-gateway'
import { ConfigStore } from './config-store'
import { emit, handle, onSend } from './ipc'
import { PtyPort, type PtyHandle } from './pty-port'
import { ShortcutLauncher } from './shortcut-launcher'
import { buildSpawnPlan, type AgentDef } from './spawn-plan'
import { TaskBoard } from './task-board'
import { buildTree } from './tree'
import { UpdateService } from './update-service'
import { createWorktree, removeWorktree } from './worktree-manager'
import { workspaceTemplates } from './workspace-config'
import { WorkspaceRegistry } from './workspace-registry'

// Lifted out of createWindow so the spike orchestrator can reach its
// webContents for emit(). The app is single-window.
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1100,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Lifted to module scope so the spike orchestrator can emit() to it.
  mainWindow = win
  win.on('closed', () => {
    mainWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows. Derive it from the packaged identity so the
  // nightly build (a distinct app name) groups separately from stable on the taskbar.
  // Normalize the name into a dot-separated, lowercase slug so a spaced/cased name
  // (e.g. "Playground Nightly") can't yield an invalid AUMID like `com.Playground Nightly`.
  const aumidSlug = app
    .getName()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
  electronApp.setAppUserModelId(`com.${aumidSlug}`)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const configStore = new ConfigStore(app.getPath('userData'))
  handle('config:get', () => configStore.get())
  handle('config:patch', (patch) => configStore.patch(patch))

  const registry = new WorkspaceRegistry(configStore)
  handle('workspaces:add', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Register workspace folder',
      properties: ['openDirectory']
    })
    if (canceled || filePaths.length === 0) return null
    return registry.add(filePaths[0])
  })
  handle('workspaces:remove', ({ id }) => registry.remove(id))
  handle('workspaces:templates', ({ workspacePath }) => workspaceTemplates(workspacePath))
  handle('tree:get', () => buildTree(registry))
  handle('worktrees:create', ({ repoPath, branch, baseBranch, worktreeTemplate }) =>
    createWorktree(repoPath, branch, baseBranch, worktreeTemplate)
  )
  // No force path from the UI in v1 — the dirty guard is not overridable here.
  handle('worktrees:remove', ({ repoPath, worktreePath }) => removeWorktree(repoPath, worktreePath))

  const launcher = new ShortcutLauncher()
  handle('shortcuts:launch', ({ tool, path }) => launcher.launch(tool, path))

  const taskBoard = new TaskBoard(configStore, new AdoGateway())
  handle('tasks:list', () => taskBoard.list())
  handle('tasks:pin', ({ input }) => taskBoard.pin(input))
  handle('tasks:unpin', (ref) => taskBoard.unpin(ref))
  handle('tasks:refresh', () => taskBoard.refresh())

  // ── AM1 spike — throwaway, replaced by SessionManager in AM2 ──────────────
  // One hard-coded agent, one fixed session id, no Map, no persistence. The
  // permanent plumbing it rides on (PtyPort, buildSpawnPlan, emit/onSend, the
  // streaming contract) stays; this wiring block is what AM2 throws away.
  registerSpikeAgent()
  // ──────────────────────────────────────────────────────────────────────────

  // Silent auto-update. Inert under `electron-vite dev` unless PLAYGROUND_FORCE_UPDATE=1
  // opts into the real GitHub feed via dev-app-update.yml (local update-flow testing).
  new UpdateService({
    updater: autoUpdater,
    isPackaged: app.isPackaged,
    forceDev: process.env.PLAYGROUND_FORCE_UPDATE === '1',
    // Keep the UX silent (no dialogs) but surface failures to the log so CI-shipped
    // builds are diagnosable in the field.
    log: (msg, err) => console.error(`[update] ${msg}`, err ?? '')
  }).start()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // AM1 spike: PTYs die on quit — no daemon (PRD Out of Scope). Kill the live
  // session so no orphaned shell/agent survives the window closing.
  spikeSession?.kill()
  spikeSession = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ── AM1 spike — throwaway, replaced by SessionManager in AM2 ────────────────
// Hard-coded for AM1; AM3 makes agents configurable in AppConfig.
const CLAUDE: AgentDef = { name: 'Claude', command: 'claude', args: [] }
// Hard-coded cwd for the spike — the developer's home. The cwd/worktree model
// is AM2. AM1 proves one live agent in one fixed folder.
const SPIKE_CWD = app.getPath('home')
const SPIKE_ID = 'spike'

let spikeSession: PtyHandle | null = null

/**
 * Spawns the one hard-coded agent through the real spawn-plan + PtyPort and
 * wires it to the streaming IPC. A single module-scoped handle (no Map yet);
 * respawn replaces any prior PTY. Everything here is throwaway — AM2 replaces
 * it with SessionManager — but the seams it calls are permanent.
 */
function registerSpikeAgent(): void {
  const port = new PtyPort()

  handle('sessions:spawn', ({ cwd }) => {
    spikeSession?.kill()
    const plan = buildSpawnPlan(CLAUDE, cwd || SPIKE_CWD, 'pwsh')
    const session = port.spawn(plan)
    session.onData((data) => {
      if (mainWindow) emit(mainWindow.webContents, 'session:data', { id: SPIKE_ID, data })
    })
    session.onExit(({ exitCode }) => {
      if (mainWindow) emit(mainWindow.webContents, 'session:exit', { id: SPIKE_ID, exitCode })
      spikeSession = null
    })
    spikeSession = session
    return { id: SPIKE_ID }
  })

  // Tear down the live PTY on demand (toggle-off / Close) so a hidden agent
  // isn't left running until app quit. Throwaway alongside the rest of AM1;
  // AM2's SessionManager owns lifecycle per session.
  handle('sessions:kill', ({ id }) => {
    if (id !== SPIKE_ID) return
    spikeSession?.kill()
    spikeSession = null
  })

  // Every streaming payload carries the session id; gate on it so a stale or
  // wrong id can't write/resize the live session (the contract AM2 fans out on).
  onSend('session:input', ({ id, data }) => {
    if (id === SPIKE_ID) spikeSession?.write(data)
  })
  onSend('session:resize', ({ id, cols, rows }) => {
    if (id !== SPIKE_ID) return
    // node-pty throws on zero/negative dimensions (a fit() before layout).
    if (cols > 0 && rows > 0) spikeSession?.resize(cols, rows)
  })
}
// ────────────────────────────────────────────────────────────────────────────

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
