# Rail Clock Paint: Measurement (RCLK-01..04)

**Verdict:** reproduced on the presented screen at the owner's real scale (1.25). Not visible to DevTools'
paint tracking. The specks depend on which glyphs the clock shows, which points at glyph rasterisation at a
fractional size, not at invalidation.

## Setup

- One monitor: 1920x1200 native, 1536x960 logical, so the device scale is **1.25**. The report was made there.
- Clock: `.rail-row-time`, JetBrains Mono 10.5px, `tabular-nums`: **13.125 device px**, a non-integer size.
- Row selected: background `oklab(0.708921 0.0636218 -0.145904 / 0.12)`, translucent over the rail.

## 1. What CDP sees (`scripts/measure-rail-clock.mjs`, throwaway profile)

| Scale | Box top (device px) | Ink top vs box top | Repaint on each tick |
| ----- | ------------------- | ------------------ | -------------------- |
| 1     | 234                 | 3 px **inside**    | whole layer (938x600) and a 893x169 strip from y=79 to the box bottom |
| 1.25  | 291.0               | 3.75 px **inside** | whole layer (1178x760 device px) |

The digits' ink sits inside the clock's box, and every tick repaints far more than the box. Nothing is left
unrepainted at raster level, so a stale-invalidation cause is overturned.

## 2. What the screen shows (`scripts/capture-screen-region.ps1` + `scripts/analyze-screen-frames.mjs`)

The owner's running app, the selected row in `working` with the loader spinning, captured in physical pixels
once a second. The region is 230x52; the digits' ink spans rows 21-30.

- **2 min (120 frames):** no pixel above row 21 ever strays from its usual colour. The only stray pixels are
  the digits and the loader's edge.
- **20 min (1200 frames):** two episodes.
  - Frames 701-741, during minute `01:27`: a 1 px dark dash, once with a light pixel, at rows 16-17,
    x 144-147, above the **ones** digit of the seconds, in alternate frames (`01:27:16` has it, `01:27:17`
    does not).
  - Frames 962-975, during `01:31:4x`: the same dash at rows 15-16, x 128-130, above the **tens** digit of
    the seconds, also in alternate frames.
- The box top falls at about row 17.25 of the frame, so the dashes sit **at or above the box's top edge**,
  4-6 device px above the ink, where no digit paints.

## Cause (inferred from the pattern, to be proven)

The dash comes and goes with the glyphs on screen: certain values, in certain minutes, and never the loader.
That fits glyph rasterisation at a fractional device size (13.125 px): the top edge of a glyph's quad
samples neighbouring texels of the glyph atlas. It does not fit invalidation, which section 1 shows to
cover everything.

## Next

A controlled experiment in a throwaway app at 1.25: render the clock statically with the values that
showed the dash, and every digit pair, and read the pixels from a CDP screenshot. If the dash is in the
raster, it appears there, and each candidate fix can be compared without waiting for an episode:

1. a font size that is a whole number of device px at 1.25 (10.4px gives 13);
2. `contain: paint` on the clock;
3. the clock in its own layer.

## SPEC_DEVIATION

RCLK-01 asked for 3 minutes at scales 1, 1.25 and 1.5 with Paint flashing and Layer borders. CDP ran at 1 and
1.25 (`LayerTree.layerPainted` instead of the visual overlays, so the rectangles are numbers, not pictures),
and the screen was captured only at 1.25, for 22 minutes. Reason: the defect lives on the presented screen,
which CDP cannot see, and the only screen available is the owner's single 1.25 monitor. A forced scale on
that monitor would not be the presentation the report came from.

## 3. Controlled probe: the raster is clean (`scripts/probe-rail-clock-glyphs.mjs`)

A throwaway app at 1.25, a real `working` row, the live clock hidden and a static copy in its place (same
class, same box). For each value, a CDP screenshot of the band between 4 px above the box and the ink top
(63x9 device px) is decoded in the page, and the pixels straying from their row's median are counted.

| Run | Values | With a stray pixel |
| --- | ------ | ------------------ |
| No change | 378: `01:27:00`-`01:27:59`, `01:31:00`-`01:31:59`, and 00-99 at each digit pair | **0** |
| Control: a 3x1 px black block drawn as the copy's background at (30, 1) | 378 | **378**, found at band row 6 |

The detector finds a 3x1 block every time, and finds nothing on any real value. Chromium rasterises every
value cleanly, including the two that showed the dash on screen.

## Cause and decision

- **Cause:** the dash is a defect of the **presented** screen, not of what the app or Chromium draws. It
  shows only on screen, in alternate frames. That is the signature of a two-buffer swap chain with partial
  presents keeping a stale pixel in one buffer. Inferred from the pattern, not proven.
- **GPU** (`SystemInfo.getInfo`): Intel Arc 130T, driver 32.0.101.8132, DirectComposition on, overlays
  supported (BGRA8 overlay: scaling).
- **Overturned:** stale invalidation (section 1); ink outside the box (section 1); glyph rasterisation at
  13.125 px (this section).
- **Decision (owner, 2026-10-11):** document and stop. No CSS change has a proven target, since the raster is
  already clean. A Chromium switch such as `--disable-direct-composition` would change the GPU path for the
  whole app, with no certainty it is the right one. RCLK-05..10 (repaint the clock cleanly) are not
  implemented. #173 stays open as a presentation defect outside the app's code.
