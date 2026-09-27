# Files Status Glyphs Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: inline, below. No architecture decision (no AD needed).
**Status**: Approved by the owner on 2026-09-27; executed by batch workers (Phases 1–2, then Phases 3–4)

**Branch**: `feature/files-status-glyphs`, cut from `feature/file-icons` `422d68d` (PR #126, which puts `FileIcon` in the tree rows this feature rearranges). Rebase onto `origin/main` once #126 lands. The discard feature (issue #132) stacks on this branch.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute; record the lint warning count at the same time (file-icons ended at 18 warnings).

**T-setup (before T1, no commit)**: the worktree has no `node_modules`. Run `npm ci --ignore-scripts` then `node node_modules/electron/install.js` in the worktree; the unit gate needs the first, the dev app for T8 to T10 needs both.

### Design

**One mapping.** `src/renderer/src/lib/change-status.ts` exports

```ts
export interface ChangeStatusView {
  glyph: string   // '+' | 'M' | 'D' | 'R' | 'U'
  label: string   // 'Added' | 'Modified' | 'Deleted' | 'Renamed' | 'Untracked'
  struck: boolean // true for deleted only
}
export function changeStatusView(status: ChangeStatus): ChangeStatusView
```

built on one `Record<ChangeStatus, ChangeStatusView>`, so a new status fails the typecheck. It replaces
`STATUS_LETTER` / `STATUS_LABEL` in `FileTree.tsx:29-43` and `DiffSection.tsx:11-25`.

**One glyph.** `StatusGlyph.tsx` renders `<span className={`status-glyph ${status}`} title={label}>{glyph}</span>`.
`StatusGlyph.css` holds today's pill (`FileTree.css:127-134`) as `.status-glyph` and the five tone
rules (`FileTree.css:136-159`, identical to `DiffSection.css:53-76`) as `.status-glyph.<status>`. The
status stays the tone class, as today.

**Tree row** (`ChangedRows`, `FileTree.tsx:132-146`), file rows only:

```
<button.file-tree-row>  [FileIcon] [span.file-tree-name(.struck)] [span.file-tree-end > StatusGlyph]
```

`.file-tree-name` already has `flex: 1; min-width: 0` and ellipsis (`FileTree.css:104-113`), so the
end group lands flush with the row's 8 px right padding at any depth. `.file-tree-end` is
`flex: none; display: flex; align-items: center; gap: 4px; margin-left: auto`. Folder rows are
unchanged.

**Section header** (`DiffSection.tsx:129-152`):

```
<button.diff-section-header>  [chevron] [span.diff-section-path(.struck)] [counts?] [span.diff-section-end > StatusGlyph]
```

`.diff-section-path` already flexes and ellipses (`DiffSection.css:78-87`); `.diff-section-end`
mirrors `.file-tree-end`, so the glyph stays flush with the header's 10 px right padding whether or
not the counts render (they are absent for a binary or too-large file, `DiffSection.tsx:146`).

**Strike.** `.file-tree-name.struck` and `.diff-section-path.struck` get
`text-decoration: line-through`. Nothing else is struck, so the icon, counts and glyph never are.

**Hand-off to the discard feature (#132).** Its hover ↶ goes into `.file-tree-end` /
`.diff-section-end` as the first child, before the glyph; the glyph stays last, so its column does
not move. One constraint for #132's planner: today the row and the header are `<button>`s, and a
`<button>` inside a `<button>` is invalid HTML (React warns on it). #132 should lift the end group
out: the row becomes a flex `<div class="file-tree-row">` holding a `<button>` with the icon and
the name (`flex: 1`) plus the end group, and the header likewise. The smoke checks this feature adds
select by `.file-tree-row`, `.diff-section`, `.file-tree-name`, `.diff-section-path` and
`.status-glyph`, so they survive that lift if those classes are kept on the container and the text.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (renderer components are verified by CDP smoke, pure helpers by co-located unit tests), `vitest.config.ts`, `package.json` scripts; style sampled from `src/renderer/src/lib/file-icons.test.ts` and `files-view.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure mapping (`change-status.ts`) | unit | 1:1 to FSTS-06..11 (glyph and label per status, literal expected values) and FSTS-13/15 (`struck` true for deleted only) | `src/renderer/src/lib/change-status.test.ts` | `npm test` |
| Components (`StatusGlyph`, `FileTree`, `DiffSection`) | none (CDP smoke) | FSTS-01..05, 13..20 in the running app | — | `node scripts/smoke-files-diff.mjs` |
| Stylesheets | none | build gate, then the smoke | — | `npx electron-vite build` |
| End to end | manual CDP smoke | Every new check first seen failing on a deliberately broken build | `scripts/smoke-files-diff.mjs` | three-step run on a throwaway `--user-data-dir` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a component task, and the last task | `npm run typecheck && npm run lint && npm test` |
| Build | Stylesheet tasks | `npm run lint && npx electron-vite build` |
| Manual | T8, T9, T10 | `node scripts/smoke-files-diff.mjs --seed`, launch, drive, `--clean` (below) |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

**Smoke run** (from the worktree, app not running): set `SMOKE_CONFIG=<tmp userData>\config.json` and `SMOKE_BASE=<tmp dir>`; `node scripts/smoke-files-diff.mjs --seed`; launch `npm run dev -- -- --remote-debugging-port=9222 --user-data-dir=<tmp userData> --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`; `node scripts/smoke-files-diff.mjs`; close the app; `node scripts/smoke-files-diff.mjs --clean`. Re-seed and relaunch between drives (the drive commits a file). `npm run dev` does not restart main on `src/main` edits; this feature edits none.

**Falsifying a check**: mutate through a small script that copies the file to `.orig`, writes the mutant, and restores in `finally`; relaunch or let Vite hot-reload the renderer; confirm `git status` is clean afterwards.

---

## Execution Plan

### Phase 1: Shared status

```
T1 → T2 → T3
```

### Phase 2: Tree rows

```
T3 → T4 → T5
```

### Phase 3: Section headers

```
T5 → T6 → T7
```

### Phase 4: Prove

```
T7 → T8 → T9 → T10
```

### Phase 5: Fix round 1

```
T10 → T11 → T12 → T13 → T14
```

### Phase 6: Fix round 2

```
T14 → T15 → T16 → T17
```

### Phase 7: Fix round 3

```
T17 → T18 → T19
```

---

## Task Breakdown

### T1: The shared status mapping

**What**: `changeStatusView(status)` returning `{ glyph, label, struck }` from one `Record<ChangeStatus, ChangeStatusView>`: added `+` / `Added`, modified `M` / `Modified`, deleted `D` / `Deleted` (struck), renamed `R` / `Renamed`, untracked `U` / `Untracked`.
**Where**: `src/renderer/src/lib/change-status.ts` (new) and its co-located test
**Depends on**: None
**Reuses**: the labels of `FileTree.tsx:37-43`
**Requirement**: FSTS-06, FSTS-07, FSTS-08, FSTS-09, FSTS-10, FSTS-11, FSTS-12, FSTS-13, FSTS-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Table test (`it.each`) over the five statuses with literal expected glyph, label and `struck`, one row per status, so each status alone decides its row (added reads `+`, never `A`)
- [x] A test that `struck` is true for `deleted` and false for each of the other four
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + the new tests

**Result (2026-09-27)**: T-setup skipped: the main checkout's `node_modules` already holds every dependency, the vscode-icons packages included. Baseline `npx vitest run`: 1778 tests / 92 files, all passing; `npm run lint`: exit 0, 0 errors, 18 warnings. `change-status.test.ts` adds 6 tests (5 table rows, 1 strike test): `npm test` 1784 / 93, all passing. Falsified on a throwaway mutant (added `A`, renamed struck): the added row, the renamed row and the strike test failed, then passed once restored.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): map a change status to its glyph, tooltip and strike`

---

### T2: The status glyph stylesheet

**What**: `.status-glyph` with today's pill geometry (`flex: none; width: 16px; text-align: center; border-radius: 4px; font-size: 10px; font-weight: 700`) and the five `.status-glyph.<status>` tone rules copied from `FileTree.css:136-159`, values unchanged.
**Where**: `src/renderer/src/components/StatusGlyph.css` (new)
**Depends on**: T1
**Reuses**: `FileTree.css:127-159`
**Requirement**: FSTS-06, FSTS-07, FSTS-08, FSTS-09, FSTS-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The five tone rules match `FileTree.css:136-159` value for value (diffed in the commit body)
- [x] Gate check passes: `npm run lint && npx electron-vite build`

**Result (2026-09-27)**: `diff` of `FileTree.css:136-159` (with `file-tree-pill` read as `status-glyph`) against `StatusGlyph.css:15-38`: empty. The same holds for the pill geometry (`FileTree.css:128-133` against `StatusGlyph.css:7-12`). `FileTree.css:136-159` was also confirmed identical to `DiffSection.css:53-76`. Lint: exit 0, 0 errors, 18 warnings, unchanged. `npx electron-vite build`: exit 0. Nothing imports the stylesheet until T3.

**Tests**: none
**Gate**: build

**Commit**: `style(files): add the shared status glyph styles`

---

### T3: `StatusGlyph`

**What**: `<StatusGlyph status />` rendering `<span className={`status-glyph ${status}`} title={label}>{glyph}</span>` from T1, importing T2's stylesheet.
**Where**: `src/renderer/src/components/StatusGlyph.tsx` (new)
**Depends on**: T2
**Reuses**: T1, T2
**Requirement**: FSTS-11, FSTS-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-09-27)**: `StatusGlyph` reads glyph and label from `changeStatusView` and imports `StatusGlyph.css`. Full gate: typecheck exit 0; lint exit 0, 0 errors, 18 warnings, unchanged; `npm test` 1784 / 93, all passing, unchanged. Nothing renders it until T4.

**Tests**: none
**Gate**: full

**Commit**: `feat(files): render a change status glyph`

---

### T4: Glyph at the end of tree rows

**What**: In `ChangedRows` file rows, drop the leading pill; after the name add `<span className="file-tree-end"><StatusGlyph status={node.status} /></span>`; give the name `struck` when `changeStatusView(node.status).struck`. Delete `STATUS_LETTER` and `STATUS_LABEL` (`FileTree.tsx:29-43`). Folder rows untouched.
**Where**: `src/renderer/src/components/FileTree.tsx`
**Depends on**: T3
**Reuses**: T1, T3; `ChangedRows` (`FileTree.tsx:128-173`)
**Requirement**: FSTS-01, FSTS-03, FSTS-05, FSTS-12, FSTS-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `grep -n "STATUS_LETTER\|STATUS_LABEL" src/renderer/src/components/FileTree.tsx` finds nothing
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-09-27)**: The `ChangedRows` file rows now read `FileIcon`, then `.file-tree-name` (with `struck` when `changeStatusView(node.status).struck`), then `.file-tree-end > StatusGlyph`. Folder rows and `FolderRows` are unchanged. The grep exits 1 with no output. Full gate: typecheck exit 0; lint exit 0, 0 errors, 18 warnings, unchanged; `npm test` 1784 / 93, all passing. `.file-tree-pill` is left orphaned in the CSS until T5.

