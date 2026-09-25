import type {
  BaseOptions,
  ChangedPath,
  CommitPage,
  CommitRow,
  DiffRef,
  DiffRequest
} from '../../../shared/files'

/**
 * The two sides of one file's diff inside a commit's tab (FCMT-17/18).
 *
 * A commit is just a pair of revisions, which is why F2's viewer needs nothing
 * new: `parent` → `sha`. A root commit has no parent, so every original side
 * is empty and the tab reads as one long addition (FCMT-18).
 *
 * Pure.
 */
export function commitDiffRequest(
  sha: string,
  parent: string | null,
  changed: ChangedPath
): DiffRequest {
  return {
    original: originalRef(changed, parent),
    // A file the commit deleted has no version on the right (FDIF-04).
    modified: changed.status === 'deleted' ? null : { rev: sha, path: changed.path }
  }
}

/**
 * Where the earlier version of this file lives in the parent. A file the
 * commit created has none, and neither does anything in a root commit; a
 * rename's original is at the path it came from, which is the only place the
 * parent holds it (FDIF-05).
 */
function originalRef(changed: ChangedPath, parent: string | null): DiffRef | null {
  if (parent === null) return null
  if (changed.status === 'added' || changed.status === 'untracked') return null
  return { rev: parent, path: changed.oldPath ?? changed.path }
}

/**
 * What a commit's tab is called (FCMT-16): the short sha and the subject, so
 * two tabs of the same subject are still told apart. A commit with no subject
 * reads `(no subject)` rather than leaving the title trailing off.
 */
export function commitTabTitle(row: Pick<CommitRow, 'shortSha' | 'subject'>): string {
  const subject = row.subject.trim() === '' ? '(no subject)' : row.subject
  return `${row.shortSha} · ${subject}`
}

/**
 * The list after Load more (FCMT-09): the page just fetched appended below
 * what is already shown, in order.
 *
 * Cursor paging cannot hand back a row the list already holds, so dropping
 * duplicates is defensive — but the cheap defence is worth having, because the
 * alternative failure is two rows with the same key in one list.
 *
 * Pure.
 */
export function mergePages(current: readonly CommitRow[], next: readonly CommitRow[]): CommitRow[] {
  const seen = new Set(current.map((row) => row.sha))
  return [...current, ...next.filter((row) => !seen.has(row.sha))]
}

/**
 * The row that heads the list while the worktree is dirty (FCMT-14), or null
 * when it is clean and there is no such row. `n` is the changed-file count the
 * tree snapshot already carries, so this costs no git call.
 */
export function uncommittedRowLabel(n: number): string | null {
  return n > 0 ? `Uncommitted changes (${n})` : null
}

/** What the Commits list has to show right now (FCMT-07/10). */
export type CommitListState =
  | { kind: 'error'; message: string }
  | { kind: 'loading' }
  | { kind: 'no-base' }
  // The page travels with the state, so the caller that renders the list is
  // holding the one the guards above already proved is there.
  | { kind: 'list'; page: CommitPage }

/**
 * Which of its states the list is in, decided apart from the rendering so the
 * order of the guards can be tested (FCMT-07).
 *
 * The order carries the meaning. A repository whose branches could not be
 * listed shows git's line and never the base prompt (AD-032): there is nothing
 * to choose from, so inviting a choice would be a lie. Until `files:bases`
 * answers, neither is known, so the list waits rather than prompting for a base
 * the repository may already name through `origin/HEAD`. Only then, with no
 * base in hand, does the prompt of FCMT-07 apply.
 *
 * A page that came back with an error is git's line again; an empty list is a
 * list, not a failure, and the caller says the branch has none of its own
 * (FCMT-10).
 *
 * Pure.
 */
export function commitListState(
  bases: BaseOptions | null,
  base: string | undefined,
  page: CommitPage | null
): CommitListState {
  if (bases?.error) return { kind: 'error', message: bases.error }
  if (!bases) return { kind: 'loading' }
  if (base === undefined) return { kind: 'no-base' }
  if (!page) return { kind: 'loading' }
  if (page.error) return { kind: 'error', message: page.error }
  return { kind: 'list', page }
}

/** What a row's Open in browser looks like (FCMT-23/25/26). */
export type BrowseState = 'hidden' | 'disabled' | 'enabled'

/**
 * Whether a row offers Open in browser, and whether it is usable.
 *
 * Hidden and disabled say different things and are not interchangeable: with
 * no upstream or an unrecognized host there is nothing to disable *toward*, so
 * the action is absent; a commit that simply has not been pushed gets a
 * disabled button that can explain itself (F3-Q10).
 */
export function browseState(
  row: Pick<CommitRow, 'pushed'>,
  page: Pick<CommitPage, 'browse'>
): BrowseState {
  if (page.browse === null) return 'hidden'
  return row.pushed ? 'enabled' : 'disabled'
}
