# Terminal Last Row Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/terminal-last-row/spec.md` (TROW-01..11)
**Design**: `.specs/features/terminal-last-row/design.md`
**Status**: Approved (owner, 2026-10-01)
**Branch**: `feature/terminal-last-row` (cut from `origin/main`)
**Test baseline**: **B** = 2508 (`npm test` on the branch rebased onto `origin/main` `6d96ae4`, 2026-10-03). Every "Test count" below is `B + N`, cumulative.
**Renderer amendment 2026-10-03 (owner)**: the smoke measures the WebGL renderer, as `design.md` §Renderer Amendment states. Where a task below says DOM rows or the last DOM row, read that section.
**Stop rule**: T1 measures the cause on the current build. If the measured cause differs from the model in `design.md` §Predicted Model, Execute stops after T1 and the plan goes back to the owner. T2 does not start.
**Owner decision 2026-10-01**: keep today's columns. Only the vertical axis changes: the pane takes `padding: 8px 0` and a `border-box` host takes `padding: 0 10px` (`design.md` §Verdict 2, TROW-11).
**Owner confirmed 2026-10-01** (spec Assumptions): spacing reading, height emulation, sweep size, display scale route, the fill script, as the plan proposed them.

**Smoke rules for every task that runs the app:**

- Launch only on a throwaway userData seeded by `node scripts/smoke-terminal-rows.mjs --seed`, with the line it prints (`--user-data-dir=<dir> --remote-debugging-port=9222 --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`).
- Never spawn or type into a registry agent. The only session is the seeded Ad-hoc fill script.
- Iterate with `SMOKE_ONLY=<section>`, on a fresh seed and a fresh launch each time. The full smoke runs once, in T5.
- Mutants go through the scratch mutant runner (`design.md` §Mutant runner). It lives in the OS temp folder, never in the repo. It asserts the anchor occurs exactly once, keeps `<file>.orig`, restores it in `finally`, and requires `git status --porcelain` unchanged afterwards.
- Screenshots go to the OS temp folder only.
- Repo files never get an absolute path under the user's profile, and skill scripts are written `<skill-dir>/scripts/...`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (renderer React components are verified by CDP smoke + visual pass; extracted pure helpers carry co-located unit tests; smoke scripts are manual only and never run in CI), `vitest.config.ts` (`src/**/*.test.ts`), AD-003 (coverage report-only), confirmed lessons L-001, L-005, L-009 (L-009 applies: the helper's query string is pinned with a literal, not rebuilt from the code's own constant).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Renderer pure helper (`src/renderer/src/lib/device-pixel-ratio.ts`) | unit | All branches; 1:1 to TROW-10 (arm, change, re-arm, dispose) and the TROW-09 callback; fractional ratio formatting | co-located `device-pixel-ratio.test.ts` | `npx vitest run src/renderer/src/lib/device-pixel-ratio.test.ts` |
| Renderer React component (`TerminalPane.tsx` / `.css`) | none | CDP smoke + visual pass (TESTING.md convention); layout has no honest unit test (owner decision) | - | build gate + `node scripts/smoke-terminal-rows.mjs` |
| CDP smoke script (`scripts/smoke-terminal-rows.mjs`) | manual only | Every check first seen failing on a broken build; guards against vacuous passes (`design.md` §Guards) | `scripts/smoke-terminal-rows.mjs` | `node scripts/smoke-terminal-rows.mjs` (live dev app) |
| Design / state docs | none | - (build gate only) | `.specs/**` | - |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npx vitest run src/renderer/src/lib/device-pixel-ratio.test.ts` |
| Full | Not used (no integration or e2e layer in scope) | - |
| Build | After every other task and at each phase end | `npm run typecheck && npm run lint && npm test` |
| Smoke (manual) | Tasks that change or run the smoke | `node scripts/smoke-terminal-rows.mjs --seed`, launch with the printed line, then `node scripts/smoke-terminal-rows.mjs` (with `SMOKE_ONLY=<section>` while iterating) |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Measure

The cause is measured on the current build before anything changes. The stop rule applies at the end of this phase.

```
T1
```

### Phase 2: Fix the rows

```
T1 → T2
```

### Phase 3: Display scale

```
T2 → T3 → T5
T4 → T5
```

---

## Task Breakdown

### T1: Measure the rows on the current build

**What**: The smoke's `--seed` and drive modes with the `rows`, `cols` and `look` sections, run in report mode on the unchanged build to measure the cause and record today's column baseline
**Where**: `scripts/smoke-terminal-rows.mjs` (new)
**Depends on**: None
**Reuses**: CDP helpers from `scripts/smoke-agent.mjs`; seed, pointer and refusal from `scripts/smoke-hours-calendar.mjs`; spawn, cleanup and viewport override from `scripts/smoke-status-bar.mjs`; `SMOKE_ONLY` from `scripts/smoke-files-diff.mjs`
**Requirement**: TROW-02, TROW-03, TROW-04, TROW-05, TROW-07, TROW-11

**Tools**:

- MCP: NONE
- Skill: `run`

**Done when**:

- [x] Setup: in the worktree, `npm ci --ignore-scripts`, then `node node_modules/electron/install.js`; `npm test` run once and its count written as **B** in this file's header
- [x] The script follows `design.md` §`scripts/smoke-terminal-rows.mjs`: `--seed` writes the throwaway userData, the fictional `rows-smoke` workspace and the fill script; the drive refuses any other data, spawns only the Ad-hoc fill session, and stops, removes and clears the override in `finally`
- [x] On the current build, `SMOKE_ONLY=rows` probes max(20, ⌈h⌉ + 3) consecutive heights at DPR 1 and 20 each at 1.25 and 1.5. The full table is appended to `design.md` under `## Measured (T1)`, including today's columns, the last column's right edge against the 14 px scrollbar lane, and `parent`, `addonModel` and `clipModel` per probe
- [x] Stop rule (`design.md` §Predicted Model) evaluated and its verdict written under the table. If any condition holds: STOP, report the table to the owner, and do not start T2
- [x] First seen failing, on the natural broken build (padding on the host): the rows-fit check fails at every probe with ⌊c⌋ mod h ≥ h − 16; the last-row check fails at every probe whose `clipModel` exceeds 0.5 px (1-8 px remainders at h = 17), and only there; the PTY check fails wherever the rows check does. A check that does not fail where the model says is a stop-rule finding
- [x] Column baseline recorded on the current build: `SMOKE_ONLY=cols SMOKE_BASELINE=write` writes `playground-smoke-rows-cols.json` to the OS temp folder (per `design.md` §Modes 4), and the counts are copied under `## Measured (T1)`. The last-column check (TROW-04) passes at every `rows` and `cols` probe; a probe where it fails is a stop-rule finding. The `cols` comparison (TROW-11) and TROW-04 cannot fail on the build that defines the baseline, so they are first seen failing in T2, under M7 and M8. The cols-changes guard passes at each DPR
- [x] Guards pass: remainder coverage 0..⌈h⌉−1 at DPR 1, 1 px steps, rows changes across the sweep and the marker follows it
- [x] `SMOKE_ONLY=look` passes on the current build (inset 8/10/8/10, origin (10, 8), chip right 14 / top 10, within 0.5 px), and fails under M2 (chip appended to `.xterm`) and M3 (pane padding `6px 10px`), each through the mutant runner (anchor count 1, `.orig` restored, porcelain unchanged)
- [x] `Browser.setWindowBounds` tried for 3 heights: if Electron accepts it, the readings match the emulated ones within 0.5 px; if it rejects it, the error is recorded under the table and emulation stands
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B tests pass (no silent deletions)

