## Validation: agent-task-link — PASS (round 2)

**Date**: 2026-09-28 (round 1 against `23e32cd`, round 2 against `d3f6601`)
**Spec**: `.specs/features/agent-task-link/spec.md` (ATSK-01..12)
**Diff range**: `679f433..d3f6601` (2092880 spec, e65b1e2 hook server route, 55aa7e6 env url, 9eb91e6 `session:task` push, cc202e2 wiring, 23e32cd docs + AD-051, d3f6601 round-1 fixes)
**Verifier**: independent sub-agent (author ≠ verifier). Every AC was re-derived from the spec, not from the commit messages or the author's smoke. The round-2 claims were re-run by the Verifier, not taken from the fix commit.
**Example data**: after verification, the example work item in the tests, the README and the probe records below was renamed from a real one to `12345` / `Example task` before publishing; line references are unchanged, and the suite was re-run on the renamed tests.

**Round 2 verdict: PASS.** Both round-1 gaps are closed, and each fix was re-run independently:
- M7 is now killed.
- The README call now returns `204` to a non-interactive Windows PowerShell 5.1 caller.

That leaves 12 of 12 ACs covered to the spec's outcome and 8 of 8 mutants killed. M1–M5 carry over from round 1 because no production file changed; M6–M8 were re-run on `d3f6601`.

---

## Round 2: re-verification of `d3f6601`

### What changed

| File | Change |
| ---- | ------ |
| `src/main/session-manager.test.ts` | Both ATSK-01 tests now assert the whole spawned env with literal keys (`:859-862`, `:872-875`): `expect(port.envs[N]).toEqual({ PLAYGROUND_ACTIVITY_TOKEN: expect.any(String), PLAYGROUND_TASK_URL: TASK_URL })`. The unused `TASK_URL_ENV` import is removed |
| `README.md:49` | `Invoke-WebRequest -UseBasicParsing -Method Post ...` |

No production file changed: `git show --stat d3f6601` lists these 2 files only.

### Gap 1 (ATSK-01): closed

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| ATSK-01: a session that gets a token also gets `PLAYGROUND_TASK_URL` | env var named exactly `PLAYGROUND_TASK_URL`, holding the full link URL | `src/main/session-manager.test.ts:859-862` `expect(port.envs[0]).toEqual({ PLAYGROUND_ACTIVITY_TOKEN: expect.any(String), PLAYGROUND_TASK_URL: TASK_URL })`; respawn `:872-875` (same shape on `port.envs[1]`); URL shape `src/main/activity-hook-server.test.ts:185`. Name and value are now both pinned, and `toEqual` also rules out any extra variable | ✅ PASS |

The mutants were run with the same runner and method as round 1: exact-anchor edit, the covering files, `git checkout -- <file>` after each. The source tree was clean after every run; see the workspace note below.

| Mutation | File:line | Description | Killed? | What failed |
| -------- | --------- | ----------- | ------- | ----------- |
| M6 | `src/main/session-manager.ts:189` | `setTask` no longer pushes `session:task` (ATSK-06). Re-run because its test file changed | ✅ Killed | 1/86: `setTask announces the new link ... (ATSK-06)` |
| M7 | `src/main/claude-hook-settings.ts:19` | `TASK_URL_ENV` renamed to `'PLAYGROUND_TASK_LINK'` (ATSK-01) | ✅ **Killed** (survived in round 1) | 2/136: both ATSK-01 tests. This matches the fix author's own check, 2 of 86 in that file |
| M8 | `src/main/claude-hook-settings.ts:16` | `ACTIVITY_TOKEN_ENV` renamed to `'PLAYGROUND_ACTIVITY_KEY'` (the token name the README publishes, ATSK-12). New in round 2 | ✅ Killed | 2/136: both ATSK-01 tests (the literal `PLAYGROUND_ACTIVITY_TOKEN` key) |

The 136 tests are `activity-hook-server.test.ts` 42, `claude-hook-settings.test.ts` 8 and `session-manager.test.ts` 86. Their unmutated baseline at `d3f6601` was 136/136.

### Gap 2 (ATSK-12 usability): closed

