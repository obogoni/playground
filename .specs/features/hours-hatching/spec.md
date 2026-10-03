# Hours Hatching Specification

## Problem Statement

`hours-task-focus` gave tasks that share a day their own colours, but the Hours view still shows the
same colour next to itself. The rule only keeps colours apart within one day: each task, in order of
week total, takes the first palette colour no same-day task holds. Tasks on different days keep
landing on the first two or three colours, and the legend lists tasks in that same order, so repeats
sit side by side. A ten-task week read blue, orange, orange, orange, aqua, green, yellow, green,
yellow, magenta. Several palette pairs are also hard to tell apart on a 10 px swatch or a thin bar,
and two pairs fail colour-vision simulation outright (AD-045). Issue #152.

## Goals

- [ ] No two neighbouring legend chips share a look, in any week
- [ ] A week of up to eight tasks gives each its own solid colour; up to sixteen, each its own look
- [ ] The eight hues pass the dataviz validator with `--pairs all` on both theme panels

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| A task keeping one colour across weeks | Issue #152, Out of Scope: looks stay assigned per week so same-day tasks differ |
| Patterns other than one diagonal hatch | Issue #152, Out of Scope |
| Changing the legend order, hover or filter behaviour | Issue #152, Out of Scope; the legend order is what lets "never the previous chip" hold |
| Hatching Other or task-less folders | Issue #152, Implementation Decisions: Other and No task keep their neutral and outlined looks |
| Hatching the other charts of the app | AD-030 still governs every other chart |

---

## Assumptions & Open Questions

