## Validation: result-server-stop — PASS

**Date**: 2026-09-27
**Spec**: `.specs/features/result-server-stop/spec.md`
**Diff range**: `c31bb9a..29ba5d3` (5bed119 plan, e2e3113 T1, abaa9b3 T2, 29ba5d3 T3)
**Verifier**: independent sub-agent (author ≠ verifier); every AC re-derived from the spec, not from the task notes

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | `scripts/smoke-quit.mjs` added; its falsification against the unfixed code was re-derived here (sensor S2) |
| T2 | ✅ Done | Guard at `src/main/mcp-result-server.ts:195`, after the registration loop (`:183-191`); 5 new tests plus the RSTP-03 rewrite |
| T3 | ✅ Done | `src/main/index.ts:682` and `src/main/index.ts:716`; no `void …stop()` left in the file |

Cosmetic only: the commit subjects in `tasks.md` for T2 and T3 differ in wording from the real commits (`abaa9b3`, `29ba5d3`). Nothing depends on them.

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Outcome |
| ------------------------- | -------------------- | ----------------------- | ------- |
| RSTP-01: `stop()` on a never-started server | the promise resolves | `src/main/mcp-result-server.test.ts:174` - `await expect(idle.stop()).resolves.toBeUndefined()` | ✅ PASS |
| RSTP-02: `stop()` again after a resolved `stop()` | the promise resolves | `src/main/mcp-result-server.test.ts:178-179` - two sequential `await expect(server.stop()).resolves.toBeUndefined()` | ✅ PASS |
| RSTP-03: `stop()` after `start()` rejected on a bound port | the promise resolves | `src/main/mcp-result-server.test.ts:147` - `rejects.toThrow()` on `start(port)`, then `:149` - `await expect(second.stop()).resolves.toBeUndefined()` (the old `.catch(() => {})` is gone) | ✅ PASS |
| RSTP-04: closing the listening server reports an error | `stop()` rejects with that same error | `src/main/mcp-result-server.test.ts:184-192` - `vi.spyOn(HttpServer.prototype, 'close')` calls back with `failure`; `await expect(server.stop()).rejects.toBe(failure)` (identity, not a message match); spy restored at `:195` | ✅ PASS |
| RSTP-05: pending `emit_result` registration when `stop()` runs, listening or not | that registration rejects with "server stopped before emit_result" | listening: `src/main/mcp-result-server.test.ts:201` - `expect(pending).rejects.toThrow('server stopped before emit_result')`; never started: `src/main/mcp-result-server.test.ts:209` - same assertion on an `idle` server | ✅ PASS |
| RSTP-06: the built app quits by closing its only window, no agent step run | output has neither `ERR_SERVER_NOT_RUNNING` nor `UnhandledPromiseRejection`; exit code 0 | `scripts/smoke-quit.mjs:127` - `code === 0`; `:128` - no `/.*ERR_SERVER_NOT_RUNNING.*/` match; `:129` - no `/.*UnhandledPromiseRejection.*/` match; guarded against an empty capture by `:125` (`DevTools listening`). Run by the Verifier on a fresh `npx electron-vite build` of HEAD: 5/5, exit 0 (twice) | ✅ PASS |
| RSTP-07: result server `stop()` rejects in `will-quit` | `console.error` under the prefix `[mcp-result-server]` | code: `src/main/index.ts:681-683` - `resultServer.stop().catch((err) => console.error('[mcp-result-server] stop failed', err))`. Runtime probe S1 (below): with the guard removed in a rebuilt `out/`, the real quit printed `[mcp-result-server] stop failed Error [ERR_SERVER_NOT_RUNNING]: Server is not running.` and no unhandled rejection | ✅ PASS (hand-verified + probe) |
| RSTP-08: activity hook server `stop()` rejects in `window-all-closed` | `console.error` under the prefix `[activity-hooks]` | code: `src/main/index.ts:716` - `stopHookServer?.().catch((err) => console.error('[activity-hooks] stop failed', err))`. Runtime probe P1 (below): with `src/main/activity-hook-server.ts:145` `stop()` made to reject in a rebuilt `out/`, the real quit printed `[activity-hooks] stop failed Error: verifier probe: close failed`, no unhandled rejection, exit 0 | ✅ PASS (hand-verified + probe) |

