# Worktree Name Template Specification

**Milestone:** Post-v1 enhancement (mirrors M4 Per-Workspace Config)
**Sources of truth:** PRD issue #1 §Worktree placement (flat-sibling convention), §Persistence (hybrid model); the shipped `per-workspace-config` feature (`branchTemplate` is the pattern this copies). This spec extends both to the worktree folder name.
**Scope size:** Medium — spec only; design inline, tasks implicit in Execute (escalate to `tasks.md` if Execute's step list exceeds 5).

## Problem Statement

The worktree folder name is hard-coded. `worktreePathFor(repoPath, branch)` in `src/shared/worktrees.ts` always produces `<parent-of-repo>/<repo>-<sanitized-branch>`, so a worktree for branch `feature/42-add-login` in repo `api` is always `api-feature-42-add-login`. Branch names are already configurable (global `ado.branchTemplate` + per-workspace `.app/config.json`), but the folder name that derives from them is not — a developer who wants short, scannable directory names (e.g. just the task id `42`) has no way to get them. This feature gives the worktree folder name the same template treatment the branch name already has.

## Goals

- [ ] The worktree folder name is rendered from a configurable template with `{repo}`, `{branch}`, `{id}` placeholders; the default `{repo}-{branch}` reproduces today's `<repo>-<sanitized-branch>` behavior exactly (zero change for existing configs)
- [ ] A developer can set the global worktree template in the Settings dialog (alongside the branch template), e.g. `{id}` for bare task-id folders
- [ ] A workspace can override the worktree template via its `.app/config.json`, exactly like `branchTemplate` (PRD §Persistence)
- [ ] The live path preview in both create dialogs reflects the effective template before the worktree is created
- [ ] `worktreeNameFor`/`worktreePathFor` rendering is unit-tested (pure, shared by renderer preview and main create)

## Out of Scope

| Feature | Reason |
| --- | --- |
| `{type}` / `{slug}` placeholders in the worktree name | User chose the `{repo}`/`{branch}`/`{id}` set; the linked task isn't available in the taskless dialog, and `{branch}` already carries the slug |
| Renaming/migrating existing worktree folders when the template changes | Template applies to newly created worktrees only; on-disk folders are never moved |
| Editing `.app/config.json` from the Settings UI | Per the per-workspace-config precedent, the workspace file stays hand-authored (checked in, reviewed like code) |
| File watching / live reload of `.app/` | Read-on-use is enough (matches `branchTemplate`) |
| De-duplicating colliding names (e.g. two repos both rendering `42`) | Existing `existsSync` target-collision guard already returns a readable error |

---

## User Stories

### P1: Configurable global worktree name template ⭐ MVP

**User Story**: As a developer, I want to define how worktree folders are named (e.g. just `{id}`), so that my worktree directories are as short and scannable as I want instead of always `<repo>-<branch>`.

**Acceptance Criteria**:

1. WHEN `worktreeNameFor(repoPath, branch, template, id?)` renders THEN it SHALL substitute `{repo}` (the repo folder basename), `{branch}` (the sanitized branch, today's rule), and `{id}` (the branch's extracted task number via `taskIdFromBranch`, or empty when none), then sanitize the whole result with the existing path-segment rules
2. WHEN the template is blank/whitespace THEN rendering SHALL fall back to the default `{repo}-{branch}` (preserving current behavior and matching the blank-branch-template precedent)
3. WHEN the template contains unknown placeholders THEN they SHALL pass through literally (consistent with `branchNameFor`)
4. WHEN `worktreePathFor` computes the target THEN it SHALL place `worktreeNameFor(...)` as a flat sibling: `<parent-of-repo><sep><rendered-name>` (placement convention unchanged; only the final segment is now templated)
5. WHEN the user opens the Settings dialog THEN it SHALL show a worktree-template field (next to the branch-template field) prefilled with the persisted value, hinting the placeholders and that blank uses `{repo}-{branch}`
6. WHEN the user saves THEN the value SHALL persist via `config:patch` (trimmed) and survive a restart; blank stored as the default-yielding empty string (same as `branchTemplate`)

**Independent Test**: Set the global worktree template to `{id}`; open a create dialog from a task whose branch is `feature/42-add-login` → path preview ends in `\42`; create → folder `42` appears as a sibling. Clear the template → preview returns to `<repo>-feature-42-add-login`. Restart keeps the value.

---

### P1: Per-workspace `.app/` worktree-template override ⭐ MVP

**User Story**: As a developer, I want a workspace to carry its own worktree template in its `.app/config.json`, so that repos in that workspace get folder names matching that project's convention without changing my global default.

**Acceptance Criteria**:

1. WHEN `<workspace>/.app/config.json` contains `{ "worktreeTemplate": "..." }` THEN the create/start-work dialog path preview and the created folder SHALL use that template for repos in that workspace, instead of the global one
2. WHEN the selected repo's workspace has no override (missing dir/file/key, malformed JSON, blank, or non-string value) THEN the system SHALL fall back to the global template silently (console-logged for malformed JSON, like `branchTemplate`)
3. WHEN the user switches the repo picker to a repo in a workspace with a different effective worktree template THEN the path preview SHALL re-render from the new effective template (the preview is always derived, never user-edited, so no stickiness rule is needed)
4. WHEN the override file is edited on disk THEN the next dialog open SHALL use the new value without an app restart (read on use, no caching) — same `.app/config.json` is read for both `branchTemplate` and `worktreeTemplate`

**Independent Test**: Two workspaces, one with `.app/config.json` setting `worktreeTemplate: "{id}"` → start work on the same pinned task picking a repo in each workspace → previews differ (`{repo}-{branch}` vs bare id); delete the key → preview returns to global.

---

### P1: Empty-render guard ⭐ MVP

**User Story**: As a developer, I want clear feedback when my template can't produce a valid folder name, so that I'm never silently dumped into an unexpected directory.

**Acceptance Criteria**:

1. WHEN the rendered worktree name sanitizes to an empty string (e.g. template `{id}` on a branch with no task number) THEN the create action SHALL be blocked with a readable message naming the cause, and no worktree SHALL be created
2. WHEN the create is blocked for an empty name THEN the dialog SHALL stay open (the existing inline-error surface) so the user can fix the template or branch
3. WHEN the name renders non-empty after sanitization (e.g. `{repo}-{id}` with no id → `api-` → `api`) THEN creation SHALL proceed normally

**Independent Test**: Global template `{id}`; create a taskless worktree on branch `chore/cleanup` (no extractable id) → create is blocked with a message; change the branch to `fix/13-x` or the template to `{branch}` → create succeeds.

---

## Edge Cases

- WHEN `{id}` is requested but the branch has no standalone multi-digit number THEN `{id}` SHALL render empty (then the empty-render guard or surrounding literals apply per WTNT story 3)
- WHEN two creates in the same workspace render the same folder name THEN the second SHALL fail with the existing target-path-exists error — no overwrite (unchanged guard)
- WHEN `.app/config.json` is malformed JSON THEN both template lookups SHALL fall back to global and log once (existing `workspace-config` behavior)
- WHEN `worktreeTemplate` is present but not a string (number/object) THEN it SHALL be treated as absent
- WHEN the repo path or rendered name contains characters outside `[A-Za-z0-9._-]` THEN sanitization SHALL apply exactly as it does to branches today (no new path-safety rules)
- WHEN existing callers/tests call `worktreePathFor(repoPath, branch)` with no template THEN they SHALL get the default `{repo}-{branch}` result (back-compatible default param)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| WTNT-01 | P1: Global template — `worktreeNameFor`/`worktreePathFor` rendering, default, sanitization, placement | - | Pending |
| WTNT-02 | P1: Global template — Settings dialog field + persistence + blank fallback | - | Pending |
| WTNT-03 | P1: `.app/` override — prefill + repo-switch re-render + graceful fallback | - | Pending |
| WTNT-04 | P1: Empty-render guard — block create + readable message + non-empty proceeds | - | Pending |

**Coverage:** 4 total. Verified by new unit tests on `worktreeNameFor`/`worktreePathFor` (placeholder table, `{id}` extraction, empty-render, default fallback) extending `worktree-manager.test.ts`, plus the `.app/` worktree-template reader tests extending `workspace-config.test.ts`. Dialogs verified via the existing CDP smoke scripts (path-preview assertions in `smoke-create.mjs` / `smoke-config.mjs`). Renderer components stay unit-untested per the PRD testing philosophy.

---

## Decisions (gray areas resolved during Specify — user-approved 2026-06-15)

- **Placeholder set is `{repo}` / `{branch}` / `{id}`.** Default `{repo}-{branch}` preserves today's behavior byte-for-byte. `{id}` is extracted from the rendered branch via the existing `taskIdFromBranch` (so it works in both the task-linked and taskless dialogs without threading task state into `worktreePathFor`). `{type}`/`{slug}` deliberately excluded.
- **Full mirror of the branch-template config model:** a global `worktreeTemplate` in config (Settings dialog) **and** a per-workspace `.app/config.json` `worktreeTemplate` override, read-on-use. Same file, same fallback semantics as `branchTemplate`.
- **Empty render blocks creation** with a readable inline message rather than silently falling back to `{repo}-{branch}` — the user asked to be told, not surprised. (A blank *template* still falls back to default; only a non-blank template that *renders* to nothing blocks.)
- **Naming stays main-authoritative.** As today, the renderer renders the preview, but `createWorktree` in main computes the real path and owns the existence/empty guards. The effective template reaches main through the `worktrees:create` request (new optional field), mirroring how the branch string already flows in.

### Open implementation choices (decide in Execute — not blocking)

- Whether to extend the existing `workspaces:branch-template` channel into a combined `workspaces:templates` (`{ branchTemplate, worktreeTemplate }`) that reads `.app/config.json` once, or add a parallel `workspaces:worktree-template` channel. Combined is fewer disk reads; parallel is a smaller diff. Prefer combined if it stays a clean rename.

---

## Success Criteria

- [ ] From a fresh app: set the worktree template to `{id}`, start work on a task → the new worktree folder is the bare task id, selected in the tree, tools launchable on it (smoke-verified)
- [ ] A workspace with a committed `.app/config.json` `worktreeTemplate` produces folder names in that project's convention while other workspaces keep the global default
- [ ] Existing configs with no `worktreeTemplate` produce identical paths to before this feature (regression-safe default)
- [ ] All `worktreeNameFor`/`worktreePathFor` cases green in Vitest; full gate (typecheck + lint + tests) green
