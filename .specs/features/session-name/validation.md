# Session Name Validation

**Date**: 2026-09-19
**Spec**: `.specs/features/session-name/spec.md`
**Diff range**: `6ecd19c..HEAD` (10 commits, `feature/session-name`)
**Verifier**: independent sub-agent (author ≠ verifier) — every criterion re-derived from the spec
and the diff; the author's tables in `tasks.md` were not trusted.

---

## Task Completion

| Task | Commit | Status line in `tasks.md` | Verified |
| ---- | ------ | ------------------------- | -------- |
| T1: Shared contracts | `28ec9c8` | ✅ COMPLETE — 917/917 | ✅ `SessionView.name?` (`config.ts:61-65`), `IpcEvents['session:name']` (`ipc-contract.ts:139-141`); `PersistedSession` untouched (diff of `config.ts` is 5 added lines inside `SessionView` only) |
| T2: `parseAgentsListing` | `3faead1` | ✅ COMPLETE — 17 tests | ✅ `agents-listing.test.ts` = 17 tests, all pass |
| T3: `SessionNamePoller` | `eab28fc` | ✅ COMPLETE — 20 tests; `AgentChild.onError?` scope addition | ✅ `session-name-poller.test.ts` = 20 tests; `agent-step-runner.ts` diff is the 4-line optional `onError?` only |
| T4: `SessionManager` names | `2724960` | ✅ COMPLETE — 18 tests, 43 existing unmodified | ✅ `session-manager.test.ts` 43 → 61 (+18); the 3 removed lines are harness (`type EmitFn`, `hooks`, `return {…}`), no `it(` removed |
| T5: `applyName`/`rowLabel` + subscription | `cbf5d6f` | ✅ COMPLETE — 5 tests | ✅ `session-name.test.ts` = 5; `use-sessions.ts` subscribes and unsubscribes `session:name` |
| T6: Rail rows by name | `e5cc36a` | ✅ COMPLETE — 9 tests, 59 existing unmodified | ✅ `rail-groups.test.ts` 59 → 68 (+9), 0 removed lines; RAIL-12/13 amended with the AD-040 note |
| T7: Wire the poller | `bdab7e8` | ✅ COMPLETE — build gate 986/986 | ✅ `index.ts:310-327,441`; `resolveClaude` body byte-identical after the hoist (diffed old vs new); `onError` wired at `:106` |
| T8: Smoke + hand-check | `9947bd0` | ✅ COMPLETE — 14/14 PASS, Claude Code 2.1.278 | ✅ script has 13 named checks + 1 gate (14 `check(` calls); TESTING.md row added. Hand-run result is the author's record — not re-run by the Verifier (spends tokens; owner-run by convention) |

---

## Spec-Anchored Acceptance Criteria

Evidence rule: `file:line` + the assertion expression, and the asserted value must be the
spec-defined outcome. Emitted events (`session:name`) are matched on field values, not on "a call
happened". `index.ts` wiring, `use-sessions.ts` and `SessionRail.tsx` are convention-exempt
(TESTING.md); where they are the only evidence the row says **smoke-only**.

