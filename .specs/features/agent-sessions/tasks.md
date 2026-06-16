# Agent Sessions (AM2) Tasks

**Design**: `.specs/features/agent-sessions/design.md`
**Spec**: `.specs/features/agent-sessions/spec.md`
**Status**: Executed T1–T14 on `feature/agent-sessions` — gate green (typecheck + lint + 166 tests + `electron-vite build`). Real `main` baseline was 145 (not 142); +8 (`SessionRingBuffer`) +13 (`SessionManager`) = 166. AGSN-01..05 + entry-point manual dev verification still pending. Note: last-output preview for stopped cards (T8 "What") was dropped — no IPC exposes `tail`, deferred to AM3.

**Test baseline**: anchor to the green count on `main` at execution start — STATE records **142** after the AM1 merge. Two tasks add unit tests: **T1** `SessionRingBuffer` (+6) and **T4** `SessionManager` (+10) → **158** at the end. Every other task is `Tests: none` per the TESTING.md matrix (shared types via `typecheck`; thin `index.ts` IPC wiring + renderer React are hand-verified via CDP/visual, not units).

**Tools (all tasks)**: MCP: NONE · Skill: NONE — same as AM1; this feature needs no external tools.

---

## Execution Plan

### Phase 1 — Foundation (parallel)

Pure seam + shared data model, no deps.

```
T1 [P]   (SessionRingBuffer + unit tests)
T2 [P]   (shared session data model: config.ts + agents.ts)
```

### Phase 2 — Contract (sequential)

```
T2 ──→ T3   (IPC control set + session:status + dialog:pickFolder)
```

### Phase 3 — Core + renderer leaves (parallel)

```
T1,T2,T3 ──→ T4 [P]   (SessionManager + unit tests)
T3 ────────→ T6 [P]   (TerminalPane attach/detach)
T2,T3 ─────→ T7 [P]   (NewSessionDialog)
T2,T3 ─────→ T8 [P]   (SessionRail + SessionCard)
```

### Phase 4 — Wiring + composition (parallel)

```
T4 ──────→ T5 [P]   (index.ts: SessionManager wiring, delete spike)
T6,T8 ───→ T9 [P]   (AgentsView master-detail)
```

### Phase 5 — Integration (sequential) → first end-to-end dev run

```
T5,T7,T9 ──→ T10 ──→ [hand-verify AGSN-01..05 in dev]
```

### Phase 6 — Contextual entry points (parallel)

```
T10 ──┬→ T11 [P]   (WorktreeDetail Agents section + chips)
      ├→ T12 [P]   (BoardView card spawn button)
      ├→ T13 [P]   (TasksPane Agent button — 0/1/many)
      └→ T14 [P]   (Sidebar row context menu)
```

---

## Task Breakdown

### T1: SessionRingBuffer pure seam + unit tests [P]

**What**: Implement a bounded per-session scrollback buffer: `append(chunk)`, `snapshot()`, `tail(lines)`; caps by bytes and lines, dropping oldest past the cap.
**Where**: `src/main/session-ring-buffer.ts` (+ `src/main/session-ring-buffer.test.ts`)
**Depends on**: None
**Reuses**: pure-test pattern from `shortcut-launcher.test.ts` / `tree.test.ts`
**Requirement**: AGSN-03

**Done when**:
- [ ] `append`/`snapshot`/`tail` implemented; defaults ~5,000 lines / ~1 MB; raw ANSI bytes preserved
- [ ] ≥6 unit cases: append+snapshot roundtrip, byte cap drops oldest, line cap drops oldest, tail(N) returns last N lines, empty buffer, overflow keeps the tail intact
- [ ] Gate check passes: `npm test`
- [ ] Test count: 142 + 6 = 148 pass (no deletions)

**Verify**: `npm test` — `session-ring-buffer.test.ts` green.

**Tests**: unit · **Gate**: quick
**Commit**: `feat(agents): add SessionRingBuffer scrollback seam`

---

### T2: shared session data model [P]

