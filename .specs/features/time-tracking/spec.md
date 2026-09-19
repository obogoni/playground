# Time Tracking Specification

**Base:** `feature/time-tracking`, cut from `origin/main` (`fa78f78` at spec time). Grilled with
the owner on 2026-09-16; every decision below is recorded in the Assumptions table with its
grilling question number (Q6–Q24).

## Problem Statement

The owner books hours twice a week — in Clockify, which needs **the day and the clock times**
(`09:12–11:40`), not just a total, and in the work item's completed work on Azure DevOps. Today
nothing in the app records when work happened: an agent session knows only whether its shell is
`running` or `stopped`, and that state is lost the moment the session stops. The owner
reconstructs the week from memory, commit timestamps and chat history, which is slow and
inaccurate when several agents ran in parallel on different tasks.

The app already knows the two facts that matter — when a session's terminal was alive and which
worktree (and, by the branch, which task) it ran in. This feature records them as dated periods
and turns them into per-session, per-worktree and per-task totals plus a weekly report that can
be copied into Clockify.

## Goals

- [ ] Every minute a session's terminal is alive and not paused is recorded as a dated period, attributed to its worktree and task, with at most **60 s** lost to a crash
- [ ] A session row shows its accumulated time live (`hh:mm:ss`); a worktree and a pinned task show their totals (`hh:mm`) without double-counting parallel sessions
- [ ] An **Hours** direction shows any week grouped by day → task, with clock-time lines ready to copy into Clockify in one click
- [ ] A wrong period can be corrected (deleted, or its start/end adjusted) without editing a file by hand

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Clockify API integration (pushing entries) | Owner decision Q11: copy-to-clipboard only in this feature |
| Writing Completed Work / Remaining Work to Azure DevOps | Owner decision Q11; ADO write operations are a roadmap "Future Consideration" (`.specs/project/ROADMAP.md`) |
| Creating a period by hand (meeting, work outside the app) | Owner decision Q12: delete + adjust only |
| Counting time by agent activity (`working`/`waiting`) | Owner requirement: counting is independent of session status; activity state is not consulted |
| Idle detection (keyboard/mouse inactivity) | Not requested; the manual per-session pause covers breaks (Q6, Q16) |
| Screen lock / unlock affecting the count | Owner decision Q16: lock never pauses or resumes anything |
| Persisting a manual pause across respawn or app restart | Owner decision Q24: a respawn (and a restored session) counts again |
| CSV/TSV export, Clockify import files | Owner chose per-day text (Q19) |
| Editing the snapshot fields (task, worktree) of a period | Only start/end are editable (Q12); re-attributing a period is not requested |
| Rounding rules (15-min blocks etc.) | Durations are shown truncated to the minute; rounding is Clockify's job |
| Workflow (headless) agent runs | They are not sessions and have no terminal; only `SessionManager` sessions are tracked |
| Multi-machine sync of the log | The app is single-machine; the log lives in `%APPDATA%` |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What opens and closes a period (Q6) | A period opens when a session's PTY starts (spawn, duplicate, respawn) and closes when it stops, exits, the app quits, the session is paused, or the machine suspends | Automatic tracking with manual pause; the terminal being alive is the proxy for "working on it" | y |
| Pause scope (Q16) | Per session, from the session detail bar; pausing closes that session's open period, resuming opens a new one | Owner answer "2" (per session) | y |
| Screen lock (Q16) | No effect on counting | Owner: "bloquear/desbloquear o windows não afeta em nada a contagem" | y |
| Suspend / hibernate (Q18) | `powerMonitor` `suspend` closes every open period at the suspend instant; `resume` opens a new period for every running, unpaused session | Nobody works while the machine sleeps | y |
| Pause lifetime (Q24) | A pause is in-memory, per PTY run; respawn and app restart start unpaused | Respawning is a signal of work | y |
| Overlap inside one worktree or task (Q7) | Totals are the **union** of the periods' intervals (wall-clock time) | It is the owner's working time that goes to Clockify | y |
| Parallel sessions on different tasks (Q22) | Each task gets its full time; the **day total is the union** of every period that day | The owner splits parallel time in Clockify by hand | y |
| What a period records (Q8) | A snapshot at open time: session id, agent, cwd, workspace path, repo name, branch, task id (or null), task title when the task is pinned and its details are cached | History survives worktree removal, session removal, unpinning and branch renames | y |
| Session total (Q9) | Sum of all that session's periods across every run; the tooltip adds the current run | Cumulative number is the one the owner wants on the row | y |
| No-task sessions (Q17) | Counted; grouped as **No task** by worktree/folder in the Hours view | Unattributed time still has to be booked | y |
| Where counters render (Q10) | Session row + session detail bar (`hh:mm:ss`, live); worktree total in the worktree detail pane and the orphan-group header (`hh:mm`); task total in the task-group header and on the pinned task card (`hh:mm`) | Owner picked all three; the rail groups by **task** (RAIL-02), so a task-group header shows the task total and an orphan group (one worktree/folder) shows the worktree total | y |
| Hours direction (Q20, Q21) | A fifth TopBar segment `Hours`, one week at a time (Monday–Sunday, local time) with ◀ ▶ and a "this week" reset | Full screen room for editing; week matches the booking rhythm | y |
| Report lines (Q23) | Per day, per task: periods whose intervals overlap or whose gap is ≤ 60 s merge into one line; the raw periods are listed under an expander, where edit/delete live | Several sessions on one task are one working block; 60 s absorbs heartbeat/pause jitter without merging real breaks | y |
| Copy format (Q19) | Exactly: header `dd/MM/yyyy (ddd) — total XhMM`, then one line per merged block `HH:MM–HH:MM  <label>  XhMM`, label column padded to the longest label of that day; weekday abbreviations pt-BR (`dom seg ter qua qui sex sáb`); `<label>` = `Task #<id> <title>`, `Task #<id>` without a title, `No task · <folder leaf>` | Owner selected this preview verbatim; the app UI stays English (only the copied text is pt-BR) | y |
| Duration display | Truncated (floor) to the minute for `hh:mm` / `XhMM`; seconds only on the live `hh:mm:ss` counters | Never over-report; matches what the copied lines add up to | y |
| Merged line duration | The merged block's union length, not the sum of its periods | Consistent with Q7 | y |
| Day boundaries | A period crossing local midnight is split at midnight into both days | Clockify entries are per day | y |
| Storage (Q13) | Closed periods in `%APPDATA%/playground/time-log.jsonl` (one JSON object per line, UTC ISO timestamps); open periods in a sidecar `time-open.json` rewritten every 60 s | Append-only for the common path; heartbeat does not grow the log | y |
| Editing an open period | Not allowed; the row offers no edit/delete until it closes (pause or stop) | An open period's end is "now" and moves every second | y |
| Adjust validation | `start < end`, `end ≤ now`, minimum length 1 s; start and end may fall on different days | Only guards that keep the data meaningful | y |
| Very short periods | A period shorter than 1 s is discarded on close | Spawn failures and instant exits produce noise | y |
| Branch change mid-run | The snapshot is taken when the period opens; a `git checkout` inside a running session is picked up at the next period (pause/resume, respawn, resume from suspend) | Re-resolving git state every minute is not worth the cost for a rare case | y |
| Task identity | The numeric task id from `taskIdFromBranch`; the org/project of the pin is not part of the key | Mirrors the rail's grouping and `linkedPin` first-match rule | y |
| Retention | Periods are kept forever; no pruning in this feature | ~20 periods/day ≈ 5 000 lines/year; reading them is cheap | y |
| Week start | Monday | pt-BR business week, same as Clockify's default for the owner | y |
| Removed session | Its periods stay in the log and in every total except the (gone) row | History must survive (Q8) | y |