| AC | Spec-defined outcome | Evidence (`file:line` — assertion) | Result |
| -- | -------------------- | ---------------------------------- | ------ |
| SNAME-01 | Running `claude` registry session with a `session_id` + listing entry with that `sessionId` and non-empty trimmed `name` → row label is that name | Data: `session-manager.test.ts:751-752` — `expect(manager.list()[0].name).toBe('alpha')`, `expect(nameEvents(emit)).toEqual([{ id: view.id, name: 'alpha' }])`. Trim: `agents-listing.test.ts:75-77` — `'  alpha  '` → `new Map([['sid-1', 'alpha']])`. Label: `session-name.test.ts:45` — `expect(rowLabel(session({ id: 'a', name: 'alpha' }))).toBe('alpha')`; `rail-groups.test.ts:614` — `expect(row.label).toBe('alpha')`. Eligibility ("command key is `claude`"): pre-existing ACTV-02 tests `session-manager.test.ts:510,520` prove ad-hoc / non-Claude sessions get no hook token, so they never receive a `session_id`. DOM rendering of `row.label`: **smoke-only** (`SessionRail.tsx:306`, untouched; smoke check "the rows render the names as their labels") | ✅ |
| SNAME-02 | Later listing with a different non-empty name → row updates in place, no session-list refetch | `session-manager.test.ts:774-778` — `list()[0].name` `'alpha'` and `nameEvents(emit)` `toEqual([{ id, name: 'repos-a2' }, { id, name: 'alpha' }])`. In-place apply: `session-name.test.ts:23-24` — `expect(next[0]).toEqual({ ...a, name: 'alpha' })`, `expect(next[1]).toBe(b)`. "Without refetching": `use-sessions.ts:54-56` calls `applyName`, not `refreshSessions` — **hand-verified by convention** (renderer hook); smoke check "/rename alpha reaches the row within one interval (SNAME-02)" | ✅ |
| SNAME-03 | No name (no hook yet / non-Claude / ad-hoc / stopped / absent from listing) → agent display name with RAIL-13 numbering | `rail-groups.test.ts:628` — unnamed running, ad-hoc, stopped → `toEqual(['Claude', 'Ad-hoc', 'Codex'])`; `:652` — numbering keeps applying to the unnamed → `['alpha', 'Claude 1', 'Claude 2']`. `session-name.test.ts:49-50` — `rowLabel` `'Claude'` for unnamed running and stopped. No hook yet: `session-manager.test.ts:814-815` — `list()[0].name` undefined and `nameEvents(emit)` `[]` after `applyNames`; respawn: `:855-856`. Absent from listing: `:789-792` — name cleared to `null` | ✅ |
| SNAME-04 | Named session stops / PTY exits → name cleared, row falls back | `session-manager.test.ts:827-830` — `expect(names.unwatched).toEqual([view.id])`, `list()[0].name` undefined, `nameEvents(emit)` `[]` (stop); `:841-842` — same on `emitExit(0)`. Renderer clear: `session-name.test.ts:32-33` — `cleared.name` undefined, other fields kept. Row fallback rides the pre-existing `session:status` refetch (design decision "No `session:name` on stop") | ✅ |
| SNAME-05 | Tooltip **and accessible name** read `<agent> · <name>` | Tooltip: `rail-groups.test.ts:671` — `expect(row.tooltip).toBe('Claude · alpha · user/otavio/24173-fix-login')`; `:683` — activity detail still appended after the name. `SessionRail.tsx:299` puts `row.tooltip` in `title` (untouched component). **Accessible name**: the row has no `aria-label`; its accessible name is its content (`row.label` = `alpha`), and the action buttons' `aria-label` interpolate `row.label` (`SessionRail.tsx:317-318`). So the *accessible name* reads `alpha`, not `Claude · alpha`; only the `title` (accessible description) carries `<agent> · <name>`. Owner confirmed this reading at approval (`tasks.md` Status: "SNAME-05 via `title` + button labels, no row `aria-label`") | ✅ against the approved reading — ⚠️ **spec-precision gap**: the AC text still says "accessible name" |
| SNAME-06 | Same label in one group → `<label> 1`, `<label> 2`; unique label unsuffixed | `rail-groups.test.ts:638` — `toEqual(['refactor 1', 'refactor 2'])`; `:652` — named row bare beside colliding agent-named rows; `:662-663` — same name in two groups stays `'alpha'` in each | ✅ |
| SNAME-07 | Name set/changed/cleared → header counts, group heads, detail bar title, removal dialog, worktree detail unchanged | `rail-groups.test.ts:690-691` — `groups[0].ariaLabel` `toBe('#24173 Fix the login redirect')`, `headerCounts(sessions)` `toEqual({ running: 2, working: 0, needYou: 0 })`; `:697` — `row.session.agent` `'Claude'` (tile source). Detail bar / removal dialog / worktree detail: no component file is in the diff (`git diff --stat` lists only `lib/` files under `src/renderer`), `PersistedSession.title` untouched — structural evidence, not an assertion; smoke covers the live rail only | ✅ (counts/heads unit; the three `title` surfaces by diff inspection) |
| SNAME-08 | Hook event → record `session_id`, most recent wins | `session-manager.test.ts:687` — `expect(names.watched).toEqual([{ id: view.id, claudeSessionId: CLAUDE_ID }])`; `:709-712` — a new id is re-watched after the first (`[…CLAUDE_ID, …'claude-new']`, most recent wins); `:728-741` (`it.each` ×3) — missing / non-string / empty `session_id` → `watched` `[]`, `nudged` `[]`, name stays undefined | ✅ |
| SNAME-09 | First `session_id`, or event for a session with id and no name → one listing call, debounced 1 s | Manager: `:687-688` watch once, `:698-699` — `expect(names.nudged).toEqual([view.id])` on a repeat id while unnamed; `:724-725` — no nudge once named. Poller: `session-name-poller.test.ts:128-136` — 0 calls at `NAME_DEBOUNCE_MS - 1`, exactly `[{ bin, argv: ['agents', '--json'], cwd, env }]` at `NAME_DEBOUNCE_MS`; `:147` — two watches inside the window → `toHaveLength(1)`; `:154-157` — nudge → one more call after the debounce. The literal 1 s is pinned in source only (`session-name-poller.ts:5`, `NAME_DEBOUNCE_MS = 1000`); the tests assert against the exported constant | ✅ (see note N1) |
| SNAME-10 | ≥1 running session with id → call every 30 s; none → no calls | `session-name-poller.test.ts:172-178` — calls 2 then 3 at each `NAME_INTERVAL_MS`; `:187` — `unwatch` of the last id → still 1 call after 2 intervals; `:197` — pending debounce cancelled → 0; `:205` — nothing watched → 0 after 3 intervals; `:166` — nudge for an unwatched id → 0. Manager side unwatches on stop (`session-manager.test.ts:827`). Literal 30 s: `session-name-poller.ts:7`. Production wiring (`index.ts:310-327`): **smoke-only** | ✅ (see note N1) |
| SNAME-11 | Success → set trimmed non-empty name, clear when absent/empty, push `session:name` only on change | `session-manager.test.ts:751-752` set + one event with `{ id, name: 'alpha' }`; `:763` — identical listing → `toHaveLength(1)`; `:789-792` — absent id → `list()[0].name` undefined and events `[…, { id, name: null }]`; `:805` — two sessions sharing one id → `['alpha', 'alpha']`; `:814-815` — session without id skipped. Empty/whitespace name never reaches the map: `agents-listing.test.ts:69-71` → `new Map()`. Delivery of the map: `session-name-poller.test.ts:248-249` — `expect(t.listings).toEqual([LISTING_MAP])` to every listener | ✅ |
| SNAME-12 | Failure (spawn error, non-zero exit, 20 s timeout, non-array output) → keep names, log once per streak, retry next call | `session-name-poller.test.ts:261-265` — exit 1 → `listings` `[]`, `logs` length 1 containing `'exit 1'`, stderr capped at 200 chars; `:277-278` — second failure → still 1 log; `:291-293` — recovery → `listings` `[LISTING_MAP]`, `logs[1]` contains `'recovered'`; `:302-310` — not killed at `NAME_TIMEOUT_MS - 1`, killed at `NAME_TIMEOUT_MS`, log `'timeout'`, no listing; `:320-322` — `'not a JSON array'`; `:334-337` — resolver throw → no spawn; `:354-359` and `:369-375` — spawn throw / `error` event → failure, re-resolve next call. "Keep every current name" follows by construction: names change only in `applyNames`, which only a successful listing reaches. Literal 20 s: `session-name-poller.ts:10` | ✅ (see note N1) |
| SNAME-13 | Parse reads only `sessionId` and `name`, tolerates missing / non-string, ignores other fields | `agents-listing.test.ts:32-37` — both measured shapes → exactly `Map([[sid, 'repos-a2'], [sid, 'Revisar correções']])` (7 extra fields ignored); `:57-60` — non-object elements skipped; `:70-71` — missing / non-string / empty `sessionId`, missing / non-string `name` → `new Map()`; `:41` — `[]` → empty map; `:49-50` — non-array / non-JSON → `toBeNull()` | ✅ |
| SNAME-14 | Quit / dispose while a call is in flight → kill the child, emit nothing afterwards | `session-name-poller.test.ts:384-391` — `killed` `true` right after `dispose()`, then stdout + `close(0)` + two intervals → `listings` `[]`, `logs` `[]`, `calls` length 1. `namePoller?.dispose()` in `window-all-closed` (`index.ts:441`): **smoke-only / hand-verified** | ✅ |
| SNAME-15 | Not written to `config.json`; `PersistedSession` unchanged; a session loaded at startup has no name | `session-manager.test.ts:865-869` — `expect(session).not.toHaveProperty('name')` for every persisted session after `applyNames`; a manager seeded from that config → `list()[0].name` undefined. `PersistedSession` unchanged: `config.ts` diff adds 5 lines inside `SessionView` only | ✅ |