**What**: Add the persisted/derived session types + the seed agent list, and widen config. In `config.ts`: `SessionStatus = 'running' | 'stopped'`, `PersistedSession { id, agent, cwd, title, status }`, `SessionView extends PersistedSession { pathMissing }`, `AppConfig.sessions: PersistedSession[]`, `AppConfig.ui.direction` += `'agents'`, `DEFAULT_CONFIG.sessions = []`. In `agents.ts`: `SEEDED_AGENTS: AgentDef[]` (Claude/Copilot `gh copilot`/Codex `codex --full-auto`).
**Where**: `src/shared/config.ts`, `src/shared/agents.ts`
**Depends on**: None
**Reuses**: `AgentDef` from `spawn-plan.ts`; the `pinnedTasks: []` precedent for an array config key
**Requirement**: AGSN-01, AGSN-02, AGSN-05

**Done when**:
- [ ] Types + `DEFAULT_CONFIG.sessions = []` added; `ui.direction` union includes `'agents'` (TopBar's derived `Direction` type picks it up)
- [ ] `SEEDED_AGENTS` exported (3 agents, shapes match handoff commands)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 148 pass (no new tests, no deletions)

**Verify**: `npm run typecheck` green; `ConfigStore` reload defaults `sessions` to `[]` (existing merge precedent).

**Tests**: none (shared types — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): add session + seeded-agent data model`

---

### T3: IPC control set + status event + folder picker [P]

**What**: In `ipc-contract.ts` replace AM1's `sessions:spawn`/`sessions:kill` with the AM2 control set on `IpcContract` — `sessions:list` (→`SessionView[]`), `sessions:spawn` (`{agentName,cwd}`→`SessionView`), `sessions:stop`/`:respawn`/`:remove`/`:attach`/`:detach` (`{id}`) and `dialog:pickFolder` (→`{ path: string | null }`); add `session:status` (`{id,status,pathMissing}`) to `IpcEvents`. Leave `session:data`/`session:exit`/`session:input`/`session:resize` as-is.
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: T2
**Reuses**: existing typed `IpcContract`/`IpcEvents` discipline; the generic preload `invoke`/`on`/`send` bridge (no preload/api change needed)
**Requirement**: AGSN-02, AGSN-04, AGSN-05, AGSN-09

**Done when**:
- [ ] AM1 `sessions:spawn {cwd}` / `sessions:kill` removed; the 7 control channels + `dialog:pickFolder` added
- [ ] `session:status` added to `IpcEvents`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` (will surface every AM1 call site to migrate — expected)
- [ ] Test count: 148 pass (no deletions)

**Verify**: `npm run typecheck` flags the now-stale spike call sites (fixed in T5/T10).

**Tests**: none (contract types — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): AM2 session control IPC + status event`

---

### T4: SessionManager orchestrator + unit tests [P]

**What**: Implement the `Map<id, RunningSession>` orchestrator with DI (`{ port, config, emit, fsExists, seededAgents }`): `list`/`spawn`/`stop`/`respawn`/`remove`/`attach`/`detach`/`input`/`resize`/`killAll`. Streams `session:data` only for the active (attached) id; buffers all in `SessionRingBuffer`; persists `AppConfig.sessions` on every change; restore normalizes status→`stopped`; `list()` sets `pathMissing` via `fsExists`.
**Where**: `src/main/session-manager.ts` (+ `src/main/session-manager.test.ts`)
**Depends on**: T1, T2, T3
**Reuses**: `PtyPort`, `buildSpawnPlan`, `ConfigStore`, `SessionRingBuffer` (T1); the `TaskBoard` injected-fake test pattern (hand-rolled fake `PtyPort`, real temp-dir `ConfigStore`, recording `emit`, injected `fsExists`)
**Requirement**: AGSN-02, AGSN-03, AGSN-04, AGSN-05, AGSN-08

**Done when**:
- [ ] All methods implemented per design; only the attached id emits `session:data`; `attach` emits `snapshot()` first then live
- [ ] `spawn` resolves `agentName`→`AgentDef`, persists; ids are independent; `stop`/`killAll` kill PTYs (no orphan) and clear Map entries
- [ ] `onExit`→`stopped`+`session:status`; `respawn` reuses agent+cwd; `remove` allowed only when stopped/path-missing; restore normalizes→`stopped`; `list` reconciles `pathMissing`
- [ ] ≥10 unit cases via fakes: spawn persists+resolves, two independent ids, stop kills+stops+persists, onExit→stopped, respawn reuses agent+cwd, remove gated (running rejected) / allowed when stopped, restore→stopped, list pathMissing when fsExists=false, attach emits snapshot-then-live, input/resize route by id, killAll kills all
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 148 + 10 = 158 pass (no deletions)

**Verify**: `npm test` — `session-manager.test.ts` green.

**Tests**: unit (main deep module — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): add SessionManager session orchestrator`

---

### T6: TerminalPane attach/detach [P]

**What**: In `TerminalPane`, call `api.invoke('sessions:attach', { id })` after subscribing to `session:data` on mount, and `api.invoke('sessions:detach', { id })` in cleanup. Scrollback arrives as the first `session:data` chunk (no new path). All existing xterm/fit/theme/input/resize behavior unchanged.
**Where**: `src/renderer/src/components/TerminalPane.tsx`
**Depends on**: T3
**Reuses**: the existing `TerminalPane` (AM1) + renderer `api`
**Requirement**: AGSN-03

**Done when**:
- [ ] attach on mount / detach on cleanup, keyed by `sessionId`; switching sessions detaches the old + attaches the new
- [ ] Existing data/input/resize/theme wiring intact
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 158 pass (no deletions)

**Verify**: `npm run typecheck` green; behavior confirmed at T10.

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): attach/detach TerminalPane to session streams`

---

### T7: NewSessionDialog [P]

**What**: Build the New Session modal — seeded-agent chip grid (`SEEDED_AGENTS`), scrollable worktree cwd grid (from `tree`, with optional task-highlight), dashed "Browse for a folder…" (calls `dialog:pickFolder`), "Will run" preview, Spawn disabled until a cwd is chosen. Calls `onSpawn(agentName, cwd)`. No ad-hoc input, no Settings (AM3).
**Where**: `src/renderer/src/components/NewSessionDialog.tsx` (+ `.css`)
**Depends on**: T2, T3
**Reuses**: `StartWorkDialog`/`NewWorktreeDialog` modal shell + css; `tree`/`repo-options` for the worktree grid; `SEEDED_AGENTS`
**Requirement**: AGSN-02, AGSN-06, AGSN-09

**Done when**:
- [ ] Agent grid + cwd grid + browse + will-run render per handoff; Spawn disabled until cwd chosen
- [ ] `source` prop pre-fills cwd / task-highlight / task header line
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 158 pass (no deletions)

**Verify**: `npm run typecheck` green; visual at T10.

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): add NewSessionDialog`

