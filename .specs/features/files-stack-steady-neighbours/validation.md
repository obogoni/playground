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
