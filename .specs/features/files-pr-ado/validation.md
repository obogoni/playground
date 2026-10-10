## Validation: files-pr-ado — PASS

Independent Verifier (author ≠ verifier), one pass. No production defect found and every one of
FPRA-01..36 has evidence. One unit mutant survived (a test gap, not a defect) and several ACs are
evidenced by unit tests and code reading only, where the smoke cannot reach them; both are follow-ups,
not blockers, under the owner's rules for this Verifier.

**Date**: 2026-10-10
**Spec**: `.specs/features/files-pr-ado/spec.md` (FPRA-01..36; there is no FPRA-37, T25 removed after S4)
**Design**: `.specs/features/files-pr-ado/design.md` — § Spike Findings S1–S9 taken as overriding the earlier text
**Branch**: `feature/files-pr-ado`, HEAD `f928e78`
**Diff range**: `1f43b49..f928e78` — T2–T24, T26, T27 and the three smoke-found fixes `646153f`, `2dfb90b`, `896c1f7`
**Verifier**: independent sub-agent; read-only on the real worktree, mutants in a throwaway `git worktree`

---

## Summary

| Measure | Outcome |
| ------- | ------- |
| Spec-anchored check | 36/36 ACs with evidence (31 by unit test and/or smoke check; 4 — FPRA-04, 08, 31, 34 — by unit test + code reading where the smoke cannot drive them; FPRA-28 by code reading of a by-construction guarantee plus the SKIP recorded at T27); 3 spec-precision gaps flagged |
| Gate | `npm test` 3057 passed / 0 failed (136 files); typecheck exit 0; lint exit 0, 18 warnings (= the T2 baseline); `npx electron-vite build` exit 0 |
| Sensor, unit | 11/12 killed — U1 survived |
| Sensor, smoke (read-only) | 5/5 killed |
| Smoke baseline, re-run by the Verifier (read-only) | 21/21 pass, 1 SKIP (FPRA-28), app and temp folder cleaned up |
| Production defects | none |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | Spike findings S1–S9 in `design.md`; S6 corrected after T27 |
| T2–T24 | ✅ Done | Every Done-when box ticked; counts reconcile with 2977 → 3057 |
| T25 | — Removed | S4: Azure DevOps keeps `<…>` byte-identical, so no FPRA-37 |
| T26 | ✅ Done | README no longer says view-only and names exactly the four writes |
| T27 | ✅ Done | Smoke committed; author's runs 21/21 + 1 skip read-only, 29/29 + 1 skip with writes |
| Fixes | ✅ Done | `646153f` items as JSON (regression asserted in `src/main/ado-pr.test.ts:441-443`), `2dfb90b` Comment bar in place (smoke 19), `896c1f7` zones take clicks (smoke 17) |

---

## Spec-Anchored Acceptance Criteria

Smoke check numbers are the **runtime** numbers the script prints (overview 1–12, diff 13–21, writes
22–29 under `--allow-writes`); a few code comments in the script carry stale numbers. Read-only checks
1–21 were re-run by this Verifier; write checks 22–29 are the author's recorded run (29/29 + 1 skip),
judged by reading `scripts/smoke-files-pr-ado.mjs:1142-1376`. Line numbers are at `f928e78`.

### P1: Find the branch's PR

