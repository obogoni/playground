# Hours Calendar — Verifier Report (round 2)

**Date**: 2026-09-19
**Spec**: `.specs/features/hours-calendar/spec.md` (HCAL-01..24 + 5 edge cases, as amended in `be5d8ab`)
**Diff range**: `c27b412..be5d8ab` (T1..T11 `c27b412..94f107d`, round-1 report `82862a0`, fix `be5d8ab`)
**Verifier**: independent sub-agent (author ≠ verifier); evidence re-derived from the spec, not from `tasks.md` checkmarks or commit messages

## Validation: hours-calendar — PASS

Gate green (896 tests), all 24 ACs and 5 edge cases carry evidence, and the full sensor kills 24 of 24 non-equivalent mutants in `hours-calendar.ts`. The four round-1 survivors are now killed by the tests added in `be5d8ab`. Production code is unchanged since `94f107d` (`git diff 94f107d..be5d8ab --stat -- src` touches only `hours-calendar.test.ts`).

---

## Round history

| Round | Range | Verdict | Why |
| ----- | ----- | ------- | --- |
| 1 | `c27b412..94f107d` | not done | 4 surviving mutants: M8 (axis start `floor`→`round`, HCAL-09), M10 (lane reuse at a touching boundary), M12 / M13 (cluster closing, HCAL-10); spec-precision gaps on HCAL-12 and the narrow-lane edge case; HCAL-22 label asserted by code read only. Lessons L-023..L-026 recorded (committed in `82862a0`) |
| 2 | `c27b412..be5d8ab` | done | `be5d8ab` adds three unit tests (`hours-calendar.test.ts:124`, `:228`, `:241`), puts 6 px in HCAL-12 and 64 × 36 px in the edge case, and extends smoke check 10 to the group label. All round-1 gaps closed; see below for the one caveat on smoke check 10 |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T5 | ✅ Done | Pure module; 31 unit tests in `hours-calendar.test.ts` (28 + 3 from the fix) |
| T6 | ✅ Done | `focus` prop on `DayCard` / `GroupSection` / `BlockLine` (`HoursView.tsx:329-337`) |
| T7 | ✅ Done | `HoursCalendar.tsx` + `.css` |
| T8 | ✅ Done | `HoursLegend.tsx` + `.css` |
| T9 | ✅ Done | `HoursView.tsx:97-218` |
| T10 | ✅ Done | TIME-34 annotated in `time-tracking/spec.md:267`; AD-029 in `.specs/STATE.md:30` |
| T11 | ✅ Done | `scripts/smoke-hours-calendar.mjs` (19 checks); recorded run 19/19 and `smoke-time.mjs` 26/26 (commit `94f107d`). Not re-run by the Verifier (spawns sessions, writes owner data) |
| Fix (round 1) | ✅ Done | `be5d8ab` — tests only, plus spec wording and smoke check 10 |

---

## Gate Check

- **Commands** (Full gate from tasks.md): `npm run typecheck && npm run lint && npm test`, run on `be5d8ab`
- typecheck: exit 0
- lint: exit 0, **0 errors / 18 warnings** — equals the baseline
- test: exit 0, **896 passed / 0 failed / 0 skipped** (55 files)
- **Test count before feature**: 865 → **after**: 896 → **delta +31**, all in `src/renderer/src/lib/hours-calendar.test.ts`
- **Test integrity**: across `c27b412..be5d8ab` the only `*.test.ts` touched is `hours-calendar.test.ts`; `be5d8ab` only adds tests to it (+28 lines, no deletions). `scripts/smoke-time.mjs` unchanged.

---

## Spec-Anchored Acceptance Criteria

