# Session Strip Polish Validation

## Validation: session-strip-polish — PASS

**Round**: 2 of a maximum 3 (round 1 = FAIL: one smoke check failed and a sibling smoke was broken)
**Date**: 2026-09-19
**Spec**: `.specs/features/session-strip-polish/spec.md`
**Diff range**: `b8f27d1..19ef7bc` (7 commits: T1..T6 `5522aa8..adcaaa4`, plus fix round `19ef7bc`)
**Verifier**: independent sub-agent (author ≠ verifier), read-only over production code and tests

**Verdict**: ✅ **PASS.** Every AC is traced to evidence that matches its spec outcome. The pure half is pinned
by unit tests and all 11 injected faults are caught. The strip half is proven by the hardened smoke, which scored
24/24 in the Verifier's own run on `19ef7bc`. Both round-1 Major gaps are closed. The hand checks
listed below are owner-pending and are **not** counted as passes.

---

## Round 1 → Round 2 Delta

| Round-1 finding | Fix in `19ef7bc` | Verified here |
| --- | --- | --- |
| **Gap 1**: smoke check 14 (Enter resumes) failed, and the Space check was vacuous. STRP-08 and STRP-11 had no passing evidence | `smoke-strip.mjs`: a click-resume check on its own (`:326-327`); Enter now pauses (`:331-332`) and Space resumes (`:333-334`), each starting from the state the previous check confirmed; `waitPaused` prints the snapshot, clock and focus when it times out (`:179-195`) | ✅ The Verifier's run gave **24/24**, with checks 14, 15 and 16 PASS. Each key check now fails on its own when that key does nothing: after a working Enter the state is paused, and Space must bring it to not-paused. One residue remains: if Enter itself failed, the Space check would start from a counting state and could pass without doing anything. That failure would still be visible as check 15, so it is acceptable |
| **Gap 2**: `scripts/smoke-time.mjs` still clicked the removed buttons | `smoke-time.mjs:188-206` now clicks `.agents-detail button.agents-detail-time` and waits on `aria-pressed`; the header comment `:7-9` is updated | ✅ Verified by static review: the selectors match `TimeCounter.tsx:36-39`, and `grep "Pause time\|Resume time"` over `scripts/` and `src/` now finds only `smoke-strip.mjs`'s own STRP-14 negative check. **Not re-run by the Verifier** (see note below); the orchestrator's 26/26 is taken as claimed |
| **Gap 3**: stale comment in `Icon.tsx:197` | Now reads "so the session clock swaps glyphs of equal weight" | ✅ |
| **Gap 4**: hover un-dimmed a paused clock | `AgentsView.css:306-313`: hover sets only the border; the colour rule moved to `button.agents-detail-time:not(.paused):hover` | ✅ Specificity checked: a paused clock keeps `color: var(--text-faint)` from `.agents-detail-time.paused` (`:287`) under hover, while a counting clock brightens. Visual confirmation is part of H1 |

**Round-1 check-14 failure: cause.** It did not reproduce: the orchestrator ran the original smoke twice with no
edits and got 22/22 both times, and the Verifier's round-2 run passed 24/24. The orchestrator suspects the detached
`HEAD` (Verifier incident, round 1). That fits the Verifier's timeline poorly. The smoke ran after the branch was
restored and after a full `npm test` re-run, and the smoke reloads the page itself (`smoke-strip.mjs:259`). The
cause stays **undetermined and transient**. It is no longer blocking, because the hardened `waitPaused`
(`:188-194`) now prints the state it last saw, so any recurrence names its cause.

**Code changed this round**: `AgentsView.css` (+5/−1), `Icon.tsx` (comment only), two smoke scripts. No pure helper
and no `.ts`/`.tsx` logic changed, so the discrimination sensor was not re-run (round-1 results stand, below).

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 `mcpToolLabel` | ✅ Done | `5522aa8` |
| T2 pill label + `detailPillTitle` + STRP-06 guards | ✅ Done | `8138125`; `rail-groups.ts` and `activity-notification.ts` unmodified |
| T3 `clockToggleTitle` | ✅ Done | `b00d005` |
| T4 `SessionClock` `toggle` prop | ✅ Done | `fdde718` |
| T5 strip rewiring + CSS | ✅ Done | `8388244`, hover refined in `19ef7bc` |
| T6 `scripts/smoke-strip.mjs` | ✅ Done | `adcaaa4`, hardened in `19ef7bc`; 24/24 |
| Fix round | ✅ Done | `19ef7bc`: round-1 gaps 1 to 4 |

