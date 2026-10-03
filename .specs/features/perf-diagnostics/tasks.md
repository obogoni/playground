# Performance Diagnostics Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/perf-diagnostics/design.md`. In one line: `src/main/diagnostics.ts` holds
every counter and writes one JSON line a minute to `<userData>/perf-diagnostics.jsonl` when
`PLAYGROUND_DEBUG_PERF=1`, reached through `diagnostics()` from the paced git runner (which the
time tracker's async read now goes through), the PTY data path, the name poller and three lines in `index.ts`; `scripts/bench-sessions.mjs`
drives N fake TUI sessions on the built app and prints the figures against the targets.
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01). Reconciled 2026-10-03 with
`main` after PRs #154 and #157, owner's answers: one switch `PLAYGROUND_DEBUG_PERF`, git counted at the
paced start plus its queue wait (`git.wait`, no `git.sync`), `readGitAsync` through `git()`, batch
workers for Execute.

**Branch**: `feature/perf-diagnostics`, cut from `origin/main` `60ff148`, rebased 2026-10-03 onto `6d96ae4`. The four fix issues are
planned on branches stacked on this one. The future PR body carries `Closes #147`.

**Stop rule (T17)**: T17 records the baseline and evaluates it in writing. If any target owned by an
open fix issue is already met at baseline (for example `loop.p99Ms` under 30 in every steady row with 6 sessions), or the N = 0 floor
forces a recalibration, **stop after T17** and report to the owner before the fix issue that owns that
target proceeds. The append target belongs to #148, closed by #154: it is recorded as a regression
guard and never fires the stop rule. The Verifier still runs on T1-T17.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute, after T1's setup;
record the test count, the suite's wall time and the lint warning count at the same time.

**Running the app**: every launch is the BUILT app (`npx electron-vite build` first) on a throwaway
`--user-data-dir`, with `--disable-renderer-backgrounding --disable-backgrounding-occluded-windows
--disable-background-timer-throttling`. No registry agent is ever started: the only sessions are
`Ad-hoc` raw commands running `scripts/bench-tui.mjs`. Kill the app's process tree after every run
(`taskkill /T /F` when it does not exit) and confirm no `electron` process is left.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (deep main modules and pure helpers unit-tested with hand-rolled injected fakes, no `vi.mock`; thin OS/Electron shells and `index.ts` wiring hand-verified; scripts by hand), `vitest.config.ts` (`src/**/*.test.ts`, `scripts/**/*.test.ts`, 30 s timeouts), `package.json` scripts; style sampled from `src/main/git.test.ts`, `src/main/session-manager.test.ts`, `src/main/session-name-poller.test.ts`, `src/main/time-snapshot.test.ts`, `scripts/release-version.test.ts`; confirmed lessons L-001, L-005, L-009 and candidates L-018, L-020, L-021, L-025, L-031 applied.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Diagnostics module (`diagnostics.ts`: counters, flush, no-op, pure helpers) | unit | All branches; 1:1 to PDIAG-01..08, 10..13, 15..27 as module rules, and edge cases 45..47; fake clock, fake monitor, recording writer; every constant pinned by a literal (L-009) | `src/main/diagnostics.test.ts` | `npx vitest run src/main/diagnostics.test.ts` |
| Diagnostics real ports (`appendWriter`, `createAppDiagnostics`) | unit (real temp dir) | Enabled writes to `<userData>/perf-diagnostics.jsonl`; disabled leaves no file and touches no port | `src/main/diagnostics.test.ts` | same |
| Probe call sites in deep modules (`git.ts`, `time-snapshot.ts`, `session-manager.ts`, `session-name-poller.ts`) | unit | Each site reports exactly once per event, on every outcome it has (success, failure, timeout, throw); asserted on the recording fake, not on the wrapper's result (L-020) | co-located `*.test.ts` | `npx vitest run <file>` |
| `index.ts` wiring (install, recount and emit probes, quit, `gitFetch` / `readBranch` rewire) | none (hand-verified) | Read against the design; observed in the built app by T11 and the bench | — | `npm run typecheck` + manual |
| Bench summary (`scripts/bench-summary.mjs`) | unit | Every column, the phase labels, the worst row, each target's PASS / FAIL / n/a branch, `--sessions 0` | `scripts/bench-summary.test.ts` | `npx vitest run scripts/bench-summary.test.ts` |
| Bench scripts (`bench-tui.mjs`, `bench-sessions.mjs`) | manual | Each AC observed on a real run, and the figures shown to move under a deliberate fault (T16) | `scripts/bench-*.mjs` | `node scripts/bench-sessions.mjs ...` |
| README | none | — | — | build gate only |

**Evidence split** (L-021, L-025): PDIAG-28..39 and 48..50 are observed on named bench runs written
down in T15's result; PDIAG-17 and 34 are proven to move in T16; PDIAG-40, 42, 43 are T17's written
record. Every other ID has a unit test named in its task.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | A task whose only tests are unit tests | `npx vitest run <the task's test file>` |
| Full | Every code task, after its quick gate | `npm run typecheck && npm run lint && npm test` |
| Build | T11, T15 and every phase end | `npx electron-vite build` |
| Manual | T11, T13, T15, T16, T17 | `npx electron-vite build`, then the run the task names |

**Lint is judged by exit code AND by warning count**: record the count at T1 and diff it at every gate.

**Mutating for a falsification** (T16): through a script that copies the file to `.orig`, writes the
mutant, and restores in `finally`; rebuild before the run; `git status --porcelain` must match the
baseline afterwards.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: The diagnostics module

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Probes and wiring

```
T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12
```

### Phase 3: The bench

```
T12 → T13 → T14 → T15 → T16
```

### Phase 4: Baseline and targets

```
T16 → T17
```

---

## Task Breakdown

### T1: Setup, the switch and the no-op

**What**: Prepare the worktree, record the baseline, and add the module's constants, `diagnosticsEnabled`,
`NOOP_DIAGNOSTICS`, `installDiagnostics` and `diagnostics()`.
**Where**: `src/main/diagnostics.ts`
**Depends on**: None
**Reuses**: the `PLAYGROUND_DEBUG_PERF === '1'` check (`src/main/index.ts:316`); `LOOP_RESOLUTION_MS` from `src/main/perf-monitor.ts`
**Requirement**: PDIAG-02, PDIAG-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**:

1. Setup in the worktree: `npm ci --ignore-scripts`, then `node node_modules/electron/install.js`.
2. Baseline: `npx vitest run` (test count, files, wall time) and `npm run lint` (warning count); write
   all four here.
3. The module skeleton with the `Diagnostics` interface from design.md.

