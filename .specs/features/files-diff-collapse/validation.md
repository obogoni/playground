# Files Diff Folder Collapse Validation

## Validation: files-diff-collapse - PASS

**Date**: 2026-10-11
**Spec**: `.specs/features/files-diff-collapse/spec.md`
**Diff range**: `origin/main..7464f35` (7369406 spec, 219589e foldTree, 0edbea1 state + chevron, 7464f35 smoke section 17)
**Verifier**: independent sub-agent (author ≠ verifier)

Evidence sources:

- Unit: `src/renderer/src/lib/files-view.test.ts`, `describe('foldTree')`, run here (green).
- Smoke: `scripts/smoke-files-diff.mjs` `folderFoldSection` (checks 17a..17i), not run here (needs a live
  Electron app over CDP). Its evidence is the full run log `fdcl-full.log` (scratchpad of the session), lines 60-68,
  all PASS, `120/123 checks passed`. Per `.specs/codebase/TESTING.md:42,68`, renderer components are covered by CDP
  smoke by convention, not by unit tests.
- Code reading of the diff where neither test reaches.

---

## Task Completion

No `tasks.md`: the spec maps its 15 requirements to inline steps (`spec.md:113`). The four commits of the range
deliver them.

| Step | Commit | Status |
| ---- | ------ | ------ |
| Spec | 7369406 | ✅ Done |
| `foldTree` helper + unit tests | 219589e | ✅ Done |
| `collapsed` state, `toggleCollapsed`, chevron button in the three diff modes | 0edbea1 | ✅ Done |
| Smoke section 17 | 7464f35 | ✅ Done |

---

## Spec-Anchored Acceptance Criteria

