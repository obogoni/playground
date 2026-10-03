# Files Watch Ignored Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-watch-ignored/design.md`. In one line: `FileWatcher` asks
`git check-ignore` once per batch about paths it has no cached answer for and emits only what git does
not ignore; every Files read passes `READ_ONLY_FLAGS` so it never rewrites the index; the Files hook runs
batch refreshes through a `RefreshGate` with one merged trailing run; an All changes section re-reads
only on a content key, a per-path disk revision or the git-state token.
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01).

**Branch**: `feature/files-watch-ignored`, rebased 2026-10-03 onto `origin/main` `fc19a3c`, which holds
#147 (PR #162, merged): its bench, summary and baseline exist. The future PR body carries `Closes #150`
and depends on no open PR.

**Reconciled 2026-10-03 against `fc19a3c`** (no Files file changed on `main` since planning; line numbers
for `file-diff.ts`, `file-tree.ts`, `file-watcher.ts`, `use-files.ts`, the components and
`smoke-files-diff.mjs` still hold):

- The diagnostics switch is `PLAYGROUND_DEBUG_PERF=1` (AD-057), not `PLAYGROUND_DIAGNOSTICS`.
- `git()` starts every process through the spawn pacer (PERF-22, at most 4 at once). `input` is written
  inside the pacer callback, on the `execFile` promise's child. A `check-ignore` can wait behind other
  git work; its 5,000 ms timeout counts from the spawn, not from the request.
- `diagnostics().gitSubcommand` skips `-c <value>` and leading flags, so a `READ_ONLY_FLAGS` read is
  still counted as `cat-file`, `diff` and so on. `files:changed` emits are already counted at
  `src/main/index.ts:433`.
- The bench's `rowOf(line, label)` takes the label as its second argument; the Files columns come from
  the options instead (T3 picks the exact shape). `--sessions 0` still seeds `bench-wt-1`.
- Open sibling PRs: #164 (#149) changes `index.ts` and the git-state watcher; #165 (#153) changes
  `git()` to end stdin on every call (CRTO-06) and moves `git.test.ts`'s timeout cases to a sleeping
  alias. This branch stays on `main`; whichever merges first, the other rebases. T7 writes stdin only
  when `input` is given, so after #165 the two lines fold into one `end(opts.input)`.

**Stop rules**: T1 stops the feature if a build-folder write loop starts no git process today (FWIG-40).
T2 stops it if the ignore mechanism fails its measurement rule. Either way, report to the owner before
any production change.

**Test baseline**: **re-measure** with `npx vitest run` at T1, after the rebase; record the test count,
file count, wall time and the lint warning count.

**Running the app**: smoke runs use the dev app, `npm run dev -- -- --remote-debugging-port=9222
--user-data-dir=<throwaway> --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
--disable-background-timer-throttling`, seeded with `SMOKE_CONFIG` / `SMOKE_BASE` pointing into the same
throwaway folder. `npm run dev` does not restart main on an edit: relaunch after every main change or
main mutant. Bench runs use the BUILT app (`npx electron-vite build` first). No registry agent is ever
started. No repository of the owner's is touched: every probe and fixture lives in a temp folder.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md` (deep main modules and renderer `lib/` helpers unit-tested with hand-rolled injected fakes, no `vi.mock`; React components and hooks verified by CDP smoke; smokes by hand), `vitest.config.ts` (`src/**/*.test.ts`, `scripts/**/*.test.ts`), `package.json` scripts, `eslint.config.mjs` (`eslint-plugin-react-hooks` 7: no ref reads during render); style sampled from `src/main/file-watcher.test.ts`, `src/main/git.test.ts`, `src/main/file-diff.test.ts`, `src/main/file-tree.test.ts`, `src/renderer/src/lib/diff-view.test.ts`, `src/renderer/src/lib/files-view.test.ts`; confirmed lessons L-001, L-005, L-009 and candidates L-018, L-020, L-021, L-025, L-029, L-031, L-042, L-045, L-050, L-052, L-087 applied.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Git runner (`git.ts`: `input`, `READ_ONLY_FLAGS`) | unit (real git) | `input` observed from inside the child (L-020); the constant pinned by literal (L-009); the no-input path unchanged | `src/main/git.test.ts` | `npx vitest run src/main/git.test.ts` |
| Ignore answers (`IgnoreAnswers`, `parentFolders`) | unit (pure) | All branches; 1:1 to FWIG-04..06; the 2,000 limit at, under and over the boundary (L-042, L-050) | `src/main/ignore-check.test.ts` | `npx vitest run src/main/ignore-check.test.ts` |
| `checkIgnored` | unit (real temp repository) | Every answer class git gives: ignored, kept, tracked under an ignored folder, deleted folder, nested `.gitignore`, `info/exclude`, exit 1, failure, timeout, unusual characters | `src/main/ignore-check.test.ts` | same |
| File watcher (`file-watcher.ts`) | unit (fake watch port and scheduler; real repository for the ignore port, as the issue asks) | 1:1 to FWIG-01..13, 46, 47; each forgetting trigger alone (L-087); emitted vs not emitted asserted on the sink | `src/main/file-watcher.test.ts` | `npx vitest run src/main/file-watcher.test.ts` |
| Files reads (`file-diff.ts`, `file-tree.ts`) | unit (real git) | The prefix on every read the refresh path runs, asserted on the recorded spawn args (L-020); the index bytes unchanged after a same-bytes rewrite | co-located `*.test.ts` | `npx vitest run <file>` |
| Renderer lib (`refresh-gate.ts`, `diff-view.ts`, `files-view.ts`) | unit (pure, deferred promises) | All branches; 1:1 to FWIG-18..21, 23, 24, 26; the merge rule; rejection and synchronous throw | `src/renderer/src/lib/*.test.ts` | `npx vitest run <file>` |
| Renderer hook and components (`use-files.ts`, `DiffSection.tsx`, `AllChangesTab.tsx`, `FileTabs.tsx`) | manual (CDP smoke + bench) | Every decision lives in a tested lib function (L-018); the wiring is seen by the smoke (FWIG-30, 43..45) and the bench's edit target, which T20 shows failing under a wiring mutant | — | `node scripts/smoke-files-diff.mjs`, `node scripts/bench-sessions.mjs ...` |
| `index.ts` wiring | none (hand-verified) | One dep; typecheck plus the smoke | — | `npm run typecheck` |
| Bench summary (`scripts/bench-summary.mjs`) | unit | Every new column, each Files target's PASS / FAIL / `n/a` branch, the run-shape rule, the new default pinned by literal | `scripts/bench-summary.test.ts` | `npx vitest run scripts/bench-summary.test.ts` |
| Bench harness and smoke script | manual | Each AC observed on a named run; each new check seen failing first (L-031, L-045) | `scripts/*.mjs` | the runs the task names |

