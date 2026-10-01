# Multi-Agent Performance Design

**Spec**: `.specs/features/multi-agent-performance/spec.md`
**Status**: Approved (2026-10-01)

---

## Architecture Overview

Six independent fixes on the existing modules plus a measurement layer. No new IPC channel, no
new process, no data-format change. Each fix moves a hot path from "work proportional to
everything" to "work proportional to what changed".

```mermaid
graph LR
  PTY[node-pty onData] -->|chunk| RB[SessionRingBuffer<br/>chunk deque, O(chunk+trimmed)]
  RB -->|attached only| IPC[session:data]
  IPC --> TP[TerminalPane<br/>+ WebGL renderer, DOM fallback]
  HOOK[activity hooks] --> ACT[session:activity]
  ACT --> US[useSessions.applyActivity<br/>keeps other sessions' identity]
  US --> RAIL[SessionRail] --> ROW["memo(SessionRow, railRowEqual)"]
  US --> TOP["memo(TopBar)"]
  TICK[shared ticker<br/>1 interval per period] --> CLK[SessionClock / TotalClock]
  TIDX[timeIndex(snapshot)<br/>WeakMap-cached] --> CLK
  REC[recount result] --> PWS[patchWorktreeStatus<br/>same tree when unchanged]
  REC --> BUS[onRecounted bus] --> GS[useGitSync<br/>reloads only for its target]
  TG[tree:get] -->|treeRevision++| GS
  FLAG{{perf flags}} -.-> LT[longtask log] & PROF[Profiler log] & LOOP[main loop-delay log]
```

### Approaches considered (renderer re-render isolation, PERF-09)

| Approach | Trade-off | Verdict |
| -------- | --------- | ------- |
| **A. `React.memo` on the leaves + stable callbacks + a content comparator for rail rows** | Small, local diff. `applyActivity` already keeps the identity of untouched sessions; the row comparator absorbs the fresh `RailRow` objects `buildRailGroups` creates per render. App still re-renders on each push, but that is cheap once the leaves bail out | **Chosen** |
| B. Per-session external store (`useSyncExternalStore`) read by each row | Rows subscribe to their own session, so App does not re-render at all. Rewrites `useSessions`, `buildRailGroups` callers, `StatusBar`, `SessionDetail` and the turn-end recount in App | Rejected: larger blast radius in renderer code that has no unit tests by convention |
| C. Enable React Compiler | Auto-memoizes everything | Rejected: a build-pipeline change with app-wide behaviour risk, out of scope |

### Approaches considered (ring buffer, PERF-01..03)

| Approach | Verdict |
| -------- | ------- |
| **Chunk deque with running byte/newline counters; trims walk from the head** | **Chosen**: O(chunk + trimmed) per append, strict caps preserved, `snapshot()` joins once |
| Amortized trimming (let it grow to cap + slack, then trim the old way) | Rejected: caps stop being strict (PERF-02) and each trim still costs O(1 MB) |
| Fixed byte ring (`Buffer`) | Rejected: the line cap and line-boundary cut need string-level scanning anyway |

---

## Code Reuse Analysis

| Component | Location | How to Use |
| --------- | -------- | ---------- |
| `TerminalModeTracker` | `src/main/terminal-mode-tracker.ts` | Unchanged; the new buffer feeds it the trimmed text in order, as today |
| `isProbeEnabled` | `src/renderer/src/lib/terminal-modes.ts:76` | Reused verbatim for the perf flag read (PERF-18 throw → unset) |
| `applyActivity` | `src/renderer/src/lib/session-activity.ts` | Already preserves untouched sessions' identity; PERF-08 pins it with a test |
| `unionMs`, `Interval` | `src/shared/time-intervals.ts` | Used by the time index for the open-period tail union |
| `useNow` | `src/renderer/src/lib/use-time.ts:72` | Kept for other callers; clocks move to the shared ticker |
| DI/fake pattern | `TESTING.md` §3 | WebGL loader and loop monitor take injected factories so they unit-test without a GPU/Electron |

### Integration Points

| System | Integration Method |
| ------ | ------------------ |
| `SessionManager` | No change: still calls `buffer.append`, `snapshot`, `tail(2)` |
| `TerminalPane` | Calls `attachGpuRenderer(term, …)` after `term.open`; disposes it in cleanup before `term.dispose()` |
| `App.tsx` | Memoizes the `TopBar` `sync` prop; passes stable callbacks; passes `treeRevision` + `onRecounted` from `useTree` to `StatusBar` |
| `main/index.ts` | Starts `startLoopDelayLog` when `PLAYGROUND_DEBUG_PERF=1` |
| `main.tsx` | Starts `startLongTaskLog` when the renderer flag is set |

