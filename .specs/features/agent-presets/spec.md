# Agent Presets Specification

> **Builds on:** `agent-config` (registry, New Session dialog), `agent-isolation-level` (the
> Workspace / Repo / Worktree cwd selector), `agent-prompts` (prompt files, `{{name}}`
> placeholders, the variables step, APR-30 launch shape) and `hours-task-assign` (a session's
> task link, HTSK-09).
> **Decisions:** `.specs/features/agent-presets/context.md`.

## Problem Statement

Starting the same kind of agent again means repeating the whole New Session dialog: pick the
agent, switch the level, find the workspace chip, pick the prompt, press Next, type the one value
that actually changes. For an agent used every day — a reviewer that always runs Claude in the
same workspace on the `review-pr` prompt and only needs the PR, or a bug fixer that only needs the
task id — every choice but one is the same each time. This feature saves agent, directory and
prompt as a named **preset**, launches it from the rail's **+ New session** button, and asks only
for the prompt's placeholders. A preset with nothing to ask spawns on one click.

## Goals

- [ ] A preset whose prompt has one placeholder spawns in two clicks plus typing that value: open the menu, pick the preset, type, press Enter.
- [ ] A preset with nothing to ask spawns on a single pick from the menu.
- [ ] Presets live in `~/.playground/presets.json`, readable and editable by hand, and the app picks up hand edits without a restart.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Saving a task, or fixed placeholder values, in a preset | Owner call: a preset holds agent, cwd and prompt only; every placeholder is asked at launch. |
| Presets without a cwd (ask the directory at launch) | Owner call: a preset always fixes the directory. |
| Saving an **Ad-hoc command** as a preset | A preset names a registry agent; ad-hoc is a one-off escape hatch (AGCF-03). |
| Editing a preset's agent, cwd or prompt in a Settings form | Owner call: change them by saving over the preset from the New Session dialog, or by editing the file. |
| Launching presets from task cards, the worktree detail, the board or a keyboard shortcut | Owner call: the rail's **+ New session** menu is the one entry point. |
| Creating a worktree as part of a preset launch | The cwd is a fixed folder that already exists. |
| Fetching a task's title from ADO for the task link | The link uses the pinned task's cached title or none, like the dialog's task picker. |
| Repo-scoped presets (`<repo>/.playground/presets.json`) | Global file only, like prompts and workflows (APR, AD-013 trust trade-off). |
| Watching `presets.json` for live changes | The file is read each time the menu or Settings opens; that already picks up hand edits. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What a preset holds | `name`, `agent` (registry agent name), `cwd` (absolute path), `prompt` (prompt file name, or absent for None) | Owner call. | y |
| Where it is defined | **Save as preset** in the New Session dialog; managed in a Settings section | Owner call. | y |
| Storage | One file `~/.playground/presets.json`: a JSON array of preset objects; array order is menu order | Owner call: hand-editable next to prompts and workflows; one array keeps order. | y |
| Launch surface | **+ New session** becomes a split button: the main part opens the dialog as today, the arrow opens the preset menu | Owner call. | y |
| Preset with nothing to ask | Spawns immediately on pick. "Nothing to ask" includes a prompt whose every placeholder is already filled from context (e.g. `{{branch}}` from the cwd); the Run preset dialog opens only when some placeholder starts empty. Unlike the New Session dialog, which always shows the variables step | Owner call (2026-10-14): speed over confirmation. | y |
| Task link from `{{taskId}}` | When the prompt has `{{taskId}}` and its value is a positive integer, the session is linked to that task | Owner call. | y |
| Broken preset | Listed with a warning; picking it opens the full dialog pre-filled with what is still valid | Owner call. | y |
| Managing presets | Settings › Presets: rename, delete, move up/down; changing agent/cwd/prompt = save over it from the dialog, or edit the file | Owner call. | y |
| Name rules | Trimmed, 1–40 characters, unique case-insensitively; a line break is not allowed | A menu label; case-insensitive uniqueness avoids two look-alike entries. | y (approved with the spec, 2026-10-14) |
| Save over an existing name | Asks "Replace preset "<name>"?" and replaces it in place, keeping its position | Saving over is how a preset is edited; replacing in place keeps the menu stable. | y (approved with the spec, 2026-10-14) |
| When the file is read | Each time the preset menu opens, Settings › Presets opens, or Save as preset runs | Mirrors prompts (APR-01); a hand edit shows up with no reload. | y (approved with the spec, 2026-10-14) |
| Invalid file | Unparseable JSON or a non-array: the menu shows one disabled row `presets.json: <reason>`; Settings shows the reason; the app refuses to write the file until it is fixed by hand | Never overwrite a file the developer is editing and got wrong. | y (approved with the spec, 2026-10-14) |
| Invalid entry | An entry that is not an object, or lacks a string `name`, `agent` or `cwd`, or has a non-string `prompt`, is listed as broken with its reason; the others are unaffected | Same posture as a broken prompt file (APR-06). | y (approved with the spec, 2026-10-14) |
| Duplicate names in a hand-edited file | The first entry with a name wins; later ones are listed as broken `duplicate name` | Deterministic, and nothing silently disappears. | y (approved with the spec, 2026-10-14) |
| Write format | The app writes the array pretty-printed with 2-space indentation, UTF-8, `\n` line ends, and keeps any field of an entry it does not know | Readable for hand editing; unknown fields survive a rename. | y (approved with the spec, 2026-10-14) |
| Missing file | No presets; the first save creates `~/.playground` and the file | Mirrors APR-05 / APR-08. | y (approved with the spec, 2026-10-14) |
| Launch form | A small **Run preset** dialog: header with the preset name, one field per placeholder (context placeholders pre-filled as APR-19..22), the Will run card, **Cancel**, **More options** and **Spawn**; Enter spawns when Spawn is enabled | Reuses the variables step's rules so behaviour matches the full dialog. | y (approved with the spec, 2026-10-14) |
| Context placeholders at launch | `branch` and `worktree` are pre-filled from the preset's cwd as the full dialog does for the same cwd; `taskId`/`taskTitle` come from the cwd's branch task when "From branch" would derive one | Same values the full dialog would show for that cwd. | y (approved with the spec, 2026-10-14) |
| Task title of a `{{taskId}}` link | The pinned task's cached title when that id is pinned, else no title (`#<id>` only) | Matches the dialog's task picker; no ADO call. | y (approved with the spec, 2026-10-14) |
| Non-numeric `{{taskId}}` | The value goes into the prompt; no task link is set | The prompt decides what it accepts; a link needs an id. | y (approved with the spec, 2026-10-14) |
| Hand-edited `cwd` matching | A preset's cwd is compared to the tree's paths case-insensitively with `\` = `/` and one trailing separator ignored (AD-050's rule) | One path-equality rule across the app. | y (approved with the spec, 2026-10-14) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Store presets in `~/.playground/presets.json` ⭐ MVP

**User Story**: As a developer, I want my presets in one file I can read and edit, so that I can
tweak them by hand and keep them with my other `~/.playground` files.

**Why P1**: Every other story reads or writes this store.

**Acceptance Criteria**:

1. WHEN presets are listed THEN the system SHALL read `~/.playground/presets.json` and return its entries in array order. <!-- PRST-01 -->
2. IF `~/.playground/presets.json` does not exist THEN the system SHALL return no presets and report no error. <!-- PRST-02 -->
3. IF the file is not valid JSON or its top level is not an array THEN the listing SHALL report the file as invalid with the reason (`invalid JSON: <parser message>` or `not an array`) and return no presets. <!-- PRST-03 -->
4. IF an entry is not an object, lacks a non-empty string `name`, `agent` or `cwd`, or has a `prompt` that is present and not a string THEN that entry SHALL be listed as broken with the reason `invalid entry: <field>` and the other entries SHALL still be listed. <!-- PRST-04 -->
5. IF two entries have names equal case-insensitively after trimming THEN the first SHALL be listed normally and each later one SHALL be listed as broken with the reason `duplicate name`. <!-- PRST-05 -->
6. WHEN the app writes the file THEN it SHALL write the whole array as UTF-8 JSON indented with 2 spaces and `\n` line ends, creating `~/.playground` if it is missing. <!-- PRST-06 -->
7. WHEN the app rewrites an entry (save over, rename, move) THEN it SHALL keep every field of that entry it does not manage unchanged. <!-- PRST-07 -->
8. WHILE the file is invalid (PRST-03) the system SHALL refuse every write and report `presets.json is invalid; fix it by hand first`. <!-- PRST-08 -->
9. WHEN the app writes the file THEN it SHALL first read the file again and apply its change to what it read, so that a hand edit made since the last read is kept. <!-- PRST-09 -->

**Independent Test**: Unit tests over the store with a temp folder: missing file, bad JSON, an
array with a valid entry, a broken entry and a duplicate; a rename keeps an unknown `note` field.

---

### P1: Save as preset from the New Session dialog ⭐ MVP

**User Story**: As a developer, I want to save the agent, directory and prompt I just chose as a
named preset, so that I never pick them again.

**Why P1**: The only way to create a preset in the app.

**Acceptance Criteria**:

1. WHILE a registry agent and a cwd are selected on the dialog's first step the footer SHALL show a **Save as preset** button. <!-- PRST-10 -->
2. WHILE **Ad-hoc command** is selected or no cwd is selected the **Save as preset** button SHALL be hidden. <!-- PRST-11 -->
3. WHEN the developer activates **Save as preset** THEN the dialog SHALL show an inline name field with **Save** and **Cancel**, focused, and keep every other choice unchanged. <!-- PRST-12 -->
4. WHEN the developer confirms a valid new name THEN the system SHALL append `{ name, agent, cwd, prompt }` to the file — `prompt` omitted when the prompt is None — and the dialog SHALL show `Saved preset "<name>"` and stay open. <!-- PRST-13 -->
5. The saved preset SHALL NOT contain the task, the typed placeholder values, or the isolation level. <!-- PRST-14 -->
6. IF the name is empty after trimming, longer than 40 characters, or contains a line break THEN **Save** SHALL be disabled and the field SHALL show `1–40 characters, one line`. <!-- PRST-15 -->
7. IF the name equals an existing preset's name case-insensitively THEN the system SHALL ask `Replace preset "<existing name>"?` and, on confirm, replace that entry's `agent`, `cwd`, `prompt` and `name` in place, keeping its position (PRST-07). <!-- PRST-16 -->
8. IF the write fails (PRST-08 or an I/O error) THEN the dialog SHALL show the reason and keep the name field open with the typed name. <!-- PRST-17 -->

**Independent Test**: Pick Claude, a workspace chip and `review-pr`, Save as preset "Reviewer":
`presets.json` holds one entry with those three values and no task.

---

### P1: Launch a preset from the rail ⭐ MVP

**User Story**: As a developer, I want to pick a preset from the **+ New session** button and only
type what the prompt needs, so that a routine agent starts in seconds.

**Why P1**: The point of the feature.

**Acceptance Criteria**:

1. The rail's **+ New session** button SHALL be a split button: its main part SHALL open the New Session dialog exactly as before, and its arrow part SHALL open the preset menu. <!-- PRST-18 -->
2. WHEN the preset menu opens THEN it SHALL list every preset by name in file order, then a separator and **Manage presets…**. <!-- PRST-19 -->
3. IF there are no presets THEN the menu SHALL show the disabled text `No presets yet — use Save as preset in New session` above **Manage presets…**. <!-- PRST-20 -->
4. WHEN the developer picks a valid preset THEN the system SHALL compute each placeholder's starting value as the New Session dialog would for the preset's cwd with the Task field on From branch (APR-19..22): context placeholders from that cwd, every other placeholder empty. <!-- PRST-23 -->
5. WHEN the developer picks a valid preset whose prompt has no placeholders, that has no prompt, or whose every placeholder has a non-empty starting value (PRST-23) and whose resolved prompt is at most 8000 characters THEN the system SHALL spawn the session at once with the preset's agent, cwd and resolved prompt, with no dialog. <!-- PRST-21 -->
6. WHEN the developer picks a valid preset with at least one placeholder whose starting value is empty, or whose resolved prompt is longer than 8000 characters, THEN the system SHALL open the **Run preset** dialog with one editable single-line field per placeholder in parse order (APR-12), pre-filled with the starting values, the first empty field focused. <!-- PRST-22 -->
7. WHILE the Run preset dialog is shown it SHALL apply APR-23, APR-25, APR-26 and APR-37: Spawn disabled while a field is empty, a live Will run card, the 8000-character limit, and trimmed values. <!-- PRST-24 -->
8. WHEN the developer presses Enter in a field while **Spawn** is enabled THEN the system SHALL spawn the session. <!-- PRST-25 -->
9. WHEN the developer activates **More options** THEN the system SHALL close the Run preset dialog and open the New Session dialog with the preset's agent, the level of its cwd, its cwd and its prompt selected. <!-- PRST-26 -->
10. WHEN a session is spawned from a preset THEN it SHALL be launched exactly as a New Session spawn with the same agent, cwd and resolved prompt (APR-30, APR-31, APR-36). <!-- PRST-27 -->
11. WHEN the session spawns THEN the rail SHALL select it, as a New Session spawn does. <!-- PRST-28 -->
12. IF the spawned prompt has a `{{taskId}}` placeholder whose value is a positive integer with no leading `+` or `0` THEN the session SHALL be linked to that task, with the pinned task's cached title when that id is pinned and no title otherwise. <!-- PRST-29 -->
13. IF the prompt has no `{{taskId}}` placeholder or its value is not such an integer THEN the session SHALL carry no task link (From branch). <!-- PRST-30 -->

**Independent Test**: Preset "Bug fixer" (Claude, a workspace, `fix-bug` with `{{taskId}}`):
pick it, type `12345`, press Enter; the session runs `claude -- <prompt with 12345>` in that
workspace, and its card shows `#12345`.

