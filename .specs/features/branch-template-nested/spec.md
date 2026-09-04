# Branch Template Aninhado — `user/<dev>/<us-id>-<slug>/<task-id>-<slug>` Specification

**Scope size:** Large — multi-component (shared parse/render, ADO gateway, IPC, renderer dialog, config). Design + formal tasks included.

## Problem Statement

The app generates branches from `{type}/{id}-{slug}` (`feature/10002-nested-branch`) and recovers the task ID from any branch via "first standalone multi-digit number". The developer's org convention is the nested format `user/<dev>/<us-id>-<slug>/<task-id>-<slug>` (US as the parent slot, Task as the leaf slot). With two numbers in the branch, today's parser returns the **US** id (the first number) instead of the **Task** id (the leaf), so a worktree created with the nested format is tagged/linked to the wrong work item and the `{repo}-{id}` folder template renders the wrong id. The app also cannot generate the nested format, because the branch template only knows `{type}/{id}/{slug}` of the pinned task and has no access to the parent US.

## Goals

- [ ] `taskIdFromBranch` recovers the Task id from the nested format (and keeps recovering it from `{type}/{id}-{slug}`) — every worktree↔task surface (tags, linked card, `{repo}-{id}` folder template, session attribution, board grouping) works with the nested format
- [ ] `branchNameFor` renders new placeholders `{dev}`, `{usId}`, `{usSlug}` so a configured template `user/{dev}/{usId}-{usSlug}/{id}-{slug}` produces the nested format in the Start-work prefill
- [ ] The Start-work dialog resolves the pinned task's parent US from ADO and feeds it to the template; missing parent / auth failure degrades to empty placeholders without blocking
- [ ] Existing behavior preserved: `{type}/{id}-{slug}` remains the default template, `{type}`/`{id}`/`{slug}` keep working, unknown placeholders still pass through literally

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Changing `DEFAULT_BRANCH_TEMPLATE` to the nested format | Owner decision: the new format is opt-in via `ado.branchTemplate`; default stays `{type}/{id}-{slug}` |
| Fetching the *leaf* Task when the pinned item is a US | The dialog pre-fills from the pinned item as the Task; child-task selection is a different flow (Workflows `ado` step already lists children) |
| Per-workspace `devAlias` override | `{dev}` is the same alias across repos; a workspace override is a separate config concern |
| PR/issue creation from the app | Out of scope for the whole app (view-only ADO) |
| Changing the worktree `{repo}-{branch}` default template | Only `{repo}-{id}` behavior is affected (through `taskIdFromBranch`), and it needs no change beyond the parse fix |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| ID-extraction rule changes from "first standalone multi-digit number in the whole branch" to "first standalone multi-digit number in the **last non-empty path segment**" | `taskIdFromBranch` splits on `/`, takes the last non-empty segment, returns its first standalone 2+ digit number (or null) | The nested format carries the leaf (Task) id in the last segment; `{type}/{id}-{slug}` also carries its single id in the last segment. Behavior changes only when numbers sit in **different** segments (the nested format): `user/jdoe/10001-…/10002-…` now yields `10002` (was `10001`). Multi-number **within one segment** keeps the first-number behavior — `feature/123-fix-456` → `123`, unchanged | y |
| Parent slot = the **immediate** Hierarchy-Reverse parent | `getWorkItemWithRelations` returns the first `Hierarchy-Reverse` relation as `parentRefs` | ADO relations carry no parent depth; the team nests Tasks directly under US, so the immediate parent is the US in practice | y |
| The parent US resolution is **on-demand per dialog open**, not cached/persisted | The Start-work dialog issues one IPC call when opened; result feeds the prefill, nothing stored | Keeps the feature additive (no new persisted state); pins keep their id-only degradation model | y |
| Auth failure / no parent during resolution degrades to empty placeholders | Template renders with `{dev}`/`{usId}`/`{usSlug}` empty; empty segments are dropped by the existing sanitizer | Owner decision: never blocks creation; the branch stays editable after prefill | y |
| `{dev}` comes from a new global `ado.devAlias` (hand-edited config), not derived from ADO identity | Empty alias → `{dev}` renders empty and its segment is dropped | Owner decision; the branch alias (e.g. `jdoe`) is not derivable from the ADO account (email differs) | y |
| `branchNameFor` gains an optional context parameter (not a signature-breaking change) | `branchNameFor(task, template, ctx?: { devAlias?: string; parent?: { id: number; title: string } })` | Existing callers and tests compile unchanged; new placeholders render empty when context is absent | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Nested-format recognition — `taskIdFromBranch` ⭐ MVP

