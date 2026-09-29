# Agent Isolation Level Specification

**Scope size:** Large (spec + requirement IDs; design inline; formal `tasks.md` after spec approval)
**Builds on:** `agent-sessions` (New Session dialog, `sessions:spawn`), `workspace-sidebar-tree` (Sidebar rows, context menu), `agents-rail-v2` (rail groups), `auto-pin-from-worktrees` (branch ↔ task mapping)
**Visual source of truth:** `design/handoff/DESIGN_HANDOFF_AGENTS.md`, `design/handoff/DESIGN_HANDOFF_AGENTS_RAIL_V2.md`. Read both before designing the selector and the rail group header.

## Problem Statement

An agent can only be started from a worktree row. Starting one at the root of a workspace or a repo means browsing for the folder by hand, and the resulting session shows up in the rail as `detached · <folder>`. That blocks the flow where a dev opens an agent at the workspace root, brainstorms, and has it create User Stories, tasks and their worktrees. The app already maps those worktrees to ADO tasks through auto-pin; what's missing is a first-class way to start at the wider levels and a rail that names them.

## Goals

- [ ] A dev opens an agent at the workspace root or the repo root in two clicks (right-click the row → Spawn agent here → Spawn), with no browsing
- [ ] Sessions at the workspace and repo levels show in the rail under their own labelled group instead of `detached`
- [ ] Worktrees the agent creates during the session show up in the tree and are auto-pinned by the existing `auto-pin-from-worktrees` mechanism, with no new pinning code
- [ ] Zero regressions to worktree-level spawn, task links, time tracking and the existing rail groups

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Live detection of new worktrees (watching `.git/worktrees`) | User decision: detection stays on the existing tree refresh triggers (startup, window focus, manual refresh, after create) |
| Linking a workspace/repo session to the worktrees or tasks it created | User decision: the link stays derived from the branch; no new stored state on the session |
| Creating User Stories / tasks in ADO from the app | The agent does it through its own skills (e.g. `start-task`); the app only observes the resulting branches |
| Storing the isolation level on the session | The level is derived from `cwd` against the tree at render time, like every other session attribution (`session-attribution.ts`) |
| Changing how a worktree session is attributed to a task | Existing `deriveAttribution` rules stay |
| New keyboard shortcuts for the new levels | Not requested |

---

## Decisions