---

### T8: SessionRail + SessionCard [P]

**What**: Build the 344px rail — header ("AGENTS" + "N running" + "+ New session") and one card per session: agent tile, title, status dot/pill, derived branch + task tag (`taskIdFromBranch` over `tree`), detached/path-missing variants, last-output preview (stopped/path-missing), footer actions (running→Stop; stopped→Respawn+Remove; path-missing→Remove). No concurrency warning (AM3).
**Where**: `src/renderer/src/components/SessionRail.tsx` (+ `.css`)
**Depends on**: T2, T3
**Reuses**: `task-pills.ts`, `Icon.tsx`; the `tree` cwd↔worktree match + `taskIdFromBranch`
**Requirement**: AGSN-04, AGSN-05, AGSN-07, AGSN-08

**Done when**:
- [ ] Cards render all states (running/stopped/path-missing/detached) with correct footer actions + status colors
- [ ] Task tag derived (not stored); selection highlights the card; callbacks (`onSelect`/`onStop`/`onRespawn`/`onRemove`/`onNew`) wired
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 158 pass (no deletions)

**Verify**: `npm run typecheck` green; visual at T10.

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): add session rail + cards`

---

### T9: AgentsView master-detail [P]

**What**: Compose the Agents direction: `<SessionRail>` (left) + terminal detail panel (right) = header bar (agent tile, title, cwd, status pill, Stop/Respawn/Remove) + attribution strip (derived task / detached / path-missing) + `<TerminalPane sessionId={active}>` + stopped footer. Owns `selectedSession` (defaults to first); empty state when no sessions.
**Where**: `src/renderer/src/components/AgentsView.tsx` (+ `.css`)
**Depends on**: T6, T8
**Reuses**: `SessionRail` (T8), `TerminalPane` (T6), `task-pills`, `Icon`; cwd↔worktree derivation
**Requirement**: AGSN-01, AGSN-03, AGSN-04, AGSN-07

**Done when**:
- [ ] Rail + terminal detail render; selecting a card swaps the active terminal; empty state safe
- [ ] Header/attribution/footer reflect the active session's status + derived attribution
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 158 pass (no deletions)

**Verify**: `npm run typecheck` green; visual at T10.

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): add AgentsView master-detail`

