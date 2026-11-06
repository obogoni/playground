# Tray Residency Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/tray-residency/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `vitest.config.ts` (30 s timeout, v8 coverage as report only, AD-003), STATE AD-003 / AD-005 (co-located Vitest, injected fakes, no `vi.mock`), `scripts/smoke-*.mjs` (CDP smokes with temp `--user-data-dir` and `SMOKE_BREAK=1`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main policy modules (injected ports) | unit | All branches; 1:1 to spec ACs; every listed edge case | `src/main/*.test.ts` | `npx vitest run src/main/<file>.test.ts` |
| Renderer view logic | unit | All branches of the display state | `src/renderer/src/lib/*.test.ts` | `npx vitest run src/renderer/src/lib/<file>.test.ts` |
| Main wiring (`index.ts`), IPC handlers, React components | e2e (CDP smoke) | Every UI- or process-bound AC the units cannot reach, with `SMOKE_BREAK=1` proving each check discriminates | `scripts/smoke-tray-residency.mjs` | `node scripts/smoke-tray-residency.mjs` |
| Shared types / IPC contract | none | - (build gate only) | `src/shared/*.ts` | `npm run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <task test files>` + `npm run typecheck` |
| Full | After tasks that add or extend the smoke | Quick + `npm run build` + `node scripts/smoke-tray-residency.mjs` + `SMOKE_BREAK=1 node scripts/smoke-tray-residency.mjs` (every check must fail) |
| Build | After the last task | `npm run typecheck && npm run lint && npm test` (the known local git/longpaths baseline failures are reported, not fixed) |

---

## Execution Plan

### Phase 1: Policy modules

```
T1 → T2 → T3
```

### Phase 2: Wiring and UI

```
T3 (Phase 1) → T4 → T5 → T6 → T7
```

---

## Task Breakdown

### T1: ✅ Shared login-item types

**What**: Add `LoginItemState` and `LoginItemResult` exactly as in the design's Data Models.
**Where**: `src/shared/login-item.ts` (new)
**Depends on**: None
**Reuses**: shape of other `src/shared/*.ts` type modules
**Requirement**: TRAY-21, TRAY-25, TRAY-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both types exported, with the doc comments from the design
- [x] `npm run typecheck` exits 0

**Tests**: none
**Gate**: build (typecheck only)

**Commit**: `feat(shared): add the login item state types`

---

### T2: LoginItemService

**What**: Implement `LoginItemService.get()` / `set(enabled)` over an injected `LoginItemPort`, with `HIDDEN_ARG = '--hidden'`.
**Where**: `src/main/login-item.ts` (new, + co-located `.test.ts`)
**Depends on**: T1
**Reuses**: injected-port pattern of `src/main/update-service.ts`
**Requirement**: TRAY-21, TRAY-22, TRAY-25, TRAY-26

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [ ] Not packaged: `get()` → `{ available: false, enabled: false }`; `set()` → `ok: false`, error `only in the installed app`, and the fake records zero writes (TRAY-25)
- [ ] Packaged: `get().enabled` = `executableWillLaunchAtLogin` when defined, else `openAtLogin`; both true/false combinations asserted (TRAY-21)
- [ ] `set(true)` writes `{ openAtLogin: true, path: execPath, args: ['--hidden'] }`; `set(false)` writes `openAtLogin: false` with the same path and args (TRAY-22); `HIDDEN_ARG` asserted as the literal `'--hidden'`
- [ ] Read-back mismatch → `ok: false`, error `Windows did not apply the change`, `state` = read-back; a throwing setter → `ok: false` with the thrown message (TRAY-26)
- [ ] Quick gate passes; test count reported

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): add the Windows login item service`

---

### T3: ResidencyController

**What**: Implement `ResidencyController` over `ResidencyPorts` with `onWindowClose`, `onBeforeQuit`, `requestQuit`, `onSessionEnd`, `reveal`, `menuTemplate`, and export the dialog message builder.
**Where**: `src/main/residency-controller.ts` (new, + co-located `.test.ts`)
**Depends on**: T2
**Reuses**: injected-port pattern of `src/main/update-service.ts`
**Requirement**: TRAY-02, TRAY-04, TRAY-05, TRAY-10, TRAY-11, TRAY-12, TRAY-13, TRAY-15, TRAY-31

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [ ] Close while not quitting → `preventDefault` called and `hideWindow` called once; close after `onBeforeQuit` → neither called (TRAY-02)
- [ ] `requestQuit` with 0 running → `quit` once, `confirmQuit` never (TRAY-10)
- [ ] `requestQuit` with 2 running → `confirmQuit(2)`; message builder returns exactly `2 running session(s) will be stopped. Quit anyway?` (TRAY-11); confirm `true` → `quit` once (TRAY-12); `false` → `quit` never (TRAY-13)
- [ ] A second `requestQuit` while the first dialog is pending → no second `confirmQuit`
- [ ] `onSessionEnd` → `quit` once, `confirmQuit` never, and a later close is not prevented (TRAY-15)
- [ ] `reveal` → `revealWindow` once (TRAY-04, TRAY-31)
- [ ] `menuTemplate()` labels are exactly `['Open Playground', 'Quit']`; their clicks call `revealWindow` and `requestQuit` (TRAY-05)
- [ ] Quick gate passes; test count reported

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): add the tray residency controller`

---

### T4: Wire residency into main, with the smoke

