import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { ChangedPath, DiffRequest, DiffSides, FileStat } from '../../../shared/files'
import type { ChangeStatus } from '../../../shared/worktrees'
import { api } from '../lib/api'
import { DiffViewer, type DiffHandle } from './DiffViewer'
import { FilePlaceholder } from './FilePlaceholder'
import { Icon } from './Icon'
import './DiffSection.css'

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

/** Monaco's default line height at the app's font size, near enough to estimate with. */
const LINE_HEIGHT = 19
/** Floor and ceiling for a guess, so one huge file does not invent a mile of scrollbar. */
const MIN_LINES = 6
const MAX_LINES = 60

/**
 * How tall this section probably is, before an editor has ever measured it.
 *
 * Without a guess every section is zero high until it mounts, and the scrollbar
 * jumps under the reader as the stack fills in. The changed lines plus the
 * context the fold keeps around them (FDIF-13) is the closest number available
 * without reading the file.
 */
function estimatedHeight(stat: FileStat): number {
  const lines = stat.uncountable ? MIN_LINES : stat.added + stat.removed + 8
  return Math.min(Math.max(lines, MIN_LINES), MAX_LINES) * LINE_HEIGHT
}

interface DiffSectionProps {
  /** The worktree the diff is read in, absolute. */
  worktreePath: string
  changed: ChangedPath
  stat: FileStat
  /** Both sides, or null when there is no diff to build (a base that stopped resolving). */
  request: DiffRequest | null
  expanded: boolean
  /** The mount plan allows this section an editor right now (FDIF-22). */
  mounted: boolean
  layout: 'side-by-side' | 'inline'
  ignoreWhitespace: boolean
  /** Bumped when every open diff must re-read against a new git state (FDIF-31/32). */
  refreshToken: number
  onToggle: (path: string) => void
  /** The section's own box, so the stack's observer can watch it. */
  onElement: (path: string, element: HTMLElement | null) => void
  /** This section's editor navigation, or null while it holds none. */
  onHandle: (path: string, handle: DiffHandle | null) => void
}

/**
 * One file of the All changes stack (FDIF-19/22/23): a header that is always
 * there, and under it an editor only while the section is expanded and the
 * mount plan allows it.
 *
 * The header is the cheap part and the editor is the expensive one, which is
 * the whole point of the split: a 200-file branch renders 200 headers and at
 * most twelve editors (D1). While a section holds no editor it keeps the last
 * height one measured, so scrolling past it and back does not move everything
 * below it; until the first measurement it uses the estimate above.
 *
 * A binary file, or one too large to read, never mounts an editor at all: the
 * stats already say so, so the placeholder goes up without a round trip
 * (FDIF-23).
 */
export function DiffSection({
  worktreePath,
  changed,
  stat,
  request,
  expanded,
  mounted,
  layout,
  ignoreWhitespace,
  refreshToken,
  onToggle,
  onElement,
  onHandle
}: DiffSectionProps): JSX.Element {
  const [sides, setSides] = useState<DiffSides | null>(null)
  const [height, setHeight] = useState<number | null>(null)
  const path = changed.path

  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = boxRef.current
    onElement(path, element)
    return () => onElement(path, null)
  }, [path, onElement])

  // The sides are read when the section first holds an editor, and again
  // whenever the stack hands it a new request — which the stack re-derives from
  // every re-read of the mode's list, so an index or HEAD move lands here
  // (FDIF-31). `refreshToken` covers a refresh that leaves the list identical.
  useEffect(() => {
    if (!mounted || !expanded || !request || stat.uncountable) return
    let cancelled = false
    api
      .invoke('files:diff-sides', { worktreePath, request })
      .then((next) => {
        if (!cancelled) setSides(next)
      })
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [mounted, expanded, request, stat.uncountable, worktreePath, refreshToken])

  const held = height ?? estimatedHeight(stat)

  return (
    <div className="diff-section" data-path={path} ref={boxRef}>
      <button
        type="button"
        className="diff-section-header"
        aria-expanded={expanded}
        title={path}
        onClick={() => onToggle(path)}
      >
        <span className={`diff-section-chevron${expanded ? ' open' : ''}`}>
          <Icon name="chevron-down" size={13} />
        </span>
        <span
          className={`diff-section-pill ${changed.status}`}
          title={STATUS_LABEL[changed.status]}
        >
          {STATUS_LETTER[changed.status]}
        </span>
        <span className="diff-section-path">{path}</span>
        {!stat.uncountable && (
          <span className="diff-section-counts">
            <span className="added">+{stat.added}</span>
            <span className="removed">&minus;{stat.removed}</span>
          </span>
        )}
      </button>

      {expanded &&
        (stat.uncountable ? (
          // The reason comes from main, so a 2 MB text file reads the same here
          // as it does in its own tab rather than being called binary.
          <FilePlaceholder path={path} kind={stat.uncountable} />
        ) : mounted && sides ? (
          <DiffViewer
            path={path}
            sides={sides}
            layout={layout}
            ignoreWhitespace={ignoreWhitespace}
            fitContent
            onHeight={setHeight}
            onHandle={(handle) => onHandle(path, handle)}
          />
        ) : (
          // Not mounted, or mounted and still reading: either way the section
          // holds the space its editor had, so nothing below it moves.
          <div className="diff-section-hold" style={{ height: held }} />
        ))}
    </div>
  )
}
