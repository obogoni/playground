# Hours Task Focus Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: inline. `ColourRole` grows to `slot1`..`slot8`; `assignColours` becomes a greedy colouring of the week's same-day conflict graph, in week-total order. Focus is two keys held by `HoursView` — `hoverKey` (transient) and `selectedKey` (kept across weeks) — and two pure helpers decide what they mean: which columns show, and which groups are dimmed. Components only receive the answers.
**Status**: Approved by the owner 2026-09-26 (planned 2026-09-22); executing inline

**Branch**: `feature/hours-task-focus`, cut from `feature/hours-calendar` `c97aec5` and rebased on 2026-09-26 onto `feature/hours-calendar` `7d85337`, which carries B1 and its seeded smoke. The PR stacks on #99.

**Test baseline** (measured 2026-09-26 after the rebase): `npx vitest run` 1691 passed in 91 files; typecheck clean; lint 0 errors, 18 warnings.

**Palette**: exactly the hex values in the spec's Assumptions table. Changing one means re-running the dataviz validator with `--pairs all` against `#ffffff` and `#221f1b` and updating the weak-pair row.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts, the sibling `hours-calendar/tasks.md` matrix.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure calendar logic (`hours-calendar.ts`) | unit | 1:1 to HTF-02, 03, 04, 06, 10, 13, 15 and the three edge cases | `src/renderer/src/lib/hours-calendar.test.ts` | `npm test` |
| Components and CSS (`HoursView`, `HoursCalendar`, `HoursLegend`) | none (CDP smoke) | HTF-01, 05, 07–14 in the running app | — | `node scripts/smoke-hours-calendar.mjs` |
| Docs (`STATE.md`) | none | — | — | review |
| End to end | manual CDP smoke | Every new check seen failing on a broken build | `scripts/smoke-hours-calendar.mjs` | seeded dev app (B1) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | CSS tasks and phase ends | `npx electron-vite build` |
| Manual | T12, T13 | B1's three-step seeded smoke |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: Colours, pure

```
T1 → T2
```

### Phase 2: Colours on screen

```
T2 → T3 → T4 → T5
```

### Phase 3: Focus, pure and state

```
T5 → T6 → T7
```

### Phase 4: Focus on screen

```
T7 → T8 → T9 → T10 → T11
```

### Phase 5: Prove

```
T11 → T12 → T13
```

---

## Task Breakdown

### T1: Eight slots, no repeat on a day

**What**: `ColourRole` gains `slot4`..`slot8`; `assignColours` walks tasks by week total (ties by first start) and gives each the first slot not held by an already-coloured task sharing a day with it, else `other`; folders stay `no-task`.
**Where**: `src/renderer/src/lib/hours-calendar.ts`
**Depends on**: None
**Reuses**: the current ranking and `no-task` rule
**Requirement**: HTF-02, HTF-03, HTF-04, HTF-06

**Tools**:

- MCP: NONE
- Skill: `dataviz` (palette order and the weak-pair note)

**Done when**:

- [x] Tests: two tasks on different days both take `slot1`; three tasks on one day take `slot1..3`; a ninth same-day task is `other`; a task sharing days with two others skips both their slots; ties by first start; a week of folders only assigns no slot
- [x] The existing top-three ranking tests are rewritten to the new rule, each rewrite named in the commit body (the rule they pinned is superseded by the spec)
- [x] Gate check passes: `npm test`
- [x] Test count: baseline ± the stated rewrites + the new tests

**Done**: 2026-09-26. 1695 tests (baseline 1691 + 4 new; 4 rewritten). The legend keeps coloured tasks in the order they were coloured, which the unchanged HCAL-24 test pins; sorting by slot did that only while slots were unique.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(hours): give same-day tasks different colours, eight at most`

---

### T2: Record the decision

**What**: AD-045 (checked free on 2026-09-26: `develop` holds AD-044) in `STATE.md`: the Hours calendar uses eight colours, superseding AD-030 there only, with the measured weak pairs and the relief.
**Where**: `.specs/STATE.md`
**Depends on**: T1
**Reuses**: AD-030's wording
**Requirement**: HTF-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The number checked free across `develop` and every planned branch's `STATE.md`

**Done**: 2026-09-26. AD-045 checked free on develop (AD-044), origin/main (AD-043) and every local and fork feature branch.

**Tests**: none
**Gate**: quick

**Commit**: `docs(state): record eight task colours for the hours calendar`

---

### T3: Bar colours for slots 4–8

**What**: `--hcal-slot4..8` for both themes and the matching bar role classes.
**Where**: `src/renderer/src/components/HoursCalendar.css`
**Depends on**: T2
**Reuses**: the `--hcal-slot1..3` declarations
**Requirement**: HTF-01, HTF-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run lint` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `style(hours): add five task colours to the calendar`

