# Auto-Pin Tasks from Worktrees Specification

**Scope size:** Large — spec + requirement IDs; design inline, formal `tasks.md` after spec approval
**Builds on:** `pinned-tasks-pane` (TaskBoard pin/unpin), `start-work-from-task` (`branchNameFor`, `taskIdFromBranch`), `per-workspace-config` (template overrides)

## Problem Statement

Worktrees created outside the app (e.g. by the `start-task` skill, which produces `user/otavio/{id}-{slug}` branches) already carry the task ID in their branch name, but the Pinned Tasks pane only fills when the user pastes the ID by hand. The link "branch name ↔ task" is already the app's source of truth; the pane should follow it automatically so every worktree started from a task shows up with its card.

## Goals

- [ ] A worktree whose branch matches the effective branch template gets its task pinned on the next tree refresh, with no user action
- [ ] Lay the groundwork for the planned direction: tasks derived from the repo instead of pinned by hand
- [ ] Zero regressions to manual pin/unpin, task tags, and worktree counts

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Matching folder names against `worktreeTemplate` | User decision: the branch is the match key |
| Changing `taskIdFromBranch` (tags, counts, time tracking, notifications) | Existing heuristic stays; this feature adds a stricter template matcher only for auto-pin |
| Auto-unpin when the last matching worktree is removed | Future feature: manual pinning will be retired and every task derived from the repo, removed when its worktree is deleted. This feature only adds tasks |
| Remembering unpins ("don't auto-pin again") | User decision: an unpinned task whose worktree still exists comes back on the next refresh. Unpin is transitional until pinning is retired |
| Real-time filesystem watch for new worktrees | Trigger is the existing tree refresh (startup, window focus, manual refresh, after create) |
| Resolving org/project from the repo remote | Auto-pin uses `ado.defaultOrg`/`ado.defaultProject`; per-repo org mapping is a separate feature |

---

## Decisions

