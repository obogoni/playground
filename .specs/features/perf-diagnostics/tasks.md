# Performance Diagnostics Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/perf-diagnostics/design.md`. In one line: `src/main/diagnostics.ts` holds
every counter and writes one JSON line a minute to `<userData>/perf-diagnostics.jsonl` when
`PLAYGROUND_DIAGNOSTICS=1`, reached through `diagnostics()` from the git runner, the synchronous
snapshot read, the PTY data path, the name poller and three lines in `index.ts`; `scripts/bench-sessions.mjs`
drives N fake TUI sessions on the built app and prints the figures against the targets.
**Status**: Draft (planned 2026-10-01), awaiting the owner's approval.

**Branch**: `feature/perf-diagnostics`, cut from `origin/main` `60ff148`. The four fix issues are
planned on branches stacked on this one. The future PR body carries `Closes #147`.

**Stop rule (T17)**: T17 records the baseline and evaluates it in writing. If any target is already met
at baseline (for example `loop.p99Ms` under 30 in every steady row with 6 sessions), or the N = 0 floor
forces a recalibration, **stop after T17** and report to the owner before the fix issue that owns that
target proceeds. The Verifier still runs on T1-T17.

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
**Reuses**: the `PLAYGROUND_FORCE_UPDATE === '1'` precedent (`src/main/index.ts:756`)
**Requirement**: PDIAG-02, PDIAG-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**:

1. Setup in the worktree: `npm ci --ignore-scripts`, then `node node_modules/electron/install.js`.
2. Baseline: `npx vitest run` (test count, files, wall time) and `npm run lint` (warning count); write
   all four here.
3. The module skeleton with the `Diagnostics` interface from design.md.

**Done when**:

- [ ] Baseline test count, file count, suite wall time and lint warning count recorded here
- [ ] Tests: `DIAGNOSTICS_ENV` is `'PLAYGROUND_DIAGNOSTICS'`, `DIAGNOSTICS_LOG_FILE` `'perf-diagnostics.jsonl'`, `FLUSH_INTERVAL_MS` `60000`, `LOOP_RESOLUTION_MS` `10`, `PER_SECOND_SPAN_MS` `1000`, each by literal (L-009)
- [ ] Tests: `diagnosticsEnabled` is true for `'1'` only; false for unset, `''`, `'0'`, `'true'`, `' 1'`
- [ ] Tests: `diagnostics()` answers `NOOP_DIAGNOSTICS` before any install; `installDiagnostics(fake)` makes it answer the fake; `installDiagnostics(null)` restores the no-op
- [ ] Tests: `NOOP_DIAGNOSTICS.enabled` is false; its `measureAppend` calls `append` exactly once and returns; its `gitStarted` and `nameListingStarted` return a function that does nothing; `stop` can be called twice; the object is frozen
- [ ] Gate check passes: `npx vitest run src/main/diagnostics.test.ts`, then the full gate
- [ ] Test count: baseline + the new tests

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

