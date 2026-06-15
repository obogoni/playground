# State

**Last Updated:** 2026-06-15
**Current Work:** release-cicd-autoupdate — **EXECUTED T1–T9** (9 atomic commits on `feature/release-cicd-autoupdate`); gate green (typecheck + lint + **125** tests, was 105 → +20). **T10 (manual end-to-end release check) is the only remaining task — user-run after merge, no commit.** Files: `scripts/release-version.ts`(+test), `scripts/stamp-version.ts`, `src/main/update-service.ts`(+test), `src/main/index.ts` wiring, `electron-builder.yml` (win-only/github), `dev-app-update.yml`, `.github/workflows/{release,nightly}.yml`, `electron-updater`+`tsx` deps, vitest include widened. (Prior: PRD #30 spec+design+tasks approved; per-workspace-config M4 merged; v1 roadmap done.)

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

- **electron-builder `-c.*` short overrides break under PowerShell (2026-06-15):** on
  windows-latest (pwsh default) `npx electron-builder ... -c.publish.channel=alpha` is misread
  as a config-file path (`ENOENT .publish.channel=alpha`). bash parses it correctly, so
  `nightly.yml`'s build step pins `shell: bash`. Long form `--config.x=y` also works in pwsh.
- **`gh release edit` has no `--generate-notes` (2026-06-15):** only `gh release create` does, and
  the REST update-release API ignores `generate_release_notes`. So `release.yml` calls the
  *generate-notes* API endpoint, writes the body to a file, then `gh release edit --draft=false
  --notes-file` to publish the electron-builder-created draft with auto notes.
- **electron-builder GitHub publisher always tags `v{version}` (2026-06-15):** it can't target a
  fixed reused tag, so the rolling-single nightly builds with `--publish never` and publishes the
  `nightly` tag via `gh` (SPEC_DEVIATION from the task's `--publish always`).
- **Packaged asar `package.json` keeps source `name` + no `productName` (2026-06-15):** so
  `app.getName()` returns `"playground"` in a packaged build; T6 AUMID is `com.${app.getName()}`.
  Whether nightly gets a channel-distinct identity/userData is unconfirmed — verify in T10; if it
  collides, add `productName`/`name` to source `package.json`. (Tip: `asar extract-file <archive>
  package.json` writes to CWD and silently overwrote the repo's `package.json` — restore via git.)
- **LF must be enforced by the repo, not the clone (2026-06-11):** a fast-forward pull with global `core.autocrlf=true` rewrote the whole working tree as CRLF, exploding `npm run lint` (1781 prettier warnings) on a cold eslint cache. Fixed with `.gitattributes` (`* text=auto eol=lf`) + working-tree renormalization. Gates that rely on `eslint --cache` can hide debt — new lint errors surfaced only when the cache went cold.

---

## Quick Tasks Completed

| #   | Description | Date | Commit | Status |
| --- | ----------- | ---- | ------ | ------ |

---

## Deferred Ideas

- [ ] All v2 items tracked in PRD "Out of Scope" (terminal hosting, agent management, ADO writes, query feeds) — Captured during: project init
- [x] Bare-ID pin guidance message (`task-board.ts`) now points at the Settings dialog instead of hand-editing `config.json` — resolved while addressing PR #27 review

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
- [x] Open PR `feature/pinned-tasks-pane` → main (PR #15, merged 2026-06-11)
- [x] Specify M3 "Start Work from Task" (`.specs/features/start-work-from-task/spec.md`, STWK-01..05) on `feature/start-work-from-task`
- [x] User approved STWK spec decisions ("go ahead": ID-extraction boundary rule; `#id — not pinned` third state; disabled Start-work when details unavailable)
- [x] Execute start-work-from-task: shared `branchNameFor`/`taskIdFromBranch` + StartWorkDialog + sidebar tags + card footer + linked-task card — STWK-01..05 Verified
- [x] Open PR `feature/start-work-from-task` → main (PR #16, merged 2026-06-12) — M3 done
- [x] Specify M4 "Board Direction" (`.specs/features/board-direction/spec.md`, BORD-01..04) on `feature/board-direction`
- [x] User approved board-direction spec decisions ("go ahead": inline strip pin input; chip "details unavailable" degradation)
- [x] Execute board-direction: `BoardView` (strip/chips/highlight/cards/inline pin) replacing the App.tsx placeholder — BORD-01..04 Verified
- [x] Open PR `feature/board-direction` → main (PR #26, merged 2026-06-12)
- [x] Specify M4 "Per-Workspace Config" (`.specs/features/per-workspace-config/spec.md`, PWCF-01..04) on `feature/per-workspace-config`
- [x] User approved PWCF spec decisions (gear-button settings dialog; repo-switch re-render until edited)
- [x] Execute per-workspace-config: `workspaceBranchTemplate` + `workspaces:branch-template` IPC + dialog override behavior + `SettingsDialog` — PWCF-01..04 Verified
- [ ] Open PR `feature/per-workspace-config` → main — closes the v1 roadmap
- [x] Specify + Design + Task release-cicd-autoupdate (PRD #30, RLCD-01..14)
- [x] Execute release-cicd-autoupdate T1–T9 (9 commits; 125 tests green) on `feature/release-cicd-autoupdate`
- [ ] **T10 manual end-to-end release check** (user-run): push throwaway `v0.0.1`/`v0.0.2`, install + observe silent auto-update; dispatch nightly twice, confirm side-by-side + single rolling pre-release; confirm stable never offered the nightly; clean up throwaway releases; record outcome here
- [ ] Open PR `feature/release-cicd-autoupdate` → main (body: `Closes #30`)

---

## Preferences

**Model Guidance Shown:** never
