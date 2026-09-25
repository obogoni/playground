# Files Direction — Diffs (F2) Specification

## Epic Context

**F2 of 5** of the Files epic. The epic's slices, and the decisions each inherits, are recorded in
`.specs/features/files-explore/spec.md` § Epic Context. F2 inherits two of them:

- **Base** = `merge-base(HEAD, <base>)`, default `origin/HEAD`, switchable by the picker F1 already ships (grill Q4)
- **Layout** = side by side by default, with a toggle to inline; the total diff stacks every file, each collapsible (grill Q19)

F2 is built on F1's Monaco setup (F1 T13) and on F1's two diff modes, whose click it takes over.

---

## Problem Statement

F1 lists what a branch changed and what is uncommitted, but a click on either list opens the file's
current content under a label saying the diff arrives later (FXPL-14). To see *what* changed you
still leave for VS Code or a terminal. F2 turns both lists into diffs — one file at a time, or every
file at once — so reviewing an agent's work, or your own branch before a PR, happens where the list
already is.

## Goals

- [ ] Any file in either diff mode opens as a diff against the right reference, with no configuration
- [ ] The whole change set reads top to bottom in one tab, even on a branch with hundreds of files
- [ ] A long file with a few changes reads fast: unchanged stretches fold away and next/previous change jumps
- [ ] A change that is only whitespace or line endings is visible by default, and can be hidden
- [ ] An uncommitted diff follows an agent's edits live, the way F1's file tabs do

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| The diff of a single commit | F3 — it reuses this viewer with `commit^` → `commit` |
| A PR's diff and its comments | F4 (Azure DevOps), F5 (GitHub) |
| Separate staged and unstaged diffs | Owner decision (grill F2-Q1): one diff, `HEAD` → disk, matching F1's single uncommitted list |
| Staging, unstaging, discarding or reverting a hunk | The Files direction is read-only (epic grill Q2) |
| Image diff (side-by-side pixels, swipe, onion skin) | Binary files stay placeholders (epic grill Q18) |
| Three-way or conflict view | No merge operation exists in the app to produce one |
| A per-file override of layout or whitespace | Owner decision (grill F2-Q5): one global preference |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Diff-to-origin sides | Original = the file at `merge-base(HEAD, <base>)`; modified = the file at `HEAD` | F1 lists committed changes only in this mode (F1 assumption); the diff must describe the same set | y |
| Uncommitted sides | Original = the file at `HEAD`; modified = the file on disk — staged and unstaged together | Owner decision (grill F2-Q1): matches F1's one combined list and the question "what changed since the last commit" | y |
| Added / untracked file | Empty original side | There is no earlier version | y |
| Deleted file | Empty modified side | There is no current version | y |
| Renamed file | Original read from `oldPath` | F1's `ChangedPath` already carries it | y |
| Binary or above 1 MB on either side | F1's placeholder, no editor | Epic grill Q18, applied per side | y |
| Where the total diff lives | A first, fixed, non-closable **All changes** tab, shown only in the two diff modes | Owner decision (grill F2-Q2): per-file tabs and the total coexist, like "Files changed" beside open files | y |
| Total diff scale | The first 10 files expanded, the rest collapsed; an editor is mounted only for a section that is expanded **and** scrolled into view | Owner decision (grill F2-Q3): 200 mounted Monaco editors is the failure being avoided | y |
| Section order | The tree's order: folders first, then alphabetical, case-insensitive | The same order the user just read in the left column | y |
| Unchanged regions | Folded to a clickable "N unchanged lines" strip, with a few lines of context around each change | Owner decision (grill F2-Q4). Monaco's diff editor supports folding unchanged regions natively — **to confirm in F1's Monaco spike (F1 T13)** | y |
| Layout preference | One global side-by-side / inline setting, persisted in `AppConfig.ui` | Owner decision (grill F2-Q5); F3 inherits it | y |
| Whitespace | Shown by default; the toggle hides leading/trailing whitespace changes and line-ending changes, not whitespace inside a line; global and persisted, like layout | Owner decision (grill F2-Q6, design D3). **Reworded at Design:** Monaco's diff can ignore only leading and trailing whitespace (`ignoreTrimWhitespace`), which covers re-indentation, the common case; ignoring *all* whitespace would mean abandoning Monaco's diff | y |
| Line endings | Detected in main from the raw bytes of both sides, and shown as a strip plus per-line markers | Design D2. **Monaco normalizes line endings inside its text model**, so its diff cannot show a CRLF ↔ LF change at all — without this, an agent flipping a whole file's endings would produce a diff reading "no changes". To confirm with a CRLF fixture in the F2 spike | y |
| Next / previous change shortcut | The keys VS Code binds to next / previous change in its diff editor, **exact binding confirmed at Design** | Owner decision (grill F2-Q8). The question named F7 / Shift+F7; that binding may belong to VS Code's accessible diff viewer instead, so the spec fixes the intent and Design verifies the key | y |
| Opening the whole file from a diff | An "Open file" action on the diff tab opens F1's file tab for the same path | Owner decision (grill F2-Q7) | y |
| Tab identity | A diff tab is keyed by (mode, path) and is distinct from a file tab for the same path | The same path is a different diff in each mode, and both a diff and a file tab may be wanted at once | y |
| Diff tabs across a mode switch | A diff tab keeps the mode it was opened in; the All changes tab always reflects the current mode | Tabs are per worktree, not per mode (F1 FXPL-18); a diff tab must not silently change what it compares | y |
| Freshness | Uncommitted diffs update live through F1's watcher; diff-to-origin diffs refresh on an index / `HEAD` change or a base change | The first changes with every agent write; the second only changes when history does | y |
| F1's interim label | FXPL-14 is superseded: once F2 ships, no diff-mode click opens a plain file view | FXPL-14 was scoped "while F2 has not shipped" | y |
| Branch base | `feature/files-diff` stacked on `feature/files-explore` | Every piece of F2 extends F1's view, viewer and lists | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Diff one file ⭐ MVP

