# Sidebar & Tasks Pane Resize/Collapse Specification

## Problem Statement

The Tree direction fixes the sidebar at 286px and the tasks pane at 322px
(`flex: 0 0` in `Sidebar.css` / `TasksPane.css`). On a small monitor those two
fixed columns leave the middle detail column with very little room — and
long branch names (e.g. `user/name/12345-slug/67890-endpoint`) make the
sidebar content crowded. The user wants the workspace column to be narrower
by default, resizable by drag, and collapsible/expandable, so the detail
column gets the space it needs.

## Goals

- [ ] The sidebar's width is user-adjustable within bounds and persists across restarts
- [ ] The sidebar can collapse to a thin rail and expand back to its last width
- [ ] The tasks pane gets the same resize/collapse treatment, reusing one mechanism

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| PR list / diff / PR comments view | Separate large feature (ADO API + new renderer surface); tracked for its own spec |
| Resizable columns in Board / Agents / Workflows directions | Tree direction only; directions are separate surfaces |
| Persisted per-workspace widths | Global UI state is the existing pattern (`ui.theme`, `ui.direction`) |
| Splitter between detail and tasks pane only | The mechanism covers both panes symmetrically |
| Restoring widths per monitor / multi-monitor | Out of scope; single persisted value |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Widths and collapsed state persist in `config.ui` | New optional fields `sidebarWidth`, `sidebarCollapsed`, `tasksWidth`, `tasksCollapsed`; absent = current fixed defaults | Matches the existing persisted-UI pattern (`theme`, `direction`, `defaultShell`) | y |
| New default sidebar width | 230px (was 286px) | The pain is width eaten by the workspace column on a small monitor; 230 still fits the tree rows | y |
| Drag bounds | sidebar: min 170px / max 420px; tasks pane: min 260px / max 460px | Wide enough for content, narrow enough to never starve the detail column (min 320px) | y |
| Collapse mechanism | Chevron button in each pane header; collapsed pane becomes a 36px rail with an expand chevron | Simplest affordance matching the existing pane-header pattern | y |
| Double-click on the drag handle toggles collapse | Included (VS Code convention) | Cheap once the handle exists | y |
| Persist failure does not block the interaction | In-memory width wins; `config:patch` failure is logged like the existing `update()` in `App.tsx` | Matches current theme/direction behavior | y |
| Remaining implicit dimensions (concurrency, auth, observability, data lifecycle, external calls) | N/A | Pure renderer-side UI state; no async boundaries beyond the existing `config:patch` | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Resizable, collapsible sidebar with a narrower default ⭐ MVP

**User Story**: As a user on a small monitor, I want the workspace sidebar to be
narrower by default, resizable by drag, and collapsible, so that the middle
detail column keeps enough room.

**Why P1**: This is the reported pain; it needs no extra surface, just pane layout.

**Acceptance Criteria** (each line is one EARS pattern):

1. The sidebar SHALL render at 230px when no custom width is persisted. <!-- ubiquitous -->
2. WHEN the user drags the sidebar's right-edge handle THEN the sidebar SHALL resize to the pointer position clamped to [170, 420]px. <!-- event-driven -->
3. WHEN the user clicks the collapse chevron in the sidebar header THEN the sidebar SHALL collapse to a 36px rail showing only an expand chevron. <!-- event-driven -->
4. WHEN the user expands the collapsed sidebar THEN it SHALL restore the width it had before collapsing. <!-- event-driven -->
5. WHEN the user double-clicks the sidebar handle THEN the sidebar SHALL toggle between expanded and collapsed. <!-- event-driven -->
6. WHEN the sidebar width or collapsed state changes THEN the app SHALL persist it via `config:patch` so a restart restores it. <!-- event-driven -->
7. WHILE the sidebar is collapsed the workspace tree SHALL NOT be rendered. <!-- state-driven -->

**Independent Test**: Start the app, drag the sidebar narrower, collapse and expand it,
quit and relaunch — the width and state are restored; the detail column is wider than before.

---

### P2: Tasks pane resize/collapse, same mechanism

**User Story**: As a user on a small monitor, I want the pinned-tasks pane to be
resizable and collapsible too, so the detail column is never squeezed by both fixed panes.

**Why P2**: The tasks pane eats the same 322px; reuses the P1 mechanism, so the marginal cost is low.

**Acceptance Criteria**:

1. WHEN the user drags the tasks pane's left-edge handle THEN the pane SHALL resize to the pointer position clamped to [260, 460]px. <!-- event-driven -->
2. WHEN the user clicks the collapse chevron in the tasks pane header THEN the pane SHALL collapse to a 36px rail and expand back to its previous width. <!-- event-driven -->
3. WHEN the tasks pane width or collapsed state changes THEN the app SHALL persist it via `config:patch`. <!-- event-driven -->

**Independent Test**: Same as P1, applied to the tasks pane; both panes collapsed leaves the detail column at full window width.

---

## Edge Cases

- IF a persisted width is outside [min, max] THEN the app SHALL clamp it to the bounds on load. <!-- unwanted-behavior -->
- IF the window is too narrow for the three columns' minimum widths THEN the panes SHALL shrink toward their minimums instead of overflowing the detail column. <!-- unwanted-behavior -->
- WHEN the app restarts WITH no persisted width THEN the default width SHALL apply (forward-compatible config). <!-- event-driven -->

---

## Requirement Traceability

| Requirement ID | Story       | Phase  | Status  |
| -------------- | ----------- | ------ | ------- |
| PANE-01        | P1: Sidebar | Design | Verified |
| PANE-02        | P1: Sidebar | Design | Verified |
| PANE-03        | P1: Sidebar | Design | Verified |
| PANE-04        | P1: Sidebar | Design | Verified |
| PANE-05        | P1: Sidebar | Design | Verified |
| PANE-06        | P1: Sidebar | Design | Verified |
| PANE-07        | P1: Sidebar | Design | Verified |
| PANE-08        | P2: Tasks   | -      | Verified |
| PANE-09        | P2: Tasks   | -      | Verified |
| PANE-10        | P2: Tasks   | -      | Verified |
| PANE-11        | Edge cases  | -      | Verified |
| PANE-12        | Edge cases  | -      | Verified |
| PANE-13        | Edge cases  | -      | Verified |

**ID format:** `PANE-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 13 total, 13 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] On a 1366px-wide window, the detail column is at least 120px wider than before the feature
- [ ] Width and collapsed state survive an app restart
- [ ] No layout overflow in the Tree direction at any clamped width