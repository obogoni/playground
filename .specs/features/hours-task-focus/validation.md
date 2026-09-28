# Hours Task Focus Validation

## Validation: hours-task-focus — PASS

**Date**: 2026-09-26 (round 3, the last allowed)
**Spec**: `.specs/features/hours-task-focus/spec.md` (HTF-01..HTF-17 and four edge cases)
**Diff range**: feature `7d85337..30a804a`; fix round `9e1e7a1..30a804a` (`30a804a`, T16: smoke and spec)
**Verifier**: independent sub-agent, round 3 (author ≠ verifier), evidence-or-zero

The round-2 gap is closed. New smoke check 50 reads three things about the kept chip in the week
without its task: its total, its swatch role and its ×. The spec's edge case now quotes `0h00`, which is
what the legend renders (`formatHmCompact(0)`, `time-format.ts:24-27`). Round 2's survivor SM7 now fails
check 50, and so do four new mutants on the kept chip. Each of them fails only the check it targets. The
gates are green, and the smoke passes 52/52 on the unmodified tree.

---

## Round 1 (history)

Round 1 (`d3c63e1`, range `7d85337..2ebd99c`) was FAIL on test evidence. Every AC held in code, the
unit mutants were killed 14 of 14 and the smoke passed 48/48. But smoke mutant SM1, which removed the
leave and focus handlers, survived. That gave three gaps: leaving a header or a bar was never read
(HTF-08), focus on a bar had no check (HTF-09), and no check read the palette's hex values (HTF-01). T14
closed the three gaps, and T15 recorded the picked chip kept in a week without its task.

## Round 2 (history)

Round 2 (`9e1e7a1`, range `7d85337..7145093`) was FAIL on one minor gap. The round-1 gaps were closed:
the smoke mutants were killed 6 of 7, and the smoke passed 51/51. But the T15 edge case was checked only
for the chip's presence and label. SM7, which gave the kept chip `role: 'slot1'` and a 1 min total,
survived. The spec also quoted `0m`, while the legend renders `0h00`. T16 answered both.

---

## Round-2 Gap: Closure Evidence

| Part | Now covered by | Assertion | Falsified by |
| ---- | -------------- | --------- | ------------ |
| (a) kept chip's total, swatch and × | `scripts/smoke-hours-calendar.mjs:939` (check 50), on `away.pressed` read at `:924` in the week after the seeded one; `pressedChips()` at `:826` now collects `.hleg-total` text and the swatch's `role-*` class | `away.pressed.length === 1 && away.pressed[0].total === '0h00' && away.pressed[0].swatch === 'role-other' && away.pressed[0].clear` | SM7, SM8, SM9, SM10 and SM11 (below): each fails 50 |
| (b) spec literal | `spec.md:125`: "with a zero total, shown `0h00`, and its ×" | `formatHmCompact(ms)` is `` `${Math.floor(minutes / 60)}h${pad(minutes % 60)}` `` (`time-format.ts:24-27`), so 0 renders `0h00`; the clean run read `"total":"0h00"` | n/a (wording) |

Check 49 (`:929`) still asserts `away.pressed[0].label === taskA` on the same read, so check 50 does not
need to repeat the label. Check 50 also asserts `clear`, which round 2 found collected but unasserted.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T15 | ✅ Done | Unchanged since round 2. `git diff 9e1e7a1..HEAD --stat` touches only `spec.md`, `tasks.md` and `scripts/smoke-hours-calendar.mjs`, and `git log 9e1e7a1..HEAD -- src/` is empty |
| T16 | ✅ Done | Claim checked. The clean run gave 52/52. The kept chip painted slot 1 with a 1 min total (SM7) failed only 50. The 1 min total alone (SM8) also failed only 50 |

---

## Spec-Anchored Acceptance Criteria

The unit tests are in `src/renderer/src/lib/hours-calendar.test.ts`, which has not changed since
round 1. The smoke checks are in `scripts/smoke-hours-calendar.mjs`. The check numbers are the ones the
smoke prints, and 35–52 belong to this feature. T16 inserted one header line and check 50. As a result,
the smoke lines move by +1 before `:939` and by +9 after it. Every line below was re-read in round 3.

### P1: Same-day tasks never share a colour

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-01 eight colours, palette order, both themes | the 16 hex values, blue → red | `hours-calendar.test.ts:331` - eight tasks on one day get `['slot1',…,'slot8']`; smoke `:780` (38) - `offPalette.length === 0`, the computed colour of each of the first eight seeded bars `=== rgb(PALETTE[theme][i])` for `dark` and `light` | ✅ PASS |
| HTF-02 greedy by week total, ties by first start, first free slot among same-day tasks | the rule | `:284` - three tasks on one day take slots 1–3 in order of week time; `:300` - tasks on different days both take `slot1`; `:307` - a tie goes to the earlier first start; `:314` - a task skips the slots of every task sharing its days | ✅ PASS |
| HTF-03 ≤ 8 tasks on a day never share | pairwise distinct | `:331`; smoke `:740` (35) - `slotBars.length === 8 && slotColours.size === 8` | ✅ PASS |
| HTF-04 all eight held → Other | `other` | `:348` - `expect(colours.get('task:9')).toBe('other')` | ✅ PASS |
| HTF-05 legend, drawer and bars match | same computed colour | smoke `:750` (36) - `sunday.bars.length === 14 && sunday.bars.every((b) => b.chip === b.bg && b.row === b.bg)` | ✅ PASS |
| HTF-06 no change while the week is shown | frozen | `:394` - frozen roles kept while live time reorders the tasks | ✅ PASS |

