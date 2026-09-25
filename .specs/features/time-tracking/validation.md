## Validation: time-tracking - PASS

# Time Tracking Validation

**Date**: 2026-09-16
**Spec**: `.specs/features/time-tracking/spec.md` (TIME-01..49)
**Diff range**: `main..HEAD` = `b1c6fdf` (docs spec) .. `41ae836` (M21 retry test), 35 commits
**Iteration**: 3 of 3 (final fix → re-verify)
**Verifier**: independent sub-agent (author ≠ verifier); read-only over the real tree, mutations in a temporary git worktree

**Verdict (iteration 3): PASS.** Fix 6 (`41ae836`, test only) makes the TIME-14 retry test append once more after the retry lands (`src/main/time-log-store.test.ts:178` - `toEqual([period('b'), period('c'), period('d')])`), which kills M21. Production code is byte-identical to iteration 2. Gate exits 0/0/0. The store and tracker mutants all die except M25, which is equivalent. All 49 criteria have test or hand evidence. The remaining items (owner smoke run, live suspend/resume and minute refresh, TIME-39/TIME-36 wording) are not defects and do not block PASS - see *Non-blocking items* in the Summary.

*Iteration 2 verdict reason (resolved):* the sensor found M21 - a successful `rewrite` that stops clearing `TimeLogStore.unwritten` passed every test.

---

## Iteration History

| Iter | HEAD | Gate (typecheck / lint / test exit) | Sensor | Verdict | Blocking gaps |
| ---- | ---- | ----------------------------------- | ------ | ------- | ------------- |
| 1 | `f1794f1` | 0 / **1** (2 errors) / 0 - 861 tests | 17/20 (M6, M13, M19 survived) | FAIL | lint red; TIME-14 rewrite not retried; sidecar writes and atomicity unasserted; TIME-33 unexercised |
| 2 | `4d53498` | 0 / 0 / 0 - 865 tests | 24/26 run (M21 survived, M25 equivalent) | FAIL | M21: `unwritten` not proven cleared after a successful retry |
| 3 | `41ae836` | 0 / 0 / 0 - 865 tests | store/tracker regression 15/16 run (M25 equivalent, 0 survived) | PASS | none |

Fix commits reviewed in iteration 2 (`f1794f1..4d53498`):

| Commit | Fix plan | Judgment |
| ------ | -------- | -------- |
| `c81c92b` fix(time): clear the react-hooks lint errors | Fix 1 | ✅ Lint exit 0 (also 0 with `--no-cache` on the changed files). `useNow` catch-up deferred with `setTimeout(tick, 0)` (`src/renderer/src/lib/use-time.ts:64`); `HoursView` `live = snapshot.open.length > 0` (`src/renderer/src/components/HoursView.tsx:55`) - still satisfies TIME-42 ("at least once per minute"); only cost is harmless minute ticks on a non-current week |
| `0383ce0` fix(time): retry a failed log rewrite before the next append | Fix 2 | ✅ Behavior correct by reading (`src/main/time-log-store.ts:86-87,107,110`); ⚠️ tests do not discriminate clearing `unwritten` (M21) |
| `8d1feeb` test(time): assert the open sidecar after every transition | Fix 3 | ✅ Kills M6, M19 and new M27 |
| `907b1e1` test(time): prove a failed write leaves the previous file intact | Fix 4 | ✅ Kills M13 |
| `4d53498` test(time): cover week navigation in the time smoke | Fix 5 | ✅ TIME-33 asserted in the smoke (`scripts/smoke-time.mjs:252-261`); agent-run 26/26 recorded in tasks.md T26. TIME-42 cadence still not exercised live |

The tasks.md "Gate correction" notes added on T15 and T24 are accurate.

Fix commit reviewed in iteration 3 (`4d53498..41ae836`):

| Commit | Fix plan | Judgment |
| ------ | -------- | -------- |
| `41ae836` test(time): assert appends resume after a rewrite retry lands | Fix 6 | ✅ Test only (`src/main/time-log-store.test.ts:176-182`, +8 lines); no production file changed; kills M21 in the scratch run |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T14 | ✅ Done | - |
| T15 | ✅ Done | Lint gate now green (was false in iter 1; correction noted in tasks.md) |
| T16-T23 | ✅ Done | Deviations judged acceptable (below) |
| T24 | ✅ Done | Lint gate now green (was false in iter 1) |
| T25 | ✅ Done | - |
| T26 | ⚠️ Partial | Agent-run smoke 26/26; owner run still pending |

