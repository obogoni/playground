# Multi-Agent Performance Specification

## Problem Statement

With more than two agent sessions running, the Playground lags: keystrokes reach the terminal late
and scrolling stutters. A code audit and a microbenchmark (2026-10-01) found the cause on both
sides of the IPC boundary, and every hot path grows with the number of sessions:

1. **Main process — scrollback work is O(retained size) per PTY chunk.** `SessionRingBuffer.append`
   re-splits the whole buffer on `'\n'` and re-measures it with `Buffer.byteLength` on every chunk
   (`session-ring-buffer.ts:43-92`), for every running session, attached or not. Measured on a full
   buffer (~1 MB / 5,000 lines): **1.4 ms for a 45-byte spinner chunk, 2.5–5 ms for a 2 KB chunk**,
   against 0.02 ms on an empty buffer. The same event loop carries every keystroke
   (`session:input`) and every `session:data` push.
2. **Renderer — xterm draws with the DOM renderer.** `@xterm/addon-webgl` is not installed and
   `TerminalPane.tsx:146-171` loads no renderer addon, so every chunk and every scroll step rebuilds
   row DOM on the thread that also runs React and handles keys.
3. **Renderer — every `session:activity` push re-renders the whole App.** `use-sessions.ts:60`
   sets App-level state; nothing in the renderer is wrapped in `React.memo`, so the rail, every row,
   the detail pane and the status bar re-render on each tool call of each session (≈O(N²)).
4. **Renderer — every live clock rescans the full time history every second.** Each `SessionClock`
   runs its own `useNow(1000)` and calls `sessionTotalMs` / `currentRunMs`, which map every period
   ever logged (`time-totals.ts:11-23`, `TimeCounter.tsx`).
5. **Renderer — a recount always replaces the tree.** `patchWorktreeStatus` returns a new tree even
   when `dirty`/`changes` are unchanged (`tree-status.ts:12-30`, by design for SCRF-03), which
   re-renders the App and re-runs `useGitSync`'s effect — one more `git:sync-state` git process —
   whatever worktree was recounted (`use-git-sync.ts:113-117`).
6. **Renderer — the activity pill can change the header height.** `.agents-detail-pill`
   (`AgentsView.css:106`) may wrap as its text changes; a taller header resizes the terminal, which
   makes the agent's TUI redraw the whole screen. Suspected, not reproduced.

## Goals

