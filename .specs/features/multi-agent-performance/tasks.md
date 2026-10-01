# Multi-Agent Performance Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/multi-agent-performance/spec.md` (PERF-01..18)
**Design**: `.specs/features/multi-agent-performance/design.md`
**Status**: In Progress (Phase 7 added 2026-10-01, owner-approved)
**Branch**: `feature/multi-agent-performance` (cut from `origin/main`)
**Test baseline**: **B = 2319** tests on the branch before T1 (2026-10-01; 2–4 real-git tests in `file-discard`, `worktree-manager` fail locally from machine load — pre-existing noise, CI is the gate). Every "Test count" is `B + N`, cumulative. Known local noise: a few real-git/process tests in `src/main` can fail from machine load (pre-existing; CI is the gate).
**Before T1**: AD-052 is recorded in `.specs/STATE.md`; it is committed with the spec docs in the first commit.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (main-process modules and renderer `lib/` pure modules are unit-tested with hand-rolled fakes, no `vi.mock`; renderer React components and hooks are verified by hand / visual pass), `vitest.config.ts` (`src/**/*.test.ts`), AD-003 (coverage report-only), confirmed lessons L-001, L-005, L-009.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process modules (`src/main/*.ts`, not `index.ts`) | unit | All branches; 1:1 to the spec ACs each implements; every spec Edge Case that touches it; literal assertions for spec constants (L-009) | co-located `<module>.test.ts` | `npx vitest run <file>` |
| Renderer pure logic (`src/renderer/src/lib/*.ts`, non-hook) | unit | Same as above; DI fakes for timers / observers / addons | co-located `<module>.test.ts` | `npx vitest run <file>` |
| Renderer hooks (`use-*.ts`) and React components (`*.tsx`), CSS | none | Hand-verified in the dev app with the PERF-17 render log (TESTING.md convention) | - | build gate |
| `src/main/index.ts` wiring, `package.json` / notices | none | Build gate | - | build gate |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <touched test files>` |
| Full | Not used (no integration/e2e layer in scope) | - |
| Build | After each phase and after tasks with `Tests: none` | `npm run typecheck && npm run lint && npm test` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Measurement (ships first, so the baseline exists)

```
T1 → T2
T3 → T4
```

### Phase 2: Scrollback

```
T5
```

### Phase 3: GPU terminal

```
T6 → T7 → T8
```

### Phase 4: Re-render isolation

```
T9 → T11
T10 → T11
T9 → T12
T13
T14
```

### Phase 5: Clocks

```
T15 → T17
T16 → T17
T15 → T18
```

### Phase 6: Recount routing

```
T19
T20 → T21 → T22
```

### Phase 7: No synchronous child process in main (added 2026-10-01)

```
T23 → T24 → T25
T26 → T28
T27 → T28
```

### Phase 8: Pace git spawns (added 2026-10-01)

```
T29 → T30
```

---

## Task Breakdown

### T1: Main event-loop delay logger

**What**: `startLoopDelayLog` + `formatLoopLine` per design (§Perf instrumentation, Main): `resolution: 10`, a line every 10 s, `reset()` after each line, a stop function, and nothing started when `enabled` is false.
**Where**: `src/main/perf-monitor.ts` (new) (co-located `.test.ts`)
**Depends on**: None
**Reuses**: DI pattern (TESTING.md §3): injected `monitor`, `every`, `log`
**Requirement**: PERF-16, PERF-18

**Done when**:
- [x] Line format is `[perf] loop p50=<n> p99=<n> max=<n>` in ms with 1 decimal (nanosecond histogram → ms), asserted literally
- [x] Interval is 10,000 ms and resolution 10 ms, asserted literally (L-009)
- [x] `enabled: false` → no monitor created, no interval, no log
- [x] Stop disables the monitor and clears the interval
- [x] Gate: quick; Test count B + ≥5

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `feat(perf): log main event-loop delay behind a debug flag`

---

### T2: Wire the loop-delay logger in main

**What**: Start `startLoopDelayLog({ enabled: process.env.PLAYGROUND_DEBUG_PERF === '1' })` at app ready; stop it on quit.
**Where**: `src/main/index.ts`
**Depends on**: T1
**Reuses**: existing `before-quit` / `window-all-closed` cleanup
**Requirement**: PERF-16, PERF-18

**Done when**:
- [x] Gate: build passes; Test count unchanged

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `feat(perf): start the loop-delay log when PLAYGROUND_DEBUG_PERF=1`

---

### T3: Renderer perf probe

**What**: `PERF_FLAG_KEY`, `perfEnabled(read)`, `startLongTaskLog(Observer, log, warn)` (logs `[perf] longtask <ms>ms` for `duration ≥ 50`; a throwing `observe` warns once and returns a no-op stop) and `formatRenderLine(component, id?)`.
**Where**: `src/renderer/src/lib/perf-probe.ts` (new) (co-located `.test.ts`)
**Depends on**: None
**Reuses**: `isProbeEnabled` (`terminal-modes.ts:76`)
**Requirement**: PERF-15, PERF-17, PERF-18

**Done when**:
- [x] Flag key is `'playground.debug.perf'`, threshold 50 ms, asserted literally
- [x] A 49 ms entry is not logged; a 50 ms entry is, as `[perf] longtask 50ms`
- [x] A throwing flag read → disabled
- [x] `formatRenderLine('SessionRow', 'a')` → `[perf] render SessionRow a`; without id → `[perf] render TopBar`
- [x] Gate: quick; Test count B + ≥11

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `feat(perf): add the renderer perf probe`

---

### T4: PerfProfiler component and long-task startup

**What**: `PerfProfiler` renders React `<Profiler onRender>` logging `formatRenderLine` only when `perfEnabled()`, otherwise returns `children`; `main.tsx` calls `startLongTaskLog()` only when enabled.
**Where**: `src/renderer/src/components/PerfProfiler.tsx` (new; started from main.tsx)
**Depends on**: T3
**Reuses**: `perf-probe.ts`
**Requirement**: PERF-15, PERF-17, PERF-18

**Done when**:
- [x] Gate: build passes; Test count unchanged
- [ ] Dev app with the flag set logs `[perf] longtask` lines; without it, none

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `feat(perf): profile renders and long tasks when the perf flag is set`

---

### T5: SessionRingBuffer chunk deque

**What**: Rewrite the internals per design (§SessionRingBuffer): chunk deque + running byte/newline counters, head-walk trims, code-point byte walk, joined snapshot, end-scan `tail`. Public surface unchanged.
**Where**: `src/main/session-ring-buffer.ts` (co-located `.test.ts`)
**Depends on**: None
**Reuses**: `TerminalModeTracker`
**Requirement**: PERF-01, PERF-02, PERF-03

**Done when**:
- [x] Every existing test in `session-ring-buffer.test.ts` passes unmodified
- [x] Reference-equivalence test: the current algorithm copied into the test as the oracle; ≥ 3 seeded random streams of BMP text (ASCII, `é`, `✻`, ANSI incl. `?1049h`/`?2004h`, chunk sizes 1–4,096, newline-dense and newline-free runs) with small caps (e.g. 2,000 bytes / 50 lines) compare `snapshot()` and `tail(2)` after every append
- [x] Cost test (PERF-01): 10,000 × 45 B appends on a buffer filled to 1,000,000 bytes and to 5,000 lines complete in < 250 ms
- [x] Edge cases: single chunk > `maxBytes`; chunk with no newline; mode sequence split across chunks then trimmed; astral char at the byte boundary is never split and counts 4 bytes
- [x] Gate: quick; Test count B + ≥19

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `perf(sessions): make scrollback append cost independent of retained size`

---

### T6: Add the WebGL addon dependency

**What**: Add `@xterm/addon-webgl` pinned to `0.19.0` and its MIT entry in the third-party notices.
**Where**: `package.json` (lockfile and notices follow)
**Depends on**: None
**Requirement**: PERF-04

**Done when**:
- [x] `npm ls @xterm/addon-webgl` shows 0.19.0 deduped against `@xterm/xterm@6.0.0`
- [x] Gate: build passes; Test count unchanged

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `build(deps): add @xterm/addon-webgl 0.19.0`

---

### T7: attachGpuRenderer helper

**What**: `attachGpuRenderer(term, create, warn)` per design: try-load, warn once on throw, dispose on context loss, idempotent dispose, `kind()`.
**Where**: `src/renderer/src/lib/terminal-gpu.ts` (new) (co-located `.test.ts`)
**Depends on**: T6
**Reuses**: DI fakes
**Requirement**: PERF-04, PERF-05, PERF-06, PERF-07

**Done when**:
- [x] Load OK → `kind() === 'webgl'`, `loadAddon` called once
- [x] `create` or `loadAddon` throws → `warn` called once, `kind() === 'dom'`, no throw out
- [x] Context loss → addon disposed once, `kind() === 'dom'`
- [x] Context loss then `dispose()` (unmount) → addon disposed exactly once (Edge Case)
- [x] Gate: quick; Test count B + ≥24

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `feat(terminal): add a WebGL renderer loader with DOM fallback`

---

### T8: Render the terminal with WebGL

**What**: `TerminalPane` calls `attachGpuRenderer(term, () => new WebglAddon(), console.warn)` right after `term.open`, disposes it in cleanup before `term.dispose()`, and, when the perf flag is on, logs `[perf] renderer=<kind>`.
**Where**: `src/renderer/src/components/TerminalPane.tsx`
**Depends on**: T7
**Requirement**: PERF-04, PERF-05, PERF-06, PERF-07

**Done when**:
- [x] Gate: build passes; Test count unchanged
- [ ] Dev app: `[perf] renderer=webgl`; theme toggle recolors; `WEBGL_lose_context.loseContext()` keeps the terminal usable

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `perf(terminal): render the terminal with WebGL`

---

### T9: useLatestCallback hook

**What**: `useLatestCallback(fn)` — stable identity, calls the latest `fn` (ref updated in an effect).
**Where**: `src/renderer/src/lib/use-latest-callback.ts` (new)
**Depends on**: None
**Requirement**: PERF-09

**Done when**:
- [x] Gate: build passes; Test count unchanged

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): add useLatestCallback`