### Deviations judged

| Task | Deviation | Judgment |
| ---- | --------- | -------- |
| T17-T20 | Prop threading moved from T21 into each surface task (lesson L-001) | ✅ Acceptable |
| T19 | Worktree total as a pill in the status row, not inside `<h1>` | ✅ Acceptable - TIME-25 fixes the pane, not the element |
| T20 | Task total moved from footer to card header | ✅ Acceptable - overflow evidence recorded |
| T23 | Own `PeriodRow.css`; edit acts on the whole period for a midnight-clipped piece | ✅ Acceptable |
| T8 | "Owner's preview byte-for-byte" - preview never recorded in the spec | ⚠️ Spec-precision gap - see TIME-39 |

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ PASS (test asserts the spec outcome) · 🖐 Hand-verified (UI/wiring layer: cited implementation plus recorded smoke/hand evidence, per TESTING.md) · ⚠️ gap · ❌ not covered

### P1: Sessions record dated periods

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| TIME-01 | PTY start (spawn/duplicate/respawn) opens a period starting at the start instant | `src/main/time-tracker.test.ts:96` - `snapshot().open).toEqual([{ ..., start: iso(T0), lastSeen: iso(T0) }])`; `src/main/session-manager.test.ts:446,454,465` - `expect(calls).toEqual([\`started:${id}:Claude:${CWD}\`])` | ✅ PASS |
| TIME-02 | stop / exit / pause closes with end = that instant and appends | `src/main/time-tracker.test.ts:125` - `appended).toEqual([expected])` (end `T0+2min`); `:175` pause end; `src/main/session-manager.test.ts:474,481` - `calls.slice(1)).toEqual([\`ended:${id}\`])`; `src/main/time-log-store.test.ts:68` round-trip | ✅ PASS |
| TIME-03 | session id, agent, cwd, workspace, repo, branch, task id, pinned title, captured at open | `src/main/time-snapshot.test.ts:14` - full `toEqual`; `:57` - `.taskTitle).toBe('Fix login redirect')`; `src/main/time-tracker.test.ts:95` - `resolved).toEqual([cwd])` | ✅ PASS |
| TIME-04 | sidecar rewritten with last-seen at least every 60 s | `src/main/time-tracker.test.ts:291` - `lastSeen` `iso(T0 + 60 * SEC)`; `:263-280` - exactly one write per transition with the open list; interval `src/main/index.ts:283` 🖐 (hand crash test, tasks.md T26) | ✅ PASS |
| TIME-05 | at start, sidecar periods closed at last-seen, appended, sidecar emptied | `src/main/time-tracker.test.ts:314-316` - `appended).toEqual([closed])`, `openWrites).toEqual([[]])`; order `src/main/index.ts:274` before `:293` | ✅ PASS |
| TIME-06 | suspend closes every open period at the suspend instant | `src/main/time-tracker.test.ts:211`; `:271-272` sidecar emptied; wiring `src/main/index.ts:284` never exercised live | ✅ logic / ⚠️ wiring unexercised |
| TIME-07 | resume opens a period for every running, unpaused session | `src/main/time-tracker.test.ts:231`; `:275-276`; wiring `src/main/index.ts:285` never exercised live | ✅ logic / ⚠️ wiring unexercised |
| TIME-08 | lock/unlock leave periods unchanged | `src/main/time-tracker.test.ts:395` - `api.filter(/lock/i)).toEqual([])`; no subscription `src/main/index.ts:286` | ✅ PASS (by absence) |
| TIME-09 | quit closes every open period at the quit instant | `src/main/time-tracker.test.ts:328` - `[['s2', iso(T0 + MIN)], ['s1', iso(T0 + 2 * MIN)]]`; wiring `src/main/index.ts:429` | ✅ PASS |
| TIME-10 | open/close independent of activity state | By construction: `src/main/time-tracker.ts:45-46`, `src/main/session-manager.ts:257,270` | 🖐 by construction |
| TIME-11 | length < 1 s discarded | `src/main/time-tracker.test.ts:147` (999 ms → `[]`), `:157` (1 s kept), `:166` (reversed clock) | ✅ PASS |
| TIME-12 | unresolvable snapshot → nulls, period still recorded | `src/main/time-snapshot.test.ts:61` all-null `toEqual`; smoke `scripts/smoke-time.mjs:164` | ✅ PASS |
| TIME-13 | invalid line skipped, logged once, valid kept | `src/main/time-log-store.test.ts:91-92` - `{ periods: [a, b], skipped: 3 }`, `logged).toHaveLength(1)` | ✅ PASS |
| TIME-14 | write failure → keep in memory, log, retry on next write | Append: `src/main/time-log-store.test.ts:141`. Rewrite (iter 2): `:169,174` - failed rewrite logged, next append leaves `[period('b'), period('c')]`; `:178` - one more append after the retry lands leaves `[period('b'), period('c'), period('d')]` (iter 3, kills M21); `:196` - survives a further failing append. Implementation `src/main/time-log-store.ts:86-87,107,110` | ✅ PASS |

