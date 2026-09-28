import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { ChangedPath, DiffRequest, FileStat } from '../../../shared/files'
import { buildTree, type TreeNode } from '../lib/files-view'
import { initialExpansion, mountPlan, nextChangeTarget, totals } from '../lib/diff-view'
import { DiffSection } from './DiffSection'
import type { DiffHandle } from './DiffViewer'
import './AllChangesTab.css'

/** How far outside the viewport a section still counts as worth mounting. */
const NEAR_VIEWPORT = '600px 0px'
/** A little air above the line the walk lands on, so it is not flush with the top. */
const LANDING_MARGIN = 60

interface AllChangesTabProps {
  /** The worktree the diffs are read in, absolute. */
  worktreePath: string
  /** The current mode's changed files, in any order; the stack sorts them. */
  files: ChangedPath[]
  /** Added and removed counts per file, from `files:diff-stats`. */
  stats: FileStat[]
  /** Which two sides each file compares; null when there is no diff to build. */
  requestFor: (changed: ChangedPath) => DiffRequest | null
  layout: 'side-by-side' | 'inline'
  ignoreWhitespace: boolean
  /** Bumped when every open diff must re-read against a new git state (FDIF-31/32). */
  refreshToken: number
  /** The stack's own navigation, for the tab strip's buttons and keys (FDIF-26). */
  onHandle?: (handle: DiffHandle | null) => void
}

/** The mode's list in the tree's order — the order the user just read on the left. */
function inTreeOrder(files: readonly ChangedPath[]): ChangedPath[] {
  const byPath = new Map(files.map((file) => [file.path, file]))
  const ordered: ChangedPath[] = []
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'dir') {
        walk(node.children)
        continue
      }
      const file = byPath.get(node.path)
      if (file) ordered.push(file)
    }
  }
  walk(buildTree([...files]))
  return ordered
}

/**
 * Every change of the current mode, stacked (FDIF-19..24, 26).
 *
 * It is driven entirely by its props: the file list, the counts, and a builder
 * for each file's two sides. It reads nothing from the Files mode, so F3 mounts
 * the same component with a commit's files and a `sha^` → `sha` builder.
 *
 * Only a section that is expanded and near the viewport holds an editor, and
 * never more than twelve at once (`mountPlan`, D1). One `IntersectionObserver`
 * watches the whole stack; the sections hand it their boxes.
 */
