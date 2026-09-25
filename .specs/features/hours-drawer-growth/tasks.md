# Hours Drawer Growth Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: none — no architectural decision; the fix is one CSS declaration and the rest is smoke tooling. The one open fact (`--user-data-dir`) is measured by T1, with its fallback decided in the spec.
**Status**: Approved by the owner 2026-09-25 — executing

**Branch**: `feature/hours-calendar` (PR #99, issue #105), tip `5cda0b1` at planning and `1a89301` at Execute, after the 2026-09-25 rebase onto `origin/main`. The fix is part of that PR, not a new branch (grill Q3). Pushing to `fork` and merging into `develop` wait for the owner's go-ahead at that moment.

**Test baseline**: measured at T1 on `1a89301`: **1691 tests** (91 files), lint 0 errors / **18 warnings**.

**Seed day**: Sunday of the previous week (owner, 2026-09-22). Steps 1–8 use the current week and step 9 uses week −4; neither touches it.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts, and the sibling `hours-calendar/tasks.md` matrix.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure main helper (`user-data-override.ts`, only if T1 needs it) | unit | 1:1 to HDRW-12..14: set when unpackaged and non-empty; ignored when packaged; ignored when unset or empty | `src/main/user-data-override.test.ts` | `npm test` |
| Main wiring (`src/main/index.ts`) | none (build + manual) | — | — | `npx electron-vite build` + T1's measurement repeated |
| Renderer CSS (`HoursView.css`) | none (CDP smoke) | HDRW-01..04 by geometry, each seen to fail on a broken build | — | `node scripts/smoke-hours-calendar.mjs` |
| Smoke script (`scripts/smoke-hours-calendar.mjs`) | manual | Every HDRW-05..11 behaviour exercised once, including the refusal path (HDRW-08) against the real data directory | `scripts/smoke-*.mjs` | live dev app |
| Existing unit tests | unit, unchanged | Must pass unedited | existing | `npm test` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | After main-process or renderer changes | `npx electron-vite build` |
| Manual | Smoke tasks | `node scripts/smoke-hours-calendar.mjs --seed` → `npm run dev -- -- --user-data-dir=<dir> --remote-debugging-port=9222` (or `PLAYGROUND_USER_DATA=<dir>` if T1 says so) → `node scripts/smoke-hours-calendar.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

Phases run in order; tasks within a phase run in order.

### Phase 1: Point the dev app at another data directory

```
T1 → T2 → T3
```

T2 and T3 run **only if T1 finds `--user-data-dir` ignored**; otherwise both are marked `Skipped — T1: switch honoured` and HDRW-12..14 become `N/A`.

### Phase 2: The smoke brings its own data

```
T1 → T4 → T5 → T6
```

### Phase 3: The fix

```
T6 → T7
```

---

## Task Breakdown

### T1: Measure whether `--user-data-dir` moves `app.getPath('userData')`

**What**: Launch the dev app with `--user-data-dir=<fresh temp dir>` holding a one-line `time-log.jsonl` with a fictitious period, and record whether that period's id is in `time:snapshot` over CDP; record the result and the measured test and lint baselines in this file.
**Where**: `.specs/features/hours-drawer-growth/tasks.md`
**Depends on**: None
**Reuses**: the CDP helpers of `scripts/smoke-hours-calendar.mjs` (a throwaway probe in the scratchpad, not committed)
**Requirement**: HDRW-05 (enables), HDRW-12 (decides)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The probe period is found (switch honoured) or not found (switch ignored) — the id itself is the evidence, not the presence of Chromium files in the directory, which Chromium writes either way
- [x] `%APPDATA%\playground\time-log.jsonl` has the same size and hash before and after the probe
- [x] Baselines recorded: test count, lint warning count

**Result (2026-09-25): switch honoured.** `npm run dev -- -- --user-data-dir=<fresh temp dir> --remote-debugging-port=9222`
on `1a89301`, with a one-line `time-log.jsonl` holding a fictitious period: `time:snapshot` returned exactly
one period, the probe's id (`{"found":true,"periods":1}`), so `app.getPath('userData')` follows the switch in
Electron 39 and the app read nothing else. The real `time-log.jsonl` kept its size (19054 bytes) and SHA-256
(`7eb50822…`). Baselines: **1691 tests**, lint 0 errors / **18 warnings**. T2 and T3 are skipped and HDRW-12..14
are N/A.

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): measure whether the dev app honours --user-data-dir`

---

### T2: Pure `userDataOverride` helper (only if T1 finds the switch ignored)

**Status**: Skipped — T1: switch honoured

**What**: A pure function `userDataOverride(env, isPackaged)` returning the path to use, or `null` to keep Electron's default.
**Where**: `src/main/user-data-override.ts` (new) and its co-located test
**Depends on**: T1
**Reuses**: the DI-and-pure style of `src/main/hook-shell.ts`
**Requirement**: HDRW-12, HDRW-13, HDRW-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Returns the value when unpackaged and `PLAYGROUND_USER_DATA` is non-empty (HDRW-12)
- [ ] Returns `null` when packaged, whatever the variable holds (HDRW-13)
- [ ] Returns `null` when the variable is unset or `''` (HDRW-14)
- [ ] Gate check passes: `npm test`
- [ ] Test count: baseline + 3 (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): read a dev-only userData override`

---

### T3: Apply the override before any store reads `userData` (only if T2 ran)

**Status**: Skipped — T1: switch honoured

**What**: Call `app.setPath('userData', …)` with `userDataOverride(process.env, app.isPackaged)` at the top of the main entry, before `app` is ready and before any `app.getPath('userData')`.
**Where**: `src/main/index.ts`
**Depends on**: T2
**Reuses**: T2
**Requirement**: HDRW-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] T1's probe, rerun with `PLAYGROUND_USER_DATA` instead of the switch, finds the probe period
- [ ] The real `time-log.jsonl` is unchanged by the rerun (size and hash)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `feat(main): let the dev app run on another data directory`

---

### T4: `--seed` mode writes the tall Sunday into a fresh directory

**What**: `node scripts/smoke-hours-calendar.mjs --seed` creates `%TEMP%\playground-smoke-hours-<timestamp>`, writes 14 fictitious 20-minute periods (08:00–12:40 local, `taskId` 9101..9114, fictitious titles) on the previous week's Sunday into its `time-log.jsonl` in the store's line format, writes the directory to `%TEMP%\playground-smoke-hours.last`, prints the launch command, and exits without contacting any app.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T1
**Reuses**: `TimeLogStore`'s line shape (`v` + `TimePeriod` fields) as read by `isPeriodLine`; the script's `weekDay` helper
**Requirement**: HDRW-05, HDRW-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `--seed` output: a new directory with exactly 14 lines that the app accepts (checked in T5 by `time:snapshot`, not by reading the file back with the script's own writer)
- [ ] A second `--seed` aimed at an existing directory exits non-zero and writes nothing (HDRW-06) — exercised by temporarily pinning the timestamp, then reverted
- [ ] No real work item, client or company name in the seed (public repository)
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): seed the calendar smoke with a tall Sunday`

---

### T5: The smoke refuses real data, and cleans up after a pass

**What**: Before any check, the run reads the pointer file and requires every seeded id in `time:snapshot`, else it exits with `not running on the seeded data` before spawning anything; after all checks, a pass closes the app and deletes the directory and the pointer, a failure leaves them and prints the directory. The header comment gains the three-step run.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T4
**Reuses**: the existing `finally` teardown
**Requirement**: HDRW-07, HDRW-08, HDRW-09, HDRW-10, HDRW-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Run against the owner's normal dev app (real data): exits non-zero with `not running on the seeded data`, spawns no session, and the real `time-log.jsonl` is unchanged (HDRW-08)
- [ ] Run with the pointer file removed: same refusal (HDRW-08)
- [ ] Run on the seeded directory: steps 1–9 pass as before (HDRW-11), then the app closes and the directory and pointer are gone (HDRW-09)
- [ ] A forced failure (one check temporarily inverted, then reverted): the app stays open, the directory stays, its path is printed (HDRW-10)
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): run the calendar smoke only on its own seeded data`

---

### T6: Step 10 — a tall day stays inside its card

**What**: Go back one week, open the seeded Sunday at 1100 × 640, and check HDRW-01..04 by geometry: card bottom ≥ last group bottom and `card.scrollHeight <= card.clientHeight + 1`; the drawer scrolls and, scrolled to the end, shows the card's bottom border; the page does not scroll; and on a short day (today's, from step 5) the card is at least the drawer's height. Precondition asserted first: the drawer really overflows, so the check cannot pass on a day that fits.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T5
**Reuses**: `nav`, `clickHead`, `fits`, `Emulation.setDeviceMetricsOverride` from step 7
**Requirement**: HDRW-01, HDRW-02, HDRW-03, HDRW-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Run on the **current** CSS: HDRW-01 and HDRW-02 **FAIL**, HDRW-03 and HDRW-04 pass — output pasted into this task as the red evidence
- [ ] HDRW-03 seen to fail with `min-height: 100%` temporarily removed from `.hours-day`, then restored
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): check that a tall day stays inside its card`

