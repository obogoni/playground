# Delete Worktree (guarded) Specification

**Milestone:** M2 — Worktree Lifecycle (second M2 feature)
**Sources of truth:** PRD issue #1 (stories 14, 15, 16 partial, 21 partial; §Worktree placement "Deletion uses `git worktree remove`; refuses on dirty worktree (no auto-preserve in v1)", §Module decomposition `WorktreeManager.remove(repoPath, worktreePath, { force? })`, §Testing Decisions), `design/handoff/README.md` (§1b Danger section, §Interactions & Behavior "Remove worktree guard")
**Scope size:** Medium — spec only; design inline, tasks implicit in Execute

## Problem Statement

Worktrees can now be created from the app but still die at the terminal: finishing a task means remembering `git worktree remove` and hoping you didn't leave uncommitted work behind. This feature ships `WorktreeManager.remove` with the dirty/primary guards and the §1b Danger section, closing the M2 create→delete lifecycle loop.

## Goals

- [x] Remove a clean, non-primary worktree from its detail pane in one click — folder gone from disk, row gone from the tree
- [x] The app refuses to remove a dirty worktree or a repo's primary checkout, with the reason shown inline (handoff §1b disabled-look + note)
- [x] `WorktreeManager.remove` is unit-tested against real temp git repos per PRD §Testing Decisions (clean remove, dirty refusal, primary refusal, force)
- [x] After removal the sidebar refreshes and the repo's primary checkout is selected (UI never lands on a vanished worktree)

## Out of Scope

| Feature                                  | Reason                                                              |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Auto-stash / auto-preserve dirty changes | PRD: "no auto-preserve in v1" — commit or stash manually            |
| Force-remove UI (override the guard)     | Module supports `{ force }` per PRD signature; no v1 UI invokes it  |
| Deleting the branch with the worktree    | PRD link model: the branch *is* the task link; removal is worktree-only (`git worktree remove` never deletes branches) |
| Pruning stale/broken worktree entries    | Separate concern (`git worktree prune`); not in PRD v1 stories      |
| Context-menu / sidebar delete entry      | Single entry point: §1b Danger section in the detail pane           |

---

## Decisions (gray areas resolved during Specify)

- **No confirmation dialog** *(neither PRD nor handoff shows one — the prototype removes immediately with a toast)*: the guard already blocks every lossy case (dirty), and removing a clean worktree is recoverable — the branch and its commits survive, only the checkout folder goes. A confirm step would punish the common case to protect a recoverable one. ⚠️ Flagged for user review.
- **Selection after removal**: `refreshTree` would drop selection to the empty state; instead the repo's **primary checkout is selected**, keeping the user in the repo they were working in (mirrors create's refresh+select).
- **Error surface**: removal failures (locked folder, git error) render **inline in the Danger section** — same rationale as create's inline dialog errors: errors the user must act on don't belong in a transient Toast. Success uses the Toast ("Removed <branch>") since there's nothing left to act on.
- **Guard enforced in main, displayed in renderer**: the disabled-look button keys off the tree snapshot's `dirty`/`isDefault`, but `removeWorktree` re-checks `git status` fresh at call time — the snapshot can be stale (edits since last refresh must not slip through). The primary checkout is detected by path identity with the repo (`worktreePath === repoPath`, the invariant `buildTree` relies on).

---

## User Stories

### P1: Guarded remove in WorktreeManager ⭐ MVP

**User Story**: As a developer, I want the app to delete a worktree but refuse when it has uncommitted changes, so that I can clean up after a task without ever losing work (PRD stories 14, 15).

**Acceptance Criteria**:

1. WHEN `remove(repoPath, worktreePath)` is called on a clean, non-primary worktree THEN it SHALL run `git worktree remove <path>` (execFile, no shell) and return `{ ok: true }`, and the folder SHALL be gone from disk
2. WHEN the worktree has uncommitted changes (checked fresh via `git status --porcelain`, not the tree snapshot) THEN remove SHALL return `{ ok: false }` with a message naming the change count, and remove nothing
3. WHEN `worktreePath` is the repo's primary checkout (path equals `repoPath`) THEN remove SHALL refuse with a message saying the primary checkout can't be removed
4. WHEN called with `{ force: true }` THEN the dirty pre-check SHALL be skipped and `git worktree remove --force` run (primary-checkout refusal still applies — git itself cannot remove a main working tree)
5. WHEN git fails for any other reason THEN the failure SHALL be returned (git's first stderr line), never thrown

**Independent Test**: Vitest on real temp git repos — clean remove succeeds and folder vanishes; dirty (modified + untracked) refuses and folder survives; primary refuses; force removes dirty.

---

### P1: Danger section in the worktree detail pane ⭐ MVP

**User Story**: As a developer, I want a Remove worktree button on the worktree I'm inspecting, with the guard reason visible when it's blocked, so that deletion is discoverable and self-explanatory (handoff §1b Danger, §Interactions).

**Acceptance Criteria**:

1. WHEN a worktree detail renders THEN a Danger section (top border, trash icon "Remove worktree" button) SHALL appear below Open with, per §1b
2. WHEN the worktree is clean and non-primary THEN the button SHALL be enabled with the red-outline style (`--red` 50% mix border, red text)
3. WHEN the worktree is dirty THEN the button SHALL take the disabled look (border, faint text, opacity 0.7) with the inline note "N uncommitted change(s) — commit or stash before removing."
4. WHEN the worktree is the primary checkout THEN the disabled look SHALL show "This is the repo's primary checkout — it can't be removed here."
5. WHEN the enabled button is clicked THEN it SHALL disable while the IPC call is in flight (no double remove)

**Independent Test**: Select a dirty worktree — button looks disabled and the note names the change count; commit the changes, refresh, the button turns red and active.

---

### P1: Tree refresh + reselection after removal ⭐ MVP

**User Story**: As a developer, I want the sidebar tree to refresh when a worktree is deleted, so that the UI is always consistent with disk reality (PRD story 16).

**Acceptance Criteria**:

1. WHEN removal succeeds THEN the renderer SHALL re-fetch `tree:get` and the removed worktree SHALL no longer appear
2. WHEN the refreshed tree renders THEN the repo's primary checkout SHALL be the selected row with its detail pane shown
3. WHEN removal succeeds THEN a toast SHALL confirm it ("Removed <branch>")

**Independent Test**: Remove a sibling worktree from its detail pane — its row disappears, the repo's primary row is highlighted, toast shows the branch name.

---

### P2: Removal error messaging

**User Story**: As a developer, I want clear error messaging when a worktree removal fails, so that I can recover without confusion (PRD story 21 partial).

**Acceptance Criteria**:

1. WHEN git fails (e.g. a file in the worktree is locked by another process) THEN the detail pane SHALL stay on the worktree and show the failure inline in the Danger section, with git's first error line included
2. WHEN the tree snapshot said clean but the live check finds changes THEN the refusal message SHALL surface the same way (inline), not crash or silently no-op

**Independent Test**: Open a file inside the worktree in a process holding a lock, click Remove — inline error appears, worktree still listed after a manual refresh.

---

## Edge Cases

- WHEN the worktree path no longer exists on disk (deleted externally) THEN remove SHALL succeed by cleaning up git's stale bookkeeping entry (verified: current git removes the entry rather than erroring), and the tree refresh reconciles the sidebar
- WHEN the worktree is in detached-HEAD state and clean THEN remove SHALL succeed like any non-primary worktree
- WHEN untracked files are the only changes THEN the worktree counts as dirty and removal SHALL refuse (untracked work is still work)
- WHEN the repo or worktree path contains spaces THEN removal SHALL handle them (execFile, no shell)

---

## Requirement Traceability

| Requirement ID | Story                                      | Phase | Status   |
| -------------- | ------------------------------------------ | ----- | -------- |
| DLWT-01        | P1: Guarded remove in WorktreeManager      | Done  | Verified |
| DLWT-02        | P1: Danger section in detail pane          | Done  | Verified |
| DLWT-03        | P1: Tree refresh + reselection             | Done  | Verified |
| DLWT-04        | P2: Removal error messaging                | Done  | Verified |

**Coverage:** 4 total, 4 verified ✅ — 8 new Vitest cases on real temp git repos (53 total green) + 10-check CDP smoke (`scripts/smoke-remove.mjs`) against a live seeded workspace + Danger-section screenshot fidelity pass vs `.dc.html` (armed / dirty / primary states)

---

## Testing Notes (from PRD §Testing Decisions)

- `WorktreeManager` remains the highest-risk module — extend `src/main/worktree-manager.test.ts` with real temp git repo fixtures: remove clean (folder gone, listing shrinks), remove dirty (refuses, folder intact), remove primary (refuses), force-remove dirty, git failure passthrough
- React Danger section not unit-tested per PRD; verified via CDP smoke (`scripts/smoke-*.mjs` pattern): select sibling → remove → row gone + primary selected; dirty worktree → disabled look + note
- IPC channel `worktrees:remove` follows `ipc-contract.ts`; failures returned, never thrown (`RemoveWorktreeResult`, same shape discipline as `CreateWorktreeResult`)

## Success Criteria

- [x] From a fresh app start: select a clean sibling worktree, click Remove — folder gone, tree updated, primary selected, toast shown (smoke-verified)
- [x] Dirty and primary worktrees show the §1b disabled-look with the exact inline reasons; no path exists to remove them from the UI (button is `disabled`; main re-checks regardless)
- [x] All PRD `WorktreeManager` remove test cases green in Vitest
- [x] Visual fidelity pass of the Danger section against the `.dc.html` prototype
