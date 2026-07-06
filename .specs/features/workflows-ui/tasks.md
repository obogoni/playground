# Workflows UI (WF5) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill
is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy
review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/workflows-ui/design.md`
**Status**: Done — all 10 tasks committed (`5f0ad4d..1c5b84c` on `feature/workflows-ui`),
Verifier PASS (25/25 ACs, sensor 5/5 killed), gate green (440 tests), prod build OK.
Remaining: owner-run two-example UI smoke, then PR/merge.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines
> found: **none as a doc** — inferred from codebase samples (`src/main/*.test.ts` deep-module
> tests; `src/renderer/src/lib/tree-selection.test.ts` + `agent-registry.test.ts` renderer
> pure-logic tests) and the merged workflows backend convention. UI *components* are
> hand-verified per project convention (no renderer-component tests exist anywhere).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main deep module (`workflow-scaffold`) | unit | All branches; 1:1 to WF5-23/24 + edge cases (fresh id creates valid template parsed by the real loader; existing id → no overwrite; empty/invalid id → reject) | `src/main/*.test.ts` | `npx vitest run src/main/workflow-scaffold.test.ts` |
| Renderer pure lib (`workflow-run-view` fold) | unit | All fold branches: status upsert + idempotent + resume/terminal clears `blocked`; step→timeline; log→timeline; blocked→question; unknown-runId create-or-update | `src/renderer/src/lib/*.test.ts` | `npx vitest run src/renderer/src/lib/workflow-run-view.test.ts` |
| Renderer components + hook (`WorkflowsView`, `RunDetail`, `RespondPanel`, dialogs, `useWorkflowRuns` wiring) | none (hand-verified) | Milestone gate: both examples run entirely through the UI | `src/renderer/src/components/*.tsx`, `lib/use-workflow-runs.ts` | build gate + manual |
| Shared types / IPC contract (`ScaffoldResult`, `workflows:scaffold`, `direction` union) | none | Build gate only (typecheck) | `src/shared/*.ts` | `npm run typecheck` |
| Main IPC wiring (`workflows:scaffold` handler + `shell.showItemInFolder` reveal) | none (thin shell, hand-verified) | Build gate + manual reveal check | `src/main/index.ts` | typecheck + manual |

## Parallelism Assessment

> Generated from codebase — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --------- | -------------- | --------------- | -------- |
| Main unit (`workflow-scaffold`) | Yes | Per-test unique temp dir (no shared store), like `workflow-loader.test.ts` | `workflow-loader.test.ts` real-temp-dir isolation; scaffold uses a fresh `mkdtemp` per test |
| Renderer pure unit (`workflow-run-view`) | Yes | Pure function, no I/O, no shared state | `tree-selection.test.ts` pure-input/output style |

> Note (AD-005): `src/main/tree.test.ts` is the known real-git-on-Windows flake — **not**
> touched by WF5. If a full gate flakes on it, re-run it in isolation before treating it as real.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task with unit tests only (T1, T2) | `npx vitest run <touched test file>` |
| Full | After a task that could affect other suites | `npm test` (`vitest run`, all files) |
| Build | After every task (types/components/wiring) + phase completion | `npm run typecheck && npm run lint && npm test` |

---

## Execution Plan

**3 phases → inline execution (no sub-agent offer; the >3-phase threshold is not met).**

### Phase 1: Foundations (Parallel OK)

Pure, independently-testable modules + the shared contract surface.

```
┌→ T1 [P]  (workflow-run-view fold + tests)
├→ T2 [P]  (workflow-scaffold + tests)
└→ T3 [P]  (shared ScaffoldResult + workflows:scaffold contract)
```

### Phase 2: Leaf components + handler (Parallel OK)

Everything that depends only on Phase 1, with no inter-dependency.

```
T1 ──→ T4 [P]  (useWorkflowRuns hook)      (also needs T3)
T1 ──→ T7 [P]  (RunDetail + RespondPanel)
       T5 [P]  (WorkflowTriggerDialog)     (no new deps)
T3 ──→ T6 [P]  (NewWorkflowDialog)
T2,T3 ─→ T8 [P] (workflows:scaffold handler + reveal)
```

### Phase 3: Composition + integration (Sequential)

```
T5,T6,T7 ──→ T9 (WorkflowsView) ──→ T10 (App integration: direction + tab + branch + hook mount + focus-run)
        T4 ───────────────────────↗
```

---

## Task Breakdown

### T1: `workflow-run-view` fold module + tests [P]

**What**: Pure reducer `foldRunEvent(runs, ev)` that folds one `workflow:*` event into `RunView[]`, plus its unit tests.
**Where**: `src/renderer/src/lib/workflow-run-view.ts`, `src/renderer/src/lib/workflow-run-view.test.ts`
**Depends on**: None
**Reuses**: `run-state.ts` (main) pure-reducer shape; `tree-selection.test.ts` test style; shared `workflows.ts` types
**Requirement**: WF5-04, WF5-10, WF5-11, WF5-12 (fold half), WF5-13

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `RunView` + `WorkflowFoldEvent` types + `foldRunEvent` exported per design
- [ ] `status` fold: upserts run, sets status, is idempotent on repeat, clears `blocked` on resume (leaving blocked) and on terminal (`done`/`failed`/`cancelled`)
- [ ] `step` fold appends a `{kind:'step',label,group}` row; `log` fold appends `{kind:'log',message,group}`; `blocked` fold sets `blocked=question`
- [ ] unknown-`runId` event creates the `RunView` (never throws)
- [ ] Quick gate passes: `npx vitest run src/renderer/src/lib/workflow-run-view.test.ts`
- [ ] Test count: ≥ 8 tests pass (one per fold branch + idempotency + terminal-clear + unknown-runId), no silent deletions

**Tests**: unit
**Gate**: quick (then build at phase end)
**Commit**: `feat(workflows-ui): pure workflow-run-view event fold + tests`

---

### T2: `workflow-scaffold` module + tests [P]

**What**: `sanitizeWorkflowId` + `scaffoldWorkflow(root, name)` creating a valid template folder (reject existing/invalid id), plus unit tests.
**Where**: `src/main/workflow-scaffold.ts`, `src/main/workflow-scaffold.test.ts`
**Depends on**: None
**Reuses**: `workflow-loader.ts` (test parses the generated file through the real loader); `node:fs/promises` + `node:path` `join` (Windows-only, AD-005)
**Requirement**: WF5-23, WF5-24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `sanitizeWorkflowId` lowercases, maps non-`[a-z0-9-_]`→`-`, collapses repeats, trims edges
- [ ] `scaffoldWorkflow` on a fresh name writes `<root>/<id>/workflow.ts` from the template and returns `{ok:true,id,path}`
- [ ] Generated `workflow.ts` parses through the **real `loadWorkflow`** to a valid `{meta, run}` (asserted in the test)
- [ ] Existing id → `{ok:false}` and the existing file is **byte-for-byte untouched** (asserted)
- [ ] Empty/invalid sanitized id → `{ok:false}`, nothing created
- [ ] Quick gate passes: `npx vitest run src/main/workflow-scaffold.test.ts`
- [ ] Test count: ≥ 5 tests pass, no silent deletions

**Tests**: unit
**Gate**: quick (then build at phase end)
**Commit**: `feat(workflows-ui): workflow-scaffold module + tests`

---

### T3: Shared `ScaffoldResult` + `workflows:scaffold` contract [P]

**What**: Add the `ScaffoldResult` shared type and the `workflows:scaffold` entry to the IPC contract.
**Where**: `src/shared/workflows.ts` (add `ScaffoldResult`), `src/shared/ipc-contract.ts` (add `'workflows:scaffold'`: `req {name}`, `res ScaffoldResult`)
**Depends on**: None
**Reuses**: existing `IpcContract` map shape (`ipc-contract.ts:99-108`)
**Requirement**: WF5-22 (contract surface)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `ScaffoldResult = {ok:true;id;path} | {ok:false;error}` exported from `shared/workflows.ts`
- [ ] `'workflows:scaffold'` added to `IpcContract` with `{name:string}` req and `ScaffoldResult` res
- [ ] **No `optional` relaxation** introduced (L-001): the contract entry is concrete; typecheck stays green because `handle()` registration is dynamic (handler lands in T8)
- [ ] Build gate passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none (types — build gate)
**Gate**: build
**Commit**: `feat(workflows-ui): shared ScaffoldResult + workflows:scaffold contract`

---

### T4: `useWorkflowRuns` hook [P]

**What**: Always-mountable hook that subscribes to `workflow:*` (folding via T1) and wraps `workflows:list/run/cancel/respond/scaffold`; exposes defs/runs/selection.
**Where**: `src/renderer/src/lib/use-workflow-runs.ts`
**Depends on**: T1 (fold), T3 (`ScaffoldResult`)
**Reuses**: `use-sessions.ts:42-49` always-mounted subscription pattern; `lib/api.ts`
**Requirement**: WF5-04, WF5-07, WF5-09, WF5-15, WF5-16, WF5-18, WF5-21, WF5-22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Subscribes to `workflow:status/step/log/blocked` on mount, folds via `foldRunEvent`, tears all subscriptions down on unmount
- [ ] Exposes `defs`, `runs`, `selectedRunId`, `activeRunId`, `loading`, `error`, and `refresh`/`start`/`cancel`/`respond`/`scaffold`/`selectRun`
- [ ] `start` invokes `workflows:run`, selects the new `runId`, and **surfaces** a rejection (serial conflict) into `error` (not swallowed)
- [ ] `scaffold` invokes `workflows:scaffold` and calls `refresh()` on `{ok:true}`
- [ ] Build gate passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none (hook wiring — hand-verified; pure logic is in T1)
**Gate**: build
**Commit**: `feat(workflows-ui): useWorkflowRuns hook (subscribe + channel wrappers)`

---

### T5: `WorkflowTriggerDialog` [P]

**What**: A dialog that renders a form from `meta.inputs` and submits collected values.
**Where**: `src/renderer/src/components/WorkflowTriggerDialog.tsx` (reuses `NewWorktreeDialog.css`)
**Depends on**: None (uses existing `WorkflowMeta`/`WorkflowInput`)
**Reuses**: `NewWorktreeDialog.tsx`/`StartWorkDialog.tsx` chassis (backdrop/panel/header/body/footer, `busy`/`error`)
**Requirement**: WF5-05, WF5-06, WF5-07 (submit), WF5-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] One field per `meta.inputs`, labelled by `input.label`
- [ ] Submit disabled while any `required` field is empty
- [ ] Submit calls `onSubmit(input)` with the collected key→value map; no-inputs workflow submits `{}` directly
- [ ] Follows the dialog chassis + closes via `onClose`
- [ ] Build gate passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none (component — hand-verified)
**Gate**: build
**Commit**: `feat(workflows-ui): WorkflowTriggerDialog form from meta.inputs`

---

### T6: `NewWorkflowDialog` [P]

**What**: A minimal name-input dialog that returns the created result inline.
**Where**: `src/renderer/src/components/NewWorkflowDialog.tsx` (reuses `NewWorktreeDialog.css`)
**Depends on**: T3 (`ScaffoldResult`)
**Reuses**: dialog chassis; `worktrees:create` inline-error consumption pattern
**Requirement**: WF5-22 (dialog), WF5-24 (inline error)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Single name field; Create calls `onCreate(name): Promise<ScaffoldResult>`
- [ ] On `{ok:false}` shows the `error` inline and does NOT close; on `{ok:true}` closes
- [ ] Follows the dialog chassis
- [ ] Build gate passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none (component — hand-verified)
**Gate**: build
**Commit**: `feat(workflows-ui): NewWorkflowDialog name input`

---

### T7: `RunDetail` + `RespondPanel` [P]

**What**: The run-detail surface (status badge, timeline, cancel) plus the blocked respond panel.
**Where**: `src/renderer/src/components/RunDetail.tsx` (+ `RespondPanel` co-located; `RunDetail.css`)
**Depends on**: T1 (`RunView` type)
**Reuses**: `AgentsView`/`TerminalPane` render conventions
**Requirement**: WF5-10/11/12 (render), WF5-13, WF5-14, WF5-15/16 (abort/guidance UI), WF5-18 (cancel button)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Status badge reflects `run.status` (stable/idempotent on repeat)
- [ ] Timeline renders `run.timeline` in arrival order; entries sharing a `group` are nested
- [ ] `failed` shows the badge only, **no reason** (v1)
- [ ] Cancel shown only when status ∈ {`running`,`blocked`}, calls `onCancel(runId)`
- [ ] When `run.blocked` set, `RespondPanel` shows `title`/`body`; Abort → `onRespond({action:'abort'})`; guidance textarea (submit disabled when empty) → `onRespond({action:'guidance',guidance})`
- [ ] Build gate passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none (components — hand-verified)
**Gate**: build
**Commit**: `feat(workflows-ui): RunDetail timeline/badge + RespondPanel`

---

### T8: `workflows:scaffold` handler + reveal [P]

**What**: Register the `workflows:scaffold` main handler delegating to `scaffoldWorkflow`, then reveal the created folder.
**Where**: `src/main/index.ts` (near the other `workflows:*` handlers ~`:304-308`)
**Depends on**: T2 (`scaffoldWorkflow`), T3 (contract)
**Reuses**: `handle()` wrapper (`ipc.ts:17-22`); already-imported `shell` (`index.ts:1`, used `:113`)
**Requirement**: WF5-25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `handle('workflows:scaffold', ({name}) => …)` calls `scaffoldWorkflow(workflowsRoot, name)`
- [ ] On `{ok:true}`, calls `shell.showItemInFolder(res.path)`; returns the `ScaffoldResult` either way
- [ ] Uses the same `workflowsRoot` the `WorkflowManager` was constructed with (single source)
- [ ] Build gate passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none (thin shell wiring — hand-verified; the create logic is tested in T2)
**Gate**: build
**Commit**: `feat(workflows-ui): workflows:scaffold handler + folder reveal`

---

### T9: `WorkflowsView` composition

**What**: The master–detail view composing the definitions list, session-runs list, and `RunDetail`; owns the two dialogs' open-state and the Reload / New workflow actions.
**Where**: `src/renderer/src/components/WorkflowsView.tsx` (+ `WorkflowsView.css`)
**Depends on**: T5 (`WorkflowTriggerDialog`), T6 (`NewWorkflowDialog`), T7 (`RunDetail`)
**Reuses**: `AgentsView.tsx`/`BoardView.tsx` layout; dialog open-state-as-local-state
**Requirement**: WF5-02, WF5-03, WF5-19, WF5-20 (surface error), WF5-21 (Reload button)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Renders every `def`: valid → `meta.name`/`description` + Run; broken (`{id,error}`) → error shown, Run disabled
- [ ] A broken def never hides valid ones (list renders all)
- [ ] Run affordance disabled while `activeRunId != null`; the `error` (serial conflict) is displayed
- [ ] Session runs list selects into `RunDetail`; empty `defs` → empty-state with New workflow / Reload still available
- [ ] Owns `triggerFor`/`newOpen` local state; Reload calls `onReload`, New workflow opens `NewWorkflowDialog`
- [ ] Build gate passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none (component — hand-verified)
**Gate**: build
**Commit**: `feat(workflows-ui): WorkflowsView master-detail composition`

---

### T10: App integration — direction + mount + focus-run

**What**: Register the `workflows` direction and mount the view: config union, TopBar tab, App render branch wiring `useWorkflowRuns()` into `WorkflowsView`, and the `workflow:focus-run` effect.
**Where**: `src/shared/config.ts:37` (union), `src/renderer/src/components/TopBar.tsx:100-131` (tab), `src/renderer/src/App.tsx` (branch + hook mount + effect)
**Depends on**: T4 (`useWorkflowRuns`), T9 (`WorkflowsView`)
**Reuses**: the established 3-edit direction pattern (union + tab + ternary); `App.tsx` `update({direction})` + effect conventions
**Requirement**: WF5-01, WF5-17, WF5-20 (surface path complete)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `direction` union in `config.ts` includes `'workflows'`; a fourth TopBar tab switches to it via `onDirectionChange('workflows')`
- [ ] App calls `useWorkflowRuns()` (always mounted) and renders `<WorkflowsView …props />` under the `direction === 'workflows'` branch
- [ ] App effect subscribes to `workflow:focus-run` → `update({direction:'workflows'})` + `selectRun(runId)`, torn down on unmount
- [ ] Build gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Full suite green: `npm test` (expected ≥ 422 + T1/T2 additions, 0 deletions)

**Tests**: none (integration wiring — hand-verified; capstone of the milestone gate)
**Gate**: build (full)
**Commit**: `feat(workflows-ui): register Workflows direction + mount view + focus-run`

---

## Parallel Execution Map

```
Phase 1 (Parallel):
  ├── T1 [P]  workflow-run-view fold + tests
  ├── T2 [P]  workflow-scaffold + tests
  └── T3 [P]  shared ScaffoldResult + contract

Phase 2 (Parallel, after Phase 1):
  ├── T4 [P]  useWorkflowRuns        (needs T1, T3)
  ├── T5 [P]  WorkflowTriggerDialog  (no new deps)
  ├── T6 [P]  NewWorkflowDialog      (needs T3)
  ├── T7 [P]  RunDetail + RespondPanel (needs T1)
  └── T8 [P]  workflows:scaffold handler (needs T2, T3)

Phase 3 (Sequential, after Phase 2):
  T9  WorkflowsView   (needs T5, T6, T7)
      └──→ T10  App integration (needs T4, T9)
```

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 workflow-run-view fold | 1 module + test | ✅ Granular |
| T2 workflow-scaffold | 1 module + test | ✅ Granular |
| T3 shared types + contract | 2 cohesive type additions (scaffold contract surface) | ✅ Granular |
| T4 useWorkflowRuns | 1 hook | ✅ Granular |
| T5 WorkflowTriggerDialog | 1 component | ✅ Granular |
| T6 NewWorkflowDialog | 1 component | ✅ Granular |
| T7 RunDetail + RespondPanel | 1 detail component (+ co-located panel) | ✅ Granular (cohesive) |
| T8 scaffold handler | 1 handler | ✅ Granular |
| T9 WorkflowsView | 1 composition component | ✅ Granular |
| T10 App integration | 1 cohesive "register direction" change (union+tab+branch, the canonical 3-edit unit) | ✅ Granular (cohesive) |

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| ---- | ----------------- | ------------- | ------ |
| T1 | None | none (Phase 1 root) | ✅ Match |
| T2 | None | none (Phase 1 root) | ✅ Match |
| T3 | None | none (Phase 1 root) | ✅ Match |
| T4 | T1, T3 | T1→T4, T3→T4 | ✅ Match |
| T5 | None | none | ✅ Match |
| T6 | T3 | T3→T6 | ✅ Match |
| T7 | T1 | T1→T7 | ✅ Match |
| T8 | T2, T3 | T2→T8, T3→T8 | ✅ Match |
| T9 | T5, T6, T7 | T5,T6,T7→T9 | ✅ Match |
| T10 | T4, T9 | T4→T10, T9→T10 | ✅ Match |

Parallel tasks within a phase have no arrows between them (verified: no Phase-2 task depends on another Phase-2 task).

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Renderer pure lib (fold) | unit | unit | ✅ OK |
| T2 | Main deep module (scaffold) | unit | unit | ✅ OK |
| T3 | Shared types / contract | none | none | ✅ OK |
| T4 | Renderer hook (wiring) | none | none | ✅ OK |
| T5 | Renderer component | none | none | ✅ OK |
| T6 | Renderer component | none | none | ✅ OK |
| T7 | Renderer component | none | none | ✅ OK |
| T8 | Main IPC wiring (thin shell) | none | none | ✅ OK |
| T9 | Renderer component | none | none | ✅ OK |
| T10 | Shared union + renderer wiring | none | none | ✅ OK |

All ✅ — the two layers the matrix marks `unit` (T1, T2) carry their tests in-task; every
`none` matches a matrix `none` (components/hook/wiring/types are hand-verified or build-gated,
per the sampled convention). No test deferral.
</content>
