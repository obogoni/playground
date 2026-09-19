# Session Strip Polish Specification

## Problem Statement

The session detail strip has two rough edges the owner hits every day.

The activity pill renders the agent's tool name exactly as Claude Code reports it
(`detailPillText`, `session-activity.ts:66`), and that name arrives raw from the hook payload
(`activity-machine.ts:96`). A native tool is short — `Bash`, `Read` — but an MCP tool is not:
`mcp__azure-devops__wit_work_item` is 32 characters, and `.agents-detail-pill` has no
`max-width` (`AgentsView.css:106`), so the pill grows and pushes the rest of the strip.

Pausing a session's clock costs a trip to a dedicated button (`AgentsView.tsx:219`) that sits
beside the counter it controls, in a row that already holds four other buttons. The counter
itself is inert text.

## Goals

- [ ] An MCP tool call reads as `MCP <server>` in the pill instead of a 32-character identifier
- [ ] The raw tool name stays reachable, so shortening never costs information
- [ ] Pausing and resuming a session's clock is a click on the clock itself
- [ ] The strip loses a button without losing keyboard access or screen-reader semantics
- [ ] Nothing outside the session detail strip changes

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Shortening the tool name in the rail row tooltip | Owner decision (grill Q2): the tooltip has room, and it becomes the place the technical name survives in full |
| Shortening the tool name in the OS notification body (`Needs approval to run …`, `activity-notification.ts:58`) | Owner decision (grill Q2). Keeping main untouched also keeps the formatter renderer-local, with no new `src/shared/` module |
| A width cap on the pill | Owner decision (grill Q5). Recorded as accepted risk in Assumptions: `activity.error` from `StopFailure` is still a raw string and can still push the strip |
| Pausing from the rail row counter or from any total (group head, worktree detail, task card) | Owner decision (grill Q3): the rail row's click selects the session, and a total is an aggregate with no single session to pause |
| A paused indicator on the rail row counter | Owner decision (grill Q14): paused is state you read in the session you have open |
| Changing what pausing does to the time log | `TimeTracker` and the `time:pause` / `time:resume` IPC are reused unchanged; this feature only moves the trigger |
| Pausing a session that is not running | Today's buttons only exist while running (`AgentsView.tsx:206`); there is no open period to close |
| Normalizing the server name for readability | Owner decision (grill Q7): the literal id is what appears in MCP configuration and logs |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Shortening rule | `mcp__<server>__<tool>` renders as `MCP <server>` | The server identifies the integration, which is what the owner recognizes at a glance; the specific MCP tool rarely is | y |
| Server segment rendering | Literal, no case or separator normalization | It is the id used in MCP configuration and logs; normalizing breaks that match | y |
| `MCP ` prefix | Kept, spelled exactly `MCP ` | Distinguishes an MCP call from a native tool of the same name, at a fixed 4-character cost | y |
| Unparseable `mcp__…` | Rendered raw | Degrades honestly instead of inventing a name; surfaces a rule that needs fixing | y |
| Where the formatter lives | `src/renderer/src/lib/session-activity.ts`, beside `detailPillText` | Scope is the pill only, so main never needs it; the file already carries unit tests | y |
| Pill still long | Accepted. No `max-width`, no truncation | Owner decision. The residual risk is a long `activity.error` or a long server name pushing the strip — known, not forgotten | y |
| Discovering the raw name | The pill's `title` carries the raw `tool_name` | Costs nothing and keeps the technical name one hover away | y |
| Counter tooltip | `current run <hh:mm:ss> · click to pause` / `· click to resume` | Preserves TIME-23's data and teaches the gesture in the same hover | y |
| Counter element | `<button type="button">` with `aria-pressed` | Inherits the keyboard and screen-reader semantics the removed button had, instead of dropping them | y |
| How the rail keeps its counter inert | The interactive behaviour is opt-in via prop; `SessionClock` is shared with the rail row (`SessionRail.tsx:338`) | Without a prop the rail row would inherit a click target inside a row whose click selects the session | y |
| A session paused and then stopped | Keeps its paused flag; the counter goes inert until respawn | Exactly today's behaviour — the buttons already disappear when the session stops | y |
| Branch base | `feature/session-strip-polish` cut from `develop` | The badge half exists only on the `#88`/`#94` line and the timer half only on `#93`; `develop` is the one ref holding both. PR to upstream after `git rebase --onto origin/main develop` once those merge | y |
| Verification split | Pure formatter unit-tested in `session-activity.test.ts`; both halves driven by a new CDP smoke | Matches the project convention (`TESTING.md`): pure seams tested, components hand-verified, CDP for the integration | y |
| How the smoke reaches an MCP activity | **[corrected at Tasks]** A throwaway registry agent whose command is `claude --version`: it passes the hook rule (`session-manager.ts:320-325`), gets `--settings` injected, prints the version and exits spending no tokens, and leaves its host shell running with `PLAYGROUND_ACTIVITY_TOKEN` in its environment. The smoke types into that terminal an `Invoke-RestMethod` POST of a `PreToolUse` with an MCP `tool_name` to the hook URL read from the settings file, authorized with `$env:PLAYGROUND_ACTIVITY_TOKEN` | The grilled mechanism — an ad-hoc `pwsh` session plus a token read from the settings file — was built on two false premises, both verified at Tasks: ad-hoc sessions get no hooks, and the file carries only `Bearer $PLAYGROUND_ACTIVITY_TOKEN` (`claude-hook-settings.ts:64`), never the token. The owner's decision — a synthetic POST, zero tokens, deterministic — is kept; only the route to the token changes. Registering and removing a throwaway agent is `smoke-activity.mjs`'s own precedent | y |
| Local install after merge | Decided after the gate is green, not now | Owner decision (grill Q18) | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: An MCP tool call reads at a glance ⭐ MVP

