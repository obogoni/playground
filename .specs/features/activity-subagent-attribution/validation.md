# Activity Subagent Attribution Validation

**Date**: 2026-09-25 (owner-approved re-check after iteration 3)
**Spec**: `.specs/features/activity-subagent-attribution/spec.md`
**Diff range**: `origin/main..c7fc414` (branch `feature/activity-subagent-attribution`). This re-check covered `b67b68f..c7fc414`, which changes one test. `src/main/activity-machine.ts` and `spec.md` are byte-identical to `115327e`.
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero

## Validation: activity-subagent-attribution — PASS

Every applicable criterion and every listed edge case has a `file:line` assertion on the spec-defined value.
All 29 behaviour-level mutants are killed. The gate is green.

### How the verdict got here

- **Iteration 1:** four survivors (M09, M10, M13, M20). Fixed by tests and spec wording in `115327e`.
- **Iteration 2:** one survivor (M24). Fixed by one test in `b67b68f`.
- **Iteration 3:** two survivors, M26 and M27, the per-event forms of M24. Iteration 3 was the last of three,
  so it **escalated to the owner**, who chose to cover the gap rather than accept it as residual risk.
  Commit `c7fc414` covers it.
- **This re-check:** `c7fc414` kills M26 and M27, plus two further per-event variants I added (M28, M29).
  The production code did not change across these rounds.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T6 | ✅ Done | - |
| T7 | ⚠️ Done, one box open | "Test session removed from the app" left to the owner (housekeeping, no code impact) |
| Verifier fixes | ✅ Done | `115327e` (5 tests, spec wording), `b67b68f` (1 test), `c7fc414` (that test widened to 4 cases, owner-approved) |

---

## Spec-Anchored Acceptance Criteria

Test files: `M` = `src/main/activity-machine.test.ts`, `N` = `src/main/activity-notification.test.ts`,
`F` = `src/main/activity-sequences.fixture.test.ts`. Line numbers are at `c7fc414`. The payload/conjunction
rule was applied to the view: `state` is always checked, and `tool` / `subagents` wherever the criterion
names them.

