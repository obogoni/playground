# Files Direction — Explore (F1) Specification

## Epic Context

This is **F1 of 5** of the Files epic, grilled as one design tree and specified slice by slice
(the AD-006 precedent for the Workflows epic). Decisions that belong to later slices are recorded
here so they survive until those slices are specified.

| Slice | Feature folder (planned) | Delivers | Decisions it inherits |
| ----- | ------------------------ | -------- | --------------------- |
| **F1** | `files-explore` (this spec) | The Files direction: mode selector, file tree, read-only tabbed viewer, launchers, `.sln` → VS 2026 | — |
| F2 | `files-diff` | A click in the two diff modes opens a diff instead of the file; a total diff of every file stacked and collapsible | Base = merge-base with `origin/HEAD`, switchable by a picker. Side by side by default, toggle to inline |
| F3 | `files-commits` | The branch's commits since that base; a click opens that commit's diff in the F2 viewer | Scope is "since the base", not the full log |
| F4 | `files-pr-ado` | The current branch's Azure DevOps PR and its threads (P1); reply, resolve/reopen, a new thread on a text selection, a general PR comment (P2) | The PR is found by searching **every** remote for one whose head is this branch (fork → upstream included). A new thread can only be started from a view rendering the **PR's own head version**, fetched from the provider, so the selected line is the line reviewers see. **Breaks the README's "ADO integration is view-only" posture — record an AD when F4 is specified** |
| F5 | `files-pr-github` | The same over GitHub | Introduces a minimal `GitHubGateway` (token from `gh auth token`, no stored secret) designed for issue #50 to extend. A `gh` chip joins the TopBar's `az` chip, shown only when a registered repo has a GitHub remote, checked on window focus |

---

## Problem Statement

The app knows every worktree and opens it in five external tools, but it cannot show you what is
inside one. To look at a file an agent just wrote, you open VS Code or Explorer; to see which files
changed, you read `git status` in a terminal. The status bar (`status-bar`) will count the changed
files and list them, but it has nowhere to send you.

F1 adds a Files direction: browse the selected worktree's files through three lenses, read any of
them in tabs without leaving the app, and hand one off to the right external tool.

## Goals

