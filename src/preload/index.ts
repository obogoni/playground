import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { RendererApi } from '../shared/ipc-contract'

// The runtime bridge is untyped pass-through; type safety lives in the
// IpcContract / IpcEvents / IpcSends maps enforced at both call sites
// (renderer) and handlers (main).
const api = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  // Streaming IPC (AD-004): on() subscribes to a main→renderer push and returns
  // an unsubscribe; send() fires a renderer→main message with no reply.
  on: (channel: string, listener: (payload: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  send: (channel: string, payload: unknown) => ipcRenderer.send(channel, payload)
} as RendererApi

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
