# Status PR Link Specification

## Problem Statement

Once F4 and F5 land, the app knows the pull requests whose source is a worktree's branch — but only
inside the Files direction's Pull request mode. From anywhere else, whether the branch has a PR, and
whether reviewers approved it, is invisible. The status bar already shows the selected worktree's
repository, branch, changes and sync state; the PR is the missing piece of that line.

## Goals

- [ ] The status bar tells, without a click, whether the selected worktree's branch has an active PR, and how its review stands
- [ ] One click reaches the PR in the app; one more reaches it in the browser
- [ ] A branch without a PR offers to create one

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Required-reviewer policy (✓ only when every required reviewer approved) | Owner decision (grill Q8); no equivalent in the GitHub API F5 uses |
| Build / CI status of the PR | Not requested |
| Writing to the PR from the status bar | F4's four writes live in the Pull request mode |
| Polling | F4-Q10 (no polling); focus and Refresh re-query |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| When the lookup runs | On worktree selection, on window focus (5 s debounce) and on Refresh; both providers' `find` in parallel, then each found PR's `get` for its reviewers; cached per worktree | Owner decision (grill Q2) | y |
| One lookup for two surfaces | The status bar and the Pull request mode read the same per-worktree result; the lookup is F4's `use-pull-request`, with its search-and-cache part extracted if it is bound to the Files direction | Two surfaces must not double the API calls or disagree | y |
| One PR | Chip `PR #<n>`, plus `· Draft` when draft, plus the review mark; click opens the Files direction's Pull request mode on that PR; a ↗ beside it opens it in the browser through the provider's main-side opener (`ado-pr:open`, `github-pr:open`) | Owner decisions (grill Q1, Q6) | y |
| Several PRs | Chip `<n> PRs` opening a menu; each item shows number, title, target branch, provider and its mark, opens in the app, and has its own ↗ | Owner decision (grill Q4) | y |
| Review mark | From F4's provider-neutral reviewer states: ✕ if any reviewer rejected; else ⏸ if any is waiting for the author / requested changes; else ✓ if any approved (with or without suggestions); else none. The tooltip lists each reviewer and their state | Owner decisions (grill Q6, Q8): the worst mark wins | y |
| No PR | A muted `Create PR` chip when the search says creation is available (`createUrlAvailable`), opening the provider's creation page through its main-side opener; nothing otherwise | Owner decision (grill Q3) | y |
| Failure | A muted `PR ?` chip whose tooltip is the reason (sign-in needed, the error's message) for `auth`, `error` and `rate-limited` (until when); nothing for `no-remote` and `detached` | Owner decision (grill Q5) | y |
| While loading | The previous cached chip stays; with no cache, nothing shows until the lookup answers | No flicker on focus refresh; no placeholder that could read as "no PR" | y |
| Two providers disagree | Each provider's PRs count; one provider failing with the other finding PRs shows the found PRs, and the failure only in the menu's footer | F5 (FPRG-07): a failing provider never hides the other's PRs | y |
| Base branch | `feature/status-pr-link` off `origin/main` after F4 and F5 merged upstream (2026-10-10) | Owner decision (grill Q7). Executes only after F5 | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: See the branch's PR in the status bar ⭐ MVP

**User Story**: As the owner, I want the status bar to show the selected worktree's PR and its review state so that I know where the work stands without opening anything.

**Why P1**: The request.

**Acceptance Criteria**:

1. WHEN a worktree is selected THEN the app SHALL look up its branch's active PRs with both providers in parallel and fetch each found PR's reviewers
2. WHEN the window gains focus more than 5 seconds after the previous focus lookup, or the owner clicks Refresh THEN the app SHALL repeat the lookup for the selected worktree
3. WHEN the lookup finds exactly one PR THEN the status bar SHALL show `PR #<number>`, followed by `· Draft` when it is a draft
4. WHEN any reviewer rejected THEN the chip SHALL show ✕
5. WHEN no reviewer rejected and any is waiting for the author or requested changes THEN the chip SHALL show ⏸
6. WHEN no reviewer rejected or asked for changes and any approved THEN the chip SHALL show ✓
7. WHEN no reviewer voted THEN the chip SHALL show no mark
8. WHEN the pointer rests on the chip THEN its tooltip SHALL list every reviewer with their state
9. WHILE a lookup for an already-seen worktree runs, the status bar SHALL keep showing its cached chip

**Independent Test**: Select a worktree whose branch has an approved PR; the bar shows `PR #<n> ✓`.

---

### P1: Reach the PR ⭐ MVP

**User Story**: As the owner, I want to open the PR from the chip, in the app or in the browser, so that reviewing it is one click away.

**Why P1**: The request — "a way to access the PR".

**Acceptance Criteria**:

10. WHEN the owner clicks a one-PR chip THEN the app SHALL switch to the Files direction in Pull request mode on that PR
11. WHEN the owner clicks the ↗ beside the chip THEN main SHALL open the PR in the browser through the provider's opener
12. WHEN the lookup finds more than one PR THEN the chip SHALL read `<n> PRs` and open a menu listing each PR's number, title, target branch, provider and mark
13. WHEN the owner picks a PR in the menu THEN the app SHALL open it as in criterion 10, and its ↗ SHALL open it as in criterion 11
14. WHEN the menu is open and the owner clicks outside it or presses Escape THEN the menu SHALL close

**Independent Test**: With a branch that has two PRs, the menu lists both and each opens its own PR.

---

### P1: No PR, or no answer ⭐ MVP

**User Story**: As the owner, I want to be offered to create a PR when there is none, and to know when the app could not tell.

**Why P1**: Owner decisions Q3 and Q5.

**Acceptance Criteria**:

15. WHEN the lookup finds no PR and creation is available THEN the status bar SHALL show a muted `Create PR` chip that opens the provider's creation page through main
16. WHEN the lookup finds no PR and creation is not available THEN the status bar SHALL show no PR chip
17. IF a provider reports `auth`, `error` or `rate-limited` and no provider found a PR THEN the status bar SHALL show a muted `PR ?` chip whose tooltip gives the reason
18. WHEN no remote is recognised or HEAD is detached THEN the status bar SHALL show no PR chip
19. IF one provider fails and the other finds PRs THEN the chip SHALL reflect the found PRs, and the failure SHALL appear only as a note in the menu

---

## Edge Cases

- WHEN the selected worktree changes while a lookup is in flight THEN the late answer SHALL be cached for its own worktree and SHALL NOT paint the new one's chip
- WHEN a PR's `get` fails while its `find` succeeded THEN its chip SHALL show number and draft without a mark, and the tooltip SHALL say the reviewers could not be read
- WHEN the Pull request mode and the status bar look at the same worktree THEN one lookup SHALL serve both

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SPRL-01 | P1: see — AC 1 | T3, T4, T8, T9 | Implemented |
| SPRL-02 | P1: see — AC 2 | T4, T8 | Implemented |
| SPRL-03 | P1: see — AC 3 | T2, T6, T8 | Implemented |
| SPRL-04 | P1: see — AC 4 | T1, T8 | Implemented |
| SPRL-05 | P1: see — AC 5 | T1, T8 | Implemented |
| SPRL-06 | P1: see — AC 6 | T1, T8 | Implemented |
| SPRL-07 | P1: see — AC 7 | T1, T8 | Implemented |
| SPRL-08 | P1: see — AC 8 | T1, T6, T8 | Implemented |
| SPRL-09 | P1: see — AC 9 | T3, T4, T8 | Implemented |
| SPRL-10 | P1: reach — AC 10 | T5, T6, T8, T9 | Implemented |
| SPRL-11 | P1: reach — AC 11 | T6, T8, T9 | Implemented |
| SPRL-12 | P1: reach — AC 12 | T2, T6, T8 | Implemented |
| SPRL-13 | P1: reach — AC 13 | T5, T6, T8 | Implemented |
| SPRL-14 | P1: reach — AC 14 | T6, T8 | Implemented |
| SPRL-15 | P1: no PR — AC 15 | T2, T6, T8, T9 | Implemented |
| SPRL-16 | P1: no PR — AC 16 | T2, T6, T8 | Implemented |
| SPRL-17 | P1: no PR — AC 17 | T2, T6, T8 | Implemented |
| SPRL-18 | P1: no PR — AC 18 | T2, T6, T8 | Implemented |
| SPRL-19 | P1: no PR — AC 19 | T2, T8 | Implemented |

**Coverage:** 19 total, 19 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] From any direction, the selected worktree's PR state is readable in the status bar
- [ ] No lookup runs while the owner does not select, focus or refresh