---

### T7: The day card keeps its content's height

**What**: Add `flex: none` to `.hours-day`, so the drawer's column no longer shrinks the card below its content.
**Where**: `src/renderer/src/components/HoursView.css`
**Depends on**: T6
**Reuses**: the same declaration on `.hours-drawer` and `.hours-drawer-close`
**Requirement**: HDRW-01, HDRW-02, HDRW-03, HDRW-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The full smoke passes on a fresh seed, steps 1–10, and cleans up after itself
- [ ] `%APPDATA%\playground\time-log.jsonl` is unchanged by the whole run (size and hash)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`
- [ ] Test count: baseline (+3 if T2 ran), no silent deletions

**Tests**: none
**Gate**: build

**Commit**: `fix(hours): let a tall day's card grow with its groups`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T1 ------→ T4 ------→ T5 ------→ T6
Phase 3:  T6 ------→ T7

T2 and T3 run only if T1 finds the switch ignored.
```

Seven tasks at most: a single batch, executed inline. The Verifier runs after T7.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: measure the switch | 1 measurement, recorded | ✅ Granular |
| T2: `userDataOverride` | 1 function + its test | ✅ Granular |
| T3: apply the override | 1 call site | ✅ Granular |
| T4: `--seed` mode | 1 mode of 1 script | ✅ Granular |
| T5: refusal + clean-up | 2 related concerns in 1 script, the run's entry and exit | ⚠️ Cohesive |
| T6: step 10 | 1 smoke step | ✅ Granular |
| T7: `flex: none` | 1 declaration | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | start of Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T1 | T1 → T4 | ✅ Match (backward, earlier phase) |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match (backward, earlier phase) |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: measure | spec docs | none | none | ✅ OK |
| T2: helper | pure main helper | unit | unit | ✅ OK |
| T3: wiring | main wiring | none (build + manual) | none, build gate + probe rerun | ✅ OK |
| T4: `--seed` | smoke script | manual | manual | ✅ OK |
| T5: refusal + clean-up | smoke script | manual | manual | ✅ OK |
| T6: step 10 | smoke script | manual | manual | ✅ OK |
| T7: CSS | renderer CSS | none (CDP smoke) | none, proven by T6's check turning green | ✅ OK |
