import { useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  /**
   * Put the cursor on a line and scroll the editor to it: a modified-side line
   * unless `side` names the original, where a thread on a removed line sits.
   */
  reveal: (line: number, side?: 'original' | 'modified') => void
  /** Which modified-side line the cursor is on. */
  line: () => number
  /** Where a modified-side line sits, in pixels from the top of this editor. */
  top: (line: number) => number
}

/**
 * Content drawn between two lines of one side, in a Monaco view zone — a pull
 * request's thread under the line it is about (FPRA-18). The viewer knows
 * nothing of threads: it places whatever node it is given and sizes the gap to
 * it.
 */
export interface DiffZone {
  /** Identity across renders: a zone with the same key is kept, not rebuilt. */
  key: string
  side: 'original' | 'modified'
  /** 1-based line the zone sits under; 0 puts it above the first line. */
  afterLine: number
  content: ReactNode
}

/** A selection on the modified side, as Monaco reports it: 1-based lines and columns. */
export interface ModifiedSelection {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

/**
 * One zone the editor holds: an empty view zone that opens the gap between two
 * lines, and an overlay widget drawn over that gap that holds the content.
 *
 * The content cannot live in the view zone itself. Monaco stacks its text layer
 * (`.view-lines`) above the view zones, so the text layer takes every click and
 * key meant for a thread drawn there. Overlay widgets sit above the text layer.
 * VS Code's own comment threads are built the same way (`ZoneWidget`).
 */
interface MountedZone {
  /** Monaco's id; '' while the zone is between a removal and its re-add. */
  id: string
  side: DiffZone['side']
  afterLine: number
  /** Monaco re-reads `heightInPx` from this object on every `layoutZone`. */
  zone: monaco.editor.IViewZone
  /** The overlay widget; it sits on the editor of `side`. */
  widget: monaco.editor.IOverlayWidget
  /** The portal target inside the overlay; its height is the zone's. */
  inner: HTMLElement
  observer: ResizeObserver
}

let nextOverlayId = 0

/**
 * A zone's height before its content has been measured: the gap Monaco opens
 * when the zone is added, until the overlay's content has laid out and the
 * measurement replaces it.
 */
const ZONE_GUESS_PX = 32

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
  /**
   * Content to draw between lines, per side (FPRA-18). Each zone takes its
   * content's height, counts in a fitted editor's height, and in a folded
   * region shows once the region is revealed. Absent = no zones at all.
   */
  zones?: DiffZone[]
  /**
   * The modified side's selection each time it changes, or null when it is
   * empty (FPRA-27). The original side's selection is never reported: a new
   * thread starts on the modified side only (FPRA-28).
   */
  onSelectModified?: (selection: ModifiedSelection | null) => void
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
  unchanged = null,
  zones,
  onSelectModified
}: DiffViewerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const markersRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  // The view zones the editor holds, by `DiffZone.key`, and the nodes their
  // content is portaled into — state, so a new zone renders its content.
  const zonesRef = useRef(new Map<string, MountedZone>())
  const [zoneHosts, setZoneHosts] = useState<ReadonlyMap<string, HTMLElement>>(() => new Map())
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
  const live = useRef({
    layout,
    ignoreWhitespace,
    fitContent,
    onHeight,
    onHandle,
    unchanged,
    onSelectModified
  })
  useEffect(() => {
    live.current = {
      layout,
      ignoreWhitespace,
      fitContent,
      onHeight,
      onHandle,
      unchanged,
      onSelectModified
    }
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
      reveal: (line, side = 'modified') => {
        const inner = side === 'original' ? editor.getOriginalEditor() : editor.getModifiedEditor()
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
    // FPRA-27/28: only the modified editor is listened to, so a selection on
    // the original side never reaches the caller.
    disposables.push(
      editor.getModifiedEditor().onDidChangeCursorSelection(({ selection }) => {
        live.current.onSelectModified?.(
          selection.isEmpty()
            ? null
            : {
                startLine: selection.startLineNumber,
                startColumn: selection.startColumn,
                endLine: selection.endLineNumber,
                endColumn: selection.endColumn
              }
        )
      })
    )
    // An overlay spans the text area of its side, which moves with the gutter
    // and the editor's width.
    const mountedZones = zonesRef.current
    for (const [side, inner] of [
      ['original', editor.getOriginalEditor()],
      ['modified', editor.getModifiedEditor()]
    ] as const) {
      disposables.push(
        inner.onDidLayoutChange(() => {
          for (const held of mountedZones.values()) {
            if (held.side === side) placeOverlay(held, inner)
          }
        })
      )
    }
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
      // The zones go with the editor; their observers and portals go with them.
      for (const zone of mountedZones.values()) zone.observer.disconnect()
      mountedZones.clear()
      setZoneHosts(new Map())
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

  // The zones the caller asks for, kept in step with the editor (FPRA-18). A
  // zone whose side or line moved is removed and added again with the same
  // overlay, so its content stays mounted; a zone no longer asked for goes.
  // Monaco folds a zone with the line it sits under and draws it again when
  // that region is revealed, the overlay hiding and showing with it, and a
  // zone's height is content height, which is what a fitted editor measures
  // (#130).
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const hosts = syncZones(editor, zonesRef.current, zones ?? [])
    if (hosts) setZoneHosts(hosts)
  }, [zones, renderable])

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
      {zones?.map((zone) => {
        const host = zoneHosts.get(zone.key)
        return host ? createPortal(zone.content, host, zone.key) : null
      })}
    </div>
  )
}

