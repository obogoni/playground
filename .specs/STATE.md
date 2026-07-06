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

**Status (current, 2026-07-06):** **Workflows epic (issue #56) — DONE + CLOSED.** WF1–WF5
(incl. the WF5 hi-fi rebuild) all **MERGED to `main`**. WF5 + hifi landed via **PR #67**
(merge commit `668b2d4`); the `feature/workflows-ui` branch is deleted; issue #56 is **CLOSED**.
The owner-run two-example UI gate **PASSED** (handoff fidelity confirmed). Details of the hifi
slice below for the record.

**WF5 hi-fi rebuild (`workflows-ui-hifi`, AD-012): EXECUTED + VERIFIED (PASS) + MERGED.** Built on
the (now deleted) branch `feature/workflows-ui`. All 11 tasks / 5 phases committed inline via one sub-agent per phase
(`d256870..c38f996`, 11 atomic commits). **Verifier PASS** (independent, author ≠ verifier):
10/10 backend unit ACs matched spec outcome (payload/conjunction rule satisfied — every field
asserted on value), 14/14 renderer ACs data-path present (visual proof deferred to the owner UI
gate per convention), gate green **486/486 tests / 36 files**, `npm run build` OK, discrimination
sensor **6/6 mutants killed** (reducer step-finished guard, manager durationMs, stepId
monotonicity, agent `read` permission default, groupRollup precedence, stepStatus ok-flag), no
survivors, no gaps. Report: `.specs/features/workflows-ui-hifi/validation.md`. **Merged to `main`**
via PR #67 (`668b2d4`, `Closes #56`, admin merge per the copilot_code_review ruleset).

**Commit map (`d256870..c38f996`, in order):**
| Commit | Task | What |
| ------ | ---- | ---- |
| d256870 | T1 | StepEvent enrichment (StepKind/PermissionPreset/StepDetail, `step-finished` kind + stepId/stepKind/durationMs/ok/agent/agentResult/detail) + ipc `workflow:run-started`/blocked `sessionId?` + reducer `step-finished` fold (+4 tests) |
| ddba92b | T2 | start/finish instrument seam (ctx `startStep`/`finishStep` replace `emitStep`; per-kind detail + agent extractors; onBlocked forwards sessionId) + manager clock/stepId (`#stepSeq`/`#stepStart`, durationMs) (+15) |
| ba78590 | T3 | manager broadcasts `step-finished`/`run-started`/terminal `failed` (error/stdout/code) + `AgentStepError.detail` surfaced + blocked `sessionId` emit (+5) |
| 8ca31fb | T4 | `workflow-run-view` fold rebuild — `StepNode[]`, `stepStatus`, `groupRollup` (failed>blocked>running>done>pending), run-started/input/startedAt/blockedSessionId/error seeds; transitional `timeline` kept (+19, replaced 12 WF5 fold tests) |
| a294d5b | T5 | `relative-time` pure helper extracted from TopBar (+4) |
| 56022ff | T7 | Icon glyphs (`workflow-nodes`/`play`/`help-circle`/`x-circle`/`stop-square`) + TopBar Workflows segment uses `workflow-nodes` |
| 899ddc9 | T6 | `use-workflow-runs` consumes `workflow:run-started`, retires `pendingWf` hack |
| 01461e9 | T8 | hifi `RunDetail` — node timeline+glyphs+connectors, kind tags, durations, group rollup, step + agent detail boxes, header+relative-time, INPUTS strip, hifi respond panel+session note, failed footer; **dropped transitional `timeline`** from RunView+fold (−1 timeline-only fold test) |
| a7bf88f | T9 | hifi `WorkflowsView` rail — DEFINITIONS cards + RECENT RUNS + relative time + pipeline glyph empty state |
| 070da74 | T10 | hifi `WorkflowTriggerDialog` (kicker, tile, mono fields, required `*`, play-triangle Run) |
| c38f996 | T11 | `implement-ticket` fixture wraps worktree.create+agent in one `ctx.step` group (WHF-14 live gate); `notify(JSON)` result line preserved |

**SPEC_DEVIATION (benign, Verifier-confirmed):** `RunDetail.css:14` + `WorkflowsView.css:21`
materialise `@keyframes pulse` component-locally — the handoff/design assumed a shared `pulse`
keyframe but `global.css` only had `fadeIn`/`popIn`/`toastIn`. No new named animation beyond the
handoff's set, no new tokens. Distilled as lesson **L-002** (candidate, `spec_deviation`): grep
`global.css` to confirm a referenced CSS keyframe exists before a UI design cites it as existing.

**DONE (this session):** owner-run two-example UI gate PASSED → PR #67 created → admin-merged to
`main` (`668b2d4`) → issue #56 CLOSED → branch deleted. **No open next step for the Workflows epic.**

**Deferred (spec Out of Scope):** Re-run action; live token-by-token agent stdout tail; persisted-run
read channel (`workflows:get`); backend `ctx.step` rollup status (renderer-derived); agent kind tag
shows `agent` (no `agentId` on the stream — box uses the step label as name).

**Baseline note:** `feature/workflows-ui` now at **486 tests / 36 files** green (was 440 at WF5
Verifier; T1–T5 added ~+47 unit tests, T6–T11 added 0 per renderer/fixture hand-verify convention;
T4 replaced WF5's 12 fold tests, T8 dropped 1 timeline-only fold test). Gate:
`npm run typecheck && npm run lint && npm test` (+ `npm run build`). AD-005 `tree.test.ts` real-git
Windows flake did not fire in the Verifier's full run; re-run in isolation if a future gate flakes on it.

**Prior context:** `worktree-existing-branch` (PR #62), `topbar-version-indicator` (PR #63),
WF1–WF4 all merged. Pre-existing quirk: `src/main/ado-gateway.ts` is UTF-16 (git treats it as binary).
Open follow-ups: 3 transitive dev advisories (esbuild/form-data/undici); App.tsx
`useTasks`/`useConfig` extraction deferred (AD-004).
