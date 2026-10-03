# Agent Prompts Specification

> **Builds on:** AM3 `agent-config` (registry, New Session dialog) and the workflows folder
> convention (`~/.playground/workflows`, `src/main/index.ts:747`: discovered on demand, a broken
> entry is listed with its error and never blocks the others). Replaces the reserved-but-unused
> `promptTemplate?` idea on `AgentDef` from `design/handoff/DESIGN_HANDOFF_AGENTS.md` §"Dialog:
> Settings": prompts live in files, not in the registry.
> **Decisions:** `.specs/features/agent-prompts/context.md`.

## Problem Statement

A session always starts as a blank agent: the developer opens it, then types the same kind of
instruction by hand ("review this branch", "implement task #123 with /tlc-spec-driven"). Claude
Code accepts an initial prompt as its positional argument (`claude "<prompt>"`, verified on
2.1.287: `Usage: claude [options] [command] [prompt]`) and starts working on it at once in the
normal interactive TUI. The registry cannot carry one — the Settings editor splits `args` on
whitespace (`SettingsDialog.tsx:139`) — and a prompt worth reusing is multi-line text better
edited in an editor than in a form. This feature reads prompt files from `~/.playground/prompts`,
lets the developer pick one when spawning any agent, fill its `{{name}}` placeholders in a short
second step, and starts the session already working on the resolved prompt.

## Goals

- [ ] Every `*.md` file in `~/.playground/prompts` is offered as a prompt in the New Session dialog, for any registry agent.
- [ ] Every `{{name}}` placeholder becomes one field in a **second step**; the four context placeholders arrive pre-filled.
- [ ] The resolved prompt — multi-line included — reaches the agent **verbatim** as its initial prompt, whatever the default shell.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Headless (`claude -p`) prompts that run to completion and exit | Owner call: interactive PTY only. Headless already exists as a workflow step (`ctx.agent`, WF3). |
| Frontmatter (agent binding, extra `args`, description) | Owner call: a prompt is the file body only, independent of the agent. |
| Permission-mode control | Owner call: stays in the agent's `args` (e.g. `--permission-mode acceptEdits`). |
| Repo-scoped prompts (`<repo>/.playground/prompts`) | Owner call: global folder only, like workflows. Also avoids repo content steering an agent (the AD-013 trust trade-off). |
| An in-app prompt editor | Prompts are files edited in the developer's editor; the app opens the folder (APR-08). |
| Re-sending the prompt on **Respawn** or **Duplicate** | Owner call: the prompt applies to the original spawn only. |
| Persisting the resolved prompt or the chosen prompt name on the session | Follows from the line above — nothing reads it. |
| Explicitly declared variables (label, default, optional flag) | Owner call: variables are inferred from placeholders. |
| Optional placeholders / empty substitution | Owner call: every placeholder is required. |
| Prompts on ad-hoc commands | The ad-hoc command is free text the developer types whole. |
| Exact delivery to agents launched through a `.cmd`/`.bat` shim | Measured (design.md): cmd batch rules truncate at a newline and strip `"`; no hosting can fix it. APR-24 covers agents whose command resolves to an executable, as `claude.exe` does. |
| Agents whose CLI takes no positional prompt after `--` | The prompt always follows `--` (APR-30); v1 does not support flag-valued prompts. |
| Subfolders in `~/.playground/prompts` | Flat folder, like one workflow per folder level; nesting adds naming rules nobody asked for. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| File format | A prompt is a file `~/.playground/prompts/<name>.md`; its whole body is the template | Owner call (no frontmatter). `.md` gives editor highlighting. | y |
| Prompt name | The file name without `.md`, shown as-is | Mirrors a workflow's folder name as its id. | n — agent's default |
| What is listed | Regular files whose name ends in `.md` (case-insensitive), directly in the folder; everything else is ignored | Flat and predictable. | n — agent's default |
| List order | Ascending by name, case-insensitive | Stable and scannable. | n — agent's default |
| When the folder is read | Each time the New Session dialog opens | Mirrors workflows' on-demand discovery; editing a file and reopening the dialog picks it up with no reload button. | n — agent's default |
| Text normalisation | Decoded as UTF-8; a leading BOM is removed; `\r\n` becomes `\n`; leading and trailing whitespace is trimmed | Editors on Windows add BOM/CRLF; the agent should see the text the developer wrote. | n — agent's default |
| Size bound | A file over 16 KiB is listed as broken; a resolved prompt over 8000 characters blocks Spawn | Windows caps a process command line at 32,767 characters, and pwsh's call to the agent must fit the prompt plus command and `args`; 8000 leaves ample room. | n — agent's default |
| Placeholder syntax | `{{name}}` where `name` matches `[A-Za-z][A-Za-z0-9_]*`; any other `{{…}}` text is literal | Cannot collide with the single-brace branch/worktree templates. | y |
| Context placeholders | `taskId`, `taskTitle`, `branch`, `worktree` (case-sensitive) | The four facts the dialog knows at spawn. | y |
| Prompt position on the command line | `command args -- <prompt>`: the prompt is the last argument, after `--` (and after the injected `--settings`) | Measured: Claude rejects a prompt that starts with `-` (`unknown option '- revise isto'`), and Markdown lists start with `-`; `--` ends option parsing and earlier flags still apply. | n — revised after Design probes |
| Value substitution | Single pass, literal; a value containing `{{x}}` is not expanded again | Predictable result, exact preview. | n — agent's default |
| Same placeholder used twice | One field; every occurrence gets its value | No repeated questions. | n — agent's default |
| Field order | Order of first appearance in the template | Reads like the text it fills. | n — agent's default |
| Value whitespace | A value is trimmed; empty after trimming counts as empty; a value may not contain a line break (single-line fields) | Whitespace is not an answer; multi-line structure belongs in the file. | n — agent's default |
| Delivery mechanism for multi-line prompts | A launch with a prompt is hosted in `pwsh` whatever the default shell, and the prompt travels in an env var (design.md, Approach A) | Measured: cmd cannot carry a newline or `"` in one argument; pwsh delivers the text byte-identical. | n — decided in Design |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Discover prompt files ⭐ MVP

