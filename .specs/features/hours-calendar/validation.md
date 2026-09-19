# Hours Calendar — Verifier Report (round 4)

**Date**: 2026-09-19
**Spec**: `.specs/features/hours-calendar/spec.md` (HCAL-01..27 + 5 edge cases, as amended by AD-031 and the 2026-09-19 mockup pass)
**Diff range**: `a9c98f8..a81df5b` (`2aff55e`, `68062b2` = T17, `a81df5b` = T18)
**Verifier**: independent sub-agent (author ≠ verifier); evidence re-derived from the spec, not from `tasks.md` checkmarks or commit messages

## Validation: hours-calendar — FAIL

**All six round-3 gaps are closed, and closed properly** — the empty-drawer scenario is now
deterministic rather than data-dependent, and the two mutants that round 3 could not kill (MA, MH) die
on the new checks. What fails is new: **T17 added two `SHALL` clauses to HCAL-15 — the summary line's
counts and the per-group colour swatch — and neither carries any assertion.** Three mutants survive
there, and one of them is not hypothetical: the summary line hard-codes the plural, so a day with a
single block renders **`1 task · 1 blocks`**. That is shipped wrong text on an acceptance criterion,
found only because nothing checks it. Everything else about T17 is right, including the part most
likely to have broken — the swatch takes its role from the same frozen map the bars do.

---

## Round history

