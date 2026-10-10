import type { PrFile, PrTarget, ReviewerState } from '../shared/files'
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
