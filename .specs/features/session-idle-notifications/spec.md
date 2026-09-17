# Session Activity Notifications Specification

> Rewritten 2026-09-15, after `session-activity-status` shipped on Claude Code's documented
> lifecycle hooks (AD-019). The original spec was written against a two-state model
> (`working` / `waiting`) inferred from the terminal screen. There are now seven states
> carrying detail, and the notification a user actually wants — "your agent is blocked on
> you" — was not expressible before. Every change is marked **[rev2]**.
>
> Revised 2026-09-16 after the owner answered the open assumptions: one master switch **plus
> a switch per notifiable state**, all enabled by default. P3 grows accordingly. Changes are
> marked **[rev3]**.
>
> Revised again 2026-09-16 after the owner smoke passed: the notification names the **task**
> the session works on, as P4. Changes are marked **[rev4]**.
>
> **[rev5]** Same day, owner decision: the app never cuts the title. The 60-character limit and
> its `…` are gone, and the in-app notice wraps the title over as many lines as it needs.

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
- [ ] **[rev3]** Each notifiable state can be turned off on its own

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Notifying when a session **starts** working | The user just gave the instruction; telling them it was received is noise. Owner decision |
| **[rev2]** Notifying on `compacting` | An internal step the agent takes on its own; it needs nothing from the user |
| **[rev2]** Notifying on `exited` (agent quit, shell alive) | Nothing is waiting: the user typed `/exit` themselves, or the agent crashed and the row already says `shell`. A crash notification is a different feature with its own decision |
| Notifying when a session's shell exits | A different signal on a different axis (`session:exit` already exists) |
| Notifications for ad-hoc sessions, or for agents that publish no hooks | They carry no activity state at all — inherited from `session-activity-status`, not re-litigated here |
| Per-agent or per-session notification settings | **[rev3]** The per-state switches cover "which notifications"; "for which session" waits for evidence it is needed |
| **[rev3]** Separate switches per surface (OS notification vs in-app toast) | The surface follows from focus, not preference; a state switch silences both |
| Sound, urgency levels, notification actions/buttons | The existing notifier surfaces title + body + click; matching it keeps one code path |
| **[rev4]** Fetching a task title from Azure DevOps to build a notification | A notification must not wait on the network or fail with it; an unpinned task shows its number only. Owner decision |
| **[rev4]** Resolving the task through the registered worktree tree | Scanning every workspace per notification is too heavy; the session's own cwd branch answers the same question |
| Batching or rate-limiting several at once | One per session, bounded by how many agents the user chose to run |
| **[rev2]** Notifying that a usage limit paused a session | `StopFailure` reports `rate_limit` as an `error`, which this feature does notify. The `quota_auto_resume_*` notifications that say the wait ended are not consumed by `session-activity-status` yet; see its follow-up |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| **[rev2]** Which transitions notify | Entering `waiting`, `needs-approval`, `needs-input` or `error`. Never `working`, `compacting` or `exited` | Those four are exactly the states where the agent has stopped and the next move is the user's | y |
| **[rev3]** Two tiers are wording only | `needs-approval` / `needs-input` are **blocked**; `waiting` / `error` are **finished**. The tier changes the wording and the priority of the story, never whether it fires | A blocked agent is idle while the user believes it is working, which is the costlier miss | y |
| **[rev3]** Switches | One **master** switch plus **one switch per notifiable state** (`needs-approval`, `needs-input`, `waiting`, `error`). A notification fires only when the master and that state's switch are both on. Per state, not per tier | Owner decision: the user picks which states notify, or turns them all off at once | y |
| **[rev3]** Defaults | Master and all four states **on** when absent from the config | Owner decision. A fresh install notifies; the user turns off what is noise | y |
| **[rev3]** Settings tabs | The settings dialog gets a **General** tab with everything it shows today and a **Notifications** tab with the five switches | Owner request 2026-09-16: keep notification settings apart from the general ones | y |
| **[rev3]** Master off keeps the state choices | Turning the master off does not change the four state switches; turning it back on restores them | Otherwise "pause all notifications" destroys the selection the user made. Accepted with the Design approval, 2026-09-16 | y |
| When a notification fires | When the app window is **not focused** OR the session is **not the attached one** | Owner decision. Those are the two cases where the rail's indicator cannot be seen | y |
| Which surface each case uses | Window unfocused → **OS notification**. Window focused but session not attached → **in-app toast** | An OS toast thrown at someone already looking at the app duplicates a signal the app can deliver itself; an in-app toast is invisible when the app is behind another window. **[rev3]** Confirmed by the owner 2026-09-16 | y |
| The attached session is exempt while focused | No notification of either kind | Its row and its terminal are both on screen | y |
| **[rev3]** What "attached" means | The session whose terminal is mounted in the agents direction. In any other direction no session is attached, so a focused window gets an in-app notice for every session | Leaving the agents direction unmounts the terminal and detaches it; its row is not on screen either | y |
| **[rev2]** Where the decision is made | Main, which already holds the attached session (`SessionManager.#activeId`) and can read window focus. The in-app toast is a push to the renderer | Keeping one decision in one place stops the two surfaces from disagreeing about whether a transition was notifiable. **Design may split it; that is a Design call, not a spec one** | Design |
| **[rev3]** Setting shape | Under `ui`, absent keys = enabled, persisted immediately on toggle via `config:patch`, edited in the settings dialog. The exact key shape is a Design call — note `ConfigPatch` merges `ui` one level deep, so a nested object is replaced whole | Persist-on-change matches `defaultShell`. Replaces the single `ui.notifyOnAgentActivity` boolean of rev2 | Design |
| **[rev4]** Where the task comes from | The number is the last branch segment's number (`taskIdFromBranch`, as the rail does) of the session cwd's current branch, read with `git symbolic-ref --short HEAD` (unlike `rev-parse`, it answers on a branch with no commits yet and fails on a detached HEAD). The title is the pinned task's cached details, no network | Same number the rail groups by; the cache is what the tasks pane already shows | y |
| **[rev4]** Layout with a task | Title `#<id> · <task title>` (or `#<id>` with no cached title); body line 1 the state, line 2 `<agent> · <session title>`. Without a task the rev3 layout stands | Owner decision 2026-09-16 | y |
| **[rev5]** Length | The app never cuts the title: the task title and the session title are sent whole, and the in-app notice wraps the title over as many lines as it needs. Replaces rev4's 60-character cut | Owner decision 2026-09-16: losing part of a task title is worse than a taller notice. Windows may still shorten the title line of its own toast; the app does not control that | y |
| Click target | Show and focus the window, switch to the agents direction, select the session | Mirrors the `workflow:focus-run` path already shipped | y |
| **[rev2]** Notification content | Title: agent + session title. Body: the state, plus the detail the activity already carries — the tool for an approval, the error type for a failure | `SessionActivity` carries `tool` and `error`, so "needs approval to run Bash" and "turn failed: rate_limit" cost nothing extra. A body that only says "waiting" makes the user open the app to learn what it wants. **[rev3]** Confirmed by the owner. Pinned wording: title `<agent> · <title>` (no doubled prefix when the title already starts with it); body `Needs approval to run <tool>` / `Needs your approval`, `Needs your input`, `Finished its turn`, `Turn failed: <error>` / `Turn failed` | y |
| Several sessions at once | One notification per session, no batching | Bounded by how many agents the user chose to run |
| Notifications unsupported by the OS | Skip silently | The existing `isSupported()` guard already does this | y |
| **[rev2]** Idempotency | Inherited: `session-activity-status` emits nothing when the view is unchanged (**ACTV-06**), so a notification cannot repeat without a real transition | Corrects the original citation, which pointed at ACTV-07 before the renumbering | y |
| **[rev2]** Interrupted turns are silent | When the user interrupts with Esc, Claude Code fires no hook, so no transition arrives and nothing notifies until the `idle_prompt` notification ~60 s later | Documented Claude Code behaviour, inherited from `session-activity-status` (ACTV-28). The user who pressed Esc is at the keyboard anyway | y |
| **[rev2]** A keystroke can end a blocked state | Answering a permission dialog moves the session to `working` (ACTV-12), which never notifies | Means a blocked notification cannot be followed by a "resumed" one | y |
| Auth boundaries, rate limits, external-dependency failure | N/A | The OS notification API is local and already in use | y |
| Data lifecycle | N/A | Fire-and-forget; the only persisted datum is the boolean setting | y |
| Observability | N/A | The notifier is an existing, exercised path; this adds a caller | y |