---

## Components

### SessionRingBuffer (rewritten internals, same public surface)

- **Purpose**: Bounded scrollback whose append cost is O(chunk + trimmed).
- **Location**: `src/main/session-ring-buffer.ts`
- **Interfaces** (unchanged): `append(chunk)`, `snapshot()`, `tail(lines)`, `maxBytes`, `maxLines`
- **Internals**:
  - `#chunks: { text: string; bytes: number; newlines: number }[]` with a `#head` index (compacted with `splice` when `#head > 1024 && #head > chunks.length / 2`).
  - `#bytes` and `#newlines` running totals. Line count = `#newlines + 1`, matching today's `split('\n').length`.
  - **Line trim**: while `#newlines + 1 > maxLines`, drop whole head chunks whose newlines fit in the excess; for the last one, cut right after the k-th newline (`indexOf` loop inside that chunk only). Trimmed text goes to `#modes.feed` in order.
  - **Byte trim**: `excess = #bytes − maxBytes`; drop whole head chunks while `chunk.bytes ≤ remaining excess`; inside the boundary chunk walk code points summing their real UTF-8 width until `removed ≥ excess`, then advance to the next `'\n'` across chunks (or stop at the walk point if none, never between surrogate halves). Today's loop sums `Buffer.byteLength` per UTF-16 unit, which counts an astral character as 6 bytes; the new walk counts 4. Results are identical for BMP text (the equivalence test's domain) and the astral case gets its own test.
  - `snapshot()`: joins the live chunks into one (and stores it back as a single chunk, so repeated attaches stay O(1) after the first), prefixed by `#modes.prefix()`.
  - `tail(n)`: scans chunks from the end for `n` newlines; no full split.
- **Reuses**: `TerminalModeTracker`.

### attachGpuRenderer

- **Purpose**: Load xterm's WebGL renderer with DOM fallback (PERF-04..07).
- **Location**: `src/renderer/src/lib/terminal-gpu.ts`
- **Interfaces**:
  - `attachGpuRenderer(term: { loadAddon(a): void }, create: () => GpuAddon, warn: (msg, err) => void): { dispose(): void; kind(): 'webgl' | 'dom' }`
  - `GpuAddon = { onContextLoss(cb: () => void): { dispose(): void }; dispose(): void }`
- **Behaviour**: `create` + `loadAddon` inside try; on throw → `warn` once, `kind()='dom'`. `onContextLoss` → dispose the addon (idempotent guard) → `kind()='dom'`. `dispose()` is idempotent, so context loss + unmount dispose once (Edge Case).
- **Dependencies**: `@xterm/addon-webgl@0.19.0` (published with `@xterm/xterm@6.0.0` on 2025-12-22, MIT). `TerminalPane` passes `() => new WebglAddon()`.

### railRowEqual + memoized SessionRow

- **Purpose**: A row re-renders only when what it shows changed (PERF-09).
- **Location**: `src/renderer/src/lib/rail-groups.ts` (comparator, pure) and `SessionRail.tsx` (`memo(SessionRow, railRowPropsEqual)`)
- **Interfaces**: `railRowEqual(a: RailRow, b: RailRow): boolean` — compares `id`, `label`, `status`, `tooltip`, `actions` (element-wise) and `session` by identity. The row props comparator adds `agents`, `time`, `selected`, `tabStop` by identity and ignores function props, which are made stable in `SessionRail` with `useLatestCallback`.
- **New hook**: `useLatestCallback<F>(fn: F): F` in `src/renderer/src/lib/use-latest-callback.ts` — a stable identity that always calls the latest `fn` (ref updated in an effect). Used for the row handlers and the App → `TopBar` callbacks.
- `registerRow` per-row ref callback: the inline `ref={(node) => …}` becomes a stable per-row callback created inside the memoized row (`useCallback` on `row.id`).

### Memoized TopBar (and Sidebar)

