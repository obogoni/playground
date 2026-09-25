# Files Direction — Commits (F3) Specification

## Epic Context

**F3 of 5** of the Files epic (slices and inherited decisions: `.specs/features/files-explore/spec.md` § Epic Context). F3 inherits:

- **Scope** = the branch's commits since the base — the same merge base, and the same switchable, persisted base, as F1's diff-to-origin mode (epic grill Q4, Q17)
- **A click opens that commit's diff** in F2's viewer (epic grill Q17). F2's design made each side of a diff a revision or the disk (`DiffRef`), so a commit is `commit^` → `commit` with no change to main's diff reader

---

## Problem Statement

F1 and F2 show *what* a branch changed, but not *how it got there*. Which commit introduced a change,
what an agent committed while you were away, which commits are still only local — all of that is a
`git log` in a terminal today. F3 adds the branch's history to the Files direction, opens any commit
as a stack of diffs, and hands a pushed commit to its page on Azure DevOps or GitHub.

## Goals

- [ ] The branch's own commits since its base are one mode away, newest first, with uncommitted work on top
- [ ] Any commit opens as a readable stack of diffs, with everything F2's All changes tab offers
- [ ] Commits that exist only locally are visibly different from pushed ones
- [ ] A pushed commit is one click from its page on the provider; a sha is one click from the clipboard

## Out of Scope

| Feature | Reason |
| ------- | ------- |
| Any history-changing action (revert, cherry-pick, reset, amend, reword) | The Files direction is read-only (epic grill Q2) |
| A commit graph | The list is first-parent (F3-Q3); a graph answers a different question |
| Search or filter by author, message or path | Not requested |
| Blame / annotate | Not requested |
| Commits of another branch, or the full log | Epic grill Q17: "since the base" only |
| Opening a commit on hosts other than GitHub and Azure DevOps | Owner decision (F3-Q11): the action is hidden rather than guessing a URL |
| Pull requests | F4, F5 — which will reuse F3's remote-URL recognition |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Where the list lives | A fourth mode, **Commits**, in F1's mode selector; the tree's place in the left column | Owner decision (F3-Q1): the same gesture as the other three modes | y |
| Which commits | `git log --first-parent <mergeBase>..HEAD`: the branch's own commits, each merge as one row | Owner decision (F3-Q3). A branch that merged `develop` would otherwise list everyone else's commits | y |
| Base | The same persisted base as diff-to-origin (F1 D4), with the same picker and the same no-`origin/HEAD` prompt | One base per worktree; two would disagree silently | y |
| Row content | Short sha, subject, author, relative date; the full message on hover | Owner decision (F3-Q5) | y |
| Paging | 100 commits, then **Load more** for the next 100 | Owner decision (F3-Q6): a badly chosen base must not pour thousands of rows | y |
| Not-pushed marker | A commit not reachable from the branch's upstream is marked; with no upstream every commit is | Owner decision (F3-Q4). Local refs only — the same information as the status bar's `↑n`, now per commit | y |
| Uncommitted row | When the worktree is dirty, the first row reads **Uncommitted changes (N)** and switches to uncommitted mode | Owner decision (F3-Q8): the branch's whole story, newest first | y |
| What a click opens | A tab titled `<short sha> · <subject>` holding F2's stack for that commit | Owner decision (F3-Q2): full reuse of F2's All changes tab | y |
| Commit diff reference | Each file from the commit's **first parent** to the commit; a root commit has empty original sides | Git's own default for a merge, and consistent with the first-parent list | y |
| Commit tab lifetime | Keyed by sha, closable, per worktree in memory like every tab (F1 FXPL-18), kept across mode switches | A commit tab never changes what it shows | y |
| Copy | The **full** 40-character sha | A short sha is ambiguous in large repositories and some tools reject it | y |
| Which remote a commit opens on | The branch's upstream remote | Owner decision (F3-Q9). A commit marked pushed is guaranteed to exist there; in the fork flow, `origin` would 404 until the PR merges | y |
| Not-pushed commit | Open in browser shown **disabled**, with a tooltip saying it has not been pushed | Owner decision (F3-Q10) | y |
| Branch with no upstream | Open in browser not offered — no remote is known | There is nothing to disable toward | y |
| Recognized hosts | GitHub (`https://github.com/…`, `git@github.com:…`), Azure DevOps (`https://dev.azure.com/…`, `git@ssh.dev.azure.com:v3/…`, `https://<org>.visualstudio.com/…`) | Owner decision (F3-Q11): other hosts get no button, never a guessed URL. F4 / F5 reuse this recognition | y |
| What gets opened | Only an `https` URL built by the app from a recognized remote | A remote URL is repository content; it must never reach the OS shell verbatim | y |
| Freshness | The list follows F1's `gitStateChanged` (a commit, amend, reset or rebase moves `HEAD`) and a base change | The list only changes when history does | y |
| Not-pushed markers after a push | **[added at Design, D1]** Recomputed when the status bar completes a push, sync, publish or fetch, and on window focus | A push moves `refs/remotes/<remote>/<branch>` — loose or in `packed-refs` — not the index or `HEAD` that F1's watcher observes; without this the markers lie right after the push the app itself performed | y |
| Branch base | `feature/files-commits` stacked on `feature/files-diff` | F3's commit tab is F2's stack | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: List the branch's commits ⭐ MVP

