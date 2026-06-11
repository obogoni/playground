# Handoff

**Date:** 2026-06-11
**Feature:** create-worktree (M2, first feature) — SPECIFIED, execute not started

## Completed ✓

- PR #12 (`feature/launch-shortcuts`) merged; main fast-forwarded to `bf40da2`; M1 closed out
- New branch `feature/create-worktree` from main
- Spec written: `.specs/features/create-worktree/spec.md` (CRWT-01..04, Medium scope — no design/tasks docs)
- Gray areas resolved in spec §Decisions: repo-row hover "+" entry point (⚠️ flag for user), taskless dialog header, always `-b` from dialog, inline dialog errors (not Toast)

## In Progress

- Nothing — clean checkpoint between Specify and Execute

## Pending

- Execute CRWT-01..04: extend `src/main/worktree-manager.ts` with `create`/`pathFor` + sanitization (Vitest on temp git repos per PRD §Testing Decisions), add `worktrees:create` to `ipc-contract.ts` + main handler, dialog component per handoff §3 (taskless header), repo-row "+" in `Sidebar.tsx`, refresh+select wiring in `App.tsx`
- CDP smoke per `scripts/smoke-shortcuts.mjs` pattern
- After this: second M2 feature "Delete Worktree (guarded)"

## Blockers

- None (one user-review flag: dialog entry point decision, spec §Decisions)

## Context

- Branch: `feature/create-worktree` (from main @ `bf40da2`)
- Uncommitted: none after spec checkpoint commit
- Related decisions: AD-001..003; spec §Decisions for this feature's gray areas
- Smoke runbook: seed temp workspace + repo/worktrees, swap `%APPDATA%/playground/config.json` (back up the real one!), `npx electron-vite dev -- --remote-debugging-port=9222`, run `scripts/smoke-*.mjs`, restore config
