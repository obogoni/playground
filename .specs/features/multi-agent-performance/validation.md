# Multi-Agent Performance Validation

**Verdict**: PASS ✅ (Phases 1–8, PERF-01..22; Phase 8 passed on re-verification iteration 1 at 75724a2)
**Date**: 2026-10-01
**Spec**: `.specs/features/multi-agent-performance/spec.md` (PERF-01..22)
**Diff range**: Phase 8: `cd5e318..HEAD` (`cd5e318..75724a2`; first run at 1a3ebd6, fix 75724a2, see "Phase 8 (PERF-22)"). Phase 7: `8a9ceb8..HEAD` (`8a9ceb8..83c8704`, see "Phase 7 (PERF-19..21)"). PERF-01..18: `a150e5b..423c091` (branch `feature/multi-agent-performance`, base `origin/main` 60ff148; 22 commits, 37 files)
**Verifier**: independent sub-agent (author ≠ verifier); coverage re-derived from the spec and the diff, evidence-or-zero.

All 18 requirements trace to a test assertion or to implementing code read for correctness. The tests assert the outcomes the spec defines. The sensor injected 27 behaviour mutations: 26 were killed, and the one survivor is equivalent to the original code. Typecheck and lint are clean, and the in-scope suites pass. The full suite has two failures, both in known real-git noise files that this diff does not touch. The renderer components and hooks follow the repo convention in `.specs/codebase/TESTING.md` (verified by hand), so their ACs are **UAT pending** for the owner. Reading that code found no defect.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T22 | ✅ Done (22/22) | `tasks.md` has 22 `Status: ✅ Done` markers for 22 tasks |

---

## Spec-Anchored Acceptance Criteria

### P1: Keystrokes are not delayed by other sessions' output

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| PERF-01 (10,000 × 45 B onto a buffer holding 1,000,000 B) | < 250 ms | `src/main/session-ring-buffer.test.ts:270` `expect(Buffer.byteLength(SPINNER,'utf8')).toBe(45)`; `:274` `...toBe(1_000_000)` (buffer is full first); `:278` `expect(performance.now() - start).toBeLessThan(250)` | ✅ PASS |
| PERF-01 (onto a buffer holding 5,000 lines) | < 250 ms | `session-ring-buffer.test.ts:285` `toHaveLength(5_000)`; `:289` `toBeLessThan(250)`; `:290` line cap still holds | ✅ PASS |
| PERF-02 (≤ maxLines / ≤ maxBytes after every append, oldest first) | Identical to the old algorithm | `session-ring-buffer.test.ts:234` `expect(buf.snapshot()).toBe(ref.snapshot())` after **every** append over 3 seeds × 1,500 random chunks; `:251` with sparse snapshots (multi-chunk path); `:263-266` default caps pinned literally (1,000,000 / 5,000); `:48` `toBe('l3\nl4\nl5')` | ✅ PASS |
| PERF-02 (byte cap cuts at the next line boundary) | Head starts after the next `\n` | `session-ring-buffer.test.ts:298` `toBe('aaaa\naaaa\naaaa\n')`; `:79` `toBe(prefix + 'keep\n')`; reference-equivalence at `:234` | ✅ PASS |
| PERF-03 (snapshot = mode prefix of trimmed + retained) | Exact prefix + content | `session-ring-buffer.test.ts:71` `toBe('\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?2004h' + 'l4\nl5\n')`; `:88` no prefix for set+reset; `:96` byte-equal when nothing is dropped | ✅ PASS |
| PERF-03 (`tail(n)` identical to today) | Same as the old `split/slice/join` | `session-ring-buffer.test.ts:235`, `:249` `expect(buf.tail(2)).toBe(ref.tail(2))` after every append; `:54-55` literal values; `:104` no mode prefix in tail | ✅ PASS |

### P1: The terminal scrolls and repaints on the GPU

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| PERF-04 (addon loads → WebGL) | Renders through WebGL | `src/renderer/src/lib/terminal-gpu.test.ts:321` `expect(gpu.kind()).toBe('webgl')`; `:322` `expect(loaded).toEqual([addon])`. Wiring: `TerminalPane.tsx:177` after `term.open` (`:174`) | ✅ PASS (unit) · UAT pending (real GPU) |
| PERF-05 (load throws → DOM, keeps working, warn once) | `console.warn` once, DOM | `terminal-gpu.test.ts:340` `kind()).toBe('dom')`, `:342` `toHaveLength(1)`, `:343` `calls[0][1]).toBe(err)` (create throws); `:354-358` (loadAddon throws; dispose later warns no more). `TerminalPane.tsx:177` passes `console.warn` | ✅ PASS |
| PERF-06 (context loss → dispose addon, DOM, buffer intact) | Addon disposed, DOM | `terminal-gpu.test.ts:365` `addon.disposed).toBe(1)`, `:366` `kind()).toBe('dom')`. "Buffer intact" is xterm's own behaviour after the addon is disposed | ✅ PASS · UAT pending (`WEBGL_lose_context`) |
| PERF-07 (theme recolor) | New palette in WebGL | Implementation: `TerminalPane.tsx:471` `term.options.theme = readTheme()` (xterm passes option changes to the active renderer) | UAT pending |
| PERF-07 (unmount disposes addon) | Disposed with the terminal | `terminal-gpu.test.ts:383` `disposed).toBe(1)` after a double `dispose()`; `TerminalPane.tsx:596` `gpu.dispose()` before `term.dispose()` | ✅ PASS |

