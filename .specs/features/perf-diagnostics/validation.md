# Performance Diagnostics Validation

## Baseline

> Written by T17 (2026-10-03). The Verifier keeps this section as it is and adds its report below it.

**Verdict: stopped, owner to be told.** The baseline already meets three targets owned by open fix
issues: `loop.p99Ms` under 30 ms with 6 sessions and the spawn row's `loop max` under 50 ms (#151), and
no overlapping git on one worktree at the index run (#149). The loop target is not recalibrated (the
N = 0 floor is 17.3 ms). #149's status rate is not met (4 per second). The append target (#148, closed)
passes and stays as a regression guard.

### Machine and conditions

- A laptop with a 14-core Intel Core Ultra 5-class CPU (14 threads), about 32 GB RAM, Windows 11.
  Electron 39.8.10 (the app), Node 24.19.0 (the bench and the fake TUI).
- Commit `dc57bf0` (T16's; the build is `6615d0b`'s source, rebuilt after T16's last mutant was
  restored, and `git status --porcelain` was empty, so every header reads `commit=dc57bf0`).
- Every run at the default settings (`--minutes 3 --fps 20 --rows 30 --files 500`, CDP port 9334), one
  after another, each with `--json` to a scratch folder outside the repository.
- **Not a fully quiet machine**: the owner's installed Playground app (outside the bench, 4 processes)
  was running throughout with its own Claude sessions, among them the agent that drove these runs. No
  other app build ran. Before and after every run there was no electron process from the worktree, no
  `bench-tui` process and no `pg-bench-` folder.

### Summaries (verbatim)

`node scripts/bench-sessions.mjs --sessions 0 --json n0.json` (305 s):

```
bench-sessions  sessions=0  fps=20  rows=30  files=500  index=off  minutes=3  commit=dc57bf0
phase         loop p50/p99/max ms  git n  wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      16.1 /  17.7 /  47.2      8   9.8     4        2         2          0         0       0   0.0       0.000 / 0.000      0
spawn        16.1 /  17.3 /  25.2      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
steady 1     16.1 /  17.3 /  19.7      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
steady 2     16.1 /  17.3 /  26.0      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
steady 3     16.1 /  17.3 /  26.3      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
worst        16.1 /  17.3 /  26.3      0   0.0     0        0         0          0         0       0   0.0       0.000 / 0.000      0
spawn: no session opened
targets
  loop p99 < 30 ms with 6 sessions        17.3   n/a
  append mean < 0.1 ms per chunk         0.000   n/a
  git status <= 1 per worktree per s         0   n/a
  no overlapping git on one worktree         0   PASS
```

`node scripts/bench-sessions.mjs --sessions 1 --json n1.json` (305 s):

```
bench-sessions  sessions=1  fps=20  rows=30  files=500  index=off  minutes=3  commit=dc57bf0
phase         loop p50/p99/max ms  git n  wait  peak  wt peak  status/s  wt:status  recounts  chunks  KB/s  append mean/max ms  names
startup      16.3 /  21.2 /  43.3      5   8.4     2        1         1          0         0       0   0.0       0.000 / 0.000      0
spawn        16.3 /  21.8 /  35.8      1   9.6     1        1         0          0         0    1306  80.7       0.061 / 0.892      0
steady 1     16.3 /  21.3 /  25.4      0   0.0     0        0         0          0         0    1259  81.5       0.061 / 0.859      0
steady 2     16.4 /  20.8 /  23.9      0   0.0     0        0         0          0         0    1249  81.5       0.067 / 0.310      0
steady 3     16.3 /  21.4 /  28.8      0   0.0     0        0         0          0         0    1272  81.5       0.059 / 0.416      0
worst        16.4 /  21.4 /  28.8      0   0.0     0        0         0          0         0    1272  81.5       0.062 / 0.859      0
spawn: longest sessions:spawn round trip 97 ms
targets
  loop p99 < 30 ms with 6 sessions        21.4   n/a
  append mean < 0.1 ms per chunk         0.062   PASS
  git status <= 1 per worktree per s         0   n/a
  no overlapping git on one worktree         0   PASS
```