- `TopBar` wrapped in `memo`; App passes `sync` through `useMemo([tasks.auth, tasks.lastSyncAt, org])` and its four callbacks through `useLatestCallback`.
- `Sidebar` wrapped in `memo`; its inline App callbacks (`onSpawnAgent`, `onWidthChange`, `onToggleCollapsed`) go through `useLatestCallback`. `Sidebar` takes no session props, so activity pushes do not reach it.

### timeIndex + shared ticker

- **Location**: `src/renderer/src/lib/time-index.ts`, `src/renderer/src/lib/shared-tick.ts`
- **Interfaces**:
  - `timeIndex(snapshot): TimeIndex` — cached in a `WeakMap<TimeSnapshot, TimeIndex>`, built once per snapshot.
  - `TimeIndex.sessionTotalMs(id, now)`, `.currentRunMs(id, now)`, `.worktreeTotalMs(cwd, now)`, `.taskTotalMs(taskId, now)` — same results as `time-totals.ts` (PERF-14 AC 3).
  - Built data: `closedBySession: Map<id, ms>`; `closedByCwd` / `closedByTask: Map<key, { merged: Interval[]; unionMs: number }>` (merged, sorted); `open: OpenPeriod[]` with parsed starts.
  - Union totals at `now`: `unionMs(closed.merged)` is precomputed; the open intervals for the key are merged with only the **tail** of `merged` whose `end > min(open start)` (walked from the end), so a tick touches open periods plus the few merged intervals they overlap, never every closed period.
  - `useSharedNow(intervalMs: number | null): number` — `useSyncExternalStore` over a module ticker map `ms → { interval, listeners }`; the interval starts with the first subscriber and stops with the last. One `setInterval` per distinct period, whatever the number of clocks (PERF-14 AC 1).
- `SessionClock`/`TotalClock` switch to `useSharedNow` + `timeIndex(snapshot)`; `SessionRail`'s `totalAt` closures call the index.

### Recount routing (PERF-11..13)

- `patchWorktreeStatus` returns `tree` unchanged when the worktree's `dirty` and `changes` already equal the result (PERF-11).
- `useTree` adds `treeRevision: number` (incremented on every `tree:get` result) and `onRecounted(cb: (path) => void): () => void` — a tiny listener set fired for every recount result, changed or not, from both `recount` and the `worktree:status` push.
- `useGitSync` replaces its `tree` option with `treeRevision` and `onRecounted`: the effect depends on `[targetPath, treeRevision]` (PERF-13 AC 4, STBR-11) and a subscription calls `loadState(path)` only when `path === targetPathRef.current` (PERF-12, PERF-13 AC 3).
- `useFiles`' `treeRevision: tree` is left as is (Files direction only; out of the Agents hot path).

### Activity pill (PERF-10)