**User Story**: As the developer, I want a Commits mode listing my branch's own commits since its
base, so that I can see how the branch got to where it is.

**Why P1**: The list is the slice.

**Acceptance Criteria**:

1. F1's mode selector SHALL offer a fourth mode, **Commits** <!-- ubiquitous -->
2. WHILE in Commits mode the left column SHALL list the first-parent commits from the merge base to `HEAD`, newest first <!-- state-driven -->
3. Each commit row SHALL lead with the subject, and show the author and the relative commit date **[amended 2026-09-20, AD-038: the short sha left the row for the tooltip and the row menu]** <!-- ubiquitous -->
4. WHEN the user hovers a commit row THEN the view SHALL show the full commit message <!-- event-driven -->
5. The system SHALL mark a merge commit's row as a merge <!-- ubiquitous -->
6. WHILE in Commits mode the view SHALL show the base picker, sharing the base persisted for diff-to-origin mode <!-- state-driven -->
7. IF the repository has no `origin/HEAD` and no base was chosen THEN the Commits mode SHALL show F1's base prompt (FXPL-11) and list nothing <!-- unwanted-behavior -->
8. WHEN more than 100 commits exist since the base THEN the list SHALL show the newest 100 followed by **Load more** <!-- event-driven -->
9. WHEN the user activates Load more THEN the list SHALL append the next 100 commits <!-- event-driven -->
10. IF no commit exists since the base THEN the list SHALL say the branch has no commits of its own <!-- unwanted-behavior -->
11. WHEN the user returns to a worktree THEN Commits SHALL be restored if it was that worktree's last mode, like the other three (FXPL-13) <!-- event-driven -->

**Independent Test**: A branch cut from `main`, with three commits of its own and a merge of `develop` bringing twenty more, lists four rows — the three and one merge — newest first.

---

### P1: Know what is local and what is pending ⭐ MVP

**User Story**: As the developer, I want commits I have not pushed to stand out, and my uncommitted
work to head the list, so that the list tells me where the branch really stands.

**Why P1**: Without it the list cannot answer "what still needs to go up".

**Acceptance Criteria**:

12. The system SHALL mark every commit not reachable from the branch's upstream as not pushed <!-- ubiquitous -->
13. IF the branch has no upstream THEN every commit in the list SHALL be marked not pushed <!-- unwanted-behavior -->
14. WHILE the worktree has uncommitted changes the list SHALL begin with a row reading **Uncommitted changes (N)**, N being the changed-file count <!-- state-driven -->
15. WHEN the user activates the uncommitted row THEN the view SHALL switch to uncommitted-changes mode <!-- event-driven -->

