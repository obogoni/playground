# Remove Workflows and Board Specification

## Problem Statement

O Playground carrega duas direções que o owner não usa: **Workflows** (motor de execução de `workflow.ts`
com passo de agente headless, servidor MCP de resultado, bloqueio/retomada, histórico de runs e a UI de
timeline) e **Board** (grade de cards de worktree com a faixa de tasks fixadas). Elas custam manutenção,
tamanho de bundle e três dependências de runtime (`esbuild`, `@modelcontextprotocol/sdk`, `ajv`) sem
entregar nada. A remoção deixa o app com Tree, Agents, Files e Hours.

## Goals

- [ ] A barra superior oferece exatamente Tree, Agents, Files e Hours (RMV-01..04)
- [ ] Nenhum código, canal IPC, script ou dependência de Workflows resta no repositório (RMV-10..18)
- [ ] Um config salvo com a direção `board` ou `workflows` abre o app na Tree, sem erro (RMV-05..06)
- [ ] `typecheck`, `lint` e `test` passam ao fim de cada task

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Apagar `~/.playground/workflows` e `<userData>/workflow-runs` do disco do usuário | São dados do usuário; o app só para de lê-los. Apagar é irreversível e não traz ganho |
| Remover `TaskBoard` (`src/main/task-board.ts`) | É o backend das tasks fixadas (painel de tasks, Hours, link de sessão), não da guia Board. Fica com o nome atual |
| Remover os `.specs/features/workflows-*` e `board-direction` | São o histórico das decisões (AD-006..012 citam esses caminhos). Ficam como registro |
| Reescrever ADs antigos | O STATE ganha um AD novo que registra a remoção; os antigos ficam como estão |
| `.specs/features/ado-triggers/` (não versionado) | Feature independente, não toca Workflows nem Board |
| `SessionNamePoller` e o `spawnAgent` de `index.ts` | Continuam em uso pelas sessões; só os tipos `AgentSpawn`/`AgentChild` mudam de módulo |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Direção persistida que não existe mais | `ConfigStore` troca qualquer `ui.direction` fora de `tree`/`agents`/`files`/`hours` por `tree` ao carregar | Sem isso o `else` final do switch de `App.tsx` renderizaria nada (ou quebraria) para quem fechou o app na Board/Workflows | n |
| Onde moram `AgentSpawn`/`AgentChild` depois | Novo módulo `src/main/agent-spawn.ts` com só os tipos | `session-name-poller.ts` e `index.ts` dependem deles; `agent-step-runner.ts` sai inteiro | n |
| Toast do sistema com `runId` (`workflow:focus-run`) | `notifier` sai; o `showOs` permanece para as notificações de sessão | O único chamador com `runId` era o `WorkflowManager` | n |
| Seção do README "Board view", screenshot `docs/screenshots/board.png` e a menção a "workflows" na seção de init de worktree | Removidas | Documentariam recursos inexistentes | n |
| `design/handoff/DESIGN_HANDOFF_WORKFLOWS.md` | Removido | Fonte visual de uma UI que deixa de existir | n |
| Scripts de smoke e fixtures (`smoke-workflow`, `smoke-agent-workflow`, `smoke-blocker-resume`, `smoke-board`, `scripts/fixtures/*/workflow.ts`, `scripts/wf1-spike/`) | Removidos | Exercitam só os recursos removidos | n |
| Ícone `workflow-nodes` em `Icon.tsx` | Removido | Só `TopBar` (segmento Workflows) e os componentes de Workflows o usam | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Board removida ⭐ MVP

**User Story**: As the owner, I want the Board tab gone so that the top bar only shows views I use.

**Why P1**: Pedido direto do owner.

**Acceptance Criteria**:

1. The top bar SHALL render exactly four direction segments, in the order Tree, Agents, Files, Hours. <!-- RMV-01 -->
2. The type `AppConfig['ui']['direction']` SHALL be `'tree' | 'agents' | 'files' | 'hours'`. <!-- RMV-02 -->
3. The repository SHALL contain no `BoardView` component, `BoardView.css` or `scripts/smoke-board.mjs`. <!-- RMV-03 -->
4. The README SHALL contain no "Board view" section and no reference to `docs/screenshots/board.png`, and that file SHALL not exist. <!-- RMV-04 -->
5. WHEN the config file holds `"direction": "board"` THEN the `ConfigStore` SHALL load `ui.direction` as `'tree'`. <!-- RMV-05 -->
6. WHEN the config file holds `"direction": "workflows"` THEN the `ConfigStore` SHALL load `ui.direction` as `'tree'`. <!-- RMV-06 -->
7. WHEN the config file holds a valid direction (`tree`, `agents`, `files` or `hours`) THEN the `ConfigStore` SHALL load it unchanged. <!-- RMV-07 -->

**Independent Test**: config-store tests for the three loads; open the app and see four segments.

---

### P1: Workflows removidos ⭐ MVP