**User Story**: As a developer, I want every Markdown file I drop in `~/.playground/prompts` to show
up as a prompt, so that I manage prompts in my editor like workflows.

**Why P1**: Nothing can be picked without discovery.

**Acceptance Criteria**:

1. WHEN the New Session dialog opens THEN the system SHALL list one prompt per regular file directly in `~/.playground/prompts` whose name ends in `.md` (case-insensitive), named by the file name without that extension. <!-- APR-01 -->
2. The list SHALL ignore subfolders and files with any other extension. <!-- APR-02 -->
3. The list SHALL be ordered ascending by name, case-insensitive. <!-- APR-03 -->
4. WHEN a prompt file is read THEN its template SHALL be the UTF-8 text with a leading BOM removed, every `\r\n` replaced by `\n`, and leading/trailing whitespace trimmed. <!-- APR-04 -->
5. IF the folder does not exist THEN the system SHALL list no prompts and report no error. <!-- APR-05 -->
6. IF a prompt file cannot be read, is empty after normalisation, or is larger than 16 KiB THEN the system SHALL list it as broken with the reason (`unreadable: <error message>`, `empty`, `larger than 16 KiB`) and the remaining prompts SHALL still be listed. <!-- APR-06 -->
7. A broken prompt SHALL NOT be selectable. <!-- APR-07 -->

**Independent Test**: Put `review.md`, `Implement.MD`, `notes.txt`, an empty `blank.md` and a
subfolder in the folder: the dialog lists `Implement`, `review` and a broken `blank (empty)`.

---

### P1: Pick a prompt in the New Session dialog ⭐ MVP

**User Story**: As a developer, I want to optionally choose a prompt after choosing the agent and
directory, so that any agent can start on any prompt.

**Why P1**: The entry point of the feature.

**Acceptance Criteria**:

1. WHILE a registry agent is selected the New Session dialog SHALL show a **Prompt** field whose options are **None** followed by the discovered prompts, with **None** selected when the dialog opens. <!-- APR-09 -->
2. WHILE **Ad-hoc command** is selected the dialog SHALL hide the Prompt field and spawn with no prompt. <!-- APR-10 -->
3. WHILE **None** is selected the dialog SHALL behave exactly as before this feature. <!-- APR-11 -->
4. WHEN the developer activates **Open prompts folder** in the Prompt field THEN the system SHALL create `~/.playground/prompts` if it is missing and open it in the OS file manager. <!-- APR-08 -->

**Independent Test**: With no folder, the Prompt field shows only None; Open prompts folder creates
and reveals it.

---

### P1: Placeholder parsing and resolution ⭐ MVP

**User Story**: As a developer, I want each `{{name}}` in a prompt to become a value I supply, so
that one prompt serves many tasks.

**Why P1**: The form and the spawned prompt both depend on it.

**Acceptance Criteria**:

1. WHEN a template is parsed THEN the system SHALL return the distinct names of every `{{name}}` with `name` matching `[A-Za-z][A-Za-z0-9_]*`, in order of first appearance. <!-- APR-12 -->
2. The parser SHALL treat any `{{…}}` whose content does not match the name pattern (e.g. `{{ x }}`, `{{1a}}`, `{{}}`) as literal text and return no name for it. <!-- APR-13 -->
3. WHEN a template is resolved with a value for every name THEN the system SHALL replace every occurrence of each `{{name}}` with its value and leave all other text, line breaks included, unchanged. <!-- APR-14 -->
4. WHEN a value itself contains `{{name}}` text THEN resolution SHALL insert it literally, without expanding it. <!-- APR-15 -->
5. Placeholder names SHALL be case-sensitive: `{{Branch}}` and `{{branch}}` are two names. <!-- APR-16 -->

