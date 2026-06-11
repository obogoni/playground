# App Skeleton & Design System — Tasks

**Design**: `.specs/features/app-skeleton/design.md`
**Status**: Done — T1..T7 complete, one commit each (683eec8..1042090). All gates passed: build, 6/6 Vitest behavior tests, CDP end-to-end smoke (7/7 checks).

Gate commands (greenfield baseline, defined in design.md):
- **quick** = `npm test` (vitest run)
- **build** = `npm run typecheck && npm run build`
- **full** = build + quick + manual `npm run dev` smoke check

---

## Execution Plan

```
Phase 1 (Sequential):   T1
Phase 2 (Parallel):     T1 ──┬→ T2 [P]
                             ├→ T3 [P]
                             └→ T4 [P]
Phase 3 (Parallel):     T3,T4 ─→ T5 [P]   T2 ─→ T6 [P]
Phase 4 (Sequential):   T5,T6 ─→ T7
```

---

## Task Breakdown

### T1: Scaffold electron-vite project

**What**: Generate the electron-vite `react-ts` project at repo root; set app/product name `playground`; window defaults (1320×860, min-width 1100); confirm secure defaults (contextIsolation on, nodeIntegration off).
**Where**: repo root (`package.json`, `electron.vite.config.ts`, `src/main/`, `src/preload/`, `src/renderer/`)
**Depends on**: None · **Reuses**: — · **Requirement**: SKEL-01
**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `npm run dev` opens a window; `npm run build` succeeds
- [ ] `name`/`appId` = playground (drives `%APPDATA%/playground/`)
- [ ] BrowserWindow: contextIsolation on, nodeIntegration off, min width 1100

**Tests**: none · **Gate**: build
**Verify**: `npm run build` exits 0; dev window opens.
**Commit**: `feat(skeleton): scaffold electron-vite react-ts app`

---

### T2: Design tokens, fonts, global styles [P]

**What**: `tokens.css` with both handoff theme variable sets keyed off `html[data-theme]`; @fontsource imports (Hanken Grotesk 400–800, JetBrains Mono 400–600); `global.css` (reset, antialiasing, base type, 100vh layout root).
**Where**: `src/renderer/src/styles/tokens.css`, `global.css`, font imports in `src/renderer/src/main.tsx`
**Depends on**: T1 · **Reuses**: handoff §Design Tokens values verbatim · **Requirement**: SKEL-02
**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All 15 tokens × 2 themes present, values exactly per handoff tables
- [ ] Fonts bundled (no network request for fonts)
- [ ] Gate check passes: `npm run typecheck && npm run build`

**Tests**: none · **Gate**: build
**Verify**: build output contains woff2 assets; toggling `data-theme` in devtools recolors.
**Commit**: `feat(skeleton): design tokens, themes, self-hosted fonts`

---

### T3: Typed IPC contract + bridge + renderer client [P]

**What**: `ipc-contract.ts` (channel map: `config:get`, `config:patch`) + `config.ts` (AppConfig + defaults) in `src/shared/`; preload `contextBridge` exposing `api.invoke`; typed main-side `handle()` wrapper; renderer `api` client with normalized error for unregistered channels.
**Where**: `src/shared/ipc-contract.ts`, `src/shared/config.ts`, `src/preload/index.ts` (+`index.d.ts`), `src/main/ipc.ts`, `src/renderer/src/lib/api.ts`
**Depends on**: T1 · **Reuses**: design §IPC contract shape · **Requirement**: SKEL-01, SKEL-03
**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Channel names/types flow end-to-end with no `any` at call sites
- [ ] Invoke on unregistered channel rejects with a clear typed error
- [ ] Gate check passes: `npm run typecheck && npm run build`

**Tests**: none (thin wrapper + types, per PRD philosophy) · **Gate**: build
**Verify**: typecheck fails if a channel is misspelled at a call site (spot-check).
**Commit**: `feat(skeleton): typed request/response IPC layer`

---

### T4: ConfigStore + Vitest setup + behavior tests [P]

