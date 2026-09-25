# Session Name Context

**Gathered:** 2026-09-18
**Spec:** `.specs/features/session-name/spec.md`
**Status:** Ready for design

---

## Feature Boundary

A running Claude Code session's row in the Agents rail shows the name Claude Code gives that
session, read from the documented live-session listing (`claude agents --json`) and matched by the
`session_id` the session's hooks report. Nothing else on the row, in the detail bar or in
`config.json` changes.

---

## Implementation Decisions

### Source of the name

- `claude agents --json`, the documented listing of live sessions. Chosen over the terminal title
  (OSC 0, undocumented, AD-019), the transcript (declared internal by the docs) and the statusline
  `session_name` (would inject a shell-dependent `command` statusline and override the user's).
- Accepted consequence, stated at decision time: the AI-generated first-prompt title is **not**
  in that listing. An unnamed session shows its default display name (`repos-a2`) until the user
  runs `/rename` or accepts a plan.

### When there is no name

- Before the first hook event, for non-Claude and ad-hoc sessions, and for stopped sessions the
  row renders today's label — the agent's display name with RAIL-13 numbering. No "last known
  name" after stop.

### Relationship with the app's own title

- The Claude name lives on the row only, in an ephemeral field pushed in place (the
  `session:activity` pattern). `PersistedSession.title`, `sessions:rename`, the detail bar, the
  removal dialog and the worktree detail are untouched.

### Row format

- The label is the name alone; the tile already identifies the agent. Tooltip and accessible
  name read `<agent> · <name>`. RAIL-13 numbering applies to the rendered label when two rows in a
  group collide.

### Default display name

- Shown as it comes. No heuristic to recognise the `<folder>-<2 chars>` pattern.

### Refresh cadence

- A call on the first hook event of each session (debounced 1 s across sessions), on later
  events for a session still without a name, and every 30 s while at least one eligible session
  holds a `session_id`. No eligible session, no calls. Measured cost ~2 s per call.

### Agent's Discretion

- Debounce and timeout values (1 s, 20 s) and the 30 s interval were proposed by the agent and
  accepted; Design may tune them with a stated reason.
- How the listing command is resolved (the registry agent's `command` + `agents --json`, direct
  spawn per AD-007) and how the spawner is faked in tests.
- The name of the push channel (`session:name`) and of the field on `SessionView`.

### Declined / Undiscussed Gray Areas → Assumptions

- None declined. Failure posture, timeout, duplicate entries, whitespace names and the
  `/clear`/`/resume` id change were not asked and are logged as assumptions in the spec.

---

## Specific References

- The AD-019 principle — "activity comes from the agent's documented lifecycle hooks, never from
  reading its terminal" — was applied to the name as well, by owner choice.
- `sessions.md` §Name your sessions (code.claude.com, read 2026-09-18) is the authority on which
  label appears where.
- Measurements behind the decision, all 2026-09-18 on Claude Code 2.1.277:
  - `claude agents --json` lists interactive foreground sessions (this very session appeared as
    `repos-a2`, pid 3724) in ~2 s.
  - The terminal title does reach node-pty + ConPTY as `OSC 0` (`"claude"` at startup) — recorded
    so the deferred idea below starts from evidence, not a guess.

---

## Deferred Ideas

- **Terminal title as a second source.** Would add the AI-generated title and cover any agent that
  sets its console title (opencode, codex). Needs an owner exception to AD-019; the title text may
  carry status glyphs that would have to be stripped.
- **Naming the Claude session from the app** (`claude -n <app title>` at launch), so Claude's own
  picker shows the app's title. The reverse direction of this feature.
- **Recognising and hiding the default display name**, if `repos-a2` turns out to be noise rather
  than signal in daily use.