### P1: Pause a session

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| TIME-15 | **Pause time** shown while running and not paused | `src/renderer/src/components/AgentsView.tsx:204-221`; smoke `scripts/smoke-time.mjs:200` | 🖐 Hand-verified |
| TIME-16 | Pause closes the open period and marks paused | `src/main/time-tracker.test.ts:175-176`; smoke `scripts/smoke-time.mjs:200-201` | ✅ PASS |
| TIME-17 | **Resume time** shown while paused; counters stop | `src/renderer/src/lib/time-totals.test.ts:79-80` - `toBe(HOUR)` at 10:05 and 15:00; `src/renderer/src/components/AgentsView.tsx:205-212`; smoke `scripts/smoke-time.mjs:209` frozen counter (rerun 26/26) | ✅ totals / 🖐 control |
| TIME-18 | Resume opens a new period and clears the mark | `src/main/time-tracker.test.ts:188-189`; `:267-268`; smoke `scripts/smoke-time.mjs:216` | ✅ PASS |
| TIME-19 | respawn / restart start unpaused | `src/main/time-tracker.test.ts:345` - `paused).toEqual([])`; pause not persisted (`src/main/time-tracker.ts:34`) | ✅ PASS |
| TIME-20 | PTY keeps running and receiving input while paused | Tracker never touches the PTY; hand evidence tasks.md T21 | 🖐 Hand-verified |
| TIME-21 | resume-from-suspend skips paused sessions | `src/main/time-tracker.test.ts:231-232`; `:242` | ✅ PASS |

### P1: Live counters and totals

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| TIME-22 | row `hh:mm:ss`, ticking each second while open | `src/renderer/src/lib/time-format.test.ts:18` - `toBe('02:28:05')`; row `src/renderer/src/components/SessionRail.tsx:313`; tick `src/renderer/src/components/TimeCounter.tsx:29` via `src/renderer/src/lib/use-time.ts:64-65`; smoke `scripts/smoke-time.mjs:180-181` (regex + advances; rerun after the `useNow` change) | ✅ format / 🖐 surface - no regression |
| TIME-23 | detail bar `hh:mm:ss` with current-run tooltip | `src/renderer/src/lib/time-totals.test.ts:94` - `toBe(20 * MIN)`; `src/renderer/src/components/AgentsView.tsx:197-202`; `src/renderer/src/components/TimeCounter.tsx:35` | ✅ logic / 🖐 surface - no regression |
| TIME-24 | session total = sum of all its periods, open to now | `src/renderer/src/lib/time-totals.test.ts:74` | ✅ PASS |
| TIME-25 | worktree `hh:mm` = case-insensitive cwd union | `src/renderer/src/lib/time-totals.test.ts:122` - `toBe(90 * MIN)`; `src/renderer/src/lib/time-format.test.ts:33`; surface `src/renderer/src/components/WorktreeDetail.tsx:232` | ✅ PASS / 🖐 surface |
| TIME-26 | task `hh:mm` on card and task-group head = union by id | `src/renderer/src/lib/time-totals.test.ts:145` - `toBe(2 * HOUR)`; `src/renderer/src/components/TasksPane.tsx:180`, `src/renderer/src/components/SessionRail.tsx:199` | ✅ PASS / 🖐 surface |
| TIME-27 | orphan-group `hh:mm` = union by group cwd | `src/renderer/src/components/SessionRail.tsx:176,217` (same `worktreeTotalMs` as TIME-25); hand T21 | 🖐 Hand-verified |
| TIME-28 | two sessions 09-10 same worktree → 1h00 | `src/renderer/src/lib/time-totals.test.ts:111` - `toBe(HOUR)`; `src/shared/time-intervals.test.ts:16` | ✅ PASS |
| TIME-29 | stopped/paused/removed keep recorded periods | `src/renderer/src/lib/time-totals.test.ts:127`, `:79-80` | ✅ PASS |
| TIME-30 | no time → `00:00` / `00:00:00` | `src/renderer/src/lib/time-format.test.ts:10,28`; `src/renderer/src/lib/time-totals.test.ts:84,131,149`; `src/renderer/src/components/TimeCounter.tsx:53-61` | ✅ PASS |

