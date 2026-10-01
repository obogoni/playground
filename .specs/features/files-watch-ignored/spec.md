# Files Watch Ignored Specification

## Problem Statement

While the Files view is open, main watches the whole selected worktree recursively and filters out only
`.git/`, so build output and dependency folders (`bin`, `obj`, `node_modules`, `dist`) fire events too.
Every 250 ms batch makes the view refresh its mode (in Uncommitted mode a `git diff --numstat HEAD`, a
`git ls-files --others`, a read of every untracked file and a `git status`; in Full mode three git
commands per expanded folder), and every mounted All changes section re-reads its diff because the
section requests are rebuilt on every refresh. Nothing stops a batch while the previous refresh is still
running, so during an agent's build the refreshes overlap and pile up. Upstream issue #150 is the
owner-approved scope; #147's bench and baseline are its measurement.

## Goals

- [ ] A write under a folder git ignores starts no git process and refreshes nothing, measured with #147's bench plus a build-folder write loop
- [ ] Batch refreshes never overlap: a burst of batches runs at most one refresh after the running one
- [ ] An All changes section re-reads only when its file was written or the git state moved
- [ ] The view's own reads leave `.git/index` untouched, so they never wake the git-state watchers
- [ ] The view stays as live as today: a file an agent writes shows its new diff within 1 s on the smoke seed

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Monaco and the file icons | Issue #150: neither grows with the number of sessions (startup cost only) |
| The git-state cascade (`GitStateWatcher` recounts, `STATUS_ARGS`) | Issue #150: its own issue (#149) |
| Reading every untracked file on each Uncommitted refresh (`untrackedStats`) | Not named by #150; the filter already removes the build-output case that made it expensive |
| Gating the refreshes a mode switch, a base change, a discard or a mount starts | See the assumption below: they are user-paced and must answer at once |
| Watching `.git/info/exclude` and `core.excludesFile` for changes | See the assumption below: picked up on the next selection, `.gitignore` change or git-state change |
| A shorter or adaptive batch delay (`BATCH_MS`) | FXPL-21/22 hold today with 250 ms; FOLD-08 is tied to it |
| Changing the bench's existing columns or targets | #147 owns them; this feature adds rows to `OPTIONS` and a Files block |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What the watcher drops | Every path git ignores in the worktree, as well as `.git/`; ignored files never reach the view, so they cannot change what it shows | Issue #150, Solution 1 and User Story 5 | owner confirmed 2026-10-01 |
| Overlap | A refresh never starts while the previous one runs; batches during a run cause exactly one more refresh after it | Issue #150, Solution 2 and Implementation Decisions | owner confirmed 2026-10-01 |
| Section re-reads | A section re-reads only when the batch names its path or the git state changed; its request is stable per file across refreshes | Issue #150, Solution 3 and Implementation Decisions | owner confirmed 2026-10-01 |
| Liveness | A file an agent writes shows its new diff within about a second, as today | Issue #150, Solution 4 | owner confirmed 2026-10-01 |
| How the ignore decision is made | Git itself decides; the mechanism is chosen in the design and measured; answers are cached per watch | Issue #150, Implementation Decisions | owner confirmed 2026-10-01 |
| Index locks | Reads that do not need the index lock run with `--no-optional-locks` | Issue #150, Implementation Decisions | owner confirmed 2026-10-01 |
| Where the single flight lives | In the Files hook, with one trailing run | Issue #150, Implementation Decisions | owner confirmed 2026-10-01 |
| Target and tests | Bench from #147 plus a build-folder write loop: no git process from ignored writes, no overlapping refreshes; watcher unit tests on a real temp repository; refresh scheduler unit tests; the Files diff smoke passes, with a new check first seen failing on the current build | Issue #150, Solution and Testing Decisions | owner confirmed 2026-10-01 |
| Order | Executes after #147 (bench and baseline) | Issue #150, Further Notes | owner confirmed 2026-10-01 |
| The ignore mechanism | `git check-ignore --stdin -z` once per batch, only for paths and parent folders with no cached answer; an ignored folder is cached as a prefix; answers are forgotten on a new selection, a `.gitignore` change and a git-state change | Planning probe (design.md): about 53 ms for a first batch on a 20,000-file repository, it sees folders created after the view opened, and it never calls a tracked file ignored; the ignored-folder list needs a second mechanism for folders created later | owner confirmed 2026-10-01 |
| `--no-optional-locks` is not enough | Every Files read also passes `-c diff.autoRefreshIndex=false` | Planning probe, git 2.55.0.windows.4: `git diff --numstat HEAD` rewrote `.git/index` after a same-bytes rewrite even with `--no-optional-locks`; with the config off it did not | owner confirmed 2026-10-01 |
| Stat-only changes after the fix | The view no longer refreshes git's cached file stats; a file rewritten with its own bytes is re-hashed by each later read until another git command refreshes the index | The refresh is exactly the index write that wakes both watchers; hashing one small file is cheaper than a recount and a full re-read of every diff | owner confirmed 2026-10-01 |
| Excludes outside the worktree | A change to `.git/info/exclude` or to `core.excludesFile` takes effect on the next selection, `.gitignore` change or git-state change | Neither file is watched; watching them adds handles for a rare edit | owner confirmed 2026-10-01 |
| What the gate covers | The refreshes `files:changed` batches start; a mode switch, a base change, a discard and the first listing refresh at once, as today | They are user-paced and must answer at once; the pile-up the issue measures comes from batches | owner confirmed 2026-10-01 |
| What a running refresh is | Every read the hook starts for a batch (mode list, counts, open file tabs, open diff tabs); the All changes sections' own re-reads follow it and are bounded by the section rules, not by the gate | Section reads live in component effects; with stable requests at most the written files re-read | owner confirmed 2026-10-01 |
| Limits of one check | At most 2,000 paths asked per batch, folders first; a check that fails or runs past 5,000 ms lets that batch through unfiltered | 2,000 paths took 295 ms in the planning probe; a failed check must not hide a real change | owner confirmed 2026-10-01 |
| A clean of an ignored folder | Paths under a deleted ignored folder are dropped; the folder's own path may pass once, because git cannot tell that a deleted path was a folder | Planning probe: `check-ignore` matches `bin/Debug/a.dll` after `bin/` is gone, but not `bin` itself | owner confirmed 2026-10-01 |
| Bench run shapes | `--sessions 0 --files-view` with one loop at a time: `--build-interval 100`, `--edit-interval 1000`, `--touch-interval 1000`, plus the same with no loop as the floor; default `--minutes 3` | One loop per run makes each figure attributable; no sessions keeps every git process on `bench-wt-1` the view's | owner confirmed 2026-10-01 |
| Bench targets | Build loop: 0 git processes and 0 `files:changed` on `bench-wt-1` in every steady row; edit loop: at most 2 `cat-file` per `files:changed` over the steady rows; touch loop: 0 `worktree:status` on `bench-wt-1` in every steady row | One re-read of one uncommitted section is two `cat-file` (`-s`, then `--filters`); nothing but the view's reads moves the index in a touch run | owner confirmed 2026-10-01 |
| Smoke fixture | The new section ignores its folder through `.git/info/exclude`, not a committed `.gitignore` | A new root file would change the listings every earlier section counts | owner confirmed 2026-10-01 |
| Where the measurements live | A `## Measurements` section in this feature's `validation.md`, before and after, each run with its commit | Same place #147 keeps its baseline; the Verifier keeps the section | owner confirmed 2026-10-01 |

