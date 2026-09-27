## Validation: files-status-glyphs — FAIL

**Date**: 2026-09-27
**Spec**: `.specs/features/files-status-glyphs/spec.md` (FSTS-01..21, three edge cases)
**Diff range**: `2756248..HEAD` (`c699213..db9071d`, 10 task commits). The source changes are 11 files, +705 / −156, `.specs` included
**Verifier**: independent sub-agent (author ≠ verifier). Unit mutants and smoke mutants ran on the real tree through `.orig` + `finally`, with every anchor asserted exactly once. `git status --porcelain` was empty before and after every run

**Why FAIL**: the production code is correct everywhere I probed it, but four of my smoke mutants survive the repo's checks.
- FSTS-21 has no runtime assertion at all.
- The header tones, the ellipsis and the glyph being visible are not asserted.

All four fixes are smoke-only additions (below). No production code needs to change.

---

## Task Completion

T1–T10 are all checked off, and no task is blocked or partial. I checked each task's claims against the tree and the logs.

| Task | Claim checked | Finding |
| ---- | ------------- | ------- |
| T1 | 6 tests; table with literal values; strike test | `change-status.test.ts:7-15` (5 rows, `toEqual({ glyph, label, struck })`), `:18-21`. Baseline 1778 / 92 → 1784 / 93 (+6), re-run by me |
| T2 | Tones copied value for value | `StatusGlyph.css:15-38` matches `git show 2756248:…/FileTree.css` lines 136-159 and the removed `DiffSection.css` pill rules (read in the diff) |
| T3 | `StatusGlyph` reads the mapping | `StatusGlyph.tsx:8-12`: `changeStatusView(status)` → `className={\`status-glyph ${status}\`} title={label}` |
| T4, T6 | Letter/label maps gone | `grep -rn "STATUS_LETTER\|file-tree-pill\|diff-section-pill" src scripts` exits 1 (re-run). The only `STATUS_LABEL` left is `RemoveWorktreeConfirm.tsx:31`, which the spec puts out of scope |
| T5 | Row height unchanged (argued from CSS only) | **Measured by me**: 23.33 px for all 48 file rows and the folder rows, on HEAD and on the base sources (`2756248`'s `FileTree`/`DiffSection` `.tsx`/`.css` swapped in). Probe `V-H` below |
| T8 | Seed adds long untracked name (12 lines) and binary change | `smoke-files-diff.mjs:148-157`. Check 10's log reads `logo.bin counts null; count widths 41, 34.4` |
| T9, T10 | 12 checks; 14 smoke mutants killed | The worker logs `fsts-mut-*-drive.log` agree with each claimed failing check, one for one. Full drive `t10-full-drive.log`: `41/41 checks passed`, glyph checks 20–31 |

---

## Spec-Anchored Acceptance Criteria

`smoke:N` = `scripts/smoke-files-diff.mjs:N`, which is where the `check(` call starts. The focused run numbers the checks 1–12, and the full drive numbers them 20–31. `unit` = `src/renderer/src/lib/change-status.test.ts`.

| AC | Spec-defined outcome | `file:line` + assertion | Verdict |
| -- | -------------------- | ----------------------- | ------- |
| FSTS-01 | glyph is last; right edge within 1 px of `row.right − paddingRight` | smoke:1026 and smoke:1043: `columnFaults` (`smoke:928-945`) needs `glyphs === 1`, `last` (end group is `row.lastElementChild` and the glyph is its last child, `smoke:890-894`), and `Math.abs(right − edge) ≤ 1`. It runs over all 44 + 4 rows | ✅ |
| FSTS-02 | same right edge within 1 px, any depth | the same function: `max(rights) − min(rights) ≤ 1`. The depth precondition `depthsHold` (0,0,1,1) is at smoke:1035-1039 | ✅ |
| FSTS-03 | exactly one glyph per file row | `item.glyphs !== 1` → fault (smoke:931). My mutant S3 (glyph rendered twice) is killed | ✅ |
| FSTS-04 | name cut **with an ellipsis**; glyph keeps the column | smoke:1060: `longRow.overflows === true` (`scrollWidth > clientWidth`) plus the column check | ❌ GAP: only the clipping is asserted. S10 (`text-overflow: ellipsis` removed) **survives**, and the name is then clipped bare |
| FSTS-05 | no glyph on folder rows | smoke:1070: `folderGlyphs.length === 0`, with guards `≥3` / `≥2` folder rows | ✅ |
| FSTS-06..10 | `+` green, `M` amber, `D` red, `R` accent, `U` muted | unit:7-15 `toEqual` literal glyphs. smoke:988 reads the text. smoke:1017 compares each glyph's computed `color` **and** tint with a probe per token (`smoke:845-866`), guarded by `distinct === 5` and `seen.size === 5` | ⚠️ Tree: covered. **Headers: no tone check.** S11 (header glyphs lose their tone) **survives**. S7 (glyph `visibility: hidden`) **survives**: text, title, colour and position are all read through the DOM, and none of them needs the glyph to be visible |
| FSTS-11 | tooltip `Added`/`Modified`/`Deleted`/`Renamed`/`Untracked` | unit:14 (`label`). smoke:988, :1043 (`untracked.txt U/Untracked`), :1149, :1173 compare `getAttribute('title')` with the spec's literal (`GLYPHS`, smoke:820-826). My mutant S2 (no `title`) fails 4 worker checks | ✅ |
| FSTS-12 | one shared mapping; no per-component map | `change-status.ts:14-24` (one `Record<ChangeStatus, …>`). `FileTree.tsx:7,12,129,134` and `DiffSection.tsx:5,9,125,136` import it. The grep for the old maps exits 1. The worker's mutant a (renamed → `N`) fails the tree and the header checks together | ✅ |
| FSTS-13 | deleted name struck | unit:18-21 `filter(struck) → ['deleted']`. smoke:1078 needs `struck[0] === 'docs/removed.md:name'` | ✅ |
| FSTS-14 | only the name: not the row, icon or glyph | smoke:1078 walks the row and all its descendants (`STRUCK`, smoke:868-872) and needs exactly one struck element. The worker's g (row) and my S6 (icon) are killed | ✅ |
| FSTS-15 | no other status struck | smoke:1078 in diff to origin (M, +, R). Unit:18-21 covers U. My mutant U2 (untracked struck) is killed by the unit tests | ✅ |
| FSTS-16 | header glyph last, after counts, within 1 px of `header.right − paddingRight` | smoke:1160: `headerFaults` (smoke:1134-1137) = `columnFaults` + `pathSecond`, over 44 headers | ✅ |
| FSTS-17 | same edge within 1 px, headers without counts included | smoke:1173. The preconditions need `binary.counts === null`, `!widths.has(null)` and `widths.size ≥ 2`. My S5 (counts dropped for some files) is killed | ✅ |
| FSTS-18 | one glyph, nothing before the path | smoke:1149 and :1160: `glyphs === 1` and `header.children[1] === path` (smoke:1106) | ✅ |
| FSTS-19 | only the path struck | smoke:1189: `struck[0] === 'docs/removed.md:path'` over the header subtree. The worker's d and my S9 (glyph struck as well) are killed | ✅ |
| FSTS-20 | path cut **with an ellipsis**; glyph keeps position | smoke:1219: `overflows === true` at 900 px, plus `headerFaults` | ❌ GAP: the same weakness as FSTS-04. `DiffSection.css:51` `text-overflow: ellipsis` is not asserted (the S10 class) |
| FSTS-21 | commit-tab headers follow 16–20 | **no assertion**. The only evidence is the citation `CommitTab.tsx:43` → `AllChangesTab.tsx:303` | ❌ GAP: S8b (glyph moved before the path only when `request.modified.rev` is a sha, which only a commit tab has) passes all 12 worker checks. My probe `V-C` kills it |

**Status**: ❌ gaps present. FSTS-21 has no evidence, FSTS-04/20 do not assert the ellipsis, and FSTS-06..10 are unasserted in the headers and for visibility.

### Verifier probes (scratch copy `fv-smoke.mjs`, not in the repo)

`fv_build_probe.py` builds a copy of the smoke script. The worker checks are copied byte for byte, and one extra `SMOKE_ONLY=verifier` mode adds three probes:
- **V-H**: the height of every file and folder row in both lists.
- **V-P**: every `.status-glyph` in both lists and both stacks is painted. That means `visibility: visible`, no ancestor with `opacity < 1`, a 10 px font and a box at least 15 × 8 px.
- **V-C**: Commits mode opens `work on the branch` in a commit tab. The probe then runs `headerFaults` and `glyphFaults(ORIGIN_STATUS)` over its 44 headers, and needs `docs/removed.md:path` to be the only struck element.

On HEAD all three probes pass (`fv-probe-base-drive.log`: 15/15). The commit tab reads 44 headers with the right glyphs, in one column, with only the path struck, so FSTS-21 **holds at runtime today**. The gap is that nothing in the repo proves it.

---

## Discrimination Sensor

The workers' 15 mutants are the T1 unit mutant plus 14 smoke mutants. Their logs confirm each one is killed as claimed. Below are my 14 mutants: 3 unit mutants and 11 focused smoke mutants, each on a fresh seed and a fresh `--user-data-dir`.

| # | File:line | Mutation | Worker checks (1–12) | Verifier probes | Killed? |
| - | --------- | -------- | -------------------- | --------------- | ------- |
| U1 | `change-status.ts:16-17` | labels of modified/deleted swapped | unit: 2 rows fail | – | ✅ Killed |
| U2 | `change-status.ts:19` | untracked `struck: true` | unit: U row + strike test fail | – | ✅ Killed |
| U3 | `change-status.ts:18` | label `Renamed` → `Moved` | unit: R row fails | – | ✅ Killed |
| S1 | `StatusGlyph.css:15-23` | modified ↔ deleted tones swapped | 2 fails | – | ✅ Killed |
| S2 | `StatusGlyph.tsx:10` | `title` dropped | 1, 4, 8, 10 fail | V-C fails | ✅ Killed |
| S3 | `FileTree.tsx:133-135` | glyph rendered twice | 3, 4, 5 fail (`2 glyphs`) | – | ✅ Killed |
| S4 | `FileTree.css:134-140` | end group `margin-right: 12px` (aligned with each other, off the padding) | 3, 4, 5 fail (`ends at 236.0, edge 248.0`) | – | ✅ Killed |
| S5 | `DiffSection.tsx:129` | counts only when `stat.added > 1` | 10 fails (precondition) | – | ✅ Killed |
| S6 | `FileTree.css:128` | strike moved to the row's `.file-icon` | 7 fails (`docs/removed.md:file-icon`) | – | ✅ Killed |
| S7 | `FileTree.css:134-140` | end group `visibility: hidden`, shown only on row hover (a plausible #132 hover-reveal) | **12/12 pass** | V-P fails | ❌ Survived → Fix 4 |
| S8 | `DiffSection.tsx:124-137` | glyph before the path when `'rev' in request.modified` | 9 fails: diff to origin also uses `rev: 'HEAD'`, so this was not commit-only | V-C fails | ✅ Killed (re-scoped as S8b) |
| S8b | `DiffSection.tsx:124-137` | glyph before the path only when `modified.rev !== 'HEAD'` (commit tabs) | **12/12 pass** | V-C fails | ❌ Survived → Fix 1 |
| S9 | `DiffSection.css:71` | strike also on the deleted header's glyph | 11 fails | V-C fails | ✅ Killed |
| S10 | `FileTree.css:112` | `text-overflow: ellipsis` removed | **12/12 pass** | 15/15 pass | ❌ Survived → Fix 3 |
| S11 | `DiffSection.css:78` | `.diff-section-end .status-glyph { color: inherit; background: none }` | **12/12 pass** | 15/15 pass | ❌ Survived → Fix 2 |

**Sensor depth**: lightweight+ (14 verifier mutants on top of the workers' 15).
**Sensor verdict**: 10 of my 14 mutants are killed and 4 survive, so the sensor FAILS.

Logs are in the session scratchpad: `fvmut-<id>-drive.log` and `fv-heights-base-drive.log`. The drivers are `fv_mutants.py` and `fv_run.py`. `git status --porcelain` was `''` after every mutant.

---

## Judgements asked for

1. **FSTS-21 (commit tabs).** The code-reuse evidence is sound as an argument:
   - `AllChangesTab.tsx:303` is the only place that renders `DiffSection`.
   - `CommitTab.tsx:43` mounts it unmodified.
   - `FileTabs.tsx:292-321` renders only the active tab.
   - No stylesheet outside `DiffSection.css` or `StatusGlyph.css` targets `diff-section-*` or `status-glyph` (grep).

   It is still **not acceptable under evidence-or-zero**, for two reasons. A citation is not an assertion, and a cheap check exists: the diff seed's `work on the branch` commit already holds the same 44 files, and `V-C` is about 35 lines that reuse `stackHeaders`, `headerFaults` and `glyphFaults`. The risk is also concrete. The stacked #132 discard action has every reason to branch on commit tabs, because a commit cannot be discarded. S8b is that branch, and it survives.
2. **Check preconditions** (memory rule: a check must be able to fail):
   - **Tone (check 2)**: sound. `distinct === 5` rules out a probe and a glyph passing on the same fallback. Comparing the tint closes the untracked-inherits-`--text-muted` hole (the worker's b2 is killed), and `seen.size === 5` makes all five statuses show up. The check does cover the tree only (S11).
   - **Column (checks 3, 4, 9, 10)**: every row or header is measured (44 / 4 / 44 / 4), with count guards and with the edge and the spread both checked. S4 shows the edge half fails on its own when the glyphs still line up with each other.
   - **Ellipsis (5, 12)**: the precondition `scrollWidth > clientWidth` is real (the workers' e mutants are killed). But it is a precondition for "cut", and the check never asserts the ellipsis its AC names (S10).
   - **Strike (7, 11)**: the walk covers the row or header and its whole subtree. An ancestor-level strike above `.file-tree-row` would go unseen, but it would strike every row at once, so I did not count it as a gap.
   - **Visibility**: no check needs the glyph to be visible (S7).
3. **T5 row height.** Nothing in the repo smoke measures it. I measured it: 23.33 px on HEAD and 23.33 px on the base sources, for all 48 file rows and the folder rows. The spec has no height AC, only the "Glyph look" assumption that only the content and place change. The claim is now closed by measurement, and it does not bear on the verdict.
4. **Focused mode.** `glyphSetup` (smoke:960-968) selects Uncommitted → All changes → Inline, which is the layout FDIF-12 leaves. The full drive also leaves some things `glyphSetup` does not:
   - diff tabs open;
   - expanded sections;
   - a scrolled stack;
   - Ignore whitespace toggled off again;
   - `modified.ts` committed. It stays `M` against origin, and the uncommitted list keeps its 4 files.

   None of these touches a row or header's layout rules. The checks are relative (the edge minus padding, the spread within one list), and the full drive passed the same 12 checks as 20–31 on the same code (`t10-full-drive.log`, 41/41). The focused results therefore carry over, and I had no concrete reason to spend the one full drive.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code: one record, one 14-line component, one stylesheet | ✅ |
| Surgical changes: only the two components, their CSS, the new lib and the smoke; folder rows untouched (`FileTree.tsx` `FolderRows`) | ✅ |
| No scope creep: tabs, `RemoveWorktreeConfirm`, folder status untouched | ✅ |
| Matches patterns: co-located unit test, `it.each` table like `file-icons.test.ts`; CDP smoke per `TESTING.md:42,68` | ✅ |
| Spec-anchored outcome check | ❌ FSTS-04/20 ellipsis and FSTS-21 not asserted |
| Per-layer coverage: pure mapping 1:1 (FSTS-06..11, 13, 15); components by smoke | ⚠️ header tones missing |
| Every test maps to an AC, edge case or Done-when | ✅ (the checks' labels carry the FSTS ids) |
| Documented guidelines followed: `.specs/codebase/TESTING.md` | ✅ |

Lint 0 errors / 18 warnings. None of the warnings is in a changed file: they are in `scripts/fixtures/implement-ticket/workflow.ts`, `smoke-agent-config.mjs`, `smoke-agents.mjs` and `src/shared/tasks.test.ts`.

---

## Edge Cases

- [x] Mixed depths 0 and 1 in uncommitted share one column: smoke:1043 with `depthsHold` (log: `logo.bin:1, a-rather-lon:1, crlf.txt:0, untracked.tx:0`)
- [x] A binary header with no counts keeps the column: smoke:1173 (`logo.bin counts null`)
- [x] The same glyph, tooltip and tone in uncommitted as in diff to origin: smoke:1017 compares tones in both lists, and smoke:1043 reads `U/Untracked` there. `M` is read in both

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`, plus `npx electron-vite build` (re-run by me)
- **Outcome**: typecheck exit 0; lint exit 0, 0 errors / 18 warnings (baseline); vitest 1784 passed / 0 failed / 0 skipped in 93 files; build exit 0
- **Test count before feature**: 1778 (92 files, T1 baseline)
- **Test count after feature**: 1784 (93 files)
- **Delta**: +6 (`change-status.test.ts`), none removed
- **Smoke**: the worker checks, focused, 12/12 on HEAD (`fv-probe-base-drive.log`), plus the probes 3/3

---

## Fix Plans

All four fixes go in `scripts/smoke-files-diff.mjs`, in the glyph sections before `iconChecks`. Each one must be seen failing on its mutant (S8b, S11, S10, S7), then passing.

### Fix 1: assert the commit tab's headers (FSTS-21), Major
- **Root cause**: the AC rests on a code citation, so a commit-only header branch goes undetected.
- **Fix task**: at the end of `glyphHeaderChecks`, switch to Commits and open the row whose `.commit-subject` is `work on the branch` (`.commit-open`). Wait for its 44 headers, then check `headerFaults` + `glyphFaults(ORIGIN_STATUS)` and require the strike to be exactly `docs/removed.md:path`. The template is `verifierProbes` / `V-C` in `fv-smoke.mjs`.
- **Verify**: S8b fails it.

### Fix 2: header tones (FSTS-06..10 in the section headers), Minor
- **Root cause**: check 2 reads tree glyphs only.
- **Fix task**: add `color` / `backgroundColor` to `stackHeaders`. Compare both stacks against `probeTones('.all-changes-stack')`, with the `distinct` / `seen` guards.
- **Verify**: S11 fails it.

### Fix 3: assert the ellipsis (FSTS-04, FSTS-20), Minor
- **Root cause**: `overflows` proves clipping, not an ellipsis.
- **Fix task**: in `treeRows` and `stackHeaders`, also read `getComputedStyle(name|path).textOverflow`. Require `'ellipsis'` in checks 5 and 12.
- **Verify**: S10 fails 5. The header twin (the ellipsis dropped from `DiffSection.css:51`) fails 12.

### Fix 4: the glyph is painted (FSTS-06..10 "reads"), Minor, relevant to #132
- **Root cause**: every glyph read goes through the DOM, and none of it needs the glyph to be visible.
- **Fix task**: in `columnFaults` (or a sibling), fault any glyph with `visibility !== 'visible'`, an ancestor with `opacity < 1`, or a box under 15 × 8 px. The template is `paintedFaults` in `fv-smoke.mjs`.
- **Verify**: S7 fails it.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FSTS-01, 02, 03, 05 | Implementing | ✅ Verified |
| FSTS-04 | Implementing | ❌ Needs Fix (Fix 3) |
| FSTS-06..10 | Implementing | ❌ Needs Fix (Fix 2, Fix 4); tree tones verified |
| FSTS-11..19 | Implementing | ✅ Verified |
| FSTS-20 | Implementing | ❌ Needs Fix (Fix 3) |
| FSTS-21 | Implementing | ❌ Needs Fix (Fix 1); holds at runtime (V-C), unasserted in the repo |

---

## Summary

**Overall**: ❌ Not Ready. The behaviour is correct, and the sensor has four survivors.

**Spec-anchored check**: 14 of 21 ACs are fully evidenced. FSTS-21 has no assertion, FSTS-04/20 miss the ellipsis, and FSTS-06..10 miss the header tones and visibility.
**Sensor**: 10 of my 14 mutants are killed (plus the workers' 15, all killed); S7, S8b, S10 and S11 survive.
**Gate**: 1784 passed, 0 failed; lint 18 warnings (baseline); typecheck and build exit 0.

**What works**:
- One mapping serves both places.
- The glyph is last and in one column, at every depth and with or without counts.
- The strike is on the name or path only.
- The tooltips are right.
- The commit tabs match at runtime.
- The row height is unchanged.

**Next steps**: Fix 1–4 are smoke-only, and each is falsified on its mutant. Then re-verify: focused mode for the mutants and one full drive.
