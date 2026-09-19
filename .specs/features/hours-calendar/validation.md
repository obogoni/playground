# Hours Calendar — Verifier Report (round 3)

**Date**: 2026-09-19
**Spec**: `.specs/features/hours-calendar/spec.md` (HCAL-01..26 + 5 edge cases, as amended by AD-031)
**Diff range**: `8b9d191..a9c98f8` (`d7cc3ec`, `ac42a0d`, `0f3ab0b`, `ea99c54`, `37b62f9`, `a9c98f8`)
**Verifier**: independent sub-agent (author ≠ verifier); evidence re-derived from the spec, not from `tasks.md` checkmarks or commit messages

## Validation: hours-calendar — FAIL

The gate is green (893 tests, lint at baseline), the three deleted `defaultDay` tests are exactly the
ones AD-031 removed the requirement for, and nothing else was weakened. Layout B is implemented as
specified and 7 of 10 injected drawer mutants die on the recorded smoke run. But the revision's new
drawer paths are the part the smoke reaches least: **HCAL-17 has no deterministic evidence** (the one
check that can reach it passes either way, depending on the owner's data that day), and the
**`hadTime` re-arm branch has none at all** — a mutant that disables it survives every check. One
spec-precision gap is flagged on HCAL-25. All are small and precisely actionable; none is a defect in
shipped behaviour that the Verifier could reproduce.

---

## Round history

| Round | Range | Verdict | Why |
| ----- | ----- | ------- | --- |
| 1 | `c27b412..94f107d` | not done | 4 surviving mutants in `hours-calendar.ts`: M8 (axis start `floor`→`round`, HCAL-09), M10 (lane reuse at a touching boundary), M12 / M13 (cluster closing, HCAL-10); spec-precision gaps on HCAL-12 and the narrow-lane edge case; HCAL-22 label asserted by code read only. Lessons L-023..L-026 recorded (`82862a0`) |
| 2 | `c27b412..be5d8ab` | done | `be5d8ab` adds three unit tests, puts 6 px in HCAL-12 and 64 × 36 px in the edge case, extends smoke check 10 to the group label. All round-1 gaps closed |
| 3 | `8b9d191..a9c98f8` | **not done** | Layout B (AD-031): legend chips, full-height grid, day detail in a drawer, `defaultDay` removed. Gate green at 893; earlier unit kills re-confirmed. Open: HCAL-17 evidence is data-conditional (mutant MA not reliably killed), the `hadTime` re-arm branch is unevidenced (mutant MH survives), HCAL-25 spec-precision on the Esc-in-a-text-field guard (mutant MB survives) |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T12 | ✅ Done | `spec.md` HCAL-15..19, 21 revised and HCAL-25, 26 added, each marked `revised by AD-031` / `added by AD-031`; edge cases revised; AD-031 in `.specs/STATE.md:32` |
| T13 | ✅ Done | `HoursLegend.tsx:16-30` is now one flat `ul` of chips; `HoursLegend.css:3-25` wrapping row, `max-width: 340px`, ellipsis |
| T14 | ✅ Done | `HoursView.css:87-95` (`overflow: hidden`), `HoursCalendar.css:21-27` (`flex: 1 1 0`, rows `auto minmax(240px, 1fr)`); the fixed `--hcal-hour-px` is gone and hour lines stay percentage-positioned (`HoursCalendar.tsx:88`) |
| T15 | ✅ Done | `HoursView.tsx:114-145` selection + Esc, `:215-246` the drawer; `defaultDay` removed from `hours-calendar.ts` |
| T16 | ✅ Done | `smoke-hours-calendar.mjs` now 22 checks; `smoke-time.mjs:232-239, 272-274` opens today's drawer first. Recorded live run 22/22 and 26/26 (body of `a9c98f8`). **Not re-run by the Verifier** — the smokes spawn sessions and write the owner's real data |
| — | ⚠️ | `tasks.md`'s Phase Execution Map, Task Granularity Check, Test Co-location Validation and Diagram-Definition Cross-Check still stop at T11 although Phase 4 adds T12..T16 |

---

## Gate Check

- **Commands** (Full gate from tasks.md): `npm run typecheck`, `npm run lint`, `npm test`, run on `a9c98f8`
- typecheck: **exit 0**
- lint: **exit 0**, **0 errors / 18 warnings** — equals the baseline, no rise
- test: **exit 0**, **893 passed / 0 failed / 0 skipped** (55 files)
- **Test count before this revision**: 896 → **after**: 893 → **delta −3**
- **Test integrity**: `git diff 8b9d191..a9c98f8 -- '*.test.ts'` touches one file, `hours-calendar.test.ts`, and removes exactly the `describe('defaultDay')` block (3 `it`s) plus its import. No other test was deleted, renamed, skipped or weakened; no assertion elsewhere was relaxed. The deletion matches the spec change: HCAL-16 now reads "WHEN the view opens or the shown week changes THEN **no day** SHALL be selected and the drawer SHALL be closed", so the default-day rule those three tests pinned no longer exists, and `defaultDay` itself is gone from `hours-calendar.ts`. Justified.

---

## Spec-Anchored Acceptance Criteria (revised and added by AD-031)

Unit = `src/renderer/src/lib/hours-calendar.test.ts`. Smoke = `scripts/smoke-hours-calendar.mjs`, checks
numbered in execution order: 1 Mon–Fri order · 2 weekend rule · 3 header buttons/names · 4 one today ·
5 opens with nothing selected · 6 parallel lanes · 7 min height · 8 ongoing/`now` · 9 hover tooltip ·
10 legend chips · 11 header click opens drawer · 12 bar click focuses block · 13 one day card, in the
drawer · 14 growth + stable colour · 15 no page scroll at 1100 × 640 · 16 X closes · 17 Esc closes ·
18 ◀ closes · 19 future columns dimmed · 20 empty week text · 21 This week, nothing selected ·
22 deleting the day's last period closes. Manual evidence = the recorded 22/22 run on 2026-09-19 with
the owner's consent. Code = implementation read by the Verifier.

**Line numbers are at `a9c98f8`.** While this verification ran, an unrelated uncommitted edit
appeared in the working tree's `src/renderer/src/components/HoursView.tsx` (a `DayHead` component,
colour swatches beside the group labels and a stats line in the day card — work beyond AD-031, not
produced by the Verifier and not part of this range). It compiles, it is left untouched, and it
shifts the line numbers below relative to the working copy. The gate figures and the sensor were
taken on the clean tree at `a9c98f8`, before it appeared.

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Outcome |
| -- | -------------------- | ---------------------------------- | ------- |
| HCAL-15 | While a day is selected, a drawer **to the right** of the grid, grid narrowing, showing that day's groups, blocks, raw periods, edit, delete, Copy exactly as TIME-35..41 / 44..49 | `HoursView.tsx:215-246` renders the unchanged `DayCard` inside `aside.hours-drawer`; `HoursView.css:102-121` `.hours-main { display: flex }` with `.hcal { min-width: 0 }` then `.hours-drawer { flex: none; width: 380px; overflow-y: auto }`; smoke 13 `document.querySelectorAll('.hours-drawer .hours-day').length === 1` and `.hours-day` total `=== 1`; `smoke-time.mjs:240-332` runs Copy, the raw-period list, the rejected adjust and the delete against `todayCard` **inside the drawer**, 26/26 | ✅ PASS (manual + code) — geometry clause is CSS-only, see gap 4 |
| HCAL-16 | View opens / week changes → **no day selected, drawer closed** | `HoursView.tsx:114` `useState<Selection \| null>(null)`; `:120-122` `selection.weekStart !== weekStart` → `setSelection(null)`; smoke 5 `(await pressedLabel()) === null && !(await drawerOpen()) && querySelectorAll('.hours-day').length === 0`; smoke 18 `openBeforeNav && !(await drawerOpen()) && (await pressedLabel()) === null` after ◀; smoke 21 same after **This week** | ✅ PASS |
| HCAL-17 | Selected day holds no time → the drawer **says no time is recorded on that day** | `HoursView.tsx:240-244` `No time recorded on {formatDayHeader(new Date(current.date))}.`; `HoursView.tsx:130` keeps the selection by storing `hadTime: Boolean(column?.day)`; smoke 11 `mondayDetail.includes(monday)` where `mondayDetail = (await detailTitle()) ?? (await emptyTexts()).join(' ')` | ⚠️ **GAP — conditional evidence.** Check 11 passes through either branch: it reaches the empty-drawer string only if that Monday held no time in the owner's data. Mutant MA is therefore not reliably killed. See gap 1 |
| HCAL-18 | Activating a column header selects that day and opens the drawer on it | `HoursCalendar.tsx:73-75` `<button aria-pressed={selected === date} onClick={() => onSelectDay(date)}>`; `HoursView.tsx:128-131`; smoke 11 `(await pressedLabel())?.startsWith(monday) && (await drawerOpen())`; `smoke-time.mjs:233-238` opens the drawer by header before every Hours step | ✅ PASS (manual + code) |
| HCAL-19 | Activating a bar selects its day, opens the drawer, **highlights and expands** its block | `HoursCalendar.tsx:125-128` `focused={selected === date && focus?.groupKey === groupKey && focus.start === block.start}`; `HoursView.tsx:132-133` fresh `focus` object per activation; `:352-367` `BlockLine` expands on a new focus and scrolls to it; smoke 12 `pressedLabel()?.startsWith(todayHeader) && drawerOpen() && detailTitle() === todayHeader && focused.group === 'No task · …' && focused.expanded === 'true' && focused.periods >= 1` | ✅ PASS (manual + code) |
| HCAL-21 | Chips **above the grid**, every task and task-less folder incl. each one folded into Other, with colour and week total; long label truncated, full text on hover | `HoursView.tsx:203` renders `HoursLegend` before `.hours-main`; `HoursLegend.tsx:18-29` one chip per entry, `title={e.label}`, `role-${e.role}` swatch; `HoursLegend.css:14-25,56-62` `max-width: 340px` + `overflow: hidden; text-overflow: ellipsis`; unit `hours-calendar.test.ts:341-347` `toEqual([['Task #4','slot1',5h],['Task #3','slot2',3h],['Task #2','slot3',2h],['Task #1','other',1h],['No task · scratch','no-task',8h]])` — the folded task keeps its own entry and total; smoke 10 `['No task · Windows','No task · System32'].every(l => legend.some(e => e.label === l && e.outlined))` over `.hleg-chip` | ✅ PASS — truncation clause is code-only, see gap 5 |
| HCAL-25 | Close button **or Esc** → drawer closes, no day selected, grid full width again | `HoursView.tsx:134` `closeDrawer`, `:222-230` the `aria-label="Close details"` button; `:138-145` the `keydown` listener; smoke 16 `closedByX = !(await drawerOpen()) && (await pressedLabel()) === null`; smoke 17 `openedAgain && !(await drawerOpen()) && (await pressedLabel()) === null` after a real `Input.dispatchKeyEvent` Escape; full width follows from `.hours-drawer` unmounting inside the flex row (`HoursView.css:102-108`) | ⚠️ **Spec-precision gap** — the code adds `!isTextField(e.target)` (`HoursView.tsx:66-67,141`), which the AC does not describe. See gap 3 |
| HCAL-26 | Fits 1100 × 640 with no page scroll; hour height follows the available height; only the drawer's content may scroll | `HoursView.css:87-95` `.hours-body { flex: 1; min-height: 0; overflow: hidden }`, `:112` `.hours-drawer { overflow-y: auto }`; `HoursCalendar.css:21-27` `flex: 1 1 0` + `grid-template-rows: auto minmax(240px, 1fr)` (the fixed `--hcal-hour-px` is gone), `:102` gridlines at `calc(100% / var(--hcal-hours))` and `HoursCalendar.tsx:88` labels at `${(i / hours) * 100}%`, so the hour pitch is a fraction of whatever height the row gets; smoke 15 asserts, under `Emulation.setDeviceMetricsOverride` 1100 × 640, `!fitOpen.scrolls && !fitClosed.scrolls && fitOpen.gridBottom <= fitOpen.height && fitClosed.gridBottom <= fitClosed.height` — **both with the drawer open and closed** | ✅ PASS (manual + code) |

