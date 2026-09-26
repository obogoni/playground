# Hours Calendar Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/hours-calendar/design.md`
**Status**: Done — T1..T19 executed; Verifier PASS round 6 (`validation.md`)

**Branch**: `feature/hours-calendar`, stacked on `feature/time-tracking` (PR #93). Its PR carries "depends on #93"; once #93 merges, `git rebase --onto origin/main feature/time-tracking feature/hours-calendar`.

**Test baseline**: **865 tests**, **measured** 2026-09-19 with `npx vitest run` on `feature/time-tracking` `94e3493`. Re-measure as the first act of Execute if the branch moved.

**Colours**: use exactly the six hex values in the design's colour table — they are the validator's passing set for this app's surfaces. Changing any of them means re-running the `dataviz` validator with `--pairs all` against `#ffffff` and `#221f1b` first.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure calendar logic (`hours-calendar.ts`) | unit | 1:1 to the ACs each function decides; every edge case in the spec | `src/renderer/src/lib/hours-calendar.test.ts` | `npm test` |
| Existing Hours logic (`hours-report.ts`, `hours-copy.ts`, time-tracking tests) | unit, unchanged | Must pass unedited | existing | `npm test` |
| Renderer components (`HoursCalendar`, `HoursLegend`, `HoursView`) | none (CDP smoke + visual) | — | — | `node scripts/smoke-hours-calendar.mjs` |
| Docs | none | — | — | review |
| Out-of-CI smoke | manual only | Every AC no unit test reaches, plus the re-run of `smoke-time.mjs` | `scripts/smoke-*.mjs` | live dev app |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a renderer task | `npm run typecheck && npm run lint && npm test` |
| Build | At each phase boundary | `npx electron-vite build` |
| Manual | T11 | `node scripts/smoke-hours-calendar.mjs` and `node scripts/smoke-time.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: Calendar geometry, pure

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: The calendar on screen

```
T5 → T6 → T7 → T8 → T9
```

### Phase 3: Close the loop

```
T9 → T10 → T11
```

### Phase 4: Layout B — fit the window, detail in a drawer (AD-031, owner decision 2026-09-19)

```
T11 → T12 → T13 → T14 → T15 → T16
```

### Phase 5: The drawer's look, and the verifier gaps

```
T16 → T17 → T18 → T19
```

---

## Task Breakdown

### T1: Decide the week's columns

**What**: Create `src/renderer/src/lib/hours-calendar.ts` with `weekColumns(report, weekStart, now)`.
**Where**: `src/renderer/src/lib/hours-calendar.ts`
**Depends on**: None
**Reuses**: `WeekReport`, `DayReport`, `weekRange` from `hours-report.ts`.
**Requirement**: HCAL-01, 02, 03, 04, 05, 07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Monday to Friday are always present, in order, even with no time
- [x] Saturday is added only when it holds time; Sunday likewise; one without the other works
- [x] Each column's `totalMs` is its `DayReport.totalMs` (the union), 0 when empty
- [x] `isToday` only in the current week; `isFuture` for days after today
- [x] `hours-calendar.test.ts` created
- [x] Lint warning baseline recorded in the commit body
- [x] Gate passes: `npm test`
- [x] Test count: 865 + 5 = **870**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(hours): decide the calendar's week columns`

---

### T2: Decide the time axis

**What**: Add `timeAxis(report)` to `hours-calendar.ts`.
**Where**: `src/renderer/src/lib/hours-calendar.ts`
**Depends on**: T1
**Reuses**: `Block` start / end.
**Requirement**: HCAL-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] 09:10–17:40 → 09–18
- [x] 10:00–11:00 → widened to 8 h, symmetrically, clamped to 0–24
- [x] A 03:00 block and an 18:00 block → 03–18 (nothing clipped)
- [x] An empty week → 09–17
- [x] A single sub-minute block → an 8 h axis around it
- [x] Gate passes: `npm test`
- [x] Test count: 870 + 5 = **875**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(hours): decide the calendar's time axis`

---

### T3: Lay parallel blocks out in lanes