---

### T4: Legend swatches for slots 4–8

**What**: The legend's swatch classes for the five new roles.
**Where**: `src/renderer/src/components/HoursLegend.css`
**Depends on**: T3
**Reuses**: T3's variables
**Requirement**: HTF-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run lint` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `style(hours): colour the legend's new slots`

---

### T5: Drawer swatches for slots 4–8

**What**: The day drawer's group swatch classes for the five new roles.
**Where**: `src/renderer/src/components/HoursView.css`
**Depends on**: T4
**Reuses**: T3's variables
**Requirement**: HTF-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run lint` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `style(hours): colour the day detail's new slots`

---

### T6: Focus rules, pure

**What**: `visibleColumns(columns, report, selectedKey)` — every column when nothing is selected, else only days where the group has time — and `dimmedGroups(report, hoverKey, selectedKey)` — every group but the focused one, hover taking precedence.
**Where**: `src/renderer/src/lib/hours-calendar.ts`
**Depends on**: T5
**Reuses**: `weekColumns`' day keys
**Requirement**: HTF-10, HTF-13, HTF-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: no selection keeps every column; a selection keeps only its days; a selection absent from the week yields none; hover over a selection dims by the hover; neither changes the colour map; a folder key works as a task key
- [x] Gate check passes: `npm test`
- [x] Test count: T1 count + the new tests

**Done**: 2026-09-26. 1704 tests (T1's 1695 + 9). `visibleColumns` takes no report: each column already carries its day's groups.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(hours): decide which days and bars a focused task shows`

---

### T7: `HoursView` holds the focus

**What**: `hoverKey` and `selectedKey` state; `selectedKey` survives ◀ ▶; the drawer closes when its day is filtered out; the empty-week message names the selection; both keys and `dimmedGroups` go down to the legend, the calendar and the drawer.
**Where**: `src/renderer/src/components/HoursView.tsx`
**Depends on**: T6
**Reuses**: T6; the existing selection effects
**Requirement**: HTF-10, HTF-12, HTF-13, HTF-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Done**: 2026-09-26. The picked chip stays in the legend with a 0m total in a week where its group has no time, so the pick is always visible and clearable (HTF-11); the spec left that week's legend open. Hover is kept per week and cleared when the drawer closes, since a header unmounted under the pointer never fires a leave. The new child props are declared here and wired in T8 to T10, keeping each task's typecheck green.

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): keep a focused task across the week view`

---

### T8: Legend chips hover and select

**What**: Chips become buttons: hover and focus set `hoverKey`, click toggles `selectedKey`, the selected chip shows `aria-pressed` and a × that clears.
**Where**: `src/renderer/src/components/HoursLegend.tsx`
**Depends on**: T7
**Reuses**: `LegendEntry`
**Requirement**: HTF-07, HTF-09, HTF-11, HTF-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Done**: 2026-09-26. Each chip holds a pick button (`aria-pressed`) and, when picked, a × button; hover and focus are read on the chip, so the × counts too. `.hleg-chip`, `.hleg-label` and the chip's title stay, as the smoke reads them.

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): hover or select a task from the legend`

---

### T9: Bars dim and report hover

**What**: The calendar renders only the visible columns, adds a `dimmed` class to bars of dimmed groups, and sets `hoverKey` on bar hover and focus.
**Where**: `src/renderer/src/components/HoursCalendar.tsx`
**Depends on**: T8
**Reuses**: T6's answers passed by T7
**Requirement**: HTF-07, HTF-08, HTF-09, HTF-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Done**: 2026-09-26. The calendar already receives only the visible columns from T7; here each bar gets `dimmed` from the set and reports pointer and focus.

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): fade other tasks' bars while one is in focus`

