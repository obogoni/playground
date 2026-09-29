# Agent Isolation Level Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/agent-isolation-level/spec.md` (ISO-01..11)
**Design**: inline below (no `design.md`: renderer-only, no new IPC, no new persisted state)
**Status**: Approved (2026-09-29)
**Branch**: `feature/agent-isolation-level` (cut from `origin/main`)
**Test baseline**: **B = 2228** tests on the branch before T1 (2026-09-29). Locally 3-5 real-git/process tests in `src/main` (`worktree-manager`, `git-sync`, `hook-shell`, `file-discard`) fail intermittently from machine load; they are pre-existing noise (CI is the gate) and are not regressions of this renderer-only feature. Every "Test count" below is written as `B + N`, cumulative.
**Before T1**: AD-050 is recorded in `.specs/STATE.md` (see Design §Decision to record); it is committed together with the spec docs in the first commit.

---

## Design (inline)

Renderer-only. `SessionManager.spawn` already accepts any `cwd`, so nothing changes in main, preload or the IPC contract.

**Modules**

| Module | New / modified | Responsibility |
| ------ | -------------- | -------------- |
| `src/renderer/src/lib/isolation-level.ts` | new | `samePath(a, b)`; `isolationLevelOf(tree, cwd): IsolationMatch \| null`, where `IsolationMatch = { level: 'workspace' \| 'repo' \| 'worktree'; path: string; workspace: WorkspaceNode; repo?: RepoNode; worktree?: WorktreeNode }` and `path` is the tree's own spelling; `rowSpawnCwd` helpers for workspace and repo rows; `openWorktreeTarget(tree, session)` |
| `src/renderer/src/lib/session-levels.ts` | new | New Session dialog view model: `levelOptions(tree, level)`, `initialLevel(tree, sourceCwd)`, `cwdAfterLevelChange(tree, level, cwd)`, `adoptBrowsed(tree, path)` |
| `src/renderer/src/lib/rail-groups.ts` | modified | New `LevelGroup` kind (`kind: 'level'`, `level: 'workspace' \| 'repo'`, `label`, `note`), keyed `level:<normalized path>`, inserted between the task branch and the orphan fallback |
| `SessionRail.tsx`, `Sidebar.tsx`, `NewSessionDialog.tsx`, `AgentsView.tsx` | modified | Render / wire the helpers above |

**Precedence in the rail** (ISO-08, ISO-09): task (branch or hand link) → `path missing` orphan → level group (`workspace`/`repo`) → existing orphan (`untagged` / `detached`). A `worktree`-level session never gets a level group.

**Dialog state**: the dialog keeps `level` and `cwd`. `NewSessionSource` is unchanged; the Sidebar passes the row's cwd and the dialog derives the level with `initialLevel`, so App.tsx needs no change.

**Visuals** (from `DESIGN_HANDOFF_AGENTS.md` and `_RAIL_V2.md`): the level selector reuses the Settings shell-picker segmented style (`set-shell-segmented`: each segment `flex: 1`, radius 9px, selected = accent border + tint), placed between the "Working directory" label and the grid. Workspace chips show the display name (mono 12.5px / 600) and the path (11px, faint); Repo chips show the repo name, then `<branch> · <workspace>`. The level group header reuses the orphan header layout, with the icon `folder` (workspace) or `git-branch` (repo) in place of the fork glyph, the label in `var(--text-muted)` non-italic, and the note (repo branch; workspace path leaf) in 11px faint.

