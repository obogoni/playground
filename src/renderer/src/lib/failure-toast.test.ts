import { describe, expect, it } from 'vitest'
import { failureToast } from './failure-toast'

const BASE = "Couldn't start session"

describe('failureToast', () => {
  it('appends the reason from a plain Error', () => {
    expect(failureToast(BASE, new Error('spawn pwsh.exe ENOENT'))).toBe(
      `${BASE}: spawn pwsh.exe ENOENT`
    )
  })

  it('peels the api.ts IPC wrapper', () => {
    const err = new Error("IPC 'sessions:spawn' failed: spawn pwsh.exe ENOENT")
    expect(failureToast(BASE, err)).toBe(`${BASE}: spawn pwsh.exe ENOENT`)
  })

  it('peels the nested IPC + remote-method + Error wrappers', () => {
    const err = new Error(
      "IPC 'sessions:spawn' failed: Error invoking remote method 'sessions:spawn': Error: Unknown agent: Claude"
    )
    expect(failureToast(BASE, err)).toBe(`${BASE}: Unknown agent: Claude`)
  })

  it('keeps a colon that belongs to the reason itself', () => {
    const err = new Error("IPC 'sessions:spawn' failed: Error: Unknown session: abc-123")
    expect(failureToast(BASE, err)).toBe(`${BASE}: Unknown session: abc-123`)
  })

  it('drops a trailing stack, keeping the first line', () => {
    const err = new Error(
      'spawn pwsh.exe ENOENT\n    at ChildProcess._handle.onexit\n    at Socket'
    )
    expect(failureToast(BASE, err)).toBe(`${BASE}: spawn pwsh.exe ENOENT`)
  })

  it('clips a long reason to one row', () => {
    const err = new Error('x'.repeat(400))
    const toast = failureToast(BASE, err)
    expect(toast.length).toBeLessThanOrEqual(BASE.length + 2 + 160)
    expect(toast.endsWith('…')).toBe(true)
  })

  it('returns the plain message when nothing intelligible survives', () => {
    expect(failureToast(BASE, new Error(''))).toBe(BASE)
    expect(failureToast(BASE, new Error("IPC 'sessions:spawn' failed:"))).toBe(BASE)
  })

  it('handles a non-Error rejection', () => {
    expect(failureToast(BASE, 'boom')).toBe(`${BASE}: boom`)
  })
})
