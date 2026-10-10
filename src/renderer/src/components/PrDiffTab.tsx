import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { PrSelection } from '../../../shared/files'
import { tabKeyOf } from '../lib/diff-view'
import { zonesForFile } from '../lib/pr-view'
import type { PrDiffTab as PrDiffTabState, UseFiles } from '../lib/use-files'
import { CommentComposer } from './CommentComposer'
import { DiffViewer, type DiffHandle, type DiffZone, type ModifiedSelection } from './DiffViewer'
import { PrThread } from './PrThread'
import './PrDiffTab.css'

/** A new thread being written: the selection it is anchored to, and the iteration it was made on. */
interface Draft {
  selection: PrSelection
  iteration: number
}

/**
 * One file of the pull request, as its reviewers see it (FPRA-16..18, 27, 28).
 *
 * Both sides are read from the provider at the latest iteration — the merge
 * base and the source commit — never from the local repository. F2's viewer
 * shows them with every preference the other diffs have: layout, whitespace,
 * folding, navigation, line endings (FPRA-17). Each thread the provider
 * places in this file is drawn under its line, on its side (FPRA-18).
 *
 * A selection on the modified side offers Comment, which opens a composer
 * under the selection anchored to its lines and columns at the iteration on
 * screen (FPRA-27). The viewer reports no selection of the original side, so
 * there is never a Comment there (FPRA-28).
 */
export function PrDiffTab({
  files,
  tab,
  onHandle,
  onToast
}: {
  files: UseFiles
  tab: PrDiffTabState
  onHandle: (handle: DiffHandle | null) => void
  onToast: (message: string) => void
}): JSX.Element {
  const { pr } = files
  const key = tabKeyOf(tab)
  const entry = pr.sidesFor(key)
  const [selection, setSelection] = useState<ModifiedSelection | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  // Read once per iteration: the banner's reload drops the entry, and the
  // tab reads again.
  const { readSides } = pr
  useEffect(() => {
    if (!entry) readSides(tab.pr, tab.file)
  }, [entry, readSides, tab.pr, tab.file])

  // Threads and writes belong to the pull request shown; a tab left open on
  // another one keeps its sides and shows no threads it cannot answer.
  const detail = pr.detail
  const ours = detail !== null && detail.id === tab.id && detail.status === 'active'

  const openLink = (href: string): void => {
    void pr
      .openLink(href)
      .then((result) => {
        if (!result.ok) onToast(result.error ?? 'Could not open the link.')
      })
      .catch((err: unknown) => onToast(err instanceof Error ? err.message : String(err)))
  }

  const placed = zonesForFile(ours ? detail.threads : [], tab.path)
  const zones: DiffZone[] = [
    ...placed.left.map(({ afterLine, thread }) => ({
      side: 'original' as const,
      afterLine,
      thread
    })),
    ...placed.right.map(({ afterLine, thread }) => ({
      side: 'modified' as const,
      afterLine,
      thread
    }))
  ].map(({ side, afterLine, thread }) => ({
    key: `thread:${thread.id}`,
    side,
    afterLine,
    content: (
      <PrThread
        thread={thread}
        provider={detail?.provider ?? 'azure-devops'}
        onReply={(content) => pr.reply(thread.id, thread.rootCommentId, content)}
        onSetStatus={(status) => pr.setStatus(thread.id, status)}
        onOpenLink={openLink}
      />
    )
  }))
  if (draft) {
    zones.push({
      key: 'draft',
      side: 'modified',
      afterLine: Math.max(draft.selection.startLine, draft.selection.endLine),
      content: (
        <CommentComposer
          autoFocus
          onPost={(content) =>
            pr.startThread(tab.file, draft.selection, draft.iteration, content).then((result) => {
              if (result.ok) setDraft(null)
              return result
            })
          }
          onCancel={() => setDraft(null)}
          onOpenLink={openLink}
        />
      )
    })
  }

  const comment = (): void => {
    if (!selection || !entry) return
    setDraft({ selection: { path: tab.path, ...selection }, iteration: entry.iteration })
  }

  if (!entry?.sides) return <div className="file-tabs-note">Loading…</div>

  const lines =
    selection === null
      ? ''
      : selection.startLine === selection.endLine
        ? `line ${selection.startLine}`
        : `lines ${Math.min(selection.startLine, selection.endLine)}–${Math.max(selection.startLine, selection.endLine)}`

  return (
    <div className="pr-diff-tab" data-pr-diff={tab.path}>
      {pr.newIteration && (
        <div className="pr-diff-banner" role="status">
          <span>New changes were pushed to this pull request.</span>
          <button type="button" className="file-tabs-toggle" onClick={pr.reloadDiffs}>
            Reload diffs
          </button>
        </div>
      )}
      {/* Always mounted: a bar that appeared with the selection pushed the
          editor down mid-drag, so the drag ended on another line (T27). */}
      {ours && (
        <div className="pr-diff-comment-bar">
          <button
            type="button"
            className="pr-diff-comment"
            onClick={comment}
            disabled={selection === null || draft !== null}
          >
            Comment
          </button>
          <span>
            {selection === null ? 'Select lines on the right side to comment' : `on ${lines}`}
          </span>
        </div>
      )}
      <div className="pr-diff-body">
        <DiffViewer
          path={tab.path}
          sides={entry.sides}
          layout={files.diffLayout}
          ignoreWhitespace={files.diffIgnoreWhitespace}
          unchanged={files.unchangedFor(key)}
          zones={zones}
          onSelectModified={setSelection}
          onHandle={(handle) => {
            onHandle(handle)
            // FPRA-12: a thread opened this diff; land on its line once.
            if (handle && tab.reveal) {
              handle.reveal(tab.reveal.line, tab.reveal.side)
              files.clearReveal(key)
            }
          }}
        />
      </div>
    </div>
  )
}