---

### T5: index.ts SessionManager wiring + remove spike [P]

**What**: Delete the AM1 throwaway (`registerSpikeAgent`, `spikeSession`, `CLAUDE`/`SPIKE_*`, the `sessions:kill` handler). Instantiate `SessionManager({ port, config: configStore, emit: bound to mainWindow.webContents, fsExists: fs.existsSync, seededAgents: SEEDED_AGENTS })`; register `handle()` for the 7 control channels + `dialog:pickFolder` (reuse the existing `dialog.showOpenDialog({properties:['openDirectory']})` idiom); register `onSend('session:input'/'session:resize')` → manager; call `manager.killAll()` on `window-all-closed`.
**Where**: `src/main/index.ts`
**Depends on**: T4
**Reuses**: `SessionManager` (T4), `emit`/`onSend`/`handle` (existing), `configStore`, the existing folder-dialog idiom
**Requirement**: AGSN-02, AGSN-04, AGSN-05, AGSN-08, AGSN-09

**Done when**:
- [ ] All spike code removed; SessionManager owns every `sessions:*` channel + `dialog:pickFolder`; input/resize routed; `killAll` on quit (no orphan)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 158 pass (no deletions)

**Verify**: `npm run typecheck` green (no stale spike references remain).

**Tests**: none (thin shell — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): wire SessionManager + remove AM1 spike`

---

### T10: Agents direction integration + first dev run

**What**: Remove the renderer spike (`spikeSessionId`/`toggleSpike`/`closeSpike` in `App.tsx`; the spike button in `TopBar.tsx`). Add the third **Agents** segment to `TopBar`. In `App.tsx`: `sessions` state + `refreshSessions()` via `sessions:list`; subscribe `session:status`/`session:exit` to keep the list live; render `<AgentsView>` when `direction==='agents'`; hold `NewSessionDialog` state + an `openNewSession(source)` routing fn (used by the rail "+ New session" and, later, entry points); on spawn call `sessions:spawn` → refresh + select + switch to Agents. Then hand-verify AGSN-01..05.
**Where**: `src/renderer/src/App.tsx`, `src/renderer/src/components/TopBar.tsx` (+ `.css`)
**Depends on**: T5, T7, T9
**Reuses**: `AgentsView` (T9), `NewSessionDialog` (T7), the existing direction-persist path + dialog-state pattern (NewWorktree/StartWork)
**Requirement**: AGSN-01, AGSN-02, AGSN-03, AGSN-04, AGSN-05

**Done when**:
- [ ] Spike code gone; Agents segment switches + persists; rail "+ New session" opens the dialog and spawns
- [ ] **Manual (dev)**: spawn ≥2 agents in different worktrees → both stream independently; type to active reaches only its PTY (AGSN-02)
- [ ] **Manual**: switch to Tree and back → missed output replays then live resumes (AGSN-03); quit agent → card stays running on a shell prompt; `exit` → stopped; Stop → no orphan (AGSN-04)
- [ ] **Manual**: restart app → sessions reappear as stopped; Respawn re-runs in same cwd; Remove (stopped) clears card + config (AGSN-05)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 158 pass (no deletions)

**Verify**: `npm run dev -- -- --remote-debugging-port=9222`; drive by hand and/or a `scripts/smoke-agents.mjs` CDP check; `Get-Process` to confirm no orphaned shells after Stop/quit.

**Tests**: none (renderer + manual — TESTING.md) · **Gate**: full + manual
**Commit**: `feat(agents): Agents direction (rail + terminal) + remove spike`

---

### T11: WorktreeDetail Agents section + session chips [P]

**What**: Insert an "AGENTS" section in `WorktreeDetail` between "Open with" and the Danger row: a **Spawn agent** button (opens the dialog pre-filled cwd = this worktree) + chips for sessions already on this worktree (deep-link → Agents + select that session).
**Where**: `src/renderer/src/components/WorktreeDetail.tsx` (+ `.css`)
**Depends on**: T10
**Reuses**: the App `openNewSession(source)` routing (T10); `sessions` list; `Icon`
**Requirement**: AGSN-06

**Done when**:
- [ ] Spawn-agent button pre-fills this worktree; existing-session chips render + deep-link
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 158 pass (no deletions) · **Manual**: spawn from a worktree detail pane

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): spawn agent from worktree detail`