- [ ] The selected worktree's files are browsable inside the app, respecting `.gitignore`
- [ ] Three lenses over the same tree: everything, what the branch changed since its base, what is uncommitted
- [ ] Any text file reads in a tab with syntax highlighting, and stays current while an agent edits it
- [ ] Every file or folder is one click from Explorer, VS Code, VS 2022 and VS 2026; a solution opens in VS 2026 on a double-click
- [ ] The status bar's changed-file counter lands here

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Any diff rendering | F2, shipped. Until then the two diff modes opened the file's current content (FXPL-14, now superseded by FDIF-10) |
| Commit list | F3 |
| Pull requests and comments | F4 (Azure DevOps), F5 (GitHub) |
| Editing, saving, or any write to a file | Owner decision (grill Q2): read-only. The worktrees are where agents write; the app does not compete with them. Editing is handed off by the launchers |
| Search or filter within the tree | Not requested; the modes are the filter |
| VS Code-style preview (transient) tabs | Every open is a real tab; a preview model can come later |
| Tabs persisting across app restarts | Owner decision (grill Q16): a restored tab for a file an agent has since deleted is the failure being avoided |
| A Windows Terminal launcher under the tabs | The owner listed Explorer, VS 2022, VS 2026 and VS Code; the terminal is one click away in the Tree direction |
| Showing ignored files | Owner decision (grill Q7): the tree is what git would track |
| Rendering images or other binary content | Owner decision (grill Q18): placeholder plus the launchers |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Where it lives | A fifth direction, `files`, in the TopBar segment control and in `AppConfig.ui.direction` | The app's existing navigation pattern (`config.ts:66`) | y |
| Which worktree it describes | The global tree selection (`selectedId`) | Same selection the Tree direction and the status bar use | y |
| "Full folder" listing | `git ls-files --cached --others --exclude-standard`, expanded folder by folder | Tracked plus untracked-not-ignored is exactly "what git would track"; `node_modules`, `bin`, `obj` drop out with no rule of the app's own | y |
| "Uncommitted changes" listing | `worktrees:changes` (`changedFilesOf`), five statuses | Already built and already the status bar's source; staged, unstaged and untracked all count | y |
| "Diff to origin" listing | Files changed on the branch since `merge-base(HEAD, <base>)`, committed changes only | What a PR shows; uncommitted work has its own mode. Base default `origin/HEAD`, switchable (grill Q4) | y |
| No `origin/HEAD` | The base picker opens empty with a prompt to choose a base; the mode lists nothing until one is chosen | The app does not persist a worktree's base branch (verified), so it must never guess one silently | y |
| Mode memory | Per worktree, persisted in `AppConfig.ui` beside the other UI state; first visit = full folder; arriving from the status bar forces "uncommitted" | Owner decision (grill Q15, Q8) | y |
| Tab lifetime | Per worktree, in memory, until the app closes | Owner decision (grill Q16) | y |
| A click in a diff mode, before F2 | Opens the file's current content with a label saying the diff arrives later | Owner decision (grill Q21): all three modes ship now and the counter has somewhere to land | y |
| A deleted file clicked in a diff mode | A placeholder saying the file was deleted, not an error | There is no current content to open, and until F2 no diff to show | y |
| Launcher target | The active tab's file; when a folder was selected more recently, that folder | "Open this file or folder in them" (owner's wording) | y |
| Explorer on a file | `explorer.exe /select,<path>` — shows the file in its folder | `explorer.exe <file>` **opens** the file in its default app (`shortcut-launcher.ts:56`) | y |
| Visual Studio launches | Elevated, as every VS launch already is (AD-016) — a UAC prompt per launch | Owner decision (grill Q22): one VS instance with one privilege level; mixing elevated and non-elevated opens two windows | y |
| `.sln` / `.slnx` double-click | Opens in VS 2026; a single click opens it in a tab like any other file | Owner's specification, amended 2026-09-20 after UAT (AD-033) | y |
| Binary or large files | Not rendered above ~1 MB or when binary; the tab shows name, size and type plus the launchers | Owner decision (grill Q18) | y |
| Freshness | One recursive watch on the selected worktree's root, debounced; a change refreshes only the open tabs and the current mode's list, keeping scroll position | Owner decision (grill Q20, design D2): agents write to these files constantly. A new untracked file is only visible by watching the folder; reacting to everything would not be affordable, so the reaction — not the watch — is what is scoped | y |
| Viewer component | Decided at Design (Monaco, CodeMirror or own rendering) | A technical choice, like status-bar D1–D4; the spec fixes behaviour only | y |
| Branch base | `feature/files-explore` stacked on `feature/status-bar` | FXPL-31 changes the status bar's counter; per the fork workflow a dependent feature branches from its dependency | y |
| Amendment to `status-bar` | FXPL-31 supersedes STBR-30's popover and STBR-32's "no action" once F1 lands | Owner decision (grill Q8); the popover was always the counter's stand-in | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Browse the worktree ⭐ MVP

**User Story**: As the developer, I want a Files direction showing the selected worktree's files as
a tree, so that I can see what is in a worktree without opening another tool.

**Why P1**: Everything else in the epic hangs off this surface.

**Acceptance Criteria**:

