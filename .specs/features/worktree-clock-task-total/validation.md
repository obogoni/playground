# Worktree Clock Sums the Linked Task Validation

**Date**: 2026-10-31
**Spec**: `.specs/features/worktree-clock-task-total/spec.md` (issue #186)
**Diff range**: `main..HEAD` (2 commits: 5a2b7262 time-totals helpers + tests, a364e0f7 WorktreeDetail uses them)
**Verifier**: independent sub-agent (author ≠ verifier)

## Validation: worktree-clock-task-total — PASS

---

## Task Completion

No `tasks.md` (Small feature, executed inline). Both commits are present on the branch:

| Commit | Content | Status |
| ------ | ------- | ------ |
| 5a2b7262 | `worktreeClockMs`, `worktreeClockLive` in `src/renderer/src/lib/time-totals.ts:54-78`; 9 tests in `time-totals.test.ts:155-220` | ✅ Done |
| a364e0f7 | `WorktreeDetail.tsx:234-235` passes `linkedTaskId` to both helpers | ✅ Done |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 / WTCK-01: branch names a task → union of every period carrying the id, any folder | 1 h period for #12345 recorded in the workspace root (not the worktree folder) → 1 h | `time-totals.test.ts:160` - `expect(worktreeClockMs(s, WT, 12345, at(12))).toBe(HOUR)` | ✅ PASS |
| AC2 / WTCK-02: no task → union of periods in the worktree folder, case-insensitive | upper/lower-case variant of the folder counted (1 h); a period in another folder carrying the task ignored | `time-totals.test.ts:196` - `expect(worktreeClockMs(s, WT, null, at(12))).toBe(HOUR)` | ✅ PASS |
| AC3 / WTCK-03: open period carries the task → ticks live | open #12345 period in another folder → `true`; open period in the worktree folder on another task → `false` | `time-totals.test.ts:203` - `expect(worktreeClockLive(s, WT, 12345)).toBe(true)`; `:208` - `.toBe(false)` | ✅ PASS |
| AC4 / WTCK-04: no task and open period in the folder → ticks live | case-variant folder → `true`; open period elsewhere → `false` | `time-totals.test.ts:213` - `expect(worktreeClockLive(s, WT, null)).toBe(true)`; `:218` - `.toBe(false)` | ✅ PASS |
| AC5 / WTCK-05: counts periods already in the log, no recording change | existing `TimePeriod` fixtures summed as-is; diff touches no recording code (only `time-totals.ts`, its test, `WorktreeDetail.tsx`) | `time-totals.test.ts:160` (fixture is a plain recorded period) + diff surface `git diff --stat main..HEAD` | ✅ PASS |
| Live flag wiring in the page | `live` of the worktree `TotalClock` follows `worktreeClockLive` with the same `linkedTaskId` as `totalAt` | `WorktreeDetail.tsx:235` - `live={worktreeClockLive(time, worktree.path, linkedTaskId)}` (read; component layer has no unit tests per `.specs/codebase/TESTING.md`) | ✅ PASS (by reading) |
| Clock wiring in the page / Success Criterion "same time as the task card" | page clock = task card for a task branch | `WorktreeDetail.tsx:234` - `worktreeClockMs(time, worktree.path, linkedTaskId, now)`; card uses the same `taskTotalMs(time, task.id, now)` at `TasksPane.tsx:199`; `linkedTaskId` = `taskIdFromBranch(selected.worktree.branch)` at `App.tsx:520` (same id as the "Linked task" label). Author hand CDP check (author scratchpad): seeded worktree on `feature/9202-seed` read `02:00` = #9202 card `02:00`; mutating the call to pass `null` read `00:00` and failed the check | ✅ PASS |

**Status**: ✅ All ACs covered, outcomes match the spec. No spec-precision gaps.

---

## Edge Cases

- [x] Folder periods carrying another task or none are excluded when the branch names a task: `time-totals.test.ts:171` - `expect(worktreeClockMs(s, WT, 12345, at(13))).toBe(HOUR)` (3 h in the folder, 1 h on #12345)
- [x] Overlapping periods of the task count once: `time-totals.test.ts:181` - two sessions 09:00-10:00 and 09:30-10:00 → `toBe(HOUR)`
- [x] Linked task with no time shows `00:00`: `time-totals.test.ts:186` - `toBe(0)` (the folder holds 1 h of another task); `formatHm(0)` renders `00:00` (`TotalClock`, TIME-30)

---

## Discrimination Sensor

Run in a detached temporary `git worktree` with a `node_modules` junction; only `npx vitest run src/renderer/src/lib/time-totals.test.ts`. Unmutated baseline there: 21/21 passed.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M1 | `time-totals.ts:65` | Ignore `taskId`: always `worktreeTotalMs` | ✅ Killed (4 failed: lines 160, 171, 181, 186) |
| M2 | `time-totals.ts:65` | Task branch sums interval lengths instead of union | ✅ Killed (1 failed: overlap test, line 181) |
| M3 | `time-totals.ts:65` | Task branch counts task periods OR folder periods | ✅ Killed (2 failed: lines 171, 186) |
| M4 | `time-totals.ts:75-77` | `live` by folder even when a task exists | ✅ Killed (2 failed: lines 203, 208) |
| M5 | `time-totals.ts:75-77` | Case-sensitive folder match for `live` | ✅ Killed (1 failed: line 213) |

**Sensor depth**: lightweight (5 behavior-level mutants, one more than the default 1-3 to cover both helpers and both branches)
**Result**: 5/5 killed - PASS ✅
**Isolation**: real tree `git status --porcelain` identical to the pre-sensor baseline; junction link deleted before `git worktree remove --force` and `git worktree prune`; `npm ls --depth=0` reports nothing missing.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code (two thin helpers reusing `worktreeTotalMs` / `taskTotalMs`) | ✅ |
| Surgical changes (one import, two props in `WorktreeDetail.tsx`) | ✅ |
| No scope creep (recording, Hours view, rail clocks untouched) | ✅ |
| Matches patterns (pure seam in `lib/`, `describe(symbol)` → `it(behavior)`, existing fixtures) | ✅ |
| Spec-anchored outcome check | ✅ |
| Per-layer coverage: pure helpers have 1:1 AC mapping; component wiring hand-checked | ✅ |
| Every new test maps to an AC or edge case (WTCK ids in each title) | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md` (pure seam unit-tested, thin React shell hand-verified) | ✅ |

---

## Gate Check

- **Typecheck**: `npm run typecheck` - exit 0 (node + web)
- **Scoped tests**: `npx vitest run src/renderer/src/lib/time-totals.test.ts` - 21 passed, 0 failed, 0 skipped
- **Lint**: `npx eslint` on `time-totals.ts`, `time-totals.test.ts`, `WorktreeDetail.tsx` - exit 0
- **Full suite** (author run): 3010 passed
- **Test count in file before feature**: 12 (`main`)
- **Test count in file after feature**: 21
- **Delta**: +9 new tests, no tests removed or weakened
- **Skipped tests**: none
- **Failures**: none

---

## Follow-ups (non-blocking)

1. The `live` prop wiring (`WorktreeDetail.tsx:235`) is verified by reading only; the author's CDP check covers `totalAt` on a closed period, not a live tick. A future smoke could add an open #task period outside the worktree folder and assert the clock advances. Production code is correct; this is thin hand evidence for a one-line passthrough.
2. The author's hand evidence ran the falsification mutant in the real tree (restore from a `.orig` copy). The tree is clean now, but future smoke mutants should run in a scratch worktree as for unit mutants.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| WTCK-01 | Implementing | ✅ Verified |
| WTCK-02 | Implementing | ✅ Verified |
| WTCK-03 | Implementing | ✅ Verified |
| WTCK-04 | Implementing | ✅ Verified |
| WTCK-05 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 5/5 ACs and 3/3 edge cases matched the spec outcome; 0 spec-precision gaps
**Sensor**: 5/5 mutations killed
**Gate**: typecheck, lint and 21/21 scoped tests green; full suite 3010 passed (author)

**What works**: a worktree on a task branch shows the task's union total (same function as the task card); a worktree with no task keeps the case-insensitive folder total; the clock ticks for open periods on the task, or in the folder when there is no task.

**Issues found**: none blocking.

**Next steps**: record the follow-ups if wanted; open the PR.
