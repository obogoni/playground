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

The Claude Code docs were silent on the facts a fix depends on. T1 measured them on Claude Code
2.1.283 (findings in `tasks.md`, T1), and the rules below rest on those measurements:

- The main agent's `Stop` carries `background_tasks`: every background subagent **and shell** still
  running, including shells a subagent started. It was non-empty at every `Stop` in the middle of a
  job and empty at the job's end.
- Tool hooks fired inside a subagent carry `agent_id` and `agent_type`; the main agent's carry
  neither. The `permission_prompt` notification carries no `agent_id`.
- A background result wakes the main agent with a `UserPromptSubmit` whose prompt holds
  `<task-notification>` and `<task-id>{id}</task-id>`.
- At the end of a job the main agent's `Stop` can arrive with an empty `background_tasks` a few
  milliseconds before the last result is delivered, which then wakes it for one more turn.
- `idle_prompt` fires 60 s after the main agent stops, whether or not subagents are still running.
- Claude Code's own side agents (prompt suggestion, session recap) send `SubagentStop`, and
  sometimes tool events, with an `agent_id`, no `agent_type` and no `SubagentStart`.

## Goals

- [ ] While background work is running, the session never says "your turn" and never notifies `waiting`
- [ ] A permission or input question stays on screen until it is answered
- [ ] Every rule is proven against hook sequences captured from a real Claude Code session

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Monitor waking the main agent | Not measured by T1. Background Bash is in scope since T1: `background_tasks` lists it |
| A new "waiting on subagents" state, colour or preference | Owner decision (grill Q1): the session shows `working` with its subagent count |
| Delaying the `waiting` notification | Owner decision (grill Q5): it would delay every legitimate notification. The end-of-job race is handled by the owed-result rule instead (owner, T1 review) |
| Changes to the notification decision (`activity-notification.ts`) | Not needed: it notifies only on entering `waiting`, which the machine stops producing in these cases |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What decides "your turn" at the main agent's `Stop` | The `Stop`'s `background_tasks`: non-empty means `working`, empty means `waiting`, subagents and shells alike | Owner decision (T1 review). Counting `SubagentStart`/`SubagentStop` failed in T1: subagents that started a background shell stopped, and started again 30 s later with the same id | y |
| A `Stop` without `background_tasks` (an older Claude Code) | The active subagent set decides, as the original plan did | Degrade path; the field is not documented | y |
| The end-of-job race | A background subagent that stops while listed in its own `SubagentStop`'s `background_tasks` owes a result; `Stop` stays `working` until a `UserPromptSubmit` carries `<task-id>{its id}</task-id>` | Owner decision (T1 review). Measured in every hand-back job: without it, two notifications per job | y |
| What `idle_prompt` does | `waiting` only when the last main-agent `Stop`'s `background_tasks` was empty; then the active set and owed results are emptied. Otherwise it changes nothing | Owner decision (T1 review). T1 saw `idle_prompt` with a subagent running, in S3a and S3b; the original rule would say "your turn" 60 s into every long job | y |
| The subagent count shown | Replaced at every main-agent `Stop` by the subagent entries of its `background_tasks` | Owner decision (T1 review): heals a count stuck by a lost `SubagentStop` | y |
| Claude Code's side agents | A tool event whose `agent_id` is not in the active set changes nothing | Owner decision (T1 review): they flip `waiting` to `working` today | y |
| What clears a pending question | Its answer: a keystroke in the session's terminal (ACTV-12), or the agent that asked acting again or stopping | Owner decision (grill Q3); T1 measured that tool hooks carry `agent_id`, so the per-agent rule ships | y |
| How facts are measured | An owner-driven interactive Claude Code session in a scratch folder, its hooks posted to a throwaway listener that logs each payload in order | Owner decision (grill Q2). Approvals need a human, and `--settings` keeps the owner's real hook configuration untouched | y |
| Test fixtures | The captured sequences, reduced to the fields the machine reads, with ids, paths, prompts and messages replaced by fictitious values | Public repository (privacy guardrail) | y |
| Base branch | `feature/activity-subagent-attribution` off `feature/session-idle-notifications` (PR #94, tip `9e81522`); #94 merged, so on 2026-09-25 the branch was rebased onto `origin/main` and its PR closes #106 | Owner decision (grill Q7) | y |

**Open questions:** none.

---

## User Stories

### P1: No "your turn" while background work runs ⭐ MVP

**User Story**: As the owner running agents that fan out to background subagents, I want the session to stay `working` until the whole job is done so that a notification means it is really my turn.

**Why P1**: It is the reported defect.

**Acceptance Criteria**:

1. WHEN the main agent's `Stop` arrives with a non-empty `background_tasks` THEN the machine SHALL set the state to `working`
2. WHEN a `SubagentStop` arrives THEN the machine SHALL NOT set the state to `waiting`
3. WHEN the main agent's `Stop` arrives with an empty `background_tasks` and no owed result THEN the machine SHALL set the state to `waiting`
4. WHEN each captured sequence is replayed through the machine and `decideNotification` THEN exactly one `waiting` notification SHALL result per job, at the job's last `Stop`
5. WHEN an `idle_prompt` notification arrives THEN the machine SHALL set `waiting` and empty the active set and the owed results IF the last main-agent `Stop` had an empty `background_tasks`, and SHALL NOT change the state otherwise
14. WHEN a subagent's `SubagentStop` lists that subagent in its own `background_tasks` THEN the machine SHALL record a result owed by it, and a main-agent `Stop` SHALL set `working` WHILE any result is owed
15. WHEN a `UserPromptSubmit` prompt contains `<task-id>{id}</task-id>` THEN the machine SHALL drop the result owed by `{id}`
16. WHERE a main-agent `Stop` carries no `background_tasks`, the machine SHALL set `working` WHILE the active subagent set is non-empty and `waiting` otherwise, and `idle_prompt` SHALL decide by the same set
17. WHEN the main agent's `Stop` carries `background_tasks` THEN the active subagent set SHALL become the ids of its `subagent` entries, and the view's count SHALL equal their number

**Independent Test**: Replay the captured fan-out sequence; the view is `working` from the first `Stop` to the last, and `waiting` only after the last.

---

### P1: A question stays until it is answered ⭐ MVP

**User Story**: As the owner, I want a permission or input question to stay visible while other agents keep working so that I do not miss it.

**Why P1**: The observed `needs-approval` → `working` with the question still open.

**Acceptance Criteria**:

6. WHEN a subagent's `PermissionRequest` or `Elicitation` arrives THEN the machine SHALL set `needs-approval` (naming the tool) or `needs-input`, and record that subagent as the one that asked
7. WHILE a question is pending, an event from any agent other than the one that asked SHALL NOT change the state; a `Notification` without `agent_id` SHALL NOT change who asked
8. WHEN the agent that asked sends a tool event, an `ElicitationResult` or its `SubagentStop` THEN the machine SHALL clear the question to `working` if the main agent's turn is running, `background_tasks` was non-empty at the last `Stop`, or a result is owed, and to `waiting` otherwise
9. N/A — T1: tool hooks fired inside a subagent carry `agent_id`, so the fallback for hooks that do not identify their agent is not built
10. N/A — T1: same finding as criterion 9
11. WHEN the owner types into the session's terminal WHILE a question is pending THEN the machine SHALL set the state to `working` (ACTV-12, unchanged)
18. WHEN a `PreToolUse`, `PostToolUse` or `PostToolUseFailure` carries an `agent_id` that is not in the active subagent set THEN the machine SHALL NOT change the state

**Independent Test**: Replay the captured sequence where a subagent asks for approval while another keeps running tools; the view stays `needs-approval` until the asking agent's next event or a keystroke.

---

### P1: Rules proven on real sequences ⭐ MVP

**User Story**: As the owner, I want the machine's tests to replay what Claude Code really sends so that the fix does not rest on undocumented guesses.

**Why P1**: The docs are silent on every fact the rules depend on.

**Acceptance Criteria**:

12. The machine's unit tests SHALL replay each captured sequence (S1 fan-out with wake-ups and subagent-owned shells; S2 a subagent asking for approval while another runs; S3a `idle_prompt` while a subagent runs; S4 a background shell) and assert the view after every event that the criteria above name
13. The committed fixtures SHALL contain no real path, prompt, message, session id or work item: ids and text are fictitious

**Independent Test**: The fixtures load; a reviewer finds no string from the owner's machine in them.

---

## Edge Cases

- IF a `SubagentStop` names an agent not in the active set THEN the machine SHALL apply it without error and the count SHALL stay at or above zero (ACTV-34, unchanged)
- WHEN a `SubagentStart` names an agent that stopped before THEN the machine SHALL add it to the active set again (T1: a subagent restarts when its background shell ends)
- WHEN the owner submits a new prompt WHILE subagents are active THEN the machine SHALL set `working` and keep the active set (background subagents outlive a turn)
- WHEN `SessionEnd` arrives THEN the active set and the owed results SHALL be emptied, whatever question is pending

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| ASUB-01 | P1: no "your turn" — AC 1 | Tasks | In Tasks |
| ASUB-02 | P1: no "your turn" — AC 2 | Tasks | In Tasks |
| ASUB-03 | P1: no "your turn" — AC 3 | Tasks | In Tasks |
| ASUB-04 | P1: no "your turn" — AC 4 | Tasks | In Tasks |
| ASUB-05 | P1: no "your turn" — AC 5 | Tasks | In Tasks |
| ASUB-06 | P1: question stays — AC 6 | Tasks | In Tasks |
| ASUB-07 | P1: question stays — AC 7 | Tasks | In Tasks |
| ASUB-08 | P1: question stays — AC 8 | Tasks | In Tasks |
| ASUB-09 | P1: question stays — AC 9 | — | N/A — T1: tool hooks carry `agent_id` |
| ASUB-10 | P1: question stays — AC 10 | — | N/A — T1: tool hooks carry `agent_id` |
| ASUB-11 | P1: question stays — AC 11 | Tasks | In Tasks |
| ASUB-12 | P1: real sequences — AC 12 | Tasks | In Tasks |
| ASUB-13 | P1: real sequences — AC 13 | Tasks | In Tasks |
| ASUB-14 | P1: no "your turn" — AC 14 | Tasks | In Tasks |
| ASUB-15 | P1: no "your turn" — AC 15 | Tasks | In Tasks |
| ASUB-16 | P1: no "your turn" — AC 16 | Tasks | In Tasks |
| ASUB-17 | P1: no "your turn" — AC 17 | Tasks | In Tasks |
| ASUB-18 | P1: question stays — AC 18 | Tasks | In Tasks |

**Coverage:** 18 total, 16 mapped to tasks, 2 N/A by T1's finding, 0 unmapped.

---

## Success Criteria

- [ ] A fan-out job run in the background with the app unfocused produces one notification, at its real end
- [ ] A subagent's permission question stays `needs-approval` until answered, with other subagents running
