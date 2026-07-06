# WF4 — Blocker + Resume — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and
follow its Execute flow and Critical Rules.** Do not search for skill files by
filesystem path. The skill is the source of truth for the full flow (per-task cycle,
sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/workflows-blocker-resume/design.md`
**Status**: **EXECUTED + VERIFIED (PASS, 2026-07-06)** — all 8 tasks implemented, each with
its own atomic commit + green gate; independent Verifier (author ≠ verifier) returned
**PASS** (20/20 ACs, 422/422 tests, discrimination sensor 5/5 mutants killed, 0 gaps). See
`validation.md`. Only the owner-run live smoke (WF4-17) remains as the owner's manual gate.
MCP: NONE / Skill: NONE across all 8 tasks.

**Baseline**: **390 tests / 33 files** (`npx vitest run`, 2026-07-06, off `main` @ WF3
merge). Every expected-pass count below is `390 + N`; a task that adds N unit tests must
end at its stated total with **zero deletions**. Estimated total after WF4: **~426**
(≈36 new unit tests; per-task estimates are targets, confirm actuals at Execute).

> ⚠ **Flaky (not red) at baseline — diagnosed**: under full-suite parallel load, the
> real-git test `src/main/tree.test.ts > snapshots a workspace with repos and their
> worktrees` intermittently fails two ways — `Test timed out in 5000ms` and `EPERM,
> Permission denied` on the `afterEach` `rmSync(workspace)` (Windows holds the git
> temp-dir handle). Run in isolation it passes **4/4** (confirmed 2026-07-06). This is the
> AD-005 real-git-on-Windows timing/locking category, **not** a regression and **not**
> WF4-touched (WF4 changes no worktree/`tree.ts` code). True green floor = **390/390**;
> per-task "+N / no deletions" targets are measured against 390. If a WF4 run flakes on
> this one test, re-run `tree.test.ts` in isolation to confirm before treating it as real.

**Note on scope**: WF4 adds **no new modules** — every change extends a WF2/WF3 seam
(`run-state`, `workflow-manager`, `workflow-ctx`, `agent-step-runner`,
`mcp-result-server`, the shared types + IPC contract) plus two fixtures (the
`implement-ticket` example + the owner-run smoke). The three WF3 carry-in items
(WF4-18/19/20, from AD-009) land on the same runner/server they touch.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute.
> Guidelines found: `.specs/codebase/TESTING.md` (authoritative matrix, parallelism,
> gates), `.specs/codebase/CONVENTIONS.md`, `vitest.config.ts`
> (`include: ['src/**/*.test.ts','scripts/**/*.test.ts']`), no coverage tool.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure reducer (`run-state`) | **unit** | All new transitions (blocked/resumed/cancelled-from-blocked), all branches; 1:1 to WF4-06 | `src/main/run-state.test.ts` | `npm test` |
| Behavior module `mcp-result-server` (real HTTP client, no mocks) | **unit** (integration-style, real loopback) | `lastError` capture/expose + `start()` bind-failure reject; through the wire | `src/main/mcp-result-server.test.ts` | `npm test` |
| DI orchestrator `agent-step-runner` (fake spawn + fake server + fake `onBlocked`) | **unit** | All branches: block→guidance→done, repeat rounds, abort, back-compat no-onBlocked, field-level retry, server-reuse, bind-failure | `src/main/agent-step-runner.test.ts` | `npm test` |
| DI orchestrator `workflow-manager` (fake ctx/deps) | **unit** | requestInput/respond/cancel-while-blocked + toast triggers; 1:1 to WF4-07/09/13/14 | `src/main/workflow-manager.test.ts` | `npm test` |
| Edited main module w/ logic (`workflow-ctx`) | **unit** | `ctx.ask` + `onBlocked` wire, new/changed branches only | `src/main/workflow-ctx.test.ts` | `npm test` |
| Shared types + IPC contract (`src/shared/workflows.ts`, `src/shared/ipc-contract.ts`) | **none** (build gate only) | — (typecheck) | — | `npm run typecheck` |
| Thin Electron shell (`index.ts` respond handler + `notifier` click seam) | **none** (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Example workflow fixture + CDP smoke (`implement-ticket/workflow.ts`, `scripts/smoke-blocker-resume.mjs`) | **none** (owner-run smoke) | manual gate: blocked → guidance → resume same session → done | `scripts/smoke-blocker-resume.mjs` | `node scripts/smoke-blocker-resume.mjs` (live session) |

## Parallelism Assessment

> Generated from codebase — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --------- | -------------- | --------------- | -------- |
| Unit (pure reducer) | **Yes** | No shared state; input→output | `run-state.test.ts` |
| Unit (injected fake / DI) | **Yes** | Hand-rolled fakes per test; no `vi.mock`, no globals | `workflow-manager.test.ts`, `agent-step-runner.test.ts` |
| Unit (real loopback server) | **Yes** | Each test creates its own `createMcpResultServer()` on `:0` + `stop()` teardown | `mcp-result-server.test.ts` |
| CDP smoke | **No** | Single live app on a fixed debug port + live subscription + shared disk | `scripts/smoke-*.mjs` — one at a time, by hand |

Vitest runs files in parallel workers; all WF4 unit tests are parallel-safe ⇒ tasks whose
only tests are unit may be `[P]`. The MCP-server test binds `:0` (ephemeral), so
concurrent files don't collide on a port.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| **Quick** | After a task whose only tests are unit tests | `npm test` |
| **Full** | After a logic-bearing task / before PR | `npm run typecheck && npm run lint && npm test` |
| **Build** | After type-only tasks / phase completion | `npm run build:win` |
| **Manual** | The owner-run gate (WF4-17) | `npm run dev -- -- --remote-debugging-port=9222` then `node scripts/smoke-blocker-resume.mjs` |

---

## Execution Plan

> **3 phases → runs inline in the main window (no sub-agent offer; the >3-phase threshold
> is not met).** A fresh Verifier always runs after the last task.

### Phase 1: Foundations (types/IPC + reducer + server seams)

```
T1 ──→ T2 [P]
T3 [P] (independent)
```

### Phase 2: Core (runner → ctx → manager)

```
T1,T3 ─→ T4 ─→ T5 ─→ T6
              (T5 needs T1,T4; T6 needs T2,T5)
```

### Phase 3: Integration + owner gate

```
T6 ─→ T7 ─→ T8
```

---

## Task Breakdown

### T1: Shared types + IPC contract for blocker/resume

**What**: Add `RunStatus` member `'blocked'`; extend `StepEvent.kind` with
`'blocked'|'resumed'` + a `question?: BlockerQuestion` field; add `BlockerQuestion` +
`RespondDecision` types; add the `workflows:respond` channel and the `workflow:blocked` /
`workflow:focus-run` events to the IPC contract.
**Where**: `src/shared/workflows.ts`, `src/shared/ipc-contract.ts`
**Depends on**: None
**Reuses**: WF2 `StepEvent`/`RunStatus` shape; the `workflows:*`/`workflow:*` IPC typing.
**Requirement**: WF4-06, WF4-07, WF4-15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `RunStatus = … | 'blocked'`; `StepEvent.kind` union adds `blocked`/`resumed`;
      `StepEvent.question?: BlockerQuestion` added
- [ ] `BlockerQuestion { title; body }` + `RespondDecision = {action:'abort'} |
      {action:'guidance'; guidance:string}` exported
- [ ] `workflows:respond` req `{ runId; decision: RespondDecision }` res `void`;
      `workflow:blocked` `{ runId; question: BlockerQuestion }`; `workflow:focus-run`
      `{ runId }`
- [ ] Gate check passes: `npm run typecheck` (no breakage) + `npm test` still at the
      passing floor
- [ ] Test count: unchanged (type-only)

**Tests**: none · **Gate**: full (`typecheck && lint && test`)
**Commit**: `feat(workflows-blocker-resume): blocked run-state + respond/blocked IPC types`

---

### T2: `run-state` blocked/resumed/cancelled transitions [P]

**What**: Add reducer transitions `running→blocked` (records `question`),
`blocked→running` (resumed), and widen the `cancelled` guard to accept `blocked`; keep
`blocked` non-terminal and every other event `running`-only.
**Where**: `src/main/run-state.ts` (+ `.test.ts`)
**Depends on**: T1
**Reuses**: WF2 `reduce` guarded-append fold + its transition tests.
**Requirement**: WF4-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `running --blocked--> blocked` appends the event with `question` intact
- [ ] `blocked --resumed--> running`; `blocked --cancelled--> cancelled`
- [ ] `blocked` is non-terminal but a `step-started`/`step-logged`/`done`/`failed` while
      `blocked` is a guarded **no-op** (status must be `running`)
- [ ] A terminal run still ignores `blocked`/`resumed` (unchanged)
- [ ] Gate check passes: `npm test` → **+~6**
- [ ] Test count: ~6 new tests pass (no deletions)

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-blocker-resume): run-state blocked/resumed transitions`

---

### T3: `mcp-result-server` field-level `lastError` + bind-failure reject [P]

**What**: Store `reg.lastError = result.error` on a non-conforming payload and expose
`lastError(token)`; add `httpServer.once('error', reject)` in `start()` so a bind failure
rejects instead of hanging.
**Where**: `src/main/mcp-result-server.ts` (+ `.test.ts`)
**Depends on**: None (no code dep on T1; phase-gated only)
**Reuses**: the WF3 per-token registration map + real-loopback behavior test.
**Requirement**: WF4-18 (server half), WF4-20

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] An invalid `emit_result` sets the token's `lastError` to the ajv message;
      `lastError(token)` returns it; `undefined` before any invalid call / for an unknown
      token