**User Story**: As the developer watching a session, I want an MCP tool call to show which MCP
server the agent is calling, so that the pill tells me something useful without swallowing the
strip.

**Why P1**: It is the reported defect — the strip visibly breaks when the Azure DevOps MCP runs.

**Acceptance Criteria**:

1. WHEN the activity's tool name matches `mcp__<server>__<tool>` THEN the detail pill SHALL render `MCP <server>` in place of that tool name <!-- event-driven -->
2. The system SHALL render the `<server>` segment exactly as received, without changing case, underscores or hyphens <!-- ubiquitous -->
3. IF the tool name starts with `mcp__` but does not match `mcp__<server>__<tool>` with both segments non-empty THEN the pill SHALL render the tool name unchanged <!-- unwanted-behavior -->
4. WHEN the tool name does not start with `mcp__` THEN the pill SHALL render it unchanged <!-- event-driven -->
5. WHILE the activity carries a tool name the pill SHALL expose that raw tool name as its `title` attribute <!-- state-driven -->
6. The rail row tooltip and the OS notification body SHALL keep rendering the raw tool name <!-- ubiquitous -->

**Independent Test**: Drive a session to `working` with `tool_name: "mcp__azure-devops__wit_work_item"`; the pill reads `working · MCP azure-devops` and its tooltip reads the full identifier, while the rail row tooltip still shows the raw name.

---

### P1: Pause by clicking the clock ⭐ MVP

**User Story**: As the developer with a session open, I want to pause and resume its clock by
clicking the clock, so that the strip does not need a separate button for it.

**Why P1**: The second half of the reported change; the button removal is only safe once the
click works.

**Acceptance Criteria**:

7. WHILE a session is running and its time is counting, WHEN the user activates the detail-strip counter THEN the system SHALL pause that session's counting <!-- complex -->
8. WHILE a session is running and its time is paused, WHEN the user activates the detail-strip counter THEN the system SHALL resume that session's counting <!-- complex -->
9. WHILE a session is running the detail-strip counter SHALL render a `pause` icon while counting and a `play` icon while paused <!-- state-driven -->
10. WHILE a session is running the detail-strip counter SHALL be a `<button>` whose `aria-pressed` is `true` while paused and `false` while counting <!-- state-driven -->
11. WHEN the counter holds keyboard focus and the user presses Enter or Space THEN the system SHALL toggle that session's counting <!-- event-driven -->
12. WHILE a session is running the counter's `title` SHALL read `current run <hh:mm:ss> · click to pause` while counting and `current run <hh:mm:ss> · click to resume` while paused <!-- state-driven -->
13. IF the session is not running THEN the counter SHALL render as plain text with no icon, no `aria-pressed` and no click handler <!-- unwanted-behavior -->
14. The session detail strip SHALL NOT render a `Pause time` or `Resume time` button <!-- ubiquitous -->
15. The rail row counter and every total counter (group head, worktree detail, pinned task card) SHALL render exactly as they do today <!-- ubiquitous -->

**Independent Test**: With a running session selected, click its counter: the number freezes, the icon becomes `play`, `aria-pressed` reads `true`, and the actions row holds no time button. Click again: it advances.

---

## Edge Cases

- IF the activity carries no tool name THEN the pill SHALL render the state (and subagent count or error) exactly as today
- IF the tool name is `mcp__<server>__` or `mcp____<tool>` (an empty segment) THEN the pill SHALL render it raw, per STRP-03
- IF the tool name contains more than two `__` separators (`mcp__srv__a__b`) THEN the pill SHALL render `MCP srv`, treating everything after the second separator as the tool
- WHEN a session is paused and then stops THEN the counter SHALL go inert while the session keeps its paused flag
- WHEN a session is respawned while paused THEN the counter SHALL become interactive again and report the paused state it kept

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| STRP-01 | P1: MCP tool call reads at a glance | Tasks | Pending |
| STRP-02 | P1: MCP tool call reads at a glance | Tasks | Pending |
| STRP-03 | P1: MCP tool call reads at a glance | Tasks | Pending |
| STRP-04 | P1: MCP tool call reads at a glance | Tasks | Pending |
| STRP-05 | P1: MCP tool call reads at a glance | Tasks | Pending |
| STRP-06 | P1: MCP tool call reads at a glance | Tasks | Pending |
| STRP-07 | P1: Pause by clicking the clock | Tasks | Pending |
| STRP-08 | P1: Pause by clicking the clock | Tasks | Pending |
| STRP-09 | P1: Pause by clicking the clock | Tasks | Pending |
| STRP-10 | P1: Pause by clicking the clock | Tasks | Pending |
| STRP-11 | P1: Pause by clicking the clock | Tasks | Pending |
| STRP-12 | P1: Pause by clicking the clock | Tasks | Pending |
| STRP-13 | P1: Pause by clicking the clock | Tasks | Pending |
| STRP-14 | P1: Pause by clicking the clock | Tasks | Pending |
| STRP-15 | P1: Pause by clicking the clock | Tasks | Pending |

**Coverage:** 15 total, 15 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] With the Azure DevOps MCP running, the pill reads `working · MCP azure-devops` and the strip's buttons stay in place
- [ ] The raw `mcp__azure-devops__wit_work_item` is one hover away, on the pill and on the rail row
- [ ] Pausing and resuming a session's clock takes one click on the clock, with no time button in the strip
- [ ] The counter is reachable by Tab and toggles with Enter and Space
- [ ] The gate is green: `npm run typecheck && npm run lint && npm test`, with the formatter's unit tests added
- [ ] The new CDP smoke passes both halves against a running dev app, spending no agent tokens and leaving no period behind
