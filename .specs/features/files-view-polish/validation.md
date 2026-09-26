## Validation: files-view-polish — PASS

**Date**: 2026-09-26 (iteration 2 of 3)
**Spec**: `.specs/features/files-view-polish/spec.md` (FPOL-01..18, Edge Cases, Assumptions; FPOL-13 amended and FPOL-18 added on 2026-09-26 by the owner)
**Diff range**: `origin/main..HEAD` = `c31bb9a..d6c3413`. Fix round 1 is `9af9c21..d6c3413`: `37a7434` (unit guards), `7aede47` (doc comment moved), `2d02ce2` (spec and tasks), `d6c3413` (smoke).
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree

**Why PASS**:
- All 18 acceptance criteria and all three edge cases now have evidence that targets the spec outcome.
- Every new smoke check was seen failing under a mutant built for it, in the author's runs, which the Verifier read.
- The unit sensor killed 18/18 mutants.
- The gate is green.
- Fix round 1 did not touch production code: the only non-test change is a doc comment moved in `FileTabs.tsx`.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T9 | ✅ Done | As in iteration 1 |
| Fix round 1 | ✅ Done | tasks.md "Fix round 1 (Verifier iteration 1, 2026-09-26)" |

---

## Spec-Anchored Acceptance Criteria

Unit = `src/renderer/src/lib/files-view.test.ts`, cited at the `it(` line. Smoke = `scripts/smoke-files-diff.mjs`, cited at the `check(` line and judged by reading its expression. The smoke outputs were produced by the author: `files-smoke-fix1final.txt` 43/43, mutant runs `fix1mutC/D2/E/F/G`, plus iteration 1's A2/B2/C2. The Verifier did not re-run them.

| # | Spec-defined outcome | Evidence | Seen failing under | Verdict |
| - | -------------------- | -------- | ------------------ | ------- |
| FPOL-01 | pinned, placed after the earlier pins | Unit `:225`, which pins a commit tab; smoke `:873` strip `=== ['All changes','f02.ts','f04.ts','f00.ts','f01.ts','f03.ts']` | A2; unit M1, M14 | ✅ |
| FPOL-02 | a pin where × was | Smoke `:878` `marks[f02]==='pin' && marks[f04]==='pin' && marks[f00]==='close'` | none (exact-equality expression) | ✅ |
| FPOL-03 | unpinned, first among the unpinned | Unit `:236`; smoke `:892` strip, `'close'` mark, and now `activeTab === 'f00.ts'` | A2, G; unit M2, M3 | ✅ |
| FPOL-04 | active unchanged by pin or unpin | Smoke `:883` after pinning (`activeTab === 'f00.ts'`); smoke `:892` after unpinning (new); unit `:262` keeps every key | G (checks 23 and 24) | ✅ |
| FPOL-05 | All changes has no menu | Smoke `:955` `allChangesMenu === null`; `FileTabs.tsx` `if (fixed) return` | A2 | ✅ |
| FPOL-06 | `[All changes]` | Unit `:277` `{ keys: [ALL_CHANGES_KEY], active: ALL_CHANGES_KEY }`; smoke `:1062` | unit M10 | ✅ |
| FPOL-07 | only the pinned tabs survive | Unit `:284`; smoke `:1046` `=== ['All changes','f04.ts','f02.ts']` | B2; unit M4-class | ✅ |
| FPOL-08 | the anchor and the pinned tabs survive | Unit `:291`; smoke `:1030` | A2; unit M4 | ✅ |
| FPOL-09 | only unpinned tabs right of the anchor close | Unit `:298` (including a pinned anchor); smoke `:1017` | A2; unit M5 | ✅ |
| FPOL-10 | a pinned anchor closes | Unit `:310`; smoke `:1053` `=== ['All changes','f02.ts']` | D2 (cascade); unit M7 | ✅ |
| FPOL-11 | nearest right, else left, else All changes, else `null` | Unit `:324` right, `:331` left, `:338` All changes, `:363` `null`, `:345` no focus stays none; smoke `:1022` | A2; unit M6, M8, M9, M13 | ✅ |
| FPOL-12 | exactly Close unpinned and Close all | Smoke `:1041` `J(moreItems) === J(['Close unpinned','Close all'])` | none (exact equality) | ✅ |
| FPOL-13 (amended) | the menu closes; dismissing changes no tab by itself; a click on a control still acts | Smoke `:981`: Escape and a neutral click close the menu, strip unchanged. Smoke `:1003` (new): a click on `f00.ts` through an open menu gives `menu === null && active === 'f00.ts'`; the ⋯ menu closes on Escape; strip unchanged | B2 (Escape); D2 (click swallowed, active stayed `f01.ts`) | ✅ (see gap 1) |
| FPOL-14 | every section expanded | Smoke `:1082` `after.expanded === after.sections`, with at least 40 sections | C, C2 | ✅ |
| FPOL-15 | 0 expanded | Smoke `:1101` `expanded === 0 && diffEditors === 0` | C, C2 | ✅ |
| FPOL-16 | the `mountPlan` bound, with every section open | Smoke `:1089` `expanded === sections && 0 < diffEditors <= 12`; `mountPlan` untouched | C, C2 | ✅ (asserts the cap, not proximity; the AC says "mountPlan, unchanged") |
| FPOL-17 | no buttons when nothing is listed | Smoke `:1154` `empty !== null && toggles.length === 0` | C, C2 | ✅ |
| FPOL-18 (new) | a commit tab's stack expands and folds every file | Smoke `:1130`: the 'work on the branch' commit tab has at least 40 sections, `before.expanded < sections`, then `expanded === sections`, then `0` | C (`10 -> 10 -> 10 of 44`) | ✅ |

