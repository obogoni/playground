# Create Timeouts Specification

## Problem Statement

Creating a worktree runs its git commands from main with no timeout: the base refresh's `git fetch`
(on by default in both dialogs), the fast-forward of the base, and the `git worktree add` checkout
(`worktree-manager.ts:183-233`, `:163-174`). `GIT_TERMINAL_PROMPT=0` stops git's own terminal
prompt only. It does not stop a credential helper or an askpass program, and git's stdin is an
open pipe that nobody writes to (`git.ts:15-35`). A fetch that waits for an answer never returns,
so the dialog stays busy and the user has no way out. A checkout of a large repository can take
minutes with nothing on screen but a disabled button. The post-create hook has a 120 s timeout, but
its stdin is open too (`hook-shell.ts:42-51`), so a script that pauses waits out the full two
minutes. Closing the dialog while it is busy unmounts it, and an error or hook advisory that
arrives afterwards is lost.

Nobody has seen the hang happen yet; it was found by reading the code while planning #145. A probe
on 2026-10-01 (git 2.55.0.windows.4, Node 24.19.0) reproduced it: against a local remote that
answers 401, a `git fetch` whose credential helper waits ran until the probe killed it at 6 s, with
today's runner options. Ending stdin did not help that case; only a timeout does. The same probe
showed a hook running `set /p` or `pause` waiting until its timeout with today's shell options, and
settling in under 100 ms with stdin ignored. Scope is upstream issue #153, grilled and approved by
the owner on 2026-10-01.

## Goals

