# Hours Hatching Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/hours-hatching/design.md`
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01)

**Branch**: `feature/hours-hatching`, cut from `origin/main` `60ff148`. The PR goes to `obogoni:main` with `Closes #152`.

**Setup (before T1, no commit)**: the worktree has no `node_modules`. Run `npm ci --ignore-scripts` and `node node_modules/electron/install.js`, then record the **test baseline** here: `npx vitest run` count, `npm run typecheck`, and `npm run lint` errors and warnings.

**Baseline (2026-10-03, rebased on `origin/main` `6d96ae4`)**: `npx vitest run` 119 files, 2508 tests, all passing; `npm run typecheck` exit 0; `npm run lint` exit 0, 0 errors, 18 warnings.

**Owner-confirmed rows** (spec Assumptions, `owner confirmed 2026-10-01`): the proposed hex values (T3, T9, T12), the hatch ground of 20% hue on white in both themes (T3, T9, T14; 5% since the owner's 2026-10-03 change, see T3), the hue-preference scope (T2), the only-previous-look-free rule (T2), the tooltip key (T3), all as the plan proposed them.

**Stop rule**: T3 starts by re-running the dataviz validator on the spec's exact values. A non-zero exit in either theme, or an owner rejection of the values, stops Execute before T3's edit; the palette goes back to the owner.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts, the `hours-task-focus` and `hours-task-assign` matrices, confirmed lessons L-001, L-005 and L-009.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure calendar logic (`hours-calendar.ts`) | unit | 1:1 to HHAT-01..13, 19, 23 and the edge cases; every tie-break pinned by a fixture where it changes the result; literal looks asserted, never derived from the code (L-009) | `src/renderer/src/lib/hours-calendar.test.ts` | `npx vitest run src/renderer/src/lib/hours-calendar.test.ts` |
| CSS (`HoursCalendar.css`, `HoursLegend.css`, `HoursView.css`) | none (CDP smoke) | HHAT-14, 15, 17..22 in the running app | — | `npx electron-vite build` |
| Components (`HoursCalendar`, `HoursLegend`, `HoursView`) | none (CDP smoke) | HHAT-20, 24..26 in the running app | — | `npm run typecheck` |
| Docs (`STATE.md`, `hours-task-focus/spec.md`) | none | — | — | review |
| End to end | manual CDP smoke | Every new or changed check first seen failing on a deliberately broken build | `scripts/smoke-hours-calendar.mjs` | seeded dev app, three steps |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npx vitest run src/renderer/src/lib/hours-calendar.test.ts` then `npm test` |
| Full | After a component task | `npm run typecheck && npm run lint && npm test` |
| Build | CSS tasks | `npm run lint && npx electron-vite build` |
| Manual | Smoke tasks T11–T15 | `node scripts/smoke-hours-calendar.mjs --seed`; `npm run dev -- -- "--user-data-dir=<dir>" --remote-debugging-port=9222 --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`; `node scripts/smoke-hours-calendar.mjs` (or `SMOKE_ONLY=looks` for section 16 while iterating) |

**Lint is judged by exit code AND by warning count** — diff it against the setup baseline at every gate.

**Smoke falsification rules** (every smoke task): each new or changed check is first seen FAILING on a deliberately broken build, then passing on the real one. The mutant is made by a scratch script kept outside the repository (the session scratchpad), which takes a file, an exact search string and its replacement; refuses unless the search string occurs exactly once; copies the file to `<file>.orig`; writes the mutant and re-reads it to assert the replacement is there (the mutant applied); runs the smoke; and restores from `.orig` and deletes it in `finally`. `git status --porcelain` must equal its pre-run value afterwards. Renderer edits reach the dev app by hot reload, and the smoke reloads the page before it reads anything. Sessions are ad-hoc `pwsh -NoLogo -NoProfile`, never a registry agent. Iterate with `SMOKE_ONLY=looks` (section 16 alone); run the full drive once before the Verifier and the PR.

---

## Execution Plan

### Phase 1: Looks, pure

```
T1 → T2
```

### Phase 2: Palette and hatch styles

```
T2 → T3 → T4 → T5
```

### Phase 3: Looks in the components

```
T5 → T6 → T7 → T8
```

### Phase 4: Record

```
T8 → T9 → T10
```

### Phase 5: Prove

```
T10 → T11 → T12 → T13 → T14 → T15
```

---

## Task Breakdown

### T1: Sixteen looks and their classes

**What**: `Slot` and `ColourRole` gain `slot1-hatched`..`slot8-hatched`; `LOOKS` lists the sixteen in palette order, solid first; `lookClass(role)` returns `role-slotN`, `role-slotN hatched`, `role-other` or `role-no-task`.
**Where**: `src/renderer/src/lib/hours-calendar.ts`
**Depends on**: None
**Reuses**: `SLOTS` (`hours-calendar.ts:161`), the `ColourRole` union (`:140-151`)
**Requirement**: HHAT-01, HHAT-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `lookClass` for `slot1`, `slot8`, `slot3-hatched`, `other` and `no-task`, each a literal string; `other` and `no-task` never carry `hatched`
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/hours-calendar.test.ts` then `npm test`
- [x] Test count: baseline + the new tests (2508 + 3 = 2511)

`LOOKS` moves to T2, its first user: the web tsconfig sets `noUnusedLocals`, so an unused constant fails typecheck.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(hours): name sixteen task looks, solid and hatched`

---

### T2: Spread the looks across the week

**What**: `assignColours` picks each task's look by the design's sort key: allowed looks are those no same-day task holds and not the previous task's; then fewest uses, solid before hatched, a hue no same-day task and not the previous task holds, palette order; none allowed is Other.
**Where**: `src/renderer/src/lib/hours-calendar.ts`
**Depends on**: T1
**Reuses**: `weekGroups`, the same-day scan (`hours-calendar.ts:204-214`), the test helpers `work` and `crowdedDay` (`hours-calendar.test.ts:269-282`)
**Requirement**: HHAT-02..13, HHAT-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, each asserting literal looks:
  - seven tasks, each alone on its own day Monday to Sunday, take `slot1`..`slot7` solid (HHAT-04, 09)
  - the spread week (ten tasks, task *k* on weekday `(k - 1) mod 5`, totals falling) gives `slot1`..`slot8` then `slot1-hatched`, `slot2-hatched`, in that legend order, no two neighbours alike (HHAT-05, 08)
  - sixteen tasks on one day take sixteen different looks, the solids in palette order then hatched 1 to 8 (HHAT-07, 10)
  - a seventeenth task on that day is Other (HHAT-12)
  - task 1 on Monday and Tuesday, tasks 2 to 8 on Monday, task 9 on Tuesday: task 9 is `slot2-hatched`, skipping the hue it shares a day with (HHAT-06, same day)
  - tasks 1 to 7 on Monday, task 8 alone on Tuesday, task 9 on Monday: task 9 is `slot1-hatched`, not `slot8-hatched`, the previous task's hue (HHAT-06, previous)
  - tasks 1 to 8 on Monday, task 9 alone on Tuesday, tasks 10 to 16 on Monday, task 17 on Tuesday: task 17 is `slot2`, skipping solid blue whose hatched twin is on its day (hue preference on both fills, owner confirmed 2026-10-01)
  - tasks 1 to 15 on Monday, task 16 alone on Tuesday, task 17 on Monday: task 17 is Other, its one free look being the previous task's (HHAT-13, owner confirmed 2026-10-01)
  - thirty-two tasks dealt one by one across the seven days use every look exactly twice (edge case)
  - a property run over generated weeks of 1 to 24 tasks finds no two neighbouring legend entries alike, no two same-day tasks alike, every task its own solid up to eight and its own look up to sixteen (HHAT-08, 09, 10, 11)
  - added for the spec edge case "IF a task is Other THEN it SHALL not count as the previous chip": tasks 1 to 15 on Monday and Wednesday, task 16 alone on Tuesday, task 17 on Monday, task 18 on Wednesday: tasks 17 and 18 are both Other
- [x] Three tests pinning the old rule are rewritten, each named in the commit body: "gives two tasks on different days both slot 1" (now `slot1`, `slot2`), "makes a ninth task on one day Other" (now `slot1-hatched`), the HCAL-21 legend-order test (task 9 `slot1-hatched`, task 10 `slot2-hatched`); the spec supersedes the rule they pinned
- [x] The HCAL-24 freeze test still passes unchanged (HHAT-23)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/hours-calendar.test.ts` then `npm test`
- [x] Test count: T1 count + the new tests (rewrites counted once): 2511 + 11 = 2522

**Tests**: unit
**Gate**: quick

**Commit**: `feat(hours): spread task looks across the week, never twice side by side`

---

### T3: Palette, shared slot rules and the hatch

**What**: The new hex values in both themes; the eight `.hcal-bar.role-slotN` rules become `:is(.hcal-bar, .hleg-swatch, .hours-group-swatch).role-slotN`; the `.hatched` rule from the design; the header comment points at the new decision.
**Where**: `src/renderer/src/components/HoursCalendar.css`
**Depends on**: T2
**Reuses**: the palette block (`HoursCalendar.css:8-29`) and bar rules (`:158-188`)
**Requirement**: HHAT-01, HHAT-14..19, HHAT-22

**Tools**:

- MCP: NONE
- Skill: `dataviz` (validator)

**Done when**:

- [x] Before the edit: `node <dataviz-skill-dir>/scripts/validate_palette.js "<light>" --mode light --surface "#ffffff" --pairs all` and the dark twin (`--surface "#221f1b"`) both exit 0 on the spec's exact values, outputs kept for T9 (stop rule otherwise) (re-run 2026-10-03 before the edit: light and dark both exit 0, outputs identical to the spec's "Validator output")
- [x] `.hcal-tip-key` unchanged (tooltip key row, owner confirmed 2026-10-01)
- [x] Gate check passes: `npm run lint && npx electron-vite build` (lint 0 errors, 18 warnings)

