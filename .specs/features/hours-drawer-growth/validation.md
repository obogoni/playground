# Hours Drawer Growth Validation

## Validation: hours-drawer-growth — PASS

**Date**: 2026-09-25
**Spec**: `.specs/features/hours-drawer-growth/spec.md`
**Diff range**: `1a89301..bcc8e3f` (5 commits: `6a2211e`, `2762e4d`, `32e35c7`, `8d63047`, `bcc8e3f`)
**Verifier**: independent sub-agent (author ≠ verifier). Coverage was re-derived from the spec and the diff, and every run below is the Verifier's own. The author's results in `tasks.md` were not used as evidence.

Changed code: `scripts/smoke-hours-calendar.mjs` (`--seed` mode, refusal, clean-up, step 10) and `src/renderer/src/components/HoursView.css` (`flex: none` on `.hours-day`). The diff touches nothing in `src/main` or `src/preload`.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | The switch is honoured. It is consistent with the code: `src` has no `PLAYGROUND_USER_DATA` and no `setPath('userData'`, and the Verifier's own runs with `--user-data-dir` read only the seeded log (probe `{"sessions":0,"periods":14,"open":0,"seed":14}`, and `periods:0` on an empty directory) |
| T2 | ⏭️ Skipped | T1: switch honoured |
| T3 | ⏭️ Skipped | T1: switch honoured |
| T4 | ✅ Done | Re-run by the Verifier (AC 5 and AC 6 below) |
| T5 | ⚠️ Done with one recorded substitute | The refusal against the owner's real data was not run, because launching on real data is forbidden. An empty unseeded `--user-data-dir` stood in for it. The judgement is under Edge Cases: it takes the same code path |
| T6 | ✅ Done | The red state was reproduced independently as mutant M1 |
| T7 | ✅ Done | 34/34 on HEAD |

---

## Verifier runs (evidence source)

| Run | Where | Outcome |
| --- | ----- | ------- |
| R1 `--seed` (HEAD) | `D:\pg-hours`, port 9222 closed | exit 0. `Seeded 14 periods on 20/09/2026 (dom) in …\playground-smoke-hours-1790375316740`. Read back from the file: 14 lines, ids `hours-smoke-seed-01..14`, `taskId` 9101..9114 (14 distinct), `Sun 20/09 08:00–08:20 Fix login redirect` … `Sun 20/09 12:20–12:40 Fix the timezone offset`, repo `acme-widgets` |
| R2 full smoke (HEAD) | dev app from `D:\pg-hours` on the R1 directory | **34/34**, exit 0, then `App closed; deleted …\playground-smoke-hours-1790375316740 and …\playground-smoke-hours.last`. Nothing `playground-smoke*` left in `%TEMP%`, port 9222 closed, no `electron.exe` left, the dev process exited 0 |
| R3 refusal, pointer absent (HEAD script) | app on a seeded directory, pointer moved aside | exit 1, `not running on the seeded data — no %TEMP%\playground-smoke-hours.last; run with --seed first`. Probe before and after: `{"sessions":0,"periods":14,"open":0,"seed":14}` |
| R4 refusal, seed missing (HEAD script) | app on an **empty** `--user-data-dir`, pointer present | exit 1, `not running on the seeded data — 14 seeded periods missing; run with --seed first`. Probe before and after: `{"sessions":0,"periods":0,"open":0,"seed":0}` |
| R5 `--seed` clash (directory name pinned to `playground-smoke-hours-4242` in the scratch) | scratch worktree | first run exit 0; second run exit 1 with `Seed directory already exists, nothing written: …\playground-smoke-hours-4242`. `time-log.jsonl` and the pointer kept the same SHA-256 and mtime |

---

## Spec-Anchored Acceptance Criteria

### P1: A tall day stays inside its card