- [ ] No step of a worktree create can wait forever: the base fetch and fast-forward stop after 60 s, the checkout after 10 min, the hook after 120 s (unchanged)
- [ ] A step that times out ends the create with a message that names the step and the way out
- [ ] Git and the post-create command never wait on keyboard input
- [ ] While a create runs, the dialog shows which step is running and cannot be closed on the result

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Branch slug length and the error line shown for a git failure | Issue #145, which lands first on the same create path |
| Killing the hook's child processes on timeout | Known limitation of the hook spec (`worktree-post-create-hook` Out of Scope); issue #153 |
| Killing a credential helper window that git started | Same Windows limitation: killing git does not kill its children |
| Timeouts on local git reads (`rev-parse`, `worktree list`, `branch -D`, `rev-parse --verify`) | Issue #153 names the fetch, the fast-forward and the checkout; local reads answer from disk |
| Timeouts or stdin changes for the workflows' own `gitFetch` in `index.ts` | It does not go through `git.ts` or the create path |
| Cleaning up a partial worktree left by a timed-out checkout | Removal is destructive and has its own guarded flow (AD-014); see Assumptions |
| Configurable timeout values | Constants, like `HOOK_TIMEOUT_MS` and `OP_TIMEOUT_MS` |
| Cancelling a create from the dialog | Not asked; every step is bounded instead |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Scope | Upstream issue #153, as written | Grilled and approved by the owner | owner confirmed 2026-10-01 |
| Refresh failure posture | A timeout is a refresh failure under WBR-02: block, do not degrade; the worktree is not created and the dialog shows the message inline | Issue #153, Solution 1 | owner confirmed 2026-10-01 |
| Timeouts go through the runner | Every bounded call passes `timeoutMs` to `git()`; `isTimeout` tells a kill from a failure | Issue #153, Implementation Decisions | owner confirmed 2026-10-01 |
| Step reporting channel | Main pushes the create's current step to the renderer on an event keyed by a request id the dialog chooses | Issue #153, Implementation Decisions | owner confirmed 2026-10-01 |
| Stdin | The git runner and the hook shell give their process no input: the hook spawns with stdin ignored; git's stdin is ended as the process starts, because `execFile` ignores a `stdio` option (measured 2026-10-01: with `stdio: ['ignore', …]` `git hash-object --stdin` still waited until killed; with the pipe ended it returned the empty-blob id at once) | Issue #153 asks for stdin ignored; for git, an ended pipe is the same EOF and keeps `execFile`'s timeout, buffer and error shape | owner confirmed 2026-10-01 |
| Testing approach | Worktree manager tests with an injected git runner that never settles on its own; a hook test reading stdin; a Start Work smoke check for the step label | Issue #153, Testing Decisions | owner confirmed 2026-10-01 |
| Which calls are bounded | The base fetch (`fetch <remote> <branch>`), the fast-forward (`merge --ff-only` in the base's worktree, or `fetch <remote> <branch>:<base>`), and every `git worktree add` (new branch, existing branch, reuse, recreate) | The calls issue #153 names; the local reads stay as they are | owner confirmed 2026-10-01 |
| Timeout values | 60 s for each bounded refresh call (fetch, fast-forward), so a refresh is bounded by 120 s; 10 min for the checkout; the hook keeps 120 s | The issue's examples. Per call, because `execFile`'s timeout is per process. A healthy fetch of one branch takes seconds; a checkout of a large repository can take minutes | owner confirmed 2026-10-01 |
| Timeout texts | Fetch: `Fetching {upstream} timed out after 60 s. Retry, or uncheck "Update base branch from remote" to skip.` Fast-forward: `Fast-forwarding "{base}" to {upstream} timed out after 60 s. Retry, or uncheck "Update base branch from remote" to skip.` Checkout: `Creating the worktree timed out after 10 min and git was stopped. Part of it may remain at {target}; remove it before retrying.` | Each names the step, the limit and the way out, in the voice of the WBR-02 texts | owner confirmed 2026-10-01 |
| Step labels and where they show | A progress line in the dialog body, in the slot the error line uses, with a spinner: `Updating base branch from remote…`, `Creating worktree…`, `Running post-create command…`; before the first step arrives, `Preparing…`. The Create button stays disabled and keeps its label | One line where the user already looks for the outcome; the button keeps its size | owner confirmed 2026-10-01 |
| Closing the dialog while busy | The dialog stays open until the create settles: a backdrop click does nothing and Cancel is disabled with the tooltip `Wait for the create to finish` | Issue #153 allows either this or a notice. Every step is now bounded, so the wait is bounded, and no new notice channel is needed. `BranchExistsChoice` already disables its Cancel while busy | owner confirmed 2026-10-01 |
| Partial worktree after a checkout timeout | Left on disk as it is; the message names its path. The sidebar's Remove handles it once the tree is refreshed | Deleting automatically would be a second, unguarded removal path. Killing `git worktree add` does not kill the checkout child it started, which may still finish | owner confirmed 2026-10-01 |
| Workflow creates | `ctx.worktree.create` gets the same timeouts and closed stdin, and pushes no step events (it sends no request id) | The workflow ctx shares the hook-wrapped create (WPC-10); a workflow run has no dialog | y |
| A create without a request id | No step event is pushed; everything else is identical | Keeps the IPC field optional, like `updateBase` (WBR-05) | y |
| Base branch and #145 | `feature/create-timeouts` is cut from `origin/main` `60ff148`. #145 (`feature/branch-slug-short`) lands first and touches the same files: `git.ts` (`gitFailureLine`), `createWorktree`'s guards, both dialogs (a length warning and `canCreate`), `worktree-manager.test.ts` and `smoke-start-work.mjs`. Rebase onto `origin/main` once #145 merges, before Execute | Lowest priority of the batch, after #145 (issue #153, Further Notes) | y |
| Existing test that relies on open stdin | `git.test.ts:33-38` blocks `git hash-object --stdin` to produce a timeout. Its blocker moves to a git alias that sleeps, with the same assertion | With stdin closed, `hash-object --stdin` returns at once, so the old fixture no longer blocks | y |

**Open questions:** none. Every gap is logged above; the owner confirmed the five remaining defaults (timeout values, timeout texts, step labels, closing while busy, the partial worktree) on 2026-10-01.

### Implicit-requirement sweep

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | CRTO-01, CRTO-08 (the bounds); no new input is accepted |
| Failure / partial-failure states | CRTO-02..05, CRTO-09, CRTO-10 (timeouts end the create with a message; a timed-out refresh leaves no worktree and keeps the branch on recreate; a timed-out checkout may leave a partial worktree, named in the message) |
| Idempotency / retry / duplicate handling | A retry after a refresh timeout is a fresh create (nothing was made). After a checkout timeout, a retry meets the existing target-path guard or the branch-exists choice (EXB-01), both unchanged |
| Auth boundaries & rate limits | N/A because the app is single-user and local; credentials stay with git's own helpers |
| Concurrency / ordering | CRTO-16 (a dialog ignores step events of other requests); CRTO-15 (steps are pushed in the order they run) |
| Data lifecycle / expiry | N/A because nothing is persisted |
| Observability | CRTO-12..15 (the step is pushed and shown); the timeout texts name the step |
| External-dependency failure | CRTO-02, CRTO-03 (remote or credential helper hangs); a fetch that fails before its timeout keeps git's own line (WBR-02, unchanged) |
| State-transition integrity | CRTO-19..21 (busy dialog cannot close; it closes as today once the create settles) |

---

## User Stories

### P1: The base refresh cannot hang ⭐ MVP

**User Story**: As a developer, I want the base refresh to stop after a bounded time and tell me so, so that a hidden prompt can never trap me in the dialog.

**Why P1**: This is the hang. The refresh is on by default in both dialogs.

**Acceptance Criteria**:

1. WHEN a create refreshes its base THEN the create SHALL run `git fetch {remote} {branch}`, `git merge --ff-only {upstream}` and `git fetch {remote} {branch}:{base}` each with a 60000 ms timeout
2. IF the base fetch is killed by its timeout THEN the create SHALL return `ok: false` with `Fetching {upstream} timed out after 60 s. Retry, or uncheck "Update base branch from remote" to skip.` and SHALL NOT run `git worktree add`
3. IF the fast-forward step is killed by its timeout THEN the create SHALL return `ok: false` with `Fast-forwarding "{base}" to {upstream} timed out after 60 s. Retry, or uncheck "Update base branch from remote" to skip.` and SHALL NOT run `git worktree add`
4. IF a recreate's base refresh times out THEN the existing branch SHALL still exist at its previous tip (EXB-D8)
5. WHEN a create returns a timeout error THEN the dialog SHALL show the text in its error line, stay open and enable Create again

**Independent Test**: Point a repo's base at a local remote whose credential helper waits, open New worktree with the refresh ticked and press Create: after the refresh timeout the dialog shows the fetch text and no worktree folder exists.

---

### P1: Nothing waits on input ⭐ MVP

**User Story**: As a developer with a post-create hook, I want git and the hook never to wait for keyboard input, so that a stray prompt or pause costs nothing.

**Why P1**: The second half of the hang: an open stdin turns any prompt into a wait for the timeout.

**Acceptance Criteria**:

6. The git runner SHALL start every git process with a stdin that is already at end of input
7. The hook shell SHALL start the post-create command with stdin ignored
8. WHEN the post-create command reads from stdin THEN it SHALL read end of input at once, and the hook SHALL settle with the command's own exit code, without `timedOut`

**Independent Test**: Declare `set /p answer=Continue? & echo after-prompt` as the post-create command and create a worktree: the dialog finishes within a second and the hook succeeds.

---

### P2: See which step is running, and a bounded checkout

**User Story**: As a developer creating a worktree of a large repository, I want the dialog to show which step is running, and the checkout to stop after a generous limit, so that I know it is not stuck and it cannot run forever.

**Why P2**: The checkout rarely hangs; the label makes every long step legible.

**Acceptance Criteria**:

9. WHEN a create runs `git worktree add` THEN the create SHALL run it with a 600000 ms timeout, on the new-branch, existing-branch, reuse and recreate paths
10. IF `git worktree add` is killed by its timeout THEN the create SHALL return `ok: false` with `Creating the worktree timed out after 10 min and git was stopped. Part of it may remain at {target}; remove it before retrying.` and the post-create command SHALL NOT run
11. WHEN a `worktrees:create` request carries a `requestId` THEN main SHALL push `worktrees:create-step` with that `requestId` and the step: `refreshing-base` before the refresh starts, `creating-worktree` before `git worktree add` runs, `running-hook` before the post-create command runs
12. WHERE a create does not refresh its base (refresh off, empty base, or reuse) THEN main SHALL push no `refreshing-base` step
13. WHERE the repo declares no post-create command, or the create produced no worktree, THEN main SHALL push no `running-hook` step
14. WHEN a create ends before a step (a guard refused, the branch exists, the refresh failed) THEN main SHALL push no step that follows it
15. The steps of one create SHALL be pushed in the order they run, and each at most once
16. WHILE its create is in flight, a dialog SHALL show a progress line with the label of the last step pushed for its own `requestId`: `Updating base branch from remote…`, `Creating worktree…`, `Running post-create command…`, or `Preparing…` before the first step, and SHALL ignore steps for any other `requestId`
17. WHEN the create settles THEN the dialog SHALL remove the progress line and SHALL ignore any later step for that request
18. WHEN a `worktrees:create` request carries no `requestId` THEN main SHALL push no `worktrees:create-step` event

**Independent Test**: With a post-create command that runs for five seconds, press Create: the dialog shows `Creating worktree…` and then `Running post-create command…`, and the line disappears when the dialog closes on success.

---

### P2: The dialog keeps the outcome

**User Story**: As a developer, I want the dialog to stay open until the create ends, so that I never miss an error or end up with a worktree I did not know about.

**Why P2**: Today a backdrop click while busy drops a later error, conflict or hook advisory, and a later success still jumps the selection.

**Acceptance Criteria**:

19. WHILE a create is in flight, a click on the dialog's backdrop SHALL leave the dialog open
20. WHILE a create is in flight, the dialog's Cancel button SHALL be disabled with the tooltip `Wait for the create to finish`
21. WHEN the create settles THEN Cancel and the backdrop SHALL act exactly as they do today with no create in flight: close the dialog, or continue the post-create flow while the hook advisory shows (WPC-14, unchanged)

**Independent Test**: While `Running post-create command…` shows, click outside the dialog: it stays, and closes on its own when the create succeeds.

---

## Edge Cases

- IF the fetch fails before its timeout (offline, refused credentials) THEN the create SHALL return git's own line as today (WBR-02), not the timeout text (CRTO-02)
- WHEN a fetch times out on the recreate path THEN the branch SHALL not be deleted, because the refresh runs before the delete (CRTO-04)
- WHEN the checkout times out THEN the post-create command SHALL not run, because the create returned `ok: false` (WPC-08, CRTO-10)
- WHEN the window is closed while a create runs THEN main SHALL drop its step events and the create SHALL still settle (CRTO-11)
- WHEN a hook reads stdin and then exits non-zero THEN the hook SHALL report that exit code, not a timeout (CRTO-08)
- WHEN a step event arrives after its create settled THEN the dialog SHALL ignore it (CRTO-17)
- WHEN a workflow creates a worktree while a dialog create runs THEN the dialog SHALL show only its own steps (CRTO-16, CRTO-18)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| CRTO-01 | P1: refresh — AC 1 | Tasks | Implemented: T4 |
| CRTO-02 | P1: refresh — AC 2 | Tasks | Implemented: T1, T5; recorded in AD-059 (T16) |
| CRTO-03 | P1: refresh — AC 3 | Tasks | Implemented: T5 |
| CRTO-04 | P1: refresh — AC 4 | Tasks | Implemented: T5 |
| CRTO-05 | P1: refresh — AC 5 | Tasks | Implemented: T12, T13, T14 |
| CRTO-06 | P1: stdin — AC 6 | Tasks | Implemented: T2 |
| CRTO-07 | P1: stdin — AC 7 | Tasks | Implemented: T3; recorded in AD-059 (T16) |
| CRTO-08 | P1: stdin — AC 8 | Tasks | Implemented: T3 |
| CRTO-09 | P2: steps — AC 9 | Tasks | Implemented: T4 |
| CRTO-10 | P2: steps — AC 10 | Tasks | Implemented: T6 |
| CRTO-11 | P2: steps — AC 11 | Tasks | Implemented: T7, T8, T9, T14, T15 |
| CRTO-12 | P2: steps — AC 12 | Tasks | Implemented: T7 |
| CRTO-13 | P2: steps — AC 13 | Tasks | Implemented: T8 |
| CRTO-14 | P2: steps — AC 14 | Tasks | Implemented: T7 |
| CRTO-15 | P2: steps — AC 15 | Tasks | Implemented: T7, T8 |
| CRTO-16 | P2: steps — AC 16 | Tasks | Implemented: T10, T11, T12, T13, T14, T15 |
| CRTO-17 | P2: steps — AC 17 | Tasks | Implemented: T10, T11, T12, T13 |
| CRTO-18 | P2: steps — AC 18 | Tasks | Implemented: T9 |
| CRTO-19 | P2: outcome — AC 19 | Tasks | Implemented: T12, T13, T14, T15 |
| CRTO-20 | P2: outcome — AC 20 | Tasks | Implemented: T10, T12, T13, T14, T15 |
| CRTO-21 | P2: outcome — AC 21 | Tasks | Implemented: T12, T13 |

**Coverage:** 21 total, 21 implemented (tasks.md, Requirement → Evidence Map), 0 unmapped.

### Follow-ups (from validation, owner 2026-10-03)

- **F1 (CRTO-05)**: no smoke drives a timeout into a dialog; the limits are constants, so it needs a test-only override.
- **F2 (CRTO-16)**: the smokes assert only the hook label on screen; the refresh and checkout labels are pinned by `create-progress.test.ts`.
- **F3 (CRTO-20)**: while a reuse or recreate runs, the Cancel on screen is `BranchExistsChoice`'s; it is disabled but has no `Wait for the create to finish` tooltip. The owner kept it as a follow-up for a later issue.
- **F4**: the Start Work progress smoke opens the dialog through the Tasks pane's React fiber prop (offline); re-check it on a React upgrade.
- Not from this feature: `smoke-create.mjs`'s two CRWT create checks fail on `main` too, because the dialog's base refresh is on by default and the seed has no remote.

---

## Success Criteria

- [ ] A create against a remote whose credential helper never answers ends within the refresh limit with the fetch text, and leaves no worktree
- [ ] A post-create command that pauses or prompts finishes in under a second instead of two minutes
- [ ] During every create, the dialog names the running step, and no outcome is lost to an early close
