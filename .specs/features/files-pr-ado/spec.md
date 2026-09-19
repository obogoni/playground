# Files Direction — Azure DevOps Pull Requests (F4) Specification

## Epic Context

**F4 of 5** of the Files epic (slices and inherited decisions: `.specs/features/files-explore/spec.md` § Epic Context). F4 inherits:

- **Which PR** = an active PR whose source is the worktree's branch, found by searching **every** remote, fork → upstream included; more than one → a picker (epic grill Q14)
- **Four writes, as P2 of this slice**: reply, resolve / reopen, a new thread on a text selection, a general PR comment (epic grill Q6, Q10, Q12)
- **A new thread can only start from a view rendering the PR's own head version, fetched from the provider**, so the selected line is the line reviewers see (epic grill Q9)
- **It breaks the README's "ADO integration is view-only" posture** — an AD is proposed below

F4 builds on F2's diff viewer, and on F3's remote recognition (`parseRemote`) and main-built, https-only opener.

---

## Problem Statement

A pull request is where an agent's work meets review, and today the app knows nothing about it.
Reading reviewers' comments means the browser; answering them means the browser; relating a comment
to the code means holding both in your head. F4 brings the current branch's Azure DevOps PR into the
Files direction: its overview, its diff with every thread beside its line, and — with P2 — the
ability to reply, resolve, and start threads from a selection.

## Goals

- [ ] The branch's PR is found without configuration, including a PR from a fork
- [ ] Every comment reads next to the line it is about, in the same diff viewer as the rest of the app
- [ ] Replying, resolving and commenting on a selection happen without leaving the app
- [ ] Nothing a third party wrote can execute or navigate anywhere unsafe inside the app
- [ ] Nothing is ever written to Azure DevOps except by an explicit click of the user

## Out of Scope

| Feature | Reason |
| ------- | ------- |
| Voting, approving, completing, abandoning or creating a PR in the app | Not requested; the four writes are the whole write surface (epic grill Q10). Creating a PR opens ADO's page in the browser (F4-Q9) |
| Editing or deleting a comment, reactions ("like") | Not among the four writes |
| An iteration picker ("changes since iteration N") | Owner decision (F4-Q2): the whole PR, latest iteration |
| A PR-wide All changes stack | Not decided in either grill; per-file PR diffs and the Overview cover the ask. F2's props-driven `AllChangesTab` makes it a small later addition |
| Starting a thread on the original (left) side | Owner decision (F4-Q4). Threads others anchored there are still shown |
| Polling | Owner decision (F4-Q10) |
| Completed or abandoned PRs | Only active PRs are "the branch's PR" |
| `@mention` autocomplete, attachments, images uploaded to a comment | Not requested |
| GitHub pull requests | F5 |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Where the PR lives | A fifth mode, **Pull request**, in F1's selector: the left column lists the PR's files, the right column holds a fixed **Overview** tab and per-file PR diff tabs | Owner decision (F4-Q1); F5 occupies the same place | y |
| Which remotes are searched | Every remote `parseRemote` (F3) recognizes as Azure DevOps | One recognition rule for the whole epic | y |
| PR diff sides | Original = the file at the latest iteration's common (merge-base) commit; modified = the file at the latest iteration's source commit; **both read from Azure DevOps**, never from the local repository | Owner decision (F4-Q2) plus epic Q9: the reviewers' version, even when the local branch is ahead or behind | y |
| Thread placement | Anchored threads under their line in the PR diff (a Monaco view zone), and all threads listed in the Overview with `file:line` | Owner decision (F4-Q3) | y |
| Thread positions | As Azure DevOps tracks them for the latest iteration; a thread ADO cannot place in it is listed in the Overview as **outdated** and not drawn in the diff | Drawing a comment on the wrong line is worse than listing it separately | y |
| Resolved threads | Collapsed to one line with status and author; expandable | Owner decision (F4-Q5) | y |
| System threads | Never in the diff; a collapsed **Activity** section of the Overview | Owner decision (F4-Q6) | y |
| Markdown | **[refined at Design, D1]** Rendered by `markdown-it` with HTML parsing disabled — any tag becomes escaped text, so there is no HTML to sanitize; only links and images get rules. A thread whose `Microsoft.TeamFoundation.Discussion.SupportsMarkdown` property is not `1` is shown as plain text, as Azure DevOps itself does | Owner decision (F4-Q7, design D1): third-party content inside an Electron app that runs agents on your disk. Not parsing HTML is stronger than cleaning it afterwards | y |
| Links in rendered markdown | Opened only when `https:`, through main — never through the template's `setWindowOpenHandler` | Extends F3's FCMT-28 posture to URLs the app did not build: a scheme allowlist instead of construction | y |
| Images in markdown | Rendered as links, never loaded | The CSP (`img-src 'self' data:`) blocks remote images anyway, and ADO attachments need auth | y |
| No PR | Empty state plus **Create PR** opening ADO's creation page with the source branch filled, URL built in main | Owner decision (F4-Q9) | y |
| Freshness | Reload on entering the mode, on window focus (5 s debounce, as the app does for tasks), after each own write, and on a refresh button; a banner when a new iteration arrived | Owner decision (F4-Q10); no polling | y |
| Composer | Markdown text with Write / Preview (same sanitizer), Ctrl+Enter posts; on failure the text stays and the error shows inline | Owner decision (F4-Q11): a comment is never lost | y |
| Selection anchor | Start and end line **and** character offset of the selection on the modified side, against the latest iteration | ADO anchors threads to line + offset; a line-only anchor would highlight the wrong span | y |
| Auth | The existing `az account get-access-token` path; failure shows the Tasks pane's "run `az login`" message and the TopBar `az` chip state | No new auth surface, no stored secret | y |
| **ADO sanitizing comment content** | **To verify at Design, against a PR in the owner's own sandbox, with no real data entering this repository.** The owner's global notes record that ADO deletes anything between `<` and `>` in work-item multiline fields — inside backticks too — and escapes `"` and `>`. If PR comments behave the same, `List<string>` in a review comment reaches reviewers mutilated. If verified, Design adds an AC: the composer warns before posting content that would be altered | Unknown for PR comments; guessing either way would ship a defect or a pointless warning | n — verify at Design |
| Gateway housekeeping | The raw NUL byte at `ado-gateway.ts:280` (a composite-key separator inside a template string) is replaced by the `\u0000` escape — same runtime value — in the task that extends the gateway | Owner decision (F4-Q8). The byte makes grep and ripgrep treat the file as binary, so code searches silently skip the ADO gateway. Git is unaffected: the byte sits past the 8000 bytes git inspects | y |
| Branch base | `feature/files-pr-ado` stacked on `feature/files-commits` | Reuses F3's `parseRemote` and safe opener, and F2's viewer | y |