### P1: Point at a task to find its bars

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-07 chip / header / bar → others 30%, pointed full | 0.3 vs 1 | `:504` - `dimmedGroups` while one group is hovered; `:513` - hover wins over the pick; smoke `:837` (39) - `allFull(rest) && onlyFull(chipHover, taskA)`; `:855` (41) - `onlyFull(rowHover, taskB) && onlyFull(barHover, taskC)` | ✅ PASS |
| HTF-08 leaving → previous opacity | back to the previous state | `:500`, `:509`; smoke `:844` (40) - `allFull(left)`; `:860` (42) - `allFull(rowLeft) && allFull(barLeft)` | ✅ PASS |
| HTF-09 keyboard focus on a chip or a bar → dims as on hover | same as hover | smoke `:871` (43) - `onlyFull(barFocus, taskB) && allFull(barBlurred)`; `:882` (44) - `onlyFull(chipFocus, taskD) && allFull(blurred)` | ✅ PASS |

### P1: Show only one task's days

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-10 click a chip → only its days, others dimmed | columns filtered, others 0.3 | `:487` - only the selected task's days are kept; smoke `:899` (45) - `pickedHeads.length === 1 && pickedHeads[0].startsWith(seedHeader)`; `:909` (47) - `onlyFull(picked, taskA)` | ✅ PASS |
| HTF-11 selected chip shows selected with × | `aria-pressed`, × | smoke `:904` (46) - `pressed.length === 1 && pressed[0].label === taskA && pressed[0].clear`; in a week without the task, `:939` (50) - `away.pressed[0].clear` | ✅ PASS |
| HTF-12 second click or × → every column | all columns | `:483` - `visibleColumns(cols, null)` keeps every column; smoke `:959` (51) - 6 heads after the ×, none pressed, `allFull`; 1 after a pick; 6 after a second click | ✅ PASS |
| HTF-13 pick survives ◀ ▶; empty week says `No time for <label> this week.` | exact text | `:496`; smoke `:929` (49) - `away.empty.includes(`No time for ${taskA} this week.`) && !away.grid && away.pressed[0].label === taskA`, and the Sunday alone on return; `:939` (50) - the kept chip at `0h00`, `role-other`, with its × | ✅ PASS |
| HTF-14 open drawer's day filtered out → drawer closes | no drawer | smoke `:914` (48) - `openOnMonday && !(await drawerOpen()) && (await pressedLabel()) === null` | ✅ PASS |
| HTF-15 pick or clear never changes a colour | colours equal rest | `:517` - colour map and day objects unchanged; smoke `:969` (52) - eight snapshots all `sameColours(list, palette)` and `palette.size === 14` | ✅ PASS |

### P2: The colour checks become automatic

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-16 8 distinct + 6 Other on the seeded Sunday | 8 + 6 | smoke `:740` (35) - `slotBars.length === 8 && slotColours.size === 8 && otherBars.length === 6` | ✅ PASS |
| HTF-17 summary reads `14 tasks` | `14 tasks` | smoke `:755` (37) - `sunday.count === '14 tasks · 14 blocks'` | ✅ PASS |

**Status**: all 17 ACs are covered and match the spec outcome. There are no spec-precision gaps.

---

## Edge Cases

- [x] A task that first appears while the week is shown stays Other: `hours-calendar.test.ts:402` - `expect(roleOf(frozen, 'task:6')).toBe('other')`
- [x] A picked task-less folder filters the same way: `:492` - only the folder's days are kept; `:505` - hovering a folder dims both tasks
- [x] A week of folders only assigns no slot: `:356` - `expect([...colours.values()]).toEqual(['no-task', 'no-task'])`
- [x] The picked chip in a week without its task stays selected, at `0h00`, with the neutral swatch and its ×: smoke `:939` (50), which SM7–SM11 falsify. The spec wording (`spec.md:125`) matches the rendered `0h00`

---

## Discrimination Sensor

The unit layer has not changed since round 1, when its mutants were killed 14 of 14. Round 2's smoke
mutants SM1–SM6 were killed against code that has not changed since. Round 3 therefore ran the fix
round's surface: the kept chip.

