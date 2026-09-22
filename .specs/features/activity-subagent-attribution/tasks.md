# Activity Subagent Attribution Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: none as a separate file — one module changes (`activity-machine.ts`) and its shape is fixed below. The machine grows two private fields on `MachineState`: whether the main agent's turn has ended (`mainStopped`), and who asked the pending question (`askedBy`: an `agent_id`, or `main`). The view (`SessionActivity`) does not change, so IPC, renderer and notifications are untouched.
**Status**: Draft — awaiting owner approval (planned 2026-09-22)

**Branch**: `feature/activity-subagent-attribution` off `feature/session-idle-notifications` `9e81522` (PR #94). PR carries "depends on #94"; once #94 merges, `git rebase --onto origin/main feature/session-idle-notifications feature/activity-subagent-attribution`.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute; record the lint warning count at the same time.

**Stop points**:
- **T1 needs the owner** at the keyboard: approvals must be answered by a person.
- **After T1**, execution stops if `idle_prompt` fired while a subagent was active (spec, Q8 row) — the owner decides again.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts; style sampled from `src/main/activity-machine.test.ts` and `src/main/activity-notification.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure activity machine (`activity-machine.ts`) | unit | 1:1 to ASUB-01..11; every edge case in the spec; each captured sequence replayed with the view asserted after every named event | `src/main/activity-machine.test.ts` | `npm test` |
| Test fixtures (`activity-sequences.fixture.ts`) | unit | ASUB-13: a test fails on any path, drive letter, UUID-shaped id or non-fictitious text | `src/main/activity-sequences.fixture.test.ts` | `npm test` |
| Notification decision (`activity-notification.ts`, unchanged) | unit | ASUB-04 by replay; existing tests pass unedited | `src/main/activity-notification.test.ts` | `npm test` |
| Spike listener and settings | none | Throwaway, scratchpad only, never committed | — | — |
| Real app check | manual | Success criteria, owner-driven | — | `npm run dev` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | At the end | `npx electron-vite build` |
| Manual | T1, T6 | owner-driven Claude Code session |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: Measure

```
T1
```

### Phase 2: The machine

```
T1 → T2 → T3 → T4 → T5
```

### Phase 3: Real app

```
T5 → T6
```

---

## Task Breakdown

### T1: Capture the real hook sequences

**What**: In a scratch folder, run an owner-driven interactive `claude --settings <scratch settings>` whose http hooks post every event to a throwaway listener that logs each payload in order; drive three scenarios — (S1) two background subagents each running a 30 s sleep, main agent ends its turn and is woken; (S2) one background subagent asks for approval while another keeps running tools; (S3) a background subagent sleeping 120 s with no input for over 60 s — and record the findings in this file.
**Where**: `.specs/features/activity-subagent-attribution/tasks.md` (findings); listener, settings and raw logs stay in the scratchpad
**Depends on**: None
**Reuses**: the hook list of `src/main/claude-hook-settings.ts`, so the probe hears exactly what the app hears; http hooks, not command hooks (AD-020: they differ)
**Requirement**: ASUB-05, ASUB-07..10 (decides), ASUB-12 (source)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Recorded, with the event order of each scenario: does `Stop` fire with a subagent active; what fires when the main agent is woken (`UserPromptSubmit` or only tool events); does `SubagentStop` precede the wake-up
- [ ] Recorded: do `PreToolUse`, `PostToolUse`, `PermissionRequest` and `Notification` fired inside a subagent carry `agent_id` — decides ASUB-07/08 versus ASUB-09/10
- [ ] Recorded: did `idle_prompt` fire in S3 while the subagent was active — if yes, **stop** and return the Q8 decision to the owner
- [ ] Recorded, if seen: a background Bash waking the main agent (out of scope; noted for a later item)
- [ ] The owner's `~/.claude/settings.json` unchanged (hash before and after)
- [ ] Baselines recorded: test count, lint warning count

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record how claude code reports background subagents`

---

### T2: Sanitised fixtures of the captured sequences

**What**: The S1, S2 (and S3, if it produced `idle_prompt`) sequences as typed arrays of hook payloads, reduced to the fields the machine reads, with fictitious ids and text, plus a test that rejects anything that looks real.
**Where**: `src/main/activity-sequences.fixture.ts` (new) and `src/main/activity-sequences.fixture.test.ts` (new)
**Depends on**: T1
**Reuses**: payload field names read by `applyHookEvent`
**Requirement**: ASUB-12, ASUB-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each fixture keeps the captured event order exactly
- [ ] The sanitisation test fails on a planted `C:\Users\…` string, a drive-letter path and a UUID-shaped id (seen failing, then the plant removed)
- [ ] Gate check passes: `npm test`
- [ ] Test count: baseline + the sanitisation tests (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `test(activity): add sanitised hook sequences captured from claude code`

---

### T3: The main agent's end of turn waits for its subagents

**What**: `Stop` with subagents active maps to `working` and sets `mainStopped`; a `SubagentStop` never moves the state to `waiting`; `UserPromptSubmit` and main-agent tool events clear `mainStopped`; `idle_prompt` maps to `waiting` and empties the active set.
**Where**: `src/main/activity-machine.ts`
**Depends on**: T2
**Reuses**: `to`, `withSubagents`, `applySubagent`
**Requirement**: ASUB-01, ASUB-02, ASUB-03, ASUB-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Unit tests, one per criterion, plus the S1 replay asserting `working` from the first `Stop` to the last and `waiting` only after it
- [ ] The spec's edge cases (new prompt keeps the active set; `SessionEnd` empties it; unknown `SubagentStop`) covered
- [ ] Existing machine tests pass unedited, except `waits on an idle_prompt …`, which gains the emptied set — the only edit, stated in the commit body
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: T2 count + the new tests

**Tests**: unit
**Gate**: full

**Commit**: `fix(activity): keep a session working while its subagents run`

---

### T4: A pending question stays until the agent that asked moves

**What**: `PermissionRequest`, `Elicitation` and the approval/input notifications record `askedBy`; while a question is pending, events are filtered by the rule T1 chose (by `agent_id`: ASUB-07/08; without it: ASUB-09/10); clearing resolves to `working` or `waiting` by `mainStopped` and the active set; the keystroke keeps clearing (ASUB-11).
**Where**: `src/main/activity-machine.ts`
**Depends on**: T3
**Reuses**: `applyKeystroke`; T3's `mainStopped`
**Requirement**: ASUB-06, ASUB-07, ASUB-08 **or** ASUB-09, ASUB-10; ASUB-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Unit tests, one per kept criterion, plus the S2 replay asserting `needs-approval` holds across the other subagent's tool events and clears at the asker's event (or at the fallback's triggers)
- [ ] The two criteria of the unused pair marked `N/A — T1: <finding>` in the spec
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: T3 count + the new tests

**Tests**: unit
**Gate**: full

**Commit**: `fix(activity): keep a question on screen until it is answered`

---

### T5: One notification for a whole fan-out

**What**: A test that replays S1 through `applyHookEvent` and `decideNotification` (app unfocused, `waiting` enabled) and counts exactly one `waiting` notification, at the final `Stop`.
**Where**: `src/main/activity-notification.test.ts`
**Depends on**: T4
**Reuses**: T2's S1 fixture; the file's existing input builders
**Requirement**: ASUB-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The test fails on T2's tree state (before T3) — checked by running it against `activity-machine.ts` from T2's commit in a scratch copy — and passes now
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`
- [ ] Test count: T4 count + 1

**Tests**: unit
**Gate**: build

**Commit**: `test(notifications): notify a background fan-out once, at its end`

---

### T6: Check it in the real app

**What**: With the dev app unfocused, the owner runs a registry Claude session that fans out to two background subagents, one of which asks for approval; record the notifications received and the states seen.
**Where**: `.specs/features/activity-subagent-attribution/tasks.md` (result)
**Depends on**: T5
**Reuses**: T1's S1 and S2 prompts
**Requirement**: success criteria (ASUB-04, ASUB-06..10 end to end)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Exactly one `waiting` notification, at the job's real end
- [ ] The approval shows `needs-approval` until answered, with the other subagent running
- [ ] The test session is removed from the app afterwards

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the real-app check of subagent attribution`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1
Phase 2:  T1 ------→ T2 ------→ T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6
```

Six tasks: a single batch, executed inline. The Verifier runs after T6.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: capture | 1 measurement, recorded | ✅ Granular |
| T2: fixtures | 1 fixture module + its guard test | ✅ Granular |
| T3: end of turn | 1 rule in 1 function | ✅ Granular |
| T4: pending question | 1 rule in 1 function | ✅ Granular |
| T5: notification replay | 1 test | ✅ Granular |
| T6: real app | 1 manual check | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: capture | spec docs | none | none | ✅ OK |
| T2: fixtures | test fixtures | unit | unit | ✅ OK |
| T3: end of turn | activity machine | unit | unit | ✅ OK |
| T4: pending question | activity machine | unit | unit | ✅ OK |
| T5: notification replay | notification tests | unit | unit | ✅ OK |
| T6: real app | spec docs | none (manual) | none | ✅ OK |