| Round | Range | Verdict | Why |
| ----- | ----- | ------- | --- |
| 1 | `c27b412..94f107d` | not done | 4 surviving mutants in `hours-calendar.ts`: M8 (axis start `floor`→`round`, HCAL-09), M10 (lane reuse at a touching boundary), M12 / M13 (cluster closing, HCAL-10); spec-precision gaps on HCAL-12 and the narrow-lane edge case; HCAL-22 label asserted by code read only. Lessons L-023..L-026 recorded (`82862a0`) |
| 2 | `c27b412..be5d8ab` | done | `be5d8ab` adds three unit tests, puts 6 px in HCAL-12 and 64 × 36 px in the edge case, extends smoke check 10 to the group label. All round-1 gaps closed |
| 3 | `8b9d191..a9c98f8` | not done | Layout B (AD-031): legend chips, full-height grid, day detail in a drawer, `defaultDay` removed. Gate green at 893. 6 gaps: HCAL-17 evidence data-conditional (mutant MA not reliably killed), the `hadTime` re-arm branch unevidenced (mutant MH survived), HCAL-25 spec-precision on the Esc-in-a-text-field guard (MB survived), drawer geometry and legend truncation code-only, `tasks.md` tables stopped at T11. Lessons L-027..L-029 recorded (`2aff55e`) |
| 4 | `a9c98f8..a81df5b` | **not done** | T17 (mockup pass: day head, summary line, group swatches, card fills the drawer; spec gains HCAL-27 and states HCAL-25's text-field exception) + T18 (smoke closes the round-3 gaps). Gate green at 893. **All 6 round-3 gaps verified closed**; MA and MH now die on checks 24 and 26. New: HCAL-15's summary-counts and swatch clauses have no assertion (N1, N4, N5 survive) and the summary renders `1 blocks`; HCAL-25's now-stated exception is still untested (MB survives); spec bookkeeping drifted |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T17 | ⚠️ Done with a defect | `HoursView.tsx:254-273` `DayHead`, `:303-335` `DayCard` with the summary line and swatch wiring, `:345-357` `GroupSection`; `HoursView.css:143-280`. The card fills the drawer (`.hours-day { min-height: 100% }`) and the inter-group rules are gone. **Defect**: `HoursView.tsx:310` never singularises `blocks` — gap 1 |
| T18 | ✅ Done | `scripts/smoke-hours-calendar.mjs` now 26 checks; the delete scenario parks the period a day earlier so the drawer provably opens on an **empty** day, then re-records and deletes. `fits()` also returns `gridWidth` |
| Gap 6 (round 3) | ✅ Closed | `tasks.md:536` Phase Execution Map, `:557-558` granularity, `:582-583` cross-check, `:594-596` co-location all cover T12..T18 |
| — | ⚠️ | Spec bookkeeping drifted — gap 5 below |

---

## Gate Check

- **Commands** (Full gate from tasks.md): `npm run typecheck`, `npm run lint`, `npm test`, run on `a81df5b`
- typecheck: **exit 0**
- lint: **exit 0**, **0 errors / 18 warnings** — equals the baseline, no rise
- test: **exit 0**, **893 passed / 0 failed / 0 skipped** (55 files)
- **Test count**: 893 → 893, **delta 0**. `git diff a9c98f8..a81df5b -- '*.test.ts'` is empty — no test file was touched, so nothing could be deleted, skipped or weakened. All of this round's new evidence is in the smoke, per the renderer convention.

---

## Round-3 gaps — closure check

Smoke = `scripts/smoke-hours-calendar.mjs` at `a81df5b`, checks renumbered by the two insertions:
1 Mon–Fri order · 2 weekend rule · 3 header names · 4 one today · 5 opens with nothing selected ·
6 parallel lanes · 7 min height · 8 ongoing/`now` · 9 hover tooltip · **10 chip titles (new)** ·
11 legend folders · 12 header click · 13 bar click focus · 14 one day card in the drawer ·
15 growth + stable colour · 16 no page scroll at 1100 × 640 · 17 X closes · **18 grid narrows and
returns (new)** · 19 Esc closes · 20 ◀ closes · 21 future columns dimmed · 22 empty week text ·
23 This week nothing selected · **24 empty day opens a drawer that says so (new)** · **25 time on the
open day fills it (new)** · **26 emptying it closes it (rewritten)**. Manual evidence = the recorded
26/26 run on 2026-09-19 with the owner's consent.

| Round-3 gap | Now | Evidence |
| ----------- | --- | -------- |
| 1 — HCAL-17 evidence conditional on the owner's data; MA not reliably killed | ✅ **Closed** | `smoke-hours-calendar.mjs:455-484`. The scenario already asserts the past week is free (`pastBusy === false`, `:447-449`), then parks the only period on the **previous** day (`:457-463` `parked = start - 24 h`), so the clicked Wednesday is empty **by construction**, not by luck. Check 24 asserts `emptyDrawer !== null && emptyDrawer.head && emptyDrawer.empty === 'No time recorded on this day.' && emptyDrawer.groups === 0 && pressedLabel()?.startsWith(wedHeader)`. Under MA the header click sets `hadTime: true` with `shownDay === null`, so `HoursView.tsx:121` closes the selection in the same render and `emptyDrawer` is `null` — **MA killed by check 24** |
| 2 — the `hadTime` re-arm branch unevidenced; MH survived | ✅ **Closed** | `smoke-hours-calendar.mjs:485-500`. Check 25 moves the period onto the open day and asserts `armed.title === wedHeader && armed.groups >= 1`; check 26 (`:501-505`) then deletes it and asserts `!(await drawerOpen()) && pressedLabel() === null`. Under MH `hadTime` stays `false` for ever, so at the delete `HoursView.tsx:121`'s `selection.hadTime && !shownDay` is false, the drawer stays open on its empty text — **MH killed by check 26**. Check 25 is the bridge that makes 26 mean what it claims: it proves the day really did gain time first |
| 3 — HCAL-25 did not describe the text-field exception | ⚠️ **Half closed** | `spec.md:102` now reads "…presses Esc **outside a text field**… Esc inside a text field SHALL belong to that field", matching `HoursView.tsx:66-67,142` exactly. The spec-precision gap is resolved. But no check presses Esc inside an input, so mutant **MB still survives** — see gap 4 |
| 4 — drawer geometry CSS-only | ✅ **Closed** | `fits()` (`:148-152`) now returns `gridWidth`; check 18 (`:380-384`, the check at `:380`) asserts `fitOpen.gridWidth < fitClosed.gridWidth - 100`, measured on the same `.hcal` before and after the X. The drawer is 380 px + a 12 px gap, so a mutant that overlays it instead of narrowing the grid leaves the widths equal and dies. Residual: the drawer's *side* is still structural (flex order), not measured |
| 5 — legend truncation code-only | ✅ **Mostly closed** | Check 10 (`:296-300`, the check at `:300`) asserts `[...].every(c => c.getAttribute('title') === c.querySelector('.hleg-label').textContent)` — every chip, not a sample. Residual: no chip is verified to actually overflow (`scrollWidth > clientWidth`), so "SHALL be truncated" is still carried by `HoursLegend.css:18,56-62` alone |
| 6 — `tasks.md` cross-check tables stopped at T11 | ✅ **Closed** | `tasks.md:536`, `:557-558`, `:582-583`, `:594-596` |

---

## Spec-Anchored Acceptance Criteria (this round's ACs)

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Outcome |
| -- | -------------------- | ---------------------------------- | ------- |
| HCAL-15 (base) | Drawer right of the grid, grid narrowing, that day's groups, blocks, raw periods, edit, delete, Copy per TIME-35..41 / 44..49 | `HoursView.tsx:216-238` the unchanged `DayCard` inside `aside.hours-drawer`; check 14 `querySelectorAll('.hours-drawer .hours-day').length === 1`; check 18 the narrowing; `smoke-time.mjs:240-332` Copy, raw periods, rejected adjust, delete against `todayCard` **inside the drawer**, 26/26 — the Copy button moved into `.hours-day-stats` but stays a descendant of `.hours-day`, so that selector still finds it | ✅ PASS |
| HCAL-15 (head) | "SHALL carry the day and its close control in one head" | `HoursView.tsx:254-273` `DayHead` renders `header.hours-day-head` with `.hours-day-title` and the `aria-label="Close details"` button; used by both branches (`:222-235`); check 24 asserts `head` on the empty branch, check 25 asserts `.hours-day-title === wedHeader` on the filled one; check 17 clicks `.hours-drawer-close` and asserts the drawer closes — mutant **N6** (inert `onClick`) dies there | ✅ PASS |
| HCAL-15 (summary) | "a summary line with the day total, its **task and block counts** and Copy" | `HoursView.tsx:306-322`: total `formatHmCompact(day.totalMs)`, counts `{day.groups.length} task…` / `{day.groups.reduce((n, g) => n + g.blocks.length, 0)} blocks`, Copy. **No check reads `.hours-day-count` or `.hours-day-stats`** (`grep` over both smokes: no match) | ❌ **GAP — no assertion.** Mutants **N4** and **N5** zero the two counts and survive every check. The missing assertion is what let the `1 blocks` defect ship — gaps 1 and 2 |
| HCAL-15 (swatch) | "each group SHALL wear the swatch of its **calendar colour**" | `HoursView.tsx:327` `role={roleOf(colours, group.key)}` — the *frozen* map, the same object passed to `HoursCalendar` at `:209`, read through `roleOf`, which returns `other` for a task unseen at freeze (HCAL-24). `HoursView.css:250-276` mirrors `HoursLegend.css:26-55` token for token, and `--hcal-slot1..3` are declared on `:root` (`HoursCalendar.css:7-18`), so the drawer inherits them. **The wiring is right**; no check reads `.hours-group-swatch` | ❌ **GAP — no assertion.** Mutant **N1** (`role` forced to `slot1`) survives every check — gap 2 |
| HCAL-17 | Selected day holds no time → the drawer says no time is recorded on that day | `HoursView.tsx:232-235` `<p className="hours-empty">No time recorded on this day.</p>` inside a `section.hours-day` headed by `DayHead`; check 24's exact-string equality. Note the text is now generic and the day is named by the head, so HCAL-17 is satisfied **together with** HCAL-27 | ✅ PASS — mutant **N3** (text changed) dies on check 24 |
| HCAL-25 | Close button, **or Esc outside a text field**, closes; Esc **inside** a text field belongs to the field | `HoursView.tsx:135` `closeDrawer`, `:262-270` the button, `:139-146` the listener with `!isTextField(e.target)` (`:66-67`); check 17 (X), check 19 (a real `Input.dispatchKeyEvent` Escape) | ⚠️ **Partial** — the close halves are pinned; the exception clause has no check and mutant **MB** survives (gap 4) |
| HCAL-26 | Fits 1100 × 640, no page scroll, hour height follows the height, only the drawer's content may scroll | `HoursView.css:87-95` `.hours-body { overflow: hidden }`, `:114-121` `.hours-drawer { overflow-y: auto }`, `:149-151` `.hours-day { min-height: 100% }` fills it without forcing the body to scroll; `HoursCalendar.css:21-27`; check 16 asserts `!fitOpen.scrolls && !fitClosed.scrolls && gridBottom <= height` **both with the drawer open and closed** | ✅ PASS — unchanged by T17/T18 and still asserted after the card grew |
| HCAL-27 | While the selected day holds no time the drawer SHALL **keep its head** and say so | `HoursView.tsx:232-235`; check 24 `emptyDrawer.head && emptyDrawer.empty === 'No time recorded on this day.' && emptyDrawer.groups === 0` | ✅ PASS — mutant **N2** (head dropped) dies on check 24. Residual: the check asserts the head *exists*, not that it names the selected day; only check 25 reads the title, on the filled branch |

### Unchanged this round

`git diff a9c98f8..a81df5b` touches no `.ts` outside `HoursView.tsx`, and neither `hours-calendar.ts`,
`hours-calendar.test.ts`, `HoursCalendar.tsx` nor `HoursLegend.tsx`. HCAL-01..14, 16, 18..24 keep their
round-2/3 evidence verbatim; the colour freeze (`HoursView.tsx:103-111`, unit
`hours-calendar.test.ts:350-366`, check 15 `grow1.bg === grow0.bg`) is untouched, and T17 consumes it
through `roleOf` rather than reaching past it.

### Edge cases

- [x] Four+ overlapping blocks narrow evenly, no direct label under 64 × 36 px — unit
  `hours-calendar.test.ts:220`; container query. Untouched.
- [x] Week change while the drawer is open → closes — `HoursView.tsx:121`; checks 20, 23.
- [x] Only a sub-minute block → 8 h axis — unit `hours-calendar.test.ts:157-158`. Untouched.
- [x] Weekend column appears/disappears, order kept — unit `hours-calendar.test.ts:76`, `:85`; check 2.
- [x] **Selected day's last period deleted → drawer closes, "including when that day held no time when
  it was selected"** (clause added this round) — now fully evidenced end to end by checks 24 → 25 → 26,
  which walk exactly that sequence. This was round 3's gap 2.

**Status**: ❌ HCAL-15's summary and swatch clauses carry no assertion (3 surviving mutants, one live
defect); HCAL-25 partial; HCAL-17, 26, 27 and all five edge cases fully evidenced.