Every row marked `owner confirmed 2026-10-01` comes from issue #152, grilled and confirmed that day; it
is final. The gray areas the issue does not settle (the proposed hex values, the hatch ground, the
hue preference scope, the only-previous-look rule and the tooltip key) were confirmed by the owner
on 2026-10-01 as the plan proposed them. The rows marked `owner confirmed 2026-10-03` changed the
hatch recipe after validation, by the owner's decision of that day.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Sixteen looks | The eight hues in palette order (blue, orange, aqua, yellow, magenta, green, violet, red), each solid and each hatched; Other and No task stay as they are | Issue #152, Solution 1 | y, owner confirmed 2026-10-01 |
| The hatch | 45° stripes of the hue, as wide as the light gaps between them, over a light tint of it, so it still reads as that hue | Issue #152, Solution 1. Widened after validation: with stripes a third of the pattern the hatch read as mostly white. The full inversion, stripes two thirds of the pattern, fails the twin rule (H2) whatever the ground, in up to 8 of the 16 slots | y, owner confirmed 2026-10-01 (stripes over a light tint); widened, owner confirmed 2026-10-03 |
| Assignment order | Tasks taken in order of week total, ties by first start (unchanged from HTF-02) | Issue #152, Solution 2 | y, owner confirmed 2026-10-01 |
| Assignment choice | Each task takes, among the looks no same-day task holds, the one used least in the week so far; never the previous legend chip's look; solid before hatched; a hatched pick prefers a hue not on the same day and not the previous chip's hue; ties go to palette order; with all sixteen held by same-day tasks the task is Other | Issue #152, Solution 2 and Implementation Decisions | y, owner confirmed 2026-10-01 |
| Reading of the rule order | Applied as one sort key over the allowed looks: fewest uses, then solid before hatched, then the hue preference, then palette order. "Prefer solid" is a tie-break under "least used", not a filter before it | Only this reading keeps the issue's guarantees: filtering to solids first would give task nine a used solid while eight hatched looks sit unused, breaking "up to sixteen, every task has its own look" | y, owner confirmed 2026-10-01 (the guarantees); the key order follows from them |
| Guarantees | Up to eight tasks in a week: each its own solid colour. Up to sixteen: each its own look. Same-day tasks never share a look | Issue #152, Solution 2 | y, owner confirmed 2026-10-01 |
| Everywhere the same | Bars, legend chips and the day drawer show the same look; the legend and drawer swatch grows from 10 px to 14 px | Issue #152, Solution 3 | y, owner confirmed 2026-10-01 |
| Unchanged | Looks are frozen while the week is on screen (HCAL-24), assigned per week; task-less folders keep their outline; the legend order stays the colouring order; hover and the filter keep working | Issue #152, Solution 4 and User Story 10 | y, owner confirmed 2026-10-01 |
| Palette retune | The worst pairs are retuned with the dataviz validator, `--pairs all`, on `#ffffff` (light) and `#221f1b` (dark), until they pass; the hues keep their order | Issue #152, Solution 1 and Implementation Decisions | y, owner confirmed 2026-10-01 |
| Supersessions | This feature supersedes AD-045 (palette and assignment), HTF-02 (assignment), HTF-04 (Other at eight), HTF-16 (smoke: six Other bars), the palette values of HTF-01, and `hours-task-focus`'s Out of Scope row "Texture (hatching)". Recorded as a new decision, number chosen at Execute (main holds up to AD-051), with a supersession note in the merged spec in the same change | Issue #152, Implementation Decisions; the AD-018 / AD-029 / AD-048 pattern | y, owner confirmed 2026-10-01 |
| Proposed hex values | Light `#2f76e8 #eb6623 #28ae76 #dbab37 #e984b7 #0f6f19 #4e3ca6 #d10b47`; dark `#2790da #b64906 #14a889 #bc8b03 #c90982 #117a2c #8c63f5 #f45468` (slots 1 to 8). Validator output below | Found by a search held to each slot's hue family (OKLCH hue within 10° of today's, lightness within 0.08, chroma at least 80% of today's), minimising the change; the largest move is 9.5 ΔE (dark magenta) | owner confirmed 2026-10-01 (the look of the new values) |
| Hatch ground | The ground is the hue mixed 5% with white in OKLab, in both themes: `color-mix(in oklab, <hue> 5%, #fff)`. In the dark theme hatched bars are therefore pale | "A light tint" taken literally. A wash toward the dark panel instead fails the twin rule (ΔE 9.1 to 15.3 between a hatched look and its solid twin); white passes every slot in both themes. With half the pattern in stripes, a 20% ground fails the twin rule on light yellow (12.8) and light magenta (13.7), and pure white is not a tint of the hue; 5% passes every slot in both themes (design, "Hatch legibility") | owner confirmed 2026-10-01 (a white tint); 5%, owner confirmed 2026-10-03 |
| Stripe geometry | Stripes 3 px wide in every 6 px, at 45°, measured along the gradient line | Half the pattern, so the hue is no longer outweighed by the ground (the first recipe, 2 px in every 6 px over a 20% tint, read as mostly white); 4 px in every 6 px fails the twin rule in 8 of 16 slots at a 20% ground (light yellow 9.2) and on light yellow even over pure white (11.9). At 14 px a swatch shows three to four stripes | y, owner confirmed 2026-10-03 |
| Hue preference scope | The "prefer a hue not on the same day and not the previous chip's hue" tie-break is applied to solid picks too, not only hatched ones | One rule instead of two. It changes nothing in a week of sixteen tasks or fewer: until every solid is used, the least-used solids carry hues nobody holds; past sixteen it keeps a solid from sitting next to its hatched twin | owner confirmed 2026-10-01 |
| Only the previous chip's look is free | IF every look but the previous legend chip's is held by same-day tasks THEN the task is Other | Keeps "never the look of the chip just before it" literal; needs a week of more than sixteen tasks with fifteen on one day | owner confirmed 2026-10-01 |
| Other and No task in the no-repeat rule | They are not among the sixteen looks: two Other chips may sit side by side, and so may two folders | Other is the overflow for a full day and sorts after every coloured chip (HCAL-21); each chip still names its task | y, follows from the issue's sixteen looks |
| Tooltip key | The bar tooltip's 12 × 2 px key line stays solid in the hue for a hatched task | A 2 px line cannot show stripes, and the tooltip names the task beside it; the issue names bars, legend and drawer only | owner confirmed 2026-10-01 |
| Relief channel | The dark palette's colour-vision worst pair sits in the validator's WARN band (6.4); the light palette's three sub-3:1 slots keep their WARN. The legend, the tooltips and the bar labels name every task, and hover and the filter isolate one (AD-045's relief, unchanged) | dataviz: a CVD floor-band pair and a sub-3:1 fill are legal only with secondary encoding, which the view already ships | y, unchanged from AD-045 |
| Stop rule | IF the Execute re-run of the validator exits 1 in either theme, or the owner rejects the proposed values, THEN Execute stops before the palette task (T3) and the palette goes back to the owner | Issue #152, Further Notes: "if a pair can't pass in a theme, the plan goes back to the owner" | y, owner confirmed 2026-10-01 |
| Base branch | `feature/hours-hatching`, cut from `origin/main` `60ff148` | `hours-task-focus` and `hours-task-assign` are on main | y |

**Open questions:** none. All resolved or logged above; the owner confirmed the remaining defaults on 2026-10-01.

### Validator output (2026-10-01)

