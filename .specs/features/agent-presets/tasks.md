# Agent Presets Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/agent-presets/spec.md`
**Design**: `.specs/features/agent-presets/design.md`
**Status**: Done

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts` (`include: src/**/*.test.ts`, node environment, no DOM library). Renderer components carry no unit tests by project convention; their ACs are proven by a CDP smoke (`scripts/smoke-*.mjs`, run against `npm run dev -- -- --remote-debugging-port=9222`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Shared pure helpers (`src/shared/agent-presets.ts`) | unit | 1:1 to spec ACs; every bound pinned with literals (L-009) | `src/shared/agent-presets.test.ts` | `npx vitest run <file>` |
| Main store (`src/main/agent-preset-store.ts`) | unit (pure functions + real temp dir + injected `PresetFs` faults) | 1:1 to PRST-01..09, 13, 16, 38..42; every failure path; async `rm` teardown (non-ASCII profile) | `src/main/agent-preset-store.test.ts` | `npx vitest run <file>` |
| Renderer pure lib (`src/renderer/src/lib/preset-launch.ts`) | unit | 1:1 to PRST-21..23, 29..31, 33; every branch of the plan | `src/renderer/src/lib/preset-launch.test.ts` | `npx vitest run <file>` |
| Thin shells (`ipc-contract.ts`, `index.ts` wiring) | none | build gate | - | `npm run typecheck` |
| Renderer components / App wiring | none (unit) — UI ACs proven by the smoke task | build gate | - | `npm run typecheck && npm run lint` |
| CDP smoke (`scripts/smoke-agent-presets.mjs`) | e2e | Every UI-bound AC (PRST-10..12, 15..20, 22, 24..28, 32..37, 40..44) driven in the running app | `scripts/smoke-agent-presets.mjs` | `node scripts/smoke-agent-presets.mjs` (dev app running with `PLAYGROUND_PRESETS_FILE` set) |
| Docs (`README.md`) | none | - | - | build gate only |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <the task's test files>` |
| Full | After the smoke task | `npm test` + `node scripts/smoke-agent-presets.mjs` against the dev app |
| Build | After phase completion or no-test tasks | `npm run typecheck && npm run lint && npm test` |

---

## Execution Plan

Phases are ordered and run sequentially; tasks within a phase execute in order.

### Phase 1: Store (shared + main)

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Launch planning (renderer, pure)

```
T6 → T7
```

### Phase 3: Launch UI

```
T8 → T9 → T10 → T11 → T12 → T13
```

### Phase 4: Settings, smoke, docs

```
T14 → T15 → T16 → T17
```

---

## Task Breakdown

### T1: Preset types and name rule

**What**: `src/shared/agent-presets.ts` with the design's types (`AgentPreset`, `AgentPresetEntry`, `AgentPresetListing`, `AgentPresetChangeResult`, `PresetOp`), `presetNameProblem(name)` and `sameName(a, b)`.
**Where**: `src/shared/agent-presets.ts` (+ `src/shared/agent-presets.test.ts`)
**Depends on**: None
**Reuses**: `src/shared/prompt-template.ts` (module shape)
**Requirement**: PRST-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `presetNameProblem` returns `'1–40 characters, one line'` for `''`, `'   '`, a 41-character name, and names containing `\n` or `\r`; `null` for 1 and 40 characters (trimmed length; literals, L-009)
- [x] `sameName` is true for `' Reviewer '` vs `'reviewer'`, false for `'Reviewer'` vs `'Reviewer 2'`
- [x] Gate check passes: `npx vitest run src/shared/agent-presets.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(presets): declare agent presets and their name rule`

---

### T2: Parse and classify the presets file

