/**
 * UpdateService — all silent auto-update policy behind `start()`.
 *
 * Inert under `electron-vite dev` (not packaged); in a packaged build it enables
 * silent download + apply-on-quit, runs an initial check, and re-checks on a
 * recurring interval. The `autoUpdater` and the timer are injected so the policy
 * is unit-testable with no network, no Electron, and no real `electron-updater`.
 */

/** The slice of electron-updater's autoUpdater we actually touch — lets tests inject a fake. */
export interface AutoUpdaterPort {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  forceDevUpdateConfig: boolean
  checkForUpdates(): Promise<unknown>
  on(event: 'error', listener: (err: unknown) => void): void
}

/** Injectable scheduler so the recurring check is testable with a fake clock. */
export interface Scheduler {
  every(ms: number, fn: () => void): void
}

export interface UpdateServiceOptions {
  updater: AutoUpdaterPort
  isPackaged: boolean
  forceDev?: boolean // RLCD-13 local-feed test opt-in (env-gated in index.ts)
  scheduler?: Scheduler // default: wraps global setInterval
  checkIntervalMs?: number // default: 4h
  log?: (msg: string, err?: unknown) => void
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

const defaultScheduler: Scheduler = {
  every: (ms, fn) => {
    const timer = setInterval(fn, ms)
    timer.unref?.() // never block app quit (apply-on-quit semantics unaffected)
  }
}

export class UpdateService {
  private readonly updater: AutoUpdaterPort
  private readonly isPackaged: boolean
  private readonly forceDev: boolean
  private readonly scheduler: Scheduler
  private readonly checkIntervalMs: number
  private readonly log: (msg: string, err?: unknown) => void

  constructor(opts: UpdateServiceOptions) {
    this.updater = opts.updater
    this.isPackaged = opts.isPackaged
    this.forceDev = opts.forceDev ?? false
    this.scheduler = opts.scheduler ?? defaultScheduler
    this.checkIntervalMs = opts.checkIntervalMs ?? FOUR_HOURS_MS
    this.log = opts.log ?? (() => {})
  }

  start(): void {
    // Inert under `electron-vite dev`: no field writes, no listeners, no timer, no network.
    if (!this.isPackaged && !this.forceDev) return

    if (this.forceDev) this.updater.forceDevUpdateConfig = true

    this.updater.autoDownload = true
    this.updater.autoInstallOnAppQuit = true
    // Channel is intentionally never assigned — the channel baked into app-update.yml wins.

    this.updater.on('error', (err) => this.log('auto-update error', err))

    this.check()
    this.scheduler.every(this.checkIntervalMs, () => this.check())
  }

  private check(): void {
    this.updater.checkForUpdates().catch((err) => this.log('update check failed', err))
  }
}
