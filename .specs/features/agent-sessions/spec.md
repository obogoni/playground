# Agent Sessions (AM2) Specification

> **Milestone:** M5 — Embedded Agent Sessions (v2). **Sub-milestone:** AM2.
> **Sources of truth (AD-001):** PRD issue #37 (behavior/architecture) + `design/handoff/DESIGN_HANDOFF_AGENTS.md` (visual fidelity; `Worktree Manager.dc.html` → switch to **Agents**). Streaming-IPC shape fixed by **AD-004**.
> **Builds on AM1 (merged PR #39):** the de-risked plumbing now on `main` — `src/main/pty-port.ts` (`PtyPort`), `src/main/spawn-plan.ts` (`buildSpawnPlan`, tested), the AD-004 IPC maps in `src/shared/ipc-contract.ts` (`IpcEvents.session:data/exit`, `IpcSends.session:input/resize`, typed `on`/`send`), and `src/renderer/src/components/TerminalPane.tsx` (xterm + fit + live theming). The AM1 **throwaway** to be replaced here: the `sessions:spawn`/`sessions:kill` request/response channels and the single-session inline orchestrator in `src/main/index.ts`.

## Problem Statement

The AM1 spike proved one hard-coded agent can run in one embedded terminal, but threw away the single-session trigger. Developers actually run **several** coding agents at once across different worktrees and lose track of them in a sprawl of loose terminal windows. AM2 turns the spike into the real, daily-usable feature: a third **"Agents"** direction where any number of agents run as worktree-rooted, attributed sessions in a master-detail rail + terminal, surviving direction switches and app restarts.

## Goals

- [ ] A third **Agents** direction (Tree / Board / Agents) with a 344px session **rail** + flex **terminal detail**, persisted like the existing direction choice.
- [ ] A `SessionManager` (replacing AM1's inline orchestrator) owning **N** concurrent shell-hosted PTYs, each spawnable from any of the **5** entry points via the New Session dialog (fixed seeded agents: Claude / Copilot / Codex).
- [ ] **Attach/detach** with `SessionRingBuffer` scrollback replay — leaving Agents keeps PTYs alive; returning (or selecting a card) replays scrollback then resumes the live stream.
- [ ] Full session **lifecycle**: live status model (running / agent-exited-shell / stopped / path-missing), Stop, persistence to `AppConfig.sessions[]`, **restore-as-stopped** on launch, Respawn, Remove.
- [ ] **Derived** (never stored) attribution: attached worktree (`cwd === worktree.path`) → task tag (`taskIdFromBranch`), shown on cards and the attribution strip; reconciliation flags `path-missing`.

## Out of Scope

Explicitly excluded. Most are deferred to **AM3** (Agent Config & Integration).

| Feature | Reason |
| ------- | ------ |
| Configurable/editable agent registry + **Settings dialog** | AM3. AM2 uses a fixed seeded agent list. |
| **Ad-hoc command** agent option in the dialog | AM3. AM2 offers only the seeded Claude/Copilot/Codex. |
| **Default-shell** setting (pwsh \| cmd) | AM3. AM2 hard-codes `pwsh` (AM1's choice). |
| **Agent-exited · shell** (amber) sub-status + agent-exit detection | AM3. The PTY is the hosting shell, so agent-exit is not directly observable (needs an output sentinel — STATE Deferred Ideas). In AM2 a session stays **running** while its shell is live (agent quit or not). |
| **Remove-worktree-vs-running** confirmation dialog (warn + kill PTYs) | AM3. AM2's session Remove is independent of worktree deletion. |
| **Rename** / **Duplicate** session | AM3. AM2 title is the fixed auto-title `<agent> · <branch-leaf>`. |
| **Soft concurrency warning** (≥ 4 running) | AM3. |
| **Full ANSI role-palette** theming + role-colored output lines | AM3. AM2 reuses AM1's bg/fg/cursor theming as-is. |
| Task→agent auto-briefing (`promptTemplate`) | v3 (PRD Out of Scope). |
| Agent-activity notifications ("claude finished") | v3 (STATE Deferred Ideas). |

---

## User Stories

### P1: Agents direction — rail + terminal master-detail ⭐ MVP

**User Story**: As a developer, I want a third "Agents" direction with a session rail beside a large terminal, so I can see all my agent sessions in one attributed place instead of scattered windows.

**Why P1**: The shell of the whole feature; nothing else renders without it. Handoff §"Changes to the Global Shell" + §"Screen: Direction C".

**Acceptance Criteria**:

1. WHEN the app loads THEN the top-bar segmented control SHALL show three segments in order **Tree / Board / Agents**, the Agents segment using the existing active/inactive styling.
2. WHEN the user selects the Agents segment THEN the content region SHALL render a **344px fixed session rail** (left) + **flex terminal detail** (right), and the choice SHALL persist as last-session UI state like the Tree/Board choice.
3. WHEN there are zero sessions THEN the rail SHALL show its header ("AGENTS" + "0 running" + "+ New session") and an empty body, and the terminal detail SHALL show an empty/placeholder state (no crash).
4. WHEN one or more sessions exist THEN the rail SHALL render one **session card** per session and the terminal detail SHALL render the **active** session (first card by default).
5. WHEN the user clicks a session card THEN that card SHALL become selected (accent border + inset bar + tint) and the terminal SHALL swap to that session's stream/scrollback.

**Independent Test**: Switch to Agents with no sessions → see empty rail + placeholder; persists across restart. (Cards appear once P1 spawn lands.)

---

### P1: Spawn N concurrent sessions via the New Session dialog ⭐ MVP

**User Story**: As a developer, I want to spawn multiple agents (each in a chosen worktree) from a New Session dialog, so I can run several coding agents in parallel.

**Why P1**: The core capability. Requires `SessionManager` over many PTYs, replacing AM1's single inline orchestrator. Handoff §"Dialog: New Session" + entry point #1.

**Acceptance Criteria**:

1. WHEN the user clicks "+ New session" in the rail header THEN the **New Session dialog** SHALL open with agent = Claude preselected and no cwd preselected.
2. WHEN the dialog is open THEN it SHALL show a 2-column **agent** grid of fixed seeded chips (**Claude / Copilot / Codex**, each with tile + name + mono command) and a scrollable 2-column **working-directory** grid of worktree chips (branch + "ws / repo").
3. WHEN no cwd is chosen THEN the **Spawn agent** button SHALL be disabled-look; WHEN a worktree is selected THEN it SHALL enable.
4. WHEN the user confirms Spawn THEN `SessionManager` SHALL start a new shell-hosted PTY (via `buildSpawnPlan` + `PtyPort`) rooted at the chosen cwd running the selected agent, add a card, select it, and stream output to the terminal — **without disturbing any already-running session**.
5. WHEN a second (third, …) session is spawned THEN each SHALL run as an independent PTY with its own stream, addressable by `id` across the AD-004 channels, and the rail "N running" count SHALL update.
6. WHEN a session is created THEN its title SHALL default to `<agent> · <branch-leaf>` and the "Will run" card SHALL preview `<shortPath> ▸ <agentCmd>`.

**Independent Test**: Spawn Claude in worktree A and Copilot in worktree B; both cards show, both terminals stream live and independently; typing in the active one reaches only its PTY.

---

### P1: Attach/detach with ring-buffer scrollback replay ⭐ MVP

**User Story**: As a developer, I want my agents to keep running when I leave the Agents view or switch cards, and to catch up on what I missed when I return, so long-running agents aren't interrupted by navigation.

**Why P1**: Defining behavior of "embedded but persistent." Requires `SessionRingBuffer`. Handoff §"Interactions & Behavior" (direction switch / card select) + AD-004 (`attach` replay / `detach`).

**Acceptance Criteria**:

1. WHEN the user leaves the Agents direction THEN the xterm view SHALL unmount BUT every PTY SHALL keep running in main.
2. WHILE a session is detached from the renderer THEN `SessionManager` SHALL keep appending its output to that session's `SessionRingBuffer` (cap ~5,000 lines / ~1 MB per session, oldest dropped).
3. WHEN the user returns to Agents OR selects a different card THEN the terminal SHALL **replay that session's ring-buffer scrollback** and THEN resume the live stream, with no duplicated or dropped bytes at the seam.
4. WHEN only one session is visible at a time THEN the other sessions' PTYs SHALL continue running and buffering in the background.
5. WHEN attach replay completes THEN keystrokes typed into the input bar SHALL reach that session's PTY (`session:input`) and resize SHALL refit (`session:resize`).

**Independent Test**: Spawn a chatty agent, switch to Tree for a while, return → terminal shows the output produced while away, then keeps streaming live; input still works.

---

### P1: Session lifecycle — status model + Stop ⭐ MVP

**User Story**: As a developer, I want each session to show an accurate live status and let me stop it, so I always know which agents are alive and can shut one down cleanly.

**Why P1**: Without a status model and Stop, sessions are unmanageable and PTYs leak. Handoff §"Session status → color mapping" + card/terminal footers. (The amber **agent exited · shell** sub-status is deferred to AM3 — see Out of Scope — because agent-exit isn't observable in a shell-hosted PTY without a sentinel.)

**Acceptance Criteria**:

1. WHEN a session's hosting shell PTY is alive THEN its status SHALL be **running** (`--green`, "running", pulsing dot) — whether or not the agent inside it has quit (AM2 does not distinguish; an agent that quits simply leaves a live shell prompt, card stays running).
2. WHEN the hosting shell exits (user typed `exit`, or the PTY ended) THEN status SHALL become **stopped** (`--text-faint`) and the card SHALL remain present for inspection (never auto-removed).
3. WHEN the user clicks **Stop** on a running session THEN `SessionManager` SHALL terminate that PTY, no orphaned process SHALL survive, and the card SHALL transition to **stopped**.
4. WHEN status is **stopped** THEN the input bar SHALL be hidden and the stopped footer SHALL show ("Shell exited — respawn…").

**Independent Test**: Spawn a session → card is green "running"; quit the agent (`/exit`) → card **stays running** with a live shell prompt; type `exit` → card goes stopped; Stop on a running one → terminates with no leftover process (verify via `Get-Process`).

---

### P1: Persistence, restore-as-stopped, Respawn, Remove ⭐ MVP

**User Story**: As a developer, I want my sessions remembered across app restarts (reloaded as stopped, one click to respawn) and removable when I'm done, so I don't lose track of what I was running and don't accumulate dead cards forever.

**Why P1**: "Daily-usable" requires surviving restart. Handoff §"State & Data Model" + §"Interactions" (restart / respawn / remove).

**Acceptance Criteria**:

1. WHEN a session is spawned, stopped, or removed THEN its metadata `{ id, agent, cwd, title, status }` SHALL persist to `AppConfig.sessions[]` via `ConfigStore` (mirroring how `pinnedTasks` persist). No PTY/daemon survives the app.
2. WHEN the app launches THEN every persisted session SHALL reload as a **stopped** card (status normalized to `stopped`), since its PTY died with the previous run.
3. WHEN the user clicks **Respawn** on a stopped session THEN `SessionManager` SHALL re-launch the same agent in the same cwd, and the card SHALL return to **running**.
4. WHEN the user clicks **Remove** on a **stopped** (or path-missing) session THEN the card SHALL be deleted from rail + config; **Remove SHALL be unavailable while running** (must Stop first → no orphaned PTYs).
5. WHEN a stopped or path-missing card is shown THEN it MAY display a **last-output preview** (up to 2 tail lines) from its ring buffer.

**Independent Test**: Spawn two sessions, restart the app → both reappear as stopped cards; Respawn one → it runs again in the same dir; Stop + Remove it → card gone and absent from config on next launch.

---

### P2: All contextual spawn entry points

**User Story**: As a developer, I want to spawn an agent directly from a worktree or task wherever I'm looking (detail pane, board card, pinned-task card, sidebar row), so I don't have to re-pick the directory by hand.

**Why P2**: High convenience, but each rides on the P1 dialog + `SessionManager`; the app is usable via "+ New session" without them. Handoff §"Entry points to spawn" #2–#5.

**Acceptance Criteria**:

1. WHEN viewing a worktree's detail pane THEN an **Agents** section (between "Open with" and Danger) SHALL show a **Spawn agent** button (pre-fills cwd = this worktree) + chips for sessions already on this worktree that deep-link into Agents with that session selected.
2. WHEN viewing a Board worktree card THEN its footer SHALL show a **Spawn agent** icon button after the launchers (pre-fills cwd = that worktree).
3. WHEN viewing a pinned-task card THEN an **Agent** button SHALL resolve worktrees: **0** → disabled-look + "Start work first — no worktree…"; **1** → dialog with that worktree preselected; **many** → dialog with the task's worktrees **highlighted** + "worktrees for #id highlighted" hint.
4. WHEN right-clicking a sidebar worktree row THEN a **"Spawn agent here"** context-menu item SHALL open the dialog with cwd pre-filled to that worktree.
5. WHEN the dialog is opened from a task source THEN the header SHALL show the second line "Start an agent for #id title".

**Independent Test**: From a worktree detail pane click Spawn agent → dialog opens with that worktree preselected; from a pinned task with no worktree, the Agent button is disabled with the reason.

---

### P2: Derived task attribution

**User Story**: As a developer, I want each session to show which branch and ADO task it belongs to, so I can tell my agents apart at a glance.

**Why P2**: Strong value, but reuses the existing derivation; sessions function without the tags. Handoff §C-a Row 2/3 + §C-b attribution strip. Preserves the project's "link is derived, not stored" principle.

**Acceptance Criteria**:

1. WHEN a session's `cwd` equals a registered worktree's path THEN the card SHALL show that worktree's **branch** (mono) and, if `taskIdFromBranch(branch)` resolves, a **task tag** (type pill + `#id` + state dot).
2. WHEN the session is the active one THEN the terminal's **attribution strip** SHALL show the type pill + `#id` + task title + state pill.
3. WHEN the cwd does **not** match any registered worktree THEN the card SHALL show italic "**detached · `<folder>`**" and the strip SHALL show "Detached session — not attached to any registered worktree".
4. WHEN the underlying task details are unavailable THEN attribution SHALL degrade gracefully (show `#id` without title/state, never blank-crash).

**Independent Test**: Spawn in a worktree whose branch carries a task id → card shows the task pill; spawn in a browsed non-worktree folder → card shows "detached".

---

### P2: Reconciliation + path-missing flag

**User Story**: As a developer, I want a session whose worktree was deleted out-of-band to be clearly flagged, so I don't try to respawn into a directory that no longer exists.

**Why P2**: Correctness/safety, but an edge of the core lifecycle. Handoff §"Interactions" (path-missing) + status mapping.

**Acceptance Criteria**:

1. WHEN sessions are loaded/refreshed THEN `SessionManager` SHALL reconcile each session's `cwd` against the filesystem.
2. WHEN a stopped session's `cwd` no longer exists THEN its status SHALL be **path missing** (`--red`), Respawn SHALL be unavailable, and only **Remove** SHALL be offered.
3. WHEN a running session's `cwd` disappears THEN the card SHALL keep showing running (the process may still be alive) but flag path-missing in attribution.
4. WHEN a path-missing card is shown THEN the attribution strip SHALL read "Worktree path missing — this session can't be respawned, only removed."

**Independent Test**: Spawn + stop a session, delete its worktree folder from disk, refresh → card flips to red "path missing" with Remove-only.

---

### P3: Detached (browse-for-folder) sessions

**User Story**: As a developer, I want to spawn an agent in an arbitrary folder that isn't a registered worktree, so I'm not limited to worktrees.

**Why P3**: Nice-to-have; the worktree-rooted path covers the daily loop. Handoff §"Dialog: New Session" (dashed "Browse for a folder…").

**Acceptance Criteria**:

1. WHEN the user clicks the dashed "Browse for a folder…" in the dialog THEN an OS folder picker SHALL open and the chosen path SHALL satisfy the cwd requirement (enabling Spawn).
2. WHEN a detached session is spawned THEN it SHALL run normally and render as a **detached** card (no task attribution).

**Independent Test**: Browse to a plain folder, spawn → session runs, card reads "detached".

---

## Edge Cases

- WHEN the same worktree already hosts a session AND another is spawned there THEN both SHALL run independently (no dedupe); the worktree detail pane SHALL list both chips.
- WHEN a persisted session's `agent` is one later removed from the seeded set (forward-compat with AM3) THEN it SHALL still reload as a stopped card and degrade gracefully on respawn (clear error, not a crash).
- WHEN the renderer attaches to a session mid-stream THEN replay SHALL be seamless (ring buffer is the single source for catch-up; no double-subscribe duplication).
- WHEN the ring buffer overflows its cap THEN the oldest lines SHALL be dropped silently (bounded memory; replay shows the tail).
- WHEN a PTY exits on its own (`session:exit`) while the session is detached THEN the status update SHALL still be applied so the card is correct on return.
- WHEN the app quits with running sessions THEN all PTYs SHALL be terminated (no orphaned processes) and metadata persisted as the last known state (normalized to stopped on next load).
- WHEN config has no `sessions` key (pre-AM2 installs) THEN it SHALL default to `[]` (back-compat, no migration error).
- WHEN spawn fails (bad cwd, agent binary missing) THEN the failure SHALL surface clearly in the terminal/toast and SHALL NOT leave a half-created card.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AGSN-01 | P1: Agents direction (rail + terminal master-detail) | Tasks | In Tasks |
| AGSN-02 | P1: Spawn N concurrent sessions via dialog | Tasks | In Tasks |
| AGSN-03 | P1: Attach/detach + ring-buffer replay | Tasks | In Tasks |
| AGSN-04 | P1: Status model + Stop | Tasks | In Tasks |
| AGSN-05 | P1: Persistence + restore-as-stopped + Respawn + Remove | Tasks | In Tasks |
| AGSN-06 | P2: All contextual spawn entry points (#2–#5) | Tasks | In Tasks |
| AGSN-07 | P2: Derived task attribution | Tasks | In Tasks |
| AGSN-08 | P2: Reconciliation + path-missing flag | Tasks | In Tasks |
| AGSN-09 | P3: Detached (browse-for-folder) sessions | Tasks | In Tasks |

**ID format:** `AGSN-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 9 total, 0 mapped to tasks (pre-Design) ⚠️

---

## Success Criteria

- [ ] The developer can run **≥ 3 agents concurrently** across different worktrees, each in its own live embedded terminal, switching between them with no cross-talk.
- [ ] Leaving and re-entering the Agents direction **never kills a PTY**; returning shows the missed output via scrollback replay.
- [ ] After an app restart, every prior session **reappears as a stopped card** and respawns in its original cwd with one click.
- [ ] **Stop** and app-quit leave **zero orphaned PTY processes**.
- [ ] A session in a worktree with an ADO task shows the **correct task tag**, derived (not stored); a deleted worktree flips the session to **path-missing / Remove-only**.
- [ ] An agent can be spawned from **all 5 entry points**, with cwd/task pre-filled per source.
