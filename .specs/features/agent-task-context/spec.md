# Feature: Agent Task Context & Jump-to-Worktree

**Milestone:** Post-v2 Enhancement
**Size:** Medium (no new architecture; reuses the existing `linkedPin` task-join, `typeClass`/`stateClass` pills, and direction switching)
**Sources:** PRD #1 (Agents direction, handoff §C); builds on M5 AM2/AM3 (`SessionRail`, `AgentsView`, `session-attribution.ts`).

## Why

Two friction points in the Agents direction now that sessions are first-class:

1. An agent session only shows a bare `#<id>` derived from its worktree branch. A dev glancing at the rail can't tell *which* task an agent is on without cross-referencing the Tasks pane. Surfacing the pinned ADO item (title + type/state) gives that context in place.
2. From a running agent there's no fast path to the worktree's launchers. To open Visual Studio (or Explorer/Terminal/VS Code) on the same worktree the dev must manually switch to the Tree direction and re-find the row. A one-click shortcut in the session header removes that.

## Requirements

### ACTX-01 — Linked ADO task on agent rail cards
When a session's cwd resolves to a worktree whose branch carries a task ID **and** that ID is pinned with resolved details, the `SessionCard` shows the task **title** plus **type** and **state** pills (reusing `typeClass`/`stateClass`), in addition to the existing branch/`#id` meta line.
- Source of the join: the derived `taskId` (from `deriveAttribution`) matched against the pinned `tasks.tasks` list — the same first-match-wins rule App.tsx already uses for `linkedPin`.

### ACTX-02 — Graceful degradation (no new failure modes)
- Derived task ID but **not pinned** (or details unavailable): keep the current bare `#<id>` treatment — no title/pills.
- **Detached** session (cwd matches no worktree): unchanged — `detached` tag, no task context.
- `path missing`: unchanged.

### ACTX-03 — Linked ADO task in the session detail
The `SessionDetail` strip (top pane of the open session) shows the same linked-task context as the rail card — title + type/state pills — when resolvable, with the same degradation rules as ACTX-02. Visual treatment may be richer than the compact rail card but uses the shared pill classes.

### ACTX-04 — "Open worktree" shortcut in the session detail top bar
The session detail header (`agents-detail-bar`) gains an **Open worktree** button that switches to the **Tree** direction with that session's worktree selected, landing the user on the `WorktreeDetail` "Open with" launchers (Explorer / Windows Terminal / VS Code / Visual Studio 2022).
- Enabled only when the session is **attributed to a live worktree** (cwd matches a worktree node, i.e. not `detached` and not `pathMissing`). Otherwise hidden or disabled with a reason.
- Selection key is the worktree path (`WorktreeNode.id === path === session.cwd`), so the jump is `setSelectedId(session.cwd)` + `direction: 'tree'`.

## Out of scope

- No new IPC, no persisted state, no `SessionView` shape change — task link stays **derived, never stored** (project principle).
- No reverse "open agent from worktree" change (already exists via the worktree detail spawn entry point).
- No fetching of unpinned task details (we only enrich what's already pinned/cached).

## Verification (hand-verify in dev; renderer-only, no unit-testable seam)

- ACTX-01/03: a session in a worktree whose branch task ID is pinned shows title + type/state pills on the rail card and in the detail strip.
- ACTX-02: an unpinned-ID session shows only `#id`; a detached session shows `detached`; both unchanged from today.
- ACTX-04: the Open-worktree button on an attributed session lands on that worktree's detail with the Visual Studio 2022 launcher present; the button is absent/disabled for a detached or path-missing session.
