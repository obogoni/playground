import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentChild, AgentSpawn } from './agent-step-runner'
import { installDiagnostics, NOOP_DIAGNOSTICS } from './diagnostics'
import {
  NAME_BACKOFF_BASE_MS,
  NAME_BACKOFF_FACTOR,
  NAME_BACKOFF_MAX_MS,
  NAME_DEBOUNCE_MS,
  NAME_INTERVAL_MS,
  NAME_TIMEOUT_MS,
  SessionNamePoller
} from './session-name-poller'

interface SpawnCall {
  bin: string
  argv: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

/** One spawned child, driven by the test after the poller wired its handlers. */
interface ChildController {
  killed: boolean
  stdout(chunk: string): void
  stderr(chunk: string): void
  error(err: Error): void
  close(code: number | null): void
}

function makeFakeSpawn(): { spawn: AgentSpawn; calls: SpawnCall[]; children: ChildController[] } {
  const calls: SpawnCall[] = []
  const children: ChildController[] = []
  const spawn: AgentSpawn = (bin, argv, opts) => {
    calls.push({ bin, argv, cwd: opts.cwd, env: opts.env })
    let outCb: (c: string) => void = () => {}
    let errCb: (c: string) => void = () => {}
    let errorCb: (e: Error) => void = () => {}
    let closeCb: (code: number | null) => void = () => {}
    const ctl: ChildController = {
      killed: false,
      stdout: (c) => outCb(c),
      stderr: (c) => errCb(c),
      error: (e) => errorCb(e),
      close: (code) => closeCb(code)
    }
    const child: AgentChild = {
      onStdout: (cb) => (outCb = cb),
      onStderr: (cb) => (errCb = cb),
      onError: (cb) => (errorCb = cb),
      onClose: (cb) => (closeCb = cb),
      kill: () => {
        ctl.killed = true
      }
    }
    children.push(ctl)
    return child
  }
  return { spawn, calls, children }
}

const LISTING = JSON.stringify([
  { sessionId: 'sid-1', name: 'alpha', pid: 1 },
  { sessionId: 'sid-2', name: 'repos-a2', pid: 2 }
])
const LISTING_MAP = new Map([
  ['sid-1', 'alpha'],
  ['sid-2', 'repos-a2']
])

const ENV = { PATH: 'C:\\bin' }

function makePoller(overrides: { resolveBin?: () => string; spawn?: AgentSpawn } = {}): {
  poller: SessionNamePoller
  calls: SpawnCall[]
  children: ChildController[]
  logs: string[]
  listings: Map<string, string>[]
  resolves: number
} {
  const fake = makeFakeSpawn()
  const logs: string[] = []
  const listings: Map<string, string>[] = []
  const counter = { resolves: 0 }
  const poller = new SessionNamePoller({
    spawn: overrides.spawn ?? fake.spawn,
    resolveBin:
      overrides.resolveBin ??
      ((): string => {
        counter.resolves += 1
        return 'C:\\bin\\claude.exe'
      }),
    cwd: 'C:\\userData',
    env: ENV,
    log: (msg) => logs.push(msg)
  })
  poller.onListing((names) => listings.push(names))
  return {
    poller,
    calls: fake.calls,
    children: fake.children,
    logs,
    listings,
    get resolves() {
      return counter.resolves
    }
  }
}

/** A watched session whose first call already completed successfully. */
function watchedAndListed(): ReturnType<typeof makePoller> {
  const t = makePoller()
  t.poller.watch('s1', 'sid-1')
  vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
  t.children[0].stdout(LISTING)
  t.children[0].close(0)
  return t
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SessionNamePoller — when it calls the listing', () => {
  it('fixes the cadence the spec names: 1 s debounce, 30 s interval, 20 s timeout (SNAME-09, SNAME-10, SNAME-12)', () => {
    // Literal on purpose: every other test drives the boundaries through these
    // constants, so only a literal can catch a changed value (L-009).
    expect(NAME_DEBOUNCE_MS).toBe(1000)
    expect(NAME_INTERVAL_MS).toBe(30000)
    expect(NAME_TIMEOUT_MS).toBe(20000)
  })

  it('calls the listing once, debounced, after the first watch (SNAME-09)', () => {
    const { poller, calls } = makePoller()

    poller.watch('s1', 'sid-1')
    expect(calls).toHaveLength(0)

    vi.advanceTimersByTime(NAME_DEBOUNCE_MS - 1)
    expect(calls).toHaveLength(0)

    vi.advanceTimersByTime(1)
    expect(calls).toEqual([
      { bin: 'C:\\bin\\claude.exe', argv: ['agents', '--json'], cwd: 'C:\\userData', env: ENV }
    ])
  })

  it('shares one call between watches that land inside the debounce (SNAME-09)', () => {
    const { poller, calls } = makePoller()

    poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS / 2)
    poller.watch('s2', 'sid-2')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    expect(calls).toHaveLength(1)
  })

