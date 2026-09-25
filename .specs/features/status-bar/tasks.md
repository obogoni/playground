# Status Bar Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/status-bar/design.md`
**Status**: Draft

**Branch**: `feature/status-bar`, to be cut from `origin/main` (design D1–D4; verified that every file this feature touches exists there).

**Test baseline**: **748** on `origin/main` — the figure `.specs/STATE.md` records for two independent branches cut from `fa78f78`. **Re-measure with `npm test` as the first act of Execute**; every expected count below is `748 + N` and must be re-anchored if the measured baseline differs.

**Baseline measured 2026-09-19** with `npx vitest run` on `origin/main` `6ecd19c`, after the upstream merged #88: **917 tests / 52 files**, all passing. The 748 the plans started from was recorded before #88 and is stale by **+169**. Every expected count below is written against 748 — **add 169** to each. This feature therefore ends at **966**, not 797. Still re-measure as the first act of Execute.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts, `.specs/codebase/CONVENTIONS.md`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process modules with logic (`git-sync.ts`) | unit | All branches; 1:1 to the ACs the module owns; every listed edge case that is reachable without a network | `src/main/<module>.test.ts` | `npm test` |
| Extracted pure helpers (`gitFailureLine`, `isTimeout`, `parseAheadBehind`, `parseCommitLines`, `status-bar.ts`, `relative-time.ts`) | unit | Input→output per AC, including the failure shapes | co-located `*.test.ts` | `npm test` |
| Shared types + IPC contract (`src/shared/git.ts`, `ipc-contract.ts`) | none | build gate only (typecheck is the check) | — | `npm run typecheck` |
| Thin Electron shell (`index.ts` handler wiring) | none (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Renderer React components and hooks (`StatusBar`, popovers, `use-git-sync`) | none (CDP smoke + visual) | — | — | `node scripts/smoke-status-bar.mjs` |
| Out-of-CI smoke scripts | manual only | Every AC not reachable by unit tests | `scripts/smoke-*.mjs` | `node scripts/smoke-status-bar.mjs` (live session) |

**Provenance note:** `TESTING.md` states the governing principle verbatim — *extract pure/decision logic into a testable seam, unit-test that seam, and hand-verify the thin OS/Electron shell around it* — and lists renderer components as deliberately not unit-tested. The strong default is therefore **not** applied to the renderer layer; it is applied in full to `git-sync.ts` and every pure helper. Real-git suites use pattern 2 (`mkdtempSync` + `rmSync`), and lesson **L-005** applies: `vitest.config.ts` already carries the 30 s `testTimeout`/`hookTimeout` those suites needed.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a logic-bearing task, a typed-contract change, or any renderer task | `npm run typecheck && npm run lint && npm test` |
| Build | At each phase boundary | `npx electron-vite build` |
| Manual | The CDP smoke | `npm run dev -- -- --remote-debugging-port=9222`, then `node scripts/smoke-status-bar.mjs` |

**Lint is judged by exit code AND by warning count.** The last feature added a prettier warning invisible at exit 0 (`.specs/STATE.md`, terminal-scroll-paste). Record the count at T1 and diff it at every gate.

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Git foundation in main

No UI. Ends with three working channels an app could call.

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 2: Renderer decision seams

Every rule the bar renders, as pure functions with tests — before any component exists.

```
T6 → T7 → T8 → T9 → T10 → T11
```

### Phase 3: The bar itself

```
T11 → T12 → T13 → T14 → T15 → T16 → T17
```

### Phase 4: End-to-end verification

```
T17 → T18
```

---

## Task Breakdown

### T1: Extract the git invoker into its own module

**What**: Move `git()` and `gitFailureLine()` out of `worktree-manager.ts` into a new `src/main/git.ts`, add an optional `timeoutMs` (mapped to `execFile`'s `timeout`) and an `isTimeout(err)` predicate; `worktree-manager.ts` changes by import only.
**Where**: `src/main/git.ts`
**Depends on**: None
**Reuses**: The exact bodies at `worktree-manager.ts:522` and `:365` — a behaviour-preserving move, so the ~40 real-git tests stay byte-unmodified.
**Requirement**: STBR-27 (and the kill half of STBR-24)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `git()` keeps `shell:false`, `windowsHide`, `GIT_TERMINAL_PROMPT=0` and gains `opts.timeoutMs`
- [x] `isTimeout` returns true for an `execFile` timeout error (`killed === true`) and false for a plain non-zero exit
- [x] `worktree-manager.ts` imports both and defines neither; its test file is unmodified
- [x] `src/main/git.test.ts` covers `gitFailureLine` (first non-empty stderr line, `Error` fallback, non-Error fallback) and `isTimeout` (timeout, plain failure, non-error value)
- [x] Baseline lint warning count recorded in the commit body
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 748 + 6 = **754** (no deletions)

> **Fix iteration 1 (2026-09-19)**, after the verifier's FAIL: `git.test.ts` gained two real-git tests for STBR-27. A `!` alias echoes `GIT_TERMINAL_PROMPT` as git received it (`0`, although the parent env says `1`), and an argument full of shell metacharacters comes back from `rev-parse --sq-quote` untouched. They kill mutant M18 (the env var dropped), and a `shell: true` mutant too. Commit `10998b9`; 976 → 978 tests.

**Tests**: unit
**Gate**: full
**Commit**: `refactor(main): extract the git invoker into its own module`

---

### T2: Declare the sync types and the three channels

**What**: Add `src/shared/git.ts` with `SyncState`, `GitOp`, `CommitLine`, `CommitLists`, `GitOpResult` exactly as the design's Data Models section defines them, and register `git:sync-state`, `git:commits` and `git:run` in `IpcContract`.
**Where**: `src/shared/git.ts`
**Depends on**: T1
**Reuses**: The `IpcContract` shape and its per-channel doc-comment convention (`ipc-contract.ts:31`).
**Requirement**: STBR-09, 15, 17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Every field carries the doc comment naming the AC it serves, per the file's convention
- [x] `ipc-contract.ts` imports the types and declares the three request/response channels
- [x] No renderer or main code imports them yet — this task adds types only
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **754** (unchanged — types carry no tests per the matrix)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): declare the git sync contract`

---

### T3: Read a worktree's sync state

**What**: Create `src/main/git-sync.ts` with `readSyncState(worktreePath)` — branch, detached sha, upstream, ahead/behind, remotes, `FETCH_HEAD` mtime — plus the pure `parseAheadBehind(stdout)`.
**Where**: `src/main/git-sync.ts`
**Depends on**: T2
**Reuses**: `git.ts` from T1; the `mkdtempSync`/`rmSync` real-git test pattern from `worktree-manager.test.ts`.
**Requirement**: STBR-09, 12, 13, 14, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `parseAheadBehind` reads git's `behind<TAB>ahead` order for `@{upstream}...HEAD`
- [x] A missing upstream is detected from `rev-list` **failing** (`fatal: no upstream configured`), not from a zero result, and yields `upstream: null` with no `error`
- [x] `FETCH_HEAD` is stat'd under `resolve(worktreePath, <git rev-parse --git-common-dir>)` — verified against a primary checkout, where git returns the **relative** `.git`
- [x] A repo that never fetched yields `lastFetchAt: null`; a detached HEAD yields `branch: null` + `detachedSha`
- [x] Any other git failure yields `error: gitFailureLine(err)` and never throws
- [x] `src/main/git-sync.test.ts` covers all six outcomes against a temp repo + bare remote
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 754 + 8 = **762**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): read a worktree's sync state`

---

### T4: List the commits each direction would move

**What**: Add `readCommits(worktreePath, limit = 20)` to `git-sync.ts` and the pure `parseCommitLines(stdout)`, returning both lists plus the `+N more` counts.
**Where**: `src/main/git-sync.ts`
**Depends on**: T3
**Reuses**: `git()` with the `%h%x1f%s%x1f%ct` format; `parseChangedFiles`'s posture of one pure parser beside one shell call.
**Requirement**: STBR-15, 16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `parseCommitLines` handles an empty stdout, a subject containing the field separator's neighbours, and a CRLF-terminated stream
- [x] Both ranges are correct: outgoing `@{upstream}..HEAD`, incoming `HEAD..@{upstream}`
- [x] `moreIncoming` / `moreOutgoing` come from `rev-list --count`, so they are exact beyond the 20 returned
- [x] No upstream yields two empty lists and zero counts, without an error
- [x] Tests cover the four cases above against a temp repo + bare remote
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 762 + 5 = **767**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): list the commits a sync would move`

---

### T5: Run the git operations

**What**: Add `runGitOp(worktreePath, op, remote?)` to `git-sync.ts` — `sync` (`pull --ff-only` then `push`, aborting the push if the pull failed), `pull`, `push`, `fetch <remote> <branch>`, `publish` (`push -u <remote> <branch>`) — each with `timeoutMs: 120_000`, plus the one-operation-per-worktree guard.
**Where**: `src/main/git-sync.ts`
**Depends on**: T4
**Reuses**: `git()`'s `timeoutMs` and `isTimeout` from T1; `gitFailureLine` for every failure.
**Requirement**: STBR-17, 18, 19, 20, 21, 24, 28

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] A diverged branch makes `sync` and `pull` fail with git's own first line and **leaves the worktree unchanged** (asserted on the worktree's HEAD, not only on the returned string)
- [x] `sync` does not push when the pull failed
- [x] `publish` runs `push -u` and the branch has an upstream afterwards
- [x] `fetch` targets only the current branch's upstream remote and branch
- [x] A second `runGitOp` for a path already running resolves `{ ok:false, busy:true }` and spawns no git
- [x] A timeout maps to `{ ok:false, timedOut:true }` via `isTimeout`
- [x] Tests cover all six against a temp repo + bare remote
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 767 + 8 = **775**

> **Fix iteration 1 (2026-09-19)**: `OP_TIMEOUT_MS` is exported and pinned to the literal `120_000`, and a spy on `git()` proves that `runGitOp` passes it when no `timeoutMs` is given (STBR-24). This kills mutant M17 and a mutant whose default ignores the constant. Commit `3ebe6b3`; 975 → 976 tests.

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): run the status bar's git operations`

