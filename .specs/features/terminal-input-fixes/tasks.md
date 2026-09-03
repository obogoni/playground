# Terminal Input & Rendering Fixes Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: None - Medium scope, design is inline in the task bodies below
**Status**: Done

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `README.md` (Development section), `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Renderer pure libs (`src/renderer/src/lib/*`) | unit | All branches of the key classifier (copy/SIGINT/paste/shift-enter, clipboard-failure path) | co-located `*.test.ts` | `npm test` |
| Main pure helper (`src/main/terminal-env.ts`) | unit | Env merge: defaults applied, parent env preserved, forced vars win | co-located `*.test.ts` | `npm test` |
| Thin OS/Electron shells (`pty-port.ts`, `TerminalPane.tsx`) | none | Hand-verified per repo convention (TESTING.md); live-session manual check | - | `npm run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After every code task / before PR | `npm run typecheck && npm run lint && npm test` |
| Build | After phase completion | `npm run build:win` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Terminal fixes (3 tasks)

```
T1      T2
        |
        v
       T3
```

---

## Task Breakdown

### T1: PTY terminal environment helper + unit tests

**Status**: ✅ Complete

**What**: Add a pure helper `buildPtyEnv(parentEnv)` that returns the PTY env with `TERM=xterm-256color` and `COLORTERM=truecolor` forced after merging the parent env (revised after UAT: `TERM_PROGRAM` is deliberately NOT claimed — Claude's CSI-u mode misbehaves on Windows); use it in `pty-port.ts` (env + `name: 'xterm-256color'`). Co-located unit tests live in `terminal-env.test.ts`.
**Where**: `src/main/terminal-env.ts` (new)
**Depends on**: None
**Reuses**: `PtyPort.spawn` env merge shape (`{ ...process.env, ...env }`)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `buildPtyEnv(parent)` sets `TERM=xterm-256color` and `COLORTERM=truecolor` and does NOT set `TERM_PROGRAM` (INPUT-01, INPUT-02 — revised after UAT)
- [ ] Other parent env entries survive the merge (INPUT-01)
- [ ] The three forced vars win even when the parent sets them (assumption: app env wins)
- [ ] `PtyPort.spawn` uses the helper and spawns with `name: 'xterm-256color'`
- [ ] Unit tests cover: defaults applied, parent preserved, forced vars override
- [ ] Gate check passes: `npm test`
- [ ] Test count: 635 + N pass (no deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `fix(ui): advertise a proper terminal env to agent PTYs`

---

### T2: Terminal key classifier + unit tests

**Status**: ✅ Complete

**What**: Add a pure helper `classifyTerminalKey(event)` in `src/renderer/src/lib/terminal-keys.ts` returning `'copy-selection' | 'shift-enter' | 'paste' | 'pass'` for: Ctrl+C with a selection → copy; Ctrl+C without selection → pass (SIGINT); Shift+Enter → shift-enter; Ctrl+V → paste; everything else → pass. Co-located unit tests live in `terminal-keys.test.ts`.
**Where**: `src/renderer/src/lib/terminal-keys.ts` (new)
**Depends on**: None
**Reuses**: Test style of `task-pills.test.ts` / `pane-layout.test.ts`

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Ctrl+C + selection → `copy-selection`; Ctrl+C without selection → `pass` (INPUT-06, INPUT-07)
- [ ] Shift+Enter → `shift-enter` (INPUT-04)
- [ ] Ctrl+V → `paste` (INPUT-08)
- [ ] Other chords (plain keys, Ctrl+Shift+C, arrows, etc.) → `pass`
- [ ] Unit tests assert every branch with concrete outcomes
- [ ] Gate check passes: `npm test`
- [ ] Test count: 635 + N pass (no deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(ui): classify terminal key chords for copy/paste and newline`

---

### T3: Wire the key handling into TerminalPane

**Status**: ✅ Complete

**What**: In `TerminalPane.tsx`, extend the existing `attachCustomKeyEventHandler`: Ctrl+C with a selection copies (via `navigator.clipboard.writeText`) and returns false; Shift+Enter and Ctrl+Enter send a line feed (`\n`, 0x0A — revised after UAT: CSI-u misbehaves on Windows; the intercepted keydown gets `preventDefault` so the browser's follow-up keypress does not leak `\r`) via `term.input` and return false; Ctrl+V prevents default, reads the clipboard and calls `term.paste`, returning false; Ctrl+Shift+C keeps copying (unify with the classifier). Terminal font is the Cascadia Mono stack at every pane width (revised after UAT: JetBrains Mono lacks Claude's corner glyphs at any width).
**Where**: `src/renderer/src/components/TerminalPane.tsx`
**Depends on**: T2
**Reuses**: The existing custom key handler (lines 90-97), `classifyTerminalKey`

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Ctrl+C with selection copies and does not reach the PTY; without selection it reaches the PTY (INPUT-06, INPUT-07)
- [ ] Shift+Enter writes `\x1b[13;2u` to the PTY (INPUT-04)
- [ ] Ctrl+V pastes the clipboard text; clipboard failure logs and does nothing (INPUT-08, INPUT-09)
- [ ] Ctrl+Shift+C still copies (no regression)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 635 + N pass (no deletions)

**Tests**: none (renderer component - repo convention; manual check in a live session)
**Gate**: full
**Commit**: `feat(ui): wire terminal key handling for copy, paste and shift-enter`

---

## Phase Execution Map

Visual representation of task ordering. Phases run in sequence, and tasks within a phase run in order:

```
Phase 1:
T1      T2
        |
        v
       T3
```

Execution is strictly sequential - there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order. T1 and T2 are independent and may run in either order.

3 tasks total = single task-budgeted batch (≤ ~8) → execution is inline, no sub-agents.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: env helper + pty-port wiring | 1 helper (+ co-located tests) + 1 thin shell | ✅ Granular |
| T2: key classifier | 1 module (+ co-located tests) | ✅ Granular |
| T3: TerminalPane wiring | 1 component | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | - | ✅ Match |
| T2 | None | - | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Main pure helper + thin shell | unit (helper) / none (shell) | unit | ✅ OK |
| T2 | Renderer pure lib | unit | unit | ✅ OK |
| T3 | React component | none | none | ✅ OK |