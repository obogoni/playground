# Agent Form Stable Key Specification

## Problem Statement

In `SettingsDialog`, the agent edit form tracks the agent being edited by its
array index (`form.index`). The agent list is mutable: if the user opens the
edit form for one agent and then deletes another agent at a lower index, the
index shifts. On commit, the edit is written to the wrong agent (or silently
discarded). There is no undo — the config is corrupted.

## Goals

- [ ] Editing an agent always writes back to the agent the user opened, regardless of concurrent list mutations.
- [ ] Deleting an agent never silently retargets an open edit form.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Undo/redo for agent edits | Separate concern. |
| Persisting a permanent agent id to disk config | Avoid changing the config schema; an in-memory stable key is enough for the UI session. |
| Reordering agents in the UI | Not requested. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Stable identity source | agent `name` (unique within the list) | Names already act as the user-facing identifier; no schema change needed. | n |
| Two agents with the same name | UI prevents/last-wins is acceptable | Names are expected unique; out of scope to enforce. | n |
| Renderer unit tests | none (convention) | Logic that warrants a test is extracted to a pure helper in `lib/` and tested there. | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Edits target the intended agent ⭐ MVP

**User Story**: As a user configuring agents, I want my edit to land on the
agent I opened so that my config is never corrupted by unrelated list changes.

**Why P1**: Data-corruption bug; the whole point.

**Acceptance Criteria**:

1. WHEN the user opens the edit form for agent A and then deletes a different agent B THEN committing the form SHALL still update agent A.
2. WHEN the user deletes the exact agent whose form is open THEN the form SHALL close (no orphan edit).
3. WHEN the user adds a new agent (no existing target) THEN commit SHALL append a new agent.
4. WHEN the user commits an edit THEN no agent other than the targeted one SHALL change.

**Independent Test**: Pure helper that, given the current agent list + the form's stable key + the new definition, returns the next list — unit-tested for add/edit/edit-after-delete/delete-target cases.

---

## Edge Cases

- WHEN the targeted agent no longer exists at commit time (deleted) THEN the commit SHALL be a no-op or close cleanly (no accidental append).
- WHEN `key={index}` is used in the list render THEN it SHALL be replaced by the stable key to avoid DOM identity churn on mid-list delete.

---

## Requirement Traceability

| Requirement ID | Story | Phase   | Status  |
| -------------- | ----- | ------- | ------- |
| AGFK-01        | P1    | Execute | Pending |
| AGFK-02        | P1    | Execute | Pending |
| AGFK-03        | P1    | Execute | Pending |
| AGFK-04        | P1    | Execute | Pending |

**Coverage:** 4 total.

---

## Success Criteria

- [ ] Edit-after-delete writes to the correct agent (covered by a unit test on the extracted helper).
- [ ] List render keys by stable identity, not array index.
