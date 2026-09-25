# Files Direction — Diffs (F2) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-diff/design.md`
**Status**: Draft

**Branch**: `feature/files-diff`, stacked on `feature/files-explore`. PR carries "depends on" the F1 PR; once F1 merges, `git rebase --onto origin/main feature/files-explore feature/files-diff`.

**Prerequisite**: F1 executed — this feature extends its `file-reader.ts`, `file-tree.ts`, `file-watcher.ts`, `files-view.ts`, `use-files.ts`, `FileTabs.tsx`, `FileTree.tsx`, `CodeViewer.tsx` and `monaco-setup.ts`.

**Test baseline**: **850** — the count F1's `tasks.md` projects at its end, itself resting on two earlier projections (status-bar's 797 and `origin/main`'s recorded 748). **Re-measure with `npm test` as the first act of Execute** and re-anchor every count below.

**Baseline measured 2026-09-19** with `npx vitest run` on `origin/main` `6ecd19c`, after the upstream merged #88: **917 tests / 52 files**, all passing. The 748 the plans started from was recorded before #88 and is stale by **+169**. Its baseline becomes **1019**; every count below shifts by **+169** and this feature ends at **1067**, not 898. Still re-measure as the first act of Execute.

**Baseline measured 2026-09-20** with `npm test` on this branch, rebased onto `feature/files-explore` `72d6e98`: **1042 tests / 59 files**, all passing; lint **0 errors / 18 warnings**. F1 ended 23 tests above the 1019 projected for it, so the shift from the written counts is **+192**, not +169. **Every count below reads +192**; T2's 850 means 1042, and this feature ends at **1090**. A measurement, not a projection.

---

## What F2 inherits from F1 that this plan predates

Written 2026-09-20, after F1 shipped. Each of these was discovered during F1's execution and is not in the design below.

| Fact | Consequence for F2 |
| ---- | ------------------ |
| **Monaco's import specifiers are not the documented ones.** 0.56 ships an `exports` map (`"./*": "./esm/vs/*.js"`), so `monaco-editor/esm/vs/...` resolves to `esm/vs/esm/vs/...` and Rollup fails | Import `monaco-editor/editor/editor.api`, `monaco-editor/basic-languages/monaco.contribution`, `monaco-editor/editor/editor.worker?worker`. F1's `monaco-setup.ts` already does |
| **`followAppTheme()` is called inside `CodeViewer`**, once per mounted viewer, because F1 only ever mounts one Monaco surface at a time | Monaco's theme is global. The moment F2 mounts a diff editor beside a file tab, **move the call up to the direction root** (`FilesView`) and drop it from `CodeViewer`, or two observers will fight over one global |
| **The editor worker runs and is a served file** — proved packaged in F1 T13, `file:///.../app.asar/out/renderer/assets/editor.worker-*.js`, not a `blob:` | F2's diff is computed in that worker. The CSP question is settled; do not re-spike it |
| **`languageForPath(path)` exists in `monaco-setup.ts`**, matching filename first, then extension, then `plaintext` | Both sides of a diff take their language from it |
| **A tab is a `FileTab` object**, not a path string, and `openFile(path, { fromDiffMode, deleted })` already carries `fromDiffMode` | FDIF's "a click in a diff mode opens a diff" replaces what `fromDiffMode` currently labels; the flag is the seam |
| **`FilesState` is `{ mode, base? }`** and `filesStateFor(ui, worktreeId)` reads it | A per-worktree diff preference (side-by-side vs inline) goes here, and a config write must carry direction and mode in **one** patch (AD-028 pattern, T22) |
| **AD-032**: `BaseOptions` carries an optional `error` | F2 inherits the base picker wholesale; a failed listing renders the git line disabled, not the FXPL-11 prompt |
| **AD-033**: a `.sln` opens VS 2026 on a **double** click; a single click opens a tab; 3 s relaunch guard | F2's click handling in the tree must preserve this — the single-click path is deferred by 250 ms for solutions only |