**What**: `parsePresetsText(text)` and `classifyEntries(raw)` in the store module, both pure.
**Where**: `src/main/agent-preset-store.ts` (+ `src/main/agent-preset-store.test.ts`)
**Depends on**: T1
**Reuses**: `PromptEntry`'s ok-or-error listing shape
**Requirement**: PRST-01, PRST-03, PRST-04, PRST-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `'{'` → `{ ok: false, reason }` with `reason` starting `invalid JSON: `; `'{}'` and `'"x"'` → `not an array`
- [x] Entries come back in array order (PRST-01)
- [x] Not-an-object, missing/empty/non-string `name`, `agent` or `cwd`, and a present non-string `prompt` each give `invalid entry: <field>`, with the valid neighbours still `ok` (PRST-04)
- [x] `[{name:'A'…},{name:' a '…}]` → first `ok`, second `invalid` / `duplicate name` (PRST-05)
- [x] Gate check passes: `npx vitest run src/main/agent-preset-store.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(presets): read and classify the presets file`

---

### T3: Apply a change to the presets array

**What**: `applyPresetOp(raw, op)` and `serializePresets(raw)`, both pure, targeting entries by name.
**Where**: `src/main/agent-preset-store.ts` (+ test)
**Depends on**: T2
**Reuses**: T1 `sameName`, `presetNameProblem`
**Requirement**: PRST-06, PRST-07, PRST-13, PRST-16, PRST-38, PRST-39, PRST-40, PRST-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `save` appends `{name, agent, cwd, prompt}`, omitting `prompt` when absent (PRST-13)
- [x] `save` on an existing name without `replace` → `exists` with the stored name; with `replace` → same index, `name/agent/cwd/prompt` replaced, unknown fields kept, `prompt` deleted when the new preset has none (PRST-16, PRST-07)
- [x] `rename` changes `name` only and keeps unknown fields; a name used by another entry → `exists` (PRST-38, PRST-39, PRST-07)
- [x] `move` swaps with the raw neighbour; up on the first / down on the last → error (PRST-40)
- [x] `delete` removes only the named entry (PRST-41)
- [x] A target name not found → `failed: preset "<name>" not found`; an invalid new name → `failed` with the T1 text
- [x] `serializePresets` output equals `JSON.stringify(raw, null, 2) + '\n'` checked against a literal string (PRST-06)
- [x] Gate check passes: `npx vitest run src/main/agent-preset-store.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(presets): change presets by name`

---

### T4: Preset store I/O

**What**: `createPresetStore(file, fs, opener)` with `list()`, `change(op)` and `openFile()`.
**Where**: `src/main/agent-preset-store.ts` (+ test)
**Depends on**: T3
**Reuses**: `PromptFs` seam (`src/main/prompt-library.ts:17`), temp + rename write (`src/main/config-store.ts:65`), async-`rm` teardown (`src/main/prompt-library.test.ts:7`)
**Requirement**: PRST-02, PRST-06, PRST-08, PRST-09, PRST-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Missing file → `{ ok: true, entries: [] }` (PRST-02)
- [x] `cwdExists` is true for an existing folder, false for a missing path and for a path that is a file
- [x] `change` on a missing file in a missing folder creates both (PRST-06)
- [x] `change` while the file holds invalid JSON → `failed: presets.json is invalid; fix it by hand first`, and the file bytes are unchanged (PRST-08)
- [x] A hand edit written to disk after `list()` and before `change()` survives the change (PRST-09)
- [x] Two `change` calls started together both land (serialized chain)
- [x] An injected write failure leaves the original file intact and returns `failed: <message>`
- [x] `openFile` creates `[]\n` when missing, calls the opener with the file path, and returns the opener's error string or `null` (PRST-42)
- [x] Gate check passes: `npx vitest run src/main/agent-preset-store.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(presets): store presets in the presets file`

---

### T5: Preset IPC channels

