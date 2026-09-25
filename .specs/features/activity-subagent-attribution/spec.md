# Activity Subagent Attribution Specification

## Problem Statement

The activity machine (`src/main/activity-machine.ts`, from `session-activity-status`) reads every
hook of a session as if the main agent sent it. Two defects follow when subagents run in the
background:

1. The main agent's `Stop` always maps to `waiting`, even while subagents it launched are still
   running and will wake it again. `session-idle-notifications` (PR #94) notifies on entering
   `waiting`, so the owner is told "your turn" when it is not — once per wake-up.
2. A subagent's tool event maps to `working` and overwrites a `needs-approval` another agent raised.
   The owner saw `waiting` → `needs-approval` → `working` with the permission question still open.

Measured facts are missing: the Claude Code docs are silent on which hooks fire when a background
subagent wakes the main agent, on whether tool hooks fired inside a subagent carry `agent_id`, and
on whether `idle_prompt` fires while subagents run. A spike with a real session settles them first.

## Goals

- [ ] While background subagents are running, the session never says "your turn" and never notifies `waiting`
- [ ] A permission or input question stays on screen until it is answered
- [ ] Every rule is proven against hook sequences captured from a real Claude Code session

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Background Bash (`run_in_background`) and Monitor waking the main agent | Owner decision (grill Q5): no hook reports them. The spike records whether the case occurs; if it does, it becomes its own item |
| A new "waiting on subagents" state, colour or preference | Owner decision (grill Q1): the session shows `working` with its subagent count |
| Delaying the `waiting` notification | Owner decision (grill Q5): it would delay every legitimate notification |
| Changes to the notification decision (`activity-notification.ts`) | Not needed: it notifies only on entering `waiting`, which the machine stops producing in these cases |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Main agent stopped, subagents still active | `working`, subagent count shown | Owner decision (grill Q1) | y |
| Last subagent stops after the main agent stopped | Stays `working` until the main agent's next `Stop` or an `idle_prompt` | Background results wake the main agent (docs: "a background subagent's results reach Claude as a completion notification in a later turn"); going to `waiting` in between would notify once more, the defect itself | y |
| What clears a pending question | Its answer: a keystroke in the session's terminal (ACTV-12), or the agent that asked acting again or stopping | Owner decision (grill Q3) | y |
| Hooks that do not identify their agent | While any subagent is active, tool events do not clear a pending question; the keystroke, the main agent's `Stop` or the active count reaching zero do | Owner decision (grill Q6): may hold a question on screen a little long, never drops it early | y |
| Which of the two rules above ships | Decided by T1's measurement of `agent_id` on tool hooks fired inside a subagent | Docs are silent: only `SubagentStart`/`SubagentStop` are documented to carry it | n — T1 measures |
| A subagent count stuck above zero (a lost `SubagentStop`) | `idle_prompt` moves the session to `waiting` and empties the active set | Owner decision (grill Q8) — **only if** T1 finds that `idle_prompt` does not fire while subagents run; if it does, execution stops and the question returns to the owner | n — T1 measures |
| How facts are measured | An owner-driven interactive Claude Code session in a scratch folder, its hooks posted to a throwaway listener that logs each payload in order | Owner decision (grill Q2). Approvals need a human, and `--settings` keeps the owner's real hook configuration untouched | y |
| Test fixtures | The captured sequences, reduced to the fields the machine reads, with ids, paths, prompts and messages replaced by fictitious values | Public repository (privacy guardrail) | y |
| Base branch | `feature/activity-subagent-attribution` off `feature/session-idle-notifications` (PR #94, tip `9e81522`); #94 merged, so on 2026-09-25 the branch was rebased onto `origin/main` and its PR closes #106 | Owner decision (grill Q7) | y |

**Open questions:** none — all resolved or logged above. The two `n` rows are settled by T1, each with its outcome already decided.

---

## User Stories

### P1: No "your turn" while subagents work ⭐ MVP

**User Story**: As the owner running agents that fan out to background subagents, I want the session to stay `working` until the whole job is done so that a notification means it is really my turn.

**Why P1**: It is the reported defect.

**Acceptance Criteria**:

1. WHEN the main agent's `Stop` arrives WHILE one or more subagents are active THEN the machine SHALL set the state to `working` and keep the subagent count
2. WHEN the last active subagent stops after the main agent's `Stop` THEN the machine SHALL keep the state `working`
3. WHEN the main agent's `Stop` arrives WHILE no subagent is active THEN the machine SHALL set the state to `waiting` (unchanged behaviour)
4. WHEN a captured background-subagent sequence is replayed through the machine and `decideNotification` THEN exactly one `waiting` notification SHALL result, at the main agent's final `Stop`
5. WHEN an `idle_prompt` notification arrives THEN the machine SHALL set the state to `waiting` and empty the active subagent set

**Independent Test**: Replay the captured fan-out sequence; the view is `working` from the first `Stop` to the last, and `waiting` only after the last.

---

### P1: A question stays until it is answered ⭐ MVP

**User Story**: As the owner, I want a permission or input question to stay visible while other agents keep working so that I do not miss it.

**Why P1**: The observed `needs-approval` → `working` with the question still open.

**Acceptance Criteria**:

6. WHEN a subagent's `PermissionRequest` or `Elicitation` arrives THEN the machine SHALL set `needs-approval` (naming the tool) or `needs-input`
7. WHERE tool hooks identify their agent, WHILE a question is pending, an event from any agent other than the one that asked SHALL NOT change the state
8. WHERE tool hooks identify their agent, WHEN the agent that asked sends a tool event or its `SubagentStop` THEN the machine SHALL clear the question to `working` if the main agent's turn is running or any subagent is active, and to `waiting` otherwise
9. WHERE tool hooks do not identify their agent, WHILE a question is pending and one or more subagents are active, a tool event SHALL NOT change the state
10. WHERE tool hooks do not identify their agent, WHILE a question is pending, WHEN the main agent's `Stop` arrives or the active subagent count reaches zero THEN the machine SHALL clear the question by the rule of criterion 8
11. WHEN the owner types into the session's terminal WHILE a question is pending THEN the machine SHALL set the state to `working` (ACTV-12, unchanged)

**Independent Test**: Replay the captured sequence where a subagent asks for approval while another keeps running tools; the view stays `needs-approval` until the asking agent's next event or a keystroke.

---

### P1: Rules proven on real sequences ⭐ MVP

**User Story**: As the owner, I want the machine's tests to replay what Claude Code really sends so that the fix does not rest on undocumented guesses.

**Why P1**: The docs are silent on every fact the rules depend on.

**Acceptance Criteria**:

12. The machine's unit tests SHALL replay each captured sequence (fan-out with wake-ups; a subagent asking for approval while another runs; `idle_prompt` while subagents run, if it occurred) and assert the view after every event that the criteria above name
13. The committed fixtures SHALL contain no real path, prompt, message, session id or work item: ids and text are fictitious

**Independent Test**: The fixtures load; a reviewer finds no string from the owner's machine in them.

---

## Edge Cases

- IF a `SubagentStop` names an agent not in the active set THEN the machine SHALL apply it without error and the count SHALL stay at or above zero (ACTV-34, unchanged)
- WHEN the owner submits a new prompt WHILE subagents are active THEN the machine SHALL set `working` and keep the active set (background subagents outlive a turn)
- WHEN `SessionEnd` arrives THEN the active set SHALL be emptied as today, whatever question is pending

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| ASUB-01 | P1: no "your turn" — AC 1 | Tasks | In Tasks |
| ASUB-02 | P1: no "your turn" — AC 2 | Tasks | In Tasks |
| ASUB-03 | P1: no "your turn" — AC 3 | Tasks | In Tasks |
| ASUB-04 | P1: no "your turn" — AC 4 | Tasks | In Tasks |
| ASUB-05 | P1: no "your turn" — AC 5 | Tasks | In Tasks (conditional on T1) |
| ASUB-06 | P1: question stays — AC 6 | Tasks | In Tasks |
| ASUB-07 | P1: question stays — AC 7 | Tasks | In Tasks (if T1 finds `agent_id`) |
| ASUB-08 | P1: question stays — AC 8 | Tasks | In Tasks (if T1 finds `agent_id`) |
| ASUB-09 | P1: question stays — AC 9 | Tasks | In Tasks (if T1 finds no `agent_id`) |
| ASUB-10 | P1: question stays — AC 10 | Tasks | In Tasks (if T1 finds no `agent_id`) |
| ASUB-11 | P1: question stays — AC 11 | Tasks | In Tasks |
| ASUB-12 | P1: real sequences — AC 12 | Tasks | In Tasks |
| ASUB-13 | P1: real sequences — AC 13 | Tasks | In Tasks |

**Coverage:** 13 total, 13 mapped to tasks, 0 unmapped. ASUB-07/08 and ASUB-09/10 are alternatives; T1 keeps one pair and marks the other `N/A`.

---

## Success Criteria

- [ ] A fan-out job run in the background with the app unfocused produces one notification, at its real end
- [ ] A subagent's permission question stays `needs-approval` until answered, with other subagents running
