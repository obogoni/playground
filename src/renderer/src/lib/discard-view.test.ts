import { describe, expect, it } from 'vitest'
import type { ChangedPath } from '../../../shared/files'
import {
  confirmLabel,
  discardGroups,
  entriesUnder,
  entryForRow,
  keptReason,
  sessionWarning
} from './discard-view'

function changed(path: string, status: ChangedPath['status'], oldPath?: string): ChangedPath {
  return { path, status, ...(oldPath ? { oldPath } : {}) }
}

describe('entryForRow', () => {
  it('finds the entry a file row was drawn from', () => {
    const list = [changed('src/a.ts', 'modified'), changed('src/b.ts', 'added')]

    expect(entryForRow(list, 'src/a.ts')).toEqual(changed('src/a.ts', 'modified'))
  })

  it('finds an untracked folder listed as dir/ from its row, which drops the slash (FDSC-43)', () => {
    const list = [changed('dir/', 'untracked'), changed('dirx.ts', 'modified')]

    expect(entryForRow(list, 'dir')).toEqual(changed('dir/', 'untracked'))
  })

  it('finds nothing for a row the list does not hold', () => {
    expect(entryForRow([changed('src/a.ts', 'modified')], 'src/b.ts')).toBeNull()
  })
})

describe('entriesUnder', () => {
  it('lists every entry under the folder at any depth, and nothing beside it (FDSC-34)', () => {
    const list = [
      changed('src/a.ts', 'modified'),
      changed('srcx/a.ts', 'modified'),
      changed('src.ts', 'modified'),
      changed('src/deep/er/b.ts', 'untracked'),
      changed('other/c.ts', 'deleted')
    ]

    expect(entriesUnder(list, 'src')).toEqual([
      changed('src/deep/er/b.ts', 'untracked'),
      changed('src/a.ts', 'modified')
    ])
  })

  it('lists them in the order the tree draws them: folders first, then by name', () => {
    const list = [
      changed('src/z.ts', 'modified'),
      changed('src/B.ts', 'modified'),
      changed('src/a.ts', 'modified'),
      changed('src/lib/x.ts', 'modified')
    ]

    expect(entriesUnder(list, 'src').map((entry) => entry.path)).toEqual([
      'src/lib/x.ts',
      'src/a.ts',
      'src/B.ts',
      'src/z.ts'
    ])
  })
})

describe('discardGroups', () => {
  it.each([
    ['untracked', 'recycle'],
    ['added', 'recycle'],
    ['renamed', 'recycle'],
    ['modified', 'restore'],
    ['deleted', 'restore']
  ] as const)('puts a %s file in the %s group (FDSC-11)', (status, group) => {
    const entry = changed('src/a.ts', status, status === 'renamed' ? 'src/old.ts' : undefined)

    const groups = discardGroups([entry])

    expect(groups[group]).toEqual([entry])
    expect(groups[group === 'recycle' ? 'restore' : 'recycle']).toEqual([])
  })

  it('keeps each group in tree order, whatever order the request came in (FDSC-10)', () => {
    const entries = [
      changed('b.ts', 'modified'),
      changed('notes.txt', 'untracked'),
      changed('a/y.ts', 'deleted'),
      changed('A.txt', 'added'),
      changed('a/x/z.ts', 'modified')
    ]

    const groups = discardGroups(entries)

    expect(groups.restore.map((entry) => entry.path)).toEqual(['a/x/z.ts', 'a/y.ts', 'b.ts'])
    expect(groups.recycle.map((entry) => entry.path)).toEqual(['A.txt', 'notes.txt'])
  })
})

describe('confirmLabel', () => {
  it('counts one file in the singular and more in the plural (FDSC-14)', () => {
    expect(confirmLabel(1)).toBe('Discard 1 file')
    expect(confirmLabel(2)).toBe('Discard 2 files')
  })
})

describe('sessionWarning', () => {
  it('warns of nothing when no session runs in the worktree (FDSC-13)', () => {
    expect(sessionWarning(0)).toBeNull()
  })

  it('names how many sessions run in the worktree (FDSC-12)', () => {
    expect(sessionWarning(1)).toBe(
      '1 session is running in this worktree and may be using these files.'
    )
    expect(sessionWarning(2)).toBe(
      '2 sessions are running in this worktree and may be using these files.'
    )
  })
})

describe('keptReason', () => {
  it.each([
    ['recycle-bin', 'The Recycle Bin refused it.'],
    ['link', 'Links and junctions are never moved.'],
    ['outside', 'It is outside the worktree.']
  ] as const)('explains a file kept for %s (FDSC-21)', (cause, reason) => {
    expect(keptReason({ cause, detail: 'Access is denied.' })).toBe(reason)
  })

  it("shows git's first error line as it came (FDSC-21)", () => {
    const detail = "fatal: Unable to create 'C:/wt/.git/index.lock': File exists."

    expect(keptReason({ cause: 'git', detail })).toBe(detail)
  })
})
