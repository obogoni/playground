# Diff Fold Refresh Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/diff-fold-refresh/design.md`. In one line: the app computes the unchanged
regions from `getLineChanges()` with Monaco's own rule, snapshots their fold states before `setValue`,
and applies its own plan through `restoreViewState`'s `modelState` once Monaco has recomputed; the
per-tab Hide / Show choice lives in `use-files` and reaches every mounted `DiffViewer` as a prop.
**Status**: Approved by the owner on 2026-09-27 ("pode seguir com a #130", executed inline at the
owner's choice). T1-T17 Done (fix round 1 closed); awaiting the Verifier, round 2.

**Branch**: `feature/diff-fold-refresh`, cut from `feature/files-view-polish` `70d573c` (PR #125, which
adds Expand all / Collapse all). Rebase onto `origin/main` once #125 merges. The future PR body carries
`Closes #130`.

**Stop rule (T1)**: T1 reproduces the symptom and measures the cause before any fix. If the measurement
does not match the cause read in the code (design.md, first section), **stop after T1**, record what was
measured, and revise the plan with the owner. No later task starts on a cause nobody measured.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute, after T1's
`npm ci`; record the lint warning count at the same time.

**Smoke**: `scripts/smoke-files-diff.mjs` gains **section 14**, appended after section 13 (which ends by
committing everything left, so section 14 starts from an empty Uncommitted mode and writes its own
changes). Every drive needs a fresh seed and a freshly launched app on a throwaway `--user-data-dir`,
with `--remote-debugging-port=9222 --disable-renderer-backgrounding
--disable-backgrounding-occluded-windows --disable-background-timer-throttling`, and `SMOKE_CONFIG`
pointing at that dir's `config.json`. The Files smoke opens no agent session, so no real CLI starts.

**Future conflict**: the file-icons branch adds a smoke section that reloads the window and must stay
last. When both branches meet, section 14 goes **before** the icon section.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (pure seams unit-tested, renderer components by CDP smoke), `vitest.config.ts`, `package.json` scripts; style sampled from `src/renderer/src/lib/diff-view.test.ts` and `files-view.test.ts`; confirmed lessons L-001, L-005; candidates L-018, L-021, L-025, L-030, L-031, L-041 applied.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure region and plan rules (`diff-view.ts`) | unit | All branches; 1:1 to FOLD-01..08, 10, 15, 25, 26 as rules; fixtures follow Monaco's `fromDiffs` line by line | `src/renderer/src/lib/diff-view.test.ts` | `npx vitest run src/renderer/src/lib/diff-view.test.ts` |
| Pure tab choice rules (`files-view.ts`) | unit | 1:1 to FOLD-12 (a repeated press re-applies), 14, 21, 27 as rules | `src/renderer/src/lib/files-view.test.ts` | `npx vitest run src/renderer/src/lib/files-view.test.ts` |
| Hook (`use-files.ts`) | none (CDP smoke) | FOLD-19..22 in the running app | — | smoke |
| Components (`DiffViewer`, `DiffSection`, `AllChangesTab`, `CommitTab`, `FileTabs`) | none (CDP smoke) | FOLD-01..04, 08, 09, 11..24, 27 in the running app | — | `node scripts/smoke-files-diff.mjs` |
| End to end | manual CDP smoke | Every new check seen failing on a deliberately broken build, then passing | `scripts/smoke-files-diff.mjs` section 14 | live dev app |

**Evidence split** (L-021, L-025): FOLD-05, 06, 07, 10, 25 and 26 are proven by unit tests of the rule
(T3, T4); their wiring is the same `applyFolds` path section 14 exercises for FOLD-02/03/04. Every other
FOLD ID has a numbered smoke check named in T1, T11 or T12.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | A task whose only tests are unit tests | `npx vitest run <the task's test file>` |
| Full | A code task | `npm run typecheck && npm run lint && npm test` |
| Build | Phase ends, and T12 | `npx electron-vite build` |
| Manual | T1, T6, T11, T12 | `node scripts/smoke-files-diff.mjs --seed` → launch the dev app as in **Smoke** above → `node scripts/smoke-files-diff.mjs` → `node scripts/smoke-files-diff.mjs --clean` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

**Mutating for a falsification**: through a script that copies the file to `.orig`, writes the mutant,
and restores in `finally`; `git status --porcelain` must match the baseline afterwards. A mutant in
`src/renderer` is picked up by the dev server; relaunch anyway, because every drive needs a fresh app.

---

## Execution Plan

### Phase 1: Measure

```
T1
```

### Phase 2: Rules

```
T1 → T2 → T3 → T4 → T5
```

### Phase 3: Viewer

```
T5 → T6 → T7
```

### Phase 4: State and buttons

```
T7 → T8 → T9 → T10
```

### Phase 5: Prove

```
T10 → T11 → T12
```

### Phase 6: Fix round 1 (Verifier FAIL, 2026-09-27)

```
T12 → T13 → T14 → T15 → T16 → T17
```

---

## Task Breakdown

### T1: Reproduce and measure

**What**: Set the worktree up for the dev app, seed two long files, add the reproduction checks as
section 14 of the smoke, run them on the unchanged code, confirm the cause with a throwaway mutant, and
record the numbers here.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: None
**Reuses**: the seed, `check`, `evaluate`, `clickByText`, the FDIF-30 timing poll (section 11)
**Requirement**: FOLD-01, FOLD-02, FOLD-04 (reproduction only)

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**:

1. Setup: `npm ci --ignore-scripts` then `node node_modules/electron/install.js` in the worktree; run
   the baseline (`npx vitest run`, `npm run lint`) and record both counts in this task.
2. Seed: `fold/long.ts` (200 lines, line *n* is `export const lNNN = n` with *n* zero-padded to three
   digits) and `fold/other.ts` (120 lines, `oNNN`), both committed in the **base** commit and never
   changed on the branch, so sections 1–13 see nothing new.
3. Section 14, first checks. Write `fold/long.ts` with lines 20 and 180 changed and `fold/other.ts`
   with lines 50–70 changed; open Uncommitted → All changes; set a probe attribute on each section's
   `.monaco-diff-editor` node through CDP.
   - **14a** "A long file's section opens folded (FOLD-01)": long.ts shows **3** strips, other.ts **2**.
     Strips are counted as `.diff-hidden-lines` inside the section's modified editor (confirm the
     selector in the DOM and write it here; Monaco's label reads "N hidden lines", not "N unchanged
     lines"). The section is inline by now (section 6 persisted it).
   - **14b** "A disk change keeps the section folded, in the same editor (FOLD-02, FOLD-04)": rewrite
     long.ts with line 100 changed as well; poll until `l100`'s new text shows (≤ 1 s, FDIF-30's
     poll); require the probe still on the node, then expect **4** strips.