**Open questions:** none. **[rev3]** The owner confirmed the triggers, the surface
split, the body content, and replaced the single switch with a master plus per-state
switches, all on by default. Two rows are left to Design (where the decision is made, the
config key shape). One row stays `n` as the agent's default: the master switch preserves
the per-state choices.

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

### P3: Choose which notifications to get **[rev3]**

**User Story**: As a user who finds some of them intrusive, I want to pick which states
notify me, or switch them all off at once, so that I keep the alerts I value and the rail's
indicators stay either way.

**Why P3**: A notification the user cannot silence is a feature they turn off by
uninstalling it. Per-state switches let "tell me when blocked, not when finished" exist
without giving up the rest.

**Acceptance Criteria**:

1. WHERE the master notification switch is off the app SHALL show neither an OS notification nor an in-app toast on any activity transition.  <!-- optional-feature -->
2. WHERE the master switch is on and the switch for a state is off, WHEN a session enters that state THEN the app SHALL show neither an OS notification nor an in-app toast.  <!-- complex -->
3. WHERE the master switch is on and the switch for a state is on, WHEN a session enters that state THEN the app SHALL notify as P1 and P2 specify.  <!-- complex -->
4. WHEN the user toggles the master switch or a state switch in the settings dialog THEN the app SHALL persist it immediately via `config:patch`.  <!-- event-driven -->
5. WHERE the master switch or a state switch is absent from the config the app SHALL treat it as on.  <!-- optional-feature -->
6. The settings dialog SHALL offer one switch per notifiable state: `needs-approval`, `needs-input`, `waiting` and `error`.  <!-- ubiquitous -->
7. WHEN the user turns the master switch off and back on THEN the app SHALL keep each state switch as it was.  <!-- event-driven -->
8. WHILE the master switch is off the settings dialog SHALL show the state switches as disabled.  <!-- state-driven -->
9. **[rev3]** The settings dialog SHALL separate its content into a **General** tab (Azure DevOps defaults, templates, agents, shell) and a **Notifications** tab (the master and state switches), opening on General.  <!-- ubiquitous -->
10. **[rev3]** WHEN the user switches tabs THEN the settings dialog SHALL keep unsaved General edits and an open agent form as they were.  <!-- event-driven -->

