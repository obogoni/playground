## Validation: files-view-polish — PASS (Amendment 1, iteration 2, 2026-09-26: see the last section; iteration 1 of the amendment had failed on evidence)

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

---

## Amendment 1 (2026-09-26)

**Verdict**: FAIL. The code gives the behaviour the amended ACs describe, but the smoke has no assertion for two spec-defined clauses of FPOL-02.
**Diff range**: `1944193..a38f6a6`: `7574463` (spec and tasks, "Amendment 1"), `8132c5f` (`FileTabs.tsx`, `FileTabs.css`), `a38f6a6` (`scripts/smoke-files-diff.mjs`, section 12).
**Verifier**: independent sub-agent, read-only over the real tree. The Verifier did not launch the app. It judged the smoke by reading it, and it treated the author's run outputs as claims: 45/45 clean, plus mutants E, F, G and H.

### The rules are unchanged and already give the amended behaviour

- **Untouched files.** `git diff --quiet 1944193..a38f6a6 -- src/renderer/src/lib/` exits 0, so `files-view.ts`, `use-files.ts` and `files-view.test.ts` are unchanged.
- **Clicking an unpinned tab's pin pins it.** The button calls `files.togglePin(key)` (`FileTabs.tsx:248`). `togglePin` picks the rule from the tab's own state: `tab.pinned ? unpinTab(...) : pinTab(...)` (`use-files.ts:713`). The unit tests cover both rules:
  - `pinTab` at `files-view.test.ts:225`, which asserts that a newly pinned tab lands after the tabs pinned before it;
  - `unpinTab` at `:236`.

  `togglePin`'s dispatch has no unit test of its own, because it lives in the hook. Smoke checks 24 and 25 cover it.
- **The focus stays on the pin path.** `togglePin` returns only `{ tabs }` and never sets `activeTab` (`use-files.ts:713`). `files-view.test.ts:262` asserts that pinning and unpinning keep every tab key, so the active key still names the same tab.
- **A pinned tab's close button closes it.** The button calls `files.closeTab(key)` (`FileTabs.tsx:261`), which runs `tabsAfterClose` over the strip's keys (`use-files.ts:693`, `:696`). `tabsAfterClose` takes a `string[]` and cannot see `pinned` (`files-view.ts:76-86`). Its unit tests are at `files-view.test.ts:82-113`.

  The menu's Close runs through a different rule, `tabsAfterBulkClose`, whose pinned-anchor case is tested at `files-view.test.ts:310`. That test does not cover the close button, but the button's rule has no pinned input to get wrong.

### Spec-anchored acceptance criteria (amended ACs only)

"Smoke" means `scripts/smoke-files-diff.mjs`, cited at the line of the `check(` call. The number in brackets is the check's position in the run.

`tabMarks` (`:316`) returns `'pinned'` only when the pin has `aria-pressed="true"`, its svg's computed `fill` is not `none`, and a close button follows the pin in DOM order (`:322`, `:324`). It returns `'unpinned'` for the same order with `aria-pressed="false"` and fill `none`.

| # | Spec-defined outcome | Evidence | Seen failing under (author's claim, checked by reading) | Verdict |
| - | -------------------- | -------- | ------------------------------------------------------- | ------- |
| FPOL-02 (amended) | every tab **but All changes** has a pin **before** its close button; the pin is **outlined** while unpinned and **filled in the accent colour** while pinned | Smoke `:905` [22]: `marks[f02]==='pinned' && marks[f04]==='pinned' && [f00,f01,f03].every(=== 'unpinned')`. Code: `FileTabs.tsx:241` (`!fixed &&`), `:246` (`aria-pressed`), `FileTabs.css:99-104` (accent `color`, `fill: currentColor`) | E, F, H | ❌ **GAP** in two clauses: (a) no check asserts the accent colour, only `fill !== 'none'`; (b) no check asserts that All changes has **no** pin |
| FPOL-03 (amended) | clicking an unpinned tab's pin pins it as in AC 1; clicking a pinned tab's pin, or choosing Unpin, moves it to the front of the unpinned tabs | Smoke `:933` [25]: strip `=== ['All changes','f04.ts','f00.ts','f02.ts','f01.ts','f03.ts']` and `marks[f00]==='pinned'`. `f04` was pinned first, so `f00` landing after it is AC 1's placement. Smoke `:921` [24]: an unpin by the pin, with the strip and the `'unpinned'` mark. Unit `:225`, `:236` | G (fails only 25), E | ✅ |
| FPOL-04 (pin path) | the active tab stays the same | Smoke `:933` [25] `activeTab === 'f00.ts'`. Smoke `:921` [24] after an unpin by the pin. Code `use-files.ts:713`. Unit `:262` | none in the app for the pin direction (gap 3) | ✅ by code and unit tests. ⚠️ Weak in the smoke: check 25 clicks the pin of the tab that is already active |
| FPOL-10 (amended) | a pinned tab closes, from the menu's Close or from its close button | Smoke `:1105` [39]: `closedByButton && strip === ['All changes']` after `clickCloseOf('f02.ts')` (`:353`). Smoke `:1096` [38] for the menu. Unit `:310` for the menu's rule; `files-view.ts:76-86` for the button's rule | H, E | ✅ (gap 4: the precondition is not asserted) |

