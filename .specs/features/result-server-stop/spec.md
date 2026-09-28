# Result Server Stop Specification

Issue #91. Spec published on the issue: https://github.com/obogoni/playground/issues/91#issuecomment-5855462864

## Problem Statement

Quitting the app logs an unhandled promise rejection, `Error [ERR_SERVER_NOT_RUNNING]: Server is not running`, from the MCP result server's `stop()`. It happens on most quits. The server starts lazily, on a workflow's first agent step, but `will-quit` stops it every time, and Node's `Server.close()` reports `ERR_SERVER_NOT_RUNNING` whenever the server is not listening. Both quit handlers also discard the `stop()` promise with `void`, so a genuine close failure would escape as an unhandled rejection too. That is fatal under `--unhandled-rejections=strict`, and the noise hides real shutdown errors.

Measured on Node 24 (`http.createServer`):

| Situation | `close()` callback error | `listening` |
| --- | --- | --- |
| never started | `ERR_SERVER_NOT_RUNNING` | `false` |
| second `close()` while the first is still closing | `ERR_SERVER_NOT_RUNNING` | `false` right after the first `close()` |
| first `close()` of a listening server | none | - |

## Goals

- [ ] A normal quit, with or without a workflow agent step having run, leaves no `ERR_SERVER_NOT_RUNNING` and no unhandled rejection in the main process output.
- [ ] A genuine close failure of either local server at quit reaches the log with a prefix naming the server.

## Out of Scope

| Feature | Reason |
| --- | --- |
| The `EPERM` from `ConfigStore.persist` seen in the same log | Unrelated defect |
| Starting the MCP result server eagerly | Lazy start is WF3-10's decision; the fix is on the stop side |
| Changing the activity hook server's own `stop()` | It already guards on `listening`; only its caller changes |
| Other teardown noise | Not caused by these two servers' `stop()` |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| How `stop()` treats a server that is not listening | Resolve without calling `close()` when `!httpServer.listening`; do not match on the error code | Same guard as the activity hook server, one idiom in the repo; covers never-started, closed and closing | y (owner, grill Q1) |
| Quit callers | Replace `void ….stop()` with `.catch((err) => console.error('[prefix] … stop failed', err))` in both quit handlers | Same shape as the existing `[notifications]` catch in `index.ts` | y (owner, grill Q2 and Q5) |
| How to inject a close error in a unit test | `vi.spyOn(Server.prototype, 'close')` invoking the callback with an arbitrary error, restored in the test | No production change for a test-only seam; `vi.spyOn` + `mockRestore` has precedent in `session-manager.test.ts` (TESTING.md bans `vi.mock`, not spies) | y (owner, grill Q3) |
| Existing bind-failure test | Drop its `.catch(() => {})` on `stop()` | The catch swallowed exactly this defect | y (owner, grill Q4) |
| Proof of the quit | A committed smoke that launches the built app on a throwaway user data dir, closes its window through CDP and reads the main process output; falsified first against the unfixed build | A check that cannot fail proves nothing | y (owner, grill Q6) |
| Pending registrations when the server is not listening | Still rejected with "server stopped before emit_result" before the guard returns | `register()` does not require `start()`; an early return above the loop would leave a pending step hanging | n (derived; keeps today's order) |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Quit without an unhandled rejection ⭐ MVP

**User Story**: As a developer, I want the app to quit without an unhandled rejection, whether or not a workflow ran, so that the teardown log is trustworthy.

**Why P1**: It is the defect the issue reports, and it hits most quits.

**Acceptance Criteria**:

1. WHEN `stop()` is called on an MCP result server that was never started THEN the server SHALL resolve the returned promise. <!-- RSTP-01 -->
2. WHEN `stop()` is called again after a `stop()` that resolved THEN the server SHALL resolve the returned promise. <!-- RSTP-02 -->
3. WHEN `stop()` is called after `start()` rejected because the port was already bound THEN the server SHALL resolve the returned promise. <!-- RSTP-03 -->
4. IF closing the listening HTTP server reports an error THEN `stop()` SHALL reject with that same error. <!-- RSTP-04 -->
5. WHEN `stop()` is called while an `emit_result` registration is pending THEN the server SHALL reject that registration's promise with the message "server stopped before emit_result", whether or not the HTTP server is listening. <!-- RSTP-05 -->
6. WHEN the built app quits by closing its only window, with no workflow agent step having run THEN the main process output SHALL contain neither `ERR_SERVER_NOT_RUNNING` nor `UnhandledPromiseRejection`, and the process SHALL exit with code 0. <!-- RSTP-06 -->

**Independent Test**: `npx vitest run src/main/mcp-result-server.test.ts` for 1-5; `node scripts/smoke-quit.mjs` after `npx electron-vite build` for 6.

---

### P2: Close failures at quit reach the log

**User Story**: As a developer, I want a genuine close failure of either local server at quit to be logged with the server's name, so that it is diagnosable instead of escaping as an unhandled rejection.

**Why P2**: No close failure other than "not running" has been observed; this keeps a future one visible and non-fatal.

**Acceptance Criteria**:

1. IF the MCP result server's `stop()` rejects in the `will-quit` handler THEN the main process SHALL write the error with `console.error` under the prefix `[mcp-result-server]`. <!-- RSTP-07 -->
2. IF the activity hook server's `stop()` rejects in the `window-all-closed` handler THEN the main process SHALL write the error with `console.error` under the prefix `[activity-hooks]`. <!-- RSTP-08 -->

**Independent Test**: code review of the two handlers plus `npm run typecheck` (thin Electron shell, hand-verified per TESTING.md); RSTP-06's smoke confirms the wiring still quits cleanly.

---

## Edge Cases

- WHEN a second `stop()` starts while the first is still closing THEN the server SHALL resolve the second call (covered by RSTP-02's guard, since `listening` is already `false`).
- IF `start()` never ran but a registration exists THEN `stop()` SHALL still reject that registration (RSTP-05).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| RSTP-01 | P1: Quit without an unhandled rejection | T2 | Verified |
| RSTP-02 | P1: Quit without an unhandled rejection | T2 | Verified |
| RSTP-03 | P1: Quit without an unhandled rejection | T2 | Verified |
| RSTP-04 | P1: Quit without an unhandled rejection | T2 | Verified |
| RSTP-05 | P1: Quit without an unhandled rejection | T2 | Verified |
| RSTP-06 | P1: Quit without an unhandled rejection | T1, T3 | Verified |
| RSTP-07 | P2: Close failures at quit reach the log | T3 | Verified |
| RSTP-08 | P2: Close failures at quit reach the log | T3 | Verified |

**Coverage:** 8 total, 8 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] `scripts/smoke-quit.mjs` reports `ERR_SERVER_NOT_RUNNING` on the unfixed build and passes on the fixed build.
- [ ] `npm run typecheck && npm run lint && npm test` exits 0 with the test count at the baseline plus the new cases.
