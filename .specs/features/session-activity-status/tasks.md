# Session Activity Status Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/session-activity-status/design.md`
**Status**: Draft — awaiting approval to Execute
**Branch**: `feature/session-activity-status` (cut from `origin/main` `fa78f78`)
**Test baseline**: **748 tests / 46 files**, measured green on this branch before any task.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `.specs/codebase/CONVENTIONS.md`, `vitest.config.ts` (AD-003: coverage is report-only, no threshold gate).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure logic (`src/shared/**`, pure modules in `src/main/**`) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `src/{main,shared}/<module>.test.ts` (co-located) | `npx vitest run <file>` |
| Main-process orchestrator with DI (`SessionManager`) | unit | Every behaviour the ACs name, driven through hand-rolled fakes (no mocking library — TESTING.md pattern 3) | `src/main/session-manager.test.ts` | `npx vitest run src/main/session-manager.test.ts` |
| Loopback HTTP server (`ActivityHookServer`) | integration | Every response path: authorized, unauthorized, malformed, oversized, revoked — asserted against a real listener, as `mcp-result-server.test.ts` does | `src/main/activity-hook-server.test.ts` | `npx vitest run src/main/activity-hook-server.test.ts` |
| Type-only contracts (`src/shared/config.ts`, `ipc-contract.ts`) | none | Build gate only (TESTING.md: "shared types via typecheck") | - | build gate only |
| Electron/main wiring (`src/main/index.ts`) | none | Hand-verified (TESTING.md: "thin OS/Electron shells") | - | build gate only |
| Renderer components and hooks (`src/renderer/**`) | none | Hand-verified via CDP smoke + a two-theme visual pass (TESTING.md: "Renderer React components — verified via CDP smoke") | - | build gate only |
| Smoke scripts (`scripts/smoke-*.mjs`) | none | Owner-run against a live app; never in CI (TESTING.md) | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <the task's test file>` |
| Full | After tasks with integration tests, or that touch `SessionManager` | `npm test` |
| Build | After phase completion or for config/wiring/renderer-only tasks | `npm run typecheck && npm run lint && npm test` (+ `npx electron-vite build` at the end of Phase 3 and Phase 4) |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

Each block below shows the real dependency edges, including the ones that cross a phase
boundary. Tasks with no incoming edge still run in the listed order inside their phase.

### Phase 1: Shared contracts

```
T1
T2
```

### Phase 2: Pure logic

```
T2 → T3
T4
T5
```

### Phase 3: Main-process integration

```
T2 → T6
T1 → T7
T3 → T7
T4 → T7
T5 → T7
T6 → T7
T6 → T8
T7 → T8
```

### Phase 4: Renderer and smoke

```
T2 → T9
T9 → T10
T8 → T11
T10 → T11
```

---

## Task Breakdown

### T1: Move `commandKey` to shared ✅ COMPLETE

**Status**: Done (`c464e3f`) — `src/shared/command-key.ts` + 10 tests; `terminal-keys.ts` imports it and holds no copy. Quick gate green (50 tests across the two files, `terminal-keys.test.ts` unmodified). Suite 748 → 758.

