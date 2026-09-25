# Status Bar Validation (re-verification round 3 of 3)

## Validation: status-bar — PASS

**Date**: 2026-09-19
**Spec**: `.specs/features/status-bar/spec.md` (STBR-01..32 and 6 edge cases)
**Diff range**: `eb78540..baf872f` (30 commits). Two commits landed since round 2 (`e558587`): `6e03598` makes Pull and Sync run `pull --ff-only --no-rebase` and adds real-git tests for the dirty pull; `baf872f` adds nine smoke checks.
**Verifier**: an independent sub-agent that did not write this code. It used evidence-or-zero: an AC with no `file:line` assertion and no numbered smoke check counts as not covered. The whole feature was re-derived, not only the round-2 gaps.

**Why PASS**: all three gates are green. Every one of the 32 ACs and all 6 edge cases now has `file:line` or numbered-smoke evidence that targets the outcome the spec defines. All 8 sensor mutants were killed, including round 2's two survivors (M29, M30) and a mutant that drops `--no-rebase` (M31). What remains are three spec-wording notes. None of them blocks: the code does what the spec intends, but the spec text does not pin it word for word.

Smoke evidence comes from reading `scripts/smoke-status-bar.mjs`. Checks are numbered in execution order (`check()` call sites). There are 56 when the empty-state block (#52–55) runs, so the orchestrator's **56/56 PASS** on `6e03598`/`baf872f` includes it. The verifier did not run the smoke or start the app. Earlier orchestrator evidence: reverting `21eff74` fails #39, and M19 (buttons enabled while running) fails #22.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T17 | ✅ Done | Re-derived below |
| T18 (smoke) | ✅ Done | 56 checks; #43–51 are new in `baf872f` |
| Round-2 fixes 1–4 | ✅ Done | `6e03598` (Fix 1), `baf872f` (Fixes 2–4) |

---

## Spec-Anchored Acceptance Criteria

Unit tests use `path:line` with the assertion. Smoke is `smoke:<line of the check() call>` (#N).

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Verdict |
| -- | -------------------- | ---------------------------------- | ------- |
| STBR-01 | Bar below main in every direction | smoke:595 #2–4 `b.present && b.repo === 'acme-widget'` in Tree/Board/Workflows; smoke:1013 #40 Agents; smoke:1263 #52–55 `b.present` in all 4 with nothing selected | ✅ (4 directions exist on this branch; see note 2) |
| STBR-02 | Repo + branch of the selected worktree | `src/renderer/src/lib/status-bar.test.ts:130-131` `worktree.path).toBe('C:/work/acme/widget')`, `repoName).toBe('widget')`; smoke #2–4 `b.branchTitle === LONG_BRANCH` | ✅ |
| STBR-03 | Agents + session → that session's worktree | `status-bar.test.ts:53-54` path `widget-12345` while `selectedId` is `widget`; smoke:1013 #40 `b.branchTitle === SYNC_BRANCH` with the tree on LONG_BRANCH | ✅ |
| STBR-04 | Non-worktree cwd → path, no sync, no counter | `status-bar.test.ts:65` `toEqual({ kind: 'folder', path: 'C:/Windows' })`, `:92` sibling-prefix folder; smoke:1022 #41 `b.folder === loose && b.sync === null && b.changes === null`; smoke:1035 #42 subfolder → worktree | ✅ |
| STBR-05 | Nothing selected → mounted, neutral | `status-bar.test.ts:144` `toEqual({ kind: 'none' })` for 4 directions; smoke:1263 #52–55 `b.empty === 'No worktree selected'` | ✅ |
| STBR-06 | Middle truncation, one ellipsis, start and end kept, ≤ half the bar | `status-bar.test.ts:186`, `:206-207` `head + tail === branch`; smoke:603 #5 `headTruncated && head + tail === LONG_BRANCH`; smoke:611 #6 `branchWidth <= barWidth / 2 + 0.5`; smoke:616 #7 gap < 0.5 px | ✅ |
| STBR-07 | Untruncated name in `title` | smoke:603 #5 `long.branchTitle === LONG_BRANCH`; smoke:948 #36 detached title | ✅ |
| STBR-08 | `(detached <short-sha>)`, as the sidebar shows it | `src/main/git-sync.test.ts:178` `detachedSha: sha`; smoke:948 #36 `detachedLabel === '(detached ' + sha7 + ')'` taken from the sidebar tree, `head + tail === detachedLabel` | ✅ |
| STBR-09 | Pull and push counts from local refs | `git-sync.test.ts:90-96` `behind: 2, ahead: 1, upstream: 'origin/main'`; `:66` `parseAheadBehind('2\t1\n')`; `status-bar.test.ts:226`; smoke:637 #10 `'↓1 ↑1'` | ✅ |
| STBR-10 | No network unless asked | `git-sync.test.ts:169` `lastFetchAt).toBeNull()` after a read (a read that fetched would write FETCH_HEAD; round-2 M28 killed); smoke:621 #8 `'↓0 ↑1'` while the remote holds an unseen commit, smoke:629 #9 `'Last fetched: never'` | ✅ |
| STBR-11 | A tree refresh recomputes the counts | smoke:703 #18 `b.sync === '↓0 ↑1'` after a local commit + Refresh | ✅ |
| STBR-12 | No upstream + a remote → `no upstream`, publish offered | `git-sync.test.ts:105-112` `upstream: null` with no error; `status-bar.test.ts:239`; smoke:826 #27 `'no upstream'` as a `BUTTON`; #28–30 publish | ✅ |
| STBR-13 | No remote / detached → reason, no remote-writing op | Detached: smoke:958 #37 `syncTag === 'SPAN' && !pop.open` after a click. No remote: `git-sync.test.ts:120` `remotes: []`, `status-bar.test.ts:247` `kind: 'no-remote'`, **smoke:1164 #51** `b.sync === 'no remote' && syncTag === 'SPAN' && /muted/ && !pop.open` after a click, repo `acme-gizmo` with `git remote` empty | ✅ (round-2 partial closed) |
| STBR-14 | Git failure → section shows git's first error line; repo, branch and counter still render | `git-sync.test.ts:188-189` `error` matches `/^fatal: /` with zeroed counts; `status-bar.test.ts:265-268`; smoke:967 #38 `/^fatal: /.test(b.sync) && repo === 'acme-widget' && branchTitle === GONE_BRANCH && changes === '1'` | ✅ |
| STBR-15 | Popover: Sync, Pull, Push, Fetch + two lists | `git-sync.test.ts:246-247` incoming/outgoing subjects; smoke:644 #11 `To pull` / `To push` with the right subjects; **smoke:1046 #43** `labels.join() === 'Sync,Pull,Push,Fetch'` | ✅ (round-2 minor closed) |
| STBR-16 | Short hash, subject, relative date, cap 20, `+N more` | `git-sync.test.ts:260-262` `toHaveLength(20)` ×2, `moreIncoming: 1, moreOutgoing: 2`; smoke:809 #26: 20 rows in order, `sha` `/^[0-9a-f]{7,}$/`, age `/^(just now\|\d+[mhd] ago)$/`, `more === '+3 more'` | ✅ |
| STBR-17 | Sync = `pull --ff-only` then `push` | `git-sync.test.ts:387-392` HEAD = remote tip after a pull-sync, remote = HEAD after a push-sync; `:380-382` no push after a failed pull; smoke:692 #17, smoke:709 #19 | ✅ (see note 3 for `--no-rebase`) |
| STBR-18 | Diverged → worktree unchanged + git's first error line | `git-sync.test.ts:301-302` `toEqual({ ok: false, error: 'fatal: Not possible to fast-forward, aborting.' })` + HEAD unchanged; `:313-315` sync also leaves the remote unchanged; the `error:` branch is now pinned at `:348-350`, `:363-365`; smoke:670 #14, smoke:675 #15 | ✅ (round-2 `error:` note closed; M29 killed) |
| STBR-19 | One remote → `push -u <remote> <branch>` | `git-sync.test.ts:398-403` `@{upstream}` = `origin/user/dev/4821-fix-login`, remote ref = HEAD | ✅ |
| STBR-20 | Several remotes → user must choose | `git-sync.test.ts:414-420` refused and no upstream set, then `fork/…`; smoke:833 #28 Publish disabled with an empty select, smoke:850 #29 enabled after a choice, smoke:860 #30 upstream `backup/…` | ✅ |
| STBR-21 | Fetch only the upstream remote + branch | `git-sync.test.ts:434-437` refs/remotes is exactly `refs/remotes/origin/main` although `release` and `fork` exist; M33 killed | ✅ |
| STBR-22 | Fetch age; `never` when never | `git-sync.test.ts:129,139,148-149,163,169`; `status-bar.test.ts:276,280-281`; smoke:629 #9, smoke:659 #13 | ✅ |
| STBR-23 | While running: buttons disabled + activity indicator | smoke:738 #22 `status === 'Pushing…' && buttons.length === 4 && buttons.every(disabled) && loader`; smoke:748 #23 re-enabled, loader gone, ≥ 3.5 s (a 4 s `pre-push` hook). M19 fails #22 (orchestrator) | ✅ |
| STBR-24 | Killed after 120 s, reported as a timeout | `git-sync.test.ts:454` `OP_TIMEOUT_MS).toBe(120_000)`, `:459` `toHaveBeenCalledWith(repo, ['push'], { timeoutMs: 120_000 })`, `:465` `{ ok: false, timedOut: true }`; `src/main/git.test.ts:37` `isTimeout(err) === true` after a real kill | ✅ (report wording: note 1) |
| STBR-25 | Success → counters recomputed **and tree refreshed** | Counters: smoke #17, #19, #30 `b.sync === '↓0 ↑0'`. Tree: **smoke:1086 #45** `staleChanges === '0' && porcelain === 1 && b.changes === '1'`. The counter reads only the tree snapshot (`StatusBar.tsx:120` `worktree.changes`). Nothing refreshes the tree on a timer or on focus (`App.tsx:146-155` refreshes tasks only, `use-tree.ts:29`), and `loadState` does not touch the tree. So only `onRefreshTreeRef.current()` (`use-git-sync.ts:144`) can turn `0` into `1` | ✅ (round-2 GAP closed) |
| STBR-26 | Selection change → op continues, bar follows, toast | smoke:771 #24 `b.branchTitle === LONG_BRANCH && !pop.open && midPush`; smoke:786 #25 toast `/^Push finished in sync/`, origin tip = HEAD, bar still on LONG_BRANCH | ✅ |
| STBR-27 | `execFile`, no shell, `GIT_TERMINAL_PROMPT=0` | `git.test.ts:67` `toBe('prompt=0')` with the parent env set to `1`; `:74` shell metacharacters echo back literally. `git-sync.ts` spawns git only through `git()` (`git-sync.ts:4`) | ✅ |
| STBR-28 | At most one op per worktree | `git-sync.test.ts:447-450` `{ ok: false, busy: true }`, remote unchanged, first call completes, a later push succeeds; M34 killed | ✅ |
| STBR-29 | Counter = changed-file count | smoke:870 #31 `b.changes === '5'` | ✅ |
| STBR-30 | Every path with its 5-value status | smoke:888 #33 labels `Added,Deleted,Modified,Renamed,Untracked` + a class per label | ✅ |
| STBR-31 | No changes → `0`, popover says none | smoke:936 #35 `b.changes === '0' && emptyText === 'No changes.'` + empty porcelain | ✅ |
| STBR-32 | No per-file action | smoke:917 #34: 5 `DIV` rows, 0 controls, 0 React `on*` handlers | ✅ |

**Status**: 32/32 matched. 3 non-blocking spec-precision notes.

### Edge cases

| Edge case | Evidence | Verdict |
| --------- | -------- | ------- |
| Worktree folder deleted → keep repo + branch, section reads `The worktree folder no longer exists`, no counter, no operation | `git-sync.test.ts:195-196` `toMatchObject({ missing: true, error: MISSING_FOLDER })` + literal; smoke:987 #39 `branchTitle === GONE_BRANCH && sync === 'The worktree folder no longer exists' && syncTag === 'SPAN' && changes === null` after the select-away-and-back race (a `21eff74` revert fails it) | ✅ |
| Dirty worktree + ff-only pull would overwrite → fails with git's message, changes nothing | `git-sync.test.ts:341-353` (Pull) and `:355-369` (Sync): `error).toBe('error: Your local changes to the following files would be overwritten by merge:')`, HEAD unchanged, file content unchanged, remote unchanged (Sync). The test repo pins `pull.rebase=true` (`:337`), the worst case a Git for Windows machine brings. M29, M30 and M31 **killed** | ✅ (round-2 GAP closed) |
| Escape or outside click closes a popover | Escape: smoke:1112 #46 (sync), smoke:1121 #47 (changes), via a `keydown` that reaches the `window` listeners. Outside click: smoke:1130 #48 (changes); sync popover smoke:718 #20 (a toast appears only if `document.body.click()` closed it, `use-git-sync.ts:147`) | ✅ (round-2 GAP closed) |
| Opening one popover closes the other | smoke:1141 #49 `pops.changes && !pops.sync`; smoke:1149 #50 `pops.sync && !pops.changes`. The trigger clicks call `stopPropagation` (`StatusBar.tsx:52,59`), so the other popover's outside-click listener never sees them. What closes the other popover is the single `open` state (`StatusBar.tsx:43`), and the checks exercise exactly that | ✅ (round-2 GAP closed) |
| `rev-list` fails on a missing upstream ref → STBR-14, not stale counts | `git-sync.test.ts:182-189`; smoke:967 #38; M35, M36 killed | ✅ |
| Op finishes with its popover open → inline, no toast | smoke:1072 #44 `toastBefore === null && pop.status === 'Done.' && popAfter.open && toastsSeen.length === 0` (sampled every 100 ms for 2 s after `Done.`; a toast lives 2.2 s) | ✅ (round-2 partial closed) |

---

## Spec-Precision Gaps (non-blocking notes)

1. **STBR-24 "report that it timed out"**: the wording is not defined. The seam returns `timedOut: true` + `Timed out after 120 s.` (`git-sync.ts:69`), and the popover appends `Git was stopped — finish this from a terminal.` (`SyncPopover.tsx:36`). The flag is asserted (`git-sync.test.ts:465`); the text is not, and the spec does not ask for any. This carries over from rounds 1–2. It is a judgement call: the observable outcome, a timeout reported as a timeout, is pinned.
2. **STBR-01 / Independent Test, "five directions"**: four directions exist on this branch because Hours is not merged (an accepted deviation). Re-check after the merge into `develop`.
3. **STBR-17 and Assumption "Sync semantics"** say `pull --ff-only`, but the code runs `pull --ff-only --no-rebase` (`git-sync.ts:35`). `design.md:87` records why: Git for Windows sets `pull.rebase=true` system-wide, which made a dirty pull refuse with a rebase message instead of the overwrite error. The flag keeps the pull a fast-forward on every machine, which is what the spec intends. The spec text should name the flag, as the design does.

## SPEC_DEVIATIONs reviewed

| Marker | Judgement |
| ------ | --------- |
| `src/main/git-sync.ts:78-82` `errorLine` vs `gitFailureLine` | Accepted; spec aligned. Both prefixes are now pinned: `fatal:` at `git-sync.test.ts:301`, `error:` at `:348` |
| `StatusBar.css` 50% cap on `.status-bar-branch` | Accepted; smoke #6 measures it |
| Newest FETCH_HEAD across the common dir + `worktrees/*` | Accepted; spec corrected; `git-sync.test.ts:148-149,163` |
| Session cwd → deepest containing worktree | Accepted; `status-bar.test.ts:92,116` |

---

## Discrimination Sensor

Scratch: a detached worktree at `%TEMP%\stbr-verify3` on `baf872f`, with a directory junction to the main tree's `node_modules`. Scratch baseline: `git-sync.test.ts` + `status-bar.test.ts`, 54 tests passing. Each mutant was applied alone by script with an anchor that had to be unique, the listed test file was run, and the file was restored byte-for-byte. The scratch porcelain was empty after the run.

| # | File:line | Mutation | Tests run | Killed? |
| - | --------- | -------- | --------- | ------- |
| M29 | `src/main/git-sync.ts:85` | `errorLine` regex `/^(fatal\|error):/` → `/^(fatal):/` (round-2 survivor) | git-sync | ✅ Killed (2: `:341`, `:355`) |
| M30 | `src/main/git-sync.ts:39` | Sync's pull gains `--autostash` (round-2 survivor) | git-sync | ✅ Killed (`:355`) |
| M31 | `src/main/git-sync.ts:35` | `--no-rebase` dropped from Pull and Sync | git-sync | ✅ Killed (2: `:341`, `:355`) |
| M32 | `src/main/git-sync.ts:39` | Sync swallows a failed pull and pushes anyway | git-sync | ✅ Killed (3: `:305`, `:355`, `:371`) |
| M33 | `src/main/git-sync.ts:53` | Fetch fetches the whole upstream remote, not only the branch (STBR-21) | git-sync | ✅ Killed (`:424`) |
| M34 | `src/main/git-sync.ts:72` | the per-worktree guard is never released (STBR-28) | git-sync | ✅ Killed (3) |
| M35 | `src/renderer/src/lib/status-bar.ts:109` | an error no longer outranks counts (STBR-14) | status-bar | ✅ Killed (`:263`) |
| M36 | `src/main/git-sync.ts:216` | every `rev-list` failure is read as no-upstream (missing-upstream-ref edge case) | git-sync | ✅ Killed (`:182`) |

**Sensor depth**: expanded (≥5), because the feature writes to remotes. 8 mutants: 2 re-runs of round-2 survivors, 1 for the new flag, 5 fresh ones.
**Sensor verdict**: 8/8 killed.

The renderer layer is CDP-smoke-only (tasks.md, Test Coverage Matrix), and the brief forbids running the smoke. So the new smoke checks' power to catch faults was judged by reading them, not by execution:
- #45 fails if `onRefreshTreeRef.current()` is removed, because no other path updates the tree-fed counter (see STBR-25).
- #44 fails if the toast becomes unconditional.
- #49 and #50 fail if the two popovers get independent open states.
- #46 and #47 fail if the Escape listener is removed.

M19 (#22) and the `21eff74` revert (#39) have executed evidence from the orchestrator.

Cleanup: the junction was deleted first (the real `node_modules` is intact), then `git worktree remove --force`, then `git worktree prune`. Afterwards `git worktree list` showed only `D:/playground-main` on `baf872f`. The porcelain was identical to the pre-sensor baseline (`M .specs/LESSONS.md`, `M .specs/lessons.json`, `?? …/validation.md`), and `git diff HEAD -- src scripts` was empty.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / surgical changes | ✅ Since round 2, `git-sync.ts` gained one shared `pull` argument list and a comment. The rest is tests, smoke and docs |
| No scope creep | ✅ |
| Matches patterns | ✅ Real git in temp dirs with a bare remote, as `worktree-manager.test.ts` does |
| Spec-anchored outcome check | ✅ Exact strings for both error prefixes; note 1 remains a judgement call |
| Per-layer Coverage Expectation | ✅ `git-sync.ts`: every locally reachable edge case has a real-git test. Renderer: every AC half and edge case has a numbered smoke check |
| Every test maps to a spec requirement | ✅ The new tests map to the dirty-pull edge case; the new smoke checks map to STBR-13, 15, 25 and 4 edge cases |
| Documented guidelines: `.specs/codebase/TESTING.md` (pure seam + hand-verified shell) | ✅ |

---

## Gate Check

| Gate | Command | Exit | Detail |
| ---- | ------- | ---- | ------ |
| Typecheck | `npm run typecheck` | 0 | node + web clean |
| Lint | `npm run lint` | 0 | 0 errors / 18 warnings, the baseline. All are in `scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs` and `src/shared/tasks.test.ts`, none in a feature file |
| Tests | `npx vitest run` | 0 | 55 files, **981 passed**, 0 failed, 0 skipped (70.7 s) |

- **Test count**: 917 before the feature, 979 at round 2, **981** now (+2 in `git-sync.test.ts`: the dirty pull and the dirty sync). None deleted or weakened.
- **Smoke**: not run by the verifier (it drives the owner's live app). The orchestrator reports 56/56.

---

## Round 2 gaps → status

| Round-2 gap | Status |
| ----------- | ------ |
| Edge: dirty pull, no evidence; M29 and M30 survived | ✅ Closed: `git-sync.test.ts:341-369`; M29, M30 and M31 killed |
| STBR-18 `error:` branch unpinned | ✅ Closed: `git-sync.test.ts:348,363` exact `error:` line |
| STBR-25 tree-refresh half | ✅ Closed: smoke #45 |
| STBR-13 no-remote rendering | ✅ Closed: smoke #51 (a second fixture repo with no remote) |
| STBR-15 `Pull` label | ✅ Closed: smoke #43 exact label order |
| Edge: Escape / outside click | ✅ Closed: smoke #46, #47, #48 (+ #20 for the sync popover's outside click) |
| Edge: one popover at a time | ✅ Closed: smoke #49, #50 |
| Edge: inline, no toast | ✅ Closed: smoke #44 |
| Spec-precision 1 (STBR-24 wording), 2 (five directions) | ⚠️ Carried over as non-blocking notes |
| Spec-precision 3 (no AC for an `error:`-only failure) | ✅ Closed by the dirty-pull tests |

---

## Requirement Traceability Update (proposed; the verifier does not edit spec.md)

| Requirement | New status |
| ----------- | ---------- |
| STBR-01..32 | ✅ Verified |
| Edge cases (6) | ✅ Verified |
| Spec text | Name `--no-rebase` in STBR-17 / "Sync semantics" (note 3); recheck "five directions" after the Hours merge (note 2) |

---

## Summary

**Overall**: ✅ Ready. All round-2 gaps are closed with evidence that targets the outcome the spec defines, and the unit-tested layers catch every mutant tried.

**Spec-anchored check**: 32/32 ACs and 6/6 edge cases matched; 3 non-blocking spec-precision notes.
**Sensor**: 8/8 killed (M29, M30, M31, M32, M33, M34, M35, M36).
**Gate**: typecheck 0, lint 0 (0 errors / 18 warnings = baseline), vitest 981/981.

**Next steps**: optionally align the spec text (notes 2 and 3). No fix tasks.