**Open questions:** none - all resolved or logged above. The rows below Q24 were the agent's defaults
for details the grilling did not reach; the owner confirmed all of them at spec review (2026-09-16).

---

## User Stories

### P1: Sessions record dated periods ⭐ MVP

**User Story**: As the owner, I want every running session to record when its terminal was alive, attributed to its worktree and task, so that my hours exist somewhere other than my memory.

**Why P1**: Nothing else in the feature has data without it.

**Acceptance Criteria**:

1. WHEN a session's PTY starts (spawn, duplicate or respawn) THEN the app SHALL open a period for that session whose start is the start instant.  <!-- TIME-01, event-driven -->
2. WHEN a session stops, its PTY exits, or the session is paused THEN the app SHALL close that session's open period with the end at that instant and append it to `time-log.jsonl`.  <!-- TIME-02, event-driven -->
3. The app SHALL record on every period the session id, agent name, cwd, workspace path, repo name, branch, task id (null when the branch carries none) and, when the task is pinned with cached details, the task title — captured when the period opens.  <!-- TIME-03, ubiquitous -->
4. WHILE a session has an open period the app SHALL rewrite `time-open.json` with that period's last-seen instant at least every 60 s.  <!-- TIME-04, state-driven -->
5. WHEN the app starts and `time-open.json` holds periods THEN the app SHALL close each one with its end at its last-seen instant, append them to `time-log.jsonl`, and empty `time-open.json`.  <!-- TIME-05, event-driven -->
6. WHEN the operating system reports `suspend` THEN the app SHALL close every open period with the end at the suspend instant.  <!-- TIME-06, event-driven -->
7. WHEN the operating system reports `resume` THEN the app SHALL open a new period for every running session that is not paused.  <!-- TIME-07, event-driven -->
8. WHEN the screen is locked or unlocked THEN the app SHALL leave every open period unchanged.  <!-- TIME-08, event-driven -->
9. WHEN the app quits THEN the app SHALL close every open period with the end at the quit instant before the process exits.  <!-- TIME-09, event-driven -->
10. The app SHALL open and close periods regardless of the session's activity state.  <!-- TIME-10, ubiquitous -->
11. IF a period would close with a length under 1 s THEN the app SHALL discard it.  <!-- TIME-11, unwanted-behavior -->
12. IF the snapshot cannot be resolved (cwd is not a git worktree, git fails, or the cwd is gone) THEN the app SHALL still record the period with null workspace, repo and branch, and a null task id.  <!-- TIME-12, unwanted-behavior -->
13. IF `time-log.jsonl` contains a line that is not a valid period THEN the app SHALL skip that line, log it once, and keep every valid line.  <!-- TIME-13, unwanted-behavior -->
14. IF writing `time-log.jsonl` or `time-open.json` fails THEN the app SHALL keep the periods in memory, log the failure, and retry on the next write.  <!-- TIME-14, unwanted-behavior -->