---

## Discrimination Sensor

Scratch: `git worktree add …\tmp\verify-wt4 a81df5b` with a `node_modules` junction. Real tree
`git status --porcelain` **empty before and after**; junction and worktree removed, `git worktree list`
back to one entry. The real tree's sources were never edited; `git stash` never used.

The renderer has no unit tests by convention, so these are judged **by reading** the smoke. Each was
still applied in the scratch and confirmed a **compilable behaviour change invisible to the unit
suite** — `tsc -p tsconfig.web.json` exit 0 and `vitest run src/renderer` **225/225 green for every one
of the nine**, which is the measurement: the unit layer sees none of this.

| # | Line (`HoursView.tsx`) | Mutation | Verdict |
| - | ---------------------- | -------- | ------- |
| MA | `:131` | `hadTime: Boolean(column?.day)` → `true` (empty day closes itself on selection) | ✅ **Killed by check 24** — was surviving in round 3 |
| MH | `:124` | the re-arm branch never fires | ✅ **Killed by check 26** — was surviving in round 3 |
| MB | `:142` | drop `!isTextField(e.target)` | ❌ **Survives** — no check presses Esc in a field (gap 4) |
| N1 | `:327` | group swatch role forced to `slot1` | ❌ **Survives** — nothing reads `.hours-group-swatch` (gap 2) |
| N2 | `:233` | empty drawer loses its `DayHead` | ✅ Killed by check 24 (`head`) |
| N3 | `:234` | empty drawer text changed | ✅ Killed by check 24 (exact string) |
| N4 | `:309` | summary task count forced to 0 | ❌ **Survives** — nothing reads `.hours-day-count` (gap 2) |
| N5 | `:310` | summary block count forced to 0 | ❌ **Survives** — same (gap 2) |
| N6 | `:267` | the head's close button is inert | ✅ Killed by check 17 — confirms the relocated control is still wired and still matched by `.hours-drawer-close` |