4. Run on the unchanged code: expected 14a PASS, 14b FAIL with 0 strips and the probe kept.
5. Cause check, throwaway: replace the modified side's `setValue` in `DiffViewer.tsx` by one
   `applyEdits` over the common-prefix/suffix line span (decorations outside it survive); relaunch;
   14b is expected to PASS. Restore from `.orig`; `git status --porcelain` equals the baseline.

**Stop rule**: stop after T1 and revise the plan with the owner if **any** of: 14a fails (the section
starts whole — another cause); the probe is gone after the write (the editor was rebuilt, not fed);
14b passes on the unchanged code with a single-hunk write **and** with a two-hunk write (the symptom
needs another trigger, e.g. a write through an empty file); or the step-5 mutant does not bring the
strips back (decorations are not the carrier).

**Done when**:

- [x] Baseline test count and lint warning count recorded here
- [x] 14a and 14b written; their measured result on the unchanged code recorded here (strip counts, probe, arrival time)
- [x] Step 5's result recorded; `git status --porcelain` clean afterwards
- [x] The stop rule evaluated in writing: "cause confirmed, continue" or "stopped, owner asked"
- [x] Gate check passes: `npm run lint` (warning count unchanged)

**Result (2026-09-27)**:

- **Setup**: executed in the main checkout, not a separate worktree. `npm ci` was skipped: the
  installed `node_modules` came from `develop`, whose `package.json` differs from this branch's only by
  two extra icon packages (`@iconify-json/vscode-icons`, `vscode-icons-js`) that nothing here imports.
  Baseline on the branch: **1680 tests / 90 files**; `npm run lint` exit 0 with **18 warnings, 0 errors**.
- **Harness**: every drive ran through a scratchpad runner that seeds into a scratchpad base, launches
  `npx electron-vite dev -- --user-data-dir=<fresh temp dir> --remote-debugging-port=9222` plus the three
  anti-occlusion flags, runs the drive, kills the app tree and runs `--clean`. No electron process was left
  after any run.
- **Selector**: a strip is `.diff-hidden-lines` inside `.editor.modified`; the original editor carries a
  mirrored copy (`.editor.original .diff-hidden-lines`, same count), so only the modified side is counted.
  The label reads "N hidden lines" in `.center`.
- **14a on the unchanged code: PASS.** long.ts 3 strips (16 / 153 / 18 hidden lines), other.ts 2 (46 / 48).
  The last region of long.ts is **18** lines, not 17: the file ends in `\n`, so Monaco's model has 201
  lines and the region is `[184, 202)`. T2's fixtures take the model's line count (lines + 1 for a
  trailing newline), not the file's.
- **14b on the unchanged code: FAIL.** The new text arrived in 641 ms; the probe was still on the same
  `.monaco-diff-editor` node (the editor was fed, not rebuilt); **0 strips**.
- **Step 5, cause check**: with the modified side's `setValue` replaced by one `applyEdits` over the
  common prefix / suffix span, 14b **PASSES**: 4 strips (16 / 73 / 73 / 18), arrived in 837 ms, probe kept;
  47/47. Restored from `.orig`; `git status --porcelain` afterwards lists only this task's smoke edit.
- **Stop rule: cause confirmed, continue.** 14a passed, the probe survived, 14b failed on the unchanged
  code, and the mutant brought the strips back, so `setValue` wiping the decorations is the carrier.

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): reproduce a diff unfolding after a disk change`

---

### T2: The unchanged-region rule

**What**: `UNCHANGED_REGIONS` (3 context lines, 3-line minimum, 20 lines per reveal step) and
`unchangedRegions(changes, originalLines, modifiedLines)` returning each region's left and right line
spans, mirroring `UnchangedRegion.fromDiffs` (`diffEditorViewModel.js:347-375`) over the
`ILineChange` convention of `getLineChanges()` (`diffEditorWidget.js:543-575`).
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T1
**Reuses**: nothing; no Monaco import (the module stays pure)
**Requirement**: FOLD-01, FOLD-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: the constants are 3 / 3 / 20; T1's two layouts (changes at 20 and 180 of 200 → three regions `[1,17)`, `[24,177)`, `[184,201)`; plus line 100 → four); a region at the start or end needs 6 lines, one between changes 9; a run one line short of each bound yields none (L-028); an insertion (`originalEndLineNumber` 0) and a deletion (`modifiedEndLineNumber` 0, including at line 0) give the right spans; no changes → one region over the whole file; left and right spans differ in position but not in length
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/diff-view.test.ts`
- [x] Test count: baseline + the new tests

