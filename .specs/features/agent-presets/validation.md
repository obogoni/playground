# Validation: agent-presets - PASS ✅

**Date**: 2026-10-14
**Spec**: `.specs/features/agent-presets/spec.md` (PRST-01..44 + 4 Edge Cases)
**Diff range**: `27f09c8..HEAD` (branch `feature/agent-presets`, HEAD `7ac02b0`; 27f09c8 = planning docs)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero

Verdict: PASS. Every AC has `file:line` evidence that targets the spec's own outcome; 12/12 mutants killed; gates at the known baseline; smoke 52/52. Three spec-precision gaps are flagged below. All are Minor and none blocks the feature.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T17 | ✅ Done | All `Done when` boxes ticked in `tasks.md` (0 unchecked). Commits `48223bc..7ac02b0` match the task commit lines. |

---

## Spec-Anchored Acceptance Criteria

Paths: `S` = `src/shared/agent-presets.test.ts`, `ST` = `src/main/agent-preset-store.test.ts`, `PL` = `src/renderer/src/lib/preset-launch.test.ts`, `SM` = `scripts/smoke-agent-presets.mjs` (CDP smoke, run 52/52 this session).

### P1: Store

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Result |
| -- | -------------------- | ---------------------------------- | ------ |
| PRST-01 | Entries returned in array order | `src/main/agent-preset-store.test.ts:42` `expect(classifyEntries([fixer, reviewer])).toEqual([ok fixer, ok reviewer])`; `src/main/agent-preset-store.test.ts:280` store `list()` `toEqual({ ok:true, entries:[Folder, Missing, Broken, File] })` | ✅ |
| PRST-02 | Missing file → no presets, no error | `src/main/agent-preset-store.test.ts:271` `expect(await store().list()).toEqual({ ok: true, entries: [] })` | ✅ |
| PRST-03 | `invalid JSON: <parser message>` / `not an array`, no presets | `src/main/agent-preset-store.test.ts:24` `reason.startsWith('invalid JSON: ')` + length > prefix; `:29` `toEqual({ ok:false, reason:'not an array' })` for `{}` and `"x"`; `:275` store `list()` → `{ ok:false, reason:'not an array' }` | ✅ (parser message asserted non-empty, not literal: runtime-dependent, acceptable) |
| PRST-04 | Broken entry `invalid entry: <field>`, others still listed | `src/main/agent-preset-store.test.ts:53` `toEqual([...])` over 16 entries: non-object/null/array/missing/empty/non-string name → `invalid entry: name`; agent/cwd variants → `invalid entry: agent`/`cwd`; numeric and `null` prompt → `invalid entry: prompt`; first and last valid entries still `ok` | ✅ |
| PRST-05 | Case-insensitive trimmed dup: first wins, later `duplicate name` | `src/main/agent-preset-store.test.ts:93` `toEqual([ok first, {invalid,' a ','duplicate name'}, {invalid,'A','duplicate name'}])`; `src/shared/agent-presets.test.ts:25` `sameName(' Reviewer ','reviewer')` true | ✅ |
| PRST-06 | Whole array, UTF-8, 2-space, `\n`, creates `~/.playground` | `src/main/agent-preset-store.test.ts:237` literal string `'[\n  {\n    "name": "A", ...\n  7\n]\n'`; `:309` first save into a missing `.playground` dir → `readFile` equals the literal 2-space text | ✅ |
| PRST-07 | Unmanaged fields kept on save-over, rename, move | `src/main/agent-preset-store.test.ts:145` replace keeps `note: 'keep me'`; `:166` rename keeps `note`; `:196` move swaps whole objects; `SM:776` smoke rename keeps `note: 'kept'` | ✅ |
| PRST-08 | Invalid file → every write refused with `presets.json is invalid; fix it by hand first`; file bytes untouched | `src/main/agent-preset-store.test.ts:333` for bad JSON **and** non-array, both `save` and `delete` → `toEqual({ ok:false, error:{ kind:'failed', message:'presets.json is invalid; fix it by hand first' } })` and `readFile(...)` `toBe(text)`. Code: `src/main/agent-preset-store.ts:247` returns before `write`. No rename or backup path exists (AD-063). | ✅ |
| PRST-09 | Re-read before write, apply to what was read | `src/main/agent-preset-store.test.ts:348` hand edit after `list()` survives a rename: `toEqual([{...reviewer,name:'Checker'}, handEdit])`. Code `src/main/agent-preset-store.ts:246` `await read()` inside the queued change, and the store has no cache. | ✅ |

