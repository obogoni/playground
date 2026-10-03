# Git Recount Coalescing Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/git-recount-coalesce/design.md`. In one line: `src/main/recount-scheduler.ts`
keeps one lane per worktree (250 ms quiet period, 1,000 ms maximum wait, starts at least 1,000 ms
apart, one recount at a time, one trailing run) and every `git status` main runs to count a worktree
goes through it: git-state events, turn ends and the tree build. The Files Commits list follows
`tree:get` results instead of tree identity.
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01). **Reconciled 2026-10-03**
with upstream PR #154 and #147 (PR #162), owner's answers the same day: see spec.md `## Dependencies`.
The 18 tasks of the first plan became the 11 below; the dropped work is listed there.

**Branch**: `feature/git-recount-coalesce`, stacked on `feature/perf-diagnostics` (#147, PR #162, tip
`f3d68ca`, open). The PR body carries `Closes #149` and "depends on #162". Once #162 merges, the branch
is rebased onto `origin/main`.

**Stop rule**: T1 stops the feature when #147's baseline already meets the target (RCNT-35).

**Test baseline**: measured in T1, after `npm ci --ignore-scripts` and `node node_modules/electron/install.js`.

**Running the app**: the bench runs the BUILT app (`npx electron-vite build` first). The smoke runs the
dev app: `npm run dev -- -- --user-data-dir=<a throwaway dir> --remote-debugging-port=9222
--disable-renderer-backgrounding --disable-backgrounding-occluded-windows
--disable-background-timer-throttling`. `npm run dev` does not restart main on a `src/main` change:
relaunch it for every main-process mutant and confirm the mutant is live before reading a result. No
registry agent is ever started.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (deep main modules and pure helpers unit-tested with hand-rolled injected fakes, no `vi.mock`; `index.ts` wiring and renderer hooks/components hand-verified through CDP smokes; scripts by hand), `vitest.config.ts` (`src/**/*.test.ts`, `scripts/**/*.test.ts`, 30 s timeouts), `package.json` scripts; style sampled from `src/main/git-state-watcher.test.ts`, `src/main/file-watcher.test.ts`, `src/main/tree.test.ts`, `src/main/worktree-manager.test.ts`, `src/main/spawn-pacer.test.ts`; confirmed lessons L-001, L-005, L-009 and candidates L-019, L-021, L-025, L-031, L-042, L-061, L-066, L-086, L-088 applied.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Recount scheduler (`recount-scheduler.ts`) | unit (fake `now`, fake `Scheduler` that advances time, a counting runner with deferred results) | All branches; 1:1 to RCNT-02..15 and edges 37, 38, 41; every constant pinned by a literal and never overridden (L-009, L-019); every interval boundary tested at the exact instant (L-042, L-066) | `src/main/recount-scheduler.test.ts` | `npx vitest run src/main/recount-scheduler.test.ts` |
| Git-state watcher (`git-state-watcher.ts`) | unit (fakes) | RCNT-01 and the `onDropped` half of RCNT-11; SCRF-01, 04, 05 kept | `src/main/git-state-watcher.test.ts` | `npx vitest run src/main/git-state-watcher.test.ts` |
| Worktree listing and tree build (`worktree-manager.ts`, `tree.ts`) | unit (real git in temp dirs) | RCNT-17: the injected counter is asked once per worktree, its answer lands, `null` reads as clean; existing tests pass unedited (L-005: record the suite time) | `src/main/worktree-manager.test.ts`, `src/main/tree.test.ts` | `npx vitest run <file>` |
| `index.ts` wiring | none (hand-verified) | Read against design.md "Main wiring"; observed through the smoke (T10) and the bench (T11) | — | `npm run typecheck` + build |
| `App` (Files Commits trigger) | none (CDP smoke) | RCNT-26 observed with `smoke-files-commits.mjs` check 20 | — | build + smoke |
| End to end | manual CDP smoke | RCNT-27, RCNT-30; the main mutant seen failing (L-031, L-086) | `scripts/smoke-status-bar.mjs` | `node scripts/smoke-status-bar.mjs` |
| Bench | manual | RCNT-32, after, on the machine of #147's baseline | `scripts/bench-sessions.mjs` | `node scripts/bench-sessions.mjs ...` |
| Spec notes, `STATE.md` | none | — | — | build gate only |

