# Files Stack Steady Neighbours Specification

## Problem Statement

In the Files view's All changes stack (Uncommitted mode), when an agent rewrites one listed file, the
sections next to it lose their diff editor and get it back about 220 ms later, on every watch batch.
Each return mounts a new editor and re-reads both sides of a file that did not change: the neighbouring
diffs flicker, and every write costs extra `git cat-file` processes. Upstream issue #167 is the
owner-approved scope; #150's bench edit loop is its measurement, and its target "untouched sections
stay" (at most 2 `cat-file` per `files:changed`) still reads FAIL at about 6.3-8.3 per batch.

The suspected cause, from the code: `setValue` on the written section wipes the decorations Monaco
keeps its folds in (`DiffViewer.tsx`, FOLD-02..08), so until the diff is recomputed every unchanged
region is revealed and the fitted editor reports the whole file's height. The section grows for a
moment, pushes its neighbours past the stack's 600 px `NEAR_VIEWPORT` margin, and `mountPlan`, asked
with nothing already mounted, drops their editors at once.

## Goals

- [ ] The cause is measured before any fix: the written section's reported heights over one re-read
- [ ] A section whose file did not change keeps its editor across a watch batch that re-reads a neighbour
- [ ] The #150 bench edit run reads at most 2 `cat-file` per `files:changed` over its steady rows

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Hysteresis or a grace delay in `mountPlan` / the stack's observer | Owner decision 2026-10-11: fix at the source; `mountPlan` stays stateless and derived (FDIF-22) |
| Changing `NEAR_VIEWPORT`, `LIVE_EDITOR_CAP` or the observer | Not named by #167; the margin is right once heights stop jumping |
| The fold-preserving update itself (`readingBeforeUpdate`, `foldPlan`) | FOLD-02..09 hold today; this feature only stops the transient height leaking out |
| The written section's own re-read (one per batch) | Designed by #150 (FWIG-25); it is the 2 `cat-file` the target allows |
| Single-file diff tabs (`DiffTab`) | Not fitted to content (`fitContent` off); their height never moves the stack |
| Changing the bench's existing columns or targets | #147 and #150 own them |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Where the fix lives | `DiffViewer` holds the last height it reported while a fold reading is pending (new text set, diff not yet recomputed), for both its own container and `onHeight` | Owner decision 2026-10-11 ("na origem"); the transient height is born there, and holding it also stops the written section's own flicker | owner confirmed 2026-10-11 |
| Measurement gates the fix | If the measurement shows no height excursion on the written section, stop before T2 and bring the finding back to the owner | Issue #167, Done when: "confirm or overturn the cause above" | owner confirmed 2026-10-11 |
| How the measurement is taken | Read-only CDP on a built app (`ResizeObserver` on the written section plus a sample of the neighbours' editor nodes), during `bench-sessions.mjs --sessions 0 --files-view --edit-interval 1000` in a 1266 x 715 window | Same window and loop as the issue's evidence, so before and after compare | n |
| What "keeps its editor" means | The neighbour's `.monaco-diff-editor` DOM node is the same node before and after the batch | A remount builds a new node; the node is what the user sees flicker | n |
| A diff that never recomputes | The held height stays until the next `onDidUpdateDiff` with computed changes | Monaco always answers, quitting early on a long computation; a frozen height is a visual issue, not a lost change | n |
| A re-read whose text did not move | No hold: nothing was set, so no fold reading is pending, as today | `readingBeforeUpdate` is only taken when a side's text changes | n |
| Where the measurements live | A `## Measurements` section in this feature's `validation.md`, before and after, each run with its commit | Same place #147 and #150 keep theirs | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Neighbours keep their editor ⭐ MVP

**User Story**: As a reader of the All changes stack while an agent edits one file, I want the other
diffs to stay put so that they neither flicker nor cost git processes on every write.

**Why P1**: It is the whole of issue #167.

**Acceptance Criteria** (each line is one EARS pattern):

1. The `validation.md` of this feature SHALL record, before any production change, the heights the written section reported over at least one re-read, and whether they leave the pre-read height  <!-- ubiquitous -->
2. WHILE a fitted `DiffViewer` has a fold reading pending the viewer SHALL report the last height it reported before that reading, to its container and to `onHeight`  <!-- state-driven -->
3. WHEN the pending reading's diff is recomputed and its folds are re-applied THEN the viewer SHALL report the measured content height again  <!-- event-driven -->
4. WHILE no fold reading is pending a fitted `DiffViewer` SHALL report the measured content height, including on first mount  <!-- state-driven -->
5. WHEN a watch batch re-reads one section's sides THEN every other expanded section whose file did not change SHALL keep the same editor node  <!-- event-driven -->
6. WHEN the #150 bench edit loop runs (`--sessions 0 --files-view --edit-interval 1000`) THEN the steady rows SHALL read at most 2 `cat-file` per `files:changed`  <!-- event-driven -->

**Independent Test**: Seed the Files diff smoke, open All changes, rewrite a folded file in the stack a
few times, and see the neighbouring editors keep their nodes; run the bench edit loop and read the
`cat-file` column.

---

## Edge Cases

- IF the recomputed diff never reports computed changes THEN the viewer SHALL keep the held height until one does
- WHEN a re-read sets text that equals the current text THEN the viewer SHALL hold nothing and report as today
- WHEN a second re-read arrives while one is pending THEN the viewer SHALL keep holding the height from before the first

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FSTD-01 | P1: AC 1 (measure first) | Execute | Verified |
| FSTD-02 | P1: AC 2 (hold while pending) | Execute | Verified (`onHeight` output: accepted residual N1) |
| FSTD-03 | P1: AC 3 (release after folds) | Execute | Verified |
| FSTD-04 | P1: AC 4 (no hold otherwise) | Execute | Verified |
| FSTD-05 | P1: AC 5 (neighbour keeps node) | Execute | Verified |
| FSTD-06 | P1: AC 6 (bench target) | Execute | Verified |
| FSTD-07 | Edge: no computed diff | Execute | Verified |
| FSTD-08 | Edge: text unchanged | Execute | Verified |
| FSTD-09 | Edge: second re-read while pending | Execute | Verified |

**Coverage:** 9 total, 9 mapped to tasks, 0 unmapped; 9 verified (FSTD-02 with one accepted residual)

---

## Success Criteria

- [ ] Bench edit loop: at most 2 `cat-file` per `files:changed` over the steady rows (aggregate), against 6.3-8.3 before
- [ ] Smoke: the neighbouring sections' editor nodes survive every rewrite of the folded file