**What**: Move the private `commandKey` helper out of the renderer into `src/shared/command-key.ts`, export it, and import it back into `terminal-keys.ts` so both processes resolve an agent command the same way.
**Where**: `src/shared/command-key.ts`
**Depends on**: None
**Reuses**: `src/renderer/src/lib/terminal-keys.ts:72-75` (the body, unchanged)
**Requirement**: ACTV-01, ACTV-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `commandKey` exported from `src/shared/command-key.ts` with its documenting comment
- [ ] `terminal-keys.ts` imports it and declares no local copy (`grep -c "function commandKey" src/renderer/src/lib/terminal-keys.ts` = 0)
- [ ] `src/shared/command-key.test.ts` covers: bare name, uppercase, full Windows path, `.exe`/`.cmd`/`.bat` suffixes, forward slashes, empty string
- [ ] Existing `terminal-keys.test.ts` passes unmodified
- [ ] Gate check passes: `npx vitest run src/shared/command-key.test.ts src/renderer/src/lib/terminal-keys.test.ts`
- [ ] Test count: 748 → ~754 (+6 new; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(shared): resolve agent commands from one shared key`

---

### T2: Activity types and the `session:activity` channel ✅ COMPLETE

**Status**: Done — `ActivityState` (7 states), `SessionActivity`, `SessionView.activity`, and `session:activity` on `IpcEvents`. `PersistedSession` untouched. Build gate green: typecheck 0 errors, lint 0 errors (18 pre-existing warnings), 758 tests.

**What**: Add `ActivityState`, `SessionActivity` and the optional `SessionView.activity` to the shared config types, and declare `session:activity` in `IpcEvents`.
**Where**: `src/shared/config.ts`, `src/shared/ipc-contract.ts`
**Depends on**: None
**Reuses**: `SessionView` (`config.ts:28-32`), `IpcEvents` (`ipc-contract.ts:131-135`)
**Requirement**: ACTV-05, ACTV-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `ActivityState` union has exactly the seven states of the Transition Table
- [ ] `SessionActivity` carries `state`, optional `tool`, `subagents`, optional `error`
- [ ] `activity?: SessionActivity` is on `SessionView` and **not** on `PersistedSession` (ACTV-09 holds by type)
- [ ] `'session:activity': { id: string; activity: SessionActivity | null }` declared in `IpcEvents`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged at ~754 (no silent deletions)

**Tests**: none (type-only contract layer — matrix says build gate only)
**Gate**: build

**Commit**: `feat(shared): declare session activity state and its push channel`

---

### T3: The activity state machine ✅ COMPLETE

**Status**: Done — `activity-machine.ts` (`applyHookEvent`, `applyKeystroke`, `sameView`) + 53 tests, one per Transition Table row plus the edges. Quick gate green; lint clean. Suite 758 → 811. Design detail the spec left open: `PostCompact` with no state to restore assumes `working` (the cheap error), commented and tested.

**What**: Implement the pure reducer that folds Claude Code hook payloads (and the keystroke rule) into a session's activity, exactly as the spec's Transition Table states.
**Where**: `src/main/activity-machine.ts`
**Depends on**: T2
**Reuses**: `SessionActivity`/`ActivityState` from T2; `run-state.ts` as the project's precedent for a pure reducer
**Requirement**: ACTV-03, ACTV-06, ACTV-12, ACTV-13, ACTV-28, ACTV-34, ACTV-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `applyHookEvent`, `applyKeystroke` and `sameView` exported; no I/O, no timers, no imports outside `src/shared`
- [ ] Every row of the Transition Table has a test fed a payload shaped like the documentation's example for that event
- [ ] Tests cover: `SessionStart` `source: compact` changes nothing; `SessionEnd` `clear`/`resume` give `waiting` (amended after the owner smoke, AD-020) while other reasons give `exited`; `PostCompact` restores the pre-`PreCompact` state; subagent count by `agent_id` never goes below zero and ignores an unknown `agent_id`; `PostToolUse` with no tool recorded; unknown event name and unknown `notification_type` return the input unchanged; `applyKeystroke` only moves `needs-approval`/`needs-input`; a null state stays null until the first state-setting event
- [ ] `sameView` treats equal views as equal and any differing field as changed (the ACTV-06 gate)
- [ ] Gate check passes: `npx vitest run src/main/activity-machine.test.ts`
- [ ] Test count: ~754 → ~784 (+30; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): fold Claude Code hook events into a session activity`

---

### T4: Keystroke classifier ✅ COMPLETE

**Status**: Done — `keystroke.ts` (`isKeystroke`) + 17 tests. Quick gate green; lint clean. Suite 811 → 828. The decisive case is a mouse report arriving with a real character in one chunk, which must still count as typing.

**What**: Implement `isKeystroke(data)`, which tells the user typing apart from the mouse and focus reports Claude Code's mouse tracking puts on the same input channel.
**Where**: `src/main/keystroke.ts`
**Depends on**: None
**Reuses**: `terminal-keys.ts` as the precedent for a pure, classified-input seam
**Requirement**: ACTV-12, ACTV-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Returns `false` for SGR mouse reports (`ESC[<0;10;20M` and `…m`), X10 reports (`ESC[M` + 3 bytes), urxvt reports, focus in/out (`ESC[I`, `ESC[O`), several concatenated reports in one chunk, and the empty string
- [ ] Returns `true` for plain characters, Enter, arrow keys, and a chunk that mixes a mouse report with a real character
- [ ] Gate check passes: `npx vitest run src/main/keystroke.test.ts`
- [ ] Test count: ~784 → ~794 (+10; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): tell real keystrokes from mouse and focus reports`

---

### T5: Hook settings builder ✅ COMPLETE

**Status**: Done — `claude-hook-settings.ts` (`HOOKED_EVENTS`, `ACTIVITY_TOKEN_ENV`, `HOOK_TIMEOUT_SECONDS`, `buildClaudeHookSettings`) + 8 tests. **Phase 2 build gate green**: typecheck 0 errors, lint 0 errors (18 pre-existing warnings), 836 tests (748 baseline + 88).

**What**: Build the `--settings` JSON that points every consumed hook event at the app's endpoint, with the bearer header, the env allowlist and the timeout.
**Where**: `src/main/claude-hook-settings.ts`
**Depends on**: None
**Reuses**: The documented shape in `design.md` §`claude-hook-settings`
**Requirement**: ACTV-01, ACTV-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `HOOKED_EVENTS` lists exactly the events the Transition Table consumes, and a test asserts that set against the table
- [ ] Every generated entry is `type: "http"` with the given url, `timeout` ≤ 5, `Authorization: Bearer $PLAYGROUND_ACTIVITY_TOKEN`, and `allowedEnvVars: ['PLAYGROUND_ACTIVITY_TOKEN']`
- [ ] No entry carries a `matcher` (every occurrence is reported)
- [ ] `allowedHttpHookUrls` and `httpHookAllowedEnvVars` include our url and env var, so a user or org allowlist merges instead of blocking us
- [ ] The result round-trips through `JSON.stringify`/`parse` unchanged
- [ ] Gate check passes: `npx vitest run src/main/claude-hook-settings.test.ts`
- [ ] Test count: ~794 → ~802 (+8; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): build the per-session Claude Code hook settings`

---

### T6: Loopback hook endpoint ✅ COMPLETE

**Status**: Done — `activity-hook-server.ts` + 13 integration tests against a real listener. Full gate green: 849 tests. The suite caught a real defect: a second `stop()` rejected with "Server is not running", which both app quit paths would hit, so `stop()` is now idempotent.

**What**: Implement the `127.0.0.1` HTTP server that authenticates each hook POST by session token, dispatches the payload, and always answers 2xx with an empty body.
**Where**: `src/main/activity-hook-server.ts`
**Depends on**: T2
**Reuses**: `src/main/mcp-result-server.ts:60-68, 118-146` (bearer parsing, ephemeral loopback `listen`, token register/revoke)
**Requirement**: ACTV-04, ACTV-10, ACTV-32

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `start`, `register`, `revoke`, `onEvent`, `stop` implemented; `start` binds `127.0.0.1` on an ephemeral port and rejects rather than hanging when the bind fails
- [ ] Integration tests drive a **real** listener and assert: a registered token dispatches once with the parsed payload and gets a 2xx with a zero-length body; an absent token and an unknown token get 401 with no dispatch; a revoked token gets 401 (the late-POST-after-stop case, ACTV-32); a non-JSON body and a JSON array get 2xx with no dispatch; a body past the cap gets 2xx with no dispatch
- [ ] One test walks **every** response the server can produce and asserts the body length is 0, so no path can ever carry a hook decision (ACTV-10)
- [ ] `stop()` closes the listener and later requests fail to connect
- [ ] Gate check passes: `npx vitest run src/main/activity-hook-server.test.ts`
- [ ] Test count: ~802 → ~812 (+10; no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(main): receive Claude Code hooks on a loopback endpoint`

---

### T7: SessionManager injection, tokens and routing ✅ COMPLETE

**Status**: Done — `hooks` dep (optional, so an app with no server keeps today's behaviour), per-run token, `handleHookEvent`, the keystroke rule in `input`, revoke+clear in `#finalize`, `activity` on the view. +15 tests. Full gate green: 864 tests.

**What**: Inject the hook settings and token when spawning a Claude session, route hook events and keystrokes into the machine, emit `session:activity` on change, and drop everything when the session stops.
**Where**: `src/main/session-manager.ts`
**Depends on**: T1, T3, T4, T5, T6
**Reuses**: `#start`/`#finalize`/`input`/`#toView` (`session-manager.ts:198-200, 229-262, 286-294`), `buildSpawnPlan` unchanged, `PtyPort.spawn(plan, env?)` (`pty-port.ts:28`)
**Requirement**: ACTV-01, ACTV-02, ACTV-03, ACTV-05, ACTV-06, ACTV-08, ACTV-12, ACTV-13, ACTV-29, ACTV-30, ACTV-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `SessionManagerDeps.hooks` added; injection happens only when `commandKey(agent.command) === 'claude'` **and** `settingsPath` is non-null
- [ ] Tests assert: a Claude session spawns with `--settings <path>` appended and the token in the spawn env; an ad-hoc session and a non-Claude agent spawn byte-identically to today (ACTV-02); a null `settingsPath` skips injection (ACTV-29); an agent whose args already contain `--settings` skips injection
- [ ] Tests assert: an event for a live token updates `list()`'s `activity` and emits `session:activity` once; a repeated event that yields the same view emits nothing (ACTV-06); an event for an unknown/stopped session is ignored (ACTV-31); `stop` revokes the token, clears the activity and leaves `status: 'stopped'` (ACTV-08); `respawn` registers a **new** token (ACTV-13); editing the registry agent mid-session does not change that session's injection (ACTV-30)
- [ ] Keystroke input is written to the PTY **and** applied to the machine; a mouse report is written but not applied (ACTV-12)
- [ ] `activity` never reaches `config.json`: a test asserts the persisted sessions after a full event sequence (ACTV-09)
- [ ] Gate check passes: `npm test`
- [ ] Test count: ~812 → ~827 (+15; no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `feat(main): derive session activity from injected Claude Code hooks`

---

### T8: App wiring ✅ COMPLETE (hand-verify rides T11)

**Status**: Done — hook server created on app ready, settings file written to `userData/agent-hooks/claude-settings.json` once the port is bound, `onEvent` routed to `SessionManager`, listener closed on `window-all-closed`. **Phase 3 build gate green**: typecheck + lint clean, 864 tests, `electron-vite build` OK. Carries one `SPEC_DEVIATION` (server binds asynchronously after construction instead of before, with the reason in the code). The dev hand-verification is the T11 smoke, which the owner runs.

**What**: Start the hook server on app ready, write the generated settings file into `userData`, hand `SessionManager` its hooks dependency, subscribe `onEvent`, and stop the server on quit.
**Where**: `src/main/index.ts`
**Depends on**: T6, T7
**Reuses**: The existing `emitToWindow`/`SessionManager` construction (`index.ts:222-252`) and the `window-all-closed` teardown
**Requirement**: ACTV-01, ACTV-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Server starts before `SessionManager` is constructed; a failed start logs once and leaves `settingsPath` null instead of throwing (ACTV-29)
- [ ] The settings file is rewritten at `userData/agent-hooks/claude-settings.json` on every launch, because the port changes
- [ ] `hookServer.onEvent` is wired to the manager, and `stop()` runs on `window-all-closed` beside `killAll()`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test && npx electron-vite build`
- [ ] Test count: unchanged at ~827 (no silent deletions)
- [ ] Hand-verified in dev: the app starts, a Claude session's row reaches `waiting`, and the settings file on disk matches the running port

**Tests**: none (thin Electron wiring — matrix says build gate only, hand-verified)
**Gate**: build

**Commit**: `feat(main): wire the activity hook server into the app lifecycle`

---

### T9: Rail view model ✅ COMPLETE

**Status**: Done — `RowStatus` grew by the seven activity labels, `rowStatus` reads the activity, `rowActions` gives every running label `['stop']`, the tooltip carries tool/subagents/error, and `headerCounts` is new. +23 tests (59 in the file); every pre-existing rail-groups test passes unmodified. Quick gate green; lint clean.

**What**: Extend the pure rail model: activity-derived row statuses, the detail suffix on the tooltip, and the header counts.
**Where**: `src/renderer/src/lib/rail-groups.ts`
**Depends on**: T2
**Reuses**: `rowStatus`/`rowActions`/`statusClass`/`resolveRows` (`rail-groups.ts:57-82, 198-219`)
**Requirement**: ACTV-19, ACTV-22, ACTV-23, ACTV-24, ACTV-25, ACTV-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `RowStatus` grows by `working`, `compacting`, `waiting`, `approval`, `input`, `error`, `shell`; a running session with no activity still yields `running` (ACTV-19)
- [ ] Every activity row keeps `['stop']` as its action set, and row/group order is unchanged by any status (RAIL-04/05 tests still pass unmodified)
- [ ] Tooltip appends the tool, the subagent count and the error type when present, and is byte-identical to today when activity is absent (ACTV-24..26)
- [ ] `headerCounts` returns running, working (`working` + `compacting`) and needYou (`needs-approval` + `needs-input` + `error`) (ACTV-22, ACTV-23)
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/rail-groups.test.ts`
- [ ] Test count: ~827 → ~842 (+15; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(rail): derive row status and header counts from session activity`

---

### T10: Rail and detail rendering ✅ COMPLETE (visual pass rides T11)

**Status**: Done — `use-sessions` patches `session:activity` in place; the rail row shows a spinning loader for working/compacting and a coloured dot otherwise, with `aria-label` on the label; the header adds ` · N working` and ` · N need you`; `AgentsView`'s pill shows the fuller wording plus tool, subagent count and error type; new `loader` icon; CSS carries the app's first `prefers-reduced-motion` rule. Build gate green: lint 0 errors, 887 tests, `electron-vite build` OK. Colours: working/compacting `--green`, waiting `--blue`, approval/input `--pink`, error `--red`, shell `--amber` (handoff).

**What**: Apply `session:activity` in place in the sessions hook, and render the states: loader, dots, colours, labels, `aria-label`, reduced motion, and the detail-pane pill.
**Where**: `src/renderer/src/lib/use-sessions.ts`, `src/renderer/src/components/{SessionRail.tsx,SessionRail.css,AgentsView.tsx,Icon.tsx}`
**Depends on**: T9
**Reuses**: The `session:status`/`session:exit` subscription (`use-sessions.ts:42-49`), the status dot CSS (`SessionRail.css:301-315`), the detail pill (`AgentsView.tsx:174-175`)
**Requirement**: ACTV-07, ACTV-14, ACTV-15, ACTV-16, ACTV-17, ACTV-18, ACTV-20, ACTV-21, ACTV-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `session:activity` updates the one session in place; no `sessions:list` call is made (ACTV-07) — the reducer is unit-tested in `src/renderer/src/lib/session-activity.test.ts` (F2) and the smoke counts `sessions:list` calls across a live activity burst (F4)
- [ ] `working`/`compacting` render the spinning `loader` icon; the other states render a dot in the colour table from the design; `stopped`/`running`/`path missing` are untouched (ACTV-14..19)
- [ ] The status element carries `aria-label` naming the state (ACTV-21)
- [ ] `@media (prefers-reduced-motion: reduce)` stops the loader animation (ACTV-20)
- [ ] The header renders `N running`, ` · M working` and ` · K need you`, each hidden at zero (ACTV-22, ACTV-23)
- [ ] The detail pill shows the activity label plus detail, falling back to `running`/`stopped` (ACTV-27)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test && npx electron-vite build`
- [ ] Test count: unchanged at ~842 (no silent deletions)

**Tests**: none (renderer — matrix says CDP smoke + visual pass, per TESTING.md)
**Gate**: build

**Commit**: `feat(agents): show what each agent is doing in the rail and detail`

---

### T11: Owner smoke script ✅ COMPLETE — **RUN BY THE OWNER, 19/19**

**Status**: Done and **executed by the owner: 19/19 checks passed** (plus the documented ACTV-07 SKIP). The first run found a real defect — a fresh session held no state because Claude Code never delivers `SessionStart` to an http hook — which is now AD-020 and commit `e157495`; the re-run after the amendment was green. Live evidence exists for ACTV-01/02/03/04/12/13/16/18/21/22/23/24. Original note: `scripts/smoke-activity.mjs`, checks over one real session and **one** prompt. It also asserts the written settings file and that the live endpoint answers 401 to an untokened POST. Build gate green: typecheck + lint clean, 887 tests. **SPEC_DEVIATION**: the script prints the observed state sequence instead of logging every raw hook payload — a `--settings` file is fixed at spawn, so capturing payloads would mean a second Claude session and a second prompt. A renamed event still shows up, as a missing transition and a failed check.

**What**: A CDP smoke script that drives one real Claude session through the whole state sequence and logs every live hook payload beside its documented shape.
**Where**: `scripts/smoke-activity.mjs`
**Depends on**: T8, T10
**Reuses**: `scripts/smoke-rail-v2.mjs` (CDP attach, row queries, assertion style)
**Requirement**: ACTV-01..ACTV-27 (the P1/P2/P3 independent tests)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The script spawns a Claude session in a seeded worktree and asserts the row reaches `waiting`
- [ ] It submits **one** trivial prompt that needs an approval, and asserts `working` → `approval` → (on the approving keystroke) `working` → `waiting`
- [ ] It asserts the tooltip names the running tool, the header counts move, and `/exit` yields `shell`
- [ ] It writes every received hook payload to a log and reports any field that the documented shape does not predict, so drift is visible without re-reading the docs
- [ ] The script is documented as owner-run only (never CI), like every other `smoke-*.mjs`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged at ~842 (no silent deletions)

**Tests**: none (smoke script — matrix says owner-run, never CI)
**Gate**: build

**Commit**: `test(agents): add the owner-run activity smoke`

---

## Phase Execution Map

Phases run in sequence; within a phase the tasks run in the order listed.

| Order | Phase | Tasks |
| ----- | ----- | ----- |
| 1 | Shared contracts | T1, T2 |
| 2 | Pure logic | T3, T4, T5 |
| 3 | Main-process integration | T6, T7, T8 |
| 4 | Renderer and smoke | T9, T10, T11 |

Execution is strictly sequential - there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

Packing for Execute: 11 tasks at ~7 per batch → **2 batches** (Phase 1+2+3 = 8 tasks, Phase 4 = 3 tasks), so the sub-agent offer applies.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Move `commandKey` | 1 moved function + its test | ✅ Granular |
| T2: Activity types + channel | 2 type files, one cohesive contract | ✅ Granular |
| T3: Activity state machine | 1 module | ✅ Granular |
| T4: Keystroke classifier | 1 function | ✅ Granular |
| T5: Hook settings builder | 1 function | ✅ Granular |
| T6: Loopback hook endpoint | 1 module | ✅ Granular |
| T7: SessionManager wiring | 1 file (modify) | ✅ Granular |
| T8: App wiring | 1 file (modify) | ✅ Granular |
| T9: Rail view model | 1 file (modify) | ✅ Granular |
| T10: Rail and detail rendering | 4 renderer files, one visual deliverable | ⚠️ OK — cohesive: the states cannot be rendered half-way, and the layer carries no unit tests |
| T11: Owner smoke script | 1 script | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | no incoming edge | ✅ Match |
| T2 | None | no incoming edge | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None | no incoming edge | ✅ Match |
| T5 | None | no incoming edge | ✅ Match |
| T6 | T2 | T2 → T6 | ✅ Match |
| T7 | T1, T3, T4, T5, T6 | T1 → T7, T3 → T7, T4 → T7, T5 → T7, T6 → T7 | ✅ Match |
| T8 | T6, T7 | T6 → T8, T7 → T8 | ✅ Match |
| T9 | T2 | T2 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T8, T10 | T8 → T11, T10 → T11 | ✅ Match |

No dependency points at a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Pure logic (`src/shared`) | unit | unit | ✅ OK |
| T2 | Type-only contracts | none | none | ✅ OK |
| T3 | Pure logic (`src/main`) | unit | unit | ✅ OK |
| T4 | Pure logic (`src/main`) | unit | unit | ✅ OK |
| T5 | Pure logic (`src/main`) | unit | unit | ✅ OK |
| T6 | Loopback HTTP server | integration | integration | ✅ OK |
| T7 | Main orchestrator with DI | unit | unit | ✅ OK |
| T8 | Electron wiring | none | none | ✅ OK |
| T9 | Pure logic (renderer lib, unit-tested by existing convention) | unit | unit | ✅ OK |
| T10 | Renderer components and hooks | none | none | ✅ OK |
| T11 | Smoke script | none | none | ✅ OK |

No task defers its own tests to a later task.

---

## Fix round 1 (Verifier FAIL, 2026-09-15)

### F1: Kill the two surviving mutants ✅ COMPLETE

**What**: The Transition Table's `subagents = 0` effect on `SessionStart` and `SessionEnd` was only ever asserted from states already holding zero subagents, so mutating `to(null, …)` to `to(state, …)` at `activity-machine.ts:77` and `:108` left the suite green.
**Done**: two cases in `activity-machine.test.ts` drive both events from a state holding one subagent. Re-injecting both mutants now fails exactly those two tests.
**Tests**: unit · **Gate**: quick (55 in file)

### F2: Give ACTV-07 and ACTV-24..27 real evidence ✅ COMPLETE

**What**: The in-place activity patch and the detail-pane pill were correct by reading but proved by nothing — T10 delegated ACTV-07 to an IPC count the smoke never implemented, and the pane was not on any hand-verify list.
**Done**: `src/renderer/src/lib/session-activity.ts` extracts `applyActivity`, `detailPillClass` and `detailPillText` out of `use-sessions.ts` and `AgentsView.tsx` (the `rail-groups` precedent: the decision is unit-tested, the component stays hand-verified) + 27 tests.
**Tests**: unit · **Gate**: build (916 tests)

### F3: Smoke accuracy ✅ COMPLETE

**What**: the ACTV-18 check asserted the machine state, not the rendered `shell` label; the hand-verify list omitted the detail pane, the waiting/error indicators and reduced motion; the payload-logging deviation was disclosed only in tasks.md.
**Done**: the check now reads `.rail-row-status` (the state assertion stays, renamed to ACTV-03), the hand-verify list names every uncovered surface, and the script carries its own `SPEC_DEVIATION` marker.
**Tests**: none (smoke script) · **Gate**: build

### F4: Measure ACTV-07 instead of reading it ✅ COMPLETE

**What**: Round 2 left one probe alive — a `refreshSessions()` added next to the in-place patch in `use-sessions.ts` survives every test, because the subscription wiring is convention-exempt and nothing counts IPC calls.
**Done**: `smoke-activity.mjs` wraps the bridge, waits 12 s through a live activity burst without polling, and asserts zero `sessions:list` calls while the row still follows the agent. If `contextBridge` refuses the wrapper the check prints SKIP rather than passing falsely. T10's stale Done-when now cites the real evidence.
**Tests**: none (smoke script) · **Gate**: build

