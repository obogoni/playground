# Files Watch Ignored Validation

> The Verifier keeps the `## Measurements` section as it is and adds its report below it.

## Measurements

### Before (T6, 2026-10-03)

**Verdict: all three Files targets read FAIL before the change.** The build loop starts about 1,700
git processes and 185 `files:changed` per minute on `bench-wt-1`, every one from writes git ignores;
the edit loop reads 10.22 `cat-file` per `files:changed` against a limit of 2; the touch
loop makes the view's own reads emit 60 `worktree:status` per minute. The edit run was re-recorded
after the owner amended FWIG-34 (see "The first edit run, superseded" below).

#### Machine and conditions

- A laptop with a 14-core Intel Core Ultra 5-class CPU (14 threads), about 31 GB RAM, Windows 11.
  Electron 39.8.10 (the app), Node 24.19.0 (the bench), git 2.55.0.windows.4. The same machine as
  #147's baseline.
- No production change from this feature in any run. The floor, build and touch runs are at
  `e941982` (T5's commit); the edit run is at `b9297d3`, which differs from it only in the bench
  script (the in-place edit loop) and the spec files. Each built app is its commit's source and
  `git status --porcelain` was empty, so each header reads its commit.
- Every run at the default settings (`--minutes 3 --fps 20 --rows 30 --files 500`, CDP port 9334,
  `--sessions 0 --files-view`), one after another, each with `--json` to a scratch folder outside the
  repository. Each took 306 s and exited 0.
- **Not a fully quiet machine**: the owner's installed Playground app (outside the bench, 4
  processes) ran throughout with its own Claude sessions, among them the agent that drove these runs.
  No other app build ran. Before and after every run there was no electron process from this
  worktree and no `pg-bench-` folder.

#### Summaries (verbatim)

`node scripts/bench-sessions.mjs --sessions 0 --files-view --json floor.json`:

```
bench-sessions  sessions=0  fps=20  rows=30  files=500  index=off  minutes=3  commit=e941982  files-view  build=off  edit=off  touch=off
phase         loop p50/p99/max ms  git n  wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      16.2 /  17.6 /  51.8      8  11.1     4        2         2          0         0       0   0.0       0.000 / 0.000      0
spawn        16.2 /  17.6 /  33.3     22  17.1     4        4         1          0         0       0   0.0       0.000 / 0.000      0
steady 1     16.2 /  17.1 /  19.6      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
steady 2     16.2 /  17.4 /  18.7      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
steady 3     16.2 /  17.3 /  26.6      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
worst        16.2 /  17.4 /  26.6      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
files       files:changed  git n  cat-file  wt:status
startup                 0      3         0          0
spawn                   0     22        12          0
steady 1                0      0         0          0
steady 2                0      0         0          0
steady 3                0      0         0          0
worst                   0      0         0          0
spawn: no session opened
targets
  loop p99 < 30 ms with 6 sessions                              17.4   n/a
  append mean < 0.1 ms per chunk                               0.000   n/a
  git status <= 1 per worktree per s                               0   n/a
  no overlapping git on one worktree                               0   PASS
  ignored writes start no git                                      0   n/a
  untouched sections stay: cat-file per files:changed <= 2      0.00   n/a
  the view's reads leave the index alone                           0   n/a
```

`node scripts/bench-sessions.mjs --sessions 0 --files-view --build-interval 100 --json build.json`:

```
bench-sessions  sessions=0  fps=20  rows=30  files=500  index=off  minutes=3  commit=e941982  files-view  build=100ms  edit=off  touch=off
phase         loop p50/p99/max ms  git n   wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      16.2 /  17.4 /  46.7      8    9.9     4        2         2          0         0       0   0.0       0.000 / 0.000      0
spawn        15.7 /  24.5 /  39.4   1564  643.0     4        4         4          0         0       0   0.0       0.000 / 0.000      0
steady 1     14.6 /  24.5 /  36.3   1702  955.5     4        4         4          0         0       0   0.0       0.000 / 0.000      0
steady 2     14.9 /  24.8 /  33.3   1670  271.5     4        4         4          0         0       0   0.0       0.000 / 0.000      0
steady 3     15.1 /  24.3 /  25.8   1664  152.5     4        4         4          0         0       0   0.0       0.000 / 0.000      0
worst        15.1 /  24.8 /  36.3   1702  955.5     4        4         4          0         0       0   0.0       0.000 / 0.000      0
files       files:changed  git n  cat-file  wt:status
startup                 0      3         0          0
spawn                 176   1564      1034          0
steady 1              186   1702      1137          0
steady 2              185   1670      1115          0
steady 3              185   1664      1109          0
worst                 186   1702      1137          0
spawn: no session opened
targets
  loop p99 < 30 ms with 6 sessions                              24.8   n/a
  append mean < 0.1 ms per chunk                               0.000   n/a
  git status <= 1 per worktree per s                               4   n/a
  no overlapping git on one worktree                               4   FAIL
  ignored writes start no git                                   1702   FAIL
  untouched sections stay: cat-file per files:changed <= 2      6.04   n/a
  the view's reads leave the index alone                           0   n/a
build loop: 2201 writes, 0 skipped
```

