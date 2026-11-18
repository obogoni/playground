# Session Fork Validation

**Date**: 2026-11-17
**Spec**: `.specs/features/session-fork/spec.md`
**Diff range**: `origin/main..HEAD` (a53b283..bd1aacd, branch `feature/session-fork`)
**Verifier**: independent sub-agent (author ≠ verifier)

## Validation: session-fork - PASS ✅

**Verdict**: PASS ✅ (main-process scope fully evidenced and discriminating; renderer ACs FORK-06/08/12/13 are implemented and read-verified but have no automated test by documented project convention — they stay pending hand-verification/UAT)

---

## Task Completion

Medium scope, no `tasks.md` (inline execution plan). Commits in range:

| Commit | Scope | Status |
| ------ | ----- | ------ |
| a53b283 | spec + context | ✅ Done |
| 6bb30a4 | `forkable` view flag + `session:forkable` push (FORK-09..11) | ✅ Done |
| 5d09c01 | `SessionManager.fork()` + `#start` extraArgs (FORK-01..05, 07) | ✅ Done |
| b5ef672 | IPC `sessions:fork` + `session:forkable` event | ✅ Done |
| bd1aacd | Renderer Fork button + `forkSession` hook (FORK-06, 08, 12, 13) | ✅ Done |

---

## Spec-Anchored Acceptance Criteria

Test file: `src/main/session-manager.test.ts` (abbrev. `smt`). Production: `src/main/session-manager.ts` (abbrev. `sm`).