**Tests**: manual only
**Gate**: build

**Status**: ✅ Complete (2026-10-03). Stop rule: no condition holds (`design.md` §Measured (T1)). `Browser.setWindowBounds` cannot run under Electron (`Browser.getWindowForTarget` not found). The fill script reads the console size with `_refreshSize()`.

**Commit**: `test(smoke): measure terminal rows against the pane height`

---

### T2: Open the terminal into a host with no vertical padding

**What**: `TerminalPane` renders `.terminal-pane` (padding now `8px 0`) around a new `.terminal-host` (`padding: 0 10px`, `box-sizing: border-box`, no border, height from the pane). It passes the host to `term.open` and the ResizeObserver, and keeps the chip and every listener on the pane. Both rules live in `TerminalPane.css`
**Where**: `src/renderer/src/components/TerminalPane.tsx` (modify, with its stylesheet)
**Depends on**: T1
**Reuses**: `sendResize`, the existing cleanup block, `.terminal-pane` rules (`design.md` §TerminalPane)
**Requirement**: TROW-01, TROW-02, TROW-03, TROW-04, TROW-05, TROW-06, TROW-07, TROW-08, TROW-11

**Tools**:

- MCP: NONE
- Skill: `run`

**Done when**:

- [x] `term.open(host)` and `observer.observe(host)`; the chip, both capture `mousedown` listeners, `mouseup`, `contextmenu`, `dragover` and `drop` stay on the pane, with their removal unchanged (TROW-01)
- [x] `SMOKE_ONLY=rows` passes every probe at DPR 1, 1.25 and 1.5, guards included (TROW-02..05)
- [x] `SMOKE_ONLY=cols` passes: at every probed width and DPR the column count equals T1's baseline, and the last column is inside the visible box (TROW-11, TROW-04)
- [x] `SMOKE_ONLY=look` passes, and its readings equal T1's within 0.5 px (TROW-07)
- [x] M1 (host `padding: 8px 10px`) makes the `rows` checks fail again; M7 (host `content-box`) makes the TROW-11 comparison fail, its first-seen-failing run; M8 (host `padding: 0 10px 0 30px`) makes TROW-04 fail, its first-seen-failing run; M2 (chip on the host) and M3 (pane top padding 6 px) make `look` fail; each through the mutant runner
- [x] Hand check (TROW-08), with the pointer inside the left padding: right-click copies a Shift+drag selection and pastes on the next right-click; Ctrl+click on a printed path opens it; a file dropped from Explorer pastes its quoted path. Theme toggle recolours the terminal. Light and dark screenshots saved to the OS temp folder and looked at (partial: Ctrl+click left to the owner, see Status)
- [x] `git diff --stat` touches nothing under `src/main` or `src/preload` (TROW-06)
- [x] The AD-TBD text in `design.md` §Project-level decision is appended to `.specs/STATE.md` `## Decisions` as the next free AD number at that moment, and that number replaces `AD-TBD` in `design.md`
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B tests pass (no silent deletions)

