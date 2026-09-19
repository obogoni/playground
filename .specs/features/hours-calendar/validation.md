# Hours Calendar — Verifier Report

**Date**: 2026-09-19
**Spec**: `.specs/features/hours-calendar/spec.md` (HCAL-01..24 + 5 edge cases)
**Diff range**: `c27b412..94f107d` (T1..T11, 11 commits) on `feature/hours-calendar`
**Verifier**: independent sub-agent (author ≠ verifier); evidence re-derived from the spec, not from `tasks.md` checkmarks or commit messages

## Validation: hours-calendar — FAIL

Gate green, every AC traced, but the discrimination sensor left **4 non-equivalent mutants alive** in `hours-calendar.ts` (axis rounding and lane clustering, HCAL-09 / HCAL-10). Per validate.md, surviving mutants are fix tasks; the feature is not done until they are killed. The fixes are test-only — no production defect was found.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T5 | ✅ Done | Pure module + 28 unit tests in `hours-calendar.test.ts` |
| T6 | ✅ Done | `focus` prop on `DayCard` / `GroupSection` / `BlockLine` (`HoursView.tsx:329-337`) |
| T7 | ✅ Done | `HoursCalendar.tsx` + `.css` |
| T8 | ✅ Done | `HoursLegend.tsx` + `.css` |
| T9 | ✅ Done | `HoursView.tsx:97-218` |
| T10 | ✅ Done | TIME-34 annotated in `time-tracking/spec.md:267`; AD-029 in `.specs/STATE.md:30` |
| T11 | ✅ Done | `scripts/smoke-hours-calendar.mjs` (19 checks); recorded run 19/19 and `smoke-time.mjs` 26/26 in `94f107d`'s body. Not re-run by the Verifier (spawns sessions, writes owner data) |

---

## Gate Check

- **Commands** (Full gate from tasks.md): `npm run typecheck && npm run lint && npm test`
- typecheck: exit 0
- lint: exit 0, **0 errors / 18 warnings** — equals the recorded baseline, no increase
- test: exit 0, **893 passed / 0 failed / 0 skipped** (55 files)
- **Test count before feature**: 865 (tasks.md baseline) → **after**: 893 → **delta +28**, all in `src/renderer/src/lib/hours-calendar.test.ts`
- **Test integrity**: `git diff c27b412..94f107d --stat -- '*.test.ts'` shows only `hours-calendar.test.ts` (+409); no existing test edited or removed. `scripts/smoke-time.mjs` unchanged in the range.

---

## Spec-Anchored Acceptance Criteria

