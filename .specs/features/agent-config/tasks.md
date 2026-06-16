# Agent Config & Integration (AM3) Tasks

**Design**: `.specs/features/agent-config/design.md`
**Spec**: `.specs/features/agent-config/spec.md`
**Status**: **EXECUTED T1–T11** on `feature/agent-config` (11 commits). Automated gate green: `npm run typecheck` + `npm run lint` (0 errors, 4 pre-existing smoke-script warnings) + **183 tests** + `electron-vite build`. **Remaining:** interactive AGCF-01..08 dev verification (CDP/visual — needs a registered workspace + real agent binaries), then open PR `Closes #<AM3 issue>`.

**Test baseline**: green count on `main` at execution start = **168** (14 files; AM2's 166 + 2 from the merged `app-icons`/`vs2022-admin-shortcut`). Two tasks add/extend unit suites: **T1** `buildRawSpawnPlan` (+5 in `spawn-plan.test.ts`) → 173, and **T4** `SessionManager` grow (+10 in `session-manager.test.ts`, existing cases updated for the new constructor) → **183** at the end. Every other task is `Tests: none` per the TESTING.md matrix (shared types via `typecheck`; thin `index.ts` IPC wiring + renderer React hand-verified via CDP/visual).

**Tools (all tasks)**: MCP: NONE · Skill: NONE — config + polish over AM2's engine; no external tools.

**Promote-don't-rewrite**: nothing is deleted. `SEEDED_AGENTS` is demoted to the `DEFAULT_CONFIG.agents` seed; `buildSpawnPlan` is untouched (ad-hoc gets the new sibling); `SessionManager`'s public surface grows by `rename`/`duplicate`; the full-ANSI terminal theme already shipped in AM2 (only the per-agent tile colour is new).

---

## Execution Plan

### Phase 1 — Foundation (sequential: spawn-plan owns `AgentDef`)

```
T1 (buildRawSpawnPlan + AgentDef.color field + unit tests)
   └─→ T2 (shared data model: config.ts + agents.ts colours)
```

### Phase 2 — Contract (sequential)

```
T2 ──→ T3 (IPC: widen sessions:spawn + add sessions:rename / sessions:duplicate)
```

### Phase 3 — Core + renderer leaves (parallel)

```
T1,T2,T3 ──→ T4  [P]  (SessionManager grow + unit tests)
T2,T3 ──────→ T6  [P]  (SettingsDialog: agents + default shell)
T2,T3 ──────→ T7  [P]  (NewSessionDialog: ad-hoc)
T2 ─────────→ T8  [P]  (SessionRail/Card: banner + tile colour + preview)
T2,T3 ──────→ T9  [P]  (AgentsView detail: rename + duplicate + TerminalPane de-stale)
T2 ─────────→ T10 [P]  (RemoveWorktreeConfirm + WorktreeDetail gate)
```

### Phase 4 — Main wiring (sequential)

```
T4 ──→ T5 (index.ts: drop seededAgents dep, register rename/duplicate handlers)
```

### Phase 5 — App composition + integration dev run (sequential)

```
T5,T6,T7,T8,T9,T10 ──→ T11 ──→ [hand-verify AGCF-01..08 in dev]
```

---

## Task Breakdown

### T1: `buildRawSpawnPlan` pure seam + `AgentDef.color` + unit tests

**What**: In `spawn-plan.ts` add `export function buildRawSpawnPlan(command: string, cwd: string, shell: Shell): SpawnPlan` that wraps the raw command **verbatim** (`pwsh -NoExit -Command <command>` / `cmd /K <command>`) without per-token re-quoting; and add optional `color?: string` to `AgentDef`. Leave `buildSpawnPlan` untouched.
**Where**: `src/main/spawn-plan.ts` (+ `src/main/spawn-plan.test.ts`)
**Depends on**: None
**Reuses**: the existing `Shell`/`SpawnPlan` types + the `-NoExit`/`/K` keep-shell-live convention; the pure-test pattern already in `spawn-plan.test.ts`
**Requirement**: AGCF-03 (+ AGCF-01 colour field)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `buildRawSpawnPlan` returns the verbatim line as `autoCommand` for both shells; `buildSpawnPlan` unchanged
- [ ] `AgentDef.color?: string` added (optional; no other change to the interface)
- [ ] +5 unit cases: pwsh wraps verbatim, cmd wraps verbatim, a line with spaces/quotes is passed through unaltered, empty command, a metacharacter-bearing line is not re-quoted
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 168 + 5 = 173 pass (no deletions)

**Verify**: `npx vitest run src/main/spawn-plan.test.ts` green.

**Tests**: unit (pure seam — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): add buildRawSpawnPlan + AgentDef colour`

---

### T2: shared data model — registry, default shell, ad-hoc, preview

**What**: In `config.ts`: add `agents: AgentDef[]` to `AppConfig`; add `defaultShell: Shell` to `AppConfig.ui`; add `command?: string` to `PersistedSession`; add `lastOutput?: string` to `SessionView`; set `DEFAULT_CONFIG.agents = SEEDED_AGENTS` and `DEFAULT_CONFIG.ui.defaultShell = 'pwsh'`. In `agents.ts`: add `color` to each seeded agent (Claude/Copilot/Codex per the handoff agent→colour mapping).
**Where**: `src/shared/config.ts`, `src/shared/agents.ts`
**Depends on**: T1 (`AgentDef.color`)
**Reuses**: `AgentDef`/`Shell` from `spawn-plan.ts` (type-only import precedent already in `agents.ts`); the `sessions: []` / `pinnedTasks: []` array-key precedent
**Requirement**: AGCF-01, AGCF-02, AGCF-03, AGCF-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `AppConfig.agents` + `ui.defaultShell` + `PersistedSession.command?` + `SessionView.lastOutput?` typed; `DEFAULT_CONFIG` seeds agents from `SEEDED_AGENTS` and `defaultShell='pwsh'`
- [ ] `SEEDED_AGENTS` each carry a `color`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 173 pass (no new tests, no deletions)

**Verify**: `npm run typecheck` green; a pre-AM3 config (no `agents`/`defaultShell` key) reloads with the seeded three + `pwsh` (existing `ConfigStore.load` parsed-over-defaults merge — verified).

**Tests**: none (shared types — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): config schema for registry, default shell, ad-hoc, preview`

---

### T3: IPC contract — widen spawn, add rename + duplicate

**What**: In `ipc-contract.ts`: widen `sessions:spawn` req to `{ agentName: string; cwd: string; adhocCommand?: string }`; add `sessions:rename` (`{ id, title }` → `SessionView`) and `sessions:duplicate` (`{ id }` → `SessionView`) to `IpcContract`. No `IpcEvents`/`IpcSends` change.
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: T2
**Reuses**: the existing typed `IpcContract` discipline; the generic preload `invoke` bridge (no preload/api change)
**Requirement**: AGCF-03, AGCF-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `sessions:spawn` carries optional `adhocCommand`; `sessions:rename` + `sessions:duplicate` added
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` (surfaces the spawn call site to update — expected, handled in T11)
- [ ] Test count: 173 pass (no deletions)

**Verify**: `npm run typecheck` flags `App.tsx`'s `sessions:spawn` call (updated in T11).

**Tests**: none (contract types — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): IPC for ad-hoc spawn + rename + duplicate`

---

### T4: SessionManager grow + unit tests [P]

**What**: Grow `SessionManager`: drop `seededAgents` from `SessionManagerDeps`; `#resolve` reads `config.get().agents`; `#start` uses `config.get().ui.defaultShell` and picks `buildRawSpawnPlan` when `meta.command` is set, else `buildSpawnPlan`; `spawn(agentName, cwd, adhocCommand?)` persists `command` for ad-hoc (`agent:'Ad-hoc'`); add `rename(id, title)` (trim; empty = no-op) and `duplicate(id)` (clone agent+cwd+command into a new running session); retain the ring buffer past stop in a `#retained` map so `#toView` sets `lastOutput = tail(2)` (cleared on respawn/remove; absent for restored-stopped).
**Where**: `src/main/session-manager.ts` (+ `src/main/session-manager.test.ts`)
**Depends on**: T1, T2, T3
**Reuses**: `buildSpawnPlan`/`buildRawSpawnPlan` (T1), `SessionRingBuffer.tail`, `ConfigStore`, `PtyPort`; the existing DI fake-test harness in `session-manager.test.ts`
**Requirement**: AGCF-01, AGCF-02, AGCF-03, AGCF-04, AGCF-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `#resolve` reads `config.agents`; constructor no longer takes `seededAgents`; existing tests updated to the new constructor (seed agents via the temp-dir config)
- [ ] `#start` reads `config.ui.defaultShell`; ad-hoc routes through `buildRawSpawnPlan`; `spawn` persists `command` for ad-hoc; `respawn` re-runs ad-hoc via stored `command`
- [ ] `rename` trims + no-ops empty + persists; `duplicate` creates an independent running session cloning agent+cwd(+command)
- [ ] buffer retained past stop → `lastOutput=tail(2)`; cleared on respawn/remove; undefined after restore (no retained buffer)
- [ ] +10 unit cases: resolve-from-config, unknown-agent throws, defaultShell used in plan, ad-hoc spawn persists command, ad-hoc respawn re-runs command, rename trims, rename empty no-op, duplicate clones+independent, lastOutput after stop, lastOutput cleared on respawn / absent after restore
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 173 + 10 = 183 pass (no deletions)

**Verify**: `npx vitest run src/main/session-manager.test.ts` green.

**Tests**: unit (main deep module — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): SessionManager registry/shell/ad-hoc/rename/duplicate/preview`

---

### T6: SettingsDialog — Coding agents + Default shell [P]

**What**: Add a **Coding agents** section to `SettingsDialog`: a list of agent rows (tile + name + `command args` mono + Edit pencil + Delete trash) and a dashed "+ Add agent" with an inline add/edit form (name / command / args / colour); saves the whole array via `config:patch { agents }`. Add a **Default shell** section: segmented **pwsh | cmd** saved via `config:patch { ui: { defaultShell } }`. Widen the dialog header beyond "Azure DevOps & branch template".
**Where**: `src/renderer/src/components/SettingsDialog.tsx` (+ its CSS)
**Depends on**: T2, T3
**Reuses**: the existing dialog body + `config:get`/`config:patch` + `busy`/`loaded` pattern already in `SettingsDialog`
**Requirement**: AGCF-01, AGCF-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Agents list renders from `config.agents`; add/edit/delete mutate the array and persist via `config:patch`; existing seeded three appear
- [ ] Default-shell segmented control reflects + persists `ui.defaultShell`
- [ ] Existing ADO/template fields unchanged
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 183 pass (no deletions)

**Verify**: `npm run typecheck` green; visual at T11.

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): Settings — editable agent registry + default shell`

---

### T7: NewSessionDialog — ad-hoc command [P]

**What**: Change `NewSessionDialog` to take agents via a prop (`agents: AgentDef[]`, App passes `config.agents`) instead of importing `SEEDED_AGENTS`. Add an **Ad-hoc command** chip (amber tile, `>_`) after the registered agents; selecting it reveals a mono command `<input>`; the "Will run" preview + Spawn-enable use the typed command (empty ⇒ disabled). Widen `onSpawn` to `(agentName, cwd, adhocCommand?)`.
**Where**: `src/renderer/src/components/NewSessionDialog.tsx` (+ its CSS)
**Depends on**: T2, T3
**Reuses**: the existing agent-chip grid, cwd grid, browse, "Will run" preview
**Requirement**: AGCF-03

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Agent grid renders from the prop; Ad-hoc chip + command input present; empty command keeps Spawn disabled
- [ ] `onSpawn` forwards `adhocCommand` when Ad-hoc is selected
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 183 pass (no deletions)

**Verify**: `npm run typecheck` green; visual at T11.

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): NewSessionDialog ad-hoc command option`

---

### T8: SessionRail/Card — concurrency banner + tile colour + preview [P]

**What**: In `SessionRail`: render an amber **concurrency banner** when `runningCount >= 4` ("N live sessions — each is a real OS process consuming resources."). In `SessionCard`: tint the agent tile from the resolved `AgentDef.color` (look up `session.agent` in a new `agents` prop; default token, ad-hoc → `--amber`); render up to 2 tail lines from `session.lastOutput` on stopped/path-missing cards.
**Where**: `src/renderer/src/components/SessionRail.tsx` (+ `.css`)
**Depends on**: T2
**Reuses**: existing card structure, `runningCount`, status dot/footer; `Icon`
**Requirement**: AGCF-06, AGCF-07, AGCF-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Banner shows at ≥4 running, hidden below; informational only
- [ ] Tile tints per agent colour (default for unknown/ad-hoc); `agents` prop threaded through
- [ ] `lastOutput` preview (≤2 lines) renders on stopped/path-missing cards when present, blank when absent
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 183 pass (no deletions)

**Verify**: `npm run typecheck` green; visual at T11.

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): rail concurrency warning + tile colour + last-output preview`