- `.agents-detail-pill`: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto` and the header row keeps `align-items: center` on one line. The full text goes into `title` so truncation loses nothing.

### Perf instrumentation (PERF-15..18)

- **Renderer** `src/renderer/src/lib/perf-probe.ts`:
  - `PERF_FLAG_KEY = 'playground.debug.perf'`; `perfEnabled()` = `isProbeEnabled(() => localStorage.getItem(PERF_FLAG_KEY))`, read once at module load.
  - `startLongTaskLog(Observer = PerformanceObserver, log = console.debug)` → observes `longtask`, logs `[perf] longtask <ms>ms` for `duration ≥ 50`.
  - `formatRenderLine(component, id?)` + `PerfProfiler` component (`src/renderer/src/components/PerfProfiler.tsx`): renders React's `<Profiler onRender>` only when enabled, otherwise returns `children` unwrapped (PERF-18: no profiler when off). Wraps `SessionRow`, `SessionRail`, `SessionDetail`, `StatusBar`, `TopBar`, `Sidebar`. Note: React's `<Profiler>` reports commits in production builds only with the profiling build; the flag is for `npm run dev` and is documented as such.
  - `main.tsx` calls `startLongTaskLog()` only when `perfEnabled()`.
- **Main** `src/main/perf-monitor.ts`:
  - `startLoopDelayLog({ enabled, monitor = monitorEventLoopDelay, every = setInterval, log = console.log })` — `resolution: 10`, logs `formatLoopLine(h)` = `[perf] loop p50=<n> p99=<n> max=<n>` (ms, 1 decimal) every 10 s and `reset()`s; returns a stop function. Not started unless `process.env.PLAYGROUND_DEBUG_PERF === '1'`.

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| -------------- | -------- | ----------- |
| WebGL addon throws on load (no GPU, blocklisted driver) | `console.warn` once; DOM renderer stays | Terminal works as today |
| WebGL context lost (GPU reset, sleep) | Addon disposed; xterm falls back to DOM on its own | A repaint; buffer intact |
| `localStorage` throws on flag read | Flag = unset | No perf logging |
| `PerformanceObserver` lacks `longtask` | `observe` throws → caught, one `console.warn` | No long-task lines; app unaffected |

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| ------- | -------------------- | ------ | ---------- |
| Ring buffer rewrite could change replay bytes and reintroduce the dead-scroll / mode-loss bugs | `src/main/session-ring-buffer.ts:43-92` | Broken TUI after a session switch | Existing tests kept unchanged + reference-equivalence property test over random BMP chunk streams (old algorithm kept inside the test file as the oracle) comparing `snapshot()` and `tail(2)` after every append |
| WebGL draws box-drawing glyphs itself; INPUT-12 chose Cascadia Mono for Claude's corner glyphs | `TerminalPane.tsx:148-152` | Grid misalignment in the boxed TUI | UAT at maximized + narrow pane; if it regresses, set `customGlyphs: false` on the terminal (keeps the font's glyphs) |
| Comparator ignores function props | `SessionRail.tsx` (new) | A stale handler if a callback is not routed through `useLatestCallback` | Every function prop of `SessionRow` goes through `useLatestCallback` in `SessionRail`; the comparator lists the data props explicitly |
| Timing-based cost test on CI | `session-ring-buffer.test.ts` (new) | Flaky gate (lesson L-005) | ≥ 50× margin on both sides (spec Assumptions) |
| Renderer code has no unit tests by convention | `src/renderer/**` components | Memo/WebGL wiring regressions slip | Logic pushed into pure, tested libs (`railRowEqual`, `timeIndex`, `shared-tick`, `terminal-gpu`, `perf-probe`, `patchWorktreeStatus`); wiring verified with the PERF-17 render log in UAT |
| SCRF-03 is changed | `.specs/features/status-changes-refresh/spec.md:61` | A future reader expects tree identity to signal a recount | AD-052 records the amendment; `tree-status.ts` doc comment updated |
| `time-totals.ts` functions stay as the oracle | `src/renderer/src/lib/time-totals.ts` | Two implementations to keep in sync | The index is tested for equality against them; other callers (HoursView, TasksPane) keep using `time-totals.ts` unchanged |

---

## Tech Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| WebGL addon version | `@xterm/addon-webgl@0.19.0`, exact pin like `monaco-editor` | Same release batch as `@xterm/xterm@6.0.0`; xterm addons are version-coupled |
| Main flag transport | env var, not a config field | No settings UI or schema change for a diagnostic |
| Recount → status bar signal | Listener set in `useTree`, not React state | A state counter would re-render App on every recount, which is what PERF-11 removes |

> Project-level: **AD-052** (SCRF-03 amendment) is appended to `.specs/STATE.md` when this design is approved.

---

## Phase 7 addendum (2026-10-01): no synchronous child process in main (PERF-19..21)

Added after the owner's measurement (spec Assumptions). Two modules and two wiring changes; no IPC change.

### findOnPath

- **Location**: `src/main/path-lookup.ts`
- **Interface**: `findOnPath(name: string, env: { PATH?: string; PATHEXT?: string }, isFile: (path: string) => Promise<boolean>): Promise<string | null>`
- **Behaviour**: splits `PATH` on `;` (empty entries skipped, surrounding quotes stripped), `PATHEXT` on `;` (default `.COM;.EXE;.BAT;.CMD` when unset), tries `join(dir, name + ext)` for each dir in order, each ext in order, and returns the first `isFile` hit as built (no re-encoding, so non-ASCII survives). A name that already has an extension is tried bare first. `where` searches the same order (dir-major), so the first hit is the one `where` printed first.
- **Production `isFile`**: `fs.promises.stat(p).then((st) => st.isFile(), () => false)`.

### BinaryResolver

- **Location**: `src/main/binary-resolver.ts`
- **Interface**: `new BinaryResolver({ lookup: () => Promise<string | null>, configured: () => string | null, now: () => number, minIntervalMs = 30_000 })` with `get(): string` and `refresh(): void`.
- **Behaviour**: the constructor starts the first lookup. `get()` returns the last found path, else `configured()`, else throws `agent binary not found`; when the last lookup started `minIntervalMs` ago or more and none is in flight, it starts one in the background before returning. A lookup that rejects or finds nothing keeps the previous path. `get()` never awaits.
- **Wiring**: `resolveClaude = () => claudeResolver.get()` in `index.ts`; the poller's `resolveBin` and the step runner's `resolveClaude` keep their sync signatures. The poller still drops `#bin` on a spawn failure; the next `get()` returns the cached path at no cost, and re-lookups are throttled to one per 30 s.

### Asynchronous period attribution

- `readGitAsync(cwd): Promise<{ gitCommonDir; branch }>` in `time-snapshot.ts`, the `execFile` twin of `readGit` (same args, timeout and nulls on failure). `readGit` stays for any other caller.
- `TimeTrackerDeps` gains optional `resolveSnapshotAsync?: (cwd) => Promise<PeriodSnapshotFields>`. `#open` keeps calling the sync `resolveSnapshot` (now backed by a per-cwd cache in `index.ts`, nulls on a miss) and, when the async dep exists, starts it; on resolve it recomputes `withSessionTask(fresh, run.task, pinnedTitle)` and, if any field differs, patches the period by id: open (some `run.open.id` matches) → replace the run's open period, `#changed()`; closed and kept (found in `#periods`) → replace it, `#rewritten()`; neither → nothing (discarded). A rejection is ignored (attribution stays as opened, TIME-12).
- `index.ts`: `gitCache = new Map<cwd, git>()`; `resolveSnapshot(cwd)` builds from `gitCache.get(cwd) ?? nulls`; `resolveSnapshotAsync(cwd)` awaits `readGitAsync`, stores it in the cache, and builds.

### Risks

| Concern | Location | Impact | Mitigation |
| ------- | -------- | ------ | ---------- |
| First period of a new `cwd` opens with null attribution for ~150 ms | `time-tracker.ts` `#open` | A renderer refetch in that window shows "From branch: none" briefly | The async patch emits `time:changed`, so the view corrects itself; the log line written at close carries the patched fields |
| A hand-set task changes between open and resolve | `time-tracker.ts` | Patch could apply the old task | The patch reads `run.task` at resolve time and targets the period by id; a task change already closed that period and opened a new one with its own read |
| `where` and `findOnPath` could disagree on an exotic PATH (e.g. `%VAR%` entries) | `path-lookup.ts` | A different binary than before | PATH entries are already expanded in the process env on Windows; `agent.claudePath` stays as the override |

---

## Phase 8 addendum (2026-10-01): pace git spawns (PERF-22)

- **Location**: `src/main/spawn-pacer.ts`; used by `git()` in `src/main/git.ts` (AD-023 makes it the single git entry point, so one change covers `listWorktrees`, `worktreeStatus`, `readSyncState`, the Files direction and the rest).
- **Interface**: `createSpawnPacer({ maxRunning = 4, defer = setImmediate }): <T>(start: () => Promise<T>) => Promise<T>`.
- **Behaviour**: a FIFO queue. A pump, scheduled with `defer`, starts the head call when fewer than `maxRunning` are running, then schedules itself again for the next one. So at most one `spawn` runs per event-loop turn, and IPC (keystrokes) is handled between two spawns. A settled call (resolve or reject) frees its slot and schedules the pump. A `start` that throws synchronously rejects that call and frees its slot.
- **Why `setImmediate`**: it yields to the loop without the ~15.6 ms Windows timer floor a `setTimeout(0)` would add to every git call. Electron's main loop runs Chromium tasks (IPC) between libuv iterations. That the yield really lets input through is confirmed by the owner's follow-up profile, not by a unit test.
- **Out of scope**: node-pty's synchronous ConPTY creation (~270 ms per opened terminal). The non-git spawns (`claude agents --json` every 30 s, `az`, hook shells) are single, not bursts.

| Concern | Location | Impact | Mitigation |
| ------- | -------- | ------ | ---------- |
| A burst now takes longer end to end (one start per turn, at most 4 running) | `git.ts` | The tree's counts land a little later at startup | Each start is ~50 ms anyway; the total spawn time is unchanged, only spread out. 4 running in parallel keeps git's own work overlapped |
| A git call that never settles would hold a slot forever | `spawn-pacer.ts` | Queue stalls after 4 hung calls | `execFile` settles on exit or on its `timeout`; the long-running git calls (fetch/push) already pass `timeoutMs` |

