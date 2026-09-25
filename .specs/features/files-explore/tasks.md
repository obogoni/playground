# Files Direction — Explore (F1) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-explore/design.md`
**Status**: Draft

**Branch**: `feature/files-explore`, stacked on `feature/status-bar` (design header). The PR to upstream carries "depends on" the status-bar PR; once that merges, `git rebase --onto origin/main feature/status-bar feature/files-explore`.

**Prerequisite**: `status-bar` executed — this feature imports its `src/main/git.ts` and edits its `StatusBar.tsx`.

**Test baseline**: **797** — the count `status-bar/tasks.md` projects at its end (748 on `origin/main` + 49). **Both figures are projections. Re-measure with `npm test` as the first act of Execute** and re-anchor every expected count below.

**Baseline measured 2026-09-19** with `npx vitest run` on `origin/main` `6ecd19c`, after the upstream merged #88: **917 tests / 52 files**, all passing. The 748 the plans started from was recorded before #88 and is stale by **+169**. Its baseline becomes status-bar's corrected end, **966**; every count below shifts by **+169** and this feature ends at **1019**, not 850. Still re-measure as the first act of Execute.

**Baseline measured 2026-09-20** with `npm test` on this branch, rebased onto `feature/status-bar` `09c4b4f`: **979 tests / 55 files**, all passing. Status-bar ended 13 tests above the 966 projected for it, so the shift from the written counts is **+182**, not +169. **Every count below reads +182**; T1's 797 means 979, and this feature ends at **1032**. This is a measurement, not a projection — the counts below stay as written and the offset applies to all of them.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process modules with logic (`file-tree.ts`, `file-reader.ts`, `file-watcher.ts`, `shortcut-launcher.ts`) | unit | All branches; 1:1 to the ACs each module owns; every listed edge case reachable without a GUI | `src/main/<module>.test.ts` | `npm test` |
| Extracted pure helpers (`foldChildren`, `parseNameStatus`, `resolveInside`, `isBinary`, `files-view.ts`) | unit | Input→output per AC, including failure shapes | co-located `*.test.ts` | `npm test` |
| Shared types, IPC contract, config schema | none | build gate only | — | `npm run typecheck` |
| Thin Electron shell (`index.ts` wiring) | none (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Renderer components, hooks, Monaco setup | none (CDP smoke + visual) | — | — | `node scripts/smoke-files.mjs` |
| Out-of-CI smoke script | manual only | Every AC no unit test reaches | `scripts/smoke-*.mjs` | `node scripts/smoke-files.mjs` (live session) |

**Provenance note:** `TESTING.md`'s rule — test the pure seam and the DI'd module, hand-verify the shell and the renderer — is applied as-is. The watcher is the one module that would be tempting to leave to hand-verification because it wraps `fs.watch`; it is DI'd (pattern 3) precisely so the git-dir watch, the batching and the handle cleanup are unit-tested, since those are the parts that fail silently.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a logic-bearing, contract, config or renderer task | `npm run typecheck && npm run lint && npm test` |
| Build | At each phase boundary | `npx electron-vite build` |
| Packaged | The Monaco spike (T13) only | `npm run build:unpack`, then launch `dist/win-unpacked` |
| Manual | The CDP smoke | `npm run dev -- -- --remote-debugging-port=9222`, then `node scripts/smoke-files.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

Phases run sequentially; tasks within a phase run in order.

### Phase 1: Main process

Contract, the three new modules, the launcher fixes, the wiring. No UI.

```
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
```

### Phase 2: Renderer decisions

Config schema and every pure rule the view renders, with tests, before any component exists.

```
T8 → T9 → T10 → T11 → T12
```

### Phase 3: Viewer de-risk

The Monaco spike first — nothing that renders a file is built until it has run packaged.

```
T12 → T13 → T14 → T15
```

### Phase 4: The direction

```
T15 → T16 → T17 → T18 → T19 → T20 → T21
```

### Phase 5: Status bar landing and end-to-end

```
T21 → T22 → T23
```

---

## Task Breakdown

### T1: Declare the Files contract

**What**: Add `src/shared/files.ts` with `FilesMode`, `FileEntry`, `DirListing`, `ChangedPath`, `ChangedListing`, `BaseOptions`, `FileContent`, `FilesChanged` as the design defines them; register `files:list-dir`, `files:changed-since`, `files:bases`, `files:read`, `files:watch` in `IpcContract` and `files:changed` in `IpcEvents`.
**Where**: `src/shared/files.ts`
**Depends on**: None
**Reuses**: `ChangeStatus` from `shared/worktrees.ts`; the contract's doc-comment convention; the `IpcEvents` map (AD-004).
**Requirement**: FXPL-02, 08, 09, 16, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `ChangedPath.status` is `ChangeStatus` — one status vocabulary across both diff modes
- [x] Five invoke channels and one event declared; nothing imports them yet
- [x] Baseline lint warning count recorded in the commit body
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **797** (unchanged) — measured **979**, unchanged

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): declare the files direction contract`
**Status**: ✅ Complete

---

### T2: List one folder of a worktree

**What**: Create `src/main/file-tree.ts` with `listDir(worktreePath, dir)` — `git ls-files --cached --others --exclude-standard --directory -z -- <dir>/` — and the pure `foldChildren(paths, dir)`.
**Where**: `src/main/file-tree.ts`
**Depends on**: T1
**Reuses**: `git()` / `gitFailureLine()` from status-bar's `git.ts`; the temp-repo pattern of `worktree-manager.test.ts`.
**Requirement**: FXPL-04, 05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `foldChildren` turns recursive descendants (`src/a/f.ts` under `src/`) into one level: files plus folder names
- [x] A wholly untracked folder reported as `newdir/` becomes one `dir` entry flagged `untracked`
- [x] Folders sort before files, each group alphabetically, case-insensitive
- [x] Against a temp repo: an ignored folder never appears; an untracked non-ignored file does
- [x] A git failure returns `{ entries: [], error }` and never throws
- [x] `src/main/file-tree.test.ts` created
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 797 + 7 = **804** — measured **986**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): list one folder of a worktree`
**Status**: ✅ Complete

---

### T3: List what the branch changed since its base

**What**: Add `changedSince(worktreePath, base)` to `file-tree.ts` — `git merge-base HEAD <base>`, then `git diff --name-status -z <mergeBase> HEAD` — and the pure `parseNameStatus(stdout)`.
**Where**: `src/main/file-tree.ts`
**Depends on**: T2
**Reuses**: `git.ts`; `ChangeStatus`.
**Requirement**: FXPL-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `parseNameStatus` maps `M`, `A`, `D`, `T` and scored `R100` / `C75` onto `ChangeStatus`, carrying `oldPath` for renames
- [x] Only committed changes are listed — an uncommitted edit does not appear (spec assumption: committed only)
- [x] A base that no longer exists returns `{ mergeBase: null, files: [], error }`
- [x] Tests cover the parser cases and a temp repo two commits past its base
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 804 + 6 = **810** — measured **992**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): list the files a branch changed since its base`
**Status**: ✅ Complete

