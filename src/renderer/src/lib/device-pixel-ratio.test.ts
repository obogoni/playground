import { describe, expect, it } from 'vitest'
import { watchDevicePixelRatio, type DprWindow } from './device-pixel-ratio'

interface FakeQuery {
  media: string
  listeners: Set<() => void>
  matches: boolean
}

/**
 * A window whose resolution queries behave like the browser's: a query fires
 * `change` only when its `matches` flips, which for `(resolution: Xdppx)` is
 * when the ratio moves onto or off X.
 */
function fakeWindow(ratio: number): {
  win: DprWindow
  queries: FakeQuery[]
  setRatio: (next: number) => void
} {
  const queries: FakeQuery[] = []
  const matchesNow = (media: string): boolean =>
    media === `(resolution: ${win.devicePixelRatio}dppx)`
  const win = {
    devicePixelRatio: ratio,
    matchMedia: (media: string) => {
      const q: FakeQuery = { media, listeners: new Set(), matches: matchesNow(media) }
      queries.push(q)
      return {
        get matches() {
          return q.matches
        },
        addEventListener: (type: string, cb: () => void) => {
          if (type === 'change') q.listeners.add(cb)
        },
        removeEventListener: (type: string, cb: () => void) => {
          if (type === 'change') q.listeners.delete(cb)
        }
      } as unknown as MediaQueryList
    }
  } as DprWindow
  const setRatio = (next: number): void => {
    ;(win as { devicePixelRatio: number }).devicePixelRatio = next
    for (const q of [...queries]) {
      const now = matchesNow(q.media)
      if (now === q.matches) continue
      q.matches = now
      for (const cb of [...q.listeners]) cb()
    }
  }
  return { win, queries, setRatio }
}

const armed = (queries: FakeQuery[]): string[] =>
  queries.filter((q) => q.listeners.size > 0).map((q) => q.media)

describe('watchDevicePixelRatio', () => {
  it('arms a resolution query for the current ratio (TROW-09)', () => {
    const one = fakeWindow(1)
    watchDevicePixelRatio(one.win, () => {})
    expect(armed(one.queries)).toEqual(['(resolution: 1dppx)'])

    const scaled = fakeWindow(1.25)
    watchDevicePixelRatio(scaled.win, () => {})
    expect(armed(scaled.queries)).toEqual(['(resolution: 1.25dppx)'])
  })

  it('calls back once with the new ratio and re-arms on it (TROW-09)', () => {
    const { win, queries, setRatio } = fakeWindow(1.25)
    const calls: number[] = []
    watchDevicePixelRatio(win, (dpr) => calls.push(dpr))
    setRatio(1.5)
    expect(calls).toEqual([1.5])
    expect(queries[0].listeners.size).toBe(0)
    expect(armed(queries)).toEqual(['(resolution: 1.5dppx)'])
  })

  it('follows every later change from a freshly armed query (TROW-10)', () => {
    const { win, queries, setRatio } = fakeWindow(1.25)
    const calls: number[] = []
    watchDevicePixelRatio(win, (dpr) => calls.push(dpr))
    for (const next of [1.5, 2, 1]) {
      setRatio(next)
      expect(armed(queries)).toEqual([`(resolution: ${next}dppx)`])
    }
    expect(calls).toEqual([1.5, 2, 1])
  })

  it('stops listening when disposed, and calls nothing afterwards (TROW-10)', () => {
    const { win, queries, setRatio } = fakeWindow(1)
    const calls: number[] = []
    const stop = watchDevicePixelRatio(win, (dpr) => calls.push(dpr))
    stop()
    expect(armed(queries)).toEqual([])
    setRatio(1.5)
    setRatio(1)
    expect(calls).toEqual([])
  })

  it('disposes the re-armed query after a change, not only the first (TROW-10)', () => {
    const { win, queries, setRatio } = fakeWindow(1)
    const calls: number[] = []
    const stop = watchDevicePixelRatio(win, (dpr) => calls.push(dpr))
    setRatio(1.5)
    stop()
    expect(armed(queries)).toEqual([])
    setRatio(2)
    expect(calls).toEqual([1.5])
  })
})