- [ ] Tests (fake clock with `now`, `wallNow`, `every` it records and fires on demand; fake monitor; recording writer): `createDiagnostics` calls `startLoopMonitor` once and `clock.every` once with `60000` when no `intervalMs` is given
- [ ] Tests: firing the timer writes one line that parses, ends in `\n`, and holds `v: 1`, `t` as the ISO string of `wallNow`, `windowMs` as the `now` difference since creation, `pid`, `version`, and all six sections with `git.sync` (empty values: zeros and `{}`)
- [ ] Tests: the monitor answering 12,000,000 / 31,500,000 / 61,234,567 ns gives `p50Ms: 12`, `p99Ms: 31.5`, `maxMs: 61.235`, `resolutionMs: 10`; the monitor's `reset` runs once per line; a monitor with `count: 0` gives zeros
- [ ] Tests: two flushes with a writer whose first promise resolves after the second is queued land in window order, and the second write starts only after the first settles
- [ ] Tests: a rejecting writer drops the line and calls `log` once for two failing flushes in a row with the file name and the error code; a success ends the streak, so the next failure logs again; nothing throws
- [ ] Tests: `stop` cancels the timer and disables the monitor; a flush is not attempted after it; a second `stop` changes nothing
- [ ] Gate check passes: `npx vitest run src/main/diagnostics.test.ts`, then the full gate
- [ ] Test count: T1 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): write one line a minute with the event-loop delay`

---

### T3: Git counters

**What**: `gitSubcommand`, `folderOf` and `gitStarted` with its end: counts by subcommand and worktree,
durations, peak concurrency overall and per worktree, `maxPerSecond`, `git.sync`, and the window rules.
**Where**: `src/main/diagnostics.ts`
**Depends on**: T2
**Reuses**: T2's flush and fakes
**Requirement**: PDIAG-05, PDIAG-06, PDIAG-10, PDIAG-11, PDIAG-12, PDIAG-13, PDIAG-15, PDIAG-16, PDIAG-45, PDIAG-47

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: `gitSubcommand` gives `status` for `['status', '--porcelain']`, `status` for `['-C', 'x', '--no-optional-locks', 'status']`, `log` for `['-c', 'core.quotepath=off', 'log']`, `(none)` for `['--version']` and for `[]`
- [ ] Tests: `folderOf` gives `bench-wt-1` for a backslashed path, a forward-slashed path and one with a trailing separator; `(none)` for `'C:\'`-style roots and `''`
- [ ] Tests: two `status` and one `rev-parse` ending after 100, 300 and 50 ms give `count: 3`, `totalMs: 450`, `maxMs: 300`, and the right per-subcommand figures
- [ ] Tests: three overlapping calls on one worktree and one on another give `peakConcurrent: 4` overall and `3` / `1` per worktree; sequential calls give `1`
- [ ] Tests: starts at 0, 400 and 900 ms give `maxPerSecond: 3`; starts at 0, 600 and 1,200 ms give `2` (sliding span, not a bucket); the exact edge, starts at 0 and 1,000 ms, gives `1` (L-042)
- [ ] Tests: a call with `{ sync: true }` counts in the totals and in `git.sync`; a call without it does not touch `git.sync`
- [ ] Tests: an end called twice counts once; a call started in window 1 and ended in window 2 is counted in window 1's `count` and timed in window 2's `totalMs`, and window 2's `peakConcurrent` starts at 1 while it runs
- [ ] Tests: no line contains the parent folders of any path passed in, nor any argument other than the subcommand (assert on the serialized line)
- [ ] Gate check passes: `npx vitest run src/main/diagnostics.test.ts`, then the full gate
- [ ] Test count: T2 count + the new tests

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

- [ ] Tests: `measureAppend('s1', 'é\n', fn)` runs `fn` once and records `chunks: 1`, `bytes: 3`; two chunks whose appends take 2 ms and 5 ms (fake `now`) give `appendMs: 7`, `appendMaxMs: 5`; a second session has its own entry
- [ ] Tests: an `append` that throws still records the chunk and its duration, and the same error object reaches the caller
- [ ] Tests: a session with chunks in window 1 and none in window 2 is in line 1 and absent from line 2
- [ ] Tests: two `recountStarted` and one `emitted('worktree:status')` for the same worktree path give `recounts: { "bench-wt-1": 2 }` and `emits["worktree:status"]: { "bench-wt-1": 1 }`; `emitted('files:changed')` lands only under `files:changed`
- [ ] Tests: two listings of 1,800 ms and 2,200 ms give `names: { count: 2, totalMs: 4000, maxMs: 2200 }`; an end called twice counts once
- [ ] Tests: the serialized line holds no session output text and no parent folder of any worktree path
- [ ] Gate check passes: `npx vitest run src/main/diagnostics.test.ts`, then the full gate
- [ ] Test count: T3 count + the new tests

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

