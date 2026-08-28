# Visual Studio 2026 (Admin) Shortcut Specification

**Milestone:** Post-v1 — extends `vs2022-admin-shortcut/spec.md` (VSAD-01..04), which itself extends
M1 "Launch Shortcuts" (`launch-shortcuts/spec.md`, LNCH-01..05) and M4 "Board Direction"
(`board-direction/spec.md`, BORD-01..04)
**Sources of truth:** PRD issue #1 (§Module decomposition `ShortcutLauncher`; stories 17–19 launcher
pattern); `design/handoff/README.md` §1b "Open with" + §2 board card footer; the existing
implementation (`src/main/shortcut-launcher.ts`, `src/shared/shortcuts.ts`,
`src/renderer/src/components/WorktreeDetail.tsx`, `BoardView.tsx`,
`src/renderer/src/styles/tokens.css`); measured `vswhere` output recorded in `context.md`
**Scope size:** Medium — spec + discuss context; design inline, tasks implicit in Execute

## Problem Statement

The launcher set opens Explorer, Windows Terminal, VS Code, and **Visual Studio 2022 elevated**
(VSAD) on a worktree. Visual Studio 2026 is now installed alongside 2022 on the owner's machine
(measured: `18.4.2` at `C:\Program Files\Microsoft Visual Studio\18\Professional`), and migration is
gradual — some repos and solutions have moved to 2026 while others still build only under 2022, so
**both must remain one click away at the same time**. Today the single VS card is hard-pinned to the
`[17.0,18.0)` range, so opening a worktree in 2026 means leaving the app, launching VS by hand,
clicking through UAC, and re-navigating to the folder. This feature adds a **fifth launcher —
Visual Studio 2026 (admin)** — that resolves the installed VS 2026 independently of 2022, elevates
via UAC, and opens the selected worktree folder.

## Goals

- [ ] One click opens Visual Studio **2026** elevated (UAC) in Open Folder mode on the selected worktree
- [ ] The 2022 launcher keeps working **unchanged** — the two coexist and neither shadows the other
- [ ] The two VS launchers are **visually distinguishable at a glance**, including in the icon-only board footer
- [ ] The 2026 edition is auto-discovered (Community / Professional / Enterprise) — no hard-coded install path
- [ ] The launcher is reachable from both surfaces that host launchers: the detail-pane "Open with" grid and the board card footer
- [ ] When VS 2026 isn't installed, or the user declines UAC, a clear transient toast explains it instead of a silent no-op

## Decisions (from discuss — see `context.md`)

| # | Decision | Rationale |
| - | -------- | --------- |
| C1 | VS 2026 launches **elevated**, mirroring VS 2022's path exactly | The elevated-only workflows are identical under 2026; parameterizing proven code beats a second runtime shape |
| C2 | A **new colour token** distinguishes 2026 (2022 stays `--amber`); both keep the `shield` icon | Board footer launchers are icon-only 15px buttons — two amber shields are indistinguishable there |
| C3 | Both VS cards **always render**, install-agnostic; a missing VS surfaces the existing toast | Matches LNCH-05 / VSAD-04; per-install hiding would need a new probe channel and cache story |
| C4 | The 2026 vswhere query is **GA-only** (`-latest -version "[18.0,19.0)"`, no `-prerelease`) | Mirrors 2022 verbatim; `-prerelease` risks `-latest` silently picking Insiders over stable |

Inherited and unchanged from VSAD: **D1** VS always opens the *worktree folder* (Open Folder mode),
never a `.sln`; **D2** `devenv.exe` is resolved via `vswhere.exe -property productPath`; **D3** the
launcher appears in both the detail grid and the board footer; **D4** elevation via PowerShell
`Start-Process -Verb RunAs`.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Changing any VS 2022 behaviour | Coexistence means 2022 is untouched; every existing VSAD test must pass unmodified |
| VS 2026 **Insiders** / prerelease discovery | C4 — `-prerelease` risks resolving the wrong VS on a mixed machine |
| A non-elevated VS 2026 card | C1 — the elevated case is the ask; a second unelevated card is scope creep |
| Hiding cards for VS versions that aren't installed | C3 — needs a new main→renderer install-probe channel |
| A VS 2019 launcher, or a generic "latest VS" card | The ask is 2026 coexisting with 2022 |
| Opening a specific `.sln` / solution picker | VSAD D1 — always Open Folder, project-wide |
| Configurable `devenv.exe` path / version override | D2 — vswhere auto-detect is sufficient |
| Forward-compat for VS 19.x ("2028") | Each year is an explicit pinned range; pinning is what makes coexistence deterministic |