**User Story**: As the developer, I want a file clicked in either diff mode to open as a diff against
the right reference, so that I see what changed instead of the whole file.

**Why P1**: It is what the two diff modes were for; F1 only stood them in.

**Acceptance Criteria**:

1. WHILE in diff-to-origin mode, WHEN the user opens a file THEN the view SHALL open a diff tab comparing the file at the merge base with the file at `HEAD` <!-- complex -->
2. WHILE in uncommitted-changes mode, WHEN the user opens a file THEN the view SHALL open a diff tab comparing the file at `HEAD` with the file on disk, staged and unstaged changes together <!-- complex -->
3. IF the file is added or untracked THEN the diff's original side SHALL be empty <!-- unwanted-behavior -->
4. IF the file is deleted THEN the diff's modified side SHALL be empty <!-- unwanted-behavior -->
5. WHERE the file was renamed the original side SHALL be read from its previous path <!-- optional-feature -->
6. IF either side is binary or larger than 1 MB THEN the tab SHALL show F1's placeholder for that file and SHALL NOT mount a diff editor <!-- unwanted-behavior -->
7. The diff SHALL be read-only on both sides <!-- ubiquitous -->
8. The system SHALL key a diff tab by its mode and path, and SHALL keep it distinct from a file tab for the same path <!-- ubiquitous -->
9. WHEN the user switches mode THEN an open diff tab SHALL keep comparing what it compared when it was opened <!-- event-driven -->
10. The view SHALL NOT open a plain file view from either diff mode, superseding FXPL-14 <!-- ubiquitous -->

**Independent Test**: On a branch that renamed one file, added one and deleted one since `main`, each opens as a diff with the right empty side, the renamed one showing its old content on the left.

---

### P1: Read a diff comfortably ⭐ MVP

**User Story**: As the developer, I want diffs side by side or inline as I prefer, with unchanged
stretches folded and whitespace under my control, so that a large file with small changes reads fast.

**Why P1**: A diff of a 2000-line file with three changes is unreadable without these.

