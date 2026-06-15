# Worktree Name Template — Tasks

Atomic, dependency-ordered. Each task is one commit. Gate after each code task:
`npm run typecheck && npm run lint && npm test`.

| #  | Task | Files | Depends | Requirement | Status |
| -- | ---- | ----- | ------- | ----------- | ------ |
| T1 | `worktreeNameFor` + templated `worktreePathFor` + `DEFAULT_WORKTREE_TEMPLATE`; default reproduces `<repo>-<branch>` | `src/shared/worktrees.ts` | - | WTNT-01 | Done |
| T2 | Unit tests: placeholder table, `{id}` extraction, empty-render, default/blank fallback, idempotence | `src/main/worktree-manager.test.ts` | T1 | WTNT-01 | Done |
| T3 | Global `worktreeTemplate` config field + default | `src/shared/config.ts` | - | WTNT-02 | Done |
| T4 | `.app/config.json` reader returns both templates; rename `workspaceBranchTemplate`→`workspaceTemplates` (read file once) + tests | `src/main/workspace-config.ts`, `src/main/workspace-config.test.ts` | - | WTNT-03 | Done |
| T5 | IPC: `worktrees:create` req gains `worktreeTemplate?`; `workspaces:branch-template`→`workspaces:templates` returning `{branchTemplate,worktreeTemplate}` | `src/shared/ipc-contract.ts` | T3,T4 | WTNT-02/03 | Done |
| T6 | Main wiring: templates handler; `createWorktree` takes + applies `worktreeTemplate`, empty-render guard | `src/main/index.ts`, `src/main/worktree-manager.ts` | T1,T5 | WTNT-01/04 | Done |
| T7 | Settings dialog: worktree-template field, load/save `ado.worktreeTemplate` | `src/renderer/src/components/SettingsDialog.tsx` | T3 | WTNT-02 | Done |
| T8 | Dialogs: effective worktree template (global prop + workspace override), templated preview, empty-render disables create, pass `worktreeTemplate` in create; App threads the global value | `App.tsx`, `NewWorktreeDialog.tsx`, `StartWorkDialog.tsx` | T5,T6 | WTNT-01/03/04 | Done |
| T9 | Gate green end-to-end; update STATE/ROADMAP/traceability | `.specs/**` | T1–T8 | all | Done |

Statuses flip to Done as commits land.
