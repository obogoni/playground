# Session Strip Polish Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/session-strip-polish/spec.md` (Medium — no `design.md`; the design decisions live in the spec's Assumptions table)
**Status**: Draft

**Branch**: `feature/session-strip-polish`, already cut from `develop` at `9919139` with no commits. `develop` is the only ref holding both halves (the badge from #88/#94, the clock from #93). PR to upstream only after those merge: `git rebase --onto origin/main develop feature/session-strip-polish`.

**Test baseline**: **1200 tests / 69 files, all passing** — **measured** with `npx vitest run` on `9919139` while writing this file, not projected.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Extracted pure helpers (`session-activity.ts`, `time-format.ts`) | unit | 1:1 to the ACs each helper decides; every listed edge case | co-located `*.test.ts` | `npm test` |
| Existing pure helpers whose output must NOT change (`rail-groups.ts`, `activity-notification.ts`) | unit (guard) | One test per surface pinning the raw MCP name (STRP-06) | co-located `*.test.ts` | `npm test` |
| Renderer React components (`TimeCounter.tsx`, `AgentsView.tsx`) | none (CDP smoke + visual) | — | — | `node scripts/smoke-strip.mjs` |
| Out-of-CI smoke script | manual only | Every AC no unit test reaches | `scripts/smoke-*.mjs` | `node scripts/smoke-strip.mjs` (live session) |

**Provenance note:** the guard layer exists because of a gap found while writing these tasks — the existing rail and notification tests only ever use `Bash` as a tool name (`rail-groups.test.ts:527`), so shortening MCP names on either surface would leave the suite green. STRP-06 has no protection until T2 adds it.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a renderer task, and at every phase boundary | `npm run typecheck && npm run lint && npm test` |
| Build | At the end of Phase 2 | `npx electron-vite build` |
| Manual | The CDP smoke | `npm run dev -- -- --remote-debugging-port=9222`, then `node scripts/smoke-strip.mjs` |

**Lint is judged by exit code AND by warning count** — record the count before T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: Pure decisions

```
T1 → T2 → T3
```

### Phase 2: The strip

```
T3 → T4 → T5
```

### Phase 3: End to end

```
T5 → T6
```

6 tasks ≤ 8: **executed inline**, no sub-agent offer. The Verifier still runs after T6.

---

## Task Breakdown

### T1: Label an MCP tool by its server

**What**: Add `mcpToolLabel(tool: string): string` to `session-activity.ts` — `mcp__<server>__<tool>` becomes `MCP <server>`; anything else passes through unchanged.
**Where**: `src/renderer/src/lib/session-activity.ts`
**Depends on**: None
**Reuses**: The module's existing role as the tested home of the pill's wording.
**Requirement**: STRP-01, 02, 03, 04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `mcp__azure-devops__wit_work_item` → `MCP azure-devops`
- [ ] `mcp__claude_ai_Claude_Docs__batch` → `MCP claude_ai_Claude_Docs` — underscores and case kept literally (STRP-02)
- [ ] `mcp__srv__a__b` → `MCP srv` — everything after the second separator is the tool (edge case)
- [ ] `mcp____tool`, `mcp__srv__` and `mcp__` come back unchanged — an empty segment does not match (STRP-03)
- [ ] `Bash` comes back unchanged (STRP-04)
- [ ] Lint warning baseline recorded in the commit body
- [ ] Gate passes: `npm test`
- [ ] Test count: 1200 + 7 = **1207** (no deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agents): label an mcp tool by its server`

---

### T2: Put the label in the pill and pin the raw name elsewhere

**What**: Make `detailPillText` render `mcpToolLabel(activity.tool)`; add `detailPillTitle(session): string | undefined` returning the raw tool name; add guard tests pinning the raw MCP name in the rail tooltip and the OS notification body.
**Where**: `src/renderer/src/lib/session-activity.ts`
**Depends on**: T1
**Reuses**: `detailPillText` (`session-activity.ts:66`); the existing `tooltipOf` helper in `rail-groups.test.ts:492`.
**Requirement**: STRP-01, 05, 06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A `working` activity with `mcp__azure-devops__wit_work_item` reads `working · MCP azure-devops`
- [ ] A native tool's pill text is byte-identical to today's; every pre-existing `session-activity.test.ts` case passes unedited
- [ ] `detailPillTitle` returns the raw name when the activity has a tool and `undefined` when it has none
- [ ] **Guard** in `rail-groups.test.ts`: the rail tooltip for an MCP tool contains `mcp__azure-devops__wit_work_item`, not `MCP azure-devops`
- [ ] **Guard** in `activity-notification.test.ts`: the needs-approval body reads `Needs approval to run mcp__azure-devops__wit_work_item`
- [ ] `rail-groups.ts` and `activity-notification.ts` are not modified
- [ ] Gate passes: `npm test`
- [ ] Test count: 1207 + 6 = **1213**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agents): show the mcp server in the activity pill`

---

### T3: Word the clock's tooltip

**What**: Add `clockToggleTitle(runMs: number, paused: boolean): string` to `time-format.ts` — `current run <hh:mm:ss> · click to pause`, or `· click to resume` when paused.
**Where**: `src/renderer/src/lib/time-format.ts`
**Depends on**: T2
**Reuses**: `formatHms` (`time-format.ts:12`), which the current `current run …` tooltip already uses.
**Requirement**: STRP-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Counting: `current run 00:12:34 · click to pause`
- [ ] Paused: `current run 00:12:34 · click to resume`
- [ ] The run time is formatted by `formatHms`, so a run past 24 h reads the way the rest of the app reads it
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 1213 + 3 = **1216**

**Tests**: unit
**Gate**: full
**Commit**: `feat(time): word the clock's pause and resume tooltip`

---

### T4: Make the session clock clickable on request

**What**: Give `SessionClock` an optional `toggle?: { paused: boolean; onToggle: () => void }` prop. With it, the clock renders as `<button type="button" aria-pressed={paused}>` holding a `pause` or `play` icon before the time and titled by `clockToggleTitle`. Without it, it renders exactly as today.
**Where**: `src/renderer/src/components/TimeCounter.tsx`
**Depends on**: T3
**Reuses**: The `pause` / `play` icons the removed buttons used; `currentRunMs` for the tooltip.
**Requirement**: STRP-09, 10, 11, 12, 13, 15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Without `toggle`, the markup is unchanged — the rail row (`SessionRail.tsx:338`) and every `TotalClock` render as they do today (STRP-15)
- [ ] With `toggle`, Tab reaches it and both Enter and Space call `onToggle` (native button behaviour, STRP-11)
- [ ] `aria-pressed` is `true` while paused and `false` while counting (STRP-10)
- [ ] The per-second tick is unchanged: it still re-renders only the clock, never its parent
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1216** (unchanged — renderer component)

**Tests**: none
**Gate**: full
**Commit**: `feat(time): let the session clock pause and resume on click`

---

### T5: Rewire the session strip

**What**: In `AgentsView`, remove the `Pause time` / `Resume time` buttons, pass `toggle` to the strip's `SessionClock` only while the session is running, and set the pill's `title` from `detailPillTitle`. Style the clickable clock in `AgentsView.css`.
**Where**: `src/renderer/src/components/AgentsView.tsx`
**Depends on**: T4
**Reuses**: `onPauseTime` / `onResumeTime` and the `timePaused` flag already threaded into the strip (`AgentsView.tsx:145`); the existing `.paused` class.
**Requirement**: STRP-05, 07, 08, 13, 14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] No `Pause time` or `Resume time` text remains in the strip (STRP-14)
- [ ] A stopped session's clock gets no `toggle`: plain text, no icon, no handler (STRP-13)
- [ ] Clicking the clock pauses a counting session and resumes a paused one, through the same `time:pause` / `time:resume` IPC as before (STRP-07, 08)
- [ ] The pill carries the raw tool name as its `title` when there is one (STRP-05)
- [ ] `AgentsView.css` gives the clock button a hover and a focus ring in both themes, and does not change the rail
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **1216** (unchanged — renderer component)