**What**: Declare the six `agentPresets:*` channels and register them in main over one store at `PLAYGROUND_PRESETS_FILE ?? ~/.playground/presets.json`.
**Where**: `src/shared/ipc-contract.ts`, `src/main/index.ts` (one wiring change)
**Depends on**: T4
**Reuses**: `prompts:*` declarations (`ipc-contract.ts:218`) and handlers (`index.ts:935`)
**Requirement**: PRST-01, PRST-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Channels typed as in design §`agentPresets:*` channels
- [x] `openFile` handler passes `shell.openPath` as the opener
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(presets): serve the presets channels`

---

### T6: Preset problem and task link

**What**: `presetProblem(preset, cwdExists, agents, prompts)` and `presetTaskLink(names, values, tasks)`.
**Where**: `src/renderer/src/lib/preset-launch.ts` (+ `src/renderer/src/lib/preset-launch.test.ts`)
**Depends on**: None (runs after Phase 1)
**Reuses**: `PromptEntry`, `PinnedTaskView`
**Requirement**: PRST-29, PRST-30, PRST-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Reasons returned in PRST-31's order, one fixture per reason plus one with all four failing → `agent not found`
- [x] `taskId` = `'12345'` → `{ id: 12345, title }` with the pinned title, `null` title when not pinned (PRST-29)
- [x] `'012'`, `'+12'`, `'0'`, `'12a'`, `''`, and names without `taskId` → `undefined` (PRST-30)
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/preset-launch.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(presets): tell why a preset cannot launch`

---

### T7: Plan a preset launch

**What**: `planPresetLaunch(input)` returning `spawn`, `form` or `dialog` per design.
**Where**: `src/renderer/src/lib/preset-launch.ts` (+ test)
**Depends on**: T6
**Reuses**: `promptContext`, `prefillValues`, `formBlockers`, `resolveForm` (`prompt-form.ts`), `isolationLevelOf`, `samePath`, `levelOptions`
**Requirement**: PRST-21, PRST-22, PRST-23, PRST-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No prompt → `spawn` without `prompt`; prompt without placeholders → `spawn` with the template text (PRST-21)
- [x] Worktree cwd + prompt using only `{{branch}}`/`{{taskId}}` → `spawn`, resolved text contains the branch, `task` linked from the branch's id (PRST-21, PRST-23, PRST-29)
- [x] Workspace cwd + `{{taskId}}` → `form` with `taskId: ''`, names in parse order (PRST-22, PRST-23)
- [x] All values filled but resolved text of 8001 characters → `form` (PRST-22)
- [x] A problem → `dialog` whose source keeps only the still-valid agent, cwd and prompt (PRST-33)
- [x] A cwd spelled `M:/X/` for tree path `M:\x` comes back as `M:\x` in every plan kind
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/preset-launch.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(presets): plan what picking a preset does`

---

### T8: New Session opens on a given agent and prompt

**What**: `NewSessionSource` gains `agentName?` and `promptName?`, which seed the initial agent (fallback `agents[0]`) and prompt (fallback None when unknown or broken).
**Where**: `src/renderer/src/components/NewSessionDialog.tsx`
**Depends on**: None (runs after Phase 2)
**Reuses**: existing `source.cwd` seeding
**Requirement**: PRST-26, PRST-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Opening without the new fields behaves as before
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(sessions): open New Session on a chosen agent and prompt`

---

### T9: Save as preset in New Session

**What**: The footer's **Save as preset** button, inline name row, Replace confirm and saved/error notices.
**Where**: `src/renderer/src/components/NewSessionDialog.tsx` (+ its CSS)
**Depends on**: T8
**Reuses**: T1 `presetNameProblem`; `agentPresets:save`
**Requirement**: PRST-10, PRST-11, PRST-12, PRST-13, PRST-14, PRST-15, PRST-16, PRST-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Button hidden for Ad-hoc or with no cwd; the saved preset never carries task, values or level
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(presets): save a preset from New Session`

---

### T10: Preset menu

**What**: `PresetMenu` loading presets and prompts, listing rows, broken reasons, the empty text, the invalid-file row and **Manage presets…**.
**Where**: `src/renderer/src/components/PresetMenu.tsx` (+ `PresetMenu.css`)
**Depends on**: T9
**Reuses**: `SyncPopover` close rules, `.rail-ctx-menu` look, T6 `presetProblem`
**Requirement**: PRST-19, PRST-20, PRST-32, PRST-34, PRST-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Closes on outside click and Escape; Escape does not reach the rail
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(presets): list presets in a menu`

