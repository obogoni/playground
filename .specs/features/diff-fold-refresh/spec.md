# Diff Fold Refresh Specification

## Problem Statement

All changes folds the unchanged parts of each file into Monaco's strips (FDIF-13), so a section reads
as hidden lines, the changed hunk, hidden lines. While an agent is still writing in the worktree, a
section sometimes switches to showing the whole file and stays that way; the only way back is to fold
every revealed region by hand, strip by strip, section by section. Nothing folds or reveals the
unchanged lines of all sections at once: Expand all / Collapse all (#108, PR #125) open and close
whole file sections, not the lines inside them. Upstream issue #130 is the owner-approved scope.

## Goals

- [ ] A diff that was folded is still folded after every refresh an agent's writes cause
- [ ] A region the user revealed by hand is still revealed after a refresh, where it still exists
- [ ] One click folds, and one click reveals, the unchanged lines of every section of a tab

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Changing the strip settings (3 context lines, 3-line minimum, 20 lines per reveal step) or the diff algorithm | Issue #130, Out of Scope |
| Remembering the Hide / Show choice across restarts or across tabs | Issue #130, Out of Scope |
| Staging, reverting or any write from the diff | Issue #130: the discard feature is tracked separately |
| A pressed look on the button last pressed | Not requested; the two buttons are plain actions |
| Remembering hand-revealed regions across a remount (a section scrolled far away and back, a tab switched away and back) | Today's behaviour: a remounted section gets a fresh editor; see the assumption below |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| The folds survive a refresh | Folded regions stay folded; a region revealed by hand stays revealed where it still exists; a region new after the change starts folded | Owner decision, issue #130 | y |
| Where the two buttons live | Hide unchanged and Show unchanged beside Expand all / Collapse all in the All changes header, which commit tabs inherit, and in the toolbar of a single file's diff tab | Owner decision, issue #130 | y |
| What the tab remembers | The last button pressed; sections that get an editor later open in that state until the other button is pressed; hand fold / reveal still works per strip; nothing is written to the config | Owner decision, issue #130 | y |
| Measure before fixing | The first task reproduces the symptom and measures the cause; if the cause differs from the one read in the code, the plan is revised with the owner before any fix | Owner decision, issue #130 | y |
| When "the region still exists" | A region of the new diff still exists when it shares at least one left-side line (the committed version, which an agent's writes do not touch) with a region of the diff before the change | The left side is the stable coordinate: right-side line numbers shift with every insertion above | y (derived) |
| A region revealed only in part (the strip's "show more above / below" or a drag) | Keeps the same number of revealed lines above and below its strip after the refresh, clamped to its new size; when a change splits it, each half keeps both counts, clamped to its own size | Monaco keeps partial reveals the same way when its own state survives | owner confirmed 2026-09-26; split case recorded 2026-09-27 |
| A new region while Show unchanged is the tab's last choice | Starts revealed, like the rest of the tab | A reader who asked for whole files should not see a strip appear mid-read | owner confirmed 2026-09-26 |
| Several earlier regions merged into one (a change was undone) | Revealed if any of them was revealed whole, else folded: a region revealed only in part does not count | What the reader chose to read wins over the default; a few lines opened by hand are not a choice to read the merged whole | owner confirmed 2026-09-26; partial case confirmed 2026-09-27 |
| The left side changed as well (a commit, a base move) | Every region starts as in a newly opened diff: folded, or the tab's last choice | Left-side lines no longer identify the same text | owner confirmed 2026-09-26 |
| A section that remounts (scrolled past the mount margin and back, or its tab left and re-entered) | Opens folded, or in the tab's last choice; hand reveals are not carried across the remount | Today a remount builds a fresh editor (`mountPlan`, D1), and the issue asks only about refreshes | owner confirmed 2026-09-26 |
| The choice across a tab switch and a lens switch | Kept: leaving All changes for another tab and coming back, or switching Uncommitted and Diff to origin, keeps All changes' last choice; a diff tab keeps its own | The issue puts the choice in the Files view state for the tab, and All changes is one tab across both diff lenses (FDIF-17) | owner confirmed 2026-09-26 |
| Closing a tab | Drops its choice; the same diff opened again starts folded | A reopened tab is a new tab; the choice is not remembered across tabs | owner confirmed 2026-09-26 |
| Added, deleted, identical, binary or too-large files | Unchanged: no strip to fold, so both buttons change nothing for them | FDIF-03/04/06/23 and the identical note already cover how they read | y |
| A write that passes through an empty file (truncate, then write) | The empty state has no unchanged region, so hand reveals are forgotten and every region after it starts folded (or per the tab's choice) | Nothing is left to match against; recorded so the executor does not chase it | y (limitation) |
| If Monaco's saved fold state cannot be read (a future Monaco changes its shape) | The diff updates exactly as today, unfolding included; nothing throws | `monaco-editor` is pinned at 0.56.0; the smoke catches a changed shape on upgrade | y |

**Open questions:** none unmarked. The rows marked "owner confirmed 2026-09-26" carry the recommended default the
plan is built on.

---

## User Stories

### P1: The folds survive a refresh ⭐ MVP

**User Story**: As a developer reviewing an agent's work in progress, I want All changes and a diff tab
to keep showing only the changed lines while the agent writes files, so that I do not lose my place in
a wall of unchanged code.

**Why P1**: The reported defect.

**Acceptance Criteria**:

1. WHEN a diff first shows a text file in a tab with no Hide / Show choice THEN the viewer SHALL fold every unchanged region the strip settings allow into a strip <!-- event-driven -->
2. WHEN the file under an open diff changes on disk THEN every region that was folded before the change and still exists SHALL stay folded <!-- event-driven -->
3. WHEN the file under an open diff changes on disk THEN every region the user had revealed by hand, and that still exists, SHALL stay revealed <!-- event-driven -->
4. WHILE the tab's last choice is not Show unchanged, WHEN a change creates a region that did not exist before THEN the viewer SHALL fold it <!-- complex -->
5. WHEN the file under an open diff changes on disk THEN a region revealed in part SHALL keep the same number of revealed lines above and below its strip, clamped to its new size <!-- event-driven -->
6. WHEN one region of the new diff overlaps several regions of the previous one THEN the viewer SHALL reveal it if any of them was revealed whole, and fold it otherwise <!-- event-driven -->
7. IF the left side's text changed too THEN every region SHALL start as in a newly opened diff: folded, or in the tab's last choice <!-- unwanted-behavior -->
8. WHEN two disk changes land before the diff recomputes THEN the viewer SHALL carry the fold state from before the first change <!-- event-driven -->
9. The diff SHALL keep updating within 1 s of a disk change with its scroll kept (FDIF-30, unchanged) <!-- ubiquitous -->
10. The strip settings SHALL stay 3 context lines, a 3-line minimum and 20 lines per reveal step, and the region rule the app computes SHALL use those same values <!-- ubiquitous -->

**Independent Test**: Open All changes on a 200-line file changed near the top and the bottom; reveal
the middle strip; rewrite the file with a third change. The middle stays revealed, the others stay
folded, and the new region is folded.

---

### P1: Hide unchanged / Show unchanged ⭐ MVP

**User Story**: As a developer, I want one button that folds the unchanged lines of every section and
one that reveals them, so that I get back to hunks only, or to whole files, in one click.

**Why P1**: The issue's second half; the recovery for any section already showing its whole file.

**Acceptance Criteria**:

11. WHILE All changes lists at least one file, its header SHALL show Hide unchanged and Show unchanged beside Expand all and Collapse all <!-- state-driven -->
12. WHEN the user presses Hide unchanged THEN every unchanged region of every section holding an editor SHALL fold, hand-revealed ones included <!-- event-driven -->
13. WHEN the user presses Show unchanged THEN every unchanged region of every section holding an editor SHALL be revealed, leaving no strip <!-- event-driven -->
14. WHEN a section gets its editor after a press (scrolled into view, or its file section expanded) THEN it SHALL open in the state of the last button pressed in that tab <!-- event-driven -->
15. WHILE Show unchanged is the tab's last choice, WHEN a change creates a region that did not exist before THEN the viewer SHALL reveal it <!-- complex -->
16. WHEN the user reveals or folds one strip by hand after either button THEN only that strip SHALL change <!-- event-driven -->
17. WHEN the user presses Hide unchanged or Show unchanged in a commit tab THEN every section of that commit SHALL fold or reveal, as in All changes <!-- event-driven -->

**Independent Test**: With two sections open, Show unchanged removes every strip; Collapse all then
Expand all brings both back without strips; Hide unchanged folds them again.

---

### P1: The same buttons on one file's diff ⭐ MVP

**User Story**: As a developer, I want Hide unchanged and Show unchanged in a single file's diff tab,
so that one file behaves like All changes.

**Why P1**: Owner decision; the single diff tab has the same refresh path and the same defect.

**Acceptance Criteria**:

18. WHILE a file's diff tab is active, the diff toolbar SHALL show Hide unchanged and Show unchanged, acting on that tab's editor <!-- state-driven -->
19. WHEN the user leaves a tab and comes back while the app runs THEN the tab SHALL open in its last choice <!-- event-driven -->
20. WHEN the user switches All changes between Uncommitted and Diff to origin THEN All changes SHALL keep its last choice <!-- event-driven -->
21. WHEN the user closes a tab THEN its choice SHALL be dropped, and the same diff opened again SHALL start folded <!-- event-driven -->
22. The tab's choice SHALL live in memory only and SHALL NOT be written to the config <!-- ubiquitous -->

**Independent Test**: In a file's diff tab press Show unchanged, switch to All changes and back: the
file is still whole. Close the tab and reopen the diff: it is folded.

---

## Edge Cases

- WHEN a section remounts (scrolled past the mount margin and back, or its tab re-entered) THEN it SHALL open folded or in the tab's last choice, without the hand reveals it had
- WHEN a file is added, deleted, identical, binary or too large THEN both buttons SHALL change nothing for it, and it SHALL read as today
- IF Monaco's saved fold state cannot be read THEN the diff SHALL update as today and nothing SHALL throw
- WHEN a write empties the file for a moment THEN every region after it SHALL start folded, or in the tab's last choice
- WHEN no section holds an editor as a button is pressed (all collapsed) THEN the press SHALL still be remembered, and SHALL apply to the sections as they get editors

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FOLD-01 | P1: survive — AC 1 | T2, T6 / 14a | Verified |
| FOLD-02 | P1: survive — AC 2 | T4, T6 / 14b, 14f | Verified |
| FOLD-03 | P1: survive — AC 3 | T3, T4, T13 / 14c | Verified |
| FOLD-04 | P1: survive — AC 4 | T4, T13 / 14b, 14d | Verified |
| FOLD-05 | P1: survive — AC 5 | T3, T4, T14 | Verified |
| FOLD-06 | P1: survive — AC 6 | T4, T14 | Verified |
| FOLD-07 | P1: survive — AC 7 | T4 | Verified |
| FOLD-08 | P1: survive — AC 8 | T6, T15 (rule unit-tested; call site by code) | Verified |
| FOLD-09 | P1: survive — AC 9 | T6, T16, T17 / 14b, 14f, 14f2 | Verified |
| FOLD-10 | P1: survive — AC 10 | T2 / 14a | Verified |
| FOLD-11 | P1: buttons — AC 11 | T9 / 14h | Verified |
| FOLD-12 | P1: buttons — AC 12 | T4, T5, T7 / 14i | Verified |
| FOLD-13 | P1: buttons — AC 13 | T4, T7 / 14k | Verified |
| FOLD-14 | P1: buttons — AC 14 | T5, T7 / 14l | Verified |
| FOLD-15 | P1: buttons — AC 15 | T4, T7 / 14l | Verified |
| FOLD-16 | P1: buttons — AC 16 | T7 / 14j | Verified |
| FOLD-17 | P1: buttons — AC 17 | T10 / 14r | Verified |
| FOLD-18 | P1: diff tab — AC 18 | T10 / 14p | Verified |
| FOLD-19 | P1: diff tab — AC 19 | T8 / 14p | Verified |
| FOLD-20 | P1: diff tab — AC 20 | T10 / 14n | Verified |
| FOLD-21 | P1: diff tab — AC 21 | T5, T8 / 14p | Verified |
| FOLD-22 | P1: diff tab — AC 22 | T8 / 14q | Verified |
| FOLD-23 | Edge: remount | T7 / 14g | Verified |
| FOLD-24 | Edge: files with nothing to fold | T9 / 14o | Verified |
| FOLD-25 | Edge: unreadable fold state | T3, T6, T15 | Verified |
| FOLD-26 | Edge: a write through an empty file | T4 | Verified |
| FOLD-27 | Edge: a press with no editor mounted | T5, T9 / 14m | Verified |

**Coverage:** 27 total, 27 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] An agent writing a file ten times in a row leaves its section folded ten times in a row
- [ ] A forty-file stack goes from whole files back to hunks only in one click
