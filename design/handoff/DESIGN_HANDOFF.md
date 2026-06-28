# Handoff: ADO Task & Worktree Manager (Skinny MVP)

## Overview
A Windows desktop dashboard (Electron + React per the PRD) that bridges Azure DevOps work items to git worktrees. It indexes registered workspaces, lists every git worktree under their repos in a sidebar tree, shows a manually-curated list of pinned ADO tasks, and lets the user start task-linked worktrees and launch external tools (File Explorer, Windows Terminal, VS Code) rooted at any worktree's path. The task↔worktree link is encoded entirely in the branch name (the first standalone multi-digit number → task ID).

This handoff covers the **main 3-pane application view**, presented in two interchangeable layout directions:
- **Tree** — sidebar tree · worktree detail · pinned-tasks pane (the primary/default direction)
- **Board** — a task-centric canvas where pinned-task chips highlight their linked worktree cards

Plus the **Start-work dialog** and a **light/dark theme**.

> **Issue #37 — Embedded agent sessions** adds a **third "Agents" direction** (a session-card rail + embedded terminal), spawn entry points across the app, a New Session dialog, agent-definition Settings, and a remove-worktree-with-running-agents confirmation. Those surfaces are documented separately in **`DESIGN_HANDOFF_AGENTS.md`** — read it alongside this file.

## About the Design Files
The file in this bundle (`Worktree Manager.dc.html`) is a **design reference created in HTML** — a streaming prototype demonstrating the intended look, layout, and behavior. **It is not production code to copy directly.** It is authored as a "Design Component" (a custom HTML format with an inline template + a logic class); do not ship it.

The task is to **recreate this design in the target codebase's environment**. Per the PRD that means **Electron with a React renderer, TypeScript end-to-end**, with all filesystem / `git` / `az` / child-process work in the main process and the renderer talking to it over a plain request/response IPC layer. Use the codebase's established component patterns and styling approach. Treat the HTML/CSS values below as the source of truth for visual fidelity; treat the PRD as the source of truth for behavior and architecture.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, and interactions are specified. Recreate the UI to match, using the codebase's existing UI primitives where they exist. All exact values are in **Design Tokens** below.

---

## Global Layout & Shell

- **Window**: full-viewport app, `100vh`. The prototype renders at a fixed **1320px design width** and scales to fit smaller viewports — in a real Electron window this scaling is unnecessary; build a fluid 1320px-comfortable layout that simply uses the real window size (min usable width ~1100px).
- **Vertical structure**: fixed **54px top bar** (`flex: 0 0 auto`) above a `flex: 1` content region (`min-height: 0` so inner panes scroll independently).
- **Font smoothing**: `-webkit-font-smoothing: antialiased`.
- **Theme**: all colors are CSS custom properties set on the root element; toggling theme swaps the variable set (see Design Tokens). Pills/tints use `color-mix(in oklab, var(--token) N%, transparent)` so they recolor automatically with the theme.

