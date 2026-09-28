# Activity Subagent Attribution Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: none as a separate file — one module changes (`activity-machine.ts`) and its shape is fixed below. `MachineState` grows four private fields: whether the main agent's turn has ended (`mainStopped`), the ids in the last main-agent `Stop`'s `background_tasks` (`background`, absent until a `Stop` carries the field), the subagents that stopped and still owe their result (`owed`), and who asked the pending question (`askedBy`: an `agent_id`, or `main`). The view (`SessionActivity`) does not change, so IPC, renderer and notifications are untouched.
**Status**: Done 2026-09-25 — Verifier PASS after three fix rounds and an owner-approved re-check (`validation.md`). Re-planned after T1's findings and approved the same day; planned 2026-09-22

**Branch**: `feature/activity-subagent-attribution`, rebased onto `origin/main` `c31bb9a` on 2026-09-25 after #94 merged. The PR goes to `obogoni:main` with `Closes #106`, and no longer depends on #94.

**Test baseline** (measured 2026-09-25, T1): 1663 tests in 90 files, all passing; lint 0 errors, **18 warnings**. The first run had one intermittent failure among the git-backed tests and the second run none; it is unrelated to this feature.

**Stop points**:
- ~~T1 needs the owner at the keyboard~~ — done.
- ~~After T1, stop if `idle_prompt` fired while a subagent was active~~ — it did (S3a, S3b); execution stopped and the owner decided the `idle_prompt` rule again (spec, assumptions table).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts; style sampled from `src/main/activity-machine.test.ts` and `src/main/activity-notification.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure activity machine (`activity-machine.ts`) | unit | 1:1 to ASUB-01..08, 11, 14..18; every edge case in the spec; each captured sequence replayed with the view asserted after every named event | `src/main/activity-machine.test.ts` | `npm test` |
| Test fixtures (`activity-sequences.fixture.ts`) | unit | ASUB-13: a test fails on any path, drive letter, UUID-shaped id, real-shaped agent id or free text | `src/main/activity-sequences.fixture.test.ts` | `npm test` |
| Notification decision (`activity-notification.ts`, unchanged) | unit | ASUB-04 by replay; existing tests pass unedited | `src/main/activity-notification.test.ts` | `npm test` |
| Spike listener and settings | none | Throwaway, scratchpad only, never committed | — | — |
| Real app check | manual | Success criteria, owner-driven | — | `npm run dev` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | At the end | `npx electron-vite build` |
| Manual | T1, T7 | owner-driven Claude Code session |

**Lint is judged by exit code AND by warning count** — 18 at T1; diff it at every gate.

---

## Execution Plan

### Phase 1: Measure

```
T1
```

### Phase 2: The machine

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 3: Real app

```
T6 → T7
```

---

## Task Breakdown

### T1: Capture the real hook sequences ✅

**What**: In a scratch folder, run an owner-driven interactive `claude --settings <scratch settings>` whose http hooks post every event to a throwaway listener that logs each payload in order; drive the scenarios below and record the findings in this file.
**Where**: `.specs/features/activity-subagent-attribution/tasks.md` (findings); listener, settings and raw logs stay in the scratchpad
**Depends on**: None
**Reuses**: the hook list of `src/main/claude-hook-settings.ts`, so the probe hears exactly what the app hears; http hooks, not command hooks (AD-020: they differ)
**Requirement**: ASUB-05, ASUB-07..10 (decides), ASUB-12 (source)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Recorded, with the event order of each scenario: does `Stop` fire with a subagent active; what fires when the main agent is woken (`UserPromptSubmit` or only tool events); does `SubagentStop` precede the wake-up
- [x] Recorded: do `PreToolUse`, `PostToolUse`, `PermissionRequest` and `Notification` fired inside a subagent carry `agent_id` — decides ASUB-07/08 versus ASUB-09/10
- [x] Recorded: did `idle_prompt` fire in S3 while the subagent was active — if yes, **stop** and return the Q8 decision to the owner
- [x] Recorded, if seen: a background Bash waking the main agent (out of scope; noted for a later item)
- [x] The owner's `~/.claude/settings.json` unchanged (hash before and after)
- [x] Baselines recorded: test count, lint warning count

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record how claude code reports background subagents`

#### Findings (Claude Code 2.1.283, 2026-09-25)

Probe: the app's 16 hooks as http hooks, same shape as `buildClaudeHookSettings`, posting to a listener in the scratchpad; `--allowedTools "Bash(sleep:*)"` (round 2 added `"Bash(node -e:*)"`). The owner's `~/.claude/settings.json` hashed identical before and after both rounds. Two rounds, 214 events.

**Payload fields.**

