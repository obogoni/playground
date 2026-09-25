## Validation: files-diff — PASS

**Date**: 2026-09-20
**Spec**: `.specs/features/files-diff/spec.md` (FDIF-01..32)
**Design**: `.specs/features/files-diff/design.md` (incl. Spike Findings, three T-amended signatures)
**Diff range**: `72d6e98..HEAD` — 31 commits, 35 files, +5550 / −170
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree
**Decisions in scope**: AD-025, AD-032, AD-033, AD-035

---

## Task Completion

Every task T1–T21 is checked off in `tasks.md` with a `>` note. Nothing is blocked or partial.
Spot-checks of the notes against the tree, rather than trust in them:

| Task | Claim checked | Finding |
| ---- | ------------- | ------- |
| T1 | Spike findings recorded, throwaway mount removed | `design.md` § Spike Findings carries four measured rows; no spike code in `src/`. Alt+F5 / Shift+Alt+F5 is what ships (`FileTabs.tsx:41-44`), not F7 |
| T5 / AD-035 | Revision read with `cat-file --filters` when the other side is the disk | `file-diff.ts:108-109`, `:150-156`. Two tests pin both directions (`file-diff.test.ts:357`, `:377`) |
| T14 | `followAppTheme` moved out of `CodeViewer` | Removed from `CodeViewer.tsx`, now `FilesView.tsx:46-52` as `useEffect(() => followAppTheme(), [])` with the disconnect as cleanup. One observer per direction, not per editor |
| T18 / AD-033 | The 250 ms solution deferral and 3 s relaunch guard survive | `FileTree.tsx:208-211, 223-232, 254-278`. The deferred action still calls `openInTab`, which now branches on mode. Guard and window untouched |
| T20 | The FXPL-14 caption and its flag are gone end to end | `grep -rn "fromDiffMode\|code-viewer-note" src/` → nothing. The one remaining hit is `smoke-files.mjs:656`, which asserts the element is `null` — a negative check, correct |
| — | `FileStat.uncountable` replaced the conflating boolean | `shared/files.ts` `uncountable?: 'binary' \| 'too-large'`; set at `file-diff.ts:251` and `:279`; consumed at `diff-view.ts:133` and `DiffSection.tsx:155-158`. Both reasons pinned by `diff-view.test.ts:189-200` |

---

## Spec-Anchored Acceptance Criteria

Citations are re-derived, not copied from `tasks.md` (whose `:NN` citations predate later
insertions and no longer land). `smoke` = `scripts/smoke-files-diff.mjs`, numbered by the order
`check()` fires.

### P1: Diff one file

