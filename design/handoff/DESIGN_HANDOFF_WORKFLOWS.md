# Handoff Addendum: Workflows (Issue #56)

> Companion to `DESIGN_HANDOFF.md` and `DESIGN_HANDOFF_AGENTS.md`. This document covers **only the new surfaces** added for user-authored Workflows. Everything in the base handoff (shell, Tree, Board, Agents, dialogs, theme, tokens) is unchanged unless called out here. Same rules apply: `Worktree Manager.dc.html` is a **design reference**, not production code — recreate it in the Electron + React + TypeScript codebase. Treat the HTML/CSS values below as the source of truth for **visual fidelity**; treat the PRD (#56) as the source of truth for **behavior and architecture** (workflow-loader/runner/run-state/ctx facade/MCP result server in the **main process**, streaming IPC mirroring `session:*`).

## Overview
A new **fourth "Workflows" direction** lets the developer trigger code-first automations that orchestrate a sequence of **deterministic** and **AI-agent** steps, with data flowing between them. The view is a **master-detail**: a left **rail** lists workflow **definitions** (from `~/.playground/workflows/`, including broken ones) and **recent runs**; the right pane is the **run detail** built around a live **step timeline**, with a **blocked → respond** panel for human-in-the-loop. A **Run-workflow dialog** is generated from each definition's `meta.inputs`.

**Fidelity: hifi.** **No new color tokens** — the feature reuses the base palette. **No new keyframes** — reuses `fadeIn`, `pulse`, `blink`, `popIn`, `toastIn`. New: one **run-status → color** mapping, one **step-kind → color** mapping, one **permission-preset → color** mapping, and a workflow-nodes glyph.

---

## Changes to the Global Shell

### Top bar
- **Segmented control** gains a **fourth** segment — order is now **Tree / Board / Agents / Workflows**. Same segment styling as the base spec (active = `var(--accent)` + white text; inactive = transparent + `var(--text-muted)`; 13px / 600, padding 6px 15px, radius 7px, icon + label).
- The **Workflows** icon is a **converging-nodes / pipeline glyph**: two source nodes on the left (`circle cx=6 cy=6` and `cx=6 cy=18`, r≈1.7) merging via two elbow paths into one node on the right (`circle cx=18 cy=12`). Stroke `currentColor`, 1.9px. (Same shape as the workflow tile glyph below, drawn at 14px.)
- The Workflows direction is **persisted** exactly like the Tree/Board/Agents choice (PRD: last-session UI state). View-state key: `dir: 'A' | 'B' | 'C' | 'D'` (Workflows = `'D'`).

---

## Mappings (new)

### Run status → color + label
Used for run-status pills, the rail run-history dots, and the timeline **node** colors.

| Status | Token | Label | Notes |
|---|---|---|---|
| running | `--blue` | `running` | dot/node **pulses** (`animation: pulse 1.8s ease-in-out infinite`); running node adds `box-shadow: 0 0 0 3px color-mix(in oklab, var(--blue) 16%, transparent)` |
| blocked | `--amber` | `blocked` | |
| done | `--green` | `done` | |
| failed | `--red` | `failed` | |
| cancelled | `--text-faint` | `cancelled` | |
| pending | `--text-faint` | `pending` | timeline node is a hollow ring (transparent fill, `--border-strong` border) |

Status **pill** = `color-mix(in oklab, <color> 15%, transparent)` bg + `<color>` text, radius 20px (same recipe as the base state pills).

### Step kind → color + tag label
Each timeline step shows a small **mono tag** before its label, tinted by kind: bg `color-mix(in oklab, <color> 13%, transparent)`, text `<color>`, radius 6px, mono 10px / 600, padding 1px 7px.

| Kind | Token | Tag |
|---|---|---|
| `ctx.sh` | `--text-muted` | `sh` |
| `ctx.git.*` | `--blue` | `git` |
| `ctx.worktree.*` | `--accent` | `worktree` |
| `ctx.ado.*` | `--green` | `ado` |
| `ctx.notify` | `--amber` | `notify` |
| `ctx.ask` | `--amber` | `ask` |
| `ctx.agent` | agent's color | `agent · <agentId>` |

(Agent color reuses the agents-addendum mapping: Claude → `--accent`, Copilot → `--blue`, Codex → `--green`, ad-hoc → `--amber`.)

### Permission preset → color + label
Shown as a small pill in an agent step's detail header.

| Preset | Token | Label |
|---|---|---|
| `read` | `--blue` | `read-only` |
| `write` | `--accent` | `write` |
| `bypass` | `--red` | `bypass` |

---

## Screen: Direction D — "Workflows" (master-detail)

Two columns fill the content region: **Workflows rail (360px fixed)** · **Run detail (flex: 1)**.

### D-a. Workflows rail — left, 360px fixed
- `background: var(--panel)`, right border `1px solid var(--border)`, column flex.
- **Header** (46px): "WORKFLOWS" uppercase label (11px / 700, letter-spacing 0.07em, `var(--text-faint)`) + "N defined" count (11px, faint, = count of **non-broken** definitions). Right cluster:
  - **Reload** — 30×30 icon button (`1px solid var(--border)`, transparent, radius 8px, refresh icon, `var(--text-muted)`; hover → `var(--panel-2)` / `var(--text)`). Rescans `~/.playground/workflows/`.
  - **"+ New"** — `var(--accent)` bg, white, radius 8px, padding 6px 11px, 12.5px / 600, leading plus icon. Scaffolds a template folder + opens it in the editor.
- **Scroll body** (`overflow-y: auto`, padding 12px, column flex, gap 9px). Two labeled sub-sections (uppercase 11px / 700 labels, `var(--text-faint)`):

#### "DEFINITIONS"
Workflow-definition card: `1px solid var(--border)`, `var(--panel)`, radius 13px, padding 13px.
- **Valid**: row 1 = 30×30 accent tile (radius 9px, `color-mix(in oklab, var(--accent) 14%, transparent)` bg) holding the **workflow-nodes glyph** (accent stroke) + a column with **name** (13.5px / 700) and **description** (11.5px, `var(--text-muted)`, line-height 1.45). Footer row (margin-top 11px): "**N input(s)**" / "no inputs" (11px, faint) + spacer + a **Run** button (accent-ghost: `1px solid color-mix(in oklab, var(--accent) 45%, var(--border))`, `color: var(--accent-text)`, radius 8px, padding 5px 13px, 12px / 700, **play-triangle** icon `M7 5l11 7-11 7z`; hover → accent tint). Click → opens the Run-workflow dialog.
- **Broken** (transpile error or missing `meta`/`run` export): card border `color-mix(in oklab, var(--red) 32%, var(--border))`, bg `color-mix(in oklab, var(--red) 5%, var(--panel))`. Row 1 = 30×30 **red** tile with warning-triangle + a column: the **folder id** in mono (12.5px / 600) with a small red "broken" pill, and the **error message** in mono (11px, `var(--text-faint)`, `word-break: break-word`). No Run button. Per PRD: one broken file must **not** hide the others.

#### "RECENT RUNS" (margin-top 14px)
Run-history row = full-width button, `1px solid var(--border)`, `var(--panel)`, radius 11px, padding 10px 12px.
- **Selected**: `border-color: var(--accent)` + `background: color-mix(in oklab, var(--accent) 9%, var(--panel))` + `box-shadow: inset 2px 0 0 var(--accent)` (left accent bar).
- Line 1: 8px **status dot** (pulses if running) + workflow name (12.5px / 600, ellipsized, `flex: 1`) + a small **status pill** (10px).
- Line 2: a mono meta line (10.5px, faint, ellipsized) — input summary + relative time, e.g. `task #4821   ·   4m ago`.
- Click → selects the run in the detail pane.

### D-b. Run detail — center/right, flex: 1
`background: var(--bg)`, column flex, `min-height: 0`. Renders the **selected** run (defaults to the most recent / first).

- **Header bar** (`flex: 0 0 auto`, padding 13px 18px, bottom border, `background: var(--panel)`): 34×34 accent workflow tile + a column with the **workflow name** (15px / 700) and a mono sub-line `RUN-ID · started <when>` (11.5px, faint); spacer; **run-status pill** (12px / 700 with a leading dot, dot pulses if running); action cluster:
  - running **or** blocked → **Cancel** (red outline: `1px solid color-mix(in oklab, var(--red) 45%, var(--border))`, `color: var(--red)`, radius 8px, padding 7px 13px, 12.5px / 600, filled stop-square icon). Per PRD, cancellation is cooperative and kills the agent subprocess.
  - done / failed / cancelled → **Re-run** (accent outline, refresh icon).
- **Inputs strip** (`flex: 0 0 auto`, padding 9px 18px, bottom border, `background: var(--panel-2)`, horizontal scroll): "INPUTS" caption (10.5px / 700 uppercase) + one **chip** per trigger input — `1px solid var(--border)`, `var(--bg)`, radius 8px, padding 4px 10px, mono 11.5px: `<key>` (faint) `=` (`--accent-text`) `<value>` (`--text`). If none: italic faint "no inputs".
- **Step timeline** (`flex: 1`, scroll, padding 22px 26px 34px, `fadeIn 0.22s`). This is the core surface — see below.
- **Empty state** (no run selected): centered `var(--text-faint)` 14px — "Select a run, or trigger a workflow from the list".

#### The step timeline
A vertical list of rows. Each row = a **gutter** (26px, fixed) holding the connector + node, and a **content** column (`flex: 1`, `padding-bottom: 16px`).

- **Connector**: a 2px `var(--border)` vertical line, `position: absolute; left: 12px`, full-height — except the **first** row starts at `top: 13px` and the **last** ends at `bottom: 13px` (so the rail caps cleanly at the end nodes).
- **Node**: 26px circle, `z-index: 1`, fill `color-mix(in oklab, <statusColor> 14%, transparent)`, border `1px solid color-mix(in oklab, <statusColor> 40%, transparent)`. Glyph by status: **done** = check (green, 2.6px stroke), **failed/cancelled** = ✕, **blocked** = bold `!` (amber), **running** = 8px filled blue dot + the node pulses + a 3px blue ring, **pending** = empty (transparent fill, `--border-strong` border).
- **Group rows** (`ctx.step(label, …)` groups, e.g. one per ticket task): same node, but the content is a **bold label** (13.5px / 700) + a small **status pill** reflecting the group's rollup status. Child steps of a group are indented (`margin-left: 24px` on the row).
- **Step rows**: content line = **kind tag** + **label** (13px / 600, ellipsized) + spacer + **duration** (mono 11px, faint, e.g. `1.4s`, `52s`, `1m 12s`). Every `ctx.*` call auto-appears here (PRD ACTX of "auto-log"); `ctx.step` only adds the grouping.
- **Step detail box** (when a step has output): `margin-top: 9px`, `1px solid var(--border)`, `var(--bg)`, radius 9px, padding 10px 12px; mono lines (11.5px, line-height 1.6) colored by leading glyph — `+` green, `~` amber, `-` / `✖` red, `⎿` / `└` faint, `⏺` / `●` / `$` / `#` text, else `--text-muted`. Used for: `ado.getTask` results (ticket + child tasks), `worktree.changedFiles` results, and a **failed `sh`** step (echoes `$ <cmd>` then captured stdout/stderr + `exit code N`).

##### Agent step (detail box variant)
An `agent` step's detail box leads with a **header row**: a 26×26 agent tile (radius 8px, tinted by agent color) + agent **name** (12.5px / 700) + the **permission pill** (read-only / write / bypass) + spacer + an **emit badge** (mono 10px pill): `emit_result · done` (green) / `emit_result · blocked` (amber) / `running…` (blue). Below: the **prompt** the author supplied, shown in italics `var(--text-muted)` (the engine-injected "always finish by calling `emit_result`" instruction is **not** shown — it is implicit). Then:
- **done** → the validated `emit_result.data` rendered as `• key  value` mono lines (this is the structured payload the next step consumes).
- **running** → a few live tail lines + a "running" label with the **blink caret** (8×13 `var(--accent)` block, `animation: blink 1s step-start infinite`).
- **blocked** → a single amber line "↳ reported a blocker — your input is needed below", with the full prompt-for-input rendered in the **respond panel** (below).

#### Blocked → respond panel
Rendered at the **end of the timeline** when the run status is `blocked` (`margin-left: 38px` so it aligns with the step content column). `1px solid color-mix(in oklab, var(--amber) 45%, transparent)`, `background: color-mix(in oklab, var(--amber) 10%, transparent)`, radius 14px, padding 16px 18px.
- Header: 34×34 amber tile (help/`?`-in-circle icon) + "**Blocked — the agent needs your input**" (14px / 700).
- The agent's **question** (`emit_result.question`) at 13px `var(--text)`, line-height 1.5.
- A faint note: "Guidance resumes the **same** agent conversation (session `<session_id>`, mono `--accent-text`) via `--resume`, keeping all of its context."
- A **guidance textarea** (full width, min-height 74px, resizable, `1px solid var(--border)`, `var(--panel)`, radius 10px, 13px; focus → accent border).
- Footer (right-aligned): **Abort run** (red ghost) + **Resume with guidance** (accent fill, arrow icon). Resume sends `claude --resume <session_id> -p "<guidance>"` in the same cwd with a fresh MCP token and re-registered `expect` (PRD).

#### Failed-run footer
When the run status is `failed`, a footer box follows the timeline (`margin-left: 38px`): `1px solid color-mix(in oklab, var(--red) 40%, transparent)`, `background: color-mix(in oklab, var(--red) 8%, transparent)`, radius 12px, padding 14px 16px. "**Run failed**" (red, ✕-in-circle) + the failing call in mono (e.g. `ctx.sh('npm run lint') exited with code 1`) + a faint note: "No engine rollback — worktrees and branches are left in place so you can inspect the half-finished state. Add a `try/finally` in the workflow to tear down on failure." (PRD: fail-fast, no rollback.)

---

## Dialog: Run workflow

Same modal shell as the other dialogs (backdrop `rgba(15,11,8,0.55)` + blur 2px; panel `var(--panel)` / `1px solid var(--border)` / radius 18px / `0 24px 70px var(--shadow)` / `popIn 0.2s`). Width **520px**. Triggered by a definition's **Run** button.
- **Header** (padding 22px 24px 18px, bottom border): "RUN WORKFLOW" uppercase label; a row with the 34×34 accent workflow tile + the workflow **name** (16px / 700); then the **description** (12.5px, `var(--text-muted)`).
- **Body** (padding 20px 24px, column gap 16px): the form is **generated from `meta.inputs`** — one field per input: a label (12px / 700 `var(--text-muted)`) with a **red `*`** when `required`, and a mono text input (`var(--bg)`, `1px solid var(--border)`, radius 10px, 13px, placeholder = the input `key`; focus → accent border). Submitted values become `ctx.input`. If `inputs` is empty: italic faint "This workflow takes no inputs — just run it."
- **Footer** (padding 16px 24px, top border, right-aligned): **Cancel** (ghost) + **Run workflow** (`var(--accent)` fill, play-triangle icon). The Run button takes a **disabled look** (`opacity: 0.65`, `cursor: not-allowed`) until **every required input is non-empty** (mirrors the New Session "pick a cwd first" disabled pattern).

---

## Interactions & Behavior (deltas)

- **Direction switch to Workflows**: persisted like the others. The runner lives in **main**; the renderer subscribes to streaming events and renders the timeline. Leaving and returning to the Workflows direction should re-render from current run state (runs are **ephemeral** in v1 — lost on app quit, worktrees persist).
- **Run a workflow**: Run on a definition → Run-workflow dialog (form from `meta.inputs`) → submit creates a run, selects it, and the timeline streams. Per PRD, runs are **serial by default** (personal-plan rate limits).
- **Auto-logged timeline**: every `ctx.*` call emits a `workflow:step` / `workflow:log` event and appears as a row with zero author effort; `ctx.step(name, fn)` only adds a labeled group.
- **Blocker / resume**: when an agent step's `emit_result` returns `status: "blocked"`, the run → `blocked`, a `workflow:blocked` event fires, and a **native OS toast** is shown (clicking it focuses Playground and opens that run). The developer responds in the panel: **Abort** ends the run; **Resume with guidance** continues the **same** agent conversation via `--resume`. The agent eventually emits `done` (or `blocked` again).
- **Cancel**: cooperative — the cancellation token is checked at every `ctx.*` call; cancel kills the agent subprocess promptly. Each agent step also has a **timeout** that fails the step.
- **Failure**: **fail-fast** (a throwing step halts the run; the author may `catch`). **No engine rollback** — created worktrees/branches stay as inspectable evidence; the failed call + captured stdout/exit code are surfaced.
- **Reload / New / launch buttons**: in the prototype these surface the standard transient toast (bottom-center, ~2.2s); in the real app **Reload** rescans `~/.playground/workflows/`, **New** scaffolds + opens the folder, and triggers invoke the corresponding main-process operations.
- **Notifications** (`ctx.notify(msg, { toast })` and the run finished/failed/blocked events): in-app log line on the timeline + optional native toast.

---

## State & Data Model (deltas)

Renderer view state (additions to the base prototype's shape):
- `dir`: now `'A' | 'B' | 'C' | 'D'` (Tree / Board / Agents / **Workflows**).
- `selectedRun`: active run id (Workflows detail).
- `wfDialogId` (nullable; non-null = Run-workflow dialog open, identifies the definition) + `wfInput` (the generated form's `{ key: value }` map).
- `blockedGuidance`: the respond-panel textarea buffer.

Domain types (per PRD `src/shared/workflows.ts`; owned by the new **main-process** modules — `workflow-loader`, `workflow-runner`, `run-state`, the `ctx` facade, `mcp-result-server`, `agent-command-builder`, `emit-result-schema`, `agent-step-runner`):
- **WorkflowMeta** — `{ name, description?, inputs: WorkflowInput[] }`; **id = folder name** under `~/.playground/workflows/<id>/`. A loaded definition is `{ meta, run } | { error }` (broken → listed with its error).
- **WorkflowInput** — `{ key, label, required? }`; drives the Run-workflow dialog form → `ctx.input`.
- **WorkflowRun** — `{ id, workflowId, status, startedAt, inputs, steps[] , session? }`. **RunStatus** = `pending | running | blocked | done | failed | cancelled`.
- **StepEvent** — the timeline rows: a step has a **kind** (`sh`/`git`/`worktree`/`ado`/`agent`/`notify`/`ask`/group), a **status**, a **label**, an optional **duration**, and optional **detail** (command + output, structured `emit_result.data`, or a blocker `question`). The task↔task link on agent steps stays **derived, never stored** (project principle).
- **AgentStepSpec** — `{ name, cwd, prompt, expect (JSON Schema), permissions: PermissionPreset, timeout? }`. **PermissionPreset** = `read | write | bypass` (`emit_result` is always allowed). The runner **scrubs `ANTHROPIC_API_KEY`** from the agent child env (load-bearing: personal subscription, not metered API) and captures `session_id` from the `--output-format json` envelope for resume.

**Storage split (PRD):** `~/.playground/workflows/` holds **user-authored** content; `%APPDATA%/playground/` continues to hold **app-managed** state (`config.json`, plus a new `workflow-runs/` directory for ephemeral run logs). No migration of existing config.

**IPC (PRD):** new request/response channels `workflows:list` / `:run` / `:cancel` / `:respond` / `:reload`; new streaming events `workflow:status` / `:step` / `:log` / `:blocked` — mirroring the existing `session:*` push/stream pattern (AD-004).

---

## Assets (deltas)

- **No new color tokens, no raster images.**
- **New icons** (simple inline stroke SVGs in the prototype; swap for the codebase's icon set): **workflow-nodes / pipeline** (Workflows segment + definition tiles + run header — two source nodes merging into one), **play-triangle** (Run / Run-workflow), **help / `?`-in-circle** (blocked panel), **✕-in-circle** (failed footer), plus reused refresh (Reload / Re-run), filled stop-square (Cancel), plus (New), warning-triangle (broken definition), and the **blink caret** for a live agent tail. Reuses the existing agent glyphs (Claude/Copilot/Codex/ad-hoc) for agent steps.

## Files
- `Worktree Manager.dc.html` — the updated high-fidelity reference. Open it and switch to **Workflows** (it opens there by default) to view: the rail (definitions incl. a broken one + recent runs), and the run detail across all states — **blocked** (default-selected, with the respond panel), **running** (live agent tail + caret), **done** (emitted findings), **failed** (captured error footer). The Run-workflow dialog opens from any definition's Run button. Works in both dark and light themes.