**Result (2026-09-27)**: 10 new tests, red before the code (`unchangedRegions is not a function`), then 44/44 in the file. Fixtures take the model's line count (201 for a 200-line file ending in a newline), as T1 measured; the four-region fixture asserts the 16 / 73 / 73 / 18 the running app showed. Each bound has its one-short case with an exact region list: 6 vs 5 lines at the start and at the end, 9 vs 8 between two changes. Insertion (`originalEndLineNumber` 0), deletion (`modifiedEndLineNumber` 0) and a deletion of line 1 (modified start 0) each assert both sides; the insertion test asserts equal lengths with different positions.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): compute a diff's unchanged regions`

---

### T3: Reading the fold state

**What**: `hiddenRangesOf(modelState: unknown)` (the hidden right-side spans, or `null` for any other
shape) and `regionStates(regions, hidden)` (per region, how many lines are revealed above and below its
strip).
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T2
**Reuses**: T2's `Region` and `LineSpan`
**Requirement**: FOLD-03, FOLD-05, FOLD-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a well-formed state parses; `undefined`, `null`, a missing or non-array `collapsedRegions`, a range that is not two numbers each give `null` (each fixture reaches the check it names, L-027); a fully hidden region reads folded (0 / 0); an empty hidden span reads revealed; a partial span reads its top and bottom counts; hidden spans that Monaco split inside one region are read together
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/diff-view.test.ts`
- [x] Test count: T2 count + the new tests

**Result (2026-09-27)**: 10 new tests, red before the code (`hiddenRangesOf is not a function`, `regionStates is not a function`), then 54/54 in the file. The shape was read from `diffEditorViewModel.js` `serializeState` / `restoreSerializedState` / `setHiddenModifiedRange`: one `{ range: [start, endExclusive] }` per region, the region's hidden right-side range; a region revealed whole serializes an empty range touching one of its edges (both edges tested). Every null fixture fails on the check it names: not an object, no `collapsedRegions`, not an array, a null entry, no `range`, a range of one or three items, a string in it, and one bad entry among good ones. Added a case the plan did not list: a region with no hidden range reads folded (0 / 0), the branch `regionStates` takes when Monaco's list and the app's regions disagree.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): read which unchanged regions are revealed`

---

### T4: The fold plan

**What**: `foldPlan(previous, next, choice, leftChanged)` and `choicePlan(next, choice)`, returning
the spans `applyFolds` hands to Monaco (design.md, Region rules).
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T3
**Reuses**: T2, T3
**Requirement**: FOLD-02, FOLD-03, FOLD-04, FOLD-05, FOLD-06, FOLD-07, FOLD-12, FOLD-13, FOLD-15, FOLD-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, one per rule: a folded region that still exists stays folded (FOLD-02); a revealed one stays revealed, including both halves of a region a new change split (FOLD-03); a region with no left-side overlap folds with no choice or `hide` (FOLD-04) and is revealed with `show` (FOLD-15); a partial region keeps its top and bottom counts, clamped when it shrank (FOLD-05); a merged region is revealed if any source was, folded otherwise (FOLD-06); `leftChanged` and `previous === null` give the choice, or folded (FOLD-07); an empty `previous` (a write through an empty file) folds everything (FOLD-26); `choicePlan` folds all or reveals all (FOLD-12, 13)
- [x] Tests: every span stays inside its own region's right side, so Monaco's intersect-or-touch match (`lineRange.js:103-110`) cannot hand it to a neighbour
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/diff-view.test.ts`
- [x] Test count: T3 count + the new tests

**Result (2026-09-27)**: 14 new tests, red before the code (`foldPlan is not a function`, `choicePlan is not a function`), then 68/68 in the file. Fixtures are T1's measured regions (long.ts 16 / 153 / 18, then 16 / 73 / 73 / 18) and the other.ts layout of 14d. Beyond the listed rules, one test moves the right side of a matched region by an insertion above it, to pin that matching is by left-side lines only. Two readings taken where the spec leaves room, both recorded here for the Verifier:

- **FOLD-06, "revealed"** means revealed whole. A merged region whose sources were only revealed in part folds; "revealed in part" is FOLD-05's own case, for a single source.
- **The new type `UnchangedMode = 'hide' | 'show'`** is declared in `diff-view.ts`, next to the plans that take it, so T5's `UnchangedChoice` in `files-view.ts` imports it rather than declaring the union twice.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): plan which unchanged regions stay folded`

---

### T5: The tab's choice

**What**: `UnchangedChoice`, `UnchangedChoices`, `pressUnchanged(choices, key, mode)` and
`keepUnchanged(choices, liveKeys)`.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T4
**Reuses**: `ALL_CHANGES_KEY` (`diff-view.ts:70`)
**Requirement**: FOLD-12, FOLD-14, FOLD-21, FOLD-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a first press records the mode with press 1; the same button again increments the press (so it re-applies after a hand reveal); the other button switches the mode; choices of other keys are untouched; `keepUnchanged` drops a closed tab's choice and never drops All changes'; a press recorded with no editor anywhere is kept as is (the rule has no notion of editors)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/files-view.test.ts`
- [x] Test count: T4 count + the new tests

**Result (2026-09-27)**: 7 new tests, red before the code (the file failed to load: `pressUnchanged is not a function`, called by the `keepUnchanged` fixtures at collection), then 50/50 in the file; typecheck 0. `UnchangedChoice.mode` takes T4's `UnchangedMode` from `diff-view.ts`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): remember a tab's last Hide or Show choice`

