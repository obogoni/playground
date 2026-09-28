# Hours Task Assign Specification

## Problem Statement

A period's task comes only from the branch name: when a period opens, the tracker reads the branch of
the session's folder and takes the task id from its last segment (`buildSnapshot`,
`time-snapshot.ts:32-47`). Two cases break it. Work done before a task exists (diagnosis, planning)
runs on `develop` and lands under **No task · {folder}**, and the Hours drawer can only edit a
period's bounds or delete it (the time-tracking spec left re-attribution out, Q12). And once
worktrees move out of the app, sessions will start on `develop` and every period they record will
be No task. The owner needs to set a period's task by hand, live on the session and after the fact
in the drawer. Scope is upstream issue #133, grilled and approved by the owner.

## Goals

- [ ] A session can be linked to any work item, from the new-session dialog, its rail row or its detail strip, and its time counts to that item from the minute it is linked
- [ ] A closed period can be moved to another task, to No task or back to its branch's task, and split in two at a time inside it
- [ ] Every report (task totals, calendar, legend, Copy) follows the changed task, and a hand-set task is recognisable with its original branch one hover away
- [ ] Time logs written before the feature read unchanged, and logs written by it stay readable by the previous build

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Removing worktree creation and removal from the app | Issue #133: planned for when the agent owns that flow |
| Working out the task from what the agent edits | Issue #133: hook events carry a cwd; a later idea |
| Creating a period by hand (meetings, work outside the app) | Issue #133; time-tracking Q12 still holds for this |
| Reassigning a whole drawer block in one action | Issue #133: periods are changed one at a time |
| Pinning a work item chosen by typing its number | Owner decision: the pinned list stays the one the owner curates |
| Storing a work item's type or state on a session or period | Owner decision: the session and the period keep id and title only |
| Editing a period's workspace, repo, branch, cwd or agent | Only the task changes; the branch field is never rewritten (owner decision) |
| Changing a running period's task from the drawer | Owner decision: live time changes through its session only |
| Repainting the calendar when an edit brings a new task into the shown week | HCAL-24 (colours frozen while the week is shown) is unchanged; see Assumptions |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Scope | Upstream issue #133, as written | Grilled and approved by the owner | y |
| One picker everywhere | The same picker in the dialog, the rail row, the detail strip and the drawer: pinned tasks (first pin of an id, like the rail) plus a field to type a number or paste a work item URL | Owner decision; the URL form comes free with `parseTaskInput` (`task-board.ts:34-70`) | y |
| Lookup trigger | Only on an explicit submit (Enter or the `Look up` button), never per keystroke | AD-023: no surface reaches the network unless the user asks | y |
| Lookup result | One row, `{type} #{id} {title}`, which the user then chooses; a failure shows the error and chooses nothing | Owner decision (type and title shown; failure chooses nothing) | y |
| Lookup error texts | The pin path's texts: parse errors from `parseTaskInput`, `Could not reach Azure DevOps — run az login and try again.`, `Work item #{id} not found in {org}/{project}.` | One vocabulary for the same fetch (`task-board.ts:148-157`) | y |
| What is stored | Session link and period: task id and title; title null when unknown | Owner decision | y |
| Where the rail row offers the change | Right-click the session's row in the rail: a menu with `Change task…` opens the picker | RAIL-12 forbids adding controls to a rail row (only tile, label, status, time, dot, actions); a context menu renders nothing on the row, like the sidebar's and the commit list's menus | owner confirmed 2026-09-26 |
| The mark rule | A period records `taskByHand: true` only when its hand-set task differs from the task its branch names; choosing the branch's own task, or From branch, records no flag | Without it, every session opened from a task card, in that task's worktree, would mark all its periods by hand although nothing differs from the branch, and the mark would stop meaning anything | owner confirmed 2026-09-26 |
| Session picker entries | From branch, the pinned tasks, the typed lookup. No `No task` entry for a session | The issue lists No task only for the drawer | owner confirmed 2026-09-26 |
| Duplicating a linked session | The copy keeps the link | A duplicate continues the same work; respawn keeps the link too, by persistence | owner confirmed 2026-09-26 |
| Mark tooltip without a branch | `Assigned by hand (no branch)` when the period was recorded outside a git folder | The issue's text `Assigned by hand (branch: {branch})` needs a value; `branch: null` reads as a bug | owner confirmed 2026-09-26 |
| A new task appearing in the shown week after an edit | Its bars wear the neutral Other colour and its chip joins the legend; colours are reassigned when the week is reopened | HCAL-24 unchanged: a live change must not repaint the week the owner is reading | owner confirmed 2026-09-26 |
| Stopped session | Its link can be changed; it is saved and applies from the next respawn | "Changeable at any time"; there is no open period to close | y |
| Paused or suspended session | Changing the link opens no period; the next period (resume, wake) carries the new task | Pausing means no counting (TIME-16); the change must not start one | y |
| Linking the task the session already has | No change: no period is closed or opened | Idempotent; a stray click must not split a period | y |
| Changing the link less than 1 s after a period opened | The closed part is discarded by the existing 1 s rule (TIME-11) and the new period opens | Reuses TIME-11 unchanged | y |
| Title of a linked task | The title chosen in the picker; when it is null, the pinned title for that id at open time | Same fallback the branch path uses (`time-snapshot.ts:45`) | y |
| From branch in the drawer | Task id from the period's stored branch by the branch rule (`taskIdFromBranch`), title from the pinned cache, flag cleared | The branch field is the record of what the branch said; it is never rewritten | y |
| Split part identity | The first part keeps the period's id; the second gets a new id and follows it in the log; every other field is copied | An open drawer row keeps pointing at the same first part | y |
| Split time field | A date-and-time field to the second, like Edit, pre-filled with the period's midpoint rounded down to the second | Reuses the Edit form's local-time conversion (`PeriodRow.tsx:22-33`); a midpoint is always inside when a split is possible | y |
| Report label for a hand-set work item | Unchanged TIME-40: `Task #{id} {title}`, live pinned title first, then the stored title, whatever the item's type | The report label and the Clockify format stay exactly as shipped | y |
| Log format | Lines keep `v: 1`; `taskByHand` is an optional boolean written only when true; a line whose `taskByHand` is present but not a boolean is skipped as invalid | A version bump would make the previous build skip, then drop on its next rewrite, every new line; an optional field it does not know is carried through its spread (`time-log-store.ts:71,144`) | y |
| Time-tracking spec | The Out of Scope row "Editing the snapshot fields (task, worktree) of a period" is superseded for the task field, and TIME-03 is amended (a session link comes before the branch); recorded as AD-048 at Execute (T27) | AD-018 pattern: a merged spec must not describe behaviour that no longer ships | y |
| Rail spec | RAIL-08 is amended: a linked task with no pinned details shows the link's title in place of the branch; RAIL-09/10 apply only to sessions with no task after the link | A linked session on `develop` would otherwise show `develop` as its task title | y |
| Base branch | `feature/hours-task-assign` cut from `feature/hours-task-focus` (PR #129), itself on `feature/hours-calendar` (PR #99); the PR carries `Closes #133` and "depends on #129" | Owner-approved stacking; the drawer and its colours exist only there | y |
| PR #98 (`feature/session-strip-polish`, not in this base) | Rebase conflict hotspots: `AgentsView.tsx` (#98 rewrites the detail header's clock and removes the Pause/Resume buttons; this feature edits the strip below it and adds props at the end of `SessionDetail`'s list), `Icon.tsx` (#98 edits one comment; new icons are appended), `rail-groups.test.ts` and `activity-notification.test.ts` (#98 inserts tests mid-file; this feature appends new `describe` blocks) | Placing every change away from #98's hunks keeps the expected conflict to context lines | y |

**Open questions:** none — every gap is logged above; the six rows marked `owner confirmed 2026-09-26` carry the recommended default the plan is built on.

### Implicit-requirement sweep

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | HTSK-29..31 (split bounds, 1 s parts, valid date), HTSK-05 (lookup parse); a task choice comes only from a pin or a successful lookup, so it needs no further check |
| Failure / partial-failure states | HTSK-05 (lookup failure chooses nothing); a failed log rewrite keeps the existing retry path (TIME-14, unchanged) |
| Idempotency / retry / duplicate handling | HTSK-14 (same link is a no-op); a repeated reassign to the same task rewrites the same content |
| Auth boundaries & rate limits | HTSK-03 (lookup only on explicit submit); N/A otherwise because the app is single-user and local |
| Concurrency / ordering | HTSK-12 (close and open at one instant); HTSK-30 (a stale or open period is rejected by main, which owns every write, AD-021) |
| Data lifecycle / expiry | HTSK-17 (link persisted with the session, removed with it), HTSK-39..41 (log compatibility) |
| Observability | N/A because edits already return their verdict to the drawer and the log rewrite logs its own failures (TIME-14) |
| External-dependency failure | HTSK-05 (Azure DevOps unreachable or item missing) |
| State-transition integrity | HTSK-12..16 (running, paused, suspended, stopped), HTSK-32 (running period has no controls) |

---

## User Stories

### P1: Pick a task ⭐ MVP

**User Story**: As a developer, I want one picker that offers my pinned tasks and finds any work item by its number, so that the usual choice is one click and an unpinned item is still reachable.

**Why P1**: Every other story chooses a task through it.

**Acceptance Criteria**:

1. The picker SHALL list the pinned tasks, the first pin of an id only, each as `#{id}` followed by its type pill and title when the pin's details are cached, and as `#{id}` alone otherwise
2. WHEN the user submits a number or a work item URL in the picker's field THEN the app SHALL fetch that work item from Azure DevOps and show one result row reading `{type} #{id} {title}`
3. The picker SHALL reach Azure DevOps only on an explicit submit (Enter or `Look up`), never while the user types
4. WHEN the user chooses a looked-up work item THEN the pinned task list SHALL stay unchanged
5. IF the lookup fails to parse, cannot reach Azure DevOps, or finds no item THEN the picker SHALL show the pin path's error text and choose nothing
6. WHEN the user chooses a task THEN the app SHALL keep its id and its title, the title being null when the pin has no cached details

**Independent Test**: With one pinned task and Azure DevOps reachable, open any picker: the pin is listed; typing an unpinned number and pressing Enter shows its type and title; choosing it leaves the Tasks pane as it was.

---

### P1: Link a session to a task ⭐ MVP

**User Story**: As a developer diagnosing on `develop`, or whose sessions start on `develop`, I want to link my session to a work item when I start it or at any time after, so that its time counts to that item from the first minute.

**Why P1**: The first half of the request (user stories 1 to 8 of the issue).

**Acceptance Criteria**:

7. The new-session dialog SHALL show a Task field whose initial value is `From branch`
8. WHEN the new-session dialog is opened from a pinned task card THEN its Task field SHALL start on that task
9. WHEN a session is spawned with a task THEN every period it opens SHALL record that task's id and title
10. WHILE a session has no link, the periods it opens SHALL record the task its branch names, or none, exactly as TIME-03 records today
11. WHILE a session has a link, the app SHALL use the link over the branch: its periods SHALL record the linked task, the rail SHALL place the session in that task's group, and the detail strip SHALL show that task
12. WHEN the user changes the task of a running, counting session THEN the tracker SHALL close its open period at that instant and open a new period with the new task starting at the same instant
13. WHEN the user chooses `From branch` for a linked session THEN the link SHALL be removed and the next period SHALL record the task its branch names
14. WHEN the user chooses the task the session is already linked to THEN the tracker SHALL neither close nor open a period
15. WHILE a session is paused or the machine is suspended, WHEN its task changes THEN the tracker SHALL open no period, and the next period it opens SHALL record the new task
16. WHEN the task of a stopped session is changed THEN the link SHALL be saved and the session's next run SHALL record it
17. The app SHALL save a session's link with the session in the config and SHALL restore it after an app restart and on respawn
18. The session detail strip SHALL show the session's task (`#{id}` with pills and title, or `No task`) also for a session running in a folder that is no worktree, and SHALL open the picker from it with `From branch`, the pinned tasks and the typed lookup
19. WHEN the user right-clicks a session's row in the rail THEN the app SHALL show a menu whose `Change task…` item opens the picker for that session
20. WHERE a linked task has no pinned details THEN its rail group header SHALL show the link's title in place of the branch, and the branch when the link has no title
21. WHEN a linked session raises a notification THEN the notification SHALL name the linked task, not the branch's
22. WHEN a linked session is duplicated THEN the copy SHALL carry the same link

**Independent Test**: Spawn an ad-hoc session from the dialog with a pinned task chosen: its open period records that task and the rail shows it under that task's card; change it from the strip to another task: the first period ends and a second starts at the same second.

---

### P1: Fix a period after the fact ⭐ MVP

**User Story**: As a developer reviewing yesterday's hours, I want to move a closed period to another task, and to split it at a time so each part gets its own task, so that time recorded as No task goes where it belongs.

**Why P1**: The second half of the request (user stories 12 to 14 and 17 of the issue).

**Acceptance Criteria**:

23. WHILE a period is closed, its drawer row SHALL offer `Change task` and `Split at` beside Edit and Delete
24. WHEN the user opens `Change task` on a period THEN the picker SHALL offer `No task`, `From branch`, the pinned tasks and the typed lookup
25. WHEN the user chooses a task for a closed period THEN the period SHALL record that task's id and title and keep every other field unchanged
26. WHEN the user chooses `No task` for a closed period THEN the period SHALL record a null task id and a null title
27. WHEN the user chooses `From branch` for a closed period THEN the period SHALL record the task id its stored branch names (none for a null branch), the pinned title for that id or null, and no hand flag
28. WHEN the user splits a closed period at a time strictly between its start and end, with both parts at least 1 second long, THEN the log SHALL hold two periods, `[start, at]` keeping the period's id and `[at, end]` with a new id, both with the period's task and every other field
29. IF the split time is not strictly inside the period THEN the drawer SHALL show `Split time must be inside the period.` and the log SHALL stay unchanged
30. IF either part of a split would last less than 1 second THEN the drawer SHALL show `Each part must last at least 1 second.` and the log SHALL stay unchanged
31. IF the split time is not a valid date THEN the drawer SHALL show `Split time must be a valid date.` and the log SHALL stay unchanged
32. IF the period is open or no longer in the log THEN a task change or split SHALL be rejected with `This period is still open.` or `This period no longer exists.` (TIME-47, TIME-49 wording)
33. WHEN the `Split at` form opens THEN its field SHALL hold the period's midpoint, rounded down to the second, in local time
34. WHILE a period is running, its drawer row SHALL offer neither `Change task` nor `Split at`
35. WHEN a task change or split succeeds THEN the log SHALL be rewritten atomically and the drawer SHALL show the new grouping without a manual refresh

**Independent Test**: In a past day, split a 09:00–12:00 period on `develop` at 10:00 and give the parts two different pinned tasks: the day shows two task groups, 1h00 and 2h00.

---

### P1: See which tasks were set by hand ⭐ MVP

**User Story**: As a developer, I want periods whose task I set by hand to be marked, with the original branch in the tooltip, so that I know which numbers I changed.

**Why P1**: The issue's story 15; the only trace of a change once it is made.

**Acceptance Criteria**:

36. WHEN a period's task is set by hand (a session link, or a drawer choice of a task or `No task`) and differs from the task its branch names THEN the period SHALL record `taskByHand: true`
37. WHEN a hand-set task equals the task the period's branch names, or `From branch` is chosen THEN the period SHALL record no hand flag
38. WHERE a period records `taskByHand: true` THEN its drawer row SHALL show a mark whose tooltip reads `Assigned by hand (branch: {branch})`, or `Assigned by hand (no branch)` when the period has no branch
39. The app SHALL never rewrite a period's `branch` field

**Independent Test**: The split parts above show the mark with `Assigned by hand (branch: develop)`; choosing From branch on one removes its mark.

---

### P1: Reports follow the task, old logs still read ⭐ MVP

**User Story**: As a developer, I want every total and the Clockify copy to follow a changed task, and my existing log to keep working, so that every report agrees and nothing recorded is lost.

**Why P1**: A change no report shows is not a change; a format change that loses history is a regression.

**Acceptance Criteria**:

40. The task card total, the rail group total, the calendar bars and legend, the day drawer's groups and Copy SHALL group a period by the task id it records, whatever its branch names
41. WHEN the log holds a line without `taskByHand` THEN the app SHALL read it as a period with no hand flag
42. The app SHALL write every period line with `v: 1`, and SHALL write `taskByHand` only when it is true
43. IF a log line carries a `taskByHand` that is not a boolean THEN the app SHALL skip it as invalid, like any other malformed line (TIME-13)

**Independent Test**: A log written before the feature loads with every period unmarked; after a reassignment, the moved time appears under the new task in the legend, the drawer and the copied text.

---

## Edge Cases

- WHEN a session linked to Task #12345 runs in a worktree whose branch names Task #67890 THEN its periods SHALL record #12345 with the hand flag and the rail SHALL show it under #12345 (HTSK-11, HTSK-36)
- WHEN a linked task is later unpinned THEN the session and its periods SHALL keep the stored id and title (HTSK-06)
- WHEN a session's link changes less than 1 second after its period opened THEN the closed part SHALL be discarded (TIME-11) and the new period SHALL open (HTSK-12)
- WHEN a period crossing midnight is split THEN both parts SHALL keep their exact instants and each SHALL count on the days it touches (TIME-32 unchanged, HTSK-28)
- WHEN the lookup is asked for an item that is already pinned THEN it SHALL return it like any other item (HTSK-02)
- WHEN a period is split at exactly start + 1 s or end − 1 s THEN the split SHALL succeed (HTSK-28, HTSK-30)
- WHEN an edit brings a task into the shown week for the first time THEN its bars SHALL wear Other until the week is reopened (HCAL-24 unchanged)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| HTSK-01 | P1: picker — AC 1 | Execute | Implemented: T13, T18, T19, T30 |
| HTSK-02 | P1: picker — AC 2 | Execute | Implemented: T8, T9, T10, T13, T18, T28 |
| HTSK-03 | P1: picker — AC 3 | Execute | Implemented: T18 |
| HTSK-04 | P1: picker — AC 4 | Execute | Implemented: T8, T18 |
| HTSK-05 | P1: picker — AC 5 | Execute | Implemented: T8, T18 |
| HTSK-06 | P1: picker — AC 6 | Execute | Implemented: T2, T13, T18 |
| HTSK-07 | P1: session — AC 7 | Execute | Implemented: T21, T31 |
| HTSK-08 | P1: session — AC 8 | Execute | Implemented: T21, T28, T31 |
| HTSK-09 | P1: session — AC 9 | Execute | Implemented: T3, T6, T9, T10, T17, T21, T31 |
| HTSK-10 | P1: session — AC 10 | Execute | Implemented: T2, T3, T27, T31 |
| HTSK-11 | P1: session — AC 11 | Execute | Implemented: T2, T3, T11, T12, T22, T30, T31 |
| HTSK-12 | P1: session — AC 12 | Execute | Implemented: T3, T6, T9, T10, T17, T30 |
| HTSK-13 | P1: session — AC 13 | Execute | Implemented: T3, T6, T22, T30, T31 |
| HTSK-14 | P1: session — AC 14 | Execute | Implemented: T3, T30 |
| HTSK-15 | P1: session — AC 15 | Execute | Implemented: T3, T6 |
| HTSK-16 | P1: session — AC 16 | Execute | Implemented: T3, T6 |
| HTSK-17 | P1: session — AC 17 | Execute | Implemented: T6, T30 |
| HTSK-18 | P1: session — AC 18 | Execute | Implemented: T11, T13, T22, T30 |
| HTSK-19 | P1: session — AC 19 | Execute | Implemented: T23, T30 |
| HTSK-20 | P1: session — AC 20 | Execute | Implemented: T12, T23, T27 |
| HTSK-21 | P1: session — AC 21 | Execute | Implemented: T7, T28 |
| HTSK-22 | P1: session — AC 22 | Execute | Implemented: T6 |
| HTSK-23 | P1: drawer — AC 23 | Execute | Implemented: T20, T25, T26, T29 |
| HTSK-24 | P1: drawer — AC 24 | Execute | Implemented: T13, T26 |
| HTSK-25 | P1: drawer — AC 25 | Execute | Implemented: T2, T4, T9, T10, T26, T27, T29 |
| HTSK-26 | P1: drawer — AC 26 | Execute | Implemented: T2, T4, T26, T29 |
| HTSK-27 | P1: drawer — AC 27 | Execute | Implemented: T2, T4, T26, T29 |
| HTSK-28 | P1: drawer — AC 28 | Execute | Implemented: T5, T9, T10, T25, T28, T29 |
| HTSK-29 | P1: drawer — AC 29 | Execute | Implemented: T5, T25, T29 |
| HTSK-30 | P1: drawer — AC 30 | Execute | Implemented: T5, T25 |
| HTSK-31 | P1: drawer — AC 31 | Execute | Implemented: T5, T25 |
| HTSK-32 | P1: drawer — AC 32 | Execute | Implemented: T4, T5 |
| HTSK-33 | P1: drawer — AC 33 | Execute | Implemented: T14, T25, T29 |
| HTSK-34 | P1: drawer — AC 34 | Execute | Implemented: T25, T26, T29 |
| HTSK-35 | P1: drawer — AC 35 | Execute | Implemented: T4, T5, T16, T25, T26, T29 |
| HTSK-36 | P1: mark — AC 36 | Execute | Implemented: T2, T3, T4, T29, T31 |
| HTSK-37 | P1: mark — AC 37 | Execute | Implemented: T2, T3, T4, T29, T31 |
| HTSK-38 | P1: mark — AC 38 | Execute | Implemented: T14, T20, T24, T29 |
| HTSK-39 | P1: mark — AC 39 | Execute | Implemented: T4, T29 |
| HTSK-40 | P1: reports — AC 40 | Execute | Implemented: T15, T29 |
| HTSK-41 | P1: reports — AC 41 | Execute | Implemented: T1 |
| HTSK-42 | P1: reports — AC 42 | Execute | Implemented: T1 |
| HTSK-43 | P1: reports — AC 43 | Execute | Implemented: T1 |

**Coverage:** 43 total, 43 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] A morning of diagnosis on `develop` is booked to its user story without touching the log by hand
- [ ] A week in which sessions start on `develop` produces a Clockify copy with no No task lines the owner did not intend
- [ ] The owner's existing `time-log.jsonl` loads with every period intact and unmarked