**Open questions:** none unmarked. The owner confirmed every row above on 2026-10-01.

---

## User Stories

### P1: Writes git ignores refresh nothing ⭐ MVP

**User Story**: As a developer with the Files view open while an agent builds, I want build output not
to make the app run git, so that the build and the app don't slow each other.

**Why P1**: It is the issue's headline target.

**Acceptance Criteria**:

1. WHEN a batch closes whose named paths are all ignored by git, with no unnamed event and no index or `HEAD` event, THEN the watcher SHALL emit nothing <!-- event-driven -->
2. WHEN a batch closes holding both ignored and not-ignored paths THEN the watcher SHALL emit one change whose `paths` holds only the not-ignored ones, in the order they were first seen <!-- event-driven -->
3. The watcher SHALL take the ignore decision from git for the watched worktree, so every exclude source git reads applies, and SHALL never count a tracked file as ignored, inside an ignored folder included <!-- ubiquitous -->
4. WHEN git has answered that a path is ignored THEN the watcher SHALL drop that path and every path under it without starting a git process, until its answers are forgotten <!-- event-driven -->
5. WHEN a batch holds paths with no known answer THEN the watcher SHALL start exactly one `git check-ignore` for that batch, asking about each such path and each of its parent folders with no known answer <!-- event-driven -->
6. IF a batch would ask about more than 2,000 paths THEN the watcher SHALL ask only about the parent folders, or about nothing when the folders alone exceed 2,000, and SHALL treat the paths it did not ask about as not ignored for that batch without remembering them <!-- unwanted-behavior -->
7. WHEN a batch names a file called `.gitignore` at any depth THEN the watcher SHALL forget every answer before it classifies that batch <!-- event-driven -->
8. WHEN a batch carries an index or `HEAD` event THEN the watcher SHALL forget every answer and SHALL emit the batch with all its named paths, without asking git <!-- event-driven -->
9. WHEN the selection changes or watching stops THEN the watcher SHALL forget every answer <!-- event-driven -->
10. IF `git check-ignore` fails or runs past 5,000 ms THEN the watcher SHALL treat that batch's paths with no answer as not ignored, SHALL remember nothing from the attempt, and SHALL emit the batch as it would without the filter <!-- unwanted-behavior -->
11. IF an event in the batch named no path THEN the watcher SHALL emit the batch even when every named path is ignored <!-- unwanted-behavior -->
12. The watcher SHALL emit batches in the order they closed, and SHALL run one `git check-ignore` at a time <!-- ubiquitous -->
13. IF the selection moves on while a batch's check runs THEN the watcher SHALL drop that batch <!-- unwanted-behavior -->
14. The Files view SHALL list no ignored file in any mode (FXPL-04, unchanged) <!-- ubiquitous -->