### P1: Save as preset

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| PRST-10 | Button shown with registry agent + cwd | `scripts/smoke-agent-presets.mjs:421` `expectEq(..., await waitFor(savePresetShown), true)` | ✅ |
| PRST-11 | Hidden for Ad-hoc or no cwd | `scripts/smoke-agent-presets.mjs:413` (no cwd) → `false`; `:427` (Ad-hoc) → `false` | ✅ |
| PRST-12 | Inline focused name field, Save + Cancel, choices unchanged | `scripts/smoke-agent-presets.mjs:440` `{ focused:true, buttons:['Cancel','Save'], selection: before12 }` | ✅ |
| PRST-13 | Append `{name,agent,cwd,prompt}` (prompt omitted for None); `Saved preset "<name>"`; dialog stays open | `scripts/smoke-agent-presets.mjs:473` `'Saved preset "Bug fixer"'`; `:478` file `[{name,agent,cwd,prompt}]`; `:489` None → `{name,agent,cwd}`; unit `src/main/agent-preset-store.test.ts:110`/`:117` (key list `['name','agent','cwd']`) | ✅ |
| PRST-14 | No task, values or level saved | `scripts/smoke-agent-presets.mjs:478` file equals exactly the 4 keys. Code `src/renderer/src/components/NewSessionDialog.tsx:251` builds the preset from name/agent/cwd/chosen prompt only | ✅ (see gap 3: no task was selected in the smoke) |
| PRST-15 | Empty/>40/line break → Save disabled + `1–40 characters, one line` | `src/shared/agent-presets.test.ts:6-19` literals for `''`, `'   '`, 40 ok, 41 rejected, `\n`, `\r`; `scripts/smoke-agent-presets.mjs:454`/`:459` `{ saveDisabled:true, hint:'1–40 characters, one line' }`; `:468` valid → `{ saveDisabled:false, hint:null }` | ✅ |
| PRST-16 | `Replace preset "<existing name>"?`; replace name/agent/cwd/prompt in place | `scripts/smoke-agent-presets.mjs:498` `'Replace preset "Bug fixer"?'` (typed `bug FIXER`); `:505` `[{name:'bug FIXER',...}, Hello]` same index; unit `src/main/agent-preset-store.test.ts:138`/`:145`/`:152` | ✅ |
| PRST-17 | Write fails → reason shown, field open with typed name | `scripts/smoke-agent-presets.mjs:518` `{ error:'presets.json is invalid; fix it by hand first', name:'Refused' }`; `:526` file unchanged. I/O error path uses the same branch (`src/renderer/src/components/NewSessionDialog.tsx:271`); unit `src/main/agent-preset-store.test.ts:373` maps EACCES/EBUSY to `failed: <message>` | ✅ |

### P1: Launch

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| PRST-18 | Split button: main opens New Session, arrow opens menu | `scripts/smoke-agent-presets.mjs:379` `{ popup:'menu', expanded:'false', label:'Agent presets' }`; `:386` main → kicker `'New session'` | ✅ |
| PRST-19 | Every preset by name in file order, separator, **Manage presets…** | `scripts/smoke-agent-presets.mjs:548` `menuRows` `toEqual` 8 rows in file order, `{sep:true}`, `Manage presets…` | ✅ |
| PRST-20 | Disabled `No presets yet — use Save as preset in New session` above Manage | `scripts/smoke-agent-presets.mjs:398` `{ text:'No presets yet — use Save as preset in New session', disabled:true }, {sep}, Manage` | ✅ |
| PRST-21 | Spawn at once (no prompt / no placeholders / all filled, ≤ 8000) | `src/renderer/src/lib/preset-launch.test.ts:143` no prompt → `{kind:'spawn'}`; `:147` plain → spawn with text; `:157` worktree-filled → spawn; `:189` exactly 8000 → spawn; `scripts/smoke-agent-presets.mjs:580` `{ session:true, dialog:false }` | ✅ |
| PRST-22 | Run preset dialog when a value starts empty or > 8000; fields in parse order, first empty focused | `src/renderer/src/lib/preset-launch.test.ts:168` `kind:'form', names:['taskId','worktree','notes']` (dedup parse order); `:181` 8001 → `form`; `scripts/smoke-agent-presets.mjs:606` `{ fields:['{{taskId}}'], values:[''], focused:true, spawnDisabled:true }` | ✅ (see gap 2: multi-field focus is code-only) |
| PRST-23 | Starting values as New Session for the cwd, Task on From branch | `src/renderer/src/lib/preset-launch.test.ts:157` branch + taskId from the worktree's branch; `:168` `worktree:'M:\\x'`, others `''` | ✅ |
| PRST-24 | APR-23/25/26/37 in Run preset | `scripts/smoke-agent-presets.mjs:606` Spawn disabled while empty; `:611` Will run `node <stub> --  ·  <ws>`; `:617` `'Prompt too long (8009 / 8000 characters)'` + disabled; `:628` preview `'Fix 12345 now'` (typed `'  12345 '`) | ✅ |
| PRST-25 | Enter spawns when Spawn enabled | `scripts/smoke-agent-presets.mjs:626` Enter while disabled → dialog still open; `:634` `{ session:true, dialog:false }` | ✅ |
| PRST-26 | More options → New Session on agent, level, cwd, prompt | `scripts/smoke-agent-presets.mjs:663` `{ agent:'Stub', level:'Workspace', cwdChips:1, prompt: PROMPT_TASK }` | ✅ |
| PRST-27 | Launched exactly as New Session spawn | `scripts/smoke-agent-presets.mjs:588` argv `['--','Say hello']`; `:642` argv `['--','Fix 12345 now']`. Code `src/renderer/src/App.tsx:458` and `:767` call the same `spawnSession` as the dialog | ✅ |
| PRST-28 | Rail selects the spawned session | `scripts/smoke-agent-presets.mjs:593`, `:655` `newRowSelected` → `true` | ✅ |
| PRST-29 | Positive int, no `+`/`0` → link; pinned title else none | `src/renderer/src/lib/preset-launch.test.ts:66` `{ id:12345, title:'Fix login' }`; `:73` `title:null` (unpinned / no cached title); `:157` plan carries `task:{id:123,title:'Fix login'}`; `scripts/smoke-agent-presets.mjs:647` `{ id:12345, title:null }` | ✅ |
| PRST-30 | No `{{taskId}}` or non-integer → no link | `src/renderer/src/lib/preset-launch.test.ts:88` `'012','+12','0','12a','','-5','1.5'` → `undefined`; `:94` no placeholder → `undefined` | ✅ |

