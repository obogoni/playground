# Agent Presets Context

**Gathered:** 2026-10-14
**Spec:** `.specs/features/agent-presets/spec.md`
**Status:** Ready for design (pending spec approval)

---

## Feature Boundary

Named presets that fix a registry agent, a cwd and an optional prompt file. They are saved from
the New Session dialog, kept in `~/.playground/presets.json`, launched from the rail's
**+ New session** split button, and managed in Settings. At launch the app asks only for the
prompt's placeholders.

---

## Implementation Decisions

### Definition

- Presets are created with **Save as preset** in the New Session dialog. There is no
  create-from-scratch form.
- A preset captures **agent + cwd + prompt** only. The task, the typed placeholder values and the
  isolation level are never saved. Every `{{placeholder}}` is asked at launch, and the context
  placeholders are pre-filled as they are today.

### Storage

- One hand-editable file `~/.playground/presets.json`, a JSON array whose order is the menu order
  (owner amendment: "com possibilidade de editar via arquivos na pasta .playground").

### Launch

- **+ New session** becomes a split button. The main part opens the dialog as before, and the
  arrow opens the preset menu.
- A preset with nothing to ask **spawns immediately** on pick. This includes a prompt whose
  placeholders are all filled from context. There is no confirmation step (owner, 2026-10-14:
  "se todas as variaveis forem preenchidas, apenas dispara o agente"), unlike the New Session
  dialog's variables step.
- A preset with placeholders opens a small Run preset dialog with only those fields.

### Task link

- When the prompt has `{{taskId}}` and its value is a positive integer, the session is linked to
  that task (Hours, rail). Otherwise the session stays on From branch.

### Broken presets

- A broken preset is listed with a warning. Picking it opens the full New Session dialog
  pre-filled with whatever is still valid.

### Management

- Settings › Presets offers rename, delete and reorder.
- To change a preset's agent, cwd or prompt, save over it from the dialog, or edit the file.

### Agent's Discretion

- Name rules, the save-over confirmation, the invalid-file and invalid-entry handling, the write
  format, the Run preset dialog's layout and the More options escape. These are logged as
  `n — agent's default` in the spec's Assumptions table.

### Declined / Undiscussed Gray Areas → Assumptions

- All recorded in the spec's Assumptions table with `Confirmed? n`.

---

## Specific References

- Reviewer: Claude, the same workspace, a `review-pr` prompt that asks only for the PR.
- Bug fixer: Claude, the same workspace, a `fix-bug` prompt that asks only for the task id.
- "A experiência deve ser rápida, sem necessidade de redefinir parâmetros desnecessários toda vez."

---

## Deferred Ideas

- `ado-triggers` (parked by the owner on 2026-10-14). Its rule-launched sessions could later reuse
  presets as their launch definition.