| AC | Spec-defined outcome | Evidence (`file:line` + assertion / smoke check) | Verdict |
| -- | -------------------- | ------------------------------------------------ | ------- |
| FPRA-01 | A fifth mode, Pull request | smoke 1 — `modes.length === 5 && modes[4] === 'Pull request'`; smoke 2 — five labels whole at the 200 px minimum; `src/renderer/src/components/FileTree.tsx:32` | ✅ |
| FPRA-02 | Every ADO remote searched for active PRs from the branch, fork included | `src/main/ado-pr.test.ts:128-138` — both targets searched, each with `sourceRefName=refs/heads/feature/login`, `sourceRepositoryId=fork-id`, `status=active`; fork PR into upstream returned (`:139-159`); smoke 3 — same-repository PR found live | ✅ (fork case unit only; ⚠️ see gap G2) |
| FPRA-03 | Exactly one PR → shown | smoke 3 — `view.id === '!' + detail.id`, Overview active; `src/renderer/src/lib/use-pull-request.ts:460` picks the only PR | ✅ |
| FPRA-04 | Picker naming number, title, target; choice kept per worktree while running | `src/main/ado-pr.test.ts:139-159` — two PRs with `id`, `title`, `targetBranch`; picker renders `!{id} {title} → {targetBranch}` at `src/renderer/src/components/PrPicker.tsx:43`; choice held in memory per worktree at `src/renderer/src/lib/use-pull-request.ts:41-45,246-255` | ✅ unit + code reading (UI not driven: follow-up F3) |
| FPRA-05 | No PR → say so, Create PR with source branch filled | `src/main/ado-pr.test.ts:169` — `{ kind: 'none', createUrlAvailable: true }`; `:700-703` — opens `…/pullrequestcreate?sourceRef=feature%2Flogin` on the pushed repository; `src/main/remote-url.test.ts:122-129` | ✅ |
| FPRA-06 | No ADO remote → say so, no search | `src/main/ado-pr.test.ts:182-183` — `{ kind: 'no-ado-remote' }` and `readRequests` empty; `src/main/ado-pr-model.test.ts:121-128` | ✅ |
| FPRA-07 | Token unavailable → the "run `az login`" message | `src/main/ado-pr.test.ts:210-212` — `{ kind: 'auth' }` for find and get, no request sent; `src/renderer/src/components/PrOverview.tsx:294-300` is word for word `src/renderer/src/components/TasksPane.tsx:137-138` | ✅ |
| FPRA-08 | Detached HEAD → no branch to look up | `src/main/ado-pr.test.ts:192-193` — `{ kind: 'detached' }`, no request; message at `src/renderer/src/components/PrOverview.tsx:106-107` | ✅ unit + code reading (UI not driven: follow-up F4) |

### P1: Read the PR

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| FPRA-09 | Fixed Overview with number, title, author, status incl. draft, branches, creation date, reviewers with vote | `src/main/ado-pr.test.ts:271-298` — full `detail` incl. `isDraft`, `status`, `author`, `sourceBranch`, `targetBranch`, `createdAt`, reviewers `approved` / `waiting-for-author` (group); `src/renderer/src/lib/diff-view.test.ts:502-506`, `src/renderer/src/lib/files-view.test.ts:121-128`; smoke 3, 5 | ✅ |
| FPRA-10 | Description as sanitized markdown | `src/main/ado-pr.test.ts:282` — 1000-character description whole, from the single-PR call (`:270`); rendered by `renderMarkdown` (FPRA-22 rows); smoke 5 | ✅ |
| FPRA-11 | Every non-system thread listed with location, status, author, first comment | `src/renderer/src/lib/pr-view.test.ts:45-46,57` — each group exactly its threads; `src/main/ado-pr-model.test.ts:165,171`; smoke 6 (sections and counts equal what main read), smoke 7 | ✅ |
| FPRA-12 | Activating an anchored thread opens its PR diff at its line | smoke 13 — tab title equals the thread's path, its start line in view with the cursor on it | ✅ |
| FPRA-13 | System threads only in a collapsed Activity | `src/main/ado-pr-model.test.ts:151,161` — `{ kind: 'system' }` for both signals; `src/renderer/src/lib/pr-view.test.ts:57`; `src/renderer/src/lib/pr-view.test.ts:128` — never a zone; smoke 10 — `aria-expanded` false and nothing mounted | ✅ |
| FPRA-14 | Open in browser through the main https opener | `src/main/ado-pr.test.ts:700-701` — `https://dev.azure.com/acme/platform/_git/widget/pullrequest/42`; `src/main/remote-url.test.ts:116-118,146-155` — every output passes `isHttpsUrl` | ✅ (button not clicked by the smoke: follow-up F9) |
| FPRA-15 | Left column lists the PR's files with change status | `src/main/ado-pr-model.test.ts:67-73,87-90` — add/edit/delete/rename → statuses, `/` stripped; `src/main/ado-pr.test.ts:321-324` — 250 files over three pages; smoke 4 — rows = files | ✅ |
| FPRA-16 | Original at the latest iteration's merge base, modified at its source commit, both from ADO | `src/main/ado-pr.test.ts:498-507` — items read at `bbb3` then `aaa3` (iteration 3, the highest of 1/3/2), added file's original `absent`; smoke 13 | ✅ |
| FPRA-17 | F2's viewer with layout, whitespace, folding, navigation, EOL | smoke 21 — layout inline and back, thread still drawn; code: `src/renderer/src/components/PrDiffTab.tsx:163-168` (whitespace, Hide/Show unchanged, navigation handle), `src/main/ado-pr.ts:301` (EOL lines) | ✅ (only layout driven: follow-up F5) |
| FPRA-18 | Each non-system thread under the line ADO places it on, latest iteration | `src/main/ado-pr.test.ts:391-392` — `$iteration=3&$baseIteration=0`; `src/main/ado-pr-model.test.ts:178-195,253`; `src/renderer/src/lib/pr-view.test.ts:135` — `afterLine` = end line, per side; smoke 14 — under line 7 = `endLine` | ✅ |
| FPRA-19 | Unplaceable thread listed as outdated, not drawn | `src/main/ado-pr-model.test.ts:212` — `{ kind: 'outdated', path, line: 2 }` (S3 rule), `:228`, `:253` the two non-outdated cases; `src/renderer/src/lib/pr-view.test.ts:128`; smoke 8, 15 | ✅ |
| FPRA-20 | Active expanded; resolved collapsed to status and author, expandable | `src/main/ado-pr.test.ts:399,414` — `fixed` → `resolution: 'resolved'`; `src/renderer/src/components/PrThread.tsx:95`; smoke 7, 17 (active expanded, toggles); write smoke 25 (Resolved → collapsed, here and in the Overview) | ✅ |
| FPRA-21 | Each comment as sanitized markdown with author and relative date | `src/main/ado-pr-model.test.ts:293-306` — author, content, date kept, deleted dropped; FPRA-22 rows for the rendering; smoke 9 | ✅ |

