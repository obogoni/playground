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

- [ ] T-setup done; a full drive on the new seed passes every existing check (count recorded before and after the seed change; the same numbers pass)
- [ ] In the uncommitted stack, `assets/logo.bin`'s header renders no `.diff-section-counts` and the long file's reads `+12` (read once by hand in the dev app, recorded in the commit body)
- [ ] The seed stays fictitious
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

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

- [ ] Each check seen failing on its own mutant, then passing: (a) `changeStatusView('added')` answering `A` fails 1; (b) the `.status-glyph.added` tone rule removed fails 2; (c) the end group moved before `FileIcon` fails 3 and 4; (d) `.file-tree-name` given `flex: none` and `.file-tree-end` stripped of `margin-left: auto` (the glyph follows the name) fails 3 and 4; (e) `.file-tree-name` without `min-width: 0` / `overflow: hidden` fails 5; (f) `StatusGlyph` rendered on folder rows fails 6; (g) `line-through` put on `.file-tree-row` for deleted rows instead of the name fails 7; (h) `struck` true for every status fails 7
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

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

- [ ] Each check seen failing on its own mutant, then passing: (a) `changeStatusView('renamed')` answering the wrong glyph fails 1; (b) the end group moved before the counts fails 2 and 3 (the binary header has none, and the count widths differ); (c) the end group moved before the path fails 2; (d) `line-through` put on the whole header for deleted files fails 4; (e) `.diff-section-path` given `flex: none` fails 5
- [ ] FSTS-21 evidence recorded: `CommitTab.tsx:43` mounts `AllChangesTab` unmodified, which renders `DiffSection` (`AllChangesTab.tsx:303`); no commit-specific header exists
- [ ] Clean run of the whole drive, all checks passing, count recorded
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` (warning count unchanged)

**Tests**: manual
**Gate**: full

**Commit**: `test(files): check the status glyphs in the section headers`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6 ------→ T7
Phase 4:  T7 ------→ T8 ------→ T9 ------→ T10
```

Ten tasks: two batches (Phases 1–2, Phases 3–4). At Execute the sub-agent offer is made first. The Verifier runs after T10.

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

## Requirement Coverage

| Requirement | Tasks | Evidence planned |
| ----------- | ----- | ---------------- |
| FSTS-01, 02, 03 | T4, T5, T9 | T9 checks 3 and 4 |
| FSTS-04 | T5, T8, T9 | T9 check 5 |
| FSTS-05 | T4, T9 | T9 check 6 |
| FSTS-06..10 | T1, T2, T9 | T1 unit table; T9 checks 1, 2, 4 |
| FSTS-11 | T1, T3, T9, T10 | T1 unit table; T9 checks 1, 4; T10 checks 1, 3 |
| FSTS-12 | T1, T4, T6 | T1 unit tests; the `grep` in T4 and T6 |
| FSTS-13, 15 | T1, T4, T5, T9 | T1 `struck` test; T9 check 7 |
| FSTS-14 | T5, T9 | T9 check 7 |
| FSTS-16, 18 | T6, T7, T10 | T10 checks 1, 2 |
| FSTS-17 | T7, T8, T10 | T10 check 3 |
| FSTS-19 | T6, T7, T10 | T10 check 4 |
| FSTS-20 | T7, T8, T10 | T10 check 5 |
| FSTS-21 | T6, T10 | T10's code citation (reuse, no separate surface) |
| Edge cases | T9, T10 | T9 check 4 (depths, U in uncommitted); T10 check 3 (no counts) |
