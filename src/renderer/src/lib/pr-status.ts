import type {
  PrProvider,
  PrSearch,
  PrSummary,
  Reviewer,
  ReviewerState
} from '../../../shared/files'
import { prKey } from './pr-view'
import { PROVIDERS, failureText, providerName, type PrRead, type PrSearches } from './pr-lookup'

/**
 * Pure decisions behind the status bar's pull request chip (F6): the review
 * mark a pull request earns and the lines its tooltip lists.
 */

/** How each reviewer state reads, in the Overview and in the chip's tooltip. */
export const REVIEWER_STATES: Record<ReviewerState, string> = {
  approved: 'Approved',
  'approved-with-suggestions': 'Approved with suggestions',
  'no-vote': 'No vote',
  'waiting-for-author': 'Waiting for author',
  rejected: 'Rejected',
  'changes-requested': 'Changes requested',
  commented: 'Commented',
  dismissed: 'Dismissed'
}

/** The chip's review mark: ✕, ⏸ and ✓ (SPRL-04..06). */
export type ReviewMark = 'rejected' | 'changes' | 'approved'

/** What each state adds to the mark; a comment, a dismissal or no vote adds nothing (SPRL-07). */
const MARK_OF: Record<ReviewerState, ReviewMark | null> = {
  rejected: 'rejected',
  'waiting-for-author': 'changes',
  'changes-requested': 'changes',
  approved: 'approved',
  'approved-with-suggestions': 'approved',
  'no-vote': null,
  commented: null,
  dismissed: null
}

/** Worst first. */
const MARK_ORDER: readonly ReviewMark[] = ['rejected', 'changes', 'approved']

/**
 * The worst mark any reviewer earns (SPRL-04..07): a single rejection is never
 * hidden behind an approval. A group or a required reviewer weighs like
 * anyone else — the required-reviewer policy is out of scope.
 */
export function reviewMark(reviewers: Reviewer[]): ReviewMark | null {
  const marks = new Set(reviewers.map((reviewer) => MARK_OF[reviewer.state]))
  return MARK_ORDER.find((mark) => marks.has(mark)) ?? null
}

/** One tooltip line per reviewer, in the provider's order (SPRL-08). */
export function reviewLines(reviewers: Reviewer[]): string[] {
  return reviewers.map((reviewer) => `${reviewer.name}: ${REVIEWER_STATES[reviewer.state]}`)
}

/** What the chip can say about one pull request's reviews. */
export type PrReview =
  | { kind: 'read'; mark: ReviewMark | null; lines: string[] }
  /** The search found it, its detail did not come (edge case). */
  | { kind: 'failed'; reason: string }
  /** Not read yet: the chip says nothing about reviews. */
  | { kind: 'pending' }

export interface PrChipItem {
  pr: PrSummary
  review: PrReview
}

/** Everything the status bar shows for a worktree's pull requests (SPRL-03, 12, 15..19). */
export type PrChip =
  /** `notes`: another provider's failure, said only beside the PR (SPRL-19). */
  | { kind: 'one'; item: PrChipItem; notes: string[] }
  | { kind: 'many'; items: PrChipItem[]; notes: string[] }
  | { kind: 'create'; provider: PrProvider }
  | { kind: 'unknown'; reason: string }
  | { kind: 'hidden' }

/**
 * What the chip shows, from each provider's search and the reads of the pull
 * requests it found. A found pull request wins over any failure (SPRL-19); a
 * failure with nothing found wins over Create PR (SPRL-17); a search that has
 * not answered yet shows nothing, never a "no PR" (SPRL-09).
 */
export function prChip(searches: PrSearches, reads: Record<string, PrRead>): PrChip {
  const items: PrChipItem[] = []
  const notes: string[] = []
  let create: PrProvider | null = null
  for (const provider of PROVIDERS) {
    const search = searches[provider]
    if (search === undefined) continue
    if (search.kind === 'found') {
      for (const pr of search.prs) items.push({ pr, review: reviewOf(reads[prKey(pr)]) })
    }
    const note = noteOf(provider, search)
    if (note !== null) notes.push(note)
    if (search.kind === 'none' && search.createUrlAvailable && create === null) create = provider
  }
  if (items.length === 1) return { kind: 'one', item: items[0], notes }
  if (items.length > 1) return { kind: 'many', items, notes }
  if (notes.length > 0) return { kind: 'unknown', reason: notes.join('\n') }
  if (create !== null) return { kind: 'create', provider: create }
  return { kind: 'hidden' }
}

function reviewOf(read: PrRead | undefined): PrReview {
  if (read?.failure) {
    return {
      kind: 'failed',
      reason: `The reviewers could not be read: ${failureText(read.failure)}`
    }
  }
  if (read?.detail) {
    const reviewers = read.detail.reviewers
    return { kind: 'read', mark: reviewMark(reviewers), lines: reviewLines(reviewers) }
  }
  return { kind: 'pending' }
}

/** A provider's failure in words, naming the provider; null when the search did not fail. */
function noteOf(provider: PrProvider, search: PrSearch): string | null {
  switch (search.kind) {
    case 'auth':
    case 'rate-limited':
      return failureText({ ...search, provider })
    case 'error':
      return `${providerName(provider)}: ${search.message}`
    default:
      return null
  }
}