### P1: Nothing third-party is trusted

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| FPRA-22 | No raw HTML, no script, no event-handler attribute | `src/renderer/src/lib/markdown.test.ts:29-30,36-37,66-68` — escaped text, no `script` / `img` / comment / `details` tag; `:103-104` — no ` on…=` and no `href` across 15 vectors; write smoke 28 — `a[href]` count 0 | ✅ |
| FPRA-23 | Link opens through main only if `https:`; nothing otherwise | `src/main/url-policy.test.ts:24,36` — https true, seven refusals false; `src/main/ado-pr.test.ts:666-676` — only the https link reaches `open`; `src/renderer/src/lib/markdown.test.ts:44-45,52,106` — `data-href` for https only; write smoke 28 | ✅ |
| FPRA-24 | Images as links, never loaded | `src/renderer/src/lib/markdown.test.ts:58-59` — no `img`, `<a data-href="…a.png">alt</a>` | ✅ |

### P2: Answer the review

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| FPRA-25 | Reply; it appears at the end of the thread | `src/main/ado-pr.test.ts:544-550` — POST `…/threads/9/comments`, `parentCommentId: 1`; `src/main/ado-pr-model.test.ts:324,328` — root id survives a deleted first comment; write smoke 24 — reply is the last comment | ✅ |
| FPRA-26 | Status among ADO's statuses; Active reopens | `src/main/ado-pr.test.ts:558-561` — PATCH `{ status: 2 }` then `{ status: 1 }`; `src/renderer/src/lib/pr-view.test.ts:90,102` — every status labelled, `unknown` never offered; write smoke 25, 26 (ADO read back `fixed`, then `active`, expanded) | ✅ |
| FPRA-27 | Modified-side selection → Comment, anchored to start/end line and offset at the latest iteration | `src/main/ado-pr-model.test.ts:342,361,373` — Monaco columns copied (S1), normalized; `src/main/ado-pr.test.ts:576-595` — body with `filePath: '/src/app.ts'`, right start/end, `changeTrackingId`, `iterationContext { 4, 4 }`; smoke 18–20; write smoke 23 — ADO's stored `rightFileStart/End` equal Monaco's selection, lines and columns | ✅ |
| FPRA-28 | Original-side selection never offers Comment | Code: the only selection source is `editor.getModifiedEditor().onDidChangeCursorSelection` at `src/renderer/src/components/DiffViewer.tsx:351`, and Comment is enabled only from it (`src/renderer/src/components/PrDiffTab.tsx:149,166`); smoke SKIP, recorded at T27 (the sandbox PR modifies no existing file) | ✅ by construction + code reading; smoke follow-up F1 |
| FPRA-29 | General comment = thread with no file context | `src/main/ado-pr.test.ts:602-612` — POST `…/threads`, body has no `threadContext`; write smoke 27 — listed under General | ✅ |
| FPRA-30 | Write / Preview with the same rendering; Ctrl+Enter posts | Code: Preview is `MarkdownBody` → `renderMarkdown` at `src/renderer/src/components/CommentComposer.tsx:126`; Ctrl+Enter at `:81-85`; write smoke 22 — real typing and Ctrl+Enter post a thread | ✅ (Preview not driven: follow-up F6) |
| FPRA-31 | On failure the text stays and the error shows inline | `src/main/ado-pr.test.ts:627-635` — ADO's own message for 403, HTTP status for 401, `fetch failed` offline; code: text cleared only on `ok` at `src/renderer/src/components/CommentComposer.tsx:76-77` | ✅ unit + code reading (failure UI not driven: follow-up F6) |
| FPRA-32 | Writes only on a user action, never automatically | `src/main/ado-pr.test.ts:72` — after every read test, no request but GET (U6 killed); `:640-655` — nothing sent until a write is called, one request each; the four write channels are invoked only from `src/renderer/src/lib/use-pull-request.ts:336,355,380,410`, reached from the composer, the status select and Comment | ✅ |

