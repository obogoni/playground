# Visual Studio 2022 (Admin) Shortcut Specification

**Milestone:** Post-v1 — extends M1 "Launch Shortcuts" (`launch-shortcuts/spec.md`, LNCH-01..05) and M4 "Board Direction" (`board-direction/spec.md`, BORD-01..04)
**Sources of truth:** PRD issue #1 (§Module decomposition `ShortcutLauncher`; stories 17–19 launcher pattern); existing launcher implementation (`src/main/shortcut-launcher.ts`, `src/shared/shortcuts.ts`, `WorktreeDetail.tsx` "Open with" grid, `BoardView.tsx` card footer)
**Scope size:** Medium — spec only; design inline, tasks implicit in Execute

## Problem Statement

The launcher set opens Explorer, Windows Terminal, and VS Code on a worktree, but many of this repo's apps (MultiClubes, MultiVendas, etc.) require Visual Studio 2022 **running elevated** — IIS Express binding to privileged ports, attaching to elevated processes, COM registration. Today that means launching VS by hand and clicking through UAC from the Start menu, then re-opening the right folder. This feature adds a fourth launcher — **Visual Studio 2022 (admin)** — that resolves the installed VS 2022, elevates via UAC, and opens the selected worktree folder, closing the same "tools open on the worktree" loop for the elevated-VS case.

## Goals

- [ ] One click opens Visual Studio 2022 **elevated** (UAC prompt) in Open Folder mode on the selected worktree's path
- [ ] The VS edition is auto-discovered (Community / Professional / Enterprise) — no hard-coded install path
- [ ] The launcher is reachable from both surfaces that already host launchers: the detail pane "Open with" grid and the board card footer
- [ ] When VS 2022 isn't installed, or the user declines UAC, a clear transient toast explains it instead of a silent no-op

## Decisions (from discuss)

| # | Decision | Rationale |
| - | -------- | --------- |
| D1 | VS always opens the **worktree folder** (Open Folder mode), never a `.sln` | Consistent with the other three launchers (path-only); no `.sln` discovery/ambiguity logic; works for folder-based and multi-solution repos alike |
| D2 | `devenv.exe` is resolved via Microsoft's **`vswhere.exe`** (`-latest -version "[17.0,18.0)" -property productPath`) | Sanctioned discovery across editions/years; ships at `%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe`; zero config surface |
| D3 | Launcher appears in **both** the detail pane grid **and** the board card footer | Matches every existing launcher's reach; both surfaces already fan out over one `shortcuts:launch` channel |
| D4 | Elevation via PowerShell `Start-Process -Verb RunAs` | Triggers UAC per-launch with no persistent state, app manifest change, or stored elevation; declined UAC surfaces as a launch failure |

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Opening a specific `.sln` / solution picker | D1 — always Open Folder; solution selection deferred |
| Non-admin VS 2022 launch (a second, unelevated card) | The feature's whole point is the elevated case; the user asked for admin |
| Configurable `devenv.exe` path / VS-version override | D2 — vswhere auto-detect is sufficient; revisit only if discovery proves unreliable |
| Other VS years (2019/2022 Preview side-by-side selection) | `-latest` within `[17.0,18.0)` picks the newest VS 2022; multi-install selection is future work |
| Remembering UAC consent across launches | Windows owns UAC; out of the app's control |

---

## User Stories

### P1: Visual Studio 2022 (admin) launcher card ⭐ MVP

**User Story**: As a developer, I want a "Visual Studio 2022" launcher card (marked admin) in the worktree detail pane's "Open with" grid, so that opening VS elevated on the worktree is one click from where I already am.

**Acceptance Criteria**:

1. WHEN a worktree is selected THEN the "Open with" grid SHALL include a fourth card — label "Visual Studio 2022", mono command `devenv.exe`, an admin/elevation affordance (shield icon and/or "admin" marker) — styled identically to the existing §1b cards (tile + label + command, hover lift)
2. WHEN the card renders THEN its tile colour SHALL be a distinct token from the existing blue/green/accent tiles (e.g. an amber/purple tile) so it reads as the elevated action
3. WHEN no worktree is selected THEN no VS card SHALL render (empty state unchanged)
4. WHEN the grid wraps to a second row THEN layout SHALL remain correct (the grid already auto-wraps; a 4th card must not break alignment)

**Independent Test**: Select a worktree; the four cards render with the VS card visibly marked as the elevated one; hover behaves like the others.

---

### P1: Launch Visual Studio 2022 elevated on the worktree ⭐ MVP

**User Story**: As a developer, I want clicking the VS card to open Visual Studio 2022 **as administrator** in Open Folder mode on the selected worktree, so that elevated-only workflows (IIS Express, COM, attach-to-elevated) work without manual UAC juggling.

**Acceptance Criteria**:

1. WHEN the VS card is clicked THEN the system SHALL resolve `devenv.exe` via `vswhere.exe` (`-latest -version "[17.0,18.0)" -property productPath`) in the main process (`ShortcutLauncher.openVisualStudio(path)`; renderer never touches `child_process`)
2. WHEN `devenv.exe` is resolved THEN the system SHALL launch it **elevated** (UAC prompt) with the worktree path as the folder to open (Open Folder mode), via `Start-Process -Verb RunAs`
3. WHEN the worktree path contains spaces or non-ASCII characters THEN VS SHALL still open the correct folder (path passed through unmodified/quoted)
4. WHEN VS launches successfully THEN the system SHALL show nothing (the VS window is its own feedback) — fire-and-forget; VS exiting later is not a failure

**Independent Test**: Click the card on a real worktree → UAC prompts → accepting opens VS 2022 elevated (title bar shows "Administrator") with the worktree as the Open-Folder root.

---

### P1: Visual Studio 2022 button on board cards

**User Story**: As a developer using the board layout, I want a VS 2022 (admin) launcher button on each worktree card's footer, so that the board view reaches parity with the detail pane.

**Acceptance Criteria**:

1. WHEN a board card renders THEN its footer SHALL include a VS 2022 launch button after the VS Code button, with the distinct elevated tile colour and a tooltip "Visual Studio 2022 (admin)"
2. WHEN the VS board button is clicked THEN it SHALL invoke the same `shortcuts:launch` path as the detail-pane card (`tool: 'vs2022'`) for the card's worktree
3. WHEN the footer gains a 4th button THEN the footer layout (spacer + repo label) SHALL remain correct

**Independent Test**: Switch to board direction; each card footer shows the VS button; clicking it elevates VS on that card's worktree.

---

### P2: VS launch failure feedback

**User Story**: As a developer, I want a clear message when VS can't launch, so that "not installed" or "I declined UAC" is self-explanatory rather than a silent no-op.

**Acceptance Criteria**:

1. WHEN `vswhere` finds no VS 2022 install (empty `productPath`, or `vswhere.exe` absent) THEN the system SHALL show a transient toast naming the cause, e.g. "Visual Studio 2022 isn't installed (or wasn't found)"
2. WHEN the user **declines** the UAC prompt (elevation cancelled) THEN the system SHALL surface a transient toast, e.g. "Visual Studio 2022 launch was cancelled" rather than crashing or silently succeeding
3. WHEN the selected worktree's path no longer exists on disk THEN the system SHALL surface the failure via the same toast (consistent with the other launchers)
4. WHEN the launch succeeds THEN the system SHALL show no toast

**Independent Test**: (a) Temporarily rename/clear the VS install → "not installed" toast. (b) Click the card and press "No" on UAC → "cancelled" toast; app stays alive.

---

## Edge Cases

- WHEN `vswhere.exe` is missing from the Installer directory THEN treat as "not found" (story P2.1) — never throw into the renderer
- WHEN the card is double-clicked rapidly THEN at most the expected UAC prompts/VS windows appear and the app SHALL not error (no debounce required, no crash)
- WHEN multiple VS 2022 editions are installed THEN `-latest` SHALL pick the newest; the launcher does not present a chooser (out of scope)
- WHEN the path is a UNC or long path THEN it SHALL pass through unmodified (no path mangling), matching the existing launchers

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| VSAD-01 | P1: VS 2022 (admin) launcher card (detail pane) | Execute | Verified — CDP smoke (card + elevation marker) |
| VSAD-02 | P1: Launch VS 2022 elevated on the worktree (vswhere + RunAs + Open Folder) | Execute | Verified — command-building/parsing unit-tested; elevation confirmed by manual UAC pass |
| VSAD-03 | P1: VS 2022 button on board cards | Execute | Verified — CDP smoke (footer button per card) |
| VSAD-04 | P2: VS launch failure feedback (not-installed / UAC-declined / missing path) | Execute | Verified — toast routing in place; manual UAC pass confirmed |

**Coverage:** 4 total, 4 verified (automated rendering + helper coverage; elevation confirmed via manual UAC pass) — to be verified via CDP smoke (extend `scripts/smoke-shortcuts.mjs` pattern) for card/button rendering, plus manual elevation checks (UAC accept/decline, "Administrator" title) since spawn+elevation can't run headless.

---

## Testing Notes

- `ShortcutLauncher` is, per PRD §Testing Decisions, **hand-verified** (trivial wrapper over `child_process`). The new logic is heavier (vswhere discovery + PowerShell elevation command construction), so the **pure command-building / vswhere-output parsing** SHOULD be factored into a testable helper (e.g. `resolveDevenv` / `buildElevatedOpen`) and unit-tested; the actual `spawn`/UAC path stays hand-verified.
- React card/footer rendering follows the existing untested-component convention — verified via CDP smoke (the VS card/button appear and dispatch `tool: 'vs2022'`) and a visual pass.
- The IPC surface is unchanged in shape: `'shortcuts:launch'` simply gains `'vs2022'` in the `ShortcutTool` union — no new channel.

## Success Criteria

- [ ] From a fresh app start: select any real worktree, click "Visual Studio 2022" → UAC → VS 2022 opens **elevated** in Open Folder mode on that worktree
- [ ] The same works from a board card's VS button
- [ ] Declining UAC and an uninstalled VS each produce a clear toast; the app stays alive
- [ ] Visual pass: the four detail-pane cards and the board footer buttons read correctly, with the VS action visibly marked as elevated