The README block was re-extracted from `README.md:47-51` at `d3f6601` and run verbatim against the real `src/main/activity-hook-server.ts` in a scratch process (`atl-verify/readme-probe3.mjs`), with each run bounded at 30 s. Shells: Windows PowerShell 5.1.26100.9444 and pwsh 7.6.6.

| # | Shell and mode | Result |
| - | -------------- | ------ |
| R4 | `powershell.exe` 5.1, `-NonInteractive`, stdin closed (round-1 R2 case) | exit 0 in 1.4 s, `StatusCode : 204`, no error, link `{id: 12345, title: 'Example task'}` applied to the token's session |
| R5 | `powershell.exe` 5.1, stdin open (the round-1 case that hung for more than 2 min) | exit 0 in 1.0 s, `StatusCode : 204`, link applied |
| R6 | `pwsh.exe` 7, `-NonInteractive` | exit 0 in 1.4 s, `StatusCode : 204`, link applied |

### Gate (round 2)

- **Typecheck**: exit 0
- **Lint**: exit 0; 0 errors, the same 18 baseline warnings, none in the diff
- **Prettier**: `--check` clean on `src/main/session-manager.test.ts` and `README.md`
- **Covering test files**: 136/136
- **Test count**: 2226, unchanged. The two ATSK-01 tests were rewritten in place; nothing was added or deleted.
- **Full suite**: not re-run. `d3f6601` changes no production code, the only changed test file passes 86/86 along with its two sibling files, and the typecheck covers every consumer of the removed import. The round-1 full run at `23e32cd` was 2225/2226, and its only failure is the `git-sync` flake below.
- **`src/main/git-sync.test.ts` in isolation**: 30/30 in 226 s. This test is intermittent on this machine:
  - round 1 failed it twice with `EBUSY` on temp-dir removal (once in the full run, once in isolation);
  - round 2 passed, and so did the fix author's isolated run.
  - It imports nothing in `679f433..d3f6601`, so it does not bear on the verdict.

### Workspace note

`.specs/LESSONS.md` and `.specs/lessons.json` became modified during round 2. The Verifier did not change them: they hold the coordinator's recording of the round-1 lessons (L-009 recurrence, now confirmed, and new candidate L-091).

The Verifier checked them read-only: `lessons.json` went from 85 to 86 entries, only L-091 (renumbered L-095 on merge with main) was added, and no candidate was dropped. They were left untouched and uncommitted. The mutant restores only ever checked out the single mutated source file.

### Requirement Traceability (round 2, proposed)

ATSK-01 moves from ❌ Needs Fix to ✅ Verified. ATSK-12 is ✅ Verified, and the snippet now works under PS 5.1. ATSK-02..11 stay ✅ Verified, as in round 1, because their code and tests are unchanged. The Verifier still does not edit `spec.md`, per the caller's constraint.

---

## Round 1 record (`23e32cd`): FAIL, superseded by round 2

The sections below are kept as recorded in round 1. Their line numbers refer to `23e32cd`. In `session-manager.test.ts`, lines after `:853` have since moved by 7: the ATSK-01 assertions are now at `:859-862` and `:872-875`, and HTSK-21 is at `:1253`.

The round-1 verdict was FAIL on two small gaps. Neither was a defect in the endpoint's behaviour:
1. One surviving mutant (M7): no test pins the published variable name `PLAYGROUND_TASK_URL`.
2. The README snippet does not return a status under Windows PowerShell 5.1, although the link is applied.

Everything else holds: 11 of 12 ACs are covered to the spec's outcome, and 6 of 7 mutants were killed.

---

## Task Completion

The feature is Medium-sized, with tasks implicit in Execute, so there is no `tasks.md`. The commits map to the requirements as follows.

| Commit | Scope | Status |
| ------ | ----- | ------ |
| e65b1e2 | `POST /task` on the hook server: validation, auth, 4 KiB cap, status codes (ATSK-02/03/07..11) | ✅ Done |
| 55aa7e6 | `PLAYGROUND_TASK_URL` beside the token on every session that gets one (ATSK-01) | ✅ Done, but the name is not pinned (Gap 1) |
| 9eb91e6 | `setTask` pushes `session:task` (ATSK-06) | ✅ Done |
| cc202e2 | `onTaskLink → sessions.setTask` wiring and the renderer subscription (ATSK-02, ATSK-06) | ✅ Done (hand-verified layer) |
| 23e32cd | README contract, AD-051 | ✅ Done, but the snippet has a PS 5.1 issue (Gap 2) |

