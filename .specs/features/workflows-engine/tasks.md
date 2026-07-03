# WF2 — Workflows Engine — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and
follow its Execute flow and Critical Rules.** Do not search for skill files by
filesystem path. The skill is the source of truth for the full flow (per-task cycle,
sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/workflows-engine/design.md`
**Status**: Done ✅ (Verifier PASS — 20/20 ACs, 6/6 mutants killed, gate 318 green;
`validation.md`). Only open item: the owner-run WF2-20 smoke (manual gate).

**Progress:**
- Phase 1 ✅ (T1 `0fd6daf`, T2 `254273a`, T6 `4027ab9`; suite 257→262).
- Phase 2 ✅ (T3 `dadd86f`, T4 `b94c354`, T5 `45b5c04`, T7 `0c60ce2`, +lint `a2c7e3b`;
  suite 262→313).
- Phase 3 ✅ (T8 `0277067`; suite 313→318, full gate green). `emit` typed against a
  LOCAL `WorkflowIpcEvents` map in `workflow-manager.ts` (exported `EmitFn`) — **T9
  must move `workflow:status|step|log` into `src/shared/ipc-contract.ts` `IpcEvents`
  and repoint the manager's `EmitFn` to the shared `IpcEvent`.** `seq = events.length`
  assigned in `apply`. `notifier` in the bag is reserved (WF4) but T9 still wires a
  real `electron.Notification` notifier for `ctxDeps.notifier` (ctx.notify toast).
- Phase 4 ✅ (T9 `1186f89`, T10 `f0a8cb6`; suite stays 318 — thin shell/manual add no
  unit tests). Manager `EmitFn` repointed to shared `IpcEvent`. **WF2-20 smoke gate is
  owner-run** (not CI): `npm run dev -- -- --remote-debugging-port=9222` then
  `node scripts/smoke-workflow.mjs` (optional `SMOKE_REPO=<repo>`), expect exit 0.
- **Verifier PASS** (`validation.md`): 20/20 ACs, 6/6 mutants killed, gate 318 green.
- Note (pre-existing, not WF2): `src/main/ado-gateway.ts` is UTF-16-encoded (git sees it
  as binary — no textual diffs). Present since before WF2; candidate cleanup, out of scope.

**Interfaces for T8/T9:**
- `run-state`: `initialRun(id,workflowId,input)` (`startedAt:''`, clock-free),
  `reduce(run,event)` (guarded; `failed` sets `run.error` + keeps stdout/code in event).
- `WorkflowRunStore` (class): `save/load/list`.
- `workflow-loader`: `discoverWorkflows`, `validateMeta`, `loadWorkflow`, `LoadedWorkflow`.
- `workflow-ctx`: `makeCtx(deps:CtxDeps, runtime:CtxRuntime):Ctx`, `CancellationError`.
  Runtime seam T8 must satisfy: `checkCancel()` (throws), `emitStep(label,group?)`,
  `emitLog(message,group?)`, `input`. `ctx.ado.getTask` throws on auth of parent OR
  child batch; returns `{task, children:[{ref,details}]}` (resolved children only).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute.
> Guidelines found: `.specs/codebase/TESTING.md` (authoritative matrix, parallelism,
> gates), `.specs/codebase/CONVENTIONS.md`, `vitest.config.ts`
> (`include: src/**/*.test.ts, scripts/**/*.test.ts`), no coverage tool. Baseline
> **257 tests / 22 files** (verified `npx vitest run`, 2026-07-03).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process deep modules w/ logic (`run-state`, `workflow-loader`, `workflow-run-store`, `workflow-ctx`, `workflow-manager`, `ado-gateway` ext) | **unit** | All branches; 1:1 to spec ACs; every listed edge case | `src/main/<module>.test.ts` | `npm test` |
| Extracted pure helpers (`validateMeta`, `reduce`, relations-parse, URL-build) | **unit** | Pure input→output, all variants | co-located `*.test.ts` | `npm test` |
| Shared types (`src/shared/workflows.ts`) | **none** (build gate only) | — (typecheck only) | — | `npm run typecheck` |
| Thin OS/Electron shells (`index.ts` IPC wiring, real `execFile`/`spawn`, `electron.Notification`, real `CtxDeps` assembly) | **none** (hand-verified) | — | `src/main/index.ts` | manual / `npm run typecheck` |
| Build config (`package.json` esbuild dep) | **none** (build gate) | — | — | `npm run typecheck` + install |
| Out-of-CI gate smoke (`scripts/smoke-workflow.mjs`) | **manual only** | Drives `workflows:run`, asserts `done` + events + run-log | `scripts/smoke-*.mjs` | `node scripts/smoke-workflow.mjs` (live session) |

## Parallelism Assessment

> Generated from codebase (`.specs/codebase/TESTING.md`) — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --------- | -------------- | --------------- | -------- |
| Unit (pure) | **Yes** | Pure input→output, no shared state | `spawn-plan.test.ts`, `tree.test.ts` |
| Unit (temp-dir) | **Yes** | Per-test `mkdtempSync` + `rmSync` teardown | `config-store.test.ts`, `worktree-manager.test.ts` |
| Unit (injected fake) | **Yes** | Hand-rolled fakes per test; no `vi.mock`, no globals | `task-board.test.ts` (`stubSource`), `session-manager.test.ts` |
| CDP smoke | **No** | Single live app on fixed debug port + shared disk/ADO | `scripts/smoke-*.mjs` — one at a time, by hand |

Vitest runs files in parallel workers by default; all unit tests here are safe under
that model ⇒ tasks whose only tests are unit tests may be `[P]`.

## Gate Check Commands

> From `.specs/codebase/TESTING.md` — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| **Quick** | After a task whose only tests are unit tests | `npm test` |
| **Full** | Before PR / after a logic-bearing task | `npm run typecheck && npm run lint && npm test` |
| **Build** | After build-config changes / phase completion | `npm run build:win` |
| **Manual** | Gate smoke (not CI) | `node scripts/smoke-workflow.mjs` (live session) |

> Every expected-pass count below is anchored to the **257** baseline; a task adding
> N unit tests must end at `257 + (cumulative N)` with zero deletions.

---

## Execution Plan

### Phase 1: Foundation (Parallel)

No inter-dependencies; all start immediately.

```
T1 [P]   T2 [P]   T6 [P]
```

### Phase 2: Modules (Parallel)

All deps satisfied by Phase 1; no inter-dependencies.

```
        ┌→ T3 [P]
T1 ─────┼→ T4 [P]
        └→ T5 [P]  (also needs T2)
T6 ──────→ T7 [P]  (also needs T1)
```

### Phase 3: Orchestrator (Sequential)

```
T3, T4, T5, T7 ──→ T8
```

### Phase 4: Integration + Gate (Sequential)

```
T8 ──→ T9 ──→ T10
```

---

## Task Breakdown

### T1: Shared WF2 types [P]

**What**: Define the WF2 type vocabulary shared across main/renderer/smoke.
**Where**: `src/shared/workflows.ts` (new)
**Depends on**: None
**Reuses**: sits beside `src/shared/worktrees.ts`, `agents.ts` conventions
**Requirement**: WF2-19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Exports `WorkflowInput`, `WorkflowMeta`, `WorkflowDef` (valid `{id,meta}` |
      broken `{id,error}`), `RunStatus`, `StepEvent`, `WorkflowRun` exactly per the
      design Data Models section
- [ ] `npm run typecheck` passes (0 errors)
- [ ] Test count unchanged: 257 tests pass

**Tests**: none (types — build gate only)
**Gate**: build (`npm run typecheck`)

---

### T2: Promote `esbuild` to a direct dependency [P]

**What**: Add `esbuild` to `package.json` `dependencies` (transitive today) so the
loader can require it at runtime; install with the node-gyp workaround.
**Where**: `package.json`, `package-lock.json`
**Depends on**: None
**Reuses**: pin to the currently-resolved `esbuild@0.25.12` (avoid a version bump)
**Requirement**: WF2-D4 (spec Assumptions)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `esbuild` appears in `dependencies` (not devDependencies)
- [ ] `npm install --ignore-scripts` completes (per STATE node-gyp workaround; avoids
      the `electron-builder install-app-deps` native rebuild)
- [ ] `node -e "require('esbuild')"` resolves
- [ ] Test count unchanged: 257 tests pass

**Tests**: none (build config — build gate only)
**Gate**: build (`npm run typecheck` + install)

---

### T6: ADO gateway — `getWorkItemWithRelations` [P]

**What**: Add a gateway method that fetches one work item with `$expand=Relations`
(no `fields`) and extracts its `Hierarchy-Forward` child refs.
**Where**: `src/main/ado-gateway.ts` (modify), `src/main/ado-gateway.test.ts` (extend)
**Depends on**: None
**Reuses**: `getToken` cache, `fetchWithTimeout` seam, `refKey`, `groupByProject`
(`ado-gateway.ts:104,137,34,155`); existing `getWorkItems` for the child batch
**Requirement**: WF2-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `getWorkItemWithRelations(ref)` returns `{ ok:true; item; childRefs }` |
      `{ ok:false; reason:'auth'; error }`
- [ ] URL adds `$expand=Relations` and **omits** `fields` (mutually exclusive in ADO
      REST 7.1); `api-version=7.1` retained
- [ ] A pure relations-parse helper maps `relations[]` where
      `rel==='System.LinkTypes.Hierarchy-Forward'` → child `WorkItemRef` (same
      org/project); unit-tested directly
- [ ] Auth 401/403 clears cache and returns `{ ok:false, reason:'auth' }` (mirrors
      `getWorkItems`)
- [ ] Unit tests via injected fake `fetch` (no network): happy relations, no
      relations → `[]`, auth failure. `npm test` passes
- [ ] Test count: 257 + ~4 = ~261 pass (no deletions)

**Tests**: unit (pure helper + injected-fake fetch)
**Gate**: quick (`npm test`)

---

### T3: Pure `run-state` reducer [P]

**What**: Pure `(run, event) → run` reducer over the WF2 event set with guarded
transitions.
**Where**: `src/main/run-state.ts` (new), `src/main/run-state.test.ts` (new)
**Depends on**: T1
**Reuses**: pure-fn direct-assert convention (`spawn-plan.ts`)
**Requirement**: WF2-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `initialRun(id, workflowId, input)` → status `pending`
- [ ] `reduce` transitions: `pending→running` (run-started); `running→running`
      (step-started/step-logged append to `events`); `running→done`;
      `running→failed` (captures `error/stdout/code`); `running→cancelled`
- [ ] **Guarded**: any event after a terminal status, or an out-of-order event (e.g.
      `done` while `pending`), returns the run **unchanged**
- [ ] Reducer is **pure** — no clock, no I/O (timestamps stamped by the manager)
- [ ] Unit tests cover every transition + every guard (1:1 to WF2-12 branches).
      `npm test` passes
- [ ] Test count: 257 + ~10 = ~267 pass (no deletions)

**Tests**: unit (pure)
**Gate**: quick (`npm test`)

---

### T4: `workflow-run-store` (ephemeral atomic per-run log) [P]

**What**: One JSON file per run, rewritten atomically (tmp+rename) on each save.
**Where**: `src/main/workflow-run-store.ts` (new), `src/main/workflow-run-store.test.ts` (new)
**Depends on**: T1
**Reuses**: `ConfigStore.persist()` atomic tmp+rename discipline (`config-store.ts:65`)
**Requirement**: WF2-16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `constructor(dir)` injected (temp dir in tests, `userData/workflow-runs` in prod)
- [ ] `save(run)` → `mkdirSync(recursive)` → write `<runId>.json.tmp` → `renameSync`;
      best-effort log-and-continue on disk error
- [ ] `load(runId)` / `list()` round-trip the record + events
- [ ] Unit tests (real-temp-dir): save→load round-trip, overwrite on re-save, `list`
      returns all, missing file → `null`. `npm test` passes
- [ ] Test count: 257 + ~5 = ~262 pass (no deletions)

**Tests**: unit (temp-dir)
**Gate**: quick (`npm test`)

---

### T5: `workflow-loader` (discover + validate + esbuild bundle) [P]

**What**: Discover workflow folders and load one `workflow.ts` into `{meta,run}` or
`{error}`.
**Where**: `src/main/workflow-loader.ts` (new), `src/main/workflow-loader.test.ts` (new)
**Depends on**: T1, T2
**Reuses**: `esbuild` (T2), real-temp-dir test pattern; pure-fn convention for
`validateMeta`
**Requirement**: WF2-01, WF2-02, WF2-03, WF2-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `discoverWorkflows(root)` → folder names; `[]` when root missing/empty (WF2-01)
- [ ] `validateMeta(mod)` (**pure**) → `{meta,run}` when a well-formed `meta` +
      async `run` are exported, else `{error}` (WF2-03/04)
- [ ] `loadWorkflow(folder)` bundles `<folder>/workflow.ts` with esbuild
      (`bundle:true, platform:'node', format:'esm', write:false, external:[builtins,'electron']`),
      writes a **unique** temp `.mjs`, `import(pathToFileURL)`, returns
      `validateMeta` result; transpile failure → `{error}` (WF2-02/03)
- [ ] Unit tests (temp-dir + real esbuild): valid fixture loads `{meta,run}`; broken
      (syntax error) → `{error}`; missing `run` → `{error}`; `discover` empty/missing
      → `[]`; a folder with a relative helper import bundles into one module
- [ ] Test count: 257 + ~7 = ~264 pass (no deletions)

**Tests**: unit (pure + temp-dir + real esbuild)
**Gate**: quick (`npm test`)

---

### T7: `workflow-ctx` (facade + `instrument` + primitives) [P]

**What**: `makeCtx(deps, runtime)` building the auto-logged, cancellable `ctx` facade.
**Where**: `src/main/workflow-ctx.ts` (new), `src/main/workflow-ctx.test.ts` (new)
**Depends on**: T1, T6
**Reuses**: worktree-manager fns (delegated via `deps`), `AdoGateway` method (T6),
injected-fake test pattern (`session-manager.test.ts`)
**Requirement**: WF2-05, WF2-06, WF2-07, WF2-09, WF2-10, WF2-11, WF2-14 (checkpoint)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `instrument(name, fn)` wrapper: `runtime.checkCancel()` (throws
      `CancellationError` if cancelled) → `runtime.emitStep(label)` → `await fn(...)`
- [ ] `ctx.worktree.create/remove/changedFiles` delegate to `deps.worktree.*` (WF2-05)
- [ ] `ctx.sh(cmd,{cwd,allowFail?})`: non-zero **throws** with `{code,stdout,stderr}`
      on the error; `allowFail` → returns `{code,stdout,stderr}`; zero → returns them
      (WF2-06)
- [ ] `ctx.git.fetch({cwd,remote?,branch?})` delegates to `deps.gitFetch`, propagates
      error (WF2-07)
- [ ] `ctx.ado.getTask(ref)` composes `deps.ado.getWorkItemWithRelations` + batch
      `deps.ado.getWorkItems` for children → `{task,children}`; **throws** on auth
      failure (WF2-08 consumer)
- [ ] `ctx.notify(msg,{toast?})` emits a log line; `toast` also calls
      `deps.notifier(...)` (WF2-09)
- [ ] `ctx.log(msg)` emits a log line; `ctx.step(label,fn)` nests child events under
      `label` (group id); `ctx.input` exposes frozen trigger values (WF2-10/11)
- [ ] Every `ctx.*` primitive auto-emits a `step-started` (WF2-10); a set token makes
      the next `ctx.*` throw `CancellationError` (WF2-14 checkpoint)
- [ ] Unit tests via injected-fake `CtxDeps` + recording `runtime`: delegation, sh
      throw/allowFail/zero, ado auth-throw + children compose, notify toast on/off,
      step nesting, cancellation-throws-at-next-call, auto-step emission. `npm test`
      passes
- [ ] Test count: 257 + ~14 = ~271 pass (no deletions)

**Tests**: unit (injected fake)
**Gate**: quick (`npm test`)

---

### T8: `workflow-manager` (DI orchestrator, serial, lifecycle)

**What**: The DI object-bag orchestrator: list, run (fail-fast, main process),
cancel, reload; single `apply()` choke-point (reduce→persist→emit).
**Where**: `src/main/workflow-manager.ts` (new), `src/main/workflow-manager.test.ts` (new)
**Depends on**: T3, T4, T5, T7
**Reuses**: `SessionManager` DI bag + `EmitFn` (`session-manager.ts:13,50`); `reduce`
(T3), store (T4), loader (T5), `makeCtx` (T7)
**Requirement**: WF2-01 (list/reload), WF2-13, WF2-14, WF2-15, WF2-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `constructor(private readonly deps)` bag: `{ workflowsRoot, loader, ctxDeps,
      store, emit, notifier }`
- [ ] `list()` → discover + load each; valid `{id,meta}` / broken `{id,error}`; a
      broken folder never blocks others (WF2-01/03)
- [ ] `run({id,input})`: **refuses** with a clear error if `activeRunId != null`
      (WF2-17); else `initialRun`→set active→`apply(run-started)`→`makeCtx` w/ fresh
      token→`await run(ctx)` in-process (WF2-13)→`done`; throw→`failed` capturing
      `error/stdout/code` (WF2-15); `CancellationError`→`cancelled` (WF2-14);
      `finally` clears `activeRunId`; **no rollback**
- [ ] `cancel(runId)` sets the token; `reload()` is a safe no-op stub
- [ ] private `apply(run,event)` = `reduce`→`store.save`→`emit(status|step|log)` in
      lockstep; timestamps stamped here (not in the reducer)
- [ ] Unit tests via injected fakes (loader stub, `ctxDeps` fakes, store on temp dir,
      recording `emit`): list valid+broken; run→done emits+persists ordered events;
      2nd concurrent run refused; run failure→`failed` with evidence; cancel→
      `cancelled`. `npm test` passes
- [ ] Test count: 257 + ~10 = ~281 pass (no deletions)

**Tests**: unit (injected fake + temp-dir)
**Gate**: full (`npm run typecheck && npm run lint && npm test`)

**Commit**: `feat(workflows-engine): DI workflow-manager (serial runner, lifecycle)`

---

### T9: IPC surface + main wiring + real `CtxDeps`/notifier

**What**: Add `workflows:*`/`workflow:*` to the contract and wire the manager +
real deterministic deps + `electron.Notification` into `index.ts`.
**Where**: `src/shared/ipc-contract.ts`, `src/main/index.ts` (modify)
**Depends on**: T8
**Reuses**: `handle`/`emit` wrappers (`ipc.ts:17,28`), the lazy `emitToWindow`
`EmitFn` (`index.ts:126`), worktree-manager fns, the git no-shell seam, a
spawn-with-shell runner for `ctx.sh`, `new AdoGateway()`
**Requirement**: WF2-18, WF2-09 (real Notification), WF2-07/06 (real git/sh impls)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `IpcContract` gains `workflows:list|run|cancel|reload` (req/res per design);
      `IpcEvents` gains `workflow:status|step|log` (each carries `runId`)
- [ ] `index.ts` constructs `WorkflowManager` with real `ctxDeps` (worktree fns; a
      no-shell `execFile('git',…)` fetch; a **shell** spawn for `ctx.sh` capturing
      code/stdout/stderr, WF2-D6; `new AdoGateway()`; a `notifier` firing
      `new Notification({title,body}).show()`) and the shared `emitToWindow`
- [ ] `handle('workflows:list'|'run'|'cancel'|'reload', …)` registered inside
      `whenReady`
- [ ] `npm run typecheck && npm run lint` clean; `npm test` still 281 (thin shell
      adds no unit tests, per matrix)
- [ ] Test count unchanged from T8: ~281 pass (no deletions)

**Tests**: none (thin OS/Electron shell — hand-verified; contract is typecheck-gated)
**Gate**: full (`npm run typecheck && npm run lint && npm test`)

**Commit**: `feat(workflows-engine): workflows:* IPC + main wiring + native toast`

---

### T10: Gate smoke — `scripts/smoke-workflow.mjs`

**What**: The WF2 end-to-end gate: drive `workflows:run` over CDP, assert `done` +
streamed events + a written run log.
**Where**: `scripts/smoke-workflow.mjs` (new)
**Depends on**: T9
**Reuses**: `smoke-create.mjs`/`smoke-agent.mjs` skeleton (poll 9222 → WS →
`Runtime.evaluate(window.api.invoke(...))` → `check()`)
**Requirement**: WF2-20

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Seeds a fixture `~/.playground/workflows/smoke-gate/workflow.ts` that
      `ctx.worktree.create` → `ctx.git.fetch` → `ctx.notify` on a scratch git repo
- [ ] Invokes `window.api.invoke('workflows:run',{id:'smoke-gate',input})`,
      subscribes to `workflow:step|log|status` via `window.api.on`, collects until
      `status==='done'`
- [ ] `check()`s the run-log file exists under `userData/workflow-runs/`
- [ ] Runs green in a live session: `node scripts/smoke-workflow.mjs` exits 0
      (owner-run manual gate; not CI)

**Tests**: manual (CDP smoke — not CI)
**Gate**: manual (`node scripts/smoke-workflow.mjs`, live session)

**Commit**: `feat(workflows-engine): end-to-end gate smoke over workflows:run`

---

## Parallel Execution Map

```
Phase 1 (Parallel — no deps):
    ├── T1 [P]  shared types
    ├── T2 [P]  esbuild → direct dep
    └── T6 [P]  ADO getWorkItemWithRelations

Phase 2 (Parallel — deps in Phase 1):
    T1 done → ├── T3 [P]  run-state reducer
              ├── T4 [P]  run-store
    T1+T2   → └── T5 [P]  workflow-loader
    T1+T6   →     T7 [P]  workflow-ctx

Phase 3 (Sequential):
    T3,T4,T5,T7 → T8  workflow-manager

Phase 4 (Sequential):
    T8 → T9 (IPC + wiring) → T10 (gate smoke)
```

> **4 phases → the Execute flow will offer one sub-agent per phase (offer-then-confirm).**

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: shared types | 1 file, type vocab | ✅ Granular |
| T2: esbuild dep | 1 config change | ✅ Granular |
| T3: reducer | 1 pure module | ✅ Granular |
| T4: run-store | 1 module | ✅ Granular |
| T5: loader | 1 module (discover+validate+load, cohesive) | ✅ Granular |
| T6: ADO method | 1 method + parse helper | ✅ Granular |
| T7: workflow-ctx | 1 cohesive facade module (shared `instrument`+`CtxDeps` bag) | ✅ Granular |
| T8: workflow-manager | 1 orchestrator module | ✅ Granular |
| T9: IPC + wiring | contract + `index.ts` shell (cohesive: one surface) | ✅ Granular |
| T10: gate smoke | 1 script | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| ---- | ----------------- | ------------- | ------ |
| T1 | None | Phase 1 root | ✅ Match |
| T2 | None | Phase 1 root | ✅ Match |
| T6 | None | Phase 1 root | ✅ Match |
| T3 | T1 | T1→T3 | ✅ Match |
| T4 | T1 | T1→T4 | ✅ Match |
| T5 | T1, T2 | T1+T2→T5 | ✅ Match |
| T7 | T1, T6 | T1+T6→T7 | ✅ Match |
| T8 | T3, T4, T5, T7 | T3,T4,T5,T7→T8 | ✅ Match |
| T9 | T8 | T8→T9 | ✅ Match |
| T10 | T9 | T9→T10 | ✅ Match |

All Phase-1 and Phase-2 `[P]` tasks are mutually independent (no `[P]` task depends
on another in the same phase). ✅

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Shared types | none | none | ✅ OK |
| T2 | Build config | none | none | ✅ OK |
| T6 | Main-process module (ADO ext) | unit | unit | ✅ OK |
| T3 | Main-process module (reducer) | unit | unit | ✅ OK |
| T4 | Main-process module (store) | unit | unit | ✅ OK |
| T5 | Main-process module (loader) | unit | unit | ✅ OK |
| T7 | Main-process module (ctx) | unit | unit | ✅ OK |
| T8 | Main-process module (manager) | unit | unit | ✅ OK |
| T9 | Thin Electron shell + contract | none (hand-verified) | none | ✅ OK |
| T10 | Out-of-CI smoke | manual | manual | ✅ OK |

No violations — every logic-bearing module carries co-located unit tests in the same
task; `none` is used only where the matrix says `none` (types, thin shell, build
config, manual smoke). ✅

---

## Coverage Summary

10 tasks cover all 20 requirements (WF2-01..20). Expected end state:
**257 → ~281 tests** (+~50 across T3–T8; estimates, executor confirms), 22 → ~28
files, all green; plus the manual gate smoke (T10) green in a live session.
