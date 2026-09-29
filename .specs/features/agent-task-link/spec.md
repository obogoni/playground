# Agent Task Link Specification

## Problem Statement

A session's task comes from its branch, or from a link the user sets by hand in the picker
(`hours-task-assign`, AD-048). A Claude Code session opened at a workspace root, where the agent itself
creates and works in the worktree (the flow issue #133 anticipates: "sessions will start on `develop`"),
records **No task** until the user remembers to open the picker. The agent already knows which work
item it is on: a skill that starts from a work item id has it before it touches any code. Today it has
no way to tell the app, so the link, the rail group, the notifications and the Hours totals depend on a
manual step that is easy to forget, and every minute before it lands under No task.

## Goals

- [ ] An agent running inside an app session can link **that** session to a work item with one local HTTP call, with exactly the effect of choosing the item in the picker (HTSK-11..17)
- [ ] Nothing outside that session can change its link through this call
- [ ] A session that never makes the call behaves exactly as it does today, and the lifecycle hooks keep working unchanged

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Removing a link from the agent (back to From branch) | No caller needs it; the picker keeps `From branch` (HTSK-13). A new link replaces the old one |
| Pinning the linked work item | Owner decision in `hours-task-assign`: the pinned list stays the one the owner curates |
| Fetching the item's title, type or state on the agent's behalf | AD-023: no surface reaches the network unless the user asks. The caller sends the title it already has |
| Linking a session to a worktree, or changing the folder its attribution reads | Issue #133 keeps "working out the task from what the agent edits" as a later idea; this feature links the task only |
| Changing the rail row label | SNAME-01/03 unchanged; the session shows under its task's group header (HTSK-11, HTSK-20) |
| Counting the time before the link to the task | HTSK-12 unchanged: the link counts from its instant; the drawer's `Change task` / `Split at` fix the past |
| Agents other than Claude Code, and ad-hoc sessions | Only sessions that receive an activity token get the call (the ACTV identity rule, AD-019) |
| A script or CLI shipped by the app for the call | The contract is the HTTP request; the caller owns how it sends it |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Transport | An HTTP `POST` to the loopback server that already receives the lifecycle hooks, on a path of its own | One listener, one token registry; the AD-008/AD-019 pattern (the token authenticates and routes) | y |
| Authentication | The session's existing activity token, sent as `Authorization: Bearer <token>` | The token is already in the session's environment (`PLAYGROUND_ACTIVITY_TOKEN`) and every tool the agent runs inherits it; it identifies exactly one live session and is revoked when that session stops (ACTV-32) | y |
| Discovery | A new environment variable `PLAYGROUND_TASK_URL` holding the full URL, set on every session that receives a token | The port is ephemeral per app launch; a full URL spares the caller any path building | y |
| Body | JSON object `{ "id": <integer>, "title": <string or null> }`; `title` may be omitted | Mirrors `SessionTask` (`id`, `title`) | y |
| `id` bounds | A positive safe integer (1 ≤ id ≤ 2^53−1) | A work item id; anything else cannot name one | y |
| `title` bounds | Trimmed; empty after trimming counts as null; longer than 255 characters after trimming is rejected | 255 is Azure DevOps' `System.Title` limit; null falls back to the pinned title at period open (HTSK "Title of a linked task") | y |
| Body size | Over 4 KiB is rejected without being parsed | A valid body is well under 400 bytes; the hooks' 8 MiB cap exists for `PostToolUse` payloads, not this route | y |
| Responses | Status code only, never a body: `204` linked, `400` invalid body, `401` bad token, `404` unknown path, `405` not `POST`, `413` body too large | AD-019's posture: this server answers, it never decides; the caller reads the status | y |
| Same `id` as the current link | `204`; no period closes or opens; the stored title becomes the request's | HTSK-14 compares by id (`time-tracker.ts` `taskChanged`); `setTask` stores the new link object | y |
| Paused, suspended or stopped session | Paused and suspended follow HTSK-15. A stopped session has no live token, so its call is a `401` | Reuses the tracker's rules unchanged | y |
| Observability | A rejected request is logged once per token (the `warnOnce` the hooks use); a successful link is not logged, it shows in the rail | Same noise budget as the hooks | y |
| Upstream issue | An issue opened on `obogoni/playground` referencing #133, closed by the PR (CONVENTIONS: "PRs must close their respective issue") | Project convention; opening it is an outward write, done only with the developer's go-ahead | y |
| Contract documentation | A README section: the two variables, the request, the status codes | It is an integration contract for scripts outside the app | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: The agent links its own session ⭐ MVP

**User Story**: As a developer whose agent starts from a work item id, I want the agent to link its session to that item as soon as it knows it, so that the session sits under the item and its time counts to it without me opening the picker.

**Why P1**: It is the feature.

**Acceptance Criteria**:

1. WHEN the app spawns a session that receives an activity token THEN the session's environment SHALL also carry `PLAYGROUND_TASK_URL`, the full URL of the link endpoint
2. WHEN a `POST` to `PLAYGROUND_TASK_URL` carries a live session's token and the body `{ "id": N, "title": T }` with N a positive safe integer and T a string of at most 255 characters after trimming THEN the app SHALL link that session to `{ id: N, title: trimmed T }`, with the same effects as choosing that task in the picker (HTSK-11, HTSK-12, HTSK-17, HTSK-21), and SHALL answer `204` with an empty body
3. WHEN `title` is omitted, `null`, or empty after trimming THEN the link SHALL store `title: null`
4. WHEN the session is already linked to task N THEN the app SHALL answer `204`, SHALL store the request's title, and the tracker SHALL neither close nor open a period
5. WHEN the session is linked to a task other than N, or to none, THEN its open period SHALL close and a new one SHALL open with task N at the same instant (HTSK-12)
6. WHEN a link is made through the endpoint THEN the rail, the session detail strip and the Hours views SHALL show it without any user action and without restarting the app

**Independent Test**: In a running Claude session, `POST` `{ "id": 12345, "title": "Example task" }` with the session's token to `PLAYGROUND_TASK_URL`: the call returns `204`, the session moves under a `#12345` group headed `Example task`, and the Hours drawer shows a new open period for #12345 starting at the call.

---

### P1: Only the session itself can change its link ⭐ MVP

**User Story**: As a developer running several sessions, I want a link call to affect only the session it comes from, so that one agent can never retag another session's time.

**Why P1**: Without it the endpoint is a way to rewrite any session's hours.

**Acceptance Criteria**:

7. WHEN a request has no `Authorization: Bearer` header, or a token that belongs to no live session, THEN the app SHALL answer `401` and change nothing
8. WHEN a request carries a live session's token THEN the app SHALL change the link of that session only
9. WHEN the body is not a JSON object, OR `id` is missing, not an integer, below 1 or above 2^53−1, OR `title` is present and neither a string nor `null`, OR `title` exceeds 255 characters after trimming, THEN the app SHALL answer `400` and change nothing
10. WHEN a request to the link path uses a method other than `POST` THEN the app SHALL answer `405`; WHEN a `POST` targets a path that is neither the hooks path nor the link path THEN the app SHALL answer `404`; WHEN a body exceeds 4 KiB THEN the app SHALL answer `413`; none of them SHALL change anything
11. WHEN Claude Code posts a lifecycle hook to the hooks URL THEN the app SHALL fold it into the session's activity exactly as before, and a hook payload SHALL never be treated as a link request

**Independent Test**: With two running sessions A and B, a link call carrying A's token changes A only; the same call with a made-up token, with `id: 0`, or with a 300-character title returns `401` / `400` / `400` and neither session changes; activity dots keep updating while a turn runs.

---

### P2: The contract is documented

**User Story**: As a developer writing a skill or script, I want the call documented next to the other integration notes, so that I can use it without reading the app's code.

**Why P2**: The call works without it, but a contract nobody can find gets reverse-engineered.

**Acceptance Criteria**:

12. The README SHALL document `PLAYGROUND_TASK_URL`, `PLAYGROUND_ACTIVITY_TOKEN` as the Bearer token, the request body, the status codes of AC 2, 7, 9 and 10, and that a caller without those variables is not running in an app session

**Independent Test**: Following only the README section, a PowerShell `Invoke-WebRequest` from a session's terminal links the session.

---

## Edge Cases

- WHEN a session was spawned before the loopback server finished binding THEN it has neither token nor URL (ACTV-29) and SHALL behave as today; a caller finding the variables absent is not in a linkable session
- WHEN the session is respawned or the app relaunches THEN the new run SHALL receive a fresh token, and `PLAYGROUND_TASK_URL` SHALL carry the URL of the server listening in that app launch; the link itself persists (HTSK-17)
- WHEN two link calls from the same session arrive close together THEN the app SHALL apply them in arrival order and the last one SHALL be the stored link
- WHEN the call arrives while the session is paused THEN the link SHALL be stored and no period SHALL open (HTSK-15)

---

## Implicit-Requirement Sweep (Medium)

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | AC 9, AC 10 (`id` range, `title` type and length, 4 KiB cap) |
| Auth boundaries & rate limits | AC 7, AC 8; rate limits N/A because the endpoint is loopback-only and single-user, and a call costs one config write |
| Idempotency / retry | AC 4: repeating a call is a no-op for time |
| Concurrency / ordering | Edge case "two link calls": main is single-threaded and applies them in arrival order |
| Failure states | Every rejection changes nothing (AC 7, 9, 10); a failed config write keeps `setTask`'s existing behaviour |
| State-transition integrity | Delegated to HTSK-12..17 unchanged (running, paused, suspended, stopped) |
| Observability | Rejections logged once per token (Assumptions) |
| External-dependency failure | N/A because the endpoint reaches no network (AD-023) |
| Data lifecycle | The link persists with the session (HTSK-17); the token dies with the run (ACTV-32) |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| ATSK-01 | P1: The agent links its own session (AC 1) | Execute | Verified |
| ATSK-02 | P1: The agent links its own session (AC 2) | Execute | Verified |
| ATSK-03 | P1: The agent links its own session (AC 3) | Execute | Verified |
| ATSK-04 | P1: The agent links its own session (AC 4) | Execute | Verified |
| ATSK-05 | P1: The agent links its own session (AC 5) | Execute | Verified |
| ATSK-06 | P1: The agent links its own session (AC 6) | Execute | Verified |
| ATSK-07 | P1: Only the session itself (AC 7) | Execute | Verified |
| ATSK-08 | P1: Only the session itself (AC 8) | Execute | Verified |
| ATSK-09 | P1: Only the session itself (AC 9) | Execute | Verified |
| ATSK-10 | P1: Only the session itself (AC 10) | Execute | Verified |
| ATSK-11 | P1: Only the session itself (AC 11) | Execute | Verified |
| ATSK-12 | P2: The contract is documented (AC 12) | Execute | Verified |

**Coverage:** 12 total, all verified (Medium: tasks implicit in Execute; `validation.md` round 2 PASS).

---

## Success Criteria

- [ ] A skill that knows its work item links its session with one call, and the rail and the Hours drawer show it within a second, with no picker involved
- [ ] The existing suites stay green unchanged: sessions that never call the endpoint, and the hooks, behave as before
