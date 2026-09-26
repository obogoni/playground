## Validation: status-changes-refresh — PASS

**Date**: 2026-09-26 (iteration 2 of 3)
**Spec**: `.specs/features/status-changes-refresh/spec.md` (SCRF-01..SCRF-11 and Edge Cases)
**Diff range**: `origin/main..HEAD` (`4df70a9..47d73a4`). Code runs from `a8e21c4` to `5d7feae`. Fix round 1 is
`c780315`, `e632b96`, `5d7feae` and `47d73a4`, on top of `9593704`.
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree

All 11 ACs and the three edge cases have `file:line` evidence, and all 10 mutants of this round were killed,
including the two that survived iteration 1. The gate is green. SCRF-06's wiring half rests on a recorded
acceptance, which I judge adequate and non-blocking (see "SCRF-06 acceptance" below).

---

## Iteration 1 (history)

Iteration 1 was FAIL on `9593704`: 16 mutants, 14 killed, 2 survived. This is how each gap was handled:

| # | Iteration-1 gap | Fix | Re-verified |
| - | --------------- | --- | ----------- |
| 1 | M8 survived: a git dir that failed to resolve was never retried, and no test checked it | `c780315` adds `git-state-watcher.test.ts:209-219` | M8 killed |
| 2 | M16 survived: the 250 ms window was asserted only as `BATCH_MS` | `c780315` asserts `toEqual([250])` at `:116`, `:142` and `BATCH_MS toBe(250)` at `:117` | M16 killed |
| 3 | SCRF-06 partial: keep-last-count and logging had no executable evidence | `47d73a4` records an explicit acceptance under T5 (`tasks.md:219`) | judged adequate, see below |
| 4 | Smoke observer `scrfChanges()` used plain `git status`, which rewrites the index | `5d7feae` adds `--no-optional-locks` (`smoke-status-bar.mjs:1263-1264`) | read; fixed |
| 5 | Spec Assumptions row still named `deriveAttribution` | `47d73a4` rewords it to `worktreeIdForPath` | read; fixed |
| 6 | T8 turn end read off `sessions` state, so two pushes landing in one render could hide `working` | `e632b96` adds a per-push `session:activity` subscription (`App.tsx:256-272`) | read, plus author smoke; see below |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | Done | Measurement and baselines (1663 tests / 18 warnings) |
| T2 | Done | `worktreeStatus`, `--no-optional-locks` |
| T3 | Done | `GitStateWatcher`, plus the tests pinned in `c780315` |
| T4 | Done | IPC channels |
| T5 | Done, deviation | Closes on `will-quit`. SCRF-06 wiring accepted without tests |
| T6 | Done, deviation | Uses `worktreeIdForPath`; spec row updated |
| T7 | Done | `use-tree` push and `recount` |
| T8 | Done, reworked | Per-push `session:activity` subscription (`e632b96`) |
| T9 | Done | Smoke: commit and focus; observer made index-safe (`5d7feae`) |
| T10 | Done | Smoke: turn end |

---

## Spec-Anchored Acceptance Criteria

The smoke needs a live dev app, and the Verifier did **not** run it. Smoke rows cite `scripts/smoke-status-bar.mjs`
and rest on the author's run outputs in the session scratchpad:

- iteration 1: `smoke-final.txt`, `smoke-mutA-watcher-off.txt`, `smoke-mutB-focus-turn-off.txt`, `smoke-mutC-no-debounce.txt`
- fix round: `smoke-fix1-final.txt`, `smoke-fix1-mut-turn-off.txt`

