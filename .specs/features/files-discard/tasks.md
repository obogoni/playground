# Files Discard Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-discard/design.md`
**Status**: Approved (owner 2026-09-26); executed 2026-09-27

**Branch**: `feature/files-discard`, cut from `feature/file-icons` `422d68d` (PR #126). Before Execute it is rebased onto `feature/files-status-glyphs` (#131, plan `b0fae25`), which puts the status glyph in `.file-tree-end` / `.diff-section-end` through `StatusGlyph` and `changeStatusView`. Every task below assumes that rebase is done and #131 is implemented. The future PR targets upstream `main` with `Closes #132` and "depends on #131" in its body.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute; record the lint warning count and the full suite's wall time at the same time (L-005: the main tasks add real-git tests).

**T-setup (before T1, no commit)**: the worktree has no `node_modules`. Run `npm ci --ignore-scripts` then `node node_modules/electron/install.js` in the worktree; the unit gate needs the first, the dev app for T20 and T21 needs both.

**Owner rows**: the spec's Assumptions table carries five `owner confirmed 2026-09-26` rows (added file and a rename's new file to the Recycle Bin, links kept, an occupied restore target to the Recycle Bin first, the kept list in the dialog). If the owner changes one, the tasks that name its requirement change with it before Execute.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (main modules and extracted pure helpers carry co-located unit tests; renderer components are verified by CDP smoke; the IPC wiring in `index.ts` is hand-verified), `vitest.config.ts` (30 s per test), `package.json` scripts; style sampled from `src/main/file-diff.test.ts` (real temp repos), `src/main/worktree-manager.test.ts:249-306` (porcelain samples), `src/renderer/src/lib/diff-view.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main discard module (`file-discard.ts`) | unit (real git in `mkdtempSync` repos; `trash` injected; a recording `GitRunner` where the call itself is the evidence) | 1:1 to FDSC-04..09, 17, 18, 22, 23, 26, 27, 42 and edge cases 43, 44, 46..51; every branch of the status table in design.md | `src/main/file-discard.test.ts` | `npx vitest run src/main/file-discard.test.ts` |
| Uncommitted parser (`worktree-manager.ts`) | unit (porcelain samples + one real `git mv`) | FDSC-24; quoting on both sides; the superseded rename tests rewritten | `src/main/worktree-manager.test.ts` | `npx vitest run src/main/worktree-manager.test.ts` |
| Renderer decisions (`diff-view.ts`, `discard-view.ts`) | unit | FDSC-10 (order), 11, 12, 13, 14, 21, 25, 28..30, 32..35, 43; literal expected strings | `src/renderer/src/lib/*.test.ts` | `npx vitest run src/renderer/src/lib/discard-view.test.ts` |
| Shared types, IPC contract | none (typecheck) | FDSC-42's request shape | — | `npm run typecheck` |
| Main wiring (`index.ts`) | none (hand-verified; exercised by the smoke) | — | — | full gate + smoke |
| Hook and components (`use-files.ts`, `DiscardConfirm`, `FilesView`, `FileTree`, `DiffSection`, `AllChangesTab`, `FileTabs`, `Icon`, `App`) | none (CDP smoke) | FDSC-01..03, 10..16, 19..21, 28..41, 45, 51 in the running app | — | `node scripts/smoke-files-diff.mjs` |
| Docs (`STATE.md`, sibling specs) | none | — | — | review |
| End to end | manual CDP smoke | Every new check first seen failing on a deliberately broken build | `scripts/smoke-files-diff.mjs` (`discardChecks`) | three-step run on a throwaway `--user-data-dir` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npx vitest run <the task's test file>` |
| Full | After a component, hook or wiring task, and the last task | `npm run typecheck && npm run lint && npm test` |
| Build | Stylesheet and icon tasks | `npm run lint && npx electron-vite build` |
| Manual | T20, T21 | smoke run below |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

**Smoke run** (from the worktree, app not running): set `SMOKE_CONFIG=<tmp userData>\config.json` and `SMOKE_BASE=<tmp dir>`; `node scripts/smoke-files-diff.mjs --seed`; launch `npm run dev -- -- --remote-debugging-port=9222 --user-data-dir=<tmp userData> --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`; `node scripts/smoke-files-diff.mjs`; close the app; `node scripts/smoke-files-diff.mjs --clean`. Re-seed and relaunch between drives (the drive commits files). **`npm run dev` does not restart main on `src/main` edits**: a main-process mutant (T20 k, T21 d/e/f) needs a relaunch. The session check spawns an ad-hoc `pwsh -NoLogo` session (`sessions:spawn` with `adhocCommand`, as `smoke-activity.mjs:229` does), never a registry agent. The section sends two or three small fictitious files to the real Recycle Bin per run.

**Falsifying a check**: mutate through a small script that copies the file to `.orig`, writes the mutant, and restores in `finally`; relaunch (main) or let Vite hot-reload (renderer); confirm `git status` is clean afterwards.

---

## Execution Plan

### Phase 1: Renames keep their old path

```
T1 → T2
```

### Phase 2: Discard in the main process

```
T2 → T3 → T4 → T5 → T6 → T7 → T8
```

### Phase 3: Renderer decisions

```
T8 → T9 → T10
```

### Phase 4: The confirmation

```
T10 → T11 → T12 → T13 → T14
```

### Phase 5: Gestures

```
T14 → T15 → T16 → T17 → T18 → T19
```

### Phase 6: Prove

```
T19 → T20 → T21
```

---

## Task Breakdown

### T1: The uncommitted list keeps a rename's old path

**What**: `ChangedFile` gains `oldPath?: string`; `parseChangedFiles` keeps the pre-`-> ` side of an `R` or `C` entry as `oldPath`, each side unquoted on its own.
**Where**: `src/main/worktree-manager.ts` (`parseChangedFiles`, `:448-469`) and the one-line type in `src/shared/worktrees.ts:129-133`
**Depends on**: None
**Reuses**: `unquotePath` (`worktree-manager.ts:485-509`)
**Requirement**: FDSC-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests on porcelain samples: `R  old/a.txt -> new/a.txt` → `oldPath: 'old/a.txt'`; `RM` and `RD` keep it; `R  "caf\303\251 old.txt" -> "new name.txt"` decodes both sides; `C  src.txt -> copy.txt` → `added` with `oldPath: 'src.txt'`; ` M a -> b.txt` stays one path with no `oldPath`; `??` and ` M` entries carry no `oldPath` key
- [x] One real-git test: a temp repo with `status.renames true` and `core.autocrlf false` set locally (L-026), `git mv a.ts b.ts`, `changedFilesOf` returns `{ path: 'b.ts', status: 'renamed', oldPath: 'a.ts' }`
- [x] The three tests pinning the old rename shape (`worktree-manager.test.ts:269-292`) rewritten to the new one, each named in the commit body
- [x] Gate check passes: `npx vitest run src/main/worktree-manager.test.ts`, then `npm run typecheck` (the type is shared)
- [x] Test count: baseline + the new tests (rewrites counted once)

**Tests**: unit
**Gate**: quick

**Commit**: `fix(files): keep an uncommitted rename's old path`

---

### T2: An uncommitted rename's diff reads the old file

**What**: A test that `diffRequestFor('uncommitted', renamed with oldPath)` reads the left side from `HEAD:<oldPath>` and the right from disk at the new path; the code already does (`diff-view.ts:52-55`), the test is the missing evidence for uncommitted mode (only since-base is covered, `diff-view.test.ts:65-76`).
**Where**: `src/renderer/src/lib/diff-view.test.ts`
**Depends on**: T1
**Reuses**: the file's `changed()` helper (`:20-22`)
**Requirement**: FDSC-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Asserts `{ original: { rev: 'HEAD', path: 'src/gadget.ts' }, modified: { disk: true, path: 'src/widget.ts' } }` literally
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/diff-view.test.ts`
- [x] Test count: T1 count + 1

**Tests**: unit
**Gate**: quick

**Commit**: `test(files): pin an uncommitted rename's diff sides`

---

### T3: Record the decision

**What**: AD-NNN (the next free number across `develop` and every planned branch's `STATE.md`, checked at Execute) in `.specs/STATE.md` with design.md's AD-TBD text; in `files-explore/spec.md` and `files-diff/spec.md`, the read-only Out of Scope rows gain "superseded for uncommitted discard by AD-NNN (files-discard)" (L-033). The hunk row itself stays out of scope.
**Where**: `.specs/STATE.md`, `.specs/features/files-explore/spec.md`, `.specs/features/files-diff/spec.md`
**Depends on**: T2
**Reuses**: design.md, AD-TBD
**Requirement**: FDSC-17, FDSC-40, FDSC-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The number checked free across `develop`, `origin/main` and every local and fork feature branch, listed in the commit body
- [x] Gate check passes: `npm test` (docs only; the count is unchanged)

**Tests**: none
**Gate**: quick

**Commit**: `docs(state): record discarding uncommitted changes as the files view's one write`

---

### T4: Discard result types and the `files:discard` channel

**What**: `DiscardCause`, `DiscardKept`, `DiscardFileResult`, `DiscardResult` (design.md, Data Models) in `src/shared/files.ts`; `'files:discard': { req: { worktreePath: string; entries: ChangedPath[] }; res: DiscardResult }` in the contract next to `files:diff-stats`.
**Where**: `src/shared/files.ts`, `src/shared/ipc-contract.ts` (`:168-187`)
**Depends on**: T3
**Reuses**: `ChangedPath`
**Requirement**: FDSC-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The request type has exactly the two fields (no revision field exists to send)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): declare the discard channel and its per-file result`

---

### T5: Discard tracked changes

**What**: `discardChanges(worktreePath, entries, deps)` for `modified` and `deleted` entries (no Recycle Bin paths yet): the `resolveInside` guard, then `git --literal-pathspecs restore --source=HEAD --staged --worktree -- …` in chunks under 8,000 characters, each failed chunk re-run per entry; never rejects.
**Where**: `src/main/file-discard.ts` (new) and `src/main/file-discard.test.ts` (new)
**Depends on**: T4
**Reuses**: `git`, `GitRunner`, `gitFailureLine` (`git.ts`), `resolveInside` (`file-reader.ts:46-52`), the temp-repo setup of `file-diff.test.ts`
**Requirement**: FDSC-04, FDSC-05, FDSC-08, FDSC-09, FDSC-17, FDSC-23, FDSC-42, FDSC-49, FDSC-50, FDSC-51

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Temp repos set `core.autocrlf false` and `status.renames true` locally (L-026); state is read with `git status --porcelain`, `git diff --cached --name-only` and `git diff --name-only`
- [x] Tests, one behaviour each: an unstaged edit → clean; staged and unstaged edits on one file → both gone (FDSC-04); an unstaged and a staged deletion → back on disk and in the index (FDSC-05); `a[b].txt` and `ab.txt` both modified, discard `a[b].txt` only → `ab.txt` still modified (FDSC-09); a batch of a valid entry and one git does not know (`ghost.txt` listed as modified) → the valid one clean, `ghost.txt` kept with cause `git` and a detail naming it (FDSC-08); a `UU` conflict from a real merge → back to `HEAD` (FDSC-50); a held `.git/index.lock` → kept with cause `git` and a detail containing `index.lock` (FDSC-51); `../outside.txt` and an absolute path → kept with cause `outside`, and a recording runner saw no git call for them (FDSC-23); 300 entries of 120-character paths → all clean (FDSC-49)
- [x] A recording `GitRunner` test: every call carries `--literal-pathspecs` and `--source=HEAD`, and no argument comes from anything but the entry paths (FDSC-42; L-020)
- [x] `grep -nE "unlink|rm\(|rmdir|rmSync" src/main/file-discard.ts` finds nothing (FDSC-17)
- [x] Full-suite wall time compared with the baseline and noted (L-005)
- [x] Gate check passes: `npx vitest run src/main/file-discard.test.ts`
- [x] Test count: T2 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): discard tracked changes back to the last commit`

---

### T6: Untracked and added files go to the Recycle Bin

**What**: Phase A of the design for `untracked` and `added`: `lstat` each bin path, skip a missing one, keep a link or junction, else `await deps.trash(abs)` and keep the entry on a rejection; then `git --literal-pathspecs rm --cached --quiet --ignore-unmatch -- path` for an added entry whose file moved.
**Where**: `src/main/file-discard.ts`
**Depends on**: T5
**Reuses**: T5's guard and result building
**Requirement**: FDSC-06, FDSC-07, FDSC-17, FDSC-18, FDSC-22, FDSC-43, FDSC-44, FDSC-46, FDSC-48

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The test `trash` moves the file into a per-test `bin` folder (so "in the Recycle Bin" is observable) or rejects for paths in a refuse set
- [x] Tests: an untracked file → in `bin`, gone from the worktree (FDSC-06); an added file with a later edit (`AM`) → in `bin`, and `git status` lists nothing for it (FDSC-07); two untracked files with one refused → the refused one on disk unchanged, the other in `bin`, the refused one kept with cause `recycle-bin` (FDSC-18); an added file refused → still `A` in the index and on disk, and the recording runner saw no `rm` for it (FDSC-18); an untracked junction made with `symlinkSync(target, link, 'junction')` → kept with cause `link`, `trash` never called, the target's files intact (FDSC-22); an untracked folder listed as `dir/` → the folder in `bin` whole (FDSC-43); an untracked entry already deleted → not kept (FDSC-44); a repo with no commit and an added file → in `bin`, index empty (FDSC-46); a runner failing `rm --cached` → kept with cause `git`, file in `bin` (FDSC-48)
- [x] Gate check passes: `npx vitest run src/main/file-discard.test.ts`
- [x] Test count: T5 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): send untracked and added files to the recycle bin`

---

### T7: Renames and occupied restore targets

**What**: `renamed`: move the new file to the Recycle Bin, then restore `oldPath` and `path` in one call; `deleted` and a rename's `oldPath`: anything on disk at a path about to be restored goes to the Recycle Bin first; a refusal keeps the whole entry with no git run.
**Where**: `src/main/file-discard.ts`
**Depends on**: T6
**Reuses**: T6's phase A, T5's restore
**Requirement**: FDSC-17, FDSC-26, FDSC-27, FDSC-47

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `git mv a.ts b.ts` plus an edit to `b.ts` → `a.ts` back with committed content, `b.ts` in `bin` with the edit, `git status` clean (FDSC-26); the same with `b.ts` refused → `git status` still `RM a.ts -> b.ts`, `a.ts` absent, `b.ts` unchanged, no git call recorded for the entry (FDSC-27); `git rm x.txt` then a new untracked `x.txt`, discarding the deletion alone → the new `x.txt` in `bin`, the committed `x.txt` restored (FDSC-47); the same with the new `x.txt` refused → entry kept, nothing restored (FDSC-47); a file placed at a rename's old path → in `bin` before the restore (FDSC-47)
- [x] Gate check passes: `npx vitest run src/main/file-discard.test.ts`
- [x] Test count: T6 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): discard renames and keep what sits in the way`

---

### T8: Wire `files:discard`

**What**: `handle('files:discard', ({ worktreePath, entries }) => discardChanges(worktreePath, entries, { trash: (p) => shell.trashItem(p) }))` beside `files:diff-stats`.
**Where**: `src/main/index.ts` (`:333`)
**Depends on**: T7
**Reuses**: the `files:*` handler block (`:327-334`)
**Requirement**: FDSC-06, FDSC-17, FDSC-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `shell` is the one already imported for `commits:open` (`:340-342`); `resolveInside` hands `trashItem` a backslashed absolute path, as its typings require (`electron.d.ts:13179-13181`)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): handle discard requests in the main process`

---

### T9: What a gesture discards and how the confirmation words it

**What**: `entryForRow`, `entriesUnder`, `discardGroups`, `confirmLabel`, `sessionWarning`, `keptReason` (design.md, `discard-view.ts`).
**Where**: `src/renderer/src/lib/discard-view.ts` (new) and its co-located test
**Depends on**: T8
**Reuses**: `buildTree` for tree order (`files-view.ts:31-57`)
**Requirement**: FDSC-10, FDSC-11, FDSC-12, FDSC-13, FDSC-14, FDSC-21, FDSC-34, FDSC-35, FDSC-43

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests with literal expected values: `entryForRow(list, 'dir')` finds a listed `dir/` (FDSC-43) and `'src/a.ts'` its entry; `entriesUnder(list, 'src')` returns entries at depths 1 and 3 and not `srcx/a.ts` nor `src` siblings outside the folder (FDSC-34); Discard all needs no helper: it sends the uncommitted list as it is (FDSC-35, T17); `discardGroups` puts each of the five statuses in its group, one `it.each` row per status (L-054), in tree order (FDSC-10, 11); `confirmLabel(1)` is `Discard 1 file`, `confirmLabel(2)` `Discard 2 files` (FDSC-14); `sessionWarning(0)` is null, `(1)` `1 session is running in this worktree and may be using these files.`, `(2)` `2 sessions are running in this worktree and may be using these files.` (FDSC-12, 13); `keptReason` returns `The Recycle Bin refused it.`, `Links and junctions are never moved.`, `It is outside the worktree.`, and a `git` detail verbatim (FDSC-21)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/discard-view.test.ts`
- [x] Test count: T7 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): decide what a discard gesture lists and how it reads`

---

### T10: What a discard does to the open tabs

**What**: `afterDiscard(tabs, entries, result)` returning the tab keys to close and the file paths to re-read (design.md).
**Where**: `src/renderer/src/lib/discard-view.ts`
**Depends on**: T9
**Reuses**: `tabKeyOf` (`diff-view.ts:82-86`)
**Requirement**: FDSC-28, FDSC-29, FDSC-30, FDSC-32, FDSC-33, FDSC-43

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, one status deciding each (L-054): a discarded `modified` closes `diff:uncommitted:p` and re-reads `p` (FDSC-28, 29); `untracked` and `added` close `diff:uncommitted:p` and `file:p` (FDSC-30); `renamed` closes `file:new`, re-reads `file:old` (FDSC-29, 30); a kept entry closes and re-reads nothing (FDSC-32); `diff:since-base:p` and a `commit:` tab of the same path are never closed (FDSC-33); a discarded `dir/` closes `file:dir/a.txt` and `file:dir/sub/b.txt` but not `file:dirx/c.txt` (FDSC-43)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/discard-view.test.ts`
- [x] Test count: T9 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): decide which tabs a discard closes or reloads`

---

### T11: `use-files` runs a discard

**What**: `discard(entries): Promise<DiscardResult>` on `UseFiles`: invoke `files:discard`, apply `afterDiscard` (closing through the `tabsAfterClose` focus rule, re-reading through `readTab`), re-list with `refreshMode`; a rejected invoke resolves to every entry kept with cause `git` and the error's message.
**Where**: `src/renderer/src/lib/use-files.ts`
**Depends on**: T10
**Reuses**: `readTab` (`:313-327`), `refreshMode` (`:352-379`), `closeTab`'s use of `tabsAfterClose` (`:671-688`)
**Requirement**: FDSC-28, FDSC-29, FDSC-30, FDSC-31, FDSC-32, FDSC-45

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Entries are sent as given, never re-derived from the current list (FDSC-45)
- [x] Decisions come from `afterDiscard` only; the hook holds no status logic of its own (L-018)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): run a discard and settle the tabs it touched`

---

### T12: The ↶ icon

**What**: An `'undo'` entry in `IconName` and `PATHS`, drawn in the set's 24-unit stroke style.
**Where**: `src/renderer/src/components/Icon.tsx`
**Depends on**: T11
**Reuses**: the existing path conventions
**Requirement**: FDSC-36, FDSC-38

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Hand-drawn (no copied third-party path data)
- [x] Gate check passes: `npm run lint && npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `feat(ui): add an undo icon`

---

### T13: The confirmation dialog

**What**: `DiscardConfirm` with its stylesheet: title, the two groups with their headings, rows with `StatusGlyph` and path (`old → new` for a rename), the session warning and titles, `Cancel` and the danger button (`confirmLabel`, `Discarding…` and disabled while busy); the kept state (`Some changes were kept`, `.discard-kept-row` with `keptReason`, `Close`). Class names as design.md lists them.
**Where**: `src/renderer/src/components/DiscardConfirm.tsx` (new) and `DiscardConfirm.css` (new)
**Depends on**: T12
**Reuses**: `RemoveWorktreeConfirm.tsx` (focus on mount, Escape, backdrop, session rows), `NewWorktreeDialog.css` dialog classes, T9's helpers, #131's `StatusGlyph`
**Requirement**: FDSC-10, FDSC-11, FDSC-12, FDSC-13, FDSC-14, FDSC-15, FDSC-16, FDSC-20, FDSC-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Every user-facing string comes from T9's helpers or is one of the spec's literals (L-064)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): confirm a discard with the exact list of files`

---

### T14: `FilesView` holds the pending discard

**What**: `pending`, `busy` and `kept` state; `onDiscard(entries)` handed to `FileTree` and `FileTabs`; on confirm, `files.discard`, then `onDiscarded()`, then close or show kept. App passes `runningSessions` (`sessions.filter(s => s.cwd === path && s.status === 'running')`) and `onDiscarded={refreshTree}`.
**Where**: `src/renderer/src/components/FilesView.tsx`, `src/renderer/src/App.tsx` (`:496-503`)
**Depends on**: T13
**Reuses**: T11, T13; the running-session rule of `WorktreeDetail.tsx:111`; `refreshTree` as the status bar uses it (`App.tsx:523`)
**Requirement**: FDSC-12, FDSC-13, FDSC-15, FDSC-16, FDSC-19, FDSC-20, FDSC-31, FDSC-45

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Producer and consumer props land in this one task, so the typecheck stays green without optional props (L-001)
- [x] The confirmed request is exactly `pending`, captured when the dialog opened (FDSC-45)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): open the discard confirmation from the files view`

---

### T15: Row menu in uncommitted mode

**What**: `ChangedRows` rows become a `div.file-tree-row` container holding `button.file-tree-open` (icon, `.file-tree-name`, title, click) and #131's `.file-tree-end`; folder rows get the same container. In uncommitted mode only, `onContextMenu` on a file or folder row opens `.file-tree-ctx-menu` with one `.file-tree-ctx-item` `Discard changes`, dismissed by a window click or Escape; picking it calls `onDiscard` with `entryForRow` (file) or `entriesUnder` (folder).
**Where**: `src/renderer/src/components/FileTree.tsx`
**Depends on**: T14
**Reuses**: `CommitList.tsx:52-65, 121-156` (menu and dismissal), T9's helpers
**Requirement**: FDSC-01, FDSC-02, FDSC-03, FDSC-34, FDSC-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `SinceBase` renders `ChangedRows` with no discard handler, so diff-to-origin rows have no menu (FDSC-40)
- [x] `.file-tree-row`, `.file-tree-name`, `.file-tree-end` and `.status-glyph` kept, so #131's and the icon section's smoke selectors still match (`grep -n "file-tree-row\|file-tree-name" scripts/*.mjs` reviewed; L-053)
- [x] Row layout reads the same as before in the dev app (hand read; T20 checks behaviour)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): offer discard from the uncommitted rows' menu`

---

### T16: The hover ↶ on rows

**What**: A `button.file-tree-discard` titled `Discard changes` (the `undo` icon, 13 px) as the first child of each uncommitted row's end group, before the glyph; hidden (`visibility: hidden`) until `.file-tree-row:hover` or `:focus-within`; its click stops propagation and calls `onDiscard` like the menu. Container styles: `.file-tree-row` works as a `div` (hover background, padding, indent) and `.file-tree-open` resets button chrome.
**Where**: `src/renderer/src/components/FileTree.tsx`, `src/renderer/src/components/FileTree.css`
**Depends on**: T15
**Reuses**: T12, T15; #131's `.file-tree-end` (`gap: 4px; margin-left: auto`)
**Requirement**: FDSC-36, FDSC-37, FDSC-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The ↶ takes its space even while hidden, so the glyph column never moves on hover (#131's column check)
- [x] Gate check passes: `npm run lint && npx electron-vite build`, then `npm run typecheck && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): show a discard button on hovered rows`

---

### T17: `Discard all` in the uncommitted list header

**What**: `.file-tree-uncommitted-header` above the uncommitted rows, holding `button.file-tree-discard-all` `Discard all`, rendered only while the list has an entry; it calls `onDiscard(files.uncommitted)`.
**Where**: `src/renderer/src/components/FileTree.tsx` (+ its rule in `FileTree.css`)
**Depends on**: T16
**Reuses**: the base picker's slot (`FileTree.tsx:310`)
**Requirement**: FDSC-35, FDSC-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Absent with `No uncommitted changes.` and in every other mode
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): discard every uncommitted change from the list header`

---

### T18: The ↶ in All changes section headers

**What**: The header becomes `div.diff-section-header` holding `button.diff-section-toggle[aria-expanded]` (chevron, path, counts) and #131's `.diff-section-end`; with an `onDiscard` prop, a `button.diff-section-discard` titled `Discard changes` goes first in the end group, always visible, its click stopping propagation. `AllChangesTab` gains `onDiscard?: (changed: ChangedPath) => void` and passes it to each section. The five FDIF smoke reads of `.diff-section-header[aria-expanded]` and its clicks (`smoke-files-diff.mjs:521-657`) move to `.diff-section-toggle`.
**Where**: `src/renderer/src/components/DiffSection.tsx` (+ `DiffSection.css`), `src/renderer/src/components/AllChangesTab.tsx`, `scripts/smoke-files-diff.mjs`
**Depends on**: T17
**Reuses**: T12; #131's `.diff-section-end`
**Requirement**: FDSC-38, FDSC-39, FDSC-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `grep -n "diff-section-header" scripts/*.mjs` shows no read of `aria-expanded` or `.click()` left on the container (L-053); #131's header checks still find the glyph inside `.diff-section-header`, last
- [x] `CommitTab.tsx:43` unchanged: it passes no `onDiscard` (FDSC-41)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): add a discard button to uncommitted section headers`

---

### T19: The All changes tab offers discard in uncommitted mode only

**What**: `FileTabs` receives `onDiscard` and passes it to `AllChangesTab` only while `files.mode === 'uncommitted'`, mapping one `changed` to `[changed]`.
**Where**: `src/renderer/src/components/FileTabs.tsx` (`:297-307`)
**Depends on**: T18
**Reuses**: T14's `onDiscard`
**Requirement**: FDSC-38, FDSC-40, FDSC-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): offer section discard in the uncommitted stack only`

---

### T20: Smoke — every gesture opens the right list, and nothing else offers one

**What**: A `discardChecks(ws)` section in `smoke-files-diff.mjs`, called after #131's `glyphHeaderChecks(ws)` and before `iconChecks(ws)` (which reloads and stays last). It builds its own fixture at the start, so no earlier section sees it: commits `discard/mod.ts`, `discard/stage.ts`, `discard/gone.ts`, `discard/old-name.ts`, `discard/deep/a.md`, `discard/deep/sub/b.md` on the branch (one commit, so diff-to-origin lists them), then makes them uncommitted: `mod.ts` edited; `stage.ts` staged and edited again; `gone.ts` deleted; `git mv old-name.ts new-name-<stamp>.ts` plus an edit; both `.md` files edited; untracked `discard/notes-<stamp>.txt`; staged `discard/added-<stamp>.ts`. `<stamp>` is the run's timestamp. It records the uncommitted list, waits for it to show the fixture, and switches to Uncommitted. Checks:
1. **File menu**: right-click `mod.ts` (CDP `Input.dispatchMouseEvent`, right button) → the menu's items are exactly `['Discard changes']`; picking it → title `Discard changes?`, rows exactly `['discard/mod.ts']`, only the restore heading, button `Discard 1 file` (FDSC-01, 02, 10, 11, 14).
2. **Menu dismissal**: open the menu, press Escape → no menu; open it, click elsewhere → no menu; `git status --porcelain` unchanged (FDSC-03).
3. **Cancel**: open the dialog three times, leave by `Cancel`, Escape and a backdrop click → `git status --porcelain` byte-identical after each (FDSC-15).
4. **Folder menu**: right-click the `deep` folder row → rows exactly `['discard/deep/a.md', 'discard/deep/sub/b.md']` (FDSC-34).
5. **Hover ↶**: on the `notes-<stamp>.txt` row, `.file-tree-discard` reads `visibility: hidden` (precondition: the element exists); after a CDP `mouseMoved` over the row it reads `visible`; the `discard` folder row's ↶ likewise; with the pointer moved off, focusing the row's open button makes it `visible`; click the ↶ → rows exactly the notes file under `These go to the Recycle Bin.` only, and the tab strip's tab count unchanged (FDSC-36, 37, 11).
6. **Discard all**: `.file-tree-discard-all` reads `Discard all`; clicked → rows equal the tree's file rows in tree order, each holding one `.status-glyph`; both headings present with their exact texts; button `Discard N files` with N the row count; no `.discard-sessions` (FDSC-10, 11, 13, 14, 35).
7. **Session warning**: spawn an ad-hoc `pwsh -NoLogo` session with `cwd` the worktree's path from the tree; reopen Discard all → `.discard-sessions` starts with `1 session is running in this worktree and may be using these files.` and holds the session's title; the session is stopped and removed in a `finally` (FDSC-12).
8. **Section ↶**: the All changes tab in Uncommitted → every `.diff-section-header` holds one `.diff-section-discard` titled `Discard changes`; read one section's `.diff-section-toggle` `aria-expanded`, click its ↶ → rows exactly that path, and `aria-expanded` unchanged (FDSC-38, 39).
9. **Read-only elsewhere** (checks 1, 5, 6, 8 proved the controls exist): switch to Diff to origin → right-click a `discard/` row opens no `.file-tree-ctx-menu`; no row holds a `.file-tree-discard`; no `.file-tree-discard-all`; its All changes sections hold no `.diff-section-discard`; in Commits mode open the fixture commit's tab → no `.diff-section-discard` (FDSC-40, 41).
10. **Rename diff**: back in Uncommitted, open `new-name-<stamp>.ts`'s diff → the original side's rendered text holds the committed `old-name.ts` marker line, and no error placeholder shows (FDSC-24, 25).
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T19
**Reuses**: `evaluate`, `check`, `clickByText`, `selectWorktree`, the FDIF-30 disk-write pattern; the header's hand-check list
**Requirement**: FDSC-01, FDSC-02, FDSC-03, FDSC-10, FDSC-11, FDSC-12, FDSC-13, FDSC-14, FDSC-15, FDSC-24, FDSC-25, FDSC-34, FDSC-35, FDSC-36, FDSC-37, FDSC-38, FDSC-39, FDSC-40, FDSC-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each check seen failing on its own mutant, then passing: (a) the menu rendered in every mode fails 9; (b) the file item sending the parent folder's entries fails 1; (c) no Escape listener fails 2; (d) `Cancel` calling `onConfirm` fails 3; (e) `entriesUnder` keeping direct children only fails 4; (f) the ↶ always visible fails 5's hidden read; (g) the ↶ click reaching the open button fails 5's tab count; (h) App passing `runningSessions={[]}` fails 7; (i) the section ↶ click reaching the toggle fails 8; (j) `FileTabs` passing `onDiscard` in every mode fails 9; (k) `parseChangedFiles` dropping `oldPath` (main mutant, relaunch) fails 10
- [x] The header's hand checks gain: a discard of an untracked file on a network share is kept with `The Recycle Bin refused it.`; an untracked junction is kept with `Links and junctions are never moved.` (L-030)
- [x] The fixture is fictitious, and the file header documents it beside the seed list (`smoke-files-diff.mjs:25-41`)
- [x] Gate check passes: `npm run lint` (warning count unchanged)

**Execute notes**: check 4 expects the tree order, which draws folders first: `discard/deep/sub/b.md` before `discard/deep/a.md`, the reverse of the list written above; the smoke reads the expectation from the tree. Check 6 compares each group of the dialog (Recycle Bin first, then restore) with the tree’s file rows of that group in tree order, and the two together with the tree’s file rows as a set. The section closes the dialog by Escape everywhere but check 3, so mutant (d) is first met by check 3. Every mutant (a)..(k) failed its planned check once (d also failed 8 by the discarded fixture file; b also failed 5), then the focused run passed 10/10.

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): check every discard gesture and the read-only modes`

---

### T21: Smoke — confirming a discard

**What**: The rest of `discardChecks(ws)`, on T20's fixture:
1. **Modified, tabs and counts**: open `discard/mod.ts`'s Diff-to-origin diff tab, then in Uncommitted its diff tab and its file tab; read the status bar count; install a `MutationObserver` recording the confirm button's text and `disabled`; discard `mod.ts` through its menu → the observer saw `Discarding…` while disabled; the dialog is gone and no `.discard-kept-row` showed; `git status --porcelain -- discard/mod.ts` is empty; the uncommitted diff tab is gone, the Diff-to-origin one is still open; the file tab shows the committed marker line; the list lacks `mod.ts`; the status bar count is one less within 3 s (FDSC-04, 16, 19, 28, 29, 31, 33).
2. **Staged and unstaged**: discard `stage.ts` by its ↶ → `git diff --cached --name-only` and `git diff --name-only` both lack it (FDSC-04).
3. **Deleted**: discard `gone.ts` → on disk with the committed content (FDSC-05).
4. **Untracked**: with its file tab open, discard `notes-<stamp>.txt` → not on disk; its file tab closed; the Recycle Bin lists an item whose name holds `<stamp>` (read with PowerShell `(New-Object -ComObject Shell.Application).NameSpace(10).Items()`) (FDSC-06, 17, 30).
5. **Added**: discard `added-<stamp>.ts` → not on disk, not in `git ls-files`, and in the Recycle Bin (FDSC-07).
6. **Rename**: discard the rename → `old-name.ts` back with the committed content; `new-name-<stamp>.ts` not on disk nor in the index, and in the Recycle Bin; `git status --porcelain -- discard/` lists neither (FDSC-26).
7. **Kept**: create `.git/index.lock`; discard `discard/deep/a.md` → the dialog stays with title `Some changes were kept`, exactly one `.discard-kept-row[data-path="discard/deep/a.md"]` whose reason holds `index.lock`; `Close` closes it; the file is still modified and its open tabs unchanged; the lock is removed in a `finally` (FDSC-20, 21, 32, 51).
8. **What the dialog listed**: open the `discard` folder's discard, then write `discard/late-<stamp>.txt` before confirming → after confirming, `late-<stamp>.txt` is on disk and listed; the other fixture entries are gone; discarding `late-<stamp>.txt` leaves the uncommitted list equal to the one recorded before the fixture (FDSC-34, 45).
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T20
**Reuses**: T20's fixture and probes
**Requirement**: FDSC-04, FDSC-05, FDSC-06, FDSC-07, FDSC-16, FDSC-17, FDSC-19, FDSC-20, FDSC-21, FDSC-26, FDSC-28, FDSC-29, FDSC-30, FDSC-31, FDSC-32, FDSC-33, FDSC-34, FDSC-45, FDSC-51

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each check seen failing on its own mutant, then passing: (a) `afterDiscard` closing nothing fails 1 and 4; (b) `afterDiscard` closing the Diff-to-origin tab too fails 1; (c) `busy` never set fails 1's observer; (d) `restore` without `--staged` (main, relaunch) fails 2; (e) `trash` replaced by `fs.rm` (main, relaunch) fails 4's Recycle Bin read; (f) no `rm --cached` for added files (main, relaunch) fails 5; (g) the rename restoring `oldPath` only (main, relaunch) fails 6; (h) the dialog closing whatever the result fails 7; (i) `onDiscarded` not called fails 1's count; (j) `FilesView` re-deriving the folder's entries at confirm time fails 8
- [x] `iconChecks(ws)` still passes after the section, and a clean run of the whole drive passes, count recorded
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (warning count unchanged)

**Execute notes**: every mutant (a)..(j) failed its planned check once, then the focused run passed 18/18 and the whole drive 66/66 on a new profile. Both diff tabs of a path carry the same label and title, so check 1 tells them apart by count (two before, one after). Mutant (j) re-derives only a multi-entry request: re-deriving every request wipes the fixture at check 1, and check 8 would then fail for the wrong reason. The section confirms only a dialog that lists exactly the files it meant; a first run confirmed a dialog opened on a row the settling list had moved under the pointer, so row points are now checked against `elementFromPoint` too.

**Tests**: manual
**Gate**: full

**Commit**: `test(files): check what confirming a discard changes`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1 ------→ T2
Phase 2:  T2 ------→ T3 ------→ T4 ------→ T5 ------→ T6 ------→ T7 ------→ T8
Phase 3:  T8 ------→ T9 ------→ T10
Phase 4:  T10 ------→ T11 ------→ T12 ------→ T13 ------→ T14
Phase 5:  T14 ------→ T15 ------→ T16 ------→ T17 ------→ T18 ------→ T19
Phase 6:  T19 ------→ T20 ------→ T21
```

Twenty-one tasks: three batches (Phases 1–2, eight tasks; Phases 3–4, six; Phases 5–6, seven). At Execute the sub-agent offer is made first. The Verifier runs after T21.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: parser | 1 function + 1 type field | ⚠️ Cohesive (the field is the parser's output type) |
| T2: rename diff test | 1 test | ✅ Granular |
| T3: decision | 1 decision, 2 row notes | ⚠️ Cohesive (L-033: supersede notes travel with the decision) |
| T4: types + channel | 1 contract entry and its types | ⚠️ Cohesive |
| T5: tracked discard | 1 function | ✅ Granular |
| T6: Recycle Bin phase | 1 function part | ✅ Granular |
| T7: renames, occupants | 1 function part | ✅ Granular |
| T8: wiring | 1 handler | ✅ Granular |
| T9: gesture and wording helpers | 6 small pure functions, 1 file | ⚠️ Cohesive |
| T10: tab effects | 1 function | ✅ Granular |
| T11: hook action | 1 hook method | ✅ Granular |
| T12: icon | 1 icon | ✅ Granular |
| T13: dialog | 1 component + its stylesheet | ⚠️ Cohesive |
| T14: orchestration | 1 component + 2 App props | ⚠️ Cohesive (L-001) |
| T15: row menu | 1 component part | ✅ Granular |
| T16: hover ↶ | 1 component part + its rules | ⚠️ Cohesive |
| T17: Discard all | 1 component part | ✅ Granular |
| T18: section ↶ | 1 component + 1 prop + the smoke selectors it moves | ⚠️ Cohesive (L-053) |
| T19: mode gate | 1 prop | ✅ Granular |
| T20–T21: smoke | 1 section each | ✅ Granular |

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
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | uncommitted parser | unit | unit | ✅ OK |
| T2 | renderer decisions | unit | unit | ✅ OK |
| T3 | docs | none | none | ✅ OK |
| T4 | shared types, IPC contract | none | none | ✅ OK |
| T5–T7 | main discard module | unit | unit | ✅ OK |
| T8 | main wiring | none | none | ✅ OK |
| T9–T10 | renderer decisions | unit | unit | ✅ OK |
| T11 | hook | none | none | ✅ OK |
| T12–T19 | components, stylesheets | none | none | ✅ OK |
| T20–T21 | end to end | manual | manual | ✅ OK |

## Requirement Coverage

| Requirement | Tasks | Evidence planned |
| ----------- | ----- | ---------------- |
| FDSC-01, 02 | T15, T20 | T20 check 1 |
| FDSC-03 | T15, T20 | T20 check 2 |
| FDSC-04 | T5, T21 | T5 unit; T21 checks 1, 2 |
| FDSC-05 | T5, T21 | T5 unit; T21 check 3 |
| FDSC-06 | T6, T8, T21 | T6 unit; T21 check 4 |
| FDSC-07 | T6, T21 | T6 unit; T21 check 5 |
| FDSC-08 | T5 | T5 unit (stale entry beside a valid one) |
| FDSC-09 | T5 | T5 unit (`a[b].txt` beside `ab.txt`) |
| FDSC-10, 11 | T9, T13, T20 | T9 unit; T20 checks 1, 5, 6 |
| FDSC-12, 13 | T9, T13, T14, T20 | T9 unit; T20 checks 6, 7 |
| FDSC-14 | T9, T13, T20 | T9 unit; T20 checks 1, 6 |
| FDSC-15 | T13, T14, T20 | T20 check 3 |
| FDSC-16 | T13, T14, T21 | T21 check 1 (observer) |
| FDSC-17 | T3, T5, T6, T7, T8, T21 | T5 grep; T6/T7 refusal tests; T21 check 4 (Recycle Bin read) |
| FDSC-18 | T6 | T6 unit |
| FDSC-19 | T14, T21 | T21 check 1 |
| FDSC-20 | T13, T14, T21 | T21 check 7 |
| FDSC-21 | T9, T13, T21 | T9 unit (all four texts); T21 check 7 (git line) |
| FDSC-22 | T6 | T6 unit (real junction) |
| FDSC-23 | T5 | T5 unit |
| FDSC-24 | T1, T20 | T1 unit; T20 check 10 |
| FDSC-25 | T2, T20 | T2 unit; T20 check 10 |
| FDSC-26 | T7, T21 | T7 unit; T21 check 6 |
| FDSC-27 | T7 | T7 unit |
| FDSC-28, 29, 30 | T10, T11, T21 | T10 unit; T21 checks 1, 4 |
| FDSC-31 | T11, T14, T21 | T21 check 1 (list and status bar count) |
| FDSC-32 | T10, T21 | T10 unit; T21 check 7 |
| FDSC-33 | T10, T21 | T10 unit; T21 check 1 |
| FDSC-34 | T9, T15, T20, T21 | T9 unit; T20 check 4; T21 check 8 |
| FDSC-35 | T9, T17, T20 | T20 check 6 |
| FDSC-36, 37 | T12, T16, T20 | T20 check 5 |
| FDSC-38, 39 | T12, T18, T19, T20 | T20 check 8 |
| FDSC-40 | T3, T15, T16, T17, T19, T20 | T20 check 9 |
| FDSC-41 | T18, T19, T20 | T20 check 9 |
| FDSC-42 | T3, T4, T5, T8 | T4 type; T5 recording-runner test |
| FDSC-43 | T6, T9, T10 | T6, T9, T10 unit |
| FDSC-44 | T6 | T6 unit |
| FDSC-45 | T11, T14, T21 | T21 check 8 |
| FDSC-46 | T6 | T6 unit (no commit yet) |
| FDSC-47 | T7 | T7 unit (both the move and its refusal) |
| FDSC-48 | T6 | T6 unit (failing `rm --cached`) |
| FDSC-49 | T5 | T5 unit (300 × 120 characters) |
| FDSC-50 | T5 | T5 unit (real `UU`) |
| FDSC-51 | T5, T21 | T5 unit; T21 check 7 |