---

### T12: BoardView card spawn button [P]

**What**: Add a Spawn-agent icon button to the Board worktree-card footer after the launcher icons (1px divider + accent-outlined terminal glyph), pre-filling cwd = that worktree.
**Where**: `src/renderer/src/components/BoardView.tsx` (+ `.css`)
**Depends on**: T10
**Reuses**: App `openNewSession(source)` (T10); existing card-footer launcher layout; `Icon`
**Requirement**: AGSN-06

**Done when**:
- [ ] Footer spawn button pre-fills the card's worktree + opens the dialog
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 158 pass (no deletions) · **Manual**: spawn from a board card

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): spawn agent from board card`

---

### T13: TasksPane Agent button (0/1/many) [P]

**What**: Add an **Agent** button to the pinned-task card footer (beside Start work). Worktree resolution: **0** → disabled-look + "Start work first — no worktree…"; **1** → dialog with that worktree preselected; **many** → dialog with the task's worktrees highlighted + "worktrees for #id highlighted" hint. Dialog header shows "Start an agent for #id title".
**Where**: `src/renderer/src/components/TasksPane.tsx` (+ `.css`)
**Depends on**: T10
**Reuses**: `countWorktreesByTask`/`findWorktree`-style resolution (App, STWK); App `openNewSession(source)` (T10); the dirty-guard disabled pattern
**Requirement**: AGSN-06

**Done when**:
- [ ] 0/1/many resolution behaves per handoff; disabled reason shown at 0; task header line in the dialog
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 158 pass (no deletions) · **Manual**: 0-worktree task disabled; 1-worktree preselects; many highlights

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): spawn agent from pinned task (0/1/many)`

---

### T14: Sidebar row context menu [P]

**What**: Add a worktree-row right-click context menu item "Spawn agent here" to `Sidebar`, pre-filling cwd = that worktree (consistent with T11/T12).
**Where**: `src/renderer/src/components/Sidebar.tsx` (+ `.css`)
**Depends on**: T10
**Reuses**: App `openNewSession(source)` (T10); existing sidebar row interactions
**Requirement**: AGSN-06

