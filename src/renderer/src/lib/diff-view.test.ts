import { describe, expect, it } from 'vitest'
import type { ChangedPath, FileStat } from '../../../shared/files'
import {
  ALL_CHANGES_KEY,
  choicePlan,
  diffRequestFor,
  eolStripText,
  foldPlan,
  hiddenRangesOf,
  initialExpansion,
  isSameTab,
  mountPlan,
  nextChangeTarget,
  readingBeforeUpdate,
  regionStates,
  tabKeyOf,
  tabsWithAllChanges,
  totals,
  UNCHANGED_REGIONS,
  unchangedRegions,
  type ChangeSection,
  type FoldReading,
  type LineChangeLike,
  type Region,
  type RegionState,
  type DiffMode,
  type StackSection,
  type TabRef
} from './diff-view'

function changed(path: string, status: ChangedPath['status'], oldPath?: string): ChangedPath {
  return { path, status, ...(oldPath ? { oldPath } : {}) }
}

function fileTab(path: string): TabRef {
  return { kind: 'file', path }
}

function diffTab(mode: DiffMode, path: string): TabRef {
  return { kind: 'diff', mode, path }
}

describe('diffRequestFor', () => {
  it('compares the merge base with HEAD in diff-to-origin mode (FDIF-01)', () => {
    const request = diffRequestFor('since-base', changed('src/app.ts', 'modified'), 'abc1234')

    expect(request).toEqual({
      original: { rev: 'abc1234', path: 'src/app.ts' },
      modified: { rev: 'HEAD', path: 'src/app.ts' }
    })
  })

  it('compares HEAD with the disk in uncommitted mode (FDIF-02)', () => {
    const request = diffRequestFor('uncommitted', changed('src/app.ts', 'modified'), 'abc1234')

    expect(request).toEqual({
      original: { rev: 'HEAD', path: 'src/app.ts' },
      modified: { disk: true, path: 'src/app.ts' }
    })
  })

  it('leaves the original side out for an added or untracked file (FDIF-03)', () => {
    const added = diffRequestFor('since-base', changed('src/new.ts', 'added'), 'abc1234')
    const untracked = diffRequestFor('uncommitted', changed('src/new.ts', 'untracked'), 'abc1234')

    expect(added).toEqual({ original: null, modified: { rev: 'HEAD', path: 'src/new.ts' } })
    expect(untracked).toEqual({ original: null, modified: { disk: true, path: 'src/new.ts' } })
  })

  it('leaves the modified side out for a deleted file (FDIF-04)', () => {
    const request = diffRequestFor('uncommitted', changed('src/gone.ts', 'deleted'), 'abc1234')

    expect(request).toEqual({ original: { rev: 'HEAD', path: 'src/gone.ts' }, modified: null })
  })

  it('reads a rename original from its previous path (FDIF-05)', () => {
    const request = diffRequestFor(
      'since-base',
      changed('src/widget.ts', 'renamed', 'src/gadget.ts'),
      'abc1234'
    )

    expect(request).toEqual({
      original: { rev: 'abc1234', path: 'src/gadget.ts' },
      modified: { rev: 'HEAD', path: 'src/widget.ts' }
    })
  })

  it('has no diff to build when the base no longer resolves (edge case, FXPL-11)', () => {
    // The base prompt takes the place of a stale diff, so there is no request.
    expect(diffRequestFor('since-base', changed('src/app.ts', 'modified'), null)).toBeNull()
  })
})

describe('tabKeyOf', () => {
  it('keys a diff tab by its mode and path, apart from a file tab (FDIF-08)', () => {
    const keys = [
      tabKeyOf(diffTab('since-base', 'src/app.ts')),
      tabKeyOf(diffTab('uncommitted', 'src/app.ts')),
      tabKeyOf(fileTab('src/app.ts'))
    ]

    expect(new Set(keys).size).toBe(3)
  })

  it('gives All changes a key no file or diff tab can produce (FDIF-17)', () => {
    const allChanges = tabKeyOf({ kind: 'all-changes' })

    // The strip and `tabsAfterClose` recognise the fixed tab by this key, so a
    // file that happens to be named like it must not answer to it.
    expect(allChanges).toBe(ALL_CHANGES_KEY)
    expect(tabKeyOf(fileTab('all-changes'))).not.toBe(allChanges)
    expect(tabKeyOf(diffTab('uncommitted', 'all-changes'))).not.toBe(allChanges)
  })
})