---

### T10: railRowEqual comparator and activity identity

**What**: `railRowEqual(a, b)` in `rail-groups.ts` per design; a test that pins `applyActivity` keeping every other session's identity.
**Where**: `src/renderer/src/lib/rail-groups.ts` (co-located `.test.ts`)
**Depends on**: None
**Requirement**: PERF-08, PERF-09

**Done when**:
- [x] Equal when two `buildRailGroups` runs over the same inputs yield the row (fresh objects)
- [x] Not equal when any of `label`, `status`, `tooltip`, `actions`, `session` identity differ (one test each)
- [x] `applyActivity(list, 'A', …)`: every non-A element `toBe` the original; A is a new object
- [x] Gate: quick; Test count B + ≥31

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `feat(rail): compare rail rows by content`

---

### T11: Memoize rail rows

**What**: `SessionRow` = `memo(SessionRow, railRowPropsEqual)`; every function prop goes through `useLatestCallback` in `SessionRail`; the per-row ref callback is stable; `SessionRow` and `SessionRail` wrapped in `PerfProfiler`.
**Where**: `src/renderer/src/components/SessionRail.tsx`
**Depends on**: T9, T10
**Requirement**: PERF-09, PERF-17

**Done when**:
- [x] Gate: build passes; Test count unchanged
- [ ] Dev app with flag, two sessions, one working: `[perf] render SessionRow <A>` lines, none for B

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `perf(rail): re-render only the rail row whose session changed`

