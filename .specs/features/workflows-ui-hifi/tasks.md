# Workflows UI — Hi-Fi Rebuild (WHF) Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/workflows-ui-hifi/design.md`
**Spec**: `.specs/features/workflows-ui-hifi/spec.md`
**Status**: Approved

> **Baseline to reconfirm at Execute start:** STATE records **440 tests / 35 files** green on
> `feature/workflows-ui` (WF5 Verifier). Run `npm test` once before T1 to pin the real number;
> every per-task count below is `baseline + N`. If the AD-005 `tree.test.ts` real-git flake fires,
> re-run `npx vitest run src/main/tree.test.ts` in isolation before treating it as real.

---

## Test Coverage Matrix

> Generated from codebase, `.specs/codebase/TESTING.md`, and the spec — confirm before Execute.
> Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Pure reducer (`run-state.ts`) | unit | All branches; the new `step-finished` fold 1:1 to WHF-03 + guarded edges | `src/main/run-state.test.ts` | `npm test` |
| Main deep modules (`workflow-ctx.ts`, `workflow-manager.ts`) | unit | All branches; 1:1 to WHF-01/02/04/05/06/07/08/09/10 + listed edge cases | `src/main/<module>.test.ts` | `npm test` |
| Pure renderer lib (`workflow-run-view.ts`, `relative-time.ts`) | unit | All branches; per-step status + group rollup + fold seeds 1:1 to WHF-11..20 data; every edge case | `src/renderer/src/lib/<module>.test.ts` | `npm test` |
| Shared types (`workflows.ts`, `ipc-contract.ts`) | none (typecheck gate) | Compiles; consumers typecheck | `src/shared/**` | `npm run typecheck` |
| Renderer React components (`RunDetail`, `WorkflowsView`, `WorkflowTriggerDialog`, `TopBar`, `Icon`) | none (hand-verified) | CDP smoke + visual pass vs handoff | `src/renderer/src/components/**` | `node scripts/smoke-*.mjs` (live) |
| Fixture (`scripts/fixtures/implement-ticket/workflow.ts`) | none (owner-run smoke) | Two-example UI gate | `scripts/fixtures/**` | `node scripts/smoke-blocker-resume.mjs` (live) |

**Provenance:** `.specs/codebase/TESTING.md` §"What is deliberately NOT unit-tested" (renderer components + thin shells hand-verified; every main deep module + extracted pure helper carries co-located unit tests). Pure renderer **libs** (`src/renderer/src/lib/*.test.ts`) ARE unit-tested — precedent: `workflow-run-view.test.ts` (WF5, 12 tests).

## Parallelism Assessment

> Generated from codebase — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --- | --- | --- | --- |
| Unit (pure fold/reducer/helper) | **Yes** | Pure input→output; no shared state | `run-state.test.ts`, `workflow-run-view.test.ts` |
| Unit (injected-fake ctx/manager) | **Yes** | Hand-rolled fakes per test; no `vi.mock`, no network/Electron | `workflow-ctx`/`workflow-manager` fakes (WF2–WF4) |
| CDP smoke | **No** | Single live app on a fixed debug port + shared disk/ADO | `scripts/smoke-*.mjs` — one at a time, by hand |

Vitest runs files in parallel workers; all unit tests here are safe. ⇒ Tasks whose only tests are unit tests may be `[P]`.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| **Quick** | After a task whose only tests are unit tests | `npm test` |
| **Full** | Before a PR / after a logic-bearing task | `npm run typecheck && npm run lint && npm test` |
| **Build** | After the renderer rebuild / phase completion | `npm run build` |
| **Manual** | The two-example UI gate (not unit-testable) | `npm run dev -- -- --remote-debugging-port=9222` + `node scripts/smoke-blocker-resume.mjs` (live) |

---

## Execution Plan

### Phase 1: Shared foundation (sequential)

```
T1
```

### Phase 2: Backend seam (sequential)

```
T1 → T2 → T3
```

### Phase 3: Renderer pure libs (parallel)

```
        ┌→ T4 [P]
T1 ─────┤
        └→ T5 [P]
```

### Phase 4: Renderer surfaces (parallel)

