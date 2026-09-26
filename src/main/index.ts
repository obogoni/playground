import { app, shell, clipboard, dialog, BrowserWindow, Notification, powerMonitor } from 'electron'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, watch, writeFileSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { readNotificationPrefs } from '../shared/notifications'
import { AdoGateway } from './ado-gateway'
import { AgentStepRunner, type AgentChild, type AgentSpawn } from './agent-step-runner'
import { createActivityHookServer } from './activity-hook-server'
import { linkTask } from './activity-notification'
import { buildClaudeHookSettings } from './claude-hook-settings'
import { readClipboardPaste } from './clipboard-reader'
import { ConfigStore } from './config-store'
import { commitFiles, listCommits, openCommit } from './commit-log'
import { diffStats, readDiffSides } from './file-diff'
import { readForView } from './file-reader'
import { changedSince, listBases, listDir } from './file-tree'
import { FileWatcher, type WatchPort } from './file-watcher'
import { git } from './git'
import { readCommits, readSyncState, runGitOp } from './git-sync'
import { runHookShell } from './hook-shell'
import { emit, handle, onSend } from './ipc'
import { createMcpResultServer } from './mcp-result-server'
import { purgePasteDir } from './paste-temp'
import { withPostCreateHook } from './post-create-hook'
import { PtyPort } from './pty-port'
import { resolvePostCreateCommand } from './repo-config'
import { scrubAuthEnv } from './scrub-auth-env'
import { SessionManager, type ActivityHooks, type EmitFn } from './session-manager'
import { LinkOpener } from './link-opener'
import { SessionNamePoller } from './session-name-poller'
import { SessionNotifier } from './session-notifier'
import { ShortcutLauncher, spawnDetached } from './shortcut-launcher'
import { TaskBoard } from './task-board'
import { TimeLogStore } from './time-log-store'
import { buildSnapshot, readGit } from './time-snapshot'
import { TimeTracker } from './time-tracker'
import { buildTree } from './tree'
import { UpdateService } from './update-service'
import { windowOpenDecision } from './url-policy'
import type { CtxDeps, GitFetchOptions, ShellResult } from './workflow-ctx'
import {
  discoverWorkflows,
  esbuildBinaryPath,
  esbuildBinarySubpath,
  loadWorkflow
} from './workflow-loader'
import { WorkflowManager } from './workflow-manager'
import { WorkflowRunStore } from './workflow-run-store'
import { scaffoldWorkflow } from './workflow-scaffold'
import { changedFilesOf, createWorktree, removeWorktree } from './worktree-manager'
import { workspaceTemplates } from './workspace-config'
import { WorkspaceRegistry } from './workspace-registry'

const execFileAsync = promisify(execFile)

// The workflow-loader bundles workflow.ts by spawning esbuild's native binary.
// Resolve it once here (main knows whether we're packaged): in a packaged app the
// binary lives in app.asar.unpacked (the in-asar copy is not spawnable); in dev
// it sits in node_modules. Passed into the loader — NOT set as ESBUILD_BINARY_PATH,
// which would leak into every child process the app spawns.
const esbuildBin = app.isPackaged
  ? esbuildBinaryPath(process.resourcesPath, process.platform, process.arch)
  : require.resolve(
      `@esbuild/${process.platform}-${process.arch}/${esbuildBinarySubpath(process.platform)}`
    )

/**
 * WF2 real `ctx.git.fetch` (WF2-07): a no-shell `git fetch`, mirroring the
 * worktree-manager `git` seam. `GIT_TERMINAL_PROMPT=0` fails fast instead of
 * hanging the main process on an un-answerable credential prompt; a non-zero
 * exit rejects (the promisified `execFile` throws), which `ctx.git.fetch`
 * propagates.
 */
async function gitFetch({ cwd, remote, branch }: GitFetchOptions): Promise<void> {
  const args = ['fetch', ...(remote ? [remote] : []), ...(branch ? [branch] : [])]
  await execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  })
}

/**
 * The branch a session's cwd has checked out, which names its task in a
 * notification (NOTF-30). `symbolic-ref` answers on an unborn branch and fails
 * on a detached HEAD; that, a folder outside git, or git taking over 2 s all
 * mean no branch (NOTF-34).
 */
async function readBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd,
      timeout: 2000,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

