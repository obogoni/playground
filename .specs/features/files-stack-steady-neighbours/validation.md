# Files Stack Steady Neighbours Validation

**Date**: 2026-10-11
**Spec**: `.specs/features/files-stack-steady-neighbours/spec.md` (FSTD-01..09)
**Diff range**: `main..feature/files-stack-steady-neighbours` (82cf484..f2073c6, 7 commits); round-1 fixes `e5ccdea` (F1) and `f2073c6` (F2)
**Verifier**: independent sub-agent (author ≠ verifier), fix round 2 of max 3

**Verdict: FAIL ❌**, for one minor test gap. Both round-1 gaps are closed: check 18c kills B2, and the
bench target now reads as the aggregate the bench computes. But a new mutant on the pure rule, U4
(`Math.min(last, measured)` while pending), survives the unit suite and the smoke. FSTD-02 says the
viewer reports *the last height it reported*, and no test pins that when the pending measurement is
smaller than the held one. The fix is one unit assertion; no production change is needed.

### Round 1 (what failed, and how it was fixed)

| Round-1 gap | Fix | Round-2 evidence |
| ----------- | --- | ---------------- |
| Mutant B2 (no `measure()` after `applyFolds`, `DiffViewer.tsx:354`) survived: FSTD-03's release had no discriminating test | F1, `e5ccdea`: check 18c in `scripts/smoke-files-diff.mjs:4055-4075` | Re-run independently: unmutated 18c PASS (3851 → 4611 px); B2 18c **FAIL** (3851 → 3851 px). Closed ✅ |
| FSTD-06 spec-precision gap: Success Criteria and T5 said "every steady row", the bench judges the aggregate | F2, `f2073c6`: both now say "over the steady rows (aggregate)" | Matches `scripts/bench-summary.mjs:171-173` (sums over the steady rows) and `:213` (`inclusive(catFiles / emits, ...)`); no "every steady row" left in the spec or T5. Closed ✅ |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | 82cf484 touches only `.specs/`: the measurement came before any production change |
| T2 | ✅ Done | 2d6ae62: `reportedHeight` (`src/renderer/src/lib/diff-view.ts:582-588`) plus 4 tests (`diff-view.test.ts:961-984`) |
| T3 | ✅ Done | 4c653b2: section 18, committed before the wiring, failing run recorded in Measurements |
| T4 | ✅ Done | 3714ac2: `DiffViewer.tsx` only (plus `.specs/`) |
| T5 | ✅ Done | b9b75a9: after bench, AD-062 |
| F1 | ✅ Done | e5ccdea: 18c, with Hide unchanged pressed back in `finally` |
| F2 | ✅ Done | f2073c6: wording only |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| FSTD-01: measure before any production change | Heights over at least one re-read, and whether they leave the pre-read height, recorded before the fix | § Measurements › Before (T1), committed in 82cf484 (only `.specs/`): heights {180, 503}, 150 rises, "the cause in #167 holds" | ✅ PASS (measurement evidence) |
| FSTD-02: while pending, report the last height to the container and to `onHeight` | The height reported before the reading, whatever the pending measurement | Rule: `src/renderer/src/lib/diff-view.test.ts:965`, `expect(reportedHeight(503, 180, pending)).toBe(180)`, and `:979-983` (503, 620, 503 keep 180). Wiring: `scripts/smoke-files-diff.mjs:4049-4053`, `after.max <= after.base && after.final === after.base`. One value feeds both outputs: `src/renderer/src/components/DiffViewer.tsx:325-327` | ❌ GAP, partial: PASS for a pending height above the held one, but every pending case has `measured > last`, so U4 (`Math.min`) survives (Fix 1) |
| FSTD-03: after the folds are re-applied, report the measured height again | The measured content height | Rule: `diff-view.test.ts:970`, `expect(reportedHeight(503, 180, null)).toBe(503)`. Wiring: `scripts/smoke-files-diff.mjs:4071-4075`, `grown.height - before.height === STEADY_EXTRA * before.line` (+760 = 40 x 19 px), under Show unchanged, where only the `measure()` at `DiffViewer.tsx:354` releases the hold | ✅ PASS (B2 killed) |
| FSTD-04: with no reading pending, report the measured height, first mount included | The measured height | `diff-view.test.ts:969-970` and `:974-975` (`reportedHeight(503, null, pending)` → 503 on first mount). Wiring: `DiffViewer.tsx:410` measures at mount with `reported = null` (`:316`) | ✅ PASS (round-1 U1, U2 killed) |
| FSTD-05: every other expanded, unchanged section keeps the same editor node | Same `.monaco-diff-editor` node | `scripts/smoke-files-diff.mjs:4039-4047`: `after.kept.length === neighbours.length && after.removed.length === 0 && neighbours.length > 0` (tagged nodes plus a `MutationObserver`) | ✅ PASS (round-1 B1 killed; this round 1/1 kept steady-only, 3/3 kept in the full drive) |
| FSTD-06: bench edit loop, at most 2 `cat-file` per `files:changed` over the steady rows | ≤ 2, aggregate | § Measurements › After (T5): 358/179 = 2.00, the ratio `scripts/bench-summary.mjs:171-173, 213` judges. Spec Success Criteria and T5 now say "(aggregate)" | ✅ PASS (round-1 precision gap closed) |