**Project decision — recorded as AD-027 in `.specs/STATE.md` (2026-09-19), covering GitHub as well (F5):**
> *The app writes to Azure DevOps and GitHub for pull-request comments only — reply, thread state, a new
> thread from a selection, a general comment — each the direct result of a user action; no background
> or automatic writes. The README's "ADO integration is view-only" is amended when this feature ships (T26).*

**Open questions:** one, logged above and owned by Design — whether Azure DevOps alters `<…>` in PR comment content.

---

## User Stories

### P1: Find the branch's PR ⭐ MVP

**User Story**: As the developer, I want the Pull request mode to find my branch's active Azure
DevOps PR on its own, so that I never paste a PR link to get to it.

**Why P1**: Everything else hangs off the PR being found.

**Acceptance Criteria**:

1. F1's mode selector SHALL offer a fifth mode, **Pull request** <!-- ubiquitous -->
2. WHILE in Pull request mode the system SHALL search every Azure DevOps remote of the repository for active PRs whose source branch is the worktree's branch, including PRs whose source lives in a fork <!-- state-driven -->
3. WHEN exactly one PR is found THEN the mode SHALL show it <!-- event-driven -->
4. WHEN more than one PR is found THEN the mode SHALL offer a picker naming each PR's number, title and target branch, and SHALL remember the choice per worktree while the app runs <!-- event-driven -->
5. IF no PR is found THEN the mode SHALL say so and offer **Create PR**, opening Azure DevOps' creation page with the source branch filled <!-- unwanted-behavior -->
6. IF the repository has no Azure DevOps remote THEN the mode SHALL say so instead of searching <!-- unwanted-behavior -->
7. IF the Azure DevOps token cannot be obtained THEN the mode SHALL show the existing "run `az login`" message <!-- unwanted-behavior -->
8. IF `HEAD` is detached THEN the mode SHALL say there is no branch to look up <!-- unwanted-behavior -->

**Independent Test**: A branch pushed to a fork with an active PR into the upstream repository is found with no configuration; a branch with no PR shows Create PR.

---

### P1: Read the PR ⭐ MVP

**User Story**: As the developer, I want an overview of the PR and a diff of each file with every
comment beside its line, so that I read the review in context.

**Why P1**: Reading the review is the slice's reason to exist.

**Acceptance Criteria**:

9. WHILE in Pull request mode the right column SHALL show a fixed **Overview** tab with the PR's number, title, author, status including draft, source and target branches, creation date and each reviewer with their vote <!-- state-driven -->
10. The Overview SHALL render the PR description as sanitized markdown <!-- ubiquitous -->
11. The Overview SHALL list every non-system thread with its location (`file:line`, or general), status, author and first comment <!-- ubiquitous -->
12. WHEN the user activates an anchored thread in the Overview THEN the view SHALL open that file's PR diff at the thread's line <!-- event-driven -->
13. The system SHALL show system threads only in a collapsed **Activity** section of the Overview <!-- ubiquitous -->
14. The Overview SHALL offer **Open in browser** for the PR, through the main-built https opener <!-- ubiquitous -->
15. WHILE in Pull request mode the left column SHALL list the PR's changed files as a tree with their change status <!-- state-driven -->
16. WHEN the user opens a file THEN a PR diff tab SHALL compare the file at the latest iteration's merge-base commit with the file at its source commit, both read from Azure DevOps <!-- event-driven -->
17. PR diff tabs SHALL use F2's diff viewer with its layout, whitespace, folding, navigation and line-ending behaviour <!-- ubiquitous -->
18. The PR diff SHALL draw each non-system thread under the line Azure DevOps places it on for the latest iteration <!-- ubiquitous -->
19. IF Azure DevOps cannot place a thread in the latest iteration THEN the thread SHALL be listed in the Overview as outdated and SHALL NOT be drawn in the diff <!-- unwanted-behavior -->
20. The system SHALL show active threads expanded and resolved threads collapsed to their status and author, expandable <!-- ubiquitous -->
21. Each comment SHALL render as sanitized markdown with its author and relative date <!-- ubiquitous -->

**Independent Test**: A PR with two active threads, one resolved thread and a vote shows all three in the Overview; opening the file shows the two active threads under their lines and the resolved one collapsed.

---

### P1: Nothing third-party is trusted ⭐ MVP

**User Story**: As the developer, I want everything other people wrote to be rendered inertly, so that
reading a PR can never run code or send me somewhere unsafe.

**Why P1**: F4 is the first time the app renders content written by third parties.

**Acceptance Criteria**:

22. Rendered markdown SHALL contain no raw HTML, no script and no event-handler attribute <!-- ubiquitous -->
23. WHEN the user activates a link in rendered markdown THEN the system SHALL open it through main only if its scheme is `https:`, and SHALL do nothing otherwise <!-- event-driven -->
24. Images in rendered markdown SHALL be shown as links and SHALL NOT be loaded <!-- ubiquitous -->

**Independent Test**: A comment containing a `<script>`, an `onerror` image, a `javascript:` link and an `https:` link renders the text inertly; only the `https:` link opens, in the browser.

---

### P2: Answer the review

**User Story**: As the developer, I want to reply, resolve or reopen threads, comment on a selection
and leave a general comment, so that I handle the review without switching to the browser.

**Why P2**: Reading works without it; this completes the loop (epic grill Q12: writes as P2).

**Acceptance Criteria**:

25. Each thread SHALL offer **Reply**; WHEN a reply is posted THEN it SHALL appear at the end of that thread <!-- event-driven -->
26. Each thread SHALL offer changing its status among Azure DevOps' thread statuses; setting Active reopens a resolved thread <!-- ubiquitous -->
27. WHEN the user selects text on the modified side of a PR diff THEN the view SHALL offer **Comment**, opening a composer anchored to the selection's start and end line and offset in that file at the latest iteration <!-- event-driven -->
28. A selection on the original side SHALL NOT offer Comment <!-- ubiquitous -->
29. The Overview SHALL offer a general comment, posted as a thread with no file context <!-- ubiquitous -->
30. The composer SHALL offer Write and Preview, Preview using the same sanitized rendering, and Ctrl+Enter SHALL post <!-- ubiquitous -->
31. IF posting fails THEN the composer SHALL keep the typed text and show the failure inline <!-- unwanted-behavior -->
32. The system SHALL write to Azure DevOps only as the direct result of a user action — never automatically or in the background <!-- ubiquitous -->

**Independent Test**: Select two lines on the modified side, comment, and the thread appears under them — and in the browser on the same lines; set it to Fixed and it collapses.

---

### P2: Stay current

**User Story**: As the developer, I want the PR to refresh when I come back to it and after I write,
so that I never answer a thread that has already moved on.

**Why P2**: The PR is correct when opened without it.

**Acceptance Criteria**:

33. The PR SHALL reload on entering the mode, on window focus debounced by 5 s, after each successful write, and on a refresh button <!-- event-driven -->
34. WHEN a reload finds a newer latest iteration than the one on screen THEN the view SHALL show a banner offering to reload the open diffs <!-- event-driven -->
35. The system SHALL NOT poll Azure DevOps <!-- ubiquitous -->

**Independent Test**: With the PR open, push a commit from another machine, focus the app, and the new-iteration banner appears.

---

### P3: Keep the gateway searchable

**User Story**: As a maintainer, I want the ADO gateway to be plain text, so that code search finds it.

**Why P3**: Housekeeping, taken while the file is being extended (F4-Q8).

**Acceptance Criteria**:

36. The source of `ado-gateway.ts` SHALL contain no control byte other than tab, line feed and carriage return, with the composite-key separator written as the `\u0000` escape and its runtime value unchanged <!-- ubiquitous -->

---

## Edge Cases

- WHEN a PR's latest iteration deleted a file THEN its PR diff SHALL show the deletion, and threads anchored in it SHALL be listed as outdated
- IF a PR has more threads than one API page returns THEN every thread SHALL still be listed
- WHEN a write succeeds but the following reload fails THEN the written content SHALL stay visible with a notice that the PR could not be refreshed
- IF a reviewer is a group THEN it SHALL be listed with its vote like a person
- WHEN the selected PR stops being active (completed or abandoned elsewhere) THEN the next reload SHALL say so instead of showing a stale PR

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FPRA-01 | P1: Find the branch's PR | Design | Pending |
| FPRA-02 | P1: Find the branch's PR | Design | Pending |
| FPRA-03 | P1: Find the branch's PR | Design | Pending |
| FPRA-04 | P1: Find the branch's PR | Design | Pending |
| FPRA-05 | P1: Find the branch's PR | Design | Pending |
| FPRA-06 | P1: Find the branch's PR | Design | Pending |
| FPRA-07 | P1: Find the branch's PR | Design | Pending |
| FPRA-08 | P1: Find the branch's PR | Design | Pending |
| FPRA-09 | P1: Read the PR | Design | Pending |
| FPRA-10 | P1: Read the PR | Design | Pending |
| FPRA-11 | P1: Read the PR | Design | Pending |
| FPRA-12 | P1: Read the PR | Design | Pending |
| FPRA-13 | P1: Read the PR | Design | Pending |
| FPRA-14 | P1: Read the PR | Design | Pending |
| FPRA-15 | P1: Read the PR | Design | Pending |
| FPRA-16 | P1: Read the PR | Design | Pending |
| FPRA-17 | P1: Read the PR | Design | Pending |
| FPRA-18 | P1: Read the PR | Design | Pending |
| FPRA-19 | P1: Read the PR | Design | Pending |
| FPRA-20 | P1: Read the PR | Design | Pending |
| FPRA-21 | P1: Read the PR | Design | Pending |
| FPRA-22 | P1: Nothing third-party is trusted | Design | Pending |
| FPRA-23 | P1: Nothing third-party is trusted | Design | Pending |
| FPRA-24 | P1: Nothing third-party is trusted | Design | Pending |
| FPRA-25 | P2: Answer the review | Design | Pending |
| FPRA-26 | P2: Answer the review | Design | Pending |
| FPRA-27 | P2: Answer the review | Design | Pending |
| FPRA-28 | P2: Answer the review | Design | Pending |
| FPRA-29 | P2: Answer the review | Design | Pending |
| FPRA-30 | P2: Answer the review | Design | Pending |
| FPRA-31 | P2: Answer the review | Design | Pending |
| FPRA-32 | P2: Answer the review | Design | Pending |
| FPRA-33 | P2: Stay current | Design | Pending |
| FPRA-34 | P2: Stay current | Design | Pending |
| FPRA-35 | P2: Stay current | Design | Pending |
| FPRA-36 | P3: Keep the gateway searchable | Design | Pending |

**Coverage:** 36 total, 0 mapped to tasks yet (Design not run), 0 unmapped

---

## Success Criteria

- [ ] A fork-flow PR and a same-repository PR are both found with no configuration
- [ ] Every thread reads under the same line in the app and in Azure DevOps' own web view
- [ ] A comment started from a two-line selection lands on those two lines in Azure DevOps
- [ ] Script, event handlers and non-https links in third-party content are inert
- [ ] No request that writes to Azure DevOps is ever sent without a click
- [ ] `ado-gateway.ts` shows up in `grep` and ripgrep results again
- [ ] The gate is green: `npm run typecheck && npm run lint && npm test`
