# WF1 — Headless Agent Spike · Validation Report

**Feature:** WF1 — Headless Agent Spike (de-risk, throwaway)
**Branch:** `feature/wf1-headless-agent-spike`
**Diff range:** `main..HEAD` (`3179cee..e89a4aa`)
**Verifier:** independent (author ≠ verifier; coverage re-derived from spec, evidence-or-zero)
**Date:** 2026-07-03

**Verdict: PASS** — automated seams fully covered and mutation-sensitive; empirical gate (T7) is owner-run and correctly pending.

> **Split-gate note (WF1-D1/D2).** This is a de-risk SPIKE whose real gate is an owner-run empirical run against a live logged-in Claude CLI. That portion is **not** the verifier's to run (AD-004; `run.ts` is a throwaway external-CLI boundary with no unit tests by convention). This report verifies **only** the automated portion: the pure seams and the loopback HTTP MCP server. Every AC below is marked as either *automated* (asserted here) or *owner-run empirical* (T7, out of scope for this report).

---

## Task Completion (T1–T7)

| Task | Scope | Automated status | Evidence |
| --- | --- | --- | --- |
| T1 `scrubAuthEnv` | pure seam + test | ✅ Done | `scrub-auth-env.ts`; 5 tests `scrub-auth-env.test.ts` |
| T2 `emit-result-schema` | builder + validator + test | ✅ Done | `emit-result-schema.ts`; 9 tests `emit-result-schema.test.ts` |
| T3 `parseEnvelope` | pure seam + test | ✅ Done | `parse-envelope.ts`; 5 tests `parse-envelope.test.ts` |
| T4 `buildAgentArgv` | pure argv builder + test | ✅ Done | `build-agent-argv.ts`; 6 tests `build-agent-argv.test.ts` |
| T5 `mcp-result-server` | loopback HTTP MCP + dep + test | ✅ Done | `mcp-server.ts`; 7 tests (real HTTP client) `mcp-server.test.ts`; `@modelcontextprotocol/sdk` added to devDeps |
| T6 `run.ts` wiring | throwaway orchestrator | ✅ Done (build gate) | `run.ts` composes all seams + server; no unit tests (external-CLI boundary, AD-004) |
| T7 empirical run + `findings.md` | owner-run milestone gate | ⏳ **PENDING (owner-run, WF1-D1)** | `findings.md` not present; correctly deferred — cannot be run by the verifier |

---

## Spec-anchored Acceptance-Criteria Check

Automated ACs re-derived from the spec; `file:line` + assertion cited for each (no citation = NOT covered). Empirical-only portions are flagged as owner-run (T7).

| Req | Spec-defined expected outcome (automated portion) | Evidence (`file:line` + assertion) | Owner-run empirical portion (T7) |
| --- | --- | --- | --- |
| **WF1-01** | Built child env omits `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX` even if parent has them; other vars pass through; input not mutated | `scrub-auth-env.test.ts:12-16` (all 4 `toBeUndefined`); `:27-30` (PATH/HOME/`ANTHROPIC_MODEL` pass through); `:41` (input unmutated); `:45-50` (precedence list guard) | Run still **completes on the subscription** with the set scrubbed |
| **WF1-02** | The pinned-flag leads are encoded in the built argv (print, json, mcp-http, dontAsk, resume) | `build-agent-argv.test.ts:24-29`, `:44-48`, `:59` (leads asserted); flags commented as leads in `build-agent-argv.ts:8-20` | **Findings note** recording each pinned flag & each lead **confirmed/refuted** |
| **WF1-03** | Loopback server on ephemeral port; per-token `tools/list` exposes `emit_result`; valid call resolves; missing/unknown/revoked token rejected | `mcp-server.test.ts:41` (`127.0.0.1:<port>/mcp`); `:50-52` (tools/list); `:64` (`resolves`); `:86`,`:90`,`:96-97` (reject no/unknown/revoked token) | Real agent **actually calls** `emit_result` for the token |
| **WF1-04** | `emit_result` shaped `{status, data?, question?}`; `data` = `expect`; conforming accepted, non-conforming rejected | builder `emit-result-schema.test.ts:13-21`; accept `:27-28`,`:33`; reject `:39`,`:45`,`:51`,`:57`,`:63`,`:69`; server validates `mcp-server.test.ts:79-80` | Spike **prints** the validated `data` from the real run |
| **WF1-05** | Non-empty `session_id` extracted from the JSON envelope; empty/missing/non-JSON surfaced as an error (not silently empty) | `parse-envelope.test.ts:12-16` (extract); `:28` (missing→throws, raw text); `:34` (empty→throws); `:39` (non-JSON→throws) | Real run **prints** a non-empty `session_id` |
| **WF1-06** | `--resume <id>` emitted, preserving arm mechanism + prompt | `build-agent-argv.test.ts:59-62` (`--resume sess-abc`, arm flag + prompt preserved) | **Same conversation continues with prior context** (the true AC — inherently empirical) |
| **WF1-07** | Posture flags emitted: `--permission-mode dontAsk` + `emit_result` always allowed | `build-agent-argv.test.ts:40` (`dontAsk`); `:52` (`--allowedTools mcp__result__emit_result`) | A would-prompt action **does not hang** under the posture |
| **WF1-08** | Both arms build a schema-valid invocation from the shared `expect` seam (Arm N `--json-schema`; Arm M MCP) | Arm N `build-agent-argv.test.ts:24-29`; Arm M `:38-48`; shared `expect` = `emit-result-schema` | Both arms print a valid payload; **mechanism recommendation** in findings |

