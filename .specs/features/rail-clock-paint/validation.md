# Rail Clock Paint Validation

## Validation: rail-clock-paint - PASS

**Date**: 2026-10-11
**Iteration**: 3 of 3 (final re-verification, against a4c6080)
**Spec**: `.specs/features/rail-clock-paint/spec.md`
**Measurement**: `.specs/features/rail-clock-paint/measurement.md`
**Diff range**: `origin/main..a4c6080` (7aeabf4, c4bb208, 727769f, 317da90, a4c6080)
**Verifier**: independent sub-agent (author != verifier), read-only over the real tree

Scope: a measurement-only feature that ended by the owner's decision. RCLK-05..10 (the fix) are deliberately not
implemented. This report checks that the record is honest and that RCLK-01..04 rest on raw evidence. The PASS means
exactly that: the measurement is honestly recorded, inside the repository and on #173. It does not mean the specks
are fixed; the cause is unknown and #173 stays open.

---

## 1. Diff surface: no app code changed

`git diff --name-only origin/main..a4c6080`, filtered of `scripts/` and `.specs/`, is empty. Changed files:
`.specs/features/rail-clock-paint/{spec,measurement}.md`, `scripts/analyze-screen-frames.mjs`,
`scripts/capture-screen-region.ps1`, `scripts/measure-rail-clock-stop.ps1`, `scripts/measure-rail-clock.mjs`,
`scripts/probe-rail-clock-glyphs.mjs`. Nothing under `src/`, no test, no `package.json`. `317da90..a4c6080` touches
only `measurement.md`.

## 2. Claims against raw data (re-derived)

| Claim | Where | Re-derived evidence | Outcome |
| ----- | ----- | ------------------- | ------- |
| 2 min: nothing strays above row 19; rows 19-20 the loader edge x 155-166; rows 21-31 digits and loader body x 155-170 | `measurement.md:36-38` | Re-ran `analyze-screen-frames.mjs rclk-real 24 5`: rows 0-18 all `.`; rows 19-20 strays at x 155-166; rows 21-31 digits plus loader columns | Confirmed |
| Episode 1: frames 701-741, 21 frames, rows 16-17, x 144-147, two light pixels | `measurement.md:40-41` | Re-ran `analyze-screen-frames.mjs rclk-long 24 200`: (146-147,16), (144-147,17), 21 frames; light pixels `136/156/142`, `165/156/142` at row 16 | Confirmed |
| Episode 2: frames 962-975, `01:31:44`-`01:31:58`, 8 frames, rows 15-16, x 128-130 | `measurement.md:42-43` | (128-130,15), (128-129,16), 8 frames; frame-0962 shows `:44`, frame-0975 `:58` | Confirmed |
| The dash follows the displayed second, even seconds; parity holds over skipped seconds | `measurement.md:44-46` | Zoomed frames: 708 `:23`, 709 `:25` clean; 710 `:26`, 730 `:46`, 731 `:48` dashed; 968 `:50`, 969 `:52` dashed; 967 `:49`, 970 `:53` clean | Confirmed |
| Box top about row 17.25; dash 4-6 px above the ink | `measurement.md:47-48` | Ink top row 21; ink 3.75 device px inside the box (`rclk-125.json` `inkAboveBoxDevicePx -3.75`) | Confirmed |
| Dark pixels `34,31,27` on `50,44,54`, deviation 27 vs 24 | `measurement.md:49-50` | frame-0701 x 144-147 row 17; frame-0962 x 128-130 row 15 | Confirmed |
| CDP at 1.25: box top 291.0, whole layer 1178x760, 10 times over 7 ticks | `measurement.md:22` | `rclk-125.json`: `boxTopDevicePx 291.00`, `"0,0,1178x760": 10`, ticks `00:00:06`->`00:00:13` | Confirmed |
| Scale-1 numbers, run lengths, earlier script version | `measurement.md:21`, `measurement.md:27-29` | No raw artifact for scale 1; the record says so | Disclosed |
| Probe, no change: 0 of 378 | `measurement.md:61` | `probe-base.json`: `hitCount 0`, `values 378`, band `63x9` | Confirmed |
| Control, black: 378 of 378 at band row 6 | `measurement.md:62` | `probe-control.json`: 378 hits, 378 distinct texts, row 6, x 37-40 | Confirmed |
| Control, `rgb(34, 31, 27)`: 378 of 378 at band row 6 | `measurement.md:63` | `probe-control-dim.json`: `hitCount 378`, 378 distinct texts incl. `01:27:16` and `01:31:44`, row 6, x 37-39 | Confirmed |
| The 378 values: seconds 00-99, minutes 00-59, hours 00-99 | `measurement.md:65-66` | `scripts/probe-rail-clock-glyphs.mjs:39-45`, `d % 60` at `:43`; 120 + 100 + 59 + 99 = 378 | Confirmed |
| Colour, not contrast; background not recorded | `measurement.md:68-70` | `probe-control-dim.json` holds positions only, no pixel values | Accurate |
| 22 minutes on screen | `measurement.md:94` | File times 08:19:48-08:21:52 and 08:25:36-08:46:19 | Confirmed |
| #173 carries the corrected cause | `spec.md:105` | `gh issue view 173 -R obogoni/playground`: comment 6108938226 (2026-10-11T12:18:09Z), "Correction: the cause is unknown" | Confirmed (section 4) |