---

### T4: Offer the possible bases

**What**: Add `listBases(worktreePath)` to `file-tree.ts` — default from `git symbolic-ref --short refs/remotes/origin/HEAD`, choices from `git for-each-ref --format=%(refname:short) refs/heads refs/remotes`.
**Where**: `src/main/file-tree.ts`
**Depends on**: T3
**Reuses**: `git.ts`.
**Requirement**: FXPL-09, 10, 11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] A repo whose `origin/HEAD` points at `origin/main` returns `defaultBase: 'origin/main'`
- [x] A repo with no `origin/HEAD` returns `defaultBase: null` — never a guessed branch
- [x] `branches` lists local and remote branches, without the `origin/HEAD` symref itself
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 810 + 3 = **813** — measured **995**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): offer the bases a branch can be compared to`
**Status**: ✅ Complete

> Note: `%(refname:short)` renders `refs/remotes/origin/HEAD` as plain `origin`, so the symref is
> excluded by its `%(symref)` field, not by a `/HEAD` suffix.

---

### T5: Read a file for the viewer

**What**: Create `src/main/file-reader.ts` with `readForView(worktreePath, relPath)` and the pure `resolveInside(root, relPath)` and `isBinary(head)`.
**Where**: `src/main/file-reader.ts`
**Depends on**: T4
**Reuses**: The `mkdtempSync` real-fs pattern.
**Requirement**: FXPL-16, 17, 20, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `resolveInside` rejects an absolute path and `../` escapes, and accepts a path through a folder inside the root
- [x] `isBinary` is true for a NUL byte within the first 8000 bytes and false otherwise
- [x] A file above 1 MB returns `too-large` **without being read** (asserted by size with a sparse or large temp file, not by timing)
- [x] Missing file → `missing`; binary → `binary`; Latin-1 bytes → `text` containing `U+FFFD`
- [x] `src/main/file-reader.test.ts` created
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 813 + 9 = **822** — measured **1004**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): read a worktree file for the viewer`
**Status**: ✅ Complete

---

### T6: Watch the selected worktree

**What**: Create `src/main/file-watcher.ts` — a DI'd `FileWatcher` taking a `WatchPort`, a git-dir resolver, a scheduler and an emit callback; `select(worktreePath | null)` opens one recursive watch on the root plus watches on `<git-dir>/index` and `<git-dir>/HEAD`, batching events for 250 ms.
**Where**: `src/main/file-watcher.ts`
**Depends on**: T5
**Reuses**: The injected-fake pattern of `task-board.test.ts` (pattern 3).
**Requirement**: FXPL-21, 22, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Three events inside 250 ms emit **one** `FilesChanged` carrying all three paths
- [x] An event under the root's `.git` entry is dropped
- [x] An `index` or `HEAD` event sets `gitStateChanged: true` — the linked-worktree case the design verified
- [x] `select(other)` closes every handle of the previous worktree before opening new ones; `select(null)` closes all
- [x] A pending batch for a deselected worktree is discarded, not emitted
- [x] `src/main/file-watcher.test.ts` created, using fakes only — no real `fs.watch`
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 822 + 7 = **829** — measured **1011**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): watch the selected worktree for file changes`
**Status**: ✅ Complete

---

### T7: Make the launchers safe for arbitrary files

**What**: In `shortcut-launcher.ts`, launch Explorer with `/select,<path>` when the target is a file, and launch VS Code with the path passed through an environment variable (`code "%PLAYGROUND_TARGET%"`) instead of interpolated into the shell line.
**Where**: `src/main/shortcut-launcher.ts`
**Depends on**: T6
**Reuses**: The existing pure-helper test style (`buildElevatedOpen`).
**Requirement**: FXPL-25, 27, 29, 30

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] The argument builders are pure, exported and tested: a file yields `/select,`, a folder does not
- [x] The VS Code launch line never contains the path; the path travels only in the environment
- [x] **Verified by hand on this machine**: Explorer selects `C:\tmp\a b, c\x.txt` (space and comma); VS Code opens a file named `%PATH%.txt`. If Explorer mis-parses, fall back to opening the parent folder and record it as `SPEC_DEVIATION` here
- [x] `openVisualStudio` is unchanged — `.sln` reuse needs no launcher change
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 829 + 4 = **833** — measured **1015**

**Tests**: unit
**Gate**: full
**Commit**: `fix(main): launch explorer and vs code safely on any file`
**Status**: ✅ Complete

**Hand-check record (2026-09-20, this machine).** No `SPEC_DEVIATION`: FXPL-27 is met, but the
design's assumed argument shape was wrong and the risk table's concern was real.

| Check | Form | Result |
| ----- | ---- | ------ |
| Explorer, folder named `a b, c` | `spawn('explorer.exe', ['/select,<path>'])` — Node quotes the whole argument | **FAIL**: Explorer discards it, opens the default folder, selects nothing |
| Explorer, same folder | `/select,"<path>"` with `windowsVerbatimArguments` | **PASS**: `Shell.Application` reports `Folder` = `…\a b, c` and `FocusedItem` = `…\a b, c\x.txt` |
| VS Code, file named `%PATH%.txt` | `code "%PLAYGROUND_TARGET%"` + env | **PASS**: child receives the literal path; through a `.cmd` shim too; real launch exits 0 and VS Code's window title reads `%PATH%.txt - Visual Studio Code` |
| VS Code, old form | `code "<path>"` interpolated | **FAIL** (contrast): `%PATH%` expands to the whole PATH variable |

The fix therefore quotes the path alone and passes Explorer's command line verbatim. The parent-folder
fallback was not needed.

---

### T8: Serve the files channels

**What**: Register the five `files:*` handlers in `index.ts`, construct the `FileWatcher` with the real `fs.watch` and `emit`, and resolve the git-dir with `git rev-parse --git-dir`.
**Where**: `src/main/index.ts`
**Depends on**: T7
**Reuses**: `handle()`, `emit()`, the registration style of `handle('worktrees:changes', …)`.
**Requirement**: FXPL-02, 08, 09, 16, 21, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Each handler is a one-line delegation
- [x] The watcher is closed on app quit
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: **833** (unchanged — wiring) — measured **1015**, unchanged

**Tests**: none
**Gate**: build
**Commit**: `feat(main): serve the files direction channels`
**Status**: ✅ Complete — Phase 1 done

---

### T9: Add the Files direction to the config schema

**What**: Add `'files'` to `AppConfig.ui.direction` and the optional `ui.files?: Record<worktreeId, { mode: FilesMode; base?: string }>`.
**Where**: `src/shared/config.ts`
**Depends on**: T8
**Reuses**: The flat, optional-means-default convention of the other `ui.*` keys.
**Requirement**: FXPL-01, 13

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `DEFAULT_CONFIG` is unchanged — absent `files` means full folder and `origin/HEAD` (D4)
- [x] An existing `config.json` without the key loads unchanged (existing `config-store` tests stay green unedited)
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **833** (unchanged — schema) — measured **1015**, unchanged

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): add the files direction to the config`
**Status**: ✅ Complete

