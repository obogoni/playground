import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FilesChanged } from '../shared/files'
import { BATCH_MS, FileWatcher, type WatchHandle, type WatchPort } from './file-watcher'

const WORKTREE = 'C:\\work\\repo-feature'
const GIT_DIR = 'C:\\work\\repo\\.git\\worktrees\\repo-feature'

interface FakeHandle extends WatchHandle {
  path: string
  recursive: boolean
  closed: boolean
  fire(relPath: string): void
}

/**
 * The injected seams of pattern 3: a watch port recording every handle it
 * opened, a scheduler whose one pending callback the test fires by hand, and an
 * emit sink. No real `fs.watch`, no timers.
 */
function harness(): {
  watcher: FileWatcher
  handles: FakeHandle[]
  emitted: FilesChanged[]
  delays: number[]
  /** Every batch delay the watcher cancelled, in order — the timer it killed. */
  cancelled: number[]
  flush(): void
  /**
   * Runs the last scheduled batch even after it was cancelled — the one race
   * `cancelBatch` cannot win, where the event loop already handed the callback
   * over before `select` changed. Only the emit-time guard stops it there.
   */
  runStale(): void
  handleFor(path: string): FakeHandle
} {
  const handles: FakeHandle[] = []
  const watch: WatchPort = (path, opts, listener) => {
    const handle: FakeHandle = {
      path,
      recursive: opts.recursive,
      closed: false,
      fire: listener,
      close: () => {
        handle.closed = true
      }
    }
    handles.push(handle)
    return handle
  }
  const emitted: FilesChanged[] = []
  const delays: number[] = []
  const cancelled: number[] = []
  let pending: (() => void) | null = null
  // Kept past a cancel on purpose: `pending` models what is still cancellable,
  // this models the callback already in flight.
  let lastScheduled: (() => void) | null = null
  return {
    watcher: new FileWatcher({
      watch,
      resolveGitDir: async () => GIT_DIR,
      schedule: {
        after: (ms, fn) => {
          delays.push(ms)
          pending = fn
          lastScheduled = fn
          return () => {
            cancelled.push(ms)
            pending = null
          }
        }
      },
      emit: (event) => emitted.push(event)
    }),
    handles,
    emitted,
    delays,
    cancelled,
    flush: () => {
      const fn = pending
      pending = null
      fn?.()
    },
    runStale: () => lastScheduled?.(),
    handleFor: (path) => handles.filter((h) => h.path === path && !h.closed).at(-1) as FakeHandle
  }
}

describe('FileWatcher', () => {
  it('emits one change carrying every path of a batch', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    h.handleFor(WORKTREE).fire('src\\a.ts')
    h.handleFor(WORKTREE).fire('src\\b.ts')
    h.handleFor(WORKTREE).fire('readme.md')
    h.flush()

    expect(h.delays).toEqual([BATCH_MS])
    expect(h.emitted).toEqual([
      {
        worktreePath: WORKTREE,
        paths: ['src/a.ts', 'src/b.ts', 'readme.md'],
        gitStateChanged: false
      }
    ])
  })

  it('drops an event under the root’s .git entry', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    h.handleFor(WORKTREE).fire('.git\\index')
    h.handleFor(WORKTREE).fire('src\\a.ts')
    h.flush()

    expect(h.emitted[0].paths).toEqual(['src/a.ts'])
  })

  it('flags a git state change when the git dir’s index moves', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    h.handleFor(join(GIT_DIR, 'index')).fire('index')
    h.flush()

    expect(h.emitted).toEqual([{ worktreePath: WORKTREE, paths: [], gitStateChanged: true }])
  })

  it('flags a git state change when the git dir’s HEAD moves', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    h.handleFor(join(GIT_DIR, 'HEAD')).fire('HEAD')
    h.flush()

    expect(h.emitted).toEqual([{ worktreePath: WORKTREE, paths: [], gitStateChanged: true }])
  })

  it('closes every handle of the previous worktree before opening new ones', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)
    const first = [...h.handles]

    await h.watcher.select('C:\\work\\repo-other')

    expect(first.every((handle) => handle.closed)).toBe(true)
    expect(h.handles.filter((handle) => !handle.closed).map((handle) => handle.path)).toEqual([
      'C:\\work\\repo-other',
      join(GIT_DIR, 'index'),
      join(GIT_DIR, 'HEAD')
    ])
  })

  it('closes every handle when nothing is selected', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    await h.watcher.select(null)

    expect(h.handles.every((handle) => handle.closed)).toBe(true)
  })

  it('discards a pending batch for a worktree that is no longer selected', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)
    h.handleFor(WORKTREE).fire('src\\a.ts')

    await h.watcher.select(null)
    h.flush()

    expect(h.emitted).toEqual([])
  })

  it('drops a batch that fires after the selection moved on (FXPL-23)', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)
    h.handleFor(WORKTREE).fire('src\\a.ts')

    await h.watcher.select(null)

    // The timer was cancelled, but a callback the event loop had already handed
    // over cannot be: it still runs, builds the event and clears the paths. The
    // emit-time guard is the only thing between it and a change reported for a
    // worktree nobody is looking at.
    h.runStale()

    expect(h.emitted).toEqual([])
  })

  it('cancels the pending batch timer itself, not only its emit (FXPL-23)', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)
    h.handleFor(WORKTREE).fire('src\\a.ts')

    expect(h.delays).toEqual([BATCH_MS])
    expect(h.cancelled).toEqual([])

    await h.watcher.select(null)

    // Not merely "nothing is emitted" — a stale timer left alive still runs,
    // and clears the paths the next selection has batched before the emit
    // guard turns it away. Deselecting has to kill the timer.
    expect(h.cancelled).toEqual([BATCH_MS])
  })
})
