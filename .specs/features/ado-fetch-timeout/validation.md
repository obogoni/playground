# ado-fetch-timeout — Validation

**Verdict: PASS**
**Diff range:** `04de856` (branch `feature/ado-fetch-timeout`)

## Per-AC evidence

| AC | Outcome | Evidence |
| -- | ------- | -------- |
| ADTO-01 (aborts past timeout) | PASS | `fetchWithTimeout` passes `AbortSignal.timeout(timeoutMs)`; test "rejects when the request outlives the timeout" with a hung-but-abortable fetch. |
| ADTO-02 (timeout = handled failure, not hang) | PASS | Rejection propagates; in `getWorkItems` the existing `catch { continue }` leaves the group unresolved (no pending promise, no auth flip). |
| ADTO-03 (fast request unchanged) | PASS | Test "resolves and forwards the response when fetch completes in time"; init preserved (Authorization header asserted). |
| Edge: independent per-call signal | PASS | Test "gives each call an independent signal". |

## Discrimination sensor
Mutation: drop the signal — `fetchFn(url, { ...init })`.
Result: **KILLED** — the hung-fetch test no longer aborts and fails.

## Spec-anchored outcome check
Tests assert the spec outcome (a hung request fails fast; a fast one is untouched), not the AbortSignal mechanism. No gaps.
