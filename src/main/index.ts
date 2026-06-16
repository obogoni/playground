import { app, shell, dialog, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { SEEDED_AGENTS } from '../shared/agents'
import { AdoGateway } from './ado-gateway'
import { ConfigStore } from './config-store'
import { emit, handle, onSend } from './ipc'
import { PtyPort } from './pty-port'
import { SessionManager, type EmitFn } from './session-manager'
import { ShortcutLauncher } from './shortcut-launcher'
import { TaskBoard } from './task-board'
import { buildTree } from './tree'
import { UpdateService } from './update-service'
import { createWorktree, removeWorktree } from './worktree-manager'
import { workspaceTemplates } from './workspace-config'
import { WorkspaceRegistry } from './workspace-registry'

// Lifted out of createWindow so SessionManager can reach its webContents for
// emit() (the app is single-window) and window-all-closed can killAll().
let mainWindow: BrowserWindow | null = null
let sessionManager: SessionManager | null = null

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

  // Lifted to module scope so SessionManager's emit() can reach it.
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

  // Agent sessions (AM2). SessionManager owns every session's lifecycle,
  // persistence, and stream routing; emit is lazily bound to the live window.
  const emitToWindow: EmitFn = (channel, payload) => {
    if (mainWindow) emit(mainWindow.webContents, channel, payload)
  }
  sessionManager = new SessionManager({
    port: new PtyPort(),
    config: configStore,
    emit: emitToWindow,
    fsExists: existsSync,
    seededAgents: SEEDED_AGENTS
  })
  const sessions = sessionManager
  handle('sessions:list', () => sessions.list())
  handle('sessions:spawn', ({ agentName, cwd }) => sessions.spawn(agentName, cwd))
  handle('sessions:stop', ({ id }) => sessions.stop(id))
  handle('sessions:respawn', ({ id }) => sessions.respawn(id))
  handle('sessions:remove', ({ id }) => sessions.remove(id))
  handle('sessions:attach', ({ id }) => sessions.attach(id))
  handle('sessions:detach', ({ id }) => sessions.detach(id))
  handle('dialog:pickFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose a folder for the agent',
      properties: ['openDirectory']
    })
    return { path: canceled || filePaths.length === 0 ? null : filePaths[0] }
  })
  onSend('session:input', ({ id, data }) => sessions.input(id, data))
  onSend('session:resize', ({ id, cols, rows }) => sessions.resize(id, cols, rows))

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
  // PTYs die on quit — no daemon (PRD Out of Scope). Kill every live session
  // so no orphaned shell/agent survives the window closing.
  sessionManager?.killAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
