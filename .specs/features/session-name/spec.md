# Session Name Specification

## Problem Statement

With several Claude sessions on the same worktree, the rail shows identical rows: the agent's
display name, numbered by group order (`Claude`, `Claude 2`, `Claude 3` — RAIL-13). Claude Code
names every session — `/rename`, `claude -n`, the title of an accepted plan, or a default display
name such as `repos-a2` — and publishes those names in a documented listing of live sessions,
`claude agents --json` (`sessions.md` §Name your sessions; `claude agents --help`: "Print active
sessions (interactive and background) as a JSON array and exit (for scripting; does not require a
TTY)"). The app never reads it, so telling three sessions apart means attaching to each one.

## Goals

- [ ] A running Claude session's row shows the name Claude Code itself gives the session
- [ ] The name comes from a documented interface (AD-019): never the terminal screen, never the transcript
- [ ] A session the app cannot name keeps today's label
- [ ] No new persisted state: the name lives and dies with the process, like activity (ACTV-09)

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| The terminal title (OSC 0/2) as the source | Measured to work — Claude Code sets `process.title`, ConPTY forwards it, and it reaches the app's node-pty as `OSC 0` — but it is documented nowhere (`terminal-config`, `env-vars`, `settings-reference`, `sessions` checked 2026-09-18), and AD-019 lists "the OSC 0 title glyphs" among the rejected undocumented markers. Would carry the AI-generated title and work for any agent; needs an owner exception. Deferred, not dropped |
| The transcript's `ai-title` / `custom-title` entries | `sessions.md`: "The entry format is internal to Claude Code and changes between versions, so scripts that parse these files directly can break on any release" |
| The statusline `session_name` field | Documented, and it carries the AI-generated title, but reaching it means injecting a `statusLine` **command** through `--settings`: shell-dependent on Windows (the AD-020 objection) and it replaces the user's own statusline |
| The AI-generated first-prompt title | Not in the live-session listing: `sessions.md` says only naming the session or accepting a plan replaces the default display name in "listings of running sessions". It shows only in the picker and the statusline |
| Hiding the default display name (`repos-a2`) | Owner decision: show the name as it comes. The listing does not distinguish a default from an explicit name, and the docs only exemplify the default's format |
| Names for ad-hoc sessions and for registry agents other than Claude Code | No documented listing. Their rows keep today's label (same posture as ACTV) |
| Persisting the name, or showing it on a stopped session | Owner decision: no live name → agent name. The PTY never survives a restart |
| Replacing or feeding the app's own session title (`Claude · Repos`, `sessions:rename`) | Owner decision: the Claude name lives on the row only; `PersistedSession.title` and its three surfaces are untouched |
| Naming the Claude session from the app (`claude -n <title>`) | Opposite direction — the app would name Claude, not read Claude's name. Separate feature |
| A settings knob for the polling cadence | Fixed cadence in v1 |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Source of the name | `claude agents --json`, spawned by main | The one documented, structured listing of live sessions. Measured on Claude Code 2.1.277: interactive foreground sessions appear with `pid`, `cwd`, `kind`, `startedAt`, `sessionId`, `name`, `status`; background ones with `id`, `kind`, `sessionId`, `name`, `state`. **Only `sessionId` and `name` are relied upon**; every other field is ignored | y |
| How a listing entry is matched to a row | By Claude's `session_id`, taken from the hook payloads the app already receives (ACTV; `session_id` is a documented common input field). The most recent payload wins | `pid` is useless: node-pty exposes the shell's pid, and Claude is its child. `cwd` is ambiguous in exactly the case this feature exists for — several sessions on one worktree. `/clear` and `/resume` change the `session_id`; last-wins follows the change on the next event | y |
| Which sessions are eligible | Running registry sessions whose command resolves to `claude` (`commandKey`, the ACTV identity rule) and that have reported a `session_id` | The listing is Claude-only, and a session only has a `session_id` once its hooks have fired | y |
| Before the first hook event | No name; the row renders today's label | `SessionStart` is not delivered over http (AD-020), so a fresh session is unnamed until its first turn — the same window in which it has no activity either | y |
| When the app calls the listing | On the first hook event of each session (debounced 1 s, so sessions starting together share one call), on every later hook event for a session still without a name, and every 30 s while at least one eligible session holds a `session_id`. No eligible session → no calls | Owner chose "events + slow poll": a `/rename` or an accepted plan shows within one interval. One call serves every row. Measured cost: ~2 s per call (Bun binary startup) | y |
| What the name does not distinguish | A default display name (`repos-a2`) renders like any other name | Owner decision. The three identical `Claude` rows become three distinct labels either way | y |
| Failure posture | A failed call (spawn error, non-zero exit, timeout, invalid JSON) keeps every current name, logs once per failure streak, and the next tick retries. A **successful** listing without an entry for a known `session_id` clears that session's name | Never show a stale name as if it were live when the listing says the session is gone; never drop names because a call hiccupped | y |
| Timeout of one call | 20 s, then the child is killed and the call counts as failed | 10× the measured ~2 s; bounds a hung binary without turning a slow machine into a failure streak | y |
| Lifetime | Ephemeral, held in main on the running session, pushed to the renderer in place (`session:name`, the `session:activity` pattern), never written to `config.json`. Cleared when the session stops or its PTY exits | ACTV-09 posture; a persisted name could only ever be stale | y |
| Where it renders | The rail row label only; the tooltip (the row's `title`) reads `<agent> · <name>`, and the row's accessible name stays its content — the label — as before. The detail bar, the removal dialog and the worktree detail keep `PersistedSession.title` | Owner decision (two rounds, 2026-09-18; the `title`-only reading confirmed at task approval, 2026-09-19 — the row has no `aria-label` of its own and gains none). The tile already identifies the agent | y |
| Duplicate labels in one group | RAIL-13 numbering applies to the rendered label, whatever it is: two rows named `refactor` become `refactor 1` / `refactor 2` | Same rule the agent name follows today; a name and an agent name never collide within the rule because a row has exactly one label | y |
| Whitespace and length | The name is trimmed; an empty result means no name. Long names are clipped by the row's existing label styling; the tooltip carries the full text | No new layout | y |
| Token cost | None. The listing is a local process; tests use listing-shaped fixtures and a fake spawner | Owner concern in ACTV, same answer | y |
| Observability | One log line in main when a call fails, and one when calls resume | The symptom of a broken path is a row that never gets its name; the log says why | y |
| Auth boundaries, rate limits, concurrency | N/A for auth: the listing is a local process the app spawns, no credentials cross. Rate is bounded by the 1 s debounce and the 30 s interval; a tick that fires while a call is in flight is skipped, so calls never overlap | The only external party is the local Claude Code binary; the dimensions sweep found nothing else to bound | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: The row says what Claude calls the session ⭐ MVP

**User Story**: As a developer running several Claude sessions on one worktree, I want each row in the Agents rail to show the name Claude Code gives that session, so that I can tell them apart without attaching.

**Why P1**: This is the feature. Without it the rail shows `Claude`, `Claude 2`, `Claude 3`.

**Acceptance Criteria**:

1. WHEN a running registry session whose command key is `claude` holds a `session_id` AND the last successful listing contains an entry with that `sessionId` and a non-empty trimmed `name` THEN the rail row SHALL render that name as its label instead of the agent's display name. <!-- SNAME-01 -->
2. WHEN a later listing returns a different non-empty `name` for that `sessionId` THEN the row SHALL update to the new name in place, without refetching the session list. <!-- SNAME-02 -->
3. WHEN a session has no name — no hook event yet, not a Claude registry agent, ad-hoc, stopped, or absent from the last successful listing — THEN the row SHALL render today's label: the agent's display name with RAIL-13 numbering. <!-- SNAME-03 -->
4. WHEN a named session stops or its PTY exits THEN its name SHALL be cleared and the row SHALL fall back to the agent's display name. <!-- SNAME-04 -->
5. WHEN a row renders a Claude name THEN its tooltip (the row's `title`) SHALL read `<agent display name> · <name>`, and the action buttons' labels SHALL name the rendered label. <!-- SNAME-05 -->
6. WHEN two rows in one group render the same label THEN RAIL-13 numbering SHALL apply to that label (`<label> 1`, `<label> 2`), and a label unique within its group SHALL stay unsuffixed. <!-- SNAME-06 -->
7. WHEN a name is set, changed or cleared THEN the rail header counts, the group heads, the detail bar title, the removal dialog and the worktree detail SHALL be unchanged. <!-- SNAME-07 -->

**Independent Test**: Spawn two Claude sessions on one worktree, send each a first prompt, run `/rename alpha` in one; within 30 s the rows read `alpha` and `<folder>-xx`; stop `alpha` → its row reads `Claude` again.

---

### P1: Main reads the name from the documented listing ⭐ MVP

**User Story**: As the app, I want to learn each Claude session's name from `claude agents --json`, keyed by the `session_id` its hooks report, so that the row label rests on a documented interface and survives Claude Code releases.

**Why P1**: The row has nothing to show without it, and AD-019 forbids every other source measured.

**Acceptance Criteria**:

8. WHEN a hook event arrives for a running session THEN main SHALL record the payload's `session_id` on that session, the most recent payload winning. <!-- SNAME-08 -->
9. WHEN a session records its first `session_id`, or a hook event arrives for a session that holds a `session_id` and no name THEN main SHALL schedule one listing call, debounced so that events within 1 s share a single call. <!-- SNAME-09 -->
10. WHILE at least one running session holds a `session_id` THEN main SHALL call the listing every 30 s; WHEN no running session holds one THEN main SHALL make no calls. <!-- SNAME-10 -->
11. WHEN a listing call succeeds THEN for each running session with a `session_id`, main SHALL set its name to the matching entry's trimmed `name` when that is non-empty, clear it when there is no matching entry or the trimmed `name` is empty, and push `session:name` only for sessions whose name changed. <!-- SNAME-11 -->
12. WHEN a listing call fails — spawn error, non-zero exit, 20 s timeout, output that is not a JSON array — THEN main SHALL keep every current name, log once per failure streak, and retry on the next scheduled call. <!-- SNAME-12 -->
13. WHEN the listing is parsed THEN main SHALL read only `sessionId` and `name` from each entry, tolerating entries where either is missing or not a string, and ignoring every other field. <!-- SNAME-13 -->
14. WHEN the app quits or the session manager is disposed while a call is in flight THEN main SHALL kill the child and emit nothing afterwards. <!-- SNAME-14 -->
15. The session name SHALL NOT be written to `config.json`: `PersistedSession` is unchanged, and a session loaded at startup has no name. <!-- SNAME-15 -->

**Independent Test**: Unit — a fake spawner returns a listing fixture; the manager sets, changes and clears names per the fixture, debounces bursts to one call, polls only while eligible sessions exist, survives a failing spawner without dropping names, and emits `session:name` only on change.

---

## Edge Cases

- WHEN a session runs `/clear` or `/resume` THEN its `session_id` changes; the old id vanishes from the next listing (name cleared) and the next hook event records the new id (name refetched on the next call).
- WHEN the listing carries the same `sessionId` twice (a session resumed in two terminals, or an interactive and a background entry) THEN the first entry with a non-empty `name` wins.
- WHEN two app sessions hold the same `session_id` THEN both receive the name.
- WHEN a `name` is whitespace only THEN it counts as empty (no name).
- WHEN main calls the listing THEN it SHALL spawn the binary the app already resolves for headless steps (`resolveClaude`: the first `where claude` hit on PATH, else `agent.claudePath`), directly and without a shell (AD-007), with argv `agents --json`. Accepted v1 deviation from "the registry command as configured" (design.md Risks): a registry `command` pointing at a different install lists that install's sessions and no entry matches — the failure mode is *no name*, never a wrong name.
- WHEN a 30 s tick fires while the previous call is still running THEN main SHALL skip the tick rather than overlap calls.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SNAME-01 | P1: Row label | Tasks | ✅ Verified (T4, T5, T6, T8) |
| SNAME-02 | P1: Row label | Tasks | ✅ Verified (T1, T4, T5) |
| SNAME-03 | P1: Row label | Tasks | ✅ Verified (T5, T6) |
| SNAME-04 | P1: Row label | Tasks | ✅ Verified (T4) |
| SNAME-05 | P1: Row label | Tasks | ✅ Verified (T6) |
| SNAME-06 | P1: Row label | Tasks | ✅ Verified (T6) |
| SNAME-07 | P1: Row label | Tasks | ✅ Verified (T6) |
| SNAME-08 | P1: Listing | Tasks | ✅ Verified (T4) |
| SNAME-09 | P1: Listing | Tasks | ✅ Verified (T3, T4) |
| SNAME-10 | P1: Listing | Tasks | ✅ Verified (T3, T7) |
| SNAME-11 | P1: Listing | Tasks | ✅ Verified (T4) |
| SNAME-12 | P1: Listing | Tasks | ✅ Verified (T3) |
| SNAME-13 | P1: Listing | Tasks | ✅ Verified (T2) |
| SNAME-14 | P1: Listing | Tasks | ✅ Verified (T3, T7) |
| SNAME-15 | P1: Listing | Tasks | ✅ Verified (T1, T4) |

**Coverage:** 15 total, 15 verified, 0 unmapped ✅ (`validation.md`, 2026-09-19)

---

## Success Criteria

- [ ] Three Claude sessions on one worktree show three distinct labels within 30 s of their first turn
- [ ] `/rename alpha` in one session shows `alpha` on its row within 30 s; stopping it returns the row to `Claude`
- [ ] Zero token spend in the test suite; typecheck, lint and `vitest run` green
- [ ] RAIL-12 amended, not violated: the row still renders tile, label, short status, dot and actions — and nothing else