```
T4 ──┬→ T6  (hook)
     ├→ T8  (RunDetail)   ┐ need T4 (+T5)
     └→ T9  (WorkflowsView)┘
T5 ──┘
(independent) → T7 (Icon+TopBar) [P]
(independent) → T10 (TriggerDialog) [P]
```

### Phase 5: Two-example gate enablement (sequential)

```
(all) → T11 (fixture group)
```

---

## Task Breakdown

### T1: Shared contract + reducer `step-finished` fold

**What**: Grow the shared event vocabulary + IPC map (all additive) and teach the pure reducer to fold `step-finished`.
**Where**: `src/shared/workflows.ts`, `src/shared/ipc-contract.ts`, `src/main/run-state.ts` (+ `src/main/run-state.test.ts`)
**Depends on**: None
**Reuses**: existing `StepEvent`, `reduce()` guarded switch, `IpcEvents` map
**Requirement**: WHF-01 (fields), WHF-02 (durationMs field), WHF-03 (reducer fold), WHF-08 (run-started channel), WHF-07 (blocked sessionId field)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `workflows.ts`: `StepKind`, `PermissionPreset`, `StepDetail` (union reusing shared `WorkItemDetails`/`ChangedFile`) exported; `StepEvent` gains `'step-finished'` kind + `stepId?`, `stepKind?`, `durationMs?`, `ok?`, `agent?`, `agentResult?`, `detail?` (all optional/additive); `group` stays `string` (parent label — nesting by label; documented).
- [ ] `ipc-contract.ts`: `IpcEvents['workflow:run-started'] = { runId, workflowId, input, startedAt }`; `workflow:blocked` gains `sessionId?: string`.
- [ ] `run-state.ts`: `case 'step-finished'` appends when `running`, no status change, **clock-free** (mirrors `step-started`); guarded no-op otherwise.
- [ ] Reducer tests cover: append-when-running, ignored-when-pending, ignored-when-terminal, order preserved.
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline + ~4 (no deletions)

**Tests**: unit · **Gate**: full
**Commit**: `feat(workflows-ui-hifi): StepEvent enrichment + step-finished reducer fold (WHF-01/02/03/07/08)`

---

### T2: Runtime `start/finish` seam + instrument bracket (ctx + manager)

**What**: Replace `emitStep` with `startStep`/`finishStep` (manager owns clock + `stepId`); make `instrument` bracket start→await→finish with per-kind detail + agent extractors.
**Where**: `src/main/workflow-ctx.ts`, `src/main/workflow-manager.ts` (+ `workflow-ctx.test.ts`, `workflow-manager.test.ts`)
**Depends on**: T1
**Reuses**: `instrument`/`groupStack`, manager `#apply`/`#stamp`
**Requirement**: WHF-01 (stepKind+stepId on start), WHF-02 (durationMs stamped), WHF-05 (agent prompt/permission on start), WHF-06 (agentResult on finish), WHF-07 (onBlocked forwards sessionId)

> **L-001 (confirmed lesson):** `startStep`/`finishStep` are **required** on `CtxRuntime` and wired in BOTH the producer (`workflow-ctx` instrument) and the sole consumer (`workflow-manager` runtime literal) **in this one task** — never relaxed to optional to green an interim typecheck.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `CtxRuntime`: `startStep(spec): number` + `finishStep(stepId, out?)` replace `emitStep`; `emitLog` kept; `requestInput(question, sessionId?)` gains the optional sessionId.
- [ ] `instrument(name, kind, fn, detail?)` brackets: `checkCancel → startStep → await fn → finishStep(ok:true, …onFinish)`; on throw `finishStep(ok:false)` then rethrow. Cancel-before-start emits **no** step (preserved).
- [ ] Per-kind extractors: agent `onStart {prompt, permission??'read'}` + `onFinish {agentResult}`; `ado.getTask` `onFinish {detail:{kind:'ado',…}}`; `worktree.changedFiles` `onFinish {detail:{kind:'files',files}}`. `ctx.step` uses the bracket with `kind:'group'`. `ctx.agent` onBlocked → `(q, sid) => requestInput(q, sid)`.
- [ ] Manager: `#stepSeq`/`#stepStart` map; `startStep` records `t0` + applies `step-started` (label/group/stepId/stepKind/agent) and returns id; `finishStep` computes `durationMs = Date.now()-t0` + applies `step-finished` (stepId/durationMs/ok/detail/agentResult); both reset in `run()`'s `finally`.
- [ ] `workflow-ctx` tests: each primitive's `stepKind`; monotonic `stepId`; start-before/finish-after ordering; agent `onStart` detail + `read` default; ado/files detail extraction; group bracket; throw → `finishStep(ok:false)`.
- [ ] `workflow-manager` tests: `durationMs ≥ 0` stamped; start↔finish `stepId` correlation; counter reset across two runs; agent/detail carried onto the saved events.
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline + ~13 (no deletions)