**Tests**: none
**Gate**: full

**Commit**: `feat(files): show the status glyph at the end of tree rows`

---

### T5: Tree row styles

**What**: Remove `.file-tree-pill` and its five tone rules (`FileTree.css:127-159`); add `.file-tree-end` (`flex: none; display: flex; align-items: center; gap: 4px; margin-left: auto`) and `.file-tree-name.struck { text-decoration: line-through; }`.
**Where**: `src/renderer/src/components/FileTree.css`
**Depends on**: T4
**Reuses**: the design above
**Requirement**: FSTS-01, FSTS-02, FSTS-04, FSTS-13, FSTS-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `grep -rn "file-tree-pill" src scripts` finds nothing (L-053)
- [x] Row height unchanged (file-icons measured 23.3 px; a hand read in the dev app is enough here, T9 reads the glyph geometry)
- [x] Gate check passes: `npm run lint && npx electron-vite build`

**Result (2026-09-27)**: The grep exits 1 with no output. Deviation: the orchestrator replaced the hand read of row height with a note measured from code; batch 2's smoke measures the geometry. The rules that set a file row's height are unchanged:
- the row's `padding: 4px 8px` and `align-items: center` (`FileTree.css:87-98`, untouched);
- the name's 11.5 px font (`FileTree.css:104-113`, untouched);
- the icon's 16 px box with `margin: -1px 0` (`FileIcon.css`, untouched);
- the glyph's 10 px font, which moved from `.file-tree-pill` to `.status-glyph` (`StatusGlyph.css:11`) with the same value.

The new `.file-tree-end` wrapper adds no padding, height or vertical margin; its `gap` and `margin-left` are horizontal. Lint: exit 0, 0 errors, 18 warnings, unchanged. `npx electron-vite build`: exit 0.

**Tests**: none
**Gate**: build

**Commit**: `style(files): align tree glyphs and strike deleted names`

---

### T6: Glyph at the end of section headers

**What**: In the header, drop the pill before the path; after the counts add `<span className="diff-section-end"><StatusGlyph status={changed.status} /></span>`, rendered whether or not the counts are; give the path `struck` when `changeStatusView(changed.status).struck`. Delete `STATUS_LETTER` and `STATUS_LABEL` (`DiffSection.tsx:11-25`).
**Where**: `src/renderer/src/components/DiffSection.tsx`
**Depends on**: T5
**Reuses**: T1, T3; the header at `DiffSection.tsx:129-152`
**Requirement**: FSTS-12, FSTS-16, FSTS-18, FSTS-19, FSTS-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `grep -rn "STATUS_LETTER\|STATUS_LABEL" src/renderer/src/components/DiffSection.tsx src/renderer/src/components/FileTree.tsx` finds nothing (FSTS-12)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-09-27)**: The header now reads chevron, then `.diff-section-path` (with `struck` when `changeStatusView(changed.status).struck`), then the counts when the file has them, then `.diff-section-end > StatusGlyph`, which renders with or without the counts. `DiffSection.tsx` no longer imports `ChangeStatus`, which only the two maps used. The grep over both components exits 1 with no output. Full gate: typecheck exit 0; lint exit 0, 0 errors, 18 warnings, unchanged; `npm test` 1784 / 93, all passing. `.diff-section-pill` is left orphaned in the CSS until T7.

**Tests**: none
**Gate**: full

**Commit**: `feat(files): show the status glyph at the end of section headers`

---

### T7: Section header styles

**What**: Remove `.diff-section-pill` and its five tone rules (`DiffSection.css:43-76`); add `.diff-section-end` (as `.file-tree-end`) and `.diff-section-path.struck { text-decoration: line-through; }`.
**Where**: `src/renderer/src/components/DiffSection.css`
**Depends on**: T6
**Reuses**: T5's rules
**Requirement**: FSTS-16, FSTS-17, FSTS-19, FSTS-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `grep -rn "diff-section-pill" src scripts` finds nothing (L-053)
- [x] Gate check passes: `npm run lint && npx electron-vite build`

**Result (2026-09-27)**: `.diff-section-pill`, its comment and its five tone rules are gone (`StatusGlyph.css` carries them); `.diff-section-path.struck` draws `line-through` and `.diff-section-end` repeats `.file-tree-end` value for value (`flex: none; display: flex; align-items: center; gap: 4px; margin-left: auto`). The grep exits 1 with no output. Lint: exit 0, 0 errors, 18 warnings, unchanged. `npx electron-vite build`: exit 0.