**Notes**

- **N1 — cadence literals**: the spec fixes 1 s / 30 s / 20 s. The tests drive the poller with the
  exported constants, so the *behaviour at the boundary* is asserted (0 calls at `T-1`, 1 call at
  `T`), but the literal values are verified only by reading `session-name-poller.ts:5,7,10`
  (`1000` / `30000` / `20000`). A one-line test pinning the three constants would make the spec
  values test-visible. Low priority; not a gap in behaviour coverage.

### Edge Cases

| Edge case | Evidence | Result |
| --------- | -------- | ------ |
| `/clear` / `/resume` changes the `session_id` — old id vanishes (cleared), new id re-watched | `session-manager.test.ts:709-713` — `watched` `toEqual([{…CLAUDE_ID}, {…'claude-new'}])`, `nudged` `[]`; clearing on a listing without the old id: `:789-792` | ✅ |
| Same `sessionId` twice in the listing → first entry with a non-empty name wins | `agents-listing.test.ts:81-89` — `['   ', 'first', 'second']` → `new Map([['sid-1', 'first']])` (whitespace entry skipped, second ignored) | ✅ |
| Two app sessions hold the same `session_id` → both receive the name | `session-manager.test.ts:805` — `list().map((s) => s.name)` `toEqual(['alpha', 'alpha'])` | ✅ |
| Whitespace-only `name` counts as empty | `agents-listing.test.ts:69-71` — `' \t\n'` → `new Map()` | ✅ |
| Binary not the registry command → spawn **the registry command as configured**, directly, no shell, `--json` appended to `agents` | Argv and direct spawn: `session-name-poller.test.ts:134-136` — `argv: ['agents', '--json']`, `bin` = `resolveBin()` result; `spawnAgent` is the pre-existing `shell: false` seam (`index.ts:93-108`). **However** the binary is not "the registry command as configured": production passes `resolveClaude` (`where claude` on PATH, else `agent.claudePath`), never the registry agent's `command`. The design records this as an accepted v1 risk ("`where claude` … may differ from the registry agent's `command` … Accepted for v1 … Logged in the design, not a task") — the failure mode is "no name", never a wrong name | ⚠️ **SPEC_DEVIATION** — accepted in `design.md` Risks, but `spec.md` still states the registry command. Spec text should be amended (or the Assumptions table should carry the decision) |
| 30 s tick while a call is in flight → skip rather than overlap | `session-name-poller.test.ts:212-221` — calls stay at 2 while the child is open even after a tick and a nudge; one rerun after `close` + debounce (→ 3). The design refined "skip" to "coalesce into one rerun" (Tech Decisions); no overlap ever happens, which is the spec's intent | ✅ (design-refined) |