---

### T6: Serve the three channels

**What**: Register `git:sync-state`, `git:commits` and `git:run` in `index.ts` with the typed `handle()` wrapper, delegating to `git-sync.ts`.
**Where**: `src/main/index.ts`
**Depends on**: T5
**Reuses**: `handle()` (`ipc.ts:18`) and the registration style of `handle('worktrees:changes', …)` (`index.ts:271`).
**Requirement**: STBR-09, 15, 17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Three handlers registered, each a one-line delegation with no logic of its own
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: **775** (unchanged — thin wiring is hand-verified per the matrix)

**Tests**: none
**Gate**: build
**Commit**: `feat(main): serve the git sync channels`

---

### T7: Decide what the bar describes

**What**: Create `src/renderer/src/lib/status-bar.ts` with `barTargetFor({ direction, tree, selectedId, sessions, selectedSessionId })`, returning a worktree target, a session's worktree target, a bare-folder target, or none.
**Where**: `src/renderer/src/lib/status-bar.ts`
**Depends on**: T6
**Reuses**: `findWorktree` (`App.tsx:283`) and the normalized-path comparison in `session-attribution.ts`.
**Requirement**: STBR-02, 03, 04, 05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] In Agents with a session selected, the target is that session's worktree — **not** the tree selection
- [x] A session whose cwd is not inside any worktree returns the folder target carrying the path
- [x] The other four directions return the tree-selected worktree
- [x] No selection anywhere returns the none target
- [x] `status-bar.test.ts` covers those four plus a session id that no longer exists
- [x] Gate passes: `npm test`
- [x] Test count: 775 + 6 = **781**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide which worktree the status bar describes`

---

### T8: Split a branch name for middle truncation

**What**: Add `splitBranch(branch)` to `status-bar.ts`, returning the head and the non-shrinking tail (the last `/`-delimited segment, capped) that the CSS renders as two spans.
**Where**: `src/renderer/src/lib/status-bar.ts`
**Depends on**: T7
**Reuses**: Nothing — new pure logic.
**Requirement**: STBR-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `user/dev/4821-fix-login/12345-endpoint` splits so the tail is the final segment
- [x] A branch with no `/` returns the whole name as head and an empty tail
- [x] A single segment longer than the cap is still returned whole (the CSS, not this function, decides where the ellipsis falls)
- [x] `(detached abc1234)` passes through untouched
- [x] Gate passes: `npm test`
- [x] Test count: 781 + 5 = **786**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): split a branch name for middle truncation`

