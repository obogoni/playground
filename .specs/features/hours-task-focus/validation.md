# Hours Task Focus Validation

## Validation: hours-task-focus — FAIL

**Date**: 2026-09-26 (round 2)
**Spec**: `.specs/features/hours-task-focus/spec.md` (HTF-01..HTF-17 and four edge cases, the fourth added in T15)
**Diff range**: feature `7d85337..7145093`; fix round `d3c63e1..7145093` (`d12fe98` smoke T14, `7145093` spec T15)
**Verifier**: independent sub-agent, round 2 (author ≠ verifier), evidence-or-zero

The three round-1 gaps are closed, and the evidence for them is real. The round-1 mutant SM1 now fails
checks 42 and 43. Removing the bar's blur handler alone fails 43. Changing the dimmed opacity to 0.6
fails six checks, and moving dark slot 7 by one unit fails the palette check 38. The gates are green,
and the smoke passes 51/51 on the unmodified tree.

The verdict is FAIL because of one new gap, in the edge case that T15 added to the spec. The edge case
says what the picked chip shows in a week where its group has no time: a zero total, the neutral swatch
and its ×. No check reads any of the three. Mutant SM7 changed the chip to a `0h01` total and the slot-1
colour, and it survived 51/51. A CDP probe confirmed the mutant was live. The same edge case also gives
the total as `0m`, but the legend shows `0h00`. The behaviour itself is correct: the probe on the
unmodified tree read `0h00`, `role-other` and a ×. Both parts of the gap are small fixes, one in the
smoke and one in the spec wording.

---

## Round 1 (history)

Round 1 (`d3c63e1`, range `7d85337..2ebd99c`) was FAIL on test evidence. All ACs held in code, 14 of
14 unit mutants were killed and the smoke passed 48/48. But smoke mutant SM1 survived all 48 checks. SM1
removed the bars' `onMouseLeave`, `onFocus` and `onBlur` and the drawer header's `onMouseLeave`. Three
gaps followed: (1) HTF-08, leaving a header or a bar was never read; (2) HTF-09, focus on a bar had no
check; (3) HTF-01, no check read the palette's hex values or their order. There was also one spec note:
record the picked chip that stays in a week without its group. T14 answered the gaps and T15 the note.

---

## Round-1 Gaps: Closure Evidence

| Gap | Now covered by | Assertion | Falsified by |
| --- | -------------- | --------- | ------------ |
| 1 HTF-08 leave header / bar | `scripts/smoke-hours-calendar.mjs:859` (check 42), reads `rowLeft` at `:849` and `barLeft` at `:853`, each right after `pointAway()` and before the next source enters | `onlyFull(rowHover, taskB) && allFull(rowLeft) && onlyFull(barHover, taskC) && allFull(barLeft)`; `allFull` (`:829`) needs all 14 bars at `opacity === 1` | SM1 → 42 FAIL (`A0.3 ·1 ·0.3 / A0.3 ·0.3 ·1`); SM5 (header leave alone) → 42 FAIL |
| 2 HTF-09 focus on a bar | `smoke-hours-calendar.mjs:870` (check 43): `.focus()` on task B's bar, read, `document.activeElement.blur()`, read | `onlyFull(barFocus, taskB) && allFull(barBlurred)`; `onlyFull` (`:804`) needs 14 bars, the label present, its bars at 1 and the rest within 0.01 of 0.3 | SM1 → 43 FAIL; SM2 (bar `onBlur` alone) → 43 FAIL (`A0.3 ·1 ·0.3` after blur) |
| 3 HTF-01 exact palette | `smoke-hours-calendar.mjs:761-783` (check 38): sets `data-theme` to `dark` then `light`, reads the computed background of the seeded Sunday bars of `SEED_TITLES[0..7]`, then restores the shown theme | `offPalette.length === 0`, with `rgb(hex)` of the spec's 16 values compared in slot order for each theme | SM4 (dark slot 7 `#9085e9` → `#9085ea`) → 38 FAIL, `["dark",7,"rgb(144, 133, 233)","rgb(144, 133, 234)"]` |

