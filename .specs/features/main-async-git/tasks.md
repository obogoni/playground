# Main Async Git Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/main-async-git/design.md`. In one line: `TimeTracker` opens a period with the
fields of a failed read and applies the read's result, through `git()`, to that same period only (matched by
period id); `SessionNamePoller` keeps a miss count and a due time per session and starts a listing only for
an eligible session.
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01).

**Branch**: `feature/main-async-git`, stacked on `feature/perf-diagnostics` (#147). **Executes only after
#147 has shipped on its branch**: T1 needs #147's diagnostics module, bench and `## Baseline`. The future PR
body carries `Closes #151` and "depends on" #147's PR.

**Stop rule (T1)**: T1 records the baseline and evaluates it in writing. The listing half is read from the
code: today a session the listing does not name gets a listing after every hook event
(`session-manager.ts` nudge, `session-name-poller.ts` debounce). IF no baseline run shows a `spawn`-row
`loop max` over 50 ms THEN T1 tells the owner and continues; IF the listing path is also not back to back
THEN **stop after T1** and report before any production change (MAGIT-30).

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute, after T1's setup;
record the test count, the suite's wall time and the lint warning count.

**Running the app**: every launch is the BUILT app (`npx electron-vite build` first) through
`scripts/bench-sessions.mjs`, which uses a throwaway `--user-data-dir` and the three anti-throttling flags.
No registry agent is ever started: the bench's sessions are `Ad-hoc` raw commands. Confirm no `electron`
process is left after every run.

**#147 names**: the probe names (`gitStarted`, `nameListingStarted`), the bench flags and the summary
columns come from #147's design. If #147 shipped them under other names, follow the shipped code and write
the rename in the task's result.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (deep main modules unit-tested with hand-rolled injected fakes, no `vi.mock`; real temp dirs for filesystem and git; `index.ts` wiring hand-verified), `vitest.config.ts` (`src/**/*.test.ts`, `scripts/**/*.test.ts`, 30 s timeouts), `package.json` scripts; style sampled from `src/main/time-tracker.test.ts`, `src/main/time-snapshot.test.ts`, `src/main/session-name-poller.test.ts`, `src/main/git.test.ts`, `.specs/features/perf-diagnostics/tasks.md`; confirmed lessons L-001, L-005, L-009 and candidates L-017, L-019, L-020, L-033, L-036, L-042, L-054, L-090 applied.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Time tracker (`time-tracker.ts`: provisional open, settle) | unit | All branches; 1:1 to MAGIT-01..03, 06, 08..16 and edge cases 38, 40..42; a deferred fake read the test settles or rejects; the sidecar write asserted after every transition (L-036); one test per trigger and per way a period ends (L-054); every existing assertion unchanged | `src/main/time-tracker.test.ts` | `npx vitest run src/main/time-tracker.test.ts` |
| Snapshot read (`time-snapshot.ts` `readGit`) | unit (recording runner; real git in a temp dir) | MAGIT-04, 05, 07, 15, 39: the call's args and `timeoutMs` asserted on the recorded call (L-020); constants pinned by literals (L-009); diagnostics counted through the runner | `src/main/time-snapshot.test.ts` | `npx vitest run src/main/time-snapshot.test.ts` |
| Name poller (`session-name-poller.ts`) | unit (fake timers) | All branches; 1:1 to MAGIT-17..28 and edge cases 43..46; every boundary at due − 1 ms and at due (L-042); every reset driven from a non-zero miss count (L-017); constants pinned by literals (L-009, L-019); every existing assertion unchanged | `src/main/session-name-poller.test.ts` | `npx vitest run src/main/session-name-poller.test.ts` |
| `index.ts` wiring (`resolveSnapshot`) | none (hand-verified) | Read against the design; observed end to end by T6's kept run | — | `npm run typecheck` |
| Bench runs and mutants | manual | Each figure written down per run; each target shown able to fail (T7) | `.specs/features/main-async-git/validation.md` | `node scripts/bench-sessions.mjs ...` |
| Specs and `STATE.md` | none | — | — | `npm run lint` |

**Evidence split** (L-021, L-025): MAGIT-29..35 are written records of named bench runs (T1, T6, T7);
MAGIT-36 and 37 are a grep (T8). Every other ID has a unit test named in its task.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | A task whose only tests are unit tests | `npx vitest run <the task's test file>` |
| Full | Every code task, after its quick gate | `npm run typecheck && npm run lint && npm test` |
| Build | T6, T7 and every phase end | `npx electron-vite build` |
| Manual | T1, T6, T7 | `npx electron-vite build`, then the bench runs the task names |

**Lint is judged by exit code AND by warning count**: record the count at T1 and diff it at every gate.

**Mutating for a falsification** (T7): through a script that copies the file to `.orig`, writes the mutant,
and restores in `finally`; rebuild before the run; `git status --porcelain` must match the baseline after.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Baseline

```
T1
```

### Phase 2: The period's git read

```
T1 → T2 → T3
```

### Phase 3: The listing backoff

```
T3 → T4 → T5
```

### Phase 4: Measure and record

```
T5 → T6 → T7 → T8
```

---

## Task Breakdown

### T1: Setup, baseline and the stop rule

**What**: Prepare the worktree, record the test baseline and the before figures, and evaluate the stop
rule in writing.
**Where**: `.specs/features/main-async-git/validation.md`
**Depends on**: None
**Reuses**: #147's bench and its `## Baseline` (`.specs/features/perf-diagnostics/validation.md`)
**Requirement**: MAGIT-29, MAGIT-30, MAGIT-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**:

1. Confirm #147 shipped on `feature/perf-diagnostics` and this branch contains it (`git log`); if not, stop
   and tell the owner.
2. Setup: `npm ci --ignore-scripts`, then `node node_modules/electron/install.js`.
3. Test baseline: `npx vitest run` (test count, files, wall time) and `npm run lint` (warning count).
4. Copy #147's `--sessions 6` summary (its `spawn` row and round-trip line) into `## Measurements`, with
   #147's commit.
5. `npx electron-vite build`, then three runs of `node scripts/bench-sessions.mjs --sessions 6 --minutes 1
   --json <scratch>/before-<n>.json` on a quiet machine; per run write the `spawn` row's `loop p99/max`,
   `git n`, `sync`, and the longest `sessions:spawn` round trip, with the commit.
6. The listing half: cite the lines that make a never-named session list back to back today
   (`session-manager.ts` `handleHookEvent` nudge, `session-name-poller.ts` `nudge` and `#schedule`).
7. Write the verdict (MAGIT-30): "stall present, fixes proceed"; or "no spawn stall over 50 ms in the bench,
   owner told, backoff and async read proceed"; or "stopped, owner told: ...".

**Done when**:

- [ ] Test count, file count, suite wall time and lint warning count recorded here
- [ ] `## Measurements` in `validation.md` holds #147's row and three before rows with their commit (MAGIT-29, MAGIT-35)
- [ ] The listing half cited with file:line and the stop-rule verdict written (MAGIT-30)
- [ ] A note at the top of `validation.md`: the Verifier keeps `## Measurements` and adds its report below
- [ ] Gate check passes: `npm run lint`

**Tests**: manual
**Gate**: manual

**Commit**: `docs(specs): record the main async git baseline (#151)`

---

### T2: The tracker opens a period without waiting for git

**What**: `resolveSnapshot` returns a promise; `#open` builds the provisional period and starts the read;
`#settled` applies a read to its own open period only, rewrites the sidecar and pushes once when the fields
changed, and drops everything else. `index.ts` wraps today's synchronous read in `Promise.resolve(...)` so
the typecheck stays green until T3.
**Where**: `src/main/time-tracker.ts`
**Depends on**: T1
**Reuses**: `withSessionTask` (`period-task.ts`), `NO_SNAPSHOT` (`time-snapshot.ts`, now exported), `#changed`
**Requirement**: MAGIT-01, MAGIT-02, MAGIT-03, MAGIT-06, MAGIT-08, MAGIT-09, MAGIT-10, MAGIT-11, MAGIT-12, MAGIT-13, MAGIT-14, MAGIT-15, MAGIT-16, MAGIT-38, MAGIT-39, MAGIT-40, MAGIT-41, MAGIT-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**:

1. Harness first: the default fake `resolveSnapshot` returns `Promise.resolve(snapshot)`; add
   `flush()` (`await new Promise((r) => setImmediate(r))`) and a deferred mode that records each read as
   `{ cwd, resolve, reject }`.
2. Existing tests: make a test `async` and add `await t.flush()` after an open wherever the test then reads
   snapshot fields or closes the period. Where a test counts writes or pushes right after an action, keep the
   count synchronous, before any flush. No `expect` line changes.
3. The production change as design.md describes; `index.ts:512` becomes
   `resolveSnapshot: (cwd) => Promise.resolve(buildSnapshot({ ... }))`.

**Done when**:

- [ ] `git diff` of `time-tracker.test.ts` shows no removed or edited `expect` line in the existing tests; written here with the count of tests made `async`
- [ ] Tests (deferred read): `started` returns with the period in `snapshot().open`, the last sidecar write holding it and one push, while the read is unsettled (MAGIT-01)
- [ ] Tests (`it.each`, L-054): spawn, duplicate (a second id), respawn (same id), `resume`, `taskChanged` and `resumeFromSuspend` each start exactly one read for the run's cwd, recorded before the method returns (MAGIT-02)
- [ ] Tests: the provisional fields by literal: no link → five nulls and no `taskByHand` key; a link to Task #67890 "Widget export" → `taskId: 67890`, `taskTitle: 'Widget export'`, `taskByHand: true`, null repository and branch (MAGIT-03)
- [ ] Tests: `resumeFromSuspend` with six running sessions starts six reads and returns with six provisional periods, none settled (MAGIT-06)
- [ ] Tests: settling with `SNAPSHOT` puts its five fields on the open period and keeps `id`, `sessionId`, `agent`, `cwd`, `start` (MAGIT-08); exactly one more sidecar write, holding the patched period, and one more push (MAGIT-09, L-036)
- [ ] Tests: a link to Task #12345 on a branch that names #12345 carries `taskByHand: true` before the read and no `taskByHand` key after it (MAGIT-10, L-090)
- [ ] Tests: a heartbeat 60 s after the open, then the read settling, leaves `lastSeen` at the heartbeat's instant (MAGIT-11)
- [ ] Tests (`it.each`): after `ended`, `pause`, `suspend`, `taskChanged`, a respawning `started` and `closeAll`, settling the first read leaves `periods`, `appended`, `rewrites`, `openWrites` and the push count exactly as they were (MAGIT-12, MAGIT-42)
- [ ] Tests: after `taskChanged`, the second read settles first with branch A and the first read then with branch B; the open period keeps A (MAGIT-13, MAGIT-41)
- [ ] Tests: a period ended 10 min after its open, before its read settles, is appended with the provisional fields (MAGIT-14)
- [ ] Tests (`it.each`): a read that rejects, one that throws synchronously, and one that resolves `NO_SNAPSHOT` leave the provisional fields, and add no sidecar write and no push (MAGIT-15, MAGIT-39)
- [ ] Tests: every sidecar write's periods and every appended period have exactly today's keys (sorted key list by literal; `taskByHand` only where the link differs from the branch's task) (MAGIT-16)
- [ ] Tests: a period ended 500 ms after its open is discarded, and its read settling later changes nothing (MAGIT-38)
- [ ] Tests: two sessions on one cwd start two reads; each settles with its own branch, and each lands on its own period (MAGIT-40)
- [ ] Gate check passes: `npx vitest run src/main/time-tracker.test.ts`, then the full gate
- [ ] Test count: T1 baseline + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): open a period without waiting for its git read`

---

### T3: The snapshot read goes through the git runner

**What**: `readGit` becomes `async`, calls `git(cwd, [...SNAPSHOT_GIT_ARGS], { timeoutMs: 2000 })`, and
resolves nulls on any failure; `execFileSync` leaves the file; `index.ts` awaits it.
**Where**: `src/main/time-snapshot.ts`
**Depends on**: T2
**Reuses**: `git()` (`src/main/git.ts`); #147's recording diagnostics fake and its temp-repo test
**Requirement**: MAGIT-04, MAGIT-05, MAGIT-07, MAGIT-15, MAGIT-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: `SNAPSHOT_GIT_ARGS` equals `['rev-parse', '--path-format=absolute', '--git-common-dir', '--abbrev-ref', 'HEAD']` and `SNAPSHOT_GIT_TIMEOUT_MS` is `2000`, by literal (L-009)
- [ ] Tests (recording runner): one call with the cwd, those args and `{ timeoutMs: 2000 }` (MAGIT-04, L-020)
- [ ] Tests: stdout `C:/acme/app/.git\nmain\n` and its CRLF form give the pair; one line, an empty first line, or an empty second line give nulls; a rejecting runner gives nulls and `readGit` resolves (MAGIT-15)
- [ ] Tests (real git, temp dirs): a folder outside git gives nulls (MAGIT-39); #147's temp-repository case still gives its common dir and branch
- [ ] Tests (#147's recording diagnostics fake): `readGit` in a temp folder outside git reports one start whose args begin with `rev-parse` and whose options carry no `sync: true`, and one end; this replaces #147 T8's `{ sync: true }` test, whose call no longer exists, and the replacement is written here (MAGIT-07)
- [ ] `grep -nE "execFileSync|spawnSync|execSync" src/main/time-snapshot.ts` finds nothing (MAGIT-05)
- [ ] `index.ts`: `resolveSnapshot: async (cwd) => buildSnapshot({ cwd, ...(await readGit(cwd)), ... })`
- [ ] Gate check passes: `npx vitest run src/main/time-snapshot.test.ts`, then the full gate; suite wall time compared with T1's (L-005)
- [ ] Test count: T2 count + the new tests − the replaced one

**Tests**: unit
**Gate**: quick

**Commit**: `perf(time): read a period's git fields through the async git runner`

---

### T4: The poller counts misses and gates the debounced listing

**What**: The three backoff constants; per-session `{ claudeId, named, misses, dueAt }`; the miss and reset
rules on success, failure, `watch` and `unwatch`; `#asked` in place of `#pendingRerun` for watches and
nudges; the eligibility check when the debounced listing would start.
**Where**: `src/main/session-name-poller.ts`
**Depends on**: T3
**Reuses**: `makePoller`, `makeFakeSpawn`, `watchedAndListed`, fake timers (`session-name-poller.test.ts`)
**Requirement**: MAGIT-17, MAGIT-18, MAGIT-19, MAGIT-20, MAGIT-21, MAGIT-22, MAGIT-23, MAGIT-27, MAGIT-43, MAGIT-44, MAGIT-45

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: `NAME_BACKOFF_BASE_MS` is `5000`, `NAME_BACKOFF_FACTOR` `2`, `NAME_BACKOFF_MAX_MS` `300000`, by literal (MAGIT-17, L-009, L-019)
- [ ] Tests: after the k-th listing answering `[]` (k = 1..8), a nudge whose debounce elapses 1 ms before `5 s × 2^(k−1)` (capped at 300 s) after that listing starts no call, and one whose debounce elapses exactly then starts one (MAGIT-18, MAGIT-22, MAGIT-23, MAGIT-43, L-042)
- [ ] Tests: three misses, then a listing that names the session; a nudge right after starts a call (MAGIT-19, L-017)
- [ ] Tests (`it.each`, L-054): exit 1, timeout, not a JSON array, resolver throws, spawn throws: each counts a miss for an unnamed session (a nudge before 5 s starts no call); a named session after the same failure still gets a call on a nudge (MAGIT-20)
- [ ] Tests: three misses, then `watch` with a new Claude id starts a call after the 1 s debounce; `watch` with the same Claude id keeps the misses (no call before the due time) (MAGIT-21, MAGIT-45, L-017)
- [ ] Tests: a named session whose entry disappears from a successful listing is due 5 s after it: no call at 4,999 ms, a call at 5,000 ms (MAGIT-44)
- [ ] Tests: `unwatch` of a session with three misses, then `watch` of the same app session and Claude id, starts a call after the debounce (MAGIT-27)
- [ ] Every existing poller test passes unchanged
- [ ] Gate check passes: `npx vitest run src/main/session-name-poller.test.ts`, then the full gate
- [ ] Test count: T3 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(session-name): back off the listing for a session it does not name`

---

### T5: The tick and the coalesced rerun follow the same gate

**What**: `#tickAsked` for the 30 s interval; the tick and the end-of-call rerun start a listing only when
an asking session, or for a tick any watched session, is eligible; `dispose` clears both asks.
**Where**: `src/main/session-name-poller.ts`
**Depends on**: T4
**Reuses**: T4's tests and fakes
**Requirement**: MAGIT-24, MAGIT-25, MAGIT-26, MAGIT-28, MAGIT-46

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: one unnamed session, due after the next tick: the tick starts no call; the first tick after its due time starts one (MAGIT-24)
- [ ] Tests: a named and an unnamed session: every tick for 5 minutes starts a call, 10 in all (MAGIT-24, MAGIT-26)
- [ ] Tests: a nudge from an unnamed session during a call that ends with `[]` schedules no rerun; a tick coalesced during a call with only a backing-off session watched schedules no rerun; a tick coalesced with a named session watched reruns once (MAGIT-25)
- [ ] Tests: a never-named session, a nudge right after each whole second for 10 minutes, each listing closed at once with `[]`: the spawn calls land at 1, 6, 16, 36, 76, 156 and 316 s, and nowhere else (MAGIT-28)
- [ ] Tests: `dispose` while a session backs off, then 10 minutes of ticks and nudges, starts no call (MAGIT-46)
- [ ] Every existing poller test passes unchanged
- [ ] Gate check passes: `npx vitest run src/main/session-name-poller.test.ts`, then the full gate
- [ ] Test count: T4 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(session-name): skip ticks and reruns that no session is due for`

---

### T6: Measure after the change

**What**: Three bench runs on the changed build and one kept run, written next to T1's before rows.
**Where**: `.specs/features/main-async-git/validation.md`
**Depends on**: T5
**Reuses**: T1's command and table
**Requirement**: MAGIT-07, MAGIT-16, MAGIT-31, MAGIT-32, MAGIT-33, MAGIT-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `npx electron-vite build`, then three runs of `node scripts/bench-sessions.mjs --sessions 6 --minutes 1 --json <scratch>/after-<n>.json`; per run the same figures as T1, with the commit (MAGIT-35)
- [ ] Every row of every run reads `sync` 0, and the `spawn` row's `git n` counts at least the six reads (MAGIT-07, MAGIT-31)
- [ ] Each run's `spawn`-row `loop max` is at most 50 ms; or, for a run over 50 ms with `sync` 0, the figure is written as a stall outside this feature and the owner is told (MAGIT-31, MAGIT-32)
- [ ] One more run with `--sessions 6 --minutes 1 --keep`: the kept user data folder's `time-log.jsonl` holds six lines, each `v: 1` with `repoName` `app` and `branch` `bench/<i>` of its session's worktree, and today's keys only; the lines are written here with their session ids shortened, and the kept folder is deleted afterwards (MAGIT-16, MAGIT-33)
- [ ] No `electron` process left after the runs
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: manual
**Gate**: manual

**Commit**: `docs(specs): record the main async git measurements (#151)`

---

### T7: Show the measure can fail

**What**: Two throwaway mutants on the changed build, so the after figures cannot pass by measuring
nothing.
**Where**: `.specs/features/main-async-git/validation.md`
**Depends on**: T6
**Reuses**: the mutation procedure under Gate Check Commands; T6's command
**Requirement**: MAGIT-34, MAGIT-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (numbers written here):

- [ ] Mutant A: a 150 ms busy-wait at the top of `TimeTracker.#open`; rebuilt; one `--sessions 6 --minutes 1` run reads a `spawn`-row `loop max` over 150 ms (MAGIT-34)
- [ ] Mutant B: `#open` also runs `execFileSync('git', ['--version'])` inside `diagnostics().gitStarted(cwd, ['--version'], { sync: true })` and its end; rebuilt; the same run reads `sync` at least 6 in the `spawn` row (MAGIT-34)
- [ ] Each mutant restored from `.orig`; `git status --porcelain` equals the baseline; rebuilt
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: manual
**Gate**: manual

**Commit**: `test(bench): record that the spawn stall and sync figures move under injected faults`

---

### T8: Record the decision and amend the shipped specs

**What**: Append the decision to `.specs/STATE.md` with the next free number, and name it in the
traceability rows it amends (L-033).
**Where**: `.specs/STATE.md` and the traceability rows of the time-tracking, session-name and perf-diagnostics specs
**Depends on**: T7
**Reuses**: design.md's AD-TBD text; the AD-048 amendment pattern ("In Tasks — **amended by AD-048**")
**Requirement**: MAGIT-36, MAGIT-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The decision's number is the next free one across `main`, `develop` and the open branches at this moment, and the reason is written in its row, as earlier decisions do (MAGIT-36)
- [ ] `.specs/STATE.md` holds the decision, amending AD-040 and AD-048 (MAGIT-36)
- [ ] The rows of TIME-03 and TIME-12 (`time-tracking/spec.md`), SNAME-09, SNAME-10 and SNAME-12 (`session-name/spec.md`) and PDIAG-15 (`perf-diagnostics/spec.md`, "call site retired") name the decision (MAGIT-37)
- [ ] `AD-TBD` in this feature's design.md replaced by the number; this spec's traceability statuses updated
- [ ] A grep for the number finds it in `STATE.md` and in the three specs
- [ ] Gate check passes: `npm run lint`

**Tests**: none
**Gate**: lint (`npm run lint`)

**Commit**: `docs(specs): record the async period read and listing backoff decision`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T1 ------→ T2 ------→ T3
Phase 3:  T3 ------→ T4 ------→ T5
Phase 4:  T5 ------→ T6 ------→ T7 ------→ T8
```

Eight tasks: one batch at Execute, run inline (no sub-agent offer). T1 is a stop point. The Verifier runs
after T8 and keeps `## Measurements` in `validation.md`.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: baseline | setup + 3 runs + notes | ✅ Granular |
| T2: tracker | 2 private methods + 1 dependency type, 1 file (+ a one-line wrapper in `index.ts`) | ⚠️ Cohesive (open and settle are one ordering rule; split, either half is untestable) |
| T3: snapshot read | 1 function + 2 constants, 1 file (+ one `await` in `index.ts`) | ✅ Granular |
| T4: misses and debounce gate | per-session state + 3 rules, 1 file | ⚠️ Cohesive (the state is observable only through the gate) |
| T5: tick and rerun gate | 2 call paths, 1 file | ✅ Granular |
| T6: after measurement | 4 runs, notes | ✅ Granular |
| T7: falsification | 2 throwaway mutants, notes | ✅ Granular |
| T8: decision and amendments | 1 decision row + 6 traceability cells | ⚠️ Cohesive (one decision, the rows it names) |

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

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: baseline | bench runs (notes) | manual | manual | ✅ OK |
| T2: tracker | time tracker (+ `index.ts` wiring) | unit | unit | ✅ OK |
| T3: snapshot read | snapshot read (+ `index.ts` wiring) | unit | unit | ✅ OK |
| T4: misses and debounce gate | name poller | unit | unit | ✅ OK |
| T5: tick and rerun gate | name poller | unit | unit | ✅ OK |
| T6: after measurement | bench runs (notes) | manual | manual | ✅ OK |
| T7: falsification | bench runs and mutants | manual | manual | ✅ OK |
| T8: decision and amendments | specs and `STATE.md` | none | none | ✅ OK |

## Requirement Coverage

| MAGIT ID | Unit (task) | Manual (task, run) |
| -------- | ----------- | ------------------ |
| 01 | T2 | — |
| 02 | T2 | — |
| 03 | T2 | — |
| 04 | T3 | — |
| 05 | T3 (grep) | — |
| 06 | T2 | — |
| 07 | T3 | T6 (`sync` 0, `git n`) |
| 08 | T2 | — |
| 09 | T2 | — |
| 10 | T2 | — |
| 11 | T2 | — |
| 12 | T2 | — |
| 13 | T2 | — |
| 14 | T2 | — |
| 15 | T2, T3 | — |
| 16 | T2 | T6 (kept run) |
| 17 | T4 | — |
| 18 | T4 | — |
| 19 | T4 | — |
| 20 | T4 | — |
| 21 | T4 | — |
| 22 | T4 | — |
| 23 | T4 | — |
| 24 | T5 | — |
| 25 | T5 | — |
| 26 | T5 | — |
| 27 | T4 | — |
| 28 | T5 | — |
| 29 | — | T1 |
| 30 | — | T1 |
| 31 | — | T6 |
| 32 | — | T6 |
| 33 | — | T6 (kept run) |
| 34 | — | T7 |
| 35 | — | T1, T6, T7 |
| 36 | — | T8 (grep) |
| 37 | — | T8 (grep) |
| 38 | T2 | — |
| 39 | T2, T3 | — |
| 40 | T2 | — |
| 41 | T2 | — |
| 42 | T2 | — |
| 43 | T4 | — |
| 44 | T4 | — |
| 45 | T4 | — |
| 46 | T5 | — |
