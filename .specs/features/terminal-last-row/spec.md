# Terminal Last Row Specification

**Scope size:** Medium (one component, one new pure helper, one new smoke script; no IPC, preload or main change). Planned with a short `design.md` (three non-obvious decisions and one project-level convention) and a formal `tasks.md` (5 tasks, the first one a measurement with a stop rule).
**Upstream issue:** #146 (owner-approved content, grilled and confirmed 2026-10-01).
**Builds on:** `agent-spike` (`TerminalPane`: "on resize → `fit()` + `session:resize`", `.specs/features/agent-spike/design.md:126`). No earlier spec covers the pane's padding.

## Problem Statement

Sometimes the last row of a session's terminal is cut by the bottom edge of the pane, hiding up to about half a line. With an agent's TUI this is the row holding its status line, so the developer loses what the agent is doing. It happens at some window heights and not others, with no clear trigger.

The likely cause, read from the code: the terminal opens into `.terminal-pane`, which has `padding: 8px 10px` and `box-sizing: border-box`. The fit addon reads that element's computed height, which includes the 16 px of vertical padding, and subtracts only the padding of xterm's own element (zero). It sizes the terminal from more height than there is, and the PTY is told the same wrong row count. A second gap: only a ResizeObserver triggers a refit, so a display scale change, which changes the cell size and not the element's CSS size, leaves the rows stale.

## Goals