`node scripts/bench-sessions.mjs --sessions 3 --json n3.json` (307 s):

```
bench-sessions  sessions=3  fps=20  rows=30  files=500  index=off  minutes=3  commit=dc57bf0
phase         loop p50/p99/max ms  git n   wait  peak  wt peak  status/s  wt:status  recounts  chunks   KB/s  append mean/max ms  names
startup      16.3 /  21.3 /  53.4     14  231.3     4        2         2          0         0       0    0.0       0.000 / 0.000      0
spawn        16.5 /  21.8 /  33.5      3    7.1     2        1         0          0         0    4170  241.3       0.049 / 0.974      0
steady 1     16.6 /  19.7 /  33.6      0    0.0     0        0         0          0         0    4010  244.7       0.052 / 0.326      0
steady 2     16.6 /  20.0 /  34.2      0    0.0     0        0         0          0         0    4045  244.6       0.047 / 0.255      0
steady 3     16.6 /  20.5 /  32.8      0    0.0     0        0         0          0         0    3987  244.6       0.044 / 0.234      0
worst        16.6 /  20.5 /  34.2      0    0.0     0        0         0          0         0    4045  244.7       0.048 / 0.326      0
spawn: longest sessions:spawn round trip 102 ms
targets
  loop p99 < 30 ms with 6 sessions        20.5   n/a
  append mean < 0.1 ms per chunk         0.048   PASS
  git status <= 1 per worktree per s         0   n/a
  no overlapping git on one worktree         0   PASS
```

`node scripts/bench-sessions.mjs --sessions 6 --json n6.json` (311 s):

```
bench-sessions  sessions=6  fps=20  rows=30  files=500  index=off  minutes=3  commit=dc57bf0
phase         loop p50/p99/max ms  git n   wait  peak  wt peak  status/s  wt:status  recounts  chunks   KB/s  append mean/max ms  names
startup      16.1 /  17.7 /  47.4     23  517.2     4        2         2          0         0       0    0.0       0.000 / 0.000      0
spawn        16.1 /  17.6 /  31.7      6    5.8     2        1         0          0         0    7645  477.0       0.041 / 1.050      0
steady 1     16.1 /  17.2 /  30.7      0    0.0     0        0         0          0         0    7677  489.4       0.037 / 0.189      0
steady 2     16.1 /  17.2 /  22.5      0    0.0     0        0         0          0         0    7632  489.2       0.040 / 0.227      0
steady 3     16.1 /  17.2 /  31.9      0    0.0     0        0         0          0         0    7658  489.3       0.036 / 0.132      0
worst        16.1 /  17.2 /  31.9      0    0.0     0        0         0          0         0    7677  489.4       0.038 / 0.227      0
spawn: longest sessions:spawn round trip 107 ms
targets
  loop p99 < 30 ms with 6 sessions        17.2   PASS
  append mean < 0.1 ms per chunk         0.038   PASS
  git status <= 1 per worktree per s         0   n/a
  no overlapping git on one worktree         0   PASS
```

`node scripts/bench-sessions.mjs --sessions 6 --index-interval 100 --json n6i.json` (310 s):

```
bench-sessions  sessions=6  fps=20  rows=30  files=500  index=100ms  minutes=3  commit=dc57bf0
phase         loop p50/p99/max ms  git n   wait  peak  wt peak  status/s  wt:status  recounts  chunks   KB/s  append mean/max ms  names
startup      16.1 /  17.6 /  46.4     23  480.3     4        2         2          0         0       0    0.0       0.000 / 0.000      0
spawn        16.0 /  22.1 /  30.4    181    7.3     2        1         4        174       175    7991  477.3       0.025 / 0.797      0
steady 1     16.0 /  21.3 /  25.8    179    1.5     1        1         4        178       179    7857  489.4       0.025 / 0.132      0
steady 2     16.0 /  21.3 /  25.9    179    1.4     1        1         4        177       179    7962  489.2       0.024 / 0.223      0
steady 3     16.0 /  21.1 /  26.7    179    1.6     1        1         4        178       179    7915  489.3       0.023 / 0.539      0
worst        16.0 /  21.3 /  26.7    179    1.6     1        1         4        178       179    7962  489.4       0.024 / 0.539      0
spawn: longest sessions:spawn round trip 117 ms
targets
  loop p99 < 30 ms with 6 sessions        21.3   PASS
  append mean < 0.1 ms per chunk         0.024   PASS
  git status <= 1 per worktree per s         4   FAIL
  no overlapping git on one worktree         1   PASS
index loop: 2141 writes, 0 skipped
```

