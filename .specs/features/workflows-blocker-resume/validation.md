# WF4 — Blocker + Resume Validation

**Date**: 2026-07-06
**Spec**: `.specs/features/workflows-blocker-resume/spec.md`
**Diff range**: `40bae9b..HEAD` (8 task commits `7a0db81..c938ad3`, branch `feature/workflows-blocker-resume`)
**Verifier**: independent (author ≠ verifier; coverage re-derived evidence-or-zero, read-only over the real tree)
**Verdict**: **PASS ✅**

---

## Task Completion

| Task | Scope | Status | Notes |
| ---- | ----- | ------ | ----- |
| T1 shared types + IPC | `shared/workflows.ts`, `shared/ipc-contract.ts` | ✅ Done | `RunStatus += blocked`; `StepEvent.kind += blocked/resumed` + `question?`; `BlockerQuestion`/`RespondDecision`; `workflows:respond` + `workflow:blocked`/`workflow:focus-run`. Type-only (build gate). |
| T2 run-state transitions | `run-state.ts` (+test) | ✅ Done | blocked/resumed/cancelled-from-blocked; 12 new reducer tests. |
| T3 mcp-server lastError + bind | `mcp-result-server.ts` (+test) | ✅ Done | `reg.lastError` capture + `lastError(token)`; `once('error', reject)` in `start()`; 4 new tests (real loopback). |
| T4 agent-step block-loop | `agent-step-runner.ts` (+test) | ✅ Done | outer block-loop over `#turn`; guidance-resume; abort throws; field-level retry; reuse/bind; 8 new tests. |
| T5 ctx.ask + onBlocked wire | `workflow-ctx.ts` (+test) | ✅ Done | `ctx.ask` via `instrument('ask')`; `CtxRuntime.requestInput`; `BlockedResolver`; `ctx.agent` onBlocked wire; 6 new tests. |
| T6 manager pause/respond/toast | `workflow-manager.ts` (+test) | ✅ Done | `#pendingRespond`, `requestInput`, `respond`, cancel-while-blocked, lifecycle toasts; 8 new tests. |
| T7 index wiring | `index.ts` | ✅ Done | `workflows:respond` handler; `notifier(…, {runId})` click→focus+`workflow:focus-run`. Hand-verified thin shell (no unit tests, per matrix). |
| T8 example + smoke gate | `fixtures/implement-ticket/workflow.ts`, `scripts/smoke-blocker-resume.mjs` | ✅ Done | fixture (write/bypass, no pause code) + CDP smoke. Owner-run gate (live subscription). |

---

## Spec-Anchored Acceptance Criteria