**What**: Add `layoutLanes(blocks)` to `hours-calendar.ts`.
**Where**: `src/renderer/src/lib/hours-calendar.ts`
**Depends on**: T2
**Reuses**: `Block`.
**Requirement**: HCAL-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Disjoint blocks → each `lane 0 / lanes 1`
- [x] Two overlapping → lanes 0 and 1, both `lanes 2`
- [x] A chain A∩B, B∩C, A∌C → one cluster; C reuses A's lane; all `lanes 2`
- [x] One block containing two others → three lanes where they meet
- [x] Four simultaneous → four lanes
- [x] No two blocks sharing a lane ever overlap in time (asserted over every case)
- [x] Gate passes: `npm test`
- [x] Test count: 875 + 6 = **881**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(hours): lay parallel blocks out in lanes`

---

### T4: Assign colours and build the legend

**What**: Add `assignColours(report)` and `legendEntries(report, colours)` to `hours-calendar.ts`.
**Where**: `src/renderer/src/lib/hours-calendar.ts`
**Depends on**: T3
**Reuses**: `GroupReport` keys (`task:<id>`, `cwd:<path>`).
**Requirement**: HCAL-11, 21, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] The three task groups with the largest week total get `slot1`, `slot2`, `slot3` in that order; ties by first start
- [x] A fourth and fifth task are `other`
- [x] Every `cwd:` group is `no-task`, however large
- [x] A week with one task uses only `slot1`
- [x] The legend lists slots first, then Other's members, then folders, each with its week total
- [x] Gate passes: `npm test`
- [x] Test count: 881 + 6 = **887**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(hours): assign task colours and build the legend`

---

### T5: Pick the default day and place a bar

**What**: Add `defaultDay(columns, now)` and `barBox(block, axis, now)` to `hours-calendar.ts`.
**Where**: `src/renderer/src/lib/hours-calendar.ts`
**Depends on**: T4
**Reuses**: `CalendarColumn`, `TimeAxis`.
**Requirement**: HCAL-08, 13, 16, 17, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Current week → today, even when today has no time yet
- [x] Past week → the latest day with time; an empty week → null
- [x] `barBox` on a 09–18 axis for 12:00–13:30 → `topPct` 33.3…, `heightPct` 16.6…
- [x] An open block ends at `now` and is marked `ongoing`
- [x] A block part after midnight (already split by the report) sits at the top of its own day
- [x] Gate passes: `npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: 887 + 6 = **893**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(hours): pick the default day and place a bar`

---

### T6: Let a day card focus one block

**What**: Give `DayCard` an optional `focusBlockStart` prop that expands that block and scrolls it into view.
**Where**: `src/renderer/src/components/HoursView.tsx`
**Depends on**: T5
**Reuses**: `DayCard`, `GroupSection`, `BlockLine` (`HoursView.tsx:137`).
**Requirement**: HCAL-15, 19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Without the prop, the card renders exactly as today
- [x] Every time-tracking unit test passes unedited
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **893** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(hours): let a day card focus one block`

---

### T7: Draw the week

**What**: Create the `HoursCalendar` component and its stylesheet — hour axis with gridlines, a column per `weekColumns` entry with its header button, and bar buttons placed by `barBox` in `layoutLanes` lanes, coloured by role, with direct labels where they fit, tooltip on hover and focus, and the ongoing marker.
**Where**: `src/renderer/src/components/HoursCalendar.tsx`
**Depends on**: T6
**Reuses**: The pure functions from Phase 1; `formatHm` / `formatHmCompact`; the design's colour table and mark specs.
**Requirement**: HCAL-01, 02, 03, 04, 05, 08, 10, 12, 18, 19, 20, 22, 23

**Tools**: MCP: NONE · Skill: `dataviz` (mark specs, hover layer, accessibility pass)

**Done when**:

- [x] `HoursCalendar.css` declares `--hcal-slot1..3` for both themes under the selectors `tokens.css` uses, with exactly the design's hex values
- [x] Other tasks are filled neutral; no-task bars are outlined, never filled
- [x] Bars keep a 6 px minimum height and a 4 px hit halo; a 2 px surface gap separates lanes
- [x] The pulse on an ongoing bar stops under `prefers-reduced-motion`
- [x] Label text uses text tokens, never a series colour
- [x] Rendered and looked at in both themes, at the app's minimum window width, before commit (dataviz step 7) — done after T9 mounted it: dark and light at 1100 px, a hovered bar, the detail panel; no horizontal overflow
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **893** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(hours): draw the week as a calendar`

---

### T8: Explain the colours

**What**: Create the `HoursLegend` component from `legendEntries`.
**Where**: `src/renderer/src/components/HoursLegend.tsx`
**Depends on**: T7
**Reuses**: `legendEntries`; the calendar's colour variables.
**Requirement**: HCAL-21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Each entry shows swatch, label and week total; Other lists its tasks
- [x] The no-task swatch is outlined like its bars
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **893** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(hours): explain the calendar's colours`

---

### T9: Replace the day list with the calendar

