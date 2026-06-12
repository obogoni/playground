# Start Work from Task Specification

**Milestone:** M3 — ADO Tasks & Start-Work Flow (second/final M3 feature)
**Sources of truth:** PRD issue #1 (stories 5, 10, 11, 16; §Task ↔ worktree link, §Start-work flow, §What is hard-coded, §Testing Decisions), `design_handoff_worktree_manager/README.md` (§1a sidebar task tags, §1b Linked task, §1c card footer, §3 Start-work dialog, §Branch template & sanitization)
**Scope size:** Medium — spec only; design inline (modules and flow fully dictated by PRD; dialog reuses `NewWorktreeDialog` patterns), tasks implicit in Execute

## Problem Statement

The app now has both halves of its headline loop — pinned ADO tasks and full worktree lifecycle — but no bridge between them. Starting work on a task still means reading the task card, hand-composing a branch name, and filling the new-worktree dialog manually; and nothing in the sidebar or detail pane shows which task a worktree carries. This feature closes the PRD loop: one button on a task card opens a pre-filled start-work dialog, and the branch name becomes the durable task↔worktree link rendered everywhere.

## Goals

- [ ] "Start work" on a pinned task opens a dialog with repo picker, base branch, and a branch name pre-filled from the `{type}/{id}-{slug}` template, editable, with live path preview (PRD stories 10, 11)
- [ ] Confirming creates the worktree via the existing `WorktreeManager.create` path; sidebar refreshes and selects it, no auto-open (PRD story 16, §Start-work flow)
- [ ] Every sidebar worktree row whose branch carries a pinned task's ID shows the task tag (type pill, `#id`, title, state dot); the detail pane shows the §1b linked-task card (PRD story 5)
- [ ] Task cards grow the §1c footer: worktree count + Start work / New branch button
- [ ] `branchNameFor` and `taskIdFromBranch` fully unit-tested per PRD §Testing Decisions

## Out of Scope

| Feature                                        | Reason                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Per-workspace `.app/` branch template override | M4 (Per-Workspace Config); v1 reads the global template only                            |
| Settings UI for the branch template            | M4 — `ado.branchTemplate` is hand-editable in `config.json`, same as org/project defaults |
| Board direction (chips, card grid, highlight)  | M4 (Board Direction) — this feature ships Tree-direction surfaces only                  |
| Configurable type→branch mapping               | PRD §What is hard-coded: Bug → `bugfix`, everything else → `feature`                    |
| Configurable ID-extraction rule                | PRD §What is hard-coded: first standalone multi-digit number                            |
| Fetching unpinned work items found in branches | PRD: extracted IDs are matched against **pinned** tasks; no speculative ADO fetches     |

---

## Decisions (gray areas resolved during Specify)

- **Pure linking logic lives in `src/shared/tasks.ts`** — `branchNameFor(details, id, template)` and `taskIdFromBranch(branch)` are pure functions needed by both processes (renderer pre-fills the dialog and joins tree rows to tasks; main owns nothing stateful here). Follows the `sanitizeBranch`/`worktreePathFor` precedent in `src/shared/worktrees.ts`. The PRD names them on `TaskBoard`; the shared module is the established codebase shape for its pure half.
- **"Standalone multi-digit number"** is defined as 2+ consecutive digits not adjacent to a letter or another digit (`feature/4821-fix` → 4821; `oauth2-rework` → none; `feature/123-fix-456` → 123). Single digits never tag. ⚠️ Flagged for user review (PRD doesn't pin down "multi-digit" boundaries).
- **Branch carries an ID that isn't pinned** *(PRD: "unmatched branches are simply untagged"; handoff's untagged note "no task ID in branch" would be wrong here)*: sidebar line 2 shows a distinct faint italic note — `#<id> — not pinned`; the detail pane §1b section shows the dashed note variant with the same text. No pills, no ADO link (org/project unknown), no speculative fetch. ⚠️ Flagged for user review.
- **Tag details come from the existing tasks snapshot** — the renderer already holds `TasksSnapshot` (refreshed on focus/manual); tags and linked cards join against it. The PRD's "fetched on demand if pinned-but-stale" needs no new fetch path: pinned-but-stale items are id-only until the next refresh, same degradation the tasks pane already has.
- **Start-work button is disabled while details are unavailable** (auth down / unresolved item): the template needs `{type}` and `{slug}` from live details. Tooltip-style reason via `title` attr. ⚠️ Flagged for user review.
- **Empty `{slug}`** (title sanitizes to nothing): trailing/leading separators left by an empty placeholder are trimmed per path segment — `feature/4821-` → `feature/4821`.
- **Template is rendered once at dialog open** — editing the branch afterwards never re-applies the template (PRD story 11: "a starting point, not a straitjacket"). The dialog reuses the `NewWorktreeDialog` chassis: repo chips, base branch defaulted to the picked repo's primary-checkout branch, live `worktreePathFor` preview, inline errors, no auto-open.
- **Config grows `ado.branchTemplate`** (default `"{type}/{id}-{slug}"`) inside the existing `ado` block; missing/blank value falls back to the default at render time.