Layer legend: **U** = unit-covered; **HV** = hand-verified thin shell (`index.ts`, "none" layer per matrix); **SMOKE** = owner-run smoke gate (live subscription, "none" layer).

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WF4-01 blocked agent step → run `blocked`, emit `workflow:blocked`, suspend, no resolve/throw | status blocked + event carries question + toast; run suspends | `workflow-manager.test.ts:407` — after `untilBlocked`: `store.load(runId).status==='blocked'`, `blockedEvt.payload.toEqual({runId,question})`, notifier called with question body+runId; ctx wire `workflow-ctx.test.ts:462` `onBlocked` delegates to `runtime.requestInput` (`asks.toEqual([q])`) | ✅ PASS (U) |
| WF4-02 guidance → resume SAME session via `--resume <sessionId>` + guidance prompt, fresh token | resume argv `--resume <id>` + guidance text | `agent-step-runner.test.ts:406` `calls[1].argv.slice(0,2).toEqual(['--resume','sess-A'])`; `:407` `argv.toContain('use staging')` | ✅ PASS (U) |
| WF4-03 resumed done → `ctx.agent` resolves `{status:done,data,sessionId}` (no author code) | resolves with RESUMED sessionId | `agent-step-runner.test.ts:400` `res.toEqual({status:'done',data:{answer:9},sessionId:'sess-A2'})` | ✅ PASS (U) |
| WF4-04 blocked again → pause again, unbounded rounds, each emits `workflow:blocked` | onBlocked called each round, loops to done | `agent-step-runner.test.ts:443` `res` done `sessionId:'s3'`; `:444` `questions.map(body)==['q1','q2']`; `:445` `calls.toHaveLength(3)`; `:446-447` each resume `--resume s1`/`s2` | ✅ PASS (U) |
| WF4-05 abort → raise cancellation, no further turn | throw `CancellationError`, no more spawn | `agent-step-runner.test.ts:464` `rejects.toBeInstanceOf(CancellationError)`; `:468` `calls.toHaveLength(1)` | ✅ PASS (U) |
| WF4-06 reducer blocked/resumed/cancelled; blocked non-terminal; terminals frozen | running→blocked, blocked→running, blocked→cancelled; guarded no-ops | `run-state.test.ts:78` running→blocked (question intact); `:87` blocked→running; `:94` blocked→cancelled; `:114` step/log/done/failed-while-blocked no-op (`.toBe(b)`); `:130` terminal ignores blocked/resumed | ✅ PASS (U) |
| WF4-07 respond resolves pending (blocked→running); stray/unknown/already-resolved = no-op | resolve once with decision; guarded no-op | `workflow-manager.test.ts:438` respond(guidance)→resumed + `received().toEqual(decision)`; `:458` respond(abort) resolves `{action:'abort'}` no throw; `:473` wrong runId stays blocked, duplicate-after-settle `not.toThrow()` | ✅ PASS (U) |
| WF4-08 second `workflows:run` refused while blocked (serial guard held) | reject `/already active/` | `workflow-manager.test.ts:531` `rejects.toThrow(/already active/i)` while blocked | ✅ PASS (U) |
| WF4-09 cancel while blocked → pending rejects `CancellationError`, run `cancelled`, guard released | reject + cancelled + subsequent run succeeds | `workflow-manager.test.ts:493` `caught instanceof CancellationError`, status `cancelled`, then a second `run` reaches `done` | ✅ PASS (U) |
| WF4-10 cancel/abort-while-blocked-on-agent spawns no further child | no resume spawn | `agent-step-runner.test.ts:468` abort→`calls.toHaveLength(1)`; `:493` abort mid-loop→`calls.toHaveLength(2)` (nothing past abort) | ✅ PASS (U) |
| WF4-11 `ctx.ask` blocks + returns decision as-is, no throw on abort | returns `{action,guidance?}`; abort no throw | `workflow-ctx.test.ts` ctx.ask returns decision (`got.toBe(decision)`), abort `resolves.toEqual({action:'abort'})` (no throw); manager `workflow-manager.test.ts:458` end-to-end abort no-throw | ✅ PASS (U) |
| WF4-12 `ctx.ask` via `instrument` (`step-started` `ask` + cancel check) | auto step + checkCancel | `workflow-ctx.test.ts` `steps.toEqual([{label:'ask',group:undefined}])`; cancelled-before-ask `rejects CancellationError` + `asks.toEqual([])` | ✅ PASS (U) |
| WF4-13 toast on block(question)/done/failed; cancel silent | 3 lifecycle toasts, cancel none | `workflow-manager.test.ts:428` block toast body=question; `:545` done `'Workflow finished'` + failed `'Workflow failed'` w/ error; `:579` cancelled `calls.toEqual([])` | ✅ PASS (U) |
| WF4-14 lifecycle toast distinct from `ctx.notify` author toast | separate notifier, author independent | `workflow-manager.test.ts:582` author toast via `ctxNotifier` (title `Workflow`, no runId); lifecycle via `notifier` (runId set); author msg not in lifecycle notifier | ✅ PASS (U) |
| WF4-15 toast click → focus + `workflow:focus-run` reveal | window show/focus + event w/ runId | `index.ts` notifier: `opts.runId` → `notification.on('click', … mainWindow?.show()/focus(); emitToWindow('workflow:focus-run',{runId}))` | ✅ PASS (HV — deferred by design) |
| WF4-16 `implement-ticket` example (write/bypass, no pause code) | worktree + one write agent step, no pause/resume logic | `fixtures/implement-ticket/workflow.ts` — `ctx.worktree.create` + single `ctx.agent({permission:'write'})`; author file has NO requestInput/ask/resume calls (verified by read) | ✅ PASS (structural; SMOKE — deferred by design) |
| WF4-17 smoke: blocked → guidance → resume same session → done | live gate asserts same session_id resumed, done | `scripts/smoke-blocker-resume.mjs:181-251` checks: blocked+question, `workflows:respond` guidance, resumed transition, final `status==='done'`, non-empty `session_id` | ✅ PASS (SMOKE — owner-run, deferred by design) |
| WF4-18 corrective retry carries field-level ajv error | retry prompt names offending field | `agent-step-runner.test.ts:521` retry argv contains `data/answer must be number`; `:542` fallback generic when none; server side `mcp-result-server.test.ts` `lastError(token)` `/answer/`+`/number/`, undefined for unknown/valid | ✅ PASS (U) |
| WF4-19 shared server `start()` called exactly once across two runs | reused, not restarted | `agent-step-runner.test.ts:567` after two `run()`s `server.startCalls===1` | ✅ PASS (U) |
| WF4-20 MCP bind-failure → `start()` rejects, step fails, no spawn | reject + no agent spawn | `mcp-result-server.test.ts` `second.start(port)` `rejects.toThrow()` (real EADDRINUSE); `agent-step-runner.test.ts:580` `run` `rejects.toThrow(/EADDRINUSE/)` + `calls.toHaveLength(0)` | ✅ PASS (U) |

