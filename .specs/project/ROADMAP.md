# Roadmap

**Current Milestone:** **M6 — Workflows (epic #56)** — NEARLY COMPLETE: WF1 + WF2 + WF3 + WF4 merged to `main`; **WF5 (Workflows UI) executed + independently verified (PASS)** on `feature/workflows-ui` — owner-run two-example UI smoke + PR/merge are all that remain (merging WF5 closes the epic).
**Status:** v1 (M1–M4) + worktree-name-template (post-v1) + M5 (v2) complete and on `main`. M5 AM1 (Agent Spike) merged PR #39, AM2 (Agent Sessions) merged PR #41 (`Closes #40`), AM3 (Agent Config) merged PR #44 (`Closes #43`). AGCF-05 remove-worktree confirm + visual theme toggle = hand-verify only (code merged). **M6 (Workflows) now active — see below.**
**Next (planned 2026-09-19):** **M7 — Files Direction** — a status bar plus five stacked slices, each with spec, design and tasks on its own branch; nothing executed yet. See M7 below and AD-022..AD-028.

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

**Refresh Base Branch on Worktree Create** - COMPLETE (code; hand-verify pending)

- Default-on "Update base branch from remote" checkbox in both create dialogs; when on (+ base given), `createWorktree` fast-forwards the local base to its remote upstream before cutting the branch, so new branches start current (WBR-01/04)
- Fast-forward only, in-place `merge --ff-only` inside the worktree holding the checked-out base (else a direct ref fetch); any refresh failure (no upstream / fetch fail / diverged / dirty base) **blocks** the create with a readable inline error — never a silent stale base (WBR-02)
- Per-dialog default, **not persisted** (no `AppConfig` field); inert when no base branch is given; new optional `worktrees:create` `updateBase` field; `GIT_TERMINAL_PROMPT=0` so a credential-less fetch fails fast (WBR-03/05)

**Session Strip Polish** - PLANNED (spec + tasks on `feature/session-strip-polish`)

- An MCP tool reads `MCP <server>` in the session detail's activity pill, the raw tool name kept in its tooltip; the rail tooltip and the OS notification keep the raw name (STRP-01..06)
- The session clock pauses and resumes on click — a `<button aria-pressed>` with a pause / play icon — replacing the Pause time / Resume time buttons (STRP-07..15)
- 6 tasks, inline. Cut from `develop`, the only ref holding both halves (the pill arrived with #88, the clock with #93); its PR follows #93 and #94

**Hours Calendar** - COMPLETE (on `feature/hours-calendar`, PR #99)

- The Hours direction becomes a week calendar: Monday–Friday columns (weekend columns only when they hold time), each merged block a bar at the hours it happened, parallel agents side by side (HCAL-01..14)
- The selected day's detail — groups, raw periods, edit, delete, Copy — under the grid, unchanged (HCAL-15..20); legend, tooltips and a live-growing bar for running time (HCAL-21..23)
- Three validated task colours for the week's three biggest tasks, the rest as Other, never repainted while shown (HCAL-11, 24; AD-030). 11 tasks; supersedes TIME-34 when it ships (AD-029)

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

## M6 — Workflows (v3, epic #56)

**Goal:** User-authored, code-first automations (`~/.playground/workflows/<name>/workflow.ts`) that orchestrate deterministic + AI-agent steps with data flowing between them, running headless Claude Code on the personal subscription. Sliced milestone-by-milestone (AD-006); each is independently verifiable.
**Source:** PRD issue #56 (34+ stories) + WF1 empirical findings. Scope decisions: AD-006/007/008.

### Milestones

**WF1 — Headless-agent spike (de-risk)** - COMPLETE (merged PR #64)

- Throwaway spike pinning every Claude Code headless flag (`--print`, `--output-format json`, loopback HTTP-MCP, `--json-schema`, `--permission-mode`, `--resume`); direct `shell:false` spawn with stdin closed (AD-007). Frozen under `scripts/wf1-spike/`.

**WF2 — Engine + `ctx` facade + WorkflowManager** - COMPLETE (merged PR #64)

- Deterministic primitives `ctx.worktree/git/sh/ado/notify`; `instrument()` auto-log; serial runner; run-state reducer + persistence; ADO child-task fetching (`$expand=Relations`).

**WF3 — Structured agent step (`ctx.agent` + MCP result server)** - COMPLETE (merged PR #65)

- `ctx.agent({prompt, expect, cwd, permission})` → validated `{status, data?, question?, sessionId}`; self-hosted loopback MCP `emit_result` server (per-step bearer token = auth+routing, ajv validation); permission presets read/write/bypass (default read, guaranteed non-mutating); one corrective `--resume` retry; cancel→child-kill; `session_id` capture; `blocked` returned as-is (WF3-01..25).
- Independent SDD eval: **Final 0.98 "Spec-complete"**. Two minor gaps (WF3-04 generic retry prompt, WF3-10 unasserted server reuse) **carried into WF4**.

**WF4 — Blocker + resume (native toasts)** - COMPLETE (merged PR #66, merge `660180b`)

- `ctx.ask()` + engine-driven **pause on `blocked`** + `workflows:respond` + resume the same conversation via `--resume`; native OS toast on block/finish/fail + click-to-focus-run (US 21/22/23/24/25). Grafts onto WF3's `blocked`-as-is envelope + reserved `WorkflowManager.notifier`.
- 8 tasks / 3 phases, 20 ACs (WF4-01..20), Approach A (block-loop in the DI'd runner). Scope + architecture = **AD-010**. Folded in the 3 WF3 carry-in gaps (WF4-18/19/20). Verifier PASS (20/20, sensor 5/5); owner-run live smoke PASSED 9/9 (`42c4317e`, statuses `[running,blocked,running,done]`, session resumed via `--resume`).

**WF5 — Workflows UI** - EXECUTED + VERIFIED (owner-smoke + PR remain)

- Workflows view (fourth direction), live step timeline, blocked-respond panel, run-trigger dialog from `meta.inputs`, New workflow (scaffold + reveal) / Reload, `workflow:focus-run` handling (US 6/7/8/9/22/23/24/28/30/31). Scope + architecture = **AD-011**.
- 10 tasks / 3 phases (inline), 25 ACs (WF5-01..25), 11 commits `5f0ad4d..1c5b84c` on `feature/workflows-ui`. Two unit-tested pure seams (`workflow-run-view` fold, `workflow-scaffold`); the rest hand-verified per the project's UI convention. Verifier **PASS** (25/25 ACs, discrimination sensor 5/5 killed, gate 440/440 tests, prod build OK). Report: `.specs/features/workflows-ui/validation.md`.
- **Remaining:** owner-run two-example UI smoke ("review PR" + "implement ticket" driven through the GUI with a live agent) → PR (`Closes #56`) → `gh pr merge --admin`.

---

## M7 — Files Direction (epic)

**Goal:** Browse, read, diff and review any worktree without leaving the app — its files, what its branch changed, its commits, and its pull request on Azure DevOps or GitHub — preceded by a Visual Studio-style status bar.
**Source:** owner request, and one grill over the whole epic (2026-09-17..19). Structure and cross-cutting decisions: **AD-022..AD-028**.
**Status:** **PLANNED** — every feature has spec, design and tasks, committed on its own branch; nothing executed. The branches stack in merge order below, each PR "depends on" the previous one.

### Features

**Status Bar** (prerequisite; `feature/status-bar`, from `main`) - PLANNED

- Always-mounted bottom bar: repo name and a middle-truncated branch, `↓n ↑n` from local refs only, a sync / pull / push / fetch / publish popover with incoming and outgoing commits, a changed-file counter (STBR-01..32; 18 tasks)
- Introduces `src/main/git.ts`, the single git invoker every later slice uses (AD-023)

**F1 — Explore** (`feature/files-explore`) - PLANNED

- Sixth direction, `Files`: full-folder (`.gitignore`-aware, lazy), diff-to-origin and uncommitted modes; read-only Monaco tabs that follow an agent's writes; Explorer / VS Code / VS 2022 / VS 2026 launchers, `.sln` → VS 2026 (FXPL-01..32; 23 tasks)
- T13, a packaged-build Monaco spike, is a stop point (AD-025); the counter of the status bar lands here (AD-028)

**F2 — Diffs** (`feature/files-diff`) - PLANNED

- Per-file diffs and a lazily mounted All changes stack; side by side or inline; unchanged regions folded; line-ending changes made visible (FDIF-01..32; 21 tasks; T1 diff-editor spike)

**F3 — Commits** (`feature/files-commits`) - PLANNED

- The branch's first-parent commits since its base, not-pushed markers, a commit opened as a stack of diffs, copy sha and open on the provider (FCMT-01..32; 16 tasks)

**F4 — Azure DevOps Pull Requests** (`feature/files-pr-ado`) - PLANNED

- The branch's PR, fork included: Overview, threads beside their lines, and — P2 — reply, thread status, a thread from a selection, a general comment (FPRA-01..36, FPRA-37 conditional; 27 tasks)
- First write to Azure DevOps (AD-027); first third-party content rendered (AD-026); T1 is an owner-gated sandbox spike

**F5 — GitHub Pull Requests** (`feature/files-pr-github`) - PLANNED

- The same surfaces over GitHub: a `gh` chip beside `az`, reviews, resolve / reopen, out-of-diff selections posted as cited general comments (FPRG-01..26; 22 tasks)
- Its `GitHubGateway` is what issue #50 (GitHub issues as work items) extends; T1 is an owner-gated scratch-repository spike, never on this repository's upstream

---

## Future Considerations (v3+, per PRD)

- Task→agent auto-briefing (inject task title/description as opening prompt; `promptTemplate` reserved)
- Agent-activity notifications ("claude finished" / "awaiting input") — see STATE.md Deferred Ideas
- ADO write operations and query-based feeds
- Per-workspace agent/IDE/terminal overrides; multi-platform; sandboxed AFK runs
