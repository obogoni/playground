import { describe, expect, it } from 'vitest'
import {
  RECOUNT_MAX_WAIT_MS,
  RECOUNT_MIN_INTERVAL_MS,
  RECOUNT_QUIET_MS,
  RecountScheduler,
  type WorktreeCount
} from './recount-scheduler'

const A = 'C:\\work\\repo'
const B = 'C:\\work\\repo-feature'
const COUNT: WorktreeCount = { dirty: true, changes: 1 }

interface Run {
  path: string
  /** The fake clock when the runner was called. */
  at: number
  resolve(count: WorktreeCount | null): void
  reject(err: Error): void
}

/**
 * A fake clock, a scheduler whose timers fire in time order as the test
 * advances it, and a runner that records every call. By default the runner
 * answers `COUNT` at once; `deferred` leaves each run open until the test
 * settles it. No real timers, no git.
 */
function harness(opts: { deferred?: boolean; startAt?: number } = {}): {
  scheduler: RecountScheduler
  runs: Run[]
  recounted: Array<[string, WorktreeCount]>
  now(): number
  startsOf(path: string): number[]
  advanceTo(target: number): Promise<void>
} {
  let t = opts.startAt ?? 0
  let seq = 0
  let timers: Array<{ at: number; seq: number; fn: () => void }> = []
  const runs: Run[] = []
  const recounted: Array<[string, WorktreeCount]> = []
  const settle = (): Promise<void> => new Promise((r) => setImmediate(r))
  const scheduler = new RecountScheduler({
    now: () => t,
    schedule: {
      after: (ms, fn) => {
        const timer = { at: t + ms, seq: seq++, fn }
        timers.push(timer)
        return () => {
          timers = timers.filter((x) => x !== timer)
        }
      }
    },
    recount: (path) =>
      new Promise<WorktreeCount | null>((resolve, reject) => {
        runs.push({ path, at: t, resolve, reject })
        if (!opts.deferred) resolve(COUNT)
      }),
    onRecounted: (path, count) => recounted.push([path, count])
  })
  return {
    scheduler,
    runs,
    recounted,
    now: () => t,
    startsOf: (path) => runs.filter((r) => r.path === path).map((r) => r.at),
    advanceTo: async (target) => {
      for (;;) {
        const next = timers
          .filter((x) => x.at <= target)
          .sort((a, b) => a.at - b.at || a.seq - b.seq)[0]
        if (!next) break
        timers = timers.filter((x) => x !== next)
        t = next.at
        next.fn()
        await settle()
      }
      t = target
      await settle()
    }
  }
}

describe('RecountScheduler timing', () => {
  it('waits 250 ms of quiet, 1,000 ms at most, and starts 1,000 ms apart (RCNT-02/03/04)', () => {
    // The spec's values, as numbers: a change to a constant must show here.
    expect(RECOUNT_QUIET_MS).toBe(250)
    expect(RECOUNT_MAX_WAIT_MS).toBe(1000)
    expect(RECOUNT_MIN_INTERVAL_MS).toBe(1000)
  })

  it('starts one recount 250 ms after a lone event, not before (RCNT-02)', async () => {
    const h = harness()

    h.scheduler.notify(A)
    await h.advanceTo(249)
    expect(h.runs).toEqual([])

    await h.advanceTo(250)
    expect(h.startsOf(A)).toEqual([250])
  })

  it('starts one recount 250 ms after the last event of a burst (RCNT-02)', async () => {
    const h = harness()

    for (const at of [0, 100, 200]) {
      await h.advanceTo(at)
      h.scheduler.notify(A)
    }
    await h.advanceTo(449)
    expect(h.runs).toEqual([])
    await h.advanceTo(450)
    expect(h.startsOf(A)).toEqual([450])

    await h.advanceTo(3000)
    expect(h.startsOf(A)).toEqual([450])
  })

  it('starts 1,000 ms after the first event while events keep coming (RCNT-03, RCNT-07)', async () => {
    const h = harness()

    for (let at = 0; at <= 900; at += 100) {
      await h.advanceTo(at)
      h.scheduler.notify(A)
    }
    await h.advanceTo(999)
    expect(h.runs).toEqual([])
    // Maximum wait from the first event, ahead of the 1,150 ms quiet time.
    await h.advanceTo(1000)
    expect(h.startsOf(A)).toEqual([1000])

    await h.advanceTo(3000)
    expect(h.startsOf(A)).toEqual([1000])
  })

  it('starts the next recount exactly 1,000 ms after the previous start (RCNT-04, RCNT-37)', async () => {
    const h = harness()
    h.scheduler.notify(A)
    await h.advanceTo(250)
    expect(h.startsOf(A)).toEqual([250])

    await h.advanceTo(300)
    h.scheduler.notify(A)
    // Not at 550 ms, when the quiet period alone would allow it.
    await h.advanceTo(1249)
    expect(h.startsOf(A)).toEqual([250])
    await h.advanceTo(1250)
    expect(h.startsOf(A)).toEqual([250, 1250])
  })

  it('keeps each worktree on its own schedule (RCNT-08)', async () => {
    const h = harness()

    for (let at = 0; at <= 900; at += 100) {
      await h.advanceTo(at)
      h.scheduler.notify(A)
      if (at === 0) {
        await h.advanceTo(50)
        h.scheduler.notify(B)
      }
    }
    await h.advanceTo(3000)

    expect(h.startsOf(B)).toEqual([300])
    // The same start A gets with no B at all.
    expect(h.startsOf(A)).toEqual([1000])
  })

  it('reports a recount that served an event once, with its count (RCNT-09)', async () => {
    const h = harness()

    h.scheduler.notify(A)
    await h.advanceTo(250)

    expect(h.recounted).toEqual([[A, { dirty: true, changes: 1 }]])
  })

  it('starts nothing after stop, and emits nothing for a run in flight (RCNT-12)', async () => {
    const h = harness({ deferred: true })
    h.scheduler.notify(A)
    await h.advanceTo(250)
    expect(h.startsOf(A)).toEqual([250])
    h.scheduler.notify(B)

    h.scheduler.stop()
    await h.advanceTo(2250)
    expect(h.runs.map((r) => r.path)).toEqual([A])

    h.scheduler.notify(B)
    await h.advanceTo(4250)
    expect(h.runs.map((r) => r.path)).toEqual([A])

    h.runs[0].resolve(COUNT)
    await h.advanceTo(4300)
    expect(h.recounted).toEqual([])
  })
})