---

### P1: Broken presets ⭐ MVP

**User Story**: As a developer, I want a preset whose folder, agent or prompt went away to still
get me most of the way, so that I fix it instead of starting over.

**Why P1**: Workspaces move and prompt files get renamed; a silent failure would make presets
untrustworthy.

**Acceptance Criteria**:

1. WHEN the preset menu opens THEN a preset SHALL be marked broken with its first failing reason in this order: `agent not found` (no registry agent with that name), `folder not found` (the cwd does not exist as a directory), `prompt not found` (no prompt file with that name), `prompt broken` (the prompt file is listed with an error, APR-06). <!-- PRST-31 -->
2. A broken preset SHALL show a warning mark and its reason in the menu. <!-- PRST-32 -->
3. WHEN the developer picks a preset broken by the preset's own fields (PRST-31) THEN the system SHALL open the New Session dialog pre-filled with each of agent, cwd and prompt that is still valid, and the default for each that is not. <!-- PRST-33 -->
4. A preset broken by its entry (PRST-04, PRST-05) SHALL be listed with its reason and SHALL NOT be pickable. <!-- PRST-34 -->
5. IF the file is invalid (PRST-03) THEN the menu SHALL show one disabled row `presets.json: <reason>` above **Manage presets…**. <!-- PRST-35 -->

