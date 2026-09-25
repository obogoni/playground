import { describe, expect, it } from 'vitest'
import type { ChangedPath, FileStat } from '../../../shared/files'
import {
  ALL_CHANGES_KEY,
  diffRequestFor,
  eolStripText,
  initialExpansion,
  isSameTab,
  mountPlan,
  nextChangeTarget,
  tabKeyOf,
  tabsWithAllChanges,
  totals,
  type ChangeSection,
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
