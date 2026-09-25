import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { FilesMode } from '../../../shared/files'
import type { ChangeStatus } from '../../../shared/worktrees'
import { api } from '../lib/api'
import { CommitList } from './CommitList'
import { buildTree, isSolution, type TreeNode } from '../lib/files-view'
import { absoluteIn, type UseFiles } from '../lib/use-files'
import { Icon } from './Icon'
import './FileTree.css'

interface FileTreeProps {
  /** The selected worktree, absolute — what the launchers and reads are rooted at. */
  worktreePath: string
  files: UseFiles
  /** The launcher's existing failure toast (FXPL-30). */
  onToast: (message: string) => void
}

/** The three lenses of FXPL-07, in the order the spec lists them. */
const MODES: { mode: FilesMode; label: string }[] = [
  { mode: 'full', label: 'Folder' },
  { mode: 'since-base', label: 'Diff to origin' },
  { mode: 'uncommitted', label: 'Uncommitted' },
  { mode: 'commits', label: 'Commits' }
]

const STATUS_LETTER: Record<ChangeStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U'
}

const STATUS_LABEL: Record<ChangeStatus, string> = {
  modified: 'Modified',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
  untracked: 'Untracked'
}

/** Rows nest by padding, not by nested boxes: a deep tree stays one flat list. */
function indent(depth: number): { paddingLeft: number } {
  return { paddingLeft: 8 + depth * 13 }
}

interface FolderRowsProps {
  dir: string
  depth: number
  files: UseFiles
  onFile: (path: string) => void
}

/**
 * One folder of the full-folder mode. Children are listed when the folder opens
 * and kept afterwards, so expanding costs exactly one `files:list-dir`
 * (FXPL-05); a git failure renders in place of the rows (edge case).
 */
function FolderRows({ dir, depth, files, onFile }: FolderRowsProps): JSX.Element {
  const listing = files.entries[dir]
  if (!listing) return <div className="file-tree-note">Loading…</div>
  if (listing.error) return <div className="file-tree-error">{listing.error}</div>
  return (
    <>
      {listing.entries.map((entry) =>
        entry.kind === 'file' ? (
          <button
            key={entry.path}
            type="button"
            className="file-tree-row"
            style={indent(depth)}
            title={entry.path}
            onClick={() => onFile(entry.path)}
          >
            <Icon name="file" size={13} />
            <span className="file-tree-name">{entry.name}</span>
          </button>
        ) : (
          <div key={entry.path}>
            <button
              type="button"
              className="file-tree-row"
              style={indent(depth)}
              aria-expanded={files.expanded.includes(entry.path)}
              title={entry.path}
              onClick={() => {
                files.selectFolder(entry.path)
                files.toggleFolder(entry.path)
              }}
            >
              <span
                className={`file-tree-chevron${files.expanded.includes(entry.path) ? ' open' : ''}`}
              >
                <Icon name="chevron-down" size={13} />
              </span>
              <span className="file-tree-name">{entry.name}</span>
            </button>
            {files.expanded.includes(entry.path) && (
              <FolderRows dir={entry.path} depth={depth + 1} files={files} onFile={onFile} />
            )}
          </div>
        )
      )}
    </>
  )
}

interface ChangedRowsProps {
  nodes: TreeNode[]
  depth: number
  onFile: (path: string, status: ChangeStatus) => void
  onFolder: (path: string) => void
}

/**
 * The nesting `buildTree` derives from a diff mode's flat list (FXPL-08/12).
 * The folders are invented by the nesting rather than listed, so they are drawn
 * open: there is nothing further to fetch for them.
 */
function ChangedRows({ nodes, depth, onFile, onFolder }: ChangedRowsProps): JSX.Element {
  return (
    <>
      {nodes.map((node) =>
        node.kind === 'file' ? (
          <button
            key={node.path}
            type="button"
            className="file-tree-row"
            style={indent(depth)}
            title={node.path}
            onClick={() => onFile(node.path, node.status)}
          >
            <span className={`file-tree-pill ${node.status}`} title={STATUS_LABEL[node.status]}>
              {STATUS_LETTER[node.status]}
            </span>
            <span className="file-tree-name">{node.name}</span>
          </button>
        ) : (
          <div key={node.path}>
            <button
              type="button"
              className="file-tree-row"
              style={indent(depth)}
              title={node.path}
              onClick={() => onFolder(node.path)}
            >
              <span className="file-tree-chevron open">
                <Icon name="chevron-down" size={13} />
              </span>
              <span className="file-tree-name">{node.name}</span>
            </button>
            <ChangedRows
              nodes={node.children}
              depth={depth + 1}
              onFile={onFile}
              onFolder={onFolder}
            />
          </div>
        )
      )}
    </>
  )
}

/**
 * The base the diff mode compares against, and every branch it could be
 * (FXPL-09/10/11). A repository whose branches could not be listed at all shows
 * git's line in a disabled control instead of an invitation to choose from a
 * list that does not exist (AD-032).
 */