| Criterion | Spec-defined outcome | `file:line` + assertion | Verdict |
| --------- | -------------------- | ----------------------- | ------- |
| 01 diff-to-origin opens merge-base → `HEAD` | original `{rev: mergeBase}`, modified `{rev:'HEAD'}`; those exact contents | `diff-view.test.ts:36` — `expect(request).toEqual({original:{rev:'abc1234',path:'src/app.ts'},modified:{rev:'HEAD',path:'src/app.ts'}})`; `file-diff.test.ts:226-227` — `toMatchObject({kind:'text',text:'base one\nbase two\n'})` vs `'head one\nhead two\n'`; smoke 3 | PASS |
| 02 uncommitted opens `HEAD` → disk | original `{rev:'HEAD'}`, modified `{disk:true}` | `diff-view.test.ts:45` — `toEqual({original:{rev:'HEAD',…},modified:{disk:true,…}})`; `file-diff.test.ts:238-239` — `'head one\nhead two\n'` vs `'edited on disk\n'` | PASS |
| 03 added / untracked → empty original | `original: null` → side `{kind:'absent'}` | `diff-view.test.ts:55-56` — `toEqual({original:null,…})` for both statuses; `file-diff.test.ts:250` — `expect(sides.original).toEqual({kind:'absent'})` | PASS |
| 04 deleted → empty modified | `modified: null` → `{kind:'absent'}` | `diff-view.test.ts:62`; `file-diff.test.ts:260` — `expect(sides.modified).toEqual({kind:'absent'})` | PASS |
| 05 rename reads original from `oldPath` | original path = `oldPath` | `diff-view.test.ts:72-75` — `original:{rev:'abc1234',path:'src/gadget.ts'}`; `file-diff.test.ts:270` — original text is the pre-rename file's | PASS |
| 06 binary / >1 MB → placeholder, no editor | `too-large` by size **without reading**; `binary` on a NUL | `file-diff.test.ts:287-288` — `toEqual({kind:'too-large',size:big.length})` **and** `expect(calls.map(a=>a[0])).toEqual(['cat-file'])`; `:302` — `toEqual({kind:'binary',size:8})`. Renderer half structural: `DiffViewer.tsx:111,118,224,265-275` returns `FilePlaceholder` before the mount effect can run | PASS (renderer half structural) |
| 07 both sides read-only | typing changes nothing on either side | smoke 8 dispatches real mouse + `QQQ` key events and compares rendered text, with an explicit anti-vacuity guard (`beforeTyping.length >= 2 && …some(s=>s.trim().length>0)`, and a "the check proves nothing" detail line). Options: `DiffViewer.tsx:133-137` `readOnly`, `originalEditable:false`, `domReadOnly`. **See open item 2 — the two click targets are both drawn from the first pane** | PASS with caveat |
| 08 diff tab keyed by (mode, path), distinct from a file tab | three distinct keys | `diff-view.test.ts:92` — `expect(new Set(keys).size).toBe(3)`; `:110-112` — `isSameTab` true/false/false | PASS |
| 09 a mode switch does not change what a tab compares | the tab keeps its own mode | `diff-view.test.ts:147` — `toEqual([ALL_CHANGES_KEY,'diff:since-base:src/app.ts'])` while rendering `'uncommitted'`; mode is stored on the tab (`use-files.ts:33-36`) and the stack alone is remounted per mode (`FileTabs.tsx:280`) | PASS |
| 10 no plain file view from a diff mode | no `.code-viewer` editor on a diff click | smoke 3 — `modified.fileViewers === 0`; `smoke-files.mjs:660` — `fileViewer === 0 && caption === null`; `FileTree.tsx:250-259` has no path to `openFile` outside `lens === 'full'` | PASS |

### P1: Read a diff comfortably

| Criterion | Spec-defined outcome | `file:line` + assertion | Verdict |
| --------- | -------------------- | ----------------------- | ------- |
| 11 side by side by default | absent preference = side by side | `use-files.ts:167` — `ui.diffLayout ?? 'side-by-side'`; `DiffViewer.tsx:144`. No assertion; hand check B in the smoke's own list | Structural only |
| 12 toggle switches every open diff; persists | config holds `'inline'`; every diff re-rendered | smoke 11 — `persisted.layout === 'inline'` read back through `config:get`; smoke `--after-restart` — `inline.pressed === 'true'`. The *render* half is `DiffViewer.tsx:240-245` `updateOptions({renderSideBySide})`, unasserted | PASS (persistence); render half structural |
| 13 unchanged runs fold into a counted strip | `hideUnchangedRegions` on with context | `DiffViewer.tsx:148-153` — `{enabled:true,revealLineCount:20,minimumLineCount:3,contextLineCount:3}`. Measured in T1: 2000 lines → **15 rendered lines, 4 fold widgets** (`design.md` § Spike, row 2) | PASS (spike-measured + structural) |
| 14 activating a strip reveals the lines | the hidden lines appear | Spike row 4 measured content-size events **after clicking a fold widget** (9 / 8), which is the reveal firing. No scripted check | Spike-measured only |
| 15 whitespace shown; EOL change as a strip + per-line markers | strip names change and count, e.g. `CRLF → LF on 12 lines`; a marker per line | wording: `diff-view.test.ts:269` — `toBe('CRLF → LF on 12 lines')`, `:273` singular, `:279` no-direction case, `:286` `null`. lines: `file-diff.test.ts:39-43` — `toEqual({lines:[1,2,3],from:'CRLF',to:'LF'})`; `:52` mixed-file `[100,200,300,400]`; `:69` CR side; `:76` last line gains a terminator; `:85` inserted line excluded; `:330-332` end to end through `readDiffSides`. Rendering: smoke 9 — `strip.length > 0 && markers > 0` | PASS |
| 16 whitespace toggle hides trim changes **and** the strip and markers; persists | strip `null`, markers `0`; config `true` | smoke 10 — `eolHidden.strip === null && eolHidden.markers === 0` (a genuine before/after against smoke 9); smoke 11 — `ignoreWhitespace === true` in the config. `ignoreTrimWhitespace` at `DiffViewer.tsx:145,243`; both gates on the same flag at `:250` and `:277` | PASS |