describe('isSameTab', () => {
  it('matches a diff tab only in the mode it was opened in (FDIF-08, FDIF-09)', () => {
    const open = diffTab('since-base', 'src/app.ts')

    expect(isSameTab(open, diffTab('since-base', 'src/app.ts'))).toBe(true)
    expect(isSameTab(open, diffTab('uncommitted', 'src/app.ts'))).toBe(false)
    expect(isSameTab(open, fileTab('src/app.ts'))).toBe(false)
  })
})

describe('tabsWithAllChanges', () => {
  const open = [fileTab('src/app.ts'), diffTab('uncommitted', 'src/lib/util.ts')]

  it('puts All changes first in both diff modes (FDIF-17)', () => {
    for (const mode of ['since-base', 'uncommitted'] as const) {
      const tabs = tabsWithAllChanges(open, mode)

      expect(tabs.map(tabKeyOf)).toEqual([
        ALL_CHANGES_KEY,
        'file:src/app.ts',
        'diff:uncommitted:src/lib/util.ts'
      ])
    }
  })

  it('drops All changes in full-folder mode (FDIF-18)', () => {
    const tabs = tabsWithAllChanges([{ kind: 'all-changes' }, ...open], 'full')

    expect(tabs.map(tabKeyOf)).toEqual(['file:src/app.ts', 'diff:uncommitted:src/lib/util.ts'])
  })

  it('never shows All changes twice (FDIF-17)', () => {
    const tabs = tabsWithAllChanges([{ kind: 'all-changes' }, ...open], 'since-base')

    expect(tabs.filter((tab) => tab.kind === 'all-changes')).toHaveLength(1)
    expect(tabKeyOf(tabs[0])).toBe(ALL_CHANGES_KEY)
  })

  it('leaves a diff tab comparing what it compared when the mode changes (FDIF-09)', () => {
    const tabs = tabsWithAllChanges([diffTab('since-base', 'src/app.ts')], 'uncommitted')

    expect(tabs.map(tabKeyOf)).toEqual([ALL_CHANGES_KEY, 'diff:since-base:src/app.ts'])
  })
})

function stat(
  path: string,
  added = 0,
  removed = 0,
  uncountable?: 'binary' | 'too-large'
): FileStat {
  return { path, added, removed, ...(uncountable ? { uncountable } : {}) }
}

function stats(count: number): FileStat[] {
  return Array.from({ length: count }, (_, i) => stat(`src/file-${i + 1}.ts`, 1, 1))
}

describe('initialExpansion', () => {
  it('starts only the first 10 of 40 sections expanded, in tree order (FDIF-21)', () => {
    const expanded = initialExpansion(stats(40))

    expect([...expanded]).toEqual(
      stats(40)
        .slice(0, 10)
        .map((file) => file.path)
    )
    expect(expanded.has('src/file-11.ts')).toBe(false)
  })

  it('starts every section expanded when the list is 10 or shorter (FDIF-21)', () => {
    expect(initialExpansion(stats(7)).size).toBe(7)
    expect(initialExpansion(stats(10)).size).toBe(10)
  })
})

describe('totals', () => {
  it('counts the files and sums the added and removed lines (FDIF-20)', () => {
    const changed = [stat('src/app.ts', 12, 3), stat('src/lib/util.ts', 4, 40)]

    expect(totals(changed)).toEqual({ files: 2, added: 16, removed: 43 })
  })

  it('counts a file with no countable lines as a file and nothing else (FDIF-20)', () => {
    // `uncountable` is set whenever there were no line counts to take, so the
    // numbers beside it describe nothing and must not reach the header. Both
    // reasons behave the same here, and a file past the view cap is not binary.
    const changed = [
      stat('src/app.ts', 12, 3),
      stat('assets/logo.png', 99, 99, 'binary'),
      stat('data/dump.txt', 77, 77, 'too-large')
    ]

    expect(totals(changed)).toEqual({ files: 3, added: 12, removed: 3 })
  })
})