### Unchanged ACs — no regression

`git diff 8b9d191..a9c98f8 -- src/renderer/src/lib/hours-calendar.ts` removes `defaultDay` and
nothing else; `HoursCalendar.tsx` is untouched. So HCAL-01..14, 20, 22..24 keep the round-2 evidence
verbatim, and the 28 remaining unit tests cover them. Spot-confirmed this round:

- HCAL-24 (colour freeze) — `HoursView.tsx:102-110` unchanged; unit `hours-calendar.test.ts:350-366`
  still green; smoke 14 `grow1.bg === grow0.bg` on a live growing bar.
- HCAL-07 — `HoursView.tsx:202` still renders `No time recorded this week.`; smoke 20 asserts it
  **and** `!(await drawerOpen())`.
- HCAL-14 — smoke 13 pins one `.hours-day`, and it is inside `.hours-drawer`.
- HCAL-06 — header JSX untouched; `smoke-time.mjs:259-268` week navigation 26/26.

### Edge cases (as revised by AD-031)

- [x] Four+ overlapping blocks narrow evenly, no direct label under 64 × 36 px — unit
  `hours-calendar.test.ts:220` `[i, 4]`; `HoursCalendar.css` container query. Untouched this round.
- [x] **Week change while the drawer is open → the drawer closes** — `HoursView.tsx:120-122`; smoke 18
  (◀ with the drawer open) and smoke 21 (**This week**).
