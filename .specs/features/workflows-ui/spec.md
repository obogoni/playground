# Workflows UI (WF5) Specification

Milestone **WF5** of the Workflows epic (issue #56). The backend (WF1–WF4) is merged to
`main`: discovery, the runner, run-state, the `ctx` facade, the structured agent step, and
the blocker/resume path all exist and stream `workflow:*` IPC events. WF5 is the **renderer**
that lets a developer drive all of it — plus **one** small backend addition (a scaffold
channel). Per the project's UI convention the renderer is **hand-verified, no unit tests**;
only the scaffold module carries a unit test.

## Problem Statement

Today a developer can only trigger and observe a workflow run programmatically — there is no
UI. The engine emits a live event stream (`workflow:status/step/log/blocked/focus-run`) and
exposes `workflows:list/run/cancel/respond/reload`, but nothing in the renderer consumes any
of it (a grep for `workflow` across `src/renderer` returns zero matches). Without a view, the
two headline examples ("review PR", "implement ticket") cannot be run the way the PRD
intends: trigger from a form, watch a live timeline, get pulled back by a toast, and unblock
by exception.

## Goals

- [ ] A fourth **Workflows** direction (alongside tree/board/agents) lists workflow
      definitions — including broken ones with their error — and this session's runs.
- [ ] Triggering a workflow from a `meta.inputs`-generated form starts a run and streams a
      live step timeline + logs into a run-detail panel.
- [ ] A blocked run shows a respond panel (abort / guidance) that drives `workflows:respond`;
      guidance resumes the same agent; a toast click focuses the app onto that run.
- [ ] Cancel stops a running/blocked run; Reload rescans definitions; **New workflow**
      scaffolds a template folder and reveals it in the OS file manager.
- [ ] **Gate:** both examples ("review PR" + "implement ticket") run entirely through the UI,
      hand-verified end-to-end (trigger → live timeline → blocker respond → finish).

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| Reading persisted/past runs via IPC (run history across view-remount, prior sessions, or app restart) | Owner decision: **live-stream only**. The view accumulates run state from live `workflow:*` events in a session-lived hook. Matches the PRD's v1-ephemeral posture (US 40 caveat). A read channel (`workflows:runs`) is the first v2 upgrade. |
| Surfacing a failed run's `error` / `stdout` / `exit-code` in the UI | Owner decision: v1 shows only the `failed` **status**; the reason lives in the persisted on-disk log, inspected manually. Emitting failure detail to the renderer is deferred (the data is captured by the manager but not currently broadcast). |
| "Open in editor" on New workflow (launching a specific editor on the scaffolded file) | Owner decision: scaffold **reveals the folder** in the OS file manager instead — avoids coupling to a specific editor. Editor-launch is deferred. |
| Unit tests for renderer components (view, timeline, dialog, respond panel) | Project convention: all Playground UI is hand-verified against the milestone gate. Only the main-process `workflow-scaffold` module is unit-tested. |
| New workflow-manager surface for run detail beyond today's events | The existing `workflow:status/step/log/blocked/focus-run` stream is sufficient for the live timeline; no new manager events are added in WF5. |
| Parallel runs / a "run queue" UI | Engine is serial by design (WF2-17); the UI surfaces the serial-conflict error rather than queueing. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Run state source | Live `workflow:*` stream only; accumulated in a session-lived hook hoisted above the view so switching directions preserves in-flight + finished-this-session runs | Owner decision; matches v1-ephemeral; zero backend | y |
| Failed-run detail | Show only `failed` status in the UI; no reason surfaced | Owner decision; error/stdout/code not broadcast today; deferred | y |
| New workflow action | `workflows:scaffold` new channel creates the template folder, then the renderer reveals it via `shell.showItemInFolder` | Owner decision; avoids editor coupling | y |
| Reload mechanism | Renderer re-invokes `workflows:list` (discovery is on-demand; `reload()` is a documented no-op) | No cache exists to clear; re-listing rescans | y |
| Terminal events (`done`/`failed`/`cancelled`/`resumed`) reach the renderer only via `workflow:status`; only `step-started`→`workflow:step` and `step-logged`→`workflow:log` carry payload | The timeline is the ordered merge of `step`+`log` events; the run's overall state is driven by `status`; no per-terminal-event timeline row is required beyond the status badge | Matches the manager's `#emit` contract (`workflow-manager.ts:263-288`) — the renderer must not assume a `workflow:step` for terminal kinds | y |
| Direction registration | Extend the string union `direction` in `src/shared/config.ts:37` to include `'workflows'`, add a TopBar tab, add an `App.tsx` render branch | That is the established (non-registry) pattern for the three existing directions | y |
| A new workflow's scaffolded template exports valid `meta` + `run` | So it appears in the list as a valid (runnable) entry immediately after scaffold, not as broken | Lets the user run the stub or edit it; a broken stub would be confusing | y |
| Scaffold name → folder id | The user supplies a name; it is sanitized to a safe folder id (workflow **id = folder name**, per PRD); an existing folder id is rejected without overwrite | Prevents clobbering an authored workflow; matches loader's id semantics | y |
| Serial-run conflict | `workflows:run` while a run is active rejects with the manager's error; the UI disables **Run** while a run is active AND surfaces the error if it still occurs | The manager throws (`workflow-manager.ts:122-127`); the UI must not silently swallow it | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### Story 1 — Workflows direction + definition list · **P1 ⭐ MVP**

**User Story**: As a developer, I want a Workflows view that lists my workflow definitions
(including broken ones with their error), so that I can see what I can run without leaving the
app. *(PRD US 7)*

**Why P1**: The view is the entry point for every other WF5 story; the gate cannot run
without it.

**Acceptance Criteria**:

1. WHEN the app renders and the direction is `workflows` THEN the system SHALL show a
   Workflows view reachable from a fourth TopBar tab (after Tree / Board / Agents), the tab
   driven by the `direction` union extended with `'workflows'`.
2. WHEN the Workflows view mounts or the direction switches to it THEN the system SHALL invoke
   `workflows:list` and render every returned `WorkflowDef`: a valid entry (`{id, meta}`)
   shows `meta.name` and `meta.description`; a broken entry (`{id, error}`) shows the id and
   its `error` string and is **not runnable**.
3. WHEN one workflow folder is broken and others are valid THEN the system SHALL list the
   valid ones normally alongside the broken one (one bad file never hides the rest).
4. WHEN the direction is switched away from and back to `workflows` THEN the system SHALL
   preserve this session's accumulated run state (runs are held in a session-lived hook above
   the view, not reset on unmount).