/**
 * The Explorer file list, read through Windows PowerShell 5.1. On Electron
 * 39.8.10 `clipboard.readBuffer('FileNameW')` returns only the first copied file
 * and `CF_HDROP` comes back empty, so `GetFileDropList()` on an STA thread is the
 * only reader that sees every path — it is what opencode and Claude Code use.
 * `-NoProfile` keeps a user's profile out of the paste path, and UTF-8 output
 * keeps a `relatório.png` intact (TSP-37).
 */
const FILE_DROP_LIST_COMMAND = [
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8;',
  'Add-Type -AssemblyName System.Windows.Forms;',
  '[System.Windows.Forms.Clipboard]::GetFileDropList()'
].join(' ')

/**
 * One line per copied path. The 5 s timeout is the contract's failure bound
 * (TSP-16): a wedged shell turns into a failed paste the pane reports, never
 * into a paste that hangs forever.
 */
async function readFileDropList(): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', FILE_DROP_LIST_COMMAND],
    { timeout: 5_000, windowsHide: true, encoding: 'utf8' }
  )
  return stdout
}

/**
 * The real `fs.watch` behind `FileWatcher`'s port. A path that vanishes between
 * the selection and the watch throws synchronously, and an unwatchable path
 * errors asynchronously; neither may take the main process down, so both come
 * back as a handle that watches nothing.
 */
const watchPort: WatchPort = (path, opts, listener) => {
  try {
    const watcher = watch(path, { recursive: opts.recursive }, (_event, filename) =>
      listener(typeof filename === 'string' ? filename : '')
    )
    watcher.on('error', () => watcher.close())
    return { close: () => watcher.close() }
  } catch {
    return { close: () => {} }
  }
}

/**
 * WF2 real `ctx.sh` runner (WF2-06, WF2-D6): spawn the command **through a
 * shell** and capture `{code, stdout, stderr}`. It never throws — the `ctx.sh`
 * gate in `workflow-ctx` decides throw-vs-`allowFail` from the exit code.
 */
