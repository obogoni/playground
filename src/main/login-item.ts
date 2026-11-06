/**
 * LoginItemService — the Windows login item that starts the app hidden in the
 * tray (TRAY-20..26, AD-067).
 *
 * The OS login item is the only store: no config.json key, so turning the app
 * off in Task Manager's Startup apps shows here too. Electron's setter reports
 * no failure on Windows, so every write is read back and compared. `app` is
 * injected as a port so the policy is unit-testable without Electron.
 */
import type { LoginItemResult, LoginItemState } from '../shared/login-item'

/** The argument the login item passes; `index.ts` starts hidden when it sees it. */
export const HIDDEN_ARG = '--hidden'

/** The slice of Electron's `app` this service touches. */
export interface LoginItemPort {
  isPackaged: boolean
  execPath: string
  getLoginItemSettings(o: { path: string; args: string[] }): {
    openAtLogin: boolean
    executableWillLaunchAtLogin?: boolean
  }
  setLoginItemSettings(o: { openAtLogin: boolean; path: string; args: string[] }): void
}

const UNAVAILABLE: LoginItemState = { available: false, enabled: false }

export class LoginItemService {
  constructor(private readonly port: LoginItemPort) {}

  get(): LoginItemState {
    if (!this.port.isPackaged) return UNAVAILABLE
    const s = this.port.getLoginItemSettings({ path: this.port.execPath, args: [HIDDEN_ARG] })
    return { available: true, enabled: s.executableWillLaunchAtLogin ?? s.openAtLogin }
  }

  set(enabled: boolean): LoginItemResult {
    if (!this.port.isPackaged) {
      return { ok: false, error: 'only in the installed app', state: UNAVAILABLE }
    }
    try {
      this.port.setLoginItemSettings({
        openAtLogin: enabled,
        path: this.port.execPath,
        args: [HIDDEN_ARG]
      })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), state: this.get() }
    }
    const state = this.get()
    if (state.enabled !== enabled) {
      return { ok: false, error: 'Windows did not apply the change', state }
    }
    return { ok: true, state }
  }
}