describe('nextChangeTarget', () => {
  const stack: ChangeSection[] = [
    { path: 'src/a.ts', changes: [4, 12, 20], expanded: true },
    { path: 'src/c.ts', changes: [7, 30], expanded: false }
  ]
  const withIdentical: ChangeSection[] = [
    stack[0],
    { path: 'src/b.ts', changes: [], expanded: true },
    stack[1]
  ]

  it('moves to the nearest change after the cursor in the same file (FDIF-25)', () => {
    expect(nextChangeTarget({ path: 'src/a.ts', line: 4 }, stack, 'next')).toEqual({
      path: 'src/a.ts',
      line: 12,
      expand: false
    })
  })

  it('moves to the nearest change before the cursor in the same file (FDIF-25)', () => {
    expect(nextChangeTarget({ path: 'src/a.ts', line: 20 }, stack, 'previous')).toEqual({
      path: 'src/a.ts',
      line: 12,
      expand: false
    })
  })

  it('enters the next file past the last change, expanding it (FDIF-26)', () => {
    expect(nextChangeTarget({ path: 'src/a.ts', line: 20 }, stack, 'next')).toEqual({
      path: 'src/c.ts',
      line: 7,
      expand: true
    })
  })

  it('goes back to the previous file before the first change (FDIF-26)', () => {
    expect(nextChangeTarget({ path: 'src/c.ts', line: 7 }, stack, 'previous')).toEqual({
      path: 'src/a.ts',
      line: 20,
      expand: false
    })
  })

  it('stays put at either end of the stack (FDIF-26)', () => {
    expect(nextChangeTarget({ path: 'src/c.ts', line: 30 }, stack, 'next')).toBeNull()
    expect(nextChangeTarget({ path: 'src/a.ts', line: 4 }, stack, 'previous')).toBeNull()
  })

  it('walks over a file whose sides are identical (edge case)', () => {
    expect(nextChangeTarget({ path: 'src/a.ts', line: 20 }, withIdentical, 'next')).toEqual({
      path: 'src/c.ts',
      line: 7,
      expand: true
    })
    expect(nextChangeTarget({ path: 'src/c.ts', line: 7 }, withIdentical, 'previous')).toEqual({
      path: 'src/a.ts',
      line: 20,
      expand: false
    })
  })
})

describe('eolStripText', () => {
  it('names the change and its line count, the spec example (FDIF-15)', () => {
    const lines = Array.from({ length: 12 }, (_, i) => i + 1)

    expect(eolStripText(lines, 'CRLF', 'LF')).toBe('CRLF → LF on 12 lines')
  })

  it('counts a single line in the singular (FDIF-15)', () => {
    expect(eolStripText([7], 'CRLF', 'LF')).toBe('CRLF → LF on 1 line')
  })

  it('claims no direction when the dominant endings do not differ (FDIF-15)', () => {
    // 715 LF lines and 4 CRLF ones flipped to pure LF: both sides are dominantly
    // LF, and `CRLF → LF on 4 lines` would be a claim the data does not carry.
    expect(eolStripText([100, 200, 300, 400], 'LF', 'LF')).toBe('Line endings changed on 4 lines')
    expect(eolStripText([100, 200, 300, 400], undefined, 'LF')).toBe(
      'Line endings changed on 4 lines'
    )
  })

  it('says nothing when no line changed ending (FDIF-15)', () => {
    expect(eolStripText([], 'CRLF', 'LF')).toBeNull()
  })
})

