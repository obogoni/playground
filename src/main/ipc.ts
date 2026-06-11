import { ipcMain } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '../shared/ipc-contract'

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
