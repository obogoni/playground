import type {
  ChangedPath,
  DiffRef,
  DiffRequest,
  Eol,
  FileStat,
  FilesMode
} from '../../../shared/files'

/**
 * The two lenses that open a diff (FDIF-01/02). Full-folder mode is not one of
 * them: it lists files that nothing changed, so there is no second side to
 * compare against. Neither is Commits mode: its left column lists commits
 * rather than paths, and a commit's diffs are built from a sha (FCMT-17), not
 * from the mode.
 */
export type DiffMode = Exclude<FilesMode, 'full' | 'commits'>

/**
 * Which revision or working copy each side of a diff comes from (FDIF-01..05),
 * in one place, so the tree, the tab strip and the All changes stack all ask
 * the same question the same way.
 *
 * `mergeBase` is the resolved `merge-base(HEAD, base)` diff-to-origin compares
 * against; `null` means the base no longer resolves, and there is no diff to
 * build — F1's base prompt takes the tab's place rather than a stale diff
 * (edge case, FXPL-11). Uncommitted mode never reads it.
 */
export function diffRequestFor(
  mode: DiffMode,
  changed: ChangedPath,
  mergeBase: string | null
): DiffRequest | null {
  if (mode === 'since-base') {
    if (mergeBase === null) return null
    return {
      original: originalRef(changed, mergeBase),
      modified: modifiedExists(changed) ? { rev: 'HEAD', path: changed.path } : null
    }
  }
  return {
    original: originalRef(changed, 'HEAD'),
    modified: modifiedExists(changed) ? { disk: true, path: changed.path } : null
  }
}

/**
 * Where the earlier version of this file lives, at `rev`. A file the change
 * created has none (FDIF-03); a rename's is at the path it came from
 * (FDIF-05), which is the only place that revision holds it.
 */
function originalRef(changed: ChangedPath, rev: string): DiffRef | null {
  if (changed.status === 'added' || changed.status === 'untracked') return null
  return { rev, path: changed.oldPath ?? changed.path }
}

/** A deleted file has no current version to put on the right (FDIF-04). */
function modifiedExists(changed: ChangedPath): boolean {
  return changed.status !== 'deleted'
}

/** What the tab strip can hold, as far as identity goes (FDIF-08, FDIF-17, FCMT-20). */
export type TabRef =
  | { kind: 'file'; path: string }
  | { kind: 'diff'; mode: DiffMode; path: string }
  | { kind: 'all-changes' }
  | { kind: 'commit'; sha: string }

/** The key of the fixed first tab of both diff modes (FDIF-17). */
export const ALL_CHANGES_KEY = 'all-changes'

/** One instance, so re-deriving the strip does not remount the stack. */
const ALL_CHANGES_TAB: TabRef = { kind: 'all-changes' }

/**
 * What identifies a tab (FDIF-08, FCMT-20). A diff of one path is a different
 * tab in each mode, and both are different from a file tab for that same path:
 * the kind and, for a diff, the mode are part of the key, not just the path. A
 * commit tab is keyed by its sha, so the same commit opens once however many
 * times it is clicked, and an amend — a new sha — is a different tab.
 */
export function tabKeyOf(tab: TabRef): string {
  if (tab.kind === 'all-changes') return ALL_CHANGES_KEY
  if (tab.kind === 'commit') return `commit:${tab.sha}`
  return tab.kind === 'file' ? `file:${tab.path}` : `diff:${tab.mode}:${tab.path}`
}

/** Whether two tabs are the same tab, by the identity `tabKeyOf` defines. */
export function isSameTab(a: TabRef, b: TabRef): boolean {
  return tabKeyOf(a) === tabKeyOf(b)
}

/**
 * The tab strip for the mode currently shown: All changes first in both diff
 * modes (FDIF-17), absent in full-folder mode (FDIF-18), and never twice. The
 * All changes tab is derived from the mode rather than stored, which is what
 * lets it follow a mode switch while every diff tab beside it keeps comparing
 * what it was opened on (FDIF-09).
 */
export function tabsWithAllChanges<T extends TabRef>(
  tabs: readonly T[],
  mode: FilesMode
): (T | TabRef)[] {
  const rest = tabs.filter((tab) => tab.kind !== 'all-changes')
  // Commits mode has no "every change of this mode" to offer: its list is of
  // commits, and each commit's own stack is its tab (FCMT-16).
  const stacked = mode !== 'full' && mode !== 'commits'
  return stacked ? [ALL_CHANGES_TAB, ...rest] : rest
}

/** How many sections of the All changes stack start expanded (FDIF-21). */
const INITIALLY_EXPANDED = 10

/**
 * Which sections of the All changes stack start open (FDIF-21): the first ten
 * of the mode's list, in the tree order the stack renders them in, and all of
 * them when the list is shorter. Ten expanded sections is already more than a
 * screen, and a branch of two hundred files must not mount two hundred editors.
 */
export function initialExpansion(files: readonly FileStat[]): Set<string> {
  return new Set(files.slice(0, INITIALLY_EXPANDED).map((file) => file.path))
}

/**
 * The stack header (FDIF-20): how many files changed, and how many lines the
 * whole set added and removed.
 *
 * A file git reported no line counts for is counted as a file and nothing else.
 * That is every file with `binary` set, which also covers an untracked file too
 * large to read: `diffStats` marks it the same way, because there are no lines
 * anyone is willing to count, and a `+0 −0` in the header would be a claim
 * about content nobody looked at.
 */
