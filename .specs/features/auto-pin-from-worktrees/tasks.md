# Auto-Pin Tasks from Worktrees Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/auto-pin-from-worktrees/design.md`
**Status**: In Progress (approved 2026-09-29)
**Branch**: `feature/auto-pin-from-worktrees` (cut from `origin/main`)
**Test baseline**: measured green on the branch before T1 (call it **B**). Every "Test count" below is written as `B + N`, cumulative.
**Before T1**: AD-049 is recorded in `.specs/STATE.md` (design §Tech Decisions); it is committed together with the spec docs in the first commit.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts` (`src/**/*.test.ts`, 30 s timeout), AD-003 (coverage report-only), confirmed lessons L-001 and L-005, memory note "rmSync no-ops on non-ASCII paths".

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure logic (`taskIdFromTemplate` in `src/shared/tasks.ts`, `derivedTaskRefs`/`runAutoPin` in `src/main/worktree-tasks.ts`) | unit | All branches; 1:1 to the spec ACs each implements; every Edge Case that touches it | co-located `<module>.test.ts` | `npx vitest run <file>` |
| DI orchestrator (`TaskBoard`) | unit (stub `WorkItemSource` + real temp `ConfigStore`, async `rm` cleanup) | Every AC the design assigns to it, incl. auth failure, not-found memory, overlapping passes, toggle off | `src/main/task-board.test.ts` | `npx vitest run src/main/task-board.test.ts` |
| Config defaults (`src/shared/config.ts` + `ConfigStore` merge) | unit | Older config without the key loads the default | `src/main/config-store.test.ts` | `npx vitest run src/main/config-store.test.ts` |
| Shell wiring (`src/main/index.ts`), type-only contracts (`ipc-contract.ts`) | none | Typecheck | - | build gate only |
| Renderer (`App.tsx` subscription) | none | Live check per spec Success Criteria (TESTING.md: renderer by smoke) | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <touched test files>` |
| Full | Not used (no integration/e2e layer in scope) | - |
| Build | After each phase and after wiring-only tasks | `npm run typecheck && npm run lint && npm test` |

---

## Execution Plan

### Phase 1: Pure foundations

```
T1 → T2 → T3
```

### Phase 2: TaskBoard

```
T4 → T5
```

### Phase 3: Wiring

```
T6 → T7 → T8
```

---

## Task Breakdown

### T1: Add `ado.autoPinFromWorktrees` config flag

**What**: Add `autoPinFromWorktrees: boolean` to `AppConfig.ado`, defaulting to `true` in `DEFAULT_CONFIG`.
**Where**: `src/shared/config.ts`
**Depends on**: None
**Reuses**: ConfigStore section merge (`src/main/config-store.ts:53`)
**Requirement**: APIN-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Field and default added with a doc comment
- [x] `config-store.test.ts`: a config file whose `ado` lacks the key loads with `autoPinFromWorktrees === true`; an explicit `false` survives a reload
- [x] Gate check passes: `npx vitest run src/main/config-store.test.ts` and `npm run typecheck`
- [x] Test count: B + 2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(config): add ado.autoPinFromWorktrees flag`

**Status**: ✅ Done

---

### T2: `taskIdFromTemplate` matcher

**What**: Pure function compiling a branch template into an anchored, case-insensitive matcher that returns the `{id}` capture, per design §Compilation rules.
**Where**: `src/shared/tasks.ts`
**Depends on**: T1
**Reuses**: `DEFAULT_BRANCH_TEMPLATE`, `branchNameFor` (round-trip tests)
**Requirement**: APIN-01, APIN-02, APIN-03, APIN-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Spec AC 1: `user/otavio/{id}-{slug}` + `user/otavio/4821-fix-login` → `4821`
- [x] Spec AC 2: `user/maria/4821-x` and `main` → `null`
- [x] Spec AC 3: `{type}/{id}-{slug}`: `feature/77-a`, `bugfix/77-a` → `77`; `chore/77-a` → `null`
- [x] Spec AC 4: `user/{dev}/{usId}-{usSlug}/{id}-{slug}` + `user/otavio/123-foo` → `123`, + `user/otavio/9-us/123-foo` → `123`
- [x] Spec AC 5: a template without `{id}` → `null`
- [x] Spec AC 6: null and blank template behave as `DEFAULT_BRANCH_TEMPLATE`
- [x] Spec AC 7: `USER/Otavio/4821-x` matches `user/otavio/{id}-{slug}`; `x/user/otavio/4821-a` and `user/otavio/4821-a/extra` do not
- [x] Spec AC 8: round-trip over each template above with a titled task, an empty-slug title (`'!!!'`), and with and without `devAlias`/parent → returns the rendered id
- [x] Edge cases: `0042` → `42`; `0` → `null`; `(detached abc1234)` → `null`; regex metacharacters in literal text (`fix.{id}`) are escaped
- [x] Gate check passes: `npx vitest run src/shared/tasks.test.ts`
- [x] Test count: B + 2 + ≥12 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(tasks): match branches against the branch template to derive task ids`