**Smoke lessons from F1 T23** — the CDP checks that passed while proving nothing, and what they cost:
Monaco scrolls **virtually** (drive it with CDP `Input.dispatchMouseEvent` `mouseWheel`, assert the first
**rendered line number**, never a `scrollTop` that stays 0); it renders spaces as **NBSP** in
`view-line.textContent`; it emits `mtk1` for plaintext, so assert **distinct** `mtk` classes, not a token
count; `Input.dispatchKeyEvent` needs `text` to produce a character; read-only is provable only by
**typing and comparing**, never by a DOM property, because `NativeEditContext` sets `readonly`
unconditionally. **Falsify every new check against a deliberately broken build before trusting it** —
that is how a hole inside a fix for the previous hole was found. The smoke also needs a **freshly
launched app** and an isolated `--user-data-dir`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process module with logic (`file-diff.ts`) | unit | All branches; 1:1 to FDIF-01..06, 15, 19, 20, 24; every listed edge case reachable without a GUI | `src/main/file-diff.test.ts` | `npm test` |
| Extracted pure helpers (`lineEndingChanges`, `parseNumstat`, `diff-view.ts`, F1's `tabsAfterClose`) | unit | Input→output per AC, including failure shapes | co-located `*.test.ts` | `npm test` |
| Shared types, IPC contract, config schema | none | build gate only | — | `npm run typecheck` |
| Thin Electron shell (`index.ts` wiring) | none (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Renderer components and hooks | none (CDP smoke + visual) | — | — | `node scripts/smoke-files-diff.mjs` |
| Spike findings | manual | Each assumption the design flagged as unverified, measured | `design.md` § Spike Findings | by hand |
| Out-of-CI smoke script | manual only | Every AC no unit test reaches | `scripts/smoke-*.mjs` | `node scripts/smoke-files-diff.mjs` (live session) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a logic-bearing, contract, config or renderer task | `npm run typecheck && npm run lint && npm test` |
| Build | At each phase boundary | `npx electron-vite build` |
| Manual | The spike (T1) and the CDP smoke (T21) | by hand / `node scripts/smoke-files-diff.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: De-risk the diff editor

```
T1
```

**Stop point.** If the spike contradicts the design — Monaco keeps line endings after all, or one of the three APIs is missing on the pinned version — the design is amended and Phases 2–5 re-planned before T2.

### Phase 2: Main process

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 3: Renderer decisions

```
T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13
```

### Phase 4: The viewer and its wiring

```
T13 → T14 → T15 → T16 → T17 → T18 → T19 → T20
```

### Phase 5: End to end

```
T20 → T21
```

---

## Task Breakdown

### T1: Measure what the design assumed about Monaco's diff editor

**What**: With a throwaway mount of Monaco's `DiffEditor` on the version F1 pinned, measure the four things the design flagged as unverified, and record the results in `design.md` under a new **Spike Findings** section.
**Where**: `.specs/features/files-diff/design.md`
**Depends on**: None
**Reuses**: F1's `monaco-setup.ts`; the AM1 / F1 T13 spike precedent.
**Requirement**: FDIF-13, 15, 22, 25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] **Line endings**: a CRLF original against an LF modified with identical text — recorded whether Monaco reports zero line changes (the premise of D2) — **0 line changes**, models keeping their own terminators
- [x] **Folding**: `hideUnchangedRegions` exists on the pinned version and folds a 2000-line file with one change into a strip; the option names recorded — 2000 lines to **15 rendered**, 4 fold widgets
- [x] **Navigation**: the diff editor exposes next / previous change on the pinned version; the call recorded — `goToDiff('next')` moved line 1 to **1001**
- [x] **Sizing**: `onDidContentSizeChange` fires on both inner editors, including when a folded region is expanded — 6/6 from mount, **9/8** after unfolding
- [x] **Shortcut**: VS Code's own binding for next / previous change in its diff editor read from VS Code's Keyboard Shortcuts on this machine and recorded — **Alt+F5** / **Shift+Alt+F5**
- [x] The throwaway mount is removed; only the design file changes
- [x] Lint warning baseline recorded in the commit body
- [x] If any finding contradicts the design: the design is amended in the same commit and the stop point above applies — **nothing contradicted it; Phases 2-5 stand as planned**

**Tests**: manual
**Gate**: manual
**Commit**: `docs(specs): record the monaco diff editor spike findings`
**Status**: Complete — stop point cleared, all four assumptions hold.

> **The shortcut is not F7.** Most references say F7 / Shift+F7, and that is what the diff-editor
> commands used to be; F7 now belongs to the accessible diff viewer. Read out of the installed
> build's own bundle rather than from memory: `workbench.action.compareEditor.nextChange` registers
> `primary: 575` = `512` (Alt) + `63` (F5), and `previousChange` `1599` = `1024` (Shift) + `512` +
> `63`. No user override exists in `%APPDATA%\Code\User\keybindings.json`. Had this been written
> from memory the app would have shipped a binding VS Code no longer uses.
>
> **Use `goToDiff`, not `accessibleDiffViewerNext/Prev`.** Both exist on the pinned version; the
> latter drives the accessibility view, not the editor's own position.
>
> **The EOL finding is the one that mattered**, since D2's whole design rests on it: Monaco's models
> *do* keep their terminators (`getEOL()` reports CRLF and LF, and the raw text differs), but the
> diff reports zero changes. So the normalization is in the diff, not in the model — which is why
> detection has to come from raw bytes in main, and why a whole-file EOL flip would otherwise read
> as "no changes" to the user.

---

### T2: Declare the diff contract

**What**: Add `DiffRef`, `DiffRequest`, `DiffSide`, `Eol`, `DiffSides`, `FileStat` to `src/shared/files.ts` as the design defines them, and register `files:diff-sides` and `files:diff-stats` in `IpcContract`.
**Where**: `src/shared/files.ts`
**Depends on**: T1
**Reuses**: F1's `FileContent` and the contract's doc-comment convention.
**Requirement**: FDIF-01, 02, 19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `DiffSide` is `FileContent | { kind: 'absent' }` — `absent` means the side does not exist, distinct from F1's `missing`
- [x] `DiffRef` is revision-or-disk per side, so F3 reuses it unchanged
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **1042** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): declare the diff contract`
**Status**: ✅ Complete

> Note: `DiffRef` carries `path` **inside** each side rather than once per request, which is what
> lets FDIF-05 read a rename's original from `oldPath` without a second field. `files:diff-stats`
> takes `FilesMode`, so `ipc-contract.ts` imports it too.

---

### T3: Find the lines whose ending changed

**What**: Create `src/main/file-diff.ts` with the pure `lineEndingChanges(originalRaw, modifiedRaw)`, returning the modified-side line numbers whose terminator differs from the matching original line, plus the dominant endings.
**Where**: `src/main/file-diff.ts`
**Depends on**: T2
**Reuses**: Nothing — new pure logic.
**Requirement**: FDIF-15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] A whole-file CRLF → LF flip returns every line and `CRLF` → `LF` — `file-diff.test.ts:11`
- [x] A mixed file where 4 of 719 lines are CRLF, flipped to pure LF, returns exactly those 4 — `:24`
- [x] Identical endings return `[]` — `:31`
- [x] A CR-only file is recognized as `CR` — `:40`
- [x] A final line with no terminator on one side and one on the other counts as changed — `:48`
- [x] Lines added or removed by the text change are not reported as ending changes — `:57`
- [x] `src/main/file-diff.test.ts` created
- [x] Gate passes: `npm test`
- [x] Test count: 1042 + 6 = **1048**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): find the lines whose line ending changed`
**Status**: ✅ Complete

> **Signature deviates from the design, on purpose.** The design typed it
> `lineEndingChanges(originalRaw: Buffer, modifiedRaw: Buffer, lineMap)`. It ships as
> `(originalRaw: string, modifiedRaw: string): EolChanges`. Both sides arrive as strings anyway —
> `git show`'s stdout and F1's `readForView` text — and neither decoding normalizes a terminator,
> so a `Buffer` round-trip would buy nothing. The `lineMap` third argument is gone: matching is
> internal, by the run of identical line text at the top and at the bottom of the two sides. What
> the text change itself added or removed sits between those runs and is never reported.
>
> **The limit of that matching, for T13 and T14.** Two *distant* edits leave a large middle block
> unreported, so a flip that also edits line 10 and line 700 of a 719-line file names only the lines
> outside those two edits. Under-reporting, never over-reporting: a marker on a line whose ending
> did not change would be a lie, a missing marker is only a missing marker.
>
> **`from` / `to` are the *dominant* endings, so they can be equal while lines are reported.** The
> mixed-file case (715 LF + 4 CRLF → pure LF) yields `from: 'LF'`, `to: 'LF'`, `lines: [4 of them]`.
> `eolStripText` (T13) has to word that case; `CRLF → LF on 4 lines` would be wrong there.
>
> Mutation-checked: 6 deliberate breaks, all killed. Index-pairing without the text guard and
> dropping the bottom-run pass both die on the insertion test; reporting a text difference instead
> of an ending difference dies on 5 of the 6; treating a missing terminator as equal to any dies on
> the last-line test; calling a CR side LF dies on the CR test; reporting every aligned line dies on
> the identical-endings test.

---

### T4: Count the changes per file

**What**: Add `diffStats(worktreePath, mode, base?)` and the pure `parseNumstat(stdout)` to `file-diff.ts`; count the lines of untracked files, which `numstat` omits.
**Where**: `src/main/file-diff.ts`
**Depends on**: T3
**Reuses**: `git.ts`; F1's `changedSince` merge base and `worktrees:changes` list.
**Requirement**: FDIF-19, 20, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `parseNumstat` reads `-z` output, including a rename record, and maps `-\t-` to `binary: true` — `file-diff.test.ts:82`, `:93`, `:102`
- [x] Diff-to-origin totals equal `git diff --shortstat <mergeBase> HEAD` on a temp repo — `:140`, git's own numbers parsed at `:133`
- [x] An untracked 7-line file counts as `added: 7, removed: 0` — `:152`
- [x] An empty mode returns `[]` — `:157` (clean worktree) and `:162` (full-folder mode, worktree dirty)
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 1048 + 6 = **1054** (lint 0 errors / 18 warnings, one `prettier/prettier` nit fixed)

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): count added and removed lines per changed file`
**Status**: ✅ Complete

> **A rename is reported at its new path.** `parseNumstat` skips the old path and keeps the new one,
> matching what F1's `parseNameStatus` puts in the mode's list, so a stat joins its `ChangedPath` by
> `path` in T16 with nothing to reconcile.
>
> **`binary: true` also means "no lines we are willing to count."** An untracked file over the 1 MB
> cap gets `added: 0, removed: 0, binary: true` — it is not binary, but FDIF-23 renders both as a
> placeholder and the alternative was a silent `+0 −0` on a 2 MB file. T16's totals therefore skip it.
>
> **Uncommitted totals exceed `git diff --shortstat HEAD` on purpose**, because git omits untracked
> files and F1's list does not. The spec's `--shortstat` success criterion is scoped to the branch
> (diff-to-origin), which is the comparison the test makes.
>
> **This machine has `core.autocrlf=true`.** Harmless here, but T5's CRLF fixture must set
> `core.autocrlf false` on its temp repo or git will normalize on commit and re-expand on checkout,
> and the "committed CRLF, edited to LF" case will never exist on disk.
>
> Mutation-checked: 8 deliberate breaks, all killed. Dropping the rename branch and taking the old
> path instead of the new both die on the rename test; dropping binary detection dies on the dash
> test; swapping added and removed dies on 3; leaving untracked files out and counting them as zero
> both die on the untracked test; letting full-folder mode fall through dies on the empty-mode test;
> diffing the merge base against itself dies on the `--shortstat` comparison.

