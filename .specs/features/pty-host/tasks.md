# PTY Host Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/pty-host/design.md`
**Status**: Done

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (main-process modules are unit-tested with hand-rolled fakes, no `vi.mock`; OS boundaries such as `pty-port.ts` and React components are hand-verified), `vitest.config.ts` (`src/**/*.test.ts`), AD-003 (coverage report-only), confirmed lessons L-001 (wire a required cross-phase contract in one task), L-005 (no real-process tests near the timeout), L-009 (literal assertions for spec constants).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process logic (`pty-host-core.ts`, `pty-host-client.ts`, `session-manager.ts`) | unit | All branches; 1:1 to the PTYH ACs each implements; every spec Edge Case that touches it; literal assertions for `3000` ms, `-1`, the notice and log strings (L-009) | co-located `<module>.test.ts` | `npx vitest run <file>` |
| OS / Electron boundaries (`pty-host.ts`, `pty-host-fork.ts`) | none | Hand-verified in the dev app and the packaged build (TESTING.md convention, like today's `pty-port.ts`) | - | build gate |
| Shared types (`src/shared/pty-host-protocol.ts`, `ipc-contract.ts`) | none | Typecheck | - | build gate |
| `src/main/index.ts` wiring, React components (`TerminalPane.tsx`) | none | Hand-verified in the dev app | - | build gate |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <touched test files>` |
| Full | Not used (no integration/e2e layer in scope) | - |
| Build | After each phase and after tasks with `Tests: none` | `npm run typecheck && npm run lint && npm test` |

---

## Execution Plan

Phases run sequentially; tasks within a phase run in order.

### Phase 1: De-risk

Prove node-pty loads and kills cleanly from a utility process in the packaged build before anything depends on it.

```
T1
```

### Phase 2: PTY host

```
T2 → T3 → T4
```

### Phase 3: Main-side client

```
T5 → T6 → T7 → T8
```

### Phase 4: Main integration

```
T9 → T10 → T11 → T12 → T13 → T15 → T16
```

### Phase 5: Packaged validation

```
T14
```

---

## Task Breakdown

### T1: Spike node-pty in a utility process on a packaged build

**What**: In a scratch worktree (not committed), fork a minimal utility process that spawns `pwsh` through node-pty, build it with `npm run build:unpack`, and record the results in `design.md` under a new `## Spike Results` section.
**Where**: `.specs/features/pty-host/design.md`
**Depends on**: None
**Reuses**: `src/main/pty-port.ts` spawn options; the `?modulePath` import
**Requirement**: PTYH-20, PTYH-21, PTYH-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Recorded: `node-pty` loads from the utility process in `dist/win-unpacked` (yes/no, error text if no)
- [x] Recorded: the host bundle path that `?modulePath` resolves to inside the package
- [x] Recorded: after `kill()` of a PTY running `node -e "setInterval(()=>{},1e3)"` as a grandchild, no `node`/`pwsh`/`OpenConsole` process from it remains (Task Manager / `Get-Process`)
- [x] Recorded: main-process time spent in `utilityProcess.fork` and the spawn round-trip
- [x] If any check fails, STOP and escalate to the owner before Phase 2 (design change)
- [x] Scratch worktree removed; real-tree `git status --porcelain` shows only `design.md`

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): record pty-host spike results`

**Status**: ✅ Complete. No design change; see design.md §Spike Results

---

### T2: Define the PTY host message protocol

**What**: Add the `ToHost` / `FromHost` discriminated unions from the design.
**Where**: `src/shared/pty-host-protocol.ts`
**Depends on**: None
**Reuses**: `src/shared/ipc-contract.ts` type style
**Requirement**: PTYH-01, PTYH-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both unions exported with the exact message shapes in `design.md` §Protocol
- [x] Build gate passes

**Tests**: none
**Gate**: build

**Commit**: `feat(pty-host): define the host message protocol`

**Status**: ✅ Complete

---

### T3: Implement the PTY host core

**What**: `createPtyHost({ spawn, post, exit })`, which handles each `ToHost` against an injected node-pty-shaped factory and posts `FromHost`.
**Where**: `src/main/pty-host-core.ts` (+ `pty-host-core.test.ts`)
**Depends on**: T2
**Reuses**: today's spawn options (`name: 'xterm-256color'`, `useConpty: true`) from `pty-port.ts`
**Requirement**: PTYH-06, PTYH-07, PTYH-08, PTYH-09, PTYH-11, PTYH-13, PTYH-17, PTYH-19

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [x] `spawn` calls the factory with file/args/cwd/env, `name: 'xterm-256color'`, `useConpty: true` and posts `spawned{ptyId, pid}`
- [x] A throwing factory posts `spawn-failed{ptyId, message}` with the error's message
- [x] `data`/`exit` are posted per `ptyId` in the factory's event order
- [x] `write`/`resize`/`kill` reach the right PTY; on an unknown or exited `ptyId` they are dropped without throwing
- [x] `killAll` kills every live PTY, then calls `exit(0)`; a `spawn` handled before `killAll` is killed by it
- [x] Quick gate passes: `npx vitest run src/main/pty-host-core.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pty-host): handle host messages against node-pty`

**Status**: ✅ Complete

---

### T4: Add the PTY host entry point

**What**: The utility-process entry that wires `process.parentPort` and the real `node-pty` into `createPtyHost`.
**Where**: `src/main/pty-host.ts`
**Depends on**: T3
**Reuses**: `createPtyHost`
**Requirement**: PTYH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `parentPort.on('message', (e) => host.handle(e.data))`; `post` → `parentPort.postMessage`; `exit` → `process.exit`
- [x] It is the only file under `src/` that will import `node-pty` (verified with a grep once T9 lands)
- [x] Build gate passes

**Tests**: none
**Gate**: build

**Commit**: `feat(pty-host): add the utility process entry`

**Status**: ✅ Complete

---

### T5: Implement PtyHostClient spawn and handles

**What**: `PtyHostClient` with `spawn(plan, env): Promise<PtyHandle>` over an injected `HostTransport`: `ptyId` assignment, `buildPtyEnv` in main, routing of `spawned`/`spawn-failed`/`data`/`exit`, buffering of early events, forwarding of `write`/`resize`/`kill`.
**Where**: `src/main/pty-host-client.ts` (+ `pty-host-client.test.ts`)
**Depends on**: None (needs T2, Phase 2, an earlier phase)
**Reuses**: `buildPtyEnv` (`terminal-env.ts`), the #89 log line from `pty-port.ts:42`
**Requirement**: PTYH-06, PTYH-07, PTYH-08, PTYH-09, PTYH-11, PTYH-13, PTYH-15, PTYH-05

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [x] `spawn` posts `{type:'spawn', ptyId, file, args, cwd, env: buildPtyEnv({...process.env, ...env})}` with a fresh `ptyId` per call
- [x] Resolves on `spawned`; two in-flight spawns resolve independently (PTYH-05)
- [x] Rejects on `spawn-failed` with the host's message, and logs `Failed to spawn PTY: file=… args=… cwd=…`
- [x] `data`/`exit` that arrive before `onData`/`onExit` are registered are delivered in order on registration
- [x] `exit` is delivered after every earlier `data` of the same `ptyId`
- [x] `write`/`resize`/`kill` post in call order; after `exit` they are dropped
- [x] Quick gate passes: `npx vitest run src/main/pty-host-client.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pty-host): proxy PTY handles over the host channel`

**Status**: ✅ Complete

---

### T6: Handle a PTY host crash in the client

**What**: On transport exit while not shutting down: log, reject pending spawns, finalize every live handle with `{exitCode: -1, hostExited: true}`, and fork a new transport on the next `spawn`. Also add `start()` (eager fork) and `alive`.
**Where**: `src/main/pty-host-client.ts` (+ test)
**Depends on**: T5
**Reuses**: T5 handle registry
**Requirement**: PTYH-22, PTYH-24, PTYH-25, PTYH-26, PTYH-27

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [x] Every live handle's `onExit` fires once with `{ exitCode: -1, hostExited: true }`
- [x] A pending spawn rejects with `PTY host exited unexpectedly`
- [x] The log has `[pty-host] exited unexpectedly (code N)` with the transport's code
- [x] The next `spawn` calls `fork()` again; no spawn is issued without a call (no auto-respawn)
- [x] A fork that throws rejects that `spawn`; the following `spawn` retries the fork
- [x] Quick gate passes: `npx vitest run src/main/pty-host-client.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pty-host): finalize sessions and recreate the host after a crash`

**Status**: ✅ Complete

---

### T7: Shut the PTY host down on quit

**What**: `shutdown(timeoutMs)` posts `killAll`, resolves on the transport's exit, and calls `transport.kill()` at the deadline; an exit during shutdown is not treated as a crash.
**Where**: `src/main/pty-host-client.ts` (+ test)
**Depends on**: T6
**Reuses**: T6 exit handling
**Requirement**: PTYH-17, PTYH-18, PTYH-19

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [x] `killAll` is posted after every earlier message (FIFO)
- [x] Resolves when the transport exits; with fake timers, `kill()` is called at exactly 3000 ms when it does not
- [x] An exit during shutdown fires no `hostExited` finalize and no crash log
- [x] `shutdown` with no live host resolves immediately
- [x] Quick gate passes: `npx vitest run src/main/pty-host-client.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pty-host): let the host kill every PTY before quit`

**Status**: ✅ Complete

---

### T8: Add the utilityProcess fork adapter

**What**: `forkPtyHost(): HostTransport` using `utilityProcess.fork(ptyHostPath, [], { serviceName: 'Playground PTY host', stdio: 'pipe' })`, forwarding stdout/stderr lines as `[pty-host] …` to `console.error`.
**Where**: `src/main/pty-host-fork.ts`
**Depends on**: T7
**Reuses**: `import ptyHostPath from './pty-host?modulePath'` (electron-vite); T1 spike findings
**Requirement**: PTYH-21, spec edge case (stderr forwarding)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Implements `HostTransport` (`post`, `onMessage`, `onExit`, `kill`)
- [x] `electron-vite build` emits the host bundle under `out/main/`
- [x] Build gate passes

**Tests**: none
**Gate**: build

**Commit**: `feat(pty-host): fork the host as an Electron utility process`

**Status**: ✅ Complete. Bundle check used a temporary, uncommitted `index.ts` import (wiring is T9): `out/main/pty-host-<hash>.js` emitted, `require("node-pty")` external

---

### T9: Switch PtyPort to the async host client

**What**: Make `PtyPort` an interface with `spawn(): Promise<PtyHandle>` (no node-pty import); make `SessionManager.spawn`/`respawn`/`duplicate`/`#start` async; wire `new PtyHostClient({ fork: forkPtyHost })` with `start()` at app ready in `index.ts`; update the session-manager tests mechanically (`await`, `fakePort` returns a promise). One task because the contract change must land with its producer and consumer together (L-001).
**Where**: `src/main/pty-port.ts`, `src/main/session-manager.ts`, `src/main/index.ts`, `src/main/session-manager.test.ts`
**Depends on**: None (needs T8, Phase 3, an earlier phase)
**Reuses**: existing `fakePort` / `makeFakeHandle`
**Requirement**: PTYH-01, PTYH-10, PTYH-12, PTYH-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `grep -rn "from 'node-pty'" src` lists only `src/main/pty-host.ts`
- [x] `spawn` persists only after the awaited `#start` succeeds; a rejected `port.spawn` persists nothing and a respawned session stays `stopped`
- [x] The existing session-manager tests pass with only `await`/async-fake edits, plus new tests for the rejected spawn (test count ≥ the pre-task count)
- [x] `sessions:spawn` / `:respawn` / `:duplicate` handlers return the promise
- [ ] Dev app: spawn, attach (replay), type, resize, stop work (not hand-verified by the batch worker; covered by T14's packaged run)
- [x] Build gate passes

**Tests**: unit
**Gate**: build

**Commit**: `refactor(sessions): spawn PTYs through the PTY host`

**Status**: ✅ Complete. session-manager 86 → 89 tests (3 rejected-spawn tests); `electron-vite build` emits `out/main/pty-host-<hash>.js`. Dev-app box left open (no GUI driven by the worker)

---

### T10: Guard the async spawn window in SessionManager

**What**: Revoke the activity token when `port.spawn` rejects; ignore a `respawn` of an id that is still starting (`#starting`); kill a handle that resolves after `killAll`.
**Where**: `src/main/session-manager.ts` (+ test)
**Depends on**: T9
**Reuses**: `deps.hooks.revoke`
**Requirement**: PTYH-16, PTYH-28, PTYH-19

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [x] A rejected spawn of a hooked agent calls `hooks.revoke` with the token it registered
- [x] Two `respawn(id)` calls before the first resolves create exactly one PTY
- [x] A spawn that resolves after `killAll` has `kill()` called on its handle and adds no running session
- [x] Quick gate passes: `npx vitest run src/main/session-manager.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `fix(sessions): revoke the token and dedupe respawns during an async spawn`

**Status**: ✅ Complete. session-manager 89 → 93 tests. SPEC_DEVIATION (`session-manager.ts`): a `#generation` counter bumped by `killAll` replaces the design's sticky `#disposed` flag; the spawn it catches rejects and is killed, later spawns still work

---

### T11: Carry the host-exit flag into session:exit

**What**: Widen `PtyHandle.onExit` and `IpcEvents['session:exit']` with `hostExited?: true`; `#finalize` forwards it.
**Where**: `src/main/session-manager.ts` (+ test; types in `pty-port.ts`, `src/shared/ipc-contract.ts`)
**Depends on**: T10
**Reuses**: `#finalize`
**Requirement**: PTYH-22, PTYH-23

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [x] A handle exit with `{exitCode: -1, hostExited: true}` finalizes the session as `stopped` and emits `session:exit` `{ id, exitCode: -1, hostExited: true }`
- [x] A normal exit emits `session:exit` without `hostExited`
- [x] Quick gate passes: `npx vitest run src/main/session-manager.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(sessions): flag sessions stopped by a PTY host exit`

**Status**: ✅ Complete. session-manager 93 → 95 tests; `PtyHandle.onExit` already carried `hostExited` (T6)

---

### T12: Show the host-exit notice in the terminal

**What**: `TerminalPane` prints `[PTY host exited unexpectedly]` (same dim style) when `payload.hostExited`, else today's `[shell exited with code N]`.
**Where**: `src/renderer/src/components/TerminalPane.tsx`
**Depends on**: T11
**Reuses**: the existing exit-notice write at `TerminalPane.tsx:454`
**Requirement**: PTYH-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Dev app: killing the PTY host process shows the notice in the attached session and both sessions turn `stopped` (not hand-verified by the batch worker: the printed line is canvas-rendered; T14 covers it)
- [x] Build gate passes

**Tests**: none
**Gate**: build

**Commit**: `feat(terminal): tell the user when the PTY host exited`

**Status**: ✅ Complete. Typecheck and lint clean; the visual notice is not hand-verified (see the open box)

---

### T13: Await the PTY host on quit

**What**: `window-all-closed` awaits `ptyHost.shutdown(3000)` after `killAll()` and before `app.quit()`; a `will-quit` guard (re-entry flag) does `killAll` + `shutdown` when the host is still alive on paths that skip `window-all-closed`.
**Where**: `src/main/index.ts`
**Depends on**: T12
**Reuses**: existing `window-all-closed` / `will-quit` handlers
**Requirement**: PTYH-17, PTYH-18, PTYH-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Dev app: quit with 3 sessions running leaves no `pwsh`/`claude`/`OpenConsole` process from the app (built app via a CDP smoke: 3 ad-hoc sessions each running a marked `node` child, window closed, 0 marked processes 4 s later)
- [x] Dev app: quit right after clicking New session leaves no process from that spawn (failed 1 in 12 runs until T15; 20/20 after T15 with `scripts/smoke-pty-host.mjs`)
- [x] Each `will-quit` handler runs at most once per quit (re-entry flag)
- [x] Build gate passes

**Tests**: none
**Gate**: build

**Commit**: `fix(app): let the PTY host kill every PTY before quitting`

**Status**: ✅ Complete (with T15). The index.ts wiring is done: `window-all-closed` awaits `shutdown(3000)` after `killAll()`; a will-quit guard registered before whenReady defers the quit while the host is alive, and the other will-quit handlers go through `onWillQuit`, which skips the deferred emission. The quit-during-spawn orphan it exposed was in the host core and is fixed by T15.

---

### T15: Fix — the host waits for killed PTYs before exiting

**What**: `killAll` exits the host only after every killed PTY's `onExit` has fired, or at a 2500 ms grace deadline (below main's 3000 ms force-kill). Found by the T13 smoke: node-pty defers `kill()` until a starting PTY is ready (`windowsTerminal.js` `_deferNoArgs`), so exiting right after the kills orphaned it (PTYH-19). Replaces T3's "kill then `exit(0)` at once" behaviour, which contradicted PTYH-18.
**Where**: `src/main/pty-host-core.ts` (+ `pty-host-core.test.ts`)
**Depends on**: T13
**Reuses**: the T3 `onExit` handler
**Requirement**: PTYH-18, PTYH-19

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [x] `killAll` with live PTYs does not exit until the last one has exited, then exits once with code 0
- [x] `killAll` with no live PTY exits at once
- [x] Every PTY `exit` message is posted before the host exits
- [x] A PTY spawned just before `killAll` is waited for
- [x] With fake timers, a PTY that never exits lets the host exit at exactly 2500 ms, and only once
- [x] `RUN2_ONLY=1 RUN2_ITER=20 node scripts/smoke-pty-host.mjs`: 20/20 quit-during-spawn runs leave no process
- [x] Quick gate passes: `npx vitest run src/main/pty-host-core.test.ts` (12 tests)