### P2: Stay current

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| FPRA-33 | Reload on entry, focus (5 s debounce), after a write, on refresh | smoke 11 — Refresh reloads once; smoke 12 — focus reloads 1 / 0 within 5 s / 1 after; write smoke 29 — Refresh drops a thread deleted elsewhere; after-write reload at `src/renderer/src/lib/use-pull-request.ts:323` | ✅ |
| FPRA-34 | Newer latest iteration → banner offering to reload the open diffs | `src/renderer/src/lib/pr-view.test.ts:154,158-160` — banner only when latest > on screen, never before anything is on screen; hook pins `onScreen` while diffs are open at `src/renderer/src/lib/use-pull-request.ts:198,441` | ✅ unit + code reading (needs a push; follow-up F2); ⚠️ G1 |
| FPRA-35 | No polling | Code: no `setInterval` / `setTimeout` in `src/renderer/src/lib/use-pull-request.ts`, `PrOverview.tsx`, `PrThread.tsx`, `PrDiffTab.tsx`, `PrPicker.tsx`, `CommentComposer.tsx` (grep, 0 hits); reads start only at `use-pull-request.ts:225,240,252,258,323`; smoke 12 — no reload without a focus | ✅ |

### P3: Keep the gateway searchable

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| FPRA-36 | No control byte but tab, LF, CR; separator as an escape | `src/main/ado-gateway.test.ts:204` (#122) — passes in this gate; byte scan of `src/main/ado-gateway.ts` by the Verifier: 0 control bytes | ✅ (met upstream by #122) |

**Status**: all 36 ACs have evidence; 3 spec-precision gaps flagged below; no AC without evidence.

### Spec-precision gaps

- **G1 — FPRA-34, "the one on screen".** The spec does not say what is on screen when only the Overview
  is open. The hook pins the on-screen iteration only while a PR diff of that PR is open
  (`src/renderer/src/lib/use-pull-request.ts:190-198`); with only the Overview open a newer iteration
  updates it silently and no banner shows. A defensible reading (there are no open diffs to reload), but
  the spec does not decide it.
- **G2 — FPRA-02, a branch that tracks no remote.** The spec says every ADO remote is searched; the code
  searches only when the branch has a `branch.<name>.remote` on Azure DevOps, because the source
  repository id comes from it (`src/main/ado-pr.ts:150`). A branch pushed without `-u` is reported
  "not pushed to an Azure DevOps repository" even if a PR exists for it. The design chose this; the spec
  never states the case.
- **G3 — Edge case "more threads than one API page".** The threads list is read in one request
  (`src/main/ado-pr.ts:274-281`). The REST 7.1 *Threads – List* call takes no paging parameters, so
  this is right by the reference, but the edge case is written as if a page limit existed and nothing
  tests or records the reading.

---

## Edge Cases

- [x] A deleted file's PR diff shows the deletion — the modified side's 404 is `absent` (`src/main/ado-pr.ts:325`), same path as the tested added-file original (`src/main/ado-pr.test.ts:498-501`). Threads in it listed as outdated: depends on ADO tracking them to an empty range; not measured (follow-up F8)
- [x] More threads than one page — see G3: one call returns them all per the reference
- [x] Write succeeded, reload failed — written content applied before the reload (`src/renderer/src/lib/use-pull-request.ts:322`), notice instead of replacement (`:206-216`); code reading only (follow-up F8)
- [x] A group reviewer listed with its vote — `src/main/ado-pr.test.ts:287-292` — `isGroup: true`, `state: 'waiting-for-author'`
- [x] PR completed or abandoned elsewhere — shown PR re-read when the search drops it (`src/renderer/src/lib/use-pull-request.ts:172-173`), Overview says so (`src/renderer/src/components/PrOverview.tsx:141-150`); code reading only (follow-up F8)

---

## Gate Check

- **Commands**: `npm run typecheck && npm run lint && npm test` on the real worktree; `npx electron-vite build` on the throwaway copy of the same HEAD (its `out/` is git-ignored either way)
- **Tests**: 3057 passed, 0 failed, 0 skipped — 136 files, 165.9 s
- **Test count before feature**: 2977 (132 files), measured at the reconciliation
- **Test count after feature**: 3057 (136 files) — **+80**, matching T4–T24's recorded deltas; no test removed, the pre-existing tab and gateway tests unedited
- **Typecheck**: exit 0 · **Lint**: exit 0, 18 warnings (T2 baseline 18, unchanged) · **Build**: exit 0

---

## Discrimination Sensor

Unit mutants ran in a throwaway `git worktree` of `f928e78` (`node_modules` by junction), each file
restored in `finally`; the junction was removed before the worktree. Smoke mutants ran the read-only
smoke (`SMOKE_ONLY` per section, never `--allow-writes`) from the same throwaway copy, so the dev app
it launched carried the mutant. The real worktree's `git status --porcelain` was empty before and after.

| # | Where | Mutation | Tests run | Killed? |
| - | ----- | -------- | --------- | ------- |
| U1 | `src/main/ado-pr-model.ts:158` | deleted when **some** comment is deleted (`every` → `some`): a thread with one deleted reply vanishes | model + client | ❌ **Survived** — follow-up F7 |
| U2 | `src/main/ado-pr-model.ts:173` | outdated no longer requires a non-empty original range | model + client | ✅ (1 failed) |
| U3 | `src/main/ado-pr-model.ts:170` | every tracked thread is an outdated candidate, moved ones included | model + client | ✅ (1 failed) |
| U4 | `src/main/ado-pr-model.ts:160` | `CodeReviewThreadType` no longer marks a system thread | model + client | ✅ (1 failed) |
| U5 | `src/main/ado-pr-model.ts:228-230` | anchor offsets made 0-based (the reference's wording S1 refuted) | model + client | ✅ (3 failed) |
| U6 | `src/main/ado-pr.ts:542` | the read path sends POST | client | ✅ (14 failed) |
| U7 | `src/main/ado-pr.ts:571` | `openHttps` opens any scheme | client | ✅ (1 failed) |
| U8 | `src/renderer/src/lib/markdown.ts:21` | `html: true` | markdown | ✅ (4 failed) |
| U9 | `src/renderer/src/lib/markdown.ts:46` | `data-href` for `http:` too | markdown | ✅ (1 failed) |
| U10 | `src/main/ado-pr.ts:250` | changes paging never sends `$skip` | client | ✅ (1 failed) |
| U11 | `src/main/ado-pr.ts:333` | size gate raised to 4 MB | client | ✅ (1 failed) |
| U12 | `src/main/ado-pr.ts:158` | only the source remote is searched (fork PR into upstream missed) | client | ✅ (1 failed) |
| SM1 | `src/renderer/src/components/PrOverview.tsx:340` | an outdated thread opens a diff at its old line | smoke overview | ✅ check 8 failed |
| SM2 | `src/renderer/src/components/PrOverview.tsx:49` | Activity open by default | smoke overview | ✅ check 10 failed |
| SM3 | `src/renderer/src/components/PrDiffTab.tsx:78` | right-side threads drawn on the original side | smoke diff | ✅ checks 14 and 16 failed (zone on the original side, under line 1) |
| SM4 | `src/renderer/src/components/PrDiffTab.tsx:171` | a thread opens its diff one line below its line | smoke diff | ✅ check 13 failed (cursor not on the thread line) |
| SM5 | `src/renderer/src/components/DiffViewer.tsx:351` | the selection reported is the original side's, not the modified side's | smoke diff | ✅ checks 18 and 20 failed (Comment stays disabled, nothing held) |

**Sensor depth**: expanded (security-relevant third-party rendering, outward writes): 12 unit + 5 smoke.
**Tally**: unit 11/12 killed, smoke 5/5 killed. Not counted against the verdict: U1 is a
test gap on correct production code (follow-up F7); the authors' own five falsifications at T27 were
not repeated.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — one client, one pure model, one renderer helper; no speculative options |
| Surgical changes | ✅ — F2's `DiffViewer` props optional; the other diff/tab tests pass unedited |
| No scope creep | ✅ — exactly the four writes (`reply`, `setStatus`, `createThread`, `generalComment`), matching AD-027 and the README |
| Matches patterns | ✅ — DI client like `TaskBoard`, https opener like `openCommit`, paced `git()` |
| Spec-anchored outcome check | ✅ — asserted values are the spec's (statuses, URLs, bodies, anchors); 3 precision gaps flagged |
| Per-layer coverage expectation | ✅ — main and pure layers 1:1 by unit test; components and hook by smoke + reading, per the Test Coverage Matrix |
| Every test maps to a requirement | ✅ — each new test names its FPRA, S-finding or owner decision |
| Documented guidelines | ✅ — `.specs/codebase/TESTING.md`, Test Coverage Matrix in `tasks.md` |

Privacy: fixtures and tests use `acme` / `platform` / `widget` / `contoso`; the smoke reads the
sandbox's coordinates from the environment and prints counts and line numbers only.

---

## Follow-ups (not blocking)

- **F1 — FPRA-28 in the smoke.** Run the read-only smoke on a PR that modifies an existing file, so the
  original-side check runs instead of SKIP.
- **F2 — FPRA-34 live.** The new-iteration banner needs a push to the PR's branch while the app shows a
  diff; only the decision (`newIterationBanner`) is unit-tested.
- **F3 — FPRA-04 picker.** Drive two active PRs from one branch: the picker's labels and the choice
  surviving a worktree switch are code-read only.
- **F4 — FPRA-08 / FPRA-02 live cases.** The detached-HEAD message and the fork flow are unit-tested in
  main; neither is driven end to end (the sandbox worktree is not to be detached, and it has one
  same-repository PR).
- **F5 — FPRA-17 beyond layout.** Whitespace, Hide/Show unchanged, next/previous change and EOL markers on
  a PR diff are code-read only.
- **F6 — FPRA-30/31 composer.** Preview and a failed post keeping the text are code-read only.
- **F7 — U1 survived.** Add a `classifyThread` case with one deleted reply among live comments, expecting
  `placed` (or `general`), so `every` → `some` fails.
  **Closed after validation (2026-10-10):** `ado-pr-model.test.ts` "keeps a thread with one deleted reply
  among live comments" expects `placed`; it passes on the code and fails with `every` → `some` applied.
- **F8 — Edge cases.** Threads in a file the latest iteration deleted, a reload failing after a write, and
  a PR completed elsewhere are code-read only.
- **F9 — FPRA-14 button.** The smoke never clicks Open in browser; the URL is unit-tested.
- **Spec gaps G1–G3** above: decide FPRA-34's "on screen" with only the Overview open, FPRA-02's
  branch-with-no-upstream case, and drop or reword the thread-paging edge case.

---

## Requirement Traceability Update

**Applied after validation (2026-10-10).** Recommended for `spec.md` (not edited by the Verifier): FPRA-01..35 → **Verified**; FPRA-02 still reads
"Implementing" and is implemented and verified; FPRA-36 stays Verified (#122). The Coverage line
("0 mapped to tasks yet") is stale: all 36 are mapped in `tasks.md`.

---

## Isolation and hygiene

- Real worktree `git status --porcelain`: empty at the start, after the gate, after the sensor
  (checked before the commit of this report)
- No `--allow-writes`; the read-only smoke sends nothing but the app's own GETs
- Privacy scan of the staged diff (the sandbox's coordinates read at run time, and the Windows home
  folder): 1 hit, a common English word in this report's own prose; 0 real names