### Top bar (persistent across both directions)
Height 54px, `background: var(--panel)`, bottom border `1px solid var(--border)`, horizontal padding 16px, items in a flex row with 16px gap.
- **Brand** (left): 30×30 rounded-9px square filled `var(--accent)` with a white git-branch glyph and a soft accent shadow (`0 2px 8px color-mix(in oklab, var(--accent) 45%, transparent)`), followed by two stacked labels — "Worktree" (800 weight, 15.5px, letter-spacing −0.015em) and "tasks & worktrees" (10.5px, `var(--text-faint)`).
- **Segmented control** (Tree / Board — and **Agents**, per issue #37): track `background: var(--panel-2)`, `1px solid var(--border)`, radius 9px, 3px padding. Each segment: 13px / 600, padding 6px 15px, radius 7px, icon + label. **Active segment**: `background: var(--accent)`, white text. Inactive: transparent, `var(--text-muted)`.
- **Spacer** (`flex: 1`).
- **Sync status**: 7px green dot (with `0 0 0 3px` green-tint ring) + "az · acme · synced 2m ago" (12px, `var(--text-faint)`).
- **Refresh** + **Settings gear** (issue #37) + **Theme toggle**: 34×34 icon buttons, `1px solid var(--border)`, transparent bg, radius 9px, `var(--text-muted)` icon; hover → `background: var(--panel-2)`, `color: var(--text)`. Theme toggle shows a moon icon in dark mode, sun icon in light mode. The gear opens the Settings dialog (see the agents addendum).

---

## Screens / Views

### 1. Direction A — "Tree" (default, 3-pane)

Three columns filling the content region: **Sidebar (286px)** · **Detail (flex: 1)** · **Tasks (322px)**.

#### 1a. Sidebar tree — left, 286px fixed
- `background: var(--panel)`, right border `1px solid var(--border)`, column flex.
- **Header** (46px): uppercase label "WORKSPACES" (11px / 700, letter-spacing 0.07em, `var(--text-faint)`) + a 26×26 "+" add button (bordered, hover tint).
- **Scroll body** (`overflow-y: auto`, padding 8px). Nested tree:
  - **Workspace row**: chevron-down icon (`var(--text-faint)`), folder icon (`var(--accent)`), name (13.5px / 700, `white-space: nowrap`). Example workspaces: `acme-platform`, `tools`.
  - **Repo row** (indented 10px): git-branch icon, repo name in **mono** (12.5px / 600, `var(--text-muted)`), and a pill count badge (10.5px, `var(--panel-2)` bg, radius 20px). Example repos: `api`, `web`, `worktree-manager`.
  - **Worktree rows** (indented under a 1px left border): each is a full-width button, radius 9px, padding 8px 10px.
    - **Selected state**: `background: color-mix(in oklab, var(--accent) 14%, transparent)` + `box-shadow: inset 2px 0 0 var(--accent)` (left accent bar).
    - **Line 1**: small fork glyph + branch name in **mono** (12px / 500, ellipsized) + an amber 6px dirty dot if the worktree has uncommitted changes.
    - **Line 2 (task tag, when the branch resolves to a task)**: a **type pill** (10.5px, see pill spec) + `#<id>` (mono, 11px / 600, muted) + task title (11.5px, muted, ellipsized, `flex: 1`) + a **state dot** (7px, colored by state).
    - **Untagged worktrees**: line 2 shows italic `var(--text-faint)` text — "primary checkout — no task" (for the repo's default checkout) or "no task ID in branch".

#### 1b. Worktree detail — center, flex: 1
- `background: var(--bg)`, scrollable inner column (padding 28px 34px 48px, max content width 720px). Entrance animation `fadeIn 0.22s ease` (opacity 0→1, translateY 5px→0).
- **Breadcrumb**: `<workspace> / <repo>` (12.5px, faint; repo in mono).
- **Title**: branch name as `<h1>` in **mono**, 21px / 600, line-height 1.32, `overflow-wrap: anywhere`.
- **Status row** (8px gap, wraps):
  - Dirty: amber pill — 7px dot + "N uncommitted change(s)", `background: color-mix(in oklab, var(--amber) 16%, transparent)`, `color: var(--amber)`, radius 20px, padding 5px 12px, 12.5px / 600.
  - Clean: same shape in green — "Working tree clean".
  - Default checkout: neutral "primary" pill (`var(--panel-2)` bg, `1px solid var(--border)`).
- **Linked task** section (uppercase 11px label "LINKED TASK"):
  - If linked: an `<a>` card (opens ADO in new tab), `1px solid var(--border)`, `var(--panel)` bg, radius 14px, padding 18px 20px; hover → `border-color: var(--accent)`. Header row: **type pill** (with leading dot) + **state pill** + spacer + "Open in Azure DevOps" with an external-link icon (12px, faint). Body: `#<id>` (mono, 15px / 600, `var(--accent-text)`) + title (17px / 600).
  - URL pattern: `https://dev.azure.com/<org>/<project>/_workitems/edit/<id>`.
  - If unlinked: a dashed-border note — "No task ID found in this branch name — this worktree is untagged."
- **Location** section: a row with `1px solid var(--border)` / `var(--panel)`, radius 11px — the absolute path in **mono** (12.5px, muted, ellipsized) + a 30×30 copy button.
- **Open with** section: a 3-column grid (12px gap) of launcher cards (`1px solid var(--border)`, `var(--panel)`, radius 14px, padding 15px); hover → `border-color: var(--accent)` + `translateY(-2px)`. Each card: a 36px tinted icon tile + label + mono command:
  - **File Explorer** — `var(--blue)` tile — `explorer.exe`
  - **Windows Terminal** — `var(--green)` tile — `wt.exe`
  - **VS Code** — `var(--accent)` tile — `code`
- **Danger** section (top border, padding-top 22px): **Remove worktree** button (left trash icon).
  - Enabled (clean, non-default): `1px solid color-mix(in oklab, var(--red) 50%, transparent)`, `color: var(--red)`, transparent bg, radius 10px, padding 9px 16px.
  - Disabled-look (dirty or default checkout): `1px solid var(--border)`, `var(--text-faint)`, `opacity: 0.7`, plus an inline note: "N uncommitted changes — commit or stash before removing." or "This is the repo's primary checkout — it can't be removed here."

#### 1c. Pinned tasks — right, 322px fixed
- `background: var(--panel)`, left border, column flex.
- **Header** (46px): "PINNED TASKS" uppercase label + "N items" count (11px, faint).
- **Add row**: text input (placeholder "Paste ID or ADO URL…", `var(--bg)` bg, `1px solid var(--border)`, radius 9px, focus → `border-color: var(--accent)`) + a "Pin" button (accent bg, white, "+" icon).
- **Task list** (scroll, 10px gap). Each card: `1px solid var(--border)`, `var(--bg)` bg, radius 13px, padding 13px 14px.
  - Header row: **type pill** (with leading dot) + **state pill** + spacer + `#<id>` (mono, 11.5px / 600, faint).
  - Title (14px / 600, line-height 1.35).
  - Footer row: left — either "● N worktree(s)" (accent dot, muted) or italic "No worktree yet"; right — a **Start-work button**. If the task has no worktree: primary style (accent bg, white, label "Start work"). If it already has one: ghost style (bordered, muted, label "New branch").

### 2. Direction B — "Board" (task-centric canvas)

Fills the content region as a single column.
- **Pinned-task strip** (top, `flex: 0 0 auto`, `var(--panel)` bg, bottom border, padding 13px 22px, horizontal scroll, 11px gap): a "PINNED" label + a **task chip** per task + a dashed "Pin task" button.
  - **Chip**: `1px solid var(--border)`, `var(--panel-2)` bg, radius 11px, padding 7px 12px — an 8px **state dot** + `#<id>` (mono) + title (12.5px / 600, ellipsized, max 190px) + a small count badge (worktree count). **Active/selected chip**: `border-color: var(--accent)` + `background: color-mix(in oklab, var(--accent) 14%, transparent)`.
- **Canvas** (scroll, padding 24px 26px 48px):
  - When a chip is active, a banner appears: "Showing worktrees for #<id>" (accent-tinted pill with `1px solid color-mix(in oklab, var(--accent) 40%, transparent)`) + an ✕ clear button.
  - Content is grouped by **workspace** (folder icon + name 16px / 800 + mono path, faint) → **repo** (git-branch icon + mono repo name) → a responsive **card grid** (`grid-template-columns: repeat(auto-fill, minmax(264px, 1fr))`, 14px gap).
  - **Worktree card**: `1px solid var(--border)`, `var(--panel)` bg, radius 14px, padding 14px 15px, column flex, 11px gap, transition on opacity/shadow/border/transform.
    - **Highlighted** (matches the active chip's task): `border-color: var(--accent)` + `box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 20%, transparent)` + `translateY(-1px)`.
    - **Dimmed** (a chip is active but this card doesn't match): `opacity: 0.34`.
    - Header: fork glyph + branch (mono, ellipsized) + amber dirty dot.
    - Task block (`var(--panel-2)` bg, radius 10px, padding 10px 11px): type pill + `#<id>` (mono) + spacer + state (dot + label, colored) on the first line; task title (13px / 600) below. Untagged cards show an italic muted note here instead.
    - Footer: three 32×32 launcher icon buttons (Explorer = blue, Terminal = green, VS Code = accent; hover tints with the matching color) + spacer + the repo name (mono, faint).

### 3. Start-work dialog (modal)

Triggered by a task's "Start work" / "New branch" button.
- **Backdrop**: `position: fixed; inset: 0`, `background: rgba(15,11,8,0.55)`, `backdrop-filter: blur(2px)`, centers the panel; click backdrop to dismiss.
- **Panel**: 560px max-width, `var(--panel)`, `1px solid var(--border)`, radius 18px, `box-shadow: 0 24px 70px var(--shadow)`, entrance `popIn 0.2s ease` (opacity + translateY 14px + scale 0.985→1).
  - **Header** (bottom border): "START WORK" uppercase label; `#<id>` (mono, accent-text) + task title (17px / 700).
  - **Body** (padding 22px 24px, 20px gap column):
    - **Repository** picker — a 2-column grid of selectable chips (repo name in mono + workspace name, faint). Selected chip: `border-color: var(--accent)` + accent tint.
    - **Base branch** input + **New branch** input (both mono, 13px; New branch is pre-filled from the template, see below; editing it live updates the path preview). The "New branch" label notes "· from template".
    - **Path preview** card (`var(--bg)` bg, bordered, radius 11px): uppercase "WORKTREE WILL BE CREATED AT" + the computed sibling path in mono.
  - **Footer** (top border, right-aligned): "Cancel" (ghost) + "Create worktree" (accent, white, "+" icon).

---

## Interactions & Behavior

- **Theme toggle**: swaps the CSS-variable set on the root; everything (including `color-mix` tints) recolors. Persist the user's choice (PRD: last-session UI state in global config).
- **Direction switch (Tree/Board)**: toggles the main content region; top bar persists. Persist the choice.
- **Worktree selection** (Tree): clicking a sidebar row sets it active (accent left-bar + tint) and renders it in the detail pane.
- **Task-chip highlight** (Board): clicking a chip toggles a `highlightTaskId`; matching worktree cards get the accent ring + lift, all others drop to `opacity: 0.34`, and the "Showing worktrees for #id" banner appears. Clicking the chip again (or the banner ✕) clears it.
- **Start-work flow**: open dialog → pick repo → edit base/branch → "Create worktree". Branch defaults to the template; the **worktree path preview updates live** as the branch is typed, applying the sanitization rule.
- **Shortcut buttons** (Explorer / Terminal / VS Code) and **Pin** / **Create** / **Remove**: in the prototype these surface a transient toast (bottom-center, ~2.2s); in the real app they invoke the corresponding main-process operations.
- **Remove worktree guard**: refused when the worktree is dirty (uncommitted changes) or is the repo's primary checkout; the button takes a disabled appearance and an inline reason is shown.
- **Transitions**: `fadeIn 0.22s` (detail pane), `popIn 0.2s` (dialog), `toastIn 0.22s` (toast); hover transitions ~0.12s.

### Branch template & sanitization (from PRD — implement exactly)
- **Branch template** (default, editable in global/per-workspace config): `{type}/{id}-{slug}` — e.g. `feature/4821-add-oauth-refresh-token-rotation`.
  - `{type}`: work-item-type → branch-type mapping. **Bug → `bugfix`; everything else → `feature`** (the prototype also shows `chore` for hand-typed branches).
  - `{id}`: the work item ID.
  - `{slug}`: title lowercased, non-alphanumeric runs → `-`, trimmed of leading/trailing `-`.
- **Worktree placement**: flat sibling of the source repo — `<workspace>/<repo>-<sanitized-branch>`.
- **Branch sanitization** (for the on-disk folder name): replace `/` and `\` and any char outside `[A-Za-z0-9._-]` with `-`, collapse consecutive `-`, trim leading/trailing `-`. Example: `spike/My Cool Idea!!` → folder suffix `spike-My-Cool-Idea`.
- **Task-ID extraction** (resolving which task a worktree belongs to): take the **first standalone multi-digit number** in the branch name; match against pinned tasks; unmatched branches are simply untagged.

## State Management
Renderer-side view state (the prototype's state shape):
- `theme`: `'dark' | 'light'`
- `dir`: `'A' | 'B'` (Tree / Board)
- `selectedId`: active worktree id (Tree detail)
- `highlightTaskId`: active task id for Board highlighting (nullable)
- `dialogTaskId`: task being started (nullable; non-null = dialog open)
- `dialogBranch`, `baseBranch`, `dialogRepo`: dialog form fields
- `toast`: transient message (nullable)

Data the renderer consumes (owned by main-process modules per the PRD — `WorkspaceRegistry`, `RepoScanner`, `WorktreeManager`, `AdoGateway`, `TaskBoard`):
- **Workspace**: `{ id, name, path, repos[] }`
- **Repo**: `{ name, path, worktrees[] }` (discovered via `git worktree list`, not persisted)
- **Worktree**: `{ id, branch, path, isDefault, dirty, changes, taskId? }` (taskId derived from branch)
- **PinnedTask**: persisted `{ id, org, project, url }`; live-fetched/cached `{ title, type, state }` (re-fetched on app focus + manual refresh)
- **Settings**: `{ defaultOrg, defaultProject, branchTemplate }` (branchTemplate per-workspace overridable)

ADO auth: shell out to `az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798`; on failure show a "run `az login`" prompt in the tasks pane (this state is **not** in the prototype — design it consistent with the tasks pane styling).

## Design Tokens

### Colors — Dark theme
| Token | Value |
|---|---|
| `--bg` | `#1a1815` |
| `--panel` | `#221f1b` |
| `--panel-2` | `#2a2621` |
| `--border` | `#36312a` |
| `--border-strong` | `#48413a` |
| `--text` | `#efe9e0` |
| `--text-muted` | `#a59c8e` |
| `--text-faint` | `#6f685c` |
| `--accent` | `#a78bfa` |
| `--accent-text` | `#c4b0ff` |
| `--green` | `#5cbd86` |
| `--amber` | `#dca35e` |
| `--red` | `#e08068` |
| `--blue` | `#71a8e6` |
| `--shadow` | `rgba(0,0,0,0.45)` |

### Colors — Light theme
| Token | Value |
|---|---|
| `--bg` | `#f6f2eb` |
| `--panel` | `#ffffff` |
| `--panel-2` | `#faf6ef` |
| `--border` | `#e9e1d4` |
| `--border-strong` | `#d7ccbb` |
| `--text` | `#2c2823` |
| `--text-muted` | `#897f72` |
| `--text-faint` | `#b3aa9a` |
| `--accent` | `#7c54e0` |
| `--accent-text` | `#6a40d4` |
| `--green` | `#3f9d6b` |
| `--amber` | `#bd823c` |
| `--red` | `#cf6149` |
| `--blue` | `#3b7fc4` |
| `--shadow` | `rgba(70,52,28,0.13)` |

### Semantic color usage
- **Accent (violet)**: selection, active segment, primary buttons, task type=Feature, links, highlight ring.
- **Type pills**: Bug → `--red`, Feature → `--accent`, Chore → `--amber`, fallback → `--text-muted`.
- **State pills/dots**: Active → `--green`, New → `--blue`, In Progress → `--amber`, Resolved → `--accent`, Closed → `--text-faint`.
- **Launcher tiles**: Explorer → `--blue`, Terminal → `--green`, VS Code → `--accent`.
- **Pill/tint backgrounds**: `color-mix(in oklab, <color> 16%, transparent)` (selection tint uses 14%, highlight ring 20%).

### Typography
- **UI font**: `'Hanken Grotesk', system-ui, sans-serif` (weights 400/500/600/700/800).
- **Mono font**: `'JetBrains Mono', monospace` (weights 400/500/600) — used for branch names, repo names, paths, IDs, command names.
- Scale used: 10.5px (pills/captions), 11–12.5px (meta/labels), 13–14px (body), 15.5px (brand), 16px (workspace headers), 17px (task titles), 21px (detail branch h1).
- Uppercase section labels: 11px / 700, letter-spacing 0.07em, `var(--text-faint)`.

### Spacing & radii
- Pane widths: sidebar **286px**, tasks **322px**, detail **flex: 1**. Top bar **54px**, pane headers **46px**.
- Border radius: 7px (segments) · 8–9px (small buttons/inputs) · 10–11px (chips/inputs/location) · 13–14px (cards) · 18px (dialog) · 20px (pills) · 50% (dots).
- Common gaps: 6–8px (inline), 10–14px (cards/grids), 20–30px (sections).

### Shadows / animations
- Brand glow: `0 2px 8px color-mix(in oklab, var(--accent) 45%, transparent)`.
- Dialog: `0 24px 70px var(--shadow)`. Toast: `0 12px 34px var(--shadow)`.
- Keyframes: `fadeIn` (opacity 0→1, translateY 5px→0, 0.22s), `popIn` (opacity + translateY 14px + scale 0.985→1, 0.2s), `toastIn` (0.22s).

## Assets
- **Fonts**: Hanken Grotesk + JetBrains Mono via Google Fonts. In the real app, self-host or bundle these.
- **Icons**: simple inline stroke SVGs (1.6–2.4px stroke, `currentColor`) — git-branch, folder, chevron, plus, refresh, copy, external-link, trash, terminal (`>_`), code (`</>`), sun, moon. Replace with the codebase's existing icon set (e.g. Lucide/Phosphor); names map directly.
- No raster images or brand assets are used.

## Files
- `Worktree Manager.dc.html` — the high-fidelity design reference (single self-contained file; open in a browser to view both directions, the dialog, and the theme toggle). All exact values above were taken from this file's inline styles and logic.
