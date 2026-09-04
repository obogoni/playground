# Work Item Type Badge Colors Specification

## Problem Statement

The app shows a type badge on pinned work items across six surfaces (sidebar,
tasks pane, board, worktree detail, agents view, session rail). Today
`typeClass()` maps only Bug → red, Feature → accent and Chore → amber; every
other type (Task, Epic, User Story, Fault, ...) falls through to the same
neutral `muted` color, so all badges look alike. The user wants each badge to
use the same color Azure DevOps uses for that work item type.

## Goals

- [ ] Every standard ADO work item type badge renders with the ADO color for that type, across all six surfaces
- [ ] Types outside the standard set keep a neutral fallback (no invented colors)
- [ ] State badges (Active, New, In Progress, ...) keep their current colors — untouched

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| State badge colors (`stateClass`) | The request is about type badges only |
| Dynamic colors fetched from the ADO process API (`wit/workitemtypes`) | Custom types (e.g. Fault) would get their process-defined color, but it adds a network call + caching; the ask is a static ADO palette. Future candidate |
| Changing the type badge text/icon | Visual color only |
| Colors for custom/unknown types (Fault, Requirement, Test Case, ...) | ADO defines no default color for them; they keep the neutral fallback |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| ADO palette source | The **configured ADO process real colors**, fetched from `wit/workitemtypes` API (queried 2026-08-31) | The user's Azure shows these colors; the default-process palette differs (Bug is orange, Fault is red there) | y |
| Color map | Bug #f58b1f, Task #fbbc3d, User Story #0098c7, Feature #773b93, Epic #e06c00, Issue #b4009e, Code Review Req/Resp #b4009e, Fault #e60017, Initiative #339947, Request #666666, Test Case/Plan/Suite #004b50, Feedback Req/Resp #004b50, Shared Steps/Param #004b50 | Exact colors returned by the process API | y |
| Unknown types (Product Backlog Item, Impediment, Chore, Requirement, empty) | Neutral `muted` badge, as today | Not defined in the configured ADO process; no color to mirror | y |
| Match is case-insensitive and trim-safe | `"user story"` == `"User Story"` == `"USER STORY"` | ADO returns display names with casing; current switch already lowercases | y |
| Light/dark theme behavior | Keep the existing pill pattern: text in the ADO color, background `color-mix(… 16%, transparent)`; the ADO colors keep adequate contrast on both themes | Consistent with every other pill in the app; no new theme tokens | y |
| Remaining implicit dimensions (concurrency, auth, persistence, data lifecycle, external calls) | N/A | Pure renderer-side mapping of an existing string field; no async or shared state (the API query was a one-time source-of-truth lookup, not a runtime call) | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Type badges use the Azure DevOps colors ⭐ MVP

**User Story**: As a user pinning ADO work items, I want the type badge on each
item to use the same color Azure DevOps uses for that type, so I can tell a
Bug from a Task from an Epic at a glance.

**Why P1**: This is the entire request; it is a static mapping with no new surface.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN a work item of a type defined in the configured ADO process is displayed THEN the type badge SHALL render with that type's process color (Bug #f58b1f, Task #fbbc3d, User Story #0098c7, Feature #773b93, Epic #e06c00, Issue/Code Review #b4009e, Fault #e60017, Initiative #339947, Request #666666, Test Case/Plan/Suite/Feedback/Shared Steps/Shared Parameter #004b50). <!-- event-driven -->
2. WHEN the work item type is not defined in the configured ADO process THEN the type badge SHALL render with the neutral `muted` colors. <!-- unwanted-behavior -->
3. The type match SHALL be case-insensitive (`"user story"` matches `"User Story"`). <!-- ubiquitous -->
4. WHILE the app is in light or dark theme the type badge SHALL keep the mapped color with the standard tinted background. <!-- state-driven -->

**Independent Test**: Pin a Bug, a Task, a User Story, an Epic, a Fault, an Initiative and a type from another process (e.g. Product Backlog Item); the badges show the process colors (Bug orange, Fault red), and the foreign type stays neutral.

---

## Edge Cases

- IF the type string is empty or whitespace THEN the badge SHALL render neutral (`muted`). <!-- unwanted-behavior -->
- IF the type is from another process (e.g. `Product Backlog Item`, `Impediment`, `Chore`) THEN the badge SHALL render neutral (`muted`). <!-- unwanted-behavior -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TYPE-01        | P1    | Design | Verified |
| TYPE-02        | P1    | Design | Verified |
| TYPE-03        | P1    | Design | Verified |
| TYPE-04        | P1    | Design | Verified |
| TYPE-05        | Edge  | -      | Verified |
| TYPE-06        | Edge  | -      | Verified |

**ID format:** `TYPE-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 6 total, 6 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] A Bug, Task, User Story, Feature, Epic, Issue, Fault and Initiative badge are visually distinct on the board and sidebar, using the configured ADO process colors
- [ ] No badge regresses to a single flat color across the six surfaces
- [ ] Gate (`typecheck && lint && test`) stays green