**Independent Test**: Unit tests over the pure parse/resolve functions.

---

### P1: Variables form as a second step ⭐ MVP

**User Story**: As a developer, I want a short form with one field per placeholder, so that I never
edit a long prompt by hand.

**Why P1**: The interaction the owner asked for.

**Acceptance Criteria**:

1. WHILE the selected prompt has at least one placeholder the dialog's primary button SHALL read **Next** instead of **Spawn**. <!-- APR-17 -->
2. WHEN the developer presses **Next** THEN the dialog SHALL show a second step with one labelled single-line text field per placeholder, in parse order, plus a **Back** button. <!-- APR-18 -->
3. WHEN the second step opens THEN the `branch` field SHALL be pre-filled with the chosen worktree's branch and the `worktree` field with the chosen cwd path. <!-- APR-19 -->
4. WHEN the second step opens with a task linked (chosen by hand, or derived from the branch under "From branch") THEN `taskId` SHALL be pre-filled with that task's id and `taskTitle` with its title when the pin has one. <!-- APR-20 -->
5. WHEN the second step opens with no value known for a context placeholder (no task, a browsed folder with no branch, a task with no cached title) THEN that field SHALL start empty. <!-- APR-21 -->
6. Every pre-filled field SHALL stay editable, and a placeholder outside the four context names SHALL start empty. <!-- APR-22 -->
7. WHILE any field is empty after trimming the **Spawn** button SHALL be disabled. <!-- APR-23 -->
8. WHILE the second step is shown the "Will run" card SHALL show the agent command line followed by the prompt resolved from the current field values, updating on every keystroke. <!-- APR-25 -->
9. IF the resolved prompt is longer than 8000 characters THEN the **Spawn** button SHALL be disabled and the dialog SHALL show "Prompt too long (<n> / 8000 characters)". <!-- APR-26 -->
9a. WHEN the prompt is resolved from the form THEN each value SHALL be trimmed of leading and trailing whitespace before substitution, keeping inner whitespace. <!-- APR-37 -->
10. WHEN the developer presses **Back** THEN the dialog SHALL return to the first step with agent, directory, task and prompt unchanged, and pressing **Next** again with the same prompt SHALL restore the values typed before. <!-- APR-27 -->
11. IF the developer selects a different prompt after going Back THEN the dialog SHALL discard typed values of placeholders the new prompt does not have and keep those it shares. <!-- APR-28 -->
12. WHEN the selected prompt has no placeholders THEN the primary button SHALL stay **Spawn**, no second step SHALL appear, and "Will run" SHALL show the prompt text. <!-- APR-29 -->

**Independent Test**: From a pinned task card, pick `review`: step 2 shows `branch` pre-filled;
Spawn stays disabled until every field has text.

---

### P1: Spawn with the resolved prompt ⭐ MVP

**User Story**: As a developer, I want the agent to start already working on the resolved prompt,
so that the session does not wait for me to type the task.

**Why P1**: The outcome of the feature.

**Acceptance Criteria**:

1. WHEN a session is spawned with a prompt THEN the agent SHALL be launched with `command`, then `args`, then `--`, then the resolved prompt as one final argument. <!-- APR-30 -->
2. WHERE the agent command resolves to an executable (not a `.cmd`/`.bat` shim) the resolved prompt SHALL reach the agent process as exactly one argument, byte-for-byte equal to the resolved text, whether the default shell is `pwsh` or `cmd`, including line breaks, spaces, `'`, `"`, `$`, `` ` ``, `%`, `^`, `&`, `|`, `<`, `>`, `(`, `)`, `;`, `#`, `@`, `{`, `}` and non-ASCII characters such as `ã`. <!-- APR-24 -->
3. WHERE the app injects its hook `--settings` flag into a Claude launch the resolved prompt SHALL still be the final argument, after `--settings <file>`. <!-- APR-31 -->
4. WHILE a session spawned with a prompt is running the agent SHALL run interactively in the embedded terminal, with the same keep-shell-live behaviour as a session without a prompt. <!-- APR-32 -->
5. WHEN a session spawned with a prompt is **Respawned** or **Duplicated** THEN the launch SHALL carry no prompt argument. <!-- APR-33 -->
6. The resolved prompt and the prompt name SHALL NOT be written to `config.json`. <!-- APR-34 -->
8. WHEN a session is spawned with a prompt THEN its hosting shell SHALL be `pwsh` whatever the default shell. <!-- APR-36 -->
7. IF the prompt file changed or disappeared between opening the dialog and pressing Spawn THEN the session SHALL be spawned with the text that was shown in "Will run". <!-- APR-35 -->

