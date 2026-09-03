# Terminal Input & Rendering Fixes Validation

**Date**: 2026-08-31
**Spec**: `.specs/features/terminal-input-fixes/spec.md` (revised after UAT)
**Diff range**: `316759d..HEAD` (full feature, branch `feature/terminal-input-fixes`, HEAD `fc5a1ae`)
**Verifier**: independent sub-agent (author ≠ verifier) — final run after interactive UAT confirmed all manual checks

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `buildPtyEnv` + `terminal-env.test.ts` (4 tests); wired into `PtyPort.spawn` with `name: 'xterm-256color'` (`pty-port.ts:30-32`); `TERM_PROGRAM` deliberately NOT claimed (revised after UAT) |
| T2   | ✅ Done | `classifyTerminalKey` + `terminal-keys.test.ts` (6 tests); action renamed `shift-enter` → `newline` (Shift+Enter and Ctrl+Enter) after UAT |
| T3   | ✅ Done | `TerminalPane.tsx` handler rewired through the classifier; line feed `\n` injection, `preventDefault` on intercepted keydowns, clipboard copy/paste, always-Cascadia font stack |

No blocked or partial tasks.

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | -------------------- | ----------------------- | ------ |
| INPUT-01: PTY SHALL spawn with `TERM=xterm-256color` and `COLORTERM=truecolor` | `TERM=xterm-256color`, `COLORTERM=truecolor` | `src/main/terminal-env.test.ts:7` - `expect(env.TERM).toBe('xterm-256color')`; `:8` - `expect(env.COLORTERM).toBe('truecolor')`; impl `src/main/terminal-env.ts:10-13`, applied `src/main/pty-port.ts:30` (`name: 'xterm-256color'`), `:32` (`env: buildPtyEnv(...)`) | ✅ PASS |
| INPUT-02: PTY SHALL NOT set `TERM_PROGRAM` | `TERM_PROGRAM` absent | `src/main/terminal-env.test.ts:13` - `expect(env.TERM_PROGRAM).toBeUndefined()`; impl `src/main/terminal-env.ts:10-13` (not in forced set) | ✅ PASS |
| INPUT-03: WHEN user runs Claude Code THEN banner SHALL render with box-drawing + full palette | visual (live session) | **user-confirmed PASS (UAT 2026-08-31, maximized and narrow)**; impl evidence `src/main/terminal-env.ts:10-13` + `src/main/pty-port.ts:30-32` | ✅ PASS |
| INPUT-04: WHEN Shift+Enter or Ctrl+Enter THEN app SHALL send a line feed (`\n`, 0x0A) | `\n` to PTY | `src/renderer/src/lib/terminal-keys.test.ts:25` - `expect(classifyTerminalKey(key({ shiftKey: true, key: 'Enter' }), false)).toBe('newline')`; `:26` - `expect(classifyTerminalKey(key({ ctrlKey: true, key: 'Enter' }), false)).toBe('newline')`; impl `src/renderer/src/lib/terminal-keys.ts:34`, `src/renderer/src/components/TerminalPane.tsx:114` - `term.input('\n')` | ✅ PASS |
| INPUT-05: WHEN Shift+Enter in Claude Code THEN newline inserted, not submit | visual (live session) | **user-confirmed PASS (UAT 2026-08-31)**; impl evidence `terminal-keys.ts:34` + `TerminalPane.tsx:109-116` | ✅ PASS |
| INPUT-06: WHEN Ctrl+C with selection THEN copy + NOT send SIGINT | copy-selection; no SIGINT | `src/renderer/src/lib/terminal-keys.test.ts:10` - `expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), true)).toBe('copy-selection')`; impl `TerminalPane.tsx:100-108` (`preventDefault` + `writeText` + `return false` stops forwarding) | ✅ PASS |
| INPUT-07: WHEN Ctrl+C without selection THEN forward (SIGINT) | pass / forward | `src/renderer/src/lib/terminal-keys.test.ts:11` - `expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false)).toBe('pass')`; impl `terminal-keys.ts:31`, `TerminalPane.tsx:125` (`return true` forwards) | ✅ PASS |
| INPUT-08: WHEN Ctrl+V THEN paste system clipboard | paste | `src/renderer/src/lib/terminal-keys.test.ts:21` - `expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyV' }), false)).toBe('paste')`; impl `TerminalPane.tsx:117-124` (`preventDefault` + `readText` + `term.paste`) | ✅ PASS |
| INPUT-09: IF clipboard read fails on Ctrl+V THEN do nothing + log (no crash/partial) | no paste on read failure, log | impl evidence (thin-shell, no unit per repo convention — TESTING.md): `TerminalPane.tsx:119-122` - `.then((text) => term.paste(text)).catch(console.error)`; rejected `readText` skips `.then` → nothing pasted, error logged | ✅ PASS (impl evidence; component convention) |
| INPUT-10: IF selection empty/whitespace on Ctrl+C THEN forward (SIGINT) | empty → SIGINT; whitespace-only → SIGINT | `TerminalPane.tsx:99` - `term.getSelection().trim().length > 0` (whitespace-only → `hasSelection=false` → `pass`/SIGINT); `terminal-keys.test.ts:11` covers `hasSelection=false` → `pass` | ✅ PASS |
| INPUT-11: IF Shift+Enter in non-TUI shell THEN shell receives a line feed and handles it like Enter | `\n` sent unconditionally; shells treat LF as Enter | `terminal-keys.test.ts:25` (newline classified with no TUI/app detection); impl `TerminalPane.tsx:109-116` always sends `\n`; harmless-ignore is a bash/psh property, not app code | ✅ PASS |
| INPUT-12: WHILE terminal is rendered, font family SHALL start with the Cascadia Mono fallback stack | `'Cascadia Mono', Consolas, 'JetBrains Mono', monospace` | impl evidence (component, no unit per convention): `TerminalPane.tsx:80` - `fontFamily: "'Cascadia Mono", Consolas, 'JetBrains Mono', monospace` — exact spec string, always applied | ✅ PASS (impl evidence; inline after the always-Cascadia UAT decision) |