---

### T6: The diff keeps its folds across a refresh

**What**: `DiffViewer` passes `UNCHANGED_REGIONS` to `hideUnchangedRegions`; the content effect
snapshots `regionStates` before `setValue` when either side's text differs and no update is pending;
`onDidUpdateDiff` applies `foldPlan` through one `applyFolds` adapter (`restoreViewState` with `{}`
inner states and a `modelState`), then clears the pending update; a `null` from `hiddenRangesOf` skips
the snapshot. Scroll restoration and the EOL markers stay as they are.
**Where**: `src/renderer/src/components/DiffViewer.tsx`
**Depends on**: T5
**Reuses**: T2–T4; the existing `onDidUpdateDiff` listener and scroll capture
**Requirement**: FOLD-02, FOLD-03, FOLD-04, FOLD-08, FOLD-09, FOLD-10, FOLD-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `applyFolds` is the only code that builds a `modelState`
- [x] T1's 14a and 14b pass on a fresh seed and a fresh launch; the existing FDIF-30 check still passes
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-09-27)**: on a fresh seed and a fresh launch the smoke passes 47/47: 14a 3 / 2 strips; 14b 4 strips (16 / 73 / 73 / 18), probe kept, arrived in 651 ms; FDIF-30 arrived in 639 ms with `scrollTop 0 -> 0`. The only `modelState` built in `src` is `applyFolds` (`DiffViewer.tsx:107`); `hiddenRangesOf` only reads one. Confirmed in `diffEditorViewModel.js:222-231` before wiring: Monaco sets the new unchanged regions and the diff in one transaction, so `onDidUpdateDiff` sees the new regions and nothing of Monaco's runs after the plan. Gate: typecheck 0, lint 0 errors / 18 warnings, 1721/1721 tests (1680 + 41 from T2-T5).

**Tests**: none
**Gate**: full

**Commit**: `fix(files): keep a diff folded when its file changes on disk`

---

### T7: The diff applies a Hide or Show choice

**What**: an optional `unchanged: UnchangedChoice | null` prop; on the first computed diff of a mount,
apply `choicePlan` when a choice exists; on a new `unchanged.press`, apply `choicePlan` to the current
regions (skipped while `getLineChanges()` is still `null`); the refresh plan of T6 receives the choice
(FOLD-15).
**Where**: `src/renderer/src/components/DiffViewer.tsx`
**Depends on**: T6
**Reuses**: `live` ref pattern (`DiffViewer.tsx:122-125`), T4's `choicePlan`
**Requirement**: FOLD-12, FOLD-13, FOLD-14, FOLD-15, FOLD-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The editor is still created once per mount (no new dependency on the mount effect)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-09-27)**: the mount effect still depends on `[renderable]` alone. The choice reaches the editor three ways: the `press` effect folds or reveals every region of the current diff; the first computed diff of a mount applies `choicePlan` when a choice exists; a refresh passes the choice to `foldPlan`. One case the plan did not name, decided here: a press while a refresh is pending sets the pending reading to `states: null`, so the recomputed diff takes the choice instead of the reading from before the press, which would undo it. Gate: typecheck 0, lint 0 errors / 18 warnings, 1721/1721 tests. The behaviour is proven by T11 and T12's smoke checks.

**Tests**: none
**Gate**: full

**Commit**: `feat(files): fold or reveal a diff's unchanged lines on request`

---

### T8: `use-files` keeps each tab's choice

**What**: `WorktreeFiles.unchanged`; `UseFiles.unchangedFor(key)` and `UseFiles.pressUnchanged(key,
mode)`; `closeTab` and `closeTabs` apply `keepUnchanged` over the surviving strip keys. Nothing goes
through `onPersist`.
**Where**: `src/renderer/src/lib/use-files.ts`
**Depends on**: T7
**Reuses**: `patchFiles`, T5's rules, the strip keys `closeTab` / `closeTabs` already compute
**Requirement**: FOLD-19, FOLD-20, FOLD-21, FOLD-22, FOLD-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `EMPTY` gains `unchanged: {}` and stays a constant
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-09-27)**: `WorktreeFiles.unchanged` with `EMPTY.unchanged = {}` (still a module constant); `unchangedFor(key)` and `pressUnchanged(key, mode)` on `UseFiles`; `closeTab` keeps the choices of `after.tabs` and `closeTabs` those of `after.keys`, the strip keys each already computed. No `unchanged` reaches `onPersist` (grep). The rule's `pressUnchanged` is imported as `recordPress`, since the hook's own callback takes the name. Gate: typecheck 0, lint 0 errors / 18 warnings, 1721/1721 tests.

**Tests**: none
**Gate**: full

**Commit**: `feat(files): keep each tab's Hide or Show choice per worktree`

---

### T9: Hide unchanged and Show unchanged in All changes