`node scripts/bench-sessions.mjs --sessions 0 --files-view --edit-interval 1000 --json edit.json`:

```
bench-sessions  sessions=0  fps=20  rows=30  files=500  index=off  minutes=3  commit=b9297d3  files-view  build=off  edit=1000ms  touch=off
phase         loop p50/p99/max ms  git n   wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      16.2 /  17.3 /  46.4      8   10.9     4        2         2          0         0       0   0.0       0.000 / 0.000      0
spawn        15.9 /  24.8 /  68.7    818   26.7     4        4         2          0         0       0   0.0       0.000 / 0.000      0
steady 1     15.9 /  25.2 /  35.8    780   17.4     4        4         2          0         0       0   0.0       0.000 / 0.000      0
steady 2     15.8 /  24.7 /  30.6    778  481.0     4        4         2          0         0       0   0.0       0.000 / 0.000      0
steady 3     15.8 /  24.6 /  30.1    801  205.1     4        4         2          0         0       0   0.0       0.000 / 0.000      0
worst        15.9 /  25.2 /  35.8    801  481.0     4        4         2          0         0       0   0.0       0.000 / 0.000      0
files       files:changed  git n  cat-file  wt:status
startup                 0      3         0          0
spawn                  57    818       637          0
steady 1               59    780       603          0
steady 2               59    776       594          0
steady 3               60    801       622          0
worst                  60    801       622          0
spawn: no session opened
targets
  loop p99 < 30 ms with 6 sessions                              25.2   n/a
  append mean < 0.1 ms per chunk                               0.000   n/a
  git status <= 1 per worktree per s                               2   n/a
  no overlapping git on one worktree                               4   FAIL
  ignored writes start no git                                    801   n/a
  untouched sections stay: cat-file per files:changed <= 2     10.22   FAIL
  the view's reads leave the index alone                           0   n/a
edit loop: 235 writes, 1 skipped
```

`node scripts/bench-sessions.mjs --sessions 0 --files-view --touch-interval 1000 --json touch.json`:

```
bench-sessions  sessions=0  fps=20  rows=30  files=500  index=off  minutes=3  commit=e941982  files-view  build=off  edit=off  touch=1000ms
phase         loop p50/p99/max ms  git n   wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      16.2 /  17.5 /  58.0      8   11.1     4        2         2          0         0       0   0.0       0.000 / 0.000      0
spawn        15.6 /  24.3 /  32.3   1653  119.6     4        4         5         56        56       0   0.0       0.000 / 0.000      0
steady 1     15.6 /  24.3 /  26.7   1731  124.3     4        4         5         60        60       0   0.0       0.000 / 0.000      0
steady 2     15.4 /  24.5 /  28.7   1709  455.1     4        4         5         60        60       0   0.0       0.000 / 0.000      0
steady 3     14.9 /  25.0 /  29.4   1730  128.9     4        4         4         59        59       0   0.0       0.000 / 0.000      0
worst        15.6 /  25.0 /  29.4   1731  455.1     4        4         5         60        60       0   0.0       0.000 / 0.000      0
files       files:changed  git n  cat-file  wt:status
startup                 0      3         0          0
spawn                 113   1653      1024         56
steady 1              119   1731      1074         60
steady 2              118   1709      1059         60
steady 3              119   1730      1074         59
worst                 119   1731      1074         60
spawn: no session opened
targets
  loop p99 < 30 ms with 6 sessions                              25.0   n/a
  append mean < 0.1 ms per chunk                               0.000   n/a
  git status <= 1 per worktree per s                               5   n/a
  no overlapping git on one worktree                               4   FAIL
  ignored writes start no git                                   1731   n/a
  untouched sections stay: cat-file per files:changed <= 2      9.01   n/a
  the view's reads leave the index alone                          60   FAIL
touch loop: 236 writes, 0 skipped
```