---

### T12: Stable App props for TopBar, Sidebar and StatusBar

**What**: `memo(TopBar)` / `memo(Sidebar)` at the App call sites; `sync` via `useMemo`; their callbacks via `useLatestCallback`; `TopBar`, `Sidebar`, `StatusBar` wrapped in `PerfProfiler`.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T9
**Requirement**: PERF-09, PERF-17

**Done when**:
- [x] Gate: build passes; Test count unchanged
- [ ] Dev app with flag: a working session logs no `[perf] render TopBar` / `Sidebar` lines

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `perf(app): keep TopBar and Sidebar out of activity re-renders`

---

### T13: Profile the session detail

**What**: Wrap `SessionDetail` in `PerfProfiler` and give the activity pill a `title` with its full text.
**Where**: `src/renderer/src/components/AgentsView.tsx`
**Depends on**: None
**Requirement**: PERF-10, PERF-17

**Done when**:
- [x] Gate: build passes; Test count unchanged

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `feat(agents): profile the session detail and title the activity pill`

---

### T14: Single-line activity pill

**What**: `.agents-detail-pill` single line with ellipsis per design; header keeps one line at any width.
**Where**: `src/renderer/src/components/AgentsView.css`
**Depends on**: None
**Requirement**: PERF-10

**Done when**:
- [ ] Dev app at the narrowest window: a long pill truncates with `…`, header height unchanged, no `session:resize` on activity change
- [x] Gate: build passes

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `fix(agents): keep the activity pill on one line`

