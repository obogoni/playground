# Blocked State in Red Specification

Issue: #187

## Problem Statement

A pinned work item in the `Blocked` state draws a gray state pill, because
`stateClass()` has no case for it and every unrecognised state falls to `muted`.
A blocked item is the one the user most needs to notice, and gray makes it the
easiest to miss.

## Goals

- [ ] A `Blocked` work item shows its state in the app's red on every surface that draws a state
- [ ] Every other state keeps its current colour

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Colours for other unrecognised states (`Removed`, ...) | The owner asked for `Blocked` only |
| A configurable state-colour map | Static mapping is enough for one state |
| A new colour token | `--red` already exists in both themes |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Colour | The existing `red` class and `--red` token (dark `#e08068`, light `#cf6149`) | Owner chose red; it already means failure/attention in the app | y |
| Matching | Case-insensitive on the whole state string, as `stateClass` already lowercases | Provider casing varies | y |
| Surfaces | Task pills (tasks pane, session rail, agents view, worktree detail) and the sidebar state dot | The Board was removed upstream (AD-065); these are the remaining `stateClass` callers | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Blocked reads as red ⭐ MVP

**User Story**: As a developer scanning my pinned tasks, I want a blocked item's state to be red, so that I spot blockers at a glance.

**Why P1**: It is the whole request.

**Acceptance Criteria**:

1. WHEN a work item's state is `Blocked` in any casing THEN `stateClass` SHALL return `red`. <!-- event-driven -->
2. WHEN a blocked item is drawn as a task pill THEN the pill SHALL use the existing `.task-pill.red` colours. <!-- event-driven -->
3. WHEN a blocked item is drawn as a sidebar state dot THEN the dot SHALL be filled with `--red`. <!-- event-driven -->
4. The mapping for `active`, `new`, `in progress`, `resolved`, `closed` and every other state SHALL stay as it is today. <!-- ubiquitous -->

**Independent Test**: Pin an item in the `Blocked` state; its pill in the tasks pane and its dot in the sidebar are red.

---

## Edge Cases

- WHEN the state is `blocked` or `BLOCKED` THEN `stateClass` SHALL return `red`.
- IF the state is a string that only contains `blocked` (for example `Unblocked`) THEN `stateClass` SHALL return `muted`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| BLKR-01 | P1: Blocked reads as red (AC 1, edge cases) | Execute | Implementing |
| BLKR-02 | P1: Blocked reads as red (AC 2) | Execute | Pending |
| BLKR-03 | P1: Blocked reads as red (AC 3) | Execute | Pending |
| BLKR-04 | P1: Blocked reads as red (AC 4) | Execute | Implementing |

**Coverage:** 4 total, 4 mapped to Execute, 0 unmapped

---

## Success Criteria

- [ ] A `Blocked` item is red in the tasks pane, session rail, agents view, worktree detail and sidebar, in both themes