Check 38 depends on the seed: `scripts/smoke-hours-calendar.mjs:230-233` gives all 14 tasks 20 minutes
each, starting at 08:00 + 20·i. So week totals tie, and the tie goes to the earlier start (HTF-02). The
first eight tasks therefore take slots 1–8 in seed order. The `PALETTE` literals at `:761-764` match the
spec's Assumptions row byte for byte, and so does `HoursCalendar.css:8-28`.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T13 | ✅ Done | Unchanged since round 1 (the fix round touches only the smoke and the specs) |
| T14 | ✅ Done | Claim checked: 51/51 on a clean run. SM1 fails 42 and 43, as claimed. The author did not run bar blur alone; round 2 did (SM2, killed) |
| T15 | ⚠️ Partial | The edge case is in the spec, but its `0m` does not match the legend's `0h00`, and no check covers the chip it describes (gap 1) |

---

## Spec-Anchored Acceptance Criteria

The unit tests are in `src/renderer/src/lib/hours-calendar.test.ts`, and the smoke checks are in
`scripts/smoke-hours-calendar.mjs`. The check numbers are the ones the smoke prints; 35–51 belong to
this feature. The fix round did not touch the unit file, and each line below was re-read in round 2.

### P1: Same-day tasks never share a colour

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-01 eight colours, palette order, both themes | the 16 hex values, blue → red | `hours-calendar.test.ts:331` - `expect([1..8].map(get)).toEqual(['slot1',…,'slot8'])`; smoke `:779` (38) - computed colour of each of the first eight seeded bars `=== rgb(PALETTE[theme][i])` for `dark` and `light` | ✅ PASS |
| HTF-02 greedy by week total, ties by first start, first free slot among same-day tasks | the rule | `:284` - `task:3` `slot1`, `task:1` (3.5 h over two days) `slot2`, `task:2` `slot3`; `:300` - different days both `slot1`; `:307` - `task:9` (earlier start) `slot1`; `:314` - `['slot1','slot2','slot3']` when each shares a day with two others | ✅ PASS |
| HTF-03 ≤ 8 tasks on a day never share | pairwise distinct | `:331` - `slot1..slot8`; smoke `:739` (35) - `slotBars.length === 8 && slotColours.size === 8` | ✅ PASS |
| HTF-04 all eight held → Other | `other` | `:345` - `expect(colours.get('task:9')).toBe('other')` with `task:8` → `slot8` | ✅ PASS |
| HTF-05 legend, drawer and bars match | same computed colour | smoke `:749` (36) - `sunday.bars.length === 14 && sunday.bars.every((b) => b.chip === b.bg && b.row === b.bg)` | ✅ PASS |
| HTF-06 no change while the week is shown | frozen | `:394` - frozen roles kept while live time reorders tasks, legend order `task:1, task:2, task:6, folder` against live totals | ✅ PASS |

### P1: Point at a task to find its bars

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-07 chip / header / bar → others 30%, pointed full | 0.3 vs 1 | `:504` - `dimmedGroups(r,'task:1',null)` equals `{task:2, FOLDER}`; `:513` - hover beats the pick; smoke `:836` (39) - `allFull(rest) && onlyFull(chipHover, taskA)`; `:854` (41) - `onlyFull(rowHover, taskB) && onlyFull(barHover, taskC)` | ✅ PASS |
| HTF-08 leaving → previous opacity | back to the previous state | `:500` - `dimmedGroups(r,null,null)` empty; `:509` - the pick alone dims (the previous state under a pick); smoke `:843` (40) - `allFull(left)` after the chip; `:859` (42) - `allFull(rowLeft) && allFull(barLeft)` | ✅ PASS (gap 1 of round 1 closed) |
| HTF-09 keyboard focus on a chip or a bar → dims as on hover | same as hover | smoke `:870` (43) - `onlyFull(barFocus, taskB) && allFull(barBlurred)`; `:881` (44) - `onlyFull(chipFocus, taskD) && allFull(blurred)` | ✅ PASS (gap 2 of round 1 closed) |

