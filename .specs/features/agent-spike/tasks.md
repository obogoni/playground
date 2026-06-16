# Agent Spike (AM1) Tasks

**Design**: `.specs/features/agent-spike/design.md`
**Spec**: `.specs/features/agent-spike/spec.md`
**Status**: Draft

**Test baseline**: anchor to the green count on the working branch at execution start (TESTING.md records **125 on main**; **137** if branched after worktree-name-template merges). Only **T2** adds unit tests (+5 spawn-plan cases); every other task is `Tests: none` per the TESTING.md matrix (thin OS/Electron shells + renderer React are hand-verified, not unit-tested) — which is the whole point of a de-risk spike.

---

## Execution Plan

### Phase 1 — Foundation (parallel)

Independent groundwork: the native dep + externalize config, the pure seam, and the typed contract.

```
T1 [P]   (node-pty dep + externalizeDepsPlugin)
T2 [P]   (buildSpawnPlan + unit tests)
T4 [P]   (streaming IPC contract types)
```

### Phase 2 — Plumbing (parallel)

```
T1,T2 ──→ T3 [P]   (PtyPort)
T4 ──────→ T5 [P]  (main emit/onSend)
T4 ──────→ T6 [P]  (preload on/send bridge)
T4 ──────→ T7 [P]  (renderer api on/send)
```

### Phase 3 — Surfaces (parallel)

```
T7 ──────→ T8 [P]      (TerminalPane + xterm deps)
T3,T5 ───→ T9 [P]      (spike orchestrator in index.ts)
```

### Phase 4 — Integration (sequential) → first end-to-end dev run

```
T8,T9 ──→ T10 ──→ [hand-verify ASPK-02/03/04 in dev]
```

### Phase 5 — De-risk deliverable (sequential)

```
T10 ──→ T11   (build:win → install → run; asarUnpack fallback; record Lesson)
```

### Phase 6 — P2 polish

```
T10 ──→ T12   (full token theming + refit + blinking caret)
```

---

## Task Breakdown

### T1: node-pty dependency + externalize main build [P]

**What**: Add `node-pty` as a runtime dependency, add `externalizeDepsPlugin()` to the `main` (and `preload`) electron-vite config so node-pty is externalized (not bundled), and rebuild it against Electron's ABI.
**Where**: `package.json` (deps), `electron.vite.config.ts`
**Depends on**: None
**Reuses**: existing `postinstall: electron-builder install-app-deps`, `npmRebuild: false`

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `node-pty` is in `dependencies`; `npm install` + postinstall rebuild completes without native build error
- [ ] `electron.vite.config.ts` `main` (+ `preload`) include `externalizeDepsPlugin()` (imported from `electron-vite`)
- [ ] `npm run build` succeeds and `out/main/index.js` does **not** inline node-pty (it appears as a `require('node-pty')`)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline tests pass (no new tests, no deletions)

**Verify**: `npm run build` green; grep `out/main/index.js` for `require("node-pty")`.

**Tests**: none · **Gate**: build
**Commit**: `build(agents): add node-pty + externalize main bundle`

---

### T2: buildSpawnPlan pure helper + unit tests [P]

**What**: Implement `buildSpawnPlan(agent, cwd, shell)` returning `{ file, args, cwd, autoCommand }` — shell auto-runs the agent (`pwsh -NoExit -Command`, `cmd /K`), keeping the shell live after the agent quits.
**Where**: `src/main/spawn-plan.ts` (+ `src/main/spawn-plan.test.ts`)
**Depends on**: None
**Reuses**: the `code`-is-a-`.cmd`-shim lesson from `shortcut-launcher.ts`; pure-test pattern from `shortcut-launcher.test.ts`

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Returns the pwsh shape (`pwsh.exe`, `['-NoExit','-Command', autoCommand]`) and the cmd shape (`cmd.exe`, `['/K', autoCommand]`)
- [ ] `autoCommand` joins `command` + `args`; `cwd` passes through untouched; no FS / no spawn in the function
- [ ] ≥5 unit cases: pwsh shape, cmd shape, args joined, cwd passthrough, agent with extra args
- [ ] Gate check passes: `npm test`
- [ ] Test count: baseline + 5 pass (no deletions)

**Verify**: `npm test` — `spawn-plan.test.ts` green.

**Tests**: unit · **Gate**: quick
**Commit**: `feat(agents): add buildSpawnPlan shell-host planner`

---

### T4: streaming IPC contract types [P]