> **Changed 2026-09-19 (owner request, after the Verifier PASS):** `splitBranch` now splits the name in half, the head taking the odd character, and each half is capped at half the branch element (head clipped at its end with the ellipsis, tail at its start). The last-segment tail above left the head far wider than the tail. The owner then raised the branch element's cap from 50% to 70% of the bar (the font stays 11 px).

---

### T9: Decide what the sync section renders

**What**: Add `syncSectionFor(state)` to `status-bar.ts` — one discriminated union over `counts` / `no-upstream` / `detached` / `no-remote` / `error`.
**Where**: `src/renderer/src/lib/status-bar.ts`
**Depends on**: T8
**Reuses**: `SyncState` from T2.
**Requirement**: STBR-09, 12, 13, 14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `error` wins over every other case, so a failing repo never shows stale counts
- [x] `detached` outranks `no-upstream` (a detached HEAD has no branch to have an upstream)
- [x] `no-remote` is returned only when `remotes` is empty; `no-upstream` only when there is at least one remote
- [x] `counts` carries both numbers, including the `0 / 0` in-sync case
- [x] Tests cover all five outcomes plus the two precedence rules
- [x] Gate passes: `npm test`
- [x] Test count: 786 + 6 = **792**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide what the sync section renders`

---

### T10: Teach relative time about days

**What**: Add a day tier to `relativeTime` so a fetch from three days ago reads `3d ago` instead of `72h ago`.
**Where**: `src/renderer/src/lib/relative-time.ts`
**Depends on**: T9
**Reuses**: The existing function and its tests, which must keep passing unmodified.
**Requirement**: STBR-22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Under 24 h is unchanged (`just now`, `Nm ago`, `Nh ago`) and every pre-existing test passes unedited
- [x] 24 h and beyond reads `Nd ago`
- [x] Two tests added: the 24 h boundary and a multi-day value
- [x] Gate passes: `npm test`
- [x] Test count: 792 + 2 = **794**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): teach relative time about days`

