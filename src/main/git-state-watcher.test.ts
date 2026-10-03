import { describe, expect, it } from 'vitest'
import type { WatchHandle, WatchPort } from './file-watcher'
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
 * open or fail, and the events and drops the watcher reports, in order.
 * No real `fs.watch`, no timers.
 */
function harness(opts: { failing?: string[] } = {}): {
  watcher: GitStateWatcher
  handles: FakeHandle[]
  events: string[]
  dropped: string[]
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
  const events: string[] = []
  const dropped: string[] = []
  let gate: Promise<void> | null = null
  return {
    watcher: new GitStateWatcher({
      watch,
      resolveGitDir: async (path) => {
        if (gate) await gate
        if (opts.failing?.includes(path)) throw new Error('fatal: not a git repository')
        return GIT_DIRS[path]
      },
      onEvent: (path) => events.push(path),
      onDropped: (path) => dropped.push(path)
    }),
    handles,
    events,
    dropped,
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

  it('reports an `index` event at once (SCRF-01, RCNT-01)', async () => {
    const h = harness()
    await h.watcher.sync([A])

    handleOf(h.handles, A).fire('index')

    expect(h.events).toEqual([A])
  })

  it('reports a `HEAD` event at once (SCRF-01, RCNT-01)', async () => {
    const h = harness()
    await h.watcher.sync([A])

    handleOf(h.handles, A).fire('HEAD')

    expect(h.events).toEqual([A])
  })

  it('reports every event of a burst, leaving the coalescing to the scheduler (RCNT-01)', async () => {
    const h = harness()
    await h.watcher.sync([A])
    const handle = handleOf(h.handles, A)

    handle.fire('index')
    handle.fire('HEAD')
    handle.fire('index')

    expect(h.events).toEqual([A, A, A])
  })

  it('reports only the worktree whose git state moved (SCRF-01)', async () => {
    const h = harness()
    await h.watcher.sync([A, B])

    handleOf(h.handles, B).fire('index')

    expect(h.events).toEqual([B])
  })

  it('reports nothing for other git-dir entries (SCRF-01)', async () => {
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

    expect(h.events).toEqual([])
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

  it('reports a dropped worktree once through onDropped (SCRF-04, RCNT-11)', async () => {
    const h = harness()
    await h.watcher.sync([A])
    handleOf(h.handles, A).fire('index')

    await h.watcher.sync([])
    await h.watcher.sync([])

    expect(h.dropped).toEqual([A])
  })

  it('never reports a worktree kept across syncs as dropped (RCNT-11)', async () => {
    const h = harness()
    await h.watcher.sync([A])
    await h.watcher.sync([A, B])

    await h.watcher.sync([A])

    expect(h.dropped).toEqual([B])
  })

  it('skips a worktree whose git dir does not resolve and watches the others (SCRF-05)', async () => {
    const h = harness({ failing: [A] })

    await h.watcher.sync([A, B])

    expect(h.open().map((x) => x.path)).toEqual([GIT_DIRS[B]])
  })

  it('watches a worktree on a later sync once its git dir resolves (SCRF-05)', async () => {
    const failing = [A]
    const h = harness({ failing })
    await h.watcher.sync([A, B])
    expect(h.open().map((x) => x.path)).toEqual([GIT_DIRS[B]])

    failing.length = 0
    await h.watcher.sync([A, B])

    expect(h.open().map((x) => x.path)).toEqual([GIT_DIRS[B], GIT_DIRS[A]])
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

  it('closes every watch on closeAll and reports no drop (quit edge case)', async () => {
    const h = harness()
    await h.watcher.sync([A, B])
    handleOf(h.handles, A).fire('index')

    h.watcher.closeAll()

    expect(h.handles.every((x) => x.closed)).toBe(true)
    expect(h.dropped).toEqual([])
  })
})
