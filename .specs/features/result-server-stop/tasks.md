# Result Server Stop Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/result-server-stop/spec.md`
**Design**: none - no architectural decision; the guard copies the activity hook server's.
**Status**: Done (2026-09-27). Verifier PASS on the first round: 8/8 ACs, 7/7 mutants killed; report in `validation.md`.
**Branch**: `feature/result-server-stop` (cut from `main` = `origin/main` `c31bb9a`)
**Test baseline**: measured green on the branch on 2026-09-27 before any production change - 1663 tests / 90 files, `typecheck` and `lint` exit 0 (18 prettier warnings, 0 errors).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main DI module (`src/main/mcp-result-server.ts`) | unit | 1:1 to RSTP-01..05 against a real loopback listener; close error injected with `vi.spyOn(Server.prototype, 'close')`, restored in the test | `src/main/<module>.test.ts` | `npx vitest run src/main/mcp-result-server.test.ts` |
| Thin Electron shell (`src/main/index.ts` quit handlers) | none | Hand-verified per TESTING.md; RSTP-06 smoke exercises the wiring | - | build gate only |
| Quit smoke (`scripts/smoke-quit.mjs`) | none | The script is the check; falsified against the unfixed build (T1) before it may count as evidence for RSTP-06 | `scripts/smoke-*.mjs` | `npx electron-vite build && node scripts/smoke-quit.mjs` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | While writing the unit tests of T2 | `npx vitest run src/main/mcp-result-server.test.ts` |
| Full | End of T2 | `npm test` |
| Build | T1, T3, and before the Verifier | `npm run typecheck && npm run lint && npm test` (+ `npx electron-vite build && node scripts/smoke-quit.mjs` in T1 and T3) |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Reproduce, fix, wire

```
T1 → T2 → T3
```

---

## Task Breakdown

### T1: Quit smoke that reproduces the rejection

