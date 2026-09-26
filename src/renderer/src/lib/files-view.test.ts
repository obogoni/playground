import { describe, expect, it } from 'vitest'
import type { AppConfig } from '../../../shared/config'
import type { ChangedPath } from '../../../shared/files'
import { ALL_CHANGES_KEY, tabKeyOf, type TabRef } from './diff-view'
import {
  buildTree,
  fileType,
  filesStateFor,
  formatSize,
  isSolution,
  launcherTarget,
  pinTab,
  tabsAffected,
  tabsAfterBulkClose,
  tabsAfterClose,
  unpinTab
} from './files-view'

function ui(files?: AppConfig['ui']['files']): AppConfig['ui'] {
  return { theme: 'dark', direction: 'files', defaultShell: 'pwsh', ...(files ? { files } : {}) }
}

function changed(path: string, status: ChangedPath['status'] = 'modified'): ChangedPath {
  return { path, status }
}

describe('buildTree', () => {
  it('nests descendants of one folder under a single node, keeping each leaf status (FXPL-08, FXPL-12)', () => {
    const tree = buildTree([changed('a/b/c.ts', 'added'), changed('a/d.ts', 'deleted')])

    expect(tree).toEqual([
      {
        kind: 'dir',
        name: 'a',
        path: 'a',
        children: [
          {
            kind: 'dir',
            name: 'b',
            path: 'a/b',
            children: [{ kind: 'file', name: 'c.ts', path: 'a/b/c.ts', status: 'added' }]
          },
          { kind: 'file', name: 'd.ts', path: 'a/d.ts', status: 'deleted' }
        ]
      }
    ])
  })

  it('sorts folders before files at every level, as foldChildren does', () => {
    const tree = buildTree([changed('zeta.ts'), changed('alpha/one.ts')])

    expect(tree.map((node) => node.path)).toEqual(['alpha', 'zeta.ts'])
  })

  it('sorts each group alphabetically, case-insensitively', () => {
    const tree = buildTree([changed('Beta.ts'), changed('alpha.ts'), changed('Charlie.ts')])

    expect(tree.map((node) => node.name)).toEqual(['alpha.ts', 'Beta.ts', 'Charlie.ts'])
  })
})

describe('isSolution', () => {
  it('accepts a .sln in any case (FXPL-28)', () => {
    expect(isSolution('src/Widget.sln')).toBe(true)
    expect(isSolution('src/Widget.SLN')).toBe(true)
  })

  it('accepts a .slnx in any case (FXPL-28)', () => {
    expect(isSolution('src/Widget.slnx')).toBe(true)
    expect(isSolution('src/Widget.SlnX')).toBe(true)
  })

  it('rejects a path that only contains .sln', () => {
    expect(isSolution('src/Widget.sln.bak')).toBe(false)
    expect(isSolution('src/Widget.ts')).toBe(false)
  })
})

describe('tabsAfterClose', () => {
  const three = ['a.ts', 'b.ts', 'c.ts']

  it('focuses the next tab when the active middle one is closed (FXPL-19)', () => {
    expect(tabsAfterClose(three, 1, 'b.ts')).toEqual({ tabs: ['a.ts', 'c.ts'], active: 'c.ts' })
  })

  it('focuses the previous tab when the active last one is closed (FXPL-19)', () => {
    expect(tabsAfterClose(three, 2, 'c.ts')).toEqual({ tabs: ['a.ts', 'b.ts'], active: 'b.ts' })
  })

  it('leaves no active tab when the only tab is closed (FXPL-19)', () => {
    expect(tabsAfterClose(['a.ts'], 0, 'a.ts')).toEqual({ tabs: [], active: null })
  })

  it('keeps the active tab when an inactive one is closed', () => {
    expect(tabsAfterClose(three, 0, 'b.ts')).toEqual({ tabs: ['b.ts', 'c.ts'], active: 'b.ts' })
  })

  it('refuses to close the All changes tab (FDIF-17)', () => {
    const strip = [ALL_CHANGES_KEY, 'file:a.ts']

    expect(tabsAfterClose(strip, 0, ALL_CHANGES_KEY)).toEqual({
      tabs: strip,
      active: ALL_CHANGES_KEY
    })
    expect(tabsAfterClose(strip, 0, 'file:a.ts')).toEqual({ tabs: strip, active: 'file:a.ts' })
  })

  it('falls back to All changes when the only other tab is closed (FDIF-17)', () => {
    expect(tabsAfterClose([ALL_CHANGES_KEY, 'file:a.ts'], 1, 'file:a.ts')).toEqual({
      tabs: [ALL_CHANGES_KEY],
      active: ALL_CHANGES_KEY
    })
  })
})

