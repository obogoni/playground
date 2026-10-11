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
