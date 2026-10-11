# Files Stack Steady Neighbours Validation

**Date**: 2026-10-11
**Spec**: `.specs/features/files-stack-steady-neighbours/spec.md` (FSTD-01..09)
**Diff range**: `main..feature/files-stack-steady-neighbours` (82cf484..b9b75a9, 5 commits)
**Verifier**: independent sub-agent (author ≠ verifier)

**Verdict: FAIL ❌**, for a test gap only. The behaviour is correct everywhere the Verifier exercised it,
the probe below included. But one requirement path, FSTD-03's release when re-applying the folds
changes no size, has no discriminating test: mutant B2 removes it and survives the whole suite and the
smoke. One test-only fix task follows; no production change is needed.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | 82cf484 touches only `.specs/` (spec, tasks, validation.md): the measurement came before any production change |
| T2 | ✅ Done | 2d6ae62: `reportedHeight` plus 4 tests (`diff-view.test.ts:961-984`) |
| T3 | ✅ Done | 4c653b2: section 18, smoke-only commit before the wiring, with its failing run recorded in Measurements |
| T4 | ✅ Done | 3714ac2: `DiffViewer.tsx` only (plus `.specs/`) |
| T5 | ✅ Done | b9b75a9: after bench, AD-062 in `STATE.md` |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| FSTD-01: measure before any production change | The written section's heights over at least one re-read, and whether they leave the pre-read height, recorded before the fix | `validation.md` § Measurements › Before (T1), committed in 82cf484, whose stat holds only `.specs/` files: heights {180, 503}, 150 rises, episodes of 189/216/232 ms, "the cause in #167 holds" | ✅ PASS (measurement evidence, see note 1) |
| FSTD-02: while pending, report the last height to the container and to `onHeight` | The pre-reading height | Rule: `src/renderer/src/lib/diff-view.test.ts:965`, `expect(reportedHeight(503, 180, pending)).toBe(180)`. Wiring: `scripts/smoke-files-diff.mjs:4040`, `after.max <= after.base && after.final === after.base` (section box under a `ResizeObserver`). One value feeds both outputs: `src/renderer/src/components/DiffViewer.tsx:325-327` (`setHeight(reported)`, `onHeight?.(reported)`) | ✅ PASS (mutants U3 and B1 killed) |
| FSTD-03: after the recomputed diff's folds are re-applied, report the measured height again | The measured content height | Rule: `src/renderer/src/lib/diff-view.test.ts:970`, `expect(reportedHeight(503, 180, null)).toBe(503)`. Wiring: `DiffViewer.tsx:340` clears the reading before `applyFolds` and `DiffViewer.tsx:354` calls `measure()` again. **No committed test observes the release**: 18b's `final === base` holds just as well when the height never releases | ❌ GAP: B2 survived (Fix 1) |
| FSTD-04: with no reading pending, report the measured height, first mount included | The measured height | `src/renderer/src/lib/diff-view.test.ts:969-970` (no reading pending, 180 and 503 measured) and `:974-975` (`reportedHeight(180, null, null)` → 180; `reportedHeight(503, null, pending)` → 503, first mount). Wiring: `DiffViewer.tsx:410` measures at mount with `reported = null` (`:316`) | ✅ PASS (U1 and U2 killed) |
| FSTD-05: on a batch re-reading one section, every other expanded, unchanged section keeps the same editor node | The same `.monaco-diff-editor` node (spec, Assumptions) | `scripts/smoke-files-diff.mjs:4029-4035`: nodes tagged with `__fstd`, then `after.kept.length === neighbours.length && after.removed.length === 0 && neighbours.length > 0`, plus a `MutationObserver` counting removed editor nodes | ✅ PASS (B1 killed: 0/1 kept, 3 removals) |
| FSTD-06: bench edit loop, at most 2 `cat-file` per `files:changed` over the steady rows | ≤ 2 | § After (T5) below: steady rows 120/60, 119/60 and 119/59, which is 358/179 = 2.00. That is how `scripts/bench-summary.mjs:171-213` computes the verdict (sums over the steady rows, `inclusive(catFiles / emits, 2)`): PASS | ✅ PASS (measurement evidence, see note 2) |

