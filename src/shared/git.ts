/** A worktree's position against its upstream, read from local refs only (STBR-09/10). */
export interface SyncState {
  /** Branch name, or null while HEAD is detached (STBR-08). */
  branch: string | null
  /** Short sha when detached (STBR-08). */
  detachedSha?: string
  /** e.g. 'origin/main'; null when the branch has no upstream (STBR-12). */
  upstream: string | null
  /** Commits to pull; 0 when there is no upstream (STBR-09). */
  behind: number
  /** Commits to push; 0 when there is no upstream (STBR-09). */
  ahead: number
  /** Remote names, in git's order — drives Publish and its picker (STBR-13/19/20). */
  remotes: string[]
  /** FETCH_HEAD mtime in epoch ms; null when the repo never fetched (STBR-22). */
  lastFetchAt: number | null
  /** Git's first error line; set means the section degrades to it (STBR-14). */
  error?: string
  /** The worktree folder no longer exists: no counters, no operations (spec edge case). */
  missing?: true
}

/** The operations the sync popover offers (STBR-15/17/19/21). */
export type GitOp = 'sync' | 'pull' | 'push' | 'fetch' | 'publish'

/** One row of a sync popover commit list (STBR-16). */
export interface CommitLine {
  /** Short hash (STBR-16). */
  sha: string
  /** Commit subject (STBR-16). */
  subject: string
  /** Commit date, epoch ms — rendered as a relative date (STBR-16). */
  at: number
}

/** The commits each direction would move, capped at 20 per list (STBR-15/16). */
export interface CommitLists {
  /** Commits in the upstream and not in HEAD — what a pull brings in (STBR-15). */
  incoming: CommitLine[]
  /** Commits in HEAD and not in the upstream — what a push sends (STBR-15). */
  outgoing: CommitLine[]
  /** How many more incoming commits exist beyond the 20 returned (STBR-16). */
  moreIncoming: number
  /** How many more outgoing commits exist beyond the 20 returned (STBR-16). */
  moreOutgoing: number
}

/** Outcome of one git operation; failures are returned, never thrown (STBR-17/18). */
export interface GitOpResult {
  /** The operation completed (STBR-17/25). */
  ok: boolean
  /** Git's first stderr line on failure (STBR-18). */
  error?: string
  /** The 120 s ceiling was hit and the process was killed (STBR-24). */
  timedOut?: boolean
  /** Another operation is already running for this worktree (STBR-28). */
  busy?: boolean
}