Unit = `src/renderer/src/lib/hours-calendar.test.ts` (line numbers at `be5d8ab`). Smoke = `scripts/smoke-hours-calendar.mjs`, checks numbered in execution order (1 Mon–Fri order · 2 weekend rule · 3 header buttons/names · 4 one today · 5 default today + detail · 6 one day card · 7 parallel side by side · 8 min height · 9 ongoing/`now` · 10 hover tooltip · 11 legend folders · 12 header click · 13 bar click focus · 14 growth + stable colour · 15 ◀ reset · 16 ▶ future dimmed, no bars · 17 empty week text · 18 This week · 19 delete fallback); manual evidence from the recorded 19/19 run. Code = implementation read by the Verifier.

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Outcome |
| -- | -------------------- | ---------------------------------- | ------- |
| HCAL-01 | Mon–Fri always, in order | Unit `hours-calendar.test.ts:59` `expect(dates(cols)).toEqual([14,15,16,17,18])` on an empty week; smoke 1 | ✅ PASS |
| HCAL-02 | Sat/Sun only when that day holds time | Unit `hours-calendar.test.ts:76` `[..,19]`, `hours-calendar.test.ts:85` `[..,20]`; smoke 2 | ✅ PASS |
| HCAL-03 | Header: weekday, date, union total | Unit `hours-calendar.test.ts:97` `toBe(3 * HOUR)` for 9–11 ∪ 10–12, `:99` others 0; smoke 3 name regex; code `HoursCalendar.tsx:74-81` | ✅ PASS |
| HCAL-04 | Today highlighted only in its week | Unit `hours-calendar.test.ts:105`, `:109`; smoke 4; CSS `.hcal-head.today`, `.hcal-col.today` | ✅ PASS |
| HCAL-05 | Later days dimmed, no bars | Unit `hours-calendar.test.ts:106`; code `HoursCalendar.tsx:97`; smoke 16 `next.future && next.dim && next.bars === 0` | ✅ PASS |
| HCAL-06 | Header range, total, ◀ ▶ This week unchanged | Header JSX untouched in the diff; smoke 15–18; `smoke-time.mjs:252-261` passed 26/26 unedited | ✅ PASS (manual) |
| HCAL-07 | Empty week: empty columns + `No time recorded this week.` | Unit `hours-calendar.test.ts:67`; code `HoursView.tsx:191`; smoke 17 | ✅ PASS |
| HCAL-08 | Each merged block a bar, start to end | Unit `hours-calendar.test.ts:403-404` 12:00–13:30 on 09–18 → `topPct ≈ 100/3`, `heightPct ≈ 100/6`; code `HoursCalendar.tsx:115-121` | ✅ PASS |
| HCAL-09 | Earliest start → latest end, rounded out, ≥ 8 h, shared, labelled hour lines | Unit `hours-calendar.test.ts:121` 09:10–17:40 → `{9,18}`; **`hours-calendar.test.ts:126` 09:40–17:40 → `toEqual({ startHour: 9, endHour: 18 })`** (new; kills M8); `:131/134/137` widen + clamp; `:147` cross-day `{3,18}`; `:151` empty `{9,17}`; code `HoursCalendar.tsx:86-91` | ✅ PASS |
| HCAL-10 | Overlapping blocks in side-by-side lanes dividing the width; none over another | Unit `hours-calendar.test.ts:185-226` exact `[lane, lanes]` (disjoint, pair, chain, nested, four); **`hours-calendar.test.ts:233` pair then touching 12–13 and later 15–16 → `[[0,2],[1,2],[0,1],[0,1]]`** (new; kills M12, M13); **`hours-calendar.test.ts:244` `[9–11,10–12,11–12]` → `[[0,2],[1,2],[0,2]]`** (new; kills M10); `:259` no same-lane overlap; smoke 7 | ✅ PASS |
| HCAL-11 | Top-3 tasks → 3 colours; Other shared; task-less separate | Unit `hours-calendar.test.ts:290-292`, `:298-299` tie-break, `:313` 4th/5th `other`, `:325-327` folder `no-task`, single task `slot1` only; CSS `.role-*` | ✅ PASS |
| HCAL-24 | Colours fixed while shown; recomputed on week change / reopen | Unit `hours-calendar.test.ts:357-366` frozen roles survive an overtake, new task `other`; code `HoursView.tsx:105-113`; smoke 14 `grow1.bg === grow0.bg` | ✅ PASS |
| HCAL-12 | Minimum bar height **6 px** (now in spec) | CSS `HoursCalendar.css` `.hcal-bar { height: max(6px, calc(var(--bar-height) - 2px)) }` = spec value exactly; smoke 8 `win.h >= 5.5` on a sub-minute block (0.5 px sub-pixel tolerance) | ✅ PASS (manual + code) — round-1 precision gap closed |
| HCAL-13 | Midnight-crossing block drawn per day | Unit `hours-calendar.test.ts:430-435` Mon part ends at 100 %, Tue part `topPct 0` | ✅ PASS |
| HCAL-14 | No stacked newest-first list | Code `HoursView.tsx:203-210`; smoke 6 `.hours-day` count `=== 1`; `time-tracking/spec.md:267` | ✅ PASS (manual) |
| HCAL-15 | Detail panel per TIME-35..41, 44..49 | Code `HoursView.tsx:204-210` (same `DayCard`); smoke 13; `smoke-time.mjs:266-330` Copy / raw periods / edit / delete, 26/26 unedited | ✅ PASS (manual) |
| HCAL-16 | Open / week change → today, else latest day with time | Unit `hours-calendar.test.ts:374`, `:385`; code `HoursView.tsx:115-121`; smoke 5, 15, 18 | ✅ PASS |
| HCAL-17 | Empty week → no day to show | Unit `hours-calendar.test.ts:389` `toBeNull()`; code `HoursView.tsx:212-214`; smoke 17 | ✅ PASS |
| HCAL-18 | Header activation selects the day | Code `HoursCalendar.tsx:75`; smoke 12 | ✅ PASS (manual) |
| HCAL-19 | Bar activation selects day, highlights + expands block | Code `HoursCalendar.tsx:128`, `HoursView.tsx:329-337`; smoke 13 `expanded === 'true' && periods >= 1` | ✅ PASS (manual) |
| HCAL-20 | Keyboard-operable buttons with the named accessible names | Code `HoursCalendar.tsx:62,74` and `:172,184`; smoke 3 (headers `BUTTON` + name), smoke 9 (bar name) | ✅ PASS (manual + code) |
| HCAL-21 | Legend: every task and folder incl. Other's members, with totals | Unit `hours-calendar.test.ts:342-348` exact list; code `HoursLegend.tsx:22-48`; smoke 11 | ✅ PASS |
| HCAL-22 | Hover or focus shows label, range, duration | Code `HoursCalendar.tsx:188-195` (`strong` duration, range span, label span) and CSS `:hover .hcal-tip, :focus-visible .hcal-tip`; smoke 10 now asserts `/^\d+h\d{2}\d{2}:\d{2}–nowNo task · Windows$/` — see the note below | ✅ PASS (manual + code, one caveat) |
| HCAL-23 | Open block ends at now, ongoing marker, grows | Unit `hours-calendar.test.ts:414-421`; CSS `.hcal-bar.ongoing::after`; smoke 9 and 14 | ✅ PASS |

