# Session Follows the Worktree It Edits Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/session-follows-worktree/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (Test Coverage Matrix, Gate Check Commands), `vitest.config.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Shared pure helpers (`src/shared/*.ts`) | unit | Every branch; 1:1 to the SFWT ACs they serve; every listed edge case | `src/shared/<module>.test.ts` | `npm test` |
| Main deep modules (`SessionManager`, `TimeTracker`, `KnownWorktrees`, `edited-path`) | unit (injected fakes, no real git) | Every SFWT AC they own, happy + unwanted + edge cases | `src/main/<module>.test.ts` | `npm test` |
| Renderer pure libs (`src/renderer/src/lib/*.ts` with logic) | unit | Followed-path and no-followed-path cases per reader | `src/renderer/src/lib/<module>.test.ts` | `npm test` |
| Types only (`config.ts` fields, `ipc-contract.ts`) | none | build gate only | - | `npm run typecheck` |
| `index.ts` wiring, React components, `use-sessions` subscription | none (CDP smoke) | covered by the smoke task | - | `node scripts/smoke-follow-worktree.mjs` |
| Docs (`.specs/STATE.md`) | none | build gate only | - | `npm run typecheck && npm run lint && npm test` |
| Smoke script | manual | One real Claude session moves; falsified against a build without the wiring | `scripts/smoke-*.mjs` | `node scripts/smoke-follow-worktree.mjs` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After type-only, wiring or component tasks, and at each phase end | `npm run typecheck && npm run lint && npm test` |
| Build | After the last task, before the Verifier | `npm run typecheck && npm run lint && npm test && npm run build:win` |

---

## Execution Plan

Phases run in order; tasks within a phase run in order.

### Phase 1: Shared foundation

```
T1 → T2 → T3
```

### Phase 2: Main

```
T4 → T5 → T6 → T7 → T8
```

### Phase 3: Renderer

```
T9 → T10 → T11 → T12 → T13 → T14 → T15
```

### Phase 4: Verification and record

```
T16 → T17
```

---

## Task Breakdown

### T1: Path matching and the attributed folder