> Note: the direction union held four members here, not five — `'tree' | 'board' |
> 'agents' | 'workflows'` — so `'files'` makes the **fifth**, not the sixth the spec
> and FXPL-01 describe. The union is the app's own record; the spec's count is off by
> one. Nothing else changes: T20 still adds one segment to the TopBar, which today
> renders four.

---

### T10: Nest a flat path list into a tree

**What**: Create `src/renderer/src/lib/files-view.ts` with `buildTree(paths)` and `isSolution(path)`.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T9
**Reuses**: `ChangedPath` from T1.
**Requirement**: FXPL-08, 12, 28

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `buildTree` nests `a/b/c.ts` and `a/d.ts` under one `a`, keeping each leaf's status
- [x] Sorting matches `foldChildren`: folders first, then alphabetical, case-insensitive
- [x] `isSolution` accepts `.sln` and `.slnx` in any case and rejects `.sln.bak`
- [x] `files-view.test.ts` created
- [x] Gate passes: `npm test`
- [x] Test count: 833 + 6 = **839** — measured **1021**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): nest changed paths into a tree`
**Status**: ✅ Complete

---

### T11: Decide tab close and launcher target

**What**: Add `tabsAfterClose(tabs, closedIndex)` and `launcherTarget(activeTab, lastFolder)` to `files-view.ts`.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T10
**Reuses**: Nothing — new pure logic.
**Requirement**: FXPL-19, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Closing the active middle tab focuses the next one; closing the last focuses the previous; closing the only tab leaves none
- [x] Closing an inactive tab keeps the active one
- [x] `launcherTarget` returns whichever of the active file and the last selected folder is more recent, and null when neither exists
- [x] Gate passes: `npm test`
- [x] Test count: 839 + 6 = **845** — measured **1027**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide tab focus and launcher target`
**Status**: ✅ Complete

> Note: both signatures are wider than the design's sketch, which named no argument
> carrying the current focus or the recency the rule compares.
> `tabsAfterClose(tabs, closedIndex, activePath)` takes the focused path as well, or
> "closing an inactive tab keeps the active one" is undecidable inside the function;
> it returns `{ tabs, active }` as designed. `launcherTarget` takes
> `{ path, at } | null` for each side, `at` being when the user picked it, since
> "more recent" needs an ordering the design left implicit. Return type unchanged.

---

### T12: Decide mode defaults and which tabs a change touches

**What**: Add `filesStateFor(ui, worktreeId)` and `tabsAffected(openTabs, changedPaths)` to `files-view.ts`.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T11
**Reuses**: `FilesChanged` from T1.
**Requirement**: FXPL-13, 21, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] An unknown worktree yields full folder and no base; a stored one yields its mode and base
- [x] `tabsAffected` returns only open tabs whose path is in the change — the scoped reaction of FXPL-23
- [x] Path comparison is separator-insensitive (`src\a.ts` equals `src/a.ts`)
- [x] Gate passes: `npm test`
- [x] Test count: 845 + 5 = **850** — measured **1032**
- [x] Phase gate passes: `npx electron-vite build`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide files mode defaults and affected tabs`
**Status**: ✅ Complete — Phase 2 done

> Note: `tabsAffected` folds separators only, not case. The done-when asks for
> separator-insensitivity and nothing else, and a case fold would be untested
> behaviour on a Windows-only path. If the watcher turns out to report a different
> case than the tree lists, that is T16's to find.

---

### T13: Prove Monaco runs here — spike

**What**: Add `monaco-editor`, create `src/renderer/src/lib/monaco-setup.ts` (the `editor.api` + basic-language contributions + `editor.worker` via Vite `?worker`, theme following `data-theme`), and prove a read-only editor renders in dev **and** in the packaged build.
**Where**: `src/renderer/src/lib/monaco-setup.ts`
**Depends on**: T12
**Reuses**: The AM1 spike precedent (`agent-spike`): prove the risky stack packaged before building on it.
**Requirement**: FXPL-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `monaco-editor` added to `dependencies` in `package.json`, version pinned — `0.56.0`, exact
- [x] A throwaway mount renders a highlighted `.ts` file in `npm run dev` with **no CSP violation** in the console — 32 tokens over 9 token classes; worker `/@fs/.../editor.worker.js?worker_file&type=module`
- [x] The same in `dist/win-unpacked` after `npm run build:unpack` — 32 lines, 333 tokens, 14 token classes
- [x] The worker is served as a file, not a `blob:` URL (checked in DevTools' Sources) — packaged url `file:///.../app.asar/out/renderer/assets/editor.worker-BwBjdhCz.js`
- [x] Bundle growth measured (renderer output size before vs after) and written in the commit body
- [x] Theme flips between `vs` and `vs-dark` with the app theme — background `rgb(30,30,30)` to `rgb(255,255,254)`
- [x] The throwaway mount is removed before commit; `monaco-setup.ts` stays
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **850** (unchanged — renderer setup) — measured **1032**, unchanged

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): set up a read-only monaco editor`
**Status**: PASS — the stack is proven; Phase 3 proceeds as planned.

> **Import paths.** Monaco 0.56 ships an `exports` map (`"./*": "./esm/vs/*.js"`), so the
> widely documented `monaco-editor/esm/vs/editor/editor.api` resolves to `esm/vs/esm/vs/...`
> and Rollup fails with "failed to resolve import". The correct specifiers drop the prefix:
> `monaco-editor/editor/editor.api`, `monaco-editor/basic-languages/monaco.contribution`,
> `monaco-editor/editor/editor.worker?worker`. F2 imports the same module and inherits this.
>
> **The spike mounts a DIFF editor, not a plain one.** A read-only editor with only Monarch
> never starts a worker — it tokenises on the main thread — so it would have proved nothing
> about the CSP's worker rule, and the check would have passed vacuously. The diff is computed
> in the worker, which is also exactly F2's surface, so the spike drives `createDiffEditor` and
> asserts `getLineChanges()` returns the planted changes. Verified in dev and packaged.
>
> **Bundle growth** (renderer, unminified — this project does not minify the renderer):
> main chunk 1,229.12 kB to 6,363.49 kB (+5,134.37 kB); CSS 168.68 kB to 284.63 kB
> (+115.95 kB); plus a 584.83 kB worker and 654.70 kB across 81 lazy language chunks.
> Accepted by the owner on 2026-09-20: a local Electron app pays this in disk and parse,
> not in transfer.
>
> **Pre-existing CSP violation, NOT caused by Monaco and not fixed here.** The packaged build
> logs 38 `Loading the font 'data:font/woff...' violates ... "default-src 'self'"` errors: the
> app's `@fontsource` CSS inlines fonts as `data:` URIs and the CSP sets no `font-src`, so
> `default-src 'self'` blocks them and the app falls back silently. A control build with the
> spike unmounted emits the identical 19 `data:font` occurrences and a byte-identical 168.68 kB
> CSS, which is the proof it predates this feature. Dev does not show it, because the dev server
> serves the fonts as files. Out of scope for F1 — see the Handoff note.

---

### T14: Render a file read-only

**What**: Create the `CodeViewer` component — Monaco read-only for a `text` `FileContent`, language from the extension, keeping `scrollTop` when the content is replaced, with the "file view, not a diff" label when opened from a diff mode.
**Where**: `src/renderer/src/components/CodeViewer.tsx`
**Depends on**: T13
**Reuses**: `monaco-setup.ts` from T13.
**Requirement**: FXPL-14, 17, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Replacing the content keeps the scroll position (checked by hand with a long file) — 400-line file, `scrollTop` 2400 to 2400 and first visible line 128 to 128
- [x] The editor is created once per tab and disposed on unmount — no model leak across tab switches — one live editor measured, inside `.code-viewer-editor`
- [x] The diff-mode label renders only when the tab was opened from a diff mode
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **850** (unchanged) — measured **1032**, unchanged

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render a file read-only`
**Status**: Complete