| ID | Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -- | ------------------------- | -------------------- | ----------------------- | ------ |
| FORK-01 | WHEN a running Claude session with `claudeSessionId` X is forked THEN start a session whose command line is the source agent command + args followed by `--resume X --fork-session` | exact command line, agent args first, resume flags last | `smt:2015` - `expect(h.port.handles[1].plan.autoCommand).toBe(\`${HOOKED} --resume ${CLAUDE_ID} --fork-session\`)`; `smt:2029` - `.toBe(\`claude --model opus --settings C:\\app\\hooks.json --resume ${CLAUDE_ID} --fork-session\`)` | ✅ PASS |
| FORK-02 | WHEN forked THEN the PTY launches in the source's launch `cwd`, even when the source follows another worktree | `plan.cwd === source.cwd` (not `followedPath`) | `smt:2050` - `expect(h.port.handles[1].plan.cwd).toBe(CWD)`; `smt:2051` - `expect(fork.cwd).toBe(CWD)` (seed has `followedPath: 'C:\\work\\repo-other'`) | ✅ PASS |
| FORK-03 | WHEN forked THEN new app id, same agent + task, title `<source title> (fork)` | id ≠ source, `agent`, `task`, `title` exact | `smt:2061` - `expect(fork.id).not.toBe(src)`; `smt:2062` - `.agent).toBe('Claude')`; `smt:2063` - `.task).toEqual(LINK)`; `smt:2064` - `.title).toBe('Login work (fork)')`; `smt:2066` - persisted `toMatchObject({agent, cwd, title, task})` | ✅ PASS |
| FORK-04 | WHEN forked THEN the source keeps running on the same PTY and the same `claudeSessionId` | source PTY not killed, still running, id unchanged | `smt:2081` - `expect(h.port.handles[0].killed).toBe(false)`; `smt:2082` - `toMatchObject({ status: 'running', forkable: true })`; `smt:2087` - second fork still resumes `CLAUDE_ID` (id not rebound) | ✅ PASS |
| FORK-05 | WHEN forked THEN persist the fork without `--resume`/`--fork-session`; Respawn/Duplicate of the fork start without them | persisted fork has no command; respawn + duplicate command = plain hooked command | `smt:2101` - `expect(persisted(h.config, fork.id)).not.toHaveProperty('command')`; `smt:2102` - `handles[2].plan.autoCommand).toBe(HOOKED)` (respawn); `smt:2103` - `handles[3]...toBe(HOOKED)` (duplicate) | ✅ PASS |
| FORK-06 | WHEN a fork succeeds THEN select the fork in the Agents view | `selectedSessionId = fork.id` | **No automated test.** Code: `src/renderer/src/lib/use-sessions.ts:144` - `setSelectedSessionId(view.id)` in `.then` of `sessions:fork` (mirrors Duplicate at :131) | ⚠️ Read-verified, no test (renderer, per `.specs/codebase/TESTING.md:68`) |
| FORK-07 | IF the session is unknown, stopped, ad-hoc, or has no `claudeSessionId` THEN reject with an error and start no PTY | promise rejects; PTY count and persisted session count unchanged | `smt:2146` - `await expect(h.manager.fork(id)).rejects.toThrow()`; `smt:2148` - `expect(h.port.handles).toHaveLength(spawned)`; `smt:2149` - `expect(h.config.get().sessions).toHaveLength(sessions)` (it.each: unknown / stopped / no id / ad-hoc, `smt:2120-2140`) | ✅ PASS (spec defines no error text; `toThrow()` with no message is acceptable) |
| FORK-08 | IF a fork fails THEN toast titled `Couldn't fork session`, selection unchanged | toast title exact; no selection change | **No automated test.** Code: `use-sessions.ts:149` - `onToast(failureToast("Couldn't fork session", err))`; `.catch` path never calls `setSelectedSessionId` | ⚠️ Read-verified, no test (renderer) |
| FORK-09 | WHILE running with a `claudeSessionId` THEN `forkable: true` in `SessionView` | `forkable === true` | `smt:1945` - `expect(manager.list()[0].forkable).toBe(true)`; `smt:1988` (after respawn) | ✅ PASS |
| FORK-10 | WHILE stopped, ad-hoc, non-Claude, or no `claudeSessionId` THEN omit `forkable` | property absent | `smt:1935-1936` - `expect(view).not.toHaveProperty('forkable')` (no id yet); `smt:1955` (stopped); `smt:1963-1964` (ad-hoc); `smt:2110` (fresh fork) | ✅ PASS (non-Claude registry agent not separately tested; same mechanism as ad-hoc: no hook token ⇒ no id, `sm:458`) |
| FORK-11 | WHEN a running session receives its first `session_id` THEN push a session update | `session:forkable {id}` emitted once per run, on first id only | `smt:1975` - `expect(forkableEvents(emit)).toEqual([{ id: view.id }])` (3 hook events, 2 ids); `smt:1987` - `.toEqual([{ id: view.id }, { id: view.id }])` across respawn. Renderer refetch: `use-sessions.ts:72` - `api.on('session:forkable', refreshSessions)` | ✅ PASS (main side); renderer listener read-verified |
| FORK-12 | WHILE forkable the detail header shows `Fork` next to `Duplicate` | button rendered after Duplicate | **No automated test.** Code: `src/renderer/src/components/AgentsView.tsx:293-302` - `{session.forkable && (<button ...> Fork</button>)}` placed directly after the Duplicate button | ⚠️ Read-verified, no test (renderer) |
| FORK-13 | WHILE not forkable the header does not render `Fork` | button absent | **No automated test.** Code: `AgentsView.tsx:293` - conditional `session.forkable &&` | ⚠️ Read-verified, no test (renderer) |

**Edge cases**

| Edge case | Evidence | Result |
| --------- | -------- | ------ |
| Session stops between render and fork → reject (FORK-07) | `smt:2122-2129` stopped case of the FORK-07 `it.each`; `sm:278-279` | ✅ |
| A fork that becomes forkable can itself fork | `smt:2110` - `expect(fork).not.toHaveProperty('forkable')`; `smt:2115` - `.toBe(\`${HOOKED} --resume claude-forked --fork-session\`)` | ✅ |
| PTY host fails to spawn the fork → persist nothing (PTYH-14) | `smt:2157` - `rejects.toThrow('Cannot create process')`; `smt:2159` - `expect(h.config.get().sessions.map((s) => s.id)).toEqual([src])` | ✅ |