1. The TopBar SHALL offer a fifth direction, `Files`, and the chosen direction SHALL persist like the other four <!-- ubiquitous -->
2. WHILE the Files direction is active with a worktree selected the view SHALL show that worktree's files as a tree in a left column <!-- state-driven -->
3. WHILE no worktree is selected the Files direction SHALL show an empty state asking for a selection <!-- state-driven -->
4. The full-folder tree SHALL list tracked files and untracked files that `.gitignore` does not exclude, and no ignored file <!-- ubiquitous -->
5. WHEN the user expands a folder THEN the view SHALL load that folder's children only, not the whole tree <!-- event-driven -->
6. WHEN the tree selection changes to another worktree THEN the view SHALL show that worktree's tree, mode and tabs <!-- event-driven -->

**Independent Test**: Select a worktree containing `node_modules` and an untracked non-ignored file; Files lists the untracked file, omits `node_modules`, and expanding a folder loads only its children.

---

### P1: Switch the lens ⭐ MVP

**User Story**: As the developer, I want to switch the tree between the whole folder, what my
branch changed, and what I have not committed, so that I look at exactly the files that matter now.

**Why P1**: The modes are what make the tree useful on a branch under review or under an agent.

**Acceptance Criteria**:

7. The left column SHALL carry a mode selector at its top with three modes: full folder, diff to origin, uncommitted changes <!-- ubiquitous -->
8. WHILE in diff-to-origin mode the tree SHALL list only files changed between `merge-base(HEAD, <base>)` and `HEAD` <!-- state-driven -->
9. WHILE in diff-to-origin mode the view SHALL show the base in use and let the user switch it to another branch <!-- state-driven -->
10. WHERE the repository has an `origin/HEAD` the base SHALL default to it <!-- optional-feature -->
11. IF the repository has no `origin/HEAD` THEN the base picker SHALL ask the user to choose a base and the mode SHALL list nothing until one is chosen <!-- unwanted-behavior -->
12. WHILE in uncommitted-changes mode the tree SHALL list exactly the paths `worktrees:changes` returns, each with its change status <!-- state-driven -->
13. WHEN the user returns to a worktree THEN the view SHALL restore the mode last used for it, persisted across restarts, defaulting to full folder <!-- event-driven -->
33. WHEN the app is launched THEN it SHALL select the worktree that was selected when it last closed, and select nothing if that worktree no longer exists **[added 2026-09-20, AD-039]** <!-- event-driven -->
14. ~~WHILE F2 has not shipped, WHEN the user opens a file from either diff mode THEN the view SHALL show its current content labelled as a file view, not a diff~~ **Superseded by FDIF-10**, delivered 2026-09-20 in `files-diff` T20: a click in either diff mode now opens the diff, so there is no file view to label. The requirement was scoped "while F2 has not shipped" and that condition has expired. <!-- complex -->
15. ~~IF the user opens a file listed as deleted THEN the view SHALL show a placeholder stating the file was deleted~~ **Superseded by FDIF-01..05**, delivered 2026-09-20 in `files-diff` T18: a click in either diff mode opens the diff, and a file the branch deleted is a diff whose modified side is absent — which says the same thing and also shows what was lost. Nothing produces the placeholder any more, so its kind was removed with the requirement (the AD-018 pattern). The `missing` placeholder of FXPL-24 is untouched: a file deleted from disk while its tab is open still has one. <!-- unwanted-behavior -->

**Independent Test**: On a branch two commits past `main` with one uncommitted edit, the diff mode lists the committed files, the uncommitted mode lists the edited one with `modified`, and switching worktrees and back restores the last mode.

---

### P1: Read files in tabs ⭐ MVP

**User Story**: As the developer, I want to open files in tabs with syntax highlighting and see
them update as an agent writes, so that I can follow the work without leaving the app.

**Why P1**: Reading is the point of opening a file here instead of in VS Code.

**Acceptance Criteria**:

16. WHEN the user clicks a file in the tree THEN the view SHALL open it in a tab in the right column, or focus its tab when already open <!-- event-driven -->
17. The viewer SHALL be read-only and render text with syntax highlighting for the file's language <!-- ubiquitous -->
18. The system SHALL keep each worktree's open tabs while the app runs and SHALL NOT restore tabs after a restart <!-- ubiquitous -->
19. WHEN the user closes a tab THEN the view SHALL focus the adjacent tab, or show an empty state when none is left <!-- event-driven -->
20. IF a file is binary or larger than 1 MB THEN its tab SHALL show the file's name, size and type and the launchers, and SHALL NOT render its content <!-- unwanted-behavior -->
21. WHEN an open file changes on disk THEN its tab SHALL update in place within 1 s and keep its scroll position <!-- event-driven -->
22. WHEN a file in the current mode's list is added, changed or removed on disk THEN the tree SHALL reflect it within 1 s <!-- event-driven -->
23. The system SHALL watch only the selected worktree, SHALL react to a disk change only by refreshing that worktree's open tabs and current mode list, and SHALL stop watching a worktree once it is no longer selected <!-- ubiquitous -->
24. IF an open file is deleted on disk THEN its tab SHALL stay open showing a placeholder that the file no longer exists <!-- unwanted-behavior -->

**Independent Test**: Open a file, have a shell append a line to it, and watch the tab update within a second without jumping to the top; delete the file and see the tab switch to its placeholder.

---

### P1: Hand off to the right tool ⭐ MVP

**User Story**: As the developer, I want a row of launchers under the tabs that opens the current
file or folder in Explorer, VS Code, VS 2022 or VS 2026, and a solution to open straight in VS 2026,
so that editing is one click away.

**Why P1**: Read-only is only acceptable because editing is one click away.

**Acceptance Criteria**:

25. The right column SHALL show, under the tabs, launchers for File Explorer, VS Code, VS 2022 and VS 2026 <!-- ubiquitous -->
26. WHEN the user activates a launcher THEN the system SHALL open the launcher's tool on the active tab's file, or on the folder most recently selected in the tree when that selection is newer <!-- event-driven -->
27. WHEN File Explorer is launched on a file THEN it SHALL open the file's folder with the file selected, never open the file itself <!-- event-driven -->
28. WHEN the user double-clicks a `.sln` or `.slnx` file in the tree THEN the system SHALL open it in VS 2026 and SHALL NOT open a tab for it <!-- event-driven -->
28a. WHEN the user single-clicks a `.sln` or `.slnx` file in the tree THEN the system SHALL open it in a tab like any other text file <!-- event-driven -->
28b. WHILE a solution has been launched, a second launch of that same solution within 3 s SHALL be ignored <!-- state-driven -->
29. Visual Studio launches SHALL keep the elevated behaviour every VS launch already has (AD-016) <!-- ubiquitous -->
30. IF a launch fails THEN the view SHALL show the launcher's existing failure toast <!-- unwanted-behavior -->

**Independent Test**: Open a `.cs` file and launch Explorer: the folder opens with the file highlighted. Double-click the repo's `.sln`: VS 2026 opens it after the UAC prompt and no tab appears, and a second double-click within 3 s opens no second instance.

---

### P2: Arrive from the status bar

**User Story**: As the developer, I want the status bar's changed-file counter to take me to Files
showing my uncommitted changes, so that the counter leads somewhere useful.

**Why P2**: It depends on `status-bar` landing first, and F1 is useful without it.

**Acceptance Criteria**:

31. WHEN the user activates the status bar's changed-file counter THEN the app SHALL switch to the Files direction on that worktree in uncommitted-changes mode, superseding STBR-30's popover and STBR-32 <!-- event-driven -->
32. WHEN the Files direction is entered from the counter THEN the forced mode SHALL be remembered as that worktree's last mode <!-- event-driven -->

**Independent Test**: Dirty a worktree, click the counter from the Board direction, and land in Files in uncommitted mode listing the dirty file.

---

## Edge Cases