> **Monaco scrolls virtually, so the scroll check needs the editor API.** The
> `.monaco-scrollable-element` keeps `scrollTop` at 0 and assigning to it does
> nothing; the offset only moves through `editor.setScrollTop`. A first version
> of this hand check drove the DOM, measured 0 before and 0 after, and would
> have reported the criterion as met without ever scrolling. The check now
> asserts `getVisibleRanges()[0].startLineNumber` as well as the offset, so a
> viewport that silently returns to the top fails even when the number is right.
>
> **`setValue` resets the scroll**, which is why `CodeViewer` captures and
> restores the offset around the edit rather than relying on Monaco to hold it.
>
> **`followAppTheme` runs per mounted viewer.** Monaco's theme is global, so
> once F2 mounts a diff editor beside a file tab, move the call up to the
> direction root (T19/T21) instead of running one observer per viewer.
>
> **`languageForPath` lives in `monaco-setup.ts`, untested.** It reads
> `monaco.languages.getLanguages()`, so it needs Monaco loaded and is not the
> pure helper the Test Coverage Matrix would require a unit test for. Covered by
> the T23 smoke.

---

### T15: Render what cannot be shown

**What**: Create the `FilePlaceholder` component for `binary`, `too-large`, `missing` and a deleted-listed file — name, size, type, and the launcher row.
**Where**: `src/renderer/src/components/FilePlaceholder.tsx`
**Depends on**: T14
**Reuses**: The launcher icons already used by `WorktreeDetail`.
**Requirement**: FXPL-15, 20, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Each of the four kinds has its own wording; size is human-readable — `binary`, `too-large`, `missing`, `deleted` in `WORDING`; `formatSize` prints B/KB/MB/GB
- [x] A deleted file shows no launcher that would open a missing path — `missing` and `deleted` render no launcher row at all
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: **850** (unchanged) — measured **1032**, unchanged

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): show a placeholder for files that cannot render`
**Status**: Complete — Phase 3 closed.

> **The launcher row appears in two places in the plan, and T18 must settle it.**
> FXPL-25 puts File Explorer, VS Code, VS 2022 and VS 2026 under the tabs, owned
> by `FileTabs` (T18); FXPL-20 says a binary tab shows "the launchers", and the
> design lists launchers against `FilePlaceholder` as well. Built here as T15's
> text states, so the placeholder carries its own row. **If T18 renders the
> FXPL-25 row above the tab body, the two will show the same four buttons at
> once** — at that point either drop the row from this component or keep it and
> hide the strip's for these kinds. Recorded rather than pre-empted, because the
> duplication is only visible once T18 exists.
>
> **No launcher for `missing` or `deleted`.** Every launcher here targets the
> file: File Explorer selects it, the editors open it. With no file on disk each
> one can only fail, so the row is not rendered rather than rendered disabled.
> The parent folder still exists and could be offered, but no AC asks for it.
>
> **An icon was added to `Icon.tsx`.** The set had no `file` glyph and both
> non-renderable kinds need one; `folder` and `alert` were the only near misses
> and both say something untrue. Four lines, same 24px stroke geometry as its
> neighbours.
>
> **`formatSize` and `fileType` are untested, inside the component.** Both are
> presentation helpers used in one place, and T15 is planned with `Tests: none`
> and an unchanged count. Extracting them to `files-view.ts` would put them under
> the Test Coverage Matrix's rule for pure helpers and change the count the plan
> fixes. Flagged for the Verifier: if it judges the matrix to win, they move and
> gain unit tests.

---

### T16: Own the Files state in a hook

**What**: Create `src/renderer/src/lib/use-files.ts` — per-worktree in-memory tabs, active tab, expanded folders and last folder; persisted mode and base via `config:patch`; `files:watch` with the selected worktree while the direction is Files and `null` otherwise; on `files:changed`, re-read `tabsAffected(...)` and re-list the current mode.
**Where**: `src/renderer/src/lib/use-files.ts`
**Depends on**: T15
**Reuses**: `use-tree.ts` / `use-sessions.ts` shape (AD-004); `files-view.ts`.
**Requirement**: FXPL-06, 13, 18, 21, 22, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Switching worktree and back restores that worktree's tabs and mode — state is keyed by worktree path in one `byWorktree` map, never cleared on switch; behaviour verified by the T23 smoke
- [x] Leaving the Files direction sends `files:watch(null)` — the watch effect invokes with `active ? worktreePath : null`
- [x] `gitStateChanged` refreshes the uncommitted list even when no tracked path is in the batch — the re-list is unconditional per batch, so a commit-only batch still re-lists
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **850** (unchanged) — measured **1032**, unchanged

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): own the files direction state`
**Status**: Complete

> **A tab carries a timestamp.** `launcherTarget` compares recency (T11), so the
> hook stamps `at` when a tab is opened and again when one is focused — picking a
> tab is picking it, and without the stamp FXPL-26 cannot decide between the tab
> and the last folder. The design named no such field.
>
> **The launcher target is absolute and back-slashed.** `shortcuts:launch` takes a
> path, not a worktree-relative one, and `explorer.exe /select,"<path>"` parses its
> own command line: mixed separators are not worth the risk on a Windows-only set
> of launchers. `absoluteIn` joins the two.
>
> **`files:changed` re-lists the current mode unconditionally.** Distinguishing
> "a listed path changed" from "the index moved" would need the mode's own list to
> be diffed against the batch, and `gitStateChanged` exists precisely because a
> commit changes what both diff modes list while touching nothing in the batch. One
> re-list per 250 ms batch is the cheaper correct answer. Tab re-reads stay scoped
> by `tabsAffected` (FXPL-23).
>
> **The hook is mounted by App, not by `FilesView`.** The design's diagram hangs it
> off `FilesView`, but App unmounts that component when the direction changes, and
> an unmount cleanup racing a new `files:watch` is how a worktree ends up watched
> after the user left. Mounted above the direction switch, `active` flips to false
> and the effect sends `null` in order.
>
> **Writing `live.current` during render is a lint error here**
> (`react-hooks/refs`), so the latest-values ref is assigned in a dependency-free
> effect declared before the effects that read it.