---

### T5: Read both sides of a diff

**What**: Add `readDiffSides(worktreePath, request)` to `file-diff.ts` — revisions via `git cat-file -s` then `git show`, the disk via F1's `readForView`, `null` refs as `absent`, and `lineEndingChanges` on the raw bytes.
**Where**: `src/main/file-diff.ts`
**Depends on**: T4
**Reuses**: `git.ts`; F1's `readForView`, `isBinary` and 1 MB cap.
**Requirement**: FDIF-01, 02, 03, 04, 05, 06, 15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Merge base → `HEAD`, and `HEAD` → disk, each return the right content on a temp repo — `file-diff.test.ts:220`, `:232`
- [x] An added file returns `original: absent`; a deleted one `modified: absent` — `:244`, `:254`
- [x] A renamed file reads its original from `oldPath` — `:264` (old path's content) against `:265` (the renamed, edited file)
- [x] A blob above 1 MB returns `too-large` **without `git show` being run** — `:281` plus `:282`, which asserts the recorded git calls are exactly `['cat-file']`
- [x] A binary blob returns `binary` — `:296`
- [x] A missing revision returns `{ kind: 'error' }` and never throws — `:305`, `:307` (git's own `fatal:` line, not execFile's wrapper)
- [x] A CRLF-committed file edited to LF on disk returns its `eolChanged` lines — `:324`, with `:323` proving the committed side arrives with its terminators intact
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 1054 + **9** = **1063** — one over the projected 8: the "each return the right content" criterion covers two references and is two tests, and FDIF-03 and FDIF-04 are one test each

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): read both sides of a diff`
**Status**: ✅ Complete

> **`readDiffSides` takes an injectable `GitRunner`, defaulting to `git`.** FDIF-06's "without
> `git show` being run" is not observable any other way — the repo bans mocking libraries
> (`TESTING.md`), so the seam is the hand-rolled DI its pattern 3 already uses. `index.ts` still
> delegates in one line.
>
> **The 1 MB cap and `execFile`'s stdout buffer line up exactly.** Node's default `maxBuffer` is
> 1 MiB and `MAX_VIEW_BYTES` is 1024 × 1024, so any blob `git show` is allowed to return already
> fits. Nothing to configure, but do not raise one without the other.
>
> **`git show rev:path` does NOT apply the working-tree EOL conversion** — measured, not assumed:
> in a repo with `core.autocrlf=true` it returns the blob's own LF bytes, exactly like
> `cat-file blob`. Good for diff-to-origin, where both sides get the same treatment. **A problem for
> the uncommitted diff**, and it is not hypothetical: this machine's *system* gitconfig sets
> `core.autocrlf=true`. In a worktree without a `.gitattributes` the disk side is CRLF and the HEAD
> side LF, so FDIF-15 fires on **every line of every file** — a change git itself will undo on
> commit. `playground` escapes it only because its `.gitattributes` says `* text=auto eol=lf`.
> **Spec-precision gap, not fixed here**: nothing in FDIF-15 or D2 says what to do, and inventing a
> normalization inside T5 would be unverifiable. T21's smoke must run against a worktree with no
> `.gitattributes` to see it; the toggle of FDIF-16 hides it, which may be answer enough.
>
> The binary sniff runs over the decoded head re-encoded, not over git's bytes, because `git()`
> returns a string. A NUL survives the round trip, which is the only byte F1's heuristic looks for.
>
> Mutation-checked: 8 deliberate breaks, all killed. Swapping the sides dies on 9 tests; returning
> `missing` for a null ref dies on both absent tests; forcing one path onto both sides dies on 6;
> sizing after `show` instead of before dies on the cap test's call recording; dropping the binary
> sniff dies on the NUL test; rethrowing a failed revision and reporting execFile's wrapper message
> both die on the missing-revision test; skipping `lineEndingChanges` dies on the CRLF test.

---

### T6: Serve the diff channels

**What**: Register `files:diff-sides` and `files:diff-stats` in `index.ts`.
**Where**: `src/main/index.ts`
**Depends on**: T5
**Reuses**: `handle()`; F1's handler registrations.
**Requirement**: FDIF-01, 19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Two one-line delegations
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: **1063** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: build
**Commit**: `feat(main): serve the diff channels`
**Status**: ✅ Complete — Phase 2 done

> The delegations carry no logic, so `typecheck` is the whole check: `handle` is generic over
> `IpcContract`, and a wrong channel name or a payload field that does not match `DiffRequest` /
> `FilesMode` fails to compile at the call site. `readDiffSides`' third parameter defaults to the
> real `git`, so the handler stays one line.
>
> Not launched by hand, by design: T2–T6 are main-process modules and a contract, and this batch is
> sandboxed away from the GUI. The live evidence for these two channels is T21's smoke.

---

### T7: Persist the diff preferences

**What**: Add `ui.diffLayout?: 'side-by-side' | 'inline'` and `ui.diffIgnoreWhitespace?: boolean` to `AppConfig`.
**Where**: `src/shared/config.ts`
**Depends on**: T6
**Reuses**: The optional-means-default convention of `ui.*`.
**Requirement**: FDIF-11, 12, 15, 16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Absent means side by side and whitespace shown; `DEFAULT_CONFIG` unchanged
- [x] Existing `config-store` tests pass unedited
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **1065** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): persist the diff layout and whitespace choice`
**Status**: ✅ Complete

> Both fields are optional and `DEFAULT_CONFIG` is untouched, so absent keeps
> meaning side by side with whitespace shown — the `ui.*` convention F1 uses for
> `sidebarWidth` and `collapsedWorkspaces`. Nothing reads them yet: the fallback
> is applied where it is consumed, in T14's editor options and T17's toggles.
> No test, per the matrix's "config schema → build gate only"; the whole check
> is `typecheck`, and the 1065 unchanged proves no `config-store` test was
> touched.

---

### T8: Decide what each side of a diff is

