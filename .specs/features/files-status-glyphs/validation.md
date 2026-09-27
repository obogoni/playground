## Validation: files-status-glyphs — FAIL

**Date**: 2026-09-27 (round 2)
**Spec**: `.specs/features/files-status-glyphs/spec.md` (FSTS-01..21, three edge cases)
**Diff range**: feature `2756248..HEAD`. The fix round is `24ee061..HEAD` (`6c10c01..4f1ce99`, T11–T14), and it changes `scripts/smoke-files-diff.mjs` only
**Verifier**: independent sub-agent (author ≠ verifier). Every smoke mutant ran in focused mode (`SMOKE_ONLY=glyphs`, the repo's own script) on a fresh seed and a fresh `--user-data-dir`. Each went through an `.orig` copy restored in `finally`, with every anchor asserted exactly once. `git status --porcelain` was `''` before and after every run. The full drive was not spent (see Round 1, item 4)

**Why FAIL**: the four round-1 survivors are all killed now, and the production code is still correct wherever I probed it. Three new mutants of mine survive, though, and two of them do visible harm:
- **R5 / R5h**: `overflow: hidden` removed from the name or path. `text-overflow` still computes `ellipsis`, so checks 5 and 13 pass, but no ellipsis is drawn. The long name then runs on under the `U` glyph, and the long path runs over the counts and the glyph (screenshots below). The T13 check reads a property that holds whether or not an ellipsis is drawn.
- **R7**: a commit-tab-only change that clips the path bare. FSTS-21 says commit headers follow criteria 16 to 20. Check 16 covers 16 to 19, but nothing covers 20 in a commit tab, because none of the branch commit's paths is ever cut.

Both fixes are smoke-only. No production code needs to change.

---

## Round 1: how each gap was closed

| Round 1 gap | Fix | Evidence now | Status |
| ----------- | --- | ------------ | ------ |
| FSTS-21 had no runtime assertion, and S8b survived | T11 `glyphCommitChecks` | S8b fails check 16 (`src/added.ts: glyph not last`, ×3 shown) | ✅ closed for 16–19. Clause 20 is still open (R7, Fix 6) |
| Header tones were unasserted, and S11 survived | T12 `toneFaultsOf` plus header check 14 | S11 fails 14 (`rgb(165, 156, 142) on rgba(0, 0, 0, 0)`). My R4 (tones swapped in the headers only) fails 14 | ✅ closed |
| The ellipsis was unasserted, and S10 survived | T13 computed `textOverflow === 'ellipsis'` | S10 fails check 5 (`text-overflow clip`) | ⚠️ S10 is closed, but the check is not sufficient: R5 and R5h survive (Fix 5) |
| The glyph was not required to be visible, and S7 survived | T14 `UNPAINTED` plus checks 8 and 15, and inside 16 | S7 fails 8 (`visibility hidden`). My R1 (`display: none` on the `R` glyph) fails 3, 8, 10, 15 and 16 | ✅ closed |
| T5 row height | none needed | measured in round 1: 23.33 px on HEAD and on the base sources. It is not an AC | closed by measurement |
| Focused mode standing in for the full drive | none needed | the worker's full drive `fr-full-drive.log` is 45/45, with the glyph checks at 20–35 and 35 = the commit tab, `restored true`. The icon checks after it pass | holds. I had no concrete doubt, so I did not spend the one full drive |
| An ancestor-level strike above the row goes unseen | accepted in round 1 | unchanged | accepted (it would strike every row) |

---

## Task Completion

T1–T14 are all checked off, and none is blocked or partial. I checked the T11–T14 Result blocks against the diff and the logs.

| Task | Claim | Finding |
| ---- | ----- | ------- |
| T11 | `glyphCommitChecks` opens `work on the branch`; runs `headerFaults`, `glyphFaults`, strike; requires `showing` and `restored`; S8b fails it only | Confirmed: smoke:1347-1417. S8b fails 16 only, as claimed. One claim is weaker than it reads. `opened` (smoke:1349-1364) records only that the `.commit-open` button was clicked. Under my R2 (open is a no-op) it logs `opened true`, and the check is failed by `showing` (smoke:1367) and the header count instead. Cosmetic |
| T12 | header tones via shared `toneFaultsOf`, guards 5/5/48 | Confirmed: smoke:982-1001, :1300-1314. The tree check 2 logic is unchanged (the diff is a pure extraction) |
| T13 | `textOverflow === 'ellipsis'` on cut name and path | Confirmed as written: smoke:929, :1177, :1111, :1292. **Not sufficient**: R5 and R5h survive |
| T14 | `UNPAINTED` (visibility, display, opacity walk, box ≥ 15 × 8), checks 8 and 15, and inside 16; `display` branch not falsified | Confirmed: smoke:881-901, :1004-1007, :1137, :1318, :1379. I falsified the `display` branch with R1 (below). It fires (`display none on status-glyph renamed`), but only together with `box 0.0 x 0.0`, so it adds no kill of its own. That is harmless |
| Gate | 1784 tests; lint 0/18; typecheck and build | Re-run by me, same numbers (Gate Check) |
| Focused 16/16, 34 s | | Re-run by me: `fv2-BASE-drive.log` 16/16, 34 s |

---

## Spec-Anchored Acceptance Criteria

`smoke:N` = `scripts/smoke-files-diff.mjs:N`, the line where the `check(` call starts. The focused run numbers the checks 1–16: the tree is 1–8 (smoke:1053-1137), the headers 9–15 (smoke:1219-1318) and the commit tab 16 (smoke:1403). The full drive numbers them 20–35. `unit` = `src/renderer/src/lib/change-status.test.ts`.

| AC | Spec-defined outcome | `file:line` + assertion | Verdict |
| -- | -------------------- | ----------------------- | ------- |
| FSTS-01 | glyph last, right edge within 1 px of `row.right − paddingRight` | smoke:1075, :1092 `columnFaults` (smoke:961-975): `glyphs === 1`, `last`, `Math.abs(right − edge) ≤ 1`, over 44 + 4 rows. Killed: S3, S4, R1 | ✅ |
| FSTS-02 | same edge within 1 px, any depth | the same function, `max − min ≤ 1`, with `depthsHold` (smoke:1084-1088) | ✅ |
| FSTS-03 | one glyph per file row | `item.glyphs !== 1` (smoke:964). Killed: S3 | ✅ |
| FSTS-04 | name cut **with an ellipsis**; glyph keeps the column | smoke:1109: `overflows === true && ellipsis === 'ellipsis'` (computed `textOverflow`, smoke:929) plus the column check | ❌ GAP: R5 (`overflow: hidden` removed, `text-overflow` kept) **survives**. No ellipsis is drawn, and the name runs on under the glyph (`fv2shot-R5-tree-ellipsis-uncut-tree-row.png`) |
| FSTS-05 | no glyph on folder rows | smoke:1120 `folderGlyphs.length === 0`, guards ≥3 / ≥2 | ✅ |
| FSTS-06..10 | `+` green, `M` amber, `D` red, `R` accent, `U` muted, and the glyph is seen | unit:7-15 literal glyphs. Tree tones smoke:1066 and header tones smoke:1305 (`toneFaultsOf` against probes, `distinct === 5`, `seen.size === 5`, 48 glyphs). Painted: smoke:1137 (tree), :1318 (headers), inside :1403 (commit). Killed: S1, S11, R4, S7, S7h/o/s (worker), R1 | ✅ |
| FSTS-11 | tooltip names the status | unit:14. smoke:1053, :1092, :1219, :1243, :1403 compare `title` with `GLYPHS` (smoke:822-828). Killed: S2 (round 1) | ✅ |
| FSTS-12 | one shared mapping | `change-status.ts:14-24`, imported by `FileTree.tsx` and `DiffSection.tsx`. The grep for the old maps exits 1 (round 1, no production change since) | ✅ |
| FSTS-13 | deleted name struck | unit:18-21. smoke:1128 `struck[0] === 'docs/removed.md:name'` | ✅ |
| FSTS-14 | only the name struck | smoke:1128, over the row subtree, exactly one struck element. Killed: g, S6 | ✅ |
| FSTS-15 | no other status struck | smoke:1128 plus unit:18-21 | ✅ |
| FSTS-16 | header glyph last, after the counts, within 1 px | smoke:1230 `headerFaults` over 44 headers. Killed: t10 b/c | ✅ |
| FSTS-17 | same edge, headers without counts included | smoke:1243 (`binary.counts === null`, `widths.size ≥ 2`). Killed: S5 | ✅ |
| FSTS-18 | one glyph, nothing before the path | smoke:1219, :1230 (`glyphs === 1`, `pathSecond`) | ✅ |
| FSTS-19 | only the path struck | smoke:1259 `struck[0] === 'docs/removed.md:path'`. Killed: d, S9 | ✅ |
| FSTS-20 | path cut **with an ellipsis**; glyph keeps position | smoke:1289: `overflows && ellipsis === 'ellipsis'` at 900 px (smoke:1177) plus `headerFaults` | ❌ GAP: R5h **survives**. The path runs over `+12 −0` and the `U` glyph (`fv2shot-R5h-header-ellipsis-uncut-header.png`) |
| FSTS-21 | commit-tab headers follow 16–20 | smoke:1403: `showing` (the active tab is `<sha> · work on the branch`), 44 headers, `statuses.size ≥ 4`, `headerFaults` + `glyphFaults` + `paintFaults` empty, strike exactly `docs/removed.md:path`, `restored`. Killed: S8b, R1, R2, R3 | ⚠️ PARTIAL, counted as a GAP. Clauses 16, 18 and 19 are evidenced, and so is 17's column. **Clause 20 has no evidence**: no commit path is ever cut, and nothing reads the commit headers' ellipsis, so R7 (commit tabs clip bare) **survives**. 17's no-counts header cannot happen in the commit tab either, because the branch commit holds no binary |

**Status**: ❌ gaps present: FSTS-04, FSTS-20 and FSTS-21's clause 20. The other 18 ACs are evidenced by checks that fail on their mutants.

**Spec-precision note (not counted in the verdict)**: FSTS-04 and FSTS-20 state only the WHEN-too-long case. My R6 (every name capped at 40 px, so names that fit are cut too) passes 16/16. It breaks no AC as written. Whether "a name that fits SHALL show whole" belongs in the spec is the owner's call.

### Evidence for R5 / R5h (probe `fv2-smoke.mjs`, `SMOKE_ONLY=ellipsis`, scratch only)

The probe read the long row and its header on HEAD and under each mutant, and saved screenshots:

| Run | Tree name | Header path (900 px) | Drawn |
| --- | --------- | -------------------- | ----- |
| HEAD | `overflowX hidden, nowrap, ellipsis`, 593 > 190 | `hidden, nowrap, ellipsis`, 621 > 465 | `a-rather-long-untracked-fi…` then the `U` glyph |
| R5 | `overflowX visible, nowrap, ellipsis`, 593 > 190 | unchanged | no ellipsis; the name runs on under the `U` glyph |
| R5h | unchanged | `overflowX visible, nowrap, ellipsis`, 621 > 465 | no ellipsis; the path runs on over the counts and the glyph |

Every value checks 5 and 13 read (`overflows`, `textOverflow`) is the same on HEAD and under the mutants. Only `overflowX` and the pixels differ. An ellipsis is drawn only on a box whose `overflow` is not `visible` (CSS Overflow 3, `text-overflow`). The computed `text-overflow` is set whether or not that condition holds. This is the memory note's shape 2 (`smoke-checks-that-cannot-fail.md`): a property that holds for reasons of its own.

---

## Discrimination Sensor

Every run below is a fresh seed and a fresh `--user-data-dir`, driven by the repo's `scripts/smoke-files-diff.mjs` under `SMOKE_ONLY=glyphs`. The driver is `fv2_mutants.py`, and the logs are `fv2-<id>-drive.log` in the session scratchpad. BASE (no mutation) is 16/16.

| # | File:line | Mutation | Failing checks (focused 1–16) | Killed? |
| - | --------- | -------- | ----------------------------- | ------- |
| S7 | `FileTree.css:134-140` | end group `visibility: hidden`, shown on row hover | 8 (`visibility hidden`) | ✅ Killed |
| S8b | `DiffSection.tsx:124-137` | glyph before the path only when `modified.rev !== 'HEAD'` (commit tabs) | 16 (`glyph not last`) | ✅ Killed |
| S10 | `FileTree.css:112` | `text-overflow: ellipsis` removed | 5 (`text-overflow clip`) | ✅ Killed |
| S11 | `DiffSection.css:78` | `.diff-section-end .status-glyph { color: inherit; background: none }` | 14 | ✅ Killed |
| R1 | `StatusGlyph.css:30-33` | `.status-glyph.renamed { display: none }` | 3, 8, 10, 15, 16 (`display none on status-glyph renamed, box 0.0 x 0.0`) | ✅ Killed |
| R2 | `CommitList.tsx:108` | `onOpen` does nothing (the commit tab never opens) | 16 (`active none; 0 headers`, though `opened true`) | ✅ Killed |
| R3 | `FileTabs.tsx:207` | close does nothing on a commit tab (the return fails) | 16 (`restored false`) | ✅ Killed |
| R4 | `DiffSection.css:78` | modified ↔ deleted tones swapped in the headers only | 14 (both paths named) | ✅ Killed |
| R5 | `FileTree.css:111` | `.file-tree-name` without `overflow: hidden`, `text-overflow` kept | **16/16 pass** | ❌ Survived → Fix 5 |
| R5h | `DiffSection.css:50` | the same on `.diff-section-path` | **16/16 pass** | ❌ Survived → Fix 5 |
| R7 | `DiffSection.tsx:124-126` | commit tabs only: path `style={{ textOverflow: 'clip' }}` | **16/16 pass** | ❌ Survived → Fix 6 |
| R6 | `FileTree.css:104-106` | `.file-tree-name { max-width: 40px }`: names that fit are cut too | 16/16 pass | not a spec violation (spec-precision note) |

**Sensor depth**: lightweight+ (the 4 re-runs plus 8 new mutants, on top of round 1's 14 and the workers' 15 + 13).
**Sensor verdict**: 9 of the 11 runs that violate the spec are killed (all but R5 and R5h), plus R7, a survivor on an unevidenced clause. The sensor FAILS.

`git status --porcelain` was `''` before, after every mutant, and at the end. The worker's fix-round logs (`fr-t1{1..4}-*-drive.log`) agree with each T11–T14 Result claim.

### Precondition judgements on the new checks

- **Check 16 (commit tab)**: real. `showing` fails when the tab never opens (R2), and `restored` fails when the return leaves the tab (R3). The header count needs all 44 sections, and `readWhen` reads the whole document, which is safe because `FileTabs` renders only the active tab (round 1). `opened` is only a click flag and proves nothing on its own; the other guards carry it. It covers FSTS-16 to 19 but not 20 (R7).
- **Check 14 (header tones)**: real. It probes `.all-changes-stack` while each stack is showing, and it needs `distinct === 5`, `seen.size === 5` and 48 glyphs. Both a lost tone (S11) and a swapped tone (R4) fail it. A token redefined on the stack itself would move the probe along with it. The tree's check 2 has the same design and was accepted in round 1, so it is not a gap.
- **Checks 8, 15, 16 (painted)**: real. Hidden, faded, shrunk, undisplayed and missing glyphs all fail it (S7, S7h/o/s, R1). One limit: "painted" does not mean "not overdrawn". Under R5 the glyph passes every painted rule while text runs over it. Fix 5 closes that case at its source.
- **Checks 5, 13 (ellipsis)**: **not sufficient**. The new `textOverflow` read is necessary but can hold with no ellipsis drawn (R5, R5h).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code: one shared `toneFaultsOf` (a pure extraction), one `UNPAINTED` / `paintFaults` pair used by three checks, one commit section | ✅ |
| Surgical changes: `scripts/smoke-files-diff.mjs` only, plus `.specs`; no production file touched since `24ee061` | ✅ |
| No scope creep | ✅ |
| Matches patterns: the same `check(label, ok, detail)` shape, `readWhen`, and FSTS ids in the labels | ✅ |
| Spec-anchored outcome check | ❌ FSTS-04/20: `text-overflow` alone does not show the ellipsis that the ACs name. FSTS-21's clause 20 is unasserted |
| Per-layer coverage | ✅ the mapping is 1:1 in unit tests; the components are covered by the smoke, except the gaps above |
| Every test maps to an AC, edge case or Done-when | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md` | ✅ |

The label `opened ${opened}` in check 16's detail reads as proof that the tab opened, and it is not (R2 log). This is cosmetic.

---

## Edge Cases

- [x] Mixed depths 0 and 1 share one column: smoke:1092 with `depthsHold`
- [x] A binary header without counts keeps the column: smoke:1243 (`logo.bin counts null`). This is in the Uncommitted stack only; the commit tab has no binary
- [x] The same glyph, tooltip and tone in both lists: smoke:1066, :1092, and now the header tones at :1305

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`, plus `npx electron-vite build`, re-run by me (`r2-*.log`)
- **Outcome**: typecheck exit 0; lint exit 0, 0 errors / 18 warnings (the baseline); vitest 1784 passed / 0 failed / 0 skipped in 93 files; build exit 0
- **Test count before feature**: 1778 (92 files)
- **Test count after feature**: 1784 (93 files)
- **Delta**: +6, none removed. The fix round added no unit tests (smoke only)
- **Smoke**: focused 16/16 on HEAD (`fv2-BASE-drive.log`, 34 s). The worker's full drive is 45/45 (`fr-full-drive.log`)

---

## Fix Plans

Both fixes go in `scripts/smoke-files-diff.mjs`. Each must first be seen failing on its mutant, then passing.

### Fix 5: assert the drawn ellipsis, not the property alone (FSTS-04, FSTS-20), Minor
- **Root cause**: `text-overflow: ellipsis` computes the same whether or not the box clips, and Chromium draws the ellipsis only when `overflow` is not `visible` and the text does not wrap.
- **Fix task**: in `treeRows` (smoke:929) and `stackHeaders` (smoke:1177), also read `overflowX` and `whiteSpace` of the name or path. In checks 5 (smoke:1109) and 13 (smoke:1289), require `overflowX` to be `hidden` or `clip` and `whiteSpace` to be `nowrap`, besides `textOverflow === 'ellipsis'` and `overflows`. The scratch probe `fv2_build_probe.py` / `cutStyle` is a template.
- **Verify**: R5 fails 5, R5h fails 13, and S10 and its header twin still fail.

### Fix 6: FSTS-21 clause 20 in the commit tab, Minor
- **Root cause**: no path in the branch commit is ever cut, so check 16 cannot exercise "cut with an ellipsis" there.
- **Fix task, cheaper option**: in `glyphCommitChecks`, require the Fix 5 triple (`textOverflow === 'ellipsis'`, `overflowX` hidden or clip, `nowrap`) on every commit header's path. This is the property half of clause 20, since its WHEN never fires with this seed.
- **Fix task, stronger option**: seed a long path into the branch commit, so it is also in diff to origin, and narrow the window in check 16 as check 13 does. This changes `ORIGIN_STATUS` and the full drive's diff-to-origin counts, so it needs one full drive.
- **Verify**: R7 fails 16.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FSTS-01..03, 05, 11..19 | Verified (round 1) | ✅ Verified (round 2 re-checked) |
| FSTS-04 | Implementing (Fix 3) | ❌ Needs Fix (Fix 5, R5) |
| FSTS-06..10 | Implementing (Fix 2, Fix 4) | ✅ Verified |
| FSTS-20 | Implementing (Fix 3) | ❌ Needs Fix (Fix 5, R5h) |
| FSTS-21 | Implementing (Fix 1) | ❌ Needs Fix (Fix 6, R7); clauses 16–19 verified |

---

## Summary

**Overall**: ❌ Not Ready. The behaviour is correct, and two of the fix round's checks are weaker than their ACs.

**Spec-anchored check**: 18 of 21 ACs are fully evidenced. FSTS-04 and FSTS-20 read the ellipsis property without the clip that draws it, and FSTS-21's clause 20 is unasserted.
**Sensor**: S7, S8b, S10 and S11 are all killed now, and so are R1–R4. R5, R5h and R7 survive. R6 is a spec-precision note.
**Gate**: 1784 passed, 0 failed; lint 0 errors / 18 warnings (the baseline); typecheck and build exit 0.

**What works**:
- The commit tab now runs a real check that fails when the tab fails to open or the return fails.
- The header tones are asserted.
- Every glyph must be painted.
- S10 is caught.

**Next steps**: Fix 5 and Fix 6, each falsified on its mutant. Then round 3, the last before escalation: focused mode for R5, R5h and R7, plus one full drive if Fix 6 takes the seed option.
