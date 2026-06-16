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
import type { CreateWorktreeResult, RemoveWorktreeResult } from './worktrees'

/**
 * Single request/response channel map shared by main, preload, and renderer.
 * Every feature adds its channels here; misspelled channels or wrong payload
 * shapes fail typecheck at the call site.
 */
export interface IpcContract {
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
    req: { repoPath: string; branch: string; baseBranch?: string; worktreeTemplate?: string }
    res: CreateWorktreeResult
  }
  /** git worktree remove with dirty/primary guards; failures are returned, never thrown. */
  'worktrees:remove': {
    req: { repoPath: string; worktreePath: string }
    res: RemoveWorktreeResult
  }
  /** Pinned tasks merged with this session's cached details; no network. */
  'tasks:list': { req: void; res: TasksSnapshot }
  /** Parses ID/URL, validates against ADO, persists; failures are returned, never thrown. */
  'tasks:pin': { req: { input: string }; res: PinTaskResult }
  'tasks:unpin': { req: { id: number; org: string; project: string }; res: TasksSnapshot }
  /** Re-fetches live details for every pin (app focus + manual refresh). */
  'tasks:refresh': { req: void; res: TasksSnapshot }
  /** Persisted ∪ running sessions, reconciled with pathMissing (no network/spawn). */
  'sessions:list': { req: void; res: SessionView[] }
  /** Resolve agent + cwd, shell-host the agent PTY, persist, return the new view. */
  'sessions:spawn': { req: { agentName: string; cwd: string }; res: SessionView }
  /** Kill the hosting PTY → status stopped; no orphaned process survives. */
  'sessions:stop': { req: { id: string }; res: void }
  /** Re-run a stopped/path-missing session in the same agent + cwd. */
  'sessions:respawn': { req: { id: string }; res: SessionView }
  /** Drop a stopped/path-missing session from config; rejected while running. */
  'sessions:remove': { req: { id: string }; res: void }
  /** Make this the active stream target; replays scrollback then live deltas. */
  'sessions:attach': { req: { id: string }; res: void }
  /** Stop streaming this session; its PTY + buffer keep running in main. */
  'sessions:detach': { req: { id: string }; res: void }
  /** Native folder picker for a detached (ad-hoc) cwd; null when cancelled. */
  'dialog:pickFolder': { req: void; res: { path: string | null } }
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
