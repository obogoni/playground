# Hours Hatching Validation

## Validation: hours-hatching — PASS

> **Renumbered after round 2 (2026-10-03):** the decision this report cites was recorded as AD-054 and is now AD-055, because PR #158 (#146) took AD-054 first. Only the number changed.

**Latest round**: round 2 (2026-10-03, `ee17201..4ec1a17`) passed; F1 resolved, hatch recipe
changed by the owner and re-verified. See "Round 2" at the end; the round 1 rows for HHAT-17, 22 and
29 below describe the first recipe and are superseded there.

**Date**: 2026-10-03
**Spec**: `.specs/features/hours-hatching/spec.md` (HHAT-01..29 + 5 edge cases)
**Diff range**: `6d96ae4..18f1970` (`6d96ae4` = `origin/main`); plan commits `6482061`, `292b596`;
implementation `7ca7441..18f1970`
**Verifier**: independent sub-agent (author ≠ verifier), fresh context

The production code implements the spec's rule as written: `assignColours`
(`src/renderer/src/lib/hours-calendar.ts:220-257`) excludes same-day looks and the previous look
(`:245`), ranks by `uses × 4 + hatched × 2 + avoided` (`:241-242`), so the order is fewest uses, then
solid before hatched, then hue preference, then palette order (first lowest in `LOOKS`, `:162`), and
keeps `previous` across an Other (`:248-254`). No production defect found.

Verdict under the owner's loop budget: FAIL only for a production defect or an AC with no evidence at
all. There is neither. Two unit mutants on the HHAT-05 tie-break survived (the tie only matters
in weeks of more than sixteen tasks): see Follow-ups F1. Under the skill's default rule that would be
a fix task; it is recorded as the top-ranked follow-up instead.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T15 | ✅ Done | All Done-when boxes ticked in `tasks.md`; re-checked below rather than taken as evidence |

---

## Spec-Anchored Acceptance Criteria

Unit file: `src/renderer/src/lib/hours-calendar.test.ts` (abbreviated `test.ts`). Smoke file:
`scripts/smoke-hours-calendar.mjs` (abbreviated `smoke.mjs`). Smoke line numbers are the `check(`
call.

