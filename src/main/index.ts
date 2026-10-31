import { app, shell, clipboard, dialog, BrowserWindow, Notification, powerMonitor } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { readNotificationPrefs } from '../shared/notifications'
import type { PeriodSnapshotFields } from '../shared/time'
import type { TasksSnapshot } from '../shared/tasks'
import { AdoGateway } from './ado-gateway'
import { AdoPrClient, openPrLink } from './ado-pr'
import type { AgentChild, AgentSpawn } from './agent-spawn'
import { BinaryResolver } from './binary-resolver'
import { createActivityHookServer } from './activity-hook-server'
import { linkTask } from './activity-notification'
import { buildClaudeHookSettings } from './claude-hook-settings'
import { readClipboardPaste } from './clipboard-reader'
import { ConfigStore } from './config-store'
import { commitFiles, listCommits, openCommit } from './commit-log'
import {
  createAppDiagnostics,
  diagnostics,
  diagnosticsEnabled,
  installDiagnostics
} from './diagnostics'
import { diffStats, readDiffSides } from './file-diff'
import { discardChanges } from './file-discard'
import { readForView } from './file-reader'
import { changedSince, listBases, listDir } from './file-tree'
import { FileWatcher, type Scheduler } from './file-watcher'
import { git } from './git'
import { GitHubGateway } from './github-gateway'
import { GitHubPrClient } from './github-pr'
import { GitStateWatcher } from './git-state-watcher'
import { readCommits, readSyncState, runGitOp } from './git-sync'
import { runHookShell } from './hook-shell'
import { checkIgnored } from './ignore-check'
import { emit, handle, onSend } from './ipc'
import { KnownWorktrees } from './known-worktrees'
import { purgePasteDir } from './paste-temp'
import { checkCreatePaths } from './path-limits'
import { ensurePromptsFolder, listPrompts } from './prompt-library'
import { NODE_PRESET_FS, createPresetStore } from './agent-preset-store'
import { findOnPath } from './path-lookup'
import { startLoopDelayLog } from './perf-monitor'
import { withPostCreateHook } from './post-create-hook'
import { PtyHostClient } from './pty-host-client'
import { forkPtyHost } from './pty-host-fork'
import { RecountScheduler } from './recount-scheduler'
import { resolvePostCreateCommand } from './repo-config'
import { scanRepos } from './repo-scanner'
import { parseRemote } from './remote-url'
import { scrubAuthEnv } from './scrub-auth-env'
import { SessionManager, type ActivityHooks, type EmitFn } from './session-manager'
import { LinkOpener } from './link-opener'
import { SessionNamePoller } from './session-name-poller'
import { SessionNotifier } from './session-notifier'
import { ShortcutLauncher, spawnDetached } from './shortcut-launcher'
import { openPinnedTask, TaskBoard } from './task-board'
import { TimeLogStore } from './time-log-store'
import { buildSnapshot, readGitAsync } from './time-snapshot'
import { TimeTracker } from './time-tracker'
import { buildTree } from './tree'
import { UpdateService } from './update-service'
import { windowOpenDecision } from './url-policy'
import { watchPort } from './watch-port'
import {
  changedFilesOf,
  createWorktree,
  listWorktrees,
  removeWorktree,
  worktreeStatus
} from './worktree-manager'
import { workspaceTemplates } from './workspace-config'
import { runAutoPin } from './worktree-tasks'
import { runLinkedPin } from './linked-task-pin'
import { WorkspaceRegistry } from './workspace-registry'

const execFileAsync = promisify(execFile)

/**
 * The branch a session's cwd has checked out, which names its task in a
 * notification (NOTF-30). `symbolic-ref` answers on an unborn branch and fails
 * on a detached HEAD; that, a folder outside git, or git taking over 2 s all
 * mean no branch (NOTF-34).
 */