- **Match key = branch vs branchTemplate** (user): the effective template, meaning the per-workspace `.app/config.json` `branchTemplate` override if present, else global `ado.branchTemplate`, else `DEFAULT_BRANCH_TEMPLATE`. It is compiled into a matcher that captures `{id}`.
- **Auto-pins are real pins** (user): stored in `config.pinnedTasks` like a manual pin, with the same card and the same ✕.
- **Unpin is not remembered** (user): unpinning a task whose branch still matches lets it return on the next refresh. Planned direction: manual pinning will be retired, every task derived from the repo, and a task removed when its worktree is deleted (future feature).
- **Trigger = every tree refresh** (user): every `tree:get` result is scanned. Worktrees that were already on disk before the feature shipped are pinned too (retroactive).
- **Deliberate reversal of start-work §Out of Scope** ("no speculative ADO fetches for unpinned IDs in branches"): IDs are now fetched, but only when they come from a branch that strictly matches the template, never from the heuristic. Record as a project decision (AD) at Design.

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| How non-`{id}` placeholders match | `{type}` → `feature` or `bugfix`; `{usId}` → one or more digits; `{slug}`, `{usSlug}`, `{dev}` → any run of characters without `/` (may be empty); unknown `{x}` → literal text (mirrors `branchNameFor` pass-through); literal text is escaped and matched exactly; the whole branch must match (anchored) | Mirrors `branchNameFor` rendering, so any branch the app or a template-following skill creates matches | n |
| Segments dropped during rendering | A template path segment made only of placeholders `branchNameFor` can render empty (`{dev}`, `{usId}`, `{usSlug}`, `{slug}`) plus `-` is optional, and a `-` next to one of them is optional too in the matcher, so a branch with that segment dropped still matches (e.g. `user/{dev}/{usId}-{usSlug}/{id}-{slug}` matches `user/otavio/123-foo`) | `branchNameFor` drops empty segments when `{dev}`/`{usId}` are blank, so the matcher has to accept that output | n |
| Case sensitivity | Literal text matches case-insensitively | Git on Windows is case-insensitive in practice; `slugOf` already lowercases | n |
| Adjacent numeric placeholders (`{usId}{id}`, `{id}{usId}`) | Unsupported: the round-trip (AC 8) is not guaranteed, since `94821` cannot be split back into its two numbers. Separate them with literal text (`{usId}-{id}`) | No boundary exists in the rendered text; every shipped and documented template separates them (Verifier spec-precision gap) | y |
| Template without `{id}` | Auto-pin is a no-op for that workspace | Nothing to capture | n |
| org/project of a derived ID | `ado.defaultOrg` + `ado.defaultProject`; when either is unset, auto-pin is a silent no-op | Same resolution as a bare-ID manual pin; a branch carries no org | n |
| On/off switch | New `ado.autoPinFromWorktrees: boolean`, default `true`, hand-editable (no settings UI in this feature) | Gives an escape hatch without scope creep | n |
| Validation before persisting | Same as manual pin: fetch the item first; not found → not pinned | Spec `pinned-tasks-pane` §Decisions: no dead cards | n |
| Not-found / auth failure retry | Auth failure → retried on the next refresh. Not found → remembered for the session (in memory only) and not re-fetched until restart | Avoids one ADO call per refresh for a branch whose ID doesn't exist | n |
| Detached HEAD / default checkout | Skipped (no branch, or branch doesn't match) | Nothing to derive | n |
| User notification | None beyond the card appearing in the pane | The pane is the feedback; a toast on every focus is noise | n |

**Open questions:** none. All are resolved or logged above.

---

## User Stories

### P1: Template matcher ⭐ MVP

**User Story**: As a developer, I want the app to recognize branches built from my configured template, so that only real task branches drive auto-pinning.

**Acceptance Criteria**:

1. WHEN `taskIdFromTemplate('user/otavio/{id}-{slug}', 'user/otavio/4821-fix-login')` is called THEN the matcher SHALL return `4821`  <!-- event-driven -->
2. WHEN the branch doesn't match the template's literal text (e.g. `user/maria/4821-x` against `user/otavio/{id}-{slug}`, or `main`) THEN the matcher SHALL return `null`  <!-- event-driven -->
3. WHEN the template is `{type}/{id}-{slug}` THEN `feature/77-a` and `bugfix/77-a` SHALL return `77` and `chore/77-a` SHALL return `null`  <!-- event-driven -->
4. WHEN a template segment consists only of empty-able placeholders (`{dev}`, `{usId}`, `{usSlug}`, `{slug}`) and `-` THEN a branch with that segment absent SHALL still match (`user/{dev}/{usId}-{usSlug}/{id}-{slug}` + `user/otavio/123-foo` → `123`; + `user/otavio/9-us/123-foo` → `123`)  <!-- event-driven -->
5. IF the template contains no `{id}` THEN the matcher SHALL return `null` for every branch  <!-- unwanted -->
6. WHEN the template is blank or null THEN the matcher SHALL use `DEFAULT_BRANCH_TEMPLATE`  <!-- event-driven -->
7. The matcher SHALL match the whole branch (anchored at both ends) and literal text case-insensitively  <!-- ubiquitous -->
8. WHEN a branch rendered by `branchNameFor` from the same template is matched THEN the matcher SHALL return the id it was rendered with (round-trip)  <!-- event-driven -->

**Independent Test**: Vitest table over templates × branches, including a round-trip property against `branchNameFor`.

---

### P1: Auto-pin on tree refresh ⭐ MVP

**User Story**: As a developer, I want a worktree created by a skill to put its task in the Pinned Tasks pane by itself, so that I never pin by hand.

**Acceptance Criteria**:

1. WHEN the tree is refreshed and a worktree's branch matches its workspace's effective template THEN TaskBoard SHALL fetch the derived ref (`defaultOrg`/`defaultProject`/id) and, if found, append it to `config.pinnedTasks`  <!-- event-driven -->
2. WHEN the derived task is already pinned THEN TaskBoard SHALL NOT fetch or duplicate it  <!-- event-driven -->
3. WHEN several worktrees across workspaces carry the same derived ref THEN it SHALL be pinned exactly once  <!-- event-driven -->
4. WHEN auto-pin adds one or more tasks THEN the renderer's tasks snapshot SHALL update without a manual refresh and the new cards SHALL render like manually pinned ones  <!-- event-driven -->
5. IF `defaultOrg` or `defaultProject` is unset THEN auto-pin SHALL do nothing and SHALL NOT surface an error  <!-- unwanted -->
6. IF the ADO fetch fails on auth THEN nothing SHALL be persisted, the pane's auth state SHALL follow the existing `auth: 'failed'` path, and the next refresh SHALL retry  <!-- unwanted -->
7. IF the derived work item is not found THEN it SHALL NOT be pinned and SHALL NOT be fetched again during the current app session  <!-- unwanted -->
8. WHILE an auto-pin pass is running, a concurrent pass SHALL NOT pin the same ref twice  <!-- state-driven -->
9. WHERE `ado.autoPinFromWorktrees` is `false`, the tree refresh SHALL NOT pin anything  <!-- optional-feature -->
10. The per-workspace template override SHALL take precedence over the global template for worktrees in that workspace  <!-- ubiquitous -->

**Independent Test**: Vitest on TaskBoard with a stub `WorkItemSource` and temp config dir. Live check: run `start-task` to create a worktree, focus the app, and the card appears.

---

## Edge Cases

- IF a worktree is detached (no branch) THEN it SHALL be skipped
- IF the workspace's `.app/config.json` is malformed THEN the global template SHALL be used (existing `workspaceTemplates` behavior)
- WHEN a branch's derived ID is `0` or has leading zeros (`0042`) THEN `0` SHALL be skipped and `0042` SHALL become `42`
- WHEN the config file is missing `autoPinFromWorktrees` (older config) THEN the default `true` SHALL apply
- WHEN a task is unpinned while a worktree still matches it THEN the next tree refresh SHALL pin it again

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| APIN-01 | P1: Template matcher (AC 1–3) | Done | Verified |
| APIN-02 | P1: Template matcher (AC 4, optional segments) | Done | Verified |
| APIN-03 | P1: Template matcher (AC 5–7) | Done | Verified |
| APIN-04 | P1: Template matcher (AC 8, round-trip) | Done | Verified |
| APIN-05 | P1: Auto-pin (AC 1–3, 10) | Done | Verified |
| APIN-06 | P1: Auto-pin (AC 4, renderer update) | Done | Verified |
| APIN-07 | P1: Auto-pin (AC 5–7, failure paths) | Done | Verified |
| APIN-08 | P1: Auto-pin (AC 8, concurrency) | Done | Verified |
| APIN-09 | P1: Auto-pin (AC 9, toggle) | Done | Verified |

**Coverage:** 9 total, 9 verified ✅ (T1–T11; Verifier PASS on round 1, 18/18 ACs, sensor 11/11 killed; live CDP check 8/8)

---

## Success Criteria

- [x] Creating a worktree with `start-task` (branch `user/otavio/<id>-<slug>`) and focusing the app pins `<id>` with its live card, with no manual paste
- [x] Existing Vitest suite stays green; new matcher + TaskBoard cases cover every AC above