**Status**: ✅ All 8 ACs covered; 0 spec-precision gaps (every AC names an exact value, message, prefix or exit code, and each assertion targets it).

**On RSTP-07/08 evidence.** They have no automated test, by design. `.specs/codebase/TESTING.md:43` and `:67` classify the `index.ts` wiring as a thin Electron shell, "hand-verified", checked by `npm run typecheck`. The Verifier judges that acceptable here, for three reasons:
- each handler is a single `.catch` whose logged prefix is literally the one the spec names;
- the optional chain at `:716` short-circuits the whole call, so a `null` `stopHookServer` cannot throw;
- two throwaway runtime probes against the built app (S1, P1) showed that each prefix reaches the main process output when its `stop()` rejects.

The probes are not committed, so a future regression of these two lines would only be caught by review, as TESTING.md intends for this layer.

---

## Discrimination Sensor

Unit mutants ran in a throwaway `git worktree` of HEAD under the scratchpad, with a junction to the real `node_modules`. The command was `npx vitest run src/main/mcp-result-server.test.ts --testTimeout=8000`. The unmutated scratch baseline was 16/16. Smoke mutants and probes ran on the real tree through `.orig` copies restored in `finally`, each with `npx electron-vite build` re-run first; `out/` was rebuilt from the clean tree at the end. Every anchor matched exactly once.