**Status**: 3 of the 4 amended ACs are covered at the spec-defined outcome. FPOL-02 has two spec-defined clauses with no assertion.

### Answers to the three questions

- **Does `tabMarks` tell filled from outlined?** Yes.
  - `Icon` renders `<svg fill="none">`. That is a presentation attribute, so any author CSS rule overrides it.
  - The only fill rule is `.file-tab.pinned .file-tab-pin svg { fill: currentColor }` (`FileTabs.css:103-104`).
  - The pin's `path`s set no `fill` (`Icon.tsx:151-155`), so they inherit the svg's fill, and the svg's computed fill is what is drawn.
  - So `fill !== 'none'` tells the two drawings apart.

  It does **not** check the accent colour. Two mutants would pass all 45 checks:
  - dropping `.file-tab.pinned .file-tab-pin { color: var(--accent) }` (`FileTabs.css:99-101`), which fills the pin in `--text-faint`;
  - `fill: black` in place of `currentColor`.

  The tasks.md A2 entry says the smoke checks "the accent when pinned". The expression at `:322` does not.
- **Does check 25 prove more than the menu path?** For FPOL-03, yes. The menu's Pin (`FileTabs.tsx:298`) and the button (`:248`) both call `togglePin`. Only check 25 shows that an unpinned tab has the button and that the button can pin: it is the only check that kills mutant G.

  For FPOL-04 it proves little. `f00.ts` is already the active tab when its pin is clicked, so a button that also focused its own tab would still leave `active === 'f00.ts'`. Check 24 would catch a button that focused its tab on every click, because it clicks `f02.ts` while `f00.ts` is active. Nothing catches a focus call added only for pinning.
- **Does check 39 depend on state that earlier checks left?** Yes.
  - Check 39 does not assert that `f02.ts` is pinned when its close button is clicked. That rests on check 37: Close unpinned kept `f02.ts`, which only a pinned tab survives.
  - Its expected strip, `['All changes']`, also needs check 38's menu Close to have removed `f04.ts`.
  - No step between check 37 and check 39 changes a pin, so the precondition holds in a clean run.
  - If check 37 fails, check 39 no longer tests a pinned tab.

  So check 39 is sound in a clean run and fragile in a failing one.

### Gates (run by the Verifier on the real tree)

- `npx vitest run`: `Test Files 90 passed (90)`, `Tests 1680 passed (1680)`. The count before the amendment was also 1680: the amendment adds no unit tests. No flaky failure occurred, so no rerun was needed.
- `npm run typecheck`: exit 0.
- `npx eslint .`: `✖ 18 problems (0 errors, 18 warnings)`, unchanged. `npx eslint src/renderer/src/components/FileTabs.tsx scripts/smoke-files-diff.mjs`: 0 problems.
- `npx electron-vite build`: `✓ built`.

### Discrimination sensor

**Unit layer: not applicable.**
- The amendment changes only JSX and CSS (`FileTabs.tsx`, `FileTabs.css`).
- `vitest.config.ts:5` includes only `*.test.ts` files, and no component test exists: searching the tests for `FileTabs` finds nothing.
- The pure rules are untouched.

No unit test can reach this code, so the Verifier injected **0** unit mutations. The earlier 18/18 unit sensor still stands, because `files-view.ts` is unchanged.

