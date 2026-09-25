import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { ShortcutTool } from '../../../shared/shortcuts'
import { api } from '../lib/api'
import { commitTabTitle } from '../lib/commit-view'
import { tabKeyOf } from '../lib/diff-view'
import type { DiffTab, FileTab, StripTab, UseFiles } from '../lib/use-files'
import { AllChangesTab } from './AllChangesTab'
import { CodeViewer } from './CodeViewer'
import { CommitTab } from './CommitTab'
import { DiffViewer, type DiffHandle } from './DiffViewer'
import { FilePlaceholder } from './FilePlaceholder'
import { Icon, type IconName } from './Icon'
import './FileTabs.css'

interface FileTabsProps {
  /** The selected worktree, absolute — what the All changes stack reads in. */
  worktreePath: string
  files: UseFiles
  /** The launcher's existing failure toast (FXPL-30). */
  onToast: (message: string) => void
}

/** The launcher row of FXPL-25, in the order the requirement lists it. */
const LAUNCHERS: { tool: ShortcutTool; label: string; icon: IconName }[] = [
  { tool: 'explorer', label: 'File Explorer', icon: 'folder' },
  { tool: 'vscode', label: 'VS Code', icon: 'code' },
  { tool: 'vs2022', label: 'VS 2022', icon: 'shield' },
  { tool: 'vs2026', label: 'VS 2026', icon: 'shield' }
]

/**
 * VS Code's own binding for next / previous change in its diff editor, read out
 * of the installed build by the F2 spike: `Alt+F5` and `Shift+Alt+F5`
 * (FDIF-25). Not F7, which most references still name and which now belongs to
 * the accessible diff viewer.
 *
 * One listener for the whole column, here rather than inside each editor: the
 * strip is what knows whether a diff tab or the All changes stack is in front
 * of the reader, and the stack answers the same keys by walking across files
 * (FDIF-26). Twelve mounted editors each binding the key would race for it.
 */
function changeShortcut(event: KeyboardEvent): 'next' | 'previous' | null {
  if (event.key !== 'F5' || !event.altKey || event.ctrlKey || event.metaKey) return null
  return event.shiftKey ? 'previous' : 'next'
}

/** What an open file shows: the file, or why it cannot be shown. */
function FileBody({ tab }: { tab: FileTab }): JSX.Element {
  if (!tab.content) return <div className="file-tabs-note">Loading…</div>
  const content = tab.content
  switch (content.kind) {
    case 'text':
      return <CodeViewer path={tab.path} text={content.text} />
    case 'binary':
      return <FilePlaceholder path={tab.path} kind="binary" size={content.size} />
    case 'too-large':
      return <FilePlaceholder path={tab.path} kind="too-large" size={content.size} />
    case 'missing':
      return <FilePlaceholder path={tab.path} kind="missing" />
    case 'error':
      return <div className="file-tabs-error">{content.message}</div>
  }
}

/** What an open diff shows, or why it has nothing to compare. */
function DiffBody({
  files,
  tab,
  onHandle
}: {
  files: UseFiles
  tab: DiffTab
  onHandle: (handle: DiffHandle | null) => void
}): JSX.Element {
  // The base stopped resolving, so there is no second side. F1's prompt takes
  // the diff's place rather than the picture it last held (spec §Edge Cases).
  if (tab.mode === 'since-base' && files.changed !== null && files.changed.mergeBase === null) {
    return <div className="file-tabs-note">Choose a base branch to compare this branch with.</div>
  }
  if (!tab.sides) return <div className="file-tabs-note">Loading…</div>
  return (
    <DiffViewer
      path={tab.path}
      sides={tab.sides}
      layout={files.diffLayout}
      ignoreWhitespace={files.diffIgnoreWhitespace}
      onHandle={onHandle}
    />
  )
}

/**
 * The Files direction's right column: the tab strip (FXPL-16/18/19, FDIF-17),
 * the diff controls and the launcher row under it (FXPL-25), and the active
 * tab's viewer or placeholder.
 *
 * In both diff modes the strip opens with **All changes**, which has no close
 * button and is derived from the mode rather than stored, so it follows a mode
 * switch while the diff tabs beside it keep comparing what they were opened on
 * (FDIF-09/17/18). A diff tab carries a glyph so it reads apart from the file
 * tab of the same path.
 *
 * The launchers act on `launchTarget`, which is the active tab's file — a diff
 * tab's file exactly as a file tab's (FDIF-29) — unless a folder was clicked in
 * the tree more recently (FXPL-26). With nothing picked at all they are
 * disabled rather than hidden: FXPL-25 puts them under the tabs
 * unconditionally, and a row that comes and goes reads as a bug.
 *
 * **This is the only launcher row on screen.** `FilePlaceholder` was built with
 * one of its own (T15) because FXPL-20 asks a binary tab for "the launchers";
 * that row is gone now, because this one sits in the same column, is always
 * visible above the placeholder, and targets the same file.
 *
 * Only the active tab is mounted, keyed by its tab key, so Monaco creates one
 * editor per tab and disposes it when the tab loses focus or closes.
 */