**Tests**: none
**Gate**: build

**Status**: ✅ Complete (2026-10-03). `rows` 8/8 at 60 probes, `cols` 6/6 at 36 viewports (columns equal the T1 baseline), `look` 3/3 with T1's readings (inset 8/10/8/10, origin (10, 8), chip 14/10). Mutants: M1 fails TROW-02/03/05; M7 fails TROW-11 (115 vs 118 columns); M8 fails TROW-04 (10-16 px right); M3 fails the inset and origin checks. **M2 is equivalent on this build**: the host is not positioned, so a chip appended to it still takes the pane as its containing block and does not move; M2x (chip appended to `.xterm`, which is positioned) fails the chip check (right 24, top 18). Hand check TROW-08 driven over CDP on a `pwsh` session, pointer 4 px inside the left padding: right-click pastes the clipboard, right-click after a drag copies it and shows `Copiado`, a dropped file pastes its quoted path; the theme toggle recolours the pane; both screenshots looked at. **Ctrl+click on a printed path was not run**: it opens the file through the OS (`links:openPath`), so it is left to the owner's hand check; its capture listener is still on the pane, unchanged. AD-054 recorded.

**Commit**: `fix(terminal): size rows from the height the terminal really has`

---

### T3: Check rows after a display scale change

**What**: The smoke's `dpr` section: 8 fixed heights, each stepped through DPR 1 → 1.25 → 1.5 → 2 → 1 with the CSS height unchanged, its guards run first. It is seen failing on T2's build, which has no scale refit
**Where**: `scripts/smoke-terminal-rows.mjs` (modify)
**Depends on**: T2
**Reuses**: T1's probe and checks
**Requirement**: TROW-09, TROW-10