**Smoke-only / hand-verified surfaces (convention, TESTING.md)**: `index.ts` construction of the
poller (`spawnAgent`, `resolveClaude`, `scrubAuthEnv`, `userData`), `names: namePoller`,
`onListing → applyNames`, `dispose()` on `window-all-closed`, `child.on('error')` in `spawnAgent`;
`use-sessions.ts` subscription; `SessionRail.tsx` rendering of `row.label` / `title={row.tooltip}`.
Recorded by the author as 14/14 PASS on 2026-09-19 (Claude Code 2.1.278) in `tasks.md` T8; not
re-run by the Verifier.

---

## Discrimination Sensor

One mutation at a time in NEW production code, covering test file run with
`npx vitest run <file> --reporter=json`, file restored from a byte copy and checked with
`git diff --quiet`. Tree clean after every mutant (`git status --short` empty at the end).

| # | File:line | Mutation | Covering tests | Killed by | Result |
| - | --------- | -------- | -------------- | --------- | ------ |
| M1 | `agents-listing.ts:30` | Duplicate `sessionId`: last entry wins (unconditional `set`) | `agents-listing.test.ts` | "lets the first entry with a non-empty name win a duplicated sessionId" (1/17) | ✅ killed |
| M2 | `session-name-poller.ts:167` | Log on every failure (drop `if (this.#failing) return`) | `session-name-poller.test.ts` | "logs nothing for later failures in the same streak" (1/20) | ✅ killed |
| M3 | `session-name-poller.ts:131-132` | Timeout path no longer calls `child.kill()` | same | "kills a call that outlives the timeout" (1/20) | ✅ killed |
| M4 | `session-name-poller.ts:65` | `unwatch` of the last id no longer stops the timers | same | "stops the interval when the last session is unwatched", "cancels a pending debounced call" (2/20) | ✅ killed |
| M5 | `session-name-poller.ts:99-102` | Tick during an in-flight call overlaps instead of coalescing | same | "never overlaps calls" (1/20) | ✅ killed |
| M6 | `session-manager.ts:390` | `#setName` emits even when unchanged (drop the equality guard) | `session-manager.test.ts` | "pushes nothing when a listing repeats the name" (1/61) | ✅ killed |
| M7 | `session-manager.ts:276` | `applyNames` keeps the old name when the id is absent (`?? session.name`) | same | "clears the name when a successful listing no longer carries the id" (1/61) | ✅ killed |
| M8 | `session-manager.ts:262` | Nudge on every repeat id, even once named (`else` instead of `else if (name === null)`) | same | "neither watches nor nudges once the session has its name" (1/61) | ✅ killed |
| M9 | `session-manager.ts:380` | `#finalize` no longer calls `names.unwatch(id)` | same | both SNAME-04 tests (2/61) | ✅ killed |
| M10 | `session-manager.ts:379` | `#finalize` stops resetting `session.name = null` | same | — (0/61) | ⚠️ survived — **equivalent mutant**: the `RunningSession` is dropped from `#running` two lines later (`:383`) and `#start` builds a fresh one on respawn, so the reset is unobservable. Mirrors the pre-existing, equally unobservable `session.activity = null`. Not a test gap; see Code Quality |
| M11 | `rail-groups.ts:266,271` | `resolveRows` counts/labels by `session.agent` again | `rail-groups.test.ts` | SNAME-01 + three SNAME-06 tests (4/68) | ✅ killed |
| M12 | `rail-groups.ts:277` | Tooltip keeps `session.title` when a name is present | same | both SNAME-05 tests (2/68) | ✅ killed |
| M13 | `session-name.ts:24` | `rowLabel` always returns `session.agent` | `session-name.test.ts` + `rail-groups.test.ts` | `rowLabel` SNAME-01 + four rail tests (5/73) | ✅ killed |
| M14 | `session-name.ts:17` | `applyName` names every session, not only the matching id | `session-name.test.ts` | "names the pushed session in place and leaves every other one untouched", "drops a push for a session the list does not hold" (2/5) | ✅ killed (a first attempt without the arrow-return parentheses was a parse error, 0/0, and was discarded as an invalid mutant) |

