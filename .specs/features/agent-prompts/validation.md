# Agent Prompts Validation

**Date**: 2026-10-03
**Spec**: `.specs/features/agent-prompts/spec.md` (APR-01..37)
**Diff range**: `6d96ae4..80b32ae` (branch `feature/agent-prompts`, 16 commits); re-verification iteration 2 of 3
**Verifier**: independent sub-agent (author ≠ verifier); evidence re-derived from the spec, not from tasks.md claims

**Verdict**: PASS ✅ (both iteration-1 gaps closed and proven by killed mutants; 15 ACs code-verified with hand-UAT still pending, per convention)

---

## Iteration-1 gaps: re-check

| # | Iteration-1 gap | Fix | Re-derived evidence | Status |
| - | --------------- | --- | ------------------- | ------ |
| 1 | APR-06 `unreadable:` reason untested (M17 survived) | `6f9ea7c`: `listPrompts(root, fs: PromptFs = NODE_FS)` (`src/main/prompt-library.ts:26`), production default unchanged (`:23`, `index.ts` still calls `listPrompts(promptsRoot)`) | `src/main/prompt-library.test.ts:89-92` - `toEqual([{ name: 'locked', error: 'unreadable: EACCES: permission denied' }, { name: 'ok', template: 'Go.' }])`; readdir/stat stay real | ✅ Closed, M17 now killed |
| 2 | Assumption "a value is trimmed" not implemented | `bc04e83`: `resolveForm` trims every value then calls `resolvePrompt` (`src/renderer/src/lib/prompt-form.ts:87-90`); dialog previews and spawns through it (`NewSessionDialog.tsx:172`, `:226`, `:255`); rule lifted to APR-37 | `src/renderer/src/lib/prompt-form.test.ts:167-173` - `toBe('Review feature/x for #42: two  words.')` (outer spaces/tab gone, inner double space kept) | ✅ Closed, trim mutant T1 killed |

The fix uses an injected seam rather than `vi.mock`, which matches `.specs/codebase/TESTING.md` ("no `vi.mock`; fakes are hand-rolled and injected").

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | - |
| T2 | ✅ Done | `unreadable:` branch now covered by T10. tasks.md line 111 still carries the old "gap" note (stale text only) |
| T3 | ✅ Done | - |
| T4 | ✅ Done | - |
| T5 | ✅ Done | thin shell, typecheck gate |
| T6 | ✅ Done | thin shell, typecheck gate |
| T7 | ✅ Done | - |
| T8 | ⚠️ Done, UAT pending | dialog not hand-run |
| T9 | ✅ Done | README section |
| T10 | ✅ Done | Fix 1 |
| T11 | ✅ Done | Fix 2 |

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ test evidence matches the spec outcome · 🔍 code-verified, hand-UAT pending (renderer component or thin shell; these are not unit-tested by convention, `.specs/codebase/TESTING.md` "What is deliberately NOT unit-tested") · ❌ gap · ⚠️ spec-precision gap

### P1: Discover prompt files

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Result |
| -- | -------------------- | ---------------------------------- | ------ |
| APR-01 | one prompt per regular `*.md` (any case) file, named without the extension; read when the dialog opens | `src/main/prompt-library.test.ts:25` - `toEqual([{name:'Implement',…},{name:'review',…}])` (fixture `Implement.MD`); read-on-open `NewSessionDialog.tsx:133-135`, IPC `src/main/index.ts` `handle('prompts:list', () => listPrompts(promptsRoot))` | ✅ + 🔍 (on open) |
| APR-02 | subfolders and other extensions ignored | `src/main/prompt-library.test.ts:25` - same `toEqual` excludes `notes.txt`, `md`, folder `nested.md` | ✅ |
| APR-03 | ascending, case-insensitive | `src/main/prompt-library.test.ts:35` - `toEqual(['Alpha','beta','Delta','gamma'])` | ✅ |
| APR-04 | UTF-8, leading BOM removed, CRLF→LF, trimmed | `src/shared/prompt-template.test.ts:72` - `toBe('line 1\nline 2')`; `:76` inner whitespace and lone `\r` kept; `src/main/prompt-library.test.ts:40` (file with BOM+CRLF), `:77` UTF-8 `Configuração de ação` | ✅ (BOM `replace` is an equivalent mutant: `trim()` removes U+FEFF) |
| APR-05 | missing folder → no prompts, no error | `src/main/prompt-library.test.ts:44` - `toEqual([])` | ✅ |
| APR-06 | broken with reason `unreadable: <msg>` / `empty` / `larger than 16 KiB`; others still listed | `unreadable:` `src/main/prompt-library.test.ts:89-92`; `empty` `:51-55` (empty and whitespace-only, `ok` still listed); `larger than 16 KiB` `:62-66` (16385 broken, exactly 16384 accepted), `:72` (bytes, not characters) | ✅ |
| APR-07 | broken prompt not selectable | `NewSessionDialog.tsx:447-450` - broken entry is a `disabled` button showing `({p.error})`; `chosen` only matches entries with `template` (`:165-167`) | 🔍 |

