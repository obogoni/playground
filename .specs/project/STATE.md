# State

**Last Updated:** 2026-06-11
**Current Work:** pinned-tasks-pane (M3, first feature) COMPLETE on `feature/pinned-tasks-pane` — PNTK-01..05 Verified (76 Vitest + 11/11 CDP smoke vs live ADO + auth-failure pass). Next: PR → main, then specify M3 "Start Work from Task"

---

## Recent Decisions (Last 60 days)

### AD-001: PRD issue #1 and design handoff are the dual sources of truth (2026-06-11)

**Decision:** GitHub issue #1 governs behavior/architecture; `design_handoff_worktree_manager/` (README + `Worktree Manager.dc.html`) governs visual fidelity. The `.dc.html` prototype is reference-only, never shipped.
**Reason:** Both artifacts are explicit and detailed; duplicating them into specs would drift.
**Trade-off:** Feature specs stay thinner and reference these artifacts instead of restating them.
**Impact:** Every feature spec links back to PRD user-story numbers and handoff sections.

### AD-002: Roadmap follows the PRD's suggested slice ordering (2026-06-11)

**Decision:** Four milestones — M1 skeleton+sidebar+shortcuts, M2 worktree lifecycle, M3 ADO tasks+start-work, M4 board view+config — matching the PRD's 7-slice ordering.
**Reason:** PRD explicitly notes the app is daily-usable after slice 3 (end of M1); honoring that maximizes early value.
**Trade-off:** ADO integration (the headline feature) lands third, not first.
**Impact:** M1 must ship a polished tree+detail UI since it's used daily before ADO exists.

### AD-003: Skeleton toolchain choices (2026-06-11)

**Decision:** electron-vite 5 via @quick-start/create-electron 1.0.30 template (Electron 39 as pinned by template, React 19, TS 5.9, Vitest 4); JSON config (`%APPDATA%/playground/config.json`); @fontsource for self-hosted fonts; theme via `data-theme` attr.
**Reason:** Template-pinned majors over bleeding edge (registry had Electron 42/TS 6) — stability of a known-good combination.
**Trade-off:** Not on latest Electron; upgrade later if a feature needs it.
**Impact:** `src/shared/ipc-contract.ts` is the IPC growth point; `ConfigStore` takes an injected dir (Electron-free, testable). New features: add channel to contract + `handle()` in main.

---

## Active Blockers

(none)

---

## Lessons Learned

- **LF must be enforced by the repo, not the clone (2026-06-11):** a fast-forward pull with global `core.autocrlf=true` rewrote the whole working tree as CRLF, exploding `npm run lint` (1781 prettier warnings) on a cold eslint cache. Fixed with `.gitattributes` (`* text=auto eol=lf`) + working-tree renormalization. Gates that rely on `eslint --cache` can hide debt — new lint errors surfaced only when the cache went cold.

---

## Quick Tasks Completed

| #   | Description | Date | Commit | Status |
| --- | ----------- | ---- | ------ | ------ |

---

## Deferred Ideas

- [ ] All v2 items tracked in PRD "Out of Scope" (terminal hosting, agent management, ADO writes, query feeds) — Captured during: project init

---

## Todos

- [x] workspace-sidebar-tree: specified, designed, executed (T1–T8), verified — TREE-01..06 all Verified (PR #11 merged)
- [x] Specify Launch Shortcuts (`.specs/features/launch-shortcuts/spec.md`, LNCH-01..05)
- [x] Execute Launch Shortcuts: `ShortcutLauncher` + IPC + open-with cards + failure toast — LNCH-01..05 Verified (8/8 CDP smoke)
- [x] Open PR `feature/launch-shortcuts` → main (PR #12, merged 2026-06-11)
- [x] Specify M2 "Create Worktree (taskless)" (`.specs/features/create-worktree/spec.md`, CRWT-01..04)
- [x] Execute create-worktree: `WorktreeManager.create`/`pathFor` + tests, `worktrees:create` IPC, dialog + repo-row "+" entry, refresh+select — CRWT-01..04 Verified
- [x] Entry-point decision (hover "+" on repo rows) approved by user with the spec ("go ahead")
- [x] Open PR `feature/create-worktree` → main (PR #13, merged 2026-06-11)
- [x] Specify M2 "Delete Worktree (guarded)" (`.specs/features/delete-worktree/spec.md`, DLWT-01..04)
- [x] Execute delete-worktree: guarded `removeWorktree` + tests, `worktrees:remove` IPC, §1b Danger section, refresh+reselect-primary — DLWT-01..04 Verified
- [x] Open PR `feature/delete-worktree` → main (PR #14, merged 2026-06-11)
- [x] Specify M3 "Pinned Tasks Pane" (`.specs/features/pinned-tasks-pane/spec.md`, PNTK-01..05)
- [x] User approved pinned-tasks-pane spec decisions ("go ahead": unpin ✕ on hover; bare-ID requires hand-edited config defaults until M4)
- [x] Execute pinned-tasks-pane: `AdoGateway` + `TaskBoard` + `tasks:*` IPC + §1c pane + az-login empty state + focus/manual refresh — PNTK-01..05 Verified
- [ ] Open PR `feature/pinned-tasks-pane` → main; after merge, specify M3 "Start Work from Task"

---

## Preferences

**Model Guidance Shown:** never