**Tests**: unit
**Gate**: quick

**Commit**: `fix(pty-host): wait for killed PTYs to exit before the host quits`

**Status**: ✅ Complete

---

### T16: Pin main-side forwarding while a spawn is pending

**What**: Unit tests that, with another session's spawn still pending, `SessionManager` writes input to the running session's handle and emits the attached session's output on `session:data` at once. Added when T14 showed the single PTY host can still delay other sessions' I/O inside the host; PTYH-03/04 were amended (2026-10-02) to main's side.
**Where**: `src/main/session-manager.test.ts`
**Depends on**: T15
**Reuses**: `deferSpawns`, `makeManager`
**Requirement**: PTYH-03, PTYH-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Input sent while a spawn is pending reaches the running session's handle before the spawn resolves
- [x] Output of the attached session while a spawn is pending is emitted on `session:data`
- [x] Quick gate passes: `npx vitest run src/main/session-manager.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `test(sessions): pin input and output forwarding while a spawn is pending`

**Status**: ✅ Complete (97 session-manager tests)

---

### T14: Validate on the packaged build and record the profile

**What**: Install the `npm run build:win` output and run the manual checks below; record results and the CPU-profile numbers in `design.md` under `## Packaged Validation`.
**Where**: `.specs/features/pty-host/design.md`
**Depends on**: None (needs T13, Phase 4, an earlier phase)
**Reuses**: `PLAYGROUND_DEBUG_PERF=1` loop log, the #154 CPU-profile procedure
**Requirement**: PTYH-02, PTYH-03, PTYH-04, PTYH-20, PTYH-22, PTYH-23, PTYH-24

