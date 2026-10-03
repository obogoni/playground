import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendWriter,
  createAppDiagnostics,
  createDiagnostics,
  diagnostics,
  diagnosticsEnabled,
  DIAGNOSTICS_ENV,
  DIAGNOSTICS_LOG_FILE,
  FLUSH_INTERVAL_MS,
  folderOf,
  gitSubcommand,
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

describe('gitSubcommand', () => {
  it('takes the first non-option argument, skipping the value of -c and -C (PDIAG-10)', () => {
    expect(gitSubcommand(['status', '--porcelain'])).toBe('status')
    expect(gitSubcommand(['-C', 'x', '--no-optional-locks', 'status'])).toBe('status')
    expect(gitSubcommand(['-c', 'core.quotepath=off', 'log'])).toBe('log')
    expect(gitSubcommand(['--version'])).toBe('(none)')
    expect(gitSubcommand([])).toBe('(none)')
  })
})

describe('folderOf', () => {
  it('names a worktree by the last segment of its path (PDIAG-05, PDIAG-47)', () => {
    expect(folderOf('C:\\x\\bench-wt-1')).toBe('bench-wt-1')
    expect(folderOf('/home/x/bench-wt-1')).toBe('bench-wt-1')
    expect(folderOf('C:\\x\\bench-wt-1\\')).toBe('bench-wt-1')
    expect(folderOf('/home/x/bench-wt-1/')).toBe('bench-wt-1')
  })

  it('gives (none) for a path with no segment (PDIAG-47)', () => {
    expect(folderOf('C:\\')).toBe('(none)')
    expect(folderOf('C:/')).toBe('(none)')
    expect(folderOf('/')).toBe('(none)')
    expect(folderOf('')).toBe('(none)')
  })
})