**Smoke layer, judged by reading** (the Verifier was not allowed to launch the app). The failures the author reports for each mutant match what the check expressions compute:
- **E** (a pin only on pinned tabs, and no close button on them): 22; 24, because `f02` has no pin; 25, because `clickPinOf('f00.ts')` finds no pin; 26-28, because `'pinned'` needs a close button; 39. Consistent.
- **F** (the pinned pin is not filled): every check that reads `'pinned'` (22, 25, 26, 27, 28). Check 24 reads `'unpinned'` and passes. Consistent.
- **G** (the pin only unpins): 25 only. The following `clickPinOf('f00.ts')` is also a no-op, so the state rejoins the clean run. Consistent.
- **H** (pinned tabs lose their close button): 22 and 25-28 through `pinFirst`, and 39 because `clickCloseOf` returns `false`. Consistent.

**The pin placed after the close button.** Swapping the two buttons in the JSX makes `pin.compareDocumentPosition(close) & DOCUMENT_POSITION_FOLLOWING` zero. `pinFirst` is then false, and checks 22 and 24-28 fail, so the reasoning holds.

The check covers DOM order only. A CSS `order` or `row-reverse` on `.file-tab` would swap the buttons on screen and still pass. No such rule exists, so this gap is low.

**Behaviours none of the author's mutants would catch**, by reading:
1. **The pin not drawn in the accent colour**, from dropping `FileTabs.css:99-101` or setting `fill` to a fixed colour. It survives every check.
2. **A pin on All changes**, from dropping `!fixed &&` at `FileTabs.tsx:241`. It survives:
   - check 2 (`:457`) counts only `.file-tab.fixed .file-tab-close`;
   - check 22 never reads `marks['All changes']`.

   Clicking that pin would do nothing, because `togglePin` finds no stored tab for All changes. FPOL-02 still excludes All changes explicitly.
3. **A pin button that also focuses its tab, only when pinning.** It survives check 25 (see the answers above).

**Isolation**: no scratch was needed. `git status --porcelain` on `D:\playground-main` was empty before the work, and afterwards it lists only this report.

### Code quality (the amendment)

| Principle | Status |
| --------- | ------ |
| Minimum code / surgical | ✅ Two JSX conditions, the label and `aria-pressed`, and two CSS rules. No rule changed |
| Matches patterns | ✅ `aria-pressed`, as the diff toolbar's toggles use it (`FileTabs.tsx:356`, `:367`) |
| Stale comment | ⚠️ `Icon.tsx:150` still says "a pinned tab shows it where its close button was (FPOL-02)", which the amendment made untrue |
| Author's claims | ⚠️ tasks.md A2 says the smoke checks the pin's fill as "the accent when pinned". The expression at `:322` checks only `!== 'none'` |
| Seed | ✅ `rmTree(OTHER)` (`smoke-files-diff.mjs:77`) is a fix to the test harness, and tasks.md justifies it |

### Fix tasks

1. **FPOL-02: assert the accent colour** (Major, evidence).
   - In `tabMarks`, compare the pinned svg's computed `fill` with the resolved accent colour. One way is to read `getComputedStyle(...).color` from a probe element styled `color: var(--accent)`.
   - Return `'pinned'` only when the two are equal.
   - Show the check failing under a mutant that drops `FileTabs.css:99-101`.
2. **FPOL-02: assert that All changes has no pin** (Major, evidence).
   - Either extend check 2 (`:457`) with `document.querySelectorAll('.file-tab.fixed .file-tab-pin').length === 0`, or make check 22 assert that `marks['All changes']` reads "pin none".
   - Show the check failing with `!fixed &&` dropped at `FileTabs.tsx:241`.
3. **FPOL-04 on the pin path** (Minor). In check 25, or in a new check, click the pin of an unpinned tab that is **not** active, and assert that the active tab has not changed.
4. **FPOL-10's precondition** (Minor). Read `(await tabMarks(ws))['f02.ts'] === 'pinned'` before the click, and add it to check 39's expression.
5. **Cosmetic.** Update the comment at `Icon.tsx:150`, and correct the A2 wording in tasks.md.

### Requirement traceability

| Requirement | Previous status | New status |
| ----------- | --------------- | ---------- |
| FPOL-02 (amended) | Done (amended, A1) | ❌ Needs fix (evidence only: fix tasks 1 and 2) |
| FPOL-03 (amended) | Done (amended, A1) | ✅ Verified |
| FPOL-04 (pin path) | Done | ✅ Verified (the smoke is weak here: fix task 3) |
| FPOL-10 (amended) | Done (amended, A1) | ✅ Verified (fix task 4 hardens it) |

### Summary of the amendment

