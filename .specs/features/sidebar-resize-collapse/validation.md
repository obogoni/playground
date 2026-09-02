# Sidebar & Tasks Pane Resize/Collapse Validation

**Date**: 2026-08-31
**Spec**: `.specs/features/sidebar-resize-collapse/spec.md`
**Diff range**: `cafb43f..HEAD` (branch `feature/sidebar-resize-collapse`, 6 commits, 12 files)
**Verifier**: independent sub-agent (author ≠ verifier)
**Re-verification**: 2026-08-31, HEAD `2e0e6cc` — closes Fix 1 (sensor re-check of surviving mutant 322→300, now killed); verdict flips FAIL → PASS

---

## Task Completion

| Task | Status     | Notes |
| ---- | ---------- | ----- |
| T1   | ✅ Done    | `src/shared/config.ts` — 4 optional fields; commit `8b3d2b2` matches tasks.md message |
| T2   | ✅ Done    | `pane-layout.ts` + `pane-layout.test.ts` (12 tests, commit `bbc1867`; +1 pin test in commit `2e0e6cc` = 13) |
| T3   | ✅ Done    | `ResizablePane.tsx` + `ResizablePane.css`; commit `53d2174` |
| T4   | ✅ Done    | `Sidebar.tsx` + `Sidebar.css`; commit `9d170bf` |
| T5   | ✅ Done    | `TasksPane.tsx` + `TasksPane.css`; commit `37b5056` |
| T6   | ✅ Done    | `App.tsx`; commit `3c4b2b5` |

All 6 tasks marked `✅ Complete` in tasks.md; all 6 commit messages match the task bodies exactly. No blocked/partial tasks.

---

## Spec-Anchored Acceptance Criteria