- [ ] With 3 Claude Code sessions working at once, the main process event-loop delay p99 stays under 20 ms (baseline captured with PERF-16 before the fixes)
- [ ] With 3 sessions working, typing and wheel-scrolling the attached terminal produce no renderer long task ≥ 50 ms in a 60 s window (PERF-15)
- [ ] A PTY chunk's scrollback cost no longer depends on how much scrollback is retained
- [ ] An activity push for one session re-renders only that session's row and the views that show it

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Batching `session:data` IPC messages | Only the attached session streams (AD-004); xterm buffers writes internally. Not in the chosen scope (item 7 of the audit) |
| Moving node-pty or the ring buffers to a utility process / worker | Larger architectural change; fixing the O(n) append removes the measured cost first |
| Changing the ring buffer caps (1 MB / 5,000 lines) | The fix keeps the caps and the replay semantics (`terminal-scroll-paste`) |
| Upgrading `@xterm/xterm` past 6.0.0 or removing `UnicodeGraphemesAddon` | Same regression-risk rationale as earlier terminal features; UNIC-01..13 depend on the addon |
| List virtualization (FileTree, CommitList, HoursView) | Those lists are not mounted in the Agents view |
| A visible performance overlay | Owner chose console logging behind a flag |
| Link provider and CSS animation changes | Audited: probes are cached and batched; animations are compositor-only (opacity/transform) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Scope | Audit items 1–6 in one feature, one PR | Owner decision (2026-10-01) | y |
| Measurement | Cost tests for pure modules + debug-flag logging (main loop delay, renderer long tasks, row render log) | Owner decision (2026-10-01) | y |
| Timing assertions in CI | The ring-buffer cost test uses an absolute bound with a ≥ 50× margin over the fixed implementation and ≥ 50× under the current one (10,000 × 45 B appends on a full buffer in < 250 ms; today ≈ 14 s) | A ratio or tight bound would flake on a loaded CI runner (lesson L-005); a 50× margin on both sides discriminates without flaking | n |
| SCRF-03 ("a recount SHALL give the tree a new identity, so the status bar recomputes ahead and behind") | **Amended**: the status bar re-reads ahead/behind when a recount lands for **its own target** worktree (PERF-12), and the tree keeps its identity when the count did not change (PERF-11). Recorded as an AD at Design | SCRF-03's intent is that a commit refreshes ahead/behind; tree identity was the mechanism, and it costs a re-render of the App plus a git process for every recount of every worktree | n |
| WebGL availability | WebGL2 is expected on the owner's machines; the DOM renderer stays as the fallback (PERF-05, PERF-06) | xterm's documented pattern: load `WebglAddon` after `open()`, dispose it on `onContextLoss` | n |
| WebGL glyph rendering | xterm's WebGL renderer draws box-drawing glyphs itself (`customGlyphs`, default on). The Claude Code corner glyphs that forced Cascadia Mono (INPUT-12) are checked in UAT at a maximized and a narrow pane | Changes how those glyphs are painted; the font choice stays | n |
| Debug flags | Renderer: `localStorage['playground.debug.perf'] = '1'` (same pattern as `PROBE_FLAG_KEY`). Main: env `PLAYGROUND_DEBUG_PERF=1` | Main has no localStorage; an env var needs no new setting or UI | n |
| Activity pill wrapping (item 6) | Fixed preventively with single-line + ellipsis, whether or not it reproduces | Cheap, and a wrapping header is a full-screen TUI redraw per activity change | n |
| Owner measurement 2026-10-01 (after T1–T22) | **Phase 7 added (PERF-19..21).** The owner's run showed `max` loop delays of 400–2,100 ms. Cause, measured: `resolveClaude` runs `execFileSync('where', ['claude'])` (220–310 ms idle, `index.ts:591`); `where` prints in the console codepage, the UTF-8 decode mangles the `á` in the profile path, the spawn fails with ENOENT, and the name poller drops the binary and re-runs the blocking `where` on every nudge (at most once a second) and every 30 s. Second sync call: `readGit` (`execFileSync git rev-parse`, ~155 ms, 2 s timeout) on every period open | Same goal (keystrokes not blocked by main), same PR | y |
| `p50 ≈ 15.5 ms` in the loop log | Read as Windows timer granularity (~15.6 ms), not lag; the Phase 7 bound is stated on `max` | `monitorEventLoopDelay` samples a timer, which cannot fire finer than the OS tick | y |
| Owner CPU profile 2026-10-01 (after Phase 7) | **Phase 8 added (PERF-22).** 77 s main-process profile: every remaining busy stretch over 40 ms is a native `spawn` (35–65 ms each on this machine, even through async `execFile`) or node-pty's `WindowsPtyAgent` (255–285 ms per terminal opened). `tree:get` starts one `git` per repo and one `git status` per worktree at once, so the spawns stack into 462–664 ms blocks; it runs at startup and on window focus (SCRF-09). node-pty's cost is out of scope (needs a utility process) | Same goal, same PR | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Keystrokes are not delayed by other sessions' output ⭐ MVP

**User Story**: As a developer running several agents, I want a session's PTY output to cost the main process time proportional to that output only, so that my keystrokes reach the attached terminal without delay.

**Why P1**: The measured main-process cost is the one that grows with every running session and sits on the keystroke path.

**Acceptance Criteria**:

1. WHEN 10,000 chunks of 45 bytes are appended to a buffer already holding 1,000,000 bytes or 5,000 lines THEN the `SessionRingBuffer` SHALL complete them in under 250 ms  <!-- PERF-01 -->
2. The `SessionRingBuffer` SHALL retain at most `maxLines` lines and at most `maxBytes` UTF-8 bytes after every `append`, dropping the oldest content first  <!-- PERF-02 -->
3. WHEN the byte cap trims content THEN the `SessionRingBuffer` SHALL cut the head at the next line boundary after the excess, as today  <!-- PERF-02 -->
4. WHEN content is trimmed off the head THEN `snapshot()` SHALL start with the mode prefix of everything trimmed, followed by the retained content  <!-- PERF-03 -->
5. WHEN `tail(n)` is called THEN the `SessionRingBuffer` SHALL return the last `n` lines of the retained content, identical to today's output for the same input  <!-- PERF-03 -->

**Independent Test**: Run `session-ring-buffer.test.ts`: the existing behaviour tests pass unchanged, an equivalence test feeds the same random chunk stream to the old algorithm (kept in the test as a reference) and the new one and compares `snapshot()` and `tail(2)` after every append, and the cost test meets PERF-01.

---

### P1: The terminal scrolls and repaints on the GPU ⭐ MVP

**User Story**: As a developer, I want the embedded terminal drawn by xterm's WebGL renderer, so that scrolling and heavy TUI output do not block the renderer thread.

**Why P1**: The DOM renderer is the largest renderer-side cost on scroll and on every output chunk.

**Acceptance Criteria**:

1. WHEN a `TerminalPane` opens and the WebGL addon loads THEN the pane SHALL render through the WebGL renderer  <!-- PERF-04 -->
2. IF loading the WebGL addon throws THEN the pane SHALL keep the DOM renderer, keep working, and log the error once with `console.warn`  <!-- PERF-05 -->
3. WHEN the WebGL context is lost THEN the pane SHALL dispose the WebGL addon and continue on the DOM renderer with its buffer intact  <!-- PERF-06 -->
4. WHEN the app theme toggles THEN the WebGL-rendered terminal SHALL recolor with the new token palette, as it does today  <!-- PERF-07 -->
5. WHEN the pane unmounts THEN the WebGL addon SHALL be disposed with the terminal  <!-- PERF-07 -->

**Independent Test**: In the dev app, open a session: `term._core._renderService._renderer` (or a `[perf] renderer=webgl` debug line) reports WebGL; toggle the theme; force a context loss with `WEBGL_lose_context` from DevTools and keep typing.

---

### P2: One session's activity re-renders only that session

**User Story**: As a developer, I want an activity change in one session to repaint only what shows that session, so that a busy agent does not slow the rest of the UI.

**Why P2**: Re-renders grow ≈O(N²) with sessions but cost less per event than items 1 and 2.

**Acceptance Criteria**:

1. WHEN a `session:activity` push arrives for session A THEN `applyActivity` SHALL return a list in which every other session is the same object as before  <!-- PERF-08 -->
2. WHEN a `session:activity` push arrives for session A THEN the rail SHALL NOT re-render the row of any session other than A  <!-- PERF-09 -->
3. WHEN a `session:activity` or `session:name` push arrives THEN the `TopBar` and the `Sidebar` SHALL NOT re-render  <!-- PERF-09 -->
4. The activity pill in the session detail header SHALL render on a single line, truncated with an ellipsis, so its text never changes the header height  <!-- PERF-10 -->

**Independent Test**: With `playground.debug.perf` set (PERF-17), run two sessions, let one work: the console shows `[perf] render SessionRow <A>` lines and none for B, and no `TopBar`/`Sidebar` render lines.

---

### P2: A git recount does work only where it matters

**User Story**: As a developer, I want a recount that changes nothing to change nothing in the UI, and a recount of another worktree to leave the status bar's git state alone.

**Why P2**: Each agent turn end triggers a recount; today every recount re-renders the App and spawns one more git process.

**Acceptance Criteria**:

1. WHEN a recount result equals the worktree's current `dirty` and `changes` THEN `patchWorktreeStatus` SHALL return the same tree object  <!-- PERF-11 -->
2. WHEN a recount lands for the worktree the status bar targets THEN the app SHALL re-read that worktree's sync state (`git:sync-state`) once, whether the count changed or not  <!-- PERF-12 -->
3. WHEN a recount lands for a worktree the status bar does not target THEN the app SHALL NOT invoke `git:sync-state`  <!-- PERF-13 -->
4. WHEN a `tree:get` result replaces the tree THEN the status bar SHALL re-read its target's sync state, as today (STBR-11)  <!-- PERF-13 -->

**Independent Test**: Unit-test `patchWorktreeStatus` identity; in the dev app with two worktrees, commit in the non-target one and watch DevTools' IPC log (or a debug line) show no `git:sync-state`; commit in the target and see ahead/behind update.

---

### P2: Live clocks cost O(open periods) per tick

**User Story**: As a developer with a long time history, I want the ticking clocks to stay cheap, so that the rail does not get slower as the log grows.

**Why P2**: Cost grows with sessions × history length and adds GC pressure.

**Acceptance Criteria**:

1. The renderer SHALL drive every live `SessionClock` from one shared 1-second tick, whatever the number of live clocks  <!-- PERF-14 -->
2. WHEN a clock computes a session total, current run, worktree total or task total for a snapshot it has already indexed THEN the computation SHALL NOT visit closed periods  <!-- PERF-14 -->
3. The indexed totals SHALL equal `sessionTotalMs`, `currentRunMs`, `worktreeTotalMs` and `taskTotalMs` for the same snapshot and `now`, to the millisecond  <!-- PERF-14 -->

**Independent Test**: Unit tests compare the indexed functions with the current ones over fixture snapshots (overlapping periods, open periods, case-differing `cwd`s) at several `now` values, and a counting snapshot proxy shows closed periods are read once per snapshot, not per tick.

---

### P1: A burst of git calls never blocks the main process for long ⭐ MVP

**User Story**: As a developer, I want the app's git calls to start one at a time with the event loop free between them, so that a tree refresh never freezes my typing.

**Why P1**: Measured as the remaining 330–660 ms stalls after Phase 7 (owner CPU profile, 2026-10-01).

**Acceptance Criteria**:

1. WHEN several git calls are requested at once THEN `git()` SHALL start at most one process per event-loop turn, yielding to the loop (`setImmediate`) before each start  <!-- PERF-22 -->
2. WHILE 4 git processes are running, `git()` SHALL queue further calls and start the next only when one finishes  <!-- PERF-22 -->
3. Queued calls SHALL start in the order they were requested, and each SHALL resolve or reject with its own process's result, as today  <!-- PERF-22 -->
4. IF a git process fails or times out THEN its slot SHALL be released and the next queued call SHALL start  <!-- PERF-22 -->

**Independent Test**: Unit tests drive the pacer with a fake `defer` and controllable starts (order, one start per turn, cap of 4, slot release on reject). In the dev app, a CPU profile taken across startup and a few window focus switches shows no busy stretch over 100 ms made of `git` spawns (`analyze2.js`).

---

### P1: The main process never blocks on a child process ⭐ MVP

**User Story**: As a developer, I want the app to find the `claude` binary and read a worktree's git state without blocking the main process, so that no keystroke waits behind a child process.

**Why P1**: Measured as the source of the 400–2,100 ms stalls left after the scrollback fix (owner run, 2026-10-01).

**Acceptance Criteria**:

1. WHEN the app looks up the `claude` binary THEN it SHALL search each `PATH` directory for `claude` with each `PATHEXT` extension, in order, without spawning a process, and return the first existing file's path exactly as the filesystem spells it (a profile path such as `C:\Users\Otávio\.local\bin\claude.exe` keeps its `á`)  <!-- PERF-19 -->
2. IF no `PATH` directory holds the binary THEN the lookup SHALL fall back to `agent.claudePath` from config, and IF that is unset too THEN it SHALL fail with `agent binary not found`, as today  <!-- PERF-19 -->
3. The binary resolver SHALL answer `get()` synchronously from its cache and never run a lookup on the caller's stack  <!-- PERF-20 -->
4. WHEN `get()` is called and the last lookup started 30 seconds ago or more THEN the resolver SHALL start one background lookup, with at most one lookup in flight  <!-- PERF-20 -->
5. WHEN the time tracker opens a period THEN it SHALL attribute it from the git state cached for that `cwd` (nulls when none is cached) without a synchronous git call  <!-- PERF-21 -->
6. WHEN the asynchronous git read for a just-opened period resolves with different attribution THEN the tracker SHALL update that period's attribution: in place while it is open (sidecar rewritten, `time:changed` emitted), or in the log when it already closed and was kept (log rewritten, `time:changed` emitted)  <!-- PERF-21 -->
7. IF the period was discarded (under 1 s) before the read resolved THEN the tracker SHALL change nothing  <!-- PERF-21 -->

**Independent Test**: Unit tests drive the PATH lookup with a fake filesystem (non-ASCII directory included), the resolver with a fake clock and a deferred lookup, and the tracker with a deferred async snapshot. In the dev app, the `[session-name] listing failed: … ENOENT` line is gone, Claude session names appear, and the loop log shows no `max` above 115 ms (100 ms plus the ~15.6 ms timer tick) in the owner's multi-agent scenario.

---

### P3: Performance is measurable behind a flag

**User Story**: As the owner, I want to switch on performance logging, so that I can capture a baseline before the fixes and confirm the improvement after.

**Why P3**: It measures the goals; the fixes do not depend on it, but it ships first so the baseline exists.

**Acceptance Criteria**:

1. WHERE `localStorage['playground.debug.perf']` is `'1'` at startup, the renderer SHALL log every long task of 50 ms or more as `[perf] longtask <duration>ms` with `console.debug`  <!-- PERF-15 -->
2. WHERE the environment variable `PLAYGROUND_DEBUG_PERF` is `1` at startup, the main process SHALL log the event-loop delay p50, p99 and max in ms every 10 seconds as `[perf] loop p50=… p99=… max=…`  <!-- PERF-16 -->
3. WHERE `localStorage['playground.debug.perf']` is `'1'` at startup, the renderer SHALL log `[perf] render <Component> <id?>` for each commit of `SessionRow`, `SessionRail`, `SessionDetail`, `StatusBar`, `TopBar` and `Sidebar`  <!-- PERF-17 -->
4. IF neither flag is set THEN the app SHALL register no `PerformanceObserver`, no event-loop monitor and no profiler logging  <!-- PERF-18 -->
5. IF reading the renderer flag throws THEN the renderer SHALL treat the flag as unset  <!-- PERF-18 -->

**Independent Test**: Start with each flag set and unset; the `[perf]` lines appear only when set.

---

## Edge Cases

- WHEN a single chunk is larger than `maxBytes` THEN the `SessionRingBuffer` SHALL retain only its tail within the caps, cut at a line boundary as today  <!-- PERF-02 -->
- WHEN a chunk has no newline THEN the `SessionRingBuffer` SHALL count it as part of the current last line, as today  <!-- PERF-02 -->
- WHEN a chunk ends mid-escape-sequence and is later trimmed THEN the mode prefix SHALL still apply the completed sequence (existing `TerminalModeTracker` carry)  <!-- PERF-03 -->
- WHEN a multi-byte UTF-8 character sits at the byte-cap boundary THEN the `SessionRingBuffer` SHALL count its full byte length and never split it  <!-- PERF-02 -->
- WHEN the session is switched while a WebGL context loss is being handled THEN the old pane's addon SHALL be disposed exactly once  <!-- PERF-06 -->
- WHEN the time snapshot changes (`time:changed`) THEN the index SHALL be rebuilt once for the new snapshot, never mutated in place  <!-- PERF-14 -->

