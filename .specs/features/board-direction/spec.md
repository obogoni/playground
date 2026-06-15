# Board Direction Specification

**Milestone:** M4 — Board View & Configurability (first M4 feature)
**Sources of truth:** PRD issue #1 (stories 3, 5, 17–19; §Architecture — renderer owns view state), `design/handoff/README.md` (§2 Direction B "Board", §Interactions — direction switch & task-chip highlight, §State Management)
**Scope size:** Medium — spec only; design inline (renderer-only feature: one new component family consuming existing snapshots and IPC), tasks implicit in Execute

## Problem Statement

The top bar has offered a Tree/Board segmented control since M1, but the Board segment renders a placeholder. The handoff's second layout direction — a task-centric canvas where pinned-task chips highlight their linked worktree cards — is the last unshipped screen of the design. This feature replaces the placeholder with the §2 Board view, reusing the data the renderer already holds.

## Goals

- [ ] Board direction renders the §2 layout: pinned-task chip strip over a workspace→repo-grouped worktree card grid
- [ ] Clicking a chip highlights its linked worktree cards, dims the rest, and shows the "Showing worktrees for #id" banner; clicking again (or the banner ✕) clears it
- [ ] Every worktree card carries the three launcher buttons wired to the existing `shortcuts:launch` IPC
- [ ] Tasks can be pinned without leaving the Board direction
- [ ] Visual fidelity pass vs `.dc.html` Board view in both themes

## Out of Scope

| Feature                                      | Reason                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Direction persistence                        | Shipped in M1 (`ui.direction` in config, round-trip tested) — this feature only fills the placeholder |
| Worktree selection / detail pane from Board  | Prototype behavior: cards offer launchers only; detail lives in Tree direction          |
| Start-work / create / delete from Board      | Handoff §2 shows no card-level lifecycle actions; the loop's launch point stays §1c     |
| Per-workspace `.app/` config + settings UI   | Second M4 feature (Per-Workspace Config)                                                |
| Persisting `highlightTaskId`                 | Handoff §State Management: renderer-side view state; transient by design                |

---

## Decisions (gray areas resolved during Specify)

- **"Pin task" strip button reveals an inline input** — in the prototype the dashed button is a stub (toasts "Paste a work item ID or ADO URL to pin it"). In the real app it swaps to an inline input in the strip (same placeholder/styling as the §1c add row, autofocus; Enter pins via the existing `tasks:pin` IPC, Esc or blur-empty collapses, inline error keeps it open). Keeps the user in Board instead of bouncing them to Tree. ⚠️ Flagged for user review.
- **Chip degradation without live details** (auth down / unresolved item): chip renders `#id` (mono) + faint italic "details unavailable" in place of title, state dot in `--text-faint`, count badge kept (computed locally from the tree). Mirrors the tasks pane degradation. Chip stays clickable — highlight matching needs only the ID. ⚠️ Flagged for user review.
- **Card task block follows the STWK third state** — branch yields a pinned ID with details → type pill + `#id` + state dot/label + title (§2 card spec); pinned ID without details → `#id` + "details unavailable"; ID not pinned → italic `#<id> — not pinned`; no ID → italic "primary checkout — no task" / "no task ID in branch" (same texts as §1a). Approved precedent from start-work-from-task.
- **Highlight matches by extracted ID only** — a card matches the active chip when `taskIdFromBranch(branch) === chip.id`. Cards with unpinned IDs or no ID dim like any non-match. Unpinning the active chip's task clears the highlight (chip is gone; stale banners lie).
- **No new pure logic** — grouping is the tree snapshot's own shape (workspace → repo → worktrees); counts reuse `countWorktreesByTask`; tag joins reuse `taskIdFromBranch` + the tasks snapshot. New code is view-only React + CSS (`BoardView`), per the PRD's thin-renderer rule.
- **Strip with zero pins** renders the "PINNED" label + the dashed Pin button only — the empty state is the affordance.

---

## User Stories

### P1: Pinned-task chip strip (§2 strip) ⭐ MVP

**User Story**: As a developer, I want my pinned tasks rendered as a horizontal chip strip above the board, so that the working set frames the canvas (handoff §2).

**Acceptance Criteria**:

1. WHEN the Board direction is active THEN the content region SHALL render a single column: the chip strip (`--panel` bg, bottom border, horizontal scroll) above the scrollable canvas — replacing the placeholder
2. WHEN the strip renders THEN it SHALL show the uppercase "PINNED" label, one chip per pinned task in config order, and the dashed "Pin task" button
3. WHEN a chip renders for a task with live details THEN it SHALL show the 8px state dot (colored by state), `#id` (mono), title (12.5px/600, ellipsized, max 190px), and a count badge with the task's worktree count across all workspaces
4. WHEN the pin has no live details THEN the chip SHALL show `#id` + faint "details unavailable", a faint dot, and the count badge

**Independent Test**: Pin two tasks, switch to Board → strip shows both chips with correct dots/counts; revoke `az` auth and refresh → chips degrade but remain rendered.

---

### P1: Workspace-grouped worktree card grid (§2 canvas) ⭐ MVP

**User Story**: As a developer, I want every worktree shown as a card grouped by workspace and repo, so that the board is a complete map of work on disk (PRD stories 3, 5).

**Acceptance Criteria**:

1. WHEN the canvas renders THEN worktrees SHALL group by workspace (folder icon + name + mono path) → repo (git-branch icon + mono name) → responsive card grid (`repeat(auto-fill, minmax(264px, 1fr))`)
2. WHEN a card renders THEN its header SHALL show the fork glyph + branch (mono, ellipsized) + amber dirty dot when dirty; its task block (`--panel-2`, radius 10) SHALL follow the decided four-state degradation; its footer SHALL show the three 32×32 launcher buttons + the repo name (mono, faint)
3. WHEN a launcher button is clicked THEN the tool SHALL open rooted at the card's worktree path via the existing `shortcuts:launch`; failures surface the existing toast
4. WHEN a repo has a git error in the snapshot THEN the repo group SHALL render its error note instead of cards (same degradation as the sidebar)

