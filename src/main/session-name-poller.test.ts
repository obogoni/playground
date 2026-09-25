import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentChild, AgentSpawn } from './agent-step-runner'
import {
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