**Overall**: ❌ Not ready, on evidence rather than behaviour. The code gives every amended outcome, but two clauses of FPOL-02 have no assertion that could fail.
**Spec-anchored check**: 3 of the 4 amended ACs matched the spec-defined outcome. FPOL-02 has 2 clauses with no assertion.
**Sensor**:
- Unit layer: not applicable, 0 mutations injected.
- Smoke layer: by reading, the author's four mutants (E, F, G, H) fail exactly the checks the author reports.
- 3 behaviours are caught by none of the four mutants.

**Gate**: 1680 passed, 0 failed. Typecheck clean. Lint: 18 warnings, unchanged. Build passes.

---

## Amendment 1, iteration 2 (2026-09-26)

**Verdict**: PASS. All five gaps from iteration 1 are closed, and the fix opens no new hole.
**Diff range**: the whole amendment is `1944193..0bd9f90`. The fix is `0bd9f90`, which touches `scripts/smoke-files-diff.mjs` (`tabMarks`, checks 22, 25 and 39), one comment in `Icon.tsx`, and tasks.md A3. `git diff --quiet a38f6a6..0bd9f90 -- FileTabs.tsx FileTabs.css src/renderer/src/lib` exits 0, so the fix changes no production code.
**Verifier**: independent sub-agent, read-only over the real tree. The Verifier did not launch the app.
- It read the check expressions and treated the author's run results as claims: 45/45 clean, mutant I, and mutant JK.
- It ran the `tabMarks` expression in headless Edge 153, against the real `tokens.css` and `FileTabs.css`, on a static page in the scratchpad. That page is not the app: it contains only three hand-built tabs.

### Gaps from iteration 1

| # | Gap | Status | Evidence |
| - | --- | ------ | -------- |
| 1 | The accent colour is never asserted | ✅ Closed | `smoke-files-diff.mjs:322-326` resolves the accent from a probe span styled `color: var(--accent)`. `:334` returns `'pinned'` only when `fill === accent`. Every `'pinned'` read goes through it: checks 22 (`:916`), 25 (`:947`), 26-28, and 39 (`:1116`, `:1120`) |
| 2 | Nothing checks that All changes has no pin | ✅ Closed | `:338` returns `'bare'` only for `!pin && !close`. Check 22 requires `marks['All changes'] === 'bare'` (`:917`). A pin on All changes gives a mark that starts with `'pin fill'`, which fails check 22 |
| 3 | The pin-path focus check clicks the pin of the tab that is already active | ✅ Closed | `:942` `focusTabNamed(ws, 'f01.ts')` runs before `clickPinOf('f00.ts')`. Check 25 now requires `activeTab === 'f01.ts'` (`:947`) |
| 4 | The pinned-close check does not assert its precondition | ✅ Closed | `:1116` `const beforeClose = await tabMarks(ws)` runs before the click. Check 39 requires `beforeClose['f02.ts'] === 'pinned'` (`:1120`) |
| 5 | Stale comment and A2 wording | ✅ Closed | `Icon.tsx:150` now reads "every tab's pin button, filled while the tab is pinned (FPOL-02)". tasks.md A2's claim, "the accent when pinned", is now what `:334` checks, and A3 describes the fix accurately |

### Is the accent comparison sound?

- **Both sides serialise the same way.**
  - Headless Edge returned `rgb(167, 139, 250)` for both the probe's `color` and the pinned svg's computed `fill` in the dark theme.
  - In the light theme, it returned `rgb(124, 84, 224)` for both.
  - `fill: currentColor` resolves to the element's used colour, so both sides are `rgb(...)` strings built from the same token.
- **The light theme holds.**
  - The tokens are on `:root` / `:root[data-theme='light']` (`tokens.css:7-8`, `:31`, with `--accent` at `:21` and `:41`), and `App.tsx:247` sets the theme on `<html>`.
  - No component redefines `--accent`: a search for `--accent:` outside `tokens.css` finds nothing.
  - So the probe, appended to `<body>`, and the tab resolve the same value in either theme.
  - In the probe page, both themes gave `{"All changes":"bare","f02.ts":"pinned","f00.ts":"unpinned"}`.
