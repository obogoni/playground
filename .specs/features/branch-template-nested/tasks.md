# Branch Template Aninhado — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/branch-template-nested/design.md`
**Status**: Done

---

## Test Coverage Matrix

> Generated from codebase + `.specs/codebase/TESTING.md` + `.specs/project/PROJECT.md` - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (unit for main deep modules + pure helpers; renderer + thin shells hand-verified), `.specs/project/PROJECT.md` (§Testing, §Testing Decisions), `ci.yml` (gate = `typecheck && lint && test` on windows-latest).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Shared pure logic (`shared/tasks.ts` — `taskIdFromBranch`, `branchNameFor`) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `src/shared/tasks.test.ts` | `npm test` |
| Main-process deep module (`main/ado-gateway.ts` — parseParentRefs, parentRefs, parentOf) | unit | All branches: parent present / absent / auth-fail / multi-parent / no-details; relations mapping (forward preserved) | `src/main/ado-gateway.test.ts` | `npm test` |
| Entity / config (`shared/config.ts` — `ado.devAlias` field + default) | none | Build gate only; behavior of empty `{dev}` covered in `tasks.test.ts` | - | `npm run typecheck` |
| Thin IPC shell (`shared/ipc-contract.ts` channel + `main/index.ts` handler) | none | Type contract + hand-verified wiring | - | `npm run typecheck` |
| Renderer React components (`StartWorkDialog.tsx`, `App.tsx`) | none | CDP smoke + visual pass, per project renderer convention | - | manual `node scripts/smoke-*.mjs` |

## Gate Check Commands

> Generated from codebase - confirm before Execute. Baseline anchored to the current run: **645 tests / 44 files, all passing** (`npm test`).

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | Before opening a PR / after a logic-bearing task | `npm run typecheck && npm run lint && npm test` |
| Build | After phase completion / config-only tasks | `npm run typecheck` (renderer + node projects) |
| Manual | User-facing renderer behavior not unit-testable | `npm run dev -- -- --remote-debugging-port=9222` + `node scripts/smoke-*.mjs` (live session) |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Foundation (shared parse/render + config)

```
T1 -> T2
```

T3 is independent (no arrows; runs after T2 in phase order).

### Phase 2: ADO gateway + IPC

```
T4 -> T5 -> T6
```

### Phase 3: Renderer wiring

```
T7 -> T8
```

T8 also depends on T3 (Phase 1 — backward only):

---

## Task Breakdown

### T1: `taskIdFromBranch` reads the last path segment — ✅ Complete

