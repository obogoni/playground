# Handoff Addendum: Embedded Agent Sessions (Issue #37)

> Companion to `DESIGN_HANDOFF.md`. This document covers **only the new surfaces** added for embedded agent sessions. Everything in the base handoff (shell, Tree, Board, Start-work dialog, theme, tokens) is unchanged unless called out here. Same rules apply: `Worktree Manager.dc.html` is a **design reference**, not production code — recreate it in the Electron + React + TypeScript codebase. Treat the HTML/CSS values below as the source of truth for visual fidelity; treat the PRD (#37) as the source of truth for behavior and architecture (node-pty PTYs in main, xterm.js in the renderer, streaming IPC).

## Overview
A new **third "Agents" direction** lets the developer spawn CLI coding agents (Claude / Copilot / Codex / ad-hoc) as **worktree-rooted shell sessions**, each rendered as a **card** in a rail next to a large **embedded terminal** (master-detail). Sessions are attributed to the worktree they run in (`cwd === worktree.path`) and, by derivation, to that worktree's ADO task (`taskIdFromBranch`). The existing zero-hosting launchers (Explorer / Terminal / VS Code / VS2022) are **unchanged**; agents are a separate, embedded, opt-in capability.

**Fidelity: hifi.** No new color tokens are introduced — the feature reuses the base palette. New: two keyframes (`pulse`, `blink`), one agent→color mapping, one status→color mapping.

---

## Changes to the Global Shell

### Top bar
- **Segmented control** gains a third segment — order is now **Tree / Board / Agents**. Same segment styling as the base spec (active = `var(--accent)` + white; inactive = transparent + `var(--text-muted)`). The **Agents** icon is a terminal-in-a-window glyph (a `>` chevron + a line inside a rounded rect).
- **Settings gear** button added to the right cluster, **between Refresh and Theme toggle**. Identical 34×34 icon-button styling (`1px solid var(--border)`, transparent bg, radius 9px, `var(--text-muted)` icon; hover → `var(--panel-2)` / `var(--text)`). Opens the **Settings dialog**.
- The Agents direction is persisted exactly like the Tree/Board choice (PRD: last-session UI state).

### New keyframes
- `pulse` — `opacity: 1 → 0.45 → 1`, `1.8s ease-in-out infinite`. Used on every **live** status dot.
- `blink` — `step-start`, `1s infinite` (0–49% opaque, 50–100% transparent). Used on the terminal **caret**.

### Agent → accent color mapping
Each agent gets a tile color reused from existing tokens (icon tile bg = `color-mix(in oklab, <color> 15%, transparent)`):

| Agent | Color token |
|---|---|
| Claude | `--accent` |
| Copilot | `--blue` |
| Codex | `--green` |
| Ad-hoc command | `--amber` |

### Session status → color mapping
| Status | Color | Label |
|---|---|---|
| running (agent live) | `--green` | `running` |
| running, agent exited → live shell | `--amber` | `agent exited · shell` |
| stopped (shell exited) | `--text-faint` | `stopped` |
| path missing (worktree gone) | `--red` | `path missing` |

Status pill = `color-mix(in oklab, <color> 15%, transparent)` bg + `<color>` text, radius 20px. Live dots add `animation: pulse …`; running rail dots also add `box-shadow: 0 0 0 3px color-mix(in oklab, <color> 22%, transparent)`.

---

## Screen: Direction C — "Agents" (master-detail)

Two columns fill the content region: **Session rail (344px fixed)** · **Terminal detail (flex: 1)**.

### C-a. Session rail — left, 344px fixed
- `background: var(--panel)`, right border `1px solid var(--border)`, column flex.
- **Header** (46px): "AGENTS" uppercase label (11px / 700, letter-spacing 0.07em, `var(--text-faint)`) + "N running" count (11px, faint). Right: **"+ New session"** button — `var(--accent)` bg, white, radius 8px, padding 6px 11px, 12.5px / 600, leading plus icon.
- **Concurrency warning** (only when **running count ≥ 4**): margin 11px 12px, `background: color-mix(in oklab, var(--amber) 12%, transparent)`, `border: 1px solid color-mix(in oklab, var(--amber) 30%, transparent)`, radius 9px, padding 8px 10px, 11.5px, `color: var(--amber)`, warning-triangle icon. Copy: "N live sessions — each is a real OS process consuming resources."
- **Scroll body** (`overflow-y: auto`, padding 11px 12px 16px, column flex, gap 9px).

#### Session card
`box-sizing: border-box`, full width, `1px solid var(--border)`, `background: var(--panel)`, radius 13px, padding 12px 13px, column flex, gap 9px. Whole card is the select target (click → sets active session in the terminal).
- **Selected**: `border-color: var(--accent)`, `background: color-mix(in oklab, var(--accent) 9%, var(--panel))`, `box-shadow: inset 2px 0 0 var(--accent)` (left accent bar).
- **Row 1**: 30×30 agent icon tile (radius 9px, tinted by agent color) + session title (13px / 700, ellipsized, `flex: 1`) + **status dot** (8px; running adds ring + `pulse`).
- **Row 2**: small fork glyph (12px, `var(--text-faint)`) + branch name in **mono** (11.5px / 500, `var(--text-muted)`, ellipsized).
- **Row 3 — task tag** (when the cwd resolves to a task): **type pill** (10px) + `#<id>` (mono, 11px / 600, muted) + spacer + **state dot** (7px).
  - **Detached** session: italic `var(--text-faint)` 11px — "detached · `<folder>`".
  - **Path missing**: `var(--red)` 11px with warning-triangle — "worktree path missing".
- **Last-output preview** (stopped + path-missing only): `background: var(--bg)`, `1px solid var(--border)`, radius 8px, padding 7px 9px; up to **2 lines** of the session's tail output in mono 10.5px, `var(--text-faint)`, ellipsized.
- **Footer**: status pill (10.5px / 700) + spacer + actions:
  - running / agent-exited-shell → **Stop** (red ghost: `1px solid color-mix(in oklab, var(--red) 42%, var(--border))`, `color: var(--red)`, radius 7px, padding 4px 10px, 11.5px / 600, filled stop-square icon).
  - stopped → **Respawn** (accent ghost, refresh icon) + **Remove** (27×27 icon button, `var(--text-faint)` → `var(--red)` + red border on hover).
  - path-missing → **Remove** only (not respawnable).

### C-b. Terminal detail — center/right, flex: 1
`background: var(--bg)`, column flex, `min-height: 0`. Renders the **active** session (the selected card; defaults to the first).

- **Header bar** (`flex: 0 0 auto`, padding 13px 18px, bottom border, `background: var(--panel)`): 34×34 agent tile + **title** (15px / 700) with an inline **rename** pencil (24×24 ghost icon button) + the **cwd** in mono (11.5px, faint, ellipsized) below; spacer; **status pill** (12px / 700 with leading dot); action cluster:
  - running → **Stop** (red outline, padding 7px 13px, 12.5px / 600).
  - stopped → **Respawn** (accent fill, white, padding 7px 14px, 12.5px / 700, refresh icon).
  - **Duplicate** (34×34 icon) + **Remove** (34×34 icon; **disabled look** — `opacity: 0.5`, `cursor: not-allowed` — while the session is running; enabled once stopped).
- **Attribution strip** (`flex: 0 0 auto`, padding 9px 18px, bottom border, `background: var(--panel-2)`):
  - attached → **type pill** (with leading dot) + `#<id>` (mono, 12px / 600, `var(--accent-text)`) + task title (12.5px, muted, ellipsized) + spacer + **state pill**.
  - detached → italic faint "Detached session — not attached to any registered worktree".
  - path missing → `var(--red)` with triangle: "Worktree path missing — this session can't be respawned, only removed."
- **Terminal surface** (`flex: 1`, scroll, padding 18px 22px 14px, `background: var(--bg)`, `fadeIn 0.2s`): the embedded terminal. In the prototype it is a styled faux-terminal; **in production this is the xterm.js mount**, themed against the token set (see Terminal theming below). Mono 12.5px, line-height 1.6. Output lines are colored by role:

  | Role | Color |
  |---|---|
  | shell prompt path (`PS …>`) | `--text-faint` |
  | typed command / `> user message` | `--text` (600) |
  | agent narration (`⏺`) / banner (`●`) | `--text` / `--text-muted` (600) |
  | file reads (`⎿`) / system | `--text-faint` |
  | additions (`+`) / success | `--green` |
  | modifications (`~`) | `--amber` |
  | deletions (`−`) | `--red` |
  | suggested command / selected option (`❯`) | `--accent-text` |
  | other option | `--text-muted` |

  - **Agent-exited note** (inline): `background: color-mix(in oklab, var(--amber) 12%, transparent)`, `1px solid color-mix(in oklab, var(--amber) 28%, transparent)`, radius 7px, mono 11.5px, `var(--amber)` — "↳ agent exited (0) — shell is still live…".
  - **Stopped note** (inline): `background: var(--panel-2)`, `1px solid var(--border)`, `var(--text-faint)`, stop-square icon — "session stopped — …".
  - **Caret**: an 8×15 `var(--accent)` block, `animation: blink 1s step-start infinite`, trailing the live prompt.
- **Input bar** (running only, `flex: 0 0 auto`, padding 11px 18px, top border, `background: var(--panel)`): `❯` prompt (`var(--accent-text)`, 600) + transparent mono input, placeholder "Type to the agent — answer prompts, approve, run commands…" + right hint "live · interactive" (10.5px, faint, mono). This is where keystrokes go to the PTY.
- **Stopped footer** (stopped only): "Shell exited — respawn to run the agent again in the same directory." + **Respawn** button (accent outline).

### Terminal theming (production note)
Map the xterm theme to the active token set so it recolors with light/dark: `background → var(--bg)`, `foreground → var(--text)`, `cursor → var(--accent)`, and the ANSI palette to `--green` / `--amber` / `--red` / `--blue` / `--accent` / `--text-muted` as above. Re-emit the theme on theme toggle. Use `@xterm/addon-fit` and refit on container resize.

---

## Entry points to spawn

All five open the **New Session dialog** unless noted; cwd/agent are pre-filled per source.

1. **"+ New session"** — rail header. No cwd preselected; agent defaults to Claude.
2. **Worktree detail pane — "Agents" section** (new, inserted **between "Open with" and the Danger row**): uppercase "AGENTS" label + a **Spawn agent** button (`var(--accent)` fill, terminal-window icon, radius 10px, padding 10px 16px, 13px / 700) + faint helper text ("Runs a CLI coding agent in an embedded terminal, rooted at this worktree."). Below, **chips for sessions already on this worktree** (24×24 agent tile + title + status dot) that deep-link into the Agents view with that session selected. Spawn pre-fills cwd = this worktree.
3. **Board worktree card — footer**: after the three launcher icons, a 1px×18px divider + a 32×32 **Spawn agent** icon button (accent-outlined terminal-window glyph). Pre-fills cwd = that worktree.
4. **Pinned task card — "Agent" button** (footer, beside Start work / New branch): accent-text, `1px solid color-mix(in oklab, var(--accent) 45%, var(--border))`, terminal icon. Worktree resolution:
   - **0 worktrees** → disabled look (`var(--text-faint)`, `opacity: 0.65`, `cursor: default`) + inline reason "Start work first — no worktree to attach an agent to" (mirrors the dirty-guard disabled pattern).
   - **1 worktree** → dialog opens with that worktree preselected.
   - **many** → dialog opens with the task's worktrees **highlighted** (chooser); a "worktrees for #id highlighted" hint shows above the directory grid.
5. **Sidebar worktree row — context menu** (PRD; not depicted in the prototype): right-click → "Spawn agent here", pre-fills cwd = that worktree. Implement consistent with #2/#3.

---

## Dialog: New Session

Same modal shell as Start-work (backdrop `rgba(15,11,8,0.55)` + blur 2px, panel `var(--panel)` / `1px solid var(--border)` / radius 18px / `0 24px 70px var(--shadow)` / `popIn 0.2s`). Width **600px**.
- **Header** (padding 22px 24px 18px, bottom border): "NEW SESSION" uppercase label. When launched from a task: a second line "Start an agent for `#<id>` `<title>`" (`#id` mono `var(--accent-text)`, title 15px / 700).
- **Body** (padding 20px 24px, column gap 20px):
  - **Agent** — 2-column grid of selectable chips (radius 11px, padding 10px 12px; selected = `border-color: var(--accent)` + `color-mix(in oklab, var(--accent) 10%, transparent)`). Each: 32×32 agent tile + name (13.5px / 700) + command in mono (11px, faint). Options: **Claude / Copilot / Codex / Ad-hoc command**. Selecting **Ad-hoc** reveals a mono command input below.
  - **Working directory** — label (+ "worktrees for #id highlighted" hint in task mode). 2-column grid (`max-height: 188px`, scroll) of worktree chips (radius 10px) showing branch (mono 12.5px / 600) + "ws / repo" (11px, faint); selected = accent, task-matching = `color-mix(in oklab, var(--accent) 50%, var(--border))` border. Below: a full-width **dashed "Browse for a folder…"** button labelled "(detached session)".
  - **"Will run"** card (`background: var(--bg)`, border, radius 11px): caption "WILL RUN" + `<shortPath>` (`var(--green)`) ▸ `<agentCmd>` (`var(--accent-text)`) in mono 12px, + note "Spawned inside a shell so PATH and `.cmd/.ps1` shims resolve. Title: `<auto-title>`". (The auto-title is `<agent> · <branch-leaf>`, editable later via rename.)
- **Footer** (padding 16px 24px, top border, right-aligned): **Cancel** (ghost) + **Spawn agent** (`var(--accent)` fill, terminal icon). Spawn is **disabled-look until a cwd is chosen** (a worktree selected or a folder browsed).

---

## Dialog: Settings

Same modal shell (600px). Header "SETTINGS".
- **Coding agents** section: heading + sub "Spawned inside the default shell, rooted at the chosen directory." A list of agent rows (`1px solid var(--border)`, `background: var(--bg)`, radius 11px, padding 11px 13px): 34×34 agent tile + name (13.5px / 700) + "`command args`" (mono 11.5px, faint) + **Edit** (pencil) and **Delete** (trash) 30×30 icon buttons. A dashed **"+ Add agent"** button closes the list. Seeded with Claude / Copilot (`gh copilot`) / Codex (`codex --full-auto`); fully editable + add-your-own.
- **Default shell** section: heading + sub "Agents run inside this shell so npm shims and PATH resolve like a normal terminal." Segmented **pwsh | cmd** (each `flex: 1`, radius 9px; selected = accent border + tint).
- **Footer**: **Done** (accent fill).
- Schema note: agent defs carry a reserved-but-unused `promptTemplate?` field (deferred task→agent auto-briefing) — **not** surfaced in this UI.

---

## Dialog: Remove-worktree confirmation (running agents)

Triggered when **Remove worktree** is invoked on a worktree that has **running** sessions (and passes the existing guards — not dirty, not the primary checkout). Backdrop **z-index 55** (above other dialogs). Panel **480px**, `popIn`.
- **Header** (padding 24px 24px 4px): 40×40 red warning tile (`background: color-mix(in oklab, var(--red) 15%, transparent)`, `var(--red)` triangle) + "Remove worktree?" (16.5px / 700) + body "**N agent(s)** is/are running in `<branch>` (mono). Removing the worktree will terminate them."
- **Session list** (padding 14px 24px): one row per running session (`1px solid var(--border)`, `background: var(--bg)`, radius 9px): 26×26 agent tile + title + "● running" (green, `pulse`).
- **Note** (11.5px, faint): "The repo's dirty-checkout guard still applies — a worktree with uncommitted changes can't be removed."
- **Footer**: **Cancel** (ghost) + **Terminate & remove** (`var(--red)` fill, trash icon). On confirm: kill those PTYs, then run the existing guarded `worktree remove`.

---

## Interactions & Behavior (deltas)

- **Direction switch to Agents**: persisted like Tree/Board. Leaving the Agents direction **unmounts the xterm view but the PTY keeps running** in main; returning **re-attaches and replays the ring-buffer scrollback** (~5,000 lines / ~1 MB per session) so the developer catches up.
- **Card select**: clicking a card sets it active in the terminal (accent border + inset bar + tint); the terminal swaps to that session's live stream/scrollback.
- **"Stopped" = the shell exited** (developer typed `exit` / PTY ended). An agent merely quitting drops back to a **live shell** prompt and the card **stays running** (amber "agent exited · shell"). A finished/crashed agent's card remains as a **stopped** card for inspection + respawn — it never disappears.
- **Remove** is the only action that clears a card, and only when **stopped** (running must be stopped first → no orphaned PTYs).
- **Respawn** re-launches the same agent in the same cwd (agents like Claude resume their own history).
- **Rename / Duplicate**: rename relabels the card (default auto-title `<agent> · <branch-leaf>`); duplicate clones agent+cwd for a parallel run.
- **Restart**: persisted sessions reload as **stopped** cards (status normalized to `stopped`) with one-click respawn. PTYs die on quit — only metadata survives (no daemon).
- **Path-missing**: a worktree deleted out-of-band flags its sessions. Running keeps showing (process may be alive); stopped becomes non-respawnable / removable only.
- **Soft concurrency warning** appears at **≥ 4 running** sessions.
- **Shortcut buttons & agent actions** surface the prototype's transient toast; in the real app they invoke the corresponding main-process operations.

---

## State & Data Model (deltas)

Renderer view state (additions to the base prototype's shape):
- `dir`: now `'A' | 'B' | 'C'` (Tree / Board / **Agents**).
- `selectedSession`: active session id (Agents terminal).
- `nsOpen` + dialog fields: `nsAgent`, `nsCwd` (worktree id or browse), `nsCommand` (ad-hoc), `nsFromTask` (nullable), `nsBrowse`.
- `settingsOpen`, `defaultShell` (`'pwsh' | 'cmd'`), `deleteConfirm` (nullable; `{ wtPath, branch, sessions[] }`).

Persisted / domain (per PRD; owned by the new main-process modules `SessionManager`, `SessionRingBuffer`, `PtyPort`):
- **Session** — the only new persisted state: `{ id, agent, cwd, title, status }` in `AppConfig.sessions[]` (mirrors how `pinnedTasks` persist via `ConfigStore`). `status` normalized to `stopped` on load.
- **Derived (not stored)**: attached worktree (`cwd === worktree.path`), task tag (`taskIdFromBranch(worktree.branch)`), `agentLive` vs shell, `pathMissing`. There is **no stored session→task link** — preserving the project's "the link is derived, not stored" principle.
- **AgentDef** — global config: `{ name, command, args, icon }` (+ reserved `promptTemplate?`), seeded Claude/Copilot/Codex.
- **Settings** — add `defaultShell`.

---

## Assets (deltas)

- **No new color tokens, no raster images.**
- **New icons** (simple inline stroke SVGs in the prototype; swap for the codebase's icon set): terminal-in-window (Agents segment + spawn actions), gear (settings), filled stop-square, pencil (rename), warning-triangle, plus the reused refresh (respawn) and copy/duplicate glyphs.
- **Agent glyphs** (one per definition, tinted by the agent's color): Claude = 4-point spark (filled), Copilot = rounded head + two dots + antenna, Codex = `</>` with a center slash, Ad-hoc = `>_`. These are placeholders — use whatever marks the codebase/icon set provides for each agent.

## Files
- `Worktree Manager.dc.html` — the updated high-fidelity reference (Agents direction, all entry points, New Session / Settings / Remove-confirm dialogs, in both themes). Open it and switch to **Agents** to view; click cards to see running / agent-exited-shell / stopped / path-missing / detached states.