**Independent Test**: Spawn a session, wait two minutes, stop it; `time-log.jsonl` holds one line whose start/end bracket the two minutes and whose branch/task match the worktree. Kill the app process mid-session; on the next launch the log holds a period ending within 60 s of the kill.

---

### P1: Pause a session ⭐ MVP

**User Story**: As the owner, I want to pause one session's counter when I step away from that task without stopping the agent, so that lunch does not land on the task.

**Why P1**: Automatic counting without a pause over-reports every break (Q6).

**Acceptance Criteria**:

1. WHILE a session is running and not paused its detail bar SHALL show a **Pause time** control.  <!-- TIME-15, state-driven -->
2. WHEN the owner activates **Pause time** THEN the app SHALL close the session's open period and mark the session paused.  <!-- TIME-16, event-driven -->
3. WHILE a session is paused its detail bar SHALL show a **Resume time** control and its counters SHALL stop advancing.  <!-- TIME-17, state-driven -->
4. WHEN the owner activates **Resume time** THEN the app SHALL open a new period for that session and clear the paused mark.  <!-- TIME-18, event-driven -->
5. WHEN a paused session is respawned, or the app restarts THEN the session SHALL start unpaused.  <!-- TIME-19, event-driven -->
6. WHILE a session is paused the PTY SHALL keep running and receiving input unchanged.  <!-- TIME-20, state-driven -->
7. IF the machine resumes from suspend while a session is paused THEN the app SHALL NOT open a period for that session.  <!-- TIME-21, unwanted-behavior -->