| Mutation | File:line | Description | Killed? | What failed (and only that) |
| -------- | --------- | ----------- | ------- | --------------------------- |
| M1 | `src/main/mcp-result-server.ts:195` | Guard removed | ✅ Killed | 5/16: RSTP-01, RSTP-02, RSTP-03 (bind-failure test), both RSTP-05 cases (the listening one through `afterEach`'s second `stop()`); all with `ERR_SERVER_NOT_RUNNING` |
| M2 | `src/main/mcp-result-server.ts:183` | Guard moved above the registration-rejection loop | ✅ Killed | 1/16: RSTP-05 never-started case, timed out (8 s) because the pending registration is never rejected |
| M3 | `src/main/mcp-result-server.ts:195` | Guard inverted (`if (httpServer.listening) return`) | ✅ Killed | 4/16: RSTP-01, RSTP-03, RSTP-04, RSTP-05 never-started |
| M4 | `src/main/mcp-result-server.ts:195` | Guard replaced by an unconditional `return` (close never called) | ✅ Killed | 1/16: RSTP-04 |
| M5 | `src/main/mcp-result-server.ts:197` | `reject(err)` replaced by `resolve()` | ✅ Killed | 1/16: RSTP-04 |
| S1 | `src/main/mcp-result-server.ts:195` (built app) | Guard removed, T3 catch kept | ✅ Killed | smoke 4/5, exit 1: check 4 (`ERR_SERVER_NOT_RUNNING`); check 5 still PASS because the T3 catch logs it (the RSTP-07 probe) |
| S2 | `src/main/mcp-result-server.ts:195` + `src/main/index.ts:682` (built app) | Guard removed and `void resultServer.stop()` restored (the unfixed code) | ✅ Killed | smoke 3/5, exit 1: checks 4 and 5 (`UnhandledPromiseRejectionWarning: Error [ERR_SERVER_NOT_RUNNING]`). This re-derives T1's falsification |
| P1 (probe, not a mutant) | `src/main/activity-hook-server.ts:145` (built app) | Hook server `stop()` rejects with a probe error | n/a | smoke 5/5, exit 0; output `[activity-hooks] stop failed Error: verifier probe: close failed` (the RSTP-08 probe) |

The earlier author check (guard above the loop times out the never-started RSTP-05 case) was re-derived independently as M2 and holds.

**Sensor depth**: lightweight (not a P0 path), with 7 mutants instead of the 1-3 minimum, because the fix is a single guard.
**Sensor outcome**: 7/7 killed - PASS ✅

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ One 1-line guard plus comment; two 1-line handler changes |
| Surgical changes | ✅ `activity-hook-server.ts` untouched (Out of Scope honoured); only the two quit handlers changed in `index.ts` |
| No scope creep | ✅ No eager start, no `ConfigStore` change |
| Matches patterns | ✅ Guard mirrors `src/main/activity-hook-server.ts:152`; catch shape mirrors `src/main/index.ts:559` (`[notifications]`) |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met (DI module 1:1 to RSTP-01..05; shell hand-verified; smoke falsified) | ✅ |
| Every test maps to a spec requirement - no unclaimed tests | ✅ The five new tests and the RSTP-03 rewrite each name their AC |
| Documented guidelines followed: `.specs/codebase/TESTING.md` | ✅ Real loopback listener, no `vi.mock`; the single `vi.spyOn` is restored in `finally`, with precedent at `src/main/session-manager.test.ts:856-864` |
| Formatting | ✅ `prettier --check` clean on all four changed files; the 18 lint warnings are all in files outside the diff |

Smoke notes:
- `scripts/smoke-quit.mjs` defaults to CDP port 9333, not the 9222 of the other smokes. This is deliberate: it spawns its own app and must not collide with a running dev app.
- It uses a `mkdtemp` user data dir (`:65`, `:73`), deleted in `finally` (`:114`).
- It uses `taskkill` as a Windows-only fallback (`:110`), which matches the repo's Windows-run smokes.
- After the Verifier's runs, there was no `quit-smoke-*` dir under `%TEMP%` and no `electron.exe` process.

---

## Edge Cases

- [x] Second `stop()` while the first is still closing: handled by the same `listening` guard. Re-measured on Node v24.19.0: `listening` is `false` right after the first `close()`, and a second `close()` reports `ERR_SERVER_NOT_RUNNING`, so the guard's condition covers it. No dedicated concurrent-stop test exists; the spec assigns it to RSTP-02's guard. This is not a gap, because the guard reads the same `listening` flag in both cases.
- [x] `start()` never ran but a registration exists: `src/main/mcp-result-server.test.ts:206-212` (RSTP-05 never started), and M2 proves the test pins the guard's position.

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`
- **Typecheck**: exit 0
- **Lint**: exit 0, 0 errors / 18 prettier warnings (baseline; none in changed files)
- **Tests**: 1668 passed, 0 failed, 0 skipped, in 90 files
- **Test count before feature**: 1663 (90 files)
- **Test count after feature**: 1668 (90 files)
- **Delta**: +5 new tests (RSTP-01, RSTP-02, RSTP-04, RSTP-05 ×2); RSTP-03 strengthened an existing test in place, so no deletion
- **Quit smoke**: `npx electron-vite build && node scripts/smoke-quit.mjs`, 5/5, exit 0
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

None. No gaps, no surviving mutants, no spec-precision gaps.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| RSTP-01 | Implementing | ✅ Verified |
| RSTP-02 | Implementing | ✅ Verified |
| RSTP-03 | Implementing | ✅ Verified |
| RSTP-04 | Implementing | ✅ Verified |
| RSTP-05 | Implementing | ✅ Verified |
| RSTP-06 | Implementing | ✅ Verified |
| RSTP-07 | Implementing | ✅ Verified (hand-verified wiring + runtime probe S1) |
| RSTP-08 | Implementing | ✅ Verified (hand-verified wiring + runtime probe P1) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 8/8 ACs matched the spec outcome; 0 spec-precision gaps
**Sensor**: 7/7 mutations killed (plus one RSTP-08 probe)
**Gate**: 1668 passed, typecheck 0, lint 0 errors

**What works**:
- A never-started, already-stopped or failed-bind result server stops cleanly.
- A genuine close error still propagates by identity.
- Pending registrations are rejected before the guard.
- The built app quits with exit 0 and a clean log.
- Both quit handlers log a failed stop under their named prefix instead of leaving it unhandled.

**Issues found**: none.

**Next steps**: open the PR for issue #91.