**Status**: ❌ 1 test gap (FSTD-02, pending height below the held one: Fix 1); 0 spec-precision gaps open

---

## Edge Cases

- [x] **FSTD-07, no computed diff.** `DiffViewer.tsx:337` (`if (!changes) return`) returns before
  `pendingRef.current = null` (`:340`), so the reading stays pending and `measure` keeps returning the held
  value (`diff-view.ts:587`). Rule test `diff-view.test.ts:979-983`. Wiring by inspection.
- [x] **FSTD-08, text unchanged.** A reading is taken only when `originalMoves || modifiedMoves`
  (`DiffViewer.tsx:458-466`); otherwise `pendingRef` stays null and the measured height is reported
  (`diff-view.test.ts:969-970`). By inspection.
- [x] **FSTD-09, second re-read while pending.** `readingBeforeUpdate` keeps the first reading
  (`diff-view.ts:570`), and `reported` threads through each `measure` (`DiffViewer.tsx:325`), so the first
  held value persists (`diff-view.test.ts:979-983`).

---

## Discrimination Sensor

Scratch `git worktree` at f2073c6 (`node_modules` by junction), never the real tree. Smoke runs: fresh
`npx electron-vite build`, fresh seed and user-data dir, Electron on port 9223, `SMOKE_ONLY=steady`, CDP
`window.close()`, `--clean`. Control (unmutated): **3/3** steady (18a 1/1 kept, 0 removals; 18b 151/151/151
px; 18c 3851 → 4611 px) and full drive **126/126** (18c 3882 → 4642 px).

| # | File:line | Mutation | Run | Killed? |
| - | --------- | -------- | --- | ------- |
| B2 | `src/renderer/src/components/DiffViewer.tsx:352-354` | Remove the `measure()` after the folds are re-applied | steady smoke | ✅ **Killed** (2/3: 18c FAIL, 3851 → 3851 px, expected +760) |
| M5 | `src/renderer/src/components/DiffViewer.tsx:345-354` | Move that `measure()` to just before `applyFolds` (reading already cleared, folds not back yet) | steady smoke | ⚪ Survived, equivalent by observation (3/3; 18b max 151 px): the revealed height it reports and the folded height the folds' size change reports land in the same task, so React renders only the last one; under Show unchanged (18c) both are the same number. No fix task |
| U4 | `src/renderer/src/lib/diff-view.ts:587` | Hold the smaller value: `pending !== null && last !== null ? Math.min(last, measured) : measured` | vitest `diff-view.test.ts` | ❌ **Survived** (95/95). Not equivalent: a section whose new text is much shorter (held 180, pending 57) reports 57 at once, against the spec's 180. The smoke cannot see it either: its pending height is always the larger one (3875 against 151) |

**Sensor depth**: lightweight (3 mutations: 1 unit, 2 e2e), plus the round-1 set (U1-U3 and B1 killed), still valid on unchanged production code
**Result**: 1 killed, 1 equivalent, 1 survived. **FAIL ❌** (U4 becomes Fix 1)

Isolation: the real tree's `git status --porcelain` was empty before and after the sensor. The junction was
deleted first and the worktree removed; `git worktree list` shows only `D:/playground-main`,
`node_modules\electron` is intact, and no Electron process remains.

---

## Code Quality (round-1 diff: e5ccdea, f2073c6)