**14 valid mutants: 13 killed, 1 survived (equivalent by construction).**

---

## Code Quality

| Principle | Finding | Result |
| --------- | ------- | ------ |
| Minimum code | `agents-listing.ts` 33 lines, `session-name.ts` 25, poller 182, manager +59, `rail-groups.ts` +18/−11. No speculative options, no unused exports. The two `#finalize` resets (`name`, `claudeSessionId`) are unobservable (M10) — they follow the design's explicit instruction and the existing `activity = null` line; two dead-by-construction assignments, informational | ✅ (note) |
| Surgical changes | Every one of the 23 changed files is the feature's: 14 source/test files in scope, 4 `.specs/features/session-name/*`, `STATE.md` (AD-040 row only), `TESTING.md` (one row), `agents-rail-v2/spec.md` (RAIL-12/13 amendment + note), the smoke script. `resolveClaude` hoisted with a byte-identical body (diffed). `agent-step-runner.ts` gains only the optional `onError?` (existing fakes unaffected, 17/17). No unrelated formatting or comment edits found | ✅ |
| Existing patterns | `names?: SessionNames` mirrors `hooks?: ActivityHooks` (optional dep); `#setName` mirrors `#setActivity` (change-only emit); `applyName` mirrors `applyActivity` (`map`, `undefined` on clear); `session:name` subscription sits in the same effect as `session:activity`; tests use hand-rolled fakes (`makeFakeSpawn`, `FakeNames`), `vi.useFakeTimers()` with `vi.useRealTimers()` in `afterEach`, no `vi.mock`, no real `child_process` (L-005) | ✅ |
| Tests map to spec / design (no unclaimed tests) | All 69 new tests carry an AC or edge-case tag, or map to a recorded design decision: resolver cache (`poller.test.ts:224-233,340-376` → design "Tech Decisions: Resolver cache"), "works without a names collaborator" (→ design optional dep / L-001), "drops a push for a session the list does not hold" (→ design `applyName` shape) | ✅ |
| Project guidelines (TESTING.md) | Co-located `*.test.ts`, `describe(<symbol>)` → `it(<behaviour>)`, DI fakes; the wiring and components left to the CDP smoke, as the matrix requires; smoke script outside `vitest` include | ✅ |
| Prettier/ESLint | 0 errors; the 18 warnings are the known pre-existing ones in 4 untouched files (`smoke-agent-config.mjs`, `smoke-agents.mjs`, `workflow.ts`, `src/shared/tasks.test.ts`) | ✅ |

