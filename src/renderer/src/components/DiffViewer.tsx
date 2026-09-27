import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { DiffSide, DiffSides } from '../../../shared/files'
import {
  choicePlan,
  eolStripText,
  foldPlan,
  readingBeforeUpdate,
  UNCHANGED_REGIONS,
  unchangedRegions,
  type LineSpan,
  type FoldReading,
  type Region
} from '../lib/diff-view'
import type { UnchangedChoice } from '../lib/files-view'
import { languageForPath, monaco } from '../lib/monaco-setup'
import { FilePlaceholder, type PlaceholderKind } from './FilePlaceholder'
import './DiffViewer.css'

/** What a diff tab or a stack section can ask of the editor it mounted. */
export interface DiffHandle {
  /** Move to the next or previous change inside this file (FDIF-25). */
  goToDiff: (direction: 'next' | 'previous') => void
  /** The modified-side lines the diff reports as changed, ascending (FDIF-26). */
  changes: () => number[]
  /** Put the cursor on a modified-side line and scroll the editor to it. */
  reveal: (line: number) => void
  /** Which modified-side line the cursor is on. */
  line: () => number
  /** Where a modified-side line sits, in pixels from the top of this editor. */
  top: (line: number) => number
}

interface DiffViewerProps {
  /** Path relative to the worktree root. Picks the language for both sides. */
  path: string
  sides: DiffSides
  layout: 'side-by-side' | 'inline'
  /** Hide leading / trailing whitespace changes, the EOL strip and its markers (FDIF-16). */
  ignoreWhitespace: boolean
  /**
   * Size the editor to its content instead of filling its box (D1). A stack of
   * inner-scrolling editors is unusable with a wheel, so a section gives its
   * editor exactly the height the larger side needs and the page scrolls once.
   */
  fitContent?: boolean
  /** The measured content height, each time it changes (D1: a section holds it). */
  onHeight?: (height: number) => void
  /**
   * The editor's navigation, once it exists; `null` as it goes away. The tab
   * strip drives it, by its buttons and by VS Code's keys (FDIF-25): one
   * listener there knows which surface is active, where a listener per editor
   * would have twelve of them arguing over one key press.
   */
  onHandle?: (handle: DiffHandle | null) => void
  /**
   * The tab's last Hide unchanged / Show unchanged press, or null for none.
   * Applied on every new press, when a newly mounted editor first shows its
   * diff, and to the regions a refresh creates (FOLD-12..15, FOLD-23).
   */
  unchanged?: UnchangedChoice | null
}

/** Why a side cannot be rendered, or null when it is text the editor can hold. */
function blockedBy(side: DiffSide): PlaceholderKind | null {
  switch (side.kind) {
    case 'binary':
      return 'binary'
    case 'too-large':
      return 'too-large'
    case 'missing':
      return 'missing'
    default:
      return null
  }
}

/** A side's text. `absent` is the empty side of an added or deleted file (FDIF-03/04). */
function sideText(side: DiffSide): string {
  return side.kind === 'text' ? side.text : ''
}

function sideSize(side: DiffSide): number | undefined {
  return 'size' in side ? side.size : undefined
}

/** The modified-side lines the editor reports as changed, ascending (FDIF-25/26). */
function changedLines(editor: monaco.editor.IStandaloneDiffEditor): number[] {
  const changes = editor.getLineChanges() ?? []
  // A pure deletion has `modifiedEndLineNumber` 0 and names the line it sits
  // after, which is line 0 when the deletion is at the top of the file.
  return changes.map((change) => Math.max(1, change.modifiedStartLineNumber))
}

/** The unchanged regions of the diff on screen; null until the worker has answered. */
function currentRegions(editor: monaco.editor.IStandaloneDiffEditor): Region[] | null {
  const changes = editor.getLineChanges()
  const models = editor.getModel()
  if (!changes || !models) return null
  return unchangedRegions(changes, models.original.getLineCount(), models.modified.getLineCount())
}

/**
 * Folds each unchanged region as `spans` says, one span per region. The only
 * code that writes a `modelState`: its shape is internal to monaco-editor
 * 0.56.0 (`restoreSerializedState`), which is pinned. The inner states are
 * empty objects, truthy so the call goes through, and with no `cursorState`
 * in them neither editor restores a cursor, which would reveal its line.
 */
function applyFolds(editor: monaco.editor.IStandaloneDiffEditor, spans: LineSpan[]): void {
  editor.restoreViewState({
    original: {},
    modified: {},
    modelState: { collapsedRegions: spans.map((span) => ({ range: [span.start, span.end] })) }
  } as unknown as monaco.editor.IDiffEditorViewState)
}