---

### T9: AgentsView detail — rename + duplicate + theming verify [P]

**What**: In `AgentsView`'s `SessionDetail` header: add an inline **rename pencil** → editable title `<input>` committing via `onRename` (Enter/blur; Esc cancels; empty keeps prior), and a **Duplicate** icon button → `onDuplicate`. Tint the detail tile from `AgentDef.color` (new `agents` prop). De-stale the `TerminalPane` "basic theme / P2 polish (T12)" comment (the full-palette map + re-emit already shipped) — comment-only edit, confirm AGCF-07.
**Where**: `src/renderer/src/components/AgentsView.tsx` (+ `.css`), `src/renderer/src/components/TerminalPane.tsx` (comment only)
**Depends on**: T2, T3
**Reuses**: the existing detail header/strip/terminal layout; `Icon`; `TerminalPane.readTheme()` (unchanged behaviour)
**Requirement**: AGCF-04, AGCF-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Rename pencil edits the title and calls `onRename(id, title)`; empty keeps prior; Duplicate calls `onDuplicate(id)`
- [ ] Detail tile tints per agent colour; `TerminalPane` comment de-staled (no behaviour change)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 183 pass (no deletions)

**Verify**: `npm run typecheck` green; visual at T11.

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): detail rename + duplicate + tile colour`

---

### T10: RemoveWorktreeConfirm + WorktreeDetail gate [P]

**What**: Add `RemoveWorktreeConfirm.tsx` (modal chassis): red warning tile + one row per running session + the dirty-guard note + Cancel / **Terminate & remove**. In `WorktreeDetail`, intercept the worktree-remove click: if any of its `sessions` are `running`, open the dialog instead of removing; on confirm `await sessions:stop` for each running id, then run the existing `worktrees:remove` path; no running sessions ⇒ remove as today.
**Where**: `src/renderer/src/components/RemoveWorktreeConfirm.tsx` (+ CSS), `src/renderer/src/components/WorktreeDetail.tsx`
**Depends on**: T2
**Reuses**: the modal chassis (`StartWorkDialog.css`); existing `sessions:stop` + `worktrees:remove`; `WorktreeDetail`'s existing `sessions` prop; `deriveAttribution`
**Requirement**: AGCF-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Running sessions in the worktree → confirm dialog lists them; Cancel aborts both; Terminate & remove stops each then removes
- [ ] No running sessions → existing remove path unchanged
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 183 pass (no deletions)

**Verify**: `npm run typecheck` green; hand-verify at T11 (`Get-Process` shows no orphan after Terminate & remove).

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): confirm worktree removal with running sessions`

