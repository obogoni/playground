# File Icons Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: inline. A pure resolver (`file-icons.ts`) turns `(name, kind, open, theme)` into an Iconify icon **name** — `vscode-icons-js` lower-cased, then our corrections, then the dark, `2` and light-variant rules against a list of available names — so it is unit-tested without the 3.7 MB set. The mapping is passed in, not imported: `vscode-icons-js` is ~105 KB and must ride in the lazy chunk with the set, not in the entry chunk (FICN-12). A small loader (`icon-set.ts`) lazily imports one data module (set + mapping) once and turns a name into a `data:` URI. A `FileIcon` component asks both and renders an `<img>`, falling back to today's generic icon while the set loads.
**Status**: Approved 2026-09-26 (owner, at Execute), with the dark rule FICN-15 added

**Branch**: `feature/file-icons`, rebased onto `origin/main` `c31bb9a` on 2026-09-26 (was off `feature/files-diff` `bf2fc7e`); sibling of `feature/files-view-polish` (PR #125), which also edits `FileTabs.tsx`.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute; record the lint warning count at the same time.

**Reference**: `expected-icons.md` beside this file — the comparison page's 91 fictitious names with the icon each must resolve to (corrections applied). It is the resolver's test table.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts; style sampled from `src/renderer/src/lib/files-view.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure resolver (`file-icons.ts`) | unit | 1:1 to FICN-01..07, 09, 10, 15 and the four edge cases, table-driven over the comparison page's sample names | `src/renderer/src/lib/file-icons.test.ts` | `npm test` |
| Loader (`icon-set.ts`) | unit | FICN-06 (name → data URI, missing name → null) and FICN-14 (a failing import resolves to null, logged once), with the import injected | `src/renderer/src/lib/icon-set.test.ts` | `npm test` |
| Component and wiring (`FileIcon`, `FileTree`, `FileTabs`) | none (CDP smoke) | FICN-08, 11, 13 in the running app | — | `node scripts/smoke-files-diff.mjs` |
| Build output | manual | FICN-12: the set is a separate chunk, absent from the entry chunk | `out/renderer/assets` | `npx electron-vite build` |
| Docs (notices) | none | — | — | review |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | Wiring tasks and phase ends | `npx electron-vite build` |
| Manual | T8 | `smoke-files-diff.mjs` three-step run on `--user-data-dir` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: Dependencies and rules

```
T1 → T2 → T3
```

### Phase 2: On screen

```
T3 → T4 → T5 → T6
```

### Phase 3: Finish

```
T6 → T7 → T8
```

---

## Task Breakdown

### T1: Add the two packages

**What**: `@iconify-json/vscode-icons` and `vscode-icons-js` as dependencies, pinned to the versions the comparison page used or newer; confirm both still report MIT.
**Where**: `package.json` (and the lockfile `npm install` rewrites)
**Depends on**: None
**Reuses**: —
**Requirement**: FICN-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `npm view <pkg> license` recorded as MIT for both in the commit body
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `build(deps): add the vscode-icons set and its mapping`

---

### T2: The pure resolver

**What**: `resolveIconName({ name, kind: 'file' | 'folder', open, theme }, available, mapping)` returning an Iconify icon name: `mapping` (the `vscode-icons-js` functions, passed in) with the lower-cased name; then the corrections table (`slnx` → `file-type-sln`, `razor` → `file-type-razor`, `resx` → `file-type-xml`); then, in dark, a `file-type-light-` / `folder-type-light-` answer replaced by its base when it is in `available`; then the `2` variant when the name is missing, else the default file or folder name; then the light variant when `theme` is light and it is in `available`.
**Where**: `src/renderer/src/lib/file-icons.ts` (new) and its test
**Depends on**: T1
**Reuses**: `expected-icons.md` as the table of expected names
**Requirement**: FICN-01..07, FICN-09, FICN-10, FICN-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Table test over the 91 rows of `expected-icons.md`, expected names copied from it (not computed by the resolver); the three corrections; a light variant chosen only in light; a light answer from the mapping replaced by its base in dark, and kept in light; `file-type-go-lightblue` not taken for a light variant; a missing name taking its `2`; an unmapped name and an unknown folder taking the defaults; `Dockerfile` and `LICENSE` matched case-insensitively; a name with non-ASCII letters
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + the new tests (1663 → 1771: 108 new)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): resolve a path to its vscode-icons icon`

---

### T3: The lazy icon set

**What**: `iconUri(name)` that lazily `import()`s the data module (Iconify JSON + the `vscode-icons-js` mapping) once, builds a `data:image/svg+xml` URI for a name (resolving aliases), returns `null` for a missing name, and resolves to `null` for every name — logging once — if the import fails; plus `availableIconNames()` for T2's `available`.
**Where**: `src/renderer/src/lib/icon-set.ts` (new) and its test
**Depends on**: T2
**Reuses**: the alias resolution of the comparison page
**Requirement**: FICN-06, FICN-12, FICN-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests with an injected importer: one import for many calls; an alias resolves to its parent's body; a missing name → `null`; a rejecting importer → `null` for every name and exactly one log
- [x] Gate check passes: `npm test`
- [x] Test count: T2 count + the new tests (1771 → 1778: 7 new)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): load the icon set on first use`

---

### T4: `FileIcon`

**What**: `<FileIcon name kind open />` reading the theme from `document.documentElement.dataset.theme` (and following its changes), rendering a 16 px `<img alt="">` from T2 + T3, or the generic `Icon` while the set loads or when it failed.
**Where**: `src/renderer/src/components/FileIcon.tsx` (new)
**Depends on**: T3
**Reuses**: `TerminalPane`'s `data-theme` observer pattern; `Icon`
**Requirement**: FICN-07, FICN-08, FICN-13, FICN-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): render a file or folder icon`

