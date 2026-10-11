# Rail Clock Paint: Measurement (RCLK-01..04)

**Verdict:** reproduced on the presented screen at the owner's real scale (1.25). The dash follows the value
the clock shows, appearing on even seconds within some minutes. It does not show in DevTools' paint
tracking, nor in CDP screenshots of a static copy of the clock, even with the values that showed it on
screen. Invalidation and ink outside the box are overturned; the rasterised glyphs are too, as far as a CDP
screenshot of a static copy can show it. The cause is **unknown**.

## Setup

- One monitor: 1920x1200 native, 1536x960 logical, so the device scale is **1.25**. The report was made there.
- Clock: `.rail-row-time`, JetBrains Mono 10.5px, `tabular-nums`: **13.125 device px**, a non-integer size.
- Row selected: background `oklab(0.708921 0.0636218 -0.145904 / 0.12)`, translucent over the rail.
- GPU (`SystemInfo.getInfo`): Intel Arc 130T, driver 32.0.101.8132, DirectComposition on, overlays supported
  (BGRA8 overlay: scaling).

## 1. What CDP sees (`scripts/measure-rail-clock.mjs`, throwaway profile)

| Scale | Box top (device px) | Ink top vs box top | Repaint while the clock ticks |
| ----- | ------------------- | ------------------ | ----------------------------- |
| 1     | 234                 | 3 px **inside**    | whole layer (938x600) and a 893x169 strip from y=79 to the box bottom |
| 1.25  | 291.0               | 3.75 px **inside** | whole layer (1178x760 device px), 10 times over 7 ticks |

The digits' ink sits inside the clock's box, and each tick repaints far more than the box: stale
invalidation is overturned.

The runs lasted seconds (8 s at scale 1, 7 s at 1.25), not minutes. The scale-1 numbers come from the
console output of an earlier version of the script and were not archived. The 1.25 run's JSON lives in the
session's scratchpad (`rclk-125.json`), also from that earlier version.

## 2. What the screen shows (`scripts/capture-screen-region.ps1` + `scripts/analyze-screen-frames.mjs`)

The owner's running app, the selected row in `working` with the loader spinning, captured in physical pixels
once a second. The region is 230x52, and the digits' ink spans rows 21-30.

- **2 min (120 frames):** no pixel above row 19 ever strays from its usual colour. The stray pixels in rows
  19-20 are the loader's edge (x 155-166); in rows 21-31 they are the digits and the loader's body
  (x 155-170).
- **20 min (1200 frames):** two episodes.
  - Frames 701-741, during minute `01:27`, 21 frames: a 1 px dark dash at rows 16-17, x 144-147, above the
    **ones** digit of the seconds, with two light pixels.
  - Frames 962-975, during `01:31:44`-`01:31:58`, 8 frames: the same dash at rows 15-16, x 128-130, above the **tens**
    digit of the seconds.
- **The dash follows the displayed second, not the frame order.** It is on even seconds. Where the 1 Hz
  capture skipped a second, the parity still held: frame 708 (`:23`) and 709 (`:25`) are both clean, frame
  710 (`:26`) has it, and frames 730 (`:46`) and 731 (`:48`) both have it.
- The box top falls at about row 17.25 of the frame, so the dashes sit **at or above the box's top edge**,
  4-6 device px above the ink, where no digit paints.
- The dark pixels read `34,31,27` on a `50,44,54` background, a deviation of 27 against the analyzer's
  threshold of 24.

## 3. Controlled probe (`scripts/probe-rail-clock-glyphs.mjs`)

A throwaway app at 1.25, with a real `working` row. The live clock is hidden and a static copy takes its place
(same class, same box). For each value, the probe takes a CDP screenshot of the band from 4 px above the box
down to the ink top (63x9 device px), decodes it in the page, and counts the pixels straying from their row's
median.

| Run | Values | With a stray pixel |
| --- | ------ | ------------------ |
| No change | 378 (see below) | **0** |
| Control: a 3x1 px **black** block drawn as the copy's background at (30, 1) | 378 | **378**, at band row 6 |
| Control: the same block in the real dash's colour, `rgb(34, 31, 27)` | 378 | **378**, at band row 6 |

The 378 values are `01:27:00`-`01:27:59` and `01:31:00`-`01:31:59`, plus 00-99 in the seconds, 00-59 in the
minutes and 00-99 in the hours, each with the other fields at zero.

The detector finds a block in the dash's own colour every time. Its contrast in the probe equals the
screen's only if the probe's background matches the screen's `50,44,54`; the probe does not record that
background. It finds nothing on any real value,
including `01:27:16` and `01:31:44`, which showed the dash on screen. What this shows: a CDP screenshot of a
static copy in a throwaway instance is clean. It does not show what the owner's instance presented at the
moment of a dash.

## Cause: unknown

- **Overturned:**
  - stale invalidation (section 1);
  - ink outside the box (section 1);
  - glyphs rasterised wrongly at 13.125 px, as far as a CDP screenshot of a static copy can show it
    (section 3).
- **Weakened:** a stale pixel kept by one buffer of a two-buffer swap chain. That would alternate at the
  frame rate, and the loader beside the clock animates continuously. The dash follows the displayed second
  instead.
- **Open:** something between the raster and the screen that depends on the clock's content: the
  DirectComposition presentation on this GPU and driver, or a raster path that differs between the live
  clock and the static copy. Neither was tested.

## SPEC_DEVIATION

- **RCLK-01** asked for 3 minutes at scales 1, 1.25 and 1.5, with Paint flashing and Layer borders.
  - CDP ran at 1 and 1.25 only, for seconds, and used `LayerTree.layerPainted`. The rectangles are numbers,
    not overlays.
  - The screen was captured only at 1.25, for 22 minutes, on the owner's real instance. That anchors the
    capture on the presentation the report came from.
  - Scale 1.5 was not run. A forced-scale throwaway window could have been captured the same way, but it
    was dropped once section 3 moved the question away from scale.
- **RCLK-02**'s question "whether they need the loader to be spinning" was not answered: the loader spun in
  every capture.

## Decision

The owner decided on 2026-10-11 to document and stop. No CSS change has a proven target. A Chromium switch
such as `--disable-direct-composition` would change the GPU path for the whole app, with no certainty it is
the right one. RCLK-05..10 (repaint the clock cleanly) are not implemented. #173 stays open, with the cause
unknown.