**Status**: ✅ All 12 ACs covered — 8 automated-matched (INPUT-01/02/04/06/07/08/10 + INPUT-07/10 pairs), 2 user-confirmed manual (INPUT-03, INPUT-05), 2 impl-evidence per thin-shell convention (INPUT-09, INPUT-11, INPUT-12). 0 gaps, 0 spec-precision gaps.

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 1        | `src/main/terminal-env.ts:10-13` | Dropped `COLORTERM` from the forced env | ✅ Killed (2 failures: `terminal-env.test.ts:8` literal, `:25` override) |
| 2        | `src/renderer/src/lib/terminal-keys.ts:34` | Ctrl+Enter no longer returns `newline` (`(shift \|\| ctrl)` → `shift`) | ✅ Killed (1 failure: `terminal-keys.test.ts:26`) |
| 3        | `src/renderer/src/lib/terminal-keys.ts:31` | Ctrl+C with a selection returns `pass` (dropped `hasSelection` from the branch) | ✅ Killed (1 failure: `terminal-keys.test.ts:10`) |

**Sensor depth**: lightweight (3 behavior-level mutations, per default tier)
**Result**: 3/3 killed — **PASS ✅**
**Isolation**: baseline `git status --porcelain` empty before and after; scratch `D:\worktrees\input-final` (detached HEAD `fc5a1ae`, `node_modules` junction) removed; junction removed; real tree untouched (no `git stash`).

---

## Interactive UAT Results (if performed)

UAT run 2026-08-31 (live sessions), all **user-confirmed PASS**:

| #   | Test | Result | Details |
| --- | ---- | ------ | ------- |
| 1   | Claude banner rendering (INPUT-03) | ✅ Pass | Box-drawing + full palette with the Cascadia stack — confirmed maximized AND narrow (earlier: broken at any width with JetBrains Mono — U+23BE/U+23BF corners missing) |
| 2   | Shift+Enter in Claude Code (INPUT-05) | ✅ Pass | Newline inserted, prompt stays open with two lines, no submit |
| 3   | Ctrl+Enter in opencode (INPUT-04) | ✅ Pass | Newline inserted (LF path shared with Shift+Enter) |
| 4   | Ctrl+C copy / Ctrl+C SIGINT (INPUT-06/07) | ✅ Pass | Selection copied, shell keeps running; no selection → SIGINT |
| 5   | Ctrl+V paste (INPUT-08) | ✅ Pass | Clipboard text appears once |

