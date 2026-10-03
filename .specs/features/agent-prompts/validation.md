# Agent Prompts Validation

**Date**: 2026-10-03
**Spec**: `.specs/features/agent-prompts/spec.md` (APR-01..36)
**Diff range**: `6d96ae4..cacdf9b` (branch `feature/agent-prompts`, 12 commits)
**Verifier**: independent sub-agent (author ≠ verifier); evidence re-derived from the spec, not from tasks.md claims

**Verdict**: FAIL ❌ (one uncovered AC branch with a surviving mutant; everything else holds)

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | - |
| T2 | ⚠️ Partial | `unreadable:` branch of APR-06 untested (Gap 1) |
| T3 | ✅ Done | - |
| T4 | ✅ Done | - |
| T5 | ✅ Done | thin shell, typecheck gate |
| T6 | ✅ Done | thin shell, typecheck gate |
| T7 | ✅ Done | - |
| T8 | ⚠️ Done, UAT pending | dialog never hand-run (node-pty not built in the worktree) |
| T9 | ✅ Done | README section |

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ test evidence matches the spec outcome · 🔍 code-verified, hand-UAT pending (renderer component / thin shell, not unit-tested per `.specs/codebase/TESTING.md`) · ❌ gap · ⚠️ spec-precision gap

### P1: Discover prompt files

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Result |
| -- | -------------------- | ---------------------------------- | ------ |
| APR-01 | one prompt per regular `*.md` (any case) file, named without extension; read when the dialog opens | `src/main/prompt-library.test.ts:25` - `toEqual([{name:'Implement',…},{name:'review',…}])` (fixture has `Implement.MD`); dialog load on mount `src/renderer/src/components/NewSessionDialog.tsx:134-136`, IPC `src/main/index.ts` `handle('prompts:list', () => listPrompts(promptsRoot))` | ✅ + 🔍 (on-open) |
| APR-02 | subfolders and other extensions ignored | `src/main/prompt-library.test.ts:25` - same `toEqual` excludes `notes.txt`, `md`, folder `nested.md` | ✅ |
| APR-03 | ascending, case-insensitive | `src/main/prompt-library.test.ts:35` - `toEqual(['Alpha','beta','Delta','gamma'])` | ✅ |
| APR-04 | UTF-8, leading BOM removed, CRLF→LF, trimmed | `src/shared/prompt-template.test.ts:72` - `toBe('line 1\nline 2')`; `:76` lone `\r` kept; `src/main/prompt-library.test.ts:40`, `:77` (UTF-8 `ação`) | ✅ (BOM strip is an equivalent mutant, see M18) |
| APR-05 | missing folder → no prompts, no error | `src/main/prompt-library.test.ts:44` - `toEqual([])` | ✅ |
| APR-06 | broken with reason `unreadable: <msg>` / `empty` / `larger than 16 KiB`; others still listed | `empty`: `src/main/prompt-library.test.ts:51`; `larger than 16 KiB`: `:62` (16385 vs exactly 16384 accepted), `:72` (bytes not chars); **`unreadable:` - no test** (code only: `src/main/prompt-library.ts:38-39`) | ❌ partial (Gap 1, mutant M17 survived) |
| APR-07 | broken prompt not selectable | `NewSessionDialog.tsx:448-451` - broken entry rendered as `<button … disabled>` with `({p.error})` | 🔍 |

### P1: Pick a prompt

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| APR-09 | Prompt field for registry agents: None + prompts, None selected on open | `NewSessionDialog.tsx:126` (`promptName` null), `:431-464` (`!isAdhoc`, None chip `selected` when `chosen === undefined`) | 🔍 |
| APR-10 | Ad-hoc hides Prompt field, spawns with no prompt | `NewSessionDialog.tsx:164-165` (`chosen` undefined when ad-hoc), `:224` (ad-hoc `onSpawn` has no prompt arg); main backstop `src/main/session-manager.test.ts:1489-1498` - ad-hoc + prompt `.rejects.toThrow()` | 🔍 + ✅ (backstop) |
| APR-11 | None = exactly the pre-feature dialog | `NewSessionDialog.tsx:228` (same `onSpawn(agent.name, cwd, undefined, link)` as removed line), `:253` (` --` only when `chosen`), `:487` (disabled rule reduces to `!canSpawn`) | 🔍 |
| APR-08 | create `~/.playground/prompts` if missing and open it | `src/main/prompt-library.test.ts:85` - `isDirectory()` `toBe(true)` (nested create), `:91` existing folder untouched; `index.ts` `prompts:openFolder` → `ensurePromptsFolder` then `shell.openPath(promptsRoot)` | ✅ + 🔍 (openPath) |

