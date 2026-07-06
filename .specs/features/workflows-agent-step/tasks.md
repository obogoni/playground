# WF3 — Structured Agent Step — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and
follow its Execute flow and Critical Rules.** Do not search for skill files by
filesystem path. The skill is the source of truth for the full flow (per-task cycle,
sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/workflows-agent-step/design.md`
**Status**: **EXECUTED + VERIFIED (PASS) 2026-07-06.** All 12 tasks committed (one
atomic commit each) via 4 phase sub-agents (one worker/phase) + fresh independent
Verifier. Gate green: typecheck 0 err, lint 0 err (18 pre-existing prettier warnings),
**390 tests / 33 files** (325 → +65, 0 deletions). Discrimination sensor 8/8 mutants
killed. Report: `validation.md`. **Owner-run live smoke gate (WF3-22) PASSED 6/6**
(2026-07-06, live subscription): runId `8a8b19d7…`, `session_id` `9b1438dd…`, 2 findings
validate vs `FINDINGS_SCHEMA`, worktree unmutated (read posture). All gates green — no
open items. MCP: NONE / Skill: NONE on all 12.

**Baseline**: **325 tests / 27 files** (verified `npx vitest run`, 2026-07-03). Every
expected-pass count below is `325 + N`; a task that adds N unit tests must end at its
stated total with **zero deletions**. Estimated total after WF3: **~381** (≈56 new
unit tests; per-task estimates are targets, confirm actuals at Execute).

**Note on the WF1 spike**: `scripts/wf1-spike/` stays **frozen** (the WF1 empirical
harness + findings, owner-re-runnable). WF3 creates **fresh** production modules under
`src/main/` (adapted: ajv, MCP-only, presets, DI'd runner) with new spec-anchored
tests. Deleting the spike is a later candidate cleanup, out of WF3 scope.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute.
> Guidelines found: `.specs/codebase/TESTING.md` (authoritative matrix, parallelism,
> gates), `.specs/codebase/CONVENTIONS.md`, `vitest.config.ts`
> (`include: ['src/**/*.test.ts','scripts/**/*.test.ts']`), no coverage tool.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure seams (`emit-result-schema` w/ ajv, `scrub-auth-env`, `parse-envelope`, `agent-command-builder`) | **unit** | Pure input→output, all branches; 1:1 to spec ACs; every listed edge case | co-located `src/main/<module>.test.ts` | `npm test` |
| Behavior module `mcp-result-server` (real HTTP client, no mocks) | **unit** (integration-style, real loopback) | register/tools-list/valid-emit/unknown-token/revoke through the wire | `src/main/mcp-result-server.test.ts` | `npm test` |
| DI orchestrator `agent-step-runner` (fake spawn + fake server) | **unit** | All branches: happy/retry/fail/blocked/cancel/invalid-expect/binary-unresolved | `src/main/agent-step-runner.test.ts` | `npm test` |
| Edited main modules with logic (`workflow-ctx`, `workflow-manager`, `run-state`) | **unit** | New/changed branches only; 1:1 to the WF3 ACs they carry | `src/main/<module>.test.ts` | `npm test` |
| Shared types (`src/shared/workflows.ts`) | **none** (build gate only) | — (typecheck) | — | `npm run typecheck` |
| Thin Electron shell (`index.ts` wiring, real `child_process.spawn` seam, `will-quit`) | **none** (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Example workflow fixture + CDP smoke (`review-pr/workflow.ts`, `scripts/smoke-agent-workflow.mjs`) | **none** (owner-run smoke) | manual gate: done + validated findings + session_id + no-mutation | `scripts/smoke-agent-workflow.mjs` | `node scripts/smoke-agent-workflow.mjs` (live session) |
| Dependency manifest (`package.json`) | **none** (build gate) | — | — | `npm run typecheck` + install |

## Parallelism Assessment

> Generated from codebase — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --------- | -------------- | --------------- | -------- |
| Unit (pure) | **Yes** | No shared state; input→output | `parse-envelope.test.ts`, `spawn-plan.test.ts` |
| Unit (injected fake / DI) | **Yes** | Hand-rolled fakes per test; no `vi.mock`, no globals | `session-manager.test.ts`, `workflow-manager.test.ts` |
| Unit (real loopback server) | **Yes** | Each test creates its own `createMcpResultServer()` on an ephemeral port (`:0`) + `stop()` in teardown | `scripts/wf1-spike/mcp-server.test.ts` |
| CDP smoke | **No** | Single live app on fixed debug port + live subscription + shared disk | `scripts/smoke-*.mjs` — one at a time, by hand |

Vitest runs files in parallel workers; all WF3 unit tests are parallel-safe ⇒ tasks
whose only tests are unit may be `[P]`. The MCP-server test binds `:0` (ephemeral), so
concurrent files don't collide on a port.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| **Quick** | After a task whose only tests are unit tests | `npm test` |
| **Full** | After a logic-bearing task / before PR | `npm run typecheck && npm run lint && npm test` |
| **Build** | After dep changes / phase completion | `npm run build:win` |
| **Manual** | The owner-run gate (WF3-22) | `npm run dev -- -- --remote-debugging-port=9222` then `node scripts/smoke-agent-workflow.mjs` |

---

## Execution Plan

> **>3 phases → the skill will offer one sub-agent per phase (sequential) at Execute.**
> Offer-then-confirm; workers never spawn further sub-agents; a fresh Verifier always
> runs after the last task.

### Phase 1: Dependencies + pure seams

```
T1 ──┬─→ T2 [P] ─┬─→ T5
     ├─→ T3 [P] ─┘
     └─→ T4 [P]
```

### Phase 2: MCP server + runner

```
T2 ─→ T6 ─┐
T5,T4 ────┼─→ T7
T2 ───────┘
```

### Phase 3: Shared/reducer + ctx + manager

```
T8 [P] ─┐
T7 ─────┴─→ T9 ─→ T10
```

### Phase 4: Integration + owner gate

```
T10 ─→ T11 ─→ T12
```

---

## Task Breakdown

### T1: Add `ajv` (prod) + promote `@modelcontextprotocol/sdk` to prod dep

**What**: Add `ajv` to `dependencies`; move `@modelcontextprotocol/sdk` from
`devDependencies` to `dependencies`; install with `--ignore-scripts` (node-gyp
workaround, STATE lesson).
**Where**: `package.json`, `package-lock.json`
**Depends on**: None
**Reuses**: WF2's `esbuild` prod-dep precedent; the `--ignore-scripts` install discipline.
**Requirement**: WF3-25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `ajv` in `dependencies`; `@modelcontextprotocol/sdk` in `dependencies` (not dev)
- [ ] `npm ls ajv @modelcontextprotocol/sdk` resolves both; no native rebuild triggered
- [ ] Gate check passes: `npm run typecheck` (no import breakage) + `npm test` still **325**
- [ ] Test count: 325 tests pass (no deletions)

**Tests**: none · **Gate**: build (`npm run typecheck` + `npm test`)
**Commit**: `chore(workflows-agent-step): add ajv + promote mcp-sdk to prod dep`

---

### T2: `emit-result-schema` (ajv) [P]

**What**: Production `buildToolInputSchema` (unchanged) + `createValidator(expect)`
(ajv-compiled, envelope logic) + `validate` convenience + types.
**Where**: `src/main/emit-result-schema.ts` (+ `.test.ts`)
**Depends on**: T1
**Reuses**: `scripts/wf1-spike/emit-result-schema.ts` envelope logic + its test cases (ajv replaces `checkSchema`).
**Requirement**: WF3-03, WF3-18, WF3-24, WF3-25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `buildToolInputSchema(expect)` returns `{type:object, properties:{status enum, data:expect, question}, required:['status']}`
- [ ] `createValidator(expect)` compiles once; accepts a conforming `done` payload; rejects non-conforming `data`; rejects `blocked` w/o `question`; accepts `blocked` w/ `question`; rejects missing/invalid `status`
- [ ] Invalid `expect` (uncompilable schema) → `createValidator` **throws** (WF3-24)
- [ ] An ajv-only keyword (e.g. `minItems`/`pattern`) is enforced (proves richer-than-minimal)
- [ ] Gate check passes: `npm test` → **325 + ~10 = ~335**
- [ ] Test count: ~10 new tests pass (no deletions)

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-agent-step): emit-result-schema with ajv validation`

---

### T3: `scrub-auth-env` (re-home) [P]

**What**: Production `scrubAuthEnv` + `HIGHER_PRECEDENCE_AUTH_VARS`, verbatim from the spike.
**Where**: `src/main/scrub-auth-env.ts` (+ `.test.ts`)
**Depends on**: T1 (phase gate only; no code dep)
**Reuses**: `scripts/wf1-spike/scrub-auth-env.ts` + its test verbatim.
**Requirement**: WF3-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Each of the 4 higher-precedence vars is removed; input env not mutated (shallow copy)
- [ ] A non-auth var passes through unchanged
- [ ] Gate check passes: `npm test` → **+~4**
- [ ] Test count: ~4 new tests pass

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-agent-step): scrub-auth-env prod seam`

---

### T4: `parse-envelope` (re-home) [P]

**What**: Production `parseEnvelope(stdout) → { sessionId, result }` (drop `structuredOutput`); throws on non-JSON / no session_id.
**Where**: `src/main/parse-envelope.ts` (+ `.test.ts`)
**Depends on**: T1 (phase gate only; no code dep)
**Reuses**: `scripts/wf1-spike/parse-envelope.ts` + test.
**Requirement**: WF3-16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Valid envelope → `{sessionId, result}`; non-JSON stdout throws; non-object throws; missing/empty `session_id` throws (each with raw text attached)
- [ ] Gate check passes: `npm test` → **+~5**
- [ ] Test count: ~5 new tests pass

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-agent-step): parse-envelope prod seam`

