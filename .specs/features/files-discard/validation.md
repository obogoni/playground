# Files Discard Validation

**Date**: 2026-09-27
**Spec**: `.specs/features/files-discard/spec.md` (FDSC-01..51)
**Diff range**: `8a417a1..93dfa57` (feature commits `86d03ad..93dfa57`; base branch `feature/files-status-glyphs`, #131)
**Verifier**: independent sub-agent (author ≠ verifier). Every row below was re-derived from the spec and the code; the author's notes were checked, not trusted.

## Validation: files-discard — PASS

No production defect found. Every AC has `file:line` evidence whose assertion targets the spec's outcome. The unit sensor killed 29 of 31 mutants. The two survivors are behaviours the ACs do not state (see Follow-ups). The smoke sensor killed all 5 mutants.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1..T21 | ✅ Done | Every task box in `tasks.md` is checked; commits `86d03ad..5cd163f`, then `93dfa57` (docs) |

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`
- **Exit**: 0
- **Tests**: 1840 passed, 0 failed, 0 skipped (95 files). Matches the expected 1840.
- **Lint**: 0 errors, 18 warnings. Matches the expected count, so the feature added no warning.
- **In-scope unit files** (`file-discard.test.ts`, `worktree-manager.test.ts`, `discard-view.test.ts`, `diff-view.test.ts`): 170 passed in the scratch worktree before any mutant ran.
- **Focused smoke** (`SMOKE_ONLY=discard`, fresh seed, fresh launch, throwaway `--user-data-dir`): 18/18 passed on the unmutated tree.
- **Test integrity**: three rename tests in `worktree-manager.test.ts` were rewritten from the destination-only shape to the `oldPath` shape. FDSC-24 requires that change. No test was deleted or weakened; `toEqual` became `toStrictEqual`, which is stricter.

---

## Spec-Anchored Acceptance Criteria

Smoke citations point at the `check(` label line in `scripts/smoke-files-diff.mjs`; the condition expression follows it. "Smoke n" is the check's position in the focused run.

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| FDSC-01 | Uncommitted-mode right-click on a file row opens a menu with one item, `Discard changes` | `scripts/smoke-files-diff.mjs:1920` (smoke 1): `sameList(items, ['Discard changes'])` | ✅ |
| FDSC-02 | Picking it opens the confirmation listing that file alone | `smoke-files-diff.mjs:1920`: `sameList(one?.rows, ['discard/mod.ts'])` | ✅ |
| FDSC-03 | Click elsewhere or Escape closes the menu, nothing discarded | `smoke-files-diff.mjs:1946` (smoke 2): `afterEscape === null && afterClick === null && git status === porcelain` | ✅ |
| FDSC-04 | Index and working copy match HEAD, staged edits included | `src/main/file-discard.test.ts:98`: `git diff --cached --name-only` → `''`, `git diff --name-only` → `''`, `read('a.txt')` → `'committed\n'`; smoke 11/12 `:2470`, `:2498` | ✅ |
| FDSC-05 | Deleted file back on disk and in the index | `file-discard.test.ts:113`: `read('gone.txt')` → `'gone\n'`, `ls-files` → `['gone.txt','removed.txt','']`, porcelain `''`; smoke 13 `:2513` | ✅ |
| FDSC-06 | Untracked file moved to the Recycle Bin | `file-discard.test.ts:329`: `onDisk` false, `inBin('notes.txt')` → `'draft\n'`; smoke 14 `:2535`: `inRecycleBin(binAfterNotes, fx.notes)` (real Recycle Bin) | ✅ |
| FDSC-07 | Added file: working copy to the Recycle Bin, index entry removed | `file-discard.test.ts:343`: `inBin` → `'staged then edited\n'`, porcelain `''`; smoke 15 `:2551`: `!inIndex(fx.added) && inRecycleBin(...)` | ✅ |
| FDSC-08 | Each file on its own; one failure does not stop the rest | `file-discard.test.ts:154`: porcelain `''` for `a.txt`, `ghost.txt` kept with `cause 'git'`, detail contains `ghost.txt` | ✅ |
| FDSC-09 | Literal path matching (`*`, `?`, `[`) | `file-discard.test.ts:137`: after discarding `a[b].txt`, porcelain → `' M ab.txt\n'` | ✅ |
| FDSC-10 | Title `Discard changes?`; every file the request sends, in tree order, with glyph and path, no other | `src/renderer/src/lib/discard-view.test.ts:84`: groups in tree order whatever the input order; smoke 1 `:1920` `one?.title === 'Discard changes?'`; smoke 6 `:2093`: rows match the tree's rows by group, the set matches, `glyphs.every(count === 1)` | ✅ (see spec-precision gap 1) |
| FDSC-11 | The two headings, each only when its group holds a file | `discard-view.test.ts:69` (it.each over five statuses); smoke 1 (restore only, one group), smoke 5 `:2056` (recycle only), smoke 6 (both, exact heading strings) | ✅ |
| FDSC-12 | `1 session is running…` / `N sessions are running…` plus each session's title | `discard-view.test.ts:112`: exact strings for 1 and 2; smoke 7 `:2150`: `first === '1 session is running in this worktree and may be using these files.' && sameList(titles, [session.title])` | ✅ (thin: see Follow-ups) |
| FDSC-13 | No warning with no running session | `discard-view.test.ts:108`: `sessionWarning(0)` → `null`; smoke 6 `:2093`: `all.sessions === null` | ✅ |
| FDSC-14 | `Discard 1 file` / `Discard N files` | `discard-view.test.ts:101`; smoke 1 `confirm.text === 'Discard 1 file'`; smoke 6 `` `Discard ${n} files` `` with n = rows listed | ✅ |
| FDSC-15 | Cancel, Escape, backdrop: nothing changes on disk or in the index | `smoke-files-diff.mjs:1994` (smoke 3): each way `opened && closed && same` (git status unchanged) | ✅ |
| FDSC-16 | While running: button disabled, reads `Discarding…` | smoke 11 `:2470`: MutationObserver saw `text === 'Discarding…' && disabled === true` | ✅ |
| FDSC-17 | Out of the worktree only by the Recycle Bin or git restore; never a delete | Static: `src/main/file-discard.ts:2` imports only `lstat` from `fs`; `src/main/index.ts:337-338` wires `shell.trashItem`. Sensor U14 (`trash` → `fs.rm`) killed by `file-discard.test.ts:329/343/363/384` (`inBin(...)`); smoke 14 reads the real Recycle Bin | ✅ |
| FDSC-18 | Refused file stays on disk and in the index; the rest discarded | `file-discard.test.ts:363`: `read('one.txt')` → `'one\n'`, `two.txt` in bin; `:384`: porcelain `'A  added.ts\n'`, `calls` → `[]` | ✅ |
| FDSC-19 | All discarded → dialog closes with no message | smoke 11 `:2470`: `modDone === null && !keptShown` | ✅ |
| FDSC-20 | Any kept → stays open, `Some changes were kept`, each kept file with reason, one `Close` | smoke 17 `:2608`: `kept.title === 'Some changes were kept' && kept.kept.length === 1 && sameList(kept.buttons, ['Close'])` | ✅ |
| FDSC-21 | The four reason texts | `discard-view.test.ts:123` (three fixed strings), `:131` (git line verbatim); smoke 17: reason includes `index.lock` | ✅ |
| FDSC-22 | Untracked link or junction kept, nothing moved | `file-discard.test.ts:402` (real junction): result `kept: { cause: 'link' }`, `recycle.seen` → `[]`, target intact | ✅ |
| FDSC-23 | Path outside the worktree kept, nothing done | `file-discard.test.ts:211`: `cause 'outside'` for `../outside.txt` and an absolute path, no git arg names them; `:560`: rename whose old path escapes → no trash, no git call | ✅ |
| FDSC-24 | Uncommitted list carries a rename's old path | `src/main/worktree-manager.test.ts:268`, `:282`, `:291` (`toStrictEqual` with `oldPath`); real git `:357` | ✅ |
| FDSC-25 | Rename diff: left = old path at HEAD, right = new file on disk | `src/renderer/src/lib/diff-view.test.ts:78`: `{ original: { rev: 'HEAD', path: 'src/gadget.ts' }, modified: { disk: true, path: 'src/widget.ts' } }`; smoke 10 `:2296`: original pane holds `committed old-name marker`, no error | ✅ |
| FDSC-26 | Old path back as committed; new file to the Recycle Bin and out of the index | `file-discard.test.ts:499`: `read('a.ts')` → `'committed\n'`, `inBin('b.ts')` holds the edit, porcelain `''`; smoke 16 `:2569` | ✅ |
| FDSC-27 | New file refused → rename kept whole | `file-discard.test.ts:513`: porcelain `'RM a.ts -> b.ts\n'`, `a.ts` absent, `b.ts` unchanged, `calls` → `[]` | ✅ |
| FDSC-28 | Uncommitted diff tab closes | `discard-view.test.ts:141`, `:154` (close includes `diff:uncommitted:src/p.ts`); smoke 11 (mod.ts diff tabs 2 → 1) | ✅ |
| FDSC-29 | Restored file's tab shows restored content | `discard-view.test.ts:141` (`reread: ['src/p.ts']`), `:170` (old path re-read); smoke 11: file tab text includes `committed mod marker` | ✅ |
| FDSC-30 | Binned file's tab closes | `discard-view.test.ts:154` (close includes `file:src/p.ts`), `:170`; smoke 14 (`notesTabsAfter.length === 0`) | ✅ |
| FDSC-31 | List and status-bar count show the new state without a click | smoke 11 `:2470`: `!modListed && countAfter === countBefore - 1` | ✅ (thin: see Follow-ups) |
| FDSC-32 | Kept file's tabs unchanged | `discard-view.test.ts:180`: `{ close: [], reread: [] }`; smoke 17: `sameList(aTabsAfter, aTabsBefore)` | ✅ |
| FDSC-33 | Diff-to-origin tab of the same path stays | `discard-view.test.ts:197`: close → `['diff:uncommitted:src/p.ts']` only; smoke 11: diff tabs 2 → 1 | ✅ (thin: see Follow-ups) |
| FDSC-34 | Folder menu lists every changed file under it, any depth | `discard-view.test.ts:36`: depths 1 and 3, not `srcx/`, not `src.ts`; smoke 4 `:2013`, smoke 18 `:2659` | ✅ |
| FDSC-35 | `Discard all` in a header while ≥1 change; lists the whole list | smoke 6 `:2093`: `allLabel === 'Discard all'`, rows = tree rows as a set | ✅ |
| FDSC-36 | ↶ titled `Discard changes` on hover or focus, before the glyph; hidden otherwise | smoke 5 `:2056`: file `hidden → hover visible → off hidden → focus visible`, folder `hidden → hover visible` | ✅ |
| FDSC-37 | ↶ click opens the confirmation for the row, no tab opens | smoke 5: `sameList(hovered?.rows, [fx.notes]) && tabsAfter === tabsBefore` | ✅ |
| FDSC-38 | Each uncommitted All changes section header has a ↶ titled `Discard changes` | smoke 8 `:2193`: `headers.every((h) => sameList(h.discards, ['Discard changes']))` (12 of 12) | ✅ |
| FDSC-39 | Section ↶ opens the confirmation for that file; no fold change | smoke 8: `sameList(fromSection?.rows, ['discard/mod.ts']) && expandedAfter === expandedBefore` | ✅ |
| FDSC-40 | Diff to origin: no menu, no row ↶, no `Discard all`, no section ↶ | smoke 9 `:2258`: `originMenu === null && originControls.undo === 0 && originControls.all === 0 && originSections.undo === 0` | ✅ |
| FDSC-41 | Commit tab sections show no ↶ | smoke 9: `commitSections.sections > 0 && commitSections.undo === 0` | ✅ |
| FDSC-42 | Request carries worktree + changes only; main restores to `HEAD` | Type: `src/shared/ipc-contract.ts:194-197` (`req: { worktreePath; entries }`); `file-discard.test.ts:269`: every call's args before `--` equal `['--literal-pathspecs','restore','--source=HEAD','--staged','--worktree']` | ✅ |
| FDSC-43 | Untracked `dir/` row: one row under the Recycle Bin heading, whole folder binned, inner file tabs close | `file-discard.test.ts:417` (folder in bin whole); `discard-view.test.ts:24` (row → `dir/`), `:69` (untracked → recycle), `:207` (closes `file:dir/a.txt`, `file:dir/sub/b.txt`, not `dirx`) | ✅ |
| FDSC-44 | Untracked already gone → discarded, not kept | `file-discard.test.ts:436`: result `{ path: 'vanished.txt' }`, `seen` → `[]` | ✅ |
| FDSC-45 | Acts on the files it listed; list refreshes after | smoke 18 `:2659`: dialog rows exactly the two `.md` files, late file kept and listed afterwards | ✅ |
| FDSC-46 | No commit yet: added file binned, index entry removed | `file-discard.test.ts:449`: `inBin('first.ts')`, `ls-files` → `''` | ✅ |
| FDSC-47 | Occupied restore target binned first; refused → entry kept | `file-discard.test.ts:527`, `:544` (deleted path), `:579` (rename's old path) | ✅ (see spec-precision gap 2) |
| FDSC-48 | Git fails after the Recycle Bin → kept with git's first line, file stays binned | `file-discard.test.ts:464`: detail `'fatal: simulated unstage failure'`, `inBin('added.ts')` | ✅ |
| FDSC-49 | 300 files × 120 chars all discarded | `file-discard.test.ts:241`: no kept entries, porcelain `''`, longest call `< 32767` | ✅ |
| FDSC-50 | `UU` restored like a modified file | `file-discard.test.ts:175`: from a real merge, porcelain `''`, content `'ours\n'` | ✅ |
| FDSC-51 | `index.lock` held → kept with git's line, shown under `Some changes were kept` | `file-discard.test.ts:196`: `detail` contains `index.lock`, file unchanged; smoke 17 `:2608` | ✅ |

**Status**: 51/51 ACs covered with spec-anchored assertions.

### SPEC_DEVIATIONs judged

- `src/renderer/src/components/FileTree.tsx` (ChangedRows): the row is a `div` that takes the click, and the name alone is the `button.file-tree-open`. FDSC-36 and FDSC-37 still hold. Hover and focus visibility is proven by smoke 5; focus reaches the row through the name button (`:focus-within`). The ↶ calls `stopPropagation`, so no tab opens (smoke 5, `tabsAfter === tabsBefore`). Enter on the name bubbles one click to the row, so keyboard opening still works.
- `src/renderer/src/components/DiffSection.tsx`: the header is a `div` with the click, and `button.diff-section-toggle` holds only the chevron. FDSC-39 holds. Smoke 8 keeps `aria-expanded` unchanged, and sensor S5 (the ↶'s `stopPropagation` removed) was killed by that same check (see below). The toggle button stays the keyboard route to fold a section. Its click bubbles to the header once, so a keyboard press toggles once.
- Neither deviation changes an observable outcome in the spec. Both keep #131's DOM structure, which that feature's own checks measure.

### Beyond-spec behaviour judged

- `file-discard.ts:167-170`: when `lstat` fails with anything but `ENOENT`, the entry is kept with cause `recycle-bin`. This is conservative: nothing is moved or restored, which matches FDSC-17 and FDSC-18. But the reason shown is `The Recycle Bin refused it.`, and the Recycle Bin was never asked. No test covers it (sensor U15 survived). Recorded as a follow-up, not a defect.

---

## Discrimination Sensor

Real-tree `git status --porcelain` was empty before the sensor and empty after every run, unit and smoke.

### Unit mutants

Run in a detached scratch worktree (`git worktree add` plus `npm ci --ignore-scripts`). Each mutant replaced one exact string, asserted to match once, ran the listed test file, and restored the file.

| # | Where | Mutation | Result | Killed by |
| - | ----- | -------- | ------ | --------- |
| U1 | `file-discard.ts:24` | restore drops `--staged` | ✅ killed | `file-discard.test.ts:98`, `:113`, `:175`, `:269` |
| U2 | `file-discard.ts:24` | restore without `--literal-pathspecs` | ✅ killed | `:137`, `:269` |
| U3 | `file-discard.ts:168` | `ENOENT` counted as kept | ✅ killed | `:436`, `:113`, `:499` |
| U4 | `file-discard.ts:171` | link check removed | ✅ killed | `:402` |
| U5 | `file-discard.ts:82` | git runs for entries the Recycle Bin refused | ✅ killed | `:384`, `:513`, `:544` |
| U6 | `file-discard.ts:102` | no per-entry retry after a failed chunk | ✅ killed | `:154` |
| U7 | `file-discard.ts:33` | chunk budget 80000 (past the command line) | ✅ killed | `:241` |
| U8 | `file-discard.ts:141` | added file: no unstage | ✅ killed | `:343`, `:449`, `:464` |
| U9 | `file-discard.ts:141` | added file restored from HEAD instead of unstaged | ✅ killed | `:449`, `:464` |
| U10 | `file-discard.ts:148` | rename restores the old path only (new path left in the index) | ✅ killed | `:499`, `:579` |
| U11 | `file-discard.ts:136` | old path outside the worktree not checked | ✅ killed | `:560` |
| U12 | `file-discard.ts:90` | unstage failure reports the whole message, not the first line | ✅ killed | `:464` |
| U13 | `file-discard.ts:147` | occupied deleted path not binned first | ✅ killed | `:527`, `:544` |
| U14 | `file-discard.ts:173` | `trash` replaced by `fs.rm` (permanent delete) | ✅ killed | `:329`, `:343`, `:363`, `:384` |
| U15 | `file-discard.ts:169` | `lstat` non-`ENOENT` failure skipped instead of kept | ❌ survived | none (beyond spec; Follow-up F1) |
| U16 | `file-discard.ts:143` | modified file binned before restore | ✅ killed | `:84`, `:98`, `:137`, `:154` |
| U17 | `file-discard.ts:80` | Recycle Bin refusal ignored | ✅ killed | `:363`, `:384`, `:402`, `:513` |
| P1 | `worktree-manager.ts:466` | old path left quoted | ✅ killed | `worktree-manager.test.ts:291` |
| P2 | `worktree-manager.ts:468` | old path dropped | ✅ killed | `:268`, `:282`, `:291` |
| V1 | `discard-view.ts:121` | `renamed` grouped with restores | ✅ killed | `discard-view.test.ts:69`, `:170` |
| V2 | `discard-view.ts:117` | a staged rename later deleted on disk (`RD`): new path's file tab re-read instead of closed | ❌ survived | none (Follow-up F2) |
| V3 | `discard-view.ts:92` | kept entries settle tabs too | ✅ killed | `:180` |
| V4 | `discard-view.ts:24` | folder prefix without `/` | ✅ killed | `:36` |
| V5 | `discard-view.ts:13` | folder row not matched to `dir/` | ✅ killed | `:24` |
| V6 | `discard-view.ts:99` | rename's old path not re-read | ✅ killed | `:170` |
| V7 | `discard-view.ts:96` | binned folder's inner file tabs stay | ✅ killed | `:207` |
| V8 | `discard-view.ts:38` | groups keep request order | ✅ killed | `:84` |
| V9 | `discard-view.ts:97` | binned file's tab re-read instead of closed | ✅ killed | `:154`, `:170` |
| V10 | `discard-view.ts:94-95` | uncommitted diff tab not closed | ✅ killed | `:141`, `:154` |
| V11 | `discard-view.ts:47` | always plural label | ✅ killed | `:101` |
| D1 | `diff-view.ts:54` | rename's original read at the new path | ✅ killed | `diff-view.test.ts:78` (and FDIF-05's test) |

**Unit**: 31 injected, 29 killed, 2 survived. Neither survivor is a behaviour an AC states.

### Smoke mutants (budget 5)

Chosen for the riskiest behaviours: discard offered in a read-only mode, the wrong files listed, data loss, and the section-header deviation. Each ran through a script that copied the file to `.orig`, applied the mutant (asserted to match once), seeded, launched a fresh app with a throwaway `--user-data-dir`, drove `SMOKE_ONLY=discard`, closed the app, ran `--clean`, and restored the file in `finally`.

| # | Where | Mutation | Result | Killed by |
| - | ----- | -------- | ------ | --------- |
| S1 | `FileTabs.tsx:312` | section ↶ passed in every mode (diff to origin included) | ✅ killed | smoke 9 `:2258` (51 of 51 diff-to-origin sections with ↶) |
| S2 | `FileTree.tsx:389` | `Discard all` shown in every diff mode | ✅ killed | smoke 9 `:2258` (`1 Discard all` in diff to origin) |
| S3 | `FileTree.tsx:297` | a folder row sends the whole uncommitted list | ✅ killed | smoke 4 `:2013` (dialog listed 12 files), smoke 18 `:2659` |
| S4 | `FilesView.tsx:73` | the confirmed request re-derived from the whole list instead of the listed entries | ✅ killed | smoke 11 `:2470` (status bar 12 → 0) and smokes 12-18 |
| S5 | `DiffSection.tsx:148` | section ↶ click no longer stops propagation (folds its section) | ✅ killed | smoke 8 `:2193` (`expanded true -> false`) |

**Smoke**: 5 injected, 5 killed, 0 survived. The first runs of S1 and S5 died before any check, when the fixture's own `git add` hit `index.lock: File exists` (Follow-up F3). Each was rerun once on a fresh seed and launch and was killed by the check named above. The unmutated focused run passed 18/18.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ Main process module 202 lines; renderer decisions are pure helpers in `discard-view.ts` |
| Surgical changes | ✅ Only files the tasks name; the parser change is the FDSC-24 fix |
| No scope creep | ✅ One beyond-spec branch (non-`ENOENT` `lstat`), and it is conservative |
| Matches patterns | ✅ Dialog reuses the remove-worktree classes; session rule matches `WorktreeDetail` |
| Spec-anchored outcome check | ✅ Literal strings and git state asserted, not "a call happened" |
| Per-layer coverage | ✅ Main: real git plus a staged Recycle Bin; renderer: pure helpers; UI: CDP smoke per gesture |
| Every test maps to a requirement | ✅ Every new test names an FDSC ID, apart from the plain unstaged-edit case and the tree-order case, which support FDSC-04 and FDSC-10 |
| Documented guidelines | ✅ `.specs/LESSONS.md` lessons applied (L-020 recording runner, L-025 edge-case IDs, L-026 pinned git config; also the one-status-per-row rule tasks.md cites as L-054, a number from another branch) |

---

## Edge Cases

All nine edge cases (FDSC-43..51) carry their own test; see the AC table.

---

## Spec-Precision Gaps

1. **FDSC-10 vs FDSC-11, list order.** FDSC-10 says "in the order the tree shows them", and FDSC-11 splits the list under two headings. The code orders by tree within each group and shows the Recycle Bin group first. Smoke 6 asserts per-group tree order. The spec never says the order is per group.
2. **FDSC-47 for a rename.** When the file sitting at a rename's old path is refused, the rename's new file has already gone to the Recycle Bin (it is binned first, per FDSC-27). The entry is reported kept and the index still holds the rename, but the new file is in the Recycle Bin, not on disk. Nothing is lost, since it is recoverable. But "kept" here does not mean "stays as it was" (FDSC-18's wording), and the spec does not say which applies.
3. **FDSC-22 and folder rows.** FDSC-22 covers an untracked entry that is itself a link. An untracked folder row (`dir/`, FDSC-43) that contains a link or junction goes to the Recycle Bin whole, with the link inside. Moving it does not touch the target, but the spec does not say whether a link nested in a binned folder is allowed.
4. **FDSC-42 and FDSC-45, which worktree.** The request names the currently selected worktree (`use-files.ts`, `discard`), not the worktree the entries were listed from. The modal backdrop covers the whole window, so no click can switch worktrees while the dialog is open. The spec does not pin the pairing, though.

---

## Follow-ups

These do not change the verdict under the owner's budget rules: the production code is correct, and every AC has evidence.

- **F1 (unit survivor U15)**: a non-`ENOENT` `lstat` failure keeps the entry with cause `recycle-bin`, and nothing tests it. Either add a test that injects `lstat` rejecting with `EACCES` and asserts the entry is kept and untouched, or give it its own cause and reason text. `The Recycle Bin refused it.` is not true there.
- **F2 (unit survivor V2)**: `afterDiscard` closes the new path's file tab for a `deleted` entry that carries `oldPath` (a staged rename whose new file was then deleted, `RD`). No test pins it. Add an `afterDiscard` row for `changed('new.ts', 'deleted', 'old.ts')`.
- **F3 (smoke flake, fixture race)**: `writeDiscardFixture` runs `git add` / `git mv` against the seeded repo while the app's own git status reads run. In 2 of 8 runs it died on `index.lock: File exists` before any check. A retry or a wait inside the fixture's `git` helper would make the focused run reliable.
- **F4 (thin evidence, author-flagged, confirmed)**: smoke 7 (FDSC-12). Both ad-hoc sessions are titled `Ad-hoc · app`, so the title cannot tell which one is named. Only the count (1, the stopped one excluded) tells them apart. A distinct title per session would pin it.
- **F5 (thin evidence, author-flagged, confirmed)**: smoke 11 (FDSC-33) tells the two `mod.ts` diff tabs apart by count only (2 → 1). It does not prove the survivor is the diff-to-origin one; the unit test `discard-view.test.ts:197` does.
- **F6 (thin evidence, author-flagged, confirmed)**: smoke 11 (FDSC-31) needs a Refresh click before its baseline, because the status bar counter has no watcher on this branch chain. After that, `countBefore - 1` is a real state change caused by the discard. S4 moved it to 0, so the check discriminates.
- **F7 (robustness, from gap 4)**: bind a pending discard to the worktree path it was listed from, and send that path, so a selection change from outside the UI can never aim the entries at another worktree.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FDSC-01..51 | Implemented | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 51/51 ACs matched the spec's outcome; 4 spec-precision gaps flagged
**Sensor**: unit 29/31 killed (2 beyond-AC survivors, F1 and F2); smoke 5/5 killed
**Gate**: 1840 passed, lint 0 errors / 18 warnings

**Next steps**: The orchestrator commits this report. F1-F7 are optional follow-ups; F3 is worth doing before the next smoke-heavy change.