**Tests**: none
**Gate**: build
**Commit**: `feat(agents): pause a session's time from its clock`

---

### T6: Drive both halves end to end

**What**: Create `scripts/smoke-strip.mjs`. It registers a throwaway registry agent whose command is `claude --version`, spawns it in `C:\Windows`, and waits for its host shell. Then it types into that terminal an `Invoke-RestMethod` POST of a `PreToolUse` with `tool_name: "mcp__azure-devops__wit_work_item"` to the hook URL read from the app's settings file, authorized with `$env:PLAYGROUND_ACTIVITY_TOKEN`. Finally it checks the strip.
**Where**: `scripts/smoke-strip.mjs`
**Depends on**: T5
**Reuses**: The CDP harness and teardown of `scripts/smoke-time.mjs`; the settings-file URL lookup and throwaway-agent lifecycle of `scripts/smoke-activity.mjs`.
**Requirement**: STRP-01..15 end to end; the sole evidence for 07, 08, 09, 13, 14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] **Spends no tokens**: the only agent launched is `claude --version`, which prints and exits
- [ ] Checks: the pill reads `working · MCP azure-devops`; its `title` is the raw name; the rail row's tooltip still carries the raw name; the strip holds no time button; clicking the clock freezes it, flips the icon to `play` and `aria-pressed` to `true`; clicking again resumes it; stopping the session leaves a plain, inert clock
- [ ] Requires `claude` on `PATH`, like `smoke-activity.mjs`; says so and exits early when it is missing
- [ ] Removes the throwaway agent and its session, **deletes every time period it created**, and restores the owner's direction and theme on the way out
- [ ] Numbered pass/fail line per check; all pass against a live dev app
- [ ] Recorded as hand checks, not scripted: the two-theme visual pass of the clock button, and a screen reader announcing pressed / not pressed