| Criterion | Spec-defined outcome | `file:line` + assertion | Observed (Verifier run) | Result |
| --------- | -------------------- | ----------------------- | ----------------------- | ------ |
| HDRW-01: a tall day's card extends to its last group | `card.bottom >= lastGroup.bottom` and `card.scrollHeight <= card.clientHeight + 1` | `scripts/smoke-hours-calendar.mjs:678`: `tall.cardBottom >= tall.lastBottom && tall.cardScroll <= tall.cardClient + 1`, guarded by the precondition at `:673`: `tall?.groups === 14 && tall.lastBottom > tall.drawerBottom` | R2: `30. PASS precondition … {"groups":14,…,"drawerClient":340,"drawerScroll":925,…,"lastBottom":1170}` and `31. PASS … card bottom 1182.7, last group 1170.0, card 923/923` | ✅ PASS |
| HDRW-02: the drawer scrolls, and at its end the card's bottom border sits at the visible bottom edge | `drawer.scrollHeight > drawer.clientHeight` and, scrolled to the end, `abs(card.bottom - drawer.bottom) <= 1` | `scripts/smoke-hours-calendar.mjs:690-692`: `tall.drawerScroll > tall.drawerClient && Math.abs(scrolled.cardBottom - scrolled.drawerBottom) <= 1`, after `d.scrollTop = d.scrollHeight` (`:684`), with `drawerBottom: dr.top + d.clientHeight` (`:654`) | R2: `32. PASS … drawer 925/340, card bottom 598.0 vs drawer bottom 598.0` | ✅ PASS |
| HDRW-03: a short day's card fills the drawer | `card.height >= drawer.clientHeight - 1` | `scripts/smoke-hours-calendar.mjs:710-712`: `short.lastBottom < short.drawerBottom && short.cardHeight >= short.drawerClient - 1` | R2: `34. PASS … card 432.0 vs drawer 432, last group 324.0` | ✅ PASS |
| HDRW-04: the page does not scroll with a tall day open at 1100 × 640 | `.hours-body` `scrollHeight <= clientHeight + 1` | `scripts/smoke-hours-calendar.mjs:699`: `!tallFit.scrolls && tallFit.gridBottom <= tallFit.height`, where `:169` gives `scrolls: b.scrollHeight > b.clientHeight + 1` on `.hours-body`, at the 1100 × 640 override (`:656-661`) | R2: `33. PASS … {"scrolls":false,"gridBottom":598,"gridWidth":664,"height":640}` | ✅ PASS |

### P1: The Hours smoke runs on seeded, throwaway data

