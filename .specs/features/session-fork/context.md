# Session Fork Context

**Gathered:** 2026-11-17
**Spec:** `.specs/features/session-fork/spec.md`
**Status:** Ready for execute (Medium scope - design skipped)

---

## Feature Boundary

A `Fork` action on a running Claude session opens a new app session that resumes the source's Claude conversation as a new,
independent Claude session (`--resume <id> --fork-session`), leaving the source tab running untouched.

---

## Implementation Decisions

### Eligibility

- Only running Claude sessions with a known `claudeSessionId` can fork. No persistence of the Claude id.

### Opening

- One click, no dialog, no first prompt. The fork is selected; the developer types the new direction there.

### Agent's Discretion

- Launch details (cwd = launch `cwd`, title `<source> (fork)`, task copied, resume args not persisted), the `forkable`
  view flag, and the push that reveals the button on the first hook id. Logged as assumptions in the spec.

### Declined / Undiscussed Gray Areas → Assumptions

- Forking while busy (allowed), agent defs that already carry `--resume` (not guarded). Both in the spec's Assumptions table.

---

## Specific References

- Sibling of the existing `Duplicate` action (`AgentsView.tsx`, `sessions:duplicate`): same placement, same select-on-success flow.
- `claude --help`: `--fork-session` - "When resuming, create a new session ID" (with `--resume` or `--continue`).

---

## Deferred Ideas

- Persist the last Claude `session_id` so stopped sessions (and Respawn) can resume / fork.
- Optional first prompt at fork time, reusing the prompted launch.
