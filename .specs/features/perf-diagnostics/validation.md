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

---

## Verification report

**Date**: 2026-10-03
**Spec**: `.specs/features/perf-diagnostics/spec.md` (PDIAG-01..51, with the 2026-10-03 reconciliation rows)
**Diff range**: `f1ed79f..da08084` (17 task commits, branch `feature/perf-diagnostics`)
**Verifier**: independent sub-agent (author ≠ verifier); read-only over the real tree, mutations in a
throwaway `git worktree` only

### Verdict: FAIL ❌ (one minor gap, test-side only)

Every AC has evidence and every asserted value matches the spec outcome, the gate is green, and 18 of
20 mutants are killed. Two mutants survive, both on PDIAG-02's disabled path: `createAppDiagnostics`
can create an event-loop monitor or start a timer before its switch check and the suite stays green.
The shipped code is correct by reading (`src/main/diagnostics.ts:461` returns `NOOP_DIAGNOSTICS` before
any port is touched), but spec Success Criterion 1 ("the unit suite proves the module starts no timer
and no monitor") is not met, because `createAppDiagnostics` hard-wires `realClock` and
`nodeLoopMonitor` and the disabled test can only see the returned object and the empty folder. See
Fix 1. Three spec-precision notes are flagged below; none is a behaviour defect.

### Task completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T10 | ✅ Done | unit-tested; each Done-when line found in the test files cited below |
| T11 | ✅ Done | manual record in tasks.md: enabled line at 61-63 s, `windowMs` 60,008, 11 git processes; disabled: no file after 66 s; probes moved by a staged commit (`recounts` 0 → 1) |
| T12 | ✅ Done | `README.md:132-151` |
| T13 | ✅ Done | manual record: 101 frames in 5,000 ms, 30 lines a frame, 100 of 100 pairs differ |
| T14 | ✅ Done | 20 unit tests |
| T15 | ✅ Done | Runs A-E written with figures; PDIAG-49/50 read against `scripts/bench-sessions.mjs` |
| T16 | ✅ Done | three bench mutants, each figure moved (table in tasks.md) |
| T17 | ✅ Done | `## Baseline` above: five summaries at `dc57bf0`, calibration, stop rule fired and written |

### Spec-anchored acceptance criteria

Test paths: `D` = `src/main/diagnostics.test.ts`, `S` = `scripts/bench-summary.test.ts`,
`G` = `src/main/git.test.ts`, `TS` = `src/main/time-snapshot.test.ts`,
`SM` = `src/main/session-manager.test.ts`, `NP` = `src/main/session-name-poller.test.ts`.

| ID | Spec-defined outcome | Evidence (`file:line` - assertion) | Result |
| -- | -------------------- | ---------------------------------- | ------ |
| PDIAG-01 | `PLAYGROUND_DEBUG_PERF=1` → one line every 60,000 ms in `<userData>/perf-diagnostics.jsonl` | `D:205` - `expect(h.clock.timers.map((t) => t.ms)).toEqual([60000])`; `D:32` - `FLUSH_INTERVAL_MS` `toBe(60000)`; `D:712-730` real temp dir, `first.v` `toBe(1)`, `first.pid` `toBe(process.pid)`; wiring `src/main/index.ts:313-319`; T11 enabled run | ✅ PASS |
| PDIAG-02 | unset / other value → no timer, no monitor, no file | `D:38-45` - `diagnosticsEnabled` true only for `'1'` (`''`, `'0'`, `'true'`, `' 1'` false); `D:707` - `expect(d).toBe(NOOP_DIAGNOSTICS)`; `D:709` - `readdirSync(dir)` `toEqual([])`; T11 disabled run | ⚠️ PASS by evidence, but mutants M5/M6 survive (Fix 1) |
| PDIAG-03 | async append, one complete JSON object + `\n`, window order, one write at a time | `D:215-216` - ends in `\n`, only one `\n`; `D:288-292` - second write not started until the first settles, `windowMs` `[1, 2]`; `D:700-702` - real file holds both lines intact | ✅ PASS |
| PDIAG-04 | `v: 1`, `t` ISO UTC window end, `windowMs`, `pid`, `version`, six sections even when empty | `D:217-237` - whole line `toEqual({ v: 1, t: '2026-10-01T12:01:00.000Z', windowMs: 60000, ..., names: {...} })` | ✅ PASS |
| PDIAG-05 | worktree by last segment only; no full path, no git argument but the subcommand, no terminal content | `D:546-565` and `D:674-679` - serialized line `not.toContain` each parent folder, `credential`, `--format`, `refs/heads`, `-C` value, `TOP-SECRET-OUTPUT`; `D:350-353` - `folderOf` gives `bench-wt-1` | ✅ PASS |
| PDIAG-06 | after a line every count/total/max restarts; peaks restart from processes still running | `D:247` - `windowMs` `[60000, 60250]`; `D:490-492` - next line `peakConcurrent` 0, `byWorktree` `{}`; `D:519-527` - in-flight call gives window 2 `peakConcurrent: 1` overall and per worktree; `D:648-650` recounts/emits `{}`; `D:633` - `pty` `{}` | ✅ PASS |
| PDIAG-07 | failed write: line dropped, one console error per streak with file and code, keep counting, never throw | `D:304-307` - `not.toThrow()`; `D:309` - `['[diagnostics] could not write perf-diagnostics.jsonl: EACCES']`; `D:312` one log for two failures; `D:315-318` new streak logs again; `D:320` - 4 handed over, none retried | ✅ PASS |
| PDIAG-08 | quit: timer cancelled, monitor disabled, no partial window | `D:326-327` - `cancels` 1, `disables` 1; `D:330` - `written` `toEqual([])` after a fire; `D:333-334` second stop changes nothing; wiring `src/main/index.ts:320`; T11 exit 0 after 0.2 s | ✅ PASS |
| PDIAG-09 | runner reports request, paced start, and end on success/failure/timeout | `G:128-131` - `ends` 1 before the await returns, `requests`/`starts` `toEqual([{ cwd: tmpdir(), args: ['--version'] }])`; `G:137-139` failure still `fatal:`, one end; `G:145-147` `isTimeout` true, one start, one end; `G:153-159` six requests, 0 started synchronously, `maxRunning` ≤ 4, six ends | ✅ PASS |
| PDIAG-10 | subcommand = first non-`-` arg, skipping `-c`/`-C` value, else `(none)` | `D:340-344` - `status`, `status`, `log`, `(none)`, `(none)` | ✅ PASS |
| PDIAG-11 | duration to `totalMs`, raises `maxMs`, per subcommand and total | `D:390-396` - `count` 3, `totalMs` 450, `maxMs` 300, `status {2, 400, 300}`, `rev-parse {1, 50, 50}` | ✅ PASS |
| PDIAG-12 | `peakConcurrent` overall and per worktree | `D:409-411` - 4 overall, 3 / 1 per worktree; `D:421-422` - sequential reads 1 | ✅ PASS |
| PDIAG-13 | per worktree and subcommand: count and `maxPerSecond` over any 1,000 ms sliding span | `D:437-441` - `[0,400,900]` → 3, `[0,600,1200]` → 2, `[950,1050]` → 2 (a fixed bucket reads 1), `[0,1000]` → 1; `D:451-457` per-subcommand `{count, maxPerSecond}` | ✅ PASS |
| PDIAG-14 | fetch, branch read and `readGitAsync` through `git()` with today's args and timeout | `TS:141-144` - nulls outside a repo, one `rev-parse` request, start, end; `TS:155-157` - branch answered, one start, one end; `src/main/index.ts:97` (`await git(cwd, args)`) and `:108` (`{ timeoutMs: 2000 }`) read; T7/T8 written comparison | ✅ PASS (fetch and branch read by reading, as the matrix assigns) |
| PDIAG-15 | wait = start - request into `git.wait`; a call not started counts in neither `count` nor `peakConcurrent` | `D:470-474` - `wait` `{ totalMs: 140, maxMs: 100 }`, `count` 2, `peakConcurrent` 2 with a third request never started; `G:154` - 0 starts at request time | ✅ PASS |
| PDIAG-16 | an end reported twice counts once | `D:486-489` - `count` 1, `totalMs` 30, `status {1, 30, 30}` after `start()` twice and `end()` twice | ✅ PASS |
| PDIAG-17 | sampled with `monitorEventLoopDelay` at 10 ms | `src/main/diagnostics.ts:440-443` read (`resolution: LOOP_RESOLUTION_MS`, `enable()`), `src/main/perf-monitor.ts:6` = 10; T16 mutant 1: loop p99 17.0 → 23.5 ms | ✅ PASS (manual, as assigned) |
| PDIAG-18 | `p50Ms`/`p99Ms`/`maxMs` in ms to 3 decimals, `resolutionMs: 10`, histogram reset | `D:258` - `{ p50Ms: 12, p99Ms: 31.5, maxMs: 61.235, resolutionMs: 10 }`; `D:259`, `D:261` - `resets` 1 then 2 | ✅ PASS |
| PDIAG-19 | no sample → zeros | `D:272` - zeros with `count: 0` although the fake answers 9,000,000 ns | ✅ PASS |
| PDIAG-20 | +1 `chunks`, + UTF-8 length to `bytes` per session | `D:594` - `'é\n'` gives `{ chunks: 1, bytes: 3, ... }`; `SM:1464` - fake receives `{ sessionId: view.id, chunk: 'é\n' }` once; `SM:1467` scrollback ends with it | ✅ PASS |
| PDIAG-21 | append duration to `appendMs`, raises `appendMaxMs` | `D:604-607` - `s1 { chunks: 2, bytes: 4, appendMs: 7, appendMaxMs: 5 }`, `s2` separate; T16 mutant 1: 0.036 → 2.054 ms | ✅ PASS |
| PDIAG-22 | off: chunk appended once, no clock read | `D:70` - `appends` 1 through the no-op; `SM:1475-1480` - forwarded as `session:data` and present once in the snapshot; no clock: `src/main/diagnostics.ts:417` read (calls `append()` only) | ✅ PASS (clock part by reading) |
| PDIAG-23 | append throws → chunk and duration recorded, same error reaches caller | `D:622` - `caught` `toBe(boom)`; `D:624` - `{ chunks: 1, bytes: 3, appendMs: 4, appendMaxMs: 4 }` | ✅ PASS |
| PDIAG-24 | recount counted under the folder in `recounts` | `D:643` - `{ 'bench-wt-1': 2 }`; wiring `src/main/index.ts:168`; T16 mutant 3: `recounts` 190 → 0 | ✅ PASS |
| PDIAG-25 | `worktree:status` emit counted | `D:644-647` - `'worktree:status': { 'bench-wt-1': 1 }`; wiring `src/main/index.ts:377`; T15 Run D `wt:status` 176 | ✅ PASS |
| PDIAG-26 | `files:changed` emit counted | `D:644-647` - `'files:changed': { 'bench-wt-2': 1 }`, only under that key; wiring `src/main/index.ts:427-429` read | ✅ PASS (wiring by reading; no bench opens the Files view, #150) |
| PDIAG-27 | `claude agents --json` start counted; duration on settle | `D:663` - `{ count: 2, totalMs: 4000, maxMs: 2200 }` with one end called twice; `NP:428-433` start once, end once on close 0; `NP:442-443` timeout; `NP:452-453` error then close; `NP:465-466` no start when spawn throws | ✅ PASS |
| PDIAG-28 | no build → exit 2 naming `npx electron-vite build`, starts nothing | T15 Run A (exit 2, message quoted, no temp folder, no process); `scripts/bench-sessions.mjs:89-94` precedes `mkdtempSync` at `:98` | ✅ PASS (manual) |
| PDIAG-29 | temp `--user-data-dir`, the switch, CDP port and the three flags | T15 Run B: observed command line quoted; `scripts/bench-sessions.mjs:266-279` | ✅ PASS (manual) |
| PDIAG-30 | own repo, `--files` files, `bench-wt-1..N`, only workspace | T15 Run B/C: `git worktree list`, 500 tracked files, one workspace; `scripts/bench-sessions.mjs:157-173` | ⚠️ PASS, spec-precision note 2 |
| PDIAG-31 | on line 1: N `sessions:spawn` Ad-hoc in `bench-wt-i` running `bench-tui.mjs`, attach the first | T15 Run B (session command line observed); `scripts/bench-sessions.mjs:301-324` | ✅ PASS (manual) |
| PDIAG-32 | no registry agent, no account, no network | T15 Run B: both `claude.exe` traced to the owner's own app, none in the bench tree; `agentName: 'Ad-hoc'` at `:316` | ✅ PASS (manual) |
| PDIAG-33 | `--fps` frames/s of `--rows` lines, cursor-up + erase, SGR colours, consecutive frames differ | T13: 101 frames in 5,000 ms, 30 × `ESC[2K ESC[1A` per frame, `ESC[38;5;<c>m` lines, 100/100 pairs differ | ✅ PASS (manual) |
| PDIAG-34 | `--index-interval` rewrites the first worktree's `index` with its own bytes, failures counted and skipped | T15 Run D: 1,073 writes, 0 skipped, `status/s` 4 vs 0; T16 mutant 2; `scripts/bench-sessions.mjs:328-340` | ✅ PASS (manual) |
| PDIAG-35 | after `--minutes` lines past spawn: stop sessions, close window, print summary | T15 Run B; `scripts/bench-sessions.mjs:342-378` | ✅ PASS (manual) |
| PDIAG-36 | rows `startup`, `spawn`, `steady 1..m`, `worst`, then one target line each with value and verdict | `S:94-101` labels; `S:106-107` sixth line dropped; `S:321-339` order, worst row, four target lines with values; T15 Run B | ⚠️ PASS, spec-precision note 3 |
| PDIAG-37 | longest `sessions:spawn` round trip in ms | `S:333` - `'spawn: longest sessions:spawn round trip 412 ms'`; T15 Run B 90 ms | ⚠️ PASS, spec-precision note 1 |
| PDIAG-38 | `--json` writes options, raw lines, summary | T15 Run B: `b.json` keys `options, lines (3), rows, worst, targets, spawnMs`; `scripts/bench-sessions.mjs:382-387` | ✅ PASS (manual) |
| PDIAG-39 | exit 0 whatever the figures; temp removed unless `--keep` | T15 Run B (no `pg-bench-` folder left), Run C `--keep` kept and printed; Run D exit with a FAIL target | ✅ PASS (manual) |
| PDIAG-40 | baseline for N = 0, 1, 3, 6 and 6 + index 100, each with its commit | `## Baseline` above: five verbatim summaries, each header `commit=dc57bf0` | ✅ PASS (manual) |
| PDIAG-41 | loop p99 < 30 at 6 sessions; mean append (steady totals) < 0.1; `status` ≤ 1 per worktree in index runs; `peakConcurrent` ≤ 1 per worktree; all over steady rows | `S:216-222` 29 PASS / 30 FAIL; `S:226-232` 0.099 PASS / 0.1 FAIL; `S:236-242` 1 PASS / 2 FAIL; `S:246-252` 1 PASS / 2 FAIL; `S:192-194` steady totals 0.14, startup/spawn ignored; `S:256-259` steady rows only | ✅ PASS |
| PDIAG-42 | N = 0 worst p99 ≥ 20 → target = value + 10, owner told | `## Baseline`: 17.3 ms, target kept at 30 with the reasoning; `S:278-285` a recalibrated limit is honoured | ✅ PASS (manual) |
| PDIAG-43 | target already met for an open issue → stop and report; append is a regression guard | `## Baseline` stop-rule table: #151 loop and stall met, #149 overlap met → stopped; append recorded as guard | ✅ PASS (manual) |
| PDIAG-44 | README "Diagnostics" names the variable, the file, the cadence, folder names only | `README.md:132`, `:134`, `:143`, `:146` | ✅ PASS |
| PDIAG-45 | counted in the start window, timed in the end window | `D:501-515` window 1 `count` 1, `totalMs` 0; `D:520-527` window 2 `count` 0, `totalMs` 500 | ✅ PASS |
| PDIAG-46 | an exited session stays in its window and is absent later | `D:632-633` - `['s1']` then `{}` | ✅ PASS |
| PDIAG-47 | trailing separator → last non-empty segment; no segment → `(none)` | `D:352-353` trailing separators; `D:357-360` `C:\`, `C:/`, `/`, `''` → `(none)` | ✅ PASS |
| PDIAG-48 | Ctrl+C kills the tree and removes temp unless `--keep` | T15 Run E: exit 130, tree gone 3.9 s after `\x03`, temp removed; `scripts/bench-sessions.mjs:129-133` | ✅ PASS (manual) |
| PDIAG-49 | app not exiting within 30 s → tree killed | read: `scripts/bench-sessions.mjs:36` (`EXIT_TIMEOUT_MS = 30_000`), `:362` race, `:367` `taskkill /T /F` | ✅ PASS (read, as assigned) |
| PDIAG-50 | lines missing after `--minutes` + 3 min → print what it has, clean up, exit 1 | read: `scripts/bench-sessions.mjs:343` deadline, `:371-378` summary printed, `:388-391` `fail` → exit 1, `:128` `exit` handler cleans up | ✅ PASS (read, as assigned) |
| PDIAG-51 | `--sessions 0`: no session opened, `spawn` row still printed | `S:272-275` append `n/a`, overlap PASS; `S:356-358` `sessions=0`, `index=off`, `spawn: no session opened`; T15 Run C; Baseline N = 0 | ✅ PASS |

**Payload/conjunction rule**: every probe-site test asserts the payload, not just the call: cwd and args
(`G:130-131`), session id and chunk (`SM:1464`), subcommand of the request and of the start (`TS:142-143`);
line fields are asserted by value (`D:217-237`, `D:501-527`) and the privacy rule on the serialized text
(`D:546-565`, `D:674-679`).

**Status**: 51/51 IDs have evidence matching the spec outcome; 3 spec-precision notes; PDIAG-02's
evidence does not discriminate its "no timer, no monitor" half (sensor M5, M6).

**Spec-precision notes** (wording against the approved design, not defects):

1. PDIAG-37 says the *spawn row* shows the round trip; the summary prints it on its own line under the
   table (`spawn: longest sessions:spawn round trip N ms`), as design.md's sample output does. The figure
   is there; the spec sentence should say "the summary".
2. PDIAG-30 says one linked worktree per session; with `--sessions 0` the bench still seeds `bench-wt-1`
   (`scripts/bench-sessions.mjs:167`, `Math.max(options.sessions, 1)`; T15 Run C lists it). Harmless
   (it keeps the index loop's target defined), but not written in the spec or as a deviation.
3. PDIAG-36 says each target line shows "PASS or FAIL"; the summary also prints `n/a` for a target not
   judged at that run (PDIAG-41's "with 6 sessions" / "of an index run", PDIAG-51). Tested at
   `S:263`, `S:267`, `S:274`; the spec sentence omits the third verdict.

### Discrimination sensor

Expanded depth (20 behaviour-level mutants), in a throwaway `git worktree` of `da08084` with
`node_modules` linked; each mutant written, its covering test file run, the original restored.

| # | File (mutated site) | Mutation | Killed by | Result |
| - | ------------------- | -------- | --------- | ------ |
| M1 | `src/main/diagnostics.ts:251` | `maxPerSecond` sliding span → fixed one-second bucket | `D:436` sliding span | ✅ Killed |
| M2 | `src/main/diagnostics.ts:230` | queue wait not added to `git.wait.totalMs` | `D:460` queue wait | ✅ Killed |
| M3 | `src/main/diagnostics.ts:211` | new window's overall peak starts at 0, not from running processes | `D:495` cross-window | ✅ Killed |
| M4 | `src/main/diagnostics.ts:257` | `ended` guard removed: a double end counted twice | `D:477` double report | ✅ Killed |
| M5 | `src/main/diagnostics.ts:461` | disabled path creates and enables a loop monitor before the switch check | none | ❌ **Survived** |
| M6 | `src/main/diagnostics.ts:461` | disabled path starts a `setInterval` before the switch check | none | ❌ **Survived** |
| M7 | `src/main/diagnostics.ts:122` | `folderOf` keeps the parent folder (last two segments) | `D:349` and 7 more | ✅ Killed |
| M8 | `src/main/diagnostics.ts:387` | histogram not reset after a line | `D:250` | ✅ Killed |
| M9 | `src/main/git.ts:30-32` | git counted at the request instead of the paced start | `G:150` | ✅ Killed |
| M10 | `src/main/git.ts:45` | end reported on success only (`then` for `finally`) | `G:134`, `G:142` | ✅ Killed |
| M11 | `src/main/time-snapshot.ts:81` | `readGitAsync` spawns git itself, bypassing `git()` | `TS:140`, `TS:147` | ✅ Killed |
| M12 | `src/main/session-name-poller.ts:139-141` | listing end called before the `settled` guard | `NP:446` error then close | ✅ Killed |
| M13 | `src/main/session-manager.ts:402` | chunk appended outside `measureAppend` too (twice) | `SM:1470` and 2 older tests | ✅ Killed |
| M14 | `scripts/bench-summary.mjs:122` | strict targets judged inclusive (`<=`) | `S:215`, `S:225` | ✅ Killed |
| M15 | `scripts/bench-summary.mjs:135` | append target never `n/a` (`chunks >= 0`) | `S:272` | ✅ Killed |
| M16 | `scripts/bench-summary.mjs:93` | worst row includes `startup` and `spawn` | `S:183` and 7 more | ✅ Killed |
| M17 | `scripts/bench-summary.mjs:142` | status target judged without an index loop | `S:266` | ✅ Killed |
| M18 | `src/main/diagnostics.ts:299` | per-worktree peak not restarted from running processes | `D:495` | ✅ Killed |
| M19 | `src/main/diagnostics.ts:325` | bytes as UTF-16 length, not UTF-8 | `D:586` | ✅ Killed |
| M20 | `src/main/diagnostics.ts:190` | a failed write logged every time, not once per streak | `D:295` | ✅ Killed |

**Round 1 sensor**: 18/20 killed, 2 survived - FAIL ❌ (superseded by Round 2 below). The bench scripts and the `index.ts` wiring were not
mutated (manual layer; T16 already falsified three bench figures with real runs).

Isolation: the real worktree's `git status --porcelain` was empty before the sensor and empty after the
scratch worktree was removed (`git worktree remove --force`); its `node_modules` link was removed first.

### Gate check

- **Command**: `npm run typecheck && npm run lint && npm test` at `da08084`
- **Result**: exit 0; typecheck clean (node and web); lint 0 errors, **18 warnings**, none in a file this
  feature changed; **2,577 passed**, 0 failed, 0 skipped, 121 files (Vitest 84.4 s)
- **Test count before the feature**: 2,508 (T1, `f1ed79f`) → after: 2,577 (**+69**, the sum of T1-T14's
  recorded deltas: 7 + 8 + 12 + 7 + 3 + 4 + 2 + 2 + 4 + 20). No test removed, no assertion weakened in
  the touched suites (the diffs only add `describe` blocks).

### Code quality

| Check | Status |
| ----- | ------ |
| Minimum code / no scope creep | ✅ the synchronous `readGit` left alone, as Out of Scope says; no UI, no rotation |
| Surgical changes | ✅ one probe line per call site; `gitFetch` / `readBranch` / `readGitAsync` keep args, timeout and failure answers |
| Matches patterns | ✅ injected clock, monitor and writer as in TESTING.md pattern 3; real-temp-dir test for the writer |
| Spec-anchored outcome check | ✅ values asserted by literal (constants pinned at `D:30-33`, `S:66-71`) |
| Per-layer coverage | ⚠️ module 1:1 to its IDs except PDIAG-02's monitor and timer half (Fix 1) |
| Every test maps to a requirement | ✅ each new `it` names its PDIAG ID or a Done-when line |
| Guidelines followed | ✅ `.specs/codebase/TESTING.md` (no `vi.mock`, hand-rolled fakes) |

### Fix plans

#### Fix 1: make the disabled path's "no timer, no monitor" observable (PDIAG-02, M5/M6) - Minor

- **Root cause**: `createAppDiagnostics` (`src/main/diagnostics.ts:455-470`) hard-wires `realClock` and
  `nodeLoopMonitor`; the disabled test (`D:705-710`) can only check the returned object and the folder, so
  a monitor or timer created before the switch check goes unseen. Spec Success Criterion 1 asks the unit
  suite to prove it.
- **Fix task**: let `createAppDiagnostics` take optional `clock` and `startLoopMonitor` overrides (the app
  passes none); in the disabled test pass counting fakes and assert `every` and `startLoopMonitor` were
  called 0 times; in the enabled test assert each was called once.
- **Done when**: M5 and M6 above are killed; full gate green.

### Requirement traceability

All 51 IDs stay **Done**; PDIAG-02 is **Done, test to strengthen** until Fix 1 lands.

### Summary

**Overall**: ❌ Not ready by the sensor's rule (one minor, test-only gap); the behaviour itself checks out.

**Spec-anchored check**: 51/51 IDs with evidence matching the spec outcome; 3 spec-precision notes
**Sensor**: 18/20 mutants killed (M5, M6 survived: PDIAG-02's disabled path)
**Gate**: 2,577 passed, 0 failed; lint 18 warnings

**Next steps**: Fix 1, then re-verify (round 2 of at most 3); optionally reword PDIAG-30, 36 and 37.

## Validation round 2: PASS ✅

**Date**: 2026-10-03
**Diff range**: `90d5082..3f02d8a` (T18, one commit: `test(diagnostics): prove the disabled factory starts no
timer and no monitor`)
**Verifier**: independent sub-agent (author ≠ verifier); scope per the verifier budget: the fix diff only.
The round-1 report above is kept as written, except its sensor line, relabelled from `Result` to
`Round 1 sensor` so that this round's verdict is the one `validate_state.py` reads.

**Result**: PASS ✅ - Fix 1 landed as planned, the round-1 survivors are killed through the new seam, the
three spec-precision notes are closed, the gate is green.

### Fix check

- **App path unchanged**: `src/main/index.ts:313-319` calls `createAppDiagnostics({ env, userDataPath,
  version })` with no `ports`; `src/main/diagnostics.ts:465` and `:467` fall back to `realClock` (`:430`)
  and `nodeLoopMonitor` (`:440`). The switch check still comes first (`src/main/diagnostics.ts:463`).
  `ports` is typed as a partial pick of `clock` / `startLoopMonitor` only (`:461`); the writer stays real.
- **Outcome asserted, not calls only**: `src/main/diagnostics.test.ts:712-735` counts the timers registered
  on a fake clock (with their period) and the monitors started. For `undefined`, `''`, `'0'` and `'true'`
  it asserts `toEqual({ timers: [], monitors: 0 })` (`:731-732`, PDIAG-02); for `'1'` it asserts
  `toEqual({ timers: [60000], monitors: 1 })` (`:734`, PDIAG-01's cadence and PDIAG-17's one monitor).
- **No weakening**: the diff only adds a test and an optional parameter; the round-1 disabled test
  (`src/main/diagnostics.test.ts:705-710`, no-op returned and no file) is untouched.

### Reworded acceptance criteria

| ID | New wording (spec.md) | Code | Result |
| -- | --------------------- | ---- | ------ |
| PDIAG-30 | `.specs/features/perf-diagnostics/spec.md:202` - at least `bench-wt-1`, so `--sessions 0` seeds one | `scripts/bench-sessions.mjs:167` - `i <= Math.max(options.sessions, 1)`; `:329` the index loop reads `bench-wt-1` | ✅ matches |
| PDIAG-36 | `.specs/features/perf-diagnostics/spec.md:208` - each target line shows PASS, FAIL, or `n/a` | `scripts/bench-summary.mjs:18` verdict type `'PASS' \| 'FAIL' \| 'n/a'`; `n/a` at `:129`, `:135`, `:142`; rows then worst at `:207-213`, targets at `:219-224` | ✅ matches |
| PDIAG-37 | `.specs/features/perf-diagnostics/spec.md:209` - after the rows, one line with the longest round trip in ms | `scripts/bench-summary.mjs:214-218` pushed after the rows and the worst row, before `targets` | ✅ matches |

`validate_spec.py .specs/features/perf-diagnostics/spec.md`: exit 0, 0 errors, 0 warnings.

### Discrimination sensor (round 2)

A throwaway `git worktree` of `3f02d8a` in the session scratch folder, `node_modules` joined by a
junction; each mutant written into `src/main/diagnostics.ts`, `npx vitest run src/main/diagnostics.test.ts`
run, the file restored and compared byte for byte. Unmutated baseline: 38 passed.

| # | Mutation at `createAppDiagnostics` | Killed by | Result |
| - | ---------------------------------- | --------- | ------ |
| M5 | the monitor port (`opts.ports?.startLoopMonitor ?? nodeLoopMonitor`) called before the switch check | `src/main/diagnostics.test.ts:732` (`monitors` 1, expected 0) | ✅ Killed |
| M6 | the clock port's `every(60000, ...)` called before the switch check | `src/main/diagnostics.test.ts:732` (`timers` `[60000]`, expected `[]`) | ✅ Killed |
| M21 | ports ignored when enabled (`clock: realClock`) | `src/main/diagnostics.test.ts:734` (no fake timer registered) | ✅ Killed |
| M22 | switch check inverted | `src/main/diagnostics.test.ts:705`, `:712`, and the enabled file test | ✅ Killed (3 tests) |
| M5raw | `nodeLoopMonitor()` called directly, bypassing the port | none | ➖ Survived, out of the seam (not scored) |
| M6raw | `setInterval(() => {}, 60000)` called directly, bypassing the clock | none | ➖ Survived, out of the seam (not scored) |

**Sensor**: 4/4 scored mutants killed. M5 and M6 are the round-1 mutants expressed through the seam that
Fix 1 prescribed; the two raw variants write code that ignores the injected ports, which no injected
fake can see. Under `.specs/codebase/TESTING.md:21` (seam unit-tested, thin shell read, no `vi.mock`)
that is the read part: the only references to the real ports in `createAppDiagnostics` are the two
fallbacks after the check (`src/main/diagnostics.ts:465`, `:467`). Optional hardening, not a gap: a
`vi.useFakeTimers()` + `vi.getTimerCount()` assertion would also catch M6raw; M5raw cannot be caught
without mocking `perf_hooks`.

Isolation: the real worktree's `git status --porcelain` was empty before the sensor and after; the
junction was removed before `git worktree remove --force`, and the real `node_modules` was intact
afterwards.

### Gate check (round 2)

- **Command**: `npm run typecheck && npm run lint && npm test` at `3f02d8a`
- **Outcome**: exit 0; typecheck clean; lint 0 errors, **18 warnings** (unchanged); **2,578 passed**,
  0 failed, 121 files (Vitest 83.1 s). Count 2,577 → 2,578 (+1, the new test).

### Summary (final)

**Overall verdict**: PASS ✅ - 51/51 IDs with evidence matching the spec outcome; PDIAG-02 now
discriminated (M5, M6 killed); spec-precision notes 1-3 closed by the PDIAG-30, 36 and 37 rewording;
gate green. PDIAG-02 moves from "Done, test to strengthen" to **Done**.
