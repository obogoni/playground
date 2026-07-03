# WF1 — Headless Agent Spike Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/workflows-headless-agent-spike/design.md`
**Status**: Executed — **T1–T6 done + independently verified** (PASS, sensor 5/5
mutants killed, see `validation.md`). **T7 remains owner-run** (empirical gate
against the live subscription; produces `findings.md`).
**Phases**: 3 → **inline execution** (≤3 phases, no per-phase sub-agent offer).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. **Guidelines found:** none — no `CLAUDE.md`/`AGENTS.md`/`CONTRIBUTING.md`. Conventions inferred from `vitest.config.ts` (test glob includes `scripts/**/*.test.ts`; coverage report-only per **AD-003**), `spawn-plan.test.ts` (pure-builder pattern), and **AD-004** (renderer has no unit tests; OS/external boundaries like `PtyPort`/`AdoGateway` are deliberately NOT unit-tested — their logic is extracted into injectable seams that ARE tested).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Pure seam (`scrubAuthEnv`, `emit-result-schema`, `parseEnvelope`, `buildAgentArgv`) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `scripts/wf1-spike/*.test.ts` | `npm test` |
| MCP result server (HTTP contract) | integration | Real loopback HTTP client: unknown/revoked token rejected; per-token `tools/list` reflects `expect`; valid `emit_result` resolves | `scripts/wf1-spike/mcp-server.test.ts` | `npm test` |
| Spike orchestrator (`run.ts`) — **external CLI boundary** | none | Build gate only + **owner-run empirical** run; all testable logic lives in the seams above (repo convention for OS/external boundaries, AD-004) | — | build gate + `tsx scripts/wf1-spike/run.ts` (owner-run) |
| `findings.md` deliverable | none | — | — | — |

## Parallelism Assessment

> Generated from codebase — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --- | --- | --- | --- |
| unit (pure seams) | Yes | Pure functions, no shared/global mutable state, no I/O | `spawn-plan.test.ts` (pure, table-driven, no fixtures) |
| integration (MCP server) | Yes | Each server instance binds an **ephemeral loopback port** (`127.0.0.1:0`) per suite; no shared store | design.md §Integration points (random-port loopback) |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only (T1–T4) | `npm test` |
| Full | After the MCP-server integration task (T5) | `npm run typecheck && npm test` |
| Build | After a no-unit-test task / phase completion (T6) | `npm run typecheck && npm run lint && npm test` |
| Empirical | The milestone gate (T7) — **owner-run**, not automatable | `tsx scripts/wf1-spike/run.ts` against the live subscription → findings recorded |

---

## Execution Plan

### Phase 1: Pure seams (Parallel OK)

Four independent, fully unit-tested pure functions. No inter-task dependencies.

```
┌→ T1 [P]
├→ T2 [P]
├→ T3 [P]
└→ T4 [P]
```

### Phase 2: MCP result server (Sequential)

Needs the schema builder (T2).

```
T2 ──→ T5
```

### Phase 3: Orchestrator + empirical run (Sequential)

Wire the seams + server into the throwaway runner, then run it for real.

```
T1, T3, T4, T5 ──→ T6 ──→ T7
```

---

## Task Breakdown

### T1: `scrubAuthEnv` — remove higher-precedence auth env vars [P]

**What**: Pure fn returning a child env with every auth source that outranks the subscription removed.
**Where**: `scripts/wf1-spike/scrub-auth-env.ts` (+ `scrub-auth-env.test.ts`)
**Depends on**: None
**Reuses**: env-delta idea from `PtyPort.spawn` (`src/main/pty-port.ts:27`); test shape from `spawn-plan.test.ts`
**Requirement**: WF1-01

**Tools**:
- MCP: NONE
- Skill: `tdd` (red-green-refactor)

**Done when**:
- [ ] `scrubAuthEnv(parent)` deletes `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`; passes all other vars through
- [ ] Does not mutate the input object (returns a copy)
- [ ] Edge cases tested: none of the vars present (no-op passthrough); all present (all removed); unrelated vars preserved
- [ ] New files are covered by `npm run typecheck` (adjust `tsconfig.node.json` include if `scripts/` is excluded) or lint-clean under `eslint .`
- [ ] Gate passes: `npm test`
- [ ] Test count: ≥3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(wf1-spike): scrub higher-precedence auth env vars`

---

### T2: `emit-result-schema` — build tool inputSchema + validate [P]

**What**: Pure builder/validator that is the single home of the `emit_result` contract, shared by both arms.
**Where**: `scripts/wf1-spike/emit-result-schema.ts` (+ `emit-result-schema.test.ts`)
**Depends on**: None
**Reuses**: pure-builder test shape from `spawn-plan.test.ts`; type shapes from handoff (`EmitResultPayload`)
**Requirement**: WF1-04

**Tools**:
- MCP: NONE
- Skill: `tdd`

**Done when**:
- [ ] `buildToolInputSchema(expect)` → `{ type:'object', properties:{ status:{enum:['done','blocked']}, data: expect, question:{type:'string'} }, required:['status'] }`
- [ ] `validate(payload, expect)` accepts a conforming `{status:'done', data:<matches expect>}` and a `{status:'blocked', question}`
- [ ] `validate` rejects: missing `status`; `status` not in enum; `data` violating `expect`; `blocked` without `question`
- [ ] Minimal structural validation only (ajv/zod choice deferred to WF3 per design Tech Decisions) — documented in a code comment
- [ ] Gate passes: `npm test`
- [ ] Test count: ≥6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(wf1-spike): emit_result schema builder + validator`