**Baseline (2026-10-03, `f1ed79f`, after `npm ci --ignore-scripts` and the Electron install)**:
`npx vitest run` gives **2,508 tests in 119 files**, all passing, Vitest duration **103.7 s** (1 min 46 s
wall); `npm run lint` exits 0 with **18 warnings** (0 errors).

**Done when**:

- [x] Baseline test count, file count, suite wall time and lint warning count recorded here
- [x] Tests: `DIAGNOSTICS_ENV` is `'PLAYGROUND_DEBUG_PERF'`, `DIAGNOSTICS_LOG_FILE` `'perf-diagnostics.jsonl'`, `FLUSH_INTERVAL_MS` `60000`, `PER_SECOND_SPAN_MS` `1000`, each by literal (L-009); `LOOP_RESOLUTION_MS` is imported from `perf-monitor.ts`, whose test already pins it
- [x] Tests: `diagnosticsEnabled` is true for `'1'` only; false for unset, `''`, `'0'`, `'true'`, `' 1'`
- [x] Tests: `diagnostics()` answers `NOOP_DIAGNOSTICS` before any install; `installDiagnostics(fake)` makes it answer the fake; `installDiagnostics(null)` restores the no-op
- [x] Tests: `NOOP_DIAGNOSTICS.enabled` is false; its `measureAppend` calls `append` exactly once and returns; its `gitRequested` returns a `start` whose `end` does nothing, and its `nameListingStarted` returns a function that does nothing; `stop` can be called twice; the object is frozen
- [x] Gate check passes: `npx vitest run src/main/diagnostics.test.ts`, then the full gate
- [x] Test count: baseline + the new tests (2,508 + 7 = 2,515)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): add the diagnostics switch and its no-op`

---

### T2: The minute line

**What**: `createDiagnostics(deps)`: start the monitor and one timer, build and queue one line per
interval with the envelope and the `loop` section, reset after each line, write in order, survive a
failing writer, and stop.
**Where**: `src/main/diagnostics.ts`
**Depends on**: T1
**Reuses**: the injected-fake pattern (`TaskBoard`, `UpdateService`; TESTING.md pattern 3)
**Requirement**: PDIAG-01, PDIAG-03, PDIAG-04, PDIAG-06, PDIAG-07, PDIAG-08, PDIAG-18, PDIAG-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (fake clock with `now`, `wallNow`, `every` it records and fires on demand; fake monitor; recording writer): `createDiagnostics` calls `startLoopMonitor` once and `clock.every` once with `60000` when no `intervalMs` is given
- [x] Tests: firing the timer writes one line that parses, ends in `\n`, and holds `v: 1`, `t` as the ISO string of `wallNow`, `windowMs` as the `now` difference since creation, `pid`, `version`, and all six sections with `git.wait` (empty values: zeros and `{}`)
- [x] Tests: the monitor answering 12,000,000 / 31,500,000 / 61,234,567 ns gives `p50Ms: 12`, `p99Ms: 31.5`, `maxMs: 61.235`, `resolutionMs: 10`; the monitor's `reset` runs once per line; a monitor with `count: 0` gives zeros
- [x] Tests: two flushes with a writer whose first promise resolves after the second is queued land in window order, and the second write starts only after the first settles
- [x] Tests: a rejecting writer drops the line and calls `log` once for two failing flushes in a row with the file name and the error code; a success ends the streak, so the next failure logs again; nothing throws
- [x] Tests: `stop` cancels the timer and disables the monitor; a flush is not attempted after it; a second `stop` changes nothing
- [x] Gate check passes: `npx vitest run src/main/diagnostics.test.ts`, then the full gate
- [x] Test count: T1 count + the new tests (2,515 + 8 = 2,523)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): write one line a minute with the event-loop delay`

---

### T3: Git counters

**What**: `gitSubcommand`, `folderOf` and `gitRequested` with its `start` and `end`: counts by subcommand
and worktree, durations, queue wait, peak concurrency overall and per worktree, `maxPerSecond`, and the
window rules.
**Where**: `src/main/diagnostics.ts`
**Depends on**: T2
**Reuses**: T2's flush and fakes
**Requirement**: PDIAG-05, PDIAG-06, PDIAG-10, PDIAG-11, PDIAG-12, PDIAG-13, PDIAG-15, PDIAG-16, PDIAG-45, PDIAG-47

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `gitSubcommand` gives `status` for `['status', '--porcelain']`, `status` for `['-C', 'x', '--no-optional-locks', 'status']`, `log` for `['-c', 'core.quotepath=off', 'log']`, `(none)` for `['--version']` and for `[]`
- [x] Tests: `folderOf` gives `bench-wt-1` for a backslashed path, a forward-slashed path and one with a trailing separator; `(none)` for `'C:\'`-style roots and `''`
- [x] Tests: two `status` and one `rev-parse` ending after 100, 300 and 50 ms give `count: 3`, `totalMs: 450`, `maxMs: 300`, and the right per-subcommand figures
- [x] Tests: three overlapping calls on one worktree and one on another give `peakConcurrent: 4` overall and `3` / `1` per worktree; sequential calls give `1`
- [x] Tests: starts at 0, 400 and 900 ms give `maxPerSecond: 3`; starts at 0, 600 and 1,200 ms give `2` (sliding span, not a bucket); the exact edge, starts at 0 and 1,000 ms, gives `1` (L-042); starts at 950 and 1,050 ms give `2`, which a fixed bucket would read as 1
- [x] Tests: two calls requested at 0 ms and started at 40 and 100 ms give `wait: { totalMs: 140, maxMs: 100 }`; a call requested and never started counts in neither `count` nor `peakConcurrent`, and its `wait` is not added
- [x] Tests: a `start` or an `end` called twice counts once; a call started in window 1 and ended in window 2 is counted in window 1's `count` and timed in window 2's `totalMs`, and window 2's `peakConcurrent` starts at 1 while it runs
- [x] Tests: no line contains the parent folders of any path passed in, nor any argument other than the subcommand (assert on the serialized line)
- [x] Gate check passes: `npx vitest run src/main/diagnostics.test.ts`, then the full gate
- [x] Test count: T2 count + the new tests (2,523 + 12 = 2,535)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): count git processes by subcommand and worktree`

---

### T4: Output, recount, emit and listing counters

**What**: `measureAppend`, `recountStarted`, `emitted` and `nameListingStarted` into the `pty`,
`recounts`, `emits` and `names` sections.
**Where**: `src/main/diagnostics.ts`
**Depends on**: T3
**Reuses**: T2's flush and fakes; T3's `folderOf`
**Requirement**: PDIAG-05, PDIAG-20, PDIAG-21, PDIAG-23, PDIAG-24, PDIAG-25, PDIAG-26, PDIAG-27, PDIAG-46

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `measureAppend('s1', 'é\n', fn)` runs `fn` once and records `chunks: 1`, `bytes: 3`; two chunks whose appends take 2 ms and 5 ms (fake `now`) give `appendMs: 7`, `appendMaxMs: 5`; a second session has its own entry
- [x] Tests: an `append` that throws still records the chunk and its duration, and the same error object reaches the caller
- [x] Tests: a session with chunks in window 1 and none in window 2 is in line 1 and absent from line 2
- [x] Tests: two `recountStarted` and one `emitted('worktree:status')` for the same worktree path give `recounts: { "bench-wt-1": 2 }` and `emits["worktree:status"]: { "bench-wt-1": 1 }`; `emitted('files:changed')` lands only under `files:changed`
- [x] Tests: two listings of 1,800 ms and 2,200 ms give `names: { count: 2, totalMs: 4000, maxMs: 2200 }`; an end called twice counts once
- [x] Tests: the serialized line holds no session output text and no parent folder of any worktree path
- [x] Gate check passes: `npx vitest run src/main/diagnostics.test.ts`, then the full gate
- [x] Test count: T3 count + the new tests (2,535 + 7 = 2,542)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): count terminal output, recounts, emits and name listings`

