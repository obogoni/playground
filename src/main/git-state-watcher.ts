import type { WatchHandle, WatchPort } from './file-watcher'

/** The git-dir entries a stage, a commit or a checkout rewrites (measured in T1). */
const GIT_STATE_ENTRIES = new Set(['index', 'HEAD'])

export interface GitStateWatcherDeps {
  watch: WatchPort
  /** `git rev-parse --git-dir` for the worktree, absolute. */
  resolveGitDir: (worktreePath: string) => Promise<string>
  /** Every `index` or `HEAD` event in this worktree's git dir, as it happens (RCNT-01). */
  onEvent: (worktreePath: string) => void
  /** This worktree is no longer watched (a later `sync` dropped it); `closeAll` does not call it. */
  onDropped: (worktreePath: string) => void
}

interface Entry {
  /** `null` while the git dir is still resolving. */
  handle: WatchHandle | null
}

/**
 * Watches the git state of every worktree in the tree (SCRF-01/04/05), so
 * a commit made in any terminal reaches the counter. One non-recursive watch
 * per git dir, reacting only to `index` and `HEAD`; a linked worktree's git
 * dir (`.git/worktrees/{name}`) has its own. Each event leaves at once through
 * `onEvent`: `RecountScheduler` coalesces them (RCNT-01, SCRF-02).
 */
export class GitStateWatcher {
  private readonly deps: GitStateWatcherDeps
  private entries = new Map<string, Entry>()

  constructor(deps: GitStateWatcherDeps) {
    this.deps = deps
  }

  /**
   * Watch exactly these worktrees: open the new ones, close the dropped ones
   * (each reported through `onDropped`), leave the rest untouched. A worktree
   * whose git dir does not resolve is skipped without failing the others.
   */
  async sync(worktreePaths: string[]): Promise<void> {
    const wanted = new Set(worktreePaths)
    for (const [path, entry] of this.entries) {
      if (!wanted.has(path)) {
        this.close(path, entry)
        this.deps.onDropped(path)
      }
    }
    await Promise.all(
      [...wanted].filter((path) => !this.entries.has(path)).map((path) => this.open(path))
    )
  }

  /** Close every watch (the app is quitting; the quit path stops `RecountScheduler` itself). */
  closeAll(): void {
    for (const [path, entry] of this.entries) this.close(path, entry)
  }

  private async open(worktreePath: string): Promise<void> {
    const entry: Entry = { handle: null }
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
      if (GIT_STATE_ENTRIES.has(name)) this.deps.onEvent(worktreePath)
    })
  }

  private close(worktreePath: string, entry: Entry): void {
    entry.handle?.close()
    this.entries.delete(worktreePath)
  }
}