**Evidence split** (L-021, L-025): FWIG-32..35 are observed on T4's named runs; FWIG-37..39 and 17 are
judged on T6's and T21's runs and shown to move in T20; FWIG-14, 43..45 are numbered smoke checks seen
failing in T5; FWIG-30, 31, 42 are the existing smoke checks passing in T19; FWIG-40 and 41 are T1's,
T6's and T21's written records. Every other ID has a unit test named in its task.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | A task whose tests are unit tests | `npx vitest run <the task's test file>` |
| Full | Every code task, after its quick gate | `npm run typecheck && npm run lint && npm test` |
| Build | Every phase end, and before every bench run | `npx electron-vite build` |
| Manual | T1, T2, T4, T5, T6, T17, T18, T19, T20, T21 | the runs the task names, results written in the task |

**Lint is judged by exit code AND by warning count**: record the count at T1 and diff it at every gate.

**Mutating for a falsification** (T5, T19, T20): through a scratch script that copies the file to
`.orig`, writes the mutant, asserts the mutant text is present, and restores in `finally`; rebuild (bench)
or relaunch (dev app, for a main mutant) before the run; `git status --porcelain` must equal the baseline
afterwards.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Measure before changing

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 2: Main drops what git ignores, and stops moving the index

```
T6 → T7 → T8 → T9 → T10 → T11 → T12
```

### Phase 3: The renderer refreshes once at a time, and only what changed

```
T12 → T13 → T14 → T15 → T16 → T17 → T18
```

### Phase 4: Prove it

```
T18 → T19 → T20 → T21
```

---

## Task Breakdown

### T1: Setup, baseline and the stop rule

**What**: Rebase onto the executed #147, prepare the worktree, record the test baseline, read #147's
baseline, and measure whether a build-folder write loop starts git today.
**Where**: `.specs/features/files-watch-ignored/tasks.md`
**Depends on**: None
**Reuses**: #147's `## Baseline` (`.specs/features/perf-diagnostics/validation.md`), its log format
**Requirement**: FWIG-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**:

1. Rebase: done before T1, onto `origin/main` `fc19a3c` with no conflict (see the header).
2. `npm ci --ignore-scripts`, then `node node_modules/electron/install.js`.
3. `npx vitest run` (test count, files, wall time) and `npm run lint` (warning count).
4. Read #147's `## Baseline`: copy the N = 0 run's steady `git` count here as the floor.
5. The stop-rule run, on the unchanged built app: a throwaway user data folder with
   `PLAYGROUND_DEBUG_PERF=1` and the three flags; a throwaway repository (500 tracked files, a committed
   `.gitignore` naming `build-out/`, a `build-out/` of 50 files, 12 tracked files changed) registered as
   the only workspace; open the Files direction on it by hand in Uncommitted mode; from a terminal, a
   loop writing `build-out/obj-<k mod 50>.bin` every 100 ms for 3 minutes; read the last two full lines'
   `git.byWorktree[<folder>].count` and `emits['files:changed'][<folder>]`.

**Done when**:

- [x] Rebase done; baseline test count, file count, wall time and lint warning count written here
- [x] The stop-rule figures written here, per line
- [x] Verdict written: "build writes start git today: N processes, M `files:changed` per minute, proceed" or "stopped, owner told: ..." (FWIG-40)
- [x] Gate check passes: `npm run lint`

**Result (2026-10-03, at `318bdca`, git 2.55.0.windows.4, Node 24.19.0)**:

- Test baseline: `npx vitest run` → **2,769 tests in 127 files, all passing, about 110-120 s wall**.
  The first two runs after `npm ci` each had 1 failure that the next three runs (two with the JSON
  reporter) did not repeat; the test was not identified. Treat a single unrepeatable failure as this
  flake, and name it if it shows again. `npm run lint`: **0 errors, 18 warnings**.
- #147's floor (`perf-diagnostics/validation.md`, `## Baseline`, N = 0): steady `git n` = **0** per row.
- Stop-rule run: built app, throwaway user data with `PLAYGROUND_DEBUG_PERF=1` and the three flags; a
  throwaway workspace whose repository has 500 tracked files and a committed `.gitignore` naming
  `build-out/`, and a linked worktree `wt-1` with 50 files in `build-out/` and 12 tracked files changed;
  the Files direction opened on `wt-1` through CDP, Uncommitted mode, 12 `.diff-section` elements
  mounted; a loop writing `build-out/obj-<k mod 50>.bin` every 100 ms for 3 minutes (2,163 writes,
  0 skipped). Per line, `wt-1` only:

  | Line | git processes | by subcommand | `files:changed` | `worktree:status` |
  | ---- | ------------- | ------------- | --------------- | ----------------- |
  | 1 (startup + loop) | 1,541 | cat-file 1,020, status 171, diff 171, ls-files 170, other 9 | 169 | 0 |
  | 2 | 1,648 | cat-file 1,098, status 184, diff 183, ls-files 183 | 183 | 0 |
  | 3 | 1,649 | cat-file 1,099, ls-files 184, diff 183, status 183 | 183 | 0 |
  | 4 | 1,652 | cat-file 1,101, diff 184, status 184, ls-files 183 | 184 | 0 |

- **Verdict: build writes start git today: about 1,650 processes and 183 `files:changed` per minute,
  every one from writes git ignores; proceed** (FWIG-40). About 6 `cat-file` per batch: the 12 mounted
  sections' re-reads.

**Tests**: manual
**Gate**: manual

**Commit**: `docs(specs): record the files watcher baseline and stop-rule check (#150)`

---

### T2: Re-measure the ignore mechanism and the index rewrite

