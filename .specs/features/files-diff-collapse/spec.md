# Files Diff Folder Collapse Specification

## Problem Statement

The diff modes of the Files view (Diff to origin, Uncommitted, Pull request) draw every folder of the
changed-files tree open, with a chevron that is drawn open and does nothing (`ChangedRows` in
`FileTree.tsx`). On a branch that touches many folders the list grows long and the user cannot fold the
folders they are not looking at. The Folder mode already folds; the diff modes do not (issue #172).

## Goals

- [ ] A folder in any of the three diff modes folds and unfolds from its chevron
- [ ] The rest of the folder row keeps picking the folder for the launchers (FXPL-26)
- [ ] A fold survives list refreshes and mode/worktree switches for as long as the app runs

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Collapse all / Expand all | No demand; one more control in a header that already carries the mode picker |
| Persisting folds across restarts | Matches the Folder mode's `expanded`, which is in memory only (FXPL-18) |
| Folding in the Commits mode | Its list is commits, not a tree |
| Any change to the Folder mode | It already folds; its `expanded` list and toggle stay as they are |
| Animating the fold | The Folder mode folds without animation |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Gesture | The chevron folds and nothing else; the rest of the row picks the folder for the launchers, as today (FXPL-26) | Owner decision in the grilling of 2026-10-11. The grilling and the issue first said the row opened the folder's All changes stack; it never did, it only sets `lastFolder` | y |
| Modes covered | Diff to origin, Uncommitted and Pull request | Owner decision; all three draw the same `ChangedRows` | y |
| What is stored | A per-worktree `collapsed: string[]` of folder paths, in the in-memory `WorktreeFiles` | Open is the default, so a folder never seen is open with no bookkeeping, and a new folder can never be born hidden | y |
| One set or one per mode | One set shared by the three diff modes | A path names the same folder in all three; folding it once is what the user meant | y |
| Nested folds | Folding a parent leaves its descendants' entries untouched; unfolding restores them | The set is keyed by path, so this falls out with no extra state | y |
| Stale paths | A path in the set that is not in the current tree is ignored and kept | Harmless, bounded by the folders the user clicked; keeping it restores the fold if the folder comes back | y |
| Discard on a folded folder (Uncommitted) | The folder row keeps its hover undo and context menu | They act on the folder's entries, which do not depend on what is drawn | y |
| Remaining implicit dimensions (auth, external calls, concurrency, idempotency, observability, data lifecycle) | N/A for this scope | Renderer-only UI state over a list already in memory | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Fold a folder in a diff mode ⭐ MVP

**User Story**: As a developer reviewing changes in a diff mode, I want to fold a folder from its chevron, so that the files I am not looking at stop pushing the rest of the list down.

**Why P1**: It is the whole request.

**Acceptance Criteria**:

1. WHEN the user clicks an open folder's chevron in Diff to origin, Uncommitted or Pull request THEN the tree SHALL hide every row under that folder and keep the folder row itself
2. WHEN the user clicks a folded folder's chevron THEN the tree SHALL show the folder's children again
3. WHEN the user clicks a folder's chevron THEN the view SHALL leave the launcher target as it was
4. WHEN the user clicks a folder's name or icon THEN the view SHALL make that folder the launcher target, as it does today (FXPL-26)
5. The chevron SHALL point down on an open folder and right on a folded one, with the same glyph and rotation as the Folder mode
6. The chevron SHALL be a focusable button whose `aria-expanded` is `true` on an open folder and `false` on a folded one
7. WHEN a mode is shown and the user has folded nothing THEN every folder SHALL be drawn open

**Independent Test**: In a worktree with changes in nested folders, open Uncommitted, click a folder's chevron and see its files disappear with the launcher target unchanged; click again and they return.

---

### P1: Folds survive refreshes and switches ⭐ MVP

**User Story**: As a developer whose agent keeps writing files, I want a fold to stay put, so that the tree does not reopen under me.

**Why P1**: Without it the fold undoes itself on the next watch batch, which in practice is seconds.

**Acceptance Criteria**:

1. WHEN the mode's list is re-listed (watch batch, commit, base change) THEN every folder the user folded SHALL stay folded
2. WHEN the user switches to another mode or worktree and back THEN every folder the user folded SHALL stay folded
3. WHEN a folder first appears in the list after the user's folds THEN the tree SHALL draw it open
4. WHEN the user unfolds a parent whose subfolder they had folded before folding the parent THEN the subfolder SHALL still be folded
5. WHEN the user folds a folder in one diff mode THEN the same folder path SHALL be folded in the other two diff modes

**Independent Test**: Fold a folder in Uncommitted, write a file under another folder, and see the fold kept after the list refreshes.

---

## Edge Cases

- IF a folded path no longer exists in the current tree THEN the tree SHALL render as if it were not in the set
- WHILE a folder is folded in Uncommitted the folder row SHALL keep its hover undo and its context menu, acting on every entry under the folder
- WHEN a folded folder contains the only changed files THEN the tree SHALL show just that folder row

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FDCL-01 | P1: Fold a folder | Execute | Verified |
| FDCL-02 | P1: Fold a folder | Execute | Verified |
| FDCL-03 | P1: Fold a folder | Execute | Verified |
| FDCL-04 | P1: Fold a folder | Execute | Verified |
| FDCL-05 | P1: Fold a folder | Execute | Verified |
| FDCL-06 | P1: Fold a folder | Execute | Verified |
| FDCL-07 | P1: Fold a folder | Execute | Verified |
| FDCL-08 | P1: Folds survive | Execute | Verified |
| FDCL-09 | P1: Folds survive | Execute | Verified |
| FDCL-10 | P1: Folds survive | Execute | Verified |
| FDCL-11 | P1: Folds survive | Execute | Verified |
| FDCL-12 | P1: Folds survive | Execute | Verified |
| FDCL-13 | Edge cases | Execute | Verified |
| FDCL-14 | Edge cases | Execute | Verified |
| FDCL-15 | Edge cases | Execute | Verified |

**Coverage:** 15 total, 15 mapped to the inline steps, 0 unmapped.

---

## Success Criteria

- [ ] Folding works in the three diff modes from the chevron, and the name still picks the folder for the launchers
- [ ] The files-diff smoke folds a folder, writes a file, and finds the fold intact
