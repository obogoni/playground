# Handoff

**Date:** 2026-06-11
**Feature:** create-worktree (M2, first feature) — COMPLETE; CRWT-01..04 Verified

## Completed ✓

- Spec → execute on branch `feature/create-worktree` (Medium scope: no design/tasks docs)
- `sanitizeBranch`/`worktreePathFor` in `src/shared/worktrees.ts` (shared so renderer preview and main-process create can't drift); `createWorktree` in `worktree-manager.ts` (`-b <branch> <base>` or existing-branch form, path-exists pre-check, git stderr first line as error); `worktrees:create` IPC channel
- UI: `NewWorktreeDialog` per handoff §3 (taskless "NEW WORKTREE" header, inline footer errors, busy-guarded Create), hover "+" on sidebar repo rows (user-approved entry point), App refresh+select of the new worktree (no auto-open)
- Verified: typecheck/lint/45 Vitest green (16 new cases on real temp git repos); CDP smoke 10/10 (`scripts/smoke-create.mjs`); dialog screenshot fidelity pass vs `.dc.html`

## In Progress

- PR #13 `feature/create-worktree` → main open, awaiting review/merge

## Pending

- After PR merges: specify second M2 feature **Delete Worktree (guarded)** (`WorktreeManager.remove` with dirty/primary-checkout refusal; Danger section in detail pane with disabled-look + inline reason, per handoff §1b/§Interactions)

## Blockers

- None

## Context

- Branch: `feature/create-worktree` (from main @ `bf40da2`, PR #12 merge)
- Uncommitted: none after docs checkpoint commit
- Related decisions: AD-001..003; spec §Decisions (entry point, taskless header, base-branch fallback, inline errors)
- Smoke runbook: seed temp workspace + repo/worktrees, swap `%APPDATA%/playground/config.json` (back up the real one!), `npx electron-vite dev -- --remote-debugging-port=9222`, run `scripts/smoke-*.mjs`, restore config. Note: first smoke run right after app start can race the renderer load — re-run once the app settles