| AC | Spec-defined outcome | `file:line` + assertion | Outcome |
| -- | -------------------- | ----------------------- | ------- |
| ASUB-01 | Main `Stop` with non-empty `background_tasks` → `working` (subagent or shell) | `M:272` `toEqual({ state: 'working', subagents: 1 })`; `M:277` shell only → `{ state: 'working', subagents: 0 }` | ✅ PASS |
| ASUB-02 | `SubagentStop` never sets `waiting` | `M:290` → `{ state: 'working', subagents: 0 }`; S4 `M:719` (side agent's `SubagentStop` → `'working'`); `M:750` all `'working'` between first and last `Stop` (S1, S3a) | ✅ PASS |
| ASUB-03 | Main `Stop` with empty list, nothing owed → `waiting` | `M:295` `toEqual({ state: 'waiting', subagents: 0 })` | ✅ PASS |
| ASUB-04 | One `waiting` notification per captured job, at its last `Stop` | `N:133` `expect(waiting).toEqual([{ at: lastStop, state: 'waiting' }])` over all four `CAPTURED_SEQUENCES`, through the `sameView` emit gate, app unfocused | ✅ PASS |
| ASUB-05 | `idle_prompt` → `waiting`, set and owed emptied, iff last main `Stop` listed nothing; else no change | `M:304` `toBe(stopped)`; `M:310` `{ state: 'waiting', subagents: 0 }`; `M:433-434` owed emptied; S3a `M:739` mid-job idle `'working'`, `M:741` final idle `'waiting'` | ✅ PASS |
| ASUB-06 | Subagent `PermissionRequest` → `needs-approval` naming the tool; `Elicitation` → `needs-input`; asker recorded | `M:501` `toEqual({ state: 'needs-approval', tool: 'Write', subagents: 2 })`; `M:510` `{ state: 'needs-input', subagents: 1 }`; asker recorded shown by `M:536` / `M:539` | ✅ PASS |
| ASUB-07 | Other agents' events do not change the state while pending; a `Notification` without `agent_id` does not change who asked | `M:513-528` 8 other-agent events keep `'needs-approval'` and tool `'Write'`; `M:536` / `M:539`; `M:554-555` | ✅ PASS |
| ASUB-08 (a) | Asker's tool event or `ElicitationResult`: clear the question and map the event as usual (`working`; `PreToolUse` names its tool) | `M:612-642` `it.each`, after a `Stop` listing nothing, where the `SubagentStop` rule would say `waiting`: `expect(applyHookEvent(asking, answer)?.view).toEqual(view)`. Cases: `PreToolUse` → `{ state: 'working', tool: 'Read', subagents: 1 }`; `PostToolUse`, `PostToolUseFailure`, `ElicitationResult` → `{ state: 'working', subagents: 1 }`. Each event form is killed by its own case (M26-M29), and the uniform form M24 by all four | ✅ PASS |
| ASUB-08 (b) | Asker's `SubagentStop`: `working` if main turn running, OR last `Stop` listed work, OR a result is owed; else `waiting` | turn running `M:582`, `M:609`; listed work `M:574`; owed `M:657` `{ state: 'working', subagents: 0 }`; none `M:595` `{ state: 'waiting', subagents: 0 }`. Each condition is tested with only itself true: M06, M15 and M09 are each killed by exactly one test | ✅ PASS |
| ASUB-09 | N/A (T1: tool hooks carry `agent_id`) | — | N/A |
| ASUB-10 | N/A (same finding) | — | N/A |
| ASUB-11 | Keystroke while pending → `working` | `M:690` `{ state: 'working', subagents: 2 }`, `M:693`; ACTV-12 tests in `describe('applyKeystroke')` | ✅ PASS |
| ASUB-12 | S1, S2, S3a, S4 replayed; view asserted after the named events | S4 `M:719`; S3a `M:738-741`, `M:758`; S1 `M:754`, `M:766`; S2 `M:779-782` | ✅ PASS |
| ASUB-13 | Fixtures hold nothing real | `F:64` `expect(findLeaks(events)).toEqual([])` per sequence; detector shapes proven `F:86`, `F:91`, `F:99`, `F:107`, `F:112` | ✅ PASS |
| ASUB-14 | Self-listing `SubagentStop` owes a result; any main `Stop` → `working` while owed | list `Stop` `M:374`; no-list `Stop` `M:443`, both `{ state: 'working', subagents: 0 }`; unlisted owes nothing `M:387`; S1 `M:754`, S3a `M:758` | ✅ PASS |
| ASUB-15 | `<task-id>{id}</task-id>` drops the result owed by `{id}` | `M:398` `'waiting'`; `M:411` other id → `'working'`; `M:424` hand-back does not deliver → `'working'` | ✅ PASS |
| ASUB-16 | No list: `working` iff active set non-empty; `idle_prompt` by the same set | `M:315`, `M:316` `toBe(stopped)`; `M:321` `{ state: 'waiting', subagents: 0 }` | ✅ PASS |
| ASUB-17 | List replaces the set with its `subagent` entries; count = their number | `M:331` `{ state: 'working', subagents: 1 }`; `M:333` `subagents` `0` | ✅ PASS |
| ASUB-18 | Tool event from an `agent_id` outside the set changes nothing | `M:483` `toBe(waiting)` × 3 events; S1 `M:766` | ✅ PASS |

**Status**: ✅ All ACs covered. The 16 applicable criteria (18 clauses, ASUB-08 split into (a) and (b)) are
matched to their spec outcome. No spec-precision gap is open. The iteration-1 wording gaps were resolved in
`115327e`.

---

## Edge Cases

- [x] Unknown `SubagentStop`, count ≥ 0 — `M:229-230` `expect(after?.view.subagents).toBe(0)` (ACTV-34)
- [x] Restarted subagent counted again — `M:343` `toBe(1)`
- [x] New prompt keeps the set, `working` — `M:352` `{ state: 'working', subagents: 1 }`
- [x] `SessionEnd` with a question pending: set and owed emptied, and the state follows the `SessionEnd` rule:
  - `M:678-682`: `other` → `{ state: 'exited', subagents: 0 }`, `clear` → `{ state: 'waiting', subagents: 0 }`
  - owed emptied: `M:439`
  - set emptied: `M:75`, `M:211`
  - M10 and M22 killed
- [x] Two askers, kept until every asker has moved, in any order, with the view keeping the latest question's tool:
  - first asker moves first: `M:660-664`
  - second asker moves first: `M:672` `toEqual({ state: 'needs-approval', tool: 'Edit', subagents: 2 })`
  - M13, M23 and M25 killed

---

## Discrimination Sensor

Expanded tier: 29 behaviour-level mutations of `src/main/activity-machine.ts`. M01-M27 carry over from
iterations 1-3; M28 and M29 are the remaining per-event forms of M24.

- **Setup:** each mutation ran in a throwaway copy of `src/shared` and the six activity files, with
  `npx vitest run --root <scratch> src/main/`. The unmutated scratch passed 188/188.
- **Count check:** the runner took the mutation names from the mutation table itself and counted the results
  against them: 29 listed, 29 results, no anchor failures.
- **Isolation:** the real tree was never modified, and `git stash` was not used. `git status --porcelain`
  matched before and after: only this report is untracked. The scratch was deleted.

| # | Line | Mutation | Killed? |
| - | ---- | -------- | ------- |
| M01 | `activity-machine.ts:219` | `Stop` ignores `background_tasks` | ✅ Killed (8) |
| M02 | `:297` | Any prompt drops every owed result | ✅ Killed (2) |
| M03 | `:309` | `idle_prompt` ignores the list | ✅ Killed (5) |
| M04 | `:128` | Side-agent tool filter removed | ✅ Killed (4) |
| M05 | `:169` | Asker check removed | ✅ Killed (13) |
| M06 | `:136` | `mainStopped` never cleared | ✅ Killed (1) |
| M07 | `:271` | Count not resynced at `Stop` | ✅ Killed (2) |
| M08 | `:169` | Notification exception removed | ✅ Killed (1) |
| M09 | `:182` | Settling ignores owed results | ✅ Killed (1) |
| M10 | `:161` | Reset events no longer bypass the question hold | ✅ Killed (2) |
| M11 | `:291` | `SubagentStop` owes even when not self-listed | ✅ Killed (11) |
| M12 | `:263` | `Stop` ignores owed results | ✅ Killed (8) |
| M13 | `:164` | Only the latest asker remembered | ✅ Killed (1) |
| M14 | `:338` | Keystroke keeps the askers | ✅ Killed (1) |
| M15 | `:182` | Settling ignores the last `Stop`'s list | ✅ Killed (1) |
| M16 | `:269` | Shells counted as subagents | ✅ Killed (2) |
| M17 | `:176` | Asker's `SubagentStop` does not settle | ✅ Killed (5) |
| M18 | `:309` | Accepted `idle_prompt` keeps owed results | ✅ Killed (1) |
| M19 | `:309` | Accepted `idle_prompt` keeps the set | ✅ Killed (1) |
| M20 | `:265` | No-list `Stop` ignores owed results | ✅ Killed (1) |
| M21 | `:171` | Another agent's event replaces the question's view | ✅ Killed (12) |
| M22 | `:236` | `SessionEnd` `clear` keeps the old bookkeeping | ✅ Killed (3) |
| M23 | `:164` | A second question keeps the first question's tool | ✅ Killed (1) |
| M24 | `:176` | Every asker event settles by the `SubagentStop` rule | ✅ Killed (4) |
| M25 | `:171` | Tool name dropped while an asker remains | ✅ Killed (9) |
| M26 | `:176` | Only the asker's `ElicitationResult` settles by the `SubagentStop` rule | ✅ Killed (1): `ElicitationResult` case (survived in iteration 3) |
| M27 | `:176` | Only the asker's `PostToolUse` settles by the `SubagentStop` rule | ✅ Killed (1): `PostToolUse` case (survived in iteration 3) |
| M28 | `:176` | Only the asker's `PostToolUseFailure` settles by the `SubagentStop` rule | ✅ Killed (1): `PostToolUseFailure` case |
| M29 | `:176` | Only the asker's `PreToolUse` settles by the `SubagentStop` rule | ✅ Killed (1): `PreToolUse` case |

**Sensor depth**: expanded (≥5, every new branch)
**Sensor score**: 29/29 killed — PASS ✅

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ One production file; view type, IPC, renderer and `activity-notification.ts` untouched |
| Surgical changes | ✅ Every verifier fix touched tests or spec wording only |
| No scope creep | ✅ |
| Matches patterns | ✅ Same pure-reducer style and helpers (`event`, `drive`, `ask`, `tool`) |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met (domain 1:1 ACs) | ✅ 1:1 to ASUB-01..08, 11..18, every edge case, each captured sequence replayed |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, `vitest.config.ts` | ✅ |

Minor, non-blocking and unchanged: the no-list branch of `applyStop` (`:265`) repeats the rule that
`backgroundBusy` (`:186`) encodes, with the owed check added. The behaviour is correct and pinned by M20.

---

## Gate Check

- **Typecheck**: `npm run typecheck` — exit 0
- **Lint**: `npm run lint` — exit 0, 0 errors, **18 warnings** (baseline 18, none in the activity files)
- **Tests**: `npx vitest run` — 91 files, **1740 passed**, 0 failed, 0 skipped (single run)
- **Build**: `npx electron-vite build` — exit 0
- **Test count before feature**: 1663 (T1 baseline)
- **Test count after feature**: 1740 (+77). No deletions. The only edited pre-existing assertion is the one
  the plan named. `c7fc414` replaced its own branch's single test with a four-case `it.each` (net +3)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| ASUB-01..07 | ✅ Verified | ✅ Verified |
| ASUB-08 | ⚠️ Needs Fix | ✅ Verified ((a) per event, (b) per condition) |
| ASUB-09, ASUB-10 | N/A | N/A |
| ASUB-11..18 | ✅ Verified | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 16/16 applicable ACs matched their spec outcome (18 clauses); all 5 edge cases evidenced; no spec-precision gap open
**Sensor**: 29/29 mutations killed
**Gate**: 1740 passed, 0 failed; typecheck, lint (18 warnings, unchanged) and build green

**What works**:

- the background-aware `Stop`, for subagents and shells;
- owed results held through the end race;
- the `idle_prompt` gate;
- the subagent count resynced at every `Stop`;
- side agents filtered out;
- the question held until every asker has moved, in any order, with each asker event mapped as usual and its
  `SubagentStop` settled by the spec's three conditions;
- `SessionEnd` resetting everything;
- one notification per captured job.

**Issues found**: none open. Iteration 3 escalated two per-event survivors to the owner, who chose to cover
them. `c7fc414` did.

**Next steps**:

- Update the spec traceability statuses to Verified.
- The owner's remaining T7 housekeeping item: remove the test session from the app.
