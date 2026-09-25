import { join } from 'node:path'
import type { FilesChanged } from '../shared/files'

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
}

/**
 * Watches the one selected worktree (FXPL-21/22/23). A recursive watch on the
 * root catches every file an agent writes, including new untracked ones; two
 * more on the git dir's `index` and `HEAD` catch a commit or a stage, which a
 * linked worktree never shows under its own root. Events pile up for
 * `BATCH_MS` and leave as one `FilesChanged`.
 */
export class FileWatcher {
  private readonly deps: FileWatcherDeps
  private selected: string | null = null
  private handles: WatchHandle[] = []
  private cancelBatch: (() => void) | null = null
  private paths = new Set<string>()
  private gitStateChanged = false

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
      const event: FilesChanged = {
        worktreePath,
        paths: [...this.paths],
        gitStateChanged: this.gitStateChanged
      }
      this.paths.clear()
      this.gitStateChanged = false
      if (this.selected !== worktreePath) return
      this.deps.emit(event)
    })
  }

  private closeAll(): void {
    for (const handle of this.handles) handle.close()
    this.handles = []
    this.cancelBatch?.()
    this.cancelBatch = null
    this.paths.clear()
    this.gitStateChanged = false
  }
}
