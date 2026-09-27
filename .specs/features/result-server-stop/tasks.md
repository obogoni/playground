# Result Server Stop Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/result-server-stop/spec.md`
**Design**: none - no architectural decision; the guard copies the activity hook server's.
**Status**: Draft
**Branch**: `feature/result-server-stop` (cut from `main` = `origin/main` `c31bb9a`)
**Test baseline**: measured green on `main` content on 2026-09-27 - 1663 tests / 90 files, `typecheck` and `lint` exit 0 (18 prettier warnings, 0 errors). Re-measure on the branch before T1.

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

- [ ] Run against the **unfixed** build, the script FAILS and its output shows `ERR_SERVER_NOT_RUNNING` (falsification recorded in this task with the exit code and the matched line)
- [ ] **Stop rule:** if the unfixed build quits clean, stop and report to the owner - the check cannot discriminate and RSTP-06 needs another proof
- [ ] The script never touches `%APPDATA%\playground` (the user data dir is the temp dir) and leaves no electron process behind
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` - 1663 tests (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `test(quit): add a smoke that quits the built app and reads the main process output`

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

- [ ] The new tests fail before the production change (RSTP-01, 02, 03 red with `ERR_SERVER_NOT_RUNNING`) and pass after it
- [ ] RSTP-04's test restores the spy and closes the real listener, so `afterEach`'s `stop()` still resolves
- [ ] RSTP-05's never-started case proves the guard sits after the registration loop
- [ ] Gate check passes: `npm test` - 1668 tests (1663 + 5 new; no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `fix(workflows): resolve the result server's stop() when it is not listening`

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

- [ ] Both handlers attach the catch with the named prefix; no `void` stop call remains in `index.ts`
- [ ] `npx electron-vite build && node scripts/smoke-quit.mjs` PASSES on the fixed build (exit 0, no `ERR_SERVER_NOT_RUNNING`, no `UnhandledPromiseRejection`)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` - 1668 tests (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `fix(main): log a failed server stop at quit instead of leaving it unhandled`

---

## Phase Execution Map

```
Phase 1:  T1 ------→ T2 ------→ T3
```

Execution is strictly sequential. Three tasks fit one batch, so Execute runs inline; the Verifier runs after T3.