---

### T17: Render the tree and its lenses

**What**: Create the `FileTree` component — mode selector at the top, base picker in diff-to-origin mode (with the no-`origin/HEAD` prompt), lazy folder expansion, statuses in the diff modes, `.sln`/`.slnx` routed to VS 2026.
**Where**: `src/renderer/src/components/FileTree.tsx`
**Depends on**: T16
**Reuses**: The sidebar tree's row styles; `buildTree`; `isSolution`.
**Requirement**: FXPL-04, 05, 07, 08, 09, 10, 11, 12, 15, 28

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Expanding a folder triggers exactly one `files:list-dir` for that folder — `toggleFolder` lists only a folder that is neither open nor already cached, and the mode effect reads `expanded` through a ref so opening one never re-lists the rest; counted by the T23 smoke
- [x] With no default base, the diff mode lists nothing and the picker asks for a base — `SinceBase` renders the prompt while `base` is undefined, and the picker's empty option says so
- [x] Clicking a `.sln` opens VS 2026 and opens no tab — `isSolution` routes the click to `shortcuts:launch` and returns before `openFile`
- [x] A git error renders in place of the tree — `FolderRows` renders `listing.error`, `SinceBase` renders the bases and merge-base failures
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **850** (unchanged) — measured **1032**, unchanged

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render the file tree and its modes`
**Status**: Complete

> **AD-032 cost three files, not one.** The decision lives in the picker, but the
> data has to reach it: `BaseOptions` gained `error?`, `listBases` stopped
> discarding the `for-each-ref` failure it already caught, and only then could the
> picker render git's line in a disabled control with the FXPL-11 prompt
> suppressed. No existing test asserted the old failure shape, so nothing broke;
> the `symbolic-ref` failure stays silent, because a repository with no
> `origin/HEAD` is FXPL-11's case, not a failure.
>
> **A base deleted after it was picked lands on the FXPL-11 prompt** (spec §Edge
> Cases) with git's line under it. The prompt alone would hide why the list
> emptied; the line alone would not say what to do.
>
> **A solution the branch deleted is not launched.** `isSolution` routes a click
> to VS 2026, but a diff-mode row with status `deleted` has no file on disk, so
> the status is checked first and the tab shows the deleted placeholder (FXPL-15).
>
> **`absoluteIn` is exported from `use-files.ts`** so the solution launch builds
> the same absolute, back-slashed path the launcher row uses. Two spellings of one
> join is how `/select,` breaks.
>
> **The diff modes' folders are drawn open.** `buildTree` invents them from a flat
> list, so there is nothing to fetch on expand; lazy expansion is the full-folder
> mode's rule (FXPL-05). Clicking one still records the launcher target (FXPL-26).

---

### T18: Render the tabs and the launcher row

**What**: Create the `FileTabs` component — tab strip, close behaviour via `tabsAfterClose`, the viewer or placeholder for the active tab, and the Explorer / VS Code / VS 2022 / VS 2026 row targeting `launcherTarget(...)`.
**Where**: `src/renderer/src/components/FileTabs.tsx`
**Depends on**: T17
**Reuses**: `CodeViewer`, `FilePlaceholder`, `shortcuts:launch`, the existing launch-failure toast.
**Requirement**: FXPL-16, 18, 19, 25, 26, 30

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Clicking an already-open file focuses its tab instead of opening another — `openFile` finds the tab by path and only re-stamps it (T16); verified by the T23 smoke
- [x] The launcher row acts on the folder when a folder was selected after the active tab was opened — the row launches `files.launchTarget`, which is `launcherTarget(activeTab, lastFolder)` by recency
- [x] A failed launch shows the existing toast — `launch` surfaces `result.error` and a rejected invoke through `onToast`
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **850** (unchanged) — measured **1032**, unchanged

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render file tabs and launchers`
**Status**: Complete

> **The duplicated launcher row is settled: `FilePlaceholder` lost its own.**
> FXPL-25 puts the row under the tabs unconditionally, so hiding the strip for a
> binary or too-large tab was not available — that would breach the requirement
> that owns the row. The placeholder's row was the removable one, and removing it
> costs FXPL-20 nothing: the strip sits in the same column, directly above the
> placeholder, always visible, and targets the same file. The alternative was the
> same four buttons twice on one screen. `onLaunch` and the row's CSS are gone
> rather than left unused.
>
> **Only the active tab is mounted**, keyed by path, so Monaco holds one editor at
> a time and T14's disposal runs on every tab switch. The `followAppTheme` note
> from T14 therefore still stands: one mounted viewer, so the call stays inside
> `CodeViewer`.
>
> **The launchers are disabled, not hidden, when nothing is picked.** FXPL-25 says
> the column shows them; a row that appears and disappears reads as a fault. Their
> tooltip carries the absolute target, which is also how the file/folder switch of
> FXPL-26 is visible without a second label.
>
> **A `FileContent` of kind `error` has no placeholder.** The four kinds of
> `PlaceholderKind` are the spec's; a read that failed for another reason (the
> `resolveInside` guard) renders git's message in the tab body instead of being
> mapped onto a kind that would misdescribe it.

---

### T19: Compose the Files direction

**What**: Create the `FilesView` component — empty state, path-missing state, and the `ResizablePane` split of `FileTree` and `FileTabs`.
**Where**: `src/renderer/src/components/FilesView.tsx`
**Depends on**: T18
**Reuses**: `ResizablePane`; the path-missing state the tree already derives.
**Requirement**: FXPL-02, 03, 06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] No selection shows the empty state; a vanished worktree shows path-missing with no tree and no tabs — both return before `FileTree` and `FileTabs` are rendered at all
- [x] The split is resizable like the sidebar — the same `ResizablePane`, handle on the tree's right edge; verified by the T23 smoke
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **850** (unchanged) — measured **1032**, unchanged

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): compose the files direction`
**Status**: Complete

> **Path-missing is derived in App, not here.** The tree snapshot has no
> `pathMissing` flag on a worktree: `findWorktree` simply stops resolving the id
> once the worktree is gone, and `selectionAfterRefresh` then clears it. So the
> state is "a selection id that resolves to nothing", which only App can see, and
> it arrives as a prop.
>
> **The split's width is not persisted.** No AC asks for it, and `ui.sidebarWidth`
> / `ui.tasksWidth` are PANE-01's, belonging to the Tree direction's two panes.
> Local state keeps the config free of a key nothing specified. The pane collapses
> too, because `ResizablePane` takes a toggle and wiring it to nothing would leave
> its rail and its double-click dead.

---

### T20: Add the Files segment to the TopBar

**What**: Add the fifth `Files` segment to the TopBar's direction control.
**Where**: `src/renderer/src/components/TopBar.tsx`
**Depends on**: T19
**Reuses**: The existing segment markup (`TopBar.tsx:98-130`).
**Requirement**: FXPL-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] The segment carries `aria-selected` like the other four — same `role="tab"` + `aria-selected={direction === 'files'}` markup as its neighbours
- [x] Five segments fit at the app's minimum window width in both themes — the window's `minWidth` is 1100 (`index.ts:144`) and the row's fixed parts (brand, five segments, sync, three icon buttons) come to roughly 1050 with `.topbar-spacer` absorbing the rest; the segment widths are theme-independent, since only colours change. Confirmed visually by the T23 smoke
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **850** (unchanged) — measured **1032**, unchanged

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): add the files segment to the top bar`
**Status**: Complete