Unit = `src/renderer/src/lib/hours-calendar.test.ts`. Smoke = `scripts/smoke-hours-calendar.mjs`, checks numbered in execution order (1 Mon–Fri order · 2 weekend rule · 3 header buttons/names · 4 one today · 5 default today + detail · 6 one day card · 7 parallel side by side · 8 min height · 9 ongoing/`now` · 10 hover tooltip · 11 legend folders · 12 header click · 13 bar click focus · 14 growth + stable colour · 15 ◀ reset · 16 ▶ future dimmed, no bars · 17 empty week text · 18 This week · 19 delete fallback); manual evidence from the recorded 19/19 run. Code = implementation read by the Verifier.

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Outcome |
| -- | -------------------- | ---------------------------------- | ------- |
| HCAL-01 | Mon–Fri always, in order | Unit `hours-calendar.test.ts:59` `expect(dates(cols)).toEqual([14,15,16,17,18])` on an empty week; smoke 1 `weekdays.every((h,i) => labels[i]?.startsWith(h))` | ✅ PASS |
| HCAL-02 | Sat/Sun added only when that day holds time | Unit `:76` `toEqual([14..18,19])`, `:85` `toEqual([14..18,20])`, `:59` none when empty; smoke 2 `weekendExpected === weekendShown && labels.length === 5 + n` | ✅ PASS |
| HCAL-03 | Header: weekday, date, union total | Unit `:97` `expect(wednesday?.totalMs).toBe(3 * HOUR)` (9–11 ∪ 10–12), `:99` others 0; smoke 3 regex `^\d{2}/\d{2}/\d{4} \(\S+\), \d+h\d{2}$`; code `HoursCalendar.tsx:74-81` | ✅ PASS |
| HCAL-04 | Today's column highlighted only in its week | Unit `:105` `isToday` `[f,f,t,f,f]`, `:109` none in a past week; smoke 4 exactly one `.today` = today; code `HoursCalendar.css` `.hcal-head.today`, `.hcal-col.today` | ✅ PASS |
| HCAL-05 | Days after today dimmed, no bars | Unit `:106` `isFuture` `[f,f,f,t,t]`; code `HoursCalendar.tsx:97` (no entries when `isFuture`); smoke 16 `next.future && next.dim && next.bars === 0` | ✅ PASS |
| HCAL-06 | Header range, total, ◀ ▶ This week unchanged | Header JSX untouched in the diff; smoke 15–18; `smoke-time.mjs:252-261` (opens on current week, ◀, This week, ▶) passed 26/26 unedited | ✅ PASS (manual) |
| HCAL-07 | Empty week: columns empty + `No time recorded this week.` | Unit `:67` every column `day === null && totalMs === 0`; code `HoursView.tsx:191`; smoke 17 `nextEmpty.includes('No time recorded this week.')` | ✅ PASS |
| HCAL-08 | Each merged block a bar from start to end on the axis | Unit `:375-376` 12:00–13:30 on 09–18 → `topPct ≈ 100/3`, `heightPct ≈ 100/6`; code `HoursCalendar.tsx:115-121` one `Bar` per `group.blocks` entry | ✅ PASS |
| HCAL-09 | Earliest start → latest end, rounded out, ≥ 8 h, shared, labelled hour lines | Unit `:121` 09:10–17:40 → `{9,18}`; `:126/129/132` widen + clamp; `:142` cross-day `{3,18}`; `:146` empty `{9,17}`; code axis labels `HoursCalendar.tsx:86-91`, gridlines `.hcal-col` background | ⚠️ PASS with **weak discrimination** — mutant M8 (round instead of floor) survives; see gaps |
| HCAL-10 | Overlapping blocks in side-by-side lanes dividing the width; none over another | Unit `:180-221` exact `[lane, lanes]` for disjoint, pair, chain, nested, four; `:231` no same-lane overlap; smoke 7 `win.x+win.w <= sys.x` and each `< 0.6 × colW` | ⚠️ PASS with **weak discrimination** — mutants M10, M12, M13 survive; see gaps |
| HCAL-11 | Top-3 tasks → 3 colours; other tasks → shared Other; task-less → separate neutral | Unit `:262-264` slot1/2/3 by week total, `:270-271` tie by first start, `:285` 4th/5th `other`, `:297-299` folder `no-task`, one task → only `slot1`; code `HoursCalendar.css` `.role-slot1..3`, `.role-other` fill, `.role-no-task` outline. Colour rendering not smoke-checked (ad-hoc sessions have no task) | ✅ PASS |
| HCAL-24 | Colours fixed while the week is shown; recomputed on week change / reopen | Unit `:329-338` `roleOf(frozen, …)` keeps `task:1 slot1` after task 2 overtakes it, new task `other`; code `HoursView.tsx:105-113`; smoke 14 `grow1.bg === grow0.bg` and class unchanged | ✅ PASS |
| HCAL-12 | Minimum bar height; any block visible and activatable | Code `HoursCalendar.css` `.hcal-bar { height: max(6px, …) }` + 4 px `::before` halo; smoke 8 `win.h >= 5.5` on a sub-minute block | ⚠️ Spec-precision gap — the spec gives no value; 6 px lives only in design/tasks |
| HCAL-13 | Midnight-crossing block drawn per day | Unit `:402-407` Mon part ends at 100 %, Tue part `topPct 0`, `heightPct ≈ 1/24` | ✅ PASS |
| HCAL-14 | No stacked newest-first day list | Code `HoursView.tsx:203-210` renders one `DayCard`; smoke 6 `querySelectorAll('.hours-day').length === 1`; TIME-34 marked superseded `time-tracking/spec.md:267` | ✅ PASS (manual) |
| HCAL-15 | Detail panel for one day with groups, blocks, raw periods, edit, delete, Copy per TIME-35..41, 44..49 | Code `HoursView.tsx:204-210` (same `DayCard`, prop optional); smoke 13 expanded block lists `.period-row`; `smoke-time.mjs:266-330` Copy / raw periods / edit rejection / delete, 26/26 unedited | ✅ PASS (manual) |
| HCAL-16 | Open / week change → today if in week, else latest day with time | Unit `:346` today even without time, `:357` latest (Sat 19) in a past week; code `HoursView.tsx:115-121`; smoke 5, 15, 18 | ✅ PASS |
| HCAL-17 | Empty week → panel says no day to show | Unit `:361` `defaultDay(...)` `toBeNull()`; code `HoursView.tsx:212-214` `'No day to show.'`; smoke 17 | ✅ PASS |
| HCAL-18 | Header activation selects the day | Code `HoursCalendar.tsx:75`; smoke 12 `pressedLabel().startsWith(monday) && detail includes monday` | ✅ PASS (manual) |
| HCAL-19 | Bar activation selects its day, highlights and expands its block | Code `HoursCalendar.tsx:128`, `HoursView.tsx:329-337`; smoke 13 `focused.group === 'No task · Windows' && expanded === 'true' && periods >= 1` | ✅ PASS (manual) |
| HCAL-20 | Headers and bars are keyboard-operable buttons named day+total / label+range+duration | Code `HoursCalendar.tsx:62,74` and `:172,184` (`<button type="button">`, `aria-label`); smoke 3 headers `tagName === 'BUTTON'` + name regex; smoke 9 bar name `, HH:MM–now, XhMM`. Bar `tagName` not asserted in smoke; keyboard operation follows from native `<button>` | ✅ PASS (manual + code) |
| HCAL-21 | Legend: every task and folder incl. Other's members, colour + week total | Unit `:314-320` exact `[label, role, totalMs]` list; code `HoursLegend.tsx:22-48`; smoke 11 both folders with outlined swatches | ✅ PASS |
| HCAL-22 | Hover **or focus** shows label, `HH:MM–HH:MM` range, duration | Code `HoursCalendar.tsx:188-195`, CSS `:hover .hcal-tip, :focus-visible .hcal-tip`; smoke 10 asserts duration and range on hover only (`/^\d+h\d{2}\d{2}:\d{2}–now/`) — neither the label nor the focus path is asserted | ⚠️ Partial evidence (code-read for label and focus) |
| HCAL-23 | Open block ends at now, ongoing marker, grows at TIME-42 refresh | Unit `:386-393` ongoing today ends at 14:30, earlier-day part not ongoing; code `.hcal-bar.ongoing::after`; smoke 9 class `ongoing` + `–now`; smoke 14 `heightVar` grows after 65 s | ✅ PASS |