### P1: Show only one task's days

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-10 click a chip → only its days, others dimmed | columns filtered, others 0.3 | `:487` - `dates(visibleColumns(cols,'task:1'))` is `[14, 16]`; `:509`; smoke `:898` (45) - `pickedHeads.length === 1 && pickedHeads[0].startsWith(seedHeader)`; `:908` (47) - `onlyFull(picked, taskA)` | ✅ PASS |
| HTF-11 selected chip shows selected with × | `aria-pressed`, × | smoke `:903` (46) - `pressed.length === 1 && pressed[0].label === taskA && pressed[0].clear` | ✅ PASS |
| HTF-12 second click or × → every column | all columns | `:483` - `visibleColumns(cols, null)` equals `cols`; smoke `:950` (50) - 6 heads after ×, none pressed, `allFull`; 1 after a pick; 6 after a second click | ✅ PASS |
| HTF-13 pick survives ◀ ▶; empty week says `No time for <label> this week.` | exact text | `:496` - `visibleColumns(cols,'task:99')` is `[]`; smoke `:928` (49) - `away.empty.includes(`No time for ${taskA} this week.`) && !away.grid && away.pressed[0].label === taskA && backHeads` is the Sunday alone | ✅ PASS |
| HTF-14 open drawer's day filtered out → drawer closes | no drawer | smoke `:913` (48) - `openOnMonday && !(await drawerOpen()) && (await pressedLabel()) === null` | ✅ PASS |
| HTF-15 pick or clear never changes a colour | colours equal rest | `:517` - colour map and day objects unchanged; smoke `:960` (51) - eight snapshots, `barFocus` now among them, all `sameColours(list, palette)` and `palette.size === 14` | ✅ PASS |

### P2: The colour checks become automatic

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-16 8 distinct + 6 Other on the seeded Sunday | 8 + 6 | smoke `:739` (35) - `bars.length === 14 && slotBars.length === 8 && slotColours.size === 8 && otherBars.length === 6`, Other in one colour that no slot uses | ✅ PASS |
| HTF-17 summary reads `14 tasks` | `14 tasks` | smoke `:754` (37) - `sunday.count === '14 tasks · 14 blocks'` | ✅ PASS |

**Status**: all 17 ACs covered and matched to the spec outcome. The gap is in an edge case (below), not an AC.

---

## Edge Cases

- [x] A task first appearing while the week is shown stays Other: `hours-calendar.test.ts:401` - `expect(roleOf(frozen, 'task:6')).toBe('other')`
- [x] A picked task-less folder filters the same way: `:492` - `dates(visibleColumns(cols, FOLDER))` is `[17]`; `:505` - hovering a folder dims both tasks
- [x] A week of folders only assigns no slot: `:351` - `expect([...colours.values()]).toEqual(['no-task','no-task'])`
- [ ] **The picked chip in a week without its group (T15)**, which should stay with a zero total, the neutral swatch and its ×. The code does this (`HoursView.tsx:147-154`), and a probe read `{"total":"0h00","swatch":"hleg-swatch role-other","clear":true}` on the unmodified tree. But: (a) only its presence and label are asserted (`smoke-hours-calendar.mjs:928`, `away.pressed.length === 1 && away.pressed[0].label === taskA`), and `away.pressed[0].clear` is collected there but never asserted. Mutant SM7 survived. (b) The spec's literal `0m` does not match the legend's rendering, `0h00` (`formatHmCompact`, `HoursLegend.tsx:54`, as every other chip, e.g. `0h20`). ❌ Gap 1

---

## Discrimination Sensor

The unit layer is unchanged since round 1, which killed 14 of 14 unit mutants: the fix round changed no
unit test and no lib code. Round 2 therefore ran the smoke layer only.

Method: the real tree was changed only through `.orig` copies, restored in a `finally` and compared byte
for byte (`identical=True` for every file). A pause of about 4 s followed each write and each restore,
for the renderer to hot-reload, and the smoke's own `Page.reload` loads the current files. The app ran
on seeded throwaway data with the anti-throttling flags. Each killed mutant failed only the checks it
targets, and every other check passed in the same run, so the kills are not flaky noise.