- **It cannot pass trivially.** Each case below was run in the probe page:
  - **The pinned pin keeps the faint colour** (mutant I): the mark is `pin fill rgb(111, 104, 92) (accent rgb(167, 139, 250)) …` in the dark theme and `rgb(179, 170, 154)` against `rgb(124, 84, 224)` in the light theme. Not `'pinned'`.
  - **`fill: black` in place of `currentColor`**: the mark is `pin fill rgb(0, 0, 0) …`. Not `'pinned'`.
  - **`--accent` undefined**: the probe does not resolve to an empty value. `color: var(--accent)` becomes invalid at computed time and inherits the body's colour (`rgb(255, 255, 255)` in the probe page). The pinned pin falls back to `.file-tab`'s `--text-muted` (`rgb(165, 156, 142)`), so the two differ and the mark is not `'pinned'`. In the app, the body's colour is `var(--text)` (`global.css:20`), which also differs from `--text-muted`.
  - **An unpinned pin whose colour is the accent**, as under `.file-tab-pin:hover` (`FileTabs.css:95-97`): the mark is still `'unpinned'`. Hover changes `color` only, and the svg's `fill` stays `none`, because the only fill rule is scoped to `.file-tab.pinned` (`FileTabs.css:103-104`). So hovering cannot make an unpinned tab read as filled, and it cannot turn a pinned mark into an unpinned one.
  - **A missing All changes tab**: `marks['All changes']` is `undefined`, not `'bare'`. A tab with no label element would throw inside `tabName`, and the check would fail.
- **One way to mask a mutant, low.** If the OS cursor happened to rest on a pinned tab's pin, `:hover` would paint it in the accent. That would hide mutant I for that one tab. It could never make the clean build fail. The smoke never moves the mouse over the strip: its `Input.dispatchMouseEvent` calls, at `:564` and `:731`, target the diff panes.

### Does check 25's new setup keep the later strip orders?

This trace was done by reading `:922-958`:
- **After check 24**: the strip is `[All changes, f04, f02, f00, f01, f03]`, f04 is the only pinned tab, and f00 is active.
- **`:942`**: f01 becomes active. The strip is unchanged.
- **`:943`**: clicking f00's pin pins it after f04. The strip becomes `[AC, f04, f00, f02, f01, f03]`, and f01 stays active. This is what check 25 asserts.
- **`:953`**: clicking f00's pin again unpins it to the front of the unpinned tabs. That is the same slot, so the strip is still `[AC, f04, f00, f02, f01, f03]`.
- **`:955`**: the menu's Pin on f02 pins it after f04. The strip becomes `[AC, f04, f02, f00, f01, f03]`, with f01 active.
- **`:958`**: `focusTabNamed(ws, 'f00.ts')` makes f00 active again.

So the strip, the pins and the active tab are identical to the pre-fix run from `:958` on. Checks 26-45 see the same state as before.

If `focusTabNamed` at `:942` found no tab, f00 would stay active and check 25 would fail. The unasserted precondition therefore fails closed.

### Do the author's mutant results follow from the expressions?

- **I (the pinned pin keeps the faint colour).** Every `'pinned'` read fails:
  - 22: f02 and f04;
  - 25: f00;
  - 26 and 28: f02;
  - 27: f04;
  - 39: `beforeClose['f02.ts']`.

  Check 24 reads only `'unpinned'`, and check 38 reads no marks, so both pass. The reported set, 22, 25-28 and 39, is consistent.
- **JK (a pin on All changes, plus a pin that focuses its tab while pinning).**
  - J makes All changes a pin without a close. `pinFirst` is false, so the mark is spelled out rather than `'bare'`, and 22 fails. No other check reads All changes' mark. Check 2 counts only `.file-tab.fixed .file-tab-close`.
  - K makes the active tab f00 after `:943`, so 25 fails.
  - Check 24 unpins, so K does not fire there. At `:1129`, K focuses f01, and `:1131` focuses f01 anyway.

  The reported set, 22 and 25, is consistent. It also shows that K focuses only on the pin direction, which is exactly iteration 1's hole 3.

### Spec-anchored acceptance criteria (amended ACs, and FPOL-04 on the pin path)

