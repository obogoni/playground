# Auto-Pin Tasks from Worktrees Validation

## Validation verdict: PASS

**Date**: 2026-09-29
**Spec**: `.specs/features/auto-pin-from-worktrees/spec.md`
**Diff range**: `origin/main..71ab7eb` (e29692e..71ab7eb, 11 commits, branch `feature/auto-pin-from-worktrees`)
**Verifier**: independent sub-agent (author ≠ verifier)
**Iteration**: fix→re-verify round 1 of 3

The previous run (at b62ccb2) was FAIL with two gaps and one spec-precision gap. Round-1 fixes:

- **49dee14** changes the matcher's separator placement, extends the round-trip test, and adds a spec Assumptions row declaring adjacent numeric placeholders unsupported.
- **71ab7eb** adds the unpin→re-pin test.

All three findings are closed.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 config flag | ✅ Done | - |
| T2 `taskIdFromTemplate` | ✅ Done | trailing-optional-segment round-trip fixed in 49dee14 |
| T3 `derivedTaskRefs` | ✅ Done | - |
| T4 stale `pinnedTasks` write in `pin` | ✅ Done | - |
| T5 `TaskBoard.autoPin` | ✅ Done | unpin→re-pin test added in 71ab7eb |
| T6 `runAutoPin` | ✅ Done | - |
| T7 main wiring | ✅ Done | typecheck + author CDP |
| T8 renderer subscription | ✅ Done | typecheck + author CDP |
| T9 refresh keeps details | ✅ Done | - |

---

## Spec-Anchored Acceptance Criteria

### P1: Template matcher (APIN-01..04)

| # | Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| - | --------- | -------------------- | ----------------------- | ------ |
| 1 | `user/otavio/{id}-{slug}` + `user/otavio/4821-fix-login` | `4821` | `src/shared/tasks.test.ts:178` - `expect(taskIdFromTemplate(MINE, 'user/otavio/4821-fix-login')).toBe(4821)` | ✅ PASS |
| 2 | literal mismatch / `main` | `null` | `src/shared/tasks.test.ts:182-183` - `.toBeNull()` for `user/maria/4821-x` and `main` | ✅ PASS |
| 3 | `{type}` = feature/bugfix only | `77`, `77`, `null` | `src/shared/tasks.test.ts:187-189` | ✅ PASS |
| 4 | optional placeholder-only segment | `123` both | `src/shared/tasks.test.ts:193-194` - `.toBe(123)` ×2 | ✅ PASS |
| 5 | template without `{id}` | `null` | `src/shared/tasks.test.ts:198` - `.toBeNull()` | ✅ PASS |
| 6 | blank/null template → default | default applies | `src/shared/tasks.test.ts:202-204` | ✅ PASS |
| 7 | anchored + case-insensitive | whole-branch match, `i` | `src/shared/tasks.test.ts:208` (`.toBe(4821)`), `:212-213` (`.toBeNull()`) | ✅ PASS |
| 8 | round-trip against `branchNameFor` | the rendered id | `src/shared/tasks.test.ts:254` - `toEqual({template, branch, id: 4821})` over 8 templates, including the three former counterexamples `{id}/{slug}`, `user/{id}/{dev}`, `{type}/{id}-{slug}/{usId}` (`:232-241`) × 2 titles × 2 types × 4 contexts | ✅ PASS |

The AC 8 scope is now precise. `spec.md:46` (Assumptions) declares adjacent numeric placeholders (`{usId}{id}`) unsupported for round-trip, which closes the previous spec-precision gap.

**Independent AC 8 probe (scratch, not committed)**: I ran 160 `branchNameFor` → `taskIdFromTemplate` round-trips over 10 templates. Beyond the test table, they included `{id}/{dev}/{slug}` (two trailing optionals), `{dev}/{id}/{usSlug}`, `{dev}/{usId}/{id}/{slug}/{dev}` (leading and trailing optionals), `{id}-{dev}-{slug}` and `x/{dev}/y/{id}`. All 160 returned `4821`.

### P1: Auto-pin on tree refresh (APIN-05..09)

This code is unchanged since the previous run except the new test. Citations were re-checked against the current line numbers.

| # | Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| - | --------- | -------------------- | ----------------------- | ------ |
| 1 | matching branch → fetch defaults/id, append if found | pinned + persisted | `src/main/worktree-tasks.test.ts:30`; `src/main/task-board.test.ts:468-472` | ✅ PASS |
| 2 | already pinned → no fetch, no duplicate | 0 calls | `src/main/task-board.test.ts:482-484` | ✅ PASS |
| 3 | same ref across workspaces → once | one ref | `src/main/worktree-tasks.test.ts:41` | ✅ PASS |
| 4 | added ≥1 → renderer snapshot updates | `tasks:changed` with snapshot; nothing when 0 | `src/main/worktree-tasks.test.ts:101`, `:109`; `src/main/task-board.test.ts:570` (details survive an overlapping refresh); renderer by typecheck + author CDP | ✅ PASS |
| 5 | defaults unset → nothing, no error | `[]` | `src/main/worktree-tasks.test.ts:61-62` | ✅ PASS |
| 6 | auth failure → nothing persisted, `failed`, retried | `failed`, `[]`, 2 calls | `src/main/task-board.test.ts:494-497` | ✅ PASS |
| 7 | not found → not pinned, not re-fetched | `[]`, 1 call | `src/main/task-board.test.ts:507-510` | ✅ PASS |
| 8 | concurrent passes don't pin twice | one pin, one fetch | `src/main/task-board.test.ts:519-521`, `:530`, `:429`, `:437` | ✅ PASS |
| 9 | toggle `false` → nothing | 0 calls, `[]` | `src/main/task-board.test.ts:580-582` | ✅ PASS |
| 10 | workspace override beats global | per-workspace | `src/main/worktree-tasks.test.ts:54`, `:143` | ✅ PASS |

**Wiring (index.ts `tree:get`, `ipc-contract.ts` `tasks:changed`, `App.tsx` subscription)**: covered by `npm run typecheck` (exit 0) plus the author-reported live CDP check (8/8 PASS; not re-run by the Verifier). The checks were startup auto-pin, `user/maria/*` ignored, live title, pin on focus for an externally created worktree, details kept after a concurrent refresh, unpin removes, next refresh re-pins, and `pinnedTasks` persisted.

**Status**: ✅ 18/18 ACs match the spec outcome; no open spec-precision gaps.

---

## Edge Cases

- [x] Detached worktree skipped: `src/shared/tasks.test.ts:222-223`, `src/main/worktree-tasks.test.ts:68`
- [x] Malformed workspace config → global template: `src/main/workspace-config.test.ts:78` + `src/main/worktree-tasks.test.ts:143`
- [x] `0` skipped, `0042` → `42`: `src/shared/tasks.test.ts:217-218`
- [x] Missing `autoPinFromWorktrees` → `true`: `src/main/config-store.test.ts:81`; `false` survives reload `:88`
- [x] Unpinned while the worktree still matches → re-pinned on the next refresh: `src/main/task-board.test.ts:541-543` - `again.added` `toBe(1)`, `source.calls` `toHaveLength(2)`, `persistedIds()` `toEqual([4821])` (new in 71ab7eb; kills M18)

**Informational, not a gap**: the matcher accepts `4821/` for `{id}/{slug}`, `user/4821/` for `user/{id}/{dev}` and `/4821` for `{dev}/{id}`, because an empty-able pattern can match empty next to its optional separator. Git's `check-ref-format` rejects branch names with a leading or trailing `/`, so a worktree can never report such a branch. The pre-fix matcher accepted the trailing form too.

---

## Discrimination Sensor

Scratch: `git worktree add %TEMP%\apin-verify-scratch2 71ab7eb` with a `node_modules` junction. The junction was removed via `rmdir` before `git worktree remove --force`, and main `node_modules` was intact afterwards. Real-tree `git status --porcelain` was captured before sensor work and diffed after cleanup: identical. The only entries in both are this report and the `.specs` lessons files from the previous run. `git stash` was not used.

### Round 1 (this run, at 71ab7eb)

| Mutation | File | Description | Killed by | Killed? |
| -------- | ---- | ----------- | --------- | ------- |
| M18 | `src/main/task-board.ts` unpin | unpin adds the ref to `notFound` | `task-board.test.ts:533` | ✅ Killed (survived last run) |
| S1 | `src/shared/tasks.ts:120` | after-`{id}` optional uses the before rule `(?:seg/)?` | `tasks.test.ts:231` | ✅ Killed |
| S2 | `src/shared/tasks.ts:120` | drop the `i > lastMandatory` branch | `tasks.test.ts:231` | ✅ Killed |
| S3 | `src/shared/tasks.ts:121` | before-`{id}` optional uses the after rule `(?:/seg)?` | `tasks.test.ts:192`, `:231` | ✅ Killed |
| S4 | `src/shared/tasks.ts:122` | `i < lastMandatory` → `<=` (stray `/` after the `{id}` segment) | 12 tests incl. `tasks.test.ts:177` | ✅ Killed |
| S5 | `src/shared/tasks.ts:117` | `findLastIndex` → `findIndex` | `tasks.test.ts:192`, `:231` | ✅ Killed |
| S6 | `src/shared/tasks.ts:120` | trailing optional made mandatory (`/seg`) | `tasks.test.ts:231` | ✅ Killed |
| M4 (re-run) | `src/shared/tasks.ts:125` | drop `$` anchor | `tasks.test.ts:211` | ✅ Killed |
| M5 (re-run) | `src/shared/tasks.ts:125` | drop `i` flag | `tasks.test.ts:207` | ✅ Killed |
| M15 (re-run) | `src/shared/tasks.ts` | `{type}` → `[^/]+` | `tasks.test.ts:186` | ✅ Killed |
| M16 (re-run) | `src/shared/tasks.ts` | `-` next to empty-able never optional | `tasks.test.ts:231` | ✅ Killed |