---

## Spec-Anchored Acceptance Criteria

Unit evidence is quoted as `file:line` plus the assertion. Smoke evidence cites `scripts/smoke-strip.mjs:line` and
the check number from the Verifier's round-2 run on `19ef7bc` (live dev app, CDP 9222).

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Result |
| -- | -------------------- | ---------------------------------- | ------ |
| STRP-01 `mcp__<server>__<tool>` → `MCP <server>` | pill `working · MCP azure-devops` | `src/renderer/src/lib/session-activity.test.ts:193` `expect(mcpToolLabel('mcp__azure-devops__wit_work_item')).toBe('MCP azure-devops')`; `:130-138` `expect(detailPillText(…)).toBe('working · MCP azure-devops')`; smoke `:267` check 2 PASS | ✅ PASS |
| STRP-02 server literal | `MCP claude_ai_Claude_Docs` | `session-activity.test.ts:197` `toBe('MCP claude_ai_Claude_Docs')`; hyphen kept `:193` | ✅ PASS |
| STRP-03 malformed `mcp__…` → raw | unchanged input | `session-activity.test.ts:204-208` `it.each(['mcp____tool','mcp__srv__','mcp__'])` → `expect(mcpToolLabel(tool)).toBe(tool)` | ✅ PASS |
| STRP-04 non-`mcp__` → unchanged | `Bash`; native pill byte-identical | `session-activity.test.ts:212` `toBe('Bash')`; pre-existing `:94-99` `toBe('working · Bash')`, `:119-127` `toBe('working · Bash · 2 subagents · overloaded')`, unedited | ✅ PASS |
| STRP-05 pill `title` = raw name | `mcp__azure-devops__wit_work_item` | `session-activity.test.ts:143-151` `expect(detailPillTitle(…)).toBe('mcp__azure-devops__wit_work_item')`; `:154-159` `toBe('Bash')`; wiring `AgentsView.tsx:197`; smoke `:272` check 3 PASS | ✅ PASS |
| STRP-06 rail tooltip + notification raw | raw id, not `MCP azure-devops` | `src/renderer/src/lib/rail-groups.test.ts:532-540` `toBe('Claude · 24173-fix-login · user/otavio/24173-fix-login · mcp__azure-devops__wit_work_item')` + `not.toContain('MCP azure-devops')`; `src/main/activity-notification.test.ts:116-123` `toBe('Needs approval to run mcp__azure-devops__wit_work_item')`; smoke `:276` check 4 PASS | ✅ PASS |
| STRP-07 activate while counting → pause | snapshot `paused` true, no open period, `aria-pressed="true"` | smoke `:310` check 10 PASS (click); `:332` check 15 PASS (Enter); `:336` check 17 and `:381` check 23 PASS; wiring `AgentsView.tsx:208-215` | ✅ PASS (smoke) |
| STRP-08 activate while paused → resume | snapshot not paused, period open, `aria-pressed="false"` | smoke `:327` check 14 PASS (click, from the confirmed paused state of check 10); `:334` check 16 PASS (Space, from the confirmed paused state of check 15) | ✅ PASS (smoke) |
| STRP-09 `pause` / `play` icon | glyph by state | smoke `:290` check 6 PASS (`icon === 'pause'`), `:312` check 11 PASS (`icon === 'play'`); `TimeCounter.tsx:43` | ✅ PASS (smoke) |
| STRP-10 `<button>`, `aria-pressed` | `BUTTON`, `'false'`/`'true'` | smoke checks 6 and 11; `TimeCounter.tsx:36-39` | ✅ PASS (smoke) |
| STRP-11 Enter / Space toggle | both keys toggle | smoke `:300` check 8 PASS (`tabIndex >= 0`); `:331-332` check 15 PASS (Enter pauses); `:333-334` check 16 PASS (Space resumes). The keys are real CDP `Input.dispatchKeyEvent` events (`:161-169`), not synthetic DOM events | ✅ PASS (smoke) |
| STRP-12 exact title wording | `current run <hh:mm:ss> · click to pause` / `… · click to resume` | `src/renderer/src/lib/time-format.test.ts:86-90` `toBe('current run 00:12:34 · click to pause')`; `:92-96` `toBe('current run 00:12:34 · click to resume')`; `:99` `toBe('current run 25:00:00 · click to pause')`; wiring `TimeCounter.tsx:40`; smoke checks 7 and 12 PASS | ✅ PASS |
| STRP-13 not running → plain, inert | `SPAN`, no icon, no `aria-pressed`, click inert | smoke `:350` check 19 PASS (`tag SPAN, icon null, pressed null`); `:364` check 21 PASS (click changes nothing); `AgentsView.tsx:208-215` gives `toggle` only while `running` | ✅ PASS (smoke) |
| STRP-14 no `Pause time`/`Resume time` button | 0 | smoke `:286` check 5 PASS; the buttons were removed from `AgentsView.tsx` | ✅ PASS (smoke) |
| STRP-15 rail row + totals unchanged | markup identical | `TotalClock` untouched (`TimeCounter.tsx:71-80`); the no-`toggle` branch `:48-59` is byte-identical to before; `SessionRail.tsx:338` passes no `toggle`; smoke `:342` check 18 PASS. In the Agents view the smoke finds `.rail-row-time` and `.rail-group-time` only; for the task-card and worktree totals the evidence is the untouched `TotalClock` | ✅ PASS (code + smoke) |