describe('launcherTarget', () => {
  it('returns whichever of the active file and the last folder is more recent (FXPL-26)', () => {
    const tab = { path: 'src/app.ts', at: 100 }

    expect(launcherTarget(tab, { path: 'src/lib', at: 200 })).toBe('src/lib')
    expect(launcherTarget(tab, { path: 'src/lib', at: 50 })).toBe('src/app.ts')
  })

  it('leaves the target on the active file when the folder is not newer (FXPL-26)', () => {
    // Both stamps come from one `Date.now()` on the same click path, so a tie
    // is reachable; FXPL-26 hands the folder the target only when it is newer.
    expect(launcherTarget({ path: 'src/app.ts', at: 100 }, { path: 'src/lib', at: 100 })).toBe(
      'src/app.ts'
    )
  })

  it('falls back to whichever exists, and to null when neither does (FXPL-26)', () => {
    expect(launcherTarget({ path: 'src/app.ts', at: 100 }, null)).toBe('src/app.ts')
    expect(launcherTarget(null, { path: 'src/lib', at: 100 })).toBe('src/lib')
    expect(launcherTarget(null, null)).toBeNull()
  })
})

describe('filesStateFor', () => {
  it('defaults a worktree with no stored state to the full folder and no base (FXPL-13)', () => {
    expect(filesStateFor(ui(), 'C:/work/acme/widget')).toEqual({ mode: 'full' })
  })

  it('defaults a worktree missing from a stored map the same way (FXPL-13)', () => {
    const stored = ui({ 'C:/work/acme/widget': { mode: 'uncommitted' } })

    expect(filesStateFor(stored, 'C:/work/acme/widget-12345')).toEqual({ mode: 'full' })
  })

  it('restores the mode and base last used for that worktree (FXPL-13)', () => {
    const stored = ui({ 'C:/work/acme/widget': { mode: 'since-base', base: 'origin/main' } })

    expect(filesStateFor(stored, 'C:/work/acme/widget')).toEqual({
      mode: 'since-base',
      base: 'origin/main'
    })
  })
})

describe('tabsAffected', () => {
  it('returns only the open tabs the change touches (FXPL-21, FXPL-23)', () => {
    const open = ['src/app.ts', 'src/lib/util.ts', 'README.md']

    expect(tabsAffected(open, ['src/lib/util.ts', 'src/untouched-tabless.ts'])).toEqual([
      'src/lib/util.ts'
    ])
  })

  it('compares paths regardless of separator', () => {
    expect(tabsAffected(['src/a.ts'], ['src\\a.ts'])).toEqual(['src/a.ts'])
    expect(tabsAffected(['src\\a.ts'], ['src/a.ts'])).toEqual(['src\\a.ts'])
  })
})

describe('formatSize', () => {
  it('counts exact bytes below 1 KB (FXPL-20)', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(1023)).toBe('1023 B')
  })

  it('steps up through KB, MB and GB, and stops at GB (FXPL-20)', () => {
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.0 GB')
    // Nothing above GB: a terabyte is still counted in gigabytes.
    expect(formatSize(1024 * 1024 * 1024 * 1024)).toBe('1024 GB')
  })

  it('keeps one decimal below 10 and rounds to a whole number from 10 up (FXPL-20)', () => {
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(10 * 1024)).toBe('10 KB')
    expect(formatSize(15872)).toBe('16 KB')
  })

  it('reports a file just over the 1 MB viewer ceiling in megabytes (FXPL-20)', () => {
    // The size the `too-large` placeholder prints for the smallest file that
    // reaches it — the unit the tab has to show, not merely "some number".
    expect(formatSize(1024 * 1024 + 1)).toBe('1.0 MB')
  })
})

describe('fileType', () => {
  it('names the last extension as the type (FXPL-20)', () => {
    expect(fileType('app.ts')).toBe('TS file')
    expect(fileType('App.sln')).toBe('SLN file')
    expect(fileType('archive.tar.gz')).toBe('GZ file')
  })

  it('calls a dotfile and an extensionless name extensionless (FXPL-20)', () => {
    // The leading dot of `.gitignore` starts the name, so it is not a
    // `GITIGNORE file`.
    expect(fileType('.gitignore')).toBe('No extension')
    expect(fileType('LICENSE')).toBe('No extension')
  })
})

