import { afterEach, describe, expect, it } from 'vitest'
import {
  createDiagnostics,
  diagnostics,
  diagnosticsEnabled,
  DIAGNOSTICS_ENV,
  DIAGNOSTICS_LOG_FILE,
  FLUSH_INTERVAL_MS,
  installDiagnostics,
  NOOP_DIAGNOSTICS,
  PER_SECOND_SPAN_MS,
  type Diagnostics,
  type DiagnosticsDeps,
  type DiagnosticsLine,
  type LogWriter,
  type LoopDelayMonitor
} from './diagnostics'

afterEach(() => installDiagnostics(null))

describe('constants', () => {
  it('pins the switch, the file, the minute and the per-second span (L-009)', () => {
    expect(DIAGNOSTICS_ENV).toBe('PLAYGROUND_DEBUG_PERF')
    expect(DIAGNOSTICS_LOG_FILE).toBe('perf-diagnostics.jsonl')
    expect(FLUSH_INTERVAL_MS).toBe(60000)
    expect(PER_SECOND_SPAN_MS).toBe(1000)
  })
})

describe('diagnosticsEnabled', () => {
  it('is true only for exactly "1" (PDIAG-02)', () => {
    expect(diagnosticsEnabled({ PLAYGROUND_DEBUG_PERF: '1' })).toBe(true)
    expect(diagnosticsEnabled({})).toBe(false)
    expect(diagnosticsEnabled({ PLAYGROUND_DEBUG_PERF: '' })).toBe(false)
    expect(diagnosticsEnabled({ PLAYGROUND_DEBUG_PERF: '0' })).toBe(false)
    expect(diagnosticsEnabled({ PLAYGROUND_DEBUG_PERF: 'true' })).toBe(false)
    expect(diagnosticsEnabled({ PLAYGROUND_DEBUG_PERF: ' 1' })).toBe(false)
  })
})

describe('diagnostics()', () => {
  it('answers the no-op before any install, the installed module after, and the no-op again on null', () => {
    expect(diagnostics()).toBe(NOOP_DIAGNOSTICS)
    const fake: Diagnostics = { ...NOOP_DIAGNOSTICS, enabled: true }
    installDiagnostics(fake)
    expect(diagnostics()).toBe(fake)
    installDiagnostics(null)
    expect(diagnostics()).toBe(NOOP_DIAGNOSTICS)
  })
})

describe('NOOP_DIAGNOSTICS', () => {
  it('is disabled and frozen (PDIAG-02)', () => {
    expect(NOOP_DIAGNOSTICS.enabled).toBe(false)
    expect(Object.isFrozen(NOOP_DIAGNOSTICS)).toBe(true)
  })

  it('runs the append exactly once and returns nothing (PDIAG-22)', () => {
    let appends = 0
    const result = NOOP_DIAGNOSTICS.measureAppend('s1', 'chunk', () => {
      appends++
    })
    expect(appends).toBe(1)
    expect(result).toBeUndefined()
  })

  it('hands out a git start whose end does nothing, and a listing end that does nothing', () => {
    const start = NOOP_DIAGNOSTICS.gitRequested('C:\\x\\bench-wt-1', ['status'])
    const end = start()
    expect(end()).toBeUndefined()
    expect(NOOP_DIAGNOSTICS.nameListingStarted()()).toBeUndefined()
  })

  it('can be stopped twice', () => {
    expect(() => {
      NOOP_DIAGNOSTICS.stop()
      NOOP_DIAGNOSTICS.stop()
    }).not.toThrow()
  })
})

/** A clock whose `now` and `wallNow` the test sets, and whose one timer it fires by hand. */
interface FakeClock {
  clock: DiagnosticsDeps['clock']
  setNow(ms: number): void
  setWall(ms: number): void
  timers: Array<{ ms: number; fn: () => void }>
  cancels: number
}

function fakeClock(): FakeClock {
  let now = 0
  let wall = 0
  const f: FakeClock = {
    clock: {
      now: () => now,
      wallNow: () => wall,
      every: (ms, fn) => {
        f.timers.push({ ms, fn })
        return () => {
          f.cancels++
        }
      }
    },
    setNow: (ms) => {
      now = ms
    },
    setWall: (ms) => {
      wall = ms
    },
    timers: [],
    cancels: 0
  }
  return f
}

/** A loop monitor in nanoseconds, as `monitorEventLoopDelay` reports. */
interface FakeMonitor extends LoopDelayMonitor {
  p50: number
  p99: number
  max: number
  count: number
  resets: number
  disables: number
}

function fakeMonitor(): FakeMonitor {
  const m: FakeMonitor = {
    p50: 0,
    p99: 0,
    max: 0,
    count: 0,
    resets: 0,
    disables: 0,
    percentile: (p) => (p === 50 ? m.p50 : p === 99 ? m.p99 : NaN),
    reset: () => {
      m.resets++
    },
    disable: () => {
      m.disables++
    }
  }
  return m
}

interface Harness {
  d: Diagnostics
  clock: FakeClock
  monitor: FakeMonitor
  monitorsStarted: number
  /** Every text handed to the writer, in call order. */
  written: string[]
  logs: string[]
  /** Fires the module's timer: one flush. */
  flush(): void
}

