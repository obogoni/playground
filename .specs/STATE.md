# Project State

Project memory for the ADO Task & Worktree Manager. Decisions log (AD-NNN) +
Handoff snapshot.

## Decisions

| ID     | Date       | Decision | Rationale |
| ------ | ---------- | -------- | --------- |
| AD-001 | 2026-06-28 | A technical-debt remediation batch was opened from a repo audit. Five items registered as features and attacked in sequence: `ci-pr-gate` (#1) → `agent-form-stable-key` (#2) → `app-hooks-extraction` (#3) → `ado-fetch-timeout` (#9) → `coverage-reporting` (#12). | Audit found localized, actionable debt; sequencing front-loads the safety net (CI gate) before the behavioral fixes and refactor. |
| AD-002 | 2026-06-28 | ~~The PR quality gate (`ci-pr-gate`) runs on **ubuntu-latest**.~~ **REVERSED by AD-005.** | The gate only runs typecheck/lint/test; unit tests were assumed OS-independent. The assumption was wrong (see AD-005). |
| AD-003 | 2026-06-28 | Test coverage (`coverage-reporting`) is **report-only** — `@vitest/coverage-v8` + a `test:coverage` script, printed in CI, with **no failing threshold gate**. | Establish a baseline first; a blocking threshold can be layered on later once the real coverage numbers are known. |
| AD-004 | 2026-06-28 | The `App.tsx` god-component refactor (`app-hooks-extraction`) is **incremental** — extract `useSessions` + `useTree` now; `useTasks`/`useConfig` deferred. | Smaller, lower-risk PR; the renderer has no unit tests by convention, so the extracted hooks become the first testable seam. |
| AD-006 | 2026-07-03 | The **Workflows** epic (issue #56 PRD) is specified **milestone-by-milestone, WF1 first**. WF1 (headless-agent spike) is spec'd and will be executed before WF2–WF5 are spec'd. Also decided: ADO **child-task fetching** (net-new `$expand=Relations` gateway surface) is **in v1 scope** (lands in WF2). | The PRD itself calls WF1 a throwaway de-risk spike whose exact Claude Code flags are unverified; WF3/WF4 ACs depend entirely on what WF1 pins. Writing testable ACs for the agent step before the spike runs would fabricate outcomes. Child-task fetching doesn't exist today (`getWorkItems` is flat-fields only) but the "implement ticket" example (US 38) needs it. |
| AD-005 | 2026-06-28 | The PR gate runs on **windows-latest**, reversing AD-002. | First CI run (PR #57) failed: `worktree-manager.test.ts` asserts Windows backslash paths because the production code normalizes paths to backslashes — the app is Windows-only (only `--win` is ever built). The real-git suite is OS-coupled (`expected "/tmp/.../repo"` vs `received "\tmp\...\repo"`, plus `spawn git ENOENT`) and is green only on Windows. Making it OS-portable would be a large change to Windows-only code with no benefit. Matches release/nightly. |
| AD-007 | 2026-07-03 | The headless agent process is spawned **directly** — `shell:false`, argv array passed verbatim, child **stdin closed** (`stdio:['ignore','pipe','pipe']`). **NOT** via a shell, and **NOT** as a `.cmd` shim needing `shell:true` — this corrects the ".cmd shim" assumption in WF1's spec/design. Binds WF3's `agent-command-builder` / `agent-step-runner`. | WF1-T7 empirical finding (`claude` 2.1.199): the installed CLI is a native `.exe` (`~/.local/bin/claude.exe`). Under `shell:true` on Windows, cmd re-parses and corrupts inline JSON args (`--json-schema is not valid JSON: Unterminated string`), so `--json-schema`/`--mcp-config` must reach the exe **unquoted-by-a-shell**; a direct spawn keeps the argv intact and no config file is needed. Headless also blocks ~3s on stdin unless it is closed. Full evidence: `features/workflows-headless-agent-spike/findings.md`. |
| AD-010 | 2026-07-06 | **WF4 (Blocker + resume) scope pinned via 3 owner decisions + the design's pause architecture:** (1) **Engine auto-pauses + resumes** inside `ctx.agent` on a `blocked` agent result — the author writes no pause/resume code; `ctx.agent` resolves `done` after any number of guidance rounds, or the run cancels on abort. `ctx.ask({title,body})` is the standalone human-in-the-loop primitive that path reuses. (2) **`abort` → run ends `cancelled`** (reuse the terminal status; no new status). (3) **Native lifecycle toasts on block/finish/fail**, cancel silent (`ctx.notify({toast})` stays independent). **Architecture:** the block-loop lives in the DI'd `AgentStepRunner` via an injected `onBlocked` resolver (Approach A — keeps `ctx` thin, mirrors WF3); ONE manager-owned pause primitive (`runtime.requestInput` + `#pendingRespond`) funnels both `ctx.ask` and the agent `onBlocked`; `respond` **always** transitions `blocked→running` (resumed) and hands the decision to the caller — the `abort→cancelled` outcome is produced by the agent consumer throwing `CancellationError`, NOT a reducer edge (so the reducer adds only `blocked`/`resumed` + a `blocked→cancelled` guard for cancel-while-blocked). | Owner chose engine-driven auto-pause for "supervise by exception" (US 38) with zero author plumbing; `cancelled` reuse avoids widening `RunStatus` beyond `blocked`; toasts match US 22. Approach A matches the project's DI-orchestrator-tested-via-fakes convention and WF3's own Approach A. Spec/design/tasks: `.specs/features/workflows-blocker-resume/` (WF4-01..20). |
| AD-012 | 2026-07-06 | **WF5 gets a hi-fi rebuild slice (`workflows-ui-hifi`) that AMENDS AD-011.** The authoritative visual spec is `design/handoff/DESIGN_HANDOFF_WORKFLOWS.md` (hifi) — it was **missed during the original WF5 Design** (process error; the delivered timeline was low-fidelity). Two AD-011 decisions are **reversed** by the handoff: (1) a **failed run now shows a failed footer** with the failing call + `error/stdout/code` (was "status only"); (2) the **live event stream is enriched** (was "minimal"): steps gain a semantic `stepKind` + `stepId` + a `step-finished {durationMs}` event, agent steps carry `{prompt, permission}` on start and `{status, data, sessionId}` on finish, failures are broadcast, and a new `workflow:run-started {runId, workflowId, input, startedAt}` event seeds the header/INPUTS strip (also retiring WF5's `pendingWf` runId hack). AD-011 decision 3 (scaffold+reveal) stands. Scope: `.specs/features/workflows-ui-hifi/spec.md` — 24 ACs (WHF-01..24); WHF-01..10 backend/unit-tested, WHF-11..24 renderer/hand-verified. Same branch `feature/workflows-ui`. **Spec APPROVED; Design next (fresh session).** | The handoff is the source of truth for visual fidelity (PRD = behavior); the AD-011 options were chosen without it on the table. The hifi timeline (kind tags, durations, agent detail boxes, step detail boxes, failed footer) genuinely requires data the merged WF2/WF3 event surface never carried — so a backend enrichment (unit-tested) rides alongside the renderer rebuild. Lesson saved: always read `design/handoff/` before UI design. |
| AD-011 | 2026-07-06 | ~~**WF5 (Workflows UI) scope pinned via 3 owner decisions**~~ **(decisions 1 & 2 AMENDED by AD-012; decision 3 stands):** (1) **Run state is live-stream only** — the view accumulates `workflow:*` events in an always-App-mounted `useWorkflowRuns` hook (survives direction switches); NO read channel for persisted/past runs (v2). (2) **A failed run shows only its `failed` status** in the UI — `error`/`stdout`/`code` are captured server-side but not broadcast (deferred). (3) **"New workflow" = scaffold + reveal** via a NEW `workflows:scaffold` channel; the created folder is revealed **main-side** with `shell.showItemInFolder` (no editor coupling). **Architecture:** the fold logic is a pure, unit-tested `workflow-run-view.ts` (like `tree-selection`); only `workflow-run-view` + `workflow-scaffold` carry unit tests, the rest (view, dialogs, hook wiring, handler) is hand-verified per project UI convention. 10 tasks / 3 phases (inline). | Owner chose live-only to match the PRD's v1-ephemeral posture with zero backend; failure-detail broadcast is cheap-but-deferred; scaffold+reveal avoids editor coupling. The always-mounted hook is required so a WF4 `workflow:focus-run` toast restores a run's full timeline from any direction. Spec/design/tasks: `.specs/features/workflows-ui/` (WF5-01..25). |
| AD-009 | 2026-07-06 | **WF3 MERGED to `main` (PR #65).** Independent SDD eval (author≠judge, `spec-driven-eval`): **Final 0.98 — "Spec-complete"** (S=PASS, E recall/precision/justified ≈1.0, gates build/lint/unit green; live smoke owner-PASS 6/6). Two minor gaps merged as-is and **carried into WF4** (WF3-04 generic retry prompt; WF3-10 unasserted server reuse). **WF4 planning deferred to the next session.** | The two gaps are cheap polish on the same runner/`--resume` path WF4 already touches, so folding them into WF4 avoids a throwaway PR. Report: `.specs/features/workflows-agent-step/evaluations/P1-workflows-agent-step-20260706T141244Z.md`. |
| AD-008 | 2026-07-03 | **WF3 (Structured agent step) scope pinned via 4 owner decisions:** (1) **Arm M (MCP) only** — one shared loopback HTTP MCP server, per-step bearer token = auth+routing, forced `emit_result`; Arm N (`--json-schema`) dropped. (2) **ajv** for payload validation (promotes `emit-result-schema` off the spike's minimal checker; `expect` stays a JSON Schema). (3) `ctx.agent()` returns the **full envelope** `{status,data?,question?,sessionId}`; `blocked` is returned **as-is** (no engine pause in WF3 — that's WF4). (4) Permission presets **read/write/bypass**, default **read** (read = read-only tools + `emit_result`, guaranteed non-mutating). | Findings recommended Arm M to keep the `blocked` terminal value + per-step routing first-class for WF4; ajv because the author declares a JSON Schema and the tool `inputSchema` is JSON Schema too; full-envelope return lets WF4 add the pause without breaking the happy path; the preset set is PRD-fixed (US 26). Spec: `.specs/features/workflows-agent-step/spec.md` (WF3-01..25). |
| AD-013 | 2026-07-29 | **Worktree post-create hook (`worktree-post-create-hook`) scope pinned via 4 owner decisions + a decorator architecture:** (1) The command is declared **repo-locally** in a NEW `<repoPath>\.app\config.json` key `postCreateCommand` (mirrors the existing workspace-level `.app/config.json` reader one level down) — **not** in global settings, so it travels with the repo. (2) A failing hook **keeps the worktree**: `createWorktree` returns `ok:true` plus a `hook` failure payload (exit code + 4000-char output tail); no rollback. (3) The hook runs on **all three create paths** (New Worktree, Start Work, workflow `ctx.worktree.create`). (4) Feedback is **inline in the dialog on failure, silent on success**; the workflow run-timeline detail box is **P2/deferred**. **Architecture:** a `withPostCreateHook(create, deps)` **decorator** (Approach D) wraps `createWorktree` with an identical signature, wired **once** in `index.ts` and assigned to both the IPC handler and `ctxDeps.worktree.create` — so `worktree-manager.ts` (+ its ~40 real-git tests) and `workflow-ctx.ts` are **untouched**, and the run-iff-created rule (`ok && path`) is unit-testable against a fake create with no git and no spawn. The 120 s timeout's process kill stays in the hand-verified `index.ts` spawn seam; only its result *mapping* is unit-tested. | Repo-local won because the init script (`SetupSkills.cmd` in `m:\triade\source\Code`) is already checked in and resolves its own paths from `$PSScriptRoot` — the repo is what knows its init. Keeping the worktree matches the fact that `git worktree add` already succeeded; discarding a valid checkout (plus any base refresh / branch recut) over a fixable script error is the worse failure. All-three-paths because workflow-created worktrees for agents are the case that most needs the skills junctions. The decorator was chosen over a 7th positional param, a trailing options object, and a module-level setter because it is the only option that changes neither the real-git module nor the workflow ctx, and it avoids the parallel-test-hostile global state a setter would introduce. **Accepted trade-off, recorded not buried:** the command is repo content, so cloning an untrusted repo into a registered workspace means its `postCreateCommand` runs on the next create for that repo — no prompt, no allowlist in v1. Spec/design/tasks: `.specs/features/worktree-post-create-hook/` (WPC-01..24; 21 in the P1 slice, WPC-17..19 deferred). |
| AD-014 | 2026-07-30 | **Worktree removal is delete-first, project-wide.** The app deletes the worktree directory **itself** — `dir-remover.ts`'s `removeDirTree` (junction-safe, `maxRetries: 0` per attempt inside a 250 ms / 3000 ms deadline-bounded loop) — and only then calls `git worktree remove <path>` **purely to drop bookkeeping**. **No surface may use `git worktree remove --force` as a *deleter*** — not `WorktreeManager`, not `workflow-ctx`, not the deferred create-time cleanup. `force` keeps its FRWT meaning (**skip the dirty check only**) and never reaches git. The guard order is fixed at **primary → registered → locked → dirty → delete → bookkeeping**, and **every guard refuses before anything is deleted**; the registered check is also the anti-`rm -rf` guard and fails **closed** when git itself fails. **`git worktree lock` is checked by us**, from the porcelain `locked` line (a bare `locked` parses to `''`, which is still locked). **WRFT-07 (create-time leftover collision) is deferred to a follow-up PR** (owner decision at Tasks approval); this branch ships WRFT-01..06 plus the deleter and classification seams the follow-up lifts. | Two measured findings forced the inversion, one on each path. **(1) The success path destroyed data.** Git for Windows treats a directory junction as an ordinary directory and **recurses into it**, so `git worktree remove --force` emptied the shared *target* of AD-013's skills junctions and **reported success** — and because every hook-created worktree reads dirty (`?? .skills/`), the UI routed exactly those worktrees down the force path. Node's `fs.rm` lstats a junction as a link and **unlinks** it, leaving the target byte-identical (measured both ways). **(2) The failure path failed open.** Git deletes its bookkeeping even when the tree deletion fails — its own source comments *"continue on even if ret is non-zero, there's no going back from here"* — so one locked file left an **invisible orphan**: no `.git`, so `scanRepos` skips it, the row vanished on the next refresh, the folder later blocked recreating that worktree, and a retry answered `fatal: '<path>' is not a working tree`. Delete-first inverts that failure mode: git is never invoked, the worktree stays **registered**, and the still-visible row *is* the retry handle — which is also why no pending-cleanup persistence was needed. The lock guard has to be ours precisely because git's own refusal would arrive **after** we had already deleted the tree. WRFT-07 was deferred as P2 that rides on this branch's seams rather than blocking it. Spec/design/tasks: `.specs/features/worktree-removal-fault-tolerance/` (WRFT-01..07). |

| AD-015 | 2026-07-31 | **The post-create hook command can be declared OUTSIDE the repo, amending AD-013 decision 1 (which is extended, not reversed).** Three owner decisions: (1) the out-of-repo home is the existing **`<workspace>\.app\config.json`**, under a new `postCreateCommands` map **keyed by repo folder name** — not app-global settings, not a third config file; (2) **the repo still wins** — `<repo>\.app\config.json`'s `postCreateCommand` takes precedence and the workspace entry is the fallback, so WPC-01/WPC-06 keep holding verbatim and no existing behaviour changes; (3) **per-repo keys only** — no `"*"` default and no bare workspace-level string, so a newly cloned repo runs nothing until it is named. **Architecture:** a `resolvePostCreateCommand(repoPath)` composer in `repo-config.ts` wraps the two readers and is wired into `withPostCreateHook`'s `readCommand` — **the signature is unchanged**, because `scanRepos` only ever finds a repo as a *direct child* of its workspace (`repo-scanner.ts`), so the workspace is `dirname(repoPath)` and the key is `basename(repoPath)`. Derivation is purely **lexical**: no lookup against `AppConfig.workspaces`. Key matching is exact first, then a *unique* case-insensitive match (Windows folder names are case-insensitive, AD-005), with ≥2 variants and no exact match resolving to **no command plus one log** rather than an arbitrary winner. | The motivation is concrete: `m:\Triade\source\Code` is a shared team repo, so AD-013's in-repo file meant either a permanent `?? .app/` in `git status` or a PR into the team repo to record one developer's local automation. The workspace file already exists as a concept and is already hand-authored for `branchTemplate`/`worktreeTemplate`, so nothing new has to be discovered; app-global settings were rejected because they are per-machine, invisible to teammates and would need a settings-dialog surface to be editable at all. Repo-wins keeps the change additive — every pre-existing test passes unmodified. Per-repo keys were chosen over a workspace default because silently inheriting a command is the opposite of what moving the declaration out of the repo is for. Lexical derivation avoids coupling a pure file reader to app state, and it degrades safely: a `repoPath` that is not a workspace child simply finds no key. **Side benefit, recorded:** the workspace-level declaration does **not** carry AD-013's accepted untrusted-repo-content risk, because you author it yourself. Spec/validation: `.specs/features/worktree-hook-workspace-config/` (HWC-01..14). |
| AD-016 | 2026-08-28 | **A Visual Studio 2026 launcher ships alongside the 2022 one, and Visual Studio discovery becomes per-edition rather than per-install.** Four owner decisions: (1) 2026 launches **elevated**, mirroring VSAD's path exactly rather than introducing a non-elevated variant; (2) a **new `--pink` token** distinguishes it, because the board footer renders launchers as icon-only 15px buttons where two amber shields are indistinguishable; (3) both VS cards **always render**, install-agnostic, with a missing VS surfacing the existing toast; (4) the 2026 vswhere query is **GA-only** — no `-prerelease`. **Architecture:** a `VS_EDITIONS` map keyed by `ShortcutTool` gives each version its own vswhere range (`[17.0,18.0)` / `[18.0,19.0)`), passed as an **argument** through `resolveDevenv`/`openVisualStudio` rather than held as module state, and the three failure messages are templated off the edition label — which reproduces the 2022 wording character-for-character, so all six pre-existing VSAD tests pass with the test file byte-unmodified. | The ranges were **measured, not assumed**: VS 2026 reports catalog version `18.4.2` and installs under a *version-numbered* root (`\Microsoft Visual Studio\18\`), not a year-named one like 2022's `\2022\` — so nothing may key off the folder name and `productPath` is the only supported source. Disjoint ranges are what make coexistence deterministic instead of order-dependent; there is deliberately no shared "latest VS" resolution. `-prerelease` was rejected because on a machine with both stable and Insiders, `-latest -prerelease` can resolve Insiders and silently launch the wrong VS; an Insiders-only machine reporting "not installed" is the accepted trade-off. **Finding worth keeping:** the verification sensor caught that parameterizing a hard-coded value into a lookup table leaves the *wiring* untested — mutating `launch()` to send both VS tools to the 2022 edition left the whole suite green, meaning the 2026 card could have silently opened 2022. Fixed by asserting routing through the vanished-path guard, which returns before any spawn and so names the resolved edition without popping UAC. Spec/context/tasks/validation: `.specs/features/vs2026-admin-shortcut/` (VS26-01..05). |
| AD-017 | 2026-09-10 | **The `dev-alias-setting` feature ships only the settings field; the pre-existing `commitForm` `undoByte`-drop defect is deferred to a follow-up after PR #83 merges.** | `AgentDef.undoByte` exists only in PR #83 (`terminal-copy-undo-fixes`, open upstream) — the one-line preservation fix cannot compile against the `main` base (TS2353, measured). The branch stays clean and based on `main` per the fork workflow; the defect is recorded in the spec Out of Scope with the follow-up. |
| AD-018 | 2026-09-13 | **The rail's last-output preview is removed, retiring AGCF-08 AC-2 only.** `agents-rail-v2` RAIL-12 states that a session row renders the agent tile, name, short status, status dot and actions and **nothing else** — no worktree name, no branch line, no `lastOutput` tail. That directly supersedes AGCF-08 AC-2 ("a stopped card SHALL show up to 2 trailing lines of lastOutput"), which no longer describes any shipped surface. AGCF-08 **ACs 1, 3 and 4 stand unchanged** — they are `SessionManager` facts (a stopped session exposes the tail; respawn clears it; a restored session has none), still true and still covered by `src/main/session-manager.test.ts:332-353`. **`lastOutput` stays on `SessionView`** and on the IPC contract; nothing is removed from the data model. The smoke evidence is inverted rather than deleted: `scripts/smoke-agent-config.mjs` step 7 now asserts the data still exists AND that the rail renders zero preview elements. | Handoff §5 drops the preview from the rail, so a prior feature's spec would otherwise keep describing behaviour that no longer exists. Superseding one AC instead of the whole requirement keeps the three still-tested `SessionManager` guarantees intact. **Numbered 018 because `origin/main` already carries `AD-017` (`dev-alias-setting`, 2026-09-10)** — the reconciler `AD-017` sitting in the stash collides with it and must be renumbered independently, out of this feature's scope. |
| AD-019 | 2026-09-15 | **An agent session's activity comes from the agent's documented lifecycle hooks, never from reading its terminal.** For Claude Code (the only agent covered so far), the app appends `--settings <file>` to the launch. The file is regenerated per app launch with `type: "http"` hooks that POST each lifecycle event to a loopback endpoint in main. A per-session random token, passed as the env var `PLAYGROUND_ACTIVITY_TOKEN` and sent as `Authorization: Bearer`, is both authentication and routing (the AD-008 pattern). A pure state machine folds the events into `working` / `waiting` / `needs-approval` / `needs-input` / `error` / `compacting` / `exited` plus detail (running tool, subagent count, error type). The endpoint **always answers 2xx with an empty body**, so it never decides anything for the agent. Leaving `needs-approval`/`needs-input` is driven by the user's next real keystroke (mouse and focus reports excluded), because no hook fires between an approval and the approved tool's end. No activity state until the first event. Hooks disabled means today's `running`. `exited` finally delivers the `shell` sub-status that AM3 deferred for lack of a signal. Other agents get state only once each has a documented mechanism of its own. | Screen scraping was designed first and measured against three real recordings: it worked, but every marker it relied on (`esc to interrupt`, spinner glyphs, `❯`, the OSC 0 title glyphs) is undocumented UI, and the owner rejected it because Claude Code ships constantly. ConPTY forwarding a cell diff had already ruled out matching the raw PTY tail. The hook API is documented and versioned. `--settings` is per-session and merges with the user's hooks. HTTP hooks fail non-blocking when the app is unreachable. Env inheritance and `--settings` injection were verified with zero-token launches. Documented gaps accepted: `Stop` does not fire on Esc interrupts (a stale `working` until the next event or `idle_prompt`), and a `permission_prompt` notification lags ~6 s, which is why `PermissionRequest` (immediate, never fired for auto-approved calls) is used. Tests use documentation-shaped payloads, so no test spends tokens. `session-idle-notifications` builds on these states. Spec/design: `.specs/features/session-activity-status/`. |
| AD-020 | 2026-09-15 | **Claude Code does not deliver `SessionStart` to an `http` hook, so no app feature may depend on it.** Measured on 2.1.273 with zero-token probes: the same event, same session and same `--settings` file reached a `command` hook and not an `http` one, at launch **and** mid-session after `/clear`; a fresh session idle for 100 s produced no `idle_prompt` either, because the docs gate that on Claude having responded. Consequence for `session-activity-status`: a freshly spawned session holds **no activity** and renders the pre-feature `running` until its first turn, and `SessionEnd` with `reason` `clear`/`resume` maps to **`waiting`** (the CLI stays up at a fresh prompt and nothing else would correct it). The `SessionStart` mapping stays in the machine, documented as unreachable, for the day it is delivered. | The owner rejected the alternative: a `command` hook just for `SessionStart`. On Windows a shell-form command hook runs under Git Bash when installed and PowerShell otherwise, and the two disagree on how an environment variable is spelled, so the session token would reach the header on one machine and not the other — a per-machine behaviour difference in exchange for a state that is only wrong between opening an agent and speaking to it, which is exactly when the user is looking at the window. Second measured limitation from the same run, recorded here so it is not rediscovered: `contextBridge` freezes `window.api`, so a CDP smoke cannot instrument IPC call counts from the page. |
| AD-021 | 2026-09-16 | **Agent-session time tracking is owned by a main-process `TimeTracker`, and RAIL-12 is amended to allow a time counter on the session row.** The tracker is fed by an optional `SessionManager` lifecycle observer (`started` at the end of `#start`, `ended` in `#finalize` only when the session was running) and by `powerMonitor` suspend/resume; screen lock is deliberately not observed. Closed periods live in `userData/time-log.jsonl` (one versioned JSON line each, atomic rewrite on edit); open periods live in `userData/time-open.json`, heartbeated every 60 s and closed at their last-seen instant on the next start. Renderer totals and the weekly Hours report are pure functions over a `time:snapshot` (`time-totals`, `hours-report`, `hours-copy`). **RAIL-12 amendment:** a session row MAY render the session's `hh:mm:ss` time counter, and a group head row its `hh:mm` total; everything else RAIL-12 forbids on a row stays forbidden, and Pause time lives in the detail bar, not on the row. | Owner decisions Q6–Q24 of the `time-tracking` grilling: counting follows the terminal being alive, not agent activity, so the main process that owns PTY start/exit and power events is the only place that sees every boundary, and a single writer keeps the log consistent. The row counter is the everyday surface the owner asked for (Q10) and contradicts a shipped requirement, so the amendment is recorded rather than implied. **Numbered 021 because `develop` already carries AD-019 and AD-020** (`session-activity-status`, not yet on `main`). Spec/design/tasks: `.specs/features/time-tracking/` (TIME-01..49). |
| AD-022 | 2026-09-19 | **The Files direction is one epic, grilled once and specified slice by slice, on a stack of branches.** Six features: `status-bar` (prerequisite), then F1 `files-explore`, F2 `files-diff`, F3 `files-commits`, F4 `files-pr-ado`, F5 `files-pr-github`. `feature/status-bar` is cut from `main` and each slice from the one before; each reaches upstream as a PR marked "depends on" its predecessor and is rebased with `--onto origin/main` as that merges. While a slice is unexecuted, a later slice's needs are met by **amending the earlier plan** — F2's `AllChangesTab` takes its data by props (for F3), F4's pull-request model is provider-neutral (for F5) — never by a refactor task against verified code. **Numbered 022 because `develop` and PR #93 already carry AD-021**, so this table, cut from `main`, skips it. | One design tree caught the decisions that cross slices — one base per worktree, one inert renderer, one URL posture — that five separate grills would have answered five ways. AD-006 (the Workflows epic) specified milestone by milestone for the same reason. Stacking is the fork workflow's rule for dependent features, and each slice is useful on its own, so a stalled review blocks at most what sits above it. Plans: `.specs/features/{status-bar,files-explore,files-diff,files-commits,files-pr-ado,files-pr-github}/`. |
| AD-023 | 2026-09-19 | **Every git invocation goes through `src/main/git.ts`, and no surface reaches the network unless the user asks.** `status-bar` T1 extracts `git()` and `gitFailureLine()` from `worktree-manager.ts` into `git.ts` — `execFile`, `shell: false`, `windowsHide`, `GIT_TERMINAL_PROMPT=0`, an optional `timeoutMs` — and every later module (status bar, Files lists, diffs, commits) imports it; none spawns git itself. The status bar reads local refs only (`rev-list --left-right @{upstream}...HEAD`, and `FETCH_HEAD`'s mtime for staleness); fetch, pull, push, sync and publish run only on a click. Sync is `pull --ff-only` then `push`, the posture of the existing base refresh (WBR); execution added `--no-rebase` to the pull, because Git for Windows sets `pull.rebase=true` system-wide and that turned it into a rebase (`status-bar` STBR-17). | The guarantees that matter — no shell for quote safety, no credential prompt hanging the main process, a ceiling on a hung process — must not diverge between copies. Automatic fetching was rejected by the owner: with several repositories registered it would hit the network constantly and could raise a credential manager window unasked. `--ff-only` can refuse but can never produce a conflict or a merge commit. |
| AD-024 | 2026-09-19 | **The renderer never reads the filesystem.** Every file the Files direction shows is listed and read in main — `git ls-files` per expanded folder, `git show` for revisions, `readForView` for the disk — and every path the renderer sends is confined to the selected worktree by the lexical `resolveInside`. Binary files (a NUL in the first 8000 bytes, git's heuristic) and files above 1 MB are never sent to the renderer. Disk watching is one recursive `fs.watch` on the selected worktree **plus** watches on its git-dir `index` and `HEAD`, with the reaction — not the watch — scoped to open tabs and the current list. | Measured while designing F1: a linked worktree's git-dir is `<repo>/.git/worktrees/<name>`, outside the worktree, so a root-only watch never sees a commit or a `git add`. One confinement point in main is auditable; a renderer with filesystem access, in an app that also runs agents, is not. |
| AD-025 | 2026-09-19 | **Monaco is the app's read-only code and diff viewer.** Only `editor.api`, the Monarch basic-language contributions and `editor.worker` are loaded — no TypeScript, JSON, CSS or HTML language services — and the worker is a same-origin file, never a `blob:` URL, because the renderer CSP (`script-src 'self'`, no `worker-src`) forbids blob workers and WebAssembly. The theme follows the app (`vs` / `vs-dark`). Line-ending changes are detected in main from raw bytes, because Monaco normalizes line endings inside its text model. F1's T13 is a packaged-build spike and a stop point before any viewer component is written. | The owner asked for files to read "like VS Code", and Monaco's `DiffEditor` gives F2 side-by-side and inline diffs natively. CodeMirror 6 was lighter but not that look; Shiki with a hand-built diff would have made F2 a diff engine, and its default WASM engine is blocked by the CSP. Bundle growth is measured in the spike, not assumed. |
| AD-026 | 2026-09-19 | **Third-party content is rendered inertly, and only main opens URLs.** PR descriptions and comments are rendered by `markdown-it` with `html: false`: no HTML is parsed, so there is nothing to sanitize; links keep only a `data-href`; images render as links and never load. The renderer never navigates and never calls `window.open`. Main opens a URL only if it is `https:` and either **built by the app** from a remote `parseRemote` recognizes — commit, PR, compare and create pages, never copying credentials embedded in a remote URL — or, for a link inside third-party content, passes the `https:`-only `isOpenableLink` check. | F4 is the first time the app renders text other people wrote, inside an Electron app that runs agents with disk access, and not parsing HTML is stronger than cleaning it. **Pre-existing and outside this epic:** the template's `setWindowOpenHandler` (`src/main/index.ts:194`) forwards any URL the renderer opens straight to `shell.openExternal`. None of these features uses it; restricting it to `https:` is a recommended separate fix. |
| AD-027 | 2026-09-19 | **The app writes to Azure DevOps and GitHub for pull-request comments only, and only on an explicit user action.** The whole write surface: reply to a thread; change a thread's state (Azure DevOps' statuses, GitHub's resolve / reopen); start a thread from a text selection; post a general PR comment. No votes, approvals, merges, PR creation or background writes. The README's "ADO integration is view-only" is amended when F4 ships (F4 T26) and names GitHub when F5 ships (F5 T21). Spikes and smokes that write run only on a sandbox PR or scratch repository the owner names — **never on this repository's upstream, whose PRs notify real maintainers** — and record conventions under fictitious names only. | Owner decisions of the epic grill (Q6, Q10, Q12). Every write being the direct result of a click keeps the app's posture legible: it acts on what the user sees, never on its own. The public-repository privacy guardrail rules out real organization data in findings and fixtures. |
| AD-028 | 2026-09-19 | **Effective when `files-explore` ships: FXPL-31 supersedes STBR-30 and STBR-32.** The status bar's changed-file counter stops opening its popover and instead switches to the Files direction in uncommitted-changes mode on that worktree, remembering that mode (FXPL-31/32). `ChangesPopover` is retired in F1 T22, which also annotates both STBR requirements. Until F1 ships, `status-bar` delivers the popover exactly as specified. | The popover was always the counter's stand-in for a surface that did not exist yet (owner decision, epic grill Q8). Recording the supersession ahead of time follows AD-018: a merged spec must not keep describing behaviour that no longer ships. |
| AD-032 | 2026-09-20 | **The base picker distinguishes "could not list" from "nothing to list".** `BaseOptions` carries an optional `error`, the same failure channel `DirListing` and `ChangedListing` already have. When it is set, the picker renders the git failure line disabled and the diff-to-origin mode lists nothing with that same message; the FXPL-11 prompt is not shown. When `error` is absent and `branches` is empty, FXPL-11 applies as written and the prompt invites the user to choose a base. `listBases` already captures the failure — today it is discarded. Implemented at T17, which owns the picker. **Numbered 032 because `develop` already carries AD-029, AD-030 and AD-031** (`session-strip-polish` and `hours-calendar`), so this branch, cut before them, skips to the next free number. | FXPL-11 invites an action — choose a base — that is impossible when the listing failed, because there is no list to choose from. Showing that prompt asks the user to fix something they cannot see, and makes a broken `for-each-ref` look like a repository with no branches. The spec gave the tree an error channel and the picker none; extending the same one keeps a single grammar of failure across the Files direction instead of two. Found by the Phase 1 worker as a spec-precision gap and left untested rather than papered over, since no spec-defined outcome existed to assert. |
| AD-033 | 2026-09-20 | **A solution opens in VS 2026 on a DOUBLE click, not a single one.** FXPL-28 becomes: double-click a `.sln`/`.slnx` and VS 2026 opens elevated on it with no tab; **FXPL-28a**, a single click opens it in a tab like any other text file; **FXPL-28b**, a second launch of the same solution within 3 s is ignored. `FileTree` defers a solution's single click by 250 ms and cancels that pending tab when a second click lands, so only the solution pays the delay — every other file still opens on the first click (FXPL-16 unchanged). | Found in the T23 UAT: the owner double-clicked a `.sln` out of habit and **two elevated Visual Studio instances opened**, each with its own UAC prompt. Launching an IDE is expensive to undo and slow to notice, and double-clicking a file in a tree is the muscle memory every file manager trains. Making the single click open a tab keeps one rule for the whole tree — a click always opens a tab — instead of leaving one file type inert; the 3 s guard covers a burst of clicks, which a double-click gesture alone does not. |
| AD-034 | 2026-09-20 | **Two pre-existing defects are recorded and deliberately not fixed in the Files epic.** **(1) The packaged build violates its own CSP on every font.** `dist/win-unpacked` logs 38 `Loading the font 'data:font/woff...' violates ... "default-src 'self'"` errors: the app's `@fontsource` CSS inlines fonts as `data:` URIs and `index.html`'s CSP sets no `font-src`, so they fall back to `default-src 'self'` and are blocked — the app then falls back to system fonts silently. Dev does not show it, because the dev server serves the fonts as files. **(2) A bare repository inside a workspace folder makes `scanRepos` report "no git repos in this folder"** and drop the valid repo beside it; `scripts/smoke-files.mjs` keeps its seeded `origin` outside the workspace for that reason. Neither is touched by F1..F5; whoever fixes (1) adds `font-src 'self' data:` or stops inlining, and (2) belongs to `repo-scanner.ts`. | Both were found while proving something else — (1) by the T13 Monaco spike, which had to establish that Monaco caused no CSP violation, and (2) by the T23 smoke, whose first seed put the bare repo beside the real one. (1) was confirmed pre-existing by a control build with the spike unmounted: the identical 19 `data:font` occurrences and a byte-identical 168.68 kB CSS. Recording them follows AD-026, which noted the template's unrestricted `setWindowOpenHandler` the same way: a defect found in passing is worth a line in the log even when fixing it is out of scope, because the next person to meet it should not have to rediscover that it predates them. |
| AD-035 | 2026-09-20 | **A diff against the working tree reads the revision as the checkout would have written it, not as the blob stores it.** `readDiffSides` reads a revision with `git cat-file --filters rev:path` whenever the *other* side is the disk, and with plain `git show` when both sides are revisions. `--filters` applies the checkout filters, so the comparison becomes "what git would put on disk" against "what is on disk" — the difference a commit would preserve. Diff-to-origin is untouched: both sides get the same treatment either way. | **Git for Windows ships `core.autocrlf=true` in its SYSTEM config** — measured on this machine: system `true`, global and local unset. In any worktree without a `.gitattributes`, the disk is therefore CRLF while the blob is LF, and comparing them raw made FDIF-15 report an ending change **on every line of every file** in the uncommitted diff — for a difference git itself undoes on commit. The feature would have been pure noise wherever it was most used, and `playground` escaped it only because its own `.gitattributes` sets `* text=auto eol=lf`; the owner's other repositories may not. Measured, not assumed: `git show HEAD:f` returns `a\nb\nc\n` where `git cat-file --filters HEAD:f` returns `a\r\nb\r\nc\r\n`. Rejected alternatives: suppressing the strip in uncommitted mode, which would also hide a real ending change an agent made, and leaving the FDIF-16 whitespace toggle to hide it, which makes noise the default and the feature something to be switched off. Found by the F2 Phase 2 worker, which measured the behaviour and stopped rather than inventing an unspecified normalization. |
| AD-036 | 2026-09-20 | **The folder listing asks git for one level, never for the subtree.** `listDir` reads `ls-tree HEAD:<dir>` for what the commit holds at that level, `diff --cached --name-status HEAD` for what the index changed since, and the existing `ls-files --others` for untracked entries — three reads in parallel, through `allSettled` so no git child is left running. `git.ts` also gains an explicit 64 MiB `maxBuffer`, as a floor under every other call. **Numbered 036, skipping 035**, which `feature/files-diff` already uses. | `ls-files --cached` lists every tracked *descendant*, so drawing twenty rows read every path beneath them. Measured on a repository of ~47,000 files: the root returned **4.59 MB in 1.5 s** and a single top-level folder **4.2 MB in 1.5 s** — both past `execFile`'s 1 MiB default, so the mode rendered nothing but `stdout maxBuffer length exceeded`, a message that says nothing about the repository being large. A pathspec did not help, because one folder held 42,197 of the files. One level is **1.9 kB in 0.11 s**; end to end on that repository the root now lists in 564 ms and the big folder in 531 ms, where both previously failed. Rejected: raising the buffer alone, which keeps reading megabytes to draw a screen; and a `readdir`-based listing, which would be faster still but redefines the set FXPL-02/04/05 specifies, and that is not a change to make inside an open PR. The index delta is what keeps a file staged but not committed visible — reading the commit alone would hide it. |
| AD-037 | 2026-09-20 | **Selecting a session selects the worktree it runs in.** `worktreeIdForPath` resolves a session's `cwd` to the deepest worktree containing it — case-insensitively and separator-agnostically, since the app is Windows only — and every session-selection entry point sets the worktree selection with it. A `cwd` no worktree holds leaves the selection untouched. | The app has one current worktree and every direction reads it: the Files tree, the status bar, the launcher row. Only the Tree set it, so moving between agents left the Files direction pointing at whatever branch was last clicked there — reported by the owner against PR #100. Resolving the containing worktree rather than requiring an exact match covers an agent spawned in a subfolder, which the New Session dialog allows. |
| AD-038 | 2026-09-20 | **A commit row leads with the subject, and its two actions move to a right-click menu.** The short sha leaves the row — it stays in the row's tooltip, in the menu's Copy sha, and in the commit tab's title, where two commits sharing a subject still need telling apart. Copy sha and Open in browser become items of a context menu built like the sidebar's. FCMT-03, 21 and 23 amended; 22, 25 and 26 hold as written, one menu level down. | Owner review of PR #102. The subject is what a reader scans for, and the sha led instead. The two buttons were worse than redundant: `opacity: 0` hides a button but does not release its width, so ~150px of row was reserved for actions that were not on screen, and the author's name was clipped to its first letter. Moving them fixes both complaints with one change, and the layout defect is now asserted rather than eyeballed — the smoke compares `scrollWidth` against `clientWidth` on every row, which reading `textContent` cannot detect. |
| AD-039 | 2026-09-20 | **The app reopens on the worktree it closed on, and Files sits beside Agents.** `ui.selectedWorktree` persists the selection; it is restored once, after both the config and the tree have arrived, and only when the tree still holds that worktree. The write is held back until the restore has run. The top bar's order becomes Tree, Board, Agents, Files, Workflows. | Owner request after reviewing PR #100. The selection was plain React state, so every launch started on nothing and the Files direction had no worktree to open on — the one thing it needs before it can show anything. The restore waits for the tree because only the tree can say the folder still exists, and the write waits for the restore because persisting from the first render would save the mount's empty selection over the stored one. Files moves next to Agents because both are about the worktree an agent is working in, and the two are switched between constantly. FXPL-33 added. |
| AD-040 | 2026-09-18 | **A Claude session's name on the rail comes from `claude agents --json`, matched by the `session_id` its lifecycle hooks report — never from the terminal title and never from the transcript.** The listing is documented ("Print active sessions (interactive and background) as a JSON array and exit (for scripting; does not require a TTY)") and measured on 2.1.277: foreground interactive sessions appear with `sessionId` and `name`; only those two fields are read. Main polls it on the first hook event of a session (debounced 1 s), on later events for a still-unnamed session, and every 30 s while an eligible session is live — one call serves every row, ~2 s each. A failed call keeps every name; a successful listing without the id clears it. The name is ephemeral (never in `config.json`), lives on the row only — tooltip `<agent> · <name>`, RAIL-13 numbering on the rendered label — and the app's own `title`/rename are untouched. Sessions the app cannot name (no hook event yet, non-Claude, ad-hoc, stopped) keep the agent display name. **Numbered 022 because `AD-021` is already claimed by two open branches** (`time-tracking` #93 and `terminal-links`). | AD-019's rule was applied to the name as the owner's choice, with the alternatives measured first and recorded in the spec: the terminal title reaches node-pty as `OSC 0` and would carry the AI-generated title, but it is documented nowhere and AD-019 names its glyphs among the rejected markers; the transcript's `ai-title`/`custom-title` lines exist but `sessions.md` declares the entry format internal and breakable on any release; the statusline `session_name` is documented but reachable only by injecting a shell-dependent `command` statusline that overrides the user's (the AD-020 objection). Accepted consequence, stated at decision time: the AI-generated first-prompt title is not in the listing, so an unnamed session shows its default display name (`repos-a2`) until `/rename` or an accepted plan. Spec/context/design: `.specs/features/session-name/` (SNAME-01..15). |
| AD-041 | 2026-09-18 | **Terminal file links open through the Windows file association with no executable block list.** A Ctrl+click on a path the agent printed launches whatever Windows associates with its extension — including `.exe`, `.cmd`, `.bat`, `.ps1`, `.msi`, `.lnk`, `.vbs`, `.js`, `.jar`. Directories open in File Explorer; a file with no association gets the native "Open with" chooser (`rundll32 shell32.dll,OpenAs_RunDLL`), launched by main explicitly because `shell.openPath` no-ops on Windows 11 (electron#36605). | Owner decision at `terminal-links` Specify (2026-09-18), taken with the risk on the table: one destination, no editor coupling, and Orca behaves the same. Recorded here so the posture is explicit and revisitable — a block list is a single guard in `LinkOpener.openPath`. Spec/design: `.specs/features/terminal-links/`. |
| AD-042 | 2026-09-19 | **Every agent session runs with `FORCE_HYPERLINK=1`; the app claims hyperlink support for the whole PTY, alongside `TERM=xterm-256color` and `COLORTERM=truecolor`, and still never claims a `TERM_PROGRAM`.** Hyperlink-aware CLIs (Claude Code inlines the `supports-hyperlinks` check and tests this variable before `TERM_PROGRAM`) then emit OSC 8 for every path and URL they print, and xterm renders those cells with its own dashed underline — the look the owner wanted from Orca, which forces the same variable. | Measured 2026-09-19 on Claude Code 2.1.278: without the variable every path is plain text (the first `terminal-links` delivery never saw an OSC 8); with it the `Write(...)` header carries `file:///C:/…` and a markdown link its `https://` target in `blueBright`. `TERM_PROGRAM` stays unclaimed because the CSI-u finding of INPUT-12 is untouched by this variable. Any other CLI honouring the convention emits OSC 8 that xterm renders harmlessly. Spec: `terminal-links` LINK-33. |
| AD-043 | 2026-09-19 | **An OSC 8 hyperlink whose target is `file://` opens through the same file rules as a printed path; every other non-`http(s)` OSC 8 scheme is provided to xterm (hover underline, pointer) but never opened — Ctrl+click passes through to the agent.** `linkHandler.allowNonHttpProtocols` is on, the pane classifies the hovered target by scheme, and main converts the URL to a path (`fileURLToPath`, host must be empty or `localhost`, fragment dropped) before the LINK-09..13 rules. | Reverses the Design-time withdrawal of LINK-21, taken when no agent had been seen emitting OSC 8. With AD-042 every path Claude Code prints is a `file://` OSC 8, and the URL is more reliable than re-detecting the visible text (absolute, percent-encoded, unaffected by wrapping). The all-or-nothing gate costs only a hover underline on schemes whose cells already carry xterm's dashed one. Orca sets the same option. Spec: `terminal-links` LINK-21/22. |
| AD-029 | 2026-09-19 | **Effective when `hours-calendar` ships, the Hours direction is a week calendar and TIME-34 is superseded.** The week (still Monday 00:00 to next Monday, TIME-32) renders as day columns — Monday to Friday always, Saturday or Sunday only when they hold time — with each merged block (TIME-36) drawn as a bar at the hours it happened, parallel blocks side by side in lanes. One selected day is shown below the grid through the unchanged `DayCard`, so groups, raw periods, edit, delete and Copy (TIME-35..41, 44..49) keep working exactly as specified. `buildWeekReport`, the merge rule and the Copy format are untouched. **Numbered 029 because AD-022..AD-028 are recorded on the `feature/status-bar` stack** (the Files epic), which this branch — cut from `feature/time-tracking` — does not contain. | Owner request: the list answered "how long" but not "when", and running agents in parallel was invisible in text. Replacing only the presentation keeps every tested computation and shipped action; the AD-018 / AD-028 pattern keeps a merged spec from describing a list that no longer exists. Spec / design / tasks: `.specs/features/hours-calendar/` (HCAL-01..24). |
| AD-030 | 2026-09-19 | **Categorical chart colours are validated against the app's own surfaces, and where any mark can touch any other, at most three are used.** Validated with the `dataviz` skill's validator, `--pairs all`, on the view's `--panel` (`#ffffff` light, `#221f1b` dark): only **blue `#2a78d6` / `#3987e5`, orange `#eb6834` / `#d95926`, aqua `#1baf7a` / `#199e70`** (light / dark) pass every check in both themes. Further categories fold into a neutral **Other**; they are never given a generated or extra hue. The session-state tokens (`--green`, `--amber`, `--red`, `--blue`, `--pink`) are never used as series colours. Any later chart re-runs the validator on its own surface and adjacency before adding a colour. | Measured, not assumed: the reference eight-colour palette fails the normal-vision floor with every pair in play (red ↔ orange ΔE 7.1 light), and a fourth colour fails in dark (violet ↔ blue ΔE 9.8) — pairs that full-colour readers cannot tell apart and that labels do not excuse. Recording it spares the next chart from rediscovering it. First applied by `hours-calendar` (owner decision: the three tasks with the most time get the colours). |
| AD-031 | 2026-09-19 | **The Hours calendar fits the window and opens a day in a drawer, amending AD-029.** After the first build the owner compared three no-scroll mockups and chose layout B: the legend becomes a row of chips above the grid, the grid's hour height follows the available height, and the selected day's detail — still the unchanged `DayCard`, so TIME-35..41 and 44..49 hold — moves from under the grid into a drawer beside it. The drawer is **closed** when the view opens and whenever the week changes; a header or bar click opens it, its X or Esc closes it, and it closes when its day loses its last period. HCAL-15..19 and 21 are revised, HCAL-25 and 26 added. The default-day rule HCAL-16 had required is gone, so `defaultDay` and its three unit tests are removed with it. | The stacked grid, legend and day card ran past the window at every size, so reading the week and acting on a day meant scrolling. Of the three mockups (day in focus, week + drawer, horizontal timeline) B keeps everything already built and verified — columns, lanes, colours, the frozen map — and changes only where the detail lives. Opening closed was the owner's call: the week is the default view, the detail an action. Spec / tasks: `.specs/features/hours-calendar/` (HCAL-15..26, T12..T16). |


## Handoff

**Status (current, 2026-09-20): the Files epic's first three slices are COMPLETE and each has an
open upstream PR. Merged locally into `develop` (`6912ce3`).**

| Slice | Branch | Verifier | PR |
| ----- | ------ | -------- | -- |
| F1 `files-explore` | `feature/files-explore` `72d6e98` | PASS, round 3 of 3 | **#100** (depends on #97) |
| F2 `files-diff` | `feature/files-diff` `1802d35` | PASS, round 1 | **#101** (depends on #100) |
| F3 `files-commits` | `feature/files-commits` `cd44640` | PASS, round 2 of 3 | **#102** (depends on #101) |

The three are stacked in that order on `feature/status-bar` (PR #97), which is still open upstream.
Nothing has been merged into `obogoni/playground`; the local `develop` merge is the only integration.

- **F3 verification:** suite **1168 -> 1177** (64 files); typecheck, lint (0 errors / 18 warnings,
  the standing baseline) and `electron-vite build` exit 0. CDP smoke
  `scripts/smoke-files-commits.mjs` **27/27** against a live dev app on a seeded repository of 104
  commits, with an isolated `--user-data-dir`. Report: `.specs/features/files-commits/validation.md`.
  Round 1 returned FAIL on test strength only — no shipped code was wrong — and named two surviving
  mutants plus one AC with no evidence at all; all three are closed. Round 2 returned PASS with three
  survivors, two of which were closed afterwards (recorded as an addendum in the report, marked
  plainly as author self-check rather than a third round).
- **Defect found and fixed during F3, in shipped code:** `commitFiles` used `Promise.all`, which
  returns on the first rejection and leaves its sibling git process running. On Windows that child
  held the worktree as its cwd and blocked the directory's removal — an intermittent EPERM roughly
  one full-suite run in six. Now `allSettled`. It cost four wrong diagnoses before the error text was
  finally captured; the lesson is L-029.
- **Merge into `develop`:** six files conflicted, all additively (config keys, contract imports, two
  helpers in `main/index.ts`, two top-bar directions, and two blocks of decision rows). Every
  conflict kept both sides. Merged tree: **1504 tests / 82 files**, lint 0 errors / 17 warnings,
  build green.
- **Carried, non-blocking:** FCMT-07's *rendered* base prompt is unasserted on both sides (the pure
  decision behind it is unit-tested); FCMT-32's window-focus path, FCMT-16's focus-when-already-open
  and FCMT-11's restore-on-return are each argued rather than driven. `inTreeOrder` in
  `AllChangesTab.tsx` is pure and untested. `files-diff/design.md` § Data Models still declares the
  removed `FileStat { binary: boolean }`. Candidate lessons L-019..L-029 await promotion.
- **Owner hand checks NOT yet done on F3** (a CDP smoke counts DOM nodes; it cannot see that a screen
  is unreadable, mis-themed or drawn in tofu — in F2 the smoke found one defect and the owner found
  three): click **Open in browser** on one real pushed commit of a real repository, since the smoke
  never clicks an enabled one; hover a row and read the full message tooltip; and judge the
  four-mode selector at the left column's narrowest width, where it now wraps to two lines.

**Next:** F4 `files-pr-ado` (27 tasks), stacked on F3. Re-chain it with
`git rebase --onto feature/files-commits eec156e feature/files-pr-ado` — the base is F3's **previous
tip**, not the common ancestor, or the range replays F3's own commits. Re-measure the test baseline
as the first act of Execute; it is **1177** on F3's tip. **F4's T1 writes to a real Azure DevOps pull
request**: a sandbox PR the owner names, with a go-ahead at that moment. F4 also flips the README's
"ADO is read-only" claim, per AD-027.

### `session-name` (PR #96, merged with the Files epic on 2026-09-25)

Decision renumbered AD-022 → **AD-040** at merge time: `origin/main` had already claimed AD-022..039 for the Files epic.

**Status (2026-09-19): `session-name` EXECUTED + independent Verifier **PASS** on branch
`feature/session-name`, cut from `main` `6ecd19c` (= `origin/main`; PR #88 activity already in).
12 commits (`3e69ce9..579819a`), tree clean. PR not opened — push to `fork` (mrpaiva) and the draft
PR to `obogoni/playground` (`Closes #92`) need an explicit go-ahead.**

A running Claude Code session's row in the Agents rail now shows the name Claude gives that session
(`/rename`, an accepted plan, or the default `<folder>-xx`), read from the documented listing
`claude agents --json` and matched by the `session_id` the session's hooks already report (AD-040).
Main owns a `SessionNamePoller` (`src/main/session-name-poller.ts`: debounced 1 s on the first hook
event, every 30 s while a session holds an id, 20 s timeout, one call in flight with a coalesced
rerun, one log line per failure streak); `SessionManager` records the id, watches/nudges/unwatches,
applies each listing and pushes `session:name` only on change; the renderer applies it in place
(`applyName`) and `resolveRows` labels, numbers (RAIL-13) and describes rows by `rowLabel` — tooltip
`<agent> · <name> · <branch>`. Nothing is persisted (`PersistedSession` untouched); a stopped session
falls back to the agent name through the existing `session:status` refetch. Suite 917 → **987**
(+70 in three new test files and two extended ones), typecheck + lint clean, `electron-vite build`
green. Verifier: 15/15 ACs evidenced, 13/14 mutants killed (the survivor is equivalent by
construction: a field reset on an object dropped two lines later). Owner smoke run by the author over
CDP against the dev app on Claude Code 2.1.278: `scripts/smoke-session-name.mjs` **14/14**.

**Scope addition approved at task time:** `AgentChild.onError?` on the spawn seam
(`agent-step-runner.ts`) and `child.on('error')` in `spawnAgent` — Node emits `error` (not a throw)
for `ENOENT`/`EACCES`, and an unlistened `error` on a `ChildProcess` is an uncaught exception in main.

**Environment gotcha found by the smoke, not a product defect:** a second dev instance of the app on
the same `userData` rewrites `agent-hooks/claude-settings.json` with *its* hook port at launch, so the
other instance's sessions get HTTP 401 on every hook — no `session_id`, no activity, no name. Run one
instance at a time (`smoke-session-name.mjs` header, `TESTING.md`). Also: orphan groups (untagged
branch) are one per session, so RAIL-13 ordinals never apply there.

**Spec text aligned with what shipped (Verifier gaps, closed in `579819a`):** SNAME-05 now says
"tooltip (`title`)" — the row has no `aria-label` and gains none; the listing-binary edge case names
`resolveClaude` (PATH first, else `agent.claudePath`) as the accepted v1 deviation.

**Lessons NOT recorded with `scripts/lessons.py`** (the installed script rewrites `lessons.json` on
any call — see the terminal-links handoff): four candidates are listed at the end of
`.specs/features/session-name/validation.md`, three already applied in this range.

**Next steps:**
1. Owner decides: push `feature/session-name` to `fork` and open the draft PR to
   `obogoni/playground` — title from the feature, description from `validation.md` §Summary,
   `Closes #92`. Update the body of issue #92 first: it still proposes the transcript's `ai-title`
   record as the source, which AD-040 rejects (documented as internal; the AI-generated title is
   therefore **not** shown — an unnamed session reads `<folder>-xx` until `/rename` or an accepted
   plan). Upstream PRs #93 (`time-tracking`) and #95 (`terminal-scroll-paste`) touch
   `session-manager.ts` / `rail-groups.ts` neighbours — rebase if either lands first.
2. Deferred ideas in `context.md`: the terminal title (OSC 0) as a second source (would add the
   AI-generated title and cover any agent; needs an AD-019 exception), naming the Claude session
   from the app (`claude -n <title>`), hiding the default display name.
3. `feature/terminal-links` (main worktree, `cb18b7a`) is still at its own verified gate, unpushed.

**Uncommitted files:** none. **Branch:** `feature/session-name` @ `579819a`.

### `terminal-links` (PR #104, merged on 2026-09-25)

Decisions renumbered AD-021/022/023 → **AD-041/042/043** at merge time: AD-021 belongs to `time-tracking` (#93) and AD-022..039 to the Files epic.

**Status (2026-09-24): `terminal-links` complete on `feature/terminal-links` — amendment T12–T15 and fix F3
committed, independent Verifier PASS (pass 4, `dd83777..77d4e34`; pass 3 over `3563b91..a83e62b` found one
Minor LINK-21 gap, closed by F3). All 33 LINK requirements Verified. Gate: typecheck 0, lint 0 errors (18
pre-existing prettier warnings), `npm test` 1036/1036 (917 before T1). Pushed to `fork` and opened as
[PR #104](https://github.com/obogoni/playground/pull/104) on 2026-09-24 — a regular PR; playground PRs are
not drafts.**

**What landed since the 2026-09-19 handoff:**

- **T15 `a83e62b`** — live smoke in Claude Code 2.1.281, `validation.md` rows 22–30: a plain URL in the
  alternate buffer hovers and opens through text detection (LINK-32); the `Write(hello.txt)` header is an
  OSC 8 `file://` link and opens Notepad through `links:openFileUrl` (LINK-21, LINK-33); a markdown link opens
  the browser (LINK-20); an OSC 8 `mailto:` is provided but never opened (LINK-22). The owner cross-checked
  by hand in the smoke window. Also pointed `design.md`/T14 at `terminal-link-provider.ts`.
- **Pass 3 `dd83777`**, **F3 `7da1cc1`** — `openFileUrl` let `fileURLToPath` throw across IPC for file URLs
  with no local drive path (`file:////server/share/…`, `file:///tmp/…`); it now answers
  `Only local file links open here — <url>`, and a test pins the `localhost` form. **Docs `77d4e34`** — T14's
  Done-when said a `null` OSC 8 target falls through to text detection (it does not, and must not, for
  LINK-22); a `C:\dir\a.txt` example had lost its `\a` to a BEL byte; the never-hovered OSC 8 Ctrl+click is a
  deferred idea in `context.md`. **Pass 4 `3635409`**, then traceability with this handoff.

**Findings worth keeping:**

- **`WT_SESSION` also turns Claude Code's hyperlinks on.** A dev app launched from a Windows Terminal tab
  passes it to every session through `buildPtyEnv`, so links show up on `main` without this branch; the
  installed build (Start menu) gets none. Any smoke of link work must run with `WT_SESSION` and
  `WT_PROFILE_ID` removed, or it passes for the wrong reason.
- Claude Code 2.1.281 emits no OSC 8 for `mailto:` — it prints `text (address)`.
- **A second dev instance without breaking the first:** `--user-data-dir=<scratch>` after the `--` isolates
  the config and `agent-hooks/claude-settings.json`, so the owner's instance keeps its hooks. On Windows the
  Bash tool's `TaskStop` leaves the Electron tree running — `taskkill /T /F` on the smoke's `npx` root, never
  on the owner's PIDs.
- **`window.api` is frozen** (AD-020 already says so; the 2026-09-19 note calling it patchable was wrong).
  The IPC channel was read from CDP logpoints instead: `Debugger.setBreakpointByUrl` on the served
  `TerminalPane.tsx` with a condition that logs and returns `false`; `Runtime.enable` replays old console
  messages.
- `npx` in a shell that descends from the running dev app resolves binaries through that app's
  `node_modules/.bin` on `PATH`; run gates with `npm test` / `npm run …` inside the worktree.

**Next steps:**

1. Follow the PR. Rebase onto `origin/main` if #95 (`terminal-scroll-paste`, also edits `TerminalPane.tsx`)
   lands first. Today the branch is 3 commits behind `main` (PR #90) and `git merge-tree` reports no conflict.
2. Deferred ideas in `context.md`, notably the Ctrl+click on a never-hovered OSC 8 link.
3. Lessons are still unrecorded with `scripts/lessons.py` (the installed script rewrites `lessons.json`):
   candidates under `### Lesson candidates` in `validation.md` passes 3 and 4, plus the 2026-09-18 ones
   (`cb18b7a`).

**Traps still valid from 2026-09-19:** editing main while the dev app runs restarts Electron, and the restart
dies on an unhandled `ERR_SERVER_NOT_RUNNING` (#91) — relaunch instead; ConPTY drops DECSET mouse requests
from a process without `ENABLE_VIRTUAL_TERMINAL_INPUT`; Bash-tool heredocs halve backslashes (write TS/JS and
spec prose with Edit/Write — the BEL byte above came from this); 18 pre-existing prettier warnings.

**Uncommitted files:** none. **Branch:** `feature/terminal-links`, this handoff's commit.

### `terminal-scroll-paste` (PR #95, merged on 2026-09-25)

**Status (2026-09-17): `terminal-scroll-paste` COMPLETE -- T1-T14 executed and
independent Verifier **PASS** (round 2 of 3) on branch `feature/terminal-scroll-paste`, cut from
`origin/main` `fa78f78`. Phases 6 and 7 SKIPPED (Q2 verdict: cause 3 only; TSP-29..34 `Withdrawn`).
Nothing uncommitted. **Pushed to `fork` and PR #95 open upstream**
(`viniciussaide:feature/terminal-scroll-paste` -> `obogoni:main`, opened 2026-09-17 with owner
go-ahead; CI `gate` **pass** in 4m56s, `mergeStateStatus` CLEAN, 24 files / +3247 -117). Report:
`.specs/features/terminal-scroll-paste/validation.md`; `validate_state.py` exit 0.**

- **Verification:** suite **748 -> 820** (46 -> 51 files); typecheck/lint/test and
  `npx electron-vite build` all exit 0. Round 1 **FAIL on evidence, no code defect** (18/18 mutants
  killed); round 2 **PASS** with **23/23 mutants killed** -- the 18 re-run verbatim plus 6 new ones
  on the changed test. 26/34 non-withdrawn ACs fully matched, 4 spec-precision, **7 owner-accepted
  hand-verification items enumerated, 0 silent passes.**
- **The Verifier ran a counterfactual on the one code change rather than trusting the claim:** the
  memoised-`rand` mutant and a constant-suffix mutant both **survived** the old TSP-38 assertion
  (exit 0, 20 passed) and both **die** against the new one. The second mutant keeps `randCalls === 2`
  honest and would defeat a call-counter-only assertion; the path assertions catch it.
- **Lint baseline moved and exit code hid it.** The fix round added a 19th prettier warning in its
  own file against a baseline of 18, invisible at exit 0 because warnings do not fail the gate.
  Fixed with `npx eslint --fix src/main/clipboard-reader.test.ts`; back to 18. **Record the count and
  diff the count -- judging lint by exit code alone is correct for errors and blind to drift.**

- **Commits:** `194aa4f` spec, `b3b41e3` + `1467c64` requirement-id realignment, then T1-T13 in
  `90830f3`..`02f1413` (one per task). Suite **748 -> 819** (46 -> 51 files); `typecheck`, `lint`
  and `npm test` exit 0, `npx electron-vite build` exit 0, verified by the orchestrator at the
  phase boundary, not only by the workers.
- **What shipped:** `src/shared/paste.ts` (`planPaste`, `quotePath`, `PASTE_GAP_MS`), the
  `clipboard:read-paste` channel and the `pathForFile` bridge, `TerminalModeTracker`, a
  `SessionRingBuffer` whose `snapshot()` prepends the modes its trimmed head carried (`tail()`
  stays unprefixed -- cause 3, unconditional), `clipboard-reader`, `paste-temp` purge,
  `terminal-modes.ts` (`modeName`, `formatModeLog`, `isProbeEnabled`), and in `TerminalPane.tsx`
  the flag-gated mode probe, one serialized paste queue behind both Ctrl+V and right-click, and
  file drop.

**T14 verdict (owner UAT, 2026-09-17): cause 3 only.** The probe logged, and the scroll never died
in any scenario the owner tried, including repeated Ctrl+C in opencode. T4 had already fixed cause 3
unconditionally, and the original intermittent symptom matches it. **The evidence is a
non-reproduction, not a measured difference:** the A/B against the pre-T4 1.1.1 install was offered
and declined in favour of shipping, so this does not prove causes 1 and 2 cannot happen. The probe
stays behind `playground.debug.terminalModes` so a returning defect is diagnosed against evidence.

**To run the probe again:** `npm run build && npm start` -- **an installed/packaged build cannot run
it**, because `optimizer.watchWindowShortcuts` (`src/main/index.ts:202`) only wires F12 to DevTools
while unpackaged and blocks Ctrl+Shift+I when packaged. Set
`localStorage.setItem('playground.debug.terminalModes', '1')`, enable **Verbose** in the console
level dropdown (the probe uses `console.debug`, hidden by default), then remount the pane.

**Verifier round 1 FAIL -- what it found and what was done, all resolved or accepted (owner decided:
record honestly, do not refactor for testability):**

- **7 ACs had no evidence of any kind and were missing from T14's owner-pending list**, so they read
  as verified in Traceability: TSP-02, 03, 20, 23, 24, 26, 28, all pane-local. Now enumerated under
  T14. The riskiest are **TSP-23/24** -- the serialized paste queue and its cancel-on-unmount, the
  most intricate new logic here, shipping source-verified with no test by owner decision.
- **TSP-38's assertion was tautological** (proved only that `pasteImageName` embeds the `rand` it is
  handed; a suffix cached per module would have survived it). Replaced with a `readClipboardPaste`
  test that pastes twice under one fixed `now` and asserts both paths and `randCalls === 2`.
  Mutation-checked: caching `rand` now fails the test. Suite 819 -> 820.
- **TSP-16's 5 s timeout and the exact chip text stay unasserted literals** (`src/main/index.ts:94`,
  `TerminalPane.tsx:31`) while `PASTE_GAP_MS`/`COPIED_FEEDBACK_MS`/`PASTE_MAX_AGE_MS` were all pulled
  into tested seams. Same convention, three exceptions -- accepted, not fixed.
- **Third TSP-citation drift on this feature**, swept: the coverage matrix cited withdrawn ids and
  `design.md` had no withdrawal marker. Citations inside the T15..T19 bodies are intentional.
- Cleanup audit passed: the probe's CSI handlers `return false` unconditionally (returning `true`
  would swallow every DECSET/DECRST and manufacture a superset of the bug, on flagged machines only,
  with nothing in the suite to catch it), and no path writes to a disposed terminal. **One narrow
  real defect left unfixed:** the replay `term.write(data, cb)` callback reads `term.modes` and can
  fire after `dispose()` -- probe-only, so flag-gated. The Verifier's other note, that the cleared
  `gapTimer` permanently retains the disposed terminal, **does not hold and was withdrawn in round
  2**: a pending promise is not a GC root, so the closure graph is collectable once unreachable. The
  mechanism is inverted -- **not** clearing the timer is the retaining case, since a live timer holds
  `resolve` -> promise -> continuation -> `term` for up to `PASTE_GAP_MS`.

**What the PASS does not claim, stated because it is the accepted risk:** nothing is verified about
`TerminalPane.tsx`. **TSP-23/24** -- the serialized paste queue and its cancel-on-session-change, the
most intricate new logic here -- ship on source review alone, and the 23/23 kill rate does not extend
to them. The Verifier re-read the disposal path in both rounds and found no route where a disposed
queue writes to a dead terminal.

**Deliberately left as-is (cosmetic, recorded not fixed):**

- `spec.md` Traceability reads `Implementing` for all 34 non-withdrawn ACs, so it does not
  distinguish the 26 verified from the 7 accepted-pending. **This matches the project convention** --
  `agents-rail-v2` is merged and Verifier-PASS and still reads `Implementing` throughout -- and it
  under-claims, so nothing is falsely green. Introducing a per-AC status scheme on this branch alone
  would diverge from every other feature.
- The post-dispose replay callback: `term.write(data, cb)`'s callback reads `term.modes` and can fire
  after `dispose()`. Probe-only (`replayPending = probing`), worst case a console throw on a terminal
  that is already gone, no PTY or data consequence. A one-line `if (pasteDisposed) return` would close
  it by reusing the existing flag.

**Next:** PR #95 is open and awaiting review; `origin/main` is still `fa78f78`, so no rebase is
needed. The feature is **not** merged into `develop` yet. After the upstream merge: `git fetch origin` -> `main`
fast-forward -> merge `main` into `develop`. Expect a Handoff conflict and the lessons renumbering
that `time-tracking` (#93) and `session-idle-notifications` (#94) also need.

**A HOLE IN THE SKILL'S OWN CLOSING GATE -- do not trust `validate_state.py` blindly.** Reproduced
this session with a synthetic report: a `validation.md` whose verdict reads `**Verdict: FAIL**` in
prose **passes with exit 0**. `_verdict()` builds its haystack only from lines matching
`^#{1,4}\s*validation\b` or an unanchored `\*{0,2}result\*{0,2}\s*:`, so the Discrimination
Sensor's own `**Result**: ... killed ... PASS` line -- which `validate.md`'s template prescribes --
becomes the only match and reads as a pass. This feature's report only exits 1 because its heading
happens to be `## Validation: ... FAIL`. The owner decided 2026-09-17 not to patch the skill; verify
a verdict by reading the report, not by the exit code.

**Spec-precision gaps recorded during Execute (in `tasks.md`, not silently absorbed):**

- **TSP-01** does not define the probe line's layout. The shipped shape is
  `[term-modes] <id> CSI ?1049;1003;1006h alt-screen,any,sgr-mouse tracking=any buffer=alternate`,
  pinned by test, and TSP-02/03 follow it. The `tracking=`/`buffer=` readouts are taken in a
  `queueMicrotask` because xterm has no per-sequence post-apply hook: exact for a mode change that
  arrives alone (the diagnostic case), settled-state for several changes inside one PTY chunk.
- **TSP-16** says the failure chip sits "next to" the "Copiado" chip but also that it reuses that
  element and timing. Implemented as reuse, so "Não foi possível colar" inherits the chip's green
  background. A red variant is outside T12's Done-when.
- `planPaste({kind:'text', text:''})` is undefined by the spec; returns `['']` and is unreachable
  from `readClipboardPaste`.

**Found during Execute, worth keeping:**

- The edge-case requirement ids in `tasks.md`/`design.md` were **3 below** `spec.md` -- the edge
  cases moved to TSP-35..40 when the conditional blocks took TSP-29..34. Twelve citations fixed in
  `b3b41e3` and `1467c64`. The TSP-29..34 references in T15..T19 are the conditional ids and are
  correct.
- **Ctrl+Alt+V classified as `paste`** before T10, which would have swallowed the AltGr/Alt+V chord
  Claude Code on Windows uses to read the clipboard itself (TSP-17). Fixed by excluding `altKey`,
  mirroring the Ctrl+Z branch (`terminal-keys.ts:117` and `:122`). Latent defect, not a regression
  of this branch.
- **`<skill-dir>/scripts/lessons.py list` destroys data.** Run to load confirmed lessons, it
  rewrote `.specs/lessons.json` and `.specs/LESSONS.md` and **deleted all 13 candidate lessons**,
  keeping only the 2 confirmed ones it was asked to list. Reverted with `git checkout --`; restored
  state is 15 lessons / 13 candidates / `next_id` 17. Do not run it; read `lessons.json` directly.

**STILL TRUE from earlier handoffs (carried over):**

- `agents-rail-v2` two-theme visual pass (RAIL-26/27) is code-verified only; `opencode` and
  `Ad-hoc` both resolve to `--amber` at 22x22 -- a pre-existing collision that feature surfaced
  but did not fix.
- AD-017 follow-up: preserve `undoByte` in `SettingsDialog` `commitForm` (PR #83 has merged).
- **PENDING -- bump the committed `package.json` version on the next delivery:** `v1.0.0` shipped
  2026-09-02 from `cafb43f`, but the bump was never committed -- `main` still reads `0.1.0` and
  nightlies publish `0.1.0-alpha.N`, semver-sorting below the shipped stable. Bump to `1.1.0`.

**Note for whoever merges this branch:** this STATE.md is `origin/main`'s, so it does not carry the
`time-tracking` (PR #93) or `session-idle-notifications` (PR #94) handoffs that live on `develop`.
Expect a Handoff conflict on the merge into `develop`, and the same lessons renumbering those two
features already needed.

### `session-idle-notifications` (PR #94, merged on 2026-09-25)

Lesson candidates L-019..L-023 of this branch were renumbered **L-030..L-034** at merge time (`origin/main` already held L-019..L-029).

**Status (2026-09-16): `session-idle-notifications` EXECUTED + independent Verifier PASS
(round 2 of 3). Owner smoke 36/36 (rev5). PR #94 open upstream (`viniciussaide:feature/session-idle-notifications` → `obogoni:main`, "depends on #88"). Not yet merged into `develop`.**

- **Branch:** `feature/session-idle-notifications`, stacked on `feature/session-activity-status`
  (`65de9fd`, PR #88 still open upstream). Spec/design/tasks `c5e2304`..`4e7e69a`, code
  `2e6bf64`..`40ab12f` (13 tasks), fix round `b3a00b3`.
- **What shipped:** main decides (`activity-notification.ts` pure rules + `SessionNotifier`);
  `SessionManager` reports each activity transition; OS notification when the window is
  unfocused, in-app notice stack when focused on another session, nothing for the attached one;
  a first event never notifies (NOTF-27). Settings dialog split into General / Notifications
  tabs with a master switch plus one per state, flat `ui.notify*` keys, absent = on. Shared
  `showOs` now holds each `Notification` until click/close, which also covers workflow toasts.
- **Verification:** suite 917 → **990**. Round 1 FAIL on evidence only (NOTF-05 direction half,
  06, 21, 23, 29 agent form) with 20/21 mutants killed (1 equivalent); round 2 PASS after smoke
  and spec fixes. Report: `.specs/features/session-idle-notifications/validation.md`.
- **Owner smoke 2026-09-16: 34/34 PASS**, including a real Windows notification and its click.
  Two earlier runs stopped on smoke defects (rail v2 row labels; xterm not rendering while the
  window is hidden), fixed in `d641837` and `57d88fc`. Still hand-verify: a notification clicked
  after a minute, a minimized window, and the two-theme pass of tabs and notices.
- **rev4 increment (2026-09-16), P4 NOTF-30..36:** the notification names the session's task —
  title `#<id> · <pinned task title>` (or `#<id>`), clipped to 60 characters until rev5 removed the cut; agent and session
  as a second body line; branch read with `git symbolic-ref --short HEAD` (2 s), no ADO call.
  T14–T20 `ec0d66b`..`d1d5f94`, fix round `b522d5f` (also catches async notifier failures).
  Suite 990 → **1006**; Verifier round 3 FAIL on evidence, round 4 PASS (18/18 mutants).
  **Owner smoke 2026-09-16: 36/36 PASS**, and the Windows toast shows the three lines separately
  (no ` — ` fallback needed).
- **rev5 (2026-09-16), whole titles:** owner decided the app never cuts a title — no 60-character
  limit, no `…`; the in-app title wraps freely. T21–T23 `133794e`..`39a589c`, fix round `ffc773c`
  (test for a long session title on the body's second line). Suite **1006**; Verifier round 5
  FAIL (1 surviving mutant), round 6 PASS (8/8). Owner hand check: a long pinned task title shown
  whole in the in-app notice; Windows may shorten its own toast title.
- **Lessons collide again:** this branch added candidates **L-019..L-023** (`next_id` 24), but
  `develop` already holds time-tracking's L-019..L-024. Renumber when merging into `develop`.
- **Next:** merge into `develop` locally (renumber lessons L-019..L-023 past develop's L-024); when #88 merges,
  `git rebase --onto origin/main feature/session-activity-status feature/session-idle-notifications`.

**STILL TRUE from earlier handoffs (carried over):**

- `session-activity-status` (PR #88): owner smoke 19/19 PASS; the two-theme visual pass of the
  activity dots/loader and `prefers-reduced-motion` (ACTV-14/15/17/20) is still owner-pending.
- Deferred follow-up: the three `quota_auto_resume_*` notification types are not consumed, so a
  session paused by a usage limit stays `error` after Claude resumes (`_fired` → `working`,
  `_stale` → `needs-input`, `_disabled` → `waiting`; Claude Code v2.1.234+).
- `agents-rail-v2` two-theme visual pass (RAIL-26/27) is code-verified only; `opencode` and
  `Ad-hoc` both resolve to `--amber` at 22×22.
- The `wip(reconciler-core)` stash is gone from this clone; if it is not in another clone it is lost.
- AD-017 follow-up: preserve `undoByte` in `SettingsDialog` `commitForm` (PR #83 has merged).

**PENDING — bump the committed `package.json` version on the next delivery:** `v1.0.0`
shipped 2026-09-02 from `cafb43f` (the PR #77 merge), but the bump is **never committed**
— `main` still reads `0.1.0` and nightlies publish `0.1.0-alpha.N`, semver-sorting below
the shipped stable. Bump to `1.1.0` on the next delivery (owner decided 2026-09-10 this
branch ships without it).

### `time-tracking` (PR #93, merged on 2026-09-25)

Lesson candidates L-017..L-022 of this branch were renumbered **L-035..L-040** at merge time (`origin/main` already held L-017..L-034). AD-021 keeps its number.

### `hours-calendar` (PR #99)

Lesson candidates L-023..L-032 of this branch were renumbered **L-041..L-050** at rebase time (`origin/main` already held L-023..L-040).

**Status (current, 2026-09-19): `hours-calendar` DONE — layout B + the drawer polish, independent
Verifier PASS round 6 on branch `feature/hours-calendar`, rebased onto `origin/main` on
2026-09-25 after #93 merged. Open upstream as PR #99.**

- 19 tasks in 5 phases (`19a2504`..`200147c`). Phases 1–3 built the week calendar; Phase 4 (AD-031)
  turned it into layout B — legend chips, a grid that fills the height, the day's detail in a drawer
  closed by default; Phase 5 matched the drawer to the approved mockup and closed the verifier gaps.
- Verifier ran **six rounds** (the owner approved rounds beyond the 3-iteration bound): PASS at
  rounds 2 and 6, FAIL at 1, 3, 4 and 5. Every gap was evidence, except one real defect caught before
  release — the drawer's summary line rendered `1 blocks` (fixed in `4e2ce9f`, pinned in `200147c`).
  Lessons L-041..L-050. Final: 27/27 ACs evidenced, 8/8 reachable mutants killed, `validate_state.py`
  exit 0.
- Gate: typecheck 0, lint 0 errors / **18 warnings** (the baseline), **893 tests**.
- Live smokes on the dev app, owner-approved, last run 2026-09-19: `smoke-hours-calendar.mjs`
  **29/29**, `smoke-time.mjs` unedited **26/26**; cleanup verified each time.
- **Known, recorded, non-blocking:** the summary line's `N tasks` wording never renders in the smoke
  (its ad-hoc sessions carry no task — same cause as HCAL-11's note, now in the script header); the
  spec's Coverage line is derived but nothing checks it, and it silently reverted once when the
  task-closing helper rewrote it; chip truncation and the drawer's side stay CSS-only.
- **Rebase onto `origin/main` (2026-09-25):** code diff unchanged; the conflicts were all in
  `.specs/` — decision rows and roadmap entries kept on both sides, lessons renumbered as above.
  Gate on the rebased tip: typecheck 0, lint 0 errors / 18 warnings, **1691 tests**.
- **Drawer growth (issue #105), 2026-09-25:** a busy day's groups spilled out of the day card in the drawer.
  `flex: none` on `.hours-day` (`bcc8e3f`) fixes it; `min-height: 100%` still fills the drawer on a short day. The
  Hours smoke now brings its own data: `--seed` writes a tall past Sunday into a throwaway `--user-data-dir`, the run
  refuses anything else (`not running on the seeded data`), and step 10 checks the card geometry. Red 32/34 before
  the fix, 34/34 after; independent Verifier PASS, 4/4 mutants killed (`hours-drawer-growth/validation.md`). The
  refusal against the owner's real data was not run (launching the dev app on it is not permitted to the agent); an
  empty directory took the same branch. Commits `6a2211e..6fa96d4` pushed to `fork`; PR #99 closes #105. A
  follow-up makes a pass fail when the clean-up leaves the seed behind (the Verifier's one minor gap).
- **Next:** review of PR #99.