**Status**: 18/18 ACs matched the spec outcome. There are no open spec-precision gaps: FPOL-13's wording was amended by the owner.

---

## Edge Cases

The matrix row now assigns these to the CDP smoke (tasks.md), which is the layer where they can be expressed.

- [x] **Per-worktree pins**: smoke `:922`. It adds a second linked worktree `fxd-smoke-other` and checks `otherPins === 0 && !otherStrip.includes('f02.ts') && backStrip === beforeReopen && marks[f04]==='pin'`. Under mutant E (one shared Files state) it FAILs with "other: 2 pins".
- [x] **A pinned diff tab whose file stops being changed stays open and pinned**: smoke `:941`. It commits `f02.ts` back to its content on main, checks the precondition in git (`!stillChanged.includes('stack/f02.ts')`) and in the tree (`!inTree`), then asserts the strip still includes `f02.ts` with a `'pin'` mark. It FAILs under mutant F (a git state change closes diff tabs), and under D2 because the pin was lost at reopen.
- [x] **Reopening a file already open in a pinned tab focuses it**: smoke `:905`. It asserts `strip === beforeReopen && active === 'f02.ts' && marks[f02] === 'pin'`. It FAILs under D2 (reopen rebuilds the tab without `...open`).

---

## Discrimination Sensor

- **Scratch**: a detached `git worktree` of `d6c3413` under the session scratchpad (`fpol-sensor-wt2`), with a `node_modules` junction.
- **Mutations**: in `fpol-verifier-sensor2.py`. Each asserts that its anchor occurs exactly once and that the mutated text is on disk.
- **Command**: `npx vitest run src/renderer/src/lib/files-view.test.ts`. The unmutated control passed 43/43.