**Independent Test**: Turn `waiting` off, put the app in the background, let an agent finish
— nothing; trigger a permission prompt — one notification. Turn the master off, trigger the
prompt again — nothing. Turn the master back on: `waiting` is still off. Restart the app and
every switch holds.

### P4: Told which task the agent is on **[rev4]**

**User Story**: As a user running agents on several tasks, I want the notification to name the
task, so that I know which work is waiting without opening the app.

**Why P4**: The session title defaults to the worktree folder, which rarely says what the work is.
It builds on P1–P3 and changes only the wording.

**Acceptance Criteria**:

1. WHERE the session's cwd is on a branch whose last segment carries a task number and that task is pinned with cached details, the notification title SHALL be `#<id> · <task title>`.  <!-- optional-feature -->
2. WHERE the branch carries a task number that is not pinned or has no cached details, the notification title SHALL be `#<id>`.  <!-- optional-feature -->
3. WHERE the notification names a task, its body SHALL be the state line followed by a line `<agent> · <session title>`.  <!-- optional-feature -->
4. **[rev5]** The app SHALL send the notification title with the task title and the session title whole, never cut or ending in an app-added `…`.  <!-- ubiquitous -->
5. IF the branch cannot be read (not a git directory, a detached HEAD, git failing or taking longer than 2 seconds) THEN the notification SHALL use the layout without a task.  <!-- unwanted-behavior -->
6. The app SHALL NOT call Azure DevOps to build a notification.  <!-- ubiquitous -->
7. **[rev5]** The in-app notice SHALL wrap the title over as many lines as it needs and show each body line on its own line.  <!-- ubiquitous -->

**Independent Test**: Start an agent in a worktree whose branch ends in a pinned task's number,
switch away, trigger a permission prompt: the notification reads `#<id> · <task title>`,
`Needs approval to run Bash`, `<agent> · <session>`. Unpin the task and repeat: the title is
just `#<id>`. Repeat in a folder that is not a git repository: the rev3 layout.

---

## Edge Cases