**Independent Test**: With a fixtures folder holding one valid and one broken `workflow.ts`,
open the Workflows tab and confirm both appear, the valid one runnable and the broken one
showing its error.

---

### Story 2 — Trigger a run from a generated form · **P1 ⭐ MVP**

**User Story**: As a developer, I want to trigger a workflow from a dialog whose form is
generated from `meta.inputs`, so that I can supply parameters (branch, ticket id) at run
time. *(PRD US 9)*

**Why P1**: Without triggering, nothing streams; this is part of the gate.

**Acceptance Criteria**:

1. WHEN the user chooses to run a valid workflow THEN the system SHALL open a trigger dialog
   (following the existing dialog chassis: backdrop / panel / header / body / footer, busy +
   error states) with one field per `meta.inputs` entry, labelled by `input.label`.
2. WHEN a `meta.inputs` entry has `required: true` and its field is empty THEN the system
   SHALL disable the submit action (no run starts).
3. WHEN the dialog is submitted with valid input THEN the system SHALL invoke
   `workflows:run` with `{ id, input }` (the collected key→value map) and close the dialog,
   showing the new `runId`'s run detail.
4. WHEN a workflow declares no inputs THEN the system SHALL allow triggering it directly (an
   empty-form dialog or a direct Run, submitting `input: {}`).

**Independent Test**: Trigger a workflow whose `meta.inputs` has a required `branch` and an
optional `note`; confirm the form renders both, blocks submit until `branch` is filled, and
`workflows:run` receives the entered values.

---

### Story 3 — Live step timeline + logs · **P1 ⭐ MVP**

**User Story**: As a developer, I want a live step timeline and streaming logs for a running
workflow, so that I can see what it's doing without reading raw logs. *(PRD US 28/29/30)*

**Why P1**: The gate is "watch both examples run through the UI."

**Acceptance Criteria**:

1. WHEN a run is active THEN the system SHALL subscribe to `workflow:step`, `workflow:log`,
   and `workflow:status` filtered by the run's `runId`, and tear the subscriptions down on
   unmount (mirroring the `session:*` subscription pattern in `use-sessions.ts` /
   `TerminalPane.tsx`).
2. WHEN a `workflow:step` event arrives (a `step-started` `StepEvent`) THEN the system SHALL
   append a timeline row showing its `label`, nested under its `group` when present.
3. WHEN a `workflow:log` event arrives THEN the system SHALL append its `message` to the
   timeline under the same `group` grouping.
4. WHEN a `workflow:status` event arrives THEN the system SHALL update the run's status badge
   to the new `RunStatus` (`pending`/`running`/`blocked`/`done`/`failed`/`cancelled`).