---

### T11: Label the fetch age

**What**: Add `fetchAgeLabel(lastFetchAt, nowMs)` to `status-bar.ts` — `never` when null, otherwise `relativeTime`.
**Where**: `src/renderer/src/lib/status-bar.ts`
**Depends on**: T10
**Reuses**: `relativeTime` as extended by T10.
**Requirement**: STBR-22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `null` yields `never` — the repo that has never fetched is not the same as one fetched long ago
- [x] A timestamp yields the `relativeTime` string
- [x] A timestamp in the future yields `just now` rather than a negative
- [x] Gate passes: `npm test`
- [x] Test count: 794 + 3 = **797**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): label how stale the fetch is`

---

### T12: Own the bar's state in a hook

**What**: Create `src/renderer/src/lib/use-git-sync.ts` — sync state for the current target, refetched when the target path or the tree changes; an ops map keyed by worktree path so a running operation outlives the selection; post-success refetch plus tree refresh; toast when the popover that started the operation is gone.
**Where**: `src/renderer/src/lib/use-git-sync.ts`
**Depends on**: T11
**Reuses**: The hook shape of `use-tree.ts` / `use-sessions.ts` (AD-004); `api.invoke`; `refreshTree`.
**Requirement**: STBR-11, 23, 25, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] The ops map is keyed by path, never by "current selection"
- [x] A successful operation refetches `git:sync-state` and calls `onRefreshTree`
- [x] An operation finishing while its popover is closed calls `onToast`; finishing with it open does not
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **797** (unchanged — renderer hooks are hand-verified per the matrix)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): own the status bar's sync state`

