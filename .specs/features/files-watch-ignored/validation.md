# Files Watch Ignored Validation

> The Verifier keeps the `## Measurements` section as it is and adds its report below it.

## Measurements

### Before (T6, 2026-10-03)

**Verdict: two of the three Files targets read FAIL before the change; the edit target already reads
PASS (2.00), so the stop rule applies and the owner is told before any production change.** The build
loop starts about 1,700 git processes and 185 `files:changed` per minute on `bench-wt-1`, every one
from writes git ignores; the touch loop makes the view's own reads emit 60 `worktree:status` per
minute. The edit loop reads exactly 2 `cat-file` per `files:changed` today (see "The edit target"
below).

#### Machine and conditions

- A laptop with a 14-core Intel Core Ultra 5-class CPU (14 threads), about 31 GB RAM, Windows 11.
  Electron 39.8.10 (the app), Node 24.19.0 (the bench), git 2.55.0.windows.4. The same machine as
  #147's baseline.
- Commit `e941982` (T5's): the built app is that commit's source, with no production change from this
  feature; `git status --porcelain` was empty, so every header reads `commit=e941982`.
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
bench-sessions  sessions=0  fps=20  rows=30  files=500  index=off  minutes=3  commit=e941982  files-view  build=off  edit=1000ms  touch=off
phase         loop p50/p99/max ms  git n  wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      16.1 /  17.3 /  59.1      8   8.8     4        2         2          0         0       0   0.0       0.000 / 0.000      0
spawn        16.0 /  24.2 /  35.8    399  32.8     4        4         2          0         0       0   0.0       0.000 / 0.000      0
steady 1     16.0 /  24.0 /  34.1    300  21.8     2        2         2          0         0       0   0.0       0.000 / 0.000      0
steady 2     16.0 /  24.6 /  56.9    295  24.3     2        2         2          0         0       0   0.0       0.000 / 0.000      0
steady 3     16.1 /  23.8 /  31.3    300  23.4     2        2         2          0         0       0   0.0       0.000 / 0.000      0
worst        16.1 /  24.6 /  56.9    300  24.3     2        2         2          0         0       0   0.0       0.000 / 0.000      0
files       files:changed  git n  cat-file  wt:status
startup                 0      3         0          0
spawn                  57    399       218          0
steady 1               60    300       120          0
steady 2               59    295       118          0
steady 3               60    300       120          0
worst                  60    300       120          0
spawn: no session opened
targets
  loop p99 < 30 ms with 6 sessions                              24.6   n/a
  append mean < 0.1 ms per chunk                               0.000   n/a
  git status <= 1 per worktree per s                               2   n/a
  no overlapping git on one worktree                               2   FAIL
  ignored writes start no git                                    300   n/a
  untouched sections stay: cat-file per files:changed <= 2      2.00   PASS
  the view's reads leave the index alone                           0   n/a
edit loop: 236 writes, 0 skipped
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
| edit | steady 1 | 60 | 300 | 120 | 0 |
| edit | steady 2 | 59 | 295 | 118 | 0 |
| edit | steady 3 | 60 | 300 | 120 | 0 |
| touch | steady 1 | 119 | 1731 | 1074 | 60 |
| touch | steady 2 | 118 | 1709 | 1059 | 60 |
| touch | steady 3 | 119 | 1730 | 1074 | 59 |

#### The Files targets before the change

| Target | Run | Read before | Limit | Verdict |
| ------ | --- | ----------- | ----- | ------- |
| Ignored writes start no git (FWIG-37) | build | 1702 git, 186 `files:changed` in the worst steady row | 0 and 0 in every steady row | **FAIL** |
| Untouched sections stay (FWIG-38) | edit | 358 `cat-file` / 179 `files:changed` = 2.00 | at most 2 | **PASS** (exception, below) |
| The view's reads leave the index alone (FWIG-39) | touch | 60 `worktree:status` in the worst steady row | 0 in every steady row | **FAIL** |

For reference, the same ratio on the other two runs: build 3361 / 556 = 6.04; touch
3207 / 356 = 9.01 (the touch loop emits two batches per write: the file, then the
index the view's own `git diff` rewrote).

#### The edit target: already at its limit before the change

The edit run's steady rows read exactly one `status`, one `diff`, one `ls-files` and two `cat-file`
per `files:changed`: one HEAD side read (`cat-file -s`, then `--filters`), so one All changes section
re-reads per batch. The build run, whose batches name no listed file, reads six `cat-file` per
`files:changed`: three sections. The stack re-reads only its *mounted* sections, the expanded ones near
the viewport (`mountPlan`), not every open one. The likely reason the edit run mounts only one: the
loop appends to `src/f0000.ts`, the stack's first section, which grows by 60 lines a minute and
pushes the other sections out of the viewport. The spawn row agrees: 218 `cat-file` for 57
`files:changed` (3.8 each) while the file is still short. This is an inference from the counts; no
DOM count of the mounted editors was taken during the run.

So the edit run as specified cannot show the change: the figure FWIG-38 judges is at its limit today,
and the spec's "about 20 with the first ten open" does not hold at the bench's window size. Per T6 and
the batch's stop rule, the owner decides before any production change. Options for the owner, none
applied here:

1. Keep the run as it is and accept that FWIG-38 shows no movement on this bench (the unit tests of
   T14 and T16's key carry the behaviour).
2. Change the edit loop so the written file does not crowd the viewport, for example rewriting one
   line of `src/f0000.ts` with new content instead of appending, or appending to the last listed file
   (`src/f0011.ts`); then re-run T6's edit run.
