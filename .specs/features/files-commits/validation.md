# Files Direction — Commits (F3) Validation

**Date**: 2026-09-20
**Spec**: `.specs/features/files-commits/spec.md`
**Diff range**: `1802d35..HEAD` (21 commits, `006e0f4` first, `6518de6` last) on `feature/files-commits`
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree
**Round**: 2 of 3 — this file replaces round 1's report

## Validation: files-commits — PASS

Round 1 returned FAIL on test strength: one acceptance criterion with no automated evidence
(FCMT-07) and two injected faults that the whole suite could not feel (M1, M5). All three are
closed, and closure was **measured, not read**: M1 and M5 were re-injected exactly as round 1
injected them and both now fail their own file's suite, and FCMT-07's decision is now a pure
function whose guard order two fresh mutations (N1, N2) prove is asserted.

Six further mutations were injected this round against targets round 1 never touched. Three
survived. None is a defect in shipped code and none leaves an AC without evidence; all three are
assertion-precision gaps, ranked below as accept-or-fix items rather than blockers. The verdict is
PASS because every AC now carries `file:line` evidence, the gate is green, and the specific
weaknesses round 1 named are demonstrably gone.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T16 | Done | Unchanged from round 1; the three new commits add no task and change no task record |
| Round-1 fix 1 (`cf08dd2`) | Done | `commitListState` extracted to `src/renderer/src/lib/commit-view.ts:103`, six tests at `commit-view.test.ts:128`; `CommitList.tsx` rewired to render from it. Guard order preserved byte-for-byte against the pre-refactor component (`bases.error` → `!bases` → `base === undefined` → `!page` → `page.error`) |
| Round-1 fix 2 (`6518de6`) | Done | `PAGE_SIZE`-exactly case at `src/main/commit-log.test.ts:266`; paging fixture reseeded by one `git fast-import` (`commit-log.test.ts:35`); `commitFiles` moved to `Promise.allSettled` (`src/main/commit-log.ts:171`) |
| Round-1 fix 3 (`f5cf80a`) | Done | Four-segment wrong-shape Azure row at `src/main/remote-url.test.ts:63` |

