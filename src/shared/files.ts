import type { ChangeStatus } from './worktrees'

/**
 * The lenses the Files direction puts over one worktree (FXPL-07, FCMT-01,
 * FPRA-01): the whole folder, what the branch changed since its base, what is
 * not committed yet, the branch's own commits since that same base, and the
 * branch's pull request as its provider holds it.
 */
export type FilesMode = 'full' | 'since-base' | 'uncommitted' | 'commits' | 'pull-request'

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

/** Why a discard left an entry as it was (FDSC-18, 21..23, 48). */
export type DiscardCause = 'recycle-bin' | 'link' | 'outside' | 'git'

export interface DiscardKept {
  cause: DiscardCause
  /** Git's first error line for `git`; the rejection's message for `recycle-bin`. */
  detail?: string
}

/** One entry's outcome; `kept` absent means discarded. */
export interface DiscardFileResult {
  path: string
  kept?: DiscardKept
}

/** One result per entry of a `files:discard` request, in the request's order. */
export interface DiscardResult {
  files: DiscardFileResult[]
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

/** The provider a pull request lives on. F4 ships Azure DevOps; F5 adds GitHub to this same model. */
export type PrProvider = 'azure-devops' | 'github'

/** The repository a pull request targets, as `parseRemote` reduced its remote (FPRA-02). */
export interface PrTarget {
  org: string
  project: string
  repo: string
}

/**
 * Names one pull request. The renderer only ever sends this back as intent:
 * main builds every URL from it, so nothing the renderer holds reaches the
 * network or the OS shell as a URL (FPRA-32, as FCMT-28).
 */
export interface PrRef {
  target: PrTarget
  id: number
}

/** One pull request the search found: what the picker names (FPRA-04). */
export interface PrSummary extends PrRef {
  provider: PrProvider
  title: string
  /** Without `refs/heads/`. */
  targetBranch: string
  isDraft: boolean
}

/** What searching for the branch's pull requests found, or why there is nothing to show (FPRA-02..08). */
export type PrSearch =
  | { kind: 'found'; prs: PrSummary[] }
  /** No active pull request; `createUrlAvailable` says whether Create PR can be offered (FPRA-05). */
  | { kind: 'none'; createUrlAvailable: boolean }
  | { kind: 'no-ado-remote' }
  | { kind: 'auth' }
  | { kind: 'detached' }
  | { kind: 'error'; message: string }

/**
 * A reviewer's verdict in provider-neutral terms. Azure DevOps' five votes map
 * onto it one to one (10, 5, 0, -5, -10), and GitHub's review states map onto
 * the same union, so the Overview draws one shape for both.
 */
export type ReviewerState =
  | 'approved'
  | 'approved-with-suggestions'
  | 'no-vote'
  | 'waiting-for-author'
  | 'rejected'

/** One reviewer and their vote; a group is listed like a person (FPRA-09, edge case). */
export interface Reviewer {
  name: string
  state: ReviewerState
  isGroup: boolean
  isRequired: boolean
}

/** Azure DevOps' own thread statuses (FPRA-26); `unknown` is read, never offered. */
export type AdoThreadStatus =
  | 'active'
  | 'fixed'
  | 'wontFix'
  | 'closed'
  | 'byDesign'
  | 'pending'
  | 'unknown'

/** One visible comment of a thread; deleted comments never get this far (FPRA-21). */
export interface PrComment {
  id: number
  author: string
  /** Markdown, rendered inertly in the renderer (FPRA-21/22). */
  content: string
  /** Publication date, epoch milliseconds. */
  at: number
}

/**
 * Where a thread goes (FPRA-11/13/18/19). Lines are 1-based on the side named;
 * `outdated` threads are listed in the Overview and never drawn in a diff. A
 * `general` thread with a `path` is about a file as a whole: it has no line
 * to be drawn under, so it is listed as general, named by its file, and opens
 * that file's PR diff at the top ([owner 2026-10-10]).
 */
export type PrThreadPlace =
  | { kind: 'general'; path?: string }
  | { kind: 'placed'; path: string; side: 'left' | 'right'; startLine: number; endLine: number }
  | { kind: 'outdated'; path: string; line: number }
  | { kind: 'system' }
  | { kind: 'deleted' }

/**
 * One thread as the renderer shows it. `resolution` is the provider-neutral
 * open-or-done every view groups and collapses by (FPRA-20); `providerStatus`
 * is Azure DevOps' own status for its selector (FPRA-26), absent for a
 * provider that has none.
 */
export interface PrThreadView {
  id: number
  /**
   * The comment a reply answers (FPRA-25): the thread's first comment, read
   * before deleted comments are dropped, so it holds even when that comment
   * was deleted and `comments[0]` is a reply ([owner 2026-10-10]).
   */
  rootCommentId: number
  resolution: 'active' | 'resolved'
  providerStatus?: AdoThreadStatus
  comments: PrComment[]
  place: PrThreadPlace
}

/** One changed file of a pull request, with the id a new thread on it must carry (FPRA-15/27). */
export interface PrFile extends ChangedPath {
  changeTrackingId: number
}

/** A pull request's lifecycle; anything but `active` is no longer the branch's PR (edge case). */
export type PrStatus = 'active' | 'completed' | 'abandoned'

/** Everything the Overview and the PR file tree draw (FPRA-09..15). */
export interface PrDetail extends PrSummary {
  status: PrStatus
  author: string
  /** Read from the single-PR call, because the list truncates it (FPRA-10). */
  description: string
  /** Epoch milliseconds. */
  createdAt: number
  /** Without `refs/heads/`. */
  sourceBranch: string
  reviewers: Reviewer[]
  /** The latest iteration, which every thread position and new anchor refers to (FPRA-16/18). */
  iteration: number
  files: PrFile[]
  threads: PrThreadView[]
}

/** One pull request read in full, or why it could not be (FPRA-07). Never thrown. */
export type PrDetailResult =
  | { kind: 'ok'; detail: PrDetail }
  | { kind: 'auth' }
  | { kind: 'error'; message: string }

/**
 * A selection on the modified side of a PR diff, as Monaco reports it: 1-based
 * lines and columns. It may run bottom-up; main normalizes it (FPRA-27).
 */
export interface PrSelection {
  path: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

/**
 * Where a new thread is anchored, in Azure DevOps' convention: 1-based lines,
 * 1-based UTF-16 character offsets, end exclusive, start before end (T1, S1).
 */
export interface Anchor {
  path: string
  startLine: number
  startOffset: number
  endLine: number
  endOffset: number
}

/** The outcome of one write; a failure carries the provider's message for the composer (FPRA-31). */
export type WriteResult = { ok: true } | { ok: false; message: string }
