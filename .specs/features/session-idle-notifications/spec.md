# Session Activity Notifications Specification

> Rewritten 2026-09-15, after `session-activity-status` shipped on Claude Code's documented
> lifecycle hooks (AD-019). The original spec was written against a two-state model
> (`working` / `waiting`) inferred from the terminal screen. There are now seven states
> carrying detail, and the notification a user actually wants — "your agent is blocked on
> you" — was not expressible before. Every change is marked **[rev2]**.

## Problem Statement

`session-activity-status` makes each agent's state visible in the rail, but only to someone
looking at the app. The reason to run several agents in parallel is to do something else
while they work, and that something else is usually a window in front of the playground.
Today the app has no way to tell you that an agent finished, or that one has been sitting on
a permission prompt for ten minutes. The machinery to say it already exists: `index.ts`
shows a native OS notification behind an `isSupported()` guard, and the workflow lifecycle
toast already implements click-to-reveal (`show()` + `focus()` + a `workflow:focus-run` event
the renderer acts on). Sessions have no equivalent.

**Depends on `session-activity-status`.** Every criterion here is stated over the activity
states that feature derives from the agent's own hooks; a session with no activity state has
nothing to notify about.

## Goals

- [ ] The user learns an agent needs them without watching the app
- [ ] **[rev2]** A blocked agent (permission or input) is distinguishable from a finished one, because one of them is burning wall-clock doing nothing
- [ ] A notification takes them straight to the session that raised it
- [ ] Notifications stay quiet when the user is already looking at the answer
- [ ] The whole behaviour can be turned off

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Notifying when a session **starts** working | The user just gave the instruction; telling them it was received is noise. Owner decision |
| **[rev2]** Notifying on `compacting` | An internal step the agent takes on its own; it needs nothing from the user |
| **[rev2]** Notifying on `exited` (agent quit, shell alive) | Nothing is waiting: the user typed `/exit` themselves, or the agent crashed and the row already says `shell`. A crash notification is a different feature with its own decision |
| Notifying when a session's shell exits | A different signal on a different axis (`session:exit` already exists) |
| Notifications for ad-hoc sessions, or for agents that publish no hooks | They carry no activity state at all — inherited from `session-activity-status`, not re-litigated here |
| **[rev2]** A separate switch per state ("tell me when blocked but not when finished") | One switch until there is evidence one is not enough. Recorded as the first thing to add if the finished-notifications prove noisy |
| Per-agent or per-session notification settings | Same reason |
| Sound, urgency levels, notification actions/buttons | The existing notifier surfaces title + body + click; matching it keeps one code path |
| Batching or rate-limiting several at once | One per session, bounded by how many agents the user chose to run |
| **[rev2]** Notifying that a usage limit paused a session | `StopFailure` reports `rate_limit` as an `error`, which this feature does notify. The `quota_auto_resume_*` notifications that say the wait ended are not consumed by `session-activity-status` yet; see its follow-up |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| **[rev2]** Which transitions notify | Entering `waiting`, `needs-approval`, `needs-input` or `error`. Never `working`, `compacting` or `exited` | Those four are exactly the states where the agent has stopped and the next move is the user's | n |
| **[rev2]** Two tiers, one switch | `needs-approval` / `needs-input` are **blocked**; `waiting` / `error` are **finished**. The tier changes only the wording, not whether it fires | A blocked agent is idle while the user believes it is working, which is the costlier miss; but two switches before any evidence of noise is premature configurability | n |
| When a notification fires | When the app window is **not focused** OR the session is **not the attached one** | Owner decision. Those are the two cases where the rail's indicator cannot be seen | y |
| Which surface each case uses | Window unfocused → **OS notification**. Window focused but session not attached → **in-app toast** | An OS toast thrown at someone already looking at the app duplicates a signal the app can deliver itself; an in-app toast is invisible when the app is behind another window. **Still the agent's reading of the owner's "unfocused OR not visible" answer — confirm before Design** | n |
| The attached session is exempt while focused | No notification of either kind | Its row and its terminal are both on screen | y |
| **[rev2]** Where the decision is made | Main, which already holds the attached session (`SessionManager.#activeId`) and can read window focus. The in-app toast is a push to the renderer | Keeping one decision in one place stops the two surfaces from disagreeing about whether a transition was notifiable. **Design may split it; that is a Design call, not a spec one** | n |
| **[rev2]** Setting name | `ui.notifyOnAgentActivity?: boolean`, absent = enabled, persisted immediately on toggle | The original `notifyOnAgentIdle` no longer describes what it gates, and nothing has shipped, so the rename is free. Persist-on-change matches `defaultShell` | n |
| Click target | Show and focus the window, switch to the agents direction, select the session | Mirrors the `workflow:focus-run` path already shipped | y |
| **[rev2]** Notification content | Title: agent + session title. Body: the state, plus the detail the activity already carries — the tool for an approval, the error type for a failure | `SessionActivity` carries `tool` and `error`, so "needs approval to run Bash" and "turn failed: rate_limit" cost nothing extra. A body that only says "waiting" makes the user open the app to learn what it wants | n |
| Several sessions at once | One notification per session, no batching | Bounded by how many agents the user chose to run |
| Notifications unsupported by the OS | Skip silently | The existing `isSupported()` guard already does this | y |
| **[rev2]** Idempotency | Inherited: `session-activity-status` emits nothing when the view is unchanged (**ACTV-06**), so a notification cannot repeat without a real transition | Corrects the original citation, which pointed at ACTV-07 before the renumbering | y |
| **[rev2]** Interrupted turns are silent | When the user interrupts with Esc, Claude Code fires no hook, so no transition arrives and nothing notifies until the `idle_prompt` notification ~60 s later | Documented Claude Code behaviour, inherited from `session-activity-status` (ACTV-28). The user who pressed Esc is at the keyboard anyway | y |
| **[rev2]** A keystroke can end a blocked state | Answering a permission dialog moves the session to `working` (ACTV-12), which never notifies | Means a blocked notification cannot be followed by a "resumed" one | y |
| Auth boundaries, rate limits, external-dependency failure | N/A | The OS notification API is local and already in use | y |
| Data lifecycle | N/A | Fire-and-forget; the only persisted datum is the boolean setting | y |
| Observability | N/A | The notifier is an existing, exercised path; this adds a caller | y |