export function FileTabs({ worktreePath, files, onToast }: FileTabsProps): JSX.Element {
  const active: StripTab | null =
    files.strip.find((tab) => tabKeyOf(tab) === files.activeTab) ?? null

  // Whatever diff surface is in front of the reader — one editor, or the whole
  // stack answering for the section the walk is standing in.
  const handle = useRef<DiffHandle | null>(null)
  const [navigable, setNavigable] = useState(false)
  const onHandle = useCallback((next: DiffHandle | null): void => {
    handle.current = next
    setNavigable(next !== null)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const direction = changeShortcut(event)
      if (!direction) return
      event.preventDefault()
      handle.current?.goToDiff(direction)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const launch = (tool: ShortcutTool): void => {
    const path = files.launchTarget
    if (!path) return
    api
      .invoke('shortcuts:launch', { tool, path })
      .then((result) => {
        if (!result.ok) onToast(result.error ?? 'Launch failed')
      })
      .catch((err) => onToast(err instanceof Error ? err.message : String(err)))
  }

  const onDiffSurface = active !== null && active.kind !== 'file'
  const diffTab = active?.kind === 'diff' ? active : null

  return (
    <div className="file-tabs">
      <div className="file-tabs-strip" role="tablist" aria-label="Open files">
        {files.strip.map((tab) => {
          const key = tabKeyOf(tab)
          const fixed = tab.kind === 'all-changes'
          // FCMT-04: a commit tab is named by its sha and subject, and carries
          // its whole message as the tooltip.
          const label =
            tab.kind === 'all-changes'
              ? 'All changes'
              : tab.kind === 'commit'
                ? commitTabTitle(tab.row)
                : (tab.path.split('/').pop() ?? tab.path)
          const title =
            tab.kind === 'all-changes'
              ? 'Every change in this mode'
              : tab.kind === 'commit'
                ? tab.row.message
                : tab.path
          return (
            <div
              key={key}
              className={`file-tab${key === files.activeTab ? ' active' : ''}${fixed ? ' fixed' : ''}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={key === files.activeTab}
                className="file-tab-label"
                title={title}
                onClick={() => files.focusTab(key)}
              >
                {tab.kind === 'diff' && (
                  <span className="file-tab-glyph" aria-hidden="true">
                    &plusmn;
                  </span>
                )}
                {label}
              </button>
              {/* FDIF-17: the fixed tab cannot be closed, so it carries no close button. */}
              {!fixed && (
                <button
                  type="button"
                  className="file-tab-close"
                  aria-label={`Close ${title}`}
                  title="Close"
                  onClick={() => files.closeTab(key)}
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {onDiffSurface && (
        <div className="file-tabs-controls" aria-label="Diff controls">
          {/* FDIF-12/16: one global choice, applied to every open diff at once. */}
          <button
            type="button"
            className="file-tabs-toggle"
            aria-pressed={files.diffLayout === 'inline'}
            title="Show the diff inline instead of side by side"
            onClick={() =>
              files.setDiffLayout(files.diffLayout === 'inline' ? 'side-by-side' : 'inline')
            }
          >
            Inline
          </button>
          <button
            type="button"
            className="file-tabs-toggle"
            aria-pressed={files.diffIgnoreWhitespace}
            title="Hide leading and trailing whitespace changes, and line-ending changes with them"
            onClick={() => files.setDiffIgnoreWhitespace(!files.diffIgnoreWhitespace)}
          >
            Ignore whitespace
          </button>
          <span className="file-tabs-controls-gap" />
          {/* FDIF-25: the same move the Alt+F5 binding makes. */}
          <button
            type="button"
            className="file-tabs-nav"
            disabled={!navigable}
            aria-label="Previous change"
            title="Previous change (Shift+Alt+F5)"
            onClick={() => handle.current?.goToDiff('previous')}
          >
            <Icon name="chevron-down" size={14} />
          </button>
          <button
            type="button"
            className="file-tabs-nav next"
            disabled={!navigable}
            aria-label="Next change"
            title="Next change (Alt+F5)"
            onClick={() => handle.current?.goToDiff('next')}
          >
            <Icon name="chevron-down" size={14} />
          </button>
          {/* FDIF-27/28: the whole file, unless the change is its deletion. */}
          {diffTab && diffTab.changed.status !== 'deleted' && (
            <button
              type="button"
              className="file-tabs-toggle"
              title={`Open ${diffTab.path} as a file`}
              onClick={() => files.openFile(diffTab.path)}
            >
              Open file
            </button>
          )}
        </div>
      )}

      <div className="file-tabs-launchers">
        {LAUNCHERS.map(({ tool, label, icon }) => (
          <button
            key={tool}
            type="button"
            className="file-tabs-launcher"
            disabled={files.launchTarget === null}
            title={files.launchTarget ?? 'Open a file or pick a folder first'}
            onClick={() => launch(tool)}
          >
            <Icon name={icon} size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="file-tabs-body">
        {active === null ? (
          // FXPL-19: closing the last tab leaves this, not a blank column.
          <div className="file-tabs-empty">No file open. Pick one in the tree.</div>
        ) : active.kind === 'all-changes' ? (
          <AllChangesTab
            key={`all-changes:${files.mode}`}
            worktreePath={worktreePath}
            files={files.changedFiles}
            stats={files.stats}
            requestFor={files.requestFor}
            layout={files.diffLayout}
            ignoreWhitespace={files.diffIgnoreWhitespace}
            refreshToken={files.refreshToken}
            onHandle={onHandle}
          />
        ) : active.kind === 'diff' ? (
          <DiffBody key={tabKeyOf(active)} files={files} tab={active} onHandle={onHandle} />
        ) : active.kind === 'commit' ? (
          <CommitTab
            key={tabKeyOf(active)}
            worktreePath={worktreePath}
            tab={active}
            layout={files.diffLayout}
            ignoreWhitespace={files.diffIgnoreWhitespace}
            onHandle={onHandle}
          />
        ) : (
          <FileBody key={tabKeyOf(active)} tab={active} />
        )}
      </div>
    </div>
  )
}
