# Time Tracking Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/time-tracking/design.md`
**Status**: Executing (approved 2026-09-16)
**Branch**: `feature/time-tracking` (cut from `origin/main`)
**Test baseline**: measured green on the branch before T1 (call it **B**). Every "Test count" below is written as `B + N`, cumulative.
**Before T17**: record AD-021 (design §Proposed project decisions) in `.specs/STATE.md` — it amends RAIL-12, which T17 would otherwise violate.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts` (`src/**/*.test.ts`), AD-003 (coverage report-only), confirmed lessons L-001 and L-005.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure logic (`src/shared/time-intervals.ts`, `src/main/time-snapshot.ts` `buildSnapshot`, `src/renderer/src/lib/{time-format,time-totals,hours-report,hours-copy}.ts`) | unit | All branches; 1:1 to the spec ACs each implements; every Edge Case listed in the spec that touches it | co-located `<module>.test.ts` | `npx vitest run <file>` |
| File store (`src/main/time-log-store.ts`) | unit (real temp dir) | Every read/write path: valid, invalid line, unknown `v`, corrupt sidecar backup, append failure queue + retry, atomic rewrite leaves old or new | `src/main/time-log-store.test.ts` | `npx vitest run src/main/time-log-store.test.ts` |
| DI orchestrators (`TimeTracker`, grown `SessionManager`) | unit (hand-rolled fakes, no `vi.mock`) | Every state transition and AC the design assigns to them, incl. double start, ended-after-close no-op, pause during suspend | `src/main/<module>.test.ts` | `npx vitest run <file>` |
| Shell seams (`readGit` in `time-snapshot.ts`, `index.ts` wiring, `powerMonitor`, interval) | none | Hand-verified (TESTING.md "thin OS/Electron shells") | - | build gate only |
| Type-only contracts (`src/shared/time.ts`, `ipc-contract.ts`, `config.ts`) | none | Typecheck | - | build gate only |
| Renderer components and hooks (`src/renderer/src/components/**`, `use-time.ts`) | none | CDP smoke + two-theme visual pass (TESTING.md) | - | build gate only |
| Smoke script (`scripts/smoke-time.mjs`) | none | Owner-run against a live app, never in CI | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npx vitest run <the task's test file>` |
| Full | After a task touching `SessionManager` or `TimeTracker` | `npm test` |
| Build | Type/wiring/renderer-only tasks, and at the end of every phase | `npm run typecheck && npm run lint && npm test` (+ `npx electron-vite build` at the end of Phases 3, 4 and 5) |

---

## Execution Plan

Phases run sequentially; tasks inside a phase run in the listed order. Each block lists every
dependency edge of its tasks, including edges that come from an earlier phase.

### Phase 1: Shared contracts

```
T1 -> T2
T3
```

### Phase 2: Pure logic

```
T4 -> T6
T4 -> T7
T5 -> T7
T5 -> T8
T7 -> T8
T1 -> T9
```

### Phase 3: Main persistence and tracker

```
T1 -> T10
T9 -> T11
T10 -> T11
T11 -> T12
T11 -> T13
T2 -> T14
T12 -> T14
T13 -> T14
```

### Phase 4: Live counters and pause

```
T2 -> T15
T6 -> T15
T15 -> T17
T15 -> T18
T16 -> T18
T15 -> T19
T15 -> T20
T17 -> T21
T18 -> T21
T19 -> T21
T20 -> T21
```

### Phase 5: Hours view

```
T3 -> T22
T16 -> T22
T15 -> T23
T5 -> T23
T7 -> T24
T8 -> T24
T23 -> T24
T21 -> T25
T22 -> T25
T24 -> T25
T14 -> T26
T25 -> T26
```

---

## Task Breakdown

## Phase 1: Shared contracts

### T1: Define time period types

**What**: Create `TimePeriod`, `OpenPeriod`, `PeriodSnapshotFields`, `TimeSnapshot`, `TimeEditResult` exactly as design §Data Models.
**Where**: `src/shared/time.ts`
**Depends on**: None
**Reuses**: shape conventions of `src/shared/config.ts`
**Requirement**: TIME-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Types exported with the doc comments from the design
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B tests pass (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `feat(time): add shared time period types`

---

### T2: Add time IPC channels

**What**: Add `time:snapshot`, `time:pause`, `time:resume`, `time:delete`, `time:adjust` to `IpcContract` and `time:changed` to `IpcEvents`, shapes per design.
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: T1
**Reuses**: existing `sessions:*` entries and `session:status` event
**Requirement**: TIME-16, TIME-18, TIME-44, TIME-45

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Channels typed with doc comments; no handler yet (typecheck still green, lesson L-001: nothing optional-ized to get there)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): declare time tracking IPC channels`

---

### T3: Add the hours direction

**What**: Extend `AppConfig.ui.direction` with `'hours'`.
**Where**: `src/shared/config.ts`
**Depends on**: None
**Reuses**: existing direction union
**Requirement**: TIME-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Union includes `'hours'`; `config-store.test.ts` untouched and green
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): add hours to the layout direction union`

---

## Phase 2: Pure logic

### T4: Interval arithmetic

**What**: Implement `unionMs`, `mergeIntervals(intervals, gapMs)`, `clip`, `splitAtLocalMidnight` with tests.
**Where**: `src/shared/time-intervals.ts`
**Depends on**: None
**Reuses**: —
**Requirement**: TIME-28, TIME-36, TIME-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: disjoint, overlapping, nested, identical, touching, gap = 60 s merges, gap = 61 s does not, empty input, clip outside/partial, split across one midnight and across two, interval ending exactly at midnight
- [x] Gate check passes: `npx vitest run src/shared/time-intervals.test.ts`
- [x] Test count: B + 12 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): add interval union, merge and day split`

---

### T5: Time formatters

**What**: Implement `formatHms`, `formatHm`, `formatHmCompact`, `formatDayHeader` (pt-BR weekday abbreviations) with tests.
**Where**: `src/renderer/src/lib/time-format.ts`
**Depends on**: None
**Reuses**: `relative-time.ts` style
**Requirement**: TIME-22, TIME-25, TIME-30, TIME-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: 0 → `00:00:00`/`00:00`/`0h00`; 59 999 ms floors to `00:00:59`/`00:00`; 2h28m → `2h28`; ≥ 100 h renders `100:00`; header for 2026-09-16 is `16/09/2026 (qua)`; all seven weekdays
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/time-format.test.ts`
- [x] Test count: B + 20 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): add duration and day header formatters`

---

### T6: Totals over a snapshot

**What**: Implement `intervalsOf`, `sessionTotalMs`, `currentRunMs`, `worktreeTotalMs`, `taskTotalMs` over `TimeSnapshot` + `now`, with tests.
**Where**: `src/renderer/src/lib/time-totals.ts`
**Depends on**: T4
**Reuses**: `unionMs`
**Requirement**: TIME-24, TIME-25, TIME-26, TIME-27, TIME-28, TIME-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: session sum across runs incl. open period to `now`; current run only the open period; paused session stops growing; two sessions same worktree 09–10 → 1 h; worktree match case-insensitive; task union across two worktrees; removed session's periods still counted; empty → 0
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/time-totals.test.ts`
- [x] Test count: B + 29 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): compute session, worktree and task totals`

---

### T7: Weekly report model

**What**: Implement `weekRange` and `buildWeekReport` (days newest first → task / No-task groups → merged blocks → raw periods, live title before snapshot title) with tests.
**Where**: `src/renderer/src/lib/hours-report.ts`
**Depends on**: T4, T5
**Reuses**: `splitAtLocalMidnight`, `mergeIntervals`, `unionMs`
**Requirement**: TIME-32, TIME-34, TIME-35, TIME-36, TIME-37, TIME-38, TIME-40, TIME-43

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: Monday start for a Sunday and a Monday date; day union with two tasks in parallel; group per task id; No-task grouped per cwd with folder leaf; overlap merge; 60 s adjacency merge; midnight split lands on both days; open period clipped to `now`; periods outside the week excluded; empty week → no days; raw periods attached to their block
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/hours-report.test.ts`
- [x] Test count: B + 41 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): build the weekly hours report`

---

### T8: Day copy text

**What**: Implement `formatDayCopy(day)` producing the exact TIME-39/TIME-40 text, with tests.
**Where**: `src/renderer/src/lib/hours-copy.ts`
**Depends on**: T5, T7
**Reuses**: `formatDayHeader`, `formatHmCompact`
**Requirement**: TIME-39, TIME-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: the owner's preview reproduced byte-for-byte (`16/09/2026 (qua) — total 6h42` + two padded lines); chronological order across groups; `Task #<id>` without title; `No task · <leaf>` label; single-line day has no padding surplus
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/hours-copy.test.ts`
- [x] Test count: B + 46 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): format a day's hours for clipboard`

---

### T9: Period snapshot resolver

**What**: Implement pure `buildSnapshot` (tested) and the shell `readGit` (hand-verified) per design.
**Where**: `src/main/time-snapshot.ts`
**Depends on**: T1
**Reuses**: `taskIdFromBranch`, AD-015 lexical workspace rule
**Requirement**: TIME-03, TIME-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (`buildSnapshot` only, no real git — lesson L-005): worktree of a registered workspace; unregistered workspace → null; workspace match case-insensitive; detached `HEAD` → branch and task null; branch without id; pinned title found; git nulls → all nulls
- [x] Gate check passes: `npx vitest run src/main/time-snapshot.test.ts`
- [x] Test count: B + 53 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): resolve the attribution snapshot of a period`

---

## Phase 3: Main persistence and tracker

### T10: Time log store

**What**: Implement `TimeLogStore` (`readPeriods`, `append` with retry queue, `rewrite` atomic, `readOpen` with corrupt backup, `writeOpen`) with real-temp-dir tests.
**Where**: `src/main/time-log-store.ts`
**Depends on**: T1
**Reuses**: `ConfigStore` persist and backup patterns
**Requirement**: TIME-02, TIME-04, TIME-13, TIME-14, TIME-48

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: missing files → empty; append then read round-trips; invalid JSON line and unknown `v` skipped with count; rewrite replaces content and leaves no `.tmp`; corrupt sidecar backed up and read as `[]`; append to an unwritable dir is queued and flushed by the next successful write
- [x] Gate check passes: `npx vitest run src/main/time-log-store.test.ts`
- [x] Test count: B + 62 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): persist periods to a jsonl log and open sidecar`

---

### T11: Tracker lifecycle

**What**: Implement `TimeTracker` `recover`, `started`, `ended`, `pause`, `resume`, `suspend`, `resumeFromSuspend`, `heartbeat`, `closeAll`, `snapshot` with fake store/clock/resolver/emit tests.
**Where**: `src/main/time-tracker.ts`
**Depends on**: T9, T10
**Reuses**: `SessionManager` DI shape
**Requirement**: TIME-01, TIME-02, TIME-04, TIME-05, TIME-06, TIME-07, TIME-08, TIME-09, TIME-10, TIME-11, TIME-16, TIME-18, TIME-19, TIME-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: started opens with snapshot; ended appends one period; ended twice appends once; < 1 s discarded; end < start discarded; pause closes and marks; resume opens new; resume when not paused is no-op; suspend closes all; resumeFromSuspend skips paused and stopped; heartbeat advances `lastSeen` and writes sidecar; recover closes sidecar periods at `lastSeen` and empties it; closeAll closes all; started again after ended starts unpaused; double started closes the previous open period; every mutation emits once; no API exists for lock events (TIME-08 asserted by absence in design, noted in test name)
- [x] Gate check passes: `npm test`
- [x] Test count: B + 79 tests pass

**Tests**: unit
**Gate**: full

**Commit**: `feat(time): track session periods with pause and suspend`

---

### T12: Tracker edits

**What**: Add `deletePeriod` and `adjustPeriod` to `TimeTracker` with validation and atomic rewrite, with tests.
**Where**: `src/main/time-tracker.ts`
**Depends on**: T11
**Reuses**: `TimeLogStore.rewrite`
**Requirement**: TIME-44, TIME-45, TIME-46, TIME-47, TIME-48, TIME-49

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: delete removes and rewrites; adjust persists bounds; start ≥ end rejected; end in future rejected; < 1 s rejected; open period id rejected; unknown id rejected; rejected edit rewrites nothing; each success emits once
- [x] Gate check passes: `npm test`
- [x] Test count: B + 88 tests pass

**Tests**: unit
**Gate**: full

**Commit**: `feat(time): delete and adjust recorded periods`

---

### T13: Session lifecycle observer

**What**: Add optional `lifecycle` dep to `SessionManager`; call `started` at the end of `#start`, `ended` in `#finalize` only when the session was running; tests in `session-manager.test.ts`.
**Where**: `src/main/session-manager.ts`
**Depends on**: T11
**Reuses**: existing `#start`/`#finalize`
**Requirement**: TIME-01, TIME-02, TIME-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: spawn, duplicate and respawn each call `started` once; stop calls `ended` once and the later PTY exit does not call it again; natural PTY exit calls `ended`; a spawn that throws calls nothing; no `lifecycle` dep keeps every existing test green unmodified
- [x] Gate check passes: `npm test`
- [x] Test count: B + 93 tests pass

**Tests**: unit
**Gate**: full

**Commit**: `feat(sessions): notify a lifecycle observer on pty start and end`

---

### T14: Wire the tracker in main

**What**: Construct store + tracker, `recover()` before `SessionManager`, pass `lifecycle`, register `time:*` handlers, emit `time:changed`, 60 s unref'd heartbeat, `powerMonitor` suspend/resume, `closeAll()` after `killAll()` on `window-all-closed`.
**Where**: `src/main/index.ts`
**Depends on**: T2, T12, T13
**Reuses**: `handle`, `emitToWindow`, `TaskBoard.list()` for pinned titles, `WorkspaceRegistry` paths
**Requirement**: TIME-04, TIME-05, TIME-06, TIME-07, TIME-08, TIME-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No `lock-screen`/`unlock-screen` subscription exists
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test && npx electron-vite build`
- [x] Test count: B + 93 tests pass
- [x] Hand-verified in dev: spawn + stop writes one line to `%APPDATA%/playground/time-log.jsonl`

**Tests**: none
**Gate**: build

**Commit**: `feat(time): wire the time tracker into the main process`

---

## Phase 4: Live counters and pause

### T15: useTime hook

**What**: Create `useTime()` (snapshot, refetch on `time:changed`, pause/resume/delete/adjust) and `useNow(intervalMs)`.
**Where**: `src/renderer/src/lib/use-time.ts`
**Depends on**: T2, T6
**Reuses**: `use-sessions.ts` subscribe-and-refetch pattern
**Requirement**: TIME-22, TIME-23, TIME-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Hook unsubscribes on unmount; `useNow` clears its interval
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): add the renderer time snapshot hook`

---

### T16: Clock and pause icons

**What**: Add `clock` and `pause` glyphs to the icon set.
**Where**: `src/renderer/src/components/Icon.tsx`
**Depends on**: None
**Reuses**: existing `play` glyph style
**Requirement**: TIME-15, TIME-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Both names in the `IconName` union and rendered at 14px in both themes
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(ui): add clock and pause icons`

---

### T17: Counters in the rail

**What**: Row shows session `hh:mm:ss` (ticking via `useNow(1000)` only while an open period exists); task-group head row shows task `hh:mm`; orphan-group head row shows cwd `hh:mm`; styles in `SessionRail.css`. Requires AD-021 recorded.
**Where**: `src/renderer/src/components/SessionRail.tsx`
**Depends on**: T15
**Reuses**: `time-totals`, `time-format`, rail group model
**Requirement**: TIME-22, TIME-26, TIME-27, TIME-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Row keeps its ~34px height at 344px rail width with the counter
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): show session and group time in the agents rail`

---

### T18: Detail bar counter and pause

**What**: Detail bar shows session `hh:mm:ss` with tooltip `current run hh:mm:ss`, and **Pause time** / **Resume time** while running; styles in `AgentsView.css`.
**Where**: `src/renderer/src/components/AgentsView.tsx`
**Depends on**: T15, T16
**Reuses**: `agents-detail-btn` styles
**Requirement**: TIME-15, TIME-16, TIME-17, TIME-18, TIME-20, TIME-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Control hidden while stopped; paused counter frozen; terminal still accepts input while paused
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): add session timer and pause to the detail bar`

---

### T19: Worktree total in detail

**What**: Show the worktree total `hh:mm` with the clock icon beside the branch title.
**Where**: `src/renderer/src/components/WorktreeDetail.tsx`
**Depends on**: T15
**Reuses**: `worktreeTotalMs`, `formatHm`
**Requirement**: TIME-25, TIME-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Renders `00:00` for a worktree with no time
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): show worktree total in the worktree detail`

---

### T20: Task total on pinned card

**What**: Show the task total `hh:mm` in the pinned task card footer.
**Where**: `src/renderer/src/components/TasksPane.tsx`
**Depends on**: T15
**Reuses**: `taskTotalMs`, `formatHm`
**Requirement**: TIME-26, TIME-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Footer keeps the worktree indicator; total right-aligned
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): show task total on pinned task cards`

---

### T21: Thread time into the app

**What**: Mount `useTime` in `App` and pass snapshot + actions to `AgentsView`/`SessionRail`, `WorktreeDetail`, `TasksPane`.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T17, T18, T19, T20
**Reuses**: existing prop threading
**Requirement**: TIME-22, TIME-23, TIME-25, TIME-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Counters visible in dev on all four surfaces; App does not re-render every second (React profiler)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test && npx electron-vite build`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): connect time totals to the app surfaces`

---

## Phase 5: Hours view

### T22: Hours segment in TopBar

**What**: Add the `Hours` segment (clock icon) after Workflows.
**Where**: `src/renderer/src/components/TopBar.tsx`
**Depends on**: T3, T16
**Reuses**: existing segment markup
**Requirement**: TIME-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `aria-selected` follows the direction
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): add the Hours direction to the top bar`

---

### T23: Raw period row with edit and delete

**What**: `PeriodRow` renders start/end/duration/agent; closed periods get Edit (two `datetime-local` inputs, Save/Cancel, inline error from `TimeEditResult`) and Delete with confirm; open periods get neither.
**Where**: `src/renderer/src/components/PeriodRow.tsx`
**Depends on**: T15, T5
**Reuses**: dialog/confirm button styles
**Requirement**: TIME-38, TIME-44, TIME-45, TIME-46, TIME-47, TIME-49

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Local input values convert to UTC ISO before invoke
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): edit and delete a recorded period`

---

### T24: Hours view

**What**: `HoursView` with week header (range, total), ◀ ▶ This week, days → groups → block lines, expander listing `PeriodRow`s, per-day Copy with 1.2 s `Copied`, empty state, minute refresh while the week has an open period; styles in `HoursView.css`.
**Where**: `src/renderer/src/components/HoursView.tsx`
**Depends on**: T7, T8, T23
**Reuses**: `buildWeekReport`, `formatDayCopy`, `COPIED_FEEDBACK_MS`
**Requirement**: TIME-32, TIME-33, TIME-34, TIME-35, TIME-36, TIME-37, TIME-38, TIME-39, TIME-41, TIME-42, TIME-43

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Both themes readable; long task titles ellipsize
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): add the weekly Hours view`

---

### T25: Route the Hours direction

**What**: Render `HoursView` when `ui.direction === 'hours'`, passing the `useTime` snapshot, actions and live pinned titles.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T21, T22, T24
**Reuses**: direction switch
**Requirement**: TIME-31, TIME-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Direction persists across restart
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test && npx electron-vite build`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(time): route the Hours direction`

---

### T26: Time tracking smoke script

**What**: CDP smoke: spawn a session, pause/resume, stop; assert counters render, `time:snapshot` holds the periods, Hours shows today's line, Copy writes the expected header; kill-and-relaunch recovery checked by hand and noted.
**Where**: `scripts/smoke-time.mjs`
**Depends on**: T14, T25
**Reuses**: `scripts/smoke-activity.mjs` structure
**Requirement**: TIME-01, TIME-02, TIME-05, TIME-16, TIME-18, TIME-22, TIME-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Script lints; owner-run result recorded in `validation.md`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: B + 93 tests pass

**Tests**: none
**Gate**: build

**Commit**: `test(time): add a CDP smoke for time tracking`

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 types file | ✅ Granular |
| T2 | 1 contract file | ✅ Granular |
| T3 | 1 union member | ✅ Granular |
| T4 | 1 pure module (4 cohesive fns) | ✅ Granular |
| T5 | 1 pure module (4 formatters) | ✅ Granular |
| T6 | 1 pure module | ✅ Granular |
| T7 | 1 pure module | ✅ Granular |
| T8 | 1 function | ✅ Granular |
| T9 | 1 module (pure fn + shell) | ✅ Granular |
| T10 | 1 store class | ✅ Granular |
| T11 | 1 class, lifecycle half | ⚠️ Cohesive (largest task; one state machine) |
| T12 | 2 methods on the same class | ✅ Granular |
| T13 | 1 optional dep + 2 call sites | ✅ Granular |
| T14 | 1 wiring file | ✅ Granular |
| T15 | 1 hook file | ✅ Granular |
| T16 | 2 glyphs | ✅ Granular |
| T17 | 1 component (+ its CSS) | ✅ Granular |
| T18 | 1 component (+ its CSS) | ✅ Granular |
| T19 | 1 component | ✅ Granular |
| T20 | 1 component | ✅ Granular |
| T21 | 1 composition file | ✅ Granular |
| T22 | 1 segment | ✅ Granular |
| T23 | 1 component | ✅ Granular |
| T24 | 1 view (+ its CSS) | ✅ Granular |
| T25 | 1 route branch | ✅ Granular |
| T26 | 1 script | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | — | ✅ Match |
| T2 | T1 | T1 -> T2 | ✅ Match |
| T3 | None | — | ✅ Match |
| T4 | None | — | ✅ Match |
| T5 | None | — | ✅ Match |
| T6 | T4 | T4 -> T6 | ✅ Match |
| T7 | T4, T5 | T4 -> T7, T5 -> T7 | ✅ Match |
| T8 | T5, T7 | T5 -> T8, T7 -> T8 | ✅ Match |
| T9 | T1 | T1 -> T9 | ✅ Match |
| T10 | T1 | T1 -> T10 | ✅ Match |
| T11 | T9, T10 | T9 -> T11, T10 -> T11 | ✅ Match |
| T12 | T11 | T11 -> T12 | ✅ Match |
| T13 | T11 | T11 -> T13 | ✅ Match |
| T14 | T2, T12, T13 | T2 -> T14, T12 -> T14, T13 -> T14 | ✅ Match |
| T15 | T2, T6 | T2 -> T15, T6 -> T15 | ✅ Match |
| T16 | None | — | ✅ Match |
| T17 | T15 | T15 -> T17 | ✅ Match |
| T18 | T15, T16 | T15 -> T18, T16 -> T18 | ✅ Match |
| T19 | T15 | T15 -> T19 | ✅ Match |
| T20 | T15 | T15 -> T20 | ✅ Match |
| T21 | T17, T18, T19, T20 | T17/T18/T19/T20 -> T21 | ✅ Match |
| T22 | T3, T16 | T3 -> T22, T16 -> T22 | ✅ Match |
| T23 | T15, T5 | T15 -> T23, T5 -> T23 | ✅ Match |
| T24 | T7, T8, T23 | T7 -> T24, T8 -> T24, T23 -> T24 | ✅ Match |
| T25 | T21, T22, T24 | T21 -> T25, T22 -> T25, T24 -> T25 | ✅ Match |
| T26 | T14, T25 | T14 -> T26, T25 -> T26 | ✅ Match |

No task depends on a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: types | Type-only contract | none | none | ✅ OK |
| T2: IPC channels | Type-only contract | none | none | ✅ OK |
| T3: direction | Type-only contract | none | none | ✅ OK |
| T4: intervals | Pure logic | unit | unit | ✅ OK |
| T5: formatters | Pure logic | unit | unit | ✅ OK |
| T6: totals | Pure logic | unit | unit | ✅ OK |
| T7: report | Pure logic | unit | unit | ✅ OK |
| T8: copy text | Pure logic | unit | unit | ✅ OK |
| T9: snapshot | Pure logic (+ shell seam, none) | unit | unit | ✅ OK |
| T10: store | File store | unit | unit | ✅ OK |
| T11: tracker lifecycle | DI orchestrator | unit | unit | ✅ OK |
| T12: tracker edits | DI orchestrator | unit | unit | ✅ OK |
| T13: SessionManager | DI orchestrator | unit | unit | ✅ OK |
| T14: index wiring | Shell seam | none | none | ✅ OK |
| T15: hook | Renderer hook | none | none | ✅ OK |
| T16: icons | Renderer component | none | none | ✅ OK |
| T17: rail | Renderer component | none | none | ✅ OK |
| T18: detail bar | Renderer component | none | none | ✅ OK |
| T19: worktree detail | Renderer component | none | none | ✅ OK |
| T20: task card | Renderer component | none | none | ✅ OK |
| T21: App | Renderer component | none | none | ✅ OK |
| T22: TopBar | Renderer component | none | none | ✅ OK |
| T23: PeriodRow | Renderer component | none | none | ✅ OK |
| T24: HoursView | Renderer component | none | none | ✅ OK |
| T25: App route | Renderer component | none | none | ✅ OK |
| T26: smoke | Smoke script | none | none | ✅ OK |

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ─ T2 ─ T3
Phase 2:  T4 ─ T5 ─ T6 ─ T7 ─ T8 ─ T9
Phase 3:  T10 ─ T11 ─ T12 ─ T13 ─ T14
Phase 4:  T15 ─ T16 ─ T17 ─ T18 ─ T19 ─ T20 ─ T21
Phase 5:  T22 ─ T23 ─ T24 ─ T25 ─ T26
```

26 tasks → sub-agent offer at Execute (≈ 4 batches: Phases 1–2, 3, 4, 5).