Renderer React components are intentionally unit-untested per repo convention (`.specs/codebase/TESTING.md` §"What is deliberately NOT unit-tested": renderer components verified via CDP smoke + visual pass). Component-only ACs below are marked **component-verified** with implementation `file:line`.

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| PANE-01: sidebar renders 230px when no custom width persisted | 230px | `src/renderer/src/lib/pane-layout.test.ts:37` — `expect(resolvePaneWidth(undefined, SIDEBAR_BOUNDS, SIDEBAR_DEFAULT_WIDTH)).toBe(SIDEBAR_DEFAULT_WIDTH)`; `:64` — `expect(SIDEBAR_DEFAULT_WIDTH).toBe(230)`. Component: `Sidebar.tsx:51` `resolvePaneWidth(width, SIDEBAR_BOUNDS, SIDEBAR_DEFAULT_WIDTH)`; `App.tsx:233` | ✅ PASS |
| PANE-02: drag sidebar right-edge → resize clamped to [170, 420] | clamp to [170, 420] | `pane-layout.test.ts:23` — `expect(clampPaneWidth(SIDEBAR_BOUNDS.min, SIDEBAR_BOUNDS)).toBe(SIDEBAR_BOUNDS.min)` (and max); `:30` — mid-range `toBe(230)`; `:68` — `expect(SIDEBAR_BOUNDS).toEqual({ min: 170, max: 420 })`. Component: `ResizablePane.tsx:48` — `onWidthChange(clampPaneWidth(startWidth + delta, bounds))`; `Sidebar.tsx:74-78` passes `SIDEBAR_BOUNDS` | ✅ PASS |
| PANE-03: click collapse chevron → 36px rail with only expand chevron | rail = 36px | `pane-layout.test.ts:60` — `expect(RAIL_WIDTH).toBe(36)`. Component: `ResizablePane.tsx:64` `flexBasis: collapsed ? RAIL_WIDTH : width`; `:69-78` — collapsed branch renders only the rail `<button>` with chevron Icon; `Sidebar.tsx:95-104` collapse toggle in header | ✅ PASS |
| PANE-04: expand collapsed sidebar → restore pre-collapse width | previous width | Component-verified: width state is never zeroed on collapse — `App.tsx:270-271` toggles only `sidebarCollapsed`; on expand `ResizablePane.tsx:64` re-applies the same `width` (`flexBasis: collapsed ? RAIL_WIDTH : width`) | ✅ PASS (component-verified) |
| PANE-05: double-click sidebar handle → toggle collapse | toggle | Component-verified: `ResizablePane.tsx:86` — `onDoubleClick={onToggleCollapsed}` | ✅ PASS (component-verified) |
| PANE-06: sidebar width/collapse change → persist via `config:patch` | `config:patch` | Component-verified: `App.tsx:270-271` — `onWidthChange={(w) => update({ sidebarWidth: w })}`, `onToggleCollapsed={() => update({ sidebarCollapsed: !sidebarCollapsed })}`; `App.tsx:85-88` — `update()` invokes `api.invoke('config:patch', { ui: patch })` (existing pattern, matches assumption "persist failure logged, non-blocking": `.catch(console.error)`) | ✅ PASS (component-verified) |
| PANE-07: collapsed sidebar → tree NOT rendered | tree hidden | Component-verified: `ResizablePane.tsx:69` — `{collapsed ? (<rail button>) : (<>{children}</>)}` — children (the workspace tree) are rendered only in the expanded branch | ✅ PASS (component-verified) |
| PANE-08: drag tasks pane left-edge → resize clamped to [260, 460] | clamp to [260, 460] | `pane-layout.test.ts:26-27` — `expect(clampPaneWidth(TASKS_BOUNDS.min, TASKS_BOUNDS)).toBe(TASKS_BOUNDS.min)` (and max); `:72` — `expect(TASKS_BOUNDS).toEqual({ min: 260, max: 460 })`. Component: `TasksPane.tsx:70-74` `side="left"`, `bounds={TASKS_BOUNDS}`; delta sign inverted for left edge at `ResizablePane.tsx:47` | ✅ PASS |
| PANE-09: tasks pane collapse → 36px rail, expand back to previous width | rail = 36px, restore | `pane-layout.test.ts:60` — `expect(RAIL_WIDTH).toBe(36)`. Component: `TasksPane.tsx:86-95` header collapse toggle; restore-identical-to-PANE-04 mechanism (`App.tsx:299-300` toggles only `tasksCollapsed`, width preserved) | ✅ PASS |
| PANE-10: tasks pane width/collapse change → persist via `config:patch` | `config:patch` | Component-verified: `App.tsx:299-300` — `onWidthChange={(w) => update({ tasksWidth: w })}`, `onToggleCollapsed={() => update({ tasksCollapsed: !tasksCollapsed })}` → `update()` → `config:patch` (`App.tsx:85-88`) | ✅ PASS (component-verified) |
| PANE-11: persisted width outside [min, max] → clamp on load | clamp on load | `pane-layout.test.ts:49` — `expect(resolvePaneWidth(50, SIDEBAR_BOUNDS, SIDEBAR_DEFAULT_WIDTH)).toBe(SIDEBAR_BOUNDS.min)`; `:53` — `expect(resolvePaneWidth(800, SIDEBAR_BOUNDS, SIDEBAR_DEFAULT_WIDTH)).toBe(SIDEBAR_BOUNDS.max)` (and tasks `TASKS_BOUNDS.max`); plus clamp-direction tests `:13-21` | ✅ PASS |
| PANE-12: window too narrow → panes shrink toward minimums, no overflow of detail column | shrink to min-widths | Component-verified: `ResizablePane.tsx:65` — `minWidth: collapsed ? RAIL_WIDTH : bounds.min`; `ResizablePane.css:9` — `flex: 0 1 auto` (shrinkable); detail column is the shrink absorber: `WorktreeDetail.css:4-5` — `flex: 1; min-width: 0`; `Sidebar.css:4-5` / `TasksPane.css:4-5` — inner `flex: 1; min-width: 0` | ✅ PASS (component-verified) |
| PANE-13: restart with no persisted width → default applies | default (230 / 322) | `pane-layout.test.ts:37-42` — `resolvePaneWidth(undefined, ...)` returns the fallback; `:44` in-bounds persisted value passes through. Component: `App.tsx:233-236` resolves both panes from `config.ui` with defaults; optional fields keep old configs valid (`config.ts:40-47`) | ✅ PASS |

**Status**: ✅ All 13 ACs covered — 7 with unit-test evidence, 6 component-verified per repo convention. **0 spec-precision gaps** (every AC outcome in the spec is a precise value and is either asserted literally or verified in code).

---

## Discrimination Sensor