- **Three levels, disjoint** (user + agent): `workspace` = the registered workspace folder (`WorkspaceNode.path`); `repo` = a repo's primary checkout (`WorktreeNode.isDefault`, whose path is the repo root); `worktree` = a linked worktree (`isDefault === false`).
- **Entry points = Sidebar menu + dialog selector** (user): the workspace row and the repo row get the same "Spawn agent here" context menu the worktree rows already have, and the New Session dialog gets a level selector (Workspace / Repo / Worktree) that filters the working-directory grid.
- **Detection unchanged** (user): new worktrees appear on the next existing tree refresh; auto-pin runs as it does today.
- **No session ↔ created-worktree link** (user).
- **Rail group per level** (user): a workspace or repo session gets its own group with a level label (`Workspace · <name>`, `Repo · <name>`), no longer the `detached` fallback.

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| How a session's level is derived | `cwd` compared against the tree: equal to a linked worktree path → `worktree`; equal to a primary checkout path → `repo`; equal to a workspace path → `workspace`; none → no level (existing `detached` handling) | Derived, never stored, same as the task link; survives app restarts with no migration | n |
| Path comparison for level derivation | Case-insensitive, `\` and `/` treated as equal, one trailing separator ignored | Windows paths; `WorkspaceEntry.id` is already a lowercased normalized path; a browsed folder can differ in case from the registered one | n |
| Workspace folder that is itself a repo (`ws.path` equals a primary checkout path) | `repo` wins for the rail label; the workspace chip still appears under Workspace in the selector | The more specific level carries more information (branch) | n |
| Primary checkout whose branch carries a task ID | Task group wins in the rail (existing behaviour); the level shows only when there is no task | Keeps `deriveAttribution` unchanged; the task is what the dev is working on | n |
| Session with a hand-linked task (`session.task`) at workspace/repo level | Task group wins in the rail (existing HTSK-11 rule) | Same as above | n |
| Grouping of several sessions at the same workspace/repo | Sessions at the same level + path share one group, keyed `level:<normalized path>` | Mirrors the task group (many sessions, one header); the dev asked for "grupo próprio" | n |
| Task highlight on a primary checkout | A Repo chip whose branch carries the dialog's task is highlighted like a Worktree chip | A task card can point at a primary checkout on a task branch; before this feature that chip was highlighted in the single grid (Verifier G1) | y |
| Default level when the dialog opens | From the source cwd's level when there is one; the generic "+ New session" and task-driven entries open on `Worktree` | Keeps every current entry point behaving as today | n |
| Worktree level contents | Linked worktrees only; the primary checkout moves to the Repo level | The levels are disjoint, so a chip never shows up twice | n |
| Empty level in the selector | The level stays selectable and the grid shows `No <level>s yet.`; Browse stays available | A disabled tab hides why it's empty | n |
| Switching level after picking a cwd | The picked cwd is cleared when it doesn't belong to the new level; Spawn is disabled until a new one is picked | Avoids spawning in a folder the dev no longer sees selected | n |
| Browsed folder that matches a known level | Treated as that level (the chip is selected and the level switches) | One folder, one identity | n |
| Missing workspace (`WorkspaceNode.missing`) | Its workspace row has no "Spawn agent here" item and no Workspace chip | Spawning in a missing folder already fails with `cwd does not exist` | n |
| Workspace row menu vs. existing workspace actions | The context menu adds the item; the existing remove/collapse controls stay as they are | Scope | n |
| Time tracking for workspace/repo sessions | Unchanged: task-less time is reported as `No task · <folder>` | Existing `hours-report` behaviour covers it | n |
| Session detail "Open worktree" button | Shown for `repo` (primary checkout is a tree node) and hidden for `workspace` (no tree node to select) | Follows the existing rule: shown only when the cwd matches a live tree node | n |

**Open questions:** none. All are resolved or logged above.

---

## User Stories

### P1: Level derivation ⭐ MVP

**User Story**: As a developer, I want the app to know whether a session runs at a workspace, repo or worktree, so that every surface can present it consistently.

**Acceptance Criteria**:

1. WHEN `isolationLevelOf(tree, cwd)` is called with a linked worktree's path THEN it SHALL return `{ level: 'worktree' }` with that worktree's workspace and repo  <!-- event-driven -->
2. WHEN it is called with a primary checkout's path THEN it SHALL return `{ level: 'repo' }` with that repo and its workspace  <!-- event-driven -->
3. WHEN it is called with a registered workspace's path that is not also a primary checkout path THEN it SHALL return `{ level: 'workspace' }` with that workspace  <!-- event-driven -->
4. WHEN it is called with a path that matches none of the above THEN it SHALL return `null`  <!-- event-driven -->
5. The comparison SHALL ignore case, treat `\` and `/` as equal, and ignore one trailing separator (`M:\Obogoni\` matches workspace path `m:/obogoni`)  <!-- ubiquitous -->
6. WHEN a workspace path equals a primary checkout path THEN it SHALL return `{ level: 'repo' }`  <!-- event-driven -->

**Independent Test**: Vitest table over a fixture tree with one workspace, two repos (one of them at the workspace path) and linked worktrees.

---

### P1: Spawn from workspace and repo rows ⭐ MVP

**User Story**: As a developer, I want to right-click a workspace or a repo in the Sidebar and start an agent there, so that I can brainstorm above the worktree level.

**Acceptance Criteria**:

1. WHEN the dev right-clicks a workspace row whose workspace is not missing THEN the Sidebar SHALL show the context menu with "Spawn agent here"  <!-- event-driven -->
2. WHEN "Spawn agent here" is chosen on a workspace row THEN the New Session dialog SHALL open with level `Workspace` and cwd = that workspace's path selected  <!-- event-driven -->
3. WHEN the dev right-clicks a repo row THEN the Sidebar SHALL show the context menu with "Spawn agent here"  <!-- event-driven -->
4. WHEN "Spawn agent here" is chosen on a repo row THEN the New Session dialog SHALL open with level `Repo` and cwd = that repo's primary checkout path selected  <!-- event-driven -->
5. IF the workspace is missing THEN its row SHALL NOT offer "Spawn agent here"  <!-- unwanted -->
6. IF a repo has no primary checkout in the tree (git error, `repo.error` set) THEN its row SHALL NOT offer "Spawn agent here"  <!-- unwanted -->
7. WHEN "Spawn agent here" is chosen on a worktree row THEN the dialog SHALL open with level `Worktree`, or `Repo` for the primary checkout row, and that cwd selected  <!-- event-driven -->

**Independent Test**: Right-click the workspace row, spawn Claude, and the terminal's `pwd` is the workspace folder.

---

### P1: Level selector in the New Session dialog ⭐ MVP

**User Story**: As a developer, I want to pick the isolation level in the New Session dialog, so that I can choose any workspace, repo or worktree without browsing.

**Acceptance Criteria**:

1. The dialog SHALL show a level selector with three options in this order: `Workspace`, `Repo`, `Worktree`  <!-- ubiquitous -->
2. WHILE `Workspace` is selected the grid SHALL list one chip per non-missing workspace, showing its display name and path  <!-- state-driven -->
3. WHILE `Repo` is selected the grid SHALL list one chip per primary checkout, showing the repo name, its current branch and the workspace name  <!-- state-driven -->
4. WHILE `Worktree` is selected the grid SHALL list only linked worktrees (`isDefault === false`), with the chip content and task highlight they have today  <!-- state-driven -->
5. WHEN the dialog opens without a source cwd THEN the selected level SHALL be `Worktree`  <!-- event-driven -->
6. WHEN the dialog opens with a source cwd that has a level THEN that level SHALL be selected  <!-- event-driven -->
7. WHEN the dev switches level and the selected cwd is not in the new level's grid THEN the selection SHALL be cleared and Spawn SHALL be disabled until a chip is picked  <!-- event-driven -->
8. WHEN the selected level's grid is empty THEN the grid SHALL show `No workspaces yet.`, `No repos yet.` or `No worktrees yet.` and Browse SHALL stay available  <!-- event-driven -->
9. WHEN the dev browses to a folder that has a level THEN that level SHALL be selected and its chip SHALL be the selection  <!-- event-driven -->
10. WHEN Spawn is pressed THEN the session SHALL be spawned through the existing `sessions:spawn` call with the selected cwd, with no new IPC field  <!-- event-driven -->

**Independent Test**: Open "+ New session", switch to Workspace, pick the workspace chip, spawn; switch to Repo, pick a repo, spawn; each terminal starts in the expected folder.

---

### P1: Rail group per level ⭐ MVP

**User Story**: As a developer, I want workspace and repo sessions grouped and labelled in the rail, so that I can tell a brainstorm session from a task session at a glance.

**Acceptance Criteria**:

1. WHEN a session with no task (neither from the branch nor linked) runs at level `workspace` THEN the rail SHALL render it in a group labelled `Workspace · <workspace displayName>`  <!-- event-driven -->
2. WHEN a session with no task runs at level `repo` THEN the rail SHALL render it in a group labelled `Repo · <repo name>` with the primary checkout's branch as the note  <!-- event-driven -->
3. WHEN two or more task-less sessions share the same level and path THEN the rail SHALL render them in one group, keyed `level:<normalized path>`, with rows in persisted order  <!-- event-driven -->
4. IF a workspace/repo session has a task (branch or hand-linked) THEN the rail SHALL render it in that task's group, as today  <!-- unwanted -->
5. IF a workspace/repo session's path is missing THEN the rail SHALL keep the existing `worktree path missing` orphan group  <!-- unwanted -->
6. The rail SHALL keep rendering worktree-level sessions and sessions with no level exactly as today (task group, `untagged worktree`, `detached · <folder>`)  <!-- ubiquitous -->
7. WHEN a session's level is `workspace` THEN the session detail SHALL NOT show the "Open worktree" button, and WHEN it is `repo` THEN the button SHALL be shown and select the primary checkout  <!-- event-driven -->

**Independent Test**: Vitest on `buildRailGroups` with a fixture tree; live check: spawn at the workspace and at a repo and read the two group headers.

---

### P2: Worktrees created in session reach the tree

**User Story**: As a developer who created a worktree from a workspace-level agent, I want it to appear in the tree with its task pinned, so that I don't pin anything by hand.

**Acceptance Criteria**:

1. WHEN an agent creates a worktree whose branch matches the effective template and the tree is next refreshed (focus, manual refresh, startup) THEN the worktree SHALL appear under its repo and its task SHALL be pinned by the existing auto-pin path  <!-- event-driven -->
2. The feature SHALL NOT add a new tree refresh trigger or a new pinning code path  <!-- ubiquitous -->

**Independent Test**: Live only: from a workspace-level Claude session run `start-task` for a real task, switch windows and back; the worktree and its card appear. No new automated test (behaviour covered by `auto-pin-from-worktrees`).

---

## Edge Cases

- IF a workspace has no repos THEN the Workspace chip SHALL still be listed and spawnable
- IF the tree refresh removes a workspace while a session runs at its root THEN the session SHALL fall back to the existing `detached · <folder>` group (no level)
- WHEN a browsed folder is a subfolder of a repo (not its root) THEN it SHALL have no level and show as detached, as today
- WHEN the same repo name exists in two workspaces THEN each Repo chip SHALL show its workspace name, and the rail groups SHALL stay separate (keyed by path)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| ISO-01 | P1: Level derivation (AC 1–4) | Done | Verified |
| ISO-02 | P1: Level derivation (AC 5–6, normalization + precedence) | Done | Verified |
| ISO-03 | P1: Spawn from rows (AC 1–4, 7) | Done | Verified |
| ISO-04 | P1: Spawn from rows (AC 5–6, guards) | Done | Verified |
| ISO-05 | P1: Level selector (AC 1–4, grids) | Done | Verified |
| ISO-06 | P1: Level selector (AC 5–9, default + switching + browse) | Done | Verified |
| ISO-07 | P1: Level selector (AC 10, spawn contract) | Done | Verified |
| ISO-08 | P1: Rail group (AC 1–3) | Done | Verified |
| ISO-09 | P1: Rail group (AC 4–6, precedence + no regression) | Done | Verified |
| ISO-10 | P1: Rail group (AC 7, Open worktree) | Done | Verified |
| ISO-11 | P2: Created worktrees reach the tree (AC 1–2) | Done | AC2 verified; AC1 hand check pending |

**Coverage:** 11 total, 11 mapped to tasks (T1–T11); ISO-01..10 verified (Verifier PASS, sensor 18/18 killed, live smoke 17/17), ISO-11 AC1 hand check pending

---

## Success Criteria

- [ ] From a fresh app, right-click workspace → Spawn agent here → Spawn starts Claude at the workspace root, and the rail shows `Workspace · <name>`
- [ ] A worktree created by that session via `start-task` appears with its pinned card after the next focus, with no manual pin
- [ ] Existing Vitest suite stays green; new cases cover every AC above except ISO-11 (live check)