**Coverage: 20/20 ACs matched** — 17 unit-covered, WF4-15 hand-verified (deferred by design), WF4-16/17 owner-run smoke (deferred by design). No unmatched, no evidence-zero gaps.

---

## Discrimination Sensor (5 injected / 5 killed / 0 survived)

All mutations injected into NEW WF4 code, run against the covering test file, confirmed KILLED, then reverted via `git checkout`. Tree confirmed clean after (`git status --short` empty).

| # | File | Mutation | Covering test | Result |
| - | ---- | -------- | ------------- | ------ |
| 1 | `run-state.ts:57` | `resumed` guard `!== 'blocked'` → `=== 'blocked'` (blocked→running never fires) | `run-state.test.ts` | **KILLED** (3 failed) |
| 2 | `agent-step-runner.ts:169` | guidance path `resumeId = sessionId` → `undefined` (drops `--resume`) | `agent-step-runner.test.ts` | **KILLED** (2 failed) |
| 3 | `agent-step-runner.ts:208` | feed generic reason instead of `server.lastError(first.token)` | `agent-step-runner.test.ts` | **KILLED** (1 failed) |
| 4 | `workflow-manager.ts:196` | drop `runId !== #activeRunId` from `respond` guard (stray respond resolves) | `workflow-manager.test.ts` | **KILLED** (1 failed) |
| 5 | `mcp-result-server.ts:102` | remove `reg.lastError = result.error` capture | `mcp-result-server.test.ts` | **KILLED** (1 failed) |

The suite discriminates on all five highest-risk new behaviors (reducer guard, resume argv, field-level prompt, respond target guard, lastError capture). No weak-test gaps.

---

## Code Quality

- **Minimum code, surgical, matches patterns**: every change extends a WF2/WF3 seam — no new modules. Block-loop lives in the DI'd runner (Approach A), pause state in the manager choke-point, `ctx` stays thin delegation. Consistent with WF3.
- **`respond` uniform for abort+guidance** (always `blocked→running` then resolve): documented Tech Decision; abort→`cancelled` produced downstream by the runner throwing. The transient `running` blip is intentional and asserted by `run-state.test.ts:101` (running→blocked→running→cancelled sequence).
- **3 SPEC_DEVIATION markers** (`workflow-ctx.ts`): `agent?` / `signal?` (pre-existing, WF3) and `requestInput?` (new, T5) typed optional to keep a green production typecheck across phase-ordering (T5 ships before T6). Production always injects; guards throw clear errors (`'agent capability is not configured'`, `'ask capability is not configured'`), and `ctx.agent` falls back to WF3 no-pause when `requestInput` is absent. **Benign** — no runtime path reaches an unconfigured seam in production wiring (`index.ts` provides all three).
- **Bind-failure poisons `#started`** (memoized rejected promise): documented accepted v1 risk — a `:0` ephemeral-port bind failure is app-wide and unrecoverable, so failing every later step is correct.
- No scope creep observed; the WF3 carry-ins (WF4-18/19/20) land on the same runner/server they touch.

---

## Edge Cases (from spec §Edge Cases)

| Edge case | Handling | Evidence |
| --------- | -------- | -------- |
| `respond` twice for same block → only first resolves (settle-once) | duplicate after settle is no-op | `workflow-manager.test.ts:490` `not.toThrow()` after settle; `#pendingRespond` nulled on resolve |
| App quits while blocked → run lost, worktree persists | accepted v1 (ephemeral) | design decision; not tested (out of scope) |
| Guidance resume → blocked again → pause again (unbounded) | loops | `agent-step-runner.test.ts:411` (WF4-04) |
| `Notification.isSupported()` false → toast skipped, run proceeds | early return | `index.ts` `if (!Notification.isSupported()) return` (HV) |
| Resumed turn fails to conform after its own retry → run `failed` | `#turn` throws `AgentStepError` (existing WF3 path, now post-resume reachable) | mechanism shared with `agent-step-runner.test.ts:288` (WF3-05); same `#turn` per loop iteration |
| Cancel when NOT blocked → unchanged WF2/WF3 behavior | token + child abort | `workflow-manager.test.ts:294` (WF2-14), `:347` (WF3-20) still green |

---

## Gate Check