/**
 * One diff, as Monaco's `DiffEditor` renders it (FDIF-07, 11–16, 25, 30).
 *
 * Both sides are read-only: the Files direction never writes (epic grill Q2),
 * so `readOnly` covers the modified side and `originalEditable: false` the
 * other. Unchanged stretches fold into a clickable strip (FDIF-13/14), which is
 * what makes a 2000-line file with three changes readable.
 *
 * Line-ending changes come from main, not from the diff: Monaco's models keep
 * their own terminators but its diff normalizes them away, so a whole-file flip
 * reads as "no changes" to the editor (spike finding 1). They are shown as a
 * strip above the editor plus a glyph on each line, and the whitespace toggle
 * hides both along with the trim-whitespace changes it hides in the diff
 * itself (FDIF-15/16).
 *
 * The editor is created once and then fed new text, never recreated, so an
 * agent's edit updates the diff in place and keeps the scroll (FDIF-30).
 */
export function DiffViewer({
  path,
  sides,
  layout,
  ignoreWhitespace,
  fitContent,
  onHeight,
  onHandle,
  unchanged = null
}: DiffViewerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const markersRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  // The fold states read just before new text went in, until Monaco has
  // recomputed the diff for it (FOLD-02..08, `FoldReading`).
  const pendingRef = useRef<FoldReading | null>(null)
  // The modified side's scroll offset when that reading was taken (FOLD-09).
  const pendingScrollRef = useRef<number | null>(null)
  const [identical, setIdentical] = useState(false)
  const [height, setHeight] = useState<number | null>(null)

  const blocked = blockedBy(sides.original) ?? blockedBy(sides.modified)
  const failure =
    sides.original.kind === 'error'
      ? sides.original.message
      : sides.modified.kind === 'error'
        ? sides.modified.message
        : null
  const renderable = blocked === null && failure === null

  // Read through a ref by the mount effect, which runs once: the editor must
  // survive a preference change rather than be rebuilt by it.
  const live = useRef({ layout, ignoreWhitespace, fitContent, onHeight, onHandle, unchanged })
  useEffect(() => {
    live.current = { layout, ignoreWhitespace, fitContent, onHeight, onHandle, unchanged }
  })

  useEffect(() => {
    if (!containerRef.current || !renderable) return
    const language = languageForPath(path)
    const original = monaco.editor.createModel(sideText(sides.original), language)
    const modified = monaco.editor.createModel(sideText(sides.modified), language)
    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly: true,
      originalEditable: false,
      // A read-only viewer has nothing to type into, and the cursor's blink
      // reads as an invitation to edit (CodeViewer, FXPL-17).
      domReadOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      renderOverviewRuler: false,
      // The markers of FDIF-15 live in the glyph margin, so it is always there;
      // a margin that appears with the first CRLF line would shift the text.
      glyphMargin: true,
      renderSideBySide: live.current.layout === 'side-by-side',
      ignoreTrimWhitespace: live.current.ignoreWhitespace,
      // FDIF-13: a run of unchanged lines folds into one strip, with a little
      // context left around every change. Option names confirmed by the spike;
      // the values are the ones the app's region rule computes with (FOLD-10).
      hideUnchangedRegions: { enabled: true, ...UNCHANGED_REGIONS },
      // A section sizes itself to its content, so its editor must not reserve a
      // screen of empty space under the last line.
      scrollBeyondLastLine: !live.current.fitContent
    })
    editor.setModel({ original, modified })
    editorRef.current = editor
    markersRef.current = editor.getModifiedEditor().createDecorationsCollection([])

    const handle: DiffHandle = {
      goToDiff: (direction) => editor.goToDiff(direction),
      changes: () => changedLines(editor),
      reveal: (line) => {
        const inner = editor.getModifiedEditor()
        inner.setPosition({ lineNumber: line, column: 1 })
        inner.revealLineInCenter(line)
      },
      line: () => editor.getModifiedEditor().getPosition()?.lineNumber ?? 1,
      top: (line) => editor.getModifiedEditor().getTopForLineNumber(line)
    }
    let announced = false

    const disposables: monaco.IDisposable[] = []
    disposables.push(
      editor.onDidUpdateDiff(() => {
        // FDIF-13's fold plus zero changes is an editor showing nothing; the
        // spec asks for a sentence instead (§Edge Cases). `getLineChanges`
        // answers null until the worker has computed, which is not "identical".
        const changes = editor.getLineChanges()
        if (!changes) return
        const choice = live.current.unchanged?.mode ?? null
        const pending = pendingRef.current
        pendingRef.current = null
        if (pending) {
          const regions = currentRegions(editor) ?? []
          const leftChanged = pending.left !== original.getValue()
          applyFolds(editor, foldPlan(pending.states, regions, choice, leftChanged))
          // The offset restored after `setValue` was measured on a diff with every
          // region revealed; with the folds above the screen back as they were,
          // the offset from before the change shows the same line again (FOLD-09).
          if (pendingScrollRef.current !== null) {
            editor.getModifiedEditor().setScrollTop(pendingScrollRef.current)
          }
          pendingScrollRef.current = null
        } else if (!announced && choice) {
          // An editor mounted after a press opens in that choice: a section
          // scrolled into view, expanded, or remounted (FOLD-14, FOLD-23).
          applyFolds(editor, choicePlan(currentRegions(editor) ?? [], choice))
        }
        setIdentical(changes.length === 0)
        // The handle is announced once the worker has answered, never before:
        // `changes()` on an uncomputed diff is an empty list that reads like a
        // file with nothing in it, and the stack walks past such a file
        // (FDIF-26).
        if (!announced) {
          announced = true
          live.current.onHandle?.(handle)
        }
      })
    )
    if (live.current.fitContent) {
      const measure = (): void => {
        // The two inner editors report different counts (spike finding 4), and
        // a section has to hold whichever side is taller.
        const tallest = Math.max(
          editor.getOriginalEditor().getContentHeight(),
          editor.getModifiedEditor().getContentHeight()
        )
        setHeight(tallest)
        live.current.onHeight?.(tallest)
      }
      disposables.push(editor.getOriginalEditor().onDidContentSizeChange(measure))
      disposables.push(editor.getModifiedEditor().onDidContentSizeChange(measure))
      measure()
    }

    return () => {
      if (announced) live.current.onHandle?.(null)
      editorRef.current = null
      markersRef.current = null
      pendingRef.current = null
      pendingScrollRef.current = null
      for (const disposable of disposables) disposable.dispose()
      editor.dispose()
      // Disposing the editor leaves its models behind, and a stack remounts
      // sections all session long (D1).
      original.dispose()
      modified.dispose()
    }
    // Created once per mounted diff; content and preferences are applied by the
    // effects below so the editor survives both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderable])

  useEffect(() => {
    const models = editorRef.current?.getModel()
    if (!models) return
    const inner = editorRef.current?.getModifiedEditor()
    // FDIF-30: an agent's edit replaces the modified side, and `setValue` puts
    // the scroll back at the top unless it is captured and restored.
    const scrollTop = inner?.getScrollTop() ?? 0
    const nextOriginal = sideText(sides.original)
    const nextModified = sideText(sides.modified)
    const originalMoves = models.original.getValue() !== nextOriginal
    const modifiedMoves = models.modified.getValue() !== nextModified
    const editor = editorRef.current
    // `setValue` wipes the decorations Monaco carries its folds in, so every
    // region would come back revealed. The fold states are read first and
    // re-applied once the new diff exists (FOLD-02..08, `readingBeforeUpdate`).
    if ((originalMoves || modifiedMoves) && editor) {
      const before = pendingRef.current
      pendingRef.current = readingBeforeUpdate(
        before,
        currentRegions(editor),
        editor.saveViewState()?.modelState,
        models.original.getValue()
      )
      // Only a new reading records the offset: a second change keeps the first.
      if (before === null && pendingRef.current !== null) pendingScrollRef.current = scrollTop
    }
    if (originalMoves) models.original.setValue(nextOriginal)
    if (modifiedMoves) models.modified.setValue(nextModified)
    inner?.setScrollTop(scrollTop)
  }, [sides])

  // A press of Hide unchanged or Show unchanged folds or reveals every region,
  // hand-revealed ones included (FOLD-12, FOLD-13). Before the first diff there
  // is nothing to fold: the diff listener applies the choice when it arrives.
  const press = unchanged?.press
  useEffect(() => {
    const editor = editorRef.current
    const mode = live.current.unchanged?.mode
    if (!editor || !mode || press === undefined) return
    if (pendingRef.current) {
      pendingRef.current = { ...pendingRef.current, states: null }
      return
    }
    const regions = currentRegions(editor)
    if (regions) applyFolds(editor, choicePlan(regions, mode))
  }, [press])

  useEffect(() => {
    editorRef.current?.updateOptions({
      renderSideBySide: layout === 'side-by-side',
      ignoreTrimWhitespace: ignoreWhitespace
    })
  }, [layout, ignoreWhitespace])

  useEffect(() => {
    // FDIF-16 hides the markers with the strip: the whole line-ending story is
    // one thing to the reader, and half of it left on screen reads as a bug.
    const lines = ignoreWhitespace ? [] : sides.eolChanged
    markersRef.current?.set(
      lines.map((line) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          glyphMarginClassName: 'diff-viewer-eol-marker',
          glyphMarginHoverMessage: { value: 'This line’s ending changed' }
        }
      }))
    )
    // Runs after the content effect above, which is what re-applies the markers
    // a `setValue` dropped with the rest of the model's decorations.
  }, [sides, ignoreWhitespace])

  if (failure !== null) return <div className="diff-viewer-error">{failure}</div>
  if (blocked !== null) {
    // FDIF-06 / FDIF-23: a side nobody can read gets F1's placeholder, and no
    // editor is mounted for it at all.
    return (
      <FilePlaceholder
        path={path}
        kind={blocked}
        size={sideSize(sides.modified) ?? sideSize(sides.original)}
      />
    )
  }

  const strip = ignoreWhitespace ? null : eolStripText(sides.eolChanged, sides.eolFrom, sides.eolTo)

  return (
    <div className={`diff-viewer${fitContent ? ' fit' : ''}${identical ? ' identical' : ''}`}>
      {strip && (
        <div className="diff-viewer-eol" role="status">
          {strip}
        </div>
      )}
      {identical && <div className="diff-viewer-note">The content is identical.</div>}
      <div
        className="diff-viewer-editor"
        ref={containerRef}
        style={fitContent && height !== null ? { height } : undefined}
      />
    </div>
  )
}