---

### T11: Run preset dialog

**What**: `RunPresetDialog` with one field per placeholder, the live Will run card, the too-long notice, Enter-to-spawn, **More options**.
**Where**: `src/renderer/src/components/RunPresetDialog.tsx`
**Depends on**: T10
**Reuses**: `resolveForm`, `formBlockers`, T6 `presetTaskLink`, the variables-step markup and `NewSessionDialog.css`
**Requirement**: PRST-22, PRST-24, PRST-25, PRST-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] First empty field focused; Enter spawns only while Spawn is enabled
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(presets): ask only for a preset's missing values`

---

### T12: Split New session button

**What**: The rail's **+ New session** becomes a split button whose arrow opens `PresetMenu`; `SessionRail` and `AgentsView` gain `agents`, `onPickPreset`, `onManagePresets`.
**Where**: `src/renderer/src/components/SessionRail.tsx` (+ `SessionRail.css`, prop pass-through in `AgentsView.tsx`)
**Depends on**: T11
**Reuses**: `.session-rail-new`
**Requirement**: PRST-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Main part still calls `onNew`; arrow has `aria-haspopup="menu"`, `aria-expanded`, `aria-label="Agent presets"`
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(presets): open the preset menu from New session`

---

### T13: Launch presets from App

**What**: App's `onPickPreset` runs `planPresetLaunch` and spawns, opens `RunPresetDialog`, or opens New Session pre-filled; spawns go through `spawnSession` with the task link.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T12
**Reuses**: `spawnSession` (`use-sessions.ts:82`), `openNewSession`
**Requirement**: PRST-21, PRST-26, PRST-27, PRST-28, PRST-29, PRST-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(presets): launch a picked preset`

---

### T14: Settings opens on a chosen tab

