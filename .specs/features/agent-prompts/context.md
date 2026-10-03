# Agent Prompts Context

**Gathered:** 2026-10-02
**Spec:** `.specs/features/agent-prompts/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Markdown files in `~/.playground/prompts` are prompt templates with `{{name}}` placeholders. The
New Session dialog offers them for any registry agent, asks for placeholder values in a second
step, and launches the **interactive** agent with the resolved prompt as its final argument.

---

## Implementation Decisions

### Mode

- Interactive PTY session only (`claude "<prompt>"`). Headless runs stay with workflows (`ctx.agent`).

### Where prompts live

- First draft put a single-line `promptTemplate` on `AgentDef`. The owner redirected to a folder,
  "similar ao que fazemos com workflows": `~/.playground/prompts/<name>.md`, one file per prompt.
- The file body is the whole template; no frontmatter. A prompt is independent of the agent: the
  developer picks the agent, then optionally a prompt.
- Global folder only; no repo-scoped prompts.

### Variables

- A **second form** with one field per placeholder (the owner did not want to edit a long text).
- Placeholders are inferred from `{{name}}`; `taskId`, `taskTitle`, `branch`, `worktree` are
  pre-filled from the dialog's selections and remain editable.
- No placeholders → no second step. Every field is required.

### Permissions

- No UI. `--permission-mode …` goes in the agent's `args`.

### Respawn / Duplicate

- Neither re-sends the prompt; nothing about the prompt is persisted.

### Agent's Discretion

- Prompt picker control, step-2 layout, "Will run" rendering of a multi-line prompt, and where the
  **Open prompts folder** affordance sits (follow the New Session handoff shell; read
  `design/handoff/DESIGN_HANDOFF_AGENTS.md` before designing).
- The multi-line delivery mechanism under `cmd` (APR-24 pins only the outcome).

### Declined / Undiscussed Gray Areas → Assumptions

- Naming, ordering, normalisation, size bounds, prompt position, substitution rules — logged in the
  spec's Assumptions table.

---

## Specific References

- Workflows folder convention: `~/.playground/workflows`, on-demand discovery, broken entries
  listed with their error (`src/main/index.ts:747`, `src/main/workflow-manager.ts`).
- Claude Code 2.1.287 `--help`: `Usage: claude [options] [command] [prompt]`. A skill can be the
  prompt (`/tlc-spec-driven …`).

---

## Deferred Ideas

- Headless "run to completion" prompts (a one-step workflow launcher).
- Frontmatter: agent binding, extra `args`, description.
- Repo-scoped prompts in `<repo>/.playground/prompts`.
- Remembering the last prompt used per agent or per task.
- Fixing whitespace splitting of `args` in the Settings editor.