**Tools**:

- MCP: NONE
- Skill: `run`

**Done when**:

- [x] `SMOKE_ONLY=dpr` implemented per `design.md` §Sections; after each step it runs the `rows` checks with the newly measured h
- [x] The `dpr` guards run before any check: `window.devicePixelRatio` equals the factor, `matchMedia('(resolution: <dpr>dppx)').matches`, h differs between at least two factors, and at least one probe's expected rows change between factors
- [x] **Route A** (every guard passes): on T2's build, the section fails with stale rows at ≥1 step. That is its first-seen-failing run, on the natural broken build. The failing steps are written under `## Display scale route (T3)` in `design.md`
- [ ] ~~**Route B** (any guard fails)~~ not taken: every guard passed: the `dpr` section is removed from the script and replaced by `SMOKE_ONLY=probe`, which takes one reading at the app's real size and scale with no override and runs the `rows` checks on it. The failed guard and its readings are written under `## Display scale route (T3)`, and T5 takes its Route B
- [x] `SMOKE_ONLY=rows`, `SMOKE_ONLY=cols` and `SMOKE_ONLY=look` still pass on T2's build
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B tests pass (no silent deletions)

**Tests**: manual only
**Gate**: build

**Status**: ✅ Complete (2026-10-03), Route A (`design.md` §Display scale route (T3)). `rows` 8/8, `cols` 6/6, `look` 3/3 still pass on T2's build. The probe now also waits for an exact cell model and the requested ratio before it settles.

**Commit**: `test(smoke): check terminal rows after a display scale change`

---

### T4: Watch the display scale