### P1: Pick a prompt

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| APR-09 | Prompt field for registry agents: None + prompts, None selected on open | `NewSessionDialog.tsx:125` (`promptName` starts null), `:430-464` (`!isAdhoc`; None chip `selected` when `chosen === undefined`, then `prompts.map`) | 🔍 |
| APR-10 | Ad-hoc hides the Prompt field and spawns with no prompt | `NewSessionDialog.tsx:163-164` (`chosen` undefined for ad-hoc), `:223` (ad-hoc `onSpawn` has no prompt); main backstop `src/main/session-manager.test.ts:1496-1503` - ad-hoc + prompt `.rejects.toThrow()`, no handle, nothing persisted | 🔍 + ✅ (backstop) |
| APR-11 | None behaves exactly as before | `NewSessionDialog.tsx:227` (`onSpawn(agent.name, cwd, undefined, link)`), `:252` (` --` only with `chosen`), `:486` (disabled rule reduces to `!canSpawn`) | 🔍 |
| APR-08 | create `~/.playground/prompts` if missing, open it | `src/main/prompt-library.test.ts:100` - `isDirectory()` `toBe(true)` (nested create), `:106` existing folder and files untouched; `index.ts` `prompts:openFolder` → `ensurePromptsFolder` then `shell.openPath(promptsRoot)` | ✅ + 🔍 (openPath) |

### P1: Placeholder parsing and resolution

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| APR-12 | distinct names, first-appearance order, `[A-Za-z][A-Za-z0-9_]*` | `src/shared/prompt-template.test.ts:25` - `toEqual(['branch','taskId','worktree'])`; `:29` digits/underscore | ✅ |
| APR-13 | non-matching `{{…}}` literal, no name | `src/shared/prompt-template.test.ts:33` - `toEqual([])` for `{{ x }} {{1a}} {{}} {{_a}} {{a-b}} …`; `:66` resolve leaves them as text | ✅ |
| APR-14 | every occurrence replaced; other text and line breaks unchanged | `src/shared/prompt-template.test.ts:48` - `toBe('- branch: feat/x\n\n  again feat/x / 42\r\nend')` | ✅ |
| APR-15 | value containing `{{name}}` inserted literally | `src/shared/prompt-template.test.ts:54` - `toBe('{{b}} and B')`; `:58` `$&`-style patterns literal | ✅ |
| APR-16 | case-sensitive names | `src/shared/prompt-template.test.ts:37` - `toEqual(['Branch','branch'])`; `:62` `toBe('A/b')` | ✅ |