---

### T13: Render the bar

**What**: Create the `StatusBar` component — repo name, the two branch spans, the sync section, the changed-file counter — with its stylesheet, including the bar-height CSS variable T17 needs.
**Where**: `src/renderer/src/components/StatusBar.tsx`
**Depends on**: T12
**Reuses**: `barTargetFor` / `splitBranch` / `syncSectionFor` from Phase 2; `WorktreeNode.changes` straight from the tree snapshot — **no call for the counter**.
**Requirement**: STBR-01, 02, 05, 06, 07, 08, 29, 31

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `StatusBar.css` created, exposing the bar height as a CSS custom property
- [x] The head span carries `max-width:50%` + `text-overflow:ellipsis`; the tail span does not shrink (SPEC_DEVIATION in `StatusBar.css`: the 50% cap sits on the branch element holding head + tail, so the whole name stays within half the bar; the head carries the ellipsis)
- [x] The branch element's `title` is the untruncated name
- [x] The counter reads `WorktreeNode.changes`, and `0` renders as `0`
- [x] The region carries `role="status"`
- [x] Light and dark both pass a visual check — done in the T18 live smoke (2026-09-19); it caught a flex gap splitting the branch name, fixed in `36ed0fb`
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **797** (unchanged — renderer component)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render the status bar`

---

### T14: Render the sync popover

**What**: Create the `SyncPopover` component — Sync / Pull / Push / Fetch, or Publish with a remote picker when there is more than one remote; the fetch-age line; both commit lists with their `+N more`; the busy state; the inline error line.
**Where**: `src/renderer/src/components/SyncPopover.tsx`
**Depends on**: T13
**Reuses**: The `sidebar-ctx-menu` floating pattern — positioned div, dismissed by any click or Escape (`Sidebar.tsx:56-72,139`).
**Requirement**: STBR-15, 16, 18, 19, 20, 21, 23, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Publish is disabled until a remote is chosen when `remotes.length > 1`
- [x] The error line persists — the popover does not close on failure
- [x] Buttons are disabled with an activity indicator while that path's operation runs
- [x] A timeout renders as a timeout, naming the terminal as the way out
- [x] Escape and an outside click close it; opening it closes the changes popover
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **797** (unchanged — renderer component)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render the sync popover`

---

### T15: Render the changes popover

**What**: Create the `ChangesPopover` component — one row per `ChangedFile` with its status, an empty state when there are none, and no per-file action.
**Where**: `src/renderer/src/components/ChangesPopover.tsx`
**Depends on**: T14
**Reuses**: `worktrees:changes`; the status-label vocabulary the force-remove dialog already renders.
**Requirement**: STBR-30, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] All five `ChangeStatus` values render, not three
- [x] `worktrees:changes` is called when the popover opens, never on every render
- [x] No row is clickable and no row carries an action button — the next feature owns that
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **797** (unchanged — renderer component)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render the changed-files popover`

---

### T16: Mount the bar

**What**: Mount `<StatusBar/>` in `App.tsx` after `</main>`, threading `tree`, `selectedId`, `selectedSessionId`, `sessions`, `direction`, `onToast` and `refreshTree`.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T15
**Reuses**: State already in `App.tsx` (`:70`, `:105`, `:113`, `:283`) — no new state in the component.
**Requirement**: STBR-01, 03, 05, 25, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] The bar renders in all five directions, including with nothing selected
- [x] `App.tsx` gains a mount and a prop bundle — no logic (AD-004)
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **797** (unchanged — renderer wiring)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): mount the status bar`