| # | Mutation (`files-view.ts`) | Iteration 1 | Iteration 2 |
| - | -------------------------- | ----------- | ----------- |
| M1 | `pinTab` inserts before earlier pins | Killed | ✅ Killed |
| M2 | `unpinTab` keeps `pinned` | Killed | ✅ Killed |
| M3 | `unpinTab` moves the tab to the end | Killed | ✅ Killed |
| M4 | Close others closes pinned tabs | Killed | ✅ Killed |
| M5 | Close to the right `>` → `>=` | Killed | ✅ Killed |
| M6 | Left fallback = leftmost survivor | Killed | ✅ Killed |
| M7 | Close spares a pinned anchor | Killed | ✅ Killed |
| M8 | Focus falls left before right | Killed | ✅ Killed |
| M9 | A surviving active tab hands off the focus | Killed | ✅ Killed |
| M10 | Close all spares pinned tabs | Killed | ✅ Killed |
| M11 | Close others: `anchorAt !== -1` guard dropped | **Survived** | ✅ Killed |
| M12 | `unpinTab`: `index === -1` guard dropped | **Survived** | ✅ Killed |
| M13 | Absent or `null` active treated as closed | **Survived** | ✅ Killed |
| M14 | `pinTab` does not set `pinned` | Killed | ✅ Killed |
| M12b | `unpinTab` guard inverted (the author's variant) | — | ✅ Killed |
| M13b | `if (survives[activeAt])` only (the author's variant) | — | ✅ Killed |
| M15 | Close to the right: `anchorAt !== -1` guard dropped | — | ✅ Killed |
| M16 | `pinTab`: absent-key guard dropped | — | ✅ Killed |

**Sensor depth**: expanded (18 behaviour-level mutations covering every branch of `pinTab` / `unpinTab` / `tabsAfterBulkClose`)
**Kill ratio**: 18/18

The hook-level and component-level behaviour is falsified by the author's smoke mutant sets, which the Verifier read and judged:
- set D: `openDiff` rebuilds the tab, and the dismissing click is swallowed;
- set E: one shared Files state;
- set F: a git state change closes diff tabs;
- set G: `togglePin` sets `activeTab`;
- set C: the buttons are wired to the wrong set.

Each targeted check FAILs in its run, and the failures quoted in each output match the mutation.

**Isolation**:
- The junction was removed with `cmd /c rmdir`, and its target `node_modules\vitest` was confirmed still present.
- Then `git worktree remove --force` and `git worktree prune`.
- `git status --porcelain` on `D:\playground-main` showed `?? .specs/features/files-view-polish/validation.md` before the sensor and exactly that after it.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / surgical | ✅ Fix round 1 changed only tests, specs and one doc comment's position |
| Doc comments | ✅ `StripMenu`'s doc now sits above the interface, and `changeShortcut`'s sits above the function (`7aede47`) |
| No scope creep | ✅ The commit tab's Expand all and Collapse all are recorded as FPOL-18 (owner, 2026-09-26) |
| Matches patterns | ✅ The amended FPOL-13 matches the sidebar's and CommitList's window-click dismissal |
| Coverage expectation | ✅ The matrix now puts the edge cases on the smoke layer, and each has a check |
| Every test maps to a requirement | ✅ The two new unit tests (`:345`, `:352`) pin FPOL-11's "an active tab that survives stays" contract and the guards |
| Guidelines | `.specs/codebase/TESTING.md`, `vitest.config.ts` |

---

## Gate Check

- **Command**: `npm run typecheck && npm run lint && npm test`, run on the real tree
- **Outcome**: exit 0. typecheck clean. Lint: `✖ 18 problems (0 errors, 18 warnings)`, all in files outside the diff (`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`). Tests: `Test Files 90 passed (90)`, `Tests 1680 passed (1680)`.
- **Test count**: 1663 before the feature → 1678 after iteration 1 → 1680 now (+2 unit tests, one of which bundles the three anchored kinds; one more assertion was added to an existing test)
- **Skipped / failures**: none

---

## Remaining gaps (non-blocking)

1. FPOL-13's "dismissing changes no tab by itself" is asserted on the strip order but not on the active tab after Escape or a neutral click (smoke `:981`, `:1003`). Minor.
2. FPOL-16 asserts `mountPlan`'s 12-editor cap rather than proximity to the viewport. That is acceptable, since the AC defers to `mountPlan` unchanged.
3. The FPOL-05 unit assertion `pinTab(tabs, ALL_CHANGES_KEY)` (`:254`) is vacuous, because All changes is never stored. The smoke carries it.
4. The tasks.md Fix round 1 entry for set D names checks 25 and 31. The run also shows cascaded FAILs at 27, 34, 36 and 37. This is cosmetic, but it shows the D run was not a clean one-check-per-mutation falsification.
5. Process: the author's falsification scripts (`mut-files.py`, `mut-fpol-units.py` in the scratchpad) mutate `D:\playground-main` in place and keep `.orig` backups. The tree is clean now: no `.orig` files, and the porcelain is only this report. A crashed run would leave a fault in the real worktree, though.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FPOL-01..17 | Done (FPOL-13 flagged) | ✅ Verified |
| FPOL-18 | Done (fix round 1) | ✅ Verified |
| Edge cases (3) | ❌ Needs tests | ✅ Verified (smoke) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 18/18 ACs and 3/3 edge cases matched the spec outcome
**Sensor**: 18/18 unit mutations killed; smoke mutant sets C, D, E, F and G each falsify their checks
**Gate**: 1680 passed, 0 failed; lint 0 errors / 18 warnings (unchanged, none in the diff)

---

## Iteration 1 (history)

The first verification (range `c31bb9a..9af9c21`) returned **FAIL** on evidence, not on behaviour. Its findings:

- 17/17 ACs covered.
- 0/3 edge cases had any test, although the matrix said the pure-rule unit tests covered them. They live in `use-files.ts`, so no unit test there could reach them.
- The sensor killed 11/14. M11 (unknown anchor), M12 (`unpinTab` absent key) and M13 (a `null` or absent active treated as closed) survived.
- FPOL-13 had a spec-precision gap: a click outside that lands on a tab also acts on it.
- FPOL-04's evidence was indirect.
- A doc comment in `FileTabs.tsx` was orphaned.
- The commit tab's Expand all and Collapse all had not been recorded in the spec.
- Gate: 1678 passed; lint 0 errors / 18 warnings.

Fix round 1 addressed every ranked gap:
- unit guards (`37a7434`);
- doc comment moved (`7aede47`);
- FPOL-13 amended, FPOL-18 added and the matrix corrected (`2d02ce2`);
- smoke checks for the three edge cases, FPOL-04 after unpinning, the amended FPOL-13, the ⋯ menu's Escape and FPOL-18 (`d6c3413`).

---

## Lesson candidates

- **Map every edge case to the layer where its code runs.** Grounded in iteration 1's gaps 1-3: all three edge cases lived in the hook (`use-files.ts`), the matrix assigned them to the pure-rule unit tests, and no task's Done-when listed them. The fix put them on the smoke layer, in `smoke-files-diff.mjs:905`, `:922` and `:941`.
- **Give every early-return guard in a pure rule one unit case.** Grounded in iteration 1's surviving M11-M13: each `=== -1` or `null` early return in `tabsAfterBulkClose` / `unpinTab` survived until `files-view.test.ts:345`, `:352` and the `unpinTab(…, 'file:gone.ts')` assertion were added.
- **When a smoke mutant run aborts, the later checks are unfalsified.** Grounded in iteration 1's B2 run aborting at check 33, so FPOL-10 and FPOL-06 were never seen failing in the app from that run.
- **Mutate a scratch copy, not the real worktree, even for the author's own falsification.** Grounded in `mut-files.py` and `mut-fpol-units.py`, which write into `D:\playground-main` and restore from `.orig` backups. They are safe only as long as nothing crashes between the write and the restore.
