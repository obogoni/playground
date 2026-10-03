# Terminal Last Row Validation

**Date**: 2026-10-03
**Spec**: `.specs/features/terminal-last-row/spec.md` (TROW-01..11)
**Diff range**: `6d96ae4..a7b6538` (`git diff 6d96ae4..HEAD`)
**Verifier**: independent sub-agent (author ≠ verifier), one round, owner rules for this round applied (smoke-only gaps are follow-ups; at most 5 smoke mutants)

## Validation: terminal-last-row — PASS

No production defect found, and every acceptance criterion has evidence. Every layout AC is backed by a CDP smoke check that was re-run here on HEAD (26/26) and seen failing under a mutant. The helper's unit tests kill all 9 unit mutants. The gaps below are evidence gaps and spec-precision notes, recorded as follow-ups.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 Measure on the current build | ✅ Done | Stop rule evaluated, no condition holds (`design.md` §Measured (T1)) |
| T2 Host with no vertical padding | ✅ Done | Ctrl+click hand check left to the owner (see TROW-08) |
| T3 `dpr` smoke section | ✅ Done | Route A |
| T4 `watchDevicePixelRatio` | ✅ Done | 5 unit tests |
| T5 Refit on scale change | ✅ Done | Full smoke 26/26 (author), re-run here 26/26 |

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`
- **Exit code**: 0. Typecheck clean. Lint shows 0 errors and 18 warnings, all in files outside the diff (`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`). `prettier --check` passes on all 5 changed source files.
- **Tests**: 120 files, **2513 passed**, 0 failed, 0 skipped (one run, no flake seen)
- **Test count before feature**: 2508 (tasks.md baseline B)
- **Test count after feature**: 2513
- **Delta**: +5 (`src/renderer/src/lib/device-pixel-ratio.test.ts`)
- **Smoke (manual)**: `scripts/smoke-terminal-rows.mjs`, full run on HEAD, fresh seed, port 9333: `26/26 checks passed`, exit 0
- **TROW-06**: `git diff 6d96ae4..HEAD --stat -- src/main src/preload` is empty

---

## Spec-Anchored Acceptance Criteria

Evidence for layout ACs is the CDP smoke (`scripts/smoke-terminal-rows.mjs`). By project convention renderer components have no unit tests (`.specs/codebase/TESTING.md`). The smoke reads the WebGL renderer as follows. The cell comes from the pane's font, measured in the page the way xterm measures it (`smoke-terminal-rows.mjs:224-230`). A guard requires the screen's style size to equal `round(rows × h)` and `round(cols × w)` exactly at every probe (`:284`, `:367-374`). The program's size comes from the fill script's `ROWS=` marker in the session stream (`:301-305`). A probe settles only when the terminal and the marker agree (`:330-341`). An unsettled probe fails the geometry guard and TROW-05.

### P1: The last row is fully visible at every height

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 host: no vertical padding or border, `padding: 0 10px`, `border-box`, inside a pane with `padding: 8px 0` | structural | `TerminalPane.css:11` `padding: 8px 0`; `:21-28` `.terminal-host { height: 100%; padding: 0 10px; box-sizing: border-box }`; `TerminalPane.tsx:181` `term.open(host)`; `:622-626` markup. Smoke `look` `:570-580` host content box inset `near(8/10/8/10)` | ✅ PASS (code + smoke) |
| AC2 ResizeObserver observes the host | structural | `TerminalPane.tsx:476-477` `observer.observe(host)` | ✅ PASS (code; behaviourally equivalent to observing the pane, which always has the same height) |
| AC3 rows = ⌊⌊H⌋ / h⌋ (0.5 px tolerance at non-integer DPR) | exact count | `smoke-terminal-rows.mjs:357-360` `fitRows = floor(floor(c)/h)`, `rowsOk`; check `:432-437` `!rowsOk(p, p.rows)` over 60 probes (DPR 1 ×20 covering all 16 remainders, 1.25 ×20, 1.5 ×20) | ✅ PASS (seen failing on the pre-fix build, 60/60, and under M1) |
| AC4 last row's bottom ≤ visible bottom + 0.5 | ≤ 0.5 px | `:260-266` visible box (viewport ∩ padding box of each clipping ancestor); `:286` `lastBottom = screen.top + rows × h`; `:361` `lastBottom <= visible.bottom + TOL`; check `:438-443` | ✅ PASS (pre-fix 33/60 fail; M1 fails) |
| AC5 last column's right ≤ visible right + 0.5 | ≤ 0.5 px | `:362`; checks `:444-449` (rows), `:552-557` (cols) | ✅ PASS (M8 fails it) |
| AC6 columns equal the current build's at the same viewport | equal to the baseline | `:538-543` `base.cols[key(p)] !== p.cols` over 36 viewports; cell-width drift guard `:529-537`; baseline `%TEMP%/playground-smoke-rows-cols.json`, recorded on the pre-fix build (07:04, not rewritten) | ✅ PASS (M7 fails it: 115 vs 118) |

### P1: The agent is told the real size

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 refit sends `session:resize` with new cols/rows | the program sees the new size | `TerminalPane.tsx:471-474` (unchanged `sendResize`); end to end: `smoke-terminal-rows.mjs:450-455` `!settled \|\| !rowsOk(p, ptyRows) \|\| ptyCols !== cols` | ✅ PASS (V-S3, a scale refit without `session:resize`, fails TROW-09 8/8) |
| AC2 the program reads the terminal's rows and cols | equal | same check, plus `:546-551` (cols) | ✅ PASS |
| AC3 main resize path unchanged | empty diff | `git diff 6d96ae4..HEAD --stat -- src/main src/preload` → empty | ✅ PASS |

### P1: The pane looks as it does today

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 box inset 8/10/8/10 | ±0.5 px | `:570-580` `near(inset.top, 8)` … `near(inset.left, 10)`; readings equal T1's pre-fix readings | ✅ PASS (M3 fails it) |
| AC2 first row at (10, 8) | ±0.5 px | `:581-586` `near(origin.left, 10) && near(origin.top, 8)` | ✅ PASS (M3 fails it) |
| AC3 chip at right 14 / top 10 | ±0.5 px | `:587-592`; `TerminalPane.tsx:147` `container.appendChild(chip)` | ✅ PASS (M2x fails it; M2 is equivalent because the host is not positioned) |
| AC4 right-click, Ctrl+click, drop in the padding behave as today | behaviour as today | Code: every gesture listener is still on the pane (`TerminalPane.tsx:360-361`, `:580-583`), with removal unchanged (`:592-600`). Author: right-click paste and copy and a file drop driven over CDP at 4 px inside the **left** padding (tasks.md T2 Status; scratch, not committed). Verifier: a listener-placement probe (scratch) puts synthetic `contextmenu` and `dragover` on the element under each padding band. On HEAD the pane's listeners prevent both in the top, bottom, left and right bands, and a control point outside the pane is not prevented. It fails in the top and bottom bands under V-G1, which moves those listeners onto the host | ✅ PASS, evidence thin: see Follow-ups 1 and 2 |

### P2: Refit on a display scale change

| Criterion | Spec-defined outcome | `file:line` + assertion | Outcome |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 on a DPR change: refit + `session:resize` after xterm re-measured, host CSS size unchanged | rows fit the new cell | `TerminalPane.tsx:481-485`; smoke `dpr` `:633` `holds` and `:636-641` (step 1, 8 heights). Guards `:615-631` show the page really sees each ratio | ✅ PASS (M4 fails 8/8. V-S2, a synchronous refit with no frame, fails 7/8 with stale rows, so the one-frame ordering is required and the check detects its absence) |
| AC2 refit after every later change (re-arm) | as AC1 | `device-pixel-ratio.ts:13-21`; unit `device-pixel-ratio.test.ts:77-86` `armed(queries)` equals exactly the new query after each of 1.5, 2, 1 and `calls` equals `[1.5, 2, 1]`; smoke `:642-647` (24 later steps) | ✅ PASS (M5 fails 2 unit tests and the smoke, 6/24) |
| AC3 unmount removes the listener; no refit afterwards | no listener, no call | `TerminalPane.tsx:611-612` `stopDpr(); cancelAnimationFrame(dprFrame)`; unit `:88-97` and `:99-108` (`armed` empty, no call after dispose, re-armed query disposed); smoke `:697-701` `refits === 1` after 3 session switches | ✅ PASS (M6 and V-U4 killed in unit tests; M9 schedules 14 refits) |
| AC4 after a scale change, P1 AC3/AC4 hold | as P1 | `:633` `holds` = `rowsOk && lastRowInside && settled && rowsOk(ptyRows)` | ✅ PASS |

**Status**: ✅ All ACs have evidence. ⚠️ 2 spec-precision gaps are flagged below.

---

## Edge Cases

- [x] Exact multiple of the cell: covered by TROW-02 at the remainder-0 probes (remainder guard `:404-411`, 16/16). ⚠️ The "bottom equals the host's bottom within 0.5 px" part is not asserted (spec-precision gap 1).
- [x] Leftover one px short of a cell: no extra row. The remainder-15 probes (vh 600 and 616 at DPR 1) pass TROW-02.
- [~] Fast drag: not exercised. Every probe waits for the pane to settle. Code read: refits still come only from the observer's last delivery, a path this feature does not change (Follow-up 3).
- [x] Session switch: the `dpr` section switches sessions 3 times, then checks the fit (`:692-696`), exactly one refit (`:697-701`) and no console error (`:702-706`).
- [~] Scale change while no terminal is mounted: no direct check. Code read: the mount path fits with the current ratio (`TerminalPane.tsx:181-186`, `:475`), with no listener involved (Follow-up 3).
- [~] Scale and size change in the same frame (browser zoom): no kept probe covers it. The warm-up probes do change both at once, but they are discarded. Code read: the frame-deferred refit runs after the observer's (Follow-up 3).

---

## Discrimination Sensor

Every mutant went through a scratch runner: anchor count 1, `.orig` kept and restored in `finally`, `git status --porcelain` unchanged afterwards (confirmed for every run). The app ran on port 9333 only, on throwaway seeds that were deleted afterwards.

### Unit mutants on `src/renderer/src/lib/device-pixel-ratio.ts` (uncapped)

| Mutant | Change | Killed? |
| ------ | ------ | ------- |
| V-U1 (= author M5) | no re-arm after a change | ✅ 2/5 fail |
| V-U2 (= author M6) | dispose does nothing | ✅ 2/5 fail |
| V-U3 | re-arm but keep the old listener | ✅ 3/5 fail |
| V-U4 | dispose removes the first query's listener, not the current one | ✅ 1/5 fail |
| V-U5 | callback gets `Math.round(ratio)` | ✅ 3/5 fail |
| V-U6 | callback never called | ✅ 3/5 fail |
| V-U7 | query string `…x)` instead of `…dppx)` | ✅ 4/5 fail |
| V-U8 | query armed on the rounded ratio | ✅ 3/5 fail |
| V-U9 | callback before the re-arm, and the re-arm skipped at ratio 1 | ✅ 1/5 fail |

### Smoke mutants (4 of the 5 allowed; the author's M1-M10 not repeated)

| Mutant | Target | Section | Killed? |
| ------ | ------ | ------- | ------- |
| V-S1 host height from content | `TerminalPane.css:22` `height: 100%` → `auto` | `rows` | ✅ killed by 3 guards (remainders 1/16, content height frozen at 384 px, rows never change). TROW-02..05 **pass** (see spec-precision gap 2) |
| V-S2 synchronous scale refit | `TerminalPane.tsx:484` `requestAnimationFrame(sendResize)` → `sendResize()` | `dpr` | ✅ TROW-09 7/8, TROW-10 8/24 fail with stale rows |
| V-S3 scale refit without `session:resize` | `:484` → `requestAnimationFrame(() => fit.fit())` | `dpr` | ✅ TROW-09 8/8, TROW-10 16/24 (program rows stale), geometry guard unsettled 24/40 |
| V-G1 gesture listeners on the host | `:581-582` `contextmenu`, `dragover` on `host` | listener probe (scratch) | ✅ top and bottom bands fail; **left and right bands pass** (Follow-up 1) |

**Sensor depth**: lightweight plus (9 unit and 4 app mutants, on top of the author's M1-M10).
**Sensor tally**: 13/13 killed.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code: one wrapper div, one CSS rule, one 25-line helper | ✅ |
| Surgical changes: only `term.open`, `observer.observe`, the scale watcher and cleanup changed; chip and listeners untouched | ✅ |
| No scope creep: dead scrollbar CSS left alone, as the spec says | ✅ |
| Matches patterns: injected-fake helper test (TESTING.md pattern 3), smoke follows the repo's smoke conventions | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ✅ (2 precision gaps flagged) |
| Per-layer coverage: helper all branches 1:1 to TROW-09/10; component by smoke | ✅ |
| Every test maps to a spec requirement | ✅ (5 unit tests tagged TROW-09/10; every smoke check named by TROW id or guard) |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, `vitest.config.ts`, L-009 (literal query strings in the unit tests) | ✅ |

Production review notes: the cleanup order is right (`stopDpr()` and `cancelAnimationFrame` before `term.dispose()`), so no frame-deferred `fit()` reaches a disposed terminal. The `.terminal-pane .xterm-viewport` rules and `smoke-agent.mjs` use descendant selectors, which still match after the split. AD-054 is recorded in `.specs/STATE.md`.

---

## Follow-ups (not FAIL causes under this round's rules)

1. **The TROW-08 hand check could not catch misplaced listeners.** The author drove the gestures at 4 px inside the left padding. On the fixed build that band belongs to `.terminal-host`, so listeners moved onto the host still pass there (V-G1: left and right pass, top and bottom fail). The owner's hand check should right-click, Ctrl+click and drop in the **top or bottom** 8 px band.
2. **Ctrl+click was not run by anyone.** It opens files through the OS. Its capture `mousedown`/`mouseup` listeners are on the pane (`TerminalPane.tsx:360-361`), and the verifier's probe shows that events in every padding band pass through the pane. The owner's hand check remains open.
3. **No kept probe covers three edge cases**: a fast drag (a burst of resizes with no settle in between), a scale change while no pane is mounted, and a scale change plus resize in one frame (zoom). The evidence for all three is code reading. A burst probe and a zoom probe (DPR and height in one override, kept rather than discarded) would close them.
4. **True DPR 1 is not exercised.** CDP hands the page a float32 ratio of 1.0000000298, so the "DPR 1" sweep runs with a 16 px device cell, not 15. Same model, but a real 100% display is never probed. A short real-window spot check by the owner would cover it.
5. **AC2 (observer on the host) is code-only.** Observing the pane instead would be behaviourally equivalent, so no smoke check could tell them apart. Acceptable for a structural AC.

## Spec-Precision Gaps

1. **Edge case 1 vs P1 AC3**: the edge case asks for the last row's bottom to "equal the host's bottom, within 0.5 px" when the content height is an exact multiple of the cell. AC3 floors H (⌊⌊H⌋ / h⌋), and the measured content heights are fractional (for example c = 400.7 at h = 16 gives 25 rows = 400 px, 0.7 px short). The tolerance cannot hold, and the smoke does not assert it. The spec should state the edge case against ⌊H⌋ or widen it to under 1 px.
2. **P1 AC3/AC4 are anchored to the host's own height, and AC1 does not require the host to fill the pane.** A host whose height follows its content (V-S1) satisfies AC3 and AC4 literally, because the rows fit a frozen host. Only the smoke's guards (and the `look` bottom inset) catch it. The design states "the host fills the pane's content box", but the spec does not.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| TROW-01 | Done (T2) | ✅ Verified |
| TROW-02 | Done (T1, T2) | ✅ Verified (precision gap 1 on the edge case) |
| TROW-03 | Done (T1, T2) | ✅ Verified |
| TROW-04 | Done (T1, T2) | ✅ Verified |
| TROW-05 | Done (T1, T2) | ✅ Verified |
| TROW-06 | Done (T2) | ✅ Verified |
| TROW-07 | Done (T1, T2) | ✅ Verified |
| TROW-08 | Done (T2, Ctrl+click owner) | ✅ Verified for listener placement; owner hand check (Ctrl+click, top/bottom band) pending |
| TROW-09 | Done (T3, T4, T5) | ✅ Verified |
| TROW-10 | Done (T3, T4, T5) | ✅ Verified |
| TROW-11 | Done (T1, T2) | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready (owner hand check of TROW-08 still open)

**Spec-anchored check**: all ACs have evidence; 2 spec-precision gaps
**Sensor**: 13/13 killed (9 unit, 4 app)
**Gate**: 2513 passed, 0 failed; smoke 26/26

**What works**: rows fit the host at every probed height and scale; the PTY gets the same size; columns, insets, text origin and chip position are unchanged; the scale watcher refits after every change and dies with the pane.

**Issues found**: none in production code. Evidence gaps are listed in Follow-ups 1-5.

**Next steps**: the owner's hand check of right-click, Ctrl+click and drop in the top or bottom padding band; optionally tighten the two spec sentences.