---

## Follow-ups

Recorded by the Verifier (PASS, round 1, 2026-09-27) under the owner's budget rules: none is a
production defect, and every AC has evidence. Details in `validation.md`, § Follow-ups.

- **F1** ~~HTSK-30: no test splits a period with only one part under 1 s (unit survivor U12)~~ Closed 2026-09-27: two rows in `time-tracker.test.ts`; U12 now killed
- **F2** HTSK-38: the smoke has no row where the task is set but the flag is not, so a mark driven by the task would pass (smoke survivor S2)
- **F3** ~~HTSK-43: no store case for `taskByHand: false` (read) or `null` (skipped) (unit survivors U19, U20)~~ Closed 2026-09-27: one case in `time-log-store.test.ts`; U19 and U20 now killed
- **F4** HTSK-03 holds by construction only; the typed lookup stays on the hand-verify list
- **F5** Thin smoke evidence: synthetic `contextmenu`, pickers clicked with `.click()`, the closed row built by pause and resume; restart, notification text, the strip's `No task`, the linked header title and the mark's look are hand checks
- **F6** The seeded `acme/platform` pins fire a real, failing details fetch on focus, and the checks rely on it failing

**Owner decision (2026-09-27), from the Verifier's spec-precision gap 1:** linking an unlinked
session to the task its own branch already names closes its open period and opens an identical one
(same task, no hand flag). This is accepted as it ships; HTSK-14's no-op covers only a session
already *linked* to the chosen task.