| Gate | Command | Result |
| ---- | ------- | ------ |
| Typecheck | `npm run typecheck` | ✅ 0 errors (node + web) |
| Lint | `npm run lint` | ✅ 0 errors, 22 warnings (pre-existing prettier formatting; within expected ~22) |
| Unit suite | `npx vitest run` | ✅ **422 passed / 422** (33 files) |

**Baseline** before WF4 = 390 tests → **after = 422** (+32 new unit tests, zero deletions; task estimate was ~426/+36 — actuals slightly under, all ACs covered).

**Flaky note**: `src/main/tree.test.ts > snapshots a workspace with repos and their worktrees` (AD-005 real-git-on-Windows EPERM/timeout under parallel load) **did NOT flake** this run — passed as part of the full 422. No isolation re-run needed. Not WF4-touched.

### Owner-run live smoke (WF4-17) — PASSED 9/9 (2026-07-06)

`node scripts/smoke-blocker-resume.mjs` vs a live Claude subscription — runId
`42c4317e-3205-4786-b15b-0d460d2279f1`. The full WF4 loop executed end-to-end:
- statuses streamed **`["running","blocked","running","done"]`** — the exact WF4 state machine (running → blocked → resumed/running → done)
- `workflow:blocked` fired carrying the agent's real question (it asked to confirm filename, function name, greeting text — no guessing, per the two-phase protocol)
- `workflows:respond` guidance **resumed the same session** — persisted log records both a `blocked` and a `resumed` transition
- non-empty `session_id` captured: `047d6c90-2da9-4960-9950-d29f77106101`
- final `status:'done'`; the agent's result validates against `IMPLEMENT_SCHEMA` (it created `greeting.js` exporting `greet(name)` → `Hello, ${name}!`)

This closes the design's one empirical risk (a live block→guidance→resume-same-session→done
loop over a real subscription), mirroring the WF3-22 close. Fixes made during the owner run:
(1) the `implement-ticket` prompt now makes phase-1 blocking a mandatory two-phase protocol
(a capable agent left to judgement finished `done` without asking); (2) `ctx.worktree.create`
needs a `baseBranch` to cut a NEW branch (`-b <branch> <base>`) — without one it tried to
check out a non-existent branch (`invalid reference`); (3) the smoke resets its window
collectors per run (the app survives across invocations, so a stale collector read the prior
run's runId and responded to the wrong run). All three are T8 fixture/smoke fixes — the
verified T1–T7 core was untouched.

---

## Requirement Traceability

| WF4-xx | Status |
| ------ | ------ |
| WF4-01 | ✅ Verified (U) |
| WF4-02 | ✅ Verified (U) |
| WF4-03 | ✅ Verified (U) |
| WF4-04 | ✅ Verified (U) |
| WF4-05 | ✅ Verified (U) |
| WF4-06 | ✅ Verified (U) |
| WF4-07 | ✅ Verified (U) |
| WF4-08 | ✅ Verified (U) |
| WF4-09 | ✅ Verified (U) |
| WF4-10 | ✅ Verified (U) |
| WF4-11 | ✅ Verified (U) |
| WF4-12 | ✅ Verified (U) |
| WF4-13 | ✅ Verified (U) |
| WF4-14 | ✅ Verified (U) |
| WF4-15 | ✅ Verified (HV — deferred by design, index.ts thin shell) |
| WF4-16 | ✅ Verified (structural + SMOKE — deferred by design) |
| WF4-17 | ✅ Verified (SMOKE — owner-run gate, deferred by design) |
| WF4-18 | ✅ Verified (U) |
| WF4-19 | ✅ Verified (U) |
| WF4-20 | ✅ Verified (U) |

---

## Summary

**Overall verdict: PASS ✅**

All 20 WF4 acceptance criteria are satisfied — 17 covered by located, reproduced unit assertions and 3 (WF4-15/16/17) deferred by design to the hand-verified `index.ts` thin shell and the owner-run CDP smoke, exactly as the test matrix prescribes. The build gate is green (typecheck 0, lint 0 errors, 422/422 tests, +32 with no deletions). The discrimination sensor injected 5 behavior-level faults into the highest-risk new logic (reducer guard, resume argv, field-level retry, respond target guard, lastError capture) and all 5 were killed — the tests genuinely discriminate. Code is surgical, reuse-first, and matches WF2/WF3 conventions; the 3 SPEC_DEVIATION optional-typing markers are benign (production always injects, guards throw clearly). No gaps, no surviving mutants, tree left clean.

**Owner-run smoke (WF4-17): EXECUTED — PASSED 9/9** (2026-07-06, runId `42c4317e`). The live
block→guidance→resume-same-session→done loop ran end-to-end against a real Claude
subscription (see the Gate Check section for evidence). WF4 is fully verified — nothing
remains but the PR/merge.
