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

## Handoff

**Status (current, 2026-07-06):** Workflows epic (issue #56) — **WF1–WF4 MERGED to `main`**
(WF4 = PR #66, merge `660180b`). **WF5 (Workflows UI): first pass EXECUTED + VERIFIED (PASS)**
on branch **`feature/workflows-ui`** (`5f0ad4d..1c5b84c`), **but the owner caught a
fidelity gap** — the hi-fi design handoff `design/handoff/DESIGN_HANDOFF_WORKFLOWS.md` was
missed during Design, so the delivered timeline is low-fi. The **hi-fi rebuild slice
`workflows-ui-hifi` (AD-012, amends AD-011): Spec + Design + Tasks are DONE + APPROVED —
`EXECUTE is the next step`** (fresh session, on the same branch `feature/workflows-ui`). NOT
merged to `main` — the hifi work lands on the same branch, then one PR closes #56. Epic #56 stays
**open**.

**Design + Tasks APPROVED this session (`workflows-ui-hifi`, no code yet):**
`.specs/features/workflows-ui-hifi/{design.md,tasks.md}` (both Status: Approved). **11 tasks / 5
phases.** One owner decision taken during Design — **fixtures = "light"**: wrap the
`implement-ticket` body in ONE `ctx.step` group so WHF-14 group rollup gets live gate coverage
without an ADO dependency; `review-pr` stays flat; the `ado` `StepDetail` variant (WHF-15) is
fold-unit-tested + eyeballed only (logged assumption — shares the render path with the `files`
detail box that review-pr exercises live). Key design calls (feature-local, no new AD): manager
owns the clock + monotonic `stepId` (reducer stays clock-free); `start/finish` instrument bracket
replaces `emitStep` (T2 wires producer `workflow-ctx` + consumer `workflow-manager` in ONE task
per **L-001** — no interim `optional`); a per-step **`ok` flag** on `step-finished` (false on
throw) drives the failed node glyph + group rollup without a failing-stepId hack; `group` stays a
**label string** (kept the `StepEvent` change purely additive → green gate per task; duplicate-
label collision is an accepted v1 edge); `RunView.timeline` is kept **transitionally** (expand-
contract) and dropped in **T8** when `RunDetail` — its only consumer — moves to `steps`.

**Phase map (offer sub-agents at Execute — >3 phases):**
- **P1 (seq):** T1 shared `StepEvent`/`ipc-contract` growth (additive: `StepKind`/`PermissionPreset`/
  `StepDetail`/`step-finished` kind + `stepId`/`stepKind`/`durationMs`/`ok`/`agent`/`agentResult`/
  `detail`; `workflow:run-started`; `workflow:blocked` +`sessionId`) + reducer `step-finished` fold.
- **P2 (seq):** T2 `start/finish` seam (ctx+manager, clock/stepId, per-kind detail + agent extractors,
  onBlocked forwards sessionId) → T3 manager broadcasts (`step-finished`/`run-started`/`failed`/
  blocked `sessionId`) + read `AgentStepError.detail` for failure evidence.
- **P3 (‖):** T4 `workflow-run-view` fold rebuild (StepNode[], `stepStatus`/`groupRollup`, seeds) ·
  T5 `relative-time` helper.
- **P4 (‖):** T6 hook (consume `run-started`, retire `pendingWf`) · T7 Icon+TopBar pipeline glyph
  (`workflow-nodes`) · T8 RunDetail hifi rebuild (+drop transitional `timeline`) · T9 WorkflowsView
  rail hifi · T10 hifi Run-workflow dialog.
- **P5 (seq):** T11 `implement-ticket` `ctx.step` group (WHF-14 live gate).
- **Baseline to reconfirm at Execute start:** `npm test` — STATE records **440/440** (WF5 Verifier);
  T1–T5 add ~40 unit tests, T6–T11 add 0 (renderer/fixture hand-verified per TESTING.md). Gate:
  `npm run typecheck && npm run lint && npm test` (+ `npm run build` after the renderer rebuild).
- **Two-example UI gate (owner-run, the milestone gate):** `npm run dev -- -- --remote-debugging-port=9222`
  then drive "implement ticket" + "review PR" — verify handoff fidelity (kind tags, durations, agent
  box w/ emitted data, group rollup, blocked panel + session note, resume, done/failed footer).
- **After Execute → Verifier (author≠verifier) → owner UI gate → one PR (`Closes #56`) →
  `gh pr merge --admin`** (copilot_code_review ruleset).

**WF4 Execute done this session (all 8 tasks, 3 phases, inline — 8 atomic commits
`7a0db81..c938ad3`):**
| Commit | Task | What |
| ------ | ---- | ---- |
| 7a0db81 | T1 | shared `blocked` RunStatus + `BlockerQuestion`/`RespondDecision` + `blocked`/`resumed` StepEvent kinds + `workflows:respond`/`workflow:blocked`/`workflow:focus-run` IPC (type-only) |
| abf7048 | T2 | `run-state` reducer `running→blocked`, `blocked→running`, `blocked→cancelled` (+7 tests) |
| 20d48f1 | T3 | `mcp-result-server` field-level `lastError(token)` + `start()` bind-failure reject (+4) |
| f783447 | T4 | `agent-step-runner` outer block-loop over `#turn`; abort→throw, guidance→`--resume` same session; field-level corrective prompt; reuse/bind coverage (+8) |
| d0d7545 | T5 | `ctx.ask` + `ctx.agent` `onBlocked` wire + `CtxRuntime.requestInput` (optional, SPEC_DEVIATION for T5→T6 ordering) + `BlockedResolver` export (+5) |
| e1f889e | T6 | `WorkflowManager` `#pendingRespond` pause primitive, `respond`, cancel-while-blocked reject, `workflow:blocked` emit + lifecycle toasts on block/done/failed (cancel silent) (+8) |
| e9d1c2a | T7 | `index.ts` `workflows:respond` handler + `notifier(…,{runId})` click→focus + `workflow:focus-run` (hand-verified shell) |
| c938ad3 | T8 | `implement-ticket` fixture + `scripts/smoke-blocker-resume.mjs` owner-run gate |

**Verifier verdict (independent, author ≠ verifier) — PASS:** 20/20 ACs (17 unit-covered
with located assertions; **WF4-15/16/17 deferred-by-design** = index.ts hand-verified shell
+ owner-run CDP smoke, per the test matrix). Gate: typecheck 0 err, lint 0 err (22
pre-existing prettier warnings), **422/422 tests / 33 files** (390 → +32, 0 deletions).
Discrimination sensor **5/5 mutants killed** (run-state resumed guard, runner
guidance-`--resume`/field-level prompt, manager `respond` runId guard, mcp `lastError`
capture). No surviving mutants, no evidence-zero gaps. Report:
`.specs/features/workflows-blocker-resume/validation.md`.

**Baseline flaky note:** `src/main/tree.test.ts > snapshots a workspace with repos and
their worktrees` is the AD-005 real-git-on-Windows EPERM/timeout flake (passes 4/4 in
isolation, NOT WF4-touched). It did **not** flake in the Verifier's full run. If a future
gate flakes on it, re-run `npx vitest run src/main/tree.test.ts` in isolation before
treating it as real.

**SPEC_DEVIATIONS (all benign, Verifier-confirmed):** `workflow-ctx.ts` types `agent?`,
`signal?` (WF3) and **`requestInput?`** (WF4-T5) as optional to keep the interim phase's
typecheck green across the producer/consumer split; production always injects all three via
`index.ts`/manager, and the leaves throw clear errors if unconfigured. This recurring
pattern promoted lesson **L-001 to `confirmed`** (recurrence 2) via `scripts/lessons.py`.

**Owner-run live smoke (WF4-17) — PASSED 9/9 (2026-07-06):** `node
scripts/smoke-blocker-resume.mjs` vs a live Claude subscription — runId `42c4317e`,
statuses **`[running,blocked,running,done]`**, run-log records `blocked` + `resumed`
transitions, non-empty `session_id` `047d6c90-...` (same session resumed via `--resume`),
result validates vs `IMPLEMENT_SCHEMA` (agent created `greeting.js`). Closes the design's one
empirical risk. Three T8-only fixes were needed during the run (core T1–T7 untouched):
(1) prompt made blocking a mandatory two-phase protocol (a capable agent finished `done`
without asking); (2) `ctx.worktree.create` needs a `baseBranch` to cut a NEW branch
(`-b <branch> <base>` — without it, `invalid reference`); (3) smoke resets its window
collectors per run (app survives across invocations → stale collector read the prior runId).
Extra commits after the docs commit: `7bdb84c`, `054c8fa`, `c30a28c` (+ this docs update).

**WF5 Execute done this session (all 10 tasks, 3 phases, inline — 11 atomic commits
`5f0ad4d..1c5b84c`):** T1 `workflow-run-view` pure fold + 12 tests; T3 shared `ScaffoldResult`
+ `workflows:scaffold` contract; T2 `workflow-scaffold` module + 6 tests; T4 `useWorkflowRuns`
always-mounted hook; T5 `WorkflowTriggerDialog`; T6 `NewWorkflowDialog`; T7 `RunDetail` +
`RespondPanel`; T8 `workflows:scaffold` handler + `shell.showItemInFolder` reveal; T9
`WorkflowsView` master-detail; T10 App integration (`'workflows'` direction + TopBar tab +
render branch + `workflow:focus-run` effect). Plus one test-hardening commit (`268759c`):
scaffold template-validity test compiles via `esbuild.transform` + `data:` URL import instead
of the real loader, removing a shared-`tmpdir` race with `workflow-loader`'s leak test.

**Verifier verdict (independent, author ≠ verifier) — PASS:** 25/25 ACs implemented with
located evidence (5 unit-covered: WF5-10/11/12 fold half + WF5-23/24; the other 20
hand-verified renderer/IPC wiring, proof deferred to the owner-run UI gate — mirrors WF4). Gate:
typecheck 0 err, lint 0 err (1 tolerated prettier warning), **440/440 tests / 35 files** (422 →
+18). Discrimination sensor **5/5 mutants killed** (fold keep-blocked / drop-step-row /
upsert-ignore-create; scaffold EEXIST-guard / sanitize-trim). No survivors, no gaps. Prod build
(`npm run build`) OK. Report: `.specs/features/workflows-ui/validation.md`.

**WF5 first pass (done + merged-to-branch, low-fi):** 11 commits `5f0ad4d..1c5b84c` — pure fold
`workflow-run-view` (+tests), `workflow-scaffold` (+tests), `ScaffoldResult`/`workflows:scaffold`
contract + handler, `useWorkflowRuns` hook, `WorkflowTriggerDialog`, `NewWorkflowDialog`,
`RunDetail`+`RespondPanel`, `WorkflowsView`, App integration. Verifier PASS (25/25). These files
are the rebuild's starting point — the hifi slice rewrites the renderer + enriches the backend.

**Next step (resume here — Design of `workflows-ui-hifi`):**
- **Spec (APPROVED):** `.specs/features/workflows-ui-hifi/spec.md` — 24 ACs. WHF-01..10 =
  backend event enrichment (unit-tested): `stepKind`+`stepId` on step-started; new
  `step-finished {stepId, durationMs}` (instrument times fn; reducer stays clock-free); agent
  `{prompt,permission}` on start + `{status,data,sessionId}` on finish; broadcast failed
  `error/stdout/code` (incl. from `AgentStepError.detail`); new `workflow:run-started
  {runId,workflowId,input,startedAt}`. WHF-11..24 = renderer rebuild to the handoff
  (node timeline+glyphs+connectors, kind tags, durations, group rollup, step + agent detail
  boxes, header+relative-time, INPUTS strip, hifi respond panel + session note, failed footer,
  hifi cards/RECENT-RUNS, pipeline glyph, hifi dialog).
- **Backend files to enrich (all merged + tested — do NOT break their suites):**
  `src/shared/workflows.ts` (StepEvent: add `stepKind`/`stepId`/`durationMs`/`agent`/`agentResult`;
  new `step-finished` kind), `src/shared/ipc-contract.ts` (add `workflow:run-started`),
  `src/main/workflow-ctx.ts` (`instrument` → stepId + kind + timing + finish; agent detail),
  `src/main/run-state.ts` (fold `step-finished`), `src/main/workflow-manager.ts` (`#emit`
  broadcast start/finish/run-started/failed; stamp durationMs), `src/main/agent-step-runner.ts`
  (surface prompt/permission/data + failure detail; sessionId on blocked). Backend surface map
  (exact file:line for every emit/label) is in this session's Explore result.
- **Renderer files to rewrite:** `RunDetail.tsx`/`.css`, `WorkflowsView.tsx`/`.css`,
  `workflow-run-view.ts` (fold the new events into a richer `RunView`: kind/duration/detail/agent
  per step, input/startedAt per run — retire the `pendingWf` hack via `run-started`),
  `use-workflow-runs.ts`, `WorkflowTriggerDialog.tsx`, `TopBar.tsx` (pipeline glyph + `Icon`).
- **Design decisions to make:** duration/stepId correlation model (chosen: monotonic stepId,
  start+finish events); how instrument captures per-primitive result → detail box payload
  (ado task+children, changedFiles list, failed-sh cmd+output) without leaking types; group
  rollup precedence (failed>blocked>running>done>pending) in the renderer; the run-status/kind/
  permission → color CSS mappings (reuse base palette, no new tokens).
- **OPEN QUESTION (unresolved — decide at Design):** update the `scripts/fixtures/implement-ticket`
  fixture to use `ctx.step` groups per task (as the mockup shows: `ado.getTask` + child tasks →
  a `ctx.step` group per task with worktree.create + agent inside) so the group-rollup rendering
  (WHF-14) is exercised in the two-example gate? Owner was asked, did not answer yet. The current
  two fixtures are flat + inject agent `data` via `ctx.notify(JSON.stringify)`; the enrichment
  makes `data` flow natively so that notify hack can be dropped.
- Deferred (spec Out of Scope): Re-run action; live token-by-token agent tail; persisted-run
  read channel.
- **After Design → Tasks → Execute → Verifier**, then owner-run two-example UI smoke at hifi
  fidelity, then one PR (`Closes #56`) → `gh pr merge --admin` (copilot_code_review ruleset).

**Prior context:** `worktree-existing-branch` (PR #62), `topbar-version-indicator` (PR #63)
merged. Pre-existing quirk: `src/main/ado-gateway.ts` is UTF-16 (git treats it as binary).
Open follow-ups: 3 transitive dev advisories (esbuild/form-data/undici); App.tsx
`useTasks`/`useConfig` extraction deferred (AD-004).
