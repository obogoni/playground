# Create Worktree (taskless) Specification

**Milestone:** M2 — Worktree Lifecycle (first M2 feature)
**Sources of truth:** PRD issue #1 (stories 12, 13, 16, 21 partial; §Worktree placement, §Module decomposition `WorktreeManager`, §Testing Decisions), `design/handoff/README.md` (§3 Start-work dialog — adapted taskless, §Interactions & Behavior)
**Scope size:** Medium — spec only; design inline, tasks implicit in Execute

## Problem Statement

The app shows every worktree and opens tools on them, but creating a worktree still means hand-typing `git worktree add` with the sibling-path convention in your head. This feature ships `WorktreeManager.create` and a new-worktree dialog so the tool starts replacing the terminal for the lifecycle, not just the navigation.

## Goals

- [x] From the sidebar, open a dialog and create a worktree on a new branch in ≤4 interactions (open → branch name → create)
- [x] Placement is always the PRD convention `<workspace>/<repo>-<sanitized-branch>` — shown live in the dialog before creating
- [x] The sidebar refreshes and selects the new worktree (no auto-open — the launcher cards are right there)
- [x] `WorktreeManager.create`/`pathFor` are unit-tested against real temp git repos per PRD §Testing Decisions

## Out of Scope

| Feature                                     | Reason                                                          |
| ------------------------------------------- | --------------------------------------------------------------- |
| Delete worktree / dirty-check guard         | Separate M2 feature "Delete Worktree (guarded)"                 |
| Task-linked start-work (template prefill)   | M3 — this dialog is the taskless variant (PRD story 12)         |
| Branch template config / `{type}/{id}-{slug}` | M3/M4 — no template exists yet for taskless creation          |
| Per-workspace `.app/` overrides             | M4 — Per-Workspace Config                                       |
| Creating from a detached HEAD / arbitrary SHA | Dialog offers branches only; module takes a base branch string |

---

## Decisions (gray areas resolved during Specify)

- **Entry point** *(not in PRD or handoff — handoff §3 only shows the task-triggered dialog)*: a "+" icon button on each **repo row** in the sidebar, revealed on hover (pattern matches the existing hover affordances). It opens the dialog with that repo pre-selected; the dialog's repo picker (handoff §3) still allows switching. ⚠️ Flagged for user review.
- **Dialog header (taskless)**: handoff §3 header shows "START WORK" + task id/title; the taskless variant shows uppercase "NEW WORKTREE" + the selected repo name (mono). Everything else (panel, body, footer, popIn) follows §3 verbatim.
- **Always a new branch**: the dialog has Base branch + New branch inputs (§3), so it runs `git worktree add <path> -b <branch> <base>`. `WorktreeManager.create(repoPath, branch, baseBranch?)` still supports the existing-branch form per PRD (used by M3, covered by tests now). *Execute note:* clearing the Base field falls back to that existing-branch form instead of erroring — useful and degrades gracefully via the inline git error.
- **Error surface**: creation failures render **inline in the dialog** (footer area), keeping it open for correction — the transient Toast is wrong for errors the user must act on. Toast stays for fire-and-forget ops only.

---

## User Stories

### P1: New-worktree dialog ⭐ MVP

**User Story**: As a developer, I want to create a worktree without a task (plain branch name) from a short dialog, so that the tool still works for untracked chores (PRD story 12).

**Acceptance Criteria**:

1. WHEN a repo row is hovered THEN it SHALL reveal a "+" icon button; clicking it SHALL open the dialog (modal per §3: backdrop blur, 560px panel, radius 18px, `popIn 0.2s`) with that repo pre-selected
2. WHEN the dialog renders THEN it SHALL show: repository picker (2-column chip grid, selected chip accent-tinted), Base branch input (prefilled with the repo's primary-checkout branch), New branch input (empty, mono), and the path preview card
3. WHEN the New branch input changes THEN the path preview SHALL update live, showing `<workspace>\<repo>-<sanitized-branch>` with the PRD sanitization applied
4. WHEN "Create worktree" is clicked with a valid branch THEN system SHALL create the worktree via IPC and close the dialog
5. WHEN the backdrop is clicked or Cancel pressed THEN the dialog SHALL close with no side effects

**Independent Test**: Open dialog from a repo row, type `feat/try this`, watch preview show `<repo>-feat-try-this`, create — folder appears on disk at that path.

---

### P1: Flat-sibling placement & sanitization ⭐ MVP

**User Story**: As a developer, I want new worktrees placed as flat siblings of the source repo using a sanitized `<repo>-<branch>` naming convention, so that I always know where to find them on disk (PRD story 13).

**Acceptance Criteria**:

1. WHEN `pathFor(repoPath, branch)` is called THEN it SHALL return `<parent-of-repo>\<repo>-<sanitized-branch>`, deterministically and idempotently
2. WHEN a branch contains `/` or `\` or characters outside `[A-Za-z0-9._-]` THEN sanitization SHALL replace them with `-`, collapse consecutive `-`, and trim leading/trailing `-`
3. WHEN `create(repoPath, branch, baseBranch)` is called THEN it SHALL run `git worktree add <computed-path> -b <branch> <baseBranch>` (no shell; `execFile` like `listWorktrees`)
4. WHEN `create(repoPath, branch)` is called without a base THEN it SHALL run `git worktree add <computed-path> <branch>` (existing branch)
5. WHEN the target path already exists THEN create SHALL fail with a readable error and create nothing

**Independent Test**: Vitest suite on real temp git repos — new branch, existing branch, path collision, sanitization table (`/`, spaces, specials), `pathFor` idempotence (PRD §Testing Decisions list for `WorktreeManager`).

---

### P1: Tree refresh + selection ⭐ MVP

**User Story**: As a developer, I want the sidebar tree to refresh when a worktree is created, so that the UI is always consistent with disk reality (PRD story 16).

**Acceptance Criteria**:

1. WHEN creation succeeds THEN the renderer SHALL re-fetch `tree:get` and the new worktree SHALL appear under its repo
2. WHEN the refreshed tree renders THEN the new worktree SHALL be the selected row, with its detail pane (and launcher cards) shown — **no auto-open** of any tool (PRD §Start-work flow note)

**Independent Test**: Create from the dialog; without touching anything else, the new row is highlighted and the detail pane shows its branch.

---

### P2: Creation error messaging

**User Story**: As a developer, I want clear error messaging when a worktree operation fails, so that I can recover without confusion (PRD story 21 partial).

**Acceptance Criteria**:

1. WHEN the New branch input is empty or sanitizes to empty THEN "Create worktree" SHALL be disabled (no error text needed)
2. WHEN git fails (branch already exists, base branch unknown, target path exists, disk error) THEN the dialog SHALL stay open and show the failure inline near the footer, with git's first error line included
3. WHEN a failure is shown and the user edits any field THEN the error SHALL clear

**Independent Test**: Try a branch name that already exists — dialog stays open with a message naming the branch; fix the name and create succeeds.

---

## Edge Cases

- WHEN the branch name sanitizes to the same path as an existing sibling (e.g. `fix/a` vs `fix-a`) THEN create SHALL fail with the path-exists message, not overwrite
- WHEN "Create worktree" is double-clicked THEN at most one worktree SHALL be created (button disabled while the IPC call is in flight)
- WHEN the repo's primary checkout is detached or bare THEN the Base branch prefill SHALL fall back to empty, leaving the field to the user
- WHEN the workspace folder name or repo path contains spaces THEN the computed path and `git worktree add` SHALL handle them (execFile, no shell)

---

## Requirement Traceability

| Requirement ID | Story                                   | Phase | Status   |
| -------------- | --------------------------------------- | ----- | -------- |
| CRWT-01        | P1: New-worktree dialog                 | Done  | Verified |
| CRWT-02        | P1: Flat-sibling placement & sanitization | Done  | Verified |
| CRWT-03        | P1: Tree refresh + selection            | Done  | Verified |
| CRWT-04        | P2: Creation error messaging            | Done  | Verified |

**Coverage:** 4 total, 4 verified ✅ — 16 new Vitest cases on real temp git repos (45 total green) + 10-check CDP smoke (`scripts/smoke-create.mjs`) against a live seeded workspace + dialog screenshot fidelity pass vs `.dc.html`

---

## Testing Notes (from PRD §Testing Decisions)

- `WorktreeManager` is the **highest-risk module** — full Vitest coverage with real temp git repos per test (extend `src/main/worktree-manager.test.ts` fixtures): create new/existing branch, target-path collision, sanitization table, `pathFor` determinism
- React dialog not unit-tested per PRD; verified via CDP smoke (`scripts/smoke-*.mjs` pattern): open dialog → preview updates → create against a seeded repo → row selected
- IPC channel `worktrees:create` follows the `ipc-contract.ts` pattern; failures returned, never thrown (like `shortcuts:launch`'s `LaunchResult`)

## Success Criteria

- [x] From a fresh app start: hover a repo, click "+", type a branch, create — new worktree on disk at the sibling path, selected in the tree, tools launchable on it immediately (smoke-verified)
- [x] All PRD `WorktreeManager` create/pathFor test cases green in Vitest
- [x] Visual fidelity pass of the dialog against the `.dc.html` prototype (taskless header noted as a deliberate deviation)