**User Story**: As a developer, I want the app to recover the Task id from a branch named `user/<dev>/<us-id>-<slug>/<task-id>-<slug>`, so that worktrees created with the org's nested convention are tagged, linked and folder-named by the correct Task.

**Why P1**: Without it, the nested format actively mis-links worktrees to the US id — the core loop (task↔worktree) breaks for the format the team actually uses.

**Acceptance Criteria**:

1. WHEN `taskIdFromBranch` scans `user/jdoe/10001-user-story/10002-nested-branch` THEN it SHALL return `10002` (the number in the last path segment, not the first)  <!-- event-driven -->
2. WHEN `taskIdFromBranch` scans a branch in the existing single-id format THEN it SHALL return the same id as before — `feature/4821-add-oauth-refresh-token-rotation` → `4821`, `bugfix/12-fix-login` → `12`  <!-- event-driven -->
3. WHEN `taskIdFromBranch` scans a hand-typed 3-segment branch with one id THEN it SHALL keep returning it — `user/otavio/4821-quick-spike` → `4821`, bare `4821` → `4821`  <!-- event-driven -->
4. WHEN the last path segment carries multiple standalone numbers THEN the **first** standalone number in that segment SHALL win — `feature/123-fix-456` → `123` (unchanged behavior)  <!-- event-driven -->
5. WHEN the branch has no standalone 2+ digit number in its last segment THEN it SHALL return null — `main`, `feature/dark-mode`, `oauth2-rework`, `(detached abc1234)`  <!-- unwanted-behavior -->
6. WHEN a number is adjacent to a letter/digit in the last segment THEN it SHALL NOT match — `feature/sso2024migration` → null  <!-- unwanted-behavior -->

**Independent Test**: Vitest — extend `taskIdFromBranch` cases with nested, multi-segment, last-segment-multi-number, and no-number branches; verify the existing single-id cases are byte-identical.

---

### P1: Nested-format generation — `branchNameFor` placeholders ⭐ MVP

**User Story**: As a developer, I want `branchNameFor` to render `{dev}`, `{usId}` and `{usSlug}` so that the configured template `user/{dev}/{usId}-{usSlug}/{id}-{slug}` produces the nested branch from the Task + its parent US.

**Why P1**: Generation and recognition are the two halves of the same loop; recognition alone leaves the Start-work dialog unable to pre-fill the org format.

**Acceptance Criteria**:

1. WHEN `branchNameFor` renders `{dev}` THEN it SHALL substitute the `devAlias` from the context (empty string when absent)  <!-- event-driven -->
2. WHEN `branchNameFor` renders `{usId}` / `{usSlug}` THEN it SHALL substitute the parent's id / slugified title from the context (empty when absent)  <!-- event-driven -->
3. WHEN the full context is present and the template is `user/{dev}/{usId}-{usSlug}/{id}-{slug}` THEN the result SHALL be `user/<dev>/<us-id>-<slug-of-us>/<task-id>-<slug-of-task>`  <!-- event-driven -->
4. WHEN a placeholder has no data THEN the resulting empty path segment SHALL be dropped by the existing segment sanitizer (e.g. no parent → `user/<dev>/<task-id>-<slug>`, no alias → the `user`-rooted branch drops that segment)  <!-- event-driven -->
5. WHEN the template is the default or uses only `{type}`/`{id}`/`{slug}` THEN the output SHALL be byte-identical to today (default `{type}/{id}-{slug}` unchanged)  <!-- ubiquitous -->
6. WHEN the template contains an unknown placeholder THEN it SHALL pass through literally, as today — `'{user}/{id}-{slug}'` stays `{user}/...`  <!-- ubiquitous -->

