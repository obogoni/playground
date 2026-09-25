# Session Name Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/session-name/design.md`
**Status**: Approved — owner confirmed 2026-09-19 (SNAME-05 via `title` + button labels, no row `aria-label`; T8 token spend authorised; tools: no MCP, `tlc-spec-driven` only)
**Branch**: `feature/session-name` (cut from `origin/main` `6ecd19c`; spec/design committed as `3e69ce9`)
**Test baseline**: **917 tests / 52 files** measured on this branch before any task — 916 pass; the one
failure is `dir-remover.test.ts` "counts every leftover entry" (the pwsh `holdFile` lock races the
test on this machine; fixed by `7e498c5` on `feature/terminal-links`, not on `main`). Typecheck clean.
Every count below is anchored to **917**.

**Confirmed lessons applied**: L-001 (the `names?` dep is optional *by design*, like `hooks?` — no
interim relaxation), L-005 (no real process or real git anywhere in this feature's tests: fake
`AgentSpawn`, `vi.useFakeTimers()`).

**Design corrections found while reading the code (recorded, not re-designed):**

- `applyActivity` (`src/renderer/src/lib/session-activity.ts:19-29`) always returns a new array; it
  has no referential stability. `applyName` mirrors what exists — the design's "returns the same
  array when nothing changes" is dropped.
- `resolveClaude` is declared at `src/main/index.ts:323`, **after** `new SessionManager` at `:281`.
  The poller is a constructor dep of the manager, so T7 hoists `resolveClaude` above the manager
  (it only reads `configStore`, available since `:2xx`).
