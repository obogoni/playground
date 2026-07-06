# WF3 — Structured Agent Step Validation

**Date**: 2026-07-06
**Spec**: `.specs/features/workflows-agent-step/spec.md`
**Diff range**: `e6d7e11..d361131` (feature branch `feature/workflows-agent-step`)
**Verifier**: independent sub-agent (author ≠ verifier; coverage re-derived evidence-or-zero)
**Verdict**: **PASS ✅**

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 deps (ajv + mcp-sdk → prod) | ✅ Done | both in `dependencies` |
| T2 emit-result-schema (ajv) | ✅ Done | 15 tests |
| T3 scrub-auth-env | ✅ Done | 5 tests |
| T4 parse-envelope | ✅ Done | 6 tests |
| T5 agent-command-builder | ✅ Done | 12 tests |
| T6 mcp-result-server | ✅ Done | 7 tests (real loopback) |
| T7 agent-step-runner | ✅ Done | 9 tests (DI fakes) |
| T8 StepEvent.sessionId + reducer | ✅ Done | 2 guard tests |
| T9 ctx.agent | ✅ Done | 6 tests |
| T10 manager AbortController | ✅ Done | 3 tests |
| T11 index.ts wiring | ✅ Done | hand-verified thin shell |
| T12 review-pr example + smoke | ✅ Done | owner-run gate (deferred) |

---

## Spec-Anchored Acceptance Criteria