**Independent Test**: With a two-line prompt containing `it's $HOME & 100% "done"`, spawn under
each default shell into an agent command that echoes its argv (a test script registered as the
command): one argument, identical text, line break included.

---

## Edge Cases

Covered inline: missing folder (APR-05), unreadable/empty/oversized file (APR-06), over-long
resolved prompt (APR-26), file changed mid-dialog (APR-35), prompt switch after Back (APR-28).

---

## Implicit-requirement dimensions

| Dimension | Landing |
| --------- | ------- |
| Input validation & bounds | APR-06 (16 KiB file), APR-12/13 (name pattern), APR-23 (required fields), APR-26 (8000-character prompt). |
| Failure / partial-failure states | APR-05, APR-06 (a bad file never hides the others); spawn failures keep today's handling. |
| Idempotency / retry / duplicate | APR-33 (Respawn/Duplicate never re-send). |
| Auth boundaries & rate limits | N/A because the feature adds no endpoint and no credential; the folder is the user's own profile. |
| Concurrency / ordering | APR-35 (the text shown is the text sent). |
| Data lifecycle / expiry | APR-34 (nothing persisted); the files are the developer's. |
| Observability | N/A because the "Will run" preview (APR-25) is the developer-facing record; no logging is added. |
| External-dependency failure | N/A because the CLI's handling of its own positional argument is outside the app. |
| State-transition integrity | APR-27, APR-28 (Back/Next keep or discard values deterministically). |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| APR-01 | P1: Discover | Tasks | Verified (hand-UAT pending) |
| APR-02 | P1: Discover | Tasks | Verified |
| APR-03 | P1: Discover | Tasks | Verified |
| APR-04 | P1: Discover | Tasks | Verified |
| APR-05 | P1: Discover | Tasks | Verified |
| APR-06 | P1: Discover | Tasks | Verified |
| APR-07 | P1: Discover | Tasks | Verified (hand-UAT pending) |
| APR-08 | P1: Pick | Tasks | Verified (hand-UAT pending) |
| APR-09 | P1: Pick | Tasks | Verified (hand-UAT pending) |
| APR-10 | P1: Pick | Tasks | Verified (hand-UAT pending) |
| APR-11 | P1: Pick | Tasks | Verified (hand-UAT pending) |
| APR-12 | P1: Parsing | Tasks | Verified |
| APR-13 | P1: Parsing | Tasks | Verified |
| APR-14 | P1: Parsing | Tasks | Verified |
| APR-15 | P1: Parsing | Tasks | Verified |
| APR-16 | P1: Parsing | Tasks | Verified |
| APR-17 | P1: Variables form | Tasks | Verified (hand-UAT pending) |
| APR-18 | P1: Variables form | Tasks | Verified (hand-UAT pending) |
| APR-19 | P1: Variables form | Tasks | Verified |
| APR-20 | P1: Variables form | Tasks | Verified |
| APR-21 | P1: Variables form | Tasks | Verified |
| APR-22 | P1: Variables form | Tasks | Verified (hand-UAT pending) |
| APR-23 | P1: Variables form | Tasks | Verified (hand-UAT pending) |
| APR-24 | P1: Spawn | Tasks | Verified |
| APR-25 | P1: Variables form | Tasks | Verified (hand-UAT pending) |
| APR-26 | P1: Variables form | Tasks | Verified (hand-UAT pending) |
| APR-27 | P1: Variables form | Tasks | Verified (hand-UAT pending) |
| APR-28 | P1: Variables form | Tasks | Verified (hand-UAT pending) |
| APR-29 | P1: Variables form | Tasks | Verified (hand-UAT pending) |
| APR-30 | P1: Spawn | Tasks | Verified |
| APR-31 | P1: Spawn | Tasks | Verified |
| APR-32 | P1: Spawn | Tasks | Verified |
| APR-33 | P1: Spawn | Tasks | Verified |
| APR-34 | P1: Spawn | Tasks | Verified |
| APR-35 | P1: Spawn | Tasks | Verified (hand-UAT pending) |
| APR-36 | P1: Spawn | Tasks | Verified |
| APR-37 | P1: Variables form | Tasks | Verified (hand-UAT pending) |

**Coverage:** 37 total, 37 mapped to tasks, all verified (`validation.md`); the 17 marked hand-UAT pending have a renderer or IPC binding checked by code reading only.

---

## Success Criteria

- [ ] From a pinned task card, a session is spawned on a prompt file in at most two dialog steps and the agent's first turn starts on the resolved prompt, with no typing in the terminal.
- [ ] A multi-line prompt with the APR-24 character set arrives intact under both default shells.