**Independent Test**: Pause a running session for one minute, resume, stop; the log holds two periods for the session separated by the pause, and the agent kept answering while paused.

---

### P1: Live counters and totals ⭐ MVP

**User Story**: As the owner, I want to see how long I have spent on a session, a worktree and a task while I work, so that I know where the day went without opening a report.

**Why P1**: The counter is the everyday surface of the feature (Q10).

**Acceptance Criteria**:

1. The session row in the rail SHALL show the session total as `hh:mm:ss`, advancing once per second while the session has an open period.  <!-- TIME-22, ubiquitous -->
2. The session detail bar SHALL show the session total as `hh:mm:ss` and its tooltip SHALL add the current run's time.  <!-- TIME-23, ubiquitous -->
3. The session total SHALL equal the sum of every period of that session id, the open one measured up to now.  <!-- TIME-24, ubiquitous -->
4. The worktree detail pane SHALL show the worktree total as `hh:mm`, computed as the union of every period whose cwd equals the worktree path (case-insensitive).  <!-- TIME-25, ubiquitous -->
5. The pinned task card and the rail task-group header SHALL show the task total as `hh:mm`, computed as the union of every period carrying that task id.  <!-- TIME-26, ubiquitous -->
6. The rail orphan-group header SHALL show the total of its worktree or folder as `hh:mm`, computed as the union of every period whose cwd equals that group's cwd.  <!-- TIME-27, ubiquitous -->
7. WHEN two sessions of the same worktree run from 09:00 to 10:00 THEN the worktree total SHALL add 1h00, not 2h00.  <!-- TIME-28, event-driven -->
8. WHEN a session is stopped, paused or removed THEN the totals SHALL keep every period already recorded.  <!-- TIME-29, event-driven -->
9. WHERE an entity has no recorded time the counter SHALL render `00:00` (`00:00:00` for a session) rather than being hidden.  <!-- TIME-30, optional-feature -->

**Independent Test**: Run two sessions on one worktree for five minutes; both rows count to ~00:05:00, the worktree detail and the task card both read `00:05`.

---

### P2: Hours view for booking

**User Story**: As the owner, I want a weekly report grouped by day and task with clock times I can copy, so that filling Clockify takes a paste instead of an evening.

**Why P2**: Counters (P1) already answer "how much"; the report answers "when" for Clockify, which is the booking chore itself.

**Acceptance Criteria**:

1. The TopBar SHALL offer a fifth direction segment **Hours** after Workflows, persisted in `ui.direction` like the others.  <!-- TIME-31, ubiquitous -->
2. WHEN the Hours direction opens THEN it SHALL show the current local week, Monday to Sunday, with the week range and week total in its header.  <!-- TIME-32, event-driven -->
3. WHEN the owner activates ◀ or ▶ THEN the view SHALL show the previous or next week, and **This week** SHALL return to the current one.  <!-- TIME-33, event-driven -->
4. The view SHALL list each day that has time, newest first, with the day total computed as the union of all that day's periods.  <!-- TIME-34, ubiquitous -->
   > **Superseded by HCAL-14 — see AD-029 (2026-09-19).** `hours-calendar` shows the week as day
   > columns, Monday to Friday always and the weekend only with time, instead of stacked days newest
   > first. The day total as the union of that day's periods still holds, now in each column header
   > (HCAL-03).
