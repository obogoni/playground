/** A registered workspace as persisted in AppConfig.workspaces. */
export interface WorkspaceEntry {
  /** Normalized lowercased absolute path — stable identity (PRD: identified by absolute path). */
  id: string
  /** The path as picked by the user. */
  path: string
  /** Folder basename by default. */
  displayName: string
}

export interface WorktreeNode {
  /** Worktree absolute path — unique, doubles as selection id. */
  id: string
  /** Branch name, or '(detached <short-sha>)' for detached HEAD. */
  branch: string
  path: string
  /** True for the repo's primary checkout (first entry in `git worktree list`). */
  isDefault: boolean
  dirty: boolean
  /** Count of changed/untracked paths from `git status --porcelain`. */
  changes: number
}

export interface RepoNode {
  name: string
  path: string
  worktrees: WorktreeNode[]
  /** Set when git failed for this repo; the rest of the tree is unaffected. */
  error?: string
}

/** Snapshot node returned by tree:get — a WorkspaceEntry plus discovered content. */
export interface WorkspaceNode extends WorkspaceEntry {
  /** Set when the workspace path no longer exists on disk. */
  missing?: boolean
  repos: RepoNode[]
}
