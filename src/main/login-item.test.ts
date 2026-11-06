import { describe, expect, it } from 'vitest'
import { HIDDEN_ARG, LoginItemService, type LoginItemPort } from './login-item'

const EXEC = 'C:\\Program Files\\Playground\\Playground.exe'

interface Fake {
  port: LoginItemPort
  writes: { openAtLogin: boolean; path: string; args: string[] }[]
  reads: { path: string; args: string[] }[]
}

/** A login item store that holds what was last written, like the OS does. */
function fake(opts: {
  isPackaged?: boolean
  openAtLogin?: boolean
  willLaunch?: boolean
  /** Ignore writes, as a policy-blocked Run key would. */
  sticky?: boolean
  throwOnSet?: string
}): Fake {
  let openAtLogin = opts.openAtLogin ?? false
  let willLaunch = opts.willLaunch
  const writes: Fake['writes'] = []
  const reads: Fake['reads'] = []
  const port: LoginItemPort = {
    isPackaged: opts.isPackaged ?? true,
    execPath: EXEC,
    getLoginItemSettings: (o) => {
      reads.push(o)
      return { openAtLogin, executableWillLaunchAtLogin: willLaunch }
    },
    setLoginItemSettings: (o) => {
      if (opts.throwOnSet) throw new Error(opts.throwOnSet)
      writes.push(o)
      if (opts.sticky) return
      openAtLogin = o.openAtLogin
      if (willLaunch !== undefined) willLaunch = o.openAtLogin
    }
  }
  return { port, writes, reads }
}

describe('LoginItemService', () => {
  it('starts the app with the literal --hidden argument (TRAY-22, TRAY-23)', () => {
    expect(HIDDEN_ARG).toBe('--hidden')
  })

  describe('outside the installed app (TRAY-25)', () => {
    it('reports the option unavailable and off', () => {
      const f = fake({ isPackaged: false, openAtLogin: true, willLaunch: true })
      expect(new LoginItemService(f.port).get()).toEqual({ available: false, enabled: false })
    })

    it('never writes a login item', () => {
      const f = fake({ isPackaged: false })
      const result = new LoginItemService(f.port).set(true)
      expect(result).toEqual({
        ok: false,
        error: 'only in the installed app',
        state: { available: false, enabled: false }
      })
      expect(f.writes).toEqual([])
    })
  })

  describe('reading the OS state (TRAY-21)', () => {
    it.each([
      [true, true, true],
      [true, false, false],
      [false, true, true],
      [false, false, false]
    ])(
      'openAtLogin=%s, executableWillLaunchAtLogin=%s reads as enabled=%s',
      (openAtLogin, willLaunch, enabled) => {
        const f = fake({ openAtLogin, willLaunch })
        expect(new LoginItemService(f.port).get()).toEqual({ available: true, enabled })
      }
    )

    it.each([true, false])('falls back to openAtLogin=%s when the OS gives no launch flag', (on) => {
      const f = fake({ openAtLogin: on, willLaunch: undefined })
      expect(new LoginItemService(f.port).get()).toEqual({ available: true, enabled: on })
    })

    it('asks about this executable with the hidden argument', () => {
      const f = fake({})
      new LoginItemService(f.port).get()
      expect(f.reads).toEqual([{ path: EXEC, args: ['--hidden'] }])
    })
  })

  describe('writing (TRAY-22)', () => {
    it('registers the executable with --hidden when turned on', () => {
      const f = fake({ openAtLogin: false, willLaunch: false })
      const result = new LoginItemService(f.port).set(true)
      expect(f.writes).toEqual([{ openAtLogin: true, path: EXEC, args: ['--hidden'] }])
      expect(result).toEqual({ ok: true, state: { available: true, enabled: true } })
    })

    it('removes it with the same path and arguments when turned off', () => {
      const f = fake({ openAtLogin: true, willLaunch: true })
      const result = new LoginItemService(f.port).set(false)
      expect(f.writes).toEqual([{ openAtLogin: false, path: EXEC, args: ['--hidden'] }])
      expect(result).toEqual({ ok: true, state: { available: true, enabled: false } })
    })
  })

  describe('failures (TRAY-26)', () => {
    it('reports a write that did not stick, with the state read back', () => {
      const f = fake({ openAtLogin: false, willLaunch: false, sticky: true })
      const result = new LoginItemService(f.port).set(true)
      expect(result).toEqual({
        ok: false,
        error: 'Windows did not apply the change',
        state: { available: true, enabled: false }
      })
    })

    it('reports a thrown error by its message, with the state read back', () => {
      const f = fake({ openAtLogin: true, willLaunch: true, throwOnSet: 'Access is denied.' })
      const result = new LoginItemService(f.port).set(false)
      expect(result).toEqual({
        ok: false,
        error: 'Access is denied.',
        state: { available: true, enabled: true }
      })
    })
  })
})