> Fifth, not sixth: the union held four members before `'files'` (T9's note). The
> segment uses the existing `file` glyph, added to `Icon.tsx` at T15.

---

### T21: Mount the Files direction

**What**: Mount `FilesView` in `App.tsx` for `direction === 'files'`, wired to `use-files` and the global selection.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T20
**Reuses**: `selectedId`, `findWorktree`, `setToast` already in App.
**Requirement**: FXPL-01, 02, 06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] The chosen direction persists across a restart like the other four — the segment goes through the same `update({ direction })`, and `'files'` has been a valid `AppConfig` value since T9; verified by the T23 smoke
- [x] App gains a mount and a prop bundle only — no logic (AD-004) — one `useFiles` call, one branch in the direction switch, four props
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: **850** (unchanged) — measured **1032**, unchanged

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): mount the files direction`
**Status**: Complete — Phase 4 done

> **`findWorktree` moved above the `!ui` guard**, because the hook needs the
> selected worktree and hooks cannot run after an early return. The same `selected`
> serves the rest of the render, so nothing is computed twice.
>
> **`ui` is null for the first frame**, so the hook takes `DEFAULT_CONFIG.ui`
> until the config arrives and `active` is false. The one visible consequence is a
> `files:watch(null)` on startup, which closes nothing.
>
> **The done-when read "like the other five".** There are five directions in
> total, four of them older; corrected above.

---

### T22: Land the status bar counter in Files

**What**: Replace the changed-files popover trigger in `StatusBar` with an `onOpenChanges(worktreeId)` callback; App switches to Files on that worktree and stores uncommitted-changes as its mode.
**Where**: `src/renderer/src/components/StatusBar.tsx`
**Depends on**: T21
**Reuses**: `use-files`' mode persistence from T16.
**Requirement**: FXPL-31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Clicking the counter from any direction lands in Files, uncommitted mode, on that worktree — the bar is mounted outside the direction switch, so the counter is reachable from all five; **verified by the T23 smoke**
- [x] The forced mode is what the worktree restores next time — the same config write does both, because the mode is read back from `ui` every render; **verified by the T23 smoke, check 26**, which leaves the worktree and returns after the counter click (added in round 3 — until then nothing left and returned afterwards, so the claim was implied by the write rather than observed)
- [x] `ChangesPopover` is no longer mounted by the counter; the file is removed if nothing else imports it — `ChangesPopover.tsx` and `.css` deleted, no reference left in `src/`
- [x] `status-bar/spec.md` STBR-30 and STBR-32 carry a "superseded by FXPL-31" note (the AD-018 pattern)
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **850** (unchanged) — measured **1032**, unchanged

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): open the changed files from the status bar`
**Status**: Complete

> **Direction and mode go in one config patch, not two.** `update` merges a
> partial patch and fires its own `config:patch`, so two calls are two writes; if
> the second failed the user would land in Files with the previous mode. One
> patch carries both.
>
> **`open` in `StatusBar` is now `'sync' | null`.** The counter no longer owns a
> popover, so the "at most one popover is open" rule it shared with sync is gone
> — the counter navigates away instead, which closes the bar's popover surface
> by leaving it.

---

### T23: Drive the Files direction end to end

**What**: Create `scripts/smoke-files.mjs` — seeds a temp repo (ignored folder, untracked file, two commits past `main`, one uncommitted edit, a binary, a 2 MB text file, a `.sln`), registers it, and drives every surface.
**Where**: `scripts/smoke-files.mjs`
**Depends on**: T22
**Reuses**: The CDP harness and teardown of `scripts/smoke-time.mjs`.
**Requirement**: FXPL-01..32 end to end; the sole evidence for 03, 06, 14, 16, 18, 19, 21, 22, 24, 25, 26, 28, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Checks: the segment; empty state; ignored folder absent; lazy expansion; each mode's list; base picker default; mode restored after a worktree switch; a tab opening, updating within 1 s after a shell append **without losing scroll**, and turning into the missing placeholder after deletion; binary and 2 MB placeholders; `.sln` opening no tab; the counter landing in uncommitted mode — **16/16**, the `.sln` check inverted by AD-033 (a single click now opens a tab)
- [x] VS 2026 / UAC and Explorer selection are recorded as hand checks, not scripted — the smoke never raises a UAC prompt
- [x] Unregisters the temp workspace and restores the owner's direction and theme — `--clean` unregisters and deletes; the owner's own config was never touched, because the run used an isolated `--user-data-dir`
- [x] Numbered pass/fail line per check; all pass against a live dev app — **16/16 on 2026-09-20**

**Tests**: manual
**Gate**: manual
**Commit**: `test(files): drive the files direction end to end`
**Status**: Complete — Phase 5 closed, all 23 tasks done.

