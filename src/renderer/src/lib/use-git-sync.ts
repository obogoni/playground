import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommitLists, GitOp, GitOpResult, SyncState } from '../../../shared/git'
import type { WorkspaceNode } from '../../../shared/tree'
import { api } from './api'

export interface UseGitSyncOptions {
  /** The worktree the bar describes; null for a folder or no selection. */
  targetPath: string | null
  /** The tree snapshot; a new identity means the tree refreshed (STBR-11). */
  tree: WorkspaceNode[]
  /** The worktree whose sync popover is open, or null when it is closed (STBR-26). */
  popoverPath: string | null
  /** Report an outcome whose popover is no longer on screen (STBR-26). */
  onToast: (message: string) => void
  /** Refresh the tree after a successful operation (STBR-25). */
  onRefreshTree: () => void
}

/** The last finished operation for a worktree, rendered inline by the popover. */
export interface OpOutcome {
  op: GitOp
  result: GitOpResult
}

export interface UseGitSync {
  /** Sync state of `targetPath`; null until it loads, and for no target. */
  state: SyncState | null
  /** Commit lists of `targetPath`, loaded while its popover is open (STBR-15). */
  commits: CommitLists | null
  /** The operation running for `targetPath`, if any (STBR-23). */
  running: GitOp | null
  /** The last finished operation for `targetPath`, if not cleared (STBR-18/24). */
  outcome: OpOutcome | null
  /** Run an operation on `targetPath`; it outlives a selection change (STBR-26). */
  run: (op: GitOp, remote?: string) => void
  /** Load `targetPath`'s commit lists and forget its last outcome — on popover open. */
  openPopover: () => void
}

const OP_LABEL: Record<GitOp, string> = {
  sync: 'Sync',
  pull: 'Pull',
  push: 'Push',
  fetch: 'Fetch',
  publish: 'Publish'
}

/** One line for a toast: which operation, where, and how it ended (STBR-26). */
function outcomeToast(path: string, { op, result }: OpOutcome): string {
  const where = path.split(/[\\/]/).filter(Boolean).pop() ?? path
  if (result.ok) return `${OP_LABEL[op]} finished in ${where}`
  if (result.timedOut) return `${OP_LABEL[op]} timed out in ${where}`
  return `${OP_LABEL[op]} failed in ${where}: ${result.error ?? 'unknown error'}`
}

/**
 * Owns the status bar's git state (AD-004): the sync state and commit lists of
 * the described worktree, and every running operation keyed by worktree path —
 * never by the current selection — so an operation outlives a selection change
 * (STBR-26) and the buttons disable per path (STBR-23). Reads are local refs
 * only; the network is touched only by `run` (STBR-10).
 */
export function useGitSync({
  targetPath,
  tree,
  popoverPath,
  onToast,
  onRefreshTree
}: UseGitSyncOptions): UseGitSync {
  // Each read is stored with the path it describes, so a late answer for a
  // previous selection is never shown as the current one's.
  const [state, setState] = useState<{ path: string; state: SyncState } | null>(null)
  const [commits, setCommits] = useState<{ path: string; commits: CommitLists } | null>(null)
  const [ops, setOps] = useState<ReadonlyMap<string, GitOp>>(new Map())
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, OpOutcome>>(new Map())

  // Read at completion time, which is renders after the one that started the
  // op: whether its popover is still open decides inline vs toast (STBR-26).
  const popoverPathRef = useRef(popoverPath)
  const onToastRef = useRef(onToast)
  const onRefreshTreeRef = useRef(onRefreshTree)
  // A read answers after the selection may have moved on. Storing a late answer
  // would replace the current target's state with another path's, which the
  // return below then hides, leaving the section on `…` until the next refresh.
  const targetPathRef = useRef(targetPath)
  useEffect(() => {
    targetPathRef.current = targetPath
    popoverPathRef.current = popoverPath
    onToastRef.current = onToast
    onRefreshTreeRef.current = onRefreshTree
  })

  const loadState = useCallback((path: string): void => {
    api
      .invoke('git:sync-state', { worktreePath: path })
      .then((next) => {
        if (targetPathRef.current === path) setState({ path, state: next })
      })
      .catch(console.error)
  }, [])

  const loadCommits = useCallback((path: string): void => {
    api
      .invoke('git:commits', { worktreePath: path })
      .then((next) => {
        if (targetPathRef.current === path) setCommits({ path, commits: next })
      })
      .catch(console.error)
  }, [])

  // Recompute on a new target and on every tree refresh (STBR-11); the commit
  // lists follow while the popover shows them.
  useEffect(() => {
    if (targetPath === null) return
    loadState(targetPath)
    if (popoverPathRef.current === targetPath) loadCommits(targetPath)
  }, [targetPath, tree, loadState, loadCommits])

  const run = useCallback(
    (op: GitOp, remote?: string): void => {
      const path = targetPath
      if (path === null) return
      setOps((prev) => new Map(prev).set(path, op))
      setOutcomes((prev) => {
        const next = new Map(prev)
        next.delete(path)
        return next
      })
      api
        .invoke('git:run', { worktreePath: path, op, remote })
        .catch((err): GitOpResult => ({ ok: false, error: String(err) }))
        .then((result) => {
          const outcome = { op, result }
          setOps((prev) => {
            const next = new Map(prev)
            next.delete(path)
            return next
          })
          setOutcomes((prev) => new Map(prev).set(path, outcome))
          if (result.ok) {
            // STBR-25: recompute the counters and refresh the tree.
            loadState(path)
            if (popoverPathRef.current === path) loadCommits(path)
            onRefreshTreeRef.current()
          }
          // STBR-26: the popover that started it is gone, so say it here.
          if (popoverPathRef.current !== path) onToastRef.current(outcomeToast(path, outcome))
        })
    },
    [targetPath, loadState, loadCommits]
  )

  const openPopover = useCallback((): void => {
    if (targetPath === null) return
    setOutcomes((prev) => {
      const next = new Map(prev)
      next.delete(targetPath)
      return next
    })
    loadCommits(targetPath)
  }, [targetPath, loadCommits])

  return {
    state: state && state.path === targetPath ? state.state : null,
    commits: commits && commits.path === targetPath ? commits.commits : null,
    running: targetPath === null ? null : (ops.get(targetPath) ?? null),
    outcome: targetPath === null ? null : (outcomes.get(targetPath) ?? null),
    run,
    openPopover
  }
}
