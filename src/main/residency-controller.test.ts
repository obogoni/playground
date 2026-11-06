import { describe, expect, it } from 'vitest'
import { quitMessage, ResidencyController } from './residency-controller'

interface Harness {
  ctrl: ResidencyController
  calls: string[]
  confirms: number[]
  /** Settle the pending confirm dialog. */
  answer(quit: boolean): Promise<void>
}

function harness(running: number): Harness {
  const calls: string[] = []
  const confirms: number[] = []
  let settle: ((v: boolean) => void) | null = null
  const ctrl = new ResidencyController({
    hideWindow: () => calls.push('hide'),
    revealWindow: () => calls.push('reveal'),
    runningCount: () => running,
    confirmQuit: (n) => {
      confirms.push(n)
      return new Promise<boolean>((resolve) => {
        settle = resolve
      })
    },
    quit: () => calls.push('quit')
  })
  return {
    ctrl,
    calls,
    confirms,
    answer: async (quit) => {
      settle?.(quit)
      await new Promise((r) => setTimeout(r, 0))
    }
  }
}

function closeEvent(): { prevented: boolean; preventDefault(): void } {
  const e = {
    prevented: false,
    preventDefault() {
      e.prevented = true
    }
  }
  return e
}

describe('ResidencyController', () => {
  describe('closing the window (TRAY-02)', () => {
    it('hides the window instead of closing it', () => {
      const h = harness(1)
      const e = closeEvent()
      h.ctrl.onWindowClose(e)
      expect(e.prevented).toBe(true)
      expect(h.calls).toEqual(['hide'])
    })

    it('lets the window close once a quit is under way', () => {
      const h = harness(1)
      h.ctrl.onBeforeQuit()
      const e = closeEvent()
      h.ctrl.onWindowClose(e)
      expect(e.prevented).toBe(false)
      expect(h.calls).toEqual([])
    })
  })

  describe('quitting (TRAY-10..13)', () => {
    it('quits without a dialog when no session runs (TRAY-10)', async () => {
      const h = harness(0)
      await h.ctrl.requestQuit()
      expect(h.confirms).toEqual([])
      expect(h.calls).toEqual(['quit'])
    })

    it('asks with the running count before quitting (TRAY-11)', () => {
      const h = harness(2)
      void h.ctrl.requestQuit()
      expect(h.confirms).toEqual([2])
      expect(h.calls).toEqual([])
    })

    it('words the dialog with the count (TRAY-11)', () => {
      expect(quitMessage(2)).toBe('2 running session(s) will be stopped. Quit anyway?')
      expect(quitMessage(1)).toBe('1 running session(s) will be stopped. Quit anyway?')
    })

    it('quits when the user confirms (TRAY-12)', async () => {
      const h = harness(2)
      const pending = h.ctrl.requestQuit()
      await h.answer(true)
      await pending
      expect(h.calls).toEqual(['quit'])
    })

    it('keeps running when the user cancels (TRAY-13)', async () => {
      const h = harness(2)
      const pending = h.ctrl.requestQuit()
      await h.answer(false)
      await pending
      expect(h.calls).toEqual([])
      const e = closeEvent()
      h.ctrl.onWindowClose(e)
      expect(e.prevented).toBe(true)
    })

    it('opens one dialog when quit is asked twice', async () => {
      const h = harness(2)
      const first = h.ctrl.requestQuit()
      const second = h.ctrl.requestQuit()
      expect(h.confirms).toEqual([2])
      await h.answer(true)
      await Promise.all([first, second])
      expect(h.calls).toEqual(['quit'])
    })

    it('asks again after a cancelled dialog', async () => {
      const h = harness(3)
      const first = h.ctrl.requestQuit()
      await h.answer(false)
      await first
      void h.ctrl.requestQuit()
      expect(h.confirms).toEqual([3, 3])
    })
  })

  describe('Windows ending the session (TRAY-15)', () => {
    it('quits without a dialog, even with sessions running', () => {
      const h = harness(4)
      h.ctrl.onSessionEnd()
      expect(h.confirms).toEqual([])
      expect(h.calls).toEqual(['quit'])
    })

    it('lets the window close afterwards', () => {
      const h = harness(4)
      h.ctrl.onSessionEnd()
      const e = closeEvent()
      h.ctrl.onWindowClose(e)
      expect(e.prevented).toBe(false)
    })
  })

  it('reveals the window (TRAY-04, TRAY-31)', () => {
    const h = harness(0)
    h.ctrl.reveal()
    expect(h.calls).toEqual(['reveal'])
  })

  describe('tray menu (TRAY-05)', () => {
    it('offers Open Playground and Quit, in that order', () => {
      const h = harness(0)
      expect(h.ctrl.menuTemplate().map((i) => i.label)).toEqual(['Open Playground', 'Quit'])
    })

    it('Open Playground reveals the window', () => {
      const h = harness(0)
      h.ctrl.menuTemplate()[0].click()
      expect(h.calls).toEqual(['reveal'])
    })

    it('Quit goes through the confirmed quit', () => {
      const h = harness(2)
      h.ctrl.menuTemplate()[1].click()
      expect(h.confirms).toEqual([2])
      expect(h.calls).toEqual([])
    })
  })
})