---

## User Stories

### P1: TaskBoard linking logic — `branchNameFor` + `taskIdFromBranch` ⭐ MVP

**User Story**: As a developer, I want branch names generated from a template and task IDs recovered from any branch name, so that the task↔worktree link is the branch name itself — no mapping file (PRD §Task ↔ worktree link).

**Acceptance Criteria**:

1. WHEN `branchNameFor` renders `{type}` THEN work item type Bug SHALL map to `bugfix` and every other type to `feature`
2. WHEN `branchNameFor` renders `{slug}` THEN the title SHALL be lowercased, non-alphanumeric runs collapsed to single `-`, and leading/trailing `-` trimmed (e.g. "Add OAuth refresh-token rotation!" → `add-oauth-refresh-token-rotation`)
3. WHEN the template is rendered THEN `{id}` SHALL be the work item ID and unknown placeholders SHALL pass through literally; a missing/blank configured template SHALL fall back to `{type}/{id}-{slug}`
4. WHEN `{slug}` is empty (title all symbols) THEN separators left dangling at a path-segment edge SHALL be trimmed (`feature/4821-` → `feature/4821`)
5. WHEN `taskIdFromBranch` scans a branch THEN it SHALL return the first standalone multi-digit number (2+ digits, not adjacent to letters/digits) or null — `feature/4821-add-oauth` → 4821, `feature/123-fix-456` → 123, `oauth2-rework` → null, `main` → null

**Independent Test**: Vitest, full coverage per PRD §Testing Decisions — type mapping, slug sanitization (spaces, symbols, unicode, empty), template fallback, extraction on templated/hand-typed/multi-number/no-number/detached branch names.

---

### P1: Start-work dialog (§3) ⭐ MVP

**User Story**: As a developer, I want to start work on a pinned task by picking a repo and base branch with the branch name pre-filled from the template, so that creating a task-linked worktree is one short dialog (PRD stories 10, 11).

**Acceptance Criteria**:

1. WHEN a task card's footer button is clicked THEN the §3 dialog SHALL open: "START WORK" kicker, `#<id>` (mono, accent) + task title in the header, repo chip grid, base branch input (defaulted to the picked repo's primary-checkout branch), New branch input pre-filled from the rendered template with a "· from template" label note, live path preview
2. WHEN the branch input is edited THEN the path preview SHALL update live via the existing sanitization; the template SHALL NOT re-apply
3. WHEN "Create worktree" is confirmed THEN the worktree SHALL be created through the existing `worktrees:create` IPC; failures render inline and keep the dialog open
4. WHEN creation succeeds THEN the dialog SHALL close, the tree SHALL refresh, and the new worktree SHALL be selected — no auto-open (PRD §Start-work flow step 4)
5. WHEN the repo selection changes THEN the base branch SHALL re-default and the path preview SHALL recompute; the branch input value is preserved

**Independent Test**: Pin a real task → Start work → accept defaults → worktree appears on disk at the sibling path with the templated branch, selected in the sidebar.

---

### P1: Task tags on sidebar worktree rows (§1a) ⭐ MVP

**User Story**: As a developer, I want each sidebar worktree to display the ADO task it belongs to, so that I can see at a glance which piece of work each worktree carries (PRD story 5).

**Acceptance Criteria**:

1. WHEN a worktree's branch yields a task ID that matches a pinned task with live details THEN line 2 SHALL show the §1a task tag: type pill, `#id` (mono), title (ellipsized), state dot colored by state
2. WHEN the matched pin has no live details (auth down / unresolved) THEN line 2 SHALL show `#id` with a faint "details unavailable" note instead of pill/title/dot
3. WHEN the branch yields an ID that matches no pinned task THEN line 2 SHALL show the faint italic note `#<id> — not pinned`
4. WHEN the branch yields no ID THEN the existing untagged notes SHALL remain ("primary checkout — no task" / "no task ID in branch")

**Independent Test**: Create a worktree via start-work → its sidebar row shows the tag with correct pill/state; unpin the task → the row degrades to `#<id> — not pinned`.

---

### P1: Task card footer — worktree count + Start work (§1c) ⭐ MVP

**User Story**: As a developer, I want each task card to show how many worktrees carry it and offer the start-work action, so that the tasks pane is the launch point of the loop (handoff §1c footer).

**Acceptance Criteria**:

1. WHEN a task card renders THEN it SHALL show the §1c footer: left — "● N worktree(s)" (accent dot, muted) when N>0, italic "No worktree yet" when N=0; right — the start-work button
2. WHEN the task has no linked worktree THEN the button SHALL be primary style labeled "Start work"; WHEN it has at least one THEN ghost style labeled "New branch" — both open the same dialog
3. WHEN worktree counts are computed THEN they SHALL span all workspaces and repos in the current tree snapshot, matching by `taskIdFromBranch`
4. WHEN a task card has no live details THEN the start-work button SHALL be disabled with a reason (template needs type/title)