**What**: In `HoursView`, render `HoursCalendar`, `HoursLegend` and one `DayCard` for the selected day; hold the selection (`defaultDay` on week change, header or bar click otherwise, fallback when the day empties); freeze `assignColours` per shown week.
**Where**: `src/renderer/src/components/HoursView.tsx`
**Depends on**: T8
**Reuses**: The header, unchanged; `useNow` for live growth.
**Requirement**: HCAL-06, 07, 14, 15, 16, 17, 18, 19, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] No stacked list of days remains (HCAL-14)
- [x] A running agent's bar grows while its colour stays the same, even when its task overtakes another — T11 smoke check 14 (growth, stable colour); the overtake case is the unit test `keeps frozen colours while live time reorders tasks`
- [x] ◀, ▶ and This week reset the selection and recompute the colours — T11 smoke checks 15–18
- [x] Deleting the selected day's last period moves the selection to the fallback day — T11 smoke check 19
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: **893** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(hours): replace the day list with a week calendar`

---

### T10: Mark TIME-34 superseded

**What**: Annotate TIME-34 in `time-tracking/spec.md` as superseded by HCAL-14 (AD-029), leaving the requirement text in place.
**Where**: `.specs/features/time-tracking/spec.md`
**Depends on**: T9
**Reuses**: The AD-018 / AD-028 pattern.
**Requirement**: HCAL-14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] TIME-34 reads as superseded, citing HCAL-14 and AD-029; no other time-tracking requirement changes
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **893** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `docs(specs): mark TIME-34 superseded by the hours calendar`

---

### T11: Drive the calendar end to end

**What**: Create `scripts/smoke-hours-calendar.mjs`, and re-run `scripts/smoke-time.mjs` against the new view.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T10
**Reuses**: `smoke-time.mjs`'s harness — ad-hoc `pwsh` sessions in `C:\Windows`, never a registry agent — and its teardown, which deletes every period it created.
**Requirement**: HCAL-01..24 end to end; the sole evidence for 03, 04, 05, 06, 12, 14, 18, 19, 20, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Checks: five columns; a weekend column appearing only with time; header totals; today highlighted; future dimmed; two parallel sessions drawn side by side; a sub-minute block visible; a bar click selecting its day and focusing its block; header click; legend entries; the running bar growing with a stable colour; ◀ ▶ This week
- [x] **`smoke-time.mjs` passes** through the detail panel — Copy text byte-identical, edit and delete working
- [x] Deletes every period it created and restores the owner's direction and theme
- [x] Numbered pass/fail line per check; all pass against a live dev app

**Tests**: manual
**Gate**: manual
**Commit**: `test(hours): drive the week calendar end to end`

---

### T12: Revise the spec for layout B

**What**: Rewrite HCAL-15..19 and 21, add HCAL-25 and 26, revise the edge cases, and record AD-031 in `.specs/STATE.md`.
**Where**: `.specs/features/hours-calendar/spec.md`, `tasks.md`, `.specs/STATE.md`
**Depends on**: T11
**Reuses**: The AD-018 / AD-028 amendment pattern.
**Requirement**: HCAL-15, 16, 17, 18, 19, 21, 25, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Every changed AC says it was revised or added by AD-031
- [x] AD-031 records the owner's choice of layout B and its consequences for HCAL-16 and the tests
- [x] Gate passes: `npm test`
- [x] Test count: **896** (unchanged)

**Tests**: none
**Gate**: quick
**Commit**: `docs(specs): revise the hours calendar for the drawer layout`

---

### T13: Put the legend in chips above the grid

**What**: Rewrite `HoursLegend` as a wrapping row of chips — the three coloured tasks, each Other task with the neutral swatch, then folders outlined — each with its week total; long labels truncated with a `title`. Render it above the calendar.
**Where**: `src/renderer/src/components/HoursLegend.tsx`, `.css`
**Depends on**: T12
**Reuses**: `legendEntries`, unchanged.
**Requirement**: HCAL-21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Every task and folder of the week has a chip with swatch, label and total
- [x] A long label is truncated and its full text is the chip's `title`
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **896** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(hours): show the week totals as chips above the calendar`

---

### T14: Let the calendar fill the height