Scratch: `git worktree add --detach D:\worktrees\pane-sensor HEAD` + `node_modules` junction to the real tree; mutations applied only to the scratch's copy of `src/renderer/src/lib/pane-layout.ts`; test run: `npx vitest run src/renderer/src/lib/pane-layout.test.ts` (workdir = scratch). Real tree porcelain verified empty before and after (baseline `git status --porcelain` = empty; after cleanup = empty — sensor run valid).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 1 | `pane-layout.ts:18` | Flipped clamp direction `Math.min(max, Math.max(min, v))` → `Math.max(max, Math.min(min, v))` | ✅ Killed (5 failed, 7 passed) |
| 2 | `pane-layout.ts:27` | `resolvePaneWidth` ignores the fallback, always clamps (`saved === undefined ? fallback : clamp(...)` → `clamp(saved ?? 0, ...)`) | ✅ Killed (1 failed, 11 passed) |
| 3 | `pane-layout.ts:9` | `RAIL_WIDTH` 36 → 40 | ✅ Killed (1 failed, 11 passed) |
| 4 (extra probe) | `pane-layout.ts:14` | `TASKS_DEFAULT_WIDTH` 322 → 300 | ❌ **Survived** (12 passed) — the only test touching it (`pane-layout.test.ts:41`) asserts the constant against itself: `expect(resolvePaneWidth(undefined, TASKS_BOUNDS, TASKS_DEFAULT_WIDTH)).toBe(TASKS_DEFAULT_WIDTH)` — any constant value passes. No literal `toBe(322)` exists (contrast `SIDEBAR_DEFAULT_WIDTH` pinned at `:65`, bounds pinned at `:69,73`, rail pinned at `:61`). Spec-derived value (322px, spec Problem Statement + tasks.md T2) is not pinned by any test |
| 4 re-check (after Fix 1, commit `2e0e6cc`) | `pane-layout.ts:14` | `TASKS_DEFAULT_WIDTH` 322 → 300 (same mutation, fresh scratch `D:\worktrees\pane-sensor-2` at `HEAD` = `2e0e6cc`) | ✅ **Killed** (1 failed, 12 passed) — the new pin test at `pane-layout.test.ts:69` (`expect(TASKS_DEFAULT_WIDTH).toBe(322)`) failed with `expected 300 to be 322`; the surviving mutant no longer survives. Scratch discarded after run; real tree `src/` clean before/after (only working-tree entries are this report and the lessons artifacts, no code changes) |

**Sensor depth**: lightweight (default) + 1 extra probe + 1 re-check of the surviving probe
**Result**: 4/4 killed — ✅ PASS: the surviving mutant is now killed by the literal pin test added in commit `2e0e6cc` (test-strength gap closed; behavior unchanged).

---

## Interactive UAT Results

