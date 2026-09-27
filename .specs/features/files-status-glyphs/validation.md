## Validation: files-status-glyphs — FAIL

**Date**: 2026-09-27 (round 3, the last before escalating to the owner)
**Spec**: `.specs/features/files-status-glyphs/spec.md` (FSTS-01..23, three edge cases)
**Diff range**: feature `2756248..HEAD`. Fix round 2 is `61a90cc..HEAD` (`3768436` T15, `6018bdf` T16, `ee50d32` T17). It changes `scripts/smoke-files-diff.mjs` and `.specs` only
**Verifier**: independent sub-agent (author ≠ verifier). Every smoke mutant ran in focused mode (`SMOKE_ONLY=glyphs`, the repo's own script), each on a fresh seed and a fresh `--user-data-dir`. Each went through an `.orig` copy restored in `finally`, with every anchor asserted exactly once. `git status --porcelain` was `''` before and after every run. I did not spend the full drive (see Round 2)

**Why FAIL**: all of round 2's gaps are closed. R5, R5h, R6, R6h and R7 are each killed by the check named for them. The production code is still correct wherever I probed it. But two new mutants of mine survive every check, and both do visible harm:
- **V4**: the tree's end group is laid over the row's end (`position: absolute; right: 8px`), as an overlay hover action might be. The name then fills the row out to the content edge, so its text and its ellipsis are drawn under the `U` glyph.
- **V4h**: the same overlay in the header. The `−0` count is drawn under the `U` glyph.

The margin twins V1 and V1h survive too. In V1 the name's box runs 40 px under the glyph; in V1h the path runs over the counts. See the screenshots below.

Every check that reads the glyph's place reads the DOM order (`last`) and the glyph's right edge. None reads whether the name, the path or the counts end before the glyph begins. The drawn-ellipsis rule (T15) proves that an ellipsis is drawn. It does not prove where the ellipsis is drawn. The fix is smoke-only again.

---

## Round 1: how each gap was closed

| Round 1 gap | Closed by | Status now |
| ----------- | --------- | ---------- |
| FSTS-21 had no runtime assertion (S8b) | T11, check 18 | ✅ S8b, R2 and R3 killed (round 2) |
| The header tones were unasserted (S11) | T12, check 15 | ✅ S11 and R4 killed (round 2) |
| The ellipsis was unasserted (S10) | T13, then T15 | ✅ S10, S10h, R5 and R5h killed. The place of the ellipsis is still open (V1, V4; Fix 7) |
| A glyph hidden until hover passed (S7) | T14, checks 8, 16 and 18 | ✅ S7 and R1 killed (round 2) |
| T5 row height; focused mode standing in for the full drive; an ancestor-level strike | measured, then accepted | unchanged. The `opened` flag in check 18's log still reads as proof that the tab opened, and it is not (cosmetic, round 2) |

## Round 2: how each gap was closed

| Round 2 gap | Fix | My evidence (`fv3-<id>-drive.log`) | Status |
| ----------- | --- | ----------------------------------- | ------ |
| Fix 5: R5 and R5h survived, because `text-overflow` alone was read | T15 `ellipsisFaults` (smoke:1064): overflows, `ellipsis`, `overflow-x` hidden or clip, `nowrap` | R5 fails 5 (`overflow-x visible`). R5h fails 14 and 19 (`overflow-x visible`) | ✅ closed |
| Fix 6: no commit path was ever cut, and R7 survived | T16 seeds `LONG_GUIDE` (smoke:145, :821); `narrowUntilCut` (smoke:1320); check 19 (smoke:1563) | R7 fails 19 only (`text-overflow clip`). T-a (the narrowing skipped) fails 19 (`overflows false`), so the cut is really exercised | ✅ closed |
| Spec-precision note: R6 broke no AC | T17 adds FSTS-22 and FSTS-23 and checks 9 and 17 | R6 fails 9 (`docs/removed.md: 69.0 px of text, scroll 69 in 40 px, 175.0 px free`). R6h fails 17 | ✅ closed. There is a boundary limit (V6 and V6h, Fix 8) |
| The full drive after the seed change | the worker's `fr2-full-drive.log` | 48/48. The glyph checks are 20–38 and the icon checks 39–48 after them. FDIF-20 reads `+84 −83` and matches git | holds. The probe P-BASE shows the viewport restored after the commit tab (`1266x715` before and after), so I had no concrete doubt to spend the one full drive on |

---

## Task Completion

T1–T17 are all checked off, and none is blocked or partial. I checked the T15–T17 Result blocks against the diff and the logs.

| Task | Claim | Finding |
| ---- | ----- | ------- |
| T15 | `ellipsisFaults` holds the drawn-ellipsis rule; checks 5 and 14 require it; R5, R5h, S10 and S10h each fail | Confirmed: smoke:1064-1074, :1200, :1413. I re-ran R5 and R5h. My V2 and V2t (`white-space: normal`) fail 5, 14 and 19 (`overflows false … white-space normal`). The rule is **not sufficient**, though: V1 and V4 satisfy all four terms (Fix 7). It is also stricter than Chromium. `white-space: pre` and `overflow: auto` would also draw an ellipsis and would fail it. That is harmless for this code |
| T16 | a long path in the branch commit; `narrowUntilCut` clears in `finally`; check 19 requires the cut; the counts are 45 | Confirmed: smoke:145, :821, :1320-1342, :1525, :1563. Check 19 reads `at 900 px, 45 headers`. The clear is real: P-BASE reads `1266x715` after the commit checks. **Limit**: no check asserts the clear. T-b (the clear skipped for the commit call) passes 19/19, and its probe reads `900x715` afterwards. The icon checks only run in the full drive, so a leaked narrowing would go unseen in focused mode (Minor, Fix 9) |
| T17 | FSTS-22/23; natural width from a Range; checks 9 and 17 with preconditions; R6 and R6h fail | Confirmed: spec:68, :124, :44; smoke:922-947, :1077-1087, :1242, :1456. One stale line: T17's **What** still says the natural width is `scrollWidth`. The Result says why that was replaced. The Phase Execution Map still reads "Ten tasks". Both are cosmetic |
| Gate | 1784 tests; lint 0/18; typecheck and build; `validate_spec` 0 errors | Re-run by me with the same numbers (Gate Check). `validate_spec`: 0 errors, 0 warnings. `validate_tasks`: 0 errors, 7 warnings, all pre-existing in kind |

---

## Spec-Anchored Acceptance Criteria

`smoke:N` = `scripts/smoke-files-diff.mjs:N` at `ee50d32`, the line where the `check(` call starts. In the focused run the tree checks are 1–9 (smoke:1143-1242), the header checks 10–17 (smoke:1362-1456) and the commit tab checks 18–19 (smoke:1549, :1563). The full drive numbers them 20–38. `unit` = `src/renderer/src/lib/change-status.test.ts`.

| AC | Spec-defined outcome | `file:line` + assertion | Verdict |
| -- | -------------------- | ----------------------- | ------- |
| FSTS-01 | glyph last, right edge within 1 px of `row.right − paddingRight` | smoke:1165, :1182 `columnFaults` (smoke:1015): `glyphs === 1`, `last`, `abs(right − edge) ≤ 1`, over 45 + 4 rows. Killed: S3, S4, R1 | ✅ for the edge. "Last" is read as DOM order only: under V4 the glyph is last and at the edge, and it is drawn over the name (see FSTS-04) |
| FSTS-02 | same edge within 1 px, any depth | the same function, `max − min ≤ 1`, with `depthsHold` | ✅ |
| FSTS-03 | one glyph per file row | `item.glyphs !== 1` (smoke:1018). Killed: S3 | ✅ |
| FSTS-04 | a name wider than its space is cut with an ellipsis, and the glyph keeps its place | smoke:1200 `ellipsisFaults(longRow)` plus `columnFaults` | ❌ GAP. R5, S10 and V2t are killed. **V4 survives** (the end group overlaid: the name and its ellipsis are drawn under the `U`), and so does **V1** (the name box runs 40 px under the glyph, and no ellipsis is visible). Nothing requires the name to end before the end group |
| FSTS-05 | no glyph on folder rows | smoke:1210, `folderGlyphs.length === 0`, guards ≥3 / ≥2 | ✅ |
| FSTS-06..10 | `+` green, `M` amber, `D` red, `R` accent, `U` muted, painted | unit:7-15; tones smoke:1156, :1428 (`toneFaultsOf`, `distinct === 5`, `seen.size === 5`, 49 glyphs); painted smoke:1227, :1441, inside :1549. Killed in rounds 1–2: S1, S11, R4, S7, R1 | ✅ |
| FSTS-11 | tooltip names the status | unit:14; smoke:1143, :1182, :1362, :1386, :1549 against `GLYPHS` | ✅ |
| FSTS-12 | one shared mapping | `change-status.ts:14-24`, imported by `FileTree.tsx:7`, `DiffSection.tsx:5` and `StatusGlyph.tsx:3`. No production change since round 1 | ✅ |
| FSTS-13..15 | only the deleted name is struck | unit:18-21; smoke:1218, `struck[0] === 'docs/removed.md:name'`, exactly one | ✅ |
| FSTS-16 | the header glyph is last, **after the counts**, within 1 px of the padding | smoke:1373 `headerFaults` over 45 headers. Killed: t10 b and c | ❌ GAP. **V4h survives**: the glyph is last in the DOM and at the edge, but it is drawn over the `−0` count, not after it. "After the counts" is only read as DOM order |
| FSTS-17 | same edge, headers without counts included | smoke:1386 (`binary.counts === null`, `widths.size ≥ 2`). Killed: S5 | ✅ (the column itself holds under V4h) |
| FSTS-18 | one glyph, nothing before the path | smoke:1362, :1373 (`glyphs === 1`, `pathSecond`) | ✅ |
| FSTS-19 | only the path struck | smoke:1402. Killed: d, S9 | ✅ |
| FSTS-20 | a path wider than its space is cut with an ellipsis, and the glyph keeps its place | smoke:1413 `ellipsisFaults(long)` at 900 px, plus `headerFaults` | ❌ GAP. R5h, S10h and V2 are killed. **V1h survives**: the path box runs 60 px past its space, its text is drawn over `+12 −0`, and its ellipsis sits just before the glyph |
| FSTS-21 | commit-tab headers follow 16–20 | smoke:1549 (16–19) and smoke:1563 (20, on `LONG_GUIDE` narrowed to 900 px). Killed: S8b, R2, R3, R7, T-a | ✅ for everything commit-specific. It inherits the FSTS-16 and FSTS-20 gaps, because checks 18 and 19 reuse `headerFaults` and `ellipsisFaults` |
| FSTS-22 | a name that fits shows whole | smoke:1242: `fitting` (natural ≤ space − 1) then `scroll ≤ shown`, over 52 rows; preconditions ≥ 47 fit and the long name does not. Killed: R6, V3 (−2 px), V3b (−1 px), V3s (−0.5 px), T-c | ✅. The evidence holds down to a 0.5 px cut. **Boundary limit**: the widest fitting name is 96.6 px, and the narrowest space is 175 px (min slack 78.4 px). A cap anywhere in between survives (V6, 120 px). Fix 8 |
| FSTS-23 | a path that fits shows whole | smoke:1456, the same rule over 49 headers at full width plus the 4 narrowed ones. Killed: R6h, V3h (−1 px), T-c | ✅. Same limit: min slack 210.3 px, and V6h (a 700 px cap) survives. Fix 8 |

**Status**: ❌ gaps are present in FSTS-04, FSTS-16 and FSTS-20, and FSTS-21 inherits them. The other 19 ACs are evidenced by checks that fail on their mutants. FSTS-22 and FSTS-23 carry a Minor boundary limit.

**T17's Range measure is a real precondition.** T-c replaces it with `clientWidth`, the box's own width. Checks 9 and 17 then fail on their own guards (`0 of 49 file names fit`, `0 of 49 paths fit`). A Range box is the text's width, unclipped: the long name reads 593.4 px in a 190 px box. The 1 px spare in `fitting` is what stops a measure that equals the box from passing. FSTS-22 and FSTS-23 are well formed: they are WHEN/THEN shaped, and each names a precise observable (shown whole, no ellipsis). `validate_spec` reports 0 errors and 0 warnings.

### Evidence for V1, V1h, V4 and V4h (probe `fv3_probe.py`, the round 2 `SMOKE_ONLY=ellipsis` probe, scratch only)

| Run | Tree name (`clientWidth` in 190 px of space) | Header path (900 px, 465 px of space) | Drawn (`fv3shot-<id>-*.png`) |
| --- | -------------------------------------------- | ------------------------------------- | ---------------------------- |
| HEAD | 190 | 465 | `a-rather-long-untracked-fi…`, then `U` |
| V1 (`.file-tree-name { margin-right: -40px }`) | 230 | 465 | `…file-nam` runs under the `U`, and no ellipsis is visible |
| V4 (`.file-tree-end` absolute, `right: 8px`) | 212 | 465 | `…file-` then the ellipsis, drawn under the `U` |
| V1h (`.diff-section-path { margin-right: -60px }`) | 190 | 525 | the path runs over `+12 −0`, and its ellipsis sits against the `U` |
| V4h (`.diff-section-end` absolute, `right: 10px`) | 190 | 465 | the `−0` count is drawn under the `U` |

In all four, `ellipsisFaults` is empty and `columnFaults` is empty. `last` holds and the glyph ends at the padding. The item's `space` (smoke:922) is already read, and so is its `shown` width. Under V1 and V4, `shown > space`, but no check compares the two.

---

## Discrimination Sensor

Each run is a fresh seed and a fresh `--user-data-dir`, through the repo's smoke under `SMOKE_ONLY=glyphs`. The driver is `fv3_mutants.py` and the logs are `fv3-<id>-drive.log` in the session scratchpad. P-BASE (read-only PROBE lines, no mutation) is 19/19 in 36 s.

| # | File:line | Mutation | Failing checks (focused 1–19) | Killed? |
| - | --------- | -------- | ----------------------------- | ------- |
| R5 | `FileTree.css:111` | name without `overflow: hidden` | 5 (`overflow-x visible`) | ✅ |
| R5h | `DiffSection.css:50` | path without `overflow: hidden` | 14, 19 | ✅ |
| R6 | `FileTree.css:104` | `.file-tree-name { max-width: 40px }` | 9 | ✅ |
| R6h | `DiffSection.css:43` | `.diff-section-path { max-width: 40px }` | 17 | ✅ |
| R7 | `DiffSection.tsx:124` | commit tabs only: path `textOverflow: 'clip'` | 19 (`text-overflow clip`) | ✅ |
| V2 | `DiffSection.css:49` | path `white-space: normal`, overflow still hidden | 14, 17, 19 (`overflows false … white-space normal`) | ✅ |
| V2t | `FileTree.css:110` | name `white-space: normal` | 5, 9 | ✅ |
| V3 | `FileTree.tsx:128` | every name `max-width: calc(<len>ch - 2px)` | 9 (`scroll 69 in 67 px`) | ✅ |
| V3b | `FileTree.tsx:128` | the same, −1 px | 9 (`scroll 69 in 68 px`) | ✅ |
| V3s | `FileTree.tsx:128` | the same, −0.5 px | 9 (`scroll 76 in 75 px`) | ✅ |
| V3h | `DiffSection.tsx:124` | every path `max-width: calc(<len>ch - 1px)` | 17 (`scroll 614 in 613 px`) | ✅ |
| **V1** | `FileTree.css:104` | `.file-tree-name { margin-right: -40px }`: the name box runs under the glyph | **19/19 pass** | ❌ Survived → Fix 7 |
| **V1h** | `DiffSection.css:43` | `.diff-section-path { margin-right: -60px }`: the path runs over the counts | **19/19 pass** | ❌ Survived → Fix 7 |
| **V4** | `FileTree.css:87, :134` | row `position: relative`; `.file-tree-end` absolute, `right: 8px` | **19/19 pass** | ❌ Survived → Fix 7 |
| **V4h** | `DiffSection.css:18, :79` | header `position: relative`; `.diff-section-end` absolute, `right: 10px` | **19/19 pass** | ❌ Survived → Fix 7 |
| V6 | `FileTree.css:104` | `.file-tree-name { max-width: 120px }` | 19/19 pass | ⚠️ Survived: boundary limit → Fix 8 |
| V6h | `DiffSection.css:43` | `.diff-section-path { max-width: 700px }` | 19/19 pass | ⚠️ Survived: boundary limit → Fix 8 |
| T-a | smoke:1525 (test-side) | the commit tab's narrowing skipped | 19 (`at unnarrowed px … overflows false`) | ✅ the precondition is real |
| T-b | smoke:1338 (test-side) | the override not cleared after the commit tab | 19/19 pass; the probe reads `900x715` afterwards | ⚠️ unasserted → Fix 9 (the real code clears: P-BASE reads `1266x715`) |
| T-c | smoke:943 (test-side) | the natural width read as `clientWidth` | 9, 17 (`0 of 49 … fit`) | ✅ the precondition is real |

**Sensor depth**: lightweight+ (5 re-runs, 13 new production mutants, 3 test-side mutants, on top of rounds 1–2).
**Sensor verdict**: the sensor FAILS. V1, V1h, V4 and V4h are behaviour-level survivors with visible harm. V6 and V6h survive on the seed's sampling. All 11 of the other production mutants are killed.

`git status --porcelain` was `''` before, after every mutant and probe, and at the end.

### Precondition judgements on the new checks

- **Checks 5, 14 and 19 (drawn ellipsis)**: each term is necessary, and together they prove an ellipsis is drawn. They do not prove *where* it is drawn (V1, V4). They are over-strict towards `white-space: pre` and `overflow: auto`, which is harmless here.
- **Check 19 (commit cut path)**: real. T-a shows that without the narrowing `LONG_GUIDE` is not cut, and the check fails. The check requires `showing` and 45 headers at the narrowed width, so it reads the commit stack.
- **Checks 9 and 17 (fits shows whole)**: real, and fine-grained. A 0.5 px cut fails. Their samples all sit ≥ 78 px (tree) or ≥ 210 px (headers) below their space, so a cap between the two survives.
- **The clear of the narrowing**: done in a `finally`, and effective on HEAD. It is not asserted, and focused mode cannot see a leak into the icon checks.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code: one `ellipsisFaults`, one `narrowUntilCut` (an extraction of T10's loop), one `fitting` / `fitFaults` pair | ✅ |
| Surgical changes: the smoke script and `.specs` only; no production file touched since `24ee061` | ✅ |
| No scope creep: the seed gains one fictional file, which the owner decided | ✅ |
| Matches patterns: `check(label, ok, detail)`, `readWhen`, FSTS ids in the labels | ✅ |
| Spec-anchored outcome check | ❌ FSTS-04, 16, 20: the place of the cut and of the glyph is read from the DOM order and the glyph's edge, not from what is drawn over what |
| Per-layer coverage | ✅ the mapping is 1:1 in unit tests; the components are covered by the smoke, except the gaps above |
| Every test maps to an AC, edge case or Done-when | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md` | ✅ |

---

## Edge Cases

- [x] Mixed depths 0 and 1 share one column: smoke:1182 with `depthsHold`
- [x] A binary header without counts keeps the column: smoke:1386 (`logo.bin counts null`)
- [x] The same glyph, tooltip and tone in both lists: smoke:1156, :1182, :1428

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`, plus `npx electron-vite build`, re-run by me (`fv3-*.log`)
- **Outcome**: typecheck exit 0; lint exit 0 with 0 errors and 18 warnings (the baseline); vitest 1784 passed, 0 failed, 0 skipped in 93 files; build exit 0
- **Test count before the feature**: 1778 (92 files)
- **Test count after the feature**: 1784 (93 files)
- **Delta**: +6, none removed. Fix round 2 added no unit tests (smoke only)
- **Smoke**: focused 19/19 on HEAD (`fv3-P-BASE-drive.log`, 36 s). The worker's full drive is 48/48 (`fr2-full-drive.log`)

---

## Fix Plans (for the owner: round 3 is the last before escalation)

All three fixes go in `scripts/smoke-files-diff.mjs`. Each must first be seen failing on its mutant, then passing.

### Fix 7: nothing is drawn under the glyph (FSTS-04, FSTS-16, FSTS-20; FSTS-21 inherits), Minor
- **Root cause**: the checks read the glyph's DOM position (`last`) and its right edge, and the ellipsis's style. None of them reads whether the element before the end group ends before it begins.
- **Fix task**: in `treeRows` and `stackHeaders`, read each row's or header's children in order, and record the largest overlap `prev.right − next.left`. In `columnFaults` (smoke:1015), fault any item where it exceeds 0.5 px. That rule covers the name, the path and the counts against the end group, and the path against the counts, so checks 3, 4, 5, 11, 12, 14, 18 and 19 all inherit it. A narrower option is to require `shown ≤ space + 1` on the cut element in `ellipsisFaults`. It catches V1 and V4 but not V4h, whose counts overlap the glyph.
- **Verify**: V1 and V4 fail 5 (and 3 or 4). V1h fails 14. V4h fails 11 or 12, and 18. HEAD stays 19/19.

### Fix 8: a fitting sample near its boundary (FSTS-22, FSTS-23), Minor, the owner's call
- **Root cause**: every fitting sample sits 78 px (tree) or 210 px (headers) below its space, so a cap between them breaks the AC on real names and passes on the seed (V6, V6h).
- **Options**: (a) Have `narrowUntilCut` run `fitFaults` at every width it steps through (900, 800, 700 and 600 px), so header paths approach their space. Then add one seeded tree name whose natural width is within about 20 px of the space its row leaves at the tree's minimum width. (b) Accept the limit. Any seed leaves some slack, and the 1 px spare already catches every cut that reaches a sample.
- **Verify, for (a)**: V6 and V6h fail 9 and 17.

### Fix 9: assert the viewport is restored, Cosmetic
- In `glyphCommitChecks`, include `window.innerWidth` equal to its value before the narrowing in `restored`. **Verify**: T-b fails 18.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FSTS-01..03, 05..15, 17..19 | Verified (round 2) | ✅ Verified (round 3 re-checked) |
| FSTS-04 | Implementing (Fix 5, T15) | ❌ Needs Fix (Fix 7: V1, V4) |
| FSTS-16 | Verified (round 2) | ❌ Needs Fix (Fix 7: V4h) |
| FSTS-20 | Implementing (Fix 5, T15/T16) | ❌ Needs Fix (Fix 7: V1h) |
| FSTS-21 | Implementing (Fix 6, T16) | ⚠️ Commit-specific clauses verified (S8b, R7, T-a); inherits Fix 7 |
| FSTS-22 | Implementing (T17) | ✅ Verified, with the Fix 8 boundary limit (V6) |
| FSTS-23 | Implementing (T17) | ✅ Verified, with the Fix 8 boundary limit (V6h) |

---

## Summary

**Overall**: ❌ Not Ready. The behaviour is correct, and every round 2 gap is closed. What is still missing is one geometric rule: nothing may be drawn under the glyph.

**Spec-anchored check**: 19 of 23 ACs are fully evidenced. FSTS-04, FSTS-16 and FSTS-20 read the place of the glyph and the cut from the DOM order, and FSTS-21 inherits them.
**Sensor**: 11 of the 17 production mutants are killed (R5, R5h, R6, R6h, R7, V2, V2t, V3, V3b, V3s, V3h). V1, V1h, V4 and V4h survive with visible harm. V6 and V6h survive on the seed's sampling.
**Gate**: 1784 passed, 0 failed; lint 0 errors / 18 warnings (the baseline); typecheck and build exit 0.

**What works**:
- The drawn-ellipsis rule.
- The commit tab's cut path, which is really exercised (T-a).
- The fit checks, down to a 0.5 px cut, with a real Range precondition (T-c).
- The narrowing is cleared on HEAD.

**Next steps**: escalate to the owner, with Fix 7 (needed), Fix 8 (the owner's call) and Fix 9 (cosmetic).