**Evidence split** (L-021, L-025): RCNT-27 and RCNT-30 are smoke checks written down in T10; RCNT-32
and RCNT-35 are bench figures written down in T11 and T1. Every other kept ID has a unit test named in
its task. RCNT-12, 13 and 17 have a wiring half in `index.ts`, read in T7 and T8.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | A task whose only tests are unit tests | `npx vitest run <the task's test file>` |
| Full | Every code task, after its quick gate | `npm run typecheck && npm run lint && npm test` |
| Build | T7, T8 and every phase end | `npx electron-vite build` |
| Manual | T1, T9, T10, T11 | the run the task names |

**Lint is judged by exit code AND by warning count**: record the count at T1 and diff it at every gate.

**Mutating for a falsification** (T10): through a script that copies the file to `.orig`, writes the
mutant, asserts the mutant text is present, and restores in `finally`; `git status --porcelain` must
match the pre-mutation baseline afterwards.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Baseline

```
T1
```

### Phase 2: The scheduler in main

```
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
```

### Phase 3: Files list, smoke and figures

```
T8 → T9 → T10 → T11
```

---

## Task Breakdown

### T1: Setup, baseline and the stop rule

**What**: Rebase onto the executed #147, prepare the worktree, record the test baseline, and judge
#147's baseline against this feature's target in writing.
**Where**: `.specs/features/git-recount-coalesce/tasks.md`
**Depends on**: None
**Reuses**: `.specs/features/perf-diagnostics/validation.md` `## Baseline`
**Requirement**: RCNT-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The branch sits on the executed #147; `git log --oneline -3` written here
- [x] Baseline test count, file count, suite wall time and lint warning count recorded here
- [x] #147's figures for the index run written here, with the commit they ran on
- [x] Verdict written: "target not met at baseline, the feature proceeds", or "stopped, owner told: ..." when every steady row already reads `maxPerSecond.status` at most 1 for every worktree (RCNT-35)

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the recount baseline and the stop-rule verdict (#149)`

**Record (2026-10-03)**: ✅ Done.

- Rebased with `git rebase --onto f3d68ca d4a3da9` (the #147 plan commit this branch sat on became
  `f3d68ca`'s history when #147 executed), no conflict. `git log --oneline -3` before the
  reconciliation commit: `f9b78b5 docs(specs): mark git-recount-coalesce as waiting on #147 (#149)`,
  `2939744 docs(specs): record the owner's answers on the git-recount-coalesce plan (#149)`,
  `47ab4b1 docs(specs): plan coalesced git recounts per worktree (#149)`, on `f3d68ca docs(specs):
  renumber the diagnostics decision to AD-057` (PR #162's tip).
- Setup: `npm ci --ignore-scripts`, `node node_modules/electron/install.js`, both exit 0.
- Baseline: `npx vitest run` **121 files, 2,578 tests, all pass, 94.74 s** (97 s wall);
  `npm run lint` exit 0 with **18 warnings, 0 errors**; `npm run typecheck` exit 0.
- #147's index run (`.specs/features/perf-diagnostics/validation.md` `## Baseline`, commit `dc57bf0`,
  `--sessions 6 --index-interval 100`, 3 steady minutes): per steady row, the largest `status/s` over
  worktrees and `wt peak`:

  | Row | `git n` | `status/s` (max per worktree) | `wt peak` | `wt:status` emits |
  | --- | ------- | ----------------------------- | --------- | ----------------- |
  | steady 1 | 179 | 4 | 1 | 178 |
  | steady 2 | 179 | 4 | 1 | 177 |
  | steady 3 | 179 | 4 | 1 | 178 |

  Targets block: `git status <= 1 per worktree per s` **4, FAIL**; `no overlapping git on one
  worktree` **1, PASS**. #147's stop rule held back the overlap half of #149, not the status rate.
- **Verdict (RCNT-35): target not met at baseline, the feature proceeds.**
- Plan reconciled the same day with #154 and #147 (spec.md `## Dependencies`): 18 tasks became 11.

---

### T2: The scheduler's timing

**What**: `RecountScheduler` with the three constants, `notify`, the due-time rule (quiet period,
maximum wait, spacing), the re-arm on fire, per-worktree lanes, `onRecounted` for a run that served an
event, and `stop` for waiting recounts.
**Where**: `src/main/recount-scheduler.ts`
**Depends on**: T1
**Reuses**: `Scheduler` (`src/main/file-watcher.ts`); the fake scheduler style of `git-state-watcher.test.ts`
**Requirement**: RCNT-02, RCNT-03, RCNT-04, RCNT-07, RCNT-08, RCNT-09, RCNT-12, RCNT-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (fake `now`; a fake `Scheduler` with `advance(ms)` that fires due timers in time order; a runner that counts calls and answers `{ dirty: true, changes: 1 }`): `RECOUNT_QUIET_MS` is `250`, `RECOUNT_MAX_WAIT_MS` `1000`, `RECOUNT_MIN_INTERVAL_MS` `1000`, each by literal
- [x] Tests: one event at 0 starts no run at 249 ms and one run at 250 ms
- [x] Tests: events at 0, 100 and 200 ms start one run, at 450 ms (quiet after the last)
- [x] Tests: events every 100 ms from 0 to 900 ms start no run before 1,000 ms and one at 1,000 ms (maximum wait from the first, ahead of the 1,150 ms quiet time)
- [x] Tests: a run at 250 ms, then an event at 300 ms: the next run starts at exactly 1,250 ms, not at 550 ms and not at 1,249 (RCNT-04, RCNT-37)
- [x] Tests: events on A every 100 ms and one event on B at 50 ms: B runs at 300 ms, A at 1,000 ms, and B's run moves nothing of A's (RCNT-08)
- [x] Tests: a run set off by events calls `onRecounted` once with the path and the runner's count
- [x] Tests: `stop` with a run waiting: advancing 2,000 ms starts nothing; an event after `stop` starts nothing; a run that was in flight at `stop` resolves and calls no `onRecounted`
- [x] Gate check passes: `npx vitest run src/main/recount-scheduler.test.ts`, then the full gate
- [x] Test count: T1 baseline + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): schedule worktree recounts after a quiet period`

**Record (2026-10-03)**: ✅ Done.

- `src/main/recount-scheduler.test.ts`, 8 tests (`RecountScheduler timing`): the three constants by
  literal; a lone event runs at 250 ms, not 249; a burst at 0/100/200 runs at 450 ms; events every
  100 ms to 900 run at 1,000 ms, not 999; a run at 250 then an event at 300 runs at 1,250 ms, not 1,249;
  B at 50 runs at 300 while A runs at 1,000; `onRecounted` once with `[A, { dirty: true, changes: 1 }]`;
  `stop` starts nothing waiting or later and emits nothing for the run in flight.
- Quick gate 8/8. Full gate: typecheck exit 0, lint exit 0 with 18 warnings (unchanged), **122 files,
  2,586 tests** (2,578 + 8), all pass.
- Mutants seen failing: no spacing (RCNT-04 test), no maximum wait (RCNT-03 and RCNT-08 tests), `due <
  now` (hangs on the due-now re-arm), `onRecounted` after `stop` (RCNT-12 test).

---

### T3: One recount per worktree at a time

**What**: Single flight, the one trailing run for events that arrived during a run, failure handling
(no count or a throw), and `forget`.
**Where**: `src/main/recount-scheduler.ts`
**Depends on**: T2
**Reuses**: T2's fakes, with a runner whose results resolve on demand
**Requirement**: RCNT-05, RCNT-06, RCNT-10, RCNT-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a run started at 0 by events (one event at -250 ms, or a first run then a long-running second one) stays in flight while events arrive every 100 ms; no second run starts while it runs (RCNT-05)
- [x] Tests: when that run resolves after its trailing run's due time has passed, exactly one more run starts at the instant it resolves, and no third run follows (RCNT-06)
- [x] Tests: a run started at 0 that resolves at 500 ms, with events at 400 and 450 ms during it: the trailing run starts at exactly 1,000 ms (spacing), not at 700 ms (quiet)
- [x] Tests: a run with no event during it is followed by no run
- [x] Tests: a runner answering `null` calls no `onRecounted`, and an event after it runs as usual; a runner that rejects behaves the same and nothing throws (RCNT-10)
- [x] Tests: `forget` with a run waiting: no run starts; `forget` during a run: the run finishes and no trailing run starts for the events that came during it (RCNT-11)
- [x] Gate check passes: `npx vitest run src/main/recount-scheduler.test.ts`, then the full gate
- [x] Test count: T2 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): run one recount per worktree at a time`

**Record (2026-10-03)**: ✅ Done.

- `src/main/recount-scheduler.test.ts` gains 8 tests (`RecountScheduler single flight`): a run started
  at 0 by an event at -250 stays alone while events arrive every 100 ms to 2,900; resolved at 3,000 it
  is followed by exactly one run at 3,000 and no third; a run resolved at 500 with events at 400 and 450
  is followed at 1,000, not 999 or 700; a run with no event during it is followed by nothing; a `null`
  answer and a rejection each report nothing and the next event runs at 1,250 and reports; `forget`
  cancels a waiting recount, and during a run lets it finish with no trailing run.
- Quick gate 16/16. Full gate: typecheck exit 0, lint exit 0 with 18 warnings, **122 files, 2,594
  tests** (2,586 + 8), all pass.
- Mutants seen failing: no single-flight guard in `notify` (RCNT-05, 06), no re-arm after a run (RCNT-06
  tests), no `catch` (the throw test), `forget` keeping the burst (the forget-during-run test).

---

### T4: Requests

**What**: `request(path)`: due at once with no quiet period, answered by the first recount that starts
after it, merged with a pending burst; `forget` keeps waiting requests; `stop` answers them `null`.
**Where**: `src/main/recount-scheduler.ts`
**Depends on**: T3
**Reuses**: T3's fakes
**Requirement**: RCNT-12, RCNT-13, RCNT-14, RCNT-15, RCNT-38, RCNT-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a request on an idle worktree starts a run at the same instant and resolves with its count (RCNT-13)
- [x] Tests: requests on five idle worktrees at 0 start five runs at 0 (no pool of its own; PERF-22's cap of 4 git processes sits below, in `git()`)
- [x] Tests: after a run started at 0 and resolved at 100 ms, a request at 200 ms starts its run at exactly 1,000 ms (RCNT-04 for requests)
- [x] Tests: a request during a run whose runner answers `changes: 1` is answered `changes: 2` by the trailing run, never `1` (RCNT-14, RCNT-38)
- [x] Tests: a request while a burst waits starts one run, which resolves the request and calls `onRecounted` once (RCNT-15)
- [x] Tests: a run that served only a request calls no `onRecounted` (RCNT-09)
- [x] Tests: `forget` with a request waiting still answers it (RCNT-41)
- [x] Tests: `stop` answers a waiting request with `null`; a request after `stop` resolves `null` and starts no run (RCNT-12)
- [x] Gate check passes: `npx vitest run src/main/recount-scheduler.test.ts`, then the full gate
- [x] Test count: T3 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): answer recount requests from the scheduler`

**Record (2026-10-03)**: ✅ Done.

- `src/main/recount-scheduler.test.ts` gains 8 tests (`RecountScheduler requests`): a request on an idle
  worktree starts at that instant and resolves `{ dirty: true, changes: 3 }`; five idle worktrees
  requested at 0 start five runs at 0; after a run at 0 resolved at 100, a request at 200 starts at
  1,000, not 999; a request during a run still in flight at 1,500 starts nothing until that run
  resolves, then the trailing run starts at 1,500 and answers `changes: 2`, not the running one's 1; a
  request with a burst waiting starts one run that answers it and reports once; a run that served only
  a request reports nothing; `forget` drops the burst but the waiting request is answered at 1,000; `stop`
  answers a waiting request `null`, and a later request `null` with no run.
- Quick gate 24/24. Full gate: typecheck exit 0, lint exit 0 with 18 warnings, **122 files, 2,602
  tests** (2,594 + 8), all pass.
- Mutants seen failing: `onRecounted` for a request-only run (RCNT-09, RCNT-41 tests); `request`
  arming during a run (the RCNT-14 test, after it was made to hold the run past the spacing: the first
  version let this mutant live); `forget` not re-arming for waiters (RCNT-41); `stop` not answering
  waiters, and `request` after `stop` (RCNT-12); a request waiting 250 ms (every request test).

---

### T5: The listing takes its counter

**What**: `listWorktrees(repoPath, countChanges = worktreeStatus)`; a `null` answer reads as clean;
`statusOf` folds into it.
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T4
**Reuses**: `worktree-manager.test.ts`'s real-git fixtures
**Requirement**: RCNT-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (real repo with one linked worktree): an injected counter is called once per worktree path, with exactly the paths `git worktree list` gives, and its `{ dirty, changes }` lands on each node
- [x] Tests: a counter answering `null` for one worktree gives that node `dirty: false, changes: 0` and leaves the other's values
- [x] Existing `listWorktrees` tests pass unedited (the default counter)
- [x] Gate check passes: `npx vitest run src/main/worktree-manager.test.ts`, then the full gate (suite wall time compared with T1's, L-005)
- [x] Test count: T4 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(worktrees): take the change counter as a parameter`

**Record (2026-10-03)**: ✅ Done.

- `listWorktrees(repoPath, countChanges = worktreeStatus)` with the exported `CountChanges` type; a
  `null` answer reads `dirty: false, changes: 0`. `statusOf` stays for `removeWorktree`'s dirty check,
  which this feature does not route through the scheduler; the listing no longer calls it.
- `src/main/worktree-manager.test.ts` gains 2 tests: a repo with one linked worktree asks the injected
  counter for exactly `[repo, sibling]` and shows `[true, 7]` / `[false, 0]`; a counter answering
  `null` for the sibling shows it `false, 0` and leaves the primary at `true, 4`. The 6 existing
  `listWorktrees` tests pass unedited on the default counter.
- Quick gate 90/90 (89 s, the file's real-git cost). Full gate: typecheck exit 0, lint exit 0 with 18
  warnings, **122 files, 2,604 tests** (2,602 + 2), all pass; suite **87.19 s** against T1's 94.74 s
  (L-005: no slowdown).

---

### T6: The tree build passes it on

**What**: `buildTree(registry, { countChanges })` hands the counter to every `listWorktrees`.
**Where**: `src/main/tree.ts`
**Depends on**: T5
**Reuses**: `tree.test.ts`'s fixture and registry
**Requirement**: RCNT-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: with two repos registered, an injected counter receives every worktree of both and nothing else, and the snapshot carries its answers
- [x] Existing `buildTree` tests pass unedited (no option given)
- [x] Gate check passes: `npx vitest run src/main/tree.test.ts`, then the full gate
- [x] Test count: T5 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(tree): pass the change counter through the tree build`

**Record (2026-10-03)**: ✅ Done.

- `buildTree(registry, { countChanges })` hands the counter to every `listWorktrees`.
- `src/main/tree.test.ts` gains 1 test: two repos (`api` with a linked worktree, `web`) ask the counter
  for exactly those three paths and the snapshot shows `[true, 3]`, `[false, 0]`, `[true, 5]`. The
  expected paths go through `realpathSync.native`, since git names a worktree by its long path and the
  fixture's temp dir can hold an 8.3 short name. The 4 existing tests pass unedited.
- Quick gate 5/5. Full gate: typecheck exit 0, lint exit 0 with 18 warnings, **122 files, 2,605
  tests** (2,604 + 1), all pass.
- Mutant seen failing: `buildTree` not passing the counter on.

---

### T7: The watcher feeds the scheduler

**What**: `GitStateWatcher` reports each `index` / `HEAD` event through `onEvent` and each dropped
worktree through `onDropped`, with no batch of its own; `index.ts` builds the scheduler, wires
`notify`, `forget`, `onRecounted` (the `worktree:status` emit and #147's `emitted` probe) and
`stop` on `will-quit`. Records the decision and SCRF-02's revision in the same commit.
**Where**: `src/main/git-state-watcher.ts` (and its construction in `src/main/index.ts`)
**Depends on**: T6
**Reuses**: the watcher's fakes; design.md "Main wiring"
**Requirement**: RCNT-01, RCNT-09, RCNT-11, RCNT-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Tests rewritten for a superseded mechanism** (owner-confirmed through issue #149; named so the
rewrite is visible): in `git-state-watcher.test.ts`, "settles an index change once, after the batch
window", "settles a HEAD change too" and "settles a burst of changes once (SCRF-02)" become "reports an
`index` event at once", "reports a `HEAD` event at once" and "reports every event of a burst" (the
coalescing they pinned is T2's); "drops a pending settle for a worktree no longer watched" becomes
"reports a dropped worktree once through `onDropped`"; "closes every watch and drops pending settles on
closeAll" becomes "closes every watch on closeAll and reports no drop". Every other test passes
unedited. Re-read the test file at T7 and name any other test that pins the batch before rewriting it.

**Done when**:

- [ ] Tests: the rewrites above, plus: an unrelated entry name reports nothing; a worktree kept across two `sync` calls is never reported dropped
- [ ] `grep -n "BATCH_MS\|schedule" src/main/git-state-watcher.ts` finds nothing
- [ ] `index.ts` read against design.md "Main wiring" for the scheduler, the watcher, the emit and the quit; written here
- [ ] `.specs/features/status-changes-refresh/spec.md`: SCRF-02 and the "Bursts" assumption row carry the note "Mechanism revised by RCNT-01..07 (AD-NNN), delivered <date> in `git-recount-coalesce` T7: the scheduler's quiet period replaces the watcher's 250 ms batch; the criterion still holds"
- [ ] `.specs/STATE.md` gains the AD from design.md. Its number is chosen right before the commit as the next free one after every AD on `origin/main`, on every open upstream PR, and on the local branches of every sibling worktree under `D:/playground-wt/` (parallel sessions take numbers; AD-057 is #147's). The note above names it
- [ ] Gate check passes: `npx vitest run src/main/git-state-watcher.test.ts`, then the full gate and `npx electron-vite build`
- [ ] Test count: T6 count + the new tests (rewrites counted as unchanged)

**Tests**: unit
**Gate**: build

**Commit**: `feat(main): feed git-state events to the recount scheduler`

---

### T8: Turn ends and the tree build go through it

**What**: In `index.ts`: `tree:get` builds with `countChanges: (p) => recounts.request(p)`, and
`worktrees:status` answers `recounts.request`.
**Where**: `src/main/index.ts`
**Depends on**: T7
**Reuses**: T4, T6
**Requirement**: RCNT-13, RCNT-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `grep -n "worktreeStatus\|recountWorktree" src/main/index.ts` shows `recountWorktree` only as the scheduler's runner and `worktreeStatus` only inside it; written here
- [ ] `git:sync-state`, `git:commits` and `git:run` unchanged (owner 2026-10-03; Out of Scope); written here
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `feat(main): route turn-end and tree recounts through the scheduler`

---

### T9: The Commits list follows rebuilds only

**What**: `App` passes `treeRevision` from `useTree` (bumped per `tree:get` result, PERF-13) to
`useFiles` instead of `tree`, and the comment there names FCMT-32's triggers as `tree:get` results.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T8
**Reuses**: `useTree`'s `treeRevision` (AD-052)
**Requirement**: RCNT-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual: `node scripts/smoke-files-commits.mjs` against the dev app: check 20 ("The not-pushed markers clear after a push from the status bar (FCMT-32)") passes (L-086); the run's other results written here
- [ ] `.specs/features/files-commits/spec.md` FCMT-32 carries the note "Trigger amended by RCNT-26 (AD-NNN): the list follows `tree:get` results; both named triggers end in one"
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: manual
**Gate**: manual

**Commit**: `perf(files): reload the commit list on tree rebuilds only`

---

### T10: Smoke: the counter stays current

**What**: Run the status bar smoke's #107 counter checks on the finished main side, and see them fail
on a main mutant.
**Where**: `.specs/features/git-recount-coalesce/tasks.md`
**Depends on**: T9
**Reuses**: `scripts/smoke-status-bar.mjs` `counterRefresh()`
**Requirement**: RCNT-27, RCNT-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (numbers written here):

- [ ] The full `node scripts/smoke-status-bar.mjs`, unmutated: `counterRefresh()`'s checks pass with their assertions unchanged (a terminal commit within 2 s, a focus, a second focus within 5 s, a turn end) (RCNT-27, RCNT-30); every other check it reaches written here, with where it stops if it stops, compared with the same script on `f3d68ca`
- [ ] Mutant M1 (main, dev app relaunched, mutant confirmed live): `onRecounted` never emits: the terminal-commit check FAILs
- [ ] Mutant M2 (main): the scheduler's runner is never called for a request (`request` resolves `null` at once): the turn-end check FAILs
- [ ] Each mutant restored from `.orig`; `git status --porcelain` equals the baseline
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `docs(specs): record the status bar smoke on coalesced recounts (#149)`

---

### T11: The figures after coalescing

**What**: Rerun #147's index run on the finished feature, write it beside #147's, and judge the target.
**Where**: `.specs/features/git-recount-coalesce/tasks.md`
**Depends on**: T10
**Reuses**: #147's run and summary format
**Requirement**: RCNT-32

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A1, `--sessions 6 --index-interval 100 --minutes 3 --json a1.json`, run on the T10 commit, built, the machine of #147's baseline; summary written verbatim with its commit
- [ ] The summary's targets block reads `git status <= 1 per worktree per s` PASS and `no overlapping git on one worktree` PASS (RCNT-32); every steady row's `status/s` and `wt peak` written beside #147's
- [ ] The startup row of A1 and of #147's run side by side, with a note on what it includes (the tree build's recounts now go through the scheduler)
- [ ] Any FAIL: stop, write it here, and turn it into a fix task before the Verifier runs

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the recount figures after coalescing (#149)`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1
Phase 2:  T1 ------→ T2 ------→ T3 ------→ T4 ------→ T5 ------→ T6 ------→ T7 ------→ T8
Phase 3:  T8 ------→ T9 ------→ T10 -----→ T11
```

Eleven tasks. T1 runs in the orchestrator; then two batches: Phase 2 (seven tasks) and Phase 3 (three
tasks). T1 is a stop point.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: setup and stop rule | setup + one written verdict | ⚠️ Cohesive (setup and baseline are one act) |
| T2: timing | 1 method + the due rule, 1 file | ⚠️ Cohesive |
| T3: single flight | 1 rule + failure + `forget`, 1 file | ⚠️ Cohesive |
| T4: requests | 1 method, 1 file | ✅ Granular |
| T5: listing counter | 1 function | ✅ Granular |
| T6: tree build | 1 function | ✅ Granular |
| T7: watcher feeds | 1 class change + its construction, and the decision notes | ⚠️ Cohesive (the construction must change with the class, or typecheck breaks; L-001) |
| T8: routing | 1 file | ✅ Granular |
| T9: Commits list | 1 prop | ✅ Granular |
| T10: smoke | 1 run + 2 mutants | ✅ Granular |
| T11: figures after | 1 run, notes | ✅ Granular |

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

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: setup and stop rule | notes | none | none | ✅ OK |
| T2: timing | recount scheduler | unit | unit | ✅ OK |
| T3: single flight | recount scheduler | unit | unit | ✅ OK |
| T4: requests | recount scheduler | unit | unit | ✅ OK |
| T5: listing counter | worktree listing | unit | unit | ✅ OK |
| T6: tree build | tree build | unit | unit | ✅ OK |
| T7: watcher feeds | git-state watcher + `index.ts` wiring | unit (highest) | unit | ✅ OK |
| T8: routing | `index.ts` wiring | none | none | ✅ OK |
| T9: Commits list | `App` (component) | none | manual | ✅ OK (stronger than required) |
| T10: smoke | end to end | manual | manual | ✅ OK |
| T11: figures after | notes | none | none | ✅ OK |

## Requirement Coverage

| RCNT ID | Unit (task) | Manual (task, run or check) |
| ------- | ----------- | --------------------------- |
| 01 | T7 | T10 (M1 path) |
| 02 | T2 | — |
| 03 | T2 | T11 A1 |
| 04 | T2, T4 | T11 A1 |
| 05 | T3 | T11 A1 |
| 06 | T3 | — |
| 07 | T2 | — |
| 08 | T2 | — |
| 09 | T2, T4 | T7 (read), T10 M1 |
| 10 | T3 | — |
| 11 | T3, T7 | — |
| 12 | T2, T4 | T7 (read) |
| 13 | T4 | T8 (read), T10 M2 |
| 14 | T4 | — |
| 15 | T4 | — |
| 17 | T5, T6 | T8 (read) |
| 26 | — | T9 (smoke check 20) |
| 27 | — | T10 (`counterRefresh`) |
| 30 | — | T10 |
| 32 | — | T11 A1 |
| 35 | — | T1 |
| 37 | T2 | — |
| 38 | T4 | — |
| 41 | T4 | — |

Dropped or already delivered (spec.md `## Dependencies`): RCNT-16, 18, 19..25, 28, 29, 31, 33, 34, 36,
39, 40.
