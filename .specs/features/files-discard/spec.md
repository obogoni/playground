# Files Discard Specification

## Problem Statement

The Files view shows a worktree's uncommitted changes but cannot throw one away. Undoing an
agent's stray edit, or starting a file over, means leaving the app for a terminal and running
`git restore`, or deleting files by hand. The Files direction was read-only on purpose (epic grill
Q2, `files-explore` Out of Scope, `files-diff` Out of Scope); this feature lifts that for
uncommitted changes only.

A related defect: for an uncommitted rename, the change list keeps only the new path
(`worktree-manager.ts:462-465`). The diff then reads its left side from `HEAD:<new path>`, which
does not exist, and shows git's error instead of the old file. Discarding a rename needs the old
path too.

## Goals

- [ ] One uncommitted file, a folder of them, or all of them go back to the last commit from inside the Files view, in two clicks
- [ ] No discard ever happens without a confirmation that lists exactly the files it touches
- [ ] Nothing the user could want back is deleted permanently: new files go to the Recycle Bin, and a file the Recycle Bin refuses is kept
- [ ] An uncommitted rename's diff compares against the old file

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Discarding a single hunk or line | Owner decision (issue #132); the `files-diff` row "discarding or reverting a hunk" stays out of scope |
| Staging, unstaging, committing or stashing | Owner decision (issue #132) |
| Discard in diff-to-origin mode or in commit tabs | Owner decision (issue #132): it would undo committed work |
| Permanent deletion of untracked files | Owner decision (issue #132): the Recycle Bin or nothing |
| Emptying or restoring from the Recycle Bin inside the app | Windows' own Recycle Bin does it |
| A discard gesture on file tabs or in the Folder (full) mode | Not among the owner's places (issue #132) |

This feature **supersedes, for uncommitted changes only,** the read-only rule behind the
`files-explore` row "Editing, saving, or any write to a file" and the reason given in the
`files-diff` hunk row. Recorded at Execute as AD-047 (`.specs/STATE.md`).

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Where discard is offered | Uncommitted mode only: right-click a file or folder row, a ↶ on row hover, `Discard all` in the list header, a ↶ in each All changes section header | Owner decision (issue #132) | y |
| Tracked file | Back to the last commit in both the index and the working copy, staged edits included | Owner decision (issue #132) | y |
| Untracked file | Moved to the Windows Recycle Bin (Electron `shell.trashItem`) | Owner decision (issue #132) | y |
| Recycle Bin refusal | The file stays as it is, the rest are discarded, and a message names what was kept; never a permanent delete | Owner decision (issue #132) | y |
| Always confirm | A dialog in the remove-worktree style lists the files, says which go to the Recycle Bin and which cannot be undone, and warns when a session runs in the worktree | Owner decision (issue #132) | y |
| Afterwards | The discarded file's uncommitted diff tab closes; its file tab reloads, or closes when the file went to the Recycle Bin | Owner decision (issue #132) | y |
| Rename's old path | Kept by the uncommitted parser, so the diff compares against the old file and discard can restore it | Owner decision (issue #132) | y |
| An added file (new, staged, not in the last commit) | Its working copy goes to the Recycle Bin and its index entry is removed | "Back to the last commit" would delete new content permanently; the Recycle Bin keeps it recoverable, as for untracked files | owner confirmed 2026-09-26 |
| A rename's new file | Goes to the Recycle Bin (then leaves the index) while the old path is restored | The issue says "the new one removed"; a rename often carries edits, and the Recycle Bin is the only way back for them | owner confirmed 2026-09-26 |
| A link or junction listed as untracked | Kept, not moved, reason `Links and junctions are never moved.` | A worktree can hold an untracked skills junction (AD-013, `file-reader.ts:43-45`); moving a junction whose target is a shared folder must never risk that folder | owner confirmed 2026-09-26 |
| A file sitting where a path is about to be restored | Goes to the Recycle Bin before the restore (a deleted file recreated as untracked, or something at a rename's old path) | Restoring would overwrite it with no way back | owner confirmed 2026-09-26 |
| How the kept message is shown | The confirmation stays open and turns into a `Some changes were kept` list, one line per kept file with its reason, and a `Close` button | The app's toast lasts 2.2 s (`Toast.tsx:13`), too short to read a list of paths | owner confirmed 2026-09-26 |
| A successful discard | Closes the confirmation with no message; the list, tabs and status bar show the result | Only a kept file is news | y |
| Session warning source | Sessions whose `cwd` equals the worktree path and whose status is `running`, the same rule the remove-worktree confirmation uses (`WorktreeDetail.tsx:111`, `App.tsx:431`) | One definition of "a session runs in this worktree" | y |
| Hover ↶ on folder rows | Shown too, at the row's end where a file row has its glyph; it discards everything under the folder, like the folder's menu | The issue says "each row" | y |
| Status bar count | After a discard the renderer re-reads the worktree tree the way the status bar does after a sync (`App.tsx:523`, `onRefreshTree`) | "Refresh through the existing mechanisms"; on this branch chain the counter has no watcher of its own | y |
| Order of work | Stacked on #131 (status glyph at the row's end, in `.file-tree-end` / `.diff-section-end`); the ↶ goes inside that end group, before the glyph | Owner decision (issue #132); #131 plan `b0fae25` hands the end group over | y |

**Open questions:** none. Every gap is logged above; the rows marked `owner confirmed 2026-09-26` carry the recommended default.

---

## User Stories

### P1: Discard one file from the tree ⭐ MVP

**User Story**: As a developer, I want to discard an agent's changes to one file from the Files view, so that I can undo a stray edit without leaving the app.

**Why P1**: The request.

**Acceptance Criteria**:

1. WHILE the Files view is in uncommitted mode, WHEN the user right-clicks a file row THEN the view SHALL open a menu at the pointer holding one item, `Discard changes`
2. WHEN the user picks `Discard changes` on a file row THEN the view SHALL open the discard confirmation listing that file alone
3. WHEN the row menu is open and the user clicks elsewhere or presses Escape THEN the menu SHALL close and nothing SHALL be discarded
4. WHEN a discard of a modified file is confirmed THEN its index entry and its working copy SHALL both match the last commit, staged edits included
5. WHEN a discard of a deleted file is confirmed THEN the file SHALL be back on disk and in the index as the last commit holds it
6. WHEN a discard of an untracked file is confirmed THEN the file SHALL be moved to the Recycle Bin
7. WHEN a discard of an added file is confirmed THEN its working copy SHALL be moved to the Recycle Bin and its index entry SHALL be removed
8. The discard SHALL act on each file of a request on its own, so one file that fails SHALL NOT stop the others
9. The discard SHALL match every path literally, so a path holding `*`, `?` or `[` SHALL discard that file and no other

**Independent Test**: Right-click a modified file, confirm; `git status --porcelain` no longer lists it.

---

### P1: Confirm every discard ⭐ MVP

**User Story**: As a developer, I want to confirm every discard with the list of files, and be warned when a session runs in the worktree, so that I never lose work by a misclick or pull files from under a working agent.

**Why P1**: A discard of tracked changes cannot be undone.

**Acceptance Criteria**:

10. The confirmation SHALL be titled `Discard changes?` and list every file the request will send, in the order the tree shows them, each with its status glyph and its path, and no other file
11. The confirmation SHALL list the files that go to the Recycle Bin under `These go to the Recycle Bin.` and every other file under `These go back to the last commit. This can’t be undone.`, and SHALL show a heading only when its group holds a file
12. WHILE one or more sessions whose folder is this worktree are running, the confirmation SHALL show `1 session is running in this worktree and may be using these files.` or `N sessions are running in this worktree and may be using these files.`, followed by each session's title
13. WHILE no session whose folder is this worktree is running, the confirmation SHALL show no session warning
14. The confirm button SHALL read `Discard 1 file` or `Discard N files`, N being the number of files listed
15. WHEN the user cancels with `Cancel`, Escape or a click outside the panel THEN nothing SHALL change on disk or in the index
16. WHILE a confirmed discard runs, the confirm button SHALL be disabled and read `Discarding…`

**Independent Test**: Open the confirmation from Discard all with an untracked and a modified file; each sits under its heading; Cancel leaves `git status` unchanged.

---

### P1: Nothing is deleted permanently ⭐ MVP

**User Story**: As a developer, I want new files to go to the Recycle Bin and to be told which files could not, so that nothing is deleted behind my back.

**Why P1**: The owner's safety condition for any write in the Files view.

**Acceptance Criteria**:

17. The main process SHALL take a file out of the worktree only by moving it to the Recycle Bin or by git restoring the last commit's version, and SHALL NOT delete a file itself
18. IF the Recycle Bin refuses a file THEN that file SHALL stay as it was, on disk and in the index, and every other file of the request SHALL still be discarded
19. WHEN every file of a request was discarded THEN the confirmation SHALL close with no message
20. IF any file of a request was kept THEN the confirmation SHALL stay open, titled `Some changes were kept`, list each kept file with its reason, and offer one `Close` button
21. The kept reasons SHALL read `The Recycle Bin refused it.`, `Links and junctions are never moved.`, `It is outside the worktree.`, or git's first error line
22. IF an untracked entry is a symbolic link or a junction THEN it SHALL be kept and nothing SHALL be moved
23. IF a path of the request resolves outside the worktree THEN it SHALL be kept and nothing SHALL be done to it

**Independent Test**: With the Recycle Bin dependency refusing one of two untracked files (unit test), the refused one is on disk and the other is gone.

---

### P1: Renamed files keep their old path ⭐ MVP

**User Story**: As a developer, I want an uncommitted rename to compare against its old version, and a discarded rename to bring the old file back, so that I can review and undo a rename like any other change.

**Why P1**: The rename diff shows an error today, and discard cannot restore a rename without the old path.

**Acceptance Criteria**:

24. WHEN git reports an uncommitted rename THEN the uncommitted list SHALL carry its old path with its new path
25. WHEN the user opens the diff of an uncommitted rename THEN its left side SHALL show the old path's content at the last commit and its right side the new file on disk
26. WHEN a discard of a rename is confirmed THEN the old path SHALL be back as the last commit holds it, and the new path's file SHALL be moved to the Recycle Bin and removed from the index
27. IF the Recycle Bin refuses a rename's new file THEN the rename SHALL be kept whole, with the old path not restored and the new file and the index untouched

**Independent Test**: `git mv a.ts b.ts`, edit `b.ts`; its diff shows `a.ts`'s content on the left; discarding it leaves `git status` clean with `a.ts` back.

---

### P1: Tabs and lists after a discard ⭐ MVP

**User Story**: As a developer, I want the diff tab of a discarded file to close and its file tab to reload, so that no tab shows a stale state.

**Why P1**: A tab left showing a change that no longer exists is a lie on screen.

**Acceptance Criteria**:

28. WHEN a file is discarded THEN its uncommitted diff tab, if open, SHALL close
29. WHEN a file is restored to the last commit THEN its file tab, if open, SHALL show the restored content
30. WHEN a file is moved to the Recycle Bin THEN its file tab, if open, SHALL close
31. WHEN a discard finishes THEN the uncommitted list and the status bar's change count SHALL show the worktree's new state without a click
32. IF a file was kept THEN its tabs SHALL stay as they were
33. WHEN a file is discarded THEN a diff-to-origin diff tab of the same path SHALL stay open

**Independent Test**: With a file's diff and file tabs open, discard it: the diff tab closes and the file tab shows the committed text.

---

### P2: Discard many at once

**User Story**: As a developer, I want to discard a folder, everything, or one file from where I am looking, so that reverting an area the agent touched is one step.

**Why P2**: The one-file path already covers the need; these are faster routes to it.

**Acceptance Criteria**:

34. WHILE in uncommitted mode, WHEN the user right-clicks a folder row THEN the menu SHALL offer `Discard changes`, which SHALL open the confirmation listing every changed file under that folder, at any depth
35. WHILE in uncommitted mode with at least one change, the list SHALL show a header holding a `Discard all` button, which SHALL open the confirmation listing every file of the uncommitted list
36. WHILE in uncommitted mode, WHEN the pointer rests on a file or folder row or the row holds keyboard focus THEN a ↶ button titled `Discard changes` SHALL show at the row's end, before its status glyph, and SHALL be hidden otherwise
37. WHEN the user clicks a row's ↶ THEN the confirmation SHALL open for that row's files, and the row SHALL NOT open a tab
38. WHILE the All changes tab shows the uncommitted mode, each section header SHALL show a ↶ button titled `Discard changes` before its status glyph
39. WHEN the user clicks a section header's ↶ THEN the confirmation SHALL open for that file, and the section SHALL NOT fold or unfold

**Independent Test**: Right-click a folder holding two changed files at two depths; the confirmation lists both.

---

### P1: Committed work stays read-only ⭐ MVP

**User Story**: As a developer, I want diff-to-origin and commits to stay read-only, so that I cannot undo committed work by accident.

**Why P1**: The boundary of the owner's decision.

**Acceptance Criteria**:

40. WHILE the Files view is in diff-to-origin mode, the view SHALL offer no discard: no row menu, no ↶ on rows, no `Discard all`, and no ↶ in the All changes section headers
41. The All changes sections of a commit tab SHALL show no ↶
42. The `files:discard` request SHALL carry the worktree and the listed changes only, and the main process SHALL restore to `HEAD`, never to a revision the renderer names

**Independent Test**: Switch to diff-to-origin; right-click and hover rows; no discard control appears.

---

## Edge Cases

Each carries an ID and its own test or smoke check (L-025).

- **FDSC-43** WHEN git lists an untracked folder as one row (`dir/`) THEN the confirmation SHALL list that one row under the Recycle Bin heading, the whole folder SHALL go to the Recycle Bin, and file tabs of files inside it SHALL close
- **FDSC-44** IF an untracked file is already gone from disk when the discard runs THEN it SHALL count as discarded, not kept
- **FDSC-45** WHEN files change after the confirmation opened THEN the discard SHALL act on the files it listed, and the list SHALL refresh afterwards
- **FDSC-46** WHEN the repository has no commit yet THEN discarding an added file SHALL still move it to the Recycle Bin and remove its index entry
- **FDSC-47** WHEN a path about to be restored (a deleted file, or a rename's old path) holds a file on disk THEN that file SHALL go to the Recycle Bin first, and IF the Recycle Bin refuses it THEN the entry SHALL be kept
- **FDSC-48** IF git fails for an entry after its file went to the Recycle Bin THEN the entry SHALL be reported kept with git's first error line, and the file SHALL stay in the Recycle Bin
- **FDSC-49** WHEN a request holds more files than one command line can carry (300 files with 120-character paths) THEN every file SHALL be discarded
- **FDSC-50** WHEN a conflicted file (`UU`, a merge in progress) is discarded THEN it SHALL be restored to the last commit like a modified file
- **FDSC-51** WHEN a discard of tracked files runs while another git process holds `index.lock` THEN those files SHALL be kept with git's first error line, and the confirmation SHALL show them under `Some changes were kept`

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FDSC-01 | P1: one file — AC 1 | Execute | Implemented: T15 (row menu), T20 (smoke 1) |
| FDSC-02 | P1: one file — AC 2 | Execute | Implemented: T15 (row menu), T20 (smoke 1) |
| FDSC-03 | P1: one file — AC 3 | Execute | Implemented: T15 (menu dismissal), T20 (smoke 2) |
| FDSC-04 | P1: one file — AC 4 | Execute | Implemented: T5 (unit), T21 (smoke 1, 2) |
| FDSC-05 | P1: one file — AC 5 | Execute | Implemented: T5 (unit), T21 (smoke 3) |
| FDSC-06 | P1: one file — AC 6 | Execute | Implemented: T6 (unit), T8 (wired), T21 (smoke 4) |
| FDSC-07 | P1: one file — AC 7 | Execute | Implemented: T6 (unit), T21 (smoke 5) |
| FDSC-08 | P1: one file — AC 8 | Execute | Implemented: T5 (unit) |
| FDSC-09 | P1: one file — AC 9 | Execute | Implemented: T5 (unit) |
| FDSC-10 | P1: confirm — AC 10 | Execute | Implemented: T9 (unit), T13 (dialog), T20 (smoke 1, 6) |
| FDSC-11 | P1: confirm — AC 11 | Execute | Implemented: T9 (unit), T13 (dialog), T20 (smoke 1, 5, 6) |
| FDSC-12 | P1: confirm — AC 12 | Execute | Implemented: T9 (unit), T13 (dialog), T14 (sessions from App), T20 (smoke 7) |
| FDSC-13 | P1: confirm — AC 13 | Execute | Implemented: T9 (unit), T13 (dialog), T14 (sessions from App), T20 (smoke 6) |
| FDSC-14 | P1: confirm — AC 14 | Execute | Implemented: T9 (unit), T13 (dialog), T20 (smoke 1, 6) |
| FDSC-15 | P1: confirm — AC 15 | Execute | Implemented: T13 (dialog), T14 (view), T20 (smoke 3) |
| FDSC-16 | P1: confirm — AC 16 | Execute | Implemented: T13 (dialog), T14 (view), T21 (smoke 1) |
| FDSC-17 | P1: nothing permanent — AC 17 | Execute | Implemented: T3 (AD-047), T5 (no delete call), T6, T7 (refusal tests), T8 (trashItem only), T21 (smoke 4, Recycle Bin read) |
| FDSC-18 | P1: nothing permanent — AC 18 | Execute | Implemented: T6 (unit) |
| FDSC-19 | P1: nothing permanent — AC 19 | Execute | Implemented: T14 (view), T21 (smoke 1) |
| FDSC-20 | P1: nothing permanent — AC 20 | Execute | Implemented: T13 (dialog), T14 (view), T21 (smoke 7) |
| FDSC-21 | P1: nothing permanent — AC 21 | Execute | Implemented: T9 (unit), T13 (dialog), T21 (smoke 7) |
| FDSC-22 | P1: nothing permanent — AC 22 | Execute | Implemented: T6 (unit, real junction) |
| FDSC-23 | P1: nothing permanent — AC 23 | Execute | Implemented: T5, T7 (unit) |
| FDSC-24 | P1: rename — AC 24 | Execute | Implemented: T1 (unit), T20 (smoke 10) |
| FDSC-25 | P1: rename — AC 25 | Execute | Implemented: T2 (unit), T20 (smoke 10) |
| FDSC-26 | P1: rename — AC 26 | Execute | Implemented: T7 (unit), T21 (smoke 6) |
| FDSC-27 | P1: rename — AC 27 | Execute | Implemented: T7 (unit) |
| FDSC-28 | P1: after — AC 28 | Execute | Implemented: T10 (unit), T11 (hook), T21 (smoke 1, 4) |
| FDSC-29 | P1: after — AC 29 | Execute | Implemented: T10 (unit), T11 (hook), T21 (smoke 1) |
| FDSC-30 | P1: after — AC 30 | Execute | Implemented: T10 (unit), T11 (hook), T21 (smoke 4) |
| FDSC-31 | P1: after — AC 31 | Execute | Implemented: T11 (hook re-lists), T14 (onDiscarded = refreshTree), T21 (smoke 1) |
| FDSC-32 | P1: after — AC 32 | Execute | Implemented: T10 (unit), T11 (hook), T21 (smoke 7) |
| FDSC-33 | P1: after — AC 33 | Execute | Implemented: T10 (unit), T21 (smoke 1) |
| FDSC-34 | P2: many — AC 34 | Execute | Implemented: T9 (unit), T15 (folder menu), T20 (smoke 4), T21 (smoke 8) |
| FDSC-35 | P2: many — AC 35 | Execute | Implemented: T9 (no helper: the list goes as it is), T17 (Discard all), T20 (smoke 6) |
| FDSC-36 | P2: many — AC 36 | Execute | Implemented: T12 (icon), T16 (hover ↶), T20 (smoke 5) |
| FDSC-37 | P2: many — AC 37 | Execute | Implemented: T16 (the ↶ click stays its own), T20 (smoke 5) |
| FDSC-38 | P2: many — AC 38 | Execute | Implemented: T12 (icon), T18 (section ↶), T19 (uncommitted stack only), T20 (smoke 8) |
| FDSC-39 | P2: many — AC 39 | Execute | Implemented: T18 (the ↶ click stays its own), T20 (smoke 8) |
| FDSC-40 | P1: read-only — AC 40 | Execute | Implemented: T3 (AD-047), T15 (no menu outside uncommitted), T16 (no ↶ outside uncommitted), T17 (no Discard all outside uncommitted), T19 (no section ↶ in diff to origin), T20 (smoke 9) |
| FDSC-41 | P1: read-only — AC 41 | Execute | Implemented: T18 (CommitTab passes no onDiscard), T19 (FileTabs gates by mode), T20 (smoke 9) |
| FDSC-42 | P1: read-only — AC 42 | Execute | Implemented: T3 (AD-047), T4 (request type), T5 (recording runner), T8 (handler) |
| FDSC-43 | Edge: untracked folder row | Execute | Implemented: T6, T9, T10 (unit) |
| FDSC-44 | Edge: already gone | Execute | Implemented: T6 (unit) |
| FDSC-45 | Edge: changed after opening | Execute | Implemented: T11 (entries sent as given), T14 (pending captured at open), T21 (smoke 8) |
| FDSC-46 | Edge: no commit yet | Execute | Implemented: T6 (unit) |
| FDSC-47 | Edge: occupied restore target | Execute | Implemented: T7 (unit) |
| FDSC-48 | Edge: git fails after the Recycle Bin | Execute | Implemented: T6 (unit) |
| FDSC-49 | Edge: long request | Execute | Implemented: T5 (unit) |
| FDSC-50 | Edge: conflicted file | Execute | Implemented: T5 (unit) |
| FDSC-51 | Edge: index.lock held | Execute | Implemented: T5 (unit), T21 (smoke 7) |

**Coverage:** 51 total, 51 mapped to tasks (tasks.md, Requirement Coverage), 0 unmapped.

---

## Success Criteria

- [ ] Undoing an agent's edit to one file takes a right-click, a click and a confirm, without leaving the app
- [ ] Across the unit suite and the smoke, no path of the discard deletes a file outside the Recycle Bin or git's restore
- [ ] An uncommitted rename's diff shows the old file on the left

---

## Follow-ups

Recorded by the Verifier (PASS, round 1, 2026-09-27) under the owner's budget rules: none is a
production defect, and every AC has evidence. Details in `validation.md`, § Follow-ups.

- **F1** A non-`ENOENT` `lstat` failure keeps the entry with cause `recycle-bin`, untested, and its
  reason text claims a Recycle Bin refusal that never happened
- **F2** `afterDiscard` closing the new path's file tab for an `RD` rename has no test
- **F3** The smoke fixture's git calls race the app's own git reads (`index.lock`, 2 of 8 runs)
- **F4** Smoke check 7 (FDSC-12): both ad-hoc sessions share a title; only the count tells them apart
- **F5** Smoke check 11 (FDSC-33): the two diff tabs are told apart by count; the unit test pins which survives
- **F6** Smoke check 11 (FDSC-31): the status bar baseline needs a Refresh click first
- **F7** A pending discard is not bound to the worktree it was listed from (unreachable today: the modal covers the window)