**Tests**: manual
**Gate**: manual
**Commit**: `test(agents): drive the session strip polish end to end`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 → T2 → T3
Phase 2:  T4 → T5
Phase 3:  T6
```

Strictly sequential, inline.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 pure function | ✅ |
| T2 | 1 changed function + 1 new one, same module; 2 guard tests beside it | ⚠️ cohesive — the guards pin exactly what T2 must not spread |
| T3 | 1 pure function | ✅ |
| T4 | 1 component prop | ✅ |
| T5 | 1 component and its stylesheet | ✅ |
| T6 | 1 script | ✅ |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | phase head | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 (boundary) | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T5 | T5 → T6 (boundary) | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Pure helper | unit | unit | ✅ |
| T2 | Pure helper + guards on existing helpers | unit | unit | ✅ |
| T3 | Pure helper | unit | unit | ✅ |
| T4 | Renderer component | none | none | ✅ |
| T5 | Renderer component | none | none | ✅ |
| T6 | Smoke script | manual only | manual | ✅ |

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| STRP-01 | T1, T2, T6 |
| STRP-02 | T1 |
| STRP-03 | T1 |
| STRP-04 | T1, T2 |
| STRP-05 | T2, T5, T6 |
| STRP-06 | T2, T6 |
| STRP-07 | T5, T6 |
| STRP-08 | T5, T6 |
| STRP-09 | T4, T6 |
| STRP-10 | T4, T6 |
| STRP-11 | T4 |
| STRP-12 | T3, T4 |
| STRP-13 | T4, T5, T6 |
| STRP-14 | T5, T6 |
| STRP-15 | T4, T6 |

All 15 mapped; none unmapped.
