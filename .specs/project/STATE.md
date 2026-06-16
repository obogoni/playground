# State

**Last Updated:** 2026-06-16
**Current Work:** **M5 AM2 "Agent Sessions" — PLANNED (spec + design + tasks done), ready to Execute.** AM1 spike merged (PR #39, 2026-06-16). Grounding: PRD #37 + `design/handoff/DESIGN_HANDOFF_AGENTS.md` + the AM1 plumbing now on `main` (`pty-port.ts`, `spawn-plan.ts`, AD-004 IPC maps, `TerminalPane.tsx`; throwaway = `sessions:spawn`/`sessions:kill` invoke channels + inline orchestrator, to be replaced by `SessionManager`). (Prior: AM1 agent spike.)

**Prior Current Work:** **M5 Agent Spike (AM1) — EXECUTED T1–T12** on `feature/agent-spike` (11 commits). The scary stack is **de-risked green**: `node-pty` (N-API prebuilds, no Electron-ABI rebuild needed) + AD-004 streaming IPC (`IpcEvents`/`IpcSends` + `on`/`send`) + `xterm.js` `TerminalPane`, **rebuilt + packaged**. The real Claude Code TUI spawns inside `pwsh` in both `dev` and the **packaged** `win-unpacked` build, streams to xterm, and accepts typed input (verified via `scripts/smoke-agent.mjs` CDP, 3/3); theme recolors live light/dark. electron-builder **auto-unpacked** node-pty — no explicit `asarUnpack` rule needed (design's flagged contingency did not bite). Gate: typecheck + lint (0 errors) + **142** tests (+5 spawn-plan) + `build:win`. Permanent plumbing (`buildSpawnPlan`/`PtyPort`/IPC maps+wrappers+bridge/`TerminalPane`/externalize config) is cleanly separated from the throwaway trigger + inline orchestrator (both annotated `AM1 spike — throwaway, replaced by SessionManager in AM2`). **Remaining:** open PR `feature/agent-spike` → main; then Specify AM2/AM3. (Prior: worktree-name-template)

**Prior Current Work:** worktree-name-template — **EXECUTED T1–T9** on `feature/worktree-name-template`; gate green (typecheck + lint + **137** tests, was 125 → +12). Worktree folder name is now a configurable template (`{repo}`/`{branch}`/`{id}`; default `{repo}-{branch}`), mirroring the branch template: global `ado.worktreeTemplate` (Settings dialog) + per-workspace `.app/config.json` `worktreeTemplate`. Empty render blocks create. Key shape changes: `worktreeNameFor`/templated `worktreePathFor` (`src/shared/worktrees.ts`); `workspaceBranchTemplate`→`workspaceTemplates` (both overrides, one read); IPC `workspaces:branch-template`→`workspaces:templates`; `worktrees:create` gains `worktreeTemplate?`. **Remaining:** open PR (body `Closes #<n>` once the feature issue exists). (Prior: release-cicd T1–T9 executed, T10 manual check pending + PR; v1 roadmap done.)

---

## Recent Decisions (Last 60 days)

### AD-001: PRD issue #1 and design handoff are the dual sources of truth (2026-06-11)

**Decision:** GitHub issue #1 governs behavior/architecture; `design/handoff/` (README + `Worktree Manager.dc.html`) governs visual fidelity. The `.dc.html` prototype is reference-only, never shipped.
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

### AD-004: Streaming IPC for agent sessions uses typed event + send maps (2026-06-15)

**Decision:** The agent-management feature (PRD #37) introduces the app's first streaming IPC. Rather than a new ad-hoc mechanism, extend the existing typed-contract approach with **two new maps beside `IpcContract`**: `IpcEvents` (main→renderer push — `session:data`, `session:exit`, `session:status`) and `IpcSends` (renderer→main fire-and-forget — `session:input`, `session:resize`). Add typed `on()` / `send()` wrappers as peers to the existing typed `handle()`, and expose `on` + `send` on the preload bridge alongside `invoke`. Control verbs (`sessions:spawn`/`:list`/`:stop`/`:respawn`/`:remove`/`:rename`/`:attach`/`:detach`) stay on the request/response `invoke`/`handle` contract; only the high-frequency PTY byte stream + keystrokes/resize use the push/fire-and-forget channels.

**Reason:** A PTY is a continuous bidirectional firehose — request/response can't model unsolicited output, and per-keystroke `invoke` round-trips are wasteful. Considered and rejected: a **single multiplexed channel** (`{id,type,payload}`) — loses strict per-channel typing, forcing manual union narrowing; and a **MessageChannel per session** — lowest overhead but real port lifecycle/teardown complexity, an over-fit for the throughput of a handful of agent terminals.

**Trade-off:** A little extra typing boilerplate (two map declarations + the `on`/`send` wrappers) versus the multiplexed option's fewer channel names — accepted to keep the codebase's strict per-channel type safety.

**Impact:** `src/shared/ipc-contract.ts` gains `IpcEvents`/`IpcSends` next to `IpcContract`; preload exposes `on`/`send`; main adds typed `on`/`send` helpers beside `handle()`. Per-session scrollback replay rides on `sessions:attach` (replay ring-buffer, then stream) / `sessions:detach` (stop streaming, PTY keeps running). To be promoted to a standalone ADR when `docs/adr/` is established.

---

## Active Blockers

(none)

---

## Lessons Learned

- **node-pty 1.1.0 ships N-API prebuilds — no Electron-ABI rebuild needed (2026-06-16, AM1):**
  node-pty 1.1.0 is built on N-API (node-addon-api), so its bundled
  `prebuilds/win32-x64/{pty,conpty,conpty_console_list}.node` are ABI-stable across Node *and*
  Electron — they load unchanged under both. Its loader (`lib/utils.js`) probes `build/Release`,
  `build/Debug`, then `prebuilds/<platform>-<arch>`. The packaged app loads from the prebuilds.
  Consequence: the `postinstall: electron-builder install-app-deps` source rebuild is *unnecessary*
  for node-pty and is the only thing that forces a native compile (and fails without a real
  Python — see next lesson). `build:win` does **not** run postinstall, so packaging just reuses
  the prebuilds (`npmRebuild: false` already skips the package-time rebuild).
- **node-pty source rebuild needs real Python + cmd current-dir exec (2026-06-16, AM1):** if a
  source rebuild *is* forced (`install-app-deps`), node-gyp needs a real Python (the Microsoft
  Store `python.exe` stub fails; this machine has none on PATH — used Azure CLI's bundled
  `C:\Program Files\Microsoft SDKs\Azure\CLI2\python.exe` via `$env:PYTHON`). It then fails again
  inside winpty's `winpty.gyp` (`cmd /c "cd shared && GetCommitHash.bat"`) when the process env has
  `NoDefaultCurrentDirectoryInExePath=1` (set in this shell) — cmd refuses to run a `.bat` from the
  current directory ("not recognized"). Clearing that env var lets it build. Both are moot when
  relying on the prebuilds (previous lesson).
- **electron-builder auto-unpacks node-pty — no explicit `asarUnpack` needed (2026-06-16, AM1 / ASPK-05):**
  the design flagged `asarUnpack: node_modules/node-pty/**` as a likely contingency; it was **not**
  required. `electron-builder` smart-detection put the native module under
  `dist/win-unpacked/resources/app.asar.unpacked/node_modules/node-pty/` (prebuilds `.node` +
  `winpty.dll`/`winpty-agent.exe` + conpty `.dll`/`OpenConsole.exe`), and the **packaged** app loads
  and runs the Claude PTY identically to `dev` (verified by `scripts/smoke-agent.mjs` against
  `win-unpacked` on a CDP port — 3/3 checks, the real Claude banner rendered + keystrokes round-trip).
  The whole AM1 scary stack (native module + AD-004 streaming IPC + xterm, rebuilt + packaged) is
  **de-risked green**. Note: tested `win-unpacked` (byte-identical asar+unpacked layout to the NSIS
  install, just not copied to Program Files); a full Program-Files install was not run to avoid the
  invasive registry/shortcut side effects — loading a `.node` needs read+execute, not write, so the
  read-only-location concern does not change the outcome.
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

- [ ] **Agent-activity notifications (v3)** — desktop/in-app alerts on agent-specific events (e.g. "claude finished", "agent is awaiting input"). Pairs with the v3 task→agent auto-briefing. Technical hook: AD-004's PTY target is shell-hosted (the shell auto-runs the agent), so "the agent specifically finished" is not directly observable — completion must be inferred from output patterns or by wrapping the command with a sentinel. Captured during: agent-management grill (PRD #37).
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
- [x] Open PR `feature/per-workspace-config` → main (PR #27, merged 2026-06-12) — closed the v1 roadmap
- [x] Specify + Design + Task release-cicd-autoupdate (PRD #30, RLCD-01..14)
- [x] Execute release-cicd-autoupdate T1–T9 (9 commits; 125 tests green) on `feature/release-cicd-autoupdate`
- [ ] **T10 manual end-to-end release check** (user-run): push throwaway `v0.0.1`/`v0.0.2`, install + observe silent auto-update; dispatch nightly twice, confirm side-by-side + single rolling pre-release; confirm stable never offered the nightly; clean up throwaway releases; record outcome here
- [x] Open PR `feature/release-cicd-autoupdate` → main (PR #33, merged 2026-06-15)
- [x] Specify + Execute worktree-name-template (WTNT-01..04) on `feature/worktree-name-template` — global `ado.worktreeTemplate` + `.app/` `worktreeTemplate` override, `{repo}`/`{branch}`/`{id}` placeholders, empty-render guard; gate green (137 tests)
- [x] Open PR `feature/worktree-name-template` → main (PR #35, merged 2026-06-15)
- [x] Structure M5 from PRD #37: added ROADMAP **M5 — Embedded Agent Sessions** (AM1 Agent Spike / AM2 Agent Sessions / AM3 Agent Config); user approved umbrella-PRD → 3-specs split, start with AM1
- [x] Specify M5 AM1 "Agent Spike" (`.specs/features/agent-spike/spec.md`, ASPK-01..06) — de-risk `node-pty` + `xterm.js` + AD-004 streaming IPC, rebuilt + **packaged**; pure seam = spawn-plan builder; rest hand-verified
- [x] User approved AM1 spec flagged decisions ("go ahead": throwaway dev trigger + permanent `TerminalPane`; hard-coded agent = Claude, one fixed cwd)
- [x] Design AM1 (`.specs/features/agent-spike/design.md`) — researched the two de-risk unknowns: (1) electron-vite empty `main:{}` would **bundle** node-pty and break → must add `externalizeDepsPlugin()` to main; (2) electron-builder auto-unpacks native modules but has honored-rule bugs → explicit `asarUnpack: node_modules/node-pty/**` is the contingency. Components: `buildSpawnPlan` (pure, tested) · `PtyPort` (node-pty shell) · streaming IPC `IpcEvents`/`IpcSends` + `on`/`send` (AD-004) · `TerminalPane` (xterm) · throwaway trigger+orchestrator (no config schema change)
- [x] User approved AM1 design ("go ahead to break down")
- [x] Tasks AM1 (`.specs/features/agent-spike/tasks.md`) — 12 tasks, 6 phases; only T2 (buildSpawnPlan) is unit-tested, rest `none` (hand-verified OS/IPC/renderer per TESTING.md); all 3 validation tables green. De-risk deliverable = T11 (`build:win` packaged run)
- [x] **Execute AM1 (T1–T12)** on `feature/agent-spike` — ASPK-01..06 all Verified; gate green (142 tests + `build:win`); de-risk findings recorded as STATE.md Lessons (N-API prebuilds; auto-unpack sufficed)
- [x] Open PR `feature/agent-spike` → main (PR #39, merged 2026-06-16)
- [x] **Specify AM2 "Agent Sessions"** (`.specs/features/agent-sessions/spec.md`, AGSN-01..09) — user approved (all 5 entry points; fixed seeded agents Claude/Copilot/Codex, pwsh; ad-hoc/Settings/default-shell/rename/duplicate/concurrency-warn/full-ANSI deferred to AM3)
- [x] **Design AM2** (`.specs/features/agent-sessions/design.md`) — promote-don't-rewrite: delete AM1 throwaway, reuse `PtyPort`/`buildSpawnPlan`/`emit`/`onSend`/`TerminalPane`. New: `SessionManager` (DI'd Map orchestrator, tested w/ mocks like `TaskBoard`) + `SessionRingBuffer` (pure, tested) + `src/shared/agents.ts`. Control IPC set replaces `sessions:spawn`/`:kill`; `session:status` added. **Key call: agent-exit (amber) sub-status DEFERRED to AM3** (user call) — otherwise invisible without a sentinel; AM2 status = running (shell alive) / stopped (shell exited) / path-missing, so `buildSpawnPlan` is reused unchanged. Only the attached session streams; replay rides the data channel; xterm stays the input surface. Design approved.
- [x] **Tasks AM2** (`.specs/features/agent-sessions/tasks.md`) — 14 tasks, 6 phases; only T1 `SessionRingBuffer` (+6) + T4 `SessionManager` (+10) unit-tested → 142→158, rest `none` (shared types via typecheck; thin index.ts wiring + renderer hand-verified per TESTING.md). All 3 validation tables green. Integration deliverable = T10 (first dev run, hand-verify AGSN-01..05); P6 = the 4 contextual entry points. Awaiting approval to Execute.
- [ ] Specify AM3 "Agent Config & Integration" (after AM2)

---

## Preferences

**Model Guidance Shown:** never