### P1: Placeholder parsing and resolution

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| APR-12 | distinct names, first-appearance order, pattern `[A-Za-z][A-Za-z0-9_]*` | `src/shared/prompt-template.test.ts:25` - `toEqual(['branch','taskId','worktree'])`; `:29` digits/underscore | ✅ |
| APR-13 | non-matching `{{…}}` literal, no name | `src/shared/prompt-template.test.ts:33` - `toEqual([])` for `{{ x }} {{1a}} {{}} …`; `:66` resolve leaves them | ✅ |
| APR-14 | every occurrence replaced; other text and line breaks unchanged | `src/shared/prompt-template.test.ts:48` - `toBe('- branch: feat/x\n\n  again feat/x / 42\r\nend')` | ✅ |
| APR-15 | value containing `{{name}}` inserted literally | `src/shared/prompt-template.test.ts:54` - `toBe('{{b}} and B')`; `:58` `$&` patterns literal | ✅ |
| APR-16 | case-sensitive names | `src/shared/prompt-template.test.ts:37` - `toEqual(['Branch','branch'])`; `:62` `toBe('A/b')` | ✅ |

### P1: Variables form

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| APR-17 | primary button reads **Next** with ≥1 placeholder | `NewSessionDialog.tsx:170` (`needsStep2`), `:474-482` | 🔍 |
| APR-18 | step 2: one labelled single-line field per placeholder in parse order + Back | `NewSessionDialog.tsx:274-288` (`names.map`, `<input>`, label `{{name}}`), `:293-295` Back | 🔍 |
| APR-19 | `branch` = worktree branch, `worktree` = cwd | `src/renderer/src/lib/prompt-form.test.ts:41-42`, `:65` - `toEqual({…branch:'user/otavio/123-fix-login', worktree:'C:\\src\\app-123'})`; `:105` prefill | ✅ |
| APR-20 | `taskId`/`taskTitle` from hand-picked task, else branch-derived + pin title | `prompt-form.test.ts:49-50` (`77`,`'Picked'`), `:57` (pin fallback), `:65` (derived `123`,`'Fix login'`), `:105` (`taskId:'123'`) | ✅ |
| APR-21 | unknown context value → empty field | `prompt-form.test.ts:74` (detached → nulls), `:84-85` (workspace), `:90-91` (no cached title), `:114` - `toEqual({taskId:'',taskTitle:'',branch:''})` | ✅ |
| APR-22 | prefilled editable; non-context names start empty | `prompt-form.test.ts:122` - `toEqual({goal:'',Branch:''})`; editability `NewSessionDialog.tsx:282-285` (`onChange` → `setTyped`) | ✅ + 🔍 |
| APR-23 | Spawn disabled while any field empty after trim | `prompt-form.test.ts:145` - `emptyFields:['c','b']` (whitespace counts empty), `:152`; wired `NewSessionDialog.tsx:175`, `:302` | ✅ + 🔍 |
| APR-25 | Will run shows command line then live resolved prompt | `NewSessionDialog.tsx:248-258` (`{willRun} --`, `<pre>{resolved}</pre>`, recomputed each render from `typed`) | 🔍 |
| APR-26 | >8000 → Spawn disabled + "Prompt too long (<n> / 8000 characters)" | `prompt-form.test.ts:156` - `tooLong` `toBe(8001)`, `:160` exactly 8000 `toBeNull()`; message `NewSessionDialog.tsx:260-264` (literal matches spec); main backstop `session-manager.test.ts:1485-1486` (8000 accepted), `:1489-1498` (8001 rejected) | ✅ + 🔍 (message) |
| APR-27 | Back keeps step-1 state; Next again restores typed values | `prompt-form.test.ts:129` - `carryValues(typed,…)` `toEqual(typed)`; `NewSessionDialog.tsx:293` Back only `setStep(1)` | ✅ + 🔍 |
| APR-28 | new prompt drops values of names it lacks, keeps shared | `prompt-form.test.ts:134` - `toEqual({goal:'ship it', taskId:'123', scope:''})` (`branch`,`notes` dropped); `NewSessionDialog.tsx:179-186` | ✅ + 🔍 |
| APR-29 | no placeholders → Spawn, no step 2, Will run shows prompt text | `NewSessionDialog.tsx:170`, `:256` (`!needsStep2` shows `<pre>`), `:483-492` | 🔍 |

