import type {
  AppConfig,
  ConfigPatch,
  SessionActivity,
  SessionStatus,
  SessionView,
  WorkspaceTemplates
} from './config'
import type {
  BaseOptions,
  ChangedListing,
  CommitDetail,
  CommitPage,
  DiffRequest,
  DiffSides,
  DirListing,
  FileContent,
  FileStat,
  FilesChanged,
  FilesMode
} from './files'
import type { CommitLists, GitOp, GitOpResult, SyncState } from './git'
import type { ProbeResult } from './links'
import type { ClipboardPaste } from './paste'
import type { LaunchResult, ShortcutTool } from './shortcuts'
import type { ParentOfResult, PinTaskResult, TasksSnapshot } from './tasks'
import type { TimeEditResult, TimeSnapshot } from './time'
import type { WorkspaceEntry, WorkspaceNode } from './tree'
import type {
  BlockerQuestion,
  RespondDecision,
  RunStatus,
  ScaffoldResult,
  StepEvent,
  WorkflowDef
} from './workflows'
import type { ChangedFile, CreateWorktreeResult, RemoveWorktreeResult } from './worktrees'

/**
 * Single request/response channel map shared by main, preload, and renderer.
 * Every feature adds its channels here; misspelled channels or wrong payload
 * shapes fail typecheck at the call site.
 */
