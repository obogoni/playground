import { useCallback } from 'react'
import type { JSX } from 'react'
import type { ChangedPath, DiffRequest } from '../../../shared/files'
import { commitDiffRequest } from '../lib/commit-view'
import type { CommitTab as CommitTabState } from '../lib/use-files'
import { AllChangesTab } from './AllChangesTab'
import type { DiffHandle } from './DiffViewer'

/**
 * A commit's diffs, exactly as F2 stacks a mode's (FCMT-16/19).
 *
 * All this component decides is *which* two revisions each file compares:
 * `parent` → `sha`. Everything else — the sections, the totals, the
 * navigation, the layout and whitespace preferences, the line-ending markers —
 * is F2's `AllChangesTab`, mounted unmodified, which is why F2's design made it
 * take its data through props.
 */
export function CommitTab({
  worktreePath,
  tab,
  layout,
  ignoreWhitespace,
  onHandle
}: {
  worktreePath: string
  tab: CommitTabState
  layout: 'side-by-side' | 'inline'
  ignoreWhitespace: boolean
  onHandle?: (handle: DiffHandle | null) => void
}): JSX.Element {
  const { detail } = tab
  const parent = detail?.parent ?? null
  const requestFor = useCallback(
    (changed: ChangedPath): DiffRequest => commitDiffRequest(tab.sha, parent, changed),
    [tab.sha, parent]
  )

  if (!detail) return <div className="file-tree-note">Loading…</div>
  // The edge case an aggressive `gc` produces: git's line, not a stale stack.
  if (detail.error) return <div className="file-tree-error">{detail.error}</div>

  return (
    <AllChangesTab
      worktreePath={worktreePath}
      files={detail.files}
      stats={detail.stats}
      requestFor={requestFor}
      layout={layout}
      ignoreWhitespace={ignoreWhitespace}
      // A commit is immutable, so its sides can never need re-reading: the
      // token that makes the mode's stack re-read against a moved HEAD would
      // only make this one fetch the same two revisions again (FCMT-31).
      refreshToken={0}
      onHandle={onHandle}
    />
  )
}
