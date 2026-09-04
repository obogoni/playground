# Branch Template Aninhado — Design

**Spec**: `.specs/features/branch-template-nested/spec.md`
**Status**: Draft

---

## Architecture Overview

Three seams, all additive, none touching the worktree lifecycle:

1. **Pure parse/render** (`src/shared/tasks.ts`) — `taskIdFromBranch` reads the last path segment; `branchNameFor` gains an optional context parameter (`{devAlias, parent}`) rendering `{dev}`/`{usId}`/`{usSlug}`. Both stay pure and unit-tested.
2. **Parent resolution** (`src/main/ado-gateway.ts` + `src/shared/ipc-contract.ts` + `src/main/index.ts`) — the gateway exposes `parentRefs` (Hierarchy-Reverse) and a `parentOf(ref)` helper; a new `tasks:parent` IPC serves the Start-work dialog. Failures degrade to `null`, never throw to the renderer.
3. **Dialog wiring** (`src/renderer/src/components/StartWorkDialog.tsx` + `App.tsx`) — on open, resolves the parent once and re-renders the branch prefill from the effective template, without overwriting a user-edited field.

```mermaid
graph TD
    U[User opens Start-work on a pinned Task] --> D[StartWorkDialog]
    D -->|tasks:parent {id,org,project}| H[tasks:parent handler]
    H --> G[AdoGateway.parentOf]
    G -->|getWorkItemWithRelations| ADO[(ADO REST)]
    G -->|getWorkItems parentRefs| ADO
    G -->|parent {id,title} | null| H
    H --> D
    D -->|branchNameFor task, template, ctx{devAlias,parent}| B[shared/tasks]
    B -->|nested branch| D
    D -->|worktrees:create| W[worktree-manager]
```

---

## Approach Exploration — where the parent US is resolved

All three deliver the same spec outcome (dialog pre-fills the nested branch from Task + parent US + alias). They differ in who fetches and when.

| | Approach A — on-demand gateway + `tasks:parent` IPC | Approach B — enrich the pin/refresh flow | Approach C — manual prefill (no ADO) |
| --- | --- | --- | --- |
| Fetch | One `parentOf(ref)` call when the dialog opens | Every `tasks:refresh` fetches a parent per pin | none |
| Surfaces touched | `ado-gateway`, `ipc-contract`, `index.ts`, dialog | `task-board`, `tasks:*` snapshot, dialog | dialog only |
| Extra IPC | 1 new channel | 0 (parent rides in snapshot) | 0 |
| Degradation | `null` per dialog open | stale/absent until next refresh | never filled |
| Testability | pure + gateway fakeFetch | TaskBoard stub + gateway | pure only |
| Blast radius | additive, isolated | touches persisted snapshot shape + refresh loop | none (but fails the goal) |

**Recommendation: Approach A.** It matches the spec's own PARENT-02 wording ("WHEN the dialog requests the parent…"), is fully additive (no change to the pinned-task snapshot contract), keeps the parent lookup lazy (no N+1 on every refresh), and is unit-testable at both the gateway (fakeFetch) and pure layers. Approach B couples parent data into the persisted `TasksSnapshot` shape for a value the dialog alone consumes. Approach C fails the generation story.

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --------- | -------- | ---------- |
| `taskIdFromBranch` / `branchNameFor` | `src/shared/tasks.ts` | Extend in place — they are the pure core (STWK-01 precedent) |
| `slugOf` / `branchTypeOf` | `src/shared/tasks.ts` | Reuse verbatim for `{usSlug}` and existing `{type}` |
| Segment sanitizer | `src/shared/tasks.ts` (`split('/').map(trim).filter(!== '')`) | Already drops empty segments — the "placeholders empty → segment removed" behavior needs no new code |
| `getWorkItemWithRelations` | `src/main/ado-gateway.ts` | Extend to also map `parentRefs`; `parentOf` composes it with `getWorkItems` |
| `parseChildRefs` pattern | `src/main/ado-gateway.ts` | Mirror as `parseParentRefs` (Hierarchy-Reverse) |
| `fetchWithTimeout` + token cache + auth-degrade | `src/main/ado-gateway.ts` | `parentOf` reuses all; auth failure already degrades to `{ok:false,reason:'auth'}` |
| IPC contract + `handle()` | `src/shared/ipc-contract.ts`, `src/main/ipc.ts` | Add one channel, follow the typed-channel pattern |
| Task dialog async re-prefill | `src/renderer/src/components/StartWorkDialog.tsx` (`useEffect` on workspace override) | Same pattern for the parent resolution: refill only while `!branchEdited` |