**Status**: ✅ 9/13 ACs + 3/3 edge cases evidenced by discriminating automated tests. ⚠️ FORK-06, FORK-08, FORK-12, FORK-13 (renderer layer) have no automated evidence; the project's Test Coverage Matrix (`.specs/codebase/TESTING.md:68`) assigns renderer components to CDP smoke/visual verification, so they are not counted as unit-test gaps, but they remain **unverified until hand-verified / UAT**.

---

## Discrimination Sensor

Scratch: temporary `git worktree` of HEAD under the session scratchpad with a `node_modules` junction; each mutant applied to the scratch `src/main/session-manager.ts` only, file restored between mutants; full `src/main/session-manager.test.ts` run per mutant (143 tests).

| # | File:line (sm) | Description | Killed? | Killing test(s) |
| - | -------------- | ----------- | ------- | --------------- |
| M1 | `sm:292` | Drop `--fork-session` from the launch args | ✅ Killed (4 fail) | FORK-01 ×2, FORK-04, fork-of-fork edge |
| M2 | `sm:286` | `cwd: src.followedPath ?? src.cwd` | ✅ Killed (1 fail) | FORK-02 |
| M3 | `sm:293` | Persist resume args into meta (`command: claude --resume X --fork-session`) | ✅ Killed (1 fail) | FORK-05 |
| M4 | `sm:288` | Omit the ` (fork)` title suffix | ✅ Killed (1 fail) | FORK-03 |
| M5 | `sm:290` | Do not copy the task link | ✅ Killed (1 fail) | FORK-03 |
| M6 | `sm:394` | Emit `session:forkable` on every id change (`if (true)`) | ✅ Killed (1 fail) | FORK-11 |
| M7 | `sm:671` | `forkable` regardless of running/id (`meta.command === undefined`) | ✅ Killed (3 fail) | FORK-10 ×2, fork-of-fork edge |
| M8 | `sm:281-282` | Remove the null-`claudeSessionId` guard | ✅ Killed (1 fail) | FORK-07 (no id yet) |
| M9 | `sm:462` | Resume flags before the agent args (`[...extraArgs, ...args]`) | ✅ Killed (4 fail) | FORK-01 ×2, FORK-04, edge |
| M10 | `sm:292-293` | Persist before spawn (swap `#persistUpsert` / `#start`) | ✅ Killed (1 fail) | PTYH-14 edge |
| M11 | `sm:278-279` | Fall back to persisted meta for non-running sessions (stale id) | ✅ Killed (1 fail) | FORK-07 (stopped) |
| M12 | `sm:290` | Also copy the source's `followedPath` onto the fork | ❌ Survived | — |

**Sensor depth**: lightweight+ (12 manual behavior-level mutants)
**Result**: 11/12 killed.

**M12 analysis**: the spec does not state whether a fork inherits the source's followed worktree. FORK-02 only fixes the PTY `cwd` (still correct under M12), and FORK-03 enumerates id/agent/task/title without saying "nothing else". So M12 is not a test weakness against a spec-defined outcome; it is a **⚠️ spec-precision gap**: the fork's follow state is undefined. The current implementation (fork starts with no `followedPath`, re-follows on its own edits) is the sensible behaviour and matches Duplicate (`sm:254-262`).