**What**: Create `src/renderer/src/lib/diff-view.ts` with `diffRequestFor(mode, changed, mergeBase)`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T7
**Reuses**: `ChangedPath`, `DiffRequest`.
**Requirement**: FDIF-01, 02, 03, 04, 05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Diff-to-origin: `{ rev: mergeBase }` → `{ rev: 'HEAD' }` — `diff-view.test.ts:13`
- [x] Uncommitted: `{ rev: 'HEAD' }` → `{ disk: true }` — `:22`
- [x] `added` and `untracked` → original `null` — `:32`, `:33`; `deleted` → modified `null` — `:39`
- [x] `renamed` → original path is `oldPath` — `:49`
- [x] `diff-view.test.ts` created
- [x] Gate passes: `npm test`
- [x] Test count: 1065 + 6 = **1071** (written 876 + 192 = 1068; the +3 is Phase 2's, not new)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide the two sides of a diff`
**Status**: ✅ Complete

> **Two deviations from the design's signature, both to remove an impossible
> state.** `mode` is `DiffMode = Exclude<FilesMode, 'full'>`, exported here:
> full-folder mode has no second side, and typing it out beats an unreachable
> branch with no spec-defined answer. And `mergeBase` is `string | null` with a
> `DiffRequest | null` return, because uncommitted mode has no merge base to
> pass and diff-to-origin has no diff to build when the base stopped resolving —
> the spec's edge case puts F1's FXPL-11 prompt there instead of a stale diff.
> T18 and T17 must handle the `null`.
>
> **The rename rule is `oldPath ?? path`, not a `status === 'renamed'` test.**
> `ChangedPath.oldPath` is documented as the source of a rename *or a copy*, and
> both want the same original side. Same outcome for FDIF-05, one branch fewer.
>
> Mutation-checked: 7 deliberate breaks, all killed, each by the test that owns
> its criterion. Putting the disk on the since-base modified side dies on
> FDIF-01, HEAD on the uncommitted one dies on FDIF-02, the merge base on the
> uncommitted original dies on FDIF-02 and FDIF-04, keeping an original for an
> added file dies on FDIF-03, keeping a modified side for a deleted file dies on
> FDIF-04, reading a rename at its new path dies on FDIF-05, and building a diff
> with no merge base dies on the edge-case test.

---

### T9: Key the tabs and place All changes

**What**: Add `tabKeyOf`, `isSameTab` and `tabsWithAllChanges(tabs, mode)` to `diff-view.ts`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T8
**Reuses**: F1's tab shape.
**Requirement**: FDIF-08, 09, 17, 18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] A diff tab of `a.ts` in each mode and a file tab of `a.ts` are three different keys — `diff-view.test.ts:85`, and `:103`–`:105` for `isSameTab`
- [x] `tabsWithAllChanges` puts All changes first in both diff modes — `:116`; removes it in full-folder mode — `:127`; never duplicates it — `:133`, `:134`
- [x] A diff tab keeps its mode when the view's mode changes — `:140`
- [x] Gate passes: `npm test`
- [x] Test count: 1071 + 7 = **1078** (written 881 + 192 = 1073; +3 inherited, +2 new tests)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): key diff tabs and place the all changes tab`
**Status**: ✅ Complete

> **`TabRef` is the identity shape, and T17's tab type has to carry a `kind`.**
> `{ kind: 'file' | 'diff' | 'all-changes' }` is what the key is built from, so
> F1's `FileTab` gains `kind: 'file'` when the hook extends it. `tabKeyOf` takes
> the structural minimum, so a richer tab object passes unchanged, and
> `tabsWithAllChanges` is generic in its element type for the same reason — the
> strip still reads `content`, `deleted` and `at` off what comes back.
>
> **The All changes tab is derived, never stored.** It is inserted from the
> current mode on every call and filtered out of the input first, which is what
> makes FDIF-17's "never twice" free and lets it follow a mode switch while the
> diff tabs beside it do not (FDIF-09). `ALL_CHANGES_TAB` is a module constant
> so the stack is not remounted on each render. `ALL_CHANGES_KEY` is exported
> because T10 needs it.
>
> **One assertion had to be rewritten: it could not fail.** The first version
> read the expected key out of `ALL_CHANGES_KEY` on both sides, so renaming the
> constant to `file:all-changes` — which makes a file literally named
> `all-changes` collide with the fixed tab — passed. It now asserts the property
> instead: no file or diff tab's key equals the All changes key (`:94`, `:95`).
> The mutant dies.
>
> Mutation-checked: 8 deliberate breaks, all killed. Dropping the mode from a
> diff key and keying everything by path alone both die on FDIF-08; the key
> collision dies on `:94`; returning a key the strip does not hold dies on 4
> tests; putting All changes last, keeping it in full-folder mode and not
> de-duplicating it die on FDIF-17/18; retargeting an open diff tab at the
> current mode dies on `:140`.

---

### T10: Keep All changes open

**What**: Extend F1's `tabsAfterClose` so the All changes tab can never be closed, and closing the tab next to it never focuses nothing while All changes remains.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T9
**Reuses**: F1's `tabsAfterClose` and its tests, which must keep passing unedited.
**Requirement**: FDIF-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] A close request for All changes returns the tabs unchanged — `files-view.test.ts:98`, and `:102` for the same request while another tab holds the focus
- [x] Closing the only other tab focuses All changes — `:106`
- [x] Every pre-existing `tabsAfterClose` test passes unedited — the diff is 18 insertions, 0 deletions
- [x] Gate passes: `npm test`
- [x] Test count: 1078 + 2 = **1080** (written 883 + 192 = 1075; +3 inherited, +2 from T9)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): keep the all changes tab open`
**Status**: ✅ Complete

> **One guard line, and the signature is untouched.** `tabsAfterClose` already
> took opaque strings, so F2's change is that they are now tab keys rather than
> paths — the only new rule is that a close request naming `ALL_CHANGES_KEY`
> returns the list and the focus as they were. `files-view.ts` imports that
> constant from `diff-view.ts`; there is no cycle, `diff-view` imports nothing
> from here.
>
> **"Closing the only other tab focuses All changes" already held before the
> change** — `left[closedIndex] ?? left[closedIndex - 1]` lands on it. The test
> is still worth its line, and it can fail: the obvious other way to make the
> tab non-closable is to filter it out of the remaining list, and that mutant
> dies here.
>
> Mutation-checked: 4 deliberate breaks, all killed. Never firing the guard and
> clearing the focus on a refused close both die on `:98`; dropping All changes
> from what is left dies on `:106`; removing the fallback to the previous tab
> dies on `:106` **and** on F1's own FXPL-19 test, which is the proof the
> pre-existing behaviour is still being checked.

---

### T11: Decide the stack's opening state and totals

**What**: Add `initialExpansion(files)` and `totals(files)` to `diff-view.ts`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T10
**Reuses**: `FileStat`.
**Requirement**: FDIF-20, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] 40 files → the first 10 in tree order expanded — `diff-view.test.ts:158`, `:163`; 7 files → all 7 — `:167`, with `:168` on the boundary FDIF-21 words as "more than 10"
- [x] `totals` sums added and removed and counts files — `:176`; binary files count as files with no lines — `:184`
- [x] Gate passes: `npm test`
- [x] Test count: 1080 + 4 = **1084** (written 887 + 192 = 1079; +3 inherited, +2 from T9)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide the all changes opening state and totals`
**Status**: ✅ Complete

> **Tree order is the caller's job, not this function's.** `initialExpansion`
> takes the first ten of the list it is given; T16 renders the stack from the
> same list, in the same order, so "the first 10 in tree order" holds as long as
> the list arrives in tree order. Nothing here sorts.
>
> **`binary` is skipped, and the code says why without calling it binary
> content.** `diffStats` sets the flag for anything git reported no line counts
> for, which includes an untracked file over the 1 MB cap (T4's note). The
> header counts it as a file and drops its numbers, because there is no content
> anyone looked at. The test pins that with a stat carrying non-zero counts
> beside the flag, so the rule is checked rather than a coincidence of zeroes.
>
> Mutation-checked: 8 deliberate breaks, all killed. Expanding twelve, expanding
> everything, expanding the last ten and padding a short list all die on
> FDIF-21; swapping added and removed, counting one file, dropping a
> no-line file from the file count and summing its numbers all die on FDIF-20.

---

### T12: Decide where next change goes

**What**: Add `nextChangeTarget(position, sections, direction)` to `diff-view.ts`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T11
**Reuses**: The line-change list the diff editor reports (shape confirmed in T1).
**Requirement**: FDIF-25, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Within a file: the next change after the cursor — `diff-view.test.ts:202`, or the previous one before it — `:210`
- [x] Past a file's last change: the first change of the next section, flagged to expand it — `:218` (`expand: true`)
- [x] Past the last change of the last file: stays put — `:234`, with `:235` on the mirror at the top of the stack
- [x] Before the first change of a section: the previous section's last change — `:226`
- [x] A section with no changes (identical content) is skipped — `:239`, `:244`
- [x] Gate passes: `npm test`
- [x] Test count: 1084 + 6 = **1090** (written 892 + 192 = 1084; +3 inherited, +3 from T9/T12)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide where next and previous change go`
**Status**: ✅ Complete

