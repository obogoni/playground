# Files Stack Steady Neighbours Validation

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