**Note 1 (FSTD-01).** The evidence fits the requirement. It came before the fix: commit order, plus
82cf484 touching only `.specs/`. It is quantitative and gives the series' semantics: a `ResizeObserver`
on every `.diff-section`, and a `MutationObserver` on editor nodes. It also states the verdict the spec
asked for. The window size differs from the spec's assumption (1306 x 823 against 1266 x 715), but
Measurements says so openly, and before and after used the same window, so the comparison holds.

**Note 2 (FSTD-06), spec-precision gap ⚠️ (minor).** AC 6 says "the steady rows SHALL read at most 2",
and the bench reads it as one ratio summed over the rows: 2.00, PASS. The spec's Success Criteria and
T5's Done when say "in every steady row", and per row the third reads 119/59 = 2.017 > 2. The gap comes
from the minute buckets: the second row reads 1.98, so one batch's reads fell into the next bucket. The
mechanism figure stays exactly 2 per batch over the run. T5's status line "2.00 in every steady row" is
therefore true only in aggregate. No fix to the code. The wording should say "over the steady rows (the
bench's aggregate)".

**Status**: ❌ 1 AC has a test gap (FSTD-03 release wiring); ⚠️ 1 spec-precision gap flagged (FSTD-06 wording)

---

## Edge Cases

- [x] **FSTD-07, a recomputed diff never reports computed changes.** The height stays held until one
  does. `src/renderer/src/components/DiffViewer.tsx:337` (`if (!changes) return`) returns before
  `pendingRef.current = null` at `:340`, so the reading stays pending, and every `measure` in between
  returns `last` (`src/renderer/src/lib/diff-view.ts:587`). Rule test:
  `src/renderer/src/lib/diff-view.test.ts:979-983`, where three pending measurements (503, 620, 503)
  keep 180. Wiring by inspection.
- [x] **FSTD-08, a re-read whose text equals the current text.** Nothing is held. A reading is taken
  only when `originalMoves || modifiedMoves` (`DiffViewer.tsx:458-459, 464`); otherwise `pendingRef`
  stays null and `reportedHeight` returns `measured` (`diff-view.test.ts:969-970`). By inspection: no
  smoke rewrites with identical bytes and checks the height. The path is unchanged code from FOLD.
- [x] **FSTD-09, a second re-read while one is pending.** The height from before the first stays held.
  `readingBeforeUpdate` keeps the pending reading (`src/renderer/src/lib/diff-view.ts:570`, `if
  (pending !== null) return pending`), and `reported` is threaded through each `measure`
  (`DiffViewer.tsx:325`), so the first held value persists (`diff-view.test.ts:979-983`). A Hide or
  Show press while pending keeps the reading non-null, `states: null` (`DiffViewer.tsx:488-490`), so the
  hold persists there too.
- [x] **Not in the spec, checked anyway.** An unfitted viewer (`DiffTab`) is untouched: `measure`
  returns early on `!fitContent` (`DiffViewer.tsx:318`), and the listeners are registered only when
  fitted (`:407-411`). This matches the Out of Scope row for `DiffTab`.

---

## Discrimination Sensor

Run in a scratch `git worktree` at HEAD b9b75a9 (with `node_modules` linked by a junction), never in the
real tree. The unit mutants ran the Quick gate. The behaviour mutants used a fresh `npx electron-vite
build`, a fresh seed and user-data dir, an Electron launch on port 9223 and `SMOKE_ONLY=steady`, then a
CDP `window.close()` and `--clean`. Control: the unmutated scratch build passed section 18, **2/2** (18a
1/1 kept, 0 removals; 18b base 151, max 151, final 151 px), so every kill below comes from its mutation.

