# Git Recount Coalescing Verification

## Validation: git-recount-coalesce - PASS ✅

Current verdict, from round 2 (fix diff `2322c2e..75448b8`, T14; see "Round 2" at the end): Fix 1
closed round 1's only gap, V6 is now killed, F2 is closed by the clarified AC 12, and all four round-2
mutants were killed. Round 1 is kept below as history.

**Round 1 verdict (history)**: ❌ FAIL. One surviving unit mutant on in-scope behaviour (V6, RCNT-11:
`forget` during a running recount). The production code is correct; the test that should pin it
became vacuous when T12 moved the spacing to the run's end. Fix is test-only (Fix 1 below).

**Date**: 2026-10-03
**Spec**: `.specs/features/git-recount-coalesce/spec.md` (AC 4 / RCNT-37 as amended 2026-10-03)
**Diff range**: `f3d68ca..6d43422` (`f3d68ca` = #147's tip, PR #162)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | RCNT-35 verdict "target not met at baseline" (#147 index run: `status/s` 4) |
| T2 | ✅ Done | timing, 8 tests |
| T3 | ✅ Done | single flight, 8 tests |
| T4 | ✅ Done | requests, 8 tests |
| T5 | ✅ Done | `listWorktrees` counter, 2 tests |
| T6 | ✅ Done | `buildTree` counter, 1 test |
| T7 | ✅ Done | watcher feeds the scheduler; AD-058; SCRF-02 note |
| T8 | ✅ Done | `tree:get` / `worktrees:status` through `request` |
| T9 | ✅ Done | Commits list on `treeRevision`; FCMT-32 note |
| T10 | ✅ Done | status bar smoke 59/59; M1, M2 seen failing |
| T11 | ✅ Done (FAIL closed by T12/T13) | A1 `status/s` 2 |
| T12 | ✅ Done | spacing from the previous end; 3 new tests, 5 rewritten |
| T13 | ✅ Done | A2 `status/s` 1 PASS; smoke 59/59 |

---

## Gate Check

- **typecheck**: `npm run typecheck`, exit 0
- **lint**: `npm run lint`, exit 0, 18 warnings, 0 errors (T1 baseline: 18; unchanged)
- **tests**: `npm test`, exit 0, **122 files, 2,609 tests passed**, 0 failed, 0 skipped (105.9 s)
- **Test count before feature** (T1, `f3d68ca`): 121 files, 2,578 tests
- **Test count after feature**: 122 files, 2,609 tests (+31: 27 scheduler, 2 listing, 1 tree, 1 watcher; 7 watcher tests rewritten for the superseded batch, named in T7)

---

## Spec-Anchored Acceptance Criteria

Test paths are under `src/main/`. "sched" = `recount-scheduler.test.ts`, "watch" = `git-state-watcher.test.ts`.

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| RCNT-01 | `index` / `HEAD` event passed to the scheduler at once, no batch | `src/main/git-state-watcher.test.ts:99` `expect(h.events).toEqual([A])` (index); `:108` same (HEAD); `:120` `toEqual([A, A, A])` (no coalescing); `:147` `toEqual([])` (other entries). Wiring: `src/main/index.ts:386` `onEvent: (worktreePath) => recounts.notify(worktreePath)`; M1 smoke (T10) | ✅ PASS |
| RCNT-02 | due 250 ms after the burst's last event | `src/main/recount-scheduler.test.ts:96` `expect(h.runs).toEqual([])` at 249, `:99` `startsOf(A)).toEqual([250])`; burst 0/100/200: `:110` none at 449, `:112` `toEqual([450])`; constant `:86` `toBe(250)` | ✅ PASS |
| RCNT-03 | due 1,000 ms after the burst's first event under steady events | `src/main/recount-scheduler.test.ts:126` none at 999, `:129` `toEqual([1000])` (quiet would be 1,150); `:87` `RECOUNT_MAX_WAIT_MS` `toBe(1000)` | ✅ PASS |
| RCNT-04 (amended) | no start < 1,000 ms after the previous recount **ended** | `src/main/recount-scheduler.test.ts:289-290` run 0 ends 600: none at 1,599, `toEqual([0, 1600])`; `:266-269` ends 500: `toEqual([0, 1500])` not 700/1,000; `:456-459` request, ends 100: `toEqual([0, 1100])`; `:329-334` end set on throw and on `null`: `[0, 1600]`; `:88` `toBe(1000)` | ✅ PASS |
| RCNT-05 | no second recount of a worktree while one runs | `src/main/recount-scheduler.test.ts:222` events every 100 ms to 2,900 during a run: `startsOf(A)).toEqual([0])`; `:473-474` request past the spacing still held: `toEqual([0])` | ✅ PASS |
| RCNT-06 | events during a run → exactly one more run after it, due by AC 2/3 (AC 4 dominates) | `src/main/recount-scheduler.test.ts:235-239` none at 3,000 / 3,999, `toEqual([0, 4000])`; `:246-249` two reports; `:266-269` trailing at 1,500 | ✅ PASS (note: the "no third run" tail `:241-244` is vacuous, see Fix 1) |
| RCNT-07 | start at the first instant AC 4 and AC 5 allow | exact-instant pairs: `src/main/recount-scheduler.test.ts:145-148` (1,249 / 1,250), `:236-239` (3,999 / 4,000), `:266-269` (1,499 / 1,500), `:480-483` (2,499 / 2,500) | ✅ PASS |
| RCNT-08 | lanes apart: one worktree's events never delay, merge with or cancel another's | `src/main/recount-scheduler.test.ts:164` `startsOf(B)).toEqual([300])`, `:166` `startsOf(A)).toEqual([1000])` (same as with no B); `:317-320` A and B both start at 0 | ✅ PASS |
| RCNT-09 | a recount that served ≥1 event and returned a count → one `worktree:status` `{ worktreePath, dirty, changes }` | `src/main/recount-scheduler.test.ts:175` `recounted).toEqual([[A, { dirty: true, changes: 1 }]])`; `:364` `toEqual([[A, { dirty: false, changes: 0 }]])`; request-only run reports nothing `:513` `toEqual([])`. Wiring: `src/main/index.ts:375` `emit(mainWindow.webContents, 'worktree:status', { worktreePath, ...count })`; M1 (T10) | ✅ PASS |
| RCNT-10 | no count or a throw → emit nothing, lane free for the next | `src/main/recount-scheduler.test.ts:356` `recounted).toEqual([])` then `:361` `toEqual([250, 1250])`, `:364` report on the next; throw: `:374`, `:379`, `:382` | ✅ PASS |
| RCNT-11 | watcher stops watching → cancel the worktree's waiting git-state recount | waiting: `src/main/recount-scheduler.test.ts:393` `runs).toEqual([])`; watcher half `src/main/git-state-watcher.test.ts:172` `dropped).toEqual([A])`, `:182` `toEqual([B])`, `:225` `toEqual([])` on `closeAll`; wiring `src/main/index.ts:387`. **Running half** (burst arriving during a run dropped by `forget`): `src/main/recount-scheduler.test.ts:411` `startsOf(A)).toEqual([250])` **cannot fail**: `:408-409` resolves then advances straight to 5,000, so the run ends at 5,000 and a wrongly kept burst would be due at 6,000, outside the window | ❌ GAP (V6 survived) |
| RCNT-12 | quit: cancel waiting, start none, answer open and later requests `null`, emit nothing | `src/main/recount-scheduler.test.ts:187` `runs.map(...)).toEqual([A])` (waiting B cancelled), `:191` (notify after stop), `:195` `recounted).toEqual([])` (in-flight run emits nothing); `:551` `waiting.value).toBeNull()`, `:555` `later.value).toBeNull()`, `:556` no run. Wiring `src/main/index.ts:467` `recounts.stop()` | ✅ PASS ⚠️ spec-precision gap (see below) |
| RCNT-13 | request due at once, no quiet period | `src/main/recount-scheduler.test.ts:430` `startsOf(A)).toEqual([100])` at the request instant, `:434` answer `{ dirty: true, changes: 3 }`; `:443` five idle worktrees all at 0. Wiring `src/main/index.ts:424` `recounts.request(worktreePath)`, `:391` `countChanges: (p) => recounts.request(p)`; M2 (T10) | ✅ PASS |
| RCNT-14 | answered by the first recount that starts after the request | `src/main/recount-scheduler.test.ts:477` first `{ changes: 1 }`, `:478` second still `'pending'`, `:487` second `toEqual({ dirty: true, changes: 2 })` | ✅ PASS |
| RCNT-15 | request + waiting burst → one recount serves both | `src/main/recount-scheduler.test.ts:497` `toEqual([100])`, `:498` answer `COUNT`, `:499` one report, `:502-503` still one run and one report at 3,000 | ✅ PASS |
| RCNT-17 | tree build counts every worktree through a request; a failed count shows clean | `src/main/worktree-manager.test.ts:135` `asked.sort()).toEqual([repo, sibling].sort())`, `:136` `[[repo, true, 7], [sibling, false, 0]]`; `:150` null → `[sibling, false, 0]`; `src/main/tree.test.ts:110` all three paths asked, `:111` `[api, true, 3] / [apiFeature, false, 0] / [web, true, 5]`. Wiring `src/main/index.ts:391` | ✅ PASS |
| RCNT-26 | a recount patch does not reload the Commits list; a `tree:get` result still does | `src/renderer/src/App.tsx:222` passes `treeRevision`; `src/renderer/src/lib/use-tree.ts:42-49` bumps only on `tree:get` results, `:89` and `:103` patch without bumping; `src/renderer/src/lib/use-files.ts:467-474` reloads on a revision change. Smoke (T9): `smoke-files-commits.mjs` check 20 PASS (30/30), FAIL with `treeRevision: 0` | ✅ PASS (follow-up F1: the "no reload on patch" half is code-read only) |
| RCNT-27 | terminal commit → new count within 2,000 ms | tasks.md T10 "1 after 569 ms", T13 "1 after 546 ms" (`counterRefresh`, SCRF-01); M1 (no emit) fails it, "3 after 4342 ms" | ✅ PASS |
| RCNT-30 | #107 counter checks pass, assertions unchanged | tasks.md T10 59/59 on `4d9eea3`, 59/59 on `f3d68ca`; T13 59/59 on `4511f3a`; M1 54/59, M2 51/59 (turn-end check "0 → 0") | ✅ PASS |
| RCNT-32 | every steady row: `status maxPerSecond` ≤ 1 and `peakConcurrent` ≤ 1 per worktree | tasks.md T13 A2 (`4511f3a`, `--sessions 6 --index-interval 100 --minutes 3`): steady 1/2/3 `status/s` 1/1/1, `wt peak` 1/1/1; targets `git status <= 1 per worktree per s 1 PASS`, `no overlapping git on one worktree 1 PASS`; A1 (start-based spacing) read 2 | ✅ PASS |
| RCNT-35 | stop if #147's baseline already meets the target | tasks.md T1: #147 `dc57bf0` steady rows `status/s` 4/4/4 → "target not met at baseline, the feature proceeds" | ✅ PASS |
| RCNT-37 (amended) | due exactly at previous end + 1,000 starts at that instant (inclusive) | `src/main/recount-scheduler.test.ts:305` A requested at 1,299 not started, `:307` `toEqual([0, 1300])`; `:309` B requested at exactly 1,300 starts at once `toEqual([0, 1300])`; `:145-148` | ✅ PASS |
| RCNT-38 | request during a run answered by the trailing run, not the running one | `src/main/recount-scheduler.test.ts:478` `'pending'` after the running one answered `changes: 1`; `:487` `changes: 2` | ✅ PASS |
| RCNT-41 | forget with a request waiting still answers it | `src/main/recount-scheduler.test.ts:532` `toEqual([0, 1100])`, `:536` `answer.value).toEqual({ dirty: false, changes: 0 })`, `:538` `recounted).toEqual([])` (burst dropped) | ✅ PASS |

**Status**: ❌ Gaps present: 23/24 in-scope ACs matched; RCNT-11's running half not discriminated
(V6); one spec-precision gap flagged (RCNT-12).

### Spec-precision gap

- **RCNT-12** says quit SHALL "answer every open and later request with no count". A request already
  taken by a recount that is running at `stop()` is answered with that recount's real count
  (`src/main/recount-scheduler.ts:179-190`: the waiters are taken at start and answered after the
  runner settles; `stop()` at `:106-118` answers only those still queued). design.md ("A recount
  already running finishes, but emits nothing") is consistent with the code, but the spec does not say
  whether a taken request is "open". Harmless at quit; the spec wording should say which.

### Payload / conjunction rule

- `onRecounted(path, count)`: path and both count fields asserted by value (`src/main/recount-scheduler.test.ts:175`, `:364`), absence asserted for request-only runs (`:513`), for `null` and throw (`:356`, `:374`) and after stop (`:195`). The main-side spread into `{ worktreePath, dirty, changes }` (`src/main/index.ts:375`) is wiring, observed by T10's M1.
- Request answers asserted by value, with the running vs trailing count told apart (`changes: 1` vs `2`, `:477`/`:487`) and `toBeNull()` after stop (`:551`, `:555`).
- Listing: path + `dirty` + `changes` asserted together per node (`src/main/worktree-manager.test.ts:136`, `:150`; `src/main/tree.test.ts:111`).

### Wiring (`src/main/index.ts` against design.md "Main wiring")

| Design row | Code | Match |
| ---------- | ---- | ----- |
| Scheduler before the watcher, `recount: recountWorktree`, `performance.now()`, `timerScheduler` | `:371-380` | ✅ |
| `onRecounted` emits `worktree:status` + `diagnostics().emitted` | `:373-377` (no emit without `mainWindow`) | ✅ |
| Watcher `onEvent` → `notify`, `onDropped` → `forget`, no `schedule` / `onSettled` | `:383-388` | ✅ |
| `tree:get` → `buildTree(registry, { countChanges: (p) => recounts.request(p) })` | `:391` | ✅ |
| `worktrees:status` → `recounts.request` | `:424` | ✅ |
| `will-quit` → `recounts.stop()` beside `closeAll()` | `:464-468` | ✅ |
| `git:run`, `git:sync-state`, `git:commits` untouched | `:425-427`, absent from the diff | ✅ |

`worktree:status` is emitted only at `src/main/index.ts:375` (grep of `src/main`); `worktreeStatus` is called only inside `recountWorktree` (`:170`) and the listing's default.

---

## Edge Cases

- [x] Due exactly at previous end + 1,000 (RCNT-37): `src/main/recount-scheduler.test.ts:309`
- [x] Request during a running recount answered by the trailing one (RCNT-38): `:478`, `:487`
- [ ] ~~A read that throws (RCNT-39)~~: dropped (owner 2026-10-03)
- [ ] ~~Described worktree changes mid-event (RCNT-40)~~: delivered by #154 (AD-052)
- [x] Forget with a request waiting (RCNT-41): `:536`

---

## Discrimination Sensor

Eight behaviour-level unit mutants (the owner's budget), each in a temporary detached `git worktree`
of `HEAD` outside the repository with its own `npm ci --ignore-scripts`; each written by a script that
asserted the anchor matched once, ran the covering test file, and restored the file. Chosen to differ
from the mutants the author already recorded in T2..T12.

| # | Where | Mutation | Killed? | By |
| - | ----- | -------- | ------- | -- |
| V1 | `src/main/recount-scheduler.ts:143` | quiet period from the burst's **first** event, not its last | ✅ Killed (3 fail) | sched `:110` (RCNT-02), `:126` (RCNT-03), `:166` (RCNT-08) |
| V2 | `src/main/recount-scheduler.ts:140-146` | a pending burst outranks a waiting request (request waits the quiet period) | ✅ Killed (1 fail) | sched `:497` (RCNT-15) |
| V3 | `src/main/recount-scheduler.ts:149` | spacing combined with `Math.min` instead of `Math.max` | ✅ Killed (12 fail) | sched `:146`, `:235`, `:267`, `:305`, ... (RCNT-04/37) |
| V4 | `src/main/recount-scheduler.ts:179-180` | waiters taken **after** the runner settles (a request made during a run is answered by that run) | ✅ Killed (1 fail) | sched `:478` (RCNT-14/38) |
| V5 | `src/main/recount-scheduler.ts:191` | `onRecounted` without the `count !== null` guard | ✅ Killed (2 fail) | sched `:356`, `:374` (RCNT-10) |
| V6 | `src/main/recount-scheduler.ts:95-100` | `forget` returns early on a running lane, before dropping the burst | ❌ **Survived** (27/27 pass) | none: sched `:397-412` is vacuous (Fix 1) |
| V7 | `src/main/worktree-manager.ts:50` | a `null` count reads `dirty: true` | ✅ Killed (1 fail) | `src/main/worktree-manager.test.ts:150` (RCNT-17) |
| V8 | `src/main/git-state-watcher.ts:4` | watcher reports `index` only, not `HEAD` | ✅ Killed (2 fail) | watch `:108`, `:120` (RCNT-01) |

**Sensor depth**: lightweight+ (8, owner cap). **Killed**: 7/8; **survived**: 1 (V6). No smoke mutants
run: every manual AC has recorded falsification (T9 `treeRevision: 0`; T10 M1, M2).

**V6 diagnosis** (scratch only): with the test changed to settle the run at its resolve instant
(`await h.advanceTo(500)` after `h.runs[0].resolve(COUNT)` at `:408`), the real code passes and V6
fails, "expected [ 250, 1500 ] to deeply equal [ 250 ]". Cause: T12's harness note (settle at the
resolve instant, or the end lands at the next target) was applied to the rewritten tests but not to
this one; before T12 the spacing counted from the start (250 → 1,250, inside the window), so the
author's T3 mutant "forget keeping the burst" was killed then and would survive now.

**Isolation**: real tree `git status --porcelain` empty before the sensor and empty after (equal);
scratch worktree removed and pruned.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ one new module (196 lines), small edits elsewhere |
| Surgical changes | ✅ `git:run` / `git:sync-state` / `git:commits` untouched; `statusOf` kept for `removeWorktree` |
| No scope creep | ✅ no pool, no read lane, no bench option (all dropped in the reconciliation) |
| Matches patterns | ✅ injected `Scheduler`, hand-rolled fakes (TESTING.md pattern 3), no `vi.mock` |
| Spec-anchored outcome check | ⚠️ RCNT-11 running half vacuous; RCNT-12 wording |
| Per-layer coverage | ✅ scheduler 1:1 to RCNT-02..15, 37, 38, 41; wiring read; smoke and bench recorded |
| Every test maps to a requirement | ✅ each test name carries its RCNT / SCRF id (the five-worktree test maps to the dropped pool, as "no pool of its own") |
| Documented guidelines | `.specs/codebase/TESTING.md`, `vitest.config.ts` |

Observations (no AC, not gaps): a lane `forget` hits while running stays in the map after its run
(`src/main/recount-scheduler.ts:100`; design.md "the lane map" expects idle lanes deleted); a lane
deleted by `forget` loses its `lastEndAt`, so a worktree dropped and re-added within a second is not
spaced. Both are bounded by the number of tree worktrees.

---

## Privacy and records

- `git diff f3d68ca..HEAD | grep -niE "users\\|users/|playground-wt|appdata|[a-z]:[\\/]"`: three hits,
  all fictitious fixture paths (`C:\\work\\repo`, `C:\\work\\repo-feature`, `` `C:\\work\\repo-${i}` ``
  in the scheduler test, the same placeholder the watcher test already used). No user name, company or
  work-item data.
- `.specs/STATE.md:65` AD-058 matches design.md's AD-058 block (end-based spacing, PERF-22, SCRF-02 and
  FCMT-32 revised). `.specs/features/status-changes-refresh/spec.md:36` and `:60` (SCRF-02) and
  `.specs/features/files-commits/spec.md:166` (FCMT-32) name AD-058.
- Out-of-scope IDs are marked in spec.md's traceability: RCNT-16, 18, 39 (dropped, owner / PERF-22);
  19..25, 40 (delivered by #154); 28, 29, 31, 33, 34, 36 (dropped 2026-10-03).

---

## Fix Plans

### Fix 1: forget-during-run test cannot fail (RCNT-11)

- **Root cause**: `src/main/recount-scheduler.test.ts:408-409` resolves the run and advances straight
  to 5,000, so the run's end lands at 5,000 and any trailing run would be due at 6,000, outside the
  window. Same shape at `:242-244` (RCNT-06's "no third run": end lands at 8,000) and `:343-346` ("runs
  nothing after a recount that saw no event": end lands at 5,000); those two are covered elsewhere, but
  their own assertions are vacuous.
- **Fix task**: test-only. After each of those `resolve(...)` calls add `await h.advanceTo(<the resolve
  instant>)` (T12's harness rule), so the "nothing more" window covers end + 1,000.
- **Verify**: V6 (`if (lane.running) return` before the burst is dropped in `forget`) fails the
  forget-during-run test; the full gate stays 2,609 / 18 warnings.
- **Priority**: Major (blocks PASS; production code unaffected)

## Follow-ups

- **F1 (smoke, RCNT-26)**: no smoke check shows that a recount patch leaves the Commits list alone;
  check 20 would also pass on the old `treeRevision: tree`. The production code is right by reading
  (`use-tree.ts:89`, `:103` do not bump). Not a FAIL under the owner's rules.
- **F2 (spec wording, RCNT-12)**: say whether a request taken by a recount running at quit is answered
  with that recount's count (today) or `null`.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| RCNT-11 | Done | ❌ Needs Fix (test, Fix 1) |
| RCNT-01..10, 12..15, 17, 26, 27, 30, 32, 35, 37, 38, 41 | Done | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready (one test fix)

**Spec-anchored check**: 23/24 in-scope ACs matched; 1 gap (RCNT-11 running half); 1 spec-precision gap (RCNT-12)
**Sensor**: 7/8 unit mutants killed; V6 survived
**Gate**: 2,609 passed, 0 failed; typecheck 0; lint 0 with 18 warnings

**What works**: the scheduler's timing, single flight, trailing run, requests, failure handling and
quit; the watcher's reporting and drops; the listing's null-as-clean; the wiring; the bench target
(4 → 1 `git status` a second per worktree) and the #107 freshness checks.

**Issues found**: Fix 1 (settle the run at its resolve instant in three tests).

**Next steps**: route Fix 1 to an implementer, then re-verify (round 2 of 3).

---

## Round 2 (fix diff 2322c2e..75448b8)

**Verdict**: ✅ PASS (round 2 of 3)
**Date**: 2026-10-03
**Scope**: the fix diff only (owner rule for later rounds): `src/main/recount-scheduler.test.ts`
(+23, -0), `.specs/features/git-recount-coalesce/spec.md` (AC 12, traceability rows),
`.specs/features/git-recount-coalesce/tasks.md` (T14). No production file changed.
**Verifier**: independent sub-agent (author ≠ verifier), not the author of T14

### Gate Check (at `75448b8`)

- **typecheck**: `npm run typecheck`, exit 0
- **lint**: `npm run lint`, exit 0, 18 warnings, 0 errors (unchanged)
- **scheduler**: `npx vitest run src/main/recount-scheduler.test.ts`, 1 file, **28 passed** (27 + 1 new)
- **tests**: `npm test`, exit 0, **122 files, 2,610 tests passed**, 0 failed (2,609 + 1; 140.7 s)

### Fix diff check

| Item | Spec-defined outcome | `file:line` + assertion | Result |
| ---- | -------------------- | ----------------------- | ------ |
| RCNT-11 running half (Fix 1, V6) | forget during a run cancels the burst that arrived in it: no trailing run | `src/main/recount-scheduler.test.ts:412` settles the run at its resolve instant (500), so a wrong trailing run would be due at 1,500, inside the window; `:415` `startsOf(A)).toEqual([250])` | ✅ PASS |
| RCNT-06 "no third run" | events during a run give exactly one more run, then nothing | `src/main/recount-scheduler.test.ts:243` settles the trailing run at 4,500 (a third run would be due at 5,500, inside the 8,000 window); `:245` `startsOf(A)).toEqual([0, 4000])`; `:247-250` two reports | ✅ PASS |
| RCNT-06 "nothing after a run that saw no event" | a run with no event during it books nothing | `src/main/recount-scheduler.test.ts:345` settles at 500 (a wrong run would be due at 1,500); `:348` `startsOf(A)).toEqual([0])` | ✅ PASS |
| RCNT-12 (clarified, F2) | quit answers open and later requests `null` and emits nothing; a request a running recount already took gets that recount's result | new test `src/main/recount-scheduler.test.ts:569` `startsOf(A)).toEqual([100])` (the run took the request), `:573` `taken.value).toBe('pending')` after `stop()`, `:577` `taken.value).toEqual({ dirty: true, changes: 7 })` when the run settles, `:579` `recounted).toEqual([])` (the run served an event, nothing emitted). Spec: `.specs/features/git-recount-coalesce/spec.md:110`. Code: `src/main/recount-scheduler.ts:107-118` (`stop()` answers only queued waiters), `:179-191` (taken waiters answered with the run's count; `onRecounted` guarded by `!this.stopped`). Round 1's null-answer checks unchanged (`:555` `waiting.value).toBeNull()`, `:559` `later.value).toBeNull()`, `:560` no run) | ✅ PASS |

**Not weakened**: the test diff is additions only (23 lines added, 0 removed): three
`await h.advanceTo(<resolve instant>)` settles (`:243`, `:345`, `:412`), one comment and the new test.
Every assertion of the three rewritten tests is byte-identical to `2322c2e`, and its expected value is
the one the spec's outcome gives (AC 6: exactly one trailing run; AC 11: none after forget).

**spec.md / tasks.md**: AC 12's added sentence agrees with the code and with design.md's `stop()`
(design.md:179-180, "resolves every waiter with `null`. A recount already running finishes, but emits
nothing"), which implies but does not say outright that a taken request gets the running count; the AC
now says it. Traceability rows RCNT-06, 11, 12 add T14. T14's record (V6 and S1 killed, 2,610 tests,
18 warnings) matches what this round measured.

### Discrimination Sensor (round 2)

Four unit mutants (owner cap), in a temporary detached `git worktree` of `75448b8` in a scratch folder
outside the repository with its own `npm ci --ignore-scripts`. A script asserted each anchor matched
once, ran the scheduler test file, restored the file and checked the restore. Each mutant was also run
against the round-1 test file (`2322c2e`) to show what the fix changed.

| # | Where | Mutation | New tests (`75448b8`) | Round-1 tests (`2322c2e`) |
| - | ----- | -------- | --------------------- | ------------------------- |
| R2-a (V6) | `src/main/recount-scheduler.ts:95` | `forget` returns early on a running lane (`if (lane.running) return` after `if (!lane) return`), keeping the burst | ✅ Killed (1 fail): `:415` "expected [ 250, 1500 ] to deeply equal [ 250 ]" | survived (27/27) |
| R2-b | `src/main/recount-scheduler.ts:177-178` | only a lane's first run clears the burst, so a trailing run keeps it and books a third run | ✅ Killed (1 fail): `:245` "expected [ 0, 4000, 5500 ] to deeply equal [ 0, 4000 ]" | survived (27/27) |
| R2-c | `src/main/recount-scheduler.ts:190` | a run settling after `stop` answers its waiters `null` | ✅ Killed (1 fail): `:577` "expected null to deeply equal { dirty: true, changes: 7 }" | survived (27/27) |
| R2-d | `src/main/recount-scheduler.ts:192` | a run that served events always books one more run, with no event during it | ✅ Killed (7 fail): `:115`, `:132`, `:164`, `:245`, `:348`, `:415`, `:506` | killed (4 fail; none of the three rewritten tests) |

**Killed**: 4/4. R2-a, R2-b and R2-c each survive the round-1 tests and are killed by exactly the test
T14 changed or added; R2-d adds the three settled tests to its killers. No smoke mutants (out of
scope for this round).

**Isolation**: real tree `git status --porcelain` empty before and after (equal); the scratch
worktree was removed and pruned (`git worktree list` no longer shows it).

### Follow-ups still open

- **F1 (smoke, RCNT-26)**: still open, unchanged: no smoke check discriminates "a recount patch does not
  reload the Commits list". Not a FAIL under the owner's rules.
- **F2 (spec wording, RCNT-12)**: ✅ closed by `.specs/features/git-recount-coalesce/spec.md:110` and
  pinned by the new test (`src/main/recount-scheduler.test.ts:577`, R2-c).
- Round 1's code observations (a lane forgotten while running stays in the map; a re-added worktree
  within a second is not spaced) stay observations, not gaps.

### Requirement Traceability Update (round 2)

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| RCNT-11 | ❌ Needs Fix (test, Fix 1) | ✅ Verified |
| RCNT-06, RCNT-12 | ✅ Verified | ✅ Verified (vacuous tails fixed; AC 12 clarified) |

**Overall**: ✅ Ready. 24/24 in-scope ACs matched; gate 2,610 passed; sensor 4/4 this round (11/12
across both rounds, the one survivor V6 now killed).