**What**: Re-run the planning probes on this machine and confirm, or overturn, the design's choice.
**Where**: `.specs/features/files-watch-ignored/design.md`
**Depends on**: T1
**Reuses**: design.md, "Planning findings"
**Requirement**: FWIG-03, FWIG-15, FWIG-16 (premises)

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps** (scratch scripts in a temp folder, never committed, never run in a repository of the owner's):

1. The index probe: each command of the findings table after a same-bytes rewrite, index bytes compared.
2. The semantics probe: `check-ignore --stdin -z` on a folder, its children, a tracked file under an
   ignored folder, a deleted ignored folder, nested `.gitignore` files and `.git/info/exclude`.
3. The cost probe: a synthetic repository of 20,000 tracked files in 40 folders, nested `bin/` and
   `obj/` per folder and a `node_modules/` of 20,000 files; median of 10 for a 9-path `check-ignore`,
   of 5 for 2,000 paths, and of 5 for `ls-files --others --ignored --exclude-standard --directory`.

**Decision rule**: keep A (`check-ignore` per batch) when the 9-path median is at most 150 ms, the
2,000-path median at most 1,000 ms, and every semantics row matches design.md. Otherwise stop and report
to the owner with the numbers.

**Done when**:

- [x] The three probe results written into design.md's "Planning findings", with this machine's git version
- [x] The decision written into design.md's Tech Decisions: "A confirmed" or "stopped, owner told: ..."
- [x] No scratch file under the repository; `git status --porcelain` shows only design.md
- [x] Gate check passes: `npm run lint`

**Result (2026-10-03)**: A confirmed. 9-path median 87 ms, 2,000-path median 330 ms, every semantics
row as planned; the index probe repeats the planning finding in fresh repositories (design.md,
"Re-measured at Execute"). The status list also gained `tasks.md` and the AD note moved to AD-061
(#151 claims AD-060).

**Tests**: manual
**Gate**: manual

**Commit**: `docs(specs): confirm the ignore mechanism against this machine's git (#150)`

---

### T3: The bench summary's Files block

**What**: `rowOf`'s four `bench-wt-1` columns, the `files` block in `formatSummary`, the three Files
targets in `judgeTargets` and `DEFAULT_TARGETS.filesCatFilePerEmit`.
**Where**: `scripts/bench-summary.mjs`
**Depends on**: T2
**Reuses**: #147's `bench-summary.mjs` and its test fixtures
**Requirement**: FWIG-36, FWIG-37, FWIG-38, FWIG-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `DEFAULT_TARGETS.filesCatFilePerEmit` is `2` by literal (L-009), and #147's existing defaults are unchanged
- [x] Tests: a fixture line gives `filesEmits`, `filesGit`, `filesCatFile` and `filesStatusEmits` for `bench-wt-1`; a line with no `bench-wt-1` entries gives 0 for each
- [x] Tests: the build target is PASS with every steady row at 0 / 0, FAIL with one row at 1 git process and with one row at 1 `files:changed`, and `n/a` with `sessions: 1`, without `--files-view`, and with a second loop on
- [x] Tests: the edit target is PASS at a ratio of exactly 2 (L-042), FAIL just above it, and `n/a` with no `files:changed` in the steady rows or with a second loop on
- [x] Tests: the touch target is PASS at 0 and FAIL at 1 `worktree:status` on `bench-wt-1`; `n/a` for another run shape
- [x] Tests: `formatSummary` prints the `files` block only when `filesView` is on, one line per row, and the three target lines
- [x] Gate check passes: `npx vitest run scripts/bench-summary.test.ts`, then the full gate
- [x] Test count: T1 count + the new tests

**Result (2026-10-03)**: `scripts/bench-summary.test.ts` 39 tests (20 of #147's + 19 new), all
passing; full gate 2,788 tests in 127 files (2,769 + 19), typecheck clean, lint 0 errors and 18
warnings (unchanged), about 104 s wall.

- Shape: `rowOf(line, label, { filesWorktree })` adds `filesEmits`, `filesGit`, `filesCatFile` and
  `filesStatusEmits` only when the option is given, so #147's exact `rowOf` test holds unchanged;
  `phaseRows(lines, { minutes, filesWorktree })` forwards it; `worstRow` takes the Files columns at
  their largest when the rows carry them. `judgeTargets` takes `filesView`, `buildIntervalMs`,
  `editIntervalMs` and `touchIntervalMs` (each off by default) and always returns #147's four targets
  first, then `filesIgnoredWrites`, `filesCatFilePerEmit` and `filesIndexUntouched`. A Files target is
  judged only with `sessions === 0`, `filesView` and its loop as the only loop running; the index loop
  counts as a loop. `formatSummary` adds `files-view  build=.. edit=.. touch=..` to the header, a
  `files` block after the rows and the three Files target lines only with `filesView`; without it the
  text is #147's, byte for byte.
- Values: the build target's value is the larger of the worst steady row's git count and
  `files:changed` count (spec-precision gap: FWIG-37 defines the verdict, not a single printed
  value; PASS is exactly "both 0 in every steady row"). The edit target's value is the steady
  `cat-file` total over the steady `files:changed` total, printed to 2 decimals and judged unrounded.
  The touch target's value is the worst steady row's `worktree:status` on `bench-wt-1`.
- #147's `DEFAULT_TARGETS` test is an exact `toEqual`; it now lists five keys, its four values
  unchanged and `filesCatFilePerEmit: 2` added (the only edit to an existing test; an exact-object
  assertion cannot hold a new key otherwise).

**Tests**: unit
**Gate**: quick

**Commit**: `feat(bench): judge the Files view targets in the summary`

---

### T4: The bench's Files rows

**What**: Four `OPTIONS` rows, the Files seed, opening the Files view through CDP, and the build, edit
and touch loops.
**Where**: `scripts/bench-sessions.mjs`
**Depends on**: T3
**Reuses**: #147's `OPTIONS` table and index loop; `scripts/smoke-files-diff.mjs:335-354` (`selectWorktree`)
**Requirement**: FWIG-32, FWIG-33, FWIG-34, FWIG-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (each a named run on the built app, results written here):

- [x] Run A, `--sessions 0 --files-view --minutes 1 --keep`: the kept `bench-wt-1` holds the committed `.gitignore`, 50 files in `build-out/`, 12 changed tracked files; the config holds the Uncommitted mode; the app showed `.diff-section` elements (FWIG-32)
- [x] Run B, `--sessions 0 --files-view --build-interval 100 --minutes 1`: the summary's `files` block is printed; `build-out/` file times moved during the run (read with `--keep`) (FWIG-33)
- [x] Run C, `--edit-interval 1000` in place of the build loop: `src/f0000.ts` grew by about 60 lines in the kept copy (FWIG-34)
- [x] Run D, `--touch-interval 1000`: `src/f0100.ts` has its committed bytes and a newer mtime (FWIG-35)
- [x] Run E, `--files-view` with the Files segment renamed away by a throwaway mutant of the bench's selector: exit 1 naming the missing sections
- [x] Gate check passes: `npm run lint` and `npx electron-vite build`

**Result (2026-10-03)**: built app at T3's commit plus this change (headers read `commit=77a5079-dirty`),
CDP port 9334, every kept folder deleted after it was read.

- Shape: four `OPTIONS` rows (`--files-view`, `--build-interval`, `--edit-interval`,
  `--touch-interval`, each off by default). With `--files-view` the seed commits `.gitignore` =
  `build-out/` with the source files, then in `bench-wt-1` writes `build-out/obj-00.bin` to
  `obj-49.bin` and appends one line to `src/f0000.ts` to `src/f0011.ts`; the config's
  `ui.files` holds `{ mode: 'uncommitted' }` under `bench-wt-1`'s path as the app keys it (git's
  porcelain path with every `/` turned into `\`, as `parsePorcelainBlocks` does; the first try,
  keyed with git's forward slashes, opened the folder mode and failed on its 15 s wait, which is
  how the key was found). After the sessions open, `openFilesView` clicks Tree, the `bench/1` row,
  Files and All changes, and waits up to 15 s for a `.diff-section`. The loops start after that,
  stop with the index loop, and each prints `<name> loop: N writes, M skipped`. The summary reads
  `bench-wt-1` through `phaseRows(..., { filesWorktree })` and passes the run shape to
  `judgeTargets`.
- Run A (exit 0): "Files view open on bench-wt-1, 12 sections"; the kept `bench-wt-1` has
  `.gitignore` tracked and committed (`build-out/`), 50 files in `build-out/` (`check-ignore`
  names them), 12 modified tracked files (`src/f0000.ts` to `src/f0011.ts`, uncommitted); the config
  holds `ui.files[<bench-wt-1>] = { mode: 'uncommitted' }`. Files block steady 1: 0 / 0 / 0 / 0.
- Run B (exit 0): the `files` block printed; steady 1 `files:changed` 183, git 1,651, `cat-file`
  1,101, `wt:status` 0; "ignored writes start no git 1651 FAIL"; "build loop: 1085 writes, 0
  skipped". All 50 `build-out/` files have mtimes 175 to 181 s after the seed's.
- Run C (exit 0): `src/f0000.ts` has 139 lines: 20 committed, 1 seeded, **118** appended ("edit
  loop: 118 writes"). The loop runs from the view's opening to the last line, which is the spawn
  minute plus the steady minute, so about 120 at `--minutes 1`, not the 60 the step guessed.
  Steady 1: `files:changed` 60, git 300, `cat-file` 120, `wt:status` 0; **"untouched sections
  stay ... 2.00 PASS" on the build before the change** (see the note below).
- Run D (exit 0): `src/f0100.ts` equals `HEAD:src/f0100.ts` byte for byte and is not listed by
  `git status`; its mtime is 180 s after the seed's ("touch loop: 117 writes, 0 skipped"). Steady
  1: `files:changed` 119, git 1,724, `cat-file` 1,070, `wt:status` 59; "the view's reads leave the
  index alone 59 FAIL".
- Run E (exit 1, a scratch copy-mutate-restore of the bench's `'Files'` segment click to
  `'Filez'`): "bench-sessions: --files-view: no All changes sections (.diff-section) in the Files
  view of bench-wt-1 after 15 s; file tabs []". Restored from `.orig`; no electron process and no
  `pg-bench-` folder left.
- Gate: `npm run lint` 0 errors, 18 warnings; `npx electron-vite build` passes.
- **Note for T6 (the edit target)**: the stack re-reads only its *mounted* sections (expanded and
  near the viewport, `mountPlan`), not every open one, so at the bench's window size a list re-read
  costs fewer `cat-file` than the spec's "about 20" estimate. In Run C it was exactly 2 per
  `files:changed`, which is the target's limit. T6 measures it at the default 3 minutes.

**Tests**: manual
**Gate**: manual

**Commit**: `feat(bench): drive the Files view with build, edit and touch loops`

---

### T5: The smoke's watch section, seen failing on the current build

**What**: `watchSection` (checks 15a, 15b, 15c), `SMOKE_ONLY=watch`, and its place between the discard
section and the icon checks.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T4
**Reuses**: the `SMOKE_ONLY` dispatch (`:513-560`), `check`, `evaluate`, `clickByText`, the seed's `REPO`
**Requirement**: FWIG-14, FWIG-43, FWIG-44, FWIG-45

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (dev app on a throwaway user data folder, freshly seeded; results written here):

- [x] On the current build (no production change yet), `SMOKE_ONLY=watch`: 15a FAILS (events arrive for the ignored writes) while 15b and 15c pass; the counts written here
- [x] 15c seen failing on a main mutant that drops `--exclude-standard` from `listDir`'s untracked read (relaunched), restored from `.orig`
- [x] 15b seen failing when the control file is written outside the worktree instead (a throwaway edit of the section, reverted): no event names it
- [x] The full drive still reaches the icon checks last (read in the drive order)
- [x] `git status --porcelain` equals the baseline after the mutant; `.git/info/exclude` of the seed restored by the section's cleanup
- [x] Gate check passes: `npm run lint`

**Result (2026-10-03)**: the dev app at T4's commit (no production change), each drive on a fresh
seed and a fresh launch: a throwaway folder under the system temp folder holding the seed and the
user data (`SMOKE_BASE`, `SMOKE_CONFIG`), CDP port 9241 (`SMOKE_PORT`), the three flags; the app's
process tree killed after each drive and the folder deleted.

- Shape: `watchSection(ws)` in `scripts/smoke-files-diff.mjs`, run by `SMOKE_ONLY=watch` after
  `selectWorktree` and in the full drive between `discardChecks` and `iconChecks`. It appends
  `fwig-build/` to the seed's `.git/info/exclude`, creates `fwig-build/`, waits 2 s, then subscribes
  in the page (`window.api.on('files:changed', ...)` into `window.__fwigEvents`) and keeps only the
  events for the seed's worktree. 15a: 20 writes `fwig-build/out-NN.bin` 100 ms apart, then
  1,500 ms, no event. 15b: `fwig-control-<stamp>.txt` at the root, an event naming it within
  2,000 ms. 15c: the Folder tree and the Uncommitted list, each re-listed by a mode click, hold the
  control file (so the check cannot pass on an empty list) and no `fwig-build` row. Cleanup in
  `finally`: unsubscribe, delete `fwig-build/` and the control file, write back the exclude bytes.
- `SMOKE_ONLY=watch`, current build: **15a FAIL** ("7 events, 27 paths", every one under
  `fwig-build`, the folder itself named in each batch); 15b PASS (after about 330 ms); 15c PASS
  (control listed in both, no `fwig-build` row). 2/3 checks passed, exit 1.
- 15c on the main mutant (`'--exclude-standard'` removed from `listDir`'s `ls-files --others`
  call in `src/main/file-tree.ts`, copied to `.orig`, the dev app launched after the write):
  **15c FAIL**, "Folder: control true, ["fwig-build"]; Uncommitted: control true, []". Restored
  from `.orig`.
- 15b with the control written to the seed's base folder instead of the worktree (a throwaway edit
  of the section, copied to `.orig`): **15b FAIL**, "no event named it" (15c also failed, its
  control no longer listed). Restored from `.orig`.
- Full drive, current build: discard checks end at 56, the watch section is 57 to 59 (15a FAIL as
  above, 15b and 15c PASS), the icon checks follow at 60 to 69. 110/114 passed, exit 1.
- SPEC_DEVIATION (wording, not behaviour): the icon checks are not the drive's last section on
  `main` either. Sections 12 and 13 (FPOL) and 14 (fold) run after them, as the comment beside
  `discardChecks` ("stay last") no longer says. The watch section sits where design.md puts it,
  directly before the icon checks, and the order after them is unchanged. FWIG-42's "its icon
  section still last" reads as "the order after the discard section is unchanged".
- **Pre-existing failures, not this section's**: the full drive also failed FPOL-14 ("Expand all
  opens every listed section", 0 -> 0 of 50), FPOL-16 ("9 diff editors ... for 0 open sections")
  and FPOL-18 ("opened true: 0 -> 0 -> 0 of 45"). A second full drive with the watch call removed
  from the full drive (a throwaway edit) failed the same three, 108/111. T19's full drive (FWIG-42)
  meets them.
- `git status --porcelain` equal to the baseline after every mutant (only this task's
  `scripts/smoke-files-diff.mjs`); the seed's `.git/info/exclude` byte for byte as before each drive
  (read before and after by the harness). No electron process from these drives and no throwaway
  folder left.
- Gate: `npm run lint` 0 errors, 18 warnings.

**Tests**: manual
**Gate**: manual

**Commit**: `test(smoke): check that writes under an ignored folder refresh nothing`

---

### T6: The measurements before the change

**What**: Run the four bench shapes on the unchanged build and write them down.
**Where**: `.specs/features/files-watch-ignored/validation.md`
**Depends on**: T5
**Reuses**: T3, T4
**Requirement**: FWIG-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Steps**: on a quiet machine, `npx electron-vite build`, then each with `--json`:
`--sessions 0 --files-view` (floor), `... --build-interval 100`, `... --edit-interval 1000`,
`... --touch-interval 1000`.

**Done when**:

- [ ] `## Measurements` holds a "Before" part: the commit, the machine without names (CPU class, cores, RAM), each run's summary verbatim, and a table of the four Files figures per steady row
- [ ] The three Files targets read FAIL on the build loop and touch loop runs and on the edit loop run, or the exception is written with its reason (for example, a figure already at target, which triggers the T1 stop rule)
- [ ] A note at the top: the Verifier keeps this section and adds its report below it
- [ ] Gate check passes: `npm run lint`

**Tests**: manual
**Gate**: manual

**Commit**: `docs(specs): record the Files view figures before the change (#150)`

---

### T7: Git runner input and the read flags

**What**: `git()` writes `opts.input` to the child's stdin and closes it; `READ_ONLY_FLAGS` exported.
**Where**: `src/main/git.ts`
**Depends on**: T6
**Reuses**: `git.test.ts`'s real-git cases and `rejectionOf`
**Requirement**: FWIG-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: `READ_ONLY_FLAGS` equals `['--no-optional-locks', '-c', 'diff.autoRefreshIndex=false']` by literal (L-009)
- [ ] Tests: `git(tmpdir(), ['hash-object', '--stdin'], { input: 'abc' })` answers git's own hash of `abc` (observed from the child, L-020)
- [ ] Tests: the existing timeout case (`hash-object --stdin` with no input, 200 ms) still times out, so stdin stays open without `input` (on `main`; if #165 merges first, its sleeping-alias cases replace this one and `input` folds into its `end()`)
- [ ] Tests: an `input` call goes through the pacer and diagnostics: the existing `recordingGit` harness sees one start and one end for it
- [ ] Tests: a `READ_ONLY_FLAGS`-prefixed `rev-parse --git-dir` in a temp repository answers as the plain one does
- [ ] #147's diagnostics probe still wraps the call (`src/main/git.ts:30-33` at `fc19a3c`)
- [ ] Gate check passes: `npx vitest run src/main/git.test.ts`, then the full gate (suite wall time compared with T1's, L-005)
- [ ] Test count: T3 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(git): pass stdin to the git runner and name the read-only flags`

---

### T8: Ignore answers

**What**: `parentFolders` and `IgnoreAnswers` (`isIgnored`, `questionsFor`, `learn`, `forget`), with
`IGNORE_ASK_LIMIT`.
**Where**: `src/main/ignore-check.ts`
**Depends on**: T7
**Reuses**: nothing (pure)
**Requirement**: FWIG-04, FWIG-05, FWIG-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: `IGNORE_ASK_LIMIT` is `2000` by literal (L-009)
- [ ] Tests: `parentFolders('a/b/c.ts')` is `['a', 'a/b']`; a root-level path gives `[]`
- [ ] Tests: with nothing learned, `questionsFor(['bin/Debug/a.dll'])` is `['bin', 'bin/Debug', 'bin/Debug/a.dll']`, folders first, without duplicates across several paths
- [ ] Tests: after `learn(['bin', ...], {'bin', ...})`, `isIgnored('bin/x/y.dll')` is true and `questionsFor` skips every path under `bin`; a kept answer is never asked again; a path asked and not listed is kept
- [ ] Tests: a tracked-file case, `learn(['bin', 'bin/keep.txt', 'bin/Debug'], {'bin/Debug'})`, keeps `bin/keep.txt` and drops `bin/Debug/a.dll`
- [ ] Tests: at the limit (2,000 questions) every question is asked; at 2,001 only the folders are; with 2,001 folders nothing is (L-042, L-050)
- [ ] Tests: `forget` makes every path unknown again
- [ ] Gate check passes: `npx vitest run src/main/ignore-check.test.ts`, then the full gate
- [ ] Test count: T7 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): remember what git ignores during one watch`

---

### T9: Asking git what it ignores

**What**: `checkIgnored(worktreePath, paths, run = git)` with `IGNORE_CHECK_TIMEOUT_MS`.
**Where**: `src/main/ignore-check.ts`
**Depends on**: T8
**Reuses**: T7's `input` and `READ_ONLY_FLAGS`; the temp-repository setup of `file-diff.test.ts:189-213`
**Requirement**: FWIG-03, FWIG-10, FWIG-15, FWIG-47, FWIG-48

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (real temp repository, `core.autocrlf` pinned off, L-026):

- [ ] Tests: `IGNORE_CHECK_TIMEOUT_MS` is `5000` by literal (L-009)
- [ ] Tests: with a root `.gitignore` (`bin/`, `*.log`), a nested `src/.gitignore` (`gen/`) and `.git/info/exclude` (`scratch/`), the answer holds `bin`, `bin/Debug/a.dll`, `src/x.log`, `src/gen/a.ts`, `scratch/n.txt` and not `src/a.ts`
- [ ] Tests: after `git add -f bin/keep.txt` and a commit, `bin` and `bin/keep.txt` are absent from the answer and `bin/Debug/a.dll` is present
- [ ] Tests: after `bin/` is deleted, `bin/Debug/a.dll` is present and `bin` is absent (FWIG-47)
- [ ] Tests: no path ignored (git exits 1) answers an empty set, not null
- [ ] Tests: paths with a space, `#`, `!`, a leading `-` and `é` come back exactly as sent (FWIG-48)
- [ ] Tests: a temp folder that is not a repository answers null; a runner that never settles past the timeout answers null (injected runner receiving `timeoutMs: 5000`)
- [ ] Tests: the recorded call's args start with `READ_ONLY_FLAGS`, then `check-ignore`, `--stdin`, `-z`, and its `input` is the paths joined and ended by NUL (L-020)
- [ ] Gate check passes: `npx vitest run src/main/ignore-check.test.ts`, then the full gate (wall time, L-005)
- [ ] Test count: T8 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): ask git check-ignore about a batch of paths`

---

### T10: The watcher drops what git ignores

**What**: The batch close classifies through `IgnoreAnswers` and `checkIgnored` before emitting, as
design.md describes; `index.ts` passes the real `checkIgnored`.
**Where**: `src/main/file-watcher.ts`, one dep line in `src/main/index.ts`
**Depends on**: T9
**Reuses**: the fake-port harness (`file-watcher.test.ts:18-87`); T8, T9
**Requirement**: FWIG-01, FWIG-02, FWIG-03, FWIG-04, FWIG-05, FWIG-07, FWIG-08, FWIG-09, FWIG-10, FWIG-11, FWIG-12, FWIG-13, FWIG-46, FWIG-47

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (fake watch port and scheduler; a recording `checkIgnored` that wraps the real one over a real temp repository, as the issue asks):

- [ ] Tests: a batch of `bin/a.dll` and `bin/b.dll` emits nothing; a batch of `bin/a.dll` and `src/a.ts` emits `{ paths: ['src/a.ts'] }` (FWIG-01, 02)
- [ ] Tests: a tracked `bin/keep.txt` (force-added) is emitted when written (FWIG-03)
- [ ] Tests: the second batch under `bin/` makes no `checkIgnored` call; the first made exactly one, holding `bin` (FWIG-04, 05)
- [ ] Tests: a folder `out/` added to `.gitignore` after the watch started: its first batch makes one call and emits nothing, the next makes none (FWIG-46)
- [ ] Tests: each forgetting trigger alone (L-087): a batch naming `src/.gitignore` asks again about a path answered before; a git-state batch asks nothing, emits every named path with `gitStateChanged: true`, and the next batch asks again; a reselection asks again (FWIG-07, 08, 09)
- [ ] Tests: a `checkIgnored` answering null emits the batch unfiltered, and the next batch asks again (FWIG-10)
- [ ] Tests: an unnamed event plus ignored paths emits `{ paths: [] }` (FWIG-11)
- [ ] Tests: with a `checkIgnored` held open, a second batch's call starts only after the first settles, and the two emits leave in order (FWIG-12)
- [ ] Tests: a selection change while the check is held open drops that batch (FWIG-13)
- [ ] Tests: a deleted `bin/` batch (`bin`, `bin/Debug/a.dll`) emits at most `['bin']` (FWIG-47)
- [ ] Every existing `file-watcher.test.ts` case passes unchanged
- [ ] `index.ts` passes `checkIgnored`; `npm run typecheck` is clean
- [ ] Gate check passes: `npx vitest run src/main/file-watcher.test.ts`, then the full gate
- [ ] Test count: T9 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): drop what git ignores before a watch batch leaves main`

---

### T11: The diff reads leave the index alone

**What**: Every git read in `readSide`, `diffStats` and `untrackedStats` gets `...READ_ONLY_FLAGS`.
**Where**: `src/main/file-diff.ts`
**Depends on**: T10
**Reuses**: `file-diff.test.ts`'s recording runner (`:183-188`)
**Requirement**: FWIG-15, FWIG-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests (real repository): every tracked file's mtime touched with its bytes unchanged, then `diffStats(repo, 'uncommitted')`: `.git/index` bytes equal before and after; the same test fails when the config flag is removed from the call (seen once, written here) (FWIG-16)
- [ ] Tests: the recorded args of a `readDiffSides` against the disk and of a since-base one start with `READ_ONLY_FLAGS`; `:288` asserts the prefix and then `cat-file`, not `args[0]`
- [ ] Tests: the counts `diffStats` returns are unchanged by the flags (the existing cases)
- [ ] Gate check passes: `npx vitest run src/main/file-diff.test.ts`, then the full gate
- [ ] Test count: T10 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `fix(files): keep the diff reads from refreshing git's index`

---

### T12: The tree reads leave the index alone

**What**: Every git read in `listDir` and `changedSince` gets `...READ_ONLY_FLAGS`.
**Where**: `src/main/file-tree.ts`
**Depends on**: T11
**Reuses**: `file-tree.test.ts`'s capped runner (`:172`)
**Requirement**: FWIG-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: a recording runner sees `READ_ONLY_FLAGS` in front of all three `listDir` reads (the `allSettled` trio, L-029) and both `changedSince` reads
- [ ] Tests: the existing listings are unchanged
- [ ] Gate check passes: `npx vitest run src/main/file-tree.test.ts`, then the full gate and `npx electron-vite build`
- [ ] Test count: T11 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `fix(files): keep the tree reads from refreshing git's index`

---

### T13: The refresh gate

**What**: `createRefreshGate` and `mergeBatches`.
**Where**: `src/renderer/src/lib/refresh-gate.ts`
**Depends on**: T12
**Reuses**: the deferred-promise style of the existing lib tests
**Requirement**: FWIG-18, FWIG-19, FWIG-20, FWIG-21, FWIG-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: a request while idle calls `run` synchronously, once (FWIG-18)
- [ ] Tests: three requests while the first run is held open call `run` no more until it settles, then exactly once with the merged job (FWIG-19, 20)
- [ ] Tests: the trailing run starts after a rejected run, and after a `run` that throws synchronously (FWIG-21)
- [ ] Tests: a request during the trailing run waits for it, then runs once more (a third run, not two)
- [ ] Tests: `dropWaiting` during a run leaves no trailing run (FWIG-23)
- [ ] Tests: `mergeBatches` keeps first-seen order without duplicates, ORs `gitStateChanged` both ways, and takes the second batch's worktree
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/refresh-gate.test.ts`, then the full gate
- [ ] Test count: T12 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): run one batch refresh at a time with one trailing run`

---

### T14: The request key

**What**: `requestKey(request)` as design.md defines it.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T13
**Reuses**: `diffRequestFor` (`:29-45`) to build the cases
**Requirement**: FWIG-24, FWIG-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: two `diffRequestFor` results for the same change and merge base, built separately, have equal keys (FWIG-24)
- [ ] Tests: the key changes with the status (modified to deleted, untracked to added), the path, the old path of a rename, and the merge base (FWIG-26)
- [ ] Tests: `requestKey(null)` differs from every non-null key; a disk side and a `HEAD` side of the same path differ
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/diff-view.test.ts`, then the full gate
- [ ] Test count: T13 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): key a diff request by the sides it reads`

---

### T15: Disk revisions

**What**: `bumpRevisions(prev, paths)`.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T14
**Reuses**: `tabsAffected` (`:205-208`) for the path rule the hook applies before it
**Requirement**: FWIG-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests: two paths bump to 1 from nothing and to 2 from 1; another path keeps its value; `prev` is not mutated
- [ ] Tests: a duplicated path bumps once; an empty list returns `prev` itself (same reference)
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/files-view.test.ts`, then the full gate
- [ ] Test count: T14 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): count the disk batches that name each listed file`

---

### T16: Sections re-read by key and revision

**What**: `DiffSection` takes `revision`, reads its request through a ref and keys its read effect on
`requestKey(request)`, `revision` and `refreshToken`; `AllChangesTab` takes `revisions` and passes each
section its value.
**Where**: `src/renderer/src/components/DiffSection.tsx`, `src/renderer/src/components/AllChangesTab.tsx`
**Depends on**: T15
**Reuses**: T14, T15; the effect at `DiffSection.tsx:103-115`
**Requirement**: FWIG-24, FWIG-25, FWIG-26, FWIG-27, FWIG-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The read effect's dependencies are exactly `mounted`, `expanded`, the key, `revision`, `stat.uncountable`, `worktreePath` and `refreshToken`; no ref is read during render (lint clean, warning count unchanged)
- [ ] `CommitTab` passes no `revisions`, so its sections read once per mount as before (FWIG-29)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: manual
**Gate**: full

**Commit**: `feat(files): re-read an All changes section only when its sides or file changed`

---

### T17: The hook gates its batch refreshes

**What**: Loaders return their promises; `runBatch` collects every read and bumps revisions; the
`files:changed` listener goes through the gate; `dropWaiting` on a worktree or direction change;
`diskRevisions` on `UseFiles`.
**Where**: `src/renderer/src/lib/use-files.ts`
**Depends on**: T16
**Reuses**: T13, T15; the handler at `:498-529`
**Requirement**: FWIG-18, FWIG-19, FWIG-20, FWIG-21, FWIG-22, FWIG-23, FWIG-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `runBatch` reads `live.current` when it starts, never the batch's arrival-time state (read and written here, FWIG-22)
- [ ] A manual check on the dev app: with a `console.count` added for the duration of the check only, 10 writes 50 ms apart to one listed file give at most two batch runs in flight over time, never overlapping (start and end logged), and the diff shows the last write; the instrumentation removed and the diff clean of it
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: manual
**Gate**: full

**Commit**: `feat(files): send watch batches through the refresh gate`

---

### T18: The tab strip passes the revisions

**What**: `FileTabs` passes `files.diskRevisions` to the All changes stack in Uncommitted mode only.
**Where**: `src/renderer/src/components/FileTabs.tsx`
**Depends on**: T17
**Reuses**: the mount at `:460-475`
**Requirement**: FWIG-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Diff-to-origin passes `undefined`; read here (FWIG-28)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Tests**: manual
**Gate**: full

**Commit**: `feat(files): hand the disk revisions to the uncommitted stack`

---

### T19: The Files diff smoke, in full

**What**: Run the whole Files diff smoke and the watch section on the changed build.
**Where**: `.specs/features/files-watch-ignored/tasks.md`
**Depends on**: T18
**Reuses**: T5's section
**Requirement**: FWIG-01, FWIG-14, FWIG-27, FWIG-30, FWIG-31, FWIG-42, FWIG-43, FWIG-44, FWIG-45

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (dev app on a throwaway user data folder, freshly seeded before each drive):

- [ ] `SMOKE_ONLY=watch`: 15a, 15b and 15c pass
- [ ] 15a seen failing on a main mutant that emits every named path unfiltered (relaunched), restored from `.orig`
- [ ] The full drive passes, FDIF-30 (at or under 1,000 ms, the time written here), FDIF-31 and the fold section included; the icon checks ran last
- [ ] `SMOKE_ONLY=fold` passes on its own seed
- [ ] `git status --porcelain` equals the baseline after the mutant
- [ ] Gate check passes: `npm run lint`

**Tests**: manual
**Gate**: manual

**Commit**: `test(smoke): record the Files diff smoke on the ignored-path watcher`

---

### T20: Prove the bench targets can fail

**What**: Show each Files target read FAIL under a fault in the code it measures.
**Where**: `.specs/features/files-watch-ignored/tasks.md`
**Depends on**: T19
**Reuses**: T4's runs; the mutation procedure under Gate Check Commands
**Requirement**: FWIG-17, FWIG-24, FWIG-37, FWIG-38, FWIG-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when** (each rebuilt, `--sessions 0 --files-view --minutes 1`, numbers written here):

- [ ] Mutant 1, the watcher emits every named path: the build loop target reads FAIL
- [ ] Mutant 2, `DiffSection`'s key replaced by the request object: the edit loop target reads FAIL with a ratio above 2
- [ ] Mutant 3, `READ_ONLY_FLAGS` without `-c diff.autoRefreshIndex=false`: the touch loop target reads FAIL
- [ ] The unmutated build reads PASS on all three runs
- [ ] Each mutant restored from `.orig`; `git status --porcelain` equals the baseline; rebuilt
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: manual
**Gate**: manual

**Commit**: `test(bench): record that the Files targets fail under injected faults`

---

### T21: The measurements after the change

**What**: Run T6's four shapes on the changed build and write the comparison.
**Where**: `.specs/features/files-watch-ignored/validation.md`
**Depends on**: T20
**Reuses**: T6
**Requirement**: FWIG-01, FWIG-17, FWIG-24, FWIG-37, FWIG-38, FWIG-39, FWIG-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `## Measurements` holds an "After" part beside "Before": same machine, the commit, each summary verbatim, and the before / after table of the four Files figures
- [ ] The three Files targets read PASS; any that does not is written with its numbers and reported to the owner before the Verifier runs
- [ ] The floor run's `bench-wt-1` git count is written, so the build loop's 0 reads against it
- [ ] Gate check passes: `npm run lint`

**Tests**: manual
**Gate**: manual

**Commit**: `docs(specs): record the Files view figures after the change (#150)`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2 ------→ T3 ------→ T4 ------→ T5 ------→ T6
Phase 2:  T6 ------→ T7 ------→ T8 ------→ T9 ------→ T10 -----→ T11 -----→ T12
Phase 3:  T12 -----→ T13 -----→ T14 -----→ T15 -----→ T16 -----→ T17 -----→ T18
Phase 4:  T18 -----→ T19 -----→ T20 -----→ T21
```

Twenty-one tasks: four batches at Execute (Phase 1, six tasks; Phase 2, six; Phase 3, six; Phase 4,
three), so the sub-agent offer comes first. T1 and T2 are stop points: no production code is written
before both have passed.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: setup and stop rule | setup + 1 run, notes | ⚠️ Cohesive (the stop rule needs the setup) |
| T2: probes | 3 throwaway probes, notes | ✅ Granular |
| T3: summary Files block | columns + 3 targets, 1 file | ⚠️ Cohesive |
| T4: bench Files rows | 4 options + seed + loops, 1 file | ⚠️ Cohesive (one table, one loop each) |
| T5: smoke section | 1 section, 1 file | ✅ Granular |
| T6: before runs | 4 runs, notes | ✅ Granular |
| T7: runner input | 1 option + 1 constant, 1 file | ✅ Granular |
| T8: answers | 1 class + 1 helper, 1 file | ✅ Granular |
| T9: check-ignore | 1 function | ✅ Granular |
| T10: watcher | 1 method chain + 1 wiring line in `index.ts` | ⚠️ Cohesive (L-001: the required dep and its producer land together) |
| T11: diff reads | 3 functions, 1 file | ✅ Granular |
| T12: tree reads | 2 functions, 1 file | ✅ Granular |
| T13: gate | 1 factory + 1 merge, 1 file | ✅ Granular |
| T14: request key | 1 function | ✅ Granular |
| T15: revisions | 1 function | ✅ Granular |
| T16: sections | 1 prop pair across a parent and its child | ⚠️ Cohesive (`revision` is required on the child the parent alone mounts) |
| T17: hook | 1 hook | ✅ Granular |
| T18: strip | 1 prop | ✅ Granular |
| T19: smoke run | runs, notes | ✅ Granular |
| T20: falsification | 3 mutants, notes | ✅ Granular |
| T21: after runs | 4 runs, notes | ✅ Granular |

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
| T1: setup and stop rule | notes | manual | manual | ✅ OK |
| T2: probes | notes | manual | manual | ✅ OK |
| T3: summary Files block | bench summary | unit | unit | ✅ OK |
| T4: bench Files rows | bench harness | manual | manual | ✅ OK |
| T5: smoke section | smoke script | manual | manual | ✅ OK |
| T6: before runs | notes | manual | manual | ✅ OK |
| T7: runner input | git runner | unit (real git) | unit | ✅ OK |
| T8: answers | ignore answers | unit (pure) | unit | ✅ OK |
| T9: check-ignore | `checkIgnored` | unit (real repository) | unit | ✅ OK |
| T10: watcher | file watcher + `index.ts` wiring | unit + none | unit | ✅ OK (highest) |
| T11: diff reads | Files reads | unit (real git) | unit | ✅ OK |
| T12: tree reads | Files reads | unit (real git) | unit | ✅ OK |
| T13: gate | renderer lib | unit | unit | ✅ OK |
| T14: request key | renderer lib | unit | unit | ✅ OK |
| T15: revisions | renderer lib | unit | unit | ✅ OK |
| T16: sections | renderer components | manual | manual | ✅ OK (decisions tested in T14, T15) |
| T17: hook | renderer hook | manual | manual | ✅ OK (decisions tested in T13, T15) |
| T18: strip | renderer component | manual | manual | ✅ OK |
| T19: smoke run | smoke | manual | manual | ✅ OK |
| T20: falsification | bench | manual | manual | ✅ OK |
| T21: after runs | notes | manual | manual | ✅ OK |

## Requirement Coverage

| FWIG ID | Unit (task) | Manual (task, run) |
| ------- | ----------- | ------------------ |
| 01 | T10 | T5 15a (fails before), T19 15a, T21 build run |
| 02 | T10 | — |
| 03 | T9, T10 | — |
| 04 | T8, T10 | — |
| 05 | T8, T10 | — |
| 06 | T8 | — |
| 07 | T10 | — |
| 08 | T10 | — |
| 09 | T10 | — |
| 10 | T9, T10 | — |
| 11 | T10 | — |
| 12 | T10 | — |
| 13 | T10 | — |
| 14 | — | T5 15c (seen failing on a mutant), T19 |
| 15 | T7, T9, T11, T12 | — |
| 16 | T11 | — |
| 17 | — | T20 mutant 3, T21 touch run |
| 18 | T13 | T17 |
| 19 | T13 | T17 |
| 20 | T13 | T17 |
| 21 | T13 | T17 |
| 22 | — | T17 (read) |
| 23 | T13 | T17 |
| 24 | T14 | T16 (read), T20 mutant 2, T21 edit run |
| 25 | T15 | T16, T17 |
| 26 | T14 | T16 (read) |
| 27 | — | T16 (read), T19 FDIF-31 check |
| 28 | — | T18 (read) |
| 29 | — | T16 (read) |
| 30 | — | T19 FDIF-30 check |
| 31 | — | T19 fold section |
| 32 | — | T4 run A |
| 33 | — | T4 run B |
| 34 | — | T4 run C |
| 35 | — | T4 run D |
| 36 | T3 | T4 run B |
| 37 | T3 | T20 mutant 1, T21 |
| 38 | T3 | T20 mutant 2, T21 |
| 39 | T3 | T20 mutant 3, T21 |
| 40 | — | T1 |
| 41 | — | T6, T21 |
| 42 | — | T19 |
| 43 | — | T5, T19 |
| 44 | — | T5 (seen failing), T19 |
| 45 | — | T5 (seen failing), T19 |
| 46 | T10 | — |
| 47 | T9, T10 | — |
| 48 | T9 | — |