| # | File:line | Mutation | Run | Killed? |
| - | --------- | -------- | --- | ------- |
| U1 | `src/renderer/src/lib/diff-view.ts:587` | Ignore `pending`: `last !== null ? last : measured` | vitest `diff-view.test.ts` | ✅ Killed (1 failed: "reports the measured height once no reading is pending") |
| U2 | `src/renderer/src/lib/diff-view.ts:587` | Drop the first-mount guard: `pending !== null ? (last as number) : measured` | vitest | ✅ Killed (1 failed: "reports the measured height on first mount") |
| U3 | `src/renderer/src/lib/diff-view.ts:587` | Never hold: `return measured` | vitest | ✅ Killed (2 failed: FSTD-02, FSTD-07/09 tests) |
| B1 | `src/renderer/src/components/DiffViewer.tsx:325` | Pass `null` instead of `pendingRef.current` | e2e section 18 | ✅ Killed (0/2: 18a 0/1 kept, 3 removals; 18b max 3875 px against base 151) |
| B2 | `src/renderer/src/components/DiffViewer.tsx:354` | Remove the `measure()` after the folds are re-applied | e2e section 18 | ❌ **Survived** (2/2 PASS) |

**B2 is not an equivalent mutant.** A scratch-only probe, added to the scratch copy of the smoke and
never committed, checked it. With the stack open and **Show unchanged** pressed, so the folds reveal
everything, it appended 40 lines to `fold/long.ts`:

| Build | Written section before | After the append (+40 lines x 19 px = +760 expected) |
| ----- | ---------------------- | ---------------------------------------------------- |
| Unmutated b9b75a9 | 3851 px | **4611 px** (+760, correct) |
| B2 | 3851 px | **3851 px** (held forever; the new lines are clipped) |

When re-applying the folds changes no size, no `onDidContentSizeChange` fires after the reading is
cleared, and only the `measure()` at `DiffViewer.tsx:354` releases the hold. The shipped code is right
and its comment at `:352-353` names exactly this case, but nothing in the suite would catch losing it.

**Sensor depth**: lightweight plus (5 mutations: 3 unit, 2 e2e)
**Result**: 4/5 killed. **FAIL ❌** (1 surviving mutant becomes Fix 1)

Isolation: the real tree's `git status --porcelain` was empty before and is empty after (only this
report changed). The scratch worktree was removed (junction first), and `git worktree list` shows only
`D:/playground-main`.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code: one pure 3-line rule, `measure` moved up in the mount effect, one extra call | ✅ |
| Surgical changes: production diff is `diff-view.ts` (+14) and `DiffViewer.tsx` (+18/−10); no unrelated edits | ✅ |
| No scope creep: `mountPlan`, `NEAR_VIEWPORT`, the observer, `foldPlan` and `readingBeforeUpdate` untouched, as Out of Scope requires | ✅ |
| Matches patterns: pure rule in `lib/diff-view.ts` with JSDoc, the way `readingBeforeUpdate` is; unit test in the same `describe` style; smoke section with its own `SMOKE_ONLY` gate and `try/finally` restore, like sections 15 and 17 | ✅ |
| Comments explain why, not history: `diff-view.ts:576-581` (why hold), `DiffViewer.tsx:352-353` (why measure again), the moved spike-finding comment kept verbatim; no "before/after" or work-item narration in code | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ✅ for FSTD-02/04/05/07/09, with literal heights and node identity; ❌ FSTD-03 wiring (Fix 1) |
| Per-layer Coverage Expectation (Test Coverage Matrix): pure rule, every branch, 1:1 | ✅ (U1-U3 killed). Component e2e covers FSTD-05 ✅ but not FSTD-03's no-size-change release ❌ |
| Every test maps to a spec requirement (no unclaimed tests): 4 unit tests tagged FSTD-02/03/04/07/09; 18a FSTD-05, 18b FSTD-02 | ✅ |
| Documented guidelines followed: none in the repo (tasks.md says so); strong defaults plus the existing test and smoke conventions applied | ✅ |
| Privacy guardrail (public repo): diff and commit messages scanned for org, customer, person and work-item data. Only fictitious fixtures (`fold/long.ts`, `stack/f*.ts`), upstream issue numbers and the noreply author address | ✅ |

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (real tree at b9b75a9, exit 0)
- **typecheck**: node and web, 0 errors
- **lint**: ✖ 18 problems (0 errors, 18 warnings), equal to the baseline
- **Result**: 3172 passed, 0 failed, 0 skipped (143 files)
- **Test count before feature**: 3168
- **Test count after feature**: 3172
- **Delta**: +4 new tests (the `reportedHeight` block); none removed, no assertion weakened (the diff only adds to `diff-view.test.ts`)
- **Quick gate** (scratch, unmutated): `diff-view.test.ts` 95/95
- **Smoke** (scratch, unmutated build): `SMOKE_ONLY=steady` 2/2