**What**: `AllChangesTab` takes `unchanged` and `onUnchanged(mode)`, renders **Hide unchanged** and
**Show unchanged** after Collapse all (class `all-changes-toggle`, titles "Fold the unchanged lines of
every file" / "Show the unchanged lines of every file"), and hands `unchanged` to every `DiffSection`,
which passes it to its `DiffViewer`.
**Where**: `src/renderer/src/components/AllChangesTab.tsx` (and the one-prop pass-through in `DiffSection.tsx`)
**Depends on**: T8
**Reuses**: the Expand all / Collapse all buttons and their class
**Requirement**: FOLD-11, FOLD-12, FOLD-13, FOLD-14, FOLD-24, FOLD-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The empty state still has no header, so the new buttons never show with nothing listed (the existing FPOL-17 check counts every `.all-changes-toggle`)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-09-27)**: Hide unchanged and Show unchanged sit after Collapse all, class `all-changes-toggle`, with the planned titles; `unchanged` goes `AllChangesTab` → `DiffSection` → `DiffViewer`. The empty state returns before the header (`AllChangesTab.tsx`, the `all-changes-empty` branch), so neither button shows with nothing listed. Both new props are optional on `AllChangesTab` so the tree compiles before T10 wires them. Gate: typecheck 0, lint 0 errors / 18 warnings, 1721/1721 tests.

**Tests**: none
**Gate**: full

**Commit**: `feat(files): hide or show every file's unchanged lines at once`

---

### T10: Wire All changes, commit tabs and the diff tab toolbar

**What**: `FileTabs` gives All changes (`ALL_CHANGES_KEY`), each commit tab and each diff tab (their
`tabKeyOf`) `files.unchangedFor(key)` and `files.pressUnchanged`; `CommitTab` passes both to its
`AllChangesTab`; the diff toolbar shows Hide unchanged and Show unchanged (class `file-tabs-toggle`)
while `diffTab` is set, and `DiffBody` hands the choice to its `DiffViewer`.
**Where**: `src/renderer/src/components/FileTabs.tsx` (and the pass-through in `CommitTab.tsx`)
**Depends on**: T9
**Reuses**: the Open file button's placement (`FileTabs.tsx:395-405`), `tabKeyOf`
**Requirement**: FOLD-17, FOLD-18, FOLD-19, FOLD-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Result (2026-09-27)**: All changes takes `files.unchangedFor(ALL_CHANGES_KEY)` and presses under that key, the same key in both diff lenses (FOLD-20); a commit tab and a diff tab each use their own `tabKeyOf`; `CommitTab` passes both props through to its `AllChangesTab`; `DiffBody` hands its tab's choice to its `DiffViewer`. The diff toolbar shows Hide unchanged and Show unchanged (class `file-tabs-toggle`) before Open file, only while `diffTab` is set. Gate: typecheck 0, lint 0 errors / 18 warnings, 1721/1721 tests, `npx electron-vite build` exit 0.

**Tests**: none
**Gate**: full

**Commit**: `feat(files): hide or show unchanged lines in commit and diff tabs`

---

### T11: Smoke — the folds survive refreshes

**What**: Section 14 continues after 14b, before any button is pressed.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T10
**Reuses**: T1's probe, strip count and poll
**Requirement**: FOLD-03, FOLD-04, FOLD-08, FOLD-09, FOLD-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Checks** (each requires its precondition before it counts, L-031):

- **14c** Reveal long.ts's second strip by its unfold control (4 → 3 strips, `l050` shown); rewrite with line 195 changed as well; `l050` is still shown and the strip count is exactly the plan's (FOLD-03).
- **14d** Rewrite other.ts so only lines 50 and 70 differ: the run 51–69, all changed lines before, becomes a region and is folded (2 → 3 strips) (FOLD-04).
- **14e** Two writes to long.ts 60 ms apart: after the diff settles, the strip count is the one the final text gives (FOLD-08).
- **14f** Open long.ts's diff tab from the Uncommitted tree: strips shown; rewrite; the same count or the plan's, within 1 s (FOLD-02 and FOLD-09 on the single diff tab).
- **14g** With a strip revealed by hand in All changes, switch to the diff tab and back: the section is folded again (FOLD-23, the recommended default).

**Done when**:

- [x] Each check seen **failing** on a fresh launch against its mutant, then passing: `foldPlan` reveals unmatched regions (14d); `foldPlan` forgets revealed ones (14c); a change while an update is pending drops the plan (14e); `DiffBody` bypasses the fold plan by keying on the sides (14f); hand reveals carried across a remount (14g)
- [x] Mutants restored through `.orig`; `git status --porcelain` matches the baseline
- [x] Gate check passes: `npm run lint` (warning count unchanged)

**Result (2026-09-27)**: section 14 gained 14c-14g and became `foldSection(ws)`. At the owner's request, the smoke also gained **`SMOKE_ONLY=fold`**: `foldSetup` builds the state section 13 leaves (inline layout, everything committed) and only section 14 runs, in **37 s** against about 4 minutes for the full drive. Every drive below still used a fresh seed and a fresh launch. The full drive runs once at T12, before the Verifier. Focused run on the fixed code: **7/7**.

What the checks had to learn, each measured in the running app:

- Inline, the modified editor also renders the original's removed lines, so an arrival signal must be text that exists only on the new modified side. 14d waits for `o051 = -51` to go.
- A line outside a diff tab's viewport is never rendered. 14f times the arrival by the strips' labels changing.
- Tab labels carry the diff glyph. 14g switches tabs with `focusTabNamed` and requires the diff tab to be shown and the stack unmounted before it counts.
- A section pushed past the mount margin loses its editor. After 14b, other.ts had none, depending on the window's height. 14d collapses long.ts first and expands it after. 14d also runs before 14c, whose reveal grows long.ts.

Falsification: each mutant ran through the focused smoke, restored from `.orig`; `git status --porcelain` afterwards listed only this task's smoke edit.

