# Status Changes Refresh Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: inline — no separate file. Main gains a `GitStateWatcher` (DI'd like `src/main/file-watcher.ts`, reusing its `WatchPort`, `Scheduler`, `WatchHandle` and `BATCH_MS`: a watch port, a git-dir resolver, a scheduler) that reconciles its set to each `tree:get` result and emits one `worktree:status` push per settled burst, carrying `{ worktreePath, dirty, changes }` from the existing `statusOf`. The renderer patches that into the tree through a pure helper. Turn end and focus live in the renderer: a pure helper finds the worktree a session's turn just ended in, and `use-tree` gains `recount(path)` over a new `worktrees:status` invoke.
**Status**: Approved 2026-09-26, with the reconciliation below (planned 2026-09-22)

**Branch**: `feature/status-changes-refresh`, rebased onto `origin/main` `c31bb9a` on 2026-09-26 (#97 merged as `951def7`). The PR closes #107 and depends on nothing.

**Reconciled with `main` (2026-09-26)**: the Files direction's `FileWatcher` (`src/main/file-watcher.ts`) and the real `watchPort` / `--git-dir` resolver in `src/main/index.ts` are on `main` now, so T3 imports the watcher seams instead of copying them and T5 shares the resolver. `FileWatcher` watches `index` and `HEAD` as **files**; T1 measures the file watch next to the directory watch, and a file watch that goes deaf after git's rename is recorded as a Files defect, not fixed here.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute; record the lint warning count at the same time.

**Stop point**: after T1, if any of commit, stage or checkout produces no `index`/`HEAD` event in the git dir, execution stops and the owner decides.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts; style sampled from `src/main/worktree-manager.test.ts` and `src/renderer/src/lib/session-attribution.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main watcher (`git-state-watcher.ts`) | unit (fakes) | 1:1 to SCRF-01, 02, 04, 05 and the quit edge case | `src/main/git-state-watcher.test.ts` | `npm test` |
| Worktree status (`worktree-manager.ts`) | unit (real git) | SCRF-06: a count, and the last-known fallback on a broken worktree; SCRF-11: counting leaves the index untouched | `src/main/worktree-manager.test.ts` | `npm test` |
| Renderer pure helpers (`tree-status.ts`) | unit | SCRF-03, 07, 08 and the removed-worktree and race edge cases | `src/renderer/src/lib/tree-status.test.ts` | `npm test` |
| IPC contract, main wiring, hooks, App | none (build + smoke) | — | — | `npx electron-vite build` |
| End to end | manual CDP smoke | SCRF-01, 07, 09, 10 in the running app, each seen failing on a broken build | `scripts/smoke-status-bar.mjs` | live dev app |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | Wiring tasks and phase ends | `npx electron-vite build` |
| Manual | T1, T10 | spike / `node scripts/smoke-status-bar.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: Measure

```
T1
```

### Phase 2: Main

```
T1 → T2 → T3 → T4 → T5
```

### Phase 3: Renderer

```
T5 → T6 → T7 → T8
```

### Phase 4: Prove

```
T8 → T9 → T10
```

---

## Task Breakdown

### T1: Measure what a terminal commit does to the git dir

**What**: In a scratch repository with a linked worktree, watch each git dir non-recursively with `fs.watch` and record which entry names fire for `git add`, `git commit` and `git checkout -b`, in the linked worktree and in the primary checkout; alongside, watch `index` and `HEAD` as files, as `FileWatcher` does, and record whether they still fire after the first rename; record the result and the baselines here.
**Where**: `.specs/features/status-changes-refresh/tasks.md`
**Depends on**: None
**Reuses**: nothing committed — a scratchpad probe
**Requirement**: SCRF-01 (decides)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each of the six operations shows an event naming `index` or `HEAD`, or execution stops
- [x] Baselines recorded: test count, lint warning count

**Measured (2026-09-26, git 2.55.0.windows.4, Node 24.19.0, win32)**:

| Checkout | Operation | Directory watch: `index` / `HEAD` | File watch `index` | File watch `HEAD` |
| -------- | --------- | --------------------------------- | ------------------ | ----------------- |
| primary | `git add` | `index` | 2 | 0 |
| primary | `git commit` | `index` | 2 | 0 |
| primary | `git checkout -b` | `index`, `HEAD` | 2 | 2 |
| linked | `git add` | `index` | 2 | 0 |
| linked | `git commit` | `index` | 2 | 0 |
| linked | `git checkout -b` | `index`, `HEAD` | 2 | 2 |

- A commit reaches the watcher through the rewritten `index`, as the spec assumed; `HEAD` fires only for a checkout. The other entries seen (`index.lock`, `HEAD.lock`, `COMMIT_EDITMSG`, `AUTO_MERGE.lock`, `packed-refs.lock`, `objects`) are filtered out by name.
- The same table held for a second round on the same watchers, so a **file** watch survives git's rename on Windows: `FileWatcher` has no defect here.
- No cross-talk: an operation in the linked worktree fires nothing named `index` or `HEAD` in the primary's git dir, and vice versa.
- **A plain `git status --porcelain` rewrites the index** (`index.lock` → `index`, 2 events) after a stat-only change, after a content edit, and even on a repeat with nothing new. With `git --no-optional-locks status --porcelain` it fires nothing. A recount run the plain way re-triggers the watcher that asked for it.
- `fs.watch` on a path spelled with 8.3 short names (`C:\Users\VINICI~1\…`) aborts the process in libuv (`Assertion failed: !_wcsnicmp(filename, dir, dirlen), src\win\fs-event.c:72`), which no `try` catches. Worktree paths come from `git worktree list` in long form, so the app is not exposed today; the probe needed `realpathSync.native`.

**Baselines**: 1663 tests in 90 files (`npx vitest run`); lint 0 errors, **18 warnings**.

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): measure how git commits reach a watched git dir`

---

### T2: `worktreeStatus` exported, failures reported

**What**: Export the counting behind `statusOf` as `worktreeStatus(path)`, which reports a failure as `null` instead of a clean zero, so a recount can keep the last count; `buildTree` keeps its clean-on-failure stance. Both `git status` calls in the file (`statusOf`/`worktreeStatus` and `changedFilesOf`) run as `git --no-optional-locks status --porcelain`, so counting never rewrites the index (T1).
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T1
**Reuses**: `statusOf`, the file's real-git test fixtures
**Requirement**: SCRF-06, SCRF-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Real-git tests: a count of mixed changes; `null` for a vanished path; after an edit, neither `worktreeStatus` nor `changedFilesOf` rewrites the index (its bytes and mtime unchanged)
- [x] Existing worktree-manager tests pass unedited
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + 4

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): count one worktree's changes on demand`