---

### T15: Time index

**What**: `timeIndex(snapshot)` (WeakMap-cached) with `sessionTotalMs`, `currentRunMs`, `worktreeTotalMs`, `taskTotalMs` per design.
**Where**: `src/renderer/src/lib/time-index.ts` (new) (co-located `.test.ts`)
**Depends on**: None
**Reuses**: `time-totals.ts` (oracle in tests), `unionMs`
**Requirement**: PERF-14

**Done when**:
- [x] Each of the four equals its `time-totals.ts` counterpart over fixtures (overlapping closed periods, several open periods, case-differing `cwd`, open overlapping a closed one, empty snapshot) at ≥ 3 `now` values
- [x] Same snapshot → same index object; new snapshot → new index (Edge Case)
- [x] Counting proxy: building reads each closed period once; 100 calls at different `now` read no closed period
- [x] Gate: quick; Test count B + ≥38

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `perf(time): index closed periods once per snapshot`

---

### T16: Shared ticker

**What**: Ticker store `subscribeTick(ms, cb, timers)` / `currentTick(ms)` + `useSharedNow(ms | null)` (`useSyncExternalStore`); one interval per distinct period, started on first subscriber, cleared on last.
**Where**: `src/renderer/src/lib/shared-tick.ts` (new) (co-located `.test.ts`)
**Depends on**: None
**Requirement**: PERF-14

**Done when**:
- [x] 5 subscribers at 1,000 ms → exactly one `setInterval(…, 1000)`; all notified per tick
- [x] Last unsubscribe → `clearInterval`; a new subscriber restarts it
- [x] 1,000 ms and 15,000 ms subscribers → two intervals
- [x] Gate: quick; Test count B + ≥41

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `perf(time): drive every clock from one shared tick`

---

### T17: Clocks read the index on the shared tick

**What**: `SessionClock` and `TotalClock` use `useSharedNow` and `timeIndex(snapshot)`.
**Where**: `src/renderer/src/components/TimeCounter.tsx`
**Depends on**: T15, T16
**Requirement**: PERF-14

**Done when**:
- [x] Gate: build passes; Test count unchanged
- [ ] Dev app: rail and detail clocks tick together and show the same values as before

**Status**: ✅ Done (dev-app check pending UAT)

**Tests**: none
**Gate**: build
**Commit**: `perf(time): tick clocks from the shared ticker and the index`

---

### T18: Rail group totals from the index

**What**: `SessionRail`'s `totalAt` closures call `timeIndex(time).worktreeTotalMs` / `.taskTotalMs`.
**Where**: `src/renderer/src/components/SessionRail.tsx`
**Depends on**: T15
**Requirement**: PERF-14

