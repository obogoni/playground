import { useCallback, useState, useSyncExternalStore } from 'react'

/** The clock and interval functions a ticker runs on; injected in tests. */
export interface TickTimers {
  now: () => number
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

export interface Ticker {
  /** Adds a listener to the `ms` tick; returns its unsubscribe. */
  subscribe: (ms: number, cb: () => void) => () => void
  /** The `now` of the last `ms` tick, stable until the next one. */
  current: (ms: number) => number
}

interface Tick {
  value: number
  listeners: Set<() => void>
  timer: unknown
}

/**
 * One interval per distinct period, started with its first subscriber and
 * cleared with its last, whatever the number of clocks (PERF-14 AC 1).
 */
export function createTicker(timers: TickTimers): Ticker {
  const ticks = new Map<number, Tick>()

  const tickOf = (ms: number): Tick => {
    let tick = ticks.get(ms)
    if (!tick) {
      tick = { value: timers.now(), listeners: new Set(), timer: undefined }
      ticks.set(ms, tick)
    }
    return tick
  }

  return {
    subscribe(ms, cb) {
      const tick = tickOf(ms)
      // Catch up at once, so a clock that turns live does not show a value
      // up to a whole interval old (as `useNow` does).
      tick.value = timers.now()
      tick.listeners.add(cb)
      if (tick.listeners.size === 1) {
        tick.timer = timers.setInterval(() => {
          tick.value = timers.now()
          for (const listener of [...tick.listeners]) listener()
        }, ms)
      }
      return () => {
        if (!tick.listeners.delete(cb) || tick.listeners.size > 0) return
        timers.clearInterval(tick.timer)
        tick.timer = undefined
      }
    },
    current: (ms) => tickOf(ms).value
  }
}

const shared = createTicker({
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>)
})

const noop = (): void => {}

/**
 * `Date.now()` from the shared tick of `intervalMs`, so every clock on the same
 * period re-renders on one interval. A null interval does not tick: it holds
 * the mount time, which nothing open is measured against.
 */
export function useSharedNow(intervalMs: number | null): number {
  const [mounted] = useState(Date.now)
  const subscribe = useCallback(
    (cb: () => void) => (intervalMs === null ? noop : shared.subscribe(intervalMs, cb)),
    [intervalMs]
  )
  const snapshot = useCallback(
    () => (intervalMs === null ? mounted : shared.current(intervalMs)),
    [intervalMs, mounted]
  )
  return useSyncExternalStore(subscribe, snapshot)
}
