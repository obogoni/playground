/**
 * ResidencyController — what the window's X, the tray's Quit, a Windows logoff
 * and a reveal request do while the app stays resident in the tray
 * (TRAY-02..15, AD-067).
 *
 * The X hides the window. A real quit goes through `app.quit()`, whose
 * `before-quit` raises `quitting` so the close handler lets the window close
 * and the existing quit path (window-all-closed, the will-quit guard) runs
 * unchanged. Electron is injected as ports so the policy is unit-testable.
 */

export interface ResidencyPorts {
  hideWindow(): void
  revealWindow(): void
  runningCount(): number
  /** Resolve true to quit; shown only when sessions run. */
  confirmQuit(running: number): Promise<boolean>
  quit(): void
}

export interface TrayMenuItem {
  label: 'Open Playground' | 'Quit'
  click(): void
}

/** The quit dialog's message (TRAY-11). */
export const quitMessage = (running: number): string =>
  `${running} running session(s) will be stopped. Quit anyway?`

export class ResidencyController {
  #quitting = false
  #confirming: Promise<void> | null = null

  constructor(private readonly ports: ResidencyPorts) {}

  onWindowClose(event: { preventDefault(): void }): void {
    if (this.#quitting) return
    event.preventDefault()
    this.ports.hideWindow()
  }

  /** Any quit path, the updater's included, lets the window close from here on. */
  onBeforeQuit(): void {
    this.#quitting = true
  }

  requestQuit(): Promise<void> {
    if (this.#confirming) return this.#confirming
    const running = this.ports.runningCount()
    if (running === 0) {
      this.ports.quit()
      return Promise.resolve()
    }
    this.#confirming = this.ports.confirmQuit(running).then((quit) => {
      this.#confirming = null
      if (quit) this.ports.quit()
    })
    return this.#confirming
  }

  /** Windows is logging off or shutting down: no dialog can hold it back. */
  onSessionEnd(): void {
    this.#quitting = true
    this.ports.quit()
  }

  reveal(): void {
    this.ports.revealWindow()
  }

  menuTemplate(): TrayMenuItem[] {
    return [
      { label: 'Open Playground', click: () => this.reveal() },
      { label: 'Quit', click: () => void this.requestQuit() }
    ]
  }
}
