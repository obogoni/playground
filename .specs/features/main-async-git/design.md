# Main Async Git Design

**Spec**: `.specs/features/main-async-git/spec.md`
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01). Executes after `perf-diagnostics` (#147); T1's baseline can stop it.
**Reconciled 2026-10-03** (owner approved, after #147 shipped as PR #162): #154 already ships the
asynchronous period read (PERF-21: `readGitAsync` through `git()`, `resolveSnapshotAsync` and
`#reattribute` in `time-tracker.ts`). What is left is the name poller below, and deleting the uncalled
synchronous `readGit`. The sections on the tracker, the provisional fields, the bench runs and the
mutants describe the plan of 2026-10-01 and are kept as history; they are not executed.

---

## Architecture Overview

Two independent changes in main, measured with #147's bench.

1. **The period's git read becomes a promise.** `TimeTracker` opens a period at once with the fields a failed
   read gives (the provisional fields), starts the read, and applies its result when it settles, but only to
   the period it was started for. `readGit` runs through the git runner, so #147's diagnostics count it as an
   ordinary git process and `git.sync` falls to 0.
2. **The name poller backs off per session.** `SessionNamePoller` keeps a miss count and a due time for each
   watched session. Every trigger (the debounced watch or nudge, the 30 s tick, the coalesced rerun) is
   checked at the instant the listing would start: it starts only when a session that asked for it, or for a
   tick any watched session, is eligible. Eligible means 0 misses (named, or not yet listed) or due.

```mermaid
sequenceDiagram
    participant SM as SessionManager
    participant TT as TimeTracker
    participant RS as resolveSnapshot (index.ts)
    participant G as git() runner
    participant ST as TimeLogStore
    SM->>TT: started / resume / taskChanged / resumeFromSuspend
    TT->>TT: run.open = provisional period P (id p1)
    TT->>RS: resolveSnapshot(cwd) (promise, started in the same call)
    TT->>ST: writeOpen([... P provisional])
    TT-->>SM: returns (no wait)
    RS->>G: git(cwd, rev-parse ..., timeoutMs 2000)
    G-->>RS: stdout (or rejection: nulls)
    RS-->>TT: snapshot fields
    alt run.open.id === p1 and fields differ
        TT->>TT: run.open = P with fields (link applied, AD-048)
        TT->>ST: writeOpen(...); emit time:changed
    else period closed, replaced, or fields equal
        TT->>TT: drop the result
    end
```

**Approaches considered** for the tracker (all deliver the same scope):

1. **Provisional open, patch by period id (chosen).** The open path stays synchronous; the read's
   continuation looks up the session's run and patches only when `run.open.id` is the id it was started for.
   Every way a period ends (close, pause, suspend, task change, respawn, quit) already replaces or clears
   `run.open`, so one comparison covers all of them, and nothing new is persisted.
2. **Hold the period until the read settles.** Open nothing until the fields arrive. Rejected: the counter
   and the sidecar would start up to 2 s late, and a close during the wait needs its own queue.
3. **Hold the close until the read settles.** Patch a closed period before appending it. Rejected: the owner
   decided a period closed first keeps what it had, and delaying `append` would race `closeAll` on quit.

For the poller, the alternative to a check at start time was one timer per session armed at its due time.
Rejected: it starts listings for an idle unnamed session that no hook event asks about, and needs a timer per
watched session.

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --------- | -------- | ---------- |
| The single git runner | `src/main/git.ts:15-35` (`git`) | `readGit` calls `git(cwd, [...SNAPSHOT_GIT_ARGS], { timeoutMs: 2000 })`; `windowsHide`, `GIT_TERMINAL_PROMPT=0` and the 64 MiB ceiling come with it (AD-023) |
| #147's runner probe | `src/main/git.ts` after #147 T6 (`diagnostics().gitStarted(cwd, args)`) | Counts the read as a `rev-parse` process with no extra code; the synchronous probe #147 T8 put in `readGit` goes away with `execFileSync` |
| `buildSnapshot` and the unreadable-git result | `src/main/time-snapshot.ts:18-47` | Unchanged; `NO_SNAPSHOT` is exported so the tracker builds the provisional fields from the same nulls |
| The link rule | `src/main/period-task.ts:17-29` (`withSessionTask`) | Applied twice: over `NO_SNAPSHOT` at open, over the read's snapshot at settle |
| The tracker's change path | `src/main/time-tracker.ts:307-314` (`#changed`, `#writeOpen`) | A settled read that changes fields calls `#changed()`: one sidecar rewrite and one push |
| Tracker test harness | `src/main/time-tracker.test.ts:18-87` (`fakeStore`, `setup`) | The fake `resolveSnapshot` returns a promise; a `flush()` helper and a deferred mode are added; every existing `expect` stays as it is |
| Poller state and call | `src/main/session-name-poller.ts:36-180` | `#watched` grows to per-session state; `#pendingRerun` becomes the asked set plus a tick flag; `#call` and `settle` keep their shape |
| Poller test harness | `src/main/session-name-poller.test.ts:26-121` (`makeFakeSpawn`, `makePoller`, `watchedAndListed`, fake timers) | Drives the new tests; `vi.useFakeTimers()` also fakes `Date.now`, which the poller reads for due times |
| The bench | `scripts/bench-sessions.mjs`, `scripts/bench-summary.mjs` after #147 T13-T15 | `--sessions 6 --minutes 1 --json`; the `spawn` row's `loop p99/max`, `git n`, `sync`; the round-trip line; `--keep` for the log check |
| The mutation procedure | `.specs/features/perf-diagnostics/tasks.md`, Gate Check Commands | Copy to `.orig`, write the mutant, restore in `finally`, rebuild, compare `git status --porcelain` |

### Integration Points

| System | Integration Method |
| ------ | ------------------ |
| `TimeTracker` wiring | `src/main/index.ts:508-522`: `resolveSnapshot: async (cwd) => buildSnapshot({ cwd, ...(await readGit(cwd)), workspacePaths, pinnedTitles })`; the workspace list and pinned titles are read when the read settles |
| Time log and sidecar | Unchanged store calls: `append` only on close, `writeOpen` on open, patch, heartbeat and close; `v: 1` lines (`time-log-store.ts:146-148`) |
| The renderer | Unchanged: it refetches `time:snapshot` on each `time:changed` push (`src/renderer/src/lib/use-time.ts:34`) |
| The name poller wiring | Unchanged (`index.ts:602-629`); `SessionManager` keeps nudging every hook event of an unnamed session (`session-manager.ts:303-308`) and the poller decides |
| Diagnostics | No change to `diagnostics.ts`; the read reports through the runner, the listing through #147 T10's probe |

---

## Components

### Snapshot read (`src/main/time-snapshot.ts`)

**Reconciled 2026-10-03**: only the deletion is left. `readGit` (`time-snapshot.ts:51-69`) and the
`execFileSync` import go; `readGitAsync`, `buildSnapshot` and their callers stay as #154 shipped them. The
description below is the plan of 2026-10-01.

- **Purpose**: read a cwd's git common dir and branch without blocking main.
- **Interfaces**:

  ```typescript
  export const SNAPSHOT_GIT_ARGS: readonly string[] // ['rev-parse', '--path-format=absolute', '--git-common-dir', '--abbrev-ref', 'HEAD']
  export const SNAPSHOT_GIT_TIMEOUT_MS = 2000
  export const NO_SNAPSHOT: PeriodSnapshotFields // now exported, frozen; buildSnapshot still returns it for unreadable git

  /** How readGit runs git; `git` from ./git in the app, a recorder in tests. */
  export type SnapshotGit = (
    cwd: string,
    args: string[],
    opts: { timeoutMs: number }
  ) => Promise<{ stdout: string }>

  /** One git call through the runner; any failure (not a repo, git missing, timeout) resolves to nulls; never rejects. */
  export function readGit(
    cwd: string,
    run: SnapshotGit = git
  ): Promise<{ gitCommonDir: string | null; branch: string | null }>
  ```

- **Behaviour**: `run(cwd, [...SNAPSHOT_GIT_ARGS], { timeoutMs: SNAPSHOT_GIT_TIMEOUT_MS })`; split stdout on
  `/\r?\n/`; both lines non-empty → the pair, else nulls; a rejection → nulls. `execFileSync` and its import
  leave the file.
- **Reuses**: `git()`; the parsing it has today.

### Time tracker (`src/main/time-tracker.ts`)

**Reconciled 2026-10-03**: delivered by #154 (PERF-21), with a different rule for a closed period: a
late read patches a period that closed and was kept in the log (owner's call). Not executed here.

- **Purpose**: unchanged; only the open path and one new continuation change.
- **Dependency change**:

  ```typescript
  /** Attribution for a period (TIME-03): resolves when git answers; resolves nulls on failure (TIME-12). */
  resolveSnapshot: (cwd: string) => Promise<PeriodSnapshotFields>
  ```

- **`#open(sessionId, run, at)`**: builds the period with
  `withSessionTask(NO_SNAPSHOT, run.task, pinnedTitle)`, starts the read with `#read(sessionId, period.id,
  run.cwd)`, returns the period. Callers are unchanged: they assign it to `run.open` and call `#changed()`
  synchronously, before any promise continuation can run.
- **`#read(sessionId, periodId, cwd)`**: calls `deps.resolveSnapshot(cwd)` inside `try`; a synchronous throw
  is swallowed (the provisional fields stand). On the promise: `then((fields) => this.#settled(sessionId,
  periodId, fields), () => {})`. A rejection is swallowed the same way.
- **`#settled(sessionId, periodId, fields)`**, the ordering rule:
  1. `const run = this.#runs.get(sessionId)`; return when there is no run, `run.open` is null, or
     `run.open.id !== periodId`. This one test covers every way a period ends: `ended` and `closeAll` delete
     the run, `pause` and `suspend` null `run.open`, `taskChanged`, `resume`, `resumeFromSuspend` and a
     respawning `started` put a period with a new id there.
  2. `next = { ...withoutHandFlag(run.open), ...withSessionTask(fields, run.task, pinnedTitle) }`. The
     current `run.open` is read here, not the object `#open` returned, because `heartbeat` replaces it with a
     copy carrying a newer `lastSeen`. `run.task` is the link the period opened with: a link change closes
     the period first (`taskChanged`), and a paused or suspended run has no open period.
  3. When `next` has the same `workspacePath`, `repoName`, `branch`, `taskId`, `taskTitle` and `taskByHand`
     as `run.open`, return: a failed read, a non-git cwd and a read equal to the provisional fields write
     nothing.
  4. `run.open = next; this.#changed()`.
- **What never happens**: `#settled` never touches `#periods`, never calls `append` or `rewrite`, and a read
  for a closed period writes nothing. A period closed before its read settles is appended by `#close` with
  the provisional fields, as on a timeout today.
- **Reuses**: `withSessionTask`, `#changed`.

### Name poller (`src/main/session-name-poller.ts`)

- **Constants** (exported, pinned by literals, L-009 / L-019): `NAME_BACKOFF_BASE_MS = 5000`,
  `NAME_BACKOFF_FACTOR = 2`, `NAME_BACKOFF_MAX_MS = 300000`; the three existing ones unchanged.
- **State**:

  ```typescript
  interface Watched {
    claudeId: string
    /** The last successful listing had an entry for `claudeId`. */
    named: boolean
    /** Listings since the last reset that did not name it; failed listings count while not named. */
    misses: number
    /** Epoch ms from which it is eligible again; meaningful only while misses > 0. */
    dueAt: number
  }
  readonly #watched = new Map<string, Watched>() // was Map<string, string>
  readonly #asked = new Set<string>()            // sessions whose watch or nudge is waiting for a call
  #tickAsked = false                              // a tick waiting for a call
  // #pendingRerun is removed: #asked and #tickAsked carry what it carried
  ```

- **Rules** (`now` is `Date.now()`):
  - `eligible(s) = s.misses === 0 || now >= s.dueAt`.
  - `backoff(k) = Math.min(NAME_BACKOFF_BASE_MS * NAME_BACKOFF_FACTOR ** (k - 1), NAME_BACKOFF_MAX_MS)`.
  - `watch(id, claudeId)`: when the id is new or its `claudeId` differs, set `{ claudeId, named: false,
    misses: 0, dueAt: now }`; a repeat of the same `claudeId` keeps the state. Start the interval if none;
    `#asked.add(id)`; `#schedule()`.
  - `nudge(id)`: when watched, `#asked.add(id)`; `#schedule()`.
  - `unwatch(id)`: delete from `#watched` and `#asked`; the last one stops the timers and clears both.
  - interval callback: `#tickAsked = true; #run()`. Debounce callback: `#run()` (as today).
  - `#run()`: disposed → return. A call in flight → return; the asks wait for its end. Otherwise
    `wanted = [...#asked].some(id => eligible(#watched.get(id)))` or (`#tickAsked` and any watched
    `eligible`); clear `#asked` and `#tickAsked`; call only when `wanted`.
  - On success at the settle instant `t`: for each watched `s`, `names.has(s.claudeId)` → `named = true,
    misses = 0`; else `named = false, misses += 1, dueAt = t + backoff(misses)`. Then the listeners, as today.
  - On failure at `t`: for each watched `s` with `named === false`, `misses += 1, dueAt = t + backoff(misses)`.
    The accounting sits in `#fail`, before its once-per-streak `return` (`session-name-poller.ts:169`),
    which every failure path already calls (resolver throw, spawn throw, error
    event, timeout, non-zero exit, not a JSON array); the once-per-streak log in it is unchanged (SNAME-12).
  - At the end of `settle`, after the outcome: when (`#asked.size > 0` or `#tickAsked`) and `#watched.size >
    0`, `#schedule()`. The debounced `#run()` re-checks eligibility, so a rerun asked for by a session that
    just missed is dropped.
  - `dispose`: also clears `#asked` and `#tickAsked`.
- **Why the existing tests keep passing**: a named session has 0 misses and is always eligible, so every
  test that drives a named session (nudge, tick, coalesced rerun) sees today's calls. The failure tests
  advance 30 s between calls, past the 5 s first step.
- **Schedule for a never-named session**, nudged every second, each listing ending at once: 1 s (first
  watch), 6 s, 16 s, 36 s, 76 s, 156 s, 316 s, then every 300 s. Checked by a scratch simulation of the rules
  above while planning; T5 pins it as a test.

### Measurement (no code)

**Dropped 2026-10-03** (owner: unit tests only). T1 cites #147's baseline instead.

- T1 and T6 run `node scripts/bench-sessions.mjs --sessions 6 --minutes 1 --json <file>` three times each,
  and read the `spawn` row's `loop p99/max`, `git n`, `sync` and the round-trip line from the printed summary.
- T6 adds one `--keep` run and reads the kept user data folder's `time-log.jsonl`: the bench's sessions run in
  `bench-wt-<i>` worktrees on branch `bench/<i>` of a repository folder named `app`, and the shutdown closes
  their periods, each longer than 1 s.
- T7 runs two throwaway mutants through the procedure #147 defines.

---

## Data Models

No model changes. `OpenPeriod`, `TimePeriod` and the `v: 1` line keep their keys; a pending read leaves no
trace in them. For reference, the provisional fields of a period:

| Session link | `workspacePath` | `repoName` | `branch` | `taskId` | `taskTitle` | `taskByHand` |
| ------------ | --------------- | ---------- | -------- | -------- | ----------- | ------------ |
| none | null | null | null | null | null | absent |
| Task #12345 "Fix login redirect" | null | null | null | 12345 | `Fix login redirect` (or the pinned title) | `true` |

After the read settles, the fields are what `withSessionTask(buildSnapshot(...), link)` gives, as today: a
link equal to the branch's task carries no flag (HTSK-36).

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| -------------- | -------- | ----------- |
| git fails, times out after 2 s, the cwd is not a repo or is gone | `readGit` resolves nulls; the fields equal the provisional ones; nothing is written | The period records null repository and branch, as today |
| `resolveSnapshot` throws synchronously or rejects | Swallowed in `#read`; the provisional fields stand | Same as above |
| The read settles after the period closed | Dropped by the id check | None; the closed period keeps the provisional fields (owner decision) |
| The read settles after `closeAll` on quit | The run is gone; dropped | Nothing is written after quit |
| A listing fails | A miss for every unnamed session; one log line per streak (SNAME-12) | Unnamed rows retry later, named rows keep their names |
| A session's Claude id changes while backing off | `watch` resets it and schedules a call | The new id is listed within about 1 s, as today |

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| ------- | -------------------- | ------ | ---------- |
| 46 tracker tests assert snapshot fields right after a synchronous open | `src/main/time-tracker.test.ts:96-976` | With a promise read, an assertion made before the read settles sees the provisional fields | T2 adds `await t.flush()` where a test reads fields, and makes those tests `async`; no `expect` line changes, and T2's review diffs the file to show it. A count that a test takes right after an action stays synchronous, so the patch's extra write and push never reach it |
| A heartbeat replaces `run.open` with a copy | `src/main/time-tracker.ts:160-166` | Patching the object `#open` returned would lose the newer `lastSeen` or write a stale copy | `#settled` reads `run.open` at settle time and matches by id (MAGIT-11 test) |
| The provisional hand flag can show for up to 2 s | `src/renderer/src/components/PeriodRow.tsx:129` | An open period of a session linked to its branch's task shows the hand mark until the read settles | Accepted (spec assumption, owner confirmed 2026-10-01); the closed record is right once the read settles, and a period closed first records what a timeout records today |
| An open period sits under No task until its read settles | `src/renderer/src/components/HoursView.tsx` | The Hours view can move an open period between groups once, about 150 ms after it opens | Accepted (spec assumption, owner confirmed 2026-10-01) |
| N sidecar rewrites and N pushes on a wake | `src/main/time-log-store.ts:139-144` (`writeOpen`, synchronous) | Each settled read rewrites `time-open.json`; small, but synchronous | The bench counts what it can; coalescing is the follow-up the issue allows if a stall points at it |
| N concurrent `rev-parse` processes on a wake | `src/main/git.ts` | Six processes start at once instead of one after another | Read-only and short; #147's `peakConcurrent` shows them; one per worktree in the bench |
| The bench's seeded repository is small | `scripts/bench-sessions.mjs` (#147 T15) | The baseline stall may read lower than the owner's 150 ms | T1 reports a missing stall to the owner (spec stop rule) and continues with the backoff |
| PTY and config work in the spawn path can stall main by themselves | `src/main/session-manager.ts` `#start`, `src/main/config-store.ts:65-76` | `loop max` can stay over 50 ms with `sync` at 0 | AC 32: recorded as outside this feature and reported; no scope growth |
| `Date.now()` can jump | `src/main/session-name-poller.ts` (new) | A clock set back delays an unnamed session's next listing by the jump | Bounded by the next new id or name; fake timers drive `Date.now` in tests |
| The synchronous `where claude` in the resolver | `src/main/index.ts:582-596` | One synchronous spawn per app run and after each spawn failure | Out of scope (spec); counted as a miss-driving failure, so the backoff makes it rarer |
| #147 is planned, not executed | `.specs/features/perf-diagnostics/` | Names (`gitStarted`, the bench flags, the summary columns) may move during #147's Execute | T1 reads the shipped code and the baseline first; later tasks follow what shipped and note any rename |
| The sync probe in `readGit` and its test from #147 T8 | `src/main/time-snapshot.ts`, `src/main/time-snapshot.test.ts` | Removing `execFileSync` makes that test describe a call that no longer exists | T3 replaces it with the runner-probe test (MAGIT-07) and T8 marks PDIAG-15's call site as retired; the module's `sync` rule stays tested in `diagnostics.test.ts` |

---

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Which period a read belongs to | The period id captured when the read starts | Object identity breaks on the heartbeat's copy; the session id alone cannot tell two periods apart |
| Where the read starts | Inside `#open`, synchronously; its continuation is a promise callback | The callers assign `run.open` before any continuation runs, so the id check always sees the period |
| Equal fields write nothing | Compare the six snapshot fields before `#changed()` | A failed read then writes and pushes nothing, as today |
| When eligibility is checked | When a listing would start (debounce fire, tick, rerun), not when it is asked for | A nudge asked 1 s before the due time still yields one listing on time, and a rerun asked during a call is re-judged after that call's misses |
| Poller clock | `Date.now()` | The poller already uses the global timers; Vitest's fake timers move both |
| `git.sync` | Kept in the line, reads 0 | The bench's `sync` column is then the regression check |

> **AD-060: the session-name listing backs off for a session it does not
> name.** `SessionNamePoller` keeps a miss count and a due time per watched session: after the k-th miss
> it is due `min(5 s × 2^(k−1), 5 min)` after that listing; a failed listing is a miss for every unnamed
> session; a new Claude id or a name resets it; nudges, ticks and reruns start a listing only for an
> eligible session; named sessions keep the 30 s cadence. **Amends AD-040** ("on later events for a
> still-unnamed session") and SNAME-09, SNAME-10, SNAME-12. The asynchronous period read the plan also
> held shipped with #154 (PERF-21). Spec / design / tasks: `.specs/features/main-async-git/`
> (MAGIT-01..46).