**Tests**: none
**Gate**: build

**Commit**: `style(hours): retune the task palette and add the hatch`

> **2026-10-03, after validation, owner decision:** the hatch recipe changed to stripes 3 px in every
> 6 px over `color-mix(in oklab, <hue> 5%, #fff)`, because 2 px over a 20% tint read as mostly white
> (spec AC 17, design "The Hatch"). The boxes above record the first recipe; the change is
> `style(hours): widen the hatch stripes to half the pattern`.

---

### T4: Legend swatch at 14 px

**What**: `.hleg-swatch` grows to 14 × 14 px and paints `var(--hcal-c)`; its eight slot rules are deleted (T3 shares them); Other and No task rules stay.
**Where**: `src/renderer/src/components/HoursLegend.css`
**Depends on**: T3
**Reuses**: `HoursLegend.css:81-128`
**Requirement**: HHAT-20, HHAT-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run lint && npx electron-vite build` (lint 0 errors, 18 warnings)

**Tests**: none
**Gate**: build

**Commit**: `style(hours): grow the legend swatch to show the stripes`

---

### T5: Drawer swatch at 14 px

**What**: `.hours-group-swatch` grows to 14 × 14 px and paints `var(--hcal-c)`; its eight slot rules are deleted; Other and No task rules stay.
**Where**: `src/renderer/src/components/HoursView.css`
**Depends on**: T4
**Reuses**: `HoursView.css:251-300`
**Requirement**: HHAT-20, HHAT-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run lint && npx electron-vite build` (lint 0 errors, 18 warnings)