---

## Spec-Anchored Acceptance Criteria

Unless a path is given, `hook.test` means `src/main/activity-hook-server.test.ts`, `sm.test` means `src/main/session-manager.test.ts`, and `tt.test` means `src/main/time-tracker.test.ts`.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| ATSK-01: a session that gets a token also gets `PLAYGROUND_TASK_URL` | env var named exactly `PLAYGROUND_TASK_URL`, holding the full link URL | URL value: `sm.test:858` `expect(port.envs[0]?.[TASK_URL_ENV]).toBe(TASK_URL)`; `sm.test:868` (respawn); URL shape: `hook.test:185` `expect(taskUrl).toBe(\`http://127.0.0.1:${port}/task\`)`; wiring `src/main/index.ts:565` (hand-verified). **The variable name is not asserted anywhere**: both tests index by the imported constant `TASK_URL_ENV` (`src/main/claude-hook-settings.ts:19`), so any rename passes (M7 survived, 0/136 failed). Author evidence only: the smoke's `link.ps1` reads `$env:PLAYGROUND_TASK_URL` literally | ❌ GAP (value pinned, name not) |
| ATSK-02: valid `{id, title}` from a live token links that session, with the picker's effects, and answers `204`, empty body | `{ id: N, title: trimmed T }` reaches `setTask`; `204`; body `''` | `hook.test:193` `expect(res).toEqual({ status: 204, body: '' })`; `:194` `expect(links).toEqual([{ sessionId: 'session-1', task: { id: 12345, title: 'Example task' } }])`; trimming `:201`; 255-char boundary `:211-212`. Picker parity: the endpoint calls `sessions.setTask` (`src/main/index.ts:619`), the same call as the picker's `sessions:set-task` (`:633`). That call persists and notifies the tracker (`sm.test:635-638`); tracker HTSK-12 is covered at `tt.test:552-583`, HTSK-21 at `sm.test:1246`, HTSK-17 at `sm.test:691-693`, HTSK-11 at `src/renderer/src/lib/rail-groups.test.ts:711`. Author smoke: `204`, `sessions:list` holds `{4242,'Smoke link'}`, open period `taskId` 4242 | ✅ PASS |
| ATSK-03: `title` omitted, `null` or blank | stored `title: null` | `hook.test:222-223` (`it.each` omitted/null/blank): `expect(res.status).toBe(204)`; `expect(links.map((l) => l.task)).toEqual([{ id: 12345, title: null }])` | ✅ PASS |
| ATSK-04: same id as the current link | `204`; the request's title stored; no period closes or opens | Composed from three parts. (a) The server holds no link state, so any valid body gets `204` (`hook.test:193`). (b) `setTask` stores the object it is given, with no same-id branch (`withTask`, `src/main/session-manager.ts:70-75`; asserted `sm.test:635`). (c) Tracker no-op on the same id with a different title: `tt.test:617-624`, `expect(t.store.appended).toEqual([])`, `expect(t.tracker.snapshot()).toEqual(before)`, `expect(t.emits()).toBe(emits)` | ✅ PASS (composed evidence; no end-to-end same-id test) |
| ATSK-05: linked to another task or none | old period closes and new one opens with N at the same instant | `tt.test:560-581` (none→N: close at `T0+10min`, open `start: iso(T0 + 10 * MIN)` with `LINKED`); `tt.test:605` `expect(open.start).toBe(store.appended[0].end)` under a moving clock; task→other `tt.test:634-638` | ✅ PASS |
| ATSK-06: rail, detail strip and Hours views show it with no user action and no restart | pushed to the renderer unasked | Main: `sm.test:674` `expect(emit.events.filter(... 'session:task').map(e => e.payload)).toEqual([{ id: view.id, task: LINK }])` (both payload fields asserted by value). Renderer, hand-verified per TESTING.md:42: `src/renderer/src/lib/use-sessions.ts:59` refetches on `session:task`; the preload forwards any channel (`src/preload/index.ts:13-16`). Rail and strip read `sessions` (`AgentsView.tsx:155`). Hours refetch on `time:changed` (`src/renderer/src/lib/use-time.ts:34`), which the tracker emits on a change (`tt.test:582` `expect(t.emits()).toBe(emits + 1)`). Author smoke: rail showed `Smoke link` without a reload | ✅ PASS (main tested; renderer hand-verified) |
| ATSK-07: no Bearer or unknown/revoked token | `401`, nothing changes | `hook.test:238-239` (`it.each` no token / unknown): `expect(res).toEqual({ status: 401, body: '' })`, `expect(links).toEqual([])`; revoked `:247-248` | ✅ PASS |
| ATSK-08: a live token changes only its own session | link routed to the token's session | `hook.test:229` `expect(links).toEqual([{ sessionId: 'session-2', task: { id: 7, title: 'B' } }])` with two sessions registered. M1 killed it | ✅ PASS |
| ATSK-09: bad body (not an object; `id` missing / not integer / <1 / >2^53−1; `title` not string-or-null; title >255 after trim) | `400`, nothing changes | `hook.test:266-267` (`it.each`, 11 cases: not JSON, array, `null`, missing id, string id, 0, −1, 1.5, 2^53, numeric title, 256-char title): `expect(res).toEqual({ status: 400, body: '' })`, `expect(links).toEqual([])`. Upper bound accepted `:273-274`. "After trimming" is pinned by `:204-212` (255 chars padded to 257); M2 killed it | ✅ PASS |
| ATSK-10: non-POST → `405`; unknown path → `404`; body >4 KiB → `413`; nothing changes | exact codes, no link, no event | `405`: `hook.test:280-281`. `404`: `:292-294` (also `events` empty). `413`: `:307-308` with `paddedTo(4097)`; exactly 4096 bytes is accepted at `:300-301`. M4 killed it | ✅ PASS |
| ATSK-11: hooks fold exactly as before; a hook payload is never a link | activity event dispatched, no link | `hook.test:314-316` `expect(events).toEqual([{ sessionId: 'session-1', payload: STOP_EVENT }])`, `expect(links).toEqual([])`; link body sent to `/hooks` `:322`. The pre-existing hooks tests `:45-135` are unchanged and green. M5 killed 9 tests | ✅ PASS |
| ATSK-12: README documents both variables, the body, the codes and the absent-variable case | all five present | `README.md:46-51` (snippet: `$env:PLAYGROUND_TASK_URL`, `Bearer $env:PLAYGROUND_ACTIVITY_TOKEN`); `:54-55` body rules; `:56-58` `204/400/401/404/405/413`; `:58-60` variables absent. Independent Test re-run by the Verifier (probe R1–R3 below): the verbatim snippet **links the session** in both shells. Under Windows PowerShell 5.1 the call then fails to return its status (Gap 2) | ✅ PASS (content) / usability gap ranked |