**Independent Test**: With two workspaces registered, switch to Board → every sidebar worktree appears exactly once under the right workspace/repo; click the Terminal button on one → Windows Terminal opens at that path.

---

### P1: Chip highlight & dim (§2 interaction) ⭐ MVP

**User Story**: As a developer, I want to click a task chip and instantly see which worktrees carry it, so that the board answers "where is this task on disk?" at a glance (handoff §Interactions).

**Acceptance Criteria**:

1. WHEN a chip is clicked THEN it SHALL take the active style (accent border + 14% tint), matching cards (by extracted task ID) SHALL get the accent ring + lift, and all other cards SHALL drop to opacity 0.34
2. WHEN a chip is active THEN the canvas SHALL show the banner "Showing worktrees for #<id>" (accent-tinted pill) with an ✕ clear button
3. WHEN the active chip is clicked again, or the banner ✕ is clicked THEN the highlight SHALL clear and all cards return to full opacity
4. WHEN a different chip is clicked while one is active THEN the highlight SHALL move to the new task
5. WHEN the active task is unpinned, or the direction switches away and back THEN the highlight SHALL be cleared (transient renderer state, never persisted)

**Independent Test**: Two pinned tasks, one with a worktree — click its chip → that card rings, others dim, banner shows; click the other chip → highlight moves with zero matches (all dimmed); ✕ → everything restores.

---

### P2: Pin from the board (inline strip input)

**User Story**: As a developer, I want to pin a task without leaving the Board direction, so that the dashed "Pin task" button does what it says (handoff §2 strip; prototype stubs it).

**Acceptance Criteria**:

1. WHEN "Pin task" is clicked THEN the button SHALL be replaced by an inline input (placeholder "Paste ID or ADO URL…", autofocused, §1c add-row styling)
2. WHEN a valid ID/URL is submitted THEN the task SHALL be pinned via the existing `tasks:pin` IPC, a chip SHALL appear, and the input SHALL collapse back to the button
3. WHEN the input is invalid or pinning fails THEN the existing inline error message SHALL render in the strip and the input SHALL stay open
4. WHEN Esc is pressed, or the input loses focus while empty THEN it SHALL collapse without pinning

**Independent Test**: In Board, click Pin task → paste a work item URL → chip appears without leaving the board; repeat with garbage input → error shows, input stays.

---

## Edge Cases

- WHEN no workspaces are registered THEN the canvas SHALL show a faint empty note pointing to the Tree direction's "+" (workspace registration stays a Tree affordance in v1)
- WHEN no tasks are pinned THEN no banner/highlight is reachable; the strip SHALL render label + Pin button only
- WHEN a highlight is active and a refresh removes every matching worktree THEN all cards dim with zero matches — the banner keeps the state honest until cleared
- WHEN two pins share an ID across orgs THEN both chips render but cards match by bare ID (first-pin-wins precedent from STWK applies to which details a card shows)
- WHEN the window narrows THEN the strip SHALL scroll horizontally and the grid SHALL reflow (auto-fill) — no fixed 1320px scaling
- WHEN the theme toggles THEN all chip/card tints SHALL recolor via the existing `color-mix` token pattern (no hard-coded colors)

---

## Requirement Traceability

| Requirement ID | Story                                   | Phase | Status   |
| -------------- | --------------------------------------- | ----- | -------- |
| BORD-01        | P1: Pinned-task chip strip (§2)         | Done  | Verified |
| BORD-02        | P1: Worktree card grid (§2 canvas)      | Done  | Verified |
| BORD-03        | P1: Chip highlight & dim                | Done  | Verified |
| BORD-04        | P2: Pin from the board (inline input)   | Done  | Verified |

**Coverage:** 4 total, 4 verified ✅ — 10-check CDP smoke (`scripts/smoke-board.mjs`) vs a live ADO work item (via `SMOKE_TASK_URL`): strip render → inline pin Esc/error/happy path → grouped grid with primary-checkout degradation → task-linked card + count flip → highlight/dim/banner → ✕/toggle clears → direction round-trip transience → guarded IPC cleanup. Screenshot fidelity pass vs `.dc.html` §2 in dark, dark+highlight, and light. The existing 90 Vitest stay green (no new pure logic by design).

---

## Testing Notes (from PRD §Testing Decisions)

- No new pure logic, no new git/IPC paths — everything joins already-tested functions (`taskIdFromBranch`, `countWorktreesByTask`) to already-tested channels (`shortcuts:launch`, `tasks:pin`)
- React surfaces follow precedent: CDP smoke (`scripts/smoke-board.mjs`, modeled on `smoke-start-work.mjs`) driving chip click → highlight/dim assertions → launcher invocation → inline pin; plus screenshot fidelity pass vs `.dc.html` Board view (both themes)
- Existing Vitest suite must stay green (90 tests) — `ui.direction` round-trip is already covered in `config-store.test.ts`

## Success Criteria

- [x] Switching to Board shows every worktree from the sidebar as a card under the right workspace/repo, with correct task blocks and working launchers (smoke: launcher buttons asserted present/wired; actual launching is the already-verified M1 `shortcuts:launch` path)
- [x] Chip click → ring/dim/banner behavior matches the prototype interaction exactly; clears on re-click, ✕, unpin, and direction switch
- [x] A task can be pinned end-to-end without leaving the Board direction (smoke-verified against live ADO)
- [x] Fidelity pass vs `.dc.html` §2 in dark and light themes
