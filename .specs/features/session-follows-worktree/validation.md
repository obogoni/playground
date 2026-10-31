# Session Follows the Worktree It Edits Validation

**Date**: 2026-10-31
**Spec**: `.specs/features/session-follows-worktree/spec.md`
**Diff range**: `main..feature/session-follows-worktree` (plan `b9ab839c`, T1..T17, fix F1 `5cb9a0f0`, HEAD `679a7ab1`)
**Verifier**: independent sub-agent (author ≠ verifier)

## Validation: session-follows-worktree — PASS

Every SFWT requirement has `file:line` evidence whose assertion targets the spec outcome; 6/6 unit mutants killed; one extra smoke mutant killed; gate green. No production defect found. Thin end-to-end evidence for a few renderer and removal wirings is recorded as follow-ups (owner rule: smoke-only gaps do not fail the round).

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T17 | ✅ Done | All `Done when` boxes checked in `tasks.md`; one commit per task in the diff range |
| F1 | ✅ Done | `launchedIn` + `removalSessions`; removal stops only sessions whose `cwd` is the worktree |

---

## Spec-Anchored Acceptance Criteria

| Req | Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --------- | -------------------- | ----------------------- | ------ |
| SFWT-01 | Edit/Write/MultiEdit/NotebookEdit inside another known worktree | `followedPath` = that worktree's path (as given) | `src/main/session-manager.test.ts:1683` `expect(persisted(h.config, view.id)?.followedPath).toBe(FIX)`; `:1684` cwd stays `ROOT`; `src/main/edited-path.test.ts:12-21` all 4 tools x 2 events `.toBe(FILE)`; smoke check 4 (`followedPath === wtNode.path`) | ✅ PASS |
| SFWT-02 | Other tool, no string path | followed path unchanged | `src/main/edited-path.test.ts:39-43` Bash/Read `toBeNull()`, `:45-52` Stop/PermissionRequest, `:54-56` no `tool_input`, `:58-67` number/null/empty/relative `toBeNull()`; `session-manager.test.ts:1690-1706` Read case: sessions unchanged, `followedEvents` `[]`, `followed` `[]` | ✅ PASS |
| SFWT-03 | Path in no known worktree; case; separator boundary | unchanged; case-insensitive; `.wt-a` never claims `.wt-ab` | `src/shared/worktree-match.test.ts:19-21` case `.toBe(FIX)`, `:23-28` mixed separators, `:30-35` `.toBeNull()` / `.toBe(ab)`, `:37-42` deepest wins, `:44-50` null; `session-manager.test.ts:1690-1706` outside-every-worktree case | ✅ PASS |
| SFWT-04 | Edit in the launch folder's worktree | unchanged; never moves back | `session-manager.test.ts:1690-1706` launch case `not.toHaveProperty('followedPath')`; `:1725-1736` after a move `followedPath` stays `FIX`, `followed` `[[id, FIX]]`; smoke check 11 | ✅ PASS |
| SFWT-05 | Edit in the already followed worktree | nothing changes, nothing emitted | `session-manager.test.ts:1720-1722` still one `session:followed` event and one `followedChanged` | ✅ PASS |
| SFWT-06 | Edit in a second worktree | followed path = second worktree | `session-manager.test.ts:1747-1755` `followedPath` `API`; events `[FIX, API]` by value | ✅ PASS |
| SFWT-07 | Change persisted and emitted | persisted + `session:followed {id, followedPath}` | `session-manager.test.ts:1683` persisted, `:1685` `list()` view, `:1686` `toEqual([{ id: view.id, followedPath: FIX }])` (payload by value), `:1687` lifecycle `[[id, FIX]]` | ✅ PASS |
| SFWT-08 | Counting session moves | close at the instant, open in the new path with its branch and the session's task; earlier periods unchanged | `src/main/time-tracker.test.ts:1192-1214` closed `p1` `cwd ROOT`, `branch main`, `end T0+10m`; open `p2` `cwd FIX`, `branch feature/4821-fix-login`, hand-set task `67890` kept (not the branch's `4821`), `start === end`; `:1235-1239` earlier period equal, `rewrites` `[]`; smoke check 10 (`launchPeriod.end === open.start`) | ✅ PASS |
| SFWT-09 | Paused / suspended session moves | no period opens; the next one opens in the new path | `time-tracker.test.ts:1269-1281` paused: `open` `[]`, resume opens `cwd FIX` on its branch; `:1293-1300` suspended: same on wake | ✅ PASS |
| SFWT-10 | Start with a followed path | period opens in the followed path | `time-tracker.test.ts:1321-1335` `started({...followedPath: FIX})` opens `cwd FIX`; `session-manager.test.ts:1871` `started` receives `[id, ROOT, FIX]`; smoke check 13 | ✅ PASS |
| SFWT-11 | Rail, status bar, worktree pages read the followed path; none = as today | grouped / branch / listed under the followed worktree | `src/renderer/src/lib/rail-groups.test.ts:984-986` key `task:24173`, branch, tooltip; `:997-999` untagged worktree group; `:1002-1031` missing followed folder; `src/renderer/src/lib/status-bar.test.ts:125-128` branch `user/dev/4821-fix-login/12345-endpoint`; `src/renderer/src/lib/isolation-level.test.ts:256-257`; `worktree-match.test.ts:54-60` `workCwdOf`; smoke checks 6 (rail), 8 (status bar), 9 (detail lists it, launch detail does not), 2 (as today) | ✅ PASS (Files list: see follow-up 2) |
| SFWT-12 | Miss inside a workspace | re-read once, retry | `src/main/known-worktrees.test.ts:57-64` `.toBe(FIX)`, `rereads` `[ACME]`, merged; smoke checks 3+4 (worktree created after the tree read, followed as the tree spells it) | ✅ PASS |
| SFWT-13 | One re-read in flight; never outside workspaces; arrival order | as stated | `known-worktrees.test.ts:73-83` two misses share one re-read; `:85-95` no second re-read for another workspace; `:97-102` `rereads` `[]`; `session-manager.test.ts:1758-1781` slow first answer, final `API`, order `[FIX, API]` | ✅ PASS |
| SFWT-14 | Re-read fails | unchanged + logged | `known-worktrees.test.ts:104-110` `toBeNull()`, `errors` `[failure]`; null answer leaves the session unchanged (`session-manager.test.ts:1690-1706`) | ✅ PASS |
| SFWT-15 | Followed worktree removed | not stopped; followed path cleared | `session-manager.test.ts:1820-1826` only `onFix` cleared, event `{followedPath: null}`, all `running`, `killed` `[false,false,false]`; `:1853-1854` load drops a missing path; `time-tracker.test.ts:1303-1319` back to `ROOT` on `main`; `worktree-match.test.ts:70-76` `launchedIn` excludes the follower (F1) | ✅ PASS (wiring: follow-up 1) |
| SFWT-16 | Respawn / duplicate / hand-set task | PTY in launch folder; respawn keeps path; duplicate has none; task unchanged | `session-manager.test.ts:1869-1871` `plan.cwd` `ROOT`, path kept; `:1883-1887` duplicate `plan.cwd` `ROOT`, no `followedPath` (persisted and `started`); `:1897-1899` task `toEqual(LINK)`, `taskChanges` `[]`; smoke checks 12, 14 | ✅ PASS |