**User Story**: As the owner, I want every Workflows feature removed so that the app carries no unused engine, IPC surface or dependency.

**Why P1**: Pedido direto do owner.

**Acceptance Criteria**:

1. The renderer SHALL contain no `WorkflowsView`, `RunDetail`, `NewWorkflowDialog`, `WorkflowTriggerDialog`, `use-workflow-runs` or `workflow-run-view` module. <!-- RMV-10 -->
2. The main process SHALL contain no `workflow-ctx`, `workflow-loader`, `workflow-manager`, `workflow-run-store`, `workflow-scaffold`, `run-state`, `agent-step-runner`, `mcp-result-server` or `emit-result-schema` module. <!-- RMV-11 -->
3. The IPC contract SHALL declare no `workflows:*` invoke channel and no `workflow:*` event. <!-- RMV-12 -->
4. The repository SHALL contain no `src/shared/workflows.ts`. <!-- RMV-13 -->
5. `package.json` SHALL list none of `esbuild`, `@modelcontextprotocol/sdk` or `ajv` as a direct dependency. <!-- RMV-14 -->
6. The main process SHALL not create, read or write `~/.playground/workflows` or `<userData>/workflow-runs`. <!-- RMV-15 -->
7. The repository SHALL contain no `scripts/smoke-workflow.mjs`, `scripts/smoke-agent-workflow.mjs`, `scripts/smoke-blocker-resume.mjs`, `scripts/fixtures/*/workflow.ts` or `scripts/wf1-spike/`. <!-- RMV-16 -->
8. The repository SHALL contain no `design/handoff/DESIGN_HANDOFF_WORKFLOWS.md`. <!-- RMV-17 -->
9. A case-insensitive search for `workflow` in `src/`, `README.md` and `package.json` SHALL return zero matches. <!-- RMV-18 -->

**Independent Test**: `npm run typecheck && npm run lint && npm test` green; `rg -i workflow src README.md package.json` empty.

---

### P1: Recursos que ficam continuam funcionando ⭐ MVP

**User Story**: As the owner, I want sessions, pinned tasks, worktree creation and notifications to keep working after the removal.

**Why P1**: A remoção não pode quebrar o que é usado.

**Acceptance Criteria**:

1. The `SessionNamePoller` SHALL keep receiving the same `spawnAgent` seam, typed by `AgentSpawn`/`AgentChild` from `src/main/agent-spawn.ts`. <!-- RMV-20 -->
2. The `tasks:*` IPC channels and the `TaskBoard` class SHALL remain unchanged. <!-- RMV-21 -->
3. The full existing test suite, minus the deleted modules' own tests, SHALL pass. <!-- RMV-22 -->
4. `npm run build` SHALL succeed. <!-- RMV-23 -->

**Independent Test**: suite + build green; open the app, pin a task, start a session.

---

## Edge Cases

- IF the config file holds a direction that never existed (e.g. `"direction": "kanban"`) THEN the `ConfigStore` SHALL load `ui.direction` as `'tree'` (covered by the same rule as RMV-05).
- IF `ui.direction` is absent THEN the `ConfigStore` SHALL load the default `'tree'` (existing behavior).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| RMV-01 | P1: Board removida | T2, T3 | Implemented |
| RMV-02 | P1: Board removida | T2, T3 | Implemented |
| RMV-03 | P1: Board removida | T2 | Implemented |
| RMV-04 | P1: Board removida | T2 | Implemented |
| RMV-05 | P1: Board removida | T1 | Implemented |
| RMV-06 | P1: Board removida | T1 | Implemented |
| RMV-07 | P1: Board removida | T1 | Implemented |
| RMV-10 | P1: Workflows removidos | T3 | Implemented |
| RMV-11 | P1: Workflows removidos | T4 | Implemented |
| RMV-12 | P1: Workflows removidos | T4 | Implemented |
| RMV-13 | P1: Workflows removidos | T4 | Implemented |
| RMV-14 | P1: Workflows removidos | Tasks | Pending |
| RMV-15 | P1: Workflows removidos | T4 | Implemented |
| RMV-16 | P1: Workflows removidos | Tasks | Pending |
| RMV-17 | P1: Workflows removidos | Tasks | Pending |
| RMV-18 | P1: Workflows removidos | Tasks | Pending |
| RMV-20 | P1: Recursos que ficam | T4 | Implemented |
| RMV-21 | P1: Recursos que ficam | T4 | Implemented |
| RMV-22 | P1: Recursos que ficam | Tasks | Pending |
| RMV-23 | P1: Recursos que ficam | Tasks | Pending |

**Coverage:** 20 total, 0 mapped to tasks, 20 unmapped ⚠️ (tasks next)

---

## Success Criteria

- [ ] Top bar shows Tree, Agents, Files, Hours
- [ ] `rg -i workflow src README.md package.json` returns nothing
- [ ] typecheck, lint, test and build green
