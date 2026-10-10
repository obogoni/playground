import type {
  Anchor,
  PrComment,
  PrFile,
  PrSelection,
  PrTarget,
  PrThreadPlace,
  ReviewerState
} from '../shared/files'
import type { ChangeStatus } from '../shared/worktrees'
import { parseRemote } from './remote-url'

/**
 * Azure DevOps' wire shapes turned into the app's pull request model (F4).
 * Pure: the client fetches, this decides, so every rule here is unit-tested
 * against fixtures shaped like the REST 7.1 reference.
 */

/** One entry of an iteration's changes, as much of it as the app reads. */
export interface AdoChange {
  changeTrackingId: number
  /** Words, possibly combined: `add`, `edit`, `delete`, `rename`, `edit, rename`. */
  changeType: string
  item: { path: string }
  /** The source path of a rename. */
  originalPath?: string
}

/** A remote on Azure DevOps, by name, with the repository it points at. */
export interface AdoRemote {
  name: string
  target: PrTarget
}

/** A position in a file: 1-based line, 1-based UTF-16 column, as ADO writes it (T1, S1). */
export interface AdoPosition {
  line: number
  offset: number
}

/** One comment of a thread. A deleted comment arrives flagged and without content (T1, S9). */
export interface AdoComment {
  id: number
  author: { displayName: string }
  content?: string
  publishedDate: string
  /** `text`, `system` or `codeChange`. */
  commentType: string
  /** The comment this one answers; 0 for the thread's first comment. */
  parentCommentId?: number
  isDeleted?: boolean
}

/**
 * One thread read with `$iteration=<latest>&$baseIteration=0`, so its right
 * positions are the latest iteration's (T1, S3). Properties read back as
 * `{ $type, $value }` (S5).
 */
export interface AdoThread {
  id: number
  status: string
  comments: AdoComment[]
  threadContext?: {
    filePath: string
    leftFileStart?: AdoPosition
    leftFileEnd?: AdoPosition
    rightFileStart?: AdoPosition
    rightFileEnd?: AdoPosition
  } | null
  pullRequestThreadContext?: {
    /** Present only when ADO moved the thread since it was created (S3). */
    trackingCriteria?: {
      origRightFileStart?: AdoPosition
      origRightFileEnd?: AdoPosition
    }
  } | null
  properties?: Record<string, { $type: string; $value: unknown }>
  isDeleted?: boolean
}

/**
 * The PR's changed files in the vocabulary the other modes use (FPRA-15).
 * ADO roots every path at `/`; the tree wants worktree-relative paths.
 */
export function toChangedPaths(entries: AdoChange[]): PrFile[] {
  return entries.map((entry) => {
    const file: PrFile = {
      path: relative(entry.item.path),
      status: statusOf(entry.changeType),
      changeTrackingId: entry.changeTrackingId
    }
    if (entry.originalPath !== undefined) file.oldPath = relative(entry.originalPath)
    return file
  })
}

/**
 * A reviewer's vote as the neutral state the Overview draws (FPRA-09), per the
 * reference's `IdentityRefWithVote`. A value it does not document is no vote
 * rather than a guess.
 */
export function voteLabel(vote: number): ReviewerState {
  switch (vote) {
    case 10:
      return 'approved'
    case 5:
      return 'approved-with-suggestions'
    case -5:
      return 'waiting-for-author'
    case -10:
      return 'rejected'
    default:
      return 'no-vote'
  }
}

/**
 * The remotes a pull request can live on: every one `parseRemote` recognizes
 * as Azure DevOps, so a fork and its upstream are both searched (FPRA-02).
 * Empty when there is none, which the mode says instead of searching (FPRA-06).
 */
export function pickRemoteRepos(remotes: { name: string; url: string }[]): AdoRemote[] {
  const repos: AdoRemote[] = []
  for (const remote of remotes) {
    const ref = parseRemote(remote.url)
    if (ref?.provider !== 'azure-devops') continue
    repos.push({
      name: remote.name,
      target: { org: ref.org, project: ref.project, repo: ref.repo }
    })
  }
  return repos
}

/**
 * The repository the branch's commits are pushed to — the PR's source — named
 * by the branch's `branch.<name>.remote` config. A fork when the branch tracks
 * the fork. None when the branch tracks nothing or a remote not on Azure DevOps.
 */
export function sourceRemote(upstreamRemote: string | null, repos: AdoRemote[]): AdoRemote | null {
  if (upstreamRemote === null) return null
  return repos.find((repo) => repo.name === upstreamRemote) ?? null
}

