# Agent Isolation Level Validation

## Validation: agent-isolation-level - PASS

**Date**: 2026-09-29
**Spec**: `.specs/features/agent-isolation-level/spec.md` (ISO-01..11)
**Diff range**: `af6e272..1aff51d` (`af6e272` = origin/main; `4919dca` spec docs; T1 `ed1b1e0` .. T11 `1aff51d`)
**Verifier**: independent sub-agent (author ≠ verifier)

The pure logic (ISO-01, 02, 04, 05, 06, 08, 09, 10) is covered by unit tests that assert the spec's exact outcomes, and all 18 injected mutants were killed. The component wiring (ISO-03, 05, 06, 07, 08, 10) was checked by reading the code against each AC, which is the project convention (`.specs/codebase/TESTING.md`: components get CDP smoke + a visual pass, no unit tests). Two checks are still open and do not block this verdict: the live run of `scripts/smoke-isolation-level.mjs` and the ISO-11 hand check. The spec defines ISO-11 as live-only with no automated test. Its mechanism is covered by existing tests, and its "no new code path" clause is proven by the diff.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T10 | ✅ Done | One commit each; all "Done when" boxes checked |
| T11 | ✅ Done | Script written; **run live by the owner on 2026-09-29: 17/17 checks passed** (workspace `source` at `M:\Triade\source`, repo `Code` on `develop`). The ISO-11 hand-check box is still unchecked in `tasks.md` |

---

## Spec-Anchored Acceptance Criteria

### P1 Level derivation (ISO-01, ISO-02)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 linked worktree path | `{level:'worktree'}` + its workspace and repo | `src/renderer/src/lib/isolation-level.test.ts:49-53`: `expect(match?.level).toBe('worktree')`, `.worktree).toBe(PG_LINKED)`, `.repo).toBe(PG_REPO)`, `.workspace).toBe(WS_PLAIN)` | ✅ PASS |
| AC2 primary checkout path | `{level:'repo'}` + repo + workspace | `isolation-level.test.ts:59-63`: `toBe('repo')`, `.repo).toBe(PG_REPO)`, `.workspace).toBe(WS_PLAIN)` | ✅ PASS |
| AC3 workspace path (not a checkout) | `{level:'workspace'}` + workspace | `isolation-level.test.ts:69-73`: `toBe('workspace')`, `.repo).toBeUndefined()` | ✅ PASS |
| AC4 unmatched path | `null` | `isolation-level.test.ts:77`, `:81` (repo subfolder), `:85`: `toBeNull()` | ✅ PASS |
| AC5 case, `\`=`/`, one trailing separator | `M:\Obogoni\` matches `m:/obogoni` | `isolation-level.test.ts:92-95`: `isolationLevelOf([lower], 'M:\\Obogoni\\')`, `.level).toBe('workspace')`; `:99-102`; `:108`; `samePath` table `:162-176` (including `x//` ≠ `x`: exactly one separator) | ✅ PASS |
| AC6 workspace path = primary checkout | `{level:'repo'}` | `isolation-level.test.ts:112-116`: `isolationLevelOf(tree, 'C:/mono')?.level).toBe('repo')` | ✅ PASS |

### P1 Spawn from rows (ISO-03, ISO-04)

