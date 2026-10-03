# Agent Prompts Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/agent-prompts/design.md`
**Status**: Done

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts` (`include: src/**/*.test.ts`), `.specs/codebase/CONVENTIONS.md`. Renderer `lib/` helpers carry co-located tests (`src/renderer/src/lib/*.test.ts`); renderer components do not (TESTING.md).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Shared pure helpers (`src/shared/*.ts`) | unit | 1:1 to spec ACs; every listed edge case; spec constants pinned with literals (L-009) | `src/shared/<module>.test.ts` | `npx vitest run <file>` |
| Main deep modules (`prompt-library`, `spawn-plan`, `SessionManager`) | unit (real temp dir / injected fake / one real pwsh process for APR-24) | 1:1 to spec ACs; failure paths; async `rm` teardown on non-ASCII temp paths | `src/main/<module>.test.ts` | `npx vitest run <file>` |
| Renderer pure lib (`src/renderer/src/lib/*.ts`) | unit | 1:1 to spec ACs for the form rules | `src/renderer/src/lib/<module>.test.ts` | `npx vitest run <file>` |
| Thin shells (`index.ts` IPC wiring, `ipc-contract.ts`, preload) | none (hand-verified) | build gate | - | `npm run typecheck` |
| Renderer components / hooks (`NewSessionDialog`, `App.tsx`, `use-sessions.ts`) | none (hand-verified UAT) | build gate | - | `npm run typecheck && npm run lint` |
| Docs (`README.md`) | none | - | - | build gate only |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <the task's test files>` |
| Full | Same as Quick (no integration/e2e suite exists) | `npm test` |
| Build | After phase completion or no-test tasks | `npm run typecheck && npm run lint && npm test` |

---

## Execution Plan

### Phase 1: Core (main + shared)

```
T1 → T2
```

```
T1 → T3 → T4
```

### Phase 2: Wiring and dialog

```
T5 → T6 → T8
```

```
T7 → T8 → T9
```

---

## Task Breakdown

### T1: Prompt template helpers

**What**: `src/shared/prompt-template.ts` with `PLACEHOLDER`, `CONTEXT_PLACEHOLDERS`, `PROMPT_MAX_CHARS = 8000`, `PROMPT_FILE_MAX_BYTES = 16384`, `parsePlaceholders`, `resolvePrompt`, `normalizePromptText`, plus the `PromptEntry` type.
**Where**: `src/shared/prompt-template.ts` (+ `src/shared/prompt-template.test.ts`)
**Depends on**: None
**Reuses**: none (new seam)
**Requirement**: APR-04, APR-12, APR-13, APR-14, APR-15, APR-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `parsePlaceholders` returns distinct valid names in first-appearance order; invalid `{{ x }}`, `{{1a}}`, `{{}}` yield none; `Branch`≠`branch`
- [x] `resolvePrompt` replaces every occurrence, keeps other text and line breaks, inserts a value containing `{{x}}` literally
- [x] `normalizePromptText` strips a leading BOM, turns `\r\n` into `\n`, trims
- [x] Constants pinned with literal assertions (8000, 16384, the four context names)
- [x] Gate check passes: `npx vitest run src/shared/prompt-template.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(prompts): add prompt template parsing and resolution`

---

### T2: Prompt library

**What**: `src/main/prompt-library.ts` with `listPrompts(root)` and `ensurePromptsFolder(root)` per design.
**Where**: `src/main/prompt-library.ts` (+ `src/main/prompt-library.test.ts`)
**Depends on**: T1
**Reuses**: workflow discovery semantics (`src/main/workflow-loader.ts:56`)
**Requirement**: APR-01, APR-02, APR-03, APR-05, APR-06, APR-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Lists `*.md` (any case) regular files by name without extension; ignores subfolders and other extensions
- [x] Sorted case-insensitively ascending
- [x] Missing folder → `[]`
- [x] Empty → `{name, error: 'empty'}`; > 16 KiB → `{name, error: 'larger than 16 KiB'}`; unreadable → `error` starting `unreadable: `; other prompts still listed (the `unreadable:` branch was untested here; covered by T10 via an injected `PromptFs`)
- [x] Template text is normalised (BOM, CRLF, trim)
- [x] `ensurePromptsFolder` creates a missing nested folder and is a no-op when it exists
- [x] Temp dirs removed with async `rm` (non-ASCII profile path)
- [x] Gate check passes: `npx vitest run src/main/prompt-library.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(prompts): list prompt files from the prompts folder`

---

### T3: Prompt spawn plan

**What**: `PROMPT_ENV` and `buildPromptSpawnPlan(agent, cwd)` in `src/main/spawn-plan.ts`.
**Where**: `src/main/spawn-plan.ts` (+ `src/main/spawn-plan.test.ts`)
**Depends on**: T1
**Reuses**: `quotePwsh`, the `-NoExit` convention
**Requirement**: APR-24, APR-30, APR-32, APR-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Plan is `pwsh.exe` with `['-NoExit', '-Command', autoCommand]` and the given cwd
- [x] `autoCommand` reads `PLAYGROUND_PROMPT` into a local, removes the env var, and calls `& <command> <args> -- $p`
- [x] A real `pwsh` run of the plan against a node argv-echo agent receives `['--', prompt]` byte-identical for a two-line prompt with the APR-24 character set, and the agent's own env no longer holds `PLAYGROUND_PROMPT`
- [x] Gate check passes: `npx vitest run src/main/spawn-plan.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(prompts): build the pwsh launch that hands a prompt to the agent`

---

### T4: SessionManager spawns with a prompt

**What**: `SessionManager.spawn(..., prompt?)` and `#start(meta, prompt?)` per design.
**Where**: `src/main/session-manager.ts` (+ `src/main/session-manager.test.ts`)
**Depends on**: T3
**Reuses**: `#resolve`, `#hookable`, `#withHookSettings`, `fakePort`
**Requirement**: APR-24, APR-26, APR-30, APR-31, APR-33, APR-34, APR-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] With a prompt, the port gets the prompt plan (pwsh even when `defaultShell` is `cmd`) and env `PLAYGROUND_PROMPT` equal to the prompt
- [x] With hooks on, `--settings <file>` precedes `--` in `autoCommand`
- [x] Rejects (nothing persisted, no port spawn) for: prompt with ad-hoc, blank prompt, prompt over 8000 characters; exactly 8000 is accepted
- [x] Respawn and duplicate of a prompted session spawn with no `PLAYGROUND_PROMPT` and today's plan
- [x] Persisted session has no prompt text and no prompt name
- [x] Existing session-manager tests still pass unchanged
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (phase end)

**Tests**: unit
**Gate**: build

**Commit**: `feat(sessions): spawn a session with an initial prompt`

---

### T5: Prompts IPC and spawn passthrough in main

**What**: `prompts:list`, `prompts:openFolder` and `sessions:spawn.prompt` in the IPC contract, wired in `index.ts` with `promptsRoot`.
**Where**: `src/shared/ipc-contract.ts`, `src/main/index.ts` (one channel set, contract + its handler)
**Depends on**: None
**Reuses**: `handle()`, `workflowsRoot` placement, `shell.openPath`
**Requirement**: APR-01, APR-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Contract entries typed with `PromptEntry`
- [x] `prompts:openFolder` runs `ensurePromptsFolder` then `shell.openPath(promptsRoot)`
- [x] `sessions:spawn` passes `prompt` to `sessions.spawn`
- [x] Gate check passes: `npm run typecheck && npm run lint`

**Tests**: none
**Gate**: build

**Commit**: `feat(prompts): expose prompts and prompted spawns over IPC`

---

### T6: Renderer spawn passthrough

**What**: `spawnSession` in `use-sessions.ts` and its `App.tsx` caller carry `prompt`.
**Where**: `src/renderer/src/lib/use-sessions.ts`, `src/renderer/src/App.tsx` (one call chain)
**Depends on**: T5
**Reuses**: existing `spawnSession`
**Requirement**: APR-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `spawnSession(agentName, cwd, adhocCommand?, task?, prompt?)` sends `prompt` in `sessions:spawn` (the `NewSessionDialog` `onSpawn` prop type gains `prompt?` too, so `App.tsx` can forward it)
- [x] Gate check passes: `npm run typecheck && npm run lint`

**Tests**: none
**Gate**: build

**Commit**: `feat(sessions): pass the prompt from the dialog to main`

---

### T7: Prompt form rules

**What**: `src/renderer/src/lib/prompt-form.ts` with `promptContext`, `prefillValues`, `carryValues`, `formBlockers`.
**Where**: `src/renderer/src/lib/prompt-form.ts` (+ `src/renderer/src/lib/prompt-form.test.ts`)
**Depends on**: None
**Reuses**: `LevelOption` (`session-levels.ts`), T1 helpers
**Requirement**: APR-19, APR-20, APR-21, APR-22, APR-23, APR-26, APR-27, APR-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `branch` = chip branch, `worktree` = cwd; `taskId`/`taskTitle` from the hand-picked task, else the chip's derived id and the pin's title
- [x] Unknown context values and non-context names start `''`
- [x] `carryValues` keeps shared names' typed values, prefills new names, drops absent ones
- [x] `formBlockers` lists trimmed-empty fields and reports the length when over 8000
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/prompt-form.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(prompts): add the variables form rules`

---

### T8: New Session dialog prompt steps

**What**: Prompt field (step 1) and variables step (step 2) in `NewSessionDialog`, per design.
**Where**: `src/renderer/src/components/NewSessionDialog.tsx` (+ its `.css`)
**Depends on**: T6, T7
**Reuses**: dialog classes, `prompt-form.ts`, `prompt-template.ts`
**Requirement**: APR-07, APR-09, APR-10, APR-11, APR-17, APR-18, APR-25, APR-29, APR-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Prompt chips (None + entries; broken disabled with reason), hidden for Ad-hoc, Open prompts folder reloads on focus
- [x] Next/Spawn switch, step 2 fields + live Will run, Back keeps values, over-length notice
- [x] Spawn sends the previewed resolved text
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (phase end before docs; the only failures are the known machine-local real-git/timeout tests: file-discard, git-sync, hook-shell, worktree-manager)
- **gap:** the dialog is not hand-verified yet (renderer components carry no unit tests by convention; the app was not run in this worktree because node-pty is not built). UAT pending.

**Tests**: none
**Gate**: build

**Commit**: `feat(sessions): pick a prompt and fill its variables in New Session`

---

### T9: Document prompts

**What**: README section on `~/.playground/prompts`, placeholders, `--` delivery and the `.cmd` shim limitation.
**Where**: `README.md`
**Depends on**: T8
**Reuses**: README's agent-sessions section
**Requirement**: APR-01, APR-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Section added under Embedded agent sessions
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `docs(readme): document agent prompt files`

---

### Phase 3: Verifier fixes (iteration 1)

```
T10
```

```
T11
```

### T10: Test the unreadable prompt reason

**What**: `listPrompts(root, fs?)` takes an injectable `PromptFs` so a failed read is testable without `vi.mock`; test the `unreadable: <message>` entry (Verifier gap 1, surviving mutant M17).
**Where**: `src/main/prompt-library.ts` (+ `src/main/prompt-library.test.ts`)
**Depends on**: None
**Reuses**: injected-fake pattern (TESTING.md)
**Requirement**: APR-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] An injected failing `readFile` yields `{ name, error: 'unreadable: <message>' }` and the other prompts are still listed
- [x] Gate check passes: `npx vitest run src/main/prompt-library.test.ts` (11 passed)

**Tests**: unit
**Gate**: quick

**Commit**: `test(prompts): cover the unreadable prompt reason`

---

### T11: Trim variable values before resolving

**What**: `resolveForm(template, values)` in `prompt-form.ts` trims each value before `resolvePrompt`; the dialog resolves through it (Verifier gap 2, spec Assumption "Value whitespace", now APR-37).
**Where**: `src/renderer/src/lib/prompt-form.ts` (+ test; one-line call site in `NewSessionDialog.tsx`)
**Depends on**: None
**Reuses**: `resolvePrompt`
**Requirement**: APR-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Values with surrounding whitespace resolve trimmed; inner whitespace kept
- [x] The dialog's preview and spawned text use `resolveForm`
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: unit
**Gate**: build

**Commit**: `fix(prompts): trim variable values before resolving the prompt`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 → T2
          T1 → T3 → T4
Phase 2:  T5 → T6 → T8
          T7 → T8 → T9
```

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | none | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T1 | T1 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | None | none | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | None | none | ✅ |
| T8 | T6, T7 | T6 → T8, T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Shared pure helper | unit | unit | ✅ |
| T2 | Main deep module | unit | unit | ✅ |
| T3 | Main deep module | unit | unit | ✅ |
| T4 | Main deep module | unit | unit | ✅ |
| T5 | Thin shell (IPC wiring) | none | none | ✅ |
| T6 | Renderer hook/component | none | none | ✅ |
| T7 | Renderer pure lib | unit | unit | ✅ |
| T8 | Renderer component | none | none | ✅ |
| T9 | Docs | none | none | ✅ |
