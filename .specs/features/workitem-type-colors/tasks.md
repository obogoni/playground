# Work Item Type Badge Colors Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: None - Medium scope, design is inline in the task bodies below
**Status**: Done

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `README.md` (Development section), `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Renderer pure libs (`src/renderer/src/lib/*`) | unit | All branches; 1:1 to TYPE ACs (mapped types, fallback, case-insensitivity, edge cases) | co-located `*.test.ts` | `npm test` |
| CSS (`src/renderer/src/styles/global.css`) | none | Build gate only (visual convention; hand-verified) | - | `npm run typecheck` |
| Renderer React components (the 6 badge surfaces) | none | Hand-verified / CDP smoke per repo convention (TESTING.md) | - | `npm run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After every code task / before PR | `npm run typecheck && npm run lint && npm test` |
| Build | After phase completion | `npm run build:win` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: ADO type palette (3 tasks - superseded by Phase 2)

```
T1 → T2 → T3
```

> Phase 1 implemented the default-process palette; the user then provided the
> real ADO process colors (Bug orange, Fault red, etc.), so Phase 2
> re-sources the palette from the process API.

### Phase 2: ADO process palette (2 tasks)

```
T4 → T5
```

---

## Task Breakdown

### T1: Map ADO work item types to badge classes with unit tests

**Status**: ✅ Complete

**What**: Replace the `typeClass()` switch in `task-pills.ts` with the ADO type map (Bug, Task, User Story, Feature, Epic, Issue, Impediment, Product Backlog Item → `tp-<slug>` classes; everything else → `muted`), case-insensitive. Co-located unit tests in `task-pills.test.ts`.
**Where**: `src/renderer/src/lib/task-pills.ts`
**Depends on**: None
**Reuses**: Existing `typeClass()` call sites (signature unchanged); test style of `pane-layout.test.ts` / `tree-selection.test.ts`

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `typeClass('Bug')` → `tp-bug`; `'Task'` → `tp-task`; `'User Story'` → `tp-user-story`; `'Feature'` → `tp-feature`; `'Epic'` → `tp-epic`; `'Issue'`/`'Impediment'` → `tp-issue`; `'Product Backlog Item'` → `tp-pbi`; `'Fault'` → `tp-fault` (TYPE-01)
- [ ] `typeClass('Requirement')`, `typeClass('Test Case')`, `typeClass('')`, `typeClass('   ')` → `muted` (TYPE-02, TYPE-05, TYPE-06)
- [ ] `typeClass('user story')` / `typeClass('USER STORY')` match the mapped type (TYPE-03)
- [ ] `stateClass()` unchanged (out of scope)
- [ ] Gate check passes: `npm test`
- [ ] Test count: 631 + N new tests pass (no deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(ui): map ADO work item types to badge colors`

---

### T2: Add the ADO color classes to the pill stylesheet

**Status**: ✅ Complete

**What**: Add `.task-pill.tp-*` classes in `global.css` using the ADO hex colors with the existing tinted-background pattern (text in the ADO color, `color-mix(in oklab, <hex> 16%, transparent)` background).
**Where**: `src/renderer/src/styles/global.css`
**Depends on**: T1
**Reuses**: Existing `.task-pill.red/.amber/.green` pattern (lines 79-102)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `.tp-bug` uses #CC293D, `.tp-task` #F2CB1D, `.tp-user-story` #009F5B, `.tp-feature` #0078D7, `.tp-epic` #773B93, `.tp-issue` #FF9D00, `.tp-pbi` #009CCC, `.tp-fault` #B4009E (TYPE-01)
- [ ] Each class follows the existing tinted-background pattern (works on light and dark themes) (TYPE-04)
- [ ] No existing state-pill class (`red`, `amber`, `green`, `blue`, `accent`, `faint`, `muted`) is changed or removed
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 631 + N pass (no deletions)

**Tests**: none (CSS layer)
**Gate**: full
**Commit**: `feat(ui): add ADO type colors to the pill stylesheet`

---

### T3: Audit all badge surfaces for consistent typeClass usage

**Status**: ✅ Complete

**What**: Confirm every type-badge surface (Sidebar, TasksPane, BoardView, WorktreeDetail, AgentsView, SessionRail) renders via `typeClass(pin.details.type)` and that no surface hard-codes a type color class; fix any straggler found.
**Where**: `src/renderer/src/components/{Sidebar,TasksPane,BoardView,WorktreeDetail,AgentsView,SessionRail}.tsx`
**Depends on**: T2
**Reuses**: Existing `typeClass` imports

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Grep confirms all six surfaces call `typeClass(<details.type>)` for their type pill (TYPE-01 across surfaces)
- [ ] No `task-pill` with a hard-coded color class from a type is left (only `tp-*` from `typeClass`)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 631 + N pass (no deletions)

**Tests**: none (renderer components - repo convention)
**Gate**: full
**Commit**: `chore(ui): confirm consistent type badge classes across surfaces`

---

### T4: Re-source the type map to the ADO process colors with tests

**Status**: ✅ Complete

**What**: Replace the `typeClass()` map with the real ADO process palette (Bug #f58b1f, Task #fbbc3d, User Story #0098c7, Feature #773b93, Epic #e06c00, Issue/Code Review #b4009e, Fault #e60017, Initiative #339947, Request #666666, Test Case/Plan/Suite/Feedback/Shared #004b50); drop types the process does not define (Product Backlog Item, Impediment, Chore → `muted`). Update the co-located unit tests in `task-pills.test.ts` to the new outcomes.
**Where**: `src/renderer/src/lib/task-pills.ts`
**Depends on**: None
**Reuses**: The `tp-<slug>` class scheme from T1; the process colors fetched from `wit/workitemtypes` (2026-08-31)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `typeClass('Bug')` → `tp-bug`; `'Task'` → `tp-task`; `'User Story'` → `tp-user-story`; `'Feature'` → `tp-feature`; `'Epic'` → `tp-epic`; `'Issue'` → `tp-issue`; `'Code Review Request'`/`'Code Review Response'` → `tp-code-review`; `'Fault'` → `tp-fault`; `'Initiative'` → `tp-initiative`; `'Request'` → `tp-request`; `'Test Case'`/`'Test Plan'`/`'Test Suite'` → `tp-test-*`; `'Feedback Request'`/`'Feedback Response'` → `tp-feedback`; `'Shared Steps'`/`'Shared Parameter'` → `tp-shared-*` (TYPE-01)
- [ ] `typeClass('Product Backlog Item')`, `typeClass('Impediment')`, `typeClass('Chore')`, `typeClass('')`, `typeClass('   ')` → `muted` (TYPE-02, TYPE-05, TYPE-06)
- [ ] `typeClass('user story')` / `typeClass('USER STORY')` still match (TYPE-03)
- [ ] Tests updated to assert the new class names (no deletions; count grows or stays)
- [ ] Gate check passes: `npm test`
- [ ] Test count: 635 + N pass (no deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(ui): source type badge colors from the ADO process`

---

### T5: Re-source the pill stylesheet to the process colors

**Status**: ✅ Complete

**What**: Replace the `tp-*` hex values in `global.css` with the ADO process colors, grouping selectors that share a color (Issue + Code Review → #b4009e; Test Case/Plan/Suite + Feedback + Shared → #004b50).
**Where**: `src/renderer/src/styles/global.css`
**Depends on**: T4
**Reuses**: The tinted-background pattern (text in the ADO color, `color-mix(in oklab, <hex> 16%, transparent)`)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `.tp-bug` uses #f58b1f, `.tp-task` #fbbc3d, `.tp-user-story` #0098c7, `.tp-feature` #773b93, `.tp-epic` #e06c00, `.tp-issue`/`.tp-code-review` #b4009e, `.tp-fault` #e60017, `.tp-initiative` #339947, `.tp-request` #666666, `.tp-test-case`/`.tp-test-plan`/`.tp-test-suite`/`.tp-feedback`/`.tp-shared-steps`/`.tp-shared-parameter` #004b50 (TYPE-01)
- [ ] `.tp-pbi` class removed (type no longer mapped) (TYPE-02)
- [ ] Each class keeps the tinted-background pattern working on light and dark themes (TYPE-04)
- [ ] No state-pill class (`red`, `amber`, `green`, `blue`, `accent`, `faint`, `muted`) is changed or removed
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 635 + N pass (no deletions)

**Tests**: none (CSS layer)
**Gate**: full
**Commit**: `feat(ui): apply the ADO process colors to type badges`

---

## Phase Execution Map

Visual representation of task ordering. Phases run in sequence, and tasks within a phase run in order:

```
Phase 1:  T1 → T2 → T3
Phase 2:  T4 → T5
```

Execution is strictly sequential - there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

5 tasks total = single task-budgeted batch (≤ ~8) → execution is inline, no sub-agents.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: type map + tests | 1 module (+ co-located tests) | ✅ Granular |
| T2: pill CSS classes | 1 stylesheet | ✅ Granular |
| T3: surface audit | read-only audit (fix only if a straggler exists) | ✅ Granular |
| T4: process-palette map + tests | 1 module (+ co-located tests) | ✅ Granular |
| T5: process-palette CSS | 1 stylesheet | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | - | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None | - | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Renderer pure lib | unit | unit | ✅ OK |
| T2 | CSS | none | none | ✅ OK |
| T3 | React components | none | none | ✅ OK |
| T4 | Renderer pure lib | unit | unit | ✅ OK |
| T5 | CSS | none | none | ✅ OK |