**What**: `ConfigStore` class (load/get/patch, atomic tmp+rename write, corrupt-file backup-aside) taking explicit `dir`; Vitest config + `npm test`/`npm run typecheck` scripts; behavior tests in temp dirs.
**Where**: `src/main/config-store.ts`, `src/main/config-store.test.ts`, `vitest.config.ts`, `package.json` scripts
**Depends on**: T1 (depends on T3's `src/shared/config.ts` types only if T3 lands first — otherwise creates them; coordinate: T3 owns the file)
**Reuses**: design §ConfigStore · **Requirement**: SKEL-03
**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Behaviors: missing→defaults · patch round-trip · corrupt→`.bak-<ts>` + defaults · atomic write (no partial file) · merge preserves unknown keys
- [ ] Gate check passes: `npm test`
- [ ] Test count: ≥5 tests pass (no silent deletions)

**Tests**: unit (behavior, real FS temp dirs) · **Gate**: quick
**Verify**: `npm test` — all pass; tests never touch real `%APPDATA%`.
**Commit**: `feat(skeleton): ConfigStore with atomic persistence + behavior tests`

---

### T5: Config IPC handlers in main [P]

**What**: Instantiate `ConfigStore` with `app.getPath('userData')`; register `config:get`/`config:patch` via the typed `handle()` wrapper at app startup.
**Where**: `src/main/index.ts` (wire-up), `src/main/ipc.ts` (handler registration)
**Depends on**: T3, T4 · **Reuses**: T3 wrapper, T4 store · **Requirement**: SKEL-03
**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Renderer devtools: `window.api.invoke('config:get')` returns config; `config:patch` persists to disk
- [ ] Gate check passes: `npm run typecheck && npm run build`

**Tests**: none (wiring; store behavior covered in T4) · **Gate**: build
**Verify**: patch theme via devtools, inspect `%APPDATA%/playground/config.json`.
**Commit**: `feat(skeleton): config IPC handlers`

---

### T6: TopBar + Icon components [P]

**What**: `Icon.tsx` (inline stroke SVGs: git-branch, refresh, sun, moon, layout glyphs for segments) and presentational `TopBar.tsx` per handoff §Top bar (brand block, segmented control, spacer, sync placeholder "az · not connected", refresh + theme-toggle buttons), styled with tokens.
**Where**: `src/renderer/src/components/Icon.tsx`, `TopBar.tsx`, `TopBar.css` (or co-located styles)
**Depends on**: T2 · **Reuses**: tokens.css; handoff §Top bar measurements · **Requirement**: SKEL-01, SKEL-02, SKEL-04
**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Matches handoff: 54px bar, 30×30 brand tile + glow, segmented control specs, 34×34 icon buttons with hover states
- [ ] Purely presentational (all behavior via props)
- [ ] Gate check passes: `npm run typecheck && npm run build`

**Tests**: none (React view, per PRD) · **Gate**: build
**Verify**: visual check in dev window against handoff values.
**Commit**: `feat(skeleton): top bar shell and icon set`

---

### T7: App shell wiring (hydrate + persist + direction switch)

**What**: `App.tsx` — layout (TopBar + content region); on mount `config:get` → set theme/direction; theme applied via `data-theme` on `<html>`; toggle/segment changes update state + `config:patch`; Tree/Board placeholder panes; remove scaffold demo content.
**Where**: `src/renderer/src/App.tsx`, `src/renderer/src/main.tsx`
**Depends on**: T5, T6 · **Reuses**: api client (T3), TopBar (T6) · **Requirement**: SKEL-01..04
**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Theme toggle recolors instantly (incl. moon/sun swap); direction switch swaps placeholder + active segment
- [ ] Quit + relaunch restores theme/direction; deleting config restores defaults
- [ ] Gate check passes: build + `npm test` (T4 count still ≥5) + dev smoke check

**Tests**: none new · **Gate**: full
**Verify**: full restart round-trip per spec Independent Tests (SKEL-03).
**Commit**: `feat(skeleton): app shell with persisted theme and direction`

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| ---- | ----------------- | ------------- | ------ |
| T1 | None | start | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T1 | T1→T3 | ✅ Match |
| T4 | T1 | T1→T4 | ✅ Match |
| T5 | T3, T4 | T3,T4→T5 | ✅ Match |
| T6 | T2 | T2→T6 | ✅ Match |
| T7 | T5, T6 | T5,T6→T7 | ✅ Match |

Parallel groups contain no intra-group dependencies (T2/T3/T4 independent; T5/T6 independent). ✅

## Test Co-location Validation

No TESTING.md exists yet (greenfield); the coverage baseline is design.md §Testing, derived from the PRD's Testing Decisions.

| Task | Code Layer | Baseline Requires | Task Says | Status |
| ---- | ---------- | ----------------- | --------- | ------ |
| T1 | scaffold/config | none | none | ✅ OK |
| T2 | CSS/assets | none | none | ✅ OK |
| T3 | types + thin IPC wrapper | none (PRD: thin wrappers untested) | none | ✅ OK |
| T4 | deep module (persistence) | unit/behavior | unit | ✅ OK |
| T5 | wiring | none | none | ✅ OK |
| T6 | React view | none (PRD: views untested) | none | ✅ OK |
| T7 | React view + wiring | none | none | ✅ OK |
