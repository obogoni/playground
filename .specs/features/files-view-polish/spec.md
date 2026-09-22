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
| A shared context-menu component | The sidebar and F3's commit rows each render their menu inline; this follows that convention rather than refactoring two features on other branches |
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
| Base branch | `feature/files-view-polish` off `feature/files-diff` `bf2fc7e` (F2); it does not touch F3–F5 | Owner-approved plan of 2026-09-22 | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Pin a tab ⭐ MVP

**User Story**: As the owner reading files, I want to pin the tabs I keep coming back to so that bulk closes leave them alone and they stay at the front.

**Why P1**: Pinning is what gives "close unpinned" its meaning.

**Acceptance Criteria**:

1. WHEN the owner chooses Pin on an unpinned tab THEN the view SHALL mark it pinned and move it right after All changes and any tabs pinned before it
2. WHILE a tab is pinned it SHALL show a pin in place of its close button
3. WHEN the owner clicks a pinned tab's pin, or chooses Unpin THEN the view SHALL unpin it and move it to the front of the unpinned tabs
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
10. WHEN the owner chooses Close on a pinned tab THEN the view SHALL close it
11. WHEN a bulk close closes the active tab THEN the view SHALL activate the nearest surviving tab to its right, else to its left, else All changes in a diff mode, else nothing
12. WHEN the owner clicks ⋯ at the end of the strip THEN the view SHALL open a menu with Close unpinned and Close all
13. WHEN a menu is open and the owner clicks outside it or presses Escape THEN the view SHALL close the menu and change no tab

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
| FPOL-01 | P1: pin — AC 1 | Tasks | In Tasks |
| FPOL-02 | P1: pin — AC 2 | Tasks | In Tasks |
| FPOL-03 | P1: pin — AC 3 | Tasks | In Tasks |
| FPOL-04 | P1: pin — AC 4 | Tasks | In Tasks |
| FPOL-05 | P1: pin — AC 5 | Tasks | In Tasks |
| FPOL-06 | P1: close many — AC 6 | Tasks | In Tasks |
| FPOL-07 | P1: close many — AC 7 | Tasks | In Tasks |
| FPOL-08 | P1: close many — AC 8 | Tasks | In Tasks |
| FPOL-09 | P1: close many — AC 9 | Tasks | In Tasks |
| FPOL-10 | P1: close many — AC 10 | Tasks | In Tasks |
| FPOL-11 | P1: close many — AC 11 | Tasks | In Tasks |
| FPOL-12 | P1: close many — AC 12 | Tasks | In Tasks |
| FPOL-13 | P1: close many — AC 13 | Tasks | In Tasks |
| FPOL-14 | P1: expand — AC 14 | Tasks | In Tasks |
| FPOL-15 | P1: expand — AC 15 | Tasks | In Tasks |
| FPOL-16 | P1: expand — AC 16 | Tasks | In Tasks |
| FPOL-17 | P1: expand — AC 17 | Tasks | In Tasks |

**Coverage:** 17 total, 17 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] Clearing a strip of ten tabs but two takes two clicks (pin already set: right-click → Close unpinned)
- [ ] A forty-file review opens in one click
