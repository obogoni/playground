# WF1 — Headless Agent Spike: Findings

**Date**: 2026-07-03
**Run by**: owner (empirical gate, WF1-D1)
**Harness**: `tsx scripts/wf1-spike/run.ts` (+ one direct probe for WF1-07)
**Installed CLI**: `claude` **2.1.199** (Claude Code), a **native `.exe`** at
`C:\Users\otavio\.local\bin\claude.exe` — NOT a `.cmd` shim.
**Result**: ✅ **All WF1 empirical gates GREEN.** The two highest-risk unknowns
(HTTP-MCP support, exact flags) are resolved. Both structured-output arms work
end-to-end on the subscription with the auth env scrubbed.

---

## Verbatim run output (iteration 2, exit 0)

```
MCP result server: http://127.0.0.1:60478/mcp

=== Arm N (native --json-schema) ===
session_id: ba5f7d13-548d-40a6-9a5e-0e5c90c1b5fd
payload: {"answer":42,"reasoning":"Multiplicação simples: 6 × 7 = 42."}
--- resume ---
resumed payload: {"answer":142,"reasoning":"A resposta anterior era 42 (6 × 7). Somando 100: 42 + 100 = 142."}

=== Arm M (self-hosted MCP emit_result) ===
session_id: a0f8269d-0f14-46d5-96eb-6a3a6e2cbec2
emit_result payload: {"answer":42,"reasoning":"6 × 7 = 42"}
--- resume ---
resumed payload: {"answer":142,"reasoning":"42 + 100 = 142"}
```

WF1-07 probe (direct call, `dontAsk`, would-prompt action):
```
result: "Não consegui criar o arquivo wf1probe.txt. Tanto o Write quanto o Bash
foram bloqueados porque a sessão está em don't ask mode…"   (exit 0, no file created)
```

---

## Pinned flags & leads — confirmed / refuted

