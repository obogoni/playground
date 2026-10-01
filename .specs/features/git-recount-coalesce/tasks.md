# Git Recount Coalescing Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/git-recount-coalesce/design.md`. In one line: `src/main/recount-scheduler.ts`
keeps one lane per worktree (250 ms quiet period, 1,000 ms maximum wait, starts at least 1,000 ms
apart, one recount at a time, one trailing run, 3 at once in all) and every recount goes through it:
git-state events, turn ends and the tree build; the status bar's sync reads borrow the lane. The
renderer keeps the tree when a recount changes nothing, and the status bar re-reads on its own
worktree's `worktree:status` and on a `tree:get` result.
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01).

**Branch**: `feature/git-recount-coalesce`, stacked on `feature/perf-diagnostics` (#147, plan commit
`d4a3da9`, not executed yet). The future PR body carries `Closes #149` and "depends on #147".

**Order**: this feature executes only after #147 has executed through its T17. T1 first rebases this
branch onto the executed `feature/perf-diagnostics` (or onto `origin/main` once #147 has merged); the
branch is local and unpushed, so the rebase rewrites nothing anyone has seen.

**Stop rules**: T1 stops the feature when #147's baseline already meets the target (RCNT-35), or when
#147's own stop rule held #149 back. T3 stops it when the before-runs cannot tell before from after
(RCNT-36). Each stop reports to the owner with the figures.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute, after T1's setup;
record the test count, the file count, the suite's wall time and the lint warning count.

**Running the app**: the bench runs the BUILT app (`npx electron-vite build` first). The smoke runs the
dev app: `npm run dev -- -- --user-data-dir=<a throwaway dir> --remote-debugging-port=9222
--disable-renderer-backgrounding --disable-backgrounding-occluded-windows
--disable-background-timer-throttling`. `npm run dev` does not restart main on a `src/main` change:
relaunch it for every main-process mutant and confirm the mutant is live before reading a result. No
registry agent is ever started.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (deep main modules and pure helpers unit-tested with hand-rolled injected fakes, no `vi.mock`; `index.ts` wiring and renderer hooks/components hand-verified through CDP smokes; scripts by hand), `vitest.config.ts` (`src/**/*.test.ts`, `scripts/**/*.test.ts`, 30 s timeouts), `package.json` scripts; style sampled from `src/main/git-state-watcher.test.ts`, `src/main/file-watcher.test.ts`, `src/main/tree.test.ts`, `src/main/worktree-manager.test.ts`, `src/renderer/src/lib/tree-status.test.ts`, `src/renderer/src/lib/status-bar.test.ts`; confirmed lessons L-001, L-005, L-009 and candidates L-019, L-021, L-025, L-028, L-031, L-042, L-061, L-065, L-066, L-086, L-087, L-088 applied.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Recount scheduler (`recount-scheduler.ts`) | unit (fake `now`, fake `Scheduler` that advances time, a counting runner with deferred results) | All branches; 1:1 to RCNT-02..16, 18 and edges 37, 38, 39, 41; every constant pinned by a literal and never overridden (L-009, L-019); every interval boundary tested at the exact instant (L-042, L-066) | `src/main/recount-scheduler.test.ts` | `npx vitest run src/main/recount-scheduler.test.ts` |
| Git-state watcher (`git-state-watcher.ts`) | unit (fakes) | RCNT-01 and the `onDropped` half of RCNT-11; SCRF-01, 04, 05 kept | `src/main/git-state-watcher.test.ts` | `npx vitest run src/main/git-state-watcher.test.ts` |
| Worktree listing and tree build (`worktree-manager.ts`, `tree.ts`) | unit (real git in temp dirs) | RCNT-17: the injected counter is asked once per worktree, its answer lands, `null` reads as clean; existing tests pass unedited (L-005: record the suite time) | `src/main/worktree-manager.test.ts`, `src/main/tree.test.ts` | `npx vitest run <file>` |
| Renderer pure helpers (`tree-status.ts`, `status-bar.ts`) | unit | RCNT-19..23 and 40; each arm of an either-or rule alone (L-087); a fixture where two paths share a prefix (L-065) | co-located `*.test.ts` | `npx vitest run <file>` |
| `index.ts` wiring | none (hand-verified) | Read against design.md "Main wiring"; observed through the smoke (T17) and the bench (T18) | — | `npm run typecheck` + build |
| Hooks and components (`use-tree`, `use-git-sync`, `StatusBar`, `App`) | none (CDP smoke) | RCNT-22..30 observed in the running app | — | build + smoke |
| End to end | manual CDP smoke | RCNT-27..30; every new check seen failing on a broken build (L-031, L-061, L-088) | `scripts/smoke-status-bar.mjs` | `node scripts/smoke-status-bar.mjs` |
| Bench | manual | RCNT-31..36, before and after on the same machine | `scripts/bench-sessions.mjs` | `node scripts/bench-sessions.mjs ...` |
| Spec notes, `STATE.md` | none | — | — | build gate only |

**Evidence split** (L-021, L-025): RCNT-27..30 are numbered smoke checks written down in T17;
RCNT-31..36 are named bench runs written down in T2, T3 and T18; RCNT-23 is also read from T18's
`--select 2` run. Every other ID has a unit test named in its task. RCNT-12, 13, 17 and 18 have a
wiring half in `index.ts`, read in T10 and T11.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | A task whose only tests are unit tests | `npx vitest run <the task's test file>` |
| Full | Every code task, after its quick gate | `npm run typecheck && npm run lint && npm test` |
| Build | T10, T11, T14 and every phase end | `npx electron-vite build` |
| Manual | T1, T2, T3, T15, T17, T18 | the run the task names |

**Lint is judged by exit code AND by warning count**: record the count at T1 and diff it at every gate.

**Mutating for a falsification** (T17): through a script that copies the file to `.orig`, writes the
mutant, asserts the mutant text is present, and restores in `finally`; `git status --porcelain` must
match the pre-mutation baseline afterwards.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Baseline and the figures before

```
T1 → T2 → T3
```

### Phase 2: The scheduler in main

```
T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11
```

### Phase 3: The renderer follows the event

```
T11 → T12 → T13 → T14 → T15 → T16
```

### Phase 4: Prove

```
T16 → T17 → T18
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

**Steps**:

1. `git rebase feature/perf-diagnostics` once #147's T17 is committed there (or `git rebase origin/main`
   once #147 has merged); stop and tell the owner if #147 has not executed.
2. Setup: `npm ci --ignore-scripts`, then `node node_modules/electron/install.js`.
3. Baseline: `npx vitest run` (test count, files, wall time) and `npm run lint` (warning count).
4. From #147's `## Baseline`, the `--sessions 6 --index-interval 100` run: write per steady row the
   largest `maxPerSecond.status` and the largest `peakConcurrent` over worktrees, and #147's stop-rule
   verdict for #149.

**Done when**:

- [ ] The branch sits on the executed #147; `git log --oneline -3` written here
- [ ] Baseline test count, file count, suite wall time and lint warning count recorded here
- [ ] #147's figures for the index run written here, with the commit they ran on
- [ ] Verdict written: "target not met at baseline, the feature proceeds", or "stopped, owner told: ..." when every steady row already reads `maxPerSecond.status` at most 1 and `peakConcurrent` at most 1 for every worktree, or when #147's stop rule held #149 back (RCNT-35)

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the recount baseline and the stop-rule verdict (#149)`

---

### T2: The bench selects a worktree

**What**: `--select <i>` in `scripts/bench-sessions.mjs`: one `OPTIONS` row, validated before any seed
or launch, the Tree-direction click on `bench/<i>` before the sessions open, `select=<i>` in the header.
**Where**: `scripts/bench-sessions.mjs`
**Depends on**: T1
**Reuses**: #147's `OPTIONS` table; `selectWorktree` in `scripts/smoke-status-bar.mjs`
**Requirement**: RCNT-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (each a named run, its result written here):

- [ ] Run S1, `--sessions 2 --select 3`: exits 2 naming the range 1 to 2, before any temp folder or process exists
- [ ] Run S2, `--sessions 2 --select 0.5` and `--select x`: exit 2 the same way
- [ ] Run S3, `--sessions 2 --select 2 --minutes 1 --json s3.json`: the header reads `select=2`; while it runs, `.status-bar-branch`'s `title` read through CDP is `bench/2`; the run completes as #147's Run B does
- [ ] Run S4, `--sessions 1 --minutes 1` with no `--select`: header reads `select=0` and nothing is selected (`.status-bar-empty` present), so #147's runs stay comparable
- [ ] Gate check passes: `npm run lint` (warning count unchanged) and `npx electron-vite build`

**Tests**: manual
**Gate**: manual

**Commit**: `feat(bench): select a worktree before the sessions open`

---

### T3: The figures before coalescing

**What**: Run the three target runs on the unchanged app and write them down, with the per-worktree
`rev-list` counts read from the `--json` lines.
**Where**: `.specs/features/git-recount-coalesce/tasks.md`
**Depends on**: T2
**Reuses**: T2's bench; #147's summary format
**Requirement**: RCNT-32, RCNT-33, RCNT-34, RCNT-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**:

1. On a quiet machine, at the T2 commit, built: B1 `--sessions 6 --index-interval 100 --minutes 3
   --json b1.json`, B2 `--sessions 2 --index-interval 100 --select 1 --minutes 3 --json b2.json`, B3
   `--sessions 2 --index-interval 100 --select 2 --minutes 3 --json b3.json`.
2. Write each printed summary verbatim, then one table: per run and steady row, the largest
   `maxPerSecond.status` and `peakConcurrent` over worktrees, and for `bench-wt-1` and `bench-wt-2`
   their `rev-list` count, `status` count and `emits["worktree:status"]` (a `node -e` one-liner over the
   JSON, written here).

**Done when**:

- [ ] Three summaries written, each with its commit and options
- [ ] The per-worktree table written
- [ ] Stop-rule verdict written (RCNT-36): B3 counts `rev-list` under `bench-wt-2` in at least one steady row, and B2 fails at least one of its two limits; otherwise "stopped, owner told: ..."

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the recount figures before coalescing (#149)`

---

### T4: The scheduler's timing

**What**: `RecountScheduler` with the four constants, `notify`, the due-time rule (quiet period,
maximum wait, spacing), the re-arm on fire, per-worktree lanes, `onRecounted` for a run that served an
event, and `stop` for waiting recounts.
**Where**: `src/main/recount-scheduler.ts`
**Depends on**: T3
**Reuses**: `Scheduler` (`src/main/file-watcher.ts`); the fake scheduler style of `git-state-watcher.test.ts`
**Requirement**: RCNT-02, RCNT-03, RCNT-04, RCNT-07, RCNT-08, RCNT-09, RCNT-12, RCNT-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests (fake `now`; a fake `Scheduler` with `advance(ms)` that fires due timers in time order; a runner that counts calls and answers `{ dirty: true, changes: 1 }`): `RECOUNT_QUIET_MS` is `250`, `RECOUNT_MAX_WAIT_MS` `1000`, `RECOUNT_MIN_INTERVAL_MS` `1000`, `RECOUNT_POOL_SIZE` `3`, each by literal
- [ ] Tests: one event at 0 starts no run at 249 ms and one run at 250 ms
- [ ] Tests: events at 0, 100 and 200 ms start one run, at 450 ms (quiet after the last)
- [ ] Tests: events every 100 ms from 0 to 900 ms start no run before 1,000 ms and one at 1,000 ms (maximum wait from the first, ahead of the 1,150 ms quiet time)
- [ ] Tests: a run at 250 ms, then an event at 300 ms: the next run starts at exactly 1,250 ms, not at 550 ms and not at 1,249 (RCNT-04, RCNT-37)
- [ ] Tests: events on A every 100 ms and one event on B at 50 ms: B runs at 300 ms, A at 1,000 ms, and B's run moves nothing of A's (RCNT-08)
- [ ] Tests: a run set off by events calls `onRecounted` once with the path and the runner's count
- [ ] Tests: `stop` with a run waiting: advancing 2,000 ms starts nothing; an event after `stop` starts nothing; a run that was in flight at `stop` resolves and calls no `onRecounted`
- [ ] Gate check passes: `npx vitest run src/main/recount-scheduler.test.ts`, then the full gate
- [ ] Test count: T1 baseline + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): schedule worktree recounts after a quiet period`

---

### T5: One recount per worktree at a time

**What**: Single flight, the one trailing run for events that arrived during a run, failure handling
(no count or a throw), and `forget`.
**Where**: `src/main/recount-scheduler.ts`
**Depends on**: T4
**Reuses**: T4's fakes, with a runner whose results resolve on demand
**Requirement**: RCNT-05, RCNT-06, RCNT-10, RCNT-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: a run started at 0 by a request stays in flight while events arrive every 100 ms from 400 to 1,300 ms; no second run starts while it runs (RCNT-05)
- [ ] Tests: when that run resolves at 1,500 ms, exactly one more run starts at 1,500 ms (its due time, 1,400 ms from the first event during the run, has passed), and no third run follows (RCNT-06)
- [ ] Tests: a run started at 0 that resolves at 500 ms, with events at 400 and 450 ms during it: the trailing run starts at exactly 1,000 ms (spacing), not at 700 ms (quiet)
- [ ] Tests: a run with no event during it is followed by no run
- [ ] Tests: a runner answering `null` calls no `onRecounted`, and an event after it runs as usual; a runner that rejects behaves the same and nothing throws (RCNT-10)
- [ ] Tests: `forget` with a run waiting: no run starts; `forget` during a run: the run finishes and no trailing run starts for the events that came during it (RCNT-11)
- [ ] Gate check passes: `npx vitest run src/main/recount-scheduler.test.ts`, then the full gate
- [ ] Test count: T4 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): run one recount per worktree at a time`

---

### T6: Requests

**What**: `request(path)`: due at once with no quiet period, answered by the first recount that starts
after it, merged with a pending burst; `forget` keeps waiting requests; `stop` answers them `null`.
**Where**: `src/main/recount-scheduler.ts`
**Depends on**: T5
**Reuses**: T5's fakes
**Requirement**: RCNT-12, RCNT-13, RCNT-14, RCNT-15, RCNT-38, RCNT-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: a request on an idle worktree starts a run at the same instant and resolves with its count (RCNT-13)
- [ ] Tests: after a run started at 0 and resolved at 100 ms, a request at 200 ms starts its run at exactly 1,000 ms (RCNT-04 for requests)
- [ ] Tests: a request during a run whose runner answers `changes: 1` is answered `changes: 2` by the trailing run, never `1` (RCNT-14, RCNT-38)
- [ ] Tests: a request while a burst waits starts one run, which resolves the request and calls `onRecounted` once (RCNT-15)
- [ ] Tests: a run that served only a request calls no `onRecounted` (RCNT-09)
- [ ] Tests: `forget` with a request waiting still answers it (RCNT-41)
- [ ] Tests: `stop` answers a waiting request with `null`; a request after `stop` resolves `null` and starts no run (RCNT-12)
- [ ] Gate check passes: `npx vitest run src/main/recount-scheduler.test.ts`, then the full gate
- [ ] Test count: T5 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): answer recount requests from the scheduler`

---

### T7: The pool and the exclusive reads

**What**: At most `RECOUNT_POOL_SIZE` recounts at once across worktrees, started in the order they
became due; `exclusive(path, task)` holding the lane for one read at a time.
**Where**: `src/main/recount-scheduler.ts`
**Depends on**: T6
**Reuses**: T6's fakes
**Requirement**: RCNT-07, RCNT-16, RCNT-18, RCNT-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: five worktrees requested at 0 (A..E, in that order) start exactly 3 runs (A, B, C); when B's resolves, D starts at that instant; when A's resolves, E starts (RCNT-07, RCNT-16; L-028: exactly at the limit)
- [ ] Tests: a read on an idle worktree runs at once; a read requested during a recount of that worktree starts the instant the recount resolves (RCNT-18)
- [ ] Tests: a recount due during a read starts the instant the read settles, not before; two reads on one worktree run one after the other
- [ ] Tests: with 3 recounts running on A, B and C, a read on D runs at once (reads take no slot)
- [ ] Tests: a read that rejects hands the caller the same error object, and a recount pending on that worktree then starts (RCNT-39)
- [ ] Gate check passes: `npx vitest run src/main/recount-scheduler.test.ts`, then the full gate
- [ ] Test count: T6 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): bound recounts to three and keep sync reads off a running one`

---

### T8: The listing takes its counter

**What**: `listWorktrees(repoPath, countChanges = worktreeStatus)`; a `null` answer reads as clean;
`statusOf` folds into it.
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T7
**Reuses**: `worktree-manager.test.ts`'s real-git fixtures
**Requirement**: RCNT-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests (real repo with one linked worktree): an injected counter is called once per worktree path, with exactly the paths `git worktree list` gives, and its `{ dirty, changes }` lands on each node
- [ ] Tests: a counter answering `null` for one worktree gives that node `dirty: false, changes: 0` and leaves the other's values
- [ ] Existing `listWorktrees` tests pass unedited (the default counter)
- [ ] Gate check passes: `npx vitest run src/main/worktree-manager.test.ts`, then the full gate (suite wall time compared with T1's, L-005)
- [ ] Test count: T7 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(worktrees): take the change counter as a parameter`

---

### T9: The tree build passes it on

**What**: `buildTree(registry, { countChanges })` hands the counter to every `listWorktrees`.
**Where**: `src/main/tree.ts`
**Depends on**: T8
**Reuses**: `tree.test.ts`'s fixture and registry
**Requirement**: RCNT-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: with two repos registered, an injected counter receives every worktree of both and nothing else, and the snapshot carries its answers
- [ ] Existing `buildTree` tests pass unedited (no option given)
- [ ] Gate check passes: `npx vitest run src/main/tree.test.ts`, then the full gate
- [ ] Test count: T8 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(tree): pass the change counter through the tree build`

---

### T10: The watcher feeds the scheduler

**What**: `GitStateWatcher` reports each `index` / `HEAD` event through `onEvent` and each dropped
worktree through `onDropped`, with no batch of its own; `index.ts` builds the scheduler, wires
`notify`, `forget`, `onRecounted` (the `worktree:status` emit and #147's `emitted` probe) and
`stop` on `will-quit`. Records the decision and SCRF-02's revision in the same commit.
**Where**: `src/main/git-state-watcher.ts` (and its construction in `src/main/index.ts`)
**Depends on**: T9
**Reuses**: the watcher's fakes; design.md "Main wiring"
**Requirement**: RCNT-01, RCNT-09, RCNT-11, RCNT-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Tests rewritten for a superseded mechanism** (owner-confirmed through issue #149; named so the
rewrite is visible): in `git-state-watcher.test.ts`, "settles an index change once, after the batch
window", "settles a HEAD change too" and "settles a burst of changes once (SCRF-02)" become "reports an
`index` event at once", "reports a `HEAD` event at once" and "reports every event of a burst" (the
coalescing they pinned is T4's); "drops a pending settle for a worktree no longer watched" becomes
"reports a dropped worktree once through `onDropped`"; "closes every watch and drops pending settles on
closeAll" becomes "closes every watch on closeAll and reports no drop". Every other test passes
unedited.

**Done when**:

- [ ] Tests: the rewrites above, plus: an unrelated entry name reports nothing; a worktree kept across two `sync` calls is never reported dropped
- [ ] `grep -n "BATCH_MS\|schedule" src/main/git-state-watcher.ts` finds nothing
- [ ] `index.ts` read against design.md "Main wiring" for the scheduler, the watcher, the emit and the quit; written here
- [ ] `.specs/features/status-changes-refresh/spec.md`: SCRF-02 and the "Bursts" assumption row carry the note "Mechanism revised by RCNT-01..07 (AD-NNN), delivered <date> in `git-recount-coalesce` T10: the scheduler's quiet period replaces the watcher's 250 ms batch; the criterion still holds"
- [ ] `.specs/STATE.md` gains the AD from design.md with its number chosen now (the next free one after #147's), and the note above names it
- [ ] Gate check passes: `npx vitest run src/main/git-state-watcher.test.ts`, then the full gate and `npx electron-vite build`
- [ ] Test count: T9 count + the new tests (rewrites counted as unchanged)

**Tests**: unit
**Gate**: build

**Commit**: `feat(main): feed git-state events to the recount scheduler`

---

### T11: Every recount and sync read goes through it

**What**: In `index.ts`: `tree:get` builds with `countChanges: (p) => recounts.request(p)`,
`worktrees:status` answers `recounts.request`, and `git:sync-state` / `git:commits` run inside
`recounts.exclusive`.
**Where**: `src/main/index.ts`
**Depends on**: T10
**Reuses**: T6, T7, T9
**Requirement**: RCNT-13, RCNT-17, RCNT-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `grep -n "worktreeStatus\|readSyncState\|readCommits" src/main/index.ts` shows each only inside a scheduler call (`recountWorktree` is the runner); written here
- [ ] `git:run` unchanged (Out of Scope); written here
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `feat(main): route turn-end, tree and sync reads through the scheduler`

---

### T12: The tree counts its rebuilds

**What**: `useTree` returns `refreshRevision`, 0 at mount, plus one each time a `tree:get` result lands
in any of the three refresh callbacks; patches and `recount` leave it alone.
**Where**: `src/renderer/src/lib/use-tree.ts`
**Depends on**: T11
**Reuses**: the existing three refresh callbacks
**Requirement**: RCNT-24, RCNT-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Read: each of `refreshTree`, `refreshAndSelect` and `refreshAndSelectDefault` bumps it in its `then`; the `worktree:status` subscription and `recount` do not; written here
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(renderer): count tree rebuilds in a refresh revision`

---

### T13: When an event re-reads sync state

**What**: `reloadsSyncState(targetPath, event)` in the status bar's pure helpers.
**Where**: `src/renderer/src/lib/status-bar.ts`
**Depends on**: T12
**Reuses**: `status-bar.test.ts`
**Requirement**: RCNT-22, RCNT-23, RCNT-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: true for an event on the described worktree (RCNT-22)
- [ ] Tests: false for an event on another worktree; false when the other worktree's path starts with the described one's (`…\wt` described, `…\wt-2` moved; L-065) (RCNT-23)
- [ ] Tests: false with nothing described (`null`)
- [ ] Tests: the same event reads true against target A and false once the target passed in is B (RCNT-40)
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/status-bar.test.ts`, then the full gate
- [ ] Test count: T11 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(status-bar): decide when a git-state event re-reads sync state`

---

### T14: The status bar re-reads on its own worktree's event

**What**: `useGitSync` takes `refreshRevision` instead of `tree`, re-reads on `[targetPath,
refreshRevision]`, and subscribes to `worktree:status` through `reloadsSyncState` against its refs;
`StatusBar` passes the new prop through and `App` hands it `refreshRevision`.
**Where**: `src/renderer/src/lib/use-git-sync.ts` (with the one-prop pass-through in `StatusBar.tsx` and `App.tsx`)
**Depends on**: T13
**Reuses**: `targetPathRef`, `popoverPathRef`, `loadState`, `loadCommits`; T12, T13
**Requirement**: RCNT-22, RCNT-23, RCNT-24, RCNT-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Read: the hook's only `loadState` calls are the `[targetPath, refreshRevision]` effect, the `worktree:status` subscription and `run`'s success path (RCNT-25); written here
- [ ] `grep -n "tree" src/renderer/src/lib/use-git-sync.ts` finds no `WorkspaceNode` dependency
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `feat(status-bar): re-read sync state on its own worktree's event`

---

### T15: The Commits list follows rebuilds only

**What**: `App` passes `treeRevision: refreshRevision` to `useFiles`, and the comment there names
FCMT-32's triggers as `tree:get` results.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T14
**Reuses**: T12
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

### T16: The tree stays when nothing changed

**What**: `patchWorktreeStatus` returns the input tree when the worktree is absent or its `dirty` and
`changes` are equal, and keeps every untouched workspace, repo and worktree object otherwise. Records
SCRF-03's supersession and STBR-11's amendment in the same commit.
**Where**: `src/renderer/src/lib/tree-status.ts`
**Depends on**: T15
**Reuses**: `tree-status.test.ts`'s fixture
**Requirement**: RCNT-19, RCNT-20, RCNT-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Test rewritten for a superseded requirement** (owner-confirmed through issue #149): "gives the tree a
new identity even when the count is unchanged (SCRF-03)" becomes "returns the same tree when the count
and dirty flag are unchanged (RCNT-19)". Every other test passes unedited.

**Done when**:

- [ ] Tests: equal values return the input tree (`toBe`) (RCNT-19)
- [ ] Tests: a different `changes` returns a new tree with the new values, and every other worktree, repo and workspace object is `toBe` the old one (RCNT-20)
- [ ] Tests: a different `dirty` with an equal `changes` returns a new tree with the new `dirty` (RCNT-21; L-087: each arm alone)
- [ ] `.specs/features/status-changes-refresh/spec.md`: SCRF-03 and the "A patched tree" row struck through with "Superseded by RCNT-19..25 (AD-NNN), delivered <date> in `git-recount-coalesce` T16", and its traceability row marked so
- [ ] `.specs/features/status-bar/spec.md`: STBR-11 carries "Amended by RCNT-22/24 (AD-NNN): the tree refreshes means a `tree:get` result; the described worktree's `worktree:status` also recomputes"
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/tree-status.test.ts`, then the full gate and `npx electron-vite build`
- [ ] Test count: T13 count + the new tests (the rewrite counted as unchanged)

**Tests**: unit
**Gate**: quick

**Commit**: `perf(renderer): keep the tree when a recount changes nothing`

---

### T17: Smoke: ahead and upstream follow a terminal commit and a checkout

**What**: In `scripts/smoke-status-bar.mjs`: the `wt/follow` seed, `counterFollow()` after
`counterRefresh()`, and `SMOKE_ONLY=follow`, as design.md describes; each new check seen failing on a
broken build; the full script run once.
**Where**: `scripts/smoke-status-bar.mjs`
**Depends on**: T16
**Reuses**: `seed`, `selectWorktree`, `waitBar`, `check`, `counterRefresh`, the `finally` restore; the `SMOKE_ONLY` switch of `smoke-files-diff.mjs`
**Requirement**: RCNT-22, RCNT-27, RCNT-28, RCNT-29, RCNT-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (numbers written here):

- [ ] Check F1: the follow worktree starts at `↓0 ↑0` with a counter of `1` (L-031)
- [ ] Check F2: after `b.txt` is written and `a.txt` committed from the script, the bar reads `↓0 ↑1` within 2,000 ms with no refresh and no focus, and the counter still reads `1` (RCNT-28; L-088); time written
- [ ] Check F3: after `git switch -q -c <FOLLOW_BRANCH>-2`, the sync section reads `no upstream` within 2,000 ms, the counter still `1` (RCNT-29; L-061); time written
- [ ] `SMOKE_ONLY=follow` passes F1..F3 and `counterRefresh()`'s checks (RCNT-27, RCNT-30), and skips every other section
- [ ] Mutant M1 (renderer): the `worktree:status` subscription in `use-git-sync.ts` removed: F2 and F3 FAIL
- [ ] Mutant M2 (renderer): the subscription re-reads only when the event's `changes` differs from the tree's: F2 and F3 FAIL
- [ ] Mutant M3 (main, dev app relaunched, mutant confirmed live): `onRecounted` never emits: F2 FAIL and the #107 terminal-commit check FAIL
- [ ] Each mutant restored from `.orig`; `git status --porcelain` equals the baseline
- [ ] The full script, unmutated: every check it reaches passes; where it stops (the changes-popover section, if still broken on the base) is written here and matches the T3 build
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(status-bar): check ahead and upstream follow a terminal commit and checkout`

---

### T18: The figures after coalescing

**What**: Rerun T3's three runs on the finished feature, write them beside T3's, and judge the target.
**Where**: `.specs/features/git-recount-coalesce/tasks.md`
**Depends on**: T17
**Reuses**: T3's runs and one-liner
**Requirement**: RCNT-23, RCNT-32, RCNT-33, RCNT-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A1, A2, A3 (the options of B1, B2, B3) run on the T17 commit, same machine, built; three summaries written with their commit
- [ ] The T3 table extended with the after columns
- [ ] A1: every steady row reads `maxPerSecond.status` at most 1 and `peakConcurrent` at most 1 for every worktree (RCNT-32)
- [ ] A2: every steady row reads both at most 1 for `bench-wt-1`, and its `rev-list` count is at most its `emits["worktree:status"]` (RCNT-33)
- [ ] A3: no steady row counts a `rev-list` under `bench-wt-2` (RCNT-23, RCNT-34)
- [ ] The startup row of A1 and B1 side by side, with a note on what it includes (tree build through the pool, the watcher's git-dir resolves)
- [ ] Any FAIL: stop, write it here, and turn it into a fix task before the Verifier runs

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the recount figures after coalescing (#149)`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T3 ------→ T4 ------→ T5 ------→ T6 ------→ T7 ------→ T8 ------→ T9 ------→ T10 -----→ T11
Phase 3:  T11 -----→ T12 -----→ T13 -----→ T14 -----→ T15 -----→ T16
Phase 4:  T16 -----→ T17 -----→ T18
```

Eighteen tasks: three batches at Execute (Phase 1, three tasks; Phase 2, eight tasks; Phases 3-4,
seven tasks), so the sub-agent offer comes first. T1 and T3 are stop points.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: setup and stop rule | setup + one written verdict | ⚠️ Cohesive (setup and baseline are one act) |
| T2: `--select` | 1 option in 1 script | ✅ Granular |
| T3: figures before | 3 runs, notes | ✅ Granular |
| T4: timing | 1 method + the due rule, 1 file | ⚠️ Cohesive |
| T5: single flight | 1 rule + failure + `forget`, 1 file | ⚠️ Cohesive |
| T6: requests | 1 method, 1 file | ✅ Granular |
| T7: pool and reads | 1 limit + 1 method, 1 file | ⚠️ Cohesive (both decide when a lane may run) |
| T8: listing counter | 1 function | ✅ Granular |
| T9: tree build | 1 function | ✅ Granular |
| T10: watcher feeds | 1 class change + its construction, and the decision notes | ⚠️ Cohesive (the construction must change with the class, or typecheck breaks; L-001) |
| T11: routing | 1 file | ✅ Granular |
| T12: refresh revision | 1 hook | ✅ Granular |
| T13: trigger helper | 1 function | ✅ Granular |
| T14: status bar hook | 1 hook + a one-prop pass-through | ⚠️ Cohesive (the option change breaks the caller's typecheck otherwise; L-001) |
| T15: Commits list | 1 prop | ✅ Granular |
| T16: tree patch | 1 function + spec notes | ✅ Granular |
| T17: smoke | 1 section + 1 mode | ✅ Granular |
| T18: figures after | 3 runs, notes | ✅ Granular |

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
| T18 | T17 | T17 → T18 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: setup and stop rule | notes | none | none | ✅ OK |
| T2: `--select` | bench | manual | manual | ✅ OK |
| T3: figures before | notes | none | none | ✅ OK |
| T4: timing | recount scheduler | unit | unit | ✅ OK |
| T5: single flight | recount scheduler | unit | unit | ✅ OK |
| T6: requests | recount scheduler | unit | unit | ✅ OK |
| T7: pool and reads | recount scheduler | unit | unit | ✅ OK |
| T8: listing counter | worktree listing | unit | unit | ✅ OK |
| T9: tree build | tree build | unit | unit | ✅ OK |
| T10: watcher feeds | git-state watcher + `index.ts` wiring | unit (highest) | unit | ✅ OK |
| T11: routing | `index.ts` wiring | none | none | ✅ OK |
| T12: refresh revision | hooks | none | none | ✅ OK |
| T13: trigger helper | renderer pure helpers | unit | unit | ✅ OK |
| T14: status bar hook | hooks and components | none | none | ✅ OK |
| T15: Commits list | `App` (component) | none | manual | ✅ OK (stronger than required) |
| T16: tree patch | renderer pure helpers | unit | unit | ✅ OK |
| T17: smoke | end to end | manual | manual | ✅ OK |
| T18: figures after | notes | none | none | ✅ OK |

## Requirement Coverage

| RCNT ID | Unit (task) | Manual (task, run or check) |
| ------- | ----------- | --------------------------- |
| 01 | T10 | T17 (M3 path) |
| 02 | T4 | — |
| 03 | T4 | T18 A1 |
| 04 | T4, T6 | T18 A1 |
| 05 | T5 | T18 A1 |
| 06 | T5 | — |
| 07 | T4, T7 | — |
| 08 | T4 | T18 A3 |
| 09 | T4, T6 | T10 (read), T17 M3 |
| 10 | T5 | — |
| 11 | T5, T10 | — |
| 12 | T4, T6 | T10 (read) |
| 13 | T6 | T11 (read) |
| 14 | T6 | — |
| 15 | T6 | — |
| 16 | T7 | T11 (read) |
| 17 | T8, T9 | T11 (read) |
| 18 | T7 | T11 (read), T18 A2 |
| 19 | T16 | — |
| 20 | T16 | — |
| 21 | T16 | — |
| 22 | T13 | T14 (read), T17 F2, F3 |
| 23 | T13 | T18 A3 |
| 24 | — | T12, T14 (read), T15 |
| 25 | — | T14 (read) |
| 26 | — | T15 (smoke check 20) |
| 27 | — | T17 (`counterRefresh`) |
| 28 | — | T17 F2 |
| 29 | — | T17 F3 |
| 30 | — | T17 |
| 31 | — | T2 S1..S4 |
| 32 | — | T3 B1, T18 A1 |
| 33 | — | T3 B2, T18 A2 |
| 34 | — | T3 B3, T18 A3 |
| 35 | — | T1 |
| 36 | — | T3 |
| 37 | T4 | — |
| 38 | T6 | — |
| 39 | T7 | — |
| 40 | T13 | — |
| 41 | T6 | — |