| ID | Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| -- | --------- | -------------------- | ----------------------- | ------ |
| FDCL-01 | WHEN chevron of an open folder clicked THEN hide every row under it, keep the folder row | Descendant rows absent; folder row present | `src/renderer/src/lib/files-view.test.ts:95` - `expect(rows(foldTree(tree, ['src/app']))).toEqual(['src','src/app','src/lib','src/lib/util.ts','readme.md'])`; `scripts/smoke-files-diff.mjs:3987` - `J(under(innerFolded, FDCL_DIR)) === J([FDCL_INNER, 'fdcl-fold/top.txt'])` (log 61); `scripts/smoke-files-diff.mjs:4004-4005` - `parentFolded.includes(FDCL_DIR) && under(parentFolded, FDCL_DIR).length === 0` (log 62) | ✅ PASS (Uncommitted at runtime; Diff to origin via 17i; Pull request by code only, see gap 1) |
| FDCL-02 | WHEN chevron of a folded folder clicked THEN children shown again | Rows equal the unfolded tree | `src/renderer/src/lib/files-view.test.ts:107-115` - `not.toContain('src/app/main.ts')` then `toEqual(all)`; `scripts/smoke-files-diff.mjs:4078` - `under(reopened, FDCL_DIR)` equals `[FDCL_INNER, 'fdcl-fold/top.txt']` (log 67) | ✅ PASS |
| FDCL-03 | WHEN chevron clicked THEN launcher target unchanged | Launcher title before === after | `scripts/smoke-files-diff.mjs:3988-3989` - `targetBefore !== null && targetBefore === targetAfter` (log 61: same `...\fdcl-fold\top.txt` both sides); mechanism `src/renderer/src/components/FileTree.tsx:211` - `event.stopPropagation()` | ✅ PASS |
| FDCL-04 | WHEN name or icon clicked THEN folder becomes launcher target | Launcher title ends with the folder path | `scripts/smoke-files-diff.mjs:4019` - `(picked ?? '').replaceAll('\\','/').endsWith('/fdcl-fold')` (log 63) | ✅ PASS for the name; icon click not exercised (gap 4) |
| FDCL-05 | Chevron down when open, right when folded, same glyph/rotation as Folder mode | Open: `transform: none`; folded: `rotate(-90deg)` = `matrix(0, -1, 1, 0, 0, 0)`; glyph `chevron-down` 13 | `scripts/smoke-files-diff.mjs:3969` - `startState.transform === 'none'`; `scripts/smoke-files-diff.mjs:4008` - `foldedState.transform === CHEVRON_RIGHT` (`:3916`); log 60 reads `"transform":"none"`, log 62 and 68 read `"matrix(0, -1, 1, 0, 0, 0)"`. Same glyph and class: `src/renderer/src/components/FileTree.tsx:85-87` (Folder) and `:207,215` (diff) share `file-tree-chevron` + `<Icon name="chevron-down" size={13} />`; rotation from `src/renderer/src/components/FileTree.css:184,188-189` | ✅ PASS (see gap 6 on the run that predates the strengthened predicate) |
| FDCL-06 | Chevron is a focusable button; `aria-expanded` true open / false folded | `button` element; `"true"` / `"false"` | `scripts/smoke-files-diff.mjs:3925` - selector `button.file-tree-chevron`; `:3967` - `startState?.expanded === 'true'`; `:4006` - `foldedState?.expanded === 'false'` (log 60, 62); `src/renderer/src/components/FileTree.tsx:205-208` - `<button type="button" ... aria-expanded={!collapsed.includes(node.path)}>` | ✅ PASS |
| FDCL-07 | Nothing folded THEN every folder drawn open | Rows equal the full tree | `src/renderer/src/lib/files-view.test.ts:91` - `expect(rows(foldTree(tree, []))).toEqual(all)`; `scripts/smoke-files-diff.mjs:3965-3966` (log 60) | ✅ PASS |
| FDCL-08 | Re-list (watch batch, commit, base change) keeps folds | Folded folder still has no rows after the list refreshes | `scripts/smoke-files-diff.mjs:4053-4054` - `relisted.includes('fdcl-new/n.txt') && under(relisted, FDCL_DIR).length === 0` (log 65); state kept apart from listings: `src/renderer/src/lib/use-files.ts:138` | ✅ PASS (re-list triggered by an index change; commit/base-change triggers not exercised, gap 5) |
| FDCL-09 | Switch mode or worktree and back keeps folds | Folded folder still has no rows | `scripts/smoke-files-diff.mjs:4067` - `back.includes(FDCL_DIR) && under(back, FDCL_DIR).length === 0` (log 66) | ✅ PASS for mode switch; worktree switch not exercised (gap 2) |
| FDCL-10 | Folder first appearing after folds is drawn open | New folder `aria-expanded="true"` | `scripts/smoke-files-diff.mjs:4055` - `freshState?.expanded === 'true'` (log 65); by construction the set names closed folders, `src/renderer/src/lib/files-view.ts:78` | ✅ PASS |
| FDCL-11 | Unfold parent whose subfolder was folded first THEN subfolder still folded | Subfolder row present, its children absent | `src/renderer/src/lib/files-view.test.ts:119-120` - `toEqual(['src','readme.md'])` then the tree without `src/app/views/list.tsx`; `scripts/smoke-files-diff.mjs:4078` (log 67) | ✅ PASS |
| FDCL-12 | Fold in one diff mode THEN same path folded in the other two | Folded in Diff to origin, folded in Uncommitted | `scripts/smoke-files-diff.mjs:4094` - `shared.includes('src') && under(shared,'src').length === 0 && srcState?.expanded === 'false'` (log 68); single per-worktree set `src/renderer/src/lib/use-files.ts:138`, read at `src/renderer/src/components/FileTree.tsx:445,504,562` | ✅ PASS for Diff to origin → Uncommitted; Pull request not exercised (gap 1) |
| FDCL-13 (edge) | Folded path absent from the tree THEN render as if not in the set | Rows equal the full tree | `src/renderer/src/lib/files-view.test.ts:132` - `expect(rows(foldTree(tree, ['gone','src/app/missing']))).toEqual(all)` | ✅ PASS |
| FDCL-14 (edge) | Folded folder in Uncommitted keeps hover undo and context menu, acting on every entry under it | Discard lists every file under the folder | `scripts/smoke-files-diff.mjs:4037-4038` - sorted dialog rows equal `[inner/a.txt, inner/b.txt, top.txt]` (log 64); context menu resolves by path, not by drawn children: `src/renderer/src/components/FileTree.tsx:322,465` (`entriesUnder(files.uncommitted, node.path)`) | ✅ PASS for hover undo; context menu on a folded folder not exercised (gap 3) |
| FDCL-15 (edge) | Folded folder holds every change THEN only that folder row shown | Rows equal `['a']` | `src/renderer/src/lib/files-view.test.ts:136` - `expect(rows(foldTree(buildTree([...]), ['a']))).toEqual(['a'])` | ✅ PASS |

**Status**: ✅ All 15 requirements traced to `file:line` evidence whose asserted values match the spec's outcomes.
No spec-precision gaps: every outcome in the spec is observable (rows present/absent, launcher title, aria value,
transform). Six sub-clause coverage gaps are listed below; none is a failed assertion.