> **`expand` is `!section.expanded`, computed for every target, not only a
> crossing.** FDIF-26 names it on the cross-file move; making it a property of
> the section landed on costs nothing and saves T16 from deciding twice.
>
> **A single diff tab is the one-section case.** `sections` is the whole stack
> in render order, so FDIF-25 on a plain diff tab is this function with one
> entry, where `null` means the file's own last change rather than the end of a
> stack. A position whose path is not in the stack returns `null` as well: the
> section it names is gone, and a refresh will place the cursor again.
>
> **The first backward test could not fail and was rewritten.** With two changes
> per file, "the previous change" and "the file's first change" are the same
> line, so `.pop()` → `.shift()` survived. The fixture now carries three
> changes (4, 12, 20) and asserts 12 from line 20, which kills it.
>
> Mutation-checked: 11 deliberate breaks, all killed. A cursor-inclusive
> comparison in either direction, taking the far change instead of the nearest
> one in either direction, never crossing, crossing forward while going back,
> entering the next file at its last change, landing on an identical file,
> a wrong `expand` in either polarity, and wrapping at the end of the stack.

---

### T13: Word the EOL strip and plan which sections mount

**What**: Add `eolStripText(lines, from, to)` and `mountPlan(visible, mounted, cap = 12)` to `diff-view.ts`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T12
**Reuses**: `Eol`.
**Requirement**: FDIF-15, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `CRLF → LF on 12 lines` — `diff-view.test.ts:259`; singular `on 1 line` — `:263`
- [x] `mountPlan` mounts visible sections not yet mounted — `:288`; never exceeds the cap — `:296` and `:297`; and unmounts the sections farthest from the visible range first — `:303`
- [x] A collapsed section is never in the mount set, even when visible — `:309`, with `:310` on the section that closes while mounted
- [x] Gate passes: `npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: 1090 + 8 = **1098** (written 898 + 192 = 1090; +3 inherited, +5 new tests)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): word the line ending strip and plan section mounts`
**Status**: ✅ Complete — Phase 3 done

> **The mixed-endings case drops the arrow instead of inventing one.**
> `eolFrom` and `eolTo` are dominant terminators, so they can be equal while
> lines are reported: T3's 715 LF + 4 CRLF file flipped to pure LF is `LF → LF`
> with four lines changed, and the design's example text assumes a whole-file
> flip. The rule that shipped: the arrow only when both endings are known **and
> different**, otherwise `Line endings changed on N lines`. Same count, no claim
> about a direction the data does not carry, and the per-line markers still say
> where. T14 renders whichever string comes back and hides it under FDIF-16.
> An empty line list returns `null` — there is nothing to say and no strip.
>
> **`mountPlan` takes the whole stack, which the design's signature did not.**
> Written as `mountPlan(visible, mounted, cap)` it cannot answer either of its
> own criteria: "never mount a collapsed section" needs to know which sections
> are expanded, and "farthest from the visible range" needs their positions. It
> ships as `mountPlan(sections, visible, mounted, cap = 12)` with
> `StackSection = { path, expanded }`. Consequences for T16: it passes the list
> it already renders, in render order, and a path missing from it — a file just
> committed away — is unmounted, which is FDIF-31 handled for free.
>
> Distance is measured in stack positions from the visible range, zero inside
> it, and ties are broken by position, so the trim is deterministic. The cap is
> a parameter with the D1 default of 12; `:296` proves the default rather than
> the argument.
>
> Mutation-checked: 10 deliberate breaks, all killed. Arrowing a non-difference,
> reversing the arrow, both wrong plurals and a strip with nothing to say die on
> the four `eolStripText` tests; mounting a collapsed section and keeping the
> editor of one that closes die on `:309`/`:310`; dropping the cap, dropping the
> nearest first and not measuring distance at all die on `:296` and `:303`.

---

### T14: Render one diff

**What**: Create the `DiffViewer` component — read-only Monaco `DiffEditor`, layout and whitespace from preferences, unchanged regions folded, the EOL strip and glyph-margin markers, next / previous change on VS Code's binding (as recorded in T1), an "identical" message, fit-to-content sizing when used in a section, and scroll kept across a content refresh.
**Where**: `src/renderer/src/components/DiffViewer.tsx`
**Depends on**: T13
**Reuses**: F1's `monaco-setup.ts`; `eolStripText`; the APIs T1 confirmed.
**Requirement**: FDIF-07, 11, 12, 13, 14, 15, 16, 25, 30

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Both sides reject typing — `readOnly`, `originalEditable: false` and `domReadOnly` on the construction options; provable only by typing and comparing (F1 T23), so the evidence is T21's smoke
- [x] Ignoring whitespace hides trim-whitespace changes **and** the EOL strip and markers — `ignoreTrimWhitespace` through `updateOptions`, and the strip and the decoration set are both gated on the same flag
- [x] The shortcut is VS Code's binding as recorded in T1 — `Alt+F5` / `Shift+Alt+F5`, which is what the design already targeted; **bound in T19** beside the buttons, see the note below
- [x] Models are disposed with the editor — no leak across tab switches; both models are created here and disposed in the same cleanup that disposes the editor
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **1098** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render a read-only diff`
**Status**: ✅ Complete

> **`followAppTheme` moved out of `CodeViewer` and up into `FilesView`**, which
> is the change the inheritance table asks for and the reason it is in this
> task rather than T20: from here on a diff editor can be mounted beside a file
> tab, and the All changes stack mounts up to twelve at once. Monaco's theme is
> a single global, so one observer for the whole direction replaces one per
> viewer. Two files outside T14's `Where` were touched for it, `FilesView.tsx`
> (the call) and `CodeViewer.tsx` (its removal), and nothing else in either.
>
> **The keyboard binding lives in T19, not here, and lint is why.** The check
> is one pure function over a `KeyboardEvent`; exporting it from a component
> file trips `react-refresh/only-export-components` (an eslint **error**), and
> a copy in each component would put VS Code's binding in two places to drift
> apart. The tab strip is the one surface that knows whether a diff tab or the
> All changes stack is active, so it owns the single `keydown` listener and
> routes it to the active `DiffHandle` — which is also where FDIF-25's other
> half, the buttons, lives. `DiffViewer` exposes `goToDiff` through
> `onHandle` and binds nothing itself.
>
> **A side nobody can read is answered here, once, for both callers.** Binary,
> too-large and missing render F1's `FilePlaceholder` and no editor is created
> at all (FDIF-06), which is also FDIF-23 for a stack section whose file is
> binary. An `error` side renders git's line.
>
> **`absent` is the empty string.** FDIF-03/04 want an empty side, and an empty
> model beside a full one is exactly the diff of an addition or a deletion.
>
> **The "identical" state keeps the editor mounted and hides it in CSS.** The
> editor is what reports `onDidUpdateDiff`, so unmounting it would make the
> state unrecoverable when content arrives; `display: none` on the editor box
> leaves `automaticLayout` to resize it when it comes back.

---

### T15: Render one section of the stack

**What**: Create the `DiffSection` component — header (path, status, +/−), expand / collapse, `DiffViewer` only when the mount plan says so, the last measured height held while unmounted, `FilePlaceholder` for binary or oversized files.
**Where**: `src/renderer/src/components/DiffSection.tsx`
**Depends on**: T14
**Reuses**: `DiffViewer`; F1's `FilePlaceholder`.
**Requirement**: FDIF-19, 22, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Unmounting a section does not move the scroll position — the last height an editor measured is held in the section and rendered as a spacer the moment the editor goes; by hand, so T21's smoke is the evidence
- [x] An estimated height from `added + removed` is used until the first measurement — `estimatedHeight(stat)`, the changed lines plus the fold's context, floored at 6 lines and capped at 60
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **1098** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render one section of the change stack`
**Status**: ✅ Complete