describe('mountPlan', () => {
  const stack = (count: number, collapsed: string[] = []): StackSection[] =>
    Array.from({ length: count }, (_, i) => ({
      path: `s${i + 1}`,
      expanded: !collapsed.includes(`s${i + 1}`)
    }))

  it('mounts the visible sections that have no editor yet (FDIF-22)', () => {
    expect(mountPlan(stack(5), ['s2', 's3'], ['s2'])).toEqual({ mount: ['s3'], unmount: [] })
  })

  it('never keeps more than 12 editors live, dropping the farthest (FDIF-22, D1)', () => {
    const mounted = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12']

    const plan = mountPlan(stack(20), ['s20'], mounted)

    expect(plan).toEqual({ mount: ['s20'], unmount: ['s1'] })
    expect(mounted.length + plan.mount.length - plan.unmount.length).toBe(12)
  })

  it('drops the sections farthest from the visible range first (D1)', () => {
    const plan = mountPlan(stack(20), ['s10'], ['s1', 's9', 's11', 's20'], 3)

    expect(plan).toEqual({ mount: ['s10'], unmount: ['s1', 's20'] })
  })

  it('never mounts a collapsed section, and unmounts one that closes (FDIF-22)', () => {
    const plan = mountPlan(stack(5, ['s3']), ['s2', 's3', 's4'], ['s3'])

    expect(plan.mount).toEqual(['s2', 's4'])
    expect(plan.unmount).toEqual(['s3'])
  })
})

describe('tabKeyOf for commit tabs', () => {
  const SHA = '0f2b9c1d4e6a8b3c5d7e9f0a1b2c3d4e5f6a7b8c'

  it('gives a commit tab a key no file, diff or All changes tab can produce (FCMT-20)', () => {
    const commit = tabKeyOf({ kind: 'commit', sha: SHA })

    const others = [
      tabKeyOf(fileTab(SHA)),
      tabKeyOf(diffTab('since-base', SHA)),
      tabKeyOf(diffTab('uncommitted', SHA)),
      tabKeyOf({ kind: 'all-changes' })
    ]

    expect(others).not.toContain(commit)
  })

  it('is one tab per sha (FCMT-20)', () => {
    const other = '9e8d7c6b5a40312f1e0d9c8b7a6f5e4d3c2b1a09'

    expect(isSameTab({ kind: 'commit', sha: SHA }, { kind: 'commit', sha: SHA })).toBe(true)
    expect(isSameTab({ kind: 'commit', sha: SHA }, { kind: 'commit', sha: other })).toBe(false)
  })
})

describe('tabsWithAllChanges in commits mode', () => {
  it('offers no All changes tab, because the mode lists commits (FCMT-16)', () => {
    const open = [fileTab('src/app.ts')]

    const strip = tabsWithAllChanges(open, 'commits')

    expect(strip.map((tab) => tabKeyOf(tab))).toEqual([tabKeyOf(fileTab('src/app.ts'))])
  })
})

/** One changed line on both sides, in `getLineChanges()` form. */
function lineChanged(line: number): LineChangeLike {
  return {
    originalStartLineNumber: line,
    originalEndLineNumber: line,
    modifiedStartLineNumber: line,
    modifiedEndLineNumber: line
  }
}

/** A region the same on both sides, `[start, end)`. */
function both(
  start: number,
  end: number
): { original: { start: number; end: number }; modified: { start: number; end: number } } {
  return { original: { start, end }, modified: { start, end } }
}

describe('UNCHANGED_REGIONS', () => {
  it('keeps the strip settings at 3 context lines, a 3-line minimum and 20 lines per step (FOLD-10)', () => {
    expect(UNCHANGED_REGIONS).toEqual({
      contextLineCount: 3,
      minimumLineCount: 3,
      revealLineCount: 20
    })
  })
})