- [x] Only a sub-minute block → 8 h axis — unit `hours-calendar.test.ts:157-158`. Untouched.
- [x] Weekend column appears/disappears, order kept — unit `hours-calendar.test.ts:76`, `:85`; smoke 2.
  A selection on a weekend column that then disappears takes the same
  `selection.hadTime && !shownDay` path as the delete case (`HoursView.tsx:120`), since the column and
  its `day` vanish together; covered transitively, not directly.
- [ ] **Selected day's last period deleted → the drawer closes and no day is selected** — the main path
  is evidenced: `HoursView.tsx:120` plus smoke 22, which moves a period to a past Wednesday, opens that
  day, deletes the period and asserts `selectedBefore?.startsWith(wedHeader) && (await pressedLabel())
  === null && !(await drawerOpen())`. **But the re-arm branch is not**: `HoursView.tsx:123-126` exists
  precisely so a day selected *while empty* still closes once it has recorded and lost time, and no
  check reaches it (mutant MH survives). See gap 2.

**Status**: ❌ 6 of the 8 revised/added ACs fully evidenced; HCAL-17 conditional, HCAL-25 carries a
spec-precision gap; 4 of 5 edge cases evidenced, 1 partially.

---

## Discrimination Sensor

Scratch: `git worktree add …\tmp\verify-wt2 a9c98f8` with a `node_modules` junction to the real tree.
Real tree `git status --porcelain` **empty before and after**; junction and worktree removed, worktree
list back to one entry. The real tree's sources were never edited and `git stash` was never used.