---

## User Stories

### P1: Visual Studio 2026 (admin) launcher card ⭐ MVP

**User Story**: As a developer, I want a "Visual Studio 2026" launcher card (marked admin) in the
worktree detail pane's "Open with" grid, so that opening VS 2026 elevated on the worktree is one
click from where I already am — without losing the 2022 card.

**Acceptance Criteria**:

1. WHEN a worktree is selected THEN the "Open with" grid SHALL render **five** cards — Explorer,
   Windows Terminal, VS Code, Visual Studio 2022, Visual Studio 2026 — in that order, the 2026 card
   showing label "Visual Studio 2026", mono command `devenv.exe`, the `shield` icon, and the ADMIN
   badge, styled identically to the existing §1b cards (tile + label + command, hover lift)
2. WHEN the 2026 card renders THEN its tile SHALL use a **new colour token distinct from
   `--amber`** (2022), and its ADMIN badge SHALL take the same colour as its own tile, so each card
   reads as one unit rather than a mismatched tile-and-badge pair
3. WHEN the grid wraps THEN the 3-column layout SHALL remain correct with 5 cards (a 3 + 2 layout;
   the trailing row must not stretch or misalign its cards)
4. WHEN no worktree is selected THEN no launcher cards SHALL render (empty state unchanged)

**Independent Test**: Select a worktree; five cards render in order, both VS cards carry the shield
+ ADMIN affordance, and the two VS tiles are visibly different colours in **both** light and dark
themes; hover behaves like the others.

---

### P1: Launch Visual Studio 2026 elevated on the worktree ⭐ MVP

**User Story**: As a developer, I want clicking the VS 2026 card to open Visual Studio 2026 **as
administrator** in Open Folder mode on the selected worktree, so that elevated-only workflows work
without manual UAC juggling.

**Acceptance Criteria**:

1. WHEN the VS 2026 card is clicked THEN the system SHALL resolve `devenv.exe` via `vswhere.exe`
   with **`-latest -version "[18.0,19.0)" -property productPath`** and **no `-prerelease` flag**
   (C4), in the main process (renderer never touches `child_process`)
2. WHEN `devenv.exe` is resolved THEN the system SHALL launch it **elevated** (UAC prompt) with the
   worktree path as the Open-Folder root, via `Start-Process -Verb RunAs` — the same command shape
   `buildElevatedOpen` already produces for 2022
3. WHEN the worktree path contains spaces, non-ASCII characters, or a single quote THEN VS 2026
   SHALL still open the correct folder (quoting rules identical to 2022's, which are already tested)
4. WHEN the resolved path no longer exists on disk (stale vswhere output / partial uninstall) THEN
   the system SHALL treat it as **not found** rather than attempting the launch
5. WHEN VS 2026 launches successfully THEN the system SHALL show nothing (the VS window is its own
   feedback) — fire-and-forget; VS exiting later is not a failure

**Independent Test**: Click the card on a real worktree → UAC prompts → accepting opens **Visual
Studio 2026** (title bar shows "Administrator", Help ▸ About reports 18.x) with the worktree as the
Open-Folder root.

---

### P1: 2022 and 2026 coexist without shadowing ⭐ MVP

**User Story**: As a developer with both Visual Studio versions installed, I want each card to open
**its own** version, so that migration is gradual and neither card silently hijacks the other.

**Why P1**: This is the feature's defining constraint — a 2026 card that resolves to 2022 (or a
change that regresses 2022 to 2026) is worse than no card at all.

**Acceptance Criteria**:

1. WHEN both VS 2022 and VS 2026 are installed THEN the 2022 card SHALL resolve a `productPath`
   inside a 17.x install and the 2026 card SHALL resolve one inside an 18.x install — each derived
   from its own disjoint version range, with **no shared "latest VS" resolution**
2. WHEN the version ranges are compared THEN they SHALL be disjoint by construction
   (`[17.0,18.0)` and `[18.0,19.0)`), so no install can satisfy both