---

### T3: `GitStateWatcher`

**What**: A class that `sync(paths)` to a set of worktrees — opening a non-recursive watch on each resolvable git dir and closing the rest — batches `index`/`HEAD` events per worktree for 250 ms, then calls `onSettled(path)`; `closeAll()` closes everything.
**Where**: `src/main/git-state-watcher.ts` (new) and its test
**Depends on**: T2
**Reuses**: `WatchPort`, `WatchHandle`, `Scheduler` and `BATCH_MS` exported by `src/main/file-watcher.ts`
**Requirement**: SCRF-01, SCRF-02, SCRF-04, SCRF-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Fake-port tests: an `index` event settles once after 250 ms; three events in 250 ms settle once; an unrelated entry name never settles; `sync` adding a path opens it and dropping one closes it; a path whose git dir fails to resolve is skipped while the others open; a selection that moved on while resolving does not open; `closeAll` closes every handle
- [x] Gate check passes: `npm test`
- [x] Test count: T2 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): watch every worktree's git state`

---

### T4: The contract gains `worktrees:status` and `worktree:status`

**What**: Invoke `worktrees:status` (`{ worktreePath }` → `{ dirty, changes } | null`) and push event `worktree:status` (`{ worktreePath, dirty, changes }`).
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: T3
**Reuses**: `IpcContract`, `IpcEvents` (AD-004)
**Requirement**: SCRF-01, SCRF-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(ipc): add the single-worktree status channels`

---

### T5: Main wires the watcher

**What**: Create the watcher with the real `fs.watch` port and `git rev-parse --git-dir`; `sync` it with every `tree:get` result's worktree paths; on settle, run `worktreeStatus` and push `worktree:status` unless it returned `null` (logged); handle `worktrees:status`; `closeAll` on `window-all-closed`.
**Where**: `src/main/index.ts`
**Depends on**: T4
**Reuses**: `emit`, `handle`, the `window-all-closed` teardown, `watchPort` and the `--git-dir` resolver already built for `FileWatcher` (hoisted to one function both watchers use)
**Requirement**: SCRF-01, SCRF-04, SCRF-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Done**: the watchers close on `will-quit`, beside the Files watcher, rather than on `window-all-closed`; both fire on quit. A failed recount is logged once in `recountWorktree`, for pushes and for `worktrees:status` alike.

**Tests**: none
**Gate**: build

**Commit**: `feat(main): push a worktree's new status when its git state moves`

---

### T6: Pure tree helpers

**What**: `patchWorktreeStatus(tree, path, status)` returns a new tree with that worktree's `dirty`/`changes` replaced, or the same tree when the path is absent; `worktreeForTurnEnd(tree, before, after, cwd)` returns the worktree path to recount when activity went `working` → `waiting`/`exited`, else `null`.
**Where**: `src/renderer/src/lib/tree-status.ts` (new) and its test
**Depends on**: T5
**Reuses**: `worktreeIdForPath` (`tree-selection.ts`), not `deriveAttribution`
**Requirement**: SCRF-03, SCRF-07, SCRF-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a patch yields a new identity even with an equal count (SCRF-03); an absent path returns the same tree (removed-worktree edge case); each transition into and out of `working` (only `working` → `waiting`/`exited` recounts); a `cwd` in a subfolder resolves to its worktree; a `cwd` outside every worktree yields `null`
- [x] Gate check passes: `npm test`
- [x] Test count: T3 count + the new tests