- [ ] `start()` **rejects** when the listener emits `error` (e.g. a pre-bound port), not
      hang
- [ ] A valid emit still resolves the pending promise (no regression to WF3 behavior)
- [ ] Gate check passes: `npm test` → **+~4**
- [ ] Test count: ~4 new tests pass (no deletions)

**Tests**: unit (real loopback) · **Gate**: quick
**Commit**: `feat(workflows-blocker-resume): mcp-server lastError + bind-failure reject`

---

### T4: `agent-step-runner` block-loop + field-level retry + reuse/bind coverage

**What**: Refactor `run(opts, signal?, onBlocked?)` into an outer block-loop over a
`#turn` helper (= existing attempt + one corrective retry). On a valid `blocked` emit
call `onBlocked` → `abort` throws `CancellationError`, `guidance` resumes the same session
via `--resume` and loops; no `onBlocked` → return `blocked` as-is (WF3 back-compat). Feed
`server.lastError(token)` into `correctivePrompt`. Add tests asserting single `start()`
across two `run()`s and the bind-failure path.
**Where**: `src/main/agent-step-runner.ts` (+ `.test.ts`)
**Depends on**: T1 (`BlockerQuestion`/`RespondDecision`), T3 (`lastError`)
**Reuses**: WF3 `#attempt`, `parseEnvelope`, `buildAgentCommand` (`--resume`), token-revoke.
**Requirement**: WF4-02, WF4-03, WF4-04, WF4-05, WF4-10, WF4-18, WF4-19, WF4-20

