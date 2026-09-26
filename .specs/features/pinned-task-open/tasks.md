# Pinned Task Open Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: inline. Main gets `openPinnedTask(deps, ref)` in `task-board.ts` — `deps` is the board's stored tasks and an injected `openExternal` — so every refusal and failure is unit-tested without Electron. `index.ts` wires it to `shell.openExternal`. The pane renders the title and `#id` as buttons styled as links.
**Status**: Approved 2026-09-26; executing (planned 2026-09-22). Baseline: 1676 tests, lint 0 errors / 18 warnings

**Branch**: `feature/pinned-task-open`, stacked on `feature/window-open-https` (PR #123, issue #115). The PR closes #109 and says "depends on #123"; once #123 merges, `git rebase --onto origin/main feature/window-open-https feature/pinned-task-open`.

**Reconciled with `main` (2026-09-26)**: every anchor holds (`TaskBoard.pin` builds the URL, `tasks:unpin`'s request shape, `task-card-id` / `task-card-title`, the `shortcuts:launch` toast handling in `WorktreeDetail` and `FileTabs`). PTOP-06's scheme half now uses AD-044's `isHttpsUrl`. T6 stays owner-driven: agent-run dev apps use a throwaway user-data dir, which holds no pinned task, so the owner runs `npm run dev` on their own data.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute; record the lint warning count at the same time.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts; style sampled from `src/main/task-board.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main task logic (`task-board.ts`) | unit | 1:1 to PTOP-05, 06, 07 and the two-projects edge case, plus the happy path opening exactly the stored URL | `src/main/task-board.test.ts` | `npm test` |
| IPC contract, main wiring, pane, CSS, App | none (build + hand check) | — | — | `npx electron-vite build` |
| End to end | manual, owner-driven | PTOP-01..04, 08, 09 — opening a real browser is not automated | — | live dev app |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | Wiring and renderer tasks | `npx electron-vite build` |
| Manual | T6 | owner clicks in the dev app |

---

## Execution Plan

### Phase 1: Main

```
T1 → T2 → T3
```

### Phase 2: Pane

```
T3 → T4 → T5
```

### Phase 3: Check

```
T5 → T6
```

---

## Task Breakdown

### T1: `openPinnedTask`

**What**: `openPinnedTask({ tasks, openExternal }, ref)` finds the pinned task by `{ id, org, project }`, refuses a missing one and a URL that is not `https://dev.azure.com/…`, awaits `openExternal(url)` and returns a `LaunchResult`.
**Where**: `src/main/task-board.ts`
**Depends on**: None
**Reuses**: `LaunchResult`; the stored `PinnedTask.url`; `isHttpsUrl` from `src/main/url-policy.ts` (AD-044) for the scheme, plus a `dev.azure.com` host check
**Requirement**: PTOP-05, PTOP-06, PTOP-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: opens exactly the stored URL and returns `ok: true`; not pinned → PTOP-05's message, nothing opened; `http:` and a foreign host → PTOP-06's message, nothing opened; `openExternal` rejecting → `ok: false` with its message; same id in two projects opens each one's own URL
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(tasks): open a pinned task's work item from main`

---

### T2: The contract gains `tasks:open`

**What**: `'tasks:open': { req: { id: number; org: string; project: string }; res: LaunchResult }`.
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: T1
**Reuses**: `tasks:unpin`'s request shape
**Requirement**: PTOP-01, PTOP-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(ipc): add tasks:open`

---

### T3: Main handles `tasks:open`

**What**: `handle('tasks:open', …)` calling `openPinnedTask` with the board's tasks and `shell.openExternal`.
**Where**: `src/main/index.ts`
**Depends on**: T2
**Reuses**: the `tasks:*` handlers' board instance
**Requirement**: PTOP-01, PTOP-02, PTOP-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `feat(main): open pinned tasks in the browser`

---

### T4: Title and `#id` become links

**What**: In `TaskCard`, the title and `#id` render as buttons that invoke `tasks:open` and pass a failure to a new `onToast` prop; "details unavailable" stays plain text; App passes its `setToast`.
**Where**: `src/renderer/src/components/TasksPane.tsx`
**Depends on**: T3
**Reuses**: the `shortcuts:launch` result-to-toast handling in `FileTabs`/`WorktreeDetail`
**Requirement**: PTOP-01, PTOP-02, PTOP-03, PTOP-04, PTOP-08, PTOP-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] App's `<TasksPane>` receives `onToast` (one line in `App.tsx`, forced by the new required prop)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(tasks): open a pinned task from its title or id`

---

### T5: Link styling

**What**: Title and `#id` buttons keep their current look, gain a pointer cursor, an underline on hover and a visible focus ring, in both themes.
**Where**: `src/renderer/src/components/TasksPane.css`
**Depends on**: T4
**Reuses**: the pane's existing tokens
**Requirement**: PTOP-01, PTOP-02, PTOP-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Gate check passes: `npm run lint` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `style(tasks): show a pinned task's title and id as links`

---

### T6: Owner check in the dev app

**What**: The owner clicks a pinned task's title, then its `#id`, then tabs to the title and presses Enter, then clicks Start work and Agent (cancelling the dialogs they open); record what opened. Unpin is not clicked: it would drop the owner's pin, and its handler is untouched.
**Where**: `.specs/features/pinned-task-open/tasks.md` (result)
**Depends on**: T5
**Reuses**: —
**Requirement**: PTOP-01, PTOP-02, PTOP-03, PTOP-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each click opened the right `…/_workitems/edit/<id>`, and no button opened the browser
- [ ] No work item number or title recorded in the repository (public): the result names what happened, not which item

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the owner check of opening pinned tasks`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6
```

Six tasks: a single batch, executed inline. The Verifier runs after T6.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: `openPinnedTask` | 1 function | ✅ Granular |
| T2: contract | 1 entry | ✅ Granular |
| T3: wiring | 1 handler | ✅ Granular |
| T4: links | 1 component (+ 1 forced prop line in App) | ⚠️ Cohesive |
| T5: styling | 1 stylesheet | ✅ Granular |
| T6: owner check | 1 manual check | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | main task logic | unit | unit | ✅ OK |
| T2 | IPC contract | none | none | ✅ OK |
| T3 | main wiring | none | none | ✅ OK |
| T4 | pane | none | none | ✅ OK |
| T5 | CSS | none | none | ✅ OK |
| T6 | spec docs | none (manual) | none | ✅ OK |