**Automated spec-anchored coverage: 8/8** requirements have their automated surface asserted. WF1-02/06/07/08 are *partially* automated by design — the argv/seam portion is asserted here; the confirm-vs-refute / conversation-continuity / no-hang / recommendation portions are owner-run empirical (T7) and correctly not mocked.

### ⚠️ Precision / minor observations (non-blocking)
- **`checkSchema` enum + array/items branches untested.** `emit-result-schema.ts:76-79` (enum) and `:96-105` (array/items) have no test — the spike's `expect` fixtures only use `type`/`properties`/`required`. Not a spec AC (the spec doesn't require enum/array in `expect`), and the module is an explicitly-minimal spike validator that WF3 replaces with ajv/zod. Recorded, not blocking.
- **`winQuote` in `run.ts:52-56` is untested logic in the throwaway.** It is genuine shell-quoting logic living in the orchestrator rather than a seam. Defensible as `shell:true` spawn-boundary plumbing (AD-004 external boundary; the Windows `.cmd` shim forces `shell:true`), and it is throwaway. Worth extracting if any of this survives to WF3.
- **Documented `SPEC_DEVIATION` (`build-agent-argv.ts:40-42`):** design listed `cwd` in the argv opts, but the headless CLI has no cwd flag → `cwd` stays a `spawn()` concern. Legitimate, explicitly annotated. No action.

---

## Discrimination Sensor (mutation testing)

All mutations injected into a **scratch state only** (edit → run the specific test file → `git checkout --`); working tree restored after each. **None committed.**

| # | File · target | Mutation | Test run | Result |
| --- | --- | --- | --- | --- |
| M1 | `emit-result-schema.ts:50` · `validate` status-enum guard | append `&& false` → any status accepted | `emit-result-schema.test.ts` | **KILLED** — 1 failed (`rejects a status outside the done/blocked enum`) |
| M2 | `emit-result-schema.ts:86` · `checkSchema` required-field | append `&& false` → skip required check | `emit-result-schema.test.ts` | **KILLED** — 1 failed (`rejects done data missing a required field`) |
| M3 | `parse-envelope.ts:33` · empty-`session_id` guard | drop `|| length === 0` → empty id accepted | `parse-envelope.test.ts` | **KILLED** — 1 failed (`throws when session_id is present but empty`) |
| M4 | `mcp-server.ts:74` · `inputSchema` wiring | `buildToolInputSchema(reg.expect)` → `({})` | `mcp-server.test.ts` | **KILLED** — 1 failed (`inputSchema is built from the token expect`) |
| M5 | `mcp-server.ts:113` · token-auth guard | `if (!reg)` → `if (!token)` (unknown token bypasses 401) | `mcp-server.test.ts` | **KILLED** — 2 failed (`rejects unknown token`, `rejects revoked token`) |

