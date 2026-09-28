import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { SessionView } from '../../../shared/config'
import type { ChangedPath } from '../../../shared/files'
import { keptReason } from '../lib/discard-view'
import { followAppTheme } from '../lib/monaco-setup'
import type { PaneBounds } from '../lib/pane-layout'
import type { UseFiles } from '../lib/use-files'
import { DiscardConfirm, type KeptRow } from './DiscardConfirm'
import { FileTabs } from './FileTabs'
import { FileTree } from './FileTree'
import { ResizablePane } from './ResizablePane'
import './FilesView.css'

interface FilesViewProps {
  /** The selected worktree's path; null when nothing is selected (FXPL-03). */
  worktreePath: string | null
  /** The selection names a worktree the tree no longer holds (spec §Edge Cases). */
  pathMissing: boolean
  files: UseFiles
  /** The launcher's existing failure toast (FXPL-30). */
  onToast: (message: string) => void
  /**
   * Sessions running in this worktree, by the remove-worktree confirmation's
   * rule, for the discard confirmation's warning (FDSC-12/13).
   */
  runningSessions: SessionView[]
  /** A discard finished: App re-reads the tree, so the status bar count moves (FDSC-31). */
  onDiscarded: () => void
}

/** The tree column's drag range, in the spirit of the sidebar's (PANE-02). */
const TREE_BOUNDS: PaneBounds = { min: 200, max: 480 }
const TREE_DEFAULT_WIDTH = 280

/**
 * The Files direction (FXPL-02): the tree on the left, the tabs and their
 * viewer on the right, split by the same draggable pane the sidebar uses.
 *
 * Both of the states where there is nothing to browse are answered here rather
 * than inside the two columns: with no selection the direction asks for one
 * (FXPL-03), and a selected worktree whose folder is gone shows the
 * path-missing state with neither tree nor tabs (spec §Edge Cases).
 *
 * The split's width is not persisted. No requirement asks for it, and the
 * PANE-01 persistence belongs to the two panes the Tree direction owns.
 */
export function FilesView({
  worktreePath,
  pathMissing,
  files,
  onToast,
  runningSessions,
  onDiscarded
}: FilesViewProps): JSX.Element {
  const [width, setWidth] = useState(TREE_DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = useState(false)
  // The discard the confirmation shows, captured when it opened: what is
  // confirmed is exactly this list, whatever the tree lists by then (FDSC-45).
  const [pending, setPending] = useState<ChangedPath[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [kept, setKept] = useState<KeptRow[] | null>(null)

  const onDiscard = (entries: ChangedPath[]): void => {
    if (entries.length === 0) return
    setKept(null)
    setPending(entries)
  }

  const confirmDiscard = (): void => {
    if (!pending || busy) return
    setBusy(true)
    void files.discard(pending).then((result) => {
      onDiscarded()
      const rows = result.files.flatMap((file) =>
        file.kept ? [{ path: file.path, reason: keptReason(file.kept) }] : []
      )
      setBusy(false)
      // FDSC-19/20: a clean discard closes with no message; a kept file keeps
      // the dialog open as the list of what was left.
      if (rows.length === 0) setPending(null)
      else setKept(rows)
    })
  }

  const closeDiscard = (): void => {
    setPending(null)
    setKept(null)
  }

  // Monaco's theme is global, not per editor, so it is followed once for the
  // whole direction. F1 set it inside `CodeViewer` because a file tab was the
  // only thing that mounted an editor; F2's All changes stack mounts up to
  // twelve at a time, and a dozen observers writing the same global is a dozen
  // too many.
  useEffect(() => followAppTheme(), [])

  if (pathMissing) {
    return (
      <div className="files-view">
        <div className="files-view-empty">
          This worktree&rsquo;s folder is gone from disk. There is nothing to browse.
        </div>
      </div>
    )
  }

  if (!worktreePath) {
    return (
      <div className="files-view">
        <div className="files-view-empty">Select a worktree to browse its files.</div>
      </div>
    )
  }

  return (
    <div className="files-view">
      <ResizablePane
        side="right"
        width={width}
        collapsed={collapsed}
        bounds={TREE_BOUNDS}
        onWidthChange={setWidth}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        railLabel="Expand the file tree"
      >
        <FileTree
          worktreePath={worktreePath}
          files={files}
          onToast={onToast}
          onDiscard={onDiscard}
        />
      </ResizablePane>
      <FileTabs worktreePath={worktreePath} files={files} onToast={onToast} onDiscard={onDiscard} />
      {pending && (
        <DiscardConfirm
          entries={pending}
          runningSessions={runningSessions}
          busy={busy}
          kept={kept}
          onCancel={closeDiscard}
          onConfirm={confirmDiscard}
          onClose={closeDiscard}
        />
      )}
    </div>
  )
}
