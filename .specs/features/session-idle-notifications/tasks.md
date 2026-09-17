# Session Activity Notifications Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/session-idle-notifications/design.md`
**Status**: Executed — all 13 tasks committed; Verifier pending
**Branch**: `feature/session-idle-notifications` (stacked on `feature/session-activity-status` `65de9fd`, PR #88)
**Test baseline**: **917 tests / 52 files**, measured green on this branch before any task.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `.specs/codebase/CONVENTIONS.md`, `vitest.config.ts` (AD-003: coverage is report-only, no threshold gate).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure logic (`src/shared/**`, pure modules in `src/main/**`, `src/renderer/src/lib/**`) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `<module>.test.ts` co-located | `npx vitest run <file>` |
| Main-process orchestrators with DI (`SessionNotifier`, `SessionManager`) | unit | Every behaviour the ACs name, driven through hand-rolled fakes (no mocking library — TESTING.md pattern 3) | `src/main/<module>.test.ts` | `npx vitest run <file>` |
| Type-only contracts (`src/shared/config.ts`, `ipc-contract.ts`) | none | Build gate only (TESTING.md: "shared types via typecheck") | - | build gate only |
| Electron/main wiring (`src/main/index.ts`) | none | Hand-verified (TESTING.md: "thin OS/Electron shells") | - | build gate only |
| Renderer React components (`src/renderer/src/components/**`, `App.tsx`) | none | Hand-verified via CDP smoke + a two-theme visual pass (TESTING.md) | - | build gate only |
| Smoke scripts (`scripts/smoke-*.mjs`) | none | Owner-run against a live app; never in CI (TESTING.md) | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute. Judge every gate by **exit code**, never by reading the summary line (process lesson from `time-tracking`).

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <the task's test file>` |
| Full | After tasks that touch `SessionManager` | `npm test` |
| Build | After phase completion or for type/wiring/renderer-only tasks | `npm run typecheck && npm run lint && npm test` (+ `npx electron-vite build` at the end of Phase 3 and Phase 4) |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

Each block below shows the real dependency edges, including the ones that cross a phase
boundary. Tasks with no incoming edge still run in the listed order inside their phase.

### Phase 1: Shared contracts

```
T1 → T2
T3
```

### Phase 2: Main-process decision

```
T2 → T4
T3 → T5
T4 → T5
```

### Phase 3: Main-process integration

```
T4 → T6
T2 → T7
T5 → T7
T6 → T7
```

### Phase 4: Renderer and smoke

```
T8 → T9
T3 → T10
T8 → T10
T9 → T10
T11
T2 → T12
T11 → T12
T7 → T13
T10 → T13
T12 → T13
```

---

## Task Breakdown

### T1: Notification switches in the config type ✅ COMPLETE

**Status**: Done — five flat optional `ui` booleans on `AppConfig`, `DEFAULT_CONFIG` untouched. Build gate green: typecheck 0, lint 0 errors (18 pre-existing warnings), 917 tests.

**What**: Add the five optional `ui` booleans (`notify`, `notifyNeedsApproval`, `notifyNeedsInput`, `notifyWaiting`, `notifyError`) to `AppConfig`, each documented as "absent = on"; `DEFAULT_CONFIG` stays without them.
**Where**: `src/shared/config.ts`
**Depends on**: None
**Reuses**: the existing optional `ui` keys (`sidebarWidth?`, `collapsedWorkspaces?`) and their comment style
**Requirement**: NOTF-15, NOTF-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Five optional booleans on `AppConfig['ui']`, flat (no nested object — design Risks: one-level-deep merge)
- [x] `DEFAULT_CONFIG.ui` unchanged, so no migration and `config-store.test.ts:79` still passes unmodified
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: unchanged at 917 (no silent deletions)

**Tests**: none (type-only contract layer — matrix says build gate only)
**Gate**: build

**Commit**: `feat(shared): declare the session notification switches`

---

### T2: Reading the notification preferences ✅ COMPLETE

**Status**: Done — `src/shared/notifications.ts` + 10 tests (four states, key map, absent = on, explicit true = absent, master off keeps states, each state off alone). Quick gate green; lint clean. Suite 917 → 927.

**What**: Implement `src/shared/notifications.ts` — `NotifiableState`, `NOTIFIABLE_STATES`, `NOTIFY_STATE_KEYS` and `readNotificationPrefs(ui)` applying "absent = on" to the master and each state.
**Where**: `src/shared/notifications.ts`
**Depends on**: T1
**Reuses**: `src/shared/command-key.ts` as the precedent for a small pure shared module with a co-located test
**Requirement**: NOTF-13, NOTF-14, NOTF-17, NOTF-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `NOTIFIABLE_STATES` is exactly `needs-approval`, `needs-input`, `waiting`, `error`
- [x] `NOTIFY_STATE_KEYS` maps each state to its `ui` key, typed so a missing state fails typecheck
- [x] Tests cover: empty `ui` → master and all four on; each key `false` alone turns off only its own entry; master `false` leaves every state value as configured (NOTF-19 — master never rewrites states); explicit `true` equals absent
- [x] Gate check passes: `npx vitest run src/shared/notifications.test.ts`
- [x] Test count: 917 → ~925 (+~8; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shared): read notification switches with absent meaning on`

---

### T3: `session:notice` and `session:focus` channels ✅ COMPLETE

**Status**: Done — `session:notice` and `session:focus` declared next to `session:activity`; `workflow:focus-run` untouched. Build gate green (phase 1 close): typecheck 0, lint 0 errors, 927 tests.

**What**: Declare the two main→renderer events in `IpcEvents`: `'session:notice': { id: string; title: string; body: string }` and `'session:focus': { id: string }`.
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: None
**Reuses**: `'session:activity'` and `'workflow:focus-run'` entries (`ipc-contract.ts:138`, `:155`)
**Requirement**: NOTF-02, NOTF-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both events declared with a one-line comment each, next to the other `session:*` events
- [x] `workflow:focus-run` untouched
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: unchanged (no silent deletions)

**Tests**: none (type-only contract layer)
**Gate**: build

**Commit**: `feat(shared): declare the session notice and focus pushes`

---

### T4: Deciding and describing a notification ✅ COMPLETE

**Status**: Done — `activity-notification.ts` (`ActivityChange`, `decideNotification`, `describeNotification`) + 43 tests: each of the four states × surface, attached, master, own switch, first event; the three silent states; no activity; answered approval; detail-only change; wording and title prefix. Quick gate green; lint clean. Suite 927 → 970.

**What**: Implement `src/main/activity-notification.ts` with `ActivityChange` (the type `SessionManager` will report), `decideNotification` (the seven ordered rules of the design) and `describeNotification` (title and body wording).
**Where**: `src/main/activity-notification.ts`
**Depends on**: T2
**Reuses**: `SessionActivity` (`src/shared/config.ts`); `activity-machine.ts` as the precedent for a pure, table-tested main module
**Requirement**: NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-07, NOTF-08, NOTF-09, NOTF-10, NOTF-11, NOTF-12, NOTF-13, NOTF-14, NOTF-24, NOTF-25, NOTF-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No I/O, no Electron import; imports only from `src/shared`
- [x] `decideNotification` tests, one per rule and per state: each of the four notifiable states entered from `working` → `'os'` when unfocused, `'in-app'` when focused and not attached, `null` when focused and attached (NOTF-01/02/03, 07/08/09); entering `working`, `compacting`, `exited` → `null` (NOTF-10); `after` null → `null` (NOTF-11); `before` null → `null` even for `waiting` (NOTF-27); `needs-approval` → `working` → `null` (NOTF-25); same state with a different tool or subagent count → `null`; master off → `null` on both surfaces (NOTF-13); one state off → `null` for it and still notifies the other three (NOTF-14); unfocused + attached → `'os'` (minimized is unfocused, NOTF-24)
- [x] `describeNotification` tests: approval with and without a tool (NOTF-04); input; waiting; error with and without an error type (NOTF-08); title carries the agent and title, with no doubled `"<agent> · "` prefix when the title already starts with it, and a renamed title gets the prefix (NOTF-12)
- [x] Gate check passes: `npx vitest run src/main/activity-notification.test.ts`
- [x] Test count: ~925 → ~955 (+~30; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): decide whether and where an activity change notifies`

---

### T5: SessionNotifier ✅ COMPLETE

**Status**: Done — `SessionNotifier` + 7 fake-driven tests: OS path with title/body, click reveals then emits `session:focus`, in-app notice payload, silent transitions, prefs/focus read per change, one notification per session and each click opens its own. Build gate green (phase 2 close): typecheck 0, lint 0 errors, 977 tests.

**What**: Implement the DI'd `SessionNotifier` that turns one `ActivityChange` into `showOs(...)` with a click that reveals the window and emits `session:focus`, or into an `emit('session:notice', ...)`, or into nothing.
**Where**: `src/main/session-notifier.ts`
**Depends on**: T3, T4
**Reuses**: `SessionManagerDeps` / `EmitFn` DI shape; hand-rolled fakes as in `session-manager.test.ts`
**Requirement**: NOTF-01, NOTF-02, NOTF-05, NOTF-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Reads `prefs()` and `windowFocused()` on every `handle` call, so a toggle applies to the next transition without a restart
- [x] Tests with fakes: unfocused → one `showOs` call with the described title/body and no emit; invoking the captured click calls `reveal` then emits `session:focus` with the session id (NOTF-05); focused + not attached → one `session:notice` emit and no `showOs` (NOTF-02); decision `null` → neither; two changes for two sessions → two notifications, one per session id (NOTF-22)
- [x] Gate check passes: `npx vitest run src/main/session-notifier.test.ts`
- [x] Test count: ~955 → ~961 (+~6; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): route activity notifications to the OS or the app`

---

### T6: SessionManager reports activity transitions ✅ COMPLETE

**Status**: Done — `onActivityChange` dep called from `#setActivity` after the push, guarded by try/catch; +7 tests (first state, before/after, attached, renamed title, unchanged view, PTY exit while blocked, throwing listener). Existing 43 SessionManager tests unmodified. Full gate green: typecheck 0, 984 tests.

**What**: Add the optional `onActivityChange` dep and call it from `#setActivity` after the `session:activity` emit, with `id`, `agent`, `title`, `before`, `after` and `attached`, guarded by `try/catch`.
**Where**: `src/main/session-manager.ts`
**Depends on**: T4
**Reuses**: `#setActivity` (`session-manager.ts:340`) and its `sameView` gate; `#activeId`
**Requirement**: NOTF-22, NOTF-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Called only when the view changed; never from `#finalize`
- [x] Tests in `session-manager.test.ts` with the existing fakes: a hook event reports `before` null and `after` set; a second event reports the previous view as `before`; `attached` is true after `attach(id)` and false after `detach(id)`; a renamed session reports the new title; an unchanged view reports nothing; stopping a PTY that holds `needs-approval` reports nothing (NOTF-26); a throwing callback does not stop the `session:activity` emit
- [x] Existing `session-manager.test.ts` cases pass unmodified
- [x] Gate check passes: `npm test`
- [x] Test count: ~961 → ~968 (+~7; no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `feat(main): report session activity transitions to a listener`

---

### T7: Electron wiring for session notifications ✅ COMPLETE

**Status**: Done — `revealWindow` (destroyed-safe, restores minimized), `windowFocused` (minimized = unfocused), shared `showOs` holding each `Notification` until click/close/failed; the workflow toast now rides both; `SessionNotifier` wired as `onActivityChange`. Build gate green (phase 3 close): typecheck 0, lint 0 errors, electron-vite build ok, 984 tests. OS path hand-verified in T13.

**What**: In `index.ts`, extract `revealWindow()` (destroyed-safe, restores a minimized window), add `windowFocused()`, make `showOs` hold each `Notification` until `click`/`close`/`failed`, reuse both for the workflow toast, construct `SessionNotifier`, and pass `onActivityChange` to `SessionManager`.
**Where**: `src/main/index.ts`
**Depends on**: T2, T5, T6
**Reuses**: `notifier` (`index.ts:238`), `emitToWindow`, `configStore`
**Requirement**: NOTF-05, NOTF-06, NOTF-21, NOTF-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `Notification.isSupported()` false → nothing shown, no throw (NOTF-06)
- [x] `revealWindow` and `windowFocused` no-op / false on a missing or destroyed window (NOTF-21); a minimized window counts as unfocused (NOTF-24)
- [x] Workflow lifecycle toasts still click through to `workflow:focus-run` (unchanged behaviour, now via the shared helpers)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test && npx electron-vite build`
- [x] Test count: unchanged (no silent deletions)

**Tests**: none (Electron/main wiring — hand-verified; the OS notification and its click ride T13's hand checks)
**Gate**: build

**Commit**: `feat(main): notify on session activity through Electron`

---

### T8: Session notice list logic ✅ COMPLETE

**Status**: Done — `session-notices.ts` (`upsertNotice`, `dropNotice`) + 6 tests: first add, stacking order, in-place replace with the new key, no mutation, drop one, drop unknown. Quick gate green; lint clean. Suite 984 → 990.

**What**: Implement `upsertNotice` and `dropNotice` over `Notice { id, title, body, key }`: a newer notice for a session replaces its old one in place, different sessions stack in arrival order.
**Where**: `src/renderer/src/lib/session-notices.ts`
**Depends on**: None
**Reuses**: `src/renderer/src/lib/session-activity.ts` (`applyActivity`) as the precedent for an in-place list update with a unit test
**Requirement**: NOTF-05, NOTF-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Pure; returns new arrays, never mutates the input
- [x] Tests: upsert into empty; two sessions stack in order; a second notice for the same session replaces the first in place and changes `key` (so its timer restarts); drop removes only that session; drop of an unknown id returns an equal list
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/session-notices.test.ts`
- [x] Test count: ~968 → ~974 (+~6; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(renderer): keep one in-app notice per session`

---

### T9: SessionNotices component ✅ COMPLETE

**Status**: Done — `SessionNotices` + CSS: stack bottom-right, open button carrying title and body, separate × with `aria-label=\"Dismiss\"`, 8 s timer restarted by `key`, theme tokens only. Build gate green: typecheck 0, lint 0 errors, 990 tests. Visual pass rides T13.

**What**: Render the notice stack bottom-right: title, body, click opens, × dismisses, each auto-dismisses after 8 s keyed on `key`.
**Where**: `src/renderer/src/components/SessionNotices.tsx` (+ `SessionNotices.css`)
**Depends on**: T8
**Reuses**: `Toast.tsx` timer pattern and `Toast.css` `toastIn` motion and tokens
**Requirement**: NOTF-02, NOTF-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each notice is a `button` with an accessible name carrying title and body; × has `aria-label="Dismiss"` and does not trigger open
- [x] Uses theme tokens only, readable in light and dark
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: unchanged (no silent deletions)

**Tests**: none (renderer component — hand-verified in T13)
**Gate**: build

**Commit**: `feat(renderer): show clickable session notices`

---

### T10: App subscribes to session notices and focus ✅ COMPLETE

**Status**: Done — notice list state, `session:notice` (upsert with a ref-counted key) and `session:focus` subscriptions, `openNotifiedSession` shared by both surfaces. Named apart from the existing chip `openSession` because the subscription needs a stable callback. Build gate green: typecheck 0, lint 0 errors, electron-vite build ok, 990 tests.

**What**: In `App.tsx`, hold the notice list, subscribe `session:notice` (upsert) and `session:focus` (open), and add `openSession(id)`: direction `agents` with `config:patch`, `setSelectedSessionId(id)`, drop that session's notice.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T3, T8, T9
**Reuses**: the `workflow:focus-run` effect (`App.tsx:164`); `setSelectedSessionId` from `useSessions`
**Requirement**: NOTF-02, NOTF-05, NOTF-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Clicking an in-app notice and clicking an OS notification run the same `openSession`
- [x] A stopped session is selected as-is (NOTF-23)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test && npx electron-vite build`
- [x] Test count: unchanged (no silent deletions)

**Tests**: none (renderer component — hand-verified in T13)
**Gate**: build

**Commit**: `feat(renderer): open a session from its notification`

---

### T11: Settings dialog tabs ✅ COMPLETE

**Status**: Done — `set-tabs` tablist under the header (General / Notifications, `role=tab` + `aria-selected`), header title follows the tab, unpersisted `tab` state opening on General, General body untouched, Notifications panel empty until T12. Build gate green: typecheck 0, lint 0 errors, 990 tests.

**What**: Add a `role="tablist"` with **General** and **Notifications** under the dialog header; General holds today's body unchanged, the header title follows the tab, and the dialog opens on General.
**Where**: `src/renderer/src/components/SettingsDialog.tsx` (+ `SettingsDialog.css`)
**Depends on**: None
**Reuses**: `TopBar` segmented tabs (`TopBar.tsx:94`, `topbar-segmented` / `topbar-segment` styles, copied as `set-tabs` / `set-tab`)
**Requirement**: NOTF-28, NOTF-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tabs carry `role="tab"` + `aria-selected`; the Notifications panel is an empty placeholder until T12
- [x] Field state stays at dialog level, so an unsaved template edit and an open agent form survive General → Notifications → General (NOTF-29)
- [x] Footer unchanged on both tabs
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: unchanged (no silent deletions)

**Tests**: none (renderer component — hand-verified in T13)
**Gate**: build

**Commit**: `feat(settings): split the dialog into General and Notifications tabs`

---

### T12: Notifications tab switches ✅ COMPLETE

**Status**: Done — Notifications tab: master checkbox and the four state checkboxes (`dialog-check` pattern), read via `readNotificationPrefs`, each toggle patching only its own `ui` key; state checkboxes disabled and dimmed while the master is off, keeping their values. Build gate green: typecheck 0, lint 0 errors, electron-vite build ok, 990 tests.

**What**: Fill the Notifications tab: master checkbox and four state checkboxes (*Needs approval*, *Needs input*, *Finished its turn*, *Turn failed*), read through `readNotificationPrefs`, each persisted immediately with a one-key `config:patch`, state checkboxes disabled while the master is off.
**Where**: `src/renderer/src/components/SettingsDialog.tsx`
**Depends on**: T2, T11
**Reuses**: `persistShell` (`SettingsDialog.tsx:87`) persist-on-change pattern; `NOTIFY_STATE_KEYS` from T2
**Requirement**: NOTF-16, NOTF-18, NOTF-19, NOTF-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Toggling the master writes only `notify`; toggling a state writes only its key (NOTF-16, NOTF-19)
- [x] State checkboxes `disabled` while the master is off and keep their checked value (NOTF-20)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test && npx electron-vite build`
- [x] Test count: unchanged (no silent deletions)

**Tests**: none (renderer component — hand-verified in T13)
**Gate**: build

**Commit**: `feat(settings): choose which session states notify`

---

### T13: Owner smoke script ✅ COMPLETE

**Status**: Done — `scripts/smoke-notifications.mjs` written and linted — **NOT YET RUN; owner-run pending**. Zero tokens: the `claude --version` agent runs in `C:/Windows` and no input is typed until the version line shows (the dev app's registry agent is the real CLI). Unlike `smoke-activity.mjs` it removes only the sessions it created and restores the five switches and `ui.direction`. Build gate green: typecheck 0, lint 0 errors, electron-vite build ok, 990 tests.

**What**: Write `scripts/smoke-notifications.mjs`, a zero-token CDP smoke: settings tabs and switches round-tripped through `config:get`, and the in-app notice path driven by POSTing documentation-shaped hook payloads to the loopback hook server for a session whose token it reads from the session's own shell.
**Where**: `scripts/smoke-notifications.mjs`
**Depends on**: T7, T10, T12
**Reuses**: `scripts/smoke-activity.mjs` (CDP connection, settings file path, throwaway agent cleanup)
**Requirement**: NOTF-02, NOTF-05, NOTF-14, NOTF-16, NOTF-18, NOTF-19, NOTF-20, NOTF-28, NOTF-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Spends no tokens: the throwaway agent runs `claude --version` so the hooked launch exits and leaves the shell holding `PLAYGROUND_ACTIVITY_TOKEN`; the hook URL comes from the generated settings file
- [x] Checks: dialog opens on General; an unsaved template edit survives a tab round trip; each switch persists; master off disables the state switches and keeps their values; with session B attached, `working` → `needs-approval` on session A shows one in-app notice naming the tool; with `waiting` switched off, `working` → `waiting` shows nothing; clicking the notice selects A in the agents direction
- [x] Header lists what is hand-verified: the OS notification while the app is in the background, its click after a minute (the GC risk), minimized window, two-theme visual pass of the tabs and notices
- [x] Restores every switch it changed and removes the agent and sessions it created
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: unchanged (no silent deletions)

**Tests**: none (smoke script — owner-run, never in CI)
**Gate**: build

**Commit**: `test(notifications): add the owner smoke for session notifications`

---

## Phase Execution Map

Phases run in sequence; within a phase the tasks run in the order listed.

| Order | Phase | Tasks |
| ----- | ----- | ----- |
| 1 | Shared contracts | T1, T2, T3 |
| 2 | Main-process decision | T4, T5 |
| 3 | Main-process integration | T6, T7 |
| 4 | Renderer and smoke | T8, T9, T10, T11, T12, T13 |

Execution is strictly sequential - there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

Packing for Execute: 13 tasks at ~7 per batch → **2 batches** (Phases 1–3 = 7 tasks, main process; Phase 4 = 6 tasks, renderer + smoke), so the sub-agent offer applies.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: config switches | 1 type, 5 keys | ✅ Granular |
| T2: `readNotificationPrefs` | 1 module | ✅ Granular |
| T3: two IPC events | 1 contract file | ✅ Granular |
| T4: decide + describe | 2 cohesive pure functions, 1 file | ⚠️ OK — cohesive |
| T5: `SessionNotifier` | 1 class | ✅ Granular |
| T6: `onActivityChange` | 1 dep, 1 call site | ✅ Granular |
| T7: Electron wiring | 1 file | ✅ Granular |
| T8: notice list logic | 2 functions, 1 file | ✅ Granular |
| T9: `SessionNotices` | 1 component (+ its CSS) | ✅ Granular |
| T10: App subscriptions | 1 file | ✅ Granular |
| T11: settings tabs | 1 component change (+ its CSS) | ✅ Granular |
| T12: notification switches | 1 tab body | ✅ Granular |
| T13: smoke | 1 script | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | none | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | None | none | ✅ Match |
| T4 | T2 | T2 → T4 | ✅ Match |
| T5 | T3, T4 | T3 → T5, T4 → T5 | ✅ Match |
| T6 | T4 | T4 → T6 | ✅ Match |
| T7 | T2, T5, T6 | T2 → T7, T5 → T7, T6 → T7 | ✅ Match |
| T8 | None | none | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T3, T8, T9 | T3 → T10, T8 → T10, T9 → T10 | ✅ Match |
| T11 | None | none | ✅ Match |
| T12 | T2, T11 | T2 → T12, T11 → T12 | ✅ Match |
| T13 | T7, T10, T12 | T7 → T13, T10 → T13, T12 → T13 | ✅ Match |

No dependency points to a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Type-only contract | none | none | ✅ OK |
| T2 | Pure shared logic | unit | unit | ✅ OK |
| T3 | Type-only contract | none | none | ✅ OK |
| T4 | Pure main logic | unit | unit | ✅ OK |
| T5 | DI orchestrator | unit | unit | ✅ OK |
| T6 | DI orchestrator (`SessionManager`) | unit | unit | ✅ OK |
| T7 | Electron/main wiring | none | none | ✅ OK |
| T8 | Pure renderer lib | unit | unit | ✅ OK |
| T9 | Renderer component | none | none | ✅ OK |
| T10 | Renderer component | none | none | ✅ OK |
| T11 | Renderer component | none | none | ✅ OK |
| T12 | Renderer component | none | none | ✅ OK |
| T13 | Smoke script | none | none | ✅ OK |