I judged each check by reading its expression. In both fix-round runs the one failing line, `the script ran to
completion`, comes from the changes-popover section that T9 already recorded as broken on `main`. That section
runs after the SCRF checks.

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Verdict |
| -- | -------------------- | ---------------------------------- | ------- |
| SCRF-01 | A change to `index`/`HEAD` in a watched git dir recounts that worktree and shows the count within 2 s | Unit: `src/main/git-state-watcher.test.ts:102` watch is non-recursive on the git dir; `:116-119` `delays toEqual([250])` then `settled toEqual([A])`; HEAD settles at `:122`; only B settles at `:146`; other entries never settle at `:156`. `src/renderer/src/lib/tree-status.test.ts:33-35` patch `toMatchObject({dirty:true, changes:1})`. Smoke: `:1338` `b.changes === '1' && took <= 2000 && scrfChanges() === 1`. Fix-round run: 438 ms. Falsified in mutA (watcher off: `3 after 4357 ms`) | PASS |
| SCRF-02 | Several changes for one worktree within 250 ms make one recount | `git-state-watcher.test.ts:142-143` three fires → `delays toEqual([250])`, `settled toEqual([A])`; `:117` `BATCH_MS toBe(250)`. M4 and M16 killed | PASS |
| SCRF-03 | A git-state recount gives the tree a new identity, even when the count is unchanged | `tree-status.test.ts:47-48` `not.toBe(tree)` and `toEqual(tree)`. Wiring: `use-tree.ts:76`. M14 killed | PASS |
| SCRF-04 | A `tree:get` that adds or drops a worktree starts or stops its watch | `git-state-watcher.test.ts:176` add opens, kept handle `toBe(kept)`, dropped `closed toBe(true)`; `:190` dropped worktree never settles; `:221` dropped while resolving never opens. Wiring: `index.ts:331`. Smoke: `wt/scrf` is added mid-run and its commit is seen. M6, M7, M9, M17 killed | PASS |
| SCRF-05 | A missing path is not watched, and the others are unaffected | `git-state-watcher.test.ts:201` `open() → [GIT_DIRS[B]]` while A fails; `:209-218` A is watched on the next `sync` once it resolves (`toEqual([GIT_DIRS[B], GIT_DIRS[A]])`). `watchPort` swallows throws (`index.ts:144-154`). M8 killed | PASS |
| SCRF-06 | A failed recount keeps the last count, is logged, and never throws | `worktree-manager.test.ts:159` `worktreeStatus(gone)).toBeNull()`; `:155` count `toEqual({dirty:true, changes:3})`. M1, M2, M3 killed. Wiring (`index.ts:182` log, `:323` push skipped on `null`; `use-tree.ts:66` `if (status)`) is accepted on code reading (`tasks.md:219`) | PASS (accepted: wiring half by code reading) |
| SCRF-07 | Activity going `working` → `waiting`/`exited` recounts the worktree containing the session's `cwd` | `tree-status.test.ts:66` (waiting), `:70` (exited), `:75-81` every other transition `toBeNull()`, `:85` subfolder cwd. Wiring: `App.tsx:262-271`. Smoke: `:1434` `stopped === 204 && beforeStop !== '5' && b.changes === '5'`, fix-round run `3 → 5`. Falsified with only `recount` removed and focus left on (`smoke-fix1-mut-turn-off.txt`: `3 → 3`). M12, M13, M15 killed | PASS |
| SCRF-08 | A `cwd` in no worktree recounts nothing | `tree-status.test.ts:91` `('/elsewhere')).toBeNull()`; the listener returns before recount at `App.tsx:269`/`:271` | PASS (unit) |
| SCRF-09 | Focus more than 5 s after the previous focus refresh rebuilds the tree | Smoke only: `:1360` `beforeFocus !== '3' && b.changes === '3'`, fix-round `1 → 3`; falsified in mutB (`1 → 1`). Code: `App.tsx:240-244` | PASS (smoke evidence) |
| SCRF-10 | Focus within 5 s rebuilds nothing | Smoke only: `:1371` `b.changes === '3' && scrfChanges() === 4`; falsified in mutC (`4`). Code: `App.tsx:240` | PASS (smoke evidence) |
| SCRF-11 | The app's `git status` never rewrites the index | `worktree-manager.test.ts:168` and `:177` `indexState()).toEqual(before)` (bytes and mtime). No other `'status'` git call in `src/main`. M1 killed | PASS |

**Status**: 11/11 ACs covered on value. SCRF-06's wiring half is accepted on code reading. SCRF-09 and SCRF-10 rest
on the smoke, as the Test Coverage Matrix planned for the App layer.

### SCRF-06 acceptance

I judge it adequate and **non-blocking**:

- The approved Test Coverage Matrix already gives the main-wiring and hook layers "none (build + smoke)". The
  acceptance is consistent with it, dated, and recorded under the task that owns the wiring (`tasks.md:219`).
- The part that discriminates is tested and killed. That is `worktreeStatus` answering `null` rather than a clean
  zero (M2). The untested remainder is two one-line `null` guards and one `console.warn`.

Two caveats for the PR description, neither blocking:

- The acceptance is written by the author. Owner sign-off belongs in the PR.
- Its claim that "the smoke cannot make a recount fail for a worktree that stays in the tree" overstates the case.
  Breaking a worktree's `.git` gitfile while its git dir fires would do it, though not cheaply.

### Gap 6 fix (`e632b96`) read against SCRF-07

The listener at `App.tsx:262-271` reads `before` from the per-session map. It falls back to the session list only
for a session's first push. That list comes from a ref refreshed after each render (`:256-259`). A `setSessions`
from the same push does not re-render synchronously, so the list still holds the state from before the push,
whichever listener runs first. A push for a session the list does not hold yet is recorded in the map before the
early return, so the next push still compares correctly. No AC is contradicted.

