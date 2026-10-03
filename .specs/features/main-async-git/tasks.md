# Main Async Git Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/main-async-git/design.md`. In one line: `SessionNamePoller` keeps a miss count
and a due time per session and starts a listing only for an eligible session; the uncalled synchronous
`readGit` leaves `time-snapshot.ts`.
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01). **Reconciled 2026-10-03** with
`main` after #147 shipped (PR #162) and re-approved by the owner the same day: #154 already ships the
asynchronous period read (PERF-21), so the plan of 2026-10-01's T2 (tracker), T6 (bench after the change)
and T7 (bench mutants) are dropped; old T3 is reduced to deleting the uncalled read (T2 here); old T4 and
T5 are T3 and T4; old T8 is T5. The owner chose unit tests only as evidence for the backoff.

**Branch**: `feature/main-async-git`, rebased onto `origin/main` `fc19a3c` (holds #147's PR #162). The
future PR body carries `Closes #151`.

**Stop rule (T1)**: applied on #147's baseline (`.specs/features/perf-diagnostics/validation.md`,
`## Baseline`): no `spawn`-row stall over 50 ms, and the listing path is back to back by code, so the
backoff proceeds (MAGIT-30).

**Test baseline** (T1, 2026-10-03, at `c9d45ca` on `fc19a3c`): 127 test files, 2769 tests, suite 116 s
(`npx vitest run`), lint 0 errors and 18 warnings, typecheck clean.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (deep main modules unit-tested with hand-rolled injected fakes, no `vi.mock`; `index.ts` wiring hand-verified), `vitest.config.ts` (`src/**/*.test.ts`, 30 s timeouts), `package.json` scripts; style sampled from `src/main/session-name-poller.test.ts` and `src/main/time-snapshot.test.ts`; confirmed lessons L-001, L-005, L-009 and candidates L-017, L-019, L-033, L-042, L-054 applied.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Snapshot module (`time-snapshot.ts`) | none (deletion; grep) | MAGIT-05 by grep; every existing `readGitAsync` and `buildSnapshot` assertion unchanged | `src/main/time-snapshot.test.ts` | `npx vitest run src/main/time-snapshot.test.ts` |
| Name poller (`session-name-poller.ts`) | unit (fake timers) | All branches; 1:1 to MAGIT-17..28 and edge cases 43..46; every boundary at due − 1 ms and at due (L-042); every reset driven from a non-zero miss count (L-017); constants pinned by literals (L-009, L-019); every existing assertion unchanged | `src/main/session-name-poller.test.ts` | `npx vitest run src/main/session-name-poller.test.ts` |
| `index.ts` wiring | none | Unchanged by this feature | — | `npm run typecheck` |
| Specs, `STATE.md`, `validation.md` | none | — | — | `npm run lint` |

**Evidence split** (L-021, L-025): MAGIT-29, 30 and 35 are written records (T1); MAGIT-05, 36 and 37 are
greps (T2, T5). Every other ID this feature owns has a unit test named in its task.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | A task whose only tests are unit tests | `npx vitest run <the task's test file>` |
| Full | Every code task, after its quick gate | `npm run typecheck && npm run lint && npm test` |
| Lint | Docs-only tasks | `npm run lint` |

**Lint is judged by exit code AND by warning count**: 18 at T1; diff it at every gate.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Baseline

```
T1
```

### Phase 2: The uncalled synchronous read

```
T1 → T2
```

### Phase 3: The listing backoff

```
T2 → T3 → T4
```

### Phase 4: Record

```
T4 → T5
```

---

## Task Breakdown

### T1: Reconciliation, baseline and the stop rule

**What**: Rewrite spec, design and tasks for the reconciled scope, record the test baseline and #147's
before figures, and write the stop-rule verdict.
**Where**: `.specs/features/main-async-git/` (`spec.md`, `design.md`, `tasks.md`, `validation.md`)
**Depends on**: None
**Reuses**: #147's `## Baseline` (`.specs/features/perf-diagnostics/validation.md`)
**Requirement**: MAGIT-29, MAGIT-30, MAGIT-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] This branch contains #147 (`fc19a3c`, PR #162) after the rebase; the plan commits sit on it
- [x] Test count, file count, suite wall time and lint warning count recorded here (Test baseline above)
- [x] `## Measurements` in `validation.md` holds #147's 6-session `spawn` row and round trip with its commit (MAGIT-29, MAGIT-35)
- [x] The listing half cited with file:line and the stop-rule verdict written (MAGIT-30)
- [x] A note at the top of `validation.md`: the Verifier keeps `## Measurements` and adds its report below
- [x] spec, design and tasks reconciled; `validate_spec.py` and `validate_tasks.py` exit 0
- [x] Gate check passes: `npm run lint`

