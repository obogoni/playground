import type {
  AppConfig,
  ConfigPatch,
  SessionStatus,
  SessionView,
  WorkspaceTemplates
} from './config'
import type { LaunchResult, ShortcutTool } from './shortcuts'
import type { PinTaskResult, TasksSnapshot } from './tasks'
import type { WorkspaceEntry, WorkspaceNode } from './tree'
import type { RunStatus, StepEvent, WorkflowDef } from './workflows'
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
  /** git worktree remove with dirty/primary guards; failures are returned, never thrown. */
  'worktrees:remove': {
    req: {
      repoPath: string
      worktreePath: string
      /** Override the dirty guard with `git worktree remove --force` (FRWT-01); absent = off. */
      force?: boolean
    }
    res: RemoveWorktreeResult
  }
  /** Live `git status --porcelain` of a worktree, parsed for the remove confirm (FRWT-01); [] when clean/unreadable. */
  'worktrees:changes': { req: { worktreePath: string }; res: ChangedFile[] }
  /** Pinned tasks merged with this session's cached details; no network. */
  'tasks:list': { req: void; res: TasksSnapshot }
  /** Parses ID/URL, validates against ADO, persists; failures are returned, never thrown. */
  'tasks:pin': { req: { input: string }; res: PinTaskResult }
  'tasks:unpin': { req: { id: number; org: string; project: string }; res: TasksSnapshot }
  /** Re-fetches live details for every pin (app focus + manual refresh). */
  'tasks:refresh': { req: void; res: TasksSnapshot }
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
  /** Native folder picker for a detached (ad-hoc) cwd; null when cancelled. */
  'dialog:pickFolder': { req: void; res: { path: string | null } }
  /** Every discovered workflow, valid (`{id,meta}`) or broken (`{id,error}`) (WF2-01). */
  'workflows:list': { req: void; res: WorkflowDef[] }
  /** Start a serial run of workflow `id` in the main process; returns its runId (WF2-13/17). */
  'workflows:run': { req: { id: string; input?: Record<string, string> }; res: { runId: string } }
  /** Request cancellation of a run; read at the next `ctx.*` checkpoint (WF2-14). */
  'workflows:cancel': { req: { runId: string }; res: void }
  /** Drop any discovery cache (v1 no-op — discovery is on-demand) (WF2-01). */
  'workflows:reload': { req: void; res: void }
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
  /** A run's folded lifecycle status changed (WF2-12). */
  'workflow:status': { runId: string; status: RunStatus }
  /** A `step-started` event — an executed `ctx.*` primitive / `ctx.step` group (WF2-10). */
  'workflow:step': { runId: string; step: StepEvent }
  /** A `step-logged` log/notify line, optionally nested under a `ctx.step` group (WF2-10). */
  'workflow:log': { runId: string; message: string; group?: string }
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
}