### P2: One session's activity re-renders only that session

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| PERF-08 (other sessions keep their identity) | Same objects | `src/renderer/src/lib/session-activity.test.ts:69` `expect(next[0]).toBe(a)`; `:70` `expect(next[2]).toBe(c)`; `:71` pushed one `.not.toBe(b)`; `:72` new activity value | ✅ PASS |
| PERF-09 (rail re-renders only row A) | No other row re-renders | Comparator unit: `rail-groups.test.ts` `railRowEqual` block. Fresh rows over the same input are equal (`expect(railRowEqual(first[0], second[0])).toBe(true)`), each of id/label/status/tooltip/actions/session-identity flips it to `false`. Component: `SessionRail.tsx:392` `railRowPropsEqual` covers all 5 data props of `SessionRowProps` (`row, agents, time, selected, tabStop`, `:350-355`). All 7 function props go through `useLatestCallback` (`SessionRail.tsx:83-86`, `openMenu`, `registerRow`, `onRowKeyDown`). Time tracker is activity-blind (`src/main/time-tracker.ts:52`), so an activity push does not change `time` | ✅ PASS (unit) · UAT pending (render log) |
| PERF-09 (TopBar, Sidebar do not re-render on activity/name) | No re-render | Implementation: `App.tsx:57`, `:65` memo wrappers. TopBar props are primitives, a memoized `sync` object (`useMemo` on `tasks.auth/lastSyncAt/org`) and `useLatestCallback` callbacks. Sidebar props are tree/tasks/selection/primitives, `NO_COLLAPSED` constant, setState and latest-callbacks. No session-derived prop reaches either one | UAT pending |
| PERF-10 (pill single line + ellipsis) | Header height never changes | `AgentsView.css` `.agents-detail-pill`: `flex: 0 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis` | UAT pending |

### P2: A git recount does work only where it matters

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| PERF-11 (equal count → same tree) | `toBe(tree)` | `src/renderer/src/lib/tree-status.test.ts:47` `expect(patchWorktreeStatus(tree, '/repo-a/main', { dirty: true, changes: 5 })).toBe(tree)`; changing only `dirty` (`:53`) or only `changes` (`:60`) → `.not.toBe(tree)` with the new values asserted; worktree gone → same tree (`:65`) | ✅ PASS |
| PERF-12 (recount of target → `git:sync-state` once, changed or not) | One reload | `use-tree.ts:90`, `:104` `recounted.emit(worktreePath)` on every recount result (invoke and push), independent of the patch result. `use-git-sync.ts:128-131` listener reloads only when `path === targetPathRef.current`. Count-changed recount: the tree changes but `treeRevision` does not, so the `[targetPath, treeRevision]` effect (`:121`) does not fire a second load. Listener isolation is unit-tested: `listener-set.test.ts` (`expect(seen).toEqual(['one'])` after remove; throw isolation) | ✅ PASS (listener unit) · UAT pending (IPC log) |
| PERF-13 (recount of another worktree → no `git:sync-state`) | Zero calls | `use-git-sync.ts:129` `if (path !== targetPathRef.current) return`; the effect deps no longer include `tree` (`:121`) | UAT pending |
| PERF-13 (`tree:get` → re-read, STBR-11) | Re-read | `use-tree.ts:49`, `:61`, `:75` `bumpRevision()` in all three `tree:get` paths; `use-git-sync.ts:121` effect deps `[targetPath, treeRevision, …]` | UAT pending |

### P2: Live clocks cost O(open periods) per tick

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| PERF-14 AC1 (one shared 1 s tick) | One interval whatever the clock count | `src/renderer/src/lib/shared-tick.test.ts:41` `expect(timers.started.map((s) => s.ms)).toEqual([1000])` for 5 subscribers; `:44` `calls).toEqual([2,2,2,2,2])`; `:56` cleared on the last unsubscribe; `:73` one interval per distinct period; `:86` stable snapshot between ticks. Wiring: `TimeCounter.tsx:34`, `:73` `useSharedNow` | ✅ PASS |
| PERF-14 AC2 (indexed → no closed-period visit) | 0 reads per tick | `time-index.test.ts:273` `[...reads.values()]).toEqual([1, 1, 1])` at build; `:284` `expect(reads.size).toBe(0)` over 100 calls × 5 functions | ✅ PASS |
| PERF-14 AC3 (indexed = time-totals, to the ms) | Exact equality | `time-index.test.ts:207-218` `toBe(sessionTotalMs(...))`, `currentRunMs`, `worktreeTotalMs`, `taskTotalMs` over 5 fixtures (overlap, several open, case-differing cwd, open overlapping closed) × 3 `now` values; literal pins at `:230-232` | ✅ PASS |

### P3: Performance is measurable behind a flag

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| PERF-15 (`[perf] longtask <d>ms` for ≥ 50 ms, `console.debug`) | 49 not logged, 50 logged | `src/renderer/src/lib/perf-probe.test.ts:216` `lines).toEqual([])` for 49; `:218` `toEqual(['[perf] longtask 50ms'])`; `:193` `LONG_TASK_MS).toBe(50)`; `:204` observes `{ type: 'longtask', buffered: true }`. Default `log = console.debug` (`perf-probe.ts:30`); wired in `main.tsx` behind `perfEnabled()` | ✅ PASS |
| PERF-16 (`[perf] loop p50=… p99=… max=…` every 10 s) | ms, 1 decimal, 10 s | `src/main/perf-monitor.test.ts:76` `toBe('[perf] loop p50=10.2 p99=21.5 max=105.1')`; `:82-83` `10_000` / `10`; `:88` interval `[10_000]`; `:98-102` one line per tick + `reset` after each. Wiring: `src/main/index.ts` `enabled: process.env.PLAYGROUND_DEBUG_PERF === '1'` | ✅ PASS |
| PERF-17 (`[perf] render <Component> <id?>` for 6 components) | Exact line format | `perf-probe.test.ts:262` `toBe('[perf] render SessionRow a')`; `:266` `toBe('[perf] render TopBar')`. Profilers: `SessionRail.tsx:151` (SessionRail), SessionRow (with `row.id`), `AgentsView.tsx:89` (SessionDetail), `App.tsx:608` (StatusBar), `App.tsx:57`/`:65` (TopBar/Sidebar inside memo) | ✅ PASS (format) · UAT pending (dev log) |
| PERF-18 (no flag → no observer, no monitor, no profiler) | Nothing registered | Main: `perf-monitor.test.ts:110-114` monitors/intervals/cleared/lines all `[]`. Renderer: `main.tsx` `if (perfEnabled()) startLongTaskLog()`; `PerfProfiler.tsx` returns children unwrapped when `!ENABLED`; `TerminalPane.tsx` renderer debug line gated by `perfEnabled()` | ✅ PASS (main unit) · renderer by reading |
| PERF-18 (throwing flag read → unset) | `false` | `perf-probe.test.ts:183-187` `perfEnabled(() => { throw … })).toBe(false)`; `:176-179` only `'1'` enables | ✅ PASS |