---

## Fix Plans

### Fix 1: FSTD-03 release has no discriminating test (surviving mutant B2)

- **Root cause**: 18b compares the max and the final height with the folded base. In the folded case the
  held height and the released height are the same number, and re-applying the folds fires its own size
  change anyway. So neither the release nor the `measure()` at `DiffViewer.tsx:354` is observed.
- **Fix task** (test-only):
  - *What*: add check **18c** to `steadySection` in `scripts/smoke-files-diff.mjs`. With `fold/long.ts`
    in the stack, press All changes' **Show unchanged** and let it settle, then read the written
    section's height `H0`. Rewrite the file with N extra lines (e.g. `steadyText(...) + foldText('x',
    40)`), wait one write gap, and assert the section grew by about N x line height (`final >= H0 + N *
    19 - tolerance`), or that the section box equals the fitted editor's content height. Restore the
    file and the hidden state in `finally`, so the full drive's later sections start as today.
  - *Where*: `scripts/smoke-files-diff.mjs` (section 18; header comment "checks 18a..18c")
  - *Verify*: passes on b9b75a9; fails with the `measure()` at `DiffViewer.tsx:354` removed (Verifier
    probe: 3851 → 3851 px instead of 4611)
  - *Done when*: 18c seen failing on the B2 mutant and passing on HEAD; `SMOKE_ONLY=steady` 3/3; full
    drive still all PASS
- **Priority**: Major. A future refactor of the diff listener could drop the call, and a section would
  then stay clipped after any re-read under Show unchanged, or of a file with nothing to fold.

### Note: FSTD-06 wording (spec-precision, no code change)

Reword the Success Criteria and T5's Done when from "in every steady row" to "over the steady rows (the
bench's aggregate ratio)", or record that per-row ratios move around 2 with the minute buckets
(1.98-2.02).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FSTD-01 | Implementing (T1 done) | ✅ Verified |
| FSTD-02 | Implementing | ✅ Verified |
| FSTD-03 | Implementing (T4) | ❌ Needs Fix (test only: Fix 1) |
| FSTD-04 | Implementing | ✅ Verified |
| FSTD-05 | Implementing | ✅ Verified |
| FSTD-06 | Implementing (T5: 2.00) | ✅ Verified (⚠️ wording, aggregate) |
| FSTD-07 | Implementing | ✅ Verified (rule unit plus inspection) |
| FSTD-08 | Implementing | ✅ Verified (inspection) |
| FSTD-09 | Implementing | ✅ Verified (rule unit plus inspection) |

---

## Summary

**Overall**: ❌ Not Ready. One test-only fix; the production change is correct.

**Spec-anchored check**: 5/6 ACs matched the spec outcome with discriminating evidence; FSTD-03's wiring
has a gap; 1 spec-precision gap (FSTD-06 wording)
**Sensor**: 4/5 mutations killed (B2 survived; shown non-equivalent by probe)
**Gate**: 3172 passed, 0 failed; typecheck 0; lint 0 errors / 18 warnings

**What works**: the hold rule and its wiring stop the height excursion and the neighbours' remounts
(B1 shows 18a and 18b discriminate). The bench target is met at 2.00, down from 6.07. The release
after the folds works, including the no-size-change case (probe: 3851 → 4611 px on HEAD).

**Issues found**: FSTD-03's release path through `DiffViewer.tsx:354` is unguarded by any test. Add
smoke check 18c (Fix 1).

**Next steps**: route Fix 1 to an implementer, then re-dispatch the Verifier (iteration 1 of 3).

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