Not performed — feature is user-facing (drag/collapse interaction), but the Verifier contract for this run is read-only automated validation; the spec's Independent Tests (restart persistence, drag feel) remain manual UAT items for the orchestrator/human. Flagged as a manual-UAT follow-up, not a gap.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ `pane-layout.ts` = 28 lines; 3 new/mutated files per component; no dead branches in lib |
| Surgical changes | ✅ Diff touches only the 6 task-mapped files + 3 CSS + 2 spec docs; `Sidebar.tsx`/`TasksPane.tsx` diffs are pure re-wrapping (JSX moved verbatim into `ResizablePane` children) + 4 optional props + header toggle button |
| No scope creep | ✅ No unrelated refactors; existing menu/dialog/pin logic untouched (diff shows verbatim moves) |
| Matches patterns | ✅ Follows `.specs/codebase/TESTING.md`: pure-logic seam unit-tested co-located (`pane-layout.test.ts` ↔ `pane-layout.ts`, no mocking lib), renderer components convention-untested; `config:patch` reuse of `update()` per spec assumption; CSS reuses `--panel`, `--border`, `pane-header` vars; chevron reuse per `Icon.tsx` |
| Spec-anchored outcome check (asserted values match spec) | ✅ Literal values: 230, 36, {170,420}, {260,460} all pinned; `TASKS_DEFAULT_WIDTH` (322) pinned at `pane-layout.test.ts:69` (commit `2e0e6cc`) — the previous self-referential exception is closed |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ Lib layer: 12 tests ↔ PANE-01, 02, 03, 08, 09, 11, 13 + all 3 edge cases; components per TESTING.md convention |
| Every test maps to a spec requirement - no unclaimed tests | ✅ All 12 tests cite PANE ids; no orphan tests |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md` (co-location, renderer convention), `README.md` Development section, tasks.md gate matrix |
| Spot-check non-shallow tests | ✅ Tests assert concrete values (`toBe(230)`, `toEqual({ min: 170, max: 420 })`, `toBe(SIDEBAR_BOUNDS.max)`) — not call counts or implementation detail |

**Observations (non-blocking)**: `.dragging` class is toggled (`ResizablePane.tsx:36,44,54`) but no CSS rule consumes it — inert state, harmless.

---

## Edge Cases

- [x] Edge case 1 (persisted width outside [min, max] → clamp on load): `pane-layout.test.ts:49-56` — low clamps to `min`, high clamps to `max`, both panes
- [x] Edge case 2 (window too narrow → shrink to minimums instead of overflowing detail column): `ResizablePane.tsx:65` `minWidth: bounds.min` + `ResizablePane.css:9` `flex: 0 1 auto`; detail column absorbs remaining shrink (`WorktreeDetail.css:4-5` `flex: 1; min-width: 0`) — component-verified
- [x] Edge case 3 (restart with no persisted width → default applies): `pane-layout.test.ts:37-42` + `App.tsx:233-236` — optional config fields (forward-compatible, `config.ts:40-47`)

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (tasks.md Full gate)
- **Result (re-verified 2026-08-31)**: typecheck ✅ (0 errors) · lint ✅ (0 errors, 18 warnings — all pre-existing in `scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`; none in changed files) · test ✅ **631 passed, 0 failed, 0 skipped** (41 test files, 107s)
- **Test count before feature**: 618
- **Test count after feature**: 630 (+12 — `pane-layout.test.ts` original 12 `it` blocks)
- **After Fix 1 (commit `2e0e6cc`)**: 631 — +1 = the literal pin test `exposes the tasks pane default width (PANE-08)`; no other test file touched
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans (if issues found)

### Fix 1: Pin the spec-derived tasks default width with a literal assertion

- **Root cause**: `pane-layout.test.ts:41` is self-referential — `expect(resolvePaneWidth(undefined, TASKS_BOUNDS, TASKS_DEFAULT_WIDTH)).toBe(TASKS_DEFAULT_WIDTH)` passes for any constant value; the spec-derived 322px default is never literally asserted (the sensor probe changed it to 300 and all 12 tests still passed).
- **Fix task**: In `pane-layout.test.ts` "pane layout constants" block, add `it('exposes the tasks pane default width (PANE-08)')` → `expect(TASKS_DEFAULT_WIDTH).toBe(322)` (mirroring the existing `SIDEBAR_DEFAULT_WIDTH` pin at line 64-66). Verify: `npm test` — 631 passed.
- **Priority**: Minor (test-strength gap; no runtime behavior bug — 322 flows correctly through `TasksPane.tsx:41`/`App.tsx:235`)
- **Status**: ✅ **Applied** — commit `2e0e6cc` ("test(ui): pin the tasks pane default width constant") adds the pin at `pane-layout.test.ts:68-70`. Re-verified: pin test passes on the real tree (13/13) and the 322→300 mutant is killed in scratch (re-check row above).

---

## Requirement Traceability Update

Statuses below are the intended transitions for spec.md (report is the evidence artifact; spec.md itself is updated by the orchestrator when the fix task lands):

| Requirement | Previous Status | New Status   |
| ----------- | --------------- | ------------ |
| PANE-01..07 | Implementing    | ✅ Verified  |
| PANE-08     | Implementing    | ✅ Verified  |
| PANE-09..13 | Implementing    | ✅ Verified  |

PANE-08 fully verified: behavior + bounds pinned (`pane-layout.test.ts:26-27,76-77`) and the default-width constant now pinned literally (`pane-layout.test.ts:69`, commit `2e0e6cc`) — the Minor fix task is closed.

---

## Summary

**Overall**: ✅ **PASS** — 4/4 mutations killed; all 13 ACs verified; gate green at 631. The single Minor test-strength gap (Fix 1) is closed by commit `2e0e6cc` and re-verified by discrimination re-check.

**Spec-anchored check**: 13/13 ACs matched spec outcome | 0 spec-precision gaps
**Sensor**: 4/4 mutations killed — 0 survived (3 mandated + extra probe 322→300, re-checked post-fix: killed by the literal pin at `pane-layout.test.ts:69`)
**Gate**: 631 passed, 0 failed (typecheck + lint clean on changed files)

**What works**: All 13 ACs traced to evidence (7 unit-tested, 6 component-verified per TESTING.md convention); all 3 spec edge cases handled; gate green at 631/631 (+13 = 12 feature tests + 1 pin test, no deletions/skips); all 4 mutations killed; diff is surgical with no scope creep.

**Issues found**: 1 (Minor, closed): `TASKS_DEFAULT_WIDTH` (322) was asserted only against itself in `pane-layout.test.ts:41` — a change to the constant survived all tests. Fixed by commit `2e0e6cc` (literal `toBe(322)` at `pane-layout.test.ts:69`); re-check confirms the mutant 322→300 is now killed (1 failed, 12 passed in scratch).

**Next steps**: 1) Manual UAT of drag/collapse/restart persistence per spec Independent Tests (live app, `npm run dev` + CDP smoke not in CI) — the only remaining item, flagged as manual-UAT follow-up, not a gap; 2) orchestrator may sync spec.md PANE-01..13 to ✅ Verified.