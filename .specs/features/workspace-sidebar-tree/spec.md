# Workspace Registration & Sidebar Tree Specification

**Milestone:** M1 — Walking Skeleton & Worktree Navigation
**Sources of truth:** PRD issue #1 (stories 1–4, 16 partial, 20 partial; §Data model, §Module decomposition), `design_handoff_worktree_manager/README.md` (§1a Sidebar tree, §1b Worktree detail)

## Problem Statement

The shell exists but shows nothing. The daily-use value of M1 is seeing every workspace, repo, and worktree in one sidebar and inspecting any worktree's state — replacing "remember where worktrees live on disk". This feature ships `WorkspaceRegistry`, `RepoScanner`, worktree listing, the sidebar tree (§1a), and the detail pane (§1b subset).

## Goals

- [ ] Register/remove workspace folders; list persists across restarts
- [ ] Sidebar tree shows real workspaces → repos → worktrees from disk, including dirty indicators
- [ ] Selecting a worktree renders its detail pane (breadcrumb, branch title, status pills, location + copy)
- [ ] Top-bar refresh re-scans disk and reconciles the tree

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Task tags on worktree rows / linked-task card (PRD story 5) | M3 — needs `AdoGateway` + `TaskBoard`; rows show untagged text per §1a |
| "Open with" launcher cards, shortcut buttons (PRD 17–19) | Next M1 feature (Launch Shortcuts) |
| Create/delete worktree, danger section (PRD 10–15) | M2 — Worktree Lifecycle |
| Pinned tasks pane (§1c) | M3 |
| Board direction content (§2) | M4 |
| Per-workspace `.app/` config | M4 |

---

## User Stories

### P1: Register a workspace ⭐ MVP

**User Story**: As a developer, I want to register a folder on my disk as a workspace, so that the app knows where to look for my projects (PRD story 1; story 20 partial).

**Why P1**: Everything in the tree hangs off registered workspaces.

**Acceptance Criteria**:

1. WHEN the sidebar header "+" button is clicked THEN system SHALL open a native folder picker and register the chosen folder as a workspace `{ id, path, displayName }` (displayName defaults to folder name)
2. WHEN a workspace is registered THEN system SHALL persist it to global config via `WorkspaceRegistry` (main process) and it SHALL survive restart
3. WHEN the chosen folder is already registered (same absolute path, case-insensitive on Windows) THEN system SHALL not create a duplicate
4. WHEN the picker is cancelled THEN system SHALL change nothing

**Independent Test**: Click "+", pick a folder, see it appear in the tree; relaunch — still there; pick it again — no duplicate.

---

### P1: Discover repos and worktrees ⭐ MVP

**User Story**: As a developer, I want the app to automatically detect every git repository inside a registered workspace and list its worktrees, so that I don't have to add anything by hand (PRD stories 2, 3).

**Why P1**: The tree's content; the core read path of the whole product.

**Acceptance Criteria**:

1. WHEN a workspace is opened/scanned THEN `RepoScanner` SHALL find repos by single-level scan for `.git` **directories** (PRD §Module decomposition), ignoring `node_modules`, hidden dirs, and non-directories
2. WHEN a directory contains a `.git` **file** (a linked worktree, e.g. flat-sibling `<repo>-<branch>` folders) THEN system SHALL NOT list it as a repo — it appears as a worktree under its repo
3. WHEN a repo is scanned THEN system SHALL list its worktrees via `git worktree list` and expose `{ id, branch, path, isDefault, dirty, changes }` per worktree (handoff §State Management; `taskId` deferred to M3)
4. WHEN a worktree has uncommitted changes THEN system SHALL report `dirty: true` and the change count (via `git status --porcelain`)
5. WHEN a workspace path no longer exists, contains no repos, or `git` fails for a repo THEN system SHALL degrade gracefully (empty/error note in the tree, no crash)

**Independent Test**: Register a workspace containing 2 real repos, one with an extra worktree and uncommitted changes — tree shows both repos, 3 worktree rows, dirty dot on the dirty one.

---

### P1: Sidebar tree ⭐ MVP

**User Story**: As a developer, I want all workspaces, repos, and worktrees in a single sidebar tree, so that I have one place to navigate my work (PRD story 3; handoff §1a).

**Why P1**: The primary navigation surface, used daily from this feature onward.

**Acceptance Criteria**:

1. WHEN the sidebar renders THEN system SHALL match §1a: 286px pane, "WORKSPACES" header with "+" button, workspace rows (chevron + folder icon + name), repo rows (git-branch icon + mono name + worktree-count pill), worktree rows (fork glyph + mono branch + amber dirty dot)
2. WHEN a worktree resolves no task THEN line 2 SHALL show the §1a untagged text: "primary checkout — no task" (default checkout) or "no task ID in branch" (all rows untagged until M3)
3. WHEN a worktree row is clicked THEN system SHALL mark it selected (accent tint + inset left accent bar) and render it in the detail pane
4. WHEN no workspaces are registered THEN system SHALL show an empty state inviting the user to add one (not in prototype — style consistent with §1a)