### P1: Broken presets

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| PRST-31 | First reason in order agent → folder → prompt not found → prompt broken | `src/renderer/src/lib/preset-launch.test.ts:32-52` each literal; `:54` `allBad` → `'agent not found'`, then `'folder not found'` ahead of `prompt not found`; `scripts/smoke-agent-presets.mjs:548` all four reasons in the menu | ✅ |
| PRST-32 | Warning mark + reason in menu | `scripts/smoke-agent-presets.mjs:564` every `.preset-menu-problem` has an `svg`; `:548` reason texts | ✅ |
| PRST-33 | Field-broken pick → New Session pre-filled with valid parts, defaults otherwise | `src/renderer/src/lib/preset-launch.test.ts:200` four cases `toEqual({ kind:'dialog', source:{...} })`; `scripts/smoke-agent-presets.mjs:677` `{ agent:'Stub2', level:'Workspace', cwdChips:1, prompt:'None' }` | ✅ |
| PRST-34 | Entry-broken listed with reason, not pickable | `scripts/smoke-agent-presets.mjs:548` `disabled:true` + reasons; `:572` click leaves menu open, no dialog | ✅ |
| PRST-35 | Invalid file → one disabled `presets.json: <reason>` row above Manage | `scripts/smoke-agent-presets.mjs:688` `[{ text:'presets.json: invalid JSON: …', disabled:true }, {sep}, Manage]` | ✅ |

### P1: Manage in Settings

| AC | Spec-defined outcome | Evidence | Result |
| -- | -------------------- | -------- | ------ |
| PRST-36 | Presets tab: each preset with name, agent, cwd, prompt or `No prompt`; broken with reason | `scripts/smoke-agent-presets.mjs:745` rows `Stub · <ws> · <prompt>`, `… · No prompt`, `D: '⚠ folder not found'` | ⚠️ Spec-precision gap 1 |
| PRST-37 | Manage presets… opens Settings on Presets | `scripts/smoke-agent-presets.mjs:704` selected tab `'Presets'`; `:723` topbar opener → `'General'` (NOTF-28 kept; `src/renderer/src/App.tsx:524` is the only other opener and passes `'general'`) | ✅ |
| PRST-38 | Rename changes `name` only | `src/main/agent-preset-store.test.ts:166`/`:178`; `scripts/smoke-agent-presets.mjs:776` file entry `{ name:'Cee', ..., note:'kept' }` | ✅ |
| PRST-39 | Refused with `A preset named "<name>" already exists` | `src/main/agent-preset-store.test.ts:184` `{ error:{ kind:'exists', name:'B' } }`; `scripts/smoke-agent-presets.mjs:792` `'A preset named "A" already exists'`; `:799` file unchanged | ✅ |
| PRST-40 | Swap with neighbour; first Up / last Down disabled | `src/main/agent-preset-store.test.ts:196`/`:208`; `scripts/smoke-agent-presets.mjs:745` `up/down` disabled flags at the ends; `:760` file `['A','C','B','D']` | ✅ |
| PRST-41 | Confirm `Delete preset "<name>"?` → remove that entry only | `scripts/smoke-agent-presets.mjs:802` `'Delete preset "A"?'`; `:809` `['Cee','B','D']`; unit `src/main/agent-preset-store.test.ts:217` | ✅ |
| PRST-42 | Open presets file creates `[]` if missing, opens with OS app | `src/main/agent-preset-store.test.ts:399` `readFile` `toBe('[]\n')`, `opened` `toEqual([file])`; `:405` existing file untouched; `scripts/smoke-agent-presets.mjs:820` `{ file:'[]\n', error:null }`. Main wires `shell.openPath` (`src/main/index.ts:948`) | ✅ |
| PRST-43 | Invalid file → reason + Open presets file, no row actions | `scripts/smoke-agent-presets.mjs:711` `{ reason:true, open:'Open presets file', actions:0 }` | ✅ |
| PRST-44 | Each change applied at once, no save step | `scripts/smoke-agent-presets.mjs:760`, `:766`, `:776`, `:809` file reflects each step immediately | ✅ |