| # | Lead (from design §Research findings) | Verdict | Evidence |
| - | -------------------------------------- | ------- | -------- |
| 1 | Headless print `--print` + prompt as positional | ✅ **Confirmed** | Both arms ran headless and returned a JSON envelope. **Caveat:** headless blocks ~3s waiting on stdin (`"no stdin data received in 3s"`) unless stdin is closed — spawn with `stdio: ['ignore','pipe','pipe']`. |
| 2 | JSON envelope carries **`session_id`** | ✅ **Confirmed** | `--output-format json` envelope had `session_id` (UUID, e.g. `ba5f7d13-…`) in both arms. Field name is exactly `session_id`. |
| 3 | Arm N: **`--json-schema`** → payload in **`structured_output`** | ✅ **Confirmed** | Native arm returned a schema-valid `{"answer":42,…}` in the envelope's `structured_output`; `validate()` accepted it. |
| 4 | Arm M: **HTTP MCP** (`type:http` + `Authorization: Bearer`) reaches a self-hosted tool | ✅ **Confirmed** (highest-risk unknown removed) | The agent called the loopback `emit_result` tool on `http://127.0.0.1:<port>/mcp`; the server observed the forced call and resolved with `{"answer":42,…}`. **HTTP MCP over loopback is supported by 2.1.199.** |
| 5 | Inline `--json-schema` / `--mcp-config` JSON survives the invocation | ⚠️ **Refuted via shell, Confirmed direct** | Under `shell:true` on Windows, cmd re-parses and corrupts the inline JSON → `--json-schema is not valid JSON: Unterminated string`. **Fix (applied):** the installed CLI is a native `.exe`, so spawn it directly with `shell:false` and the **argv array verbatim** — no shell, no re-quoting, JSON intact. A config file is NOT needed. |
| 6 | **`--permission-mode dontAsk`** stops an unattended run from hanging | ✅ **Confirmed** | Probe induced a `Write`/`Bash` action (not in `--allowedTools`); `dontAsk` **auto-denied** both, the agent reported it couldn't and **completed (exit 0)** — no interactive stall, no file created. All 4 main runs also completed unattended. |
| 7 | MCP tool allow-name **`mcp__<server>__<tool>`** accepted in headless (was *uncertain*) | ✅ **Confirmed** | `--allowedTools mcp__result__emit_result` let the forced tool call through; without it the call would have been denied. The `mcp__server__tool` naming works in headless. |
| 8 | **`--resume <session_id>`** continues the same conversation | ✅ **Confirmed** | Both arms: the follow-up ("add 100 to the previous answer") returned **142** and referenced "a resposta anterior era 42" — context only the first turn established. Real continuation, not a fresh chat. |
| 9 | **`--bare`** bypasses the OAuth/subscription token | ✅ **Refuted as usable** (per docs; not exercised) | Not used — the docs state `--bare` forces the API key and skips subscription auth, which defeats the headline goal. Left un-exercised on purpose; the refutation stands as a "do-not-use". |
| 10 | Auth-scrub + subscription success (WF1-01) | ✅ **Confirmed** | Child env built via `scrubAuthEnv` (drops `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`CLAUDE_CODE_USE_BEDROCK`/`CLAUDE_CODE_USE_VERTEX`); all runs still completed → **subscription auth proven** with the metered-API keys removed. |

---

## Requirement outcomes

| Req | Outcome |
| --- | ------- |
| WF1-01 | ✅ Headless run completes on the subscription with the auth-precedence set scrubbed. |
| WF1-02 | ✅ All flags pinned (table above); every PRD lead confirmed or refuted — none left an assumption. |
| WF1-03 | ✅ Self-hosted loopback HTTP MCP server received a forced, valid `emit_result`, routed+authorized by bearer token. |
| WF1-04 | ✅ Both arms produced a schema-valid payload against the declared `expect`. |
| WF1-05 | ✅ Non-empty `session_id` captured from the JSON envelope. |
| WF1-06 | ✅ `--resume` continued the same conversation (42→142, prior context used) — both arms. |
| WF1-07 | ✅ A would-prompt action (`Write`/`Bash`) was auto-denied under `dontAsk`; the run completed without hanging. |
| WF1-08 | ✅ Both mechanisms exercised; recommendation below. |

---

## Mechanism recommendation (Arm N vs Arm M) — input for WF3

Both mechanisms work on 2.1.199. The PRD's MCP choice is **not superseded** — this
is evidence WF3 decides on, per WF1-08.

| Dimension | Arm N — native `--json-schema` | Arm M — self-hosted MCP `emit_result` |
| --------- | ------------------------------- | -------------------------------------- |
| Moving parts | None: one flag, payload in `structured_output` | HTTP server + per-step token + `@modelcontextprotocol/sdk` dep |
| Validation | CLI-side (agent's own machinery) | Engine-side, at the tool boundary |
| `blocked` path | Not native — would need the full `{status,data,question}` schema in `--json-schema` and rely on the agent setting `status` | Natural: `emit_result({status:'blocked', question})` is a first-class terminal value (WF1-D5) |
| Routing / auth handle | None (the engine correlates by process) | The bearer token gives per-step routing + auth for free |
| Forward-compat with WF4 (blocked→resume-on-guidance) | Weaker (status is agent-asserted) | Stronger (the tool call IS the pause signal) |
| Robustness observed | Clean; payload always present at end | Clean; the forced call is a positive "finished" signal |

**Lean:** For the **`done`-only** path, **Arm N is markedly simpler** and removes a
dependency and a network surface. But WF3/WF4 need the **`blocked`** terminal value
and a per-step routing/auth handle, which **Arm M models more naturally**. Suggested
WF3 direction: **default to Arm M (MCP)** to keep the blocked path and routing
first-class (matching the PRD), and keep Arm N in reserve as a lighter fast-path for
steps that are strictly `done`-only. Decide in WF3 design.

---

## Practical notes for WF3 `agent-step-runner`

- **Spawn**: resolve the `claude` executable and spawn it **directly** (`shell:false`,
  argv array); **close stdin** (`stdio: ['ignore','pipe','pipe']`). Do NOT wrap in a
  shell — it corrupts inline JSON. (The `.cmd`-shim assumption in the spec/design was
  wrong for this install; the CLI is a native `.exe`.)
- **Permission posture**: `--permission-mode dontAsk` + `--allowedTools` listing
  `mcp__<server>__emit_result` (Arm M) is the unattended recipe that both allows the
  result tool and auto-denies everything else without hanging.
- **session_id** field name is `session_id`; `--resume <session_id>` re-invokes with
  the arm's mechanism flags preserved.
- **Two seams survive to WF3**: `scrub-auth-env.ts` and `emit-result-schema.ts`
  (both unit-tested here). The MCP server, argv builder, envelope parser, and the
  runner are spike wiring — WF3 re-implements them as DI'd/tested modules.