/** Lets queued writes run: the module chains them on promises. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function harness(opts: { writer?: LogWriter } = {}): Harness {
  const clock = fakeClock()
  const monitor = fakeMonitor()
  const h: Harness = {
    d: undefined as unknown as Diagnostics,
    clock,
    monitor,
    monitorsStarted: 0,
    written: [],
    logs: [],
    flush: () => clock.timers[0].fn()
  }
  const writer = opts.writer ?? (async () => {})
  h.d = createDiagnostics({
    clock: clock.clock,
    writer: (line) => {
      h.written.push(line)
      return writer(line)
    },
    startLoopMonitor: () => {
      h.monitorsStarted++
      return monitor
    },
    meta: { pid: 4242, version: '0.1.0' },
    log: (msg) => h.logs.push(msg)
  })
  return h
}

/** The lines written so far, parsed. */
const lines = (h: Harness): DiagnosticsLine[] => h.written.map((l) => JSON.parse(l))

describe('createDiagnostics: the minute line', () => {
  it('starts one loop monitor and one 60,000 ms timer (PDIAG-01)', () => {
    const h = harness()
    expect(h.d.enabled).toBe(true)
    expect(h.monitorsStarted).toBe(1)
    expect(h.clock.timers.map((t) => t.ms)).toEqual([60000])
  })

  it('writes one complete JSON line with the envelope and all six sections (PDIAG-03, PDIAG-04)', async () => {
    const h = harness()
    h.clock.setNow(60_000.4)
    h.clock.setWall(Date.UTC(2026, 9, 1, 12, 1, 0))
    h.flush()
    await settle()
    expect(h.written).toHaveLength(1)
    expect(h.written[0].endsWith('\n')).toBe(true)
    expect(h.written[0].indexOf('\n')).toBe(h.written[0].length - 1)
    expect(JSON.parse(h.written[0])).toEqual({
      v: 1,
      t: '2026-10-01T12:01:00.000Z',
      windowMs: 60000,
      pid: 4242,
      version: '0.1.0',
      loop: { p50Ms: 0, p99Ms: 0, maxMs: 0, resolutionMs: 10 },
      git: {
        count: 0,
        totalMs: 0,
        maxMs: 0,
        peakConcurrent: 0,
        wait: { totalMs: 0, maxMs: 0 },
        bySubcommand: {},
        byWorktree: {}
      },
      pty: {},
      emits: { 'worktree:status': {}, 'files:changed': {} },
      recounts: {},
      names: { count: 0, totalMs: 0, maxMs: 0 }
    })
  })

  it('measures each window from the previous line (PDIAG-06)', async () => {
    const h = harness()
    h.clock.setNow(60_000)
    h.flush()
    h.clock.setNow(120_250)
    h.flush()
    await settle()
    expect(lines(h).map((l) => l.windowMs)).toEqual([60000, 60250])
  })

  it('reports the loop percentiles in ms to 3 decimals and resets the histogram per line (PDIAG-18)', async () => {
    const h = harness()
    h.monitor.count = 6000
    h.monitor.p50 = 12_000_000
    h.monitor.p99 = 31_500_000
    h.monitor.max = 61_234_567
    h.flush()
    await settle()
    expect(lines(h)[0].loop).toEqual({ p50Ms: 12, p99Ms: 31.5, maxMs: 61.235, resolutionMs: 10 })
    expect(h.monitor.resets).toBe(1)
    h.flush()
    expect(h.monitor.resets).toBe(2)
  })

  it('reports zeros for a window with no loop sample (PDIAG-19)', async () => {
    const h = harness()
    h.monitor.count = 0
    h.monitor.p50 = NaN
    h.monitor.p99 = 9_000_000
    h.monitor.max = 9_000_000
    h.flush()
    await settle()
    expect(lines(h)[0].loop).toEqual({ p50Ms: 0, p99Ms: 0, maxMs: 0, resolutionMs: 10 })
  })

  it('writes one line at a time, in window order (PDIAG-03)', async () => {
    const pending: Array<() => void> = []
    const h = harness({
      writer: () =>
        new Promise<void>((resolve) => {
          pending.push(resolve)
        })
    })
    h.clock.setNow(1)
    h.flush()
    h.clock.setNow(3)
    h.flush()
    await settle()
    expect(h.written).toHaveLength(1)
    expect(lines(h)[0].windowMs).toBe(1)
    pending[0]()
    await settle()
    expect(lines(h).map((l) => l.windowMs)).toEqual([1, 2])
  })

  it('drops a line it cannot write, logs once per failure streak and never throws (PDIAG-07)', async () => {
    const outcomes = ['fail', 'fail', 'ok', 'fail']
    const h = harness({
      writer: async () => {
        if (outcomes.shift() === 'fail') {
          throw Object.assign(new Error('denied'), { code: 'EACCES' })
        }
      }
    })
    expect(() => {
      h.flush()
      h.flush()
    }).not.toThrow()
    await settle()
    expect(h.logs).toEqual(['[diagnostics] could not write perf-diagnostics.jsonl: EACCES'])
    h.flush()
    await settle()
    expect(h.logs).toHaveLength(1)
    h.flush()
    await settle()
    expect(h.logs).toEqual([
      '[diagnostics] could not write perf-diagnostics.jsonl: EACCES',
      '[diagnostics] could not write perf-diagnostics.jsonl: EACCES'
    ])
    // Each window was handed over once: a dropped line is not retried.
    expect(h.written).toHaveLength(4)
  })

  it('stop cancels the timer, disables the monitor and writes nothing after it (PDIAG-08)', async () => {
    const h = harness()
    h.d.stop()
    expect(h.clock.cancels).toBe(1)
    expect(h.monitor.disables).toBe(1)
    h.flush()
    await settle()
    expect(h.written).toEqual([])
    expect(h.monitor.resets).toBe(0)
    h.d.stop()
    expect(h.clock.cancels).toBe(1)
    expect(h.monitor.disables).toBe(1)
  })
})