**Status**: ✅ 15/15 ACs covered and matching the spec outcome.

**Spec-precision notes** (flagged, not failing):
- STRP-07/08 name no observable for "pause/resume counting". The smoke pins an adequate one: the `paused` flag,
  the open period and `aria-pressed`, all three at once.
- STRP-15 "exactly as today" rests on diff inspection, since renderer components have no unit tests by convention
  (`.specs/codebase/TESTING.md`). Here it is conclusive.

---

## Edge Cases

- [x] **No tool name → pill as today.** Pre-existing tests are unedited: `session-activity.test.ts:76-77` `toBe('running')`,
  `:80-91` every state label, `:102-107` subagents only, `:111-116` `toBe('turn failed · rate_limit')`; also
  `:162-168` `detailPillTitle(…)` `toBeUndefined()`.
- [x] **Empty segment → raw**: `session-activity.test.ts:204-208`.
- [x] **`mcp__srv__a__b` → `MCP srv`**: `session-activity.test.ts:201`.
- [x] **Paused then stopped → inert, paused flag lost** `[corrected at Execute]`. The correction holds against the code:
  `TimeTracker.ended` (`src/main/time-tracker.ts:80-86`) closes the period and `#runs.delete(id)`, and `snapshot().paused`
  is derived from `#runs` alone (`:185`). Smoke `:350` check 19 and `:356` check 20 PASS (`{"paused":false,"open":false}`).
- [x] **Respawned after a paused stop → interactive, counting** `[corrected at Execute]`. `TimeTracker.started` (`:67-77`) sets
  `paused: false` and opens a period. Smoke `:375` check 22 PASS and `:381` check 23 PASS.

---

## Discrimination Sensor

Round 1, run in the isolated scratch `…\jobs\80d4002f\tmp\strp-sensor` (a detached worktree at `adcaaa4` with
`node_modules` junctioned), on the four focused files. The scratch baseline was 170/170. Round 2 changed no
pure helper and no component logic, so these results carry over to `19ef7bc` unchanged.

| # | File:line | Mutation | Killed? |
| - | --------- | -------- | ------- |
| M1 | `session-activity.ts:52` | `MCP ${rest.slice(0, split)}` → `MCP ${rest}` | ✅ Killed (4 failed) |
| M2 | `session-activity.ts:51` | `split <= 0` → `split < 0` (empty server accepted) | ✅ Killed |
| M3 | `session-activity.ts:51` | `split + 2 >= rest.length` → `>` (empty tool accepted) | ✅ Killed |
| M4 | `session-activity.ts:50` | `indexOf('__')` → `lastIndexOf('__')` | ✅ Killed |
| M5 | `session-activity.ts:52` | server lowercased and `_`→`-` | ✅ Killed |
| M6 | `session-activity.ts:81` | `detailPillText` renders the raw tool | ✅ Killed |
| M7 | `session-activity.ts:93` | `detailPillTitle` returns the shortened label | ✅ Killed |
| M8 | `time-format.ts:20` | `resume`/`pause` swapped | ✅ Killed (3 failed) |
| M9 | `time-format.ts:20` | `formatHms` → `formatHm` | ✅ Killed (3 failed) |
| M10 | `rail-groups.ts:115` | rail tooltip shortens `mcp__…` (STRP-06 guard) | ✅ Killed |
| M11 | `activity-notification.ts:58` | notification body shortens `mcp__…` (STRP-06 guard) | ✅ Killed |