- [ ] Tests (real temp dir): `appendWriter` creates the file on the first line and appends the second after it, both intact
- [ ] Tests: `createAppDiagnostics({ env: {}, userDataPath: tmp, version })` returns `NOOP_DIAGNOSTICS`, and after 50 ms the temp dir holds no file
- [ ] Tests: `createAppDiagnostics({ env: { PLAYGROUND_DIAGNOSTICS: '1' }, userDataPath: tmp, version: '9.9.9', intervalMs: 50 })` writes a line to `<tmp>/perf-diagnostics.jsonl` within 1 s with `version: '9.9.9'` and this process's `pid`; `stop()` is called in `finally`
- [ ] `nodeLoopMonitor` uses `monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS })` and calls `enable()` (read; its effect is observed in T16)
- [ ] Gate check passes: `npx vitest run src/main/diagnostics.test.ts`, then the full gate
- [ ] Test count: T4 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): write the log to the user data folder`

---

### T6: The git runner reports every call

**What**: `git()` calls `diagnostics().gitStarted(cwd, args)` before `run` and its end in `finally`.
**Where**: `src/main/git.ts`
**Depends on**: T5
**Reuses**: `git.test.ts`'s `rejectionOf` and its real-git cases
**Requirement**: PDIAG-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests (recording fake installed, restored in `afterEach`): a successful `git(tmpdir(), ['--version'])` reports one start with that cwd and those args, and its end before the awaited call returns
- [ ] Tests: a failing `git(tmpdir(), ['rev-parse', '--verify', 'no-such-ref'])` reports one start and one end, and still rejects with git's error
- [ ] Tests: a timed-out `git(tmpdir(), ['hash-object', '--stdin'], { timeoutMs: 200 })` reports one start and one end, and `isTimeout` is still true
- [ ] Gate check passes: `npx vitest run src/main/git.test.ts`, then the full gate (suite wall time compared with T1's, L-005)
- [ ] Test count: T5 count + the new tests

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

- [ ] `grep -n "execFileAsync('git'" src/main/index.ts` finds nothing; `execFileAsync` is still used by `readFileDropList` and the `assoc` probe
- [ ] Both calls read against the old ones: same arguments, `readBranch` keeps its 2 s timeout and its `null` on any failure, `gitFetch` keeps no timeout and still rejects on a non-zero exit; written here
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `refactor(main): run the workflow fetch and the branch read through the git runner`

---

### T8: The synchronous snapshot read is counted

**What**: `readGit` reports its `execFileSync` with `gitStarted(cwd, args, { sync: true })` and ends it
in `finally`; the call itself is unchanged.
**Where**: `src/main/time-snapshot.ts`
**Depends on**: T7
**Reuses**: `time-snapshot.test.ts`
**Requirement**: PDIAG-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests (recording fake): `readGit` in a temp folder outside git reports one start with `{ sync: true }` and subcommand args beginning `rev-parse`, ends it once, and still answers both nulls
- [ ] Tests: `readGit` in a temp repository (`git init`) reports one start and one end, and answers its git common dir and branch as before
- [ ] Gate check passes: `npx vitest run src/main/time-snapshot.test.ts`, then the full gate
- [ ] Test count: T7 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): count the time tracker's synchronous git read`

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

- [ ] Tests (recording fake): one chunk from a fake PTY reaches the fake once with the session's id and the chunk, and the session's scrollback snapshot ends with it
- [ ] Tests: with no fake installed (the no-op), a chunk lands in the scrollback once and an attached session still forwards it as `session:data`
- [ ] Gate check passes: `npx vitest run src/main/session-manager.test.ts`, then the full gate
- [ ] Test count: T8 count + the new tests

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

