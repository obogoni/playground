# Sidebar & Tasks Pane Resize/Collapse Tasks

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
| Config schema (`src/shared/config.ts`) | none | Build gate only (entity/config layer) | - | `npm run typecheck` |
| Renderer pure libs (`src/renderer/src/lib/*`) | unit | All branches; 1:1 to PANE ACs (clamp, default resolution, out-of-bounds persisted values); every listed edge case | co-located `*.test.ts` | `npm test` |
| Renderer React components (`ResizablePane`, `Sidebar`, `TasksPane`, `App`) | none | Hand-verified / CDP smoke per repo convention (TESTING.md) | - | `npm run typecheck` |

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

### Phase 1: Pane layout (single cohesive phase, 6 tasks)

```
T1      T2
        |
        v
       T3
      /   \
     v     v
    T4     T5
     \     /
      v   v
       T6
```

---

## Task Breakdown

### T1: Add optional pane-layout fields to the UI config schema

**Status**: ✅ Complete

**What**: Extend `AppConfig.ui` with four optional fields so widths and collapsed state can persist without breaking existing configs.
**Where**: `src/shared/config.ts`
**Depends on**: None
**Reuses**: Existing `ui` block shape (`theme`, `direction`, `defaultShell`) and `DEFAULT_CONFIG`

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `AppConfig.ui` gains `sidebarWidth?: number`, `sidebarCollapsed?: boolean`, `tasksWidth?: number`, `tasksCollapsed?: boolean`
- [ ] Existing `DEFAULT_CONFIG` stays valid without the new fields (optional = absent is the default)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 125 tests pass (no silent deletions)

**Tests**: none (config/entity layer)
**Gate**: full
**Commit**: `feat(ui): add optional pane-layout fields to the UI config`

---

### T2: Add pane-layout helpers with unit tests

**Status**: ✅ Complete

**What**: Pure, testable width/collapse resolution: per-pane bounds (sidebar 170-420, tasks 260-460), rail width, default resolution, and out-of-bounds clamping. Co-located unit tests in `pane-layout.test.ts`.
**Where**: `src/renderer/src/lib/pane-layout.ts` (new)
**Depends on**: None
**Reuses**: Existing co-located test pattern (`tree-selection.test.ts`) and repo conventions (no mocking library; pure input→output)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `clampPaneWidth(value, bounds)` clamps to [min, max] (PANE-02, PANE-08, PANE-11)
- [ ] `resolvePaneWidth(saved, bounds)` returns the pane default (sidebar 230, tasks 322) when `saved` is absent, clamped when out of bounds (PANE-01, PANE-11, PANE-13)
- [ ] Constants exported: `RAIL_WIDTH = 36`, sidebar/tasks bounds, sidebar default 230 (PANE-01, PANE-03)
- [ ] Unit tests cover: default when absent, clamp low, clamp high, exact bounds pass through (all branches)
- [ ] Gate check passes: `npm test`
- [ ] Test count: 125 + N new tests pass

**Tests**: unit
**Gate**: quick
**Commit**: `feat(ui): add pane-layout width helpers with tests`

---

### T3: Create the ResizablePane component

**Status**: ✅ Complete

**What**: A reusable pane wrapper with a drag handle (pointer-based), header collapse/expand chevron, 36px collapsed rail, double-click-to-toggle, and width clamping during drag. Pane styles live in `ResizablePane.css`.
**Where**: `src/renderer/src/components/ResizablePane.tsx` (new)
**Depends on**: T2
**Reuses**: `Icon` chevron glyphs (`chevron-down` + rotate, per `Icon.tsx`), `pane-header` styles from `Sidebar.css`, `pane-layout` helpers

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Drag on the handle resizes the pane, clamped via `clampPaneWidth` (PANE-02, PANE-08)
- [ ] Collapse chevron renders in the header; collapsed state renders the rail with only an expand chevron (PANE-03, PANE-07)
- [ ] Expand restores the pre-collapse width (PANE-04)
- [ ] Double-click on the handle toggles collapse (PANE-05)
- [ ] Collapsed panes never render children (PANE-07)
- [ ] Pane flex-basis uses the resolved width with min-width = pane minimum so narrow windows shrink instead of overflowing (PANE-12)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 125 + N pass (no deletions)

