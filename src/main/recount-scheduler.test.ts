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
  it('waits 250 ms of quiet, 1,000 ms at most, and 1,000 ms after the previous end (RCNT-02/03/04)', () => {
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

  it('starts the next recount exactly 1,000 ms after the previous one ended (RCNT-04, RCNT-37)', async () => {
    const h = harness()
    h.scheduler.notify(A)
    // The runner answers at once: this run starts and ends at 250 ms.
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

describe('RecountScheduler single flight', () => {
  /** Events every 100 ms from `from` to `to`, inclusive. */
  async function eventsEvery100(
    h: ReturnType<typeof harness>,
    path: string,
    from: number,
    to: number
  ): Promise<void> {
    for (let at = from; at <= to; at += 100) {
      await h.advanceTo(at)
      h.scheduler.notify(path)
    }
  }

  it('starts no second recount of a worktree while one runs (RCNT-05)', async () => {
    const h = harness({ deferred: true, startAt: -250 })
    h.scheduler.notify(A)
    await h.advanceTo(0)
    expect(h.startsOf(A)).toEqual([0])

    await eventsEvery100(h, A, 100, 2900)
    await h.advanceTo(3000)

    expect(h.startsOf(A)).toEqual([0])
  })

  it('runs exactly one trailing recount, 1,000 ms after an overdue run ends (RCNT-06, RCNT-04)', async () => {
    const h = harness({ deferred: true, startAt: -250 })
    h.scheduler.notify(A)
    await h.advanceTo(0)
    await eventsEvery100(h, A, 100, 2900)
    await h.advanceTo(3000)

    // Settled at 3,000 ms: the trailing run waits for the spacing from that end.
    h.runs[0].resolve(COUNT)
    await h.advanceTo(3000)
    expect(h.startsOf(A)).toEqual([0])
    await h.advanceTo(3999)
    expect(h.startsOf(A)).toEqual([0])
    await h.advanceTo(4000)
    expect(h.startsOf(A)).toEqual([0, 4000])

    await h.advanceTo(4500)
    h.runs[1].resolve(COUNT)
    await h.advanceTo(4500)
    await h.advanceTo(8000)
    expect(h.startsOf(A)).toEqual([0, 4000])
    // One report per run: each served events.
    expect(h.recounted).toEqual([
      [A, COUNT],
      [A, COUNT]
    ])
  })

  it('spaces a trailing recount from the end of the run before it (RCNT-04, RCNT-06)', async () => {
    const h = harness({ deferred: true, startAt: -250 })
    h.scheduler.notify(A)
    await h.advanceTo(0)

    for (const at of [400, 450]) {
      await h.advanceTo(at)
      h.scheduler.notify(A)
    }
    await h.advanceTo(500)
    h.runs[0].resolve(COUNT)
    await h.advanceTo(500)

    // Not at 700 ms (the quiet period after 450), nor at 1,000 ms (1,000 after the start).
    await h.advanceTo(1499)
    expect(h.startsOf(A)).toEqual([0])
    await h.advanceTo(1500)
    expect(h.startsOf(A)).toEqual([0, 1500])
  })

  it('spaces the next recount from the end, not the start, of a slow run (RCNT-04)', async () => {
    // The T11 bench case in miniature: a run that waited for its git process.
    const h = harness({ deferred: true, startAt: -250 })
    h.scheduler.notify(A)
    await h.advanceTo(0)
    await h.advanceTo(600)
    h.runs[0].resolve(COUNT)
    await h.advanceTo(600)

    for (const at of [700, 800]) {
      await h.advanceTo(at)
      h.scheduler.notify(A)
    }
    await h.advanceTo(1000)
    expect(h.startsOf(A)).toEqual([0])
    await h.advanceTo(1599)
    expect(h.startsOf(A)).toEqual([0])
    await h.advanceTo(1600)
    expect(h.startsOf(A)).toEqual([0, 1600])
  })

  it('starts a request made exactly 1,000 ms after the previous end at that instant (RCNT-37)', async () => {
    const h = harness({ deferred: true })
    void h.scheduler.request(A)
    void h.scheduler.request(B)
    await h.advanceTo(300)
    h.runs[0].resolve(COUNT)
    h.runs[1].resolve(COUNT)
    await h.advanceTo(300)

    // A at 1,299 ms waits one millisecond; B at exactly 1,300 ms does not wait.
    await h.advanceTo(1299)
    void h.scheduler.request(A)
    expect(h.startsOf(A)).toEqual([0])
    await h.advanceTo(1300)
    expect(h.startsOf(A)).toEqual([0, 1300])
    void h.scheduler.request(B)
    expect(h.startsOf(B)).toEqual([0, 1300])
  })

  it('spaces the next recount from the end of a run that answered null or threw (RCNT-04, RCNT-10)', async () => {
    const h = harness({ deferred: true, startAt: -250 })
    h.scheduler.notify(A)
    h.scheduler.notify(B)
    await h.advanceTo(0)
    expect(h.runs.map((r) => [r.path, r.at])).toEqual([
      [A, 0],
      [B, 0]
    ])
    await h.advanceTo(600)
    h.runs[0].reject(new Error('fatal: not a git repository'))
    h.runs[1].resolve(null)
    await h.advanceTo(600)

    await h.advanceTo(700)
    h.scheduler.notify(A)
    h.scheduler.notify(B)
    await h.advanceTo(1599)
    expect(h.startsOf(A)).toEqual([0])
    expect(h.startsOf(B)).toEqual([0])
    await h.advanceTo(1600)
    expect(h.startsOf(A)).toEqual([0, 1600])
    expect(h.startsOf(B)).toEqual([0, 1600])
  })

  it('runs nothing after a recount that saw no event (RCNT-06)', async () => {
    const h = harness({ deferred: true, startAt: -250 })
    h.scheduler.notify(A)
    await h.advanceTo(0)

    await h.advanceTo(500)
    h.runs[0].resolve(COUNT)
    await h.advanceTo(500)
    await h.advanceTo(5000)

    expect(h.startsOf(A)).toEqual([0])
  })

  it('reports nothing for a recount with no count, and runs the next one as usual (RCNT-10)', async () => {
    const h = harness({ deferred: true })
    h.scheduler.notify(A)
    await h.advanceTo(250)
    h.runs[0].resolve(null)
    await h.advanceTo(250)
    await h.advanceTo(260)
    expect(h.recounted).toEqual([])

    await h.advanceTo(300)
    h.scheduler.notify(A)
    await h.advanceTo(1250)
    expect(h.startsOf(A)).toEqual([250, 1250])
    h.runs[1].resolve({ dirty: false, changes: 0 })
    await h.advanceTo(1260)
    expect(h.recounted).toEqual([[A, { dirty: false, changes: 0 }]])
  })

  it('treats a runner that throws as no count, and throws nothing (RCNT-10)', async () => {
    const h = harness({ deferred: true })
    h.scheduler.notify(A)
    await h.advanceTo(250)
    h.runs[0].reject(new Error('fatal: not a git repository'))
    await h.advanceTo(250)
    await h.advanceTo(260)
    expect(h.recounted).toEqual([])

    await h.advanceTo(300)
    h.scheduler.notify(A)
    await h.advanceTo(1250)
    expect(h.startsOf(A)).toEqual([250, 1250])
    h.runs[1].resolve(COUNT)
    await h.advanceTo(1260)
    expect(h.recounted).toEqual([[A, COUNT]])
  })

  it('cancels a waiting recount on forget (RCNT-11)', async () => {
    const h = harness()
    h.scheduler.notify(A)
    await h.advanceTo(100)

    h.scheduler.forget(A)
    await h.advanceTo(3000)

    expect(h.runs).toEqual([])
    expect(h.recounted).toEqual([])
  })

  it('lets a running recount finish on forget, with no trailing run (RCNT-11)', async () => {
    const h = harness({ deferred: true })
    h.scheduler.notify(A)
    await h.advanceTo(250)
    for (const at of [300, 400]) {
      await h.advanceTo(at)
      h.scheduler.notify(A)
    }

    h.scheduler.forget(A)
    await h.advanceTo(500)
    h.runs[0].resolve(COUNT)
    // Settle at 500, so a wrong trailing run would be due at 1,500, inside the window.
    await h.advanceTo(500)
    await h.advanceTo(5000)

    expect(h.startsOf(A)).toEqual([250])
  })
})

describe('RecountScheduler requests', () => {
  /** Records a request's answer as it lands; `pending` until then. */
  function track(p: Promise<WorktreeCount | null>): { value: WorktreeCount | null | 'pending' } {
    const box: { value: WorktreeCount | null | 'pending' } = { value: 'pending' }
    void p.then((v) => {
      box.value = v
    })
    return box
  }

  it('starts a requested recount at once and answers with its count (RCNT-13)', async () => {
    const h = harness({ deferred: true })
    await h.advanceTo(100)

    const answer = track(h.scheduler.request(A))
    expect(h.startsOf(A)).toEqual([100])

    h.runs[0].resolve({ dirty: true, changes: 3 })
    await h.advanceTo(100)
    expect(answer.value).toEqual({ dirty: true, changes: 3 })
  })

  it('starts requests on five idle worktrees together, with no pool of its own', async () => {
    const h = harness({ deferred: true })
    const paths = [1, 2, 3, 4, 5].map((i) => `C:\\work\\repo-${i}`)

    for (const path of paths) void h.scheduler.request(path)

    expect(h.runs.map((r) => [r.path, r.at])).toEqual(paths.map((p) => [p, 0]))
  })

  it('spaces a request from the previous end (RCNT-04)', async () => {
    const h = harness({ deferred: true })
    void h.scheduler.request(A)
    await h.advanceTo(100)
    h.runs[0].resolve(COUNT)
    await h.advanceTo(100)

    await h.advanceTo(200)
    const answer = track(h.scheduler.request(A))
    // Not at 1,000 ms, 1,000 after the start.
    await h.advanceTo(1099)
    expect(h.startsOf(A)).toEqual([0])
    await h.advanceTo(1100)
    expect(h.startsOf(A)).toEqual([0, 1100])

    h.runs[1].resolve(COUNT)
    await h.advanceTo(1100)
    expect(answer.value).toEqual(COUNT)
  })

  it('answers a request made during a run with the run after it (RCNT-14, RCNT-38)', async () => {
    const h = harness({ deferred: true })
    const first = track(h.scheduler.request(A))
    await h.advanceTo(100)
    const second = track(h.scheduler.request(A))

    // Past the spacing, the run still in flight holds the next one back (RCNT-05).
    await h.advanceTo(1500)
    expect(h.startsOf(A)).toEqual([0])
    h.runs[0].resolve({ dirty: true, changes: 1 })
    await h.advanceTo(1500)
    expect(first.value).toEqual({ dirty: true, changes: 1 })
    expect(second.value).toBe('pending')
    // The trailing run keeps the spacing from that end.
    await h.advanceTo(2499)
    expect(h.startsOf(A)).toEqual([0])
    await h.advanceTo(2500)
    expect(h.startsOf(A)).toEqual([0, 2500])

    h.runs[1].resolve({ dirty: true, changes: 2 })
    await h.advanceTo(2500)
    expect(second.value).toEqual({ dirty: true, changes: 2 })
  })

  it('serves a request and a waiting burst with one recount (RCNT-15)', async () => {
    const h = harness()
    h.scheduler.notify(A)
    await h.advanceTo(100)

    const answer = track(h.scheduler.request(A))
    await h.advanceTo(100)
    expect(h.startsOf(A)).toEqual([100])
    expect(answer.value).toEqual(COUNT)
    expect(h.recounted).toEqual([[A, COUNT]])

    await h.advanceTo(3000)
    expect(h.startsOf(A)).toEqual([100])
    expect(h.recounted).toEqual([[A, COUNT]])
  })

  it('reports nothing for a recount that served only a request (RCNT-09)', async () => {
    const h = harness()

    const answer = track(h.scheduler.request(A))
    await h.advanceTo(3000)

    expect(answer.value).toEqual(COUNT)
    expect(h.recounted).toEqual([])
  })

  it('still answers a waiting request after forget (RCNT-41)', async () => {
    const h = harness({ deferred: true })
    void h.scheduler.request(A)
    await h.advanceTo(100)
    h.runs[0].resolve(COUNT)
    await h.advanceTo(100)
    await h.advanceTo(150)
    h.scheduler.notify(A)
    await h.advanceTo(200)
    const answer = track(h.scheduler.request(A))

    await h.advanceTo(300)
    h.scheduler.forget(A)
    await h.advanceTo(1099)
    expect(h.startsOf(A)).toEqual([0])
    await h.advanceTo(1100)
    expect(h.startsOf(A)).toEqual([0, 1100])
    h.runs[1].resolve({ dirty: false, changes: 0 })
    await h.advanceTo(1100)

    expect(answer.value).toEqual({ dirty: false, changes: 0 })
    // The burst went with forget: the run served the request alone.
    expect(h.recounted).toEqual([])
  })

  it('answers waiting and later requests with null after stop, starting nothing (RCNT-12)', async () => {
    const h = harness({ deferred: true })
    void h.scheduler.request(A)
    await h.advanceTo(100)
    h.runs[0].resolve(COUNT)
    await h.advanceTo(200)
    const waiting = track(h.scheduler.request(A))

    h.scheduler.stop()
    await h.advanceTo(200)
    expect(waiting.value).toBeNull()

    const later = track(h.scheduler.request(B))
    await h.advanceTo(3000)
    expect(later.value).toBeNull()
    expect(h.runs.map((r) => r.path)).toEqual([A])
  })

  it('answers a request a running recount took at stop with that recount, emitting nothing (RCNT-12)', async () => {
    const h = harness({ deferred: true })
    h.scheduler.notify(A)
    await h.advanceTo(100)
    const taken = track(h.scheduler.request(A))
    await h.advanceTo(100)
    expect(h.startsOf(A)).toEqual([100])

    h.scheduler.stop()
    await h.advanceTo(150)
    expect(taken.value).toBe('pending')

    h.runs[0].resolve({ dirty: true, changes: 7 })
    await h.advanceTo(150)
    expect(taken.value).toEqual({ dirty: true, changes: 7 })
    // The run served an event, but nothing is emitted after quit.
    expect(h.recounted).toEqual([])
  })
})