Run from `<dataviz-skill-dir>/scripts/validate_palette.js`, `--pairs all`.

Today's palette (AD-045), both exit 1:

```text
light, surface #ffffff: [FAIL] CVD separation      worst all-pairs #008300↔#eb6834 ΔE 3.2 (protan)
                        [FAIL] Normal-vision floor worst all-pairs #e34948↔#eb6834 ΔE 7.1 (normal)
dark, surface #221f1b:  [FAIL] CVD separation      worst all-pairs #d55181↔#199e70 ΔE 1.6 (deutan)
                        [FAIL] Normal-vision floor worst all-pairs #e66767↔#d95926 ΔE 7.1 (normal)
```

Proposed palette, light, `--mode light --surface "#ffffff" --pairs all`, exit 0:

```text
  [PASS] Lightness band         all 8 inside L 0.43–0.77
  [PASS] Chroma floor           all 8 >= 0.1
  [PASS] CVD separation         worst all-pairs #0f6f19↔#eb6623 ΔE 8.5 (protan) · tritan 6.2
  [PASS] Normal-vision floor    worst all-pairs #d10b47↔#eb6623 ΔE 15.6 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#28ae76",2.84],["#dbab37",2.12],["#e984b7",2.49]]
  → ALL CHECKS PASS
```

Proposed palette, dark, `--mode dark --surface "#221f1b" --pairs all`, exit 0:

```text
  [PASS] Lightness band         all 8 inside L 0.48–0.67
  [PASS] Chroma floor           all 8 >= 0.1
  [WARN] CVD separation         worst all-pairs #f45468↔#bc8b03 ΔE 6.4 (deutan) · tritan 3.3
  [PASS] Normal-vision floor    worst all-pairs #f45468↔#c90982 ΔE 15.2 (normal)
  [PASS] Contrast vs surface    all 8 >= 3:1
  → ALL CHECKS PASS
```

The dark theme cannot reach the CVD target of 8 with the hue families kept: the best found in the
same search held 14.6 normal-vision with 7.8 CVD. The WARN band is legal with the relief above.

---

## User Stories

### P1: Neighbouring chips never look alike ⭐ MVP

**User Story**: As a developer reading my week, I want neighbouring legend chips never to share a look, so that I can tell tasks apart at a glance.

**Why P1**: The request.

**Acceptance Criteria**:

1. The calendar SHALL offer sixteen task looks: each of the eight hues, in palette order, once solid and once hatched
2. WHEN the week's looks are assigned THEN the tasks SHALL be taken in order of week total, ties broken by the earlier first start
3. WHEN a task is assigned THEN it SHALL take a look that no already-assigned task sharing one of its days holds and that differs from the look of the task assigned just before it
4. WHEN several looks are allowed THEN the task SHALL take the one held by the fewest tasks of the week so far
5. WHEN allowed looks tie on use THEN a solid look SHALL be chosen before a hatched one
6. WHEN allowed looks still tie THEN a look whose hue no same-day task holds and that differs from the previous task's hue SHALL be chosen before one that does not
7. WHEN allowed looks still tie THEN the earlier look in palette order SHALL be chosen
8. The legend SHALL never show two consecutive coloured chips with the same look

**Independent Test**: The seeded ten-task week, two tasks a day from Monday to Friday, reads eight solid colours and then two hatched ones, no two neighbours alike.

---

### P1: Each task its own look ⭐ MVP

**User Story**: As a developer, I want each task of a normal week to have its own solid colour, and each task of a busy week its own colour or striped colour, so that no two tasks look the same.

**Why P1**: The request (issue user stories 2 and 3).

**Acceptance Criteria**:

9. WHEN a week holds eight tasks or fewer THEN each task SHALL wear its own solid look
10. WHEN a week holds sixteen tasks or fewer THEN no two tasks SHALL wear the same look

**Independent Test**: The seeded Sunday's fourteen tasks wear fourteen different looks: the eight solids in palette order, then hatched blue to hatched green.

---

### P1: Same-day tasks never share ⭐ MVP

**User Story**: As a developer, I want tasks on the same day never to share a look, so that a day's bars stay distinct.

**Why P1**: The rule `hours-task-focus` shipped, kept.

**Acceptance Criteria**:

11. The calendar SHALL never give the same look to two tasks that share a day
12. IF every one of the sixteen looks is held by tasks sharing a day with a task THEN that task SHALL be Other
13. IF the only look not held by a same-day task is the previous task's look THEN the task SHALL be Other (owner confirmed 2026-10-01)