  it('schedules a debounced call on a nudge for a watched session (SNAME-09)', () => {
    const t = watchedAndListed()

    t.poller.nudge('s1')
    expect(t.calls).toHaveLength(1)
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    expect(t.calls).toHaveLength(2)
  })

  it('ignores a nudge for a session it does not watch (SNAME-10)', () => {
    const { poller, calls } = makePoller()

    poller.nudge('s1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    expect(calls).toHaveLength(0)
  })

  it('calls the listing every interval while a session is watched (SNAME-10)', () => {
    const t = watchedAndListed()

    vi.advanceTimersByTime(NAME_INTERVAL_MS)
    expect(t.calls).toHaveLength(2)
    t.children[1].stdout(LISTING)
    t.children[1].close(0)

    vi.advanceTimersByTime(NAME_INTERVAL_MS)
    expect(t.calls).toHaveLength(3)
  })

  it('stops the interval when the last session is unwatched (SNAME-10)', () => {
    const t = watchedAndListed()

    t.poller.unwatch('s1')
    vi.advanceTimersByTime(NAME_INTERVAL_MS * 2)

    expect(t.calls).toHaveLength(1)
  })

  it('cancels a pending debounced call when the last session is unwatched (SNAME-10)', () => {
    const { poller, calls } = makePoller()

    poller.watch('s1', 'sid-1')
    poller.unwatch('s1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS * 2)

    expect(calls).toHaveLength(0)
  })

  it('makes no call while nothing is watched (SNAME-10)', () => {
    const { calls } = makePoller()

    vi.advanceTimersByTime(NAME_INTERVAL_MS * 3)

    expect(calls).toHaveLength(0)
  })

  it('never overlaps calls: a tick during a call is coalesced into one rerun (edge case)', () => {
    const t = watchedAndListed()

    vi.advanceTimersByTime(NAME_INTERVAL_MS) // second call, left in flight
    expect(t.calls).toHaveLength(2)
    t.poller.nudge('s1')
    vi.advanceTimersByTime(NAME_INTERVAL_MS) // a tick and a nudge land during the call
    expect(t.calls).toHaveLength(2)

    t.children[1].stdout(LISTING)
    t.children[1].close(0)
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    expect(t.calls).toHaveLength(3)
  })

  it('resolves the binary once and reuses the path (design: resolver cache)', () => {
    const t = watchedAndListed()

    vi.advanceTimersByTime(NAME_INTERVAL_MS)
    t.children[1].stdout(LISTING)
    t.children[1].close(0)

    expect(t.calls).toHaveLength(2)
    expect(t.resolves).toBe(1)
  })
})

describe('SessionNamePoller — what it reports', () => {
  it('delivers the parsed map to every listener on success (SNAME-11)', () => {
    const t = makePoller()
    const second: Map<string, string>[] = []
    t.poller.onListing((names) => second.push(names))

    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    t.children[0].stdout(LISTING.slice(0, 20))
    t.children[0].stdout(LISTING.slice(20))
    t.children[0].close(0)

    expect(t.listings).toEqual([LISTING_MAP])
    expect(second).toEqual([LISTING_MAP])
    expect(t.logs).toEqual([])
  })

  it('keeps silent to listeners and logs once when the call exits non-zero (SNAME-12)', () => {
    const t = makePoller()

    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    t.children[0].stderr('boom: ' + 'x'.repeat(300))
    t.children[0].close(1)

    expect(t.listings).toEqual([])
    expect(t.logs).toHaveLength(1)
    expect(t.logs[0]).toContain('exit 1')
    expect(t.logs[0]).toContain('boom: ' + 'x'.repeat(194))
    expect(t.logs[0]).not.toContain('x'.repeat(195))
  })

  it('logs nothing for later failures in the same streak (SNAME-12)', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    t.children[0].close(1)

    vi.advanceTimersByTime(NAME_INTERVAL_MS)
    t.children[1].close(1)

    expect(t.calls).toHaveLength(2)
    expect(t.logs).toHaveLength(1)
  })

  it('logs the recovery and resumes delivering once a call succeeds again (SNAME-12)', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    t.children[0].close(1)

    vi.advanceTimersByTime(NAME_INTERVAL_MS)
    t.children[1].stdout(LISTING)
    t.children[1].close(0)

    expect(t.listings).toEqual([LISTING_MAP])
    expect(t.logs).toHaveLength(2)
    expect(t.logs[1]).toContain('recovered')
  })

