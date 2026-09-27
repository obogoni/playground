## Validation: files-status-glyphs — FAIL

> **Owner decision, 2026-09-27, after this report.** The owner accepted Fix 10 (W4 / W4h) as a recorded limit, as Fix 8 was, and chose to ship. The Verifier's verdict above stays FAIL and is not rewritten: the feature ships with two accepted smoke limits, both recorded in `spec.md`'s Assumptions table. No production code changed after round 1 (`git diff --stat 24ee061..HEAD -- src` is empty). The follow-ups below (W6h, W5h, the Requirement Coverage row) are not done in this branch. `validate_state.py` rejects this report by design, since its verdict is FAIL.

**Date**: 2026-09-27 (round 4: the owner's one focused round after the round 3 escalation)
**Spec**: `.specs/features/files-status-glyphs/spec.md` (FSTS-01..23, three edge cases)
**Diff range**: feature `2756248..HEAD`. The fix round is `83c0f6e..HEAD` (`20d1048` T18, `17d02f2` T19). It changes `scripts/smoke-files-diff.mjs` and `.specs` only, and no production file has changed since `24ee061` (`git diff --stat 24ee061..HEAD -- src` is empty)
**Verifier**: independent sub-agent (author ≠ verifier). Scope set by the owner: check that T18 and T19 close round 3's gaps without opening new ones in what they touched. Fix 8's limit (V6, V6h) is accepted and does not fail this verdict. Every smoke mutant ran in focused mode (`SMOKE_ONLY=glyphs`), each on a fresh seed and a fresh `--user-data-dir`, through an `.orig` copy restored in `finally`, with every anchor asserted exactly once. `git status --porcelain` was `''` before and after every run. The driver is `fv4_mutants.py` and the logs are `fv4-<id>-drive.log` in the session scratchpad

**Why FAIL**: every round 3 gap is closed. V1, V1h, V4, V4h and T-b are each killed, and so are my 1 px overlap, zero-width, counts-over-path and two width-leak mutants. One new pair survives inside T18's own rule:
- **W4 / W4h**: the glyph is pulled 12 px out of its end group (`.file-tree-end .status-glyph { margin-left: -12px }`, the same in the header). The end group's box shrinks to 4 px and still ends where it should. The glyph's right edge stays at the padding. The glyph's own box now runs **6.0 px into the name** in the tree and **4.0 px into the counts** in the headers (probe `fv4-P-W4-glyph-drive.log`; HEAD reads −6.0 and −8.0 px). All 19 checks pass.

`LAYOUT` (smoke:956) compares the row's direct children, so it reads the end group's box, not the glyph's. The rule's doc comment says "nothing is drawn under the glyph", and that is what W4 and W4h break. It is the same harm class as V4h (the counts under the glyph, FSTS-16 "after the counts"), and a smaller one (4–6 px against 16 px). The fix is smoke-only and small (Fix 10).

---

## Round 1: how each gap was closed

| Round 1 gap | Closed by | Status |
| ----------- | --------- | ------ |
| FSTS-21 had no runtime assertion (S8b) | T11, check 18 | ✅ closed (round 2) |
| Header tones unasserted (S11) | T12, check 15 | ✅ closed (round 2) |
| Ellipsis unasserted (S10) | T13, T15 | ✅ closed (round 3). Where it is drawn was closed by T18 (this round) |
| A glyph hidden until hover passed (S7) | T14, checks 8, 16, 18 | ✅ closed (round 2) |
| T5 row height; focused mode for the full drive; ancestor strike | measured, then accepted | accepted. The `opened` flag's misleading log was fixed by T19 (`clicked`, smoke:1544) |

## Round 2: how each gap was closed

| Round 2 gap | Closed by | Status |
| ----------- | --------- | ------ |
| Fix 5: R5, R5h (`text-overflow` alone read) | T15 `ellipsisFaults` | ✅ closed (round 3) |
| Fix 6: no commit path cut; R7 | T16 `LONG_GUIDE`, `narrowUntilCut`, check 19 | ✅ closed (round 3) |
| R6 broke no AC | T17, FSTS-22/23, checks 9 and 17 | ✅ closed (round 3), with the Fix 8 limit (see Round 3) |

## Round 3: how each gap was closed

| Round 3 gap | Fix | My evidence (`fv4-<id>-drive.log`) | Status |
| ----------- | --- | ----------------------------------- | ------ |
| Fix 7: V1, V4 (name under the glyph) | T18 `LAYOUT` (smoke:956) read in `treeRows` (smoke:997-998); `columnFaults` faults a children count other than `wantChildren` and any overlap > 0.5 px (smoke:1052) | V1 fails 3, 4, 5 (`file-tree-name over file-tree-end by 34.0 px`). V4 fails 3, 4, 5 (16.0 px) | ✅ closed |
| Fix 7: V1h, V4h (path over the counts, counts under the glyph) | the same rule in `stackHeaders` (smoke:1332-1333) | V1h fails 11, 12, 14, 18, 19 (52.0 px). V4h fails 11, 12, 14, 18, 19 (`diff-section-counts over diff-section-end by 16.0 px`) | ✅ closed. W4h shows the rule reads the end group, not the glyph (Fix 10) |
| Fix 8: V6, V6h (fit samples far from their bound) | not fixed; the Assumptions row at spec:45 | not re-run | ✅ accepted by the owner, 2026-09-27 |
| Fix 9: T-b (narrowing not cleared, unasserted) | T19: `widthBefore` (smoke:1581), `widthAfter` (smoke:1601); `restored` requires `widthBefore > 900` and the two equal (smoke:1605) | T-b fails 18 (`width 1266 px before the narrowing, 900 px after`) | ✅ closed |
| Cosmetic: T17's **What**, the Phase Execution Map, the `opened` flag | T19 | T17 now names the Range. The map counts nineteen tasks. Check 18 logs `open button clicked true; commit tab active true (…)` | ✅ closed |

---

## Task Completion

T1–T19 are all checked off, and none is blocked or partial. I checked the T18 and T19 Result blocks against the diff and my own logs.

| Task | Claim | Finding |
| ---- | ----- | ------- |
| T18 | `LAYOUT` in both reads; `columnFaults` faults a wrong visible-children count and an overlap > 0.5 px; checks 3, 4, 5, 11, 12, 14, 18 and 19 inherit it; V1, V1h, V4, V4h fail | Confirmed (smoke:956-968, :997-999, :1052-1056, :1332-1334). HEAD logs `children 3/3` (tree) and `4/4`, `3/3` (headers), worst overlap −6.0 and −8.0 px. **Limit**: the end group is measured as one box, so a glyph that leaves it is not seen (W4, W4h: Fix 10) |
| T19 | `restored` requires the width back; T-b fails 18; notes fixed; Fix 8 row in `spec.md` | Confirmed. W7 (left at 1100 px) and W8 (never cleared, so 900 before and after) each fail 18. W8 is failed by the `> 900` guard alone, so the guard is necessary |
| Gate | 1784 tests; lint 0/18; typecheck, build; `validate_spec` 0 errors | Re-run by me with the same numbers (Gate Check) |

Cosmetic: the Requirement Coverage row for FSTS-20 in `tasks.md` names T18 in its evidence but not in its Tasks column.

---

## Spec-Anchored Acceptance Criteria

`smoke:N` = `scripts/smoke-files-diff.mjs:N` at `17d02f2`, the line where the `check(` call starts. Focused numbering: tree 1–9 (smoke:1189, :1202, :1211, :1228, :1246, :1257, :1265, :1274, :1289), headers 10–17 (smoke:1415, :1426, :1439, :1455, :1466, :1481, :1494, :1509), commit tab 18–19 (smoke:1611, :1627). The full drive numbers them 20–38. `unit` = `src/renderer/src/lib/change-status.test.ts`.

| AC | Spec-defined outcome | `file:line` + assertion | Verdict |
| -- | -------------------- | ----------------------- | ------- |
| FSTS-01 | glyph last, right edge within 1 px of the padding | smoke:1211, :1228 `columnFaults` (smoke:1044): `glyphs === 1`, `last`, `abs(right − edge) ≤ 1`. Killed in earlier rounds: S3, S4, R1, t9 c | ✅ |
| FSTS-02 | same edge within 1 px, any depth | the same function's spread `≤ 1`; check 4 reads depths 0 and 1 | ✅ |
| FSTS-03 | one glyph per file row | `item.glyphs !== 1`. Killed: S3 | ✅ |
| FSTS-04 | a name too wide is cut with an ellipsis; the glyph keeps its place | smoke:1246 `ellipsisFaults(longRow)` and `columnFaults([longRow, …])` with the overlap rule. Killed: R5, S10, V2t, V1, V4, W1 (a 1 px overlap) | ❌ GAP. **W4 survives**: the glyph box runs 6.0 px into the name, over the cut name's ellipsis |
| FSTS-05 | no glyph on folder rows | smoke:1257, `folderGlyphs.length === 0` | ✅ |
| FSTS-06..10 | `+` green, `M` amber, `D` red, `R` accent, `U` muted, painted | unit:7-15; tones smoke:1202, :1481; painted smoke:1274, :1494, inside :1611. Killed: S1, S11, R4, S7, R1 | ✅ |
| FSTS-11 | tooltip names the status | unit:14; smoke:1189, :1228, :1415, :1439, :1611 | ✅ |
| FSTS-12 | one shared mapping | `change-status.ts`, imported at `FileTree.tsx:7`, `DiffSection.tsx:5`, `StatusGlyph.tsx:3` | ✅ |
| FSTS-13..15 | only the deleted name is struck | unit:18-21; smoke:1265 | ✅ |
| FSTS-16 | the header glyph is last, **after the counts**, at the padding | smoke:1426 `headerFaults` with the overlap rule. Killed: t10 b, t10 c, V4h, W2h, W3h | ❌ GAP. **W4h survives**: the glyph box runs 4.0 px into the counts |
| FSTS-17 | same edge, headers without counts included | smoke:1439 (`binary.counts === null`, `widths.size ≥ 2`). Killed: S5 | ✅ |
| FSTS-18 | one glyph, nothing before the path | smoke:1415, :1426 (`glyphs === 1`, `pathSecond`) | ✅ |
| FSTS-19 | only the path struck | smoke:1455. Killed: d, S9 | ✅ |
| FSTS-20 | a path too wide is cut with an ellipsis; the glyph keeps its place | smoke:1466 `ellipsisFaults(long)` at 900 px plus `headerFaults`. Killed: R5h, S10h, V2, V1h, W1h | ✅. The seeded cut paths all have counts, so W4h's harm lands on the counts (FSTS-16), not on a cut path |
| FSTS-21 | commit-tab headers follow 16–20 | smoke:1611 (with `restored`, smoke:1605) and smoke:1627. Killed: S8b, R2, R3, R7, T-a, T-b, W7, W8, V1h, V4h | ✅ for the commit-specific clauses. It inherits FSTS-16's gap (W4h passes 18 and 19) |
| FSTS-22 | a name that fits shows whole | smoke:1289 `fitFaults` with ≥ 47 fitting. Killed: R6, V3, V3b, V3s, T-c (round 3) | ✅, with Fix 8's limit accepted (spec:45) |
| FSTS-23 | a path that fits shows whole | smoke:1509. Killed: R6h, V3h, T-c (round 3) | ✅, with Fix 8's limit accepted (spec:45) |

**Status**: ❌ FSTS-04 and FSTS-16 have a surviving mutant each (W4, W4h), and FSTS-21 inherits FSTS-16. The other 20 ACs have `file:line` evidence that is shown to fail on a mutant. FSTS-22 and FSTS-23 carry the owner-accepted limit.

### Can T18's children-count precondition pass while a child is missing?

- **Zero-width or hidden: no.** A child is counted only with a box wider and taller than 0 and not `visibility: hidden`. W2h (counts `width: 0`, still in the DOM) fails 11, 12, 14, 18 and 19 with `3 of 4 children visible`, and the worker's P (chevron hidden) does the same.
- **Tree rows: no.** `wantChildren` is a constant 3 (smoke:998), so a missing icon, name or end group fails.
- **Header counts not rendered: yes.** `wantChildren: counts ? 4 : 3` (smoke:1333) reads the same DOM it checks. W6h drops the counts from `src/modified.ts` only, and all 19 checks pass (`children 4/4, 3/3`). The counts belong to the diff feature (FDIF), not to FSTS, so this is a follow-up, not a gap here.
- **Painted away, box kept: yes, by construction.** `opacity: 0` or a transparent colour keeps the box, so the child counts. That is outside what the count is for. The count proves the overlap read sees the right boxes, not that they are painted.

---

## Discrimination Sensor

Each run is a fresh seed and a fresh `--user-data-dir`, under `SMOKE_ONLY=glyphs`. BASE is 19/19 in 36 s.

| # | File:line | Mutation | Failing checks (focused 1–19) | Killed? |
| - | --------- | -------- | ----------------------------- | ------- |
| V1 | `FileTree.css:104` | name `margin-right: -40px` | 3, 4, 5 | ✅ |
| V1h | `DiffSection.css:43` | path `margin-right: -60px` | 11, 12, 14, 18, 19 | ✅ |
| V4 | `FileTree.css:87, :134` | end group absolute, `right: 8px` | 3, 4, 5 | ✅ |
| V4h | `DiffSection.css:18, :78` | end group absolute, `right: 10px` | 11, 12, 14, 18, 19 | ✅ |
| T-b | smoke:1391 (test-side) | the commit call's override not cleared | 18 (`1266 px before, 900 px after`) | ✅ |
| W1 | `FileTree.css:104` | name `margin-right: -7px`: exactly 1 px of overlap (the gap is 6 px) | 3, 4, 5 (`by 1.0 px`) | ✅ |
| W1h | `DiffSection.css:43` | path `margin-right: -9px`: exactly 1 px (the gap is 8 px) | 11, 12, 14, 18, 19 (`by 1.0 px`) | ✅ |
| W2h | `DiffSection.css:54` | counts `width: 0; overflow: hidden`: present, zero-width | 11, 12, 14, 18, 19 (`3 of 4 children visible`) | ✅ |
| W3h | `DiffSection.css:54` | counts `position: relative; left: -20px`: drawn over the path | 11, 12, 14, 18, 19 (`diff-section-path over diff-section-counts by 12.0 px`) | ✅ |
| **W4** | `FileTree.css:134` | `.file-tree-end .status-glyph { margin-left: -12px }` | **19/19 pass**. Probe: glyph box 6.0 px into the name | ❌ Survived → Fix 10 |
| **W4h** | `DiffSection.css:78` | `.diff-section-end .status-glyph { margin-left: -12px }` | **19/19 pass**. Probe: glyph box 4.0 px into the counts | ❌ Survived → Fix 10 |
| W5h | `DiffSection.css:54` | counts `width: 10px`, overflow visible: the text spills under the glyph | 12 only, by its `widths.size ≥ 2` guard (`count widths 10`), not by the overlap rule | ✅ incidentally (follow-up) |
| W6h | `DiffSection.tsx:129` | counts not rendered for `src/modified.ts` | 19/19 pass (`children 4/4, 3/3`) | ⚠️ Survived: outside FSTS (follow-up) |
| W7 | smoke:1391 (test-side) | the commit call leaves the window at 1100 px | 18 (`1266 px before, 1100 px after`) | ✅ |
| W8 | smoke:1391 (test-side) | no narrowing ever cleared | 18 (`900 px before, 900 px after`: the `> 900` guard) | ✅ |

**Probes** (read-only lines added to `LAYOUT`): P-BASE-glyph reads the glyph box −6.0 px from the name and −8.0 px from the counts (a gap). P-W4-glyph reads +6.0 and +4.0 px (drawn over), while the rule's own overlap still reads −6.0 and −8.0.

**Sensor depth**: lightweight+ (5 re-runs, 10 new mutants, 2 probes).
**Sensor verdict**: FAIL. 12 of 15 are killed. W4 and W4h survive with visible harm inside T18's rule. W6h survives outside FSTS.

`git status --porcelain` was `''` before, after every mutant and probe, and at the end.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code: one `LAYOUT` read, one `layoutDetail` log helper, two width reads | ✅ |
| Surgical: the smoke script and `.specs` only | ✅ |
| No scope creep | ✅ |
| Matches patterns: `check(label, ok, detail)`, FSTS ids in labels | ✅ |
| Spec-anchored outcome check | ❌ FSTS-04 and FSTS-16: the overlap rule reads the end group's box, not the glyph's |
| Per-layer coverage: the mapping 1:1 in unit tests, components in the smoke | ✅ except the gap above |
| Every test maps to an AC, edge case or Done-when | ✅ |
| Documented guidelines: `.specs/codebase/TESTING.md` | ✅ |

---

## Edge Cases

- [x] Mixed depths 0 and 1 share one column: smoke:1228
- [x] A binary header without counts keeps the column: smoke:1439 (`logo.bin counts null`, `children 3/3`)
- [x] The same glyph, tooltip and tone in both lists: smoke:1202, :1228, :1481

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`, plus `npx electron-vite build`, re-run by me after the mutants (`fv4-*.log`)
- **Outcome**: typecheck exit 0; lint exit 0 with 0 errors and 18 warnings (the baseline); vitest 1784 passed, 0 failed, 0 skipped in 93 files; build exit 0
- **Test count before the feature**: 1778 (92 files). **After**: 1784 (93 files). **Delta**: +6, none removed; this fix round added no unit tests
- **Smoke**: focused BASE 19/19 (`fv4-BASE-drive.log`, 36 s). Per the owner I did not re-run the full drive; the worker's `fr3-full-drive.log` is 48/48, with check 37 reading `restored true (width 1266 px before the narrowing, 1266 px after)`
- **Validators**: `validate_spec` 0 errors, 0 warnings. `validate_tasks` 0 errors, 8 warnings (T19's is new and of the existing "Where names multiple files" kind)

---

## Fix Plans

### Fix 10: measure the glyph, not only its end group (FSTS-04, FSTS-16; FSTS-21 inherits), Minor

- **Root cause**: `LAYOUT` (smoke:956) takes the row's or header's direct children, and the end group counts as one box. A glyph can leave that box (a negative margin, a transform, an absolute offset inside it) while the box and the glyph's right edge both hold.
- **Fix task**: in `LAYOUT`, put the end group's own visible children in its place in `kids`, so the overlap is read against the glyph box (and, later, against #132's discard action). `wantChildren` stays 3 for a tree row, and 4 or 3 for a header, while the end group holds only the glyph. The alternative is one more pair: the child before the end group against the glyph's box.
- **Verify**: W4 fails 3, 4 and 5. W4h fails 11, 12, 14, 18 and 19. V1, V1h, V4, V4h, W1 and W1h still fail. HEAD stays 19/19. Driver: `fv4_mutants.py W4-glyph-out-of-end W4h-glyph-out-of-end`.

### Follow-ups (outside this round's scope, not part of the verdict)

- **W6h**: a header's `wantChildren` reads the counts from the same DOM it checks. Take it from the seed instead (only `assets/logo.bin` has no counts). The counts are FDIF's.
- **W5h**: the rule reads boxes, not ink. Counts that spill out of a narrow box are caught only when every header's counts share one width. A `scrollWidth > clientWidth` check on the counts would close it.
- **Threshold**: an overlap of 0.5 px or less passes by design. W1 and W1h show 1 px fails.
- **Cosmetic**: the FSTS-20 row of `tasks.md`'s Requirement Coverage table should list T18 under Tasks.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FSTS-01..03, 05..15, 17..19 | Verified (round 3) | ✅ Verified (round 4) |
| FSTS-04 | Implementing (T18) | ❌ Needs Fix (Fix 10: W4). V1 and V4 are closed |
| FSTS-16 | Implementing (T18) | ❌ Needs Fix (Fix 10: W4h). V4h is closed |
| FSTS-20 | Implementing (T18) | ✅ Verified (V1h, W1h killed) |
| FSTS-21 | Implementing (T18, T19) | ⚠️ Commit-specific clauses verified (T-b, W7, W8); inherits Fix 10 via FSTS-16 |
| FSTS-22 | Verified, Fix 8 limit | ✅ Verified, with the limit accepted by the owner |
| FSTS-23 | Verified, Fix 8 limit | ✅ Verified, with the limit accepted by the owner |

---

## Summary

**Overall**: ❌ Not Ready. The production code is unchanged and correct. T18 and T19 close every round 3 gap, and T19 is complete. T18's rule has one blind spot: it measures the end group, not the glyph inside it.

**Spec-anchored check**: 20 of 23 ACs are fully evidenced. FSTS-04 and FSTS-16 have a survivor each, and FSTS-21 inherits FSTS-16's.
**Sensor**: 12 of 15 killed. W4 and W4h survive (Fix 10). W6h survives outside FSTS (follow-up).
**Gate**: 1784 passed, 0 failed; lint 0 errors / 18 warnings; typecheck and build exit 0.

**What works**:
- The overlap rule, down to 1 px, on the name, the path and the counts.
- The children count, against zero-width and hidden children.
- The viewport check, including its `> 900` guard.
- The fixed notes and the recorded Fix 8 limit.

**Next steps**: the owner decides: either Fix 10 (a few lines in `LAYOUT`, then W4 and W4h re-run), or accept W4 and W4h as a recorded limit, as was done for Fix 8.