**Independent Test**: With the view open on a worktree whose `.gitignore` names `build-out/`, a loop
writing into `build-out/` for a minute leaves `files:changed` and the worktree's git count at 0 in the
diagnostics line; one write to a tracked file then shows up in the view.

---

### P1: The view's reads leave the index alone ⭐ MVP

**User Story**: As a developer, I want the Files view's own git reads never to rewrite `.git/index`, so
that a refresh never triggers another refresh and a recount.

**Why P1**: The issue names it as the mechanism that keeps the view from retriggering the git-state
watcher, and the planning probe showed `--no-optional-locks` alone does not achieve it.

**Acceptance Criteria**:

15. Every git read in the Files view's listing, counting and diff code (`file-diff.ts`, `file-tree.ts`), and the watcher's `git check-ignore`, SHALL pass `--no-optional-locks` and `-c diff.autoRefreshIndex=false` before the subcommand; the Uncommitted list's `git status` keeps `STATUS_ARGS`, whose `--no-optional-locks` already stops its refresh <!-- ubiquitous -->
16. WHEN a tracked file is rewritten with its own bytes and the Uncommitted counts are then read THEN `.git/index` SHALL be byte for byte what it was before the read <!-- event-driven -->
17. WHILE the view is open in Uncommitted mode and only a same-bytes rewrite loop touches the worktree, the app SHALL emit no `worktree:status` for that worktree <!-- state-driven -->

**Independent Test**: In a temp repository, touch a tracked file's bytes, read the Uncommitted counts
through the view's code path, and compare the index file's bytes before and after.

