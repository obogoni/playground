import { describe, expect, it } from 'vitest'
import { BATCH_MS, type WatchHandle, type WatchPort } from './file-watcher'
import { GitStateWatcher } from './git-state-watcher'

const A = 'C:\\work\\repo'
const B = 'C:\\work\\repo-feature'
const GIT_DIRS: Record<string, string> = {
  [A]: 'C:\\work\\repo\\.git',
  [B]: 'C:\\work\\repo\\.git\\worktrees\\repo-feature'
}

interface FakeHandle extends WatchHandle {
  path: string
  recursive: boolean
  closed: boolean
  fire(name: string): void
}

/**
 * A watch port recording every handle, a git-dir resolver the test can hold
 * open or fail, and a scheduler whose pending callbacks the test fires by hand.
 * No real `fs.watch`, no timers.
 */
function harness(opts: { failing?: string[] } = {}): {
  watcher: GitStateWatcher
  handles: FakeHandle[]
  settled: string[]
  delays: number[]
  flush(): void
  open(): FakeHandle[]
  /** Holds the next resolves until `release` runs, to race `sync` against them. */
  hold(): { release(): void }
} {
  const handles: FakeHandle[] = []
  const watch: WatchPort = (path, watchOpts, listener) => {
    const handle: FakeHandle = {
      path,
      recursive: watchOpts.recursive,
      closed: false,
      fire: listener,
      close: () => {
        handle.closed = true
      }
    }
    handles.push(handle)
    return handle
  }
  const settled: string[] = []
  const delays: number[] = []
  let pending: Array<() => void> = []
  let gate: Promise<void> | null = null
  return {
    watcher: new GitStateWatcher({
      watch,
      resolveGitDir: async (path) => {
        if (gate) await gate
        if (opts.failing?.includes(path)) throw new Error('fatal: not a git repository')
        return GIT_DIRS[path]
      },
      schedule: {
        after: (ms, fn) => {
          delays.push(ms)
          pending.push(fn)
          return () => {
            pending = pending.filter((p) => p !== fn)
          }
        }
      },
      onSettled: (path) => settled.push(path)
    }),
    handles,
    settled,
    delays,
    flush: () => {
      const due = pending
      pending = []
      for (const fn of due) fn()
    },
    open: () => handles.filter((h) => !h.closed),
    hold: () => {
      let release = (): void => {}
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = null
          resolve()
        }
      })
      return { release }
    }
  }
}

const handleOf = (handles: FakeHandle[], worktree: string): FakeHandle =>
  handles.filter((h) => h.path === GIT_DIRS[worktree] && !h.closed).at(-1) as FakeHandle

describe('GitStateWatcher', () => {
  it('watches each worktree git dir non-recursively (SCRF-01)', async () => {
    const h = harness()

    await h.watcher.sync([A, B])

    expect(h.open().map((x) => [x.path, x.recursive])).toEqual([
      [GIT_DIRS[A], false],
      [GIT_DIRS[B], false]
    ])
  })

  it('settles an index change once, after the batch window (SCRF-01)', async () => {
    const h = harness()
    await h.watcher.sync([A])

    handleOf(h.handles, A).fire('index')

    expect(h.settled).toEqual([])
    expect(h.delays).toEqual([BATCH_MS])
    h.flush()
    expect(h.settled).toEqual([A])
  })

  it('settles a HEAD change too (SCRF-01)', async () => {
    const h = harness()
    await h.watcher.sync([A])

    handleOf(h.handles, A).fire('HEAD')
    h.flush()

    expect(h.settled).toEqual([A])
  })

  it('settles a burst of changes once (SCRF-02)', async () => {
    const h = harness()
    await h.watcher.sync([A])
    const handle = handleOf(h.handles, A)

    handle.fire('index')
    handle.fire('HEAD')
    handle.fire('index')
    h.flush()

    expect(h.delays).toEqual([BATCH_MS])
    expect(h.settled).toEqual([A])
  })

  it('settles only the worktree whose git state moved (SCRF-01)', async () => {
    const h = harness()
    await h.watcher.sync([A, B])

    handleOf(h.handles, B).fire('index')
    h.flush()

    expect(h.settled).toEqual([B])
  })

  it('never settles for other git-dir entries (SCRF-01)', async () => {
    const h = harness()
    await h.watcher.sync([A])
    const handle = handleOf(h.handles, A)

    for (const name of [
      'index.lock',
      'HEAD.lock',
      'COMMIT_EDITMSG',
      'packed-refs.lock',
      'objects'
    ]) {
      handle.fire(name)
    }
    h.flush()

    expect(h.delays).toEqual([])
    expect(h.settled).toEqual([])
  })

  it('opens an added worktree, closes a dropped one and keeps the rest (SCRF-04)', async () => {
    const h = harness()
    await h.watcher.sync([A])
    const kept = handleOf(h.handles, A)

    await h.watcher.sync([A, B])
    expect(h.open().map((x) => x.path)).toEqual([GIT_DIRS[A], GIT_DIRS[B]])
    expect(handleOf(h.handles, A)).toBe(kept)

    await h.watcher.sync([B])
    expect(kept.closed).toBe(true)
    expect(h.open().map((x) => x.path)).toEqual([GIT_DIRS[B]])
  })

  it('drops a pending settle for a worktree no longer watched (SCRF-04)', async () => {
    const h = harness()
    await h.watcher.sync([A])
    handleOf(h.handles, A).fire('index')

    await h.watcher.sync([])
    h.flush()

    expect(h.settled).toEqual([])
  })

  it('skips a worktree whose git dir does not resolve and watches the others (SCRF-05)', async () => {
    const h = harness({ failing: [A] })

    await h.watcher.sync([A, B])

    expect(h.open().map((x) => x.path)).toEqual([GIT_DIRS[B]])
  })

  it('does not open a worktree dropped while its git dir was resolving (SCRF-04)', async () => {
    const h = harness()
    const held = h.hold()
    const first = h.watcher.sync([A])

    const second = h.watcher.sync([])
    held.release()
    await Promise.all([first, second])

    expect(h.open()).toEqual([])
  })

  it('closes every watch and drops pending settles on closeAll (quit edge case)', async () => {
    const h = harness()
    await h.watcher.sync([A, B])
    handleOf(h.handles, A).fire('index')

    h.watcher.closeAll()
    h.flush()

    expect(h.handles.every((x) => x.closed)).toBe(true)
    expect(h.settled).toEqual([])
  })
})