**Independent Test**: Push two of five commits and dirty one file: the list starts with `Uncommitted changes (1)`, and exactly the newest three commits carry the not-pushed marker.

---

### P1: Read a commit ⭐ MVP

**User Story**: As the developer, I want a commit to open as a stack of the diffs it made, so that I
can read one change set exactly as it was committed.

**Why P1**: The epic grill made it the click's meaning.

**Acceptance Criteria**:

16. WHEN the user activates a commit THEN the view SHALL open, or focus when already open, a tab titled `<short sha> · <subject>` stacking the diff of every file the commit changed <!-- event-driven -->
17. The commit tab SHALL compare each file between the commit's first parent and the commit <!-- ubiquitous -->
18. IF the commit has no parent THEN every original side in its tab SHALL be empty <!-- unwanted-behavior -->
19. The commit tab SHALL present its files exactly as F2's All changes tab does, including the section behaviour, totals, navigation, layout and whitespace preferences and line-ending markers of FDIF-13..16 and FDIF-19..26 <!-- ubiquitous -->
20. The system SHALL key a commit tab by its sha, let the user close it, and keep it open across mode switches <!-- ubiquitous -->

**Independent Test**: A commit that renamed one file and edited two opens as a three-section stack with the rename's old content on the left, and switching to full-folder mode leaves its tab open.

---

### P2: Reach a commit outside the app

**User Story**: As the developer, I want to copy a commit's sha and open a pushed commit on Azure
DevOps or GitHub, so that I can share or review it where the team works.

**Why P2**: The list is useful without it; this links it to the rest of the workflow.

**Acceptance Criteria**:

21. Each commit row's context menu SHALL offer **Copy sha** **[amended 2026-09-20, AD-038]** <!-- ubiquitous -->
22. WHEN the user activates Copy sha THEN the system SHALL put the full 40-character sha on the clipboard <!-- event-driven -->
23. WHERE the branch's upstream remote is a recognized GitHub or Azure DevOps remote, each commit row's context menu SHALL offer **Open in browser** **[amended 2026-09-20, AD-038]** <!-- optional-feature -->
24. WHEN the user activates Open in browser on a pushed commit THEN the system SHALL open that commit's page on the upstream remote in the default browser <!-- event-driven -->
25. IF the commit is not pushed THEN Open in browser SHALL be disabled with a tooltip saying the commit has not been pushed <!-- unwanted-behavior -->
26. IF the branch has no upstream, or its upstream host is not recognized, THEN Open in browser SHALL NOT be offered <!-- unwanted-behavior -->
27. The system SHALL recognize GitHub remotes over HTTPS and SSH, and Azure DevOps remotes on `dev.azure.com` over HTTPS, `ssh.dev.azure.com` over SSH, and `<org>.visualstudio.com` <!-- ubiquitous -->
28. The system SHALL open only an `https` URL it built from a recognized remote, never a remote URL verbatim <!-- ubiquitous -->

**Independent Test**: On a fork-flow branch pushed to a GitHub fork over SSH, Open in browser on a pushed commit lands on `https://github.com/<fork-owner>/<repo>/commit/<sha>`; on an unpushed commit the button is disabled with its tooltip.

---

### P2: Stay current

**User Story**: As the developer, I want the list to follow new commits and rewritten history, so that
what an agent commits appears without a refresh.

**Why P2**: The list is correct when opened without it.

**Acceptance Criteria**:

29. WHEN `HEAD` moves — a new commit, an amend, a reset or a rebase — THEN the Commits list SHALL refresh within 1 s <!-- event-driven -->
30. WHEN the user changes the base THEN the Commits list SHALL refresh against the new merge base <!-- event-driven -->
31. WHEN the list refreshes THEN an open commit tab SHALL keep showing the commit it was opened for <!-- event-driven -->
32. WHEN the status bar completes a push, sync, publish or fetch, or the window regains focus, THEN the not-pushed markers SHALL be recomputed <!-- event-driven -->