### P2: Hours view for booking

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| TIME-31 | fifth segment **Hours** after Workflows, persisted | `src/shared/config.ts:37`; `src/renderer/src/components/TopBar.tsx:135-144`; `src/renderer/src/App.tsx:366`; smoke `scripts/smoke-time.mjs:231` | 🖐 Hand-verified |
| TIME-32 | current local week Mon-Sun, range + total in header | `src/renderer/src/lib/hours-report.test.ts:55,59` - `{ start: at(14, 0), end: at(21, 0) }`; `:189-190`; smoke `scripts/smoke-time.mjs:252` - range `=== weekLabel(0)` | ✅ PASS |
| TIME-33 | ◀ ▶ previous/next week, **This week** returns | `src/renderer/src/components/HoursView.tsx:65-71`; smoke `scripts/smoke-time.mjs:255,258,261` - range `=== weekLabel(-1)`, `weekLabel(0)`, `weekLabel(1)` (agent-run 26/26) | 🖐 Hand-verified (iter 2) |
| TIME-34 | days with time, newest first; day total = union | `src/renderer/src/lib/hours-report.test.ts:75` - `[16, 14]`; `:85` - `toBe(3 * HOUR)` | ✅ PASS |
| TIME-35 | group by task id; task-less per cwd `No task · <leaf>`; union totals | `src/renderer/src/lib/hours-report.test.ts:100-106`, `:117-120` | ✅ PASS |
| TIME-36 | merged blocks (overlap or gap ≤ 60 s), `HH:MM–HH:MM` + duration | `src/shared/time-intervals.test.ts:67,75`; `src/renderer/src/lib/hours-report.test.ts:143-145,157-160` | ✅ PASS |
| TIME-37 | across midnight split onto both days | `src/shared/time-intervals.test.ts:107`; `src/renderer/src/lib/hours-report.test.ts:165-168` | ✅ PASS |
| TIME-38 | expanded line lists raw periods with start, end, duration, agent | `src/renderer/src/lib/hours-report.test.ts:206-212`; `src/renderer/src/components/PeriodRow.tsx:93-97`; smoke `scripts/smoke-time.mjs:304,309` | ✅ PASS |
| TIME-39 | clipboard text in the exact format | `src/renderer/src/lib/hours-copy.test.ts:28-34` - full three-line `toBe`; `:45-49` chronological; smoke `scripts/smoke-time.mjs:274,280` | ✅ PASS / ⚠️ Spec-precision gap |
| TIME-40 | label: live title, then snapshot; `Task #<id>`; `No task · <leaf>` | `src/renderer/src/lib/hours-report.test.ts:129-132`, `:104`, `:118`; `src/renderer/src/App.tsx:123` | ✅ PASS |
| TIME-41 | `Copied` for 1.2 s | `src/renderer/src/lib/terminal-keys.ts:29`; `src/renderer/src/components/HoursView.tsx:142`; smoke `scripts/smoke-time.mjs:270,286` | 🖐 Hand-verified |
| TIME-42 | open period in shown week → refresh ≥ once per minute | `src/renderer/src/lib/hours-report.test.ts:174` - `toBe(80 * MIN)`; timer `src/renderer/src/components/HoursView.tsx:55-56` (now ticks whenever any period is open - a superset of the spec condition). Cadence not exercised live | ✅ logic / ⚠️ cadence unexercised |
| TIME-43 | empty week → `No time recorded this week.` | `src/renderer/src/lib/hours-report.test.ts:65`; `src/renderer/src/components/HoursView.tsx:120` | ✅ logic / 🖐 text |

