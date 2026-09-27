import type { ChangedPath, DiscardKept } from '../../../shared/files'
import { buildTree, type TreeNode } from './files-view'

/**
 * The listed change a tree row was drawn from. The tree drops the trailing
 * slash git gives a wholly untracked folder (`dir/`), so its row reads `dir`
 * and is matched back to the listed `dir/` (FDSC-43).
 */
export function entryForRow(list: ChangedPath[], rowPath: string): ChangedPath | null {
  return (
    list.find((entry) => entry.path === rowPath) ??
    list.find((entry) => entry.path === `${rowPath}/`) ??
    null
  )
}

/**
 * Every listed change under a folder row, at any depth, in the order the tree
 * draws them (FDSC-34). `src` holds `src/a.ts` and `src/x/y.ts`, never
 * `srcx/a.ts` nor `src.ts`.
 */
export function entriesUnder(list: ChangedPath[], folder: string): ChangedPath[] {
  const prefix = `${folder}/`
  return inTreeOrder(list.filter((entry) => entry.path.startsWith(prefix)))
}

/**
 * The confirmation's two groups (FDSC-10/11): what leaves through the Recycle
 * Bin (a path the last commit does not hold) and what git puts back to the
 * last commit. Each group reads in tree order, whatever order the request came
 * in: Discard all sends the list in git's order, not the tree's.
 */
export function discardGroups(entries: ChangedPath[]): {
  recycle: ChangedPath[]
  restore: ChangedPath[]
} {
  const ordered = inTreeOrder(entries)
  return {
    recycle: ordered.filter((entry) => RECYCLED.has(entry.status)),
    restore: ordered.filter((entry) => !RECYCLED.has(entry.status))
  }
}

/** The confirm button's text (FDSC-14). */
export function confirmLabel(n: number): string {
  return n === 1 ? 'Discard 1 file' : `Discard ${n} files`
}

/** The warning above the session titles, or none when no session runs (FDSC-12/13). */
export function sessionWarning(n: number): string | null {
  if (n === 0) return null
  return n === 1
    ? '1 session is running in this worktree and may be using these files.'
    : `${n} sessions are running in this worktree and may be using these files.`
}

/** Why one file of the kept list was left as it was (FDSC-21). */
export function keptReason(kept: DiscardKept): string {
  switch (kept.cause) {
    case 'recycle-bin':
      return 'The Recycle Bin refused it.'
    case 'link':
      return 'Links and junctions are never moved.'
    case 'outside':
      return 'It is outside the worktree.'
    case 'git':
      return kept.detail ?? ''
  }
}

/** The statuses whose file goes to the Recycle Bin (FDSC-06/07/26). */
const RECYCLED = new Set<ChangedPath['status']>(['untracked', 'added', 'renamed'])

/** Reorders entries as `buildTree` draws them: folders first, then by name. */
function inTreeOrder(entries: ChangedPath[]): ChangedPath[] {
  // Keyed by the path the tree shows, which has lost a folder row's slash.
  const byRow = new Map<string, ChangedPath[]>()
  for (const entry of entries) {
    const row = entry.path.replace(/\/+$/, '')
    byRow.set(row, [...(byRow.get(row) ?? []), entry])
  }
  const ordered: ChangedPath[] = []
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'dir') {
        walk(node.children)
        continue
      }
      const entry = byRow.get(node.path)?.shift()
      if (entry) ordered.push(entry)
    }
  }
  walk(buildTree(entries))
  return ordered
}
