import { join } from 'node:path'
import type { FilesChanged } from '../shared/files'
import { IgnoreAnswers } from './ignore-check'

/** How long events pile up before one batch is emitted — inside FXPL-21/22's 1 s bound. */
export const BATCH_MS = 250

/** What a watch gives back; the only thing the watcher does with one is close it. */
export interface WatchHandle {
  close(): void
}

/**
 * The `fs.watch` seam. `listener` receives the changed path relative to the
 * watched path, `''` when the platform did not name it.
 */
export type WatchPort = (
  path: string,
  opts: { recursive: boolean },
  listener: (relPath: string) => void
) => WatchHandle

/** The batching delay, injected so tests fire it by hand instead of waiting. */
export interface Scheduler {
  /** Runs `fn` after `ms`; the returned function cancels it. */
  after(ms: number, fn: () => void): () => void
}

export interface FileWatcherDeps {
  watch: WatchPort
  /** `git rev-parse --git-dir` for the worktree, absolute. */
  resolveGitDir: (worktreePath: string) => Promise<string>
  schedule: Scheduler
  emit: (event: FilesChanged) => void
  /**
   * The paths of `paths` git ignores in the worktree; null when git could not
   * tell (`checkIgnored` in `ignore-check.ts`).
   */
  checkIgnored: (worktreePath: string, paths: readonly string[]) => Promise<Set<string> | null>
}

/** One closed batch, as the root and git-dir events left it. */
interface Batch {
  worktreePath: string
  paths: string[]
  gitStateChanged: boolean
  /** An event in the batch named no path. */
  sawUnnamed: boolean
}

/**
 * Watches the one selected worktree (FXPL-21/22/23). A recursive watch on the
 * root catches every file an agent writes, including new untracked ones; two
 * more on the git dir's `index` and `HEAD` catch a commit or a stage, which a
 * linked worktree never shows under its own root. Events pile up for
 * `BATCH_MS`; the closed batch then drops what git ignores (FWIG-01..13) and
 * leaves as one `FilesChanged`, or not at all when nothing is left.
 */
export class FileWatcher {
  private readonly deps: FileWatcherDeps
  private selected: string | null = null
  private handles: WatchHandle[] = []
  private cancelBatch: (() => void) | null = null
  private paths = new Set<string>()
  private gitStateChanged = false
  private sawUnnamed = false
  /** What git said during this watch; replaced on every selection (FWIG-09). */
  private answers = new IgnoreAnswers()
  /** Bumped on every selection, so a check that outlives its watch is dropped (FWIG-13). */
  private generation = 0
  /** Closed batches classify one at a time, in the order they closed (FWIG-12). */
  private classifying: Promise<void> = Promise.resolve()

  constructor(deps: FileWatcherDeps) {
    this.deps = deps
  }

  /**
   * Watch this worktree and nothing else; `null` stops watching altogether.
   * Every handle of the previous selection is closed first, and anything it had
   * batched is dropped rather than emitted.
   */
  async select(worktreePath: string | null): Promise<void> {
    this.closeAll()
    this.selected = worktreePath
    if (worktreePath === null) return
    this.handles.push(
      this.deps.watch(worktreePath, { recursive: true }, (relPath) =>
        this.onRootEvent(worktreePath, relPath)
      )
    )
    let gitDir: string
    try {
      gitDir = await this.deps.resolveGitDir(worktreePath)
    } catch {
      return
    }
    // The selection may have moved on while the git dir was being resolved.
    if (this.selected !== worktreePath) return
    for (const name of ['index', 'HEAD']) {
      this.handles.push(
        this.deps.watch(join(gitDir, name), { recursive: false }, () =>
          this.onGitStateEvent(worktreePath)
        )
      )
    }
  }

  private onRootEvent(worktreePath: string, relPath: string): void {
    if (this.selected !== worktreePath) return
    const path = relPath.replaceAll('\\', '/')
    // The git dir has its own watches; its churn is not a file change.
    if (path === '.git' || path.startsWith('.git/')) return
    if (path !== '') this.paths.add(path)
    else this.sawUnnamed = true
    this.startBatch(worktreePath)
  }

  private onGitStateEvent(worktreePath: string): void {
    if (this.selected !== worktreePath) return
    this.gitStateChanged = true
    this.startBatch(worktreePath)
  }

  private startBatch(worktreePath: string): void {
    if (this.cancelBatch) return
    this.cancelBatch = this.deps.schedule.after(BATCH_MS, () => {
      this.cancelBatch = null
      const batch: Batch = {
        worktreePath,
        paths: [...this.paths],
        gitStateChanged: this.gitStateChanged,
        sawUnnamed: this.sawUnnamed
      }
      this.paths.clear()
      this.gitStateChanged = false
      this.sawUnnamed = false
      if (this.selected !== worktreePath) return
      const generation = this.generation
      // A throwing emit must not leave the chain rejected, or no later batch would run.
      this.classifying = this.classifying
        .then(() => this.settle(batch, generation))
        .catch((err) => console.error('files: a watch batch failed to leave main', err))
    })
  }

  /** Classifies one batch and emits what is left; a failed classification emits it unfiltered. */
  private async settle(batch: Batch, generation: number): Promise<void> {
    let event: FilesChanged | null
    try {
      event = await this.classify(batch, generation)
    } catch (err) {
      console.error('files: the ignore check failed; the batch passes unfiltered', err)
      event = this.isCurrent(batch.worktreePath, generation)
        ? {
            worktreePath: batch.worktreePath,
            paths: batch.paths,
            gitStateChanged: batch.gitStateChanged
          }
        : null
    }
    if (event) this.deps.emit(event)
  }

  /** The event a batch leaves as, or null when it leaves as nothing (FWIG-01..13). */
  private async classify(batch: Batch, generation: number): Promise<FilesChanged | null> {
    const { worktreePath, paths } = batch
    if (!this.isCurrent(worktreePath, generation)) return null
    if (batch.gitStateChanged) {
      // Tracking decides git's answers, and the index or HEAD moved (FWIG-08).
      this.answers.forget()
      return { worktreePath, paths, gitStateChanged: true }
    }
    if (paths.some((path) => path === '.gitignore' || path.endsWith('/.gitignore'))) {
      this.answers.forget() // FWIG-07
    }
    const ask = this.answers.questionsFor(paths)
    if (ask.length > 0) {
      const ignored = await this.deps.checkIgnored(worktreePath, ask)
      if (!this.isCurrent(worktreePath, generation)) return null // FWIG-13
      // Null: git could not tell, so nothing is learned and the paths pass (FWIG-10).
      if (ignored) this.answers.learn(ask, ignored)
    }
    const kept = paths.filter((path) => !this.answers.isIgnored(path))
    if (kept.length === 0 && !batch.sawUnnamed) return null // FWIG-01, FWIG-11
    return { worktreePath, paths: kept, gitStateChanged: false }
  }

  private isCurrent(worktreePath: string, generation: number): boolean {
    return this.selected === worktreePath && this.generation === generation
  }

  private closeAll(): void {
    for (const handle of this.handles) handle.close()
    this.handles = []
    this.cancelBatch?.()
    this.cancelBatch = null
    this.paths.clear()
    this.gitStateChanged = false
    this.sawUnnamed = false
    this.answers = new IgnoreAnswers()
    this.generation++
  }
}