### A. Pure module — re-confirming the earlier kills

Scratch baseline `npx vitest run src/renderer/src/lib/hours-calendar.test.ts` → **28 passed** (31 − 3
deleted). Each mutant applied to the scratch copy of `hours-calendar.ts`, run, reverted.

| # | Line | Mutation | Result |
| - | ---- | -------- | ------ |
| U1 | `hours-calendar.ts:51` | `offset >= 5` → `offset >= 6` (Sunday never dropped) | ✅ Killed (4 fail) |
| U2 | `hours-calendar.ts:75` | axis start `Math.floor` → `Math.round` (the round-1 M8) | ✅ Killed (1 fail) |
| U3 | `hours-calendar.ts:128` | lane reuse `end <= block.start` → `end < block.start` (the round-1 M10) | ✅ Killed (1 fail) |
| U4 | `hours-calendar.ts:182` | colour ranking ascending | ✅ Killed (4 fail) |
| U5 | `hours-calendar.ts:213` | legend `.sort` by role removed | ✅ Killed (2 fail) |

5/5 killed — removing `defaultDay` cost the suite nothing else; the round-2 kills hold.

### B. Renderer — drawer and selection logic in `HoursView.tsx`

The renderer has no unit tests by project convention, so these cannot be *run* to a verdict. Each
mutant was still applied in the scratch and confirmed to be a **compilable behaviour change** that the
unit suite cannot see (`tsc -p tsconfig.web.json` exit 0 and `vitest run src/renderer` 225/225 green
for every one of them — which is itself the measurement: the unit layer is blind to all ten). The kill
column is therefore derived **by reading** `scripts/smoke-hours-calendar.mjs` against the recorded
22/22 run.