- [ ] At every pane height, the bottom of the terminal's last row is inside the pane's visible box (zero px clipped, 0.5 px tolerance).
- [ ] At every pane height, the terminal's rows and the PTY's rows equal the rows that fit in the host's real height.
- [ ] After a display scale change, the terminal refits and the PTY gets the new size, with no window resize needed.
- [ ] The padding between the pane's edge and the terminal is unchanged: 8 px top and bottom, 10 px left and right.
- [ ] At every viewport, the terminal has the same number of columns as the current build has there.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Renderer type (DOM vs WebGL), font, line height | Owner decision (#146 Out of Scope) |
| The status bar and the session strip | Owner decision: they already resize the pane through the observer |
| Any change to the PTY resize path in main (`session-manager.ts` `resize`, `pty-port.ts`) | Owner decision (#146 Implementation Decisions) |
| A refit on a late web-font load | Not reported; the terminal's font stack (`Cascadia Mono`, `Consolas`) is local system fonts |
| Panes shorter than one row or narrower than two columns | The fit addon's floor (`MINIMUM_ROWS` 1, `MINIMUM_COLS` 2) applies; the app's layout does not reach those sizes in use |
| The `.terminal-pane .xterm-viewport::-webkit-scrollbar` rules | Unrelated to sizing; flagged in `design.md` Risks, left untouched |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here. Rows marked `owner confirmed 2026-10-01` come from #146 and are final.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Cause of the clipped row | The fit sizes rows from the padded element's computed height (padding included under `border-box`) and subtracts only `.xterm`'s padding; the extra row overflows the content box and `overflow: hidden` clips part of it | Read from `TerminalPane.css:4-14` and `@xterm/addon-fit` 0.11 `FitAddon.ts` `proposeDimensions` | owner confirmed 2026-10-01 |
| Cause verification | T1 measures it in the running app at many heights before any fix; if the measured cause differs from the predicted model (`design.md` §Predicted model), the plan goes back to the owner | The cause was read, not measured | owner confirmed 2026-10-01 |
| Fix shape | The component splits its container into an outer element and a host passed to `term.open`; the ResizeObserver watches the host. The outer element carries the vertical padding (`8px 0`); the host carries the horizontal padding (`0 10px`) with `box-sizing: border-box`, and no vertical padding | Owner decision, narrowed by the owner's choice to keep today's columns: the addon reads the host's border-box height (now unpadded, so rows are exact) and its border-box width (still the pane's full width, so columns are computed exactly as today; `FitAddon.ts:72-85`) | owner confirmed 2026-10-01 |
| Display scale refit | A `matchMedia` resolution query, re-armed after each change, triggers a refit that sends `session:resize` like any other resize | Owner decision | owner confirmed 2026-10-01 |
| Main process | No change to the PTY resize path | Owner decision | owner confirmed 2026-10-01 |
| How layout is verified | In the real app by a CDP smoke, not by unit tests: about 20 consecutive heights, checking the last row's bottom against the visible box and rows against ⌊available height / cell height⌋; first seen failing on the current build; prior art `scripts/smoke-agent.mjs` | Owner decision; layout has no honest unit test | owner confirmed 2026-10-01 |
| What "same spacing as today" means | The 8 px / 10 px padding between the pane's border and the terminal's text area is unchanged, and the first row's text starts at the same offset from the pane as today. The leftover under the last row (less than one cell) sits inside the host, so the gap below the last row becomes 8 px plus that leftover, never less than 8 px | The owner's fix (no vertical padding on the host) makes this the only reading that holds at every height; today's bottom gap is negative at some heights, which is the bug | owner confirmed 2026-10-01 |
| Columns after the split | Keep today's columns: for the same viewport width, height and display scale, the terminal has the same column count as on the current build, and the right edge looks as it does today | Owner choice. The host keeps the 10 px horizontal padding under `border-box`, so the addon reads the same width as today and subtracts the same 14 px scrollbar lane | owner confirmed 2026-10-01: keep today's columns |
| How the smoke changes the height | CDP `Emulation.setDeviceMetricsOverride` with a fixed width and 1 px height steps, not an OS window resize. If Electron accepts `Browser.setWindowBounds`, T1 repeats 3 heights with a real resize and the numbers must match | Prior art (`scripts/smoke-status-bar.mjs:642`); deterministic, free of the OS window's minimum size and frame | owner confirmed 2026-10-01 |
| Sweep size | At DPR 1: max(20, ⌈cell height⌉ + 3) consecutive heights, so every integer remainder of the cell height occurs. Also 20 heights at DPR 1.25 and at 1.5 | The issue asks for about 20; fractional cell heights at a scaled display are where rounding errors live | owner confirmed 2026-10-01 |
| How the display scale refit is verified | CDP `deviceScaleFactor` emulation, if T3 shows the page honestly sees it (`devicePixelRatio` changes, the resolution query matches, xterm's cell height changes). Otherwise the smoke drops the section and the refit is covered by the helper's unit tests plus a hand check that changes the Windows display scale with the app open | An emulation the terminal does not react to would make a check that cannot fail | owner confirmed 2026-10-01 |
| The PTY's row count in the smoke | Read from a throwaway fill script run as the session's ad-hoc command: it draws one line per row and prints `ROWS=<n> COLS=<m>` on the last row, from `process.stdout.getWindowSize()`. The smoke reads the marker from the session's output stream, since the WebGL renderer draws the text on a canvas | End-to-end (what the TUI is told) without a new IPC | owner confirmed 2026-10-01; stream read added 2026-10-03 (WebGL, `design.md` §Renderer Amendment) |

**Open questions:** none. All are resolved or logged above, and the owner confirmed every row on 2026-10-01.

---

## User Stories

### P1: The last row is fully visible at every height ⭐ MVP

**User Story**: As a developer watching an agent, I want the terminal's last row always fully visible, at any window size, so that I can read the agent's status line without nudging the window (#146 stories 1, 2).

**Why P1**: It is the reported defect.

**Acceptance Criteria**:

1. The terminal SHALL open into a host element with zero vertical padding, zero border, `padding-left` and `padding-right` of 10 px and `box-sizing: border-box`, placed inside the `.terminal-pane` element, which carries `padding: 8px 0`  <!-- ubiquitous -->
2. The ResizeObserver that triggers a refit SHALL observe the host element  <!-- ubiquitous -->
3. WHEN the host's size changes THEN the terminal SHALL have ⌊⌊H⌋ / h⌋ rows, where H is the host's content height and h the CSS cell height; at a non-integer device pixel ratio a count whose total height is within 0.5 px of that bound SHALL also pass (xterm rounds its canvas to whole device pixels)  <!-- event-driven -->
4. WHEN the host's size changes THEN the bottom of the terminal's last row SHALL be at or above the bottom of the pane's visible box (the viewport intersected with the padding box of every ancestor whose `overflow-y` is not `visible`), within 0.5 px  <!-- event-driven -->
5. WHEN the host's size changes THEN the right edge of the terminal's last column SHALL be inside the pane's visible box, within 0.5 px  <!-- event-driven -->
6. WHEN the viewport has a given width, height and display scale THEN the terminal SHALL have the same number of columns as the current build has at that viewport (today: ⌊(⌊B⌋ − 14) / w⌋, B the width the addon reads, which includes the 20 px of horizontal padding, and w the CSS cell width)  <!-- event-driven -->

**Independent Test**: The smoke sweeps the pane through consecutive heights and every probe passes AC 3 and 4; the same sweep fails on the current build. A width sweep compares the column count at each viewport with a baseline recorded on the current build (AC 6).

---

### P1: The agent is told the real size ⭐ MVP

**User Story**: As a developer, I want the agent's TUI to be told the real number of rows, so that it lays itself out to the space it has (#146 story 3).

**Why P1**: The wrong count is what makes the TUI draw its status line into the clipped row.

**Acceptance Criteria**:

1. WHEN the terminal refits THEN the renderer SHALL send `session:resize` with the terminal's new `cols` and `rows`  <!-- event-driven -->
2. WHEN a refit settles THEN a program in the session SHALL read the same rows and columns from its console as the terminal shows  <!-- event-driven -->
3. The main process's resize path (`session-manager.ts` `resize`, `pty-port.ts`) SHALL stay unchanged  <!-- ubiquitous -->

**Independent Test**: The fill script's last line reads `ROWS=<n>` with n equal to the terminal's rows at every probe, and that line is inside the visible box.

---

### P1: The pane looks as it does today ⭐ MVP

**User Story**: As a developer, I want the terminal's spacing to look as it does today, so that nothing else changes (#146 story 5).

**Why P1**: The fix moves the padding; nothing the developer sees or does around the text may move with it.

**Acceptance Criteria**:

1. The content box of the element `.xterm` opens into SHALL be inset 8 px from the top and bottom and 10 px from the left and right of the `.terminal-pane` border box, within 0.5 px (on the current build that element is `.terminal-pane` itself; on the fixed build it is the host)  <!-- ubiquitous -->
2. The first row's text SHALL start at the same offset from the `.terminal-pane` border box as on the current build (10 px, 8 px), within 0.5 px  <!-- ubiquitous -->
3. The "Copiado" chip SHALL keep its position relative to the `.terminal-pane` border box (14 px from the right, 10 px from the top), within 0.5 px  <!-- ubiquitous -->
4. WHEN the developer right-clicks, Ctrl+clicks a link or drops files anywhere in the pane, padding included THEN the pane SHALL behave as on the current build (copy or paste, open the link, paste the paths)  <!-- event-driven -->

**Independent Test**: The smoke reads the three offsets on the current build and on the fixed build and they match; the gestures are a hand check.

---

### P2: Refit on a display scale change

**User Story**: As a developer moving the window between monitors with different scaling, I want the terminal to refit, so that rows don't go stale (#146 story 4).

**Why P2**: Less frequent than a resize, and the same fix shape; the reported clipping is the resize case.

**Acceptance Criteria**:

1. WHEN `devicePixelRatio` changes THEN the pane SHALL refit and send `session:resize`, after xterm has re-measured its cell, with no change to the host's CSS size  <!-- event-driven -->
2. WHEN `devicePixelRatio` changes again, any number of times THEN the pane SHALL refit after each change (the resolution query is re-armed with the new ratio)  <!-- event-driven -->
3. WHEN the pane unmounts (session switch, view switch, session stop) THEN its display scale listener SHALL be removed and no refit SHALL run afterwards  <!-- event-driven -->
4. WHEN a display scale change settles THEN P1 "last row" AC 3 and 4 SHALL hold  <!-- event-driven -->

**Independent Test**: With the pane at a fixed CSS height, change the device scale factor 1 → 1.25 → 1.5 → 2; after each step rows match the new cell height and the last row is inside the visible box. Without the refit, at least one step leaves rows stale.

---

## Edge Cases

- WHEN the host's content height is an exact multiple of the cell height THEN the terminal SHALL fill it with no leftover and the last row's bottom SHALL equal the host's bottom, within 0.5 px
- WHEN the leftover below the last full row is one px short of a cell THEN the terminal SHALL NOT add a row
- WHEN the developer drags the window edge quickly THEN the terminal SHALL satisfy P1 AC 3 and 4 once the last ResizeObserver delivery has run
- WHEN the developer switches session THEN the new pane SHALL fit on mount as today, and the old pane's display scale listener SHALL be gone
- WHEN the display scale changes while no terminal is mounted THEN the next pane SHALL fit with the current ratio on mount, with no listener involved
- WHEN a display scale change and a size change land in the same frame (browser zoom) THEN the final rows SHALL match the final cell height and host size

### Implicit-requirement dimensions (Medium: the ones present)

- **Concurrency / ordering:** the display scale refit runs after xterm's own re-measure (P2 AC 1); `design.md` §Tech Decisions sets the ordering.
- **Data lifecycle:** the display scale listener lives and dies with the pane (P2 AC 3).
- **Failure states:** zero or undefined dimensions keep today's handling (the addon returns no proposal; main skips zero sizes, `session-manager.ts:324-326`).
- Remaining dimensions (validation, idempotency, auth, expiry, observability, external dependencies, state transitions) N/A for this scope: no input, no persisted state, no network.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TROW-01 | P1: Last row visible (AC 1-2, host split) | Execute | Done (T2) |
| TROW-02 | P1: Last row visible (AC 3, rows that fit; Edge Cases 1-3) | Execute | Done (T1, T2) |
| TROW-03 | P1: Last row visible (AC 4, last row inside the visible box) | Execute | Done (T1, T2) |
| TROW-04 | P1: Last row visible (AC 5, last column inside the visible box) | Execute | Done (T1, T2) |
| TROW-05 | P1: Real size (AC 1-2, PTY gets the size) | Execute | Done (T1, T2) |
| TROW-06 | P1: Real size (AC 3, main unchanged) | Execute | Done (T2) |
| TROW-07 | P1: Same look (AC 1-3, offsets) | Execute | Done (T1, T2) |
| TROW-08 | P1: Same look (AC 4, gestures in the padding) | Execute | Done (T2 (Ctrl+click: owner hand check)) |
| TROW-09 | P2: Display scale (AC 1, 4, refit after re-measure) | Execute | Done (T3, T4, T5) |
| TROW-10 | P2: Display scale (AC 2-3, re-arm and dispose; Edge Cases 4-6) | Execute | Done (T3, T4, T5) |
| TROW-11 | P1: Last row visible (AC 6, columns equal the current build's at the same viewport) | Execute | Done (T1, T2) |

**ID format:** `TROW-NN`.

**Coverage:** 11 total, 11 mapped to tasks (T1-T5), 0 unmapped.

---

## Success Criteria

- [ ] `scripts/smoke-terminal-rows.mjs` fails on the current build at the heights the model predicts, then passes every probe at DPR 1, 1.25 and 1.5 on the fixed build
- [ ] The column count at every probed viewport equals the current build's baseline, and differs from it when the host's horizontal padding is removed (mutant)
- [ ] With the vertical padding put back on the host (mutant), the rows checks fail again; with the display scale refit removed (mutant), the scale checks fail
- [ ] The three offsets (host inset, text origin, chip) match the current build within 0.5 px
- [ ] `npm run typecheck && npm run lint && npm test` stays green, with the new helper's unit tests added