**Done when**:
- [ ] Right-click a worktree row → "Spawn agent here" opens the dialog pre-filled
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 158 pass (no deletions) · **Manual**: spawn from the sidebar context menu

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): spawn agent from sidebar context menu`

---

## Parallel Execution Map

```
Phase 1 (parallel):   T1 [P]              T2 [P]
Phase 2 (sequential): T2 ──→ T3
Phase 3 (parallel):   T4 [P](T1,T2,T3)   T6 [P](T3)   T7 [P](T2,T3)   T8 [P](T2,T3)
Phase 4 (parallel):   T5 [P](T4)         T9 [P](T6,T8)
Phase 5 (sequential): T10 (T5,T7,T9) ──→ hand-verify AGSN-01..05 in dev
Phase 6 (parallel):   T11 [P]  T12 [P]  T13 [P]  T14 [P]   (all (T10))
```

---

## Validation — Check 1: Task Granularity

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 class + its tests | ✅ Granular |
| T2 | shared session data model (2 cohesive type files) | ✅ Granular |
| T3 | 1 contract file (cohesive channel additions) | ✅ Granular |
| T4 | 1 orchestrator class + its tests | ✅ Granular |
| T5 | 1 wiring block in 1 file | ✅ Granular |
| T6 | 1 component delta | ✅ Granular |
| T7 | 1 dialog component | ✅ Granular |
| T8 | 1 rail component (+ card) | ✅ Granular |
| T9 | 1 composition component | ✅ Granular |
| T10 | 1 integration (App + TopBar segment) | ✅ Granular |
| T11 | 1 component delta | ✅ Granular |
| T12 | 1 component delta | ✅ Granular |
| T13 | 1 component delta | ✅ Granular |
| T14 | 1 component delta | ✅ Granular |

## Validation — Check 2: Diagram ↔ Definition Cross-Check

| Task | Depends on (body) | Diagram arrows | Status |
| ---- | ----------------- | -------------- | ------ |
| T1 | None | none | ✅ |
| T2 | None | none | ✅ |
| T3 | T2 | T2→T3 | ✅ |
| T4 | T1, T2, T3 | T1,T2,T3→T4 | ✅ |
| T6 | T3 | T3→T6 | ✅ |
| T7 | T2, T3 | T2,T3→T7 | ✅ |
| T8 | T2, T3 | T2,T3→T8 | ✅ |
| T5 | T4 | T4→T5 | ✅ |
| T9 | T6, T8 | T6,T8→T9 | ✅ |
| T10 | T5, T7, T9 | T5,T7,T9→T10 | ✅ |
| T11 | T10 | T10→T11 | ✅ |
| T12 | T10 | T10→T12 | ✅ |
| T13 | T10 | T10→T13 | ✅ |
| T14 | T10 | T10→T14 | ✅ |

No two `[P]` tasks in the same phase depend on each other. ✅ (Phase 3: T4/T6/T7/T8 independent; Phase 4: T5/T9 independent; Phase 6: T11–T14 independent files.)

## Validation — Check 3: Test Co-location

| Task | Code layer | Matrix requires | Task says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | extracted pure helper (ring buffer) | **unit** | unit | ✅ |
| T2 | shared types + DEFAULT_CONFIG | none (typecheck; `ConfigStore` merge already covered) | none | ✅ |
| T3 | IPC contract (types) | none (typecheck) | none | ✅ |
| T4 | main deep module (`SessionManager`) | **unit** | unit | ✅ |
| T5 | thin `index.ts` IPC wiring | none (hand-verified) | none | ✅ |
| T6 | renderer React | none (CDP/visual) | none | ✅ |
| T7 | renderer React | none (CDP/visual) | none | ✅ |
| T8 | renderer React | none (CDP/visual) | none | ✅ |
| T9 | renderer React | none (CDP/visual) | none | ✅ |
| T10 | renderer React | none (CDP + manual) | none | ✅ |
| T11 | renderer React | none (CDP/visual) | none | ✅ |
| T12 | renderer React | none (CDP/visual) | none | ✅ |
| T13 | renderer React | none (CDP/visual) | none | ✅ |
| T14 | renderer React | none (CDP/visual) | none | ✅ |

The two unit-required layers (pure `SessionRingBuffer` T1, deep `SessionManager` T4) carry their tests in-task. No test deferral.

---

## Requirement Coverage

| Req | Tasks |
| --- | ----- |
| AGSN-01 Agents direction | T2, T9, T10 |
| AGSN-02 spawn N sessions | T3, T4, T5, T7, T10 |
| AGSN-03 attach/detach replay | T1, T4, T6, T9 |
| AGSN-04 status + Stop | T4, T8, T10 |
| AGSN-05 persist/restore/respawn/remove | T2, T4, T8, T10 |
| AGSN-06 entry points | T7, T11, T12, T13, T14 |
| AGSN-07 derived attribution | T8, T9 |
| AGSN-08 reconcile/path-missing | T4, T5, T8 |
| AGSN-09 detached browse | T3, T5, T7 |

14 tasks, all 9 requirements covered.
