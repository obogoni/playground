import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppConfig, FilesState } from '../../../shared/config'
import type {
  BaseOptions,
  ChangedListing,
  ChangedPath,
  CommitDetail,
  CommitPage,
  CommitRow,
  DirListing,
  DiffRequest,
  DiffSides,
  FileContent,
  FileStat,
  FilesMode
} from '../../../shared/files'
import type { LaunchResult } from '../../../shared/shortcuts'
import { api } from './api'
import { mergePages } from './commit-view'
import { diffRequestFor, tabKeyOf, tabsWithAllChanges, type DiffMode } from './diff-view'
import { filesStateFor, launcherTarget, tabsAfterClose, tabsAffected } from './files-view'

/** One open file (FXPL-18): what was read for it, and when it was last picked. */
export interface FileTab {
  kind: 'file'
  /** Path relative to the worktree root, forward slashes. */
  path: string
  /** What main answered for it; null while the read is in flight. */
  content: FileContent | null
  /** When the user last picked this tab — the recency FXPL-26 compares. */
  at: number
}

/** One open diff (FDIF-08/09), keyed by the mode it was opened in and its path. */
export interface DiffTab {
  kind: 'diff'
  /**
   * The lens this diff was opened in. It never changes: switching the view's
   * mode must not silently change what an open tab compares (FDIF-09).
   */
  mode: DiffMode
  path: string
  /** The listed change the two sides are derived from, rename included (FDIF-05). */
  changed: ChangedPath
  /** What main answered; null while the read is in flight or there is no base. */
  sides: DiffSides | null
  at: number
}

/**
 * One open commit (FCMT-16/20), keyed by its sha. The row it was opened from
 * travels with it, so the title and the not-pushed marker survive a refresh
 * that no longer lists that commit — an amend leaves the old tab intact
 * (spec edge case).
 */
export interface CommitTab {
  kind: 'commit'
  sha: string
  row: CommitRow
  /** What the commit changed; null while the read is in flight. */
  detail: CommitDetail | null
  at: number
}

/** Everything the tab strip can hold: the open tabs, plus the fixed one. */
export type ViewTab = FileTab | DiffTab | CommitTab
export type StripTab = ViewTab | { kind: 'all-changes' }

/**
 * Everything one worktree shows, kept in memory for as long as the app runs
 * (FXPL-18). Mode and base are not here: those persist in the config (D4).
 */
interface WorktreeFiles {
  tabs: ViewTab[]
  /** The key of the focused tab (`tabKeyOf`), not its path (FDIF-08). */
  activeTab: string | null
  /** Folder paths opened in the full-folder tree (FXPL-05). */
  expanded: string[]
  /** The folder last clicked in the tree, and when (FXPL-26). */
  lastFolder: { path: string; at: number } | null
  /** Full-folder listings by folder path; `''` is the worktree root. */
  entries: Record<string, DirListing>
  changed: ChangedListing | null
  uncommitted: ChangedPath[]
  bases: BaseOptions | null
  /** Added and removed counts for the current mode's list (FDIF-19/20). */
  stats: FileStat[]
  /** The Commits list as far as it has been paged in (FCMT-02/09); null before it loads. */
  commits: CommitPage | null
}

/** A worktree the user has not opened yet. Constant, so it stays referentially stable. */
const EMPTY: WorktreeFiles = {
  tabs: [],
  activeTab: null,
  expanded: [],
  lastFolder: null,
  entries: {},
  changed: null,
  uncommitted: [],
  bases: null,
  stats: [],
  commits: null
}

export interface UseFilesOptions {
  /** The selected worktree's path; null when nothing is selected (FXPL-03). */
  worktreePath: string | null
  /** The Files direction is showing. The watch follows it (FXPL-23). */
  active: boolean
  /** App's UI config — the per-worktree lens and the diff preferences (FXPL-13, FDIF-11/16). */
  ui: AppConfig['ui']
  /** Hands a changed slice of `ui` back to App, the one writer of the config (D4). */
  onPersist: (patch: Partial<AppConfig['ui']>) => void
  /**
   * Anything whose identity changes when the worktree tree is re-read. The
   * status bar re-reads it after a push, sync, publish or fetch, and that is
   * the only in-app signal those operations give: they move
   * `refs/remotes/<remote>/<branch>`, which F1's watcher does not report, so
   * without this the not-pushed markers keep lying after the app's own push
   * (FCMT-32, design D1).
   */
  treeRevision?: unknown
}