describe('pinTab and unpinTab (FPOL-01, 03, 04, 05)', () => {
  type Tab = TabRef & { pinned?: boolean }
  const file = (path: string, pinned?: boolean): Tab =>
    pinned ? { kind: 'file', path, pinned } : { kind: 'file', path }
  const commit = (sha: string): Tab => ({ kind: 'commit', sha })
  const strip = (tabs: Tab[]): string[] =>
    tabs.map((t) => `${tabKeyOf(t)}${t.pinned ? ' (pinned)' : ''}`)

  it('moves a pinned tab to the front, after the tabs pinned before it (FPOL-01)', () => {
    const tabs = [file('a.ts', true), file('b.ts'), file('c.ts'), commit('abc123')]

    expect(strip(pinTab(tabs, 'commit:abc123'))).toEqual([
      'file:a.ts (pinned)',
      'commit:abc123 (pinned)',
      'file:b.ts',
      'file:c.ts'
    ])
  })

  it('moves an unpinned tab to the front of the unpinned tabs (FPOL-03)', () => {
    const tabs = [file('a.ts', true), file('b.ts', true), file('c.ts'), file('d.ts')]

    expect(strip(unpinTab(tabs, 'file:a.ts'))).toEqual([
      'file:b.ts (pinned)',
      'file:a.ts',
      'file:c.ts',
      'file:d.ts'
    ])
  })

  it('changes nothing when pinning a pinned tab or unpinning an unpinned one', () => {
    const tabs = [file('a.ts', true), file('b.ts')]

    expect(pinTab(tabs, 'file:a.ts')).toBe(tabs)
    expect(unpinTab(tabs, 'file:b.ts')).toBe(tabs)
  })

  it('never pins or moves All changes, nor a key it does not hold (FPOL-05)', () => {
    const tabs = [file('a.ts'), file('b.ts')]

    expect(pinTab(tabs, ALL_CHANGES_KEY)).toBe(tabs)
    expect(pinTab(tabs, 'file:gone.ts')).toBe(tabs)
  })

  it('keeps every tab key, so the active key still names the same tab (FPOL-04)', () => {
    const tabs = [file('a.ts'), file('b.ts'), commit('abc123')]
    const keys = tabs.map(tabKeyOf).sort()

    expect(pinTab(tabs, 'file:b.ts').map(tabKeyOf).sort()).toEqual(keys)
    expect(unpinTab(pinTab(tabs, 'file:b.ts'), 'file:b.ts').map(tabKeyOf).sort()).toEqual(keys)
  })
})

describe('tabsAfterBulkClose (FPOL-06..11)', () => {
  const AC = { key: ALL_CHANGES_KEY, pinned: false }
  const t = (key: string, pinned = false): { key: string; pinned: boolean } => ({ key, pinned })
  // All changes, two pinned tabs, three unpinned: the strip of a diff mode.
  const strip = [AC, t('p1', true), t('p2', true), t('a'), t('b'), t('c')]

  it('Close all keeps only All changes, pinned tabs included in the close (FPOL-06)', () => {
    expect(tabsAfterBulkClose(strip, 'p1', { kind: 'all' })).toEqual({
      keys: [ALL_CHANGES_KEY],
      active: ALL_CHANGES_KEY
    })
  })

  it('Close unpinned keeps every pinned tab (FPOL-07)', () => {
    expect(tabsAfterBulkClose(strip, 'p2', { kind: 'unpinned' })).toEqual({
      keys: [ALL_CHANGES_KEY, 'p1', 'p2'],
      active: 'p2'
    })
  })

  it('Close others keeps the anchor and every pinned tab (FPOL-08)', () => {
    expect(tabsAfterBulkClose(strip, 'b', { kind: 'others', anchor: 'b' })).toEqual({
      keys: [ALL_CHANGES_KEY, 'p1', 'p2', 'b'],
      active: 'b'
    })
  })

  it('Close to the right closes only the unpinned tabs right of the anchor (FPOL-09)', () => {
    expect(tabsAfterBulkClose(strip, 'a', { kind: 'right', anchor: 'a' })).toEqual({
      keys: [ALL_CHANGES_KEY, 'p1', 'p2', 'a'],
      active: 'a'
    })
    // From a pinned anchor: the other pinned tab to its right survives.
    expect(tabsAfterBulkClose(strip, 'p1', { kind: 'right', anchor: 'p1' })).toEqual({
      keys: [ALL_CHANGES_KEY, 'p1', 'p2'],
      active: 'p1'
    })
  })

  it('Close on a pinned tab closes it (FPOL-10)', () => {
    expect(tabsAfterBulkClose(strip, 'a', { kind: 'close', anchor: 'p1' })).toEqual({
      keys: [ALL_CHANGES_KEY, 'p2', 'a', 'b', 'c'],
      active: 'a'
    })
  })

  it('never closes All changes', () => {
    expect(tabsAfterBulkClose(strip, 'a', { kind: 'close', anchor: ALL_CHANGES_KEY })).toEqual({
      keys: strip.map((x) => x.key),
      active: 'a'
    })
  })

  it('moves a closed active tab to the nearest survivor on its right first (FPOL-11)', () => {
    expect(tabsAfterBulkClose(strip, 'a', { kind: 'others', anchor: 'c' })).toEqual({
      keys: [ALL_CHANGES_KEY, 'p1', 'p2', 'c'],
      active: 'c'
    })
  })

  it('falls back to the nearest survivor on its left (FPOL-11)', () => {
    expect(tabsAfterBulkClose(strip, 'c', { kind: 'right', anchor: 'a' })).toEqual({
      keys: [ALL_CHANGES_KEY, 'p1', 'p2', 'a'],
      active: 'a'
    })
  })

  it('falls back to All changes when nothing else survives in a diff mode (FPOL-11)', () => {
    expect(tabsAfterBulkClose([AC, t('a'), t('b')], 'b', { kind: 'unpinned' })).toEqual({
      keys: [ALL_CHANGES_KEY],
      active: ALL_CHANGES_KEY
    })
  })

  it('leaves nothing active when nothing survives in Explore (FPOL-11)', () => {
    expect(tabsAfterBulkClose([t('a', true), t('b')], 'b', { kind: 'all' })).toEqual({
      keys: [],
      active: null
    })
  })
})
