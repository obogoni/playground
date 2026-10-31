# Status Bar Follows the Session's Task Validation

## Validation: status-bar-session-task — PASS

**Date**: 2026-10-31
**Spec**: `.specs/features/status-bar-session-task/spec.md` (SBTK-01..05)
**Diff range**: round 1 `main..936c8e36`; round 2 `main..283c7da3` (fix commit `283c7da3` checked only);
round 3 `main..af54d2da` (fix commit `af54d2da` checked only)
**Verifier**: independent sub-agents (author ≠ verifier), three rounds - see "Round 3" below for the current verdict

---

## Round 3 (fix diff only) — PASS

**Fix diff**: `283c7da3..af54d2da` (range `main..af54d2da`), one commit, tests only:
`src/renderer/src/lib/status-bar.test.ts` (+3/-2, `:205-208`). The `4821` near miss now runs on the
base `tree` (`:208` - `taskTargetFor(withTask(4821), tree)` `toEqual({ kind: 'folder', path:
'C:/work/acme' })`), where only `widget-12345` (`user/dev/4821-fix-login/12345-endpoint`) carries
`4821` as its parent segment; the `123` prefix case stays on `taskTree` (`:206`). This is Fix 2 as
written. No production file changed; no assertion removed or weakened (the expected value is the
same, only the fixture narrowed so the "several worktrees" rule no longer masks the matching rule).