describe('createDiagnostics: git processes', () => {
  const WT1 = 'C:\\x\\bench-wt-1'
  const WT2 = 'C:\\x\\bench-wt-2'

  /** Requests and starts a call at the current fake time; returns its end. */
  const startGit = (h: Harness, cwd: string, args: string[]): (() => void) =>
    h.d.gitRequested(cwd, args)()

  const flushed = async (h: Harness): Promise<DiagnosticsLine> => {
    h.flush()
    await settle()
    return lines(h).at(-1) as DiagnosticsLine
  }

  it('adds each duration to the total and to its subcommand (PDIAG-10, PDIAG-11)', async () => {
    const h = harness()
    const a = startGit(h, WT1, ['status', '--porcelain'])
    const b = startGit(h, WT1, ['status'])
    const c = startGit(h, WT1, ['rev-parse', '--git-dir'])
    h.clock.setNow(50)
    c()
    h.clock.setNow(100)
    a()
    h.clock.setNow(300)
    b()
    const line = await flushed(h)
    expect(line.git.count).toBe(3)
    expect(line.git.totalMs).toBe(450)
    expect(line.git.maxMs).toBe(300)
    expect(line.git.bySubcommand).toEqual({
      status: { count: 2, totalMs: 400, maxMs: 300 },
      'rev-parse': { count: 1, totalMs: 50, maxMs: 50 }
    })
  })

  it('reports the most processes running at once, overall and per worktree (PDIAG-12)', async () => {
    const h = harness()
    const ends = [
      startGit(h, WT1, ['status']),
      startGit(h, WT1, ['status']),
      startGit(h, WT1, ['status']),
      startGit(h, WT2, ['status'])
    ]
    ends.forEach((end) => end())
    const line = await flushed(h)
    expect(line.git.peakConcurrent).toBe(4)
    expect(line.git.byWorktree['bench-wt-1'].peakConcurrent).toBe(3)
    expect(line.git.byWorktree['bench-wt-2'].peakConcurrent).toBe(1)
    expect(line.git.byWorktree['bench-wt-1'].count).toBe(3)
    expect(line.git.byWorktree['bench-wt-2'].count).toBe(1)
  })

  it('reads a peak of 1 for calls that run one after the other (PDIAG-12)', async () => {
    const h = harness()
    startGit(h, WT1, ['status'])()
    startGit(h, WT1, ['status'])()
    const line = await flushed(h)
    expect(line.git.peakConcurrent).toBe(1)
    expect(line.git.byWorktree['bench-wt-1'].peakConcurrent).toBe(1)
  })

  /** maxPerSecond of `status` on bench-wt-1 for starts at these times. */
  const perSecond = async (startTimes: number[]): Promise<number> => {
    const h = harness()
    for (const t of startTimes) {
      h.clock.setNow(t)
      startGit(h, WT1, ['status'])()
    }
    const line = await flushed(h)
    return line.git.byWorktree['bench-wt-1'].bySubcommand.status.maxPerSecond
  }

  it('counts the most starts inside any sliding 1,000 ms span (PDIAG-13)', async () => {
    expect(await perSecond([0, 400, 900])).toBe(3)
    expect(await perSecond([0, 600, 1200])).toBe(2)
    // Two starts 100 ms apart across a second's edge: a fixed bucket would read 1.
    expect(await perSecond([950, 1050])).toBe(2)
    expect(await perSecond([0, 1000])).toBe(1)
  })

  it('reports count and maxPerSecond per worktree and subcommand (PDIAG-13)', async () => {
    const h = harness()
    startGit(h, WT1, ['status'])()
    startGit(h, WT1, ['status'])()
    startGit(h, WT1, ['rev-parse'])()
    startGit(h, WT2, ['status'])()
    const line = await flushed(h)
    expect(line.git.byWorktree['bench-wt-1'].bySubcommand).toEqual({
      status: { count: 2, maxPerSecond: 2 },
      'rev-parse': { count: 1, maxPerSecond: 1 }
    })
    expect(line.git.byWorktree['bench-wt-2'].bySubcommand).toEqual({
      status: { count: 1, maxPerSecond: 1 }
    })
  })

  it('adds the queue wait at the start and ignores a call that never started (PDIAG-15)', async () => {
    const h = harness()
    const first = h.d.gitRequested(WT1, ['status'])
    const second = h.d.gitRequested(WT1, ['status'])
    h.d.gitRequested(WT1, ['status']) // queued, never started
    h.clock.setNow(40)
    first()
    h.clock.setNow(100)
    second()
    const line = await flushed(h)
    expect(line.git.wait).toEqual({ totalMs: 140, maxMs: 100 })
    expect(line.git.count).toBe(2)
    expect(line.git.peakConcurrent).toBe(2)
    expect(line.git.byWorktree['bench-wt-1'].count).toBe(2)
    expect(line.git.byWorktree['bench-wt-1'].peakConcurrent).toBe(2)
  })

  it('counts a start or an end reported twice once (PDIAG-16)', async () => {
    const h = harness()
    const start = h.d.gitRequested(WT1, ['status'])
    const end = start()
    start()
    h.clock.setNow(30)
    end()
    end()
    const line1 = await flushed(h)
    expect(line1.git.count).toBe(1)
    expect(line1.git.peakConcurrent).toBe(1)
    expect(line1.git.totalMs).toBe(30)
    expect(line1.git.bySubcommand.status).toEqual({ count: 1, totalMs: 30, maxMs: 30 })
    const line2 = await flushed(h)
    expect(line2.git.peakConcurrent).toBe(0)
    expect(line2.git.byWorktree).toEqual({})
  })

  it('counts a process in the window it started and times it in the window it ended (PDIAG-06, PDIAG-45)', async () => {
    const h = harness()
    h.clock.setNow(59_800)
    const end = startGit(h, WT1, ['status'])
    h.clock.setNow(60_000)
    const line1 = await flushed(h)
    expect(line1.git).toEqual({
      count: 1,
      totalMs: 0,
      maxMs: 0,
      peakConcurrent: 1,
      wait: { totalMs: 0, maxMs: 0 },
      bySubcommand: { status: { count: 1, totalMs: 0, maxMs: 0 } },
      byWorktree: {
        'bench-wt-1': {
          count: 1,
          peakConcurrent: 1,
          bySubcommand: { status: { count: 1, maxPerSecond: 1 } }
        }
      }
    })
    h.clock.setNow(60_300)
    end()
    h.clock.setNow(120_000)
    const line2 = await flushed(h)
    expect(line2.git).toEqual({
      count: 0,
      totalMs: 500,
      maxMs: 500,
      peakConcurrent: 1,
      wait: { totalMs: 0, maxMs: 0 },
      bySubcommand: { status: { count: 0, totalMs: 500, maxMs: 500 } },
      byWorktree: { 'bench-wt-1': { count: 0, peakConcurrent: 1, bySubcommand: {} } }
    })
    const line3 = await flushed(h)
    expect(line3.git.peakConcurrent).toBe(0)
    expect(line3.git.bySubcommand).toEqual({})
  })

  it('writes no parent folder and no git argument but the subcommand (PDIAG-05)', async () => {
    const h = harness()
    startGit(h, 'C:\\Users\\someone\\secret-project\\bench-wt-1', [
      '-c',
      'credential.helper=store',
      'log',
      '--format=%H',
      'refs/heads/private-branch'
    ])()
    startGit(h, '/home/someone/secret-project/bench-wt-2', ['-C', 'other-dir', 'status'])()
    h.flush()
    await settle()
    const text = h.written[0]
    expect(text).toContain('"bench-wt-1"')
    expect(text).toContain('"bench-wt-2"')
    expect(text).toContain('"log"')
    expect(text).toContain('"status"')
    for (const leak of [
      'Users',
      'someone',
      'secret-project',
      'home',
      'credential',
      'store',
      '--format',
      '%H',
      'refs/heads',
      'private-branch',
      'other-dir'
    ]) {
      expect(text).not.toContain(leak)
    }
  })
})