describe('unchangedRegions', () => {
  // A 200-line file ending in a newline is a 201-line model (measured in T1).
  it('finds the three regions of a file changed at lines 20 and 180 (FOLD-01)', () => {
    expect(unchangedRegions([lineChanged(20), lineChanged(180)], 201, 201)).toEqual([
      both(1, 17),
      both(24, 177),
      both(184, 202)
    ])
  })

  it('splits the middle region when line 100 changes too, as the running app shows 16 / 73 / 73 / 18 (FOLD-01)', () => {
    const regions = unchangedRegions(
      [lineChanged(20), lineChanged(100), lineChanged(180)],
      201,
      201
    )

    expect(regions).toEqual([both(1, 17), both(24, 97), both(104, 177), both(184, 202)])
    expect(regions.map((r) => r.modified.end - r.modified.start)).toEqual([16, 73, 73, 18])
  })

  it('folds a run at the start from 6 lines on, keeping 3 of context (FOLD-01)', () => {
    expect(unchangedRegions([lineChanged(7)], 20, 20)).toEqual([both(1, 4), both(11, 21)])
    // 5 lines before line 6: only the run after it folds.
    expect(unchangedRegions([lineChanged(6)], 20, 20)).toEqual([both(10, 21)])
  })

  it('folds a run at the end from 6 lines on, keeping 3 of context (FOLD-01)', () => {
    expect(unchangedRegions([lineChanged(14)], 20, 20)).toEqual([both(1, 11), both(18, 21)])
    // 5 lines after line 15: only the run before it folds.
    expect(unchangedRegions([lineChanged(15)], 20, 20)).toEqual([both(1, 12)])
  })

  it('folds a run between two changes from 9 lines on, keeping 3 on each side (FOLD-01)', () => {
    expect(unchangedRegions([lineChanged(1), lineChanged(11)], 11, 11)).toEqual([both(5, 8)])
    expect(unchangedRegions([lineChanged(1), lineChanged(10)], 10, 10)).toEqual([])
  })

  it('reads an insertion, whose original end is 0, as an empty original range', () => {
    const inserted: LineChangeLike = {
      originalStartLineNumber: 14,
      originalEndLineNumber: 0,
      modifiedStartLineNumber: 15,
      modifiedEndLineNumber: 15
    }

    const regions = unchangedRegions([inserted], 30, 31)

    expect(regions).toEqual([
      both(1, 12),
      { original: { start: 18, end: 31 }, modified: { start: 19, end: 32 } }
    ])
    // Left and right differ in position, never in length.
    for (const r of regions) {
      expect(r.original.end - r.original.start).toBe(r.modified.end - r.modified.start)
    }
  })

  it('reads a deletion, whose modified end is 0, as an empty modified range', () => {
    const deleted: LineChangeLike = {
      originalStartLineNumber: 15,
      originalEndLineNumber: 15,
      modifiedStartLineNumber: 14,
      modifiedEndLineNumber: 0
    }

    expect(unchangedRegions([deleted], 31, 30)).toEqual([
      both(1, 12),
      { original: { start: 19, end: 32 }, modified: { start: 18, end: 31 } }
    ])
  })

  it('reads a deletion of line 1, reported at modified line 0', () => {
    const deleted: LineChangeLike = {
      originalStartLineNumber: 1,
      originalEndLineNumber: 1,
      modifiedStartLineNumber: 0,
      modifiedEndLineNumber: 0
    }

    expect(unchangedRegions([deleted], 30, 29)).toEqual([
      { original: { start: 5, end: 31 }, modified: { start: 4, end: 30 } }
    ])
  })

  it('makes one region of the whole file when nothing changed', () => {
    expect(unchangedRegions([], 50, 50)).toEqual([both(1, 51)])
  })
})