> **The section reads its own sides, and only once it holds an editor.** The
> hook holds a diff tab's content; a stack of two hundred sections cannot, and
> mounting an editor is the same moment as wanting the content. So
> `files:diff-sides` is invoked from here, keyed on the `DiffRequest` the stack
> memoizes — a re-read of the mode's list produces new requests and re-reads
> every mounted section with them, which is FDIF-31 and FDIF-32 arriving
> without a second mechanism. `refreshToken` covers the refresh that leaves the
> list byte-identical.
>
> **A binary section never asks main anything.** `FileStat.binary` already says
> there are no lines to count (T4), so the placeholder goes up with no round
> trip and no editor (FDIF-23). That flag also covers an untracked file over
> the 1 MB cap, which is why the placeholder says "binary" for a file that is
> not: `diffStats` cannot tell them apart, and `DiffViewer` names the real kind
> whenever a diff tab reads the same file.
>
> **`onElement` hands the box up rather than the observer down.** T16 owns one
> `IntersectionObserver` for the whole stack; a section per observer would be
> two hundred of them.

---

### T16: Render the All changes tab

**What**: Create the `AllChangesTab` component — totals header, one `DiffSection` per file in tree order, the `IntersectionObserver` feeding `mountPlan`, cross-file navigation, the empty state.
**Where**: `src/renderer/src/components/AllChangesTab.tsx`
**Depends on**: T15
**Reuses**: `initialExpansion`, `totals`, `mountPlan`, `nextChangeTarget`.
**Requirement**: FDIF-19, 20, 21, 22, 24, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Never more than 12 editors live — `mountPlan`'s cap decides which sections render a `DiffViewer` at all; the count on a 40-file branch is T21's to check by hand
- [x] Next change at the end of a file expands and enters the next one — `walk` asks `nextChangeTarget`, expands on `target.expand` and finishes the move when the new section's editor announces itself
- [x] **[amended at F3 Design]** Takes the file list, the `FileStat[]` and a `(changed) => DiffRequest` builder as props and reads nothing from the Files mode itself — the props are `files`, `stats` and `requestFor`; `FilesMode` is not imported here
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **1098** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render the all changes tab`
**Status**: ✅ Complete

> **`DiffViewer` now announces its handle after the first diff computation,
> not at mount.** Corrected here because the cross-file walk needs it: entering
> a section means landing on its first or last change, and `getLineChanges()`
> answers `null` until the worker has run, which reads as a file with nothing
> in it — the walk would step straight over every section it opened. One file
> outside T16's `Where`, `DiffViewer.tsx`, and the same effect gained
> `top(line)`, which is how a fit-to-content editor's line is scrolled to: the
> editor never scrolls itself, the stack does.
>
> **The mount set is derived, not accumulated.** `mountPlan(sections, visible,
> [])` is asked with nothing already mounted, so the answer is exactly the
> expanded sections near the viewport, the nearest twelve when more are open.
> The alternative kept the previous set in state and wrote it from an effect,
> which `react-hooks/set-state-in-effect` rejects as an error, and it bought
> only the right to keep an editor alive past the 600 px margin — which the
> spec's last edge case explicitly allows losing. The same rule made
> `initialExpansion` a `useMemo` over the file list rather than a seeded state.
>
> **A section with no editor still has a walkable answer, from its counts.**
> `nextChangeTarget` skips a section whose `changes` are empty, and an unmounted
> section has no measured list. Its `FileStat` decides instead: binary, or zero
> added and removed, means nothing to walk into; anything else means at least
> one change, whose line is read off the real editor once it arrives. If the
> counts promised a change the diff does not report — which is what hiding
> whitespace does — the walk resumes from there rather than stopping.
>
> **Tree order is taken from F1's `buildTree`**, flattened back to
> `ChangedPath`. T11's note says `initialExpansion` takes the first ten of the
> list it is given, so the ordering had to happen before it, not inside it.

---

### T17: Hold diff state in the Files hook

**What**: Extend `use-files.ts` — diff tabs, the All changes tab via `tabsWithAllChanges`, stats per mode, both preferences through `config:patch`, and refresh on `files:changed`, `gitStateChanged` and a base change.
**Where**: `src/renderer/src/lib/use-files.ts`
**Depends on**: T16
**Reuses**: F1's hook shape and its `files:changed` subscription.
**Requirement**: FDIF-08, 09, 12, 16, 17, 21, 30, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] An uncommitted diff re-reads only when its own path is in a change batch — the non-`gitStateChanged` branch of the `files:changed` handler runs F1's `tabsAffected` over the uncommitted diff tabs' paths and re-reads nothing else
- [x] `gitStateChanged` re-reads every open diff and the stats — every diff tab through `readDiff`, the counts through `refreshMode`, and `refreshToken` bumped for the stack
- [x] A base change re-reads only diff-to-origin diffs and stats — an effect keyed on the resolved `mergeBase` walks the `since-base` diff tabs only
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **1098** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): hold diff tabs and preferences in the files hook`
**Status**: ✅ Complete

> **`onPersist` now takes a `ui` patch, not the files map.** The two diff
> preferences live in `ui.*` beside `sidebarWidth`, not in `FilesState`, and
> App is the one config writer (D4). Widening the callback is one line in
> `App.tsx` — `onPersist: update`, which is the writer itself — against
> inventing a second channel for the same config object.
>
> **The base-change effect is keyed on the resolved merge base, not on the
> chosen branch.** Both sides are read at `merge-base(HEAD, base)`, and that
> value only exists once `files:changed-since` has answered for the new base;
> firing on the branch name would re-read every diff-to-origin diff against the
> *old* commit and then leave it there.
>
> **`FileTabs.tsx` was touched to keep the gate green**, and only that far: the
> strip filters to file tabs and is keyed by `tabKeyOf`. T19 owns what it
> renders. Between here and T19 a diff tab opens but has nowhere to show, which
> is an interim state inside the phase, not a shipped one.
>
> **`activeTab` is a key now, and a focus naming a tab that is gone falls to
> the first of the strip.** In both diff modes that is All changes, which is
> what keeps the column from ever being empty there (FDIF-17). `closeTab` maps
> the whole strip, not the open tabs, so `tabsAfterClose` can see the fixed tab
> and refuse to close it.
>
> **The stack is not held here.** A diff *tab* keeps its `DiffSides` in the
> hook; the All changes sections read their own, because two hundred of them
> cannot live in one state object. The hook drives them by re-deriving
> `requestFor` whenever the mode's list or the merge base moves, plus
> `refreshToken` for the refresh that changes neither.

---

### T18: Open a diff from the tree