---

### T5: The real ports

**What**: `realClock`, `nodeLoopMonitor`, `appendWriter` and `createAppDiagnostics`, which returns the
no-op when disabled before touching any port.
**Where**: `src/main/diagnostics.ts`
**Depends on**: T4
**Reuses**: the real-temp-dir pattern (`config-store.test.ts`; TESTING.md pattern 2)
**Requirement**: PDIAG-01, PDIAG-02, PDIAG-03, PDIAG-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (real temp dir): `appendWriter` creates the file on the first line and appends the second after it, both intact
- [x] Tests: `createAppDiagnostics({ env: {}, userDataPath: tmp, version })` returns `NOOP_DIAGNOSTICS`, and after 50 ms the temp dir holds no file
- [x] Tests: `createAppDiagnostics({ env: { PLAYGROUND_DEBUG_PERF: '1' }, userDataPath: tmp, version: '9.9.9', intervalMs: 50 })` writes a line to `<tmp>/perf-diagnostics.jsonl` within 1 s with `version: '9.9.9'` and this process's `pid`; `stop()` is called in `finally`
- [x] `nodeLoopMonitor` uses `monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS })` and calls `enable()` (read; its effect is observed in T16)
- [x] Gate check passes: `npx vitest run src/main/diagnostics.test.ts`, then the full gate
- [x] Test count: T4 count + the new tests (2,542 + 3 = 2,545)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): write the log to the user data folder`

---

### T6: The git runner reports every call

**What**: `git()` calls `diagnostics().gitRequested(cwd, args)` before `pace(...)`; inside the paced start
it calls `start()` and chains the returned `end` with `finally`.
**Where**: `src/main/git.ts`
**Depends on**: T5
**Reuses**: `git.test.ts`'s `rejectionOf` and its real-git cases
**Requirement**: PDIAG-09, PDIAG-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (recording fake installed, restored in `afterEach`): a successful `git(tmpdir(), ['--version'])` reports one start with that cwd and those args, and its end before the awaited call returns
- [x] Tests: a failing `git(tmpdir(), ['rev-parse', '--verify', 'no-such-ref'])` reports one start and one end, and still rejects with git's error
- [x] Tests: a timed-out `git(tmpdir(), ['hash-object', '--stdin'], { timeoutMs: 200 })` reports one start and one end, and `isTimeout` is still true
- [x] Tests: six `git(tmpdir(), ['--version'])` requested at once report six requests at once, but the fake never sees more than 4 started and not ended (the start is the paced one, not the request), and all six end
- [x] Gate check passes: `npx vitest run src/main/git.test.ts`, then the full gate (suite wall time compared with T1's, L-005: Vitest 91.5 s against T1's 103.7 s)
- [x] Test count: T5 count + the new tests (2,545 + 4 = 2,549)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): report every call of the git runner`

---

### T7: The two stray git spawns go through the runner

**What**: `gitFetch` becomes `await git(cwd, args)` and `readBranch` becomes
`git(cwd, ['symbolic-ref', '--short', 'HEAD'], { timeoutMs: 2000 })`, keeping its `catch`.
**Where**: `src/main/index.ts`
**Depends on**: T6
**Reuses**: `git()` (`src/main/git.ts`)
**Requirement**: PDIAG-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `grep -n "execFileAsync('git'" src/main/index.ts` finds nothing; `execFileAsync` is still used by `readFileDropList` and the `assoc` probe
- [x] Both calls read against the old ones: same arguments, `readBranch` keeps its 2 s timeout and its `null` on any failure, `gitFetch` keeps no timeout and still rejects on a non-zero exit; written here
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Read against the old calls (2026-10-03)**: `gitFetch` passes the same `['fetch', remote?, branch?]` to
`git(cwd, args)` with no options, so `timeout` stays `undefined` as before; a non-zero exit still rejects,
since `git()` returns `execFile`'s rejection through the pacer untouched, and `await` propagates it.
`readBranch` passes `['symbolic-ref', '--short', 'HEAD']` with `{ timeoutMs: 2000 }`, which `git()` maps to
`execFile`'s `timeout: 2000`; its `try / catch` returning `null` and `stdout.trim() || null` are unchanged.
`git()` sets the same `cwd`, `windowsHide: true` and `GIT_TERMINAL_PROMPT=0`; it adds only the 64 MiB
`maxBuffer` and the spawn queue (design.md, "Probes at the call sites"). `execFileAsync` stays for
`readFileDropList` (`powershell.exe`) and the `assoc` probe (`cmd.exe`). Full gate: 2,549 passed, 18 lint
warnings.

**Tests**: none
**Gate**: full

**Commit**: `refactor(main): run the workflow fetch and the branch read through the git runner`

---

### T8: The time tracker's async git read goes through the runner

**What**: `readGitAsync` calls `git(cwd, ARGS, { timeoutMs: 2000 })` in place of `execFile`, splits stdout
as today and answers both nulls on any rejection. The unused synchronous `readGit` is not touched.
**Where**: `src/main/time-snapshot.ts`
**Depends on**: T7
**Reuses**: `time-snapshot.test.ts` (`readGitAsync` cases at `:76`)
**Requirement**: PDIAG-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (recording fake): `readGitAsync` in a temp folder outside git reports one request and one start for subcommand `rev-parse`, ends it once, and still answers both nulls
- [x] Tests: `readGitAsync` in a temp repository (`git init`) reports one start and one end, and answers its git common dir and branch as before (the existing cases still pass unchanged)
- [x] The call read against the old one: same arguments, same 2 s timeout, nulls on any failure; written here
- [x] Gate check passes: `npx vitest run src/main/time-snapshot.test.ts`, then the full gate
- [x] Test count: T7 count + the new tests (2,549 + 2 = 2,551)