/**
 * Whether any repository in these workspaces has a GitHub remote — the `gh`
 * chip's condition (FPRG-02). Each repository's `git remote -v` goes through
 * the paced runner; the first GitHub remote found ends the search. A folder
 * or repository that cannot be read has no remote to count.
 */
async function anyGitHubRemote(workspacePaths: string[]): Promise<boolean> {
  for (const workspacePath of workspacePaths) {
    const repos = await scanRepos(workspacePath).catch(() => [])
    for (const repo of repos) {
      try {
        const { stdout } = await git(repo.path, ['remote', '-v'])
        const urls = stdout.split(/\s+/)
        if (urls.some((url) => parseRemote(url)?.provider === 'github')) return true
      } catch {
        // Not readable by git: nothing to count.
      }
    }
  }
  return false
}

async function readBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await git(cwd, ['symbolic-ref', '--short', 'HEAD'], { timeoutMs: 2000 })
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
 * The git dir both watchers watch. `--git-dir` answers relatively for a
 * primary checkout and absolutely for a linked worktree, whose git dir lives
 * outside its own root.
 */
async function resolveGitDir(worktreePath: string): Promise<string> {
  const { stdout } = await git(worktreePath, ['rev-parse', '--git-dir'])
  return resolve(worktreePath, stdout.trim())
}

/** The real delay behind the Files watcher's and the recount scheduler's `Scheduler`. */
const timerScheduler: Scheduler = {
  after: (ms, fn) => {
    const timer = setTimeout(fn, ms)
    return () => clearTimeout(timer)
  }
}

/**
 * One worktree's changes: the recount scheduler's runner (RCNT-02..15). A
 * failure is logged and answered `null`, so the last count stays (SCRF-06).
 */
async function recountWorktree(
  worktreePath: string
): Promise<{ dirty: boolean; changes: number } | null> {
  diagnostics().recountStarted(worktreePath)
  const status = await worktreeStatus(worktreePath)
  if (status === null) console.warn('[git-state] could not recount', worktreePath)
  return status
}

/**
 * The real `AgentSpawn` seam: spawn the resolved `claude` binary **directly**
 * (`shell:false`, argv verbatim) with **stdin closed** (`stdio:['ignore','pipe','pipe']`),
 * adapting `child_process.spawn` to the `AgentChild` interface the name poller reads.
 * This seam is the one hand-verified I/O boundary.
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
/** Owns every PTY, in a utility process so ConPTY creation never blocks main (PTYH-01). */
let ptyHost: PtyHostClient | null = null

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

/** How long quit waits for the PTY host to kill every PTY and exit (PTYH-18). */
const PTY_HOST_SHUTDOWN_MS = 3000

/**
 * True while the will-quit guard below holds a quit back for the PTY host.
 * That emission is cancelled and re-raised by `app.quit()` once the host is
 * gone, so every other will-quit handler skips it and runs once, on the quit
 * that goes through.
 */
let quitDeferred = false
let ptyHostDraining = false

/** Register a will-quit handler that runs once per quit (see `quitDeferred`). */
function onWillQuit(fn: () => void): void {
  app.on('will-quit', () => {
    if (!quitDeferred) fn()
  })
}