### P1: See every change at once

| Criterion | Spec-defined outcome | `file:line` + assertion | Verdict |
| --------- | -------------------- | ----------------------- | ------- |
| 17 a first, non-closable **All changes** tab in both diff modes | present, first, no close button | `diff-view.test.ts:123-127` — first in both modes; `:140-141` never twice; `files-view.test.ts:98-108` — `tabsAfterClose` refuses the key and keeps the focus; smoke 2 — `labels.includes('All changes') && fixed === 1 && closable === 0` | PASS |
| 18 not shown in full-folder mode | absent | `diff-view.test.ts:134` — `toEqual(['file:src/app.ts','diff:uncommitted:src/lib/util.ts'])`; smoke 1 — `!inFolder.includes('All changes')` | PASS |
| 19 one collapsible section per file, tree order, headed by path + status + counts | all four header parts | Section count and `data-path`: smoke 12, smoke 18. Header parts structural: `DiffSection.tsx:139-151` (status pill, path, `+added`/`−removed`). Tree order: `AllChangesTab.tsx:33-48` `inTreeOrder`, pure and untested — see open item 8 | PASS (header + order structural) |
| 20 stack header with file count and totals | totals equal git's | `diff-view.test.ts:186` — `toEqual({files:2,added:16,removed:43})`; `:199` — an uncountable file counts as a file with no lines; `file-diff.test.ts:152-157` — totals `toEqual(shortstat(…))` **with an `expect(expected.added).toBeGreaterThan(0)` anti-vacuity guard**; smoke 14 compares the rendered header against `git diff --shortstat` in the live repo | PASS |
| 21 >10 files → only the first 10 expanded | exactly 10 | `diff-view.test.ts:168-173` — first ten of 40, and `has('src/file-11.ts')` is `false`; `:177-178` boundary at 7 and 10; smoke 12 — `stack.sections >= 40 && stack.expanded === 10` | PASS |
| 22 no editor for a collapsed or unscrolled section | mount set = expanded ∩ near-viewport, capped 12, farthest dropped first | `diff-view.test.ts:298` — `toEqual({mount:['s3'],unmount:[]})` (s1/s4/s5 expanded but not visible are **not** mounted — the viewport half); `:306` — cap trims to `s1`; `:313` — farthest-first with `cap 3`; `:319-320` — a collapsed section is never mounted and one that closes is dropped. smoke 13 / 15 — see open item 3 | PASS (unit); smoke checks weaker than labelled |
| 23 binary / >1 MB section → placeholder, not an editor | placeholder in place of the editor | `DiffSection.tsx:112` (no `files:diff-sides` round trip) and `:154-158` (`FilePlaceholder kind={stat.uncountable}`). No scripted check — the seeded binary and 2 MB files are unchanged on the branch, so no stack section holds one | Structural only |
| 24 empty list → say there are no changes | a sentence, not an empty stack | `AllChangesTab.tsx:283-290` — "Nothing has changed in this mode."; the data half at `file-diff.test.ts:170` and `:175` — `toEqual([])` for a clean worktree and for full-folder mode | PASS (data); wording structural |