| Mutant | Check it names | Result |
| --- | --- | --- |
| `foldPlan` folds a region revealed whole | 14c | **killed**: 5 strips, `l050` hidden. 14e fails too, since it builds on 14c's reveal |
| `foldPlan` reveals a region with no source | 14d | **killed**: 2 strips (want 3) |
| a change while an update is pending drops the reading | 14e | **survived** (see below) |
| `DiffBody` keyed on the modified text's length | 14f | **killed**: probe gone |
| a module cache carries each surface's fold state across a remount | 14g | **killed**: 5 strips after the switch (want 8) |

**FOLD-08 is not reachable from the disk at this file size.** `FileWatcher` batches events in a fixed 250 ms window (`file-watcher.ts:5`, `startBatch`), and the diff recomputes about 230 ms after `setValue` (measured: 7916 → 8144 ms in an instrumented run). A second write therefore lands either in the same batch, as one refresh, or after the first diff is done. 14e is kept, relabelled, as proof of the coalesced path: two writes 60 ms apart leave the final text's plan. FOLD-08's own rule, keeping the first reading while an update is pending, rests on code review of the `pendingRef.current === null` guard in `DiffViewer`'s content effect. This is recorded as an evidence gap for the Verifier and the owner, not as covered.

The first 14g mutant, a cache keyed by path alone, survived for a reason inside the mutant: the diff tab's editor, unmounted before its first diff, stored `{}` over the section's state. The mutant was keyed per surface and skips empty states; that version is the one killed above.

Gate: `npm run lint` exit 0, 0 errors / 18 warnings (unchanged).

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): check that diffs stay folded across refreshes`

---

### T12: Smoke — Hide unchanged and Show unchanged

**What**: Section 14's last checks, then the full gate.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T11
**Reuses**: T11's state, section 13's commit-tab opener
**Requirement**: FOLD-11, FOLD-12, FOLD-13, FOLD-14, FOLD-15, FOLD-16, FOLD-17, FOLD-18, FOLD-19, FOLD-20, FOLD-21, FOLD-22, FOLD-24, FOLD-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Checks**:

- **14h** All changes' header lists Hide unchanged and Show unchanged after Collapse all (FOLD-11).
- **14i** With one strip revealed by hand, Hide unchanged folds every region of both sections, that one included (FOLD-12).
- **14j** After Hide, revealing one strip by hand changes only that strip (count − 1) (FOLD-16).
- **14k** Show unchanged leaves no strip in either section and shows `l050`, `l150`, `o030` (FOLD-13).
- **14l** With Show chosen: Collapse all, Expand all → both sections come back without strips (FOLD-14); a rewrite creating a new region leaves the strip count at 0 (FOLD-15).
- **14m** With Hide chosen: Collapse all, press Show, Expand all → no strips (FOLD-27; a press with nothing mounted is remembered).
- **14n** Switch the lens to Diff to origin and back to Uncommitted: All changes still shows no strips (FOLD-20).
- **14o** An untracked 20-line `fold/new.ts` reads whole, and Hide unchanged leaves it whole (FOLD-24).
- **14p** In long.ts's diff tab the toolbar shows both buttons, All changes' toolbar does not (FOLD-18, L-042); Show unchanged → no strips; switch to All changes and back → still none (FOLD-19); close the tab, reopen the diff → strips again (FOLD-21).
- **14q** The userData `config.json` holds no trace of the choice (no `unchanged` key) after all the presses (FOLD-22).
- **14r** Commit the fold files; in Commits mode open that commit: Show unchanged leaves no strip, Hide unchanged folds them (FOLD-17).

**Done when**:

- [x] Each check seen **failing** on a fresh launch against its mutant, then passing: the choice kept in `AllChangesTab` state (14l, 14n, 14p); a press ignored while no editor exists (14m); `keepUnchanged` not called on close (14p); the choice written through `onPersist` (14q); `CommitTab` not passing the choice (14r); Hide only folding regions that were folded (14i); the buttons on every diff surface (14p)
- [x] Mutants restored through `.orig`; `git status --porcelain` matches the baseline
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build` (warning count unchanged)
- [x] Traceability in `spec.md` updated for every FOLD ID

**Result (2026-09-27)**: 14h-14r added to `foldSection`; focused run 18/18 in 71 s. A section showing its whole file pushes the one below out of the mount margin. So T12 starts from a short stack (long.ts back to two changes), makes hand reveals in other.ts (the lower section), and reads other.ts with long.ts collapsed.

Falsification, each mutant through the focused smoke, restored from `.orig`, `git status --porcelain` clean but for this task's edit:

| Mutant | Planned check | Result |
| --- | --- | --- |
| the choice kept in `AllChangesTab` state | 14l, 14n, 14p | **killed by 14n** (5 strips after the lens switch). 14l and 14p pass under it: Collapse / Expand all do not remount `AllChangesTab`, and 14p's choice lives in `DiffBody`'s tab, so the plan over-predicted |
| a press ignored while no section holds an editor | 14m | **killed**: 5 strips (want 0); 14n fails after it, on the state it leaves |
| `closeTab` keeps the closed tab's choice | 14p | **killed**: the reopened diff has 0 strips |
| the choice written through `onPersist` | 14q | **killed**: `"unchanged"` found in `config.json` |
| `CommitTab` does not pass the choice | 14r | **killed**: 5 → Show 5 |
| Hide keeps hand-revealed regions revealed | 14i | **killed**: other.ts stays at 2; 14j, 14m, 14o, 14r fail after it |
| the buttons on every diff surface | 14p | **killed**: All changes' toolbar lists them |