/**
 * Brings the editor's zones in line with `zones`, in place. Returns the new
 * portal targets by key when a zone came or went, and null when only positions
 * moved, so the caller re-renders only for a new set of nodes.
 */
function syncZones(
  editor: monaco.editor.IStandaloneDiffEditor,
  mounted: Map<string, MountedZone>,
  zones: DiffZone[]
): ReadonlyMap<string, HTMLElement> | null {
  const sideEditor = (side: DiffZone['side']): monaco.editor.ICodeEditor =>
    side === 'original' ? editor.getOriginalEditor() : editor.getModifiedEditor()
  const wanted = new Map(zones.map((zone) => [zone.key, zone]))
  let hostsChanged = false

  for (const [key, held] of mounted) {
    const want = wanted.get(key)
    if (want && want.side === held.side && want.afterLine === held.afterLine) continue
    sideEditor(held.side).changeViewZones((accessor) => accessor.removeZone(held.id))
    held.id = ''
    // The overlay stays where it is while only the line moves, so a composer
    // being typed into keeps its focus.
    if (!want || want.side !== held.side) sideEditor(held.side).removeOverlayWidget(held.widget)
    if (!want) {
      held.observer.disconnect()
      mounted.delete(key)
      hostsChanged = true
    }
  }

  for (const [key, want] of wanted) {
    const known = mounted.get(key)
    if (known && known.id !== '') continue
    const held = known ?? createZone(want, sideEditor)
    if (!known) {
      mounted.set(key, held)
      hostsChanged = true
    }
    const target = sideEditor(want.side)
    if (!known || known.side !== want.side) {
      target.addOverlayWidget(held.widget)
      placeOverlay(held, target)
    }
    held.side = want.side
    held.afterLine = want.afterLine
    held.zone.afterLineNumber = want.afterLine
    target.changeViewZones((accessor) => {
      held.id = accessor.addZone(held.zone)
    })
  }

  return hostsChanged ? new Map([...mounted].map(([key, held]) => [key, held.inner])) : null
}

/** Spans an overlay over the text area of its side: right of the gutter, left of the scrollbar. */
function placeOverlay(held: MountedZone, editor: monaco.editor.ICodeEditor): void {
  const layout = editor.getLayoutInfo()
  const node = held.widget.getDomNode()
  node.style.left = `${layout.contentLeft}px`
  node.style.width = `${layout.contentWidth}px`
}

/**
 * A zone: an empty view zone that opens the gap, and the overlay drawn over it
 * that the content is portaled into (`MountedZone`).
 *
 * The overlay follows the gap: Monaco reports the gap's top on every render,
 * scrolling included, and whether it draws the gap at all. A gap it does not
 * draw (scrolled far off, or inside a folded region) hides the overlay, which
 * shows again when the gap does (#130).
 *
 * The gap's height follows the content's: a thread that expands, or a composer
 * that grows, pushes the lines below it down. A hidden overlay keeps its
 * layout, so its content is measured even while Monaco draws no gap.
 */
function createZone(
  want: DiffZone,
  sideEditor: (side: DiffZone['side']) => monaco.editor.ICodeEditor
): MountedZone {
  const space = document.createElement('div')
  space.className = 'diff-viewer-zone-space'
  const node = document.createElement('div')
  node.className = 'diff-viewer-zone'
  const inner = document.createElement('div')
  inner.className = 'diff-viewer-zone-content'
  node.appendChild(inner)
  const id = `diff-viewer-zone-${nextOverlayId++}`
  const held: MountedZone = {
    id: '',
    side: want.side,
    afterLine: want.afterLine,
    zone: {
      afterLineNumber: want.afterLine,
      heightInPx: ZONE_GUESS_PX,
      domNode: space,
      onDomNodeTop: (top) => {
        node.style.top = `${top}px`
        // Monaco marks the gaps it draws before it reports their tops.
        node.style.visibility = space.hasAttribute('monaco-visible-view-zone') ? '' : 'hidden'
      }
    },
    widget: { getId: () => id, getDomNode: () => node, getPosition: () => null },
    inner,
    observer: new ResizeObserver(() => {
      const height = inner.offsetHeight
      if (height === 0 || height === held.zone.heightInPx) return
      held.zone.heightInPx = height
      if (held.id === '') return
      sideEditor(held.side).changeViewZones((accessor) => accessor.layoutZone(held.id))
    })
  }
  // The overlay sits beside the editor's scrolling layer, not inside it, so a
  // wheel over a thread would scroll nothing; it scrolls the editor, as it
  // did over the lines around it.
  node.addEventListener(
    'wheel',
    (event) => {
      const editor = sideEditor(held.side)
      const before = editor.getScrollTop()
      editor.setScrollTop(before + event.deltaY)
      if (editor.getScrollTop() !== before) event.preventDefault()
    },
    { passive: false }
  )
  held.observer.observe(inner)
  return held
}
