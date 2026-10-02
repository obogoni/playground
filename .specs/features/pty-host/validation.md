# PTY Host Validation

**Date**: 2026-10-02
**Spec**: `.specs/features/pty-host/spec.md` (PTYH-01..28; PTYH-03/04 as amended 2026-10-02)
**Diff range**: `main...HEAD` = `68d474d`..`f4e3cf7` (18 commits, branch `feature/pty-host`)
**Verifier**: independent sub-agent (author ≠ verifier)

## Validation: pty-host - PASS ✅

Every PTYH AC has evidence. Main-process logic ACs are pinned by unit tests on the spec-defined
values; OS/Electron-boundary ACs (PTYH-01, -02, -20, -21, -23 render, quit wiring) are
hand-verified per `.specs/codebase/TESTING.md` and backed by the recorded packaged smoke
(design.md §Packaged Validation, `scripts/smoke-pty-host.mjs`, 39/39). 10/10 sensor mutants were
killed. Four minor gaps are flagged below; none blocks the feature.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T8 | ✅ Done | - |
| T9 | ✅ Done | Dev-app box (`tasks.md:336`) left unchecked; superseded by T14's packaged run |
| T10, T11, T13, T15, T16 | ✅ Done | T10 carries a SPEC_DEVIATION vs design (`session-manager.ts:126-129`, `#generation` instead of `#disposed`); spec behaviour unchanged |
| T12 | ✅ Done | Visual notice box (`tasks.md:420`) left unchecked; payload verified, canvas render is an owner check |
| T14 | ✅ Done | Ran on `build:unpack` (asar-packed), not the `build:win` installer |

---

## Spec-Anchored Acceptance Criteria

Legend: **Unit** = covered by a unit assertion. **Hand** = OS/Electron boundary, hand-verified
(code + packaged smoke), not counted as unit coverage.