**Smoke check 10 caveat (HCAL-22).** The revised check has **not been run live**. It is acceptable as manual evidence, but with less weight than an executed check:
- The recorded tooltip text is `0h0017:35–nowNo task · Windows`. The regex matches it: duration `0h00`, then range `17:35–now`, then the label with the empty key span contributing nothing.
- That concatenation is exactly what the tooltip markup's `textContent` produces (`HoursCalendar.tsx:188-195`).
- The hovered bar is `winBar`, which `barIn` finds by the `No task · Windows, ` prefix of its accessible name. So the hard-coded label is the right one.
- **But the recorded text is not stored in the repo.** It is in neither `94f107d`'s body nor any committed file, so this report cannot cite it independently.
- The focus path (`:focus-visible`) is still evidenced by the code only.

Next time the smoke runs live, confirm check 10 passes as written. This is not blocking: the rendering path is unchanged and no production code moved.

### Edge cases

- [x] Four+ overlapping blocks narrow evenly — unit `hours-calendar.test.ts:220` `[i, 4]`. No direct label below 64 px wide or 36 px tall (now in spec) — CSS `@container (max-height: 35px) or (max-width: 63px) { .hcal-bar-label { display: none } }` matches the spec's thresholds exactly (35 < 36, 63 < 64); tooltip is separate (`.hcal-tip`) and unaffected. Code evidence only; renderer has no unit tests by convention.
- [x] Switch to a week where the prior weekday is empty → HCAL-16 — code `HoursView.tsx:120`; smoke 15.
- [x] Only a sub-minute block → 8 h axis — unit `hours-calendar.test.ts:157-158` `{9,17}`, span 8.
- [x] Weekend column appears/disappears, order kept — unit `hours-calendar.test.ts:76`, `:85`; CSS grid `repeat(var(--hcal-cols), …)`.
- [x] Selected day's last period deleted → HCAL-16 fallback — code `HoursView.tsx:120`; smoke 19.

**Status**: all 24 ACs and 5 edge cases evidenced; no open spec-precision gaps; one non-blocking caveat (smoke check 10 revision not yet executed live).

---

## Discrimination Sensor

Scratch: `git worktree add --detach …\tmp\verify-wt be5d8ab` with a `node_modules` junction; unmutated baseline in scratch 31/31. Each mutant applied to scratch `src/renderer/src/lib/hours-calendar.ts`, then `npx vitest run src/renderer/src/lib/hours-calendar.test.ts`. Real tree `git status --porcelain` empty before and after; junction and worktree removed.