| Principle | Status |
| --------- | ------ |
| Minimum code: 18c is one check plus an optional `extra` on `steadyText`; the default `extra = 0` keeps 18a/18b's text identical | ✅ |
| Surgical: e5ccdea touches only `scripts/smoke-files-diff.mjs` (section 18 and its header) and `tasks.md`; f2073c6 only `.specs/` | ✅ |
| No scope creep: no production file in either commit | ✅ |
| Matches patterns: `check(...)` with a measured detail string, `try/finally` restore like sections 15 and 17, `STEADY_*` constants with JSDoc | ✅ |
| Comments explain why: `smoke-files-diff.mjs:4055-4057` says why Show unchanged (no size change follows the folds), `:3944` why an exact count of lines; no history or work-item narration | ✅ |
| 18c restores state: `shown` is set before the press, and Hide unchanged is pressed back in `finally` (`:4079-4082`) after the file is restored; every later section of the full drive passes (126/126) | ✅ |
| Spec-anchored outcome check | ✅ FSTD-01/03/04/05/06; ❌ FSTD-02's below-held case (Fix 1) |
| Per-layer Coverage Expectation: pure rule 1:1 (branches covered, but the held value is not pinned for a smaller measurement); e2e covers FSTD-02/03/05 | ⚠️ (Fix 1) |
| Every test maps to a requirement: 18a FSTD-05, 18b FSTD-02, 18c FSTD-03; the 4 unit tests are tagged | ✅ |
| Documented guidelines: none in the repo; strong defaults and the existing smoke conventions applied | ✅ |
| Privacy guardrail (public repo): diff and commit metadata scanned; only fictitious fixtures, upstream issue numbers and the noreply author address | ✅ |

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (real tree at f2073c6, exit 0)
- **typecheck**: node and web, 0 errors
- **lint**: ✖ 18 problems (0 errors, 18 warnings), equal to the baseline
- **Result**: 3172 passed, 0 failed, 0 skipped (143 files)
- **Test count before feature**: 3168; **after**: 3172; **delta**: +4, none removed or weakened (the round-1 fixes add no unit test)
- **Smoke** (scratch, unmutated): steady 3/3; full drive 126/126

---

## Fix Plans

### Fix 1: FSTD-02's held value is not pinned when the pending height is smaller (surviving mutant U4)

- **Root cause**: every pending case in `diff-view.test.ts:961-984` has `measured > last` (503 or 620
  against 180), so `last`, `Math.min(last, measured)` and the spec's outcome all agree there.
- **Fix task** (test-only): in `src/renderer/src/lib/diff-view.test.ts`, FSTD-02's test (`:964-966`), add a
  pending case below the held height, e.g. `expect(reportedHeight(57, 180, pending)).toBe(180)`.
- **Verify**: passes on HEAD; fails with `diff-view.ts:587` mutated to `Math.min(last, measured)`.
- **Done when**: U4 seen killed in a scratch worktree; `diff-view.test.ts` 95/95; `npm test` 3172.
- **Priority**: Minor. The production rule is right, and losing it would only shrink a section about 200 ms
  early; but the spec states the held value precisely and nothing guards it.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FSTD-01 | Implementing (T1 done) | ✅ Verified |
| FSTD-02 | Implementing | ❌ Needs Fix (test only: Fix 1) |
| FSTD-03 | Implementing (T4) | ✅ Verified (18c, B2 killed) |
| FSTD-04 | Implementing | ✅ Verified |
| FSTD-05 | Implementing | ✅ Verified |
| FSTD-06 | Implementing (T5: 2.00) | ✅ Verified (aggregate wording) |
| FSTD-07 | Implementing | ✅ Verified (rule unit plus inspection) |
| FSTD-08 | Implementing | ✅ Verified (inspection) |
| FSTD-09 | Implementing | ✅ Verified (rule unit plus inspection) |

`spec.md` stays as it is until the feature passes.

---

## Summary

**Overall**: ❌ Not Ready. One minor test-only fix; the production code is correct.

**Spec-anchored check**: 5/6 ACs fully matched; FSTD-02 has one unpinned case; 0 spec-precision gaps open
**Sensor**: 1 killed (B2), 1 equivalent (M5), 1 survived (U4)
**Gate**: 3172 passed, 0 failed; typecheck 0; lint 0 errors / 18 warnings

**What works**: 18c closes round 1's B2 gap and restores Hide unchanged; the bench wording matches
`bench-summary.mjs`; the full smoke drive reads 126/126.

**Issues found**: U4. Add one pending assertion below the held height (Fix 1).

**Next steps**: route Fix 1 to an implementer, then re-dispatch the Verifier (round 3 of 3).

---

## Measurements

### Before (T1), commit 337ae6e (main at #177; `-dirty` is this feature's untracked `.specs/` only)

**Verdict: the cause in #167 holds.** On every re-read the written section's height leaves its folded
value for about 216 ms, and the two sections that sit near the margin lose their editor at the rise
and get it back at the fall.

**Setup.** Built app (`npx electron-vite build`), `node scripts/bench-sessions.mjs --sessions 0
--files-view --edit-interval 1000` (3 steady minutes, 237 writes, 0 skipped). The window came up at
1306 x 823 CSS px, not the issue's 1266 x 715: the bench does not size it. Alongside, a read-only CDP
probe attached to the bench's port 9334 once the stack held an editor and watched it for 150 s: a
`ResizeObserver` on every `.diff-section` box, and a `MutationObserver` on the stack counting
`.monaco-diff-editor` nodes added and removed per section. Nothing was written to the page.

**Stack at attach.** 12 sections, the first 10 expanded. `src/f0000.ts` (the written file) to
`src/f0003.ts` held editors, 180 px each, at offsets 10, 198, 386 and 575; `f0004`..`f0009` held their
202 px estimate; `f0010` and `f0011` folded at 31 px.