**Tools**: MCP: NONE · Skill: NONE

**Done when** (fake `AgentSpawn` + fake `McpResultServer` + fake `onBlocked`):
- [ ] `blocked`→`onBlocked` guidance → resume: the resume attempt argv carries
      `--resume <sessionId>` and the guidance prompt; final `done` resolves with the
      resumed `sessionId` (WF4-02/03)
- [ ] `blocked` twice → `onBlocked` called twice, loops until `done` (WF4-04)
- [ ] `onBlocked` returns `abort` → `run` **throws** `CancellationError`, no further
      spawn (WF4-05/10)
- [ ] No `onBlocked` provided + `blocked` emit → returns `{status:'blocked',…}` as-is
      (WF3 back-compat preserved)
- [ ] Corrective retry after no-valid-emit uses `server.lastError(token)` → the retry
      prompt contains the field-level ajv error (WF4-18)
- [ ] Two `run()` calls → `server.start()` called **exactly once** (WF4-19)
- [ ] `server.start()` rejects → `run` rejects, `spawn` **never** called (WF4-20)
- [ ] Gate check passes: `npm test` → **+~10**
- [ ] Test count: ~10 new tests pass (no deletions)

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-blocker-resume): agent-step block-loop + resume on guidance`

---

### T5: `ctx.ask` + `onBlocked` wire + `requestInput` runtime seam

**What**: Add `ctx.ask({title, body})` via `instrument('ask', …)` returning the decision
as-is (no throw on abort); add `CtxRuntime.requestInput`; grow `CtxDeps.agent.run` with
an optional `onBlocked` arg + a `BlockedResolver` type; wire `ctx.agent` to pass
`onBlocked = (q) => runtime.requestInput(q)`.
**Where**: `src/main/workflow-ctx.ts` (+ `.test.ts`), `src/main/agent-step-runner.ts`
(export `BlockedResolver`)
**Depends on**: T1 (`BlockerQuestion`/`RespondDecision`), T4 (runner signature/`BlockedResolver`)
**Reuses**: `instrument`, `currentGroup`, WF2/WF3 ctx test patterns.
**Requirement**: WF4-01 (ctx side), WF4-11, WF4-12

**Tools**: MCP: NONE · Skill: NONE

**Done when** (recording fake `CtxRuntime.requestInput` + fake `CtxDeps.agent`):
- [ ] `ctx.ask({title,body})` emits a `step-started` `ask` + `checkCancel` before, calls
      `runtime.requestInput({title,body})`, returns the decision **as-is** (WF4-11/12)
- [ ] An `abort` decision resolves `ctx.ask` to `{action:'abort'}` **without throwing**
- [ ] `ctx.agent` calls `deps.agent.run(opts, runtime.signal, onBlocked)` where
      `onBlocked(q)` delegates to `runtime.requestInput(q)` (WF4-01)
- [ ] Typecheck clean: `CtxRuntime.requestInput` + `CtxDeps.agent.run(…, onBlocked?)` +
      `BlockedResolver` exported
- [ ] Gate check passes: `npm test` → **+~6**
- [ ] Test count: ~6 new tests pass (no deletions)

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-blocker-resume): ctx.ask + agent onBlocked wire`

