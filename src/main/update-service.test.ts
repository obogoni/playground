import { describe, expect, it, vi } from 'vitest'
import { UpdateService, type AutoUpdaterPort, type Scheduler } from './update-service'

/** A recording fake `autoUpdater`: a Proxy logs every field write so we can assert
 *  exactly what `start()` touched (including that `channel` is never assigned). */
function recordingUpdater(checkImpl?: () => Promise<unknown>) {
  const state = {
    writes: [] as string[],
    errorListeners: [] as Array<(e: unknown) => void>,
    checkCount: 0
  }
  const target = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    forceDevUpdateConfig: false,
    checkForUpdates: () => {
      state.checkCount++
      return checkImpl ? checkImpl() : Promise.resolve(undefined)
    },
    on: (_event: 'error', listener: (e: unknown) => void) => {
      state.errorListeners.push(listener)
    }
  }
  const updater = new Proxy(target, {
    set(obj, prop, value) {
      state.writes.push(String(prop))
      ;(obj as Record<string, unknown>)[prop as string] = value
      return true
    }
  }) as unknown as AutoUpdaterPort
  return { updater, state }
}

/** A fake scheduler that records registered intervals; `tick(i)` fires one manually. */
function recordingScheduler() {
  const tasks: Array<{ ms: number; fn: () => void }> = []
  const scheduler: Scheduler = {
    every: (ms, fn) => {
      tasks.push({ ms, fn })
    }
  }
  const tick = (i = 0): void => tasks[i].fn()
  return { scheduler, tasks, tick }
}

describe('UpdateService', () => {
  it('does nothing when not packaged and forceDev is off (RLCD-06)', () => {
    const { updater, state } = recordingUpdater()
    const { scheduler, tasks } = recordingScheduler()

    new UpdateService({ updater, isPackaged: false, scheduler }).start()

    expect(state.writes).toEqual([])
    expect(state.errorListeners).toEqual([])
    expect(state.checkCount).toBe(0)
    expect(tasks).toEqual([])
  })

  it('enables silent auto-update and runs an initial check when packaged (RLCD-05)', () => {
    const { updater, state } = recordingUpdater()
    const { scheduler } = recordingScheduler()

    new UpdateService({ updater, isPackaged: true, scheduler }).start()

    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(state.errorListeners).toHaveLength(1)
    expect(state.checkCount).toBe(1)
  })

  it('never assigns the channel — the baked app-update.yml is honored (RLCD-05)', () => {
    const { updater, state } = recordingUpdater()
    const { scheduler } = recordingScheduler()

    new UpdateService({ updater, isPackaged: true, scheduler }).start()

    expect(state.writes).not.toContain('channel')
  })

  it('schedules a recurring re-check that fires on each tick (RLCD-08)', () => {
    const { updater, state } = recordingUpdater()
    const { scheduler, tasks, tick } = recordingScheduler()

    new UpdateService({
      updater,
      isPackaged: true,
      scheduler,
      checkIntervalMs: 4 * 60 * 60 * 1000
    }).start()

    expect(tasks).toHaveLength(1)
    expect(tasks[0].ms).toBe(4 * 60 * 60 * 1000)
    expect(state.checkCount).toBe(1) // initial only

    tick()
    expect(state.checkCount).toBe(2)
    tick()
    expect(state.checkCount).toBe(3)
  })

  it('proceeds as packaged and sets forceDevUpdateConfig when forceDev is on (RLCD-13)', () => {
    const { updater, state } = recordingUpdater()
    const { scheduler } = recordingScheduler()

    new UpdateService({ updater, isPackaged: false, forceDev: true, scheduler }).start()

    expect(updater.forceDevUpdateConfig).toBe(true)
    expect(state.writes).toContain('forceDevUpdateConfig')
    expect(updater.autoDownload).toBe(true)
    expect(state.checkCount).toBe(1)
  })

  it('swallows an update-check rejection via the log, never throwing (edge case)', async () => {
    const { updater } = recordingUpdater(() => Promise.reject(new Error('feed unreachable')))
    const { scheduler } = recordingScheduler()
    const log = vi.fn()

    expect(() =>
      new UpdateService({ updater, isPackaged: true, scheduler, log }).start()
    ).not.toThrow()

    await Promise.resolve()
    await Promise.resolve()
    expect(log).toHaveBeenCalled()
  })

  it('routes autoUpdater error events to the log, not a dialog (edge case)', () => {
    const { updater, state } = recordingUpdater()
    const { scheduler } = recordingScheduler()
    const log = vi.fn()

    new UpdateService({ updater, isPackaged: true, scheduler, log }).start()
    state.errorListeners[0](new Error('boom'))

    expect(log).toHaveBeenCalled()
  })
})