export function AllChangesTab({
  worktreePath,
  files,
  stats,
  requestFor,
  layout,
  ignoreWhitespace,
  refreshToken,
  onHandle
}: AllChangesTabProps): JSX.Element {
  const ordered = useMemo(() => inTreeOrder(files), [files])
  const shown = useMemo(() => {
    const byPath = new Map(stats.map((stat) => [stat.path, stat]))
    // A file the list holds and the counts do not is still a section: the two
    // come from the same git state, so a gap is a race, not a disagreement.
    return ordered.map((file) => byPath.get(file.path) ?? { path: file.path, added: 0, removed: 0 })
  }, [ordered, stats])
  const requests = useMemo(
    () => new Map(ordered.map((file) => [file.path, requestFor(file)])),
    [ordered, requestFor]
  )
  const header = totals(shown)

  // FDIF-21: the first ten open, the rest folded. Derived rather than seeded,
  // so it is right on the first render and there is no effect writing state
  // behind it: until the reader folds or opens something there is nothing to
  // remember, and from the first toggle on their set is the whole answer.
  const [expanded, setExpanded] = useState<Set<string> | null>(null)
  const open = useMemo(() => expanded ?? initialExpansion(shown), [expanded, shown])
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const elements = useRef(new Map<string, HTMLElement>())
  const observer = useRef<IntersectionObserver | null>(null)
  const inView = useRef(new Set<string>())
  const [visible, setVisible] = useState<string[]>([])

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        let moved = false
        for (const entry of entries) {
          const path = (entry.target as HTMLElement).dataset.path
          if (!path) continue
          if (entry.isIntersecting) {
            if (!inView.current.has(path)) {
              inView.current.add(path)
              moved = true
            }
          } else if (inView.current.delete(path)) {
            moved = true
          }
        }
        if (moved) setVisible([...inView.current])
      },
      { root: scrollRef.current, rootMargin: NEAR_VIEWPORT }
    )
    observer.current = io
    for (const element of elements.current.values()) io.observe(element)
    return () => {
      io.disconnect()
      observer.current = null
    }
  }, [])

  const onElement = useCallback((path: string, element: HTMLElement | null): void => {
    const previous = elements.current.get(path)
    if (previous) observer.current?.unobserve(previous)
    if (element) {
      elements.current.set(path, element)
      observer.current?.observe(element)
      return
    }
    elements.current.delete(path)
    if (inView.current.delete(path)) setVisible([...inView.current])
  }, [])

  const sections = useMemo(
    () => ordered.map((file) => ({ path: file.path, expanded: open.has(file.path) })),
    [ordered, open]
  )
  // Which sections hold an editor, derived from what the observer reports
  // rather than accumulated (FDIF-22). The plan is asked with nothing already
  // mounted, so the answer is exactly the expanded sections near the viewport,
  // the nearest twelve of them when more than that are open at once (D1). A
  // section that scrolls past the margin loses its editor and gets it back on
  // return, which is what the spec's last edge case allows.
  const mounted = useMemo(() => mountPlan(sections, visible, []).mount, [sections, visible])

  const handles = useRef(new Map<string, DiffHandle>())
  /** Which section the walk is standing in. */
  const focused = useRef<string | null>(null)
  /** A section the walk is entering, waiting for its editor to compute. */
  const entering = useRef<{ path: string; direction: 'next' | 'previous' } | null>(null)

  /** Puts a modified-side line of one section under the reader's eyes. */
  const scrollTo = useCallback((path: string, line: number): void => {
    const box = scrollRef.current
    const element = elements.current.get(path)
    const handle = handles.current.get(path)
    if (!box || !element) return
    // Each editor is sized to its content (D1), so it never scrolls itself; the
    // stack does, by the section's offset plus the line's offset inside it.
    const inside = handle ? handle.top(line) : 0
    box.scrollTop = element.offsetTop + inside - LANDING_MARGIN
  }, [])

  /** Where in a section the walk lands when it comes in from outside. */
  const landing = useCallback(
    (handle: DiffHandle, direction: 'next' | 'previous'): number | null => {
      const changes = handle.changes()
      if (changes.length === 0) return null
      return direction === 'next' ? changes[0] : changes[changes.length - 1]
    },
    []
  )

  const walk = useCallback(
    (direction: 'next' | 'previous'): void => {
      const from = focused.current ?? ordered[0]?.path
      if (from === undefined) return
      const stat = new Map(shown.map((entry) => [entry.path, entry]))
      const walkable = ordered.map((file) => {
        const handle = handles.current.get(file.path)
        if (handle)
          return { path: file.path, changes: handle.changes(), expanded: open.has(file.path) }
        // No editor, so no measured change list. The counts already say whether
        // this file has anything to walk into: a binary one and one with no
        // lines have nothing, and every other file has at least one change to
        // enter at, whose line the entry below reads off the real editor.
        const counts = stat.get(file.path)
        const empty = !counts || !!counts.uncountable || counts.added + counts.removed === 0
        return { path: file.path, changes: empty ? [] : [1], expanded: open.has(file.path) }
      })
      const here = handles.current.get(from)
      const line = here ? here.line() : direction === 'next' ? 0 : Number.MAX_SAFE_INTEGER
      const target = nextChangeTarget({ path: from, line }, walkable, direction)
      if (!target) return
      if (target.path === from && here) {
        here.reveal(target.line)
        scrollTo(from, target.line)
        return
      }
      // FDIF-26: crossing into another file opens its section on the way in.
      //
      // Seeded from `openRef`, not from an empty set: until the reader folds or
      // opens something, `expanded` is still null and the open sections are the
      // derived initial ten. Starting from `[]` here threw all ten away on the
      // first crossing — walking the stack closed it behind you (T21 check 16).
      if (target.expand) {
        setExpanded((prev) => new Set(prev ?? openRef.current).add(target.path))
      }
      const next = handles.current.get(target.path)
      const at = next ? landing(next, direction) : null
      if (next && at !== null) {
        focused.current = target.path
        next.reveal(at)
        scrollTo(target.path, at)
        return
      }
      // Its editor is not there yet, or has not computed. Remember the move and
      // finish it when the handle arrives.
      entering.current = { path: target.path, direction }
      focused.current = target.path
      elements.current.get(target.path)?.scrollIntoView({ block: 'start' })
    },
    [ordered, shown, open, scrollTo, landing]
  )

  const onSectionHandle = useCallback(
    (path: string, handle: DiffHandle | null): void => {
      if (!handle) {
        handles.current.delete(path)
        return
      }
      handles.current.set(path, handle)
      const pending = entering.current
      if (pending?.path !== path) return
      entering.current = null
      const at = landing(handle, pending.direction)
      if (at === null) {
        // Nothing to land on after all — the counts promised a change the diff
        // does not report, which is what hiding whitespace does. Keep walking.
        walk(pending.direction)
        return
      }
      handle.reveal(at)
      scrollTo(path, at)
    },
    [landing, scrollTo, walk]
  )

  const onToggle = useCallback((path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev ?? openRef.current)
      if (!next.delete(path)) next.add(path)
      return next
    })
  }, [])

  // The stack answers the tab strip with the same shape one editor does, so the
  // buttons and the keys do not care which kind of tab is in front of them.
  const live = useRef({ walk, onHandle })
  useEffect(() => {
    live.current = { walk, onHandle }
  })
  useEffect(() => {
    const handle: DiffHandle = {
      goToDiff: (direction) => live.current.walk(direction),
      changes: () => handles.current.get(focused.current ?? '')?.changes() ?? [],
      reveal: (line) => handles.current.get(focused.current ?? '')?.reveal(line),
      line: () => handles.current.get(focused.current ?? '')?.line() ?? 1,
      top: (line) => handles.current.get(focused.current ?? '')?.top(line) ?? 0
    }
    const announce = live.current.onHandle
    announce?.(handle)
    return () => announce?.(null)
  }, [])

  if (ordered.length === 0) {
    // FDIF-24: the tab is fixed, so it is here even with nothing to show.
    return (
      <div className="all-changes">
        <div className="all-changes-empty">Nothing has changed in this mode.</div>
      </div>
    )
  }

  return (
    <div className="all-changes">
      <div className="all-changes-header">
        <span className="all-changes-files">
          {header.files} {header.files === 1 ? 'file' : 'files'} changed
        </span>
        <span className="all-changes-added">+{header.added}</span>
        <span className="all-changes-removed">&minus;{header.removed}</span>
        {/* FPOL-14/15: every listed section at once. Expanding them all still
            mounts only the ones near the viewport (FPOL-16, mountPlan). The
            empty state above has no header, so these never show with nothing
            listed (FPOL-17). */}
        <span className="all-changes-header-gap" />
        <button
          type="button"
          className="all-changes-toggle"
          title="Expand every file"
          onClick={() => setExpanded(new Set(ordered.map((file) => file.path)))}
        >
          Expand all
        </button>
        <button
          type="button"
          className="all-changes-toggle"
          title="Collapse every file"
          onClick={() => setExpanded(new Set())}
        >
          Collapse all
        </button>
      </div>
      <div className="all-changes-stack" ref={scrollRef}>
        {ordered.map((file, index) => (
          <DiffSection
            key={file.path}
            worktreePath={worktreePath}
            changed={file}
            stat={shown[index]}
            request={requests.get(file.path) ?? null}
            expanded={open.has(file.path)}
            mounted={mounted.includes(file.path)}
            layout={layout}
            ignoreWhitespace={ignoreWhitespace}
            refreshToken={refreshToken}
            onToggle={onToggle}
            onElement={onElement}
            onHandle={onSectionHandle}
          />
        ))}
      </div>
    </div>
  )
}