5. Within a day the view SHALL group periods by task id, with task-less periods grouped as **No task · <folder leaf>** per cwd, each group showing its union total.  <!-- TIME-35, ubiquitous -->
6. Within a group the view SHALL render one line per merged block, merging periods whose intervals overlap or are separated by 60 s or less, formatted `HH:MM–HH:MM` with the block's duration.  <!-- TIME-36, ubiquitous -->
7. WHEN a period crosses local midnight THEN the view SHALL count the part before midnight on the first day and the rest on the next day.  <!-- TIME-37, event-driven -->
8. WHEN the owner expands a merged line THEN the view SHALL list its raw periods with start, end, duration and agent.  <!-- TIME-38, event-driven -->
9. WHEN the owner activates **Copy** on a day THEN the app SHALL write to the clipboard that day's text in the exact format: first line `dd/MM/yyyy (ddd) — total XhMM`, then one line per merged block `HH:MM–HH:MM  <label>  XhMM` in chronological order, labels padded to the longest label of the day.  <!-- TIME-39, event-driven -->
10. The copied `<label>` SHALL be `Task #<id> <title>` when a title is known (live pinned details first, then the period snapshot), `Task #<id>` otherwise, and `No task · <folder leaf>` for task-less periods.  <!-- TIME-40, ubiquitous -->
11. WHEN a copy succeeds THEN the view SHALL show the transient confirmation `Copied` for 1.2 s.  <!-- TIME-41, event-driven -->
12. WHILE the shown week contains an open period the view SHALL refresh its totals at least once per minute.  <!-- TIME-42, state-driven -->
13. WHERE the shown week has no periods the view SHALL show `No time recorded this week.`  <!-- TIME-43, optional-feature -->

**Independent Test**: With a seeded log of a known week, open Hours, navigate to that week, copy a day and diff the clipboard against the expected text.

---

### P2: Correct a period

**User Story**: As the owner, I want to delete a wrong period or fix its start/end, so that the report matches reality before I book it.

**Why P2**: A forgotten running session over lunch is the common error; without correction the report cannot be copied as-is.

**Acceptance Criteria**:

1. WHEN the owner deletes a closed raw period and confirms THEN the app SHALL remove it from the log and every total and report SHALL drop its time.  <!-- TIME-44, event-driven -->
2. WHEN the owner saves a new start and/or end on a closed raw period THEN the app SHALL persist the new bounds and every total and report SHALL reflect them.  <!-- TIME-45, event-driven -->
3. IF the edited start is not before the edited end, the end is in the future, or the length is under 1 s THEN the app SHALL reject the edit with an inline message and persist nothing.  <!-- TIME-46, unwanted-behavior -->
4. WHILE a raw period is open the view SHALL offer neither edit nor delete for it.  <!-- TIME-47, state-driven -->
5. The app SHALL persist a delete or edit atomically, so that a crash during the write leaves either the old or the new log, never a truncated one.  <!-- TIME-48, ubiquitous -->
6. IF the edited or deleted period is no longer in the log THEN the app SHALL reject the change and refresh the view.  <!-- TIME-49, unwanted-behavior -->

**Independent Test**: Adjust a period's end 30 minutes earlier; the day total drops by 30 minutes; restart the app and the change persists.

---

## Edge Cases

- WHEN the app crashes and restarts after a suspend that never resumed THEN the recovered period SHALL end at its last-seen instant (≤ 60 s before the suspend) — covered by TIME-05.
- IF the system clock moves backwards so that a closing period's end precedes its start THEN the app SHALL discard that period — covered by TIME-11.
- WHEN a session is removed while it has no open period THEN its periods SHALL remain in the Hours view under their task — covered by TIME-29.
- WHEN two pins share a task id across orgs THEN the task total SHALL still be one union by id — logged in Assumptions (task identity).
- WHEN a worktree is deleted THEN its periods SHALL keep their snapshot and still appear under their task — covered by TIME-03/TIME-29.
- IF `time-open.json` is corrupt at startup THEN the app SHALL back it up as `time-open.json.bak-<epoch>` and start with no open periods — covered by TIME-13 (same skip-and-log rule, applied to the whole sidecar).

