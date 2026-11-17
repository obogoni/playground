# Session Fork Specification

## Problem Statement

Forking a Claude Code conversation from a plain terminal (`/branch`, or `claude --resume <id> --fork-session`) replaces the
conversation in that same terminal: the original line of thought is no longer open anywhere, so the developer cannot push
both directions forward at the same time. The app already hosts each Claude session in its own tab and already learns each
session's Claude `session_id` from the lifecycle hooks (`claudeSessionId`, `src/main/session-manager.ts`), but offers no way
to branch a conversation into a second tab.

## Goals

- [ ] One click on a running Claude session opens a new tab whose Claude conversation starts from the original's history
- [ ] The original tab keeps running untouched: same PTY, same Claude `session_id`, still accepting input
- [ ] The fork is a new, independent Claude session (`--fork-session`), so the two tabs never write to the same transcript

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Forking a stopped session | Owner decision: the Claude `session_id` lives only while the PTY runs and is never persisted. Persisting it is a separate feature |
| Forking ad-hoc sessions or registry agents other than Claude Code | Only Claude Code reports a `session_id` through the hooks the app reads, and only its CLI documents `--fork-session` |
| A first prompt typed at fork time | Owner decision: the fork opens directly; the developer types the new direction in the new tab |
| Respawn resuming the Claude conversation | Respawn starts a fresh agent today; changing that is a separate feature |
| Forking from a specific earlier message | `--fork-session` branches from the end of the transcript; picking a message is Claude Code's own `/branch` UI |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Which sessions can fork | Running Claude sessions that have a known `claudeSessionId` | Owner decision; zero persistence change | y |
| How the fork opens | Directly, no dialog, no prompt | Owner decision | y |
| Fork launch command | The source's agent definition with `--resume <claudeSessionId> --fork-session` appended after its own args (hook `--settings` still applied) | Documented CLI flags (`claude --help`); appending keeps the user's own args and the hook wiring | y |
| Fork working directory | The source session's launch `cwd`, never its followed worktree | Claude Code stores transcripts per launch directory; `--resume` from another folder does not find the session. Same rule as Duplicate (`shared/config.ts`: PTY, respawn, duplicate keep `cwd`) | y |
| Fork title | `<source title> (fork)` | Tells the two tabs apart without inventing a naming scheme | y |
| Fork task link | Copied from the source | Same rule as Duplicate; the fork works on the same task | y |
| Selection after fork | The fork becomes the selected session | Same behaviour as Duplicate; the developer wants to type in the new tab | y |
| Forking while the agent is busy | Allowed; the fork gets whatever the transcript holds at that moment | No hook marks a safe point; gating would block the main use case (diverge mid-work) | y |
| `--resume` args persisted on the fork | No. Like a launch prompt, they apply to the fork's first launch only; Respawn and Duplicate of a fork start a fresh agent | Keeps Respawn/Duplicate semantics unchanged for every session | y |
| Agent definition already carrying `--resume` / `--continue` / `--session-id` | Not guarded | Unusual registry setup; the CLI reports the conflict in the fork's own terminal | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Fork a running Claude session into a new tab ⭐ MVP

**User Story**: As a developer running a Claude session, I want to fork it into a new tab so that I can continue the original conversation in its tab and take a different direction in the new one, at the same time.

**Why P1**: It is the whole feature.

**Acceptance Criteria**:

1. WHEN the developer forks a running Claude session whose `claudeSessionId` is `X` THEN the system SHALL start a new running session whose agent command line is the source agent's command and args followed by `--resume X --fork-session`.
2. WHEN a session is forked THEN the system SHALL launch the fork's PTY in the source session's launch `cwd`, even when the source follows another worktree.
3. WHEN a session is forked THEN the system SHALL give the fork a new app session id, the same agent and task link as the source, and the title `<source title> (fork)`.
4. WHEN a session is forked THEN the system SHALL leave the source session running with the same PTY and the same `claudeSessionId`.
5. WHEN a session is forked THEN the system SHALL persist the fork without `--resume` / `--fork-session`, so a later Respawn or Duplicate of the fork starts the agent without them.
6. WHEN a fork succeeds THEN the system SHALL select the fork in the Agents view.
7. IF the session to fork is unknown, stopped, ad-hoc, or has no `claudeSessionId` yet THEN the system SHALL reject the fork with an error and start no PTY.
8. IF a fork fails THEN the system SHALL show a toast titled `Couldn't fork session` and leave the selection unchanged.

**Independent Test**: Start a Claude session, send one message, click Fork: a new tab `<title> (fork)` opens with the earlier conversation in its history; typing in either tab advances only that tab's conversation.

### P1: Fork is offered only where it can work ⭐ MVP

**User Story**: As a developer, I want the Fork action only on sessions that can actually fork so that I never click a button that fails.

**Why P1**: Without it, AC 7 is hit through normal use.

**Acceptance Criteria**:

1. WHILE a session is running and has a `claudeSessionId` the system SHALL expose it as forkable in its `SessionView` (`forkable: true`).
2. WHILE a session is stopped, ad-hoc, non-Claude, or has no `claudeSessionId` the system SHALL omit `forkable` from its `SessionView`.
3. WHEN a running session receives its first `session_id` from a hook THEN the system SHALL push a session update so the renderer shows the Fork action without a manual refresh.
4. WHILE a session is forkable the Agents detail header SHALL show a `Fork` button next to `Duplicate`.
5. WHILE a session is not forkable the Agents detail header SHALL not render the `Fork` button.

**Independent Test**: A new Claude session shows no Fork button; after its first message the button appears; after Stop it disappears.

---

## Edge Cases

- IF the session stops between the button render and the fork request THEN the system SHALL reject the fork (FORK-07).
- WHEN a fork itself becomes forkable THEN the system SHALL allow forking the fork (it is an ordinary Claude session).
- IF the PTY host fails to spawn the fork THEN the system SHALL persist nothing for the fork (same rule as spawn, PTYH-14).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FORK-01 | P1: Fork into a new tab - AC1 command line | Execute | Implementing |
| FORK-02 | P1: Fork into a new tab - AC2 launch cwd | Execute | Implementing |
| FORK-03 | P1: Fork into a new tab - AC3 id, agent, task, title | Execute | Implementing |
| FORK-04 | P1: Fork into a new tab - AC4 source untouched | Execute | Implementing |
| FORK-05 | P1: Fork into a new tab - AC5 resume args not persisted | Execute | Implementing |
| FORK-06 | P1: Fork into a new tab - AC6 select fork | Execute | Implementing |
| FORK-07 | P1: Fork into a new tab - AC7 reject ineligible | Execute | Implementing |
| FORK-08 | P1: Fork into a new tab - AC8 failure toast | Execute | Implementing |
| FORK-09 | P1: Fork offered only where it works - AC1 forkable flag | Execute | Implementing |
| FORK-10 | P1: Fork offered only where it works - AC2 flag omitted | Execute | Implementing |
| FORK-11 | P1: Fork offered only where it works - AC3 push on first id | Execute | Implementing |
| FORK-12 | P1: Fork offered only where it works - AC4 Fork button shown | Execute | Implementing |
| FORK-13 | P1: Fork offered only where it works - AC5 Fork button hidden | Execute | Implementing |

**Coverage:** 13 total, all implemented across the inline execution plan (Medium scope - no tasks.md)

---

## Success Criteria

- [ ] From a running Claude session, one click yields two tabs that advance two different conversations sharing the same history
- [ ] The source tab never restarts or loses its conversation when forked