5. WHEN a run reaches `failed` THEN the system SHALL show the `failed` status badge **without**
   a failure reason (v1 scope — reason not broadcast).

**Independent Test**: Run a workflow that emits `ctx.step("A", …)` with nested `ctx.log`
calls; confirm the timeline shows the labelled step with its logs nested, and the badge tracks
running → done.

---

### Story 4 — Blocker respond panel + toast focus · **P1 ⭐ MVP**

**User Story**: As a developer, I want a blocked run to show an abort/guidance panel and want
a notification click to land me on that run, so that I supervise by exception. *(PRD US 23/24/25)*

**Why P1**: The "implement ticket" example's gate is pausing on a blocker and resuming; this
is the human-in-the-loop surface.

**Acceptance Criteria**:

1. WHEN a `workflow:blocked` event arrives for a run THEN the system SHALL show a
   respond panel in that run's detail displaying the `BlockerQuestion` `title` and `body`.
2. WHEN the user chooses **Abort** in the respond panel THEN the system SHALL invoke
   `workflows:respond` with `{ runId, decision: { action: 'abort' } }`.
3. WHEN the user enters guidance text and submits THEN the system SHALL invoke
   `workflows:respond` with `{ runId, decision: { action: 'guidance', guidance } }` and hide
   the respond panel (the run resumes; status returns to `running` via `workflow:status`).
4. WHEN a `workflow:focus-run` event arrives (fired by a lifecycle-toast click) THEN the
   system SHALL switch the direction to `workflows` and select/open that `runId`'s detail.

**Independent Test**: Run the "implement ticket" fixture; when it blocks, confirm the panel
shows the question, that a toast click focuses the app onto the run, that Abort ends it
`cancelled`, and that guidance resumes the same session to completion.

---

### Story 5 — Cancel a running run · **P1 ⭐ MVP**

**User Story**: As a developer, I want to cancel a running or blocked workflow, so that I can
stop work that's no longer needed. *(PRD US 31)*

**Why P1**: Part of basic run control; a blocked run must be abortable/cancellable.

**Acceptance Criteria**:

1. WHEN a run is `running` or `blocked` THEN the system SHALL show a **Cancel** control in its
   detail.
2. WHEN Cancel is invoked THEN the system SHALL call `workflows:cancel` with `{ runId }`; the
   run's badge SHALL become `cancelled` (via `workflow:status`); no failure toast is expected
   (cancel is silent by design).
3. WHEN no run is active THEN the system SHALL not show a Cancel control.

**Independent Test**: Start a long-running workflow, click Cancel, confirm the badge goes to
`cancelled` and the engine's serial slot frees (a new run can start).

---

### Story 6 — Serial-run conflict is surfaced · **P2**

**User Story**: As a developer, I want the UI to refuse (or clearly report) a second run while
one is active, so that I don't trip the engine's serial guard silently. *(PRD US 39; engine
WF2-17.)*

**Why P2**: Correctness/robustness of the trigger path, but the gate can be met with a single
run at a time.

**Acceptance Criteria**:

1. WHEN a run is active THEN the system SHALL disable the **Run** affordance (or the trigger
   dialog's submit) for starting another run.
2. WHEN `workflows:run` rejects with the manager's serial-conflict error THEN the system SHALL
   surface that error message to the user (not swallow it).

**Independent Test**: With a run active, attempt to start another; confirm Run is disabled, and
if forced, the serial-conflict error text is shown.

---

### Story 7 — Reload definitions · **P2**

**User Story**: As a developer, I want a manual Reload that rescans the workflows folder, so
that I can pick up edits without restarting. *(PRD US 8)*

**Why P2**: Authoring convenience; not required for the run gate.

**Acceptance Criteria**:

1. WHEN the user clicks **Reload** THEN the system SHALL re-invoke `workflows:list` and
   re-render the definition list (a newly-added folder appears; a removed one disappears; a
   fixed file flips from broken to valid).

**Independent Test**: With the view open, add a workflow folder on disk, click Reload, confirm
it appears.

---

### Story 8 — New workflow scaffold + reveal · **P2**

**User Story**: As a developer, I want a "New workflow" button that scaffolds a template
folder and reveals it, so that I can start authoring with minimal friction. *(PRD US 6)*

**Why P2**: Authoring convenience; the gate runs pre-authored examples.

**Acceptance Criteria**:

1. WHEN the user clicks **New workflow** and supplies a name THEN the system SHALL invoke
   `workflows:scaffold` with that name.
2. WHEN `workflows:scaffold` runs with a name that sanitizes to a folder id **not** already
   present under the workflows root THEN the backend SHALL create `<root>/<id>/workflow.ts`
   from a template that exports a valid `meta` (with the id as `name`) and an async `run`,
   and SHALL return the created folder path.
3. WHEN the supplied name sanitizes to an **existing** folder id THEN the backend SHALL reject
   with an error and SHALL NOT overwrite the existing folder.
4. WHEN scaffold succeeds THEN the renderer SHALL refresh the definition list (the new valid
   workflow appears) and SHALL reveal the created folder via `shell.showItemInFolder`.

**Independent Test (backend, unit)**: Call the scaffold module against a temp root with a fresh
name → asserts `workflow.ts` exists and the loader parses it to `{ meta, run }`; call again
with the same name → asserts a rejection and the original file is untouched.

---

## Edge Cases

- WHEN `workflows:list` returns an empty array THEN the view SHALL show an empty-state (no
  crash), with New workflow / Reload still available.
- WHEN a broken workflow is selected THEN the Run affordance SHALL be disabled and only its
  error shown.
- WHEN a `workflow:*` event arrives for a `runId` the view has never seen (e.g. a run started
  before the view mounted, or a `focus-run` for a run purged from session memory) THEN the
  view SHALL handle it gracefully (create-or-ignore) without throwing.
- WHEN guidance text is empty in the respond panel THEN the submit SHALL be disabled (Abort
  remains available).
- WHEN a scaffold name sanitizes to an empty/invalid id THEN the system SHALL reject with a
  clear message and create nothing.
- WHEN the same `workflow:status` value is received twice THEN the badge SHALL remain stable
  (idempotent update).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| WF5-01 | P1 direction + tab | Design | Pending |
| WF5-02 | P1 list valid + broken | Design | Pending |
| WF5-03 | P1 broken never hides others | Design | Pending |
| WF5-04 | P1 session-lived run state across view switch | Design | Pending |
| WF5-05 | P2 trigger dialog from `meta.inputs` | Design | Pending |
| WF5-06 | P2 required-input gates submit | Design | Pending |
| WF5-07 | P2 submit → `workflows:run` | Design | Pending |
| WF5-08 | P2 no-inputs → direct run | Design | Pending |
| WF5-09 | P3 subscribe/teardown `workflow:*` by runId | Design | Pending |
| WF5-10 | P3 `workflow:step` → labelled timeline row | Design | Pending |
| WF5-11 | P3 `workflow:log` → grouped log line | Design | Pending |
| WF5-12 | P3 `workflow:status` → status badge | Design | Pending |
| WF5-13 | P3 `failed` badge without reason | Design | Pending |
| WF5-14 | P4 `workflow:blocked` → respond panel | Design | Pending |
| WF5-15 | P4 Abort → respond `{action:'abort'}` | Design | Pending |
| WF5-16 | P4 guidance → respond `{action:'guidance'}` | Design | Pending |
| WF5-17 | P4 `workflow:focus-run` → focus + open run | Design | Pending |
| WF5-18 | P5 Cancel → `workflows:cancel` → `cancelled` | Design | Pending |
| WF5-19 | P6 Run disabled while active | Design | Pending |
| WF5-20 | P6 serial-conflict error surfaced | Design | Pending |
| WF5-21 | P7 Reload re-invokes `workflows:list` | Design | Pending |
| WF5-22 | P8 New workflow → `workflows:scaffold` | Design | Pending |
| WF5-23 | P8 scaffold creates valid template folder, returns path | Tasks | Pending |
| WF5-24 | P8 scaffold rejects existing id, no overwrite | Tasks | Pending |
| WF5-25 | P8 success → list refresh + reveal folder | Design | Pending |

**ID format:** `WF5-[NUMBER]`.

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 25 total. WF5-23/WF5-24 are the **unit-tested** backend scaffold module; the
remaining 23 are **hand-verified** renderer/IPC-wiring criteria per the project's UI
convention, exercised by the milestone gate.

---

## Success Criteria

How we know the feature is successful:

- [ ] The **"review PR"** example runs entirely through the UI: trigger → live timeline of
      worktree/fetch/diff/agent steps → agent findings shown → completes `done`.
- [ ] The **"implement ticket"** example runs entirely through the UI: trigger → pauses on a
      blocker → toast → click focuses the run → guidance resumes the same session → completes.
- [ ] A broken workflow appears in the list with its error and cannot be run; the valid ones
      remain runnable.
- [ ] Cancel stops an active run (badge → `cancelled`) and frees the serial slot.
- [ ] New workflow scaffolds a valid template folder and reveals it; the scaffold module's
      unit test passes (creates on fresh name, rejects on existing).
- [ ] Reload picks up a folder added on disk without an app restart.
</content>
</invoke>