- IF the selected worktree's path no longer exists THEN the Files direction SHALL show the path-missing state the tree already derives, with no tree and no tabs
- IF `git ls-files` fails for the worktree THEN the tree SHALL show git's first error line instead of an empty tree
- WHEN a base branch chosen in the picker is later deleted THEN the diff mode SHALL fall back to the prompt of FXPL-11
- WHEN a file is renamed by an agent while open THEN the old tab SHALL show the deleted placeholder (FXPL-24) and the new path SHALL appear in the tree
- WHEN the same file is open in two worktrees THEN each worktree's tab SHALL be independent
- IF a text file's encoding is not UTF-8 THEN the viewer SHALL render it as UTF-8 with replacement characters rather than refuse to open it

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FXPL-01 | P1: Browse the worktree | Design | Pending |
| FXPL-02 | P1: Browse the worktree | Design | Pending |
| FXPL-03 | P1: Browse the worktree | Design | Pending |
| FXPL-04 | P1: Browse the worktree | Design | Pending |
| FXPL-05 | P1: Browse the worktree | Design | Pending |
| FXPL-06 | P1: Browse the worktree | Design | Pending |
| FXPL-07 | P1: Switch the lens | Design | Pending |
| FXPL-08 | P1: Switch the lens | Design | Pending |
| FXPL-09 | P1: Switch the lens | Design | Pending |
| FXPL-10 | P1: Switch the lens | Design | Pending |
| FXPL-11 | P1: Switch the lens | Design | Pending |
| FXPL-12 | P1: Switch the lens | Design | Pending |
| FXPL-13 | P1: Switch the lens | Design | Pending |
| FXPL-14 | P1: Switch the lens | Design | **Superseded by FDIF-10** |
| FXPL-15 | P1: Switch the lens | Design | Pending |
| FXPL-16 | P1: Read files in tabs | Design | Pending |
| FXPL-17 | P1: Read files in tabs | Design | Pending |
| FXPL-18 | P1: Read files in tabs | Design | Pending |
| FXPL-19 | P1: Read files in tabs | Design | Pending |
| FXPL-20 | P1: Read files in tabs | Design | Pending |
| FXPL-21 | P1: Read files in tabs | Design | Pending |
| FXPL-22 | P1: Read files in tabs | Design | Pending |
| FXPL-23 | P1: Read files in tabs | Design | Pending |
| FXPL-24 | P1: Read files in tabs | Design | Pending |
| FXPL-25 | P1: Hand off to the right tool | Design | Pending |
| FXPL-26 | P1: Hand off to the right tool | Design | Pending |
| FXPL-27 | P1: Hand off to the right tool | Design | Pending |
| FXPL-28 | P1: Hand off to the right tool | Design | Pending |
| FXPL-29 | P1: Hand off to the right tool | Design | Pending |
| FXPL-30 | P1: Hand off to the right tool | Design | Pending |
| FXPL-31 | P2: Arrive from the status bar | Design | Pending |
| FXPL-33 | P1: Switch the lens | Design | Pending |
| FXPL-32 | P2: Arrive from the status bar | Design | Pending |
| FXPL-28a | P1: Hand off to a tool | T17 (`FileTree.tsx`) | Done |
| FXPL-28b | P1: Hand off to a tool | T17 (`FileTree.tsx`) | Done |

**Coverage:** 34 total (FXPL-28a and FXPL-28b added 2026-09-20 by AD-033), 0 mapped to tasks yet (Design not run), 0 unmapped

---

## Success Criteria

- [ ] A worktree's files are browsable in all three modes, and `node_modules` never appears
- [ ] A file an agent is writing updates in its tab within a second, without losing scroll position
- [ ] Any file or folder reaches Explorer (selected, not opened), VS Code, VS 2022 or VS 2026 in one click; a `.sln` opens in VS 2026 on a double-click
- [ ] A 200 MB log or a DLL never freezes the viewer
- [ ] The status bar's counter lands in Files on the uncommitted changes
- [ ] The gate is green: `npm run typecheck && npm run lint && npm test`