**Done when**:
- [x] Gate: build passes; Test count unchanged

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `perf(rail): read group totals from the time index`

---

### T19: patchWorktreeStatus keeps an unchanged tree

**What**: Return `tree` itself when the worktree's `dirty` and `changes` already match; update the doc comment to cite AD-052.
**Where**: `src/renderer/src/lib/tree-status.ts` (co-located `.test.ts`)
**Depends on**: None
**Requirement**: PERF-11

**Done when**:
- [x] Unchanged status → `toBe(tree)`; changed `dirty` or `changes` → new tree with the patch (one test each)
- [x] Existing tests updated only where they asserted SCRF-03's new-identity-on-unchanged rule (AD-052)
- [x] Gate: quick; Test count B + ≥43

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `perf(tree): keep the tree when a recount changes nothing`

---

### T20: Listener set

**What**: `createListenerSet<T>()` → `{ add(cb): () => void; emit(value: T): void }`; a listener that throws is logged and does not stop the others.
**Where**: `src/renderer/src/lib/listener-set.ts` (new) (co-located `.test.ts`)
**Depends on**: None
**Requirement**: PERF-12, PERF-13

**Done when**:
- [x] Add/emit/remove; duplicate add of one fn; throwing listener isolated
- [x] Gate: quick; Test count B + ≥46

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): add a typed listener set`

---

### T21: useTree exposes treeRevision and onRecounted

**What**: `treeRevision` bumped on every `tree:get` result (all three refresh variants); `onRecounted` fired for every recount result from `recount` and the `worktree:status` push.
**Where**: `src/renderer/src/lib/use-tree.ts`
**Depends on**: T20
**Requirement**: PERF-12, PERF-13

**Done when**:
- [x] Gate: build passes; Test count unchanged

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `feat(tree): signal tree refreshes and recounts`

---

### T22: Route recount signals to the status bar's git sync

**What**: `useGitSync` replaces its `tree` option with `treeRevision` + `onRecounted` (effect on `[targetPath, treeRevision]`; the subscription reloads sync state only for `targetPathRef.current`), and the one signal chain that feeds it — `StatusBar` props and App's call — moves in the same commit so it compiles.
**Where**: `src/renderer/src/lib/use-git-sync.ts` (its prop chain moves with it)
**Depends on**: T21
**Requirement**: PERF-12, PERF-13

**Done when**:
- [x] Gate: build passes; Test count unchanged
- [ ] Dev app, two worktrees: a commit in the non-target worktree triggers no `git:sync-state`; a commit in the target updates ahead/behind; a manual refresh (`tree:get`) re-reads it

**Status**: ✅ Done (dev-app check pending UAT)

**Tests**: none
**Gate**: build
**Commit**: `perf(status-bar): reload sync state only for the bar's own worktree`

---

### T23: PATH lookup without a child process

**What**: `findOnPath(name, env, isFile)` per design (Phase 7 addendum).
**Where**: `src/main/path-lookup.ts` (new; co-located `.test.ts`)
**Depends on**: None
**Requirement**: PERF-19

**Done when**:
- [x] Dir-major, ext-minor order; first hit wins; empty and quoted PATH entries handled; default PATHEXT when unset
- [x] A directory with `á` returns the path with `á` byte-for-byte
- [x] No hit → `null`
- [x] Gate: quick

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `perf(agents): find the claude binary on PATH without spawning where`

---

### T24: Cached binary resolver

**What**: `BinaryResolver` per design: sync `get()`, background lookup throttled to one per 30 s, at most one in flight, config fallback, `agent binary not found`.
**Where**: `src/main/binary-resolver.ts` (new; co-located `.test.ts`)
**Depends on**: T23
**Requirement**: PERF-19, PERF-20

**Done when**:
- [x] `get()` before the first lookup settles → configured path, or throws `agent binary not found`; after it → found path
- [x] `get()` at +29,999 ms starts no lookup; at +30,000 ms starts exactly one; a second `get()` while it is in flight starts none (30,000 pinned literally)
- [x] A rejecting or `null` lookup keeps the previous path
- [x] Gate: quick

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `perf(agents): resolve the claude binary from a cache`

