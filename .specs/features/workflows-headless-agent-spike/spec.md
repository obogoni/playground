# Feature: WF1 — Headless Agent Spike (de-risk, throwaway)

**Milestone:** WF1 — first milestone of Workflows (issue #56); the de-risk spike.
**Size:** Medium–Large spike. The whole point is empirical: pin the *unverified* Claude Code headless flags and prove a self-hosted HTTP MCP server can force structured output out of a real agent running on the developer's subscription. Most architecture is already decided in the PRD; this milestone confirms it against reality before WF2–WF5 build on it. Deliberately thin — references PRD #56 rather than restating it.
**Sources of truth:** Issue #56 PRD (§Solution — AI agent step; §Implementation Decisions — *AI agent step*, *mcp-result-server*, *agent-command-builder*, *emit-result-schema*; §Milestones — WF1; §Further Notes — the three load-bearing notes and the "leads not facts" caveat), user decision 2026-07-03 (**spec WF1 first, then spec WF2–WF5 with the pinned flags**).
**Prior art:** `agent-spike` (AM1) — the analogous de-risk spike, same "prove the scary stack with the thinnest slice, isolate the permanent seams from the throwaway scaffolding, empirical gate is the deliverable" shape.

## Why

Every downstream Workflows milestone (WF2–WF5) rests on assumptions about Claude Code's **headless** behavior that **no one has verified on this machine**: the exact print flag, the `--output-format json` envelope and its `session_id` field, how to point the agent at an **HTTP MCP server**, the permission posture that lets an unattended run finish instead of hanging on a prompt, and how `--resume` continues a conversation. A sub-agent investigation produced *plausible-but-unconfirmed* flags (`--bare`, `--json-schema`, a `dontAsk` permission mode) that the PRD explicitly labels **leads, not facts**. Also load-bearing for the headline goal (personal plan, not metered API): the child process env must have `ANTHROPIC_API_KEY` **scrubbed** so a stray var can't silently bill the API.

Writing precise, testable acceptance criteria for the production agent step (WF3/WF4) before these are pinned would be fabricating outcomes. WF1 exists to replace guesses with observed facts: a script that drives a **real** agent, forces it to call a **self-hosted** `emit_result` MCP tool, gets back **schema-validated** structured data plus a `session_id`, and resumes the same conversation — all on the subscription, with the API key scrubbed. The gate is that observed run, not a mock.

## Decisions

- **WF1-D1 — Empirical gate, owner-run.** The core outcomes (subscription auth, forced `emit_result`, `session_id`, `--resume`, no permission hang) can only be observed by running the **real** Claude Code CLI against a **real** logged-in subscription. That gate is **hand-verified by the owner**, exactly as `agent-spike` hand-verified the packaged build. It is not, and cannot be, a mocked Vitest assertion.
- **WF1-D2 — Pure seams are unit-tested even in a throwaway.** Two pieces are pure and load-bearing and get real Vitest tests now because WF3 lifts them into production modules: the **env scrub** (proves `ANTHROPIC_API_KEY` is removed from the built child env) and the **emit-result schema** builder + validator (given an `expect` JSON Schema → the `emit_result` `inputSchema`; conforming payload accepted, non-conforming rejected). Prior art: `spawn-plan` pure-builder tests.
- **WF1-D3 — Throwaway wiring, permanent knowledge.** The spike script and its ad-hoc glue are **disposable**. What survives WF1: (a) a **findings note** recording every pinned flag and each lead confirmed/refuted, and (b) the two pure seams from WF1-D2, which seed WF3's `agent-command-builder` and `emit-result-schema`. The spike is NOT the production `agent-step-runner`.
- **WF1-D4 — Single loopback HTTP MCP server, per-step bearer token.** Structured output is enforced by a self-hosted **HTTP MCP** server on loopback at a random port, hosting a single `emit_result` tool whose `inputSchema` is built **per token** from the step's `expect`. The token both **routes** the call and **authorizes** it (calls without a valid token are rejected). This is the PRD's chosen shape; WF1 confirms the agent actually honors it.
- **WF1-D5 — Blocker is a terminal `emit_result` value, not a separate tool.** A blocker is `emit_result` with `status: "blocked"` + a `question` — the agent records it and ends its turn (MCP elicitation can't block in headless). WF1 proves the `status: "done"` path end-to-end; it demonstrates the `blocked` value shape but does **not** build the pause/resume-on-guidance UX (that is WF4).
- **WF1-D6 — Claude only, current installed CLI.** WF1 targets the Claude Code CLI already installed on this machine, logged into the owner's Pro/Max subscription. Codex/Copilot adapters are out of scope for all of v1 and irrelevant here.

## Requirements

### WF1-01 — Headless invocation on the subscription, auth env scrubbed
The spike SHALL invoke Claude Code in **headless print mode** (non-interactive, single prompt in / result out) such that it runs on the developer's **logged-in subscription**, with **every higher-precedence auth source removed** from the child process environment. WHEN the spike builds the child env THEN it SHALL NOT contain `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, or `CLAUDE_CODE_USE_VERTEX` (the auth-precedence set that outranks the subscription — see design.md), even if the parent process has them set. WHEN the headless run executes with those scrubbed THEN it SHALL still complete successfully (subscription auth proven). The env-scrub is a **pure function** and is unit-tested (WF1-D2). *(Design refinement 2026-07-03: the spec originally named only `ANTHROPIC_API_KEY`; the auth-precedence list showed several sources outrank the subscription, so the scrub is broadened to the full set.)*

### WF1-02 — Pinned flags recorded, leads confirmed or refuted
The spike SHALL determine, **by real invocation**, the working CLI flags for: (a) headless print, (b) `--output-format json`, (c) pointing the agent at an **HTTP MCP** server with per-step config/headers, (d) the **permission posture** for unattended runs, (e) `--resume`. WHEN the spike concludes THEN a **findings note** SHALL record each pinned flag as observed, and SHALL mark each PRD lead (`--bare`, `--json-schema`, `dontAsk`) as **confirmed** or **refuted** — none left as an assumption. Fabricated/assumed flags are a defect for this milestone.

### WF1-03 — Self-hosted HTTP MCP server receives a forced `emit_result`
The spike SHALL stand up a **loopback HTTP MCP server** on a random port that, for a given bearer token, serves a `tools/list` exposing an `emit_result` tool whose `inputSchema` is built for that token's `expect`. WHEN the agent runs the headless prompt with the engine-injected "always finish by calling `emit_result`" instruction THEN the server SHALL observe a valid `emit_result` tool call routed by that bearer token. WHEN a request arrives with a missing or unknown/revoked token THEN the server SHALL reject it (the token is auth, not just routing).

### WF1-04 — Structured output validated against the declared `expect`
The `emit_result` argument SHALL be shaped `{ status: "done" | "blocked", data?, question? }`, where `data`'s schema is the step's author-declared `expect` (a JSON Schema). WHEN a conforming payload arrives THEN the server SHALL accept it and the spike SHALL print the **validated** structured `data`. WHEN a non-conforming payload arrives THEN validation SHALL reject it. The **schema builder** (`expect → inputSchema`) and the **validator** are pure functions and are unit-tested (WF1-D2). (Whether the agent's own tool-call machinery retries on mismatch, and the orchestrator's one corrective `--resume` retry, are production concerns for WF3; WF1 only needs to observe that a forced, conforming call is achievable.)

### WF1-05 — `session_id` captured from the JSON envelope
WHEN the headless run finishes with `--output-format json` THEN the spike SHALL extract a **non-empty `session_id`** from the JSON envelope and print it. The exact envelope field name is part of WF1-02's findings.

### WF1-06 — Resume continues the same conversation
WHEN the spike re-invokes the agent with the captured `session_id` via `--resume` and a follow-up prompt in the same working directory THEN the agent SHALL continue the **same** conversation — retaining prior context — and emit a **second** `emit_result`. The spike SHALL demonstrate the continuity concretely (e.g. the follow-up references something only the first turn established).

### WF1-07 — Permission posture does not hang an unattended run
WHEN a headless run performs an action that would normally raise a permission prompt, under the chosen posture (with `emit_result` **always allowed** regardless of preset) THEN the run SHALL complete without stalling on an interactive prompt. The spike SHALL exercise at least one such action to prove the posture, and the findings note SHALL record which posture/flag achieves it.

### WF1-08 — Comparative structured-output mechanism, recommendation for WF3
*(Added 2026-07-03: research found a native structured-output flag — `--json-schema` → `structured_output` — that the PRD did not consider and that could make the MCP server unnecessary in v1.)* The spike SHALL exercise **both** structured-output mechanisms against the real agent: **Arm N (native)** via `--json-schema` (payload read from the JSON envelope's `structured_output`), and **Arm M (MCP)** via the self-hosted `emit_result` tool (WF1-03/WF1-04). WHEN both arms have run THEN each SHALL print a schema-valid payload, and the findings note SHALL record a **recommendation** of which mechanism WF2/WF3 should adopt, with the trade-offs observed (simplicity, robustness, coverage of the `blocked` path, forward-compat). The PRD's MCP choice is **not superseded** by this milestone — the decision is deferred to WF3 with this evidence. Both arms share the `expect` schema seam (WF1-04).

## Out of scope

Deferred to later Workflows milestones (WF2–WF5); NOT part of WF1.

| Item | Where it belongs |
| --- | --- |
| `workflow-loader`, `workflow-runner`, `run-state`, the `ctx` facade, esbuild bundling of `workflow.ts` | WF2 |
| ADO **child-task** fetching (new `$expand=Relations` gateway surface — confirmed in scope for v1) | WF2 |
| Production `mcp-result-server`, `agent-command-builder`, `emit-result-schema`, `agent-step-runner` as DI'd/tested modules | WF3 |
| `ctx.ask`, blocked→resume-on-guidance UX, `workflows:respond`, blocked notifications | WF4 |
| Workflows view, run timeline, trigger dialog, blocked-respond panel | WF5 |
| The corrective one-retry-on-schema-mismatch orchestration and the agent's internal retry behavior | WF3 |
| Codex / Copilot adapters | out of scope for all of v1 |
| Durable runs across app restart, `utilityProcess` isolation, parallel runs | v2 |

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| The machine running the spike has the **Claude Code CLI installed and logged into a Pro/Max subscription** | Required precondition for the WF1-01/05/06/07 empirical gate; the owner runs it | The whole headline goal is "run on my subscription"; there is no way to observe subscription auth without a real logged-in CLI | y (owner-run) |
| The installed Claude Code version **supports MCP over HTTP (loopback)** | Assumed yes; **this is itself what WF1-03 verifies** | The PRD's entire structured-output mechanism depends on it; if HTTP MCP is unsupported, the approach (not just the flags) must be reconsidered — this is the single highest-risk open question | n — verified by WF1-03 |
| Which exact flags work (print, json, MCP-http, permission, resume) | **Unknown by design** — WF1-02 is the act of pinning them | The PRD states they are unverified and calls the sub-agent's flags leads-not-facts | n — produced by WF1-02 |
| "Proves not metered-billed" is observed **indirectly**: the scrub removes the key from the built env (unit test) **and** the run still succeeds on subscription | Assert the observable proxy, not literal billing | Actual billing can't be inspected from the process; the load-bearing, checkable facts are "key absent from child env" + "run still works" | y (this spec) |
| `esbuild` as a **direct** dependency for `workflow.ts` bundling | Add it in WF2 (matches PRD's esbuild-bundle-mode choice; it is only a transitive dep today) | Not needed by WF1 — the spike loads no `workflow.ts`; recorded here so WF2 picks it up | n/a for WF1 |

**Open questions:** none unmarked — the two genuine unknowns (HTTP-MCP support, exact flags) are the spike's deliverables, logged above; all others resolved or logged.

## Verification

Split by nature, per WF1-D1/D2 and the repo convention (external/OS boundaries are hand-verified; pure seams are unit-tested).

**Automated unit tests (Vitest, pure — these gate the pure seams and seed WF3):**
- **Env scrub** (pure) — given a parent env containing `ANTHROPIC_API_KEY`, the built child env omits it; other vars pass through. Prior art: `spawn-plan`. (WF1-01)
- **emit-result schema** (pure) — given an `expect` JSON Schema, assert the built `emit_result` `inputSchema` (status/data/question shape with `data` = `expect`); `validate` accepts a conforming payload and rejects a non-conforming one. (WF1-04)
- **MCP token rejection** (if the spike server is exercised as a real HTTP client, per the PRD `mcp-result-server` test plan) — a request with an unknown/revoked token is rejected. (WF1-03)

**Empirical, owner-run (the spike's real gate — a single real run against the live subscription):**
- The spike script runs the real headless agent with `ANTHROPIC_API_KEY` scrubbed and it **completes on the subscription**. (WF1-01, WF1-02)
- The self-hosted HTTP MCP server **observes a forced, valid `emit_result` call** for the step's token, and the script **prints the schema-validated `data`**. (WF1-03, WF1-04)
- The script **prints a non-empty `session_id`**. (WF1-05)
- A **`--resume`** follow-up continues the **same conversation** and emits a second `emit_result` that demonstrably has prior context. (WF1-06)
- An action that would prompt **does not hang** under the chosen posture; the completing run proves it. (WF1-07)

**Deliverable artifact:** a **findings note** (WF1-02/WF1-D3) capturing every pinned flag, each lead confirmed/refuted, the JSON envelope field for `session_id`, the working MCP-HTTP config shape, and the permission posture — the input WF2/WF3 build on.

## Traceability

| Req | Surface (spike — disposable unless noted) |
| --- | --- |
| WF1-01 | headless spawn + **pure env-scrub seam** (survives → WF3 `agent-command-builder`) |
| WF1-02 | real invocations + **findings note** (survives → WF2/WF3 inputs) |
| WF1-03 | loopback HTTP MCP server (per-token `tools/list`, token auth) — spike wiring |
| WF1-04 | **pure emit-result schema builder + validator** (survives → WF3 `emit-result-schema`) |
| WF1-05, WF1-06 | JSON-envelope parse (`session_id`, `structured_output`) + `--resume` re-invoke — spike wiring |
| WF1-07 | permission-posture flag (`dontAsk` + allowed tools) on the spawn — recorded in findings |
| WF1-08 | Arm N (`--json-schema`) vs Arm M (MCP) comparison + **mechanism recommendation** in findings; shares the `expect` seam |
| Unit | new `*.test.ts` for the two pure seams (+ optional MCP token-reject over HTTP) |
| Empirical | owner-run spike script + findings note |