- The rail row has no `aria-label` of its own (`SessionRail.tsx:294-299`): its accessible name is its
  content (`row.label`, the status `aria-label`, the buttons) and `title` is its description. SNAME-05
  is met as the design states — `title` reads `<agent> · <name> · <branch>` and the action buttons
  keep interpolating `row.label` — with **no new `aria-label` on the row**. Owner to confirm at
  approval; if a literal accessible name is wanted, T6 grows one `ariaLabel` field on `RailRow`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (patterns 1–3, "what is deliberately not unit-tested"), `.specs/codebase/CONVENTIONS.md`, `vitest.config.ts` (AD-003 report-only coverage, 30 s per-test ceiling), `.github/workflows/ci.yml` (gate = `typecheck && lint && test`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure main modules (`src/main/agents-listing.ts`) | unit | All branches; 1:1 to SNAME-13; every listed edge case (duplicate id, whitespace name) | `src/main/<module>.test.ts` | `npx vitest run <file>` |
| Main-process orchestrators with DI (`SessionNamePoller`, `SessionManager`) | unit | Every behaviour an AC names, driven through hand-rolled fakes (TESTING.md pattern 3 — no `vi.mock`) and `vi.useFakeTimers()`; no real `child_process` (L-005) | `src/main/<module>.test.ts` | `npx vitest run <file>`; `npm test` when `SessionManager` changes |
| Renderer pure lib (`src/renderer/src/lib/session-name.ts`, `rail-groups.ts`) | unit | 1:1 to SNAME-01/03/05/06/07; every decision the row renders lives in lib, not in the component (L-012, L-018) | `src/renderer/src/lib/<module>.test.ts` | `npx vitest run <file>` |
| Type-only contracts (`src/shared/config.ts`, `src/shared/ipc-contract.ts`) | none | Build gate only (TESTING.md) | — | build gate only |
| Electron/main wiring (`src/main/index.ts`) | none | Hand-verified (TESTING.md "thin OS/Electron shells") + the CDP hand-check in T8 | — | build gate only |
| Renderer components and hooks (`SessionRail.tsx`, `use-sessions.ts`) | none | Hand-verified via CDP smoke (TESTING.md "Renderer React components") | — | build gate only |
| Smoke scripts (`scripts/smoke-*.mjs`) | manual only | Owner-run against a live app; never in CI | `scripts/smoke-session-name.mjs` | `node scripts/smoke-session-name.mjs` (live session) |

## Parallelism Assessment

> Generated from codebase — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --------- | -------------- | --------------- | -------- |
| Unit (pure) | Yes | No shared state; input → output | `session-activity.test.ts`, `rail-groups.test.ts` |
| Unit (temp-dir + fakes) | Yes | Per-test `mkdtempSync` `ConfigStore` + hand-rolled `fakePort`/`fakeHooks`/recorder, `rmSync` in `afterEach` | `session-manager.test.ts:95-150` |
| Unit (fake timers) | Yes | `vi.useFakeTimers()` is per worker; `vi.useRealTimers()` in `afterEach` | `session-manager.test.ts:111-114` (stop-wait tests) |
| Unit (scripted fake spawn) | Yes | `makeFakeSpawn(programs)` constructed per test, no globals | `agent-step-runner.test.ts:121-152` |
| CDP smoke | No | One live app on a fixed debug port, real Claude sessions, shared `config.json` | `scripts/smoke-activity.mjs` — one at a time, by hand |

Vitest runs files in parallel workers; every unit test in this feature is safe under that model ⇒ tasks whose only tests are unit tests may carry `[P]`.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests in one file | `npx vitest run <the task's test file>` |
| Full | After a task that touches `SessionManager` or more than one test file | `npm test` |
| Build | After phase completion, and for contract/wiring/renderer-hook tasks | `npm run typecheck && npm run lint && npm test` (+ `npx electron-vite build` after T7) |
| Manual | User-facing behaviour not unit-testable | `npm run dev -- -- --remote-debugging-port=9222` then `node scripts/smoke-session-name.mjs` |

---

## Execution Plan

Three phases, run sequentially; tasks inside a phase run in the listed order (`[P]` marks the pairs with no edge between them). Every dependency edge is drawn, including the ones that cross a phase.

### Phase 1: Contracts and parsing

```
T1 [P]
T2 [P]
```

### Phase 2: Main process

```
T2 → T3 [P]
T1 → T4 [P]
```

### Phase 3: Renderer, wiring, smoke

```
T1 → T5
T5 → T6
T3 → T7
T4 → T7
T6 → T8
T7 → T8
```

---

## Task Breakdown

### T1: Shared contracts for the session name [P] ✅ COMPLETE

**Status**: Done (`28ec9c8`) — build gate green, 917/917.

**What**: Add the optional `name` to `SessionView` and the `session:name` push to `IpcEvents`; `PersistedSession` stays untouched.
**Where**: `src/shared/config.ts` (`SessionView`, after `activity?`), `src/shared/ipc-contract.ts` (`IpcEvents`, after `session:activity`)
**Depends on**: None
**Reuses**: the `activity?` / `'session:activity'` doc-comment shape (`config.ts:57-60`, `ipc-contract.ts:136-138`)
**Requirement**: SNAME-02, SNAME-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `SessionView.name?: string` with the design's doc comment (source, absence cases, "never persisted (SNAME-15)")
- [ ] `IpcEvents['session:name']: { id: string; name: string | null }` with the design's doc comment
- [ ] `PersistedSession` unchanged (`git diff src/shared/config.ts` touches only `SessionView`)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 917 (no change; no silent deletions)

**Tests**: none (type-only contract)
**Gate**: build

**Commit**: `feat(shared): carry the agent's own session name on the view`

---

### T2: `parseAgentsListing` [P] ✅ COMPLETE

**Status**: Done (`3faead1`) — 17 tests (the 11 planned cases, `it.each`-expanded); quick gate green.

**What**: The pure parser that turns the listing's stdout into `Map<sessionId, name>`, trusting nothing about its shape.
**Where**: `src/main/agents-listing.ts` (new), `src/main/agents-listing.test.ts` (new)
**Depends on**: None
**Reuses**: pure-function test style (`src/main/tree.test.ts`, `shortcut-launcher.test.ts`)
**Requirement**: SNAME-13; edge cases "duplicate `sessionId`" and "whitespace name"

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `parseAgentsListing(stdout: string): Map<string, string> | null` — `null` when stdout is not parseable JSON or not an array; otherwise one entry per element whose `sessionId` is a non-empty string and whose **trimmed** `name` is a non-empty string; the **first** qualifying entry per `sessionId` wins; every other field ignored
- [ ] Tests, one per branch: empty array → empty map; invalid JSON → `null`; JSON object (not array) → `null`; non-object element skipped; missing `sessionId` skipped; non-string `sessionId` skipped; missing/non-string `name` skipped; whitespace-only `name` skipped; `name` trimmed; duplicate id → first non-empty wins (second entry ignored even with a different name); interactive and background shapes from the 2026-09-18 measurement both parse with their extra fields ignored
- [ ] Gate check passes: `npx vitest run src/main/agents-listing.test.ts`
- [ ] Test count: 917 → ~928 (+11; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): parse the claude agents listing into session names`

---

### T3: `SessionNamePoller` [P] ✅ COMPLETE

**Status**: Done — `src/main/session-name-poller.ts` + 20 tests (planned 18); quick gate green, eslint/tsc clean, `agent-step-runner.test.ts` 17/17 unmodified. **Scope addition, owner-approved 2026-09-19:** `AgentChild.onError?` added to the seam (`agent-step-runner.ts`) — Node emits `error` (not a throw) for `ENOENT`/`EACCES`, and an unlistened `error` on a `ChildProcess` is an uncaught exception in main; the poller subscribes when present, T7 wires `child.on('error')` in `spawnAgent`. `implements SessionNames` dropped for structural typing (the interface lands in T4).

**What**: The main-process poller that decides *when* to call `claude agents --json`, runs it through the `AgentSpawn` seam with a timeout, and reports each successful listing as a map.
**Where**: `src/main/session-name-poller.ts` (new), `src/main/session-name-poller.test.ts` (new), `src/main/agent-step-runner.ts` (`AgentChild.onError?`)
**Depends on**: T2
**Reuses**: `AgentSpawn`/`AgentChild` (`src/main/agent-step-runner.ts:60-73`); `makeFakeSpawn` scripted-child pattern (`agent-step-runner.test.ts:121-152`); `parseAgentsListing` (T2)
**Requirement**: SNAME-09, SNAME-10, SNAME-12, SNAME-14; edge case "tick while a call is in flight" (coalesced, per design)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `constructor(deps: { spawn: AgentSpawn; resolveBin: () => string; cwd: string; env: NodeJS.ProcessEnv; log: (msg: string) => void; debounceMs?: number; intervalMs?: number; timeoutMs?: number })` with defaults 1000 / 30000 / 20000 exported as named constants; `watch(id, claudeSessionId)`, `nudge(id)`, `unwatch(id)`, `onListing(listener)`, `dispose()` per design
- [ ] A call spawns `resolveBin()` with argv exactly `['agents', '--json']` and the given `cwd`/`env`; the resolved path is cached after the first successful call and dropped on a spawn error
- [ ] One call at a time: a tick/nudge during a call sets a rerun flag; the rerun is scheduled when the child closes
- [ ] Success = exit code `0` **and** `parseAgentsListing(stdout) !== null` → every `onListing` listener receives the map; a failure streak that was open logs `[session-name] listing recovered`
- [ ] Failure (spawn throw, `resolveBin` throw, non-zero exit, `timeoutMs` elapsed → `child.kill()`, unparseable stdout) → no listener call, one `log` line naming the reason plus the first 200 chars of stderr, silent until the streak closes
- [ ] Tests (fake spawn + `vi.useFakeTimers()`, `vi.useRealTimers()` in `afterEach`): first `watch` → one call after `debounceMs`; two `watch` within the debounce → one call; `nudge` → one debounced call; interval fires every `intervalMs` while ≥1 id watched; `unwatch` of the last id stops the interval and cancels a pending debounce (no call after); no id ever watched → no call; argv/cwd/env asserted; success map delivered; exit 1 → no listener + one log; second failure in the streak → no second log; recovery → log; timeout → `kill` + failure; non-JSON stdout → failure; tick during in-flight → no overlap, one rerun after close; `resolveBin` throw → failure without spawn; spawn throw drops the cache (next call resolves again); `dispose()` during a call → `kill`, listener never fires on the later close, interval stopped
- [ ] Gate check passes: `npx vitest run src/main/session-name-poller.test.ts`
- [ ] Test count: ~928 → ~946 (+18; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): poll the claude agents listing while named sessions run`

---

### T4: `SessionManager` learns and applies names [P] ✅ COMPLETE

**Status**: Done — `SessionNames` exported, `claudeSessionId`/`name` on `RunningSession`, `handleHookEvent` watch/nudge, `applyNames`, `#setName`, `#finalize` clears + unwatches, `#toView` carries `name`. 18 tests (planned 14; the `session_id` guard is `it.each` ×3, plus PTY-exit and respawn cases); 43 existing tests unmodified. Phase 2 build gate: typecheck clean, lint 0 errors, **972/972** (917 + 17 + 20 + 18).

**What**: The manager records each session's Claude `session_id` from hook payloads, tells the `SessionNames` collaborator what to watch, applies a listing to its sessions, emits on change and clears on stop.
**Where**: `src/main/session-manager.ts`, `src/main/session-manager.test.ts`
**Depends on**: T1
**Reuses**: `ActivityHooks` optional-dep pattern (`session-manager.ts:29-37`); `#setActivity` change-only emit (`:340-346`); `#finalize` token revoke (`:321-336`); `makeManager`/`fakeHooks`/`hookEvent`/`recordingEmit` harness (`session-manager.test.ts:95-150, 458-464`)
**Requirement**: SNAME-01 (data), SNAME-02, SNAME-04, SNAME-08, SNAME-11, SNAME-15; edge cases "`/clear`/`/resume` id change", "two app sessions with one `session_id`"

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `export interface SessionNames { watch(id, claudeSessionId): void; unwatch(id): void; nudge(id): void }` and `SessionManagerDeps.names?: SessionNames` (absent = no names, pre-feature rendering)
- [ ] `RunningSession` gains `claudeSessionId: string | null` and `name: string | null`, both `null` at spawn
- [ ] `handleHookEvent`: after folding activity, a non-empty string `payload.session_id` that differs from the stored one is stored and `names.watch(id, it)` is called; the same id with `name === null` calls `names.nudge(id)`; a missing or non-string `session_id` changes nothing
- [ ] `applyNames(names: Map<string, string>)`: for every running session with a `claudeSessionId`, `#setName(session, names.get(claudeSessionId) ?? null)`; sessions without an id are skipped
- [ ] `#setName`: no-op when equal; otherwise store and `emit('session:name', { id, name })`
- [ ] `#finalize`: `name = null`, `claudeSessionId = null`, `names?.unwatch(id)` next to the token revoke; **no** `session:name` emit (the `session:status` refetch clears the row)
- [ ] `#toView`: `...(live?.name ? { name: live.name } : {})`
- [ ] Tests with a `FakeNames` recorder (`watched`, `nudged`, `unwatched` arrays): first event stores the id and watches once; a second event with the same id and no name nudges; a second event with a different id re-watches (`/clear`); after a name is set, a repeat event neither nudges nor watches; non-string / empty `session_id` → nothing recorded; `applyNames` sets the name, emits `session:name` once, and `list()` carries it; a second identical listing emits nothing; a listing without the id clears it and emits `{ name: null }`; a listing with a whitespace-free different name emits the new one; two sessions sharing one `session_id` both get the name; stop → `unwatch` called, `list()` view has no `name`, no `session:name` emitted; a manager restored from a seeded config lists no `name`; after `applyNames`, `config.get().sessions` carries no `name` key (SNAME-15); manager without `names` dep survives every path above
- [ ] Gate check passes: `npm test` (full — `SessionManager` changed)
- [ ] Test count: ~946 → ~960 (+14; 43 existing `session-manager` tests unmodified; no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `feat(main): match the claude agents listing to running sessions by session_id`

---

### T5: `applyName` / `rowLabel` and the renderer subscription ✅ COMPLETE

**Status**: Done — `session-name.ts` (`applyName`, `rowLabel`) + 5 tests; `use-sessions.ts` subscribes to `session:name` in the existing effect. Gate green (typecheck node+web, eslint, 5/5). `null` mirrors `applyActivity` exactly (`name: undefined`, key kept) rather than deleting the key — same rendering, one pattern.

**What**: The renderer's two pure decisions about a name — how a push is applied to the list and what label a row renders — plus the `session:name` subscription in `use-sessions`.
**Where**: `src/renderer/src/lib/session-name.ts` (new), `src/renderer/src/lib/session-name.test.ts` (new), `src/renderer/src/lib/use-sessions.ts` (subscription only)
**Depends on**: T1
**Reuses**: `applyActivity` (`session-activity.ts:19-29`) shape and its test file; the `session:activity` subscription block (`use-sessions.ts:51-53`)
**Requirement**: SNAME-02, SNAME-03 (label fallback), SNAME-01 (label choice)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `applyName(sessions, id, name: string | null): SessionView[]` — sets `name` on the one session, clears it to `undefined` on `null`, mirrors `applyActivity` (a `map`, unknown id dropped)
- [ ] `rowLabel(session: SessionView): string` — `session.name ?? session.agent`
- [ ] `use-sessions.ts`: `api.on('session:name', ({ id, name }) => setSessions((prev) => applyName(prev, id, name)))` inside the existing effect, unsubscribed with the others; comment extends the ACTV-07 note (in-place, not a refetch)
- [x] Tests: `applyName` sets on the matching session only; `null` clears the field (`name` is `undefined`); unknown id leaves every session equal; other fields untouched; `rowLabel` returns the name when present, the agent otherwise, and the agent when `name` is absent on a stopped session
- [ ] Gate check passes: `npm run typecheck && npm run lint && npx vitest run src/renderer/src/lib/session-name.test.ts`
- [ ] Test count: ~960 → ~966 (+6; no silent deletions)

**Tests**: unit
**Gate**: build (the hook change is typecheck-verified)

**Commit**: `feat(renderer): apply the agent's session name in place and pick the row label`

---

### T6: Rail rows label, number and describe by the session name ✅ COMPLETE

**Status**: Done — `resolveRows` keys counts/numbering/label on `rowLabel`, tooltip reads `<agent> · <name>` in place of the title; `RailRow` doc comments updated; RAIL-12/13 amended with an AD-040 note. 9 tests; the 59 existing `rail-groups` tests unmodified (0 deletions). Quick gate 68/68, eslint and typecheck clean.

**What**: `resolveRows` counts, numbers and labels by `rowLabel`, and the tooltip reads `<agent> · <name>` in place of the title when a name is present; RAIL-12/13 are amended to say so.
**Where**: `src/renderer/src/lib/rail-groups.ts` (`resolveRows`, `RailRow.label`/`tooltip` doc comments), `src/renderer/src/lib/rail-groups.test.ts`, `.specs/features/agents-rail-v2/spec.md` (RAIL-12, RAIL-13 wording)
**Depends on**: T5
**Reuses**: `resolveRows` (`rail-groups.ts:257-280`); the RAIL-13/RAIL-15 tests (`rail-groups.test.ts:287-343`) and the `tooltipOf` helper (`:492`)
**Requirement**: SNAME-01, SNAME-03, SNAME-05, SNAME-06, SNAME-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `resolveRows` keys `counts`/`seen` and builds `label` from `rowLabel(session)`; the tile still reads `session.agent` (untouched, `SessionRail.tsx:303-304`)
- [ ] `tooltip` = `` `${session.name ? `${session.agent} · ${session.name}` : session.title} · ${branchOrCwd}${activityDetail(session)}` ``
- [ ] `.specs/features/agents-rail-v2/spec.md`: RAIL-12 "the agent's display name" → "the row label — the agent's own session name when it reports one (SNAME-01), else the agent's display name"; RAIL-13 "share an agent name" → "share a row label", `<agentName> <n>` → `<label> <n>`. A one-line amendment note citing AD-040, the AD-018 precedent
- [ ] Tests: a named session's label is the name (SNAME-01); an unnamed running, an ad-hoc and a stopped session keep the agent name (SNAME-03); two rows named `refactor` in one group → `refactor 1`/`refactor 2` (SNAME-06); one named `alpha` beside two unnamed `Claude` → `alpha`, `Claude 1`, `Claude 2`; the same name in two groups stays bare in each; tooltip `Claude · alpha · <branch>` when named and `<title> · <branch>` when not (SNAME-05); activity detail still appended after the name; group header counts and `ariaLabel` unchanged by a name (SNAME-07); the existing RAIL-13/RAIL-15 tests pass unmodified
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/rail-groups.test.ts`
- [ ] Test count: ~966 → ~975 (+9; no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(renderer): label rail rows by the agent's own session name`

---

### T7: Wire the poller in main ✅ COMPLETE

**Status**: Done — `resolveClaude` hoisted above the `SessionManager` (body unchanged, runner still receives it); module-level `namePoller` constructed with `spawnAgent`/`resolveClaude`/`scrubAuthEnv(process.env)`/`userData`, passed as `names`, `onListing → applyNames`, `dispose()` in `window-all-closed`; `spawnAgent` wires `onError`. Build gate: typecheck, lint 0 errors, **986/986**, `electron-vite build` green.

**What**: Construct the `SessionNamePoller` in `index.ts` with the production spawn, resolver and env, hand it to the `SessionManager`, route listings to `applyNames`, and dispose it on `window-all-closed`.
**Where**: `src/main/index.ts`
**Depends on**: T3, T4
**Reuses**: `spawnAgent` (`index.ts:93-107`), `resolveClaude` (`:323-337`, hoisted above `new SessionManager` at `:281`), `scrubAuthEnv` (`src/main/scrub-auth-env.ts`), the `killAll()` site (`:417-425`)
**Requirement**: SNAME-10 (calls exist only while sessions run), SNAME-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `resolveClaude` moved above the `SessionManager` construction, body unchanged; `AgentStepRunner` still receives it
- [ ] `const namePoller = new SessionNamePoller({ spawn: spawnAgent, resolveBin: resolveClaude, cwd: app.getPath('userData'), env: scrubAuthEnv(process.env), log: (msg) => console.error(msg) })` before `new SessionManager({ …, names: namePoller })`
- [ ] `namePoller.onListing((names) => sessions.applyNames(names))` next to `hookServer.onEvent(...)`
- [ ] `namePoller.dispose()` in `window-all-closed`, next to `sessionManager?.killAll()`
- [ ] `spawnAgent` wires `onError: (listener) => child.on('error', listener)` (the T3 seam extension)
- [ ] A short comment naming the seam as hand-verified (TESTING.md) and pointing at T8
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test && npx electron-vite build`
- [ ] Test count: ~975 (no change; no silent deletions)

**Tests**: none (thin Electron wiring — hand-verified in T8)
**Gate**: build

**Commit**: `feat(main): serve session names from the claude agents listing`

---

### T8: Smoke script and dev hand-check ✅ COMPLETE

**Status**: Done — `scripts/smoke-session-name.mjs`, 14 checks. **Dev hand-check 2026-09-19, Claude Code 2.1.278: 14/14 PASS** (`playground-a5`/`playground-3f` within one interval of the first prompt; `/rename alpha` in place; stop → agent name; config untouched). Two environment findings on the way, neither a product defect: (1) a **second dev instance** of the app was running on the same `userData` — each launch rewrites `agent-hooks/claude-settings.json` with its own hook port, so the first run's sessions reported to the other instance and got HTTP 401 (no hook event → no `session_id` → no name); recorded in the script header and TESTING.md. (2) The first draft asserted RAIL-13 ordinals on an untagged worktree, but orphan groups are keyed per session (`rail-groups.ts` `session:<id>`), so nothing collides there — the check now asserts the bare agent name; ordinals inside a task group stay unit-tested.

**What**: An owner-runnable CDP smoke that proves the feature end to end on a live app, plus one dev-run pass of it before hand-off.
**Where**: `scripts/smoke-session-name.mjs` (new)
**Depends on**: T6, T7
**Reuses**: `scripts/smoke-activity.mjs` (CDP driver, `sessions:spawn` via `window.api`, `location.reload()` after out-of-band spawns, cleanup with `sessions:stop` + `sessions:remove`); memory `playground-smoke-via-cdp` (dev on `--remote-debugging-port=9222`, cell geometry, pitfalls)
**Requirement**: Success criteria 1–2 (three distinct labels within 30 s; `/rename alpha` shows within 30 s; stop returns the row to `Claude`); the RAIL-12 "nothing else in a row" check

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Script spawns two `Claude` sessions on one worktree, sends each a one-line first prompt, waits ≤ 35 s for two distinct row labels, runs `/rename alpha` in one, waits ≤ 35 s for `alpha`, stops it and asserts the row reads `Claude` again; every check prints `PASS`/`FAIL` and the script exits non-zero on any `FAIL`; cleanup leaves `config.json` as it found it
- [ ] Prompts are minimal (one short line each) — this is the only token spend in the feature and it is owner-authorised per run
- [ ] Dev hand-check run once against `npm run dev -- -- --remote-debugging-port=9222`, result (PASS count, Claude Code version) recorded in this file under the task
- [ ] `.specs/codebase/TESTING.md` gets one row for the new smoke script in its existing style
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` (unchanged suite; the script is outside `vitest.config.ts`'s include)
- [ ] Test count: ~975 (no change; no silent deletions)

**Tests**: none (manual smoke — TESTING.md)
**Gate**: manual + build

**Commit**: `test(smoke): drive two claude sessions through naming, rename and stop`

---

## Parallel Execution Map

```
Phase 1:
  T1 [P] ─┐
  T2 [P] ─┤   no edge between them
          │
Phase 2:  │
  T2 ──→ T3 [P]
  T1 ──→ T4 [P]

Phase 3:
  T1 ──→ T5 ──→ T6 ──┐
  T3 ─┬→ T7 ─────────┴→ T8
  T4 ─┘
```

`[P]` is ordering information inside a phase, not a directive to spawn a sub-agent per task. Three phases ⇒ inline execution, no phase workers (skill rule: > 3 phases triggers the offer).

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Shared contracts | 2 type additions, 2 files, one concept | ✅ Granular |
| T2: `parseAgentsListing` | 1 pure function + its tests | ✅ Granular |
| T3: `SessionNamePoller` | 1 class + its tests | ✅ Granular |
| T4: `SessionManager` names | 1 class extended (one collaborator, one field pair) + its tests | ✅ Granular |
| T5: `applyName`/`rowLabel` + subscription | 2 pure functions in one module + the 3-line consumer that L-001 keeps beside them | ✅ Granular (cohesive) |
| T6: Rail rows by name | 1 function changed + spec wording it amends | ✅ Granular |
| T7: Wire the poller | 1 file, 4 lines of wiring + one hoist | ✅ Granular |
| T8: Smoke + hand-check | 1 script + its run | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | no incoming edge | ✅ Match |
| T2 | None | no incoming edge | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T1 | T1 → T4 | ✅ Match |
| T5 | T1 | T1 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T3, T4 | T3 → T7, T4 → T7 | ✅ Match |
| T8 | T6, T7 | T6 → T8, T7 → T8 | ✅ Match |

`[P]` pairs (T1/T2, T3/T4) have no edge between them. ✅

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: Shared contracts | Type-only contracts | none | none | ✅ OK |
| T2: `parseAgentsListing` | Pure main module | unit | unit | ✅ OK |
| T3: `SessionNamePoller` | Main orchestrator with DI | unit | unit | ✅ OK |
| T4: `SessionManager` names | Main orchestrator with DI | unit | unit | ✅ OK |
| T5: `applyName`/`rowLabel` + subscription | Renderer pure lib (unit) + renderer hook (none) | unit (highest) | unit | ✅ OK |
| T6: Rail rows by name | Renderer pure lib | unit | unit | ✅ OK |
| T7: Wire the poller | Electron wiring | none (hand-verified) | none | ✅ OK |
| T8: Smoke + hand-check | Smoke script | manual only | none (manual) | ✅ OK |

---

## Requirement Traceability

| Requirement ID | Tasks | Phase |
| -------------- | ----- | ----- |
| SNAME-01 | T4 (data), T5 (label choice), T6 (render), T8 (live) | 2–3 |
| SNAME-02 | T1, T4, T5 | 1–3 |
| SNAME-03 | T5, T6 | 3 |
| SNAME-04 | T4 | 2 |
| SNAME-05 | T6 | 3 |
| SNAME-06 | T6 | 3 |
| SNAME-07 | T6 | 3 |
| SNAME-08 | T4 | 2 |
| SNAME-09 | T3, T4 | 2 |
| SNAME-10 | T3, T7 | 2–3 |
| SNAME-11 | T4 | 2 |
| SNAME-12 | T3 | 2 |
| SNAME-13 | T2 | 1 |
| SNAME-14 | T3, T7 | 2–3 |
| SNAME-15 | T1, T4 | 1–2 |

**Coverage:** 15 total, 15 mapped to tasks, 0 unmapped ✅