### P1: Variables form

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| APR-17 | primary button reads **Next** with ≥1 placeholder | `NewSessionDialog.tsx:169` (`needsStep2`), `:473-481` | 🔍 |
| APR-18 | step 2: one labelled single-line field per placeholder in parse order, plus Back | `NewSessionDialog.tsx:273-287` (`names.map`, `<input>`, label `{{name}}`), `:292-294` Back | 🔍 |
| APR-19 | `branch` = worktree branch, `worktree` = cwd | `src/renderer/src/lib/prompt-form.test.ts:42-43`, `:66` - `toEqual({…, branch:'user/otavio/123-fix-login', worktree:'C:\\src\\app-123'})`; `:106` prefill | ✅ |
| APR-20 | `taskId`/`taskTitle` from the hand-picked task, else branch-derived, title from the pin | `prompt-form.test.ts:50-51` (`77`, `'Picked'`), `:58` (pin fallback `'Cached title'`), `:66` (derived `123`, `'Fix login'`), `:106` (`taskId:'123'`) | ✅ |
| APR-21 | unknown context value → empty field | `prompt-form.test.ts:75` (detached → nulls), `:85-86` (workspace), `:91-92` (no cached title), `:115` - `toEqual({taskId:'',taskTitle:'',branch:''})` | ✅ |
| APR-22 | pre-filled fields editable; non-context names start empty | `prompt-form.test.ts:123` - `toEqual({goal:'',Branch:''})`; editability `NewSessionDialog.tsx:281-284` (`onChange` → `setTyped`) | ✅ + 🔍 |
| APR-23 | Spawn disabled while any field is empty after trimming | `prompt-form.test.ts:146` - `emptyFields:['c','b']` (whitespace-only counts empty), `:153`; wired `NewSessionDialog.tsx:174`, `:301` | ✅ + 🔍 |
| APR-25 | Will run: command line then the live resolved prompt | `NewSessionDialog.tsx:247-256` (`{willRun} --`, `<pre>{resolved}</pre>`, recomputed every render from `typed`) | 🔍 |
| APR-26 | >8000 → Spawn disabled + "Prompt too long (<n> / 8000 characters)" | `prompt-form.test.ts:157` - `tooLong` `toBe(8001)`, `:161` exactly 8000 `toBeNull()`; message `NewSessionDialog.tsx:259-263` (text matches the spec); main backstop `session-manager.test.ts:1485-1486` (8000 accepted), `:1496-1503` (8001 rejected) | ✅ + 🔍 (message) |
| APR-37 | each value trimmed before substitution, inner whitespace kept | `prompt-form.test.ts:167-173` - `toBe('Review feature/x for #42: two  words.')`; dialog uses `resolveForm` for preview and spawn `NewSessionDialog.tsx:172` | ✅ + 🔍 (binding) |
| APR-27 | Back keeps step 1; Next again restores typed values | `prompt-form.test.ts:130` - `carryValues(typed,…)` `toEqual(typed)`; `NewSessionDialog.tsx:292` Back only `setStep(1)` | ✅ + 🔍 |
| APR-28 | new prompt drops values of names it lacks, keeps shared ones | `prompt-form.test.ts:135` - `toEqual({goal:'ship it', taskId:'123', scope:''})` (`branch`, `notes` dropped); `NewSessionDialog.tsx:178-185` | ✅ + 🔍 |
| APR-29 | no placeholders → Spawn, no step 2, Will run shows the prompt | `NewSessionDialog.tsx:169`, `:255` (`!needsStep2` shows `<pre>`), `:482-491` | 🔍 |

### P1: Spawn with the resolved prompt

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| APR-30 | `command args -- <prompt>`, prompt one final argument | `src/main/spawn-plan.test.ts:136` - `toBe(MOVE_PROMPT + '& claude --model opus -- $p')`; `:179` real pwsh run `argv: ['--', prompt]` | ✅ |
| APR-24 | prompt reaches an executable agent as one byte-identical argument (full char set, line break, `ã`) whatever the default shell | `src/main/spawn-plan.test.ts:179` - real `pwsh` → `node` echo: `toEqual({ argv: ['--', prompt], envPrompt: null })`, prompt holds `' " $ \` % ^ & \| < > ( ) ; # @ { } ação` + `\n`; shell independence via APR-36 (`session-manager.test.ts:1452`) | ✅ (launched with `child_process.spawn`, not node-pty) |
| APR-31 | prompt still last, after `--settings <file>` | `src/main/session-manager.test.ts:1466` - `toBe(MOVE_PROMPT + '& claude --settings C:\\app\\hooks.json -- $p')` | ✅ |
| APR-32 | interactive, same keep-shell-live | `src/main/spawn-plan.test.ts:129` - `args` `toEqual(['-NoExit','-Command',…])` | ✅ |
| APR-33 | Respawn/Duplicate carry no prompt | `src/main/session-manager.test.ts:1514-1516` (`cmd.exe`, `not.toHaveProperty('PLAYGROUND_PROMPT')`); `:1526-1528` duplicate `envs[1]` `toBeUndefined()` | ✅ |
| APR-34 | prompt text and name not written to config | `src/main/session-manager.test.ts:1535` - exact persisted row `toEqual`; `:1538` `not.toContain('line 2 ação')` | ✅ |
| APR-36 | prompted launch hosted in pwsh whatever the default shell | `src/main/session-manager.test.ts:1452-1458` - `defaultShell:'cmd'` → plan `file:'pwsh.exe'`, env `{PLAYGROUND_PROMPT: PROMPT}` | ✅ |
| APR-35 | spawn sends the text shown in Will run | `NewSessionDialog.tsx:172` (`resolved` from the in-memory template), `:226` (`onSpawn(…, resolved)`), `:255` (same `resolved` previewed); main never re-reads the file | 🔍 |