| Criterion | Spec-defined outcome | Evidence | Result |
| --------- | -------------------- | -------- | ------ |
| AC1/AC2 workspace row menu → dialog on `Workspace` with the workspace path | Menu shows "Spawn agent here"; dialog level `Workspace`, cwd = `ws.path` | Code read: `src/renderer/src/components/Sidebar.tsx:184,189` (`onContextMenu` → `onRowContextMenu(e, workspaceSpawnCwd(ws))`), `Sidebar.tsx:75-78,150` (menu item → `onSpawnAgent(menu.cwd)`), `NewSessionDialog.tsx:83` (`initialLevel(tree, source.cwd)`). Unit: `isolation-level.test.ts:181` `workspaceSpawnCwd(WS_PLAIN)).toBe('M:/Obogoni')`; `session-levels.test.ts:126` `initialLevel(tree,'M:/Work')).toBe('workspace')` | ✅ PASS (code-read + unit; live pending) |
| AC3/AC4 repo row → dialog on `Repo` with the primary checkout path | cwd = primary checkout path | `Sidebar.tsx:257,262`; unit `isolation-level.test.ts:199` `repoSpawnCwd(moved)).toBe('M:/Obogoni/playground')` (primary checkout path, not `repo.path`); `session-levels.test.ts:127` `.toBe('repo')` | ✅ PASS (code-read + unit) |
| AC5 missing workspace offers nothing | no menu | `Sidebar.tsx:189` (`spawnCwd === null ? undefined`); `isolation-level.test.ts:185` `workspaceSpawnCwd({...missing:true})).toBeNull()` | ✅ PASS |
| AC6 repo with `error` / no primary checkout offers nothing | no menu | `Sidebar.tsx:262`; `isolation-level.test.ts:203`, `:207` `toBeNull()` | ✅ PASS |
| AC7 worktree row → `Worktree`, primary checkout row → `Repo` | level from the row's cwd | `Sidebar.tsx:289` (unchanged `worktree.path`); `session-levels.test.ts:127-128` `initialLevel(...'M:/Work/api')).toBe('repo')`, `'M:/Work/api-24173')).toBe('worktree')` | ✅ PASS |

The workspace-row and repo-row `onContextMenu` handlers sit on sibling elements of the worktree rows (`Sidebar.tsx:186-209` vs `:230`; `:260-273` vs `:280-291`), so a right-click on a worktree row does not bubble into a repo or workspace handler. A right-click does not toggle collapse, because the collapse control is `onClick` on the chevron only (`Sidebar.tsx:197`).

### P1 Level selector (ISO-05, ISO-06, ISO-07)

| Criterion | Spec-defined outcome | Evidence | Result |
| --------- | -------------------- | -------- | ------ |
| AC1 three options, in order | `Workspace`, `Repo`, `Worktree` | Code read: `NewSessionDialog.tsx:48-52` (`LEVELS`), rendered `:199-210` | ✅ PASS (code-read) |
| AC2 Workspace grid | one chip per non-missing workspace, name + path | `session-levels.test.ts:47-51` `toEqual([...{path:'M:/Work',workspaceName:'work'}...])` (missing `GONE` excluded, empty `EMPTY` included); chip lines `NewSessionDialog.tsx:58` | ✅ PASS |
| AC3 Repo grid | repo name, branch, workspace name | `session-levels.test.ts:55-77`, `:81-85` (same name in two workspaces); chip `NewSessionDialog.tsx:59` | ✅ PASS |
| AC4 Worktree grid | linked only, content and highlight as before | `session-levels.test.ts:89-106` (primary checkouts absent, `taskId: 24173`); chip `NewSessionDialog.tsx:60-63`; highlight `:217-227` | ✅ PASS (see gap G1) |
| AC5 no source cwd → `Worktree` | `'worktree'` | `session-levels.test.ts:118`, `:122` `toBe('worktree')` | ✅ PASS |
| AC6 source cwd with a level → that level | cwd's level | `session-levels.test.ts:126-128`, `:132` | ✅ PASS |
| AC7 switching clears a foreign cwd; Spawn disabled | `null`; Spawn disabled | `session-levels.test.ts:142`, `:146`, `:150` `toBeNull()`, `:138` kept; wiring `NewSessionDialog.tsx:126-129`, `:110` `canSpawn = cwd !== null && …`, `:286` `disabled={!canSpawn}` | ✅ PASS |
| AC8 empty grid text; Browse stays | `No workspaces yet.` / `No repos yet.` / `No worktrees yet.` | `NewSessionDialog.tsx:48-52` strings, `:212-213` render, Browse `:238` outside the conditional; data side `session-levels.test.ts:110-112` `toEqual([])` | ✅ PASS (code-read) |
| AC9 browsed folder with a level selects it | level + tree spelling | `session-levels.test.ts:160-165` `adoptBrowsed(tree,'m:\\work\\web')).toEqual({level:'repo',cwd:'M:/Work/web'})`; `:169-172` no level → browsed as is; wiring `NewSessionDialog.tsx:118-120` | ✅ PASS |
| AC10 spawn through `sessions:spawn`, no new IPC field | payload unchanged | `NewSessionDialog.tsx:141-142` (`onSpawn` signature unchanged); `git diff af6e272..HEAD --stat` touches no file in `src/main`, `src/preload`, or `src/shared/ipc-contract.ts` | ✅ PASS |