### The target figures per run

Worst steady row, except the spawn row's `loop max` (#151's start-up stall figure). A value in brackets
is not judged at that run.

| Run | loop p99 ms | spawn row loop max ms | append mean ms | git status per worktree per s | wt peak |
| --- | ----------- | --------------------- | -------------- | ----------------------------- | ------- |
| N = 0 | (17.3) | 25.2 | (0.000) | (0) | 0 |
| N = 1 | (21.4) | 35.8 | 0.062 | (0) | 0 |
| N = 3 | (20.5) | 33.5 | 0.048 | (0) | 0 |
| N = 6 | **17.2** | **31.7** | **0.038** | (0) | 0 |
| N = 6, index 100 ms | 21.3 | 30.4 | 0.024 | **4** | **1** |

### Targets in force

- **Loop p99 under 30 ms with 6 sessions: kept at 30 ms.** The N = 0 worst steady `loop.p99Ms` is
  17.3 ms, under the 20 ms that would force a recalibration (PDIAG-42). The floor is the Windows timer
  tick, not the 10 ms resolution: `p50Ms` reads about 16 ms in every run, idle or loaded, and p99 sits
  between 17 and 22 ms.
- **Append mean under 0.1 ms per chunk**: unchanged (regression guard, #148 closed by #154).
- **At most one `git status` per worktree per second under continuous index writes**: unchanged.
- **No two git processes overlapping on one worktree**: unchanged.

### Stop rule

| Target | Owner | Read at | Baseline | Met? | Effect |
| ------ | ----- | ------- | -------- | ---- | ------ |
| Loop p99 under 30 ms | #151 (open) | N = 6, steady rows | 17.2 ms (21.3 ms with the index loop) | **Yes** | **Stop** |
| No main stall over 50 ms while 6 sessions open | #151 (open) | N = 6, spawn row `loop max` | 31.7 ms (30.4 ms with the index loop) | **Yes** | **Stop** |
| Append mean under 0.1 ms per chunk | #148 (closed by #154) | N = 6, steady totals | 0.038 ms | Yes | Regression guard, no stop |
| At most 1 `git status` per worktree per s | #149 (open) | index run, steady rows | 4 per s | No | #149 proceeds on this target |
| No overlapping git on one worktree | #149 (open) | index run, steady rows | `wt peak` 1 | **Yes** | **Stop** |

**Stopped, owner to be told**:

- **#151**: on this machine main's loop is not congested with 6 printing sessions. Steady p99 is
  17.2 ms, the same as with no session (17.3 ms), and opening six sessions stalls main for at most
  31.7 ms; each `sessions:spawn` round trip took at most 107 ms. The bench cannot read #151's name
  backoff: `names` is 0 in every run, because Ad-hoc sessions never start `claude agents --json`.
- **#149**: under an index write every 100 ms, the app recounts the worktree about 3 times a second
  (`status/s` 4, about 179 recounts and 179 `worktree:status` emits a minute), but the spawn queue and
  the settle already keep the recounts from overlapping (`wt peak` 1 in every steady row). Only the rate
  target is still failing. The two git processes at once on one worktree appear in the `startup` row of
  every run (`wt peak` 2), outside the steady rows the target reads.
- The append target passes at every session count (0.024-0.062 ms per chunk) and stays a regression guard.
