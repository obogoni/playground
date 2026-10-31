# Session Follows the Worktree It Edits Specification

Issue: #185

## Problem Statement

A user starts agent sessions in a fixed folder, for example the root of a
workspace repo that holds the team's agent instructions, skills and guard hooks
(`D:\work\acme`, on `main`). Mid-session the agent creates a worktree for the task
(`D:\work\acme\.wt-app-4821-fix-login`, on `feature/4821-fix-login`) and edits files
there by absolute path. It never changes its own working directory.

The app reads a session's folder once, at spawn (`PersistedSession.cwd`), and
derives the rail group, the branch, the status bar and the hours from it. For the
whole session the app believes the agent works in the root folder on `main`; the
worktree the agent really works in shows no session and gets no time. The
task-link spec put "changing the folder its attribution reads" out of scope
(agent-task-link, line 26); this feature is that follow-up.

## Goals

- [ ] A Claude session's attribution moves to the worktree the agent edits, on the first edit there
- [ ] Hours from that moment are recorded against the new worktree and its branch; earlier hours stay where they were
- [ ] The terminal, respawn and duplicate keep the launch folder

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Moving the PTY, or respawning in the new worktree | Owner choice: the agent must keep the launch folder's instructions and hooks |
| A manual "move session to worktree" action | Owner chose edits only |
| Reading shell commands, `git -C`, or the hook `cwd` field | The agent never changes directory; shell parsing is guesswork |
| Reassigning time recorded before the move | Owner choice: history is not rewritten |
| Sessions without hooks (ad-hoc, non-Claude) | They send no edit events |
| The worktree clock for past time | #186 |
| Changing the session title | The title names the launch folder's agent and branch leaf (AGCF-04) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Signal | `PreToolUse` and `PostToolUse` hook payloads whose `tool_name` is `Edit`, `Write`, `MultiEdit` or `NotebookEdit`; path from `tool_input.file_path` (or `tool_input.notebook_path`) | These are the file-editing tools; the payloads already reach `handleHookEvent` | y |
| Known worktree | A worktree of a repo in a registered workspace, as the tree lists it | Only what the app can show can hold a session | y |
| Matching | The worktree whose path is the longest prefix of the edited path, at a path-separator boundary, case-insensitive | A file can sit in a subfolder; `.wt-a` must not match `.wt-ab` | y |
| Rule | Move when the matched worktree differs from the current attribution and is not the launch folder's worktree; never move back automatically | Owner choice (Q13) | y |
| A just-created worktree | A miss inside a registered workspace re-reads that workspace's worktrees once, then retries the match | The agent edits before the user ever refreshes the tree | y |
| Persistence | The followed path is stored on the session and survives restart and respawn | Owner confirmed | y |
| Duplicate | A duplicate starts at the launch folder with no followed path | A duplicate is a new session; it has not edited anything | y |
| Hand-set task | Untouched by a move | Following the folder must never overwrite a link the user made | y |
| Followed worktree removed | The session is not stopped (its PTY runs in the launch folder) and its attribution returns to the launch folder | The followed path no longer exists | y |
| Removing the launch folder's worktree | Still stops sessions spawned there, as today | Their PTY runs there | y |

**Implicit-requirement dimensions sweep:**

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | SFWT-02, SFWT-03: only file-editing tools, only absolute paths inside a known worktree |
| Failure / partial-failure states | SFWT-14: a failed worktree re-read leaves the attribution unchanged |
| Idempotency / duplicates | SFWT-05: an edit in the current worktree changes nothing, no event, no new period |
| Auth boundaries & rate limits | SFWT-13: at most one worktree re-read in flight; edits outside every workspace never trigger one |
| Concurrency / ordering | SFWT-13: hook events are handled in arrival order; a re-read that resolves after a later move does not undo it |
| Data lifecycle / expiry | SFWT-10, SFWT-15: persisted; cleared when the followed worktree is removed |
| Observability | N/A because the move is visible in the rail and status bar; failures are logged like other tree errors |
| External-dependency failure | SFWT-14 |
| State-transition integrity | SFWT-04..SFWT-06 |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: The session moves to the worktree the agent edits ⭐ MVP

**User Story**: As a developer whose agent creates a worktree mid-session, I want the session to move to that worktree as soon as the agent edits a file there, so that the app shows where the work really happens.

**Why P1**: It is the core of the request; everything else reads from it.

**Acceptance Criteria**:

1. WHEN a running session's hook reports an `Edit`, `Write`, `MultiEdit` or `NotebookEdit` on a path inside a known worktree that is not its current attribution and not its launch worktree THEN the app SHALL set the session's followed path to that worktree's path. <!-- event-driven -->
2. IF the hook event is any other tool or carries no string path THEN the app SHALL leave the followed path unchanged. <!-- unwanted-behavior -->
3. IF the edited path is inside no known worktree THEN the app SHALL leave the followed path unchanged. <!-- unwanted-behavior -->
4. WHEN the edited path is inside the launch folder's worktree THEN the app SHALL leave the followed path unchanged. <!-- event-driven -->
5. WHEN the edited path is inside the worktree the session already follows THEN the app SHALL change nothing and emit nothing. <!-- event-driven -->
6. WHEN a session that follows one worktree edits inside a second known worktree THEN the app SHALL set the followed path to the second worktree. <!-- event-driven -->
7. WHEN the followed path changes THEN the app SHALL persist it and emit the session's new followed path to the renderer. <!-- event-driven -->

