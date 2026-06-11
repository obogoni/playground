# Handoff

**Date:** 2026-06-11
**Feature:** launch-shortcuts (M1, final feature) — COMPLETE; **M1 milestone done, app is daily-usable**

## Completed ✓

- Spec → execute on branch `feature/launch-shortcuts` (Medium scope: no design/tasks docs); LNCH-01..05 all Verified
- `ShortcutLauncher` (main): explorer.exe / wt.exe -d detached spawns with ENOENT detection; `code` via shell (.cmd shim) with exit-code check; missing-path pre-check with readable error. One typed IPC channel `shortcuts:launch`
- UI: "Open with" §1b card grid in `WorktreeDetail` (tinted tiles, labels, mono commands, hover lift) + transient bottom-center `Toast` (failures only, 2.2s)
- Repo hygiene unblocked along the way: `.gitattributes` LF enforcement + tree renormalization; eslint ignores for the design handoff bundle; `.mjs` return-type rule off; `WorktreeDetail` keyed from `App` (react-hooks error fix)
- Verified: typecheck/lint/29 Vitest green; CDP smoke 8/8 (`scripts/smoke-shortcuts.mjs`); screenshot fidelity pass vs `.dc.html`

## In Progress

- PR `feature/launch-shortcuts` → main being opened (last step of this session)

## Pending

- After PR merges: specify first M2 feature **Create Worktree (taskless)** (dialog: repo picker, base branch, branch name, live path preview; `WorktreeManager.create` with flat-sibling placement + sanitization per PRD)

## Blockers

- None

## Context

- Branch: `feature/launch-shortcuts` (from main @ `ca8b40f`, PR #11 merge)
- Uncommitted: none after docs checkpoint commit
- Related decisions: AD-001..003; new Lesson Learned in STATE.md re: LF/`.gitattributes` and cold eslint caches
- Smoke runbook: seed temp workspace + repo/worktrees, swap `%APPDATA%/playground/config.json` (back up the real one!), `npx electron-vite dev -- --remote-debugging-port=9222`, run `scripts/smoke-*.mjs`, restore config