---

### T5: `agent-command-builder` (MCP-only + permission presets)

**What**: Pure `buildAgentCommand(opts) → { argv, env }` — MCP arm only, per-preset
`--permission-mode`/`--allowedTools`, resume path, scrubbed env co-located.
**Where**: `src/main/agent-command-builder.ts` (+ `.test.ts`)
**Depends on**: T2 (JsonSchema type), T3 (`scrubAuthEnv`)
**Reuses**: `scripts/wf1-spike/build-agent-argv.ts` structure (native arm removed).
**Requirement**: WF3-02, WF3-06, WF3-07, WF3-11, WF3-12, WF3-13, WF3-14, WF3-15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Base argv: `--print <prompt> --output-format json --mcp-config <http+Bearer token> --append-system-prompt <emit instruction>`
- [ ] `read` (+default when omitted) → `--permission-mode dontAsk` + `--allowedTools mcp__result__emit_result,Read,Grep,Glob`
- [ ] `write` → adds `Edit,Write,Bash` to allowedTools; `bypass` → `--permission-mode bypassPermissions`, no allowedTools
- [ ] `resumeSessionId` set → argv **starts** with `--resume <id>`
- [ ] `env` has no `ANTHROPIC_API_KEY` (asserts the scrub in the same test)
- [ ] Gate check passes: `npm test` → **+~10**
- [ ] Test count: ~10 new tests pass

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-agent-step): agent-command-builder with permission presets`

---

### T6: `mcp-result-server` (re-home, ajv-backed)

**What**: Production `createMcpResultServer()` (low-level `Server`, per-token transport,
`buildToolInputSchema` verbatim, ajv `validate`); `start/register/revoke/stop`.
**Where**: `src/main/mcp-result-server.ts` (+ `.test.ts`)
**Depends on**: T2
**Reuses**: `scripts/wf1-spike/mcp-server.ts` + its behavior test (retargeted to the prod module).
**Requirement**: WF3-06, WF3-08, WF3-09, WF3-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `start()` binds `127.0.0.1:0` → `{url,port}`; `stop()` closes cleanly
- [ ] `register(token, expect)` returns a pending promise; a per-token `tools/list` reflects `buildToolInputSchema(expect)` verbatim
- [ ] A valid `emit_result` (correct Bearer) resolves the promise with the validated payload; an invalid payload does **not** resolve (isError)
- [ ] Missing/unknown token → 401; `revoke(token)` rejects an un-settled pending and later calls with it are rejected
- [ ] Gate check passes: `npm test` → **+~7**
- [ ] Test count: ~7 new tests pass

**Tests**: unit (real loopback) · **Gate**: quick
**Commit**: `feat(workflows-agent-step): mcp-result-server prod module`

---

### T7: `agent-step-runner` (the core, DI'd)

**What**: `AgentStepRunner` — register token → build cmd → spawn (scrubbed, shell:false,
stdin closed) → await forced `emit_result` → validate → one corrective `--resume` retry
→ cancel-kill → return `{status,data?,question?,sessionId}`.
**Where**: `src/main/agent-step-runner.ts` (+ `.test.ts`)
**Depends on**: T5, T6, T4, T2
**Reuses**: `session-manager` DI + fakes pattern; spike `run.ts` grace/spawn logic (productionized).
**Requirement**: WF3-01, WF3-04, WF3-05, WF3-16, WF3-17, WF3-20, WF3-23, WF3-24

**Tools**: MCP: NONE · Skill: NONE

**Done when** (fake `AgentSpawn` + fake `McpResultServer` injected):
- [ ] Happy: valid emit → resolves `{status:'done', data, sessionId}` (sessionId from envelope)
- [ ] `blocked` emit → resolves `{status:'blocked', question, sessionId}` as-is (no throw, no pause) (WF3-17)
- [ ] No valid emit on first pass → **one** `--resume` corrective retry; retry conforms → resolves (WF3-04)
- [ ] Still no valid emit after retry / exit-without-emit → **throws** with `{stdout,stderr,code}` (WF3-05)
- [ ] Invalid `expect` → throws **before** any spawn (WF3-24); `resolveClaude` failure → "agent binary not found", no spawn (WF3-23)
- [ ] `signal.abort()` mid-flight → `child.kill()` called + `CancellationError` (WF3-20); tokens revoked in `finally`
- [ ] Gate check passes: `npm test` → **+~10**
- [ ] Test count: ~10 new tests pass

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-agent-step): agent-step-runner with corrective retry + cancel-kill`

