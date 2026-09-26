# Hours Task Focus Validation

## Validation: hours-task-focus — FAIL

**Date**: 2026-09-26
**Spec**: `.specs/features/hours-task-focus/spec.md` (HTF-01..HTF-17 and three edge cases)
**Diff range**: `7d85337..2ebd99c` (commits `e81bd2d`..`2ebd99c` on `feature/hours-task-focus`; the code lands in `41d4bb8`..`2ebd99c`)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero

The implementation reads correctly against every AC, all gates are green, 14 of 14 unit mutants are
killed and the smoke passes 48/48 on the unmodified tree. The verdict is FAIL because one smoke
mutant survived all 48 checks. It removed the leave and blur handlers of bars and drawer headers,
and the focus handler of bars. So part of HTF-08 and part of HTF-09 have no discriminating evidence.
Also, no check asserts the palette values that HTF-01 fixes. All three gaps are test gaps, not
behaviour defects: the code does what the spec says.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | 4 new tests, 4 rewritten; the rewrites follow the superseded top-three rule |
| T2 | ✅ Done | AD-045 in `.specs/STATE.md:54`, hex values match the spec byte for byte |
| T3–T5 | ✅ Done | `--hcal-slot4..8` in both themes; bar, legend and drawer swatch classes for slots 4–8 |
| T6 | ✅ Done | `visibleColumns`, `dimmedGroups`, 9 tests |
| T7–T10 | ✅ Done | Focus state in `HoursView`, chips as buttons, bars dim and report hover, headers report hover |
| T11 | ✅ Done | `.hcal-bar.dimmed { opacity: 0.3 }`, picked chip styles in `HoursLegend.css` |
| T12 | ✅ Done | Smoke checks 35–37 |
| T13 | ⚠️ Partial | Smoke checks 38–48 pass, but leave and blur are checked only from the chip, and focus only on the chip (gaps 1 and 2) |

---

## Spec-Anchored Acceptance Criteria

Smoke check numbers are the numbers the smoke prints (35–48 are the new ones). Unit tests are in
`src/renderer/src/lib/hours-calendar.test.ts`, and smoke checks are in `scripts/smoke-hours-calendar.mjs`.

### P1: Same-day tasks never share a colour

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-01 eight colours, palette order, both themes | 8 slots, blue → red, the exact light and dark hex values | `hours-calendar.test.ts:331` - `expect([1..8].map(get)).toEqual(['slot1',…,'slot8'])` (8 roles, in order); `smoke-hours-calendar.mjs:739` - `slotBars.length === 8 && slotColours.size === 8` (8 **distinct** computed colours). Hex values checked by reading only: `HoursCalendar.css:10-28` matches the spec's Assumptions row exactly | ⚠️ Gap 3: no check compares a computed colour with the spec's hex value, or checks slot order on screen. Swapping two `--hcal-slotN` values passes every test |
| HTF-02 greedy by week total, ties by first start, first free slot among same-day tasks | the colouring rule | `:284` - task 3 (4 h) `slot1`, task 1 (3.5 h across two days) `slot2`, task 2 `slot3`; `:300` - two tasks on different days both `slot1`; `:307` - tie goes to the earlier start (`task:9` `slot1`); `:314` - a task sharing a day with each of two others skips both slots (`['slot1','slot2','slot3']`) | ✅ PASS |
| HTF-03 ≤ 8 tasks on a day never share a colour | pairwise distinct | `:331` - 8 on one day take `slot1..slot8`; smoke `:739` - 8 distinct computed colours among the seeded Sunday's slot bars | ✅ PASS |
| HTF-04 all eight held by same-day tasks → Other | `other` | `:345` - `expect(colours.get('task:9')).toBe('other')` (with `task:8` → `slot8`) | ✅ PASS (only the case of eight on one day. Eight held across several days is the same code path and is not tested separately) |
| HTF-05 legend, drawer swatches and bars match | same computed colour | smoke `:749` - `sunday.bars.length === 14 && sunday.bars.every((b) => b.chip === b.bg && b.row === b.bg)`: computed colours, not class names, so a missing rule shows | ✅ PASS |
| HTF-06 colours never change while the week is shown | frozen map | `:394` (HCAL-24) - frozen roles held while live time reorders tasks, the new task `other`, and legend order `task:1, task:2` kept against live totals; smoke `:464` (pre-existing) - a running bar keeps its colour; `HoursView.tsx:117-124` freeze unchanged | ✅ PASS |