**Status**: ❌ 11/12 matched the spec outcome; 1 gap (ATSK-01, variable name not pinned); 0 spec-precision gaps, because every AC names an exact code, value or name.

**Payload/conjunction rule.**
- `session:task` has both `id` and `task` asserted by `toEqual` (`sm.test:674`).
- The link callback has `sessionId`, `id` and `title` asserted by value (`hook.test:194`, `:229`).
- The env payload has the URL value asserted, but not its key name. That is Gap 1.

---

## Discrimination Sensor

Each mutant was applied to the real tree by exact-anchor replacement, with the anchor asserted to match exactly once. The runner then ran the covering test file(s) with `npx vitest run <files> --reporter=json` and restored the file with `git checkout -- <file>` in `finally`. `git status --porcelain` was clean after every mutant, and HEAD stayed `23e32cd`. The script is in the Verifier's scratchpad (`atl-verify/mutate.mjs`), not in the tree.

| Mutation | File:line | Description | Killed? | What failed |
| -------- | --------- | ----------- | ------- | ----------- |
| M1 | `src/main/activity-hook-server.ts:158` | Every link goes to the first registered session, not the token's own (ATSK-08) | ✅ Killed | 1/42: `changes only the session its token names (ATSK-08)` |
| M2 | `src/main/activity-hook-server.ts:94` | Length checked on the untrimmed title (ATSK-02/09) | ✅ Killed | 1/42: `accepts a title of exactly 255 characters after trimming` |
| M3 | `src/main/activity-hook-server.ts:95` | Blank title stored as `''` instead of `null` (ATSK-03) | ✅ Killed | 1/42: `stores a null title when it is blank` |
| M4 | `src/main/activity-hook-server.ts:131` | Link path keeps the 8 MiB hooks cap (ATSK-10) | ✅ Killed | 1/42: `answers 413 ... over 4 KiB` |
| M5 | `src/main/activity-hook-server.ts:146` | `/hooks` handled as a link request (ATSK-11) | ✅ Killed | 9/42: 7 pre-existing hooks tests + both ATSK-11 tests |
| M6 | `src/main/session-manager.ts:189` | `setTask` no longer pushes `session:task` (ATSK-06) | ✅ Killed | 1/86: `setTask announces the new link ... (ATSK-06)` |
| M7 | `src/main/claude-hook-settings.ts:19` | `TASK_URL_ENV` renamed `'PLAYGROUND_TASK_URL'` → `'PLAYGROUND_TASK_LINK'` (ATSK-01) | ❌ **Survived** | 0/136 across `session-manager.test.ts`, `claude-hook-settings.test.ts` and `activity-hook-server.test.ts` → Fix 1 |

