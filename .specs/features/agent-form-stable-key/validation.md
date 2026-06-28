# agent-form-stable-key — Validation

**Verdict: PASS**
**Diff range:** `c3dea60` (branch `feature/agent-form-stable-key`)

## Per-AC evidence

| AC | Outcome | Evidence |
| -- | ------- | -------- |
| AGFK-01 (edit survives delete of a different agent) | PASS | `applyAgentEdit` test "targets the opened agent even after a different, lower-index agent was deleted" + `deleteAgent` closes form only when `removed.name === form.editKey`. |
| AGFK-02 (deleting the edited agent closes form) | PASS | `deleteAgent` name-match guard; commit on a deleted target is a no-op. |
| AGFK-03 (add appends) | PASS | Test "appends when editKey is null". |
| AGFK-04 (edit changes only the target) | PASS | Test "edits the agent matched by stable key, leaving others untouched". |

## Discrimination sensor
Mutation: no-match guard `return agents` → `return [...agents, def]`.
Result: **KILLED** — "no accidental append when targeted agent was deleted" failed. Tests assert spec behavior, not implementation.

## Spec-anchored outcome check
Each test asserts the spec-defined outcome (correct agent edited / no append / others untouched), not internal index math. No spec-precision gaps.
