# App Hooks Extraction Specification

## Problem Statement

`App.tsx` (~442 lines) is a god component: ~13 `useState`/refs and ~20 handlers
orchestrate sessions, the worktree tree, and tasks via IPC, with prop drilling
3–4 levels deep. The logic is untestable while trapped in the component and the
file is hard to change safely.

## Goals

- [ ] Move session orchestration into a `useSessions` hook in `renderer/src/lib/`.
- [ ] Move worktree-tree orchestration into a `useTree` hook in `renderer/src/lib/`.
- [ ] `App.tsx` consumes the hooks; observable behavior is unchanged.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| `useTasks` / `useConfig` extraction | AD-004: incremental — deferred to a later PR. |
| Removing prop drilling via context | Separate refactor; this PR only relocates logic into hooks. |
| Behavior changes / new features | Pure refactor; behavior must be preserved. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Scope of this PR | `useSessions` + `useTree` only | AD-004. | y |
| Hook location | `src/renderer/src/lib/` | Co-located with existing renderer libs. | y |
| Behavior parity verification | manual CDP smoke + visual (convention) | Renderer is not unit-tested; hooks expose seams but the IPC wiring is hand-verified. | y |
| Pure decision logic surfaced during extraction | extract to a testable function and unit-test it | Matches the repo's "testable seam" convention. | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Session + tree logic live in hooks ⭐ MVP

**User Story**: As a developer, I want session and tree orchestration in
dedicated hooks so that `App.tsx` shrinks and the logic becomes navigable.

**Why P1**: The refactor itself.

**Acceptance Criteria**:

1. WHEN the app loads THEN sessions and the worktree tree SHALL render exactly as before the refactor.
2. WHEN a session is spawned/stopped/respawned/removed/renamed/duplicated THEN behavior SHALL be identical to pre-refactor (same IPC calls, same state updates, same toasts).
3. WHEN the tree is refreshed / a worktree is created or removed THEN selection reconciliation SHALL behave as before.
4. WHEN the gate runs THEN `typecheck`, `lint`, and `test` SHALL pass with no deleted tests.

**Independent Test**: CDP smoke scripts for sessions and tree (`smoke-*.mjs`) pass; any pure helper extracted (e.g. selection reconciliation) is unit-tested.

---

## Edge Cases

- WHEN selection reconciliation logic is extracted THEN it SHALL be a pure function with unit tests covering create/remove/empty-tree cases.
- WHEN a hook owns an effect with a subscription/listener THEN it SHALL clean up on unmount (no leak introduced by the move).

---

## Requirement Traceability

| Requirement ID | Story | Phase  | Status  |
| -------------- | ----- | ------ | ------- |
| APHX-01        | P1    | Tasks  | Pending |
| APHX-02        | P1    | Tasks  | Pending |
| APHX-03        | P1    | Tasks  | Pending |
| APHX-04        | P1    | Tasks  | Pending |

**Coverage:** 4 total.

---

## Success Criteria

- [ ] `App.tsx` no longer owns session/tree IPC orchestration directly.
- [ ] `useSessions` and `useTree` exist under `lib/`.
- [ ] Gate green; smoke scripts pass; behavior unchanged.