**Tests**: none
**Gate**: lint

**Commit**: `docs(specs): reconcile the main async git plan with main and record its baseline (#151)`

---

### T2: Delete the uncalled synchronous read

**What**: `readGit` (`execFileSync`, no caller since #154) and the `execFileSync` import leave
`time-snapshot.ts`; the test title that names it is reworded.
**Where**: `src/main/time-snapshot.ts`, `src/main/time-snapshot.test.ts` (one test title)
**Depends on**: T1
**Reuses**: —
**Requirement**: MAGIT-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `grep -rn "readGit\b" src` finds no definition or call of the synchronous `readGit`
- [x] `grep -nE "execFileSync|spawnSync|execSync" src/main/time-snapshot.ts` finds nothing (MAGIT-05)
- [x] The doc comment of `readGitAsync` no longer points at `readGit`
- [x] `git diff` of `time-snapshot.test.ts` changes one test title and no `expect` line
- [x] Gate check passes: `npx vitest run src/main/time-snapshot.test.ts`, then the full gate
- [x] Test count: T1's 2769, unchanged

**Tests**: none
**Gate**: full

**Commit**: `refactor(time): delete the uncalled synchronous git read`

---

### T3: The poller counts misses and gates the debounced listing

**What**: The three backoff constants; per-session `{ claudeId, named, misses, dueAt }`; the miss and reset
rules on success, failure, `watch` and `unwatch`; `#asked` in place of `#pendingRerun` for watches and
nudges; the eligibility check when the debounced listing would start.
**Where**: `src/main/session-name-poller.ts`
**Depends on**: T2
**Reuses**: `makePoller`, `makeFakeSpawn`, `watchedAndListed`, fake timers (`session-name-poller.test.ts`)
**Requirement**: MAGIT-17, MAGIT-18, MAGIT-19, MAGIT-20, MAGIT-21, MAGIT-22, MAGIT-23, MAGIT-27, MAGIT-43, MAGIT-44, MAGIT-45

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `NAME_BACKOFF_BASE_MS` is `5000`, `NAME_BACKOFF_FACTOR` `2`, `NAME_BACKOFF_MAX_MS` `300000`, by literal (MAGIT-17, L-009, L-019)
- [x] Tests: after the k-th listing answering `[]` (k = 1..8), a nudge whose debounce elapses 1 ms before `5 s × 2^(k−1)` (capped at 300 s) after that listing starts no call, and one whose debounce elapses exactly then starts one (MAGIT-18, MAGIT-22, MAGIT-23, MAGIT-43, L-042)
- [x] Tests: three misses, then a listing that names the session; a nudge right after starts a call (MAGIT-19, L-017)
- [x] Tests (`it.each`, L-054): exit 1, timeout, not a JSON array, resolver throws, spawn throws: each counts a miss for an unnamed session (a nudge before 5 s starts no call); a named session after the same failure still gets a call on a nudge (MAGIT-20)
- [x] Tests: three misses, then `watch` with a new Claude id starts a call after the 1 s debounce; `watch` with the same Claude id keeps the misses (no call before the due time) (MAGIT-21, MAGIT-45, L-017)
- [x] Tests: a named session whose entry disappears from a successful listing is due 5 s after it: no call at 4,999 ms, a call at 5,000 ms (MAGIT-44)
- [x] Tests: `unwatch` of a session with three misses, then `watch` of the same app session and Claude id, starts a call after the debounce (MAGIT-27)
- [x] Every existing poller test passes unchanged
- [x] Gate check passes: `npx vitest run src/main/session-name-poller.test.ts`, then the full gate
- [x] Test count: T2 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(session-name): back off the listing for a session it does not name`

**Result** (2026-10-03): 25 new tests, 2794 in all; lint 0 errors, 18 warnings; no existing test line
changed. **Deviation**: T3 ships the whole gate in `#run`, the tick (`#tickAsked`) and the end-of-call
rerun included, as design.md describes it. Its k = 1..8 test spans several 30 s ticks, and an ungated tick
would start listings that move the due times, so the split planned between T3 and T4 had no green state in
between. T4 keeps its tests and becomes test-only.

---

### T4: The tick and the coalesced rerun follow the same gate

**What**: `#tickAsked` for the 30 s interval; the tick and the end-of-call rerun start a listing only when
an asking session, or for a tick any watched session, is eligible; `dispose` clears both asks. **Since T3's
deviation the code is in place; this task adds the tests that pin it.**
**Where**: `src/main/session-name-poller.ts`
**Depends on**: T3
**Reuses**: T3's tests and fakes
**Requirement**: MAGIT-24, MAGIT-25, MAGIT-26, MAGIT-28, MAGIT-46

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: one unnamed session, due after the next tick: the tick starts no call; the first tick after its due time starts one (MAGIT-24)
- [x] Tests: a named and an unnamed session: every tick for 5 minutes starts a call, 10 in all (MAGIT-24, MAGIT-26)
- [x] Tests: a nudge from an unnamed session during a call that ends with `[]` schedules no rerun; a tick coalesced during a call with only a backing-off session watched schedules no rerun; a tick coalesced with a named session watched reruns once (MAGIT-25)
- [x] Tests: a never-named session, a nudge right after each whole second for 10 minutes, each listing closed at once with `[]`: the spawn calls land at 1, 6, 16, 36, 76, 156 and 316 s, and nowhere else (MAGIT-28)
- [x] Tests: `dispose` while a session backs off, then 10 minutes of ticks and nudges, starts no call (MAGIT-46)
- [x] Every existing poller test passes unchanged
- [x] Gate check passes: `npx vitest run src/main/session-name-poller.test.ts`, then the full gate
- [x] Test count: T3 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `test(session-name): pin the tick and rerun gate of the listing backoff`

**Result** (2026-10-03): 7 new tests, 2801 in all; lint 0 errors, 18 warnings. The tests passed on first
run, since T3 shipped the code, so three throwaway mutants (copy to `.orig`, restore in `finally`) showed
they can fail: an ungated tick fails 9 tests (MAGIT-18, 24, 25, 28), an ungated rerun 19, and a `dispose`
that leaves the poller live fails SNAME-14's test. MAGIT-46's test survives that last mutant, because
`dispose` also clears the watched sessions, so nudges and ticks find no one to list.

---

### T5: Record the decision and amend the shipped specs

**What**: Append the decision to `.specs/STATE.md` with the next free number, and name it in the
session-name traceability rows it amends (L-033).
**Where**: `.specs/STATE.md`, `.specs/features/session-name/spec.md`
**Depends on**: T4
**Reuses**: design.md's AD-TBD text; the AD-048 amendment pattern ("In Tasks — **amended by AD-048**")
**Requirement**: MAGIT-36, MAGIT-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The decision's number is the next free one across `main`, `develop`, the open PRs and the sibling worktrees' local branches at this moment, and the reason is written in its row, as earlier decisions do (MAGIT-36)
- [x] `.specs/STATE.md` holds the decision, amending AD-040 (MAGIT-36)
- [x] The rows of SNAME-09, SNAME-10 and SNAME-12 (`session-name/spec.md`) name the decision (MAGIT-37)
- [x] `AD-TBD` in this feature's design.md replaced by the number; this spec's traceability statuses updated
- [x] A grep for the number finds it in `STATE.md` and in the session-name spec
- [x] Gate check passes: `npm run lint`

**Tests**: none
**Gate**: lint

**Commit**: `docs(specs): record the session-name listing backoff decision`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T1 ------→ T2
Phase 3:  T2 ------→ T3 ------→ T4
Phase 4:  T4 ------→ T5
```

Five tasks: one batch, run inline (no sub-agent offer). The Verifier runs after T5 and keeps
`## Measurements` in `validation.md`.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: reconciliation and baseline | specs + notes | ✅ Granular |
| T2: uncalled read | 1 function + 1 import, 1 file (+ 1 test title) | ✅ Granular |
| T3: misses and debounce gate | per-session state + 3 rules, 1 file | ⚠️ Cohesive (the state is observable only through the gate) |
| T4: tick and rerun gate | 2 call paths, 1 file | ✅ Granular |
| T5: decision and amendments | 1 decision row + 3 traceability cells | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: reconciliation and baseline | specs and notes | none | none | ✅ OK |
| T2: uncalled read | snapshot module | none (grep) | none | ✅ OK |
| T3: misses and debounce gate | name poller | unit | unit | ✅ OK |
| T4: tick and rerun gate | name poller | unit | unit | ✅ OK |
| T5: decision and amendments | specs and `STATE.md` | none | none | ✅ OK |

## Requirement Coverage

| MAGIT ID | Unit (task) | Record or grep (task) |
| -------- | ----------- | --------------------- |
| 01-04, 06-16, 38-42 | delivered by #154 (PERF-21) | — |
| 05 | — | T2 (grep) |
| 17-23, 27, 43-45 | T3 | — |
| 24-26, 28, 46 | T4 | — |
| 29, 30, 35 | — | T1 |
| 31-34 | dropped 2026-10-03 | — |
| 36, 37 | — | T5 (grep) |