**Independent Test**: With the Commits mode open, an agent commits: a new row appears on top within a second, and an already open commit tab is untouched.

---

## Edge Cases

- WHEN a commit's subject is empty THEN its row SHALL read `(no subject)`
- WHILE `HEAD` is detached the list SHALL still show first-parent commits from the merge base to `HEAD`
- IF an open commit tab's commit no longer exists in the repository (after an aggressive `gc`) THEN the tab SHALL show git's error instead of a stale stack
- WHEN a commit changes more than 10 files THEN its tab SHALL follow F2's 10-expanded rule (FDIF-21)
- WHEN an amend replaces the newest commit THEN the list SHALL show the new sha and a tab opened on the old one SHALL keep showing the old one
- IF the upstream remote URL carries credentials (`https://user:token@…`) THEN the built URL SHALL NOT include them

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FCMT-01 | P1: List the branch's commits | Design | Pending |
| FCMT-02 | P1: List the branch's commits | Design | Pending |
| FCMT-03 | P1: List the branch's commits | Design | Pending |
| FCMT-04 | P1: List the branch's commits | Design | Pending |
| FCMT-05 | P1: List the branch's commits | Design | Pending |
| FCMT-06 | P1: List the branch's commits | Design | Pending |
| FCMT-07 | P1: List the branch's commits | Design | Pending |
| FCMT-08 | P1: List the branch's commits | Design | Pending |
| FCMT-09 | P1: List the branch's commits | Design | Pending |
| FCMT-10 | P1: List the branch's commits | Design | Pending |
| FCMT-11 | P1: List the branch's commits | Design | Pending |
| FCMT-12 | P1: Know what is local and what is pending | Design | Pending |
| FCMT-13 | P1: Know what is local and what is pending | Design | Pending |
| FCMT-14 | P1: Know what is local and what is pending | Design | Pending |
| FCMT-15 | P1: Know what is local and what is pending | Design | Pending |
| FCMT-16 | P1: Read a commit | Design | Pending |
| FCMT-17 | P1: Read a commit | Design | Pending |
| FCMT-18 | P1: Read a commit | Design | Pending |
| FCMT-19 | P1: Read a commit | Design | Pending |
| FCMT-20 | P1: Read a commit | Design | Pending |
| FCMT-21 | P2: Reach a commit outside the app | Design | Pending |
| FCMT-22 | P2: Reach a commit outside the app | Design | Pending |
| FCMT-23 | P2: Reach a commit outside the app | Design | Pending |
| FCMT-24 | P2: Reach a commit outside the app | Design | Pending |
| FCMT-25 | P2: Reach a commit outside the app | Design | Pending |
| FCMT-26 | P2: Reach a commit outside the app | Design | Pending |
| FCMT-27 | P2: Reach a commit outside the app | Design | Pending |
| FCMT-28 | P2: Reach a commit outside the app | Design | Pending |
| FCMT-29 | P2: Stay current | Design | Pending |
| FCMT-30 | P2: Stay current | Design | Pending |
| FCMT-31 | P2: Stay current | Design | Pending |
| FCMT-32 | P2: Stay current | Design | Pending |

**Coverage:** 32 total, 0 mapped to tasks yet (Design not run), 0 unmapped

---

## Success Criteria

- [ ] A branch that merged `develop` lists only its own commits and the merge, newest first
- [ ] Exactly the unpushed commits carry the marker, and uncommitted work heads the list
- [ ] Any commit — a rename, a root commit, a merge — opens as a correct stack of diffs
- [ ] A pushed commit opens on the right fork's page on GitHub or Azure DevOps; an unpushed one explains why it cannot
- [ ] No URL is ever opened that the app did not build itself
- [ ] The gate is green: `npm run typecheck && npm run lint && npm test`