**Status**: 44/44 ACs covered with evidence. 1 AC (PRST-36) carries a spec-precision gap. 2 further precision gaps are noted for PRST-22 and PRST-14.

---

## Edge Cases

- [x] cwd exists but the tree does not know it → used as is: `src/renderer/src/lib/preset-launch.test.ts:238` `toEqual({ kind:'spawn', cwd:'D:/elsewhere' })`.
- [x] Prompt file changes between opening Run preset and Spawn → spawns the previewed text. This holds by structure and has no test: the plan captures `template` at pick time (`src/renderer/src/lib/preset-launch.ts:129`), and `src/renderer/src/components/RunPresetDialog.tsx:60` spawns `resolved` from it without re-reading prompts.
- [x] Registry agent renamed → `agent not found`, preset not rewritten: `src/renderer/src/lib/preset-launch.test.ts:32` (unknown agent name), and no code path rewrites presets on an agent edit.
- [x] Spawn failure reported as a New Session failure: same `spawnSession` from `useSessions` (`src/renderer/src/App.tsx:458`, `:767` vs `:749`). Structural, no test.

---

## Code review of risk points

| Risk | Finding |
| ---- | ------- |
| AD-063 / PRST-08: an invalid file is never rewritten or renamed | `change()` returns at `agent-preset-store.ts:247` before `write`. `openFile()` writes only on ENOENT (`:260-263`). The only `rename` is tmp→file inside `write`. ✅ |
| PRST-09: re-read before every write | `read()` runs inside the serialized queue for every op, and the store keeps no cache. Ops target entries by name, never by index. ✅ |
| PRST-07: unknown fields kept | Save-over spreads the old object (`:115`), rename spreads it (`:132`), and move swaps raw elements. ✅ |
| PRST-21..23: direct spawn only when no placeholder is empty and the text is ≤ 8000 | `preset-launch.ts:127-129` uses the shared `formBlockers` (`>` `PROMPT_MAX_CHARS`). ✅ |
| PRST-29/30 regex | `/^[1-9][0-9]*$/` over the trimmed value, gated on `names.includes('taskId')`. ✅ |
| PRST-33 | `dialog` source keeps the agent only if it is registered, the cwd only if it exists, and the prompt only if it is a template entry. The `NewSessionDialog` init falls back to the first agent or None (`NewSessionDialog.tsx` agent/prompt `useState` initialisers). ✅ |
| cwd canonicalised to the tree's spelling | `isolationLevelOf(tree, preset.cwd)?.path` is used for all three plan kinds (unit `:220`). ✅ |
| NOTF-28: Settings opens on General except via Manage presets… | `initialTab = 'general'` default (`SettingsDialog.tsx:83`); App has only `openSettings` → `'general'` and `managePresets` → `'presets'`. ✅ |
| Open item (a): the Save as preset row is not reset on reopen | Violates no AC. `NewSessionDialog` is conditionally mounted (`App.tsx:741` `{nsSource && (`), so closing unmounts it and the next open starts with the row closed. Within one mount, the `Saved preset` notice persists across choice changes, and no AC forbids that. |
| Open item (b): PresetsSettings shows agent/prompt problems | It does more than PRST-36 asks: PRST-31 reasons on field-broken rows. This is consistent with design.md §Settings (`<agent> · <cwd> · <prompt>` **or** `⚠ <reason>`). Because the reason **replaces** the agent/cwd/prompt line, see gap 1. |
| Open item (c): the titled PRST-29 link is covered only by unit tests | Acceptable. `presetTaskLink` is the single function used by both the plan and `RunPresetDialog.tsx:60`. App passes `tasks={tasks.tasks}` (`App.tsx:759`). The titled case is unit-asserted (`preset-launch.test.ts:66`, `:157`). |