| # | Line | Mutation | Verdict (by reading) |
| - | ---- | -------- | -------------------- |
| MA | `HoursView.tsx:130` | `hadTime: Boolean(column?.day)` → `hadTime: true` — a day with no time closes itself the instant it is selected, so the drawer never opens empty | ⚠️ **Conditional** — only check 11 can see it, and only if that Monday held no time. Not a reliable kill (gap 1) |
| MB | `HoursView.tsx:141` | drop `!isTextField(e.target)` — Esc inside a period-edit field also closes the drawer | ❌ **Survives** — no check presses Esc inside an input. Also *equivalent to the literal AC* (gap 3) |
| MC | `HoursView.tsx:141` | `e.key === 'Escape'` → `'Esc'` | ✅ Killed by check 17 — `openedAgain && !(await drawerOpen()) && pressedLabel() === null` |
| MD | `HoursView.tsx:134` | `closeDrawer` becomes a no-op (`setSelection(selection)`) | ✅ Killed by check 16 — `closedByX` |
| ME | `HoursView.tsx:120` | week-change term → `false`: the drawer survives ◀ / ▶ / This week | ✅ Killed by checks 18 and 21 |
| MF | `HoursView.tsx:114` | seed the selection with the first column: the view opens with a day selected | ✅ Killed by check 5 — `pressedLabel() === null && !drawerOpen() && '.hours-day'.length === 0` |
| MG | `HoursView.tsx:120` | `hadTime && !shownDay` → `false`: emptying the open day leaves the drawer up | ✅ Killed by check 22 |
| MH | `HoursView.tsx:123` | the re-arm branch never fires, so a day selected while empty keeps `hadTime: false` for ever | ❌ **Survives** — every check selects a day that already holds time (gap 2) |
| MI | `HoursView.tsx:133` | bar activation drops `focus` | ✅ Killed by check 12 — `focused.expanded === 'true' && focused.group === …` |
| MJ | `HoursView.tsx:210` | `selected={current?.date ?? null}` → `selected={null}`: the grid never marks the open day | ✅ Killed by checks 11, 16, 17, 18, 21 (all read `aria-pressed`) |

