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
| AD-009 | 2026-07-06 | **WF3 MERGED to `main` (PR #65).** Independent SDD eval (author≠judge, `spec-driven-eval`): **Final 0.98 — "Spec-complete"** (S=PASS, E recall/precision/justified ≈1.0, gates build/lint/unit green; live smoke owner-PASS 6/6). Two minor gaps merged as-is and **carried into WF4** (WF3-04 generic retry prompt; WF3-10 unasserted server reuse). **WF4 planning deferred to the next session.** | The two gaps are cheap polish on the same runner/`--resume` path WF4 already touches, so folding them into WF4 avoids a throwaway PR. Report: `.specs/features/workflows-agent-step/evaluations/P1-workflows-agent-step-20260706T141244Z.md`. |
| AD-008 | 2026-07-03 | **WF3 (Structured agent step) scope pinned via 4 owner decisions:** (1) **Arm M (MCP) only** — one shared loopback HTTP MCP server, per-step bearer token = auth+routing, forced `emit_result`; Arm N (`--json-schema`) dropped. (2) **ajv** for payload validation (promotes `emit-result-schema` off the spike's minimal checker; `expect` stays a JSON Schema). (3) `ctx.agent()` returns the **full envelope** `{status,data?,question?,sessionId}`; `blocked` is returned **as-is** (no engine pause in WF3 — that's WF4). (4) Permission presets **read/write/bypass**, default **read** (read = read-only tools + `emit_result`, guaranteed non-mutating). | Findings recommended Arm M to keep the `blocked` terminal value + per-step routing first-class for WF4; ajv because the author declares a JSON Schema and the tool `inputSchema` is JSON Schema too; full-envelope return lets WF4 add the pause without breaking the happy path; the preset set is PRD-fixed (US 26). Spec: `.specs/features/workflows-agent-step/spec.md` (WF3-01..25). |

## Handoff

**Status (current, 2026-07-06):** Workflows epic (issue #56) — **WF1 + WF2 + WF3 MERGED
to `main`** (WF1/WF2 = PR #64; WF3 = PR #65, merge `02e8795`). **WF4 (Blocker + resume) —
EXECUTED + independently VERIFIED (PASS).** On branch **`feature/workflows-blocker-resume`**
(cut off `main` @ `02e8795`). Epic #56 stays **open** (WF4 owner-run smoke + PR/merge, then
WF5 remain).

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

**Next step (resume here):** WF4 is DONE + VERIFIED + owner-smoke PASSED. Only the PR/merge
remains:
1. **Open the WF4 PR** (`gh pr create`, body must carry `Closes` line only if WF4 has its
   own issue — else reference epic #56; do NOT auto-close #56, WF5 remains). main is gated by
   the `copilot_code_review` ruleset — a force-pushed PR goes BLOCKED → merge with
   `gh pr merge --admin`.
2. **WF5 (Workflows UI)** is the remaining epic milestone (the view, run timeline, and the
   **blocked-respond panel** that consumes WF4's `workflow:blocked` + `workflow:focus-run`
   signals). Specify it next milestone-by-milestone (AD-006).

**Prior context:** `worktree-existing-branch` (PR #62), `topbar-version-indicator` (PR #63)
merged. Pre-existing quirk: `src/main/ado-gateway.ts` is UTF-16 (git treats it as binary).
Open follow-ups: 3 transitive dev advisories (esbuild/form-data/undici); App.tsx
`useTasks`/`useConfig` extraction deferred (AD-004).
