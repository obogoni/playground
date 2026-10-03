# Main Async Git Specification

## Problem Statement

Opening a session is slow, and main stalls at moments that grow with the number of sessions. Every time a
time period opens (spawn, duplicate, respawn, resume, a task change, and once per session on resume from
sleep), `TimeTracker` reads the worktree's repository and branch with a synchronous `git rev-parse`
(`execFileSync`, 2 s timeout, `src/main/time-snapshot.ts` `readGit`). On a large repository that blocks main
for about 150 ms per call, N times on a wake. Separately, the session-name poller runs `claude agents --json`
(about 2 s per call, Bun startup) after every hook event of a session the listing has not named, so a session
the listing never names keeps it running back to back, about one Claude process every 3 s. Upstream issue
#151 is the owner-approved scope; it measures with the bench and baseline of #147 (`perf-diagnostics`).

## Dependencies

**Depends on #147.** This feature executes only after #147 (diagnostics log and bench, branch
`feature/perf-diagnostics`) has executed. Its stop rule (MAGIT-30) and its target figures (MAGIT-29..35)
are read with that bench, so no task here starts before it exists. Status on 2026-10-03: #147 shipped as
PR #162, merged into `main` at `fc19a3c`, and this branch was rebased onto it the same day.

**Overlap with upstream PR #154** (merged 2026-10-01, after this plan was written on `d4a3da9`). Its body
says "#151: partly covered. The period git read is async, and the binary lookup is cached and
non-blocking. **Not covered:** the per-session backoff for an unnamed session's listing." To reconcile at
T1, when this branch is rebased:

| This spec | Covered by #154 | Left for this feature |
| --------- | --------------- | --------------------- |
| MAGIT-01..16, MAGIT-38..42, the period opens without waiting for git and gets the read's fields | PERF-21: `readGitAsync` (`time-snapshot.ts`) and `resolveSnapshotAsync` with `#reattribute` (`time-tracker.ts`); the period opens on the cached attribution and is patched when the read answers | T2 and T3 are dropped. **Owner's call 2026-10-03: keep #154's behaviour**, which differs from MAGIT-12 and MAGIT-14: a late answer also patches a period that already closed and was kept in the log (it is dropped only when the period was discarded). Rewrite those rows to #154's behaviour, no code change |
| MAGIT-04, MAGIT-07, the read goes through `git()` and is counted | #147's reconciled plan moves `readGitAsync` onto `git()` (its T8) | Nothing, once #147 has executed |
| MAGIT-05, no `execFileSync` left in `time-snapshot.ts` | Not covered: the synchronous `readGit` stays, with no caller since #154 (#147 leaves it untouched) | Delete it, or drop MAGIT-05; decide at T1 |
| MAGIT-17..28, MAGIT-43..46, the per-session listing backoff | Not covered (#154 says so); `session-name-poller.ts` is unchanged since `d4a3da9` | All of it (T4, T5) |
| MAGIT-29..35, the measurements | #147's bench, not executed yet | T1, T6, T7 re-read for the reduced scope: the `spawn`-row stall is no longer this feature's to fix; the listing count per minute is |

At T1 the tasks for the covered rows are dropped or reduced, and the plan is re-validated against main and
re-approved by the owner before T4.

### Reconciliation (2026-10-03, owner approved)

- **Scope**: the per-session listing backoff, plus deleting the uncalled synchronous `readGit` (owner:
  delete it, so MAGIT-05 stays). MAGIT-01..04, MAGIT-06..16 and MAGIT-38..42 are delivered by #154 (PERF-21,
  `multi-agent-performance` spec AC 5-7) and are not re-tested here. Their rows are rewritten to what #154
  ships: AC 3 (the cached attribution, not nulls), AC 7 (no `git.sync` counter), AC 12 and AC 14 (a late
  read also patches a closed period that was kept).
