# Handoff

**Date:** 2026-06-11
**Feature:** workspace-sidebar-tree (M1)
**Task:** Spec drafted — awaiting user review before Design phase

## Completed ✓

- New branch `feature/workspace-sidebar-tree` created from `feature/project-setup` (main is still pre-skeleton; PR for project-setup not yet merged)
- Spec written: `.specs/features/workspace-sidebar-tree/spec.md` — 6 requirements (TREE-01..06), grounded in PRD stories 1–4/16/20 and handoff §1a/§1b

## In Progress

- Spec review gate — user has not yet approved the spec

## Pending

- Design phase: WorkspaceRegistry, RepoScanner, WorktreeManager.list (list-only in M1), IPC channels in `src/shared/ipc-contract.ts`, Sidebar + Detail components
- Tasks breakdown, then execute
- Then: Launch Shortcuts feature (completes M1)

## Blockers

- None

## Context

- Branch: `feature/workspace-sidebar-tree` (based on `feature/project-setup`)
- Uncommitted: none after spec checkpoint commit
- Related decisions: AD-001 (PRD + design handoff are sources of truth), AD-002 (milestone ordering), AD-003 (toolchain; `src/shared/ipc-contract.ts` is the IPC growth point, ConfigStore pattern = injected dir, Electron-free)