- [ ] Tests (recording fake): a listing that closes with code 0 reports one start and one end; one that times out reports one end; one whose child emits `error` then `close` reports one end
- [ ] Tests: a spawn that throws reports no start
- [ ] Gate check passes: `npx vitest run src/main/session-name-poller.test.ts`, then the full gate
- [ ] Test count: T9 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(diagnostics): count the session-name listings`

---

### T11: Wire the module into main

**What**: `installDiagnostics(createAppDiagnostics(...))` first thing in `whenReady`; probes in
`recountWorktree`, the git-state `onSettled` emit and the `fileWatcher` emit; `diagnostics().stop()` on
`will-quit`.
**Where**: `src/main/index.ts`
**Depends on**: T10
**Reuses**: design.md, "Probes at the call sites"
**Requirement**: PDIAG-01, PDIAG-02, PDIAG-08, PDIAG-24, PDIAG-25, PDIAG-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`
- [ ] Manual, enabled: the built app on a fresh `--user-data-dir` with `PLAYGROUND_DIAGNOSTICS=1` and the three flags; after 65 s `perf-diagnostics.jsonl` holds one line that parses with all six sections and this build's version; the window closed, the process exits within 30 s; result written here
- [ ] Manual, disabled: the same launch without the variable; after 65 s the user data folder holds no `perf-diagnostics.jsonl`; result written here
- [ ] Manual, the probes: on the enabled launch, a `git commit --allow-empty` in a registered worktree's terminal outside the app moves `recounts` and `emits["worktree:status"]` for that worktree's folder in the next line (seed with `scripts/bench-sessions.mjs`'s layout by hand, or any throwaway repo registered in the throwaway config); result written here

**Tests**: manual
**Gate**: build

**Commit**: `feat(diagnostics): turn the log on from PLAYGROUND_DIAGNOSTICS`

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

- [ ] The section names `PLAYGROUND_DIAGNOSTICS=1`, how to set it for one launch from a terminal, the file `perf-diagnostics.jsonl` in the user data folder, one line a minute, that worktrees appear by folder name only, and `node scripts/bench-sessions.mjs` for developers
- [ ] No absolute user path in the section (the user data folder is named, not spelled out)
- [ ] Gate check passes: `npm run lint`

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

- [ ] Manual: `node scripts/bench-tui.mjs --fps 20 --rows 30 > out.bin` for 5 s writes 100 frames (counted by the frame counter in the last frame), each frame starts with the erase-and-up sequence for 30 lines, and two consecutive frames differ; numbers written here
- [ ] Manual: Ctrl+C in a terminal leaves the terminal on the main screen with the cursor shown
- [ ] Gate check passes: `npm run lint`

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

- [ ] Tests: `DEFAULT_TARGETS` is `{ loopP99Ms: 30, appendMeanMs: 0.1, statusPerSecond: 1, worktreePeak: 1 }` by literal (L-009)
- [ ] Tests: `parseLines` skips blank lines and throws naming the line number of a line that is not JSON
- [ ] Tests: five lines with `minutes: 3` label `startup`, `spawn`, `steady 1..3`; a sixth line is ignored
- [ ] Tests: `rowOf` on a fixture with two sessions and two worktrees computes every column: `appendMeanMs` as the sum of `appendMs` over the sum of `chunks`, `ptyKBps` from `windowMs`, `worktreePeak` and `statusMaxPerSecond` as the largest over worktrees; a line with no chunk gives `appendMeanMs: 0`
- [ ] Tests: `worstRow` takes each column's largest steady value and the steady totals for `appendMeanMs`, and ignores `startup` and `spawn` even when they are larger
- [ ] Tests: each target gives PASS one unit under its limit and FAIL at the limit for the strict ones (`< 30`, `< 0.1`) and one unit over for the inclusive ones (`<= 1`); the loop target is `n/a` at 3 sessions; the status target is `n/a` without an index loop; the append target is `n/a` with no chunk (the `--sessions 0` case)
- [ ] Tests: `formatSummary` prints the header with every option, one line per row in order, the spawn round trip line, and the four target lines
- [ ] Gate check passes: `npx vitest run scripts/bench-summary.test.ts`, then the full gate
- [ ] Test count: T10 count + the new tests (T11-T13 add none)

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

- [ ] Run A, no build: with `out/` renamed away, the bench exits 2 naming `npx electron-vite build` and starts no process (PDIAG-28)
- [ ] Run B, `--sessions 1 --minutes 1 --json b.json`: prints `startup`, `spawn`, `steady 1`, `worst`, the spawn round trip and four target lines; `b.json` holds options, lines, rows, worst, targets and `spawnMs`; the run takes under 4 minutes (PDIAG-31, 35..38)
- [ ] Run B, observed while it runs: the app's command line carries the throwaway `--user-data-dir` and the three flags; `Get-CimInstance Win32_Process` lists no `claude` process; the session's command line is `bench-tui.mjs` (PDIAG-29, 32)
- [ ] Run B, the seed: `git worktree list` in the kept seed (`--keep` on a rerun) lists `bench-wt-1`; the throwaway `config.json` holds one workspace (PDIAG-30)
- [ ] Run B, cleanup: no `pg-bench-` folder in the temp dir and no `electron` process left (PDIAG-39)
- [ ] Run C, `--sessions 0 --minutes 1`: completes, the `spawn` row is printed, the append target reads `n/a`
- [ ] Run D, `--sessions 1 --minutes 1 --index-interval 100`: the steady row's `status/s` and `wt:status` are above 0, where Run B's are 0; skipped writes printed (PDIAG-34)
- [ ] Run E, Ctrl+C during the steady minute: the app's process tree is gone within 30 s and the temp folder is removed (PDIAG-48)
- [ ] PDIAG-49 and 50 read against the code (the 30 s `taskkill`, the `minutes + 3` deadline exiting 1), since neither can be provoked without a broken build
- [ ] Gate check passes: `npm run lint` and `npx electron-vite build`

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

- [ ] Mutant 1: a 2 ms busy-wait at the top of `SessionRingBuffer.append`; rebuilt; `--sessions 3 --minutes 1` reads `append mean` at least 2 ms above an unmutated run of the same command, and `loop p99` above it too (the monitor sees a busy Electron main)
- [ ] Mutant 2: the git-state `onSettled` in `index.ts` starts two `recountWorktree` calls at once; `--sessions 1 --minutes 1 --index-interval 100` reads `wt peak` at least 2 and `status/s` above the unmutated run's, so the overlap and rate targets can read FAIL from a real overlap
- [ ] Mutant 3: a probe removed (`recountStarted` in `recountWorktree`); the index run reads `recounts` 0 while `wt:status` stays above 0
- [ ] Each mutant restored from `.orig`; `git status --porcelain` equals the baseline; rebuilt
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

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
   N = 6; append at N = 6; status and overlap at the index run). Any target already met, or a
   recalibration, stops here: report to the owner, naming the fix issue it affects (#148 loop and
   append, #149 status and overlap, #151 the spawn row's `loop max` and `git.sync`).

**Done when**:

- [ ] Five summaries in `## Baseline`, each with its commit and options
- [ ] The targets in force written, with the calibration reasoning
- [ ] The stop-rule verdict written: "no target met at baseline, the fixes proceed" or "stopped, owner told: ..."
- [ ] A note at the top of the section: the Verifier keeps this section and adds its report below it
- [ ] Gate check passes: `npm run lint`

**Tests**: manual
**Gate**: manual

**Commit**: `docs(specs): record the performance baseline and the targets (#147)`

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
| T8: sync read | 1 function | ✅ Granular |
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
| T8: sync read | probe site in a deep module | unit | unit | ✅ OK |
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
| 14 | — | T7 (read), T15 runs on the rewired build |
| 15 | T3, T8 | — |
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
