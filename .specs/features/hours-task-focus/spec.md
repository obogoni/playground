# Hours Task Focus Specification

## Problem Statement

The Hours calendar gives colours to the three tasks with the most time in the week and paints every
other task the same neutral Other (AD-030). On a busy day several tasks share that grey, and the
only way to tell them apart is to hover each bar. Nothing links a task in the legend or the day
detail to its bars, and there is no way to see just the days one task took.

## Goals

- [ ] Two tasks on the same day never share a colour while the day has at most eight tasks
- [ ] Pointing at a task anywhere in the view shows its bars across the week
- [ ] One click on a task shows only the days it took

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Texture (hatching) as a second channel | Owner chose more hues instead (grill Q1) |
| A view of every day a task took, across weeks | Owner decision (grill Q3): the filter works inside the week view; ◀ ▶ carry it |
| A task keeping one colour across weeks | Owner decision (grill Q4): colours are assigned per week so same-day tasks differ |
| Persisting the filter across restarts | Not requested; it is view state |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Palette | The dataviz reference palette's eight categorical slots in its order — blue, orange, aqua, yellow, magenta, green, violet, red — light `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #4a3aa7 #e34948`, dark `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300 #9085e9 #e66767` | Owner decisions (grill Q1, Q5) | y |
| Known weak pairs | Validator, `--pairs all` on `#ffffff` / `#221f1b` (measured 2026-09-22): normal-vision floor FAIL — red ↔ orange ΔE 7.1 (both themes), violet ↔ blue 9.8 (dark); CVD FAIL — green ↔ orange 3.2 (light, protan), magenta ↔ aqua 1.6 (dark, deutan). Relief: legend, tooltips and bar labels name every task; hover and filter isolate one | Owner accepted the trade-off (grill Q1); dataviz requires the relief when the floor is not met | y |
| AD-030 | Superseded **for the Hours calendar only** by a new decision (AD-045: at Execute `develop` held AD-044 and no planned branch reserved a higher number) | Other charts keep the three-colour rule | y |
| Assignment | Per week: tasks in order of week total (ties by first start) each take the first slot, in palette order, not taken by any already-coloured task that shares a day with it; a task with all eight slots taken by same-day neighbours is Other | Owner decision (grill Q4): the "no repeat on a day" rule, greedily | y |
| Freeze | Colours are computed when the week is shown and kept while it stays (HCAL-24, unchanged) | Colour follows the entity; a live change must not repaint | y |
| Task-less folders | Keep the outlined `no-task` look; they are not assigned slots | Unchanged from HCAL-11 | y |
| Hover sources | A legend chip, a group header in the day drawer, a bar | Owner decision (grill Q2) | y |
| Hover effect | Every bar of any other task and folder is dimmed to 30% opacity across the week; the hovered task's bars are unchanged | Owner decision (grill Q2); one value, tuned once at Execute if unreadable | y |
| Select | A click on a legend chip selects its task (or folder); a second click on it, or its ×, clears | Owner decision (grill Q3) — "the top part" is the legend row | y |
| Filter effect | Only the columns of days where the selected task has time are shown; other groups' bars in them are dimmed as for hover; ◀ ▶ keep the selection; a week where it has no time shows `No time for <label> this week.` | Owner decision (grill Q3) | y |
| Filter and the drawer | If the open day's column is filtered out, the drawer closes | A drawer for a hidden day has nothing to point at | y |
| Filter and colours | Selecting never repaints any bar's colour | dataviz non-negotiable: a filter must not repaint survivors | y |
| Deferred from B1 | The smoke now checks task-slot colours (HCAL-11) and the `N tasks` summary wording, using the seeded Sunday | Owner decision on B1 (grill Q10) | y |
| Order | Executes after `hours-drawer-growth` (B1), whose seeded smoke it extends | The seed exists only once B1 runs | y |
| Base branch | `feature/hours-task-focus` off `feature/hours-calendar` (at planning `c97aec5`); rebased onto it at `7d85337` on 2026-09-26, after B1 landed | Owner-approved plan of 2026-09-22 | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Same-day tasks never share a colour ⭐ MVP

**User Story**: As the owner reading a week of hours, I want every task on a day to have its own colour so that I can tell them apart without hovering.

**Why P1**: The request.

**Acceptance Criteria**:

1. The calendar SHALL offer eight task colours, in the palette order of the Assumptions table, in both themes
2. WHEN the week's colours are assigned THEN each task, in order of week total (ties by first start), SHALL take the first colour in palette order not already taken by a task sharing a day with it
3. WHEN a day holds eight tasks or fewer THEN no two of its tasks SHALL share a colour
4. IF every colour is taken by tasks sharing a day with a task THEN that task SHALL be Other
5. The legend, the day drawer's swatches and the bars SHALL show the same colour for a task
6. WHILE a week stays on screen its colours SHALL NOT change (HCAL-24)

**Independent Test**: The seeded Sunday with fourteen tasks shows eight distinct colours and six Other bars.

---

### P1: Point at a task to find its bars ⭐ MVP

**User Story**: As the owner, I want pointing at a task to fade everything else so that its bars stand out across the week.

**Why P1**: The relief the eight-colour palette needs where pairs are hard to tell apart.

**Acceptance Criteria**:

7. WHEN the pointer rests on a legend chip, a drawer group header or a bar THEN every bar of any other group SHALL be dimmed to 30% opacity, and the pointed group's bars SHALL keep full opacity
8. WHEN the pointer leaves THEN every bar SHALL return to its previous opacity
9. WHEN a legend chip or a bar receives keyboard focus THEN the view SHALL dim as on hover

**Independent Test**: Hover a legend chip; only that task's bars stay at full opacity.

---

### P1: Show only one task's days ⭐ MVP

**User Story**: As the owner, I want to click a task and see only the days it took so that I can read its time at a glance.

**Why P1**: The request.

**Acceptance Criteria**:

10. WHEN the owner clicks a legend chip THEN the calendar SHALL show only the columns of days where that group has time, and SHALL dim other groups' bars in them
11. WHILE a group is selected its chip SHALL show as selected with a × button
12. WHEN the owner clicks the selected chip again or its × THEN the calendar SHALL show every column again
13. WHEN the owner moves to another week with a group selected THEN the selection SHALL stay, and a week where the group has no time SHALL show `No time for <label> this week.`
14. WHEN the open drawer's day is filtered out THEN the drawer SHALL close
15. WHEN a group is selected or cleared THEN no bar SHALL change colour

**Independent Test**: Click the seeded Sunday's first task; the week shows only Sunday.

---

### P2: The colour checks become automatic

**User Story**: As the owner, I want the smoke to check the task colours and the day summary wording so that the parts B1 deferred are covered.

**Why P2**: Regression cover, not user-facing behaviour.

**Acceptance Criteria**:

16. WHEN the smoke opens the seeded Sunday THEN it SHALL find eight distinct bar colours among its fourteen tasks, and six Other bars
17. WHEN the smoke opens the seeded Sunday THEN its drawer summary SHALL read `14 tasks`

---

## Edge Cases

- WHEN a task first appears while the week is shown THEN it SHALL be Other until the week is reopened (HCAL-24, unchanged)
- WHEN the selected group is a task-less folder THEN the filter SHALL work the same way
- WHEN a week has no tasks, only folders THEN no slot SHALL be assigned

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| HTF-01 | P1: colours — AC 1 | Execute | Implemented (T1, T3) |
| HTF-02 | P1: colours — AC 2 | Execute | Implemented (T1) |
| HTF-03 | P1: colours — AC 3 | Execute | Implemented (T1) |
| HTF-04 | P1: colours — AC 4 | Execute | Implemented (T1) |
| HTF-05 | P1: colours — AC 5 | Tasks | In Tasks |
| HTF-06 | P1: colours — AC 6 | Execute | Implemented (T1) |
| HTF-07 | P1: hover — AC 7 | Tasks | In Tasks |
| HTF-08 | P1: hover — AC 8 | Tasks | In Tasks |
| HTF-09 | P1: hover — AC 9 | Tasks | In Tasks |
| HTF-10 | P1: filter — AC 10 | Tasks | In Tasks |
| HTF-11 | P1: filter — AC 11 | Tasks | In Tasks |
| HTF-12 | P1: filter — AC 12 | Tasks | In Tasks |
| HTF-13 | P1: filter — AC 13 | Tasks | In Tasks |
| HTF-14 | P1: filter — AC 14 | Tasks | In Tasks |
| HTF-15 | P1: filter — AC 15 | Tasks | In Tasks |
| HTF-16 | P2: smoke — AC 16 | Tasks | In Tasks |
| HTF-17 | P2: smoke — AC 17 | Tasks | In Tasks |

**Coverage:** 17 total, 17 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] On the owner's busiest real day, every task reads as its own colour
- [ ] Finding one task's days takes one click