**Independent Test**: Rename the prompt file a preset uses: the menu shows `prompt not found`;
picking it opens New Session with the preset's agent and cwd selected and the prompt on None.

---

### P1: Manage presets in Settings ⭐ MVP

**User Story**: As a developer, I want to rename, reorder and delete presets in the app, so that
the menu stays the way I use it.

**Why P1**: Without it the only cleanup is hand-editing JSON.

**Acceptance Criteria**:

1. The Settings dialog SHALL have a **Presets** tab listing every preset in file order with its name, agent, cwd and prompt (or `No prompt`), and broken ones with their reason. <!-- PRST-36 -->
2. WHEN the developer activates **Manage presets…** in the preset menu THEN the system SHALL open Settings on the Presets tab. <!-- PRST-37 -->
3. WHEN the developer renames a preset to a valid name (PRST-15) not used by another preset THEN the system SHALL change that entry's `name` only. <!-- PRST-38 -->
4. IF the new name is used by another preset (case-insensitive) THEN the rename SHALL be refused with `A preset named "<name>" already exists`. <!-- PRST-39 -->
5. WHEN the developer moves a preset up or down THEN the system SHALL swap it with its neighbour in the file; the first row's **Move up** and the last row's **Move down** SHALL be disabled. <!-- PRST-40 -->
6. WHEN the developer deletes a preset and confirms `Delete preset "<name>"?` THEN the system SHALL remove that entry only. <!-- PRST-41 -->
7. The tab SHALL show an **Open presets file** action that creates `~/.playground/presets.json` as `[]` if it is missing and opens it with the OS default application. <!-- PRST-42 -->
8. IF the file is invalid (PRST-03) THEN the tab SHALL show the reason and **Open presets file**, and no rename, move or delete action. <!-- PRST-43 -->
9. Settings SHALL apply each rename, move and delete to the file at once, with no separate save step. <!-- PRST-44 -->