function runShell(cmd: string, opts: { cwd: string }): Promise<ShellResult> {
  return new Promise<ShellResult>((resolve) => {
    const child = spawn(cmd, { cwd: opts.cwd, shell: true, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => (stdout += chunk.toString()))
    child.stderr?.on('data', (chunk) => (stderr += chunk.toString()))
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr + String(err) }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

/**
 * WF3 real `AgentSpawn` seam (WF3-01): spawn the resolved `claude` binary **directly**
 * (`shell:false`, argv verbatim) with **stdin closed** (`stdio:['ignore','pipe','pipe']`),
 * adapting `child_process.spawn` to the runner's `AgentChild` interface. The DI'd runner
 * owns the retry/validate/cancel logic; this seam is the one hand-verified I/O boundary.
 */
const spawnAgent: AgentSpawn = (bin, argv, { cwd, env }): AgentChild => {
  const child = spawn(bin, argv, {
    cwd,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  return {
    onStdout: (listener) => child.stdout?.on('data', (chunk) => listener(chunk.toString())),
    onStderr: (listener) => child.stderr?.on('data', (chunk) => listener(chunk.toString())),
    onError: (listener) => child.on('error', listener),
    onClose: (listener) => child.on('close', (code) => listener(code)),
    kill: () => child.kill()
  }
}

// Lifted out of createWindow so SessionManager can reach its webContents for
// emit() (the app is single-window) and window-all-closed can killAll().
let mainWindow: BrowserWindow | null = null
let sessionManager: SessionManager | null = null
let timeTracker: TimeTracker | null = null
/** Closes the activity hook listener on quit; set once the server is created. */
let stopHookServer: (() => Promise<void>) | null = null
/** Kills the in-flight `claude agents --json` on quit (SNAME-14). */
let namePoller: SessionNamePoller | null = null

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

  // Every new window is denied; an https link one asked for opens in the
  // browser, anything else is only logged by its scheme (#115, AD-044). The
  // linked task card's `target="_blank"` link lands here.
  win.webContents.setWindowOpenHandler((details) => {
    const decision = windowOpenDecision(details.url)
    if (decision.open) void shell.openExternal(details.url)
    else console.warn(`[window-open] ${decision.reason}`)
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

  handle('app:version', () => app.getVersion())

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
  // WPC-10: ONE hook-wrapped create, shared by the IPC handler below and the
  // workflow ctx further down. Because both consumers get this same wrapper —
  // never bare `createWorktree` — no call path can skip a repo's init command.
  const createWorktreeWithHook = withPostCreateHook(createWorktree, {
    // HWC-01: repo-first, then the workspace's `postCreateCommands[<repoName>]`,
    // so a repo needs no committed `.app/config.json` to be initialized.
    readCommand: resolvePostCreateCommand,
    shell: runHookShell
  })
  handle(
    'worktrees:create',
    ({ repoPath, branch, baseBranch, worktreeTemplate, updateBase, onExisting }) =>
      createWorktreeWithHook(repoPath, branch, baseBranch, worktreeTemplate, updateBase, onExisting)
  )
  handle('worktrees:remove', ({ repoPath, worktreePath, force }) =>
    removeWorktree(repoPath, worktreePath, { force })
  )
  handle('worktrees:changes', ({ worktreePath }) => changedFilesOf(worktreePath))
  handle('git:sync-state', ({ worktreePath }) => readSyncState(worktreePath))
  handle('git:commits', ({ worktreePath }) => readCommits(worktreePath))
  handle('git:run', ({ worktreePath, op, remote }) => runGitOp(worktreePath, op, remote))

  // The Files direction (FXPL-02/08/09/16/21). Every handler delegates; the
  // modules behind them are unit-tested, this is only the wiring.
  const fileWatcher = new FileWatcher({
    watch: watchPort,
    // `--git-dir` answers relatively for a primary checkout and absolutely for
    // a linked worktree, whose git dir lives outside its own root.
    resolveGitDir: async (worktreePath) => {
      const { stdout } = await git(worktreePath, ['rev-parse', '--git-dir'])
      return resolve(worktreePath, stdout.trim())
    },
    schedule: {
      after: (ms, fn) => {
        const timer = setTimeout(fn, ms)
        return () => clearTimeout(timer)
      }
    },
    emit: (event) => {
      if (mainWindow) emit(mainWindow.webContents, 'files:changed', event)
    }
  })
  handle('files:list-dir', ({ worktreePath, dir }) => listDir(worktreePath, dir))
  handle('files:changed-since', ({ worktreePath, base }) => changedSince(worktreePath, base))
  handle('files:bases', ({ worktreePath }) => listBases(worktreePath))
  handle('files:read', ({ worktreePath, relPath }) => readForView(worktreePath, relPath))
  handle('files:watch', ({ worktreePath }) => fileWatcher.select(worktreePath))
  handle('files:diff-sides', ({ worktreePath, request }) => readDiffSides(worktreePath, request))
  handle('files:diff-stats', ({ worktreePath, mode, base }) => diffStats(worktreePath, mode, base))
  handle('commits:list', ({ worktreePath, base, cursor }) =>
    listCommits(worktreePath, base, cursor)
  )
  handle('commits:files', ({ worktreePath, sha }) => commitFiles(worktreePath, sha))
  // The renderer sends a sha, never an address: `shell.openExternal` is only
  // ever reached through `openCommit`, which builds the URL itself and refuses
  // anything that is not https (FCMT-28).
  handle('commits:open', ({ worktreePath, sha }) =>
    openCommit(worktreePath, sha, (url) => shell.openExternal(url))
  )
  // Close every watch handle before the process goes away (FXPL-23).
  app.on('will-quit', () => {
    void fileWatcher.select(null)
  })

  const launcher = new ShortcutLauncher()
  handle('shortcuts:launch', ({ tool, path }) => launcher.launch(tool, path))

  const linkOpener = new LinkOpener({
    homedir,
    stat,
    openPath: (path) => shell.openPath(path),
    openExternal: (url) => shell.openExternal(url),
    spawnDetached,
    // `assoc` exits 0 only when the extension has a ProgId; a plain `exec`
    // would resolve either way, so the exit code is what answers the question.
    hasAssociation: (ext) =>
      execFileAsync('cmd.exe', ['/c', 'assoc', ext], { windowsHide: true }).then(
        () => true,
        () => false
      )
  })
  handle('links:probe', ({ cwd, paths }) => linkOpener.probe(cwd, paths))
  handle('links:openUrl', ({ url }) => linkOpener.openUrl(url))
  handle('links:openPath', ({ cwd, pathText }) => linkOpener.openPath(cwd, pathText))
  handle('links:openFileUrl', ({ url }) => linkOpener.openFileUrl(url))

  const adoGateway = new AdoGateway()
  const taskBoard = new TaskBoard(configStore, adoGateway)
  handle('tasks:list', () => taskBoard.list())
  handle('tasks:pin', ({ input }) => taskBoard.pin(input))
  handle('tasks:unpin', (ref) => taskBoard.unpin(ref))
  handle('tasks:refresh', () => taskBoard.refresh())
  handle('tasks:parent', ({ id, org, project }) => adoGateway.parentOf({ id, org, project }))

  // Agent sessions (AM2). SessionManager owns every session's lifecycle,
  // persistence, and stream routing; emit is lazily bound to the live window.
  const emitToWindow: EmitFn = (channel, payload) => {
    if (mainWindow) emit(mainWindow.webContents, channel, payload)
  }

  /** Bring the window forward; a click on a stale notification after the window
   *  is gone does nothing (NOTF-21). */
  const revealWindow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  /** A minimized window counts as not focused: its rail cannot be seen (NOTF-24). */
  const windowFocused = (): boolean =>
    !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused() && !mainWindow.isMinimized()

  /**
   * Notifications still on screen. An unreferenced `Notification` can be
   * garbage-collected before the user clicks it, silently dropping the click
   * handler, so each one is held until it is clicked, closed or fails.
   */
  const liveNotifications = new Set<Notification>()

  /** Show a native notification; skipped silently where the OS has none (NOTF-06). */
  const showOs = (title: string, body: string, onClick?: () => void): void => {
    if (!Notification.isSupported()) return
    const notification = new Notification({ title, body })
    liveNotifications.add(notification)
    const release = (): void => {
      liveNotifications.delete(notification)
    }
    notification.on('click', () => {
      release()
      onClick?.()
    })
    notification.on('close', release)
    notification.on('failed', release)
    notification.show()
  }

  /**
   * WF2 author `ctx.notify({ toast })` sink (WF2-09) AND WF4 manager lifecycle toast
   * (WF4-13): a native OS toast. A lifecycle toast (`opts.runId`) attaches a `click`
   * handler that surfaces the window and asks the renderer to reveal the run
   * (`workflow:focus-run`, WF4-15); an author toast (no `runId`) is a plain
   * notification, behaviour unchanged.
   */
  const notifier = (title: string, body: string, opts?: { runId?: string }): void => {
    const runId = opts?.runId
    showOs(
      title,
      body,
      runId
        ? () => {
            revealWindow()
            emitToWindow('workflow:focus-run', { runId })
          }
        : undefined
    )
  }

  // Time tracking (AD-021). The tracker must recover the periods a crash left
  // open before SessionManager exists, so no new run can mix with them.
  const tracker = new TimeTracker({
    store: new TimeLogStore(app.getPath('userData')),
    now: Date.now,
    newId: randomUUID,
    resolveSnapshot: (cwd) => {
      const pinnedTitles = new Map<number, string>()
      for (const task of taskBoard.list().tasks) {
        if (task.details && !pinnedTitles.has(task.id))
          pinnedTitles.set(task.id, task.details.title)
      }
      return buildSnapshot({
        cwd,
        ...readGit(cwd),
        workspacePaths: registry.list().map((ws) => ws.path),
        pinnedTitles
      })
    },
    emit: () => emitToWindow('time:changed', { at: new Date().toISOString() })
  })
  tracker.recover()
  timeTracker = tracker
  handle('time:snapshot', () => tracker.snapshot())
  handle('time:pause', ({ sessionId }) => tracker.pause(sessionId))
  handle('time:resume', ({ sessionId }) => tracker.resume(sessionId))
  handle('time:delete', ({ id }) => tracker.deletePeriod(id))
  handle('time:adjust', ({ id, start, end }) => tracker.adjustPeriod(id, start, end))
  // The sidecar heartbeat bounds what a crash can lose to 60 s (TIME-04); unref'd
  // so it never keeps the process alive.
  setInterval(() => tracker.heartbeat(), 60_000).unref()
  powerMonitor.on('suspend', () => tracker.suspend())
  powerMonitor.on('resume', () => tracker.resumeFromSuspend())
  // lock-screen / unlock-screen are deliberately not subscribed (TIME-08).

  const sessionNotifier = new SessionNotifier({
    prefs: () => readNotificationPrefs(configStore.get().ui),
    windowFocused,
    // Cached pins only: a notification never waits on Azure DevOps (NOTF-35).
    linkedTask: async (cwd) => linkTask(await readBranch(cwd), taskBoard.list().tasks),
    showOs,
    reveal: revealWindow,
    emit: emitToWindow
  })

  // Claude Code activity hooks (AD-019). The loopback server takes a moment to
  // bind, so `settingsPath` starts null and is filled once it is listening;
  // SessionManager reads it per spawn, and a null means the session launches
  // exactly as it did before the feature (ACTV-29).
  // SPEC_DEVIATION: design.md says the server starts *before* SessionManager is
  // constructed.
  // Reason: `app.whenReady().then()` is synchronous here, and making the whole
  // block async to await one bind would reorder every other handler's
  // registration. A session spawned in the first milliseconds simply reports no
  // activity, which is the documented degrade path.
  const hookServer = createActivityHookServer()
  stopHookServer = () => hookServer.stop()
  const activityHooks: ActivityHooks = {
    settingsPath: null,
    register: (token, sessionId) => hookServer.register(token, sessionId),
    revoke: (token) => hookServer.revoke(token)
  }
  hookServer
    .start()
    .then(({ url }) => {
      // Rewritten every launch: the port is ephemeral.
      const settingsPath = join(app.getPath('userData'), 'agent-hooks', 'claude-settings.json')
      mkdirSync(join(app.getPath('userData'), 'agent-hooks'), { recursive: true })
      writeFileSync(settingsPath, JSON.stringify(buildClaudeHookSettings(url), null, 2), 'utf8')
      activityHooks.settingsPath = settingsPath
    })
    .catch((err) => console.error('[activity-hooks] server did not start', err))

  // Resolve the `claude` binary (WF3-23): the first `where claude` hit on PATH, else the
  // optional `agent.claudePath` config override, else throw so the step fails clearly
  // without spawning. `agent` is not a typed AppConfig section yet (WF4+), read via cast.
  // Declared here, ahead of the SessionManager, because the name poller needs it too.
  const resolveClaude = (): string => {
    try {
      const out = execFileSync('where', ['claude'], { encoding: 'utf8', windowsHide: true })
      const first = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0)
      if (first) return first
    } catch {
      // not on PATH — fall through to the config override
    }
    const configured = (configStore.get() as { agent?: { claudePath?: string } }).agent?.claudePath
    if (configured) return configured
    throw new Error('agent binary not found')
  }

  // Session names (AD-040): the poller reads `claude agents --json` through the
  // same spawn seam and env posture as the headless runner; `cwd` is only there
  // because spawn needs one — the listing is machine-wide. This wiring is the
  // hand-verified boundary (TESTING.md); the CDP smoke in T8 exercises it.
  namePoller = new SessionNamePoller({
    spawn: spawnAgent,
    resolveBin: resolveClaude,
    cwd: app.getPath('userData'),
    env: scrubAuthEnv(process.env),
    log: (msg) => console.error(msg)
  })
  sessionManager = new SessionManager({
    port: new PtyPort(),
    config: configStore,
    emit: emitToWindow,
    fsExists: existsSync,
    lifecycle: tracker,
    hooks: activityHooks,
    // handle() is async since it looks the task up; a failure after the lookup
    // (in showOs, say) must be logged, not left as an unhandled rejection.
    onActivityChange: (change) => {
      sessionNotifier
        .handle(change)
        .catch((err) => console.error('[notifications] session notification failed', err))
    },
    names: namePoller
  })
  const sessions = sessionManager
  hookServer.onEvent((sessionId, payload) => sessions.handleHookEvent(sessionId, payload))
  namePoller.onListing((names) => sessions.applyNames(names))
  handle('sessions:list', () => sessions.list())
  handle('sessions:spawn', ({ agentName, cwd, adhocCommand }) =>
    sessions.spawn(agentName, cwd, adhocCommand)
  )
  // Returning the promise is load-bearing: ipcMain.handle awaits it, so the
  // renderer's `sessions:stop` only resolves once the PTY has really exited
  // (WRFT-05) — which is what lets a worktree removal start without racing
  // handles the agent's children still hold.
  handle('sessions:stop', ({ id }) => sessions.stop(id))
  handle('sessions:respawn', ({ id }) => sessions.respawn(id))
  handle('sessions:rename', ({ id, title }) => sessions.rename(id, title))
  handle('sessions:duplicate', ({ id }) => sessions.duplicate(id))
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

  // Rich terminal paste (TSP-14, TSP-16). The clipboard is read here because the
  // renderer `clipboard` is deprecated from Electron 40 and the file list needs a
  // child process. An image is written to a temp PNG before the invoke resolves,
  // so the path the renderer pastes always points at a file that already exists —
  // the agents read it the instant it lands.
  const pasteDir = join(tmpdir(), 'playground-paste')
  handle('clipboard:read-paste', () =>
    readClipboardPaste({
      readText: () => clipboard.readText(),
      formats: () => clipboard.availableFormats(),
      readImagePng: () => {
        const image = clipboard.readImage()
        return image.isEmpty() ? null : image.toPNG()
      },
      readFileDropList,
      writeFile: async (path, data) => {
        await mkdir(pasteDir, { recursive: true })
        await writeFile(path, data)
      },
      pasteDir,
      now: () => new Date(),
      rand: () => randomBytes(3).toString('hex')
    })
  )
  // Pasted images live a week (TSP-18). The purge never blocks or fails startup
  // (TSP-19): a missing directory is normal and the next start tries again.
  try {
    purgePasteDir(pasteDir, Date.now())
  } catch (err) {
    console.error('[paste] purging old pasted images failed', err)
  }

  // WF3 agent step: one shared MCP result server (started lazily by the runner on the
  // first agent step, reused across steps/runs — WF3-10) forces structured output; the
  // DI'd runner drives a headless `claude` child through it (real spawn seam,
  // `resolveClaude`, `randomUUID` tokens) and is injected as the ctx `agent` capability.
  const resultServer = createMcpResultServer()
  const agentRunner = new AgentStepRunner({
    server: resultServer,
    spawn: spawnAgent,
    resolveClaude,
    genToken: randomUUID
  })

  // Workflows engine (WF2). The manager runs one workflow at a time in the main
  // process; ctxDeps assembles the real deterministic capability seams (worktree
  // fns, a no-shell git fetch, a shell-hosted `ctx.sh`, ADO, native toasts, and the
  // WF3 headless agent step).
  const workflowsAdo = new AdoGateway()
  const ctxDeps: CtxDeps = {
    worktree: {
      // The hook-wrapped create (WPC-10) — a workflow-created worktree for an
      // agent is the case that most needs the repo's init command to have run.
      create: createWorktreeWithHook,
      remove: removeWorktree,
      changedFiles: changedFilesOf
    },
    gitFetch,
    runShell,
    ado: {
      getWorkItemWithRelations: workflowsAdo.getWorkItemWithRelations.bind(workflowsAdo),
      getWorkItems: workflowsAdo.getWorkItems.bind(workflowsAdo)
    },
    notifier,
    agent: agentRunner
  }
  const workflowsRoot = join(homedir(), '.playground', 'workflows')
  const workflows = new WorkflowManager({
    workflowsRoot,
    loader: { discoverWorkflows, loadWorkflow: (folder) => loadWorkflow(folder, esbuildBin) },
    ctxDeps,
    store: new WorkflowRunStore(join(app.getPath('userData'), 'workflow-runs')),
    emit: emitToWindow,
    notifier
  })
  handle('workflows:list', () => workflows.list())
  handle('workflows:run', ({ id, input }) => workflows.run({ id, input }))
  handle('workflows:cancel', ({ runId }) => workflows.cancel(runId))
  handle('workflows:respond', ({ runId, decision }) => workflows.respond(runId, decision))
  handle('workflows:reload', () => workflows.reload())
  // Scaffold a new workflow folder from a template, then reveal it in the OS file
  // manager (WF5-25); the create logic is the unit-tested workflow-scaffold module.
  handle('workflows:scaffold', async ({ name }) => {
    const result = await scaffoldWorkflow(workflowsRoot, name)
    if (result.ok) shell.showItemInFolder(result.path)
    return result
  })

  // Free the shared MCP result server's loopback port when the app quits (WF3-10).
  app.on('will-quit', () => {
    void resultServer.stop()
  })

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
  // After killAll: its synchronous finalize already ended each run, so this only
  // closes whatever is still open, at the quit instant (TIME-09).
  timeTracker?.closeAll()
  namePoller?.dispose()
  void stopHookServer?.()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