function BasePicker({ files }: { files: UseFiles }): JSX.Element {
  const { bases } = files
  return (
    <div className="file-tree-base">
      <span className="file-tree-base-label">Base</span>
      {bases?.error ? (
        <select className="file-tree-base-select" value="" disabled>
          <option value="">{bases.error}</option>
        </select>
      ) : (
        <select
          className="file-tree-base-select"
          value={files.base ?? ''}
          onChange={(event) => files.setBase(event.target.value)}
        >
          {files.base === undefined && <option value="">Choose a base…</option>}
          {(bases?.branches ?? []).map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/**
 * The Files direction's left column: the mode selector of FXPL-07, the base
 * picker the diff mode needs, and the tree itself.
 *
 * A click opens the file in a tab. A solution opens in a tab too, but a DOUBLE
 * click on it opens VS 2026 instead (FXPL-28): launching an IDE is expensive to
 * undo, and a single click fired it twice for anyone who double-clicked out of
 * habit. Clicking a folder also records it as the launcher row's target, which
 * is the selection FXPL-26 compares against the active tab.
 */
export function FileTree({ worktreePath, files, onToast }: FileTreeProps): JSX.Element {
  /** How long a solution's first click waits to see whether a second follows. */
  const DOUBLE_CLICK_MS = 250
  /** A second launch of the same solution inside this window is ignored. */
  const RELAUNCH_GUARD_MS = 3000

  // A pending single click on a solution, and the last launch, so neither a
  // double click nor a burst of clicks can open two instances of the IDE.
  const pending = useRef<{ path: string; timer: number } | null>(null)
  const lastLaunch = useRef<{ path: string; at: number } | null>(null)
  useEffect(() => {
    return () => {
      if (pending.current) window.clearTimeout(pending.current.timer)
    }
  }, [])

  const launchSolution = (path: string): void => {
    const now = Date.now()
    const last = lastLaunch.current
    if (last && last.path === path && now - last.at < RELAUNCH_GUARD_MS) return
    lastLaunch.current = { path, at: now }
    api
      .invoke('shortcuts:launch', { tool: 'vs2026', path: absoluteIn(worktreePath, path) })
      .then((result) => {
        if (!result.ok) onToast(result.error ?? 'Launch failed')
      })
      .catch((err) => onToast(err instanceof Error ? err.message : String(err)))
  }

  /**
   * FDIF-01/02/10: in either diff mode a click opens the file's diff, never the
   * plain file view F1 stood in (FXPL-14, superseded). The row carries only the
   * path and the status, so the listed change is looked back up for the
   * `oldPath` a rename needs (FDIF-05).
   */
  const openInTab = (path: string, status?: ChangeStatus): void => {
    const lens = files.mode
    // Commits mode lists no paths, so nothing here can be clicked in it; it is
    // named alongside full-folder mode to keep the narrowing honest.
    if (lens === 'full' || lens === 'commits') {
      files.openFile(path)
      return
    }
    const listed = files.changedFiles.find((file) => file.path === path)
    files.openDiff(listed ?? { path, status: status ?? 'modified' }, lens)
  }

  const openFile = (path: string, status?: ChangeStatus): void => {
    // A solution the branch deleted has nothing to launch; it opens like any
    // other row of the list (AD-033 applies to the live ones).
    if (status === 'deleted' || !isSolution(path)) {
      openInTab(path, status)
      return
    }

    // Two clicks on the same solution inside the window are one double click:
    // drop the tab this click would have opened and launch the IDE instead.
    const waiting = pending.current
    if (waiting) {
      window.clearTimeout(waiting.timer)
      pending.current = null
      if (waiting.path === path) {
        launchSolution(path)
        return
      }
    }
    const timer = window.setTimeout(() => {
      pending.current = null
      openInTab(path, status)
    }, DOUBLE_CLICK_MS)
    pending.current = { path, timer }
  }

  return (
    <div className="file-tree">
      <div className="file-tree-modes" role="tablist" aria-label="Files mode">
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={files.mode === mode}
            className={`file-tree-mode${files.mode === mode ? ' active' : ''}`}
            onClick={() => files.setMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* FCMT-06: Commits mode compares against the same base, and shares its
          picker — two pickers would disagree silently. */}
      {(files.mode === 'since-base' || files.mode === 'commits') && <BasePicker files={files} />}

      <div className="file-tree-body">
        {files.mode === 'full' ? (
          <FolderRows dir="" depth={0} files={files} onFile={openFile} />
        ) : files.mode === 'commits' ? (
          <CommitList files={files} onToast={onToast} />
        ) : files.mode === 'uncommitted' ? (
          files.uncommitted.length === 0 ? (
            <div className="file-tree-note">No uncommitted changes.</div>
          ) : (
            <ChangedRows
              nodes={buildTree(files.uncommitted)}
              depth={0}
              onFile={openFile}
              onFolder={files.selectFolder}
            />
          )
        ) : (
          <SinceBase files={files} onFile={openFile} />
        )}
      </div>
    </div>
  )
}

/**
 * What the diff-to-origin mode lists (FXPL-08), or why it lists nothing. With
 * no base the mode stays empty and asks for one (FXPL-11); a base that has since
 * been deleted fails the merge-base and lands on that same prompt (edge case).
 */
function SinceBase({
  files,
  onFile
}: {
  files: UseFiles
  onFile: (path: string, status: ChangeStatus) => void
}): JSX.Element {
  // AD-032: the branches could not be listed, so there is no base to choose and
  // no prompt to show — only what git said.
  if (files.bases?.error) return <div className="file-tree-error">{files.bases.error}</div>
  // The default base is not known until `files:bases` answers; asking for one
  // before that would prompt for something the repository may already provide.
  if (!files.bases) return <div className="file-tree-note">Loading…</div>
  if (files.base === undefined) {
    return <div className="file-tree-note">Choose a base branch to compare this branch with.</div>
  }
  const { changed } = files
  if (!changed) return <div className="file-tree-note">Loading…</div>
  if (changed.error) {
    return (
      <div className="file-tree-note">
        Choose a base branch to compare this branch with.
        <div className="file-tree-error">{changed.error}</div>
      </div>
    )
  }
  if (changed.files.length === 0) {
    return <div className="file-tree-note">Nothing changed since {files.base}.</div>
  }
  return (
    <ChangedRows
      nodes={buildTree(changed.files)}
      depth={0}
      onFile={onFile}
      onFolder={files.selectFolder}
    />
  )
}