---

### P1: Refreshes never pile up ⭐ MVP

**User Story**: As a developer, I want refreshes never to pile up, so that the view catches up quickly
after a burst of writes.

**Why P1**: Overlapping refreshes are the issue's second target.

**Acceptance Criteria**:

18. WHEN a batch arrives and no batch refresh is running THEN the view SHALL start its refresh at once <!-- event-driven -->
19. WHILE a batch refresh is running, the view SHALL start no other batch refresh <!-- state-driven -->
20. WHEN one or more batches arrive while a refresh runs THEN the view SHALL run exactly one more refresh once it settles, for the union of their paths, with a git-state change when any of them had one <!-- event-driven -->
21. The view SHALL count a batch refresh as running until every read it started has settled, fulfilled or rejected <!-- ubiquitous -->
22. WHEN the waiting refresh starts THEN it SHALL act on the view as it is at that moment: its mode, base, open tabs and list <!-- event-driven -->
23. IF the selected worktree changes or the Files direction is left while a refresh runs THEN the view SHALL drop the waiting refresh <!-- unwanted-behavior -->

**Independent Test**: A unit test holds the first run open, requests three more, and sees one trailing
run with the merged batch after the first settles.

---

### P1: Untouched sections stay as they are ⭐ MVP

**User Story**: As a developer, I want sections whose file didn't change to stay as they are, so that the
view doesn't flicker or lose my scroll.

**Why P1**: Up to 12 sections each re-read on every batch today.

**Acceptance Criteria**:

24. WHEN the mode's list is re-read and a file's two sides name the same revisions and paths as before THEN its All changes section SHALL NOT re-read <!-- event-driven -->
25. WHILE in Uncommitted mode, WHEN a batch without a git-state change names a listed file THEN that file's section SHALL re-read its sides once <!-- complex -->
26. WHEN a file's sides change (its status, a rename, the merge base) THEN its section SHALL re-read <!-- event-driven -->
27. WHEN the index or `HEAD` moves THEN every mounted section SHALL re-read (FDIF-31, unchanged) <!-- event-driven -->
28. WHILE in diff-to-origin mode, the view SHALL let no batch without a git-state change re-read a section <!-- state-driven -->
29. The view SHALL let no batch re-read a commit tab's sections (FCMT-31, unchanged) <!-- ubiquitous -->

**Independent Test**: With 12 sections mounted in Uncommitted mode, a loop appending to one listed file
reads at most 2 `cat-file` per `files:changed` in the diagnostics line, where today every open section
re-reads (about 20 with the first ten open).

---

### P1: The view stays live ⭐ MVP

**User Story**: As a developer, I want the diff of a file the agent writes to update within a second, so
that the view stays live.

**Why P1**: The filter and the gate must not cost the liveness the Files epic built.

**Acceptance Criteria**:

30. WHEN a file the view lists changes on disk outside an ignored folder THEN its open diff SHALL show the new content within 1 s with its scroll kept (FDIF-30, unchanged) <!-- event-driven -->
31. The diffs SHALL keep their folds across a refresh as FOLD-01..22 specify <!-- ubiquitous -->

**Independent Test**: The Files diff smoke's FDIF-30 check and its fold section pass on the changed
build.

---

### P1: Measured with the bench ⭐ MVP

**User Story**: As the developer, I want before and after figures from #147's bench, so that the fix is
shown to work rather than assumed.

**Why P1**: The issue sets its target in the bench's figures.

**Acceptance Criteria**:

32. WHERE `--files-view` is given, the bench SHALL seed `bench-wt-1` with a committed `.gitignore` naming `build-out/`, a `build-out/` folder of 50 files and 12 tracked files changed and left uncommitted, and after the spawn SHALL open the Files direction on `bench-wt-1` in Uncommitted mode with All changes showing <!-- optional-feature -->
33. WHERE `--build-interval <ms>` is given, the bench SHALL write one file under `bench-wt-1/build-out/` every that many ms, cycling 50 names, with new bytes each time <!-- optional-feature -->
34. WHERE `--edit-interval <ms>` is given, the bench SHALL append one line to `bench-wt-1/src/f0000.ts` every that many ms <!-- optional-feature -->
35. WHERE `--touch-interval <ms>` is given, the bench SHALL rewrite `bench-wt-1/src/f0100.ts` with its own bytes every that many ms <!-- optional-feature -->
36. WHERE `--files-view` is given, the summary SHALL add four columns per row for `bench-wt-1`: `files:changed` emits, git processes, `cat-file` processes and `worktree:status` emits <!-- optional-feature -->
37. WHERE the run has `--sessions 0`, `--files-view` and `--build-interval` as its only loop, the summary SHALL judge "ignored writes start no git": PASS only when every steady row has 0 git processes and 0 `files:changed` on `bench-wt-1`, and `n/a` for any other run <!-- optional-feature -->
38. WHERE the run has `--sessions 0`, `--files-view` and `--edit-interval` as its only loop, the summary SHALL judge "untouched sections stay": PASS only when the steady rows' `cat-file` total over their `files:changed` total is at most 2, and `n/a` for any other run <!-- optional-feature -->
39. WHERE the run has `--sessions 0`, `--files-view` and `--touch-interval` as its only loop, the summary SHALL judge "the view's reads leave the index alone": PASS only when every steady row has 0 `worktree:status` on `bench-wt-1`, and `n/a` for any other run <!-- optional-feature -->
40. IF a build-folder write loop with the Files view open starts no git process and emits no `files:changed` on the current build THEN the first task SHALL stop and report to the owner before any production change <!-- unwanted-behavior -->
41. The validation notes SHALL record the floor, build, edit and touch runs before and after the change, each with the commit it ran on <!-- ubiquitous -->

**Independent Test**: `node scripts/bench-sessions.mjs --sessions 0 --files-view --build-interval 100`
prints the Files columns and the three target lines, the build one judged, the other two `n/a`.

---

### P1: The Files diff smoke guards it ⭐ MVP

**User Story**: As the developer, I want the Files diff smoke to fail if ignored writes start refreshing
again, so that the fix cannot regress unseen.

**Why P1**: The issue's testing decisions require it.

**Acceptance Criteria**:

42. The Files diff smoke SHALL pass in full on the changed build, its icon section still last <!-- ubiquitous -->
43. WHEN the smoke writes 20 files under an ignored folder 100 ms apart THEN it SHALL read no `files:changed` for the worktree within 1,500 ms of the last write <!-- event-driven -->
44. WHEN the smoke then writes one file outside the ignored folder THEN it SHALL read a `files:changed` naming that file within 2,000 ms <!-- event-driven -->
45. WHILE the ignored folder holds files, the smoke SHALL find it in neither the Folder tree nor the Uncommitted list <!-- state-driven -->

**Independent Test**: `SMOKE_ONLY=watch node scripts/smoke-files-diff.mjs` against a dev app runs the
section alone; on the build before the change its first check fails.

---

## Edge Cases