**Tests**: unit · **Gate**: full
**Commit**: `feat(workflows-ui-hifi): start/finish instrument seam + manager clock/stepId (WHF-01/02/05/06/07)`

---

### T3: Manager broadcasts + failure detail

**What**: Broadcast the enriched stream to the renderer and surface real failure evidence.
**Where**: `src/main/workflow-manager.ts` (+ `workflow-manager.test.ts`)
**Depends on**: T2
**Reuses**: manager `#emit`, `AgentStepError.detail`
**Requirement**: WHF-04 (broadcast start/finish), WHF-08 (run-started event), WHF-09 (failed error/stdout/code), WHF-10 (agent failure detail), WHF-07 (blocked sessionId emit)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `#emit`: `step-finished` → `workflow:step`; terminal `failed` → `workflow:step` (carrying `error`/`stdout`/`code`); on `run-started` also `emit('workflow:run-started', {runId, workflowId, input, startedAt})`; `workflow:blocked` payload gains `sessionId: event.sessionId`.
- [ ] Manager `catch` reads agent-failure evidence from `AgentStepError.detail` (`detail.stdout`→`stdout`, `detail.code`→`code`) in addition to `ShellError`'s top-level fields.
- [ ] Tests: `step-finished` broadcast; `run-started` payload shape; `failed` broadcast carries `error/stdout/code`; `AgentStepError.detail` surfaced on failure; `sessionId` on the `workflow:blocked` emit.
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline + ~6 (no deletions)

**Tests**: unit · **Gate**: full
**Commit**: `feat(workflows-ui-hifi): broadcast enriched stream + failure detail (WHF-04/07/08/09/10)`

---

### T4: `workflow-run-view` fold rebuild [P]

**What**: Fold the enriched stream into the hifi `RunView` (steps as `StepNode[]`, `input`/`startedAt`, per-step status, group rollup). Keeps `timeline` transitionally (expand-contract; removed in T8 when RunDetail — its only consumer — switches to `steps`).
**Where**: `src/renderer/src/lib/workflow-run-view.ts` (+ `workflow-run-view.test.ts`)
**Depends on**: T1
**Reuses**: `upsert`/`emptyRun` create-or-update
**Requirement**: WHF-11..14 (status/rollup data), WHF-15/16 (detail/agent data), WHF-17/18/19/20 (input/startedAt/blockedSessionId/error seeds)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `StepNode` + richer `RunView` (`input`, `startedAt?`, `steps`, `logs`, `blockedSessionId?`, `error?`/`stdout?`/`code?`); exported pure `stepStatus(node, run)` + `groupRollup(children)` (precedence failed>blocked>running>done>pending).
- [ ] `WorkflowFoldEvent` union gains `run-started` + `step-finished`; `blocked` gains `sessionId`. Fold: `run-started` seeds workflowId/input/startedAt→running; `step-started` upserts node; `step-finished` matches by `stepId` → finished/ok/durationMs/agentResult/detail; `log`→logs; `blocked`→blocked+blockedSessionId; failed `status` reads error/stdout/code from the broadcast `failed` step.
- [ ] `timeline` still populated (transitional) so `RunDetail` compiles until T8.
- [ ] Tests: run-started seeds; step upsert; step-finished sets fields; `stepStatus` for done/failed(ok:false)/running/blocked/pending; `groupRollup` precedence incl. mixed; blockedSessionId set; failed reads error/stdout/code; unknown-runId defensive create.
- [ ] Quick gate passes: `npm test` (+ `npm run typecheck`)
- [ ] Test count: baseline + ~12 (no deletions)

**Tests**: unit · **Gate**: full
**Commit**: `feat(workflows-ui-hifi): richer RunView fold — stepNodes/status/rollup (WHF-11..20 data)`

