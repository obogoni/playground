# WF4 — Blocker + Resume (native toasts) Specification

**Epic**: Workflows (issue #56 PRD), **milestone 4 of 5**.
**Depends on**: WF2 (engine, `ctx` facade, `WorkflowManager`, run-state reducer) and
WF3 (`ctx.agent`, `AgentStepRunner`, MCP result server) — both merged to `main`
(PR #64, PR #65).
**Feeds**: WF5 (Workflows UI — the view, run timeline, blocked-respond panel).

## Problem Statement

WF3 gave workflows a headless agent step that returns validated data — and made
`status:'blocked'` a **first-class returned value** while capturing the agent's
`session_id` — but nothing consumes them. A blocked agent step today just hands the
`blocked` envelope back to the author with no way to pause, ask the human, and resume.
The epic's "supervise by exception" goal (US 38: *pause for me only when the agent hits
a blocker*) is still missing. WF4 turns WF3's dormant seam into the human-in-the-loop
loop: the engine **pauses** a run on a blocker, **notifies** the developer with a native
toast, takes their **abort/guidance** response, and **resumes the same agent
conversation** via `--resume` — plus a standalone `ctx.ask()` primitive for author-driven
pauses.

## Goals

- [ ] **Engine-driven pause on blocked**: when `ctx.agent` resolves `status:'blocked'`,
      the engine pauses the run (`blocked` state), notifies, awaits a response, and — on
      guidance — resumes the **same** agent session via `--resume <sessionId>`, looping
      until the step resolves `done` (or the run is aborted/cancelled). The author writes
      **no** pause/resume code.
- [ ] Add `ctx.ask({ title, body })` — a standalone human-in-the-loop primitive that
      pauses the run and resolves to the developer's `{ action, guidance? }` decision.
- [ ] Add the `blocked` run status + `blocked`/`resumed` reducer transitions and the
      `workflows:respond` IPC channel + `workflow:blocked` event, mirroring the existing
      WF2 request/response-plus-stream pattern.
- [ ] Native OS toast on **block / finish / fail** (cancel stays silent), with
      click-to-focus-and-reveal the run.
- [ ] Fold in the three WF3 polish items carried into WF4 (field-level corrective-retry
      prompt, shared-server-reuse assertion, MCP bind-failure path).
- [ ] **Gate:** an "implement ticket" example workflow pauses on a blocker, notifies,
      takes guidance, resumes the same session, and completes — driven by a smoke script
      over CDP (mirrors WF2-20 / WF3-22).

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| Workflows **view**, run timeline UI, **blocked-respond panel**, trigger dialog | WF5 (US 28/30 UI). WF4 is verified by smoke script + hand-verified toast, per the project UI convention. WF4 wires the main-side signals (`workflow:blocked`, toast click → reveal) the WF5 panel will consume. |
| Durable / **resumable-across-app-restart** runs | Epic Out-of-Scope: runs are ephemeral (WF2). A blocked run is **lost on app quit**; the worktree persists as evidence. First intended v2 upgrade. |
| A **max blocker-round cap** or a **blocker/ask timeout** | v1 accepts unbounded block↔guidance rounds and an indefinite wait (the developer cancels to stop). A cap/timeout can be layered later. |
| **Per-step opt-out** of the engine auto-pause (author handling `blocked` manually) | Owner decision: `ctx.agent` auto-handles `blocked` in v1 (Assumptions). Manual handling is a future consideration. |
| Parallel runs / parallel agent steps | Epic Out-of-Scope: serial in v1 (WF2 guard reused; a blocked run stays active and holds the guard). |
| Codex / Copilot CLI adapters | Epic Out-of-Scope: Claude-only in v1. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Agent `blocked` handling | **Engine auto-pauses + resumes** inside `ctx.agent`; `ctx.ask` is the standalone primitive that path reuses | Owner decision. Author writes zero pause code (US 38 "supervise by exception"); `ctx.agent` resolves `done` after any number of guidance rounds, or the run cancels on abort. WF3's `done` happy path is untouched. | **y** |
| `abort` response outcome | **Run ends `cancelled`** (reuse the existing terminal status) | Owner decision. No new status; the agent path raises `CancellationError` on abort, folded to `cancelled` by the existing WF2 catch. | **y** |
| Lifecycle toast triggers | **block / finish / fail** fire a toast; **cancel is silent** | Owner decision (US 22). Cancel is user-initiated so needs no pull-back. `ctx.notify({toast})` (WF2-09) stays independent. | **y** |
| `ctx.ask` abort behavior | `ctx.ask` **returns** `{action:'abort'}` to the author as-is (does **not** itself throw) | The standalone primitive is composable — the author decides what abort means for their flow. Only the internal agent-block path raises cancellation on abort (that's where `abort → cancelled` lives). | n (assumption) |
| `workflows:respond` for a non-blocked / unknown / already-resumed run | **No-op** (ignored) | A late or duplicate respond must not resolve a step twice or crash; the pending response resolves **once**, mirroring the MCP per-token settle-once discipline (WF3). | n (assumption) |
| Empty `guidance` text on a `guidance` response | Passed to `--resume` **verbatim** (engine does not validate non-empty) | The WF5 respond panel enforces non-empty guidance; the engine stays a thin pass-through, consistent with WF2 not validating `ctx.input` values. | n (assumption) |
| Pause "wait" implementation | The blocked `ctx.*` primitive returns a **pending promise** the manager holds (`#pendingRespond`), resolved by `workflows:respond` | Mirrors WF3's MCP pending-promise pattern; the run's async frame simply suspends at `await` — the main process is not blocked and the serial `#activeRunId` guard stays held (the run **is** still active). | n (assumption) |
| Resume re-registration | Each guidance resume uses a **fresh per-step token + re-registered `expect`** on the shared MCP server | The prior token was revoked when the step resolved `blocked`; the same discipline as WF3's corrective retry (`#attempt` registers a fresh token each turn). | n (assumption) |
| Toast click → "open that run" | WF4 wires the **main side** (focus/show the window + emit a `workflow:focus-run` reveal event carrying `runId`); the actual run-detail navigation is **WF5** | The UI that consumes the reveal event is WF5; WF4 proves the signal path, hand-verified like the WF3 spawn seam. | n (assumption) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Engine pauses on a blocker and resumes the same agent conversation ⭐ MVP

**User Story**: As a developer, I want an agent step to report a blocker so the workflow
pauses and asks me, and I want my guidance to resume the *same* agent conversation so the
agent keeps all its context — without me writing any pause/resume plumbing.
*(US 21/25/38)*

**Why P1**: This is the milestone's headline — the "supervise by exception" loop the epic
promises. Without it WF3's `blocked` value and captured `session_id` do nothing.

**Acceptance Criteria**:

1. WHEN a `ctx.agent(...)` step resolves `status:'blocked'` with a non-empty `question`
   THEN the engine SHALL transition the run to `blocked`, emit a `workflow:blocked` event
   carrying the question, and **suspend** the step awaiting a response — it SHALL NOT
   resolve `ctx.agent` yet and SHALL NOT throw.
2. WHEN a blocked run receives a `guidance` response THEN the engine SHALL resume the
   **same** agent conversation via `--resume <sessionId>` with the guidance as the prompt
   (a fresh per-step token + re-registered `expect`), and continue the same step.
3. WHEN the resumed agent emits `status:'done'` with conforming data THEN `ctx.agent`
   SHALL resolve to `{ status:'done', data, sessionId }` — the author's single
   `await ctx.agent(...)` call returns the finished result with no pause/resume code.
4. WHEN the resumed agent emits `status:'blocked'` **again** THEN the engine SHALL pause
   again — block↔guidance rounds repeat unbounded, each round emitting `workflow:blocked`
   and awaiting a fresh response.
5. WHEN a blocked run receives an `abort` response THEN the agent step SHALL raise
   cancellation so the run ends `cancelled` — no further agent turn is spawned.

**Independent Test**: `agent-step-runner` (DI'd, fake spawner + fake `onBlocked`
resolver): blocked→guidance→done resolves `done` with the resumed session; the resume
attempt's argv carries `--resume <sessionId>` and the guidance prompt; blocked twice then
done loops twice; `onBlocked` returning `abort` raises `CancellationError`.

---

### P1: Blocked run-state + `workflows:respond` ⭐ MVP

**User Story**: As a developer, I want the run to have an explicit `blocked` state and a
way to respond with **abort** or **free-text guidance**, so I can unblock the agent
without re-explaining the whole task. *(US 24)*

**Why P1**: The pause loop needs a state machine and an inbound channel; this is the
engine plumbing under Story P1-above.

**Acceptance Criteria**:

1. WHEN the reducer folds a `blocked` event on a `running` run THEN the status SHALL
   become `blocked` (recording the question); a `resumed` event on a `blocked` run SHALL
   return it to `running`; a `cancelled` event on a `blocked` run SHALL end it
   `cancelled`. `blocked` is **non-terminal**; `done`/`failed`/`cancelled` stay terminal
   and ignore later events.
2. WHEN `workflows:respond({ runId, decision })` is called for the active blocked run
   THEN it SHALL resolve that run's single pending response with the decision
   (`{ action:'abort'|'guidance', guidance? }`), transitioning `blocked → running`.
3. WHEN `workflows:respond` targets a runId that is not the active run, or a run not
   currently `blocked`, or a pending response already resolved THEN it SHALL be a
   **no-op** (resolves nothing, throws nothing).
4. WHEN a run is `blocked` THEN a second `workflows:run` SHALL still be refused by the
   WF2 serial guard — the run remains active while blocked.

**Independent Test**: `run-state` (pure) drives running→blocked→running→done and
blocked→cancelled, asserting statuses and that events append in order; `workflow-manager`
(DI'd) asserts a `respond` resolves the pending promise and a stray `respond` is a no-op.

---

### P1: Cancel a blocked run ⭐ MVP

**User Story**: As a developer, I want to cancel a run *while it's blocked* (I've decided
it's not worth continuing), so it stops cleanly instead of waiting forever for a
response. *(US 31 extension)*

**Why P1**: A blocked run holds the serial guard indefinitely; cancel is the only escape
besides responding, so it must work from the `blocked` state.

**Acceptance Criteria**:

1. WHEN `cancel(runId)` is called while the run is `blocked` THEN the pending response
   SHALL reject with `CancellationError`, the run SHALL end `cancelled`, and the serial
   guard SHALL be released (a subsequent `workflows:run` succeeds).
2. WHEN a run is cancelled while blocked **on an agent step** THEN no further agent child
   SHALL be spawned (the resume never fires).

**Independent Test**: `workflow-manager` (DI'd): a run paused via a fake ctx that awaits
`requestInput`, then `cancel` → the awaited promise rejects `CancellationError`, run ends
`cancelled`, `#activeRunId` cleared.

---

### P1: `ctx.ask()` standalone human-in-the-loop primitive ⭐ MVP

**User Story**: As a developer, I want a `ctx.ask({ title, body })` primitive that pauses
my workflow and returns my decision, so I can build my own human checkpoints (not only
agent-driven blockers). *(US 21/24)*

**Why P1**: `ctx.ask` is the primitive the engine's agent-block path reuses; exposing it
to authors is one thin facade method over the same machinery.

**Acceptance Criteria**:

1. WHEN a workflow calls `ctx.ask({ title, body })` THEN the engine SHALL block the run
   (same `blocked` machinery: state, `workflow:blocked` event, toast) and resolve
   `ctx.ask` to the developer's decision `{ action:'abort'|'guidance', guidance? }`
   **as-is** — `ctx.ask` SHALL NOT itself throw on `abort` (the author decides what abort
   means for their flow).
2. WHEN `ctx.ask` is invoked THEN it SHALL be built through the WF2 `instrument` wrapper
   so a `step-started` (label `ask`) is auto-emitted and the cancellation token is
   checked (zero author effort), like every other `ctx.*` primitive.

**Independent Test**: `workflow-manager`/`workflow-ctx` wiring — a fake runtime records a
`step-started` `ask`; a `guidance` respond resolves `ctx.ask` to `{action:'guidance',
guidance}`; an `abort` respond resolves to `{action:'abort'}` without throwing.

---

### P1: Native lifecycle toasts on block / finish / fail ⭐ MVP

**User Story**: As a developer, I want a native OS toast when a run **blocks, finishes, or
fails**, so I can be doing something else and still get pulled back at the right moment.
*(US 22)*

**Why P1**: The pause is useless if I don't know it happened; the toast is how a
background run reaches me. The `notifier` reserved in `WorkflowManagerDeps` (WF2) is
finally wired.

**Acceptance Criteria**:

1. WHEN a run transitions to `blocked` THEN the manager SHALL fire the native toast
   (`notifier`) carrying the blocker question; WHEN a run ends `done` or `failed` THEN it
   SHALL fire a lifecycle toast; WHEN a run ends `cancelled` THEN it SHALL **not** fire a
   lifecycle toast.
2. WHEN a lifecycle toast fires THEN it SHALL be **distinct** from a `ctx.notify({toast})`
   author toast (WF2-09) — author toasts continue to fire independently of run lifecycle.

**Independent Test**: `workflow-manager` (DI'd, fake `notifier`): drive a run to blocked
(one toast, body = question), to done (toast), to failed (toast); a cancelled run fires
**no** lifecycle toast; a `ctx.notify({toast})` still calls the notifier.

---

### P2: Click a lifecycle toast to focus Playground and reveal the run

**User Story**: As a developer, I want clicking a workflow notification to focus Playground
and open that run, so I land directly on what needs me. *(US 23)*

**Why P2**: High-value polish, but the run-detail navigation it lands on is WF5; WF4
proves the main-side signal path only.

**Acceptance Criteria**:

1. WHEN the developer clicks a workflow lifecycle toast THEN Playground SHALL be
   shown/focused and a `workflow:focus-run` reveal event carrying the `runId` SHALL be
   emitted to the renderer (the run-detail navigation itself is WF5).

**Independent Test**: Hand-verified I/O boundary (like the WF3 spawn seam) — the
`index.ts` `notifier` click handler focuses the window and emits `workflow:focus-run`;
confirmed during the owner-run smoke.

---

### P1: "Implement ticket" example workflow + end-to-end smoke gate ⭐ MVP

**User Story**: As the developer, I want a working "implement ticket" example and a smoke
script that drives it through a real blocker → guidance → resume → done, so the whole
blocker/resume path is proven — this is the milestone's gate. *(US 38 / epic WF4 gate)*

**Why P1**: The gate defined in the PRD. It exercises a `write` agent step (WF3) that
blocks, the engine pause + toast (WF4), a `guidance` respond, and the `--resume` of the
same session to `done`.

**Acceptance Criteria**:

1. WHEN the example workflow runs THEN it SHALL create a worktree (WF2 `ctx.worktree`) and
   run a `write`/`bypass` `ctx.agent()` implementation step whose prompt is designed to
   provoke a `blocked` question; the author code contains **no** pause/resume logic.
2. WHEN the smoke script drives `workflows:run` for the example over CDP THEN it SHALL
   observe the run reach `blocked` with a `workflow:blocked` event, send a `guidance`
   `workflows:respond`, and observe the run resume the **same** `session_id` and reach
   `status:'done'` on the persisted run record.
3. WHEN the smoke gate runs THEN it SHALL confirm a lifecycle toast fired on block (and on
   finish) and that the `write`/`bypass` posture allowed the implementation edit.

**Independent Test**: `scripts/smoke-blocker-resume.mjs` (copies the
`smoke-agent-workflow.mjs` skeleton) — owner-run against a live subscription, à la
WF3-22.

---

### P2: WF3 polish carried into WF4

**User Story**: As the developer, I want the three WF3 gaps that touch the same
runner/`--resume`/MCP-server code closed here, so they don't need a throwaway PR.
*(SDD eval carry-in)*

**Why P2**: Cheap correctness/coverage improvements on code WF4 already edits; not
load-bearing for the gate but folded in per the WF3 eval hand-off.

**Acceptance Criteria**:

1. WHEN the corrective retry fires THEN its prompt SHALL carry the **field-level** ajv
   validation error the server reported for the last non-conforming payload (not the
   generic "no valid emit_result call was made"), and a runner test SHALL assert the
   retry argv/prompt contains that field-level error. *(WF3-04)*
2. WHEN two `run()` calls execute on the same `AgentStepRunner` THEN a test SHALL assert
   the shared MCP server's `start()` was called **exactly once** (server reused, not
   restarted). *(WF3-10)*
3. WHEN the shared MCP server fails to bind its loopback port THEN `start()` SHALL
   **reject** and the agent step SHALL fail with a clear error **without spawning** an
   agent; a runner/server test SHALL cover it. *(edge — currently `start()` never handles
   the listener `error` event)*

**Independent Test**: `agent-step-runner`/`mcp-result-server` unit tests as described in
each AC.

---

## Edge Cases

- WHEN `workflows:respond` arrives twice for the same block THEN only the first SHALL
  resolve the pending response; the second SHALL be a no-op (settle-once).
- WHEN the app quits while a run is `blocked` THEN the run is **lost** (ephemeral v1); the
  created worktree persists as inspectable evidence (accepted, PRD durable-runs = v2).
- WHEN a `guidance` resume causes the agent to emit `blocked` again THEN the engine SHALL
  pause again (unbounded rounds) — never auto-abort.
- WHEN `Notification.isSupported()` is false THEN a lifecycle toast SHALL be silently
  skipped (WF2-09 behavior), and the run SHALL proceed unchanged.
- WHEN a resumed agent turn ultimately fails to conform (after its own corrective retry)
  THEN the step SHALL fail with captured output and the run SHALL end `failed` (existing
  WF3 fail path, now reachable post-resume).
- WHEN `cancel` is called for a run that is **not** blocked THEN the existing WF2/WF3
  cancel behavior is unchanged (checkpoint token + child abort).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| WF4-01 | P1 Pause on blocker (suspend + emit + no throw) | Design | Pending |
| WF4-02 | P1 Resume same session via `--resume` on guidance | Design | Pending |
| WF4-03 | P1 `ctx.agent` resolves `done` after guidance (no author code) | Design | Pending |
| WF4-04 | P1 Repeated block↔guidance rounds (unbounded) | Design | Pending |
| WF4-05 | P1 Abort → run `cancelled`, no further turn | Design | Pending |
| WF4-06 | P1 Reducer: blocked/resumed/cancelled transitions | Design | Pending |
| WF4-07 | P1 `workflows:respond` resolves pending; stray = no-op | Design | Pending |
| WF4-08 | P1 Second `workflows:run` refused while blocked (serial guard) | Design | Pending |
| WF4-09 | P1 Cancel while blocked → reject pending, end `cancelled` | Design | Pending |
| WF4-10 | P1 Cancel-while-blocked-on-agent spawns no further child | Design | Pending |
| WF4-11 | P1 `ctx.ask` blocks + returns decision as-is (no throw on abort) | Design | Pending |
| WF4-12 | P1 `ctx.ask` via `instrument` (`step-started` `ask`) | Design | Pending |
| WF4-13 | P1 Toast on block (question) / done / failed; cancel silent | Design | Pending |
| WF4-14 | P1 Lifecycle toast distinct from `ctx.notify({toast})` | Design | Pending |
| WF4-15 | P2 Toast click → focus + `workflow:focus-run` reveal | Design | Pending |
| WF4-16 | P1 `implement-ticket` example (write/bypass, no pause code) | Design | Pending |
| WF4-17 | P1 Smoke: blocked → guidance → resume same session → done | Design | Pending |
| WF4-18 | P2 WF3-04 field-level corrective-retry prompt | Design | Pending |
| WF4-19 | P2 WF3-10 shared server started exactly once (asserted) | Design | Pending |
| WF4-20 | P2 MCP bind-failure → `start()` rejects, step fails, no spawn | Design | Pending |

**ID format:** `WF4-[NUMBER]`
**Status values:** Pending → In Design → In Tasks → Implementing → Verified
**Coverage:** 20 total, 0 mapped to tasks yet (Design pending), 0 unmapped.

---

## Success Criteria

How we know the feature is successful:

- [ ] A `ctx.agent` step that blocks pauses the run, fires a toast, and — on guidance —
      resumes the **same** `session_id` and completes `done`, with zero pause/resume code
      in the workflow author's file.
- [ ] Responding `abort` ends the run `cancelled`; cancelling a blocked run rejects the
      wait cleanly and releases the serial guard.
- [ ] `ctx.ask({title, body})` pauses and returns the developer's `{action, guidance?}`
      decision.
- [ ] Native toasts fire on block/finish/fail (not cancel); clicking one focuses
      Playground and emits the run-reveal signal.
- [ ] The "implement ticket" example runs end-to-end via the smoke script → blocked →
      guidance → resume → `done`.
- [ ] The three WF3 carry-in gaps are closed (field-level retry prompt, server-reuse
      assertion, MCP bind-failure path).
- [ ] Gate green: typecheck 0 err, lint 0 err, full unit suite passes (new `run-state`
      blocked/resumed transitions + `workflow-manager` pause/respond/toast + extended
      `agent-step-runner` block-loop tests).
</content>
</invoke>