3. WHEN VS 2026 is installed but VS 2022 is **not** THEN the 2022 card SHALL report "not installed"
   and SHALL NOT fall back to launching 2026 — and symmetrically with the versions swapped
4. WHEN the resolver is invoked THEN the version range SHALL be **derived from the requested tool**
   (`vs2022` / `vs2026`), not from a mutable default or module-level state, so parallel or repeated
   launches cannot cross-contaminate
5. WHEN this feature ships THEN **every pre-existing VSAD test SHALL pass unmodified** — the 2022
   command string, its quoting, and its error messages are unchanged

**Independent Test**: Assert the resolver builds `[17.0,18.0)` arguments for `vs2022` and
`[18.0,19.0)` for `vs2026` with no shared mutable state; confirm the pre-existing
`shortcut-launcher.test.ts` cases are green with zero edits to their assertions.

---

### P1: Visual Studio 2026 button on board cards

**User Story**: As a developer using the board layout, I want a VS 2026 (admin) launcher button on
each worktree card's footer, so that the board view reaches parity with the detail pane.

**Acceptance Criteria**:

1. WHEN a board card renders THEN its footer SHALL include a VS 2026 launch button **after** the VS
   2022 button, using the new 2026 colour token and a tooltip "Visual Studio 2026 (admin)"
2. WHEN the VS 2026 board button is clicked THEN it SHALL invoke the same `shortcuts:launch` path as
   the detail-pane card (`tool: 'vs2026'`) for that card's worktree
3. WHEN the footer gains a 5th launch button THEN the footer layout (divider, spawn button, spacer,
   repo label) SHALL remain correct and SHALL NOT overflow or wrap at the card's normal width
4. WHEN the two VS buttons sit adjacent THEN they SHALL be distinguishable **by colour alone**
   (icon-only at 15px; tooltips are a hover-only fallback, not the primary affordance)

**Independent Test**: Switch to board direction; each card footer shows five launch buttons with the
two VS buttons in different colours; clicking the 2026 one elevates VS 2026 on that card's worktree.

---

### P2: VS 2026 launch failure feedback

**User Story**: As a developer, I want a clear message when VS 2026 can't launch, so that "not
installed" or "I declined UAC" is self-explanatory rather than a silent no-op.

**Acceptance Criteria**:

1. WHEN `vswhere` finds no VS 2026 install (empty `productPath`, non-zero exit, or `vswhere.exe`
   absent) THEN the system SHALL show a transient toast naming **the 2026 version specifically**,
   e.g. "Visual Studio 2026 isn't installed (or wasn't found)" — never a version-ambiguous message
2. WHEN the user **declines** the UAC prompt THEN the system SHALL surface a transient toast naming
   2026, e.g. "Visual Studio 2026 launch was cancelled", rather than crashing or silently succeeding
3. WHEN the selected worktree's path no longer exists on disk THEN the system SHALL surface the
   failure via the same toast, naming 2026 (consistent with the other launchers)