---

## Discrimination Sensor

Scratch: detached worktree of HEAD under the session scratchpad, `node_modules` by junction to the real worktree.
Command per mutant: `npx vitest run src/renderer/src/lib/files-view.test.ts`. All mutations target
`src/renderer/src/lib/files-view.ts`.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M1 | `src/renderer/src/lib/files-view.ts:78` | Flipped `collapsed.includes(node.path)` → `!collapsed.includes(...)` | ✅ Killed (6 tests) |
| M2 | `src/renderer/src/lib/files-view.ts:78` | No recursion: open folder keeps `node.children` raw | ✅ Killed (3: FDCL-01, 02, 11) |
| M3 | `src/renderer/src/lib/files-view.ts:73` | Folded folder's own row dropped (`filter` before `map`) | ✅ Killed (3: FDCL-01, 11, 15) |
| M4 | `src/renderer/src/lib/files-view.ts:78` | Prefix match `collapsed.some((c) => c.startsWith(node.path))` instead of exact path | ✅ Killed (3: FDCL-01, 11, 13) |
| M5 | `src/renderer/src/lib/files-view.ts:74` | Folders returned untouched (fold removed) | ✅ Killed (4: FDCL-01, 02, 11, 15) |

**Sensor depth**: lightweight (5 mutations; renderer UI state, not a P0 path)
**Result**: 5/5 killed - PASS

Not sensed: the toggle logic (`toggleCollapsed`, `src/renderer/src/lib/use-files.ts:690-700`) and the chevron's
`stopPropagation` (`src/renderer/src/components/FileTree.tsx:211`). The repo has no hook or component test harness
(no Testing Library; `.specs/codebase/TESTING.md:42`), so no unit test can kill a mutant there; their only
discriminating checks are smoke 17b, 17c and 17h, which cannot run in the scratch.

Isolation: baseline `git status --porcelain` of the real worktree was empty before the sensor; after removing the
junction (`rmdir`, real `node_modules` intact) and `git worktree remove --force`, it is still empty.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code: one pure helper, one state field, one toggle, chevron span → button | ✅ |
| Surgical changes: Folder mode untouched (`FileTree.tsx:72-97`), smoke diff purely additive (214+/0-) | ✅ |
| No scope creep: no collapse-all, no persistence, no Commits mode (Out of Scope honoured) | ✅ |
| Matches patterns: mirrors `expanded`/`toggleFolder` (FXPL-05), co-located pure-helper test | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met: pure helper 1:1 unit tests (FDCL-01, 02, 07, 11, 13, 15); renderer by CDP smoke per `TESTING.md:68` | ✅ |
| Every test maps to a spec requirement - no unclaimed tests (6 unit tests, 9 smoke checks, all tagged FDCL) | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, `.specs/codebase/CONVENTIONS.md` | ✅ |

---

## Edge Cases

- [x] FDCL-13 stale folded path ignored: unit `files-view.test.ts:132`
- [x] FDCL-14 folded folder keeps discard: hover undo by smoke 17e; context menu by code reading only (gap 3)
- [x] FDCL-15 folded folder holding every change shows just its row: unit `files-view.test.ts:136`

---

## Gate Check

- **Gate command**: `npx vitest run src/renderer/src/lib/files-view.test.ts`; `npm run typecheck`; plus the Full gate
  of `TESTING.md:89` (`npx vitest run` full suite, `npx eslint` on the 5 changed source files, without cache)
- **Result**: files-view 63 passed, 0 failed; full suite 3168 passed in 143 files, 0 failed; typecheck exit 0;
  eslint exit 0
- **Test count before feature**: 57 in `files-view.test.ts` (3162 in the suite)
- **Test count after feature**: 63 (3168)
- **Delta**: +6 new unit tests; no test removed, no assertion weakened (the test diff is additive)
- **Skipped tests**: none
- **Smoke (manual gate, from the log)**: 17a..17i all PASS (log lines 60-68). The run shows 3 non-passing checks,
  FPOL-14, FPOL-16, FPOL-18 (log lines 100, 101, 103). They are unrelated to this diff: their `stackState` counts
  `aria-expanded` on `.diff-section-header` (`scripts/smoke-files-diff.mjs:1293-1294`), which since 4a0b428 (already
  in `origin/main`) sits on `button.diff-section-toggle` (`src/renderer/src/components/DiffSection.tsx:143-144`), so the
  count reads 0 regardless (`0 -> 0 of 50`). The feature diff does not touch `DiffSection.tsx`, adds no line to those
  checks, and section 17 runs before `iconChecks`, which reloads the window, ahead of the FPOL section.