**Status**: ✅ All 18 requirements covered (unit evidence or code read for correctness). No spec-precision gap hides a defect. Unit evidence for PERF-07 (theme), PERF-10, PERF-13 and the PERF-09 TopBar/Sidebar half is by design (TESTING.md: components and hooks are verified by hand), so these are owner UAT.

---

## Edge Cases

- [x] Chunk larger than `maxBytes`: only its tail is kept, cut at a line boundary. `session-ring-buffer.test.ts:298` `toBe('aaaa\naaaa\naaaa\n')`
- [x] Chunk with no newline counts toward the current last line. `session-ring-buffer.test.ts:306` `toBe('a\nbc')`, `:308` `toBe('bc\nd')`, `:309` `tail(1)).toBe('d')`
- [x] Mode sequence split across chunks, then trimmed: the prefix applies the completed sequence. `session-ring-buffer.test.ts:317` `toBe('49hXYZ')` → `:320` `toBe('\x1b[?1049hok')`
- [x] Multi-byte character at the byte-cap boundary is counted in full and never split. `session-ring-buffer.test.ts:328` `toBe('cdefgh')`; `:334`, `:338`, `:344` (astral = 4 bytes)
- [x] Session switch during a context loss: the addon is disposed exactly once. `terminal-gpu.test.ts:374` `addon.disposed).toBe(1)` after loss + dispose; `:383` dispose ×2 + loss
- [x] New snapshot → a new index, never a mutated one. `time-index.test.ts:239` same snapshot → `toBe`; `:247` new snapshot → `not.toBe`, `:248` reflects the added 60 min

---

## Discrimination Sensor

Run in an isolated `git worktree add --detach M:/obogoni/map-verify-scratch HEAD`, with a directory junction to the real `node_modules`. Each mutation was applied with a byte-exact restore (CRLF preserved), and only the covering test file was run with `npx vitest run <file>`. Baseline before the sensor: the scratch's 10 in-scope files passed (250/250).

| # | File | Mutation | Killed? |
| - | ---- | -------- | ------- |
| M1 | `src/main/session-ring-buffer.ts` `#trimToLines` | `newlines + 1 - maxLines` → `newlines - maxLines` (line cap off by one) | ✅ Killed (12 failed) |
| M2 | `session-ring-buffer.ts` `#trimToBytes` | Cut at the walk point instead of the next `\n` | ✅ Killed (9) |
| M3 | `session-ring-buffer.ts` `#trimToBytes` | Removed `#modes.feed(dropped…)` (mode prefix lost) | ✅ Killed (8) |
| M4 | `session-ring-buffer.ts` `walkUtf8` | Surrogate pair counted as one 3-byte unit (splits astral chars) | ✅ Killed (2) |
| M5 | `session-ring-buffer.ts` `tail` | `newlines < need` → `<=` | ✅ Killed (6) |
| M6 | `session-ring-buffer.ts` `snapshot` | Joined chunk records `newlines: 0` | ✅ Killed (8) |
| M7 | `src/renderer/src/lib/terminal-gpu.ts` | Context-loss handler no-op (no dispose / fallback) | ✅ Killed (1) |
| M8 | `terminal-gpu.ts` `release` | Dispose not idempotent | ✅ Killed (3) |
| M9 | `terminal-gpu.ts` | Fallback rethrows after the warning | ✅ Killed (2) |
| M10 | `time-index.ts` `unionAt` | `end >= earliest` → `end > earliest` | ⚪ Survived, **equivalent**: a closed interval that only touches the earliest open start adds the same length whether it is merged or summed |
| M10b | `time-index.ts` `unionAt` | Re-merge cut by `start` instead of `end` (double-counts a straddling interval) | ✅ Killed (5) |
| M11 | `time-index.ts` | `worktreeTotalMs` key not lowercased | ✅ Killed (13) |
| M12 | `time-index.ts` | Open period end not clamped (`Math.max(start, now)` → `now`) | ✅ Killed (10) |
| M13 | `time-index.ts` | Per-snapshot cache disabled | ✅ Killed (2) |
| M14 | `src/renderer/src/lib/tree-status.ts` | Equality ignores `dirty` | ✅ Killed (1) |
| M15 | `tree-status.ts` | Always a new tree (pre-PERF-11 behaviour) | ✅ Killed (1) |
| M16 | `src/renderer/src/lib/perf-probe.ts` | `duration >= 50` → `> 50` | ✅ Killed (1) |
| M17 | `perf-probe.ts` | Flag read not guarded (`read() === '1'`) | ✅ Killed (1) |
| M18 | `src/renderer/src/lib/shared-tick.ts` | No `clearInterval` on the last unsubscribe | ✅ Killed (1) |
| M19 | `shared-tick.ts` | One interval per subscriber | ✅ Killed (3) |
| M20 | `shared-tick.ts` | No catch-up of `value` on subscribe | ✅ Killed (1) |
| M21 | `src/renderer/src/lib/listener-set.ts` | A throwing listener stops the others | ✅ Killed (1) |
| M22 | `listener-set.ts` | Remove function is a no-op | ✅ Killed (1) |
| M23 | `src/renderer/src/lib/rail-groups.ts` `railRowEqual` | Tooltip not compared | ✅ Killed (1) |
| M24 | `rail-groups.ts` `railRowEqual` | Session identity not compared | ✅ Killed (1) |
| M25 | `src/main/perf-monitor.ts` | No `reset()` after each line | ✅ Killed (1) |
| M26 | `perf-monitor.ts` | Starts when disabled | ✅ Killed (1) |

**Sensor depth**: expanded (27 mutations across all 9 new or changed pure modules)
**Result**: 26/26 non-equivalent mutants killed, 1 equivalent survivor (M10). PASS ✅
**Isolation**: the junction was removed with `rmdir` (the real `node_modules` is intact) and the worktree with `git worktree remove --force`. The real tree's `git status --porcelain` was empty both before and after (matched).

---

## Gate Check