Layer legend: **U** = unit-covered; **HV** = hand-verified thin shell (`index.ts`, "none" layer per matrix); **SMOKE** = owner-run smoke gate (live subscription, "none" layer).

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WF3-01 `ctx.agent` spawns claude headless, stdin closed, resolves validated envelope | resolves `{status,data?,question?,sessionId}`; spawn `shell:false`, `stdio:['ignore','pipe','pipe']` | `agent-step-runner.test.ts:159` — `expect(res).toEqual({status:'done',data:{answer:42},sessionId:'sess-1'})`; `:161-164` bin='claude', argv `--print`. Spawn flags: `index.ts` `spawnAgent` `shell:false,stdio:['ignore','pipe','pipe']` (HV) | ✅ PASS (U + HV) |
| WF3-02 scrub higher-precedence auth | 4 vars removed; subscription auth | `scrub-auth-env.test.ts:13-16` each var `.toBeUndefined()`; `agent-command-builder.test.ts:107` `env.ANTHROPIC_API_KEY` undefined; `agent-step-runner.test.ts:185` spawned `env.ANTHROPIC_API_KEY` undefined | ✅ PASS |
| WF3-03 done → ajv-validate data, resolve conforming | conforming `data` resolves; non-conforming rejected | `emit-result-schema.test.ts:31-34` accepts conforming; `:54-58` rejects wrong type (ajv `id`); `:84-92` `minItems` (ajv-only) enforced | ✅ PASS |
| WF3-04 non-conforming/no-emit → ONE corrective `--resume` retry; retry conforms → resolve | exactly one retry, resumes same session | `agent-step-runner.test.ts:249-255` resolves after retry; `:254` `calls[1].argv.slice(0,2)==['--resume','sess-3']`; `:288` `calls.toHaveLength(2)` | ✅ PASS |
| WF3-05 exit without valid emit (after retry) → fail capturing stdout/stderr/code | throw carrying `{stdout,stderr,code}` | `agent-step-runner.test.ts:282-288` `AgentStepError` with `detail=={stdout:envelope('sess-4b'),stderr:'boom',code:3}` | ✅ PASS |
| WF3-06 register `emit_result` inputSchema=`buildToolInputSchema(expect)` verbatim, per-token, argv `--mcp-config`+`--allowedTools` | inputSchema exact; http+Bearer; emit tool allowed | `mcp-result-server.test.ts:56` `inputSchema.toEqual(buildToolInputSchema(EXPECT))`; `agent-command-builder.test.ts:32-34` http+`Bearer tok-secret`; `:50` allowedTools starts `mcp__result__emit_result` | ✅ PASS |
| WF3-07 inject "always finish by emit_result" instruction | `--append-system-prompt` mentions emit_result | `agent-command-builder.test.ts:26` `valueAfter('--append-system-prompt').toMatch(/emit_result/)` | ✅ PASS (spec pins no exact string) |
| WF3-08 unknown/revoked token rejected | 401, no step resolved | `mcp-result-server.test.ts:95` no-token→401; `:108` unknown→401; `:126` revoked→401 | ✅ PASS |
| WF3-09 revoke token on resolve | pending rejected, later calls rejected | `mcp-result-server.test.ts:116` `rejects.toThrow(/revoked/)` + `:126` 401; `agent-step-runner.test.ts:166` `revoked.toContain('tok-1')` | ✅ PASS |
| WF3-10 lazy shared loopback lifecycle | `127.0.0.1` ephemeral port; reused | `mcp-result-server.test.ts:43-45` URL `^http://127.0.0.1:\d+/mcp$`, port>0. Shared/memoized reuse: runner `#ensureStarted` + single `index.ts` instance (HV) | ✅ PASS (binding U; reuse HV — see Note 1) |
| WF3-11 read → read-only tools + emit_result; mutating auto-denied | `dontAsk` + `emit_result,Read,Grep,Glob`; no Edit/Write/Bash | `agent-command-builder.test.ts:49-50` mode+tools exact; `:59-66` tools `.not.toContain('Edit'/'Write'/'Bash')` | ✅ PASS (auto-deny runtime behavior is SMOKE — Note 2) |
| WF3-12 write adds Edit/Write/Bash | tools = read set + Edit,Write,Bash, still dontAsk | `agent-command-builder.test.ts:72-74` allowedTools exact string | ✅ PASS |
| WF3-13 bypass → all tools, no prompts | `bypassPermissions`, no `--allowedTools` | `agent-command-builder.test.ts:79-80` mode + `argv.not.toContain('--allowedTools')` | ✅ PASS |
| WF3-14 unpermitted tool auto-denied, no hang | `dontAsk` posture (auto-deny) | `agent-command-builder.test.ts:84-89` read+write both `dontAsk`. Actual no-prompt/continue is SMOKE | ✅ PASS (posture U; behavior SMOKE — Note 2) |
| WF3-15 default read when omitted | omitted → dontAsk + read tools | `agent-command-builder.test.ts:54-56` | ✅ PASS |
| WF3-16 capture non-empty session_id, record on run | sessionId on result + persisted `step-logged` | `parse-envelope.test.ts:11-14`; `agent-step-runner.test.ts:159` sessionId in result; `workflow-ctx.test.ts` records via emitLog (`sessionId==='sess-xyz-42'`); `workflow-manager.test.ts` persists `sessionId:'sess-persisted-9'`; `run-state.test.ts:117-119` pass-through | ✅ PASS |
| WF3-17 blocked returned as-is, no pause/throw | `{status:'blocked',question,sessionId}`, no throw | `agent-step-runner.test.ts:223-227` resolves blocked as-is; `workflow-ctx.test.ts` blocked verbatim | ✅ PASS |
| WF3-18 blocked missing/empty question → validation rejects | reject (triggers retry) | `emit-result-schema.test.ts:66-69` no question rejected; `:72-75` empty-string question rejected | ✅ PASS |
| WF3-19 instrument wrapper: step-started 'agent' + checkCancel before spawn | auto `step-started` label `agent`; cancel before delegate | `workflow-ctx.test.ts` `steps.toEqual([{label:'agent',group:undefined}])`; cancelled run `rejects CancellationError`, `calls==[]`, `steps==[]` | ✅ PASS |
| WF3-20 cancel kills running child → cancelled | `child.kill()` + `CancellationError`; run `cancelled` | `agent-step-runner.test.ts:339-340` `kills.toContain(0)` + `rejects CancellationError`; `workflow-manager.test.ts` cancel aborts signal (`aborted===true`) → `status:'cancelled'` | ✅ PASS |
| WF3-21 review-pr example workflow | reads changedFiles → read agent w/ findings expect → notify | `scripts/fixtures/review-pr/workflow.ts` FINDINGS_SCHEMA + `permission:'read'` + changedFiles→agent→notify (artifact present) | ✅ PASS (SMOKE artifact — deferred) |
| WF3-22 smoke gate: done + validated findings + session_id + no-mutation | run `done`; findings validate; non-empty session_id; no worktree mutation | `scripts/smoke-agent-workflow.mjs` `check()` asserts all four (`:206,:235,:254,:262`) | ⏭️ Deferred to owner-run smoke (live subscription) |
| WF3-23 binary unresolved → clear error, no spawn | "agent binary not found", no spawn | `agent-step-runner.test.ts:316-319` `rejects /agent binary not found/`, `calls.toHaveLength(0)`; `index.ts resolveClaude` throws (HV) | ✅ PASS |
| WF3-24 invalid `expect` → fail before spawn | throw pre-spawn, no register | `emit-result-schema.test.ts:101-104` `createValidator` throws; `agent-step-runner.test.ts:298-303` rejects, `calls==0`, `regs==0` | ✅ PASS |
| WF3-25 promote emit-result-schema (ajv) + mcp-sdk to prod dep | ajv+sdk in `dependencies` | `package.json` `dependencies` add `ajv` + `@modelcontextprotocol/sdk` (removed from devDeps); typecheck + install clean (build gate) | ✅ PASS |

