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
- [x] Run C, `--edit-interval 1000` in place of the build loop: `src/f0000.ts` keeps its size and its seeded line's content moved in the kept copy (FWIG-34, amended 2026-10-03; first written as "grew by about 60 lines")
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
- Run C, first version (superseded): the loop appended a line each tick; `src/f0000.ts` grew by
  118 lines and read "untouched sections stay ... 2.00 PASS" on the build before the change (see the
  note below).
- Run C, amended (2026-10-03, the owner's choice after T6): the seed's appended line now carries a
  six-digit value (`export const seeded_<f> = 00000<f>`) and the edit loop rewrites that line of
  `src/f0000.ts` in place, so the size and the stack's layout hold. Exit 0, "edit loop: 117 writes,
  0 skipped"; the kept `src/f0000.ts` is 551 bytes (520 committed + the 31-byte seeded line), 21
  lines, ending `export const seeded_0 = 000117`, `git diff --numstat` 1 / 0. Steady 1:
  `files:changed` 59, git 796, `cat-file` 618, `wt:status` 0; "untouched sections stay ... 10.47
  FAIL". A CDP probe during the run counted 12 `.diff-section` elements, 1 holding a diff editor
  30 s after the view opened and 3 (`f0000`, `f0001`, `f0002`) at 90 s.
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
  costs fewer `cat-file` than the spec's "about 20" estimate. In the first Run C it was exactly 2
  per `files:changed`, the target's limit, because the appended file grew over the viewport; the
  amended loop keeps the layout (see Run C, amended).

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

- [x] `## Measurements` holds a "Before" part: the commit, the machine without names (CPU class, cores, RAM), each run's summary verbatim, and a table of the four Files figures per steady row
- [x] The three Files targets read FAIL on the build loop and touch loop runs and on the edit loop run, or the exception is written with its reason (for example, a figure already at target, which triggers the T1 stop rule)
- [x] A note at the top: the Verifier keeps this section and adds its report below it
- [x] Gate check passes: `npm run lint`

**Result (2026-10-03)**: the four runs on the built app at `e941982` (no production change), 306 s
each, all exit 0; written to `validation.md`, `## Measurements`, "Before (T6, 2026-10-03)".

- Floor: every steady row 0 / 0 / 0 / 0 on `bench-wt-1`.
- Build loop (100 ms): steady rows 186 / 185 / 185 `files:changed`, 1,702 / 1,670 / 1,664 git,
  1,137 / 1,115 / 1,109 `cat-file`, 0 `worktree:status`. "ignored writes start no git 1702 **FAIL**".
- Edit loop (1,000 ms): 60 / 59 / 60 `files:changed`, 300 / 295 / 300 git, 120 / 118 / 120
  `cat-file`, 0 `worktree:status`. "untouched sections stay ... 2.00 **PASS**".
- Touch loop (1,000 ms): 119 / 118 / 119 `files:changed`, 1,731 / 1,709 / 1,730 git, 1,074 /
  1,059 / 1,074 `cat-file`, 60 / 60 / 59 `worktree:status`. "the view's reads leave the index alone
  60 **FAIL**".
- **Superseded (first edit run): the edit target (FWIG-38) read PASS before the change**, at 358
  `cat-file` / 179 `files:changed` = 2.00, its limit. Each edit batch reads one HEAD side (2
  `cat-file`), so one All changes section re-reads; the build loop's batches read 6 (three sections).
  The stack re-reads only its mounted sections (expanded and near the viewport), and the appended
  file is the stack's first section, which grows by 60 lines a minute and, by inference from the
  counts, leaves itself the only one mounted (the spawn row, while it is still short, reads 3.8 per
  batch). The edit run as specified cannot show the change. **Stopped here: the owner decides**
  between keeping the run as it is (FWIG-38 shown by unit tests only) and changing the edit loop so
  the written file does not crowd the viewport, then re-running this run. No production change was
  made.
- **Re-recorded (2026-10-03, the owner chose to rewrite the line in place, FWIG-34 amended)**: the
  edit run at `b9297d3` (no production change; only the bench script and the spec files differ from
  `e941982`), rebuilt first, 306 s, exit 0: steady rows 59 / 59 / 60 `files:changed`, 780 / 776 /
  801 git, 603 / 594 / 622 `cat-file`, 0 `worktree:status`; per batch one `status`, one `diff`, one
  `ls-files` and about 10 `cat-file`. "untouched sections stay ... **10.22 FAIL**" (1,819 / 178).
  "edit loop: 235 writes, 1 skipped". A CDP probe during the run counted 12 `.diff-section`
  elements, 3 of them holding a diff editor (`f0000`, `f0001`, `f0002`) 90 s after the view
  opened; a second sample at 180 s found none (single sample, not explained). validation.md's
  "Before" holds this run and keeps the first one as a superseded note. All three Files targets now
  read FAIL before the change.
- FPOL-14, 16 and 18 (T5's full drive) are recorded as pre-existing by the owner: FWIG-42 and T19
  amended, and a follow-up written in validation.md.

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

- [x] Tests: `READ_ONLY_FLAGS` equals `['--no-optional-locks', '-c', 'diff.autoRefreshIndex=false']` by literal (L-009)
- [x] Tests: `git(tmpdir(), ['hash-object', '--stdin'], { input: 'abc' })` answers git's own hash of `abc` (observed from the child, L-020)
- [x] Tests: the existing timeout case (`hash-object --stdin` with no input, 200 ms) still times out, so stdin stays open without `input` (on `main`; if #165 merges first, its sleeping-alias cases replace this one and `input` folds into its `end()`)
- [x] Tests: an `input` call goes through the pacer and diagnostics: the existing `recordingGit` harness sees one start and one end for it
- [x] Tests: a `READ_ONLY_FLAGS`-prefixed `rev-parse --git-dir` in a temp repository answers as the plain one does
- [x] #147's diagnostics probe still wraps the call (`src/main/git.ts:30-33` at `fc19a3c`)
- [x] Gate check passes: `npx vitest run src/main/git.test.ts`, then the full gate (suite wall time compared with T1's, L-005)
- [x] Test count: T3 count + the new tests

**Result (2026-10-03)**: `src/main/git.test.ts` 23 tests (19 + 4 new), all passing; full gate 2,792
tests in 127 files (2,788 + 4), typecheck clean, lint 0 errors and 18 warnings (unchanged), 100 s
wall (T3: about 104 s; no drift, L-005).

- Shape: `git()` takes `input` and, inside the pacer callback, calls `started.child.stdin?.end(input)`
  on the `execFile` promise only when `input` is given (`src/main/git.ts:48`); `.finally(end)` and
  `diagnostics().gitRequested` (`:32`) wrap the call as before. `READ_ONLY_FLAGS` is exported beside it.
- Red first: the three `input` tests timed out at 30 s and the constant test failed on the missing
  export before the change.
- The expected hash `f2ba8f84...` is `printf abc | git hash-object --stdin` on this machine: the child
  read exactly `abc` and saw stdin close (L-020).
- The no-input timeout cases (`git.test.ts:91`, `:198`) still time out at 200 ms: stdin stays open
  without `input`.

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

- [x] Tests: `IGNORE_ASK_LIMIT` is `2000` by literal (L-009)
- [x] Tests: `parentFolders('a/b/c.ts')` is `['a', 'a/b']`; a root-level path gives `[]`
- [x] Tests: with nothing learned, `questionsFor(['bin/Debug/a.dll'])` is `['bin', 'bin/Debug', 'bin/Debug/a.dll']`, folders first, without duplicates across several paths
- [x] Tests: after `learn(['bin', ...], {'bin', ...})`, `isIgnored('bin/x/y.dll')` is true and `questionsFor` skips every path under `bin`; a kept answer is never asked again; a path asked and not listed is kept
- [x] Tests: a tracked-file case, `learn(['bin', 'bin/keep.txt', 'bin/Debug'], {'bin/Debug'})`, keeps `bin/keep.txt` and drops `bin/Debug/a.dll`
- [x] Tests: at the limit (2,000 questions) every question is asked; at 2,001 only the folders are; with 2,001 folders nothing is (L-042, L-050)
- [x] Tests: `forget` makes every path unknown again
- [x] Gate check passes: `npx vitest run src/main/ignore-check.test.ts`, then the full gate
- [x] Test count: T7 count + the new tests

**Result (2026-10-03)**: `src/main/ignore-check.test.ts` 16 tests, all passing; full gate 2,808 tests
in 128 files (2,792 + 16), typecheck clean, lint 0 errors and 18 warnings (unchanged after
`prettier --write` on the new test file), 102 s wall.

- Shape: `IgnoreAnswers` holds two sets, `ignored` and `kept`; anything in neither is unknown.
  `isIgnored` checks the path and each of its `parentFolders`, so `binary/a.ts` is not under an
  ignored `bin` (`ignore-check.test.ts:63`). `questionsFor` drops paths already ignored, then lists
  the unknown parent folders in first-seen order, then the unknown paths not already listed as a
  folder; it returns `[]` when the folders exceed 2,000, the folders alone when folders plus paths
  exceed 2,000, and everything otherwise.
- The limit at both comparisons (L-042): 2,000 questions (1 folder + 1,999 paths) all asked
  (`:88-92`); 2,001 (1 + 2,000) only the folder (`:96`); 2,000 folders + 2,000 paths only the
  folders (`:99-103`); 2,001 folders nothing (`:107`). The paths left out are not remembered: after
  learning the folder they are asked on the next call (`:110-117`).
- Red first: the file failed on the missing module before `ignore-check.ts` existed.

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

- [x] Tests: `IGNORE_CHECK_TIMEOUT_MS` is `5000` by literal (L-009)
- [x] Tests: with a root `.gitignore` (`bin/`, `*.log`), a nested `src/.gitignore` (`gen/`) and `.git/info/exclude` (`scratch/`), the answer holds `bin`, `bin/Debug/a.dll`, `src/x.log`, `src/gen/a.ts`, `scratch/n.txt` and not `src/a.ts`
- [x] Tests: after `git add -f bin/keep.txt` and a commit, `bin` and `bin/keep.txt` are absent from the answer and `bin/Debug/a.dll` is present
- [x] Tests: after `bin/` is deleted, `bin/Debug/a.dll` is present and `bin` is absent (FWIG-47)
- [x] Tests: no path ignored (git exits 1) answers an empty set, not null
- [x] Tests: paths with a space, `#`, `!`, a leading `-` and `é` come back exactly as sent (FWIG-48)
- [x] Tests: a temp folder that is not a repository answers null; a runner that never settles past the timeout answers null (injected runner receiving `timeoutMs: 5000`)
- [x] Tests: the recorded call's args start with `READ_ONLY_FLAGS`, then `check-ignore`, `--stdin`, `-z`, and its `input` is the paths joined and ended by NUL (L-020)
- [x] Gate check passes: `npx vitest run src/main/ignore-check.test.ts`, then the full gate (wall time, L-005)
- [x] Test count: T8 count + the new tests

**Result (2026-10-03)**: `src/main/ignore-check.test.ts` 25 tests (16 + 9 new), all passing in about
5 s; full gate 2,817 tests in 128 files (2,808 + 9), typecheck clean, lint 0 errors and 18 warnings,
102 s wall (T7: 100 s; no drift, L-005).

- Shape: `checkIgnored` runs `[...READ_ONLY_FLAGS, 'check-ignore', '--stdin', '-z']` with the paths
  each ended by NUL as `input` and `timeoutMs: IGNORE_CHECK_TIMEOUT_MS`; it splits stdout on NUL. A
  rejection whose `code` is 1 and that is not a timeout answers an empty set; every other rejection
  answers null.
- Fixture (fresh per test, `core.autocrlf` false): root `.gitignore` `bin/` and `*.log`,
  `src/.gitignore` `gen/`, `.git/info/exclude` `scratch/`, `src/a.ts` committed. The answers are
  asserted as exact sets (`ignore-check.test.ts:192-217`, `:230`, `:237`, `:241`, `:250`), so a path
  reported that should not be fails as well as one missing. Every row matches T2's semantics probe.
- FWIG-48: ten paths, five under `bin/` and five root-level `*.log` (a space, `#`, `!`, a leading
  `-`, `é`), come back exactly as sent; `src/é ! #.ts` and `src/-a.ts` are not reported.
- The timeout is the runner's, as design.md's Error Handling says ("killed at 5,000 ms by the
  runner's timeout"); `checkIgnored` adds no timer. The test's runner records the `timeoutMs` it
  receives (`[5000]`) and stands in for a hanging check with a real `git hash-object --stdin`
  killed at 200 ms, so the rejection has the runner's real timeout shape (`:259-269`).
- That timeout case relied on stdin staying open without `input`. It now runs a sleeping alias
  (`-c alias.wait=!sleep 5 wait`), as #165 (CRTO-06, stdin ended on every call) did for its own
  cases, so it holds with or without #165 (changed 2026-10-03, when merging into `develop` with #165
  showed the stdin version answering at once). The alias runs in the system temp folder, not the
  test repo: on Windows killing git leaves the sleep running, and CI failed the repo's removal with
  EBUSY when it ran in the repo.
- Red first: 9 failures on the missing exports before the change.

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

- [x] Tests: a batch of `bin/a.dll` and `bin/b.dll` emits nothing; a batch of `bin/a.dll` and `src/a.ts` emits `{ paths: ['src/a.ts'] }` (FWIG-01, 02)
- [x] Tests: a tracked `bin/keep.txt` (force-added) is emitted when written (FWIG-03)
- [x] Tests: the second batch under `bin/` makes no `checkIgnored` call; the first made exactly one, holding `bin` (FWIG-04, 05)
- [x] Tests: a folder `out/` added to `.gitignore` after the watch started: its first batch makes one call and emits nothing, the next makes none (FWIG-46)
- [x] Tests: each forgetting trigger alone (L-087): a batch naming `src/.gitignore` asks again about a path answered before; a git-state batch asks nothing, emits every named path with `gitStateChanged: true`, and the next batch asks again; a reselection asks again (FWIG-07, 08, 09)
- [x] Tests: a `checkIgnored` answering null emits the batch unfiltered, and the next batch asks again (FWIG-10)
- [x] Tests: an unnamed event plus ignored paths emits `{ paths: [] }` (FWIG-11)
- [x] Tests: with a `checkIgnored` held open, a second batch's call starts only after the first settles, and the two emits leave in order (FWIG-12)
- [x] Tests: a selection change while the check is held open drops that batch (FWIG-13)
- [x] Tests: a deleted `bin/` batch (`bin`, `bin/Debug/a.dll`) emits at most `['bin']` (FWIG-47)
- [x] Every existing `file-watcher.test.ts` case passes ~~unchanged~~ with only `await h.flush()` added (amended by the owner 2026-10-03, see the SPEC_DEVIATION below)
- [x] `index.ts` passes `checkIgnored`; `npm run typecheck` is clean
- [x] Gate check passes: `npx vitest run src/main/file-watcher.test.ts`, then the full gate
- [x] Test count: T9 count + the new tests

**Result (2026-10-03)**: `src/main/file-watcher.test.ts` 23 tests (9 existing + 14 new), all
passing; full gate 2,831 tests in 128 files (2,817 + 14), typecheck clean, lint 0 errors and 18
warnings, 107 s wall (T9: 102 s; each real-repository case costs about 0.45 s for its fixture).

- Shape, as design.md's "File watcher": `FileWatcherDeps.checkIgnored` is required (L-001), and
  `index.ts` passes `(worktreePath, paths) => checkIgnored(worktreePath, paths)` to the Files
  watcher only. The batch timer snapshots `paths`, `gitStateChanged` and the new `sawUnnamed`,
  and appends `settle(batch, generation)` to the `classifying` chain. `classify` drops a stale
  generation, emits a git-state batch whole after `forget()`, forgets on any `.gitignore`, asks
  `questionsFor` once, re-checks the generation after the await, learns a set (nothing on null),
  and emits the kept paths unless none is left and no event was unnamed. A rejected check is
  logged and the batch emitted unfiltered. `select` (through `closeAll`) replaces the answers
  and bumps the generation. The chain also catches a throwing `emit`, so one failure cannot stop
  every later batch.
- The new cases run the real `checkIgnored` over a fresh temp repository per case (`.gitignore`
  `bin/`, `core.autocrlf` false), recorded by `recordingCheck`, which can hold a call open or
  replace its answer; `drain()` waits until every started check, and the one it led to, settled.
  Each forgetting trigger has its own case with a control (`file-watcher.test.ts:397`, `:412`,
  `:435`); the throwing-check case (`:469`) covers design.md's Error Handling for FWIG-10.
- Red first: against the watcher before the change, 13 of the 14 new cases failed; the
  throwing-check case passes there too, because the old watcher never filtered.
- **SPEC_DEVIATION** (owner-approved 2026-10-03): the line "every existing case passes unchanged"
  cannot hold. A closed batch now goes through the async `classifying` chain, so the emit can no
  longer happen inside the timer callback. The owner amended the line to "passes with only `await
  h.flush()` added". The harness's `flush()` now returns a promise (it fires the callback and
  then waits one macrotask), and the harness gains the required `checkIgnored` dep (default: git
  ignores nothing) as an optional parameter. Exactly four cases changed, each by `await` alone,
  with no assertion touched: "emits one change carrying every path of a batch" (`:110`), "drops
  an event under the root's .git entry" (`:129`), "flags a git state change when the git dir's
  index moves" (`:140`) and "flags a git state change when the git dir's HEAD moves" (`:150`).
  Run unchanged against the new watcher, those four failed and the other five passed.

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

- [x] Tests (real repository): every tracked file's mtime touched with its bytes unchanged, then `diffStats(repo, 'uncommitted')`: `.git/index` bytes equal before and after; the same test fails when the config flag is removed from the call (seen once, written here) (FWIG-16)
- [x] Tests: the recorded args of a `readDiffSides` against the disk and of a since-base one start with `READ_ONLY_FLAGS`; `:288` asserts the prefix and then `cat-file`, not `args[0]`
- [x] Tests: the counts `diffStats` returns are unchanged by the flags (the existing cases)
- [x] Gate check passes: `npx vitest run src/main/file-diff.test.ts`, then the full gate
- [x] Test count: T10 count + the new tests

**Result (2026-10-03)**: `src/main/file-diff.test.ts` 26 tests (23 + 3 new), all passing; full gate
2,834 tests in 128 files (2,831 + 3), typecheck clean, lint 0 errors and 18 warnings, 107 s wall
(T10: 106 s; no drift, L-005).

- Shape: `...READ_ONLY_FLAGS` in front of all six reads: `cat-file -s`, `cat-file --filters` and
  `show` in `readSide`; `merge-base` and both `diff --numstat` calls in `diffStats`; `ls-files
  --others` in `untrackedStats`. Nothing else changed.
- FWIG-16 (`file-diff.test.ts:204-211`): a fresh repository per run, 20 tracked files committed
  with `core.autocrlf` false, then 1.5 s idle so the index is older than the write, as in T2.
  Every file is rewritten with its own bytes, `.git/index` is read, `diffStats(repo,
  'uncommitted')` answers `[]`, and the index bytes are unchanged.
- **Seen failing**:
  - Before the change, the test failed: the index was rewritten.
  - With only `-c diff.autoRefreshIndex=false` removed from the uncommitted `diff --numstat`
    call, it failed twice in a row (`expected false to be true`, the index rewritten). That call
    kept `--no-optional-locks`, through a scratch copy-mutate-restore.
  - `file-diff.ts` was restored from `.orig` and the test passes again. This repeats T2's
    finding: `--no-optional-locks` alone does not stop `git diff` from refreshing the index.
- The recorded args (L-020): an uncommitted `readDiffSides` (HEAD against the disk) runs exactly
  `[...READ_ONLY_FLAGS, 'cat-file', '-s', 'HEAD:a.txt']` and `[...READ_ONLY_FLAGS, 'cat-file',
  '--filters', 'HEAD:a.txt']` (`:331`). A since-base one runs `cat-file -s` and `show` for each
  side, each prefixed (`:346`).
- The former `:288` (now `:325-328`) asserts the three prefix arguments by literal, then
  `cat-file` at index 3. That is the planned, stronger update; no other existing test changed,
  and the existing count cases (`diffStats` since-base against `git diff --shortstat`, the
  untracked count, the empty modes) pass unchanged.

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

- [x] Tests: a recording runner sees `READ_ONLY_FLAGS` in front of all three `listDir` reads (the `allSettled` trio, L-029) and both `changedSince` reads
- [x] Tests: the existing listings are unchanged
- [x] Gate check passes: `npx vitest run src/main/file-tree.test.ts`, then the full gate and `npx electron-vite build`
- [x] Test count: T11 count + the new tests

**Result (2026-10-03)**: `src/main/file-tree.test.ts` 23 tests (21 + 2 new), all passing; full gate
2,836 tests in 128 files (2,834 + 2), typecheck clean, lint 0 errors and 18 warnings, 110 s wall;
`npx electron-vite build` passes. Phase 2 ends here.

- Shape: `...READ_ONLY_FLAGS` in front of `ls-tree`, `diff --cached --name-status` and `ls-files
  --others` in `listDir`, and of `merge-base` and `diff --name-status` in `changedSince`.
- `changedSince` gains the same injectable runner `listDir` already has (`run: GitRunner = git`,
  third parameter). Without it, no recording runner could see its args. `index.ts` still calls
  it with two arguments, so production behaviour is unchanged. This adds a parameter, not
  behaviour, and is not a deviation from design.md's "Files reads".
- The recorded args (L-020) are asserted exactly, in call order (`file-tree.test.ts:186`: `listDir(repo,
  'src')`'s trio with the `-- src/` pathspec; `:287`: `changedSince(repo, 'main')`'s two reads).
  Each case also checks the result: the recorded `listDir` equals an unrecorded one, and
  `changedSince` still lists `a.txt` and `new.txt`. Every existing listing case passes unchanged.
- Red first: both new cases failed on the unprefixed args before the change.

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

- [x] Tests: a request while idle calls `run` synchronously, once (FWIG-18)
- [x] Tests: three requests while the first run is held open call `run` no more until it settles, then exactly once with the merged job (FWIG-19, 20)
- [x] Tests: the trailing run starts after a rejected run, and after a `run` that throws synchronously (FWIG-21)
- [x] Tests: a request during the trailing run waits for it, then runs once more (a third run, not two)
- [x] Tests: `dropWaiting` during a run leaves no trailing run (FWIG-23)
- [x] Tests: `mergeBatches` keeps first-seen order without duplicates, ORs `gitStateChanged` both ways, and takes the second batch's worktree
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/refresh-gate.test.ts`, then the full gate
- [x] Test count: T12 count + the new tests

**Result (2026-10-03)**: `src/renderer/src/lib/refresh-gate.test.ts` 12 tests, all passing; full gate
2,848 tests in 129 files (2,836 + 12), typecheck clean, lint 0 errors and 18 warnings, 106 s wall.

- Shape: `createRefreshGate(run, merge, log = console.error)` holds `running` and one `waiting` job.
  `request` while idle calls `run` before it returns; while running it stores the job or merges it
  into the waiting one. A run's promise settling either way releases the gate and starts the waiting
  job; a `run` that throws is turned into a rejected promise, so it releases the same way. A failure
  is logged, never rethrown. `mergeBatches` joins the paths through a `Set` (first-seen order), ORs
  `gitStateChanged` and takes `b.worktreePath`.
- The optional `log` parameter is the one addition to design.md's signature: a swallowed failure
  would hide a broken `runBatch`, and the tests pass a recorder so a rejection prints nothing. It
  adds no behaviour the spec names.
- The runs are held open with hand-settled deferred promises; every assertion reads the jobs `run`
  received, in order (`refresh-gate.test.ts:66`, `:77-85`, `:96`, `:102-113`, `:124-128`,
  `:137-145`, `:156-160`). The sync-throw case also checks the gate is busy with the trailing run
  afterwards (`:110`), not idle. The trailing-run case is a third run, not an overlap (`:141`).
- Red first: the file failed on the missing module before `refresh-gate.ts` existed.

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

- [x] Tests: two `diffRequestFor` results for the same change and merge base, built separately, have equal keys (FWIG-24)
- [x] Tests: the key changes with the status when the sides change (modified to deleted, added to modified), the path, the old path of a rename, and the merge base (FWIG-26) (amended 2026-10-03, first written as "modified to deleted, untracked to added"; see the Result)
- [x] Tests: `untracked` and `added` for the same path give equal keys (FWIG-24, added 2026-10-03)
- [x] Tests: `requestKey(null)` differs from every non-null key; a disk side and a `HEAD` side of the same path differ
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/diff-view.test.ts`, then the full gate
- [x] Test count: T13 count + the new tests

**Result (2026-10-03)**: `src/renderer/src/lib/diff-view.test.ts` 87 tests (77 + 10 new), all
passing; full gate 2,858 tests in 129 files (2,848 + 10), typecheck clean, lint 0 errors and 18
warnings, 108 s wall.

- Shape: `requestKey` returns `-` for null, otherwise the two sides joined by NUL, each `none`,
  `disk:<path>` or `rev:<rev>:<path>`, as design.md defines it.
- **Planning correction** (decided by the coordinator from the spec, 2026-10-03): the first Done-when
  line named "untracked to added" as a status change that changes the key. It cannot: `diffRequestFor`
  builds the same request for both (no original side, the disk as the modified side), and FWIG-24
  says a section whose sides name the same revisions and paths SHALL NOT re-read. FWIG-26 re-reads on
  a status change only when the sides change. The line now names "added to modified" (the original
  side goes from none to the merge base), and a new test pins the equal keys
  (`diff-view.test.ts:129`). Nothing is lost: the `git add` behind that transition moves the index,
  so the batch carries a git-state change and `refreshToken` re-reads every section (FWIG-27).
- Assertions: equal keys `:115` (since-base), `:122` (uncommitted), `:129` (untracked = added);
  changed keys `:136` (modified to deleted), `:143` (added to modified), `:150` (path), `:166-167`
  (a rename's old path, and a rename against a plain modify), `:174` (merge base); `requestKey(null)`
  against four non-null keys `:186`; disk against `HEAD` `:193`.
- Red first: the ten new cases failed on the missing export before the change.

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

- [x] Tests: two paths bump to 1 from nothing and to 2 from 1; another path keeps its value; `prev` is not mutated
- [x] Tests: a duplicated path bumps once; an empty list returns `prev` itself (same reference)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/files-view.test.ts`, then the full gate
- [x] Test count: T14 count + the new tests

**Result (2026-10-03)**: `src/renderer/src/lib/files-view.test.ts` 55 tests (50 + 5 new), all
passing; full gate 2,863 tests in 129 files (2,858 + 5), typecheck clean, lint 0 errors and 18
warnings, 105 s wall.

- Shape: `bumpRevisions(prev, paths)` returns `prev` when `paths` is empty; otherwise it copies
  `prev` and adds one to each distinct path (a `Set`), from 0 when absent. The hook applies
  `tabsAffected` first (T17), so the paths it passes are already the listed spelling.
- Assertions: 1 from nothing and 2 from 1 `files-view.test.ts:182`; an unnamed path keeps its value
  `:188`; a new object and `prev` unchanged `:196-197`; a duplicate bumps once `:201`; the empty list
  returns `prev` itself (`toBe`) `:207`.
- Red first: the five cases failed on the missing export before the change.

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

- [x] The read effect's dependencies are exactly `mounted`, `expanded`, the key, `revision`, `stat.uncountable`, `worktreePath` and `refreshToken`; no ref is read during render (lint clean, warning count unchanged)
- [x] `CommitTab` passes no `revisions`, so its sections read once per mount as before (FWIG-29)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-10-03)**: full gate 2,863 tests in 129 files (unchanged, no tests by convention),
typecheck clean, lint 0 errors and 18 warnings (none in the two changed files), 106 s wall.

- `DiffSection` takes `revision: number`. In render it computes `key = requestKey(request)` and
  creates `requestRef`; an effect with no dependency list writes `requestRef.current = request`, and
  it is declared before the read effect, so within one commit the ref already holds the new request
  when the read effect runs. The read effect reads the request only from the ref and depends on
  exactly `[mounted, expanded, key, revision, stat.uncountable, worktreePath, refreshToken]`
  (`DiffSection.tsx:131`). Nothing reads a ref during render.
- `AllChangesTab` takes `revisions?: Readonly<Record<string, number>>` and passes
  `revision={revisions?.[file.path] ?? 0}`; its `requests` map is unchanged.
- Read (FWIG-29): `CommitTab.tsx:50-64` passes no `revisions`, so each section's `revision` is 0;
  `refreshToken` is pinned to 0 there; the commit stack's `requestFor` is memoized on the sha and
  the parent, so its keys never change either. A commit section reads once per mount, as before.
- Read (FWIG-26, FWIG-27): a base change moves the merge base, which changes every since-base key;
  an index or `HEAD` move still bumps `refreshToken` in the hook (T17 keeps it), which re-reads every
  mounted section. The scroll and fold handling lives in `DiffViewer`, which this task leaves alone:
  a re-read still hands it new `sides` on the same mounted editor.
- `FileTabs` passes no `revisions` until T18, so between T16 and T18 the uncommitted stack re-reads
  a written file only through `refreshToken`. No release sits between the two commits.

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

- [x] `runBatch` reads `live.current` when it starts, never the batch's arrival-time state (read and written here, FWIG-22)
- [x] A manual check on the dev app: with a `console.count` added for the duration of the check only, 10 writes 50 ms apart to one listed file give at most two batch runs in flight over time, never overlapping (start and end logged), and the diff shows the last write; the instrumentation removed and the diff clean of it
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-10-03)**: full gate 2,863 tests in 129 files (unchanged, no tests by convention),
typecheck clean, lint 0 errors and 18 warnings, 102 s wall.

- Shape:
  - `loadDir`, `loadChanged`, `loadUncommitted`, `loadStats`, `loadCommits`, `readTab` and
    `readDiff` return their promises, each still ending in `.catch(console.error)`, so none
    rejects. The early exits return `Promise.resolve()`.
  - `refreshMode` collects what it starts and returns `Promise.allSettled` of it.
  - `WorktreeFiles` gains `revisions` (`{}` in `EMPTY`), and `UseFiles` gains `diskRevisions`
    (`here.revisions`).
- `runBatch` (`use-files.ts:522`) is the old handler's body. It collects every read it starts:
  - the open file tabs the batch names;
  - on a git-state change, every diff tab, with `refreshToken + 1` as before;
  - otherwise, the uncommitted diff tabs the batch names. In Uncommitted mode only, it also bumps
    `bumpRevisions` for `tabsAffected(listed uncommitted paths, event.paths)`, and patches only
    when that list is not empty;
  - then `refreshMode`.

  It resolves on `Promise.allSettled` of all of them (FWIG-21).
- FWIG-22, read: `runBatch` takes `live.current` on its first line (`:523`), when the gate starts
  it, not when the batch arrived. It returns at once when the direction is not active or the
  worktree is another (FWIG-23).
- `runBatch` goes through `useLatestCallback`, so it keeps one identity and always runs the latest
  closure. The gate comes from a `useState` initializer (`:568`), so it is created once and no ref
  is read during render. The `files:changed` listener keeps its two filters and calls
  `gate.request(event)` (`:575`); it depends on `[gate]` only, so it never resubscribes. An effect
  on `[gate, active, worktreePath]` calls `dropWaiting()` (`:582`). A mode switch, a base change, a
  discard and the first listing still call `refreshMode` directly, outside the gate.
- Manual check, dev app:
  - Setup: throwaway user data and seed under the system temp folder (`SMOKE_CONFIG` /
    `SMOKE_BASE`, `--seed`), CDP port 9347, the three flags. The seed was registered as the only
    workspace; `feature/diff` was selected, then Files, Uncommitted, All changes.
  - Instrumentation, temporary: the gate's `run` wrapped with `console.count('fwig-run')`,
    start/end times in `window.__fwigRuns`, and request times in `window.__fwigRequests`.
  - 10 writes 50 ms apart to the listed `untracked.txt`, in 553-573 ms, were done three times:
    - three requests and three runs each time, about 180-200 ms long, each starting after the
      previous one ended (for example 122,113-122,304, 122,377-122,553, 122,675-122,855 ms);
    - no overlap and no unsettled run, one in flight at a time;
    - each batch arrived after the previous run had settled, so the merge path was not exercised in
      the app (the unit tests show it, T13).
  - The open `untracked.txt` diff tab showed the last write (`write 10 of 10, mark-...-10`) after
    the burst.
  - The All changes section of that file did not move from its earlier content. This is expected
    until T18: `FileTabs` passes no `revisions` yet, so the uncommitted stack re-reads only on
    `refreshToken`. T18 re-checks the section.
  - Two sections (`crlf.txt`, `untracked.txt`) held no editor until the stack was scrolled. They
    were inside the 600 px margin, so this is the mount plan's near-viewport behaviour T4 and T6
    already recorded, not this change.
  - The instrumentation was removed by restoring the file's pre-instrumentation copy:
    `git diff` holds no `__fwig`, `console.count` or `FWIG-TEMP`.

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

- [x] Diff-to-origin passes `undefined`; read here (FWIG-28)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Result (2026-10-03)**: full gate 2,863 tests in 129 files (unchanged), typecheck clean, lint 0
errors and 18 warnings, 105 s wall; `npx electron-vite build` passes. Phase 3 ends here.

- Shape: `FileTabs.tsx:471` passes `revisions={files.mode === 'uncommitted' ? files.diskRevisions :
  undefined}` to the All changes stack.
- Read (FWIG-28): in diff-to-origin mode `files.mode` is `since-base`, so the stack gets
  `undefined`, every section's `revision` is 0, and only a key change (merge base, status, path) or
  `refreshToken` re-reads a section. The stack is keyed `all-changes:${files.mode}`, so a mode
  switch remounts it instead of carrying one mode's revisions into the other. `CommitTab` passes
  none (T16).
- Seen on the dev app from T17's check, hot-reloaded with this change, on the same throwaway seed:
  - The uncommitted stack was scrolled so every section held an editor, and `untracked.txt` got 10
    writes 50 ms apart.
  - Its section showed the last write 863 ms after the first write.
  - The other two text sections (`crlf.txt` and the long-named file) kept their lines unchanged.
  - Before this change, the same burst left the section on its earlier content (T17).
- The dev app's process tree was killed by its PID (found by its user-data folder), and the
  throwaway folder was deleted.

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

- [x] `SMOKE_ONLY=watch`: 15a, 15b and 15c pass
- [x] 15a seen failing on a main mutant that emits every named path unfiltered (relaunched), restored from `.orig`
- [x] The full drive passes, FDIF-30 (at or under 1,000 ms, the time written here), FDIF-31 and the fold section included, except FPOL-14, FPOL-16 and FPOL-18 (FWIG-42, amended 2026-10-03); the watch section ran right before the icon checks, the order after them unchanged
- [x] The same full drive on `origin/main` (`fc19a3c`): a throwaway `git worktree add` under the temp folder, its own `npm ci --ignore-scripts` and `node node_modules/electron/install.js`, its dev app on its own throwaway user data and seed; the two drives compared check by check and written here (FPOL-14, 16 and 18 failing on both, nothing else failing on this branch alone); the throwaway worktree removed (`git worktree remove`, `git worktree prune`) afterwards
- [x] `SMOKE_ONLY=fold` passes on its own seed
- [x] `git status --porcelain` equals the baseline after the mutant
- [x] Gate check passes: `npm run lint`

**Result (2026-10-03)**: the dev app at `aab6756` (T18's commit, the whole change), each drive on a
fresh seed and a fresh launch: a throwaway folder under the system temp folder holding the seed and
the user data (`SMOKE_BASE`, `SMOKE_CONFIG`), CDP port 9241 (`SMOKE_PORT`), the three flags; the app's
process tree killed by PID after each drive and the folder deleted.

- `SMOKE_ONLY=watch`: **15a PASS** ("0 events, 0 paths"), 15b PASS (after about 443 ms), 15c PASS
  (control listed in both, no `fwig-build` row). 3/3, exit 0. Before the change (T5) 15a read 7
  events and 27 paths.
- 15a on a main mutant: in `src/main/file-watcher.ts`, `classify`'s
  `const kept = paths.filter((path) => !this.answers.isIgnored(path))` replaced by
  `const kept = [...paths]`, so every named path leaves unfiltered (git is still asked). Copied to
  `.orig`, the mutant text asserted present, the dev app launched after the write: **15a FAIL**, "7
  events, 27 paths", every one under `fwig-build`, as before the change; 15b and 15c PASS. Restored
  from `.orig` in `finally`; `git status --porcelain` empty afterwards, as before the mutant.
- Full drive, relaunched on the restored source: **111/114**, exit 1. The three failures are FPOL-14
  ("0 -> 0 of 50"), FPOL-16 ("9 diff editors (27 Monaco editors) for 0 open sections") and FPOL-18
  ("opened true: 0 -> 0 -> 0 of 45"), the owner's pre-existing three. FDIF-30 (check 18) **arrived in
  732 ms**, under 1,000 ms; FDIF-31 (check 19) PASS ("5 sections -> 4"); every fold check of section
  14 in the drive passes, FOLD-09's scroll half (check 102) included. Order: the discard checks end
  at 56, the watch section is 57 to 59 (all PASS), the icon checks follow at 60 to 69, then the rest
  as on `main`.
- `SMOKE_ONLY=fold` on its own seed: **19/19**, exit 0.
- `origin/main` `fc19a3c`: a detached `git worktree add` under the system temp folder, `npm ci
  --ignore-scripts` and `node node_modules/electron/install.js` there, the same driver and flags. The
  first launch from the temp folder's 8.3 short path died before CDP answered on libuv's
  `Assertion failed: !_wcsnicmp(filename, dir, dirlen), file src\win\fs-event.c` (a watch on a
  short-name path; the branch drives run from a long-name path and never hit it). Launched from the
  same folder's long path, the drive ran: **108/111**, exit 1, FDIF-30 in 676 ms.
- Check by check, matched by title (the numbering shifts by the watch section): the 111 checks the
  two drives share run in the same order and every one has the same verdict on both. The only
  failures on either are FPOL-14, FPOL-16 and FPOL-18, with the same detail text on both. The branch
  adds 15a, 15b and 15c, all PASS. **No check fails on this branch alone.**
- The throwaway worktree removed (`git worktree remove --force`, `git worktree prune`); its folder is
  gone and `git worktree list` no longer names it. No electron process from these drives and no
  throwaway folder left.
- Gate: `npm run lint` 0 errors, 18 warnings.

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

- [x] Mutant 1, the watcher emits every named path: the build loop target reads FAIL
- [x] Mutant 2, `DiffSection`'s key replaced by the request object: the edit loop target reads FAIL with a ratio above 2
- [x] Mutant 3, `READ_ONLY_FLAGS` without `-c diff.autoRefreshIndex=false`: the touch loop target reads FAIL
- [x] The unmutated build reads PASS on all three runs. **Owner-accepted exception (2026-10-03)**: build PASS (0 / 0), touch PASS (0), edit FAIL (6.27; reruns 8.32, 6.37, 6.49; 10.22 before the change). The neighbouring sections remount on every batch (#167), which is outside this feature's design
- [x] Each mutant restored from `.orig`; `git status --porcelain` equals the baseline; rebuilt
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Result (2026-10-03; the unmutated edit run FAIL accepted by the owner, follow-up #167)**: the built app at `870bfd9` (T19's commit),
CDP port 9334, every run `--sessions 0 --files-view --minutes 1` with its one loop, 185 s, exit 0,
`--json` to a scratch folder outside the repository. Each mutant went through a scratch script: copy to
`.orig`, write, assert the mutant text present, `npx electron-vite build`, the run, then restore from
`.orig` in `finally` and rebuild; `git status --porcelain` was empty after each. The machine was not
quiet, as in T6 (other agent sessions and the owner's installed app running).

| Run | Loop | steady 1 `files:changed` / git / `cat-file` / `wt:status` | Target line | Verdict |
| --- | ---- | --------------------------------------------------------- | ----------- | ------- |
| Mutant 1 | build 100 ms | 181 / 543 / 0 / 0 | ignored writes start no git: 543 | **FAIL** |
| Mutant 2 | edit 1,000 ms | 60 / 894 / 715 / 0 | untouched sections stay: 11.92 | **FAIL** |
| Mutant 3 | touch 1,000 ms | 116 / 1,070 / 359 / 60 | the view's reads leave the index alone: 60 | **FAIL** |
| Unmutated | build 100 ms | 0 / 0 / 0 / 0 | ignored writes start no git: 0 | **PASS** |
| Unmutated | edit 1,000 ms | 60 / 560 / 376 / 0 | untouched sections stay: 6.27 | **FAIL** |
| Unmutated | touch 1,000 ms | 59 / 177 / 0 / 0 | the view's reads leave the index alone: 0 | **PASS** |

- Mutant 1 (`src/main/file-watcher.ts`): `classify`'s `const kept = paths.filter((path) =>
  !this.answers.isIgnored(path))` became `const kept = [...paths]`. Git is still asked, and every
  named path still leaves.
- Mutant 2 (`src/renderer/src/components/DiffSection.tsx`): `const key = requestKey(request)` became
  `const key = request`, the request object itself. This puts the read effect's dependency back on
  the object identity that T16 replaced: the stack builds a new object on every list re-read.
- Mutant 3 (`src/main/git.ts`): `READ_ONLY_FLAGS` reduced to `['--no-optional-locks']`.
- **Blocker, the edit target on the unmutated build**: 6.27 here (376 / 60). Three more one-minute edit
  runs, made during the diagnosis below on the same build, read 8.32, 6.37 and 6.49, every one FAIL.
  It is better than before the change (T6: 10.22; mutant 2: 11.92) but not at the limit of 2. Each
  batch costs about 6 `cat-file`: three section reads of 2 each, where the target allows one.
- **Diagnosis (read-only, no source changed)**: a CDP conditional breakpoint (logpoint) on the built
  renderer's `DiffSection` read effect recorded each run of it during an unmutated edit run, with the
  section's request and its `mounted` and `expanded` values.
  - The edited `src/f0000.ts` runs its effect once per batch, mounted (its revision bump, FWIG-25), as
    designed.
  - About 220 ms later, when its new sides land, `src/f0001.ts` and `src/f0002.ts` run with `mounted`
    false. About 220 ms after that they run again with `mounted` true, and each return reads its sides.
    For example: `f0000` at 30,809 ms; `f0001` and `f0002` unmounted at 31,026 and mounted again at
    31,245 and 31,249.
  - Over 150 s, `f0001` ran 90 times unmounted and 90 mounted, and `f0002` 114 and 114; `f0003` flapped
    11 times. Their requests were identical on every read, and `expanded` never changed.
  - So FWIG-24's key holds: the untouched sections leave the mount plan and come back once per batch.
    Their editors are rebuilt, and the read effect re-runs on `mounted`.
  - Inference, not measured: the edited section's height changes for a moment while its new sides
    compute, which pushes the next two past `NEAR_VIEWPORT` (600 px), and the `IntersectionObserver`
    drops them. The mount plan (`AllChangesTab`, `mountPlan`) and the height reporting (`DiffViewer`'s
    `onHeight`) are outside this feature's design, and T17 had already seen two sections inside the
    margin mount only after a scroll.
  - An attempt to instrument `DiffSection` with temporary `console.log` lines (copy, assert, restore in
    `finally`, rebuild) made the bench fail to open the view twice (no `.diff-section` after 15 s, no
    file tabs); it was restored and replaced by the logpoint above.
- The batch stopped here and reported to the owner, with no production change and no tuning: FWIG-38
  cannot read PASS on the bench without changing how the stack mounts or measures its sections.
- **Owner decision (2026-10-03): the edit run's FAIL is accepted as an exception, and upstream issue
  #167** ("Files: All changes sections next to a written file lose their editor and re-read on every
  watch batch") carries the logpoint evidence and the inferred cause. The neighbouring sections
  remount on every batch, which is outside this feature's design.
  - FWIG-38 is recorded as not met, owner-accepted, with #167 as the follow-up.
  - FWIG-24 is met: the key holds the untouched sections' reads to their remounts, and mutant 2 shows
    the bench catching a key on the object (11.92 against 6.27).
- Gate: `npm run typecheck && npm run lint && npm test`: typecheck clean, lint 0 errors and 18
  warnings, 2,863 tests in 129 files passing.

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

- [x] `## Measurements` holds an "After" part beside "Before": same machine, the commit, each summary verbatim, and the before / after table of the four Files figures
- [x] The three Files targets read PASS; any that does not is written with its numbers and reported to the owner before the Verifier runs (the edit target FAIL, already reported and accepted with #167, see T20)
- [x] The floor run's `bench-wt-1` git count is written, so the build loop's 0 reads against it
- [x] Gate check passes: `npm run lint`

**Result (2026-10-03)**: the four runs on the built app at `ec5cb7f` (production code as at `aab6756`;
only the spec files changed since), 3 minutes each, 305-306 s, all exit 0; written to
`validation.md`, `## Measurements`, "After (T21, 2026-10-03)", beside "Before". The machine was the
same and not quiet: the owner's installed app with its agent sessions ran throughout, as in T6.

- Floor: 0 / 0 / 0 / 0 in every steady row, as before.
- Build loop (100 ms): every steady row 0 `files:changed`, 0 git, 0 `cat-file`, 0 `worktree:status`
  (before: 186 / 1,702 / 1,137 / 0 in the worst row). "ignored writes start no git 0 **PASS**"
  (FWIG-37, FWIG-01). "build loop: 2187 writes, 0 skipped".
- Edit loop (1,000 ms): 60 / 59 / 60 `files:changed`, 686 / 651 / 675 git, 506 / 474 / 495
  `cat-file`. "untouched sections stay ... 8.24 **FAIL**" (1,475 / 179; before 10.22). This is the
  owner-accepted exception: the neighbouring sections remount on every batch (#167, T20).
- Touch loop (1,000 ms): 59 / 59 / 60 `files:changed`, 177 / 177 / 180 git, 0 `cat-file`, 0
  `worktree:status` (before 60 / 60 / 59). "the view's reads leave the index alone 0 **PASS**"
  (FWIG-39, FWIG-17).
- #147's "no overlapping git on one worktree": build FAIL (4) → PASS (0), edit 4 → 4, touch 4 → 2.
  Nothing #147 measures got worse. The loop p99 moved within a few ms in both directions, the floor
  included (17.4 → 19.3 ms with no loop), which points at the machine's other load; #147's loop
  target is `n/a` with no sessions.
- Gate: `npm run lint` 0 errors, 18 warnings.

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