describe('hiddenRangesOf', () => {
  it("reads the hidden right-side ranges of Monaco's saved fold state", () => {
    const state = { collapsedRegions: [{ range: [1, 17] }, { range: [177, 177] }] }

    expect(hiddenRangesOf(state)).toEqual([
      { start: 1, end: 17 },
      { start: 177, end: 177 }
    ])
  })

  it('answers null for a state that is not an object (FOLD-25)', () => {
    expect(hiddenRangesOf(undefined)).toBeNull()
    expect(hiddenRangesOf(null)).toBeNull()
    expect(hiddenRangesOf('collapsedRegions')).toBeNull()
  })

  it('answers null when collapsedRegions is missing or not an array (FOLD-25)', () => {
    expect(hiddenRangesOf({})).toBeNull()
    expect(hiddenRangesOf({ collapsedRegions: { range: [1, 17] } })).toBeNull()
  })

  it('answers null when an entry has no range of two numbers (FOLD-25)', () => {
    expect(hiddenRangesOf({ collapsedRegions: [null] })).toBeNull()
    expect(hiddenRangesOf({ collapsedRegions: [{ start: 1, end: 17 }] })).toBeNull()
    expect(hiddenRangesOf({ collapsedRegions: [{ range: [1] }] })).toBeNull()
    expect(hiddenRangesOf({ collapsedRegions: [{ range: [1, 17, 30] }] })).toBeNull()
    expect(hiddenRangesOf({ collapsedRegions: [{ range: ['1', 17] }] })).toBeNull()
    // One bad entry spoils the whole state: a partial read would fold the wrong regions.
    expect(hiddenRangesOf({ collapsedRegions: [{ range: [1, 17] }, { range: [24] }] })).toBeNull()
  })
})

describe('regionStates', () => {
  const middle = both(24, 177) // 153 lines

  it('reads a fully hidden region as folded, 0 lines revealed above and below (FOLD-03)', () => {
    expect(regionStates([middle], [{ start: 24, end: 177 }])).toEqual([
      { region: middle, revealedTop: 0, revealedBottom: 0 }
    ])
  })

  it('reads an empty hidden range as a region revealed whole (FOLD-03)', () => {
    const [atEnd] = regionStates([middle], [{ start: 177, end: 177 }])
    const [atStart] = regionStates([middle], [{ start: 24, end: 24 }])

    expect(atEnd).toEqual({ region: middle, revealedTop: 153, revealedBottom: 0 })
    expect(atStart).toEqual({ region: middle, revealedTop: 0, revealedBottom: 153 })
  })

  it('reads a region revealed in part as its counts above and below the strip (FOLD-05)', () => {
    expect(regionStates([middle], [{ start: 44, end: 167 }])).toEqual([
      { region: middle, revealedTop: 20, revealedBottom: 10 }
    ])
  })

  it('reads hidden ranges split inside one region together', () => {
    expect(
      regionStates(
        [middle],
        [
          { start: 30, end: 90 },
          { start: 100, end: 170 }
        ]
      )
    ).toEqual([{ region: middle, revealedTop: 6, revealedBottom: 7 }])
  })

  it('gives each region the hidden range that lies inside it, in any order (FOLD-03)', () => {
    const regions = [both(1, 17), middle, both(184, 202)]

    const states = regionStates(regions, [
      { start: 202, end: 202 },
      { start: 1, end: 17 },
      { start: 44, end: 177 }
    ])

    expect(states.map((s) => [s.revealedTop, s.revealedBottom])).toEqual([
      [0, 0],
      [20, 0],
      [18, 0]
    ])
  })

  it('reads a region with no hidden range listed as folded, as Monaco starts it', () => {
    expect(regionStates([middle], [])).toEqual([
      { region: middle, revealedTop: 0, revealedBottom: 0 }
    ])
  })
})

