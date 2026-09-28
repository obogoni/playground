# Diff Fold Refresh Validation

## Validation: diff-fold-refresh — PASS

**Date**: 2026-09-27 (round 2)
**Spec**: `.specs/features/diff-fold-refresh/spec.md` (FOLD-01..27)
**Diff range**: `aba2975..4d48cdc`. Round 2 re-checked `eeebaa6..4d48cdc` (commits `d15b3eb`..`4d48cdc`, tasks T13-T17) in depth, over round 1's evidence.
**Verifier**: independent sub-agent (author ≠ verifier)

Round 1's four surviving mutants are now killed, each by the test named for it. FOLD-08 has unit evidence in
a pure seam. FOLD-09's scroll half has a check that fails on five different faults. It also caught a real
defect, which T17 fixed. The gate is green. Three mutants survive in round 2. Two are equivalent, shown by
the run itself. The third, V8, is the FOLD-08 call site. It sits in a window no disk write reaches, and it is
the bar round 1's Fix 2 set. None of them is a behaviour gap. See "Residuals".

---

## Round 1, and how each gap was closed

Round 1 (`eeebaa6`) found the gate green and no broken behaviour. It failed on evidence: 16 of 20
mutants killed.

| Round 1 gap | Closed by | Round 2 evidence |
| ----------- | --------- | ---------------- |
| U10: regions matched by right-side overlap survived (FOLD-03's identity rule) | T13 | `diff-view.test.ts:629` fails under U10, and only it fails |
| U15: `<=` in `overlaps` survived | T13 | `diff-view.test.ts:641` fails under U15, and only it fails |
| U07: a partly revealed source counted as revealed in a merge survived; FOLD-06 was imprecise | T14; owner decision 2026-09-27 ("revealed whole") | `diff-view.test.ts:648` fails under U07; AC 6 and the merge assumption row now say "revealed whole" |
| FOLD-05's split case unspecified | T14 | The partial-reveal assumption row records "each half keeps both counts, clamped"; `diff-view.test.ts:676` pins it |
| S3: the FOLD-08 guard removed survived 18/18; FOLD-08 had no evidence | T15 (`readingBeforeUpdate`) | S3 at the seam fails `diff-view.test.ts:755` and `:764`. The call site is a residual (V8) |
| FOLD-09's scroll half could not fail (`scrollTop` 0 -> 0) | T16 (14f2), T17 (fix) | 14f2 (`smoke-files-diff.mjs:1528`) killed V1, V2, V4, V5 and V6 |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T12 | ✅ Done | As in round 1; the code they cover has not changed since, except `DiffViewer.tsx`'s content effect and diff listener (T15, T17) |
| T13 | ✅ Done | Claim confirmed: U10 and U15 each fail exactly one test, the one added for it |
| T14 | ✅ Done | Claim confirmed: U07 fails exactly `:648`. The spec rows match the owner's decision. `validate_spec.py` gives 0 errors |
| T15 | ✅ Done | Claim confirmed: S3 at the seam fails 2 tests. Five more seam mutants (R1-R5) are all killed |
| T16 | ✅ Done | Claim confirmed: the pre-fix code fails 14f2 (`l023` -> `l101`), and V1 reproduces that exactly. Section 11 keeps its 1 s timing (`smoke-files-diff.mjs:892`) |
| T17 | ✅ Done | Claim confirmed: the focused smoke passes 19/19 on HEAD in my own run. The author's full run log (`t17-full-drive.log`) reads 64/64, with 14f2 as check 52 |

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`, then `npx electron-vite build`, run by the Verifier on the real tree at `4d48cdc` before any sensor work.
- **Measured**: typecheck exit 0. Lint exit 0 with **0 errors / 18 warnings**, all in four files outside the diff (`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`). **1729 / 1729 tests, 90 files.** `electron-vite build` exit 0.
- **Test count before feature**: 1680. **After round 1**: 1721. **Now**: 1729.
- **Delta**: +49 over the feature, +8 since round 1 (T13 2, T14 1, T15 5). No test was deleted or weakened.
- **Skipped tests**: none.
- **Focused CDP smoke** (`run_diff_smoke.py … fold`, fresh seed, fresh app on a throwaway user data dir): **19 / 19** on HEAD (the `BASE` run below).
- **Full smoke**: not re-run, per the owner's instruction. Nothing gave a reason to doubt sections 1-13. The only change there since round 1 is section 11 dropping the scroll comparison, which read 0 -> 0 (see the judgment on 14f2). The author's log `t17-full-drive.log` shows 64/64.

---

## Spec-Anchored Acceptance Criteria

Smoke cites are the line of the `check(` call in `scripts/smoke-files-diff.mjs`. Unit cites are the `it(`
line. `files-view.test.ts` has not changed since round 1, so its cites carry over.

| ID | Criterion | Spec-defined outcome | `file:line` + assertion | Status |
| -- | --------- | -------------------- | ----------------------- | ------ |
| FOLD-01 | First show, no choice → every region folds | Strips exactly per the strip rule | `diff-view.test.ts:399` `toEqual([both(1,17), both(24,177), both(184,202)])`; `smoke-files-diff.mjs:1359` `strips === 3` / `2` | ✅ |
| FOLD-02 | Folded + still exists → stays folded | The same folds | `diff-view.test.ts:603` `toEqual(split.map(whole))`; `smoke-files-diff.mjs:1373` 4 strips, probe kept; `:1475` diff tab `7 -> 8`, probe kept | ✅ |
| FOLD-03 | Revealed by hand + still exists → stays revealed; "exists" = shares a left-side line | Still revealed, matched by the left side | `diff-view.test.ts:609` `[whole(A), open(B1), open(B2), whole(C)]`; `:629` the moved region stays `{200,250}` folded (kills U10); `smoke-files-diff.mjs:1424` `strips === 4 && shows(l050)` | ✅ |
| FOLD-04 | New region, choice ≠ Show → folds | Folded | `diff-view.test.ts:657` `whole(fresh)` for `null` and `'hide'`; `:641` a touching left span is new → `[whole(touching)]` (kills U15); `smoke-files-diff.mjs:1404` `2 -> 3` | ✅ |
| FOLD-05 | Partial reveal keeps top / bottom, clamped; split halves keep both | Exact counts | `diff-view.test.ts:676` `{44,87}, {124,167}` (split, both counts); `:683` clamp `{97,97}`, `{34,34}`; read side `:536` | ✅ as a rule (no smoke, within the plan's evidence split) |
| FOLD-06 | Merged region revealed iff a source was revealed **whole** | Revealed / folded | `diff-view.test.ts:689` `[open(B)]` / `[whole(B)]`; `:648` partial source only → `[whole(B)]` (kills U07) | ✅ |
| FOLD-07 | Left side changed → as a new diff | Folded, or the tab's choice | `diff-view.test.ts:694` `split.map(whole)` / `split.map(open)`; `:702` | ✅ as a rule. The wiring (`DiffViewer.tsx:230`) is code-only, as in round 1 |
| FOLD-08 | Two changes before the recompute → the first reading is kept | The pending reading returned unchanged | `diff-view.test.ts:755` `toBe(pending)`; `:764` the press marker `toBe(pressed)` | ✅ for the rule (S3, R1, R2 killed). The call site `DiffViewer.tsx:306-311` is code-only (V8, Residuals) |
| FOLD-09 | Updates within 1 s, scroll kept | ≤ 1000 ms; the same first line on screen | `smoke-files-diff.mjs:892` `arrivedAfter <= 1000`; `:1475` `tabArrived.after <= 1000`; `:1528` `scrolledTo !== lineOneAt && keptAt === scrolledTo` (`l023` -> `l023`) | ✅ (V1, V2, V4, V5, V6 killed) |
| FOLD-10 | Strip settings 3 / 3 / 20, rule uses the same | Exact values | `diff-view.test.ts:388` `toEqual({contextLineCount: 3, minimumLineCount: 3, revealLineCount: 20})`; one constant at `DiffViewer.tsx:195` | ✅ |
| FOLD-11 | Header shows Hide / Show beside Expand / Collapse | Order and labels | `smoke-files-diff.mjs:1596` `toggles` equal to the four labels | ✅ |
| FOLD-12 | Hide folds every region, hand-revealed ones included | Every strip back | `diff-view.test.ts:734`; `files-view.test.ts:380`; `smoke-files-diff.mjs:1611` other `3 -> 2 -> 3` | ✅ |
| FOLD-13 | Show reveals every region | 0 strips | `diff-view.test.ts:742`; `smoke-files-diff.mjs:1638` `strips === 0` | ✅. On other.ts, 14k goes through the mount path (round 1 note), so the press path is proven on long.ts |
| FOLD-14 | An editor gained after a press opens in that state | The choice applied on mount | `smoke-files-diff.mjs:1667`; `files-view.test.ts:374`, `:388` | ✅ |
| FOLD-15 | Show chosen + new region → revealed | Revealed | `diff-view.test.ts:668` `open(fresh)`; `smoke-files-diff.mjs:1667` split 0 strips | ✅ |
| FOLD-16 | A hand change after a press changes only that strip | Count − 1, the other section unchanged | `smoke-files-diff.mjs:1627` | ✅ |
| FOLD-17 | Commit tab Hide / Show | Fold / reveal every section | `smoke-files-diff.mjs:1810` | ✅ |
| FOLD-18 | The diff tab toolbar shows both buttons | Present in the tab, absent in All changes' toolbar | `smoke-files-diff.mjs:1766` | ✅ |
| FOLD-19 | Leave a tab and come back → last choice | Still revealed | `smoke-files-diff.mjs:1766` `tabBack.strips === 0` | ✅ |
| FOLD-20 | A lens switch keeps All changes' choice | 0 strips | `smoke-files-diff.mjs:1705` | ✅ |
| FOLD-21 | Close drops the choice | Folded again | `files-view.test.ts:423`, `:430`; `smoke-files-diff.mjs:1766` | ✅ |
| FOLD-22 | Memory only | No `"unchanged"` in the config | `smoke-files-diff.mjs:1783` | ✅ |
| FOLD-23 | A remount opens folded, without hand reveals | 8 → 7 → 8 | `smoke-files-diff.mjs:1559` | ✅ |
| FOLD-24 | Files with nothing to fold are unchanged by both buttons | Reads as today | `smoke-files-diff.mjs:1720` added file `0 -> 0` | ⚠️ As in round 1: only the added file is exercised; the other kinds rest on code |
| FOLD-25 | Unreadable fold state → as today, no throw | No reading | `diff-view.test.ts:497`, `:503`, `:508` `toBeNull()`; `:774` `readingBeforeUpdate(...) toBeNull()` (R4 killed) | ✅ |
| FOLD-26 | A write through an empty file → fresh folds | Every region folded, or the choice | `diff-view.test.ts:707` | ✅ as a rule |
| FOLD-27 | A press with no editor mounted is remembered | Applied on expand | `files-view.test.ts:407`; `smoke-files-diff.mjs:1691` | ✅ |

**Status**: ✅ All 27 ACs are covered by evidence that can fail. FOLD-24 has a coverage caveat carried over
from round 1. FOLD-07's wiring and FOLD-08's call site rest on code, inside the plan's evidence split. There
are no spec-precision gaps left: FOLD-06 and FOLD-05's split case are now stated.

---

## Discrimination Sensor

**Baseline**: `git status --porcelain` was empty before the sensor.

- **Unit mutants** ran in a throwaway `git worktree` at HEAD (`vfold2-sensor-wt` in the scratchpad), with a junction to `node_modules`. The junction was removed first, then the worktree with `--force`, then a prune. `git worktree list` shows only the main checkout.
- **Smoke mutants** changed `DiffViewer.tsx` in the real tree through a `.orig` copy restored in `finally`, and each anchor count was asserted to be 1.
- **Afterwards**: `git diff -- src/` is empty and no `.orig` file is left. No `fold-smoke-userdata` electron process remains. The only change in the tree is this round's own `spec.md` traceability edit, made on purpose during the run.

Scripts in the session scratchpad: `verifier2_unit_sensor.py` and `verifier2_smoke_mutants.py`.

### Unit mutants (`diff-view.test.ts` and `files-view.test.ts`, 126 tests; the baseline in the worktree was green)

| # | Target | Mutation | Killed? |
| - | ------ | -------- | ------- |
| U01-U06, U08, U09, U11-U14, U16 | round 1 set | as in round 1 (re-run for regression) | ✅ All killed |
| U07 | `foldPlan` merge | A partly revealed source counts as revealed | ✅ Killed by `:648` only |
| U10 | `foldPlan` matching | Regions matched by right-side overlap | ✅ Killed by `:629` only |
| U15 | `overlaps` | `<` → `<=` (touching spans overlap) | ✅ Killed by `:641` only |
| S3 | `readingBeforeUpdate` | `if (pending !== null) return pending` removed | ✅ Killed by `:755`, `:764` |
| R1 | `readingBeforeUpdate` | A pending press marker (`states: null`) is replaced by a new reading | ✅ Killed by `:764` |
| R2 | `readingBeforeUpdate` | A pending reading keeps its states but takes the new left text | ✅ Killed by `:755`, `:764` |
| R3 | `readingBeforeUpdate` | Unknown regions (`null`) still give a reading | ✅ Killed by `:770` |
| R4 | `readingBeforeUpdate` | An unreadable state still gives a reading, read as all revealed (FOLD-25) | ✅ Killed by `:774` |
| R5 | `readingBeforeUpdate` | The reading records the wrong left text | ✅ Killed by `:779` |

### Smoke mutants (focused `SMOKE_ONLY=fold`, fresh seed and fresh launch each, `DiffViewer.tsx` at HEAD lines)

| # | Line | Mutation | Killed? |
| - | ---- | -------- | ------- |
| BASE | - | none | 19 / 19 PASS; 14f2 `l017` → wheel `l023` → after the write `l023` |
| V1 | `:236` | The restore after `applyFolds` dropped (the author's `drop-fold-scroll`, re-run) | ✅ Killed by 14f2 only: `l101` |
| V2 | `:231`, `:236` | The offset restored **before** `applyFolds` | ✅ Killed by 14f2 only: `l057` |
| V3 | `:313` | The offset recorded on every change, not only with a new reading | ❌ Survived: equivalent, see Residuals |
| V4 | `:313` | The offset recorded as 0 | ✅ Killed by 14f2 only: `l017` |
| V5 | `:235-237` → `:242` | The restore moved to the choice (mount) path only | ✅ Killed by 14f2 only: `l101` |
| V6 | `:317` | `pendingScrollRef` cleared by the content effect, right after the immediate restore | ✅ Killed by 14f2 only: `l101` |
| V7 | `:224` | `pendingScrollRef` cleared on an `onDidUpdateDiff` that arrives before the worker answers | ❌ Survived: equivalent, see Residuals |
| V8 | `:307` | The call site passes `null` for the pending reading (S3 moved to the caller) | ❌ Survived: the known FOLD-08 window, see Residuals |

**Sensor depth**: lightweight plus. 22 unit and 8 smoke mutants, over T13-T17's code and a regression pass
of round 1's set.
**Sensor outcome**: 22 of 22 unit mutants killed. 5 of 8 smoke mutants killed. Two survivors are equivalent,
and one is a residual accepted as the round 1 bar. Every mutant that changes behaviour in a reachable path
was killed.

---

## Judgments asked for explicitly

1. **Round 1's survivors against the pure seam.** U07, U10 and U15 each fail only the test T13 / T14 added
   for them. S3, run against `readingBeforeUpdate`, fails the two FOLD-08 tests. The T13-T15 claims hold.
2. **T15 and T17 mutants.** Faults that change what the tab shows after a refresh all fail 14f2, each with
   a different wrong line:
   - the restore dropped (V1);
   - the restore moved before `applyFolds` (V2);
   - the wrong offset recorded (V4);
   - the restore only on the choice path (V5);
   - the offset cleared too early (V6).
   The seam's own rules are all killed (R1-R5).
3. **14f2 can fail, and its preconditions are real.**
   - It reads the first line on screen by DOM position, per L-068, not `scrollTop`.
   - It requires the wheel to move that line (`scrolledTo !== lineOneAt`, `l017` -> `l023`).
   - It requires the new diff to arrive (`scrollArrived.after !== null`, strip labels changed).
   - It compares after `settled` (the strip count still for 600 ms), so it reads the final state, not the
     transient.
   - The write changes line 170 only, below the screen, so the check isolates the fold-then-scroll
     ordering, which is where the defect was.

   A remount would reset the tab to its top (`l017`), and V4 shows that fails, so the check does not need
   the probe re-asserted. Its limits:
   - it scrolls about 6 lines;
   - it covers a single file's diff tab, not the All changes stack, whose scroll is the outer container's;
   - a change **above** the screen is not exercised. The spec does not define "scroll kept" for that case
     (a pixel offset kept is one reading).
   None of these limits is a gap against FDIF-30's "its diff … keep its scroll position".
4. **Dropping section 11's scroll claim loses nothing.** That comparison read
   `.monaco-scrollable-element.scrollTop` on a three-line file, which stays 0 under virtual scrolling
   (round 1). It could not fail. Section 11 keeps its timed ≤ 1 s check (`smoke-files-diff.mjs:892`). The
   author's full run shows it passing in 663 ms, with 14f2 passing as check 52.
5. **Still open from round 1.** None of these blocks the verdict:
   - FOLD-24 exercises the added file only;
   - FOLD-07's wiring (`DiffViewer.tsx:230`) has no smoke check;
   - 14k's other.ts half proves the mount path, not the press path;
   - T7's press-during-pending decision stays code-only at `DiffViewer.tsx:329`. The marker it sets is
     now pinned to survive a second change (`diff-view.test.ts:764`).

---

## Residuals (not gaps)

- **V8, the FOLD-08 call site.** The pure rule is covered. The argument `DiffViewer.tsx:307` passes into it
  is not, and neither the unit tests nor the smoke can see a caller that passes `null`. The path is the same
  one round 1 measured as out of reach of a disk write at this file size: 250 ms watcher batches against a
  recompute of about 230 ms. Round 1's Fix 2 set its bar as "a mutant of the guard inside the pure function
  is killed", and that bar is met. Low risk: when the window is reached on a large file, a second reading
  mostly equals the first (round 1, judgment 1).
- **V3, equivalent by value.** Recording the offset on a second change only matters inside the same
  unreachable window. Even there, the second change reads the offset the first change had just restored
  (`DiffViewer.tsx:317`), which is the same value unless Monaco clamped it.
- **V7, equivalent, shown by the run.** 14f2 still passed with the clear in place, so the restore still
  ran. Monaco therefore sends no uncomputed `onDidUpdateDiff` between `setValue` and the recompute on this
  path, and the mutated branch never runs while an offset is pending.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ `readingBeforeUpdate` is 5 lines and replaces the inline guard; T17 adds one ref, one restore and one clear per lifecycle end |
| Surgical changes | ✅ Since round 1: `diff-view.ts` (+29), `DiffViewer.tsx` (+26 / −19), the two test / smoke files, and the spec and tasks |
| No scope creep | ✅ The scroll fix is the one the owner put in this PR |
| Matches patterns | ✅ Pure seam per L-018; the scroll read per L-068 |
| Spec-anchored outcome check | ✅ FOLD-06 and the FOLD-05 split case are now stated and pinned |
| Per-layer coverage expectation | ✅ Every pure rule is 1:1 (FOLD-08 via the seam); components by CDP smoke, per `.specs/codebase/TESTING.md` |
| Every test maps to a spec requirement | ✅ The new tests carry FOLD IDs, except `diff-view.test.ts:770` (null regions), which maps to T15's Done-when |
| Documented guidelines followed: `.specs/codebase/TESTING.md` | ✅ |

---

## Edge Cases

- [x] Remount opens folded or in the choice (FOLD-23): 14g
- [~] Files with nothing to fold (FOLD-24): the added file is exercised; the other kinds rest on code
- [x] Unreadable fold state (FOLD-25): `hiddenRangesOf` and `readingBeforeUpdate` tested
- [x] Write through an empty file (FOLD-26): rule tested
- [x] Press with nothing mounted (FOLD-27): 14m

---

## Fix Plans

None required. Optional, for the owner:
- a CDP check of the All changes stack's outer scroll across a refresh;
- moving the "new reading → record the offset" decision into the seam's return value, so that V3 and V8
  become unit-visible.

---

## Requirement Traceability Update

| Requirement | Previous status | New status |
| ----------- | --------------- | ---------- |
| FOLD-03 | ❌ Needs evidence (Fix 1) | ✅ Verified (T13) |
| FOLD-06 | ❌ Needs evidence (Fix 3) | ✅ Verified (T14) |
| FOLD-08 | ❌ Needs evidence (Fix 2) | ✅ Verified (T15 rule; call site by code) |
| FOLD-09 | ⚠️ 1 s half only | ✅ Verified (T16, T17 / 14f2) |
| FOLD-04, 05, 25 | ✅ Verified | ✅ Verified (T13, T14, T15 added to phase) |
| All other FOLD IDs | ✅ Verified | ✅ Verified (unchanged) |

`spec.md` is updated, LF with 0 CR, and `validate_spec.py` gives 0 errors and 0 warnings.

---

## Summary

**Overall**: ✅ Ready.

**Spec-anchored check**: 27 of 27 ACs have evidence that can fail. There are no spec-precision gaps. FOLD-24
carries its round 1 coverage caveat.
**Sensor**: 27 of 30 mutants killed. 22 of 22 are unit mutants. On the smoke side, 5 of 8 are killed, V3 and
V7 are equivalent, and V8 is a residual at round 1's bar.
**Gate**: 1729 / 1729 tests, lint 0 errors / 18 warnings (the baseline), typecheck and build exit 0, and the
focused smoke 19 / 19.

**What works**:
- Folds, hand reveals and partial reveals survive refreshes, matched by left-side lines.
- New regions follow the tab's choice, and a merge of partial reveals folds.
- The first reading is kept while an update is pending.
- A diff tab keeps the same first line on screen across a refresh.
- Hide and Show behave as round 1 verified.

**Next steps**: none required for this feature. The optional items are under Fix Plans.
