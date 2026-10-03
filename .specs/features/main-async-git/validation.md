# Main Async Git Validation

> Written by T1 (2026-10-03). The Verifier keeps `## Measurements` as it is and adds its report below it.

## Measurements

### Before: #147's baseline (MAGIT-29, MAGIT-35)

No bench run is repeated here (reconciliation of 2026-10-03, owner: unit tests only). The before figures are
#147's `--sessions 6` run, `.specs/features/perf-diagnostics/validation.md`, `## Baseline`, at commit
`dc57bf0` (the `perf-diagnostics` branch, shipped as PR #162 and merged into `main` at `fc19a3c`):

```
phase         loop p50/p99/max ms  git n   wait  peak  wt peak  status/s  wt:status  recounts  chunks   KB/s  append mean/max ms  names
spawn        16.1 /  17.6 /  31.7      6    5.8     2        1         0          0         0    7645  477.0       0.041 / 1.050      0
spawn: longest sessions:spawn round trip 107 ms
```

- `spawn`-row `loop max`: **31.7 ms** (30.4 ms in the run with an index write every 100 ms).
- `git n` 6: the six period reads, through `git()` since #154 (PERF-21).
- `names` 0 in every row of every #147 run: the bench's Ad-hoc sessions never start `claude agents --json`.
- The bench has no `sync` column: #147 counts every git process at the paced start of `git()` and shipped no
  synchronous-git counter.

### The listing half

On `fc19a3c`, a session the listing does not name gets a listing after every hook event:

- `src/main/session-manager.ts:336-340`: a hook event whose Claude id equals the session's known id calls
  `names.nudge(sessionId)` while `session.name === null`.
- `src/main/session-name-poller.ts:60-62`: `nudge` calls `#schedule()` for any watched session.
- `src/main/session-name-poller.ts:90-96`: `#schedule` arms the 1 s debounce, which runs `#run()`.
- `src/main/session-name-poller.ts:98-105`: `#run` starts `#call()` unless one is in flight; a nudge during a
  call sets `#pendingRerun`, and `settle` (`session-name-poller.ts:138-148`) schedules the rerun when the call
  ends, whatever the listing answered.

Nothing in that path remembers that the previous listing did not name the session, so while the session
emits hook events the listings run back to back: one 2 s call, a 1 s debounce, the next call.

### Stop-rule verdict (MAGIT-30)

**No spawn stall over 50 ms in the bench; the owner was told (issue #151 comment of 2026-10-03), and the
backoff proceeds.** The stall half of the issue is met on `main` by #154 (31.7 ms against 50 ms). The
listing half is back to back at the lines above, so the stop condition (no stall *and* no back-to-back
listing) does not hold.

## Validation: main-async-git — PASS

**Date**: 2026-10-03
**Spec**: `.specs/features/main-async-git/spec.md` (the Reconciliation of 2026-10-03 scopes it)
**Diff range**: `fc19a3c..HEAD` (`b9dacea` .. `7ec574b`: four plan commits, then T2 `503f3a9`, T3 `8c4c494`,
T4 `7097990`, T5 `7ec574b`; T1 is the reconciliation commit `4848bd3`)
**Verifier**: independent sub-agent (author ≠ verifier)

The production code meets every AC in scope. One mutant survives, on the reset of the misses when a listing
names the session: the code does it (`src/main/session-name-poller.ts:219`), but no test notices when it is
removed. Under the owner's rules that is a test-only gap, recorded as a follow-up below, not a fix round.

### Scope

In scope: MAGIT-05, MAGIT-17..30, MAGIT-35..37, MAGIT-43..46. Out of scope: MAGIT-01..04, 06..16 and 38..42,
delivered by upstream PR #154 (PERF-21); MAGIT-31..34, dropped by the owner.

### Task completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | `## Measurements` above; every cited line checked against `fc19a3c` |
| T2 | ✅ Done | `readGit` and the `execFileSync` import deleted; no caller anywhere in `src` |
| T3 | ✅ Done | Ships the whole gate, tick and end-of-call rerun included (recorded deviation) |
| T4 | ✅ Done | Test-only, as the deviation says |
| T5 | ✅ Done | AD-060 in `STATE.md`; SNAME-09, 10, 12 rows amended |

### Spec-anchored acceptance criteria

Test lines are in `src/main/session-name-poller.test.ts` unless named otherwise.

| ID | Spec-defined outcome | Evidence: `file:line` + assertion | Verdict |
| -- | -------------------- | --------------------------------- | ------- |
| MAGIT-05 | `time-snapshot.ts` makes no synchronous child-process call | `grep -nE "execFileSync\|spawnSync\|execSync\|child_process" src/main/time-snapshot.ts` finds nothing (exit 1); `readGit(` has no reference left in `src` | ✅ PASS |
| MAGIT-17 | Base 5000, factor 2, ceiling 300000, exported | `session-name-poller.test.ts:518-520` - `expect(NAME_BACKOFF_BASE_MS).toBe(5000)`, `expect(NAME_BACKOFF_FACTOR).toBe(2)`, `expect(NAME_BACKOFF_MAX_MS).toBe(300000)` (literals) | ✅ PASS |
| MAGIT-18 | k-th miss: due at listing end + `min(5000 × 2^(k−1), 300000)` | `session-name-poller.test.ts:523-533` (k = 1..8 against the literal table at `:505`, `[5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000]`) - `:528` `expect(early.calls).toHaveLength(k)` 1 ms before due, `:532` `expect(onTime.calls).toHaveLength(k + 1)` at due | ✅ PASS |
| MAGIT-19 | A listing with the entry marks the session named, misses 0 | `session-name-poller.test.ts:545` - `expect(t.calls).toHaveLength(5)` (a nudge right after the naming listing starts a call); `:629-649` a named session is not counted on failure | ✅ PASS, thin (mutant M1 survives) |
| MAGIT-20 | A failed listing (5 ways) is a miss for every unnamed session; named ones unchanged | `session-name-poller.test.ts:606-621` (`it.each` exit 1, timeout, not a JSON array, resolver throws, spawn throws) - `:619` `expect(t.attempts()).toBe(1)` for a nudge 1 s later; `:623-650` - `:649` `expect(t.attempts()).toBe(before + 2)` for a named session | ✅ PASS |
| MAGIT-21 | `watch` with a new Claude id: misses 0, not named, one debounced listing | `session-name-poller.test.ts:658` `expect(t.calls).toHaveLength(3)` at debounce − 1 ms, `:661` `expect(t.calls).toHaveLength(4)` at the debounce; same id keeps the misses, `:670` `toHaveLength(3)` | ✅ PASS |
| MAGIT-22 | No listing for a backing-off session's nudge; checked when the debounce elapses | `session-name-poller.test.ts:528` - `expect(early.calls).toHaveLength(k)` with the debounce elapsing 1 ms before due, k = 1..8 | ✅ PASS |
| MAGIT-23 | A debounced listing starts if an asking session has 0 misses or is due, else is dropped | `session-name-poller.test.ts:528` (dropped) and `:532` (started); `:162-170` (0 misses) - `expect(t.calls).toHaveLength(2)` | ✅ PASS |
| MAGIT-24 | A tick lists only if a watched session has 0 misses or is due | `session-name-poller.test.ts:703-714` - `:710` `toHaveLength(3)` at 59,999 ms (tick at 30 s skipped, due at 36 s), `:713` `toHaveLength(4)` on the 60 s tick | ✅ PASS |
| MAGIT-25 | A coalesced rerun is scheduled only for an eligible nudger, or a tick with an eligible watched session | `session-name-poller.test.ts:744` `expect(t.calls).toHaveLength(1)` (nudger missed); `:762` `toHaveLength(2)` (tick, only a backing-off session); `:777` `toHaveLength(3)` and `:782` `toHaveLength(3)` (tick with a named session reruns exactly once) | ✅ PASS, see observation 1 |
| MAGIT-26 | A named session keeps the 30 s cadence | `session-name-poller.test.ts:724-731` - `:726` `expect(t.calls).toHaveLength(1 + tick)` on each of 10 ticks, beside a never-named session | ✅ PASS |
| MAGIT-27 | `unwatch` drops the misses; a later `watch` starts from 0 | `session-name-poller.test.ts:698` - `expect(t.calls).toHaveLength(4)` one debounce after the re-watch | ✅ PASS |
| MAGIT-28 | Nudged every second for 10 min: listings at 1, 6, 16, 36, 76, 156, 316 s only | `session-name-poller.test.ts:800` - `expect(startedAt).toEqual([1000, 6000, 16000, 36000, 76000, 156000, 316000])` | ✅ PASS |
| MAGIT-29 | #147's `--sessions 6` baseline with its commit: `loop p99/max`, `git n`, `names`, longest round trip | `## Measurements` above: `spawn` row 17.6 / 31.7 ms, `git n` 6, `names` 0, 107 ms, commit `dc57bf0`; matches `.specs/features/perf-diagnostics/validation.md:88-96`; `dc57bf0` is an ancestor of `fc19a3c` | ✅ PASS |
| MAGIT-30 | Stop only if no stall over 50 ms and the listing is not back to back | `## Measurements`, Stop-rule verdict: the listing is back to back, so it proceeds. Cited lines checked at `fc19a3c`: `session-manager.ts:336-340` (`nudge` while `session.name === null`), `session-name-poller.ts:60-62`, `:90-96`, `:98-105`, `:138-148` - each says what the note says | ✅ PASS |
| MAGIT-35 | The notes hold MAGIT-29's figures with the commit | `## Measurements`, first block: commit `dc57bf0` and the `spawn` row | ✅ PASS |
| MAGIT-36 | `STATE.md` holds the decision, amending AD-040 | `.specs/STATE.md:68` - AD-060, "**Amends AD-040** (\"on later events for a still-unnamed session\" ...)" | ✅ PASS |
| MAGIT-37 | SNAME-09, 10, 12 rows name the decision | `.specs/features/session-name/spec.md:129`, `:130`, `:132` - "amended by AD-060" | ✅ PASS |
| MAGIT-43 | Due time equal to now counts as due | `session-name-poller.test.ts:532` - `expect(onTime.calls).toHaveLength(k + 1)` with the debounce elapsing exactly at due; killed mutant M2 | ✅ PASS |
| MAGIT-44 | A named session that loses its entry: one miss, due 5 s after that listing | `session-name-poller.test.ts:673-689` - `:687` `expect(t.calls).toHaveLength(calls)` with `[4999, 2]` and `[5000, 3]` | ✅ PASS |
| MAGIT-45 | A new Claude id while backing off resets and schedules one listing | `session-name-poller.test.ts:653-662` - `:661` `expect(t.calls).toHaveLength(4)` after three misses; killed mutant M5 | ✅ PASS |
| MAGIT-46 | No listing after `dispose` while backing off | `session-name-poller.test.ts:803-813` - `:812` `expect(t.calls).toHaveLength(1)` after 10 min of nudges | ✅ PASS, thin (see follow-up 2) |

**Status**: every in-scope AC has `file:line` evidence that asserts the spec's value; no spec-precision gap.

**Observation 1 (MAGIT-25, no defect).** The AC says the rerun is *scheduled* only for an eligible asker; the
code (`session-name-poller.ts:184`) always arms the debounce when asks are pending, and `#run`
(`session-name-poller.ts:132-143`) drops the call when the debounce elapses, as design.md's Name poller rules
say. The listings started are the same: a session that just missed is due at least 5 s after the call ends,
past the 1 s debounce, so the late check is never more permissive than the end-of-call one. The two would
differ only with a `debounceMs` of 5 s or more, which no caller sets.

### Edge cases

- [x] Due time equals now counts as due (MAGIT-43): `src/main/session-name-poller.ts:136` uses `now >= s.dueAt`.
- [x] A named session missing from a successful listing gets one miss, due 5 s later (MAGIT-44).
- [x] A new Claude id while backing off resets and lists once (MAGIT-45).
- [x] `dispose` while backing off starts nothing (MAGIT-46): `dispose` sets `#disposed`, clears `#watched`
  and both asks (`src/main/session-name-poller.ts:106-121`).

### Discrimination sensor

Five behaviour-level mutants on a file copy (`session-name-poller.ts` copied to `.orig`, mutated, run with
`npx vitest run src/main/session-name-poller.test.ts`, restored in `finally`). `git status --porcelain` was
empty before and is empty after. The author's three mutants (ungated tick, ungated rerun, live dispose) are
not repeated.

| # | Location | Mutation | Killed? | Killed by |
| - | -------- | -------- | ------- | --------- |
| M1 | `src/main/session-name-poller.ts:219` | A listing that names the session no longer resets its misses (`if (s.named) s.misses = 0` emptied) | ❌ Survived (57/57 pass) | none; follow-up 1 |
| M2 | `src/main/session-name-poller.ts:136` | Due instant excluded: `now >= s.dueAt` → `now > s.dueAt` | ✅ Killed (15 fail) | MAGIT-18/22/23/43 `it.each` k = 1..8 (`:532`), MAGIT-24 (`:713`), MAGIT-28 (`:800`), MAGIT-44 (`:687`), and others |
| M3 | `src/main/session-name-poller.ts:233` | Ceiling removed: `Math.min(…, NAME_BACKOFF_MAX_MS)` → the uncapped doubling | ✅ Killed (2 fail) | MAGIT-18 `it.each` k = 7 and k = 8 (`:528`) |
| M4 | `src/main/session-name-poller.ts:208` | A failed listing also counts a miss for named sessions (`if (!s.named)` dropped) | ✅ Killed (6 fail) | MAGIT-20 named `it.each`, all five failures (`:649`), and the coalescing edge-case test (`:233`) |
| M5 | `src/main/session-name-poller.ts:76` | A new Claude id keeps the old state (`claudeId !==` → `!this.#watched.has(id)`) | ✅ Killed (1 fail) | MAGIT-21/45 (`:661`) |

**Sensor depth**: lightweight, five mutants (the owner's cap). **Sensor**: 4/5 killed. The survivor is a
test gap on correct code, so it is a follow-up under the owner's rules, not a fix round.

### Code quality

| Check | Status |
| ----- | ------ |
| Minimum code: the state, the gate in `#run`, the miss rule in `#miss`; nothing beyond the spec | ✅ |
| Surgical changes: only the poller, its tests, `time-snapshot.ts` (deletion) and one test title | ✅ |
| No scope creep: the bench, the wiring in `index.ts` and `session-manager.ts` untouched | ✅ |
| Matches patterns: fake timers, `makePoller`, literal-pinned constants (L-009, L-019), `it.each` (L-054) | ✅ |
| Spec-anchored outcome check: the asserted values are the spec's (the 5 s..300 s table, the 7 instants) | ✅ |
| Every new test maps to a MAGIT ID named in its title | ✅ |
| Existing tests unchanged: `git diff fc19a3c..HEAD -- src/main/session-name-poller.test.ts` removes no line; `time-snapshot.test.ts` changes one test title only | ✅ |
| Documented guidelines: `.specs/LESSONS.md` lessons cited in the tests (L-009, L-019) and applied as tasks.md names them (L-042 due instant, L-054 `it.each`) | ✅ |

One harmless drift from design.md: `watch` stores `dueAt: 0` where the design says `dueAt: now`
(`src/main/session-name-poller.ts:77`). `dueAt` is read only while `misses > 0`, so the value has no effect.

### Gate check

- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors, 18 warnings (the baseline).
- `npm test`: 127 files, **2801 passed**, 0 failed, 0 skipped.
- Test count before the feature: 2769 (T3's record: 25 new tests, 2794 in all). After: 2801. Delta +32
  (T3 25, T4 7). No test was deleted or weakened.

### Follow-ups

1. **Pin the reset of the misses on a name (M1, MAGIT-19).** The MAGIT-19 test (`:536-546`) names the session
   on the call that starts exactly at its due time, so the nudge after it is eligible whether or not the
   misses were reset. A test that names the session after three misses and then lets the next listing miss
   it should see the next due time 5 s after that listing (not 40 s): a debounce elapsing at 5,000 ms starts
   a call. Test-only; the code at `src/main/session-name-poller.ts:219` is correct.
2. **MAGIT-46's test does not isolate `#disposed`** (the author recorded it under T4): `dispose` also empties
   `#watched`, so the nudges find nobody. The outcome the spec asks for is asserted; a test that calls
   `watch` after `dispose` would pin the `#disposed` guard in `watch` (`src/main/session-name-poller.ts:75`).
   Test-only, optional.

### Requirement traceability update

| Requirement | Previous status | New status |
| ----------- | --------------- | ---------- |
| MAGIT-05, 17..30, 35..37, 43..46 | Done (T1..T5) | ✅ Verified |
| MAGIT-01..04, 06..16, 38..42 | Delivered (PERF-21) | unchanged, out of this feature's evidence |
| MAGIT-31..34 | Dropped 2026-10-03 | unchanged |

### Summary

**Overall**: ✅ Ready. 22/22 in-scope ACs carry evidence that asserts the spec's outcome; the gate is green
(2801 passed); the sensor killed 4 of 5 mutants, and the survivor is a test gap on correct code, recorded as
follow-up 1.
