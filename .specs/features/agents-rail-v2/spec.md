# Agents Rail v2 — Group Sessions by Task Specification

**Design source of truth:** `design/handoff/DESIGN_HANDOFF_AGENTS_RAIL_V2.md`
(imported from the owner's handoff; replaces **only** section C-a of
`DESIGN_HANDOFF_AGENTS.md`). Every pixel value, token and colour rule below
defers to that document — except where an Assumptions row records that the
handoff has been overtaken by merged work.

**Base:** `feature/agents-rail-v2`, branched from `origin/main` at `83e67ce`
(PR #86). `SessionRail.tsx` / `SessionRail.css` are untouched by everything
merged since the handoff was written.

## Problem Statement

Every session card in the 344px agents rail repeats four lines — agent title,
worktree name, full branch path, task tag — so two agents on one worktree
duplicate the same task information twice, and the **task title, the most
useful label, lands on the fourth line in the smallest type**. The rail is the
master list for the Agents direction; today it is the least scannable surface
in the app.

Rail v2 states the task **once** as a group header and reduces each session to
one compact row. Worktree name and branch path leave the rail entirely — both
are already shown at full width in the terminal header and attribution strip.

## Goals

- [ ] A task's identity (`#id`, type, state, title) renders **exactly once** per
      task group, regardless of how many sessions sit under it
- [ ] A session occupies **one row** (~34px) instead of a multi-line card, so
      more sessions fit the 344px rail without scrolling
- [ ] Group and row order stay **byte-stable** across status changes — starting
      or stopping a session never reshuffles the rail
- [ ] Grouping is **derived at render time**; no schema change, no new persisted
      field

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| The terminal detail pane (`SessionDetail` in `AgentsView.tsx`) | The handoff scopes the change to the rail; the detail pane, its header pill, rename and attribution strip are unchanged |
| The `shell` / `agent-exited` short status and the `agentLive` field | The handoff §2 lists `agentLive` as available data, but `SessionStatus` in `src/shared/config.ts` is `'running' \| 'stopped'` only and the amber sub-status was deferred to AM3 and never built. Lighting it needs main-process agent-process detection — a separate feature (see Assumptions) |
| Group collapse / expand | Handoff §6: "Groups are **always expanded**. No collapse affordance in this revision." |
| Last-output preview (`session.lastOutput` tail) | Handoff §5 drops it from the rail; the data stays on `SessionView` and is read in the terminal |
| Rail header, New-session button, concurrency warning | Handoff §3: "unchanged from v1" |
| Renderer DOM/component test harness (jsdom, testing-library) | `.specs/codebase/TESTING.md` states React components are deliberately not unit-tested; this feature follows that convention via an extracted pure module (see Assumptions) |
| Dialogs, entry points, design tokens | Handoff preamble: unchanged elsewhere |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| The `shell` short status ("agent exited, shell live") | **Dropped from this feature.** The rail ships `running` / `stopped` / `path missing` only. `rowStatus()` returns a closed union that a future `shell` member slots into without touching call sites | The handoff asserts `agentLive` is "already available"; it is not — `src/shared/config.ts:10` defines `SessionStatus = 'running' \| 'stopped'` and comments the amber sub-status as AM3-deferred. Building it means PTY child-process tracking in `session-manager.ts`, an `agentLive` field on `SessionView`, IPC contract changes and a matching terminal-header pill — a separate feature, not a rail relayout | y (owner, 2026-09-13) |
| Two rows in the same group sharing an agent name | **Ordinal disambiguation.** When ≥2 sessions in one group resolve to the same agent name, every one of them renders `<agentName> <n>`, `n` 1-based in group order. A name unique within its group renders bare | The handoff replaces the editable session title with the agent name, so two Claude sessions on one worktree — its own acceptance checklist calls this the normal case — would render as two identical `Claude` rows distinguishable only by hovering. The ordinal is deterministic, testable and survives the session title being renamed; the full title stays in the row tooltip and the terminal header | y (owner, 2026-09-13) |
| Ordinal scope | **Per group**, not per rail | Two `Claude` rows under *different* task headers are already separated by their headers; numbering them globally would add noise where there is no ambiguity | n |
| How acceptance criteria are gated | **Extract a pure module** `src/renderer/src/lib/rail-groups.ts` (grouping, order, orphan classification, status precedence, row labels, tooltips, keyboard order) with co-located `rail-groups.test.ts`; presentation and interaction verified by `scripts/smoke-rail-v2.mjs` plus a two-theme visual pass | Mirrors the project's governing test principle (`.specs/codebase/TESTING.md`: "extract pure/decision logic into a testable seam, unit-test that seam, and hand-verify the thin shell") and the existing `session-attribution.ts` / `task-pills.ts` / `tree-selection.ts` precedent. No jsdom or testing-library exists in the repo | y (owner, 2026-09-13) |
| A group whose task ID resolves but whose pin has no details (unpinned ID, or details not yet fetched) | Header row 1 shows `#<taskId>` with **no** type/state pill; header row 2 shows the **branch** in mono `var(--text-muted)` instead of a task title | The handoff §4.2 assumes a pinned task with details. `linkedPinFor()` returns null for an unpinned ID and `details` is null until a fetch resolves, so a third header variant is unavoidable. The branch is the only name available, matching the orphan treatment | n |
| A session that is both `running` and `pathMissing` | **Status precedence `running` > `path missing` > `stopped`.** Label/colour and the action set both follow that order | Preserves today's `SessionRail.tsx` behaviour exactly (running wins the action slot; `path missing` is shown as a tag) and keeps the handoff's action table unambiguous |  n |
| Orphan reason precedence when more than one applies | `missing` > `detached` > `untagged` | `pathMissing` is the fact with a red treatment and a Remove-only action, so it must not be masked by the softer notes |  n |
| ↑/↓ semantics | **Focus moves, selection does not follow.** `Enter`/`Space` on the focused row selects it | The handoff says "↑/↓ moves between rows" without saying whether the terminal swaps. Selection-follows-focus would remount `TerminalPane` (keyed by session id) on every keypress, tearing down and re-attaching a PTY stream per arrow press | n |
| ↑/↓ at the first / last row | **Stops; does not wrap** | Matches the rail's `role="listbox"` reading as a bounded list and avoids a keypress silently jumping the viewport from bottom to top |  n |
| The type→colour map the handoff parenthesises as "Bug → `--red`, Feature → `--accent`, Chore → `--amber`" | **Superseded — reuse `typeClass()` from `lib/task-pills.ts`** (ADO process colours, AD per `workitem-type-colors`) | The handoff parenthetical predates the merged `workitem-type-colors` feature; `typeClass()` is the app-wide map the handoff's own "same map as the rest of the app" clause points at |  n |
| The agent→colour map the handoff §4.4 calls "unchanged (Claude `--accent`, Copilot `--blue`, Codex `--green`, ad-hoc `--amber`)" | **Superseded — reuse `agentColor()` from `lib/agent-color.ts` and render whatever the registry holds.** The seeded list is now four agents; `opencode` is `--amber`, the same tint `agentColor()` returns for the `Ad-hoc` label | `SEEDED_AGENTS` gained `opencode` on `origin/main` (PR #85, base `83e67ce`), after the handoff was written. The rail must not hard-code a four-entry map or it breaks the moment the user edits the registry — `agentColor()` is already the single source and handles the unknown-agent fallback (RAIL-27). The amber collision is pre-existing, shared with the terminal header and detail tile, and is out of scope to resolve here — but the two-theme visual pass must cover it so we know how it reads at 22×22 | n |
| Remaining implicit dimensions (persistence, auth, rate limits, external calls, concurrency, data lifecycle, observability, external-dependency failure, idempotency) | **N/A** for this scope | A pure renderer relayout over data already in the renderer's props. It persists nothing, calls nothing, and starts no async work — the only state-transition concern (status changes must not reorder) is covered by RAIL-03 |  y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: The rail groups sessions by task ⭐ MVP

**User Story**: As a developer running several agents, I want the rail to state
each task once as a group header with one compact row per session, so that the
task title is the first thing I read and duplicated worktree/branch text stops
consuming the rail.

**Why P1**: This is the feature. The grouping, the header and the compact row
are one visual change — half of it is not demo-able.

**Acceptance Criteria** (each line is one EARS pattern):

1. The system SHALL derive rail groups at render time from `sessions`, `tree`
   and `tasks` without reading or writing any persisted grouping field. <!-- RAIL-01, ubiquitous -->
2. WHEN a session's `cwd` matches a worktree whose branch yields a task ID via
   `taskIdFromBranch` THEN the system SHALL assign that session the group key
   `task:<taskId>`, otherwise the group key `session:<session.id>`. <!-- RAIL-02, event-driven -->
3. WHEN two sessions resolve to the same task ID from different worktrees THEN
   the system SHALL place both in one group and take the header's branch from
   the **first** session's resolved worktree. <!-- RAIL-03, event-driven -->
4. The system SHALL order groups by the first appearance of their key while
   iterating `sessions` in their persisted order, and order rows within a group
   by that same iteration. <!-- RAIL-04, ubiquitous -->
5. WHEN a session's `status` changes from `running` to `stopped` or back THEN
   the system SHALL produce the identical group order and row order as before
   the change. <!-- RAIL-05, event-driven -->
6. The system SHALL never merge two orphan sessions into one group. <!-- RAIL-06, ubiquitous -->
7. WHERE a group's task ID resolves to a pinned task with details THEN the
   group header SHALL render a type pill coloured by `typeClass(badgeTypeOf(details))`,
   the text `#<taskId>`, a state pill coloured by `stateClass(details.state)`,
   and the task title clamped to 2 lines with the branch as its `title`
   attribute. <!-- RAIL-07, optional-feature -->
8. WHERE a group's task ID resolves but no pinned details are available THEN the
   group header SHALL render `#<taskId>` with no pills, and the branch name in
   place of the task title. <!-- RAIL-08, optional-feature -->
9. IF a session's `cwd` matches no worktree in the tree THEN the system SHALL
   render it as a single-row orphan group labelled with the `cwd` folder leaf
   and the note `detached · <folder>`. <!-- RAIL-09, unwanted-behaviour -->
10. IF a session's worktree resolves but its branch yields no task ID THEN the
    system SHALL render it as a single-row orphan group labelled with the branch
    and the note `untagged worktree`. <!-- RAIL-10, unwanted-behaviour -->
11. IF a session has `pathMissing` true and resolves to no task THEN the system
    SHALL render it as a single-row orphan group with the note
    `worktree path missing` in `var(--red)`, taking precedence over the
    `detached` and `untagged worktree` notes. <!-- RAIL-11, unwanted-behaviour -->
12. The system SHALL render each session row as a 22×22 agent tile tinted by
    `agentColor`, the row label — the agent's own session name when it reports
    one (SNAME-01), else the agent's display name — a short status label, a
    status dot, and the action buttons for its state — and SHALL NOT render the
    worktree name, the branch line, or the last-output preview anywhere in a
    row. <!-- RAIL-12, ubiquitous -->
13. WHEN two or more sessions in one group share a row label THEN the system
    SHALL label each of them `<label> <n>` with `n` 1-based in group order,
    and SHALL leave a label that is unique within its group unsuffixed. <!-- RAIL-13, event-driven -->

    > Amended 2026-09-19 for `session-name` (AD-040, the AD-018 precedent):
    > RAIL-12 and RAIL-13 said "the agent's display name" / "an agent name";
    > the label may now be the session's own name. Everything else in the row
    > is unchanged.
14. The system SHALL resolve a row's short status by the precedence
    `running` → `running`/`--green`, else `pathMissing` → `path missing`/`--red`,
    else `stopped`/`--text-faint`. <!-- RAIL-14, ubiquitous -->
15. The system SHALL set every row's `title` attribute to
    `<session.title> · <branch>`, substituting `session.cwd` for the branch when
    the session is detached. <!-- RAIL-15, ubiquitous -->
16. The system SHALL offer **Stop** on a running row, **Remove** only on a
    non-running `pathMissing` row, and **Respawn** then **Remove** on any other
    stopped row. <!-- RAIL-16, ubiquitous -->
17. WHEN a row action button is clicked THEN the system SHALL invoke that action
    and SHALL NOT change the selected session. <!-- RAIL-17, event-driven -->
18. WHEN a row is clicked THEN the system SHALL make that session active, tint
    the row with `color-mix(in oklab, var(--accent) 12%, transparent)` and give
    its group card the border
    `1px solid color-mix(in oklab, var(--accent) 45%, var(--border))`. <!-- RAIL-18, event-driven -->

**Independent Test**: With two agents on one worktree plus a detached session,
the rail shows one two-row task group whose `#id` and title appear once, and one
single-row orphan group reading `detached · <folder>`. Stopping either agent
leaves both group and row order unchanged.

---

### P2: The rail is keyboard-navigable and screen-reader legible

**User Story**: As a keyboard user, I want to walk the rail's rows with the
arrow keys and hear which task each row belongs to, so that the grouped rail is
no less operable than the flat card list it replaces.

**Why P2**: The v1 rail was already keyboard-operable via `Tab` and
`role="button"`; the grouped rail is usable on day one without arrows. The
listbox semantics are a correctness obligation, not the reason to ship.

**Acceptance Criteria**:

1. The system SHALL expose the rail scroll body as `role="listbox"`, each group
   as `role="group"` with `aria-label` `#<taskId> <task title>` (for an orphan
   group, **the same label RAIL-09/10/11 define for that orphan's reason** — the
   `cwd` folder leaf when detached, the branch otherwise), and each row as
   `role="option"`. <!-- RAIL-19, ubiquitous -->
2. The system SHALL set `aria-selected="true"` on the active session's row and
   `aria-selected="false"` on every other row. <!-- RAIL-20, ubiquitous -->
3. WHEN `ArrowDown` is pressed on a focused row THEN the system SHALL move focus
   to the next row in visual order, crossing group boundaries, and SHALL leave
   focus on the last row when there is no next row. <!-- RAIL-21, event-driven -->
4. WHEN `ArrowUp` is pressed on a focused row THEN the system SHALL move focus
   to the previous row in visual order, crossing group boundaries, and SHALL
   leave focus on the first row when there is no previous row. <!-- RAIL-22, event-driven -->
5. WHEN `Enter` or `Space` is pressed on a focused row THEN the system SHALL
   make that session active. <!-- RAIL-23, event-driven -->
6. The system SHALL give every icon-only row action button an `aria-label`
   naming the action and its agent, e.g. `Stop Claude session`. <!-- RAIL-24, ubiquitous -->

**Independent Test**: Focus the first row, hold `ArrowDown` past a group
boundary, press `Enter` — the terminal swaps to that session and the row reports
`aria-selected="true"` in the accessibility tree.

---

## Edge Cases

- WHEN `sessions` is empty THEN the system SHALL render the existing
  `No sessions yet.` empty state and no group cards. <!-- RAIL-25 -->
- IF a task title is long enough to exceed two lines at 344px THEN the system
  SHALL clamp it at 2 lines with `-webkit-line-clamp` and keep the group's rows
  visible without horizontal overflow. <!-- RAIL-26 -->
- IF a session's stored `agent` name matches no entry in the registry and is not
  `Ad-hoc` THEN the system SHALL render the row with the default accent tile
  rather than an untinted or broken tile. <!-- RAIL-27 -->
- WHEN the last session of a group is removed THEN the system SHALL remove that
  group card and SHALL NOT alter the order of the remaining groups. <!-- RAIL-28 -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| RAIL-01 | P1: Grouped rail | T1 | Implementing |
| RAIL-02 | P1: Grouped rail | T1 | Implementing |
| RAIL-03 | P1: Grouped rail | T1 | Implementing |
| RAIL-04 | P1: Grouped rail | T1 | Implementing |
| RAIL-05 | P1: Grouped rail | T1 | Implementing |
| RAIL-06 | P1: Grouped rail | T1 | Implementing |
| RAIL-07 | P1: Grouped rail | T1, T3 | Implementing |
| RAIL-08 | P1: Grouped rail | T1, T3 | Implementing |
| RAIL-09 | P1: Grouped rail | T1, T3 | Implementing |
| RAIL-10 | P1: Grouped rail | T1, T3 | Implementing |
| RAIL-11 | P1: Grouped rail | T1, T3 | Implementing |
| RAIL-12 | P1: Grouped rail | T3, T6, T7 | Implementing |
| RAIL-13 | P1: Grouped rail | T1 | Implementing |
| RAIL-14 | P1: Grouped rail | T1 | Implementing |
| RAIL-15 | P1: Grouped rail | T1 | Implementing |
| RAIL-16 | P1: Grouped rail | T1, T3 | Implementing |
| RAIL-17 | P1: Grouped rail | T3, T8 | Implementing |
| RAIL-18 | P1: Grouped rail | T3, T5, T8 | Implementing |
| RAIL-19 | P2: Keyboard & a11y | T1, T4 | Implementing |
| RAIL-20 | P2: Keyboard & a11y | T1, T4 | Implementing |
| RAIL-21 | P2: Keyboard & a11y | T2, T4 | Implementing |
| RAIL-22 | P2: Keyboard & a11y | T2, T4 | Implementing |
| RAIL-23 | P2: Keyboard & a11y | T4, T8 | Implementing |
| RAIL-24 | P2: Keyboard & a11y | T4, T8 | Implementing |
| RAIL-25 | Edge cases | T1, T3 | Implementing |
| RAIL-26 | Edge cases | T5 | Implementing |
| RAIL-27 | Edge cases | T5 | Implementing |
| RAIL-28 | Edge cases | T1 | Implementing |

**ID format:** `RAIL-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 28 total, 0 mapped to tasks, 28 unmapped ⚠️ (mapped in `tasks.md`)

---

## Success Criteria

- [ ] The handoff's own §7 acceptance checklist passes item-for-item, minus the
      `shell` status this spec puts out of scope
- [ ] Four sessions across two tasks fit the 344px rail with no vertical scroll
      at a 900px-tall window — the v1 cards needed scrolling at three
- [ ] `npm run typecheck && npm run lint && npm test` is green, with zero
      deleted or weakened existing tests
- [ ] Pills, tiles, dots, hover and the active-row tint are legible in both
      themes at 344px, across all four seeded agent tints plus the ad-hoc amber