**Independent Test**: Visual pass against the `.dc.html` prototype with a real workspace registered; click rows and watch selection move.

---

### P1: Worktree detail pane ⭐ MVP

**User Story**: As a developer, I want a detail view of the selected worktree, so that I can see its branch, cleanliness, and disk location at a glance (handoff §1b subset).

**Why P1**: Selection without detail is dead UI; the location row is the "where does it live" payoff.

**Acceptance Criteria**:

1. WHEN a worktree is selected THEN system SHALL render per §1b: breadcrumb `<workspace> / <repo>`, branch name as mono h1, with the fadeIn entrance
2. WHEN the worktree is dirty THEN status row SHALL show the amber "N uncommitted change(s)" pill; clean SHALL show the green "Working tree clean" pill; the default checkout additionally shows the neutral "primary" pill
3. WHEN the location row's copy button is clicked THEN system SHALL copy the absolute worktree path to the clipboard with brief visual feedback
4. WHEN no worktree is selected THEN the detail pane SHALL show an empty state (style consistent with §1b)

**Independent Test**: Select dirty/clean/primary worktrees and verify pills; click copy and paste the path elsewhere.

---

### P2: Remove a workspace

**User Story**: As a developer, I want to remove a workspace from the app without deleting its files, so that I can clean up the sidebar (PRD story 4).

**Why P2**: Needed for honest registry management, but not on the daily hot path.

**Acceptance Criteria**:

1. WHEN the remove affordance on a workspace row is used THEN system SHALL unregister the workspace (persisted) and remove its subtree from the sidebar
2. WHEN a workspace is removed THEN system SHALL NOT touch any files on disk
3. WHEN the removed workspace contained the selected worktree THEN the detail pane SHALL return to its empty state

**Independent Test**: Remove a workspace; tree updates, relaunch confirms it stays gone, folder on disk untouched.

---

### P2: Manual refresh

**User Story**: As a developer, I want the top-bar refresh to re-scan my workspaces, so that the tree reflects disk reality after external changes (PRD story 16, manual half — auto-refresh on app-driven create/delete lands in M2).

**Acceptance Criteria**:

1. WHEN refresh is clicked THEN system SHALL re-run repo/worktree discovery for all workspaces and reconcile the tree (selection preserved if the worktree still exists)
2. WHEN the selected worktree disappeared on disk THEN the detail pane SHALL return to its empty state

**Independent Test**: Add a worktree from a terminal, click refresh — it appears; remove it, refresh — it disappears.

---

## Edge Cases

- WHEN `git` is not on PATH THEN system SHALL surface a clear per-repo error, not crash
- WHEN a repo has a detached-HEAD or bare entry in `git worktree list` THEN list parsing SHALL not break (label sensibly)
- WHEN a workspace contains many repos THEN scans SHALL run per-repo and the UI SHALL stay responsive (no UI freeze on slow disks)
- WHEN the persisted workspace list references a now-missing path THEN the row SHALL render with an error note and remain removable
- WHEN branch names are long THEN rows and the detail h1 SHALL ellipsize/wrap per §1a/§1b (`overflow-wrap: anywhere`)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TREE-01 | P1: Register a workspace | Done (T1, T2, T5, T8) | Verified |
| TREE-02 | P1: Discover repos and worktrees | Done (T1, T3, T4, T5) | Verified |
| TREE-03 | P1: Sidebar tree | Done (T6, T8) | Verified |
| TREE-04 | P1: Worktree detail pane | Done (T7, T8) | Verified |
| TREE-05 | P2: Remove a workspace | Done (T2, T5, T6, T8) | Verified |
| TREE-06 | P2: Manual refresh | Done (T5, T8) | Verified |

**Coverage:** 6 total, 6 mapped to tasks, 0 unmapped ✅ (verified via 23 new module behavior tests — 29 total — + 12-check CDP smoke against a live seeded workspace, incl. external-removal refresh reconciliation)

---

## Testing Notes (from PRD §Testing Decisions)

- `RepoScanner`: real temp dirs — expected depth, ignores `node_modules`/nested, stable ordering, missing path, empty workspace
- Worktree listing (`WorktreeManager.list`, introduced here list-only; create/remove in M2): real temp git repos — parses `git worktree list` edge cases, default-checkout detection, dirty/changes counts
- `WorkspaceRegistry`: add/remove/list/dedupe persistence round-trip (injected dir, Electron-free, same pattern as `ConfigStore`)
- React components: not unit-tested per PRD; verified via UAT/CDP smoke

## Success Criteria

- [ ] Real daily workspaces registered once show every repo and worktree correctly, surviving restart
- [ ] Tree ↔ disk reconciliation via refresh never crashes regardless of external git activity
- [ ] Visual fidelity pass against the `.dc.html` prototype for §1a and §1b (minus M2/M3 sections)