| # | File:line | Mutation | Origin | Killed? (failing checks) |
| - | --------- | -------- | ------ | ------------------------ |
| SM1 | `HoursCalendar.tsx:203-206`, `HoursView.tsx:455` | bars keep only `onMouseEnter`; the header has no `onMouseLeave` | round 1's survivor | ✅ Killed (42, 43), 49/51 |
| SM2 | `HoursCalendar.tsx:206` | bar `onBlur` removed alone | new: the author did not run it | ✅ Killed (43), 50/51 |
| SM3 | `HoursCalendar.css:148` | `.hcal-bar.dimmed` opacity `0.3` → `0.6` | new | ✅ Killed (39, 41, 42, 43, 44, 47), 45/51 |
| SM4 | `HoursCalendar.css:16` | dark `--hcal-slot7` `#9085e9` → `#9085ea` (one unit) | new | ✅ Killed (38), 50/51 |
| SM5 | `HoursView.tsx:455` | drawer header `onMouseLeave` removed alone | new, alone (the author ran it only together with a palette swap) | ✅ Killed (42), 50/51 |
| SM6 | `HoursView.tsx:147` | the picked chip is not kept in a week without its group | new (T15 edge case) | ✅ Killed (49), 50/51 |
| SM7 | `HoursView.tsx:151-152` | the kept chip gets `role: 'slot1'`, `totalMs: 60_000` instead of `roleOf(...)`, `0` | new (T15 edge case) | ❌ Survived, 51/51 |

SM7 was checked to be live. With SM7 applied, a probe read the picked chip in the empty week as
`{"total":"0h01","swatch":"hleg-swatch role-slot1","bg":"rgb(57, 135, 229)"}`. On the unmodified tree the
same probe read `{"total":"0h00","swatch":"hleg-swatch role-other","bg":"rgb(111, 104, 92)"}`. The mutant
reached the screen, and no check saw it.

**Sensor depth**: expanded (7 smoke mutants; 14 unit mutants carried from round 1).
**Sensor verdict**: FAIL, 6 of 7 smoke mutants killed. SM7 survived.

### Isolation

`git status --porcelain` was empty before the sensor, after each of the 7 mutants and after the probe
run. No `.orig` file remains. The final clean run closed the app and deleted its seed directory and
`%TEMP%\playground-smoke-hours.last`. Afterwards no electron process was running, and no
`playground-smoke-hours-*` directory was left in `%TEMP%`. The SM7 smoke run passed, so it closed the
first app and deleted that seed. The probe and the clean run used a second seed, which the clean run
deleted.

---

## Smoke Evidence

- Clean run on the unmodified tree (second seed, `--user-data-dir` on it, CDP port 9222, anti-throttling
  flags): **51/51 checks passed**. `App closed; deleted …playground-smoke-hours-1790458989389 and
  …playground-smoke-hours.last`.
- The author's claim in the T14 `**Done**` note holds: 51/51 on a clean run, SM1 fails 42 and 43, the
  bar-focus mutant fails 43, and the header-leave mutant fails 42. The note says openly that bar blur
  was not run alone; SM2 now covers it.
- Reading the new checks: 42 reads each leave before the next enter, so an uncleared hover can no longer
  be overwritten, and it repeats `onlyFull` of the hovers so that an empty read cannot pass. Check 43 also
  proves the focus reached the bar: if `.focus()` missed, `onlyFull(barFocus, taskB)` fails. Check 38
  toggles `data-theme`, which `HoursCalendar.css:9,20` keys on, and restores the shown theme at `:773`.
  `App.tsx:247` always sets that attribute, so the value saved at `:766` is never `undefined`.

---

## Gate Check