**Sensor depth**: expanded (15 mutations: 5 unit-run, 10 renderer)
**Sensor tally**: 5/5 unit mutants killed; renderer **7 killed by reading, 1 conditional, 2 survived** —
❌ (gaps 1–3)

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / no scope creep | ✅ — the drawer reuses `DayCard` untouched; `HoursCalendar.tsx` is not edited at all |
| Surgical changes | ✅ — 128 lines in `HoursView.tsx`, the rest CSS, the legend rewrite and the smokes |
| No abstraction for single use | ✅ — `isTextField` is a 2-line local helper, not a hook |
| Matches patterns | ✅ — same render-time state-adjustment idiom the file already used for the frozen colours and `BlockLine`'s focus |
| Spec-anchored outcome check | ⚠️ — HCAL-17 asserted through a branch that may not execute; HCAL-25 carries unspecified behaviour |
| Per-layer coverage (pure logic 1:1 to ACs; renderer by smoke) | ⚠️ — two drawer branches unreached by any smoke check |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — the 3 deleted tests named HCAL-16/17, whose rule AD-031 removed; the 28 that remain each name their HCAL id |
| Dead code removed with its requirement | ✅ — `defaultDay` deleted, not left unused |
| Guidelines followed: `.specs/codebase/TESTING.md`, tasks.md Test Coverage Matrix | ✅ |
| Docs consistent | ⚠️ — `tasks.md`'s four cross-check tables still stop at T11 |

---

## Ranked gaps

### Gap 1 — HCAL-17 has no deterministic evidence (Major)

- **Root cause**: smoke check 11 (`scripts/smoke-hours-calendar.mjs:303-313`) reads
  `detailTitle() ?? emptyTexts().join(' ')` and asserts only that the result contains the day header.
  Both the `DayCard` branch and the "No time recorded on …" branch satisfy it, so which one ran depends
  on whether that Monday held time in the owner's data. HCAL-17 is the AC that names the second branch.
- **Where**: `src/renderer/src/components/HoursView.tsx:240-244`, `HoursView.tsx:130`,
  `scripts/smoke-hours-calendar.mjs:303-313`.
- **Fix task**: add a check that opens the drawer on a day that certainly has no time — the future week
  reached by ▶ already shows five empty weekday headers — and assert both
  `await drawerOpen()` and that `.hours-drawer .hours-empty` reads exactly
  `No time recorded on <that day header>.`. Kills MA.
- **Priority**: Major.

### Gap 2 — the `hadTime` re-arm branch is unevidenced (Major)

- **Root cause**: every smoke check selects a day that already holds time, so `hadTime` is `true` from
  `selectDay` onwards and `HoursView.tsx:123-126` never runs. Mutant MH disables it with no check
  failing. The branch is what makes the last-period-deleted edge case hold for a day that was selected
  while still empty.
- **Where**: `src/renderer/src/components/HoursView.tsx:123-126`.
- **Fix task**: extend the gap-1 check — with the drawer open on an empty day, record time on it
  (spawn a session / `time:adjust` a period into it), assert the drawer swaps to the day card, then
  delete that period and assert the drawer closes and `pressedLabel()` is `null`. Kills MH.
- **Priority**: Major.

### Gap 3 — HCAL-25 does not describe the Esc-in-a-text-field guard (Minor, spec-precision)

- **Root cause**: the AC reads "WHEN the user activates the drawer's close button **or presses Esc**
  THEN the drawer SHALL close", unconditionally. The implementation ignores Esc whose target is inside
  `input, textarea, select`. The behaviour is reasonable — `PeriodRow`'s `datetime-local` editor has no
  Esc handler of its own, so Esc there is the browser's — but it is not in the spec, so no test can be
  required to pin it, and mutant MB (removing the guard) makes the code match the AC literally.
- **Where**: `src/renderer/src/components/HoursView.tsx:66-67` and `:141`.
- **Fix task**: decide the rule and write it into HCAL-25 ("…presses Esc outside a text field…"), then
  add a smoke check that opens a period editor in the drawer, presses Esc and asserts the drawer is
  still open.
