## Validation: files-explore — PASS

**Date**: 2026-09-20 (round 3, final round of the bounded fix→re-verify loop)
**Spec**: `.specs/features/files-explore/spec.md`
**Design**: `.specs/features/files-explore/design.md`
**Diff range**: `09c4b4f..HEAD` (`f3b20ee`, branch `feature/files-explore`)
**Verifier**: independent sub-agent, round 3 — a different agent from rounds 1 and 2 and from the
implementer, read-only over the real tree. Neither earlier verdict was taken as given: every
criterion was re-derived from the spec, every cited `file:line` re-opened, the whole smoke re-read
adversarially, and six fresh mutations run in an isolated scratch worktree.

Round 3 closes the one criterion that blocked round 2 and the one mutant that survived it. The
FXPL-17 read-only check is no longer a property read off the DOM — it clicks into the text, types
through CDP and requires the content to be non-empty and byte-identical afterwards. That check can
fail, and the author falsified it before trusting it. The watcher's emit-time guard is now killed by
a test that runs a callback the event loop had already handed over, the one race `cancelBatch`
cannot win.

**34 criteria: 22 backed by an assertion that matches the spec outcome exactly, 12 partial or
spec-precision, 0 with no usable evidence.** Zero-evidence criteria were 6 in round 1 and 1 in
round 2; there are none now. All twelve partials are the recorded, carried Minors — none of them
blocks. Ranked pickup list for F2 is at the end.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T22 | ✅ Done | Unchanged; re-checked against the commit log, task for task |
| T15 | ✅ Done | `Tests: none` superseded by `a9d7f8c` — `formatSize`/`fileType` moved to `files-view.ts` and covered |
| T23 | ✅ Done | All three Done-when corrections rounds 1 and 2 opened are now genuinely backed: FXPL-06 by the second-worktree drive, FXPL-21's scroll half by its own check, FXPL-17's read-only half by the behavioural check of `f3b20ee`. 25 checks |
| Round-1/2/3 follow-ups | ✅ `c39fcb7`, `a9d7f8c`, `28639db`, `f3b20ee` | 23 tasks + 4 follow-up commits; working tree clean apart from this file |

One bookkeeping line still over-claims and should be corrected before merge — see Gap 1.

---

## What rounds 1 and 2 found, and what happened to it