**Independent Test**: Fresh pin shows "No worktree yet" + primary "Start work"; after creating one, footer flips to "● 1 worktree" + ghost "New branch" without a restart.

---

### P2: Linked-task card in the detail pane (§1b)

**User Story**: As a developer, I want the selected worktree's detail pane to show its linked task with a link to ADO, so that the task context is one click away (handoff §1b).

**Acceptance Criteria**:

1. WHEN the selected worktree links to a pinned task with details THEN the "LINKED TASK" section SHALL render the §1b card — type pill + state pill + "Open in Azure DevOps" (external-link icon), `#id` (mono, accent) + title — opening the pin's URL externally on click
2. WHEN the linked pin has no live details THEN the card SHALL degrade to `#id` + "Open in Azure DevOps" (URL comes from the persisted pin) without pills/title
3. WHEN the branch yields an ID that matches no pinned task THEN the section SHALL show the dashed-border note `#<id> — not pinned`
4. WHEN the branch yields no ID THEN the existing dashed note SHALL remain ("No task ID found in this branch name — this worktree is untagged.")

**Independent Test**: Select a start-work worktree → linked card renders; click → ADO opens in the browser; select an untagged worktree → dashed note.

---

## Edge Cases

- WHEN the branch contains the ID inside a word (`oauth2`, sha-like `abc1234`) THEN extraction SHALL NOT match (adjacency rule); detached labels `(detached abc1234)` stay untagged
- WHEN multiple pinned tasks share an ID across different org/projects THEN the first pin in config order SHALL win the match (IDs are org-unique in practice; no disambiguation UI in v1)
- WHEN the templated branch collides with an existing branch or target path THEN the existing `createWorktree` inline error SHALL surface in the dialog (user edits the name and retries)
- WHEN the tree snapshot is empty (no repos) THEN the start-work dialog SHALL still open with an empty repo grid and a disabled confirm (same behavior as `NewWorktreeDialog` with no repos)
- WHEN the configured template renders to a branch that sanitizes to an empty path segment THEN the dialog confirm SHALL stay disabled (existing `sanitizeBranch` guard)
- WHEN a pinned task's details change in ADO (e.g. type Bug→Task) THEN tags/cards SHALL follow the next refresh; already-created branch names never change

---

## Requirement Traceability

| Requirement ID | Story                                          | Phase | Status   |
| -------------- | ---------------------------------------------- | ----- | -------- |
| STWK-01        | P1: `branchNameFor` + `taskIdFromBranch`       | Done  | Verified |
| STWK-02        | P1: Start-work dialog (§3)                     | Done  | Verified |
| STWK-03        | P1: Sidebar task tags (§1a)                    | Done  | Verified |
| STWK-04        | P1: Task card footer (§1c)                     | Done  | Verified |
| STWK-05        | P2: Linked-task card in detail pane (§1b)      | Done  | Verified |

**Coverage:** 5 total, 5 verified ✅ — 14 new Vitest cases (template rendering: type mapping, slug/unicode/empty-slug, custom/blank templates, literal passthrough; extraction: templated/hand-typed/multi-number/adjacent-digit/single-digit/no-number; 90 total green) + 12-check CDP smoke (`scripts/smoke-start-work.mjs`) driving the full loop against a live ADO work item (via `SMOKE_TASK_URL`): pin → footer → dialog prefill → live preview edit → create → sidebar tag → linked card → footer flip → unpin "not pinned" degradation → guarded cleanup. Screenshot fidelity pass of the §3 dialog and the §1a/§1b/§1c linked view vs `.dc.html`. The branch-collision edge case surfaced its inline dialog error live during the fidelity pass (stale branch from the prior run).

---

## Testing Notes (from PRD §Testing Decisions)

- `branchNameFor` / `taskIdFromBranch` are the pure-logic core — full Vitest coverage (template rendering: type mapping, slug sanitization, missing fields; ID extraction: templated names, hand-typed names, multiple numbers, none)
- Worktree creation reuses the already-tested `WorktreeManager.create` — no new git-touching code paths
- React surfaces (dialog, tags, footer, linked card) follow precedent: CDP smoke (`scripts/smoke-*.mjs` pattern) + screenshot fidelity pass vs `.dc.html`; no component unit tests (PRD: renderer is a thin view)
- Config gains `ado.branchTemplate` — covered by the existing `ConfigPatch` round-trip pattern

## Success Criteria

- [x] From a pinned task with `az login` active: Start work → accept defaults → worktree exists at `<workspace>/<repo>-<sanitized-branch>` with branch `feature/<id>-<slug>`, selected in the sidebar with its task tag, linked card in the detail pane, and the task card footer reading "● 1 worktree" with a ghost "New branch" button (smoke-verified live, no restart needed for the footer flip)
- [x] All `branchNameFor`/`taskIdFromBranch` cases green in Vitest
- [x] Visual fidelity pass vs `.dc.html`: §3 dialog, §1a tag line, §1b linked card, §1c footer