---

### T5: Icons in the tree and the changed list

**What**: Explore file rows swap `Icon name="file"` for `FileIcon`; Explore folder rows and changed-list file and folder rows gain `FileIcon` after the chevron or status pill.
**Where**: `src/renderer/src/components/FileTree.tsx`
**Depends on**: T4
**Reuses**: `FolderRows`, `ChangedRows`
**Requirement**: FICN-01, FICN-09, FICN-10, FICN-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Row height unchanged (22 px rows stay 22 px)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `feat(files): show file and folder icons in the tree`

---

### T6: Icons in the tabs

**What**: Every file and diff tab shows `FileIcon` before its label, the diff glyph kept; All changes gets none.
**Where**: `src/renderer/src/components/FileTabs.tsx`
**Depends on**: T5
**Reuses**: T4
**Requirement**: FICN-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`
- [ ] The built `out/renderer/assets` holds the icon set in its own chunk, and the entry chunk's size is within 1 KB of T1's build (FICN-12) — sizes recorded in the commit body

**Tests**: none
**Gate**: build

**Commit**: `feat(files): show file icons in the tabs`

---

### T7: Third-party notices

**What**: The MIT notices of vscode-icons, `@iconify-json/vscode-icons` and `vscode-icons-js` in the repository's third-party notices (created if absent, linked from the README's licence section).
**Where**: `THIRD-PARTY-NOTICES.md`
**Depends on**: T6
**Reuses**: the packages' own LICENSE files
**Requirement**: FICN-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each notice copied from the installed package's LICENSE, not retyped

**Tests**: none
**Gate**: quick

**Commit**: `docs: credit the vscode-icons set and mapping`

---

### T8: Smoke — icons on screen

**What**: A section in `smoke-files-diff.mjs`: in the seeded repo, a `.ts` row, a `.slnx`-named file (added to the seed), a `src` folder closed and open, a changed-list row and a tab each render an `<img>` whose `src` decodes to the expected icon; a `.json` row shows the base `file-type-json` in dark; switching to the light theme swaps a file with a light variant; no `.monaco-editor` or other view regresses.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T7
**Reuses**: the script's seed and probes
**Requirement**: FICN-01, FICN-03, FICN-07, FICN-08, FICN-10, FICN-11, FICN-13, FICN-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each check seen failing with the corrections table emptied or the light rule removed, then passing
- [ ] The seed stays fictitious
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): check file and folder icons in the running app`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T3 ------→ T4 ------→ T5 ------→ T6
Phase 3:  T6 ------→ T7 ------→ T8
```

Eight tasks: a single batch, executed inline. The Verifier runs after T8.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: packages | 1 manifest | ✅ Granular |
| T2: resolver | 1 function + its test | ✅ Granular |
| T3: loader | 1 module + its test | ✅ Granular |
| T4: component | 1 component | ✅ Granular |
| T5: tree | 1 component | ✅ Granular |
| T6: tabs | 1 component | ✅ Granular |
| T7: notices | 1 doc | ✅ Granular |
| T8: smoke | 1 section | ✅ Granular |

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

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | dependencies | none (build gate) | none | ✅ OK |
| T2 | pure resolver | unit | unit | ✅ OK |
| T3 | loader | unit | unit | ✅ OK |
| T4 | component | none | none | ✅ OK |
| T5 | component | none | none | ✅ OK |
| T6 | component | none | none | ✅ OK |
| T7 | docs | none | none | ✅ OK |
| T8 | end to end | manual | manual | ✅ OK |