**What**: `scripts/smoke-quit.mjs` builds nothing itself; after `npx electron-vite build` it launches `node_modules/electron`'s binary on `.` with a fresh `mkdtemp` user data dir, `--remote-debugging-port`, and the anti-occlusion flags; waits for the page target; evaluates `window.close()` over CDP; waits up to 30 s for exit; prints the captured stdout + stderr; fails when the process did not exit, exited non-zero, or its output matches `ERR_SERVER_NOT_RUNNING` or `UnhandledPromiseRejection`; deletes the temp dir in a `finally`.
**Where**: `scripts/smoke-quit.mjs` (new)
**Depends on**: None
**Reuses**: CDP over the global `WebSocket` as in `scripts/smoke-status-bar.mjs`; header comment shape of the other smokes
**Requirement**: RSTP-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Run against the **unfixed** build, the script FAILS and its output shows `ERR_SERVER_NOT_RUNNING` (falsification recorded in this task with the exit code and the matched line)
- [x] **Stop rule:** if the unfixed build quits clean, stop and report to the owner - the check cannot discriminate and RSTP-06 needs another proof (not triggered)
- [x] The script never touches `%APPDATA%\playground` (the user data dir is the temp dir) and leaves no electron process behind
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` - 1663 tests (no silent deletions)

**Result (2026-09-27)**: on the unfixed build (`c31bb9a` code) the smoke exits 1, 3/5 checks. The app exits 0 after the window closes, and the output carries `(node:6912) UnhandledPromiseRejectionWarning: Error [ERR_SERVER_NOT_RUNNING]: Server is not running.` at `Server.close (node:net:2359:12)`, so checks 4 and 5 fail. Added a fifth check the plan did not name: the output must contain Chromium's `DevTools listening` line, so an empty capture cannot read as a clean quit. No `electron.exe` with `quit-smoke` in its command line and no `quit-smoke-*` dir under `%TEMP%` after the run.

**Tests**: none
**Gate**: build

**Commit**: `test(quit): add a smoke that quits the built app and reads the main process output` (`e2e3113`)

---

### T2: Guard the result server's stop() on listening

**What**: `stop()` keeps rejecting pending registrations and closing their transports first, then resolves without calling `close()` when `!httpServer.listening`, and otherwise rejects with whatever `close()` reports; `src/main/mcp-result-server.test.ts` gains the RSTP-01, 02, 04 and two RSTP-05 cases (listening and never started), and the bind-failure test drops its `.catch(() => {})` (RSTP-03).
**Where**: `src/main/mcp-result-server.ts` (modify)
**Depends on**: T1
**Reuses**: the `listening` guard in `src/main/activity-hook-server.ts` `stop()`; the `vi.spyOn` + `mockRestore` precedent in `src/main/session-manager.test.ts`
**Requirement**: RSTP-01, RSTP-02, RSTP-03, RSTP-04, RSTP-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The new tests fail before the production change (RSTP-01, 02, 03 red with `ERR_SERVER_NOT_RUNNING`) and pass after it
- [x] RSTP-04's test restores the spy and closes the real listener, so `afterEach`'s `stop()` still resolves
- [x] RSTP-05's never-started case proves the guard sits after the registration loop
- [x] Gate check passes: `npm test` - 1668 tests (1663 + 5 new; no silent deletions)

**Result (2026-09-27)**: before the fix, 5 of 16 tests in the file failed with `ERR_SERVER_NOT_RUNNING`: RSTP-01, RSTP-02, RSTP-03 (the bind-failure test), and both RSTP-05 cases, the listening one through `afterEach`'s `stop()` on an already stopped server. RSTP-04 passed before the fix, as it pins behaviour that already held. After the fix 16/16, full suite 1668/1668 in 90 files. Guard placement checked by mutation: moving the guard above the registration loop times out the never-started RSTP-05 case at 30 s; the mutant ran on the real file from an `.orig` copy restored in `finally`.

Test adequacy (Check A, sufficient):

| Criterion | `file:line` + assertion | Spec outcome | Covered? |
| --- | --- | --- | --- |
| RSTP-01 never started | `src/main/mcp-result-server.test.ts:174` - `await expect(idle.stop()).resolves.toBeUndefined()` | resolves | Yes |
| RSTP-02 second stop | `src/main/mcp-result-server.test.ts:179` - `await expect(server.stop()).resolves.toBeUndefined()` (after `:178`) | resolves | Yes |
| RSTP-03 after failed bind | `src/main/mcp-result-server.test.ts:149` - `await expect(second.stop()).resolves.toBeUndefined()` | resolves | Yes |
| RSTP-04 close error | `src/main/mcp-result-server.test.ts:192` - `await expect(server.stop()).rejects.toBe(failure)` | rejects with that same error | Yes |
| RSTP-05 pending, listening | `src/main/mcp-result-server.test.ts:201` - `expect(pending).rejects.toThrow('server stopped before emit_result')` | that message | Yes |
| RSTP-05 pending, never started | `src/main/mcp-result-server.test.ts:209` - `expect(pending).rejects.toThrow('server stopped before emit_result')` | that message | Yes |
| Edge: second stop while closing | covered by the guard's condition; `listening` is `false` right after `close()` (measured, spec table) | resolves | Yes, via RSTP-02 |

Check B: every assertion targets the resolved value or the rejection itself; RSTP-04 asserts identity (`toBe`), not a message match. Check C: all six assertions map to RSTP-01..05, none speculative. Check D: `.specs/codebase/TESTING.md` - real loopback listener, no `vi.mock`; the one spy is restored in `finally`, as in `session-manager.test.ts`. Verdict: covered, outcomes match the spec, nothing shallow or unclaimed.

**Tests**: unit
**Gate**: full

**Commit**: `fix(workflows): resolve the result server stop() when not listening` (`abaa9b3`)

---

### T3: Log stop() failures in both quit handlers

**What**: in `src/main/index.ts`, `will-quit` calls `resultServer.stop().catch((err) => console.error('[mcp-result-server] stop failed', err))` and `window-all-closed` calls `stopHookServer?.().catch((err) => console.error('[activity-hooks] stop failed', err))`, replacing the two `void` calls; then the quit smoke runs on the fixed build.
**Where**: `src/main/index.ts` (modify)
**Depends on**: T2
**Reuses**: the `[notifications]` `.catch` in the `onActivityChange` wiring of `src/main/index.ts`
**Requirement**: RSTP-06, RSTP-07, RSTP-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both handlers attach the catch with the named prefix; no `void` stop call remains in `index.ts`
- [x] `npx electron-vite build && node scripts/smoke-quit.mjs` PASSES on the fixed build (exit 0, no `ERR_SERVER_NOT_RUNNING`, no `UnhandledPromiseRejection`)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` - 1668 tests (no silent deletions)

**Result (2026-09-27)**: `src/main/index.ts:682` `resultServer.stop().catch((err) => console.error('[mcp-result-server] stop failed', err))` and `src/main/index.ts:716` `stopHookServer?.().catch((err) => console.error('[activity-hooks] stop failed', err))`; `grep -c "void .*stop()"` on the file gives 0. On the fixed build the smoke passes 5/5: output captured (`DevTools listening`), exit 0, no `ERR_SERVER_NOT_RUNNING`, no unhandled rejection. Gate: typecheck 0, lint 0 errors / 18 warnings (baseline), 1668/1668 tests. RSTP-07/08 have no automated check: a genuine close failure cannot be produced in the built app, so they rest on the two lines above (TESTING.md: `index.ts` wiring is hand-verified).

**Tests**: none
**Gate**: build

**Commit**: `fix(main): log a failed server stop at quit instead of dropping it` (`29ba5d3`)

---

## Phase Execution Map

```
Phase 1:  T1 ------→ T2 ------→ T3
```

Execution is strictly sequential. Three tasks fit one batch, so Execute runs inline; the Verifier runs after T3.