**What**: In `FileTree`, a click in either diff mode opens a diff tab built from `diffRequestFor`.
**Where**: `src/renderer/src/components/FileTree.tsx`
**Depends on**: T17
**Reuses**: `diffRequestFor`; the hook from T17.
**Requirement**: FDIF-01, 02, 10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] No click in a diff mode opens a file tab any more — `openInTab` returns on the `lens !== 'full'` branch after `openDiff`, and `openFile` is reached only from the full-folder branch
- [x] Full-folder mode is unchanged — same `openFile(path)`, and AD-033's 250 ms deferral and 3 s relaunch guard are untouched: the deferred action still runs `openInTab`, which now decides per mode
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **1098** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): open a diff from the tree in the diff modes`
**Status**: ✅ Complete

> **The row does not carry `oldPath`, so the listed change is looked back up.**
> `buildTree` turns a `ChangedPath` into a `FileNode` of path, name and status
> and drops the rest, and FDIF-05 needs `oldPath`. The click reads the entry
> back out of `files.changedFiles` by path — the same array the rows were built
> from — and falls back to the row's own status if it is not there, so a click
> is never dead.
>
> **`openDiff` builds the request, not the tree.** The task text says "built
> from `diffRequestFor`", which the hook does: the tab stores the
> `ChangedPath`, and the request is derived at read time, because FDIF-32 has
> to rebuild it against a new merge base without reopening the tab.
>
> **AD-033 survives intact.** A `.sln` is still deferred 250 ms and still
> guarded for 3 s; the only change is what the deferred click opens, which is
> now a diff in a diff mode. A deleted solution goes straight through, as
> before — it just lands on a diff whose modified side is absent (FDIF-04)
> rather than on FXPL-15's placeholder.
>
> **Spec-precision gap, not acted on**: nothing produces a `deleted` tab any
> more, so F1's FXPL-15 placeholder and the `deleted` open option are
> unreachable from the tree. The spec supersedes FXPL-14 (T20) and says nothing
> about FXPL-15, so both are left in place rather than removed on this task's
> own authority.

---

### T19: Show diff tabs and their controls

**What**: Extend `FileTabs` — diff tabs with a diff glyph, the fixed All changes tab, **Open file** (hidden for deleted files), the layout and whitespace toggles, next / previous buttons, and the F1 launcher row acting on the diff's file.
**Where**: `src/renderer/src/components/FileTabs.tsx`
**Depends on**: T18
**Reuses**: F1's tab strip and launcher row; `DiffViewer`; `AllChangesTab`.
**Requirement**: FDIF-12, 16, 17, 25, 27, 28, 29

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] All changes has no close button — the close button is rendered under `!fixed`, and `tabsAfterClose` refuses the key anyway (T10), so both halves hold
- [x] Open file lands in a file tab for the same path, leaving the diff tab open — `files.openFile(tab.path)` appends a tab with a different key (FDIF-08) and focuses it; the diff tab stays in the list
- [x] Toggles apply to every open diff at once — both read out of `ui.*` through the hook, so every mounted `DiffViewer` takes them from the same two values and `updateOptions` applies them in place
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **1098** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): show diff tabs and their controls`
**Status**: ✅ Complete

> **The `Alt+F5` / `Shift+Alt+F5` listener lives here**, one for the whole
> column, routed to whichever `DiffHandle` last announced itself — a single
> editor for a diff tab, or the stack answering for the section its walk is
> standing in. That is the placement T14's note settled on: exporting the key
> check from a component file is an eslint error, and the strip is the only
> surface that knows which diff is in front of the reader.
>
> **The controls row is between the strip and the launchers**, and only while a
> diff surface is active. The launcher row keeps its place under the tabs
> whatever the tab is, which is what FXPL-25 asks of it.
>
> **`worktreePath` became a prop.** The All changes stack reads its own sides,
> so it needs the worktree; `FilesView` already had it non-null at that point
> and passes it in one line. That file is outside T19's `Where`.
>
> **The stack is keyed by mode.** `key={'all-changes:' + mode}` remounts it on
> a mode switch, which is what FDIF-09 wants of the fixed tab and only of it:
> the diff tabs beside it are keyed by their own mode and keep comparing what
> they were opened on.
>
> **Next / previous are disabled until a diff has computed.** The handle is
> announced after the first `onDidUpdateDiff` (T16's correction), so the
> buttons light up exactly when there is something to move to.

---

### T20: Retire the interim file view

**What**: Remove the "file view, not a diff" label from `CodeViewer`, and mark FXPL-14 in `files-explore/spec.md` as superseded by FDIF-10.
**Where**: `src/renderer/src/components/CodeViewer.tsx`
**Depends on**: T19
**Reuses**: The AD-018 pattern for superseding a shipped requirement.
**Requirement**: FDIF-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] No code path renders the interim label — the element, its CSS rule and the `fromDiffMode` flag that drove it are gone end to end; `grep -rn "fromDiffMode\|code-viewer-note" src/` finds nothing
- [x] `files-explore/spec.md` FXPL-14 carries "superseded by FDIF-10" — struck through in the criterion with the date and the delivering task, marked in the traceability table, and the out-of-scope row updated, following the STBR-31 precedent
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: **1098** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: build
**Commit**: `refactor(renderer): retire the interim file view in diff modes`
**Status**: ✅ Complete — Phase 4 done

> **The retirement is the whole flag, not just the label.** `fromDiffMode`
> existed only to caption the interim view; with FDIF-10 shipped nothing sets
> it and nothing could read it. It is removed from `CodeViewer`'s props, from
> `FileTab`, from `OpenOptions` and from the `FileTabs` pass-through, along with
> the `.code-viewer-note` rule. Four files outside T20's `Where`, all of them
> the flag's own reach.
>
> **`scripts/smoke-files.mjs` now holds two checks that can no longer pass, and
> they were left alone.** Check 16 asserts FXPL-14's caption, which no longer
> exists, and the check after it opens `notes.md` from diff-to-origin expecting
> FXPL-15's deleted placeholder, which is now a diff with an absent modified
> side (FDIF-04). Both are consequences of a superseded requirement, not
> regressions — and editing a check to match new behaviour is exactly the move
> the execution rules forbid doing unasked. Raised for the owner instead;
> T21 builds F2's own smoke and is the place to settle F1's.
>
> **FXPL-15 is left standing.** Nothing produces a `deleted` tab any more (T18's
> note), so the placeholder is unreachable, but the spec supersedes FXPL-14 and
> is silent on FXPL-15. Recorded, not acted on.

---

### T21: Drive the diffs end to end

**What**: Create `scripts/smoke-files-diff.mjs` — seeds a temp repo with a renamed, an added, a deleted and a modified file on a branch, a CRLF-committed file rewritten as LF on disk, a binary and a 2 MB file, 40 changed files for the stack, and drives every surface.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T20
**Reuses**: F1's `scripts/smoke-files.mjs` harness and teardown.
**Requirement**: FDIF-01..32 end to end; the sole evidence for 07, 09, 11, 12, 13, 14, 16, 22, 23, 25, 26, 27, 28, 29, 30, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Checks: each reference side; the EOL strip and markers, and their disappearance when whitespace is hidden; layout and whitespace surviving a restart; All changes present only in diff modes, not closable, 10 of 40 expanded, totals matching `git diff --shortstat`, at most 12 editors live while scrolling; next change crossing files; Open file; a shell append updating an uncommitted diff within 1 s without jumping; a commit dropping the file from All changes — **18/18**, plus 1/1 in the `--after-restart` mode
- [x] Unregisters the temp workspace and restores the owner's direction, theme and diff preferences — `--clean` unregisters and deletes; the owner's own config was never in scope, because every run used an isolated `--user-data-dir`
- [x] Numbered pass/fail line per check; all pass against a live dev app — **18/18 on 2026-09-20**

**Tests**: manual
**Gate**: manual
**Commit**: `test(files): drive the diffs end to end`
**Status**: Complete — F2 is 21 of 21.

