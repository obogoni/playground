# Main Async Git Validation

> Written by T1 (2026-10-03). The Verifier keeps `## Measurements` as it is and adds its report below it.

## Measurements

### Before: #147's baseline (MAGIT-29, MAGIT-35)

No bench run is repeated here (reconciliation of 2026-10-03, owner: unit tests only). The before figures are
#147's `--sessions 6` run, `.specs/features/perf-diagnostics/validation.md`, `## Baseline`, at commit
`dc57bf0` (the `perf-diagnostics` branch, shipped as PR #162 and merged into `main` at `fc19a3c`):

```
phase         loop p50/p99/max ms  git n   wait  peak  wt peak  status/s  wt:status  recounts  chunks   KB/s  append mean/max ms  names
spawn        16.1 /  17.6 /  31.7      6    5.8     2        1         0          0         0    7645  477.0       0.041 / 1.050      0
spawn: longest sessions:spawn round trip 107 ms
```

- `spawn`-row `loop max`: **31.7 ms** (30.4 ms in the run with an index write every 100 ms).
- `git n` 6: the six period reads, through `git()` since #154 (PERF-21).
- `names` 0 in every row of every #147 run: the bench's Ad-hoc sessions never start `claude agents --json`.
- The bench has no `sync` column: #147 counts every git process at the paced start of `git()` and shipped no
  synchronous-git counter.

### The listing half

On `fc19a3c`, a session the listing does not name gets a listing after every hook event:

- `src/main/session-manager.ts:336-340`: a hook event whose Claude id equals the session's known id calls
  `names.nudge(sessionId)` while `session.name === null`.
- `src/main/session-name-poller.ts:60-62`: `nudge` calls `#schedule()` for any watched session.
- `src/main/session-name-poller.ts:90-96`: `#schedule` arms the 1 s debounce, which runs `#run()`.
- `src/main/session-name-poller.ts:98-105`: `#run` starts `#call()` unless one is in flight; a nudge during a
  call sets `#pendingRerun`, and `settle` (`session-name-poller.ts:138-148`) schedules the rerun when the call
  ends, whatever the listing answered.

Nothing in that path remembers that the previous listing did not name the session, so while the session
emits hook events the listings run back to back: one 2 s call, a 1 s debounce, the next call.

### Stop-rule verdict (MAGIT-30)

**No spawn stall over 50 ms in the bench; the owner was told (issue #151 comment of 2026-10-03), and the
backoff proceeds.** The stall half of the issue is met on `main` by #154 (31.7 ms against 50 ms). The
listing half is back to back at the lines above, so the stop condition (no stall *and* no back-to-back
listing) does not hold.