**Done**: `deriveAttribution` matches a `cwd` only when it equals a worktree path, so it cannot satisfy the subfolder criterion. `worktreeIdForPath` is the existing containment join (longest prefix, case and slash normalised); for a `cwd` equal to a worktree path both agree, and one outside every worktree is `null` in both. 1678 → 1687 tests.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(renderer): patch one worktree's status into the tree`

---

### T7: `use-tree` applies pushes and recounts on demand

**What**: Subscribe to `worktree:status` and patch it in; add `recount(path)` that invokes `worktrees:status` and patches a non-null result.
**Where**: `src/renderer/src/lib/use-tree.ts`
**Depends on**: T6
**Reuses**: T6's `patchWorktreeStatus`, `api.on`
**Requirement**: SCRF-01, SCRF-03, SCRF-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(renderer): keep the tree current from git state pushes`

---

### T8: App recounts on turn end and rebuilds on focus

**What**: On each `session:activity` push, recount the worktree `worktreeForTurnEnd` names; the focus handler calls `refreshTree` beside `refreshTasks`, under the same 5 s debounce.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T7
**Reuses**: the existing focus effect; `use-sessions`' activity subscription point
**Requirement**: SCRF-07, SCRF-08, SCRF-09, SCRF-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `feat(renderer): recount changes when a turn ends or the app regains focus`

---

### T9: Smoke — a terminal commit and a focus

**What**: Extend `smoke-status-bar.mjs`: in its temp workspace, commit two files with `git` from the script and require the bar's counter to drop within 2 s with no click; edit a file, fire a window blur/focus through CDP and require the counter to rise; fire a second focus within 5 s after another edit and require no rebuild.
**Where**: `scripts/smoke-status-bar.mjs`
**Depends on**: T8
**Reuses**: the script's temp fixture, restore-in-`finally` and `check` helper
**Requirement**: SCRF-01, SCRF-09, SCRF-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each new check seen **failing** with its trigger disabled (watcher `sync` skipped; focus `refreshTree` removed), then passing
- [ ] The owner's workspace list, direction and theme restored (existing `finally`)
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(status-bar): check the counter follows commits and focus`

---

### T10: Smoke — a turn end

**What**: Extend the same smoke: create a file in the temp worktree, then move an ad-hoc session there from `working` to `waiting` through the app's hook endpoint as `smoke-activity.mjs` does, and require the counter to rise; if an ad-hoc session cannot carry the hook token, record SCRF-07 as hand-verified with a registry session and why.
**Where**: `scripts/smoke-status-bar.mjs`
**Depends on**: T9
**Reuses**: `smoke-activity.mjs`'s hook-settings read and tokened POST
**Requirement**: SCRF-07, SCRF-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The check seen failing with T8's turn-end recount removed, then passing — or the hand-verification recorded
- [ ] No input ever sent to a registry-agent session
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(status-bar): check the counter follows an agent's turn`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T1 ------→ T2 ------→ T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6 ------→ T7 ------→ T8
Phase 4:  T8 ------→ T9 ------→ T10
```

Ten tasks: two batches (Phases 1–2, Phases 3–4). At Execute the sub-agent offer is made first.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: measure | 1 measurement | ✅ Granular |
| T2: `worktreeStatus` | 1 function | ✅ Granular |
| T3: `GitStateWatcher` | 1 class + its test | ✅ Granular |
| T4: contract | 2 channel entries in 1 file | ⚠️ Cohesive |
| T5: main wiring | 1 file | ✅ Granular |
| T6: tree helpers | 2 pure functions in 1 file | ⚠️ Cohesive |
| T7: `use-tree` | 1 hook | ✅ Granular |
| T8: App | 2 triggers in 1 file | ⚠️ Cohesive |
| T9: smoke commit + focus | 1 smoke section | ✅ Granular |
| T10: smoke turn end | 1 smoke section | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: measure | spec docs | none | none | ✅ OK |
| T2: `worktreeStatus` | worktree status | unit | unit | ✅ OK |
| T3: watcher | main watcher | unit | unit | ✅ OK |
| T4: contract | IPC contract | none | none | ✅ OK |
| T5: main wiring | main wiring | none | none | ✅ OK |
| T6: tree helpers | renderer pure helpers | unit | unit | ✅ OK |
| T7: `use-tree` | hooks | none | none | ✅ OK |
| T8: App | App | none | none | ✅ OK |
| T9: smoke | end to end | manual | manual | ✅ OK |
| T10: smoke | end to end | manual | manual | ✅ OK |
