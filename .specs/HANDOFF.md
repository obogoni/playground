# Handoff

**Date:** 2026-06-11
**Feature:** pinned-tasks-pane (M3, first feature) — COMPLETE; PNTK-01..05 Verified.

## Completed ✓

- Resumed from PR #14 merge (`b36183d`); spec → user review ("go ahead") → execute on `feature/pinned-tasks-pane` (Medium scope: no design/tasks docs)
- `AdoGateway` (`ado-gateway.ts`): az token via execFile+shell (az is a .cmd shim), cached to `expires_on`/`expiresOn` minus 2min; batch GET per org/project group with `errorPolicy=omit`; only token failures/401/403 are `auth` errors — network/404 leave items unresolved
- `TaskBoard` (`task-board.ts`): `parseTaskInput` (URL slugs/query/encoded names, bare IDs need `ado.defaultOrg/defaultProject`), validate-before-persist pin, duplicate guard, unpin, details cache replaced wholesale on refresh (deleted items degrade to id-only); 4 `tasks:*` IPC channels
- UI: `TasksPane` per §1c (no card footer — deferred to start-work), hover-✕ unpin, inline add-row errors, az-login prompt block + id-only cards; focus-debounced + manual refresh; top-bar sync status wired (`adoOrg ?? first pin's org`)
- Verified: typecheck/lint/76 Vitest green (23 new); CDP smoke 11/11 (`scripts/smoke-tasks.mjs`) vs a live ADO work item (via `SMOKE_TASK_URL`); auth-failure pass by relaunching with az stripped from PATH (NOT `az logout` — preserves the real session); screenshot fidelity pass vs `.dc.html`

## In Progress

- PR #15 `feature/pinned-tasks-pane` → main open, awaiting review/merge

## Pending

- After PR merges: specify M3 **Start Work from Task** (branch template `{type}/{id}-{slug}` rendering in `TaskBoard.branchNameFor`, `taskIdFromBranch` extraction, start-work dialog per handoff §3, task tags on sidebar rows, linked-task card in detail pane §1b, card footer worktree counts + Start work button in §1c)

## Blockers

- None

## Context

- Branch: `feature/pinned-tasks-pane`
- Uncommitted: none after docs checkpoint commit
- Related decisions: spec §Decisions (hover-✕ unpin ⚠️ approved; bare-ID needs hand-edited config defaults until M4 ⚠️ approved; auth prompt is a block above id-only cards, never hides pins; validate-before-persist)
- Live ADO work item for smoke comes from the `SMOKE_TASK_URL` env var (kept local, never committed); az login active on this machine
- Smoke runbook unchanged (seed config swap + `--remote-debugging-port=9222`), but `smoke-tasks.mjs` needs no seeded workspaces — minimal config with null ado defaults; script polls for `.tasks-pane` before driving (first run failed evaluating too early)