  it('kills a call that outlives the timeout and counts it as a failure (SNAME-12)', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    vi.advanceTimersByTime(NAME_TIMEOUT_MS - 1)
    expect(t.children[0].killed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(t.children[0].killed).toBe(true)
    t.children[0].stdout(LISTING)
    t.children[0].close(null)

    expect(t.listings).toEqual([])
    expect(t.logs).toHaveLength(1)
    expect(t.logs[0]).toContain('timeout')
  })

  it('treats output that is not a JSON array as a failure (SNAME-12)', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    t.children[0].stdout('Usage: claude agents')
    t.children[0].close(0)

    expect(t.listings).toEqual([])
    expect(t.logs).toHaveLength(1)
    expect(t.logs[0]).toContain('not a JSON array')
  })

  it('counts a resolver that throws as a failure without spawning (SNAME-12)', () => {
    const t = makePoller({
      resolveBin: () => {
        throw new Error('agent binary not found')
      }
    })
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    expect(t.calls).toHaveLength(0)
    expect(t.listings).toEqual([])
    expect(t.logs).toHaveLength(1)
    expect(t.logs[0]).toContain('agent binary not found')
  })

  it('counts a spawn that throws as a failure and re-resolves the binary next time', () => {
    const fake = makeFakeSpawn()
    let throwOnce = true
    const spawn: AgentSpawn = (bin, argv, opts) => {
      if (throwOnce) {
        throwOnce = false
        throw new Error('spawn EACCES')
      }
      return fake.spawn(bin, argv, opts)
    }
    const t = makePoller({ spawn })
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    expect(t.logs).toHaveLength(1)
    expect(t.logs[0]).toContain('spawn EACCES')

    vi.advanceTimersByTime(NAME_INTERVAL_MS)
    expect(fake.calls).toHaveLength(1)
    expect(t.resolves).toBe(2)
  })

  it('counts a spawn error event as a failure and re-resolves the binary next time', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    t.children[0].error(new Error('spawn ENOENT'))
    t.children[0].close(-2)

    expect(t.listings).toEqual([])
    expect(t.logs).toHaveLength(1)
    expect(t.logs[0]).toContain('spawn ENOENT')

    vi.advanceTimersByTime(NAME_INTERVAL_MS)
    expect(t.calls).toHaveLength(2)
    expect(t.resolves).toBe(2)
  })

  it('kills the in-flight call on dispose and emits nothing afterwards (SNAME-14)', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    t.poller.dispose()
    expect(t.children[0].killed).toBe(true)
    t.children[0].stdout(LISTING)
    t.children[0].close(0)
    vi.advanceTimersByTime(NAME_INTERVAL_MS * 2)

    expect(t.listings).toEqual([])
    expect(t.logs).toEqual([])
    expect(t.calls).toHaveLength(1)
  })
})