---

### T8: `StepEvent.sessionId` + reducer pass-through [P]

**What**: Add optional `sessionId?: string` to `StepEvent`; confirm `run-state.reduce`
carries it through the `step-logged` fold unchanged.
**Where**: `src/shared/workflows.ts` (type), `src/main/run-state.test.ts` (guard test)
**Depends on**: None (type-only + reducer guard)
**Reuses**: WF2 `StepEvent` + `reduce`.
**Requirement**: WF3-16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `StepEvent.sessionId?: string` added (typecheck clean)
- [ ] A `reduce` guard test: a `step-logged` event carrying `sessionId` is appended to `events` with the field intact
- [ ] Gate check passes: `npm run typecheck && npm test` → **+~2**
- [ ] Test count: ~2 new tests pass

**Tests**: unit · **Gate**: full
**Commit**: `feat(workflows-agent-step): carry sessionId on StepEvent`

---

### T9: `ctx.agent` + `CtxDeps.agent` + `CtxRuntime.signal`

**What**: Add `ctx.agent(opts)` via `instrument('agent', …)` delegating to
`deps.agent.run(opts, runtime.signal)`; record `sessionId` via `emitLog`; grow
`CtxDeps`/`CtxRuntime`/`Ctx` + `emitLog` sessionId thread.
**Where**: `src/main/workflow-ctx.ts` (+ `.test.ts`)
**Depends on**: T7 (`AgentResult`/`AgentStepOptions`), T8 (`StepEvent.sessionId`)
**Reuses**: `instrument`, `currentGroup`, WF2 ctx test patterns.
**Requirement**: WF3-01, WF3-16, WF3-19

