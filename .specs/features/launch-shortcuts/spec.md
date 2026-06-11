# Launch Shortcuts Specification

**Milestone:** M1 — Walking Skeleton & Worktree Navigation (final M1 feature — app becomes daily-usable)
**Sources of truth:** PRD issue #1 (stories 17–19, 21 partial; §Module decomposition `ShortcutLauncher`, §What is hard-coded in v1), `design_handoff_worktree_manager/README.md` (§1b "Open with" section, §Interactions & Behavior)
**Scope size:** Medium — spec only; design inline, tasks implicit in Execute

## Problem Statement

The tree shows every worktree but the user still has to copy the path and open tools by hand. The whole point of M1 is "task in ADO → worktree on disk **with tools open on it**" — minus ADO for now. This feature ships `ShortcutLauncher` (main process) and the "Open with" launcher cards in the detail pane, closing the loop that makes the app daily-usable.

## Goals

- [ ] One click opens File Explorer, Windows Terminal, or VS Code rooted at the selected worktree's path
- [ ] "Open with" cards render in the detail pane per handoff §1b (between Location and the future Danger section)
- [ ] Launch failures surface a clear, transient message instead of failing silently

## Out of Scope

| Feature                                      | Reason                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Per-workspace IDE/terminal overrides         | PRD §Out of Scope — v1 targets are hard-coded                                                    |
| Board-card launcher icon buttons (§2 footer) | M4 — Board Direction                                                                             |
| Success toasts on launch                     | The launched window is its own feedback; prototype toasts were stand-ins (handoff §Interactions) |
| Launching `claude` / agent tooling           | PRD §Out of Scope (v2)                                                                           |
| Non-Windows targets                          | PRD: v1 is Windows-only by virtue of the hard-coded shortcuts                                    |

---

## User Stories

### P1: "Open with" launcher cards ⭐ MVP

**User Story**: As a developer, I want launcher cards on the selected worktree's detail pane, so that the tools I need are one click away from where I'm already looking (handoff §1b).

**Why P1**: The visible surface of the feature; without it the launcher module is unreachable.

**Acceptance Criteria**:

1. WHEN a worktree is selected THEN the detail pane SHALL show an "OPEN WITH" section (uppercase 11px label) below Location: a 3-column grid (12px gap) of cards per §1b — `1px solid var(--border)`, `var(--panel)` bg, radius 14px, padding 15px
2. WHEN a card renders THEN it SHALL show a 36px tinted icon tile + label + mono command: File Explorer (`--blue` tile, `explorer.exe`), Windows Terminal (`--green` tile, `wt.exe`), VS Code (`--accent` tile, `code`)
3. WHEN a card is hovered THEN it SHALL get `border-color: var(--accent)` + `translateY(-2px)` per §1b
4. WHEN no worktree is selected THEN no launcher cards SHALL render (empty state unchanged)

**Independent Test**: Select a worktree; visual pass of the three cards against the `.dc.html` prototype, including hover.

---

### P1: Open File Explorer ⭐ MVP

**User Story**: As a developer, I want a one-click button to open Windows File Explorer rooted at the selected worktree, so that I can quickly inspect files in the OS (PRD story 17).

**Acceptance Criteria**:

1. WHEN the File Explorer card is clicked THEN system SHALL launch `explorer.exe` showing the selected worktree's directory (main-process spawn via `ShortcutLauncher.openExplorer(path)`; renderer never touches `child_process`)
2. WHEN the worktree path contains spaces or non-ASCII characters THEN Explorer SHALL still open the correct folder

**Independent Test**: Click the card on a real worktree — an Explorer window appears at that path.

---

### P1: Open Windows Terminal ⭐ MVP

**User Story**: As a developer, I want a one-click button to open Windows Terminal in the selected worktree's directory, so that I can drop into a shell there immediately (PRD story 18).

**Acceptance Criteria**:

1. WHEN the Windows Terminal card is clicked THEN system SHALL launch `wt.exe` with its starting directory set to the worktree path (`ShortcutLauncher.openTerminal(path)`)
2. WHEN the path contains spaces THEN the terminal SHALL still start in the correct directory

**Independent Test**: Click the card — a Windows Terminal opens; `pwd` prints the worktree path.

---

### P1: Open VS Code ⭐ MVP

**User Story**: As a developer, I want a one-click button to open VS Code on the selected worktree, so that I can edit code in my preferred editor (PRD story 19).

**Acceptance Criteria**:

1. WHEN the VS Code card is clicked THEN system SHALL launch `code` with the worktree path as the folder to open (`ShortcutLauncher.openVsCode(path)`; note `code` is a `.cmd` shim on Windows — spawn accordingly)
2. WHEN the path contains spaces THEN VS Code SHALL still open the correct folder

**Independent Test**: Click the card — VS Code opens with the worktree as its workspace folder.

---

### P2: Launch failure feedback

**User Story**: As a developer, I want a clear message when a launch fails, so that a missing tool is self-explanatory instead of a silent no-op (PRD story 21 partial).

**Why P2**: Explorer always exists on Windows, but `wt.exe`/`code` may not be installed/on PATH.

**Acceptance Criteria**:

1. WHEN a spawn fails (tool not found, spawn error) THEN system SHALL show a transient toast (bottom-center, ~2.2s, prototype toast styling per handoff §Transitions/`toastIn`) naming the tool, e.g. "Couldn't launch Windows Terminal (wt.exe)"
2. WHEN a launch succeeds THEN system SHALL show nothing (no success toast)
3. WHEN the selected worktree's path no longer exists on disk THEN system SHALL surface the failure via the same toast rather than crashing

**Independent Test**: Temporarily rename `wt.exe`'s alias or use a worktree path deleted externally — toast appears; app stays alive.

---

## Edge Cases

- WHEN a card is double-clicked rapidly THEN at most the expected tool windows open and the app SHALL not error (no debounce required, but no crash)
- WHEN the spawn succeeds but the tool exits immediately THEN system SHALL NOT treat it as a failure (fire-and-forget; only spawn errors are reported)
- WHEN the worktree path is a UNC or long path THEN launch SHALL pass it through unmodified (no path mangling in the launcher)

---

## Requirement Traceability

| Requirement ID | Story                          | Phase   | Status  |
| -------------- | ------------------------------ | ------- | ------- |
| LNCH-01        | P1: "Open with" launcher cards | Execute | Pending |
| LNCH-02        | P1: Open File Explorer         | Execute | Pending |
| LNCH-03        | P1: Open Windows Terminal      | Execute | Pending |
| LNCH-04        | P1: Open VS Code               | Execute | Pending |
| LNCH-05        | P2: Launch failure feedback    | Execute | Pending |

**Coverage:** 5 total, 0 mapped to tasks (tasks implicit — Medium scope), 5 pending

---

## Testing Notes (from PRD §Testing Decisions)

- `ShortcutLauncher` is **deliberately not unit-tested** per PRD ("trivial wrapper over `child_process.spawn` with hard-coded args") — verified by hand
- React components not unit-tested per PRD; verified via UAT/CDP smoke (reuse `scripts/smoke-tree.mjs` pattern: assert cards render for a selected worktree)
- The IPC channel addition follows the existing `ipc-contract.ts` pattern; behavior verified by the manual launch checks above

## Success Criteria

- [ ] From a fresh app start: select any real worktree and open Explorer, Terminal, and VS Code on it — each lands in the right directory
- [ ] M1 exit: the app is daily-usable (register once → navigate tree → launch tools), matching the PRD's "daily-usable after slice 3" milestone
- [ ] Visual fidelity pass of the "Open with" section against the `.dc.html` prototype