---

### T6: `WorkflowManager` pause primitive, `respond`, cancel-while-blocked, lifecycle toasts

**What**: Add `#pendingRespond`; implement `runtime.requestInput` (apply `blocked` +
store pending); `respond(runId, decision)` (guarded no-op; apply `resumed`; resolve);
`cancel` also rejects `#pendingRespond` with `CancellationError`; emit `workflow:blocked`
and fire `deps.notifier` on block/done/failed (cancel silent); widen the `notifier` dep
type with `opts?:{runId?}`; clear `#pendingRespond` in `finally`.
**Where**: `src/main/workflow-manager.ts` (+ `.test.ts`)
**Depends on**: T2 (reducer transitions), T5 (`CtxRuntime.requestInput` type)
**Reuses**: WF2/WF3 `#apply`/`#emit` choke-point, `CancellationError` fold, cancel token.
**Requirement**: WF4-01 (manager side), WF4-05, WF4-07, WF4-08, WF4-09, WF4-13, WF4-14

**Tools**: MCP: NONE · Skill: NONE

**Done when** (DI'd with a fake ctx that awaits `requestInput`, fake `notifier`):
- [ ] `requestInput(question)` → run becomes `blocked`, `workflow:blocked` emitted, a
      toast fires with the question body (WF4-01/13)
- [ ] `respond(runId, guidance)` → `blocked→running` (resumed) + resolves the pending with
      the decision; `respond(runId, abort)` resolves `{action:'abort'}` (agent path throws
      downstream) (WF4-07)
- [ ] `respond` for a wrong/unknown runId or a non-blocked run → **no-op** (WF4-07)
- [ ] `cancel` while blocked → pending **rejects** `CancellationError`, run ends
      `cancelled`, `#activeRunId` cleared, a subsequent `run` succeeds (WF4-09)
- [ ] Toast fires on `done` and `failed`; **no** lifecycle toast on `cancelled`; a
      `ctx.notify({toast})` still calls the notifier independently (WF4-13/14)
- [ ] A second `workflows:run` while blocked is refused by the serial guard (WF4-08)
- [ ] Gate check passes: `npm test` → **+~10**
- [ ] Test count: ~10 new tests pass (no deletions)

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-blocker-resume): manager pause/respond + lifecycle toasts`

---

### T7: `index.ts` wiring — respond handler + toast click-to-focus

**What**: `handle('workflows:respond', …)` → `workflows.respond(runId, decision)`; extend
the real `notifier(title, body, opts?)` so an `opts.runId` toast attaches a `click`
handler that shows/focuses `mainWindow` and emits `workflow:focus-run { runId }`
(WF2-09 `ctx.notify` path unchanged when no `runId`).
**Where**: `src/main/index.ts`
**Depends on**: T1 (channels), T6 (`workflows.respond`)
**Reuses**: WF2/WF3 boot wiring (`handle`, `emitToWindow`, `Notification`, `mainWindow`).
**Requirement**: WF4-07 (handler), WF4-15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `handle('workflows:respond', ({runId, decision}) => workflows.respond(runId, decision))`
- [ ] `notifier(title, body, {runId})` builds a `Notification` whose `click` → `mainWindow?.show()`/`focus()` + `emitToWindow('workflow:focus-run', {runId})`; no-`runId` calls unchanged
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` (unchanged count — thin shell)
- [ ] Test count: unchanged (hand-verified shell)