**Payload rule**: `session:followed` asserted on `{id, followedPath}` by value (`:1686`, `:1748`, `:1823`); time periods asserted on `cwd`, `branch`, `taskId`/`taskTitle`/`taskByHand`, `start`/`end` (`time-tracker.test.ts:1192-1214`); `ActivityChange.cwd` (notification branch) asserted `FIX` (`session-manager.test.ts:1911`).

**Status**: ✅ All 16 requirements covered; no spec-precision gaps.

---

## Edge Cases

- [x] Letter case: `worktree-match.test.ts:19-21`
- [x] Separator boundary `.wt-a` / `.wt-ab`: `worktree-match.test.ts:30-35` (mutant M1 killed)
- [x] Miss inside a workspace re-reads once: `known-worktrees.test.ts:57-64`; smoke checks 3-4
- [x] One re-read in flight; none outside workspaces: `known-worktrees.test.ts:73-102` (mutant M3 killed)
- [x] Failed re-read: `known-worktrees.test.ts:104-110`
- [x] Followed worktree removed: `session-manager.test.ts:1807-1827`, `:1829-1855`; removal wiring by inspection (`src/main/index.ts:442`, `src/renderer/src/App.tsx:579`)

---

## Code Review Notes (production, read-only)

- `SessionManager.#follow` (`src/main/session-manager.ts:545`): decisions chained per run (`session.follow`), so a slow answer cannot undo a later move; the answer is dropped unless `#running.get(id) === session` (also covers a respawned run); launch check runs after `resolve`, so a re-read that adds the launch worktree is seen. Correct.
- `KnownWorktrees.resolve` (`src/main/known-worktrees.ts:36`): coalesced; a miss in another workspace while a re-read is in flight returns null without its own re-read (allowed by SFWT-13; the next edit retries). Failure logged, cache untouched.
- Load (`session-manager.ts:170-177`): drops a `followedPath` whose folder is gone, patching config only when something changed.
- Removal: `worktrees:remove` calls `clearFollowed` only on `result.ok` (`index.ts:442`); `WorktreeDetail` stops `removalSessions = launchedIn(...)` (F1), so a follower whose PTY runs in its launch folder is never stopped.
- Renderer readers sweep (`grep` of `.cwd` in `src/renderer` and `src/main`): every reader that places a session reads `workCwdOf` (rail groups, level totals, status bar, isolation target, detail list, Files running filter, session pick, turn-end recount, Agents attribution, notifications, tracker). The remaining `session.cwd` readers are the launch-folder ones the spec keeps: Agents cwd label and "Respawn in" (`AgentsView.tsx:235`, `:372`), the terminal's link base (`AgentsView.tsx:360`), PTY spawn plans, duplicate, `pathMissing`. No missed reader.
- Observation (not a defect): the Files discard warning (`App.tsx:647`) now counts followers while the remove-worktree confirmation counts only launched sessions; the comment there still says the two use the same rule. A follower is editing that worktree, so warning on discard is reasonable.