**Tests**: none
**Gate**: build

**Commit**: `style(files): align header glyphs and strike deleted paths`

---

### T8: Smoke seed — a long untracked name and a binary change

**What**: In `seed()`, after the existing uncommitted writes (`smoke-files-diff.mjs:134-136`): write `src/a-rather-long-untracked-file-name-that-has-to-be-cut-short-before-its-status-glyph.txt` with 12 lines, and rewrite `assets/logo.bin` with different binary bytes (a NUL kept in the first 8000). Document both in the header's seed list (`:25-41`).
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T7
**Reuses**: the seed's `writeFileSync` calls
**Requirement**: FSTS-04, FSTS-17, FSTS-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] T-setup done; a full drive on the new seed passes every existing check (count recorded before and after the seed change; the same numbers pass)
- [x] In the uncommitted stack, `assets/logo.bin`'s header renders no `.diff-section-counts` and the long file's reads `+12` (read once by hand in the dev app, recorded in the commit body)
- [x] The seed stays fictitious
- [x] Gate check passes: `npm run lint` (warning count unchanged)

**Result (2026-09-27)**: `seed()` now writes, after the two existing uncommitted files, `src/a-rather-long-untracked-file-name-that-has-to-be-cut-short-before-its-status-glyph.txt` (12 lines, `line 1` to `line 12`) and rewrites `assets/logo.bin` as `89 50 00 4e 47 0d 0a` (the NUL kept at byte 2); both are listed in the header's seed list. The name lives in one `LONG_NAME` constant for the checks to reuse. Hand read through CDP in the dev app, on a fresh seed and a fresh `--user-data-dir`, Uncommitted → All changes: `assets/logo.bin` header has no `.diff-section-counts` and glyph `M`; the long file's header reads `+12−0`, glyph `U`; `crlf.txt` reads `+3−3`, `M`; `untracked.txt` reads `+1−0`, `U`. The uncommitted tree lists `assets/` › `logo.bin` `M`, `src/` › the long name `U`, `crlf.txt` `M`, `untracked.txt` `U`, folders without a glyph. Names and content are fictitious. Lint: exit 0, 0 errors, 18 warnings, unchanged. Deviation (orchestrator's owner rule): the full drive on the new seed is not run here; the full smoke runs once, at the end of T10, and closes the open box above. Count before the seed change: 29 / 29, the last recorded full drive (file-icons T8); the drive has not changed since. Closed at T10: the one full drive on the new seed passed 41 / 41, and the 29 existing checks are among them (1–19 and 32–41), all passing. FDIF-31 now reads 5 sections → 4.

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): seed a long untracked name and a binary change`

---

### T9: Smoke — status glyphs in the tree

**What**: A `glyphTreeChecks(ws)` section called after the FDIF-31 check and before `iconChecks(ws)` (which reloads and stays last). In the dark theme:
1. **Diff to origin**: requires file rows of `M`, `+`, `D` and `R` present, then per row: `.status-glyph` text and `title` for `modified.ts` `M`/`Modified`, `added.ts` `+`/`Added`, `removed.md` `D`/`Deleted`, `renamed-new.ts` `R`/`Renamed` (FSTS-06..09, 11).
2. **Tones**: in both lists, each glyph's computed `color` equals a probe element's computed colour for its token (`--green`, `--amber`, `--red`, `--accent`, `--text-muted`), one probe per token appended to `.file-tree` and removed (FSTS-06..10; L-058).
3. **Column, diff to origin**: every file row holds exactly one `.status-glyph`, it is the row's last element (via `.file-tree-end`), and its right edge is within 1 px of `row.right − paddingRight`; all glyph right edges within 1 px of each other (FSTS-01..03).
4. **Uncommitted**: requires `crlf.txt` (`M`) and `untracked.txt` (`U`) at depth 0 and the long name (`U`) and `assets/logo.bin` (`M`) at depth 1; `U`/`Untracked` for `untracked.txt`; the column check of 3 across both depths (FSTS-01, 02, 10, 11; edge case).
5. **Ellipsis**: the long name's `.file-tree-name` has `scrollWidth > clientWidth` (precondition), and its glyph passes 3 (FSTS-04).
6. **Folders**: no folder row of either list holds a `.status-glyph` (FSTS-05; L-059).
7. **Strike**: in diff to origin, over every row and its descendants, the elements whose computed `text-decoration-line` includes `line-through` are exactly `removed.md`'s `.file-tree-name` (FSTS-13..15).
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T8
**Reuses**: `clickByText`, `evaluate`, `check`, `clickThemeToggle`
**Requirement**: FSTS-01, FSTS-02, FSTS-03, FSTS-04, FSTS-05, FSTS-06, FSTS-07, FSTS-08, FSTS-09, FSTS-10, FSTS-11, FSTS-13, FSTS-14, FSTS-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each check seen failing on its own mutant, then passing: (a) `changeStatusView('added')` answering `A` fails 1; (b) the `.status-glyph.added` tone rule removed fails 2; (c) the end group moved before `FileIcon` fails 3 and 4; (d) `.file-tree-name` given `flex: none` and `.file-tree-end` stripped of `margin-left: auto` (the glyph follows the name) fails 3 and 4; (e) `.file-tree-name` without `min-width: 0` / `overflow: hidden` fails 5; (f) `StatusGlyph` rendered on folder rows fails 6; (g) `line-through` put on `.file-tree-row` for deleted rows instead of the name fails 7; (h) `struck` true for every status fails 7
- [x] Gate check passes: `npm run lint` (warning count unchanged)

**Result (2026-09-27)**: `glyphTreeChecks(ws)` (section 12) adds the seven checks, and `SMOKE_ONLY=glyphs` runs them alone after `glyphSetup(ws)`, which sets the inline layout FDIF-12 leaves and commits nothing. In the full drive the section runs right after the FDIF-31 check and before `iconChecks(ws)`: FDIF-31 commits `modified.ts` alone, so `crlf.txt`, `untracked.txt`, the long name and `assets/logo.bin` are still uncommitted there, and the icon checks reload the window and stay last. (This branch has no section 13 that commits everything; that is the fold branch.) Changed-list folders are always drawn open, so every row is read without clicking. A folder row is told apart by its `.file-tree-chevron`, a depth by the row's `padding-left` (`8 + 13 × depth`). Check 2 compares the tint as well as the colour: the row's own colour is `--text-muted`, so an untracked glyph without its rule inherits the right colour, and colour alone cannot fail for it. Focused run on a fresh seed and launch: 7 / 7 in 22 s. Mutants, one focused run each, all killed:
- (a) added answering `A`: fails 1 only.
- (b) `.status-glyph.added` removed: fails 2 only. The extra (b2) `.status-glyph.untracked` removed: fails 2 only.
- (c) end group before `FileIcon`: fails 3, 4 and 5. Check 5 re-runs the column check on the long row.
- (d) name `flex: none` and end group without `margin-left: auto`: fails 3, 4 and 5. The name no longer shrinks, so it does not overflow either.
- (e) name without `min-width: 0` / `overflow: hidden`: fails 4 and 5. The long row's glyph is pushed past the edge, 666 px against 263 px.
- (f) `StatusGlyph` on folder rows: fails 6 only (5 folders with a glyph).
- (g) `line-through` on the deleted row instead of its name: fails 7 only (`docs/removed.md:row`).
- (h) `struck` true for every status: fails 7 only.

`git status --porcelain` matched the baseline after every mutant. Lint: exit 0, 0 errors, 18 warnings, unchanged.

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): check the status glyphs in the tree`

---

### T10: Smoke — status glyphs in the section headers