**What**: Change `taskIdFromBranch` to extract the first standalone 2+ digit number from the **last non-empty** `/`-separated segment of the branch (was: first standalone number in the whole branch). Single-id formats stay byte-identical; multi-number branches re-interpret to the last segment's number.
**Where**: `src/shared/tasks.ts` + `src/shared/tasks.test.ts`
**Depends on**: None
**Reuses**: existing standalone-number regex `/(?<![A-Za-z0-9])\d{2,}(?![A-Za-z0-9])/`
**Requirement**: BRANCH-01, BRANCH-02, BRANCH-03, BRANCH-04, BRANCH-05, BRANCH-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `taskIdFromBranch('user/jdoe/10001-user-story/10002-nested-branch')` → `10002`
- [ ] Legacy cases unchanged: `feature/4821-add-oauth-refresh-token-rotation` → `4821`, `bugfix/12-fix-login` → `12`, `user/otavio/4821-quick-spike` → `4821`, bare `4821` → `4821`
- [ ] `feature/123-fix-456` → `123` (first standalone number in the last segment `123-fix-456`; behavior unchanged per BRANCH-04)
- [ ] No-number / adjacent-digit / single-digit last segments → `null` (`main`, `feature/dark-mode`, `oauth2-rework`, `(detached abc1234)`, `feature/sso2024migration`, `v2.0-cleanup`)
- [ ] Trailing/duplicated slashes tolerated: `feature/4821/` → `4821` (last non-empty segment)
- [ ] Gate check passes: `npm test` → **645 + ~8 new = ~653** tests pass
- [ ] Test count: ~8 new tests in `tasks.test.ts` (no deletions except the `feature/123-fix-456` expectation update)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shared): recover task id from the last branch segment`

---

### T2: `branchNameFor` renders `{dev}`/`{usId}`/`{usSlug}` — ✅ Complete

**What**: Add an optional third parameter `ctx?: { devAlias?: string; parent?: { id: number; title: string } }` to `branchNameFor`. Render `{dev}` ← `devAlias`, `{usId}` ← `parent.id`, `{usSlug}` ← `slugOf(parent.title)`. Existing `{type}`/`{id}`/`{slug}` untouched; unknown placeholders still pass through literally; empty placeholders produce segments the existing sanitizer drops.
**Where**: `src/shared/tasks.ts` + `src/shared/tasks.test.ts`
**Depends on**: T1 (same file)
**Reuses**: `slugOf`, `branchTypeOf`, the existing `split('/').map(trim).filter(!== '')` segment sanitizer
**Requirement**: TEMPLATE-01, TEMPLATE-02, TEMPLATE-03, TEMPLATE-04, TEMPLATE-05, TEMPLATE-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Full context + template `user/{dev}/{usId}-{usSlug}/{id}-{slug}` → `user/jdoe/10001-user-story/10002-nested-branch`
- [ ] No parent → `user/jdoe/10002-nested-branch` (parent segment dropped)
- [ ] No alias → `user/10001-user-story/10002-nested-branch` (alias segment dropped)
- [ ] No context → legacy templates byte-identical to today (default `{type}/{id}-{slug}`, custom `task/{id}`, `{id}-{slug}`)
- [ ] Unknown placeholders pass through literally: `'{user}/{id}-{slug}'` → `{user}/3-thing`
- [ ] `{usSlug}` slugifies (lowercase, accents, symbol collapse) — e.g. `'User story'` → `user-story`
- [ ] `{devAlias}` whitespace-only renders empty (segment dropped)
- [ ] Gate check passes: `npm test` → **653 + ~8 new = ~661** tests pass
- [ ] Test count: ~8 new tests in `tasks.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shared): render dev/usId/usSlug placeholders in branchNameFor`

---

### T3: `ado.devAlias` config field — ✅ Complete

**What**: Add `devAlias: string` to `AppConfig.ado` and default it to `''` in `DEFAULT_CONFIG.ado` (not in `WorkspaceTemplates` — global only).
**Where**: `src/shared/config.ts`
**Depends on**: None
**Reuses**: existing `ado` block shape
**Requirement**: CONFIG-01, CONFIG-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `AppConfig['ado']` includes `devAlias: string`
- [ ] `DEFAULT_CONFIG.ado.devAlias === ''`
- [ ] `WorkspaceTemplates` unchanged (alias is global)
- [ ] Gate check passes: `npm run typecheck` (node + web projects)
- [ ] No test change required — `{dev}` empty behavior is covered in T2

**Tests**: none
**Gate**: build

**Commit**: `feat(config): add ado.devAlias`

---

### T4: ADO gateway exposes `parentRefs` — ✅ Complete

**What**: Add pure `parseParentRefs(relations, ref): WorkItemRef[]` mapping `System.LinkTypes.Hierarchy-Reverse` links (mirror of `parseChildRefs`), and include `parentRefs` in the `GetWorkItemWithRelationsResult` returned by `getWorkItemWithRelations`. `childRefs` behavior unchanged.
**Where**: `src/main/ado-gateway.ts` + `src/main/ado-gateway.test.ts`
**Depends on**: None
**Reuses**: `parseChildRefs` shape, tail-id/org/project mapping
**Requirement**: PARENT-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `parseParentRefs` maps only `Hierarchy-Reverse` relations to refs (tail id, parent org/project), `[]` for `undefined`
- [ ] `getWorkItemWithRelations` result includes `parentRefs` alongside `childRefs` (existing forward+reverse fixture → `childRefs: [101,102]`, `parentRefs: [7]`)
- [ ] Existing `getWorkItemWithRelations` test updated to assert the new `parentRefs` field (contract growth)
- [ ] `childRefs` cases still pass (no relations → `[]`)
- [ ] Gate check passes: `npm test` → **661 + ~3 new = ~664** tests pass
- [ ] Test count: ~3 new tests; 1 existing expectation updated (additive field)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ado): expose hierarchy-reverse parent refs`

