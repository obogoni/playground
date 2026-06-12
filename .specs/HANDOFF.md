# Handoff

**Date:** 2026-06-12
**Feature:** start-work-from-task (M3, final feature) — COMPLETE; STWK-01..05 Verified.

## Completed ✓

- Resumed from PR #15 merge (`9889df6`); spec → user review ("go ahead") → execute on `feature/start-work-from-task` (Medium scope: no design/tasks docs)
- Shared pure core (`src/shared/tasks.ts`): `branchNameFor` ({type}/{id}-{slug}; Bug→bugfix else feature; slug lowercase + non-alnum runs→`-`; empty slug trims dangling segment separators; blank template falls back) and `taskIdFromBranch` (first 2+-digit run not adjacent to letters/digits — `oauth2`/sha-likes never tag); config grows `ado.branchTemplate` (ConfigStore default-merge covers existing files)
- No new IPC: start-work reuses `worktrees:create`; §1b card is a plain `<a target="_blank">` (setWindowOpenHandler → shell.openExternal already in place)
- UI: `StartWorkDialog` (§3, NewWorktreeDialog chassis; helpers extracted to `lib/repo-options.ts` for react-refresh); sidebar §1a tag line (pill+#id+title+state dot; `#id — not pinned` third state; `details unavailable` degradation); §1c card footer (count spans all workspaces via `countWorktreesByTask`, primary "Start work"/ghost "New branch", disabled when details null); §1b linked-task card; pill helpers moved to `lib/task-pills.ts`
- Verified: typecheck/lint/90 Vitest green (14 new in `src/shared/tasks.test.ts`); CDP smoke 12/12 (`scripts/smoke-start-work.mjs`) vs a live ADO work item (via `SMOKE_TASK_URL`); screenshot fidelity pass (§3 dialog + linked 3-pane view) vs `.dc.html`

## In Progress

- PR #16 `feature/start-work-from-task` → main open, awaiting review/merge

## Pending

- After PR merges: M3 done. Specify M4 **Board Direction** (pinned-task chip strip + workspace/repo-grouped worktree card grid, chip highlight/dim, per-card launchers, direction persistence — handoff §2) or **Per-Workspace Config** (`.app/` branch template override + settings UI for org/project/template)

## Blockers

- None

## Context

- Branch: `feature/start-work-from-task`
- Uncommitted: none after docs checkpoint commit
- Related decisions: spec §Decisions (extraction boundary rule ⚠️ approved; `#id — not pinned` third state ⚠️ approved; Start-work disabled without details ⚠️ approved; pure linking logic in `src/shared` per `sanitizeBranch` precedent; counts/joins renderer-side off the existing TasksSnapshot — no new fetch path)
- Smoke runbook: seed config now needs one workspace containing a clean temp git repo (script registers nothing itself); re-runs need a fresh repo or `git branch -D` of the templated branch — `git worktree remove` keeps the branch, and the collision surfaces as the dialog's inline error (that's the spec's edge case working)
- `scripts/smoke-screenshot.mjs` re-stages pin+worktree and captures §3 dialog + linked view PNGs for fidelity passes (not part of the gate)
- Live ADO work item URL comes from `SMOKE_TASK_URL` env var (kept local, never committed); az login active on this machine; a valid URL can be rediscovered via the azure-devops MCP (`wit_my_work_items`)