**Sensor depth**: lightweight. Seven mutants rather than 3–5, because the P1 story "Only the session itself" is an auth boundary; M7 was a targeted probe of a suspected weakness.
**Sensor outcome**: 6/7 killed. FAIL ❌ (one surviving mutant).

M7 matters because `PLAYGROUND_TASK_URL` is a published contract: the README documents it (AC 12), and skills outside the app read it. A rename would ship green and break every caller silently. `PLAYGROUND_ACTIVITY_TOKEN` is in the same position. Before this feature it was internal and self-consistent, because the settings file and the env both use the constant. Now the README publishes it too, and no test pins it either (`claude-hook-settings.test.ts:61` interpolates the constant). This is a recurrence of lesson L-009 ("pin every spec-derived default with a literal assertion, not a self-referential one").

---

## Independent Probes (Verifier)

The probes ran as scratch Node processes that imported the worktree's real `src/main/activity-hook-server.ts` read-only, on an ephemeral loopback port. They did not use the app, and they did not touch the main clone.

| # | Probe | Result |
| - | ----- | ------ |
| R1 | README `powershell` block, extracted verbatim from `README.md`, run with `pwsh.exe` (7) | exit 0, `StatusCode : 204`, link `{id: 12345, title: 'Example task'}` applied to the token's session |
| R2 | Same block run with `powershell.exe` (Windows PowerShell 5.1), `-NonInteractive`, stdin closed | Link **applied**; then `Invoke-WebRequest : O Windows PowerShell está no modo NonInteractive. A funcionalidade Read e Prompt não está disponível.` The response object is lost, so the caller cannot read the `204`. With stdin left open (first run), the process waited more than 2 min for input after the link and had to be stopped |
| R3 | Same as R2 with `-UseBasicParsing` added | exit 0, `StatusCode : 204`, link applied |

Reading of R2: on this machine, Windows PowerShell 5.1's `Invoke-WebRequest` without `-UseBasicParsing` asks for an interactive confirmation after the response arrives. A human in a session's terminal can answer it. An agent, the README's stated caller ("a skill that starts from a work item id"), cannot. The author's own `link.ps1` passes `-UseBasicParsing`; the README omits it. `pwsh` 7 ignores the switch, so adding it costs nothing.