**Independent Test**: With three presets, move the last one up, rename it, delete the first:
`presets.json` reflects each step and the menu shows the new order.

---

## Edge Cases

- IF a preset's cwd exists but is not a folder the tree knows THEN the launch SHALL still use it, as a browsed folder is used today (AGSN-09); only a missing directory makes it broken (PRST-31).
- IF the prompt file changes between opening the Run preset dialog and pressing Spawn THEN the spawn SHALL use the text Will run showed (APR-35).
- WHEN a registry agent is renamed in Settings THEN presets naming the old name SHALL show `agent not found` (PRST-31); presets are not rewritten.
- IF the spawn itself fails THEN the system SHALL report it exactly as a New Session spawn failure does.

---

## Implicit-requirement dimensions

| Dimension | Landing |
| --------- | ------- |
| Input validation & bounds | PRST-04, PRST-05 (entries), PRST-15 (names), PRST-24 (placeholder fields and the 8000-character limit via APR-26). |
| Failure / partial-failure states | PRST-02, PRST-03, PRST-08, PRST-17, PRST-31..35; a broken entry never hides the others. |
| Idempotency / retry / duplicate | PRST-05, PRST-16, PRST-39 (no two presets with one name). |
| Auth boundaries & rate limits | N/A because the feature adds no endpoint or credential; the file is in the user's own profile. |
| Concurrency / ordering | PRST-09 (re-read before write keeps hand edits); PRST-01/PRST-40 (array order is menu order). |
| Data lifecycle / expiry | PRST-41 (delete); presets never expire; nothing is stored in `config.json`. |
| Observability | N/A because the menu's broken reasons and Settings' file reason are the developer-facing record; no logging added. |
| External-dependency failure | N/A because a preset launch spawns through the existing path; its failure handling is unchanged (Edge Cases). |
| State-transition integrity | PRST-26 (Run preset → full dialog), PRST-33 (broken → full dialog). |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PRST-01 | P1: Store | Execute | Implementing |
| PRST-02 | P1: Store | Execute | Implementing |
| PRST-03 | P1: Store | Execute | Implementing |
| PRST-04 | P1: Store | Execute | Implementing |
| PRST-05 | P1: Store | Execute | Implementing |
| PRST-06 | P1: Store | Execute | Implementing |
| PRST-07 | P1: Store | Execute | Implementing |
| PRST-08 | P1: Store | Execute | Implementing |
| PRST-09 | P1: Store | Execute | Implementing |
| PRST-10 | P1: Save | Execute | Implementing |
| PRST-11 | P1: Save | Execute | Implementing |
| PRST-12 | P1: Save | Execute | Implementing |
| PRST-13 | P1: Save | Execute | Implementing |
| PRST-14 | P1: Save | Execute | Implementing |
| PRST-15 | P1: Save | Execute | Implementing |
| PRST-16 | P1: Save | Execute | Implementing |
| PRST-17 | P1: Save | Execute | Implementing |
| PRST-18 | P1: Launch | Design | In Design |
| PRST-19 | P1: Launch | Execute | Implementing |
| PRST-20 | P1: Launch | Execute | Implementing |
| PRST-21 | P1: Launch | Execute | Implementing |
| PRST-22 | P1: Launch | Execute | Implementing |
| PRST-23 | P1: Launch | Execute | Implementing |
| PRST-24 | P1: Launch | Execute | Implementing |
| PRST-25 | P1: Launch | Execute | Implementing |
| PRST-26 | P1: Launch | Execute | Implementing |
| PRST-27 | P1: Launch | Design | In Design |
| PRST-28 | P1: Launch | Design | In Design |
| PRST-29 | P1: Launch | Execute | Implementing |
| PRST-30 | P1: Launch | Execute | Implementing |
| PRST-31 | P1: Broken | Execute | Implementing |
| PRST-32 | P1: Broken | Execute | Implementing |
| PRST-33 | P1: Broken | Execute | Implementing |
| PRST-34 | P1: Broken | Execute | Implementing |
| PRST-35 | P1: Broken | Execute | Implementing |
| PRST-36 | P1: Manage | Design | In Design |
| PRST-37 | P1: Manage | Design | In Design |
| PRST-38 | P1: Manage | Execute | Implementing |
| PRST-39 | P1: Manage | Execute | Implementing |
| PRST-40 | P1: Manage | Execute | Implementing |
| PRST-41 | P1: Manage | Execute | Implementing |
| PRST-42 | P1: Manage | Execute | Implementing |
| PRST-43 | P1: Manage | Design | In Design |
| PRST-44 | P1: Manage | Design | In Design |

**Coverage:** 44 total, 0 mapped to tasks, 44 unmapped ⚠️ (Tasks not written yet).

---

## Success Criteria

- [ ] The bug-fixer preset spawns a linked session with two clicks, the task id and Enter — no level, chip or prompt choice.
- [ ] A preset whose prompt has no placeholder left empty after context pre-fill spawns on one pick from the menu.
- [ ] A hand edit to `presets.json` shows in the menu the next time it opens, and no app write ever discards it.