**What**: Make the Hours body a non-scrolling column whose calendar takes the remaining height; the hour rows divide it instead of a fixed 36 px.
**Where**: `src/renderer/src/components/HoursCalendar.css`, `HoursView.css`
**Depends on**: T13
**Reuses**: The grid of T7.
**Requirement**: HCAL-26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] At 1100 × 640 the Hours body does not scroll and the calendar ends inside the window — T16 smoke check 15 and visual pass
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **896** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(hours): fit the calendar to the window height`

---

### T15: Open the day in a drawer

**What**: Replace the day card under the grid with a drawer beside it: closed on open and on week change; opened by a header or bar click; closed by its X, by Esc, and when its day loses its last period. Remove `defaultDay` and its three unit tests, whose requirement HCAL-16 no longer asks for a default day (owner decision 2026-09-19).
**Where**: `src/renderer/src/components/HoursView.tsx`, `.css`, `src/renderer/src/lib/hours-calendar.ts`, `hours-calendar.test.ts`
**Depends on**: T14
**Reuses**: `DayCard` with its `focus` prop, unchanged.
**Requirement**: HCAL-15, 16, 17, 18, 19, 25, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] No day is selected and no drawer shows when the view opens or the week changes — T16 smoke checks 5, 18, 21
- [x] A header or bar click opens the drawer on that day; a bar click also focuses its block — T16 smoke checks 11, 12
- [x] X and Esc close it; deleting the day's last period closes it — T16 smoke checks 16, 17, 22
- [x] Only the drawer's content scrolls — T16 smoke check 15 and visual pass
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: 896 − 3 = **893**

**Tests**: none
**Gate**: build
**Commit**: `feat(hours): open the selected day in a drawer`

---

### T16: Drive the drawer layout end to end

**What**: Update `smoke-hours-calendar.mjs` for the drawer (closed on open, opened by header and bar, closed by X, Esc, week change and delete, no page scroll at 1100 × 640) and `smoke-time.mjs` to open today's drawer before its Hours steps; run both against a live dev app with the owner's go-ahead; look at both themes.
**Where**: `scripts/smoke-hours-calendar.mjs`, `scripts/smoke-time.mjs`
**Depends on**: T15
**Reuses**: The T11 harness and teardown.
**Requirement**: HCAL-15..19, 21, 25, 26 end to end

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Both smokes pass against a live dev app; cleanup verified
- [x] Both themes looked at, at 1100 × 640 and wider
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`

**Tests**: manual
**Gate**: manual
**Commit**: `test(hours): drive the drawer layout end to end`

---

### T17: Match the drawer to the approved mockup

**What**: Move the close control and the hint into the day card's head, add the summary line (day total, task and block counts, Copy), give each group its calendar swatch, drop the rules between groups, and let the card fill the drawer.
**Where**: `src/renderer/src/components/HoursView.tsx`, `.css`
**Depends on**: T16
**Reuses**: `roleOf` and the frozen colour map; the swatch styling of `HoursLegend.css`.
**Requirement**: HCAL-15, 27

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] The head holds the day, the hint and the close button; no row sits above the card
- [x] The summary line shows the day total, `N tasks · N blocks` and Copy
- [x] Every group row carries the swatch of its bar's colour, the task-less one outlined
- [x] The card fills the drawer's height, with no rule between groups
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **893** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(hours): match the day drawer to the approved design`

---

### T18: Close the round-3 verifier gaps

**What**: Give HCAL-17, HCAL-27 and the re-arm edge case deterministic smoke evidence — open the drawer on a day with no time in an empty past week, assert the drawer's own empty text, move a period onto that day, then delete it and assert the drawer closes — and add the grid-narrowing and legend-truncation assertions. The spec's HCAL-25 now states the text-field exception and HCAL-27 the empty drawer (T17's commit carries those edits); extend the `tasks.md` cross-check tables to T18.
**Where**: `scripts/smoke-hours-calendar.mjs`, `.specs/features/hours-calendar/tasks.md`
**Depends on**: T17
**Reuses**: The past-week scenario of the T11 delete check.
**Requirement**: HCAL-15, 17, 21, 25, 27; the emptied-day edge case

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] A day with no time opens a drawer whose own text says so (HCAL-17, 27)
- [x] A day selected while empty, given time and then emptied, closes the drawer (edge case, mutant MH)
- [x] The grid is narrower with the drawer open than closed (HCAL-15)
- [x] A legend chip's `title` carries its full label (HCAL-21)
- [x] The cross-check tables cover T12..T18
- [x] Both smokes pass against a live dev app, with the owner's go-ahead; cleanup verified
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`

**Tests**: manual
**Gate**: manual
**Commit**: `test(hours): pin the empty drawer and its re-arm`

---

### T19: Fix the summary line and pin what it says