- The main agent's `Stop` carries `background_tasks`: a list of `{ id, type: 'subagent' | 'shell', status: 'running', description, agent_type | command }`. It lists background subagents and background shells, including shells a subagent started. It was non-empty at every `Stop` in the middle of a job and `[]` at every job's end.
- `SubagentStop` carries the same `background_tasks`, and a stopping background subagent is still listed in its own `SubagentStop`.
- `PreToolUse`, `PostToolUse` and `PermissionRequest` fired inside a subagent carry `agent_id` and `agent_type`; the main agent's carry neither. **Decides ASUB-07/08; ASUB-09/10 are N/A.**
- `Notification` (`permission_prompt`, `idle_prompt`) carries no `agent_id`. The `permission_prompt` came 6 s after the subagent's `PermissionRequest`.
- `PreToolUse` for `Agent` carries only `subagent_type` in `tool_input`: background and foreground cannot be told apart from the call.

**How the main agent is woken.** A `UserPromptSubmit` without `agent_id` whose prompt is `<task-notification>` with `<task-id>{id}</task-id>` (a finished background subagent or shell), or `<agent-message from="{id}">` (a subagent's `SubagentHandback` tool, which arrives before that subagent's `SubagentStop`). Each wake-up ends with its own `Stop`.

**Side agents.** After nearly every main-agent `Stop`, one or two `SubagentStop` arrive with an `agent_id`, no `agent_type` and no `SubagentStart`: Claude Code's prompt-suggestion and session-recap agents (their last messages predict the owner's next prompt or summarise the session). Twice they ran tools (a `Bash`, a `SendFeedback`) that the machine today maps to `working`.

**S1: two background subagents, main agent woken.** Claude Code blocks a foreground `sleep 30`, so each subagent ran it as a background shell, handed back "done" early, stopped, and was started again (`SubagentStart`, same id) 30 s later when its shell ended. Order: `UserPromptSubmit` → 2× (`PreToolUse Agent`, `SubagentStart`, `PostToolUse Agent`) → `Stop` [2 subagents] → hand-back of subagent 1 → `UserPromptSubmit <agent-message>` → `SubagentStop` 1 → `Stop` [subagent 2 + 2 shells] → `UserPromptSubmit <task-notification>` 1 → `SubagentStop` 2 → `Stop` [2 shells] → `UserPromptSubmit <task-notification>` 2 → side-agent tool event → `Stop` [2 shells] → 18 s → `SubagentStart` 1 and 2 → hand-back → `SubagentStop` 2 and 1 → `Stop` **[]** → 28 ms → 2× `UserPromptSubmit <task-notification>` → `Stop` [] (the job's real end). Today: six `waiting` notifications. Counting `SubagentStart`/`SubagentStop` (the first plan): `waiting` at the two `Stop`s with only shells running, and twice at the end.

**S2: approval while another subagent works.** Subagent B's `PreToolUse Write` → `PermissionRequest Write` (B's `agent_id`) → subagent A's tool events → `Notification permission_prompt` (no `agent_id`) → A's ten tool events over 30 s while the question is open → the owner approves → `PostToolUse Write` (B) → `SubagentStop` B → `UserPromptSubmit <task-notification>` B → `Stop` [A] → `SubagentStop` A → `UserPromptSubmit <task-notification>` A → `Stop` []. Today the view drops to `working` at A's first event after the question.

**S3: the idle subagent.** The first attempt did not measure anything, because Claude Code refused a foreground `sleep 120` and the subagent returned within 10 s. Round 2 re-ran it two ways. S3a had one background subagent running `sleep 5` twenty times, about 2.5 min. S3b had one background subagent blocked on a single silent 100 s command. **In both, `idle_prompt` fired 60 s after the main agent's `Stop` while the subagent was still running.** That is the stop point. The owner then decided the rule: `idle_prompt` counts only when the last `Stop` listed nothing. After each job's real end, `idle_prompt` fired again 60 s later. Every S3 job also showed the end race: `Stop` [] → 3 to 26 ms → `UserPromptSubmit <task-notification>` → `Stop` [].

**S4: a background Bash (was out of scope).** `PreToolUse Bash` (`run_in_background`) → `Stop` [1 shell] → 30 s → `UserPromptSubmit <task-notification>` with the shell's task id → `Stop` []. The case is visible through `background_tasks`, so it is in scope now.

**S5: a foreground subagent.** Asked explicitly for the foreground, the subagent still ran in the background: `Stop` came right after the launch, listing it. Foreground subagents were not observed on this version. So a subagent owes a result only when its own `SubagentStop` lists it (ASUB-14).

**Owner decisions taken on these findings** (spec, assumptions table): decide at `Stop` by `background_tasks`, shells included; hold `working` for owed results; ignore tool events from agents outside the active set; `idle_prompt` counts only when the last `Stop` listed nothing; resync the subagent count at every `Stop`.

