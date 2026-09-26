## Validation: pinned-task-open — PASS

**Date**: 2026-09-26
**Spec**: `.specs/features/pinned-task-open/spec.md`
**Diff range**: `feature/window-open-https..HEAD` (`9c3b88a..95b0d94`; merge base `274f641` = tip of `feature/window-open-https`). Fix round 1 added `713cf64` and `95b0d94` on top of `f1ddcc2`.
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree
**Iteration**: 2 of 3

Fix round 1 closed every gap from iteration 1 that the tests could close:
- The host check now compares `URL.host`, so the port counts, as in the spec's "host".
- Five new test cases pin Goal 2, org identity, a prefixed host and a non-`Error` rejection.

All 16 mutants were caught. The gate is green. Gap 6 (the renderer's fallback paths) stays informational, because the approved matrix plans no renderer tests.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 `openPinnedTask` | ✅ Done | 240278d, plus 713cf64 (host check with the port, 5 more test cases) |
| T2 contract | ✅ Done | afe4074 |
| T3 main handler | ✅ Done | 2450fa2. The handler reads `configStore.get().pinnedTasks` directly; `tasks.md:134` records this now |
| T4 links + `onToast` | ✅ Done | c332019 |
| T5 CSS | ✅ Done | ce80e7e |
| T6 owner check | ✅ Done | f1ddcc2, plus 95b0d94 (owner's reply quoted, probe output kept word for word) |

---

## Spec-Anchored Acceptance Criteria

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| PTOP-01 click title | opens the task's stored URL in the default browser | Manual: `tasks.md:221` (owner's reply quoted: "funcionou tudo, pode seguir"). Code: `TasksPane.tsx:214-221` `<button type="button" onClick={onOpen}>` → `TasksPane.tsx:79-86` `tasks:open` → `index.ts:385-390` `shell.openExternal`. Unit (main half): `task-board.test.ts:441-442` `expect(result).toEqual({ ok: true })`, `expect(o.calls).toEqual(['https://dev.azure.com/acme/platform/_workitems/edit/12345'])` | ✅ PASS |
| PTOP-02 click `#id` | the same URL | Manual: `tasks.md:221`. Code: `TasksPane.tsx:202-209`, the same `onOpen` | ✅ PASS (manual) |
| PTOP-03 Enter on focused link | the same URL | Manual: `tasks.md:221` ("tabbing to the title showed the focus ring and Enter opened it"). Code: a native `<button type="button">`; `TasksPane.css:165-168` `:focus-visible` ring | ✅ PASS (manual; tried on the title only, the `#id` is the same element) |
| PTOP-04 no details | the `#id` stays a link; "details unavailable" is not one | Agent CDP probe, output kept word for word at `tasks.md:213-218`: `"idTag":"BUTTON"`, `"unavailableIsButton":false`, `"unavailable":"details unavailable"`. Code: `TasksPane.tsx:202-209`, `TasksPane.tsx:224` (a plain `<div>`) | ✅ PASS |
| PTOP-05 not pinned | `{ ok: false, error: 'That task is no longer pinned.' }`, nothing opened | `task-board.test.ts:453-454` `expect(result).toEqual({ ok: false, error: 'That task is no longer pinned.' })`, `expect(o.calls).toEqual([])` | ✅ PASS (exact string) |
| PTOP-06 bad scheme or host | `{ ok: false, error: 'Refusing to open an unexpected work item URL.' }`, nothing opened | `task-board.test.ts:457-474` `it.each` covering http, a foreign host, a look-alike suffix, a prefixed host (`xdev.azure.com`), `dev.azure.com:8443` and a URL that does not parse. Each asserts `expect(result).toEqual({ ok: false, error: 'Refusing to open an unexpected work item URL.' })` and `expect(o.calls).toEqual([])`. Code: `task-board.ts:94` `new URL(task.url).host !== 'dev.azure.com'` | ✅ PASS (exact string; the host now means host, port included) |
| PTOP-07 browser fails | `{ ok: false, error }` with the system's message | `task-board.test.ts:483` `expect(result).toEqual({ ok: false, error: 'No application is associated with https' })`; `task-board.test.ts:544` `expect(result).toEqual({ ok: false, error: 'blocked by policy' })` for a rejection that is not an `Error` | ✅ PASS |
| PTOP-08 failure → toast | the pane shows the error in the app's toast | Agent CDP probe `tasks.md:213-218`: `toast "Refusing to open an unexpected work item URL."`. Code: `TasksPane.tsx:83-85` `onToast(result.error …)`; `App.tsx:448` `onToast={setToast}` | ✅ PASS (the `.catch` path and the `??` fallback never ran; gap 1) |
| PTOP-09 Unpin / Start work / Agent don't open | the browser is not opened | Manual: `tasks.md:221` ("Start work and Agent opened their dialogs and never the browser"). Code: those handlers are untouched, each is its own sibling `<button>`, and the `<article>` has no click handler. Unpin rests on code reading | ✅ PASS |

**Spec Goal 2** ("never one the renderer supplies"): `task-board.test.ts:516` `expect(o.calls).toEqual([stored])`. The ref carries a conflicting `url`, and the stored URL has `?view=discussion`, which a rebuild from the ref would not produce.

**Edge cases**
- [x] Same id pinned in two projects → each opens its own. `task-board.test.ts:499` `expect(o.calls).toEqual([url('acme', 'billing', 42), url('acme', 'platform', 42)])`.
- [x] The same id and project under two orgs → the right org opens. `task-board.test.ts:528` `expect(o.calls).toEqual([url('contoso', 'platform', 42)])`.
- [x] Double click → opens twice, no guard, as the spec says. By construction: `TasksPane.tsx:79-86` has no debounce or in-flight flag.

**Can the manual records be trusted?** Iteration 1 found neither record reproducible. Now:
- The CDP probe's output is kept word for word. The owner's reply is quoted, with a translation, and names no work item, which suits a public repo.
- The owner's reply is one confirmation of a checklist that is not reproduced. The steps are listed in the same paragraph, which is enough for a reader.
- The probe shows the toast. It does not show that `openExternal` was never called; that half of PTOP-06 is left to the unit test at `task-board.test.ts:474`.

**Status**: all 9 ACs covered with exact outcomes, plus Goal 2 and both identity edge cases. No spec-precision gaps remain. The host-vs-hostname note is fixed in the code.

---

## Discrimination Sensor

The scratch area was a detached `git worktree` of `95b0d94` in the session scratchpad, with `node_modules` linked in by a directory junction. For each mutant, `src/main/task-board.ts` was changed and `npx vitest run src/main/task-board.test.ts` was run. The unmutated control run passed 43/43.

| # | File:line | Mutation | Killed? |
| - | --------- | -------- | ------- |
| M1 | `src/main/task-board.ts:93` | not-pinned path returns `{ ok: true }` | ✅ Killed (1 failed) |
| M2 | `src/main/task-board.ts:94` | host check removed | ✅ Killed (4 failed) |
| M3 | `src/main/task-board.ts:94` | `isHttpsUrl` check removed | ✅ Killed (2 failed) |
| M4 | `src/main/task-board.ts:94` | host check loosened to `endsWith('dev.azure.com')` (survived iteration 1) | ✅ Killed (1 failed) |
| M4b | `src/main/task-board.ts:94` | `.host` reverted to `.hostname` (the port ignored again) | ✅ Killed (1 failed) |
| M4c | `src/main/task-board.ts:94` | host check loosened to `includes('dev.azure.com')` | ✅ Killed (3 failed) |
| M5 | `src/main/task-board.ts:92` | lookup ignores `org` (survived iteration 1) | ✅ Killed (1 failed) |
| M5b | `src/main/task-board.ts:92` | lookup ignores `project` | ✅ Killed (1 failed) |
| M5c | `src/main/task-board.ts:92` | lookup ignores `id` | ✅ Killed (1 failed) |
| M6 | `src/main/task-board.ts:92` | lookup by `id` only | ✅ Killed (2 failed) |
| M7 | `src/main/task-board.ts:98` | opens `ref.url ?? task.url` (survived iteration 1) | ✅ Killed (1 failed) |
| M8 | `src/main/task-board.ts:98` | `openExternal` not awaited | ✅ Killed (2 failed) |
| M9 | `src/main/task-board.ts:101` | system message replaced by a fixed string | ✅ Killed (2 failed) |
| M10 | `src/main/task-board.ts:101` | non-`Error` rejection → `'unknown'` (survived iteration 1) | ✅ Killed (1 failed) |
| M11 | `src/main/task-board.ts:98` | URL rebuilt from the ref's `{ org, project, id }` (survived iteration 1) | ✅ Killed (1 failed) |
| M12 | `src/main/task-board.ts:98` | the stored URL's query string dropped | ✅ Killed (1 failed) |

**Sensor depth**: expanded (16 hand-made mutations, re-run independently of the author's)
**Killed**: 16/16

**Isolation**: before the sensor, `git status --porcelain` on `D:\playground-main` showed `?? .specs/features/pinned-task-open/validation.md` (this report, from iteration 1). Cleanup order:
1. `cmd /c rmdir` of the junction; `D:\playground-main\node_modules` was still there afterwards.
2. `git worktree remove --force`.

The porcelain output matched the baseline, and `git worktree list` shows only the real tree.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ the fix is a one-token change (`hostname` → `host`) plus tests |
| Surgical changes | ✅ the fix round touched only `task-board.ts:94`, its tests and `tasks.md` |
| No scope creep | ✅ |
| Matches patterns | ✅ |
| The renderer sends only `{ id, org, project }` | ✅ `TasksPane.tsx:81`. Main ignores any extra field, and `task-board.test.ts:516` now pins that |
| Main opens only the stored URL | ✅ `task-board.ts:98`, pinned by `task-board.test.ts:516` |
| CSS keeps the look | ✅ unchanged since iteration 1. Known side effect: the title can no longer be mouse-selected for copying |
| Spec-anchored outcome check | ✅ |
| Per-layer coverage | ✅ the task logic maps 1:1 to PTOP-05/06/07, the edge cases, the happy path and Goal 2 |
| Every test maps to a requirement | ✅ each of the 13 cases is tagged with an AC, an edge case or Goal 2 |
| Guidelines | `.specs/codebase/TESTING.md`, `vitest.config.ts` |

---

## Gate Check

- **Command**: `npm run typecheck && npm run lint && npm test`, run on the real tree, read-only
- **Exit**: 0
- **typecheck**: passed
- **lint**: `✖ 18 problems (0 errors, 18 warnings)`, the same as the baseline
- **tests**: `Test Files 91 passed (91)`, `Tests 1689 passed (1689)`
- **Count**: 1676 before the feature, 1684 after iteration 1, 1689 now (+5: two `it.each` rows and three `it`)
- **Skipped / failures**: none
- The Verifier did not re-run `npx electron-vite build`. The fix round changed no renderer or wiring code.

---

## Remaining gaps (none blocking)

1. **The renderer's fallback paths are untested** (PTOP-08): the `.catch` toast and `?? 'Could not open the work item.'` at `TasksPane.tsx:83-85`. The approved matrix plans no renderer tests, so this is informational, carried over from iteration 1.
2. **The manual record's limits** (PTOP-01..03, 09): the owner's reply is one confirmation of a checklist whose exact wording is not kept, and Unpin rests on code reading. Acceptable, and noted for the reader.

---

## Iteration 1 (history)

- **Verdict**: FAIL at `f1ddcc2`. Gate green (1684 tests), all 9 ACs had evidence, but the sensor caught only 6 of 11 mutants.
- **Survivors**:
  - M4, `endsWith` host check
  - M5, lookup ignores org
  - M7, opens `ref.url`
  - M10, non-`Error` rejection
  - M11, URL rebuilt from the ref
- **Gaps raised**:
  1. Goal 2 untested
  2. org identity untested
  3. host check half pinned, and "host" versus `hostname`
  4. manual evidence without an artifact
  5. non-`Error` rejection untested
  6. renderer fallback paths
  7. the T3 deviation was not recorded
- **Fix round 1**: `713cf64` closed 1, 2, 3 and 5, and `95b0d94` closed 4 and 7. Gap 6 is left informational by the matrix.

---

## Requirement Traceability Update

| Requirement | Previous | New |
| ----------- | -------- | --- |
| PTOP-01 | Done | ✅ Verified |
| PTOP-02 | Done | ✅ Verified |
| PTOP-03 | Done | ✅ Verified |
| PTOP-04 | Done | ✅ Verified |
| PTOP-05 | Done | ✅ Verified |
| PTOP-06 | Done | ✅ Verified |
| PTOP-07 | Done | ✅ Verified |
| PTOP-08 | Done | ✅ Verified |
| PTOP-09 | Done | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 9/9 ACs matched the spec's outcome, plus Goal 2; no spec-precision gaps
**Sensor**: 16/16 killed
**Gate**: 1689 passed, 0 failed; lint 0 errors / 18 warnings

**Next steps**: none from the Verifier. Gap 1 stays informational.

---

## Lesson candidates

These come from the iteration-1 failures, which were fixed in round 1.

- **When a function looks up a stored record by a caller-sent identity, test with a request object that carries a conflicting extra field**, and assert the stored value wins. Grounded in M7 and M11, which survived iteration 1 because the tests passed the stored record itself as the request.
- **When the spec defines identity as a tuple, write one mismatch case per component.** Grounded in M5, which survived iteration 1 because only the project was ever varied.
- **Test an exact host check with both a suffixed and a prefixed look-alike, and with a non-default port.** Grounded in M4 and in the host-vs-`hostname` spec-precision gap from iteration 1.
- **Store manual acceptance evidence as the owner's words or the probe's raw output, not the author's summary.** Grounded in iteration-1 gap 4.
