# Workflows UI — Hi-Fi Rebuild (WHF) Specification

Completes **WF5 (Workflows UI)** to the fidelity of its authoritative design handoff,
`design/handoff/DESIGN_HANDOFF_WORKFLOWS.md` (visual source of truth; the PRD #56 is the
source of truth for behavior). WF5's first pass shipped the correct behavior but a low-fidelity
timeline; this slice rebuilds the view to the handoff **and** enriches the merged backend event
surface (WF2/WF3) with the data the hifi timeline requires. Same branch `feature/workflows-ui`.

## Problem Statement

The delivered WF5 renders a flat timeline of text labels + log lines. The handoff specifies a
rich, node-based step timeline: a semantic **kind tag** per step, per-step **durations**, group
**rollup** rows, **step detail boxes** (ado results, changed files, failed shell output), an
**agent detail box** (prompt + permission pill + `emit_result` badge + rendered `data`), an
**INPUTS strip**, **RECENT RUNS** with relative time, a hifi **blocked-respond panel** and
**failed footer**, and hifi definition/run cards + dialog. Four of these need data the current
`workflow:*` stream does not carry: step **kind**, **durationMs**, the **agent envelope**
(prompt/permission/`emit_result.data`/status), and the **failure payload** (`error/stdout/code`)
— plus the run's **input**/**startedAt** for the header + INPUTS strip.

## Goals

- [ ] Enrich the backend event surface so the renderer receives, per run: input + startedAt +
      workflowId; per step: a semantic `kind`, a `durationMs` on completion, and (for agent
      steps) the prompt/permission/`emit_result` status+data; and on failure, the failing
      call + `error`/`stdout`/`code` — all covered by unit tests (pure reducer + emit paths).
- [ ] Rebuild the Workflows view to the handoff's hifi: node timeline with status glyphs +
      connectors, kind tags, durations, group rollups, step + agent detail boxes, INPUTS strip,
      hifi header/cards/RECENT-RUNS/respond-panel/failed-footer/dialog, and the pipeline glyph.
- [ ] **Gate:** the "implement ticket" and "review PR" examples run through the UI and the
      timeline renders at handoff fidelity (kind tags, durations, agent detail with emitted
      data, blocked panel, done/failed states), hand-verified.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Reading persisted/past runs across app restart (a `workflows:get` run-snapshot read channel) | Runs stay ephemeral/live-stream (PRD v1); enrichment rides the existing live events + one run-started event — no persisted-run fetch |