export interface UseFiles {
  /** The lens this worktree is in, restored from the config (FXPL-13). */
  mode: FilesMode
  /** The base the diff mode compares against: the picked one, else `origin/HEAD`. */
  base: string | undefined
  /** `merge-base(HEAD, base)`, or null while it is unknown or gone (edge case). */
  mergeBase: string | null
  bases: BaseOptions | null
  entries: Record<string, DirListing>
  expanded: string[]
  changed: ChangedListing | null
  uncommitted: ChangedPath[]
  /** The current mode's changed files, whichever diff mode it is in. */
  changedFiles: ChangedPath[]
  stats: FileStat[]
  tabs: ViewTab[]
  /** What the strip renders: All changes first in the diff modes (FDIF-17/18). */
  strip: StripTab[]
  /** The focused tab's key (`tabKeyOf`); null when nothing is open. */
  activeTab: string | null
  /** How every open diff is laid out (FDIF-11/12). */
  diffLayout: 'side-by-side' | 'inline'
  /** Hide trim-whitespace changes and the line-ending strip with them (FDIF-16). */
  diffIgnoreWhitespace: boolean
  /** The Commits list, paged in (FCMT-02); null before it loads or with no base. */
  commits: CommitPage | null
  /** Changed files in the worktree — the count the uncommitted row shows (FCMT-14). */
  uncommittedCount: number
  /** Bumped when every open diff must re-read against a new git state (FDIF-31). */
  refreshToken: number
  /** Absolute path the launcher row acts on (FXPL-26); null when nothing is picked. */
  launchTarget: string | null
  setMode: (mode: FilesMode) => void
  setBase: (base: string) => void
  setDiffLayout: (layout: 'side-by-side' | 'inline') => void
  setDiffIgnoreWhitespace: (ignore: boolean) => void
  /** Opens or folds a folder; opening it lists its children once (FXPL-05). */
  toggleFolder: (path: string) => void
  /** Records the folder the user just clicked, for the launchers (FXPL-26). */
  selectFolder: (path: string) => void
  openFile: (path: string) => void
  /** Opens the diff of one listed change, in the mode it was listed by (FDIF-01/02). */
  openDiff: (changed: ChangedPath, mode: DiffMode) => void
  /** Which two sides a file of the current mode compares, for the stack. */
  requestFor: (changed: ChangedPath) => DiffRequest | null
  /** Opens, or focuses, the tab holding one commit's stack of diffs (FCMT-16). */
  openCommit: (row: CommitRow) => void
  /** Appends the next page of commits below the ones shown (FCMT-09). */
  loadMoreCommits: () => void
  /** Asks main to open a pushed commit's page; main builds the URL (FCMT-24/28). */
  openCommitInBrowser: (sha: string) => Promise<LaunchResult>
  focusTab: (key: string) => void
  closeTab: (key: string) => void
}

/**
 * The Files direction's state (AD-004): tabs, expanded folders and the current
 * listing live here, per worktree, so switching away and back restores what the
 * user left (FXPL-06/18). The mode, the base and the two diff preferences
 * persist through App instead, since they outlive the session (FXPL-13,
 * FDIF-12/16, design D4).
 *
 * The hook is mounted by App, above the direction switch, so leaving Files can
 * stop the watch: `files:watch` is called with the selected worktree while the
 * direction is Files and with `null` otherwise (FXPL-23).
 *
 * A `files:changed` batch is reacted to as narrowly as each thing needs. The
 * open file tabs the batch touches are re-read (FXPL-21) and so are the
 * uncommitted diffs of those same paths (FDIF-30) — an agent writing one file
 * must not re-read forty. The mode's list is re-listed unconditionally, because
 * a commit or a `git add` changes what both diff modes list without touching
 * any path in the batch. That same signal, `gitStateChanged`, is the one that
 * re-reads *every* open diff and the counts (FDIF-31): the diff-to-origin side
 * of a file only moves when history does.
 */
/** How long a focus refresh of the Commits list waits out another focus (FCMT-32). */
const FOCUS_REFRESH_MS = 5000