---

## Gate Check

Run from `E:\Triade\.worktrees\session-name` on 2026-09-19.

| Command | Result |
| ------- | ------ |
| `npm run typecheck` | exit 0 (`tsconfig.node.json` + `tsconfig.web.json`) |
| `npm run lint` | exit 0 — 0 errors, 18 warnings (`prettier/prettier`) in 4 files outside the feature |
| `npx vitest run --reporter=json` (run 1) | 986 tests / 55 files — 985 passed, **1 failed**: `dir-remover.test.ts` "counts every leftover entry, files as well as directories" (the known local real-filesystem flake recorded in `tasks.md`) |
| `npx vitest run --reporter=json` (run 2) | 986 / 55 — 985 passed, **1 failed**: `hook-shell.test.ts` "captures a large burst of output in full" — a 30 s duration overrun of a real-`cmd.exe` test under parallel load, the class `vitest.config.ts` documents; file untouched by the feature |
| `npx vitest run src/main/dir-remover.test.ts src/main/hook-shell.test.ts` (isolation) | 26 / 26 passed |
| `npx vitest run --reporter=json` (run 3) | **986 / 55 — 986 passed, 0 failed** |
| Feature files in isolation | 171 / 171: `agents-listing` 17, `session-name-poller` 20, `session-manager` 61, `session-name` 5, `rail-groups` 68 |

**Counts**: baseline 917 tests / 52 files → **986 / 55**, delta **+69 tests / +3 files**
= 17 (T2) + 20 (T3) + 18 (T4: 43 → 61) + 5 (T5) + 9 (T6: 59 → 68); the three new files are
`agents-listing.test.ts`, `session-name-poller.test.ts`, `session-name.test.ts`.

**Silent deletions**: `git diff 6ecd19c..HEAD -- session-manager.test.ts | grep -c '^-[^-]'` = 3
(`type EmitFn` → `type EmitFn,`; `hooks` → `hooks,`; the `return {…}` line extended with `names`);
`rail-groups.test.ts` = 0. `it(` count 43 → 58 lines (+15, `it.each` ×3 = 18 tests) and 45 → 54.
No `it(` block removed.

---

## Fix Plans

None required for the gate. Two documentation items, no code change:

1. **Spec wording, SNAME-05** — the AC says "tooltip and accessible name"; what ships (owner-confirmed
   at approval) is the `title` attribute reading `<agent> · <name> · <branch>` and an accessible
   name equal to the row content (`<name>`). Amend the AC to "tooltip (`title`)" or add an
   Assumptions row recording the approval, so the spec and the approved behaviour agree.