### P2: Correct a period

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| TIME-44 | delete removes from log and all totals | `src/main/time-tracker.test.ts:423-425`; smoke `scripts/smoke-time.mjs:323` | ✅ PASS |
| TIME-45 | save new bounds persists and reflects | `src/main/time-tracker.test.ts:438-440` | ✅ PASS |
| TIME-46 | reject start ≥ end, end in future, < 1 s; persist nothing | `src/main/time-tracker.test.ts:461-468` (it.each ×4, exact `error`, `rewrites).toEqual([])`); `:448` end == now accepted; `src/renderer/src/components/PeriodRow.tsx:178` | ✅ PASS |
| TIME-47 | open period offers neither edit nor delete | `src/main/time-tracker.test.ts:476-479`; `src/renderer/src/components/PeriodRow.tsx:99-100` | ✅ PASS |
| TIME-48 | atomic persist (old or new, never truncated) | `src/main/time-log-store.test.ts:157-158` - log and sidecar content `toBe(logBefore)` / `toBe(openBefore)` after a write that fails before rename (iter 2; kills M13) | ✅ PASS |
| TIME-49 | stale target rejected and view refreshed | `src/main/time-tracker.test.ts:489-492`; refresh `src/renderer/src/lib/use-time.ts:42,48` | ✅ PASS |

**Coverage summary (iter 3)**: 49 criteria. **Test-asserted: 39**, all discriminating on the mutants run. **Hand-verified only: 10** (TIME-10 by construction; TIME-15, 20, 27, 31, 33, 41 with smoke or hand evidence; the surface halves of 17, 22, 23). **No runtime evidence: 0**. Non-blocking notes: TIME-06/07 wiring and TIME-42 cadence not exercised live; TIME-39 and TIME-36 spec-precision gaps.

### Spec-precision gaps

- **TIME-39 / T8**: the preview the owner "selected verbatim" (Q19) is not recorded in the spec. The test asserts the TIME-39 wording exactly (header, `—` and `–`, two-space columns, padding). The spec leaves the line terminator open (the smoke shows the Windows clipboard returns CRLF), along with the trailing newline and hour padding in the total. Not a defect, but T8's byte-for-byte claim can't be checked.
- **TIME-36 open block**: an open block renders `HH:MM–now` (`src/renderer/src/components/HoursView.tsx:222`), and the spec doesn't cover open blocks. Minor.

---

## Discrimination Sensor

Scratch: temporary `git worktree add --detach <scratch>/mut2 HEAD` (`4d53498`), `node_modules` junctioned. For each mutant: apply it, run the file with `npx vitest run <file>`, restore the file. All 20 iteration-1 mutants were re-run as a regression pass, plus new mutants on the fix code.