- `npm run typecheck`: exit 0 (node + web)
- `npm run lint`: 0 errors, 18 warnings, all in files outside the diff. `npx eslint` on the 37 changed files reports nothing.
- `npx vitest run` on the 10 in-scope test files: **250 passed, 0 failed**
- `npm test` (full, once): **2421 passed, 2 failed** of 2423 (114 files). Failures:
  - `src/main/worktree-manager.test.ts:886`: real-git `changedFilesOf` is missing `'deleted'`. This is the known machine-load / non-ASCII temp-path noise.
  - `src/main/file-discard.test.ts`: "puts an unstaged and a staged deletion back on disk and in the index (FDSC-05)".
  - Both failures, and only these two, reproduce when the two files run alone (`111 passed, 2 failed`). They are deletion-shaped, which fits the known `fs.rmSync` no-op on this machine's non-ASCII temp path. They are named in the task brief as pre-existing noise.
  - Neither file nor its subject (`worktree-manager.ts`, `file-discard.ts`) is in the diff, which changes only `src/main/index.ts`, `perf-monitor.ts` and `session-ring-buffer.ts` under `src/main`. CI is the gate for these (tasks.md baseline note, lesson L-005).
- **Test count before feature**: B = 2319 (tasks.md). **After**: 2423. **Delta**: +104.
- **Removed test**: `tree-status.test.ts` "gives the tree a new identity even when the count is unchanged (SCRF-03)". Justified: AD-052 amends SCRF-03. Three PERF-11 tests replace it and assert the new contract.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / no scope creep | ✅ Every new module maps to a PERF id. `useLatestCallback` and `listener-set` are justified by PERF-09 and PERF-12. |
| Surgical changes | ✅ |
| Matches patterns | ✅ DI fakes, no `vi.mock` (TESTING.md). The flag reuses `isProbeEnabled`. |
| Spec-anchored outcome check | ✅ Spec constants are pinned literally (50 ms, 10 s, 10 ms, flag key, 1 MB / 5,000, line formats), per L-009 |
| Per-layer coverage expectation | ✅ Pure modules are 1:1 to their ACs and edge cases. Components and hooks are owner UAT per TESTING.md. |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md`, L-001, L-005, L-009 |

**Reading review of hand-verified code:**

- **Memo comparators**: `railRowPropsEqual` covers every non-function prop of `SessionRowProps`, and every function prop is identity-stable through `useLatestCallback`. The ref callback is memoized per row id.
- **useGitSync**: the subscription filters by `targetPathRef.current` and is stable (`onRecounted` is `recounted.add` from a `useState` initializer). Re-reads on full refresh are keyed on `treeRevision`, not on tree identity.
- **WebGL**: the addon loads after `open()`. `onContextLoss` is subscribed before `loadAddon`. `release()` is idempotent, so a loss followed by unmount disposes once. xterm's AddonManager wraps `dispose`, so `term.dispose()` after `gpu.dispose()` does not double-dispose.
- **Perf flags**: with the flag off, `startLoopDelayLog` creates nothing, `main.tsx` registers no observer, and `PerfProfiler` mounts no `<Profiler>`.
- **useSharedNow**: `getSnapshot` returns the tick's stored `value`, which is stable between ticks (`shared-tick.test.ts:86`). With a null interval it returns the mount time and subscribes nothing.

**SPEC_DEVIATION** (`src/renderer/src/components/AgentsView.tsx:225-233`): design.md puts the full pill text in `title` in every case. The implementation keeps the raw tool name as the title while a tool is reported, because STRP-05 requires it. The title falls back to the pill text otherwise. PERF-10 itself does not constrain the title, so this is a design-level deviation that keeps an earlier verified requirement. It is not a spec failure. Cost: while a tool is reported, the truncated part of the pill text (for example the subagent count) is not in the tooltip.

---

## Phase 7 (PERF-19..21)

**Verdict**: PASS ✅
**Diff range**: `8a9ceb8..83c8704` (7 commits: `aa7478c` specs, `fbf9f4b` T23, `4c6ddfe` T24, `0ec33d5` T25, `ea2998c` T26, `e9526d7` T27, `83c8704` T28; 12 files)
**Tasks**: T23–T28 are all `Status: ✅ Done` in `tasks.md` (`:555`–`:657`).

### Spec-anchored acceptance criteria — P1: The main process never blocks on a child process

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| PERF-19 AC1 (every PATH dir in order, every PATHEXT ext in order, no spawn) | First existing file, directory-major order | `src/main/path-lookup.test.ts:24` `expect(found).toBe('C:\\a\\claude.CMD')` while `C:\\b\\claude.EXE` also exists; `:25` `probed).toEqual(['C:\\a\\claude.EXE', 'C:\\a\\claude.CMD'])`; default PATHEXT `.COM;.EXE;.BAT;.CMD` pinned at `:49-54`; quoted and empty entries at `:42-43`. No spawn: `findOnPath` takes only an injected `isFile` (`src/main/path-lookup.ts:16-37`), wired to `fs/promises.stat` (`src/main/index.ts:608-619`) | ✅ PASS |
| PERF-19 AC1 (path kept exactly, `á` survives) | `C:\Users\Otávio…\claude.exe` byte for byte | `path-lookup.test.ts:32` `toBe('C:\\Users\\OtávioBogoni\\.local\\bin\\claude.exe')`; `binary-resolver.test.ts:62` `get()` returns the same path | ✅ PASS |
| PERF-19 AC2 (no PATH hit → `agent.claudePath`, else `agent binary not found`) | Configured path, else that exact error | `path-lookup.test.ts:66-69` `toBe(null)`; `binary-resolver.test.ts:50` `get()).toBe('D:\\tools\\claude.exe')` with the lookup unsettled; `:55` `toThrow('agent binary not found')`; `:62` the found path wins over the configured one. Wiring: `index.ts:617` `configured: () => …agent?.claudePath ?? null` | ✅ PASS |
| PERF-20 AC3 (`get()` answers synchronously from the cache and never looks up on the caller's stack) | An answer without awaiting | `binary-resolver.test.ts:49-50`: the lookup is deferred and never settled, and `get()` still returns; `src/main/binary-resolver.ts:68-73` returns `string`, and `#start` only chains promises | ✅ PASS |
| PERF-20 AC4 (≥ 30 s → one background lookup, ≤ 1 in flight) | None at 29,999 ms, one at 30,000 ms, never two | `binary-resolver.test.ts:43` `RELOOKUP_MS).toBe(30_000)`; `:72` `started()).toBe(1)` at +29,999; `:75` `toBe(2)` at +30,000; `:86` `toBe(1)` after two stale `get()` calls with one lookup unsettled; previous path kept on null or reject at `:97`, `:101` | ✅ PASS |
| PERF-21 AC5 (open period attributed from the cached git state, nulls on a miss, no sync git) | Nulls on a miss; one async read per open | `src/main/time-tracker.test.ts:1038` `open[0]).toMatchObject(NULLS)`; `:1039` `reads).toEqual(['D:\\acme\\app-12345'])`. Cache hit: `index.ts:537` `gitByCwd.get(cwd) ?? {nulls}`, filled at `:538-541` from `readGitAsync`. `readGitAsync` returns a Promise and reads a real repo: `src/main/time-snapshot.test.ts:96` `toBeInstanceOf(Promise)`, `:98` `branch).toBe('feature/12345-login')`, `:99` common dir; nulls outside a repo at `:105` | ✅ PASS |
| PERF-21 AC6 (different answer → patch: open in place + sidecar + `time:changed`; closed and kept → log rewrite + `time:changed`) | The exact period, one write, one emit | Open: `time-tracker.test.ts:1049` `toEqual({…SNAPSHOT…})`, `:1058` `openWrites.length).toBe(writes + 1)`, `:1059` sidecar content, `:1060` `emits()).toBe(emits + 1)`. Closed: `:1071` exact period, `:1080` `rewrites).toEqual([[period]])`, `:1081` one emit. An equal answer writes nothing: `:1104-1105`. A hand-set task is kept (HTSK-10): `:1121-1127` | ✅ PASS |
| PERF-21 AC7 (discarded under 1 s → change nothing) | No period, no write, no emit | `time-tracker.test.ts:1092` `periods).toEqual([])`, `:1093` `rewrites).toEqual([])`, `:1094` openWrites unchanged, `:1095` emits unchanged | ✅ PASS |