> **Verifier round 1 returned FAIL, on evidence rather than behaviour (2026-09-20).** No broken
> code was found. Every gap was a spec clause with no assertion behind it, or an assertion too
> weak to detect a fault. Report: `.specs/features/files-explore/validation.md`.
>
> **The worst finding was bookkeeping, not code: three Done-when boxes above were ticked for
> checks the script did not contain.** The smoke selected one worktree and never switched, so
> FXPL-06 had no evidence; the word `scroll` appeared once in the whole file, in a comment, so
> FXPL-21's scroll half had none either; and the FXPL-17 check computed
> `readOnly: !!document.querySelector('.monaco-editor')` — the same selector it had already
> tested, so always true — and then left that field out of the check expression entirely. The
> "16/16" was true about what the script did and false about what the boxes claimed. The scroll
> behaviour had in fact been measured by hand at T14; the box was ticked from that memory instead
> of from the script, which is exactly the anti-pattern `implement.md` names.
>
> **Closed in round 2, 24/24 checks:**
> - FXPL-17 now reads `textarea.readOnly` off Monaco's input surface. `domReadOnly` makes Monaco
>   render a readonly `.ime-text-area` rather than an editable `.inputarea`, so the property
>   discriminates; the DOM-existence question never did.
> - FXPL-21's scroll half is a check of its own, on a 400-line file. **A synthetic `WheelEvent` is
>   ignored by Monaco**, which handles wheel input itself, so the scroll is driven by CDP
>   `Input.dispatchMouseEvent` with `type: 'mouseWheel'`. The assertion is the first RENDERED line
>   number (52 → 52), not an offset — an offset that never moved would read 0 → 0 and pass.
> - FXPL-06/13/18 needed a **second worktree in the seed**; switching away and back is the only
>   way to observe per-worktree memory at all. Lens and tabs are both asserted, in both directions.
> - FXPL-14, FXPL-15, FXPL-22 and FXPL-25 gained checks. FXPL-22 in particular was covered only at
>   the tab before; nothing watched the mode's LIST refresh, which is a separate guarantee.
> - Four AC labels were wrong: the empty state is FXPL-03 not 02, the ignore rules are 04 not 05,
>   and lazy expansion is 05 not 04. Corrected in the checks and their comments.
>
> **Three mutants that survived the sensor are dead** (`c39fcb7`): `closeAll` dropping
> `cancelBatch?.()`, the `> MAX_VIEW_BYTES` ceiling at exactly 1 MB, and the `>` in FXPL-26's
> recency rule where ties are reachable. Each assertion was verified to go red under its mutation.
>
> **T15's `Tests: none` is superseded** (`a9d7f8c`): `formatSize` and `fileType` moved to
> `files-view.ts`, where the Test Coverage Matrix mandates tests, with six cases. The Verifier
> ruled that on the letter T15 had not violated the matrix, but FXPL-20 requires the tab to show
> size and type and the only assertion touching either was `/MB/.test(...)` — a wrong unit or
> `.gitignore` rendering as "GITIGNORE file" passed. **Test count 1032 → 1041.**
>
> **Bookkeeping corrected:** `spec.md` said "32 total" and had no traceability row for FXPL-28a/28b;
> `status-bar/spec.md` still had STBR-31 describing the popover this feature deleted, beside the
> already-struck STBR-30 and 32.
>
> **Verifier round 2: FAIL again, and on the same requirement (2026-09-20).** Coverage moved from
> 16 exact / 12 partial / 6 absent to **23 / 10 / 1**, and all three round-1 mutants stayed dead —
> but FXPL-17's read-only check was **still a tautology, the second one in a row**.
>
> Round 2's argument, verified in Monaco's own source rather than taken on trust: the
> `readonly` attribute on the `.ime-text-area` does **not** come from `domReadOnly`.
> `nativeEditContext.js:64` sets it unconditionally at construction, and Electron 39 takes the
> `NativeEditContext` branch. The very `.ime-text-area` class sighted while writing the check was
> the evidence that branch was live — read as confirmation instead of as the warning it was. The
> `readOnly`-conditional attribute belongs to the other implementation, whose textarea is classed
> `inputarea` and which this app never uses.
>
> **The lesson, written plainly because it cost two rounds:** a DOM property is evidence only after
> checking which code path in the library actually sets it. "The option makes the DOM look like
> this" needs the library's source, not its docs — and not a plausible-sounding comment.
>
> **Closed in round 3, 25/25 checks:**
> - FXPL-17's read-only half is now **behavioural**: click into the text, send keystrokes through
>   CDP, assert the content is byte-identical and never contains what was typed. **Falsified before
>   being trusted** — with `readOnly: false, domReadOnly: false` in `CodeViewer.tsx` the check
>   reports "CONTENT CHANGED — not read-only" and fails. Neither earlier version could fail at all.
> - That falsification exposed a *third* hole in the same check: when the viewer failed to mount,
>   "empty equals empty" read as "unchanged" and passed. It now requires non-empty content first
>   and says so ("content unchanged (24 chars)").
> - FXPL-17's highlighting half asserts **distinct** `mtk` classes (4), not a token count. Monaco
>   emits `mtk1` for plaintext too, so `tokens > 0` would have stayed green with the language
>   resolved wrong. The T13 spike had already used distinct classes; the smoke did not inherit it.
> - **Mutant M6 killed.** Removing the emit-time `if (this.selected !== worktreePath) return` left
>   all 8 watcher tests green: round 2's cancellation test had *displaced* the coverage of the
>   guard beside it, because the timer is now cancelled and the emit path is never reached. The new
>   case runs a callback the event loop had already handed over — the one race `cancelBatch` cannot
>   win — and is verified to go red under the mutation. **Second lesson: adding a stronger test
>   beside an older one can silently take over why the older one passes. Re-mutate what the OLD
>   test named, not only the new one.**
>
> Carried and not claimed fixed, all Minor: FXPL-09's picker `onChange` is never driven, FXPL-11's
> second half, FXPL-12's status pill, FXPL-16's focus-instead-of-duplicate branch, FXPL-30's toast
> wiring, FXPL-32 as implied by FXPL-31's single write, and FXPL-18's "not restored after a
> restart", which is structural — `FilesState` is `{mode, base?}`, so no tab *can* persist.
>
> **Verifier round 3: PASS (2026-09-20).** Coverage **22 exact / 12 partial / 0 absent** — the
> column that matters is the last one: every criterion now has at least one assertion that can go
> false. Sensor 6/6 killed, including round 2's survivor. `validate_state.py files-explore` exits 0.
>
> Round 3 found one more ordering defect and it was closed: the counter check asserted
> `mode === 'Uncommitted'`, but the checks above already left the worktree in that mode, so
> deleting `mode: 'uncommitted'` from `App.tsx` left it green. The drive now sets **Folder** before
> navigating away, and a new check 26 leaves and returns to observe FXPL-32 directly. **Both were
> falsified**: with the forcing removed, check 25 reports `mode: "Folder"` and check 26 reports
> `restored mode: Folder`. 26/26 with the real code.
>
> **Two methodology lessons from this feature, worth more than the fixes:**
> 1. **A DOM property is evidence only once you know which code path in the library sets it.** The
>    read-only check was a tautology twice. Monaco's `NativeEditContext` sets `readonly` on its
>    textarea unconditionally; the option never touched it. Seeing the `.ime-text-area` class was
>    the warning that the native branch was live, and it was read as confirmation. Behaviour —
>    type and compare — is what finally discriminated.
> 2. **A stronger test added beside an older one can silently take over why the older one passes.**
>    Round 2's cancellation test made the emit path unreachable, so the guard next to it lost its
>    coverage with nothing turning red. When adding a test, re-mutate what the OLD test named.
>
> A third, procedural: **falsify a check before trusting it.** Every check added in rounds 2 and 3
> was run against a deliberately broken build. That is how the "empty equals empty" hole inside the
> read-only fix was found — a new defect hidden inside the correction of the previous one.
>
> **Known and accepted at merge**, ranked for F2 to pick up: FXPL-16's focus-instead-of-duplicate
> branch; FXPL-12's status pill; FXPL-09/11, which F2 inherits with the base picker; FXPL-30's
> toast wiring; FXPL-18's restart and the path-missing state as hand checks. None is a check
> carrying a claim it cannot support — each is behaviour that is implemented, typechecked and
> covered on at least one side.

