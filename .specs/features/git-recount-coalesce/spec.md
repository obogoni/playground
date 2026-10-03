# Git Recount Coalescing Specification

## Problem Statement

Since #107 (PR #119), main watches each worktree's git dir and runs one `git status` for that worktree
whenever `index` or `HEAD` is written. The batch window starts at the first event and fires 250 ms
later, so steady writes give up to four recounts a second per worktree, and a recount of a worktree is
never merged with or skipped behind one still running. Each recount replaces the whole tree (always a
new object, SCRF-03), which re-renders the app and makes the status bar re-read the selected worktree's
sync state with five more git processes, whichever worktree moved. Every agent's own git commands
rewrite the index (with `core.fsmonitor` on, even a plain `git status` does), so each active agent sets
off about six git processes per event, at about 330 ms per `git status` and 150 ms per `git rev-parse`
on a large repository. A window focus also recounts every worktree of every workspace at once, with no
limit. Upstream issue #149 is the owner-approved scope; it measures with #147's bench.

## Dependencies

**Depends on #147.** This feature executes only after #147 (diagnostics log and bench, branch
`feature/perf-diagnostics`) has executed. Its stop point (RCNT-35) and its target figure (RCNT-32) are
read with that bench. Status on 2026-10-03: #147 executed and shipped as PR #162 (open, tip `f3d68ca`);
this branch was rebased onto it the same day.

**Reconciled 2026-10-03** with upstream PR #154 (merged 2026-10-01, after this plan was written) and
with #147's baseline, owner's answers the same day. The first plan's 18 tasks became 11:

| This spec | Where it stands | Decision |
| --------- | --------------- | -------- |
| RCNT-01..15, RCNT-17, the per-worktree scheduler, turn-end and tree-build recounts through it | Not covered by #154 (it says so); #147 measured 4 `git status` a second on the written worktree | **Kept**: the feature |
| RCNT-16, at most 3 recounts at once | PERF-22: every `git()` call is paced, at most 4 processes at once across all callers | **Dropped**: the global cap already bounds the focus fan-out |
| RCNT-18 and RCNT-39, sync-state and commit-list reads share the worktree's lane | #147's index run read `peakConcurrent` 1 on every worktree; the owner narrowed #149 to the status rate and keeps no-overlap as a regression guard (issue comment, 2026-10-03) | **Dropped** (owner 2026-10-03). The bench selects no worktree, so the status bar's reads were not in that figure; a follow-up if they ever overlap |
| RCNT-19..21, the tree keeps its identity when a recount changes nothing | PERF-11, `src/renderer/src/lib/tree-status.ts` | **Delivered by #154** |
| RCNT-22..25 and RCNT-40, the status bar re-reads only for its own worktree | PERF-12, PERF-13, AD-052 (`treeRevision`, `onRecounted`); SCRF-03 already amended there | **Delivered by #154**; this feature no longer supersedes SCRF-03 nor amends STBR-11 |
| RCNT-26, the Files Commits list follows `tree:get` only | Not covered: `App.tsx` still passes `treeRevision: tree` | **Kept** (owner 2026-10-03): one prop, now `useTree`'s `treeRevision` |
| RCNT-28, RCNT-29, ahead and upstream follow a terminal commit and checkout | They tested the trigger move, which #154 made | **Dropped**; RCNT-27 and RCNT-30 stay as the freshness guard |
| RCNT-31, 33, 34, 36, the bench's `--select` and the before-runs | They measured the status bar half (#154's) and the overlap (dropped) | **Dropped**; #147's index run is the before figure |
| RCNT-32, the target | #147: `git status <= 1 per worktree per s` FAIL (4) | **Kept**, one after-run |
| RCNT-35, the stop rule | Not met at baseline | **Kept**, judged in T1 |

## Goals