export interface IpcContract {
  /** The running app's version (electron `app.getVersion()`), shown as the TopBar version tag. */
  'app:version': { req: void; res: string }
  'config:get': { req: void; res: AppConfig }
  'config:patch': { req: ConfigPatch; res: AppConfig }
  /** Opens a native folder picker in main; null when cancelled or already registered. */
  'workspaces:add': { req: void; res: WorkspaceEntry | null }
  'workspaces:remove': { req: { id: string }; res: void }
  /** .app/config.json template overrides; read fresh on every call, null per key when absent. */
  'workspaces:templates': { req: { workspacePath: string }; res: WorkspaceTemplates }
  /** Full disk-truth snapshot: registry → repos → worktrees with dirty status. */
  'tree:get': { req: void; res: WorkspaceNode[] }
  /** Opens the external tool rooted at the path; failures are returned, never thrown. */
  'shortcuts:launch': { req: { tool: ShortcutTool; path: string }; res: LaunchResult }
  /** Resolves each candidate against cwd and stats it; never throws, unresolvable → 'missing' (LINK-29). */
  'links:probe': { req: { cwd: string; paths: string[] }; res: ProbeResult[] }
  /** Opens an http/https URL in the default browser; any other scheme is refused (LINK-04). */
  'links:openUrl': { req: { url: string }; res: LaunchResult }
  /** Opens a file with its Windows default app (or the "Open with" chooser) and a directory in Explorer. */
  'links:openPath': { req: { cwd: string; pathText: string }; res: LaunchResult }
  /** Opens an OSC 8 `file://` target through the same rules as `links:openPath`; any other URL is refused (LINK-21). */
  'links:openFileUrl': { req: { url: string }; res: LaunchResult }
  /** git worktree add at the flat-sibling path; failures are returned, never thrown. */
  'worktrees:create': {
    req: {
      repoPath: string
      branch: string
      baseBranch?: string
      worktreeTemplate?: string
      /** Fast-forward the local base from its remote upstream first (WBR-01); absent = off. */
      updateBase?: boolean
      /**
       * How to handle a pre-existing branch of the same name (EXB-05): absent =
       * detect and return `conflict: 'branch-exists'`; `reuse` = check it out
       * as-is; `recreate` = force-delete and recut from base.
       */
      onExisting?: 'reuse' | 'recreate'
    }
    res: CreateWorktreeResult
  }
  /**
   * Delete-first worktree removal (WRFT-01): the app deletes the directory, then
   * git drops the bookkeeping. Failures are returned, never thrown — and a `res`
   * carrying `leftover` means nothing was deregistered, so the same call retries.
   */
  'worktrees:remove': {
    req: {
      repoPath: string
      worktreePath: string
      /** Skip the dirty guard (FRWT-01); absent = off. Never skips primary/registered/locked. */
      force?: boolean
    }
    res: RemoveWorktreeResult
  }
  /** Live `git status --porcelain` of a worktree, parsed for the remove confirm (FRWT-01); [] when clean/unreadable. */
  'worktrees:changes': { req: { worktreePath: string }; res: ChangedFile[] }
  /** Branch, upstream, ahead/behind, remotes and fetch age from local refs — never the network; failures land in `error` (STBR-09/12/13/14/22). */
  'git:sync-state': { req: { worktreePath: string }; res: SyncState }
  /** Incoming and outgoing commits against the upstream, 20 each plus the "+N more" counts (STBR-15/16). */
  'git:commits': { req: { worktreePath: string }; res: CommitLists }
  /** Run one sync/pull/push/fetch/publish, 120 s ceiling, one per worktree; failures are returned, never thrown (STBR-17–21/24/28). */
  'git:run': { req: { worktreePath: string; op: GitOp; remote?: string }; res: GitOpResult }
  /** Pinned tasks merged with this session's cached details; no network. */
  'tasks:list': { req: void; res: TasksSnapshot }
  /** Parses ID/URL, validates against ADO, persists; failures are returned, never thrown. */
  'tasks:pin': { req: { input: string }; res: PinTaskResult }
  'tasks:unpin': { req: { id: number; org: string; project: string }; res: TasksSnapshot }
  /** Re-fetches live details for every pin (app focus + manual refresh). */
  'tasks:refresh': { req: void; res: TasksSnapshot }
  /** Resolves the first Hierarchy-Reverse parent (the US) of a pinned task; null when absent (PARENT-02). */
  'tasks:parent': { req: { id: number; org: string; project: string }; res: ParentOfResult }
  /** Persisted ∪ running sessions, reconciled with pathMissing (no network/spawn). */
  'sessions:list': { req: void; res: SessionView[] }
  /** Resolve agent (or run `adhocCommand` raw) + cwd, shell-host the PTY, persist, return the view. */
  'sessions:spawn': {
    req: { agentName: string; cwd: string; adhocCommand?: string }
    res: SessionView
  }
  /** Kill the hosting PTY → status stopped; no orphaned process survives. */
  'sessions:stop': { req: { id: string }; res: void }
  /** Re-run a stopped/path-missing session in the same agent + cwd. */
  'sessions:respawn': { req: { id: string }; res: SessionView }
  /** Rename a session's title; empty/whitespace keeps the prior title. */
  'sessions:rename': { req: { id: string; title: string }; res: SessionView }
  /** Clone a session (agent + cwd + ad-hoc command) into a new running session. */
  'sessions:duplicate': { req: { id: string }; res: SessionView }
  /** Drop a stopped/path-missing session from config; rejected while running. */
  'sessions:remove': { req: { id: string }; res: void }
  /** Make this the active stream target; replays scrollback then live deltas. */
  'sessions:attach': { req: { id: string }; res: void }
  /** Stop streaming this session; its PTY + buffer keep running in main. */
  'sessions:detach': { req: { id: string }; res: void }
  /** Closed periods from the log, open periods and paused session ids. */
  'time:snapshot': { req: void; res: TimeSnapshot }
  /** Close the session's open period and mark it paused (TIME-16). */
  'time:pause': { req: { sessionId: string }; res: void }
  /** Open a new period for a paused session and clear the mark (TIME-18). */
  'time:resume': { req: { sessionId: string }; res: void }
  /** Remove a closed period from the log; stale or open ids are rejected (TIME-44, TIME-49). */
  'time:delete': { req: { id: string }; res: TimeEditResult }
  /** Replace a closed period's UTC ISO bounds; invalid bounds are rejected (TIME-45, TIME-46). */
  'time:adjust': { req: { id: string; start: string; end: string }; res: TimeEditResult }
  /** Native folder picker for a detached (ad-hoc) cwd; null when cancelled. */
  'dialog:pickFolder': { req: void; res: { path: string | null } }
  /**
   * What the OS clipboard holds, read in main because the renderer `clipboard`
   * is deprecated from Electron 40 and the Explorer file list needs a child
   * process. Text wins over files, files over an image; an image is written to
   * a temp PNG first and comes back as its path (TSP-12/13/14/15). A failed
   * read answers `{ kind: 'error' }` and never throws (TSP-16).
   */
  'clipboard:read-paste': { req: void; res: ClipboardPaste }
  /** Every discovered workflow, valid (`{id,meta}`) or broken (`{id,error}`) (WF2-01). */
  'workflows:list': { req: void; res: WorkflowDef[] }
  /** Start a serial run of workflow `id` in the main process; returns its runId (WF2-13/17). */
  'workflows:run': { req: { id: string; input?: Record<string, string> }; res: { runId: string } }
  /** Request cancellation of a run; read at the next `ctx.*` checkpoint (WF2-14). */
  'workflows:cancel': { req: { runId: string }; res: void }
  /** Answer a blocked run: `abort` → cancelled, `guidance` → resume (WF4-07). */
  'workflows:respond': { req: { runId: string; decision: RespondDecision }; res: void }
  /** Drop any discovery cache (v1 no-op — discovery is on-demand) (WF2-01). */
  'workflows:reload': { req: void; res: void }
  /** Scaffold a new workflow folder from a template + reveal it; an existing id is rejected, never overwritten (WF5-22/24/25). */
  'workflows:scaffold': { req: { name: string }; res: ScaffoldResult }
  /** One folder's direct children, tracked plus untracked-not-ignored; a git failure lands in `error` (FXPL-02/04/05). */
  'files:list-dir': { req: { worktreePath: string; dir: string }; res: DirListing }
  /** The files the branch committed since `merge-base(HEAD, base)` (FXPL-08). */
  'files:changed-since': { req: { worktreePath: string; base: string }; res: ChangedListing }
  /** The base the diff mode defaults to plus every branch the picker can offer (FXPL-09/10/11). */
  'files:bases': { req: { worktreePath: string }; res: BaseOptions }
  /** One file read for the viewer, capped and sniffed in main (FXPL-16/17/20/24). */
  'files:read': { req: { worktreePath: string; relPath: string }; res: FileContent }
  /** Watch this worktree for disk changes, or `null` to stop watching (FXPL-21/22/23). */
  'files:watch': { req: { worktreePath: string | null }; res: void }
  /** Both sides of one diff, plus the lines whose terminator changed (FDIF-01..06, 15). */
  'files:diff-sides': {
    req: { worktreePath: string; request: DiffRequest }
    res: DiffSides
  }
  /** Added and removed line counts per file of the mode's list (FDIF-19/20/24). */
  'files:diff-stats': {
    req: { worktreePath: string; mode: FilesMode; base?: string }
    res: FileStat[]
  }
  /** One page of the branch's own commits since its base (FCMT-02/08/09/12/23). */
  'commits:list': {
    req: { worktreePath: string; base: string; cursor?: string }
    res: CommitPage
  }
  /** What one commit changed against its first parent (FCMT-16/17/18). */
  'commits:files': { req: { worktreePath: string; sha: string }; res: CommitDetail }
  /**
   * Open a pushed commit's page on its provider (FCMT-24/25). The request
   * carries a sha and nothing else: main resolves the remote and builds the
   * URL, so no URL the renderer holds can ever reach the OS shell (FCMT-28).
   */
  'commits:open': { req: { worktreePath: string; sha: string }; res: LaunchResult }
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['req']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['res']

/**
 * Streaming IPC (AD-004) — the push/fire-and-forget peers of the request/
 * response IpcContract. PTY bytes are pushed main→renderer continuously
 * (IpcEvents); keystrokes and resizes are fired renderer→main without a reply
 * (IpcSends). Every payload carries the session `id` so one renderer can
 * fan out across sessions (AM2). First used by the agent spike (AM1).
 */
export interface IpcEvents {
  'session:data': { id: string; data: string }
  'session:exit': { id: string; exitCode: number }
  'session:status': { id: string; status: SessionStatus; pathMissing: boolean }
  /** What the session's agent is doing, folded from its lifecycle hooks; `null`
   *  clears it back to the plain `running` rendering (ACTV-05). */
  'session:activity': { id: string; activity: SessionActivity | null }
  /** The time log, the open periods or the paused set changed; refetch `time:snapshot`. */
  'time:changed': { at: string }
  /** An activity transition to show as an in-app notice: the window is focused
   *  but another session is on screen (NOTF-02). */
  'session:notice': { id: string; title: string; body: string }
  /** A session notification was clicked: open this session in the agents direction (NOTF-05). */
  'session:focus': { id: string }
  /** The agent's own session name changed; `null` clears it back to the agent
   *  display name (SNAME-02, SNAME-04). */
  'session:name': { id: string; name: string | null }
  /** A run's folded lifecycle status changed (WF2-12). */
  'workflow:status': { runId: string; status: RunStatus }
  /** A `step-started` event — an executed `ctx.*` primitive / `ctx.step` group (WF2-10). */
  'workflow:step': { runId: string; step: StepEvent }
  /** A `step-logged` log/notify line, optionally nested under a `ctx.step` group (WF2-10). */
  'workflow:log': { runId: string; message: string; group?: string }
  /** A run started — seeds the RunView with its identity + input + start time (WHF-08). */
  'workflow:run-started': {
    runId: string
    workflowId: string
    input: Record<string, string>
    startedAt: string
  }
  /** A run paused awaiting a human answer; `sessionId` scopes the agent resume note (WF4-01/15, WHF-07). */
  'workflow:blocked': { runId: string; question: BlockerQuestion; sessionId?: string }
  /** A lifecycle-toast click asked the renderer to surface this run (WF4-15). */
  'workflow:focus-run': { runId: string }
  /** One batch of disk changes in the watched worktree (FXPL-21/22). */
  'files:changed': FilesChanged
}

export interface IpcSends {
  'session:input': { id: string; data: string }
  'session:resize': { id: string; cols: number; rows: number }
}

export type IpcEvent = keyof IpcEvents
export type IpcSend = keyof IpcSends

/** Shape of the bridge exposed to the renderer as window.api. */
export interface RendererApi {
  invoke<C extends IpcChannel>(
    channel: C,
    ...args: IpcRequest<C> extends void ? [] : [IpcRequest<C>]
  ): Promise<IpcResponse<C>>
  /** Subscribe to a main→renderer push event; returns an unsubscribe fn. */
  on<E extends IpcEvent>(channel: E, listener: (payload: IpcEvents[E]) => void): () => void
  /** Fire-and-forget a renderer→main message (no reply). */
  send<S extends IpcSend>(channel: S, payload: IpcSends[S]): void
  /**
   * Absolute path of a dropped `File`, via `webUtils.getPathForFile`; `''` when
   * the item carries no filesystem path, e.g. a dragged link (TSP-25, TSP-27).
   */
  pathForFile(file: File): string
}
