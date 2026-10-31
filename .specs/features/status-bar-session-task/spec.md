# Status Bar Follows the Session's Task Specification

Issue: (filed at push time)

## Problem Statement

In Agents, the status bar describes the selected session's folder: the worktree it
follows (SFWT-11), else the folder it was launched in (STBR-03, STBR-04). A session
launched at an agents-workspace root with a linked task, before its agent edits any
file in the task's worktree, follows nothing. Its card already sits under the task,
but the bar names the root's repo and branch (for example `Acme · main`) instead of
the task's worktree. Selecting that worktree in the tree shows the task; selecting
the session does not show the worktree.

## Goals

- [x] A selected session that follows no worktree and has a linked task shows the task's worktree in the status bar
- [x] Every other session keeps the bar it shows today

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Setting `followedPath` from the linked task | Following stays edit-driven (SFWT); this changes what the bar describes only |
| Session card, hours, terminal, respawn | They already group by the task or keep the launch folder on purpose |
| Choosing between several worktrees of one task | No rule picks one without guessing; the bar keeps the launch folder |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Task's worktree | A worktree whose branch carries the task id per `taskIdFromBranch` | The same rule the sidebar and the worktree page use to show a worktree's task | y |
| Precedence | Followed worktree, then the task's worktree, then the launch folder | The followed worktree is the agent's observed work; the task is the declared intent | y |
| Several worktrees carry the task | Keep the launch folder | Owner chose no guessing | y |
| Scope | Agents direction only, where a selected session drives the bar | Other directions describe the tree selection (STBR-02) | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: The bar names the task's worktree ⭐ MVP

**User Story**: As a developer who launches agents at the workspace root with a task, I want the status bar to show that task's worktree when I select the session, so that the bar agrees with the card.

**Why P1**: It is the whole request.

**Acceptance Criteria**:

1. WHEN the selected session has no `followedPath`, has a linked task, and exactly one worktree in the tree carries that task's id THEN `barTargetFor` SHALL return that worktree, with its workspace and repo. <!-- event-driven -->
2. WHEN the selected session has a `followedPath` THEN `barTargetFor` SHALL describe the followed path as today, whatever its linked task. <!-- event-driven -->
3. WHEN the selected session has no linked task THEN `barTargetFor` SHALL describe the launch folder as today. <!-- event-driven -->

**Independent Test**: Launch a session at the workspace root linked to a task whose worktree exists; select it; the bar shows that worktree's repo and branch.

---

## Edge Cases

- WHEN no worktree in the tree carries the linked task's id THEN `barTargetFor` SHALL describe the launch folder.
- WHEN two or more worktrees carry the linked task's id THEN `barTargetFor` SHALL describe the launch folder.
- WHEN the direction is not Agents THEN `barTargetFor` SHALL describe the tree selection, ignoring the session's task.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SBTK-01 | P1 (AC 1) | Execute | Verified |
| SBTK-02 | P1 (AC 2) | Execute | Verified |
| SBTK-03 | P1 (AC 3) | Execute | Verified |
| SBTK-04 | Edge cases 1-2 | Execute | Verified |
| SBTK-05 | Edge case 3 | Execute | Verified |

**Coverage:** 5 total, 5 mapped to Execute, 0 unmapped

---

## Success Criteria

- [x] Selecting a root-launched session linked to a task shows the task's worktree repo and branch in the status bar
