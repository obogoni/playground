# Terminal Input & Rendering Fixes Specification

## Problem Statement

The embedded agent terminals (xterm.js + node-pty) misbehave with CLI TUIs like
Claude Code. The Claude banner renders "broken" (box-drawing falls back to
ASCII, colors degrade) because the PTY spawns with `TERM=xterm-color`, which
Claude Code treats as a minimal terminal. Keyboard handling also breaks user
expectations: Ctrl+C never copies a selection (always SIGINT), Ctrl+V paste is
unreliable, and Shift+Enter cannot be distinguished from Enter because Claude
Code needs the kitty keyboard protocol (`ESC[13;2u`) plus a `TERM_PROGRAM` it
recognizes — neither of which the app provides.

## Goals

- [ ] The Claude Code banner renders with proper box-drawing and colors (manual check)
- [ ] Ctrl+C copies when there is a selection, still sends SIGINT otherwise
- [ ] Ctrl+V pastes reliably
- [ ] Shift+Enter sends `ESC[13;2u` so Claude Code inserts a newline instead of submitting

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Full kitty keyboard protocol (Ctrl+Enter, Shift+Tab, ...) via xterm upgrade | Requires upgrading `@xterm/xterm` to 6.1+/7.0 (new dependency, regression risk); the reported keys are covered by the manual handler. Revisit if more keys break |
| Fixing Claude Code's own TUI bugs (upstream) | Not our code; we only make the terminal environment correct |
| Terminal width / window size | The user's small monitor is addressed by the pane collapse feature; no auto font-shrink |
| Copy-on-Ctrl+C for other text inputs in the app | Terminal scope only |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| `TERM=xterm-256color` + `COLORTERM=truecolor` fix the banner | Yes — the degraded box-drawing/colors are Claude Code's documented response to a minimal `TERM` (issue #61569 family); 256color advertises the real capabilities of xterm.js | y |
| `TERM_PROGRAM` is NOT claimed | UAT 2026-08-31: with `TERM_PROGRAM=WezTerm`, Claude Code enters kitty-protocol mode and its CSI-u parsing on Windows misbehaves (newline + submit on Shift+Enter). Without it, Claude stays in legacy mode where a line feed is the universal newline | y |
| Shift+Enter / Ctrl+Enter send a plain line feed (`\n`, 0x0A) | Same byte as Claude Code's documented Ctrl+J newline; works on every terminal, no protocol negotiation | y |
| Intercepted keydowns call `preventDefault` | xterm 6.0.0 only calls `preventDefault` when it processes the keydown itself; a bare `return false` lets the browser's follow-up `keypress` of Enter leak `\r` (root cause of "newline + submit", found by reading the xterm bundle) | y |
| Terminal font is Cascadia Mono first, at every pane width | UAT 2026-08-31: the logo rendered broken with JetBrains Mono at ANY width (maximized = broken, narrow = correct; the only variable was the font — JetBrains lacks Claude's U+23BE/U+23BF corners, issue #39127). The user chose "Cascadia always" | y |
| The app's env wins over `process.env` for `TERM`/`COLORTERM` | Forced after merging, because the whole point is to override a broken/missing environment | y |
| xterm.js stays at 6.0.0 | No dependency change; newline is injected manually | y |
| Paste via explicit handler | Intercept Ctrl+V with `preventDefault` + `navigator.clipboard.readText()` + `term.paste()`, avoiding double-paste from the browser's native event | y |
| Non-agent sessions (ad-hoc) get the same env | Yes — the env is applied at the PTY port, which serves every session type | y |
| Validation is manual | TUI rendering and key chords need a live Claude session (repo convention: thin shells hand-verified; CDP smoke only) | y |
| Remaining implicit dimensions (concurrency, auth, persistence, external calls) | N/A — renderer key handling and PTY env; no async beyond clipboard reads | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Correct terminal environment for TUIs ⭐ MVP

**User Story**: As a user running Claude Code in the embedded terminal, I want
the PTY to advertise the terminal's real capabilities, so the banner renders
with box-drawing and full colors and Shift+Enter works.

**Why P1**: Environment identity is the root cause of the broken banner and of
the Claude-side refusal to parse extended keys.

**Acceptance Criteria** (each line is one EARS pattern):

1. The PTY SHALL spawn with `TERM=xterm-256color` and `COLORTERM=truecolor` in its environment. <!-- ubiquitous -->
2. The PTY SHALL NOT set `TERM_PROGRAM` (Claude Code's CSI-u mode misbehaves on Windows). <!-- ubiquitous -->
3. WHEN the user runs Claude Code in a session THEN the banner SHALL render with box-drawing characters and the full color palette (manual check). <!-- event-driven -->
4. WHEN the user presses Shift+Enter or Ctrl+Enter in the terminal THEN the app SHALL send a line feed (`\n`, 0x0A) to the PTY. <!-- event-driven -->
5. WHEN the user presses Shift+Enter in Claude Code THEN a newline SHALL be inserted instead of the prompt submitting (manual check). <!-- event-driven -->

**Independent Test**: Run `claude` in a session: banner renders correctly; type a line, press Shift+Enter, type another line — the prompt stays open with two lines.

---

### P1: Copy / paste / SIGINT behavior on the terminal ⭐ MVP

**User Story**: As a user, I want Ctrl+C to copy my selection (and still
interrupt without one) and Ctrl+V to paste, like every modern terminal.

**Why P1**: The reported keys; small, isolated handler change.

**Acceptance Criteria**:

1. WHEN the user presses Ctrl+C while the terminal has a selection THEN the app SHALL copy the selection to the clipboard and SHALL NOT send SIGINT to the PTY. <!-- event-driven -->
2. WHEN the user presses Ctrl+C without a selection THEN the app SHALL forward it to the PTY as before (SIGINT). <!-- event-driven -->
3. WHEN the user presses Ctrl+V in the terminal THEN the app SHALL paste the system clipboard text into the PTY. <!-- event-driven -->

**Independent Test**: Select text in the terminal and press Ctrl+C — clipboard holds it and the shell keeps running; press Ctrl+C with no selection — the running program is interrupted; Ctrl+V pastes.

---

## Edge Cases

- IF the clipboard read fails on Ctrl+V THEN the app SHALL do nothing and log the error (no crash, no partial paste). <!-- unwanted-behavior -->
- IF the selection is empty/whitespace on Ctrl+C THEN the app SHALL forward the chord to the PTY (SIGINT). <!-- unwanted-behavior -->
- IF the user presses Shift+Enter in a non-TUI shell THEN the shell SHALL receive a line feed and handle it like Enter (no visible side effect beyond the shell's own behavior). <!-- unwanted-behavior -->
- WHILE the terminal is rendered, its font family SHALL start with the Cascadia Mono fallback stack (`'Cascadia Mono', Consolas, 'JetBrains Mono', monospace`). <!-- state-driven -->
- IF the user presses Shift+Enter or Ctrl+Enter while a program is not running (bare shell prompt) THEN the shell SHALL receive a line feed and behave as it would for an Enter. <!-- unwanted-behavior -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| INPUT-01        | P1: Env | Design | Implementing |
| INPUT-02        | P1: Env | Design | Implementing |
| INPUT-03        | P1: Env | Design | Implementing |
| INPUT-04        | P1: Env | Design | Implementing |
| INPUT-05        | P1: Env | Design | Implementing |
| INPUT-06        | P1: Keys | Design | Implementing |
| INPUT-07        | P1: Keys | Design | Implementing |
| INPUT-08        | P1: Keys | Design | Implementing |
| INPUT-09        | Edge | -      | Implementing |
| INPUT-10        | Edge | -      | Implementing |
| INPUT-11        | Edge | -      | Implementing |
| INPUT-12        | Edge | -      | Implementing |

**ID format:** `INPUT-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 12 total, 12 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Claude Code banner renders with box-drawing and 256-color in a live session
- [ ] Ctrl+C copies with selection and interrupts without; Ctrl+V pastes
- [ ] Shift+Enter inserts a newline in Claude Code
- [ ] Gate (`typecheck && lint && test`) stays green