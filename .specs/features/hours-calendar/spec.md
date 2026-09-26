# Hours Calendar Specification

## Problem Statement

The Hours direction (`time-tracking`, PR #93) lists each day with recorded time as a stacked section,
newest first (TIME-34), and inside it the task groups and their `HH:MM–HH:MM` lines. It answers "how
long" but not "when": the shape of a week — which days were heavy, when the work happened, when two
agents ran at once — has to be read out of text. The owner wants the view to read like a calendar:
the week as columns, and the time drawn as bars.

## Goals

- [ ] The week reads at a glance as Monday-to-Friday columns, with the weekend shown only when it holds time
- [ ] Each worked stretch is a bar at the hours it happened, coloured by the task it went to
- [ ] Agents running in parallel are visible as such, never drawn over one another
- [ ] Everything the list view let the owner do — read groups and raw periods, edit, delete, Copy for Clockify — is still one click away

## Out of Scope

| Feature | Reason |
| ------- | ------- |
| Keeping the list view, or a Calendar / List toggle | Owner decision (grill Q4): the calendar replaces it; the day detail covers what the list did |
| Dragging bars to edit time | Editing stays in the raw-period detail (TIME-45..47), unchanged |
| Month or multi-week views | Not requested; the week navigation (TIME-33) is unchanged |
| Changing how time is recorded, merged or copied | `buildWeekReport`, block merging (TIME-36), the Copy format (TIME-39..41) and the log are reused untouched |
| Per-agent colours | Owner decision (grill Q7): colour is by task |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What a bar is | One bar per merged block (TIME-36), positioned from its start to its end on the day's time axis | Owner decision (grill Q1): a calendar's week view | y |
| Columns | Monday to Friday always; Saturday and/or Sunday added as full columns only in a week where that day holds time | Owner decision (grill Q2) | y |
| Week range | Still Monday 00:00 to next Monday 00:00 (TIME-32); only the presentation changes | The report, totals and navigation stay correct and tested | y |
| Parallel sessions | Blocks that overlap in time within a day split the column width into side-by-side lanes | Owner decision (grill Q5); running agents in parallel is this app's normal case | y |
| Time axis | From the week's earliest block start to its latest block end, rounded out to whole hours, at least 8 hours; shared by every column; hour gridlines labelled | Owner decision (grill Q6) | y |
| Colour | **[revised at Spec, grill Q9]** The three tasks with the most time in the shown week get the three colours; every other task shares a neutral **Other tasks** colour; task-less time has its own neutral treatment; the legend lists every task and folder with its week total | Grill Q7 asked for one colour per task. Running the dataviz validator on the app's own surfaces (`--panel` `#ffffff` light, `#221f1b` dark) with every pair in play — any bar can sit beside any other in a calendar — only three colours (blue, orange, aqua) pass in both themes; a fourth fails the normal-vision floor (violet vs blue ΔE 9.8 in dark), a pair that full-colour readers cannot tell apart and that labels do not excuse. Owner chose the top-three rule (Q9) | y |
| Colour stability | Assigned when the week loads, never while it is shown | "Colour follows the entity": a bar must not repaint because an open period made another task overtake it | y |
| Detail | **[revised 2026-09-19, AD-031]** A drawer to the right of the grid shows one selected day exactly as the list view showed a day: groups, blocks, raw periods, edit, delete, Copy. It is closed until a day or a bar is activated, and the grid narrows to make room | First shipped as a panel under the grid (grill Q3); the owner then chose layout B of three no-scroll mockups so the whole view fits the window | y |
| Default selection | **[revised 2026-09-19, AD-031]** None: the view opens, and every week change lands, with no day selected and the drawer closed | Grill Q8 chose today / latest day; the owner reversed it with layout B ("hide the details until a day or task is selected") | y |
| Clicking a bar | Selects its day, and highlights and expands that block in the detail | Owner decision (grill Q8) | y |
| Future days | Shown as columns, dimmed, with no bars | A calendar shows the whole week; dimming says "not yet" rather than "nothing" | y |
| Open periods | The bar of a block that is still open ends at "now", carries an ongoing marker, and grows at TIME-42's refresh | Consistent with the totals, which already count open time to now | y |
| Fit | **[added 2026-09-19, AD-031]** The view fits the window with no page scroll down to the minimum window (1100 × 640): the hour height follows the available height and the legend is a row of chips above the grid; only the drawer's own content may scroll | Owner request after the first build: the grid, legend and detail stacked past the window | y |
| Very short blocks | A bar keeps a minimum height so any block stays visible and clickable; its real duration is in the tooltip and the detail | A 2-minute block would otherwise be under one pixel | y |
| Superseded requirement | TIME-34 ("list each day that has time, newest first") is superseded when this ships; recorded as **AD-029** in `.specs/STATE.md` on this feature's branch | The AD-018 / AD-028 pattern for shipped requirements that stop describing the app | y |
| Branch base | `feature/hours-calendar` stacked on `feature/time-tracking` (PR #93) | The Hours view exists only there and on `develop`; the fork workflow stacks a dependent feature on its dependency | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: See the week as a calendar ⭐ MVP

**User Story**: As the developer, I want the week as day columns with my worked time drawn as bars at
the hours it happened, so that I see the shape of my week at a glance.

**Why P1**: It is the request.

**Acceptance Criteria**:

1. The Hours view SHALL show the shown week as side-by-side day columns, with Monday to Friday always present <!-- ubiquitous -->
2. WHERE Saturday or Sunday of the shown week holds recorded time the view SHALL add a column for that day, and only for that day <!-- optional-feature -->
3. Each column header SHALL show the weekday, the date and the day's total as the union of its periods <!-- ubiquitous -->
4. WHILE the shown week contains today the view SHALL highlight today's column <!-- state-driven -->
5. The view SHALL render days after today as dimmed columns with no bars <!-- ubiquitous -->
6. The header's week range, week total, ◀, ▶ and **This week** SHALL keep behaving as TIME-32 and TIME-33 specify <!-- ubiquitous -->
7. IF the shown week holds no time THEN the view SHALL show its columns empty together with `No time recorded this week.` <!-- unwanted-behavior -->
8. The view SHALL draw each merged block (TIME-36) as a bar in its day's column, spanning its start to its end on the time axis <!-- ubiquitous -->
9. The time axis SHALL run from the shown week's earliest block start to its latest block end, rounded out to whole hours and spanning at least 8 hours, shared by every column and marked with labelled hour lines <!-- ubiquitous -->
10. WHILE blocks of one day overlap in time the view SHALL place them in side-by-side lanes that divide the column's width, none drawn over another <!-- state-driven -->
11. The view SHALL colour the bars of the three tasks with the most time in the shown week with three distinct colours, the bars of every other task with one shared neutral **Other tasks** colour, and task-less time with a separate neutral treatment <!-- ubiquitous -->
24. WHILE a week is shown the colour of every task SHALL stay the same, even when live time changes which tasks have the most; it is recomputed only when the shown week changes or the view reopens <!-- state-driven -->
12. Every bar SHALL keep a minimum height of 6 px so that a block of any duration is visible and can be activated <!-- ubiquitous -->
13. WHEN a block crosses local midnight THEN each day's part SHALL be drawn in its own column, as TIME-37 splits it <!-- event-driven -->
14. The view SHALL NOT list days as stacked sections, newest first; TIME-34 is superseded (AD-029) <!-- ubiquitous -->

**Independent Test**: A week with work Monday 09:00–12:00 and Wednesday 14:00–18:00, two tasks overlapping on Wednesday, and one hour on Saturday shows six columns, an axis 09:00–18:00, two side-by-side bars on Wednesday, and no Sunday column.

---

### P1: Get to the detail and the actions ⭐ MVP

**User Story**: As the developer, I want to open any day's details from the calendar, so that
reading raw periods, correcting them and copying the day for Clockify still work.

**Why P1**: Without it the calendar would remove shipped functionality.

**Acceptance Criteria**:

15. WHILE a day is selected the view SHALL show a drawer to the right of the grid, the grid narrowing to make room, presenting that day's groups, blocks, raw periods, edit, delete and Copy exactly as TIME-35..41 and TIME-44..49 specify. The drawer SHALL carry the day and its close control in one head, a summary line with the day total, how many tasks, task-less folders and blocks it holds, and Copy, and each group SHALL wear the swatch of its calendar colour <!-- state-driven; revised by AD-031, summary and swatches added 2026-09-19 from the approved mockup -->
16. WHEN the view opens or the shown week changes THEN no day SHALL be selected and the drawer SHALL be closed <!-- event-driven; revised by AD-031, was: today or the most recent day with time -->
17. IF the selected day holds no time THEN the drawer SHALL say that no time is recorded on that day <!-- unwanted-behavior; revised by AD-031 -->
18. WHEN the user activates a column header THEN that day SHALL become the selected day and the drawer SHALL open on it <!-- event-driven -->
19. WHEN the user activates a bar THEN its day SHALL become the selected day, the drawer SHALL open on it, and its block SHALL be highlighted and expanded there <!-- event-driven -->
20. Column headers and bars SHALL be keyboard-operable buttons with accessible names — the day and its total; the group label and the block's range and duration <!-- ubiquitous -->

25. WHEN the user activates the drawer's close button, or presses Esc outside a text field, THEN the drawer SHALL close, no day SHALL be selected, and the grid SHALL take the full width again; Esc inside a text field SHALL belong to that field <!-- event-driven; added by AD-031, the text-field exception stated 2026-09-19 -->
27. WHILE the selected day holds no time the drawer SHALL keep its head and say that no time is recorded on that day <!-- state-driven; added 2026-09-19 with HCAL-17's evidence -->

**Independent Test**: Open the view: the week fills the width and no drawer shows. Click a Tuesday bar: the drawer opens on Tuesday with that block expanded; edit a raw period there and the bar moves. Press Esc: the drawer closes.

---

### P2: Read the colours and the live time

**User Story**: As the developer, I want a legend for the colours, a tooltip on each bar and the
running block to grow, so that the calendar explains itself and stays current.

**Why P2**: The calendar works without them; they make it legible and live.

**Acceptance Criteria**:

21. The view SHALL show, above the grid, a legend of chips listing every task and task-less folder of the shown week — including each task folded into Other tasks — with its colour and its week total; a label too long for its chip SHALL be truncated with its full text available on hover <!-- ubiquitous; revised by AD-031 -->
22. WHEN the user hovers or focuses a bar THEN the view SHALL show its group label, its `HH:MM–HH:MM` range and its duration <!-- event-driven -->
23. WHILE a block is still open its bar SHALL end at the current time, carry an ongoing marker, and grow at the refresh TIME-42 defines <!-- state-driven -->

26. The Hours view SHALL fit the window without page scroll down to the minimum window size (1100 × 640): the grid's hour height SHALL follow the available height, and only the drawer's own content MAY scroll <!-- ubiquitous; added by AD-031 -->

**Independent Test**: With an agent running, its bar reaches the current time with the ongoing marker and is longer a minute later; the legend's total for its task grows with it. At 1100 × 640 nothing but the drawer scrolls.

---

## Edge Cases

- WHEN four or more blocks overlap in one day THEN the lanes SHALL narrow evenly and a bar narrower than 64 px or shorter than 36 px SHALL show no direct label, keeping its tooltip
- WHEN the shown week changes while the drawer is open THEN the drawer SHALL close (HCAL-16)
- IF the only time of the week is one block under 1 minute THEN the axis SHALL still span 8 hours around it
- WHEN a weekend column appears or disappears between weeks THEN the other columns SHALL resize without changing their order
- WHEN the selected day's last period is deleted THEN the drawer SHALL close and no day SHALL be selected, including when that day held no time when it was selected

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| HCAL-01 | P1: See the week as a calendar | Execute | Implemented (T1, T7, T11) |
| HCAL-02 | P1: See the week as a calendar | Execute | Implemented (T1, T7, T11) |
| HCAL-03 | P1: See the week as a calendar | Execute | Implemented (T1, T7, T11) |
| HCAL-04 | P1: See the week as a calendar | Execute | Implemented (T1, T7, T11) |
| HCAL-05 | P1: See the week as a calendar | Execute | Implemented (T1, T7, T11) |
| HCAL-06 | P1: See the week as a calendar | Execute | Implemented (T9, T11) |
| HCAL-07 | P1: See the week as a calendar | Execute | Implemented (T1, T9) |
| HCAL-08 | P1: See the week as a calendar | Execute | Implemented (T5, T7) |
| HCAL-09 | P1: See the week as a calendar | Execute | Implemented (T2) |
| HCAL-10 | P1: See the week as a calendar | Execute | Implemented (T3, T7, T11) |
| HCAL-11 | P1: See the week as a calendar | Execute | Implemented (T4, T7) |
| HCAL-12 | P1: See the week as a calendar | Execute | Implemented (T7, T11) |
| HCAL-13 | P1: See the week as a calendar | Execute | Implemented (T5) |
| HCAL-14 | P1: See the week as a calendar | Execute | Implemented (T9, T10, T11) |
| HCAL-15 | P1: Get to the detail and the actions | Execute | Implemented (T6, T9, T11, T12, T15, T16, T17, T18, T19) |
| HCAL-16 | P1: Get to the detail and the actions | Execute | Implemented (T5, T9, T12, T15, T16) |
| HCAL-17 | P1: Get to the detail and the actions | Execute | Implemented (T5, T9, T12, T15, T16, T18) |
| HCAL-18 | P1: Get to the detail and the actions | Execute | Implemented (T7, T9, T11, T12, T15, T16) |
| HCAL-19 | P1: Get to the detail and the actions | Execute | Implemented (T6, T7, T9, T11, T12, T15, T16) |
| HCAL-20 | P1: Get to the detail and the actions | Execute | Implemented (T7, T11) |
| HCAL-21 | P2: Read the colours and the live time | Execute | Implemented (T4, T8, T11, T12, T13, T16, T18) |
| HCAL-22 | P2: Read the colours and the live time | Execute | Implemented (T7, T11) |
| HCAL-23 | P2: Read the colours and the live time | Execute | Implemented (T5, T7, T11) |
| HCAL-24 | P1: See the week as a calendar | Execute | Implemented (T4, T9, T11) |
| HCAL-25 | P1: Get to the detail and the actions | Execute | Implemented (T12, T15, T16, T18, T19) |
| HCAL-26 | P2: Read the colours and the live time | Execute | Implemented (T12, T14, T16) |
| HCAL-27 | P1: Get to the detail and the actions | Execute | Implemented (T17, T18, T19) |

**Coverage:** 27 total, 27 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] The week reads as columns Monday to Friday, weekend columns appearing only with time
- [ ] Parallel agents show as side-by-side bars, never overlapping
- [ ] Every shipped Hours action — groups, raw periods, edit, delete, Copy — works from the day detail
- [ ] The Copy output for a day is byte-identical to what the list view produced
- [ ] The gate is green: `npm run typecheck && npm run lint && npm test`