#### The four Files figures per steady row (`bench-wt-1`)

| Run | Row | `files:changed` | git processes | `cat-file` | `worktree:status` |
| --- | --- | --------------- | ------------- | ---------- | ----------------- |
| floor | steady 1 | 0 | 0 | 0 | 0 |
| floor | steady 2 | 0 | 0 | 0 | 0 |
| floor | steady 3 | 0 | 0 | 0 | 0 |
| build | steady 1 | 186 | 1702 | 1137 | 0 |
| build | steady 2 | 185 | 1670 | 1115 | 0 |
| build | steady 3 | 185 | 1664 | 1109 | 0 |
| edit | steady 1 | 59 | 780 | 603 | 0 |
| edit | steady 2 | 59 | 776 | 594 | 0 |
| edit | steady 3 | 60 | 801 | 622 | 0 |
| touch | steady 1 | 119 | 1731 | 1074 | 60 |
| touch | steady 2 | 118 | 1709 | 1059 | 60 |
| touch | steady 3 | 119 | 1730 | 1074 | 59 |

#### The Files targets before the change

| Target | Run | Read before | Limit | Verdict |
| ------ | --- | ----------- | ----- | ------- |
| Ignored writes start no git (FWIG-37) | build | 1702 git, 186 `files:changed` in the worst steady row | 0 and 0 in every steady row | **FAIL** |
| Untouched sections stay (FWIG-38) | edit | 1819 `cat-file` / 178 `files:changed` = 10.22 | at most 2 | **FAIL** |
| The view's reads leave the index alone (FWIG-39) | touch | 60 `worktree:status` in the worst steady row | 0 in every steady row | **FAIL** |

For reference, the same ratio on the other two runs: build 3361 / 556 = 6.04; touch
3207 / 356 = 9.01.

**Mounted sections, observed.** During the edit run a second CDP client read the page: 12
`.diff-section` elements, 3 of them holding a diff editor (`src/f0000.ts`, `src/f0001.ts`,
`src/f0002.ts`) 90 s after the view opened; at 180 s the same read found none holding one, a single
sample not explained further (the edit run's steady rows hold steady at about 10 `cat-file` per
`files:changed` throughout). The window was 1266 x 715. A one-minute check run before it read 1 at
30 s and the same 3 at 90 s.

#### The first edit run, superseded

The first T6 edit run appended a line to `src/f0000.ts` each second, as FWIG-34 first said. It read
358 `cat-file` / 179 `files:changed` = 2.00, a PASS before the change: the appended
file is the stack's first section, and as it grew it pushed the other sections out of the viewport,
so only one section stayed mounted and re-read. The owner amended FWIG-34 on 2026-10-03: the loop now
rewrites the seeded line in place with content of the same byte length, so the layout holds. The run
above replaces it.

### Follow-ups

- **FPOL-14, FPOL-16 and FPOL-18 fail on the Files diff smoke without this feature's change.** T5's
  full drive failed "Expand all opens every listed section" (0 -> 0 of 50), "only the ones near the
  viewport hold an editor" (9 diff editors for 0 open sections) and a commit tab's "Expand all and
  Collapse all" (0 -> 0 -> 0 of 45), and a second drive with the watch section removed failed the same
  three. The owner recorded them as pre-existing (FWIG-42 amended); T19 is to drive the full smoke on
  `origin/main` (`fc19a3c`) too and compare the two drives check by check. Investigate them upstream, outside #150.
  T19 did so: the same three fail on both, with the same detail, and nothing else differs.
- **#167: All changes sections next to a written file lose their editor and re-read on every watch
  batch.** The edit target (FWIG-38) reads FAIL after the change, at about 6.3 `cat-file` per
  `files:changed` against a limit of 2 (10.22 before).
  - T20's logpoint on the built renderer showed the cause: the written section re-reads once, as
    FWIG-25 asks, but about 220 ms later its two neighbours leave the mount plan and come back about
    220 ms after that, and each return re-reads them.
  - Inferred, not measured: a brief change in the written section's height pushes the neighbours past
    the 600 px margin.
  - The owner accepted the FAIL as an exception on 2026-10-03 and opened #167, outside this feature's
    design.