**What**: `SettingsDialog` gains `initialTab?` and a `'presets'` tab hosting `PresetsSettings`; App opens it on Presets from **Manage presets…**.
**Where**: `src/renderer/src/components/SettingsDialog.tsx` (+ App's `onManagePresets`)
**Depends on**: None (runs after Phase 3)
**Reuses**: `TABS` (`SettingsDialog.tsx:56`)
**Requirement**: PRST-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Every other opener still lands on General (NOTF-28)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(settings): open Settings on a chosen tab`

---

### T15: Presets settings tab

**What**: `PresetsSettings` listing presets with rename, move up/down, delete (with confirm), **Open presets file**, and the invalid-file state.
**Where**: `src/renderer/src/components/PresetsSettings.tsx` (+ CSS in `SettingsDialog.css`)
**Depends on**: T14
**Reuses**: Settings agent-row look (handoff §Dialog: Settings), T1 `presetNameProblem`, `agentPresets:*`
**Requirement**: PRST-36, PRST-38, PRST-39, PRST-40, PRST-41, PRST-42, PRST-43, PRST-44

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each action re-renders from the listing its channel returns; no Save step
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(presets): manage presets in Settings`

---

### T16: Agent presets smoke

**What**: `scripts/smoke-agent-presets.mjs` driving the dev app over CDP with a temp `PLAYGROUND_PRESETS_FILE` and a stub agent: save, menu (empty / list / broken / invalid file), direct spawn, Run preset (Enter, More options, task link), Settings rename/move/delete/open file.
**Where**: `scripts/smoke-agent-presets.mjs`
**Depends on**: T15
**Reuses**: `scripts/smoke-agents.mjs` (CDP harness, `.session-rail-new` selectors)
**Requirement**: PRST-10, PRST-11, PRST-12, PRST-15, PRST-16, PRST-17, PRST-18, PRST-19, PRST-20, PRST-22, PRST-24, PRST-25, PRST-26, PRST-27, PRST-28, PRST-32, PRST-33, PRST-34, PRST-35, PRST-36, PRST-37, PRST-40, PRST-41, PRST-42, PRST-43, PRST-44

**Tools**:

- MCP: NONE
- Skill: `run`

**Done when**:

- [x] Every listed AC has at least one named check; the script exits 0
- [x] The real `~/.playground/presets.json` is untouched (mtime and bytes compared before/after)
- [x] Each check seen failing once against a deliberate break before being trusted
- [x] Gate check passes: `npm test` and `node scripts/smoke-agent-presets.mjs`

**Tests**: e2e
**Gate**: full

**Commit**: `test(presets): smoke agent presets end to end`

---

### T17: Document presets

**What**: README section on agent presets: the file, its fields, Save as preset, the menu, the direct-spawn rule.
**Where**: `README.md`
**Depends on**: T16
**Reuses**: the README's prompt-files section
**Requirement**: PRST-01, PRST-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: build

**Commit**: `docs(readme): document agent presets`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 → T2 → T3 → T4 → T5
Phase 2:  T6 → T7
Phase 3:  T8 → T9 → T10 → T11 → T12 → T13
Phase 4:  T14 → T15 → T16 → T17
```

17 tasks pack into three batches of whole phases: Phases 1–2 (7 tasks), Phase 3 (6) and Phase 4 (4). At Execute the orchestrator offers batch sub-agents.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 module (types + 2 functions) | ✅ Granular |
| T2 | 2 related pure functions, 1 file | ✅ Granular |
| T3 | 2 related pure functions, 1 file | ✅ Granular |
| T4 | 1 factory, 1 file | ✅ Granular |
| T5 | 1 wiring change across contract + main | ⚠️ Cohesive (a channel is not usable half-declared) |
| T6 | 2 related pure functions | ✅ Granular |
| T7 | 1 function | ✅ Granular |
| T8 | 1 component change | ✅ Granular |
| T9 | 1 component feature | ✅ Granular |
| T10 | 1 component | ✅ Granular |
| T11 | 1 component | ✅ Granular |
| T12 | 1 component (+ prop pass-through) | ⚠️ Cohesive (AgentsView only forwards props) |
| T13 | 1 file | ✅ Granular |
| T14 | 1 component (+ the opener's one line) | ⚠️ Cohesive |
| T15 | 1 component | ✅ Granular |
| T16 | 1 script | ✅ Granular |
| T17 | 1 doc | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | — | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None (after Phase 1) | phase start | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | None (after Phase 2) | phase start | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | None (after Phase 3) | phase start | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Shared pure helpers | unit | unit | ✅ OK |
| T2 | Main store | unit | unit | ✅ OK |
| T3 | Main store | unit | unit | ✅ OK |
| T4 | Main store | unit | unit | ✅ OK |
| T5 | Thin shells | none | none | ✅ OK |
| T6 | Renderer pure lib | unit | unit | ✅ OK |
| T7 | Renderer pure lib | unit | unit | ✅ OK |
| T8 | Renderer components | none | none | ✅ OK |
| T9 | Renderer components | none | none | ✅ OK |
| T10 | Renderer components | none | none | ✅ OK |
| T11 | Renderer components | none | none | ✅ OK |
| T12 | Renderer components | none | none | ✅ OK |
| T13 | App wiring | none | none | ✅ OK |
| T14 | Renderer components | none | none | ✅ OK |
| T15 | Renderer components | none | none | ✅ OK |
| T16 | CDP smoke | e2e | e2e | ✅ OK |
| T17 | Docs | none | none | ✅ OK |