### P1: Spawn with the resolved prompt

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| APR-30 | `command args -- <prompt>` as one final arg | `src/main/spawn-plan.test.ts:136` - `toBe(MOVE_PROMPT + '& claude --model opus -- $p')`; `:179` real pwsh run `argv: ['--', prompt]`; `session-manager.test.ts:1461+` | ✅ |
| APR-24 | prompt reaches an executable agent byte-identical, one argument, full char set incl. newline and `ã`, whatever the default shell | `src/main/spawn-plan.test.ts:179` - real `pwsh` → `node` echo: `toEqual({ argv: ['--', prompt], envPrompt: null })`, prompt has `' " $ \` % ^ & \| < > ( ) ; # @ { } ação` + `\n`; shell-independence via APR-36 test | ✅ (note: launched with `child_process.spawn`, not node-pty) |
| APR-31 | prompt still last, after `--settings <file>` | `src/main/session-manager.test.ts:1464-1466` - `toBe(MOVE_PROMPT + '& claude --settings C:\\app\\hooks.json -- $p')` | ✅ |
| APR-32 | interactive, same keep-shell-live | `src/main/spawn-plan.test.ts:129` - `args` `toEqual(['-NoExit','-Command',…])` | ✅ |
| APR-33 | Respawn/Duplicate carry no prompt | `src/main/session-manager.test.ts:1514-1516` - `cmd.exe`, `not.toHaveProperty('PLAYGROUND_PROMPT')`; `:1526-1528` duplicate `envs[1]` `toBeUndefined()` | ✅ |
| APR-34 | prompt text and name not written to config | `src/main/session-manager.test.ts:1535` - exact persisted row `toEqual`; `:1538` `not.toContain('line 2 ação')` | ✅ |
| APR-36 | prompted launch hosted in pwsh whatever the default shell | `src/main/session-manager.test.ts:1446-1458` - `defaultShell:'cmd'` → plan `file:'pwsh.exe'`, env `{PLAYGROUND_PROMPT: PROMPT}` | ✅ |
| APR-35 | spawn sends the text shown in Will run | `NewSessionDialog.tsx:173` (`resolved` from in-memory template), `:227` (`onSpawn(…, resolved)`), `:256` (same `resolved` previewed); main never re-reads the file | 🔍 |

**Status**: 36 ACs: 21 with matching test evidence (some also code-verified at the binding), 14 code-verified/hand-UAT pending (component / thin shell, by convention), **1 partial gap (APR-06 `unreadable:`)**.

### Adjudication of author-reported gaps

| # | Author claim | Verifier ruling |
| - | ------------ | --------------- |
| a | APR-06 `unreadable:` untested, "no portable way on Windows" | **Upheld as a gap, claim rejected.** The OS failure is not needed: `vi.mock('node:fs/promises', …)` with `importOriginal` can make `readFile` reject for one path. Mutant M17 (reason text changed) survives. Fix task below. |
| b | BOM removal indistinguishable from `trim()` | **Accepted.** `String.prototype.trim` removes U+FEFF, so `replace(/^\uFEFF/,'')` is unobservable; M18 is an equivalent mutant, not a weak test. |
| c | SessionManager rejection messages unspecified | **Accepted, spec-precision gap (non-blocking).** The spec only fixes the renderer message (APR-26); `session-manager.test.ts:1498` asserts `.rejects.toThrow()` plus no spawn/persist, which is all the spec defines. |
| d | Dialog never hand-run | **Accepted as convention**, but 14 ACs rest on code reading only; hand-UAT of the dialog is required before merge. |

### Additional finding