**What**: `watchDevicePixelRatio(win, onChange)`: arms a `(resolution: <dpr>dppx)` query, re-arms it with the new ratio after each change, calls back with the new ratio, and returns a dispose function
**Where**: `src/renderer/src/lib/device-pixel-ratio.ts` (new, with its co-located test)
**Depends on**: None
**Reuses**: injected-fake pattern (TESTING.md pattern 3); re-arm technique of xterm's `ScreenDprMonitor`
**Requirement**: TROW-09, TROW-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] With a fake window at ratio 1, the armed query is exactly `'(resolution: 1dppx)'`, and at ratio 1.25 exactly `'(resolution: 1.25dppx)'` (literal strings, L-009)
- [x] A change to 1.5 calls `onChange` once with `1.5`, removes the listener from the old query and arms `'(resolution: 1.5dppx)'` (TROW-09)
- [x] Three successive changes (1.5, 2, 1) give three calls with those ratios in order, each from a freshly armed query (TROW-10 re-arm)
- [x] After dispose, the current query has no listener and a later change calls nothing; dispose after a change removes the re-armed listener, not the first one (TROW-10 dispose)
- [x] M5 (keep the first query after a change) and M6 (dispose removes nothing) each fail at least one test, run through the mutant runner
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/device-pixel-ratio.test.ts`
- [x] Test count: B + ≥5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Status**: ✅ Complete (2026-10-03). 5 tests in `device-pixel-ratio.test.ts`, with a fake window whose queries fire only when `matches` flips, as the browser's do. M5 (no re-arm) fails 2 tests and M6 (dispose removes nothing) fails 2, each through a scratch mutant script (anchor count 1, `.orig` restored, porcelain unchanged).

**Commit**: `feat(terminal): watch the display scale for changes`

---

### T5: Refit when the display scale changes

**What**: `TerminalPane` calls `watchDevicePixelRatio` after the observer is set up. On a change it schedules `sendResize` on the next animation frame, cancelling and replacing any pending frame. The cleanup disposes the watcher and cancels the frame
**Where**: `src/renderer/src/components/TerminalPane.tsx` (modify)
**Depends on**: T3, T4
**Reuses**: T4 `watchDevicePixelRatio`; `sendResize`
**Requirement**: TROW-09, TROW-10

**Tools**:

- MCP: NONE
- Skill: `run`

**Done when**:

- [x] Wiring and cleanup per `design.md` §TerminalPane (TROW-09, TROW-10 dispose)
- [x] **Route A**: `SMOKE_ONLY=dpr` passes every step at every height, the second and later steps included. M4 (no-op watcher call) makes it fail; M5 makes a step after the first fail
- [ ] ~~**Route B**~~ not taken (T3 Route A): with the fill session selected, change the Windows display scale 100% → 125% → 150% → 100% (Settings, Display, Scale). After each change, `SMOKE_ONLY=probe` passes and the `ROWS=<n> COLS=<m> LAST` line is fully visible. With M4 applied, the probe fails after at least one change
- [x] Switch to another session and back three times, then change the scale (Route A: one `dpr` step; Route B: one Windows change). The renderer console shows no error and the probe passes
- [x] Full smoke once, on a fresh seed and launch with no `SMOKE_ONLY`: every section passes, exit code 0; the summary line is written under this task
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B + ≥5 tests pass (no silent deletions)

**Tests**: none
**Gate**: build

**Status**: ✅ Complete (2026-10-03). Route A: `dpr` passes every step at every height. M4 (no-op watcher call) fails TROW-09 8/8 and TROW-10 14/24; M5 (no re-arm) fails TROW-09 8/8 and TROW-10 6/24. The session-switch item is part of the `dpr` section: after three switches a scale change refits the selected pane, schedules exactly one refit (M9, the pane not disposing its watcher, schedules 14) and logs no console error (M10, a `console.error` in the scale callback, fails it). Full smoke on a fresh seed and launch: `26/26 checks passed`, exit 0, app closed and seed deleted.

**Commit**: `fix(terminal): refit when the display scale changes`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1   (stop rule)
Phase 2:  T1 → T2
Phase 3:  T2 → T3 → T5
          T4 → T5
```

Execution is strictly sequential, in task-number order. 5 tasks fit one batch, so Execute runs inline with no batch sub-agents, then the Verifier runs.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Measure the rows | 1 script (two sections + seed) | ⚠️ Cohesive (one probe, read two ways) |
| T2: Host with no vertical padding | 1 component + its two stylesheet rules | ✅ Granular |
| T3: Display scale check | 1 script section | ✅ Granular |
| T4: Display scale watcher | 1 function | ✅ Granular |
| T5: Refit on scale change | 1 component change | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | none | ✅ Match |
| T2 | T1 | T1 → T2 (cross-phase, backward) | ✅ Match |
| T3 | T2 | T2 → T3 (cross-phase, backward) | ✅ Match |
| T4 | None | none | ✅ Match |
| T5 | T3, T4 | T3 → T5, T4 → T5 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | CDP smoke script | manual only | manual only | ✅ OK |
| T2 | Renderer React component (+ STATE.md decision row) | none | none | ✅ OK |
| T3 | CDP smoke script | manual only | manual only | ✅ OK |
| T4 | Renderer pure helper | unit | unit | ✅ OK |
| T5 | Renderer React component | none | none | ✅ OK |