**Isolation**: detached `git worktree` at `af54d2da` in the session scratchpad, `npm install
--ignore-scripts`, `package-lock.json` reverted there, sources restored with `git checkout -- src`
between mutants (scratch `git status --porcelain` empty afterwards); worktree removed (`\\?\` path)
and pruned (`git worktree list` shows only the main tree). `git status --porcelain` of
the main tree showed only this report before and after.

**Gate (scratch at `af54d2da`)**: `npx vitest run src/renderer/src/lib/status-bar.test.ts
src/renderer/src/lib/tree-selection.test.ts` - 46 passed, 0 failed; `npm run typecheck` exit 0;
`npx eslint src/renderer/src/lib/status-bar.test.ts` exit 0.

### Sensor (round 3)

Command per mutant: `npx vitest run src/renderer/src/lib/status-bar.test.ts src/renderer/src/lib/tree-selection.test.ts`.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 6 (re-run) | `src/renderer/src/lib/tree-selection.ts:36` | `taskIdFromBranch(worktree.branch) === taskId` → `worktree.branch.split('/').some((segment) => taskIdFromBranch(segment) === taskId)` | ✅ Killed - `status-bar.test.ts:208` (task `4821` got a worktree, expected the folder); 1 failed / 45 passed |
| 4 (re-run) | `src/renderer/src/lib/tree-selection.ts:36` | → `worktree.branch.includes(String(taskId))` | ✅ Killed - `status-bar.test.ts:206` (task `123` got a worktree, expected the folder); 1 failed / 45 passed |

**Sensor verdict**: 2/2 killed. Across the three rounds every mutant is dead (1, 2, 3, 5 in round 1;
4, 6, 7 in rounds 2-3). Round 1's gap row ("an id elsewhere in the branch (e.g. the US id) or a
substring does not count") is now pinned on both halves: substring at `:206`, parent segment at `:208`.

### Traceability (round 3)

| Requirement | Status |
| ----------- | ------ |
| SBTK-01 | ✅ Verified (AC1 at `:173-179`, precedence over a launch worktree at `:213`/`:215`, matching rule pinned at `:206`/`:208`) |
| SBTK-02 | ✅ Verified (`:186`, `:190`) |
| SBTK-03 | ✅ Verified (`:197`) |
| SBTK-04 | ✅ Verified (no match `:201`, near misses `:206`/`:208`, several `:234`) |
| SBTK-05 | ✅ Verified (`:240`, `:242`) |

Line numbers are `status-bar.test.ts` at `af54d2da`; rounds 1-2 cite the file at their own commits.

`spec.md` traceability flipped to `Verified` and its Success Criteria box ticked (uncommitted).
Remaining non-blocking notes from round 1: `worktreesForTask` has no direct test in
`tree-selection.test.ts` (exercised only through `barTargetFor`), and the STWK-04 Agent button path
(`spawnAgentForTask`) has no test of its own.

---

## Round 2 (fix diff only) — FAIL

**Fix diff**: `936c8e36..283c7da3` (range `main..283c7da3`), one commit, tests only: two new cases in
`src/renderer/src/lib/status-bar.test.ts` (+13, `:204-215`). No production file changed.

**Isolation**: detached `git worktree` at `283c7da3` in the session scratchpad, `npm install
--ignore-scripts`, `package-lock.json` reverted there, sources restored with `git checkout -- src`
between mutants; worktree removed (`\\?\` path) and pruned. `git status --porcelain` of
the main tree showed only this report before and after.

**Gate (scratch at `283c7da3`)**: `npx vitest run src/renderer/src/lib/status-bar.test.ts
src/renderer/src/lib/tree-selection.test.ts` - 46 passed (44 + 2 new), 0 failed; `npm run typecheck`
exit 0; `npx eslint src/renderer/src/lib/status-bar.test.ts` exit 0. No assertion removed or weakened.

### New tests against the spec

| Test | Spec anchor | Assertion | Discriminating? |
| ---- | ----------- | --------- | --------------- |
| "matches the task's id, not a number that only appears in a branch (SBTK-04)" | Assumption "Task's worktree" (`taskIdFromBranch`) + Edge 1 (no worktree carries the id → launch folder) | `status-bar.test.ts:206` - `taskTargetFor(withTask(123))` `toEqual({ kind: 'folder', path: 'C:/work/acme' })` | ✅ kills mutant 4 (substring) |
| same test, second line | same, the "parent segment" near miss the comment at `:205` names | `status-bar.test.ts:207` - `taskTargetFor(withTask(4821))` `toEqual({ kind: 'folder', ... })` | ❌ shallow: `4821` is the parent segment of **both** `taskTree` branches, so any rule that matches the parent segment finds two worktrees and the "several" rule (SBTK-04 edge 2) returns the folder anyway - see mutant 6 |
| "shows the task's worktree over a launch worktree that is another one (SBTK-01)" | Assumption "Precedence" (followed → task's worktree → launch folder) + AC1 (no condition on the launch folder) | `status-bar.test.ts:212` - `expect(target.kind).toBe('worktree')`; `:214` - `worktree.path).toBe('C:/work/acme/widget-12345')` with `cwd: 'C:/work/acme/widget-777'` | ✅ kills mutant 7; closes round 1's precedence observation |

### Sensor (round 2)

Command: `npx vitest run src/renderer/src/lib/status-bar.test.ts src/renderer/src/lib/tree-selection.test.ts`
(mutant 4 also run with `status-bar.test.ts` alone, as dispatched).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 4 (re-run) | `src/renderer/src/lib/tree-selection.ts:36` | `taskIdFromBranch(worktree.branch) === taskId` → `worktree.branch.includes(String(taskId))` | ✅ Killed - `status-bar.test.ts:206` (task `123` got a worktree, expected the folder); 1 failed / 32 passed |
| 6 (new) | `src/renderer/src/lib/tree-selection.ts:36` | → `worktree.branch.split('/').some((segment) => taskIdFromBranch(segment) === taskId)` (an id in **any** segment counts, e.g. the US id) | ❌ Survived - 46/46 passed |
| 7 (new) | `src/renderer/src/lib/status-bar.ts:72` | task rule narrowed to `... && !worktreeContaining(tree, session.cwd)` (only when launched in no worktree) | ✅ Killed - `status-bar.test.ts:214` |

**Sensor verdict**: 2/3 killed - FAIL. Round 1's named mutant 4 is dead, and the precedence gap is
closed, but the other half of round 1's gap row ("an id elsewhere in the branch (e.g. the US id)
... does not count") is still unpinned: the test that claims it (`:205`, `:207`) cannot fail.

### Fix 2: make the parent-segment near miss discriminating (Minor)

- **Root cause**: `taskTree` puts `4821` on two branches, so the parent-segment case is decided by the
  "several worktrees" rule before the matching rule matters.
- **Fix task**: run the `4821` case against a tree where exactly one branch carries `4821` as its parent
  segment - e.g. `taskTargetFor(withTask(4821), tree)` (the base `tree` at `status-bar.test.ts:25-26`
  has only `widget-12345` under `4821-fix-login`) - and keep expecting
  `{ kind: 'folder', path: 'C:/work/acme' }`.
- **Verify**: mutant 6 above is killed; mutant 4 stays killed; 46 tests pass.

### Traceability (round 2)

| Requirement | Status |
| ----------- | ------ |
| SBTK-01 | ✅ Verified after Fix 2 (precedence pinned at `:214`; shares the matching rule) |
| SBTK-02, SBTK-03, SBTK-05 | ✅ Verified after Fix 2 (unchanged since round 1) |
| SBTK-04 | ❌ Needs Fix 2 (parent-segment near miss not discriminated - mutant 6) |

`spec.md` left at `Implemented`: the feature is not done until Fix 2 lands and is re-verified
(round 3 of the 3-round bound).

---

# Round 1 report (kept for the record)

Diff surface: `src/renderer/src/lib/status-bar.ts` (+5: task rule in `barTargetFor`),
`src/renderer/src/lib/tree-selection.ts` (+21: new `worktreesForTask`),
`src/renderer/src/App.tsx` (-9/+1: `worktreePathsForTask` delegates to `worktreesForTask`),
`src/renderer/src/lib/status-bar.test.ts` (+94: seven SBTK tests), and the spec itself.

The production code matches the spec. The verdict is FAIL only because one sensor mutant
survived (the task-id matching rule is not pinned by any test); per `validate.md` a surviving
mutant is a fix task before the feature is done.

---

## Task Completion

No `tasks.md` (small feature, executed inline). The single commit is on the branch and the working
tree carried no uncommitted change at the start of verification (`git status --porcelain` empty).

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------- |
| AC1 / SBTK-01: no `followedPath`, linked task, exactly one worktree carries the task id | `kind: 'worktree'`, that worktree with its workspace and repo | `src/renderer/src/lib/status-bar.test.ts:173` - `expect(target.kind).toBe('worktree')`; `:175` - `workspaceName).toBe('Acme')`; `:176` - `repoName).toBe('widget')`; `:177` - `repoPath).toBe('C:/work/acme/widget')`; `:178` - `worktree.path).toBe('C:/work/acme/widget-12345')`; `:179` - `worktree.branch).toBe('user/dev/4821-fix-login/12345-endpoint')`. Session launched at `C:/work/acme` (in no worktree); a second task worktree (`777`) sits in the same repo | ✅ |
| AC2 / SBTK-02: a `followedPath` wins whatever the linked task | the followed path as today (worktree, or bare folder) | `status-bar.test.ts:186` - `expect(target.selected.worktree.path).toBe('C:/work/acme/widget-777')` (task 12345 has its own worktree); `:190` - `toEqual({ kind: 'folder', path: 'C:/work/acme/.wt-gone' })` | ✅ |
| AC3 / SBTK-03: no linked task | the launch folder as today | `status-bar.test.ts:197` - `expect(taskTargetFor(withTask(null))).toEqual({ kind: 'folder', path: 'C:/work/acme' })`; launch folder inside a worktree without a task stays covered by the pre-existing STBR-03 test (`:46`-`:48`) | ✅ |
| Edge 1 / SBTK-04: no worktree carries the task id | the launch folder | `status-bar.test.ts:201` - `expect(taskTargetFor(withTask(99999))).toEqual({ kind: 'folder', path: 'C:/work/acme' })` | ✅ |
| Edge 2 / SBTK-04: two or more worktrees carry the task id | the launch folder | `status-bar.test.ts:220` - `expect(taskTargetFor(withTask(12345), twice)).toEqual({ kind: 'folder', path: 'C:/work/acme' })` (second match in another workspace) | ✅ |
| Edge 3 / SBTK-05: direction is not Agents | the tree selection, task ignored | `status-bar.test.ts:226` - `expect(target.kind, direction).toBe('worktree')`; `:228` - `expect(target.selected.worktree.path, direction).toBe('C:/work/acme/widget')` for `tree`, `files`, `hours` | ✅ |
| Assumption row "Task's worktree": a worktree carries the task id **per `taskIdFromBranch`** | branch whose last segment's id equals the task id; an id elsewhere in the branch (e.g. the US id) or a substring does not count | no test discriminates it - see sensor mutant 4 | ❌ GAP |

**Status**: ❌ One gap - every AC and edge case is covered with spec-matching values, but the
matching rule the spec fixes (`taskIdFromBranch`) is not pinned.

---

## Edge Cases

- [x] No worktree carries the task id → launch folder (`status-bar.test.ts:201`)
- [x] Several worktrees carry the task id → launch folder (`status-bar.test.ts:220`)
- [x] Direction not Agents → tree selection (`status-bar.test.ts:223-230`)

---

## Discrimination Sensor

Run in a temporary detached `git worktree` at `936c8e36` under the session scratchpad. `npm ci
--ignore-scripts` refused (the lock file on the branch misses `@electron/windows-sign` and six
transitive packages), so `npm install --ignore-scripts` ran in the scratch and its
`package-lock.json` change was reverted there. Command per mutant:
`npx vitest run src/renderer/src/lib/status-bar.test.ts src/renderer/src/lib/tree-selection.test.ts`,
sources restored with `git checkout -- src` between mutants. Baseline in scratch: 44/44 passed.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 1 | `src/renderer/src/lib/status-bar.ts:74` | `forTask.length === 1` → `>= 1` (take the first match) | ✅ Killed - `status-bar.test.ts:220` got a worktree, expected the folder |
| 2 | `src/renderer/src/lib/status-bar.ts:72` | Dropped `!session.followedPath &&` (task beats the followed path) | ✅ Killed - `status-bar.test.ts:186` and `:190` |
| 3 | `src/renderer/src/lib/status-bar.ts:68` | Task rule applied before the direction check (every direction) | ✅ Killed - `status-bar.test.ts:228` (`tree`: got `widget-12345`) |
| 4 | `src/renderer/src/lib/tree-selection.ts:36` | `taskIdFromBranch(worktree.branch) === taskId` → `worktree.branch.includes(String(taskId))` | ❌ Survived - 44/44 passed |
| 5 | `src/renderer/src/lib/tree-selection.ts:40` | `repoPath: repo.path` → `workspace.path` in `worktreesForTask` | ✅ Killed - `status-bar.test.ts:177` |

**Sensor depth**: lightweight+ (5 behaviour-level mutants, the dispatcher's cap).
**Sensor verdict**: 4/5 killed - FAIL.

Mutant 4 is reachable: with the substring rule a session linked to task `4821` would match both
`.../4821-fix-login/12345-endpoint` and `.../4821-fix-login/777-other` (the US id), and task `123`
would match `12345-endpoint`. The test fixtures already contain the `4821` US segment, so one more
case kills it. The same mutant also changes the STWK-04 Agent button path (`spawnAgentForTask`),
which has no test of its own.

Isolation: `git status --porcelain` of the main tree was empty before and after the sensor.
The scratch worktree was removed and pruned (`git worktree list` shows only the main tree); the
directory left behind by a long-path delete failure was then removed with a `\\?\` path.

---

## STWK-04 callers (App.tsx)

`worktreePathsForTask` (`src/renderer/src/App.tsx:94-96`) now returns
`worktreesForTask(tree, taskId).map((found) => found.worktree.path)`. The new helper
(`tree-selection.ts:31-48`) walks workspaces → repos → worktrees in the same order with the same
predicate (`taskIdFromBranch(worktree.branch) === taskId`) as the removed loop, so the path list
is identical, element for element. Its only caller, `spawnAgentForTask` (`App.tsx:481-489`),
keeps its 0 / 1 / many branches unchanged. `countWorktreesByTask` (`App.tsx:80-91`) is untouched.
No existing test covers either App function (read-only reasoning; typecheck passes).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code (one 4-line rule, one helper replacing an App-local loop) | ✅ |
| Surgical changes (no unrelated edit; App helper deduplicated, not reshaped) | ✅ |
| No scope creep (`followedPath` not set from the task; several worktrees keep the launch folder, per Out of Scope) | ✅ |
| Matches patterns (`SelectedWorktree` shape as in `findWorktree`/`worktreeContaining`; requirement-tagged comments) | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer coverage (pure helper, 1:1 AC mapping) | ⚠️ `worktreesForTask` has no direct test; its rule is only exercised through `barTargetFor` |
| Every test maps to a spec requirement (SBTK-01..05) - no unclaimed tests | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md` (co-located pure-function tests, `describe(<symbol>)` → `it(<behaviour>)`) | ✅ |