### P2: Move through changes and reach the file

| Criterion | Spec-defined outcome | `file:line` + assertion | Verdict |
| --------- | -------------------- | ----------------------- | ------- |
| 25 next / previous change, by button or VS Code's shortcut | the nearest change past the cursor, either way | `diff-view.test.ts:215-219` — from line 4 of `[4,12,20]` → **12** (cursor-exclusive); `:223` — from 20 backward → **12** (a three-change fixture, chosen because the two-change one could not fail); buttons `FileTabs.tsx:224-243`, key `:41-44` `Alt+F5` / `Shift+Alt+F5` matching T1's read of VS Code's own build | PASS |
| 26 past a file's last change → first change of the next file, expanding it | cross-file target with `expand: true` | `diff-view.test.ts:231-235` — `toEqual({path:'src/c.ts',line:7,expand:true})`; `:239` backward mirror; `:247-248` stays put at both ends; `:252-261` walks over an identical file. Wiring: `AllChangesTab.tsx:213-228`. smoke 16 — see open item 4 | PASS |
| 27 **Open file** opens F1's file tab for the same path | a file tab appears for that path | `FileTabs.tsx:245-254` — `onClick={() => files.openFile(diffTab.path)}`; the key differs from the diff tab's (`diff-view.ts:79`), so the diff tab survives. smoke 7 asserts only that the control **exists** | PASS (presence asserted; the open itself structural) |
| 28 deleted file → no **Open file** | control absent | smoke 7 — `deleted.openFile === false && modified.openFile === true` (both polarities in one assertion); `FileTabs.tsx:245` — `diffTab.changed.status !== 'deleted'` | PASS |
| 29 the launcher row acts on a diff's file as on a file tab | `launchTarget` = the diff tab's path | `use-files.ts:515-519` — `focused` is any tab and feeds `launcherTarget`; `FileTabs.tsx:258-272` renders the row unconditionally. **No assertion anywhere — no unit test, no smoke check, no recorded hand check.** See open item 1 | No verification evidence |

### P2: Stay current

| Criterion | Spec-defined outcome | `file:line` + assertion | Verdict |
| --------- | -------------------- | ----------------------- | ------- |
| 30 a disk change updates the diff within 1 s, keeping the scroll | the new text is visible; scroll unchanged | smoke 17 — appends a line from the Node side and asserts `refreshed.includes('appended by the smoke')`. Scroll restore at `DiffViewer.tsx:229-237`, unasserted; the wait is 1500 ms, so "within 1 s" is not measured. Routing at `use-files.ts:343-354` | PASS with caveat (open item 5) |
| 31 an index / `HEAD` change refreshes every open diff and the stack | the committed file leaves the stack | smoke 18 — `beforeCommit.some(p => p.includes('modified.ts')) && !afterCommit.some(…)` — a real before/after around a live `git commit`. `use-files.ts:339-342`; a path that left `sections` is unmounted by `mountPlan` (`diff-view.ts:256`) | PASS |
| 32 a base change re-renders diff-to-origin diffs and the stack | every `since-base` tab re-read against the new merge base | `use-files.ts:314-320` — effect keyed on the **resolved** `mergeBase`, walking `tab.mode === 'since-base'` only; `AllChangesTab.tsx:78-81` re-derives `requests` from the new `mergeBase`. No assertion | Structural only |

**Coverage**: 32 criteria. 25 carry an assertion whose asserted value matches the spec-defined
outcome. 6 are structural or spike-measured only (11, 14, 19 partly, 23, 24 partly, 32). 1 —
**FDIF-29** — has no verification evidence of any kind.

---

## Edge Cases