describe('foldPlan', () => {
  // T1's long.ts: changed at 20 and 180, then at 100 as well.
  const A = both(1, 17)
  const B = both(24, 177)
  const C = both(184, 202)
  const B1 = both(24, 97)
  const B2 = both(104, 177)
  const split = [A, B1, B2, C]

  const folded = (region: Region): RegionState => ({ region, revealedTop: 0, revealedBottom: 0 })
  const revealed = (region: Region): RegionState => ({
    region,
    revealedTop: region.modified.end - region.modified.start,
    revealedBottom: 0
  })
  const partial = (region: Region, top: number, bottom: number): RegionState => ({
    region,
    revealedTop: top,
    revealedBottom: bottom
  })
  const whole = (r: Region): { start: number; end: number } => r.modified
  const open = (r: Region): { start: number; end: number } => ({
    start: r.modified.start,
    end: r.modified.start
  })

  it('keeps folded the regions that were folded and still exist (FOLD-02)', () => {
    expect(foldPlan([folded(A), folded(B), folded(C)], split, null, false)).toEqual(
      split.map(whole)
    )
  })

  it('keeps revealed a region revealed by hand, both halves when a change split it (FOLD-03)', () => {
    expect(foldPlan([folded(A), revealed(B), folded(C)], split, null, false)).toEqual([
      whole(A),
      open(B1),
      open(B2),
      whole(C)
    ])
  })

  it('matches regions by their left-side lines, whatever the right side moved (FOLD-03)', () => {
    // An insertion above shifts the right side of the second region by one line.
    const shifted: Region = { original: { start: 51, end: 177 }, modified: { start: 52, end: 178 } }
    const plan = foldPlan([revealed(B)], [both(24, 47), shifted], null, false)

    expect(plan).toEqual([
      { start: 24, end: 24 },
      { start: 52, end: 52 }
    ])
  })

  it("keeps a region's own fold when its right side lands where another region was (FOLD-03)", () => {
    // 100 lines inserted above move the folded region's right side onto the
    // right side the revealed one had. Only the left side names the region.
    const folded100: Region = both(100, 150)
    const revealed200: Region = both(200, 260)
    const moved: Region = { original: { start: 100, end: 150 }, modified: { start: 200, end: 250 } }

    expect(foldPlan([folded(folded100), revealed(revealed200)], [moved], null, false)).toEqual([
      { start: 200, end: 250 }
    ])
  })

  it('treats a region whose left side only touches an earlier one as new (FOLD-04)', () => {
    const earlier: Region = both(24, 57)
    const touching: Region = both(57, 80)

    expect(foldPlan([revealed(earlier)], [touching], null, false)).toEqual([whole(touching)])
  })

  it('folds a merged region when its only revealed source was revealed in part (FOLD-06, owner 2026-09-27)', () => {
    expect(foldPlan([partial(B1, 5, 0), folded(B2)], [B], null, false)).toEqual([whole(B)])
  })

  // other.ts: lines 50-70 changed, then only 50 and 70 differ.
  const top = both(1, 47)
  const bottom = both(74, 122)
  const fresh = both(54, 67)

  it('folds a region that did not exist before, with no choice or after Hide (FOLD-04)', () => {
    const before = [revealed(top), folded(bottom)]

    expect(foldPlan(before, [top, fresh, bottom], null, false)).toEqual([
      open(top),
      whole(fresh),
      whole(bottom)
    ])
    expect(foldPlan(before, [top, fresh, bottom], 'hide', false)[1]).toEqual(whole(fresh))
  })

  it('reveals a region that did not exist before while Show unchanged is the choice (FOLD-15)', () => {
    expect(foldPlan([folded(top), folded(bottom)], [top, fresh, bottom], 'show', false)).toEqual([
      whole(top),
      open(fresh),
      whole(bottom)
    ])
  })

  it('keeps the lines revealed above and below a strip (FOLD-05)', () => {
    expect(foldPlan([partial(B, 20, 10)], [B1, B2], null, false)).toEqual([
      { start: 44, end: 87 },
      { start: 124, end: 167 }
    ])
  })

  it('clamps the lines revealed above and below to a region that shrank (FOLD-05)', () => {
    // 100 above and 40 below do not fit in 73 lines: the top takes them all.
    expect(foldPlan([partial(B, 100, 40)], [B1], null, false)).toEqual([{ start: 97, end: 97 }])
    expect(foldPlan([partial(B, 10, 70)], [B1], null, false)).toEqual([{ start: 34, end: 34 }])
  })

  it('reveals a merged region if any region it grew from was revealed, and folds it otherwise (FOLD-06)', () => {
    expect(foldPlan([folded(B1), revealed(B2)], [B], null, false)).toEqual([open(B)])
    expect(foldPlan([folded(B1), folded(B2)], [B], null, false)).toEqual([whole(B)])
  })

  it('starts every region as in a new diff when the left side changed (FOLD-07)', () => {
    const before = [folded(A), revealed(B), folded(C)]

    expect(foldPlan(before, split, null, true)).toEqual(split.map(whole))
    expect(foldPlan(before, split, 'hide', true)).toEqual(split.map(whole))
    expect(foldPlan(before, split, 'show', true)).toEqual(split.map(open))
  })

  it('starts every region as in a new diff when there is no earlier state (FOLD-07)', () => {
    expect(foldPlan(null, split, null, false)).toEqual(split.map(whole))
    expect(foldPlan(null, split, 'show', false)).toEqual(split.map(open))
  })

  it('folds every region after a write through an empty file (FOLD-26)', () => {
    expect(foldPlan([], split, null, false)).toEqual(split.map(whole))
  })

  it("keeps every span inside its own region's right side", () => {
    const next = [top, fresh, bottom]
    const plans = [
      foldPlan([revealed(top), partial(bottom, 5, 5)], next, 'show', false),
      foldPlan([partial(top, 100, 100)], next, null, false),
      choicePlan(next, 'hide'),
      choicePlan(next, 'show')
    ]

    for (const plan of plans) {
      expect(plan).toHaveLength(next.length)
      plan.forEach((span, i) => {
        expect(span.start).toBeGreaterThanOrEqual(next[i].modified.start)
        expect(span.end).toBeLessThanOrEqual(next[i].modified.end)
        expect(span.start).toBeLessThanOrEqual(span.end)
      })
    }
  })
})