**What**: Add `sessions:spawn` to `IpcContract`; add `IpcEvents` (`session:data`, `session:exit`) and `IpcSends` (`session:input`, `session:resize`) maps; extend `RendererApi` with typed `on()` (returns unsubscribe) and `send()`.
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: None
**Reuses**: the existing `IpcContract` / `RendererApi` typed-map discipline

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `sessions:spawn: { req: { cwd: string }; res: { id: string } }` added to `IpcContract`
- [ ] `IpcEvents` / `IpcSends` maps + `IpcEvent`/`IpcSend` key types exported; payloads carry `id`
- [ ] `RendererApi.on`/`send` typed against the maps
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline pass (no deletions)

**Verify**: `npm run typecheck` green (maps coherent).

**Tests**: none · **Gate**: full
**Commit**: `feat(agents): add streaming IPC event/send contract (AD-004)`

---

### T3: PtyPort node-pty adapter [P]

**What**: Implement `PtyPort.spawn(plan, env?)` returning a `PtyHandle` (`onData`/`onExit`/`write`/`resize`/`kill`) over node-pty (ConPTY), inheriting `process.env`.
**Where**: `src/main/pty-port.ts`
**Depends on**: T1, T2
**Reuses**: `SpawnPlan` type (T2); child-process idioms from `shortcut-launcher.ts`

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `spawn` calls `pty.spawn(plan.file, plan.args, { name:'xterm-color', cwd:plan.cwd, env:{...process.env,...env}, useConpty:true })`
- [ ] `PtyHandle` exposes `onData`, `onExit`, `write`, `resize`, `kill` delegating to the node-pty instance
- [ ] Only this file imports `node-pty` (the OS seam stays tiny)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline pass (no deletions)

**Verify**: `npm run typecheck` green (node-pty types resolve). Behavior hand-verified via T10/T11.

**Tests**: none (thin OS shell — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): add PtyPort node-pty adapter`

---

### T5: main emit/onSend helpers [P]

**What**: Add `emit(webContents, channel, payload)` (over `webContents.send`) and `onSend(channel, fn)` (over `ipcMain.on`), typed against `IpcEvents`/`IpcSends`.
**Where**: `src/main/ipc.ts`
**Depends on**: T4
**Reuses**: the existing `handle()` wrapper pattern in the same file

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `emit` / `onSend` typed peers to `handle()`, checked against the new maps
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline pass (no deletions)

**Verify**: `npm run typecheck` green.

**Tests**: none (IPC wiring — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): add typed emit/onSend IPC helpers`

---

### T6: preload on/send bridge [P]

**What**: Extend the preload `api` with `on(channel, listener)` (returns unsubscribe) and `send(channel, payload)`; update `index.d.ts`.
**Where**: `src/preload/index.ts`, `src/preload/index.d.ts`
**Depends on**: T4
**Reuses**: the untyped-passthrough bridge style already in `index.ts`

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `api.on` wraps `ipcRenderer.on` and returns a function that removes the listener
- [ ] `api.send` wraps `ipcRenderer.send`
- [ ] `RendererApi` (via `index.d.ts`) reflects both
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline pass (no deletions)

**Verify**: `npm run typecheck` (node + web) green.

**Tests**: none (IPC wiring — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): expose on/send on the preload bridge`

---

### T7: renderer api on/send [P]

**What**: Add `on`/`send` to the renderer `api` wrapper, mirroring the `invoke` error-wrapping style.
**Where**: `src/renderer/src/lib/api.ts`
**Depends on**: T4
**Reuses**: the existing `api.invoke` wrapper in the same file

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `api.on(channel, listener)` delegates to `window.api.on` and returns the unsubscribe
- [ ] `api.send(channel, payload)` delegates to `window.api.send`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline pass (no deletions)

**Verify**: `npm run typecheck:web` green.

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): add on/send to the renderer api client`

---

### T8: TerminalPane xterm component + xterm deps [P]

**What**: Add `@xterm/xterm` + `@xterm/addon-fit` deps; build `TerminalPane` — mounts xterm + FitAddon, subscribes `session:data`→`term.write`, `term.onData`→`session:input`, resize→`fit()`+`session:resize`, `session:exit`→"shell exited" line; basic readable theme; disposes on unmount.
**Where**: `src/renderer/src/components/TerminalPane.tsx` (+ `.css`), `package.json`
**Depends on**: T7
**Reuses**: renderer `api` (T7); theme tokens (`tokens.css`); existing component/css conventions

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `@xterm/xterm` + `@xterm/addon-fit` in `dependencies`
- [ ] `<TerminalPane sessionId>` renders an xterm bound to that id over the streaming api; input + resize wired; exit shows a line
- [ ] Unsubscribes + `term.dispose()` on unmount (no leak across remounts)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline pass (no deletions)