**Tests**: none (renderer component - repo convention)
**Gate**: full
**Commit**: `feat(ui): add resizable and collapsible pane component`

---

### T4: Make the sidebar resizable and collapsible

**Status**: ✅ Complete

**What**: Wrap the sidebar in `ResizablePane` with optional props, defaulting to the 230px default when nothing is persisted; rail keeps an expand affordance. Rail/handle styles live in `Sidebar.css`.
**Where**: `src/renderer/src/components/Sidebar.tsx`
**Depends on**: T3
**Reuses**: `ResizablePane`; existing `sidebar-*` styles

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `SidebarProps` gains optional `width`, `collapsed`, `onWidthChange`, `onToggleCollapsed`
- [ ] Sidebar renders inside `ResizablePane` with the workspace tree only when expanded (PANE-01, PANE-03, PANE-07)
- [ ] Absent props fall back to the 230px default (PANE-01)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 125 + N pass (no deletions)

**Tests**: none (renderer component - repo convention)
**Gate**: full
**Commit**: `feat(ui): make the sidebar resizable and collapsible`

---

### T5: Make the tasks pane resizable and collapsible

**Status**: ✅ Complete

**What**: Wrap the tasks pane in `ResizablePane` with the same optional-props pattern, defaulting to 322px. Rail/handle styles live in `TasksPane.css`.
**Where**: `src/renderer/src/components/TasksPane.tsx`
**Depends on**: T3
**Reuses**: `ResizablePane`; existing `tasks-*` styles

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `TasksPaneProps` gains optional `width`, `collapsed`, `onWidthChange`, `onToggleCollapsed`
- [ ] Tasks pane renders inside `ResizablePane` (handle on the left edge); absent props fall back to the 322px default (PANE-08, PANE-09)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 125 + N pass (no deletions)

**Tests**: none (renderer component - repo convention)
**Gate**: full
**Commit**: `feat(ui): make the tasks pane resizable and collapsible`

---

### T6: Wire pane layout state into the app config

**Status**: ✅ Complete

**What**: `App.tsx` resolves persisted widths via `resolvePaneWidth`, holds sidebar/tasks width+collapsed state, persists changes through the existing `update()`/`config:patch` path, and passes props to both panes.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T4, T5
**Reuses**: `update()` + `api.invoke('config:patch', { ui })` (existing pattern), `pane-layout` helpers

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Sidebar and tasks pane receive `width`/`collapsed` resolved from `config.ui` with defaults (PANE-01, PANE-13)
- [ ] Every width/collapse change persists via `config:patch` (PANE-06, PANE-10)
- [ ] A restart restores persisted widths and collapsed states (PANE-06)
- [ ] Persist failure keeps the in-memory width (assumption: logged, non-blocking)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 125 + N pass (no deletions)

**Tests**: none (renderer component - repo convention)
**Gate**: full
**Commit**: `feat(ui): wire pane layout state into the app config`

---

## Phase Execution Map

Visual representation of task ordering. Phases run in sequence, and tasks within a phase run in order:

```
Phase 1:
T1      T2
        |
        v
       T3
      /   \
     v     v
    T4     T5
     \     /
      v   v
       T6
```

Execution is strictly sequential - there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order. T1 and T2 are independent and may be implemented in either order, but the sequence above keeps the schema change first.

6 tasks total = single task-budgeted batch (≤ ~8) → execution is inline, no sub-agents.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: config schema fields | 1 file, 1 concept | ✅ Granular |
| T2: pane-layout helpers + tests | 1 module + its co-located tests | ✅ Granular |
| T3: ResizablePane component | 1 component (+ its CSS) | ✅ Granular |
| T4: Sidebar integration | 1 component | ✅ Granular |
| T5: TasksPane integration | 1 component | ✅ Granular |
| T6: App wiring | 1 file | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | - | ✅ Match |
| T2 | None | - | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T3 | T3 → T5 | ✅ Match |
| T6 | T4, T5 | T4 → T6, T5 → T6 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Config schema | none | none | ✅ OK |
| T2 | Renderer pure lib | unit | unit | ✅ OK |
| T3 | React component | none | none | ✅ OK |
| T4 | React component | none | none | ✅ OK |
| T5 | React component | none | none | ✅ OK |
| T6 | React component (wiring) | none | none | ✅ OK |