**What**: A `glyphHeaderChecks(ws)` section after T9's, still before `iconChecks(ws)`:
1. **Diff-to-origin stack** (All changes tab): requires headers of `M`, `+`, `D` and `R`; per `data-path`, `.status-glyph` text and `title` as in T9 (FSTS-11, 18).
2. **Column, diff to origin**: each `.diff-section-header` holds exactly one `.status-glyph`, last (via `.diff-section-end`), right edge within 1 px of `header.right − paddingRight`, all within 1 px of each other, across every header in the DOM (off-screen ones included) (FSTS-16, 18).
3. **Column, uncommitted stack**: requires the `assets/logo.bin` header with no `.diff-section-counts` and at least two distinct `.diff-section-counts` widths among the others (preconditions from T8's seed), then the column check of 2; the `untracked.txt` header reads `U`/`Untracked` (FSTS-17).
4. **Strike**: in the diff-to-origin stack, the elements under any `.diff-section-header` (itself included) with `line-through` are exactly `docs/removed.md`'s `.diff-section-path` (FSTS-19).
5. **Ellipsis**: narrow the page with CDP `Emulation.setDeviceMetricsOverride` (width 900, height as now, `deviceScaleFactor` 1, `mobile` false) until the long untracked path's `.diff-section-path` in the uncommitted stack has `scrollWidth > clientWidth` (precondition), then the column check of 2 on that stack; `Emulation.clearDeviceMetricsOverride` in a `finally` (FSTS-20).
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T9
**Reuses**: T9's probes; the stack checks' `.diff-section` reads
**Requirement**: FSTS-11, FSTS-16, FSTS-17, FSTS-18, FSTS-19, FSTS-20, FSTS-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each check seen failing on its own mutant, then passing: (a) `changeStatusView('renamed')` answering the wrong glyph fails 1; (b) the end group moved before the counts fails 2 and 3 (the binary header has none, and the count widths differ); (c) the end group moved before the path fails 2; (d) `line-through` put on the whole header for deleted files fails 4; (e) `.diff-section-path` given `flex: none` fails 5
- [x] FSTS-21 evidence recorded: `CommitTab.tsx:43` mounts `AllChangesTab` unmodified, which renders `DiffSection` (`AllChangesTab.tsx:303`); no commit-specific header exists
- [x] Clean run of the whole drive, all checks passing, count recorded
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (warning count unchanged)

**Result (2026-09-27)**: `glyphHeaderChecks(ws)` (section 13) adds the five checks. It runs right after `glyphTreeChecks(ws)`, in the full drive and under `SMOKE_ONLY=glyphs`, so it is still before `iconChecks(ws)` and the uncommitted stack still holds the seed's four files. Each stack is read once every expected `data-path` has a header (44 in diff to origin, 4 uncommitted), off-screen headers included. Check 2 also requires the path to be the header's second child, right after the chevron, so no status element sits before the path (FSTS-18). Check 3's preconditions held: `assets/logo.bin` has no counts, and the other count widths are 41 px and 34.4 px. Check 5 narrows the page to 900 px (steps down to 600 px if the path still fits) and cuts the long path at 900 px. It clears the override in a `finally`. Focused run: 12 / 12 in 29 s. Mutants, one focused run each, all killed:
- (a) renamed answering `N`: fails 1, and T9's check 1, which reads the same mapping in the tree.
- (b) end group before the counts: fails 2 and 3, and also 5, which re-runs the column check at 900 px.
- (c) end group before the path: fails 2, and also 3 and 5 (the same column check on the uncommitted stack).
- (d) `line-through` on the whole header of a deleted file: fails 4 only (`docs/removed.md:header`).
- (e) `.diff-section-path` `flex: none`: fails 5 only. The path never overflows down to 600 px, and its glyph ends at 1018 px against a 562 px edge.

`git status --porcelain` matched the baseline after every mutant. FSTS-21 evidence: `CommitTab.tsx:43` mounts `AllChangesTab` unmodified, and `AllChangesTab.tsx:303` renders `DiffSection`, the only place that renders it (grep). No commit-specific header exists. Full drive, run once on a fresh seed and a fresh `--user-data-dir`: 41 / 41 in 95 s, with the glyph sections as checks 20–31. Full gate: typecheck exit 0; lint exit 0, 0 errors, 18 warnings, unchanged; `npm test` 1784 / 93, all passing.

**Tests**: manual
**Gate**: full

**Commit**: `test(files): check the status glyphs in the section headers`


---

## Fix round 1 (Verifier FAIL on evidence, 2026-09-27)

The Verifier's round 1 (`validation.md`) failed on smoke evidence only; the production code is correct. Four of its smoke mutants survived the repo's checks: S7, S8b, S10 and S11. All four fixes are smoke additions in `scripts/smoke-files-diff.mjs`, before `iconChecks`, and each runs in the full drive and under `SMOKE_ONLY=glyphs`.

### T11: A commit tab's section headers follow FSTS-16..20

**What**: A `glyphCommitChecks(ws)` section after `glyphHeaderChecks(ws)`. It switches to Commits and opens the seed's `work on the branch` commit (`.commit-open`), waits for its 44 headers, then runs the header column check (`headerFaults`), the glyph and tooltip check (`glyphFaults(ORIGIN_STATUS)`) and the strike check (only `docs/removed.md:path` struck) over the commit tab's stack. Precondition: the active tab is the commit's (`<sha> · work on the branch`) and its headers carry at least 4 distinct statuses. Afterwards it closes the commit tab and returns to Uncommitted › All changes, the state the icon checks and a focused run expect, and requires that return.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T10
**Reuses**: `stackHeaders`, `headerFaults`, `glyphFaults`, `readWhen`, `STRUCK`; the Verifier's probe V-C (`fv-smoke.mjs`)
**Requirement**: FSTS-16, FSTS-17, FSTS-18, FSTS-19, FSTS-21

**Done when**:

- [x] The check passes on the code, and fails on the Verifier's mutant S8b (the glyph moved before the path only when `modified.rev !== 'HEAD'`, i.e. commit tabs only), which passes every other check
- [x] A header column mutant from T10 still fails its checks
- [x] Gate check passes: `npm run lint` (0 errors, 18 warnings)

**Result (2026-09-27)**: `glyphCommitChecks(ws)` (section 14) runs after `glyphHeaderChecks(ws)` in both the full drive and `SMOKE_ONLY=glyphs`, so the icon section is now 15. It opens `work on the branch` from Commits. It then reads the commit tab's stack once all 44 headers are there, off-screen ones included, and runs `headerFaults`, `glyphFaults(ORIGIN_STATUS)` and the strike walk over it. `stackHeaders` now also reads each glyph's status class, for the precondition. The precondition held: the active tab reads `<sha> · work on the branch`, and the headers carry 4 statuses (deleted, added, modified, renamed). The section then closes the commit tab and reselects Uncommitted › All changes. The check requires that return: no commit tab, All changes active, 4 uncommitted headers. Focused run on a fresh seed and launch: 13 / 13 in 34 s (the new check is 13). Mutants, one focused run each:
- S8b (glyph before the path only when `modified.rev !== 'HEAD'`, commit tabs only): fails 13 only (`src/added.ts: glyph not last`). Every other check passes, as in the Verifier's run.
- T10 c (end group before the path, every header): fails 9, 10, 12 and 13.

`git status --porcelain` matched the baseline after each. Lint: exit 0, 0 errors, 18 warnings, unchanged.

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): check the status glyphs in a commit tab's headers`

---

### T12: Header glyph tones

**What**: `stackHeaders` also reads each glyph's computed `color` and `backgroundColor`. A new header check compares every header glyph of both stacks with `probeTones('.all-changes-stack')`, read while that stack is showing, under the tree check's guards: 5 distinct tokens and all 5 statuses seen.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T11
**Reuses**: `probeTones`, `TONES`, the tree tone check (T9 check 2)
**Requirement**: FSTS-06, FSTS-07, FSTS-08, FSTS-09, FSTS-10

**Done when**:

- [x] The check passes on the code, and fails on the Verifier's mutant S11 (`.diff-section-end .status-glyph { color: inherit; background: none }`)
- [x] The tree tone mutant (T9 b) still fails the tree tone check
- [x] Gate check passes: `npm run lint` (0 errors, 18 warnings)

**Result (2026-09-27)**: `stackHeaders` now also reads each glyph's computed `color` and `backgroundColor`. `glyphHeaderChecks` probes the tones in `.all-changes-stack` right after reading each stack. The new header check 6 (focused 13) runs the tree's comparison over both stacks. That comparison now lives in one `toneFaultsOf` helper, which check 2 calls too, with its logic unchanged. Guards: 5 distinct tokens, all 5 statuses seen, and 48 headers read (44 + 4). Focused run: 14 / 14 in 34 s. Mutants, one focused run each:
- S11 (`.diff-section-end .status-glyph { color: inherit; background: none }`): fails 13 only. The glyphs read `rgb(165, 156, 142)` on transparent, against `rgb(224, 128, 104)` for deleted.
- T9 b (`.status-glyph.added` rule removed): fails 2 and 13, so the tree check keeps its teeth after the extraction.

`git status --porcelain` matched the baseline after each. Lint: exit 0, 0 errors, 18 warnings, unchanged.

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): check the status glyph tones in the section headers`

---

### T13: The cut name and path end in an ellipsis

**What**: `treeRows` and `stackHeaders` also read the computed `textOverflow` of the name or path. The tree's ellipsis check (T9 check 5) and the header's (T10 check 5) require `'ellipsis'` on the cut element, besides `scrollWidth > clientWidth`.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T12
**Reuses**: T9 check 5, T10 check 5
**Requirement**: FSTS-04, FSTS-20

**Done when**:

- [x] The Verifier's mutant S10 (`text-overflow: ellipsis` removed from `.file-tree-name`) fails the tree check, and its header twin (removed from `.diff-section-path`) fails the header check
- [x] The workers' clipping mutants (T9 e, T10 e) still fail their checks
- [x] Gate check passes: `npm run lint` (0 errors, 18 warnings)

**Result (2026-09-27)**: `treeRows` and `stackHeaders` now also read the computed `textOverflow` of the name or path. The tree's ellipsis check (focused 5) and the header's (focused 12) now require `'ellipsis'` on the cut element, besides `scrollWidth > clientWidth`, and their logs show both values. Focused run: 14 / 14 in 34 s, where 5 reads `overflows true, text-overflow ellipsis` and 12 reads the same at 900 px. Mutants, one focused run each:
- S10 (`text-overflow: ellipsis` removed from `.file-tree-name`): fails 5 only, `text-overflow clip`.
- Its header twin (the same removed from `.diff-section-path`): fails 12 only, `text-overflow clip`.
- T9 e (the name without `min-width: 0` / `overflow: hidden`): fails 4 and 5, as at T9.
- T10 e (the path `flex: none`): fails 12 only, as at T10 (`overflows false` down to 600 px).

`git status --porcelain` matched the baseline after each. Lint: exit 0, 0 errors, 18 warnings, unchanged.

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): require the ellipsis on a cut name and path`

---

### T14: Every glyph is painted

**What**: `treeRows` and `stackHeaders` also read, per glyph, the reasons it would not be painted: `visibility` other than `visible`, `display: none`, an ancestor (itself included) with `opacity` below 1, or a box smaller than 15 × 8 px. A new tree check (both lists) and a new header check (both stacks) fault any glyph with a reason, over every seeded row or header (48 each); the commit tab check (T11) faults them too.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T13
**Reuses**: the Verifier's `paintedFaults` (`fv-smoke.mjs`)
**Requirement**: FSTS-06, FSTS-07, FSTS-08, FSTS-09, FSTS-10

**Done when**:

- [x] The Verifier's mutant S7 (the tree's end group `visibility: hidden` until the row is hovered) fails the tree check, and its header twin fails the header and commit tab checks
- [x] A tree column mutant (T9 c) and a header column mutant (T10 c) still fail their checks
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`, `npx electron-vite build`, and one full drive on a fresh seed and a fresh `--user-data-dir`, every check passing
- [x] `spec.md` traceability: FSTS-04, 06..10, 20 and 21 read `Implementing`, naming the fix and its checks

**Result (2026-09-27)**: `treeRows` and `stackHeaders` now also read, per glyph, the reasons it would not be painted (`UNPAINTED`). A reason is any of:
- `visibility` other than `visible`;
- `display: none` on the glyph or an ancestor;
- `opacity` below 1 on the glyph or an ancestor;
- a box under 15 × 8 px.

`paintFaults` faults any item with a reason, and any item with no glyph, so a missing glyph cannot pass as painted. The new checks are tree check 8 (focused 8) and header check 7 (focused 15), each over all 48 seeded rows or headers (44 + 4). The commit tab check (focused 16) now adds `paintFaults` to its faults. Focused run: 16 / 16 in 34 s. Mutants, one focused run each:
- S7 (the tree end group `visibility: hidden` until the row is hovered): fails 8 only (`visibility hidden`).
- Its header twin (the same on `.diff-section-end`): fails 15 and 16.
- Opacity (the tree end group `opacity: 0`): fails 8 only (`opacity 0 on file-tree-end`).
- Box (`.status-glyph` `transform: scale(0.1)`): fails 8 and 15 (`box 1.6 x 1.3`), and the column checks 3, 4, 5, 10, 11, 13 and 16, since the shrunk glyph ends 7 px short of the edge.
- T9 c (end group before `FileIcon`): fails 3, 4 and 5, as at T9.
- T10 c (end group before the path): fails 10, 11, 13 and 16.

The `display: none` branch was not falsified on its own. `git status --porcelain` matched the baseline after each. Gate:
- typecheck exit 0; lint exit 0, 0 errors, 18 warnings, unchanged; `npm test` 1784 / 93, all passing; `npx electron-vite build` exit 0.
- Full drive, run once on a fresh seed and a fresh `--user-data-dir`: 45 / 45 in 100 s. The glyph sections are checks 20–35: tree 20–27, headers 28–34, commit tab 35. The 29 other checks all pass.

`spec.md` traceability: FSTS-04, 06..10, 20 and 21 read `Implementing`, each naming its fix and checks.

**Tests**: manual
**Gate**: full

**Commit**: `test(files): check that every status glyph is painted`

---

## Fix round 2 (Verifier FAIL on evidence, 2026-09-27)

The Verifier's round 2 (`validation.md`) failed on smoke evidence only; the production code is correct. Its mutants R5 and R5h (the name or path without `overflow: hidden`, `text-overflow` kept) survive the ellipsis checks, because the computed `text-overflow` holds whether or not an ellipsis is drawn. R7 (commit tabs only: the path clips bare) survives because no path of the branch commit is ever cut. The owner decided on 2026-09-27: seed a long path into the branch commit, so the commit tab's ellipsis is really checked, and add a criterion that a name or path that fits shows whole. All three fixes are in `scripts/smoke-files-diff.mjs`, plus `spec.md` for T17, and each runs in the full drive and under `SMOKE_ONLY=glyphs`.

### T15: The cut name and path draw their ellipsis

**What**: `treeRows` and `stackHeaders` also read the computed `overflowX` and `whiteSpace` of the name or path. One `ellipsisFaults(item)` helper holds the rule for a drawn ellipsis: `scrollWidth > clientWidth` (the precondition), computed `textOverflow === 'ellipsis'`, `overflowX` `hidden` or `clip`, and `whiteSpace === 'nowrap'`. The tree's ellipsis check (T9 check 5) and the header's (T10 check 5) require it empty on the cut element.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T14
**Reuses**: T13's reads; the Verifier's `cutStyle` probe (`fv2_build_probe.py`)
**Requirement**: FSTS-04, FSTS-20

**Done when**:

- [x] The Verifier's mutant R5 (`.file-tree-name` without `overflow: hidden`, `text-overflow` kept) fails the tree check, and R5h (the same on `.diff-section-path`) fails the header check
- [x] S10 (`text-overflow: ellipsis` removed from `.file-tree-name`) still fails the tree check, and the workers' clipping mutants (T9 e, T10 e) still fail theirs
- [x] Gate check passes: `npm run lint` (0 errors, 18 warnings)

**Result (2026-09-27)**: `treeRows` and `stackHeaders` now also read the computed `overflowX` and `whiteSpace` of the name or path. `ellipsisFaults(item)` holds the rule for a drawn ellipsis: the item overflows, computes `text-overflow: ellipsis`, clips (`overflow-x` hidden or clip) and does not wrap (`white-space: nowrap`). The tree's ellipsis check (focused 5) and the header's (focused 13) require it empty, and their logs show all four values. Focused run on HEAD: 16 / 16 in 33 s, where 5 reads `overflows true, text-overflow ellipsis, overflow-x hidden, white-space nowrap` and 13 reads the same at 900 px. Mutants, one focused run each (`fr2_mutants.py`, logs `fr2-t15-<id>-drive.log`):
- R5 (`.file-tree-name` without `overflow: hidden`): fails 5 only, `overflow-x visible`.
- R5h (the same on `.diff-section-path`): fails 13 only, `overflow-x visible`.
- S10 (`text-overflow: ellipsis` removed from the name): fails 5 only, `text-overflow clip`.
- S10h (the same on the path): fails 13 only, `text-overflow clip`.
- T9 e (the name without `min-width: 0` / `overflow: hidden`): fails 4 and 5, as before.
- T10 e (the path `flex: none`): fails 13 only, as before (`overflows false` down to 600 px).

`git status --porcelain` matched the baseline after each. Lint: exit 0, 0 errors, 18 warnings, unchanged.

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): require a drawn ellipsis on a cut name and path`