**Tests**: none
**Gate**: build

**Commit**: `style(hours): grow the day detail's swatch to show the stripes`

---

### T6: Bars wear their look

**What**: `Bar`'s class list uses `lookClass(role)` instead of `` `role-${role}` ``.
**Where**: `src/renderer/src/components/HoursCalendar.tsx`
**Depends on**: T5
**Reuses**: T1's `lookClass`; `HoursCalendar.tsx:189-198`
**Requirement**: HHAT-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (2522 tests; lint 0 errors, 18 warnings)

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): draw hatched bars`

---

### T7: Legend chips wear their look

**What**: The chip swatch's class uses `lookClass(e.role)`.
**Where**: `src/renderer/src/components/HoursLegend.tsx`
**Depends on**: T6
**Reuses**: `HoursLegend.tsx:52`
**Requirement**: HHAT-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (2522 tests; lint 0 errors, 18 warnings)

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): show hatched looks in the legend`

---

### T8: Drawer swatches wear their look

**What**: `GroupSection`'s swatch class uses `lookClass(role)`.
**Where**: `src/renderer/src/components/HoursView.tsx`
**Depends on**: T7
**Reuses**: `HoursView.tsx:485`
**Requirement**: HHAT-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (2522 tests; lint 0 errors, 18 warnings; `npx electron-vite build` exit 0 at the phase end)

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): show hatched looks in the day detail`

---

### T9: Record the decision

**What**: The design's AD-TBD as the next free number in `STATE.md`, with T3's validator outputs and the hatch legibility table re-measured on the final values (H1 to H3, both themes, every slot passing); AD-045's row marked superseded by it for the palette and the assignment.
**Where**: `.specs/STATE.md`
**Depends on**: T8
**Reuses**: AD-045's wording; the AD-048 / AD-051 "Numbered NNN because" sentence
**Requirement**: HHAT-16, HHAT-22

**Tools**:

- MCP: NONE
- Skill: `dataviz`

**Done when**:

- [x] The number checked free across `origin/main`, the fork's branches and every open PR's `STATE.md` (main held AD-051 at planning) (2026-10-03: `origin/main` holds up to AD-053; no branch on `origin` or the fork held AD-054 or higher and upstream had no open PR, so it was recorded as AD-054; renumbered AD-055 the same day, after PR #158 (#146), executed in parallel, opened first with its own AD-054)
- [x] The H1 to H3 re-run passes every slot in both themes; a failure stops here and goes to the owner (2026-10-03, over the validator's `lin`, OKLab and `deltaE`: every slot passes; matches the design's table except dark aqua's mean, `#b5dacd` H2 21.9 against `#b6dacd` 22.0, a rounding difference)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/hours-calendar.test.ts` then `npm test` (55 and 2522 passing)