### P1: Point at a task to find its bars

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-07 pointer on chip / drawer header / bar → others 30%, pointed full | opacity 0.3 vs 1 | `:504` - `dimmedGroups(r,'task:1',null)` equals `{task:2, folder}`; `:513` hover beats the selection; smoke `:811` - `allFull(rest) && onlyFull(chipHover, taskA)` where `onlyFull` (`:778`) needs all 14 bars, the label present, the label's bars at `opacity === 1` and the rest within 0.01 of 0.3; smoke `:825` - the same for a drawer header (`taskB`) and a bar (`taskC`) | ✅ PASS |
| HTF-08 pointer leaves → previous opacity | back to the previous state | `:500` - `dimmedGroups(r,null,null)` is empty; `:509` - selection alone dims (the "previous" state under a pick); smoke `:817` - `allFull(left)` after leaving the **chip**. No check reads the bars after leaving a **drawer header** or a **bar**: at `:818-824` the next source's enter overwrites a hover that never cleared | ❌ Gap 1: smoke mutant SM1 survived |
| HTF-09 keyboard focus on a chip or a bar → dims as on hover | same as hover | smoke `:836` - `onlyFull(chipFocus, taskD) && allFull(blurred)`: **chip** only. No check focuses a bar (the smoke's only `.focus()` calls are `:628`, a period field, and `:829`, a chip) | ❌ Gap 2: bar focus has no evidence; SM1 removed it and survived |

### P1: Show only one task's days

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-10 click a chip → only its days, others dimmed | columns filtered, others 0.3 | `:487` - `dates(visibleColumns(cols,'task:1'))` is `[14, 16]`; `:509` - the selection dims every other group; smoke `:853` - one head, the seeded Sunday (and `:905` shows 6 heads before and after, so the filter is not trivially true); smoke `:863` - `onlyFull(picked, taskA)` | ✅ PASS |
| HTF-11 selected chip shows selected with × | `aria-pressed`, × present | smoke `:858` - `pressed.length === 1 && pressed[0].label === taskA && pressed[0].clear` | ✅ PASS |
| HTF-12 second click or × → every column again | all columns | `:483` - `visibleColumns(cols, null)` equals `cols`; smoke `:905` - 6 heads after the ×, none pressed, all full; 1 head after picking again; 6 heads after a second click; all full | ✅ PASS |
| HTF-13 selection survives ◀ ▶; a week without the group shows `No time for <label> this week.` | exact text | `:496` - `visibleColumns(cols,'task:99')` is `[]`; smoke `:883` - `away.empty.includes(`No time for ${taskA} this week.`) && !away.grid && away.pressed[0].label === taskA && backHeads` is the Sunday alone | ✅ PASS |
| HTF-14 the open drawer's day filtered out → drawer closes | no drawer | smoke `:868` - `openOnMonday && !(await drawerOpen()) && pressedLabel() === null` (checks first that the drawer was open on Monday) | ✅ PASS |
| HTF-15 selecting or clearing never changes a bar's colour | colours equal to rest | `:517` - the colour map and day objects are unchanged by `visibleColumns` / `dimmedGroups`; smoke `:915` - seven snapshots across hover, focus, pick and clear all `sameColours(list, palette)` with `palette.size === 14` (and `sameColours` needs a non-empty list) | ✅ PASS |

### P2: The colour checks become automatic

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| HTF-16 seeded Sunday: 8 distinct bar colours among 14 tasks, 6 Other | 8 + 6 | smoke `:739` - `bars.length === 14 && slotBars.length === 8 && slotColours.size === 8 && otherBars.length === 6`, Other in one colour that no slot uses | ✅ PASS |
| HTF-17 seeded Sunday summary reads `14 tasks` | `14 tasks` | smoke `:754` - `sunday.count === '14 tasks · 14 blocks'` (stricter than the spec) | ✅ PASS |

**Status**: ❌ Gaps present. 14 of 17 ACs fully covered. HTF-08 and HTF-09 are partly covered, and HTF-01 has a spec-precision gap in its assertion.

---

## Edge Cases

- [x] A task first appearing while the week is shown stays Other: `hours-calendar.test.ts:401` - `expect(roleOf(frozen, 'task:6')).toBe('other')`
- [x] A selected task-less folder filters the same way: `:492` - `dates(visibleColumns(cols, FOLDER))` is `[17]`; `:505` - hovering a folder dims both tasks. There is no smoke check for a folder pick, but the component passes the key through unchanged
- [x] A week of folders only assigns no slot: `:351` - `expect([...colours.values()]).toEqual(['no-task','no-task'])`

---

## Discrimination Sensor

### Unit layer (scratch worktree)

Run in a detached `git worktree` of `2ebd99c` under the session scratchpad, after
`npm ci --ignore-scripts`. Command: `npx vitest run src/renderer/src/lib/hours-calendar.test.ts`,
41 passing before any mutation. Anchors were checked to be unique, and the file was restored and compared byte for byte afterwards.

| # | Function (`hours-calendar.ts`) | Mutation | Killed? (failing tests) |
| - | ------------------------------ | -------- | ----------------------- |
| M1 | `assignColours` :202-218 | held slots taken from every day of the week, not only shared days | ✅ Killed (2: `:300`, `:367`) |
| M2 | `assignColours` | only the first shared day counts | ✅ Killed (2: `:284`, `:314`) |
| M3 | `assignColours` | last free slot instead of the first in palette order | ✅ Killed (9) |
| M4 | `assignColours` | seven slots, the eighth dropped | ✅ Killed (3: `:331`, `:345`, `:367`) |
| M5 | `assignColours` | folders take slots like tasks | ✅ Killed (3: `:351`, `:359`, `:367`) |
| M6 | `weekGroups` :194 | tie broken by the later first start | ✅ Killed (1: `:307`) |
| M7 | `legendEntries` :239-245 | coloured tasks not kept in colouring order | ✅ Killed (1: `:394`) |
| M8 | `legendEntries` | coloured tasks sorted by slot name | ✅ Killed (1: `:367`) |
| M9 | `legendEntries` (`legendRank` :164) | Other ranked after folders | ✅ Killed (2: `:367`, `:394`) |
| M10 | `visibleColumns` :252-258 | selection ignored | ✅ Killed (4) |
| M11 | `visibleColumns` | a selection absent from the week keeps every column | ✅ Killed (1: `:496`) |
| M12 | `dimmedGroups` :264-276 | selection wins over hover | ✅ Killed (1: `:513`) |
| M13 | `dimmedGroups` | selection ignored, only hover dims | ✅ Killed (1: `:509`) |
| M14 | `dimmedGroups` | folders never dimmed | ✅ Killed (3) |

**Unit layer**: 14 of 14 killed.

### Smoke layer (real tree, restored from `.orig` in a `finally`)

| # | File:line | Mutation | Killed? |
| - | --------- | -------- | ------- |
| SM1 | `HoursCalendar.tsx:203-206`, `HoursView.tsx:455` | Bars keep only `onMouseEnter`, so they have no `onMouseLeave`, `onFocus` or `onBlur`. The drawer group header has no `onMouseLeave` | ❌ Survived: 48/48 checks passed |

SM1 was predicted from reading the check order at `smoke-hours-calendar.mjs:818-838`. The hover from
the header is overwritten by pointing at the bar. The hover from the bar is overwritten by focusing
chip D, and the chip's own blur then clears it. Nothing focuses a bar. The run confirmed it.

**Sensor depth**: expanded (14 unit mutants plus 1 smoke mutant), beyond the lightweight tier.
**Sensor verdict**: FAIL. The unit layer killed 14 of 14; the smoke layer killed 0 of 1.

### Isolation

`git status --porcelain` of the real tree was empty before the sensor, empty after the unit sensor,
and empty after SM1. The `.orig` copies were checked equal to the restored files and then deleted.
No electron process was left, and no `playground-smoke-hours-*` directory or pointer remains in the
temp folder. The scratch worktree is outside the repository tree.

---

## Smoke Evidence

- Re-run on the unmodified tree (seeded data, the dev app launched with the
  anti-throttling flags): **48/48 checks passed**. The app closed and the seed directory was deleted.
- Reading the new checks: they check their preconditions. `onlyFull` needs 14 bars and the pointed
  label, `sameColours` needs a non-empty list and `palette.size === 14`, check 38 needs `allFull(rest)`,
  check 45 needs the drawer open on Monday first, and check 47 needs 6 heads before and after. The
  author's falsification record (T12 and T13 `**Done**`) matches check-by-check what the code would fail.
  The only weak spot is the one SM1 exposes: in section 12 each source's enter hides a missing leave
  from the source before it.

---

## Gate Check

- **Typecheck**: `npm run typecheck` exited 0
- **Lint**: `npm run lint` exited 0, **0 errors, 18 warnings** (the baseline). None of the warnings are in feature files
- **Unit**: `npx vitest run` gave **1704 passed**, 0 failed, 0 skipped, in 91 files
- **Test count before feature**: 1691 (tasks.md baseline after the rebase)
- **Test count after feature**: 1704
- **Delta**: +13. T1 added 4 and rewrote 4 (the superseded top-three rule). T6 added 9. No test was deleted without a rewrite.

---

## Author's Judgement Calls

**(a) The legend lists coloured tasks in the order they were coloured (frozen), then Other, then folders.**
Sound. It is not a deviation. The spec does not fix the legend order. HCAL-21 (the hours-calendar spec, line 118)
requires every task and folder with its colour and total, and gives no order. Under the new rule
several tasks share `slot1`, so the old "sort by slot" would interleave unrelated tasks. The order in
which tasks were coloured is the week-total order when the week was frozen, so the legend cannot move
while the week stays on screen (HCAL-24). `hours-calendar.test.ts:394` pins it, and M7 shows the test
discriminates. AD-045 records it ("and so does the legend order").

**(b) In a week where the picked group has no time, its chip stays in the legend, pressed, with 0m and the ×.**
Sound, and needed. HTF-13 keeps the selection across weeks, and HTF-11 requires the selected chip to
show as selected with a × while the group is selected. If the chip were dropped, a week without the
group would show a pick with no way to see it or clear it. It is a spec-precision gap, because HCAL-21
says the legend lists the groups "of the shown week", and the spec should say which rule wins.
Smoke `:883` checks `away.pressed[0].label === taskA`. Cosmetic note: the chip is built with
`roleOf(colours, key)` for the week it is shown in (`HoursView.tsx:151`), so a picked task shows the
Other swatch there, not the colour it had in the week where it was picked. No bar is involved, so
HTF-15 holds.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ Two pure helpers; the components receive answers only |
| Surgical changes | ✅ Only the files named in tasks.md |
| No scope creep | ✅ The drawer header has mouse hover only, which is what HTF-07 and HTF-09 ask |
| Matches patterns | ✅ The frozen-colours pattern is reused; chip, bar and swatch classes follow the existing role classes |
| Spec-anchored outcome check | ⚠️ HTF-01 checks only that colours are distinct, not the spec's values (gap 3) |
| Per-layer coverage (domain 1:1 ACs) | ✅ HTF-02/03/04/06/10/13/15 and the edge cases have unit tests |
| Every test maps to a requirement | ✅ Each new test names its HTF id or edge case |
| Documented guidelines | ✅ `.specs/codebase/TESTING.md`: components have no unit tests; the smoke covers them |

The picked-chip rule (`HoursView.tsx:143-154`) lives in the component, not the lib. Smoke `:883`
covers it, so the missing unit test is acceptable.

---

## Fix Plans

### Fix 1: Leaving a drawer header or a bar is not checked (HTF-08). Priority: Major

- **Root cause**: In section 12, each hover source is followed by the next source's enter before any
  read, so a leave that never fires is hidden.
- **Fix task**: In `scripts/smoke-hours-calendar.mjs`, read `bars()` after each `pointAway()` that
  follows the header hover and the bar hover, and assert `allFull`.
- **Done when**: SM1 without the `onFocus`/`onBlur` part fails the new assertions, then passes restored.

### Fix 2: Keyboard focus on a bar is not checked (HTF-09). Priority: Major

- **Fix task**: Add a check that calls `.focus()` on a bar of a task other than D, asserts
  `onlyFull(…, thatTask)`, then blurs and asserts `allFull`.
- **Done when**: removing `onFocus`/`onBlur` from `Bar` (`HoursCalendar.tsx:205-206`) fails it.

### Fix 3: The palette values are not checked (HTF-01). Priority: Minor

- **Fix task**: In check 35, compare the eight slot bars' computed colours, in the seeded order
  `9101..9108`, with the spec's hex values for the theme the smoke runs in.
  The smoke already records the theme and restores it at `:934`.
- **Done when**: swapping two `--hcal-slotN` values in `HoursCalendar.css` fails the check.

### Spec note (no code change)

Write judgement call (b) into the spec: a picked group's chip stays in the legend, pressed and at 0m,
in a week where the group has no time.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HTF-01 | Implemented (T1, T3) | ⚠️ Needs a check (fix 3) |
| HTF-02..HTF-06 | Implemented | ✅ Verified |
| HTF-07 | Verified (T13 smoke) | ✅ Verified |
| HTF-08 | Verified (T13 smoke) | ❌ Needs a check (fix 1) |
| HTF-09 | Verified (T13 smoke) | ❌ Needs a check (fix 2) |
| HTF-10..HTF-17 | Verified | ✅ Verified |

---

## Summary

**Overall**: ❌ Not ready. The behaviour is correct, but three checks are missing.

**Spec-anchored check**: 14 of 17 ACs fully match the spec outcome. HTF-08 and HTF-09 are partly
covered. HTF-01 has a spec-precision gap in its assertion.
**Sensor**: 14 of 15 mutants killed (14 of 14 unit, 0 of 1 smoke).
**Gate**: 1704 passed, typecheck clean, lint 0 errors and 18 warnings.

**What works**: greedy colouring with no repeat on a day, the frozen legend order, filtering by
columns, dimming with hover taking precedence, the pick kept across weeks with its empty message,
the drawer closing when its day is filtered out, and colours staying the same through every focus change.

**Next steps**: fixes 1–3 in the smoke, then re-verify.