| Req | Spec-defined outcome | `file:line` + assertion | Result |
| --- | -------------------- | ----------------------- | ------ |
| HHAT-01 | 16 looks: 8 hues in palette order, solid and hatched | `hours-calendar.ts:147` `ColourRole = Slot \| \`${Slot}-hatched\` \| …`, `:162` `LOOKS`; `test.ts:626` `expect(lookClass('slot1')).toBe('role-slot1')`, `:631` `expect(lookClass('slot3-hatched')).toBe('role-slot3 hatched')`; `test.ts:490` `toEqual([...SOLIDS, ...HATCHES])` (all sixteen worn) | ✅ PASS |
| HHAT-02 | Order by week total, ties by earlier first start | `test.ts:345-347` task 3 (4 h) `slot1`, task 1 (3.5 h) `slot2`, task 2 `slot3`; `test.ts:360-361` tie: task 9 (earlier start) `slot1`, task 8 `slot2` | ✅ PASS |
| HHAT-03 | Not a same-day look, not the previous task's look | `test.ts:354` `toBe('slot2')` (different days, previous excluded); `test.ts:536` `toBe('other')` (only free look is previous); property `test.ts:592` `new Set(dayLooks).size … toBe(dayLooks.length)` over 240 generated weeks | ✅ PASS |
| HHAT-04 | Fewest uses this week | `test.ts:446-460` seven lone tasks → `slot1`..`slot7`; `test.ts:557` 32 tasks → every look exactly 2 (`toEqual(… [look, 2])`); `test.ts:398` ninth same-day task `slot1-hatched` (unused beats used solid) | ✅ PASS |
| HHAT-05 | Solid before hatched on a use tie | `test.ts:398` `toBe('slot1-hatched')`, `test.ts:466-481` spread week eight solids then `slot1-hatched`, `slot2-hatched` — asserted values match the spec, but they are decided by HHAT-04 (fewest uses); no fixture has a use tie where fill decides (mutants U4, U5 survive) | ✅ PASS (evidence present; discrimination gap → F1) |
| HHAT-06 | Prefer a hue no same-day task holds and not the previous hue | `test.ts:506` `toBe('slot2-hatched')` (same-day hue skipped); `test.ts:515` `toBe('slot1-hatched')` not `slot8-hatched` (previous hue); `test.ts:526` `toBe('slot2')` (solid pick too, owner-confirmed scope) | ✅ PASS |
| HHAT-07 | Then palette order | `test.ts:383-392` eight same-day tasks `slot1`..`slot8`; `test.ts:490` sixteen → solids then hatched 1..8 | ✅ PASS |
| HHAT-08 | Never two consecutive coloured chips alike | `test.ts:586` `expect(role, where).not.toBe(chips[i])` over 240 generated weeks of 1–24 tasks; `test.ts:466-481` legend literal; smoke `smoke.mjs:1594` `chips.every((c, i) => i === 0 \|\| c.sig !== chips[i - 1].sig)` | ✅ PASS |
| HHAT-09 | ≤ 8 tasks: each its own solid | `test.ts:598-601` `looks.every(… SOLIDS.includes …)` with `:595` distinct, for every generated week with n ≤ 8; `test.ts:446-460` | ✅ PASS |
| HHAT-10 | ≤ 16 tasks: no two alike | `test.ts:595` `new Set(looks).size … toBe(n)` and `:596` `not.toContain('other')` for n ≤ 16; `test.ts:490`; smoke `smoke.mjs:937` 14 signatures on the seeded Sunday | ✅ PASS |
| HHAT-11 | Same-day tasks never share | `test.ts:592` (property, every day of 240 weeks) | ✅ PASS |
| HHAT-12 | All 16 held on its days → Other | `test.ts:495-496` 16th `slot8-hatched`, 17th `toBe('other')` | ✅ PASS |
| HHAT-13 | Only free look is the previous one → Other | `test.ts:534-536` task 17 `toBe('other')` | ✅ PASS |
| HHAT-14 | Light slots 1–8 `#2f76e8 #eb6623 #28ae76 #dbab37 #e984b7 #0f6f19 #4e3ca6 #d10b47` | `HoursCalendar.css:22-29` (read: exact match, in order); smoke `smoke.mjs:213-216` `PALETTE.light` literal, `smoke.mjs:969` `offPalette.length === 0` on the eight solid bars' computed `backgroundColor` | ✅ PASS |
| HHAT-15 | Dark slots 1–8 `#2790da #b64906 #14a889 #bc8b03 #c90982 #117a2c #8c63f5 #f45468` | `HoursCalendar.css:11-18` (read: exact match, in order); `smoke.mjs:969` dark half of `PALETTE`; mutant S2 | ✅ PASS |
| HHAT-16 | Validator `--pairs all` exit 0, `#ffffff` light / `#221f1b` dark | Re-run by the Verifier 2026-10-03 (`<dataviz-skill-dir>/scripts/validate_palette.js`): light exit 0, dark exit 0, outputs identical to the spec's and AD-055's (`.specs/STATE.md:64`) | ✅ PASS |
| HHAT-17 | 45° stripes of the hue, 2 px in every 6 px, over `color-mix(in oklab, hue 20%, #fff)` | `HoursCalendar.css:193-196`; smoke `smoke.mjs:1631` `p?.image === stripes(PALETTE[t][0])` = `repeating-linear-gradient(45deg, rgb(..) 0px, rgb(..) 2px, rgba(0, 0, 0, 0) 2px, rgba(0, 0, 0, 0) 6px)` on bar, legend and drawer swatch, both themes; `smoke.mjs:1636` `p?.color === worn[t].ground` (probe's computed `color-mix(in oklab, <hue> 20%, #fff)`) and ground ≠ hue | ✅ PASS |
| HHAT-18 | Solid: hue fill, no stripes | `smoke.mjs:1649` `p?.image === 'none' && p.color === rgb(PALETTE[t][0])`, both themes, bar + both swatches | ✅ PASS |
| HHAT-19 | Other and No task never hatched | `test.ts:635-636` `lookClass('other')` → `'role-other'`, `lookClass('no-task')` → `'role-no-task'` (the only class source for all three surfaces) | ✅ PASS |
| HHAT-20 | Bars, legend swatch, drawer swatch show the same look | `HoursCalendar.tsx:193`, `HoursLegend.tsx:52`, `HoursView.tsx:486` all `lookClass(...)`; smoke `smoke.mjs:944` `b.chip === b.sig && b.row === b.sig` for all 14 seeded tasks (fill + stripes signature); mutant S1 | ✅ PASS |
| HHAT-21 | Swatches 14 × 14 px | `HoursLegend.css:84-85`, `HoursView.css:254-255`; smoke `smoke.mjs:1659` `Math.abs(p.w - 14) < 0.01 && Math.abs(p.h - 14) < 0.01` on legend and drawer swatches | ✅ PASS |
| HHAT-22 | H1 ≥ 15, H2 ≥ 15, H3 ≤ 12° and nearest own slot, both themes | Re-measured by the Verifier over the validator's own `lin` / OKLab / `deltaE` (table below): all 16 pass; matches AD-055 (`.specs/STATE.md:64`) to the decimal | ✅ PASS |
| HHAT-23 | Looks frozen while the week is shown | `HoursView.tsx:129-136` unchanged freeze; `test.ts:611-613` `roleOf(frozen, …)` keeps `slot1`, `slot2`, new task `other` | ✅ PASS |
| HHAT-24 | Hover/focus on a hatched chip, header or bar dims others to 30% | `smoke.mjs:1676` chip, `:1696` header + bar, `:1718` keyboard focus, all through `onlyFull` (`smoke.mjs:460-463`: own bars `opacity === 1`, others `Math.abs(b.opacity - 0.3) < 0.01`) | ✅ PASS |
| HHAT-25 | Click a hatched chip → only its days | `smoke.mjs:1731` one head, the seeded Sunday, chip pressed with ×; `:1746` × restores six days | ✅ PASS |
| HHAT-26 | Hover, pick, clear change no bar's look, stripes included | `smoke.mjs:1754` `sameLooks(list, looks)` over 7 states with `new Set(looks.values()).size === 14`; section 12 `smoke.mjs:1119` over 8 states | ✅ PASS |
| HHAT-27 | Seeded Sunday: 14 looks, 8 solid in palette hex order in both themes, then hatched 1–6, no Other | `smoke.mjs:937` `wornLooks.every((look, i) => look === expectedLooks[i])` (`role-slot1`..`role-slot8`, `role-slot1 hatched`..`role-slot6 hatched`) and 14 signatures; `smoke.mjs:969` palette hex in both themes | ✅ PASS |
| HHAT-28 | Spread week: no two consecutive chips alike | `smoke.mjs:1594`; `smoke.mjs:1602` eight solids then `role-slot1 hatched`, `role-slot2 hatched` in seed order | ✅ PASS |
| HHAT-29 | Hatched bar + both swatches: stripes in hue over the ground; solid twin none | `smoke.mjs:1631`, `:1636`, `:1649` (each over all three surfaces, both themes); mutants S1, S3, S4, S5 | ✅ PASS |

**Status**: ✅ 29/29 ACs covered with `file:line` evidence whose asserted value matches the spec's
literal outcome. No spec-precision gap: every AC states a literal outcome (look names, hex values,
14 px, 30%, the gradient recipe).

### Edge cases

- [x] More than sixteen tasks repeat by fewest uses — `test.ts:550-557`, thirty-two tasks dealt over
  seven days use every look exactly twice
- [x] A task first seen while the week is shown is Other — `test.ts:613` `roleOf(frozen, 'task:6')`
  → `'other'` (unchanged behaviour, HCAL-24)
- [x] A week of folders only assigns no look — `test.ts:401-407` `['no-task', 'no-task']`
- [x] A picked group with no time in the shown week wears the neutral swatch, never a hatched one —
  `HoursView.tsx:158-165` gives it `roleOf(colours, picked.key)`, which is `'other'` for any absent
  task; `lookClass('other')` is `'role-other'` (`test.ts:635`); smoke `smoke.mjs:1089` reads
  `role-other` on the kept chip. Exercised with a solid task only (F3)
- [x] Other does not count as the previous chip — `test.ts:539-547`, tasks 17 and 18 both Other;
  mutant U10 killed

---

## Hatch legibility (H1 to H3), re-measured 2026-10-03

Formulas from the design ("Hatch legibility"): ground = `color-mix(in oklab, hue 20%, #fff)`; mean =
linear-RGB blend, stripe share 1/3; H1 = `dE(hue, ground)`, H2 = `dE(mean, hue)`, H3 = OKLCH hue
distance between ground and hue, ground nearest its own slot's hue. ΔE is the dataviz validator's
OKLab ΔE ×100, unsimulated. Computed by a Verifier scratch script that copies the validator's
`lin`, OKLab and `deltaE` code; no script enters the repository.

| Slot | Light ground | Light mean | H1 | H2 | H3 | Dark ground | Dark mean | H1 | H2 | H3 |
| ---- | ------------ | ---------- | -- | -- | -- | ----------- | --------- | -- | -- | -- |
| blue | `#d5e5fd` | `#b3c9f6` | 36.5 | 27.7 | 1.3° | `#d7e9f9` | `#b5d1ef` | 31.6 | 23.8 | 0.2° |
| orange | `#ffe2d6` | `#f9c4b4` | 30.3 | 22.8 | 0.6° | `#f4dbd1` | `#e2bbae` | 38.6 | 29.9 | 0.8° |
| aqua | `#daefe3` | `#b7dcc7` | 28.9 | 21.5 | 0.9° | `#d9eee6` | `#b5dacd` | 29.4 | 21.9 | 2.0° |
| yellow | `#f8efdb` | `#efdbb9` | 21.8 | 16.0 | 1.5° | `#f2e8d5` | `#e2cfb2` | 28.9 | 21.7 | 0.2° |
| magenta | `#fde7f0` | `#f7cddf` | 23.8 | 17.4 | 1.5° | `#fad6e5` | `#ebb3cb` | 40.2 | 31.3 | 0.0° |
| green | `#d1e2d0` | `#afc5ae` | 43.8 | 34.5 | 0.1° | `#d3e4d3` | `#b0c9b2` | 41.1 | 32.1 | 1.3° |
| violet | `#d7d7ef` | `#b8b6da` | 46.6 | 36.8 | 0.4° | `#e6e1ff` | `#cec3fc` | 35.0 | 26.3 | 1.1° |
| red | `#fdd6d8` | `#f0b3b8` | 39.9 | 31.0 | 0.4° | `#ffdfe0` | `#fbbfc3` | 30.8 | 23.0 | 1.3° |

Every slot passes H1 ≥ 15, H2 ≥ 15 and H3 ≤ 12° in both themes, and every ground's nearest slot hue is
its own. The lowest margins are light yellow (H2 16.0) and light magenta (H2 17.4).

### Validator re-run (HHAT-16)

`node <dataviz-skill-dir>/scripts/validate_palette.js "<hexes>" --mode <m> --surface <s> --pairs all`

| Theme | Surface | Exit | Normal-vision worst | CVD worst | Contrast |
| ----- | ------- | ---- | ------------------- | --------- | -------- |
| light | `#ffffff` | 0 | `#d10b47`↔`#eb6623` 15.6 PASS | `#0f6f19`↔`#eb6623` 8.5 protan PASS | WARN: `#28ae76` 2.84, `#dbab37` 2.12, `#e984b7` 2.49 |
| dark | `#221f1b` | 0 | `#f45468`↔`#c90982` 15.2 PASS | `#f45468`↔`#bc8b03` 6.4 deutan WARN | PASS, all ≥ 3:1 |

Identical to the spec's "Validator output" and AD-055. The WARNs are covered by the relief channel the
spec keeps (labels, tooltips, legend, hover, filter).

---

## Discrimination Sensor

Unit mutants ran in a temporary `git worktree` of `HEAD` (detached), each through a copy that kept
`<file>.orig`, refused unless the search string occurred once, asserted the mutant applied and
restored in `finally`; command `npx vitest run src/renderer/src/lib/hours-calendar.test.ts`.

| # | File:line | Mutation | Killed? | By |
| - | --------- | -------- | ------- | -- |
| U1 | `hours-calendar.ts:245` | previous look no longer excluded | ✅ Killed | `test.ts:529` (HHAT-13), `:539` (edge case) |
| U2 | `hours-calendar.ts:245` | same-day looks no longer excluded | ✅ Killed | `test.ts:493`, `:529`, `:539`, `:560` property |
| U3 | `hours-calendar.ts:242` | uses weight 4 → 1 (fill and hue outrank fewest uses) | ✅ Killed | 8 tests, incl. `test.ts:417`, `:462`, `:499`, `:518` |
| U4 | `hours-calendar.ts:242` | solid-before-hatched term dropped | ❌ Survived | — (F1) |
| U5 | `hours-calendar.ts:242` | fill and hue terms swapped (hue preference above solid-first) | ❌ Survived | — (F1) |
| U6 | `hours-calendar.ts:242` | hue preference dropped | ✅ Killed | `test.ts:499`, `:518` |
| U7 | `hours-calendar.ts:237-238` | hue preference ignores the previous hue | ✅ Killed | `test.ts:509` |
| U8 | `hours-calendar.ts:246` | `<` → `<=`: last lowest wins (palette order reversed) | ✅ Killed | 18 tests |
| U9 | `hours-calendar.ts:253` | uses never counted | ✅ Killed | 10 tests, incl. `test.ts:445`, `:462` |
| U10 | `hours-calendar.ts:249-250` | an Other resets the previous look | ✅ Killed | `test.ts:539` |
| U11 | `hours-calendar.ts:175` | `lookClass` drops `hatched` | ✅ Killed | `test.ts:630` |
| U12 | `hours-calendar.ts:162` | `LOOKS` hatched before solid | ⚪ Survived, equivalent | The rank's fill term already puts every solid before every hatched look on a use tie, and the order within each fill is unchanged, so no week can tell this mutant apart |

U4 and U5 are **not** equivalent. A differential search (Verifier scratch, the production rule
re-implemented beside each mutant over random weeks of 1 to 40 tasks) found weeks where they pick
differently, all with more than sixteen tasks. A hand-built fixture that kills both: tasks 1–15 on
Monday, task 16 on Monday and Wednesday, tasks 17–23 on Tuesday, task 24 on Wednesday (falling week
totals). The real rule gives task 24 `slot8`: every look has one use, `slot8`'s hue is held on
Wednesday, and solid comes before hatched. Both mutants give `slot1-hatched`.

Smoke mutants (5 of the 5 allowed) ran in the real tree through the `.orig` script (refuse unless the search string occurs once, assert it applied, restore in `finally`), each on a fresh
seed and launch (`SMOKE_PORT=9231`, throwaway `--user-data-dir`), the app killed and the directory
deleted afterwards. The real build passed first: full drive 85/85, then `SMOKE_ONLY=looks` 12/12.

| # | File:line | Mutation | Run | Killed? | Failing check(s) |
| - | --------- | -------- | --- | ------- | ---------------- |
| S1 | `HoursView.tsx:486` | drawer swatch class back to `` `role-${role}` `` | `SMOKE_ONLY=looks` | ✅ Killed (10/12) | `smoke.mjs:1631` stripes (drawer swatch `none`), `:1636` ground (drawer swatch `rgba(0, 0, 0, 0)`) |
| S2 | `HoursCalendar.css:15,17` | dark slots 5 and 7 swapped | full drive | ✅ Killed (84/85) | `smoke.mjs:969` palette: dark 5 `rgb(140, 99, 245)` for `rgb(201, 9, 130)`, dark 7 the reverse |
| S3 | `HoursCalendar.css:195` | stripe `0 3px, transparent 3px 6px` | `SMOKE_ONLY=looks` | ✅ Killed (11/12) | `smoke.mjs:1631` stripes |
| S4 | `HoursCalendar.css:195` | `repeating-linear-gradient(135deg, …)` | `SMOKE_ONLY=looks` | ✅ Killed (11/12) | `smoke.mjs:1631` stripes |
| S5 | `HoursCalendar.css:194` | ground `color-mix(in srgb, …)` | `SMOKE_ONLY=looks` | ✅ Killed (11/12) | `smoke.mjs:1636` ground (computed `color(srgb …)` against the probe's `oklab(…)`) |

Chosen for the riskiest behaviour no unit test can see, and different from the author's T12–T15
mutants: the drawer host (the author mutated the legend host), the dark palette (the author swapped
light slots), and the stripe width, angle and mix space of the recipe (the author deleted the rule and
moved the ground to 30%). All five failed on the first run; none needed a rerun.

The smoke ran in the real worktree, as the task's protocol prescribes (renderer edits hot-reload into
the dev app). Two earlier attempts to run the dev app from the scratch worktree, whose
`node_modules` was a junction to this one, never reached the app's top bar, even on the unmutated
build. That was a setup failure, not a check result, and those runs are discarded.

**Sensor depth**: lightweight plus (12 unit mutants and 5 smoke mutants). Unit: 9 of 12 killed, 1
equivalent, 2 survived (F1). Smoke: 5/5 killed.

Isolation: `git status --porcelain` of the real worktree was empty before the sensor. Afterwards it
showed only this report, which was written during the run; no `.orig` file and no source change were
left. The scratch worktree was removed (`git worktree list` no longer shows it), every smoke
`--user-data-dir` was deleted, and no Electron process on a seeded profile was left running.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ One sort key, one class helper, one shared CSS block; no new module |
| Surgical changes | ✅ 3 components change one class expression each; per-slot swatch rules removed in favour of the shared block |
| No scope creep | ✅ Tooltip key stays solid (owner confirmed); other charts untouched |
| Matches patterns | ✅ AD-018 / AD-029 supersession pattern in `hours-task-focus/spec.md`; smoke follows the existing section and `SMOKE_ONLY` pattern |
| Spec-anchored outcome check (asserted values match spec) | ✅ Literal looks, hex values, px and opacity asserted (L-009 honoured: no self-referential constants) |
| Per-layer coverage (domain 1:1 ACs) | ✅ HHAT-01..13, 19, 23 and every edge case have unit tests; the HHAT-05 tie is not discriminated (F1) |
| Every test maps to a spec requirement | ✅ Every new or rewritten test names its HHAT id or edge case; the three rewritten HTF tests are named in `6f8fb06`'s commit body, per T2 |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md`, confirmed lessons L-001, L-005, L-009 |

---

## Gate Check

- **Unit**: `npx vitest run` — 119 files, **2522 passed**, 0 failed, 0 skipped (baseline 2508; +14 =
  3 `lookClass` + 11 assignment tests, rewrites counted once)
- **Typecheck**: `npm run typecheck` — exit 0
- **Lint**: `npm run lint` — exit 0, **0 errors / 18 warnings** (baseline 0 / 18, unchanged)
- **Build**: `npx electron-vite build` — exit 0
- **Smoke**: full drive 85/85 on a fresh seed and launch (sections 1 to 16); `SMOKE_ONLY=looks` 12/12 on the real build

---

## Follow-ups (do not block the verdict under the owner's loop budget)

1. **F1 — HHAT-05 tie-break not discriminated (unit mutants U4, U5 survived).** Production is correct
   (`hours-calendar.ts:241-242`), but no unit fixture reaches a use tie where solid-before-hatched
   decides, nor one where it disagrees with the hue preference. So the spec's owner-confirmed key
   order (fill above hue) is unpinned. Fix: one test in `test.ts`, using the fixture above (tasks
   1–15 Monday, 16 Monday + Wednesday, 17–23 Tuesday, 24 Wednesday → task 24 `slot8`, not
   `slot1-hatched`). It kills both U4 and U5.
2. **F2 — section 16 reads the exact hatch recipe on slot 1 only.** The other five hatched hues on the seeded Sunday are covered by section 11 (`smoke.mjs:937`, `:944`): fourteen distinct signatures, and swatches that match their bars. They are not compared with the literal gradient. The rule is one shared selector (`HoursCalendar.css:193`), so the evidence is thin, not missing. Optional: loop the stripe and ground checks over the six hatched tasks.
3. **F3 — the neutral-swatch edge case is exercised with a solid task only.** The kept-chip path
   (`HoursView.tsx:158-165`) is fill-agnostic and `lookClass('other')` is unit-pinned, so this is thin
   evidence, not missing evidence. `smoke.mjs:1093` reads only the first `role-` class, so a stray
   `hatched` class on that swatch would not show. Optional: in section 16, step a week away with the
   hatched chip picked and assert the kept swatch's class list is exactly `hleg-swatch role-other`.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HHAT-01..04, 06..29 | Implemented | ✅ Verified |
| HHAT-05 | Implemented | ✅ Verified (follow-up F1: tie-break not discriminated by a unit test) |

---

## Summary

**Overall**: ✅ Ready (PASS), with follow-up F1 recommended before or soon after the PR

**Spec-anchored check**: 29/29 ACs and 5/5 edge cases matched the spec's literal outcome; 0
spec-precision gaps
**Sensor**: unit 9/12 killed (1 equivalent, 2 survived → F1); smoke 5/5 killed
**Gate**: 2522 passed; typecheck clean; lint 0 / 18; build clean

**What works**: sixteen looks spread across the week with no neighbour or same-day repeat; the
retuned palette passes the validator in both themes; the hatch recipe is applied identically on bars,
legend and drawer swatches; focus and filter on a hatched task behave as on a solid one.

**Issues found**: none in production. Test discrimination: F1 (unit); F2 and F3 are thin smoke evidence.

**Next steps**: add F1's fixture as one unit test; then open the PR.

**Lessons**: L-106 recorded (`surviving_mutant`, scope `testing`) from U4 and U5. F2 and F3 are thin
smoke evidence, not a surviving mutant or a precision gap, so they record no lesson.

---

## Round 2 (2026-10-03, ee17201..HEAD)

**Verdict**: PASS ✅. **Diff range**: `ee17201..4ec1a17` (`6920b08` test, `3a66c23` docs, `4ec1a17`
CSS and smoke). **Verifier**: independent sub-agent (author ≠ verifier), fresh context. Scope, by the
owner's loop rule: only this diff; a gap outside it is a follow-up unless it is a production defect.
No production defect and no AC in the diff without evidence.

Owner decisions under check (2026-10-03): add F1's unit test; change the hatch to stripes 3 px in
every 6 px over `color-mix(in oklab, <hue> 5%, #fff)` (the 2 px over 20% recipe read as mostly
white; the 4 px in every 6 px inversion was rejected because it fails H2).

### F1: resolved

New test `src/renderer/src/lib/hours-calendar.test.ts:483-496` ("takes a solid before a hatched look
on a use tie, even one whose hue its day holds (HHAT-05)"). Re-derived by hand from the spec rule
(fewest uses, then solid before hatched, then hue preference, then palette order; never a same-day
look nor the previous look), with `week` listing tasks in falling week total:

- Tasks 1–8 on Monday take `slot1`..`slot8`; tasks 9–15 take `slot1-hatched`..`slot7-hatched`;
  task 16 (Monday and Wednesday) finds only `slot8-hatched` free on Monday:
  `:493` `expect(colours.get('task:16')).toBe('slot8-hatched')`.
- Every look now has one use. Task 17 (Tuesday, previous `slot8-hatched`) ranks the solids `slot1`..`slot7`
  lowest (one use, solid, hue not avoided) and takes `slot1`; tasks 18–23 follow to `slot7`:
  `:494` `expect(colours.get('task:23')).toBe('slot7')`.
- Task 24 (Wednesday, which holds `slot8-hatched`; previous `slot7`): `slot1`..`slot7` have two
  uses; at one use the allowed looks are `slot8` (solid, hue avoided: held on Wednesday) and
  `slot1-hatched`..`slot7-hatched` (hatched; `slot7-hatched` also avoided as the previous hue).
  Solid before hatched outranks the hue preference, so `slot8`:
  `:495` `expect(colours.get('task:24')).toBe('slot8')`. The spec's literal outcome.

Discrimination, in a temporary `git worktree` of `HEAD` (detached, `node_modules` junctioned, removed
afterwards), mutating `hours-calendar.ts:242` through a `.orig` copy (refused unless the search string
occurred once, asserted applied, restored in `finally`); `npx vitest run
src/renderer/src/lib/hours-calendar.test.ts`:

| # | Mutation of the rank at `hours-calendar.ts:242` | Run | Killed? | By |
| - | ----------------------------------------------- | --- | ------- | -- |
| — | none (baseline) | 56/56 pass | — | — |
| U4 | `uses × 4 + avoided` (solid-before-hatched dropped) | 1 failed / 55 | ✅ Killed | `test.ts:495`: expected `'slot8'`, received `'slot1-hatched'` |
| U5 | `uses × 4 + hatched × 1 + avoided × 2` (fill and hue swapped) | 1 failed / 55 | ✅ Killed | `test.ts:495`: expected `'slot8'`, received `'slot1-hatched'` |

Both mutants change exactly the outcome the hand derivation predicts. F1 is closed; HHAT-05's
"solid before hatched" now has discriminating evidence.

### Hatch recipe: consistent

The same recipe, stripes of the hue 3 px in every 6 px at 45° over the hue mixed 5% with white in
OKLab, in every place that states it:

| Where | Statement |
| ----- | --------- |
| CSS `src/renderer/src/components/HoursCalendar.css:193-196` | `background-color: color-mix(in oklab, var(--hcal-c) 5%, #fff)`; `background-image: repeating-linear-gradient(45deg, var(--hcal-c) 0 3px, transparent 3px 6px)`; comment `:192` "half the pattern" (AD-055) |
| Spec AC 17 (`spec.md:182`) and Assumptions "The hatch", "Hatch ground", "Stripe geometry" (`spec.md:42`, `:52`, `:53`) | 3 px in every 6 px, 5% with white in OKLab, owner confirmed 2026-10-03 |
| Design "The Hatch" and "Hatch legibility" (`design.md:190-265`) and its AD-055 copy (`design.md:305-325`) | same CSS block; ground 5%, stripe share 1/2; smoke expectation `<hue> 0px, <hue> 3px, transparent 3px, transparent 6px` |
| AD-055 (`.specs/STATE.md:64`) | 3 px in every 6 px over `color-mix(in oklab, <hue> 5%, #fff)`, owner decision 2026-10-03 |
| Smoke section 16 (`scripts/smoke-hours-calendar.mjs:62-67` header, `:1625` probe `5%`, `:1629-1630` `stripes()` with `3px`, checks `:1631`, `:1636`) | expects the same gradient string and a ground equal to a probe's computed `color-mix(in oklab, <hue> 5%, #fff)` |
| `tasks.md` T3 and T14 notes (`:180-183`, `:459-461`) | record the change and say the boxes above them describe the first recipe |

No stale claim of the hatch as 2 px or 20%. Every remaining "2 px" / "20%" about the hatch is
history or a rejected alternative: spec `:42`, `:52`, `:53`, `:182` ("first shipped as 2 px over
20%"), design `:200`, `:254-265`, `:312`, AD-055's rationale, `tasks.md:20` (with "5% since the
owner's 2026-10-03 change") and T14's original What (`tasks.md:437`, followed by its dated note).
Other "2px" hits in the CSS and spec are unrelated (bar gap, outline, the tooltip's 12 × 2 px key).

### Hatch legibility (H1 to H3), re-measured on the new recipe

Measured by a Verifier scratch script written for this round (not the author's), with the dataviz
validator's own `hex2srgb`, `s2lin`, `lin2s`, `lin`, `oklabFromLin`, `okhue` and `deltaE` copied
verbatim, plus Ottosson's OKLab-to-linear-sRGB inverse (the validator has none). Ground = OKLab mix
5% hue / 95% white, rounded to 8-bit hex; mean = linear-RGB blend 50/50 of hue and ground, rounded to
8-bit; H1 = `dE(hue, ground)` ≥ 15; H2 = `dE(mean, hue)` ≥ 15; H3 = OKLab hue angle distance between
ground and hue ≤ 12°, and the ground's nearest slot hue is its own.

| Slot | Light ground | Light mean | H1 | H2 | H3 | Dark ground | Dark mean | H1 | H2 | H3 |
| ---- | ------------ | ---------- | -- | -- | -- | ----------- | --------- | -- | -- | -- |
| blue | `#f4f8ff` | `#b6c5f4` | 43.1 | 27.2 | 2.1° | `#f5fafe` | `#b6ceed` | 37.7 | 23.3 | 3.4° |
| orange | `#fff8f5` | `#f5c1b6` | 36.1 | 22.3 | 1.7° | `#fcf6f3` | `#ddbbb3` | 45.8 | 29.9 | 4.7° |
| aqua | `#f6fbf8` | `#b7d9c5` | 34.3 | 21.0 | 0.1° | `#f5fbf9` | `#b5d7cb` | 34.9 | 21.4 | 1.5° |
| yellow | `#fdfbf6` | `#edd8b8` | 25.9 | 15.5 | 3.5° | `#fcf9f4` | `#dfccb3` | 34.2 | 21.2 | 2.6° |
| magenta | `#fff9fb` | `#f4cadc` | 28.2 | 16.6 | 5.4° | `#fef5f8` | `#e6b4c9` | 47.7 | 31.4 | 3.9° |
| green | `#f3f8f3` | `#b3c3b3` | 52.0 | 34.8 | 1.7° | `#f4f8f4` | `#b4c6b5` | 48.8 | 32.2 | 1.1° |
| violet | `#f5f5fb` | `#bbb8d6` | 55.5 | 37.6 | 1.0° | `#f9f8ff` | `#ccc1fa` | 41.7 | 25.8 | 0.7° |
| red | `#fff5f5` | `#e9b4b9` | 47.5 | 31.0 | 2.4° | `#fff7f7` | `#fabdc1` | 36.6 | 22.5 | 0.3° |

All 16 slots pass; every ground's nearest slot hue is its own. Worst: H1 25.9 (light yellow), H2 15.5
(light yellow, the thinnest margin, 0.5 above the floor), H3 5.4° (light magenta). Identical to the
design table and AD-055 to the decimal, grounds and means to the hex digit. With the mean left
unrounded H2 moves by at most 0.1 (light magenta 16.5); no verdict changes.

The rejected alternatives cited in spec, design and AD-055 reproduce: stripes 3 in 6 over a 20%
ground fail H2 on light yellow (12.8) and light magenta (13.7); stripes 4 in 6 over 20% fail H2 in 8
of 16 slots (light yellow 9.2) and on light yellow over pure white (11.9); pure white with 3 in 6
passes H2 (light yellow 16.4) but its ground has no hue, so H3 fails in 14 of 16 slots. The first
recipe (20%, share 1/3) reproduces round 1's table (worst H2 16.0, light yellow).

### Smoke

Runs on the real tree through a Verifier runner: fresh `--seed` per run, the dev app launched only on
that throwaway `--user-data-dir` with `--remote-debugging-port=9231` (`SMOKE_PORT=9231`) and the
three anti-throttling flags, `SMOKE_ONLY=looks`; the app's process tree killed, the seeded directory
and pointer deleted after each run. Mutants were applied to `HoursCalendar.css` before the launch
through a `.orig` copy (refused unless the search string occurred once, asserted applied, restored in
`finally` after the app was killed; the runner confirmed the restored file byte-identical).

Real build: **12/12** (section 16), checks `:1631` stripes `repeating-linear-gradient(45deg, rgb(47,
118, 232) 0px, rgb(47, 118, 232) 3px, rgba(0, 0, 0, 0) 3px, rgba(0, 0, 0, 0) 6px)` light / `rgb(39,
144, 218)` dark; `:1636` ground `oklab(0.979228 -0.00162829 -0.0091724)` light /
`oklab(0.981548 -0.00298951 -0.00650836)` dark on bar, legend swatch and drawer swatch, equal to the
probe.

| # | Mutation at `HoursCalendar.css:194-195` | Result | Killed? | Failing check |
| - | ---------------------------------------- | ------ | ------- | ------------- |
| R1 | stripes back to `0 2px, transparent 2px 6px` (first recipe) | 11/12 | ✅ Killed | `smoke.mjs:1631` stripes (`… 2px, rgba(0, 0, 0, 0) 2px …`) |
| R2 | stripes `0 4px, transparent 4px 6px` (the rejected inversion) | 11/12 | ✅ Killed | `smoke.mjs:1631` stripes |
| R3 | ground back to `20%` (first recipe) | 11/12 | ✅ Killed | `smoke.mjs:1636` ground (`oklab(0.92621 …)` against the probe's `oklab(0.981548 …)`, dark) |
| R4 | ground `4%`, one point off | 11/12 | ✅ Killed | `smoke.mjs:1636` ground (`oklab(0.985237 …)` against `oklab(0.981548 …)`) |
| R5 | stripes of `color-mix(in oklab, <hue> 80%, #fff)`, a paler stripe | 11/12 | ✅ Killed | `smoke.mjs:1631` stripes (`oklab(0.704859 …)` instead of the hue) |

5/5 killed, each on its first run; no rerun was needed. R1 and R3 show that the smoke now rejects
each half of the old recipe, and R4 that the ground check resolves a single percentage point.

### Gates

- **Unit**: `npm test` — 119 files, **2523 passed**, 0 failed, 0 skipped (round 1 2522; +1, F1's test)
- **Typecheck**: `npm run typecheck` — exit 0
- **Lint**: `npm run lint` — exit 0, **0 errors / 18 warnings** (unchanged)
- **Build**: `npx electron-vite build` — exit 0

Isolation: `git status --porcelain` empty before and after; no `.orig` left; the scratch worktree is
removed; no process on port 9231 or holding a seeded profile is left; the process on 9333 was not
touched.

### Code quality (diff only)

| Check | Status |
| ----- | ------ |
| Minimum, surgical | ✅ Two CSS values and a comment; three strings in smoke section 16 (header, probe, `stripes()`, two check names); one unit test |
| Test maps to the spec | ✅ The new test names HHAT-05; its fixture comment states the decision it pins |
| Docs record the decision | ✅ Spec Assumptions and AC 17 dated owner confirmed 2026-10-03; design keeps the first recipe and the rejected alternatives with their numbers; AD-055 updated in place, as the AD-018 / AD-029 pattern does |

### Follow-ups

- **F1**: resolved (above).
- **F2** (from round 1, unchanged, thin evidence): section 16 reads the exact recipe on slot 1 only.
  The rule is still one shared selector, so a slot-specific drift is not possible in the CSS as written.
- **F3** (from round 1, unchanged, thin evidence): the neutral kept-chip swatch is exercised with a
  solid task only.
- **F4** (new, cosmetic): in `design.md`'s AD-055 copy the rewrap left a short line ("other than the",
  `design.md:314`). Text is correct; only the wrap is uneven.

### Requirement traceability (round 2)

| Requirement | Previous | New |
| ----------- | -------- | --- |
| HHAT-05 | Verified (F1 open) | ✅ Verified; F1 resolved, `test.ts:483-496`, U4 and U5 killed |
| HHAT-17 | Verified (2 px over 20%) | ✅ Verified on 3 px in every 6 px over 5% (`HoursCalendar.css:193-196`, `smoke.mjs:1631`, `:1636`; R1–R5 killed) |
| HHAT-22 | Verified (first recipe) | ✅ Verified on the new recipe (table above; worst H2 15.5, light yellow) |
| HHAT-29 | Verified (first recipe) | ✅ Verified on the new recipe (`smoke.mjs:1631`, `:1636`, `:1649`; 12/12 on the real build) |

**Lessons**: none recorded. F1 was a surviving mutant in round 1 and already produced L-106; this
round found no surviving mutant, no spec-precision gap and no failed AC.