**Open questions:** none blocking, but six rows are the agent's defaults rather than owner
decisions and are marked `n`: which transitions notify, the two-tier wording, the OS-toast /
in-app-toast split, where the decision is made, the setting rename, and the body content.
They need a yes/no before Design.

---

## User Stories

### P1: Told when an agent is blocked on you ⭐ MVP

**User Story**: As a user working in another window while agents run, I want the app to tell
me when one of them is stuck waiting for my approval or my answer, so that it is not sitting
idle while I think it is working.

**Why P1**: **[rev2]** This is the transition with a real cost attached. A finished agent
wastes nothing; a blocked one wastes wall-clock for as long as the user takes to notice.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHILE the app window is not focused, WHEN a session enters `needs-approval` or `needs-input` THEN the app SHALL show an OS notification for that session.  <!-- complex -->
2. WHILE the app window is focused, WHEN a session that is not the attached one enters `needs-approval` or `needs-input` THEN the app SHALL show an in-app toast for that session.  <!-- complex -->
3. WHILE the app window is focused, WHEN the attached session enters any notifiable state THEN the app SHALL NOT notify.  <!-- complex -->
4. WHERE the session's activity names the tool it is blocked on, the notification body SHALL name that tool.  <!-- optional-feature -->
5. WHEN the user clicks the notification THEN the app SHALL show and focus its window, switch to the agents direction, and select that session.  <!-- event-driven -->
6. IF the operating system does not support notifications THEN the app SHALL skip the OS notification without error.  <!-- unwanted-behavior -->

**Independent Test**: Start an agent on a task that needs a permission, switch to another
application. The permission dialog raises a notification naming the tool; clicking it brings
the playground forward with that session selected and the dialog on screen.

---

### P2: Told when an agent finishes or fails

**User Story**: As a user who stepped away, I want to know when an agent finished its turn
or died on an API error, so that I come back to it instead of checking.

**Why P2**: The original P1. It is the larger volume of notifications and the lower stakes,
so it ships behind the blocked case.

**Acceptance Criteria**:

1. WHILE the app window is not focused, WHEN a session enters `waiting` THEN the app SHALL show an OS notification for that session.  <!-- complex -->
2. WHILE the app window is not focused, WHEN a session enters `error` THEN the app SHALL show an OS notification naming the error type.  <!-- complex -->
3. WHILE the app window is focused, WHEN a session that is not the attached one enters `waiting` or `error` THEN the app SHALL show an in-app toast.  <!-- complex -->
4. WHEN a session enters `working`, `compacting` or `exited` THEN the app SHALL NOT notify.  <!-- event-driven -->
5. WHERE a session carries no activity state the app SHALL never notify for it.  <!-- optional-feature -->
6. The notification SHALL name the session's agent and title.  <!-- ubiquitous -->