| Gap | Round it was raised | Outcome |
| --- | ------------------- | ------- |
| G1 — `readForView`'s 1 MB ceiling untested (mutant M7 survived) | 1 | **Closed in round 2.** `file-reader.test.ts:57-63` reads exactly `MAX_VIEW_BYTES` as `text`. Stayed closed |
| G2 — `closeAll` never proved it cancels the batch (M9 survived) | 1 | **Closed in round 2.** `file-watcher.test.ts:191-205` expects `cancelled` `toEqual([BATCH_MS])` |
| G3 — `launcherTarget`'s tie untested (M14 survived) | 1 | **Closed in round 2.** `files-view.test.ts:103-108` pins the tie to the tab. Re-mutated in round 3 (M4): killed |
| G4 — FXPL-06 had no evidence at all | 1 | **Closed in round 2.** The seed builds a second worktree (`smoke:121-133`); checks at `:701` and `:720` switch away and back |
| G5 — FXPL-21's scroll half had no evidence | 1 | **Closed in round 2.** Own check at `:536`, on a 400-line file, scrolled by CDP `Input.dispatchMouseEvent`, asserting the first *rendered* line number |
| G6 — FXPL-14, 15, 18 unchecked | 1 | **Closed for 14 and 15** (`:648`, `:660`, exact-string). FXPL-18's "not restored after a restart" is structural — carried, see Gap 6 |
| G7 — FXPL-22 and FXPL-25 rested on nothing observable | 1 | **Closed in round 2.** `:675` watches the list gain a file created on disk; `:628` asserts exactly four launchers by name |
| G8 — `formatSize`/`fileType` untested | 1 | **Closed in round 2.** Both exported from `files-view.ts:127,144`, nine cases at `files-view.test.ts:154-193`. Re-mutated in round 3 (M2, M3): both killed |
| G9 — bookkeeping (34-row traceability, four mislabelled AC tags, STBR-31's stale popover clause) | 1 | **Closed in round 2.** `spec.md:236-239` carries 28a/28b and "34 total" |
| **G1r1/Gap 1r2 — FXPL-17's read-only clause asserted by a check that cannot fail** | 1, then **again** in 2 | **Closed in round 3** (`f3b20ee`). Detail below |
| Gap 2r2 — FXPL-17's highlighting half was `tokens > 0`, positive for plaintext | 2 | **Closed in round 3.** `smoke:397-401` asserts `viewer.classes > 1`, distinct `mtk` classes |
| Gap 3r2 — the watcher's emit-time stale-selection guard was unprotected (M6 survived) | 2 | **Closed in round 3.** `file-watcher.test.ts:175-189` re-runs the already-handed-over callback. Re-mutated in round 3 (M1): killed |
| Gap 4r2 — six half-covered criteria (FXPL-09, 11, 12, 16, 30, 32) | 2 | **Carried, never claimed fixed.** Still open, still Minor — Gap 5 |
| Gap 5r2 — FXPL-18's restart clause is structural | 2 | **Carried.** Gap 6 |
| Gap 6r2 — `backTabs.length === tabsBeforeSwitch.length` permits `0 === 0`; FXPL-14's label asserted without the content beneath it | 2 | **Carried.** Gap 4 |

### The FXPL-17 read-only check, verified rather than believed

The check now lives at `scripts/smoke-files.mjs:403-461`. Read as an adversary would:

- `textBeforeTyping` (`:409-414`) joins every `.view-line`'s `textContent`, NBSP-normalised.
- `firstLineBox` (`:415-425`) is the centre of the first rendered line.
- `:426-442` dispatches a real `mousePressed`/`mouseReleased` pair through CDP, then three
  `Input.dispatchKeyEvent` `keyDown`s **carrying `text`**. A `keyDown` with `text` set makes
  Chromium emit a char event — this is the same mechanism a real keypress uses, not a synthetic
  DOM event Monaco would ignore.
- `:450-461` requires **three** things at once: `textBeforeTyping.trim().length > 0`,
  `textAfterTyping === textBeforeTyping`, and `!textAfterTyping.includes('ZZZ')`.

Each of the three failure modes rounds 1–3 walked into is now individually blocked:

1. *Invariant DOM property.* Gone — no DOM property is read. The assertion is on the model's
   rendered text, which changes under any input path Monaco picks, `NativeEditContext` or
   `TextAreaEditContext` alike. Round 2's whole argument about `ime-text-area`'s hardcoded
   `readonly` attribute is now irrelevant to the check, which is the point.
2. *Vacuous skip.* If the viewer never mounted, `firstLineBox` is null and no typing happens — but
   `textBeforeTyping.trim().length > 0` then fails, because a missing `.view-line` is exactly a
   missing `textBefore`. The two conditions cannot both be satisfied by an unmounted viewer.
3. *Empty equals empty.* Same guard, with its own distinguishable detail string,
   `'NO CONTENT TO TYPE INTO — the check proves nothing'`.

**The author's falsification claim checks out by construction.** The two reported outputs —
`CONTENT CHANGED — not read-only` and `NO CONTENT TO TYPE INTO` — are reachable at `:456` and
`:454` respectively and *only* on those conditions: the first is emitted when and only when
`textAfterTyping !== textBeforeTyping`, which requires the typing to have reached the model.
Observing it therefore proves the click-and-type path works end to end in this app, which is the
one thing a reader cannot establish from the code alone. `CodeViewer.tsx:43-46` is where the
falsification was applied (`readOnly: true`, `domReadOnly: true`); flipping both makes the model
editable and nothing else in the drive prevents the edit. A third corroboration is incidental and
independent: the reported detail `content unchanged (24 chars)` is exactly
`'export const answer = 43'.length`, the seeded content of `src/main.ts` (`smoke:87`) and the file
open at that point in the drive. A check that never ran could not have printed that number.

Residual (Cosmetic, Gap 4): the check does not assert that the editor actually took focus. If a
click landed on the line but focus went elsewhere, the keystrokes would vanish and the check would
pass. That is a *conditional* soft spot, not an invariant one — and the falsification run is
positive evidence the condition holds. One extra term (`.monaco-editor.focused` present, or
`document.activeElement` inside `.code-viewer-editor`) would remove it.

### FXPL-17's highlighting half

`smoke:380-401` asserts `viewer.tokens > 0 && viewer.classes > 1`, where `classes` is
`new Set(spans.map(s => s.className)).size` over `.view-line span[class*="mtk"]`. Monaco emits
`mtk1` for every part of an untokenised line, so plaintext yields exactly one distinct class and
the check goes red — which is what the round-2 version could not do. `export const answer = 43`
under the TypeScript grammar produces keyword, identifier, operator and numeric classes, and the
recorded value is 4.

Precision note, not a gap: `classes > 1` proves *a* grammar tokenised the text, not that it was the
right grammar. Resolving `.ts` to JavaScript would still pass. The spec says "for the file's
language"; the exact grammar identity is a tighter assertion than any round has asked for, and
`languageForPath` is unit-covered separately.

---

## Spec-Anchored Acceptance Criteria

The Test Coverage Matrix (`tasks.md:30-37`) routes renderer components, hooks and Monaco setup to
the CDP smoke rather than unit tests. That boundary is accepted on the terms rounds 1 and 2 set: a
smoke check with a `file:line` and an expression that *can go false* counts as evidence; an
expression true regardless of the behaviour it names counts as zero, and worse than zero when a
Done-when box is ticked from it.

The smoke was **not re-run** — the sandbox forbids launching the app, CDP and any window operation.
All 25 checks were read instead and judged on whether each could fail. The `25/25` recorded in
`tasks.md` is taken at its word for what the script *does*.

| Criterion | Spec-defined outcome | `file:line` + assertion | Verdict |
| --------- | -------------------- | ----------------------- | ------- |
| **FXPL-01** Fifth `Files` direction, persisted like the other four | Segment present; `ui.direction` survives a restart | `smoke:269` — `hasSegment === true`; round-trip at `src/main/config-store.test.ts:52` — `expect(onDisk.ui.direction).toBe('board')` | ✅ PASS |
| **FXPL-02** Files + worktree → tree in a left column | The worktree's files listed as a tree | `smoke:317,324,335` — rows read from `.file-tree-name` | ✅ PASS |
| **FXPL-03** No worktree → empty state asking for a selection | An empty state; wording unspecified | `smoke:278-282` — `typeof empty === 'string' && empty.length > 0` | ⚠️ Spec-precision — the spec fixes no wording, so non-emptiness is the ceiling |
| **FXPL-04** Tracked + untracked-not-ignored, never an ignored file | `node_modules`/`build` absent, untracked present | `src/main/file-tree.test.ts:69` — `not.toContain('node_modules')`; `:75` — `toContainEqual({name:'notes.md',…})`; `smoke:317` — `!names.includes('build')`, `:324` — `names.includes('scratch.txt')`. Mutant M6 (drop `--exclude-standard`): killed | ✅ PASS |
| **FXPL-05** Expanding a folder loads that folder's children only | Direct children, not descendants | `file-tree.test.ts:81-85` — `toEqual([{name:'lib',…kind:'dir'},{name:'index.ts',…kind:'file'}])`; `smoke:335` — `names.includes('main.ts') && names.length > beforeExpand` | ✅ PASS |
| **FXPL-06** Changing the tree selection shows that worktree's tree, mode **and tabs** | Per-worktree tree, mode and tab set | `smoke:701` — `switched === true && otherMode === 'Folder' && otherTabs.length === 0`; `:720` — `backMode === 'Uncommitted' && backTabs.length === tabsBeforeSwitch.length` | ✅ PASS (length comparison caveat in Gap 4) |
| **FXPL-07** Mode selector at the top with three modes | Exactly three: full folder, diff to origin, uncommitted | `FileTree.tsx:272-284` renders `MODES`; no check asserts the selector's composition — each mode is proven only by a click landing (`smoke:342,360,545`) | ⚠️ Indirect |
| **FXPL-08** Diff mode lists only files changed between `merge-base(HEAD,base)` and HEAD | Committed changes only | `file-tree.test.ts:155` — `toBe(baseCommit)`; `:156-160` — `toEqual([{path:'a.txt',status:'modified'},{path:'new.txt',status:'added'}])`; `:167` — `not.toContain('other.txt')`; `smoke:349` | ✅ PASS |
| **FXPL-09** Show the base in use and let the user switch it | Base visible; switchable to another branch | `smoke:354-358` — `sinceBase !== null && sinceBase !== ''`; branch list at `file-tree.test.ts:218` — `toEqual(['main','origin/main','origin/release'])` | ⚠️ Half — the picker's `onChange` is never driven, and the displayed value is not compared to `origin/main` |
| **FXPL-10** With `origin/HEAD`, the base defaults to it | `defaultBase === 'origin/main'` | `file-tree.test.ts:206` | ✅ PASS |
| **FXPL-11** No `origin/HEAD` → picker asks for a base and the mode lists nothing | `defaultBase: null`; empty list until chosen | `file-tree.test.ts:212` — `toBeNull()` covers the first half; "lists nothing" lives at `use-files.ts:192` / `FileTree.tsx:329-331`, untested and unchecked | ⚠️ Half |
| **FXPL-12** Uncommitted mode lists exactly `worktrees:changes` paths, each with its status | Paths + per-file status | `smoke:364` — `names.includes('main.ts') && names.includes('scratch.txt')`; status carried through the nesting at `files-view.test.ts:27-43` — `status:'added'` / `status:'deleted'` | ⚠️ Half — the rendered status pill (`FileTree.tsx:133`) is asserted nowhere, and the check never asserts that an *unchanged* tracked file is absent, so "exactly" is untested |
| **FXPL-13** Returning to a worktree restores its last mode, persisted, defaulting to full | `{mode:'full'}` when unknown; stored value otherwise | `files-view.test.ts:120` — `toEqual({mode:'full'})`; `:126` — same for a missing worktree; `:132-135` — `{mode:'since-base',base:'origin/main'}`; end to end at `smoke:720`. Mutant M5 (default → `uncommitted`): killed | ✅ PASS |
| **FXPL-14** A file opened from a diff mode is labelled as a file view, not a diff | A visible label saying it is the file | `smoke:648` — `diffNote === 'Showing the current file, not a diff'` against `CodeViewer.tsx:83` | ✅ PASS (the "shows its current content" half is not separately asserted at that click — Gap 4) |
| **FXPL-15** A file listed as deleted shows a placeholder stating the file was deleted | Placeholder "This file was deleted" | `smoke:660` — `deletedHeadline === 'This file was deleted'` against `FilePlaceholder.tsx:40` | ✅ PASS |
| **FXPL-16** Click opens a tab, or focuses the tab already open | New tab; a second click focuses, never duplicates | `smoke:374` — `tabs.some(t=>t.includes('main.ts'))`; `:586` — `tabsAfterSln.length === tabsBeforeSln + 1` proves one tab per open. The focus-instead-of-duplicate branch (`use-files.ts:288-295`) has no assertion | ⚠️ Half |
| **FXPL-17** Viewer is read-only and highlights by language | Read-only; tokenised for the file's language | Read-only: `smoke:450-461` — non-empty content, typed into through CDP, `textAfterTyping === textBeforeTyping && !includes('ZZZ')`. Highlighting: `:397` — `viewer.tokens > 0 && viewer.classes > 1` | ✅ PASS — both halves can now fail; see the analysis above |
| **FXPL-18** Tabs kept while the app runs, never restored after a restart | Tabs survive a direction/worktree switch; absent on relaunch | Kept: `smoke:701` — `otherTabs.length === 0` for another worktree, `:720` — the count returns. Not-restored: structural only — `FilesState` (`src/shared/config.ts:66-69`) is `{mode, base?}` with no tab field | ⚠️ Half — the restart clause is a schema property, not an assertion (Gap 6) |
| **FXPL-19** Closing a tab focuses the adjacent tab, or shows an empty state | next → previous → `null` | `files-view.test.ts:79` — `toEqual({tabs:['a.ts','c.ts'],active:'c.ts'})`; `:83` — `active:'b.ts'`; `:87` — `{tabs:[],active:null}`; `:91` — inactive close keeps focus | ✅ PASS |
| **FXPL-20** Binary or >1 MB → name, size and type, no content | `{kind:'binary',size}` / `{kind:'too-large',size}`; tab shows name + size + type | `file-reader.test.ts:54` — `toEqual({kind:'too-large',size})`; `:63` — `kind:'text'` at exactly `MAX_VIEW_BYTES`; `:78` — `{kind:'binary',size}`; values at `files-view.test.ts:155-192` (`'1023 B'`, `'1.0 MB'`, `'1.5 KB'`, `'16 KB'`, `'1024 GB'`, `'TS file'`, `'No extension'`); `smoke:556`, `:572`. Mutants M2/M3: both killed | ✅ PASS (the name at `FilePlaceholder.tsx:66` is rendered but unasserted) |
| **FXPL-21** An open file changed on disk updates in place within 1 s and keeps its scroll position | Content replaced ≤1 s; scroll preserved | Update: `smoke:478` — `updated.includes('appended by the smoke')` after 1400 ms; batching bound `file-watcher.test.ts:106` — `toEqual([BATCH_MS])`; routing `files-view.test.ts:143`. Scroll: `smoke:526` — `lineBefore > 10`, `:536` — `lineBefore > 10 && Math.abs(lineAfter-lineBefore) <= 1` | ✅ PASS — a reset to the top reads 0 and goes red |
| **FXPL-22** A file added/changed/removed in the current mode's list → tree reflects it within 1 s | The *tree list* re-lists | `smoke:675` — `!namesBeforeAdd.includes('appeared.txt') && namesAfterAdd.includes('appeared.txt')` after a 1500 ms wait | ✅ PASS |
| **FXPL-23** Watch only the selected worktree; react only by refreshing its tabs and current list; stop watching when deselected | Old handles closed; new opened; nothing emitted for a stale selection | `file-watcher.test.ts:140-153` — previous handles closed, open handles exactly `[other, gitdir/index, gitdir/HEAD]`; `:155-162` — all closed on `select(null)`; `:164-173` — `emitted` `toEqual([])`; `:175-189` — the stale already-dispatched callback emits nothing; `:191-205` — `cancelled` `toEqual([BATCH_MS])`. Mutant M1 (drop the emit-time guard): killed | ✅ PASS — round 2's surviving M6 is dead |
| **FXPL-24** A file deleted on disk keeps its tab, showing a "no longer exists" placeholder | Tab stays; placeholder | `file-reader.test.ts:69` — `toEqual({kind:'missing'})`; `smoke:616` — `afterDelete.tabs.some(t=>t.includes('main.ts')) && afterDelete.headline === 'This file no longer exists'` | ✅ PASS |
| **FXPL-25** Launchers for Explorer, VS Code, VS 2022 and VS 2026 under the tabs | Four launchers, under the tab strip | `smoke:628-636` — `launchers.length === 4 && ['Explorer','VS Code','2022','2026'].every(...)` | ✅ PASS (the positional "under the tabs" clause rests on `FileTabs.tsx:107` DOM order, unasserted) |
| **FXPL-26** Launcher acts on the active tab's file, or the more recently selected folder | Whichever is newer wins; a tie goes to the tab | `files-view.test.ts:99-100` — `200 vs 100` → `'src/lib'`, `50 vs 100` → `'src/app.ts'`; `:106` — `100 vs 100` → `'src/app.ts'`; `:112-114` — the three fallbacks. Mutant M4 (`>` → `>=`): killed | ✅ PASS |
| **FXPL-27** Explorer opens the file's folder with the file selected, never the file | `/select,"<path>"`, verbatim | `src/main/shortcut-launcher.test.ts:184-189` — `args: ['/select,"C:\tmp\a b, c\x.txt"']` with `verbatim:true`; hand check B | ✅ PASS |
| **FXPL-28** Double-click a `.sln`/`.slnx` → VS 2026, and no tab | VS 2026 launched; no tab opened | `files-view.test.ts:59-71` — `isSolution` accepts `.sln`/`.slnx` in any case, rejects `Widget.sln.bak`. The gate itself (`FileTree.tsx:252-267`) is hand check A, recorded passed | ⚠️ Rule covered; the gate is hand-check only (UAC — correctly out of the smoke) |
| **FXPL-28a** Single click on a `.sln` opens it in a tab | Exactly one new tab named `App.sln` | `smoke:586-590` — `tabsAfterSln.length === tabsBeforeSln + 1 && tabsAfterSln.some(t=>t.includes('App.sln'))` | ✅ PASS |
| **FXPL-28b** A second launch of the same solution within 3 s is ignored | No second instance inside 3000 ms | `FileTree.tsx:212,227` implements it; hand check A only — the 3 s constant is asserted nowhere | ⚠️ Hand check only |
| **FXPL-29** VS launches stay elevated (AD-016) | `Start-Process … -Verb RunAs` | `shortcut-launcher.test.ts:33-40` — `Start-Process -FilePath 'C:\VS\devenv.exe' -ArgumentList '"C:\code\repo"' -Verb RunAs` | ✅ PASS (repo depth, pre-existing) |
| **FXPL-30** A failed launch shows the launcher's existing failure toast | Existing wording, per edition | `shortcut-launcher.test.ts:130-143` — the exact three messages per edition. The renderer wiring (`FileTabs.tsx:12`, `FileTree.tsx:15`) is untested and unchecked | ⚠️ Message covered; wiring not |
| **FXPL-31** The counter switches to Files on that worktree in uncommitted mode | Files direction, `Uncommitted` selected | `smoke:749-753` — `landed.inFiles === true && landed.mode === 'Uncommitted'` | ⚠️ Half — the direction term discriminates; the mode term is pre-satisfied by the drive's own ordering. See Gap 1 |
| **FXPL-32** The forced mode is remembered as that worktree's last mode | `ui.files[wt].mode === 'uncommitted'` persisted | `App.tsx:144-154` writes direction and mode in one patch; `filesStateFor` reads it back (`files-view.test.ts:129-135`, mutant M5 killed). Nothing re-reads it after leaving and returning | ⚠️ Implied by two separately-covered halves, not asserted jointly |

**Tally**: 34 criteria (32 numbered + 28a + 28b).
**22 exact** · **12 partial or spec-precision** · **0 with no usable evidence**.

| Round | Exact | Partial | No evidence |
| ----- | ----- | ------- | ----------- |
| 1 | 16 | 12 | 6 |
| 2 | 22 | 11 | 1 |
| 3 | **22** | **12** | **0** |

The count of exact matches is flat between rounds 2 and 3 because two criteria moved in opposite
directions: FXPL-17 gained real evidence in both halves, and FXPL-31 lost half of its, on a
discrimination hole round 2 did not examine (Gap 1). The headline movement is the last column —
every criterion in the spec now has at least one assertion that can go false.

---

## Edge Cases

| Edge case (spec §Edge Cases) | Evidence | Verdict |
| ---------------------------- | -------- | ------- |
| Worktree path gone → path-missing state, no tree, no tabs | `FilesView.tsx:274-282`; `App.tsx:388` derives `pathMissing` | ⚠️ implemented, untested (unchanged across all three rounds) |
| `git ls-files` fails → git's first error line | `file-tree.test.ts:90` — `entries` `toEqual([])`; `:91` — `error` `toMatch(/^fatal: not a git repository/)` | ✅ |
| Base branch later deleted → fall back to the FXPL-11 prompt | `file-tree.test.ts:173-176` — `mergeBase` null, `files` `[]`, error matches `/deleted-base/`; the fallback render (`FileTree.tsx:334-341`) untested | ⚠️ main half covered |
| A renamed file → old tab shows the deleted placeholder, new path appears in the tree | `file-reader.test.ts:69` covers the `missing` read; `file-tree.test.ts:109-113` covers the rename mapping; nothing covers the pair | ⚠️ partial |
| The same file open in two worktrees → independent tabs | `use-files.ts:117` keys state by worktree path; `smoke:701` proves tabs do not leak between worktrees, the same guarantee one step removed | ⚠️ improved in round 2, still not the literal case |
| Non-UTF-8 text renders with replacement characters | `file-reader.test.ts:88` — `toEqual({kind:'text',text:'caf\uFFFD',size:4})` | ✅ |

---

## Discrimination Sensor

Isolated scratch: `git worktree add -d D:\playground-verify-r3 HEAD`, with a directory junction to
the repo's `node_modules`. Each fault was applied to the scratch copy by script, the covering test
file run there with `npx vitest run`, the file restored from the in-memory original and byte-compared
against it before the next mutation (`restored=true` printed for all six), and the scratch removed
afterwards (`git worktree remove --force`, then `git worktree prune`, junction deleted first).
`git status --porcelain` in `D:\playground-main` was `?? .specs/features/files-explore/validation.md`
before the sensor and is the same after; `git worktree list` shows only the real tree. No
`git stash`, no `git reset`, no write to the real worktree.

A methodological correction worth recording: the first sensor pass ran `npx vitest run <file>
--reporter=basic`, and this vitest (4.1.9) has no `basic` reporter — **every run exited non-zero on
a loader error, which a naive harness reads as six kills.** The flag was removed and all six were
re-run against a verified green baseline (`file-watcher.test.ts`: 9 passed). Every outcome below
carries the named failing test, so a run error cannot masquerade as a kill again.

| # | `file:line` | Fault injected | Outcome |
| - | ----------- | -------------- | ------- |
| M1 | `src/main/file-watcher.ts:112` | `startBatch`: drop the emit-time `if (this.selected !== worktreePath) return` — **round 2's surviving M6** | ✅ Killed (1 failed / 9) — `drops a batch that fires after the selection moved on (FXPL-23)` |
| M2 | `src/renderer/src/lib/files-view.ts:136` | `formatSize`: drop the one-decimal rule below 10 (`Math.round` always) | ✅ Killed (3 failed / 24) — the KB/MB/GB step, the decimal rule and the 1 MB-ceiling case |
| M3 | `src/renderer/src/lib/files-view.ts:146` | `fileType`: `dot > 0` → `dot >= 0`, so `.gitignore` becomes a `GITIGNORE file` | ✅ Killed (1 failed / 24) — `calls a dotfile and an extensionless name extensionless (FXPL-20)` |
| M4 | `src/renderer/src/lib/files-view.ts:98` | `launcherTarget` (FXPL-26 recency rule): `lastFolder.at > activeTab.at` → `>=`, so the tie goes to the folder | ✅ Killed (1 failed / 24) — `leaves the target on the active file when the folder is not newer (FXPL-26)` |
| M5 | `src/renderer/src/lib/files-view.ts:106` | `filesStateFor` (FXPL-13): an unvisited worktree defaults to `uncommitted`, not `full` | ✅ Killed (2 failed / 24) — both default cases |
| M6 | `src/main/file-tree.ts:26` | full-folder listing (FXPL-04): `--exclude-standard` → `--no-empty-directory`, so ignored files return | ✅ Killed (1 failed / 16) — `never lists an ignored folder` |

**Sensor depth**: P0-full (6 manual behaviour-level faults; ≥5 required). **Killed 6 / 6.**

Both mutants that survived earlier rounds are dead under re-injection: round 1's M7/M9/M14 stayed
dead through round 2 and round 3's M4 re-confirms the tie rule; round 2's M6 is killed by M1 here.

Two faults were **not** injected, and are read rather than run, because their only covering artefact
is the CDP smoke and the sandbox forbids launching the app:

- Deleting `editor.setScrollTop(scrollTop)` at `CodeViewer.tsx:72` would drive `lineAfter` to 0
  while `lineBefore > 10`, so `smoke:536` goes red. That check discriminates.
- Setting `readOnly: false, domReadOnly: false` at `CodeViewer.tsx:43-46` makes the model editable,
  so the CDP keystrokes land and `textAfterTyping !== textBeforeTyping`, so `smoke:450` goes red
  with the detail `CONTENT CHANGED — not read-only`. This is the author's own falsification, and it
  is reachable only on that condition (see the analysis above). That check discriminates.

And one fault is read and reported as **surviving**, which is Gap 1: removing `mode: 'uncommitted'`
from `openChangedFiles` (`App.tsx:150-152`) leaves `smoke:749` green, because the drive has already
left that worktree in `Uncommitted` mode before it clicks the counter.

---

## Gate Check

- **Gate command** (Full, from `tasks.md` §Gate Check Commands): `npm run typecheck && npm run lint && npm test`
- `npm run typecheck` — clean, both projects (`tsconfig.node.json`, `tsconfig.web.json`)
- `npm run lint` — **0 errors, 18 warnings**, exit 0; identical to the T1 baseline. All 18 sit in
  `scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`,
  `scripts/smoke-agents.mjs` and `src/shared/tasks.test.ts` — none in a file this feature touched.
  `scripts/smoke-files.mjs` is clean.
- `npm test` — **1042 passed / 1042, 59 files**, 0 failed, 0 skipped, 73.1 s
- `node scripts/smoke-files.mjs` — **not re-run** (sandbox). Judged by reading all 25 checks.

**Test integrity**

- T1 baseline 979 / 55 files → round 1: 1032 / 59 → round 2: 1041 / 59 → now **1042 / 59**. +63
  over the feature. No decrease at any point.
- `git diff 09c4b4f..HEAD --stat -- "*test*"` shows insertions only for the follow-up commits; no
  existing test was deleted, and no assertion was loosened. Round 3's single test addition
  (`file-watcher.test.ts:175-189`) is additive and does not weaken the case beside it — on the
  contrary, it restores the coverage that case had displaced.
- The round-3 smoke change is test-side only. No production file changed in `f3b20ee`.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code — nothing beyond the spec | ✅ Round 3 touches only the smoke, one watcher test and the task record |
| No abstractions for single-use code | ✅ |
| No unnecessary flexibility | ✅ |
| Only touched files required for the work | ✅ |
| Didn't improve unrelated code | ✅ |
| Matches existing patterns/style | ✅ The same `check(label, ok, detail)` shape throughout the smoke; the fake-scheduler harness extended in place rather than duplicated |
| Would a senior engineer approve? | ✅ Yes. The one thing to raise in review is the `tasks.md:860` over-claim of Gap 1, which is a line of prose, not code |
| Tests map to ACs and are non-shallow | ✅ Every test file, and now the FXPL-17 check too |
| Spec-anchored outcome check | ⚠️ 22/34 exact, 12 partial, 0 absent |
| Per-layer Coverage Expectation met | ✅ Main process: all branches, including the emit-time guard. Pure helpers: complete. Renderer/hooks: routed to the smoke by the matrix, and the smoke delivers |
| Every test maps to a spec AC / edge case / Done-when — no unclaimed tests | ✅ The new watcher case carries `(FXPL-23)` in its name |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md`, `vitest.config.ts`, the AD-016 elevation precedent |

---

## Gaps, ranked — all Minor or below, none blocking

### Gap 1 — FXPL-31's mode term is pre-satisfied by the drive's own ordering (Minor, new in round 3)

`smoke:749-753` asserts `landed.inFiles === true && landed.mode === 'Uncommitted'` after clicking
`.status-bar-changes`. The direction term discriminates — the drive navigates to `Tree` at `:727`
first, so `inFiles` is false unless the counter really switched. The mode term does not: check 18
at `:683` sets `feature/smoke` to `Uncommitted`, `:720` asserts it is still `Uncommitted` after a
round trip, and the counter click at `:731` targets that same worktree. `filesStateFor` would read
back `uncommitted` from the persisted config whether or not `openChangedFiles` forced it. Deleting
`mode: 'uncommitted'` from `App.tsx:150-152` therefore leaves the check green.

This also means the Done-when box at `tasks.md:860` — *"The forced mode is what the worktree
restores next time … verified by the T23 smoke"* — over-claims: nothing in the drive leaves that
worktree and returns *after* the counter click. The sibling box at `:859` is accurate for its
"lands in Files" half and optimistic for its "uncommitted mode" half.

Why this is Minor and not a repeat of the round-1/round-2 blocker: the check is not a tautology.
It reads a real value that *would* go false under a different ordering, unlike round 2's
`textarea.readOnly`, which no ordering could falsify. The mechanism is covered from both ends —
the single-patch write is right there at `App.tsx:144-154` and typechecked, and the read-back is
unit-tested (`files-view.test.ts:129-135`, mutant M5 killed). What is missing is the joint,
end-to-end discrimination, which is precisely the class of gap rounds 1 and 2 recorded as Minor
six times over. Blocking a third round on it would be inconsistent ranking.

- **Fix, one line**: click `Folder` on `feature/smoke` immediately before navigating to `Tree` at
  `:727`. The mode term then discriminates, and a second leave-and-return after the counter click
  would close FXPL-32 jointly for another six lines.
- **Also fix (prose, no code)**: soften `tasks.md:860` to "implied by the single config write;
  not independently checked" until that drive exists.

### Gap 2 — carried half-covered criteria from rounds 1 and 2 (Minor, each)

Never claimed fixed by any round; listed so the record is complete.

- **FXPL-09** — the base picker's `onChange` is never driven, and `smoke:354` only asserts that
  *some* base is displayed, not that it is `origin/main`.
- **FXPL-11** — "the mode SHALL list nothing until a base is chosen" has no test and no check.
- **FXPL-12** — the per-file status pill (`FileTree.tsx:133`) is rendered and never asserted, and
  `smoke:364` never asserts that an unchanged tracked file is *absent*, so the spec's "exactly the
  paths `worktrees:changes` returns" is untested in the negative direction.
- **FXPL-16** — clicking an already-open file focuses instead of duplicating
  (`use-files.ts:288-295`): unasserted. `:586` proves one-tab-per-open for a *new* file only.
- **FXPL-30** — the toast wiring in `FileTabs.tsx` / `FileTree.tsx` is untested; only the message
  strings are.
- **FXPL-32** — implied by FXPL-31's single write; never re-read after leaving and returning.

### Gap 3 — FXPL-07 and FXPL-28b rest on indirect or hand evidence (Minor)

FXPL-07's "three modes at the top" is proven only by three clicks landing, never by asserting the
selector's composition; one extra expression over `.file-tree-mode` would fix it. FXPL-28b's 3 s
window is hand check A only — legitimately out of the smoke, since the double-click raises UAC, but
the 3 s constant itself could be unit-tested if it were lifted out of `FileTree.tsx:212`.

### Gap 4 — precision notes on otherwise good checks (Cosmetic)

- `smoke:720` compares `backTabs.length === tabsBeforeSwitch.length`. Six tabs are open by then so
  it is not vacuous in practice, but `0 === 0` would pass and identity is not compared. Asserting
  `tabsBeforeSwitch.length > 0` and comparing the label arrays costs nothing. Carried from round 2.
- `smoke:648` (FXPL-14) asserts the label but not that the file's *current content* rendered
  beneath it. Carried from round 2.
- `smoke:450` (FXPL-17 read-only) does not assert that the editor took focus before the keystrokes.
  Conditional, not invariant, and positively evidenced by the falsification run — but one term
  (`.monaco-editor.focused`) would close it. New in round 3.
- `smoke:749` computes `counterClicked` and embeds it as `landed.clicked` without asserting it.
  Harmless today because `inFiles` would fail anyway, but the field reads as an assertion and is not.

### Gap 5 — the path-missing edge case is implemented and untested (Minor)

`FilesView.tsx:274-282` and `App.tsx:388` derive it; nothing exercises it. Unchanged across all
three rounds; never claimed.

### Gap 6 — FXPL-18's "SHALL NOT restore tabs after a restart" is structural (Minor)

`FilesState` (`src/shared/config.ts:66-69`) is `{ mode, base? }` and `ui.files` stores nothing else,
so no mechanism exists by which a tab could be restored — the typecheck gate holds that shape. That
is an argument, not an assertion, and closing it properly needs a second launch, which is a hand
check. Recording it as an explicit hand check beside A and B would be honest and free.

---

## Do the standing Minors block a PASS?

**No.** Stated plainly, because this is the last round of the loop.

Every one of them is an *evidence* gap over behaviour that is implemented, typechecked and covered
at least on one side — not a behaviour defect, and not a check carrying a claim it cannot support.
That distinction is the whole reason rounds 1 and 2 failed: in both, a Done-when box was ticked
from a check that was absent (round 1) or invariant (round 2). Round 3 has no such case. The
nearest thing to one is Gap 1's `tasks.md:860`, and the honest ranking is that it is an optimistic
sentence about a check that reads a real value, one ordering away from discriminating — not a check
that cannot fail.

None of them was misranked by the earlier rounds. FXPL-18's restart clause is the one I looked at
hardest for a hidden blocker, since "SHALL NOT" clauses are where silent regressions live: it is
genuinely closed by the type, because there is no field to write a tab into and the gate would
reject adding one without a spec change. Structural is weaker than asserted, but here it is sound.

**The feature is shippable with these recorded as known limits.**

### Ranked pickup list for F2

1. **Gap 1's one-line reorder in the smoke** — restores discrimination to FXPL-31's mode term, and
   six more lines close FXPL-32 jointly. Cheapest, and it retires the only over-claim in the record.
2. **FXPL-16's focus-instead-of-duplicate branch** — a real user-visible behaviour with zero
   coverage; one click in the smoke on an already-open file.
3. **FXPL-12's status pill and negative assertion** — F2 renders diffs off these same statuses, so
   this coverage pays for itself in the next slice.
4. **FXPL-09's picker `onChange` and FXPL-11's empty list** — F2 inherits the base picker wholesale
   (`spec.md:12`), so drive it there rather than bolting a check onto F1.
5. **FXPL-30's toast wiring** — cheap, and it is the only path by which a launch failure reaches the
   user.
6. **FXPL-18's restart hand check and the path-missing edge case** — record as hand checks C and D
   rather than build machinery for them.
7. **FXPL-07's selector composition and FXPL-28b's 3 s constant** — lowest value; both are one
   expression each if someone is in the file anyway.

---

## Requirement Traceability Update

| Requirement | Round 1 | Round 2 | Round 3 |
| ----------- | ------- | ------- | ------- |
| FXPL-01, 02, 04, 05, 06, 08, 10, 13, 14, 15, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28a, 29 | Verified / needs evidence / partial | ✅ Verified | ✅ Verified |
| FXPL-17 | Partial (read-only unasserted) | ❌ Needs evidence — both halves non-discriminating | ✅ **Verified** — behavioural read-only check, distinct token classes |
| FXPL-31 | Verified | ✅ Verified | ⚠️ **Partially verified** — direction half only (Gap 1) |
| FXPL-03 | Spec-precision gap | ⚠️ Spec-precision gap | ⚠️ Spec-precision gap (the spec fixes no wording) |
| FXPL-07, 09, 11, 12, 16, 18, 28, 28b, 30, 32 | Partial | ⚠️ Partially verified | ⚠️ Partially verified — Gaps 2, 3, 6 |

FXPL-17 is the movement this round: from the only zero-evidence criterion to verified in both
halves, on a check that has been falsified rather than argued. FXPL-31 moves the other way, because
round 3 examined the drive's ordering rather than the check's expression in isolation.

---

## Summary

**Overall**: ✅ Verified. Ship it, with the twelve partials recorded as known limits and the
`tasks.md:860` sentence corrected.

**Spec-anchored check**: 34 criteria — 22 matched the spec outcome exactly, 12 partial or
spec-precision, **0 with no usable evidence** (6 in round 1, 1 in round 2).
**Sensor**: 6 / 6 mutations killed, including both of the mutants that survived earlier rounds.
**Gate**: 1042 passed, 0 failed, 0 skipped; typecheck clean; lint 0 errors / 18 warnings.

**What round 3 got right.** The FXPL-17 check stopped asking the DOM what the editor's options say
and started asking the editor what it does. It clicks, types real key events through CDP, and
demands three things — content present, content identical, and the typed characters absent — so
each of the three ways the earlier versions could pass without proving anything is blocked
individually. It was falsified before it was trusted, and the two failure strings it reported are
reachable only on the conditions the author described, which is the strongest corroboration
available to a verifier who may not run the app. The `24 chars` in the recorded detail is
independently the length of the seeded file, which is a small thing and hard to fake. The
highlighting half moved from a count Monaco always satisfies to distinct token classes, which
plaintext cannot. And the watcher's emit-time guard is protected again by a test that reproduces
the exact race the guard exists for, rather than the one `cancelBatch` already wins — the right
answer to round 2's observation that a stronger neighbour had silently taken over the older test's
reason for passing.

**What is still open, and why it does not block.** Twelve criteria rest on partial evidence, and
one of them — FXPL-31's mode term — is newly downgraded this round on a hole neither earlier round
looked for: the drive leaves the worktree in the very mode the counter is supposed to force, so the
force is unobservable. That is worth a line in the smoke and a softer sentence in `tasks.md`, and it
is the same family as the six Minors already on the record: implemented behaviour, covered from both
ends, not jointly discriminated. None of the twelve is a check that cannot fail, which is the defect
this gate exists to catch and the reason the two earlier rounds failed. The bounded loop has done
its work.

**Next steps**: correct `tasks.md:860`; pick up the ranked list above in F2, starting with the
one-line reorder at `scripts/smoke-files.mjs:727`.
