# Performance Diagnostics Specification

## Problem Statement

The app slows down as sessions are added: a new Claude session takes long to start, typed text echoes
seconds late from the second or third session on, and Task Manager shows many `git` processes at once.
Reading the code points at four suspects (the per-session scrollback buffer, the git-state recount
cascade, the Files view watcher, synchronous git in main), each tracked in its own issue (#148, #149,
#150, #151). The app has no measurement at all: no counters, no timings, no event-loop figures. Without
numbers, a fix cannot show it helped and the order of the fixes is a guess. Upstream issue #147 is the
owner-approved scope; it is the base the four fix issues measure against.

**Since this plan was written (reconciled 2026-10-03 on `6d96ae4`).** Upstream PR #154
(`multi-agent-performance`) made the scrollback append O(chunk) and closed #148, read a period's git
fields asynchronously (`readGitAsync`, PERF-21), paced every `git()` spawn through one queue of at most
4 running (PERF-22), and added a console-only event-loop line behind `PLAYGROUND_DEBUG_PERF=1`
(PERF-16). PR #157 moved node-pty into a utility process; PTY chunks still reach main and are appended
there. #149, #150 and #151 are still open. The log below is still the only per-worktree, per-session
record, and the bench is still the only repeatable load.

## Goals

- [ ] One environment variable turns on a log that writes, once a minute, every figure the four fix issues name as their target
- [ ] With the variable unset, the app runs exactly as today: no timer, no monitor, no file
- [ ] One command runs a repeatable load of N fake sessions on the built app and prints the figures against the targets
- [ ] The baseline for N = 0, 1, 3 and 6 is recorded, and each target is calibrated against it before any fix starts

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Any fix to the suspects (scrollback, git cascade, Files watcher, synchronous git, name poller) | Issue #147: each has its own issue (#148-#151) and measures with this bench |
| A UI for the figures | Issue #147, Out of Scope |
| Renderer-side profiling (React commits, paint) | Issue #147: stays a manual DevTools step |
| Log rotation or a size cap | One line a minute is about 2 KB, roughly 3 MB a day left on; the log is opt-in and the user deletes it |
| Running the bench in CI | It needs a desktop session and a built app; like the smokes, it is run by hand |
| A final partial line on quit | See the assumption below; the bench does not need it |
| Driving the Files view from the bench (a build-folder write loop) | #150 adds it to this bench; this feature leaves the option table open for it |
| The PTY host's own event loop | #157 moved node-pty out of main; the slowness reported is on main's loop, where chunks are still appended |
| Removing the unused synchronous `readGit` | No caller since #154; deleting it is unrelated cleanup |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What the log is and when it runs | Off by default; an environment variable turns it on; main appends one JSON line a minute to a file in the user data folder | Issue #147, Solution 1 and Implementation Decisions | owner confirmed 2026-10-01 |
| What a line holds | Git processes by subcommand (count, total and max duration, peak concurrency); main's event-loop delay (p50, p99, max); PTY chunks and bytes per session; scrollback append time (total, max per chunk); `worktree:status` emits and recounts per worktree | Issue #147, Solution 1 | owner confirmed 2026-10-01 |
| Where git is counted | In the single git runner; the spawns outside it are routed through it or counted at their call site | Issue #147, Implementation Decisions | owner confirmed 2026-10-01 |
| When a git process counts, now that `git()` queues its spawns (PERF-22) | When the queue lets the process start: counts, peaks and durations are the real process's. The time each call waited in the queue goes to `git.wait` (total, max) | Counting at the request would put queue time into durations and show more running at once than the queue allows | owner confirmed 2026-10-03 |
| Event-loop source | `perf_hooks.monitorEventLoopDelay` | Issue #147, Implementation Decisions | owner confirmed 2026-10-01 |
| Module shape | One diagnostics module in main owns the counters and the minute flush; clock and writer are injected; disabled, it is a no-op that adds no timers | Issue #147, Implementation Decisions | owner confirmed 2026-10-01 |
| Log format and privacy | JSON lines, appended asynchronously; worktrees by folder name only, no full repository path | Issue #147, Implementation Decisions | owner confirmed 2026-10-01 |
| Bench | Starts the built app on a throwaway user data folder with N raw-command sessions printing TUI-like full-screen redraws at a steady rate, an optional `.git/index` rewrite loop, a fixed run time with diagnostics on, and a summary read from the log | Issue #147, Solution 2 and Implementation Decisions | owner confirmed 2026-10-01 |
| Targets | Event-loop p99 under 30 ms with 6 sessions printing; scrollback append under 0.1 ms per chunk; at most one `git status` per worktree per second under continuous index writes; no two git processes overlapping on one worktree | Issue #147, Solution 3 | owner confirmed 2026-10-01 |
| Tests | Unit tests on the module with a fake clock (counts and durations per subcommand, peak concurrency, minute flush, percentiles, no-op when disabled); a unit test that the git runner reports each call; the bench is a script, its figures go in the validation notes | Issue #147, Testing Decisions | owner confirmed 2026-10-01 |
| Stop rule | If the baseline contradicts the suspects (a target is already met, e.g. the event loop is fine at 6 sessions), the owner is told before the fix issue for that target proceeds | Instruction for this plan | owner confirmed 2026-10-01 |
| The variable's name and value | `PLAYGROUND_DEBUG_PERF=1` turns it on, the variable #154 already reads for its console loop line (PERF-16); unset, empty, `0` or any other value leaves both off. The console line stays as it is; the log keeps its own loop monitor | One switch for "performance debugging"; one exact value cannot be turned on by accident. Was `PLAYGROUND_DIAGNOSTICS=1` before #154 merged | owner confirmed 2026-10-03 |
| Log file | `perf-diagnostics.jsonl` directly in the user data folder (`app.getPath('userData')`), appended across launches; every line carries `pid` and `version`, so two launches can be told apart | Next to `config.json`, where a user already looks; a pid per line separates runs without a header line | owner confirmed 2026-10-01 |
| A partial minute on quit | Not written: the timer and the monitor stop, and the last partial window is dropped | Writing on quit would need a synchronous write on the quit path; the bench reads full minutes only | owner confirmed 2026-10-01 |
| Event-loop resolution | 10 ms (Node's default); values are reported as the histogram gives them, with `resolutionMs: 10` in the line | Node's histogram records the whole interval between timer runs, so an idle loop reads about the resolution; the N = 0 run measures that floor (flagged as unverified in design.md) | owner confirmed 2026-10-01 |
| Counters beyond the issue's list | The line also counts `files:changed` emits per worktree and `claude agents --json` runs (count, total, max) | #150 measures refreshes from the Files watcher and #151 measures the name poller's backoff; both are a counter at an existing call site | owner confirmed 2026-10-01 |
| `git status` per second | `maxPerSecond` per worktree and subcommand: the most starts inside any 1,000 ms span, sliding | A fixed one-second bucket can read 1 when two starts sit 100 ms apart across a bucket edge | owner confirmed 2026-10-01 |
| The time tracker's git read | `readGitAsync` (#154, PERF-21) runs through `git()` with its 2 s timeout and its nulls on any failure, so it is queued and counted like every other call. There is no `git.sync` section: the synchronous `readGit` has no caller | Same single-runner rule as the fetch and the branch read; superseded the 2026-10-01 row "count the `execFileSync` under `git.sync`" | owner confirmed 2026-10-03 |
| Two worktrees with the same folder name | Their figures merge under one key | The issue allows folder names only; a hash would add a key nobody can read; the bench names its own worktrees uniquely | owner confirmed 2026-10-01 |
| A session's key in `pty` | Its session id | An id is random and names nothing on disk | owner confirmed 2026-10-01 |
| Bench seed | One repository with `--files` tracked files (default 500) and one linked worktree per session, `bench-wt-1` to `bench-wt-N`, registered as the only workspace | One session per worktree gives the per-worktree figures #149 reads; 500 files make `git status` cost something without a large checkout | owner confirmed 2026-10-01 |
| Bench phases | The bench waits for the first line (`startup`), then opens the sessions (`spawn`), then measures `--minutes` full lines (`steady`, default 3) | App start and session start stay out of the steady figures; the spawn line is the one #151 reads | owner confirmed 2026-10-01 |
| Fake TUI defaults | 20 frames a second, 30 lines a frame, Ink-style redraw (cursor up and erase the last frame, then write the new one), every frame different | "Tens of times a second" (#148); Claude Code renders with Ink | owner confirmed 2026-10-01 |
| Attached session | The bench attaches the first session, so one session forwards `session:data` as in real use | A run with nothing attached would skip the forward every real run has | owner confirmed 2026-10-01 |
| Index loop | `--index-interval <ms>` rewrites the first worktree's git-dir `index` with its own bytes every that many ms, from the moment the sessions open; write errors are counted and skipped | Same bytes keep the repository valid; the watcher reacts to the file event, not to its content | owner confirmed 2026-10-01 |
| The bench never gates | A completed run exits 0 whatever the figures; only a harness failure exits non-zero | It measures; the fix issues judge their own target | owner confirmed 2026-10-01 |
| Where the baseline lives | A `## Baseline` section in `.specs/features/perf-diagnostics/validation.md`, written by the baseline task; the Verifier adds its report and keeps the section | "The feature's validation notes" (issue #147); one file the four fix plans cite | owner confirmed 2026-10-01 |
| A target whose issue is closed | The append target stays in the summary as a regression guard; the stop rule does not fire for it | #148 was closed by #154; there is no fix left to hold back | owner confirmed 2026-10-03 |
| Calibration of the loop target | Kept at 30 ms when the N = 0 p99 is under 20 ms; otherwise the target becomes the N = 0 p99 plus 10 ms, and the owner is told | The target must sit above the floor the measurement itself adds | owner confirmed 2026-10-01 |
| Telling users how to turn it on | A short "Diagnostics" section in `README.md`: the variable, the file, what it holds | User story 4 needs the user to find it; no UI is in scope | owner confirmed 2026-10-01 |

**Open questions:** none unmarked. The owner confirmed every row above on 2026-10-01.

---

## User Stories

### P1: An opt-in diagnostics log ⭐ MVP

**User Story**: As a user who sees the app slow down, I want to turn on a log and send its figures, and
I want it off unless I turn it on, so that the slowness on my machine can be diagnosed and it costs
nothing day to day.

**Why P1**: Every other story writes into this log.

**Acceptance Criteria**:

1. WHERE `PLAYGROUND_DEBUG_PERF` is `1` when the app starts, the app SHALL append one line to `perf-diagnostics.jsonl` in its user data folder every 60,000 ms <!-- optional-feature -->
2. WHILE `PLAYGROUND_DEBUG_PERF` is unset or holds any value other than `1`, the diagnostics module SHALL start no timer, create no event-loop monitor and write no file <!-- state-driven -->
3. The module SHALL append each line asynchronously as one complete JSON object followed by `\n`, and SHALL write lines in window order, one write at a time <!-- ubiquitous -->
4. The module SHALL give every line `v: 1`, `t` (the window's end, ISO 8601 UTC), `windowMs` (the window's measured length), `pid`, `version`, and the sections `loop`, `git`, `pty`, `emits`, `recounts` and `names`, each present even when empty <!-- ubiquitous -->
5. The module SHALL name a worktree by the last segment of its path only, and SHALL NOT write a full path, a git argument other than the subcommand, or any terminal content <!-- ubiquitous -->
6. WHEN a line is written THEN the module SHALL restart every count, total and maximum from zero for the next window, and SHALL restart each peak concurrency from the processes still running <!-- event-driven -->
7. IF a write fails THEN the module SHALL drop that window's line, log one console error per failure streak naming the file and the error code, keep counting, and SHALL NOT throw <!-- unwanted-behavior -->
8. WHEN the app quits THEN the module SHALL cancel its timer and disable its event-loop monitor, and SHALL NOT write a partial window <!-- event-driven -->

**Independent Test**: Launch the built app with `PLAYGROUND_DEBUG_PERF=1` on a throwaway user data
folder: after 65 s the file holds one line that parses, with all six sections. Launch it again without
the variable: after 65 s no file exists.

---

### P1: Git processes counted ⭐ MVP

**User Story**: As the developer fixing the slowness, I want to see how many git processes the app
starts and how long they take, so that I know which trigger to fix first.

**Why P1**: Two of the four fix issues (#149, #151) set their target in git processes.

**Acceptance Criteria**:

9. The git runner SHALL report every call to the diagnostics module when it is requested, its start when the spawn queue lets the process run, and its end whether it succeeded, failed or timed out <!-- ubiquitous -->
10. WHEN a git process starts THEN the module SHALL count it under its subcommand: the first argument that does not start with `-`, skipping the value after `-c` or `-C`, and `(none)` when no argument qualifies <!-- event-driven -->
11. WHEN a git process ends THEN the module SHALL add its duration to `totalMs` and raise `maxMs`, both for its subcommand and for the total <!-- event-driven -->
12. The module SHALL report `peakConcurrent`, the most git processes running at once during the window, for the whole app and for each worktree <!-- ubiquitous -->
13. The module SHALL report, for each worktree and subcommand, the count and `maxPerSecond`: the most starts that fell inside any 1,000 ms span of the window <!-- ubiquitous -->
14. The workflow step's `git fetch`, the notification's branch read and the time tracker's asynchronous git read SHALL run through the git runner, with the arguments and timeout they use today <!-- ubiquitous -->
15. WHEN a git process starts THEN the module SHALL add the time since its call was requested to `git.wait.totalMs` and raise `git.wait.maxMs`; a call that has not started SHALL count in neither `count` nor `peakConcurrent` <!-- event-driven -->
16. IF the end of one git process is reported twice THEN the module SHALL count it once <!-- unwanted-behavior -->

**Independent Test**: With a recording fake installed, `git(dir, ['rev-parse', '--git-dir'])` in a
folder outside git rejects and the fake holds one start and one end for `rev-parse`; a fake-clock unit
test with three overlapping `status` calls on one worktree reads `peakConcurrent: 3` and
`maxPerSecond.status: 3`.

---

### P1: Main's event-loop delay ⭐ MVP

**User Story**: As the developer, I want main's event-loop delay over time, so that I can tell whether
main is congested.

**Why P1**: Two targets (#148, #151) are event-loop figures.

**Acceptance Criteria**:

17. WHILE diagnostics is on, the module SHALL sample main's event-loop delay with `perf_hooks.monitorEventLoopDelay` at a 10 ms resolution <!-- state-driven -->
18. WHEN a line is written THEN its `loop` section SHALL hold `p50Ms`, `p99Ms` and `maxMs` of the window's samples in milliseconds rounded to 3 decimals, and `resolutionMs: 10`, and the histogram SHALL be reset <!-- event-driven -->
19. IF the window holds no sample THEN `p50Ms`, `p99Ms` and `maxMs` SHALL be 0 <!-- unwanted-behavior -->

**Independent Test**: A fake monitor answering 12,000,000 ns for p50 and 31,500,000 ns for p99 gives a
line with `p50Ms: 12` and `p99Ms: 31.5`, and the monitor's reset count goes up by one.

---

### P1: The cost of terminal output, per session ⭐ MVP

**User Story**: As the developer, I want the cost of handling terminal output per session, so that I
can see how it grows with sessions.

**Why P1**: #148's target is the append cost per chunk.

**Acceptance Criteria**:

20. WHEN a PTY chunk arrives for a session THEN the module SHALL add one to that session's `chunks` and the chunk's UTF-8 length to its `bytes` <!-- event-driven -->
21. WHEN a chunk is appended to the session's scrollback THEN the module SHALL add the append's duration to the session's `appendMs` and raise its `appendMaxMs` <!-- event-driven -->
22. WHILE diagnostics is off, the session manager SHALL append each chunk to the scrollback exactly once and read no clock <!-- state-driven -->
23. IF the append throws THEN the module SHALL still record the chunk and its duration, and the error SHALL reach the caller unchanged <!-- unwanted-behavior -->

**Independent Test**: With a recording fake installed, one chunk `"é\n"` from a fake PTY reaches the
fake once with the session's id and 3 bytes, and the scrollback holds it.

---

### P1: Git-state activity per worktree ⭐ MVP

**User Story**: As the developer, I want to see how often main recounts a worktree and tells the
renderer, so that the cascade #149 and #150 describe shows up as numbers.

**Why P1**: The recount and emit counts are the cause side of #149's git figures.

**Acceptance Criteria**:

24. WHEN main starts a worktree recount THEN the module SHALL count it under the worktree's folder in `recounts` <!-- event-driven -->
25. WHEN main emits `worktree:status` THEN the module SHALL count it under the worktree's folder in `emits["worktree:status"]` <!-- event-driven -->
26. WHEN main emits `files:changed` THEN the module SHALL count it under the worktree's folder in `emits["files:changed"]` <!-- event-driven -->
27. WHEN the session-name poller starts `claude agents --json` THEN the module SHALL count it in `names`, and SHALL add its duration to `totalMs` and raise `maxMs` when it settles <!-- event-driven -->

**Independent Test**: A fake-clock unit test records two recounts and one emit for `C:\x\bench-wt-1`
and reads `recounts: { "bench-wt-1": 2 }` and `emits["worktree:status"]: { "bench-wt-1": 1 }`.

---

### P1: A repeatable multi-session bench ⭐ MVP

**User Story**: As the developer, I want a repeatable bench with N fake sessions that needs no account,
so that before and after figures compare the same load.

**Why P1**: The four fix issues name this bench as their measurement.

**Acceptance Criteria**:

28. IF `out/main/index.js` is missing THEN `node scripts/bench-sessions.mjs` SHALL exit 2 with a message naming `npx electron-vite build`, and SHALL start nothing <!-- unwanted-behavior -->
29. The bench SHALL start the built app with a new temporary `--user-data-dir`, `PLAYGROUND_DEBUG_PERF=1`, `--remote-debugging-port`, `--disable-renderer-backgrounding`, `--disable-backgrounding-occluded-windows` and `--disable-background-timer-throttling` <!-- ubiquitous -->
30. The bench SHALL seed its own repository with `--files` tracked files (default 500) and one linked worktree per session named `bench-wt-1` to `bench-wt-N` (at least `bench-wt-1`, so `--sessions 0` seeds one), registered as the only workspace of the temporary user data folder <!-- ubiquitous -->
31. WHEN the first log line appears THEN the bench SHALL open `--sessions` (default 3) raw-command sessions through `sessions:spawn`, session i in `bench-wt-i`, each running `scripts/bench-tui.mjs`, and SHALL attach the first one <!-- event-driven -->
32. The bench SHALL never spawn a registry agent, and SHALL need no account and no network <!-- ubiquitous -->
33. The fake TUI SHALL write `--fps` frames a second (default 20) of `--rows` lines (default 30): it moves the cursor up and erases the previous frame, then writes the new frame with SGR colours, and no two consecutive frames are equal <!-- ubiquitous -->
34. WHERE `--index-interval <ms>` is given, the bench SHALL rewrite the first worktree's git-dir `index` file with its own bytes every that many ms from the moment the sessions open, counting and skipping failed writes <!-- optional-feature -->
35. WHEN `--minutes` lines (default 3) have been written after the spawn line THEN the bench SHALL stop the sessions, close the window and print the summary <!-- event-driven -->
36. The summary SHALL print one row per line, labelled `startup`, `spawn` and `steady 1` to `steady m`, then a `worst` row over the steady rows, then one target line per target with its value and PASS, FAIL, or `n/a` when the run cannot judge it <!-- ubiquitous -->
37. The summary SHALL print, after the rows, one line with the longest `sessions:spawn` round trip the bench measured, in ms <!-- ubiquitous -->
38. WHERE `--json <file>` is given, the bench SHALL write the options, the raw lines and the summary to that file <!-- optional-feature -->
39. The bench SHALL exit 0 after a completed run whatever the figures, and SHALL delete its temporary folders unless `--keep` is given <!-- ubiquitous -->

**Independent Test**: `node scripts/bench-sessions.mjs --sessions 1 --minutes 1` prints three rows and
the target block in about three minutes, and leaves no temporary folder and no app process behind.

---

### P1: Baseline and targets ⭐ MVP

**User Story**: As the developer, I want fixed targets calibrated against today's figures, so that each
fix has a clear finish line.

**Why P1**: The fix issues cannot start without a baseline.

**Acceptance Criteria**:

40. The validation notes SHALL record the bench summary for `--sessions` 0, 1, 3 and 6 at the default settings, and for `--sessions 6 --index-interval 100`, each with the commit it ran on <!-- ubiquitous -->
41. The summary's target block SHALL judge: `loop.p99Ms` under 30 in every steady row with 6 sessions; mean append time (`appendMs` over `chunks`, all sessions, steady rows) under 0.1 ms; `maxPerSecond.status` at most 1 for every worktree in every steady row of an index run; `peakConcurrent` at most 1 for every worktree in every steady row <!-- ubiquitous -->
42. IF the N = 0 run's worst steady `loop.p99Ms` is 20 ms or more THEN the baseline task SHALL set the loop target to that value plus 10 ms and tell the owner <!-- unwanted-behavior -->
43. IF the baseline already meets a target owned by an open fix issue THEN the baseline task SHALL stop and report to the owner before that issue proceeds; a target whose issue is closed (append, #148) SHALL be recorded as a regression guard <!-- unwanted-behavior -->

**Independent Test**: The `## Baseline` section of `validation.md` holds five summaries, the target
values used, and the stop-rule verdict in writing.

---

### P2: Turning it on is documented

**User Story**: As a user, I want to read how to turn the log on, so that I can send its figures
without asking.

**Why P2**: The log works without it; the user story needs it to be found.

**Acceptance Criteria**:

44. The README SHALL have a "Diagnostics" section naming `PLAYGROUND_DEBUG_PERF=1`, the file `perf-diagnostics.jsonl` in the user data folder, the one-line-a-minute cadence, and that worktrees appear by folder name only <!-- ubiquitous -->

**Independent Test**: The section reads in under a minute and the variable it names turns the log on.

---

## Edge Cases

- WHEN a git process starts in one window and ends in the next THEN the module SHALL count it in the window it started and add its duration in the window it ended
- WHEN a session exits during a window THEN its `pty` entry SHALL stay in that window's line and SHALL be absent from later lines
- WHEN a path ends in a separator or has no segment (a drive root) THEN the module SHALL name it by its last non-empty segment, or `(none)` when there is none
- IF the bench is interrupted with Ctrl+C THEN it SHALL kill the app's process tree and delete its temporary folders unless `--keep` is given
- IF the app does not exit within 30 s of the window closing THEN the bench SHALL kill its process tree
- IF the expected lines have not arrived within `--minutes` plus 3 minutes THEN the bench SHALL print the lines it has, clean up, and exit 1
- WHEN `--sessions 0` is given THEN the bench SHALL open no session and still print the `spawn` row

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PDIAG-01 | P1: log — AC 1 | T2, T5, T11 | Done (T2, T5, T11) |
| PDIAG-02 | P1: log — AC 2 | T1, T5, T11 | Done (T1, T5, T11) |
| PDIAG-03 | P1: log — AC 3 | T2, T5 | Done (T2, T5) |
| PDIAG-04 | P1: log — AC 4 | T2 | Done (T2) |
| PDIAG-05 | P1: log — AC 5 | T3, T4 | Done (T3, T4) |
| PDIAG-06 | P1: log — AC 6 | T2, T3 | Done (T2, T3) |
| PDIAG-07 | P1: log — AC 7 | T2 | Done (T2) |
| PDIAG-08 | P1: log — AC 8 | T2, T11 | Done (T2, T11) |
| PDIAG-09 | P1: git — AC 9 | T6 | Done (T6) |
| PDIAG-10 | P1: git — AC 10 | T3 | Done (T3) |
| PDIAG-11 | P1: git — AC 11 | T3 | Done (T3) |
| PDIAG-12 | P1: git — AC 12 | T3 | Done (T3) |
| PDIAG-13 | P1: git — AC 13 | T3 | Done (T3) |
| PDIAG-14 | P1: git — AC 14 | T7, T8 | Done (T7, T8) |
| PDIAG-15 | P1: git — AC 15 | T3, T6 | Done (T3, T6) |
| PDIAG-16 | P1: git — AC 16 | T3 | Done (T3) |
| PDIAG-17 | P1: loop — AC 17 | T5, T16 | Done (T5, T16) |
| PDIAG-18 | P1: loop — AC 18 | T2 | Done (T2) |
| PDIAG-19 | P1: loop — AC 19 | T2 | Done (T2) |
| PDIAG-20 | P1: pty — AC 20 | T4, T9 | Done (T4, T9) |
| PDIAG-21 | P1: pty — AC 21 | T4, T9 | Done (T4, T9) |
| PDIAG-22 | P1: pty — AC 22 | T1, T9 | Done (T1, T9) |
| PDIAG-23 | P1: pty — AC 23 | T4 | Done (T4) |
| PDIAG-24 | P1: activity — AC 24 | T4, T11 | Done (T4, T11) |
| PDIAG-25 | P1: activity — AC 25 | T4, T11 | Done (T4, T11) |
| PDIAG-26 | P1: activity — AC 26 | T4, T11 | Done (T4, T11) |
| PDIAG-27 | P1: activity — AC 27 | T4, T10 | Done (T4, T10) |
| PDIAG-28 | P1: bench — AC 28 | T15 | Done (T15) |
| PDIAG-29 | P1: bench — AC 29 | T15 | Done (T15) |
| PDIAG-30 | P1: bench — AC 30 | T15 | Done (T15) |
| PDIAG-31 | P1: bench — AC 31 | T15 | Done (T15) |
| PDIAG-32 | P1: bench — AC 32 | T15 | Done (T15) |
| PDIAG-33 | P1: bench — AC 33 | T13 | Done (T13) |
| PDIAG-34 | P1: bench — AC 34 | T15, T16 | Done (T15, T16) |
| PDIAG-35 | P1: bench — AC 35 | T15 | Done (T15) |
| PDIAG-36 | P1: bench — AC 36 | T14 | Done (T14) |
| PDIAG-37 | P1: bench — AC 37 | T14, T15 | Done (T14, T15) |
| PDIAG-38 | P1: bench — AC 38 | T15 | Done (T15) |
| PDIAG-39 | P1: bench — AC 39 | T15 | Done (T15) |
| PDIAG-40 | P1: baseline — AC 40 | T17 | Done (T17) |
| PDIAG-41 | P1: baseline — AC 41 | T14, T16 | Done (T14, T16) |
| PDIAG-42 | P1: baseline — AC 42 | T17 | Done (T17) |
| PDIAG-43 | P1: baseline — AC 43 | T17 | Done (T17) |
| PDIAG-44 | P2: docs — AC 44 | T12 | Done (T12) |
| PDIAG-45 | Edge: a git process across a flush | T3 | Done (T3) |
| PDIAG-46 | Edge: a session that exits mid-window | T4 | Done (T4) |
| PDIAG-47 | Edge: a path with no last segment | T3 | Done (T3) |
| PDIAG-48 | Edge: Ctrl+C | T15 | Done (T15) |
| PDIAG-49 | Edge: the app does not exit | T15 | Done (T15) |
| PDIAG-50 | Edge: lines never arrive | T15 | Done (T15) |
| PDIAG-51 | Edge: `--sessions 0` | T14, T17 | Done (T14, T17) |

**Coverage:** 51 total, 51 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] With the variable unset, the unit suite proves the module starts no timer and no monitor, and the app writes no file
- [ ] A bench run with a deliberately slowed scrollback append reads a mean append at least 2 ms higher than the same run on the unchanged build
- [ ] The baseline for N = 0, 1, 3 and 6, and N = 6 with the index loop, is in `validation.md`, and each fix issue can quote its starting figure from it
