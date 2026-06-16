import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type {
  IpcChannel,
  IpcEvent,
  IpcEvents,
  IpcRequest,
  IpcResponse,
  IpcSend,
  IpcSends
} from '../shared/ipc-contract'

/**
 * Typed wrapper over ipcMain.handle. Handlers registered through this function
 * are checked against the IpcContract channel map.
 */
export function handle<C extends IpcChannel>(
  channel: C,
  fn: (req: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>
): void {
  ipcMain.handle(channel, (_event, req) => fn(req as IpcRequest<C>))
}

/**
 * Push an event to the renderer over a streaming channel (AD-004). The typed
 * peer of `handle()` for main→renderer pushes — checked against IpcEvents.
 */
export function emit<E extends IpcEvent>(
  webContents: WebContents,
  channel: E,
  payload: IpcEvents[E]
): void {
  webContents.send(channel, payload)
}

/**
 * Listen for a fire-and-forget renderer→main message (AD-004). The typed peer
 * of `handle()` for renderer→main sends — checked against IpcSends.
 */
export function onSend<S extends IpcSend>(channel: S, fn: (payload: IpcSends[S]) => void): void {
  ipcMain.on(channel, (_event, payload) => fn(payload as IpcSends[S]))
}