### Edge cases

- [x] Four+ overlapping blocks narrow evenly — unit `:215` four lanes `[i, 4]`. Label hidden when too narrow, tooltip kept — code only (`HoursCalendar.css` `@container (max-height: 35px) or (max-width: 63px)`), no assertion; "too narrow for text" is unquantified in the spec (⚠️ spec-precision gap).
- [x] Switch to a week where the previous weekday is empty → HCAL-16 again — code `HoursView.tsx:120` (week change always resets); smoke 15.
- [x] Only a sub-minute block → 8 h axis around it — unit `:152-153` `{9,17}`, span 8.
- [x] Weekend column appears/disappears, others keep order — unit `:76`, `:85` order preserved; CSS grid `repeat(var(--hcal-cols), …)`.
- [x] Selected day's last period deleted → HCAL-16 fallback — code `HoursView.tsx:120` (`hadTime && !selectedDay`); smoke 19.

**Status**: all 24 ACs and 5 edge cases carry evidence; 2 spec-precision gaps (HCAL-12, narrow-lane label); 1 partial (HCAL-22 label/focus); 4 surviving mutants on HCAL-09/10.

---

## Discrimination Sensor

Scratch: `git worktree add --detach …\tmp\verify-wt 94f107d` with a `node_modules` junction; baseline in scratch 28/28. Each mutant applied to scratch `src/renderer/src/lib/hours-calendar.ts`, then `npx vitest run src/renderer/src/lib/hours-calendar.test.ts`. Real tree `git status --porcelain` empty before and after; worktree removed.

