# Agent Config & Integration (AM3) Specification

> **Milestone:** M5 — Embedded Agent Sessions (v2). **Sub-milestone:** AM3 (closes M5).
> **Sources of truth (AD-001):** PRD issue #37 (behavior/architecture) + `design/handoff/DESIGN_HANDOFF_AGENTS.md` (visual fidelity — §"Dialog: Settings", §"Dialog: Remove-worktree confirmation", §"Terminal theming", §"Interactions"; `Worktree Manager.dc.html` → **Agents**). Streaming-IPC shape fixed by **AD-004**.
> **Builds on AM2 (merged PR #41):** the real master-detail Agents feature now on `main` — `SessionManager` (`src/main/session-manager.ts`), `SessionRingBuffer`, `src/shared/agents.ts` (`SEEDED_AGENTS`), `buildSpawnPlan`/`PtyPort`, the AM2 control IPC (`sessions:list/spawn/stop/respawn/remove/attach/detach`), `AgentsView`/`SessionRail`/`SessionCard`/`NewSessionDialog`, `TerminalPane` (xterm, bg/fg/cursor theming).

## Problem Statement

AM2 shipped daily-usable agent sessions but hard-codes the parts a developer eventually needs to control: the agent list is a frozen `SEEDED_AGENTS` constant, the hosting shell is always `pwsh`, sessions can't be renamed or cloned, deleting a worktree silently ignores agents running inside it, and the embedded terminal only colors background/foreground (so agent diff/approval output renders flat). AM3 turns these fixed choices into **configurable, manageable** ones — closing M5 — without changing AM2's session lifecycle or the "link is derived, not stored" principle.

## Goals

- [ ] A **Settings dialog** (gear button, between Refresh and Theme toggle) hosting an **editable agent registry** (add / edit / delete; seeded with Claude / Copilot / Codex) and a **default-shell** segmented control (`pwsh | cmd`).
- [ ] Agent definitions move from the `SEEDED_AGENTS` constant into `AppConfig.agents[]`; `SessionManager` resolves and spawns from config, and uses the configured `defaultShell`.
- [ ] A **one-shot ad-hoc command** option in the New Session dialog — spawns a session from free-text, **never** added to the registry.
- [ ] Session **rename** (edit `title`) and **duplicate** (clone agent + cwd for a parallel run).
- [ ] A **Remove-worktree-vs-running** confirmation that lists the running sessions, terminates their PTYs, then runs the existing guarded worktree remove.
- [ ] Polish: a **soft concurrency warning** (≥ 4 running), **full ANSI role-palette** xterm theming (so agent output colorizes + recolors on theme toggle), and an **in-memory last-output preview** on stopped cards.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| **Agent-exit detection** + the amber **"agent exited · shell"** sub-status | **Deferred** (user call this slice). The PTY hosts the shell, so agent-exit isn't observable without an output sentinel or process-tree polling; both rejected for AM3. Status stays binary **running / stopped** (+ derived `path-missing`) as in AM2. The handoff's amber agent→color and status row remain rendered-but-unwired. |
| **Persisted** last-output preview (survives restart) | Preview is **in-memory only** (user call) — the ring buffer dies with the PTY, so a card stopped in a *prior* run shows no preview. No tail written to config. |
| Saving an **ad-hoc** command into the registry / "offer to save" | User call: ad-hoc is strictly one-shot; the registry is edited only in Settings. |
| Per-session **shell override** in the New Session dialog | AM3 ships a single global `defaultShell`; a session inherits it at spawn. Per-session override deferred. |
| Task→agent **auto-briefing** (`promptTemplate`) | v3 (PRD Out of Scope). |
| Agent-activity **notifications** ("claude finished") | v3 (STATE Deferred Ideas; blocked on the same agent-exit-observability gap). |

---

## User Stories

### P1: Settings dialog + editable agent registry ⭐ MVP

**User Story**: As a developer, I want to add, edit, and remove the coding agents I can spawn (not just the three seeded ones), so the app fits the agents I actually run.

**Why P1**: The backbone of AM3 — default-shell, ad-hoc, and every other config item hang off this dialog and the `AppConfig.agents[]` move. Handoff §"Dialog: Settings" (Coding agents section) + §"Changes to the Global Shell" (gear button).

**Acceptance Criteria**:

1. WHEN the app loads THEN the top-bar right cluster SHALL show a **gear (Settings)** icon button between Refresh and the Theme toggle, in the existing 34×34 icon-button styling.
2. WHEN the user opens Settings THEN a 600px modal SHALL show a **Coding agents** section listing one row per registered agent (agent tile + name + `command args` in mono + **Edit** pencil + **Delete** trash icons) and a dashed **"+ Add agent"** button.
3. WHEN the user adds or edits an agent THEN they SHALL set its **name**, **command**, and **args**, and on save the registry SHALL persist to `AppConfig.agents[]` via `ConfigStore`.
4. WHEN the user deletes an agent THEN it SHALL be removed from the registry and SHALL no longer appear as a chip in the New Session dialog; **already-running sessions launched from it SHALL be unaffected** (their PTY/spawn was already built).
5. WHEN the app first runs against a pre-AM3 config (no `agents` key) THEN the registry SHALL default to the three seeded agents (Claude / Copilot `gh copilot` / Codex `codex --full-auto`), so existing installs are not left with an empty list.
6. WHEN `SessionManager` resolves an agent to spawn/respawn THEN it SHALL read from `AppConfig.agents[]`, not the `SEEDED_AGENTS` constant.

**Independent Test**: Open Settings → see the 3 seeded agents; add a 4th ("MyAgent", `mytool --flag`) → it appears as a chip in the New Session dialog and spawns; delete it → chip gone, any running MyAgent session keeps streaming.

---

### P1: Default-shell setting ⭐ MVP

**User Story**: As a developer, I want to choose whether agents run inside PowerShell or cmd, so PATH and shim resolution match the shell I expect.

**Why P1**: Removes AM1/AM2's hard-coded `'pwsh'`; lives in the same Settings dialog as the registry and rides the same persistence path. Handoff §"Dialog: Settings" (Default shell) + §"State & Data Model" (`defaultShell`).

**Acceptance Criteria**:

1. WHEN the user opens Settings THEN a **Default shell** section SHALL show a segmented **pwsh | cmd** control with the current value selected (default **pwsh**).
2. WHEN the user switches the default shell THEN the choice SHALL persist to `AppConfig` and `SessionManager` SHALL pass it to `buildSpawnPlan` for **subsequently** spawned/respawned sessions.
3. WHEN a session is already running THEN changing the default shell SHALL NOT mutate its live PTY (the shell is fixed at spawn time).
4. WHEN config has no shell setting (pre-AM3) THEN it SHALL default to `pwsh`, preserving AM2 behavior with no migration error.

**Independent Test**: Set default shell to cmd, spawn an agent → its PTY is `cmd.exe /K`; switch back to pwsh and respawn → `pwsh.exe -NoExit`; a session running under the old setting is untouched.

---

### P1: Ad-hoc command sessions ⭐ MVP

**User Story**: As a developer, I want to spawn a one-off command as an agent session without first registering it, so I can try a tool quickly.

**Why P1**: Completes the New Session dialog's agent options (handoff lists Claude / Copilot / Codex / **Ad-hoc**) and is the lightweight escape hatch the registry intentionally doesn't cover. Handoff §"Dialog: New Session".

**Acceptance Criteria**:

1. WHEN the New Session dialog is open THEN the agent grid SHALL include an **Ad-hoc command** chip (amber tile, `>_` glyph) alongside the registered agents.
2. WHEN **Ad-hoc** is selected THEN a mono **command input** SHALL appear below the grid, and the "Will run" preview + Spawn enablement SHALL use the typed command.
3. WHEN the ad-hoc command is empty THEN **Spawn agent** SHALL stay disabled (same rule as no-cwd).
4. WHEN an ad-hoc session is spawned THEN it SHALL run as a normal session (rooted at the chosen cwd, hosted in the default shell) and SHALL **NOT** be added to `AppConfig.agents[]`.
5. WHEN an ad-hoc session is persisted/restored THEN its stored agent identity SHALL carry the raw command (so Respawn re-runs the same thing) without implying a registry entry.

**Independent Test**: Pick Ad-hoc, type `node --version`, choose a worktree, Spawn → session runs the command; reopen Settings → the registry still lists only the named agents (no `node --version` row).

---

### P2: Rename + Duplicate session

**User Story**: As a developer, I want to rename a session and duplicate it, so I can label parallel runs and fork a second agent in the same worktree without re-picking everything.

**Why P2**: Real management value, but sessions are fully usable with the AM2 auto-title. Handoff §C-b header (inline rename pencil) + action cluster (Duplicate) + §"Interactions" (Rename / Duplicate).

**Acceptance Criteria**:

1. WHEN the active session's terminal header is shown THEN an inline **rename pencil** SHALL let the user edit the card/header **title**, persisted to `AppConfig.sessions[]`.
2. WHEN a rename is submitted empty THEN the prior title SHALL be kept (no blank titles).
3. WHEN the user clicks **Duplicate** on a session THEN a **new** session SHALL be created cloning the source's agent + cwd (auto-titled like a fresh spawn), spawned as an independent running PTY — the source SHALL be undisturbed.
4. WHEN a session is duplicated THEN both SHALL run concurrently and independently (no cross-talk), consistent with the AM2 "same worktree may host multiple sessions" rule.

**Independent Test**: Rename "Claude · feature-x" to "Refactor pass" → card + header update and survive restart (as a stopped card); Duplicate it → a second running session appears in the same cwd, both stream independently.

---

### P2: Remove-worktree-vs-running confirmation

**User Story**: As a developer, I want to be warned (and have the agents terminated) when I remove a worktree that has running sessions, so I don't orphan PTYs or silently kill work.

**Why P2**: Correctness/safety at the seam between worktree deletion and sessions, but an edge of the daily loop. Handoff §"Dialog: Remove-worktree confirmation (running agents)".

**Acceptance Criteria**:

1. WHEN **Remove worktree** is invoked on a worktree that passes the existing guards (not dirty, not the primary checkout) AND has **running** sessions THEN a confirmation dialog SHALL open instead of removing immediately.
2. WHEN the confirmation is shown THEN it SHALL list each running session in that worktree (agent tile + title + "● running") and state that removing the worktree will terminate them.
3. WHEN the user confirms **Terminate & remove** THEN those sessions' PTYs SHALL be killed (no orphaned processes) and THEN the existing guarded `worktree remove` SHALL run.
4. WHEN the user cancels THEN neither the sessions nor the worktree SHALL be affected.
5. WHEN the worktree has **no** running sessions THEN removal SHALL proceed exactly as today (no new dialog).

**Independent Test**: Spawn an agent in worktree A, attempt to remove A → confirm dialog lists the session; confirm → PTY terminates (verify via `Get-Process`) and the worktree is removed; with no running session, removal is unchanged.

---

### P3: Soft concurrency warning

**User Story**: As a developer, I want a gentle warning when I have several agents running at once, so I'm aware they're each a real OS process.

**Why P3**: Pure informational polish; never blocks. Handoff §"Session rail" (Concurrency warning) + §"Interactions".

**Acceptance Criteria**:

1. WHEN the running-session count is **≥ 4** THEN the rail SHALL show an amber warning banner: "N live sessions — each is a real OS process consuming resources."
2. WHEN the count drops below 4 THEN the banner SHALL disappear.
3. WHEN the warning is shown THEN it SHALL be informational only — spawning further sessions SHALL still be allowed.

**Independent Test**: Spawn 4 sessions → banner appears with the live count; stop one → banner clears.

---

### P3: Full ANSI role-palette terminal theming

**User Story**: As a developer, I want agent output (diffs, approvals, suggested commands) rendered in color, so I can read it the way the agent intends, in both light and dark themes.

**Why P3**: AM2's bg/fg/cursor theming is readable; this is fidelity. No new color tokens — maps the xterm ANSI palette to existing tokens. Handoff §"Terminal theming (production note)" + §C-b color roles.

**Acceptance Criteria**:

1. WHEN the terminal renders THEN the xterm theme SHALL map the ANSI palette to existing tokens (additions/success → `--green`, modifications → `--amber`, deletions → `--red`, suggested command/selected → `--accent`/`--accent-text`, other → `--text-muted`, plus `--blue`) atop AM2's bg/fg/cursor.
2. WHEN the user toggles light/dark THEN the full palette SHALL be re-emitted so colored output recolors live (not just bg/fg).
3. WHEN agent output contains ANSI color codes THEN they SHALL resolve to the mapped tokens (no flat/monochrome rendering).

**Independent Test**: Run an agent that prints a colored diff → additions are green, deletions red; toggle theme → the colored lines recolor without a respawn.

---

### P3: In-memory last-output preview on stopped cards

**User Story**: As a developer, I want a stopped session's card to show its last line or two of output, so I can recall what it was doing before I respawn or remove it.

**Why P3**: Nice recall aid; AM2 cards already function with just "Shell exited — respawn". Handoff §C-a stopped card preview.

**Acceptance Criteria**:

1. WHEN a session is **stopped during the current app run** THEN `SessionManager` SHALL retain its `SessionRingBuffer` (dropping only the PTY handle) so a **last-output preview** (up to ~2 tail lines) is available.
2. WHEN a stopped (or path-missing) card is rendered AND a retained buffer exists THEN the card SHALL show up to 2 trailing lines of its last output.
3. WHEN a session was stopped in a **prior** run (restored-as-stopped, buffer gone) THEN the card SHALL show **no** preview (blank), never a stale or fabricated one.
4. WHEN a stopped session is respawned THEN a fresh buffer SHALL replace the retained one.

**Independent Test**: Spawn an agent, let it print, type `exit` → stopped card shows the last lines; restart the app → the same card reappears with no preview.

---

## Edge Cases

- WHEN the registry is edited so it has **zero** agents THEN the New Session dialog SHALL still offer **Ad-hoc** (so spawning is never fully blocked), and the empty agent grid SHALL not crash.
- WHEN a persisted session's `agent` name no longer exists in the registry (deleted after the session was created) THEN it SHALL reload as a **stopped** card and Respawn SHALL surface a clear error (not a crash) — reaffirming the AM2 forward-compat edge case.
- WHEN an agent is edited (command/args changed) while a session launched from it is **running** THEN the running PTY SHALL be unaffected; only the next spawn/respawn SHALL use the new definition.
- WHEN `defaultShell` is changed while sessions are running THEN only **new** spawns/respawns SHALL use it.
- WHEN a **duplicate** is requested on a **stopped** session THEN the clone SHALL spawn as **running** (duplicate is a parallel run, not a copy of stopped state).
- WHEN the Remove-worktree confirmation is open AND the worktree becomes **dirty** before confirming THEN the existing dirty-checkout guard SHALL still block the removal after termination (note in dialog).
- WHEN an ad-hoc command needs shell quoting (spaces/metacharacters) THEN it SHALL be carried through `buildSpawnPlan`'s existing per-shell quoting (reused unchanged) so argv is preserved.
- WHEN config has no `agents` / `defaultShell` keys (pre-AM3 install) THEN both SHALL default cleanly (`agents` ← seeded three, `defaultShell` ← `pwsh`) with no migration error.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AGCF-01 | P1: Settings dialog + editable agent registry | Tasks | In Tasks |
| AGCF-02 | P1: Default-shell setting | Tasks | In Tasks |
| AGCF-03 | P1: Ad-hoc command sessions | Tasks | In Tasks |
| AGCF-04 | P2: Rename + Duplicate session | Tasks | In Tasks |
| AGCF-05 | P2: Remove-worktree-vs-running confirmation | Tasks | In Tasks |
| AGCF-06 | P3: Soft concurrency warning | Tasks | In Tasks |
| AGCF-07 | P3: Full ANSI role-palette terminal theming | Tasks | In Tasks |
| AGCF-08 | P3: In-memory last-output preview on stopped cards | Tasks | In Tasks |

**ID format:** `AGCF-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 8 total, 0 mapped to tasks (pre-Design) ⚠️

---

## Success Criteria

- [ ] A developer can **add a new agent** in Settings and spawn it; **delete** one; the three seeded agents are present on first run of a pre-AM3 config.
- [ ] Switching **default shell** to cmd makes the next spawn a `cmd /K` PTY; pwsh makes it `pwsh -NoExit`; running sessions are untouched.
- [ ] An **ad-hoc** command spawns a working session and leaves the registry unchanged.
- [ ] A session can be **renamed** (persists across restart) and **duplicated** (second independent running PTY in the same cwd).
- [ ] Removing a worktree with running agents shows the **confirmation**, terminates those PTYs (zero orphans), then removes the worktree; the dirty/primary guards still apply.
- [ ] At **≥ 4** running sessions the rail shows the concurrency warning; agent output renders in the **role palette** and recolors on theme toggle; a session stopped this run shows a **last-output preview**.
- [ ] `SessionManager` reads agents and shell from `AppConfig` (the `SEEDED_AGENTS` constant is now only the default seed); AM2's lifecycle, attribution, and "link is derived" behavior are unchanged.