---

## Discrimination Sensor

Expanded tier. The scratch was a temporary `git worktree add --detach <scratchpad>/wt HEAD` with a node_modules junction. The junction was removed with `rmdir` **before** `git worktree remove --force`, and the main `node_modules` was intact (510 entries before and after). Each mutant ran `npx vitest run` on the three unit files. Unmutated scratch baseline: 60/60 passed.

| # | File | Mutation | Killed? (failing test) |
| - | ---- | -------- | ---------------------- |
| M1 | `src/main/agent-preset-store.ts:246` | `change()` uses the last `list()` result instead of re-reading (PRST-09) | ✅ re-reads ... hand edit survives (PRST-09) |
| M2 | `src/main/agent-preset-store.ts:247` | Invalid file treated as `[]`, write allowed (PRST-08 / AD-063) | ✅ refuses every change while the file is invalid (PRST-08) |
| M3 | `src/main/agent-preset-store.ts:132` | Rename rebuilds from managed fields, dropping unknown ones (PRST-07) | ✅ rename ... keeps unknown fields (PRST-38, PRST-07) |
| M4 | `src/main/agent-preset-store.ts:67` | Duplicate check `sameName` → `===` (PRST-05) | ✅ later case-insensitive trimmed duplicate (PRST-05) |
| M5 | `src/renderer/src/lib/preset-launch.ts:40` | `TASK_ID` `/^[1-9][0-9]*$/` → `/^[0-9]+$/` (PRST-29/30) | ✅ links nothing for a value that is not such an integer (PRST-30) |
| M6 | `src/renderer/src/lib/preset-launch.ts:128` | Spawn directly despite an empty placeholder (PRST-21/22) | ✅ 2 tests (PRST-22/23 form; AD-050 form) |
| M7 | `src/renderer/src/lib/preset-launch.ts:128` | 8000 bound off by one (`> 8001`) | ✅ 8001 characters asks (PRST-22) |
| M8 | `src/renderer/src/lib/preset-launch.ts:31-32` | PRST-31 order swapped: folder before agent | ✅ first reason in PRST-31 order |
| M9 | `src/renderer/src/lib/preset-launch.ts:104` | cwd not canonicalised to the tree spelling (AD-050) | ✅ tree spelling in every plan kind |
| M10 | `src/renderer/src/lib/preset-launch.ts:112` | Broken preset pre-fills a broken prompt (PRST-33) | ✅ opens New Session with only the still-valid ... (PRST-33) |
| M11 | `src/shared/agent-presets.ts:47` | 40-char bound off by one (41 accepted) (PRST-15) | ✅ 2 tests (name rule; store save refuses) |
| M12 | `src/shared/agent-presets.ts:47` | `\r` no longer counts as a line break (PRST-15) | ✅ rejects a line break of either kind |

**Sensor depth**: expanded (12 behaviour-level manual mutations across the store, planner and name rule)
**Sensor result**: 12/12 killed
**Isolation**: real tree `git status --porcelain` before = after = `?? .specs/features/ado-triggers/`. `git worktree list` shows only the main tree. `git stash` was not used.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes (24 files, all feature-bound; SettingsDialog change limited to `initialTab`) | ✅ |
| No scope creep (no task/values in presets, no watcher, no repo-scoped file) | ✅ |
| Matches patterns (prompt-library read-each-open, temp+rename write, `useLatestCallback`, SyncPopover outside-click) | ✅ |
| Spec-anchored outcome check | ✅ (3 precision gaps flagged) |
| Per-layer Coverage Expectation (tasks.md matrix: pure/store 1:1, smoke for UI ACs) | ✅ |
| Every test maps to a spec requirement | ✅. Non-AC tests are Done-when items: trim on save, input not mutated, serialized concurrent changes, failed write keeps file |
| Documented guidelines followed: `.specs/codebase/TESTING.md` (no renderer component unit tests; CDP smoke for UI) | ✅ |

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (Build gate, tasks.md) + `node scripts/smoke-agent-presets.mjs`
- **typecheck**: exit 0
- **lint**: exit 0. 0 errors and 18 warnings, all in files outside the diff (`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`).
- **npm test**: 3225 passed, 7 failed, 0 skipped (3232) across 146 files. The 7 failures are exactly the known local git/longpaths baseline: FDSC-05, FWIG-47, BSLG-39, "AC 17", BSLG-21, BSLG-38, and "force-removes a worktree with mixed dirt". No other failures, and no git-sync flake this run.
- **Test count before feature**: 3172 (3232 − 60; the three test files are new in this diff, and no other test file changed)
- **Test count after feature**: 3232
- **Delta**: +60 unit tests
- **Smoke**: `node scripts/smoke-agent-presets.mjs` → **52/52 checks passed** (48 PRST checks + 4 isolation checks; the real `presets.json` was absent before and after). No electron process was left running.