---

### T3: `parseEnvelope` — extract session_id + payload from the JSON envelope [P]

**What**: Pure fn that parses `--output-format json` output and extracts `session_id` and the structured payload for **both** arms (Arm N → `structured_output`; Arm M → resolved via the server, but the envelope still carries `session_id`).
**Where**: `scripts/wf1-spike/parse-envelope.ts` (+ `parse-envelope.test.ts`)
**Depends on**: None
**Reuses**: `JsonEnvelope` shape from design §Data Models
**Requirement**: WF1-05

**Tools**:
- MCP: NONE
- Skill: `tdd`

**Done when**:
- [ ] `parseEnvelope(stdout)` returns `{ sessionId, structuredOutput?, result }` from a valid JSON envelope
- [ ] Edge cases tested: missing `session_id` → surfaced as an error (not silently empty); non-JSON stdout → error with the raw captured text; `structured_output` present vs absent
- [ ] Gate passes: `npm test`
- [ ] Test count: ≥4 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(wf1-spike): parse headless JSON envelope`

---

### T4: `buildAgentArgv` — headless argv for both arms + resume [P]

**What**: Pure argv builder encoding the pinned-flag leads: print + json, per-arm mechanism flag, `dontAsk` posture + allowed tools, `--append-system-prompt` (Arm M), optional `--resume`.
**Where**: `scripts/wf1-spike/build-agent-argv.ts` (+ `build-agent-argv.test.ts`)
**Depends on**: None
**Reuses**: `spawn-plan` pure-builder pattern (kept SEPARATE from `buildSpawnPlan`, per design)
**Requirement**: WF1-02, WF1-07 (posture flag), WF1-08 (both arms)

**Tools**:
- MCP: NONE
- Skill: `tdd`

**Done when**:
- [ ] `buildAgentArgv({arm:'native', ...})` includes `--print`, `--output-format json`, `--json-schema <expect>`, `--permission-mode dontAsk` — and **no** `--mcp-config`
- [ ] `buildAgentArgv({arm:'mcp', ...})` includes `--mcp-config <inline JSON with type:http + Authorization Bearer <token>>`, `--append-system-prompt`, `--permission-mode dontAsk` — and **no** `--json-schema`
- [ ] `--bare` is never emitted (design decision — it defeats subscription auth)
- [ ] A `resumeSessionId` produces `--resume <id>` in place of a fresh invocation, preserving `cwd`/arm
- [ ] Flags are marked in a comment as **documented leads to confirm empirically in T7** (WF1-D1)
- [ ] Gate passes: `npm test`
- [ ] Test count: ≥5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(wf1-spike): build headless agent argv (native + mcp arms)`

---

### T5: `mcp-result-server` — loopback HTTP MCP server (SDK)

**What**: Self-hosted StreamableHTTP MCP server serving a per-token `emit_result` and resolving on a valid call; add the SDK dependency.
**Where**: `scripts/wf1-spike/mcp-server.ts` (+ `mcp-server.test.ts`), `package.json`
**Depends on**: T2 (`buildToolInputSchema` for per-token `tools/list`)
**Reuses**: `@modelcontextprotocol/sdk` `StreamableHTTPServerTransport`; Node `http`; T2 seam
**Requirement**: WF1-03, WF1-04 (MCP arm)

**Tools**:
- MCP: NONE
- Skill: `tdd`

**Done when**:
- [ ] `@modelcontextprotocol/sdk` added as a **devDependency** (spike-only until WF3 confirms MCP is the chosen mechanism)
- [ ] `start()` binds `127.0.0.1:0` (ephemeral port) and returns `{ url, port }`
- [ ] `register(token, expect)` → `tools/list` for that token exposes `emit_result` with `inputSchema` = `buildToolInputSchema(expect)`
- [ ] A valid `emit_result` call (correct token) resolves the pending promise with the validated payload
- [ ] A request with **missing / unknown / revoked** token is rejected (token = auth AND routing)
- [ ] Tests exercise the server as a **real loopback HTTP client** (not internals)
- [ ] Gate passes: `npm run typecheck && npm test`
- [ ] Test count: ≥4 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full
**Commit**: `feat(wf1-spike): loopback HTTP MCP result server`

---

