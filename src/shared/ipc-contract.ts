import type { AppConfig, ConfigPatch } from './config'

/**
 * Single request/response channel map shared by main, preload, and renderer.
 * Every feature adds its channels here; misspelled channels or wrong payload
 * shapes fail typecheck at the call site.
 */
export interface IpcContract {
  'config:get': { req: void; res: AppConfig }
  'config:patch': { req: ConfigPatch; res: AppConfig }
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