**Tools**: MCP: NONE · Skill: NONE

**Done when** (recording fake `CtxDeps.agent` + fake `CtxRuntime`):
- [ ] `ctx.agent(opts)` calls `deps.agent.run(opts, runtime.signal)` and returns its result
- [ ] A `step-started` labeled `agent` is emitted before the call; `checkCancel` runs before spawn (WF3-19)
- [ ] The returned `sessionId` is recorded via `emitLog` with the `sessionId` field set (WF3-16)
- [ ] `permission` omitted → passed through as-is (default resolved in the runner/builder, not ctx)
- [ ] Gate check passes: `npm test` → **+~5**
- [ ] Test count: ~5 new tests pass

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-agent-step): ctx.agent facade + signal + sessionId log`

---

### T10: `WorkflowManager` AbortController wiring

**What**: `CancelToken` gains an `AbortController`; `run()` sets `runtime.signal =
token.controller.signal`; `cancel()` also `.abort()`s it.
**Where**: `src/main/workflow-manager.ts` (+ `.test.ts`)
**Depends on**: T9 (`CtxRuntime.signal` exists)
**Reuses**: WF2 `WorkflowManager` cancel token + `run` lifecycle.
**Requirement**: WF3-20

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `run()` builds a per-run `AbortController`; the `CtxRuntime` handed to `makeCtx` exposes its `signal`
- [ ] `cancel(runId)` sets `cancelled` **and** aborts the controller (signal fires)
- [ ] Existing WF2 cancel tests still green (no regression)
- [ ] Gate check passes: `npm test` → **+~3**
- [ ] Test count: ~3 new tests pass

**Tests**: unit · **Gate**: quick
**Commit**: `feat(workflows-agent-step): abort signal for agent child cancellation`

---

### T11: `index.ts` wiring — server + runner + resolveClaude + will-quit

**What**: Construct the shared `McpResultServer` (lazy-start) + `AgentStepRunner` (real
spawn seam, `resolveClaude`, `randomUUID`); inject `agent` into the `ctxDeps` bag;
`app.on('will-quit', stop)`.
**Where**: `src/main/index.ts`
**Depends on**: T10
**Reuses**: WF2 boot wiring (`WorkflowManager`, `emitToWindow`, `ctxDeps`).
**Requirement**: WF3-01, WF3-10, WF3-23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `resultServer` + `agentRunner` constructed; `agent: agentRunner` in `ctxDeps`
- [ ] real `AgentSpawn` = `child_process.spawn(bin, argv, {cwd, env, shell:false, stdio:['ignore','pipe','pipe']})`
- [ ] `resolveClaude` = `where claude` → first line, else `config.agent?.claudePath`, else throw
- [ ] `app.on('will-quit')` calls `resultServer.stop()`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` (still ~381, no new units — thin shell)
- [ ] Test count: unchanged (hand-verified shell)

