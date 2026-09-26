# Status Changes Refresh Specification

## Problem Statement

The status bar's changed-file counter (and the worktree detail's count and the sidebar's dirty dot)
comes from the tree snapshot: `tree:get` runs `git status --porcelain` in every worktree. The
snapshot is rebuilt only at start-up, by the top bar's Refresh, after a sync operation from the
status bar, and when a workspace is added or removed. A commit made in a terminal — the owner's or
an agent's — changes nothing the app listens to, so the owner saw `5` with one file really changed
after four were committed. Window focus re-fetches tasks, not the tree.

## Goals

- [ ] A commit, stage or checkout made anywhere shows in the counter within 2 seconds, without a click
- [ ] An agent's edits show in the counter when its turn ends
- [ ] Returning to the app shows current counts

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Periodic polling | Owner decision (grill Q1): `git status` on a timer weighs on large repositories |
| Seeing a working-tree edit the moment it is saved, from outside any agent turn and while the app keeps focus | Not among the owner's triggers (grill Q1); focus and turn end cover the edits that matter. A recursive watch of every worktree would cost what polling costs |
| Reusing the Files direction's `FileWatcher` as-is | It watches one worktree, and only while Files is open (FXPL-23). Its seams (`WatchPort`, `Scheduler`, `BATCH_MS`) and the real watch port are reused |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Triggers | A watcher on each worktree's git state; a session's turn ending; window focus | Owner decision (grill Q1) | y |
| What the git-state watcher watches | Each worktree's git dir (`git rev-parse --git-dir`), **non-recursively**, reacting to entries named `index` and `HEAD` | Git replaces `index` by renaming `index.lock` over it; a watch on the directory survives the rename where a watch on the file may not. A linked worktree's git dir is `.git/worktrees/<name>`, its own `index` and `HEAD` | y |
| Whether a terminal commit touches the watched entries | Measured first (T1): `git commit`, `git add` and `git checkout` in a linked worktree and in a primary checkout each produce an event naming `index` or `HEAD` | A commit moves `refs/heads/<branch>`, not `HEAD`; the rule rests on the index being rewritten, which is measured rather than assumed | n — T1 measures |
| What a git-state event recounts | That one worktree, through a new `worktrees:status` handler, patched into the tree | Rebuilding the whole tree runs `git status` in every worktree of every workspace | y |
| Bursts | Events for one worktree within 250 ms make one recount | Same window as the Files watcher (`BATCH_MS`); a commit touches the index several times | y |
| A patched tree | A new tree identity whenever a git-state recount lands, even with an unchanged count | The status bar recomputes ahead/behind on every new tree identity (STBR-11); a commit changes "ahead" without necessarily changing the count | y |
| Which worktrees are watched | Exactly those in the latest `tree:get` result; a worktree whose path is missing gets no watcher | The set follows creation and removal with no extra bookkeeping | y |
| What "turn ended" means | A session's activity going from `working` to `waiting` or `exited` | The states `session-activity-status` already pushes (`session:activity`) | y |
| Which worktree a session belongs to | The worktree containing the session's `cwd`, by the existing `deriveAttribution` | Same join the rail uses; a session outside every worktree recounts nothing | y |
| Focus | Rebuilds the whole tree, sharing the tasks' 5 s debounce | A return to the app may follow edits in any worktree | y |
| Base branch | `feature/status-changes-refresh` off `feature/status-bar` (PR #97), rebased onto `origin/main` after #97 merged; the PR closes #107 | Owner decision (grill Q2); rebase approved 2026-09-26 | y |
| Smoke data | Temp repositories registered as a workspace, the owner's workspace list snapshotted and restored, as `smoke-status-bar.mjs` already does | The accepted pattern of the status bar smoke | y |

**Open questions:** none — all resolved or logged above. The `n` row is settled by T1; if a trigger does not reach the watched entries, execution stops and the owner decides.

---

## User Stories

### P1: A commit shows at once ⭐ MVP

**User Story**: As the owner, I want the counter to follow commits made in any terminal so that it never shows files I already committed.

**Why P1**: It is the reported defect.

**Acceptance Criteria**:

1. WHEN `index` or `HEAD` changes in the git dir of a worktree in the tree THEN the app SHALL recount that worktree's changed files and show the new count within 2 seconds
2. WHEN several such changes for one worktree arrive within 250 ms THEN the app SHALL recount it once
3. WHEN a git-state recount lands THEN the tree SHALL get a new identity, so the status bar recomputes ahead and behind
4. WHEN a new `tree:get` result adds or drops a worktree THEN the app SHALL start or stop watching it
5. IF a worktree's path is missing THEN the app SHALL NOT watch it and SHALL NOT fail the others
6. IF a recount fails THEN the worktree SHALL keep its last count and the failure SHALL be logged, never thrown

Added after T1's measurement (2026-09-26):

11. WHEN the app runs `git status` in a worktree (tree, recount or changed-file list) THEN it SHALL NOT rewrite that worktree's index, so its own count never triggers the watcher

**Independent Test**: Commit in a temp worktree from a terminal; the counter drops within 2 seconds.

---

### P1: An agent's turn shows when it ends ⭐ MVP

**User Story**: As the owner, I want the counter to catch up when an agent finishes a turn so that its uncommitted edits are counted.

**Why P1**: Agents are the main source of edits in the app.

**Acceptance Criteria**:

7. WHEN a session's activity goes from `working` to `waiting` or `exited` THEN the app SHALL recount the worktree containing that session's `cwd`
8. IF the session's `cwd` is in no worktree of the tree THEN the app SHALL recount nothing

**Independent Test**: Create a file in a temp worktree, then end a session's turn there; the counter rises.

---

### P1: Focus shows current counts ⭐ MVP

**User Story**: As the owner coming back from my editor, I want the counts current so that I do not have to press Refresh.

**Why P1**: Edits made in Visual Studio or VS Code reach the app no other way.

**Acceptance Criteria**:

9. WHEN the window gains focus more than 5 seconds after the previous focus refresh THEN the app SHALL rebuild the tree along with the tasks
10. WHEN the window gains focus within 5 seconds of the previous focus refresh THEN the app SHALL rebuild nothing

**Independent Test**: Edit a file outside the app, focus the app; the counter rises.

---

## Edge Cases

- WHEN a worktree is removed while a recount for it is in flight THEN the landing result SHALL be dropped, not patched into a tree that no longer has it
- WHEN the app quits THEN every git-state watcher SHALL be closed
- WHEN a git-state event and a full tree rebuild race THEN the later result SHALL win (the rebuild replaces the tree; a recount patches only a worktree still present)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SCRF-01 | P1: commit — AC 1 | Tasks | In Tasks |
| SCRF-02 | P1: commit — AC 2 | Tasks | In Tasks |
| SCRF-03 | P1: commit — AC 3 | Tasks | In Tasks |
| SCRF-04 | P1: commit — AC 4 | Tasks | In Tasks |
| SCRF-05 | P1: commit — AC 5 | Tasks | In Tasks |
| SCRF-06 | P1: commit — AC 6 | Tasks | In Tasks |
| SCRF-07 | P1: turn end — AC 7 | Tasks | In Tasks |
| SCRF-08 | P1: turn end — AC 8 | Tasks | In Tasks |
| SCRF-09 | P1: focus — AC 9 | Tasks | In Tasks |
| SCRF-10 | P1: focus — AC 10 | Tasks | In Tasks |
| SCRF-11 | P1: commit — AC 11 | Execute | Done (T2) |

**Coverage:** 11 total, 11 mapped to tasks, 0 unmapped. SCRF-11 was added on 2026-09-26 from T1's measurement (owner's choice: both status calls run with `--no-optional-locks`).

---

## Success Criteria

- [ ] The owner's scenario — four files committed from an agent's terminal — leaves the counter at the real count with no click
- [ ] No `git status` runs while nothing happens (no timer)
