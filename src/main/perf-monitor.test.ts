import { describe, expect, it } from 'vitest'
import {
  formatLoopLine,
  LOOP_LOG_INTERVAL_MS,
  LOOP_RESOLUTION_MS,
  startLoopDelayLog,
  type LoopHistogram
} from './perf-monitor'

/** A histogram fake in nanoseconds, as `monitorEventLoopDelay` reports. */
function fakeHistogram(
  p50Ns: number,
  p99Ns: number,
  maxNs: number
): { h: LoopHistogram; calls: string[] } {
  const calls: string[] = []
  const h: LoopHistogram = {
    enable: () => {
      calls.push('enable')
      return true
    },
    disable: () => {
      calls.push('disable')
      return true
    },
    reset: () => {
      calls.push('reset')
    },
    percentile: (p) => (p === 50 ? p50Ns : p === 99 ? p99Ns : NaN),
    max: maxNs
  }
  return { h, calls }
}

interface Harness {
  deps: {
    monitor: (opts: { resolution: number }) => LoopHistogram
    every: (cb: () => void, ms: number) => object
    clear: (handle: unknown) => void
    log: (line: string) => void
  }
  monitors: Array<{ resolution: number }>
  intervals: Array<{ cb: () => void; ms: number; handle: object }>
  cleared: object[]
  lines: string[]
}

function harness(h: LoopHistogram): Harness {
  const monitors: Array<{ resolution: number }> = []
  const intervals: Array<{ cb: () => void; ms: number; handle: object }> = []
  const cleared: object[] = []
  const lines: string[] = []
  const deps = {
    monitor: (opts: { resolution: number }) => {
      monitors.push(opts)
      return h
    },
    every: (cb: () => void, ms: number) => {
      const handle = {}
      intervals.push({ cb, ms, handle })
      return handle
    },
    clear: (handle: unknown) => {
      cleared.push(handle as object)
    },
    log: (line: string) => {
      lines.push(line)
    }
  }
  return { deps, monitors, intervals, cleared, lines }
}

describe('formatLoopLine', () => {
  it('reports p50, p99 and max in ms with one decimal (PERF-16)', () => {
    const { h } = fakeHistogram(10_240_000, 21_495_807, 105_119_743)
    expect(formatLoopLine(h)).toBe('[perf] loop p50=10.2 p99=21.5 max=105.1')
  })
})

describe('startLoopDelayLog', () => {
  it('pins the 10 s interval and the 10 ms resolution (PERF-16)', () => {
    expect(LOOP_LOG_INTERVAL_MS).toBe(10_000)
    expect(LOOP_RESOLUTION_MS).toBe(10)
    const { h, calls } = fakeHistogram(0, 0, 0)
    const t = harness(h)
    startLoopDelayLog({ enabled: true, ...t.deps })
    expect(t.monitors).toEqual([{ resolution: 10 }])
    expect(t.intervals.map((i) => i.ms)).toEqual([10_000])
    expect(calls).toEqual(['enable'])
  })

  it('logs one line per interval and resets the histogram after it (PERF-16)', () => {
    const { h, calls } = fakeHistogram(1_000_000, 2_000_000, 3_000_000)
    const t = harness(h)
    startLoopDelayLog({ enabled: true, ...t.deps })
    t.intervals[0].cb()
    t.intervals[0].cb()
    expect(t.lines).toEqual([
      '[perf] loop p50=1.0 p99=2.0 max=3.0',
      '[perf] loop p50=1.0 p99=2.0 max=3.0'
    ])
    expect(calls).toEqual(['enable', 'reset', 'reset'])
  })

  it('starts nothing when disabled (PERF-18)', () => {
    const { h, calls } = fakeHistogram(0, 0, 0)
    const t = harness(h)
    const stop = startLoopDelayLog({ enabled: false, ...t.deps })
    stop()
    expect(t.monitors).toEqual([])
    expect(t.intervals).toEqual([])
    expect(t.cleared).toEqual([])
    expect(t.lines).toEqual([])
    expect(calls).toEqual([])
  })

  it('stop disables the monitor and clears the interval', () => {
    const { h, calls } = fakeHistogram(0, 0, 0)
    const t = harness(h)
    const stop = startLoopDelayLog({ enabled: true, ...t.deps })
    stop()
    expect(calls).toEqual(['enable', 'disable'])
    expect(t.cleared).toEqual([t.intervals[0].handle])
  })
})
