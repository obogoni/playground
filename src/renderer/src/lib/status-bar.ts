import type { AppConfig, SessionView } from '../../../shared/config'
import type { SyncState } from '../../../shared/git'
import type { WorkspaceNode } from '../../../shared/tree'
import { relativeTime } from './relative-time'
import { findWorktree, type SelectedWorktree } from './tree-selection'

/** What the status bar describes (STBR-02..05). */
export type BarTarget =
  /** A worktree in the tree — the tree selection, or the Agents session's worktree. */
  | { kind: 'worktree'; selected: SelectedWorktree }
  /** A session rooted outside every worktree: path only, no counters (STBR-04). */
  | { kind: 'folder'; path: string }
  /** Nothing selected: the bar stays mounted with a neutral state (STBR-05). */
  | { kind: 'none' }

export interface BarTargetInput {
  direction: AppConfig['ui']['direction']
  tree: WorkspaceNode[]
  selectedId: string | null
  sessions: SessionView[]
  selectedSessionId: string | null
}

/** A Windows path in one comparable form: forward slashes, lower case, no trailing slash. */
function comparablePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * The worktree a folder is inside (STBR-03, 04): the worktree root itself or
 * any folder below it, matched on a whole path segment so `widget-12345` is
 * not inside `widget`. When worktrees nest, the deepest one wins.
 */
function worktreeContaining(tree: WorkspaceNode[], folder: string): SelectedWorktree | null {
  const target = comparablePath(folder)
  let best: SelectedWorktree | null = null
  let bestLength = -1
  for (const workspace of tree) {
    for (const repo of workspace.repos) {
      for (const worktree of repo.worktrees) {
        const root = comparablePath(worktree.path)
        const inside = target === root || target.startsWith(`${root}/`)
        if (inside && root.length > bestLength) {
          bestLength = root.length
          best = {
            workspaceName: workspace.displayName,
            repoName: repo.name,
            repoPath: repo.path,
            worktree
          }
        }
      }
    }
  }
  return best
}

/**
 * Resolve what the bar describes. In Agents a selected session wins over the
 * tree selection (STBR-03) and describes the worktree its cwd is inside, or
 * the bare folder when it is inside none (STBR-04). Everywhere else, and in
 * Agents when no live session is selected, the tree selection is described
 * (STBR-02).
 */
export function barTargetFor(input: BarTargetInput): BarTarget {
  const { direction, tree, selectedId, sessions, selectedSessionId } = input
  if (direction === 'agents') {
    const session = sessions.find((s) => s.id === selectedSessionId)
    if (session) {
      const selected = worktreeContaining(tree, session.cwd)
      return selected ? { kind: 'worktree', selected } : { kind: 'folder', path: session.cwd }
    }
  }
  const selected = findWorktree(tree, selectedId)
  return selected ? { kind: 'worktree', selected } : { kind: 'none' }
}

/**
 * Split a branch in half for middle truncation (STBR-06), the head taking the
 * odd character. The CSS gives each half at most half the width and clips the
 * head at its end (with the ellipsis) and the tail at its start, so a long
 * name shows as much of its start as of its end.
 */
export function splitBranch(branch: string): { head: string; tail: string } {
  const at = Math.ceil(branch.length / 2)
  return { head: branch.slice(0, at), tail: branch.slice(at) }
}

/** What the ahead/behind section renders — one outcome per state (STBR-09, 12, 13, 14). */
export type SyncSection =
  | { kind: 'counts'; behind: number; ahead: number }
  | { kind: 'no-upstream'; remotes: string[] }
  | { kind: 'detached'; sha: string }
  | { kind: 'no-remote' }
  | { kind: 'error'; message: string }

/**
 * Decide the section. Precedence: an error first, so a failing repo never shows
 * stale counts; then detached, which has no branch to track anything; then no
 * remote; then no upstream; otherwise the counts.
 */
export function syncSectionFor(state: SyncState): SyncSection {
  if (state.error !== undefined) return { kind: 'error', message: state.error }
  if (state.branch === null) return { kind: 'detached', sha: state.detachedSha ?? '' }
  if (state.remotes.length === 0) return { kind: 'no-remote' }
  if (state.upstream === null) return { kind: 'no-upstream', remotes: state.remotes }
  return { kind: 'counts', behind: state.behind, ahead: state.ahead }
}

/**
 * How stale the fetch is (STBR-22). `never` is decided here, not by
 * `relativeTime`: a repo that never fetched is not one fetched long ago. A
 * future mtime (clock skew) reads `just now`, as `relativeTime` floors it.
 */
export function fetchAgeLabel(lastFetchAt: number | null, nowMs: number): string {
  return lastFetchAt === null ? 'never' : relativeTime(lastFetchAt, nowMs)
}
