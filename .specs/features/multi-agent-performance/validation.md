# Multi-Agent Performance Validation

**Verdict**: PASS ✅
**Date**: 2026-10-01
**Spec**: `.specs/features/multi-agent-performance/spec.md` (PERF-01..18)
**Diff range**: `a150e5b..423c091` (branch `feature/multi-agent-performance`, base `origin/main` 60ff148; 22 commits, 37 files)
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

## Interactive UAT (owner, dev app with `localStorage['playground.debug.perf']='1'` and `PLAYGROUND_DEBUG_PERF=1`)

1. PERF-04: the console shows `[perf] renderer=webgl` on opening a session.
2. PERF-06: force `WEBGL_lose_context` from DevTools. Typing keeps working and the buffer is intact.
3. PERF-07: toggle the theme. The WebGL terminal recolours.
4. PERF-09: with two sessions and one working, `[perf] render SessionRow <A>` lines appear only for A. No `TopBar`/`Sidebar` render lines appear on activity or name pushes.
5. PERF-10: a long activity text truncates with an ellipsis, and the header height and terminal size do not change.
6. PERF-12/13: commit in a non-target worktree and see no `git:sync-state` in the IPC log. Commit in the target and ahead/behind updates.
7. INPUT-12 / glyphs: Claude Code's boxed TUI renders correctly maximized and narrow under WebGL.
8. Success criteria: record main loop p99 (< 20 ms target) and long tasks with 3 working sessions, before vs after.

---

## Requirement Traceability Update

| Requirement | New Status |
| ----------- | ---------- |
| PERF-01, 02, 03, 05, 08, 11, 14, 15, 16, 18 | ✅ Verified |
| PERF-04, 06, 07, 09, 10, 12, 13, 17 | ✅ Verified (code + unit where applicable), owner UAT pending |

---

## Summary

**Overall**: ✅ Ready for owner UAT.
**Spec-anchored check**: 18/18 requirements traced. 0 spec-precision gaps hiding a defect.
**Sensor**: 26/26 non-equivalent mutants killed (27 injected, 1 equivalent).
**Gate**: typecheck ✅, lint ✅ (0 errors), in-scope 250/250. Full suite 2421/2423, with the 2 failures in known real-git noise files outside the diff.
**Issues found**: none blocking. One design-level SPEC_DEVIATION (pill title vs STRP-05), recorded as a lesson.