describe('SessionNamePoller — reports each listing to diagnostics (PDIAG-27)', () => {
  let starts = 0
  let ends = 0

  beforeEach(() => {
    starts = 0
    ends = 0
    installDiagnostics({
      ...NOOP_DIAGNOSTICS,
      enabled: true,
      nameListingStarted: () => {
        starts++
        return () => {
          ends++
        }
      }
    })
  })
  afterEach(() => installDiagnostics(null))

  it('reports one start and one end for a listing that closes with code 0', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    expect(starts).toBe(1)
    expect(ends).toBe(0)
    t.children[0].stdout(LISTING)
    t.children[0].close(0)
    expect(starts).toBe(1)
    expect(ends).toBe(1)
  })

  it('reports one end for a listing that times out', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS + NAME_TIMEOUT_MS)
    expect(t.children[0].killed).toBe(true)
    t.children[0].close(null)
    expect(starts).toBe(1)
    expect(ends).toBe(1)
  })

  it('reports one end for a child that emits error and then close', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    t.children[0].error(new Error('spawn ENOENT'))
    t.children[0].close(-2)
    expect(starts).toBe(1)
    expect(ends).toBe(1)
  })

  it('reports no start when the spawn throws', () => {
    const t = makePoller({
      spawn: () => {
        throw new Error('spawn EACCES')
      }
    })
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    expect(t.logs[0]).toContain('spawn EACCES')
    expect(starts).toBe(0)
    expect(ends).toBe(0)
  })
})

/** Closes a child with a successful listing that names no session. */
function answerEmpty(child: ChildController): void {
  child.stdout('[]')
  child.close(0)
}

/**
 * Watches `s1` (`sid-1`) and lets `misses` listings answer `[]`, each started
 * the instant `s1` is due again (a nudge one debounce before). Returns the
 * clock at the end of the last listing.
 */
