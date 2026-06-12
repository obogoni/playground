# Handoff

**Date:** 2026-06-12
**Feature:** per-workspace-config (M4, final feature) — COMPLETE; PWCF-01..04 Verified.

## Completed ✓

- Resumed after PR #26 merge; spec → user approval (gear-button settings dialog; repo-switch re-render until edited) → execute on `feature/per-workspace-config` (Medium scope: no design/tasks docs)
- `workspaceBranchTemplate` reader (`src/main/workspace-config.ts`, 9 unit tests with real temp dirs) + `workspaces:branch-template` IPC: `<workspace>/.app/config.json` override, read fresh on every call, silent fallback on missing/blank/non-string/malformed
- Start-work dialog applies the effective template (override ?? global); prefill re-renders on repo switch only while the branch field is untouched (`branchEdited` ref) — manual edit sticky forever (PRD story 11); `RepoOption` gained `workspacePath`
- `SettingsDialog` (gear in top bar, dialog chassis): default org/project + global branch template; save via `config:patch` (empty org/project → null), Esc/cancel discards; App refreshes `adoOrg`/`branchTemplate` from the patch response; stale "hand-edited until M4" comment in `shared/config.ts` updated
- Verified: typecheck/lint/99 Vitest green; CDP smoke 11/11 (`scripts/smoke-config.mjs`) vs live ADO work item 20800

## In Progress

- PR `feature/per-workspace-config` → main (opening as the last step of this session)

## Pending

- After PR merges: **v1 roadmap is complete** (M1–M4). No next feature planned; v2 candidates live in PRD "Out of Scope" and STATE.md Deferred Ideas

## Blockers

- None

## Context

- Branch: `feature/per-workspace-config`
- Uncommitted: none after docs checkpoint commit
- Related decisions: spec §Decisions (settings UI invented — no handoff section, gear+modal approved ⚠️; re-render-until-edited approved ⚠️; override read on use, never cached; settings UI edits global only — `.app/` stays hand-authored)
- Smoke runbook (config flavor): back up `%APPDATA%/playground/config.json` to `.smokebak`, seed two temp workspaces (wsA/alpha, wsB/beta + `.app/config.json` with `task/{id}-{slug}`), no ado defaults, no pins; app via `npm run dev -- -- --remote-debugging-port=9222`; `SMOKE_TASK_URL` from azure-devops MCP `wit_my_work_items` (org triadesolucoes, project MultiClubes; used 20800). No worktrees are created — re-runs need no git cleanup. Restore config + delete temp dirs afterwards
- Deferred: bare-ID pin guidance message still says "set ado.defaultOrg…in config.json" — could point at the settings dialog (STATE.md Deferred Ideas)