- **Stop rule**: #147's baseline is the before figure. With 6 sessions opening, the worst `spawn`-row
  `loop max` is 31.7 ms, under 50 ms, and a never-named session still gets a listing after every hook event
  (cited in `validation.md`). The verdict: the backoff proceeds.
- **Measurement**: unit tests only (owner). The bench's sessions never start a listing (`names` is 0 in
  every #147 run), and the spawn stall is no longer this feature's to fix. MAGIT-31..34 are dropped.
- **`git.sync`** never shipped: #147 counts every git process at the paced start of `git()`.
- **Tasks renumbered**: T1 reconciliation and baseline, T2 the uncalled read (old T3, reduced), T3 and T4
  the backoff (old T4, T5), T5 the decision (old T8). Old T2, T6 and T7 are dropped.

## Goals

- [x] No synchronous git call is left in main's period-open path (delivered by #154, PERF-21)
- [x] With 6 sessions opening, the bench's `spawn` row shows no main stall over 50 ms (#147 baseline: 31.7 ms)
- [x] Every period still records the repository, branch and task it records today, once its read settles (PERF-21)
- [x] The snapshot module holds no synchronous git read
- [x] A session the listing never names costs at most one listing per backoff interval, never back to back
- [x] Named sessions keep the 30 s cadence

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| The scrollback buffer, the git-state recount cascade, the Files watcher | Issue #151, Out of Scope: #148, #149, #150 |
| Making config writes (`ConfigStore.patch`) asynchronous | Issue #151, Out of Scope |
| Making the time log and its sidecar writes asynchronous (`TimeLogStore`) | Issue #151: they stay unless the bench shows them in the stalls; then a follow-up issue |
| The synchronous `where claude` in the poller's binary resolver (`index.ts` `resolveClaude`) | Runs once per app run, or after a spawn failure; not on the period-open path; the backoff makes it rarer still |
| Sharing one in-flight read between periods of the same cwd | Each open keeps its own read, so what a period records is still read at its own open (see assumptions) |
| Driving a suspend and resume from the bench | The bench cannot sleep the machine; the wake path is proven by a unit test (see assumptions) |
| Driving the name poller from the bench | The bench runs raw-command sessions only (PDIAG-32); no Claude session, no listing. The backoff is proven by fake-clock unit tests |
| Bench runs after the change and the bench mutants | Reconciliation 2026-10-03: the bench never lists names, and the spawn stall is #154's; the backoff is proven by unit tests |
| Any change to what a period records or what the app shows | Issue #151, Solution: only *when* changes |
| A commit field on periods | The issue says "branch and commit"; the snapshot reads the repository (`--git-common-dir`) and the branch, and has no commit field. Nothing is added |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| When a period gets its git fields | The period opens at once; its repository, branch and branch task arrive when the read returns, and stay null on a failure, as today on a timeout | Issue #151, Solution | owner confirmed 2026-10-01 |
| How the read runs | Asynchronously, through the app's git runner (`git()` in `src/main/git.ts`, AD-023) with its 2 s timeout | Issue #151, Implementation Decisions | owner confirmed 2026-10-01 |
| A period that closes before its read settles | Keeps what it had: the fields of a failed read, with the session's link applied (AD-048) | Issue #151, Implementation Decisions | owner confirmed 2026-10-01; superseded 2026-10-03 by #154 (PERF-21 AC 6: a kept period is patched in the log) |
| What is recorded or shown | Nothing changes, only when; log lines keep `v: 1` and the same keys | Issue #151, Solution; AD-048 keeps `v: 1` | owner confirmed 2026-10-01 |
| The poller's backoff shape | A per-session miss count and next-due time; the interval doubles after each miss up to a ceiling; it resets when a new session id appears or the session gets a name; named sessions keep 30 s | Issue #151, Solution and Implementation Decisions | owner confirmed 2026-10-01 |
| Synchronous config and time-log writes | Stay as they are unless the bench shows them in the stalls; then a follow-up | Issue #151, Implementation Decisions | owner confirmed 2026-10-01 |
| Targets | No main stall over 50 ms when 6 sessions open or the machine wakes; no back-to-back name listings for an unnamed session; measured with the bench from #147 | Issue #151, Solution | owner confirmed 2026-10-01 |
| Tests | Tracker tests with an injected async read (opens before the read settles, gets the fields after, keeps its state when the read fails or the period closed first); poller tests with a fake clock (misses double up to the ceiling, a new id or a name resets, named sessions keep 30 s) | Issue #151, Testing Decisions | owner confirmed 2026-10-01 |
| Backoff numbers | After the k-th miss the session is next due `min(5,000 ms × 2^(k−1), 300,000 ms)` after that listing ended: 5 s, 10 s, 20 s, 40 s, 80 s, 160 s, then 5 min | A 5 s first step keeps a name that appears a few seconds late inside session-name's "within 30 s of the first turn"; a 5 min ceiling makes a never-named session cost about 1 % of today's calls; the existing poller tests advance 30 s between failing calls, which a 5 s step keeps valid | owner confirmed 2026-10-01 |
| What counts as a miss | Every successful listing whose result has no entry for the session's Claude id, whatever triggered the call | One listing serves every row; counting only the calls a session asked for would need a second ledger and changes nothing a user sees | owner confirmed 2026-10-01 |
| A failed listing | Counts as a miss for every watched session that is not named; named sessions are unchanged and retry on the 30 s tick (SNAME-12) | A failing binary would otherwise be retried back to back by the same nudges this feature throttles | owner confirmed 2026-10-01 |
| A nudge that arrives while the session is backing off | Still arms the 1 s debounce, but the listing starts only if the session is due when the debounce elapses; otherwise it is dropped, not deferred, and the next hook event or the 30 s tick tries again | Deferring would arm a timer per session; hook events of a live session keep arriving, and the tick bounds the wait | owner confirmed 2026-10-01 |
| The 30 s tick while every watched session backs off | Skipped when no watched session has 0 misses and none has reached its due time | Without it a never-named session still costs one listing every 30 s, and the ceiling would mean nothing | owner confirmed 2026-10-01 |
| A rerun coalesced during a call | Started at the end of the call only if a session that asked for it, or for a pending tick any watched session, has 0 misses or has reached its due time | Hook events during a 2 s call would otherwise start the next call right after it, the back-to-back pattern this removes | owner confirmed 2026-10-01 |
| `git.sync` in the diagnostics line | Kept, with the `{ sync: true }` probe option that loses its only caller; after this feature it reads 0 | The `v: 1` line and the bench's `sync` column stay as #147 shipped them, and a 0 there is the evidence that no synchronous git is left | owner confirmed 2026-10-01; superseded 2026-10-03: #147 shipped no `git.sync` counter |
| The wake target | Proven by a tracker unit test (`resumeFromSuspend` with 6 sessions starts 6 reads and returns before any settles) and by no synchronous call left in the read path; no bench run sleeps the machine | The bench cannot suspend the machine; driving `powerMonitor` through main's inspector would be a bench extension of its own | owner confirmed 2026-10-01; delivered by #154 (PERF-21) |
| Each open reads at its own instant | No sharing of an in-flight read between two opens on the same cwd | Sharing would let a period record a read started before it opened; two read-only `rev-parse` processes on one worktree are harmless | owner confirmed 2026-10-01 |
| When a settled read is written | At once: the sidecar is rewritten and `time:changed` is pushed for each period whose fields changed | A crash after the read then recovers the period with its fields; N small sidecar writes on a wake are counted by the bench, and coalescing them is the follow-up the issue allows | owner confirmed 2026-10-01; delivered by #154 (PERF-21) |
| What the Hours view shows during the read | The open period sits under its session's link, or under No task, until its read settles (about 150 ms measured; at most 2 s); an open period of a session linked to the task its branch names shows the hand mark for that time | The open period is pushed at once so the counters start with the session; holding the push until the read settles would delay the counter instead | owner confirmed 2026-10-01; superseded 2026-10-03 by #154: the open period starts on the attribution cached for its cwd |
| Stop rule | The first task measures the baseline. Listings are back to back by construction today (code read with file:line). IF no baseline run shows a `spawn`-row `loop max` over 50 ms THEN the task reports that to the owner and continues; IF the listings are also not back to back THEN it stops before any production change | Instruction for this plan: report when spawn of 6 shows no stall and no back-to-back listings; the bench's small seeded repository can read cheaper than the owner's large one, so a missing stall alone does not stop the backoff | owner confirmed 2026-10-01; applied 2026-10-03 at T1 on #147's baseline |
| After-change measurement | Three runs of `node scripts/bench-sessions.mjs --sessions 6 --minutes 1 --json` before and three after, on the same machine | `loop max` is a single-sample figure; three runs show its spread | owner confirmed 2026-10-01; dropped 2026-10-03 (owner: unit tests only) |