**Method.** The real tree was changed only through `.orig` copies, which were restored in a `finally`
and compared byte for byte (`identical=True` for every mutant). After each write and each restore there
was a 4 s pause for the renderer to hot-reload, and the smoke's own `Page.reload` loads the current
files. The app ran on seeded throwaway data (`--user-data-dir` under `%TEMP%`, CDP port 9222) with the
anti-throttling flags. `git status --porcelain` was empty before the sensor and after every mutant.

| # | File:line | Mutation | Origin | Killed? (failing checks) |
| - | --------- | -------- | ------ | ------------------------ |
| SM7 | `HoursView.tsx:151-152` | kept chip `role: 'slot1'`, `totalMs: 60_000` | round 2's survivor | ✅ Killed (50), 51/52; read `"total":"0h01","swatch":"role-slot1"` |
| SM8 | `HoursView.tsx:152` | kept chip `totalMs: 60_000` alone | new (the author's claim) | ✅ Killed (50), 51/52; read `"total":"0h01"` |
| SM9 | `HoursLegend.tsx:56` | × rendered only when `e.totalMs > 0`, which drops it on the kept chip only | new | ✅ Killed (50), 51/52; read `"clear":false` |
| SM10 | `HoursLegend.tsx:49` | `aria-pressed={picked && e.totalMs > 0}`, so the kept chip is not shown selected | new | ✅ Killed (49, 50), 50/52; read `[]` |
| SM11 | `HoursView.tsx:151` | kept chip `role: 'no-task'`, the folder outline | new | ✅ Killed (50), 51/52; read `"swatch":"role-no-task"` |

SM9 and SM10 only change zero-total chips, and the kept chip is the only zero-total chip. The other
checks for the ×, including the × click at `:947` in the seeded week, passed in the same runs. The kill
therefore comes from the edge case and not from breaking the × everywhere.

**Sensor depth**: expanded (5 smoke mutants this round; 6 smoke mutants from round 2 and 14 unit
mutants from round 1, on unchanged code).
**Sensor verdict**: 5 of 5 killed. PASS.

### Isolation

After the sensor and the clean run, `git status --porcelain` was empty and no `.orig` file remained.
The clean run closed the app and deleted the seed directory and `%TEMP%\playground-smoke-hours.last`.
Afterwards no electron process was running, and no `playground-smoke-hours*` entry was left in `%TEMP%`.
A single seed and a single app launch served all five mutants and the clean run. Each mutant run failed,
so the app stayed up until the clean run passed.

---

## Smoke Evidence

- The clean run on the unmodified tree, after the sensor, passed **52/52 checks**, 0 FAIL. It printed
  `App closed; deleted …playground-smoke-hours-1790459863356 and …playground-smoke-hours.last`. Check 50
  read `[{"label":"Task #9101 Fix login redirect","total":"0h00","swatch":"role-other","clear":true}]`.
- The author's claim in the T16 `**Done**` note holds. The clean run gave 52/52, the slot-1 chip failed
  only 50, and the 1 min total alone failed only 50.

---

## Gate Check

- **Typecheck**: `npm run typecheck` exited 0
- **Lint**: `npm run lint` exited 0 with **0 errors and 18 warnings**, the baseline. None of the warnings is in a feature file
- **Unit**: `npx vitest run` gave **1704 passed** (91 files), 0 failed, 0 skipped
- **Test count before feature**: 1691; **after**: 1704; **delta**: +13, unchanged since round 1. The smoke went from 48 checks to 52 over the fix rounds

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ T16 adds two fields to one probe, one check and one header line |
| Surgical changes | ✅ `30a804a` touches only the smoke, `spec.md` and `tasks.md` |
| No scope creep | ✅ |
| Matches patterns | ✅ Check 50 reuses `pressedChips()` and the `away` read of check 49 |
| Spec-anchored outcome check | ✅ 17/17 ACs, and edge case 4 now matches the rendered `0h00` |
| Per-layer coverage | ✅ Domain ACs have unit tests; component behaviour is in the smoke, per `.specs/codebase/TESTING.md` |
| Every test maps to a requirement | ✅ The smoke header (`:33-44`) names HTF-07..15 for section 12, including the kept chip |
| Documented guidelines | ✅ `.specs/codebase/TESTING.md` |

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HTF-01..HTF-17 | Verified / Implemented | ✅ Verified |
| Edge case 4 (T15, T16) | ❌ Needs a check and a wording fix | ✅ Verified (check 50; SM7–SM11 killed) |

---

## Summary

**Overall**: ✅ Ready.

**Spec-anchored check**: 17 of 17 ACs match the spec outcome, with 0 spec-precision gaps. All four edge cases are covered.
**Sensor**: 5 of 5 killed this round. Round 2 killed 6 of 7 (its survivor, SM7, is now killed), and round 1 killed 14 of 14 unit mutants.
**Gate**: 1704 passed, typecheck clean, lint 0 errors and 18 warnings, smoke 52/52.

**What works**: in a week without its task, the picked chip stays selected at `0h00`, with the neutral
swatch and its ×. A change to any of those, or to the chip's pressed state, fails the smoke.

**Next steps**: none from validation.
