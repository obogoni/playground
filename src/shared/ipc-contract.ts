import type { AppConfig, ConfigPatch } from './config'
import type { LaunchResult, ShortcutTool } from './shortcuts'
import type { WorkspaceEntry, WorkspaceNode } from './tree'
import type { CreateWorktreeResult } from './worktrees'

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
  /** Full disk-truth snapshot: registry → repos → worktrees with dirty status. */
  'tree:get': { req: void; res: WorkspaceNode[] }
  /** Opens the external tool rooted at the path; failures are returned, never thrown. */
  'shortcuts:launch': { req: { tool: ShortcutTool; path: string }; res: LaunchResult }
  /** git worktree add at the flat-sibling path; failures are returned, never thrown. */
  'worktrees:create': {
    req: { repoPath: string; branch: string; baseBranch?: string }
    res: CreateWorktreeResult
  }
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['req']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['res']

/** Shape of the bridge exposed to the renderer as window.api. */
export interface RendererApi {
  invoke<C extends IpcChannel>(
    channel: C,
    ...args: IpcRequest<C> extends void ? [] : [IpcRequest<C>]
  ): Promise<IpcResponse<C>>
}