**Open questions:** none unmarked. The owner confirmed every row above on 2026-10-01.

---

## User Stories

### P1: A period opens without waiting for git ⭐ MVP

**User Story**: As a developer opening a session or coming back from sleep with several sessions, I want the
app not to freeze while it reads the branch, so that sessions start and respond at once.

**Why P1**: This is the stall the issue measures.

**Reconciled 2026-10-03**: delivered by #154 (PERF-21) except AC 5, which T2 delivers. The other criteria
describe what #154 ships and are not re-tested here.

**Acceptance Criteria**:

1. WHEN a period opens (spawn, duplicate, respawn, resume, task change, resume from sleep) THEN the time tracker SHALL add it to its open periods, rewrite `time-open.json` and push `time:changed` before that period's git read settles <!-- event-driven -->
2. WHEN a period opens THEN the tracker SHALL start exactly one git read for the run's cwd, from inside the same call that opened the period <!-- event-driven -->
3. WHILE a period's read has not settled, the period SHALL carry the attribution cached for its cwd (nulls when none is cached), with the session's link applied (AD-048) <!-- state-driven -->
4. The snapshot read SHALL run `git rev-parse --path-format=absolute --git-common-dir --abbrev-ref HEAD` in the run's cwd through the git runner, with `timeoutMs: 2000` <!-- ubiquitous -->
5. The snapshot module SHALL make no synchronous child-process call <!-- ubiquitous -->
6. WHEN the machine resumes from sleep with N running sessions that are not paused THEN `resumeFromSuspend` SHALL start N reads and return before any of them settles <!-- event-driven -->
7. WHEN the snapshot read runs THEN diagnostics SHALL count it as one git process of the runner, under `rev-parse` <!-- event-driven -->