| # | Line (`hours-calendar.ts`) | Mutation | Killed? |
| - | -------------------------- | -------- | ------- |
| M1 | `hours-calendar.ts:51` | weekend never skipped (`offset >= 7`) | ✅ Killed (5 fail) |
| M2 | `hours-calendar.ts:51` | Sunday dropped even with time | ✅ Killed |
| M3 | `hours-calendar.ts:56` | `isFuture` `>` → `>=` | ✅ Killed |
| M4 | `hours-calendar.ts:81` | no widening to 8 h | ✅ Killed |
| M5 | `hours-calendar.ts:82-83` | widening all at the end | ✅ Killed |
| M6 | `hours-calendar.ts:85` | no clamp at 0 | ✅ Killed |
| M7 | `hours-calendar.ts:89` | no clamp at 24 | ✅ Killed |
| M8 | `hours-calendar.ts:75` | axis start `Math.floor` → `Math.round` | ❌ **Survived** |
| M9 | `hours-calendar.ts:128` | a lane is never reused | ✅ Killed |
| M10 | `hours-calendar.ts:128` | lane reuse `end <= start` → `end < start` | ❌ **Survived** |
| M11 | `hours-calendar.ts:121` | cluster lanes = cluster size | ✅ Killed |
| M12 | `hours-calendar.ts:127` | close cluster `>=` → `>` | ❌ **Survived** |
| M13 | `hours-calendar.ts:127` | cluster never closes (whole day one cluster) | ❌ **Survived** |
| M14 | `hours-calendar.ts:182` | colour tie-break reversed | ✅ Killed |
| M15 | `hours-calendar.ts:182` | ranking ascending | ✅ Killed |
| M16 | `hours-calendar.ts:193` | folders compete for slots | ✅ Killed |
| M17b | `hours-calendar.ts:194` | slots wrap round (4th task → slot1) | ✅ Killed |
| M18 | `hours-calendar.ts:201` | task unseen at freeze → `slot1` | ✅ Killed |
| M19 | `hours-calendar.ts:213` | legend not sorted by role | ✅ Killed |
| M20 | `hours-calendar.ts:222` | default day ignores today | ✅ Killed |
| M21 | `hours-calendar.ts:224` | default day = earliest with time | ✅ Killed |
| M22 | `hours-calendar.ts:242` | ongoing = any open period (ignores `now`) | ✅ Killed |
| M23 | `hours-calendar.ts:243` | open bar not extended to now | ➖ Equivalent — the report already ends open periods at `now` (`hours-report.ts:70`) and `HoursView` passes the same `now` to both |
| M25 | `hours-calendar.ts:31` | next midnight not mapped to hour 24 | ✅ Killed |

(M17 — a fourth `SLOTS` entry `'other'` — was discarded as equivalent by construction and replaced by M17b. M24, bar top ignoring the axis start: ✅ Killed.)