**Status**: 37 ACs. 22 have matching test evidence (some also code-verified at the binding), 15 are code-verified with hand-UAT pending (component or thin shell, by convention), 0 gaps.

### Spec-precision gap (carried over, non-blocking)

- ⚠️ SessionManager's backstop rejections (ad-hoc + prompt, blank prompt, >8000) have no spec-defined message. `session-manager.test.ts:1498` asserts `.rejects.toThrow()` plus no spawn and nothing persisted (`:1500-1503`), which is everything the spec defines. The user-facing message (APR-26) is the renderer's.

### Other notes

- APR-37 trimming is applied to the values `formBlockers` judges and to the text that is resolved. A value that is whitespace-only therefore both blocks Spawn (APR-23) and would resolve to empty, so the two rules agree.
- Spec Assumptions row "a value may not contain a line break": met by construction, because the fields are `<input>` elements (single-line) at `NewSessionDialog.tsx:276`. 🔍

---

## Discrimination Sensor

Scratch: `git worktree add --detach M:/obogoni/verify2-agent-prompts HEAD` + `npm ci --ignore-scripts` (real `node_modules`, no junctions). Each mutation was applied alone with an exact single-match string replace. The listed test files ran with `npx vitest run`, then the file was restored with `git checkout`. Unmutated baseline: the 5 feature test files, 168 tests passed.

| # | File | Mutation | Tests run | Killed? |
| - | ---- | -------- | --------- | ------- |
| M17 (re-run) | `src/main/prompt-library.ts:48` | reason `` `unreadable: ${message}` `` → `'unreadable'` | prompt-library | ✅ Killed (1 failed: the APR-06 unreadable test) |
| T1 (trim) | `src/renderer/src/lib/prompt-form.ts:88` | `resolveForm` drops `.trim()` (`[name, v]`) | prompt-form | ✅ Killed (APR-37 test) |
| F1 | `src/renderer/src/lib/prompt-form.ts:81` | `formBlockers` judges emptiness without `trim()` | prompt-form | ✅ Killed (APR-23 test) |
| F2 | `src/renderer/src/lib/prompt-form.ts:37` | `taskTitle` loses the pin fallback (`?? null`) | prompt-form | ✅ Killed (2 APR-20 tests) |
| F3 | `src/main/prompt-library.ts:42` | size bound `>` → `>=` 16384 | prompt-library | ✅ Killed (APR-06 16 KiB test) |
| F4 | `src/main/prompt-library.ts:31` | missing folder rethrows instead of `[]` | prompt-library | ✅ Killed (APR-05 test) |
| F5 | `src/main/session-manager.ts:89` | ad-hoc + prompt guard removed | session-manager | ✅ Killed (ad-hoc rejection case) |
| F6 | `src/renderer/src/lib/prompt-form.ts:70` | `carryValues` lets context values win over typed ones | prompt-form | ✅ Killed (APR-27 test) |
| F7 | `src/main/spawn-plan.ts:110` | agent `args` dropped from the prompted call | spawn-plan, session-manager | ✅ Killed (5 failed, including the real pwsh run) |

Iteration-1 mutants M1-M16 were killed against code that this iteration did not change (`git diff 649d9dc..80b32ae` touches only `prompt-library.ts` (fs injection) and `prompt-form.ts` (`resolveForm`) plus the dialog binding). M18 (BOM `replace` removed) stays an equivalent mutant.