---

### T5: index.ts wiring — drop seededAgents, register rename/duplicate

**What**: In `index.ts`, construct `SessionManager` without `seededAgents` (agents come from config); register `handle('sessions:rename', ({id,title}) => sessions.rename(id,title))` and `handle('sessions:duplicate', ({id}) => sessions.duplicate(id))`; update the `sessions:spawn` handler to pass `adhocCommand` through.
**Where**: `src/main/index.ts`
**Depends on**: T4
**Reuses**: the existing `handle()` wiring + `SessionManager` construction block
**Requirement**: AGCF-01, AGCF-03, AGCF-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `SessionManager` built without `seededAgents`; `sessions:rename`/`:duplicate` handled; `sessions:spawn` forwards `adhocCommand`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 183 pass (no deletions)

**Verify**: `npm run typecheck` green (no stale `seededAgents` reference).

**Tests**: none (thin shell — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): wire rename/duplicate + config-sourced agents`

---

### T11: App composition + integration dev run

**What**: In `App.tsx`: load `config.agents` into state (refresh on settings save) and pass it to `NewSessionDialog`/`SessionRail`/`AgentsView`; widen `spawnSession` to forward `adhocCommand`; add `renameSession(id,title)` + `duplicateSession(id)` (invoke + refresh + select); wire the SettingsDialog `onSaved` to refresh agents; ensure the worktree-remove refresh also refreshes sessions. Open `SettingsDialog` from the existing gear. Then hand-verify AGCF-01..08 in dev.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T5, T6, T7, T8, T9, T10
**Reuses**: the existing `sessions`/`refreshSessions`/dialog-state patterns; the existing gear→`settingsOpen`
**Requirement**: AGCF-01, AGCF-02, AGCF-03, AGCF-04, AGCF-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Agents threaded to dialog/rail/detail; spawn forwards ad-hoc; rename/duplicate invoke + refresh + select; settings save refreshes the agent list
- [ ] **Manual (dev)**: add/edit/delete an agent in Settings → chip appears/disappears, running session unaffected by delete (AGCF-01); switch default shell → next spawn's PTY changes, running untouched (AGCF-02); ad-hoc spawns + registry unchanged (AGCF-03)
- [ ] **Manual**: rename persists across restart; duplicate gives a 2nd independent live session (AGCF-04); remove a worktree with a running session → confirm → zero orphans via `Get-Process`; none-running → no dialog (AGCF-05)
- [ ] **Manual**: 4 running → banner; agent output colourised + recolours on theme toggle; stopped card shows preview, blank after restart (AGCF-06/07/08)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 183 pass (no deletions)

**Verify**: `npm run dev -- -- --remote-debugging-port=9222`; drive by hand and/or a `scripts/smoke-agent-config.mjs` CDP check; `Get-Process` confirms no orphaned shells after Terminate & remove.

**Tests**: none (renderer + manual — TESTING.md) · **Gate**: full + manual
**Commit**: `feat(agents): wire registry/ad-hoc/rename/duplicate/confirm in App`

---

## Parallel Execution Map

```
Phase 1 (sequential): T1 ──→ T2
Phase 2 (sequential): T2 ──→ T3
Phase 3 (parallel):   T4 [P](T1,T2,T3)  T6 [P](T2,T3)  T7 [P](T2,T3)  T8 [P](T2)  T9 [P](T2,T3)  T10 [P](T2)
Phase 4 (sequential): T4 ──→ T5
Phase 5 (sequential): T5,T6,T7,T8,T9,T10 ──→ T11 ──→ hand-verify AGCF-01..08 in dev
```

---

## Validation — Check 1: Task Granularity

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 pure function + 1 type field + its tests | ✅ Granular |
| T2 | shared data model (2 cohesive type files) | ✅ Granular |
| T3 | 1 contract file (cohesive channel additions) | ✅ Granular |
| T4 | 1 orchestrator class grow + its tests | ✅ Granular |
| T5 | 1 wiring block in 1 file | ✅ Granular |
| T6 | 1 dialog component (2 cohesive sections) | ✅ Granular |
| T7 | 1 dialog component delta | ✅ Granular |
| T8 | 1 rail component (banner + card polish) | ✅ Granular |
| T9 | 1 detail component delta (+ 1 comment edit) | ✅ Granular |
| T10 | 1 new dialog + 1 gate delta | ✅ Granular |
| T11 | 1 composition (App state + wiring) | ✅ Granular |

## Validation — Check 2: Diagram ↔ Definition Cross-Check

| Task | Depends on (body) | Diagram arrows | Status |
| ---- | ----------------- | -------------- | ------ |
| T1 | None | none | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 | ✅ |
| T4 | T1, T2, T3 | T1,T2,T3→T4 | ✅ |
| T6 | T2, T3 | T2,T3→T6 | ✅ |
| T7 | T2, T3 | T2,T3→T7 | ✅ |
| T8 | T2 | T2→T8 | ✅ |
| T9 | T2, T3 | T2,T3→T9 | ✅ |
| T10 | T2 | T2→T10 | ✅ |
| T5 | T4 | T4→T5 | ✅ |
| T11 | T5, T6, T7, T8, T9, T10 | T5,T6,T7,T8,T9,T10→T11 | ✅ |

No two `[P]` tasks in the same phase depend on each other. ✅ (Phase 3: T4/T6/T7/T8/T9/T10 touch disjoint files — `session-manager.ts`, `SettingsDialog.tsx`, `NewSessionDialog.tsx`, `SessionRail.tsx`, `AgentsView.tsx`+`TerminalPane.tsx`, `RemoveWorktreeConfirm.tsx`+`WorktreeDetail.tsx`.)

## Validation — Check 3: Test Co-location

| Task | Code layer | Matrix requires | Task says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | extracted pure helper (spawn plan) | **unit** | unit | ✅ |
| T2 | shared types + DEFAULT_CONFIG | none (typecheck; `ConfigStore` merge already covered) | none | ✅ |
| T3 | IPC contract (types) | none (typecheck) | none | ✅ |
| T4 | main deep module (`SessionManager`) | **unit** | unit | ✅ |
| T5 | thin `index.ts` IPC wiring | none (hand-verified) | none | ✅ |
| T6 | renderer React | none (CDP/visual) | none | ✅ |
| T7 | renderer React | none (CDP/visual) | none | ✅ |
| T8 | renderer React | none (CDP/visual) | none | ✅ |
| T9 | renderer React | none (CDP/visual) | none | ✅ |
| T10 | renderer React | none (CDP/visual) | none | ✅ |
| T11 | renderer React | none (CDP + manual) | none | ✅ |

The two unit-required layers (pure `buildRawSpawnPlan` T1, deep `SessionManager` T4) carry their tests in-task. No test deferral.

---

## Requirement Coverage

| Req | Tasks |
| --- | ----- |
| AGCF-01 registry + Settings | T1, T2, T4, T5, T6, T11 |
| AGCF-02 default shell | T2, T4, T6, T11 |
| AGCF-03 ad-hoc command | T1, T2, T3, T4, T5, T7, T11 |
| AGCF-04 rename + duplicate | T3, T4, T5, T9, T11 |
| AGCF-05 remove-worktree confirm | T10, T11 |
| AGCF-06 concurrency warning | T8 |
| AGCF-07 ANSI palette + tile colour | T8, T9 |
| AGCF-08 last-output preview | T2, T4, T8 |

11 tasks, all 8 requirements covered. End state: **183 tests** green + manual CDP for the OS/IPC/renderer surfaces.