- IF the window has been destroyed when a notification is clicked THEN the app SHALL ignore the click without error.  <!-- unwanted-behavior -->
- WHEN several sessions enter a notifiable state at the same time THEN the app SHALL raise one notification per session.  <!-- event-driven -->
- IF a session is stopped between its transition and the notification click THEN the app SHALL still select that session rather than fail.  <!-- unwanted-behavior -->
- WHEN a session enters a notifiable state while the app is minimized THEN the app SHALL treat the window as not focused and use the OS notification.  <!-- event-driven -->
- **[rev2]** WHEN a session moves from `needs-approval` straight to `working` because the user answered the dialog THEN the app SHALL NOT notify.  <!-- event-driven -->
- **[rev2]** IF a session's PTY stops while it holds a notifiable state THEN the app SHALL NOT notify for the activity being discarded.  <!-- unwanted-behavior -->
- **[rev3]** WHEN a session's first activity event puts it in a notifiable state (for example an `idle_prompt` on a session never prompted) THEN the app SHALL NOT notify, because no turn ran.  <!-- event-driven -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| NOTF-01 | P1: Told when an agent is blocked | Execute | Verified |
| NOTF-02 | P1: Told when an agent is blocked | Execute | Verified |
| NOTF-03 | P1: Told when an agent is blocked | Execute | Verified |
| NOTF-04 | P1: Told when an agent is blocked | Execute | Verified |
| NOTF-05 | P1: Told when an agent is blocked | Execute | Verified |
| NOTF-06 | P1: Told when an agent is blocked | Execute | Verified |
| NOTF-07 | P2: Told when an agent finishes or fails | Execute | Verified |
| NOTF-08 | P2: Told when an agent finishes or fails | Execute | Verified |
| NOTF-09 | P2: Told when an agent finishes or fails | Execute | Verified |
| NOTF-10 | P2: Told when an agent finishes or fails | Execute | Verified |
| NOTF-11 | P2: Told when an agent finishes or fails | Execute | Verified |
| NOTF-12 | P2: Told when an agent finishes or fails | Execute | Verified |
| NOTF-13 | P3: Choose which notifications to get | Execute | Verified |
| NOTF-14 | P3: Choose which notifications to get | Execute | Verified |
| NOTF-15 | P3: Choose which notifications to get | Execute | Verified |
| NOTF-16 | P3: Choose which notifications to get | Execute | Verified |
| NOTF-17 | P3: Choose which notifications to get | Execute | Verified |
| NOTF-18 | P3: Choose which notifications to get | Execute | Verified |
| NOTF-19 | P3: Choose which notifications to get | Execute | Verified |
| NOTF-20 | P3: Choose which notifications to get | Execute | Verified |
| NOTF-21 | Edge cases | Execute | Verified |
| NOTF-22 | Edge cases | Execute | Verified |
| NOTF-23 | Edge cases | Execute | Verified |
| NOTF-24 | Edge cases | Execute | Verified |
| NOTF-25 | Edge cases | Execute | Verified |
| NOTF-26 | Edge cases | Execute | Verified |
| NOTF-27 | Edge cases | Execute | Verified |
| NOTF-28 | P3: Choose which notifications to get (AC 9, added after the edge cases were numbered) | Execute | Verified |
| NOTF-29 | P3: Choose which notifications to get (AC 10) | Execute | Verified |
| NOTF-30 | P4: Told which task the agent is on | Execute | Verified |
| NOTF-31 | P4: Told which task the agent is on | Execute | Verified |
| NOTF-32 | P4: Told which task the agent is on | Execute | Verified |
| NOTF-33 | P4: Told which task the agent is on | - | Pending |
| NOTF-34 | P4: Told which task the agent is on | Execute | Verified |
| NOTF-35 | P4: Told which task the agent is on | Execute | Verified |
| NOTF-36 | P4: Told which task the agent is on | - | Pending |

**ID format:** `NOTF-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 36 total; NOTF-01..29 mapped to T1–T13 + fix round 1, NOTF-30..36 mapped to T14–T20 + fix round 2

---

## Success Criteria

- [ ] **[rev2]** An agent that opens a permission dialog while the app is in the background produces exactly one notification, and it names the tool
- [ ] An agent finishing while the app is in the background produces exactly one notification
- [ ] Clicking it lands on that session, ready to type
- [ ] Working at the attached session's terminal produces no notifications at all
- [ ] **[rev2]** A turn that compacts, runs ten tools and finishes produces exactly one notification
- [ ] The off switch silences both surfaces and survives a restart
- [ ] **[rev3]** Turning one state off silences only that state, and survives toggling the master switch and a restart
- [ ] **[rev4]** A notification from a session on a pinned task's branch names that task, and a long task title arrives whole
