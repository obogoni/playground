import { ElectronAPI } from '@electron-toolkit/preload'
import type { RendererApi } from '../shared/ipc-contract'

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