**Independent Test**: Vitest — render with full/partial/empty context (alias, parent, neither), verify default and legacy templates are byte-identical, unknown placeholders still pass through.

---

### P1: Parent US resolution — ADO gateway + IPC ⭐ MVP

**User Story**: As a developer, I want the Start-work dialog to resolve the pinned Task's parent US from ADO, so that the nested prefill is automatic rather than hand-typed.

**Why P1**: Without a live parent lookup the `{usId}`/`{usSlug}` placeholders can never be filled in normal use.

**Acceptance Criteria**:

1. WHEN `getWorkItemWithRelations` maps a work item's relations THEN it SHALL also expose `parentRefs` from `System.LinkTypes.Hierarchy-Reverse` links (in addition to the existing `childRefs`)  <!-- event-driven -->
2. WHEN the dialog requests the parent of a pinned Task that has a US parent THEN the app SHALL return that parent's `{ id, title }` (the template needs only id + slugifiable title)  <!-- event-driven -->
3. WHEN the pinned Task has no parent THEN the app SHALL return `null`  <!-- event-driven -->
4. WHEN ADO auth fails or the call errors THEN the app SHALL degrade to `null` (the dialog renders empty placeholders) rather than throw  <!-- unwanted-behavior -->
5. WHEN a work item has several Hierarchy-Reverse parents THEN the first SHALL be returned  <!-- event-driven -->

**Independent Test**: Vitest — `parseChildRefs`-style unit test for a new `parseParentRefs`; gateway-level test with an injected fetch returning a relations payload; TaskBoard/`tasks:parent` handler test with a stubbed source (parent present / absent / auth-fail).

---

### P1: Start-work dialog wiring ⭐ MVP

**User Story**: As a developer, I want the Start-work dialog to pre-fill the branch from the effective template using the Task + parent US + alias, while keeping the field editable.

**Why P1**: This is where the generation reaches the user.

**Acceptance Criteria**:

1. WHEN the dialog opens for a pinned Task THEN it SHALL resolve the parent US and pre-fill the branch from the effective template (workspace `.app/` override → global) with `devAlias` + parent context  <!-- event-driven -->
2. WHEN the parent resolution is pending THEN the prefill SHALL use the data available so far and SHALL update once the parent arrives, without overwriting a user-edited branch  <!-- event-driven -->
3. WHEN the user edits the branch field THEN the template SHALL NOT re-apply (existing behavior preserved)  <!-- ubiquitous -->
4. WHEN the branch is generated from the nested template THEN the live worktree-path preview SHALL reflect the branch (existing `worktreePathFor` behavior)  <!-- ubiquitous -->

**Independent Test**: Vitest for `branchNameFor` call-sites stays pure; the dialog's async re-prefill is hand-verified via CDP smoke per project renderer convention (no component unit tests).

---

### P2: Config — `ado.devAlias`

**User Story**: As a developer, I want a hand-editable `ado.devAlias` setting so the `{dev}` placeholder has a stable source.

**Why P2**: Needed only when the nested template is actually configured; harmless empty default.

**Acceptance Criteria**:

1. WHEN `AppConfig.ado` is read THEN it SHALL include `devAlias` (string, default `''`)  <!-- ubiquitous -->
2. WHEN `devAlias` is empty or whitespace THEN the `{dev}` placeholder SHALL render empty (segment dropped)  <!-- event-driven -->
3. WHEN `devAlias` is set THEN `branchNameFor` SHALL use it for `{dev}`  <!-- event-driven -->

**Independent Test**: Config default/round-trip check (existing `ConfigPatch` pattern); Vitest for the empty-alias rendering in `branchNameFor`.

