import type { ChangeStatus } from './worktrees'

/**
 * The lenses the Files direction puts over one worktree (FXPL-07, FCMT-01):
 * the whole folder, what the branch changed since its base, what is not
 * committed yet, and the branch's own commits since that same base.
 */
export type FilesMode = 'full' | 'since-base' | 'uncommitted' | 'commits'

/** One row of a folder listing — a direct child, never a descendant. */
export interface FileEntry {
  name: string
  /** Path relative to the worktree root, forward slashes. */
  path: string
  kind: 'file' | 'dir'
  /** A folder `git ls-files --directory` reported as wholly untracked. */
  untracked?: boolean
}

/** One folder's direct children, or git's first error line instead (edge case). */
export interface DirListing {
  entries: FileEntry[]
  error?: string
}

/**
 * One changed path in either diff mode. `status` is the same `ChangeStatus`
 * the uncommitted mode already uses, so both modes carry one label vocabulary.
 */
export interface ChangedPath {
  path: string
  status: ChangeStatus
  /** The source path of a rename or a copy. */
  oldPath?: string
}

/** What the branch changed since its base (FXPL-08), committed changes only. */
export interface ChangedListing {
  mergeBase: string | null
  files: ChangedPath[]
  error?: string
}

/** What the base picker offers (FXPL-09/10/11). */
export interface BaseOptions {
  /** `origin/HEAD`'s target, e.g. 'origin/main'; null when the repo has none (FXPL-11). */
  defaultBase: string | null
  branches: string[]
  /**
   * Git's first error line when the branches could not be listed at all
   * (AD-032). Distinct from an empty `branches`: nothing to list invites the
   * FXPL-11 prompt, a failure cannot, because there is nothing to choose from.
   */
  error?: string
}

/**
 * What the viewer got for one file (FXPL-16/20/24). A discriminated union, so a
 * file that cannot be rendered is a state the tab shows, never an exception.
 */
export type FileContent =
  | { kind: 'text'; text: string; size: number }
  | { kind: 'binary'; size: number }
  | { kind: 'too-large'; size: number }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

/** One batch of disk changes in the selected worktree (FXPL-21/22). */
export interface FilesChanged {
  worktreePath: string
  /** Relative paths touched in this batch. */
  paths: string[]
  /** The index or HEAD moved: a commit, a stage or a checkout. */
  gitStateChanged: boolean
}

/**
 * Where one side of a diff is read from: a revision, or the working copy on
 * disk. Deliberately revision-or-disk rather than mode-shaped, so F3's commit
 * diff is `{ rev: 'abc^' }` → `{ rev: 'abc' }` with nothing new in main.
 */
export type DiffRef = { rev: string; path: string } | { disk: true; path: string }

/**
 * The two sides one diff compares (FDIF-01/02). Each side carries its own
 * path, so a rename reads its original from `oldPath` (FDIF-05).
 */
export interface DiffRequest {
  /** null = the side does not exist: an added or untracked file (FDIF-03). */
  original: DiffRef | null
  /** null = the side does not exist: a deleted file (FDIF-04). */
  modified: DiffRef | null
}

/**
 * What one side of a diff got. F1's `FileContent` plus `absent`, which is not
 * the same as its `missing`: `absent` means the file is not meant to exist on
 * this side, `missing` that it was looked for and was not there.
 */
export type DiffSide = FileContent | { kind: 'absent' }

/** A line terminator, as the raw bytes of a side carry it. */
export type Eol = 'LF' | 'CRLF' | 'CR'

/**
 * One diff as main produces it (FDIF-01..06, 15). Line-ending changes come
 * with it because Monaco's diff cannot see them: its models keep their own
 * terminators, but the diff of a CRLF side against an identical LF side
 * reports zero changes (F2 spike, finding 1).
 */
export interface DiffSides {
  original: DiffSide
  modified: DiffSide
  /** Modified-side line numbers, 1-based, whose terminator differs from the original's. */
  eolChanged: number[]
  /** The original side's dominant ending, for the strip text (FDIF-15). */
  eolFrom?: Eol
  /** The modified side's dominant ending, for the strip text (FDIF-15). */
  eolTo?: Eol
}

/** One changed file's line counts, for the All changes header and sections (FDIF-19/20). */
export interface FileStat {
  path: string
  added: number
  removed: number
  /**
   * Why this file has no lines to count, when it has none; absent means it was
   * counted. `binary` is git reporting `-` for both sides or a NUL in the
   * head; `too-large` is a file past the 1 MB view cap, which is not binary at
   * all and must not be described as such to the user.
   */
  uncountable?: 'binary' | 'too-large'
}

/**
 * One row of the Commits list (FCMT-03/05/12). A row carries everything the
 * list draws, so drawing it needs no second call: the subject for the line,
 * the whole message for the tooltip (FCMT-04), and whether the commit has
 * reached the branch's upstream.
 */
export interface CommitRow {
  /** The full 40-character sha — what Copy sha puts on the clipboard (FCMT-22). */
  sha: string
  shortSha: string
  /** `(no subject)` when the commit message has none (edge case). */
  subject: string
  /** The full message, for the row's tooltip (FCMT-04). */
  message: string
  author: string
  /** Commit date, epoch milliseconds. */
  at: number
  /** More than one parent, so the list shows it as a merge (FCMT-05). */
  isMerge: boolean
  /** Reachable from the branch's upstream; false marks it not pushed (FCMT-12/13). */
  pushed: boolean
}

/**
 * One page of the branch's own commits (FCMT-02/08/09). Paging is by cursor
 * rather than by offset: the next page starts at the last row's first parent,
 * so a commit landing between two pages can neither duplicate nor drop a row.
 */
export interface CommitPage {
  commits: CommitRow[]
  /** A further page exists — the list shows Load more (FCMT-08). */
  hasMore: boolean
  /** Where the next page starts: the last row's sha. Null when there is none. */
  cursor: string | null
  /** e.g. 'fork/feature/x'; null when the branch has no upstream (FCMT-13). */
  upstream: string | null
  /** Provider of the upstream remote; null hides Open in browser (FCMT-26). */
  browse: 'github' | 'azure-devops' | null
  /** Git's first error line when the log could not be read at all. */
  error?: string
}

/**
 * What one commit changed, against its first parent (FCMT-16/17/18). The same
 * two shapes F2's stack already takes, so a commit tab is F2's All changes tab
 * with this in its props.
 */
export interface CommitDetail {
  /** The first parent; null for a root commit, whose sides are all empty (FCMT-18). */
  parent: string | null
  files: ChangedPath[]
  stats: FileStat[]
  /** Git's first error line — a commit an aggressive `gc` removed (edge case). */
  error?: string
}

/**
 * A remote URL the app recognized, reduced to the parts a page URL is built
 * from (FCMT-27). Userinfo never survives parsing, so a credential in the
 * remote cannot reach a built URL (edge case). F4 and F5 reuse this.
 */
export type RemoteRef =
  | { provider: 'github'; owner: string; repo: string }
  | { provider: 'azure-devops'; org: string; project: string; repo: string }