**Decision to record (AD-050)**: a session's isolation level (`workspace` / `repo` / `worktree`) is derived from its `cwd` against the tree at render time and never stored. Levels are disjoint (primary checkout = `repo`, linked worktrees = `worktree`). A task-less `workspace`/`repo` session gets its own rail group keyed by level and path, and sessions at the same level and path share it. This amends RAIL-V2 handoff rule 3 ("orphans are never merged") for these two levels only.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (renderer React components are verified by CDP smoke + visual pass; renderer `lib/` pure modules are unit-tested, e.g. `rail-groups.test.ts`, `session-attribution.test.ts`), `vitest.config.ts` (`src/**/*.test.ts`), AD-003 (coverage report-only), confirmed lessons L-001 and L-005.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Renderer pure logic (`src/renderer/src/lib/*.ts`) | unit | All branches; 1:1 to the spec ACs each implements; every spec Edge Case that touches it | co-located `<module>.test.ts` | `npx vitest run <file>` |
| Renderer React components (`src/renderer/src/components/*.tsx`) | none | CDP smoke + visual pass (TESTING.md convention) | - | build gate + `node scripts/smoke-isolation-level.mjs` |
| CDP smoke script (`scripts/smoke-*.mjs`) | manual only | Walks the spec Success Criteria against a live app | `scripts/smoke-isolation-level.mjs` | `node scripts/smoke-isolation-level.mjs` (live session) |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <touched test files>` |
| Full | Not used (no integration/e2e layer in scope) | - |
| Build | After each phase and after component-only tasks | `npm run typecheck && npm run lint && npm test` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Pure logic

```
T1 → T2
T1 → T3 → T4
T1 → T5
```

### Phase 2: Rail

```
T1 → T6 → T7
```

### Phase 3: Entry points and wiring

```
T8
T9
T10
T8 → T11
T9 → T11
T10 → T11
```

---

## Task Breakdown

### T1: Level derivation

**What**: `samePath` and `isolationLevelOf(tree, cwd)` returning the level match or `null`
**Where**: `src/renderer/src/lib/isolation-level.ts` (new, + `isolation-level.test.ts`)
**Depends on**: None
**Reuses**: `worktreeOf` walk in `src/renderer/src/lib/session-attribution.ts`; `WorkspaceNode`/`RepoNode`/`WorktreeNode` from `src/shared/tree.ts`
**Requirement**: ISO-01, ISO-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Linked worktree path → `worktree`, primary checkout path → `repo`, workspace path → `workspace`, unknown path / repo subfolder → `null` (spec P1 Level derivation AC 1–4, Edge Case "subfolder")
- [x] `M:\Obogoni\` matches `m:/obogoni`; `/` vs `\` and one trailing separator ignored (AC 5)
- [x] Workspace path equal to a primary checkout path → `repo` (AC 6)
- [x] Missing workspace (`missing: true`) and repo with `error` set still derive from whatever nodes the tree holds; a workspace with zero repos → `workspace` (Edge Case "no repos")
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/isolation-level.test.ts`
- [x] Test count: B + ≥8 tests pass (no silent deletions)

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(sessions): derive isolation level from a session cwd`

---

### T2: Row spawn targets

**What**: `workspaceSpawnCwd(ws)` / `repoSpawnCwd(repo)` returning the cwd a row's "Spawn agent here" opens, or `null` when the row must not offer it
**Where**: `src/renderer/src/lib/isolation-level.ts` (modify, + tests)
**Depends on**: T1
**Reuses**: T1 types
**Requirement**: ISO-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Workspace not missing → its `path`; `missing: true` → `null` (spec P1 Spawn from rows AC 5)
- [x] Repo → its primary checkout's `path`; `error` set or no `isDefault` worktree → `null` (AC 6)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/isolation-level.test.ts`
- [x] Test count: B + ≥12 tests pass (no silent deletions)

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(sessions): resolve spawn targets for workspace and repo rows`

---

### T3: Level options for the dialog grid

**What**: `levelOptions(tree, level)` returning the chips for one level, in tree order
**Where**: `src/renderer/src/lib/session-levels.ts` (new, + `session-levels.test.ts`)
**Depends on**: T1
**Reuses**: `worktreeOptions` shape in `NewSessionDialog.tsx`; `taskIdFromBranch` from `src/shared/tasks.ts`
**Requirement**: ISO-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `workspace` → one option per non-missing workspace with `displayName` + `path` (spec P1 Level selector AC 2), including a workspace with no repos
- [x] `repo` → one option per primary checkout with repo name, branch and workspace name; same repo name in two workspaces yields two options with distinct workspace names (AC 3, Edge Case "same repo name")
- [x] `worktree` → only `isDefault === false` worktrees, with branch, repo, workspace and `taskId` as today (AC 4)
- [x] Empty tree → `[]` for every level (AC 8 data side)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/session-levels.test.ts`
- [x] Test count: B + ≥17 tests pass (no silent deletions)

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(sessions): list working-directory options per isolation level`

---

### T4: Dialog level state rules

**What**: `initialLevel(tree, sourceCwd)`, `cwdAfterLevelChange(tree, level, cwd)` and `adoptBrowsed(tree, path)`
**Where**: `src/renderer/src/lib/session-levels.ts` (modify, + tests)
**Depends on**: T3
**Reuses**: T1 `isolationLevelOf`
**Requirement**: ISO-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `initialLevel` → `worktree` without a source cwd or when the cwd has no level; the cwd's level otherwise (spec P1 Level selector AC 5–6)
- [x] `cwdAfterLevelChange` keeps the cwd when it is one of the new level's options and returns `null` otherwise (AC 7)
- [x] `adoptBrowsed` returns `{ level, cwd: <tree spelling> }` for a folder with a level and `{ level: null, cwd: <as browsed> }` otherwise (AC 9)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/session-levels.test.ts`
- [x] Test count: B + ≥24 tests pass (no silent deletions)

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(sessions): pick and keep the dialog's isolation level`

---

### T5: Open-worktree target