### T6: `run.ts` — spike orchestrator wiring (throwaway)

**What**: The throwaway runner that assembles the seams + server, spawns the real `claude` for both arms + resume, captures stdout, and prints a comparison. No new testable logic — it is the external-CLI boundary.
**Where**: `scripts/wf1-spike/run.ts`
**Depends on**: T1, T3, T4, T5
**Reuses**: `child_process.spawn` (piped stdout capture — NOT node-pty); all four seams + the server
**Requirement**: WF1-01..08 (integration point; observed in T7)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Wires `scrubAuthEnv` (T1) into the child env, `buildAgentArgv` (T4) into argv, `parseEnvelope` (T3) over stdout, and the MCP server (T5) for Arm M
- [ ] Spawns `claude` for Arm N and Arm M, then a `--resume` continuation for each; per-step timeout kills the child; process-exit-without-payload → failure with captured stdout + exit code
- [ ] Contains **no** logic that belongs in a seam (all parsing/argv/env/schema lives in T1–T5 — enforces the "no untested logic here" boundary)
- [ ] Compiles and lints clean: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged from T5 (no new tests; all prior tests still pass)

**Tests**: none (external CLI boundary — AD-004 convention)
**Gate**: build
**Commit**: `feat(wf1-spike): spike orchestrator wiring`

---

### T7: Empirical run + `findings.md` (milestone gate)

**What**: Owner runs the spike against the live subscription and records the pinned flags, confirmed/refuted leads, and the mechanism recommendation.
**Where**: `.specs/features/workflows-headless-agent-spike/findings.md`
**Depends on**: T6
**Reuses**: design §Research findings table as the checklist to confirm/refute
**Requirement**: WF1-01, WF1-02, WF1-03, WF1-05, WF1-06, WF1-07, WF1-08 (all observed here)

**Tools**:
- MCP: NONE
- Skill: `verify` (drive the flow end-to-end and observe)

**Done when** (owner-run — this is the milestone's empirical gate, WF1-D1):
- [ ] Both arms complete on the **subscription** with auth scrubbed (WF1-01)
- [ ] Each arm prints a **schema-valid** payload; Arm M's forced `emit_result` is observed by the server (WF1-03/04)
- [ ] A non-empty **`session_id`** is printed (WF1-05); `--resume` continues the **same** conversation with prior context (WF1-06)
- [ ] A would-prompt action does **not hang** under `dontAsk` (WF1-07)
- [ ] `findings.md` records: every pinned flag as observed on the installed CLI; each lead **confirmed/refuted** (`--json-schema`, `dontAsk`, HTTP-MCP support, `mcp__server__tool` allow-name, `session_id` field, `--bare` refutation); the envelope shape; and a **mechanism recommendation** (Arm N vs Arm M) for WF3 (WF1-02/08)
- [ ] Any refuted lead that breaks a seam → a follow-up fix task is logged (bounded fix→re-verify loop)

**Tests**: none (empirical, owner-run)
**Gate**: empirical
**Commit**: `docs(wf1-spike): empirical findings + mechanism recommendation`

---

## Parallel Execution Map

```
Phase 1 (Parallel — pure seams):
    ├── T1 [P]
    ├── T2 [P]
    ├── T3 [P]
    └── T4 [P]

Phase 2 (Sequential):
  T2 complete, then:
    T5

Phase 3 (Sequential):
  T1, T3, T4, T5 complete, then:
    T6 ──→ T7
```

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: `scrubAuthEnv` | 1 pure fn + test | ✅ Granular |
| T2: `emit-result-schema` | 2 cohesive fns (builder+validator), 1 file | ✅ Granular (cohesive) |
| T3: `parseEnvelope` | 1 pure fn + test | ✅ Granular |
| T4: `buildAgentArgv` | 1 pure fn + test | ✅ Granular |
| T5: `mcp-server` | 1 module + dep add | ✅ Granular (cohesive) |
| T6: `run.ts` wiring | 1 file (glue) | ✅ Granular |
| T7: empirical run + findings | 1 deliverable (findings.md) | ✅ Granular |

## Diagram–Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | none | ✅ Match |
| T2 | None | none | ✅ Match |
| T3 | None | none | ✅ Match |
| T4 | None | none | ✅ Match |
| T5 | T2 | T2 → T5 | ✅ Match |
| T6 | T1, T3, T4, T5 | T1,T3,T4,T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Pure seam | unit | unit | ✅ OK |
| T2 | Pure seam | unit | unit | ✅ OK |
| T3 | Pure seam | unit | unit | ✅ OK |
| T4 | Pure seam | unit | unit | ✅ OK |
| T5 | MCP server (HTTP contract) | integration | integration | ✅ OK |
| T6 | Spike orchestrator (external CLI boundary) | none | none | ✅ OK — external boundary; all testable logic extracted to T1–T5 (AD-004 convention). NOT deferral. |
| T7 | findings.md deliverable | none | none | ✅ OK |
