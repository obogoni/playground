# Feature: WF2 — Workflows Engine + Deterministic Primitives

**Milestone:** WF2 — second milestone of Workflows (issue #56). Builds the
deterministic orchestration core that WF3 (agent step) and WF4 (blocker/resume)
extend, and WF5 (UI) drives.
**Size:** Large (multi-component: loader, runner, pure reducer, `ctx` facade,
ephemeral persistence, IPC surface, + a net-new ADO gateway surface).
**Sources of truth:** Issue #56 PRD (§Solution; §Implementation Decisions —
*Authoring & discovery*, *workflow-loader*, *Execution model*, *workflow-runner*,
*run-state*, *the `ctx` facade*, *IPC & types*, *Concurrency*; §Milestones — WF2;
§Testing Decisions), **AD-006** (WF1-first; ADO child-task fetch is in v1 → WF2),
**AD-007** (spawn the agent directly — informs `ctx.sh`'s shell handling), and the
owner decisions of 2026-07-03 recorded below (native toast; WF2-subset run-state;
smoke-script IPC gate).
**Grounding:** the existing surfaces this milestone reuses/mirrors are mapped with
`file:line` in the WF2 design (worktree-manager, ado-gateway, ipc-contract,
config-store, session-manager DI, spawn-plan tests). WF1's two surviving pure
seams (`scrub-auth-env`, `emit-result-schema`) are **not** used by WF2 — they feed
WF3.

## Problem Statement

Playground has the building blocks (worktrees, ADO tasks, embedded agent sessions)
but no way to wire them into an automated, repeatable sequence. WF2 delivers the
**engine**: it loads a user-authored `workflow.ts`, runs its `run(ctx)` in the main
process, exposes a typed `ctx` facade over the existing deterministic capabilities
(worktree / git / shell / ADO / notify / timeline), tracks run state through a pure
reducer, persists ephemeral run logs, and exposes an IPC surface so a run can be
triggered and observed. No AI agent step yet (that is WF3); no UI yet (that is WF5).

## Goals

- [ ] A user-authored `workflow.ts` under `~/.playground/workflows/<name>/` loads
      (esbuild bundle mode) and runs `run(ctx)` in the main process, with real
      control flow available to the author.
- [ ] The deterministic `ctx` primitives work end-to-end: `worktree.*`, `git`,
      `sh`, `ado.getTask` (incl. child tasks), `notify` (native toast), `log`/`step`,
      `input`.
- [ ] A pure `run-state` reducer drives status transitions
      (`pending→running→done|failed|cancelled`) from an ordered event stream that is
      persisted as an ephemeral per-run log and streamed over IPC.
- [ ] **Gate:** a workflow that creates a worktree, runs `git fetch`, and notifies
      completes end-to-end, exercised via a smoke script over `workflows:run`.

## Decisions (this milestone)

- **WF2-D1 — Native OS toast.** `ctx.notify({ toast })` fires a main-process
  `electron.Notification` (net-new; no native toast exists today). It needs no
  renderer/view, so it works before WF5, and is forward-compatible with the
  block/finish/fail toasts (US 22). *(Owner, 2026-07-03.)*
- **WF2-D2 — run-state is the WF2 subset only.** Status set
  `pending | running | done | failed | cancelled`; events `step-started`,
  `step-logged`, `failed`, `cancelled`, `done`. The `blocked`/`resumed`/
  `agent-emitted` transitions are added by WF3/WF4 that actually drive them — no
  speculative unreachable transitions now. *(Owner, 2026-07-03.)*
- **WF2-D3 — Gate via smoke script over IPC.** WF2 ships the `workflows:*` IPC
  surface; the end-to-end gate is a `scripts/smoke-workflow.mjs` (mirrors the
  existing `smoke-*.mjs`) that invokes `workflows:run`. The Workflows view, run
  timeline, and trigger dialog are WF5. *(Owner, 2026-07-03.)*
- **WF2-D4 — Loader uses esbuild bundle mode; esbuild becomes a direct dep.**
  `workflow-loader` transpiles+bundles `workflow.ts` so relative helper/prompt
  imports resolve into one module before `import()`. `esbuild` is transitive today;
  since the loader needs it at runtime it is promoted to a **direct dependency**.
- **WF2-D5 — Fail-fast, no engine rollback.** A step that throws halts the run
  (the author may `try/catch` to continue); created worktrees/branches are left in
  place as inspectable evidence. Cleanup is the author's job via `try/finally`.
- **WF2-D6 — `ctx.sh` hosts the command in a shell.** Unlike the agent spawn
  (AD-007: no shell), `ctx.sh` runs an author-written **command string**, which
  legitimately needs a shell to interpret it — so it is spawned with a shell and its
  stdout/stderr/exit code captured. Throws on non-zero exit unless `allowFail`.

## Requirements

### Discovery & loading

**WF2-01 — Discover workflows from the home dotfolder.**
WHEN the app boots or `workflows:reload` is invoked THEN the engine SHALL scan
`~/.playground/workflows/` and list one workflow **per subfolder** (workflow **id =
folder name**). WHEN the folder does not exist or is empty THEN the list SHALL be
**empty** (not an error). (US 2, 3, 8)

**WF2-02 — Load & validate `workflow.ts`.**
WHEN a workflow folder is loaded THEN `workflow-loader` SHALL transpile
`<folder>/workflow.ts` with **esbuild in bundle mode** (relative imports of helper
modules and prompt files within the folder resolve into one output), `import()` it,
and return `{ meta, run }` when both a well-formed `meta` object and an async `run`
function are exported. (US 4, 5)

**WF2-03 — Broken workflows are listed, not fatal.**
WHEN `workflow.ts` fails to transpile OR is missing the `meta` or `run` export THEN
the loader SHALL return `{ error: <message> }` and the workflow SHALL appear in the
list **as broken with its error message**, WITHOUT preventing the other workflows
from loading. (US 7)

**WF2-04 — `meta` shape drives the list and inputs.**
The exported `meta` SHALL be `{ name, description?, inputs: [{ key, label, required? }] }`.
WHEN `workflows:list` is invoked THEN it SHALL return every discovered definition —
valid (`{ id, meta }`) and broken (`{ id, error }`). (US 4, 9-partial)

### Deterministic `ctx` primitives

**WF2-05 — `ctx.worktree.*` delegates to the worktree manager.**
`ctx.worktree.create(...)`, `ctx.worktree.remove(...)`, and
`ctx.worktree.changedFiles(path)` SHALL delegate to the existing worktree-manager
functions and return their results. (US 10, 14)

**WF2-06 — `ctx.sh` runs a shell command and gates on exit code.**
WHEN `ctx.sh(cmd, { cwd })` runs and the command exits **non-zero** THEN it SHALL
**throw** (halting the run by default), with stdout/stderr/exit captured on the
error. WHEN `ctx.sh(cmd, { cwd, allowFail: true })` is used THEN it SHALL **not
throw** and SHALL return `{ code, stdout, stderr }` instead. WHEN the command exits
zero THEN it SHALL return `{ code: 0, stdout, stderr }`. (US 11, 12, 13)

**WF2-07 — `ctx.git.fetch` delegates to git.**
WHEN `ctx.git.fetch({ cwd, remote?, branch? })` runs THEN it SHALL perform a
`git fetch` in `cwd` via the same no-shell `execFile('git', …)` mechanism the
worktree manager uses, and fail the step on a git error. (US 11) *(WF2 exposes a
minimal `ctx.git` — fetch — sufficient for the gate; the surface grows in later
milestones as needed.)*

**WF2-08 — `ctx.ado.getTask` fetches a task and its child tasks.**
WHEN `ctx.ado.getTask(ref)` runs THEN it SHALL fetch the work item **and its
immediate child tasks** by adding **`$expand=Relations`** to the ADO gateway request
(a net-new gateway surface — today's `getWorkItems` is fields-only), extract the
`System.LinkTypes.Hierarchy-Forward` child ids, batch-fetch those children, and
return `{ task, children }`. WHEN ADO auth fails THEN `ctx.ado.getTask` SHALL
**throw** (so fail-fast halts the run visibly). (US 15, AD-006)

**WF2-09 — `ctx.notify` writes a timeline line and (optionally) a native toast.**
WHEN `ctx.notify(msg)` runs THEN it SHALL emit a timeline log line. WHEN
`ctx.notify(msg, { toast: true })` runs THEN it SHALL ALSO fire a main-process native
`electron.Notification`. (US 22-partial; WF2-D1)

**WF2-10 — Timeline: auto-log every `ctx.*`, optional `ctx.step` grouping.**
WHEN any `ctx.*` call executes THEN the engine SHALL auto-emit a **step event** to
the run's event stream (no author effort). `ctx.log(msg)` SHALL emit a log line;
`ctx.step(label, fn)` SHALL wrap `fn` in a labeled group whose child events nest
under `label`. (US 28, 29, 30)

**WF2-11 — `ctx.input` exposes the trigger values.**
WHEN a run is started with input values (the `workflows:run` payload) THEN
`ctx.input` SHALL expose them to `run(ctx)`. (US 9-partial)

### Runner, run-state & lifecycle

**WF2-12 — Pure `run-state` reducer.**
`run-state` SHALL be a pure `(state, event) → state` reducer over the WF2 event set
(`step-started`, `step-logged`, `failed`, `cancelled`, `done`) producing a status in
`{ pending, running, done, failed, cancelled }`. WHEN an invalid transition is
requested THEN the reducer SHALL keep the state unchanged (guarded transitions).
(US 28, 36; WF2-D2)

**WF2-13 — `workflow-runner` executes `run(ctx)` fail-fast, main process, no rollback.**
WHEN a run starts THEN the runner SHALL execute the loaded `run(ctx)` **in the
Electron main process**. WHEN a step throws (and the author does not catch it) THEN
the run SHALL halt with status `failed` and SHALL NOT roll back side effects
(created worktrees/branches stay in place). (US 34, 35, 42; WF2-D5)

**WF2-14 — Cooperative cancellation.**
WHEN `workflows:cancel(runId)` is invoked THEN the runner SHALL set a cancellation
token that is checked at **every `ctx.*` call**; the run SHALL stop at the next such
checkpoint and transition to `cancelled`. *(Accepted limitation: a purely synchronous
author loop between `ctx.*` calls cannot be interrupted in v1 — main-process, no
`utilityProcess`.)* (US 31)

**WF2-15 — Capture failure evidence.**
WHEN a run fails THEN its **error message, stdout, and exit code** (where applicable,
e.g. from a failed `ctx.sh`) SHALL be captured into the run record. (US 36)

**WF2-16 — Ephemeral per-run log persistence.**
WHEN a run progresses THEN the engine SHALL persist its record + event stream as an
**ephemeral file per run** under `%APPDATA%/playground/workflow-runs/`, using the
same atomic-write discipline as `ConfigStore`. Running state is **not** required to
survive an app restart. (US 40)

**WF2-17 — Serial runs.**
Runs SHALL execute **serially** — at most one run active at a time (respects personal-
plan rate limits once agents arrive). (US 39)

### IPC, events & shared types

**WF2-18 — `workflows:*` IPC surface mirrors `session:*`.**
The engine SHALL expose request/response channels `workflows:list`, `workflows:run`,
`workflows:cancel`, `workflows:reload`, and streaming events `workflow:status`,
`workflow:step`, `workflow:log` — registered and consumed exactly as the existing
`session:*` request/response-plus-stream pattern (contract in
`src/shared/ipc-contract.ts`, `handle`/`emit` in main, `api.invoke`/`api.on` in the
renderer). (US 42; engine)

**WF2-19 — New shared types.**
A new `src/shared/workflows.ts` SHALL define the WF2 subset: `WorkflowMeta`,
`WorkflowInput`, `WorkflowDef` (valid|broken list item), `RunStatus`, `WorkflowRun`,
`StepEvent`. (Agent/blocked types are added in WF3/WF4.)

### Gate

**WF2-20 — End-to-end gate.**
WHEN `scripts/smoke-workflow.mjs` invokes `workflows:run` for a workflow that
**creates a worktree, runs `git fetch`, and calls `ctx.notify`** THEN the run SHALL
complete with status `done`, its events SHALL stream over `workflow:step`/`log`, and
its ephemeral run log SHALL be written. (WF2 milestone gate; WF2-D3)

## Out of scope

Deferred to later Workflows milestones; NOT part of WF2.

| Item | Where it belongs |
| --- | --- |
| `ctx.agent()`, the MCP result server, agent-command-builder, emit-result-schema, agent-step-runner, `session_id` capture, permission presets, `ANTHROPIC_API_KEY` scrub in the runner | WF3 |
| `ctx.ask()`, `blocked`/`resumed` states + events, `workflows:respond`, `workflow:blocked`, resume via `--resume`, blocked notifications, click-notification-opens-run | WF4 |
| The **Workflows view**, run timeline UI, live-log panel, **"New workflow" scaffold button** (US 6), the **run-trigger dialog** generated from `meta.inputs` (US 9), blocked-respond panel | WF5 |
| `fs.watch` hot-reload; scan-on-view-open (needs the view) | WF5 (view-open scan) / v2 (`fs.watch`) |
| Durable/resumable runs across app restart; run-log TTL/cleanup | v2 |
| `utilityProcess` isolation; module sandbox for npm imports; parallel runs; run **queue** (a 2nd concurrent trigger is refused, not queued — see Assumptions) | v2 |
| Per-step **timeouts** (agent-focused) | WF3 |
| Codex/Copilot adapters | out of scope for all of v1 |

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Workflows dir location | `os.homedir()/.playground/workflows/<name>/` (net-new reader; no home reader exists today) | PRD §Authoring; sits with `.claude`/`.copilot` dotfiles | y (PRD) |
| Run-log file format | **one JSON file per run** (`<runId>.json`) holding the run record + ordered events, rewritten atomically (tmp+rename) on each event, à la `ConfigStore` | Simplest ephemeral store; reuses the proven atomic-write model; no JSONL streaming infra needed in v1 | y (default) |
| `ctx.git` surface in WF2 | **`fetch` only** (grows later) | The gate needs fetch; over-building the git facade now is speculative | y (default) |
| `ctx.ado.getTask` depth | **immediate children only** (`Hierarchy-Forward`), not recursive | US 15 says "a task and its child tasks"; the "implement ticket" example iterates one level | y (default) |
| `ctx.ado.getTask` on auth failure | **throws** (fail-fast) | Matches `ctx.sh`'s throw-by-default convention so the run fails visibly rather than silently proceeding | y (default) |
| A 2nd `workflows:run` while one is active | **refused with an error** (no queue in v1) | "Serial by default"; a real queue is unneeded until agent steps make runs long — deferred | y (default) |
| `esbuild` promoted to a **direct** dependency | add in WF2 (transitive today) | The loader needs it at runtime; transitive availability isn't a contract | y (WF2-D4) |
| Run-log retention | **no TTL/cleanup in v1** (files accumulate) | Ephemeral logs; cleanup/rotation is a v2 concern | y (default) |
| Trigger input values reach the engine | via the `workflows:run` payload `{ id, input }`; the generating **dialog** is WF5 | The engine consumes `ctx.input` now; the UI to collect it is a later milestone | y (PRD milestones) |

**Open questions:** none — all resolved or logged above.

## Edge Cases

- WHEN `~/.playground/workflows/` is missing or empty THEN `workflows:list` SHALL
  return an empty list (not an error). (WF2-01)
- WHEN a `workflow.ts` throws during `run(ctx)` THEN the run SHALL end `failed` with
  the error captured and worktrees/branches left in place. (WF2-13, WF2-15)
- WHEN `ctx.sh` exits non-zero without `allowFail` THEN the run SHALL fail; WITH
  `allowFail` the author gets `{ code, stdout, stderr }` and control continues.
  (WF2-06)
- WHEN a run is cancelled mid-`ctx.sh` THEN it SHALL stop at the **next** `ctx.*`
  checkpoint (a running child command is not force-killed in WF2 — agent-kill is
  WF3). (WF2-14)
- WHEN ADO auth fails during `ctx.ado.getTask` THEN the run SHALL fail visibly (throw),
  not silently continue with empty data. (WF2-08)
- WHEN one workflow folder is broken THEN the others SHALL still load and list.
  (WF2-03)
- WHEN a second run is triggered while one is active THEN it SHALL be refused with a
  clear error. (WF2-17)

## Implicit-Requirement Dimensions Sweep (Large — every dimension resolved)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | Workflow id must resolve to a discovered folder; broken files rejected with error (WF2-03); `meta.inputs.required` validated at trigger (WF2-04/11). |
| Failure / partial-failure | Fail-fast halt, no rollback, evidence captured (WF2-13/15); worktrees left as inspectable state (WF2-13). |
| Idempotency / retry / duplicate | Re-running spawns a fresh run; worktree-create reuse/recreate is the existing feature; a concurrent duplicate run is refused (WF2-17). |
| Auth boundaries & rate limits | ADO auth via the existing `az`-token gateway; serial runs respect rate limits (WF2-08/17). |
| Concurrency / ordering | Serial runs (WF2-17); cooperative cancellation at `ctx.*` checkpoints (WF2-14); event order preserved through the reducer + IPC stream (WF2-12/18). |
| Data lifecycle / expiry | Run logs ephemeral, lost on restart; **no TTL/cleanup** in v1 (Assumptions). |
| Observability | Every `ctx.*` auto-logs (WF2-10); run record + events persisted (WF2-16) and streamed (WF2-18). |
| External-dependency failure | git/`az`/shell failures surface as step failures (WF2-06/07/08); ADO keeps the existing 10s fetch timeout. |
| State-transition integrity | Pure reducer with guarded transitions (WF2-12). |

## User Stories → Priority

- **P1 (MVP — the gate):** WF2-01, 02, 05 (create), 06, 07, 09, 10 (log + auto-log),
  11, 12, 13, 15, 16, 17, 18 (list/run + events), 19, 20.
- **P2:** WF2-03 (broken listing), 04 (inputs in list), 05 (changedFiles), 06
  (allowFail), 08 (ADO child tasks), 14 (cancel), 01 (reload action).
- **P3:** WF2-10 (`ctx.step` grouping), 09 (toast polish).

## Requirement Traceability

| Requirement | Story (PRD US) | Priority | Task | Status |
| --- | --- | --- | --- | --- |
| WF2-01 | US 2,3,8 | P1/P2(reload) | T5,T8 | ✅ Done (tested) |
| WF2-02 | US 4,5 | P1 | T5 | ✅ Done (tested) |
| WF2-03 | US 7 | P2 | T5,T8 | ✅ Done (tested) |
| WF2-04 | US 4,9 | P2 | T1,T5 | ✅ Done (tested) |
| WF2-05 | US 10,14 | P1(create)/P2(changed) | T7 | ✅ Done (tested) |
| WF2-06 | US 11,12,13 | P1/P2(allowFail) | T7 | ✅ Done (tested) |
| WF2-07 | US 11 | P1 | T7,T9 | ✅ Done (tested) |
| WF2-08 | US 15 | P2 | T6,T7 | ✅ Done (tested) |
| WF2-09 | US 22 | P1 | T7,T9 | ✅ Done (T7 tested; real Notification T9 hand-verified) |
| WF2-10 | US 28,29,30 | P1/P3(step) | T7 | ✅ Done (tested) |
| WF2-11 | US 9 | P1 | T7,T8 | ✅ Done (tested) |
| WF2-12 | US 28,36 | P1 | T3 | ✅ Done (tested) |
| WF2-13 | US 34,35,42 | P1 | T8 | ✅ Done (tested) |
| WF2-14 | US 31 | P2 | T7,T8 | ✅ Done (tested) |
| WF2-15 | US 36 | P1 | T8 | ✅ Done (tested) |
| WF2-16 | US 40 | P1 | T4 | ✅ Done (tested) |
| WF2-17 | US 39 | P1 | T8 | ✅ Done (tested) |
| WF2-18 | US 42 | P1 | T9 | ✅ Done (contract+wiring; typecheck-gated, hand-verified) |
| WF2-19 | (types) | P1 | T1 | ✅ Done (typecheck-gated) |
| WF2-20 | (gate) | P1 | T10 | ✅ Done — **owner-run smoke PASSED 5/5** (2026-07-03; runId `4f5d9c9f…`, statuses `[running,done]`, 3 steps, 2 logs, run-log persisted) |

**Coverage:** 20 requirements; all mapped to a priority. Task mapping happens in Tasks.

## Success Criteria

- [ ] A real `workflow.ts` under `~/.playground/workflows/` loads, runs in the main
      process, and its `run(ctx)` uses `ctx.worktree.create` + `ctx.git.fetch` +
      `ctx.notify` to complete with status `done`.
- [ ] `scripts/smoke-workflow.mjs` drives that run over `workflows:run` and observes
      streamed `workflow:step`/`log` events + a written run log (WF2-20).
- [ ] Pure `run-state` and `ctx.sh`/loader behaviors are unit/behavior-tested per the
      project conventions (pure direct-assert; DI'd orchestrator on temp dirs); a
      broken workflow lists with its error without hiding the others.
- [ ] `ctx.ado.getTask` returns a task plus its immediate child tasks via
      `$expand=Relations`.
