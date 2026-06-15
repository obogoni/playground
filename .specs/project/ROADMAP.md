# Roadmap

**Current Milestone:** M4 — Board View & Configurability
**Status:** M1–M4 feature work complete (Per-Workspace Config verified on `feature/per-workspace-config`, awaiting PR merge) — v1 roadmap done after that merge

Milestones follow the PRD's suggested slice ordering (issue #1, "Further Notes"). The app is intended to be daily-usable at the end of M1.

---

## M1 — Walking Skeleton & Worktree Navigation

**Goal:** An Electron app the user can open every day: registered workspaces, full sidebar tree of repos and worktrees, and one-click launchers. No ADO yet.
**Target:** App lists real worktrees from disk and launches Explorer / Terminal / VS Code on any of them.

### Features

**App Skeleton & Design System** - COMPLETE

- Electron + React + TypeScript scaffold; main/renderer split with plain request/response IPC layer
- Design tokens (dark + light theme CSS variables), top bar shell (brand, segmented control, refresh, theme toggle)
- Global config persistence scaffold (`%APPDATA%/<app>/`, last-session UI state incl. theme)

**Workspace Registration & Sidebar Tree** - COMPLETE

- Register/remove a workspace folder (`WorkspaceRegistry`, persisted)
- Auto-discover git repos in a workspace (`RepoScanner`, single-level scan, ignore rules)
- List worktrees per repo via `git worktree list`; sidebar tree: workspace → repo → worktree rows
- Worktree selection + detail pane (breadcrumb, branch title, status pills, location row with copy)

**Launch Shortcuts** - COMPLETE

- `ShortcutLauncher`: open File Explorer, Windows Terminal, VS Code at the selected worktree path
- "Open with" launcher cards in the detail pane (per design handoff)

---

## M2 — Worktree Lifecycle

**Goal:** Create and delete worktrees from the app — the tool replaces hand-typed `git worktree` commands.

### Features

**Create Worktree (taskless)** - COMPLETE

- New-worktree dialog: repo picker, base branch, branch name; live path preview
- `WorktreeManager.create`: flat-sibling placement `<workspace>/<repo>-<sanitized-branch>`, branch sanitization rules per PRD
- Sidebar refreshes and selects the new worktree (no auto-open)

**Delete Worktree (guarded)** - COMPLETE

- `WorktreeManager.remove` with dirty-check: refuse when uncommitted changes or primary checkout
- Danger section in detail pane with disabled-look + inline reason
- Clear error messaging on failed worktree operations

---

## M3 — ADO Tasks & Start-Work Flow

**Goal:** The full PRD loop: pin an ADO task, start work on it, see the link everywhere.

### Features

**Pinned Tasks Pane** - COMPLETE

- `AdoGateway`: token via `az account get-access-token`, work item GET by IDs; "run `az login`" empty state on auth failure
- `TaskBoard`: pin by ID or URL (URL parsing, defaults from global config), unpin, persistence
- Tasks pane UI: add row, task cards with type/state pills, live refresh on app focus + manual

**Start Work from Task** - COMPLETE

- Branch template rendering `{type}/{id}-{slug}` (Bug → `bugfix`, else `feature`; slug sanitization), editable in dialog
- Start-work dialog per design handoff (repo chips, base branch, live path preview)
- Task-ID extraction from branch names (first standalone multi-digit number); task tags on sidebar worktree rows; linked-task card in detail pane; worktree counts on task cards

---

## M4 — Board View & Configurability

**Goal:** Second layout direction and the remaining config surface.

### Features

**Board Direction** - COMPLETE

- Pinned-task chip strip + workspace/repo-grouped worktree card grid
- Chip highlight/dim behavior, per-card launcher buttons; direction choice persisted

**Per-Workspace Config** - COMPLETE

- `.app/` directory in workspace: branch template override
- Settings for default org/project + global branch template (editable)

---

## Post-v1 Enhancements

**Worktree Name Template** - COMPLETE

- Configurable worktree folder name (`{repo}`/`{branch}`/`{id}`; default `{repo}-{branch}`), mirroring the branch template
- Global `ado.worktreeTemplate` (Settings dialog) + per-workspace `.app/config.json` `worktreeTemplate` override
- Empty-render guard blocks creation with a readable message (WTNT-01..04)

---

## Future Considerations (v2+, per PRD)

- Embedded terminal hosting (PTY tabs, xterm.js, node-pty)
- Agent management (saved command/prompt templates)
- ADO write operations and query-based feeds
- Per-workspace IDE/terminal overrides; multi-platform; sandboxed AFK runs