| Criterion | Spec-defined outcome | `file:line` + assertion / mechanism | Observed (Verifier run) | Result |
| --------- | -------------------- | ----------------------------------- | ----------------------- | ------ |
| HDRW-05: `--seed` creates a directory, writes 14 periods on last week's Sunday, records the pointer, prints the command, exits 0 without contacting an app | new directory under `%TEMP%`; exactly 14 periods on the previous week's Sunday; pointer at `%TEMP%\playground-smoke-hours.last`; launch command printed; exit 0; no app contact | `scripts/smoke-hours-calendar.mjs:216` `join(TEMP, \`playground-smoke-hours-${Date.now()}\`)`; `:221` `weekDay(-1, 6)` (Monday-based offset 6 of week −1 = previous Sunday, `:143-148`); `:222-239` one line per `SEED_TITLES` entry (14), `taskId: 9101 + i`, 20 min from 08:00; `:242` `writeFileSync(POINTER, dir)`; `:244` prints the launch; `:245` `process.exit(0)`, before the first CDP call at `:248` | R1: exit 0 with port 9222 closed; 14 lines on `20/09/2026 (dom)` (today is Fri 25/09, so the previous week's Sunday); 08:00–12:40 local; pointer written; launch line printed. The app accepted all 14 (R2 probe `seed:14`) | ✅ PASS |
| HDRW-06: a clash with an existing directory stops non-zero and writes nothing | non-zero exit, nothing written | `scripts/smoke-hours-calendar.mjs:217-220`: `if (existsSync(dir)) { console.error(…); process.exit(1) }`, before any write (`mkdirSync` `:240`, log `:241`, pointer `:242`) | R5: second run exit 1, `Seed directory already exists, nothing written`; log and pointer hash and mtime unchanged | ✅ PASS |
| HDRW-07: before any other check, every seeded id is confirmed in `time:snapshot` | all 14 ids present, checked first | `scripts/smoke-hours-calendar.mjs:260-262`: `snapshotIds = new Set((await invoke('time:snapshot')).periods.map(p => p.id))`, `missingSeed = SEED_TITLES.map((_, i) => seedId(i)).filter(id => !snapshotIds.has(id))`. It runs before the first `sessions:spawn` (`:278`) and the first `check` (`:294`) | R2 passed the gate with 14/14; R4 and M3 were refused on 14 and 1 missing | ✅ PASS |
| HDRW-08: a missing id or pointer exits non-zero with `not running on the seeded data`, spawning nothing and writing nothing | exit ≠ 0; that exact message; no spawn, no IPC write | `scripts/smoke-hours-calendar.mjs:262` `if (!seededDir \|\| missingSeed.length > 0)`; `:264` message beginning `not running on the seeded data`; `:266-267` `ws.close(); process.exit(1)`. Only reads come before it: `waitFor` at `:256` and `time:snapshot` at `:260` | R3 (pointer absent) and R4 (ids absent): exit 1 with the message; sessions and periods identical before and after. M3 (13 seeded): `1 seeded periods missing`, exit 1, probe unchanged | ✅ PASS |
| HDRW-09: when every check passes, the smoke closes the app and deletes the directory and the pointer | app closed; directory and pointer gone | `scripts/smoke-hours-calendar.mjs:750-754` `Browser.close`; `:755-762` waits for the debug port to drop; `:763` `rmSync(seededDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 })`; `:764` `rmSync(POINTER, …)`. Safety guard at `:743-748`: basename `^playground-smoke-hours-\d+$` and under `TEMP` | R2: `App closed; deleted …`; `%TEMP%` has no `playground-smoke*`; port closed; no electron left | ✅ PASS (see observation O1) |
| HDRW-10: a failed check leaves the app, the directory and the pointer, and prints the directory | all three remain; directory printed | `scripts/smoke-hours-calendar.mjs:737-740`: `if (failed.length > 0) { console.log(\`Seeded data left in place for inspection: ${seededDir}\`); process.exit(1) }`, before the close and delete code | M1 run: `32/34 checks passed`, `Seeded data left in place for inspection: …\playground-smoke-hours-1790375424133`; port 9222 still listening; directory and pointer still in `%TEMP%`; probe after `{"sessions":0,"periods":14,…}` (the smoke's own sessions and periods removed, the seed intact) | ✅ PASS (see observation O2) |
| HDRW-11: steps 1–9 pass unchanged on the seeded directory | the checks of steps 1–9 are unedited and pass | `git diff 1a89301..bcc8e3f` adds nothing inside steps 1–9 (`scripts/smoke-hours-calendar.mjs:290-645`). Its hunks are the header comment, the imports, the seed block, the refusal, step 10 and the exit | R2: checks 1–29 all PASS, e.g. `2. PASS a weekend column appears only for a weekend day with time — expected , shown ` (the seeded Sunday does not leak into the current week) and `26. PASS … {"title":"26/08/2026 (qua)",…}` (step 9's week −4 stays empty) | ✅ PASS |

### P2: A dev-only userData override

| Criterion | Result |
| --------- | ------ |
| HDRW-12 | N/A. T1 measured that `--user-data-dir` is honoured, so no override was built. Consistent: `src` has no `PLAYGROUND_USER_DATA` or `setPath('userData'`, the diff has no `src/main` change, and R2/R4 show the app reading only the directory passed to it |
| HDRW-13 | N/A (same reason) |
| HDRW-14 | N/A (same reason) |

**Status**: ✅ All 11 applicable ACs covered with spec-exact assertions or a direct observation. No spec-precision gap is open. AC 2's precision gap was found and closed by the author at T6 (border at the visible bottom edge, `<= 1`), and step 10 asserts that exact form.

---

## Discrimination Sensor

Scratch: `git worktree add --detach D:/pg-verify HEAD`, with its own `npm ci --ignore-scripts` and `node node_modules/electron/install.js`. The dev app was launched from the scratch so it served the mutated source. Real-worktree porcelain was empty before and after.

| Mutation | File:line | Description | Observed | Killed? |
| -------- | --------- | ----------- | -------- | ------- |
| M1 | `src/renderer/src/components/HoursView.css:150` | Revert the fix: drop `flex: none` from `.hours-day` | `31. FAIL … card bottom 598.0, last group 1170.0, card 911/339`; `32. FAIL … drawer 912/340, card bottom 26.0 vs drawer bottom 598.0`; 33 and 34 PASS; `32/34`, exit 1 | ✅ Killed |
| M2 | `scripts/smoke-hours-calendar.mjs:262` | Weaken the refusal to the pointer only: `if (!seededDir \|\| missingSeed.length > 0)` → `if (!seededDir)`; run on an empty `--user-data-dir` with the pointer present | No refusal message. The smoke spawned both sessions and ran checks 1–29, writing through IPC (`time:adjust`, `time:delete`, `config:patch`), then crashed at `:648` with `TypeError: Cannot read properties of undefined (reading 'start')`. HEAD on the same app (R4) refuses with exit 1 and nothing spawned | ✅ Killed (by the AC 8 procedure) |
| M3 | `scripts/smoke-hours-calendar.mjs:222` | `--seed` writes fewer periods: `SEED_TITLES.map` → `SEED_TITLES.slice(0, 13).map` | `--seed` wrote 13 lines; the run exited 1 with `not running on the seeded data — 1 seeded periods missing`; probe `{"sessions":0,"periods":13,…}` before and after | ✅ Killed |
| M4 | `scripts/smoke-hours-calendar.mjs:763` | Break clean-up on a pass: remove the `rmSync(seededDir, …)` call | `34/34 checks passed`, exit 0, and still prints `App closed; deleted …\playground-smoke-hours-1790375552031 and …` — but the directory **remained** in `%TEMP%` (pointer gone, app closed) | ✅ Killed (by the AC 9 procedure: `%TEMP%` inspected after the run). The smoke's own exit code and message do not detect it (observation O1) |

**Sensor depth**: lightweight (4 behaviour-level mutants: the fix, the guard, the seed, the clean-up)
**Result**: 4/4 killed — PASS ✅

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code: one CSS declaration; the smoke gains exactly the seed, refusal, step and clean-up the spec asks for | ✅ |
| Surgical changes: only the two files, plus spec and tasks docs; steps 1–9 untouched | ✅ |
| No scope creep: no sticky header, no HCAL-11 automation, no real-data seeding, no new script (all out of scope in the spec) | ✅ |
| Matches patterns: `flex: none` mirrors `.hours-drawer` and `.hours-drawer-close`; step 10 reuses `nav`, `clickHead`, `fits`, `headLabels` and the step 7 viewport override; lint is clean on the script (`npx eslint scripts/smoke-hours-calendar.mjs` exit 0) | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ✅ HDRW-01..04 expressions are the spec's formulas, with the spec's tolerances |
| Per-layer Coverage Expectation met: renderer CSS by CDP geometry, each seen to fail on a broken build (M1, plus the author's `min-height` removal for HDRW-03); smoke behaviours HDRW-05..11 each exercised once | ✅ |
| Every test maps to a spec requirement: checks 30–34 map to the HDRW-01..04 precondition and HDRW-01..04; no unclaimed check | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md` (renderer by CDP smoke, `scripts/smoke-*.mjs` manual-only, one app on port 9222) | ✅ |
| Fictitious data only (public repo): titles, `acme-widgets`, `taskId` 9101..9114 | ✅ |

---

## Edge Cases

- [x] **Early Monday**: `weekDay(-1, 6)` = today − `sinceMonday` − 7 + 6. On a Monday that is yesterday, and on a Sunday it is a week ago. Either way it is a past, complete day of the previous week (`scripts/smoke-hours-calendar.mjs:141-148,221`). Checked by reading the code; the run was on a Friday.
- [x] **Installed app unaffected**: holds by construction. Only the dev launch receives `--user-data-dir`, and no code reads another variable (HDRW-12..14 N/A). Not exercised, as the spec says it is not a new behaviour.
- [x] **Smoke killed mid-run**: the directory and pointer stay, because clean-up is only reached after a full pass (`:742-765`). Observed with M2's crash, which left both. The next `--seed` makes a `Date.now()`-named directory and overwrites the pointer (`:216,:242`).
- [x] **Substitute for the real-data refusal (recorded gap of T5)**: it takes the same code path. Everything before the guard only reads: the page target, `Runtime/Page.enable`, `waitFor` on `window.api`, the pointer file and `time:snapshot` (`:248-260`). The guard (`:262`) depends only on whether the pointer exists and whether the 14 fixed ids are in the snapshot. On the owner's real data the ids are absent, whether or not a pointer exists. That is either R4's branch (`14 seeded periods missing`) or R3's (`no …last`), and the Verifier ran both. The extra periods in the real log only enlarge a set that is filtered by id, so they cannot change the outcome. The one real-data case that would pass the guard is a real log containing all 14 `hours-smoke-seed-*` ids, which only a seeding of real data could produce, and that is out of scope.

**Observations (non-blocking, no AC violated):**

- **O1**: the pass branch prints `App closed; deleted <dir> and <pointer>` unconditionally (`scripts/smoke-hours-calendar.mjs:765`), without checking that the directory is gone. A realistic failure still surfaces, because `rmSync` with `force` only swallows ENOENT and throws after its retries. A regression that drops or bypasses the delete would still report success (M4). A one-line `existsSync(seededDir)` check before the message would make the run self-verifying.
- **O2**: when a run aborts with an exception rather than a failed check (a `waitFor` timeout, or M2's TypeError), the directory and pointer are left, as HDRW-10 wants. The `Seeded data left in place for inspection` line is not printed, because the throw bypasses `:737-740`. HDRW-10 says "any check fails", so this is outside its letter.
- **O3**: the refusal proves the app runs on *a* seeded directory, not on the one the pointer names. The seed ids are the same in every seed. If the owner seeds twice and launches on the older directory, a pass deletes the newer directory and leaves the older one. The damage is limited to `%TEMP%`: the guard at `:743-748` refuses to delete anything not named `playground-smoke-hours-<n>` under `TEMP`.

---

## Gate Check

- **Gate command** (in `D:\pg-hours`, HEAD `bcc8e3f`): `npm run typecheck && npm run lint && npm test` then `npx electron-vite build`
- **typecheck**: exit 0
- **lint**: exit 0, **0 errors / 18 warnings** (baseline 18; none in the changed files)
- **tests**: **1691 passed / 0 failed / 0 skipped**, 91 files
- **build**: exit 0 (`✓ built in 4.99s`)
- **Test count before feature**: 1691 (recorded at T1 on `1a89301`)
- **Test count after feature**: 1691
- **Delta**: +0. This is expected: no unit-tested layer changed, and T2 (the only task with unit tests) was skipped
- **Skipped tests**: none
- **Failures**: none

**Isolation**: `git -C D:/pg-hours status --porcelain` was empty before the sensor and after all runs. `%APPDATA%\playground` `time-log.jsonl`, `config.json` and `time-open.json` passed `sha256sum -c` against the pre-run hashes before the first app run and after the last. Scratch worktree removed. Every temp directory the Verifier created (`playground-smoke-hours-*`, `playground-verify-empty-m2`) and the pointer were deleted. No `electron.exe` from either worktree left running, and port 9222 is free.

---

## Fix Plans

None required. O1 to O3 are optional hardening of the smoke, for the owner to take or leave:

- **O1 (Minor)**: in `scripts/smoke-hours-calendar.mjs`, after the two `rmSync` calls, exit 1 with a message when `existsSync(seededDir) || existsSync(POINTER)`. Verify with M4 again: it should now exit 1.
- **O2 (Cosmetic)**: wrap the run so a thrown error also prints `Seeded data left in place for inspection: <dir>` before re-throwing.
- **O3 (Cosmetic)**: accept only when the directory named by the pointer holds the app's log. For example, compare the pointer's `time-log.jsonl` ids with the snapshot, or put the directory name in the seed's `sessionId`.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HDRW-01 | Implemented | ✅ Verified |
| HDRW-02 | Implemented | ✅ Verified |
| HDRW-03 | Implemented | ✅ Verified |
| HDRW-04 | Implemented | ✅ Verified |
| HDRW-05 | Implemented | ✅ Verified |
| HDRW-06 | Implemented | ✅ Verified |
| HDRW-07 | Implemented | ✅ Verified |
| HDRW-08 | Implemented | ✅ Verified (real-data run substituted by an equivalent-path run, see Edge Cases) |
| HDRW-09 | Implemented | ✅ Verified |
| HDRW-10 | Implemented | ✅ Verified |
| HDRW-11 | Implemented | ✅ Verified |
| HDRW-12 | N/A — T1: switch honoured | N/A (confirmed: no override code, switch observed honoured) |
| HDRW-13 | N/A — T1: switch honoured | N/A (confirmed) |
| HDRW-14 | N/A — T1: switch honoured | N/A (confirmed) |

---

## Proposed lessons

No grounded failure: no surviving mutant, no open spec-precision gap, no failed AC. **No lesson is required.** One optional lesson from observation O1, for the orchestrator to judge:

- A smoke's clean-up message must be printed only after it confirms the deletion, or a dropped delete reports success. **Signal**: mutant M4 removed `rmSync(seededDir)` and the smoke still printed `deleted <dir>` and exited 0. **Source**: `hours-drawer-growth` validation, `scripts/smoke-hours-calendar.mjs:763-765`.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 11/11 applicable ACs matched the spec outcome (HDRW-12..14 N/A, consistent with the code); 0 open spec-precision gaps
**Sensor**: 4/4 mutations killed
**Gate**: 1691 passed, 0 failed; typecheck 0; lint 0 errors / 18 warnings (baseline); build green

**What works**: the tall seeded Sunday stays inside its card and the drawer scrolls it as one unit (34/34 on HEAD, 32/34 with the fix reverted). `--seed` writes the exact 14 fictitious periods and refuses a clash. The smoke refuses both a missing pointer and missing seed ids before any spawn or write, cleans up after a pass and keeps everything after a failure. The owner's real data stayed byte-identical throughout.

**Issues found**: none blocking. O1 to O3 are optional hardening.

**Next steps**: the orchestrator marks HDRW-01..11 Verified. The owner decides on O1 to O3, and separately on push and merge (gated by the spec).

## After verification: O1 closed (author, not a Verifier round)

On the owner's go-ahead, a pass now checks that the seeded directory and the pointer are really gone after
`rmSync`, and exits 1 with `Checks passed, but clean-up left: <path>` when either remains. Re-checked the same
day against the Verifier's M4 (the directory's `rmSync` removed, in a scratch copy): 34/34 checks, then exit 1 with
`clean-up left: ...playground-smoke-hours-<n>`, so M4 is now caught by the smoke itself. The unmutated smoke on a
fresh seed: 34/34, exit 0, directory and pointer gone, the owner's three data files unchanged (SHA-256). O2 and O3
stay open as cosmetic.