---

## Discrimination Sensor

Isolated scratch: detached `git worktree` in the author scratchpad with a `node_modules` junction; junction link removed before `git worktree remove --force` + `prune`; `npm ls --depth=0` reports nothing missing; real tree `git status --porcelain` unchanged.

| # | File:line | Mutation | Tests run | Killed? |
| - | --------- | -------- | --------- | ------- |
| M1 | `src/shared/worktree-match.ts:17` | Boundary dropped: `startsWith(candidate + '/')` → `startsWith(candidate)` | `worktree-match.test.ts` | ✅ Killed (`.wt-a` vs `.wt-ab`) |
| M2 | `src/main/edited-path.ts:24` | Absolute-path check removed | `edited-path.test.ts` | ✅ Killed (relative path case) |
| M3 | `src/main/known-worktrees.ts:41` | Miss outside every workspace re-reads anyway | `known-worktrees.test.ts` | ✅ Killed (`:97-102`) |
| M4 | `src/main/time-tracker.ts:141` | Counting run reopens without closing the open period | `time-tracker.test.ts` | ✅ Killed (3 tests) |
| M5 | `src/main/session-manager.ts:552` | Launch-worktree check removed (may move back) | `session-manager.test.ts` | ✅ Killed (2 tests, SFWT-04) |
| M6 | `src/main/session-manager.ts:551` | Stale-run check removed | `session-manager.test.ts` | ✅ Killed (answer after stop) |

**Sensor depth**: lightweight+ (6 behaviour-level mutants across the five new units)
**Result**: 6/6 killed - PASS ✅

---

## Smoke Evidence (`scripts/smoke-follow-worktree.mjs`)

Read critically. Checks 1, 3 are setup; 2, 5 and 14 also pass on old code (they assert "as today" / launch-folder preservation and only mean something beside the moving checks). Checks 11 and 13 depend on the state check 4 created; by reading, each still discriminates on its own fault (a launch-worktree guard removed would set `followedPath` to the primary checkout and fail 11; the old `started` would open the respawned period in the launch folder and fail 13), and the unit layer kills both faults (M5; `time-tracker.test.ts:1321-1335`). Neither was run as a smoke mutant. The rest fail on a build without the feature.

