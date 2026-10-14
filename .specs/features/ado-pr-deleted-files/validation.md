# ADO PR Deleted Files Validation

**Date**: 2026-10-13
**Spec**: `.specs/features/ado-pr-deleted-files/spec.md` (APDF-01..06)
**Diff range**: `3352054..72f5257` (2 commits: `1ebe945` fix, `72f5257` tests)
**Verifier**: independent sub-agent (author ≠ verifier), round 1

## Validation: PASS ✅

All six requirements trace to a test whose asserted value is the spec-defined outcome. Five
behaviour-level mutants of `toChangedPaths` / `statusOf` were all killed, and the new tests fail
with the #179 error (`TypeError: Cannot read properties of null (reading 'startsWith')`) against
the pre-fix `ado-pr-model.ts` from `3352054`, so the success criterion "fails on the current
`toChangedPaths` and passes after the fix" holds.

---

## Task Completion

No `tasks.md`: a small feature executed inline. The two commits cover the whole spec:

| Commit | Content | Status |
| ------ | ------- | ------ |
| `1ebe945` | `toChangedPaths` reads `originalPath` when `item.path` is null, drops pathless entries; `AdoChange.item.path` typed `string \| null`; existing test fixture switched to the wire shape | ✅ Done |
| `72f5257` | APDF-01/05/06 model tests, APDF-03 `getPr` test, APDF-04 `fileSides` test | ✅ Done |

---

## Spec-Anchored Acceptance Criteria

| ID | Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -- | ------------------------- | -------------------- | ----------------------- | ------ |
| APDF-01 | WHEN `item.path: null`, `originalPath: "/src/old.ts"` THEN listed as deleted under the original path, no `oldPath` | `{ path: "src/old.ts", status: "deleted" }`, no `oldPath` key | `src/main/ado-pr-model.test.ts:110` - `.toStrictEqual([{ path: 'src/old.ts', status: 'deleted', changeTrackingId: 1 }])` (strict: an `oldPath` key, even `undefined`, fails it); also `:75` in the change-type map | ✅ PASS |
| APDF-02 | WHEN `item.path` is set THEN listed under `item.path`, `oldPath` from `originalPath` when present, as today | rename: `path` = item path, `oldPath` = original path; edit without `originalPath`: no `oldPath` | `src/main/ado-pr-model.test.ts:92-95` - `.toEqual([{ path: 'docs/guide.md', status: 'renamed', oldPath: 'docs/readme.md', changeTrackingId: 7 }, { path: 'package.json', status: 'modified', changeTrackingId: 8 }])`; `:72-78` - rename / `edit, rename` paths `src/moved.ts`, `src/reworked.ts` | ✅ PASS |
| APDF-03 | WHEN `getPr` reads a PR whose changes include `item.path: null` + `originalPath` THEN `kind: "ok"` with the file listed as deleted | `kind: "ok"`; files include `{ path: "src/old.ts", status: "deleted" }` | `src/main/ado-pr.test.ts:332` - `expect(result.kind).toBe('ok')`; `:333-336` - `result.detail.files` `.toStrictEqual([{ path: 'src/app.ts', status: 'modified', changeTrackingId: 1 }, { path: 'src/old.ts', status: 'deleted', changeTrackingId: 2 }])`; fixture at `:316-321` is the #179 wire shape (`item: { originalObjectId, path: null }`) | ✅ PASS |
| APDF-04 | WHEN `fileSides` reads a deleted file by its `originalPath` THEN original = text at the merge base, modified = `absent` | `original: { kind: 'text', text }` read at `commonRefCommit` of the latest iteration (`bbb3`); `modified: { kind: 'absent' }` | `src/main/ado-pr.test.ts:555-559` - `.toEqual({ original: { kind: 'text', text: 'old\n', size: 4 }, modified: { kind: 'absent' }, eolChanged: [] })`; `:562-569` - item reads `.toEqual([['/src/old.ts', 'bbb3'], ['/src/old.ts', 'aaa3']])` (merge base, then source) | ✅ PASS |
| APDF-05 | IF an entry has neither `item.path` nor `originalPath` THEN it is left out and every other entry kept | 2 of 3 entries returned, order kept | `src/main/ado-pr-model.test.ts:138-141` - `.toStrictEqual([{ path: 'src/app.ts', status: 'modified', changeTrackingId: 1 }, { path: 'src/old.ts', status: 'deleted', changeTrackingId: 3 }])` | ✅ PASS |
| APDF-06 | IF `item.path: null` and a combined change type containing `delete` THEN listed as `deleted` under `originalPath` | `{ path: "src/gone.ts", status: "deleted" }` for `delete, sourceRename` | `src/main/ado-pr-model.test.ts:123` - `.toStrictEqual([{ path: 'src/gone.ts', status: 'deleted', changeTrackingId: 2 }])` | ✅ PASS |

**Status**: ✅ All ACs covered, 6/6 match the spec outcome, no spec-precision gaps.

Payload rule: APDF-04 asserts the request payload (`path` and `versionDescriptor.version` per item read),
not only that reads happened, so a read at the wrong commit would fail it.