**Sensor depth**: lightweight-plus (9 mutations, focused on T17's new surface and the two round-3
survivors)
**Sensor tally**: **5 killed, 4 survived** (MB, N1, N4, N5) — ❌. Two of round 3's survivors are now
killed; three new ones arrived with T17's new clauses.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / no scope creep | ✅ — `DayHead` is extracted because both branches need it, not speculatively |
| Surgical changes | ✅ — one component file and its CSS; no `.ts` test touched, `HoursCalendar` and `HoursLegend` untouched |
| Matches patterns | ⚠️ — `HoursView.tsx:310` breaks the file's own singularisation pattern, which `:412` follows (`period{… === 1 ? '' : 's'}`) |
| Correct reuse of existing state | ✅ — the swatch reads the frozen map through `roleOf`, so HCAL-24 still holds inside the drawer; `HoursView.css:250-276` reuses the `:root` tokens rather than re-declaring hexes |
| Spec-anchored outcome check | ❌ — two new `SHALL` clauses have no asserted value |
| Per-layer coverage (pure logic 1:1; renderer by smoke) | ⚠️ — the summary line and the swatch are outside every check |
| Every test maps to a spec requirement | ✅ — checks 10, 18, 24, 25, 26 each name their AC or edge case in the file header |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, tasks.md Test Coverage Matrix | ✅ |
| Spec bookkeeping consistent | ❌ — gap 5 |