**Status**: ✅ 7/7 ACs trace to assertions on the spec-defined outcome. No spec-precision gap. The `max ≤ 115 ms` loop delay and the missing ENOENT line in the Independent Test are dev-app outcomes, so they are owner UAT (items 9–10).

### Wiring review (hand-verified layer)

- `src/main/index.ts` no longer imports `execFileSync`. `grep "'where'" src/main` finds nothing. No production caller of the sync `readGit(` remains: `grep 'readGit\b' src` finds only its definition (`time-snapshot.ts:50`) and a test title.
- `resolveClaude` (`index.ts:620`) is `claudeResolver.get()`. The name poller (`session-name-poller.ts:109`) drops `#bin` on a spawn failure (`:120`, `:151`) and calls `resolveBin` again on the next poll. That call now answers from the cache, and at most one async PATH scan runs every 30 s. The blocking `where` loop found in the 2026-10-01 measurement is gone. `agent-step-runner.ts:263` still maps a throw to `agent binary not found` (WF3-23).
- `resolveSnapshotAsync` (`index.ts:538-541`) stores the fresh read in `gitByCwd` before it builds the snapshot, so the next period for that `cwd` opens on it. The tracker reapplies the task the period opened with (`time-tracker.ts:287-290`).

### Discrimination sensor (scratch worktree `M:\vfy-scratch-p7`, `node_modules` junction)

| # | File | Mutation | Killed? |
| - | ---- | -------- | ------- |
| 1 | `src/main/path-lookup.ts:30` | Loop order swapped (extension-major instead of directory-major) | ✅ |
| 2 | `src/main/path-lookup.ts:23` | Quote strip removed | ✅ |
| 3 | `src/main/path-lookup.ts:4` | Default PATHEXT drops `.COM` | ✅ |
| 4 | `src/main/path-lookup.ts:28` | A name with an extension is tried bare last | ✅ |
| 5 | `src/main/binary-resolver.ts:69` | Throttle `>=` → `>` | ✅ |
| 6 | `src/main/binary-resolver.ts:69` | In-flight guard removed | ✅ |
| 7 | `src/main/binary-resolver.ts:81` | A null lookup clears the previous path | ✅ |
| 8 | `src/main/binary-resolver.ts:70` | Configured path preferred over the found one | ✅ |
| 9 | `src/main/binary-resolver.ts:64` | No lookup on construction | ✅ |
| 10 | `src/main/time-tracker.ts:317` | Open patch without the sidecar write and emit | ✅ |
| 11 | `src/main/time-tracker.ts:323` | Closed-period patch skipped | ✅ |
| 12 | `src/main/time-tracker.ts:323` | A discarded period still rewrites the log and emits | ✅ |
| 13 | `src/main/time-tracker.ts:304` | Same-attribution check always false | ✅ |
| 14 | `src/main/time-tracker.ts:290` | Hand-set task ignored (raw fresh snapshot applied) | ✅ |
| 15 | `src/main/time-tracker.ts:288` | Async read started for the wrong `cwd` | ✅ |
| 16 | `src/main/time-snapshot.ts:84` | `readGitAsync` error → non-null values | ✅ |
| 17 | `src/main/time-snapshot.ts:86` | `readGitAsync` swaps `gitCommonDir` and `branch` | ✅ |

**Result**: 17/17 killed. PASS ✅. The first scripted run of #17 replaced the identical expression in the sync `readGit` (`time-snapshot.ts:64`), which is now dead code, and that mutant survived. Re-run on `readGitAsync`, #17 was killed.
**Isolation**: the real tree's `git status --porcelain` was empty before and after the sensor. The junction was removed with `rmdir` (the real `node_modules` is intact) and the worktree with `git worktree remove --force`.

