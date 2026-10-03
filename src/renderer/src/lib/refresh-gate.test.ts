import { describe, expect, it } from 'vitest'
import type { FilesChanged } from '../../../shared/files'
import { createRefreshGate, mergeBatches, type RefreshGate } from './refresh-gate'

/** A promise the test settles by hand, so a run can be held open. */
interface Deferred {
  promise: Promise<void>
  resolve: () => void
  reject: (err: unknown) => void
}

function deferred(): Deferred {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Lets every settled promise's callbacks run, and the gate's release with them. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * A gate over string jobs whose runs the test holds open: `runs` records each
 * job `run` received, `held[i]` settles the i-th run. Jobs merge by joining
 * with `+`, so the merged job is visible in what `run` received.
 */
function harness(throwOn?: string): {
  gate: RefreshGate<string>
  runs: string[]
  held: Deferred[]
  logged: unknown[]
} {
  const runs: string[] = []
  const held: Deferred[] = []
  const logged: unknown[] = []
  const gate = createRefreshGate<string>(
    (job) => {
      runs.push(job)
      if (job === throwOn) throw new Error('run threw')
      const d = deferred()
      held.push(d)
      return d.promise
    },
    (waiting, next) => `${waiting}+${next}`,
    (...args) => logged.push(args)
  )
  return { gate, runs, held, logged }
}

function batch(paths: string[], gitStateChanged = false, worktreePath = 'C:/wt/a'): FilesChanged {
  return { worktreePath, paths, gitStateChanged }
}

describe('createRefreshGate', () => {
  it('runs a request at once, and once, when nothing is running (FWIG-18)', () => {
    const { gate, runs } = harness()

    gate.request('a')

    // Synchronously: no await between the request and this line.
    expect(runs).toEqual(['a'])
  })

  it('starts nothing while a run is held, then exactly one merged run after it settles (FWIG-19, 20)', async () => {
    const { gate, runs, held } = harness()
    gate.request('a')

    gate.request('b')
    gate.request('c')
    gate.request('d')
    await settle()
    expect(runs).toEqual(['a'])

    held[0].resolve()
    await settle()
    expect(runs).toEqual(['a', 'b+c+d'])

    held[1].resolve()
    await settle()
    expect(runs).toEqual(['a', 'b+c+d'])
  })

  it('starts the waiting run after a run that rejects (FWIG-21)', async () => {
    const { gate, runs, held } = harness()
    gate.request('a')
    gate.request('b')

    held[0].reject(new Error('read failed'))
    await settle()

    expect(runs).toEqual(['a', 'b'])
  })

  it('starts the waiting run after a run that throws synchronously (FWIG-21)', async () => {
    const { gate, runs, held } = harness('a')

    expect(() => gate.request('a')).not.toThrow()
    gate.request('b')
    await settle()
    expect(runs).toEqual(['a', 'b'])

    // The gate is running `b` now, not left idle or stuck.
    gate.request('c')
    await settle()
    expect(runs).toEqual(['a', 'b'])
    held[0].resolve()
    await settle()
    expect(runs).toEqual(['a', 'b', 'c'])
  })

  it('counts a run as running until its promise settles, not when run returns (FWIG-21)', async () => {
    const { gate, runs, held } = harness()
    gate.request('a')
    await settle()
    await settle()

    gate.request('b')
    await settle()
    expect(runs).toEqual(['a'])

    held[0].resolve()
    await settle()
    expect(runs).toEqual(['a', 'b'])
  })

  it('holds a request made during the trailing run until it settles: a third run, not a second overlap', async () => {
    const { gate, runs, held } = harness()
    gate.request('a')
    gate.request('b')
    held[0].resolve()
    await settle()
    expect(runs).toEqual(['a', 'b'])

    gate.request('c')
    await settle()
    expect(runs).toEqual(['a', 'b'])

    held[1].resolve()
    await settle()
    expect(runs).toEqual(['a', 'b', 'c'])
  })

  it('leaves no trailing run when the waiting job is dropped during a run (FWIG-23)', async () => {
    const { gate, runs, held } = harness()
    gate.request('a')
    gate.request('b')

    gate.dropWaiting()
    held[0].resolve()
    await settle()
    expect(runs).toEqual(['a'])

    // Idle again: the next request runs at once.
    gate.request('c')
    expect(runs).toEqual(['a', 'c'])
  })
})

describe('mergeBatches', () => {
  it('keeps the paths in first-seen order without duplicates (FWIG-20)', () => {
    const merged = mergeBatches(batch(['src/a.ts', 'src/b.ts']), batch(['src/c.ts', 'src/a.ts']))

    expect(merged.paths).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
  })

  it('carries a git-state change when the first batch had one (FWIG-20)', () => {
    expect(mergeBatches(batch([], true), batch([], false)).gitStateChanged).toBe(true)
  })

  it('carries a git-state change when the second batch had one (FWIG-20)', () => {
    expect(mergeBatches(batch([], false), batch([], true)).gitStateChanged).toBe(true)
  })

  it('carries none when neither batch had one', () => {
    expect(mergeBatches(batch([], false), batch([], false)).gitStateChanged).toBe(false)
  })

  it("takes the second batch's worktree", () => {
    const merged = mergeBatches(batch(['a'], false, 'C:/wt/a'), batch(['b'], false, 'C:/wt/b'))

    expect(merged).toEqual({ worktreePath: 'C:/wt/b', paths: ['a', 'b'], gitStateChanged: false })
  })
})