| `ctx.step` **rollup status** computed in the backend | The group's rollup status is derived in the renderer from its child steps' statuses (no backend group-status field) |
| A live agent **stdout tail** streamed token-by-token (handoff "running… + blink caret") | The headless agent's incremental stdout is not currently streamed per-token; the agent detail box shows prompt + a running state + final `data` on completion. A live tail is a follow-up |
| Re-run action (handoff "Re-run" for done/failed/cancelled) | Deferred — re-invokes `workflows:run` with the same input; nice-to-have, not in the two-example gate. Logged as an assumption |
| New color tokens / raster assets | Handoff: none — reuse the base palette + add the mapping classes only |
| Renderer component unit tests | Project convention: UI hand-verified. The **backend enrichment** (reducer, StepEvent shape, instrument timing/kind, manager emit, agent-detail plumbing) IS unit-tested |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| **AD-011 revisited** | The handoff supersedes AD-011's "failed shows only status" (now a **failed footer** with the failing call + `error/stdout/code`) and "live-stream minimal" (now the stream carries kind/duration/agent-detail/failure). Formalized as **AD-012**. | The AD-011 options were chosen without the handoff on the table; the handoff is the authoritative visual spec | y |
| Step `kind` source | A new semantic `stepKind` field on `step-started` events, set by `instrument()` per primitive (`worktree`/`sh`/`git`/`ado`/`notify`/`ask`/`agent`/`group`), NOT parsed from the label string in the renderer | The label is free text; a first-class kind is robust and matches the handoff's kind→tag mapping | y |
| Duration model | Each instrumented step gets a monotonic **stepId**; `instrument` emits `step-started {stepId,…}` before `fn` and `step-finished {stepId, durationMs}` after — the renderer correlates by stepId | The handoff shows both live steps and final durations; start+finish with an id is the minimal clean model. Clock lives in the manager (reducer stays clock-free) | y |
| Agent detail | The agent `step-started` carries `{prompt, permission}`; the `step-finished` carries the agent outcome `{status, data, sessionId}` (from `emit_result`) | These are known upfront (prompt/permission) vs on completion (data/status); avoids inventing a separate agent event | y |
| Failure broadcast | The terminal `failed` StepEvent is broadcast (its `error/stdout/code`); agent-step failures populate `stdout`/`code` from `AgentStepError.detail` so the footer has real evidence | The data exists but never reached the renderer; the handoff's failed footer needs it | y |
| `input`/`startedAt`/`workflowId` to renderer | A new `workflow:run-started` event carries `{runId, workflowId, input, startedAt}`; the renderer seeds the RunView from it (also replaces WF5's `pendingWf` runId hack) | The header sub-line + INPUTS strip + relative time need these; a run-started event is the clean carrier | y |
| Relative time ("started 4m ago") | Computed in the renderer from `startedAt`, refreshed on a light interval | Backend already stamps `startedAt`; no per-tick backend work | y |
| Re-run action | Deferred (Out of Scope) — done/failed/cancelled show no Re-run in this slice | Not in the two-example gate; keeps scope bounded | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### Story 1 — Backend: semantic step kind + duration · **P1 ⭐ MVP**

**User Story**: As the renderer, I need each step to carry a semantic `kind` and a completion
`durationMs`, so the timeline can show kind tags and durations (handoff §"Step kind → color",
§timeline "kind tag … duration").

**Acceptance Criteria** (unit-tested — reducer/instrument/manager):
1. WHEN an instrumented `ctx.*` primitive runs THEN its `step-started` event SHALL carry a
   `stepKind` ∈ {`worktree`,`sh`,`git`,`ado`,`notify`,`ask`,`agent`} and a monotonic `stepId`.
2. WHEN a `ctx.step(label, fn)` group runs THEN its group `step-started` SHALL carry
   `stepKind: 'group'` and a `stepId`.
3. WHEN an instrumented step's `fn` resolves (or throws) THEN a `step-finished` event SHALL be
   emitted carrying the same `stepId` and a non-negative `durationMs`.
4. WHEN the run-state reducer folds `step-started`/`step-finished` THEN it SHALL append them in
   order and remain clock-free (durationMs is stamped by the manager, not the reducer).
5. WHEN `#emit` handles `step-started`/`step-finished` THEN it SHALL broadcast them to the
   renderer (`workflow:step` carrying the full StepEvent, including `stepKind`/`stepId`/`durationMs`).

**Independent Test**: drive a fake ctx sequence; assert each primitive's `stepKind`, matching
`stepId` on start/finish, and a `durationMs ≥ 0` on finish.

---

### Story 2 — Backend: agent step detail · **P1 ⭐ MVP**

**User Story**: As the renderer, I need an agent step to expose its prompt, permission preset,
and validated `emit_result` status+data, so I can render the agent detail box (handoff §"Agent
step (detail box variant)").

**Acceptance Criteria** (unit-tested):
1. WHEN `ctx.agent({prompt, permission, …})` starts THEN its `step-started` SHALL carry an
   `agent: { prompt, permission }` detail (permission defaulting to `read`).
2. WHEN the agent step completes THEN its `step-finished` SHALL carry `agentResult: { status,
   data?, sessionId }` (the validated `emit_result` envelope).
3. WHEN the agent result is `blocked` THEN the emitted `workflow:blocked` question SHALL be
   accompanied by the `sessionId` so the respond panel can show the session note (handoff
   §respond panel "session `<session_id>`").
4. WHEN these fields are added THEN existing agent-step-runner tests SHALL still pass (envelope
   return unchanged for the author-facing `ctx.agent`).

**Independent Test**: a fake agent run asserts the `agent`/`agentResult` detail on the emitted
step events and the `sessionId` on the blocked event.

---

### Story 3 — Backend: failure payload + run-started broadcast · **P1 ⭐ MVP**

**User Story**: As the renderer, I need the failure evidence and the run's input/startedAt, so I
can render the failed footer and the header/INPUTS strip (handoff §"Failed-run footer",
§"Inputs strip", §header sub-line).

**Acceptance Criteria** (unit-tested):
1. WHEN a run starts THEN a `workflow:run-started` event SHALL fire carrying `{runId, workflowId,
   input, startedAt}`.
2. WHEN a run fails THEN the failure SHALL reach the renderer with `error` and (when present)
   `stdout`/`code` — i.e. the terminal `failed` StepEvent is broadcast (`workflow:step`), not
   only `workflow:status`.
3. WHEN an **agent step** fails THEN the broadcast failure SHALL include the agent's captured
   `stdout`/`code` (surfaced from `AgentStepError.detail`, not left undefined).

**Independent Test**: assert `workflow:run-started` payload; assert a failed run broadcasts
`error/stdout/code`; assert an agent failure carries its detail.

---

### Story 4 — Renderer: hifi node timeline · **P1 ⭐ MVP**

**User Story**: As a developer, I want the run timeline rendered as the handoff's node timeline,
so I can read the run at a glance.

**Acceptance Criteria** (hand-verified vs handoff §"The step timeline"):
1. WHEN a run is shown THEN each step SHALL render a **gutter node** (26px circle) with a
   glyph by status — done=check(green), failed/cancelled=✕, blocked=`!`(amber),
   running=pulsing blue dot + ring, pending=hollow ring — connected by a 2px vertical connector.
2. WHEN a step has a `stepKind` THEN a tinted **mono kind tag** SHALL precede its label
   (`sh`/`git`/`worktree`/`ado`/`notify`/`ask`/`agent · <id>`) per the kind→color mapping.
3. WHEN a step has a `durationMs` THEN a faint mono **duration** (`1.4s`/`52s`/`1m 12s`) SHALL
   render right-aligned on the step row.
4. WHEN steps belong to a `ctx.step` group THEN the group SHALL render a **bold label row** with
   a **rollup status pill** (derived from its children) and its child steps indented.

**Independent Test**: run "implement ticket"; the timeline shows nodes+glyphs, kind tags,
durations, and (if the workflow uses groups) grouped rows.

---

### Story 5 — Renderer: step + agent detail boxes · **P1 ⭐ MVP**

**User Story**: As a developer, I want step output and agent results rendered as detail boxes,
so I can see what each step produced (handoff §"Step detail box", §"Agent step").

**Acceptance Criteria** (hand-verified):
1. WHEN an `ado`/`worktree.changedFiles` step (or a failed `sh`) has output THEN a **detail box**
   SHALL render its mono lines, colored by leading glyph (`+`green/`~`amber/`-`,`✖`red/`⎿`,`└`faint).
2. WHEN an **agent** step is shown THEN its detail box SHALL lead with the agent tile + name +
   **permission pill** (read-only/write/bypass) + an **emit badge** (`emit_result · done`/`blocked`/`running…`),
   then the author **prompt** in italics.
3. WHEN an agent step is `done` THEN its validated `data` SHALL render as `• key  value` mono lines.
4. WHEN an agent step is `blocked` THEN the detail box SHALL show the amber "↳ reported a
   blocker — your input is needed below" line.

**Independent Test**: "implement ticket" agent step shows the prompt, `write` pill,
`emit_result` badge, and the emitted `{summary, filesChanged}` as key/value lines.

---

### Story 6 — Renderer: run detail header, INPUTS strip, blocked panel, failed footer · **P1 ⭐ MVP**

**User Story**: As a developer, I want the run header, inputs, respond panel, and failure state
at handoff fidelity, so the human-in-the-loop and diagnostics read well.

**Acceptance Criteria** (hand-verified):
1. WHEN a run is shown THEN the header SHALL render the workflow tile + name + `RUN-ID · started
   <relative time>` sub-line + a status pill (dot pulses when running) + Cancel (while
   running/blocked).
2. WHEN a run has inputs THEN an **INPUTS strip** SHALL render one `key = value` chip per input
   (empty → faint "no inputs").
3. WHEN a run is `blocked` THEN the hifi **respond panel** SHALL render (`?`-tile, question, the
   "resumes the same agent conversation (session `<id>`) via `--resume`" note, guidance textarea,
   **Abort run** + **Resume with guidance**).
4. WHEN a run is `failed` THEN a **failed footer** SHALL render the failing call + `error` (and
   `stdout`/exit `code` when present) + the no-rollback note.

**Independent Test**: block "implement ticket" → panel shows the session note; a failing shell
workflow → footer shows the call + exit code.

---

### Story 7 — Renderer: hifi rail (definitions + RECENT RUNS) + Workflows glyph · **P2**

**User Story**: As a developer, I want the rail and the Workflows segment at handoff fidelity.

**Acceptance Criteria** (hand-verified vs §D-a, §Top bar):
1. WHEN the rail is shown THEN the header SHALL show "WORKFLOWS" + "N defined" count + Reload +
   "+ New"; definition cards SHALL show the pipeline-glyph tile, name, description, "N input(s)",
   and a **play-triangle Run** button; broken cards SHALL show the red tile + "broken" pill + error.
2. WHEN there are runs THEN **RECENT RUNS** rows SHALL show a status dot (pulses if running) +
   name + status pill + a mono meta line (`<input summary> · <relative time>`), selected row with
   a left accent bar.
3. WHEN the Workflows segment renders THEN it SHALL use the **converging-nodes / pipeline glyph**
   (not `git-fork`).

**Independent Test**: rail shows a valid + a broken definition and the run history with relative times.

---

### Story 8 — Renderer: hifi Run-workflow dialog · **P2**

**User Story**: As a developer, I want the trigger dialog at handoff fidelity (§Dialog).

**Acceptance Criteria** (hand-verified):
1. WHEN the dialog opens THEN it SHALL show the workflow tile + name + description, one generated
   field per `meta.inputs` (mono input, red `*` on required, placeholder = key), and a
   **play-triangle Run workflow** button disabled until every required input is non-empty;
   no-inputs → the italic "just run it" note.

**Independent Test**: trigger a workflow with a required + optional input; Run enables only when
required is filled.

---

## Edge Cases

- WHEN a step is still running THEN its node SHALL pulse and no duration renders until `step-finished`.
- WHEN an agent step's `data` is absent (blocked before done) THEN the detail box SHALL omit the
  key/value block and show the blocked line.
- WHEN `stdout`/`code` are absent on a failure THEN the footer SHALL show just `error` + the call.
- WHEN a group has mixed child statuses THEN its rollup pill SHALL reflect the worst
  non-terminal-first precedence (failed > blocked > running > done > pending).
- WHEN relative time crosses a boundary THEN "started <when>" SHALL update within ~a minute.

---

## Requirement Traceability

| ID | Story | Layer | Phase | Status |
| -- | ----- | ----- | ----- | ------ |
| WHF-01 | S1 stepKind + stepId on start | backend (unit) | T1/T2 | Done (Verified) |
| WHF-02 | S1 step-finished + durationMs | backend (unit) | T1/T2 | Done (Verified) |
| WHF-03 | S1 reducer folds start/finish clock-free | backend (unit) | T1 | Done (Verified) |
| WHF-04 | S1 broadcast step-started/finished | backend (unit) | T3 | Done (Verified) |
| WHF-05 | S2 agent {prompt,permission} on start | backend (unit) | T2 | Done (Verified) |
| WHF-06 | S2 agentResult {status,data,sessionId} on finish | backend (unit) | T2 | Done (Verified) |
| WHF-07 | S2 sessionId on blocked event | backend (unit) | T1/T2/T3 | Done (Verified) |
| WHF-08 | S3 workflow:run-started {input,startedAt,workflowId} | backend (unit) | T1/T3/T6 | Done (Verified) |
| WHF-09 | S3 broadcast failed error/stdout/code | backend (unit) | T3 | Done (Verified) |
| WHF-10 | S3 agent failure detail surfaced | backend (unit) | T3 | Done (Verified) |
| WHF-11 | S4 node timeline + status glyphs + connectors | renderer | T4/T8 | Done (owner UI gate pending) |
| WHF-12 | S4 kind tags | renderer | T8 | Done (owner UI gate pending) |
| WHF-13 | S4 durations | renderer | T8 | Done (owner UI gate pending) |
| WHF-14 | S4 group rows + rollup pill | renderer | T4/T8/T11 | Done (owner UI gate pending) |
| WHF-15 | S5 step detail boxes (ado/changed/sh) | renderer | T4/T8 | Done (owner UI gate pending) |
| WHF-16 | S5 agent detail box (pill+badge+prompt+data) | renderer | T4/T8 | Done (owner UI gate pending) |
| WHF-17 | S6 header + relative time + status pill pulse | renderer | T5/T8 | Done (owner UI gate pending) |
| WHF-18 | S6 INPUTS strip | renderer | T8 | Done (owner UI gate pending) |
| WHF-19 | S6 hifi respond panel + session note | renderer | T8 | Done (owner UI gate pending) |
| WHF-20 | S6 failed footer | renderer | T8 | Done (owner UI gate pending) |
| WHF-21 | S7 hifi definition cards + rail header | renderer | T9 | Done (owner UI gate pending) |
| WHF-22 | S7 RECENT RUNS meta + relative time | renderer | T5/T9 | Done (owner UI gate pending) |
| WHF-23 | S7 pipeline glyph on the segment | renderer | T7/T9 | Done (owner UI gate pending) |
| WHF-24 | S8 hifi run-workflow dialog | renderer | T10 | Done (owner UI gate pending) |

**Coverage:** 24 total. **WHF-01..10 are backend, unit-tested** (10 ACs); WHF-11..24 are
renderer, hand-verified vs the handoff (14 ACs). The milestone gate is the two examples driven
through the UI at handoff fidelity.

## Success Criteria

- [ ] "implement ticket" through the UI shows: worktree.create step, an agent step with `write`
      pill + `emit_result` badge + prompt + emitted `{summary,filesChanged}` data, durations,
      the blocked panel with the session note, resume, and a `done` node.
- [ ] "review PR" through the UI shows: changedFiles step (+ detail), a `read-only` agent step
      with findings data, done.
- [ ] A deliberately-failing workflow shows the failed footer with the call + exit code.
- [ ] Backend enrichment unit tests pass (stepKind/duration/agent-detail/failure/run-started);
      full gate green; prod build OK.
</content>