- **Priority**: Minor.

### Gap 4 — the drawer geometry clauses are CSS-only (Minor)

- HCAL-15's "to the right of the grid, the grid narrowing to make room" and HCAL-25's "the grid SHALL
  take the full width again" are evidenced by `HoursView.css:102-121` alone. Smoke 15 measures scroll
  fit and grid bottom, never grid width or the drawer's x.
- **Fix task**: in check 15, capture `.hcal` `getBoundingClientRect()` with the drawer open and after
  closing it, and assert the closed width is the larger and that the drawer's `x` exceeds the grid's
  right edge. Cheap, and it rides on measurements the check already takes.
- **Priority**: Minor.

### Gap 5 — HCAL-21's truncation clause is code-only (Minor)

- "a label too long for its chip SHALL be truncated with its full text available on hover" is evidenced
  by `HoursLegend.tsx:21` (`title={e.label}`) and `HoursLegend.css:18,56-62`. Smoke 10 reads labels and
  swatch classes, never `title` or an overflowing chip.
- **Fix task**: extend check 10 to assert every chip's `title` equals its label text and that a chip
  whose `scrollWidth > clientWidth` still carries it.
- **Priority**: Minor.

### Gap 6 — `tasks.md` cross-check tables stop at T11 (Cosmetic)

- Phase 4 adds T12..T16, but the Phase Execution Map, Task Granularity Check, Test Co-location
  Validation and Diagram-Definition Cross-Check were not extended. `.specs/features/hours-calendar/tasks.md`.
- **Priority**: Cosmetic.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HCAL-01..14, 20, 22, 23, 24 | ✅ Verified (round 2) | ✅ Verified — unchanged by this revision |
| HCAL-15 | Implemented | ✅ Verified (geometry clause code-only — gap 4) |
| HCAL-16 | Implemented | ✅ Verified |
| HCAL-17 | Implemented | ❌ Needs Fix — gap 1 |
| HCAL-18 | Implemented | ✅ Verified |
| HCAL-19 | Implemented | ✅ Verified |
| HCAL-21 | Implemented | ✅ Verified (truncation clause code-only — gap 5) |
| HCAL-25 | Implemented | ⚠️ Spec-precision gap — gap 3 |
| HCAL-26 | Implemented | ✅ Verified |
| Edge case: day's last period deleted | Implemented | ⚠️ Partial — gap 2 |

---

## Summary

**Overall**: ⚠️ Issues — layout B works and is well built; two drawer branches are untested and one AC
is under-specified.

**Spec-anchored check**: 6/8 revised ACs fully evidenced, 1 conditional (HCAL-17), 1 spec-precision
gap (HCAL-25); 4/5 edge cases evidenced, 1 partial
**Sensor**: unit 5/5 killed; renderer 7 killed / 1 conditional / 2 survived (MA, MB, MH)
**Gate**: typecheck exit 0; lint exit 0, 0 errors / 18 warnings (baseline); 893 passed, 0 failed,
0 skipped; −3 tests, justified by AD-031

**What works**: the drawer opens only on a header or bar click and closes on X, Esc, every week change
and the loss of the open day's last period; the legend is a wrapping chip row above the grid with every
task, every folded task and every folder carrying its total; the grid takes the leftover height and the
hour pitch follows it, so nothing but the drawer scrolls at 1100 × 640; `DayCard`, `HoursCalendar` and
the whole pure model are untouched, so Copy, edit and delete keep their shipped evidence.

**Issues found**: gaps 1–6 above, in rank order. Gaps 1 and 2 are one smoke scenario between them —
open the drawer on a day with no time, give it time, take the time away.

**Next steps**: route gaps 1 and 2 to an implementer as one smoke-check fix task, settle gap 3 in the
spec, then re-dispatch the Verifier (round 4 of a maximum 3 fix→re-verify iterations; this is the 1st).
Gaps 4–6 can ride along or be deferred.
