# App Skeleton & Design System Specification

**Milestone:** M1 — Walking Skeleton & Worktree Navigation
**Sources of truth:** PRD issue #1 (architecture), `design_handoff_worktree_manager/README.md` (visuals — Global Layout & Shell, Design Tokens)

## Problem Statement

Every M1–M4 feature needs a foundation that does not exist yet: an Electron + React + TypeScript app with the PRD's main/renderer split, a request/response IPC layer, persisted global config, and the handoff's design system (tokens, themes, top bar). Building it first lets every later feature plug modules into the main process and panes into the shell.

## Goals

- [ ] Runnable Electron app (`npm start`) showing the themed top bar shell over an empty content region
- [ ] Typed request/response IPC layer that later features extend by adding handlers, not plumbing
- [ ] Global config persisted to `%APPDATA%/<app>/` surviving restarts (theme + direction as first consumers)
- [ ] Both theme variable sets from the handoff implemented and toggleable

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Sidebar tree, detail pane, tasks pane content | Separate M1/M3 features |
| Board direction content | M4 — only the Tree/Board segmented control (persisted state) ships here |
| Any `git`/`az`/launcher functionality | M1 launch shortcuts / M2 / M3 features |
| Per-workspace `.app/` config | M4 |
| Auto-update, packaging/installer polish | Out of v1 per PRD; dev-run is enough for now |

---

## User Stories

### P1: Runnable app shell ⭐ MVP

**User Story**: As a developer, I want a runnable Electron desktop app with the product's window shell, so that every subsequent feature has a host to land in.

**Why P1**: Nothing else can ship without it.

**Acceptance Criteria**:

1. WHEN the app is started THEN system SHALL open a single full-viewport window with a fixed 54px top bar above a `flex: 1` content region (min usable width ~1100px, fluid)
2. WHEN the top bar renders THEN system SHALL show brand block, Tree/Board segmented control, spacer, sync-status placeholder, refresh button, and theme toggle per handoff §Top bar
3. WHEN the renderer needs main-process work THEN system SHALL use only the typed request/response IPC layer (no Node integration in renderer, contextIsolation on)

**Independent Test**: Run the app; window opens with the styled top bar and empty content region; devtools confirm no nodeIntegration.

---

### P1: Design tokens & theme toggle ⭐ MVP

**User Story**: As a developer, I want the handoff's dark and light token sets as CSS custom properties with a working toggle, so that all future UI inherits correct colors automatically.

**Why P1**: Every later pane is specified in terms of these tokens; retrofitting themes is expensive.

**Acceptance Criteria**:

1. WHEN the app renders THEN system SHALL define all tokens from handoff §Design Tokens (both themes) as CSS custom properties on the root element
2. WHEN the theme toggle is clicked THEN system SHALL swap the variable set (dark ↔ light) and the toggle icon (moon ↔ sun) without reload
3. WHEN tinted surfaces render THEN system SHALL derive them via `color-mix(in oklab, var(--token) N%, transparent)` so they recolor with the theme
4. WHEN fonts load THEN system SHALL use bundled/self-hosted Hanken Grotesk (UI) and JetBrains Mono (code), not Google Fonts at runtime

**Independent Test**: Toggle theme; entire shell recolors instantly; inspect root element for both variable sets; kill network — fonts still render.

---

### P1: Global config persistence ⭐ MVP

**User Story**: As a developer, I want my UI state (theme, Tree/Board direction) remembered across restarts, so that the app reopens the way I left it (PRD story 20, partial).

**Why P1**: Establishes the global-config module every M1–M4 feature persists into (workspaces, pinned tasks, settings).

**Acceptance Criteria**:

1. WHEN theme or direction changes THEN system SHALL persist it to a human-readable config file under the OS user data directory (`%APPDATA%/<app>/`)
2. WHEN the app starts THEN system SHALL restore persisted theme and direction; absent or unreadable config SHALL fall back to defaults (dark, Tree) without crashing
3. WHEN config is written THEN system SHALL do so only from the main process via the IPC layer

**Independent Test**: Switch to light + Board, quit, relaunch — app opens light + Board; delete config file, relaunch — defaults restored.

---

### P2: Tree/Board direction switch (shell-level)

**User Story**: As a developer, I want the segmented control to switch the content region between Tree and Board placeholders, so that the direction mechanism exists before the real panes do.

**Why P2**: The mechanism (state + persistence + active-segment styling) is needed now; the content arrives in later features.

**Acceptance Criteria**:

1. WHEN a segment is clicked THEN system SHALL mark it active (accent bg, white text) and swap the content region to that direction's placeholder
2. WHEN the direction changes THEN system SHALL persist the choice (covered by SKEL-03 plumbing)

**Independent Test**: Click Board — segment activates, content swaps; relaunch — Board still selected.

---

## Edge Cases

- WHEN the config file is corrupt/truncated THEN system SHALL log, back up the bad file aside, and start with defaults
- WHEN the window is resized below ~1100px THEN system SHALL remain usable (panes scroll; no fixed 1320px scaling — handoff explicitly drops the prototype's scale-to-fit)
- WHEN an IPC request hits an unregistered channel THEN system SHALL reject with a typed error, not hang

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SKEL-01 | P1: Runnable app shell | Done (T1, T3, T6, T7) | Verified |
| SKEL-02 | P1: Design tokens & theme toggle | Done (T2, T6, T7) | Verified |
| SKEL-03 | P1: Global config persistence | Done (T3, T4, T5, T7) | Verified |
| SKEL-04 | P2: Direction switch | Done (T6, T7) | Verified |

**Coverage:** 4 total, 4 mapped to tasks, 0 unmapped ✅ (verified via 6 ConfigStore behavior tests + CDP end-to-end smoke: defaults → patch → disk → relaunch round-trip)

---

## Success Criteria

- [ ] `npm start` (or equivalent) opens the themed shell in <1 short command from a fresh clone (after install)
- [ ] Theme + direction survive restart; corrupt config never crashes the app
- [ ] A later feature can add one IPC handler + one pane without touching skeleton plumbing