---

## Coverage Gaps (ranked; none blocks PASS)

1. **Pull request mode has no runtime evidence** (FDCL-01, 02, 05, 06, 12). The smoke has no PR fixture and calls it
   a hand check (`scripts/smoke-files-diff.mjs:3944-3945`), but the log's hand-check list (A-D) does not include it.
   The wiring is the same expression as the two tested modes (`src/renderer/src/components/FileTree.tsx:504-509`),
   and typecheck passes. Route to interactive UAT: fold a folder in Pull request on a branch with an open PR.
2. **Worktree switch** (FDCL-09) not exercised; only mode switch (17g). State is keyed by worktree path
   (`src/renderer/src/lib/use-files.ts:319`), so it holds by construction. UAT or a smoke step.
3. **Context menu on a folded folder** (FDCL-14) not exercised; only hover undo (17e). Code resolves entries by
   path (`src/renderer/src/components/FileTree.tsx:322,465`), not by the folded node's empty `children`.
4. **Icon click** (FDCL-04) not exercised; only the name (17d). The icon has no handler of its own and bubbles to the
   row's `onClick` (`src/renderer/src/components/FileTree.tsx:202,217`).
5. **Re-list triggers** (FDCL-08): only an index change (staging) is exercised; commit and base change are not.
   The fold set lives apart from every listing (`src/renderer/src/lib/use-files.ts:138`).
6. **Strengthened 17a/17c predicates not in a recorded run.** The exact-transform asserts
   (`scripts/smoke-files-diff.mjs:3969,4008`) were added after or around the full run (script mtime 07:41:46, log
   finished 07:46; product sources last touched 07:37, before the run). The logged observed values (`"none"` in 17a,
   `"matrix(0, -1, 1, 0, 0, 0)"` in 17c and 17i) satisfy the current predicates, so the risk is only that the
   predicate code itself has not executed once. Re-run `SMOKE_ONLY=folders` before the PR.

---

## Requirement Traceability Update

(Not written to `spec.md`: the Verifier's write scope is this report only.)

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FDCL-01 | Implementing | ✅ Verified (PR mode pending UAT) |
| FDCL-02 | Implementing | ✅ Verified |
| FDCL-03 | Implementing | ✅ Verified |
| FDCL-04 | Implementing | ✅ Verified (name; icon by code) |
| FDCL-05 | Implementing | ✅ Verified |
| FDCL-06 | Implementing | ✅ Verified |
| FDCL-07 | Implementing | ✅ Verified |
| FDCL-08 | Implementing | ✅ Verified |
| FDCL-09 | Implementing | ✅ Verified (mode; worktree by code) |
| FDCL-10 | Implementing | ✅ Verified |
| FDCL-11 | Implementing | ✅ Verified |
| FDCL-12 | Implementing | ✅ Verified (PR mode pending UAT) |
| FDCL-13 | Implementing | ✅ Verified |
| FDCL-14 | Implementing | ✅ Verified (hover undo; context menu by code) |
| FDCL-15 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready, with the hand checks of gaps 1-2 and the smoke re-run of gap 6 before the PR

**Spec-anchored check**: 15/15 requirements matched spec outcome; 0 spec-precision gaps; 6 sub-clause coverage gaps
**Sensor**: 5/5 mutations killed
**Gate**: 63/63 (file), 3168/3168 (suite), typecheck and eslint clean

**What works**: folding and unfolding from the chevron, launcher target untouched by the chevron and set by the name,
chevron rotation and `aria-expanded`, folds kept across a re-list, a mode switch and between Diff to origin and
Uncommitted, nested folds restored, stale paths ignored, discard of a folded folder.

**Next steps**: UAT in Pull request mode and across a worktree switch; re-run `SMOKE_ONLY=folders` to execute the
strengthened 17a/17c.

## Follow-up: gap 6 closed (2026-10-11)

`SMOKE_ONLY=folders` re-run against a freshly seeded fixture and a freshly launched app, with the strengthened
17a/17c: 9/9 PASS. 17a read `"transform":"none"` on the open chevron and 17c read
`"transform":"matrix(0, -1, 1, 0, 0, 0)"` on the folded one, the exact values the checks now require (FDCL-05, 06).
Gaps 1-5 stand as listed; 1 and 2 remain hand checks.
