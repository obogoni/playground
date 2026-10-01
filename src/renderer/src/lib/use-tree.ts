import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { WorkspaceNode } from '../../../shared/tree'
import { api } from './api'
import { createListenerSet } from './listener-set'
import { selectionAfterRefresh, selectionAfterRemove } from './tree-selection'
import { patchWorktreeStatus } from './tree-status'

export interface UseTree {
  tree: WorkspaceNode[]
  selectedId: string | null
  setSelectedId: Dispatch<SetStateAction<string | null>>
  /** Refresh the tree, preserving the selection only if its worktree still exists. */
  refreshTree: () => void
  /** Refresh and select the worktree at `path` (after a create). */
  refreshAndSelect: (path: string) => void
  /** Refresh and land on the repo's default checkout (after a remove). */
  refreshAndSelectDefault: (repoPath: string) => void
  /** Recount one worktree's changes and patch them in; a failed recount keeps the last count (SCRF-06/07). */
  recount: (worktreePath: string) => void
  /** Bumped on every `tree:get` result, so a consumer can re-read on a full
   *  refresh without depending on tree identity (PERF-13, STBR-11). */
  treeRevision: number
  /** Subscribes to every recount result, changed or not, with the worktree's
   *  path; returns the unsubscribe. Stable for the hook's lifetime (PERF-12, AD-052). */
  onRecounted: (cb: (worktreePath: string) => void) => () => void
}

/**
 * Owns the worktree tree and the current selection, plus the three refresh
 * variants that differ only in how they reconcile the selection afterwards.
 * Extracted from App so the orchestration lives in one place and the selection
 * logic is unit-tested via `tree-selection`.
 */
export function useTree(): UseTree {
  const [tree, setTree] = useState<WorkspaceNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [treeRevision, setTreeRevision] = useState(0)
  // A listener set, not state: a recount that changes nothing must not
  // re-render App (PERF-11), yet the status bar still hears about it.
  const [recounted] = useState(() => createListenerSet<string>())
  const bumpRevision = useCallback((): void => setTreeRevision((r) => r + 1), [])

  const refreshTree = useCallback((): void => {
    api
      .invoke('tree:get')
      .then((next) => {
        setTree(next)
        bumpRevision()
        setSelectedId((id) => selectionAfterRefresh(next, id))
      })
      .catch(console.error)
  }, [bumpRevision])

  const refreshAndSelect = useCallback(
    (path: string): void => {
      api
        .invoke('tree:get')
        .then((next) => {
          setTree(next)
          bumpRevision()
          setSelectedId(path)
        })
        .catch(console.error)
    },
    [bumpRevision]
  )

  const refreshAndSelectDefault = useCallback(
    (repoPath: string): void => {
      api
        .invoke('tree:get')
        .then((next) => {
          setTree(next)
          bumpRevision()
          setSelectedId(selectionAfterRemove(next, repoPath))
        })
        .catch(console.error)
    },
    [bumpRevision]
  )

  const recount = useCallback(
    (worktreePath: string): void => {
      api
        .invoke('worktrees:status', { worktreePath })
        .then((status) => {
          if (!status) return
          setTree((prev) => patchWorktreeStatus(prev, worktreePath, status))
          recounted.emit(worktreePath)
        })
        .catch(console.error)
    },
    [recounted]
  )

  // Main recounts a worktree whenever its git state moves (SCRF-01); the push
  // patches only a worktree the tree still holds, so a full rebuild that
  // dropped it wins.
  useEffect(
    () =>
      api.on('worktree:status', ({ worktreePath, dirty, changes }) => {
        setTree((prev) => patchWorktreeStatus(prev, worktreePath, { dirty, changes }))
        recounted.emit(worktreePath)
      }),
    [recounted]
  )

  return {
    tree,
    selectedId,
    setSelectedId,
    refreshTree,
    refreshAndSelect,
    refreshAndSelectDefault,
    recount,
    treeRevision,
    onRecounted: recounted.add
  }
}
