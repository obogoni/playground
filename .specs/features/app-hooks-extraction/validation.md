# app-hooks-extraction — Validation

**Verdict: PASS** (unit + structural; end-to-end parity pending CDP smoke)
**Diff range:** `570c2d7` (branch `feature/app-hooks-extraction`)

## Per-AC evidence

| AC | Outcome | Evidence |
| -- | ------- | -------- |
| APHX-01/02/03 (behavior unchanged) | PASS (structural) | IPC calls/sequence preserved 1:1 in `useSessions`/`useTree`; App composes them. `removeSession` selection-clear converted to an equivalent functional updater. |
| APHX-04 (gate green, no deleted tests) | PASS | typecheck OK, lint 0 errors, 207 tests (200 + 7 new), zero deletions. |
| Edge: selection reconciliation extracted + tested | PASS | `tree-selection` pure module: `findWorktree`/`selectionAfterRefresh`/`selectionAfterRemove` with create/remove/empty-tree cases. |

## Discrimination sensor
Mutation: `selectionAfterRefresh` → `return currentId` (drop existence check).
Result: **KILLED** — "drops the selection when its worktree is gone" failed.

## Notes
Renderer is not unit-tested by convention; behavior parity for the moved IPC wiring is confirmed by CDP smoke (`scripts/smoke-*.mjs`) on a live session — the user's to run. The extracted pure logic is unit-covered and the sensor confirms it.