- [ ] Under a continuous index rewrite, main starts at most one `git status` per worktree per second, and never two git processes on one worktree at once (bench, `--index-interval 100`; the second half is a regression guard, met at baseline)
- [ ] ~~Another worktree's git activity starts no git process for the worktree the status bar describes~~ (delivered by #154, AD-052)
- [ ] ~~The tree, and so the app, re-renders only when a count or dirty flag changed~~ (delivered by #154, PERF-11)
- [ ] ~~A focus refresh runs at most 3 `git status` at once~~ (dropped 2026-10-03: PERF-22 caps every git process at 4)
- [ ] After a commit, stage, checkout or turn end, the status bar shows the new count within 2 seconds, as today

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| The Files view watcher (`file-watcher.ts`, `files:changed`) | Issue #149, Out of Scope: it is #150 |
| How agents run git, or the repository's `core.fsmonitor` setting | Issue #149, Out of Scope |
| The `git worktree list` call per repository in the tree build | The issue limits the per-worktree status calls; a workspace holds few repositories |
| Putting the status bar's own operations (`git:run`: pull, push, sync, fetch, publish) in the worktree's lane | User-initiated and rare; a pull or push can take up to 120 s and must not hold the counter that long |
| Refreshing a worktree's branch label after a checkout made in a terminal | Pre-existing: a recount patches counts only, the label follows the next `tree:get`; not in the issue |
| A UI for the scheduler's figures | The #147 diagnostics log already counts recounts and emits per worktree |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Who coalesces | A per-worktree recount scheduler in main owns coalescing: a trailing quiet period with a maximum wait, at most one recount per worktree at a time, and events during a run cause exactly one more run after it. The git-state watcher feeds it; turn-end and focus recounts go through it too | Issue #149, Solution and Implementation Decisions | owner confirmed 2026-10-01 |
| What the event carries | `worktree:status` lets the renderer tell a git-state change from a count change; the tree patch returns the same tree when nothing changed. This revises SCRF-03: the status bar's re-read moves from tree identity to the selected worktree's event | Issue #149, Implementation Decisions | owner confirmed 2026-10-01 |
| Focus refresh | Its per-worktree status calls run through a small concurrency pool (for example 3) | Issue #149, Implementation Decisions | owner confirmed 2026-10-01 |
| Values | Quiet period, maximum wait and pool size are set in the design and checked against the bench | Issue #149, Implementation Decisions | owner confirmed 2026-10-01 |
| Target | At most one `git status` per worktree per second while the index is rewritten continuously, and no two git processes overlapping on one worktree, measured with #147's bench | Issue #149, Solution | owner confirmed 2026-10-01 |
| Tests | Scheduler unit tests with a fake clock and a counting runner (burst gives one run; events during a run give exactly one trailing run; two worktrees independent; the maximum wait bounds the delay); tree-patch tests (same tree when unchanged, new tree when count or dirty changed); sync-trigger tests (the selected worktree's event re-reads, another's does not); the #107 status bar smoke still passes | Issue #149, Testing Decisions | owner confirmed 2026-10-01 |
| Stop rule | If #147's baseline already meets the git-status rate and the overlap target under `--index-interval 100`, execution stops and the owner is told | Instruction for this plan; same rule as PDIAG-43 | owner confirmed 2026-10-01 |
| Quiet period | 250 ms (`RECOUNT_QUIET_MS`) after the burst's last event | The window #107 already uses (`BATCH_MS`); one commit's index writes land well inside it (SCRF T1) | owner confirmed 2026-10-01 |
| Maximum wait | 1,000 ms (`RECOUNT_MAX_WAIT_MS`) after the burst's first event | Under continuous writes the quiet period never elapses; one second is the target's own unit | owner confirmed 2026-10-01 |
| Spacing between starts | A recount of a worktree never starts less than 1,000 ms (`RECOUNT_MIN_INTERVAL_MS`) after the previous one of that worktree ended (amended 2026-10-03, owner, after T11; was "started") | The target is "at most one per second"; quiet period and maximum wait alone allow two starts 350 ms apart when a short recount is followed by a short burst, and the bench's index loop skips writes that collide with git's lock, which makes such gaps. **Counted from the end since T11**: counted from the start, a recount that waited ~300 ms for its process in `git()`'s queue (PERF-22, filled by a tree build) was followed on schedule by the next one, so two git processes of one worktree started under 1,000 ms apart and the bench read 2 a second. A process starts before it ends, so from the end the next process starts at least 1,000 ms after the previous one started, whatever the queue. Cost: under continuous writes a worktree recounts about every 1 s plus git's duration; an isolated commit still shows after the 250 ms quiet period | owner confirmed 2026-10-01; amended by the owner 2026-10-03 |
| Pool size and reach | 3 (`RECOUNT_POOL_SIZE`), across all worktrees, for every recount: git-state, turn end and tree build | The issue's example value; one pool for every `git status` main counts with keeps the bound true whatever set the recounts off | owner confirmed 2026-10-01 |
| Event payload | Unchanged `{ worktreePath, dirty, changes }`. Main sends it only after a recount that served at least one git-state event, as today; the event itself is the git-state signal and a count change is read by comparing with the tree | No contract change, no second channel; today's emitter is already the watcher alone | owner confirmed 2026-10-01 |
| A failed recount after a git-state event | No event (SCRF-06 keeps the last count), so the status bar does not re-read for it; the next event, a `tree:get` or a focus does | A failure gives no count to patch and nothing to signal | owner confirmed 2026-10-01 |
| On-demand recounts | A request (turn end through `worktrees:status`, or the tree build) skips the quiet period, keeps the spacing and the single flight, and is answered by the first recount that starts after it | A recount that started before the request may have read the worktree before the change the request is about | owner confirmed 2026-10-01 |
| Sync-state reads | The status bar's `git:sync-state` and `git:commits` reads share the worktree's lane: they wait for a running recount, run one at a time, and hold that worktree's next recount until they end | The re-read follows the event, so the next recount under continuous writes would otherwise overlap it on the described worktree, which the overlap target forbids | owner confirmed 2026-10-01 |
| The watcher's own batch | Removed: the watcher passes each `index` or `HEAD` event to the scheduler at once. SCRF-02's 250 ms batch moves into the scheduler, and its AC still holds | Two coalescers in a row add their delays; the issue makes the scheduler the owner. The watcher tests that pinned the batch are rewritten for the revised mechanism | owner confirmed 2026-10-01 |
| What the Files Commits list follows | `tree:get` results only (a refresh revision), no longer every tree identity | FCMT-32 names the status bar's operations and focus, both of which are a `tree:get`; with patches gone from the trigger, another worktree's count change no longer reloads the list | owner confirmed 2026-10-01 |
| Measuring the described worktree | The bench gains `--select <i>`: it selects `bench-wt-i` in the Tree direction before the sessions open | The #147 bench selects nothing, so it cannot see the status bar's re-reads, which are half the cascade | owner confirmed 2026-10-01 |
| `recounts` in the diagnostics log | The tree build's per-worktree counts go through the scheduler, so `recounts` now includes them | Steady bench rows hold no tree build; startup and focus rows read higher than #147's baseline for that reason | owner confirmed 2026-10-01 |

**Open questions:** none unmarked. The owner confirmed every row above on 2026-10-01.

---

## User Stories

### P1: One recount at a time per worktree ⭐ MVP

**User Story**: As a developer with several agents committing and running git, I want the app not to
start a burst of git processes for each of their commands, so that my machine stays responsive.

**Why P1**: It is the issue's main target.

**Acceptance Criteria**:

1. WHEN `index` or `HEAD` changes in a watched worktree's git dir THEN the git-state watcher SHALL pass that event to the recount scheduler at once, with no batch window of its own <!-- event-driven -->
2. WHEN a git-state event arrives for a worktree whose recount is neither waiting nor running THEN the scheduler SHALL make that worktree's recount due 250 ms after the burst's last event, a burst ending at the first 250 ms with no event for that worktree <!-- event-driven -->
3. WHILE git-state events for one worktree keep arriving less than 250 ms apart, the scheduler SHALL make its recount due 1,000 ms after the burst's first event <!-- state-driven -->
4. The scheduler SHALL NOT start a recount of a worktree less than 1,000 ms after the previous recount of that worktree ended (amended 2026-10-03, owner, after T11; was "started") <!-- ubiquitous -->
5. WHILE a recount of a worktree is running, the scheduler SHALL NOT start another recount of that worktree <!-- state-driven -->
6. WHEN git-state events arrive for a worktree while its recount runs THEN the scheduler SHALL run exactly one more recount after it, due by AC 2 and 3 with the burst starting at the first of those events <!-- event-driven -->
7. The scheduler SHALL start a due recount at the first instant AC 4 and AC 5 allow (AC 16 dropped 2026-10-03) <!-- ubiquitous -->
8. The scheduler SHALL keep each worktree's waits and runs apart, so events for one worktree never delay, merge with or cancel another worktree's recount <!-- ubiquitous -->
9. WHEN a recount that served at least one git-state event returns a count THEN main SHALL emit one `worktree:status` with `{ worktreePath, dirty, changes }` <!-- event-driven -->
10. IF a recount returns no count or throws THEN the scheduler SHALL emit nothing for it and SHALL leave the worktree free for its next recount <!-- unwanted-behavior -->
11. WHEN the watcher stops watching a worktree THEN the scheduler SHALL cancel that worktree's waiting git-state recount <!-- event-driven -->
12. WHEN the app quits THEN the scheduler SHALL cancel every waiting recount, start no new one, answer every open and later request with no count, and emit nothing more. A request already taken by a recount that is running at quit is open no longer: it gets that recount's result (clarified 2026-10-03 after verification round 1, as design.md's `stop()` states) <!-- event-driven -->

