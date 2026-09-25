# Status Bar Specification

## Problem Statement

The app knows which worktree you are looking at, but never tells you where that worktree stands
against its remote. `WorktreeNode` carries `branch`, `dirty` and `changes` (`tree.ts:12`) — there
is no upstream, no ahead/behind, and no way to pull, push or fetch without leaving for a terminal.
The branch name itself only appears inside the detail pane or a rail tooltip, so in the Board,
Agents, Workflows and Hours directions the app shows no branch at all.

Every IDE the owner uses solves this with a status bar at the bottom of the window: branch, incoming
and outgoing commits, changed-file count. This feature brings that bar to Playground.

## Goals

- [ ] Every direction shows which repo and branch the current selection is on, without opening a pane
- [ ] Ahead/behind against the upstream is visible, and is never computed by silently hitting the network
- [ ] Sync, pull, push and fetch are one popover away, with the commits they would move listed first
- [ ] A repo without a remote, a branch without an upstream and a failing git command each degrade to a readable reason instead of a broken control
- [ ] Nothing outside the new bar changes

## Out of Scope

| Feature | Reason |
| ------- | ------- |
| Opening a file, showing a diff, or any per-file action from the changed-files popover | That is the next feature (the file-explorer / diff / PR structure). Building a second, worse version here is work thrown away — the counter's popover is the entry point that feature promotes |
| Committing, staging, discarding, branch switching, or creating a branch | The bar reports and synchronizes; it does not author history. Worktree creation already has its own dialogs |
| Ahead/behind on sidebar rows, board cards or the worktree detail | This feature adds one surface. Spreading sync state through the tree is its own change, with its own cost per worktree |
| Automatic fetch (on focus, on a timer, on selection) | Owner decision (grill Q3): no network without being asked. The bar reads local refs and shows how stale they are |
| Managing credentials, or reacting to the Git Credential Manager's own window | The app runs git with `GIT_TERMINAL_PROMPT=0` (`worktree-manager.ts:523`) and reports what git returns. A GCM GUI prompt is outside the app's control; the 120 s timeout is the backstop |
| Conflict resolution | `pull --ff-only` never produces a conflict: it either advances or refuses. Refusal is reported, not resolved |
| A degraded mode for "git is not installed" | Not reachable: without git, `listWorktrees` / `RepoScanner` cannot build the tree, so the app has no selection to describe. Git failures that *are* reachable are covered by STBR-14 |
| Showing the ADO/GitHub task linked to the branch | Owner decision (grill Q17): repo and branch identify the selection; the task link stays where it already is |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What the bar describes | The globally selected worktree, except in the Agents direction, where it follows the selected session's worktree | `selectedId` is already global (`use-tree.ts:27`); in Agents the session is what the user is looking at, and the tree selection may be another worktree entirely | y |
| Session whose cwd is not a worktree | Bar shows the folder path and says it is not a worktree; no ahead/behind, no file counter | The ad-hoc session case (a `pwsh` in `C:\Windows`) is real and common in this app | y |
| Empty state | The bar is always mounted; with no selection it shows neutral text | A bar that appears and disappears reflows the content height on every selection change | y |
| Branch truncation | Hard cap at 70% of the bar width (raised from 50% by the owner on 2026-09-19), ellipsis in the middle, full name in `title` | Preserves both the prefix (`user/<dev>/…`) and the leaf (`…/12345-endpoint`), which is where the meaning lives in the owner's branch convention | y |
| Ahead/behind source | `git rev-list --count --left-right <upstream>...HEAD` on local refs only | Local, cheap, and honest: it reports what the repo knows, and the popover says when it last learned it | y |
| Fetch staleness | The newest `FETCH_HEAD` modification time across the repo (common git dir plus every `worktrees/<name>/`), rendered with the existing `relative-time.ts`; never fetched reads `never` | The standard proxy. Git writes `FETCH_HEAD` into the git dir of the worktree that fetched, while the remote refs it updates are shared, so any worktree's fetch refreshes what all of them compare against (corrected 2026-09-19: the T18 smoke showed a linked worktree's fetch age stuck at `never`) | y |
| Where staleness is shown | Inside the popover, beside Fetch | Keeps the bar itself to `↓2 ↑1` and puts the age where it informs a decision | y |
| Sync semantics | `pull --ff-only --no-rebase` then `push` (`--no-rebase` added 2026-09-19: Git for Windows sets `pull.rebase=true` system-wide, which would turn the pull into a rebase) | Same policy as the app's existing base refresh (`merge --ff-only`); it cannot produce a conflict or a merge commit, and a divergence refuses with a readable message | y |
| Fetch scope | The current branch's upstream remote and branch only (`fetch <remote> <branch>`) | One network round trip for exactly the refs the bar reports; mirrors `refreshBaseFromRemote` | y |
| Publishing a branch with no upstream | `push -u <remote> <branch>`; with more than one remote the user picks it first | This repo has `origin` (someone else's upstream) and `fork`. Defaulting to `origin` would push the owner's work to the wrong place | y |
| Error reporting | Git's first `fatal:`/`error:` stderr line inline in the popover, which stays open; when stderr has no such line, its first non-empty line (`gitFailureLine`, `src/main/git.ts`) | The error belongs beside the button that caused it and must not disappear on a timer. `pull` and `push` write `From …`/`To …` progress and `hint:` lines to stderr before the error, so the first stderr line is not git's error line that STBR-18 asks for (corrected 2026-09-19: the built `errorLine` in `git-sync.ts` does this; the sync-state read keeps `gitFailureLine`, which suits its local `rev-parse`/`rev-list` calls) | y |
| Degraded mode | Only the ahead/behind section is replaced by the reason; repo, branch and the changed-file counter keep working | Those do not need a remote. Hiding correct information because a remote is missing costs the user something for nothing | y |
| Operation timeout | 120 s, then the process is killed and reported as a timeout | The same ceiling the post-create hook already uses, for the same reason: a hanging process must not own the app | y |
| Selection change during an operation | The operation continues; the bar follows the new selection; the outcome arrives as a toast when its popover is no longer on screen | Killing a push midway is the worst possible moment to interrupt, and freezing navigation for a slow network is worse than a late toast | y |
| Concurrency | At most one operation per worktree; different worktrees may run concurrently | The guard that matters is two writers on one repo; two repos are independent | y |
| Changed-file counter source | The existing `worktrees:changes` / `changedFilesOf` | Already built and used by the force-remove dialog; no new git for this half | y |
| Branch base | `feature/status-bar` cut from `origin/main` | Verified: `AgentsView`, `changedFilesOf`, `SessionView.cwd` and `App.tsx` all exist on `origin/main`. The merge into `develop` will conflict additively in `App.tsx` with the four open PRs | y |
| Verification | Real git in temp dirs with a local bare remote for the git seam; CDP smoke for the bar and popovers, no network | The project already drives real git in temp dirs (`worktree-manager.test.ts`). Lesson L-005 applies: real-git tests inflate runtime, and `vitest.config.ts` already carries the raised 30 s timeout that lesson produced | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: See where the selection stands ⭐ MVP

**User Story**: As the developer, I want a bar at the bottom of every direction showing the repo,
the branch and how far it is from its upstream, so that I know where I am without opening a pane.

**Why P1**: The bar's presence and its read-only content are what every other story hangs off.

**Acceptance Criteria**:

1. The app SHALL render a status bar below the main content area in every direction <!-- ubiquitous -->
2. WHILE a worktree is selected the bar SHALL show its repository name and its branch name <!-- state-driven -->
3. WHILE the Agents direction is active with a session selected the bar SHALL describe that session's worktree rather than the tree selection <!-- state-driven -->
4. IF the selected session's working directory is not inside a git worktree THEN the bar SHALL show that directory's path and render neither the ahead/behind section nor the changed-file counter <!-- unwanted-behavior -->
5. WHILE nothing is selected the bar SHALL stay mounted and show a neutral empty state <!-- state-driven -->
6. WHEN the branch name would occupy more than 70% of the bar's width THEN the bar SHALL truncate it in the middle with a single ellipsis, preserving its start and its end <!-- event-driven -->
7. WHILE a branch name is shown the bar SHALL expose the untruncated name as that element's `title` <!-- state-driven -->
8. WHERE HEAD is detached the bar SHALL show `(detached <short-sha>)` exactly as the sidebar already does <!-- optional-feature -->

**Independent Test**: Select a worktree in the tree, switch through all five directions and confirm the bar names the same repo and branch; select an ad-hoc session rooted at `C:\Windows` in Agents and confirm the bar shows that path with no counters.

---

### P1: Know what is waiting to move ⭐ MVP

**User Story**: As the developer, I want the bar to show how many commits I can pull and push, so
that I can tell at a glance whether the branch is in sync — without the app going to the network
behind my back.

**Why P1**: Ahead/behind is the reason the bar exists; the operations in the next story act on it.

**Acceptance Criteria**:

9. WHILE the selected worktree's branch has an upstream the bar SHALL show the number of commits to pull and the number to push, computed from local refs <!-- state-driven -->
10. The bar SHALL perform no network operation unless the user explicitly asks for one <!-- ubiquitous -->
11. WHEN the tree refreshes THEN the bar SHALL recompute both counts from local refs <!-- event-driven -->
12. IF the branch has no upstream and the repository has at least one remote THEN the section SHALL read `no upstream` and the popover SHALL offer to publish the branch <!-- unwanted-behavior -->
13. IF the repository has no remote, or HEAD is detached, THEN the section SHALL state that reason and offer no operation that writes to a remote <!-- unwanted-behavior -->
14. IF a git command fails for the selected worktree THEN the section SHALL be replaced by git's first error line and the repo name, branch name and changed-file counter SHALL keep rendering <!-- unwanted-behavior -->

**Independent Test**: On a branch two commits behind and one ahead, the bar reads `↓2 ↑1` with no network traffic; on a fresh local branch it reads `no upstream`; in a repo with its remote removed it names that.

---

### P1: Move the commits ⭐ MVP

**User Story**: As the developer, I want to sync, pull, push and fetch from the bar, with the
commits each one would move listed in front of me, so that routine synchronization does not need a
terminal.

**Why P1**: It is the half of the feature that changes state; the counters alone only inform.

**Acceptance Criteria**:

15. WHEN the user activates the ahead/behind section THEN the app SHALL open a popover holding Sync, Pull, Push and Fetch and two commit lists — the commits to pull and the commits to push <!-- event-driven -->
16. Each commit list SHALL show short hash, subject and relative date, capped at 20 entries, with a trailing line naming how many more exist <!-- ubiquitous -->
17. WHEN the user activates Sync THEN the app SHALL run `pull --ff-only --no-rebase` followed by `push` <!-- event-driven -->
18. IF the local branch and its upstream have diverged THEN Sync and Pull SHALL leave the worktree unchanged and the popover SHALL show git's first error line <!-- unwanted-behavior -->
19. WHEN the branch has no upstream and the repository has exactly one remote THEN publishing SHALL run `push -u <remote> <branch>` <!-- event-driven -->
20. WHEN the branch has no upstream and the repository has more than one remote THEN the popover SHALL require the user to choose the remote before publishing <!-- event-driven -->
21. WHEN the user activates Fetch THEN the app SHALL fetch only the current branch's upstream remote and branch <!-- event-driven -->
22. WHILE the popover is open it SHALL state how long ago that repository last fetched, and SHALL read `never` when it never has <!-- state-driven -->
23. WHILE a git operation is running the popover's operation buttons SHALL be disabled and an activity indicator SHALL be shown <!-- state-driven -->
24. IF a git operation has not finished within 120 s THEN the app SHALL terminate it and report that it timed out <!-- unwanted-behavior -->
25. WHEN a git operation succeeds THEN the app SHALL recompute the bar's counters and refresh the tree <!-- event-driven -->
26. WHEN the user changes the selection while an operation is running THEN that operation SHALL continue, the bar SHALL follow the new selection, and the operation's outcome SHALL be reported as a toast <!-- event-driven -->
27. The app SHALL run every git command through `execFile` with no shell and with `GIT_TERMINAL_PROMPT=0` <!-- ubiquitous -->
28. The app SHALL run at most one git operation per worktree at a time <!-- ubiquitous -->

**Independent Test**: Against a temp repo whose bare remote holds one extra commit, Sync pulls it and pushes the local one, the counters return to `↓0 ↑0`, and the tree refreshes. Against a diverged branch, Sync fails with git's message and the worktree is untouched.

---

### P2: See what changed

**User Story**: As the developer, I want the bar to count the files I have changed and list them on
click, so that I can see the shape of my working state from anywhere in the app.

**Why P2**: Useful on its own, but the real payoff is the next feature, which turns this popover
into a full explorer with diffs.

**Acceptance Criteria**:

29. WHILE a worktree is selected the bar SHALL show the number of changed files in it <!-- state-driven -->
30. ~~WHEN the user activates the counter THEN a popover SHALL list every changed path with its change status, using the five values `ChangedFile` already carries (modified, added, deleted, renamed, untracked)~~ **Superseded by FXPL-31 (AD-028), delivered 2026-09-20 in `files-explore` T22.** The counter now opens the Files direction on that worktree in uncommitted-changes mode; `ChangesPopover` is removed. The popover was always the counter's stand-in for a surface that did not exist yet. <!-- event-driven -->
31. WHILE the worktree has no changes the counter SHALL read `0` ~~and its popover SHALL say there are none~~ **The popover clause is superseded by FXPL-31 (AD-028), delivered 2026-09-20 in `files-explore` T22**, together with STBR-30 and STBR-32: there is no popover to say anything. The counter still reads `0`. <!-- state-driven -->
32. ~~The changed-files popover SHALL offer no per-file action~~ **Superseded by FXPL-31 (AD-028), delivered 2026-09-20 in `files-explore` T22.** There is no popover; the Files direction lists the changed paths and opens each one in a tab. <!-- ubiquitous -->

**Independent Test**: Dirty a worktree with one modified, one added, one deleted and one untracked file; the counter reads `4` and the popover lists all four with the status `parseChangedFiles` assigns each.

---

## Edge Cases

- IF the selected worktree's folder no longer exists THEN the bar SHALL keep its repo and branch, replace the sync section with `The worktree folder no longer exists`, and show no changed-file counter and no operation (settled 2026-09-19: the tree derives no path-missing state for a worktree, only for a workspace, so `readSyncState` detects the missing folder itself instead of surfacing Node's `spawn git ENOENT`)
- IF the worktree is dirty and `pull --ff-only` would overwrite a local change THEN the pull SHALL fail with git's message and change nothing
- WHEN the user presses Escape or clicks outside an open popover THEN that popover SHALL close
- WHEN one popover is opened while the other is open THEN the first SHALL close
- IF `rev-list` fails because the upstream ref is missing locally (a deleted remote branch) THEN the section SHALL report that per STBR-14 rather than showing stale counts
- WHEN a git operation finishes while its popover is still open THEN the result SHALL render inline and no toast SHALL be shown

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| STBR-01 | P1: See where the selection stands | Design | Pending |
| STBR-02 | P1: See where the selection stands | Design | Pending |
| STBR-03 | P1: See where the selection stands | Design | Pending |
| STBR-04 | P1: See where the selection stands | Design | Pending |
| STBR-05 | P1: See where the selection stands | Design | Pending |
| STBR-06 | P1: See where the selection stands | Design | Pending |
| STBR-07 | P1: See where the selection stands | Design | Pending |
| STBR-08 | P1: See where the selection stands | Design | Pending |
| STBR-09 | P1: Know what is waiting to move | Design | Pending |
| STBR-10 | P1: Know what is waiting to move | Design | Pending |
| STBR-11 | P1: Know what is waiting to move | Design | Pending |
| STBR-12 | P1: Know what is waiting to move | Design | Pending |
| STBR-13 | P1: Know what is waiting to move | Design | Pending |
| STBR-14 | P1: Know what is waiting to move | Design | Pending |
| STBR-15 | P1: Move the commits | Design | Pending |
| STBR-16 | P1: Move the commits | Design | Pending |
| STBR-17 | P1: Move the commits | Design | Pending |
| STBR-18 | P1: Move the commits | Design | Pending |
| STBR-19 | P1: Move the commits | Design | Pending |
| STBR-20 | P1: Move the commits | Design | Pending |
| STBR-21 | P1: Move the commits | Design | Pending |
| STBR-22 | P1: Move the commits | Design | Pending |
| STBR-23 | P1: Move the commits | Design | Pending |
| STBR-24 | P1: Move the commits | Design | Pending |
| STBR-25 | P1: Move the commits | Design | Pending |
| STBR-26 | P1: Move the commits | Design | Pending |
| STBR-27 | P1: Move the commits | Design | Pending |
| STBR-28 | P1: Move the commits | Design | Pending |
| STBR-29 | P2: See what changed | Design | Pending |
| STBR-30 | P2: See what changed | Design | Pending |
| STBR-31 | P2: See what changed | Design | Pending |
| STBR-32 | P2: See what changed | Design | Pending |

**Coverage:** 32 total, 0 mapped to tasks yet (Design not run), 0 unmapped

---

## Success Criteria

- [ ] Every direction shows repo and branch for the current selection, and the Agents direction follows the session
- [ ] A long branch name is cut in the middle, never past 70% of the bar, and hovering shows it whole
- [ ] `↓n ↑n` is correct against local refs and never triggers a fetch on its own
- [ ] Sync, pull, push, fetch and publish all work against a bare remote in a temp repo, and every failure shows git's own first line
- [ ] A divergence, a missing upstream, a missing remote and a 120 s hang each produce a distinct, readable state
- [ ] The changed-file counter matches `git status` and its popover lists the same paths the force-remove dialog would
- [ ] The gate is green: `npm run typecheck && npm run lint && npm test`