**Tests**: none (hand-verified) · **Gate**: full
**Commit**: `feat(workflows-blocker-resume): wire respond handler + toast focus into main`

---

### T8: `implement-ticket` example + owner-run blocker/resume smoke gate

**What**: Seed-able `implement-ticket/workflow.ts` (create worktree → a `write`/`bypass`
`ctx.agent` step whose prompt provokes a `blocked` question; **no** author pause code) +
`scripts/smoke-blocker-resume.mjs` (CDP: run → observe `blocked` + `workflow:blocked` →
`workflows:respond` guidance → assert same `session_id` resumed → `done`).
**Where**: `scripts/fixtures/implement-ticket/workflow.ts` (seeded to
`~/.playground/workflows/`), `scripts/smoke-blocker-resume.mjs`
**Depends on**: T7
**Reuses**: `scripts/smoke-agent-workflow.mjs` skeleton; WF2 `ctx.worktree`; WF3 `ctx.agent`.
**Requirement**: WF4-16, WF4-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `implement-ticket/workflow.ts` exports valid `meta` (inputs) + `run(ctx)` with a
      single `write`/`bypass` `ctx.agent` step and **no** pause/resume logic
- [ ] `smoke-blocker-resume.mjs` seeds a scratch repo + fixture, drives `workflows:run`,
      collects events until `blocked`, sends a `guidance` `workflows:respond`
- [ ] `check()`: `workflow:blocked` observed, then the run resumes the **same**
      `session_id` and reaches `status:'done'` on the persisted record
- [ ] `npm run typecheck && npm run lint && npm test` green (no new units)
- [ ] **Manual gate (owner-run, WF4-17)**: `npm run dev -- -- --remote-debugging-port=9222`
      then `node scripts/smoke-blocker-resume.mjs` → exit 0 against a live subscription