### Integration Points

| System | Integration Method |
| ------ | ------------------ |
| ADO REST | Existing `AdoGateway` — one more `parentOf` method, no new endpoint beyond the already-used `$expand=Relations` |
| Renderer ↔ main | New `tasks:parent` channel in `IpcContract` |

---

## Components

### `shared/tasks.ts` — parse/render core (extended)

- **Purpose**: Recover the Task id from the last branch segment; render `{dev}`/`{usId}`/`{usSlug}` placeholders.
- **Location**: `src/shared/tasks.ts`
- **Interfaces**:
  - `taskIdFromBranch(branch: string): number | null` — split on `/`, take the last **non-empty** segment, return its first standalone 2+ digit number or `null`. Behavior change: the number comes from the last segment, not the first in the whole branch (BRANCH-01..06).
  - `branchNameFor(task: { id: number; details: WorkItemDetails }, template: string | null, ctx?: { devAlias?: string; parent?: { id: number; title: string } }): string` — new optional `ctx`; renders `{dev}` ← `devAlias`, `{usId}` ← `parent.id`, `{usSlug}` ← `slugOf(parent.title)`. Existing `{type}`/`{id}`/`{slug}` untouched; unknown placeholders still pass through literally (TEMPLATE-01..06).
- **Dependencies**: `WorkItemDetails` type.
- **Reuses**: `slugOf`, `branchTypeOf`, the existing segment sanitizer.

### `shared/config.ts` — `ado.devAlias`

- **Purpose**: Global hand-edited alias for the `{dev}` placeholder.
- **Location**: `src/shared/config.ts`
- **Interfaces**: `AppConfig.ado.devAlias: string` (default `''`), added to `DEFAULT_CONFIG.ado`. Not in `WorkspaceTemplates` (alias is global — CONFIG-01..03).
- **Dependencies**: none.
- **Reuses**: existing `ado` block shape.

### `main/ado-gateway.ts` — parentRefs + `parentOf`

- **Purpose**: Expose the parent (US) of a work item.
- **Location**: `src/main/ado-gateway.ts`
- **Interfaces**:
  - `parseParentRefs(relations, ref): WorkItemRef[]` — pure; maps `System.LinkTypes.Hierarchy-Reverse` links (PARENT-01).
  - `getWorkItemWithRelations(ref, fetchFn)` — result gains `parentRefs: WorkItemRef[]` (besides existing `childRefs`) (PARENT-01).
  - `parentOf(ref): Promise<ParentOfResult>` — composes `getWorkItemWithRelations` + `getWorkItems(parentRefs)`; returns the **first** parent as `{ id, title }`, or `null` when there is no parent; `{ok:false, reason:'auth'}` on auth failure, and a `null` parent on any other read failure (PARENT-02..05).
- **Dependencies**: `getToken`, `fetchWithTimeout`, `getWorkItems`.
- **Reuses**: token cache, auth-degrade path, `refKey`, groupByProject.
- **Type**: `ParentOfResult = { ok: true; parent: { id: number; title: string } | null } | { ok: false; reason: 'auth'; error: string }`.

### `shared/ipc-contract.ts` + `main/index.ts` — `tasks:parent` channel

- **Purpose**: Serve the parent lookup to the renderer.
- **Location**: `src/shared/ipc-contract.ts`, `src/main/index.ts`
- **Interfaces**:
  - `'tasks:parent': { req: { id: number; org: string; project: string }; res: ParentOfResult }`
  - Handler: `handle('tasks:parent', (ref) => adoGateway.parentOf(ref))` — the gateway instance is hoisted to a shared `const` next to `TaskBoard` (today it is inlined).
- **Dependencies**: `AdoGateway`.
- **Reuses**: `handle()` typed wrapper.

### `renderer/.../StartWorkDialog.tsx` — parent-aware prefill

