# Per-Workspace Config Specification

**Milestone:** M4 — Board View & Configurability (final feature)
**Sources of truth:** PRD issue #1 — story 20, §Persistence — hybrid model, §Data model `Settings`, suggested slice 7; design handoff README §Branch template (no settings-UI section exists in the handoff — see Decisions).

## Problem Statement

The three `Settings` values from the PRD (`defaultOrg`, `defaultProject`, `branchTemplate`) exist in global config but are only hand-editable in `%APPDATA%/playground/config.json` — pinning a bare work-item ID fails with a "set ado.defaultOrg…in config.json" error until the user edits a JSON file by hand. And the PRD's per-workspace half of the hybrid persistence model (`.app/` directory carrying a branch-template override) doesn't exist at all, so every workspace is forced onto the one global template.

## Goals

- [ ] Default org/project and the global branch template are editable inside the app (closes the M3 hand-edit gap noted in `src/shared/config.ts`)
- [ ] A workspace can override the branch template via a human-readable `.app/` file, optionally checked into git (PRD §Persistence)

## Out of Scope

| Feature                                            | Reason                                            |
| -------------------------------------------------- | ------------------------------------------------- |
| Per-workspace IDE/terminal overrides               | PRD explicitly v2                                 |
| Editing `.app/config.json` from the settings UI    | Roadmap scopes the UI to global settings; the workspace file is hand-authored (it's meant to be checked in and reviewed like code) |
| Other per-workspace keys (org/project per workspace) | PRD only names the branch template as overridable |
| File watching / live reload of `.app/`             | Read-on-use is enough (see Decisions)             |

---

## User Stories

### P1: Edit global settings in-app ⭐ MVP

**User Story**: As a developer, I want to edit my default ADO org/project and the global branch template in a settings dialog, so that I never hand-edit `config.json` (PRD story 20).

**Acceptance Criteria**:

1. WHEN the user clicks the settings (gear) button in the top bar THEN the system SHALL open a settings dialog (same chassis as the existing dialogs) with three fields: default organization, default project, branch template
2. WHEN the dialog opens THEN the fields SHALL show the current persisted values, with the branch template field hinting the default `{type}/{id}-{slug}` and the available placeholders
3. WHEN the user saves THEN the system SHALL persist via `config:patch` (trimming whitespace; empty org/project stored as `null`) and the values SHALL survive a restart
4. WHEN org/project are saved THEN pinning a bare work-item ID SHALL resolve against them without any hand edit
5. WHEN the template field is saved blank THEN branch prefills SHALL fall back to the default template (existing `branchNameFor` behavior)
6. WHEN the user cancels or presses Esc THEN the system SHALL discard edits

**Independent Test**: Fresh config → pin a bare ID (fails) → open settings, set org/project → pin the same bare ID succeeds; restart keeps the values.

---

### P1: `.app/` branch-template override ⭐ MVP

**User Story**: As a developer, I want a workspace to carry its own branch template in a `.app/` directory, so that repos in that workspace get branch names matching that project's conventions (PRD §Persistence, slice 7).

**Acceptance Criteria**:

1. WHEN `<workspace>/.app/config.json` contains `{ "branchTemplate": "..." }` THEN the start-work dialog SHALL prefill the branch using that template for repos in that workspace, instead of the global one
2. WHEN the selected repo's workspace has no override (missing dir, file, or key; malformed JSON; blank value) THEN the system SHALL fall back to the global template silently
3. WHEN the user switches the repo picker to a repo in a workspace with a different effective template AND has not edited the branch field THEN the prefill SHALL re-render from the new effective template; once the user edits the branch, the system SHALL never re-apply any template (PRD story 11)
4. WHEN the override file is edited on disk THEN the next start-work dialog open SHALL use the new value without an app restart (read on use, no caching)

**Independent Test**: Two workspaces, one with `.app/config.json` setting `task/{id}-{slug}` → start work on the same pinned task picking a repo in each workspace → prefills differ accordingly; delete the file → prefill returns to global.

---

## Edge Cases

- WHEN `.app/config.json` is malformed JSON THEN the system SHALL log to console and use the global template — no error UI (the file is hand-authored; degradation matches the chip-strip precedent)
- WHEN the override value is not a string (e.g. number, object) THEN the system SHALL treat it as absent
- WHEN a custom template contains unknown placeholders THEN they SHALL pass through literally (existing `branchNameFor` contract)
- WHEN the settings dialog saves org without project (or vice versa) THEN bare-ID pinning SHALL keep failing with the existing guidance message (both are required to resolve)

---

## Requirement Traceability

| Requirement ID | Story                          | Phase | Status   |
| -------------- | ------------------------------ | ----- | -------- |
| PWCF-01        | P1: Edit global settings (org/project → bare-ID pin) | -     | Verified |
| PWCF-02        | P1: Edit global settings (template edit + blank fallback + persistence) | -     | Verified |
| PWCF-03        | P1: `.app/` override (prefill + repo-switch re-render rule) | -     | Verified |
| PWCF-04        | P1: `.app/` override (graceful fallback: missing/malformed/blank) | -     | Verified |

**Coverage:** 4 total, tasks implicit (Medium scope — no tasks.md). Verified by 9 new unit tests (`workspace-config.test.ts`) + 11/11 CDP smoke (`scripts/smoke-config.mjs`) vs live ADO.

---

## Decisions

- ⚠️ **Settings entry point is invented, not from the handoff.** The `.dc.html` prototype has no settings surface; proposal: a gear icon button in the top bar (next to the theme toggle), opening a modal on the existing dialog chassis. Needs user approval.
- ⚠️ **Repo-switch re-render rule.** The template becomes repo-dependent, but the current dialog renders it once at open. Proposal: re-render the prefill on repo switch only while the branch field is untouched; any manual edit makes the value sticky forever (preserves PRD story 11). Needs user approval.
- **Override is read at dialog open, not cached or watched** — the file is tiny and hand-edited rarely; freshness beats plumbing.
- **Settings UI edits global config only** — the `.app/` file stays hand-authored per the roadmap split ("Settings for default org/project + global branch template").
- **New pure logic** (override file parsing/fallback rules) gets unit tests with real temp dirs per the PRD testing philosophy; the dialog itself stays untested like the other renderer components.

---

## Success Criteria

- [ ] Bare-ID pinning is configurable end-to-end inside the app — no hand-edited JSON anywhere in the daily loop
- [ ] A workspace checked out fresh with a committed `.app/config.json` immediately produces branch names in that project's convention