/**
 * Where one thread goes (FPRA-11/13/18/19), by the rules T1 measured:
 * - `deleted` when ADO says so, or every comment is deleted (S9) — shown nowhere
 * - `system` when its first comment is a system one or it carries a
 *   `CodeReviewThreadType` property — Activity only
 * - `general` when it has no line to sit on — with its file's path when it is
 *   about a file as a whole ([owner 2026-10-10])
 * - `outdated` when ADO tracked it to an empty range although it started on a
 *   real one: its lines were deleted (S3)
 * - otherwise `placed` where ADO puts it for the latest iteration, on the right
 *   when it has a right position, on the left when it has only a left one.
 */
export function classifyThread(thread: AdoThread): PrThreadPlace {
  if (thread.isDeleted || thread.comments.every((c) => c.isDeleted)) return { kind: 'deleted' }
  if (thread.comments[0]?.commentType === 'system') return { kind: 'system' }
  if (thread.properties?.CodeReviewThreadType !== undefined) return { kind: 'system' }

  const context = thread.threadContext
  if (!context) return { kind: 'general' }
  const path = relative(context.filePath)

  if (context.rightFileStart) {
    const start = context.rightFileStart
    const end = context.rightFileEnd ?? start
    const tracking = thread.pullRequestThreadContext?.trackingCriteria
    if (tracking && isEmpty(start, end)) {
      const origStart = tracking.origRightFileStart
      const origEnd = tracking.origRightFileEnd ?? origStart
      if (origStart && origEnd && !isEmpty(origStart, origEnd)) {
        return { kind: 'outdated', path, line: origStart.line }
      }
    }
    return { kind: 'placed', path, side: 'right', startLine: start.line, endLine: end.line }
  }
  if (context.leftFileStart) {
    const start = context.leftFileStart
    const end = context.leftFileEnd ?? start
    return { kind: 'placed', path, side: 'left', startLine: start.line, endLine: end.line }
  }
  // A file-level thread has no line to be drawn under; the Overview lists it
  // as general, named by its file ([owner 2026-10-10]).
  return { kind: 'general', path }
}

/** A thread's comments minus the deleted ones, which carry no content (FPRA-21; T1, S9). */
export function visibleComments(thread: AdoThread): PrComment[] {
  return thread.comments
    .filter((c) => !c.isDeleted)
    .map((c) => ({
      id: c.id,
      author: c.author.displayName,
      content: c.content ?? '',
      at: Date.parse(c.publishedDate)
    }))
}

/**
 * The comment a reply to this thread answers (FPRA-25): the one with no
 * parent, else the lowest id. Read from every comment, deleted ones included,
 * because a deleted first comment is still the thread's root while the first
 * visible comment is then a reply ([owner 2026-10-10]).
 */
export function rootCommentId(thread: AdoThread): number {
  const root = thread.comments.find((c) => c.parentCommentId === 0)
  if (root) return root.id
  const ids = thread.comments.map((c) => c.id)
  return ids.length > 0 ? Math.min(...ids) : 0
}

/**
 * A modified-side selection as the anchor of a new thread (FPRA-27). Monaco's
 * columns are already ADO's offsets — 1-based UTF-16 characters, end
 * exclusive (T1, S1) — so they are copied across unchanged; only a selection
 * made bottom-up or right to left is turned around.
 */
export function anchorFromSelection(selection: PrSelection): Anchor {
  const forward =
    selection.startLine < selection.endLine ||
    (selection.startLine === selection.endLine && selection.startColumn <= selection.endColumn)
  return forward
    ? {
        path: selection.path,
        startLine: selection.startLine,
        startOffset: selection.startColumn,
        endLine: selection.endLine,
        endOffset: selection.endColumn
      }
    : {
        path: selection.path,
        startLine: selection.endLine,
        startOffset: selection.endColumn,
        endLine: selection.startLine,
        endOffset: selection.startColumn
      }
}

/** The iteration context of a thread started on the whole-PR view: the iteration with itself (T1, S2). */
export function iterationContextFor(latest: number): {
  firstComparingIteration: number
  secondComparingIteration: number
} {
  return { firstComparingIteration: latest, secondComparingIteration: latest }
}

function isEmpty(start: AdoPosition, end: AdoPosition): boolean {
  return start.line === end.line && start.offset === end.offset
}

function relative(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path
}

function statusOf(changeType: string): ChangeStatus {
  const kinds = changeType.split(',').map((kind) => kind.trim())
  if (kinds.includes('delete')) return 'deleted'
  if (kinds.includes('add')) return 'added'
  if (kinds.includes('rename')) return 'renamed'
  return 'modified'
}