**Verify**: `npm run typecheck` green; visual confirm after T10.

**Tests**: none (renderer — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): add TerminalPane xterm component`

---

### T9: spike orchestrator + PTY↔IPC wiring [P]

**What**: Lift `mainWindow` out of `createWindow()`; add `handle('sessions:spawn', { cwd })` → `buildSpawnPlan(CLAUDE,cwd,'pwsh')` → `PtyPort.spawn`; wire `onData`→`emit('session:data')`, `onExit`→`emit('session:exit')`, `onSend('session:input')`→`write`, `onSend('session:resize')`→`resize`; hold the single handle module-scoped; kill it on `window-all-closed`. Mark this block clearly as throwaway (replaced by `SessionManager` in AM2).
**Where**: `src/main/index.ts`
**Depends on**: T3, T5
**Reuses**: `PtyPort` (T3), `emit`/`onSend` (T5), `handle` (existing), `buildSpawnPlan` (T2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `sessions:spawn` returns a fixed `id` and starts a live PTY; output flows over `session:data`; input/resize reach the PTY; exit emits `session:exit`
- [ ] PTY killed on quit (no orphan)
- [ ] Block annotated `// AM1 spike — throwaway, replaced by SessionManager in AM2`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline pass (no deletions)

**Verify**: `npm run typecheck` green; behavior confirmed in T10.

**Tests**: none (thin shell — TESTING.md) · **Gate**: full
**Commit**: `feat(agents): wire spike PTY orchestrator over streaming IPC`

---

### T10: throwaway trigger + first dev run

**What**: Add a clearly-temporary trigger (a TopBar button toggling local `spikeOpen` state in `App.tsx`) that calls `sessions:spawn` with a fixed cwd and renders `<TerminalPane>` for the returned id — **no `ui.direction`/config schema change**. Then hand-verify the full loop in `dev`.
**Where**: `src/renderer/src/App.tsx`, `src/renderer/src/components/TopBar.tsx` (+ `.css`)
**Depends on**: T8, T9
**Reuses**: `TerminalPane` (T8), renderer `api` (T7), TopBar button styling

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Temp trigger spawns + shows the terminal; trigger annotated as throwaway (removed in AM2)
- [ ] **Manual (dev)**: Claude banner appears in the embedded terminal; typing reaches it and it responds; answering a prompt works; window resize reflows (ASPK-02/03/04)
- [ ] Agent quitting drops to a live shell prompt (terminal stays usable); `exit` fires `session:exit` and shows "shell exited"
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline pass (no deletions)

**Verify**: `npm run dev -- -- --remote-debugging-port=9222`; drive the terminal by hand (and/or a `scripts/smoke-agent.mjs` CDP check).

**Tests**: none (renderer + manual — TESTING.md) · **Gate**: full + manual
**Commit**: `feat(agents): add throwaway spike trigger + embedded terminal`

---

### T11: rebuilt + packaged proof (ASPK-05) — the de-risk deliverable

**What**: Run `npm run build:win`, install the artifact, launch, and drive the embedded terminal. If the packaged app can't load node-pty, add `node_modules/node-pty/**` to `asarUnpack` and rebuild. Record the working asar/unpack config as a STATE.md Lesson.
**Where**: `electron-builder.yml` (only if the fallback is needed), `.specs/project/STATE.md` (Lesson)
**Depends on**: T10
**Reuses**: existing `electron-builder.yml`, `build:win` script, the `asarUnpack` block

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `npm run build:win` completes with node-pty rebuilt + not bundled
- [ ] The **installed** app's embedded terminal runs the agent identically to `dev`
- [ ] If needed, `asarUnpack` updated so the native `.node` loads from the packaged app
- [ ] The outcome (auto-unpack sufficed, or explicit rule required) recorded as a STATE.md Lesson
- [ ] Gate check passes: `npm run build:win` (Build) + manual packaged drive

**Verify**: install the NSIS artifact from `dist/`, launch, open the terminal, type to the agent.

**Tests**: none (real build/release — TESTING.md) · **Gate**: build + manual
**Commit**: `build(agents): verify packaged node-pty (asarUnpack as needed)`

---

### T12: token theming + refit polish (ASPK-06, P2)

