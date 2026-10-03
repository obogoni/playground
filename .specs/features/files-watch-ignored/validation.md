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

### After (T21, 2026-10-03)

**Verdict: two of the three Files targets read PASS after the change; the edit target reads FAIL,
an exception the owner accepted (follow-up #167).** The build loop starts no git process and emits no
`files:changed` on `bench-wt-1` in any steady row (1,702 git and 186 emits before). The touch loop's
own reads emit no `worktree:status` (60 before). The edit loop reads 1475 `cat-file` /
179 `files:changed` = 8.24, down from 10.22 but above the limit of 2.
The neighbouring All changes sections remount on every batch, which is outside this feature's
design (T20, #167).

#### Machine and conditions

- The same machine as "Before": a laptop with a 14-core Intel Core Ultra 5-class CPU (14 threads),
  about 31 GB RAM, Windows 11; Electron 39.8.10, Node 24.19.0, git 2.55.0.windows.4.
- Every run at `ec5cb7f`. Its production code is T18's `aab6756`, the whole change; the two commits
  after it change only the spec files. Rebuilt with `npx electron-vite build` before the first run;
  `git status --porcelain` was empty, so each header reads its commit.
- The same settings as "Before" (`--minutes 3 --fps 20 --rows 30 --files 500`, CDP port 9334,
  `--sessions 0 --files-view`), one after another, each with `--json` to a scratch folder outside
  the repository. Each took 305-306 s and exited 0.
- **Not a fully quiet machine**, as before: the owner's installed Playground app (4 processes) ran
  throughout with its own agent sessions, among them the agent that drove these runs. No other app
  build ran during them. Afterwards there was no electron process from this worktree and no
  `pg-bench-` folder.
- The loop p99 figures moved a little from "Before" in both directions (floor 17.4 → 19.3 ms with no
  loop at all, edit 25.2 → 28.6, touch 25.0 → 25.9, build 24.8 → 24.1). No session ran, so #147's
  loop target is `n/a` on every run. The floor's rise, with no Files activity, points at the
  machine's other load rather than at this change.

#### Summaries (verbatim)

`node scripts/bench-sessions.mjs --sessions 0 --files-view --json floor.json`:

```
bench-sessions  sessions=0  fps=20  rows=30  files=500  index=off  minutes=3  commit=ec5cb7f  files-view  build=off  edit=off  touch=off
phase         loop p50/p99/max ms  git n  wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      16.1 /  17.4 /  45.2      8  10.6     4        2         2          0         0       0   0.0       0.000 / 0.000      0
spawn        16.2 /  17.5 /  33.6     20  22.6     4        4         1          0         0       0   0.0       0.000 / 0.000      0
steady 1     16.1 /  17.1 /  19.9      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
steady 2     16.2 /  17.3 /  26.0      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
steady 3     16.5 /  19.3 /  31.6      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
worst        16.5 /  19.3 /  31.6      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
files       files:changed  git n  cat-file  wt:status
startup                 0      3         0          0
spawn                   0     20        10          0
steady 1                0      0         0          0
steady 2                0      0         0          0
steady 3                0      0         0          0
worst                   0      0         0          0
spawn: no session opened
targets
  loop p99 < 30 ms with 6 sessions                              19.3   n/a
  append mean < 0.1 ms per chunk                               0.000   n/a
  git status <= 1 per worktree per s                               0   n/a
  no overlapping git on one worktree                               0   PASS
  ignored writes start no git                                      0   n/a
  untouched sections stay: cat-file per files:changed <= 2      0.00   n/a
  the view's reads leave the index alone                           0   n/a
```

`node scripts/bench-sessions.mjs --sessions 0 --files-view --build-interval 100 --json build.json`:

```
bench-sessions  sessions=0  fps=20  rows=30  files=500  index=off  minutes=3  commit=ec5cb7f  files-view  build=100ms  edit=off  touch=off
phase         loop p50/p99/max ms  git n  wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      16.1 /  17.5 /  51.1      8  11.1     4        2         2          0         0       0   0.0       0.000 / 0.000      0
spawn        16.1 /  21.6 /  28.3     25  27.4     4        4         1          0         0       0   0.0       0.000 / 0.000      0
steady 1     16.2 /  21.5 /  26.7      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
steady 2     16.4 /  23.1 /  25.9      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
steady 3     16.6 /  24.1 /  33.6      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
worst        16.6 /  24.1 /  33.6      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
files       files:changed  git n  cat-file  wt:status
startup                 0      3         0          0
spawn                   0     25        14          0
steady 1                0      0         0          0
steady 2                0      0         0          0
steady 3                0      0         0          0
worst                   0      0         0          0
spawn: no session opened
targets
  loop p99 < 30 ms with 6 sessions                              24.1   n/a
  append mean < 0.1 ms per chunk                               0.000   n/a
  git status <= 1 per worktree per s                               0   n/a
  no overlapping git on one worktree                               0   PASS
  ignored writes start no git                                      0   PASS
  untouched sections stay: cat-file per files:changed <= 2      0.00   n/a
  the view's reads leave the index alone                           0   n/a
build loop: 2187 writes, 0 skipped
```

`node scripts/bench-sessions.mjs --sessions 0 --files-view --edit-interval 1000 --json edit.json`:

```
bench-sessions  sessions=0  fps=20  rows=30  files=500  index=off  minutes=3  commit=ec5cb7f  files-view  build=off  edit=1000ms  touch=off
phase         loop p50/p99/max ms  git n  wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      16.1 /  22.7 /  56.4      8  10.2     4        2         2          0         0       0   0.0       0.000 / 0.000      0
spawn        16.0 /  27.3 /  42.7    704  70.4     4        4         2          0         0       0   0.0       0.000 / 0.000      0
steady 1     16.0 /  27.1 /  41.8    686  55.5     4        4         2          0         0       0   0.0       0.000 / 0.000      0
steady 2     15.9 /  28.6 /  40.0    651  47.3     4        4         2          0         0       0   0.0       0.000 / 0.000      0
steady 3     15.9 /  26.0 /  37.4    675  68.2     4        4         2          0         0       0   0.0       0.000 / 0.000      0
worst        16.0 /  28.6 /  41.8    686  68.2     4        4         2          0         0       0   0.0       0.000 / 0.000      0
files       files:changed  git n  cat-file  wt:status
startup                 0      3         0          0
spawn                  57    704       522          0
steady 1               60    686       506          0
steady 2               59    651       474          0
steady 3               60    675       495          0
worst                  60    686       506          0
spawn: no session opened
targets
  loop p99 < 30 ms with 6 sessions                              28.6   n/a
  append mean < 0.1 ms per chunk                               0.000   n/a
  git status <= 1 per worktree per s                               2   n/a
  no overlapping git on one worktree                               4   FAIL
  ignored writes start no git                                    686   n/a
  untouched sections stay: cat-file per files:changed <= 2      8.24   FAIL
  the view's reads leave the index alone                           0   n/a
edit loop: 237 writes, 0 skipped
```

`node scripts/bench-sessions.mjs --sessions 0 --files-view --touch-interval 1000 --json touch.json`:

```
bench-sessions  sessions=0  fps=20  rows=30  files=500  index=off  minutes=3  commit=ec5cb7f  files-view  build=off  edit=off  touch=1000ms
phase         loop p50/p99/max ms  git n  wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      15.9 /  17.4 /  48.0      8  14.5     4        2         2          0         0       0   0.0       0.000 / 0.000      0
spawn        16.0 /  25.4 /  40.0    192  37.1     4        4         2          0         0       0   0.0       0.000 / 0.000      0
steady 1     16.1 /  25.1 /  33.9    177  32.4     2        2         2          0         0       0   0.0       0.000 / 0.000      0
steady 2     16.1 /  25.5 /  34.4    177  33.1     2        2         2          0         0       0   0.0       0.000 / 0.000      0
steady 3     16.1 /  25.9 /  45.0    180  44.3     2        2         2          0         0       0   0.0       0.000 / 0.000      0
worst        16.1 /  25.9 /  45.0    180  44.3     2        2         2          0         0       0   0.0       0.000 / 0.000      0
files       files:changed  git n  cat-file  wt:status
startup                 0      3         0          0
spawn                  57    192        10          0
steady 1               59    177         0          0
steady 2               59    177         0          0
steady 3               60    180         0          0
worst                  60    180         0          0
spawn: no session opened
targets
  loop p99 < 30 ms with 6 sessions                              25.9   n/a
  append mean < 0.1 ms per chunk                               0.000   n/a
  git status <= 1 per worktree per s                               2   n/a
  no overlapping git on one worktree                               2   FAIL
  ignored writes start no git                                    180   n/a
  untouched sections stay: cat-file per files:changed <= 2      0.00   n/a
  the view's reads leave the index alone                           0   PASS
touch loop: 236 writes, 0 skipped
```

#### The four Files figures per steady row (`bench-wt-1`), before → after

| Run | Row | `files:changed` before → after | git before → after | `cat-file` before → after | `worktree:status` before → after |
| --- | --- | ------------------------------ | ------------------ | ------------------------- | -------------------------------- |
| floor | steady 1 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| floor | steady 2 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| floor | steady 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| build | steady 1 | 186 → 0 | 1702 → 0 | 1137 → 0 | 0 → 0 |
| build | steady 2 | 185 → 0 | 1670 → 0 | 1115 → 0 | 0 → 0 |
| build | steady 3 | 185 → 0 | 1664 → 0 | 1109 → 0 | 0 → 0 |
| edit | steady 1 | 59 → 60 | 780 → 686 | 603 → 506 | 0 → 0 |
| edit | steady 2 | 59 → 59 | 776 → 651 | 594 → 474 | 0 → 0 |
| edit | steady 3 | 60 → 60 | 801 → 675 | 622 → 495 | 0 → 0 |
| touch | steady 1 | 119 → 59 | 1731 → 177 | 1074 → 0 | 60 → 0 |
| touch | steady 2 | 118 → 59 | 1709 → 177 | 1059 → 0 | 60 → 0 |
| touch | steady 3 | 119 → 60 | 1730 → 180 | 1074 → 0 | 59 → 0 |

The floor run's `bench-wt-1` git count is 0 in every steady row, before and after, so the build
run's 0 reads against a floor of 0.

#### The Files targets after the change

| Target | Run | Before | After | Limit | Verdict |
| ------ | --- | ------ | ----- | ----- | ------- |
| Ignored writes start no git (FWIG-37) | build | 1702 git, 186 `files:changed` (worst steady row) | 0 git, 0 `files:changed` in every steady row | 0 and 0 in every steady row | **PASS** |
| Untouched sections stay (FWIG-38) | edit | 1819 / 178 = 10.22 | 1475 / 179 = 8.24 | at most 2 | **FAIL, owner-accepted (#167)** |
| The view's reads leave the index alone (FWIG-39, FWIG-17) | touch | 60 `worktree:status` (worst steady row) | 0 in every steady row | 0 in every steady row | **PASS** |

#147's "no overlapping git on one worktree", for reference: build FAIL (4) → PASS (0); edit
4 → 4 (FAIL both); touch 4 → 2 (FAIL both). Nothing #147 measures got worse.

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
  - Verifier note (2026-10-03): "about 6.3" is T20's one-minute unmutated edit run (6.27); T21's
    three-minute run in "After" reads 8.24. Both are FAIL against 2; the "After" figure is the one
    of record.
- **FWIG-07 has no test for a root-level `.gitignore`** (Verifier sensor U3, survived). Dropping
  `path === '.gitignore'` from the watcher's forgetting rule (`src/main/file-watcher.ts:174`) passes
  the whole suite: the forgetting case (`src/main/file-watcher.test.ts:397`) names `src/.gitignore`,
  and the FWIG-46 case names the root one only while nothing is cached yet. Production code is
  correct. Add a case that caches an answer, then names the root `.gitignore`, and expects a new ask.
  **Closed before the PR (owner, 2026-10-03):** `src/main/file-watcher.test.ts:412` caches an answer, then
  names the root `.gitignore` and expects a second ask; U3 re-run against it: killed.
- **FWIG-13 has no test for leaving and coming back while a check runs** (Verifier sensor U7,
  survived). Reducing `isCurrent` (`src/main/file-watcher.ts:190`) to the selected-path comparison
  passes the whole suite, because the only case (`src/main/file-watcher.test.ts:518`) deselects with
  `select(null)` and never re-selects. Production code is correct. Add a case that holds a check,
  runs `select(null)` then `select(repo)`, releases it, and expects no emit and nothing learned.
  **Closed before the PR (owner, 2026-10-03):** `src/main/file-watcher.test.ts:552` holds a check, leaves
  and comes back to the same worktree, releases it and expects no emit; U7 re-run against it: killed.
- **FWIG-15 is unasserted on three reads** (Verifier sensor U9, survived): `diffStats`'s since-base
  `merge-base` and `diff --numstat` (`src/main/file-diff.ts:197`, `:203`) and `untrackedStats`'s
  `ls-files --others` (`:284`). Each carries the prefix, read in the source, but `diffStats` and
  `untrackedStats` call `git` directly, so no recording runner sees their args; the uncommitted
  `diff --numstat` (`:219`) is covered only behaviourally by the index-bytes test. Give both
  functions the injectable runner `listDir` and `changedSince` have and assert the args.
  **Closed before the PR (owner, 2026-10-03):** `diffStats` takes `run: GitRunner = git` and hands it to
  `untrackedStats`; `src/main/file-diff.test.ts:178` records a since-base and an uncommitted read and
  asserts the literal prefix on `merge-base`, both `diff` reads and `ls-files`. U9 (`ls-files` without the
  flags) and the same fault on `merge-base` re-run against it: both killed.
- **The watcher's catch around a throwing `emit` has no test** (`src/main/file-watcher.ts:141-143`).
  No AC names it directly; it keeps FWIG-12's later batches flowing after one failed emit. A case
  with an `emit` that throws once, then a second batch that must still arrive, would pin it.
- **FWIG-10 wording** (spec-precision gap): "SHALL emit the batch as it would without the filter"
  reads as "every named path", while "treat that batch's paths with no answer as not ignored" and
  the code (`src/main/file-watcher.ts:182-184`) keep applying answers learned before the failure.
  The only test (`src/main/file-watcher.test.ts:451`) starts from an empty cache, so it pins
  neither reading. Amend the AC to the code's behaviour and add a case with a cached ignored folder.
- **Evidence by code reading only**: FWIG-22, FWIG-28 and FWIG-29 rest on reads of
  `src/renderer/src/lib/use-files.ts:523`, `src/renderer/src/components/FileTabs.tsx:471` and
  `src/renderer/src/components/CommitTab.tsx:50-60`; FWIG-27 adds T19's FDIF-31 check, which sees
  the list re-read, not each mounted section re-reading. tasks.md's "Evidence split" says every
  other ID has a unit test, which is not so for these four. No check would fail if their wiring
  regressed.

## Validation: files-watch-ignored — PASS

**Date**: 2026-10-03
**Spec**: `.specs/features/files-watch-ignored/spec.md` (FWIG-01..48, FWIG-34, FWIG-38 and FWIG-42 as
amended by the owner)
**Diff range**: `fc19a3c..8d3f925` (`origin/main` to the branch head, 28 commits)
**Verifier**: independent sub-agent (author ≠ verifier); coverage re-derived from the spec and the
diff, not from the task notes

**Verdict: PASS.** No production defect, and every AC has evidence: a unit assertion, a numbered
smoke check or a named run. Four of 12 unit mutants survived. One is equivalent. The other three
are test gaps over correct code, and with the thin read-only evidence for FWIG-22, 27, 28 and 29
they are recorded as follow-ups above, under the owner's rule for this loop (2026-09-27): a fix
round only for a production defect or an AC with no evidence at all. FWIG-38's target reads FAIL
on the bench, an owner-accepted exception (#167).

### Task completion

T1 to T21 are all checked in tasks.md, each with its result written and its commit in the range.
The stop rules held: T1 measured about 1,650 git processes and 183 `files:changed` per minute
from ignored writes (proceed), and T2 confirmed mechanism A (87 ms and 330 ms against 150 and
1,000).

### Spec-anchored acceptance criteria

Evidence kinds: **unit** is a test assertion; **smoke** is a numbered check of
`scripts/smoke-files-diff.mjs` on a named drive; **run** is a named bench run in tasks.md or in
`## Measurements` above; **read** is the production line read by the Verifier, with no check
behind it.

| ID | Spec-defined outcome | Evidence (`file:line`, assertion) | Verdict |
| -- | -------------------- | --------------------------------- | ------- |
| FWIG-01 | All-ignored batch, no unnamed or git-state event: nothing emitted | unit `src/main/file-watcher.test.ts:335-336` `expect(rec.asked).toHaveLength(1)`, `expect(h.emitted).toEqual([])` (real repo); smoke 15a (`scripts/smoke-files-diff.mjs:3838`) FAIL before (T5: 7 events, 27 paths), PASS after (T19: 0), FAIL under T19's filter mutant; run T21 build 0 / 0 | PASS |
| FWIG-02 | One emit, only not-ignored paths, first-seen order | unit `src/main/file-watcher.test.ts:346` `toEqual([{ worktreePath: repo, paths: ['src/b.ts', 'src/a.ts'], gitStateChanged: false }])`; fired `src/b.ts, bin/a.dll, src/a.ts`, so the order is the arrival order, not sorted. `paths` and `gitStateChanged` both asserted | PASS |
| FWIG-03 | Git decides, every exclude source; a tracked file is never ignored, even in an ignored folder | unit `src/main/ignore-check.test.ts:205` exact set across root `.gitignore`, nested `src/.gitignore` and `info/exclude`; `:230` `toEqual(new Set(['bin/Debug', 'bin/Debug/a.dll']))` after `add -f bin/keep.txt`; `src/main/file-watcher.test.ts:361` emits `['bin/keep.txt']` | PASS |
| FWIG-04 | Known ignored path or folder: dropped, with everything under it, no git process | unit `src/main/file-watcher.test.ts:375-376` second batch under `bin/`: `toHaveLength(1)` calls, `emitted` `[]`; `src/main/ignore-check.test.ts:70-72` prefix, and `:78` `binary/a.ts` not under `bin` | PASS |
| FWIG-05 | Exactly one check per batch, asking each unknown path and each unknown parent folder | unit `src/main/file-watcher.test.ts:372` `rec.asked` `toEqual([['bin', 'bin/a.dll']])`; `src/main/ignore-check.test.ts:48-59` folders first, no duplicates | PASS |
| FWIG-06 | Over 2,000: folders only; folders over 2,000: nothing; unasked paths not ignored, not remembered | unit `src/main/ignore-check.test.ts:106-107` 2,000 asked whole; `:111` 2,001 gives `['d']`; `:117-118` 2,000 folders kept; `:122` 2,001 folders `[]`; `:130-132` unasked paths asked on the next call. Sensor U1 killed | PASS |
| FWIG-07 | A `.gitignore` at any depth in the batch: forget before classifying | unit `src/main/file-watcher.test.ts:404-409` control (no re-ask), then `src/.gitignore` re-asks `src/a.ts` | PASS, test gap at the root (U3, follow-up) |
| FWIG-08 | Git-state batch: forget, emit every named path with `gitStateChanged: true`, no ask | unit `src/main/file-watcher.test.ts:422-431` no new ask, `toEqual([{ ..., paths: ['bin/b.dll', 'src/a.ts'], gitStateChanged: true }])`, then the next batch asks `['bin', 'bin/c.dll']` again. Sensor U4 killed | PASS |
| FWIG-09 | New selection or stop: forget | unit `src/main/file-watcher.test.ts:444-447` after `select(repo)` again, `bin` asked again. Sensor U5 killed. A stop (`select(null)`) goes through the same `closeAll` (`src/main/file-watcher.ts:193-203`, read) | PASS |
| FWIG-10 | Check fails or passes 5,000 ms: unknown paths not ignored, nothing remembered, batch emitted | unit `src/main/ignore-check.test.ts:153-154` `5000`; `:256` `toBeNull()` outside a repository; `:268-269` null on a killed run, `timeouts` `[5000]`; `src/main/file-watcher.test.ts:457-465` unfiltered emit, next batch asks `bin` again; `:478` throwing check. Sensor U6 killed | PASS, spec-precision gap on "as without the filter" (follow-up) |
| FWIG-11 | Unnamed event: emit even when every named path is ignored | unit `src/main/file-watcher.test.ts:490` `toEqual([{ worktreePath: repo, paths: [], gitStateChanged: false }])` | PASS |
| FWIG-12 | Batches emitted in close order, one check at a time | unit `src/main/file-watcher.test.ts:508-515` second check absent while the first is held, then `[['src/a.ts'], ['src/b.ts']]`. Sensor U8 killed | PASS |
| FWIG-13 | Selection moves on during a check: batch dropped | unit `src/main/file-watcher.test.ts:534` `emitted` `[]` after `select(null)` with the check held | PASS, test gap on leave-and-return (U7, follow-up) |
| FWIG-14 | No ignored file listed in any mode | smoke 15c (`scripts/smoke-files-diff.mjs:3872`): control listed, no `fwig-build` row in Folder or Uncommitted; FAIL under T5's `--exclude-standard` mutant; PASS on T19 | PASS |
| FWIG-15 | Every Files read and `check-ignore` passes both flags before the subcommand | unit `src/main/git.test.ts:142` literal; `src/main/ignore-check.test.ts:282-295` exact args and NUL-ended input; `src/main/file-diff.test.ts:325-328`, `:340`, `:353` (`readSide`'s three reads); `src/main/file-tree.test.ts:195` (`listDir` trio), `:296` (`changedSince`); read `src/main/file-diff.ts:197`, `:203`, `:219`, `:284` | PASS, three reads unasserted (U9, follow-up) |
| FWIG-16 | Same-bytes rewrite, then Uncommitted counts: `.git/index` byte for byte unchanged | unit `src/main/file-diff.test.ts:210-211` `stats` `[]` and `readFileSync(index).equals(before)` `true`; seen failing with the config flag removed (T11) | PASS |
| FWIG-17 | Touch loop: no `worktree:status` for the worktree | run T21 touch: 0 in every steady row (60 before); T20 mutant 3 (config flag dropped) reads 60, FAIL | PASS |
| FWIG-18 | Idle: refresh starts at once | unit `src/renderer/src/lib/refresh-gate.test.ts:66` `runs` `['a']` with no await | PASS |
| FWIG-19 | While running: no other batch refresh | unit `src/renderer/src/lib/refresh-gate.test.ts:77` `['a']` after three requests | PASS |
| FWIG-20 | Exactly one trailing run, union of paths, git-state OR | unit `src/renderer/src/lib/refresh-gate.test.ts:81-85` `['a', 'b+c+d']` and no third run; `:168` first-seen paths; `:172`, `:176`, `:180` OR both ways and false; `:186` whole merged event | PASS |
| FWIG-21 | Running until every read settles, fulfilled or rejected | unit `src/renderer/src/lib/refresh-gate.test.ts:96` after a rejection, `:105-113` after a sync throw, `:124-128` held until the promise settles. Sensor U10 killed. Read: `runBatch` resolves on `Promise.allSettled` (`src/renderer/src/lib/use-files.ts:561`) | PASS |
| FWIG-22 | Waiting refresh acts on the view as it is when it starts | read `src/renderer/src/lib/use-files.ts:523` `const current = live.current` on `runBatch`'s first line; T17 manual check | PASS, read only (follow-up) |
| FWIG-23 | Worktree change or Files left: waiting refresh dropped | unit `src/renderer/src/lib/refresh-gate.test.ts:156-160` no trailing run, then idle. Sensor U11 killed. Read `src/renderer/src/lib/use-files.ts:524-525` and `:581-583` | PASS |
| FWIG-24 | Same sides after a list re-read: no section re-read | unit `src/renderer/src/lib/diff-view.test.ts:115`, `:122`, `:129` equal keys; read `src/renderer/src/components/DiffSection.tsx:131` keys on `key`; run T20 mutant 2 (key back on the object) 11.92 against 6.27 unmutated | PASS |
| FWIG-25 | Uncommitted, disk batch names a listed file: its section re-reads once | unit `src/renderer/src/lib/files-view.test.ts:182`, `:188`, `:196-197`, `:201`, `:207`; read `src/renderer/src/lib/use-files.ts:552-557`, `src/renderer/src/components/FileTabs.tsx:471`; smoke check 14b (FOLD-02) under this round's sensor S1, killed (below) | PASS |
| FWIG-26 | Sides change (status, rename, merge base): section re-reads | unit `src/renderer/src/lib/diff-view.test.ts:136`, `:143`, `:150`, `:166-167`, `:174`, `:186`, `:193`. Sensor U12 killed | PASS |
| FWIG-27 | Index or `HEAD` moves: every mounted section re-reads (unchanged) | read `src/renderer/src/lib/use-files.ts:537` token bump, `src/renderer/src/components/DiffSection.tsx:131` `refreshToken` in the deps; smoke FDIF-31 (T19, "5 sections -> 4") | PASS, thin (follow-up) |
| FWIG-28 | Diff to origin: no disk batch re-reads a section | read `src/renderer/src/components/FileTabs.tsx:471` passes `undefined` outside Uncommitted; T18 | PASS, read only (follow-up) |
| FWIG-29 | No batch re-reads a commit tab's sections (unchanged) | read `src/renderer/src/components/CommitTab.tsx:50-60`: no `revisions`, `refreshToken={0}` | PASS, read only (follow-up) |
| FWIG-30 | Open diff shows the write within 1 s, scroll kept | smoke FDIF-30 (`scripts/smoke-files-diff.mjs:980`) 732 ms on T19 (676 ms on `origin/main`); 14f2 scroll kept | PASS |
| FWIG-31 | Folds kept across a refresh (FOLD-01..22) | smoke section 14: T19 19/19 alone and in the full drive; this round's unmutated control 19/19 | PASS |
| FWIG-32 | `--files-view` seed and the view opened in Uncommitted, All changes | run T4 A: committed `.gitignore`, 50 files in `build-out/`, 12 changed files, config `uncommitted`, 12 sections; run E shows the 15 s wait failing | PASS |
| FWIG-33 | Build loop writes under `build-out/`, 50 names, new bytes | run T4 B: all 50 mtimes moved, "build loop: 1085 writes" | PASS |
| FWIG-34 | Edit loop rewrites the seeded line in place, same length (amended) | run T4 C amended: 551 bytes kept, line ends `000117`, numstat 1 / 0 | PASS |
| FWIG-35 | Touch loop rewrites `f0100.ts` with its own bytes | run T4 D: equal to `HEAD`, not listed, newer mtime | PASS |
| FWIG-36 | Four Files columns per row for `bench-wt-1` | unit `scripts/bench-summary.test.ts:400-403` 9 / 30 / 20 / 7, `:411-414` zeros, `:653-666` the printed block | PASS |
| FWIG-37 | Build-only shape: PASS only with 0 git and 0 `files:changed` in every steady row, else `n/a` | unit `scripts/bench-summary.test.ts:489-494` PASS at 0, `:502` and `:510` FAIL at 1 each, `:517-522` `n/a` for other shapes; run T21 build PASS; T20 mutant 1 FAIL | PASS |
| FWIG-38 | Edit-only shape: PASS only when steady `cat-file` total over `files:changed` total is at most 2 | unit `scripts/bench-summary.test.ts:533-538` PASS at exactly 2 from totals whose rows read 3 and 1, `:546-549` FAIL at 2.05, `:554` and `:561-566` `n/a`. The judging is correct; the target it judges reads FAIL on the bench, 8.24 after against 10.22 before (T21) | Owner-accepted exception (#167) |
| FWIG-39 | Touch-only shape: PASS only with 0 `worktree:status` in every steady row | unit `scripts/bench-summary.test.ts:572-577`, `:582`, `:592-597`; run T21 touch PASS; T20 mutant 3 FAIL | PASS |
| FWIG-40 | Stop and report if the build loop starts no git today | run T1: about 1,650 git and 183 `files:changed` per minute, proceed | PASS |
| FWIG-41 | Floor, build, edit and touch runs before and after, each with its commit | `## Measurements` above: Before at `e941982` / `b9297d3`, After at `ec5cb7f` | PASS |
| FWIG-42 | Full smoke passes; watch section before the icon checks; FPOL-14/16/18 pre-existing (amended) | smoke T19: 111/114, the three FPOL failures identical on `origin/main` `fc19a3c` (108/111); watch checks 57-59, icons 60-69 (`scripts/smoke-files-diff.mjs:1016-1022`) | PASS |
| FWIG-43 | 20 ignored writes 100 ms apart: no `files:changed` within 1,500 ms | smoke 15a (`scripts/smoke-files-diff.mjs:3838`): FAIL before (T5), PASS after (T19), FAIL under T19's mutant | PASS |
| FWIG-44 | One write outside: a `files:changed` naming it within 2,000 ms | smoke 15b (`scripts/smoke-files-diff.mjs:3853`): PASS (330 ms T5, 443 ms T19); FAIL with the control written outside the worktree (T5) | PASS |
| FWIG-45 | Ignored folder in neither the Folder tree nor the Uncommitted list | smoke 15c (`scripts/smoke-files-diff.mjs:3872`), as FWIG-14 | PASS |
| FWIG-46 | Folder ignored after the watch started: one check on its first batch, none later | unit `src/main/file-watcher.test.ts:389-393` `before + 1` twice, emits only `['.gitignore']` | PASS |
| FWIG-47 | Deleted ignored folder: paths under it dropped, at most the folder passes | unit `src/main/ignore-check.test.ts:237` `bin` absent, `bin/Debug/a.dll` present; `src/main/file-watcher.test.ts:545-546` nothing but `bin` emitted | PASS |
| FWIG-48 | Spaces, `#`, `!`, leading dash, non-ASCII: asked and matched exactly | unit `src/main/ignore-check.test.ts:250` `toEqual(new Set([...odd, ...oddRoot]))`, with `src/é ! #.ts` and `src/-a.ts` not reported | PASS |

**Status**: 47 ACs matched their spec outcome; FWIG-38 is the owner-accepted exception. The
payload rule holds for every emitted batch the unit tests check (FWIG-02, 08, 10, 11): each
asserts the whole event, `paths` and `gitStateChanged` together. Spec-precision gaps:
FWIG-10's fallback wording (follow-up), and FWIG-37's printed value, which T3 already recorded:
the AC defines the verdict, not one printed number.

### Owner-accepted exceptions, checked for consistency

| Exception | Where it is recorded | Consistent |
| --------- | -------------------- | ---------- |
| FWIG-38 edit target FAIL (8.24 after, 10.22 before), #167 | spec.md traceability "Not met, owner-accepted (follow-up #167)"; tasks.md T20 and T21; `## Measurements` After table; Follow-ups | Yes. The #167 bullet quotes T20's one-minute 6.27 as "about 6.3"; a note now says the three-minute 8.24 is the figure of record |
| FWIG-42: FPOL-14/16/18 fail on `origin/main` too | spec.md FWIG-42 and Success Criteria; tasks.md T5, T6, T19; Follow-ups | Yes |
| FWIG-34 amended: the edit loop rewrites in place | spec.md FWIG-34; design.md bench table; tasks.md T4 run C, T6 | Yes |
| T10: harness `flush()` async, four cases changed by `await` | tasks.md T10's SPEC_DEVIATION; `git diff fc19a3c..8d3f925 -- src/main/file-watcher.test.ts` shows exactly four `h.flush()` becoming `await h.flush()` in the existing cases, with no assertion touched | Yes |
| T14: untracked and added give equal keys | tasks.md T14's amended Done-when lines; `src/renderer/src/lib/diff-view.test.ts:125-129` | Yes |

### Discrimination sensor

A detached scratch worktree of `8d3f925` under the system temp folder, with its own
`npm ci --ignore-scripts` (and `node node_modules/electron/install.js` for the smoke). Each
mutant was written by a script that asserted the anchor was unique and the mutant text present,
ran the tests, and restored the file in `finally`. Each unit mutant ran the test file of the
module it changed; every survivor was then re-run against the full suite (2,863 tests), and it
survived there too. The scratch worktree was removed afterwards (`git worktree remove --force`,
`git worktree prune`); the real tree's `git status --porcelain` was empty before and after.

| # | File | Change | Outcome | Killed by |
| - | ---- | ------ | ------- | --------- |
| U1 | `src/main/ignore-check.ts:59` | `folders.length + files.length > IGNORE_ASK_LIMIT` to `>=` | Killed | `ignore-check.test.ts` "asks every question at exactly the limit", "remembers nothing about the paths it did not ask about" |
| U2 | `src/main/ignore-check.ts:109` | drop `!isTimeout(err) &&` from the exit-1 test | Survived, **equivalent** | none: a killed child rejects with `code: null`, `killed: true`, `signal: 'SIGTERM'` (measured on this machine), so `code === 1` is already false on a timeout |
| U3 | `src/main/file-watcher.ts:174` | forget only on `path.endsWith('/.gitignore')`, not on the root `.gitignore` | **Survived** (full suite) | none; follow-up |
| U4 | `src/main/file-watcher.ts:171` | remove `this.answers.forget()` from the git-state branch | Killed | `file-watcher.test.ts` "emits a git-state batch whole without asking, and asks again on the next batch" |
| U5 | `src/main/file-watcher.ts:201` | `closeAll` keeps the old `IgnoreAnswers` | Killed | "asks again after a reselection" |
| U6 | `src/main/file-watcher.ts:182` | a null check learns `ask` as all kept (`learn(ask, ignored ?? new Set())`) | Killed | "emits the batch unfiltered when git cannot tell, and asks again next time (FWIG-10)" |
| U7 | `src/main/file-watcher.ts:190` | `isCurrent` ignores the generation | **Survived** (full suite) | none; follow-up |
| U8 | `src/main/file-watcher.ts:141-142` | each batch settles at once instead of on the `classifying` chain | Killed | "runs one check at a time and emits the batches in the order they closed (FWIG-12)" |
| U9 | `src/main/file-diff.ts:284` | `untrackedStats`'s `ls-files` without `READ_ONLY_FLAGS` | **Survived** (full suite) | none; follow-up |
| U10 | `src/renderer/src/lib/refresh-gate.ts:52` | a rejected run logs but does not release | Killed | `refresh-gate.test.ts` "starts the waiting run after a run that rejects", "... that throws synchronously" |
| U11 | `src/renderer/src/lib/refresh-gate.ts:63-65` | `dropWaiting` does nothing | Killed | "leaves no trailing run when the waiting job is dropped during a run (FWIG-23)" |
| U12 | `src/renderer/src/lib/diff-view.ts:79` | a revision side keys as `rev:<path>`, without the revision | Killed | `diff-view.test.ts` "changes with the merge base (FWIG-26)" |
| S1 | `src/renderer/src/components/FileTabs.tsx:471` | `revisions={undefined}` in every mode (FWIG-25's wiring, which no unit test can reach) | Killed | `SMOKE_ONLY=fold` on a fresh seed and a fresh dev app: 14b FAIL ("arrived in null ms, 3 strips (want 4)"), 13/19; the unmutated control on the same setup 19/19, 14b in 566 ms |

**Sensor depth**: lightweight plus, 12 unit mutants (the round's cap) over the riskiest new code,
and 1 smoke mutant for the one rule the existing smoke falsifications did not cover.
**Sensor tally**: 13 mutants, 9 killed, 4 survived (1 equivalent, 3 test gaps over correct code).

Not mutated, judged by reading: `bumpRevisions` (`files-view.test.ts:201` pins the
duplicate-bumps-once rule, `:207` the same-reference return with `toBe`), the gate's merge
(`refresh-gate.test.ts:81` reads `'b+c+d'`, which a last-wins gate cannot produce), and the
`requestKey` fields other than the revision (`diff-view.test.ts:136-167`).

The smoke evidence of T5 and T19 was already falsified (15a on the watcher filter, 15b on the
control's location, 15c on `--exclude-standard`), and T20's three bench mutants each moved their
target to FAIL (543 git, 11.92, 60). Their record is consistent with the code they changed, so
the bench runs were not repeated. Smoke mutants used: 1 of 5.

The watcher's catch around a throwing `emit` (`src/main/file-watcher.ts:141-143`) has no test.
No AC names it; without it, one throwing emit would leave the chain rejected and stop every later
batch, which would break FWIG-12 and the liveness of FWIG-30. The production emit
(`src/main/index.ts:432-435`) returns early without a window, so a throw is unlikely. Recorded as
a follow-up, not a gap in an AC.

### Code quality

| Check | Status |
| ----- | ------ |
| Minimum code, surgical changes, no scope creep | Yes: the diff touches the files design.md names, plus the injectable runner on `changedSince` (T12, explained there) |
| Matches existing patterns | Yes: injected seams and real-git tests as in `.specs/codebase/TESTING.md`; no `vi.mock` |
| Asserted values match the spec outcome | Yes, with the gaps listed above |
| Per-layer coverage | Main and lib: 1:1 to the ACs except U3, U7, U9. Hook and components: manual by convention, with FWIG-25's wiring now falsified by S1 |
| Every new test maps to an AC, an edge case or a Done-when line | Yes |
| Guidelines followed | `.specs/codebase/TESTING.md`, `eslint.config.mjs` (lint 0 errors) |

### Gate check

- Command: `npm run typecheck && npm run lint && npm test`, on the real tree at `8d3f925`.
- Typecheck clean (node and web). Lint 0 errors, 18 warnings, as at T1.
- **2,863 tests in 129 files passed, 0 failed, 0 skipped**, 110.8 s. The known flake did not
  show.
- Count: 2,769 in 127 files before the feature (T1), so +94 tests and +2 files
  (`src/main/ignore-check.test.ts`, `src/renderer/src/lib/refresh-gate.test.ts`). No existing test
  was deleted. Changed existing assertions: the exact `DEFAULT_TARGETS` object (one key added,
  T3), `file-diff.test.ts`'s `args[0]` check made stricter (T11), and the four `await` additions
  (T10).

### Ranked gaps

None is a production defect or an AC with no evidence, so none starts a fix round. In order of
risk, all recorded under Follow-ups above:

1. FWIG-13 leave-and-return untested (U7). It is the one race between the user and git in this
   feature.
2. FWIG-15 unasserted on three reads (U9), which go through a `git` that no test can record.
3. FWIG-07 root `.gitignore` untested (U3).
4. FWIG-22, 27, 28 and 29 evidenced by reading only.
5. FWIG-10's wording: "as it would without the filter".
6. No test for the watcher's catch on a throwing `emit`.