**Survivors confirmed non-equivalent**: a scratch-only probe test (deleted with the worktree) passed on the real code and killed each one — M8 by a 09:40 start (floor 9 vs round 10, which would clip the bar above the axis); M10 by `[9–11, 10–12, 11–12]` (the 11–12 block should reuse lane 0 of 2, the mutant opens a third lane); M12 and M13 by a parallel pair followed by a lone block at 11–12 and 14–15 (each lone block should be `[0, 1]` full width; the mutants draw it at half width).

**Sensor depth**: expanded (25 mutations; the module is the feature's core logic)
**Sensor tally**: 20 killed, 4 survived, 1 equivalent — ❌ FAIL

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / no scope creep | ✅ — `time-format.ts` change is one `export`; no list/calendar toggle, no drag |
| Surgical changes | ✅ — `buildWeekReport`, `hours-copy`, header JSX untouched; `DayCard` gains one optional prop |
| Matches patterns | ✅ — pure model + component split as `hours-report`; render-phase state adjustment as elsewhere |
| Spec-anchored outcome check | ✅ — unit assertions target exact values (lane tuples, hours, roles, totals) |
| Per-layer coverage (pure logic 1:1 to ACs, edge cases) | ⚠️ — HCAL-09 / HCAL-10 edge behaviour under-discriminated (M8, M10, M12, M13) |
| Every test maps to a spec requirement | ✅ — each of the 28 tests names its HCAL id or edge case |
| Guidelines followed: `.specs/codebase/TESTING.md`, tasks.md Test Coverage Matrix (renderer via CDP smoke) | ✅ |

---

## Fix Plans

### Fix 1: Lane clustering after a parallel stretch (M12, M13) — Major

- **Root cause**: every `layoutLanes` test passes a single cluster, so the cluster-closing rule (`hours-calendar.ts:127`) is never exercised; a lone block following parallel ones could be drawn at partial width with no test failing.
- **Fix task**: in `hours-calendar.test.ts`, lay out one day holding a parallel pair and later lone blocks (one touching the pair's end, one well after) and assert the lone blocks are `[0, 1]` and the pair `[0, 2]`, `[1, 2]`.
- **Done when**: M12 and M13 are killed.

### Fix 2: Lane reuse at a touching boundary inside a cluster (M10) — Minor

- **Fix task**: assert `[9–11, 10–12, 11–12]` → `[0,2]`, `[1,2]`, `[0,2]` (a block starting exactly when a lane frees takes that lane).
- **Done when**: M10 is killed.

### Fix 3: Axis rounds the start down, not to nearest (M8) — Minor

- **Fix task**: add a `timeAxis` case whose earliest start is past the half hour (e.g. 09:40–17:40 → `{9, 18}`).
- **Done when**: M8 is killed.

### Optional (spec hygiene, not blocking)

- HCAL-12: state the minimum bar height (6 px) in the spec, or keep it design-only and accept the smoke threshold.
- Narrow-lane edge case: define "too narrow for text" (the CSS uses 64 × 36 px).
- HCAL-22: extend smoke check 10 to assert the group label in the tooltip.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HCAL-01..08, 11..24 | Implemented | ✅ Verified |
| HCAL-09 | Implemented | ❌ Needs Fix (test strength, Fix 3) |
| HCAL-10 | Implemented | ❌ Needs Fix (test strength, Fixes 1–2) |

---

## Summary

**Overall**: ❌ Not Ready — test-only fixes needed

**Spec-anchored check**: 24/24 ACs evidenced; 2 spec-precision gaps; HCAL-22 partial (label/focus by code read)
**Sensor**: 20/24 non-equivalent mutants killed
**Gate**: 893 passed, 0 failed; lint 0 errors / 18 warnings (baseline); typecheck clean

**What works**: columns and weekend rule, axis widening/clamping, colour ranking and freezing, legend, default day, bar placement, ongoing detection; the renderer wiring matches every renderer AC on reading and in the recorded 19/19 + 26/26 smoke runs.

**Next steps**: implement Fixes 1–3 (tests only), re-run the Verifier.