**Acceptance Criteria**:

11. The diff SHALL render side by side by default <!-- ubiquitous -->
12. WHEN the user toggles the layout THEN every open diff SHALL switch between side by side and inline, and the choice SHALL persist across restarts <!-- event-driven -->
13. The diff SHALL fold each run of unchanged lines into a strip naming how many lines it hides, keeping a few lines of context around every change <!-- ubiquitous -->
14. WHEN the user activates a folded strip THEN the view SHALL reveal those lines <!-- event-driven -->
15. The diff SHALL show whitespace changes by default; a line-ending change SHALL appear as a strip naming the change and its line count (e.g. `CRLF → LF on 12 lines`) plus a marker on each affected line <!-- ubiquitous -->
16. WHEN the user toggles whitespace THEN every open diff SHALL hide changes confined to leading or trailing whitespace together with the line-ending strip and markers, and the choice SHALL persist across restarts <!-- event-driven -->

**Independent Test**: A file whose only change is CRLF → LF on one line shows that line as changed; toggling whitespace hides it; restarting the app keeps both the whitespace and the layout choice.

---

### P1: See every change at once ⭐ MVP

**User Story**: As the developer, I want one tab stacking the diff of every file in the current mode,
so that I can read a whole branch or a whole uncommitted change top to bottom.

**Why P1**: The owner's original ask named it: "total or of the selected file".

**Acceptance Criteria**:

17. WHILE in either diff mode the tab strip SHALL show a first tab, **All changes**, that cannot be closed <!-- state-driven -->
18. WHILE in full-folder mode the All changes tab SHALL NOT be shown <!-- state-driven -->
19. The All changes tab SHALL stack one collapsible section per file of the current mode's list, in the tree's order, each headed by its path, its change status and its added and removed line counts <!-- ubiquitous -->
20. The All changes tab SHALL head the stack with the number of files and the total added and removed lines <!-- ubiquitous -->
21. WHEN the list holds more than 10 files THEN only the first 10 sections SHALL start expanded <!-- event-driven -->
22. The system SHALL NOT mount a diff editor for a section that is collapsed or has not yet been scrolled into view <!-- ubiquitous -->
23. IF a section's file is binary or larger than 1 MB THEN that section SHALL show a placeholder instead of an editor <!-- unwanted-behavior -->
24. IF the current mode's list is empty THEN the All changes tab SHALL say there are no changes <!-- unwanted-behavior -->

**Independent Test**: On a branch with 40 changed files, All changes opens with 10 expanded and 30 collapsed, the header totals match `git diff --shortstat`, and scrolling mounts editors only as sections come into view.

---

### P2: Move through changes and reach the file

**User Story**: As the developer, I want to jump from change to change and open the whole file from a
diff, so that I do not scroll hunting for the next hunk or switch modes to read the file.

**Why P2**: The diff is usable without it; this is speed.

**Acceptance Criteria**:

25. WHEN the user activates next or previous change, by button or by the shortcut VS Code uses in its diff editor, THEN the view SHALL move to the next or previous change in that file <!-- event-driven -->
26. WHILE in the All changes tab, WHEN next change passes a file's last change THEN the view SHALL move to the first change of the next file, expanding its section <!-- complex -->
27. The diff tab SHALL offer **Open file**, which opens F1's file tab for the same path <!-- ubiquitous -->
28. IF the file is deleted THEN the diff tab SHALL NOT offer Open file <!-- unwanted-behavior -->
29. The F1 launcher row SHALL act on the diff's file exactly as it acts on a file tab <!-- ubiquitous -->

**Independent Test**: In All changes on three files, next change walks every hunk of the first file, then into the second, expanding it.

---

### P2: Stay current

**User Story**: As the developer, I want diffs to follow the disk and the history, so that a diff of
an agent's uncommitted work never shows a stale picture.

**Why P2**: The diff is correct at open time without it; this keeps it correct.

**Acceptance Criteria**:

30. WHILE in uncommitted mode, WHEN a diffed file changes on disk THEN its diff SHALL update within 1 s and keep its scroll position <!-- complex -->
31. WHEN the worktree's index or `HEAD` changes THEN every open diff and the All changes tab SHALL refresh against the new state <!-- event-driven -->
32. WHEN the user changes the base THEN the diff-to-origin diffs and the All changes tab SHALL re-render against the new merge base <!-- event-driven -->

**Independent Test**: With an uncommitted diff open, a shell appends a line to the file and the diff grows within a second without jumping; committing the file drops it from All changes.

---

## Edge Cases

- WHEN a file is both committed on the branch and edited on disk THEN its diff-to-origin diff SHALL show only the committed change and its uncommitted diff only the edit
- IF the chosen base no longer exists THEN the diff-to-origin diffs SHALL show F1's base prompt (FXPL-11) instead of a stale diff
- WHEN a file is modified with no textual change (a mode bit only) THEN the diff SHALL say the content is identical
- IF both sides are identical after whitespace is hidden THEN the diff SHALL say so rather than render an empty editor
- WHEN a section of All changes scrolls far out of view THEN its editor MAY be unmounted and remounted on return, keeping its expanded state

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FDIF-01 | P1: Diff one file | Design | Pending |
| FDIF-02 | P1: Diff one file | Design | Pending |
| FDIF-03 | P1: Diff one file | Design | Pending |
| FDIF-04 | P1: Diff one file | Design | Pending |
| FDIF-05 | P1: Diff one file | Design | Pending |
| FDIF-06 | P1: Diff one file | Design | Pending |
| FDIF-07 | P1: Diff one file | Design | Pending |
| FDIF-08 | P1: Diff one file | Design | Pending |
| FDIF-09 | P1: Diff one file | Design | Pending |
| FDIF-10 | P1: Diff one file | Design | Pending |
| FDIF-11 | P1: Read a diff comfortably | Design | Pending |
| FDIF-12 | P1: Read a diff comfortably | Design | Pending |
| FDIF-13 | P1: Read a diff comfortably | Design | Pending |
| FDIF-14 | P1: Read a diff comfortably | Design | Pending |
| FDIF-15 | P1: Read a diff comfortably | Design | Pending |
| FDIF-16 | P1: Read a diff comfortably | Design | Pending |
| FDIF-17 | P1: See every change at once | Design | Pending |
| FDIF-18 | P1: See every change at once | Design | Pending |
| FDIF-19 | P1: See every change at once | Design | Pending |
| FDIF-20 | P1: See every change at once | Design | Pending |
| FDIF-21 | P1: See every change at once | Design | Pending |
| FDIF-22 | P1: See every change at once | Design | Pending |
| FDIF-23 | P1: See every change at once | Design | Pending |
| FDIF-24 | P1: See every change at once | Design | Pending |
| FDIF-25 | P2: Move through changes and reach the file | Design | Pending |
| FDIF-26 | P2: Move through changes and reach the file | Design | Pending |
| FDIF-27 | P2: Move through changes and reach the file | Design | Pending |
| FDIF-28 | P2: Move through changes and reach the file | Design | Pending |
| FDIF-29 | P2: Move through changes and reach the file | Design | Pending |
| FDIF-30 | P2: Stay current | Design | Pending |
| FDIF-31 | P2: Stay current | Design | Pending |
| FDIF-32 | P2: Stay current | Design | Pending |

**Coverage:** 32 total, 0 mapped to tasks yet (Design not run), 0 unmapped

---

## Success Criteria

- [ ] Every file in both diff modes opens as a diff with the correct reference on each side, including renames, additions and deletions
- [ ] A 40-file branch opens All changes without mounting 40 editors, and its header totals match `git diff --shortstat`
- [ ] A CRLF ↔ LF flip is visible by default and hideable with one toggle
- [ ] An agent's uncommitted edit shows up in its open diff within a second
- [ ] Layout and whitespace choices survive a restart
- [ ] The gate is green: `npm run typecheck && npm run lint && npm test`