**Tests**: none
**Gate**: quick

**Commit**: `docs(state): record sixteen task looks for the hours calendar`

---

### T10: Supersession notes in the merged spec

**What**: In `hours-task-focus/spec.md`: the Out of Scope row "Texture (hatching)" gains "**Superseded by AD-NNN (2026-10-01)**"; HTF-01 (palette values), HTF-02 (assignment), HTF-04 (Other at eight) and HTF-16 (six Other bars) each gain a blockquote note naming the HHAT requirement that replaces them, in the AD-018 / AD-029 form; their traceability rows say "superseded by HHAT-NN (AD-NNN)".
**Where**: `.specs/features/hours-task-focus/spec.md`
**Depends on**: T9
**Reuses**: the note in `time-tracking/spec.md:170-173`
**Requirement**: HHAT-01, HHAT-03, HHAT-12, HHAT-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Every superseded HTF item names its replacement; HTF-03, 05, 06 and 07..15 stay untouched (Out of Scope row, HTF-01 → HHAT-14, 15; HTF-02 → HHAT-03; HTF-04 → HHAT-12; HTF-16 → HHAT-27; all under AD-055)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/hours-calendar.test.ts` then `npm test` (55 and 2522 passing)

**Tests**: none
**Gate**: quick

**Commit**: `docs(specs): mark the hours-task-focus colour rules superseded`

---

### T11: Seed the spread week

**What**: `--seed` adds ten periods five weeks back (ids `hours-smoke-spread-01..10`, tasks #9301..#9310, fictitious titles), task *k* on weekday `(k - 1) mod 5` lasting `(11 - k) × 10` minutes; the seeded-data guard requires them; the header's seed description and the section list name them.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T10
**Reuses**: the Sunday seed (`smoke-hours-calendar.mjs:264-292`), the guard (`:363-371`)
**Requirement**: HHAT-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `--seed` prints 25 periods; the smoke refuses a seed from before this change with `not running on the seeded data` (2026-10-03: `Seeded 25 periods`; on a seed written by the previous script the smoke printed `not running on the seeded data — 10 seeded periods missing` and exited 1; on the new seed `SMOKE_ONLY=assign` passed 21/21)
- [x] Week -4 stays empty (section 9's `pastBusy` setup check still passes) (the seed file holds nothing in week -4 by section 9's own overlap test; the ten spread periods sit Monday to Friday of week -5; section 9 itself runs in T15's full drive)
- [x] Gate check passes: `npm run lint` (warning count unchanged) (0 errors, 18 warnings)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): seed a week of tasks spread over five days`