Full gate before the Verifier: typecheck 0, lint 0 errors / 18 warnings, **1721/1721** tests, `npx electron-vite build` 0. **Full smoke, the one full run agreed with the owner: 63/63 in 174 s** (sections 1-13's 45 checks plus section 14's 18). Traceability in `spec.md` is updated for all 27 FOLD IDs; FOLD-08 is marked as resting on code, per T11.

**Tests**: manual
**Gate**: build

**Commit**: `test(files): check Hide unchanged and Show unchanged`

---

## Fix round 1 (Verifier FAIL on evidence, 2026-09-27)

The Verifier's round 1 (`validation.md`) failed on test evidence only: 16 of 20 mutants killed. The four survivors are U07, U10, U15 and S3. The owner decided two open points on 2026-09-27:

- a merged region whose sources were only revealed in part **folds**. This is T4's reading, now confirmed;
- the vacuous scroll check is **fixed in this PR**.

### T13: Pin region matching to left-side overlap

**What**: two `foldPlan` tests.
- A large insertion moves a folded region's right side onto a revealed region's old right side, and the folded region stays folded (U10).
- A new region whose left side only touches an earlier revealed one is new, so it folds (U15).
**Where**: `src/renderer/src/lib/diff-view.test.ts`
**Depends on**: T12
**Reuses**: the `foldPlan` fixtures
**Requirement**: FOLD-03, FOLD-04

**Done when**:

- [x] Both tests pass on the code, and each fails against its mutant: right-side matching (U10), `<=` in `overlaps` (U15)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/diff-view.test.ts`

**Result (2026-09-27)**: 2 new tests, 70/70 in the file. U10 (regions matched by right-side overlap) and U15 (`<=` in `overlaps`) each fail exactly the test named for it (1 failed | 69 passed), through `unit_mut.py` with the file restored from `.orig`.

**Tests**: unit
**Gate**: quick

**Commit**: `test(files): pin region matching to left-side lines`

---

### T14: Pin a merge of partly revealed regions

**What**: a `foldPlan` test for a merged region whose only revealed source was revealed in part: it folds (U07, owner decision). In `spec.md`, the FOLD-06 row records the owner's confirmation, and FOLD-05 records the split case: each half keeps the top and bottom counts, clamped.
**Where**: `src/renderer/src/lib/diff-view.test.ts`
**Depends on**: T13
**Reuses**: the `foldPlan` fixtures
**Requirement**: FOLD-05, FOLD-06

**Done when**:

- [x] The test passes, and fails against U07 (a partly revealed source counts as revealed)
- [x] `spec.md` records both readings
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/diff-view.test.ts`

**Result (2026-09-27)**: 1 new test, 71/71 in the file; U07 (a partly revealed source counts as revealed) fails exactly that test. `spec.md`: AC 6 reads "revealed whole", the merge row records the owner's 2026-09-27 confirmation of the partial case, and the partial row records the split case (each half keeps both counts, clamped). `validate_spec.py`: 0 errors.

**Tests**: unit
**Gate**: quick

**Commit**: `test(files): pin how a merge of partly revealed regions folds`

---

### T15: The reading an update keeps, as a pure rule

**What**: `readingBeforeUpdate(pending, regions, modelState, left)` in `diff-view.ts`.
- It returns the pending reading unchanged while one exists (FOLD-08).
- It returns null when the regions are unknown or the `modelState` is unreadable (FOLD-25).
- Otherwise it returns a new reading.

`DiffViewer`'s content effect calls it in place of its inline guard.
**Where**: `src/renderer/src/lib/diff-view.ts` (and the one call in `DiffViewer.tsx`)
**Depends on**: T14
**Reuses**: `hiddenRangesOf`, `regionStates`
**Requirement**: FOLD-08, FOLD-25

**Done when**:

- [x] Tests: a pending reading is kept when a new state arrives, including one with `states: null` (T7's press); null regions give null; an unreadable state gives null; a readable one gives the region states and the left text
- [x] The S3 mutant (always take a new reading) fails a unit test
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-09-27)**: `readingBeforeUpdate` and `FoldReading` in `diff-view.ts`; `DiffViewer`'s content effect calls it in place of the inline guard, and `pendingRef` takes the `FoldReading` type. 5 new tests, red before the code, then 76/76 in the file; full suite 1729/1729; typecheck 0; lint 0 errors / 18 warnings. S3 (always take a new reading) now fails 2 unit tests: the pending reading, and the pending press marker. Focused smoke 18/18 after the change.

**Tests**: unit
**Gate**: full

**Commit**: `refactor(files): keep the first fold reading through a pure rule`

---

### T16: A scroll check that can fail

**What**: section 11's FDIF-30 check keeps its timing and stops claiming the scroll. `modified.ts` is three lines long and cannot scroll, and `.monaco-scrollable-element.scrollTop` stays 0 under Monaco's virtual scrolling. The scroll half moves to 14f: wheel-scroll long.ts's diff tab through CDP, require the first visible line to have moved off line 1, write, and assert the same first visible line.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T15
**Reuses**: 14f, the wheel dispatch of section 8
**Requirement**: FOLD-09

**Done when**:

- [x] The new scroll assertion can fail: it **fails on the code as it stands** (a real defect, T17), so the mutant run moves to T17
- [x] Focused smoke passes, then one full smoke passes (moved to T17, after the fix; done there)
- [x] Gate check passes: `npm run lint` (0 errors / 18 warnings)