**Tests**: none (hand-verified) · **Gate**: full
**Commit**: `feat(workflows-agent-step): wire mcp server + agent runner into main`

---

### T12: `review-pr` example workflow + owner-run smoke gate

**What**: Seed-able `review-pr/workflow.ts` (changedFiles → `read` `ctx.agent` w/ findings
`expect` → notify) + `scripts/smoke-agent-workflow.mjs` (CDP: run → done + validated
findings + session_id + no-mutation).
**Where**: `scripts/fixtures/review-pr/workflow.ts` (seeded to `~/.playground/workflows/`),
`scripts/smoke-agent-workflow.mjs`
**Depends on**: T11
**Reuses**: `scripts/smoke-workflow.mjs` skeleton; WF2 `ctx.worktree`/`ctx.notify`.
**Requirement**: WF3-21, WF3-22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `review-pr/workflow.ts` exports valid `meta` (inputs: `worktreePath`) + `run(ctx)` per design
- [ ] `smoke-agent-workflow.mjs` seeds a scratch git repo + fixture, drives `workflows:run`, collects events to `done`
- [ ] `check()`: persisted run `status:done`, findings validate against `FINDINGS_SCHEMA`, non-empty `session_id`, no worktree files mutated (read posture)
- [ ] `npm run typecheck && npm run lint && npm test` green (no new units)
- [ ] **Manual gate (owner-run, WF3-22)**: `npm run dev -- -- --remote-debugging-port=9222` then `node scripts/smoke-agent-workflow.mjs` → exit 0 against a live subscription
- [ ] Test count: unchanged (manual gate)