What remains unproven: no executable check shows that the batching case is now handled. The smoke's
`UserPromptSubmit` and `Stop` are 1.5 s apart, and both the old and the new code pass it. The fix is verified by
code reading. The smoke only proves that the new path recounts.

---

## Edge Cases

- [x] **Worktree removed while its recount is in flight → result dropped.** `tree-status.test.ts:52`
  `patchWorktreeStatus(tree,'/repo-a/gone',…)).toBe(tree)` (M11 killed in iteration 1).
  `git-state-watcher.test.ts:190` checks that a dropped worktree's pending settle never fires.
- [x] **App quits → every git-state watcher closed.** `git-state-watcher.test.ts:233` `closeAll`:
  `every(x => x.closed)).toBe(true)` and `settled toEqual([])` (M7 killed). Wiring: `index.ts:389` in `will-quit`,
  by code reading.
- [x] **Git-state event and full rebuild race → later wins.** The rebuild replaces the tree. The recount patches only
  a worktree that is still present (`tree-status.test.ts:52`). No test drives the interleaving.

---

## Payload / conjunction rule

- **`worktree:status` push `{ worktreePath, dirty, changes }`** (`index.ts:323-325`): no unit test asserts the
  emitted payload. Its fields are observed by value only through the smoke, where the bar's count follows
  `changes` and the patch lands only when `worktreePath` matches. The consumer's use of `dirty` and `changes` is
  asserted on value (`tree-status.test.ts:33`, `:41`).
- **`worktrees:status` response**: the producer is asserted on value (`worktree-manager.test.ts:155`, `:159`). The
  handler and `use-tree` consumer are observed only by the SCRF-07 smoke check.
- **`id` versus `path`**: `worktreeForTurnEnd` returns the worktree `id` and `patchWorktreeStatus` matches `path`.
  They agree because `buildTree` sets `id: block.path` (`worktree-manager.ts:40-42`), and the SCRF-07 smoke pass
  shows they agree in the app. The unit fixture sets `id === path`, so no unit test would catch a divergence.

---

## Recorded deviations vs the spec

| Deviation | Contradicts an AC? |
| --------- | ------------------ |
| T5: close on `will-quit`, not `window-all-closed` | No. `will-quit` fires on every quit, including the `app.quit()` from `window-all-closed` (`index.ts:750-760`) |
| T6: `worktreeIdForPath`, not `deriveAttribution` | No. It matches SCRF-07's "containing" wording, and the spec Assumptions row now says so (`47d73a4`) |
| T8: now its own `session:activity` subscription (`e632b96`) | No. See "Gap 6 fix" above |

---

## Discrimination Sensor

Isolated scratch: `git worktree add --detach <scratchpad>/verifier-sensor HEAD` at `47d73a4`, with a directory
junction to `D:\playground-main\node_modules`. Unmutated baseline in the scratch: watcher and tree-status files,
21 tests passing. Each mutant was applied alone and run with `npx vitest run <file>`. The file was then restored
and byte-compared; the driver is `verifier-mutate.py` in the scratchpad. This round re-ran the fix targets (M8,
M16), added one new mutant (M17), and re-sampled earlier mutants on the changed and adjacent code.

| # | File:line | Mutation | Killed? |
| - | --------- | -------- | ------- |
| M1 | `src/main/worktree-manager.ts:420` | drop `--no-optional-locks` (SCRF-11) | Killed (`:168`, `:177`) |
| M4 | `src/main/git-state-watcher.ts:74` | no coalescing (SCRF-02) | Killed |
| M5 | `src/main/git-state-watcher.ts:68` | `recursive: true` (SCRF-01) | Killed |
| M7 | `src/main/git-state-watcher.ts:83` | `close` keeps the pending batch (SCRF-04, quit) | Killed (2 tests) |
| M8 | `src/main/git-state-watcher.ts:63` | a failed resolve leaves a stale entry, so the path is never retried (SCRF-05) | **Killed** (`:209`); survived in iteration 1 |
| M9 | `src/main/git-state-watcher.ts:44` | `sync` never closes dropped worktrees (SCRF-04) | Killed (3 tests) |
| M12 | `src/renderer/src/lib/tree-status.ts:44` | `exited` no longer ends a turn (SCRF-07) | Killed |
| M14 | `src/renderer/src/lib/tree-status.ts:20` | skip the patch when the count is unchanged (SCRF-03) | Killed |
| M16 | `src/main/file-watcher.ts:5` | `BATCH_MS` 250 → 25 (SCRF-02) | **Killed** (`:116`, `:142`); survived in iteration 1 |
| M17 | `src/main/git-state-watcher.ts:46-47` | new: `sync` re-opens every wanted path, duplicating live watches (SCRF-04) | Killed (`:176`, `:209`) |