| # | File:line | Mutation | Test file | Iter 1 | Iter 2 | Iter 3 |
| - | --------- | -------- | --------- | ------ | ------ | ------ |
| M1 | `src/shared/time-intervals.ts:16` | merge gap `<=` → `<` | `time-intervals.test.ts` | ✅ Killed | ✅ Killed | not re-run (source and tests unchanged since iter 1) |
| M2 | `src/shared/time-intervals.ts:24` | union → plain sum | `time-intervals.test.ts` | ✅ Killed | ✅ Killed | not re-run (source and tests unchanged since iter 1) |
| M3 | `src/renderer/src/lib/time-format.ts:25` | `formatHmCompact` floor → round | `time-format.test.ts` | ✅ Killed | ✅ Killed | not re-run (source and tests unchanged since iter 1) |
| M4 | `src/main/time-tracker.ts:206` | discard `< 1000` → `<= 1000` | `time-tracker.test.ts` | ✅ Killed | ✅ Killed | ✅ Killed |
| M5 | `src/main/session-manager.ts:270` | `ended` fires when not running | `session-manager.test.ts` | ✅ Killed | ✅ Killed | not re-run (source and tests unchanged since iter 1) |
| M6 | `src/main/time-tracker.ts:95` | `pause` skips the sidecar write | `time-tracker.test.ts` | ❌ Survived | ✅ Killed | ✅ Killed |
| M7 | `src/main/time-log-store.ts:90` | failed-append queue never flushed | `time-log-store.test.ts` | ✅ Killed | ✅ Killed | ✅ Killed |
| M8 | `src/renderer/src/lib/hours-report.ts:51` | week starts on Sunday | `hours-report.test.ts` | ✅ Killed | ✅ Killed | not re-run (source and tests unchanged since iter 1) |
| M9 | `src/renderer/src/lib/hours-report.ts:127` | snapshot title wins over live title | `hours-report.test.ts` | ✅ Killed | ✅ Killed | not re-run (source and tests unchanged since iter 1) |
| M10 | `src/renderer/src/lib/hours-copy.ts:17` | copy lines unsorted | `hours-copy.test.ts` | ✅ Killed | ✅ Killed | not re-run (source and tests unchanged since iter 1) |
| M11 | `src/main/time-tracker.ts:122` | resume-from-suspend reopens paused | `time-tracker.test.ts` | ✅ Killed | ✅ Killed | ✅ Killed |
| M12 | `src/main/time-tracker.ts:61` | recover closes at now, not `lastSeen` | `time-tracker.test.ts` | ✅ Killed | ✅ Killed | ✅ Killed |
| M13 | `src/main/time-log-store.ts:150-151` | whole-file writes in place (no tmp + rename) | `time-log-store.test.ts` | ❌ Survived | ✅ Killed | ✅ Killed |
| M14 | `src/renderer/src/lib/time-totals.ts:45` | worktree cwd match case-sensitive | `time-totals.test.ts` | ✅ Killed | ✅ Killed | not re-run (source and tests unchanged since iter 1) |
| M15 | `src/main/time-tracker.ts:168` | adjust rejects end exactly at now | `time-tracker.test.ts` | ✅ Killed | ✅ Killed | ✅ Killed |
| M16 | `src/main/time-tracker.ts:62` | recover does not empty the sidecar | `time-tracker.test.ts` | ✅ Killed | ✅ Killed | ✅ Killed |
| M17 | `src/renderer/src/lib/hours-report.ts:84` | no local-midnight split | `hours-report.test.ts` | ✅ Killed | ✅ Killed | not re-run (source and tests unchanged since iter 1) |
| M18 | `src/main/time-tracker.ts:103` | resume opens a period during suspend | `time-tracker.test.ts` | ✅ Killed | ✅ Killed | ✅ Killed |
| M19 | `src/main/time-tracker.ts:104` | `resume` skips the sidecar write | `time-tracker.test.ts` | ❌ Survived | ✅ Killed | ✅ Killed |
| M20 | `src/main/time-snapshot.ts:38` | detached `HEAD` kept as branch | `time-snapshot.test.ts` | ✅ Killed | ✅ Killed | not re-run (source and tests unchanged since iter 1) |
| M21 | `src/main/time-log-store.ts:107` | successful `rewrite` does not clear `unwritten` | `time-log-store.test.ts` | - | ❌ **Survived** (10/10 pass) | ✅ **Killed** (1) |
| M22 | `src/main/time-log-store.ts:110` | failed `rewrite` does not set `unwritten` | `time-log-store.test.ts` | - | ✅ Killed (2) | ✅ Killed |
| M23 | `src/main/time-log-store.ts:86` | `append` ignores `unwritten` | `time-log-store.test.ts` | - | ✅ Killed (2) | ✅ Killed |
| M24 | `src/main/time-log-store.ts:87` | retry drops the period being appended | `time-log-store.test.ts` | - | ✅ Killed (2) | ✅ Killed |
| M25 | `src/main/time-log-store.ts:109` | failed `rewrite` keeps stale `pending` | `time-log-store.test.ts` | - | ➖ Equivalent (10/10 pass) | ➖ Equivalent (10/10 pass) |
| M27 | `src/main/time-tracker.ts:124` | `resumeFromSuspend` skips the sidecar write | `time-tracker.test.ts` | - | ✅ Killed (1) | ✅ Killed |