**Sensor depth**: P0-style (≥5, core path), 9 injected this iteration.
**Isolation**: real tree `git status --porcelain` was empty before and after; the scratch had no junctions (`dir /AL /S` empty) and was removed with `git worktree remove --force`; `git worktree list` shows only the two original checkouts.
**Result**: 9/9 killed - PASS ✅

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code (the `PromptFs` seam has three members, exactly what `listPrompts` calls) | ✅ |
| Surgical changes (fix commits touch only `prompt-library.ts`, `prompt-form.ts`, the dialog's resolve call, their tests and spec/tasks) | ✅ |
| No scope creep | ✅ |
| Matches patterns (injected fake, no `vi.mock`, per TESTING.md; async `rm` teardown) | ✅ |
| Spec-anchored outcome check | ✅ (1 carried-over non-blocking spec-precision gap) |
| Per-layer Coverage Expectation (TESTING.md and the tasks.md matrix: main deep module and pure helpers unit-tested, renderer and shells hand-verified) | ✅ |
| Every test maps to an AC / edge case / Done-when | ✅ (constant pins map to T1 Done-when; the `$&` test maps to APR-15 "literally") |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, tasks.md Test Coverage Matrix | ✅ |

---

## Edge Cases

- [x] Missing folder (APR-05): tested
- [x] Unreadable file (APR-06): tested through the injected `readFile`
- [x] Empty, whitespace-only and oversized file (APR-06): tested, including the byte-vs-character bound
- [x] Over-long resolved prompt (APR-26): tested at 8000/8001 in the renderer lib and in main
- [x] File changed mid-dialog (APR-35): code-verified (the renderer sends its own resolved text)
- [x] Prompt switch after Back (APR-28): tested
- [x] Values with surrounding whitespace (APR-37): tested

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (real tree, `80b32ae`)
- **typecheck**: exit 0 (node + web)
- **lint**: exit 0, 0 errors, 18 warnings, none in feature files (`scripts/fixtures/…/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`)
- **npm test**: 122 files / 2565 tests: 2558 passed, 7 failed, 0 skipped
- **Failures** (all in the known machine-local real-git/timeout set, none touched by this diff): `commit-log.test.ts` (1), `file-discard.test.ts` (FDSC-05), `git-sync.test.ts` (2), `hook-shell.test.ts` (2), `worktree-manager.test.ts` (1). All five feature test files passed.
- **Test delta**: 2563 → 2565 since iteration 1 (+1 APR-06 unreadable, +1 APR-37), 0 removed, no assertion weakened.

---

## Fix Plans

No code fixes are required.

### Hand-UAT (required before merge, not a code fix)

Run the dialog once with node-pty built and check APR-07/09/10/11/17/18/25/26 (message)/27/29/35/37 (preview shows trimmed values), Open prompts folder (APR-08), and a real two-line prompt reaching `claude`.

### Housekeeping (cosmetic)

- tasks.md line 111 (T2) still says the `unreadable:` branch "has no test". T10 closed it.
- spec.md traceability still lists every requirement as "Implementing". Update it per the table below.

---

## Requirement Traceability Update

| Requirement | New Status |
| ----------- | ---------- |
| APR-01..06, APR-08, APR-12..16, APR-19..24, APR-26..28, APR-30..34, APR-36, APR-37 | ✅ Verified (component parts pending UAT where marked 🔍) |
| APR-07, APR-09..11, APR-17, APR-18, APR-25, APR-29, APR-35 | 🔍 Code-verified, hand-UAT pending |

---

## Summary

**Overall**: ✅ Ready (hand-UAT of the dialog still pending, per convention)

**Spec-anchored check**: 37/37 ACs matched (22 by tests, 15 by code reading per convention); 0 gaps; 1 carried-over non-blocking spec-precision gap (main rejection messages)
**Sensor**: 9/9 killed (M17 and the trim mutant included)
**Gate**: typecheck ✅, lint ✅, tests 2558 passed / 7 known machine-local failures

**What works**: discovery, sorting and bounds including the unreadable reason; single-pass, case-sensitive parse and resolve; trimmed form values; prompt delivery through the pwsh env with `--` and env scrub, proven by a real pwsh process; SessionManager guards; Respawn and Duplicate without a prompt; nothing persisted.

**Next steps**: hand-UAT the dialog, then update spec traceability and merge.