---

## Ranked gaps

### Gap 1 — the summary line renders `1 blocks` (Major, live defect)

- **Root cause**: `src/renderer/src/components/HoursView.tsx:308-311` singularises `task` but
  hard-codes the plural on `blocks`:
  `{day.groups.length} task{day.groups.length === 1 ? '' : 's'} · {day.groups.reduce(…)} blocks`.
  A day with a single merged block — one session, the ordinary case — renders **`1 task · 1 blocks`**.
  The same file gets this right at `:412` for periods.
- **Why it shipped**: no check reads `.hours-day-count`; mutant N5 zeroes the count and survives.
- **Fix task**: mirror `:412` — `block{… === 1 ? '' : 's'}`. Verify with the check from gap 2.
- **Priority**: Major (visible wrong output on an AC clause; trivially fixed).

### Gap 2 — HCAL-15's summary and swatch clauses have no assertion (Major)

- **Root cause**: T17 added two `SHALL` clauses to HCAL-15 — the summary line's total, task and block
  counts, and each group's calendar swatch — and T18's checks did not follow. Mutants **N1** (swatch
  role forced to `slot1`), **N4** and **N5** (counts zeroed) all survive 26/26.
- **Where**: `src/renderer/src/components/HoursView.tsx:306-322` and `:327`;
  `scripts/smoke-hours-calendar.mjs` (no reference to `.hours-day-count`, `.hours-day-stats` or
  `.hours-group-swatch`).
- **Fix task**: in the section that already has the drawer open on today (checks 12–14), assert
  `.hours-day-total` matches the header's total, `.hours-day-count` matches
  `<n> task(s) · <m> block(s)` derived from the DOM's own `.hours-group` and `.hours-block` counts, and
  that each `.hours-group-swatch`'s `role-*` class equals the `role-*` on that group's bars in the grid.
  The last one also pins HCAL-15's "so a row and its bar match" intent and kills N1.
- **Priority**: Major.

### Gap 3 — "N tasks" counts groups, including task-less folders (Minor, spec/code disagreement)

- **Root cause**: `HoursView.tsx:309` counts `day.groups.length`. A group may be a task-less folder
  (`No task · <folder>`), which HCAL-11 and HCAL-21 are careful to treat as *not* a task. In the
  smoke's own scenario every group is task-less, so the drawer reads "2 tasks" for zero tasks.
- **Fix task**: decide which the AC means — count `group.taskId !== null`, or reword HCAL-15 to say
  "group counts". Whichever, the gap-2 check should assert the chosen rule.
- **Priority**: Minor.

### Gap 4 — HCAL-25's text-field exception is stated but untested (Minor)

