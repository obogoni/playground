import type { IpcChannel, IpcRequest, IpcResponse, RendererApi } from '../../../shared/ipc-contract'

/**
 * Renderer-side IPC client. Thin wrapper over the preload bridge that
 * normalizes failures (including invokes on unregistered channels) into
 * errors carrying the channel name.
 */
export const api: RendererApi = {
  async invoke<C extends IpcChannel>(
    channel: C,
    ...args: IpcRequest<C> extends void ? [] : [IpcRequest<C>]
  ): Promise<IpcResponse<C>> {
    try {
      return await window.api.invoke(channel, ...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`IPC '${channel}' failed: ${message}`)
    }
  }
}