Author evidence, cited but not re-run: the built-app smoke (`scratchpad/atl-smoke/smoke.mjs`) passed 6/6. It covered variables present plus `204`, the `sessions:list` link, the open period's `taskId` 4242, and the rail naming the task without a reload.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ One validator (`asTaskLink`, 11 lines), one route branch, one env key, one emit, one subscription |
| Surgical changes | ✅ Hooks path logic is unchanged except the shared path/cap selection; no unrelated edits |
| No scope creep | ✅ No unlink, no pin, no network fetch, no CLI (Out of Scope honoured) |
| Matches patterns | ✅ Reuses `bearerToken`, `answer`, `asEventObject`, `warnOnce`; the push mirrors `session:status`/`session:name`; AD-051 recorded |
| Spec-anchored outcome check | ❌ ATSK-01's name is asserted through the constant (Gap 1) |
| Per-layer coverage (TESTING.md) | ✅ Deep modules unit-tested (hook server 29 new tests, SessionManager 3); `index.ts` wiring and renderer hand-verified per TESTING.md:42-43, 67-68 |
| Every test maps to a requirement | ✅ Each of the 32 new tests names its ATSK id |
| Documented guidelines: `.specs/codebase/TESTING.md` | ✅ Real loopback listener, hand-rolled fakes, no `vi.mock` |
| Formatting | ✅ `prettier --check` clean on all 8 changed source files |

Observations (not gaps):
- **O1, unguarded listener before the 204** (`activity-hook-server.ts:158`). If `setTask` threw, the request would get no answer and the throw would escape the `end` handler. No reachable path was found:
  - a live token cannot name a removed session, because `remove()` refuses a running one (`session-manager.ts:265`) and `#finalize` revokes the token (`:423`);
  - `ConfigStore.persist` and every `TimeLogStore` write are best-effort (try/catch).
- **O2, shared warning budget.** `warnOnce` shares one per-token set between `/hooks` and `/task`, so a hook warning suppresses a later link warning for the same token. This satisfies "logged once per token" literally, but it is untested; the Observability line is an assumption, not an AC. `401`/`404`/`405` are not logged, the same as the hooks path.
- **O3, redundant refetch.** `setTask` now also pushes `session:task` for picker-driven changes, so the picker triggers two `sessions:list` refetches (the `.then` at `use-sessions.ts:104` and the event). It is harmless.
- **O4, precedence.** An unauthenticated `POST` to an unknown path gets `404`, not `401`, because the path is checked first (`:117-122`). The spec does not order these codes.

---

## Edge Cases