---

## Gate Check

- **Typecheck**: `npm run typecheck` (node + web), in the scratch at `936c8e36` - exit 0
- **Tests in scope**: `npx vitest run src/renderer/src/lib/status-bar.test.ts src/renderer/src/lib/tree-selection.test.ts` - 44 passed, 0 failed, 0 skipped
- **Lint (changed TS files)**: `npx eslint` on `status-bar.ts`, `status-bar.test.ts`, `tree-selection.ts`, `App.tsx` - exit 0
- **Test count before feature** (`status-bar.test.ts` on `main`): 24
- **Test count after feature**: 31
- **Delta**: +7 new tests, none removed, no assertion weakened
- **Full suite**: not run (scope limited by the dispatcher)

---

## Fix Plans

### Fix 1: pin the task-id matching rule (Minor)

- **Root cause**: every fixture branch carries the task id only in its last segment and no other
  id shares its digits, so a looser matcher (substring, any segment) passes all tests.
- **Fix task**: in `status-bar.test.ts`, add a case where the session's task is `4821` (the US id
  segment of both fixture branches) and expect `{ kind: 'folder', path: 'C:/work/acme' }`; or add a
  `describe('worktreesForTask')` in `tree-selection.test.ts` asserting `worktreesForTask(tree, 4821)`
  and `worktreesForTask(tree, 123)` are `[]` while `worktreesForTask(tree, 12345)` returns the one
  worktree with workspace, repo and path.