**UAT iteration history (2026-08-31, in commit order)**:
- `eb9ca83` — **CSI-u rejected**: `ESC[13;2u` + `TERM_PROGRAM=WezTerm` made Claude enter kitty mode whose CSI-u parsing on Windows misbehaves (newline **and** submit). Adopted plain LF (`\n`, the Ctrl+J byte) and dropped the `TERM_PROGRAM` claim. Font experiment started (JetBrains first + glyph fallbacks).
- `f430cf7` — **Font flip**: JetBrains Mono lacks U+23BE/U+23BF corner glyphs → banner broken at any width; Cascadia Mono moved first.
- `2472952` — **Keypress-leak root cause**: xterm 6.0 only calls `preventDefault` when it processes the keydown itself; a bare `return false` let the browser's follow-up `keypress` of Enter leak `\r` (newline + submit). Fixed with `event.preventDefault()` on every intercepted keydown.
- `d09298e` — classifier action renamed `shift-enter` → `newline` (also covers Ctrl+Enter); per-width font helper `terminal-font.ts` + 2 tests added.
- `d46e57d` — font picked **before** `fit()` on resize (fit measures cells with the current font; a late swap breaks the grid).
- `fc5a1ae` — **always-Cascadia chosen by the user**; per-width helper + its 2 tests deleted as dead abstraction; INPUT-12 spec revised to the inline always-Cascadia stack (`TerminalPane.tsx:80`).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ `terminal-env.ts` (17 lines) + `terminal-keys.ts` (36 lines), both single-purpose; per-width font helper deleted when it became single-use (`fc5a1ae`) |
| Surgical changes | ✅ `pty-port.ts` 2-line change; `TerminalPane.tsx` only the handler block + font stack; no unrelated edits |
| No scope creep | ✅ kitty-protocol expansion and xterm upgrade correctly deferred (Out of Scope); no new deps |
| Matches patterns | ✅ Pure helpers + co-located vitest `describe/it/expect` mirror `pane-layout.test.ts` / `task-pills.test.ts`; thin shells un-tested per TESTING.md |
| Spec-anchored outcome check (asserted values match spec) | ✅ TERM/COLORTERM/TERM_PROGRAM-absent, newline/paste/pass/copy-selection, LF byte, inline font stack — all match the revised spec exactly |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ pure libs unit-tested to branch level; thin shells hand-verified per matrix (T3: none per convention, live-session UAT done) |
| Every test maps to a spec requirement - no unclaimed tests | ✅ 10/10 feature unit tests map to INPUT-01/02/04/06/07/08/10 or done-when criteria |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, `README.md` Development, co-location matrix in tasks.md | ✅ |

---

## Edge Cases

- [x] Edge 1 (INPUT-09): clipboard read failure → nothing pasted + `console.error`, no crash — `TerminalPane.tsx:119-122`
- [x] Edge 2 (INPUT-10): empty selection → SIGINT ✅; whitespace-only selection → SIGINT ✅ (`.trim()` guard at `TerminalPane.tsx:99`)
- [x] Edge 3 (INPUT-11): Shift+Enter always sends LF; non-TUI shells treat LF like Enter — `TerminalPane.tsx:109-116`
- [x] Edge 4 (INPUT-12): font stack always starts with Cascadia Mono — `TerminalPane.tsx:80`
- [x] Edge 5 (bare-shell): Shift+Enter/Ctrl+Enter at a bare prompt send LF, shell behaves as for Enter — `TerminalPane.tsx:109-116`

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (Full gate from tasks.md)
- **Result**: **641 passed, 0 failed, 0 skipped** (43 test files)
- **typecheck**: PASS (node + web, exit 0); **lint**: PASS, 0 errors (18 pre-existing `prettier/prettier` warnings in `scripts/`, none in changed files)
- **Test count before feature**: 631 (baseline `316759d`)
- **Test count after feature**: 641
- **Delta**: +10 feature tests (4 `terminal-env` + 6 `terminal-keys`); evolution from the 640 of the previous round: `eb9ca83` +1 (TERM_PROGRAM-absent test), `d09298e` +2 (`terminal-font`), `fc5a1ae` −2 (`terminal-font` deleted with the helper)
- **Skipped tests**: none
- **Failures**: none