---

### T12: Section 11 reads sixteen looks

**What**: Rewrite section 11: the seeded Sunday's fourteen bars wear fourteen different looks (signature `backgroundColor` + `backgroundImage`), roles `slot1`..`slot8` then `slot1-hatched`..`slot6-hatched`, no Other; each task's legend and drawer swatches match its bar's signature; the `PALETTE` constant holds the new hex values, read on the eight solid bars in both themes.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T11
**Reuses**: section 11's probe (`smoke-hours-calendar.mjs:810-867`)
**Requirement**: HHAT-10, HHAT-14, HHAT-15, HHAT-20, HHAT-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Seen failing first, each mutant through the `.orig` script: `assignColours` swapped for `origin/main`'s fails the fourteen-looks check; `HoursLegend.tsx` rendering `` `role-${e.role}` `` again fails the swatch-signature check; two light slots swapped in the palette fails the palette check (2026-10-03, sections 10 to 12 on a fresh seed and launch each: the `assignColours` mutant failed only "fourteen different looks" (tasks 9 to 14 Other, 9 signatures); the legend mutant failed only "legend and drawer swatches wear its bar's look" (hatched chips `rgba(0, 0, 0, 0) / none`); light slots 1 and 2 swapped failed only the palette check; the real build passed 23/23; `git status` unchanged after each)
- [x] The rewritten "six Other bars" check is named in the commit body (HTF-16 is superseded)
- [x] Gate check passes: `npm run lint` (warning count unchanged) (0 errors, 18 warnings)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): check sixteen looks and the retuned palette on the seeded day`

---

### T13: Section 12 keeps every look

**What**: `bars()` and `colourOf` read the look signature, so "no bar changes colour while tasks are pointed at, picked or cleared" also covers the stripes; the check's name says "look".
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T12
**Reuses**: `smoke-hours-calendar.mjs:883-885, 906-908, 1052-1058`
**Requirement**: HHAT-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Seen failing first on `.hcal-bar.dimmed { background-image: none; }` added to `HoursCalendar.css` through the `.orig` script, while the old `backgroundColor`-only signature is shown passing on the same mutant (2026-10-03, sections 10 to 12, fresh seed and launch each: the rule added after the `.hatched` rule, since an equal-specificity rule before it loses; the new check failed on the mutant (`no bar changes its look, stripes included, …`), and T12's smoke passed 23/23 on the same mutant; the real build passed 23/23. The first mutant run also failed the two keyboard-focus checks; a rerun failed only the look check, and T12's smoke passed them on the same mutant, so that was a cold flake)
- [x] Gate check passes: `npm run lint` (warning count unchanged) (0 errors, 18 warnings)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): check that focus never strips a bar's stripes`

---

### T14: Section 16, the looks