**What**: `openWorktreeTarget(tree, session)` returning the tree node id the "Open worktree" button selects, or `null` to hide the button
**Where**: `src/renderer/src/lib/isolation-level.ts` (modify, + tests)
**Depends on**: T1
**Reuses**: T1 `isolationLevelOf`
**Requirement**: ISO-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `worktree` level → that worktree's `id`; `repo` level → the primary checkout's `id` (spec P1 Rail group AC 7)
- [x] `workspace` level, no level, or `session.pathMissing` → `null`
- [x] A cwd differing only in case from the tree path still returns the tree's `id`
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/isolation-level.test.ts`
- [x] Test count: B + ≥29 tests pass (no silent deletions)

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(sessions): resolve the tree node a session opens`

---

### T6: Level groups in the rail model

**What**: `LevelGroup` kind in `buildRailGroups`, with precedence task → missing → level → orphan
**Where**: `src/renderer/src/lib/rail-groups.ts` (modify, + `rail-groups.test.ts`)
**Depends on**: T1
**Reuses**: `orphanGroup`, `toRailGroup`, `folderLeaf` in the same file
**Requirement**: ISO-08, ISO-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Task-less workspace session → group `Workspace · <displayName>`, note = workspace path leaf, `ariaLabel` = label (spec P1 Rail group AC 1)
- [x] Task-less repo session → group `Repo · <repo name>`, note = primary checkout branch (AC 2)
- [x] Two task-less sessions at the same path (differing only in case) → one group keyed `level:<normalized path>`, rows in persisted order; same repo name in two workspaces → two groups (AC 3, Edge Case "same repo name")
- [x] Branch-tagged primary checkout and hand-linked task at workspace level → task group (AC 4)
- [x] `pathMissing` workspace/repo session → `worktree path missing` orphan (AC 5)
- [x] Every existing `rail-groups.test.ts` case still passes unchanged (AC 6); workspace removed from the tree → `detached · <folder>` (Edge Case "workspace removed")
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/rail-groups.test.ts`
- [x] Test count: B + ≥37 tests pass (no silent deletions)

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(rail): group workspace and repo sessions by level`

---

### T7: Render level groups in the rail

**What**: `SessionRail` renders a `LevelGroup` header (icon, label, note) and totals its time by cwd like an orphan
**Where**: `src/renderer/src/components/SessionRail.tsx` (modify; styles in `SessionRail.css`)
**Depends on**: T6
**Reuses**: orphan header markup and `worktreeTotalMs` path in the same component
**Requirement**: ISO-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `group.kind === 'level'` renders the handoff-derived header (Design §Visuals); task and orphan groups render unchanged
- [x] Typecheck passes with the new union member (no `never` fall-through)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B + ≥37 tests pass (no silent deletions)

**Status**: ✅ Done

**Tests**: none
**Gate**: build

**Commit**: `feat(rail): render workspace and repo group headers`

---

### T8: Spawn from workspace and repo rows

**What**: Sidebar workspace header and repo row open the existing context menu with "Spawn agent here" when their spawn cwd is not `null`
**Where**: `src/renderer/src/components/Sidebar.tsx` (modify)
**Depends on**: None
**Reuses**: `openMenu` / `onRowContextMenu` in the same file; T2 `workspaceSpawnCwd` / `repoSpawnCwd`
**Requirement**: ISO-03, ISO-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Right-click on a non-missing workspace header and on a healthy repo row shows "Spawn agent here"; choosing it calls `onSpawnAgent(<spawn cwd>)` (spec P1 Spawn from rows AC 1–4)
- [x] A missing workspace or errored repo shows no menu (AC 5–6); worktree rows behave as today (AC 7)
- [x] Right-click on the workspace header does not toggle collapse
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B + ≥37 tests pass (no silent deletions)

**Status**: ✅ Done

**Tests**: none
**Gate**: build

**Commit**: `feat(sidebar): spawn agents from workspace and repo rows`

---

### T9: Level selector in the New Session dialog

**What**: Segmented Workspace / Repo / Worktree selector driving the working-directory grid
**Where**: `src/renderer/src/components/NewSessionDialog.tsx` (modify; styles in `NewSessionDialog.css`)
**Depends on**: None
**Reuses**: T3 `levelOptions`, T4 `initialLevel` / `cwdAfterLevelChange` / `adoptBrowsed`; `set-shell-segmented` styling from `SettingsDialog`
**Requirement**: ISO-05, ISO-06, ISO-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Selector shows `Workspace`, `Repo`, `Worktree` in that order, initial value from `initialLevel` (spec P1 Level selector AC 1, 5, 6)
- [x] Grid lists `levelOptions(tree, level)`; empty level shows `No workspaces yet.` / `No repos yet.` / `No worktrees yet.` with Browse still shown (AC 2–4, 8)
- [x] Switching level applies `cwdAfterLevelChange`; Spawn disabled while `cwd === null` (AC 7)
- [x] Browse applies `adoptBrowsed`; a folder with no level keeps the existing detached notice (AC 9)
- [x] `onSpawn` signature and `sessions:spawn` payload unchanged (AC 10)
- [x] Task highlight in the Worktree level unchanged
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B + ≥37 tests pass (no silent deletions)

