# PTY Host Specification

## Problem Statement

Opening, duplicating or respawning a session freezes the whole app for about 300 ms: keystrokes in
the other terminals, IPC replies and hook replies all wait. node-pty runs in the Electron main process
(`src/main/pty-port.ts:31`), and on Windows `pty.spawn` builds the ConPTY synchronously inside the
`WindowsPtyAgent` constructor. The owner's main-process CPU profile (2026-10-01, after #154) shows
313–339 ms of main blocked per spawn/respawn, 246–281 ms of it in `WindowsPtyAgent`. #154 removed
every other stall over 100 ms; this one cannot be fixed inside main because the work is native and
synchronous (issue #155).

## Goals

- [ ] Opening, respawning or duplicating a session spends no main-process time creating the PTY,
      measured with a main-process CPU profile on a packaged build (PTYH-02). Other work on the
      same path (the time tracker's `git rev-parse`, ~20–30 ms) is #151's scope
- [ ] While a session is being created, the UI, IPC replies and activity-hook replies stay responsive, and the main process forwards input and output of the other sessions at once (inside the PTY host they may still wait up to the ConPTY creation time, ~170–280 ms; see Assumptions)
- [ ] Sessions behave as before the move: spawn, replay on switch, resize, paste, Ctrl+C, exit
      codes, activity, time tracking
- [ ] A crash of the process that hosts the PTYs stops the sessions but not the app

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Changing ConPTY or node-pty, or switching to `useConptyDll` | Issue #155 out of scope; the fix is where the cost lands, not the cost itself |
| Batching `session:data` to the renderer | Issue #155 out of scope; only the attached session streams (agent-sessions streaming-IPC design) |
| The renderer's terminal | Already on WebGL since #154 |
| Moving the scrollback ring buffer out of main | Chosen default (see Assumptions); append cost is already O(chunk) since #154 |
| An in-process fallback (env var to keep node-pty in main) | Owner decision (2026-10-02): one code path; revert is the escape hatch |
| Auto-respawning sessions after a PTY host crash | Owner decision (2026-10-02): risks a crash loop if a session caused it |
| A PTY host per session (no cross-session stall during a spawn) | Owner decision (2026-10-02): follow-up issue; the single host already frees main |
| Killing orphaned agent process trees after a PTY host crash (`taskkill /T`, Job Object) | Owner decision (2026-10-02): risk accepted for now; see Assumptions |
| Fixing #103 (`write EAGAIN` closing an opencode session) | Not verified to share the cause; isolation may contain it, but it is not a goal |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Where node-pty runs | An Electron `utilityProcess` (the "PTY host"); `PtyPort` stays the only seam to node-pty, served by a proxy over a `MessagePort` | Issue #155 solution; keeps `SessionManager` depending on `PtyHandle` only | y |
| Spawn failure UX | Main awaits the host's spawn acknowledgement before answering the invoke; failure rejects the invoke → toast, nothing persisted (as today) | Owner decision (2026-10-02); keeps the "nothing persisted on a bad spawn" guarantee | y |
| PTY host crash | Finalize every running session as `stopped`, print `[PTY host exited unexpectedly]` in each, recreate the host for the next spawn; no auto-respawn | Owner decision (2026-10-02) | y |
| Agent processes after a PTY host crash | Rely on Windows closing the pseudoconsole: conhost sends `CTRL_CLOSE_EVENT` to every attached process. A process that detached from the console or ignores `CTRL_CLOSE` may survive as an orphan; main does not kill process trees | Owner accepted the risk (2026-10-02). node-pty's graceful `kill()` enumerates and kills the console process list (`windowsPtyAgent.js:133`, vscode#26807), but that JS does not run when the host dies. Same exposure as a main-process crash today | y |
| Other terminals during a spawn | The PTY host handles one message at a time and `pty.spawn` blocks it for ~170–280 ms, so input to and output from the other sessions can wait that long inside the host. Main never waits (PTYH-03, PTYH-04 amended to main's side). A host per session is the follow-up | Owner decision (2026-10-02) after T14 showed the single-host design moves the stall from main into the host instead of removing it for terminal I/O | y |
| In-process fallback | None | Owner decision (2026-10-02) | y |
| Scrollback ring buffer location | Stays in main (`SessionRingBuffer`), fed by the proxy's `onData` | Smaller change; replay keeps riding `session:data` unchanged (no replay/live seam); append is O(chunk) since #154 | y |
| PTY host start time | Started when the app is ready, before the first spawn | First spawn should not pay the host start-up on top of the ConPTY | y |
| Busy-stretch measurement | CPU profile of main on a packaged build, plus `PLAYGROUND_DEBUG_PERF=1` loop-delay max over the window that contains the spawn | Same tools as #154's validation; a CI timing test would flake (lesson L-005) | y |
| Spawn parallelism | Concurrent spawns may queue inside the host (ConPTY creation stays synchronous there); each still resolves | Only main's responsiveness is the goal; the host's own loop may be busy | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Opening a session never freezes the app ⭐ MVP

**User Story**: As a developer opening, duplicating or respawning an agent session, I want the other
terminals and the UI to stay responsive, so that starting an agent never interrupts work in progress.

**Why P1**: This is the defect in #155.

**Acceptance Criteria**:

1. PTYH-01: The system SHALL create every session PTY (spawn, respawn, duplicate) in the PTY host, and the main process SHALL NOT load `node-pty`.
2. PTYH-02: WHEN a session is spawned, respawned or duplicated THEN the main process SHALL show no busy stretch over 50 ms attributable to PTY creation in a CPU profile of a packaged build.
3. PTYH-03: WHILE a session's PTY is being created, WHEN the user types in another running session THEN the main process SHALL forward that input to the PTY host without waiting for the creation to finish.
4. PTYH-04: WHILE a session's PTY is being created, WHEN the PTY host delivers output of the attached running session THEN the main process SHALL emit it on `session:data` without waiting for the creation to finish.
5. PTYH-05: WHEN two sessions are spawned before either acknowledgement arrives THEN the system SHALL resolve both, each with its own running session.

**Independent Test**: With one agent running, open a new session; a CPU profile of main shows no
node-pty frame, and a `session:input` sent while the spawn is pending reaches the other session's
handle before the spawn resolves (unit test).

---

### P1: Sessions behave exactly as before ⭐ MVP

**User Story**: As a developer, I want sessions to behave as they do today after the move, so that
nothing regresses.

**Why P1**: A faster spawn that breaks replay, resize or exit codes is a regression.

**Acceptance Criteria**:

1. PTYH-06: WHEN the PTY emits output THEN the proxy SHALL deliver it to `onData` in the order the PTY emitted it.
2. PTYH-28: IF a respawn is requested for a session whose PTY is still being created THEN the system SHALL NOT create a second PTY for that session.
3. PTYH-07: WHEN the PTY exits THEN the proxy SHALL call `onExit` with the PTY's exit code after delivering every chunk the PTY emitted before exiting.
4. PTYH-08: WHEN `write`, `resize` or `kill` is called on a handle THEN the proxy SHALL forward it to that handle's PTY in the host, in call order.
5. PTYH-09: The system SHALL spawn the PTY with the same file, args, cwd, terminal name (`xterm-256color`) and environment (developer's env plus overrides, through `buildPtyEnv`) as today, including the activity token and task URL variables.
6. PTYH-10: WHEN a running session is attached THEN the system SHALL replay its scrollback and then its live output on the one ordered `session:data` channel, as today.
7. PTYH-11: IF `write`, `resize` or `kill` is called on a handle whose PTY already exited THEN the proxy SHALL drop the call without throwing.
8. PTYH-12: The `SessionManager` test suite SHALL pass with changes only where the `PtyPort.spawn` contract becomes asynchronous or where a test covers a new PTYH requirement.

**Independent Test**: With 3 agents, switch sessions (replay), resize the window, paste, press Ctrl+C,
let one exit — the terminal shows the same output and `[shell exited with code N]` as before.

---

### P1: A failed spawn reads as it does today ⭐ MVP

**User Story**: As a developer who picks a bad cwd, shell or agent, I want the same toast and no
leftover session, so that the async move does not leave dead sessions in the list.

**Why P1**: `SessionManager.spawn` guarantees nothing is persisted on a bad spawn; that must hold.

**Acceptance Criteria**:

1. PTYH-13: WHEN the host reports that `pty.spawn` failed THEN the system SHALL reject the `sessions:spawn` / `sessions:respawn` / `sessions:duplicate` invoke with the host's error message.
2. PTYH-14: IF a spawn fails THEN the system SHALL NOT persist a new session, and a respawned session SHALL stay `stopped`.
3. PTYH-15: IF a spawn fails THEN main SHALL log the plan's file, args and cwd with the error (the #89 log line).
4. PTYH-16: IF a spawn fails THEN the system SHALL revoke the activity token it registered for that spawn.

**Independent Test**: Spawn an agent in a deleted folder; a toast shows the error, no session is
added, and the log has the `Failed to spawn PTY: file=… args=… cwd=…` line.

---

### P1: Quitting leaves no process behind ⭐ MVP

**User Story**: As a developer closing the app, I want every shell and agent to die, so that nothing
keeps running in the background.

**Why P1**: `killAll` exists so no shell/agent is orphaned; moving the PTYs must keep that.

**Acceptance Criteria**:

1. PTYH-17: WHEN the app quits or the last window closes THEN the system SHALL kill every PTY and finalize each running session as `stopped`, as `killAll` does today.
2. PTYH-18: WHEN the app quits THEN the system SHALL let the PTY host finish killing every PTY and SHALL terminate the PTY host process within 3 s.
3. PTYH-19: IF the app quits while a spawn is in flight THEN the system SHALL leave no shell or agent process from that spawn running.

**Independent Test**: With 3 agents running, quit; Task Manager shows no `pwsh`/`claude`/`OpenConsole`
process from the app.

---

### P1: The packaged build works ⭐ MVP

**User Story**: As a developer on the installed app, I want sessions to work, so that the move is not
dev-only.

**Why P1**: Native modules and bundled entry points have broken the packaged build before
(esbuild ENOENT, #68).

**Acceptance Criteria**:

1. PTYH-20: WHEN the app built with `build:win` spawns a session THEN the PTY host SHALL load `node-pty` and the session SHALL start.
2. PTYH-21: The build SHALL include the PTY host entry point in the packaged app.

**Independent Test**: Install the `build:win` output, open 3 agents, and run the P1 checks above.

---

### P2: A PTY host crash does not take the app down

**User Story**: As a developer with several agents running, I want a crashing PTY host to stop the
sessions but not the app, so that I can respawn them and keep working.

**Why P2**: Containment is the bonus of isolation; the freeze fix ships without it.

**Acceptance Criteria**:

1. PTYH-22: IF the PTY host exits while the app is not quitting THEN the system SHALL finalize every running session as `stopped`.
2. PTYH-23: IF the PTY host exits while the app is not quitting THEN each affected session's terminal SHALL print `[PTY host exited unexpectedly]`.
3. PTYH-24: WHEN a spawn or respawn is requested after the PTY host exited THEN the system SHALL start a new PTY host and spawn the session in it.
4. PTYH-25: IF the PTY host exits THEN the system SHALL NOT respawn any session automatically.
5. PTYH-26: IF the PTY host exits while a spawn is in flight THEN the system SHALL reject that spawn's invoke.
6. PTYH-27: IF the PTY host exits unexpectedly THEN main SHALL log `[pty-host] exited unexpectedly (code N)` with the host's exit code N (Electron's `exit` event reports only the code).

**Independent Test**: With 2 agents running, kill the PTY host process from Task Manager; both
sessions show the notice and turn `stopped`, the app stays up, and respawning one works.

---

## Edge Cases

- IF `resize` is called with zero or negative dimensions THEN the system SHALL drop it before it reaches the host (as today, `session-manager.ts:325`).
- WHEN `stop` is called THEN the system SHALL still wait for the PTY's real exit, up to `SESSION_EXIT_WAIT_MS`, as today.
- IF the host writes to stderr THEN main SHALL forward it to main's log with a `[pty-host]` prefix.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PTYH-01 | P1: Never freezes | Design | Implementing |
| PTYH-02 | P1: Never freezes | Design | Pending |
| PTYH-03 | P1: Never freezes | Execute | Implementing |
| PTYH-04 | P1: Never freezes | Execute | Implementing |
| PTYH-05 | P1: Never freezes | Design | Implementing |
| PTYH-06 | P1: Parity | Design | Implementing |
| PTYH-07 | P1: Parity | Design | Implementing |
| PTYH-08 | P1: Parity | Design | Implementing |
| PTYH-09 | P1: Parity | Design | Implementing |
| PTYH-10 | P1: Parity | Design | Implementing |
| PTYH-11 | P1: Parity | Design | Implementing |
| PTYH-12 | P1: Parity | Design | Implementing |
| PTYH-13 | P1: Failed spawn | Design | Implementing |
| PTYH-14 | P1: Failed spawn | Design | Implementing |
| PTYH-15 | P1: Failed spawn | Design | Implementing |
| PTYH-16 | P1: Failed spawn | Design | Implementing |
| PTYH-17 | P1: Quit | Design | Implementing |
| PTYH-18 | P1: Quit | Design | Implementing |
| PTYH-19 | P1: Quit | Design | Implementing |
| PTYH-20 | P1: Packaged build | Design | Pending |
| PTYH-21 | P1: Packaged build | Design | Implementing |
| PTYH-22 | P2: Host crash | Design | Implementing |
| PTYH-23 | P2: Host crash | Design | Implementing |
| PTYH-24 | P2: Host crash | Design | Implementing |
| PTYH-25 | P2: Host crash | Design | Implementing |
| PTYH-26 | P2: Host crash | Design | Implementing |
| PTYH-27 | P2: Host crash | Design | Implementing |
| PTYH-28 | P1: Parity | Design | Implementing |

**Coverage:** 28 total, 0 mapped to tasks, 28 unmapped (Tasks phase pending)

---

## Success Criteria

- [ ] CPU profile of main on a packaged build: opening a session spends 0 ms in node-pty (was 246–281 ms in `WindowsPtyAgent`, 313–339 ms blocked)
- [ ] Manual run with 3+ agents on the packaged build: spawn, switch with replay, resize, paste, Ctrl+C, exit — no regression
- [ ] Killing the PTY host from Task Manager leaves the app running and the sessions respawnable
