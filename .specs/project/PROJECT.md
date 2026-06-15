# Playground — ADO Task & Worktree Manager (Skinny MVP)

**Vision:** A Windows desktop dashboard that bridges Azure DevOps work items to git worktrees — one place to see every worktree across registered workspaces, pin the ADO tasks being worked on, spin up task-linked worktrees, and launch Explorer / Windows Terminal / VS Code rooted at any worktree.
**For:** A solo developer juggling multiple (multi-repo) projects with several AI coding agents running in parallel on different branches.
**Solves:** The friction of going from "task in ADO" to "worktree on disk with tools open on it" — today a manual chain of terminal commands, path memorization, and window juggling with no single overview.

## Goals

- Replace the manual worktree workflow: creating a task-linked worktree is one short dialog (task → repo → base branch → confirm).
- Single source of navigation: every workspace, repo, and worktree visible in one sidebar tree, each worktree tagged with its ADO task when resolvable.
- Zero-hosting bridge: the app spawns external tools (Explorer, `wt.exe`, `code`) — it hosts nothing itself.
- Daily-usable from the earliest milestone (sidebar + launch shortcuts alone already remove most friction).

## Tech Stack

**Core:**

- Framework: Electron (main process owns FS, child processes, ADO HTTP, persistence) + React renderer
- Language: TypeScript end-to-end
- Persistence: YAML/JSON files (global config in `%APPDATA%/<app>/`, per-workspace `.app/` dir) — no database

**Key dependencies / integrations:**

- Azure DevOps REST API (view-only), auth via `az account get-access-token` (no stored secrets)
- `git worktree` subcommands via child processes
- No xterm.js, no node-pty

**Key sources of truth:**

- PRD: GitHub issue #1 (behavior + architecture)
- Design handoff: `design/handoff/` (visual fidelity — hifi tokens, layouts, interactions)

## Scope

**v1 includes:**

- Workspace registration + auto-discovery of git repos and their worktrees (sidebar tree)
- Manually pinned ADO tasks (paste ID/URL; title/type/state fetched live; refresh on focus/manual)
- Start-work flow: task → worktree with branch from configurable template `{type}/{id}-{slug}`
- Worktree create (with or without task) / delete (refuse when dirty); flat-sibling placement `<repo>-<sanitized-branch>`
- Task↔worktree link derived purely from the branch name (first standalone multi-digit number)
- One-click launchers: File Explorer, Windows Terminal, VS Code
- Persistence of workspaces, pinned tasks, settings, last-session UI state
- UI per design handoff: Tree (3-pane) + Board directions, Start-work dialog, light/dark theme

**Explicitly out of scope (v1):**

- Embedded terminal hosting (PTY, xterm.js) and agent management — deferred to v2
- ADO write operations, WIQL/query feeds ("assigned to me", sprints)
- Per-workspace IDE/terminal overrides (hard-coded Explorer / `wt.exe` / `code`)
- Multi-platform support (Windows-only), custom chat UI, telemetry, auto-update, sandboxing

## Constraints

- Technical: Windows-only; ADO auth strictly via `az` CLI (graceful "run `az login`" message on failure); no shadow state for task links (branch name is the link); module decomposition fixed by PRD (`WorkspaceRegistry`, `RepoScanner`, `WorktreeManager`, `AdoGateway`, `TaskBoard`, `ShortcutLauncher`).
- Testing: behavior-level tests with real git/FS in temp dirs for `WorktreeManager`, `TaskBoard`, `RepoScanner`; `AdoGateway`, `ShortcutLauncher`, and React components deliberately untested in v1.
- Design: hifi handoff is the source of truth for colors/typography/spacing; PRD is the source of truth for behavior.