**Independent Test**: Seventeen tasks on one day give sixteen looks and one Other.

---

### P1: Colours that can be told apart ⭐ MVP

**User Story**: As a developer in either theme, I want the near-identical colours made distinct, so that red no longer passes for orange.

**Why P1**: The request (issue user stories 5 and 9).

**Acceptance Criteria**:

14. The light theme SHALL use, for slots 1 to 8, `#2f76e8 #eb6623 #28ae76 #dbab37 #e984b7 #0f6f19 #4e3ca6 #d10b47`
15. The dark theme SHALL use, for slots 1 to 8, `#2790da #b64906 #14a889 #bc8b03 #c90982 #117a2c #8c63f5 #f45468`
16. The two palettes SHALL each pass the dataviz validator with `--pairs all` on their theme's panel, `#ffffff` light and `#221f1b` dark, with exit code 0

**Independent Test**: The validator runs in the spec above exit 0; the smoke reads the sixteen hex values on the seeded Sunday's bars.

---

### P1: One look everywhere ⭐ MVP

**User Story**: As a developer, I want a task to look the same in the bars, the legend and the drawer, and the swatch big enough to see the stripes, so that I can match them.

**Why P1**: The request (issue user stories 6 and 7).

**Acceptance Criteria**:

17. A hatched look SHALL be stripes of its hue at 45°, 3 px wide in every 6 px, over a ground of its hue mixed 5% with white in OKLab (owner confirmed 2026-10-03; first shipped as 2 px over 20%)
18. A solid look SHALL fill with its hue and show no stripes
19. Other and No task SHALL never be hatched
20. A task's bars, its legend swatch and its drawer swatch SHALL show the same look
21. The legend swatch and the drawer swatch SHALL be 14 × 14 px
22. The hatched looks SHALL meet the legibility rule in both themes: the stripes stand 15 ΔE or more from their ground, the look's average stands 15 ΔE or more from its solid twin, and the ground's hue is within 12° of its own hue and nearer it than any other slot's hue (design, "Hatch legibility")

**Independent Test**: Hover a hatched chip in either theme; its swatch, its bars and its drawer swatch show the same stripes.

---

### P2: Nothing else moves

**User Story**: As a developer, I want looks not to change while I look at a week, and hover and the task filter to keep working with striped looks, so that nothing repaints under me and focusing still works.

**Why P2**: Unchanged behaviour the new looks must not break (issue user stories 8 and 10).

**Acceptance Criteria**:

23. WHILE a week stays on screen its looks SHALL NOT change (HCAL-24)
24. WHEN the pointer rests on, or keyboard focus reaches, a hatched task's chip, drawer header or bar THEN every other group's bars SHALL be dimmed to 30% opacity as for a solid task (HTF-07, HTF-09)
25. WHEN a hatched task's chip is clicked THEN the calendar SHALL show only that task's days, as for a solid task (HTF-10)
26. WHEN a task is hovered, picked or cleared THEN no bar SHALL change its look, stripes included (HTF-15)

**Independent Test**: Pick the seeded Sunday's first hatched chip; only Sunday shows, and every bar keeps its look.

---

### P2: The looks are checked automatically

**User Story**: As the owner, I want the smoke to check the new looks, so that a regression shows without opening the app.

**Why P2**: Regression cover, not user-facing behaviour.

**Acceptance Criteria**:

27. WHEN the smoke opens the seeded Sunday THEN it SHALL find fourteen different looks, the first eight solid in the palette's hex values in order in both themes, the next six hatched in slots 1 to 6, and no Other bar
28. WHEN the smoke opens the seeded spread week THEN it SHALL find no two consecutive legend chips with the same look
29. WHEN the smoke reads a hatched bar, its legend swatch and its drawer swatch THEN each SHALL show the stripe gradient in its hue over the specified ground, and its solid twin SHALL show none

---

## Edge Cases