## 3. Spec-anchored acceptance criteria (RCLK-01..04)

| Req | Spec-defined outcome | Evidence | Outcome |
| --- | -------------------- | -------- | ------- |
| RCLK-01 | >= 3 min at scales 1, 1.25, 1.5, Paint flashing and Layer borders (`spec.md:51`) | Screen at 1.25 for 22 min (`measurement.md:31-50`, raw frames); CDP `layerPainted` at 1 and 1.25 for seconds (`measurement.md:27`); SPEC_DEVIATION `measurement.md:91-97` states the overlays, the seconds-long runs and the dropped 1.5 | ✅ Verified with recorded deviation |
| RCLK-02 | Per scale: specks, loader dependency, invalidated rectangle (`spec.md:52`) | 1.25 specks and rectangles backed by raw data; scale 1 disclosed unarchived (`measurement.md:27-29`); loader question unanswered and recorded (`measurement.md:98-99`); status Partial (`spec.md:89`) | ✅ Partial, honestly recorded |
| RCLK-03 | Result posted on #173 and written to `.specs/features/rail-clock-paint/` before any code change (`spec.md:53`) | `measurement.md`; #173 comments 6108725004, 6108791869 and the correction 6108938226; no code change in the diff | ✅ Verified |
| RCLK-04 | IF none reproduces THEN stop with no code change (`spec.md:54`) | Reproduced at 1.25, condition not met; stopped by decision (`measurement.md:101-106`); `spec.md:91` N/A | ✅ N/A, not violated |

RCLK-05..10: `spec.md:92-97` "Not implemented: cause unknown, no proven target", consistent with
`measurement.md:101-106`. Honestly recorded. Success criteria at `spec.md:105-106` match the state: #173 carries the
measurement with the cause unknown; "no specks" is unchecked and marked not attempted.

## 4. #173 correction comment (6108938226)

| Required by iteration 2 | In the comment | Outcome |
| ----------------------- | -------------- | ------- |
| Cause unknown | Heading "Correction: the cause is unknown"; "This issue stays open with the cause unknown" | ✅ |
| Dash follows the displayed even second, with frame examples | `:23`/`:25` clean, `:26`, `:46`, `:48` dashed; `:50`, `:52` dashed, `:49`, `:53` clean (matches the frames re-derived in section 2) | ✅ |
| "Alternate frames" withdrawn | "\"In alternate frames\" was wrong." | ✅ |
| Swap chain weakened; "comes from presentation" withdrawn | "weakened, not supported"; "The heading ... overstated it." | ✅ |
| Dim control 378/378 | "`rgb(34, 31, 27)`, is found in 378 of 378 values" | ✅ |
| Probe scoped | "It does not show what the live instance presented at the moment of a dash." | ✅ |

The first comment's glyph claim was already overturned by the second comment, and the correction restates the scope
("rules out the glyphs as Chromium rasterises them in a static copy"). The public record now agrees with
`measurement.md:3-7` and `measurement.md:75-87`.

## 5. Inference flagged as inference

