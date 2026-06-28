# ADO Fetch Timeout Specification

## Problem Statement

`AdoGateway` calls `fetch` against the Azure DevOps API with no timeout. A
connection that hangs (rather than failing) leaves the promise pending forever,
so the IPC calls that depend on it (`tasks:refresh`, `tasks:pin`) never resolve
and the UI action hangs with no feedback.

## Goals

- [ ] Every ADO `fetch` is bounded by a timeout.
- [ ] A timed-out request resolves as a handled failure, not a hang.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Retry / backoff | Separate resilience concern. |
| Circuit breaker | Over-engineering for current scale. |
| Configurable per-user timeout | A sensible constant is enough. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Timeout value | 10000 ms | Generous for a normal ADO call, short enough to fail a hung socket quickly. | n |
| Timeout mechanism | `AbortSignal.timeout(ms)` passed as `fetch` `signal` | Native, no dependency; Node 22 supports it. | y |
| On timeout behavior | treated as the existing "request failed / group unresolved" path | Reuses current failure handling; no new UI surface. | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: ADO requests cannot hang ⭐ MVP

**User Story**: As a user, I want ADO task fetches to fail fast on a stuck
connection so that the UI doesn't freeze indefinitely.

**Why P1**: The bug.

**Acceptance Criteria**:

1. WHEN an ADO `fetch` does not complete within the timeout THEN the request SHALL abort.
2. WHEN a request aborts due to timeout THEN it SHALL be handled as a failed/unresolved fetch (same path as a network error), not a pending promise.
3. WHEN a request completes within the timeout THEN behavior SHALL be unchanged.

**Independent Test**: Unit test with an injected fetch that never resolves → the gateway call rejects/handles within the timeout window (not hung); a fast-resolving fetch behaves as before.

---

## Edge Cases

- WHEN the timeout fires THEN the resulting error SHALL be distinguishable from / handled the same as a normal fetch failure (no unhandled rejection).
- WHEN multiple ADO requests run concurrently THEN each SHALL have its own independent timeout.

---

## Requirement Traceability

| Requirement ID | Story | Phase   | Status  |
| -------------- | ----- | ------- | ------- |
| ADTO-01        | P1    | Execute | Pending |
| ADTO-02        | P1    | Execute | Pending |
| ADTO-03        | P1    | Execute | Pending |

**Coverage:** 3 total.

---

## Success Criteria

- [ ] All ADO `fetch` calls carry a timeout signal.
- [ ] A hung request resolves as a handled failure within the timeout (unit-tested).
