# Pinned Task Open Specification

## Problem Statement

A pinned task card in the Tasks pane shows the work item's type, state, id and title, but reading
its description, discussion or links still means finding the item in Azure DevOps by hand. Clicking
the card does nothing. The canonical URL is already stored with every pinned task
(`TaskBoard.pin` builds `https://dev.azure.com/<org>/<project>/_workitems/edit/<id>`).

## Goals

- [ ] One click on a pinned task's title or id opens that work item in the default browser
- [ ] The app opens only a URL main built for a pinned task, never one the renderer supplies

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Clicking the whole card | Owner decision (grill Q1): a missed click beside Start work or Agent would open the browser |
| Board view task chips | Their click already toggles the task highlight |
| Restricting the generic `setWindowOpenHandler` to https (AD-026) | Done by #115 (PR #123, AD-044); this feature does not route through it |
| Showing the work item inside the app | Owner decision (backlog, M3): it opens in the browser |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What is clickable | The card's title and its `#id`, styled as links (pointer cursor, underline on hover), keyboard-focusable | Owner decision (grill Q1) | y |
| What the renderer sends | The task's `{ id, org, project }` over a new `tasks:open` invoke | Same identity `tasks:unpin` and `tasks:parent` take | y |
| What main opens | The URL stored with that pinned task, only when `isHttpsUrl` (AD-044) accepts it and its host is `dev.azure.com` | F3's posture for `commits:open`: main builds or holds the URL, the renderer only names the item; the scheme rule is AD-044's one helper, the host check is this feature's own | y |
| A card with no details | Its `#id` stays a link; the title slot shows "details unavailable", which is not a link | The URL is stored at pin time, independent of the details fetch | y |
| Failure | `tasks:open` returns `{ ok: false, error }` and the pane shows the app's toast with that error | Mirrors `shortcuts:launch` and its toast | y |
| Base branch | `feature/pinned-task-open` stacked on `feature/window-open-https` (PR #123); the PR says "depends on #123" | Owner decision (2026-09-26): reuse AD-044's `isHttpsUrl` rather than a second https check; rebased with `--onto origin/main` once #123 merges | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Open a pinned task in the browser ⭐ MVP

**User Story**: As the owner, I want to click a pinned task's title or id and land on the work item in Azure DevOps so that I can read or edit it without searching.

**Why P1**: The request.

**Acceptance Criteria**:

1. WHEN the owner clicks a pinned task's title THEN the app SHALL open that task's stored work item URL in the default browser
2. WHEN the owner clicks a pinned task's `#id` THEN the app SHALL open the same URL
3. WHEN a link has keyboard focus and the owner presses Enter THEN the app SHALL open the same URL
4. WHILE a card has no details the `#id` SHALL remain a link and "details unavailable" SHALL NOT be one
5. WHEN `tasks:open` names a task that is not pinned THEN main SHALL return `{ ok: false, error: 'That task is no longer pinned.' }` and open nothing
6. IF the stored URL's scheme is not `https:` or its host is not `dev.azure.com` THEN main SHALL return `{ ok: false, error: 'Refusing to open an unexpected work item URL.' }` and open nothing
7. IF opening the browser fails THEN main SHALL return `{ ok: false, error }` with the system's message
8. WHEN `tasks:open` returns `ok: false` THEN the pane SHALL show the error in the app's toast
9. WHEN the owner clicks Unpin, Start work or Agent THEN the app SHALL NOT open the browser

**Independent Test**: Pin a task, click its title; the browser opens `…/_workitems/edit/<id>`.

---

## Edge Cases

- WHEN the same id is pinned in two projects THEN each card SHALL open its own project's item (identity is `{ id, org, project }`)
- WHEN the owner clicks a link twice quickly THEN the app SHALL open the URL twice, as the browser would; no guard is added

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PTOP-01 | P1 — AC 1 | Tasks | In Tasks |
| PTOP-02 | P1 — AC 2 | Tasks | In Tasks |
| PTOP-03 | P1 — AC 3 | Tasks | In Tasks |
| PTOP-04 | P1 — AC 4 | Tasks | In Tasks |
| PTOP-05 | P1 — AC 5 | Tasks | In Tasks |
| PTOP-06 | P1 — AC 6 | Tasks | In Tasks |
| PTOP-07 | P1 — AC 7 | Tasks | In Tasks |
| PTOP-08 | P1 — AC 8 | Tasks | In Tasks |
| PTOP-09 | P1 — AC 9 | Tasks | In Tasks |

**Coverage:** 9 total, 9 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] From the Tasks pane to the work item in the browser in one click