| Sentence | Where | Finding |
| -------- | ----- | ------- |
| Verdict: glyphs overturned "as far as a CDP screenshot of a static copy can show it"; cause **unknown** | `measurement.md:3-7` | ✅ Hedged, matches the body |
| Overturned / Weakened / Open | `measurement.md:77-87` | ✅ Weakened and open hypotheses labelled; "Neither was tested" |
| Probe scope | `measurement.md:68-73` | ✅ Colour vs contrast stated; what the probe does not show stated |

No overclaim remains.

## 6. Scripts (read-only)

- `npx eslint` on `analyze-screen-frames.mjs`, `probe-rail-clock-glyphs.mjs`, `measure-rail-clock.mjs`: exit 0.
  `npx eslint .` exit 0; `npm run typecheck` exit 0 (at 317da90; a4c6080 changes only `measurement.md`). Tests:
  143 files / 3162 passed; no `src/` or test file changed in the feature.
- `scripts/measure-rail-clock-stop.ps1:7-11`: candidates are `electron.exe` and `node.exe` whose command line
  `.Contains` the marker (literal); roots exclude `--type=` children; `taskkill /T` per root; `:13-15` re-count by
  marker. Only processes holding the marker are roots. ASCII, LF, parses with 0 errors.
- `scripts/measure-rail-clock.mjs:215-222`: compares in device px; the layer-origin assumption is stated.
- `scripts/probe-rail-clock-glyphs.mjs:158-189`, `:237-244`, and `scripts/analyze-screen-frames.mjs:26-62`: no defect
  that changes a reported count.

## 7. Discrimination sensor and control

**Control geometry.** Box top 232.80 CSS at dpr 1.25: band origin 228.80 CSS = 286.00 device; block at box top + 1 =
292.25-293.50 device, band rows 6.25-7.50; `bandRows = floor(7 x 1.25) - 1 = 7` keeps rows 0-6. Both controls land in
row 6. x 37.5-41.25: black hits 37-40, dim hits 37-39.

**Analyzer mutations** (scratch copies, `git status --porcelain` of the real tree unchanged before and after;
the analyzer is unchanged since):

| Mutation | File:line (copy of) | Description | Episodes found | Killed? |
| -------- | ------------------- | ----------- | -------------- | ------- |
| M1 | `scripts/analyze-screen-frames.mjs:47` | `Math.max` -> `Math.min` | episode 2 gone | ✅ Killed |
| M2 | `scripts/analyze-screen-frames.mjs:47` | `> threshold` -> `> threshold + 4` | episode 2 gone | ✅ Killed |
| M3 | `scripts/analyze-screen-frames.mjs:60` | mode -> second most common colour | every stable pixel flagged | ✅ Killed |

Sensor depth: lightweight, 3/3 killed.

## 8. Gap history

| Iteration | Gaps | Status at a4c6080 |
| --------- | ---- | ----------------- |
| 1 | Stale verdict; RCLK-02 loader clause; Chromium overclaim; alternate frames; black-only control; RCLK-01 reason; unarchived scale 1; probe wording; script caveats; bookkeeping | ✅ All resolved (317da90) |
| 2 | #173 carries the withdrawn cause | ✅ Resolved: comment 6108938226 |
| 2 | Verdict hedge; colour vs contrast; `01:31:4x`; loader body | ✅ Resolved: `measurement.md:5-6`, `measurement.md:68-70`, `measurement.md:42`, `measurement.md:37-38` |
| 1-3 | No AD in `.specs/STATE.md` | Accepted: feature-scoped decision, recorded at `measurement.md:101-106` and `spec.md:88-99` |

Non-blocking note: `measurement.md:42` and `measurement.md:68-70` are wrapped unevenly (one long line, one short).
Cosmetic, no effect on content.

## Summary

**Overall**: ✅ Ready (measurement recorded honestly; fix not implemented by the owner's decision)

**Spec-anchored check**: RCLK-01 verified with deviation, RCLK-02 partial and recorded, RCLK-03 verified, RCLK-04 N/A;
RCLK-05..10 honestly not implemented
**Sensor**: 3/3 mutations killed; both probe controls at band row 6, matching the geometry
**Gate**: typecheck and eslint exit 0; tests 3162 passed, no `src/` change