**Read against the old call (2026-10-03)**: the same five arguments
(`rev-parse --path-format=absolute --git-common-dir --abbrev-ref HEAD`) go to `git(cwd, args, { timeoutMs:
2000 })`, which becomes `execFile`'s `timeout: 2000` with the same `cwd` and `windowsHide: true`; stdout is
still a UTF-8 string split on `\r?\n`; any rejection (not a repository, git missing, timeout) lands in the
`catch` and answers both nulls, as the old `err ? []` did. `git()` adds `GIT_TERMINAL_PROMPT=0`, the 64 MiB
`maxBuffer` and the spawn queue (design.md). The synchronous `readGit` is untouched. The two existing
`readGitAsync` cases pass unchanged.

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(time): read a period's git fields through the git runner`

---

### T9: The session manager times each append

**What**: `handle.onData` calls `diagnostics().measureAppend(meta.id, data, () => buffer.append(data))`;
the `session:data` forward is unchanged.
**Where**: `src/main/session-manager.ts`
**Depends on**: T8
**Reuses**: `session-manager.test.ts`'s `fakePort` and its handle's `onData`
**Requirement**: PDIAG-20, PDIAG-21, PDIAG-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (recording fake): one chunk from a fake PTY reaches the fake once with the session's id and the chunk, and the session's scrollback snapshot ends with it
- [x] Tests: with no fake installed (the no-op), a chunk lands in the scrollback once and an attached session still forwards it as `session:data`
- [x] Gate check passes: `npx vitest run src/main/session-manager.test.ts`, then the full gate
- [x] Test count: T8 count + the new tests (2,551 + 2 = 2,553)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): time each scrollback append per session`

---

### T10: The name poller reports each listing

**What**: `#call` calls `diagnostics().nameListingStarted()` once the spawn returned, and its end first
thing in `settle`.
**Where**: `src/main/session-name-poller.ts`
**Depends on**: T9
**Reuses**: `session-name-poller.test.ts`'s fake spawn and fake child
**Requirement**: PDIAG-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (recording fake): a listing that closes with code 0 reports one start and one end; one that times out reports one end; one whose child emits `error` then `close` reports one end
- [x] Tests: a spawn that throws reports no start
- [x] Gate check passes: `npx vitest run src/main/session-name-poller.test.ts`, then the full gate
- [x] Test count: T9 count + the new tests (2,553 + 4 = 2,557)

**Note**: the end runs first thing in `settle` after its `settled` guard, so the `error`-then-`close` pair
reports one end at the call site, not only after the module's own de-duplication.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): count the session-name listings`

---

### T11: Wire the module into main