function unnamedWithMisses(
  misses: number,
  dueAfter: (k: number) => number
): ReturnType<typeof makePoller> & { lastEnd: number } {
  const t = makePoller()
  t.poller.watch('s1', 'sid-1')
  vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
  answerEmpty(t.children[0])
  let lastEnd = Date.now()
  for (let k = 1; k < misses; k++) {
    vi.advanceTimersByTime(dueAfter(k) - NAME_DEBOUNCE_MS)
    t.poller.nudge('s1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    answerEmpty(t.children[k])
    lastEnd = Date.now()
  }
  expect(t.calls).toHaveLength(misses)
  return Object.assign(t, { lastEnd })
}

/** The wait after the k-th miss, as MAGIT-18 states it: 5 s, doubling, capped at 300 s. */
const SPEC_BACKOFF_MS = [5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000]
const specDue = (k: number): number => SPEC_BACKOFF_MS[k - 1]

/** Nudges `s1` so that the debounce elapses exactly `at` ms after `from`. */
function nudgeElapsingAt(t: ReturnType<typeof makePoller>, from: number, at: number): void {
  vi.advanceTimersByTime(from + at - NAME_DEBOUNCE_MS - Date.now())
  t.poller.nudge('s1')
  vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
}

describe('SessionNamePoller — backs off for a session the listing does not name (MAGIT)', () => {
  it('fixes the backoff the spec names: 5 s base, factor 2, 300 s ceiling (MAGIT-17)', () => {
    // Literal on purpose (L-009, L-019).
    expect(NAME_BACKOFF_BASE_MS).toBe(5000)
    expect(NAME_BACKOFF_FACTOR).toBe(2)
    expect(NAME_BACKOFF_MAX_MS).toBe(300000)
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'after miss %i, a debounced nudge 1 ms before the due time starts no call, and one at the due time does (MAGIT-18, MAGIT-22, MAGIT-23, MAGIT-43)',
    (k) => {
      const early = unnamedWithMisses(k, specDue)
      nudgeElapsingAt(early, early.lastEnd, specDue(k) - 1)
      expect(early.calls).toHaveLength(k)

      const onTime = unnamedWithMisses(k, specDue)
      nudgeElapsingAt(onTime, onTime.lastEnd, specDue(k))
      expect(onTime.calls).toHaveLength(k + 1)
    }
  )

  it('resets the misses when a listing names the session (MAGIT-19)', () => {
    const t = unnamedWithMisses(3, specDue)
    nudgeElapsingAt(t, t.lastEnd, specDue(3))
    t.children[3].stdout(LISTING)
    t.children[3].close(0)

    t.poller.nudge('s1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    expect(t.calls).toHaveLength(5)
  })

  type Failure = 'exit 1' | 'timeout' | 'not a JSON array' | 'resolver throws' | 'spawn throws'

  /** A poller whose next call can be made to fail each way SNAME-12 lists. */
  function failingPoller(): ReturnType<typeof makePoller> & {
    attempts: () => number
    failNext: (failure: Failure) => void
    complete: (child: ChildController) => void
  } {
    const fake = makeFakeSpawn()
    let pending: Failure | null = null
    let attempts = 0
    const t = makePoller({
      resolveBin: () => {
        if (pending === 'resolver throws') {
          pending = null
          attempts++
          throw new Error('agent binary not found')
        }
        return 'C:\\bin\\claude.exe'
      },
      spawn: (bin, argv, opts) => {
        attempts++
        if (pending === 'spawn throws') {
          pending = null
          throw new Error('spawn EACCES')
        }
        return fake.spawn(bin, argv, opts)
      }
    })
    const complete = (child: ChildController): void => {
      const failure = pending
      pending = null
      if (failure === 'exit 1') child.close(1)
      if (failure === 'timeout') {
        vi.advanceTimersByTime(NAME_TIMEOUT_MS)
        child.close(null)
      }
      if (failure === 'not a JSON array') {
        child.stdout('Usage: claude agents')
        child.close(0)
      }
    }
    return Object.assign(t, {
      children: fake.children,
      attempts: () => attempts,
      failNext: (failure: Failure) => (pending = failure),
      complete
    })
  }

  const FAILURES: Failure[] = [
    'exit 1',
    'timeout',
    'not a JSON array',
    'resolver throws',
    'spawn throws'
  ]

  it.each(FAILURES)(
    'counts a failed listing (%s) as a miss for an unnamed session (MAGIT-20)',
    (failure) => {
      const t = failingPoller()
      t.failNext(failure)
      t.poller.watch('s1', 'sid-1')
      vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
      if (t.children.length > 0) t.complete(t.children[0])
      expect(t.attempts()).toBe(1)

      t.poller.nudge('s1') // its debounce elapses 1 s after the failure, before 5 s
      vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

      expect(t.attempts()).toBe(1)
    }
  )

  it.each(FAILURES)(
    'leaves a named session callable after a failed listing (%s) (MAGIT-20)',
    (failure) => {
      const t = failingPoller()
      t.poller.watch('s1', 'sid-1')
      vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
      t.children[0].stdout(LISTING)
      t.children[0].close(0)
      if (failure === 'resolver throws') {
        // The resolved binary is cached after a success; only a failed spawn
        // clears it, so the resolver runs (and can throw) again.
        t.failNext('spawn throws')
        t.poller.nudge('s1')
        vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
      }
      const before = t.attempts()

      t.failNext(failure)
      t.poller.nudge('s1')
      vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
      t.complete(t.children[t.children.length - 1])
      expect(t.attempts()).toBe(before + 1)

      t.poller.nudge('s1')
      vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

      expect(t.attempts()).toBe(before + 2)
    }
  )

  it('resets the misses when watch brings a new Claude id (MAGIT-21, MAGIT-45)', () => {
    const t = unnamedWithMisses(3, specDue)

    t.poller.watch('s1', 'sid-1-cleared')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS - 1)
    expect(t.calls).toHaveLength(3)
    vi.advanceTimersByTime(1)

    expect(t.calls).toHaveLength(4)
  })

  it('keeps the misses when watch repeats the same Claude id (MAGIT-21)', () => {
    const t = unnamedWithMisses(3, specDue)

    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    expect(t.calls).toHaveLength(3)
  })

  it.each([
    [4999, 2],
    [5000, 3]
  ])(
    'a named session missing from a successful listing is due 5 s after it: a debounce elapsing at %i ms gives %i calls (MAGIT-44)',
    (at, calls) => {
      const t = watchedAndListed()
      t.poller.nudge('s1')
      vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
      answerEmpty(t.children[1])
      const end = Date.now()

      nudgeElapsingAt(t, end, at)

      expect(t.calls).toHaveLength(calls)
    }
  )

  it('drops the misses on unwatch, so a later watch starts from zero (MAGIT-27)', () => {
    const t = unnamedWithMisses(3, specDue)

    t.poller.unwatch('s1')
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)

    expect(t.calls).toHaveLength(4)
  })
})

describe('SessionNamePoller — the tick and the rerun follow the backoff (MAGIT)', () => {
  it('skips a tick while the only session backs off, and lists on the first tick after it is due (MAGIT-24)', () => {
    const t0 = Date.now()
    const t = unnamedWithMisses(3, specDue) // listings at 1 s, 6 s, 16 s; due at 36 s

    vi.advanceTimersByTime(t0 + 30000 - Date.now())
    expect(t.calls).toHaveLength(3)
    vi.advanceTimersByTime(29999)
    expect(t.calls).toHaveLength(3)
    vi.advanceTimersByTime(1)

    expect(t.calls).toHaveLength(4)
  })

  it('lists on every tick while a named session is watched next to a backing-off one (MAGIT-24, MAGIT-26)', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    t.poller.watch('s2', 'sid-never')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    t.children[0].stdout(LISTING)
    t.children[0].close(0)

    for (let tick = 1; tick <= 10; tick++) {
      vi.advanceTimersByTime(tick === 1 ? NAME_INTERVAL_MS - NAME_DEBOUNCE_MS : NAME_INTERVAL_MS)
      expect(t.calls).toHaveLength(1 + tick)
      t.children[tick].stdout(LISTING)
      t.children[tick].close(0)
    }

    expect(t.calls).toHaveLength(11)
  })

  it('drops the rerun a nudge asked for when the call it waited on misses the session (MAGIT-25)', () => {
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS) // call in flight
    vi.advanceTimersByTime(100)
    t.poller.nudge('s1')
    answerEmpty(t.children[0])

    vi.advanceTimersByTime(4999)

    expect(t.calls).toHaveLength(1)
  })

  it('drops a tick coalesced during a call when only a backing-off session is watched (MAGIT-25)', () => {
    const t0 = Date.now()
    const t = makePoller()
    t.poller.watch('s1', 'sid-1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    answerEmpty(t.children[0]) // due at 6 s
    vi.advanceTimersByTime(t0 + 28500 - Date.now())
    t.poller.nudge('s1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS) // second call at 29.5 s, in flight over the 30 s tick
    expect(t.calls).toHaveLength(2)
    vi.advanceTimersByTime(1000)
    answerEmpty(t.children[1]) // at 30.5 s: due at 40.5 s

    vi.advanceTimersByTime(9999)

    expect(t.calls).toHaveLength(2)
  })

  it('reruns once for a tick coalesced during a call when a named session is watched (MAGIT-25)', () => {
    const t0 = Date.now()
    const t = watchedAndListed()
    vi.advanceTimersByTime(t0 + 28500 - Date.now())
    t.poller.nudge('s1')
    vi.advanceTimersByTime(NAME_DEBOUNCE_MS) // call at 29.5 s, in flight over the 30 s tick
    expect(t.calls).toHaveLength(2)
    vi.advanceTimersByTime(1000)
    t.children[1].stdout(LISTING)
    t.children[1].close(0)

    vi.advanceTimersByTime(NAME_DEBOUNCE_MS)
    expect(t.calls).toHaveLength(3)
    t.children[2].stdout(LISTING)
    t.children[2].close(0)
    vi.advanceTimersByTime(t0 + 59999 - Date.now())

    expect(t.calls).toHaveLength(3)
  })

  it('lists a never-named session nudged every second at 1, 6, 16, 36, 76, 156 and 316 s only (MAGIT-28)', () => {
    const t0 = Date.now()
    const t = makePoller()
    const startedAt: number[] = []
    t.poller.watch('s1', 'sid-1')

    for (let second = 1; second <= 600; second++) {
      vi.advanceTimersByTime(1000)
      while (startedAt.length < t.calls.length) {
        startedAt.push(Date.now() - t0)
        answerEmpty(t.children[startedAt.length - 1])
      }
      t.poller.nudge('s1')
    }

    expect(startedAt).toEqual([1000, 6000, 16000, 36000, 76000, 156000, 316000])
  })

  it('starts no call after dispose while a session backs off (MAGIT-46)', () => {
    const t = unnamedWithMisses(1, specDue)

    t.poller.dispose()
    for (let second = 1; second <= 600; second++) {
      t.poller.nudge('s1')
      vi.advanceTimersByTime(1000)
    }

    expect(t.calls).toHaveLength(1)
  })
})