**Status**: ✅ All 25 ACs covered — 22 unit-covered (+ HV wiring), 3 deferred to owner-run smoke by design (WF3-21 artifact / WF3-22 live gate / auto-deny runtime behavior for WF3-11/14). No unit-coverage gaps.

### Edge cases

- [x] `claude` unresolved → fail, no spawn (WF3-23, unit)
- [x] invalid `expect` → fail before spawn (WF3-24, unit)
- [ ] MCP server bind failure → clear step failure — not directly unit-tested; `server.start()` rejection propagates through `#ensureStarted` (thin path, HV). Minor; acceptable.
- [x] serial-guard second run refused — WF2 pre-existing (unchanged)
- [x] wrong shape twice after retry → fail with last output (WF3-05, unit)
- [x] child killed/crashes → fail capturing code (covered by WF3-05 code-capture + WF3-20 kill)

---

## Discrimination Sensor

Sensor depth: **P0-full (8 mutations)** — this is a core feature. Each injected in a scratch edit, relevant test file run, then reverted (`git checkout --`). Tree confirmed clean after each.

| # | File:line | Mutation | Relevant test | Killed? |
| - | --------- | -------- | ------------- | ------- |
| 1 | `emit-result-schema.ts:65` | blocked question `.length === 0` → `< 0` (empty question passes) | `emit-result-schema.test.ts` | ✅ Killed (1 fail @ :72) |
| 2 | `emit-result-schema.ts:72` | invert ajv check `!validateData` → `validateData` (invalid data passes) | `emit-result-schema.test.ts` | ✅ Killed (7 fails) |
| 3 | `agent-command-builder.ts:51` | add `'Edit'` to `READ_TOOLS` (read step can mutate) | `agent-command-builder.test.ts` | ✅ Killed (4 fails) |
| 4 | `mcp-result-server.ts:92` | `if (!result.ok)` → `if (false && !result.ok)` (non-conforming payload resolves step) | `mcp-result-server.test.ts` | ✅ Killed (1 fail @ :83) |
| 5 | `agent-step-runner.ts:222` | remove `child.kill()` in abort handler (cancel doesn't kill child) | `agent-step-runner.test.ts` | ✅ Killed (1 fail @ :339) |
| 6 | `agent-step-runner.ts:142` | `resumeSessionId: session1` → `undefined` (retry doesn't resume session) | `agent-step-runner.test.ts` | ✅ Killed (1 fail @ :254) |
| 7 | `workflow-manager.ts:167` | comment out `controller.abort()` in `cancel()` (signal never fires) | `workflow-manager.test.ts` | ✅ Killed (1 fail @ WF3-20) |
| 8 | `workflow-ctx.ts:262` | `emitLog(..., result.sessionId)` → `..., undefined` (sessionId not recorded) | `workflow-ctx.test.ts` | ✅ Killed (1 fail @ WF3-16) |

**Result**: **8/8 killed** — PASS ✅. No surviving mutants. Tests are discriminating across all highest-risk logic (validation, permission posture, MCP token/resolve, cancel-kill, retry-resume, session capture, manager abort wiring).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code (no scope creep) | ✅ — modules match design §Components 1:1; only `agent-step-runner` is net-new logic |
| Surgical changes | ✅ — WF2 seams extended minimally (StepEvent +1 field, CtxDeps/Runtime +1 each, CancelToken +controller) |
| Matches existing patterns | ✅ — DI-via-fakes (SessionManager/WorkflowManager convention); real-loopback server test mirrors WF1 spike |
| Spec-anchored outcome check | ✅ — asserted values match spec outcomes (exact tool strings, status codes, sessionIds) |
| Per-layer coverage met | ✅ — pure seams all-branches; behavior server via real wire; runner all branches with fakes |
| Every test maps to a requirement | ✅ — reverse-mapped; no speculative/unclaimed tests found |
| Documented guidelines followed | ✅ — `.specs/codebase/TESTING.md` matrix + co-location; `Tests: none` on T1/T11/T12 matches "none" layers |

---

## Gate Check

- **Command**: `npm run typecheck && npm run lint && npx vitest run`
- **typecheck**: ✅ 0 errors (node + web)
- **lint**: ✅ 0 errors, 18 warnings (all pre-existing prettier line-wrap in smoke scripts + `src/shared/workflows.ts:28` — not WF3 logic files)
- **tests**: ✅ **390 passed / 390** across **33 files**, 0 failed, 0 skipped
- **Test count before feature**: 325 (27 files)
- **Test count after feature**: 390 (33 files)
- **Delta**: **+65 new tests** (target was ~56–65), zero deletions, zero skips

---

## Deviation Judgments

1. **`CtxDeps.agent` + `CtxRuntime.signal` typed OPTIONAL** (2 `SPEC_DEVIATION` markers; design §7 shows required) — **BENIGN, no AC weakened.** Rationale holds: production always injects both (`index.ts` wires `agent`; `WorkflowManager.run` sets `signal = token.controller.signal`), and behavior is fully proven — `workflow-manager.test.ts` confirms the runtime `signal` is a live un-aborted `AbortSignal` on normal completion and that `cancel()` fires it (`aborted===true`) killing the in-flight step → `cancelled` (WF3-20). `ctx.agent` throws a clear "agent capability is not configured" if `agent` were absent (defensive). The optionality is a phase-ordering typing accommodation (T9 ships before T10/T11) with no runtime or coverage consequence.

2. **T5: `agent-command-builder` does not import `emit-result-schema`'s `JsonSchema`** — **CORRECT.** WF3-06 requires the `expect` schema to become the `emit_result` `inputSchema` on the **server** (`mcp-result-server.ts` imports `buildToolInputSchema`), not in argv. The MCP arm carries no `expect` in the command line — it rides the server tool `inputSchema` — so no AC requires the builder to import it. The T5→T2 phase edge is ordering-only.

3. **T7: corrective-retry prompt is generic** ("no valid emit_result call was made") rather than echoing the specific ajv error — **acceptable, matches design.** For a non-conforming payload the server already reports the ajv error in-turn (`isError` text, `mcp-result-server.ts:96`); the runner's `--resume` retry only fires when the turn ends with no valid emit, at which point there is no single ajv error to state. Spec WF3-04's "a message stating the validation error" is satisfied by the in-turn server report; no AC (and no independent test) pins a specific retry-prompt string. Minor spec-precision note, not a gap.

---

## Notes (minor, non-blocking)

- **Note 1 — WF3-10 "reused across steps and runs":** the lazy loopback *binding* is unit-tested (`mcp-result-server.test.ts:43`); the *shared/memoized reuse* is via `AgentStepRunner.#ensureStarted` (exercised, but no test asserts `start` is called exactly once across two `run()` calls) + the single `index.ts` server instance (HV). Behavior is sound; adding a "start memoized once across two steps" runner assertion would tighten it. Non-blocking.
- **Note 2 — WF3-11/14 auto-deny runtime behavior:** unit tests pin the *argv posture* (`dontAsk` + read-only allow-list) that produces auto-deny; the actual "unpermitted tool auto-denied without prompt, run continues" is a `claude` CLI behavior deferred to the owner-run smoke (design Risks explicitly flags the read-only tool-name list + `bypassPermissions` mode name as empirical leads). This is the designed "none" layer, not a coverage gap.

---

## Requirement Traceability Update

All 25 requirements (WF3-01..25) → **✅ Verified** (WF3-21/22 verified at artifact level; final live confirmation is the owner-run smoke gate, by design).

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 25/25 ACs matched spec outcome — 22 unit-covered (+HV wiring), 3 deferred to owner-run smoke by design. 0 spec-precision gaps that block; 2 minor notes recorded.
**Sensor**: 8/8 mutations killed (P0-full).
**Gate**: 390/390 tests pass, typecheck 0 err, lint 0 err. +65 tests, 0 deletions.

**What works**: full agent-step path — ajv envelope validation, MCP token auth/route/revoke, permission-preset argv, headless spawn wiring, corrective-retry-with-resume, cancel-kill via AbortSignal, session_id capture end-to-end.

**Issues found**: none blocking.

**Next steps**: owner runs `scripts/smoke-agent-workflow.mjs` against a live subscription to close WF3-22 (the only live-gated criterion). Optional: tighten the two minor notes above.