- [x] Base no longer resolves → F1's prompt, not a stale diff — `diff-view.test.ts:80` `toBeNull()`, rendered at `FileTabs.tsx:76-78`
- [x] A section far out of view may be unmounted and remounted, keeping expansion — `diff-view.test.ts:313`; expansion is held in `AllChangesTab.tsx:88-89`, independent of the mount set
- [x] A file whose sides are identical is walked over — `diff-view.test.ts:251-262`
- [~] Mode-bit-only change → "the content is identical" — `DiffViewer.tsx:181-183, 286` renders it; the `.identical` class is read by smoke 3's probe but never asserted. Structural
- [~] Identical after whitespace is hidden → say so — same code path (`updateOptions` re-fires `onDidUpdateDiff`). Structural
- [ ] A file both committed on the branch and edited on disk shows only the committed change in one mode and only the edit in the other — **no evidence.** It follows from `diffRequestFor`'s two branches (both tested in isolation), but the two-modes-on-one-file case is asserted nowhere

---

## Discrimination Sensor

Run in a throwaway `git worktree add --detach` under `%TEMP%\fdif-sensor`, with `node_modules`
junctioned in. The real tree was never touched: `git status --porcelain` was empty before and is
empty after, and `git worktree list` shows only `D:/playground-main`. No `git stash`, no `git reset`.
Each mutant was applied by exact-anchor replacement, the file byte-restored and re-verified equal
before the next one.

**Baseline** (unmutated scratch, same command): `Test Files 2 passed`, `Tests 54 passed`, **exit 0**.
Kills are keyed off exit code against that baseline, and each names the tests it killed — the
mutants produce *different* failing sets, which is what rules out the "every run errors identically"
trap.

| # | File | Mutation | Killed by | Exit |
| - | ---- | -------- | --------- | ---- |
| M1 | `src/main/file-diff.ts:108-109` | `asCheckedOut` forced to `false` — a revision is never read through the checkout filters (defeats AD-035) | `file-diff.test.ts` › "reports no ending change when only the checkout filter differs (AD-035)" **and** "still reports a real ending change the filter does not explain" | 1 — killed |
| M2 | `src/main/file-diff.ts:59-63` | prefix loop drops the `original[prefix].text === modified[prefix].text` guard, pairing lines by index | `lineEndingChanges` › "leaves out a line the text change added, and keeps the surviving ones" | 1 — killed |
| M3 | `src/main/file-diff.ts:241-244` | a rename is reported at its **old** path | `parseNumstat` › "reads a rename record as one file at its new path" | 1 — killed |
| M4 | `src/main/file-diff.ts:211` | untracked files left out of the uncommitted counts | `diffStats` › "counts an untracked file that numstat leaves out" | 1 — killed |
| M5 | `src/renderer/src/lib/diff-view.ts:41` | uncommitted modified side becomes `{rev:'HEAD'}` instead of `{disk:true}` | `diffRequestFor` › FDIF-02 **and** FDIF-03 | 1 — killed |
| M6 | `src/renderer/src/lib/diff-view.ts:258` | a visible section is mounted even while collapsed | `mountPlan` › "never mounts a collapsed section, and unmounts one that closes (FDIF-22)" | 1 — killed |
| M7 | `src/renderer/src/lib/diff-view.ts:187` | forward search made cursor-inclusive (`>` → `>=`) | `nextChangeTarget` › FDIF-25, FDIF-26 ×2, and the identical-file edge case | 1 — killed |

**Sensor depth**: 7 behaviour-level mutations, above the lightweight default, covering
`lineEndingChanges`, `readDiffSides`' AD-035 branch, `parseNumstat`, `diffStats` and three pure
rules of `diff-view.ts`.
**Killed 7 / 7, survived 0.** No fix task from the sensor.

---

## Gate Check