**Written section (`src/f0000.ts`), 150 s.**

| Measure | Value |
| ------- | ----- |
| Distinct heights reported | 180, 503 (only) |
| Rises above 180 px | 150 (149 complete episodes) |
| Episode length (rise to fall) | min 189 ms, median 216 ms, max 232 ms |
| Size of the jump | +323 px = 17 lines x 19 px: the 21-line file with no region folded |

The first episodes: 503 at t = 119 ms, back to 180 at 335; 503 at 1137, 180 at 1352; 503 at 2136, 180
at 2351. One episode per write, each starting when the new sides arrive.

**Neighbours, 150 s.**

| Section | Editor removed | Editor added |
| ------- | -------------- | ------------ |
| `src/f0001.ts` | 0 | 0 |
| `src/f0002.ts` | 150 | 149 |
| `src/f0003.ts` | 161 | 160 |

Removal lag after the written section's rise: min 2 ms, median 3 ms (max 1003 ms, one removal that
followed the previous episode). The neighbours therefore drop on the rise itself, and come back on the
fall about 216 ms later. The issue's "about 220 ms after the new sides arrive" for the unmount is the
episode length seen from a different anchor; the mechanism is the same. In this taller window
`f0001` stays inside the margin, which is why two neighbours flap here and three in the issue.

**Bench, files block.**

| Phase | `files:changed` | git n | `cat-file` | `wt:status` |
| ----- | --------------- | ----- | ---------- | ----------- |
| steady 1 | 60 | 542 | 362 | 0 |
| steady 2 | 59 | 541 | 364 | 0 |
| steady 3 | 60 | 540 | 360 | 0 |

Target "untouched sections stay: `cat-file` per `files:changed` <= 2": **6.07, FAIL**. The figure is
the mechanism's arithmetic: 2 for the written section's own re-read (FWIG-25), plus 2 for each of the
two neighbours' remount re-reads.

The same run also reads "no overlapping git on one worktree: 3, FAIL". That target is #147's and is not
in this feature's scope; it is recorded here only so the after run compares against it.

### Smoke before the fix (T3), build of 337ae6e

`SMOKE_ONLY=steady node scripts/smoke-files-diff.mjs` on a fresh seed and launch, with the app built
before T4: **0/2, both seen failing.**

- 18a FAIL: the re-read landed (the section shows `-1003`), and the one editor below `fold/long.ts`
  (the long untracked name) was removed 3 times, once per rewrite, and its node replaced.
- 18b FAIL: the written section measured 151 px folded and reached 3875 px during a re-read (the
  200-line file with every region revealed), then settled back at 151 px.

### Smoke after the fix (T4)

Same procedure on a build that includes T4, fresh seed and launch each time.

- `SMOKE_ONLY=steady`: **2/2 PASS**. 18a: re-read landed, 3/3 editors below `fold/long.ts` kept their
  node (the long untracked name, `crlf.txt`, `untracked.txt`), 0 removals. 18b: 151 px folded, max
  151 px, final 151 px.
- Full drive: **125/125 PASS**, 18a and 18b among them (182 px folded, max 182, final 182 in that state
  of the stack); `--after-restart`: 1/1 PASS.

### After (T5), commit 3714ac2

Same bench and probe as T1, on a build of `3714ac2` (clean tree). Window 1306 x 823, same stack layout
at attach.

**Verdict: target met.** The written section never left 180 px, no editor was added or removed in the
stack, and the bench reads 2.00 `cat-file` per `files:changed`.

| Measure | Before (337ae6e) | After (3714ac2) |
| ------- | ---------------- | --------------- |
| Written section heights in 150 s | 180 and 503, 150 rises | 180 only, 0 rises |
| Neighbour editors removed / added in 150 s | `f0002` 150 / 149, `f0003` 161 / 160 | 0 / 0 |
| Steady `files:changed` per minute | 59-60 | 59-60 |
| Steady git processes per minute | 540-542 | 297-300 |
| Steady `cat-file` per minute | 360-364 | 119-120 |
| `cat-file` per `files:changed` (target <= 2) | 6.07 FAIL | **2.00 PASS** |

**Bench, files block (after).**

| Phase | `files:changed` | git n | `cat-file` | `wt:status` |
| ----- | --------------- | ----- | ---------- | ----------- |
| steady 1 | 60 | 300 | 120 | 0 |
| steady 2 | 60 | 298 | 119 | 0 |
| steady 3 | 59 | 297 | 119 | 0 |

The re-reads still happen: 120 `cat-file` over 60 batches is the written file's two reads per batch
(FWIG-25), which is what the target allows. "No overlapping git on one worktree" still reads 3, FAIL,
as before; it is #147's and out of scope here.