### Gate

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0. 0 errors and 18 warnings, all in files outside the diff (`scripts/…`, `src/shared/tasks.test.ts`).
- `npx vitest run` on the `path-lookup`, `binary-resolver`, `time-snapshot` and `time-tracker` tests: **87 passed, 0 failed**.
- Full suite (orchestrator run, not repeated here): 2443 passed, 2 failed. The 2 failures are the known machine-load noise in `file-discard.test.ts` (FDSC-05) and `worktree-manager.test.ts` (force-remove). Neither file is in the diff.

### Other synchronous child-process calls in `src/main` (findings, not fixed)

- `src/main/workflow-loader.ts:137` runs `execFileSync(esbuildBin, …)` to bundle each workflow. `WorkflowManager.list()` reaches it once per workflow (`workflow-manager.ts:113`), and a run reaches it once (`:196`). It blocks main for each esbuild bundle while the Workflows list loads. It is not on a per-keystroke, per-chunk or timer path, and it was kept on purpose (EPIPE in packaged builds). Classed as warm, not hot.
- `src/main/time-snapshot.ts:52`: the sync `readGit` is still exported but has no production caller. It is dead code, not a hot path, and can be deleted.

### Low-ranked observations (no AC failed)

1. At startup, before the first PATH scan settles, `get()` falls back to config. With config unset it throws `agent binary not found`. A poll or workflow step in those first milliseconds fails once and recovers on the next poll. PERF-20 AC3 allows this.
2. The dead sync `readGit` (above).

---

## Phase 8 (PERF-22)

**Verdict**: PASS ✅ on re-verification iteration 1 (75724a2). The first run at 1a3ebd6, recorded below, failed on one non-equivalent surviving mutant (a spin while all slots are full); the fix added tests that kill it. See "Re-verification (iteration 1)".
**Diff range**: `cd5e318..HEAD` (`cd5e318..1a3ebd6`: 554010e specs, d236346 `spawn-pacer.ts` + test, 1a3ebd6 `git.ts` wiring).
**Tasks**: T29 ✅ Done, T30 ✅ Done (`tasks.md`).

### Spec-anchored acceptance criteria — P1: A burst of git calls never blocks the main process for long

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| 1. Several calls at once → at most one start per event-loop turn, yielding (`setImmediate`) before each | Nothing starts on the caller's stack; one start per `defer` turn | `src/main/spawn-pacer.test.ts:54` `expect(started).toEqual([])` after 3 synchronous `pace()` calls; `:56`, `:58`, `:60` `['a']` → `['a','b']` → `['a','b','c']`, one per turn | ✅ PASS. The test drives an injected `defer`. Production uses `setImmediate` through the default at `src/main/spawn-pacer.ts:20`, and `src/main/git.ts:8` calls `createSpawnPacer()` with defaults. Read by hand, not pinned by a test (gap 2) |
| 2. While 4 are running, queue further calls; start the next only when one finishes | 5th and 6th held after 8 turns; exactly one more starts after one settles; default cap is 4 | `src/main/spawn-pacer.test.ts:70` `toEqual(['1','2','3','4'])`; `:73` `toEqual(['1','2','3','4','5'])` after `calls[1].resolve`; `:45` `expect(MAX_RUNNING).toBe(4)` | ✅ PASS |
| 3. FIFO order; each call resolves or rejects with its own process's result | Request order; values and errors are not crossed | `:56–60` FIFO; `:88` `await expect(pa).resolves.toBe('main')`, `:89` `await expect(pb).rejects.toThrow('fatal: not a git repository')`, with b settled before a | ✅ PASS |
| 4. A failed or timed-out process releases its slot and the next queued call starts | With `maxRunning: 1`, a rejected (`killed: true`) call frees the slot; a synchronous throw rejects that call and frees the slot | `:102`/`:106` `['a']` → `['a','b']` after `a.reject(... killed: true)`; `:118` `rejects.toThrow('spawn EINVAL')`, `:123` `toEqual(['after'])` | ✅ PASS |

**Status**: 4/4 ACs covered with spec-anchored assertions.

### Correctness read of `src/main/spawn-pacer.ts`

- **No stall.** Every event that can make progress possible calls `pump()`: an enqueue (`:52`), the end of each deferred turn (`:32`), and every settle (`:47–48`, in `finally`, so resolve and reject both). `pump` defers only when the queue is non-empty and a slot is free (`:27`). Only the deferred turn increments `running`, so between a deferral and its turn `running` can only fall. The inner `running < maxRunning` check at `:31` is therefore always true (redundant, see mutant 2b).
- **Settle while a turn is pending.** `pumping` is true, so the settle's `pump()` returns, and the pending turn starts the next call and re-pumps. `pumping` is cleared at the top of the turn (`:30`) before `shift()`, so a `start` that re-enters `pace()` schedules a fresh turn and the turn's own `pump()` then no-ops. No double start: at most one `shift()` per turn.
- **Cap reached, then a settle.** The turn's `pump()` returns at `:27` (full) without deferring, so nothing spins. The settle's `pump()` schedules the next turn.
- **Never on the caller's stack.** `pace()` only pushes and calls `pump()`, which only calls `defer`.
- **FIFO.** `push` + `shift`.
- **Synchronous throw.** Caught at `:41–44` and turned into a rejected promise, so the same `finally` frees the slot.
- **No unhandled rejection.** `then(resolve, reject)` handles the rejection, and the `finally` chain resolves.
- **Fake timers.** `useFakeTimers` appears only in the `dir-remover`, `session-manager` (×3) and `session-name-poller` tests. None of them reaches `git.ts` (its importers are `commit-log`, `file-diff`, `file-discard`, `file-tree`, `git-sync`, `index`, `worktree-manager`), so no test can hang on a faked `setImmediate`.

### Discrimination sensor (scratch worktree `M:\vfy-scratch-p8`, `node_modules` junction)

Command per mutant: `npx vitest run src/main/spawn-pacer.test.ts`.