**Status**: ✅ Done

---

### T3: `derivedTaskRefs` pure derivation

**What**: New module mapping a `WorkspaceNode[]` to unique `WorkItemRef`s using a per-workspace template lookup and the ADO defaults; export `makeRef` from `task-board.ts` for reuse.
**Where**: `src/main/worktree-tasks.ts` (new)
**Depends on**: T2
**Reuses**: `taskIdFromTemplate`, `refKey`, `makeRef`
**Requirement**: APIN-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Worktrees across two workspaces with the same id → one ref (spec Auto-pin AC 3)
- [x] `templateFor` returning an override for workspace A and null for B → A matches its override and B the global (AC 10)
- [x] Either default unset → `[]` (AC 5)
- [x] Non-matching and detached branches → skipped; refs carry `defaultOrg`/`defaultProject` and the canonical URL
- [x] Gate check passes: `npx vitest run src/main/worktree-tasks.test.ts src/main/task-board.test.ts`
- [x] Test count: previous + ≥5 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(tasks): derive work item refs from the worktree tree`

**Status**: ✅ Done

---

### T4: Fix stale `pinnedTasks` write in `TaskBoard.pin`

**What**: `pin()` re-reads `pinnedTasks` after its ADO `await` and appends to the fresh list (design §Risks, row 1).
**Where**: `src/main/task-board.ts`
**Depends on**: None
**Reuses**: existing `pin` flow
**Requirement**: APIN-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Test: two `pin()` calls for different ids started before either resolves (stub with deferred promises) → both persist
- [ ] Gate check passes: `npx vitest run src/main/task-board.test.ts`
- [ ] Test count: previous + 1 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `fix(tasks): re-read pinned tasks before persisting a pin`

---

### T5: `TaskBoard.autoPin`

**What**: Implement `autoPin(refs)` per design §TaskBoard.autoPin: toggle, candidate filter (pinned / session `notFound` / `inflight`), one batch fetch, badge enrichment, fresh-read append, `{ added, snapshot }`.
**Where**: `src/main/task-board.ts`
**Depends on**: T4
**Reuses**: `withBadgeType`, `sameRef`, `list`, `stubSource` harness
**Requirement**: APIN-05, APIN-07, APIN-08, APIN-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] AC 1: found ref → appended to `config.pinnedTasks`, `added: 1`, snapshot carries its details
- [ ] AC 2: an already-pinned ref → no fetch call recorded, `added: 0`
- [ ] AC 6: auth failure → nothing persisted, `snapshot.auth === 'failed'`; a second call fetches again
- [ ] AC 7: not-found ref → not pinned; a second call makes no fetch for it
- [ ] AC 8: two overlapping `autoPin` calls with the same ref → pinned once, one fetch
- [ ] AC 9: `autoPinFromWorktrees: false` → no fetch, `added: 0`
- [ ] A manual `pin()` interleaved with `autoPin` for a different id → both persist
- [ ] New test fixtures clean up with async `rm`
- [ ] Gate check passes: `npx vitest run src/main/task-board.test.ts`
- [ ] Test count: previous + ≥7 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(tasks): auto-pin derived work items in TaskBoard`