| # | Line (`hours-calendar.ts`) | Mutation | Round 1 | Round 2 |
| - | -------------------------- | -------- | ------- | ------- |
| M1 | `hours-calendar.ts:51` | weekend never skipped | Killed | ✅ Killed (5 fail) |
| M2 | `hours-calendar.ts:51` | Sunday dropped even with time | Killed | ✅ Killed |
| M3 | `hours-calendar.ts:56` | `isFuture` `>` → `>=` | Killed | ✅ Killed |
| M4 | `hours-calendar.ts:81` | no widening to 8 h | Killed | ✅ Killed |
| M5 | `hours-calendar.ts:82-83` | widening all at the end | Killed | ✅ Killed |
| M6 | `hours-calendar.ts:85` | no clamp at 0 | Killed | ✅ Killed |
| M7 | `hours-calendar.ts:89` | no clamp at 24 | Killed | ✅ Killed |
| M8 | `hours-calendar.ts:75` | axis start `floor` → `round` | Survived | ✅ **Killed** |
| M9 | `hours-calendar.ts:128` | a lane is never reused | Killed | ✅ Killed |
| M10 | `hours-calendar.ts:128` | lane reuse `<=` → `<` | Survived | ✅ **Killed** |
| M11 | `hours-calendar.ts:121` | cluster lanes = cluster size | Killed | ✅ Killed |
| M12 | `hours-calendar.ts:127` | close cluster `>=` → `>` | Survived | ✅ **Killed** |
| M13 | `hours-calendar.ts:127` | cluster never closes | Survived | ✅ **Killed** |
| M14 | `hours-calendar.ts:182` | colour tie-break reversed | Killed | ✅ Killed |
| M15 | `hours-calendar.ts:182` | ranking ascending | Killed | ✅ Killed |
| M16 | `hours-calendar.ts:193` | folders compete for slots | Killed | ✅ Killed |
| M17b | `hours-calendar.ts:194` | slots wrap round (4th task → slot1) | Killed | ✅ Killed |
| M18 | `hours-calendar.ts:201` | task unseen at freeze → `slot1` | Killed | ✅ Killed |
| M19 | `hours-calendar.ts:213` | legend not sorted by role | Killed | ✅ Killed |
| M20 | `hours-calendar.ts:222` | default day ignores today | Killed | ✅ Killed |
| M21 | `hours-calendar.ts:224` | default day = earliest with time | Killed | ✅ Killed |
| M22 | `hours-calendar.ts:242` | ongoing = any open period | Killed | ✅ Killed |
| M23 | `hours-calendar.ts:243` | open bar not extended to now | Equivalent | ➖ Equivalent — the report already ends open periods at `now` (`hours-report.ts:70`), and `HoursView` passes the same `now` to both |
| M24 | `hours-calendar.ts:248` | bar top ignores axis start | Killed | ✅ Killed |
| M25 | `hours-calendar.ts:31` | next midnight not mapped to hour 24 | Killed | ✅ Killed |

**Sensor depth**: expanded (25 mutations; the module is the feature's core logic)
**Sensor tally**: 24 / 24 non-equivalent mutants killed, 1 equivalent — ✅

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / no scope creep | ✅ |
| Surgical changes | ✅ — the fix touches only tests, spec wording and one smoke regex |
| Matches patterns | ✅ — new tests reuse the file's `block` / `lay` / `placeOf` / `report` helpers |
| Spec-anchored outcome check | ✅ — new assertions pin exact `[lane, lanes]` tuples and exact hours |
| Per-layer coverage (pure logic 1:1 to ACs, edge cases) | ✅ — every `hours-calendar.ts` branch sampled by the sensor is discriminated |
| Every test maps to a spec requirement | ✅ — all 31 tests name their HCAL id or edge case |
| Guidelines followed: `.specs/codebase/TESTING.md`, tasks.md Test Coverage Matrix | ✅ |

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HCAL-01..24 | Implemented (round 1: HCAL-09, HCAL-10 Needs Fix) | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 24/24 ACs and 5/5 edge cases evidenced; 0 open spec-precision gaps
**Sensor**: 24/24 non-equivalent mutants killed (M23 equivalent)
**Gate**: 896 passed, 0 failed; lint 0 errors / 18 warnings (baseline); typecheck clean

**Open note**: run `smoke-hours-calendar.mjs` live once more (with the owner's consent) to execute the revised check 10.
