# Roadmap

**Current Milestone:** None active — M5 (v2) COMPLETE. Next planned work is v3 (see Future Considerations).
**Status:** Planned roadmap through v2 done and on `main`. v1 (M1–M4) + worktree-name-template (post-v1) complete; M5 AM1 (Agent Spike) merged PR #39, AM2 (Agent Sessions) merged PR #41 (`Closes #40`), AM3 (Agent Config) merged PR #44 (`Closes #43`). AGCF-05 remove-worktree confirm + visual theme toggle = hand-verify only (code merged).

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

**Agent Task Context & Jump-to-Worktree** - COMPLETE (code; hand-verify pending)

- Agent rail cards + session detail strip show the linked ADO task (title + type/state pills) when the session's worktree branch carries a *pinned* task ID; bare `#id`/`detached` fallbacks unchanged (ACTX-01..03)
- "Open worktree" shortcut in the session detail top bar jumps to the Tree direction with that worktree selected (to the "Open with" launchers, incl. Visual Studio 2022); shown only when attributed to a live worktree (ACTX-04)
- Renderer-only: new `linkedPinFor` join helper; link stays derived, never stored; no new IPC

---

## M5 — Embedded Agent Sessions (v2)

**Goal:** Spawn CLI coding agents (Claude / Copilot / Codex / ad-hoc) as worktree-rooted embedded terminal sessions — a consolidated, attributed overview of all agent activity instead of loose terminal windows.
**Source:** PRD issue #37 (40 stories) + `design/handoff/DESIGN_HANDOFF_AGENTS.md`. Introduces the app's first native module (`node-pty`), first streaming IPC (AD-004), and a packaging concern. Sliced per the PRD's own AM1/AM2/AM3 recommendation; each sub-milestone is independently daily-usable.

### Features

**Agent Spike (AM1 — de-risk)** - COMPLETE

- Thinnest vertical slice proving the scary stack end-to-end: `node-pty` + `xterm.js` + typed streaming IPC, **rebuilt + packaged**
- One hard-coded agent, one live embedded terminal; no rail, no persistence, no config
- Keeps & grows the plumbing (`PtyPort`, streaming-IPC maps/bridge, `buildSpawnPlan`, `TerminalPane`, packaging fix); throws away only the single-agent trigger (ASPK-01..06)

**Agent Sessions (AM2)** - COMPLETE (merged PR #41)

- Agents direction + card rail (master-detail); N sessions; attach/detach with ring-buffer scrollback replay
- `SessionManager` + `SessionRingBuffer`; persistence (`AppConfig.sessions[]`) + restore-as-stopped + respawn; Stop/Remove
- All spawn entry points; derived task tags; reconciliation + path-missing flag

**Agent Config & Integration (AM3)** - COMPLETE (merged PR #44, `Closes #43`)

- Editable agent registry (`AppConfig.agents[]`) + ad-hoc command + Settings dialog; default-shell setting
- Worktree-delete-vs-running confirmation (warn + kill); rename/duplicate; soft concurrency warning; full ANSI role-palette theming; in-memory last-output preview
- **Deferred (not AM3):** amber agent-exited sub-status + agent-exit detection (no observable signal without a sentinel/polling)

---

## Future Considerations (v3+, per PRD)

- Task→agent auto-briefing (inject task title/description as opening prompt; `promptTemplate` reserved)
- Agent-activity notifications ("claude finished" / "awaiting input") — see STATE.md Deferred Ideas
- ADO write operations and query-based feeds
- Per-workspace agent/IDE/terminal overrides; multi-platform; sandboxed AFK runs