**Sensor depth**: expanded (26 manual mutants; the feature records billable hours, so data integrity matters)
**Sensor outcome (iter 2)**: 24 killed, 1 survived (M21), 1 equivalent (M25) - failed on M21.
**Sensor outcome (iter 3)**: regression pass over the 16 store, tracker and session-lifecycle mutants in a fresh scratch worktree at `41ae836` - 15 killed (M21 included), 0 survived, 1 equivalent (M25). The other 10 mutants (M1-M3, M5, M8-M10, M14, M17, M20) were not re-run: none of their source or test files changed after iteration 2, where all were killed. **Cumulative: 25 of 26 killed, 1 equivalent, 0 survived.**

- **M21 (medium, real data loss; killed in iter 3)**: say a rewrite fails, so `unwritten = [b]`, and the next append of `c` retries and succeeds. Under the mutant `unwritten` stays `[b]`, so the append of `d` rewrites the log as `[b, d]` and `c` is lost. Likewise, a later successful edit rewrite would be undone by the next append. The two retry tests (`src/main/time-log-store.test.ts:161-189`) stop after the first successful retry, so they couldn't see this. Iteration 3 adds that second append (`src/main/time-log-store.test.ts:176-182`), and the mutant now fails it.
- **M25 is equivalent** (reconfirmed in iter 3): while `unwritten` is set, `append` never reads `pending`, and the successful rewrite that clears `unwritten` also clears `pending`. No observable difference.

Isolation: junction removed, `git worktree remove --force`, `git worktree prune`; `git worktree list` shows only the main tree; real-tree `git status --porcelain` matches the pre-sensor state (only the pre-existing untracked folder plus this report and the lessons files).

---

## Gate Check

Decided by exit code, each command run separately at `41ae836` (iteration 3):

| Command | Exit | Detail |
| ------- | ---- | ------ |
| `npm run typecheck` | **0** | node + web |
| `npm run lint` | **0** | 0 errors, 18 warnings (prettier formatting, none in the changed lines); `npx eslint --no-cache` on the changed files also exits 0 |
| `npm test` | **0** | 865 passed, 0 failed, 0 skipped, 54 files |

- **Test count before feature**: 748
- **After iteration 1**: 861 (+113)
- **After iteration 2**: 865 (+4: 3 store tests, 1 tracker test); no test removed or weakened
- **After iteration 3**: 865 (+0: an existing test was extended with one more append and assertion)

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ Retry adds one field and one branch |
| Surgical changes | ✅ Fix commits touch only the flagged files |
| No scope creep | ✅ |
| Matches patterns | ✅ Lint clean; DI fakes; real-temp-dir store tests |
| Spec-anchored outcome check | ✅ All asserted values match the spec; TIME-39/TIME-36 spec-precision gaps flagged (non-blocking) |
| Per-layer Coverage Expectation | ✅ File store row "append failure queue + retry" now includes the retry-state reset (M21 killed) |
| Every test maps to a spec requirement | ✅ New tests name TIME-04/05/14/48 |
| Documented guidelines followed | `.specs/codebase/TESTING.md`, tasks.md matrix, lessons L-001/L-005 - ✅ |

Robustness note (not blocking, unchanged since iter 1): `TimeLogStore.readOpen` (`src/main/time-log-store.ts:121`) accepts any array without validating the entries.

`useNow` note (not blocking): the deferred catch-up (`src/renderer/src/lib/use-time.ts:64`) also fires once when ticking stops. That is harmless because a counter with no open period doesn't depend on `now`.

---

## Edge Cases

- [x] Crash after a suspend that never resumed ends at last-seen - `src/main/time-tracker.test.ts:314`
- [x] Clock moved backwards → discarded - `src/main/time-tracker.test.ts:166`
- [x] Removed session keeps its time - `src/renderer/src/lib/time-totals.test.ts:127`
- [x] Two pins share a task id → one union by id - `src/renderer/src/lib/time-totals.ts:51`
- [x] Worktree deleted keeps snapshot/task grouping - `src/renderer/src/lib/hours-report.test.ts:100`
- [x] Corrupt `time-open.json` backed up as `.bak-<epoch>` - `src/main/time-log-store.test.ts:122-126`

---

## Interactive UAT Results