**Independent Test**: With a read that never settles, `started` for a session returns, `snapshot().open`
holds the period with null repository and branch, and the fake store holds a sidecar write and the fake
emitter one push.

---

### P1: The period still records its git fields ⭐ MVP

**User Story**: As a developer, I want the Hours log still to record each period's repository, branch and
task, so that time booking keeps its data.

**Why P1**: An async read that loses or misplaces the fields would corrupt the hours log.

**Reconciled 2026-10-03**: delivered by #154 (PERF-21 AC 6, 7); AC 12 and AC 14 are rewritten to its
behaviour (owner's call). Not re-tested here.

**Acceptance Criteria**:

8. WHEN a period's read settles and that period is still its session's open period THEN the tracker SHALL replace the period's workspace path, repo name, branch, task id, task title and hand flag with the snapshot the read gives, with the session's link applied over it (AD-048), and SHALL keep the period's id, session id, agent, cwd and start <!-- event-driven -->
9. WHEN a settled read changes an open period's fields THEN the tracker SHALL rewrite `time-open.json` with the changed period and push `time:changed` once <!-- event-driven -->
10. WHEN a session is linked to the task its branch names and its read settles THEN the open period SHALL carry that task with no `taskByHand` key <!-- event-driven -->
11. WHEN a heartbeat rewrote an open period's last-seen before its read settles THEN the patched period SHALL keep the heartbeat's last-seen <!-- event-driven -->
12. IF a read settles after its period closed and was kept in the log, with an attribution different from the period's, THEN the tracker SHALL rewrite that period in `time-log.jsonl` and push `time:changed`; IF the period was discarded (under 1 s) THEN it SHALL change nothing <!-- unwanted-behavior -->
13. IF a read settles while its session has a newer open period THEN the tracker SHALL leave the newer period unchanged, matching the read to its period by period id <!-- unwanted-behavior -->
14. WHEN a period closes before its read settles THEN the line appended to `time-log.jsonl` SHALL carry the fields of AC 3, until AC 12 patches it <!-- event-driven -->
15. IF a read fails, times out, rejects or throws THEN the period SHALL keep the fields of AC 3, and the tracker SHALL NOT write `time-open.json` nor push `time:changed` for that read <!-- unwanted-behavior -->
16. The tracker SHALL write log lines and the sidecar with today's keys and `v: 1`, and SHALL record no field for a read that has not settled <!-- ubiquitous -->

**Independent Test**: With a controllable read, `started`, then `taskChanged` before the first read
settles: the first read settling with a branch changes nothing; the second read's branch lands on the open
period only; the appended period carries null branch.

---

### P1: An unnamed session stops launching the listing back to back ⭐ MVP

**User Story**: As a developer with a session Claude never names, I want the app not to keep launching
Claude's listing, so that it stops costing CPU; and I want named sessions to keep their names fresh.

**Why P1**: The second half of the issue; it is independent of the first.

**Acceptance Criteria**:

17. The poller SHALL export `NAME_BACKOFF_BASE_MS = 5000`, `NAME_BACKOFF_FACTOR = 2` and `NAME_BACKOFF_MAX_MS = 300000` <!-- ubiquitous -->
18. WHEN a successful listing has no entry for a watched session's Claude id THEN the poller SHALL add one to that session's misses and set its due time to the listing's end plus `min(NAME_BACKOFF_BASE_MS × NAME_BACKOFF_FACTOR^(misses − 1), NAME_BACKOFF_MAX_MS)` <!-- event-driven -->
19. WHEN a successful listing has an entry for a watched session's Claude id THEN the poller SHALL mark that session named and set its misses to 0 <!-- event-driven -->
20. IF a listing fails (resolver error, spawn error, non-zero exit, timeout, not a JSON array) THEN the poller SHALL count a miss, as in AC 18, for every watched session that is not named, and SHALL leave named sessions unchanged <!-- unwanted-behavior -->
21. WHEN `watch` gives a session a Claude id it did not have THEN the poller SHALL set that session's misses to 0, mark it not named, and schedule one debounced listing (SNAME-09) <!-- event-driven -->
22. WHILE a session has one or more misses and its due time is still ahead, the poller SHALL start no listing for that session's nudge; the check runs at the instant the debounced listing would start <!-- state-driven -->
23. WHEN a debounced listing comes due THEN the poller SHALL start it if a session that asked for it (by `watch` or `nudge`) has 0 misses or has reached its due time, and SHALL drop it otherwise <!-- event-driven -->
24. WHEN the 30 s interval fires THEN the poller SHALL start a listing if at least one watched session has 0 misses or has reached its due time, and SHALL start none otherwise <!-- event-driven -->
25. WHEN a call ends with a tick or a nudge coalesced during it THEN the poller SHALL schedule the rerun only if a session that nudged has 0 misses or has reached its due time, or a tick was coalesced and any watched session has 0 misses or has reached its due time <!-- event-driven -->
26. WHILE at least one watched session is named, the poller SHALL call the listing every 30 s, as SNAME-10 says <!-- state-driven -->
27. WHEN `unwatch` removes a session THEN the poller SHALL drop its misses and due time, so a later `watch` of the same app session starts from 0 misses <!-- event-driven -->
28. WHEN a never-named session is nudged every second for 10 minutes and each listing ends at once THEN the poller SHALL start listings at 1 s, 6 s, 16 s, 36 s, 76 s, 156 s and 316 s only (fake clock from the first watch; each nudge lands right after the clock reaches a whole second) <!-- event-driven -->

**Independent Test**: A fake-clock poller test: one session, listings answering `[]`, a nudge every second
for 10 minutes; the spawn calls land at the seven instants of AC 28; then a listing that names it puts the
next call 30 s later on the tick.

---

### P1: The change is measured, before and after ⭐ MVP

**User Story**: As the developer, I want the same bench to show the stall before and after, so that the fix
is shown to help and the measure is shown able to fail.

**Why P1**: Issue #151 names the bench and its targets; #147's stop rule applies.

**Reconciled 2026-10-03**: the before figures are #147's baseline, and nothing is measured after the change
(owner: unit tests only). AC 29 and AC 35 are reworded; AC 31 to AC 34 are dropped.

**Acceptance Criteria**:

29. The first task SHALL record, before any production change, #147's `--sessions 6` baseline with its commit: the `spawn` row's `loop p99/max` and `git n`, the `names` column, and the longest `sessions:spawn` round trip <!-- ubiquitous -->
30. IF no baseline run shows a `spawn`-row `loop max` over 50 ms, and the listing path is not back to back at the cited lines, THEN the first task SHALL stop and report to the owner before any production change <!-- unwanted-behavior -->
31. WHEN the change is in THEN three runs of the same command SHALL each show `sync` 0 in every row and a `spawn`-row `loop max` of at most 50 ms (**dropped 2026-10-03**) <!-- event-driven -->
32. IF an after-change run's `spawn`-row `loop max` exceeds 50 ms while `sync` reads 0 THEN the measuring task SHALL record the figure as a stall outside this feature, report it to the owner, and SHALL NOT widen this feature (**dropped 2026-10-03**) <!-- unwanted-behavior -->
33. WHEN a bench run is kept (`--keep`) after the change THEN its `time-log.jsonl` SHALL hold one `v: 1` line per session, each with `repoName` `app` and `branch` `bench/<i>` of its worktree (**dropped 2026-10-03**) <!-- event-driven -->
34. WHEN a throwaway mutant blocks main for 150 ms inside each period open THEN the `spawn` row's `loop max` SHALL read over 150 ms, and WHEN a mutant adds a synchronous git call with the `sync` probe THEN the `sync` column SHALL read above 0 (**dropped 2026-10-03**) <!-- event-driven -->
35. The validation notes SHALL hold the figures of AC 29 with the commit they ran on <!-- ubiquitous -->

**Independent Test**: The `## Measurements` section of `validation.md` holds #147's `spawn` row, its commit,
the cited listing lines and the stop-rule verdict.

---

### P2: The shipped specs say what ships

**User Story**: As a reader of the specs, I want the time-tracking, session-name and diagnostics specs to say
that the read is asynchronous and the listing backs off, so that they do not describe behaviour that no longer
ships.

**Why P2**: The feature works without it; L-033 asks for it in the same change.

**Acceptance Criteria**:

36. WHEN the feature ships THEN `.specs/STATE.md` SHALL hold the new decision with its number chosen at Execute, amending AD-040's "on later events for a still-unnamed session" <!-- event-driven -->
37. WHEN the feature ships THEN the traceability rows of SNAME-09, SNAME-10 and SNAME-12 SHALL name the new decision as amending them <!-- event-driven -->

**Independent Test**: A grep for the decision's number finds it in `STATE.md` and in the session-name spec's rows.

---

## Edge Cases

- WHEN a period opens and closes within 1 s THEN the period SHALL be discarded (TIME-11) and its read, when it settles, SHALL change nothing
- WHEN the cwd is not a git worktree, git is missing, or the cwd is gone THEN the read SHALL give null repository and branch (TIME-12) and the tracker SHALL write nothing for it
- WHEN two sessions open on the same cwd THEN each SHALL start its own read and get its own fields
- WHEN two reads of one session settle in reverse order THEN only the read of the current open period SHALL change it
- WHEN the app quits with reads in flight THEN no read settling after `closeAll` SHALL write the sidecar, the log, or push
- WHEN a watched session's due time equals the current time THEN it SHALL count as due (L-042)
- WHEN a named session's entry disappears from a successful listing THEN it SHALL become not named with one miss and be due 5 s after that listing
- WHEN a backing-off session's Claude id changes (`/clear`, `/resume`) THEN its misses SHALL reset to 0 and one debounced listing SHALL be scheduled
- WHEN the poller is disposed while a session backs off THEN no listing SHALL start afterwards (SNAME-14)

---

## Implicit-Requirement Dimensions

| Dimension | Coverage |
| --------- | -------- |
| Input validation & bounds | N/A because no input crosses a boundary; the git arguments are fixed (AC 4) and the backoff is bounded by its ceiling (AC 17, 18) |
| Failure / partial-failure states | AC 15 (failed, timed-out, rejected or throwing read), AC 20 (failed listing), AC 32 (stall outside this feature) |
| Idempotency / retry / duplicate handling | AC 2 (one read per open), AC 13 and the reverse-order edge case (each read applies to its own period only) |
| Auth boundaries & rate limits | AC 18, 22, 24, 25 bound the listing rate; N/A for auth because both child processes are local |
| Concurrency / ordering | AC 1 (open before settle), AC 11 (heartbeat), AC 12, 13 (late reads), AC 25 (coalesced reruns), the quit edge case |
| Data lifecycle / expiry | AC 27 (miss state dropped with the session) |
| Observability | AC 7 (diagnostics counts the read as runner git), AC 29, 31, 35 (bench figures) |
| External-dependency failure | AC 15 (git), AC 20 (the Claude binary) |
| State-transition integrity | AC 12 (every way a period closes), AC 19, 21 (resets), AC 22, 23 (gate) |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| MAGIT-01 | P1: open — AC 1 | #154 | Delivered (PERF-21) |
| MAGIT-02 | P1: open — AC 2 | #154 | Delivered (PERF-21) |
| MAGIT-03 | P1: open — AC 3 | #154 | Delivered (PERF-21) |
| MAGIT-04 | P1: open — AC 4 | #154 | Delivered (PERF-21) |
| MAGIT-05 | P1: open — AC 5 | T2 | ✅ Verified (T2) |
| MAGIT-06 | P1: open — AC 6 | #154 | Delivered (PERF-21) |
| MAGIT-07 | P1: open — AC 7 | #154 | Delivered (PERF-21) |
| MAGIT-08 | P1: fields — AC 8 | #154 | Delivered (PERF-21) |
| MAGIT-09 | P1: fields — AC 9 | #154 | Delivered (PERF-21) |
| MAGIT-10 | P1: fields — AC 10 | #154 | Delivered (PERF-21) |
| MAGIT-11 | P1: fields — AC 11 | #154 | Delivered (PERF-21) |
| MAGIT-12 | P1: fields — AC 12 | #154 | Delivered (PERF-21) |
| MAGIT-13 | P1: fields — AC 13 | #154 | Delivered (PERF-21) |
| MAGIT-14 | P1: fields — AC 14 | #154 | Delivered (PERF-21) |
| MAGIT-15 | P1: fields — AC 15 | #154 | Delivered (PERF-21) |
| MAGIT-16 | P1: fields — AC 16 | #154 | Delivered (PERF-21) |
| MAGIT-17 | P1: backoff — AC 17 | T3 | ✅ Verified (T3) |
| MAGIT-18 | P1: backoff — AC 18 | T3 | ✅ Verified (T3) |
| MAGIT-19 | P1: backoff — AC 19 | T3 | ✅ Verified (T3) |
| MAGIT-20 | P1: backoff — AC 20 | T3 | ✅ Verified (T3) |
| MAGIT-21 | P1: backoff — AC 21 | T3 | ✅ Verified (T3) |
| MAGIT-22 | P1: backoff — AC 22 | T3 | ✅ Verified (T3) |
| MAGIT-23 | P1: backoff — AC 23 | T3 | ✅ Verified (T3) |
| MAGIT-24 | P1: backoff — AC 24 | T4 | ✅ Verified (T4) |
| MAGIT-25 | P1: backoff — AC 25 | T4 | ✅ Verified (T4) |
| MAGIT-26 | P1: backoff — AC 26 | T4 | ✅ Verified (T4) |
| MAGIT-27 | P1: backoff — AC 27 | T3 | ✅ Verified (T3) |
| MAGIT-28 | P1: backoff — AC 28 | T4 | ✅ Verified (T4) |
| MAGIT-29 | P1: measured — AC 29 | T1 | ✅ Verified (T1) |
| MAGIT-30 | P1: measured — AC 30 | T1 | ✅ Verified (T1) |
| MAGIT-31 | P1: measured — AC 31 | — | Dropped 2026-10-03 |
| MAGIT-32 | P1: measured — AC 32 | — | Dropped 2026-10-03 |
| MAGIT-33 | P1: measured — AC 33 | — | Dropped 2026-10-03 |
| MAGIT-34 | P1: measured — AC 34 | — | Dropped 2026-10-03 |
| MAGIT-35 | P1: measured — AC 35 | T1 | ✅ Verified (T1) |
| MAGIT-36 | P2: specs — AC 36 | T5 | ✅ Verified (T5) |
| MAGIT-37 | P2: specs — AC 37 | T5 | ✅ Verified (T5) |
| MAGIT-38 | Edge: open and close within 1 s | #154 | Delivered (PERF-21) |
| MAGIT-39 | Edge: not a worktree, git missing, cwd gone | #154 | Delivered (PERF-21) |
| MAGIT-40 | Edge: two sessions on one cwd | #154 | Delivered (PERF-21) |
| MAGIT-41 | Edge: two reads of one session in reverse order | #154 | Delivered (PERF-21) |
| MAGIT-42 | Edge: quit with reads in flight | #154 | Delivered (PERF-21) |
| MAGIT-43 | Edge: due time equals now | T3 | ✅ Verified (T3) |
| MAGIT-44 | Edge: a named session loses its entry | T3 | ✅ Verified (T3) |
| MAGIT-45 | Edge: Claude id changes while backing off | T3 | ✅ Verified (T3) |
| MAGIT-46 | Edge: dispose while backing off | T4 | ✅ Verified (T4) |

**Coverage:** 46 total: 22 mapped to tasks, 20 delivered by #154, 4 dropped, 0 unmapped.

---

## Follow-ups (Verifier, 2026-10-03)

Test-only gaps on correct code, recorded and not fixed (owner rule: a test-only gap gets no fix round).

1. MAGIT-19's test names the session on a call that starts at its due time, so it cannot tell whether the
   misses were reset (mutant M1 survived). A test that names the session after three misses and lets the
   next listing miss it should see the next call 5 s after that listing, not 40 s.
2. MAGIT-46's test does not reach the `#disposed` guard, because `dispose` also empties the watched
   sessions. A `watch` after `dispose` would pin it. Optional.

## Success Criteria

- [x] `grep -nE "execFileSync|spawnSync|execSync" src/main/time-snapshot.ts` finds nothing
- [x] A never-named session nudged every second for 10 minutes starts 7 listings, against about 200 today with a 2 s call
- [x] Named sessions keep the 30 s cadence
- [x] Every existing session-name-poller and time-snapshot assertion passes unchanged