---

### T16: A cut path in a commit tab

**What**: `seed()` adds `docs/an-unusually-long-guide-name-that-a-commit-tab-header-has-to-cut-before-its-glyph.md` (fictional, 3 lines) to the branch commit (`work on the branch`), so diff to origin and the commit tab list 45 files. `ORIGIN_STATUS` gains it as `added`, and every check that counts diff-to-origin files or statuses reads that map. A new commit tab check narrows the window with CDP `Emulation.setDeviceMetricsOverride`, as T10 check 5 does (900 px, stepping down to 600 px until the path is cut), clears it in a `finally`, and requires the long path's `.diff-section-path` to pass T15's `ellipsisFaults` and the commit stack's `headerFaults` to be empty at that width.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T15
**Reuses**: T10 check 5's narrowing, T15's `ellipsisFaults`, T11's commit tab section
**Requirement**: FSTS-20, FSTS-21

**Done when**:

- [x] The Verifier's mutant R7 (commit tabs only: the path `style={{ textOverflow: 'clip' }}`) fails the new check
- [x] A header column mutant (T10 c) still fails the commit tab checks
- [x] The seed stays fictitious; the full drive on the new seed runs once, at T17 (owner rule)
- [x] Gate check passes: `npm run lint` (0 errors, 18 warnings)

**Result (2026-09-27)**: `seed()` now adds `docs/an-unusually-long-guide-name-that-a-commit-tab-header-has-to-cut-before-its-glyph.md` (3 lines of fictional text, one `LONG_GUIDE` constant) to the branch commit. It recreates `docs/` first, because `git rm` of `docs/removed.md` takes the emptied folder with it. The file is also listed in the header's seed list. `ORIGIN_STATUS` gains it as `added`, so diff to origin and the commit tab now list 45 files. Every check that counts them reads that map: tree checks 3 and 8, header checks 9, 10, 14 and 15, and the commit tab check 16 (now 45 file rows or headers, and 49 glyphs over both lists). The full drive's `sections >= 40` still holds at 45. T10 check 5's narrowing loop is now one `narrowUntilCut(ws, path)` helper. It steps from 900 px down to 600 px and clears the override in a `finally`. The new commit tab check (focused 17) calls it before the tab closes. It requires the active tab to be the commit's, all 45 headers read at that width, the long path to pass `ellipsisFaults`, and `headerFaults` to be empty there. Focused run: 17 / 17 in 36 s. 17 reads `at 900 px, 45 headers: overflows true, text-overflow ellipsis, overflow-x hidden, white-space nowrap`. Mutants, one focused run each (`fr2-t16-<id>-drive.log`):
- R7 (commit tabs only: the path `style={{ textOverflow: 'clip' }}`): fails 17 only (`text-overflow clip`).
- T10 c (end group before the path, every header): fails 10, 11, 13, 16 and 17.

`git status --porcelain` matched the baseline after each. Lint: exit 0, 0 errors, 18 warnings, unchanged. The full drive on the new seed runs once, at T17.

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): cut a long path in a commit tab's header`

---

### T17: A name or path that fits shows whole