**What**: `installDiagnostics(createAppDiagnostics(...))` first thing in `whenReady`; probes in
`recountWorktree`, the git-state `onSettled` emit and the `fileWatcher` emit; `onWillQuit(() =>
diagnostics().stop())`; `startLoopDelayLog` reads `diagnosticsEnabled(process.env)`.
**Where**: `src/main/index.ts`
**Depends on**: T10
**Reuses**: design.md, "Probes at the call sites"
**Requirement**: PDIAG-01, PDIAG-02, PDIAG-08, PDIAG-24, PDIAG-25, PDIAG-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`
- [x] Manual, enabled: the built app on a fresh `--user-data-dir` with `PLAYGROUND_DEBUG_PERF=1` and the three flags; after 65 s `perf-diagnostics.jsonl` holds one line that parses with all six sections and this build's version, and the app's stdout still shows the `[perf] loop` line every 10 s; the window closed, the process exits within 30 s; result written here
- [x] Manual, disabled: the same launch without the variable; after 65 s the user data folder holds no `perf-diagnostics.jsonl` and stdout shows no `[perf] loop` line; result written here
- [x] Manual, the probes: on the enabled launch, a `git commit --allow-empty` in a registered worktree's terminal outside the app moves `recounts` and `emits["worktree:status"]` for that worktree's folder in the next line (seed with `scripts/bench-sessions.mjs`'s layout by hand, or any throwaway repo registered in the throwaway config); result written here

**Results (2026-10-03, built app at this task's tree, `node_modules/electron/dist/electron.exe .`, throwaway
`--user-data-dir` in a temp folder, the three flags, CDP port 9347; a scratch driver, not a repo file)**:

- **Enabled**: the first line landed at 61-63 s after launch and parsed with `v: 1`, `windowMs` 60,008,
  this process's `pid`, `version: "0.1.0"` (what `app:version` answers), and all six sections plus
  `git.wait`. Line 1 counted the start-up git work: 11 processes (`worktree` 3, `status` 6, `rev-parse` 2),
  `peakConcurrent: 4`, `wait.maxMs` 96.5, keyed `app` and `probe-wt-1` only; no line held the temp path.
  The `[perf] loop` line printed 12 times, at 12.5 s, 22.5 s ... 122.5 s, every 10 s. `window.close()`
  through CDP: exit code 0 after 0.2 s. Loop floor at idle: `p50Ms` 15.9, `p99Ms` 16.8-17.3.
- **Disabled**: the same launch with `PLAYGROUND_DEBUG_PERF` removed from the env; after 66 s the user
  data folder held 16 entries and no `perf-diagnostics.jsonl`, and stdout had no `[perf] loop` line. Exit
  code 0 after 0.2 s.
- **Probes**: a throwaway repository `app` with one linked worktree `probe-wt-1`, their parent registered
  as the only workspace in the throwaway `config.json`. **`git commit --allow-empty` does not move them**:
  line 2 read `recounts: {}`, no emit and no git, because an empty commit on a clean index rewrites
  neither `index` nor `HEAD` in `.git/worktrees/probe-wt-1` (the `index` mtime stayed at the `worktree
  add`), and `GitStateWatcher` reacts only to those two entries (SCRF-01). This is the app's existing
  watcher, not the probes. Rerun with a commit that stages a file (`git add change.txt`, `git commit`)
  right after line 1: line 2 read `recounts: { "probe-wt-1": 1 }`, `emits["worktree:status"]:
  { "probe-wt-1": 1 }` and one git process under `probe-wt-1`, where line 1 had `recounts: {}` and no
  emit. Both launches exited on `window.close()`; no `electron.exe` from this worktree was left
  (`Get-CimInstance Win32_Process`).

**Tests**: manual
**Gate**: build

**Commit**: `feat(diagnostics): turn the log on from PLAYGROUND_DEBUG_PERF`

---

### T12: Document how to turn it on

**What**: A "Diagnostics" section in the README, after "Development".
**Where**: `README.md`
**Depends on**: T11
**Reuses**: the README's "Development" section style
**Requirement**: PDIAG-44

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The section names `PLAYGROUND_DEBUG_PERF=1`, that it also prints the `[perf] loop` line to the console every 10 s, how to set it for one launch from a terminal, the file `perf-diagnostics.jsonl` in the user data folder, one line a minute, that worktrees appear by folder name only, and `node scripts/bench-sessions.mjs` for developers
- [x] No absolute user path in the section (the user data folder is named, not spelled out)
- [x] Gate check passes: `npm run lint` (18 warnings; the full gate, 2,557 passed, and the phase-end `npx electron-vite build` also pass)

**Tests**: none
**Gate**: full

**Commit**: `docs(readme): explain the diagnostics log`

---

### T13: The fake TUI

**What**: `scripts/bench-tui.mjs`, as design.md describes: alternate screen, Ink-style redraw of
`--rows` lines at `--fps`, every frame different, clean exit on a signal or a closed stdout.
**Where**: `scripts/bench-tui.mjs`
**Depends on**: T12
**Reuses**: nothing (Node built-ins only)
**Requirement**: PDIAG-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Manual: `node scripts/bench-tui.mjs --fps 20 --rows 30 > out.bin` for 5 s writes 100 frames (counted by the frame counter in the last frame), each frame starts with the erase-and-up sequence for 30 lines, and two consecutive frames differ; numbers written here
- [x] Manual: Ctrl+C in a terminal leaves the terminal on the main screen with the cursor shown
- [x] Gate check passes: `npm run lint`

**Results (2026-10-03; a scratch driver, not a repo file)**:

- **Rate and shape**: stdout piped to `out.bin` and the process killed 5,000 ms after its first byte, three
  runs: each holds 101 frames, the last frame's counter reads `frame 101` (frame 1 at 0 ms, frame 101 at
  5,000 ms: 100 intervals of 50 ms). The file starts with `ESC[?1049h ESC[?2004h ESC[?25l`; frame 1 starts
  with `ESC[2K\r`, and every later frame with `ESC[2K ESC[1A` 30 times then `ESC[2K\r`; every frame has 30
  lines with `ESC[38;5;<c>m`; 100 of 100 consecutive pairs differ; 3,762 bytes a frame. Each frame has its
  own deadline from the start, so the Windows timer tick (about 15.6 ms) does not slow the rate.
- **Ctrl+C**: the script run in a real ConPTY through `node-pty` (plain Node loads its prebuild), `\x03`
  typed after 2 s: the script exits 0, and the last alternate-screen sequence in the output is ConPTY's
  `ESC[?1049l` after the last `ESC[?1049h`, and the last cursor sequence is `ESC[?25h` after the last
  `ESC[?25l`. The same through `pwsh -Command & node ...` (pwsh itself exits 1 on the interrupt).
- **Closed stdout**: `node scripts/bench-tui.mjs | head -c 20000` exits 0 after 0.5 s.
- `npm run lint`: exit 0, 18 warnings.

**Tests**: manual
**Gate**: manual

**Commit**: `feat(bench): add a fake full-screen TUI for bench sessions`

---

### T14: The bench summary

**What**: `scripts/bench-summary.mjs` with `parseLines`, `phaseRows`, `rowOf`, `worstRow`,
`judgeTargets`, `DEFAULT_TARGETS` and `formatSummary`, as design.md describes.
**Where**: `scripts/bench-summary.mjs`
**Depends on**: T13
**Reuses**: the `scripts/release-version.ts` + test layout
**Requirement**: PDIAG-36, PDIAG-37, PDIAG-41, PDIAG-51

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `DEFAULT_TARGETS` is `{ loopP99Ms: 30, appendMeanMs: 0.1, statusPerSecond: 1, worktreePeak: 1 }` by literal (L-009)
- [x] Tests: `parseLines` skips blank lines and throws naming the line number of a line that is not JSON
- [x] Tests: five lines with `minutes: 3` label `startup`, `spawn`, `steady 1..3`; a sixth line is ignored
- [x] Tests: `rowOf` on a fixture with two sessions and two worktrees computes every column: `appendMeanMs` as the sum of `appendMs` over the sum of `chunks`, `ptyKBps` from `windowMs`, `worktreePeak` and `statusMaxPerSecond` as the largest over worktrees; a line with no chunk gives `appendMeanMs: 0`
- [x] Tests: `worstRow` takes each column's largest steady value and the steady totals for `appendMeanMs`, and ignores `startup` and `spawn` even when they are larger
- [x] Tests: each target gives PASS one unit under its limit and FAIL at the limit for the strict ones (`< 30`, `< 0.1`) and one unit over for the inclusive ones (`<= 1`); the loop target is `n/a` at 3 sessions; the status target is `n/a` without an index loop; the append target is `n/a` with no chunk (the `--sessions 0` case)
- [x] Tests: `formatSummary` prints the header with every option, one line per row in order, the spawn round trip line, and the four target lines
- [x] Gate check passes: `npx vitest run scripts/bench-summary.test.ts`, then the full gate
- [x] Test count: T10 count + the new tests (T11-T13 add none): 2,557 + 20 = 2,577, in 121 files

**Results (2026-10-03)**: quick gate 20 passed; full gate typecheck clean, lint exit 0 with 18 warnings,
2,577 passed. Adequacy, in `scripts/bench-summary.test.ts`: `DEFAULT_TARGETS` `:66` (`toEqual` the
literal); `parseLines` `:78` (two objects, blank lines skipped), `:83` (`toThrow(/line 3\b/)`); `phaseRows`
`:94`, `:101` (labels and order), `:106-107` (sixth line dropped); `rowOf` `:151` (all 16 columns of a
two-session, two-worktree line: append mean 10 / 400 = 0.025, 500,000 bytes over 50,000 ms = 10 KB/s,
`worktreePeak` 3, `statusMaxPerSecond` 5 ignoring `rev-parse`'s 9), `:173-178` (zeros with no chunk);
`worstRow` `:192` (startup 1,000 and spawn 500 ignored; append mean (5 + 9) / 100 = 0.14, not the largest
row mean 0.5); targets `:216-252` (29 PASS / 30 FAIL, 0.099 / 0.1, 1 PASS / 2 FAIL twice), `:257-259`
(steady rows only), `:263` (loop `n/a` at 3), `:267` (status `n/a` at index 0), `:274` (append `n/a`
with no chunk), `:285` (a recalibrated limit is used, PDIAG-42); `formatSummary` `:315-339` (header,
column heads, row order with `worst`, the steady-total append mean 4.167, the round trip line, four
target lines with value and verdict), `:345` (fixed columns), `:356-358` (`sessions=0`, `index=off`,
`spawn: no session opened`, PDIAG-51). Every test maps to a Done-when line, PDIAG-36/37/41/42/51 or
design.md's fixed columns. Spec-precision note: "the header with every option" is read as design.md's
header (`sessions fps rows files index minutes commit`); `--port`, `--json` and `--keep` change where the
run talks and writes, not what it measures, and are not printed.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(bench): summarize a diagnostics log against the targets`

---

### T15: The bench harness

**What**: `scripts/bench-sessions.mjs`, as design.md describes: the `OPTIONS` table, the build check,
the seed, the launch, the sessions, the index loop, the wait, the shutdown, the summary, the cleanup.
**Where**: `scripts/bench-sessions.mjs`
**Depends on**: T14
**Reuses**: `scripts/smoke-quit.mjs` (launch, `pageTarget`, `evaluate`, `taskkill`), `scripts/smoke-files-diff.mjs` (config seed, `rmTree`, `Ad-hoc` spawn), T13, T14
**Requirement**: PDIAG-28, PDIAG-29, PDIAG-30, PDIAG-31, PDIAG-32, PDIAG-34, PDIAG-35, PDIAG-37, PDIAG-38, PDIAG-39, PDIAG-48, PDIAG-49, PDIAG-50

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (each a named run, its result written here):

- [x] Run A, no build: with `out/` renamed away, the bench exits 2 naming `npx electron-vite build` and starts no process (PDIAG-28)
- [x] Run B, `--sessions 1 --minutes 1 --json b.json`: prints `startup`, `spawn`, `steady 1`, `worst`, the spawn round trip and four target lines; `b.json` holds options, lines, rows, worst, targets and `spawnMs`; the run takes under 4 minutes (PDIAG-31, 35..38)
- [x] Run B, observed while it runs: the app's command line carries the throwaway `--user-data-dir` and the three flags; `Get-CimInstance Win32_Process` lists no `claude` process; the session's command line is `bench-tui.mjs` (PDIAG-29, 32)
- [x] Run B, the seed: `git worktree list` in the kept seed (`--keep` on a rerun) lists `bench-wt-1`; the throwaway `config.json` holds one workspace (PDIAG-30)
- [x] Run B, cleanup: no `pg-bench-` folder in the temp dir and no `electron` process left (PDIAG-39)
- [x] Run C, `--sessions 0 --minutes 1`: completes, the `spawn` row is printed, the append target reads `n/a`
- [x] Run D, `--sessions 1 --minutes 1 --index-interval 100`: the steady row's `status/s` and `wt:status` are above 0, where Run B's are 0; skipped writes printed (PDIAG-34)
- [x] Run E, Ctrl+C during the steady minute: the app's process tree is gone within 30 s and the temp folder is removed (PDIAG-48)
- [x] PDIAG-49 and 50 read against the code (the 30 s `taskkill`, the `minutes + 3` deadline exiting 1), since neither can be provoked without a broken build
- [x] Gate check passes: `npm run lint` and `npx electron-vite build`

**Results (2026-10-03, built app at `a08c4c2` plus this task's script; scratch drivers for the
observation, the leftover check and Run E, not repo files; the owner's installed Playground was running
throughout and was never touched)**:

- **Run A**: `out/` renamed to `out.away`; `bench-sessions: no built app (out/main/index.js). Run
  \`npx electron-vite build\` first.`, exit 2; no `pg-bench-` folder created (the temp folder is made only
  after the check) and no electron process from the worktree.
- **Run B** (3 min 6 s wall): line 1 after 61 s; printed `startup`, `spawn`, `steady 1`, `worst`, `spawn:
  longest sessions:spawn round trip 90 ms` and four target lines (loop 17.2 `n/a`, append 0.049 PASS,
  status 0 `n/a`, overlap 0 PASS); steady 1: 1,310 chunks, 81.6 KB/s, `status/s` 0, `wt:status` 0.
  `b.json` holds `options, lines (3), rows, worst, targets, spawnMs`. While it ran: the app's main command
  line was `electron.exe . --user-data-dir=<temp>\pg-bench-…\user-data --remote-debugging-port=9334
  --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
  --disable-background-timer-throttling`; the session was `pwsh.exe -NoExit -Command "& "<node>"
  "<worktree>\scripts\bench-tui.mjs" --fps 20 --rows 30 --seed 1"` with its `node.exe … bench-tui.mjs`
  child; the two `claude.exe` processes on the machine were both children of the owner's own
  `playground.exe` (ancestry traced), none in the bench app's tree. Seed while running: `git worktree
  list` showed `app [main]` and `bench-wt-1 [bench/1]`; `config.json` one workspace. Afterwards no
  `pg-bench-` folder, no electron from the worktree, no `bench-tui` process.
- **Run C** (`--sessions 0 --minutes 1 --keep`): completed, exit 0; the `spawn` row printed with zeros and
  `spawn: no session opened`; append target `0.000 n/a`. The kept seed: `git worktree list` lists `app`
  and `bench-wt-1`, 500 tracked files, `config.json` holds one workspace (`bench`) after the app ran;
  `kept: <temp>\pg-bench-…` printed; deleted by hand after the check.
- **Run D** (`--sessions 1 --minutes 1 --index-interval 100`, port 9335): steady 1 `status/s` 4,
  `wt:status` 176, `recounts` 180, git 180, against Run B's 0 / 0 / 0 / 0; status target `4 FAIL`;
  `index loop: 1073 writes, 0 skipped` printed.
- **Run E**: the bench run in a real ConPTY (`node-pty`), `\x03` typed 90 s after line 1 (inside the
  steady minute): `bench-sessions: interrupted, killing the app and cleaning up`, exit 130; every process
  carrying the run's temp folder and the `bench-tui` process gone 3.9 s after the keystroke; the temp
  folder removed.
- **PDIAG-49, read**: after `window.close()` the bench races the exit against `EXIT_TIMEOUT_MS = 30_000`
  (`scripts/bench-sessions.mjs:36`, `:362`) and on `timeout` runs `taskkill /pid <pid> /T /F` (`:367`)
  before printing. **PDIAG-50, read**: the steady wait's deadline is `firstLineAt + (minutes + 3) *
  MINUTE_MS` (`:343`); short of `minutes + 2` lines, the summary of the lines it has is printed, then
  `fail(...)` exits 1 (`:389`) and the `exit` handler cleans up.
- Gate: `npm run lint` exit 0, 18 warnings; `npx electron-vite build` passes.

**Notes on the script against design.md**: the session line is `& "<node>" "<bench-tui.mjs>" ...`, with
the call operator, since `pwsh -Command` only echoes a quoted string without it (`spawn-plan.ts`). Four
harness guards design.md does not list: the bench refuses (exit 1) when its CDP port already answers, so
it can never drive another app; line 1 has a 3-minute deadline from launch; a CDP call gives up after
60 s; the header's commit carries `-dirty` when the tree has changes (a mutant run says so). The seed's
git runs with `core.autocrlf=false`, so its 500 files raise no line-ending warnings. No DSR answer is
needed: chunks flowed from the first session with nothing typed.

**Tests**: manual
**Gate**: manual

**Commit**: `feat(bench): run N fake sessions on the built app and print the figures`

---

### T16: Prove the bench can fail

**What**: Show that each figure the targets read moves under a deliberate fault, so no target can pass
by measuring nothing (memory: smoke checks that cannot fail).
**Where**: `.specs/features/perf-diagnostics/tasks.md`
**Depends on**: T15
**Reuses**: T15's runs; the mutation procedure under Gate Check Commands
**Requirement**: PDIAG-17, PDIAG-34, PDIAG-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (numbers written here):

- [x] Mutant 1: a 2 ms busy-wait at the top of `SessionRingBuffer.append`; rebuilt; `--sessions 3 --minutes 1` reads `append mean` at least 2 ms above an unmutated run of the same command, and `loop p99` above it too (the monitor sees a busy Electron main)
- [x] Mutant 2: the git-state `onSettled` in `index.ts` starts two `recountWorktree` calls at once; `--sessions 1 --minutes 1 --index-interval 100` reads `wt peak` at least 2 and `status/s` above the unmutated run's, so the overlap and rate targets can read FAIL from a real overlap
- [x] Mutant 3: a probe removed (`recountStarted` in `recountWorktree`); the index run reads `recounts` 0 while `wt:status` stays above 0
- [x] Each mutant restored from `.orig`; `git status --porcelain` equals the baseline; rebuilt
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Results (2026-10-03, at `6615d0b`; one scratch driver ran the five runs one after the other: two
unmutated references, then each mutant written over a `.orig` copy, built, benched, restored in
`finally` and built again; steady 1 figures)**:

| Run | Command | append mean / max ms | loop p99 / max ms | wt peak | status/s | wt:status | recounts | git n |
| --- | ------- | -------------------- | ----------------- | ------- | -------- | --------- | -------- | ----- |
| Reference 1 | `--sessions 3 --minutes 1` | 0.036 / 0.106 | 17.0 / 23.7 | 0 | 0 | 0 | 0 | 0 |
| Mutant 1 (2 ms busy-wait in `append`) | same | **2.054** / 3.910 | **23.5** / 30.1 | 0 | 0 | 0 | 0 | 0 |
| Reference 2 | `--sessions 1 --minutes 1 --index-interval 100` | 0.037 / 0.259 | 24.8 / 35.1 | 1 | 4 | 189 | 190 | 190 |
| Mutant 2 (two recounts per settle) | same | 0.036 / 0.200 | 24.3 / 26.1 | **2** | **8** | 187 | 376 | 374 |
| Mutant 3 (`recountStarted` removed) | same | 0.044 / 0.270 | 24.7 / 28.8 | 1 | 4 | **187** | **0** | 188 |

- **Mutant 1**: append mean 0.036 → 2.054 ms (+2.018, at least 2 ms above) and its target line FAIL;
  loop p99 17.0 → 23.5 ms (and loop max 23.7 → 30.1): `monitorEventLoopDelay` sees a busy Electron main
  (PDIAG-17, PDIAG-21).
- **Mutant 2**: `wt peak` 1 → 2 and `status/s` 4 → 8; the overlap target reads `2 FAIL` and the status
  target `8 FAIL` from a real overlap (PDIAG-34, PDIAG-41).
- **Mutant 3**: `recounts` 190 → 0 while `wt:status` stays at 187 (PDIAG-24's probe is what the column
  reads).
- After the driver: `git status --porcelain` empty, no `.orig` left, the build rebuilt from the clean tree;
  no electron from the worktree, no `bench-tui` process and no `pg-bench-` folder left. The mutant runs'
  headers read `commit=6615d0b-dirty`.
- Gate: typecheck clean, lint exit 0 with 18 warnings, 2,577 passed.
- Seen on the way, for T17: the index loop alone raises the idle loop p99 from about 17 ms to about 24-25
  ms with one session (Reference 2 against Reference 1 and Run B).

**Tests**: manual
**Gate**: manual

**Commit**: `test(bench): record that the bench figures move under injected faults`

---

### T17: Baseline and targets

**What**: Run the baseline, write it into `validation.md` under `## Baseline`, calibrate the targets,
and evaluate the stop rule in writing.
**Where**: `.specs/features/perf-diagnostics/validation.md`
**Depends on**: T16
**Reuses**: T15's harness with `--json`
**Requirement**: PDIAG-40, PDIAG-42, PDIAG-43, PDIAG-51

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**:

1. On a quiet machine (no other app build running, the owner's real app closed or left idle), at the
   commit of T16, run with default settings `--sessions 0`, `1`, `3`, `6`, then
   `--sessions 6 --index-interval 100`, each with `--json`.
2. Write `## Baseline` in `validation.md`: the machine description without names (CPU class, core count,
   RAM), the commit, each run's printed summary verbatim, and a table of the four target figures per run.
3. Calibration: if the N = 0 worst steady `loop p99` is 20 ms or more, the loop target becomes that
   value plus 10 ms (PDIAG-42); otherwise it stays 30 ms. The other three stay. Write the targets in force.
4. Stop rule: for each target, write whether the baseline already meets it at the run it names (loop at
   N = 6; append at N = 6; status and overlap at the index run). Any target owned by an open issue
   already met, or a recalibration, stops here: report to the owner, naming the fix issue it affects
   (#149 status and overlap, #151 loop p99 and the spawn row's `loop max`). The append target is
   #148's, closed by #154: write its figure as a regression guard, never a stop.

**Done when**:

- [x] Five summaries in `## Baseline`, each with its commit and options
- [x] The targets in force written, with the calibration reasoning
- [x] The stop-rule verdict written: "no target met at baseline, the fixes proceed" or "stopped, owner told: ..."
- [x] A note at the top of the section: the Verifier keeps this section and adds its report below it
- [x] Gate check passes: `npm run lint`

**Result (2026-10-03, at `dc57bf0`)**: five runs, all exit 0, 305-311 s each, in `validation.md` `##
Baseline`. N = 0 loop p99 17.3 ms, so the loop target stays 30 ms. **The stop rule fired**: #151's loop
p99 at N = 6 (17.2 ms) and its spawn-row `loop max` (31.7 ms, under 50) and #149's overlap at the index
run (`wt peak` 1) are already met; #149's status rate is not (4 per s); append 0.038 ms is the regression
guard. The fix issues wait for the owner. `npm run lint`: exit 0, 18 warnings.

**Tests**: manual
**Gate**: manual

**Commit**: `docs(specs): record the performance baseline and the targets (#147)`

---

### T18: Fix round 1 - prove the disabled path touches no port

**What**: Verifier round 1 (`90d5082`) found mutants M5/M6 surviving: `createAppDiagnostics` could start a
loop monitor or a timer before the switch check and no test would see it (PDIAG-02, Success Criterion 1).
`createAppDiagnostics` takes optional test-only `ports` (`clock`, `startLoopMonitor`); the app passes none.
Also rewords PDIAG-30, 36 and 37 to what design.md and the code already do (spec-precision gaps 2-4).
**Where**: `src/main/diagnostics.ts`, `src/main/diagnostics.test.ts`, `spec.md`
**Depends on**: T17
**Requirement**: PDIAG-02, PDIAG-17, PDIAG-30, PDIAG-36, PDIAG-37

**Done when**:

- [x] Tests: with the switch unset, `''`, `'0'` or `'true'`, `createAppDiagnostics` registers no timer and starts no monitor; with `'1'` it registers one timer of `60000` ms and starts one monitor
- [x] M5 (monitor started before the switch check) and M6 (timer started before it) each fail the new test; file restored, `git diff` shows only the fix
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: unit
**Gate**: full

**Commit**: `test(diagnostics): prove the disabled factory starts no timer and no monitor`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2 ------→ T3 ------→ T4 ------→ T5
Phase 2:  T5 ------→ T6 ------→ T7 ------→ T8 ------→ T9 ------→ T10 -----→ T11 -----→ T12
Phase 3:  T12 -----→ T13 -----→ T14 -----→ T15 -----→ T16
Phase 4:  T16 -----→ T17
```

Seventeen tasks: three batches at Execute (Phase 1, five tasks; Phase 2, seven tasks; Phases 3-4, five
tasks), so the sub-agent offer comes first. T17 is a stop point: the fix issues never start before the
owner has the baseline if the stop rule fired.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: switch and no-op | setup + 1 object + 3 small functions, 1 file | ⚠️ Cohesive (setup and skeleton are one act) |
| T2: minute line | 1 function (`createDiagnostics` flush), 1 file | ✅ Granular |
| T3: git counters | 1 probe + 2 helpers, 1 file | ⚠️ Cohesive |
| T4: other counters | 4 small probes, 1 file | ⚠️ Cohesive (same counter pattern) |
| T5: real ports | 3 adapters + 1 factory, 1 file | ⚠️ Cohesive |
| T6: git runner | 1 function | ✅ Granular |
| T7: stray spawns | 2 functions, 1 file | ⚠️ Cohesive |
| T8: async read through the runner | 1 function | ✅ Granular |
| T9: append timing | 1 call site | ✅ Granular |
| T10: name listings | 1 method | ✅ Granular |
| T11: wiring | 1 file | ✅ Granular |
| T12: README | 1 section | ✅ Granular |
| T13: fake TUI | 1 script | ✅ Granular |
| T14: summary | 1 module of pure functions | ⚠️ Cohesive |
| T15: harness | 1 script | ✅ Granular |
| T16: falsification | 3 throwaway mutants, notes | ✅ Granular |
| T17: baseline | 5 runs, notes | ✅ Granular |

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
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: switch and no-op | diagnostics module | unit | unit | ✅ OK |
| T2: minute line | diagnostics module | unit | unit | ✅ OK |
| T3: git counters | diagnostics module | unit | unit | ✅ OK |
| T4: other counters | diagnostics module | unit | unit | ✅ OK |
| T5: real ports | real ports | unit (real temp dir) | unit | ✅ OK |
| T6: git runner | probe site in a deep module | unit | unit | ✅ OK |
| T7: stray spawns | `index.ts` wiring | none (hand-verified) | none | ✅ OK |
| T8: async read through the runner | probe site in a deep module | unit | unit | ✅ OK |
| T9: append timing | probe site in a deep module | unit | unit | ✅ OK |
| T10: name listings | probe site in a deep module | unit | unit | ✅ OK |
| T11: wiring | `index.ts` wiring | none (hand-verified) | manual | ✅ OK (stronger than required) |
| T12: README | README | none | none | ✅ OK |
| T13: fake TUI | bench scripts | manual | manual | ✅ OK |
| T14: summary | bench summary | unit | unit | ✅ OK |
| T15: harness | bench scripts | manual | manual | ✅ OK |
| T16: falsification | bench scripts | manual | manual | ✅ OK |
| T17: baseline | notes | manual | manual | ✅ OK |

## Requirement Coverage

| PDIAG ID | Unit (task) | Manual (task, run) |
| -------- | ----------- | ------------------ |
| 01 | T2, T5 | T11 enabled |
| 02 | T1, T5 | T11 disabled |
| 03 | T2, T5 | — |
| 04 | T2 | T11 enabled |
| 05 | T3, T4 | — |
| 06 | T2, T3 | — |
| 07 | T2 | — |
| 08 | T2 | T11 enabled (exit) |
| 09 | T6 | — |
| 10 | T3 | — |
| 11 | T3 | — |
| 12 | T3 | — |
| 13 | T3 | T15 run D |
| 14 | T8 | T7 (read), T8 (read), T15 runs on the rewired build |
| 15 | T3, T6 | — |
| 16 | T3 | — |
| 17 | — | T5 (read), T16 mutant 1 |
| 18 | T2 | — |
| 19 | T2 | — |
| 20 | T4, T9 | — |
| 21 | T4, T9 | T16 mutant 1 |
| 22 | T1, T9 | — |
| 23 | T4 | — |
| 24 | T4 | T11 probes, T16 mutant 3 |
| 25 | T4 | T11 probes, T15 run D |
| 26 | T4 | — (wiring read in T11; #150's bench opens the Files view) |
| 27 | T4, T10 | — |
| 28 | — | T15 run A |
| 29 | — | T15 run B |
| 30 | — | T15 run B (seed) |
| 31 | — | T15 run B |
| 32 | — | T15 run B |
| 33 | — | T13 |
| 34 | — | T15 run D, T16 mutant 2 |
| 35 | — | T15 run B |
| 36 | T14 | T15 run B |
| 37 | T14 | T15 run B |
| 38 | — | T15 run B |
| 39 | — | T15 run B (cleanup) |
| 40 | — | T17 |
| 41 | T14 | T16 |
| 42 | — | T17 |
| 43 | — | T17 |
| 44 | — | T12 |
| 45 | T3 | — |
| 46 | T4 | — |
| 47 | T3 | — |
| 48 | — | T15 run E |
| 49 | — | T15 (read) |
| 50 | — | T15 (read) |
| 51 | T14 | T15 run C, T17 |
