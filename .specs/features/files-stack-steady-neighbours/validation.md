# Files Stack Steady Neighbours Validation

**Date**: 2026-10-11
**Spec**: `.specs/features/files-stack-steady-neighbours/spec.md` (FSTD-01..09)
**Diff range**: `main..feature/files-stack-steady-neighbours` (82cf484..5e4c9f7, 8 commits); round-1 fixes `e5ccdea` (F1) and `f2073c6` (F2), round-2 fix `5e4c9f7` (F3)
**Verifier**: independent sub-agent (author ≠ verifier), fix round 3 of max 3 (final)

## Validation: PASS (owner decision 2026-10-11, one accepted residual)

The owner accepted mutant N1 as a residual risk instead of adding check 18d. N1 feeds `onHeight` the raw
measured height while the container keeps the held one (`src/renderer/src/components/DiffViewer.tsx:327`);
the shipped code passes the same `reported` value to both outputs on adjacent lines (`:326-327`). The
check that would guard it has to drop the written section's editor mid re-read by resizing the window
over CDP, a timing-bound check judged too fragile for one line that only a deliberate edit would break.
Every other criterion passed the independent Verifier. The Verifier's own round-3 verdict follows.

**Verifier verdict, round 3: FAIL ❌**, for one test gap on FSTD-02's second output. Round 2's gap is closed: U4 is killed
by the new assertion. But a new mutant of this round, N1 (`onHeight` fed the raw measured height while
the container keeps the held one, `DiffViewer.tsx:327`), passes the unit suite, the steady smoke and the
full drive (126/126). It is not equivalent: a probe that drops the written section's editor while its
folds are pending shows its placeholder at **3843 px** under N1 against **119 px** on HEAD (the section
box at 3874 px against 150 px), twice each. FSTD-02 names both outputs ("to its container and to
`onHeight`"); the tests see only the container. The production code is correct; the gap is a missing
check. This is the last round, so it goes to the owner: add the check (Fix 1) or accept N1 as a
recorded residual.

### Earlier rounds (what failed, and how it was fixed)

| Round | Gap | Fix | Round-3 evidence |
| ----- | --- | --- | ---------------- |
| 1 | Mutant B2 (no `measure()` after `applyFolds`, `DiffViewer.tsx:354`) survived: FSTD-03's release had no discriminating test | F1, `e5ccdea`: check 18c (`scripts/smoke-files-diff.mjs:4071-4075`) | Round 2 saw B2 killed (3851 → 3851 px). Production code unchanged since, and 18c passes on this round's control (3851 → 4611 px). Closed ✅ |
| 1 | FSTD-06 spec-precision gap ("every steady row" against an aggregate bench) | F2, `f2073c6`: "over the steady rows (aggregate)" | Wording unchanged since round 2. Closed ✅ |
| 2 | Mutant U4 (`Math.min(last, measured)` while pending, `diff-view.ts:587`) survived: every pending case measured above the held height | F3, `5e4c9f7`: `expect(reportedHeight(57, 180, pending)).toBe(180)` (`diff-view.test.ts:966`) | U4 re-run in a scratch worktree: **killed**, 1 failed / 94 passed, `expected 57 to be 180` at `diff-view.test.ts:966:46`. Closed ✅ |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | 82cf484 touches only `.specs/`: the measurement came before any production change |
| T2 | ✅ Done | 2d6ae62: `reportedHeight` (`src/renderer/src/lib/diff-view.ts:582-588`) plus its tests (`diff-view.test.ts:961-985`) |
| T3 | ✅ Done | 4c653b2: section 18, committed before the wiring, failing run recorded in Measurements |
| T4 | ✅ Done | 3714ac2: `DiffViewer.tsx` only (plus `.specs/`) |
| T5 | ✅ Done | b9b75a9: after bench, AD-062 |
| F1 | ✅ Done | e5ccdea: 18c |
| F2 | ✅ Done | f2073c6: wording only |
| F3 | ✅ Done | 5e4c9f7: one assertion, test only |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| FSTD-01: measure before any production change | Heights over at least one re-read, and whether they leave the pre-read height, recorded before the fix | § Measurements › Before (T1), committed in 82cf484 (only `.specs/`): heights {180, 503}, 150 rises, "the cause in #167 holds" | ✅ PASS (measurement evidence) |
| FSTD-02: while pending, report the last height to the container **and to `onHeight`** | The height reported before the reading, on both outputs, whatever the pending measurement | Rule: `src/renderer/src/lib/diff-view.test.ts:965-966`, `expect(reportedHeight(503, 180, pending)).toBe(180)` and `expect(reportedHeight(57, 180, pending)).toBe(180)`. Container: `scripts/smoke-files-diff.mjs:4051`, `after.max <= after.base && after.final === after.base`. `onHeight`: **no test**; it is read only by the placeholder (`DiffSection.tsx:133`, `:198`), which no check renders during a pending reading | ❌ GAP, partial: rule and container PASS (U4, N2 killed); the `onHeight` output is unguarded (N1 survives, Fix 1) |
| FSTD-03: after the folds are re-applied, report the measured height again | The measured content height | Rule: `diff-view.test.ts:971`, `expect(reportedHeight(503, 180, null)).toBe(503)`. Wiring: `scripts/smoke-files-diff.mjs:4073`, `grown.height - before.height === expected` (+760 = 40 x 19 px) under Show unchanged, where only the `measure()` at `DiffViewer.tsx:354` releases the hold | ✅ PASS (B2 killed in round 2) |
| FSTD-04: with no reading pending, report the measured height, first mount included | The measured height | `diff-view.test.ts:970-971` and `:975-976` (`reportedHeight(503, null, pending)` → 503 on first mount). Wiring: `DiffViewer.tsx:410` measures at mount with `reported = null` (`:316`) | ✅ PASS (U1, U2, U3 killed) |
| FSTD-05: every other expanded, unchanged section keeps the same editor node | Same `.monaco-diff-editor` node | `scripts/smoke-files-diff.mjs:4042-4046`: `after.kept.length === neighbours.length && after.removed.length === 0` with `neighbours.length > 0` | ✅ PASS (N2 killed here: 0/1 kept, 3 removals) |
| FSTD-06: bench edit loop, at most 2 `cat-file` per `files:changed` over the steady rows | ≤ 2, aggregate | § Measurements › After (T5): 358/179 = 2.00, the ratio `scripts/bench-summary.mjs` judges | ✅ PASS (measurement evidence) |

**Status**: ❌ 1 test gap (FSTD-02's `onHeight` output: Fix 1); 0 spec-precision gaps open

---

## Edge Cases

- [x] **FSTD-07, no computed diff.** `DiffViewer.tsx:337` (`if (!changes) return`) returns before
  `pendingRef.current = null` (`:340`), so the reading stays pending and `measure` keeps the held value
  (`diff-view.ts:587`). Rule test `diff-view.test.ts:979-984`. Wiring by inspection.
- [x] **FSTD-08, text unchanged.** A reading is taken only when `originalMoves || modifiedMoves`
  (`DiffViewer.tsx:464`). Mutant N3 (take a reading on every sides update) is killed by the full drive
  (FOLD-12 and FOLD-16 fail: a reading taken without a new diff stays pending), so the guard is covered,
  though through the folds rather than the height.
- [x] **FSTD-09, second re-read while pending.** `readingBeforeUpdate` keeps the first reading
  (`diff-view.ts:570`), and `reported` threads through each `measure` (`DiffViewer.tsx:325`), so the first
  held value persists (`diff-view.test.ts:979-984`; U5 `Math.max` killed there).

---

## Discrimination Sensor

Scratch `git worktree` (`--detach` at 5e4c9f7, `node_modules` by junction), never the real tree. Unit
mutants: `npx vitest run src/renderer/src/lib/diff-view.test.ts` (control 95/95). E2E mutants: fresh
`npx electron-vite build` in the scratch, fresh seed and user-data dir, Electron on port 9223, CDP
`window.close()`, `--clean`. Control (unmutated): steady **3/3** (18a 1/1 kept, 0 removals; 18b 151/151/151
px; 18c 3851 → 4611 px).

| # | File:line | Mutation | Run | Killed? |
| - | --------- | -------- | --- | ------- |
| U1 | `src/renderer/src/lib/diff-view.ts:587` | `return measured` (no hold) | vitest | ✅ Killed (2 failed: FSTD-02, FSTD-07/09) |
| U2 | `src/renderer/src/lib/diff-view.ts:587` | `last !== null ? last : measured` (hold regardless of pending) | vitest | ✅ Killed (1 failed: FSTD-03/04) |
| U3 | `src/renderer/src/lib/diff-view.ts:587` | `pending !== null ? (last ?? 0) : measured` | vitest | ✅ Killed (1 failed: first mount, FSTD-04) |
| U4 | `src/renderer/src/lib/diff-view.ts:587` | `Math.min(last, measured)` while pending (round 2's survivor) | vitest | ✅ **Killed** (1 failed: `expected 57 to be 180`, `diff-view.test.ts:966`) |
| U5 (new) | `src/renderer/src/lib/diff-view.ts:587` | `Math.max(last, measured)` while pending | vitest | ✅ Killed (2 failed: FSTD-02, FSTD-07/09) |
| N2 (new) | `src/renderer/src/components/DiffViewer.tsx:326` | `setHeight(tallest)`: the container gets the raw height, `onHeight` the held one | steady smoke | ✅ Killed (1/3: 18a 0/1 kept, 3 removals; 18b max 3875 px against 151) |
| N3 (new) | `src/renderer/src/components/DiffViewer.tsx:464` | `if (editor)`: a reading on every sides update, unchanged text included (FSTD-08) | full drive | ✅ Killed (124/126: FOLD-12, FOLD-16) |
| N1 (new) | `src/renderer/src/components/DiffViewer.tsx:327` | `onHeight?.(tallest)`: `onHeight` gets the raw height, the container the held one | steady smoke, full drive, probe | ❌ **Survived** (steady 3/3, full drive 126/126). Not equivalent, see below |

**Why N1 is not equivalent.** `onHeight` feeds `DiffSection`'s `height` state (`DiffSection.tsx:192`),
and that state is rendered only as the placeholder of a section without an editor (`:133`, `:198`). While
the section keeps its editor, the box follows the container, which N1 leaves held: that is why 18a/18b
pass. If the section loses its editor inside the pending window (the user scrolls, the window resizes,
the cap drops it), the placeholder takes whatever `onHeight` last received, and no release follows,
since the editor that would measure again is gone. Probe (scratchpad `probe-n1.mjs`, after
`SMOKE_ONLY=steady` opened the stack; window shrunk to 1266 x 300 by `Emulation.setDeviceMetricsOverride`
as soon as the rewritten text showed, about 590 ms after the write):

| Build | Before the write | 1.5 s after the shrink | Runs |
| ----- | ---------------- | ---------------------- | ---- |
| Unmutated | editor, box 151 px | no editor, placeholder **119 px**, box 150 px | 2, identical |
| N1 | editor, box 151 px | no editor, placeholder **3843 px**, box 3874 px | 2, identical |

Under N1 that section grows by 3724 px out of view, the jump the feature exists to stop, on the path the
spec names.

**Sensor depth**: lightweight (8 mutations: 5 unit, 3 e2e), plus round 2's B2 (killed) and M5 (equivalent: React batches the two height updates of one task, argued there)
**Result**: 7 killed, 1 survived (N1); the owner accepted N1 as a residual risk (see the decision at the top)

Isolation: the real tree's `git status --porcelain` was empty before the sensor and after cleanup. The
junction was deleted first, then the worktree removed; `git worktree list` shows only
`D:/playground-main`, `node_modules\electron` is intact, and no Electron process remains.

---

## Code Quality (round-2 fix: 5e4c9f7)

| Principle | Status |
| --------- | ------ |
| Minimum code: one assertion added to the existing FSTD-02 test, literal heights like its neighbours | ✅ |
| Surgical: production code untouched; besides the test, the commit carries only `.specs/` (round-2 report, tasks F3, lessons store) | ✅ |
| No scope creep | ✅ |
| Matches patterns: same `expect(reportedHeight(...)).toBe(...)` form as `diff-view.test.ts:965` | ✅ |
| Spec-anchored outcome check | ✅ FSTD-01/03/04/05/06; ❌ FSTD-02's `onHeight` output (Fix 1) |
| Per-layer Coverage Expectation: pure rule 1:1 (every branch, both sides of the held value); e2e covers FSTD-02's container, FSTD-03 and FSTD-05, not FSTD-02's `onHeight` | ⚠️ (Fix 1) |
| Every test maps to a requirement: 18a FSTD-05, 18b FSTD-02, 18c FSTD-03; the 4 unit tests are tagged | ✅ |
| Documented guidelines: none in the repo; strong defaults and the existing smoke conventions applied | ✅ |
| Privacy guardrail (public repo): `git diff main..HEAD` and commit metadata scanned; only fictitious fixtures, upstream issue numbers and the noreply author address | ✅ |

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (real tree at 5e4c9f7, exit 0)
- **typecheck**: node and web, 0 errors
- **lint**: ✖ 18 problems (0 errors, 18 warnings), equal to the baseline
- **Result**: 3172 passed, 0 failed, 0 skipped (143 files)
- **Test count before feature**: 3168; **after**: 3172; **delta**: +4 tests, none removed or weakened (F3 adds an assertion, not a test)
- **Smoke** (scratch, unmutated): steady 3/3

---

## Fix Plans

### Fix 1: FSTD-02's `onHeight` output is unguarded (surviving mutant N1)

- **Root cause**: `onHeight` is read only by the placeholder of a section without an editor, and no check
  drops the written section's editor while its folds are pending. 18b measures the box, which the
  container decides while the editor is there.
- **Fix task** (test only, `scripts/smoke-files-diff.mjs`, `steadySection`): a check 18d after 18b, with
  regions hidden. Record the written section's viewer height; arm an in-page `MutationObserver` promise
  that resolves when the next rewrite's text shows (`Runtime.evaluate` with `awaitPromise`); rewrite the
  file; as soon as it resolves, shrink the window with `Emulation.setDeviceMetricsOverride` (1266 x 300
  drops the section from the mount plan in this seed); after 1.5 s, expect the section's
  `.diff-section-hold` height to equal the recorded viewer height. Clear the override in `finally` and
  wait for the editor to come back before 18c.
- **Verify**: passes on HEAD (probe: 119 px); fails with `DiffViewer.tsx:327` mutated to
  `onHeight?.(tallest)` (probe: 3843 px). Full drive still passes.
- **Alternative** (owner decision): accept N1 as a recorded residual, since production is correct and
  the failure needs an unmount inside a ~200 ms window.
- **Priority**: Minor. No user-visible defect today; the gap is that nothing would catch a regression
  of an output the spec names.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FSTD-01 | Implementing (T1 done) | ✅ Verified |
| FSTD-02 | Implementing | ✅ Verified, `onHeight` output an accepted residual (N1, owner 2026-10-11) |
| FSTD-03 | Implementing (T4) | ✅ Verified |
| FSTD-04 | Implementing | ✅ Verified |
| FSTD-05 | Implementing | ✅ Verified |
| FSTD-06 | Implementing (T5: 2.00) | ✅ Verified |
| FSTD-07 | Implementing | ✅ Verified (rule unit plus inspection) |
| FSTD-08 | Implementing | ✅ Verified (N3 killed) |
| FSTD-09 | Implementing | ✅ Verified (rule unit plus inspection) |

`spec.md` updated after the owner's decision.

---

## Summary

**Overall**: ✅ Ready, by owner decision. After the last fix round one output the spec names (FSTD-02's
`onHeight`) has no discriminating test; the owner accepted it as a residual risk.

**Spec-anchored check**: 5/6 ACs fully matched; FSTD-02's `onHeight` output unguarded; 0 spec-precision gaps
**Sensor**: 7 killed (U1-U5, N2, N3), 1 survived (N1); earlier B2 killed, M5 equivalent
**Gate**: 3172 passed, 0 failed; typecheck 0; lint 0 errors / 18 warnings

**What works**: F3 kills U4; the rule is pinned on both sides of the held value; the container's hold,
the release after the folds and the neighbours' nodes are all guarded; the bench reads 2.00.

**Issues found**: N1. Add check 18d (Fix 1) or record N1 as an accepted residual.

**Next steps**: none for this feature; Fix 1 stays written up below if the residual is ever revisited.

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