// Registered before whenReady so it runs ahead of every other will-quit
// handler. Quit paths that skip window-all-closed (`app.quit()` from the
// updater) still let the host kill every PTY before main goes away
// (PTYH-17, PTYH-18, PTYH-19): node-pty's kill runs only inside the host.
app.on('will-quit', (event) => {
  quitDeferred = ptyHostDraining || (ptyHost?.alive ?? false)
  if (!quitDeferred) return
  event.preventDefault()
  if (ptyHostDraining) return
  ptyHostDraining = true
  sessionManager?.killAll()
  void ptyHost!.shutdown(PTY_HOST_SHUTDOWN_MS).finally(() => {
    ptyHostDraining = false
    app.quit()
  })
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // The opt-in performance log (PDIAG-01, PDIAG-02), installed before any handler can run git;
  // without PLAYGROUND_DEBUG_PERF=1 it is the no-op. Quitting drops the partial minute (PDIAG-08).
  installDiagnostics(
    createAppDiagnostics({
      env: process.env,
      userDataPath: app.getPath('userData'),
      version: app.getVersion()
    })
  )
  onWillQuit(() => diagnostics().stop())
  // Debug-only event-loop delay log (PERF-16); nothing starts without the env flag (PERF-18).
  const stopLoopDelayLog = startLoopDelayLog({
    enabled: diagnosticsEnabled(process.env)
  })
  onWillQuit(stopLoopDelayLog)

  // Forked now, before the first spawn, so opening a session does not also pay
  // the host's start-up (spec Assumptions: PTY host start time).
  ptyHost = new PtyHostClient({ fork: forkPtyHost, log: console.error })
  ptyHost.start()

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
  // Every `git status` main runs to count a worktree goes through one
  // scheduler: one recount per worktree at a time, at least a second apart
  // (RCNT-02..15). A recount that served a git-state event is sent on (RCNT-09).
  const recounts = new RecountScheduler({
    recount: recountWorktree,
    onRecounted: (worktreePath, count) => {
      if (!mainWindow) return
      emit(mainWindow.webContents, 'worktree:status', { worktreePath, ...count })
      diagnostics().emitted('worktree:status', worktreePath)
    },
    now: () => performance.now(),
    schedule: timerScheduler
  })
  // A commit made in any terminal recounts that worktree alone (SCRF-01); the
  // watched set follows every tree snapshot (SCRF-04).
  const gitStateWatcher = new GitStateWatcher({
    watch: watchPort,
    resolveGitDir,
    onEvent: (worktreePath) => recounts.notify(worktreePath),
    onDropped: (worktreePath) => recounts.forget(worktreePath)
  })
  // The worktrees a session can follow (SFWT-01): fed by every tree build; a
  // miss inside a workspace lists its repos once, paths only, no change counts
  // (SFWT-12, SFWT-14).
  const knownWorktrees = new KnownWorktrees({
    reread: async (workspacePath) => {
      const repos = await scanRepos(workspacePath)
      const lists = await Promise.all(
        repos.map((repo) => listWorktrees(repo.path, () => Promise.resolve(null)))
      )
      return lists.flat().map((wt) => wt.path)
    },
    logError: (err) => console.error('[sessions] re-reading worktrees failed', err)
  })
  handle('tree:get', async () => {
    // Each worktree's count waits its turn in the scheduler (RCNT-17).
    const tree = await buildTree(registry, { countChanges: (p) => recounts.request(p) })
    const worktreePaths = tree.flatMap((ws) =>
      ws.repos.flatMap((repo) => repo.worktrees.map((wt) => wt.path))
    )
    void gitStateWatcher.sync(worktreePaths)
    knownWorktrees.replace({ workspaces: tree.map((ws) => ws.path), worktrees: worktreePaths })
    // APIN-05: pin tasks the worktree branches carry, without holding up the tree.
    void runAutoPin(tree, {
      ado: () => configStore.get().ado,
      workspaceTemplate: (path) => workspaceTemplates(path).branchTemplate,
      autoPin: (refs) => taskBoard.autoPin(refs),
      emit: (snapshot) => emitToWindow('tasks:changed', { snapshot }),
      logError: (err) => console.error('Auto-pin from worktrees failed:', err)
    })
    return tree
  })
  // WPC-10: ONE hook-wrapped create for every create path. Because each gets
  // this same wrapper — never bare `createWorktree` — no call path can skip a
  // repo's init command.
  const createWorktreeWithHook = withPostCreateHook(createWorktree, {
    // HWC-01: repo-first, then the workspace's `postCreateCommands[<repoName>]`,
    // so a repo needs no committed `.app/config.json` to be initialized.
    readCommand: resolvePostCreateCommand,
    shell: runHookShell
  })
  // CRTO-11, CRTO-18: steps are pushed only for a request that names itself.
  // `emitToWindow` is defined further down this block and read only when a create runs.
  handle(
    'worktrees:create',
    ({ repoPath, branch, baseBranch, worktreeTemplate, updateBase, onExisting, requestId }) =>
      createWorktreeWithHook(
        repoPath,
        branch,
        baseBranch,
        worktreeTemplate,
        updateBase,
        onExisting,
        requestId === undefined
          ? undefined
          : (step) => emitToWindow('worktrees:create-step', { requestId, step })
      )
  )
  // BSLG-23: the dialogs ask the create's own path check as the name changes.
  handle('worktrees:check-paths', (req) => checkCreatePaths(req).then((problem) => ({ problem })))
  handle('worktrees:remove', async ({ repoPath, worktreePath, force }) => {
    const result = await removeWorktree(repoPath, worktreePath, { force })
    // Sessions that followed it go back to their launch folder; they are not
    // stopped, since their PTY runs there (SFWT-15).
    if (result.ok) sessionManager?.clearFollowed(worktreePath)
    return result
  })
  handle('worktrees:changes', ({ worktreePath }) => changedFilesOf(worktreePath))
  // A turn end's recount skips the quiet period but keeps the single flight (RCNT-13).
  handle('worktrees:status', ({ worktreePath }) => recounts.request(worktreePath))
  handle('git:sync-state', ({ worktreePath }) => readSyncState(worktreePath))
  handle('git:commits', ({ worktreePath }) => readCommits(worktreePath))
  handle('git:run', ({ worktreePath, op, remote }) => runGitOp(worktreePath, op, remote))

  // The Files direction (FXPL-02/08/09/16/21). Every handler delegates; the
  // modules behind them are unit-tested, this is only the wiring.
  const fileWatcher = new FileWatcher({
    watch: watchPort,
    resolveGitDir,
    schedule: timerScheduler,
    checkIgnored: (worktreePath, paths) => checkIgnored(worktreePath, paths),
    emit: (event) => {
      if (!mainWindow) return
      emit(mainWindow.webContents, 'files:changed', event)
      diagnostics().emitted('files:changed', event.worktreePath)
    }
  })
  handle('files:list-dir', ({ worktreePath, dir }) => listDir(worktreePath, dir))
  handle('files:changed-since', ({ worktreePath, base }) => changedSince(worktreePath, base))
  handle('files:bases', ({ worktreePath }) => listBases(worktreePath))
  handle('files:read', ({ worktreePath, relPath }) => readForView(worktreePath, relPath))
  handle('files:watch', ({ worktreePath }) => fileWatcher.select(worktreePath))
  handle('files:diff-sides', ({ worktreePath, request }) => readDiffSides(worktreePath, request))
  handle('files:diff-stats', ({ worktreePath, mode, base }) => diffStats(worktreePath, mode, base))
  // `resolveInside` hands `trashItem` the absolute, backslashed path its
  // typings ask for; the module never deletes a file itself (FDSC-17).
  handle('files:discard', ({ worktreePath, entries }) =>
    discardChanges(worktreePath, entries, { trash: (p) => shell.trashItem(p) })
  )
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
  // Close every watch handle before the process goes away (FXPL-23, SCRF quit edge case).
  onWillQuit(() => {
    void fileWatcher.select(null)
    gitStateWatcher.closeAll()
    recounts.stop()
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
  handle('tasks:lookup', ({ input }) => taskBoard.lookup(input))
  // The renderer names the task; main opens the URL it stored at pin time (PTOP-01..07).
  handle('tasks:open', (ref) =>
    openPinnedTask(
      { tasks: configStore.get().pinnedTasks, openExternal: (url) => shell.openExternal(url) },
      ref
    )
  )

  // Azure DevOps pull requests (F4). One token cache with the Tasks pane; git
  // reads go through the paced `git()`. The renderer sends intent only, and
  // every write below is reached only from a user's click (FPRA-32, AD-027).
  const adoPr = new AdoPrClient({ getToken: () => adoGateway.getToken() })
  handle('ado-pr:find', ({ worktreePath }) => adoPr.findPrs(worktreePath))
  handle('ado-pr:get', ({ pr }) => adoPr.getPr(pr))
  handle('ado-pr:file-sides', ({ pr, path, oldPath }) => adoPr.fileSides(pr, path, oldPath))
  handle('ado-pr:reply', ({ pr, threadId, rootCommentId, content }) =>
    adoPr.reply(pr, threadId, rootCommentId, content)
  )
  handle('ado-pr:status', ({ pr, threadId, status }) => adoPr.setStatus(pr, threadId, status))
  handle('ado-pr:thread', (req) => adoPr.createThread(req))
  handle('ado-pr:comment', ({ pr, content }) => adoPr.generalComment(pr, content))
  // `shell.openExternal` is reached only through these two (and
  // `github-pr:open` below), each of which refuses anything that is not https
  // (FPRA-14/23, AD-044) — never through `setWindowOpenHandler`.
  handle('ado-pr:open', (req) =>
    adoPr.openPage(req.worktreePath, 'pr' in req ? { pr: req.pr } : { create: true }, (url) =>
      shell.openExternal(url)
    )
  )
  handle('pr:open-link', ({ href }) => openPrLink(href, (url) => shell.openExternal(url)))

  // GitHub pull requests (F5). The `gh` token lives in the gateway and never
  // crosses IPC (FPRG-01); git reads go through the paced `git()`. The
  // renderer sends intent only, and every write below is reached only from a
  // user's click (FPRG-24, AD-027).
  const githubGateway = new GitHubGateway()
  const githubPr = new GitHubPrClient({ gateway: githubGateway })
  // The chip shows only while a registered repository has a GitHub remote,
  // which main alone can tell (FPRG-02); `gh` is not started otherwise.
  handle('github:status', async () =>
    (await anyGitHubRemote(registry.list().map((ws) => ws.path)))
      ? githubGateway.ghStatus()
      : 'no-github-remote'
  )
  handle('github-pr:find', ({ worktreePath }) => githubPr.findPrs(worktreePath))
  handle('github-pr:get', ({ pr }) => githubPr.getPr(pr))
  handle('github-pr:file-sides', ({ pr, path, oldPath }) => githubPr.fileSides(pr, path, oldPath))
  handle('github-pr:reply', ({ pr, rootCommentId, content }) =>
    githubPr.reply(pr, rootCommentId, content)
  )
  handle('github-pr:resolve', ({ threadId, resolved }) => githubPr.setResolved(threadId, resolved))
  handle('github-pr:thread', ({ pr, headSha, selection, content }) =>
    githubPr.anchoredComment(pr, headSha, selection, content)
  )
  handle('github-pr:comment', ({ pr, content }) => githubPr.generalComment(pr, content))
  // Main builds the PR or compare page and opens it only if it is https
  // (FPRG-08, AD-044).
  handle('github-pr:open', (req) =>
    githubPr.openPage(req.worktreePath, 'pr' in req ? { pr: req.pr } : { create: true }, (url) =>
      shell.openExternal(url)
    )
  )

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

  // Time tracking (AD-021). The tracker must recover the periods a crash left
  // open before SessionManager exists, so no new run can mix with them.
  // Pinned task id → cached title, first pin with details of an id (TIME-03, HTSK-06).
  const pinnedTitles = (): Map<number, string> => {
    const titles = new Map<number, string>()
    for (const task of taskBoard.list().tasks) {
      if (task.details && !titles.has(task.id)) titles.set(task.id, task.details.title)
    }
    return titles
  }
  // The last git read per cwd. A period opens on it (nulls on a miss) and the
  // tracker patches it when the fresh read answers, so no `git rev-parse`
  // ever blocks the main process (PERF-21).
  const gitByCwd = new Map<string, { gitCommonDir: string | null; branch: string | null }>()
  const snapshotFor = (
    cwd: string,
    git: { gitCommonDir: string | null; branch: string | null }
  ): PeriodSnapshotFields =>
    buildSnapshot({
      cwd,
      ...git,
      workspacePaths: registry.list().map((ws) => ws.path),
      pinnedTitles: pinnedTitles()
    })
  const tracker = new TimeTracker({
    store: new TimeLogStore(app.getPath('userData')),
    now: Date.now,
    newId: randomUUID,
    resolveSnapshot: (cwd) =>
      snapshotFor(cwd, gitByCwd.get(cwd) ?? { gitCommonDir: null, branch: null }),
    resolveSnapshotAsync: async (cwd) => {
      const git = await readGitAsync(cwd)
      gitByCwd.set(cwd, git)
      return snapshotFor(cwd, git)
    },
    pinnedTitle: (id) => pinnedTitles().get(id) ?? null,
    emit: () => emitToWindow('time:changed', { at: new Date().toISOString() })
  })
  tracker.recover()
  timeTracker = tracker
  handle('time:snapshot', () => tracker.snapshot())
  handle('time:pause', ({ sessionId }) => tracker.pause(sessionId))
  handle('time:resume', ({ sessionId }) => tracker.resume(sessionId))
  handle('time:delete', ({ id }) => tracker.deletePeriod(id))
  handle('time:adjust', ({ id, start, end }) => tracker.adjustPeriod(id, start, end))
  handle('time:reassign', ({ id, choice }) => tracker.reassignPeriod(id, choice))
  handle('time:split', ({ id, at }) => tracker.splitPeriod(id, at))
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
    taskUrl: null,
    register: (token, sessionId) => hookServer.register(token, sessionId),
    revoke: (token) => hookServer.revoke(token)
  }
  hookServer
    .start()
    .then(({ url, taskUrl }) => {
      // Rewritten every launch: the port is ephemeral.
      const settingsPath = join(app.getPath('userData'), 'agent-hooks', 'claude-settings.json')
      mkdirSync(join(app.getPath('userData'), 'agent-hooks'), { recursive: true })
      writeFileSync(settingsPath, JSON.stringify(buildClaudeHookSettings(url), null, 2), 'utf8')
      activityHooks.settingsPath = settingsPath
      activityHooks.taskUrl = taskUrl
    })
    .catch((err) => console.error('[activity-hooks] server did not start', err))

  // Resolve the `claude` binary (WF3-23): the first PATH hit, else the optional
  // `agent.claudePath` config override, else throw so the step fails clearly
  // without spawning. `agent` is not a typed AppConfig section yet (WF4+), read via cast.
  // Declared here, ahead of the SessionManager, because the name poller needs it too.
  // Answered from a cache refreshed in the background, never by a blocking
  // `where` on the main process (PERF-19, PERF-20).
  const claudeResolver = new BinaryResolver({
    lookup: () =>
      findOnPath('claude', { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT }, (path) =>
        stat(path).then(
          (st) => st.isFile(),
          () => false
        )
      ),
    configured: () =>
      (configStore.get() as { agent?: { claudePath?: string } }).agent?.claudePath ?? null,
    now: Date.now
  })
  const resolveClaude = (): string => claudeResolver.get()

  // Session names (AD-040): the poller reads `claude agents --json` through the
  // direct spawn seam with a scrubbed env; `cwd` is only there
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
    port: ptyHost,
    config: configStore,
    emit: emitToWindow,
    fsExists: existsSync,
    lifecycle: tracker,
    hooks: activityHooks,
    // `session:followed` is also the renderer's hint that the tree may lack a
    // worktree the agent just created (SFWT-12).
    worktrees: knownWorktrees,
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
  // A link by id pins its task in the background, so the rail shows its title,
  // type and state; the spawn and the link never wait for ADO (PRST-45..47, AD-064).
  const linkedPin = {
    pinLinked: (id: number) => taskBoard.pinLinked(id),
    emit: (snapshot: TasksSnapshot) => emitToWindow('tasks:changed', { snapshot }),
    logError: (err: unknown) => console.error('Pinning a linked task failed:', err)
  }
  // The same path as the picker: persist, then the tracker closes and opens (ATSK-02, HTSK-12).
  hookServer.onTaskLink((sessionId, task) => {
    sessions.setTask(sessionId, task)
    void runLinkedPin(task, linkedPin)
  })
  namePoller.onListing((names) => sessions.applyNames(names))
  handle('sessions:list', () => sessions.list())
  handle('sessions:spawn', async ({ agentName, cwd, adhocCommand, task, prompt }) => {
    const view = await sessions.spawn(agentName, cwd, adhocCommand, task, prompt)
    void runLinkedPin(task, linkedPin)
    return view
  })
  // Returning the promise is load-bearing: ipcMain.handle awaits it, so the
  // renderer's `sessions:stop` only resolves once the PTY has really exited
  // (WRFT-05) — which is what lets a worktree removal start without racing
  // handles the agent's children still hold.
  handle('sessions:stop', ({ id }) => sessions.stop(id))
  handle('sessions:respawn', ({ id }) => sessions.respawn(id))
  handle('sessions:rename', ({ id, title }) => sessions.rename(id, title))
  // Persist first, then the tracker closes and opens through the lifecycle (HTSK-12).
  handle('sessions:set-task', ({ id, task }) => {
    const view = sessions.setTask(id, task)
    void runLinkedPin(task, linkedPin)
    return view
  })
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

  // Prompt files are discovered on demand (APR-01); the folder is
  // created on request so "Open prompts folder" always has something to open (APR-08).
  const promptsRoot = join(homedir(), '.playground', 'prompts')
  handle('prompts:list', () => listPrompts(promptsRoot))
  handle('prompts:openFolder', async () => {
    await ensurePromptsFolder(promptsRoot)
    await shell.openPath(promptsRoot)
  })

  // Agent presets: one hand-editable file, re-read on every list and change
  // (PRST-01, PRST-09). PLAYGROUND_PRESETS_FILE keeps the smoke off the real one.
  const presets = createPresetStore(
    process.env.PLAYGROUND_PRESETS_FILE ?? join(homedir(), '.playground', 'presets.json'),
    NODE_PRESET_FS,
    (path) => shell.openPath(path)
  )
  handle('agentPresets:list', () => presets.list())
  handle('agentPresets:save', ({ preset, replace }) =>
    presets.change({ kind: 'save', preset, replace })
  )
  handle('agentPresets:rename', ({ from, to }) => presets.change({ kind: 'rename', from, to }))
  handle('agentPresets:move', ({ name, direction }) =>
    presets.change({ kind: 'move', name, direction })
  )
  handle('agentPresets:delete', ({ name }) => presets.change({ kind: 'delete', name }))
  handle('agentPresets:openFile', async () => ({ error: await presets.openFile() }))

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
  // Then let the host run node-pty's own kill for every PTY and exit, or kill it
  // at the deadline, before main goes away (PTYH-17, PTYH-18).
  void (ptyHost?.shutdown(PTY_HOST_SHUTDOWN_MS) ?? Promise.resolve()).then(() => {
    // After killAll: its synchronous finalize already ended each run, so this only
    // closes whatever is still open, at the quit instant (TIME-09).
    timeTracker?.closeAll()
    namePoller?.dispose()
    stopHookServer?.().catch((err) => console.error('[activity-hooks] stop failed', err))
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