**Sensor: 5 injected / 5 killed / 0 survived.** The highest-risk seams (validator, schema builder wiring, envelope guard, token auth) are all mutation-sensitive.

---

## Build Gate

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` (node + web) | ✅ PASS — 0 errors |
| Lint | `npm run lint` (`eslint --cache .`) | ✅ PASS — 17 warnings, **all pre-existing in `scripts/smoke-*.mjs`; 0 in `scripts/wf1-spike/`** |
| Test | `npm test` (`vitest run`) | ✅ PASS |

**Test counts (full suite):** 22 files, **257 passed / 0 failed / 0 skipped**.
**Spike subset (`scripts/wf1-spike`): 5 test files, 32 tests, all passing** — scrub 5, emit-result-schema 9, parse-envelope 5, build-agent-argv 6, mcp-server 7.

---

## Code Quality

- **Minimal & surgical.** Each seam is one cohesive pure function/module; `run.ts` is pure glue with no seam logic (all env/argv/parse/schema live in T1–T5). Matches the `spawn-plan.ts` pure-builder pattern the design cites.
- **No scope creep.** SDK added as a **devDependency** only (spike-only until WF3), per T5. No production module touched; nothing bled into `src/`.
- **Boundary discipline correct.** `run.ts` and `mcp-server` HTTP wiring are the external boundaries; the pure seams are extracted and tested (AD-004). `buildAgentArgv` deliberately kept separate from `buildSpawnPlan` per design.
- **Self-documenting throwaway intent.** Every file header marks disposable-vs-survives (→ WF3) and flags the argv entries as *leads to confirm in T7* (WF1-D1). The low-level MCP `Server` choice (over `McpServer`) is justified in-file — it preserves the verbatim `inputSchema` that WF1-04 asserts.
- Minor: `winQuote` untested logic and the untested `checkSchema` enum/array branches (see observations above) — acceptable for a throwaway spike, worth revisiting in WF3.

---

## Requirement Traceability

| Req | Automated surface | Covered? | Empirical (owner-run T7) |
| --- | --- | --- | --- |
| WF1-01 | `scrubAuthEnv` seam + test | ✅ | run completes on subscription |
| WF1-02 | `buildAgentArgv` leads + test | ✅ (argv) | findings: leads confirmed/refuted |
| WF1-03 | `mcp-server` HTTP contract + test | ✅ | agent forced to call `emit_result` |
| WF1-04 | `emit-result-schema` + server validate + tests | ✅ | prints validated `data` |
| WF1-05 | `parseEnvelope` seam + test | ✅ | prints non-empty `session_id` |
| WF1-06 | `buildAgentArgv` resume form + test | ✅ (argv) | conversation continuity |
| WF1-07 | `buildAgentArgv` posture flags + test | ✅ (flags) | no-hang under `dontAsk` |
| WF1-08 | both-arm argv + shared `expect` seam + tests | ✅ (argv) | mechanism recommendation |

Every requirement's automated surface is covered and citation-backed. Empirical portions are owner-gated (T7) and correctly pending.

---

## Summary

The automated half of the split gate is **complete and robust**: five spike test files (32 tests) cover every pure seam and the loopback HTTP MCP server against a real client, all 8 requirements' automated surfaces are citation-backed, and a 5/5 mutation sensor confirms the tests actually discriminate on the highest-risk logic (validator, schema-builder wiring, session-id guard, token auth). Build gate is green (typecheck 0 errors, lint 0 warnings in-scope, 257/257 tests). No fix tasks.

**T7 (empirical, owner-run) remains the milestone gate** and is out of scope for this verifier: the owner must run `tsx scripts/wf1-spike/run.ts` against the live logged-in subscription, confirm both arms complete with auth scrubbed, capture a non-empty `session_id`, prove `--resume` continuity and no permission hang, and record `findings.md` (pinned flags, leads confirmed/refuted, mechanism recommendation). Until that runs, WF1's core empirical claims are unproven **by nature, not by defect** — exactly as WF1-D1 specifies.

**Verdict: PASS** (automated scope). Milestone completion is blocked only on the owner-run T7 empirical run + `findings.md`.