**Independent Test**: Spawn a Claude session in `D:\work\acme`; let it write `D:\work\acme\.wt-app-4821-fix-login\README.md`; the session moves to that worktree in the rail.

---

### P1: Hours follow the move ⭐ MVP

**User Story**: As a developer tracking hours, I want the time after the move recorded against the new worktree and its branch, so that hours reflect where the work happened.

**Why P1**: The owner's hours were the visible symptom.

**Acceptance Criteria**:

1. WHEN the followed path changes on a counting session THEN the time tracker SHALL close the open period at that instant and open a new one in the followed path, with that path's branch and the session's task. <!-- event-driven -->
2. WHEN the followed path changes on a paused or suspended session THEN the time tracker SHALL keep the new path for the next period it opens. <!-- event-driven -->
3. The time tracker SHALL leave periods closed before the move unchanged. <!-- ubiquitous -->
4. WHEN a session with a followed path starts (respawn, app restart) THEN the time tracker SHALL open its period in the followed path. <!-- event-driven -->

**Independent Test**: After the move above, the time log holds one period in `D:\work\acme` on `main` up to the move and one in the worktree on `feature/4821-fix-login` from it.

---

### P1: The renderer reads the followed path ⭐ MVP

**User Story**: As a developer, I want the rail, the status bar and the worktree pages to place the session in the worktree it follows, so that every view agrees.

**Why P1**: Without it the move is invisible.

**Acceptance Criteria**:

1. WHILE a session has a followed path the rail SHALL group it under the followed worktree. <!-- state-driven -->
2. WHILE a session has a followed path the status bar SHALL show the followed worktree's branch for it. <!-- state-driven -->
3. WHILE a session has a followed path the worktree detail and Files session lists SHALL list it under the followed worktree, not the launch folder. <!-- state-driven -->
4. WHILE a session has no followed path every view SHALL place it by its launch folder, as today. <!-- state-driven -->

**Independent Test**: Select the followed worktree in the sidebar; its detail page lists the session.

---

### P2: The terminal keeps the launch folder

**User Story**: As a developer, I want respawn and duplicate to keep starting in the launch folder, so that the agent keeps its workspace instructions, skills and guard hooks.

**Why P2**: Today's behaviour; it must not regress.

**Acceptance Criteria**:

1. WHEN a session with a followed path is respawned THEN the app SHALL start the PTY in the launch folder and keep the followed path. <!-- event-driven -->
2. WHEN a session with a followed path is duplicated THEN the app SHALL start the copy in the launch folder with no followed path. <!-- event-driven -->
3. The session's hand-set task SHALL stay unchanged when the followed path changes. <!-- ubiquitous -->

---

## Edge Cases

- WHEN the edited path differs from a worktree path only in letter case THEN the app SHALL match that worktree. (SFWT-03)
- IF one worktree's path is a prefix of another's name without a separator (`.wt-a` and `.wt-ab`) THEN the app SHALL match only at a separator boundary. (SFWT-03)
- WHEN a miss falls inside a registered workspace THEN the app SHALL re-read that workspace's worktrees once and retry the match. (SFWT-12)
- WHILE a worktree re-read is in flight the app SHALL not start another; edits outside every registered workspace SHALL never start one. (SFWT-13)
- IF the worktree re-read fails THEN the app SHALL leave the followed path unchanged and log the error. (SFWT-14)
- WHEN the followed worktree is removed THEN the app SHALL not stop the session and SHALL clear its followed path. (SFWT-15)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SFWT-01 | P1 move (AC 1) | Tasks | In Tasks |
| SFWT-02 | P1 move (AC 2) | Tasks | Implementing |
| SFWT-03 | P1 move (AC 3, edge cases 1-2) | Tasks | Implementing |
| SFWT-04 | P1 move (AC 4) | Tasks | In Tasks |
| SFWT-05 | P1 move (AC 5) | Tasks | In Tasks |
| SFWT-06 | P1 move (AC 6) | Tasks | In Tasks |
| SFWT-07 | P1 move (AC 7) | Tasks | Implementing |
| SFWT-08 | P1 hours (AC 1, AC 3) | Tasks | In Tasks |
| SFWT-09 | P1 hours (AC 2) | Tasks | In Tasks |
| SFWT-10 | P1 hours (AC 4) | Tasks | In Tasks |
| SFWT-11 | P1 renderer (AC 1-4) | Tasks | Implementing |
| SFWT-12 | Edge case 3 | Tasks | Implementing |
| SFWT-13 | Edge case 4 | Tasks | Implementing |
| SFWT-14 | Edge case 5 | Tasks | Implementing |
| SFWT-15 | Edge case 6 | Tasks | In Tasks |
| SFWT-16 | P2 terminal (AC 1-3) | Tasks | In Tasks |

**Coverage:** 16 total, 16 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] In the owner's workflow, a session launched at the workspace root shows under the task worktree from the agent's first edit there, and the hours from then on carry the worktree's branch