2. **Spec edge case, listing binary** — the spec says "spawn the registry command as configured";
   the implementation spawns `resolveClaude()` (PATH first, then `agent.claudePath`), accepted in
   `design.md` Risks for v1. Carry that decision into the spec (edge case text or Assumptions).

Optional (N1): pin `NAME_DEBOUNCE_MS` / `NAME_INTERVAL_MS` / `NAME_TIMEOUT_MS` to `1000` / `30000`
/ `20000` in one assertion so the spec cadence is test-visible.

---

## Requirement Traceability Update

| Requirement ID | Before | After |
| -------------- | ------ | ----- |
| SNAME-01 | Mapped → T4, T5, T6, T8 | ✅ Verified (T4, T5, T6, T8) |
| SNAME-02 | Mapped → T1, T4, T5 | ✅ Verified (T1, T4, T5) |
| SNAME-03 | Mapped → T5, T6 | ✅ Verified (T5, T6) |
| SNAME-04 | Mapped → T4 | ✅ Verified (T4) |
| SNAME-05 | Mapped → T6 | ✅ Verified (T6) — ⚠️ spec-precision gap on "accessible name" (owner-approved reading) |
| SNAME-06 | Mapped → T6 | ✅ Verified (T6) |
| SNAME-07 | Mapped → T6 | ✅ Verified (T6) |
| SNAME-08 | Mapped → T4 | ✅ Verified (T4) |
| SNAME-09 | Mapped → T3, T4 | ✅ Verified (T3, T4) |
| SNAME-10 | Mapped → T3, T7 | ✅ Verified (T3, T7) |
| SNAME-11 | Mapped → T4 | ✅ Verified (T4) |
| SNAME-12 | Mapped → T3 | ✅ Verified (T3) |
| SNAME-13 | Mapped → T2 | ✅ Verified (T2) |
| SNAME-14 | Mapped → T3, T7 | ✅ Verified (T3, T7) |
| SNAME-15 | Mapped → T1, T4 | ✅ Verified (T1, T4) |

---

## Summary

**PASS ✅.** All 15 acceptance criteria have `file:line` evidence whose asserted values are the
spec-defined outcomes; the six edge cases are covered, one of them (the listing binary) as a
design-accepted deviation from the spec text. The build gate is green (typecheck 0, lint 0 errors,
986/986 on a clean run; the two single failures on runs 1–2 are pre-existing real-process flakes in
files the feature does not touch, both passing in isolation and on run 3). The discrimination sensor
killed 13 of 14 valid mutants; the survivor is an equivalent mutant (an unobservable field reset in
`#finalize`), not a test gap. No existing test was deleted; the diff is confined to the feature.
Two spec-text amendments are recommended (SNAME-05 "accessible name"; the "registry command" edge
case), neither requiring a code change.

---

## Candidate Lessons (not recorded via `scripts/lessons.py`)

The installed `lessons.py` rewrites `.specs/lessons.json` and `LESSONS.md` on any invocation
(local memory, 2026-09-18), so these stay here for the owner to promote by hand:

- When the design's Risks table accepts a deviation from a spec edge case, amend the spec text in
  the same commit — otherwise verification finds spec and shipped behaviour disagreeing with no
  pointer between them. *(Applied 2026-09-19: the listing-binary edge case now names `resolveClaude`.)*
- An AC that names an accessibility surface ("accessible name") should say which DOM attribute
  carries it; `title` and the accessible name are different things, and an owner approval at task
  time does not update the AC. *(Applied 2026-09-19: SNAME-05 now says "tooltip (`title`)".)*
- A mutation that removes a field reset on an object about to be discarded is equivalent by
  construction; check whether the object outlives the line before counting a survivor as a test gap.
- Cadence values fixed by a spec (1 s / 30 s / 20 s) deserve one assertion on the literal
  constants; tests that only drive behaviour via the exported constant cannot catch a changed value.
  *(Applied 2026-09-19: `session-name-poller.test.ts` pins the three constants.)*