**Independent Test**: With a fake clock and a counting runner, ten events 100 ms apart on one
worktree give one run at 1,000 ms; an event during that run gives exactly one more run, no sooner than
2,000 ms; events on a second worktree run on their own schedule.

---

### P1: Turn-end and focus recounts share the lane ⭐ MVP

**User Story**: As a developer with many worktrees, I want focusing the window not to start a git
process per worktree all at once, and a turn end not to start a second `git status` beside one already
running, so that coming back to the app is smooth.

**Why P1**: The overlap target holds only when every recount goes through one place.

**Reconciled 2026-10-03**: AC 16 and AC 18 dropped (`## Dependencies`); AC 13..15 and 17 kept.

**Acceptance Criteria**:

13. WHEN a recount of a worktree is requested (a turn end through `worktrees:status`, or the tree build) THEN the scheduler SHALL make it due at once, with no quiet period <!-- event-driven -->
14. The scheduler SHALL answer a request with the result of the first recount of that worktree that starts after the request <!-- ubiquitous -->
15. WHEN a request and git-state events for one worktree are waiting at the same time THEN the scheduler SHALL serve both with one recount <!-- event-driven -->
16. ~~The scheduler SHALL run at most 3 recounts at once across all worktrees, and SHALL start the recounts that became due while all 3 were taken in the order they became due~~ Dropped 2026-10-03: PERF-22 (#154) runs at most 4 git processes at once across the app <!-- ubiquitous -->
17. The tree build behind `tree:get` SHALL count every worktree's changes through a scheduler request, and SHALL report a worktree whose count fails as clean, as it does today <!-- ubiquitous -->
18. ~~Main SHALL run a worktree's `git:sync-state` and `git:commits` reads only while no recount of that worktree runs, one read at a time, and SHALL start no recount of that worktree while such a read runs~~ Dropped by the owner 2026-10-03 (no-overlap is a regression guard only) <!-- ubiquitous -->

**Independent Test**: Five worktrees requested at once run 3 recounts, then 2; a request during a
running recount is answered by the recount after it; a sync-state read requested during a recount
starts after it ends, and a recount due during the read starts after the read.

---

### P1: The tree changes only when a count changed ⭐ MVP

**User Story**: As a developer, I want the whole app not to re-render when nothing visible changed, so
that the UI stays fast.

**Why P1**: A new tree per recount is what re-renders the app and drags the status bar along.

**Reconciled 2026-10-03**: delivered by #154 (PERF-11); no task here.

**Acceptance Criteria**:

19. WHEN a recount's `dirty` and `changes` equal the tree's for that worktree THEN `patchWorktreeStatus` SHALL return the same tree object <!-- event-driven -->
20. WHEN a recount's `changes` differs from the tree's for that worktree THEN `patchWorktreeStatus` SHALL return a new tree holding the new `dirty` and `changes`, and every other worktree object SHALL be the same object as before <!-- event-driven -->
21. WHEN a recount's `dirty` differs from the tree's while its `changes` is equal THEN `patchWorktreeStatus` SHALL return a new tree holding the new `dirty` <!-- event-driven -->

**Independent Test**: Patching a worktree with its own values returns the input tree (`toBe`);
patching it with one more change returns a new tree whose other worktrees are `toBe` the old ones.

---

### P1: The status bar re-reads only for its own worktree ⭐ MVP

**User Story**: As a developer, I want ahead/behind to update after a commit in the selected worktree,
and I want another worktree's git activity not to make the status bar re-read the selected one.

**Why P1**: The re-read is five git processes per event on the described worktree.

**Reconciled 2026-10-03**: AC 22..25 delivered by #154 (PERF-12/13, AD-052); AC 26 kept (T9).

**Acceptance Criteria**:

22. WHEN `worktree:status` arrives for the worktree the status bar describes THEN the bar SHALL re-read that worktree's sync state, and its commit lists while its sync popover is open <!-- event-driven -->
23. WHEN `worktree:status` arrives for any other worktree THEN the bar SHALL re-read nothing <!-- event-driven -->
24. WHEN a `tree:get` result lands THEN the bar SHALL re-read the described worktree's sync state (STBR-11) <!-- event-driven -->
25. The bar SHALL re-read sync state only on AC 22, AC 24, a change of the described worktree, and the success of its own operation (STBR-25) <!-- ubiquitous -->
26. WHEN a recount changes the tree with no `tree:get` THEN the Files direction SHALL NOT reload its Commits list on account of it, and SHALL still reload it on a `tree:get` result (FCMT-32) <!-- event-driven -->

**Independent Test**: The trigger helper answers true for an event on the described worktree, false for
an event on another worktree whose path starts with the described one's, and false with nothing
described.

---

### P1: Counts stay as current as today ⭐ MVP

**User Story**: As a developer, I want the changed-file count and ahead/behind to stay current after
commits, checkouts and turn ends, so that the fix does not bring back #107.

**Why P1**: The issue forbids trading freshness for fewer processes.

**Reconciled 2026-10-03**: AC 28 and AC 29 dropped; AC 27 and AC 30 kept (T10).

**Acceptance Criteria**:

27. WHEN a commit made in a terminal changes the described worktree's count THEN the status bar SHALL show the new count within 2,000 ms, with no click (SCRF-01) <!-- event-driven -->
28. WHEN a commit made in a terminal puts the described worktree one commit ahead of its upstream while its count stays the same THEN the status bar SHALL read `↓0 ↑1` within 2,000 ms, with no refresh and no focus <!-- event-driven -->
29. WHEN a checkout made in a terminal moves the described worktree's `HEAD` to a new branch with no upstream while its count stays the same THEN the sync section SHALL read `no upstream` within 2,000 ms, with no refresh and no focus <!-- event-driven -->
30. The status bar smoke's counter checks from #107 (a terminal commit, a focus, a second focus within 5 s, a turn end) SHALL pass with their assertions unchanged <!-- ubiquitous -->

**Independent Test**: `SMOKE_ONLY=follow node scripts/smoke-status-bar.mjs` against the dev app passes
the new checks and the #107 checks.

---

### P1: The target, measured ⭐ MVP

**User Story**: As the developer fixing the slowness, I want before and after figures from the same
bench, so that the fix shows it helped.

**Why P1**: The target is the issue's finish line.

**Reconciled 2026-10-03**: AC 31, 33, 34 and 36 dropped; #147's index run is the before figure; AC 32 (T11) and AC 35 (T1) kept.

**Acceptance Criteria**:

31. WHERE `--select <i>` is given, the bench SHALL select `bench-wt-i` in the Tree direction before the sessions open, and SHALL exit 2 before launching when `i` is not a whole number from 1 to the number of seeded worktrees <!-- optional-feature -->
32. WHEN the bench runs `--sessions 6 --index-interval 100` on the finished feature THEN every steady row SHALL read `bySubcommand.status.maxPerSecond` at most 1 and `peakConcurrent` at most 1 for every worktree <!-- event-driven -->
33. WHEN the bench runs `--sessions 2 --index-interval 100 --select 1` on the finished feature THEN every steady row SHALL read `maxPerSecond.status` at most 1 and `peakConcurrent` at most 1 for `bench-wt-1`, and a `rev-list` count for `bench-wt-1` no higher than its `emits["worktree:status"]` <!-- event-driven -->
34. WHEN the bench runs `--sessions 2 --index-interval 100 --select 2` on the finished feature THEN no steady row SHALL count a `rev-list` under `bench-wt-2` <!-- event-driven -->
35. IF #147's baseline run `--sessions 6 --index-interval 100` already reads `maxPerSecond.status` at most 1 and `peakConcurrent` at most 1 for every worktree in every steady row THEN execution SHALL stop after T1 and the owner SHALL be told <!-- unwanted-behavior -->
36. IF the before-run of AC 34 counts no `rev-list` under `bench-wt-2`, or the before-run of AC 33 already meets both of its limits, THEN execution SHALL stop after T3 and the owner SHALL be told <!-- unwanted-behavior -->

**Independent Test**: The before and after summaries sit side by side in `tasks.md` (T3, T18), each
with its commit, and each target figure reads FAIL before and PASS after.

---

## Edge Cases

- WHEN a recount becomes due exactly 1,000 ms after the previous end of that worktree THEN the scheduler SHALL start it at that instant (AC 4 is inclusive) (amended 2026-10-03, owner, after T11; was "previous start")
- WHEN a request arrives while a recount of that worktree runs THEN the scheduler SHALL answer it with the trailing recount, not the running one
- IF a `git:sync-state` or `git:commits` read throws THEN its caller SHALL get that error, and the worktree SHALL be free for its next recount
- WHEN the described worktree changes while a `worktree:status` for the previous one is on its way THEN the bar SHALL re-read nothing for the previous one
- WHEN the watcher stops watching a worktree that has a request waiting THEN the scheduler SHALL still answer the request

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| RCNT-01 | P1: one at a time — AC 1 | T7 | Done |
| RCNT-02 | P1: one at a time — AC 2 | T2 | Done |
| RCNT-03 | P1: one at a time — AC 3 | T2 | Done |
| RCNT-04 | P1: one at a time — AC 4 | T2, T4, T12 | Done |
| RCNT-05 | P1: one at a time — AC 5 | T3 | Done |
| RCNT-06 | P1: one at a time — AC 6 | T3, T14 | Done |
| RCNT-07 | P1: one at a time — AC 7 | T2 | Done |
| RCNT-08 | P1: one at a time — AC 8 | T2 | Done |
| RCNT-09 | P1: one at a time — AC 9 | T2, T4, T7 | Done |
| RCNT-10 | P1: one at a time — AC 10 | T3 | Done |
| RCNT-11 | P1: one at a time — AC 11 | T3, T7, T14 | Done |
| RCNT-12 | P1: one at a time — AC 12 | T2, T4, T7, T14 | Done |
| RCNT-13 | P1: shared lane — AC 13 | T4, T8 | Done |
| RCNT-14 | P1: shared lane — AC 14 | T4 | Done |
| RCNT-15 | P1: shared lane — AC 15 | T4 | Done |
| RCNT-16 | P1: shared lane — AC 16 | — | Dropped (PERF-22) |
| RCNT-17 | P1: shared lane — AC 17 | T5, T6, T8 | Done |
| RCNT-18 | P1: shared lane — AC 18 | — | Dropped (owner 2026-10-03) |
| RCNT-19 | P1: tree — AC 19 | — | Delivered by #154 (PERF-11) |
| RCNT-20 | P1: tree — AC 20 | — | Delivered by #154 (PERF-11) |
| RCNT-21 | P1: tree — AC 21 | — | Delivered by #154 (PERF-11) |
| RCNT-22 | P1: status bar — AC 22 | — | Delivered by #154 (PERF-12) |
| RCNT-23 | P1: status bar — AC 23 | — | Delivered by #154 (PERF-12) |
| RCNT-24 | P1: status bar — AC 24 | — | Delivered by #154 (PERF-13) |
| RCNT-25 | P1: status bar — AC 25 | — | Delivered by #154 (AD-052) |
| RCNT-26 | P1: status bar — AC 26 | T9 | Done |
| RCNT-27 | P1: current — AC 27 | T10, T13 | Done |
| RCNT-28 | P1: current — AC 28 | — | Dropped (2026-10-03) |
| RCNT-29 | P1: current — AC 29 | — | Dropped (2026-10-03) |
| RCNT-30 | P1: current — AC 30 | T10, T13 | Done |
| RCNT-31 | P1: measured — AC 31 | — | Dropped (2026-10-03) |
| RCNT-32 | P1: measured — AC 32 | T11, T13 | Done |
| RCNT-33 | P1: measured — AC 33 | — | Dropped (2026-10-03) |
| RCNT-34 | P1: measured — AC 34 | — | Dropped (2026-10-03) |
| RCNT-35 | P1: measured — AC 35 | T1 | Done |
| RCNT-36 | P1: measured — AC 36 | — | Dropped (2026-10-03) |
| RCNT-37 | Edge: due exactly at the spacing | T2, T12 | Done |
| RCNT-38 | Edge: request during a run | T4 | Done |
| RCNT-39 | Edge: a read that throws | — | Dropped (owner 2026-10-03) |
| RCNT-40 | Edge: the described worktree changes | — | Delivered by #154 (AD-052) |
| RCNT-41 | Edge: forget with a request waiting | T4 | Done |

**Coverage:** 41 total; 24 mapped to tasks, 17 dropped or delivered by #154 (`## Dependencies`), 0 unmapped.

**Revised by this feature** (recorded at Execute in the same change, AD-018 / AD-028 pattern):
SCRF-02's mechanism moves from the watcher into the scheduler, and its AC still holds (T7);
FCMT-32's trigger becomes the `tree:get` result (T9). SCRF-03 and STBR-11 were already amended by
AD-052 (#154), so this feature no longer touches them.

---

## Success Criteria

- [x] The bench's `git status <= 1 per worktree per s` target reads FAIL at #147's baseline and PASS
  after, with `no overlapping git on one worktree` still PASS (T11 read 2, FAIL; after the T12 fix,
  T13 reads 1, PASS)
- [x] The status bar smoke's #107 counter checks pass, and fail on a main mutant (T10, T13)
- [x] The Files Commits smoke's FCMT-32 check passes with the list on `tree:get` results (T9)

## Follow-ups

Recorded after verification (validation.md); none blocks the feature.

- **F1 (RCNT-26):** no smoke check shows that a recount patch leaves the Files Commits list alone;
  `smoke-files-commits.mjs` check 20 also passes when the list follows tree identity. The code was
  read correct (`use-tree.ts` patches the tree without bumping `treeRevision`). A check would edit a
  file in another worktree while the Commits list is open and count `git:commits` calls.
- **Status bar reads beside a recount:** the bench selects no worktree, so `git:sync-state` and
  `git:commits` reads of the selected worktree are not in the overlap figure (dropped RCNT-18, owner
  2026-10-03). Revisit if a selected-worktree run ever shows overlap.
