# Remove Workflows and Board Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path.

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/remove-workflows-board/spec.md`
**Design**: skipped (deletion, no architectural decision)
**Status**: In Progress

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec. Guidelines found: `vitest.config.ts` (report-only coverage, AD-003; renderer components are hand-verified by convention), `.github/workflows/ci.yml` (`typecheck && lint && test`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main logic (`config-store`) | unit | 1:1 to spec ACs (RMV-05..07) + edge case | `src/main/*.test.ts` | `npm test` |
| Renderer components / wiring | none | build gate only (hand-verified convention) | - | build gate |
| Deleted modules | none | their own tests go with them; remaining suite stays green | - | build gate |
| Scripts / deps / docs | none | build gate only | - | build gate |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Unit-test-only task | `npx vitest run src/main/config-store.test.ts` |
| Full | n/a (no e2e/integration layer) | `npm test` |
| Build | Every removal task, last of each phase | `npm run typecheck && npm run lint && npm test` |

---

## Execution Plan

### Phase 1: Removal

Board first, then the Workflows UI, engine and deps; each step leaves the build green.

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Docs

```
T6
```

---

## Task Breakdown

### T1: Fallback de direção removida no ConfigStore

**What**: `ConfigStore.load()` troca `ui.direction` fora de `tree`/`agents`/`files`/`hours` por `'tree'`.
**Where**: `src/main/config-store.ts` (+ `src/main/config-store.test.ts`)
**Depends on**: None
**Reuses**: `DEFAULT_CONFIG.ui.direction`
**Requirement**: RMV-05, RMV-06, RMV-07

**Done when**:

- [x] Tests: `board` → `tree`, `workflows` → `tree`, unknown → `tree`, each valid direction unchanged
- [x] Gate passes

**Tests**: unit
**Gate**: quick

---

### T2: Remover a guia Board

**What**: Remove o segmento Board, `BoardView`, o valor `'board'` da direção, `smoke-board.mjs`, a seção do README e o screenshot.
**Where**: `src/renderer/src/components/BoardView.tsx` (delete; plus `TopBar.tsx`, `App.tsx`, `shared/config.ts`, `status-bar.test.ts`, README)
**Depends on**: T1
**Reuses**: -
**Requirement**: RMV-01 (partial), RMV-02 (partial), RMV-03, RMV-04

**Done when**:

- [x] No `BoardView`/`'board'` reference left in `src/`
- [x] Build gate passes

**Tests**: none
**Gate**: build

---

### T3: Remover a UI de Workflows

**What**: Remove `WorkflowsView`, `RunDetail`, `NewWorkflowDialog`, `WorkflowTriggerDialog`, `use-workflow-runs`, `workflow-run-view` (+ test), o ícone `workflow-nodes`, o segmento e o valor `'workflows'` da direção.
**Where**: `src/renderer/src/components/WorkflowsView.tsx` (delete; plus the listed renderer modules, `TopBar.tsx`, `App.tsx`, `Icon.tsx`, `shared/config.ts`, `status-bar.test.ts`)
**Depends on**: T2
**Reuses**: -
**Requirement**: RMV-01, RMV-02, RMV-10

**Done when**:

- [x] Top bar renders Tree, Agents, Files, Hours
- [x] Build gate passes

**Tests**: none
**Gate**: build

---

### T4: Remover o motor de Workflows do main

**What**: Remove os módulos `workflow-*`, `run-state`, `agent-step-runner`, `mcp-result-server`, `emit-result-schema`, `shared/workflows.ts`, os canais IPC, a wiring em `index.ts`; move `AgentSpawn`/`AgentChild` para `agent-spawn.ts`.
**Where**: `src/main/index.ts` (plus the deleted modules, `src/main/agent-spawn.ts`, `src/shared/ipc-contract.ts`, `src/main/session-name-poller*.ts`)
**Depends on**: T3
**Reuses**: -
**Requirement**: RMV-11, RMV-12, RMV-13, RMV-15, RMV-20, RMV-21

**Done when**:

- [ ] `rg -i workflow src` returns nothing
- [ ] Build gate passes

**Tests**: none
**Gate**: build

---

### T5: Remover dependências e scripts de Workflows

**What**: Tira `esbuild`, `@modelcontextprotocol/sdk` e `ajv` do `package.json`/lockfile e apaga os smokes, fixtures, `wf1-spike` e o handoff de design.
**Where**: `package.json` (plus `package-lock.json`, `scripts/`, `design/handoff/DESIGN_HANDOFF_WORKFLOWS.md`, `vitest.config.ts` comment)
**Depends on**: T4
**Reuses**: -
**Requirement**: RMV-14, RMV-16, RMV-17, RMV-18, RMV-22, RMV-23

**Done when**:

- [ ] `npm run build` passes
- [ ] Build gate passes

**Tests**: none
**Gate**: build

---

### T6: Registrar a remoção no STATE

**What**: AD-065 em `.specs/STATE.md` registrando a remoção e o fallback da direção.
**Where**: `.specs/STATE.md`
**Depends on**: None
**Reuses**: -
**Requirement**: -

**Done when**:

- [ ] AD-065 present

**Tests**: none
**Gate**: build