**Independent Test**: Give an agent a long task, switch away. When it finishes, one
notification names it. Force a rate limit and the body says `rate_limit`. A compaction in
the middle produces nothing.

---

### P3: Turn notifications off

**User Story**: As a user who finds them intrusive, I want one switch that stops them, so
that the rail's indicators remain without the interruptions.

**Why P3**: A notification the user cannot silence is a feature they turn off by
uninstalling it.

**Acceptance Criteria**:

1. WHERE `ui.notifyOnAgentActivity` is false the app SHALL show neither an OS notification nor an in-app toast on any activity transition.  <!-- optional-feature -->
2. WHEN the user toggles the setting THEN the app SHALL persist it immediately via `config:patch`.  <!-- event-driven -->
3. WHERE `ui.notifyOnAgentActivity` is absent from the config the app SHALL treat notifications as enabled.  <!-- optional-feature -->

**Independent Test**: Turn the setting off, put the app in the background, let an agent
finish — nothing. Turn it back on, repeat — the notification appears. Restart the app and
the setting holds.

---

## Edge Cases

- IF the window has been destroyed when a notification is clicked THEN the app SHALL ignore the click without error.  <!-- unwanted-behavior -->
- WHEN several sessions enter a notifiable state at the same time THEN the app SHALL raise one notification per session.  <!-- event-driven -->
- IF a session is stopped between its transition and the notification click THEN the app SHALL still select that session rather than fail.  <!-- unwanted-behavior -->
- WHEN a session enters a notifiable state while the app is minimized THEN the app SHALL treat the window as not focused and use the OS notification.  <!-- event-driven -->
- **[rev2]** WHEN a session moves from `needs-approval` straight to `working` because the user answered the dialog THEN the app SHALL NOT notify.  <!-- event-driven -->
- **[rev2]** IF a session's PTY stops while it holds a notifiable state THEN the app SHALL NOT notify for the activity being discarded.  <!-- unwanted-behavior -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| NOTF-01 | P1: Told when an agent is blocked | - | Pending |
| NOTF-02 | P1: Told when an agent is blocked | - | Pending |
| NOTF-03 | P1: Told when an agent is blocked | - | Pending |
| NOTF-04 | P1: Told when an agent is blocked | - | Pending |
| NOTF-05 | P1: Told when an agent is blocked | - | Pending |
| NOTF-06 | P1: Told when an agent is blocked | - | Pending |
| NOTF-07 | P2: Told when an agent finishes or fails | - | Pending |
| NOTF-08 | P2: Told when an agent finishes or fails | - | Pending |
| NOTF-09 | P2: Told when an agent finishes or fails | - | Pending |
| NOTF-10 | P2: Told when an agent finishes or fails | - | Pending |
| NOTF-11 | P2: Told when an agent finishes or fails | - | Pending |
| NOTF-12 | P2: Told when an agent finishes or fails | - | Pending |
| NOTF-13 | P3: Turn notifications off | - | Pending |
| NOTF-14 | P3: Turn notifications off | - | Pending |
| NOTF-15 | P3: Turn notifications off | - | Pending |
| NOTF-16 | Edge cases | - | Pending |
| NOTF-17 | Edge cases | - | Pending |
| NOTF-18 | Edge cases | - | Pending |
| NOTF-19 | Edge cases | - | Pending |
| NOTF-20 | Edge cases | - | Pending |
| NOTF-21 | Edge cases | - | Pending |

**ID format:** `NOTF-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 21 total, 0 mapped to tasks (Tasks phase not yet run), 0 unmapped

---

## Success Criteria

- [ ] **[rev2]** An agent that opens a permission dialog while the app is in the background produces exactly one notification, and it names the tool
- [ ] An agent finishing while the app is in the background produces exactly one notification
- [ ] Clicking it lands on that session, ready to type
- [ ] Working at the attached session's terminal produces no notifications at all
- [ ] **[rev2]** A turn that compacts, runs ten tools and finishes produces exactly one notification
- [ ] The off switch silences both surfaces and survives a restart
