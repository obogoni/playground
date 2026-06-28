import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { WorkspaceNode } from '../../../shared/tree'
import { api } from './api'
import { selectionAfterRefresh, selectionAfterRemove } from './tree-selection'

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

  const refreshTree = useCallback((): void => {
    api
      .invoke('tree:get')
      .then((next) => {
        setTree(next)
        setSelectedId((id) => selectionAfterRefresh(next, id))
      })
      .catch(console.error)
  }, [])

  const refreshAndSelect = useCallback((path: string): void => {
    api
      .invoke('tree:get')
      .then((next) => {
        setTree(next)
        setSelectedId(path)
      })
      .catch(console.error)
  }, [])

  const refreshAndSelectDefault = useCallback((repoPath: string): void => {
    api
      .invoke('tree:get')
      .then((next) => {
        setTree(next)
        setSelectedId(selectionAfterRemove(next, repoPath))
      })
      .catch(console.error)
  }, [])

  return { tree, selectedId, setSelectedId, refreshTree, refreshAndSelect, refreshAndSelectDefault }
}