---

### T5: `relative-time` pure helper [P]

**What**: Extract the "started 4m ago" formatter into a reusable, unit-tested lib.
**Where**: `src/renderer/src/lib/relative-time.ts` (+ `relative-time.test.ts`)
**Depends on**: None (structurally; grouped in Phase 3)
**Reuses**: the `relativeTime` logic currently inline in `TopBar.tsx:30`
**Requirement**: WHF-17 (header relative time), WHF-22 (RECENT RUNS relative time)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `relativeTime(fromMs: number, nowMs: number): string` — "just now" / "Nm ago" / "Nh ago" (accepts ISO or epoch input helper as needed by the header's `startedAt` ISO).
- [ ] Tests: <1m → just now; minutes; hours; boundary crossing.
- [ ] (TopBar keeps working — optional: switch TopBar to import it in T7 to avoid duplication.)
- [ ] Quick gate passes: `npm test`
- [ ] Test count: baseline + ~5 (no deletions)

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(workflows-ui-hifi): extract relative-time helper (WHF-17/22)`

---

### T6: `use-workflow-runs` hook — run-started subscription, retire `pendingWf`

**What**: Subscribe to `workflow:run-started`; drop the `pendingWf` runId/workflowId inference.
**Where**: `src/renderer/src/lib/use-workflow-runs.ts`
**Depends on**: T4
**Reuses**: the existing subscription + `foldRunEvent` wiring
**Requirement**: WHF-08 (run-started consumed), retire hack

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `api.on('workflow:run-started', …)` folds the event; the run is auto-selected on its run-started; `workflowId` comes from the event (no `pendingWf`).
- [ ] `start()` no longer sets `pendingWf`; the status handler no longer patches `workflowId`.
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test` (hand-verified component; no new unit tests)
- [ ] Test count: baseline + 0

**Tests**: none (hand-verified) · **Gate**: full
**Commit**: `feat(workflows-ui-hifi): consume workflow:run-started, retire pendingWf hack (WHF-08)`

---

### T7: Pipeline glyph — `Icon` + `TopBar` [P]

**What**: Add the workflow-nodes pipeline glyph (+ play/help-circle/x-circle/stop-square) and use it on the Workflows segment.
**Where**: `src/renderer/src/components/Icon.tsx`, `src/renderer/src/components/TopBar.tsx`
**Depends on**: None
**Reuses**: `Icon` union + `PATHS`; optionally import `relative-time` (T5) into TopBar to dedupe
**Requirement**: WHF-23 (pipeline glyph)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `IconName` + `PATHS` gain `workflow-nodes` (two source nodes cx6/cy6 + cx6/cy18 r≈1.7 → cx18/cy12 via elbows), `play` (`M7 5l11 7-11 7z`), `help-circle`, `x-circle`, `stop-square`.
- [ ] TopBar Workflows segment renders `workflow-nodes` (not `git-fork`).
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline + 0

**Tests**: none (hand-verified) · **Gate**: full
**Commit**: `feat(workflows-ui-hifi): pipeline glyph on Workflows segment (WHF-23)`

---

### T8: `RunDetail` hifi rebuild (+ drop transitional `timeline`)

**What**: Rebuild the run detail to the handoff — node timeline, detail boxes, header, INPUTS strip, hifi respond panel, failed footer; then remove the now-unused `timeline` from `RunView`/fold.
**Where**: `src/renderer/src/components/RunDetail.tsx`, `RunDetail.css`, `src/renderer/src/lib/workflow-run-view.ts` (drop `timeline`) + fold test cleanup
**Depends on**: T4, T5, T7
**Reuses**: `RespondPanel` (grown), status/kind/permission → mapping classes, base palette + `pulse`/`blink`, `relative-time`, new glyphs
**Requirement**: WHF-11 (nodes+glyphs+connectors), WHF-12 (kind tags), WHF-13 (durations), WHF-14 (group rows+rollup), WHF-15 (step detail boxes), WHF-16 (agent detail box), WHF-17 (header+relative time+status pulse), WHF-18 (INPUTS strip), WHF-19 (respond panel+session note), WHF-20 (failed footer)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Header (workflow tile + name + `RUN-ID · started <relative>` + status pill w/ pulsing dot + Cancel while running/blocked); INPUTS strip (chips / faint "no inputs").
- [ ] Node timeline: 26px node + glyph-by-`stepStatus` + 2px connector; kind tag + label + right-aligned duration; group rows (bold label + `groupRollup` pill + indented children).
- [ ] Step detail box (mono lines glyph-colored, from `StepDetail`); agent detail box (tile + name + permission pill + emit badge + italic prompt + `• key value` data / amber blocked line).
- [ ] Respond panel hifi (`?`-tile, question, "resumes the same agent conversation (session `<blockedSessionId>`) via `--resume`" note, guidance textarea, Abort / Resume).
- [ ] Failed footer (`x-circle` + failing call + `error`/`stdout`/`code` + no-rollback note).
- [ ] `timeline` removed from `RunView` + fold (+ fold test) — RunDetail was its only consumer; gate stays green.
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test`; `npm run build` OK.
- [ ] Test count: baseline + 0 (fold tests net-neutral: timeline assertions removed, step assertions from T4 stand)

**Tests**: none new (component hand-verified; fold covered by T4) · **Gate**: full + build
**Commit**: `feat(workflows-ui-hifi): hifi RunDetail — node timeline, detail boxes, respond, footer (WHF-11..20)`

---

### T9: `WorkflowsView` hifi rail rebuild [P]

**What**: Rebuild the rail to the handoff — DEFINITIONS cards + RECENT RUNS with relative time + pipeline glyph tiles/empty state.
**Where**: `src/renderer/src/components/WorkflowsView.tsx`, `WorkflowsView.css`
**Depends on**: T4, T5, T7
**Reuses**: existing rail structure, `relative-time`, `workflow-nodes` glyph, status mapping classes
**Requirement**: WHF-21 (definition cards + rail header), WHF-22 (RECENT RUNS meta + relative time), WHF-23 (glyph on tiles/empty state)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Rail header: "WORKFLOWS" + "N defined" (non-broken count) + Reload + "+ New".
- [ ] DEFINITIONS: pipeline-glyph tile, name, description, "N input(s)", play-triangle Run; broken = red tile + "broken" pill + error.
- [ ] RECENT RUNS: status dot (pulses if running) + name + status pill + mono meta (`<input summary> · <relative time>`), selected = left accent bar.
- [ ] Empty detail state uses `workflow-nodes` (not `git-fork`).
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline + 0

**Tests**: none (hand-verified) · **Gate**: full
**Commit**: `feat(workflows-ui-hifi): hifi Workflows rail — cards + RECENT RUNS (WHF-21/22/23)`

---

### T10: `WorkflowTriggerDialog` hifi [P]

**What**: Bring the Run-workflow dialog to handoff fidelity.
**Where**: `src/renderer/src/components/WorkflowTriggerDialog.tsx` (+ CSS as needed)
**Depends on**: T7 (play glyph)
**Reuses**: shared dialog chassis (`NewWorktreeDialog.css`), `workflow-nodes`/`play` glyphs
**Requirement**: WHF-24 (hifi dialog)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Header: "RUN WORKFLOW" kicker + workflow tile + name + description.
- [ ] One mono field per `meta.inputs` (red `*` on required, placeholder = key); no-inputs → italic "just run it".
- [ ] Footer: Cancel + play-triangle "Run workflow" disabled until every required input non-empty.
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline + 0

**Tests**: none (hand-verified) · **Gate**: full
**Commit**: `feat(workflows-ui-hifi): hifi Run-workflow dialog (WHF-24)`

---

### T11: `implement-ticket` fixture — one `ctx.step` group

**What**: Wrap the worktree.create + agent in a single `ctx.step` group so WHF-14 group rollup is exercised in the two-example UI gate (owner decision: light).
**Where**: `scripts/fixtures/implement-ticket/workflow.ts`
**Depends on**: T2 (ctx.step group bracket), T8 (renders the rollup)
**Reuses**: existing fixture; `ImplementCtx` local interface gains `step`
**Requirement**: WHF-14 (group rollup — live gate coverage)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `run` wraps `worktree.create` + `agent` in `await ctx.step(\`Implement ${branch}\`, async () => { … })`; the `ImplementCtx` local interface adds `step<T>(label, fn): Promise<T>`.
- [ ] `notify(JSON result)` line preserved (smoke greps it); no smoke-script change required.
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline + 0
- [ ] **Manual (owner-run, the milestone gate):** `npm run dev -- -- --remote-debugging-port=9222` → run "implement ticket" + "review PR" through the UI; verify handoff fidelity (kind tags, durations, agent box w/ emitted data, group rollup, blocked panel+session note, resume, done/failed footer).

**Tests**: none (owner-run smoke) · **Gate**: full + manual two-example gate
**Commit**: `test(workflows-ui-hifi): implement-ticket ctx.step group for WHF-14 gate coverage`

---

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1

Phase 2 (Sequential):
  T1 → T2 → T3

Phase 3 (Parallel — both need T1):
  ├── T4 [P]  (fold)
  └── T5 [P]  (relative-time)

Phase 4 (Parallel — mixed deps):
  ├── T6      (hook)        ← T4
  ├── T7 [P]  (Icon+TopBar) ← none
  ├── T8      (RunDetail)   ← T4,T5,T7
  ├── T9 [P]  (WorkflowsView) ← T4,T5,T7
  └── T10 [P] (TriggerDialog)  ← T7

Phase 5 (Sequential):
  T11 (fixture) ← T2,T8
```

> **>3 phases → the orchestrator offers one sub-agent per phase (offer-then-confirm) at Execute.**
> Note: T8 removes the transitional `timeline` and edits the fold (T4's file); within Phase 4 keep
> T8 before/without a conflicting parallel edit to `workflow-run-view.ts` (only T8 touches it).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | shared types + 1 reducer case (cohesive contract) | ✅ Granular |
| T2 | 1 seam across producer+consumer (L-001 forces together) | ✅ Cohesive |
| T3 | 1 concern: manager broadcasts | ✅ Granular |
| T4 | 1 module: fold rebuild | ✅ Granular |
| T5 | 1 helper | ✅ Granular |
| T6 | 1 hook | ✅ Granular |
| T7 | 1 concern: glyph (Icon+TopBar) | ✅ Granular |
| T8 | 1 component (RunDetail) + its data cleanup | ✅ Granular |
| T9 | 1 component (WorkflowsView) | ✅ Granular |
| T10 | 1 component (dialog) | ✅ Granular |
| T11 | 1 fixture file | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (root) | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 | ✅ |
| T4 | T1 | T1→T4 | ✅ |
| T5 | None | Phase 3 (root-ish) | ✅ |
| T6 | T4 | T4→T6 | ✅ |
| T7 | None | root | ✅ |
| T8 | T4, T5, T7 | T4,T5,T7→T8 | ✅ |
| T9 | T4, T5, T7 | T4,T5,T7→T9 | ✅ |
| T10 | T7 | T7→T10 | ✅ |
| T11 | T2, T8 | T2,T8→T11 | ✅ |

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | shared types + pure reducer | unit (reducer) / typecheck (types) | unit | ✅ OK |
| T2 | main deep modules (ctx, manager) | unit | unit | ✅ OK |
| T3 | main deep module (manager) | unit | unit | ✅ OK |
| T4 | pure renderer lib (fold) | unit | unit | ✅ OK |
| T5 | pure renderer lib (helper) | unit | unit | ✅ OK |
| T6 | renderer hook (React) | none (hand-verified) | none | ✅ OK |
| T7 | renderer components (Icon/TopBar) | none (hand-verified) | none | ✅ OK |
| T8 | renderer component + fold cleanup | none (component) / unit (fold covered by T4) | none new | ✅ OK |
| T9 | renderer component | none (hand-verified) | none | ✅ OK |
| T10 | renderer component | none (hand-verified) | none | ✅ OK |
| T11 | fixture (owner-run smoke) | none | none | ✅ OK |

All ✅ — no violations. (T8's fold edit is a delete-only cleanup; the fold's behavior is unit-tested in T4.)

---

## Tools per task

All tasks: **MCP: NONE · Skill: NONE**. The handoff (`design/handoff/DESIGN_HANDOFF_WORKFLOWS.md`)
is the visual reference for the renderer tasks (T7–T11); no external MCP or generator skill is used
— the codebase's house component style + the handoff's exact values govern.