- **Spec deviation (Assumptions row "Value whitespace: A value is trimmed")**: the dialog resolves with raw typed values (`NewSessionDialog.tsx:172-173`; `carryValues` returns `prev[name]` untrimmed), so ` feat/x ` is inserted with its spaces. Only emptiness uses `trim()` (`prompt-form.ts:81`). The preview shows the same text that is sent, so APR-35 still holds. The rule is in the Assumptions table, not in a numbered AC, so no test covers it either way.

---

## Discrimination Sensor

Scratch: `git worktree add M:/obogoni/verify-scratch-agent-prompts HEAD` + `npm ci --ignore-scripts` (real `node_modules`, no junction). Each mutation applied alone, the listed test files run with `npx vitest run`, file restored. Unmutated baseline: 5 files, 166 tests passed.

| # | File | Mutation | Tests run | Killed? |
| - | ---- | -------- | --------- | ------- |
| M1 | `src/shared/prompt-template.ts:40` | resolvePrompt rescans: sequential `split/join` per value | prompt-template | ✅ Killed (1 failed) |
| M2 | `src/shared/prompt-template.ts:31` | parsePlaceholders without dedupe | prompt-template, prompt-form | ✅ Killed |
| M3 | `src/shared/prompt-template.ts:32` | names sorted instead of first-appearance | prompt-template | ✅ Killed |
| M4 | `src/main/prompt-library.ts:14` | `.md` filter case-sensitive | prompt-library | ✅ Killed |
| M5 | `src/main/prompt-library.ts:27` | ordinal sort instead of `localeCompare` base | prompt-library | ✅ Killed |
| M6 | `src/main/spawn-plan.ts:110` | `--` dropped from the call | spawn-plan, session-manager | ✅ Killed (6 failed, incl. real pwsh) |
| M7 | `src/main/spawn-plan.ts:111` | `Remove-Item Env:PLAYGROUND_PROMPT` dropped | spawn-plan, session-manager | ✅ Killed (6 failed) |
| M8 | `src/main/session-manager.ts:397` | prompted launch uses cmd when `defaultShell=cmd` | session-manager | ✅ Killed |
| M9 | `src/main/session-manager.ts:91` | accepts 8001 chars (`> MAX + 1`) | session-manager | ✅ Killed |
| M10 | `src/main/session-manager.ts:411` | `PLAYGROUND_PROMPT` not added to env | session-manager | ✅ Killed (3 failed) |
| M11 | `src/main/session-manager.ts:398` | prompt plan built from un-hooked agent (no `--settings`) | session-manager | ✅ Killed |
| M12 | `src/main/session-manager.ts:286` | respawn passes a prompt | session-manager | ✅ Killed (2 failed) |
| M13 | `src/main/session-manager.ts:90` | blank-prompt guard removed | session-manager | ✅ Killed |
| M14 | `src/renderer/src/lib/prompt-form.ts:82` | `>` → `>=` at 8000 | prompt-form | ✅ Killed |
| M15 | `src/renderer/src/lib/prompt-form.ts:69` | carryValues keeps dropped names (`...prev`) | prompt-form | ✅ Killed |
| M16 | `src/renderer/src/lib/prompt-form.ts:32` | chip-derived task id wins over hand-picked | prompt-form | ✅ Killed (2 failed) |
| M17 | `src/main/prompt-library.ts:39` | reason `unreadable: <message>` → `'unreadable'` | prompt-library | ❌ **Survived** (10/10 passed) → Fix 1 |
| M18 | `src/shared/prompt-template.ts:48` | BOM `replace` removed | prompt-template, prompt-library | ➖ Survived, **equivalent mutant** (`trim()` strips U+FEFF) |