- [x] Session spawned before the listener was bound has no token and no URL: `sm.test:763-771`, `expect(port.envs[0]).toBeUndefined()`.
- [x] Respawn: fresh token (`sm.test:847-849`) and the URL again (`sm.test:868`). Relaunch: `index.ts:559-565` publishes the new launch's `taskUrl` each start (hand-verified). The link persists (`sm.test:691-693`).
- [x] Two calls in quick succession are applied in arrival order, last one wins. Handled by construction: `setTask` is synchronous on the single main thread, one call per `end` event. There is no dedicated test.
- [x] Paused session: the link is stored and no period opens. `setTask` has no state branch; `tt.test:651-652` shows nothing opens while paused and `:656-658` shows the resume opens on the new task. Suspended: `:670-677`.

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npx vitest run --maxWorkers=2` (TESTING.md "Full")
- **Typecheck**: exit 0
- **Lint**: exit 0; 0 errors, 18 prettier warnings, all baseline and outside the diff (`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`)
- **Tests (full run)**: 2226 total, 2225 passed, **1 failed**, 0 skipped, 481 files
  - The failure is `src/main/git-sync.test.ts` › `readCommits caps each list at 20 and counts the rest exactly`. It ran 54 s, then hit `EBUSY: resource busy or locked, rmdir '...\wtm-sync-9xNl4l\repo'` in temp-dir cleanup.
  - Re-run in isolation: 29/30, **the same test failed the same way** (50 s, `EBUSY` on `wtm-sync-eSwNIV\repo`). Other git-backed tests in that file took about 20 s each today.
  - Not attributable to this diff. `git-sync.ts`/`git-sync.test.ts` import only `./git` and `../shared/git`, and neither of those nor the test changed in `origin/main..HEAD`. It is a Windows file-lock flake of a real-git test.
  - The caller's note that it passes in isolation did **not** reproduce this session. The author reported 2226/2226.
- **Test count before feature**: 2194 (derived: 2226 − 32; not measured on the base)
- **Test count after feature**: 2226
- **Delta**: +32 (29 in `activity-hook-server.test.ts` "task link", 3 in `session-manager.test.ts`). No test deleted: the 3 removed lines in `session-manager.test.ts` are fixture wiring (import, emit recorder, return).
- **Skipped tests**: none

---

## Fix Plans

### Fix 1: pin the published variable names (M7)

- **Root cause**: `sm.test:858` and `:868` index `port.envs[0]` by the imported `TASK_URL_ENV`, so the assertion is self-referential and a rename of `claude-hook-settings.ts:19` passes. The same holds for `ACTIVITY_TOKEN_ENV`, which the README now publishes.
- **Fix task**:
  - In `src/main/session-manager.test.ts`, assert the literal keys of the spawned env. For example, `expect(port.envs[0]).toEqual({ PLAYGROUND_ACTIVITY_TOKEN: expect.any(String), PLAYGROUND_TASK_URL: TASK_URL })` in the ATSK-01 test. Alternatively, add a `claude-hook-settings.test.ts` case, `expect(TASK_URL_ENV).toBe('PLAYGROUND_TASK_URL')` and `expect(ACTIVITY_TOKEN_ENV).toBe('PLAYGROUND_ACTIVITY_TOKEN')`.
  - **Done when**: re-applying M7 fails at least one test; the same holds for the analogous rename of `ACTIVITY_TOKEN_ENV`.
- **Priority**: Minor. The code is correct today; this guards a published contract against a silent rename.

### Fix 2: make the README snippet return its status on Windows PowerShell 5.1

- **Root cause**: `README.md:49` calls `Invoke-WebRequest` without `-UseBasicParsing`. On Windows PowerShell 5.1 the call applies the link, then prompts: it errors under `-NonInteractive` or waits on open stdin, so the caller never sees the `204` (probe R2).
- **Fix task**: add `-UseBasicParsing` to the snippet (`Invoke-WebRequest -UseBasicParsing -Method Post ...`). It is a no-op in `pwsh` 7.
  - **Done when**: probe R2's setup (`powershell.exe -NonInteractive`, stdin closed) prints `StatusCode : 204` from the README block verbatim.
- **Priority**: Minor (documentation). The link itself works; the caller's reading of the result does not.

---

## Requirement Traceability Update

The caller's constraint allows the Verifier to write only this report, so these are proposed statuses for `spec.md`. The Verifier did not change them.

| Requirement | Previous Status | Proposed Status |
| ----------- | --------------- | --------------- |
| ATSK-01 | Implementing | ❌ Needs Fix (Fix 1) |
| ATSK-02 | Implementing | ✅ Verified |
| ATSK-03 | Implementing | ✅ Verified |
| ATSK-04 | Implementing | ✅ Verified (composed evidence) |
| ATSK-05 | Implementing | ✅ Verified |
| ATSK-06 | Implementing | ✅ Verified (main tested; renderer hand-verified) |
| ATSK-07 | Implementing | ✅ Verified |
| ATSK-08 | Implementing | ✅ Verified |
| ATSK-09 | Implementing | ✅ Verified |
| ATSK-10 | Implementing | ✅ Verified |
| ATSK-11 | Implementing | ✅ Verified |
| ATSK-12 | Implementing | ✅ Verified (content); Fix 2 recommended |

---

## Summary

**Overall**: ⚠️ Not ready. There are two Minor fixes; no behaviour defect was found in the endpoint.

**Spec-anchored check**: 11/12 ACs matched the spec outcome; 1 gap (ATSK-01 name); 0 spec-precision gaps
**Sensor**: 6/7 mutations killed (M7 survived)
**Gate**: typecheck 0; lint 0 errors; 2225/2226 tests, with the single failure an environmental `git-sync` `EBUSY` outside the diff, reproduced in isolation

**What works**:
- An agent's token links only its own session.
- Every refusal (`400`/`401`/`404`/`405`/`413`) has an empty body and changes nothing.
- Titles are trimmed and blanks become `null`, and the bounds hold at 255 characters, 2^53−1 and 4096 bytes.
- The hooks path is unchanged.
- The link goes through the picker's `setTask`, so the tracker's HTSK rules apply unchanged.
- The renderer is told unasked.

**Issues found**:
- Fix 1: pin `PLAYGROUND_TASK_URL` / `PLAYGROUND_ACTIVITY_TOKEN` literally.
- Fix 2: add `-UseBasicParsing` to the README snippet.

**Next steps**: route Fix 1 and Fix 2 to the implementer, then re-verify M7 and probe R2.