| AC | Spec-defined outcome | Evidence (`file:line` - assertion) | Result |
| -- | -------------------- | ---------------------------------- | ------ |
| PTYH-01 | node-pty only in the host; main never loads it | Hand: `src/main/pty-host.ts:1` is the only `from 'node-pty'` under `src/` (grep re-run); `src/main/index.ts:322` wires `PtyHostClient` + `forkPtyHost`; `src/main/pty-port.ts:18-20` is now an interface. Smoke: 0.0 ms in node-pty frames in main's CPU profile | ✅ Hand |
| PTYH-02 | No main busy stretch > 50 ms attributable to PTY creation (packaged CPU profile) | Hand: design.md §Packaged Validation - node-pty frames 0.0 ms for spawn/respawn/duplicate; longest stretches 64.9/42.0/55.7 ms, hottest frame `git rev-parse` from the time tracker (#151 scope, excluded by spec Goals) | ✅ Hand (see gap 4) |
| PTYH-03 | Input to another running session is forwarded while a spawn is pending | `src/main/session-manager.test.ts:579` - `expect(port.handles[0].writes).toEqual(['typed while starting'])` with the spawn held open (`:580` `deferred.calls === 1`) | ✅ Unit |
| PTYH-04 | Attached session output emitted on `session:data` while a spawn is pending | `src/main/session-manager.test.ts:595` - `expect(data.at(-1)?.payload).toEqual({ id: running.id, data: 'output while starting' })` | ✅ Unit |
| PTYH-05 | Two in-flight spawns both resolve, each with its own handle | `src/main/pty-host-client.test.ts:119-126` - acks out of order, `Promise.all` resolves, writes go to `ptyId: id1` / `id2` respectively | ✅ Unit |
| PTYH-06 | `onData` receives output in PTY emit order | `src/main/pty-host-core.test.ts:124-130` - posted `data`/`exit` sequence equals emit order per ptyId; `src/main/pty-host-client.test.ts:199` - `['data:a','data:b','exit:130']`; `:170` buffered order on late registration | ✅ Unit |
| PTYH-07 | `onExit` with the PTY's exit code, after every earlier chunk | `src/main/pty-host-client.test.ts:186` - `['data:last words','exit:0']` even when `onExit` registered first (`:184` `[]`); `:199` exit code `130` passed through | ✅ Unit |
| PTYH-08 | `write`/`resize`/`kill` forwarded to that handle's PTY, in call order | `src/main/pty-host-client.test.ts:224-229` - posted `write, resize, write, kill` in call order with the handle's ptyId; `src/main/pty-host-core.test.ts:143-147` - routed to the matching PTY only | ✅ Unit |
| PTYH-09 | Same file/args/cwd, `xterm-256color`, env via `buildPtyEnv` incl. token + task URL | `src/main/pty-host-core.test.ts:92-99` - `opts` `toEqual({ name: 'xterm-256color', cwd, env, useConpty: true })`; `src/main/pty-host-client.test.ts:86-99` - posted env equals `buildPtyEnv` output of `process.env` + override (`TERM` forced to `xterm-256color`); token/task URL reach `port.spawn` env: `src/main/session-manager.test.ts:1025`, `:1037` | ✅ Unit |
| PTYH-10 | Attach replays scrollback then live output on one `session:data` channel | `src/main/session-manager.test.ts:304` - first `session:data` = `'past output\n'`; `:307` - then `'live'` | ✅ Unit |
| PTYH-11 | Calls on an exited handle are dropped without throwing | `src/main/pty-host-client.test.ts:239-244` - `not.toThrow()` and `posted` length unchanged; `:313` after a host crash; `src/main/pty-host-core.test.ts:171-178` host side | ✅ Unit |
| PTYH-12 | SessionManager suite passes; changes only for async `spawn` or new PTYH tests | `git diff main...HEAD -- src/main/session-manager.test.ts`: removed `expect` lines are only `toThrow` → `rejects.toThrow` (e.g. `src/main/session-manager.test.ts:204`); fake port returns a Promise (`:66-71`); 86 → 97 tests, all pass | ✅ Unit |
| PTYH-13 | Invoke rejects with the host's error message | `src/main/pty-host-client.test.ts:139` - `rejects.toThrow('Cannot create process, error code: 267')`; `src/main/session-manager.test.ts:506`, `:517`, `:529` - spawn/duplicate/respawn reject with `HOST_ERROR`; handlers return the promise: `src/main/index.ts:699-711` (Hand) | ✅ Unit + Hand |
| PTYH-14 | Nothing persisted; respawned session stays `stopped` | `src/main/session-manager.test.ts:508-509` - `sessions` `[]`; `:519` - only the source id; `:531-533` - status `'stopped'` in list and config, no `session:status` emitted | ✅ Unit |
| PTYH-15 | Log `Failed to spawn PTY: file=… args=… cwd=…` with the error | `src/main/pty-host-client.test.ts:141-144` - line `toBe('Failed to spawn PTY: file=pwsh.exe args=["-NoExit","-Command","claude"] cwd=C:\\repo')` and logged error message equals the host message (conjunction: all three fields + error asserted) | ✅ Unit |
| PTYH-16 | Revoke the token registered for a failed spawn | `src/main/session-manager.test.ts:567-568` - `revoked` `toEqual([registered[0].token])` | ✅ Unit |
| PTYH-17 | Quit / last window: kill every PTY and finalize each running session `stopped` | `src/main/session-manager.test.ts:487-489` - every handle killed, list and config `stopped`; `:337-339`; host side `src/main/pty-host-core.test.ts:189` - every live PTY killed once. Wiring: `src/main/index.ts:303`, `:845` (Hand); smoke "no marked shell/agent process left after quit" | ✅ Unit + Hand |
| PTYH-18 | Host finishes killing every PTY; host terminated within 3 s | `src/main/pty-host-client.test.ts:456-460` - `kill()` count 0 at 2999 ms, 1 at 3000 ms; `:443` no kill when host exits; `src/main/pty-host-core.test.ts:247-250` - host exits 0 at exactly 2500 ms (< 3000); `:190-194` waits for the last killed PTY. The 3000 literal passed in production is `src/main/index.ts:275` (Hand, see gap 3) | ✅ Unit + Hand |
| PTYH-19 | Quit during an in-flight spawn leaves no process | `src/main/session-manager.test.ts:625-627`, `:641-643` - late handle `killed === true`, nothing running/persisted; `src/main/pty-host-core.test.ts:228-231` - killAll waits for a just-spawned PTY's exit; `src/main/pty-host-client.test.ts:423-427` - `killAll` posted after every earlier message. Smoke run 2: 10/10 with no process left | ✅ Unit + Hand |
| PTYH-20 | Packaged build: host loads node-pty, session starts | Hand: smoke "spawn resolves a running session" (`scripts/smoke-pty-host.mjs:151`) on `dist/win-unpacked/playground.exe` | ✅ Hand (see gap 4) |
| PTYH-21 | Build includes the host entry | Hand: `src/main/pty-host-fork.ts:5` (`?modulePath` import), forked at `:15`; tasks.md T8 records `out/main/pty-host-<hash>.js`; smoke ran the packaged app | ✅ Hand |
| PTYH-22 | Host exit (not quitting) finalizes every running session `stopped` | `src/main/pty-host-client.test.ts:260-261` - each live handle gets exactly `[{ exitCode: -1, hostExited: true }]`; `src/main/session-manager.test.ts:657-659` - session `stopped` in list and config, `session:exit` `{ id, exitCode: -1, hostExited: true }`; `src/main/pty-host-client.test.ts:474-475` - not on a shutdown exit | ✅ Unit |
| PTYH-23 | Each affected terminal prints `[PTY host exited unexpectedly]` | Payload: `src/main/session-manager.test.ts:659`, `:669` (normal exit carries no `hostExited`). Render: `src/renderer/src/components/TerminalPane.tsx:455-456` writes `[PTY host exited unexpectedly]` when `payload.hostExited` (Hand); smoke `scripts/smoke-pty-host.mjs:240` asserts the payload for both sessions. Canvas rendering not observed | ✅ Unit (payload) + Hand (render) |
| PTYH-24 | Spawn after a host exit starts a new host and spawns in it | `src/main/pty-host-client.test.ts:321-328` - 1 transport after the crash, 2 after the next spawn, spawn posted to `transports[1]` resolves, `alive` true; smoke `:249` | ✅ Unit |
| PTYH-25 | No automatic respawn after a host exit | `src/main/pty-host-client.test.ts:337-338` - still 1 transport, still 2 spawn messages | ✅ Unit |
| PTYH-26 | A spawn in flight when the host exits rejects | `src/main/pty-host-client.test.ts:292` - `rejects.toThrow('PTY host exited unexpectedly')` | ✅ Unit |
| PTYH-27 | Log the host's exit reason and exit code | `src/main/pty-host-client.test.ts:300` - logs `toEqual(['[pty-host] exited unexpectedly (code 3221225477)'])` | ⚠️ Spec-precision gap (gap 1): "exit reason" is undefined; the code is asserted |
| PTYH-28 | A respawn while the PTY is still being created creates no second PTY | `src/main/session-manager.test.ts:611-613` - `deferred.calls` `1`, handles `2`, status `running` | ✅ Unit |

**Status**: ✅ All 28 ACs have evidence (21 unit-covered, 7 with a hand-verified share); ⚠️ 1 spec-precision gap flagged.

---

## Edge Cases

- [ ] Resize with zero/negative dims dropped before the host: guard at `src/main/session-manager.ts:338` (unchanged by this feature) - **no test pins it** (gap 2; `src/main/session-manager.test.ts:326` only covers a positive resize).
- [x] `stop` still waits for the real exit, up to `SESSION_EXIT_WAIT_MS`: `src/main/session-manager.test.ts:451-455` (not settled before the exit event), `:460` `SESSION_EXIT_WAIT_MS` `toBe(3000)`, `:470-474` resolves at 3000 ms.
- [x] Host stderr forwarded to main's log with `[pty-host]` prefix: Hand - `src/main/pty-host-fork.ts:19-20`, `:32-34` (stdout and stderr, `console.error(\`[pty-host] ${line}\`)`). No unit test by convention (Electron adapter).

---

## Discrimination Sensor

Scratch: `git worktree add --detach M:\obogoni\verify-scratch HEAD` + `node_modules` junction.
Real-tree `git status --porcelain` before: empty; after cleanup: empty. Junction removed first
(`rmdir`), `node_modules\node-pty\lib` confirmed present, then worktree removed.

| # | File:line | Mutation | Killed? | Killing tests |
| - | --------- | -------- | ------- | ------------- |
| M1 | `src/main/pty-host-core.ts:105` | `killAll` exits at once (`setTimeout(exitOnce, 2500)` → `exitOnce()`) | ✅ Killed | 4 in `pty-host-core.test.ts` (`:181`, `:204`, `:223`, `:242`) |
| M2 | `src/main/pty-host-client.ts:225` | Early `data` dropped instead of buffered | ✅ Killed | 3 in `pty-host-client.test.ts` (`:157`, `:173`, `:264`) |
| M3 | `src/main/pty-host-client.ts:150` | Crash finalize without `hostExited` | ✅ Killed | `pty-host-client.test.ts:249`, `:264` |
| M4 | `src/main/session-manager.ts:170-171` | Persist before the awaited `#start` | ✅ Killed | `session-manager.test.ts:502`, `:616` |
| M5 | `src/main/session-manager.ts:388` | Token not revoked on spawn rejection | ✅ Killed | `session-manager.test.ts:561` |
| M6 | `src/main/session-manager.ts:263` | Respawn dedupe (`#starting.has`) removed | ✅ Killed | `session-manager.test.ts:600` (fails by 30 s test timeout: the second deferred spawn never resolves) |
| M7 | `src/main/pty-host-client.ts:102` | Shutdown deadline `timeoutMs` → `timeoutMs + 1000` | ✅ Killed | `pty-host-client.test.ts:447` |
| M8 | `src/main/session-manager.ts:393` | Post-`killAll` generation check disabled | ✅ Killed | `session-manager.test.ts:616`, `:630` |
| M9 | `src/main/session-manager.ts:470` | `session:exit` drops `hostExited` | ✅ Killed | `session-manager.test.ts:651` |
| M10 | `src/main/pty-host-client.ts:175` | #89 log line loses `cwd=` | ✅ Killed | `pty-host-client.test.ts:129` |

**Sensor depth**: expanded (≥5; quit/orphan path is data-integrity-adjacent)
**Result**: 10/10 killed - PASS ✅

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ host core 110 lines, client 234, thin adapters |
| Surgical changes | ✅ SessionManager changes confined to async spawn, `#starting`, `#generation`, `hostExited` |
| No scope creep | ✅ no fallback, no auto-respawn, ring buffer stays in main (spec Out of Scope honoured) |
| Matches patterns | ✅ hand-rolled fakes, no `vi.mock` (TESTING.md) |
| Spec-anchored outcome check | ✅ literals asserted: `-1`, `hostExited: true`, 3000 ms, 2500 ms, `xterm-256color`, `useConpty: true`, both log strings |
| Per-layer coverage expectation | ⚠️ resize edge case unpinned (gap 2) |
| Every test maps to a requirement | ✅ extra tests (fork-retry, ghost messages from a dead host, start()) map to the spec's crash/start-time assumptions |
| Documented guidelines | ✅ `.specs/codebase/TESTING.md`, lessons L-005, L-009 |
| Lint on feature files | ✅ `npx eslint` on the touched files: 0 problems |

---

## Gate Check

- **Typecheck**: `npm run typecheck` - exit 0.
- **Lint**: `npm run lint` - 0 errors, 18 warnings (pre-existing; none in the feature's files).
- **Feature suites**: `npx vitest run src/main/pty-host-core.test.ts src/main/pty-host-client.test.ts src/main/session-manager.test.ts` - 3 files, 140 passed, 0 failed (core 12, client 31, session-manager 97).
- **Full suite** (`npm test`): 2498 passed, 9 failed of 2507 (119 files). All 9 are in the known-noise real-git/real-process suites (commit-log, file-discard, git-sync, hook-shell, time-snapshot, worktree-manager): 5 test timeouts at 30 s plus 4 git-state assertions under load. None of these files is in the diff. A re-run of only those 6 files gave a different set (5 failed of 188; hook-shell, time-snapshot and commit-log passed, a new worktree-manager case failed), which matches the documented load flakiness. No failure in any pty-host or session-manager suite.
- **Test count**: session-manager 86 → 97 (tasks.md T9/T10/T11/T16); two new files (+43). No test deleted; converted assertions are `toThrow` → `rejects.toThrow` only.
- **Skipped tests**: none in scope.

---

## Ranked Gaps (non-blocking)

1. **Spec-precision gap, PTYH-27**: the AC asks for the host's "exit reason and exit code"; Electron's `utilityProcess` `exit` event carries only a code, and the log line has only the code (`src/main/pty-host-client.ts:142`, asserted at `src/main/pty-host-client.test.ts:300`). Fix: amend PTYH-27 to "exit code" (or define "reason").
2. **Edge case unpinned**: zero/negative resize drop (`src/main/session-manager.ts:338`) has no test. Pre-existing code outside the diff, but the spec lists it. Fix task: add `manager.resize(id, 0, 24)` / `(id, 80, -1)` → `handles[0].resizes` `toEqual([])`.
3. **Production 3000 ms bound lives in hand-verified wiring**: tests pass `3000` to `shutdown()` directly, so `PTY_HOST_SHUTDOWN_MS` (`src/main/index.ts:275`) is not pinned (L-009 shape). Acceptable under the TESTING.md wiring convention; noted only.
4. **Packaged evidence nuances**: PTYH-20 ran on `build:unpack`, not the `build:win` installer (same asar packaging, per tasks.md T14); PTYH-02's 50 ms bound holds only for PTY creation (0.0 ms) - total stretches reach 64.9 ms from #151's `git rev-parse`, which the spec Goals exclude. Owner checks remaining: the canvas-drawn `[PTY host exited unexpectedly]` line and a run with real Claude Code agents.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| PTYH-01..28 | Implementing / Pending | ✅ Verified (PTYH-27 with spec-precision note; PTYH-02/20 hand-verified on the packaged smoke) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 28/28 ACs evidenced; 1 spec-precision gap (PTYH-27); 1 edge case unpinned
**Sensor**: 10/10 mutations killed
**Gate**: typecheck 0, lint 0 errors, 140/140 feature tests

**Lessons recorded**: L-098 (spec_precision_gap), L-099 (ac_gap), L-100 (spec_deviation), all candidates.

**Next steps**: amend PTYH-27's wording; add the resize-drop test as a small follow-up.

---

## Gaps resolved after the report

- Gap 1 (PTYH-27 "exit reason"): spec now states the logged line and the exit code only (`abb64a9`).
- Gap 2 (resize edge case untested): `session-manager.test.ts` "drops a resize with a zero or negative dimension before it reaches the PTY" (`cc890a8`); 98 session-manager tests pass.
- Gaps 3–4 stay as noted: the `index.ts` constant is hand-verified wiring, and the packaged evidence is `build:unpack` plus the owner checks.