---

### T25: Wire the resolver

**What**: Replace the `execFileSync('where')` `resolveClaude` with `BinaryResolver` over `findOnPath('claude', process.env, isFile)` and the `agent.claudePath` override.
**Where**: `src/main/index.ts`
**Depends on**: T24
**Requirement**: PERF-19, PERF-20

**Done when**:
- [x] No `execFileSync('where'` left in `src/main`
- [x] Gate: build

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `perf(agents): stop blocking main on where claude`

---

### T26: Asynchronous git read

**What**: `readGitAsync(cwd)` in `time-snapshot.ts` per design.
**Where**: `src/main/time-snapshot.ts` (co-located `.test.ts`)
**Depends on**: None
**Requirement**: PERF-21

**Done when**:
- [x] In a temp `git init` repo on a branch → `{ gitCommonDir, branch }` with the branch name; in a non-repo temp dir → nulls
- [x] Gate: quick

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `perf(time): add an asynchronous git read`

---

### T27: Patch period attribution asynchronously

**What**: `TimeTracker` optional `resolveSnapshotAsync`; patch by id per design.
**Where**: `src/main/time-tracker.ts` (co-located `.test.ts`)
**Depends on**: None
**Requirement**: PERF-21

**Done when**:
- [x] Open period: resolve with different fields → `snapshot().open[0]` carries them, `writeOpen` and `emit` called
- [x] Closed and kept (≥ 1 s) before resolve → the closed period carries them, `rewrite` and `emit` called
- [x] Discarded (< 1 s) before resolve → no rewrite, no emit, periods unchanged
- [x] Same fields → no write, no emit; rejection → nothing changes
- [x] Hand-set task: the patched period keeps the hand-set task fields (`withSessionTask`)
- [x] Every existing `time-tracker.test.ts` test passes unmodified
- [x] Gate: quick

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `perf(time): attribute periods without a synchronous git call`

---

### T28: Wire the git cache into the tracker

**What**: Per-cwd git cache in `index.ts`; `resolveSnapshot` reads it, `resolveSnapshotAsync` fills it via `readGitAsync`.
**Where**: `src/main/index.ts`
**Depends on**: T26, T27
**Requirement**: PERF-21

**Done when**:
- [x] `readGit` (sync) no longer called from `index.ts`
- [x] Gate: build

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `perf(time): read period attribution from a git cache`

---

### T29: Spawn pacer

**What**: `createSpawnPacer({ maxRunning, defer })` per design (Phase 8 addendum).
**Where**: `src/main/spawn-pacer.ts` (new; co-located `.test.ts`)
**Depends on**: None
**Requirement**: PERF-22

**Done when**:
- [x] 6 calls requested at once: none starts before the first `defer` turn; one start per turn; FIFO order
- [x] With 4 running, the 5th starts only after one settles (default `maxRunning` pinned as 4)
- [x] Each call resolves/rejects with its own result; a reject and a synchronous throw both free the slot
- [x] Gate: quick

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick
**Commit**: `perf(git): add a spawn pacer`

---

### T30: Route every git call through the pacer

**What**: `git()` in `git.ts` schedules its `execFile` through one module-level pacer.
**Where**: `src/main/git.ts`
**Depends on**: T29
**Requirement**: PERF-22

**Done when**:
- [x] Gate: build (the existing real-git suites exercise `git()` through the pacer)

**Status**: ✅ Done

**Tests**: none
**Gate**: build
**Commit**: `perf(git): start git processes one per event-loop turn`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8

Phase 1:  T1 → T2
          T3 → T4
Phase 2:  T5
Phase 3:  T6 → T7 → T8
Phase 4:  T9 → T11
          T10 → T11
          T9 → T12
          T13
          T14
Phase 5:  T15 → T17
          T16 → T17
          T15 → T18
Phase 6:  T19
          T20 → T21 → T22