**Status**: ✅ Done

**Tests**: none
**Gate**: build

**Commit**: `feat(sessions): choose the isolation level in the New Session dialog`

---

### T10: Open worktree follows the level

**What**: Session detail "Open worktree" button uses `openWorktreeTarget` for visibility and the id it selects
**Where**: `src/renderer/src/components/AgentsView.tsx` (modify)
**Depends on**: None
**Reuses**: T5 `openWorktreeTarget`; existing `onOpenWorktree` prop
**Requirement**: ISO-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Button hidden for workspace sessions, shown for repo and worktree sessions, and `onOpenWorktree` receives the tree node id (spec P1 Rail group AC 7)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B + ≥37 tests pass (no silent deletions)

**Status**: ✅ Done

**Tests**: none
**Gate**: build

**Commit**: `feat(agents): open the tree node of repo-level sessions`

---

### T11: CDP smoke for isolation levels

**What**: Smoke script walking the spec Success Criteria against a live app
**Where**: `scripts/smoke-isolation-level.mjs` (new)
**Depends on**: T8, T9, T10
**Reuses**: `scripts/smoke-rail-v2.mjs` and `scripts/smoke-agents.mjs` CDP helpers
**Requirement**: ISO-03, ISO-05, ISO-08, ISO-10, ISO-11

**Tools**:

- MCP: NONE
- Skill: `run`

**Done when**:

- [x] Script: right-click workspace → Spawn agent here → dialog on `Workspace` with the workspace chip selected → spawn an Ad-hoc `pwd` → terminal shows the workspace path → rail shows `Workspace · <name>` with no "Open worktree" button
- [x] Same for a repo row → `Repo · <name>` + "Open worktree" selects the primary checkout
- [x] Switching the dialog to `Repo` clears a Workspace selection and disables Spawn
- [ ] ISO-11 checked by hand: a worktree created from the workspace session via `start-task` appears with its pinned card after a window refocus (result logged in `validation.md`)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: B + ≥37 tests pass (no silent deletions)

**Status**: ✅ Done (script written and syntax-checked; not run live, a live run and the ISO-11 hand check stay open for the orchestrator/user)

**Tests**: manual only
**Gate**: build

**Commit**: `test(smoke): cover spawning agents at workspace and repo level`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 → T2
          T1 → T3 → T4
          T1 → T5
Phase 2:  T1 → T6 → T7
Phase 3:  T8 → T11
          T9 → T11
          T10 → T11
```

Execution is strictly sequential, in task-number order. 11 tasks pack into two batches: **Batch A** = Phases 1–2 (T1–T7), **Batch B** = Phase 3 (T8–T11).

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Level derivation | 2 functions, 1 module | ✅ Granular |
| T2: Row spawn targets | 2 tiny functions, same module | ✅ Cohesive |
| T3: Level options | 1 function | ✅ Granular |
| T4: Dialog level state rules | 3 small functions, same module | ⚠️ Cohesive (one state model) |
| T5: Open-worktree target | 1 function | ✅ Granular |
| T6: Level groups in rail model | 1 function change | ✅ Granular |
| T7: Render level groups | 1 component | ✅ Granular |
| T8: Sidebar spawn | 1 component | ✅ Granular |
| T9: Dialog selector | 1 component | ✅ Granular |
| T10: Open worktree button | 1 component | ✅ Granular |
| T11: Smoke script | 1 script | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | none | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1 | T1 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T1 | T1 → T5 | ✅ Match |
| T6 | T1 (Phase 1) | cross-phase, backward | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | None in phase (uses T2, Phase 1) | none | ✅ Match |
| T9 | None in phase (uses T3, T4, Phase 1) | none | ✅ Match |
| T10 | None in phase (uses T5, Phase 1) | none | ✅ Match |
| T11 | T8, T9, T10 | T8/T9/T10 → T11 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Renderer pure logic | unit | unit | ✅ OK |
| T2 | Renderer pure logic | unit | unit | ✅ OK |
| T3 | Renderer pure logic | unit | unit | ✅ OK |
| T4 | Renderer pure logic | unit | unit | ✅ OK |
| T5 | Renderer pure logic | unit | unit | ✅ OK |
| T6 | Renderer pure logic | unit | unit | ✅ OK |
| T7 | Renderer React component | none | none | ✅ OK |
| T8 | Renderer React component | none | none | ✅ OK |
| T9 | Renderer React component | none | none | ✅ OK |
| T10 | Renderer React component | none | none | ✅ OK |
| T11 | CDP smoke script | manual only | manual only | ✅ OK |