- **Verify**: mutant 4 above is killed; 44+ tests still pass.

### Observation (not a failure): launch folder inside another worktree

AC1 puts no condition on where the session was launched, and the precedence row says the task's
worktree beats the launch folder, which is what the code does. No test launches the session inside
worktree A with a task whose only worktree is B, so a rule narrowed to "launched in no worktree"
would also pass. Worth one more case in the same fix if the owner wants that precedence pinned.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| SBTK-01 | Implemented | ❌ Needs Fix (matching rule unpinned - mutant 4) |
| SBTK-02 | Implemented | ✅ Verified (after Fix 1) |
| SBTK-03 | Implemented | ✅ Verified (after Fix 1) |
| SBTK-04 | Implemented | ❌ Needs Fix (same rule decides "no / several worktrees") |
| SBTK-05 | Implemented | ✅ Verified (after Fix 1) |

`spec.md` was not changed: the feature is not done until Fix 1 lands and is re-verified.

---

## Summary

**Overall (after round 3)**: ✅ Ready - Fix 2 landed in `af54d2da`; mutants 4 and 6 killed; SBTK-01..05 verified

**Overall (after round 2)**: ❌ Not Ready - mutant 4 killed, mutant 6 survives (Fix 2); production code matches the spec

**Overall (round 1)**: ❌ Not Ready (test gap only; production code matches the spec)

**Spec-anchored check**: 3/3 ACs and 3/3 edge cases matched the spec outcome; 0 spec-precision gaps; 1 gap on the spec's matching rule
**Sensor**: 4/5 mutations killed
**Gate**: typecheck exit 0; 44/44 tests in scope passed; lint clean on changed files

**What works**: a root-launched session with a task and one task worktree shows that worktree with
its workspace and repo; a followed path still wins; no task, no match, or several matches keep the
launch folder; other directions ignore the session; the STWK-04 Agent button keeps its paths.

**Issues found**: the `taskIdFromBranch` matching rule is not discriminated by any test (Fix 1).

**Next steps**: implement Fix 1, re-dispatch the Verifier, then mark SBTK-01..05 verified.