export function useFiles({
  worktreePath,
  active,
  ui,
  onPersist,
  treeRevision
}: UseFilesOptions): UseFiles {
  const [byWorktree, setByWorktree] = useState<Record<string, WorktreeFiles>>({})
  const [refreshToken, setRefreshToken] = useState(0)
  const here = (worktreePath && byWorktree[worktreePath]) || EMPTY
  const { mode, base } = filesStateFor(ui, worktreePath ?? '')
  // FXPL-10: until the user picks one, the base is whatever `origin/HEAD` names.
  const effectiveBase = base ?? here.bases?.defaultBase ?? undefined
  // FDIF-11/16: absent means side by side with whitespace shown.
  const diffLayout = ui.diffLayout ?? 'side-by-side'
  const diffIgnoreWhitespace = ui.diffIgnoreWhitespace ?? false
  const mergeBase = here.changed?.mergeBase ?? null

  const patchFiles = useCallback(
    (wt: string, patch: (state: WorktreeFiles) => Partial<WorktreeFiles>): void => {
      setByWorktree((prev) => {
        const current = prev[wt] ?? EMPTY
        return { ...prev, [wt]: { ...current, ...patch(current) } }
      })
    },
    []
  )

  const loadDir = useCallback(
    (wt: string, dir: string): void => {
      api
        .invoke('files:list-dir', { worktreePath: wt, dir })
        .then((listing) => patchFiles(wt, (s) => ({ entries: { ...s.entries, [dir]: listing } })))
        .catch(console.error)
    },
    [patchFiles]
  )

  const loadChanged = useCallback(
    (wt: string, from: string): void => {
      api
        .invoke('files:changed-since', { worktreePath: wt, base: from })
        .then((changed) => patchFiles(wt, () => ({ changed })))
        .catch(console.error)
    },
    [patchFiles]
  )

  const loadUncommitted = useCallback(
    (wt: string): void => {
      api
        .invoke('worktrees:changes', { worktreePath: wt })
        .then((files) => patchFiles(wt, () => ({ uncommitted: files })))
        .catch(console.error)
    },
    [patchFiles]
  )

  /** The counts behind the stack's header and every section header (FDIF-19/20). */
  const loadStats = useCallback(
    (wt: string, lens: FilesMode, from: string | undefined): void => {
      // Commits mode has no list of its own to count: each commit's tab brings
      // its own counts back with `commits:files`.
      if (lens === 'full' || lens === 'commits' || (lens === 'since-base' && !from)) {
        patchFiles(wt, () => ({ stats: [] }))
        return
      }
      api
        .invoke('files:diff-stats', { worktreePath: wt, mode: lens, base: from })
        .then((stats) => patchFiles(wt, () => ({ stats })))
        .catch(console.error)
    },
    [patchFiles]
  )

  /** The first page of the Commits list, replacing whatever was paged in before. */
  const loadCommits = useCallback(
    (wt: string, from: string | undefined): void => {
      // FCMT-07: with no base there is no merge base to stop at, and F1's base
      // prompt takes the list's place rather than the app guessing one.
      if (!from) {
        patchFiles(wt, () => ({ commits: null }))
        return
      }
      api
        .invoke('commits:list', { worktreePath: wt, base: from })
        .then((commits) => patchFiles(wt, () => ({ commits })))
        .catch(console.error)
    },
    [patchFiles]
  )

  /** What one open commit tab shows (FCMT-16); read once per tab. */
  const readCommit = useCallback(
    (wt: string, sha: string): void => {
      api
        .invoke('commits:files', { worktreePath: wt, sha })
        .then((detail) =>
          patchFiles(wt, (s) => ({
            tabs: s.tabs.map((tab) =>
              tab.kind === 'commit' && tab.sha === sha ? { ...tab, detail } : tab
            )
          }))
        )
        .catch(console.error)
    },
    [patchFiles]
  )

  const readTab = useCallback(
    (wt: string, path: string): void => {
      api
        .invoke('files:read', { worktreePath: wt, relPath: path })
        .then((content) =>
          patchFiles(wt, (s) => ({
            tabs: s.tabs.map((tab) =>
              tab.kind === 'file' && tab.path === path ? { ...tab, content } : tab
            )
          }))
        )
        .catch(console.error)
    },
    [patchFiles]
  )

  /**
   * Reads both sides of one open diff tab. A diff-to-origin tab whose base no
   * longer resolves has no sides to read at all: the tab shows F1's base prompt
   * rather than the diff it last held (spec §Edge Cases).
   */
  const readDiff = useCallback(
    (wt: string, tab: DiffTab, from: string | null): void => {
      const key = tabKeyOf(tab)
      const put = (sides: DiffSides | null): void =>
        patchFiles(wt, (s) => ({
          tabs: s.tabs.map((open) => (tabKeyOf(open) === key ? { ...open, sides } : open))
        }))
      const request = diffRequestFor(tab.mode, tab.changed, from)
      if (!request) {
        put(null)
        return
      }
      api.invoke('files:diff-sides', { worktreePath: wt, request }).then(put).catch(console.error)
    },
    [patchFiles]
  )

  /** Re-lists whatever the current mode shows, and its counts (FXPL-22/23, FDIF-19). */
  const refreshMode = useCallback(
    (wt: string, lens: FilesMode, from: string | undefined, expanded: string[]): void => {
      loadStats(wt, lens, from)
      if (lens === 'full') {
        loadDir(wt, '')
        for (const dir of expanded) loadDir(wt, dir)
        return
      }
      if (lens === 'uncommitted') {
        loadUncommitted(wt)
        return
      }
      if (lens === 'commits') {
        loadCommits(wt, from)
        // The uncommitted row's count is read the way the uncommitted mode
        // reads its list, not from the tree snapshot the design suggested: the
        // snapshot only moves when the app re-reads the tree, so a file saved
        // while the list is open would leave the row's number stale.
        loadUncommitted(wt)
        return
      }
      // FXPL-11: with no base there is nothing to compare, and the picker asks
      // for one rather than the app guessing.
      if (from) loadChanged(wt, from)
      else patchFiles(wt, () => ({ changed: null }))
    },
    [loadDir, loadUncommitted, loadChanged, loadCommits, loadStats, patchFiles]
  )

  // What the `files:changed` subscription needs to read without resubscribing
  // on every keystroke of state.
  const live = useRef({ worktreePath, active, mode, effectiveBase, here, mergeBase })
  useEffect(() => {
    live.current = { worktreePath, active, mode, effectiveBase, here, mergeBase }
  })

  // The picker's choices and the `origin/HEAD` default (FXPL-09/10/11). One git
  // call per worktree visit; the diff mode cannot list until it resolves.
  useEffect(() => {
    if (!active || !worktreePath) return
    api
      .invoke('files:bases', { worktreePath })
      .then((bases) => patchFiles(worktreePath, () => ({ bases })))
      .catch(console.error)
  }, [active, worktreePath, patchFiles])

  // The current mode's list. `expanded` is read through the ref on purpose: as a
  // dependency it would re-list a folder that `toggleFolder` has just listed.
  useEffect(() => {
    if (!active || !worktreePath) return
    refreshMode(worktreePath, mode, effectiveBase, live.current.here.expanded)
  }, [active, worktreePath, mode, effectiveBase, refreshMode])

  // FDIF-32: the base moved, so every diff-to-origin diff compares against a
  // different commit. Keyed on the resolved merge base rather than on the chosen
  // branch, because that is what the two sides are actually read at, and it is
  // only known once the new listing has come back. Uncommitted diffs compare
  // `HEAD` against the disk and are untouched by it.
  useEffect(() => {
    if (!active || !worktreePath) return
    const wt = worktreePath
    for (const tab of live.current.here.tabs) {
      if (tab.kind === 'diff' && tab.mode === 'since-base') readDiff(wt, tab, mergeBase)
    }
  }, [active, worktreePath, mergeBase, readDiff])

  // FCMT-32: the tree was re-read, which is what the status bar does after a
  // push, sync, publish or fetch succeeds. Re-listing recomputes the markers.
  // Compared against the last value rather than merely depended on, so the
  // mount and a mode switch do not fetch the page a second time.
  const seenTree = useRef(treeRevision)
  useEffect(() => {
    if (seenTree.current === treeRevision) return
    seenTree.current = treeRevision
    const current = live.current
    if (!current.active || !current.worktreePath || current.mode !== 'commits') return
    loadCommits(current.worktreePath, current.effectiveBase)
  }, [treeRevision, loadCommits])

  // FCMT-32: a push from outside the app moves the same refs and gives no
  // signal at all, so the window regaining focus stands in — debounced by 5 s,
  // the way App debounces its own focus refresh, against focus flapping.
  const lastFocusAt = useRef(0)
  useEffect(() => {
    const onFocus = (): void => {
      const now = Date.now()
      if (now - lastFocusAt.current < FOCUS_REFRESH_MS) return
      lastFocusAt.current = now
      const current = live.current
      if (!current.active || !current.worktreePath || current.mode !== 'commits') return
      loadCommits(current.worktreePath, current.effectiveBase)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadCommits])

  // FXPL-23: one worktree is watched, and only while the direction is Files.
  useEffect(() => {
    api.invoke('files:watch', { worktreePath: active ? worktreePath : null }).catch(console.error)
  }, [active, worktreePath])

  useEffect(() => {
    return api.on('files:changed', (event) => {
      const current = live.current
      if (!current.active || !current.worktreePath) return
      if (event.worktreePath !== current.worktreePath) return
      const wt = current.worktreePath
      const tabs = current.here.tabs
      // Every open file tab the batch touches is re-read in place (FXPL-21/24).
      const open = tabs.filter((tab): tab is FileTab => tab.kind === 'file').map((tab) => tab.path)
      for (const path of tabsAffected(open, event.paths)) readTab(wt, path)

      const diffs = tabs.filter((tab): tab is DiffTab => tab.kind === 'diff')
      if (event.gitStateChanged) {
        // FDIF-31: the index or HEAD moved, so both sides of everything may have.
        for (const tab of diffs) readDiff(wt, tab, current.mergeBase)
        setRefreshToken((token) => token + 1)
      } else {
        // FDIF-30: a write on disk only moves the uncommitted diff of that file.
        const uncommitted = diffs.filter((tab) => tab.mode === 'uncommitted')
        const touched = new Set(
          tabsAffected(
            uncommitted.map((tab) => tab.path),
            event.paths
          )
        )
        for (const tab of uncommitted) {
          if (touched.has(tab.path)) readDiff(wt, tab, current.mergeBase)
        }
      }
      refreshMode(wt, current.mode, current.effectiveBase, current.here.expanded)
    })
  }, [readTab, readDiff, refreshMode])

  const persist = useCallback(
    (patch: Partial<FilesState>): void => {
      if (!worktreePath) return
      const next = { ...filesStateFor(ui, worktreePath), ...patch }
      onPersist({ files: { ...(ui.files ?? {}), [worktreePath]: next } })
    },
    [ui, worktreePath, onPersist]
  )

  const setMode = useCallback((next: FilesMode): void => persist({ mode: next }), [persist])
  const setBase = useCallback((next: string): void => persist({ base: next }), [persist])
  // FDIF-12/16: one global choice for every open diff, persisted like the rest
  // of `ui.*` and applied to the editors already on screen.
  const setDiffLayout = useCallback(
    (next: 'side-by-side' | 'inline'): void => onPersist({ diffLayout: next }),
    [onPersist]
  )
  const setDiffIgnoreWhitespace = useCallback(
    (next: boolean): void => onPersist({ diffIgnoreWhitespace: next }),
    [onPersist]
  )

  const toggleFolder = useCallback(
    (path: string): void => {
      if (!worktreePath) return
      const wt = worktreePath
      patchFiles(wt, (s) => ({
        expanded: s.expanded.includes(path)
          ? s.expanded.filter((dir) => dir !== path)
          : [...s.expanded, path]
      }))
      // FXPL-05: a folder's children are listed when it opens, and only once —
      // a folder already listed keeps what it has.
      if (!here.expanded.includes(path) && here.entries[path] === undefined) loadDir(wt, path)
    },
    [worktreePath, patchFiles, loadDir, here]
  )

  const selectFolder = useCallback(
    (path: string): void => {
      if (!worktreePath) return
      patchFiles(worktreePath, () => ({ lastFolder: { path, at: Date.now() } }))
    },
    [worktreePath, patchFiles]
  )

  const openFile = useCallback(
    (path: string): void => {
      if (!worktreePath) return
      const wt = worktreePath
      const at = Date.now()
      const key = tabKeyOf({ kind: 'file', path })
      // Decided from the ref, NOT from inside the updater below: React runs a
      // setState updater at the next render, so a flag assigned in there is
      // still false on the line after the call and the read never fires — the
      // tab opens and sits at "Loading…" forever (caught by the T23 smoke).
      const known = live.current.here.tabs.find(
        (tab): tab is FileTab => tab.kind === 'file' && tab.path === path
      )
      const needsRead = !known || known.content === null
      patchFiles(wt, (s) => {
        const existing = s.tabs.find((tab) => tabKeyOf(tab) === key)
        // FXPL-16: an already-open file focuses its tab instead of opening a second one.
        if (existing) {
          return {
            tabs: s.tabs.map((tab) => (tabKeyOf(tab) === key ? { ...tab, at } : tab)),
            activeTab: key
          }
        }
        const tab: FileTab = { kind: 'file', path, content: null, at }
        return { tabs: [...s.tabs, tab], activeTab: key }
      })
      if (needsRead) readTab(wt, path)
    },
    [worktreePath, patchFiles, readTab]
  )

  const openDiff = useCallback(
    (changed: ChangedPath, lens: DiffMode): void => {
      if (!worktreePath) return
      const wt = worktreePath
      const at = Date.now()
      const key = tabKeyOf({ kind: 'diff', mode: lens, path: changed.path })
      const known = live.current.here.tabs.find((tab) => tabKeyOf(tab) === key)
      const tab: DiffTab = {
        kind: 'diff',
        mode: lens,
        path: changed.path,
        changed,
        sides: null,
        at
      }
      patchFiles(wt, (s) => {
        // FDIF-08: the same path is a different tab in each mode, and different
        // again from its file tab, so an already-open diff focuses rather than
        // duplicating.
        if (s.tabs.some((open) => tabKeyOf(open) === key)) {
          return {
            tabs: s.tabs.map((open) => (tabKeyOf(open) === key ? { ...open, at } : open)),
            activeTab: key
          }
        }
        return { tabs: [...s.tabs, tab], activeTab: key }
      })
      if (!known) readDiff(wt, tab, live.current.mergeBase)
    },
    [worktreePath, patchFiles, readDiff]
  )

  const openCommit = useCallback(
    (row: CommitRow): void => {
      if (!worktreePath) return
      const wt = worktreePath
      const at = Date.now()
      const key = tabKeyOf({ kind: 'commit', sha: row.sha })
      // Read from the ref, not from inside the updater: an updater runs at the
      // next render, so a flag set in there is still false on the line below
      // and the read never fires (the trap `openFile` documents).
      const known = live.current.here.tabs.find(
        (tab): tab is CommitTab => tab.kind === 'commit' && tab.sha === row.sha
      )
      const needsRead = !known || known.detail === null
      patchFiles(wt, (s) => {
        // FCMT-16: an already-open commit focuses its tab, it does not open a
        // second one — the sha is the identity (FCMT-20).
        if (s.tabs.some((open) => tabKeyOf(open) === key)) {
          return {
            tabs: s.tabs.map((open) => (tabKeyOf(open) === key ? { ...open, at } : open)),
            activeTab: key
          }
        }
        const tab: CommitTab = { kind: 'commit', sha: row.sha, row, detail: null, at }
        return { tabs: [...s.tabs, tab], activeTab: key }
      })
      if (needsRead) readCommit(wt, row.sha)
    },
    [worktreePath, patchFiles, readCommit]
  )

  const loadMoreCommits = useCallback((): void => {
    const wt = worktreePath
    const page = live.current.here.commits
    if (!wt || !effectiveBase || !page?.hasMore || page.cursor === null) return
    api
      .invoke('commits:list', { worktreePath: wt, base: effectiveBase, cursor: page.cursor })
      .then((next) =>
        patchFiles(wt, (s) => ({
          // The newer page's flags win — `hasMore`, `cursor`, `upstream` — and
          // its rows are appended below the ones already read (FCMT-09).
          commits: s.commits
            ? { ...next, commits: mergePages(s.commits.commits, next.commits) }
            : next
        }))
      )
      .catch(console.error)
  }, [worktreePath, effectiveBase, patchFiles])

  const openCommitInBrowser = useCallback(
    (sha: string): Promise<LaunchResult> => {
      if (!worktreePath) return Promise.resolve({ ok: false, error: 'No worktree is selected.' })
      return api.invoke('commits:open', { worktreePath, sha })
    },
    [worktreePath]
  )

  const requestFor = useCallback(
    // Only the two diff modes compare a path against something. Full-folder
    // mode has no second side, and Commits mode builds its sides from a sha
    // rather than from the mode (FCMT-17).
    (changed: ChangedPath): DiffRequest | null =>
      mode === 'full' || mode === 'commits' ? null : diffRequestFor(mode, changed, mergeBase),
    [mode, mergeBase]
  )

  const focusTab = useCallback(
    (key: string): void => {
      if (!worktreePath) return
      patchFiles(worktreePath, (s) => ({
        tabs: s.tabs.map((tab) => (tabKeyOf(tab) === key ? { ...tab, at: Date.now() } : tab)),
        activeTab: key
      }))
    },
    [worktreePath, patchFiles]
  )

  const closeTab = useCallback(
    (key: string): void => {
      if (!worktreePath) return
      patchFiles(worktreePath, (s) => {
        // The strip, not the open tabs: `tabsAfterClose` has to see the fixed
        // tab to refuse closing it and to catch the focus (FDIF-17).
        const keys = tabsWithAllChanges(s.tabs, mode).map(tabKeyOf)
        const index = keys.indexOf(key)
        if (index === -1) return {}
        const after = tabsAfterClose(keys, index, s.activeTab)
        return {
          tabs: s.tabs.filter((tab) => after.tabs.includes(tabKeyOf(tab))),
          activeTab: after.active
        }
      })
    },
    [worktreePath, patchFiles, mode]
  )

  // `tabsWithAllChanges` is generic over what the strip holds and widens its
  // element type to `TabRef`; nothing it returns is anything but one of the
  // open tabs or the fixed one, which is exactly `StripTab`.
  const strip = tabsWithAllChanges(here.tabs, mode) as StripTab[]
  const keys = strip.map(tabKeyOf)
  // A focus naming a tab that is gone falls to the first of the strip, which in
  // both diff modes is All changes — the reason closing the tab beside it never
  // leaves the column empty (FDIF-17).
  const stillOpen = here.activeTab !== null && keys.includes(here.activeTab)
  const activeTab = stillOpen ? here.activeTab : (keys[0] ?? null)
  const focused = here.tabs.find((tab) => tabKeyOf(tab) === activeTab) ?? null
  // A commit tab names no path on disk, so it never becomes a launcher target.
  const focusedPath = focused && focused.kind !== 'commit' ? focused : null
  const target = launcherTarget(
    focusedPath ? { path: focusedPath.path, at: focusedPath.at } : null,
    here.lastFolder
  )

  return {
    mode,
    base: effectiveBase,
    mergeBase,
    bases: here.bases,
    entries: here.entries,
    expanded: here.expanded,
    changed: here.changed,
    uncommitted: here.uncommitted,
    changedFiles: mode === 'uncommitted' ? here.uncommitted : (here.changed?.files ?? []),
    stats: here.stats,
    commits: here.commits,
    uncommittedCount: here.uncommitted.length,
    tabs: here.tabs,
    strip,
    activeTab,
    diffLayout,
    diffIgnoreWhitespace,
    refreshToken,
    launchTarget: worktreePath && target !== null ? absoluteIn(worktreePath, target) : null,
    setMode,
    setBase,
    setDiffLayout,
    setDiffIgnoreWhitespace,
    toggleFolder,
    selectFolder,
    openFile,
    openDiff,
    requestFor,
    openCommit,
    loadMoreCommits,
    openCommitInBrowser,
    focusTab,
    closeTab
  }
}

/**
 * A worktree-relative path as the launchers need it: absolute, with Windows
 * separators. `explorer.exe /select,` parses its own command line and wants
 * backslashes, and every tool the launcher row offers is Windows-only.
 */
export function absoluteIn(worktreePath: string, relPath: string): string {
  const root = worktreePath.replace(/[\\/]+$/, '')
  const rest = relPath.replace(/\//g, '\\')
  return rest === '' ? root : `${root}\\${rest}`
}
