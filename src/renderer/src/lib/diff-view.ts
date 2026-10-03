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

/**
 * What a diff request reads, as one string (FWIG-24, FWIG-26). The list is
 * re-read on every batch and each re-read builds new request objects, so an
 * All changes section compares this key, not the object: two requests reading
 * the same sides have the same key, and a change of status that changes a
 * side, of path, of a rename's old path or of the merge base changes it. A
 * status change that leaves the sides alone (untracked to added) keeps the
 * key; the `git add` behind it moves the index, which re-reads every section
 * anyway (FWIG-27).
 */
export function requestKey(request: DiffRequest | null): string {
  if (request === null) return '-'
  return `${sideKey(request.original)}\u0000${sideKey(request.modified)}`
}

function sideKey(side: DiffRef | null): string {
  if (side === null) return 'none'
  return 'disk' in side ? `disk:${side.path}` : `rev:${side.rev}:${side.path}`
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

/**
 * The strip settings of every diff (FDIF-13). `DiffViewer` hands these to
 * Monaco's `hideUnchangedRegions`, and `unchangedRegions` computes with them,
 * so the app's rule and the editor's cannot drift (FOLD-10).
 */
export const UNCHANGED_REGIONS = {
  contextLineCount: 3,
  minimumLineCount: 3,
  revealLineCount: 20
} as const

/** A run of lines, `start` included and `end` excluded, both 1-based. */
export interface LineSpan {
  start: number
  end: number
}

/** One unchanged region: the same lines on the left side and on the right. */
export interface Region {
  original: LineSpan
  modified: LineSpan
}

/**
 * One entry of Monaco's `getLineChanges()`. An insertion reports its original
 * end as 0 and a deletion its modified end as 0, each start then naming the
 * line before the change.
 */
export interface LineChangeLike {
  originalStartLineNumber: number
  originalEndLineNumber: number
  modifiedStartLineNumber: number
  modifiedEndLineNumber: number
}

/** A change's range on one side, `[start, end)`; empty for the side it does not touch. */
function changeSpan(start: number, end: number): LineSpan {
  return end === 0 ? { start: start + 1, end: start + 1 } : { start, end: end + 1 }
}

/**
 * The unchanged regions Monaco folds into strips, with their lines on both
 * sides. Mirrors `UnchangedRegion.fromDiffs` in monaco-editor 0.56.0: every run
 * between two changes keeps `contextLineCount` lines on each side and folds
 * only when at least `minimumLineCount` remain; a run at the start or the end
 * of the file keeps context on its changed side only. `originalLines` and
 * `modifiedLines` are the models' line counts, one more than the file's lines
 * when it ends in a newline.
 */
export function unchangedRegions(
  changes: readonly LineChangeLike[],
  originalLines: number,
  modifiedLines: number
): Region[] {
  const { contextLineCount: context, minimumLineCount: minimum } = UNCHANGED_REGIONS
  const runs: { original: number; modified: number; length: number }[] = []
  const addRun = (original: LineSpan, modified: LineSpan): void => {
    if (modified.end > modified.start) {
      runs.push({
        original: original.start,
        modified: modified.start,
        length: original.end - original.start
      })
    }
  }

  let original = 1
  let modified = 1
  for (const change of changes) {
    const left = changeSpan(change.originalStartLineNumber, change.originalEndLineNumber)
    const right = changeSpan(change.modifiedStartLineNumber, change.modifiedEndLineNumber)
    addRun({ start: original, end: left.start }, { start: modified, end: right.start })
    original = left.end
    modified = right.end
  }
  addRun({ start: original, end: originalLines + 1 }, { start: modified, end: modifiedLines + 1 })

  const regions: Region[] = []
  for (const run of runs) {
    let { original: left, modified: right, length } = run
    const atStart = left === 1 && right === 1
    const atEnd = left + length === originalLines + 1 && right + length === modifiedLines + 1
    if ((atStart || atEnd) && length >= context + minimum) {
      if (atStart && !atEnd) length -= context
      if (atEnd && !atStart) {
        left += context
        right += context
        length -= context
      }
    } else if (length >= context * 2 + minimum) {
      left += context
      right += context
      length -= context * 2
    } else {
      continue
    }
    regions.push({
      original: { start: left, end: left + length },
      modified: { start: right, end: right + length }
    })
  }
  return regions
}

/**
 * The hidden right-side ranges in the `modelState` of a diff editor's saved
 * view state, one per unchanged region; `null` for any other shape (FOLD-25).
 * The shape is internal to monaco-editor 0.56.0 (`serializeState`), so it is
 * checked whole: one entry out of shape and nothing is trusted.
 */
export function hiddenRangesOf(modelState: unknown): LineSpan[] | null {
  if (typeof modelState !== 'object' || modelState === null) return null
  const regions = (modelState as { collapsedRegions?: unknown }).collapsedRegions
  if (!Array.isArray(regions)) return null
  const spans: LineSpan[] = []
  for (const entry of regions) {
    const range = (entry as { range?: unknown } | null)?.range
    if (
      !Array.isArray(range) ||
      range.length !== 2 ||
      typeof range[0] !== 'number' ||
      typeof range[1] !== 'number'
    ) {
      return null
    }
    spans.push({ start: range[0], end: range[1] })
  }
  return spans
}

/** How much of one unchanged region is revealed above and below its strip. */
export interface RegionState {
  region: Region
  revealedTop: number
  revealedBottom: number
}

/**
 * Each region's fold state, from the hidden ranges `hiddenRangesOf` read:
 * folded is 0 / 0, revealed whole is a top and bottom that add up to its
 * length. A hidden range belongs to the region whose right side holds it; a
 * region with none listed reads folded, which is how Monaco starts one.
 */
export function regionStates(
  regions: readonly Region[],
  hidden: readonly LineSpan[]
): RegionState[] {
  return regions.map((region) => {
    const { start, end } = region.modified
    const inside = hidden.filter((span) => span.start >= start && span.end <= end)
    if (inside.length === 0) return { region, revealedTop: 0, revealedBottom: 0 }
    const first = Math.min(...inside.map((span) => span.start))
    const last = Math.max(...inside.map((span) => span.end))
    return { region, revealedTop: first - start, revealedBottom: end - last }
  })
}

/** The Hide unchanged / Show unchanged choice a tab last made, if any. */
export type UnchangedMode = 'hide' | 'show'

const lengthOf = (span: LineSpan): number => span.end - span.start
const overlaps = (a: LineSpan, b: LineSpan): boolean =>
  Math.max(a.start, b.start) < Math.min(a.end, b.end)

/** The span that folds a region whole. */
const foldWhole = (region: Region): LineSpan => ({ ...region.modified })
/** The empty span that reveals a region whole. */
const revealWhole = (region: Region): LineSpan => ({
  start: region.modified.start,
  end: region.modified.start
})

/**
 * Every region folded, or every region revealed (FOLD-12, FOLD-13, FOLD-14):
 * one span per region, in order, for `applyFolds` to hand to Monaco.
 */
export function choicePlan(next: readonly Region[], choice: UnchangedMode): LineSpan[] {
  return next.map(choice === 'show' ? revealWhole : foldWhole)
}

/**
 * The folds of a diff after its text changed, from the region states read
 * before the change. A region is the same region when it shares a left-side
 * line with one from before: the left side is the committed text, which an
 * agent's writes do not move. Then it keeps that region's fold (FOLD-02), its
 * whole reveal (FOLD-03) or its lines revealed above and below the strip,
 * clamped to its new size (FOLD-05); grown from several, it is revealed when
 * any of them was revealed whole (FOLD-06). A region new after the change is
 * folded, or revealed while Show unchanged is the tab's choice (FOLD-04,
 * FOLD-15). With no earlier state, or a left side that changed too, every
 * region starts as in a newly opened diff (FOLD-07, FOLD-26).
 */
export function foldPlan(
  previous: readonly RegionState[] | null,
  next: readonly Region[],
  choice: UnchangedMode | null,
  leftChanged: boolean
): LineSpan[] {
  const fresh = choice === 'show' ? revealWhole : foldWhole
  if (previous === null || leftChanged) return next.map(fresh)
  return next.map((region) => {
    const sources = previous.filter((state) => overlaps(state.region.original, region.original))
    if (sources.length === 0) return fresh(region)
    const wholeReveal = (state: RegionState): boolean =>
      state.revealedTop + state.revealedBottom >= lengthOf(state.region.modified)
    if (sources.length > 1) {
      return sources.some(wholeReveal) ? revealWhole(region) : foldWhole(region)
    }
    const [source] = sources
    if (wholeReveal(source)) return revealWhole(region)
    const length = lengthOf(region.modified)
    const top = Math.min(source.revealedTop, length)
    const bottom = Math.min(source.revealedBottom, length - top)
    return { start: region.modified.start + top, end: region.modified.end - bottom }
  })
}

/**
 * The fold states read just before new text goes in, until Monaco has
 * recomputed the diff for it, and the left side's text at that moment.
 * `states` null means a Hide / Show press came meanwhile, so the new diff takes
 * the tab's choice instead.
 */
export interface FoldReading {
  states: RegionState[] | null
  left: string
}

/**
 * The reading an update keeps. One still pending is kept whatever arrives
 * next, since the diff it waits for has not been computed (FOLD-08). No reading
 * is taken before a first diff exists, nor when the saved state is out of shape,
 * and then the update runs as Monaco would (FOLD-25).
 */
export function readingBeforeUpdate(
  pending: FoldReading | null,
  regions: readonly Region[] | null,
  modelState: unknown,
  left: string
): FoldReading | null {
  if (pending !== null) return pending
  const hidden = hiddenRangesOf(modelState)
  if (regions === null || hidden === null) return null
  return { states: regionStates(regions, hidden), left }
}