**Sensor depth**: lightweight+ (11 mutants)
**Result**: **11/11 killed** ✅
**Isolation**: both scratches (`strp-sensor` in round 1, `strp-r2` for the round-2 build) were removed after
unlinking their junctions. `git worktree list` shows only `D:/playground-main`. The only entry in
`git status --porcelain` is this report.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ `rail-groups.ts`, `activity-notification.ts` and `TotalClock` untouched |
| No scope creep | ✅ |
| Matches patterns | ✅ pure helpers co-located with tests; the `toggle` prop is opt-in, so the rail stays inert |
| Per-second tick stays in the clock | ✅ `useNow` in `SessionClock` (`TimeCounter.tsx:33`); `AgentsView` has no timer |
| Rail row gets no toggle | ✅ `SessionRail.tsx:338` |
| CSS scoped to the strip | ✅ every new rule targets `button.agents-detail-time` (`AgentsView.css:292-318`); the rail uses `.rail-row-time` |
| Did not break other repo code | ✅ `smoke-time.mjs` updated in `19ef7bc`; no other reference to the removed buttons |
| Spec-anchored outcome check | ✅ |
| Every test maps to a spec requirement | ✅ each new test is tagged STRP-xx or names a listed edge case; the 24 h case maps to T3's Done-when |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md` |

---

## Gate Check

Run by the Verifier on `19ef7bc`:

- `npm run typecheck`: exit 0
- `npm run lint`: exit 0, **17 warnings, 0 errors** (baseline 17, delta 0)
- `npm test`: **1216 passed / 69 files**, 0 failed, 0 skipped
- `npx electron-vite build`: exit 0, run in the scratch worktree `strp-r2` at `19ef7bc` so the real `out/` was left alone
- **Test count**: 1200 → 1216 (+16: T1 +7, T2 +6, T3 +3). No deletions; the pre-existing cases are unedited.
- **`node scripts/smoke-strip.mjs`** (Verifier, one run): **24/24 PASS**, including cleanup check 24 (0 periods left).
- **`node scripts/smoke-time.mjs`**: **not run by the Verifier**; the orchestrator's 26/26 is taken as *claimed*. Reason:
  `smoke-time.mjs:186` selects the first `.rail-row` of any running group whose text includes `Windows`, not the
  session the script spawned. If the owner had a running session under `C:\Windows`, the smoke's clock click would
  pause that real session. This selector is pre-existing, not introduced by this feature, but it made the run unsafe
  to take on without a way to inspect the live app first.

**Round-1 incident (Verifier-caused, restored)**: a stray `git checkout -q b8f27d1 --` briefly detached `HEAD`;
it was restored with `git switch feature/session-strip-polish`, and `npm test` was re-run. No checkout, switch or stash
was run in the real tree in round 2.

---

## Residual Observations (not gaps)

1. **`smoke-time.mjs:186` row selection is not session-specific** (pre-existing). It should select by the spawned
   session rather than the first running row of a `Windows` group, as `smoke-strip.mjs:197-206` (`selectRow`) does by agent name.
   Worth a small follow-up so that smoke is safe to run beside the owner's real sessions.
2. **Round-1 check-14 failure: cause undetermined** (see Delta). It is not reproducible in three later runs, and the
   hardened `waitPaused` will name the cause if it recurs.

---

## Owner-Pending Hand Checks (not passes)

| # | Check | Status |
| - | ----- | ------ |
| H1 | Two-theme visual pass of the clock button: hover border and focus ring in light and dark; strip layout with the button; a paused clock stays dim under hover (Gap 4 fix) | ⏳ owner-pending |
| H2 | Screen reader announces the clock as a toggle button, pressed / not pressed. Its accessible name is the ticking `hh:mm:ss` and the `title` is its description | ⏳ owner-pending |

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| STRP-01..15 | Implemented (round 1: STRP-08, STRP-11 Needs Fix) | ✅ Verified (H1 and H2 pending with the owner) |

---

## Summary

**Overall**: ✅ Ready (pending the owner's hand checks H1 and H2)

**Spec-anchored check**: 15/15 ACs matched the spec outcome; 0 blocking spec-precision gaps
**Sensor**: 11/11 mutations killed
**Gate**: typecheck 0, lint 0 (17 = baseline), 1216/1216 tests, build 0; `smoke-strip.mjs` 24/24

**What works**: the MCP label with its raw-name tooltip, with the rail and the notification guarded; the clock tooltip;
the clickable clock as a real toggle button, by mouse, Enter and Space; the inert clock of a stopped session; the rail
and totals unchanged; and the sibling time smoke brought up to date.

**Next steps**: the owner runs H1 and H2. Optionally, make `smoke-time.mjs:186` select its own session.