---

### T17: Lift the toast above the bar

**What**: Offset the toast's `bottom` by the bar height variable, so the bottom-center toast no longer lands on top of the new bar.
**Where**: `src/renderer/src/components/Toast.css`
**Depends on**: T16
**Reuses**: The bar-height custom property created in T13.
**Requirement**: none directly — it protects STBR-26, whose own outcome is delivered by toast

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] A toast raised while the bar is visible clears it in both themes — done in the T18 live smoke (2026-09-19)
- [x] No other toast call site changes
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: **797** (unchanged — stylesheet)

**Tests**: none
**Gate**: build
**Commit**: `fix(renderer): lift the toast above the status bar`

---

### T18: Drive the bar end to end

**What**: Create `scripts/smoke-status-bar.mjs` — a CDP smoke that seeds a temp repo with a bare remote, registers it as a workspace, and drives the bar and both popovers through every state the unit tests cannot reach.
**Where**: `scripts/smoke-status-bar.mjs`
**Depends on**: T17
**Reuses**: The CDP harness of `scripts/smoke-time.mjs` (target discovery, evaluate helpers, restore-the-owner's-state teardown).
**Requirement**: STBR-01..32 end to end; the sole evidence for 03, 04, 06, 07, 20, 23, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Seeds its own temp repo + bare remote and **never touches a real remote**
- [x] Checks: the bar in all five directions (four on this branch — Hours is not merged); the Agents session target; the non-worktree folder state; a long branch truncated with the full name in `title`; `↓n ↑n` after a remote commit; the sync popover's lists; Sync moving both ways; a diverged branch refusing with git's line; Publish requiring a remote choice; the changes popover's five statuses; the toast clearing the bar
- [x] Unregisters the temp workspace and restores the owner's direction and theme on the way out
- [x] The script prints a numbered pass/fail line per check, like the existing smokes
- [x] Run against a live dev app: all checks pass — 36/36 on 2026-09-19, after the fixes `0c73b2e` (fetch age in linked worktrees), `ede6df8` (session in a worktree subfolder) and `36ed0fb` (branch gap) that its first run exposed. Harness taken from `smoke-activity.mjs`: `smoke-time.mjs` does not exist on this branch

> **Fix iteration 1 (2026-09-19)**: the smoke went from 36 to 46 checks, all passing against the live dev app (commit `4dc1131`). Fixture additions: a detached worktree; a worktree whose upstream ref is deleted on the remote and locally; one 23 commits behind; and a sleeping `pre-push` hook in the common dir for a slow Push. New checks: STBR-23 (every button disabled and the loader visible while the Push runs, re-enabled after; kills M19, confirmed by running the smoke against the mutant); STBR-26 through a selection change mid-Push (the bar follows, the push completes, and a toast reports it); STBR-16 (20 rows with relative ages and `+3 more`); STBR-31 (`0` and `No changes.`); STBR-32 (no control and no React click handler in the rows); STBR-08/13 (the detached label, a plain-text `detached HEAD` that opens nothing); and STBR-14 (git's `fatal:` line beside a still-rendered repo, branch and counter). A check for a worktree whose folder was deleted was tried and left out, because it exposed a stale-read race in `use-git-sync.ts` (see the edge case in spec.md).

**Tests**: manual
**Gate**: manual
**Commit**: `test(status-bar): drive the bar end to end`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 --→ T2 --→ T3 --→ T4 --→ T5 --→ T6
Phase 2:  T7 --→ T8 --→ T9 --→ T10 --→ T11
Phase 3:  T12 --→ T13 --→ T14 --→ T15 --→ T16 --→ T17
Phase 4:  T18
```

Execution is strictly sequential — there is no intra-phase parallelism.

**Packing** (~7 tasks per batch, whole phases only): Phase 1 (6) = batch 1; Phase 2 (5) = batch 2; Phase 3 (6) = batch 3; Phase 4 (1) = batch 4. 18 tasks > 8, so the sub-agent offer applies at Execute — offer-then-confirm, never auto-spawn.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 module (move + 2 helpers) | ✅ Granular |
| T2 | 1 types file + its contract entries | ✅ Granular |
| T3 | 1 function + 1 parser, same module | ✅ Granular |
| T4 | 1 function + 1 parser, same module | ✅ Granular |
| T5 | 1 function | ✅ Granular |
| T6 | 3 one-line handlers, 1 file | ✅ Granular |
| T7 | 1 function | ✅ Granular |
| T8 | 1 function | ✅ Granular |
| T9 | 1 function | ✅ Granular |
| T10 | 1 function (extend) | ✅ Granular |
| T11 | 1 function | ✅ Granular |
| T12 | 1 hook | ✅ Granular |
| T13 | 1 component | ✅ Granular |
| T14 | 1 component | ✅ Granular |
| T15 | 1 component | ✅ Granular |
| T16 | 1 mount in 1 file | ✅ Granular |
| T17 | 1 stylesheet rule | ✅ Granular |
| T18 | 1 script | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | (phase head) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 (phase boundary) | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 (phase boundary) | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 (phase boundary) | ✅ Match |

No dependency points at a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Extracted pure helpers | unit | unit | ✅ OK |
| T2 | Shared types + IPC contract | none | none | ✅ OK |
| T3 | Main module with logic | unit | unit | ✅ OK |
| T4 | Main module with logic | unit | unit | ✅ OK |
| T5 | Main module with logic | unit | unit | ✅ OK |
| T6 | Thin Electron shell | none | none | ✅ OK |
| T7 | Extracted pure helper | unit | unit | ✅ OK |
| T8 | Extracted pure helper | unit | unit | ✅ OK |
| T9 | Extracted pure helper | unit | unit | ✅ OK |
| T10 | Extracted pure helper | unit | unit | ✅ OK |
| T11 | Extracted pure helper | unit | unit | ✅ OK |
| T12 | Renderer hook | none | none | ✅ OK |
| T13 | Renderer component | none | none | ✅ OK |
| T14 | Renderer component | none | none | ✅ OK |
| T15 | Renderer component | none | none | ✅ OK |
| T16 | Renderer wiring | none | none | ✅ OK |
| T17 | Renderer stylesheet | none | none | ✅ OK |
| T18 | Out-of-CI smoke script | manual only | manual | ✅ OK |

Every `Tests: none` is backed by the matrix, never by "tested in another task".

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| STBR-01 | T13, T16, T18 |
| STBR-02 | T7, T13, T18 |
| STBR-03 | T7, T16, T18 |
| STBR-04 | T7, T18 |
| STBR-05 | T7, T13, T16, T18 |
| STBR-06 | T8, T13, T18 |
| STBR-07 | T13, T18 |
| STBR-08 | T3, T13, T18 |
| STBR-09 | T3, T9, T18 |
| STBR-10 | T3, T12 (no call is a network call), T18 |
| STBR-11 | T12, T18 |
| STBR-12 | T3, T9, T18 |
| STBR-13 | T3, T9, T18 |
| STBR-14 | T3, T9, T18 |
| STBR-15 | T4, T14, T18 |
| STBR-16 | T4, T14, T18 |
| STBR-17 | T5, T18 |
| STBR-18 | T5, T14, T18 |
| STBR-19 | T5, T14, T18 |
| STBR-20 | T5, T14, T18 |
| STBR-21 | T5, T18 |
| STBR-22 | T3, T10, T11, T14, T18 |
| STBR-23 | T12, T14, T18 |
| STBR-24 | T1, T5, T14, T18 |
| STBR-25 | T12, T18 |
| STBR-26 | T12, T17, T18 |
| STBR-27 | T1, T18 |
| STBR-28 | T5, T18 |
| STBR-29 | T13, T18 |
| STBR-30 | T15, T18 |
| STBR-31 | T13, T15, T18 |
| STBR-32 | T15, T18 |

All 32 mapped; none unmapped.
