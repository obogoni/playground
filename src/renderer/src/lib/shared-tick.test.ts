import { describe, expect, it } from 'vitest'
import { createTicker, type TickTimers } from './shared-tick'

/** Hand-rolled timers: records every interval and fires them on demand. */
function fakeTimers(): TickTimers & {
  started: { ms: number; fn: () => void; id: number }[]
  cleared: number[]
  clock: number
  /** Advances the clock by `by` (default `ms`) and runs the live `ms` intervals. */
  fire: (ms: number, by?: number) => void
} {
  let next = 1
  const t = {
    started: [] as { ms: number; fn: () => void; id: number }[],
    cleared: [] as number[],
    clock: 1_000_000,
    now: () => t.clock,
    setInterval: (fn: () => void, ms: number) => {
      const id = next++
      t.started.push({ ms, fn, id })
      return id
    },
    clearInterval: (id: unknown) => {
      t.cleared.push(id as number)
    },
    fire: (ms: number, by = ms) => {
      t.clock += by
      for (const s of t.started) if (s.ms === ms && !t.cleared.includes(s.id)) s.fn()
    }
  }
  return t
}

describe('createTicker (PERF-14 AC 1)', () => {
  it('drives 5 subscribers at 1,000 ms from exactly one setInterval and notifies all per tick', () => {
    const timers = fakeTimers()
    const ticker = createTicker(timers)
    const calls = [0, 0, 0, 0, 0]
    calls.forEach((_, i) => ticker.subscribe(1000, () => calls[i]++))

    expect(timers.started.map((s) => s.ms)).toEqual([1000])
    timers.fire(1000)
    timers.fire(1000)
    expect(calls).toEqual([2, 2, 2, 2, 2])
    expect(ticker.current(1000)).toBe(timers.clock)
  })

  it('clears the interval on the last unsubscribe and starts a new one for the next subscriber', () => {
    const timers = fakeTimers()
    const ticker = createTicker(timers)
    const offA = ticker.subscribe(1000, () => {})
    const offB = ticker.subscribe(1000, () => {})
    offA()
    expect(timers.cleared).toEqual([])
    offB()
    expect(timers.cleared).toEqual([timers.started[0].id])

    ticker.subscribe(1000, () => {})
    expect(timers.started.map((s) => s.ms)).toEqual([1000, 1000])
    expect(timers.started[1].id).not.toBe(timers.started[0].id)
  })

  it('keeps one interval per distinct period: 1,000 ms and 15,000 ms make two', () => {
    const timers = fakeTimers()
    const ticker = createTicker(timers)
    let fast = 0
    let slow = 0
    ticker.subscribe(1000, () => fast++)
    ticker.subscribe(1000, () => fast++)
    ticker.subscribe(15_000, () => slow++)
    ticker.subscribe(15_000, () => slow++)

    expect(timers.started.map((s) => s.ms).sort((a, b) => a - b)).toEqual([1000, 15_000])
    timers.fire(1000)
    expect([fast, slow]).toEqual([2, 0])
    timers.fire(15_000)
    expect([fast, slow]).toEqual([2, 2])
  })

  it('returns the same value between ticks, so useSyncExternalStore sees a stable snapshot', () => {
    const timers = fakeTimers()
    const ticker = createTicker(timers)
    ticker.subscribe(1000, () => {})
    const first = ticker.current(1000)
    timers.clock += 400
    expect(ticker.current(1000)).toBe(first)
    timers.fire(1000, 600)
    expect(ticker.current(1000)).toBe(first + 1000)
  })

  it('catches up to now when a subscriber joins, so a clock that turns live is not stale', () => {
    const timers = fakeTimers()
    const ticker = createTicker(timers)
    const before = ticker.current(15_000)
    timers.clock += 14_000
    expect(ticker.current(15_000)).toBe(before)
    ticker.subscribe(15_000, () => {})
    expect(ticker.current(15_000)).toBe(before + 14_000)
  })
})