| # | `file:line` | Mutation | Killed? |
| - | ----------- | -------- | ------- |
| 1 | `src/main/spawn-pacer.ts:29` | Run the turn synchronously instead of through `defer` | ✅ (AC1 test) |
| 2 | `src/main/spawn-pacer.ts:27` | `running >= maxRunning` → `running > maxRunning` | ❌ **Survived** (non-equivalent, see below) |
| 2b | `src/main/spawn-pacer.ts:31` | `running < maxRunning` → `<=` | ⚪ Survived, equivalent (the check is always true, see correctness read) |
| 3 | `src/main/spawn-pacer.ts:2` | Default `MAX_RUNNING` 4 → 5 | ✅ (2 tests) |
| 4 | `src/main/spawn-pacer.ts:31` | LIFO: `shift()` → `pop()` | ✅ (4 tests) |
| 5 | `src/main/spawn-pacer.ts:46` | Release the slot only on resolve, not on reject | ✅ (both AC4 tests) |
| 6 | `src/main/spawn-pacer.ts:41` | No `try/catch` around `start()` | ✅ (sync-throw test) |
| 7 | `src/main/spawn-pacer.ts:32` | The turn does not re-pump after a start | ✅ (3 tests) |
| 8 | `src/main/spawn-pacer.ts:48` | A settle does not re-pump | ✅ (3 tests) |
| 9 | `src/main/spawn-pacer.ts:31` | Two starts per turn | ✅ (AC1 test) |

**Mutant 2 is a real defect the suite cannot see.** With `>`, `pump()` still defers when all 4 slots are busy. The turn starts nothing (the inner check holds the cap) and re-pumps, so `setImmediate` re-schedules itself for as long as 4 git processes run with calls queued. Cap, order and results are unchanged, so every AC test passes, but the main process spins a CPU core during exactly the bursts this phase targets. Confirmed in the scratch with a probe test (6 never-settling calls, 6 turns, then 20 more turns; asserts no deferred turn is pending and the `defer` count stops growing). It passes on HEAD and fails on mutant 2 (`expected [ [Function] ] to deeply equal []`). The probe was deleted with the scratch.

**Result (first run, 1a3ebd6, superseded)**: 8/9 non-equivalent mutants killed, 1 survived (10 injected, 1 equivalent). Not passing; see the re-verification below.
**Isolation**: the real tree's `git status --porcelain` was empty before and after. The junction was removed with `rmdir` (real `node_modules` intact, 504 entries) and the worktree with `git worktree remove --force`. `git worktree list` shows only the real tree.

### Gate (real tree, HEAD 1a3ebd6)

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0. 0 errors, 18 warnings, all outside the diff (the same 18 as Phase 7).
- `npx vitest run src/main/spawn-pacer.test.ts src/main/git.test.ts src/main/git-sync.test.ts src/main/commit-log.test.ts`: **4 files, 71 passed, 0 failed** (115.9 s).
- Test count: +6 (`spawn-pacer.test.ts`). No test deleted or weakened.

### Timeout analysis (full-suite `git-sync` / `commit-log` timeouts)

The pacer does not plausibly cause them. Measured in the scratch, `git-sync.test.ts` + `commit-log.test.ts` (57 tests):

| Measure | With pacer (HEAD) | Without pacer (`git.ts` from `cd5e318`) |
| ------- | ----------------- | --------------------------------------- |
| Wall, run 1 | 115.2 s | 118.7 s |
| Wall, run 2 | 123.0 s | 117.9 s |
| `readCommits` caps each list at 20 | 19.8 s | 18.9 s |
| `readSyncState` counts pull/push | 6.2 s | 5.8 s |
| `listCommits` own commits and the merge | 5.4 s | 4.8 s |

The differences are within run-to-run noise: the two runs with the pacer differ from each other by more than the pacer/no-pacer gap. Each `git()` call pays one `setImmediate` (microseconds) against 35–65 ms of process creation. The pacer is a module-level instance per Vitest worker, so files do not queue behind each other, and these tests await their git calls one at a time, so the cap of 4 is never reached. The `readCommits` cap test already takes ~19 s alone against the 30 s timeout; under full-suite load (parallel workers all spawning git) it crosses 30 s. That is pre-existing headroom, not a regression from this diff. Outside this phase: build that fixture with fewer git calls or give it a longer timeout.

### Ranked gaps

1. **Surviving mutant 2 (spin while full)**: PERF-22 AC2 and the design's "Behaviour" bullet. No test pins that the pacer schedules no turn while `maxRunning` processes run. Fix task: add a `spawn-pacer.test.ts` case that fills 4 slots with never-settling starts plus queued calls, turns the manual loop past the fills, and asserts no deferred turn is pending and the `defer` count stops growing. The probe above kills mutant 2.
2. Low: AC1 names `setImmediate`, but no test pins the production default (`src/main/spawn-pacer.ts:20`). A `setTimeout(0)` or `queueMicrotask` default would pass the suite. Verified by reading only.
3. Owner UAT: the CPU profile item below (not automatable).

### Re-verification (iteration 1, HEAD 75724a2)

**Fix under test**: 75724a2 `test(git): pin the pacer idle while full and its setImmediate yield`, touching only `src/main/spawn-pacer.test.ts` (+36/−1). Production code is unchanged since 1a3ebd6. Line numbers in the AC table above are as of 1a3ebd6; the fix shifted them by +5 (the manual loop gained `pending()`).

**New tests, spec-anchored:**

| Gap | AC | `file:line` + assertion | Assessment |
| --- | -- | ----------------------- | ---------- |
| 1. Spin while full | AC2 ("WHILE 4 are running … start the next only when one finishes") | `src/main/spawn-pacer.test.ts:81-90`: 6 never-settling calls under the default cap, 8 turns; `:87` `expect(started).toEqual(['1','2','3','4'])`, `:89` `expect(loop.pending()).toBe(0)` | Not shallow. It asserts the pacer schedules no turn while every slot is busy, which is the behaviour mutant A broke. `pending()` reads the manual loop's real queue, not a mock of the pacer |
| 2. `setImmediate` default | AC1 ("yielding to the loop (`setImmediate`) before each start") | `src/main/spawn-pacer.test.ts:92-109`: stubs `globalThis.setImmediate`, builds `createSpawnPacer()` with defaults; `:102` `expect(started).toEqual([])`, `:103` `expect(deferred).toHaveLength(1)`, `:105` `expect(started).toEqual(['a'])` after running the deferred callback; the real `setImmediate` is restored in `finally` | Not shallow. The default parameter is read at call time, so the stub is the production path; another yield primitive leaves `deferred` empty |