**What**: A new `looksSection()` (section 16), run by the full drive after section 15 and alone under `SMOKE_ONLY=looks`: on the spread week no two consecutive legend chips share a signature and the chips read eight solids then hatched blue and hatched orange; on the seeded Sunday the first hatched task's bar, legend swatch and drawer swatch each have the design's `repeating-linear-gradient` in its hue and a `background-color` equal to a probe's computed `color-mix(in oklab, <hue> 20%, #fff)`, and its solid twin has `background-image: none`; the legend and drawer swatches measure 14 × 14 px. The header lists section 16 and the hand-verify item "the stripes at 14 px and on a 6 px bar, in both themes".
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T13
**Reuses**: section 11's navigation and probes; T12's signature
**Requirement**: HHAT-08, HHAT-17, HHAT-18, HHAT-21, HHAT-28, HHAT-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Seen failing first, each mutant through the `.orig` script: `assignColours` swapped for `origin/main`'s fails the adjacency check (five blue chips side by side); the `.hatched` rule deleted fails the stripe checks; the ground at 30% fails the ground check; the swatch back at 10 px fails the size check (2026-10-03, `SMOKE_ONLY=looks`, fresh seed and launch each: the `assignColours` mutant failed the adjacency check (`slot1` five times, then `slot2` five times), the order check, and the stripe and ground checks, since its ninth Sunday task is Other; deleting `.hatched` failed only the stripe and ground checks (no image, the hue as fill); the 30% ground failed only the ground check; the legend swatch at 10 px failed only the size check (`10×10` on the two legend swatches); the real build passed 6/6; `git status` unchanged after each)
- [x] `SMOKE_ONLY=looks` runs section 16 alone and the summary line says so (`6/6 checks passed (section 16 only)`)
- [x] Gate check passes: `npm run lint` (warning count unchanged) (0 errors, 18 warnings)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): check spread looks and the hatch in the running app`

> **2026-10-03, after validation, owner decision:** section 16's stripe and ground checks now expect
> the new recipe, `<hue> 0px, <hue> 3px, transparent 3px, transparent 6px` over a 5% ground, in the
> same commit as the CSS change (T3's note). The boxes above record the first recipe.

---

### T15: Section 16, focus on a hatched task

**What**: In section 16 on the seeded Sunday: hovering and focusing the first hatched task's chip and bar leave only its bars at full opacity, the drawer header likewise; clicking its chip shows only Sunday; clearing restores every day; no bar's signature changes throughout. Then the full drive runs once.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T14
**Reuses**: section 12's `pointAt`, `onlyFull`, `pressedChips`
**Requirement**: HHAT-24, HHAT-25, HHAT-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Seen failing first on a legend mutant that reports no hover for a hatched chip (`onHover(e.role.endsWith('-hatched') ? null : e.groupKey)`) and on one that ignores a click on it, each through the `.orig` script (2026-10-03, `SMOKE_ONLY=looks`, fresh seed and launch each: the hover mutant, on the chip's mouse enter and focus, failed only the chip-pointing and keyboard-focus checks; the click mutant failed only the pick check and the × check, which requires the pick first; the real build passed 12/12; `git status` unchanged after each. The first real run failed the drawer-header check because the ninth group sits below the drawer's fold; the check now scrolls it into view first)
- [x] The full drive passes on the seeded app, sections 1 to 16 (85/85)
- [x] Gate check passes: `npm run lint` (warning count unchanged) (0 errors, 18 warnings)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): check hovering and picking a hatched task`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ------→ T2
Phase 2:  T2 ------→ T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6 ------→ T7 ------→ T8
Phase 4:  T8 ------→ T9 ------→ T10
Phase 5:  T10 ------→ T11 ------→ T12 ------→ T13 ------→ T14 ------→ T15
```

Fifteen tasks: two batches (Phases 1–3, eight tasks; Phases 4–5, seven). At Execute the sub-agent offer is made first.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: looks and classes | 1 type + 1 function | ✅ Granular |
| T2: assignment | 1 function | ✅ Granular |
| T3: palette and hatch | 1 stylesheet | ✅ Granular |
| T4, T5: swatches | 1 stylesheet each | ✅ Granular |
| T6–T8: components | 1 class name each | ✅ Granular |
| T9: AD | 1 decision | ✅ Granular |
| T10: notes | 1 spec | ✅ Granular |
| T11: seed | 1 seed block + guard | ⚠️ Cohesive |
| T12–T15: smoke | 1 section each | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1, T2 | pure calendar logic | unit | unit | ✅ OK |
| T3–T5 | CSS | none | none | ✅ OK |
| T6–T8 | components | none | none | ✅ OK |
| T9, T10 | docs | none | none | ✅ OK |
| T11–T15 | end to end | manual | manual | ✅ OK |
