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
to `main`** (WF1/WF2 = PR #64, merge `e6d7e11`; **WF3 = PR #65, MERGED**, merge `02e8795`).
**WF4 (Blocker + resume) — PLANNED & OWNER-APPROVED; Execute deferred to the next session
(owner decision, 2026-07-06).** On branch **`feature/workflows-blocker-resume`** (cut off
`main` @ `02e8795`). Epic #56 stays **open** (WF4 Execute + WF5 remain).

**WF4 planning done this session (Specify→Design→Tasks, all owner-approved):**
`.specs/features/workflows-blocker-resume/`: `spec.md` (WF4-01..20, 8 US; owner Discuss
resolved 3 forks), `design.md` (**Approach A** — block-loop in the DI'd runner via injected
`onBlocked`; one manager-owned pause primitive), `tasks.md` (**8 tasks / 3 phases**, Status
**APPROVED**). Scope + architecture decisions = **AD-010**. MCP: NONE / Skill: NONE (+
`coding-guidelines` optional). **Next step = run Execute** (activate `tlc-spec-driven`;
3 phases run **inline**, no sub-agent offer since the >3-phase threshold isn't met; fresh
independent Verifier after the last task).

**WF4 baseline / gate floor:** **390 tests / 33 files** (`npx vitest run`, off `main`).
⚠ One **flaky** real-git test — `src/main/tree.test.ts > snapshots a workspace with repos
and their worktrees` — intermittently fails under full-suite parallel load (`Test timed
out in 5000ms` + `EPERM` on `afterEach` temp `rmSync`); passes **4/4 in isolation**
(`npx vitest run src/main/tree.test.ts`). AD-005 real-git-on-Windows category — NOT a
regression, NOT WF4-touched. Re-run it in isolation to confirm if a WF4 gate flakes on it.

**WF4 grafts onto (all from WF3, verified this session by reading the merged code):**
`ctx.agent` returns the full envelope and today returns `blocked` **as-is**;
`AgentStepRunner` already does `--resume` (corrective retry only) and captures `session_id`;
`WorkflowManager.notifier` is **reserved & unused**; reducer statuses are
`pending|running|done|failed|cancelled` (WF4 adds `blocked` + `resumed`); `agent-command-builder`
already emits `--resume <id>`. The 3 WF3 carry-in gaps (AD-009: field-level corrective
prompt, server-reuse assert, MCP bind-failure) are folded into WF4 tasks **T3/T4**
(WF4-18/19/20).

**WF3 (Structured agent step) — DONE** (history): all gates green incl. owner-run live
smoke (WF3-22 PASSED 6/6). Independent SDD eval (author≠judge): **Final 0.98 —
"Spec-complete"** (`.specs/features/workflows-agent-step/evaluations/P1-workflows-agent-step-20260706T141244Z.md`).

**How WF3 was executed:** Specify→Design→Tasks were already owner-approved; this session
ran **Execute** = 4 phase sub-agents (one worker/phase, sequential) + a fresh independent
**Verifier** (author≠verifier). `.specs/features/workflows-agent-step/`: `spec.md`
(WF3-01..25, 6 US), `design.md` (Approach A), `tasks.md` (12 tasks/4 phases, Status now
EXECUTED+VERIFIED), `validation.md` (**PASS**). Scope decisions = **AD-008**.

**Commits (main..HEAD, `e6d7e11..d361131`):**
| Commit | Task | What |
| ------ | ---- | ---- |
| 4896c47 | — | docs: spec + design + tasks |
| 1e01b10 | T1 | ajv + promote `@modelcontextprotocol/sdk` to prod dep (`--ignore-scripts`) |
| d864c95 | T2 | `emit-result-schema` (ajv `createValidator`/`buildToolInputSchema`) |
| c4876e4 | T3 | `scrub-auth-env` prod seam |
| 95f0166 | T4 | `parse-envelope` prod seam (`{sessionId,result}`) |
| 695abbc | T5 | `agent-command-builder` (MCP-only + read/write/bypass presets) |
| 9af5d61 | — | style: prettier line-wrap on emit-result-schema (T2 files) |
| 1bf7b12 | T6 | `mcp-result-server` (low-level `Server`, per-token, ajv) |
| 5774f7e | T7 | `agent-step-runner` (corrective `--resume` retry + cancel-kill) |
| fd25835 | T8 | `StepEvent.sessionId` + reducer pass-through |
| 0e63530 | T9 | `ctx.agent` facade + `CtxRuntime.signal` + sessionId log |
| 76e82c1 | T10 | `WorkflowManager` AbortController (cancel→abort→child-kill) |
| 88073d3 | T11 | wire mcp server + runner + `resolveClaude` + will-quit into `index.ts` |
| d361131 | T12 | `review-pr` example fixture + `scripts/smoke-agent-workflow.mjs` |

**Verifier verdict (PASS):** 25/25 ACs matched spec outcome (22 unit-covered + `index.ts`
hand-verified; **3 deferred to owner-run smoke by design** — WF3-21 fixture artifact,
WF3-22 live gate, and the runtime auto-deny behind WF3-11/14). Payload rule pass. Gate:
typecheck 0 err, lint 0 err (18 pre-existing prettier warnings, non-WF3), **390 tests /
33 files** (325 → +65, 0 deletions). Discrimination sensor **8/8 mutants killed**.
Report: `.specs/features/workflows-agent-step/validation.md`.

**Deviations (all judged BENIGN by the Verifier — no AC weakened):**
- 2 `SPEC_DEVIATION` markers in `src/main/workflow-ctx.ts`: `CtxDeps.agent` +
  `CtxRuntime.signal` typed **optional** (design §7 shows required). Reason: making them
  required breaks `workflow-ctx.test.ts` helpers (`makeDeps`/`makeRuntime`), in typecheck
  scope. Production always injects both (T11 wires agent, T10 wires signal); `ctx.agent`
  throws clearly if agent absent. → candidate lesson **L-001** (`scripts/lessons.py`).
- T5 `agent-command-builder` deliberately does NOT import `JsonSchema` (MCP arm carries
  `expect` on the server tool `inputSchema`, not in argv) — CORRECT, no AC requires it.
- T7 corrective-retry prompt is generic (server reports ajv errors in-turn; retry fires
  only on no-emit) — matches design, no AC pins the string.

**Owner-run live smoke (WF3-22) — PASSED 6/6 (2026-07-06):** `node
scripts/smoke-agent-workflow.mjs` vs a live subscription — runId
`8a8b19d7-b4a5-4f0a-8db9-6d21065037d2`, statuses `[running,done]`, run-log persisted,
non-empty `session_id` `9b1438dd-35f1-448d-bad1-fff87c7ccbb1`, findings validate vs
`FINDINGS_SCHEMA` (2 findings), and **read posture left the worktree unmutated** — this
closes the design's empirical risk (read-only allowedTools + `bypassPermissions` were
LEADS beyond WF1's confirmed `dontAsk`+emit; `read` now confirmed).

**Next step (resume here):** ✅ **WF4 planning is DONE** (Specify→Design→Tasks approved —
see the WF4 handoff block at the top of this section). **Resume by running Execute** for
`.specs/features/workflows-blocker-resume/` via `tlc-spec-driven`.

**WF3 polish carried into WF4** (from the SDD eval; both merged as-is — now WF4 tasks
**T3/T4**, requirements WF4-18/19/20):
1. **WF3-04** — the corrective-retry prompt is **generic** (`"no valid emit_result call
   was made"`). Capture the last server-reported ajv error for the token and interpolate
   it into `correctivePrompt(reason)`; add an `agent-step-runner.test.ts` assertion that
   the retry argv/prompt carries the field-level validation error.
2. **WF3-10** — server **reuse is unasserted**: add `expect(server.startCalls).toBe(1)`
   across two `run()` calls in `agent-step-runner.test.ts` (`FakeServer.startCalls` is
   already tracked but never checked).
3. **Edge (minor)** — MCP **bind-failure** path (`server.start()` rejects) is not
   unit-tested; add a runner test → clear step failure, no spawn.

**Key facts (feed WF4):** WF3's `AgentStepRunner` returns the **full envelope**
`{status,data?,question?,sessionId}` and returns `blocked` **as-is** (no engine pause —
that is WF4's job). `WorkflowManager.notifier` stays reserved for WF4 lifecycle toasts.
The `bypass` preset is confirmed only once WF4's implement-ticket example exercises it.

**Prior context:** `worktree-existing-branch` (PR #62), `topbar-version-indicator`
(PR #63) merged. Pre-existing quirk: `src/main/ado-gateway.ts` is UTF-16 (git treats it
as binary). Open follow-ups: 3 transitive dev advisories (esbuild/form-data/undici);
App.tsx `useTasks`/`useConfig` extraction deferred (AD-004).