**Tests**: none (owner-run smoke) · **Gate**: manual + full (typecheck/lint/test)
**Commit**: `feat(workflows-agent-step): review-pr example + agent-workflow smoke gate`

---

## Parallel Execution Map

```
Phase 1 (Deps + pure seams):
  T1 ──→ ├── T2 [P]
         ├── T3 [P]   } after T1
         └── T4 [P]
  T2,T3 ─→ T5

Phase 2 (Server + runner):
  T2 ─→ T6
  T5,T6,T4,T2 ─→ T7

Phase 3 (Shared/reducer + ctx + manager):
  T8 [P] (independent)
  T7,T8 ─→ T9 ─→ T10

Phase 4 (Integration + gate):
  T10 ─→ T11 ─→ T12
```

**Parallelism constraint:** `[P]` tasks (T2/T3/T4 after T1; T8) have no inter-task
dependency and only parallel-safe unit tests. `[P]` is ordering info, not a directive
to spawn a sub-agent per task.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: deps | 1 manifest change | ✅ Granular |
| T2: emit-result-schema | 1 module + test | ✅ Granular |
| T3: scrub-auth-env | 1 module + test | ✅ Granular |
| T4: parse-envelope | 1 module + test | ✅ Granular |
| T5: agent-command-builder | 1 module + test | ✅ Granular |
| T6: mcp-result-server | 1 module + test | ✅ Granular |
| T7: agent-step-runner | 1 module + test | ✅ Granular |
| T8: StepEvent.sessionId | 1 type field + 1 guard test | ✅ Granular |
| T9: ctx.agent | 1 module edit + test | ✅ Granular |
| T10: manager AbortController | 1 module edit + test | ✅ Granular |
| T11: index wiring | 1 file (thin shell) | ✅ Granular |
| T12: example + smoke | 1 fixture + 1 script | ⚠️ 2 files, cohesive (the gate) — OK |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| ---- | ----------------- | ------------- | ------ |
| T1 | None | (root) | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T1 | T1→T3 | ✅ Match |
| T4 | T1 | T1→T4 | ✅ Match |
| T5 | T2, T3 | T2→T5, T3→T5 | ✅ Match |
| T6 | T2 | T2→T6 | ✅ Match |
| T7 | T5, T6, T4, T2 | T5,T6,T4,T2→T7 | ✅ Match |
| T8 | None | (independent) | ✅ Match |
| T9 | T7, T8 | T7,T8→T9 | ✅ Match |
| T10 | T9 | T9→T10 | ✅ Match |
| T11 | T10 | T10→T11 | ✅ Match |
| T12 | T11 | T11→T12 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | dependency manifest | none | none | ✅ OK |
| T2 | pure seam | unit | unit | ✅ OK |
| T3 | pure seam | unit | unit | ✅ OK |
| T4 | pure seam | unit | unit | ✅ OK |
| T5 | pure seam | unit | unit | ✅ OK |
| T6 | behavior module (loopback) | unit | unit | ✅ OK |
| T7 | DI orchestrator | unit | unit | ✅ OK |
| T8 | shared type + reducer | unit (reducer guard) | unit | ✅ OK |
| T9 | edited main module w/ logic | unit | unit | ✅ OK |
| T10 | edited main module w/ logic | unit | unit | ✅ OK |
| T11 | thin Electron shell | none (hand-verified) | none | ✅ OK |
| T12 | fixture + CDP smoke | none (owner-run smoke) | none | ✅ OK |

All ✅ — no violations. `Tests: none` on T1/T11/T12 matches the matrix's "none" layers
(dependency manifest, thin shell, owner-run smoke) — not test deferral.

---

## MCPs and Skills

Every task is pure-TS with hand-rolled fakes (no network mocks, no external services in
tests). Proposed **MCP: NONE, Skill: NONE** across all 12 tasks. The `coding-guidelines`
skill may optionally be applied while writing each module. Override at Execute if desired.