- Round 3's gap 3 is half closed: `spec.md:102` now states the rule, so it is no longer a
  spec-precision gap — but mutant **MB** (dropping `!isTextField(e.target)`,
  `HoursView.tsx:66-67,142`) still survives, so the clause has no evidence.
- **Fix task**: in the drawer, expand a block, click Edit on a raw period, dispatch Escape with the
  `datetime-local` input focused, and assert the drawer is **still open**; then Escape outside it and
  assert it closes. `PeriodRow` has no Esc handler of its own, so the guard is the only thing under test.
- **Priority**: Minor.

### Gap 5 — spec bookkeeping drifted with HCAL-27 (Cosmetic)

- `.specs/features/hours-calendar/spec.md:170` still reads **"Coverage: 26 total, 26 mapped to tasks,
  0 unmapped"** though HCAL-27 makes 27.
- `.specs/features/hours-calendar/spec.md:121` places HCAL-27 inside the **P2** story block (between
  HCAL-23 and HCAL-26, and out of numeric order) while the traceability table at `:168` assigns it to
  **P1: Get to the detail and the actions**. HCAL-27 is a drawer criterion; it belongs in the P1 block.
- **Priority**: Cosmetic.

### Gap 6 — residual assertion edges (Cosmetic)

- Check 10 asserts every chip's `title`, but no chip is verified to actually overflow, so HCAL-21's
  "SHALL be truncated" rests on `HoursLegend.css:18,56-62`.
- Check 18 asserts the grid narrows and returns, but not that the drawer is on the **right**.
- Check 24 asserts the empty drawer *has* a head, but not that the head names the selected day; only
  check 25 reads `.hours-day-title`, on the filled branch.
- **Priority**: Cosmetic. Each is one extra expression in a check that already takes the measurement.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HCAL-01..14, 16, 18..24, 26 | ✅ Verified | ✅ Verified — untouched by this range |
| HCAL-15 | ✅ Verified (round 3, geometry code-only) | ❌ **Needs Fix** — summary and swatch clauses unasserted; `1 blocks` defect (gaps 1–3) |
| HCAL-17 | ❌ Needs Fix (round 3) | ✅ **Verified** — deterministic, check 24 |
| HCAL-21 | ✅ Verified (truncation code-only) | ✅ Verified — title clause now asserted (check 10) |
| HCAL-25 | ⚠️ Spec-precision gap (round 3) | ⚠️ **Partial** — spec fixed, exception untested (gap 4) |
| HCAL-27 | — (new) | ✅ Verified — check 24 |
| Edge case: day's last period deleted | ⚠️ Partial (round 3) | ✅ **Verified** — checks 24 → 25 → 26 |

---

## Summary

**Overall**: ⚠️ Issues — the round-3 repair work is exemplary; the new mockup pass arrived without its
own evidence.

**Spec-anchored check**: all 6 round-3 gaps closed; HCAL-17, 26, 27 and 5/5 edge cases fully evidenced;
HCAL-15 has two unasserted clauses and one live defect; HCAL-25 partial
**Sensor**: 9 mutations — 5 killed, 4 survived (MB, N1, N4, N5); round 3's MA and MH now killed by
checks 24 and 26
**Gate**: typecheck exit 0; lint exit 0, 0 errors / 18 warnings (baseline); 893 passed, 0 failed,
0 skipped; no test file touched in this range

**What works**: the empty-drawer scenario is deterministic by construction rather than by luck — the
period is parked off the day first, so checks 24 → 25 → 26 walk empty → filled → emptied and pin both
branches of the `hadTime` machine; the grid's narrowing and the chips' titles are measured; the
relocated close control is still wired (N6 dies); the swatch is correctly sourced from the frozen
colour map through `roleOf`, so the drawer cannot disagree with the bars; the card fills the drawer
without making the body scroll at 1100 × 640.

**Issues found**: gaps 1–6 above. Gaps 1 and 2 are one fix and one check between them: singularise
`block`, then assert the summary line and the swatch roles in the section that already has the drawer
open.

**Next steps**: route gaps 1–3 to an implementer as one task, decide gap 4's check, tidy gap 5's spec
bookkeeping, then re-dispatch the Verifier. This is fix→re-verify iteration 2 of the maximum 3.
