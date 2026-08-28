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


## Handoff

**Status (current, 2026-08-28): ONE feature in flight; AD-015 has since merged.**

0. **`vs2026-admin-shortcut` (AD-016) — EXECUTED, validated (PASS, code-verified), NOT pushed.**
   Branch `feature/vs2026-admin-shortcut`, based on **`origin/main` (`9d825d6`, the PR #75 merge)** —
   independent of anything still in flight. 8 commits (`acb12e1..64eb192`), **617 tests passing / 1
   pre-existing failure** (the same `worktree-manager` mixed-dirt case as before), typecheck clean,
   lint 0 errors / 18 warnings (baseline unchanged). VS26-02/03/05 are **Verified** by executed
   tests plus real-machine vswhere evidence; VS26-01/04 are **code-verified**, their rendering ACs
   pending the owner-run gates. Mutation sensor **5/5 killed** — two mutants initially
   survived (`launch()` routing both VS tools to 2022, and `openVisualStudio` ignoring its edition
   argument), which would have let the 2026 card silently open 2022; closed in `64eb192`.
   Validated by a **standalone fresh-eyes pass, not an independent Verifier sub-agent** (this
   harness runs without them), so author != verifier is unmet — same caveat as AD-015, with
   the mutation sensor as the compensating control. See `validation.md`.

   **Three owner-run gates outstanding** (none auto-runnable — they launch GUI apps on the
   desktop; `.specs/codebase/TESTING.md` marks CDP smoke as never-in-CI):
   (a) `npm run dev -- -- --remote-debugging-port=9222` then `node scripts/smoke-shortcuts.mjs`
   (updated to five cards / both VS buttons, syntax-checked and selector-verified, but **not run**);
   (b) the **elevation pass** — click VS 2026, accept UAC, confirm "Administrator" + 18.x under
   Help > About, then confirm VS 2022 still opens 17.x in the same session, and decline UAC once;
   (c) the **visual pass** — the 3+2 card grid and 5-button footer in both themes, confirming
   `--pink` is separable from `--amber` at 15px. (c) is the one most likely to need a change: if
   pink reads too close to `--red`/`--accent` in the light theme, only the token's two hex values
   need adjusting. **No GitHub issue or PR yet** — per convention, issue + PR come next.

1. **`worktree-hook-workspace-config` (AD-015) — MERGED to `main` 2026-08-28 via PR #75**
   (issue #74 closed). `origin/main` is now `9d825d6`, the PR #75 merge commit; the note below that
   the PR was still open is superseded. Earlier detail retained for the record:**
   Branch `feature/worktree-hook-workspace-config`, originally **branched off the removal branch**
   (not `main`) so AD-014 was present and the AD numbering / STATE edits did not collide. 8 commits,
   **605 tests passing / 1 pre-existing failure**, typecheck clean, lint 0 errors / 18 warnings. All
   14 ACs Verified and **all four Success Criteria met** — the last one (a real worktree create from
   the New Worktree dialog against `M:\Triade\source\Code`) was run end-to-end on **2026-08-04**;
   see `validation.md`. Validated by a **standalone fresh-eyes pass, not an independent Verifier
   sub-agent** (the harness is configured without them), so author ≠ verifier is unmet — 9/12
   mutants killed is the compensating control. **Issue #74, PR #75, based on `main`.**
2. **`worktree-removal-fault-tolerance` (AD-014) — MERGED to `main` 2026-07-31 via PR #73
   (issue #72, closed).** Independently VERIFIED, round 3 PASS. **Correction:** earlier revisions of
   this handoff said "NOT pushed, no PR, no GitHub issue yet" — that was already stale when written
   or shortly after; `origin/main` (`7cc8c76`) is the PR #73 merge. WRFT-01..05 are **Verified**;
   WRFT-06 was **Unverified** (renderer — no executed evidence) at merge time and the live smoke +
   Danger-section visual pass were never recorded as run, so they remain open follow-ups against
   merged code rather than release gates. WRFT-07 is **Deferred** to a follow-up PR.
   One removal-branch commit, `5e22450` (*docs(specs): correct the lessons-store note*), was made
   **after** PR #73 merged and never reached `main` — it rides into `main` on PR #75 instead.

**The hook command now resolves repo-first, workspace-second** (AD-015):
`<repo>\.app\config.json`'s `postCreateCommand` wins; otherwise
`<workspace>\.app\config.json`'s `postCreateCommands[<repoName>]` applies, with the workspace
derived lexically as `dirname(repoPath)`. The real declaration was **moved out of the Code repo**:
`M:\Triade\source\Code\.app\config.json` is deleted and
`M:\Triade\source\.app\config.json` now holds `{"postCreateCommands":{"Code":".\\SetupSkills.cmd < NUL"}}`
— outside version control, since `M:\Triade\source` is not itself a git repo. The command shape was
measured: the leading `.\` is required (`NoDefaultCurrentDirectoryInExePath`) and `< NUL` feeds EOF
to `SetupSkills.cmd`'s trailing `pause`, which otherwise hangs until the 120 s timeout. Note the
wrapper `.cmd` masks `SetupSkills.ps1`'s exit code (measured: inner `exit /b 7` → wrapper exits 0),
so a failing script would report success; switching the value to
`powershell -NoProfile -ExecutionPolicy Bypass -File .\SetupSkills.ps1` restores real failure
reporting.

⚠️ **Environment defect found while validating — `fs.rmSync` is broken on this machine.** On Node
**v24.9.0**, **every** `rmSync` shape silently no-ops (returns without error, file remains) when
**any component of the path contains a non-ASCII character**; `unlinkSync` and every **async** `rm`
shape work. Because the test fixtures root at `realpathSync.native(tmpdir())` =
`C:\Users\OtávioBogoni\…`, this makes `worktree-manager.test.ts > removeWorktree > force-removes a
worktree with mixed dirt` fail **on a clean tree** — the fixture's `rmSync(b.txt)` never deletes, so
git correctly reports no deletion. **This is the 1 failure in the counts above and it is not a
regression.** The product is unaffected: no production file uses `rmSync` (`dir-remover.ts:77` uses
async `rm`, re-measured correct on non-ASCII trees). Consequence to keep in mind: the 17 test files
using `rmSync` for teardown silently leak temp dirs under `%LOCALAPPDATA%\Temp`. Repros in the
session scratchpad; full write-up in `worktree-hook-workspace-config/validation.md`.

Removal is now **delete-first**: the app deletes the worktree directory itself with a junction-safe,
deadline-bounded deleter and calls `git worktree remove` only to drop bookkeeping. A blocked deletion
returns before git runs, so the worktree stays **registered** and its row is the retry handle; the
Danger section names the blocked path and the remaining entry count. Guard order is primary →
registered → locked → dirty, all refusing before any deletion. `SessionManager.stop` now resolves on
the PTY's real exit (capped at 3000 ms), so removal no longer races the terminals it just killed.

This also closed a **latent data-loss bug** found while probing: git for Windows treats a junction as
a directory and recurses into it, so `git worktree remove --force` was emptying the shared target of
AD-013's skills junctions **while reporting success**. Node's `fs.rm` unlinks junctions instead, so
delete-first fixes it as a side effect. Worth checking whether any real shared-skills folder was
already emptied by a past removal.

**Commit map:**
| Commit | Task | What |
| ------ | ---- | ---- |
| 16d2c2f | plan | spec (WRFT-01..07) + design + tasks |
| 34f8970 | T0 | gate stabilization — `testTimeout`/`hookTimeout` 30000, one racing fixture window widened (added during Execute after two runs of untouched `main` came back red: `2 failed`, then `14 failed`) |
| b286a46 | T1 | `dir-remover.ts` — `removeDirTree` + `DELETE_RETRY_INTERVAL_MS`/`DELETE_RETRY_BUDGET_MS`, DI'd fs deps (+9) |
| bdc32fe | T2 | real-fs hazard tests — junction target survives, dangling junction, read-only + nested repo, real external-holder lock (+6) |
| 32eb539 | T3 | porcelain `locked` parsing — reason / `''` / `undefined` are distinguishable (+3) |
| dd7f31c | T4 | `removeWorktree` reordered to delete-then-deregister, 6-step guard table, deleter injected (+10) |
| f8a4af8 | T5 | `leftover` through `shared/worktrees.ts` → IPC → `WorktreeDetail` (producer + consumer together, L-001) |
| b090c6f | T6 | `SessionManager.stop` awaits the real PTY exit, capped at `SESSION_EXIT_WAIT_MS = 3000`; `killAll` stays fire-and-forget (+3) |
| ac71cfb | T7 | `smoke-remove.mjs` + seed extended with the WRFT-06 blocked-then-retry flow (**written, never run**) |
| dcc50dc | T8 | AD-014 + spec traceability + handoff |
| 124340c | F1 | **Verifier r1 gap** — assert `RemoveWorktreeResult.leftover` by value (it was only ever a spy *input*) |
| 5aafb90 | F2 | **Verifier r1 gap** — pin the recursive `remaining` count against real fs |
| 6f3af8a | — | spec precision: `remaining` is the **recursive** count; `leftover` is part of the returned contract; guard refusals carry none |
| 1abe8aa | F3 | **Verifier r2 gap** — mixed file+directory residue fixture (one locked chain, `pwsh` `FileShare.None` holder) so 3/2/1/1 separates four readings |
| 45c27d5 | F4 | **Verifier r2 gap** — `leftover` absence asserted on all four guard refusal paths, not just `locked` |

**Verification (independent, author ≠ verifier) — 3 rounds, ending PASS.** Round 1 FAIL (14/16 mutants
killed): `leftover` never asserted, recursive count unpinned. Round 2 FAIL (8/10): the round-1 fix's
fixture was directories-only and therefore blind to *what* it counted, and guard-refusal absence was
pinned on one guard of four. Round 3 **PASS** (12/15; 3 survivors, all non-blocking and recorded).
**Every fix was test-only** — `git diff --name-only dcc50dc..HEAD` touches no production file.
Report: `.specs/features/worktree-removal-fault-tolerance/validation.md`.

**Accepted non-blocking survivors (reasoned, not oversights):** a guard `leftover` conditioned on
`force: true` (contrived; every guard is pinned on its non-force path); `blockedPath` naming the first
rather than the last failing attempt (the spec leaves it open and a discriminating fixture needs two
holders releasing mid-loop — racy); and the two guard message literals, whose behavior is pinned while
their wording is not (the Verifier recommends **not** fixing this).

**OUTSTANDING — owner tasks, in order:**
0. **`worktree-hook-workspace-config` (AD-015):** ~~(a) create a worktree for
   `M:\Triade\source\Code` from the New Worktree dialog and confirm the junctions land.~~
   **DONE 2026-08-04** — driven over CDP against the dev app; create succeeded with no hook-failure
   advisory and both junctions landed in `Code-99999` pointing at its own `.github\skills`. The
   throwaway worktree and branch were removed (delete-first per AD-014) and `Code` is back to its
   original 10 worktrees. Full run + an incidental `{repo}-{id}` template finding in
   `validation.md`. ~~(b) create the GitHub issue, then push and open the PR.~~ **DONE 2026-08-05 —
   issue #74 + PR #75 (`Closes #74`), based on `main`, not on the removal branch: PR #73 had already
   merged, so there was nothing left to stack on.** Remaining: **review + merge PR #75.**

   Note for any future hand-testing of the dialog: the dev build reads
   `%APPDATA%\playground`, **not** the installed nightly's `%APPDATA%\playground-nightly`, so it
   starts with no workspaces until that config is seeded. And with the global
   `ado.worktreeTemplate` = `{repo}-{id}`, always hand-test with a branch carrying a 2+ digit
   number — a numberless branch renders `{id}` to `''` and the create is refused as a collision
   with the repo's own folder.
1. **Live smoke** for removal — now a follow-up against **merged** code, not a gate (discharges
   WRFT-06): `node scripts/seed-smoke-remove.mjs`, then
   `npm run dev -- -- --remote-debugging-port=9222`, then `node scripts/smoke-remove.mjs`. One-shot —
   re-seed before each run. Note a blocked deletion still removes everything it can reach, so the retry
   click may face either a direct remove or the confirm dialog; the script handles both.
2. **Visual pass** on the Danger section (WRFT-06 AC 4 — long-path wrapping; that markup has never
   been rendered).
3. ~~**Create the GitHub issue** for the removal feature, then push and open the PR.~~ **DONE —
   issue #72 + PR #73, merged 2026-07-31** (`origin/main` = `7cc8c76`).
   Also worth doing: check whether any real shared-skills folder was already emptied by a past
   `git worktree remove --force` before the delete-first fix landed (AD-014's latent data-loss bug).
   The AD-015 end-to-end run is mild counter-evidence — those junctions point *inside* each
   worktree, so the blast radius was smaller than feared — but it is not a clean bill of health.
4. ~~**Lessons store has no writer.**~~ **RESOLVED 2026-07-31 — the writer exists and the hand
   edits were verified correct.** `scripts/lessons.py` is not missing: it ships **inside the skill
   package**, and the docs' `python3 scripts/lessons.py` is relative to the skill directory, not to
   this repo — which is why it read as absent. It runs here despite `python`/`python3` being dead
   Microsoft Store aliases, via Azure CLI's bundled interpreter (Python 3.13.11). Note `--root` is a
   **top-level** argument, before the subcommand:

   ```bash
   PY="C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe"
   SK="C:/Users/<user>/.claude/skills/tlc-spec-driven"
   "$PY" "$SK/scripts/lessons.py" --root "M:/obogoni/playground" list --status confirmed
   ```

   The hand-maintained entries (**L-005 promoted to `confirmed`** on `promote_threshold=2`, plus
   candidates **L-006** *payload asserted as fixture input only* and **L-007** *a fixture shaped
   around the known mutation*) were checked against the script: `status` reports 7 lessons /
   confirmed=2, and re-rendering a scratch copy of `lessons.json` reproduces both `LESSONS.md` and
   `lessons.json` **identically** (modulo CRLF, which `.gitattributes eol=lf` normalizes on add). So
   the format is correct and future writes can go through the script.
5. **Follow-up PR** for WRFT-07 (T9–T11 are specified verbatim in `tasks.md`).