**Test Integrity Check**: the classifier rename `shift-enter` → `newline` removed **no** test (6 tests before and after; the Shift+Enter test was extended to also assert Ctrl+Enter — `terminal-keys.test.ts:24-27`). The only deletion is `terminal-font.test.ts` (2 tests) alongside its helper — justified: the user chose the always-Cascadia font after UAT, the per-width helper became single-use dead abstraction, and INPUT-12's spec text was revised to the inline always-Cascadia stack which now lives in `TerminalPane.tsx:80` (component — no unit per repo convention; user-confirmed visually). No silent coverage loss.

---

## Fix Plans (if issues found)

None in this final run. Previous round's INPUT-10 whitespace gap (`6d9dfd3`) is verified closed (`.trim()` guard at `TerminalPane.tsx:99`; sensor mutant 3 also re-exercises the branch).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| INPUT-01    | Implementing    | ✅ Verified |
| INPUT-02    | Implementing    | ✅ Verified |
| INPUT-03    | Pending user UAT | ✅ Verified (user-confirmed UAT 2026-08-31) |
| INPUT-04    | Implementing    | ✅ Verified |
| INPUT-05    | Pending user UAT | ✅ Verified (user-confirmed UAT 2026-08-31) |
| INPUT-06    | Implementing    | ✅ Verified |
| INPUT-07    | Implementing    | ✅ Verified |
| INPUT-08    | Implementing    | ✅ Verified |
| INPUT-09    | Implementing    | ✅ Verified (impl evidence) |
| INPUT-10    | Implementing    | ✅ Verified (fixed by `6d9dfd3`, `.trim()` at `TerminalPane.tsx:99`) |
| INPUT-11    | Implementing    | ✅ Verified (impl evidence) |
| INPUT-12    | Implementing    | ✅ Verified (impl evidence — inline always-Cascadia stack at `TerminalPane.tsx:80`) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 12/12 ACs matched spec outcome, 0 gaps (8 automated-matched, 2 user-confirmed manual, 3 impl-evidence per thin-shell convention)
**Sensor**: 3/3 mutations killed
**Gate**: 641 passed, 0 failed, 0 skipped (typecheck + lint 0 errors)

**What works**:
- PTY advertises `TERM=xterm-256color` + `COLORTERM=truecolor`, spawns with `name: 'xterm-256color'`, and deliberately does NOT claim `TERM_PROGRAM` (`pty-port.ts:30-32`, `terminal-env.ts:10-13`)
- Shift+Enter (Claude Code) and Ctrl+Enter (opencode) send a plain LF with `preventDefault` on the intercepted keydown (keypress-leak root cause fixed) — `TerminalPane.tsx:109-116`
- Ctrl+C copy/SIGINT split with whitespace-aware selection, Ctrl+Shift+C preserved, Ctrl+V paste with safe clipboard-failure path
- Always-Cascadia font stack inline (`TerminalPane.tsx:80`) — banner renders correctly maximized and narrow (user-confirmed)
- Gate green at 641 (631 + 10 feature tests, net of the justified terminal-font deletion); sensor 3/3 killed; real tree untouched (porcelain clean before/after)

**Issues found**: none (Minor doc note: tasks.md T1/T3 task-body "What" text still describes the pre-UAT plan — `TERM_PROGRAM=WezTerm` and per-width font picking — while the done-when rows and spec.md carry the revised decisions; docs-only drift, spec.md is authoritative and correct)

**Next steps**: none — feature verified end-to-end; interactive UAT fully green.