**Isolation**: real-tree `git status --porcelain` before and after the sensor is identical (` M .specs/LESSONS.md`, ` M .specs/lessons.json`, `?? .specs/features/ado-triggers/`). Junction removed with `rmdir` before `git worktree remove --force`; `M:\obogoni\playground\node_modules` verified intact (459 entries before and after).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ `fork()` is 18 lines reusing `#start`/`#persistUpsert`; one optional `extraArgs` param |
| Surgical changes | ✅ Only the 7 listed source files + tests; no unrelated edits |
| No scope creep | ✅ No persistence of Claude id, no prompt, no dialog (all Out of Scope) |
| Matches patterns | ✅ Mirrors Duplicate (`sessions:duplicate`, select-on-success, `failureToast`), `session:followed`-style refetch event |
| Spec-anchored outcome check | ✅ Asserted values match spec outcomes exactly (command line, cwd, title, absence of `forkable`/`command`) |
| Per-layer Coverage Expectation | ✅ Main-process deep module 1:1 AC mapping; renderer per matrix = smoke/visual (pending) |
| Every test maps to a spec requirement | ✅ All 15 new tests are tagged FORK-xx or a listed edge case |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md` (Coverage Matrix) |

---

## Gate Check

- **Gate command**: no `tasks.md`; used `npm run typecheck` + `eslint` on the changed files + `npx vitest run src/main/session-manager.test.ts` (full suite has pre-existing, environment-caused failures in untouched real-git/fs test files)
- **Result**: typecheck 0 errors (node + web); eslint exit 0; session-manager tests **143 passed, 0 failed, 0 skipped**
- **Test count before feature** (`origin/main`, `it(`/`it.each(` declarations in the file): 119
- **Test count after feature**: 134 declarations (143 executed incl. `it.each` expansion)
- **Delta**: +15 declarations, no tests removed, no assertions weakened (diff touches only the two new describe blocks)

---

## Fix Plans (non-blocking)

### Fix 1: Hand-verify the renderer ACs (FORK-06, FORK-08, FORK-12, FORK-13)

- **Root cause**: renderer has no unit tests by convention (`TESTING.md:68`).
- **Fix task**: run the spec's Independent Test in `npm run dev` (new Claude session → no Fork; after first message → Fork appears next to Duplicate; click → `<title> (fork)` selected; Stop → Fork gone; force a failure → `Couldn't fork session` toast, selection unchanged), or add a `scripts/smoke-session-fork.mjs` CDP smoke.
- **Priority**: Major (blocks marking those 4 IDs Verified)

### Fix 2: Pin the fork's follow state in the spec (M12)

- **Root cause**: spec silent on whether the fork inherits `followedPath`.
- **Fix task**: add to FORK-03 "...and no followed worktree (it follows its own edits)", then add `expect(persisted(h.config, fork.id)).not.toHaveProperty('followedPath')` to the FORK-02 test (`smt:2048-2051`).
- **Priority**: Minor

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FORK-01 | Implementing | ✅ Verified |
| FORK-02 | Implementing | ✅ Verified |
| FORK-03 | Implementing | ✅ Verified |
| FORK-04 | Implementing | ✅ Verified |
| FORK-05 | Implementing | ✅ Verified |
| FORK-06 | Implementing | Implementing (UAT pending) |
| FORK-07 | Implementing | ✅ Verified |
| FORK-08 | Implementing | Implementing (UAT pending) |
| FORK-09 | Implementing | ✅ Verified |
| FORK-10 | Implementing | ✅ Verified |
| FORK-11 | Implementing | ✅ Verified |
| FORK-12 | Implementing | Implementing (UAT pending) |
| FORK-13 | Implementing | Implementing (UAT pending) |

---

## Summary

**Overall**: ✅ Ready (main process) / ⚠️ renderer pending hand-verification

**Spec-anchored check**: 9/9 automatable ACs matched spec outcome; 4 renderer ACs read-verified only; 1 spec-precision gap (fork follow state, from M12)
**Sensor**: 11/12 mutations killed (M12 survived on unspecified behaviour)
**Gate**: typecheck + lint clean; 143/143 session-manager tests passed

**What works**: command line construction and arg order, launch-cwd rule, title/task/id, source untouched, launch-only resume flags, eligibility guards, forkable flag lifecycle, first-id push, spawn-failure persistence rule, fork-of-fork.

**Issues found**: renderer ACs untested (Fix 1); fork follow state unspecified (Fix 2).

**Next steps**: hand-verify FORK-06/08/12/13 in dev, then flip them to Verified.

## Follow-up: gap 2 closed

FORK-03 now states the fork carries no followed worktree, and the FORK-02 test asserts `fork` and its persisted record have no `followedPath` (`src/main/session-manager.test.ts`, `SessionManager fork (FORK)`). Mutant M12 (copy `followedPath` onto the fork) is now killed by that assertion. `session-manager.test.ts`: 143 passed.

Gap 1 (FORK-06, FORK-08, FORK-12, FORK-13) remains a manual check in the running app, per `.specs/codebase/TESTING.md` (no renderer component tests).