export function totals(files: readonly FileStat[]): {
  files: number
  added: number
  removed: number
} {
  let added = 0
  let removed = 0
  for (const file of files) {
    if (file.uncountable) continue
    added += file.added
    removed += file.removed
  }
  return { files: files.length, added, removed }
}

/** One file of the All changes stack, as next / previous change sees it. */
export interface ChangeSection {
  /** The file's path, which is the section's identity in the stack. */
  path: string
  /** The modified-side lines the diff reports as changed, ascending. */
  changes: number[]
  expanded: boolean
}

/** Where the reader is: which section, and which line inside it. */
export interface ChangePosition {
  path: string
  line: number
}

/** Where next or previous change lands (FDIF-25/26). */
export interface ChangeTarget {
  path: string
  line: number
  /** The section is collapsed, so it has to be opened before the line shows. */
  expand: boolean
}

/**
 * Where next or previous change goes (FDIF-25/26). Inside the current file it
 * is the nearest change past the cursor; once there is none, it is the first
 * change of the next file that has one, which the All changes tab expands on
 * the way in (FDIF-26). Past the last change of the last file there is nowhere
 * to go, and the position stays where it is.
 *
 * A file whose sides are identical contributes no changes, so navigation walks
 * over it rather than landing on a section with nothing to show.
 *
 * `sections` is the whole stack in the order it renders. A single diff tab is
 * the one-section case, and there `null` means the file's own last change
 * (FDIF-25) rather than the end of a stack.
 */
export function nextChangeTarget(
  position: ChangePosition,
  sections: readonly ChangeSection[],
  direction: 'next' | 'previous'
): ChangeTarget | null {
  const at = sections.findIndex((section) => section.path === position.path)
  if (at === -1) return null
  const forward = direction === 'next'
  const here = sections[at].changes
  const inside = forward
    ? here.find((line) => line > position.line)
    : here.filter((line) => line < position.line).pop()
  if (inside !== undefined) return targetIn(sections[at], inside)
  const step = forward ? 1 : -1
  for (let i = at + step; i >= 0 && i < sections.length; i += step) {
    const section = sections[i]
    if (section.changes.length === 0) continue
    const edge = forward ? section.changes[0] : section.changes[section.changes.length - 1]
    return targetIn(section, edge)
  }
  return null
}

function targetIn(section: ChangeSection, line: number): ChangeTarget {
  return { path: section.path, line, expand: !section.expanded }
}

/**
 * The strip above a diff naming a line-ending change and how many lines it
 * touched (FDIF-15). Null when no line changed ending: there is nothing to say.
 *
 * `from` and `to` are each side's *dominant* terminator, so they can be equal
 * while lines are reported — a file of 715 LF lines and 4 CRLF ones, flipped to
 * pure LF, is `LF` on both sides with 4 lines changed (T3). `CRLF → LF on 4
 * lines` would be false there, and the per-line terminators needed to word it
 * exactly are not what the strip has. So the arrow is used only when the two
 * dominant endings actually differ, which is the whole-file flip; anything else
 * names the count without claiming a direction. Either way the markers on the
 * lines themselves say where.
 */
export function eolStripText(lines: readonly number[], from?: Eol, to?: Eol): string | null {
  if (lines.length === 0) return null
  const count = `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`
  if (from !== undefined && to !== undefined && from !== to) return `${from} → ${to} on ${count}`
  return `Line endings changed on ${count}`
}

/** How many diff editors the All changes stack keeps alive at once (D1). */
const LIVE_EDITOR_CAP = 12

/** One section of the stack, as the mount plan sees it. */
export interface StackSection {
  path: string
  expanded: boolean
}

/**
 * Which sections get a diff editor and which lose theirs (FDIF-22, D1).
 *
 * A section is mounted when it is expanded and in view, and never while it is
 * collapsed — that is the cheap half of not mounting two hundred editors on a
 * two-hundred-file branch. The other half is the cap: once more sections are
 * live than the cap allows, the ones farthest from the viewport are dropped
 * first, measured in stack positions from the visible range. A section that has
 * left the list entirely, because its file was just committed, is dropped too.
 *
 * `sections` is the whole stack in render order; `visible` the sections an
 * observer reports in or near the viewport; `mounted` the ones that already
 * hold an editor.
 */
export function mountPlan(
  sections: readonly StackSection[],
  visible: readonly string[],
  mounted: readonly string[],
  cap = LIVE_EDITOR_CAP
): { mount: string[]; unmount: string[] } {
  const order = new Map(sections.map((section, index) => [section.path, index]))
  const open = new Set(sections.filter((section) => section.expanded).map((s) => s.path))

  const live = mounted.filter((path) => open.has(path))
  for (const path of visible) {
    if (open.has(path) && !live.includes(path)) live.push(path)
  }

  const inView = visible
    .map((path) => order.get(path))
    .filter((index): index is number => index !== undefined)
  const low = inView.length > 0 ? Math.min(...inView) : 0
  const high = inView.length > 0 ? Math.max(...inView) : 0
  const distance = (path: string): number => {
    const index = order.get(path) ?? 0
    if (index < low) return low - index
    return index > high ? index - high : 0
  }

  const keep = [...live]
    .sort((a, b) => distance(a) - distance(b) || (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .slice(0, cap)

  return {
    mount: keep.filter((path) => !mounted.includes(path)),
    unmount: mounted.filter((path) => !keep.includes(path))
  }
}