**Sensor depth**: expanded. **Kill ratio this round**: 10/10 killed, 0 survived. Iteration 1 also killed
M2, M3, M6, M10, M11, M13 and M15, and that code is unchanged since.

The `App.tsx` turn-end listener has no unit tests; the matrix makes the App layer build-plus-smoke. Its
falsification is the author's `smoke-fix1-mut-turn-off.txt`: with only `recount` removed, SCRF-07 fails
`3 → 3` while focus stays on. So the check now discriminates the turn-end trigger on its own, not jointly with
focus as in iteration 1's mutB.

Isolation:

- Before the sensor, the real-tree `git status --porcelain` showed only `?? .specs/features/status-changes-refresh/validation.md`.
- After `cmd /c rmdir` of the junction and `git worktree remove --force` of the scratch, it was identical.
- `node_modules` is intact, and `git worktree list` shows only the main checkout.

---

## Gate Check

- **Command**: `npm run typecheck && npm run lint && npm test` on the real tree, exit 0
- **Typecheck**: node and web clean
- **Lint**: 0 errors, 18 warnings (baseline 18, unchanged)
- **Tests**: 1688 passed, 0 failed, 0 skipped, 92 files
- **Test count**: 1663 before the feature, 1687 at iteration 1, 1688 now (+1 from `c780315`). No test was removed,
  and the two edited assertions got stricter (`BATCH_MS` → `250`)

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | OK |
| Surgical changes | OK. The fix round touched only the flagged spots |
| No scope creep | OK |
| Matches patterns | OK. The subscription follows `use-sessions`' `api.on` pattern |
| Spec-anchored outcome check | OK. The 250 ms value is now pinned |
| Per-layer coverage expectation | Met per the approved matrix |
| Every test maps to a spec requirement | Yes. The new test names SCRF-05 |
| Documented guidelines | `.specs/codebase/TESTING.md`, `vitest.config.ts` |

---

## Remaining gaps (ranked, none blocking)

1. **SCRF-06 wiring rests on an acceptance the author wrote** (`tasks.md:219`; code at `index.ts:182`, `:323` and
   `use-tree.ts:66`). Surface it in the PR for owner sign-off. Its "the smoke cannot" wording is stronger than the
   facts support.
2. **The gap-6 batching fix has no executable proof** (`App.tsx:256-272`). The smoke proves the new listener
   recounts. It cannot tell the old path from the new one, because the two hook POSTs are 1.5 s apart.
3. **The `worktree:status` push payload is checked on value only through the smoke** (`index.ts:323-325`).
4. **`id`/`path` equality is assumed by the unit fixture** (`tree-status.test.ts:7`) and guaranteed only by
   `buildTree` (`worktree-manager.ts:40-42`).
5. **Negligible**: the per-session last-seen map (`App.tsx:255`) is never pruned when sessions are removed.

---

## Requirement Traceability Update

| Requirement | Status |
| ----------- | ------ |
| SCRF-01..05, 07..11 | Verified |
| SCRF-06 | Verified (wiring half accepted on code reading, `tasks.md:219`) |

---

## Summary

**Overall**: ready.
**Spec-anchored check**: 11/11. One accepted partial (SCRF-06 wiring); SCRF-09 and SCRF-10 rest on smoke evidence.
**Sensor**: this round 10 injected, 10 killed. Across both iterations, 17 distinct mutants, all killed on the current code.
**Gate**: 1688 passed; lint 0 errors / 18 warnings.

---

## Lesson candidates

From iteration 1's grounded failures (two surviving mutants, one spec-assumption drift, one smoke-observer
defect), all fixed in round 1:

- **pin-spec-constants-by-value**
  - Problem: SCRF-02's 250 ms was asserted only as `toEqual([BATCH_MS])`, so changing the constant broke no
    test (M16).
  - Fix: when a spec states a number, at least one test asserts the literal.
- **test-the-retry-after-failure**
  - Problem: only the "skip on failure" half of `GitStateWatcher.open` was tested, so a stale entry that blocked
    any retry survived (M8).
  - Fix: every skip-on-failure path also gets a test where the failure clears and the next attempt succeeds.
- **smoke-observers-must-be-side-effect-free**
  - Problem: the smoke read its count with plain `git status`, the very command measured to rewrite the watched
    index.
  - Fix: probe state in smoke checks with the same side-effect-free form the product uses.
- **update-spec-when-deviating**
  - Problem: T6's switch to `worktreeIdForPath` left the spec's Assumptions row naming `deriveAttribution`.
  - Fix: a deviation that changes a spec assumption edits that row in the same commit.
