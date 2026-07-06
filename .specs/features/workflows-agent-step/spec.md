# WF3 — Structured Agent Step Specification

**Epic**: Workflows (issue #56 PRD), **milestone 3 of 5**.
**Depends on**: WF1 (empirical flag findings + two surviving seams) and WF2
(engine, `ctx` facade, `WorkflowManager`) — both merged to `main` (PR #64).
**Feeds**: WF4 (blocker + resume) and WF5 (Workflows UI).

## Problem Statement

WF2 gave workflows deterministic primitives (`ctx.worktree/git/sh/ado/notify`) but
no way to run an **AI agent step**. The headline goal of the epic — orchestrating
Claude Code headless, on the developer's personal subscription, returning *typed*
structured data the next step can rely on — is still missing. WF1 empirically pinned
every flag needed (headless `--print`, `--output-format json` with `session_id`,
loopback HTTP-MCP, `--json-schema`, `--permission-mode dontAsk`, `--resume`) but only
as throwaway spike wiring. WF3 turns that proof into production modules and exposes
`ctx.agent()` so a workflow can hand a prompt + expected schema to an agent and get
back validated data.

## Goals

- [ ] Add `ctx.agent({ prompt, expect, cwd, permission })` to the WF2 `ctx` facade,
      running Claude Code **headless** on the subscription (auth-precedence env
      scrubbed) and returning a **validated** `{ status, data?, question?, sessionId }`.
- [ ] Enforce structured output through the agent's **tool-call machinery** — a
      self-hosted loopback HTTP **MCP result server** hosting a forced `emit_result`
      whose `inputSchema` is built per-step from the author's `expect`; validate with
      **ajv**.
- [ ] Guarantee unattended completion: per-step permission posture (`read`/`write`/
      `bypass`) with `read` **guaranteed non-mutating**, and no hang on an
      unexpected permission prompt.
- [ ] Capture `session_id` on the run record for WF4's `--resume`.
- [ ] **Gate:** a "review PR" example workflow runs end-to-end and returns validated
      findings, driven by a smoke script over CDP (mirrors WF2-20).

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| `ctx.ask()` + engine-driven **pause on `blocked`** + `workflows:respond` + resume-via-`--resume` | WF4. WF3 only makes `blocked` a first-class **returned** value and captures `session_id`; it never pauses the run. |
| Native toast on block/finish/fail + click-to-focus-run | WF4 (US 22/23). The `notifier` reserved in `WorkflowManagerDeps` stays unused here. |
| Workflows **view**, run timeline UI, blocked-respond panel, trigger dialog | WF5 (US 28/30 UI). WF3 is verified by smoke script, per the project UI convention. |
| Arm N (`--json-schema`) fast-path | Decided (Assumptions): Arm M (MCP) only — one code path; the `blocked` value + per-step routing/auth are first-class over MCP. |
| Codex / Copilot CLI adapters | Epic Out-of-Scope: Claude-only in v1. |
| Parallel agent steps / parallel runs | Epic Out-of-Scope: serial in v1 (WF2 guard reused). |
| Wall-clock **timeout** auto-kill of an agent step | Assumptions: no hard timeout in v1; **cancellation** kills the child. A generous timeout can be layered later. |
| Durable session across app restart | Epic Out-of-Scope: runs are ephemeral (WF2). |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Structured-output mechanism | **Arm M (MCP) only** | One shared loopback HTTP MCP server; per-step bearer token = auth **and** routing; forced `emit_result`. Keeps `blocked` + routing first-class for WF4; matches PRD `mcp-result-server`. Arm N dropped. | **y** |
| Payload validation | **ajv** | Author declares `expect` as a JSON Schema (same object fed to the tool `inputSchema`); ajv is the standard full JSON-Schema validator. Promotes `emit-result-schema` off the spike's minimal checker. | **y** |
| `ctx.agent()` return shape + `blocked` behavior | **Full envelope `{ status, data?, question?, sessionId }`; `blocked` returned as-is** | Author decides on `blocked` in WF3; WF4 adds the engine pause without breaking the happy path. `sessionId` always captured. | **y** |
| Permission presets | **`read` / `write` / `bypass`; default `read`** | `read` = read-only tools + `emit_result`, guaranteed non-mutating; `write` = adds Edit/Write/Bash in the step cwd; `bypass` = all tools, no prompts. All auto-deny/allow (no interactive stall). | **y** |
| Agent binary resolution | Resolve `claude` from **PATH**, with an optional `agent.claudePath` config override; clear error if unresolved | WF1 found a native `claude.exe` on PATH (`~/.local/bin`); PATH-first keeps zero config for the common case, the override handles non-standard installs. | n (assumption) |
| MCP result server lifecycle | **One shared** loopback server, started lazily on first agent step, reused across steps/runs; per-step token registered before spawn, **revoked** when the step resolves | PRD Further Notes: a single shared server keyed by per-step token is viable and forward-compatible with future concurrency. | n (assumption) |
| Schema-mismatch handling | **One corrective retry**, then fail | Matches the PRD test list (`agent-step-runner`: "schema mismatch → one corrective retry then fail"). Bounded, cheap, avoids infinite loops. | n (assumption) |
| `emit_result` never called (agent exits first) | Step **fails**, capturing stdout/stderr/exit code | An unattended step must fail visibly, never hang or silently pass (WF1 confirmed stdin-closed completion). | n (assumption) |
| MCP SDK dependency | Promote `@modelcontextprotocol/sdk` from **devDep → prod dep** | The result server now ships in production main, not just the spike. Installed `--ignore-scripts` (node-gyp workaround, WF2). | n (assumption) |
| `emit_result` server transport | Low-level `Server` + `setRequestHandler` (not `McpServer`), stateful per-token transport, `enableJsonResponse:true` | WF1 finding: `registerTool` reshapes the schema through Zod; the low-level server returns `buildToolInputSchema(expect)` **verbatim** so `expect` is honored exactly. | n (assumption) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Run a headless agent step returning validated structured data ⭐ MVP

**User Story**: As a workflow author, I want an `agent` step that runs Claude Code
headless and returns data matching a schema I declare, so that the next step can rely
on its shape instead of parsing free text — and it runs unattended on my personal
subscription, not metered API. *(US 16/17/18)*

**Why P1**: This is the entire point of the milestone; without it WF3 delivers nothing.

**Acceptance Criteria**:

1. WHEN a workflow calls `ctx.agent({ prompt, expect, cwd })` THEN the engine SHALL
   spawn the resolved `claude` binary **directly** (`shell:false`, argv array
   verbatim) in headless mode (`--print`, `--output-format json`) with **stdin
   closed** (`stdio:['ignore','pipe','pipe']`), and SHALL resolve to a validated
   `{ status, data?, question?, sessionId }`.
2. WHEN the agent child process is spawned THEN its environment SHALL have every
   higher-precedence auth source removed via `scrubAuthEnv` (`ANTHROPIC_API_KEY`,
   `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`), so
   the run authenticates on the subscription.
3. WHEN the agent returns `status:'done'` THEN the engine SHALL validate `data`
   against the step's `expect` JSON Schema with **ajv** and SHALL resolve with the
   conforming `data`.
4. WHEN the payload does **not** conform to `expect` THEN the engine SHALL issue
   **one** corrective retry (same session, a message stating the validation error);
   if the retry still fails to conform THEN the step SHALL **fail** capturing the
   validation error and the agent output.
5. WHEN the agent process exits **without ever calling `emit_result`** THEN the step
   SHALL fail, capturing stdout/stderr and the exit code — never hang, never silently
   pass.

**Independent Test**: A DI'd `agent-step-runner` test with a fake spawner: emit→resolve
happy path (data conforms); non-conforming→corrective-retry→conforming resolves;
non-conforming twice fails; process-exit-without-emit fails with captured output.

---

### P1: Enforce structured output via a self-hosted MCP result server ⭐ MVP

**User Story**: As a workflow author, I want the structured-output contract enforced
by the agent's tool-call machinery (not prompt wording), and I want the engine to
inject the "always finish by calling `emit_result`" instruction for me, so that the
agent is forced to conform and I only provide the prompt + expected schema.
*(US 19/20)*

**Why P1**: MCP enforcement is the robustness investment that distinguishes this from
brittle free-text parsing; it is how AC P1-3 above is actually guaranteed.

**Acceptance Criteria**:

1. WHEN an agent step starts THEN the engine SHALL register, on a shared loopback
   HTTP MCP server, an `emit_result` tool whose `inputSchema` is
   `buildToolInputSchema(expect)` (returned **verbatim** via the low-level
   `Server`+`setRequestHandler`, `enableJsonResponse:true`), keyed by a **per-step
   bearer token**, and SHALL pass the agent `--mcp-config` (loopback URL +
   `Authorization: Bearer <token>`) and `--allowedTools mcp__<server>__emit_result`.
2. WHEN the engine builds the agent invocation THEN it SHALL inject an instruction
   directing the agent to **always finish by calling `emit_result`**, so the author
   supplies only `prompt` + `expect`.
3. WHEN the agent calls `emit_result` with a bearer token that is unknown or already
   revoked THEN the server SHALL reject the call (not resolve any step).
4. WHEN a step resolves (done/blocked/fail) THEN its per-step token SHALL be
   **revoked** so a late/duplicate call cannot resolve it again.
5. WHEN the shared MCP server is needed and not yet running THEN it SHALL be started
   lazily on loopback (`127.0.0.1`, ephemeral port) and reused for subsequent steps
   and runs.

**Independent Test**: `mcp-result-server` exercised as a real HTTP client: `register`
returns a pending promise; a per-token `tools/list` reflects the registered `expect`;
a valid `emit_result` resolves the promise; an unknown/revoked token is rejected.

---

### P1: Per-step permission posture with a non-hanging guarantee ⭐ MVP

**User Story**: As a workflow author, I want to declare each agent step's permission
posture (`read`/`write`/`bypass`) so review steps are guaranteed not to mutate while
implementation steps have autonomy — and I want steps to never hang on an unexpected
permission prompt, so unattended runs actually complete. *(US 26/27)*

**Why P1**: A review step that could silently write is a correctness hazard; a step
that hangs on a prompt defeats the unattended goal. Both are load-bearing for the
"review PR" gate.

**Acceptance Criteria**:

1. WHEN a step declares `permission:'read'` (the default) THEN the agent SHALL be
   spawned with a posture that permits only read-only tools (e.g. Read/Grep/Glob)
   plus `emit_result`, such that any mutating tool (Edit/Write/Bash) is **auto-denied**
   — a `read` step **cannot** modify files.
2. WHEN a step declares `permission:'write'` THEN the posture SHALL additionally
   permit the mutating tools (Edit/Write/Bash) so the agent can do implementation work
   in its `cwd`.
3. WHEN a step declares `permission:'bypass'` THEN all tools SHALL be permitted with
   no prompts (full autonomy).
4. WHEN the agent attempts a tool not permitted by the step's posture THEN the attempt
   SHALL be **auto-denied without an interactive prompt**, and the run SHALL continue
   to completion (no stall).
5. WHEN `permission` is omitted THEN the engine SHALL default to `read`.

**Independent Test**: `agent-command-builder` (pure) asserts the produced `argv`/`env`
for each of `read`/`write`/`bypass` and for a resume invocation, and asserts
`ANTHROPIC_API_KEY` is absent from `env`.

---

### P1: Capture `session_id`; make `blocked` a first-class returned value ⭐ MVP

**User Story**: As a workflow author, I want an agent step to be able to report a
blocker and I want the engine to capture the agent's `session_id`, so that WF4 can
later pause on the blocker and resume the *same* conversation. *(US 21 — value only;
pause is WF4)*

**Why P1**: `session_id` capture and the `blocked` terminal value are the WF4 seam;
building them now (while the agent plumbing is fresh) is cheaper than retrofitting.

**Acceptance Criteria**:

1. WHEN the JSON envelope is parsed THEN the engine SHALL capture the non-empty
   `session_id` field and record it on the run so a later milestone can `--resume` it.
2. WHEN the agent calls `emit_result` with `status:'blocked'` and a non-empty
   `question` THEN `ctx.agent()` SHALL resolve to `{ status:'blocked', question,
   sessionId }` **as-is** — it SHALL NOT pause the run and SHALL NOT throw (the
   engine-driven pause is WF4).
3. WHEN `status:'blocked'` is emitted with a missing/empty `question` THEN validation
   SHALL reject it (blocked requires a question), triggering the corrective retry
   (P1-4 above).

**Independent Test**: fake-spawner runner test: a `blocked` emit resolves to
`{status:'blocked', question, sessionId}` without pausing/throwing; the parsed
`session_id` is present on the result.

---

### P2: The `ctx.agent()` step auto-logs and is cancellable like every `ctx.*`

**User Story**: As a workflow author, I want the agent step to show up on the timeline
automatically and to stop when I cancel the run, so I get visibility for free and a
runaway agent can be stopped. *(US 29; WF2-10/WF2-14 extension)*

**Why P2**: The `instrument()` wrapper already gives auto-logging; the new work is
killing a **running child** on cancel (WF2 only checked cancellation at `ctx.*`
boundaries — a long agent await needs child-kill).

**Acceptance Criteria**:

1. WHEN `ctx.agent(...)` is invoked THEN it SHALL be built through the WF2
   `instrument()` wrapper so a `step-started` (label `agent`) is auto-emitted and the
   cancellation token is checked before spawn (zero author effort).
2. WHEN a run is **cancelled while an agent child is running** THEN the child process
   SHALL be killed and the step SHALL end the run `cancelled` (no orphaned `claude`
   process).

**Independent Test**: runner test — cancel mid-flight kills the fake child and
surfaces cancellation; `makeCtx` wiring emits a `step-started` for `agent`.

---

### P1: "Review PR" example workflow + end-to-end smoke gate ⭐ MVP

**User Story**: As the developer, I want a working "review PR" example workflow and a
smoke script that runs it end-to-end returning validated findings, so that the whole
agent-step path is proven — this is the milestone's gate. *(Epic WF3 gate)*

**Why P1**: The gate defined in the PRD. It exercises `ctx.worktree` + `changedFiles`
(WF2) feeding a `read` agent step (WF3) that returns structured findings.

**Acceptance Criteria**:

1. WHEN the example workflow runs THEN it SHALL read a worktree's changed files (WF2
   `ctx.worktree.changedFiles`) and pass that diff context to a `read` `ctx.agent()`
   step declaring an `expect` schema for findings (e.g. an array of `{ file, severity,
   summary }`).
2. WHEN the smoke script drives `workflows:run` for the example over CDP THEN the run
   SHALL reach `status:'done'`, the returned findings SHALL validate against the
   step's `expect`, and a non-empty `session_id` SHALL appear on the persisted run
   record.
3. WHEN the smoke gate runs THEN it SHALL confirm the agent step ran under the `read`
   posture (no files mutated in the worktree during review).

**Independent Test**: `scripts/smoke-agent-workflow.mjs` (copies the `smoke-workflow.mjs`
skeleton) — owner-run against a live subscription, à la WF1's empirical gate.

---

## Edge Cases

- WHEN the `claude` binary cannot be resolved (not on PATH, no `agent.claudePath`)
  THEN the step SHALL fail with a clear "agent binary not found" error (no spawn
  attempt).
- WHEN `expect` is not a valid JSON Schema THEN ajv compilation SHALL fail and the
  step SHALL fail with a clear schema-compile error before spawning the agent.
- WHEN the shared MCP server fails to start (port bind error) THEN the step SHALL fail
  with a clear error rather than spawning an agent that can never emit.
- WHEN a second `workflows:run` is attempted while an agent step is in flight THEN it
  SHALL be refused by the existing WF2 serial guard (unchanged).
- WHEN the agent emits a payload that is valid JSON but the wrong shape twice (after
  the one corrective retry) THEN the step SHALL fail with the last validation error.
- WHEN the agent process is killed externally / crashes THEN the step SHALL fail
  capturing the exit signal/code, never hang.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| WF3-01 | P1 Headless step | Design | Pending |
| WF3-02 | P1 Headless step (scrub auth) | Design | Pending |
| WF3-03 | P1 Headless step (ajv validate done) | Design | Pending |
| WF3-04 | P1 Headless step (corrective retry) | Design | Pending |
| WF3-05 | P1 Headless step (exit-without-emit fails) | Design | Pending |
| WF3-06 | P1 MCP server (register per-token tool + argv) | Design | Pending |
| WF3-07 | P1 MCP server (inject emit_result instruction) | Design | Pending |
| WF3-08 | P1 MCP server (reject unknown/revoked token) | Design | Pending |
| WF3-09 | P1 MCP server (revoke token on resolve) | Design | Pending |
| WF3-10 | P1 MCP server (lazy shared loopback lifecycle) | Design | Pending |
| WF3-11 | P1 Permissions (read guaranteed non-mutating) | Design | Pending |
| WF3-12 | P1 Permissions (write adds mutating tools) | Design | Pending |
| WF3-13 | P1 Permissions (bypass all tools, no prompts) | Design | Pending |
| WF3-14 | P1 Permissions (auto-deny, no hang) | Design | Pending |
| WF3-15 | P1 Permissions (default read) | Design | Pending |
| WF3-16 | P1 session_id capture on run record | Design | Pending |
| WF3-17 | P1 blocked returned as-is, no pause/throw | Design | Pending |
| WF3-18 | P1 blocked requires a question (else retry) | Design | Pending |
| WF3-19 | P2 agent step auto-logged via instrument | Design | Pending |
| WF3-20 | P2 cancel kills running agent child | Design | Pending |
| WF3-21 | P1 review-PR example workflow | Design | Pending |
| WF3-22 | P1 smoke gate: done + validated findings + session_id | Design | Pending |
| WF3-23 | Edge: agent binary resolution + clear error | Design | Pending |
| WF3-24 | Edge: invalid `expect` fails before spawn | Design | Pending |
| WF3-25 | Promote `emit-result-schema` to prod (ajv) + MCP SDK to prod dep | Design | Pending |

**ID format:** `WF3-[NUMBER]`
**Status values:** Pending → In Design → In Tasks → Implementing → Verified
**Coverage:** 25 total, 0 mapped to tasks yet (Design pending), 0 unmapped.

---

## Success Criteria

How we know the feature is successful:

- [ ] `ctx.agent({ prompt, expect, cwd, permission })` returns validated
      `{ status, data?, question?, sessionId }` on a real subscription run.
- [ ] A `read` agent step provably cannot mutate the worktree; an unpermitted tool is
      auto-denied without stalling.
- [ ] The self-hosted MCP server enforces `emit_result` per-step by bearer token;
      unknown/revoked tokens rejected.
- [ ] The "review PR" example runs end-to-end via the smoke script → `done` with
      validated findings + a captured `session_id`.
- [ ] Gate green: typecheck 0 err, lint 0 err, full unit suite passes (new
      `emit-result-schema`/`agent-command-builder`/`run-state`-style pure tests +
      DI'd `mcp-result-server`/`agent-step-runner` behavior tests).
```