### Carried over from the previous run (code unchanged since b62ccb2)

These were all killed against b62ccb2. Their target lines are untouched by 49dee14 and 71ab7eb, and the test files only gained cases.

| Mutation | Target | Killed by |
| -------- | ------ | --------- |
| M1 | drop the `notFound` skip | `task-board.test.ts:500` |
| M2 | drop the `inflight` guard | `task-board.test.ts:513` |
| M3 | skip the toggle check | `task-board.test.ts:573` |
| M4b | drop the `^` anchor | `tasks.test.ts:211` |
| M7 | drop the refresh detail-preservation loop | `task-board.test.ts:546` |
| M8 | emit when `added === 0` | `worktree-tasks.test.ts:104` |
| M9 | never record `notFound` | `task-board.test.ts:500` |
| M10 | don't set `auth = 'failed'` | `task-board.test.ts:487` |
| M11 | ignore the workspace override | `worktree-tasks.test.ts:125` |
| M12 | `\|\|` → `&&` in the defaults guard | `worktree-tasks.test.ts:57` |
| M13 | `appendPins` without the current-set filter | `task-board.test.ts:432` |
| M14 | accept id 0 | `tasks.test.ts:216` |
| M17 | no dedup | `worktree-tasks.test.ts:35` |
| M19 | revert T4 stale write | `task-board.test.ts:424` |
| M20 | auth failure marks `notFound` | `task-board.test.ts:487` |

Mutant M6 from the previous run targeted the old segment-join code, which 49dee14 replaced; S1 to S6 supersede it.

**Sensor depth**: expanded (11 mutations this round + 15 carried over)
**Sensor totals**: 11/11 killed this round; 0 survivors across the feature.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code (fix is a 6-line change to the segment join) | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ✅ |
| Per-layer Coverage Expectation met | ✅ |
| Every test maps to a spec requirement (new test → Edge Case 5) | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, `vitest.config.ts` | ✅ |

---

## Gate Check

- **Gate command (Verifier)**: `npx vitest run src/shared/tasks.test.ts src/main/worktree-tasks.test.ts src/main/task-board.test.ts src/main/config-store.test.ts` (exit 0) and `npm run typecheck` (exit 0)
- **Gate outcome**: 114 passed, 0 failed, 0 skipped (4 files)
- **Test count before feature** (same 4 files): 80
- **Test count after feature**: 114 (+34; no deletions)
- **Author-reported (not re-run)**: lint 0 errors; full suite 2226 passed / 2 failed. The 2 failures are the known pre-existing FDSC-05 file-discard and worktree-manager force-remove.

---

## Requirement Traceability Update

| Requirement | New Status |
| ----------- | ---------- |
| APIN-01 | ✅ Verified |
| APIN-02 | ✅ Verified |
| APIN-03 | ✅ Verified |
| APIN-04 | ✅ Verified (fixed in 49dee14) |
| APIN-05 | ✅ Verified |
| APIN-06 | ✅ Verified (renderer half author-reported CDP) |
| APIN-07 | ✅ Verified |
| APIN-08 | ✅ Verified |
| APIN-09 | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 18/18 ACs matched the spec outcome; 0 open spec-precision gaps
**Sensor**: 11/11 killed this round (M18 now killed); 0 survivors feature-wide
**Gate**: 114 passed, typecheck exit 0

**What works**: everything in APIN-01..09, including round-trip for templates with trailing, leading and multiple empty-able segments, and auto-pin returning an unpinned task on the next pass.

**Issues found**: none blocking. Informational only: branch strings with a leading or trailing `/` match, but git forbids them.

**Next steps**: feature can be marked done; update `spec.md` traceability statuses to Verified.