Phase 7:  T23 → T24 → T25
          T26 → T28
          T27 → T28
Phase 8:  T29 → T30
```

Execution is strictly sequential: tasks run in numeric order within a phase.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 module + test | ✅ |
| T2 | 1 wiring call | ✅ |
| T3 | 1 module + test | ✅ |
| T4 | 1 component + its 1-line startup call | ⚠️ cohesive |
| T5 | 1 class internals + test | ✅ |
| T6 | 1 dependency (manifest + lock + notice) | ⚠️ cohesive |
| T7 | 1 function + test | ✅ |
| T8 | 1 component wiring | ✅ |
| T9 | 1 hook | ✅ |
| T10 | 1 function + identity pin test | ✅ |
| T11 | 1 component | ✅ |
| T12 | 1 file | ✅ |
| T13 | 1 component | ✅ |
| T14 | 1 stylesheet rule | ✅ |
| T15 | 1 module + test | ✅ |
| T16 | 1 module + test | ✅ |
| T17 | 1 component | ✅ |
| T18 | 1 component edit | ✅ |
| T19 | 1 function + test | ✅ |
| T20 | 1 module + test | ✅ |
| T21 | 1 hook | ✅ |
| T22 | 1 hook + its prop chain | ⚠️ cohesive (option change must compile in one commit) |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | — | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | None | — | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | None | — | ✅ |
| T6 | None | — | ✅ |
| T7 | T6 | T6 → T7 | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | None | — | ✅ |
| T10 | None | — | ✅ |
| T11 | T9, T10 | T9 → T11, T10 → T11 | ✅ |
| T12 | T9 | T9 → T12 | ✅ |
| T13 | None | — | ✅ |
| T14 | None | — | ✅ |
| T15 | None | — | ✅ |
| T16 | None | — | ✅ |
| T17 | T15, T16 | T15 → T17, T16 → T17 | ✅ |
| T18 | T15 | T15 → T18 | ✅ |
| T19 | None | — | ✅ |
| T20 | None | — | ✅ |
| T21 | T20 | T20 → T21 | ✅ |
| T22 | T21 | T21 → T22 | ✅ |

Cross-phase: T11–T13 use `PerfProfiler` from T4, which sits in Phase 1 — a backward dependency only. ✅

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | main module | unit | unit | ✅ |
| T2 | `index.ts` wiring | none | none | ✅ |
| T3 | renderer pure lib | unit | unit | ✅ |
| T4 | component | none | none | ✅ |
| T5 | main module | unit | unit | ✅ |
| T6 | manifest | none | none | ✅ |
| T7 | renderer pure lib | unit | unit | ✅ |
| T8 | component | none | none | ✅ |
| T9 | hook | none | none | ✅ |
| T10 | renderer pure lib | unit | unit | ✅ |
| T11–T14 | component / CSS | none | none | ✅ |
| T15, T16 | renderer pure lib | unit | unit | ✅ |
| T17, T18 | component | none | none | ✅ |
| T19, T20 | renderer pure lib | unit | unit | ✅ |
| T21, T22 | hook (+ prop chain) | none | none | ✅ |

## Requirement Coverage

| Requirement | Tasks |
| ----------- | ----- |
| PERF-01..03 | T5 |
| PERF-04..07 | T6, T7, T8 |
| PERF-08 | T10 |
| PERF-09 | T9, T10, T11, T12 |
| PERF-10 | T13, T14 |
| PERF-11 | T19 |
| PERF-12, PERF-13 | T20, T21, T22 |
| PERF-14 | T15, T16, T17, T18 |
| PERF-15 | T3, T4 |
| PERF-16 | T1, T2 |
| PERF-17 | T3, T4, T11, T12, T13 |
| PERF-18 | T1, T2, T3, T4 |
| PERF-19 | T23, T24, T25 |
| PERF-20 | T24, T25 |
| PERF-21 | T26, T27, T28 |
| PERF-22 | T29, T30 |

**Coverage:** 22 total, 22 mapped, 0 unmapped.
