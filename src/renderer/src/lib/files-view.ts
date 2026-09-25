import type { AppConfig, FilesState } from '../../../shared/config'
import type { ChangedPath } from '../../../shared/files'
import type { ChangeStatus } from '../../../shared/worktrees'
import { ALL_CHANGES_KEY } from './diff-view'

/** A changed file as the tree renders it, carrying the status it was listed with. */
export interface FileNode {
  kind: 'file'
  name: string
  /** Path relative to the worktree root, forward slashes. */
  path: string
  status: ChangeStatus
}

/** A folder the nesting invented; the diff modes never list folders themselves. */
export interface DirNode {
  kind: 'dir'
  name: string
  path: string
  children: TreeNode[]
}

export type TreeNode = FileNode | DirNode

/**
 * Nests the flat path list both diff modes return (FXPL-08, FXPL-12) into the
 * folders the tree draws, keeping each leaf's change status. Ordering matches
 * `foldChildren` in main, so the full-folder mode and the diff modes read the
 * same: folders first, then alphabetical, case-insensitive.
 */
export function buildTree(paths: ChangedPath[]): TreeNode[] {
  const root: DirNode = { kind: 'dir', name: '', path: '', children: [] }
  for (const { path, status } of paths) {
    const segments = path.split('/').filter((segment) => segment !== '')
    if (segments.length === 0) continue
    let parent = root
    for (const [index, name] of segments.entries()) {
      const here = parent.path === '' ? name : `${parent.path}/${name}`
      if (index === segments.length - 1) {
        parent.children.push({ kind: 'file', name, path: here, status })
        break
      }
      const existing = parent.children.find(
        (node): node is DirNode => node.kind === 'dir' && node.name === name
      )
      if (existing) {
        parent = existing
        continue
      }
      const dir: DirNode = { kind: 'dir', name, path: here, children: [] }
      parent.children.push(dir)
      parent = dir
    }
  }
  sortInPlace(root)
  return root.children
}

/** A solution opens in VS 2026 instead of a tab (FXPL-28). */
export function isSolution(path: string): boolean {
  return /\.slnx?$/i.test(path)
}

/**
 * Which tabs are left after one is closed, and which is focused (FXPL-19).
 * Closing the active tab moves focus to the next one, or to the previous when
 * there is no next; closing the last remaining tab leaves `null`, the empty
 * state. Closing an inactive tab leaves the focus where it was. Tabs are
 * identified by their key (`tabKeyOf`), which for a file tab is built from the
 * path, as opening an already-open file does (FXPL-16).
 *
 * The All changes tab is the one exception: it cannot be closed (FDIF-17), so a
 * close request naming it changes nothing. It stays in the list either way,
 * which is also why closing the tab beside it never leaves the view empty.
 */
export function tabsAfterClose(
  tabs: string[],
  closedIndex: number,
  activePath: string | null
): { tabs: string[]; active: string | null } {
  if (tabs[closedIndex] === ALL_CHANGES_KEY) return { tabs, active: activePath }
  const left = tabs.filter((_, index) => index !== closedIndex)
  if (tabs[closedIndex] !== activePath) return { tabs: left, active: activePath }
  const adjacent = left[closedIndex] ?? left[closedIndex - 1] ?? null
  return { tabs: left, active: adjacent }
}

/** A path the user picked, and when — the recency FXPL-26 compares. */
export interface Selected {
  path: string
  at: number
}

/**
 * What the launcher row acts on (FXPL-26): the active tab's file, unless a
 * folder was selected in the tree after that tab was opened. Null when nothing
 * has been selected at all.
 */
export function launcherTarget(
  activeTab: Selected | null,
  lastFolder: Selected | null
): string | null {
  if (!activeTab) return lastFolder?.path ?? null
  if (!lastFolder) return activeTab.path
  return lastFolder.at > activeTab.at ? lastFolder.path : activeTab.path
}

/**
 * The lens a worktree opens in (FXPL-13, design D4): the one it was left in,
 * or the full folder with no base when it has never been visited. Absent is
 * the default, so a config written before the Files direction reads correctly.
 */
export function filesStateFor(ui: AppConfig['ui'], worktreeId: string): FilesState {
  return ui.files?.[worktreeId] ?? { mode: 'full' }
}

/**
 * Which open tabs a batch of disk changes touches (FXPL-21), so the reaction
 * stays scoped to them instead of every tab (FXPL-23). The watcher reports
 * paths as the OS spells them, which on Windows means backslashes, while the
 * tree lists them with forward slashes; both compare alike here.
 */
export function tabsAffected(openTabs: string[], changedPaths: string[]): string[] {
  const changed = new Set(changedPaths.map(comparablePath))
  return openTabs.filter((tab) => changed.has(comparablePath(tab)))
}

/**
 * Bytes as the size a file manager would print — the *size* a tab shows for a
 * file it cannot render (FXPL-20). Below 1 KB the count is exact; above it the
 * value steps through KB, MB and GB and stops there, and it keeps one decimal
 * while it is under 10 so that `1.5 KB` does not collapse to `2 KB`.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/**
 * The extension as the *type* a tab shows beside the size (FXPL-20), or a
 * plain statement that there is none. The dot has to be past the first
 * character: a dotfile such as `.gitignore` is a name, not an extension.
 */
export function fileType(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(dot + 1).toUpperCase()} file` : 'No extension'
}

function comparablePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function sortInPlace(dir: DirNode): void {
  dir.children.sort(compareNodes)
  for (const child of dir.children) {
    if (child.kind === 'dir') sortInPlace(child)
  }
}

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  const lower = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  return lower !== 0 ? lower : a.name.localeCompare(b.name)
}