4. WHEN the launch succeeds THEN the system SHALL show no toast
5. WHEN a 2026 failure message is produced THEN it SHALL NOT alter the wording of any 2022 failure
   message (VSAD-04's three messages stay verbatim)

**Independent Test**: (a) Drive the resolver with an absent 18.x install → the toast names **2026**,
and the 2022 card still launches fine. (b) Click the card and press "No" on UAC → "cancelled" toast
naming 2026; app stays alive.

---

## Edge Cases

- WHEN `vswhere.exe` is missing from the Installer directory THEN both VS cards SHALL report
  "not found" for their own version — never throw into the renderer
- WHEN only **VS 2019** is installed THEN both cards SHALL report not-found (16.x satisfies neither
  range) — the 2019 install must never be resolved by either card
- WHEN VS 2026 is installed **only** as Insiders THEN the card SHALL report not-found (C4, accepted)
- WHEN multiple VS 2026 editions are installed THEN `-latest` SHALL pick the newest within
  `[18.0,19.0)`; the launcher does not present a chooser (out of scope)
- WHEN the 2026 card is double-clicked rapidly THEN at most the expected UAC prompts / VS windows
  appear and the app SHALL not error (no debounce required, no crash)
- WHEN the worktree path is a UNC or long path THEN it SHALL pass through unmodified (no path
  mangling), matching the existing launchers
- WHEN VS 2026's install root is a **version-numbered** folder (`\Microsoft Visual Studio\18\`, not
  `\2026\` — measured) THEN nothing SHALL depend on the folder name; `productPath` is the only
  supported source of the executable location

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| VS26-01 | P1: VS 2026 (admin) launcher card (detail pane) | Execute | Code-verified — rendering pending owner smoke + visual pass |
| VS26-02 | P1: Launch VS 2026 elevated (vswhere `[18.0,19.0)` + RunAs + Open Folder) | Execute | Verified — arg vector unit-tested **and** executed against real vswhere; elevation pending owner UAC pass |
| VS26-03 | P1: 2022 and 2026 coexist without shadowing | Execute | Verified — disjointness, per-version routing and tool→edition wiring unit-tested; confirmed on the real 2019+2022+2026 machine |
| VS26-04 | P1: VS 2026 button on board cards | Execute | Code-verified — rendering pending owner smoke + visual pass |
| VS26-05 | P2: VS 2026 launch failure feedback (not-installed / UAC-declined / vanished path) | Execute | Verified — all six messages pinned; vanished-path case executed end-to-end |

**Coverage:** 5 total — 3 verified by executed evidence (VS26-02/03/05), 2 code-verified pending the
owner-run gates (VS26-01/04). Full per-AC evidence, the 5/5 mutation-sensor result and the
outstanding gates are in `validation.md`.

---

## Testing Notes

Following VSAD's split: **pure command-building / vswhere-argument / output-parsing logic is
unit-tested**; the actual `spawn` + UAC path stays hand-verified; React rendering is verified via
the CDP smoke script plus a visual pass.

- **Unit (vitest, `src/main/shortcut-launcher.test.ts`)** — the resolver's vswhere **argument
  vector** must become inspectable so VS26-02.1 and VS26-03.1/2/4 are assertable without a real VS
  install: assert the `vs2026` arguments contain `-version` `[18.0,19.0)` and **no** `-prerelease`,
  that the `vs2022` arguments still carry `[17.0,18.0)`, and that the two ranges are disjoint.
  Assert the per-version failure messages (VS26-05.1/2/3) name the right year. `buildElevatedOpen`
  is version-agnostic and its existing three tests must pass unmodified (VS26-03.5).
- **CDP smoke (`scripts/smoke-shortcuts.mjs`)** — **this script will break as written**: it asserts
  `four launcher cards render` and indexes `document.querySelectorAll('.detail-launcher')[3]` for
  the VS card. It must be updated to five cards, keep the 2022 assertion at `[3]`, add a `[4]`
  assertion for the 2026 card (label, command, distinct tile class, ADMIN badge), and add a board
  footer assertion for `.board-launch-btn[title="Visual Studio 2026 (admin)"]` alongside the
  existing 2022 one.
- **Hand-verified (cannot run headless)** — real elevation: UAC accept opens VS 2026 with
  "Administrator" in the title and 18.x under Help ▸ About; UAC decline produces the cancelled
  toast. Cross-check that the 2022 card still opens 17.x in the same session (VS26-03.1).
- **Visual pass** — the 3 + 2 card grid and the 5-button footer in **both** themes, confirming the
  new token is separable from `--amber`, `--green`, `--blue`, `--accent`, and `--red` at 15px.

## Success Criteria

- [ ] From a fresh app start: select any real worktree, click "Visual Studio 2026" → UAC → **VS
      2026** opens elevated in Open Folder mode on that worktree
- [ ] In the **same** session, clicking "Visual Studio 2022" opens **VS 2022** — each card lands on
      its own version, neither shadows the other
- [ ] The same works from the board card footer for both VS buttons
- [ ] Declining UAC and an absent VS 2026 each produce a clear toast **naming 2026**; the app stays alive
- [ ] Every pre-existing VS 2022 test passes **unmodified**; `npm run test`, `npm run typecheck`,
      and `npm run lint` are green
- [ ] `node scripts/smoke-shortcuts.mjs` passes with its updated 5-card / 5-button assertions
- [ ] Visual pass: the two VS launchers are distinguishable by colour alone in light and dark themes