### P1 Rail group per level (ISO-08, ISO-09, ISO-10)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 workspace group label | `Workspace · <displayName>` | `src/renderer/src/lib/rail-groups.test.ts:870` `expect(group.label).toBe('Workspace · Work projects')`, `:874` key `level:m:/work`; render `SessionRail.tsx:291-299` | ✅ PASS |
| AC2 repo group label + branch note | `Repo · <name>`, note = branch | `rail-groups.test.ts:882-883` `toBe('Repo · api')`, `note).toBe('develop')` | ✅ PASS |
| AC3 shared group `level:<normalized path>`, persisted order | one group, rows `[a,b]` | `rail-groups.test.ts:898-899` `toEqual(['level:m:/work','session:x'])`, `rows…toEqual(['a','b'])` (`M:/Work` + `m:\work\`); `:909` separate keys for same-named repos | ✅ PASS |
| AC4 task wins | task group | `rail-groups.test.ts:917` `toEqual(['task:24173'])` (branch-tagged primary checkout); `:928` `toEqual(['task:4821'])` (hand link at workspace) | ✅ PASS |
| AC5 path missing → existing orphan | `worktree path missing` | `rail-groups.test.ts:941-945` `reason).toBe('missing')`, `note).toBe('worktree path missing')` | ✅ PASS |
| AC6 worktree-level / no-level unchanged | `untagged worktree`, `detached · <folder>` | `rail-groups.test.ts:953-954`, `:960`, `:968-969`; all pre-existing `rail-groups.test.ts` cases (lines 1-816) still pass unchanged | ✅ PASS |
| AC7 Open worktree hidden for workspace, shown and targeting the primary checkout for repo | `null` / checkout id | `isolation-level.test.ts:222` `toBe(PG_MAIN.id)`, `:226` `toBeNull()`, `:218`, `:234-235`, `:244` `toBe('node-odd')`; wiring `AgentsView.tsx:161,245,250` | ✅ PASS |

### P2 Created worktrees reach the tree (ISO-11)

| Criterion | Spec-defined outcome | Evidence | Result |
| --------- | -------------------- | -------- | ------ |
| AC1 created worktree appears and is auto-pinned on the next refresh | existing auto-pin path | Live-only per spec. The mechanism is covered by existing tests: `src/main/task-board.test.ts:462` (APIN-05 pins a derived ref), `src/main/index.ts:325` (auto-pin after `tree:get`). The end-to-end hand check has not been run | ⏳ Hand check pending (non-blocking; spec says "No new automated test") |
| AC2 no new refresh trigger or pinning code path | none added | The diff `af6e272..HEAD` touches only `src/renderer/src/lib/*`, 4 renderer components with their CSS, `scripts/smoke-isolation-level.mjs`, and `.specs/*`. There are no changes in `src/main` or the tree refresh / auto-pin code | ✅ PASS |

**Status**: ✅ All ISO-01..10 ACs are covered. ISO-11 AC1 has a hand check pending. One spec-precision gap is flagged (G1).

---

## Edge Cases

- [x] Workspace with no repos is listed and spawnable: `session-levels.test.ts:50`, `isolation-level.test.ts:153-157`, `:189`
- [x] Workspace removed from the tree gives `detached · <folder>`: `rail-groups.test.ts:963-969`
- [x] Browsed repo subfolder has no level and stays detached: `isolation-level.test.ts:81`, `session-levels.test.ts:169-172`, `rail-groups.test.ts:960`
- [x] Same repo name in two workspaces: `session-levels.test.ts:81-85`, `rail-groups.test.ts:902-912`

---

## Discrimination Sensor

The sensor ran in a scratch `git worktree add --detach <scratchpad>/wt HEAD`, with `node_modules` junctioned in. Each run used `npx vitest run` on the 3 in-scope test files. The scratch was removed with `git worktree remove --force` + `git worktree prune`. Real-tree `git status --porcelain` was empty before and after, matching the baseline.

| # | File | Mutation | Killed? |
| - | ---- | -------- | ------- |
| M1 | `isolation-level.ts:24` | drop `.toLowerCase()` (case-sensitive compare) | ✅ Killed (10 failed) |
| M2 | `isolation-level.ts:25` | stop ignoring the trailing separator | ✅ Killed (6) |
| M3 | `isolation-level.ts:38` | check workspace paths before worktrees (flip repo/workspace precedence) | ✅ Killed (1) |
| M4 | `isolation-level.ts:44` | primary checkout derived as `worktree` | ✅ Killed (6) |
| M5 | `isolation-level.ts:60` | missing workspace still returns a spawn cwd | ✅ Killed (1) |
| M6 | `isolation-level.ts:66` | remove the `repo.error` guard | ✅ Killed (1) |
| M7 | `isolation-level.ts:79` | `openWorktreeTarget` ignores `pathMissing` | ✅ Killed (1) |
| M8 | `isolation-level.ts:80` | return the match path instead of the worktree id (also shows for workspace) | ✅ Killed (2) |
| M9 | `session-levels.ts:32` | Worktree level includes the primary checkout | ✅ Killed (2) |
| M10 | `session-levels.ts:26` | Workspace level lists missing workspaces | ✅ Killed (1) |
| M11 | `session-levels.ts:60` | `initialLevel` ignores the source cwd | ✅ Killed (2) |
| M12 | `session-levels.ts:71` | level switch keeps a foreign cwd | ✅ Killed (3) |
| M13 | `session-levels.ts:81` | `adoptBrowsed` keeps the browsed spelling | ✅ Killed (1) |
| M14 | `rail-groups.ts:200-201` | level group wins over task group | ✅ Killed (2) |
| M15 | `rail-groups.ts:200` | level group wins over the path-missing orphan | ✅ Killed (1) |
| M16 | `rail-groups.ts:234` | worktree-level session gets a level group | ✅ Killed (4) |
| M17 | `rail-groups.ts:237` | group key not normalized | ✅ Killed (3) |
| M18 | `rail-groups.ts:246` | repo note = folder leaf instead of branch | ✅ Killed (2) |

**Sensor depth**: expanded (18 behavior-level mutations; the feature is not P0)
**Result**: 18/18 killed - PASS

---

## Gate Check

- `npm run typecheck`: exit 0 (node + web)
- `npm run lint`: exit 0, 0 errors, 18 warnings, all pre-existing in files outside this diff (`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`)
- `npx vitest run src/renderer`: **37 files, 851 passed, 0 failed, 0 skipped**
- In-scope files (`isolation-level.test.ts`, `session-levels.test.ts`, `rail-groups.test.ts`): 134 passed
- **Test delta**: +58 new tests (isolation-level 32, session-levels 16, rail-groups 10). No existing test was deleted or weakened: the `rail-groups.test.ts` diff is additive only (`@@ -816,3 +817,155`)
- The full `npm test` was not run. Known local flakes in `src/main` (`file-discard`, `worktree-manager`, `git-sync`, `hook-shell`) come from the non-ASCII tmpdir and machine load. They are unrelated to this renderer-only diff, and CI is the gate for them

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / surgical changes / no scope creep | ✅ Renderer-only, no IPC or persisted state (matches AD-050) |
| Matches patterns | ✅ Pure helpers in `lib/` with co-located tests; components stay thin |
| Spec-anchored outcomes | ✅ Exact labels, keys, notes and levels are asserted |
| Every test maps to an AC, edge case or Done-when | ✅ Each test name cites its AC |
| Guidelines followed | ✅ `.specs/codebase/TESTING.md` (no component unit tests; CDP smoke) |

---

## Findings (non-blocking)

- **G1 - spec-precision gap (ISO-05 AC4 / ISO-06 AC6, Minor).** The spec does not define what happens when a task-driven entry points at a primary checkout whose branch carries the task. The assumption table says task-driven entries "open on Worktree", but AC6 says a source cwd with a level selects that level. With one path, the dialog therefore opens on `Repo`. The chip is selected there but not task-highlighted, because `tagged` requires `o.level === 'worktree'` (`NewSessionDialog.tsx:217-220`). With several paths (`highlightWorktrees`), a highlighted primary checkout is not visible on the default `Worktree` level (`session-levels.ts:32`). Before this change, the single Worktree grid showed and highlighted it. Follow-up: decide in the spec whether the Repo chip carries the task highlight.
- **F1 - T6 does not typecheck on its own.** Checking out `fec8e3b` fails with `SessionRail.tsx(297,53): error TS2339: Property 'reason' does not exist on type 'OrphanGroup | LevelGroup'`. T7 (`62c97df`) fixes it. T6's quick gate ran vitest only, so the widened union broke a consumer outside the task. This is a recurrence of confirmed lesson L-001.
- **F2 - stale parameter name.** `App.tsx:384` `openWorktreeForSession = (cwd: string)` now receives a tree node id (`AgentsView.tsx:250`). Behaviour is correct because worktree ids are paths (`src/shared/tree.ts:13`), but the name is misleading.
- **F3 - level group time total uses the first row's cwd spelling** (`SessionRail.tsx:252-255`, `time-totals.ts:43`). The key lowercases the path but does not normalize separators, so sessions merged into one group from `M:/Work` and `m:\work\` total only the periods of the first spelling. No AC covers group totals.
- **Live smoke (2026-09-29, owner):** `node scripts/smoke-isolation-level.mjs` → **17/17 PASS**. Covers ISO-03 (workspace and repo menus), ISO-05/06 (level order, initial level, switching clears the selection and disables Spawn), ISO-07 (spawned terminals print the workspace path and the repo root), ISO-08 (`Workspace · source`, `Repo · Code` with note `develop`) and ISO-10 (no button for workspace; button selects the primary checkout), plus cleanup.
- **G1 fixed after verification:** Repo options now carry `taskId` (`session-levels.ts`), and the dialog tags Repo chips as well as Worktree chips (`NewSessionDialog.tsx`), so a task card pointing at a primary checkout on its branch highlights that chip again. New assertion in `session-levels.test.ts` (`taskId: 4821`); renderer suite 852/852.
- **Open, non-blocking:** the ISO-11 hand check (`start-task` from a workspace session, refocus, pinned card appears).

---

## Requirement Traceability Update

| Requirement | New Status |
| ----------- | ---------- |
| ISO-01, ISO-02, ISO-04 | ✅ Verified (unit) |
| ISO-03, ISO-05, ISO-06, ISO-07 | ✅ Verified (unit + code read; live smoke pending) |
| ISO-08, ISO-09, ISO-10 | ✅ Verified (unit + code read; live smoke pending) |
| ISO-11 | ⏳ AC2 verified by diff; AC1 hand check pending |

---

## Summary

**Overall**: ✅ Ready. Live smoke passed 17/17; G1 fixed. Only the ISO-11 hand check is still to run.
**Spec-anchored check**: 10/10 automated or code-read requirement groups matched the spec outcome; 1 spec-precision gap (G1)
**Sensor**: 18/18 killed
**Gate**: typecheck 0, lint 0 errors, renderer vitest 851 passed