---

## Edge Cases

- IF the pinned Task's parent is a Feature/Epic (not a US) THEN the immediate parent id/title is still used — the template renders whatever the parent is (assumption logged)  <!-- unwanted-behavior -->
- WHEN the branch has trailing/duplicated slashes THEN the last **non-empty** segment wins (split tolerates empty segments)  <!-- unwanted-behavior -->
- WHEN `{usSlug}` is empty but `{usId}` is present THEN trailing separators in that segment are trimmed (`10001-` → `10001`)  <!-- unwanted-behavior -->
- WHEN the pinned item has no live details (auth down) THEN the dialog keeps the existing disabled-start behavior (template needs type/title) — parent resolution is not attempted  <!-- unwanted-behavior -->
- WHEN a branch uses only the parent slot (`user/<dev>/<us-id>-<slug>`, no leaf) THEN the last segment's number (the US id) wins — the truncated form is indistinguishable from a leaf branch and tags `#<us-id>`  <!-- unwanted-behavior -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| BRANCH-01 | P1: Nested-format recognition | Design | Verified |
| BRANCH-02 | P1: Nested-format recognition | Design | Verified |
| BRANCH-03 | P1: Nested-format recognition | Design | Verified |
| BRANCH-04 | P1: Nested-format recognition | Design | Verified |
| BRANCH-05 | P1: Nested-format recognition | Design | Verified |
| BRANCH-06 | P1: Nested-format recognition | Design | Verified |
| TEMPLATE-01 | P1: Nested-format generation | Design | Verified |
| TEMPLATE-02 | P1: Nested-format generation | Design | Verified |
| TEMPLATE-03 | P1: Nested-format generation | Design | Verified |
| TEMPLATE-04 | P1: Nested-format generation | Design | Verified |
| TEMPLATE-05 | P1: Nested-format generation | Design | Verified |
| TEMPLATE-06 | P1: Nested-format generation | Design | Verified |
| PARENT-01 | P1: Parent US resolution | Design | Verified |
| PARENT-02 | P1: Parent US resolution | Design | Verified |
| PARENT-03 | P1: Parent US resolution | Design | Verified |
| PARENT-04 | P1: Parent US resolution | Design | Verified |
| PARENT-05 | P1: Parent US resolution | Design | Verified |
| DIALOG-01 | P1: Start-work dialog wiring | Design | Verified |
| DIALOG-02 | P1: Start-work dialog wiring | Design | Verified |
| DIALOG-03 | P1: Start-work dialog wiring | Design | Verified |
| DIALOG-04 | P1: Start-work dialog wiring | Design | Verified |
| CONFIG-01 | P2: `ado.devAlias` | Design | Verified |
| CONFIG-02 | P2: `ado.devAlias` | Design | Verified |
| CONFIG-03 | P2: `ado.devAlias` | Design | Verified |

**ID format:** `[CATEGORY]-[NUMBER]` — BRANCH, TEMPLATE, PARENT, DIALOG, CONFIG.

**Coverage:** 5 total, 5 mapped to tasks in Design, 0 unmapped.

---

## Success Criteria

- [ ] A worktree created by hand with branch `user/jdoe/10001-user-story/10002-nested-branch` shows the Task tag `#10002` (not `#10001`) in the sidebar, the linked card in the detail pane, and the `{repo}-{id}` folder template renders `…-10002`
- [ ] With `ado.branchTemplate = user/{dev}/{usId}-{usSlug}/{id}-{slug}` and `ado.devAlias` set, Start-work on a Task under a US pre-fills `user/<dev>/<us-id>-<slug-of-us>/<task-id>-<slug-of-task>`; with no parent it pre-fills `user/<dev>/<task-id>-<slug-of-task>`
- [ ] All existing `taskIdFromBranch`/`branchNameFor` cases stay green byte-for-byte; only branches with numbers in different segments re-interpret (the nested format now yields the leaf Task id)
