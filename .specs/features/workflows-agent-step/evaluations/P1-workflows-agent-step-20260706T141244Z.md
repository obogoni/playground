# SDD Evaluation — WF3 Structured Agent Step

**Subject**: `feature/workflows-agent-step` (PR #65), epic Workflows (#56), milestone 3/5
**Evaluated at**: 2026-07-06 (UTC `20260706T141244Z`)
**Diff range**: `e6d7e11..d361131` (merge-base `e6d7e110…` → branch tip)
**PRD (ground truth)**: GitHub issue #56 (epic). **Derived spec (graded for respect/extract)**: `spec.md` + `tasks.md`.
**Frozen AC set**: `spec.md` requirement IDs WF3-01..25 (stable IDs ⇒ used verbatim, Reproducibility rule 1).

## Verdict

| | |
| --- | --- |
| **Final** | **0.98** |
| **Band** | **Spec-complete** (≥ 0.90) |
| **Adjusted Final** | n/a — no confirmed-red gate |
| **Scope `S`** | **PASS** — every built behavior traces to a PRD AC or valid E-addition; all out-of-scope items correctly deferred |
| **Elicitation `E`** | recall **1.0** / precision **≈1.0** / justified **≈1.0** |
| **Gates `G`** | build ✓ · lint ✓ · unit ✓ · e2e **not-run** (evaluator) / owner-PASS |

> **Bias flags (Core rule 4 + Assumptions).** The evaluator is the same model family (Opus) that authored the code ⇒ self-preference risk. Mitigation applied: borderline checks resolved **UNMET** (WF3-04 retry message, WF3-10 reuse assertion). Three behaviors rest on owner-run/HV evidence the evaluator could not reproduce (live subscription unavailable) — enumerated under *Blind spots*.

---

## Subject 1 — Framework: respect & extract

### Diff surface (search scope)

Production: `src/main/{agent-step-runner,emit-result-schema,agent-command-builder,mcp-result-server,parse-envelope,scrub-auth-env,workflow-ctx,workflow-manager}.ts`, `src/main/index.ts`, `src/shared/workflows.ts`. Fixture/smoke: `scripts/fixtures/review-pr/workflow.ts`, `scripts/smoke-agent-workflow.mjs`. Manifest: `package.json`/`package-lock.json`. Tests co-located `*.test.ts` (+ `run-state.test.ts`).

### Per-AC implementation checklist (I-checks)

Legend: **U** unit-proven · **HV** hand-verified thin shell (`index.ts`, "none" layer) · **SMOKE** owner-run live gate.

#### Story A (P1) — Headless agent step returning validated data — **0.93**

| AC | I-check | Verdict | Evidence |
| --- | --- | --- | --- |
| A1/WF3-01 | spawn `claude` directly `shell:false` | MET (HV) | `index.ts:80` |
| A1 | headless argv `--print`/`--output-format json` | MET (U) | `agent-command-builder.ts:67-68`; `agent-step-runner.test.ts:163-164` |
| A1 | stdin closed `stdio:['ignore','pipe','pipe']` | MET (HV) | `index.ts:81` |
| A1 | resolves `{status,data?,question?,sessionId}` | MET (U) | `agent-step-runner.ts:133,147`; test `:159` |
| A2/WF3-02 | scrub 4 higher-precedence auth vars | MET (U) | `scrub-auth-env.ts:14-26`; runner test `:185`, builder test `:107` |
| A3/WF3-03 | ajv-validate `data`; resolve conforming | MET (U) | `emit-result-schema.ts:48-79`; `mcp-result-server.ts:91-103` |
| A4/WF3-04 | issue **exactly one** corrective retry | MET (U) | `agent-step-runner.ts:136`; test `:288` (2 calls) |
| A4 | retry resumes **same session** (`--resume s1`) | MET (U) | `agent-step-runner.ts:142`; test `:254` |
| A4 | retry message **states the validation error** | **UNMET** | `agent-step-runner.ts:84-90,137` — message is generic (`"no valid emit_result call was made"`); ajv error surfaced in-turn server-side (`mcp-result-server.ts:96`) but not echoed into the retry prompt |
| A5/WF3-05 | exit-without-emit → throw carrying `{stdout,stderr,code}` | MET (U) | `agent-step-runner.ts:150-154`; test `:282-288` |

#### Story B (P1) — Enforce structured output via MCP result server — **0.96**

| AC | I-check | Verdict | Evidence |
| --- | --- | --- | --- |
| B1/WF3-06 | `inputSchema` = `buildToolInputSchema(expect)` **verbatim** via low-level `Server` | MET (U) | `mcp-result-server.ts:70-82`; test `:56` exact `.toEqual` |
| B1 | per-step token keys the registration | MET (U) | `mcp-result-server.ts:136-151` |
| B1 | argv `--mcp-config` (http + `Bearer`) + `--allowedTools` emit tool | MET (U) | `agent-command-builder.ts:70-87`; builder test `:32-34,:50` |
| B2/WF3-07 | inject "finish by calling emit_result" | MET (U) | `agent-command-builder.ts:53-55,80`; test `:26` |
| B3/WF3-08 | unknown/missing token → 401, no resolve | MET (U) | `mcp-result-server.ts:116-119`; test `:95,:108` |
| B4/WF3-09 | revoke on resolve; late/dup can't re-resolve | MET (U) | `mcp-result-server.ts:154-164`; `agent-step-runner.ts:157`; tests `:116,:126` + runner `:166` |
| B5/WF3-10 | lazy `127.0.0.1:0` binding | MET (U) | `mcp-result-server.ts:129`; test `:43-45` |
| B5 | **shared/reused across steps & runs** (start-once memoized) | MET (impl) | `agent-step-runner.ts:105-107`; single `index.ts:233` instance (HV) — logic present; see T-gap |

#### Story C (P1) — Per-step permission posture + non-hang — **1.00**

| AC | I-check | Verdict | Evidence |
| --- | --- | --- | --- |
| C1/WF3-11 | `read` → `dontAsk` + `emit_result,Read,Grep,Glob` | MET (U) | `agent-command-builder.ts:51,85-87`; test `:49-50` |
| C1 | `read` allow-list has **no** Edit/Write/Bash | MET (U) | `READ_TOOLS` `:51`; test `:59-66` |
| C2/WF3-12 | `write` adds Edit/Write/Bash | MET (U) | `:52,86`; test `:72-74` |
| C3/WF3-13 | `bypass` → `bypassPermissions`, no allow-list | MET (U) | `:82-83`; test `:79-80` |
| C4/WF3-14 | unpermitted tool auto-denied via `dontAsk` posture | MET (U, argv) | test `:84-89` — *runtime* auto-deny is SMOKE (see Blind spots) |
| C5/WF3-15 | default `read` when omitted | MET (U) | `:61` (`?? 'read'`); test `:53-56` |

#### Story D (P1) — Capture session_id; `blocked` first-class — **1.00**

| AC | I-check | Verdict | Evidence |
| --- | --- | --- | --- |
| D1/WF3-16 | capture non-empty `session_id` | MET (U) | `parse-envelope.ts:31-36`; test `:11-14` |
| D1 | record on run (ctx → reducer → persist) | MET (U) | `workflow-ctx.ts:262`; `workflow-manager.ts:123`; `run-state.test.ts:113-121`; ctx test `:412-423`; mgr test `:322` |
| D2/WF3-17 | `blocked` returned as-is, no pause/throw | MET (U) | `agent-step-runner.ts:133`; tests runner `:223-227`, ctx `:393-397` |
| D3/WF3-18 | `blocked` w/o non-empty question → reject | MET (U) | `emit-result-schema.ts:64-67`; test `:66-75` |

#### Story F (P1) — review-pr example + smoke gate — **1.00** *(e2e attested, not evaluator-reproduced)*

| AC | I-check | Verdict | Evidence |
| --- | --- | --- | --- |
| F1/WF3-21 | changedFiles → `read` agent w/ findings `expect` → notify | MET (artifact) | `scripts/fixtures/review-pr/workflow.ts:58,75-80,84` |
| F2/WF3-22 | smoke asserts done + findings-validate + session_id + no-mutation | MET (artifact) | `scripts/smoke-agent-workflow.mjs:205,235,253,261` — live pass is owner-run (Blind spots) |

#### Story E (P2, weight 0 — excluded from Final) — auto-log + cancellable — 1.00

| AC | I-check | Verdict | Evidence |
| --- | --- | --- | --- |
| E1/WF3-19 | `instrument('agent')` → step-started + checkCancel before spawn | MET (U) | `workflow-ctx.ts:259`; tests `:400-410,:426-437` |
| E2/WF3-20 | cancel kills running child → `cancelled` | MET (U) | `agent-step-runner.ts:222-226` + `workflow-manager.ts:167`; tests runner `:339`, mgr `:286-319` |

#### Edge cases (WF3-23/24 — verified, both MET)

- `claude` unresolved → `"agent binary not found"`, no spawn — `agent-step-runner.ts:189-194`; test `:306-322`. ✅
- invalid `expect` → throw **before** spawn/register — `emit-result-schema.ts:50`; runner test `:292-303`. ✅
- MCP bind failure → clear step failure — **not directly unit-tested** (`start()` rejection propagates through `#ensureStarted`, HV). Minor, acknowledged in `validation.md`.

### Elicitation `E` (spec vs epic PRD #56)

**`E_recall` (frozen category rubric):** 9 Addressed / 1 N/A / 0 Missed ⇒ **1.0**

| # | Category | Verdict | Where |
| --- | --- | --- | --- |
| 1 | Input validation & bounds | Addressed | invalid `expect` pre-spawn (WF3-24); blocked-requires-question (WF3-18) |
| 2 | Error taxonomy | Addressed | `AgentStepError{stdout,stderr,code}`; binary-not-found; schema-compile error |
| 3 | AuthN/AuthZ | Addressed | per-step bearer = auth+routing; `scrubAuthEnv`; permission presets |
| 4 | Idempotency/dedup | Addressed | token revoked on resolve → late/dup can't re-resolve (WF3-09) |
| 5 | Concurrency/races | Addressed | serial guard (WF2) reused; token-keyed shared server (assumption logged) |
| 6 | Data lifecycle | Addressed | session_id capture; token register/revoke; server stop on `will-quit` |
| 7 | Observability | Addressed | auto step-started; sessionId on step-logged; captured child output on fail |
| 8 | Limits/pagination | **N/A** | single structured result, no lists |
| 9 | External-dep failure | Addressed | exit-without-emit fails; child crash/kill; **timeout consciously deferred** (deferred-valid, US33→WF-later) |
| 10 | State-transition | Addressed | status enum; settled-once guard; blocked-requires-question |

**`E_precision`:** added-requirement ledger (one-corrective-retry, read-non-mutating allow-list, token-as-auth, revoke-on-resolve, exit-without-emit-fails, PATH+config binary resolution, MCP-bind clear error, Arm-M-only AD-008) — **all valid** (necessary/defensive), zero hallucinated or PRD-contradicting ⇒ **≈1.0**.
**`E_justified`:** every Assumptions-table row carries a Rationale + Confirmed flag; every requirement has a traceability ID ⇒ **≈1.0**.

> Extraction is the strongest dimension: the framework surfaced the implicit hardening (token auth, revoke/dedup, non-mutating guarantee, fail-visibly) and **deferred** timeout/pause/UI with logged rationale rather than gold-plating.

### Scope `S` — **PASS**

- **PRD-boundary:** out-of-scope items correctly **not built** — no `ctx.ask`/engine-pause, no native toast (manager `notifier` reserved & unused, `workflow-manager.ts:36`), no Arm N `--json-schema` (builder test `:37` asserts absence), no timeout auto-kill. ✅
- **Rogue build:** none. `parseEnvelope.result` is a benign envelope field (traces to WF3-16). ✅
- **Plan drift:** none — all 12 tasks built. The 2 `SPEC_DEVIATION` markers (`CtxDeps.agent`/`CtxRuntime.signal` typed optional) are benign phase-ordering typing accommodations; production wires both and behavior is proven. ✅

---

## Subject 2 — Harness: are all sanctioned requirements proven?

**Sanctioned set** = PRD ACs ∪ valid E-additions. Every sanctioned requirement has a T-check at the policy-required level. Two T-gaps below.

### T-check gaps (only the non-MET checks; all others MET — see I-tables for evidence)

| Requirement | T-gap | Why UNMET | Impact |
| --- | --- | --- | --- |
| **WF3-04** | no test asserts the retry prompt **states the validation error** | `agent-step-runner.test.ts:249-255` proves *one retry / same session / resolves* but never asserts message content; the generic prompt (I-gap) is untested | T=2/3 for A4 → Story A 0.93 |
| **WF3-10** | no test asserts the server is **started once / reused** across two `run()` calls | `FakeServer.startCalls` is tracked (`agent-step-runner.test.ts:37,40`) but never asserted; reuse is exercised via `#ensureStarted` memo, not pinned (own `validation.md` Note 1) | T=1/2 for B5 → Story B 0.96 |

### Robustness `R` (extra tests beyond ACs — never inflates Final)

Defensive extras: ajv-only `pattern` keyword, compiled-once reusable checker, `validate` convenience wrapper (`emit-result-schema.test.ts:94-121`); scope-guard `--json-schema`/`--bare` absence (`agent-command-builder.test.ts:37-43`); ctx "does-not-default-permission" (`workflow-ctx.test.ts:439-449`). Weighted ≈ Med×4 + Low×3 ⇒ solid defensive posture.

### Engineering Gates `G`

| Gate | Command (pinned) | Result |
| --- | --- | --- |
| **build** | `npm run typecheck` | ✓ exit 0 |
| **lint** | `npm run lint` | ✓ exit 0 |
| **unit** | `npx vitest run` | ✓ exit 0 — WF3 files **104/104**; full suite green |
| **e2e** | `node scripts/smoke-agent-workflow.mjs` (live) | **not-run (evaluator)** — needs live Claude subscription + running dev app over CDP; unavailable to evaluator. Owner-run **PASS 6/6** (commit `61b298f`, STATE.md: runId `8a8b19d7…`, session_id `9b1438dd…`, worktree unmutated) |

> **Non-graded NOTE:** first full-suite run showed 2 failures in `workflow-loader.test.ts` and `tree.test.ts` — both **outside the WF3 diff surface**, real-git-worktree/esbuild integration tests. Re-run in isolation → **23/23 pass** ⇒ environmental timeout flakiness, not a WF3 regression. Does not gate `unit` and does not trigger Adjusted Final.

No confirmed-red gate ⇒ **Adjusted Final = Final = 0.98**.

### Test distribution `D`

| Tier | Definition | ~Count | ~% |
| --- | --- | --- | --- |
| **Necessary** (P1 primary happy path) | runner-happy, mcp valid-emit-resolves, builder read-posture, ctx-delegate, mgr-persist, parse-happy, schema-accept | ~10 | ~15% |
| **Secondary** (edge/negative/security) | 401×2, revoke, retry, fail, blocked, invalid-expect, binary-unresolved, cancel-kill, scrub, write/bypass/default, blocked-no-question, session pass-through | ~48 | ~74% |
| **Nice-to-have** (no AC) | ajv pattern, reusable-checker, validate wrapper, `--json-schema`/`--bare` absent, no-default | ~7 | ~11% |

**Shape:** healthy — every P1 primary path has ≥1 Necessary test; Secondary-heavy, which is appropriate for a security-sensitive agent-spawn (auth/token/permission/cancel). Descriptive only.

---

## Ranked gaps (to reach 1.00)

1. **WF3-04 — retry prompt does not state the specific validation error** (I + T). The runner's corrective prompt is generic; the ajv error is only reported in-turn server-side. *Fix:* capture the last server-reported ajv error for the token and interpolate it into `correctivePrompt(reason)`; add `agent-step-runner.test.ts` assertion that the retry `prompt`/argv contains the field-level error. (Raises A4 to 1.0 → Final ≈ 0.99.)
2. **WF3-10 — server-reuse not asserted** (T). *Fix:* in `agent-step-runner.test.ts`, run two `run()` calls against one `FakeServer` and `expect(server.startCalls).toBe(1)`. (Raises B5 to 1.0 → Final = 1.0.)
3. **Edge — MCP bind-failure path not unit-tested** (minor). *Fix:* a runner test where `server.start()` rejects → step fails with a clear error, no spawn.
4. **Blind-spot hardening (optional):** add a runner-level test that a `read`-posture argv would be rejected for a mutating tool is not unit-expressible (CLI runtime), but the smoke's no-mutation manifest check is the right guard — keep it in CI-adjacent owner runs.

## Blind spots (evaluator could not reproduce — rest on owner-run + HV)

- **WF3-22 live smoke** — the end-to-end `done`/findings-validate/session_id/no-mutation pass is owner-run (live subscription). Evaluator verified the **script logic + assertions**, not a live execution. Owner attests 6/6.
- **WF3-11/14 runtime auto-deny** — that `--permission-mode dontAsk` + read allow-list *actually* auto-denies mutating tools without a prompt is a `claude` CLI behavior; unit tests pin only the argv posture. The owner smoke's "worktree unmutated" is the empirical confirmation. This is the load-bearing safety guarantee — worth a periodic owner re-run.
- **WF3-01 spawn flags** — `shell:false` + stdin-closed are HV in `index.ts` (thin-shell "none" layer), not automated.

## Reproducibility

Roll-up computed by script (weights P1=2/P2=0; `AC=0.6·I+0.4·T`; `Story=mean(AC)`; `Final=Σw·Story/Σw`). Only one non-zero priority tier in scope ⇒ Final = mean of the five P1 story scores. Story scores: A 0.9333 · B 0.9600 · C/D/F 1.0000. **Σw·Story=9.7867, Σw=10, Final=0.9787 → 0.98 (Spec-complete).**