## Implicit-Requirement Dimensions

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | Ring buffer caps preserved (PERF-02); chunk larger than cap covered in Edge Cases |
| Failure / partial-failure states | WebGL load failure and context loss fall back to DOM (PERF-05, PERF-06); flag read failure = unset (PERF-18) |
| Idempotency / retry / duplicate handling | N/A because no operation here is retried or deduplicated |
| Auth boundaries & rate limits | N/A because no new endpoint or caller |
| Concurrency / ordering | Replay keeps riding the ordered `session:data` channel; the buffer change does not touch attach/detach ordering (PERF-03) |
| Data lifecycle / expiry | Time index rebuilt per snapshot, never mutated (Edge Cases) |
| Observability | PERF-15..18 |
| External-dependency failure | WebGL/GPU unavailable → DOM renderer (PERF-05) |
| State-transition integrity | N/A because no state machine changes; activity and session status semantics are untouched |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PERF-01 | P1: Keystrokes not delayed — AC 1 | Execute | Done (T5) |
| PERF-02 | P1: Keystrokes not delayed — AC 2, 3; Edge Cases | Execute | Done (T5) |
| PERF-03 | P1: Keystrokes not delayed — AC 4, 5 | Execute | Done (T5) |
| PERF-04 | P1: GPU terminal — AC 1 | Execute | Done (T6–T8), UAT pending |
| PERF-05 | P1: GPU terminal — AC 2 | Execute | Done (T7, T8), UAT pending |
| PERF-06 | P1: GPU terminal — AC 3 | Execute | Done (T7, T8), UAT pending |
| PERF-07 | P1: GPU terminal — AC 4, 5 | Execute | Done (T7, T8), UAT pending |
| PERF-08 | P2: Activity re-renders — AC 1 | Execute | Done (T10) |
| PERF-09 | P2: Activity re-renders — AC 2, 3 | Execute | Done (T9–T12), UAT pending |
| PERF-10 | P2: Activity re-renders — AC 4 | Execute | Done (T13, T14), UAT pending |
| PERF-11 | P2: Recount — AC 1 | Execute | Done (T19) |
| PERF-12 | P2: Recount — AC 2 | Execute | Done (T20–T22), UAT pending |
| PERF-13 | P2: Recount — AC 3, 4 | Execute | Done (T20–T22), UAT pending |
| PERF-14 | P2: Clocks — AC 1, 2, 3 | Execute | Done (T15–T18), UAT pending |
| PERF-15 | P3: Measurable — AC 1 | Execute | Done (T3, T4) |
| PERF-16 | P3: Measurable — AC 2 | Execute | Done (T1, T2) |
| PERF-17 | P3: Measurable — AC 3 | Execute | Done (T3, T4, T11–T13), UAT pending |
| PERF-18 | P3: Measurable — AC 4, 5 | Execute | Done (T1–T4) |
| PERF-19 | P1: Never blocks on a child — AC 1, 2 | Execute | Done (T23–T25), UAT pending |
| PERF-20 | P1: Never blocks on a child — AC 3, 4 | Execute | Done (T24, T25), UAT pending |
| PERF-21 | P1: Never blocks on a child — AC 5, 6, 7 | Execute | Done (T26–T28), UAT pending |
| PERF-22 | P1: Git bursts — AC 1–4 | Execute | Done (T29, T30), UAT pending |

**Coverage:** 22 total, 22 mapped to tasks (PERF-19..21 → T23–T28, PERF-22 → T29–T30), 0 unmapped

---

## Success Criteria

- [ ] Main event-loop delay p99 < 20 ms with 3 Claude Code sessions working (PERF-16 log, before vs after recorded in `validation.md`)
- [ ] No `[perf] longtask` ≥ 50 ms in a 60 s window of typing and wheel-scrolling with 3 sessions working (PERF-15)
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] No busy stretch over 100 ms made of `git` spawns in a main-process CPU profile (PERF-22)
- [ ] No loop-delay `max` above 115 ms in the owner's multi-agent scenario (PERF-16 log, after Phase 7)
- [ ] Owner UAT: typing and scrolling feel immediate with 3+ agents; Claude Code's boxed TUI renders correctly maximized and narrow