---

### T2: Sanitised fixtures of the captured sequences ✅

**What**: S1, S2, S3a and S4 as typed arrays of hook payloads, keeping the captured event order and reduced to the fields the machine reads: `hook_event_name`, `agent_id`, `agent_type`, `tool_name`, `notification_type`, `reason`, `background_tasks` as `{ id, type }`, and a `UserPromptSubmit` prompt kept only as its `<task-notification>` / `<task-id>` marker or a fixed fictitious sentence. Every id is fictitious and readable (`sub-1`, `side-1`, `shell-1`). A test rejects anything that looks real.
**Where**: `src/main/activity-sequences.fixture.ts` (new) and `src/main/activity-sequences.fixture.test.ts` (new)
**Depends on**: T1
**Reuses**: payload field names read by `applyHookEvent`
**Requirement**: ASUB-12, ASUB-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each fixture keeps the captured event order exactly, side agents included — generated from the raw log in arrival order, not written by hand
- [x] The sanitisation test fails on a planted `C:\Users\…` string, a drive-letter path, a UUID-shaped id and a 17-hex agent id (seen failing: each plant in the real fixture gave 1 failed of 17, then the file was restored byte for byte; `findLeaks` keeps one test per shape)
- [x] Gate check passes: `npm test` (typecheck and lint too; lint still 18 warnings)
- [x] Test count: baseline + the sanitisation tests (no silent deletions) — 1663 + 17 = 1680

**Tests**: unit
**Gate**: quick

**Commit**: `test(activity): add sanitised hook sequences captured from claude code`

---

### T3: The end of a turn waits for background work ✅

**What**: A main-agent `Stop` (no `agent_id`) records `background` from its `background_tasks` and replaces the active set with its `subagent` entries; it maps to `working` when the list is non-empty and to `waiting` when empty. Without the field, the active set decides (ASUB-16). A `SubagentStop` never moves the state to `waiting`. `idle_prompt` maps to `waiting` only when `background` is empty (or, without it, the active set is), emptying the set; otherwise it changes nothing. *Moved at Execute:* `mainStopped` is read only by T5's clearing rule, so it is built and tested there.
**Where**: `src/main/activity-machine.ts`
**Depends on**: T2
**Reuses**: `to`, `withSubagents`, `applySubagent`
**Requirement**: ASUB-01, ASUB-02, ASUB-03, ASUB-05, ASUB-16, ASUB-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Unit tests, one per criterion, plus the S3a and S4 replays asserting `working` at every `Stop` that listed work and after the mid-job `idle_prompt`
- [x] The spec's edge cases covered: a new prompt keeps the active set; a restarted subagent is counted again; `SessionEnd` empties the set; an unknown `SubagentStop`
- [x] Existing machine tests pass unedited, except `keeps the subagent count across a state change` (`activity-machine.test.ts:225`), whose `Stop` with an active subagent now means `working` (ASUB-16): its transition becomes a `PermissionRequest`, which keeps what it tests, and the change is stated in the commit body — approved by the owner with the re-plan
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (lint still 18 warnings)
- [x] Test count: T2 count + the new tests — 1680 + 13 = 1693

**Tests**: unit
**Gate**: full

**Commit**: `fix(activity): keep a session working while background work runs`

---

### T4: The end of a job waits for the results it owes ✅

**What**: A `SubagentStop` whose `background_tasks` lists the stopping subagent adds it to `owed`; a main-agent `Stop` maps to `working` while `owed` is non-empty; a `UserPromptSubmit` whose prompt contains `<task-id>{id}</task-id>` drops `{id}` from `owed`; an accepted `idle_prompt` and `SessionEnd` empty it.
**Where**: `src/main/activity-machine.ts`
**Depends on**: T3
**Reuses**: T3's `background` and the `Stop` rule
**Requirement**: ASUB-14, ASUB-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Unit tests, one per criterion, plus the S1 replay asserting `working` from the first `Stop` to the last and `waiting` only at the last (S3a replayed the same way)
- [x] A `SubagentStop` that does not list its own agent owes nothing (the foreground shape, S5)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (lint still 18 warnings)
- [x] Test count: T3 count + the new tests — 1693 + 9 = 1702

**Tests**: unit
**Gate**: full

**Commit**: `fix(activity): wait for owed subagent results before the turn ends`

---

### T5: Events count only for the agent that sent them ✅

