# Blocked State in Red Validation

## Validation: blocked-state-red — PASS

**Date**: 2026-10-31
**Spec**: `.specs/features/blocked-state-red/spec.md` (BLKR-01..04, issue #187)
**Diff range**: `main..feature/blocked-state-red` (`3b4946ab` stateClass + tests, `f5849456` sidebar CSS)
**Verifier**: independent sub-agent (author ≠ verifier), one round

Diff surface: `src/renderer/src/lib/task-pills.ts` (+2: `case 'blocked': return 'red'`),
`src/renderer/src/lib/task-pills.test.ts` (+22: new `describe('stateClass')`),
`src/renderer/src/components/Sidebar.css` (+4: `.sidebar-state-dot.red`), and the spec itself.

---

## Task Completion

No `tasks.md` (small feature, executed inline). Both commits are present on the branch and the
working tree carries no uncommitted change to the feature's files.

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| AC1 / BLKR-01: WHEN state is `Blocked` in any casing THEN `stateClass` returns `red` | `'red'` | `src/renderer/src/lib/task-pills.test.ts:6` - `expect(stateClass('Blocked')).toBe('red')` | ✅ |
| AC2 / BLKR-02: a blocked task pill uses the existing `.task-pill.red` colours | class `task-pill red`, colour `var(--red)`, tint `color-mix(--red 16%)` | Unit: `task-pills.test.ts:6` (class name `red`). Wiring: `TasksPane.tsx:191`, `SessionRail.tsx:331`, `AgentsView.tsx:336`, `WorktreeDetail.tsx:256` build `` `task-pill ${stateClass(...)}` ``. Rule: `src/renderer/src/styles/global.css:79-82` (pre-existing, unchanged). Hand CDP probe (author): `getComputedStyle('task-pill red').color === var(--red)` in both themes | ✅ (unit + static + hand) |
| AC3 / BLKR-03: a blocked sidebar dot is filled with `--red` | `background: var(--red)` | Unit: `task-pills.test.ts:6`. Wiring: `Sidebar.tsx:350` `` `sidebar-state-dot ${stateClass(pin.details.state)}` ``. Rule: `src/renderer/src/components/Sidebar.css:321-323` `.sidebar-state-dot.red { background: var(--red) }`. Hand CDP probe (author): dot bg === `var(--red)`, dark rgb(224,128,104), light rgb(207,97,73); FAILed with the rule removed | ✅ (unit + static + hand) |
| AC4 / BLKR-04: `active`, `new`, `in progress`, `resolved`, `closed` and every other state keep today's mapping | green, blue, amber, accent, faint; anything else `muted` | `task-pills.test.ts:16-22` - `toBe('green')`, `toBe('blue')`, `toBe('amber')`, `toBe('accent')`, `toBe('faint')`, `stateClass('Removed')` and `stateClass('')` `toBe('muted')`. Production diff adds only the `blocked` case (`task-pills.ts:67-68`); the other arms are byte-identical to `main` | ✅ |

**Status**: ✅ All ACs covered; no spec-precision gaps (every outcome is a named class or token).

Notes on AC2/AC3 evidence:

- Per `.specs/codebase/TESTING.md`, renderer CSS has no unit-test layer; the evidence is the unit
  test on the class name, the static rule, and a hand CDP probe.
- The probe (`check-blocked-css.mjs`, author scratchpad, not committed) appends detached spans
  with the classes to `document.body` and compares computed colours against `var(--red)`. Both
  rules are unscoped (`.sidebar-state-dot.red`, `.task-pill.red`), so a body-level probe resolves
  them exactly as a rendered pin would. The scoped overrides that exist
  (`.rail-group-head-row .task-pill` in `SessionRail.css:195`, `.sidebar-worktree-line2 .task-pill`
  in `Sidebar.css:268`, `.detail-task-header .task-pill` in `WorktreeDetail.css:112`) change size
  or use `currentColor`, never the colour, so the red carries through.
- `--red` is defined for dark (`tokens.css:25`, `#e08068`) and light (`tokens.css:45` under
  `:root[data-theme='light']`, `#cf6149`); the probe's rgb values match both.
- The probe was falsified against a broken build (rule removed → `dot is --red` FAIL), so it is
  not a check that cannot fail. The Verifier did not relaunch the app: the dev app on 9333 was
  no longer running, and the rule, wiring and tokens are confirmed statically above.

---

## Edge Cases

- [x] `blocked` / `BLOCKED` → `red`: `task-pills.test.ts:7` `expect(stateClass('blocked')).toBe('red')`, `task-pills.test.ts:8` `expect(stateClass('BLOCKED')).toBe('red')`
- [x] A state that only contains `blocked` (`Unblocked`) → `muted`: `task-pills.test.ts:12` `expect(stateClass('Unblocked')).toBe('muted')`

---

## Discrimination Sensor

Run in a temporary detached `git worktree` under the session scratchpad (with a `node_modules`
junction), command `npx vitest run src/renderer/src/lib/task-pills.test.ts`, one mutant at a time,
file restored between mutants.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 1 | `src/renderer/src/lib/task-pills.ts:67-68` | Dropped the `case 'blocked': return 'red'` arm (state falls to `muted`) | ✅ Killed - `task-pills.test.ts:6` expected `'red'`, received `'muted'` |
| 2 | `src/renderer/src/lib/task-pills.ts:68` | Mapped `blocked` to another class (`'red'` → `'amber'`) | ✅ Killed - `task-pills.test.ts:6` expected `'red'`, received `'amber'` |
| 3 | `src/renderer/src/lib/task-pills.ts:56` | Substring match: `if (state.toLowerCase().includes('blocked')) return 'red'` before the switch, case arm removed | ✅ Killed - `task-pills.test.ts:12` expected `'muted'`, received `'red'` |

**Sensor depth**: lightweight (3 behaviour-level mutants; not a P0 path).
**Sensor verdict**: 3/3 killed.

Isolation: `git status --porcelain` of the real tree before and after the sensor is identical
(only the three pre-existing untracked `.specs/features/{session-follows-worktree,taskbar-unseen-dot,worktree-clock-task-total}/`
folders). The scratch worktree was removed and pruned; `git worktree list` shows only the main
tree; `npm ls --depth=0` reports no missing package in `node_modules`.

CSS smoke mutants: none run by the Verifier (0 of the 5 allowed). The author's own falsification
of `.sidebar-state-dot.red` stands as the CSS-level kill.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code (2 lines of logic, 4 lines of CSS) | ✅ |
| Surgical changes (no unrelated edit) | ✅ |
| No scope creep (no other state mapped, no new token, per Out of Scope) | ✅ |
| Matches patterns (`case` arm like its siblings; dot rule like the other `.sidebar-state-dot.*`) | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer coverage expectation (pure helper unit-tested 1:1; renderer CSS hand-verified per TESTING.md) | ✅ |
| Every test maps to a spec requirement (BLKR-01, BLKR-01 edge case, BLKR-04) - no unclaimed tests | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md` (pure-function tests, `describe(<symbol>)` → `it(<behaviour>)`, co-located) | ✅ |

---

## Gate Check

- **Typecheck**: `npm run typecheck` (node + web) - exit 0
- **Tests in scope**: `npx vitest run src/renderer/src/lib/task-pills.test.ts` - 10 passed, 0 failed, 0 skipped
- **Lint (changed TS files)**: `npx eslint src/renderer/src/lib/task-pills.ts src/renderer/src/lib/task-pills.test.ts` - exit 0, no findings
- **Test count before feature** (`task-pills.test.ts` on `main`): 7
- **Test count after feature**: 10
- **Delta**: +3 new tests, none removed, no assertion weakened
- **Full suite**: not run by the Verifier (scope limited to the touched test file by the dispatcher)

---

## Follow-ups (non-blocking)

1. **Independent Test not run end to end.** No check pinned a real work item in the `Blocked`
   state and read the rendered pill in the tasks pane, session rail, agents view, worktree detail
   and the sidebar dot. The class wiring at those five call sites is pre-existing and unchanged,
   so the risk is low; a pass by eye on the next real blocked item (both themes) closes it.
2. **The CSS probe is not committed.** `check-blocked-css.mjs` lives in a session scratchpad; if a
   regression check for state colours is wanted, it could become a `scripts/smoke-*.mjs`.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| BLKR-01 | Implementing | ✅ Verified |
| BLKR-02 | Implementing | ✅ Verified (unit + static + hand CDP) |
| BLKR-03 | Implementing | ✅ Verified (unit + static + hand CDP) |
| BLKR-04 | Implementing | ✅ Verified |

(The Verifier does not edit `spec.md`; the author updates the traceability table.)

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 4/4 ACs and 2/2 edge cases matched the spec outcome; 0 spec-precision gaps
**Sensor**: 3/3 mutations killed
**Gate**: typecheck exit 0; 10/10 tests in scope passed; lint clean on changed files

**What works**: `stateClass` maps `Blocked` in any casing to `red`, rejects substrings, and leaves
every other state on its previous class; the sidebar dot gains the missing `.red` rule; the pill
reuses the existing `.task-pill.red`.

**Issues found**: none in production code. Two smoke-level follow-ups above.

**Next steps**: mark BLKR-01..04 verified in `spec.md`; open the PR.
