# Handoff

**Date:** 2026-06-12
**Feature:** board-direction (M4, first feature) — COMPLETE; BORD-01..04 Verified.

## Completed ✓

- Resumed after PR #16 merge (M3 closed); spec → user review ("go ahead") → execute on `feature/board-direction` (Medium scope: no design/tasks docs)
- `BoardView` component family replaces the App.tsx board placeholder (renderer-only, no new IPC, no new pure logic): §2 chip strip (state dot + `#id` + title + worktree count badge; "details unavailable" degradation keeps the chip clickable), workspace→repo-grouped card grid (cards reuse the STWK four-state task block; footer = 3 launcher buttons via `shortcuts:launch` + repo name), chip highlight/dim/banner (transient state inside `BoardView` — unmount on direction switch clears it; unpinning the active task clears via derived `activeId`), inline strip pin input (prototype's stubbed "Pin task" made real over `tasks:pin`; Enter pins, Esc/blur-empty collapses, error keeps it open)
- Verified: typecheck/lint/90 Vitest green (no new units by design); CDP smoke 10/10 (`scripts/smoke-board.mjs`) vs live ADO work item; screenshot fidelity pass vs `.dc.html` §2 (dark, dark+highlight, light)

## In Progress

- PR `feature/board-direction` → main (open after this checkpoint)

## Pending

- After PR merges: specify M4 **Per-Workspace Config** (final feature) — `.app/` directory branch-template override + settings UI for default org/project + global template (PRD §Persistence, story 20; roadmap M4)

## Blockers

- None

## Context

- Branch: `feature/board-direction`
- Uncommitted: none after docs checkpoint commit
- Related decisions: spec §Decisions (inline strip pin input ⚠️ approved; chip degradation ⚠️ approved; highlight matches by extracted ID only; no card selection/lifecycle from Board in v1 — launchers only, per prototype)
- Smoke runbook (same as start-work): seed config = one workspace with a clean temp git repo, no pins; app via `npm run dev -- -- --remote-debugging-port=9222`; work item URL from `SMOKE_TASK_URL` (kept local; rediscoverable via azure-devops MCP `wit_my_work_items` — org triadesolucoes, project MultiClubes). Re-runs need `git branch -D feature/<id>-board-smoke` in the seed repo (worktree removal keeps the branch — its collision error is the spec edge case working)
- Board screenshots were captured with a throwaway CDP script (pin+worktree staging → Board → dark/highlight/light PNGs); `scripts/smoke-screenshot.mjs` remains start-work-specific