---

## Implicit-Requirement Dimensions Sweep

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | TIME-46 (edit bounds), TIME-11 (minimum length), TIME-13 (log lines validated on read) |
| Failure / partial-failure states | TIME-05 (crash recovery), TIME-14 (write failure), TIME-48 (atomic rewrite), TIME-12 (snapshot failure) |
| Idempotency / retry / duplicate handling | TIME-49 (stale edit target); closing an already-closed period is a no-op (design) |
| Auth boundaries & rate limits | N/A because the log is local, single-user, reached only through the app's own IPC |
| Concurrency / ordering | Main process is the single writer (design); renderer edits go through IPC and are serialized; TIME-28 covers parallel sessions |
| Data lifecycle / expiry | Kept forever (Assumptions: retention); removal of sessions/worktrees keeps history (TIME-29) |
| Observability | TIME-13/TIME-14 log to the main-process console like `ConfigStore` |
| External-dependency failure | git for the snapshot (TIME-12); `powerMonitor` events absent = counting continues (design); clipboard write failure logged, no confirmation shown (design) |
| State-transition integrity | Period open/close guarded per session (TIME-01/02/16/18/21); design state machine rejects double open |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TIME-01 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-02 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-03 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-04 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-05 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-06 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-07 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-08 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-09 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-10 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-11 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-12 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-13 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-14 | P1: Sessions record dated periods | Tasks | In Tasks |
| TIME-15 | P1: Pause a session | Tasks | In Tasks |
| TIME-16 | P1: Pause a session | Tasks | In Tasks |
| TIME-17 | P1: Pause a session | Tasks | In Tasks |
| TIME-18 | P1: Pause a session | Tasks | In Tasks |
| TIME-19 | P1: Pause a session | Tasks | In Tasks |
| TIME-20 | P1: Pause a session | Tasks | In Tasks |
| TIME-21 | P1: Pause a session | Tasks | In Tasks |
| TIME-22 | P1: Live counters and totals | Tasks | In Tasks |
| TIME-23 | P1: Live counters and totals | Tasks | In Tasks |
| TIME-24 | P1: Live counters and totals | Tasks | In Tasks |
| TIME-25 | P1: Live counters and totals | Tasks | In Tasks |
| TIME-26 | P1: Live counters and totals | Tasks | In Tasks |
| TIME-27 | P1: Live counters and totals | Tasks | In Tasks |
| TIME-28 | P1: Live counters and totals | Tasks | In Tasks |
| TIME-29 | P1: Live counters and totals | Tasks | In Tasks |
| TIME-30 | P1: Live counters and totals | Tasks | In Tasks |
| TIME-31 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-32 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-33 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-34 | P2: Hours view for booking | Tasks | In Tasks — **superseded by HCAL-14 (AD-029)** |
| TIME-35 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-36 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-37 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-38 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-39 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-40 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-41 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-42 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-43 | P2: Hours view for booking | Tasks | In Tasks |
| TIME-44 | P2: Correct a period | Tasks | In Tasks |
| TIME-45 | P2: Correct a period | Tasks | In Tasks |
| TIME-46 | P2: Correct a period | Tasks | In Tasks |
| TIME-47 | P2: Correct a period | Tasks | In Tasks |
| TIME-48 | P2: Correct a period | Tasks | In Tasks |
| TIME-49 | P2: Correct a period | Tasks | In Tasks |

**Coverage:** 49 total, 49 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] A week of real use produces a report whose copied days need no manual correction beyond forgotten sessions
- [ ] A forced process kill loses no more than 60 s of recorded time
- [ ] Two parallel sessions on one worktree never double the worktree or task total
- [ ] Filling a week in Clockify from the Hours view takes under 5 minutes