**Discrimination sensor** (scratch `git worktree add --detach M:/vfy-scratch-p8b HEAD`, `node_modules` junction via `mklink /J`; byte-exact restore after each mutant; command `npx vitest run src/main/spawn-pacer.test.ts`; scratch baseline 8/8 passed):

| # | `file:line` | Mutation | Killed? |
| - | ----------- | -------- | ------- |
| A | `src/main/spawn-pacer.ts:27` | `running >= maxRunning` → `running > maxRunning` (the first run's survivor) | ✅ (idle-while-full test) |
| B | `src/main/spawn-pacer.ts:20` | Default `defer = setImmediate` → `(fn) => { setTimeout(fn, 0) }` | ✅ (setImmediate default test) |
| C | `src/main/spawn-pacer.ts:20` | Default `defer = setImmediate` → `queueMicrotask` | ✅ (setImmediate default test) |
| 1 | `src/main/spawn-pacer.ts:29` | Run the turn synchronously instead of through `defer` | ✅ (2 tests) |
| 3 | `src/main/spawn-pacer.ts:2` | Default `MAX_RUNNING` 4 → 5 | ✅ (3 tests) |
| 4 | `src/main/spawn-pacer.ts:31` | LIFO: `shift()` → `pop()` | ✅ (5 tests) |
| 5 | `src/main/spawn-pacer.ts:46` | Release the slot only on resolve, not on reject | ✅ (2 tests) |
| 6 | `src/main/spawn-pacer.ts:41` | No `try/catch` around `start()` | ✅ (1 test) |
| 7 | `src/main/spawn-pacer.ts:32` | The turn does not re-pump after a start | ✅ (4 tests) |
| 8 | `src/main/spawn-pacer.ts:48` | A settle does not re-pump | ✅ (3 tests) |
| 9 | `src/main/spawn-pacer.ts:31` | Two starts per turn | ✅ (1 test) |

**Result**: 11/11 non-equivalent mutants killed, 0 survived (mutant 2b stays equivalent and was not re-run). PASS ✅.
**Isolation**: the real tree's `git status --porcelain` was empty before and after. The junction was removed with `rmdir` (real `node_modules` intact, 504 entries) and the worktree with `git worktree remove --force`; `git worktree list` shows only the real tree.

**Gate (real tree, HEAD 75724a2)**: `npm run typecheck` exit 0; `npm run lint` exit 0 (0 errors, the same 18 warnings outside the diff); `npx vitest run src/main/spawn-pacer.test.ts` 8 passed, 0 failed. Test count +2 against the first run; no test deleted or weakened.

**Remaining gaps**: owner UAT item 11 only (CPU profile). Lesson L-097, recorded for the first run's survivor, stays as is; the re-verification found no new failure.

---

## Interactive UAT (owner, dev app with `localStorage['playground.debug.perf']='1'` and `PLAYGROUND_DEBUG_PERF=1`)

1. PERF-04: the console shows `[perf] renderer=webgl` on opening a session.
2. PERF-06: force `WEBGL_lose_context` from DevTools. Typing keeps working and the buffer is intact.
3. PERF-07: toggle the theme. The WebGL terminal recolours.
4. PERF-09: with two sessions and one working, `[perf] render SessionRow <A>` lines appear only for A. No `TopBar`/`Sidebar` render lines appear on activity or name pushes.
5. PERF-10: a long activity text truncates with an ellipsis, and the header height and terminal size do not change.
6. PERF-12/13: commit in a non-target worktree and see no `git:sync-state` in the IPC log. Commit in the target and ahead/behind updates.
7. INPUT-12 / glyphs: Claude Code's boxed TUI renders correctly maximized and narrow under WebGL.
8. Success criteria: record main loop p99 (< 20 ms target) and long tasks with 3 working sessions, before vs after.
9. PERF-19/20: the `[session-name] listing failed … ENOENT` line is gone from the main log, and Claude session names appear in the rail.
10. PERF-19..21: with `PLAYGROUND_DEBUG_PERF=1` in the owner's multi-agent scenario, no `[perf] loop` line shows a `max` above 115 ms.
11. PERF-22: a main-process CPU profile across startup and a few window focus switches shows no busy stretch over 100 ms made of `git` spawns (`analyze2.js`).

---

## Requirement Traceability Update

| Requirement | New Status |
| ----------- | ---------- |
| PERF-01, 02, 03, 05, 08, 11, 14, 15, 16, 18 | ✅ Verified |
| PERF-04, 06, 07, 09, 10, 12, 13, 17 | ✅ Verified (code + unit where applicable), owner UAT pending |
| PERF-19, 20, 21 | ✅ Verified (unit + wiring read), owner UAT pending (items 9–10) |
| PERF-22 | ✅ Verified (unit, sensor 11/11 on re-verification), owner UAT pending (item 11) |

---

## Summary

**Overall**: ✅ Ready for owner UAT.
**Spec-anchored check**: 18/18 requirements traced. 0 spec-precision gaps hiding a defect.
**Sensor**: 26/26 non-equivalent mutants killed (27 injected, 1 equivalent).
**Gate**: typecheck ✅, lint ✅ (0 errors), in-scope 250/250. Full suite 2421/2423, with the 2 failures in known real-git noise files outside the diff.
**Issues found**: none blocking. One design-level SPEC_DEVIATION (pill title vs STRP-05), recorded as a lesson.

**Phase 7 (PERF-19..21)**: ✅ PASS. 7/7 ACs traced, sensor 17/17 killed, typecheck ✅, lint ✅, in-scope tests 87/87. Two findings do not block: the sync esbuild call in `workflow-loader.ts:137` runs on the warm workflow-list path, and the sync `readGit` is now dead code.

**Phase 8 (PERF-22)**: ✅ PASS on re-verification iteration 1 (75724a2). 4/4 ACs traced, sensor 11/11 non-equivalent mutants killed (including the first run's `>=` → `>` survivor at `src/main/spawn-pacer.ts:27` and two non-`setImmediate` defaults), typecheck ✅, lint ✅, `spawn-pacer.test.ts` 8/8. The full-suite `git-sync`/`commit-log` timeouts are not caused by the pacer (same durations with and without it).