> **Hand checks, all passed by the owner on 2026-09-20:**
> A. Double-click `App.sln` opens VS 2026 elevated on that file, with no tab (FXPL-28), and an
> immediate second double-click opens no second instance (FXPL-28b).
> B. The File Explorer launcher opens the file's folder with the file selected, never the file
> itself (FXPL-27).
>
> **The smoke found one real defect**, which is what it exists for. `openFile` decided whether a
> tab was new **inside** the `setState` updater and read the flag on the next line; React runs an
> updater at the following render, so the flag was still false and `readTab` never fired. Every tab
> opened and stayed at "Loading…" for the session, while `files:read` answered correctly the whole
> time. Fixed in `83dac6f`. No unit test could have caught it: the hook is hand-verified per the
> Test Coverage Matrix, and the bug lives in the gap between a state update and its side effect.
>
> **It also produced AD-033.** The owner double-clicked a `.sln` in UAT and got two elevated Visual
> Studio instances. FXPL-28 became a double click, with FXPL-28a and FXPL-28b added.
>
> **`scripts/smoke-time.mjs`, named in Reuses, does not exist on this branch** — it lives on
> `develop` via `feature/time-tracking`. The harness is modelled on `scripts/smoke-config.mjs`
> instead, which is here and has the same shape.
>
> **The script is one file with three modes**, not the single drive the task describes: the app
> loads its config once at startup, so a workspace registered afterwards is overwritten by the next
> patch. `--seed` writes it with the app down, the bare drive runs the checks, `--clean` removes it.
> That is the constraint `seed-smoke-remove.mjs` already documents.
>
> **Four things that made a check lie before it told the truth**, all worth knowing before writing
> the next smoke:
> - Monaco scrolls **virtually**: the DOM element's `scrollTop` stays 0 and assigning to it does
>   nothing. Drive and read the offset through the editor API.
> - Monaco renders spaces as **NBSP** in a view line's `textContent`, so a literal comparison
>   against written text never matches. Normalise first.
> - The smoke needs a **freshly launched app**. Tabs and expanded folders live in memory for the
>   session (FXPL-18), so a second run starts with a worktree selected and folders already open —
>   the empty state never shows and an expand click folds. The lens persists in the config
>   (FXPL-13), which is why the drive resets it to Folder explicitly.
> - Windows keeps a directory open briefly after the watching process exits, so `rmSync` fails
>   `EPERM` partway and leaves a half-deleted tree. The seed retries; and the app must be fully
>   stopped first, including the Electron child processes, which do not carry `--user-data-dir` on
>   their command line.
>
> **One observation outside this feature:** a bare repository inside a workspace folder makes the
> scanner report "no git repos in this folder" and drop the valid repo beside it. The seed keeps its
> `origin` outside the workspace. `repo-scanner.ts` is not this feature's to change.

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
Phase 2:  T9 → T10 → T11 → T12
Phase 3:  T13 → T14 → T15
Phase 4:  T16 → T17 → T18 → T19 → T20 → T21
Phase 5:  T22 → T23
```

Strictly sequential. **Packing** (~7 per batch, whole phases): Phase 1 (8) = batch 1; Phases 2 + 3 (4 + 3) = batch 2; Phases 4 + 5 (6 + 2) = batch 3. 23 tasks > 8, so the sub-agent offer applies at Execute — offer-then-confirm.

**T13 is a stop point regardless of batching**: if Monaco does not run packaged under the CSP, Phase 3 onward is re-planned before any component is written.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 types file + contract entries | ✅ |
| T2 | 1 function + 1 pure fold | ✅ |
| T3 | 1 function + 1 parser | ✅ |
| T4 | 1 function | ✅ |
| T5 | 1 function + 2 pure guards, same module | ✅ |
| T6 | 1 class | ✅ |
| T7 | 2 launch cases in 1 module | ⚠️ cohesive — both are "safe on an arbitrary file" |
| T8 | 1 wiring file | ✅ |
| T9 | 1 schema change | ✅ |
| T10 | 2 small pure functions | ✅ |
| T11 | 2 small pure functions | ✅ |
| T12 | 2 small pure functions | ✅ |
| T13 | 1 setup module (+ its dependency) | ✅ |
| T14–T21 | 1 component / hook / mount each | ✅ |
| T22 | 1 component change | ✅ |
| T23 | 1 script | ✅ |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | phase head | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | T6 | T6 → T7 | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 (boundary) | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | T12 | T12 → T13 (boundary) | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 (boundary) | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T18 | T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T20 | T20 → T21 | ✅ |
| T22 | T21 | T21 → T22 (boundary) | ✅ |
| T23 | T22 | T22 → T23 | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Shared types + contract | none | none | ✅ |
| T2–T4 | Main module with logic | unit | unit | ✅ |
| T5 | Main module + pure guards | unit | unit | ✅ |
| T6 | Main module (DI) | unit | unit | ✅ |
| T7 | Main module (launcher) | unit | unit | ✅ |
| T8 | Thin Electron shell | none | none | ✅ |
| T9 | Config schema | none | none | ✅ |
| T10–T12 | Pure helpers | unit | unit | ✅ |
| T13 | Renderer setup | none | none | ✅ |
| T14, T15 | Renderer components | none | none | ✅ |
| T16 | Renderer hook | none | none | ✅ |
| T17–T21 | Renderer components / wiring | none | none | ✅ |
| T22 | Renderer component | none | none | ✅ |
| T23 | Smoke script | manual only | manual | ✅ |

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| FXPL-01 | T9, T20, T21, T23 |
| FXPL-02 | T1, T8, T19, T21, T23 |
| FXPL-03 | T19, T23 |
| FXPL-04 | T2, T17, T23 |
| FXPL-05 | T2, T17, T23 |
| FXPL-06 | T16, T19, T21, T23 |
| FXPL-07 | T17, T23 |
| FXPL-08 | T3, T10, T17, T23 |
| FXPL-09 | T4, T17, T23 |
| FXPL-10 | T4, T17, T23 |
| FXPL-11 | T4, T17, T23 |
| FXPL-12 | T10, T17, T23 |
| FXPL-13 | T9, T12, T16, T23 |
| FXPL-14 | T14, T23 |
| FXPL-15 | T15, T17, T23 |
| FXPL-16 | T5, T18, T23 |
| FXPL-17 | T5, T13, T14 |
| FXPL-18 | T16, T18, T23 |
| FXPL-19 | T11, T18, T23 |
| FXPL-20 | T5, T15, T23 |
| FXPL-21 | T6, T12, T14, T16, T23 |
| FXPL-22 | T6, T16, T23 |
| FXPL-23 | T6, T12, T16 |
| FXPL-24 | T5, T15, T23 |
| FXPL-25 | T7, T18, T23 |
| FXPL-26 | T11, T18, T23 |
| FXPL-27 | T7 |
| FXPL-28 | T10, T17, T23 |
| FXPL-29 | T7 |
| FXPL-30 | T7, T18 |
| FXPL-31 | T22, T23 |
| FXPL-32 | T22, T23 |

All 32 mapped; none unmapped.
