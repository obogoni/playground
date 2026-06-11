# Handoff

**Date:** 2026-06-11
**Feature:** delete-worktree (M2, final feature) — COMPLETE; DLWT-01..04 Verified. M2 milestone done.

## Completed ✓

- Spec → execute on branch `feature/delete-worktree` (Medium scope: no design/tasks docs), from main @ `19572f4` (PR #13 merge)
- `removeWorktree(repoPath, worktreePath, { force? })` in `worktree-manager.ts`: refuses primary checkout (path identity with repo, case/separator-insensitive), re-checks dirtiness fresh via `git status` (tree snapshot not trusted), force skips dirty guard only; `worktrees:remove` IPC channel (no force path from UI in v1)
- UI: §1b Danger section in `WorktreeDetail` — armed red-outline button when clean+non-primary, disabled-look + exact inline reasons (primary outranks dirty), inline red error on failure, success toast; App reselects the repo's primary checkout after refresh
- Verified: typecheck/lint/53 Vitest green (8 new cases incl. force, casing, vanished-folder cleanup); CDP smoke 10/10 (`scripts/smoke-remove.mjs`); screenshot fidelity pass of armed/dirty/primary states vs `.dc.html`
- Learned: current git's `worktree remove` on an externally-deleted folder *succeeds* (cleans stale bookkeeping) rather than erroring — spec edge case updated to match

## In Progress

- PR #14 `feature/delete-worktree` → main open, awaiting review/merge

## Pending

- After PR merges: start M3 — specify **Pinned Tasks Pane** (`AdoGateway` token via `az account get-access-token` + work item GET; `TaskBoard` pin/unpin/URL-parsing/persistence; tasks pane UI per handoff §1c with "run `az login`" empty state)

## Blockers

- None

## Context

- Branch: `feature/delete-worktree`
- Uncommitted: none after docs checkpoint commit
- Related decisions: AD-001..003; spec §Decisions (no confirmation dialog — flagged ⚠️ for user review; reselect primary after removal; inline Danger errors; guard enforced in main)
- Smoke runbook: seed temp workspace + repo/worktrees, swap `%APPDATA%/playground/config.json` (back up the real one!), `npx electron-vite dev -- --remote-debugging-port=9222`, run `scripts/smoke-*.mjs`, restore config. Tip: after seeding mid-session, click the top-bar refresh (`.topbar-icon-btn`) before driving sidebar rows