**What**: In `spec.md`, FSTS-22 (tree story, after AC 4) and FSTS-23 (header story, after AC 20): WHEN a name or path fits the space its row or header leaves THEN it SHALL show whole, with no ellipsis; both in the traceability table, and an Assumptions row `owner confirmed 2026-09-27`. In the smoke, `treeRows` and `stackHeaders` also read, per name or path, its natural width (the text's own width, from a Range over it), its shown width (`clientWidth`) and the space its row or header leaves: from the text's left edge to the end group's left edge, less the row's gap and any element between them (the counts). The space is read from the siblings, not from the text's own box. A new tree check (both lists) and a new header check (both stacks) take every name or path whose natural width fits that space and require `scrollWidth <= clientWidth`. Preconditions: at least 47 file rows and 47 headers fit (every seeded file but the two long ones), and the long untracked name does not fit its row.
**Where**: `.specs/features/files-status-glyphs/spec.md`, `scripts/smoke-files-diff.mjs`
**Depends on**: T16
**Reuses**: `treeRows`, `stackHeaders`; the Verifier's mutant R6
**Requirement**: FSTS-22, FSTS-23

**Done when**:

- [x] `python <skill-dir>/scripts/validate_spec.py files-status-glyphs` reports 0 errors
- [x] The Verifier's mutant R6 (`.file-tree-name { max-width: 40px }`) fails the tree check, and its header twin R6h (`.diff-section-path { max-width: 40px }`) fails the header check
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`, `npx electron-vite build`, and one full drive on a fresh seed and a fresh `--user-data-dir`, every check passing
- [x] `spec.md` traceability: FSTS-04, 20, 21, 22 and 23 read `Implementing`, naming their checks

**Result (2026-09-27)**: `spec.md` now has AC 22 (tree story, after AC 4) and AC 23 (header story, after AC 20). Both are WHEN-shaped: a name or path that fits the space its row or header leaves SHALL show whole, with no ellipsis. They are FSTS-22 and FSTS-23 in the traceability table (23 total, 23 mapped). The Assumptions table has a new row, `y (owner confirmed 2026-09-27)`, and both Independent Tests name the new criterion. `validate_spec`: 0 errors, 0 warnings.

In the smoke, `treeRows` and `stackHeaders` now also read three widths per name or path:
- `natural`: the text's own width, from a Range over it;
- `scroll` / `shown`: its `scrollWidth` and `clientWidth`;
- `space`: the space the row or header leaves (`SPACE_LEFT`). That runs from the text's left edge to the end group's, less the gap and the counts, and is read from the siblings.

`fitting` keeps the items whose `natural` fits `space` with 1 px spare. `fitFaults` faults those whose `scrollWidth > clientWidth`.

The first measure used `scrollWidth` as the natural width. On HEAD both new checks then failed on their own preconditions: `0 of 49 file names fit`. `scrollWidth` is never below `clientWidth`, so a flexed name that fills its space never read as fitting. The Range measure replaced it before any mutant was judged.

New checks:
- Tree check 9 (focused 9): over both lists, folders included. Preconditions: at least 47 of the 49 seeded file names fit, and the long untracked name does not.
- Header check 8 (focused 17): over both stacks at full width and the uncommitted stack narrowed by check 5. Preconditions: at least 47 of 49 paths fit at full width, and the long path does not fit when narrowed.

Focused run: 19 / 19 in 35 s. Check 9 reads `47 of 49 file names fit (52 rows with folders); long name 593.4 px in 190.3 px free`. Check 17 reads `49 of 49 paths fit; narrowed to 900 px, 3 fit and the long path is 621.0 px in 465.3 px free`.

Mutants, one focused run each (`fr2-t17b-<id>-drive.log`):
- R6 (`.file-tree-name { max-width: 40px }`): fails 9 only (`docs/removed.md: 69.0 px of text, scroll 69 in 40 px, 175.0 px free`).
- R6h (`.diff-section-path { max-width: 40px }`): fails 17 only.

Final sweep on the finished code (`fr2-final-<id>-drive.log`), every mutant killed:
- R5: fails 5.
- R5h: fails 14 and 19.
- R7: fails 19 only.
- S10: fails 5.
- S10h: fails 14 and 19.
- T9 e: fails 3, 4 and 5. Check 3 now fails too, because the long guide is a long tree name as well.
- T10 e: fails 14 and 19.
- T10 c: fails 11, 12, 14, 18 and 19.

`git status --porcelain` matched the baseline after each.

Gate:
- typecheck exit 0; lint exit 0, 0 errors, 18 warnings, unchanged; `npm test` 1784 / 93, all passing; `npx electron-vite build` exit 0.
- Full drive, run once on a fresh seed and a fresh `--user-data-dir`: 48 / 48 in 102 s. The seed change moved diff to origin to 45 files (FDIF-21 reads `45 sections`, FDIF-20 `+84 −83` against git's `+84 −83`), and every check still passes. The glyph sections are checks 20–38: tree 20–28, headers 29–36, commit tab 37–38. The icon checks 39–48 follow.

`spec.md` traceability: FSTS-04, 20, 21, 22 and 23 read `Implementing`, each naming its checks.

**Tests**: manual
**Gate**: full

**Commit**: `test(files): check that a name or path that fits shows whole`

---

## Fix round 3 (Verifier FAIL, escalated; owner chose one focused round, 2026-09-27)

The Verifier's round 3 (`validation.md`) failed on smoke evidence only; the production code is correct. Its mutants V1 and V1h (a negative right margin on the name or path) and V4 and V4h (the end group laid over the row's or header's end) survive every check: the name, the path or the counts are drawn under the glyph, while the DOM order and the glyph's edge still hold. Round 3 was the last automatic round. The owner decided on 2026-09-27 to run one more focused round: Fix 7, Fix 9 and the cosmetic notes, and to accept Fix 8's boundary limit and record it in `spec.md` without fixing it. Both fixes are in `scripts/smoke-files-diff.mjs` (plus `.specs` for T19), and each runs in the full drive and under `SMOKE_ONLY=glyphs`.

### T18: No child of a row or header overlaps the next

**What**: `treeRows` and `stackHeaders` also read, per row or header, its visible children in order (a box wider and taller than 0, not `visibility: hidden`), how many there are, and the most any of them runs into the next (`prev.right − next.left`, negative for a gap). The children are the icon or chevron, the name or path, the counts, and the end group. `columnFaults` faults any item whose visible children are fewer than it must have (3 for a tree file row: icon, name, end group; 4 for a header with counts, 3 without), and any item where one child overlaps the next by more than 0.5 px. Every check that runs the column (tree, headers, commit tab) inherits both, and their logs show the children counts and the worst overlap.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T17
**Reuses**: `columnFaults`, `treeRows`, `stackHeaders`, `headerFaults`; the Verifier's mutants V1, V1h, V4 and V4h (`fv3_mutants.py`)
**Requirement**: FSTS-04, FSTS-16, FSTS-20, FSTS-21

**Done when**:

- [x] V1 (`.file-tree-name { margin-right: -40px }`) and V4 (`.file-tree-end` absolutely positioned) fail the tree's column checks; V1h (`.diff-section-path { margin-right: -60px }`) and V4h (`.diff-section-end` absolutely positioned) fail the header and commit tab column checks
- [x] R5, R6, R7, T9 c and T10 c still fail their checks
- [x] The precondition is real: on HEAD every checked row has 3 visible children and every header 4, or 3 without counts, as the logs show
- [x] Gate check passes: `npm run lint` (0 errors, 18 warnings)

**Result (2026-09-27)**: A `LAYOUT` read in `treeRows` and `stackHeaders` takes the row's or header's visible children in order: a box wider and taller than 0, not `visibility: hidden`. It returns how many there are and the worst `prev.right − next.left` between neighbours, with the pair's class names. Each item also carries `wantChildren`: 3 for a tree row (icon, name, end group), and 4 for a header with counts or 3 without (chevron, path, counts, end group). `columnFaults` now also faults an item whose visible children differ from `wantChildren`, and an item where one child runs more than 0.5 px into the next. Every column check inherits both: tree 3, 4 and 5, headers 11, 12 and 14, and commit tab 18 and 19. A `layoutDetail` helper puts the children counts and the worst overlap in each of their log lines.

Focused run on the change: 19 / 19 in 35 s (`fr3-t18-base-drive.log`). Every checked row reads `children 3/3`, and every header `4/4`, or `3/3` for `logo.bin`. The worst overlap is a gap: −6.0 px in the tree (icon to name), and −8.0 px in the headers (counts to end group).

Mutants, one focused run each (`fr3_mutants.py`, logs `fr3-t18-<id>-drive.log`):
- V1 (`.file-tree-name { margin-right: -40px }`): fails 3, 4 and 5 (`file-tree-name over file-tree-end by 34.0 px`).
- V4 (row `position: relative`, `.file-tree-end` absolute at `right: 8px`): fails 3, 4 and 5 (`file-tree-name over file-tree-end by 16.0 px`).
- V1h (`.diff-section-path { margin-right: -60px }`): fails 11, 12, 14, 18 and 19 (`diff-section-path over diff-section-counts by 52.0 px`).
- V4h (header `position: relative`, `.diff-section-end` absolute at `right: 10px`): fails 11, 12, 14, 18 and 19 (`diff-section-counts over diff-section-end by 16.0 px`).
- P (the header chevron `visibility: hidden`, a precondition mutant): fails 11, 12, 14, 18 and 19 (`3 of 4 children visible`).
- R5: fails 5 only. R6: fails 9 only. R7: fails 19 only.
- T9 c (end group before the icon): fails 3, 4 and 5. T10 c (end group before the path): fails 11, 12, 14, 18 and 19.

`git status --porcelain` matched the baseline after each. Lint: exit 0, 0 errors, 18 warnings, unchanged.

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): fault a row or header child drawn over the next`

---

### T19: The viewport is restored after the commit tab, and the notes are fixed

**What**: `glyphCommitChecks` reads `window.innerWidth` before the narrowing and again after the commit tab is closed; its `restored` condition also requires the two to be equal, and the width before to exceed the 900 px the narrowing starts at. Check 18's log no longer shows the open button's click flag as if it proved the tab opened; it names the click and the active tab separately. T17's **What** is corrected: the natural width is read from a Range, not `scrollWidth`. The Phase Execution Map's task count is updated. `spec.md` records Fix 8's accepted limit as an Assumptions row.
**Where**: `scripts/smoke-files-diff.mjs`, `.specs/features/files-status-glyphs/tasks.md`, `.specs/features/files-status-glyphs/spec.md`
**Depends on**: T18
**Reuses**: T16's `narrowUntilCut`; the Verifier's test-side mutant T-b (`fv3_mutants.py`)
**Requirement**: FSTS-21, FSTS-22, FSTS-23

**Done when**:

- [x] T-b (the narrowing not cleared after the commit tab) fails check 18
- [x] `python <skill-dir>/scripts/validate_spec.py files-status-glyphs` reports 0 errors
- [x] `spec.md` traceability: FSTS-04, 16, 20 and 21 read `Implementing`, naming their checks
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`, `npx electron-vite build`, and one full drive on a fresh seed and a fresh `--user-data-dir`, every check passing

**Result (2026-09-27)**: `glyphCommitChecks` reads `window.innerWidth` before `narrowUntilCut` and again after the commit tab is closed and Uncommitted's stack is back. Its `restored` condition now also requires the two to be equal, and the width before to exceed 900 px, where the narrowing starts. Otherwise a narrowing left in place could read as restored. Check 18's log gives both widths. The open button's flag is now `clicked`, and the log reads `open button clicked true; commit tab active true (<sha> · work on the branch)`. The click is no longer shown as if it proved the tab opened: `showing`, the active tab, is what proves it. The flag stays in the condition.

Focused run: 19 / 19 in 35 s (`fr3-t19-BASE-drive.log`). Check 18 reads `restored true (width 1266 px before the narrowing, 1266 px after)`. Mutant T-b (the override not cleared for the commit call, `fr3_mutants.py`): fails 18 only, with `restored false (width 1266 px before the narrowing, 900 px after)`. `git status --porcelain` matched the baseline after it.

The notes are fixed:
- T17's **What** now says the natural width is read from a Range, not `scrollWidth`.
- The Phase Execution Map counts nineteen tasks and three fix rounds.
- `spec.md` has an Assumptions row for the Verifier's Fix 8. The limit is accepted, not fixed: `y (owner accepted 2026-09-27; the fit samples are ≥ 78 px (tree) / ≥ 210 px (headers) short of their space, so a width cap between them passes)`.
- `spec.md` traceability: FSTS-04, 16, 20 and 21 read `Implementing`, naming the checks, in focused and full drive numbers, and the mutants that fail them.

`validate_spec`: 0 errors, 0 warnings.

Gate:
- typecheck exit 0; lint exit 0, 0 errors, 18 warnings, unchanged; `npm test` 1784 / 93, all passing; `npx electron-vite build` exit 0.
- Full drive, run once on a fresh seed and a fresh `--user-data-dir`: 48 / 48 in 101 s (`fr3-full-drive.log`). The glyph checks are 20–38, and the icon checks 39–48 all pass after the commit tab's narrowing. Check 37 reads `restored true (width 1266 px before the narrowing, 1266 px after)`. Every column check reads `children 3/3` (tree) or `4/4`, `3/3` (headers), and a negative worst overlap.

**Tests**: manual
**Gate**: full

**Commit**: `test(files): assert the viewport is restored after the commit tab`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6 ------→ T7
Phase 4:  T7 ------→ T8 ------→ T9 ------→ T10
Phase 5:  T10 -----→ T11 -----→ T12 -----→ T13 -----→ T14
Phase 6:  T14 -----→ T15 -----→ T16 -----→ T17
Phase 7:  T17 -----→ T18 -----→ T19
```

Nineteen tasks. T1–T10 ran in two batches (Phases 1–2, Phases 3–4); each fix round (Phases 5, 6 and 7) ran as one batch after a Verifier FAIL. At Execute the sub-agent offer is made first. The Verifier runs after T10 and after each fix round.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: mapping | 1 function + its test | ✅ Granular |
| T2: glyph styles | 1 stylesheet | ✅ Granular |
| T3: glyph component | 1 component | ✅ Granular |
| T4: tree rows | 1 component part | ✅ Granular |
| T5: tree styles | 1 stylesheet | ✅ Granular |
| T6: header | 1 component part | ✅ Granular |
| T7: header styles | 1 stylesheet | ✅ Granular |
| T8: seed | 1 function | ✅ Granular |
| T9: tree checks | 1 smoke section | ✅ Granular |
| T10: header checks | 1 smoke section | ✅ Granular |
| T11: commit tab headers | 1 smoke section | ✅ Granular |
| T12: header tones | 1 smoke check | ✅ Granular |
| T13: ellipsis | 2 smoke checks tightened | ✅ Granular |
| T14: painted glyphs | 2 smoke checks | ✅ Granular |
| T15: drawn ellipsis | 2 smoke checks tightened | ✅ Granular |
| T16: commit tab cut path | 1 seed file + 1 smoke check | ✅ Granular |
| T17: fitting text whole | 2 ACs + 2 smoke checks | ✅ Granular |
| T18: no child overlaps the next | 1 smoke rule, in the shared column check | ✅ Granular |
| T19: viewport restored, notes | 1 smoke condition + doc fixes | ✅ Granular |

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
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | pure mapping | unit | unit | ✅ OK |
| T2 | stylesheet | none | none | ✅ OK |
| T3 | component | none | none | ✅ OK |
| T4 | component | none | none | ✅ OK |
| T5 | stylesheet | none | none | ✅ OK |
| T6 | component | none | none | ✅ OK |
| T7 | stylesheet | none | none | ✅ OK |
| T8 | end to end (seed) | manual | manual | ✅ OK |
| T9 | end to end | manual | manual | ✅ OK |
| T10 | end to end | manual | manual | ✅ OK |
| T11 | end to end | manual | manual | ✅ OK |
| T12 | end to end | manual | manual | ✅ OK |
| T13 | end to end | manual | manual | ✅ OK |
| T14 | end to end | manual | manual | ✅ OK |
| T15 | end to end | manual | manual | ✅ OK |
| T16 | end to end (seed) | manual | manual | ✅ OK |
| T17 | end to end | manual | manual | ✅ OK |
| T18 | end to end | manual | manual | ✅ OK |
| T19 | end to end | manual | manual | ✅ OK |

## Requirement Coverage

| Requirement | Tasks | Evidence planned |
| ----------- | ----- | ---------------- |
| FSTS-01, 02, 03 | T4, T5, T9 | T9 checks 3 and 4 |
| FSTS-04 | T5, T8, T9, T13, T15, T18 | T9 check 5, with the drawn ellipsis (T13, T15); nothing drawn under the glyph (T18) |
| FSTS-05 | T4, T9 | T9 check 6 |
| FSTS-06..10 | T1, T2, T9, T12, T14 | T1 unit table; T9 checks 1, 2, 4; header tones (T12); painted glyphs (T14) |
| FSTS-11 | T1, T3, T9, T10 | T1 unit table; T9 checks 1, 4; T10 checks 1, 3 |
| FSTS-12 | T1, T4, T6 | T1 unit tests; the `grep` in T4 and T6 |
| FSTS-13, 15 | T1, T4, T5, T9 | T1 `struck` test; T9 check 7 |
| FSTS-14 | T5, T9 | T9 check 7 |
| FSTS-16, 18 | T6, T7, T10, T18 | T10 checks 1, 2; the counts not drawn under the glyph (T18) |
| FSTS-17 | T7, T8, T10 | T10 check 3 |
| FSTS-19 | T6, T7, T10 | T10 check 4 |
| FSTS-20 | T7, T8, T10, T13, T15, T16 | T10 check 5, with the drawn ellipsis (T13, T15); the commit tab's cut path (T16); the path not drawn over the counts or the glyph (T18) |
| FSTS-21 | T6, T10, T11, T16, T18, T19 | the commit tab check (T11) and its cut path (T16); no overlap (T18); the viewport restored (T19) |
| FSTS-22 | T17 | the tree's fitting names check (T17) |
| FSTS-23 | T17 | the headers' fitting paths check (T17) |
| Edge cases | T9, T10 | T9 check 4 (depths, U in uncommitted); T10 check 3 (no counts) |