---

### T6: `runAutoPin` orchestration

**What**: Add `runAutoPin(tree, deps)` to `worktree-tasks.ts`: reads config, calls `derivedTaskRefs` → `taskBoard.autoPin`, emits `tasks:changed` only when `added > 0`, catches and logs every error.
**Where**: `src/main/worktree-tasks.ts`
**Depends on**: None (Phase 2 complete, including T5)
**Reuses**: `derivedTaskRefs`; DI style of `SessionNotifier`
**Requirement**: APIN-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `added: 1` → emit called once with the snapshot; `added: 0` → emit not called
- [ ] `autoPin` rejecting → the promise resolves, error logged, emit not called
- [ ] Workspace template lookup falls back to `config.ado.branchTemplate` when `workspaceTemplates` returns null
- [ ] Gate check passes: `npx vitest run src/main/worktree-tasks.test.ts`
- [ ] Test count: previous + ≥3 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(tasks): orchestrate auto-pin passes and change notification`

---

### T7: Wire `tree:get` and the `tasks:changed` event in main

**What**: Declare `IpcEvents['tasks:changed']`; the `tree:get` handler returns the tree and starts `runAutoPin(tree, …)` without awaiting it.
**Where**: `src/main/index.ts`
**Depends on**: T6
**Reuses**: `emitToWindow`, `workspaceTemplates`
**Requirement**: APIN-05, APIN-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `ipc-contract.ts` event added; `tree:get` reply unchanged in shape and timing
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged from T6

**Tests**: none
**Gate**: build

**Commit**: `feat(tasks): run auto-pin after every tree refresh`

---

### T8: Renderer subscribes to `tasks:changed`

**What**: `App.tsx` subscribes via `api.on('tasks:changed', ({ snapshot }) => setTasks(snapshot))` and unsubscribes on unmount.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T7
**Reuses**: `use-time.ts` subscription pattern
**Requirement**: APIN-06

**Tools**:

- MCP: NONE
- Skill: `run` (live check)

**Done when**:

- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Live check (spec Success Criteria): with `npm run dev`, create a worktree on `user/otavio/<real-id>-x` from a terminal, focus the app → the card appears without a manual pin; unpin → it returns after the next focus
- [ ] Test count: unchanged from T7

**Tests**: none
**Gate**: build

**Commit**: `feat(tasks): refresh the pinned pane when auto-pin adds tasks`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5
Phase 3:  T6 ------→ T7 ------→ T8
```

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: config flag | 1 field + default | ✅ Granular |
| T2: matcher | 1 function | ✅ Granular |
| T3: derivedTaskRefs | 1 function (new module) | ✅ Granular |
| T4: pin race fix | 1 method change | ✅ Granular |
| T5: autoPin | 1 method | ✅ Granular |
| T6: runAutoPin | 1 function | ✅ Granular |
| T7: main wiring | 1 handler + 1 event type | ⚠️ 2 related things, cohesive |
| T8: renderer subscription | 1 effect | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | start of Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None | start of Phase 2 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None (after Phase 2) | start of Phase 3 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Config defaults | unit | unit | ✅ OK |
| T2 | Pure logic | unit | unit | ✅ OK |
| T3 | Pure logic | unit | unit | ✅ OK |
| T4 | DI orchestrator | unit | unit | ✅ OK |
| T5 | DI orchestrator | unit | unit | ✅ OK |
| T6 | Pure logic / orchestration | unit | unit | ✅ OK |
| T7 | Shell wiring + type contract | none | none | ✅ OK |
| T8 | Renderer | none | none | ✅ OK |
