import { BATCH_MS, type Scheduler, type WatchHandle, type WatchPort } from './file-watcher'

/** The git-dir entries a stage, a commit or a checkout rewrites (measured in T1). */
const GIT_STATE_ENTRIES = new Set(['index', 'HEAD'])

export interface GitStateWatcherDeps {
  watch: WatchPort
  /** `git rev-parse --git-dir` for the worktree, absolute. */
  resolveGitDir: (worktreePath: string) => Promise<string>
  schedule: Scheduler
  /** One call per settled burst, naming the worktree whose git state moved. */
  onSettled: (worktreePath: string) => void
}

interface Entry {
  /** `null` while the git dir is still resolving. */
  handle: WatchHandle | null
  cancelBatch: (() => void) | null
}

/**
 * Watches the git state of every worktree in the tree (SCRF-01/02/04/05), so
 * a commit made in any terminal reaches the counter. One non-recursive watch
 * per git dir, reacting only to `index` and `HEAD`; a linked worktree's git
 * dir (`.git/worktrees/{name}`) has its own. Events pile up for `BATCH_MS`
 * and leave as one `onSettled` for that worktree.
 */
export class GitStateWatcher {
  private readonly deps: GitStateWatcherDeps
  private entries = new Map<string, Entry>()

  constructor(deps: GitStateWatcherDeps) {
    this.deps = deps
  }

  /**
   * Watch exactly these worktrees: open the new ones, close the dropped ones,
   * leave the rest untouched. A worktree whose git dir does not resolve is
   * skipped without failing the others.
   */
  async sync(worktreePaths: string[]): Promise<void> {
    const wanted = new Set(worktreePaths)
    for (const [path, entry] of this.entries) {
      if (!wanted.has(path)) this.close(path, entry)
    }
    await Promise.all(
      [...wanted].filter((path) => !this.entries.has(path)).map((path) => this.open(path))
    )
  }

  /** Close every watch and drop anything batched (the app is quitting). */
  closeAll(): void {
    for (const [path, entry] of this.entries) this.close(path, entry)
  }

  private async open(worktreePath: string): Promise<void> {
    const entry: Entry = { handle: null, cancelBatch: null }
    this.entries.set(worktreePath, entry)
    let gitDir: string
    try {
      gitDir = await this.deps.resolveGitDir(worktreePath)
    } catch {
      if (this.entries.get(worktreePath) === entry) this.entries.delete(worktreePath)
      return
    }
    // A later `sync` may have dropped this worktree while its git dir resolved.
    if (this.entries.get(worktreePath) !== entry) return
    entry.handle = this.deps.watch(gitDir, { recursive: false }, (name) => {
      if (GIT_STATE_ENTRIES.has(name)) this.startBatch(worktreePath, entry)
    })
  }

  private startBatch(worktreePath: string, entry: Entry): void {
    if (entry.cancelBatch) return
    entry.cancelBatch = this.deps.schedule.after(BATCH_MS, () => {
      entry.cancelBatch = null
      this.deps.onSettled(worktreePath)
    })
  }

  private close(worktreePath: string, entry: Entry): void {
    entry.handle?.close()
    entry.cancelBatch?.()
    entry.cancelBatch = null
    this.entries.delete(worktreePath)
  }
}