**What**: Map the xterm theme fully to the token set (`--bg`/`--text`/`--accent` + ANSI `--green`/`--amber`/`--red`/`--blue`/`--text-muted`), re-emit on `data-theme` change, and add the blinking caret; ensure `addon-fit` refits on container resize.
**Where**: `src/renderer/src/components/TerminalPane.tsx` (modify, + `.css`)
**Depends on**: T10
**Reuses**: `TerminalPane` (T8), `tokens.css`, the handoff `blink` keyframe

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] xterm theme maps the full token table; toggling the app theme recolors the live terminal
- [ ] Caret blinks at the live prompt; refit fires on resize
- [ ] **Manual (visual)**: readable + correctly colored in dark and light
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline pass (no deletions)

**Verify**: open the terminal, toggle theme — colors flip and stay readable.

**Tests**: none (renderer + visual — TESTING.md) · **Gate**: full + manual
**Commit**: `feat(agents): theme the embedded terminal to app tokens`

---

## Parallel Execution Map

```
Phase 1 (parallel):  T1 [P]   T2 [P]   T4 [P]
Phase 2 (parallel):  T3 [P](T1,T2)   T5 [P](T4)   T6 [P](T4)   T7 [P](T4)
Phase 3 (parallel):  T8 [P](T7)      T9 [P](T3,T5)
Phase 4 (sequential): T10 (T8,T9) ──→ hand-verify dev
Phase 5 (sequential): T11 (T10)  ← de-risk deliverable
Phase 6:              T12 (T10)  ← P2 polish
```

---

## Validation — Check 1: Task Granularity

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 2 files, one concern (make node-pty available) | ✅ Granular |
| T2 | 1 function + its tests | ✅ Granular |
| T3 | 1 adapter class | ✅ Granular |
| T4 | 1 contract file (cohesive type additions) | ✅ Granular |
| T5 | 2 helpers in 1 file | ✅ Granular |
| T6 | 1 bridge (2 paired files) | ✅ Granular |
| T7 | 2 methods in 1 file | ✅ Granular |
| T8 | 1 component (+ its deps) | ✅ Granular |
| T9 | 1 wiring block in 1 file | ✅ Granular |
| T10 | 1 trigger (App + TopBar button) | ✅ Granular |
| T11 | 1 build verification + conditional config tweak | ✅ Granular |
| T12 | 1 component enhancement | ✅ Granular |

## Validation — Check 2: Diagram ↔ Definition Cross-Check

| Task | Depends on (body) | Diagram arrows | Status |
| ---- | ----------------- | -------------- | ------ |
| T1 | None | none | ✅ |
| T2 | None | none | ✅ |
| T4 | None | none | ✅ |
| T3 | T1, T2 | T1,T2→T3 | ✅ |
| T5 | T4 | T4→T5 | ✅ |
| T6 | T4 | T4→T6 | ✅ |
| T7 | T4 | T4→T7 | ✅ |
| T8 | T7 | T7→T8 | ✅ |
| T9 | T3, T5 | T3,T5→T9 | ✅ |
| T10 | T8, T9 | T8,T9→T10 | ✅ |
| T11 | T10 | T10→T11 | ✅ |
| T12 | T10 | T10→T12 | ✅ |

No two `[P]` tasks in the same phase depend on each other. ✅

## Validation — Check 3: Test Co-location

| Task | Code layer | Matrix requires | Task says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | build config | none (real build) | none | ✅ |
| T2 | extracted pure helper | **unit** | unit | ✅ |
| T3 | thin OS shell (node-pty) | none (hand-verified) | none | ✅ |
| T4 | IPC contract (types) | none (typecheck) | none | ✅ |
| T5 | IPC wiring | none (hand-verified) | none | ✅ |
| T6 | IPC wiring (preload) | none (hand-verified) | none | ✅ |
| T7 | renderer client | none (CDP/visual) | none | ✅ |
| T8 | renderer React | none (CDP/visual) | none | ✅ |
| T9 | thin shell (index.ts wiring) | none (hand-verified) | none | ✅ |
| T10 | renderer React | none (CDP + manual) | none | ✅ |
| T11 | build/release | none (real build) | none | ✅ |
| T12 | renderer React | none (visual) | none | ✅ |

All ✅ — the only unit-required layer (the pure spawn-plan helper, T2) carries its tests in-task. No test deferral.

---

## Requirement Coverage

| Req | Tasks |
| --- | ----- |
| ASPK-01 spawn-plan | T2 |
| ASPK-02 PtyPort | T1, T3, T9, T10 (verified) |
| ASPK-03 streaming IPC | T4, T5, T6, T7, T9 |
| ASPK-04 TerminalPane | T8, T10 (verified) |
| ASPK-05 packaged proof | T1, T11 |
| ASPK-06 theming (P2) | T12 |

12 tasks, all 6 requirements covered.