| AC | Spec-defined outcome (`spec.md`) | Evidence | Verdict |
| -- | -------------------------------- | -------- | ------- |
| FPOL-02 (`spec.md:60`) | every tab but All changes shows a pin before its close button, outlined while unpinned and filled in the accent colour while pinned | `smoke-files-diff.mjs:916` [22]: `marks['All changes'] === 'bare' && marks['f02.ts'] === 'pinned' && marks['f04.ts'] === 'pinned' && [f00,f01,f03].every(=== 'unpinned')`. `'pinned'` is `pinFirst && fill === accent && pressed === 'true'` (`:334`), and `'unpinned'` is `pinFirst && fill === 'none' && pressed === 'false'` (`:336`). The code is at `FileTabs.tsx:241-251` and `FileTabs.css:99-104` | ✅ PASS |
| FPOL-03 (`spec.md:61`) | a pinned tab's pin unpins it to the front of the unpinned tabs, and an unpinned tab's pin pins it as in AC 1 | `:933` [24]: the strip is `[AC,f04,f02,f00,f01,f03]` and `marks['f02.ts'] === 'unpinned'`. `:947` [25]: the strip is `[AC,f04,f00,f02,f01,f03]`, which is after the earlier-pinned f04, and `marks['f00.ts'] === 'pinned'`. The unit rules are at `files-view.test.ts:225` and `:236` | ✅ PASS |
| FPOL-04, pin path (`spec.md:62`) | the active tab stays the same | `:947` [25]: `activeTab === 'f01.ts'` after pinning f00, a tab that is not active. `:933` [24]: `activeTab === 'f00.ts'` after unpinning f02, also not active. `:924` [23] covers the menu path. In the code, `togglePin` returns only `{ tabs }` (`use-files.ts:713`) | ✅ PASS |
| FPOL-10 (`spec.md:81`) | a pinned tab closes from the menu's Close or from its close button | `:1120` [39]: `beforeClose['f02.ts'] === 'pinned' && closedByButton && strip === ['All changes']`. `:1110` [38] covers the menu. The close button's rule, `tabsAfterClose`, cannot see `pinned` (`files-view.ts:76-86`) | ✅ PASS |

**Status**: all 4 amended ACs are covered at their spec-defined outcomes. There are no spec-precision gaps.

### Gates (run by the Verifier on the real tree)

- `npx vitest run`: `Test Files 90 passed (90)`, `Tests 1680 passed (1680)`. That is unchanged from before the amendment, as expected: the fix adds no unit tests. No flaky failure occurred, so no rerun was needed.
- `npm run typecheck`: exit 0.
- `npx eslint .`: `✖ 18 problems (0 errors, 18 warnings)`, unchanged. `npx eslint scripts/smoke-files-diff.mjs src/renderer/src/components/Icon.tsx`: exit 0, no output.
- `npx electron-vite build`: `✓ built` for all three bundles.

### Discrimination sensor

- **Unit layer: not applicable**, as in iteration 1. The fix changes only the smoke and a comment, and no unit test reaches JSX or CSS. 0 unit mutations were injected.
- **`tabMarks` layer**, run by the Verifier in headless Edge, in the scratchpad, on the real CSS:
  - 3 CSS mutants: the pinned pin in `--text-faint` in the dark theme, the same in the light theme, and `fill: black`.
  - All 3 were killed, because the mark is not `'pinned'`.
  - 2 control cases held: an unpinned pin in the accent still reads `'unpinned'`, and an undefined `--accent` does not match.
- **Smoke layer, by reading**: the author's mutants I and JK fail exactly the checks the author reports (see above).
- **Isolation**: the Verifier needed no worktree, because it mutated nothing in the repository. The probe page and its Edge profile live in the scratchpad. `git status --porcelain` lists the same three files before and after: `.specs/LESSONS.md`, `.specs/lessons.json` and this report, all left over from iteration 1.

### Residual, non-blocking (low)

- **The smoke checks the DOM, not what is painted.**
  - A pin hidden with `display: none` would still read `'unpinned'` or `'pinned'`.
  - So would buttons reordered on screen with CSS `order`.

  Neither rule exists (`FileTabs.css:27-104`). This is the same class of gap that iteration 1 accepted for DOM order.
- **Hover masking of mutant I**, only if the OS cursor rests on a pinned pin (see above). This cannot cause a false failure.

### Code quality (fix `0bd9f90`)

| Principle | Status |
| --------- | ------ |
| Minimum code / surgical | ✅ Three checks and `tabMarks` changed. No production code |
| Matches patterns | ✅ The mark spells out what is on screen when it fails, now including the fill and the accent |
| Author's claims | ✅ tasks.md A3 matches the diff |

### Requirement traceability

| Requirement | Previous status | New status |
| ----------- | --------------- | ---------- |
| FPOL-02 (amended) | ❌ Needs fix (evidence) | ✅ Verified |
| FPOL-03 (amended) | ✅ Verified | ✅ Verified |
| FPOL-04 (pin path) | ✅ Verified (smoke weak) | ✅ Verified |
| FPOL-10 (amended) | ✅ Verified | ✅ Verified |

### Lessons

None were recorded: this iteration found no new failure. Iteration 1's lessons are already in `.specs/LESSONS.md`, uncommitted.