**What**: `deepestContaining(worktreePaths, target)` (case-insensitive, `\` = `/`, separator boundary, deepest wins, returns the path as given) and `workCwdOf(session)` (`followedPath ?? cwd`).
**Where**: `src/shared/worktree-match.ts`
**Depends on**: None
**Reuses**: AD-037 rule in `src/renderer/src/lib/tree-selection.ts`
**Requirement**: SFWT-03, SFWT-11

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [x] Tests: subfolder match, case difference, mixed separators, `.wt-a` vs `.wt-ab`, nested worktrees (deepest wins), no match → null, empty list → null; `workCwdOf` with and without `followedPath`
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(shared): match a path to its deepest worktree`

---

### T2: Persisted followed path

**What**: Optional `followedPath` on `PersistedSession`, documented as attribution-only (SFWT-01).
**Where**: `src/shared/config.ts`
**Depends on**: T1
**Reuses**: `task?` field pattern
**Requirement**: SFWT-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Field added with its doc comment
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full
**Commit**: `feat(config): store the worktree a session follows`

---

### T3: The followed-path event

**What**: `session:followed: { id: string; followedPath: string | null }` in the main → renderer event map.
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: T2
**Reuses**: `session:task` entry
**Requirement**: SFWT-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Event declared beside `session:task`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full
**Commit**: `feat(ipc): announce a session's followed worktree`

---

### T4: Edited path from a hook payload

**What**: `editedPathOf(payload)`: the absolute path of an `Edit`, `Write`, `MultiEdit` or `NotebookEdit` in a `PreToolUse` / `PostToolUse` payload, else null.
**Where**: `src/main/edited-path.ts`
**Depends on**: None
**Reuses**: payload fixtures in `src/main/activity-machine.test.ts`
**Requirement**: SFWT-02

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [ ] Tests: each of the four tools in both events; `notebook_path`; `Bash`, `Read`, `Stop` → null; missing `tool_input`, non-string, empty and relative path → null
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(sessions): read the file an agent edits from its hook`

---

### T5: Known worktrees with one re-read on a miss

**What**: `KnownWorktrees` with `replace`, `match` and `resolve` (miss inside a known workspace → one coalesced `reread(workspace)`, merge, match again; failure logs and returns null; outside every workspace → null with no re-read).
**Where**: `src/main/known-worktrees.ts`
**Depends on**: T4
**Reuses**: `deepestContaining` (T1)
**Requirement**: SFWT-03, SFWT-12, SFWT-13, SFWT-14

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [ ] Tests with a fake `reread`: hit without re-read; miss in a workspace re-reads once and matches; two concurrent misses share one re-read; miss outside every workspace never re-reads; failed re-read → null and `logError` called; `replace` drops stale paths
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(sessions): resolve an edited path to a known worktree`

---

### T6: The time tracker follows the folder

**What**: `TimeTracker.followedChanged(sessionId, path)` and `started` reading `followedPath ?? cwd`.
**Where**: `src/main/time-tracker.ts`
**Depends on**: T5
**Reuses**: `taskChanged`
**Requirement**: SFWT-08, SFWT-09, SFWT-10

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [ ] Tests: counting run closes at the move and opens in the new folder at the same instant with the new branch and the same task; earlier period unchanged; same folder → no-op; paused run keeps the folder for its resume; `null` returns to the launch folder; `started` with `followedPath` opens there
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(time): move a running period to the followed worktree`

---

### T7: The session manager applies the follow rule

**What**: `followedChanged` on `SessionLifecycle`; optional `worktrees` dep; `#follow` after `handleHookEvent`'s activity update; `clearFollowed(path)`; load drops a `followedPath` that no longer exists; respawn keeps it; `ActivityChange.cwd` carries `workCwdOf`.
**Where**: `src/main/session-manager.ts`
**Depends on**: T6
**Reuses**: `setTask` persist/emit/lifecycle path
**Requirement**: SFWT-01, SFWT-04, SFWT-05, SFWT-06, SFWT-07, SFWT-15, SFWT-16

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [ ] Tests with fake worktrees and lifecycle: edit in another worktree moves (persist, `session:followed`, `followedChanged`); edit in the launch worktree, in the followed one, outside every worktree, non-edit tool → nothing; second worktree moves again; answer after stop dropped; `clearFollowed` clears only matching sessions; load drops a missing `followedPath`; respawn keeps it; duplicate has none; hand-set task unchanged; no `worktrees` dep → nothing
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(sessions): follow the worktree the agent edits`

---

### T8: Wire it in main

**What**: Build `KnownWorktrees` (re-read lists the workspace's repos through `listWorktrees`), feed it from `tree:get`, pass it to `SessionManager`, call `clearFollowed` after a worktree removal, emit a tree refresh hint after a move.
**Where**: `src/main/index.ts`
**Depends on**: T7
**Reuses**: `tree:get` handler, `worktrees:remove` handler
**Requirement**: SFWT-12, SFWT-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Wiring added; no new logic beyond calls
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full
**Commit**: `feat(main): wire worktree following`

---

### T9: Renderer refreshes on a move

**What**: `use-sessions` refreshes the session list on `session:followed`.
**Where**: `src/renderer/src/lib/use-sessions.ts`
**Depends on**: None
**Reuses**: `session:task` subscription
**Requirement**: SFWT-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Subscription added and released on unmount
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full
**Commit**: `feat(sessions): refresh when a session follows a worktree`

---

### T10: Rail groups by the followed worktree

**What**: Rail grouping, level group and tooltip read `workCwdOf(session)`.
**Where**: `src/renderer/src/lib/rail-groups.ts`
**Depends on**: T9
**Reuses**: `workCwdOf` (T1)
**Requirement**: SFWT-11

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [ ] Tests: a session launched at the workspace folder with a followed worktree groups under that worktree's branch; without a followed path, unchanged
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(rail): group a session under the worktree it follows`

---

### T11: Rail level totals by the followed folder

**What**: Level group clock and live flag read `workCwdOf`.
**Where**: `src/renderer/src/components/SessionRail.tsx`
**Depends on**: T10
**Reuses**: `index.worktreeTotalMs`
**Requirement**: SFWT-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Both reads switched
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full
**Commit**: `feat(rail): total a level group by the followed folder`

---

### T12: Status bar shows the followed branch

**What**: `status-bar` resolves a session's worktree with `workCwdOf`.
**Where**: `src/renderer/src/lib/status-bar.ts`
**Depends on**: T11
**Reuses**: `worktreeContaining`
**Requirement**: SFWT-11

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [ ] Tests: followed path → followed worktree's branch; none → launch folder as today
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(status-bar): show the branch a session follows`

---

### T13: Isolation level by the followed folder

**What**: The session-to-worktree id in `isolation-level` reads `workCwdOf`.
**Where**: `src/renderer/src/lib/isolation-level.ts`
**Depends on**: T12
**Reuses**: `isolationLevelOf`
**Requirement**: SFWT-11

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [ ] Tests: followed path → `worktree` level of the followed worktree; none → as today
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(sessions): place a session's isolation by the followed folder`

---

### T14: Worktree lists and turn-end recount

**What**: Worktree detail and Files session lists, the running filter and `worktreeForTurnEnd` read `workCwdOf`.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T13
**Reuses**: `workCwdOf`
**Requirement**: SFWT-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Four reads switched
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full
**Commit**: `feat(ui): list a session under the worktree it follows`

---

### T15: Agents view attribution

**What**: `AgentsView` derives attribution from `workCwdOf`; the cwd label and "Respawn in" keep `session.cwd`.
**Where**: `src/renderer/src/components/AgentsView.tsx`
**Depends on**: T14
**Reuses**: `deriveAttribution`
**Requirement**: SFWT-11, SFWT-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Attribution switched; launch-folder labels unchanged
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full
**Commit**: `feat(agents): attribute a session by the worktree it follows`

---

### T16: Smoke a real session following a worktree

**What**: CDP smoke: spawn a Claude session in a throwaway workspace folder, create a second worktree, ask the agent to write a file there, assert the rail moves the session, the time log gains a period in the worktree, respawn starts in the launch folder; falsified against a build without T8.
**Where**: `scripts/smoke-follow-worktree.mjs`
**Depends on**: None (Phase 3 complete)
**Reuses**: `scripts/smoke-session-name.mjs`, `scripts/smoke-time.mjs`
**Requirement**: SFWT-01, SFWT-08, SFWT-11, SFWT-16

**Tools**:

- MCP: NONE
- Skill: `run`

**Done when**:

- [ ] Smoke passes on the feature build and fails on a build without the wiring
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test && npm run build:win`

**Tests**: manual
**Gate**: build
**Commit**: `test(smoke): drive a session that follows a worktree`

---

### T17: Record the attribution decision

**What**: Next `AD-NNN` in `.specs/STATE.md`: a session is attributed to `followedPath ?? cwd`; the PTY, respawn, duplicate and title use `cwd`; mark spec traceability Verified-pending.
**Where**: `.specs/STATE.md`
**Depends on**: T16
**Reuses**: AD-050 wording
**Requirement**: SFWT-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] AD entry added with the next free number checked against `origin/main`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full
**Commit**: `docs(state): record attribution by the followed worktree`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 → T2 → T3
Phase 2:  T4 → T5 → T6 → T7 → T8
Phase 3:  T9 → T10 → T11 → T12 → T13 → T14 → T15
Phase 4:  T16 → T17
```