**What**: In `index.ts`: single-instance lock before `whenReady`, `second-instance` → reveal, `--hidden` gating `ready-to-show`, tray with tooltip and menu, `close` / `session-end` / `before-quit` to the controller, `revealWindow` lifted to module scope, tray destroyed on quit; create `scripts/smoke-tray-residency.mjs` covering the process-bound ACs.
**Where**: `src/main/index.ts` (modify); smoke `scripts/smoke-tray-residency.mjs` (new)
**Depends on**: T3
**Reuses**: existing `revealWindow`, quit path, `SessionManager.list()`; smoke harness of `scripts/smoke-agent-presets.mjs` (temp `--user-data-dir`, stub agent, `SMOKE_BREAK`)
**Requirement**: TRAY-01, TRAY-02, TRAY-03, TRAY-04, TRAY-06, TRAY-12, TRAY-14, TRAY-16, TRAY-23, TRAY-24, TRAY-30, TRAY-31, TRAY-32

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Smoke: closing the window (CDP `window.close()`) leaves the main process alive, `document.visibilityState` `hidden`, and a stub-agent session still `running` in `sessions:list` with its output still growing (TRAY-02, TRAY-03)
- [ ] Smoke: a second launch on the same `--user-data-dir` exits within 10 s, and the first instance's window becomes visible (TRAY-30, TRAY-31)
- [ ] Smoke: a launch with `--hidden` reaches `ready` with the window not visible; a launch without it shows the window (TRAY-23, TRAY-24, TRAY-32)
- [ ] Smoke: after quit, no stub-agent process from the run is left (TRAY-12)
- [ ] By hand, recorded in the commit body: tray icon and tooltip `Playground` visible, click reveals (TRAY-01, TRAY-04); clicking a notification while hidden reveals the session (TRAY-06)
- [ ] Full gate passes, including `SMOKE_BREAK=1` failing every check

**Tests**: e2e
**Gate**: full

**Commit**: `feat(main): keep the app resident in the tray`

---

### T5: Login item IPC

**What**: Add `login-item:get` and `login-item:set` to the IPC contract and register handlers backed by `LoginItemService` (with `app` as the port).
**Where**: `src/shared/ipc-contract.ts` (modify); handlers in `src/main/index.ts`
**Depends on**: T4
**Reuses**: typed `handle` wrappers in `src/main/ipc.ts`
**Requirement**: TRAY-21, TRAY-22, TRAY-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Smoke (dev, unpackaged): `invoke('login-item:get')` → `{ available: false, enabled: false }`; `invoke('login-item:set', { enabled: true })` → `ok: false` with `only in the installed app`, and the HKCU Run key has no Playground/electron entry before and after (TRAY-25)
- [ ] Full gate passes

**Tests**: e2e
**Gate**: full

**Commit**: `feat(ipc): expose the login item to the renderer`

---

### T6: Login checkbox view logic

**What**: Pure function mapping `LoginItemState` plus the last error to the checkbox's `checked`, `disabled`, `note` and `error` text.
**Where**: `src/renderer/src/lib/login-item-view.ts` (new, + co-located `.test.ts`)
**Depends on**: T5
**Reuses**: other `src/renderer/src/lib/*-view.ts` modules
**Requirement**: TRAY-20, TRAY-21, TRAY-25, TRAY-26

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [ ] Label constant is exactly `Start Playground when Windows starts`; available → note `opens hidden in the tray`, enabled control (TRAY-20)
- [ ] `checked` mirrors `state.enabled` (TRAY-21)
- [ ] Unavailable → disabled, note `only in the installed app` (TRAY-25)
- [ ] Error `X` → error text exactly `Couldn't change the startup setting: X`; no error → none (TRAY-26)
- [ ] Quick gate passes; test count reported

**Tests**: unit
**Gate**: quick

**Commit**: `feat(renderer): add the login item checkbox view`

---

### T7: Settings checkbox

**What**: Render the checkbox in Settings' General tab after the default-shell control, load it with `login-item:get` on open, call `login-item:set` on toggle and apply the returned state and error.
**Where**: `src/renderer/src/components/SettingsDialog.tsx` (modify); smoke extended
**Depends on**: T6
**Reuses**: `persistShell` pattern, `dialog-field-label` / `dialog-label-note` classes, T6 view
**Requirement**: TRAY-20, TRAY-21, TRAY-22, TRAY-25, TRAY-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Smoke: General tab shows the label and, in dev, the control disabled with `only in the installed app` (TRAY-20, TRAY-25)
- [ ] By hand on the installed nightly, recorded in the validation: toggle on → Task Manager Startup apps lists Playground; logoff/login → tray icon, no window; toggle off → gone (TRAY-21, TRAY-22, TRAY-23)
- [ ] Full gate passes

**Tests**: e2e
**Gate**: full

**Commit**: `feat(settings): add the start with Windows option`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T3 → T4 ------→ T5 ------→ T6 ------→ T7
```

TRAY-15 (logoff) is unit-covered in T3; its real-OS check (no orphan after logoff) is a manual UAT item in the validation, as the design's Risks table records.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Shared types | 2 types, 1 file | ✅ Granular |
| T2: LoginItemService | 1 class | ✅ Granular |
| T3: ResidencyController | 1 class | ✅ Granular |
| T4: Wire residency | `index.ts` wiring + its smoke | ⚠️ Cohesive: the smoke is the only test for this wiring |
| T5: Login item IPC | 2 channels + handlers | ⚠️ Cohesive: contract entry and its handler |
| T6: Checkbox view | 1 function | ✅ Granular |
| T7: Settings checkbox | 1 component change + smoke step | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | — | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Shared types | none | none | ✅ OK |
| T2 | Main policy module | unit | unit | ✅ OK |
| T3 | Main policy module | unit | unit | ✅ OK |
| T4 | Main wiring | e2e | e2e | ✅ OK |
| T5 | IPC contract + handlers | e2e | e2e | ✅ OK |
| T6 | Renderer view logic | unit | unit | ✅ OK |
| T7 | React component | e2e | e2e | ✅ OK |