Not performed by the Verifier (no app launch allowed). The agent-run smoke passed 26/26 after the fixes, and a hand crash-recovery test is recorded in tasks.md T26. The owner run is still pending. Suspend/resume, screen lock and the minute refresh were never exercised live.

---

## Fix Plans

### Fix 6 (iter 2): Discriminate clearing the rewrite retry state (Major, M21 / TIME-14) - ✅ resolved in `41ae836`

- **Root cause**: both retry tests end at the first successful retry, so they never observe whether `unwritten` was cleared.
- **Fix task**: in `src/main/time-log-store.test.ts`, extend the retry test (or add one) so that after the successful retrying `append(period('c'))` it calls `append(period('d'))` and asserts `readPeriods().periods` equals `[b, c, d]`. Optionally also cover "failed rewrite, then a successful `rewrite(full)`, then an append keeps the full list".
- **Verify**: the M21 mutant (drop `this.unwritten = null` on success) fails the test; `npm test` exits 0.
- **Priority**: Major (test-only)

### Carried, non-blocking (open follow-ups, not fix tasks)

- Owner run of `scripts/smoke-time.mjs`, recorded here (T26).
- Live exercise of suspend/resume (TIME-06/07) and the minute refresh (TIME-42) when convenient.
- Spec amendment: paste the literal Q19 preview, including line endings (TIME-39).

---

## Requirement Traceability Update

| Requirement | Iter 1 | Iter 2 | Iter 3 |
| ----------- | ------ | ------ | ------ |
| TIME-01..13, 15..32, 34..47, 49 | ✅ Verified | ✅ Verified | ✅ Verified |
| TIME-14 | ❌ Needs Fix | ⚠️ Needs a discriminating test (Fix 6) | ✅ Verified |
| TIME-33 | ⚠️ Needs hand evidence | ✅ Verified (smoke) | ✅ Verified (smoke) |
| TIME-48 | ⚠️ Test not discriminating | ✅ Verified | ✅ Verified |
| TIME-06, TIME-07 | ✅ Logic; wiring unexercised | unchanged | ✅ Verified (logic tested; shell wiring hand-verified by convention, not exercised live) |
| TIME-39 | ✅ with spec-precision gap | unchanged | ✅ Verified; spec-precision gap flagged |

(spec.md not edited by the Verifier.)

---

## Summary

**Overall**: ✅ Ready (iteration 3 of 3)

**Spec-anchored check**: 39 test-asserted, 10 hand-verified, 0 without evidence; 2 spec-precision gaps flagged (TIME-39, TIME-36 open block)
**Sensor**: cumulative 25/26 killed, 0 survived, 1 equivalent (M25); iteration 3 regression pass 15/16 killed + M25 equivalent
**Gate**: typecheck 0, lint 0, test 0 (865 passed, 54 files)

**What works**: the full P1/P2 behavior is covered with discriminating tests where the testing convention calls for them - interval math, formatters, totals, weekly report, copy text, the tracker state machine, persistence with retry and atomic writes, and the session lifecycle observer. UI surfaces and wiring have recorded smoke and hand evidence (agent-run smoke 26/26).

**Non-blocking items - judged against `validate.md`:**

- **Owner smoke run (T26)** and **in-app exercise of suspend/resume (TIME-06/07) and the minute refresh (TIME-42)**: these belong to interactive UAT with the owner, which validate.md keeps separate from the Verifier's gate. Their logic is unit-tested with exact values (`src/main/time-tracker.test.ts:211,231`, `src/renderer/src/lib/hours-report.test.ts:174`). The `powerMonitor` and interval wiring is a thin Electron shell, which the tasks.md matrix marks "hand-verified, build gate only", and it is cited at `src/main/index.ts:283-285`. Nothing is missing evidence, and no mutant survives. **Does not block PASS.**
- **TIME-39 / TIME-36 wording**: flagged as spec-precision gaps, which is the handling validate.md prescribes ("mark and flag, do not silently pass"). The asserted values match the spec's literal text, so no criterion fails. Recommended spec amendment: paste the Q19 preview literally, including line endings, and state how an open block renders. **Does not block PASS.**

**Next steps**: an owner UAT pass (smoke run, one suspend/resume cycle, a copy pasted into the booking tool) and an optional spec wording amendment. No fix tasks remain.