- **Typecheck**: `npm run typecheck` exited 0
- **Lint**: `npm run lint` exited 0, **0 errors, 18 warnings**, the baseline. The warnings are in `scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs` and `src/shared/tasks.test.ts`, none of them feature files
- **Unit**: `npx vitest run` gave **1704 passed** (91 files), 0 failed, 0 skipped
- **Test count before feature**: 1691; **after**: 1704; **delta**: +13, unchanged since round 1 (the fix round adds smoke checks only: 48 → 51)

---

## Observations (not gaps)

- HTF-08 under a pick (hover, then leave, returns to the pick's dimming) is covered in the lib
  (`:509`, `:513`). No smoke check covers it, but the component only passes `null` on leave
  (`HoursView.tsx:139`), so there is no realistic mutant a unit test would miss.
- HTF-09 is exercised with a programmatic `.focus()`. Tab focus fires the same React `onFocus` handler.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ The fix round adds only smoke reads and one check block |
| Surgical changes | ✅ `d12fe98` touches only the smoke and `tasks.md`; `7145093` only the spec and `tasks.md` |
| No scope creep | ✅ |
| Matches patterns | ✅ The new checks reuse `bars`, `onlyFull`, `allFull`, `opacities` and `pointAway` |
| Spec-anchored outcome check | ⚠️ All 17 ACs match. The T15 edge case's `0m` does not match the UI's `0h00` (gap 1b) |
| Per-layer coverage | ✅ Domain ACs have unit tests; the component behaviour is in the smoke, per `.specs/codebase/TESTING.md` |
| Every test maps to a requirement | ✅ Section 11 and 12 checks name their HTF ids in the header comment (`:33-43`) |
| Documented guidelines | ✅ `.specs/codebase/TESTING.md` |

---

## Fix Plans

### Fix 1: Assert the picked chip in a week without its group. Priority: Minor

- **Root cause**: check 49 (`smoke-hours-calendar.mjs:928`) reads the kept chip's label only. `pressedChips()` (`:825`) does not collect the total or the swatch, and `away.pressed[0].clear` is collected but not asserted.
- **Fix task (smoke)**: collect `.hleg-total` text and the `.hleg-swatch` role class (or computed colour) for the pressed chip. In the away week, assert `total === '0h00'`, the swatch `role-other` (or its colour equal to an Other bar's colour from section 11), and `clear === true`.
- **Fix task (spec)**: change the edge case's `0m` to `0h00`, the legend's format, or describe it without a literal, for example "a zero total".
- **Done when**: SM7 (`HoursView.tsx:151-152` → `role: 'slot1'`, `totalMs: 60_000`) fails check 49, the clean run passes 51/51, and the spec literal matches the rendered text.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HTF-01 | Verified (T12, T13, T14 smoke) | ✅ Verified (check 38, SM4 killed) |
| HTF-02..HTF-06 | Implemented | ✅ Verified |
| HTF-07 | Verified (T13 smoke) | ✅ Verified |
| HTF-08 | Verified (T12, T13, T14 smoke) | ✅ Verified (check 42, SM1/SM5 killed) |
| HTF-09 | Verified (T12, T13, T14 smoke) | ✅ Verified (check 43, SM1/SM2 killed) |
| HTF-10..HTF-17 | Verified | ✅ Verified |
| Edge case 4 (T15) | new | ❌ Needs a check and a wording fix (fix 1) |

---

## Summary

**Overall**: ❌ Not ready, by one minor gap. All 17 ACs are covered and discriminating, and the round-1 gaps are closed.

**Spec-anchored check**: 17 of 17 ACs match the spec outcome. One spec-precision gap is in edge case 4 (`0m` against the rendered `0h00`).
**Sensor**: smoke 6 of 7 killed (SM7 survived); unit 14 of 14 (round 1, unchanged code).
**Gate**: 1704 passed, typecheck clean, lint 0 errors and 18 warnings, smoke 51/51.

**What works**: leaving every hover source and blurring every focus source restores the bars. The exact
palette in both themes is checked, and a one-unit change fails. A change to the dimming value fails six
checks. The picked chip is kept, and SM6 fails without it.

**Next steps**: fix 1 (one assertion block in check 49 and one word in the spec), then round 3.