- [ ] Test count: unchanged (manual gate)

**Tests**: none (owner-run smoke) · **Gate**: manual + full (typecheck/lint/test)
**Commit**: `feat(workflows-blocker-resume): implement-ticket example + blocker-resume smoke gate`

---

## Parallel Execution Map

```
Phase 1 (Foundations):
  T1 ──→ T2 [P]
  T3 [P]  (independent — no code dep on T1)

Phase 2 (Core):
  T1,T3 ─→ T4 ─→ T5 ─→ T6
                 (T5 ← T1,T4 ; T6 ← T2,T5)

Phase 3 (Integration + gate):
  T6 ─→ T7 ─→ T8
```

**Parallelism constraint:** `[P]` tasks (T2 after T1; T3 independent) have no inter-task
dependency and only parallel-safe unit tests. `[P]` is ordering info, not a directive to
spawn a sub-agent per task.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: shared types + IPC | 2 type files, cohesive (one contract) | ✅ Granular |
| T2: run-state transitions | 1 module edit + test | ✅ Granular |
| T3: mcp-server lastError + bind | 1 module edit + test | ✅ Granular |
| T4: agent-step block-loop | 1 module edit + test | ✅ Granular |
| T5: ctx.ask + onBlocked wire | 1 module edit (+ 1 exported type) + test | ✅ Granular |
| T6: manager pause/respond/toast | 1 module edit + test | ✅ Granular |
| T7: index wiring | 1 file (thin shell) | ✅ Granular |
| T8: example + smoke | 1 fixture + 1 script, cohesive (the gate) | ⚠️ 2 files, cohesive — OK |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| ---- | ----------------- | ------------- | ------ |
| T1 | None | (root) | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | None | (independent) | ✅ Match |
| T4 | T1, T3 | T1,T3→T4 | ✅ Match |
| T5 | T1, T4 | T1,T4→T5 | ✅ Match |
| T6 | T2, T5 | T2,T5→T6 | ✅ Match |
| T7 | T1, T6 | T6→T7 (T1 = phase-1 foundation) | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | shared types + IPC contract | none (build gate) | none | ✅ OK |
| T2 | pure reducer | unit | unit | ✅ OK |
| T3 | behavior module (loopback) | unit | unit | ✅ OK |
| T4 | DI orchestrator | unit | unit | ✅ OK |
| T5 | edited main module w/ logic | unit | unit | ✅ OK |
| T6 | DI orchestrator | unit | unit | ✅ OK |
| T7 | thin Electron shell | none (hand-verified) | none | ✅ OK |
| T8 | fixture + CDP smoke | none (owner-run smoke) | none | ✅ OK |

All ✅ — no violations. `Tests: none` on T1/T7/T8 matches the matrix's "none" layers
(shared types + IPC, thin shell, owner-run smoke) — not test deferral.

---

## Gate-triage note (pre-Execute) — RESOLVED

The intermittent baseline red is **diagnosed and benign**: `src/main/tree.test.ts >
snapshots a workspace with repos and their worktrees` flakes only under full-suite
parallel load (`Test timed out in 5000ms`; `EPERM` on `afterEach` temp `rmSync`). In
isolation it passes **4/4** (`npx vitest run src/main/tree.test.ts`, confirmed
2026-07-06) — the AD-005 real-git-on-Windows timing/locking category, not a regression,
not WF4-touched. True green floor = **390/390**. During Execute, if a gate run shows this
one test failing, re-run it in isolation to confirm rather than treating it as a WF4
break; record the confirmation in `validation.md`. Any *other* failing test is in scope
and must be fixed.

---

## MCPs and Skills

Every task is pure-TS with hand-rolled fakes (no network mocks, no external services in
tests). Proposed **MCP: NONE, Skill: NONE** across all 8 tasks. The `coding-guidelines`
skill may optionally be applied while writing each module. Override at Execute if desired.
</content>