**Result (2026-09-27)**: section 11 keeps its 1 s timing and drops the scroll comparison that read 0 -> 0. 14f2 wheel-scrolls long.ts's diff tab and reads the first line on screen. Line 1 is folded away, so that line is `l017` before the wheel and `l023` after it. The write changes line 170, below the screen. **After the write the first line on screen is `l101`: the tab jumped.** `setValue` reveals every region for a moment, `setScrollTop` restores the pixel offset on that tall layout, and `applyFolds` then folds the regions above back, so the same offset lands 78 lines lower. This is a defect that the vacuous check hid, fixed in T17. The precondition was corrected from "line 1 on screen" to "the wheel moved the first line".

**Tests**: manual
**Gate**: build

**Commit**: `test(files): check that a diff tab keeps its scroll across a refresh`

---

### T17: Keep a diff tab's scroll through the folds

**What**: `DiffViewer` keeps the scroll offset it captured before `setValue` with the pending reading, and restores it again right after `applyFolds` in `onDidUpdateDiff`. The folds above the screen are then the same as before the change, so the same offset shows the same line. The restore right after `setValue` stays, for the moment before the diff is back.
**Where**: `src/renderer/src/components/DiffViewer.tsx`
**Depends on**: T16
**Reuses**: the scroll capture of the content effect
**Requirement**: FOLD-09

**Done when**:

- [x] 14f2 passes on the focused smoke
- [x] 14f2 fails against a mutant that drops the new restore after `applyFolds`
- [x] One full smoke passes
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Result (2026-09-27)**: `pendingScrollRef` holds the offset taken with a new reading; `onDidUpdateDiff` restores it right after `applyFolds`. 14f2 now keeps `l023` on screen across the write; focused smoke 19/19. The mutant that drops the new restore fails 14f2 (back to `l101`). Gate: typecheck 0, lint 0 errors / 18 warnings, 1729/1729 tests, `npx electron-vite build` 0. **Full smoke, run once: 64/64 in 177 s.** T16's open item, the focused and full runs, is closed here.

**Tests**: manual
**Gate**: build

**Commit**: `fix(files): keep a diff tab's scroll when its folds come back`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1
Phase 2:  T1 ------→ T2 ------→ T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6 ------→ T7
Phase 4:  T7 ------→ T8 ------→ T9 ------→ T10
Phase 5:  T10 -----→ T11 -----→ T12
```

Twelve tasks: two batches at Execute (Phases 1–2, five tasks; Phases 3–5, seven tasks),
so the sub-agent offer comes first. T1 is a stop point: the second batch never starts before the owner
has T1's measurement if the stop rule fired.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: reproduce | 1 smoke section + seed, 1 file | ⚠️ Cohesive (setup and measurement are one act) |
| T2: region rule | 1 function + 1 constant | ✅ Granular |
| T3: read state | 2 small functions, 1 file | ⚠️ Cohesive |
| T4: fold plan | 2 functions, 1 file | ⚠️ Cohesive |
| T5: tab choice | 2 functions + types, 1 file | ⚠️ Cohesive |
| T6: refresh fix | 1 component | ✅ Granular |
| T7: choice in viewer | 1 component | ✅ Granular |
| T8: hook | 1 hook | ✅ Granular |
| T9: All changes buttons | 1 component + a one-prop pass-through | ⚠️ Cohesive |
| T10: wiring | 1 component + a one-prop pass-through | ⚠️ Cohesive |
| T11: smoke | 1 section part | ✅ Granular |
| T12: smoke | 1 section part | ✅ Granular |

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

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: reproduce | end to end | manual | manual | ✅ OK |
| T2: region rule | pure rules | unit | unit | ✅ OK |
| T3: read state | pure rules | unit | unit | ✅ OK |
| T4: fold plan | pure rules | unit | unit | ✅ OK |
| T5: tab choice | pure rules | unit | unit | ✅ OK |
| T6: refresh fix | component | none (smoke) | none | ✅ OK |
| T7: choice in viewer | component | none (smoke) | none | ✅ OK |
| T8: hook | hook | none (smoke) | none | ✅ OK |
| T9: buttons | component | none (smoke) | none | ✅ OK |
| T10: wiring | component | none (smoke) | none | ✅ OK |
| T11: smoke | end to end | manual | manual | ✅ OK |
| T12: smoke | end to end | manual | manual | ✅ OK |

## Requirement Coverage

| FOLD ID | Unit (task) | Smoke check |
| ------- | ----------- | ----------- |
| 01 | T2 | 14a |
| 02 | T4 | 14b, 14f |
| 03 | T3, T4 | 14c |
| 04 | T4 | 14b, 14d |
| 05 | T3, T4 | — (rule; wiring shared with 14c) |
| 06 | T4 | — (rule; wiring shared with 14c) |
| 07 | T4 | — (rule; wiring shared with 14b) |
| 08 | — | 14e |
| 09 | — | 14b, 14f, FDIF-30 (section 11) |
| 10 | T2 | 14a (counts match only if the rule matches Monaco) |
| 11 | — | 14h, FPOL-17 (section 13) |
| 12 | T4, T5 | 14i |
| 13 | T4 | 14k |
| 14 | T5 | 14l |
| 15 | T4 | 14l |
| 16 | — | 14j |
| 17 | — | 14r |
| 18 | — | 14p |
| 19 | — | 14p |
| 20 | — | 14n |
| 21 | T5 | 14p |
| 22 | — | 14q |
| 23 | — | 14g |
| 24 | — | 14o |
| 25 | T3 | — (rule; the null path leaves today's behaviour) |
| 26 | T4 | — (rule) |
| 27 | T5 | 14m |
