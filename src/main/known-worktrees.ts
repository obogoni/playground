import { deepestContaining } from '../shared/worktree-match'

export interface KnownWorktreesDeps {
  /** Every worktree path of the workspace's repos, read fresh (production: `listWorktrees`). */
  reread: (workspacePath: string) => Promise<string[]>
  logError: (err: unknown) => void
}

/**
 * The worktrees the app can show, kept from every tree build, so an edited
 * path resolves to one in memory (SFWT-03). A miss inside a registered
 * workspace re-reads that workspace once, because the agent edits a worktree it
 * just created before the tree is ever refreshed (SFWT-12). At most one re-read
 * runs at a time: a miss while one is in flight awaits it (SFWT-13). A failed
 * re-read is logged and resolves to null (SFWT-14).
 */
export class KnownWorktrees {
  #workspaces: string[] = []
  #worktrees: string[] = []
  #inflight: Promise<void> | null = null

  constructor(private readonly deps: KnownWorktreesDeps) {}

  /** Adopt a tree build's workspaces and worktrees, dropping whatever it no longer lists. */
  replace(snapshot: { workspaces: string[]; worktrees: string[] }): void {
    this.#workspaces = [...snapshot.workspaces]
    this.#worktrees = [...snapshot.worktrees]
  }

  /** The known worktree containing `path`, from the cache only; returned as the tree gave it. */
  match(path: string): string | null {
    return deepestContaining(this.#worktrees, path)
  }

  /** `match`, then one re-read of the containing workspace on a miss inside one. */
  async resolve(path: string): Promise<string | null> {
    const hit = this.match(path)
    if (hit !== null) return hit
    if (this.#inflight === null) {
      const workspace = deepestContaining(this.#workspaces, path)
      if (workspace === null) return null
      this.#inflight = this.#reread(workspace).finally(() => {
        this.#inflight = null
      })
    }
    await this.#inflight
    return this.match(path)
  }

  async #reread(workspace: string): Promise<void> {
    try {
      const fresh = await this.deps.reread(workspace)
      const known = new Set(this.#worktrees)
      this.#worktrees = [...this.#worktrees, ...fresh.filter((p) => !known.has(p))]
    } catch (err) {
      this.deps.logError(err)
    }
  }
}