| Mutant | Who | Failing checks |
| ------ | --- | -------------- |
| `index.ts` without the `worktrees` dep | author | 4, 6-13 |
| `rail-groups` reading `session.cwd` | author | 6, 11 |
| `App.tsx` detail list by `s.cwd` | author | 9 |
| `status-bar` reading `session.cwd` | author | 8 |
| `App.tsx` without the `session:followed` → `refreshTree` subscription (T14) | verifier | 6, 7, 8, 9, 11 (10/15 passed; the main-side checks 4, 10, 12-14 still passed, so the failure is specific). The rail showed the row as detached under the folder leaf, which also shows the `use-sessions` subscription (T9) delivered `followedPath` |

Verifier run: dev app from the real tree on a throwaway `--user-data-dir` in the author scratchpad, file mutated with a `.orig` backup and restored in `finally`; dev process tree killed, profile deleted, real tree clean afterwards.

---

## Gate Check

- **Typecheck**: `npm run typecheck` exit 0
- **In-scope tests**: `npx vitest run` on the 8 in-scope files: 389 passed, 0 failed, 0 skipped
- **Lint**: `npx eslint` on every changed `.ts`/`.tsx`/`.mjs` file: 0 errors, 0 warnings
- **Full suite / build**: author ran the Build gate (3069 passed, `build:win` OK); not repeated
- **Test integrity**: no test deleted; two existing lifecycle fakes gained a `followedChanged` member (required by the interface), no assertion weakened

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns (`setTask` / `taskChanged` path, optional dep like `lifecycle`) | ✅ |
| Spec-anchored outcome check | ✅ |
| Per-layer Coverage Expectation (domain 1:1; wiring by smoke) | ✅ with follow-ups 1-3 |
| Every test maps to a spec requirement | ✅ (`activity change cwd` test maps to design "Notifications") |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, `tasks.md` Test Coverage Matrix | ✅ |

---

## Follow-ups (not blocking; production read correct)

1. **Removal wiring has no end-to-end evidence (SFWT-15).** `index.ts:442` (`clearFollowed` after `worktrees:remove`) and `App.tsx:579` (`removalSessions = launchedIn`, F1) are covered only by unit tests of `clearFollowed` and `launchedIn`; the smoke never removes the followed worktree. Add a smoke step: remove the followed worktree from its detail page, assert the session keeps `status: running`, loses `followedPath`, and its open period returns to the launch folder; falsify by dropping the `clearFollowed` call and by passing `sessions` as `removalSessions`.
2. **Files running-session filter (SFWT-11 AC3, "Files session lists").** `App.tsx:647` has no test or smoke check; a smoke step opening the discard dialog in the followed worktree would cover it.
3. **Other renderer readers with no evidence**: level-group total and live flag (`SessionRail.tsx:308-310`, the smoke session lands in a task group, not a level group), Agents view attribution (`AgentsView.tsx:170`), session pick selecting the followed worktree (`App.tsx:468`), turn-end recount (`App.tsx:350`). All verified by reading only.
4. **Re-read cost (observation).** Every edit inside a registered workspace that is outside every worktree (e.g. a non-repo folder in the workspace) re-reads the workspace's worktrees, twice per edit (`PreToolUse` and `PostToolUse`) unless they overlap. Allowed by the spec ("re-read once" per miss); worth a negative cache if it shows up in practice.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| SFWT-01..SFWT-16 | Implementing | ✅ Verified (spec.md left untouched by the Verifier; the orchestrator updates it) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 16/16 requirements matched the spec outcome; 0 spec-precision gaps
**Sensor**: 6/6 unit mutants killed; 1/1 extra smoke mutant killed
**Gate**: typecheck OK, 389 in-scope tests passed, eslint clean on changed files

**What works**: edit-driven follow with launch-folder and already-followed guards, ordered and stale-safe decisions, coalesced re-read on a miss, hours split at the move with branch and hand-set task, persistence across respawn and restart, duplicate without a followed path, renderer placement by `workCwdOf`, removal stopping only launched sessions.

**Issues found**: none in production; follow-ups 1-4 above.

**Next steps**: open the PR; schedule the smoke follow-ups.