describe('createDiagnostics: output, recounts, emits and listings', () => {
  const WT1 = 'C:\\x\\bench-wt-1'

  const flushed = async (h: Harness): Promise<DiagnosticsLine> => {
    h.flush()
    await settle()
    return lines(h).at(-1) as DiagnosticsLine
  }

  /** An append that takes `ms` on the fake clock. */
  const taking = (h: Harness, ms: number, now: { t: number }): (() => void) => {
    return () => {
      now.t += ms
      h.clock.setNow(now.t)
    }
  }

  it('counts each chunk and its UTF-8 bytes per session, running the append once (PDIAG-20)', async () => {
    const h = harness()
    let appends = 0
    h.d.measureAppend('s1', 'é\n', () => {
      appends++
    })
    expect(appends).toBe(1)
    const line = await flushed(h)
    expect(line.pty).toEqual({ s1: { chunks: 1, bytes: 3, appendMs: 0, appendMaxMs: 0 } })
  })

  it('adds each append duration and keeps the longest, per session (PDIAG-21)', async () => {
    const h = harness()
    const now = { t: 0 }
    h.d.measureAppend('s1', 'ab', taking(h, 2, now))
    h.d.measureAppend('s1', 'cd', taking(h, 5, now))
    h.d.measureAppend('s2', 'xyz', taking(h, 1.25, now))
    const line = await flushed(h)
    expect(line.pty).toEqual({
      s1: { chunks: 2, bytes: 4, appendMs: 7, appendMaxMs: 5 },
      s2: { chunks: 1, bytes: 3, appendMs: 1.25, appendMaxMs: 1.25 }
    })
  })

  it('records a chunk whose append throws and passes the same error on (PDIAG-23)', async () => {
    const h = harness()
    const boom = new Error('append failed')
    let caught: unknown
    try {
      h.d.measureAppend('s1', 'abc', () => {
        h.clock.setNow(4)
        throw boom
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBe(boom)
    const line = await flushed(h)
    expect(line.pty).toEqual({ s1: { chunks: 1, bytes: 3, appendMs: 4, appendMaxMs: 4 } })
  })

  it('keeps a session in the window it printed in and drops it from later lines (PDIAG-46)', async () => {
    const h = harness()
    h.d.measureAppend('s1', 'abc', () => {})
    const line1 = await flushed(h)
    const line2 = await flushed(h)
    expect(Object.keys(line1.pty)).toEqual(['s1'])
    expect(line2.pty).toEqual({})
  })

  it('counts recounts and emits under the worktree folder (PDIAG-24, PDIAG-25, PDIAG-26)', async () => {
    const h = harness()
    h.d.recountStarted(WT1)
    h.d.recountStarted(WT1)
    h.d.emitted('worktree:status', WT1)
    h.d.emitted('files:changed', '/home/x/bench-wt-2')
    const line = await flushed(h)
    expect(line.recounts).toEqual({ 'bench-wt-1': 2 })
    expect(line.emits).toEqual({
      'worktree:status': { 'bench-wt-1': 1 },
      'files:changed': { 'bench-wt-2': 1 }
    })
    const line2 = await flushed(h)
    expect(line2.recounts).toEqual({})
    expect(line2.emits).toEqual({ 'worktree:status': {}, 'files:changed': {} })
  })

  it('counts each name listing and times it when it settles, once (PDIAG-27)', async () => {
    const h = harness()
    const first = h.d.nameListingStarted()
    h.clock.setNow(1800)
    first()
    first()
    const second = h.d.nameListingStarted()
    h.clock.setNow(4000)
    second()
    const line = await flushed(h)
    expect(line.names).toEqual({ count: 2, totalMs: 4000, maxMs: 2200 })
  })

  it('writes no terminal output and no parent folder (PDIAG-05)', async () => {
    const h = harness()
    h.d.measureAppend('s1', 'TOP-SECRET-OUTPUT\r\n', () => {})
    h.d.recountStarted('C:\\Users\\someone\\secret-project\\bench-wt-1')
    h.d.emitted('worktree:status', 'C:\\Users\\someone\\secret-project\\bench-wt-1')
    h.d.emitted('files:changed', '/home/someone/secret-project/bench-wt-2')
    h.flush()
    await settle()
    const text = h.written[0]
    expect(text).toContain('"bench-wt-1"')
    expect(text).toContain('"bench-wt-2"')
    for (const leak of ['TOP-SECRET-OUTPUT', 'Users', 'someone', 'secret-project', 'home']) {
      expect(text).not.toContain(leak)
    }
  })
})

describe('real ports', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pg-diag-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
  })

  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  it('appendWriter creates the file on the first line and appends the next after it (PDIAG-03)', async () => {
    const file = join(dir, 'perf-diagnostics.jsonl')
    const write = appendWriter(file)
    await write('{"n":1}\n')
    expect(readFileSync(file, 'utf8')).toBe('{"n":1}\n')
    await write('{"n":2}\n')
    expect(readFileSync(file, 'utf8')).toBe('{"n":1}\n{"n":2}\n')
  })

  it('createAppDiagnostics answers the no-op and writes no file when the switch is off (PDIAG-02)', async () => {
    const d = createAppDiagnostics({ env: {}, userDataPath: dir, version: '9.9.9', intervalMs: 10 })
    expect(d).toBe(NOOP_DIAGNOSTICS)
    await wait(50)
    expect(readdirSync(dir)).toEqual([])
  })

  it('createAppDiagnostics starts no timer and no monitor when the switch is off, one of each when on (PDIAG-02, PDIAG-17)', () => {
    const started = (env: NodeJS.ProcessEnv): { timers: number[]; monitors: number } => {
      const clock = fakeClock()
      let monitors = 0
      const d = createAppDiagnostics({
        env,
        userDataPath: dir,
        version: '9.9.9',
        ports: {
          clock: clock.clock,
          startLoopMonitor: () => {
            monitors++
            return fakeMonitor()
          }
        }
      })
      d.stop()
      return { timers: clock.timers.map((t) => t.ms), monitors }
    }
    for (const value of [undefined, '', '0', 'true']) {
      expect(started({ PLAYGROUND_DEBUG_PERF: value })).toEqual({ timers: [], monitors: 0 })
    }
    expect(started({ PLAYGROUND_DEBUG_PERF: '1' })).toEqual({ timers: [60000], monitors: 1 })
  })

  it('createAppDiagnostics writes lines to <userData>/perf-diagnostics.jsonl when the switch is on (PDIAG-01, PDIAG-03)', async () => {
    const d = createAppDiagnostics({
      env: { PLAYGROUND_DEBUG_PERF: '1' },
      userDataPath: dir,
      version: '9.9.9',
      intervalMs: 50
    })
    const file = join(dir, 'perf-diagnostics.jsonl')
    try {
      expect(d.enabled).toBe(true)
      for (let i = 0; i < 100 && !existsSync(file); i++) await wait(10)
      await wait(20)
      const text = readFileSync(file, 'utf8')
      expect(text.endsWith('\n')).toBe(true)
      const first = JSON.parse(text.split('\n')[0]) as DiagnosticsLine
      expect(first.v).toBe(1)
      expect(first.version).toBe('9.9.9')
      expect(first.pid).toBe(process.pid)
      expect(first.loop.resolutionMs).toBe(10)
    } finally {
      d.stop()
      await wait(100)
    }
  })
})