---

### T10: Drawer group headers report hover

**What**: A drawer group header sets `hoverKey` on hover and clears it on leave.
**Where**: `src/renderer/src/components/HoursView.tsx`
**Depends on**: T9
**Reuses**: `DayCard`'s group header
**Requirement**: HTF-07, HTF-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): point at a task from the day detail`

---

### T11: Focus styles

**What**: `.hcal-bar.dimmed` at 30% opacity with a short transition; the selected chip and its × in both themes.
**Where**: `src/renderer/src/components/HoursCalendar.css`
**Depends on**: T10
**Reuses**: the chip tokens
**Requirement**: HTF-07, HTF-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The selected-chip rule lives in `HoursLegend.css` if the chip styles are there (one-line move, stated in the commit)
- [x] Gate check passes: `npm run lint` and `npx electron-vite build`

**Done**: 2026-09-26. The chip rules live in `HoursLegend.css` with the other chip styles; `.hcal-bar.dimmed` in `HoursCalendar.css`.

**Tests**: none
**Gate**: build

**Commit**: `style(hours): style focus and the selected task`

---

### T12: Smoke — colours and the day summary

**What**: On the seeded Sunday: eight distinct computed bar colours and six Other bars, legend and drawer swatches matching the bars, and the drawer summary `14 tasks`. The header's "NOT automatable" paragraph drops the two items the seed now covers.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T11
**Reuses**: B1's seed and step 10's navigation
**Requirement**: HTF-01, HTF-03, HTF-05, HTF-16, HTF-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each check seen failing with `assignColours` reverted to top-three, then passing
- [x] Gate check passes: `npm run lint` (warning count unchanged)

**Done**: 2026-09-26. 37/37 on the seeded app. Falsified on the running app: top-three colouring failed only the eight-colours check (3 slot bars in 3 colours, 11 Other); dropping the legend's slot 4-8 swatch rules failed only the swatch check (chip `rgba(0, 0, 0, 0)`); wording tasks as items failed only the summary check (`14 items · 14 blocks`). Swatches are compared by computed colour, not role class, so a missing rule shows.

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): check task colours and the day summary on the seeded day`

---

### T13: Smoke — hover and filter

**What**: Hovering a chip leaves only its bars at full opacity; clicking it shows only Sunday's column in the seeded week; ◀ ▶ keep it and the current week shows the empty message; the × clears; no bar's colour changes across the whole sequence.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T12
**Reuses**: T12's probes
**Requirement**: HTF-07, HTF-08, HTF-10..15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each check seen failing with its rule broken (no `dimmed` class; `visibleColumns` ignoring the selection), then passing
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): check hovering and filtering by task`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ------→ T2
Phase 2:  T2 ------→ T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6 ------→ T7
Phase 4:  T7 ------→ T8 ------→ T9 ------→ T10 ------→ T11
Phase 5:  T11 ------→ T12 ------→ T13
```

Thirteen tasks: two batches (Phases 1–3, Phases 4–5). At Execute the sub-agent offer is made first.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: colouring | 1 function + 1 type | ✅ Granular |
| T2: AD | 1 decision | ✅ Granular |
| T3–T5: styles | 1 stylesheet each | ✅ Granular |
| T6: focus rules | 2 pure functions, 1 file | ⚠️ Cohesive |
| T7: view state | 1 component | ✅ Granular |
| T8: legend | 1 component | ✅ Granular |
| T9: calendar | 1 component | ✅ Granular |
| T10: drawer headers | 1 component part | ✅ Granular |
| T11: focus styles | 1 stylesheet | ✅ Granular |
| T12–T13: smoke | 1 section each | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | pure calendar logic | unit | unit | ✅ OK |
| T2 | docs | none | none | ✅ OK |
| T3–T5 | CSS | none | none | ✅ OK |
| T6 | pure calendar logic | unit | unit | ✅ OK |
| T7–T10 | components | none | none | ✅ OK |
| T11 | CSS | none | none | ✅ OK |
| T12–T13 | end to end | manual | manual | ✅ OK |