describe('choicePlan', () => {
  const regions = [both(1, 17), both(24, 177), both(184, 202)]

  it('folds every region for Hide unchanged (FOLD-12)', () => {
    expect(choicePlan(regions, 'hide')).toEqual([
      { start: 1, end: 17 },
      { start: 24, end: 177 },
      { start: 184, end: 202 }
    ])
  })

  it('reveals every region for Show unchanged (FOLD-13)', () => {
    expect(choicePlan(regions, 'show')).toEqual([
      { start: 1, end: 1 },
      { start: 24, end: 24 },
      { start: 184, end: 184 }
    ])
  })
})

describe('readingBeforeUpdate', () => {
  const regions = [both(1, 17), both(24, 177)]
  const saved = { collapsedRegions: [{ range: [1, 17] }, { range: [177, 177] }] }

  it('keeps the reading taken before an update that is still pending (FOLD-08)', () => {
    const pending: FoldReading = {
      states: [{ region: both(1, 17), revealedTop: 0, revealedBottom: 0 }],
      left: 'first'
    }

    expect(readingBeforeUpdate(pending, regions, saved, 'second')).toBe(pending)
  })

  it("keeps a pending press's marker, so the press still wins (FOLD-08)", () => {
    const pressed: FoldReading = { states: null, left: 'first' }

    expect(readingBeforeUpdate(pressed, regions, saved, 'second')).toBe(pressed)
  })

  it('takes no reading before the first diff has been computed', () => {
    expect(readingBeforeUpdate(null, null, saved, 'left')).toBeNull()
  })

  it("takes no reading when Monaco's saved state is out of shape, so the update runs as before (FOLD-25)", () => {
    expect(readingBeforeUpdate(null, regions, { collapsedRegions: 'nope' }, 'left')).toBeNull()
    expect(readingBeforeUpdate(null, regions, undefined, 'left')).toBeNull()
  })

  it('reads every region and the left text otherwise (FOLD-02, FOLD-03)', () => {
    expect(readingBeforeUpdate(null, regions, saved, 'left text')).toEqual({
      states: [
        { region: both(1, 17), revealedTop: 0, revealedBottom: 0 },
        { region: both(24, 177), revealedTop: 153, revealedBottom: 0 }
      ],
      left: 'left text'
    })
  })
})