---

## Ranked gaps (all Minor, none blocking)

1. **Spec-precision gap: PRST-36 on a field-broken preset.** The AC lists "every preset … with its name, agent, cwd and prompt …, and broken ones with their reason". `src/renderer/src/components/PresetsSettings.tsx:198` shows `⚠ <reason>` **instead of** `<agent> · <cwd> · <prompt>` for a preset broken by PRST-31. The smoke codifies this at `scripts/smoke-agent-presets.mjs:745` (`D: '⚠ folder not found'`). design.md (§Settings, "or `⚠ <reason>`") chose the replacement, but the spec conjunction does not say that "broken" removes the other fields. Showing the cwd of a `folder not found` preset would help the "fix it instead of starting over" story. Fix: clarify the spec to match the design, or render both the reason and the fields.
2. **Precision gap: PRST-22 "first empty field focused" with several fields.** The smoke uses a single-field prompt (`scripts/smoke-agent-presets.mjs:606`). Selecting the first empty field among filled ones is code-only (`src/renderer/src/components/RunPresetDialog.tsx:47`). Fix: give the smoke a prompt with `{{worktree}}` before an empty placeholder.
3. **Precision gap: PRST-14 "no task".** The smoke saves without a task selected, so "task not saved" rests on code review (`src/renderer/src/components/NewSessionDialog.tsx:251`). Fix: pick a task in the smoke before saving.

Structural-only edge cases: the prompt changing between open and Spawn, and spawn failure. Both are sound by code review and have no dedicated test.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| PRST-01..35, PRST-37..44 | Implementing | ✅ Verified |
| PRST-36 | Implementing | ✅ Verified (spec-precision gap 1 flagged) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 44/44 ACs + 4/4 edge cases matched. 3 spec-precision gaps flagged (PRST-36, PRST-22, PRST-14).
**Sensor**: 12/12 mutations killed
**Gate**: typecheck ✅; lint ✅ (0 errors); tests 3225 passed with the 7 known baseline failures only; smoke 52/52

**What works**: the store (classification, refusal on an invalid file, re-read before write, field preservation, atomic write); the launch planner (spawn / form / dialog, task link, cwd canonicalisation); the Save as preset flow; the split button and menu; the Run preset dialog; Settings › Presets.

**Next steps**: optionally address gaps 1-3 (spec clarification or small smoke/UI additions). None of them blocks merge.

---

## Amendment 2026-10-20: linked task pinned (PRST-45..50)

**Verdict for the amendment**: PASS ✅. All 6 ACs have `file:line` evidence that matches the spec outcome. 11 mutants were run: 10 were killed, and 1 survived. The survivor is equivalent for every spec outcome (see below). The gates are at the known baseline.

- **Spec**: `.specs/features/agent-presets/spec.md`, story "P1: A linked task is pinned" (PRST-45..50). Decision: `.specs/STATE.md` AD-064.
- **Diff range**: `b1ab2dd..72d3405` (branch `fix/preset-task-link`, 4 commits: `8a682b0` spec amendment, `b7e5ce1` `TaskBoard.pinLinked`, `71ec828` `runLinkedPin` and the `index.ts` wiring, `72d3405` README)
- **Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero. Read-only on the real tree.

