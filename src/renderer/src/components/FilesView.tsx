import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { followAppTheme } from '../lib/monaco-setup'
import type { PaneBounds } from '../lib/pane-layout'
import type { UseFiles } from '../lib/use-files'
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
  onToast
}: FilesViewProps): JSX.Element {
  const [width, setWidth] = useState(TREE_DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = useState(false)

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
        <FileTree worktreePath={worktreePath} files={files} onToast={onToast} />
      </ResizablePane>
      <FileTabs worktreePath={worktreePath} files={files} onToast={onToast} />
    </div>
  )
}
