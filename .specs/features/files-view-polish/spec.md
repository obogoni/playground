# Files View Polish Specification

## Problem Statement

The Files direction's tab strip only grows: tabs are closed one × at a time, and there is no way to
keep a few tabs at hand while clearing the rest. The All changes stack opens its first ten sections
and folds the others (FDIF-21), and each section is toggled on its own, so reading or skimming a
forty-file change means forty clicks. Both are the ergonomics VS Code and Visual Studio users
expect from a tab strip and a multi-file diff.

## Goals

- [ ] A tab can be pinned, and pinned tabs survive every bulk close but Close all
- [ ] The strip can be cleared in one action, entirely or keeping pinned tabs
- [ ] Every All changes section opens or folds in one click

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Pinned tabs surviving a restart | Owner decision (grill Q5): tabs live in memory (FXPL-18); pinning is one more fact about a tab |
| Keyboard shortcuts (Ctrl+W, Ctrl+K W, …) | Not requested |
| Dragging tabs to reorder | Not requested |
| A shared context-menu component | The sidebar and F3's commit rows (both on `main`) each render their menu inline; this follows that convention rather than refactoring two shipped features |
| Pinning or closing the All changes tab | FDIF-17: it is fixed, has no close button, and is derived from the mode |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| How a tab is pinned | Right-click the tab → Pin / Unpin; a pinned tab shows a pin where the × was, and clicking the pin unpins it | Owner decision (grill Q1): VS Code's gesture | y |
| Where pinned tabs sit | Right after All changes, in the order they were pinned; an unpinned tab moves to the front of the unpinned tabs | Owner decision (grill Q2); VS Code and Visual Studio do the same | y |
| Where the bulk closes live | The tab's context menu, and a ⋯ button at the end of the strip that opens the tab-independent part of the same menu | Owner decision (grill Q3) | y |
| The menu | Pin/Unpin, Close, Close others, Close to the right, Close unpinned, Close all. Close others and Close to the right keep pinned tabs; Close all closes them too; the ⋯ menu offers Close unpinned and Close all | Owner decision (grill Q6): VS Code parity | y |
| Focus after a bulk close | If the active tab survives, it stays active; otherwise the nearest surviving tab to its right, then to its left; with none, All changes in a diff mode and nothing in Explore | Extends `tabsAfterClose`'s adjacent-tab rule to several closed tabs | y |
| Expand all / Collapse all | Two buttons at the right of the All changes header | Owner decision (grill Q4) | y |
| A file listed after Expand all | Folded | From the first toggle on, the reader's set is the whole answer (FDIF-21's rule); Expand all is a toggle of every section listed at that moment | y |
| Mounting after Expand all | Unchanged: only sections near the viewport hold an editor (`mountPlan`) | Expanding forty sections must not create forty Monaco editors | y |
| Dismissing the menu | Any click outside it, or Escape | The sidebar's and F3's menus behave so | y |
| Base branch | `feature/files-view-polish`, rebased onto `origin/main` on 2026-09-26 (F2 #101 and F3 #102 merged); the PR closes #108 | Owner-approved plan of 2026-09-22; F2's base is on `main` now | y |
| Commit tabs | A commit tab (F3, `CommitTab`) is a tab like a file or diff tab: it can be pinned and every bulk close treats it the same | The rules are about the strip, not the tab's content; F3 shipped after the plan was written | y (owner, 2026-09-26) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Pin a tab ⭐ MVP

**User Story**: As the owner reading files, I want to pin the tabs I keep coming back to so that bulk closes leave them alone and they stay at the front.

**Why P1**: Pinning is what gives "close unpinned" its meaning.

**Acceptance Criteria**:

1. WHEN the owner chooses Pin on an unpinned tab THEN the view SHALL mark it pinned and move it right after All changes and any tabs pinned before it
2. Every tab but All changes SHALL show a pin button before its close button, drawn outlined while the tab is unpinned and filled in the accent colour while it is pinned (owner decision, 2026-09-26, after PR #125: the pin is always there, like the close button)
3. WHEN the owner clicks a pinned tab's pin, or chooses Unpin THEN the view SHALL unpin it and move it to the front of the unpinned tabs; WHEN the owner clicks an unpinned tab's pin THEN the view SHALL pin it as in AC 1
4. WHEN a tab is pinned or unpinned THEN the active tab SHALL stay the same
5. The All changes tab SHALL offer neither Pin nor any close entry

**Independent Test**: Open three files, pin the third; it moves to the front with a pin, and unpinning it puts it first among the unpinned.

---

### P1: Close many tabs at once ⭐ MVP

**User Story**: As the owner, I want to close all tabs, or all but the pinned ones, in one action so that the strip stays manageable.

**Why P1**: The request.

**Acceptance Criteria**:

6. WHEN the owner chooses Close all THEN the view SHALL close every tab, pinned ones included, except All changes
7. WHEN the owner chooses Close unpinned THEN the view SHALL close every unpinned tab and keep every pinned one
8. WHEN the owner chooses Close others on a tab THEN the view SHALL close every other unpinned tab and keep that tab and every pinned one
9. WHEN the owner chooses Close to the right on a tab THEN the view SHALL close every unpinned tab to its right in the strip
10. WHEN the owner chooses Close on a pinned tab, or clicks its close button, THEN the view SHALL close it
11. WHEN a bulk close closes the active tab THEN the view SHALL activate the nearest surviving tab to its right, else to its left, else All changes in a diff mode, else nothing
12. WHEN the owner clicks ⋯ at the end of the strip THEN the view SHALL open a menu with Close unpinned and Close all
13. WHEN a menu is open and the owner clicks outside it or presses Escape THEN the view SHALL close the menu; dismissing it SHALL change no tab by itself, and a click that lands on a control SHALL still do what that control does, as the sidebar's and the commit list's menus behave (owner decision, 2026-09-26)

**Independent Test**: With two pinned and three unpinned tabs, Close unpinned leaves the two; Close all leaves only All changes.

---

### P1: Expand or collapse every change ⭐ MVP

**User Story**: As the owner reviewing a large change, I want to open or fold every file in All changes in one click so that I can skim or read it without forty toggles.

**Why P1**: The request.

**Acceptance Criteria**:

14. WHEN the owner clicks Expand all THEN every section listed in All changes SHALL be expanded
15. WHEN the owner clicks Collapse all THEN every section listed in All changes SHALL be folded
16. WHILE every section is expanded, only the sections near the viewport SHALL hold an editor (`mountPlan`, unchanged)
17. WHILE All changes lists nothing, Expand all and Collapse all SHALL NOT be shown
18. WHEN the owner clicks Expand all or Collapse all in a commit tab's stack THEN every section of that commit SHALL be expanded or folded (owner decision, 2026-09-26: the commit tab reuses the All changes stack and keeps its buttons)

**Independent Test**: On the forty-file seed, Expand all shows forty open sections and the editor count stays bounded; Collapse all folds them.

---

## Edge Cases

- WHEN the worktree changes THEN pinning SHALL follow the tabs, which are per worktree (FXPL-18): each worktree keeps its own pinned set
- WHEN a pinned diff tab's file stops being changed THEN the tab SHALL stay pinned and open, as any open tab does today
- WHEN the owner opens a file already open in a pinned tab THEN the view SHALL focus that pinned tab, not open a second one (FXPL-16)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FPOL-01 | P1: pin — AC 1 | Execute | Done |
| FPOL-02 | P1: pin — AC 2 | Execute | Verified (amended, A1-A3) |
| FPOL-03 | P1: pin — AC 3 | Execute | Verified (amended, A1-A3) |
| FPOL-04 | P1: pin — AC 4 | Execute | Done |
| FPOL-05 | P1: pin — AC 5 | Execute | Done |
| FPOL-06 | P1: close many — AC 6 | Execute | Done |
| FPOL-07 | P1: close many — AC 7 | Execute | Done |
| FPOL-08 | P1: close many — AC 8 | Execute | Done |
| FPOL-09 | P1: close many — AC 9 | Execute | Done |
| FPOL-10 | P1: close many — AC 10 | Execute | Verified (amended, A1-A3) |
| FPOL-11 | P1: close many — AC 11 | Execute | Done |
| FPOL-12 | P1: close many — AC 12 | Execute | Done |
| FPOL-13 | P1: close many — AC 13 | Execute | Done |
| FPOL-14 | P1: expand — AC 14 | Execute | Done |
| FPOL-15 | P1: expand — AC 15 | Execute | Done |
| FPOL-16 | P1: expand — AC 16 | Execute | Done |
| FPOL-17 | P1: expand — AC 17 | Execute | Done |
| FPOL-18 | P1: expand — AC 18 | Execute | Done (fix round 1) |

**Coverage:** 18 total, 18 mapped to tasks, 0 unmapped. FPOL-18 and FPOL-13's wording come from the Verifier's first iteration (2026-09-26).

---

## Success Criteria

- [ ] Clearing a strip of ten tabs but two takes two clicks (pin already set: right-click → Close unpinned)
- [ ] A forty-file review opens in one click