### Spec-anchored acceptance criteria (amendment)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| PRST-45 | Every link by id pins that id under `ado.defaultOrg`/`defaultProject` when no such pin exists, validated in ADO like a manual pin | `src/main/task-board.test.ts:614` - `expect(source.calls).toEqual([[ref(26266)]])`; `:616` - `expect(result.snapshot.tasks).toEqual([{ ...ref(26266), details: FIX_LOGIN }])`; `:617` - `expect(persisted()).toEqual([ref(26266)])`. Runner: `src/main/linked-task-pin.test.ts:32` - `expect(deps.pinned).toEqual([26266])`. All four paths are wired (by reading): `src/main/index.ts:828` (agent `POST /task` via `hookServer.onTaskLink`), `:834` (`sessions:spawn`: New Session and presets), `:847` (`sessions:set-task`: the rail's picker) | ✅ PASS |
| PRST-46 | The spawn and the link do not wait for the pin. The session starts and the link is saved before the ADO call settles | By reading `src/main/index.ts`: `:833-834` awaits `sessions.spawn(...)`, then calls `void runLinkedPin(task, linkedPin)` and returns the view without awaiting. A failed spawn rejects at `:833` before the pin starts, so it stays unpinned (`src/main/session-manager.ts:191` rejects before persist). `:827-828` and `:846-847` run `sessions.setTask` (synchronous persist and emit) first, then `void runLinkedPin`. In `src/main/activity-hook-server.ts:158-159` the listener returns before `answer(res, 204)`. The runner never rejects: `src/main/linked-task-pin.test.ts:61` - `await expect(runLinkedPin(...)).resolves.toBeUndefined()` | ✅ PASS (wiring judged by reading; no automated test of `index.ts`, the project norm for main wiring) |
| PRST-47 | When a pin is added, main pushes `tasks:changed` with the new snapshot. The rail shows the title, the type badge (a Task's first non-Task ancestor) and the state | `src/main/linked-task-pin.test.ts:33` - `expect(deps.emitted).toEqual([SNAPSHOT])` (added 1); `:42` - `expect(deps.emitted).toEqual([])` (added 0); `src/main/task-board.test.ts:637` - `expect(result.snapshot.tasks[0].details).toEqual({ ...task, parentType: 'Fault' })`. The emit is wired at `src/main/index.ts:822` (`emitToWindow('tasks:changed', { snapshot })`). The renderer applies it at `src/renderer/src/App.tsx:404` (`setTasks(snapshot)`). The rail reads it at `src/renderer/src/lib/rail-groups.ts:212` via `linkedPinFor` (`src/renderer/src/lib/session-attribution.ts:56-62`) | ✅ PASS |
| PRST-48 | Default unset, ADO unreachable or item missing: link kept, no pin, no error shown; a not-found id is not fetched again this app session | `src/main/task-board.test.ts:647-649` - `added 0`, `source.calls` `[]`, `persisted()` `[]` (default unset); `:659-662` - `added 0`, `auth 'failed'`, nothing persisted, `toHaveLength(2)` (an unreachable ADO is retried); `:672-675` - both `added 0`, nothing persisted, `source.calls` `toHaveLength(1)` (not found is memoised). No error shown: `src/main/linked-task-pin.test.ts:61-63` (resolves, error goes only to `logError`, which is `console.error` at `src/main/index.ts:823`). The link is kept because `setTask` and `spawn` persist before the pin starts and the pin never touches the session | ✅ PASS |
| PRST-49 | Already pinned, or a pin already in flight: no ADO call | `src/main/task-board.test.ts:685-687` - `added 0`, `expect(source.calls).toEqual([])`, pins unchanged; `:696-698` - `a.added + b.added` `toBe(1)`, `source.calls` `toHaveLength(1)` | ✅ PASS |
| PRST-50 | The pin applies whatever the value of `ado.autoPinFromWorktrees` | `src/main/task-board.test.ts:708-709` - with `autoPinFromWorktrees: false`: `expect(result.added).toBe(1)`, `expect(persisted()).toEqual([ref(26266)])` | ✅ PASS |

**Status**: 6/6 ACs have evidence that matches the spec outcome. Spec-precision notes (Minor, none blocking):

1. PRST-46 rests on reading `index.ts`, because the IPC handlers have no unit seam. The runner's half (it never rejects) is tested.
2. PRST-48 says "no error SHALL be shown". The implementation logs to the main-process console (`src/main/index.ts:823`) and shows nothing in the UI. This reading is consistent with the spec.

### Review (amendment)

| Point | Finding |
| ----- | ------- |
| `autoPin` unchanged (APIN-05..09) | `src/main/task-board.ts:222-225`. The flag check runs first and returns `{ added: 0, snapshot }`, as before. `pinNew` reads `pinnedTasks` synchronously at the same moment the old code did, before any await. All existing `TaskBoard.autoPin` tests pass, including APIN-09 at `src/main/task-board.test.ts:573`. Mutants M3, M7, M8 and M9 also kill APIN tests. |
| `notFound` and `inflight` shared | One instance of each per board (`src/main/task-board.ts:146`, `:148`). Both paths use them through `pinNew` (`:246-247`, `:251`, `:264`, `:273`). An auto-pin and a linked pin of the same ref therefore dedupe against each other, and an id that one path did not find is skipped by the other. `inflight` is cleared in `finally`. |
| `null` link (back to branch) | `src/main/linked-task-pin.ts:19` (`if (!task) return`). Asserted at `src/main/linked-task-pin.test.ts:51-52` (`pinned` and `emitted` are both `[]` for `null` and `undefined`). |
| Renderer needs no change | `linkedPinFor` (`src/renderer/src/lib/session-attribution.ts:56-62`) matches a pin by **id only** (`tasks.find((t) => t.id === taskId)`). A pin under the default org and project therefore matches. The match is broader than "under the defaults": a same-id pin from another org would also match. That behaviour predates this diff and is harmless. `src/renderer/src/App.tsx:404` applies `tasks:changed` by replacing the snapshot. |
| Paths outside the spec | `sessions:duplicate` and `respawn` copy an existing link and do not pin. The spec does not list them, and the source link has already been through a pin attempt. Not a gap. |

### Discrimination sensor (amendment)

The scratch was `git worktree add M:/obogoni/pgv-prst HEAD` with `node_modules` as a directory junction. The junction was removed with `rmdir` **before** `git worktree remove --force`, and the main `node_modules` was intact (510 entries before and after). Each mutant ran `npx vitest run src/main/task-board.test.ts src/main/linked-task-pin.test.ts`. The unmutated scratch baseline was 73/73 passed.

| # | File | Mutation | Killed? (failing test) |
| - | ---- | -------- | ---------------------- |
| M1 | `src/main/task-board.ts:236` | Defaults check dropped (`if (false) return`) | ✅ pins nothing and fetches nothing when an ADO default is unset (PRST-48) |
| M2 | `src/main/task-board.ts:235` | `autoPinFromWorktrees` gate re-added to `pinLinked` | ✅ pins a linked task even when autoPinFromWorktrees is false (PRST-50) |
| M3 | `src/main/task-board.ts:245` | Already-pinned filter skipped | ✅ 2 tests (PRST-49 already pinned; APIN-05) |
| M4 | `src/main/linked-task-pin.ts:22` | Emits when `added` is 0 (`>= 0`) | ✅ pushes nothing when no pin was added (PRST-47, PRST-48) |
| M5 | `src/main/linked-task-pin.ts:24` | Rethrows after `logError` | ✅ never rejects ... when pinning throws (PRST-46, PRST-48) |
| M6a | `src/main/linked-task-pin.ts:19` | Guard narrowed to `task === undefined` (a `null` link passes) | ⚠️ Survived. Equivalent for every spec outcome: `task.id` then throws inside the `try`, so nothing is pinned or emitted and the error only reaches `logError`. The only observable difference is a spurious console line |
| M6b | `src/main/linked-task-pin.ts:19-21` | Guard removed and `pinLinked(task?.id)` called: a `null` link really reaches the pin | ✅ pins nothing for a link back to the branch or no link |
| M7 | `src/main/task-board.ts:264` | `notFound` not recorded | ✅ 2 tests (PRST-48 not found; APIN-07) |
| M8 | `src/main/task-board.ts:251` | `inflight` not recorded | ✅ 2 tests (PRST-49 overlap; APIN-08) |
| M9 | `src/main/task-board.ts:223` | `autoPin` flag check dropped | ✅ pins nothing and fetches nothing when autoPinFromWorktrees is false (APIN-09) |
| M10 | `src/main/task-board.ts:237` | `pinLinked` pins `id + 1` | ✅ 5 tests (PRST-45, 47, 49 x2, 50) |

**Sensor depth**: expanded (11 behaviour-level manual mutations over `pinLinked`, `pinNew`, `autoPin` and `runLinkedPin`)
**Sensor tally**: 10 killed, 1 survived (M6a, equivalent for the spec)
**Isolation**: the real tree's `git status --porcelain` was `?? .specs/features/ado-triggers/` before and after. `git worktree list` shows only the main tree. `git stash` was not used.

### Gate check (amendment, real tree at `72d3405`)

- **typecheck**: exit 0
- **lint**: exit 0. 0 errors and 18 warnings, all in files outside the diff (the same 4 files as the 2026-10-14 run).
- **npm test**: 3242 passed, 7 failed, 0 skipped (3249) across 147 files. The 7 failures are exactly the known local baseline: FDSC-05, FWIG-47, BSLG-39, "AC 17", BSLG-21, BSLG-38, and "force-removes a worktree with mixed dirt". There was no git-sync flake.
- **Test delta from this diff**: +12 (8 in `TaskBoard.pinLinked (PRST-45..50)`, 4 in the new `src/main/linked-task-pin.test.ts`). No test was removed or weakened. The `TaskBoard.autoPin` tests are unchanged.

### Ranked gaps (amendment; all Minor, none blocking)

1. **Hardening for M6a**: `src/main/linked-task-pin.test.ts:45-53` (null link) does not assert `deps.errors` is `[]`. Adding `expect(deps.errors).toEqual([])` would kill M6a. Optional.
2. **PRST-46 is code-review only** for the three `index.ts` call sites (`src/main/index.ts:828`, `:834`, `:847`). This follows the project's norm for main IPC wiring. The hand test in the story's Independent Test is the backstop.

### Requirement traceability update (amendment)

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| PRST-45..50 | Pending | ✅ Verified |