Test-count arithmetic reconciles: 1168 (round 1's measured total) + 6 (`commitListState`) + 1
(`PAGE_SIZE` boundary) + 1 (`it.each` rejection row) = **1176**, and `npx vitest run` measures
1176 in 64 files.

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ PASS = the asserted value matches the spec-defined outcome · ⚠️ = partial / spec-precision
gap · ❌ = no evidence. Line numbers are re-derived against `6518de6`; several shifted from round 1.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| FCMT-01 fourth mode **Commits** | Selector offers 4 modes, one named Commits | `scripts/smoke-files-commits.mjs:322` — `modes.length === 4 && modes.includes('Commits')`; code `src/renderer/src/components/FileTree.tsx:25` | ✅ PASS |
| FCMT-02 first-parent, newest first | Own commits + the merge as one row, newest first | `src/main/commit-log.test.ts:153` — `expect(page.commits.map((c) => c.subject)).toEqual(['merge other','mine 3','mine 2','mine 1'])`; `scripts/smoke-files-commits.mjs:355`, `:364`. Sensor N5 confirms `--first-parent` itself is asserted | ✅ PASS |
| FCMT-03 row content | short sha, subject, author, relative date | `scripts/smoke-files-commits.mjs:374` — `/^[0-9a-f]{7,}$/.test(top.shortSha) && top.subject === 'rename the module' && top.author === 'Commit Smoke' && /ago\|just now/.test(top.date)` | ✅ PASS |
| FCMT-04 hover shows full message | The whole commit message | `scripts/smoke-files-commits.mjs:387` — `mergeRow.tooltip.trim() === mergeMessage`; parser side `src/main/commit-log.test.ts:105` — `expect(rows[0].message).toBe(message)` | ✅ PASS |
| FCMT-05 merge marked | Merge row carries a merge mark | `src/main/commit-log.test.ts:111` — `expect(rows[0].isMerge).toBe(true)`; `:115` single parent `.toBe(false)`; `scripts/smoke-files-commits.mjs:395` | ✅ PASS |
| FCMT-06 base picker, shared base | Picker present, on diff-to-origin's persisted base | `scripts/smoke-files-commits.mjs:337` — `baseValue === 'origin/main'`; one picker for both modes at `src/renderer/src/components/FileTree.tsx:302` | ✅ PASS |
| FCMT-07 no `origin/HEAD`, no base → prompt, list nothing | F1's base prompt, empty list | **New this round.** `src/renderer/src/lib/commit-view.test.ts:141` — `expect(commitListState({ defaultBase: null, branches: ['main'] }, undefined, null)).toEqual({ kind: 'no-base' })`; the two guards that must NOT pre-empt it are asserted at `:154` (`{ kind: 'error', message: 'fatal: not a repository' }`) and `:159` (`commitListState(null, undefined, null)` → `{ kind: 'loading' }`). Rendering `no-base` → the prompt string, and returning before the list, is `src/renderer/src/components/CommitList.tsx:39`–`:42` and is still unasserted (sensor N7) | ⚠️ decision proved, rendering unasserted (was ❌) |
| FCMT-08 >100 → newest 100 + Load more | Exactly 100 rows, then Load more; **more than** 100 is the trigger | `src/main/commit-log.test.ts:259` — `expect(page.commits).toHaveLength(PAGE_SIZE)`, `:262` `hasMore` true; **boundary now closed** at `:273`–`:275` — `listCommits(repo, 'HEAD~100')` then `expect(page.commits).toHaveLength(PAGE_SIZE)`, `expect(page.hasMore).toBe(false)`, `expect(page.cursor).toBeNull()`; `scripts/smoke-files-commits.mjs:347` | ✅ PASS (round 1's M5 killed) |
| FCMT-09 Load more appends next 100 | Next page appended below, in order | `src/main/commit-log.test.ts:283` — `expect(second.commits).toHaveLength(50)`, `:284` `second.commits[0].subject === 'c50'`; `src/renderer/src/lib/commit-view.test.ts:92` — `expect(merged.map((r) => r.sha)).toEqual(['a','b','c','d'])`; `scripts/smoke-files-commits.mjs:427` | ✅ PASS |
| FCMT-10 no own commits → says so | The list states the branch has none | `src/main/commit-log.test.ts:170` — `expect(page.commits).toEqual([])`, `:171` `expect(page.error).toBeUndefined()`; **new** `src/renderer/src/lib/commit-view.test.ts:184` — `expect(commitListState({…}, 'origin/main', empty)).toEqual({ kind: 'list', page: empty })`, proving an empty page is a list and not an error state. The **sentence** (`src/renderer/src/components/CommitList.tsx:60`, "This branch has no commits of its own.") is still never asserted | ⚠️ data + state proved, message unasserted |
| FCMT-11 mode restored per worktree | Commits restored on return, like the other three | `scripts/smoke-files-commits.mjs:677` — `entry[1].mode === 'commits'` in `config.ui.files`. Persistence proved; restoration on return never exercised | ⚠️ half the AC (unchanged) |
| FCMT-12 mark commits not on upstream | Exactly the unreachable ones | `src/main/commit-log.test.ts:194` — `expect(page.commits.map((c) => [c.subject, c.pushed])).toEqual([['local 2',false],['local 1',false],['pushed 2',true],['pushed 1',true]])`; `scripts/smoke-files-commits.mjs:403` | ✅ PASS |
| FCMT-13 no upstream → all not pushed | Every row marked | `src/main/commit-log.test.ts:210` — `expect(page.commits.map((c) => c.pushed)).toEqual([false,false,false])`, `:211` `expect(page.upstream).toBeNull()` | ✅ PASS |
| FCMT-14 uncommitted row heads list | `Uncommitted changes (N)`, N = changed files | `src/renderer/src/lib/commit-view.test.ts:104` — `expect(uncommittedRowLabel(3)).toBe('Uncommitted changes (3)')`, `:108` `toBeNull()` when clean; `scripts/smoke-files-commits.mjs:415` | ✅ PASS |
| FCMT-15 row activates uncommitted mode | View switches to uncommitted-changes mode | `scripts/smoke-files-commits.mjs:663` — `mode === 'Uncommitted'` read from `.file-tree-mode.active` | ✅ PASS |
| FCMT-16 open, **or focus**, tab `<short sha> · <subject>` | One tab per commit, titled so; second activation focuses | Title: `src/renderer/src/lib/commit-view.test.ts:66` — `toBe('abc1234 · fix the thing')`, `:72` `'abc1234 · (no subject)'` (sensor N6 confirms the fallback is asserted); opening: `scripts/smoke-files-commits.mjs:510`. Focus-when-already-open still only implied by identity (`diff-view.test.ts:343`) | ⚠️ focus half unproved (unchanged) |
| FCMT-17 first parent → commit | Files compared `commit^1`→`commit` | `src/main/commit-log.test.ts:337` — `expect(detail.files).toEqual([{ path: 'brought-in.txt', status: 'added' }])` for a **merge**, `:338` its stats; `src/renderer/src/lib/commit-view.test.ts:19` — `toEqual({ original: { rev: PARENT, path: 'src/a.ts' }, modified: { rev: SHA, path: 'src/a.ts' } })`; `scripts/smoke-files-commits.mjs:564` | ✅ PASS (re-checked after the `commitFiles` rewrite) |
| FCMT-18 root commit → empty originals | `parent: null`, every original side null | `src/main/commit-log.test.ts:348` — `expect(detail.parent).toBeNull()`, `:349` `status: 'added'`; `src/renderer/src/lib/commit-view.test.ts:60` — `expect(files.map((f) => commitDiffRequest(SHA, null, f).original)).toEqual([null, null])` | ✅ PASS (re-checked after the `commitFiles` rewrite) |
| FCMT-19 presents files exactly as F2's All changes tab | Section behaviour, totals, navigation, layout + whitespace prefs, EOL markers | `scripts/smoke-files-commits.mjs:526`, `:546`, sections at `:517`. Only totals + section list asserted; the rest rests on `AllChangesTab` being mounted unmodified (`src/renderer/src/components/CommitTab.tsx:43`) | ⚠️ 2 of ~11 named behaviours (unchanged) |
| FCMT-20 keyed by sha, closable, kept across modes | Distinct key, one tab per sha, survives a mode switch | `src/renderer/src/lib/diff-view.test.ts:337` — `expect(others).not.toContain(commit)`; `:343`/`:344` identity by sha; `scripts/smoke-files-commits.mjs:574` | ✅ PASS |
| FCMT-21 each row offers Copy sha | The action on every row | `scripts/smoke-files-commits.mjs:489` — clicked on the **first** row only | ⚠️ one row, not "each" (unchanged) |
| FCMT-22 Copy sha → full 40-char sha | Full sha on the clipboard | `scripts/smoke-files-commits.mjs:498` — `copied.seen === copied.sha && /^[0-9a-f]{40}$/.test(copied.seen ?? '')` | ✅ PASS |
| FCMT-23 recognized remote → Open in browser offered | Button present on a GitHub/Azure DevOps upstream | `src/main/commit-log.test.ts:225` — `expect((await listCommits(repo,'main')).browse).toBe('github')`; `src/renderer/src/lib/commit-view.test.ts:124` — `.toBe('enabled')`; `scripts/smoke-files-commits.mjs:594` | ✅ PASS |
| FCMT-24 opens the commit's page on the upstream remote | `https://<host>/…/commit/<sha>` in the default browser | `src/main/commit-log.test.ts:421` — `expect(opened).toEqual([https://github.com/acme/widget/commit/${sha}])`; `src/main/remote-url.test.ts:75`, `:89` the three Azure forms converge on `https://dev.azure.com/acme/platform/_git/widget/commit/${SHA}` | ✅ PASS |
| FCMT-25 not pushed → disabled + tooltip | Disabled, tooltip says not pushed | `src/renderer/src/lib/commit-view.test.ts:120` — `.toBe('disabled')`; `scripts/smoke-files-commits.mjs:602`; main-side refusal `src/main/commit-log.test.ts:433` — `expect(result.ok).toBe(false)`, `:434` `expect(opened).toEqual([])` | ✅ PASS |
| FCMT-26 no upstream / unknown host → not offered | Action absent (not merely disabled) | `src/renderer/src/lib/commit-view.test.ts:115` — `.toBe('hidden')`; `src/main/commit-log.test.ts:237` — `.browse` `toBeNull()`; refusals `:444`, `:454` with `opened` empty | ✅ PASS |
| FCMT-27 recognize GH https+ssh, `dev.azure.com`, `ssh.dev.azure.com`, `<org>.visualstudio.com` | Each form parses to its ref; others null | `src/main/remote-url.test.ts:35` — `it.each(recognized)` × 8, `expect(parseRemote(url)).toEqual(expected)`; rejections `:69` over the table at `:54`, which now holds a **four-segment** wrong-shape Azure path at `:63` (`https://dev.azure.com/acme/platform/notgit/widget`) — the row that makes the `_git` guard reachable | ✅ PASS (round 1's M1 killed) |
| FCMT-28 only an app-built `https` URL is opened | Never the remote URL verbatim; always https | `src/main/remote-url.test.ts:108` — `expect(commitUrl(ref as RemoteRef, SHA).startsWith('https://')).toBe(true)` over the whole recognized table; credential-free `:41`, `:42` and `src/main/commit-log.test.ts:467`, `:468` | ✅ PASS |
| FCMT-29 HEAD moves → refresh within 1 s | New row on top inside a second | `scripts/smoke-files-commits.mjs:625` — polled in 100 ms steps for `waited <= 1000` | ✅ PASS |
| FCMT-30 base change → re-cut | List re-cut against the new merge base | `scripts/smoke-files-commits.mjs:467` — 104 rows → 3, subjects matched exactly | ✅ PASS |
| FCMT-31 refresh keeps an open commit tab | Tab still shows its own commit | `scripts/smoke-files-commits.mjs:633` | ✅ PASS |
| FCMT-32 push/sync/publish/fetch **or window focus** → markers recomputed | Markers recomputed on each of those | `scripts/smoke-files-commits.mjs:653` — push path only; the focus path and its debounce have no assertion | ⚠️ push path only (unchanged) |

**Status**: 26 ✅ PASS · 6 ⚠️ partial · **0 ❌**. Round 1: 25 ✅ · 6 ⚠️ · 1 ❌.
FCMT-07 moved ❌ → ⚠️; FCMT-08 and FCMT-27 kept ✅ and lost their discrimination caveat.

**No regression among the ✅ round 1 recorded.** The three commits touch `commitFiles`
(FCMT-17/18 — both re-checked above, assertions unchanged and still passing), `CommitList`
(FCMT-07/10/14/15 — the refactor preserves the guard order exactly, verified line by line against
the pre-refactor component) and `remote-url` (FCMT-24/27/28 — additive: one row in an existing
rejection table). No assertion was weakened or deleted anywhere in the diff.

---

## Discrimination Sensor

Isolated scratch: `git worktree add --detach D:/tmp-fcm-sensor2 HEAD`, `node_modules` reached by a
junction; each mutation applied to the scratch copy by script and reverted in a `finally`. Baseline
`git status --porcelain` in `D:\playground-main` held only the untracked `validation.md` before and
after; `git worktree list` is back to the single real worktree and `D:\tmp-fcm-sensor2` is gone. No
`git stash` was used.

| # | File:line | Mutation | Covering run | Killed? |
| - | --------- | -------- | ------------ | ------- |
| M1 (re-run) | `src/main/remote-url.ts:29` | `if (segments.length !== 4 \|\| segments[2] !== '_git')` → `if (segments.length !== 4)` | `remote-url.test.ts` 1 failed / 28 passed | ✅ **Killed** (survived in round 1) |
| M5 (re-run) | `src/main/commit-log.ts:82` | `hasMore = logged.length > PAGE_SIZE` → `>= PAGE_SIZE` | `commit-log.test.ts` 1 failed / 25 passed | ✅ **Killed** (survived in round 1) |
| N1 | `src/renderer/src/lib/commit-view.ts:105`–`:106` | `commitListState`: swap the `!bases` and `base === undefined` guards — the list prompts for a base before the branches are known | `commit-view.test.ts` 1 failed / 19 passed | ✅ Killed |
| N2 | `src/renderer/src/lib/commit-view.ts:108` | `commitListState`: drop `if (page.error)` — a failed log renders as an empty list instead of git's line | `commit-view.test.ts` 1 failed / 19 passed | ✅ Killed |
| N3 | `src/main/commit-log.ts:178` | `commitFiles` `allSettled` error path: `error: gitFailureLine(err)` → `error: 'Could not read this commit.'` (a canned string in place of git's own line) | `commit-log.test.ts` 26 passed; **full suite** 1176 passed | ❌ **Survived** |
| N4 | `src/main/commit-log.ts:175` | `commitFiles` `allSettled` error path: `names.rejected \|\| counts.rejected` → `&&` — a one-sided failure falls through to `names.value.stdout` | `commit-log.test.ts` 26 passed; **full suite** 1176 passed | ❌ **Survived** |
| N5 | `src/main/commit-log.ts:67` | `listCommits` drops `--first-parent`, so a merge pours the other branch into the list | `commit-log.test.ts` 1 failed / 25 passed | ✅ Killed |
| N6 | `src/renderer/src/lib/commit-view.ts:49` | `commitTabTitle` drops the `(no subject)` fallback | `commit-view.test.ts` 1 failed / 19 passed | ✅ Killed |
| N7 | `src/renderer/src/components/CommitList.tsx:39` | `if (state.kind === 'no-base')` → never taken: the component stops rendering FCMT-07's prompt | **full suite** 1176 passed | ❌ **Survived** (by design — see below) |
| N8 | `src/main/commit-log.ts:171`–`:184` | Revert `commitFiles` to the pre-`6518de6` `Promise.all` + `try/catch`, byte for byte | `commit-log.test.ts` 26 passed | ❌ Survived (unfalsifiable — see below) |

N3, N4 and N7 were re-injected **together** and the whole suite run against them in the scratch:
`exit=0`, **64 files / 1176 tests passed**. None is caught anywhere in the repository.

**Sensor depth**: expanded — 10 mutations (2 re-runs + 8 new), above the lightweight 1–3, because the
feature reaches `shell.openExternal` and builds URLs from repository content.
**Result**: 7 of 10 killed; 3 survived (one of them, N7, by the project's documented test policy) and
N8 is unfalsifiable by construction.

What each survivor means:

- **N3** — the spec's edge case reads "git's line, not a stale stack", and the test at
  `src/main/commit-log.test.ts:368` asserts only `expect(detail.error).toBeTruthy()`. The half of
  the sentence about the stale stack is asserted precisely (`:369`, `:370` — files and stats empty);
  the half about *whose* line it is, is not. Any non-empty string passes. This is a
  spec-precision gap on a listed edge case, not a defect: the shipped code does call
  `gitFailureLine`.
- **N4** — the rejection guard's `||` is unasserted, because the only failing fixture (a sha the
  repository does not hold, `commit-log.test.ts:366`) fails **both** reads, so `&&` behaves
  identically. A one-sided failure is unlikely but is precisely what commit `6518de6`'s own comment
  worries about (a child process behaving differently from its sibling), and under it `names.value`
  is `undefined` and `commitFiles` throws — from a function documented at
  `src/main/commit-log.ts:146` as "Never throws".
- **N7** — `CommitList` is a React component, and `.specs/codebase/TESTING.md:42` and `:68` state
  that renderer components carry **no** unit tests by convention and are verified by CDP smoke plus
  a visual pass. So this mutant cannot be killed by the suite by design. The gap that matters is the
  other side: the smoke explicitly declares FCMT-07 out of scope at
  `scripts/smoke-files-commits.mjs:688`–`:691`. FCMT-07's *decision* now has evidence; its two
  rendered consequences (the prompt string, and returning before the list) have neither unit nor
  smoke coverage.
- **N8** — reverting to the exact pre-fix `Promise.all` passes, which is expected and worth
  recording: `6518de6`'s stated purpose is an intermittent Windows teardown race (EPERM, "roughly
  one full-suite run in six"), not an observable return value. No assertion can distinguish the two
  forms, so the fix rests on reasoning and on the race not recurring, and the `removeTemp` retry at
  `src/main/commit-log.test.ts:65` would mask a recurrence anyway. Not a gap to fix — a limit to
  state.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — `commitListState` is a fifth pure helper in a file that already held four; the `allSettled` rewrite adds no abstraction |
| Surgical changes | ✅ — three commits, six files, no production behaviour changed except the `commitFiles` error path's shape |
| No scope creep | ✅ — nothing from the Out of Scope table appears; the `fast-import` seeding is a test-fixture speedup confined to one helper |
| Matches patterns | ✅ — pure helper + co-located unit test is this repo's renderer idiom (`diff-view.ts`, `files-view.ts`); `it.each` table growth matches `remote-url.test.ts`'s existing shape |
| Spec-anchored outcome check | ⚠️ — 26 of 32 assert the spec's own value; 6 partial, 0 absent |
| Per-layer Coverage Expectation met | ✅ — main-process logic is 1:1 with its ACs; the extracted renderer helper is unit-tested, which is exactly what `.specs/codebase/TESTING.md:58` asks of "every extracted pure helper" |
| Every test maps to a spec requirement | ✅ — all 8 new tests cite an AC or a sensor mutant in a comment (`commit-view.test.ts:139`, `:150`, `:157`, `:180`; `commit-log.test.ts:267`; `remote-url.test.ts:60`) |
| Documented guidelines followed | ✅ — `.specs/codebase/TESTING.md`, `vitest.config.ts`; privacy guardrail honoured (the new Azure row is `acme`/`platform`/`widget`, the fast-import identity is `Test <test@test.local>`) |
| Comments earn their place | ✅ — each new comment states *why* (the M1/M5 mutants by name, the EPERM race, the AD-032 ordering), not what |

---

## Edge Cases

- [x] Empty subject → `(no subject)` — `src/main/commit-log.test.ts:121`, `src/renderer/src/lib/commit-view.test.ts:72` (sensor N6 confirms both are load-bearing)
- [ ] Detached `HEAD` still lists first-parent commits — **no evidence** (unchanged from round 1)
- [~] Commit gone after an aggressive `gc` → git's line, not a stale stack — `src/main/commit-log.test.ts:368`–`:370`. The stale-stack half is precise; "git's line" is asserted only as `toBeTruthy()` (sensor N3)
- [ ] A commit changing >10 files follows FDIF-21 — inherited from `AllChangesTab`, not asserted for a commit tab
- [~] Amend: new sha in the list, old tab unchanged — nearest evidence follows a new commit, not an amend
- [x] Credentials never reach the built URL — `src/main/remote-url.test.ts:41`, `src/main/commit-log.test.ts:467`

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npx vitest run`
- **typecheck**: exit 0, clean (node + web projects)
- **lint**: exit 0 — **0 errors, 18 warnings**, identical to the T1 baseline; the three new commits added none
- **npx vitest run**: exit 0 — **1176 passed / 1176**, 64 files, 0 failed, 0 skipped (80.05 s)
- **Test count**: 1098 (F2 tip `1802d35`) → 1168 (round 1) → **1176** (+8 this round, +78 for the feature)
- **Intermittency**: none observed. The full suite ran **three** times end to end during this round
  (once on the real tree, twice in the scratch with mutants injected) and reported 64/64 files and
  1176/1176 tests every time. No EPERM, no teardown failure, no flaky file.
- **Manual gate**: `node scripts/smoke-files-commits.mjs` — 27/27 reported by the author against a
  live app. The Verifier did **not** re-run it (driving the app is outside this run's sandbox); the
  script is byte-identical to the one round 1 audited, so round 1's two recorded weaknesses stand
  (suffix regexes for the removed totals at `:535` and `:551`; Copy sha exercised on one row).

---

## Ranked Gaps (residual — none blocking)

1. **FCMT-07's rendered prompt has no coverage on either side** (Minor). The decision is now proved
   (`src/renderer/src/lib/commit-view.test.ts:141`), but `src/renderer/src/components/CommitList.tsx:39`–`:42`
   — mapping `no-base` to F1's sentence and returning before the list — is killed by no test
   (sensor N7) and explicitly excluded from the smoke
   (`scripts/smoke-files-commits.mjs:688`). Fix: seed a second repository without `origin/HEAD` in
   the smoke and assert the prompt text plus a zero-row list. Accept-and-note is defensible:
   `.specs/codebase/TESTING.md:42` puts components outside the unit layer on purpose.
2. **Sensor N3 survived — the `gc` edge case does not assert *whose* error line it is** (Minor).
   `src/main/commit-log.test.ts:368` accepts any truthy string. Fix: one line — assert the message
   contains git's own wording (e.g. `expect(detail.error).toContain('fatal')`), the same shape the
   spec's "git's line" names.
3. **Sensor N4 survived — the one-sided rejection branch is unasserted** (Minor). Both reads fail
   together in the only failing fixture, so `||` and `&&` are indistinguishable today, and under a
   one-sided failure `commitFiles` would throw from a function documented never to throw. Fix: a
   unit test with `git` stubbed so exactly one of the two rejects, asserting the error shape is
   still returned.
4. **FCMT-32's focus path is unasserted** (Minor, carried from round 1). The debounced
   `window focus` refresh in `src/renderer/src/lib/use-files.ts` is half the AC.
5. **FCMT-16's "or focus when already open" is unproved** (Minor, carried). Nothing activates the
   same commit twice.
6. **FCMT-11 proves persistence, not restoration** (Minor, carried).
   `scripts/smoke-files-commits.mjs:677` reads the config; a switch away and back would prove the AC.
7. **FCMT-10's message and FCMT-21's "each row"** (Minor, carried). Assert the empty-state sentence
   at `src/renderer/src/components/CommitList.tsx:60` and that every `.commit-row` carries a
   `.commit-copy`.
8. **FCMT-19 rests on structure** (Minor, accept-and-note, carried). Only totals and the section list
   are checked; the rest is inherited by mounting `AllChangesTab` unmodified.
9. **The `allSettled` fix is unfalsifiable by the suite** (note, not a gap). Sensor N8 shows the
   pre-fix code still passes, and `removeTemp`'s retry (`src/main/commit-log.test.ts:65`) would mask
   a recurrence of the race. Nothing to fix; worth knowing before anyone "simplifies" it back.

---

## Requirement Traceability (proposed — `spec.md` not modified by this run)

| Requirement | Previous (round 1) | New |
| ----------- | ------------------ | --- |
| FCMT-01..06, 09, 12..15, 17, 18, 20, 22..31 | ✅ Verified | ✅ Verified |
| FCMT-08, 27 | ✅ Verified, discrimination gap | ✅ **Verified** — mutants M5 and M1 now killed |
| FCMT-07 | ❌ Not verified — no evidence | ⚠️ **Partially verified** — decision asserted, rendering not (gap 1) |
| FCMT-10, 11, 16, 19, 21, 32 | ⚠️ Partially verified | ⚠️ Partially verified (gaps 4–8) |

---

## Summary

**Overall**: ✅ Ready — with nine residual notes, all Minor, none blocking.

**Spec-anchored check**: 26/32 ACs matched the spec-defined outcome · 6 partial · 0 with no evidence
**Sensor**: 7/10 mutants killed; both of round 1's survivors (M1, M5) are now dead; 3 new survivors,
all assertion-precision or by documented test policy; 1 unfalsifiable by construction (N8)
**Gate**: 1176 passed, 0 failed, 0 skipped; typecheck clean; lint 0 errors / 18 warnings (baseline)

**What works**: everything round 1 confirmed, plus the two boundaries it could not feel — a branch
of exactly 100 own commits now says there is no more, and the Azure `_git` shape guard is reachable
by the test that claims it. FCMT-07's state machine is now a pure function whose guard **order** is
asserted, which is the part that carried the meaning (a repository whose branches failed to list
shows git's line and never an invitation to choose from nothing).

**Issues found**: no defect in shipped code. Three assertion-precision gaps, the sharpest being that
the `gc` edge case accepts any error string where the spec says git's line.

**Next steps**: gaps 1–3 are three small tests and may be routed as fix tasks or accepted
explicitly; gaps 4–9 were already Minor in round 1 and are carried unchanged. The feature is done
on the evidence standard this skill sets.

---

## Addendum — two residual gaps closed after the PASS (author, not verifier)

Written by the implementer, **after** round 2 returned PASS. It does not restate or revise that
verdict; it records work that landed on top of it, so the report is not read as describing a tree
that no longer exists. Round 2's evidence stands for commit `6518de6`; the tree now ends at the
commit below.

Residual gaps **2 (N3)** and **3 (N4)** from round 2's ranked list are closed. Gap 1 (FCMT-07's
rendered prompt) and gaps 4-9 are carried, unchanged and still Minor.

| Gap | Change | Mutation check |
| --- | ------ | -------------- |
| 2 — the `gc` edge case accepted any error string where the spec says git's line | `src/main/commit-log.test.ts` now asserts `expect(detail.error).toContain('fatal')` | Replacing `gitFailureLine(err)` with a canned string **fails** that test |
| 3 — `commitFiles` would throw if exactly one of its two reads failed, from a function documented "Never throws" | `commitFiles` takes an injectable `GitRunner`, as `readDiffSides` already does; a new test fails only the `--numstat` read and asserts git's line comes back | Weakening the rejection guard from `||` to `&&` **fails** that test |

Both mutations were injected into `src/main/commit-log.ts`, run, and the file restored from a copy;
`git diff` confirmed the restore. Gate after the change: typecheck exit 0, lint 0 errors / 18
warnings (baseline), `npx vitest run` **1177 passed / 1177** in 64 files.

**This addendum is author self-check, not independent verification.** The two mutation runs are
mechanical — a mutant either fails a named test or it does not — but no fresh Verifier re-derived
coverage over this tree. A third round was judged not worth its cost: round 2 called these
"assertion precision on an edge case" and "an unreachable-in-practice defensive branch", and closing
them can only add assertions, never weaken one.