**What**: A tool event whose `agent_id` is not in the active set changes nothing (side agents, ASUB-18). `PermissionRequest`, `Elicitation` and the approval/input notifications record `askedBy` (a `Notification` without `agent_id` keeps an existing one). While a question is pending, events from other agents update the bookkeeping but not the state. `mainStopped` (moved here from T3) is set by a main-agent `Stop` and cleared by `UserPromptSubmit` and main-agent tool events. The asker's tool event, `ElicitationResult` or `SubagentStop` clears it to `working` or `waiting` by `mainStopped`, `background` and `owed`. The keystroke keeps clearing (ASUB-11).
**Where**: `src/main/activity-machine.ts`
**Depends on**: T4
**Reuses**: `applyKeystroke`; T3's `mainStopped` and `background`; T4's `owed`
**Requirement**: ASUB-06, ASUB-07, ASUB-08, ASUB-11, ASUB-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Unit tests, one per criterion, plus the S2 replay asserting `needs-approval` holds across the other subagent's tool events and the no-`agent_id` notification, and clears at the asker's `PostToolUse`
- [x] The S1 side-agent tool event leaves the view unchanged
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (lint still 18 warnings)
- [x] Test count: T4 count + the new tests — 1702 + 25 = 1727
- [x] Decided at Execute, not in the spec before: two agents asking at once. The question stays until every asker has moved (spec, edge cases); a notification is nobody's act, which matters when the main agent asked (a test kills the mutant without that exception)

**Tests**: unit
**Gate**: full

**Commit**: `fix(activity): keep a question on screen until it is answered`

---

### T6: One notification per background job ✅

**What**: A test that replays each fixture (S1, S2, S3a, S4) through `applyHookEvent` and `decideNotification` (app unfocused, `waiting` enabled) and counts exactly one `waiting` notification per job, at its last `Stop`.
**Where**: `src/main/activity-notification.test.ts`
**Depends on**: T5
**Reuses**: T2's fixtures; the file's existing input builders
**Requirement**: ASUB-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The test fails on T2's tree state (before T3) — checked by running it against `activity-machine.ts` from T2's commit in a scratch copy — and passes now. On T2's machine the `waiting` notifications were S1 6, S2 3, S3a 4, S4 2; now 1 each, at the last `Stop`
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build` (lint still 18 warnings)
- [x] Test count: T5 count + the new tests — 1727 + 4 = 1731

**Tests**: unit
**Gate**: build

**Commit**: `test(notifications): notify a background job once, at its end`

---

### T7: Check it in the real app ✅

**What**: With the dev app unfocused, the owner runs a registry Claude session that fans out to two background subagents, one of which asks for approval; record the notifications received and the states seen.
**Where**: `.specs/features/activity-subagent-attribution/tasks.md` (result)
**Depends on**: T6
**Reuses**: T1's S1 and S2 prompts
**Requirement**: success criteria (ASUB-04, ASUB-06..08 end to end)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Exactly one `waiting` notification, at the job's real end — owner report, 2026-09-25: after approving, one "Finished its turn"
- [x] The approval shows `needs-approval` until answered, with the other subagent running — owner report: one approval notification for `WebFetch` while subagent A ran its sleeps, no other notification until the end
- [ ] The test session is removed from the app afterwards — left to the owner, who drove the dev app

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the real-app check of subagent attribution`

#### Result (2026-09-25)

Dev app from this branch, window unfocused, a registry Claude session, prompt: two background subagents, A running `sleep 5` eight times, B needing approval.

- First run: B used `Write` on a file in the temp folder and Claude Code did not ask, even in the default permission mode; the file was written. The owner's global rules allow no `Write`, and the registry launch only adds `--add-dir`, so the grant came from elsewhere (not pursued). No approval was exercised.
- Second run: B used `WebFetch` on a domain the rules do not allow. One notification asked for approval of `WebFetch`; after the owner approved it, one "Finished its turn" arrived at the end, and nothing else.

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1
Phase 2:  T1 ---→ T2 ---→ T3 ---→ T4 ---→ T5 ---→ T6
Phase 3:  T6 ---→ T7
```

Seven tasks: a single batch, executed inline. The Verifier runs after T7.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: capture | 1 measurement, recorded | ✅ Granular |
| T2: fixtures | 1 fixture module + its guard test | ✅ Granular |
| T3: end of turn | 1 rule (the `Stop` / `idle_prompt` decision) in 1 function | ✅ Granular |
| T4: owed results | 1 rule in 1 function | ✅ Granular |
| T5: attribution | 1 rule (who may change the state) in 1 function | ✅ Granular |
| T6: notification replay | 1 test | ✅ Granular |
| T7: real app | 1 manual check | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: capture | spec docs | none | none | ✅ OK |
| T2: fixtures | test fixtures | unit | unit | ✅ OK |
| T3: end of turn | activity machine | unit | unit | ✅ OK |
| T4: owed results | activity machine | unit | unit | ✅ OK |
| T5: attribution | activity machine | unit | unit | ✅ OK |
| T6: notification replay | notification tests | unit | unit | ✅ OK |
| T7: real app | spec docs | none (manual) | none | ✅ OK |