- WHEN an ignored folder is created after the watch started THEN the first batch naming it SHALL start one `git check-ignore`, and later batches under it SHALL start none
- WHEN an ignored folder is deleted THEN the paths under it SHALL be dropped, and at most the folder's own path SHALL pass, once
- WHEN a batch path holds spaces, `#`, `!`, a leading dash or non-ASCII letters THEN the watcher SHALL ask about it exactly as named and match git's answer exactly

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FWIG-01 | P1: ignored — AC 1 | T10, T5, T19, T21 | Pending |
| FWIG-02 | P1: ignored — AC 2 | T10 | Pending |
| FWIG-03 | P1: ignored — AC 3 | T9, T10 | Pending |
| FWIG-04 | P1: ignored — AC 4 | T8, T10 | Pending |
| FWIG-05 | P1: ignored — AC 5 | T8, T10 | Pending |
| FWIG-06 | P1: ignored — AC 6 | T8 | Pending |
| FWIG-07 | P1: ignored — AC 7 | T10 | Pending |
| FWIG-08 | P1: ignored — AC 8 | T10 | Pending |
| FWIG-09 | P1: ignored — AC 9 | T10 | Pending |
| FWIG-10 | P1: ignored — AC 10 | T9, T10 | Pending |
| FWIG-11 | P1: ignored — AC 11 | T10 | Pending |
| FWIG-12 | P1: ignored — AC 12 | T10 | Pending |
| FWIG-13 | P1: ignored — AC 13 | T10 | Pending |
| FWIG-14 | P1: ignored — AC 14 | T5, T19 | Pending |
| FWIG-15 | P1: index — AC 15 | T7, T9, T11, T12 | Pending |
| FWIG-16 | P1: index — AC 16 | T11 | Pending |
| FWIG-17 | P1: index — AC 17 | T20, T21 | Pending |
| FWIG-18 | P1: gate — AC 18 | T13, T17 | Pending |
| FWIG-19 | P1: gate — AC 19 | T13, T17 | Pending |
| FWIG-20 | P1: gate — AC 20 | T13, T17 | Pending |
| FWIG-21 | P1: gate — AC 21 | T13, T17 | Pending |
| FWIG-22 | P1: gate — AC 22 | T17 | Pending |
| FWIG-23 | P1: gate — AC 23 | T13, T17 | Pending |
| FWIG-24 | P1: sections — AC 24 | T14, T16, T20, T21 | Pending |
| FWIG-25 | P1: sections — AC 25 | T15, T16, T17 | Pending |
| FWIG-26 | P1: sections — AC 26 | T14, T16 | Pending |
| FWIG-27 | P1: sections — AC 27 | T16, T19 | Pending |
| FWIG-28 | P1: sections — AC 28 | T18 | Pending |
| FWIG-29 | P1: sections — AC 29 | T16 | Pending |
| FWIG-30 | P1: live — AC 30 | T19 | Pending |
| FWIG-31 | P1: live — AC 31 | T19 | Pending |
| FWIG-32 | P1: bench — AC 32 | T4 | Pending |
| FWIG-33 | P1: bench — AC 33 | T4 | Pending |
| FWIG-34 | P1: bench — AC 34 | T4 | Pending |
| FWIG-35 | P1: bench — AC 35 | T4 | Pending |
| FWIG-36 | P1: bench — AC 36 | T3 | Pending |
| FWIG-37 | P1: bench — AC 37 | T3, T20, T21 | Pending |
| FWIG-38 | P1: bench — AC 38 | T3, T20, T21 | Pending |
| FWIG-39 | P1: bench — AC 39 | T3, T20, T21 | Pending |
| FWIG-40 | P1: bench — AC 40 | T1 | Pending |
| FWIG-41 | P1: bench — AC 41 | T6, T21 | Pending |
| FWIG-42 | P1: smoke — AC 42 | T19 | Pending |
| FWIG-43 | P1: smoke — AC 43 | T5, T19 | Pending |
| FWIG-44 | P1: smoke — AC 44 | T5, T19 | Pending |
| FWIG-45 | P1: smoke — AC 45 | T5, T19 | Pending |
| FWIG-46 | Edge: an ignored folder created after the watch | T10 | Pending |
| FWIG-47 | Edge: an ignored folder deleted | T9, T10 | Pending |
| FWIG-48 | Edge: unusual characters in a path | T9 | Pending |

**Coverage:** 48 total, 48 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] The build-loop bench run reads 0 git processes and 0 `files:changed` on `bench-wt-1` in every steady row, where the run before the change reads more than 0
- [ ] The edit-loop run reads at most 2 `cat-file` per `files:changed`, and the touch-loop run 0 `worktree:status`, each against a worse figure before the change
- [ ] The Files diff smoke passes in full, and its new section fails on the build before the change