- WHEN a week holds more than sixteen tasks THEN looks SHALL repeat, each task taking a look of the fewest uses that its days and the previous chip allow (thirty-two tasks dealt one by one across the seven days use every look exactly twice)
- WHEN a task first appears while the week is shown THEN it SHALL be Other until the week is reopened (HCAL-24, unchanged)
- WHEN a week holds only folders THEN no look SHALL be assigned (unchanged)
- WHEN the picked group has no time in the shown week THEN its kept chip SHALL wear the neutral swatch, never a hatched one (HTF edge case, unchanged)
- IF a task is Other THEN it SHALL not count as the previous chip for the next task: the previous chip is the last task given one of the sixteen looks

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| HHAT-01 | P1: neighbours, AC 1 | Execute | Verified (validation.md, 2026-10-03): T1, T3, T10 |
| HHAT-02 | P1: neighbours, AC 2 | Execute | Verified (validation.md, 2026-10-03): T2 |
| HHAT-03 | P1: neighbours, AC 3 | Execute | Verified (validation.md, 2026-10-03): T2, T10 |
| HHAT-04 | P1: neighbours, AC 4 | Execute | Verified (validation.md, 2026-10-03): T2 |
| HHAT-05 | P1: neighbours, AC 5 | Execute | Verified (validation.md, 2026-10-03): T2; F1 resolved in round 2: the solid-before-hatched tie is pinned by a unit test, mutants U4 and U5 killed |
| HHAT-06 | P1: neighbours, AC 6 | Execute | Verified (validation.md, 2026-10-03): T2 |
| HHAT-07 | P1: neighbours, AC 7 | Execute | Verified (validation.md, 2026-10-03): T2 |
| HHAT-08 | P1: neighbours, AC 8 | Execute | Verified (validation.md, 2026-10-03): T2, T14 |
| HHAT-09 | P1: own look, AC 9 | Execute | Verified (validation.md, 2026-10-03): T2 |
| HHAT-10 | P1: own look, AC 10 | Execute | Verified (validation.md, 2026-10-03): T2, T12 |
| HHAT-11 | P1: same day, AC 11 | Execute | Verified (validation.md, 2026-10-03): T2 |
| HHAT-12 | P1: same day, AC 12 | Execute | Verified (validation.md, 2026-10-03): T2, T10 |
| HHAT-13 | P1: same day, AC 13 | Execute | Verified (validation.md, 2026-10-03): T2 |
| HHAT-14 | P1: colours, AC 14 | Execute | Verified (validation.md, 2026-10-03): T3, T12 |
| HHAT-15 | P1: colours, AC 15 | Execute | Verified (validation.md, 2026-10-03): T3, T12 |
| HHAT-16 | P1: colours, AC 16 | Execute | Verified (validation.md, 2026-10-03): T3, T9 |
| HHAT-17 | P1: one look, AC 17 | Execute | Verified (validation.md, 2026-10-03): T3, T14; re-verified in round 2 on 3 px in every 6 px over a 5% ground (follow-up F2: exact recipe smoke-read on slot 1 only) |
| HHAT-18 | P1: one look, AC 18 | Execute | Verified (validation.md, 2026-10-03): T3, T14 |
| HHAT-19 | P1: one look, AC 19 | Execute | Verified (validation.md, 2026-10-03): T1, T3 |
| HHAT-20 | P1: one look, AC 20 | Execute | Verified (validation.md, 2026-10-03): T4..T8, T12 |
| HHAT-21 | P1: one look, AC 21 | Execute | Verified (validation.md, 2026-10-03): T4, T5, T14 |
| HHAT-22 | P1: one look, AC 22 | Execute | Verified (validation.md, 2026-10-03): T3, T9; re-measured in round 2 on the 3 px over 5% recipe, every slot passes (worst H2 15.5, light yellow) |
| HHAT-23 | P2: nothing moves, AC 23 | Execute | Verified (validation.md, 2026-10-03): T2 |
| HHAT-24 | P2: nothing moves, AC 24 | Execute | Verified (validation.md, 2026-10-03): T15 |
| HHAT-25 | P2: nothing moves, AC 25 | Execute | Verified (validation.md, 2026-10-03): T15 |
| HHAT-26 | P2: nothing moves, AC 26 | Execute | Verified (validation.md, 2026-10-03): T13, T15 |
| HHAT-27 | P2: smoke, AC 27 | Execute | Verified (validation.md, 2026-10-03): T10, T12 |
| HHAT-28 | P2: smoke, AC 28 | Execute | Verified (validation.md, 2026-10-03): T11, T14 |
| HHAT-29 | P2: smoke, AC 29 | Execute | Verified (validation.md, 2026-10-03): T14; re-verified in round 2 on the 3 px over 5% recipe (follow-up F2: exact recipe smoke-read on slot 1 only) |

**Coverage:** 29 total, 29 mapped to tasks, 0 unmapped; 29 verified (`validation.md`, PASS in rounds 1 and 2; F1 resolved, follow-ups F2 to F4 open).

---

## Success Criteria

- [ ] On the owner's busiest real week, no two neighbouring legend chips look alike
- [ ] Red and orange, and every other pair, are told apart without hovering, in both themes
