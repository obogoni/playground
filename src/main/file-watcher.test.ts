import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FilesChanged } from '../shared/files'
import {
  BATCH_MS,
  FileWatcher,
  type FileWatcherDeps,
  type WatchHandle,
  type WatchPort
} from './file-watcher'
import { checkIgnored } from './ignore-check'

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
 * emit sink. No real `fs.watch`, no timers. `checkIgnored` defaults to git
 * ignoring nothing.
 */
function harness(checkIgnored?: FileWatcherDeps['checkIgnored']): {
  watcher: FileWatcher
  handles: FakeHandle[]
  emitted: FilesChanged[]
  delays: number[]
  /** Every batch delay the watcher cancelled, in order — the timer it killed. */
  cancelled: number[]
  flush(): Promise<void>
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
      emit: (event) => emitted.push(event),
      checkIgnored: checkIgnored ?? (async () => new Set<string>())
    }),
    handles,
    emitted,
    delays,
    cancelled,
    flush: async () => {
      const fn = pending
      pending = null
      fn?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
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
    await h.flush()

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
    await h.flush()

    expect(h.emitted[0].paths).toEqual(['src/a.ts'])
  })

  it('flags a git state change when the git dir’s index moves', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    h.handleFor(join(GIT_DIR, 'index')).fire('index')
    await h.flush()

    expect(h.emitted).toEqual([{ worktreePath: WORKTREE, paths: [], gitStateChanged: true }])
  })

  it('flags a git state change when the git dir’s HEAD moves', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    h.handleFor(join(GIT_DIR, 'HEAD')).fire('HEAD')
    await h.flush()

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

/** Resolves on the next macrotask, after every microtask the watcher queued. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

interface Deferred {
  promise: Promise<void>
  resolve(): void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

/**
 * The real `checkIgnored`, recorded: every question list it was asked and the
 * promise of each call, so a test can wait until the watcher's checks settle.
 * `before(n)` runs ahead of the n-th call (0-based), to hold it open or replace its answer.
 */
function recordingCheck(
  before?: (n: number) => Promise<Set<string> | null | undefined> | undefined
): {
  check: FileWatcherDeps['checkIgnored']
  asked: string[][]
  /** Waits until every check started so far, and every one it led to, has settled. */
  drain(): Promise<void>
} {
  const asked: string[][] = []
  const calls: Promise<unknown>[] = []
  const check: FileWatcherDeps['checkIgnored'] = (worktreePath, paths) => {
    const n = asked.length
    asked.push([...paths])
    const call = (async () => {
      const replaced = await before?.(n)
      if (replaced !== undefined) return replaced
      return checkIgnored(worktreePath, paths)
    })()
    calls.push(call)
    return call
  }
  return {
    check,
    asked,
    drain: async () => {
      for (;;) {
        const started = calls.length
        await Promise.allSettled(calls)
        await tick()
        if (calls.length === started) return
      }
    }
  }
}

describe('FileWatcher drops what git ignores (real repository)', () => {
  let root: string
  let repo: string

  const sh = (...args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' })

  /** Creates each file, and its folders, under the repository. */
  const touch = (...paths: string[]): void => {
    for (const path of paths) {
      mkdirSync(dirname(join(repo, path)), { recursive: true })
      writeFileSync(join(repo, path), 'x\n', 'utf8')
    }
  }

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-fw-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    sh('init', '-q', '-b', 'main')
    sh('config', 'user.email', 'test@test.local')
    sh('config', 'user.name', 'Test')
    // This machine's system gitconfig sets core.autocrlf=true (L-026).
    sh('config', 'core.autocrlf', 'false')
    writeFileSync(join(repo, '.gitignore'), 'bin/\n', 'utf8')
    touch('src/a.ts', 'src/b.ts')
    sh('add', '.')
    sh('commit', '-q', '-m', 'init')
    touch('bin/a.dll', 'bin/b.dll', 'bin/c.dll', 'bin/Debug/a.dll')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  /** Fires these root events as one batch, closes it, and waits until its checks settle. */
  async function batch(
    h: ReturnType<typeof harness>,
    rec: ReturnType<typeof recordingCheck>,
    ...paths: string[]
  ): Promise<void> {
    for (const path of paths) h.handleFor(repo).fire(path)
    await h.flush()
    await rec.drain()
  }

  it('emits nothing for a batch whose paths git all ignores (FWIG-01)', async () => {
    const rec = recordingCheck()
    const h = harness(rec.check)
    await h.watcher.select(repo)

    await batch(h, rec, 'bin/a.dll', 'bin/b.dll')

    expect(rec.asked).toHaveLength(1)
    expect(h.emitted).toEqual([])
  })

  it('emits only the paths git does not ignore, in first-seen order (FWIG-02)', async () => {
    const rec = recordingCheck()
    const h = harness(rec.check)
    await h.watcher.select(repo)

    await batch(h, rec, 'src/b.ts', 'bin/a.dll', 'src/a.ts')

    expect(h.emitted).toEqual([
      { worktreePath: repo, paths: ['src/b.ts', 'src/a.ts'], gitStateChanged: false }
    ])
  })

  it('emits a tracked file inside an ignored folder (FWIG-03)', async () => {
    touch('bin/keep.txt')
    sh('add', '-f', 'bin/keep.txt')
    sh('commit', '-q', '-m', 'keep')
    const rec = recordingCheck()
    const h = harness(rec.check)
    await h.watcher.select(repo)

    await batch(h, rec, 'bin/keep.txt', 'bin/Debug/a.dll')

    expect(h.emitted).toEqual([
      { worktreePath: repo, paths: ['bin/keep.txt'], gitStateChanged: false }
    ])
  })

  it('asks once for the first batch under an ignored folder and never for the next (FWIG-04, FWIG-05)', async () => {
    const rec = recordingCheck()
    const h = harness(rec.check)
    await h.watcher.select(repo)

    await batch(h, rec, 'bin/a.dll')
    expect(rec.asked).toEqual([['bin', 'bin/a.dll']])

    await batch(h, rec, 'bin/b.dll', 'bin/Debug/a.dll')
    expect(rec.asked).toHaveLength(1)
    expect(h.emitted).toEqual([])
  })

  it('asks once about a folder ignored after the watch started, then never again (FWIG-46)', async () => {
    const rec = recordingCheck()
    const h = harness(rec.check)
    await h.watcher.select(repo)
    appendFileSync(join(repo, '.gitignore'), 'out/\n', 'utf8')
    await batch(h, rec, '.gitignore')
    const before = rec.asked.length
    touch('out/a.o', 'out/b.o')

    await batch(h, rec, 'out/a.o')
    expect(rec.asked.length).toBe(before + 1)
    await batch(h, rec, 'out/b.o')
    expect(rec.asked.length).toBe(before + 1)

    expect(h.emitted.map((e) => e.paths)).toEqual([['.gitignore']])
  })

  describe('forgetting (FWIG-07, FWIG-08, FWIG-09, L-087)', () => {
    it('asks again about an answered path when a batch names a .gitignore', async () => {
      const rec = recordingCheck()
      const h = harness(rec.check)
      await h.watcher.select(repo)
      await batch(h, rec, 'src/a.ts')
      // The control: without a .gitignore in the batch, the answer is kept.
      await batch(h, rec, 'src/a.ts')
      expect(rec.asked).toHaveLength(1)

      await batch(h, rec, 'src/.gitignore', 'src/a.ts')

      expect(rec.asked).toHaveLength(2)
      expect(rec.asked[1]).toContain('src/a.ts')
    })

    it('asks again about an answered path when a batch names the root .gitignore', async () => {
      const rec = recordingCheck()
      const h = harness(rec.check)
      await h.watcher.select(repo)
      await batch(h, rec, 'src/a.ts')
      // The control: without a .gitignore in the batch, the answer is kept.
      await batch(h, rec, 'src/a.ts')
      expect(rec.asked).toHaveLength(1)

      await batch(h, rec, '.gitignore', 'src/a.ts')

      expect(rec.asked).toHaveLength(2)
      expect(rec.asked[1]).toContain('src/a.ts')
    })

    it('emits a git-state batch whole without asking, and asks again on the next batch', async () => {
      const rec = recordingCheck()
      const h = harness(rec.check)
      await h.watcher.select(repo)
      await batch(h, rec, 'bin/a.dll')
      expect(rec.asked).toHaveLength(1)

      h.handleFor(join(GIT_DIR, 'index')).fire('index')
      await batch(h, rec, 'bin/b.dll', 'src/a.ts')

      expect(rec.asked).toHaveLength(1)
      expect(h.emitted).toEqual([
        { worktreePath: repo, paths: ['bin/b.dll', 'src/a.ts'], gitStateChanged: true }
      ])

      await batch(h, rec, 'bin/c.dll')
      expect(rec.asked).toEqual([
        ['bin', 'bin/a.dll'],
        ['bin', 'bin/c.dll']
      ])
      expect(h.emitted).toHaveLength(1)
    })

    it('asks again after a reselection', async () => {
      const rec = recordingCheck()
      const h = harness(rec.check)
      await h.watcher.select(repo)
      await batch(h, rec, 'bin/a.dll')

      await h.watcher.select(repo)
      await batch(h, rec, 'bin/b.dll')

      expect(rec.asked).toEqual([
        ['bin', 'bin/a.dll'],
        ['bin', 'bin/b.dll']
      ])
    })
  })

  it('emits the batch unfiltered when git cannot tell, and asks again next time (FWIG-10)', async () => {
    const rec = recordingCheck(async (n) => (n === 0 ? null : undefined))
    const h = harness(rec.check)
    await h.watcher.select(repo)

    await batch(h, rec, 'bin/a.dll', 'src/a.ts')
    expect(h.emitted).toEqual([
      { worktreePath: repo, paths: ['bin/a.dll', 'src/a.ts'], gitStateChanged: false }
    ])

    await batch(h, rec, 'bin/b.dll')
    expect(rec.asked).toEqual([
      ['bin', 'src', 'bin/a.dll', 'src/a.ts'],
      ['bin', 'bin/b.dll']
    ])
    expect(h.emitted).toHaveLength(1)
  })

  it('emits the batch unfiltered when the check itself throws (FWIG-10)', async () => {
    const rec = recordingCheck(async () => {
      throw new Error('broken check')
    })
    const h = harness(rec.check)
    await h.watcher.select(repo)

    await batch(h, rec, 'bin/a.dll', 'src/a.ts')

    expect(h.emitted).toEqual([
      { worktreePath: repo, paths: ['bin/a.dll', 'src/a.ts'], gitStateChanged: false }
    ])
  })

  it('emits an empty change for an unnamed event beside ignored paths (FWIG-11)', async () => {
    const rec = recordingCheck()
    const h = harness(rec.check)
    await h.watcher.select(repo)

    await batch(h, rec, '', 'bin/a.dll')

    expect(h.emitted).toEqual([{ worktreePath: repo, paths: [], gitStateChanged: false }])
  })

  it('runs one check at a time and emits the batches in the order they closed (FWIG-12)', async () => {
    const held = deferred()
    const rec = recordingCheck(async (n) => {
      if (n === 0) await held.promise
      return undefined
    })
    const h = harness(rec.check)
    await h.watcher.select(repo)

    h.handleFor(repo).fire('src/a.ts')
    await h.flush()
    h.handleFor(repo).fire('src/b.ts')
    await h.flush()
    await tick()

    expect(rec.asked).toEqual([['src', 'src/a.ts']])
    expect(h.emitted).toEqual([])

    held.resolve()
    await rec.drain()

    expect(rec.asked).toEqual([['src', 'src/a.ts'], ['src/b.ts']])
    expect(h.emitted.map((e) => e.paths)).toEqual([['src/a.ts'], ['src/b.ts']])
  })

  it('drops a batch whose check was running when the selection moved on (FWIG-13)', async () => {
    const held = deferred()
    const rec = recordingCheck(async () => {
      await held.promise
      return undefined
    })
    const h = harness(rec.check)
    await h.watcher.select(repo)
    h.handleFor(repo).fire('src/a.ts')
    await h.flush()
    expect(rec.asked).toHaveLength(1)

    await h.watcher.select(null)
    held.resolve()
    await rec.drain()

    expect(h.emitted).toEqual([])
  })

  it('drops a batch whose check was running when the selection left and came back (FWIG-13)', async () => {
    const held = deferred()
    const rec = recordingCheck(async () => {
      await held.promise
      return undefined
    })
    const h = harness(rec.check)
    await h.watcher.select(repo)
    h.handleFor(repo).fire('src/a.ts')
    await h.flush()
    expect(rec.asked).toHaveLength(1)

    // Back on the same worktree: only the watch generation tells the old batch apart.
    await h.watcher.select(null)
    await h.watcher.select(repo)
    held.resolve()
    await rec.drain()

    expect(h.emitted).toEqual([])
  })

  it('lets at most the folder itself through when an ignored folder is deleted (FWIG-47)', async () => {
    rmSync(join(repo, 'bin'), { recursive: true, force: true })
    const rec = recordingCheck()
    const h = harness(rec.check)
    await h.watcher.select(repo)

    await batch(h, rec, 'bin', 'bin/Debug/a.dll')

    expect(rec.asked).toHaveLength(1)
    expect(h.emitted.flatMap((e) => e.paths).filter((path) => path !== 'bin')).toEqual([])
  })
})