Note on APDF-04: `fileSides` was not changed (spec assumption "No client change needed"), so this test
is a characterization test and passes on the pre-fix code too; it is the evidence that the existing
404-to-`absent` path covers a deleted file's modified side.

---

## Discrimination Sensor

Run in a temporary `git worktree` at `HEAD` outside the repo (node_modules by junction), tests
`src/main/ado-pr-model.test.ts` + `src/main/ado-pr.test.ts` (49 tests). Baseline in the scratch: 49 passed.

| Mutation | File:line | Description | Killed? | Killing tests |
| -------- | --------- | ----------- | ------- | ------------- |
| M1 | `src/main/ado-pr-model.ts:98` | Set `oldPath` for deletes: dropped `entry.item.path !== null &&` | ✅ Killed (4 failed) | APDF-01, 03, 05, 06 |
| M2 | `src/main/ado-pr-model.ts:91` | Dropped the `originalPath` fallback (`const path = entry.item.path`) | ✅ Killed (5 failed) | change-type map, APDF-01, 03, 05, 06 |
| M3 | `src/main/ado-pr-model.ts:91` | Kept pathless entries (`?? ''`, listed with an empty path) | ✅ Killed (1 failed) | APDF-05 |
| M4 | `src/main/ado-pr-model.ts:91` | Ignored `item.path` when set (`originalPath ?? item.path`) | ✅ Killed (2 failed) | change-type map, leading-slash/oldPath (APDF-02) |
| M5 | `src/main/ado-pr-model.ts:265` | Misclassified a combined delete (`changeType === 'delete'` instead of `kinds.includes('delete')`) | ✅ Killed (1 failed) | APDF-06 |

Red-before check: the pre-fix `src/main/ado-pr-model.ts` from `3352054` with the new tests fails 5 tests
(change-type map, APDF-01, 03, 05, 06), each with `TypeError: Cannot read properties of null (reading 'startsWith')`.

**Sensor depth**: lightweight (5 mutants, the cap for this round)
**Result**: 5/5 killed - PASS ✅
**Isolation**: `git status --porcelain` empty before and after; scratch worktree removed and pruned.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ one function and one type changed in production code |
| Surgical changes | ✅ `src/main/ado-pr-model.ts` only; `ado-pr.ts` untouched |
| No scope creep | ✅ thread contexts and GitHub left alone, as the spec's Out of Scope says |
| Matches patterns | ✅ same `relative` / `statusOf` helpers, comments cite the issue |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met (domain 1:1 ACs; client happy path) | ✅ |
| Every test maps to a spec requirement - no unclaimed tests | ✅ each new test names its APDF id; the edited fixture at `ado-pr-model.test.ts:53-58` is the #179 shape |
| Documented guidelines followed: none - strong defaults applied | ✅ |

Observation (non-blocking, outside the wire shape): the `oldPath` guard is `entry.item.path !== null`
(`src/main/ado-pr-model.ts:98`), while the spec's rule says "when `item.path` is a string". They differ
only if `item.path` is absent (`undefined`) and `originalPath` is set: the entry would list under
`originalPath` with an `oldPath` equal to its own path. The `AdoChange` type and the #179 payload both
make `item.path` `string | null`, so this is not reachable from the observed wire shape.

---

## Edge Cases

- [x] Entry with neither `item.path` nor `originalPath`: left out, others kept (APDF-05).
- [x] `item.path: null` with a combined type containing `delete`: listed as `deleted` under `originalPath` (APDF-06).

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (repo gate)
- **Typecheck**: exit 0
- **Lint**: 0 errors, 18 warnings repo-wide; `npx eslint` on the three changed `src` files: clean
- **Tests**: 3177 passed, 0 failed, 0 skipped (143 files)
- **Test count before feature** (the two files at `3352054`): 44
- **Test count after feature**: 49
- **Delta**: +5 new tests (3 model, 1 `getPr`, 1 `fileSides`); no test deleted; one fixture changed from
  `item: { path: '/src/old.ts' }` to the #179 shape, with the same asserted status
- **Failures**: none

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| APDF-01 | Implementing | ✅ Verified |
| APDF-02 | Implementing | ✅ Verified |
| APDF-03 | Implementing | ✅ Verified |
| APDF-04 | Implementing | ✅ Verified |
| APDF-05 | Implementing | ✅ Verified |
| APDF-06 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 6/6 ACs matched spec outcome, 0 spec-precision gaps
**Sensor**: 5/5 mutations killed
**Gate**: 3177 passed, 0 failed

**What works**: a pull request that deletes files opens with each deleted file listed as `deleted`
under its original path and no `oldPath`; renames keep their `oldPath`; a pathless entry is dropped
without failing the read; a deleted file's diff reads the original at the merge base and an absent
modified side.

**Issues found**: none blocking. One non-blocking observation on the `!== null` guard (Code Quality).

**Next steps**: open the PR. Manual check of the #179 pull request in the app stays with the owner
(success criterion 1 needs a live pull request).