> **The smoke found one defect and the owner found three more. That ratio is the
> lesson of this task.**
>
> What the smoke caught: walking the stack with the next-change key **closed the
> sections behind you**. The expansion state starts null with the open set
> derived, and the write seeded from an empty array instead of the current
> value, so the first crossing discarded all ten open sections. Measured
> `expanded 10 -> 3` where it had to grow; now `10 -> 13`. Fixed in `8367c8d`.
>
> **What the smoke passed over, and the owner saw immediately:**
> 1. **The stack rendered as 44 stripes a few pixels tall.** `.diff-section`
>    lacked `flex: none` inside a flex column, so every section shrank to share
>    the scroller's height, editors clipped inside. The smoke had counted 44
>    sections and 10 live editors and called it a pass — **it counts elements; it
>    does not judge whether anything is legible.** `b0ab333`.
> 2. **Native scrollbars stayed light in the dark theme, across the whole app.**
>    No `color-scheme` was declared, so Chromium drew its own widgets in the
>    light scheme everywhere — terminal, Monaco, every list. `1196ae6`.
> 3. **Every Monaco icon was a missing-glyph box**, the `+`/`−` in the diff
>    gutter among them: the codicon stylesheet was never imported, so the icon
>    font was absent. It is not importable by subpath — `monaco-editor`'s
>    `exports` map sends `"./*"` to `"./esm/vs/*.js"` and appends `.js`, so no
>    stylesheet in the package can be reached through it. The renderer aliases
>    the file directly. `891668f`.
>
> **Three of the four were invisible to any check that counts DOM nodes**, and
> the third would have shipped broken icons across the entire application, not
> only here. A CDP smoke proves behaviour reached the DOM. It cannot see that
> the result is unreadable, mis-themed, or drawn in tofu. **Screens need eyes on
> them, and this is the evidence.**
>
> **Diagnosis note.** The icon was misdiagnosed twice before the owner's
> screenshot settled it. Both probes searched for the line-ending marker, which
> was simply not on screen, and found nothing; the screenshot showed boxes on
> *every* line of a *deleted* file, which has no ending change to mark at all.
> That contradiction is what pointed at the gutter icons instead. **When a probe
> finds nothing, suspect the hypothesis before the instrument.**
>
> **The line-ending marker is now drawn with borders** rather than set as a
> pilcrow — changed while chasing the wrong cause, kept because the glyph margin
> inherits Monaco's font stack rather than the app's, so a lettered marker
> depends on a font nobody here chose.
>
> **The script re-seeds per drive, not only per launch.** The last check commits
> a file, so a second drive against the same repo finds nothing to commit and
> dies inside the seed's own git call.
>
> **Verifier: PASS on the first round (2026-09-20)** — the first of this epic.
> 25/32 ACs matched their spec-defined outcome, 6 structural or spike-measured,
> sensor **7/7 killed**, `validate_state.py files-diff` exit 0. The +56 test
> delta reconciled exactly, so nothing was deleted or weakened.
>
> **It still found five checks in this very script that claimed more than they
> proved**, and all five were fixed before the push. The smoke is now **19
> checks**:
> 1. *"Neither side accepts typing"* **typed into one side twice.** Both click
>    targets came from `.slice(0, 2)` over `.view-line`s in document order, and
>    Monaco renders the original pane first — and the tab open at that point was
>    a deleted file, whose modified side is empty. It now takes one target per
>    `.editor` pane, on a file with content on both sides, and fails loudly if a
>    side was empty or only one target was found.
> 2. **The twelve-editor cap was asserted where nothing approached it** — only
>    ten sections were ever open, so `<= 12` could not fail. The check now
>    expands twenty more first and asserts against **thirty open sections**;
>    measured nine live.
> 3. **The cross-file walk accepted `||` a scroll**, so a move inside one file
>    would have passed the check that exists for crossing out of it. Now both,
>    and the stack is **folded first** — walking through already-open sections
>    cannot show that crossing opens one.
> 4. **The refresh check slept 1500 ms and then asserted "within 1 s"**, which
>    measures nothing about the second it names, was labelled with the wrong
>    requirement, and never checked the scroll the requirement asks to keep. It
>    now polls and **reports the elapsed time** (664 ms measured), and asserts
>    the offset is unchanged.
> 5. **The launcher row on a diff tab had no evidence at all** — no test, no
>    check, not in the hand checks. It has one now.
>
> Four of the five are the same failure as F1's: **a check whose label is a
> claim the code behind it cannot support.** Writing one is easy and reading one
> back is not, which is the argument for the sensor and for an independent
> verifier in the first place.
>
> **Open and not blocking**, carried for F3: `inTreeOrder` is pure and untested
> and is the sole evidence for the stack's ordering; `files-explore/spec.md:218`
> still marks a struck-through criterion `Pending`; `design.md` § Data Models
> still declares the replaced `FileStat { binary: boolean }`; `FilePlaceholder`
> still documents the removed `deleted` kind.
>
> **What no check here can settle**, stated because T21 is the proof: side by
> side against inline as the daily default, the strip wording on a genuinely
> mixed file, whether the folded "N unchanged lines" strip reads as clickable,
> and whether the binary and oversized placeholders sit legibly in the stack.

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1   (stop point)
Phase 2:  T2 → T3 → T4 → T5 → T6
Phase 3:  T7 → T8 → T9 → T10 → T11 → T12 → T13
Phase 4:  T14 → T15 → T16 → T17 → T18 → T19 → T20
Phase 5:  T21
```

Strictly sequential. **Packing** (~7 per batch, whole phases): Phases 1 + 2 (1 + 5) = batch 1; Phase 3 (7) = batch 2; Phases 4 + 5 (7 + 1) = batch 3. 21 tasks > 8, so the sub-agent offer applies at Execute — offer-then-confirm. The T1 stop point holds regardless of batching.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 findings section | ✅ |
| T2 | 1 types file + contract entries | ✅ |
| T3 | 1 pure function | ✅ |
| T4 | 1 function + 1 parser | ✅ |
| T5 | 1 function | ✅ |
| T6 | 1 wiring file | ✅ |
| T7 | 1 schema change | ✅ |
| T8 | 1 pure function | ✅ |
| T9 | 3 small pure functions on tab identity | ⚠️ cohesive — one concept, tab identity |
| T10 | 1 function extension | ✅ |
| T11 | 2 small pure functions | ✅ |
| T12 | 1 pure function | ✅ |
| T13 | 2 small pure functions | ✅ |
| T14–T19 | 1 component / hook each | ✅ |
| T20 | 1 component change + a spec note | ✅ |
| T21 | 1 script | ✅ |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | phase head | ✅ |
| T2 | T1 | T1 → T2 (boundary) | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | T6 | T6 → T7 (boundary) | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | T12 | T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 (boundary) | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T18 | T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T20 | T20 → T21 (boundary) | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Spike findings | manual | manual | ✅ |
| T2 | Shared types + contract | none | none | ✅ |
| T3 | Pure helper in main | unit | unit | ✅ |
| T4, T5 | Main module with logic | unit | unit | ✅ |
| T6 | Thin Electron shell | none | none | ✅ |
| T7 | Config schema | none | none | ✅ |
| T8–T13 | Pure helpers | unit | unit | ✅ |
| T14–T19 | Renderer components / hook | none | none | ✅ |
| T20 | Renderer component | none | none | ✅ |
| T21 | Smoke script | manual only | manual | ✅ |

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| FDIF-01 | T2, T5, T6, T8, T18, T21 |
| FDIF-02 | T2, T5, T8, T18, T21 |
| FDIF-03 | T5, T8, T21 |
| FDIF-04 | T5, T8, T21 |
| FDIF-05 | T5, T8, T21 |
| FDIF-06 | T5, T21 |
| FDIF-07 | T14, T21 |
| FDIF-08 | T9, T17 |
| FDIF-09 | T9, T17, T21 |
| FDIF-10 | T18, T20 |
| FDIF-11 | T7, T14, T21 |
| FDIF-12 | T7, T14, T17, T19, T21 |
| FDIF-13 | T1, T14, T21 |
| FDIF-14 | T14, T21 |
| FDIF-15 | T1, T3, T5, T7, T13, T14, T21 |
| FDIF-16 | T7, T14, T17, T19, T21 |
| FDIF-17 | T9, T10, T17, T19, T21 |
| FDIF-18 | T9, T21 |
| FDIF-19 | T2, T4, T6, T15, T16, T21 |
| FDIF-20 | T4, T11, T16, T21 |
| FDIF-21 | T11, T16, T17, T21 |
| FDIF-22 | T1, T13, T15, T16, T21 |
| FDIF-23 | T15, T21 |
| FDIF-24 | T4, T16, T21 |
| FDIF-25 | T1, T12, T14, T19, T21 |
| FDIF-26 | T12, T16, T21 |
| FDIF-27 | T19, T21 |
| FDIF-28 | T19, T21 |
| FDIF-29 | T19, T21 |
| FDIF-30 | T14, T17, T21 |
| FDIF-31 | T17, T21 |
| FDIF-32 | T17, T21 |

All 32 mapped; none unmapped.