- **Build gate** (`tasks.md` § Gate Check Commands): `npx electron-vite build` — **green**, built in 9.07 s, `out/renderer` emitted
- **Full gate**: `npm run typecheck && npm run lint && npm test`
  - `typecheck` — clean (node + web)
  - `lint` — **0 errors, 18 warnings**, unchanged from the T1 baseline. Every warning is
    `prettier/prettier` in `scripts/smoke-agents.mjs` and `src/shared/tasks.test.ts`, neither
    touched by this branch
  - `npm test` — **1098 passed / 1098, 61 files, 0 failed, 0 skipped**, 75.4 s
- **Test count before the feature**: 1042 (recorded at T2, the first F2 commit that could move it)
- **Test count after**: 1098 — **delta +56**
- **Delta reconciled, not assumed**: `file-diff.test.ts` 23 + `diff-view.test.ts` 31 = 54 (confirmed
  by the scratch's isolated `54 passed`), plus 2 added to `files-view.test.ts`. 54 + 2 = 56. No test
  was deleted and none weakened
- **Rewritten checks**: `smoke-files.mjs` checks 16–17 were rewritten because FXPL-14 and FXPL-15
  were superseded. Verified this is not a red check painted green: both rewrites assert a genuine
  negative (`caption === null`, `placeholder === null`) plus the positive that replaced it
  (`diffEditor === 1`), and the script carries an explicit in-file note forbidding the other use

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | Pass — `file-diff.ts` is 327 lines for 10 ACs; the pure rules are one function each |
| No abstractions for single-use code | Pass — the one seam, `GitRunner` (`file-diff.ts:18`), exists because FDIF-06's "without reading" is unobservable otherwise and `TESTING.md` bans mocking libraries |
| Surgical changes | Pass — files outside a task's `Where` are each named and justified in that task's note, and each diff is the minimum (`App.tsx` is one line, `FilesView.tsx` two) |
| No scope creep | Pass — with one deliberate exception: `tokens.css`'s `color-scheme` is an app-wide fix for an app-wide defect the owner reported, recorded as such in `1196ae6` |
| Matches existing patterns | Pass — `ui.*` flat preference convention, F1's `FileContent`/`FilePlaceholder`/`tabsAfterClose`, the hand-rolled DI of `TESTING.md` pattern 3 |
| Would a senior engineer approve | Yes. `DiffRef` being revision-or-disk is the right generalisation and is already paid for by F3 |
| Tests map to ACs, non-shallow | Pass — spot-checked "See every change at once": all four of its testable rules have distinct fixtures, and `totals`' uncountable test deliberately carries **non-zero** counts beside the flag so the rule is checked rather than a coincidence of zeroes |
| Spec-anchored outcome check | Pass for 25/32; 6 structural, 1 without evidence — listed above |
| Per-layer Coverage Expectation | Pass with one qualification — the matrix routes renderer components to the smoke, and the pure decisions were genuinely extracted to `diff-view.ts` rather than left in components. `inTreeOrder` is the single exception (open item 8) |
| No unclaimed tests | Pass — all 56 new tests name an FDIF id, a listed edge case, or a Done-when criterion |
| Documented guidelines followed | `.specs/codebase/TESTING.md` (no mocking libraries, real git in temp repos, CDP smoke for renderer), `vitest.config.ts` |

**The four post-smoke fixes, judged independently:**

| Commit | Judgment |
| ------ | -------- |
| `8367c8d` — the stack closing behind the walk | Sound. `AllChangesTab.tsx:214` now seeds from `openRef.current`, matching `onToggle` at `:258`. Searched for the same shape: those two are the only writers of `expanded`, and both seed identically |
| `b0ab333` — `flex: none` on `.diff-section` | Sound. Searched every flex column this feature added: `.all-changes-header` `:16`, `.diff-viewer-eol` `:216`, `.diff-viewer-note` `:224` all already declare `flex: none`, and the two intended growers (`.all-changes-stack`, `.diff-viewer-editor`) declare `flex: 1` with `min-height: 0`. No other child of a flex column is left at the `1 1 auto` default |
| `1196ae6` — `color-scheme` | Sound and correctly scoped. `index.html` ships `<html data-theme="dark">` and `App.tsx:195` writes `ui.theme` into it, so both `:root[data-theme='dark']` and `:root[data-theme='light']` always match; the bare `:root` fallback never governs in practice. Root is the right place for a whole-app defect, and there is no second declaration to conflict |
| `891668f` — the codicon font | Sound. The alias is renderer-only, which is correct: no unit test imports `monaco-setup.ts`, so the vitest resolver never needs it, and `npm test` confirms that. The build emits the face. The marker moving from `¶` to a bordered shape is a real improvement, since the glyph margin inherits Monaco's font stack rather than the app's — and it is the only lettered glyph this feature introduced |

---

## Open Items, Ranked

None of the following is a wrong behaviour, a failing gate, or a surviving mutant. They are
evidence and documentation gaps.

1. **FDIF-29 has no verification evidence at all** — Minor, does not block. No unit test, no smoke
   check, and not in the smoke's two named hand checks. The implementation is one reuse of F1's
   `launcherTarget` (`use-files.ts:515-519`) whose own tests exist in `files-view.test.ts`, and the
   only new thing is a `DiffTab` supplying `{path, at}`, which typecheck enforces. *Fix*: one smoke
   check — open a diff tab and assert `.file-tabs-launcher[title]` equals the absolute path of the
   diff's file.
2. **FDIF-07's evidence exercises one pane, not two** — Minor, does not block. `smoke-files-diff.mjs:392-398`
   takes `paneBoxes` from the **first two `.view-line` elements in document order**, which in
   Monaco's side-by-side diff both belong to the original editor — and at that point the active tab
   is `removed.md`, whose modified side is empty. So `readOnly` (which governs the modified side) is
   not demonstrably exercised; the label says "Neither side". The three options at
   `DiffViewer.tsx:133-137` are explicit and `domReadOnly` covers both, so the risk is low. *Fix*:
   pick one line from each of `.editor.original` and `.editor.modified` instead of the first two.
3. **The two cap checks cannot exercise the cap** — Minor. Smoke 13 (`editors <= 12`) and smoke 15
   (`peak <= 12` across 25 wheels) run against a stack where only 10 sections are ever expanded, so
   live editors can never exceed 10 and the 12-cap is not binding. They do discriminate "mounts
   every section regardless of collapse" (44 > 12), which is worth having, but the label overclaims.
   The cap itself is properly covered at `diff-view.test.ts:301-308`, and mutation M6 confirms that
   region is discriminating. *Fix*: expand more than twelve sections before measuring, or retitle.
4. **Smoke 16's disjunct weakens FDIF-26** — Minor. `navAfter.expanded > navBefore.expanded ||
   navAfter.scrollTop > navBefore.scrollTop` lets a within-file navigation pass on scroll alone. The
   recorded T21 run fired the strong disjunct (`10 → 13`), so the behaviour was seen; the standing
   check is weaker than the behaviour it names. *Fix*: drop the `scrollTop` disjunct.
5. **Smoke 17 is labelled FDIF-29 but tests FDIF-30, and tests two-thirds of it** — Minor. The
   comment and label at `smoke-files-diff.mjs:613,632` name FDIF-29; the check is FDIF-30. It waits
   1500 ms, so "within 1 s" is not measured, and "keep its scroll position" is not checked at all
   even though the restore code exists at `DiffViewer.tsx:229-237`. *Fix*: relabel, drop the wait to
   1000 ms, and capture `scrollTop` before and after.
6. **`inTreeOrder` is a pure function living in a component file, so the matrix excuses it from
   tests** — Minor. `AllChangesTab.tsx:33-48` is the sole evidence for FDIF-19's "in the tree's
   order". Every other pure decision in this feature was extracted to `diff-view.ts` and tested;
   this one was not. It is the only place the renderer boundary is load-bearing rather than
   incidental. *Fix*: move it beside `buildTree` in `files-view.ts` and add one test.
7. **`files-explore/spec.md` is internally inconsistent about FXPL-15** — Cosmetic. The criterion at
   `:121` is struck through as superseded, but its traceability row at `:218` still reads `Pending`,
   where FXPL-14's row at `:217` was updated. *Fix*: one cell.
8. **Design and task docs describe the pre-`uncountable` shape** — Cosmetic. `design.md` § Data
   Models still declares `FileStat { … binary: boolean }`, and T4's and T11's notes still speak of
   `binary: true`, though `556b57e` replaced it with `uncountable?: 'binary' | 'too-large'`. The
   three signatures amended in `d9ba868` did not include this one. *Fix*: amend the model block.
9. **`FilePlaceholder.tsx`'s docstring describes a kind that no longer exists** — Cosmetic.
   Lines 6-11 still explain `deleted` (FXPL-15) two lines above the union at `:12` that no longer
   contains it. *Fix*: delete the clause.
10. **Two spec edge cases have no evidence** — Minor. "A file both committed and edited on disk" and
    the two "content is identical" cases are structural only.

---

## Requirement Traceability

`spec.md` was **not edited** — this verification is read-only over the real tree, per the mandate.
The statuses it should take:

| Requirement | Previous | Proposed |
| ----------- | -------- | -------- |
| FDIF-01..10 | Pending | Verified (06 renderer half structural) |
| FDIF-11 | Pending | Verified — structural + hand check |
| FDIF-12..18 | Pending | Verified (14 spike-measured) |
| FDIF-19..22 | Pending | Verified (19 header/order structural) |
| FDIF-23, 24 | Pending | Verified — structural |
| FDIF-25..28 | Pending | Verified |
| FDIF-29 | Pending | Implemented, unverified — open item 1 |
| FDIF-30, 31 | Pending | Verified (30 partly — open item 5) |
| FDIF-32 | Pending | Verified — structural |

---

## Summary

**Overall**: Ready.

**Spec-anchored check**: 25/32 criteria carry an assertion whose asserted value matches the
spec-defined outcome; 6 are structural or spike-measured, consistent with the Test Coverage Matrix
routing renderer components to the smoke; 1 (FDIF-29) has no verification evidence.
**Sensor**: 7 mutations injected, 7 killed, 0 survived, each with a named killing test against a
verified-green baseline. Real tree unmodified before and after.
**Gate**: 1098 passed / 0 failed / 0 skipped, 61 files; typecheck clean; lint 0 errors / 18
pre-existing warnings; `npx electron-vite build` green; tree clean.

**What works**: both reference tables produced in main and asserted against real temp repositories,
including the two AD-035 directions that are the reason this feature is not pure noise on a Windows
machine; the fold, the navigation and the section sizing resting on APIs measured on the pinned
Monaco rather than remembered; a mount plan that is genuinely derived rather than accumulated; and
the whole tab-identity model pinned by tests that were rewritten twice, by the implementer, when
they turned out unable to fail.

**What a human still has to look at.** The evidence for the appearance of this feature is
structural — element counts, class names, config round-trips. It cannot see legibility. T21 is the
proof: the smoke passed 18/18 on a stack rendered as 44 unreadable stripes, with light scrollbars in
a dark app and every Monaco icon drawn as tofu. Specifically still unjudged by any check:
side-by-side against inline as the daily default (FDIF-11, the smoke's own hand check B); the
wording of the line-ending strip on a mixed file (hand check A); whether the folded "N unchanged
lines" strip reads as clickable and what unfolding looks like (FDIF-13/14); and whether the section
placeholder for a binary or oversized file sits legibly in the stack (FDIF-23).

**Next steps**: none blocking. Open items 1–6 are worth a short follow-up task on the smoke and one
extraction; 7–9 are single-line documentation corrections.
