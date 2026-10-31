# Worktree Clock Sums the Linked Task Specification

Issue: #186

## Problem Statement

The worktree detail page's clock sums only periods whose `cwd` is the worktree
folder (`worktreeTotalMs`, TIME-25). A user who launches sessions from a preset
whose folder is the workspace root, links them to a task, and lets the agent work
in a worktree whose branch names that task sees the task card at `08:08` and the
worktree page at `00:00`. The time is recorded; the worktree clock reads it by the
wrong key.

## Goals

- [ ] A worktree whose branch names a task shows that task's total, the same number as the task card
- [ ] A worktree whose branch names no task keeps today's folder total
- [ ] Time already recorded counts, with no change to the time log

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Where periods are recorded | #185 (session follows the worktree) owns that |
| Showing task total and folder total side by side | Owner chose the task total alone |
| The Hours view's grouping, the rail clocks | Already keyed by task; untouched |
| A task pinned to a worktree by hand | No such link exists; the page's "Linked task" is read from the branch only |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Which task is "linked" | The id the page already shows under "Linked task": `taskIdFromBranch(worktree.branch)` | Keeps the clock and the label beside it in agreement | y |
| The task total | `taskTotalMs` (union of every period carrying the id, across folders, TIME-26) | It is what the task card shows | y |
| Linked task not pinned | Still sum by the task id | The time log carries the id whether or not the task is pinned | y |
| Remaining implicit dimensions (persistence, concurrency, external calls, auth) | N/A | Pure read-side change over an existing snapshot | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: The worktree clock shows its task's time ⭐ MVP

**User Story**: As a developer whose sessions start outside the worktree folder, I want the worktree clock to show my task's total, so that the worktree page and the task card agree.

**Why P1**: It is the whole request.

**Acceptance Criteria**:

1. WHEN the worktree's branch names a task THEN the worktree clock SHALL show the union of every period carrying that task id, in any folder. <!-- event-driven -->
2. WHEN the worktree's branch names no task THEN the worktree clock SHALL show the union of every period whose folder is the worktree path, compared case-insensitively. <!-- event-driven -->
3. WHILE an open period carries the worktree's task id the worktree clock SHALL tick live. <!-- state-driven -->
4. WHILE the worktree's branch names no task and an open period is in the worktree folder the worktree clock SHALL tick live. <!-- state-driven -->
5. The worktree clock SHALL count periods already in the time log, with no change to how periods are recorded. <!-- ubiquitous -->

**Independent Test**: With a period for `Task #4821` recorded in `D:\work\acme` and a worktree on `feature/4821-fix-login`, the worktree page shows the period's length, not `00:00`.

---

## Edge Cases

- WHEN the worktree names a task and some periods in its folder carry another task or none THEN the worktree clock SHALL count only the periods carrying its task.
- WHEN periods of the task overlap (two sessions at once) THEN the worktree clock SHALL count the overlap once, as the task card does.
- WHEN the worktree names a task with no recorded time THEN the worktree clock SHALL show `00:00`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| WTCK-01 | P1 (AC 1, edge cases 1-3) | Execute | Implementing |
| WTCK-02 | P1 (AC 2) | Execute | Implementing |
| WTCK-03 | P1 (AC 3) | Execute | Implementing |
| WTCK-04 | P1 (AC 4) | Execute | Implementing |
| WTCK-05 | P1 (AC 5) | Execute | Implementing |

**Coverage:** 5 total, 5 mapped to Execute, 0 unmapped

---

## Success Criteria

- [ ] A worktree on a task branch shows the same time as that task's card