**What**: The summary line renders `1 blocks` and counts task-less folders as tasks. Pluralise each count, count tasks and folders apart, and assert the line, the swatches and the Esc exception in the smoke.
**Where**: `src/renderer/src/components/HoursView.tsx`, `scripts/smoke-hours-calendar.mjs`, `.specs/features/hours-calendar/spec.md`
**Depends on**: T18
**Reuses**: The drawer scenario of T16 and T18.
**Requirement**: HCAL-15, 25, 27

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] A one-block day reads `1 block`, and a task-less day counts folders, not tasks
- [x] The smoke asserts the day total against its column header and the counts against the rendered groups and blocks (mutants N4, N5)
- [x] The smoke asserts each group's swatch role equals its bar's (mutant N1)
- [x] The smoke asserts Esc inside a period's field leaves the drawer open (mutant MB)
- [x] HCAL-15 says what the counts are; HCAL-27 sits in its own story and the coverage line reads 27
- [x] Both smokes pass against a live dev app, with the owner's go-ahead; cleanup verified
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **893** (unchanged)

**Tests**: manual
**Gate**: manual
**Commit**: `fix(hours): count a day's blocks and folders correctly`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 → T2 → T3 → T4 → T5
Phase 2:  T6 → T7 → T8 → T9
Phase 3:  T10 → T11
Phase 4:  T12 → T13 → T14 → T15 → T16
Phase 5:  T17 → T18 → T19
```

Strictly sequential. 11 tasks > 8, so the sub-agent offer applies — offer-then-confirm. **Packing**: Phase 1 (5) = batch 1; Phases 2 + 3 (4 + 2) = batch 2.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1–T3 | 1 pure function each | ✅ |
| T4, T5 | 2 small pure functions each | ✅ |
| T6 | 1 optional prop | ✅ |
| T7, T8 | 1 component each | ✅ |
| T9 | 1 view composition | ✅ |
| T10 | 1 spec annotation | ✅ |
| T11 | 1 script (+ a re-run) | ✅ |
| T12 | 1 spec revision | ✅ |
| T13, T14 | 1 component / 1 stylesheet pass each | ✅ |
| T15 | 1 view change (drawer) | ✅ |
| T16, T18, T19 | 1 smoke pass each (T19 with a one-line fix) | ✅ |
| T17 | 1 card layout | ✅ |

---

## Diagram-Definition Cross-Check

| Task | Depends On | Diagram Shows | Status |
| ---- | ---------- | ------------- | ------ |
| T1 | None | phase head | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T5 | T5 → T6 (boundary) | ✅ |
| T7 | T6 | T6 → T7 | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T9 | T9 → T10 (boundary) | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T11 | T11 → T12 (boundary) | ✅ |
| T13 | T12 | T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 | ✅ |
| T17 | T16 | T16 → T17 (boundary) | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T18 | T18 → T19 | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1–T5 | Pure calendar logic | unit | unit | ✅ |
| T6–T9 | Renderer components | none | none | ✅ |
| T10 | Docs | none | none | ✅ |
| T11, T16, T18, T19 | Smoke | manual only | manual | ✅ |
| T12 | Docs | none | none | ✅ |
| T13, T14, T15, T17 | Renderer components | none | none | ✅ |

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| HCAL-01 | T1, T7, T11 |
| HCAL-02 | T1, T7, T11 |
| HCAL-03 | T1, T7, T11 |
| HCAL-04 | T1, T7, T11 |
| HCAL-05 | T1, T7, T11 |
| HCAL-06 | T9, T11 |
| HCAL-07 | T1, T9 |
| HCAL-08 | T5, T7 |
| HCAL-09 | T2 |
| HCAL-10 | T3, T7, T11 |
| HCAL-11 | T4, T7 |
| HCAL-12 | T7, T11 |
| HCAL-13 | T5 |
| HCAL-14 | T9, T10, T11 |
| HCAL-15 | T6, T9, T11, T12, T15, T16, T17, T18, T19 |
| HCAL-16 | T5, T9, T12, T15, T16 |
| HCAL-17 | T5, T9, T12, T15, T16, T18 |
| HCAL-18 | T7, T9, T11, T12, T15, T16 |
| HCAL-19 | T6, T7, T9, T11, T12, T15, T16 |
| HCAL-20 | T7, T11 |
| HCAL-21 | T4, T8, T11, T12, T13, T16, T18 |
| HCAL-22 | T7, T11 |
| HCAL-23 | T5, T7, T11 |
| HCAL-24 | T4, T9, T11 |
| HCAL-25 | T12, T15, T16, T18, T19 |
| HCAL-26 | T12, T14, T16 |
| HCAL-27 | T17, T18, T19 |

All 27 mapped; none unmapped.