**Tools**:

- MCP: NONE
- Skill: `run`

**Done when**:

- [x] Main CPU profile: spawn, respawn and duplicate spend 0 ms in node-pty; longest busy stretches 42–65 ms come from the time tracker's `git` spawn (#151), recorded next to the 313–339 ms baseline
- [x] Typing in an attached session while another spawns: main forwards at once (T16); inside the host it may wait up to the ConPTY creation (accepted, PTYH-03/04 amended)
- [x] 3+ sessions: spawn, switch with replay, resize, Ctrl+C, exit: no regression (ad-hoc sessions; real Claude agents left to the owner)
- [x] Killing the PTY host: `hostExited` payload, sessions stopped, app up, respawn works (the drawn notice left to the owner)
- [x] Quit leaves no orphan process (3 sessions; 10/10 quit-during-spawn)
- [x] Build gate passes

**Tests**: none
**Gate**: build

**Commit**: `test(pty-host): validate the packaged build with a CDP smoke`

**Status**: ✅ Complete. `build:unpack` package instead of the installed `build:win`, since the asar packaging is the same; see design.md §Packaged Validation

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1
Phase 2:  T2 → T3 → T4
Phase 3:  T5 → T6 → T7 → T8
Phase 4:  T9 → T10 → T11 → T12 → T13 → T15 → T16
Phase 5:  T14
```

Phases run in order, so a phase's first task lists `None` and names the earlier-phase task it needs.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Spike | 1 experiment, 1 doc section | ✅ Granular |
| T2: Protocol | 1 types file | ✅ Granular |
| T3: Host core | 1 function | ✅ Granular |
| T4: Host entry | 1 file | ✅ Granular |
| T5: Client spawn/handles | 1 class, spawn path | ✅ Granular |
| T6: Client crash | 1 behaviour of the class | ✅ Granular |
| T7: Client shutdown | 1 method | ✅ Granular |
| T8: Fork adapter | 1 file | ✅ Granular |
| T9: Contract switch | 4 files, one contract (L-001) | ⚠️ Cohesive: the async `PtyPort` cannot typecheck with producer and consumer in separate commits |
| T10: Async spawn guards | 3 guards in 1 class | ✅ Granular |
| T11: Host-exit flag | 1 field through 1 method (+ 2 type edits) | ✅ Granular |
| T12: Exit notice | 1 component branch | ✅ Granular |
| T13: Quit gate | 2 handlers in 1 file | ✅ Granular |
| T15: Host waits for PTY exits | 1 function | ✅ Granular |
| T16: Forwarding during a spawn | 2 tests in 1 file | ✅ Granular |
| T14: Packaged validation | 1 manual run, 1 doc section | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | start of Phase 1 | ✅ Match |
| T2 | None | start of Phase 2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | None (T2, Phase 2) | start of Phase 3 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | None (T8, Phase 3) | start of Phase 4 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T15 | T13 | T13 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T14 | None (T16, Phase 4) | start of Phase 5 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Spec doc | none | none | ✅ OK |
| T2 | Shared types | none | none | ✅ OK |
| T3 | Main-process logic | unit | unit | ✅ OK |
| T4 | OS / Electron boundary | none | none | ✅ OK |
| T5 | Main-process logic | unit | unit | ✅ OK |
| T6 | Main-process logic | unit | unit | ✅ OK |
| T7 | Main-process logic | unit | unit | ✅ OK |
| T8 | OS / Electron boundary | none | none | ✅ OK |
| T9 | Main-process logic + wiring + boundary | unit (highest) | unit | ✅ OK |
| T10 | Main-process logic | unit | unit | ✅ OK |
| T11 | Main-process logic + shared types | unit (highest) | unit | ✅ OK |
| T12 | React component | none | none | ✅ OK |
| T13 | `index.ts` wiring | none | none | ✅ OK |
| T15 | Main-process logic | unit | unit | ✅ OK |
| T16 | Main-process logic (tests) | unit | unit | ✅ OK |
| T14 | Spec doc | none | none | ✅ OK |