---

### T5: `AdoGateway.parentOf` resolves the parent US — ✅ Complete

**What**: Add `parentOf(ref: WorkItemRef): Promise<ParentOfResult>` to `AdoGateway` — calls `getWorkItemWithRelations`, then `getWorkItems(parentRefs)`, returns the **first** parent as `{ id, title }`, `null` when there is no parent or no resolvable details, and `{ ok: false, reason: 'auth', error }` on auth failure. Define the `ParentOfResult` type.
**Where**: `src/main/ado-gateway.ts` + `src/main/ado-gateway.test.ts`
**Depends on**: T4
**Reuses**: token cache, `fetchWithTimeout`, `getWorkItems`, auth-degrade path
**Requirement**: PARENT-02, PARENT-03, PARENT-04, PARENT-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `parentOf` with a parent returns `{ ok: true, parent: { id, title } }` (title from the parent's details)
- [ ] `parentOf` with no `Hierarchy-Reverse` relation returns `{ ok: true, parent: null }`
- [ ] `parentOf` with several parents returns the **first**
- [ ] `parentOf` on HTTP 401 returns `{ ok: false, reason: 'auth', error }` and clears the cached token
- [ ] `parentOf` when the parent's details batch omits the item returns `{ ok: true, parent: null }` (errorPolicy=omit degradation)
- [ ] Gate check passes: `npm test` → **664 + ~5 new = ~669** tests pass
- [ ] Test count: ~5 new tests (seeded token + injected fakeFetch, per the existing gateway test pattern)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ado): resolve the parent work item of a task`

---

### T6: `tasks:parent` IPC channel — ✅ Complete

**What**: Add `'tasks:parent': { req: { id: number; org: string; project: string }; res: ParentOfResult }` to `IpcContract`, hoist the `AdoGateway` instance to a shared `const` next to `TaskBoard` in `index.ts`, and register `handle('tasks:parent', (ref) => adoGateway.parentOf(ref))`.
**Where**: `src/shared/ipc-contract.ts`, `src/main/index.ts`
**Depends on**: T5
**Reuses**: typed `handle()` wrapper, existing `AdoGateway` construction
**Requirement**: PARENT-02, DIALOG-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `IpcContract` includes the `tasks:parent` channel with the typed req/res
- [ ] `index.ts` hoists one `AdoGateway` instance used by both `TaskBoard` and the `tasks:parent` handler (no second inline `new AdoGateway()`)
- [ ] Handler delegates to `parentOf`; auth failure surfaces as `{ ok: false, reason: 'auth' }`
- [ ] Gate check passes: `npm run typecheck` (node + web)
- [ ] No unit tests (thin IPC shell — hand-verified per project convention)

**Tests**: none
**Gate**: build

**Commit**: `feat(ipc): add tasks:parent channel`

---

### T7: Start-work dialog resolves the parent US — ✅ Complete

**What**: In `StartWorkDialog`, add an optional `devAlias?: string` prop and a `parent` state; a `useEffect` (on open / task change) calls `api.invoke('tasks:parent', { id, org, project })` and, **only while `!branchEdited.current`**, re-runs `branchNameFor({ id, details }, effectiveTemplate, { devAlias, parent })`. Auth/no-parent degrade to `parent: null` (empty placeholders).
**Where**: `src/renderer/src/components/StartWorkDialog.tsx`
**Depends on**: T6
**Reuses**: existing workspace-override `useEffect` re-prefill pattern, the `branchEdited` guard, `branchNameFor`, `worktreePathFor`
**Requirement**: DIALOG-01, DIALOG-02, DIALOG-03, DIALOG-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Dialog resolves the parent once on open and includes `{ devAlias, parent }` in the prefill
- [ ] The prefill updates when the parent arrives, but never overwrites a user-edited branch (`branchEdited` guard)
- [ ] `tasks:parent` auth failure or `parent: null` degrades to empty placeholders (branch remains editable, creation never blocked)
- [ ] Live worktree-path preview reflects the branch (unchanged `worktreePathFor` behavior)
- [ ] Gate check passes: `npm run typecheck` (web project)
- [ ] No unit tests (renderer convention) — flagged for the post-Execute CDP smoke

**Tests**: none
**Gate**: build

**Commit**: `feat(ui): prefill nested branch from parent US in start-work`

---

### T8: App threads `devAlias` into the dialog — ✅ Complete

**What**: In `App.tsx`, load `config.ado.devAlias` into a `devAlias` state in the config-load effect and the Settings `onSaved`, and pass `devAlias={devAlias}` to `StartWorkDialog`.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T7, T3
**Reuses**: existing config-load + Settings-save wiring
**Requirement**: CONFIG-01, DIALOG-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `devAlias` state initialized from `config.ado.devAlias`
- [ ] Settings save refreshes `devAlias`
- [ ] `StartWorkDialog` receives `devAlias={devAlias}`
- [ ] Gate check passes: `npm run typecheck` (web project)
- [ ] No unit tests (renderer convention)

**Tests**: none
**Gate**: build

**Commit**: `feat(ui): thread devAlias into start-work dialog`

---

## Phase Execution Map

Visual representation of task ordering. Phases run in sequence, and tasks within a phase run in order:

```
Phase 1:  T1 -> T2
Phase 2:  T4 -> T5 -> T6
Phase 3:  T7 -> T8
T3 -> T8
T6 -> T7
```

Execution is strictly sequential - there is no intra-phase parallelism. A single agent works one task at a time, in order. **8 tasks total → one task-budgeted batch → execute inline (no sub-agents).**

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: `taskIdFromBranch` last segment | 1 function + tests | ✅ Granular |
| T2: `branchNameFor` placeholders | 1 function + tests | ✅ Granular |
| T3: `ado.devAlias` field | 1 config field | ✅ Granular |
| T4: `parseParentRefs` + `parentRefs` | 1 function + 1 result field (same file) | ✅ Granular |
| T5: `parentOf` | 1 method + tests | ✅ Granular |
| T6: `tasks:parent` channel + handler | 1 IPC channel + 1 handler (same contract) | ✅ Granular |
| T7: dialog parent resolution | 1 component | ✅ Granular |
| T8: App devAlias plumbing | 1 component | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | none | no arrow | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | none | no arrow (independent in Phase 1) | ✅ Match |
| T4 | none | no arrow | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 (Phase 2) → T7 (Phase 3) | ✅ Match |
| T8 | T7, T3 | T7 → T8; T8 ← T3 (backward cross-phase) | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Shared pure logic | unit | unit | ✅ OK |
| T2 | Shared pure logic | unit | unit | ✅ OK |
| T3 | Entity / config | none | none | ✅ OK |
| T4 | Main deep module (gateway) | unit | unit | ✅ OK |
| T5 | Main deep module (gateway) | unit | unit | ✅ OK |
| T6 | Thin IPC shell | none | none | ✅ OK |
| T7 | Renderer component | none | none | ✅ OK |
| T8 | Renderer component | none | none | ✅ OK |