**Sensor depth**: P0-style (≥5, core path): 18 injected, 16 killed, 1 real survivor (M17), 1 equivalent (M18).
**Isolation**: real tree `git status --porcelain` empty before and after; scratch removed with `git worktree remove --force` after confirming no junctions.
**Result**: FAIL ❌ (M17)

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes (21 files, all within the design's component list) | ✅ |
| No scope creep | ✅ |
| Matches patterns (workflow discovery semantics, `quotePwsh`, `handle()`, async `rm` teardown) | ✅ |
| Spec-anchored outcome check | ⚠️ APR-06 `unreadable:` unasserted |
| Per-layer Coverage Expectation (TESTING.md / tasks.md matrix) | ⚠️ main deep module `prompt-library` misses one failure path |
| Every test maps to an AC / edge case / Done-when | ✅ (constant pins map to L-009; `$&` test maps to APR-15's "literal") |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, tasks.md Test Coverage Matrix | ✅ |

---

## Edge Cases

- [x] Missing folder (APR-05) - tested
- [ ] Unreadable file (APR-06) - code present, untested (Gap 1)
- [x] Empty / whitespace-only / oversized file (APR-06) - tested, incl. byte-vs-char bound
- [x] Over-long resolved prompt (APR-26) - tested at 8000/8001 in renderer lib and main
- [x] File changed mid-dialog (APR-35) - code-verified (renderer sends its own resolved text)
- [x] Prompt switch after Back (APR-28) - tested

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (real tree, `cacdf9b`)
- **typecheck**: exit 0 (node + web)
- **lint**: exit 0, 0 errors, 18 warnings, none in feature files (`scripts/…`, `src/shared/tasks.test.ts`)
- **npm test**: 122 files / 2563 tests: 2560 passed, 3 failed, 0 skipped
- **Failures**: `file-discard.test.ts` (FDSC-05), `git-sync.test.ts` (readCommits cap), `worktree-manager.test.ts` (removeWorktree): all in the known machine-local real-git/timeout set, untouched by this diff
- **Test delta**: +53 test cases added (`it`/`it.each`, 55 tests at runtime), 0 removed; no existing assertion weakened (session-manager diff only adds a `describe`)

---

## Fix Plans

### Fix 1: Cover the `unreadable:` reason of APR-06 (Major)

- **Root cause**: no test makes `readFile` fail; the author assumed only an OS-level failure would do.
- **Fix task**: in `src/main/prompt-library.test.ts`, mock `node:fs/promises` with `importOriginal` so `readFile` rejects (e.g. `Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })`) for one fixture path. Assert `listPrompts` returns `{ name, error: 'unreadable: EACCES: permission denied' }` with the other prompts still listed.
- **Verify**: `npx vitest run src/main/prompt-library.test.ts`; re-inject M17 → must be killed.

### Fix 2: Settle the "value is trimmed" assumption (Minor)

- **Root cause**: the spec's Assumptions row says a value is trimmed. No numbered AC carries the rule, and the dialog inserts untrimmed values.
- **Fix task**: either trim values before `resolvePrompt` (in `prompt-form.ts`, with a test) or amend the Assumptions row to "only emptiness is judged after trimming". Then lift the chosen rule into an AC.

### Hand-UAT (required, not a code fix)

Run the dialog once (node-pty built): APR-07/09/10/11/17/18/25/26-message/27/29/35, Open prompts folder (APR-08), and a real two-line prompt reaching `claude`.

---

## Requirement Traceability Update

| Requirement | New Status |
| ----------- | ---------- |
| APR-01..05, APR-08, APR-12..16, APR-19..24, APR-26..28, APR-30..34, APR-36 | ✅ Verified (component parts pending UAT where marked 🔍) |
| APR-06 | ❌ Needs Fix (`unreadable:` branch) |
| APR-07, APR-09..11, APR-17, APR-18, APR-25, APR-29, APR-35 | 🔍 Code-verified, hand-UAT pending |

---

## Summary

**Overall**: ❌ Not Ready (one small fix + hand-UAT)

**Spec-anchored check**: 35/36 ACs matched (21 by tests, 14 by code reading per convention); 1 partial gap (APR-06); 1 spec-precision gap (main rejection messages); 1 spec deviation (value trim)
**Sensor**: 16/17 non-equivalent mutants killed (M17 survived; M18 equivalent)
**Gate**: typecheck ✅, lint ✅, tests 2560 passed / 3 known machine-local failures

**What works**: discovery/sorting/bounds, parse/resolve (single-pass, case-sensitive), env-carried pwsh delivery with `--` and env scrub (proven by a real pwsh process), SessionManager guards, Respawn/Duplicate without a prompt, nothing persisted, form rules.

**Next steps**: Fix 1, decide Fix 2, then hand-UAT and re-verify.
