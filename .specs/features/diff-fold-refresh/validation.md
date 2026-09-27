# Diff Fold Refresh Validation

## Validation: diff-fold-refresh — FAIL

**Date**: 2026-09-27
**Spec**: `.specs/features/diff-fold-refresh/spec.md` (FOLD-01..27)
**Diff range**: `aba2975..c09ed11` (commits `b00db6d`..`c09ed11`)
**Verifier**: independent sub-agent (author ≠ verifier)

The verdict is FAIL on evidence, not on behaviour. No broken behaviour was found: the gate is green, the
full smoke passes 63/63 and every behaviour check I re-mutated went red. It fails because
two mutants survived that name real rules (left-side region identity, FOLD-08's guard), and because
FOLD-08 has no test evidence at all. validate.md makes surviving mutants fix tasks before the feature
counts as done. All four fix tasks below are test-only. None of them asks for a production change.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | Cause confirmed by the author's step-5 mutant; not re-run (the tree's 14b passing on the fixed code, and the design's reading of `diffEditorViewModel.js:126-169`, which I re-read, agree) |
| T2 | ✅ Done | Rule re-derived against `UnchangedRegion.fromDiffs` (`diffEditorViewModel.js:346-375`) and `toLineChanges` (`diffEditorWidget.js:543-575`): same thresholds, same start / end handling, same empty-range reversal |
| T3 | ✅ Done | Shape re-read from `serializeState` / `restoreSerializedState` (`diffEditorViewModel.js:263-285`) |
| T4 | ⚠️ Done, sensor gaps | U07, U10 and U15 survived (see Sensor) |
| T5 | ✅ Done | - |
| T6 | ⚠️ Done, FOLD-08 without evidence | S3 survived; see "FOLD-08" below |
| T7 | ✅ Done | The decision on a press during a pending refresh is judged below |
| T8 | ✅ Done | - |
| T9 | ✅ Done | - |
| T10 | ✅ Done | - |
| T11 | ✅ Done | Claims re-checked; 14e is honestly relabelled |
| T12 | ✅ Done | Full smoke re-run by the Verifier: 63/63 |

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`, then `npx electron-vite build`
- **Measured by the Verifier**: typecheck exit 0; lint exit 0, **0 errors / 18 warnings**, all four warning files outside the diff (`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`); **1721 / 1721 tests, 90 files**; `electron-vite build` exit 0
- **Test count before feature**: 1680 (author's T1 baseline)
- **Test count after feature**: 1721
- **Delta**: +41 (34 in `diff-view.test.ts`, 7 in `files-view.test.ts`); no test deleted or weakened in the diff
- **Skipped tests**: none
- **Full CDP smoke** (`run_diff_smoke.py verifier-full`, fresh seed, fresh app on a throwaway `--user-data-dir`): **63 / 63 in 174 s**, no electron process left. It was run once, as the owner allowed.

---

## Spec-Anchored Acceptance Criteria

The smoke cites are `scripts/smoke-files-diff.mjs` line numbers of the `check(` call. The unit cites are
the `it(` line of the test.

| ID | Criterion | Spec-defined outcome | `file:line` + assertion | Status |
| -- | --------- | -------------------- | ----------------------- | ------ |
| FOLD-01 | First show, no choice → every region folds | Strips exactly per the strip rule | `diff-view.test.ts:397` `toEqual([both(1,17), both(24,177), both(184,202)])`; `smoke-files-diff.mjs:1364` `openedLong.strips === 3 && openedOther.strips === 2` | ✅ |
| FOLD-02 | Folded + still exists → stays folded | Same folds after the refresh | `diff-view.test.ts:601` `toEqual(split.map(whole))`; `smoke-files-diff.mjs:1378` `refreshed.strips === 4`, probe kept; `:1480` diff tab `7 -> 8`, probe kept | ✅ |
| FOLD-03 | Revealed by hand + still exists → stays revealed | Region still revealed | `diff-view.test.ts:607` `[whole(A), open(B1), open(B2), whole(C)]`; `smoke-files-diff.mjs:1429` `keptRevealed.strips === 4 && shows(l050)` | ⚠️ Behaviour ✅. The identity rule ("still exists" = shares a **left-side** line, spec assumption row 38) has no discriminating test: U10 (match by right side) survived. `diff-view.test.ts:616` claims to pin it, but its fixture overlaps on both sides |
| FOLD-04 | New region, choice ≠ Show → folds | New region folded | `diff-view.test.ts:632` `whole(fresh)` with `null` and `'hide'`; `smoke-files-diff.mjs:1409` `2 -> 3` strips | ✅ |
| FOLD-05 | Partial reveal keeps top / bottom, clamped | Exact top / bottom counts | `diff-view.test.ts:651` `{44,87}, {124,167}`; `:658` clamp `{97,97}`, `{34,34}`; read side `:534` `revealedTop 20, revealedBottom 10` | ✅ as a rule (no smoke; this is the evidence split the plan approved). ⚠️ The spec does not say what a partial region that a change **splits** keeps. The code gives each half both counts (`:651`), where Monaco's line-wise transfer would keep the top on the first half and the bottom on the second |
| FOLD-06 | Merged region revealed if any source was | Revealed / folded | `diff-view.test.ts:664` `[open(B)]` and `[whole(B)]` | ⚠️ Spec-precision gap: "revealed" is ambiguous for a partially revealed source. T4's reading (whole reveals only) is defensible, see Judgments, but no test pins it: U07 survived |
| FOLD-07 | Left side changed → as a new diff | Folded, or the tab's choice | `diff-view.test.ts:669` `split.map(whole)` / `split.map(open)` for `'show'`; `:677` | ✅ as a rule. The wiring (`DiffViewer.tsx:230`, `pending.left !== original.getValue()`) has no smoke check; that is within the plan's evidence split |
| FOLD-08 | Two changes before the recompute → state from before the first | The first reading is kept | none. Code only: `DiffViewer.tsx:298` guard `pendingRef.current === null` | ❌ **No evidence**. The smoke mutant S3 removes the guard and survives 18/18, and 14e (`smoke-files-diff.mjs:1451`) is correctly labelled as the coalesced path, not FOLD-08 |
| FOLD-09 | Updates within 1 s, scroll kept | ≤ 1000 ms; scroll unchanged | `smoke-files-diff.mjs:1378` `arrived.after <= 1000`; `:1480` `tabArrived.after <= 1000`; full drive check 18 (`:895`) "arrived in 684 ms, scrollTop 0 -> 0" | ⚠️ The 1 s half is ✅. The "scroll kept" half cannot fail: `:876-878` reads `.monaco-scrollable-element.scrollTop`, which Monaco keeps at 0 (virtual scrolling), so the check reads 0 -> 0. This is a check that existed before the feature, but the feature adds `applyFolds` after `setScrollTop` (`DiffViewer.tsx:231` vs `:310`), which can move what the viewport shows |
| FOLD-10 | Strip settings 3 / 3 / 20, rule uses the same | Exact values | `diff-view.test.ts:386` `toEqual({contextLineCount: 3, minimumLineCount: 3, revealLineCount: 20})`; one constant feeds the editor at `DiffViewer.tsx:195`; exact strip counts in the app (`smoke-files-diff.mjs:1364`, `:1378`) | ✅ |
| FOLD-11 | Header shows Hide / Show beside Expand / Collapse | Order and labels | `smoke-files-diff.mjs:1544` `toggles === ['Expand all','Collapse all','Hide unchanged','Show unchanged']`; full drive check 45 (FPOL-17): no toggles when empty | ✅ |
| FOLD-12 | Hide folds every region, hand-revealed included | All strips back | `diff-view.test.ts:709`; `files-view.test.ts:380` press count 2; `smoke-files-diff.mjs:1559` other `3 -> 2 by hand -> 3` | ✅ |
| FOLD-13 | Show reveals every region, no strip | 0 strips | `diff-view.test.ts:717`; `smoke-files-diff.mjs:1586` `shownLong.strips === 0`, lines l050 / l150 shown | ✅. Note that the other.ts half of 14k passes through the **mount** path, not the press path: `readOtherAlone` remounts it, and S4 failed 14k on other.ts alone. So the press path is proven on long.ts |
| FOLD-14 | Editor gained after a press opens in that state | Choice applied on mount | `smoke-files-diff.mjs:1615` `reopenedLong.strips === 0 && reopenedOther.strips === 0`; `files-view.test.ts:374`, `:388` | ✅ (S4 killed it) |
| FOLD-15 | Show chosen + new region → revealed | New region revealed | `diff-view.test.ts:643` `open(fresh)`; `smoke-files-diff.mjs:1615` `splitLong.strips === 0 && shows(l080 = 80)` | ✅ (S1 killed it: 1 strip) |
| FOLD-16 | Hand fold / reveal after a press changes only that strip | Count − 1, other section unchanged | `smoke-files-diff.mjs:1575` `oneOther.strips === 2 && oneLong.strips === 3` | ✅ (S2 killed it) |
| FOLD-17 | Commit tab Hide / Show | Fold / reveal every section | `smoke-files-diff.mjs:1758` `commitShown.strips === 0 && commitHidden.strips === commitFolded.strips` | ✅ (author's `commit-tab-drops` killed it) |
| FOLD-18 | Diff tab toolbar shows both, acting on that editor | Present in the diff tab, absent in All changes' toolbar | `smoke-files-diff.mjs:1714` `inDiffTab.includes(...)`, `!inAllChanges.includes(...)`, `tabShown.strips === 0` | ✅ |
| FOLD-19 | Leave a tab and return → last choice | Still revealed | `smoke-files-diff.mjs:1714` `tabBack.strips === 0` | ✅ (S4 killed it: back 5) |
| FOLD-20 | Lens switch keeps All changes' choice | Still no strips | `smoke-files-diff.mjs:1653` `afterLens.strips === 0` | ✅ |
| FOLD-21 | Close drops the choice; reopen starts folded | Folded again | `files-view.test.ts:423`, `:430`; `smoke-files-diff.mjs:1714` `tabReopened.strips === tabFolded.strips` | ✅ |
| FOLD-22 | Memory only, never in config | No `unchanged` key | `smoke-files-diff.mjs:1731` `!configText.includes('"unchanged"')`; `use-files.ts:766` writes through `patchFiles` only | ✅ |
| FOLD-23 | Remount opens folded / choice, without hand reveals | 8 → 7 → 8 | `smoke-files-diff.mjs:1507` with the preconditions `stackGone` and `leftFor.state.editor` | ✅ |
| FOLD-24 | Added / deleted / identical / binary / too large unchanged by both buttons | Reads as today | `smoke-files-diff.mjs:1668` added file `0 -> 0` strips, first and last lines shown | ⚠️ Only the added file is exercised. The other kinds rest on code: an identical diff hides its editor (`DiffViewer.css:34`), and binary / too-large files mount no editor (`DiffViewer.tsx:354-363`). The check is weakly discriminating by construction, since the app only writes spans for regions that exist |
| FOLD-25 | Unreadable fold state → as today, no throw | `null`, no plan | `diff-view.test.ts:495`, `:501`, `:506` `toBeNull()`; the component skips the reading at `DiffViewer.tsx:301` | ✅ as a rule |
| FOLD-26 | Write through an empty file → fresh folds | All folded / choice | `diff-view.test.ts:682` `foldPlan([], ...)` → `split.map(whole)` | ✅ as a rule |
| FOLD-27 | Press with no editor mounted is remembered | Applied on expand | `files-view.test.ts:407`; `smoke-files-diff.mjs:1639` `noEditors === 0 && pressedBlind.strips === 0` | ✅ |

**Status**: ❌ Gaps present. FOLD-08 has no evidence. FOLD-03's identity rule and FOLD-06's reading have
surviving mutants. FOLD-06, the split case of FOLD-05, FOLD-09's scroll half and FOLD-24 carry
spec-precision or evidence caveats.

---

## Discrimination Sensor

**Baseline**: `git status --porcelain` was empty before the sensor and empty after it. The unit mutants ran
in a throwaway `git worktree` under the scratchpad, with a junction to `node_modules`. The worktree was
removed with `--force` and pruned afterwards, and `git worktree list` shows only the main checkout. The smoke mutants ran on the
real tree through `.orig` copies, restored in `finally`, and every anchor count was asserted to be 1.
Scripts: `verifier_unit_sensor.py` and `verifier_smoke_mutants.py` in the session scratchpad.

### Unit mutants (the two test files, 118 tests; the baseline in the worktree was green)

| # | File | Mutation | Killed? |
| - | ---- | -------- | ------- |
| U01 | `diff-view.ts` `unchangedRegions` | A run at the start keeps no context | ✅ Killed (6 tests) |
| U02 | `diff-view.ts` `unchangedRegions` | Between-changes bound `>=` → `>` | ✅ Killed (`:428`) |
| U03 | `diff-view.ts` `changeSpan` | Empty span of an insertion / deletion off by one | ✅ Killed (3 tests) |
| U04 | `diff-view.ts` `hiddenRangesOf` | Range length not checked | ✅ Killed (`:506`) |
| U05 | `diff-view.ts` `regionStates` | `span.end <= end` → `<` | ✅ Killed (2 tests) |
| U06 | `diff-view.ts` `foldPlan` | Merge: `some` → `every` | ✅ Killed (`:664`) |
| U07 | `diff-view.ts` `foldPlan` | Merge: a partially revealed source counts as revealed | ❌ **Survived** |
| U08 | `diff-view.ts` `foldPlan` | Bottom not clamped | ✅ Killed (`:658`) |
| U09 | `diff-view.ts` `foldPlan` | `leftChanged` ignored | ✅ Killed (`:669`) |
| U10 | `diff-view.ts` `foldPlan` | Regions matched by **right**-side overlap instead of left | ❌ **Survived** |
| U11 | `files-view.ts` `keepUnchanged` | All changes no longer always live | ✅ Killed (`:430`) |
| U12 | `files-view.ts` `pressUnchanged` | Press not counted | ✅ Killed (2 tests) |
| U13 | `diff-view.ts` `choicePlan` | Hide / Show inverted | ✅ Killed (2 tests) |
| U14 | `diff-view.ts` `foldPlan` | An unmatched region ignores Show | ✅ Killed (`:643`) |
| U15 | `diff-view.ts` `overlaps` | Touching left spans count as the same region (`<` → `<=`) | ❌ **Survived** |
| U16 | `diff-view.ts` `foldPlan` | A single-source partial reveal folds whole | ✅ Killed (2 tests) |

### Smoke mutants (focused `SMOKE_ONLY=fold`, fresh seed and fresh launch each)

| # | File:line | Mutation | Killed? |
| - | --------- | -------- | ------- |
| S1 | `DiffViewer.tsx:231` | The refresh plan gets `null` instead of the tab's choice | ✅ Killed by 14l (1 strip, want 0); nothing else failed |
| S2 | `DiffViewer.tsx:327` | The press effect runs on every render (`[press]` dropped) | ✅ Killed by 14j (other `3 -> 3`, want 2) |
| S3 | `DiffViewer.tsx:298` | The FOLD-08 guard `pendingRef.current === null` removed: every change takes a new reading | ❌ **Survived**, 18/18 |
| S4 | `DiffViewer.tsx:232` | An editor mounted after a press ignores the choice | ✅ Killed by 14k (other.ts), 14l, 14m, 14n and 14p |

The author's 12 smoke mutants (T11, T12) were not re-run. I reviewed their anchors in `mutants.py`, and
their reported kills agree with what S1-S4 show about the same checks.

**Sensor depth**: lightweight plus (16 unit and 4 smoke mutants, over the highest-risk new code).
**Sensor outcome**: 16 of 20 killed; 4 survived (U07, U10, U15, S3). The sensor fails.

---

## Judgments asked for explicitly

1. **FOLD-08's evidence: not acceptable as it stands.** The measurement behind "unreachable" holds up.
   `BATCH_MS = 250` (`src/main/file-watcher.ts:5`), and Monaco debounces the recompute by 200 ms
   (`diffEditorViewModel.js:86`) plus the worker time, so a second batch cannot land before a ~230 ms
   recompute at this file size. S3 goes further. Even a guard removed outright is invisible in the running app,
   because between `setValue` and the recompute Monaco keeps its old `_unchangedRegions` and old diff
   (`diffEditorViewModel.js:170-187`), so a second reading mostly equals the first. It differs only at
   the file's end, where `currentRegions` mixes old changes with new line counts. That makes the risk low.
   The evidence is still zero, though, and it can be had cheaply. Extract "which reading an update carries" (the
   content effect's `pendingRef.current === null` choice, plus FOLD-25's null skip) into a pure function
   in `diff-view.ts` and unit-test it 1:1. That matches the plan's own evidence split (rule unit-tested,
   wiring shared with 14b). A smoke on a file large enough for the recompute to outlast 250 ms is the
   costly alternative, and it is not needed.
2. **T4's reading of FOLD-06: defensible, but unpinned.** The spec keeps its words apart:
   "revealed by hand" (FOLD-03) and "revealed in part" (FOLD-05). So "revealed" in FOLD-06 reading as
   "revealed whole" is consistent with the spec's vocabulary. The other reading, where any revealed line
   counts, is just as consistent with the rationale "what the reader chose to read wins". Under T4's
   reading a merge of partial sources throws their partial reveals away. That is a spec-precision gap for
   the owner to settle. Whichever reading wins, a test must pin it, because U07 survives today.
3. **T7's decision, a press during a pending refresh discards the reading: correct.** Without it the
   plan computed from the pre-press reading would undo the press as soon as the diff arrived, and FOLD-12
   or FOLD-13 would be violated. Hand reveals made before the press are meant to be overridden by it
   (FOLD-12), so FOLD-03 is not contradicted. The code is `DiffViewer.tsx:321-323`, and
   `foldPlan(null, ...)` becomes the choice (`diff-view.ts`, `previous === null` branch, pinned by
   `diff-view.test.ts:677`). It has no smoke evidence, because it sits in the same ≤ 230 ms window as
   FOLD-08. It is a design decision rather than an AC, and I record it without making it a gap.
4. **Mount-margin workarounds: no check became unable to fail.** Each check that depends on a section
   holding an editor first requires one:
   - 14d requires `otherBefore.strips === 2` and the `o051 = -51` text before the write.
   - 14c requires `revealedByHand && afterReveal.strips === 3`.
   - 14g requires `stackGone` and the diff tab shown.
   - 14i requires `revealedOther && beforeHideOther.strips === 2`.
   - 14m requires `noEditors === 0`.

   S1, S2 and S4 each failed exactly the check that names the mutated behaviour.

   One consequence to know about: `readOtherAlone` remounts other.ts. The other.ts half of 14k therefore
   proves FOLD-14's mount path, not FOLD-13's press path (S4 failed 14k on other.ts alone). FOLD-13's
   press path is proven on long.ts, which is enough. The label overstates it, though.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ Two pure modules plus one adapter (`applyFolds`, `DiffViewer.tsx:111`), which is the only `modelState` writer |
| Surgical changes | ✅ 15 files, all named in the design |
| No scope creep | ✅ Nothing is persisted, and the strip settings are unchanged |
| Matches patterns | ✅ `live` ref, `patchFiles`, pure seams per L-018 |
| Spec-anchored outcome check | ⚠️ FOLD-06 and FOLD-09 (scroll half); see the table |
| Per-layer coverage expectation | ❌ The pure layer lacks 1:1 coverage for FOLD-08, and FOLD-03's identity rule has no discriminating fixture |
| Every test maps to a spec requirement | ✅ The unnamed tests (`diff-view.test.ts:433`, `:453`, `:467`, `:480`, `:540`, `:568`, `:686`; `files-view.test.ts:397`) map to T2-T5 Done-when items |
| Documented guidelines followed: `.specs/codebase/TESTING.md` | ✅ Pure seams unit-tested, components by CDP smoke |

---

## Edge Cases

- [x] Remount opens folded or in the choice (FOLD-23): 14g
- [~] Files with nothing to fold (FOLD-24): the added file is exercised; the other kinds rest on code
- [x] Unreadable fold state (FOLD-25): rule tested, and the component skips the reading
- [x] Write through an empty file (FOLD-26): rule tested
- [x] Press with nothing mounted (FOLD-27): 14m

---

## Fix Plans

### Fix 1: pin left-side region identity (U10) — Major

- **Root cause**: the fixture in `diff-view.test.ts:616` shifts the right side by one line only, so the old and new regions overlap on both sides. The smoke only replaces lines in place, so left and right never diverge.
- **Fix task**: add a `foldPlan` fixture where an insertion above moves a folded region's right side onto the old right side of a revealed one. For example, before: folded `[100,150)`, revealed `[160,200)` on both sides. After inserting 60 lines above: the region with left `[100,150)` has right `[160,210)`. Assert it stays **folded**.
- **Done when**: U10 is killed.

### Fix 2: unit evidence for FOLD-08 (S3) — Minor (low risk, zero evidence)

- **Root cause**: the rule sits inline in `DiffViewer.tsx:298`, and the timing cannot be reached from disk at this size.
- **Fix task**: move "keep the pending reading, else take a new one only when regions and hidden ranges are readable" into a pure function in `diff-view.ts`. The component calls it. Unit-test that a second change keeps the first reading (FOLD-08) and that a `null` from `hiddenRangesOf` takes none (FOLD-25).
- **Done when**: a mutant of the guard inside the pure function is killed by the unit tests; typecheck, lint and tests are green; the focused fold smoke still passes 18/18.

### Fix 3: settle and pin FOLD-06's partial-source reading (U07) — Minor, owner decision first

- **Fix task**: the owner confirms "revealed" means revealed whole (T4) or includes partial reveals. Then a test with a partially revealed source merging into one region asserts the chosen outcome. At the same time, record the split-partial case of FOLD-05 (each half keeps both counts) in the spec's assumptions.
- **Done when**: U07 is killed, and the spec row states the reading.

### Fix 4: boundary of region overlap (U15) — Cosmetic / Minor

- **Fix task**: a `foldPlan` test where a new region's left span only **touches** a revealed old one (e.g. old `[1,17)` revealed, new `[17,26)`), asserting that it is treated as new.
- **Done when**: U15 is killed.

### Noted, not a fix task for this feature

- FOLD-09's "scroll kept" rests on a check from before this feature that cannot fail (`smoke-files-diff.mjs:876-878`, scrollTop stays 0). A discriminating version would scroll with CDP `mouseWheel` and assert the first rendered line number before and after a refresh, as the project memory recommends. It is worth doing, because `applyFolds` now runs after `setScrollTop`. The owner decides whether it belongs to this PR.

---

## Requirement Traceability Update

| Requirement | Previous status | New status |
| ----------- | --------------- | ---------- |
| FOLD-01, 02, 04, 07, 10-23, 25-27 | Implementing | ✅ Verified |
| FOLD-05 | Implementing | ✅ Verified (split case flagged in Fix 3) |
| FOLD-24 | Implementing | ✅ Verified (added file; the other kinds by code) |
| FOLD-03 | Implementing | ❌ Needs evidence (Fix 1) |
| FOLD-06 | Implementing | ❌ Needs evidence (Fix 3) |
| FOLD-08 | Implementing | ❌ Needs evidence (Fix 2) |
| FOLD-09 | Implementing | ⚠️ Verified for the 1 s half; scroll half noted |

---

## Summary

**Overall**: ❌ Not ready. The gaps are in evidence only; no defect was found in behaviour.

**Spec-anchored check**: 21 of 27 matched with discriminating evidence. FOLD-08 has none. FOLD-03 and
FOLD-06 have surviving mutants. FOLD-05 (split case), FOLD-09 (scroll) and FOLD-24 (kinds not exercised)
carry caveats.
**Sensor**: 16 of 20 mutants killed (U07, U10, U15 and S3 survived).
**Gate**: 1721 / 1721 tests, lint 0 errors / 18 warnings (baseline), typecheck and build exit 0; full smoke 63 / 63.

**What works**: folds survive refreshes in All changes, commit tabs and diff tabs. Hand reveals survive
too, and new regions follow the tab's choice. Hide and Show act on every mounted section and on sections
mounted later. The choice is per tab, survives tab and lens switches, is dropped on close and never
reaches the config.

**Next steps**: Fixes 1, 2 and 4 are test-only and small. Fix 3 needs one owner answer first. Then
re-verify: the unit sensor for U07, U10, U15 and the guard seam, plus one focused fold smoke.