- **Purpose**: Resolve the pinned task's parent US on open and pre-fill the branch from the effective template + `{devAlias, parent}`.
- **Location**: `src/renderer/src/components/StartWorkDialog.tsx`
- **Interfaces**:
  - New prop `devAlias: string`.
  - New state `parent: { id: number; title: string } | null` (and a resolution flag).
  - `useEffect` on open (and on repo-switch / task change): `api.invoke('tasks:parent', { id, org, project })` → `setParent(result.ok ? result.parent : null)`; re-run `branchNameFor({id, details}, effectiveTemplate, { devAlias, parent })` **only while `!branchEdited.current`** (DIALOG-01..04).
- **Dependencies**: `api` (IPC), `branchNameFor`, `worktreePathFor`.
- **Reuses**: the existing workspace-override `useEffect` re-prefill pattern; the `branchEdited` guard already exists.

### `renderer/src/App.tsx` — devAlias plumbing

- **Purpose**: Load `ado.devAlias` and pass it down.
- **Location**: `src/renderer/src/App.tsx`
- **Interfaces**: `useState<string> devAlias`; set from `config.ado.devAlias` in the config-load effect and the Settings `onSaved`; pass `devAlias={devAlias}` to `StartWorkDialog`.
- **Dependencies**: none new.
- **Reuses**: existing config-load + Settings-save wiring.

---

## Data Models

```typescript
/** Parent of a pinned work item, as served to the renderer (IPC + branchNameFor ctx). */
interface ParentOfResult =
  | { ok: true; parent: { id: number; title: string } | null }
  | { ok: false; reason: 'auth'; error: string }
```

**Relationships**: derived from ADO `Hierarchy-Reverse`; not persisted — resolved per dialog open.

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| -------------- | -------- | ----------- |
| Task has no parent (root task / pinned US itself) | `parentOf` returns `parent: null` | `{usId}`/`{usSlug}` render empty → segment dropped; branch degrades to `user/<dev>/<task-id>-<slug>` |
| ADO auth failure | `parentOf` returns `{ok:false, reason:'auth'}`; dialog treats as `null` | Same degradation; no throw, no blocking |
| ADO read failure/timeout on the parent batch | `parentOf` returns `parent: null` (skip absent items) | Same degradation |
| User edited the branch before parent resolved | `branchEdited.current` guard skips re-prefill | User's text preserved; template never re-applies (DIALOG-03) |
| Empty `devAlias` / whitespace | `{dev}` renders `''` → segment dropped | Branch starts at `user/...` without an alias segment |

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| ------- | -------------------- | ------ | ---------- |
| `taskIdFromBranch` re-interprets multi-number branches | `src/shared/tasks.ts:40` | `feature/123-fix-456` flips 123 → 456 | Logged in spec (BRANCH-04); the rule is now "last segment", which is what the nested format needs; legacy single-id branches are byte-identical |
| `getWorkItemWithRelations` consumers (`workflow-ctx`) shape | `src/main/workflow-ctx.ts:294` | Adding `parentRefs` to the result is additive — existing consumers ignore it | Keep it additive; no consumer change needed (PARENT-01) |
| Dialog prefill race (parent resolves after user edits) | `StartWorkDialog.tsx` | Overwriting a user-typed branch | Reuse the existing `branchEdited` ref guard — the exact pattern already used for the workspace-override re-prefill |
| Parent is a Feature/Epic, not a US | ADO nesting | `{usId}`/`{usSlug}` carry the immediate parent | Spec assumption logged; immediate parent wins (PARENT-05) |
| Dev alias is global only | `config.ts` | No per-repo alias | Spec out-of-scope (workspace alias deferred) |

---

## Tech Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Parent resolution approach | **Approach A** — on-demand `parentOf` + `tasks:parent` IPC | Additive, lazy, no snapshot-contract change, testable with fakeFetch |
| `taskIdFromBranch` rule | Number in the **last non-empty segment** | Nested format puts the leaf (Task) id last; legacy single-id format is unchanged |
| Template for the nested format | `user/{dev}/{usId}-{usSlug}/{id}-{slug}` | `{usSlug}` (parent title) must be distinct from `{slug}` (task title) |
| `branchNameFor` signature | Optional `ctx` param, not a breaking change | Existing callers/tests compile unchanged |
| `parentOf` result | `{ id, title }` (no type/state) | Template only needs id + title; keeps the IPC payload minimal |

> **Project-level decision?** None of these set a cross-feature convention beyond what the spec already pins. No new `AD-NNN` entry required. The `taskIdFromBranch` rule change is recorded in the spec's Assumptions (already confirmed), not a new AD.
