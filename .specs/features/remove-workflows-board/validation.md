# Remove Workflows and Board Validation

**Date**: 2026-10-26
**Spec**: `.specs/features/remove-workflows-board/spec.md`
**Diff range**: `a6197fd..HEAD` (6 commits: 1d385cc, b9cdd49, 65392fb, 613a7f8, d04d083, 85be437)
**Verifier**: independent sub-agent (author ≠ verifier)

**Verdict**: PASS

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | 1d385cc - fallback + tests in `config-store.test.ts:100-118` |
| T2 | ✅ Done | b9cdd49 - Board removed |
| T3 | ✅ Done | 65392fb - Workflows renderer removed |
| T4 | ✅ Done | 613a7f8 - engine, IPC, `agent-spawn.ts` |
| T5 | ✅ Done | d04d083 - deps, scripts, handoff |
| T6 | ✅ Done | 85be437 - AD-065 at `.specs/STATE.md:75` |

---

## Spec-Anchored Acceptance Criteria

### Tested behavior (ConfigStore fallback)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| RMV-05: `"direction": "board"` loads as tree | `ui.direction === 'tree'` | `src/main/config-store.test.ts:100` (`it.each(['board', ...])`) + `:106` - `expect(ui.direction).toBe('tree')`; also `:107` `expect(ui.theme).toBe('light')` (rest of config kept). Impl: `src/main/config-store.ts:6,43` | ✅ PASS |
| RMV-06: `"direction": "workflows"` loads as tree | `ui.direction === 'tree'` | same `it.each` at `src/main/config-store.test.ts:100` (`'workflows'`) + `:106` | ✅ PASS |
| RMV-07: valid direction loads unchanged | `tree`/`agents`/`files`/`hours` unchanged | `src/main/config-store.test.ts:111` (`it.each(['tree','agents','files','hours'])`) + `:116` - `expect(new ConfigStore(dir).get().ui.direction).toBe(direction)` | ✅ PASS |
| Edge: never-existing direction (`kanban`) | `'tree'` | `src/main/config-store.test.ts:100` (`'kanban'`) + `:106` | ✅ PASS |
| Edge: `ui.direction` absent | default `'tree'` | `src/main/config-store.test.ts:19-22` (no file → `DEFAULT_CONFIG`); a file with `ui` but no `direction` is covered by the shallow merge with `DEFAULT_CONFIG` (`config-store.ts:41`) and `DEFAULT_CONFIG.ui.direction = 'tree'` (`src/shared/config.ts:151`), not by a dedicated test | ✅ PASS (existing behavior) |

### Structural / removal requirements (code or git evidence)

| Req | Spec-defined outcome | Evidence | Result |
| --- | -------------------- | -------- | ------ |
| RMV-01 | Top bar renders exactly Tree, Agents, Files, Hours in that order | `src/renderer/src/components/TopBar.tsx:149-190` - four `<button>` segments: `'tree'` (:153), `'agents'` (:163), `'files'` (:173), `'hours'` (:183), then `</div>`; `App.tsx:545,596,619` switch covers tree/agents/hours with files as final branch | ✅ PASS (code; renderer is hand-verified by convention) |
| RMV-02 | `direction: 'tree' \| 'agents' \| 'files' \| 'hours'` | `src/shared/config.ts:81` | ✅ PASS |
| RMV-03 | No `BoardView`, `BoardView.css`, `smoke-board.mjs` | `git ls-files` grep for `BoardView\|smoke-board` = 0 hits; `find src scripts` = 0 hits | ✅ PASS |
| RMV-04 | No "Board view" README section, no `board.png` ref, file absent | `grep -i board README.md` → only `README.md:13` ("dashboard"); `docs/screenshots/` holds only `agents.png`, `tree.png` | ✅ PASS |
| RMV-10 | No WorkflowsView/RunDetail/NewWorkflowDialog/WorkflowTriggerDialog/use-workflow-runs/workflow-run-view | `git ls-files` grep = 0 hits; deleted in 65392fb | ✅ PASS |
| RMV-11 | No workflow-ctx/loader/manager/run-store/scaffold, run-state, agent-step-runner, mcp-result-server, emit-result-schema | `git ls-files` grep = 0 hits; deleted in 613a7f8 (also `agent-command-builder`, `parse-envelope`) | ✅ PASS |
| RMV-12 | No `workflows:*` invoke / `workflow:*` event | `grep -n "workflows\?:" src/shared/ipc-contract.ts src/preload/*.ts` = 0 hits | ✅ PASS |
| RMV-13 | No `src/shared/workflows.ts` | deleted in diff (`git diff --stat`: `src/shared/workflows.ts \| 144 ---`); not in `git ls-files` | ✅ PASS |
| RMV-14 | No direct `esbuild`, `@modelcontextprotocol/sdk`, `ajv` | `package.json` grep = 0 hits (were at `a6197fd:package.json:29,34,36`); `package-lock.json` root `packages[""]` deps/devDeps contain none | ✅ PASS |
| RMV-15 | Main never touches `~/.playground/workflows` or `<userData>/workflow-runs` | `grep -rni workflow src` = only `config-store.ts:42` comment and `config-store.test.ts:100`; `.playground` uses in `src/main/index.ts:827,837` are `prompts`/`presets.json` only | ✅ PASS |
| RMV-16 | No workflow smokes, fixtures, `wf1-spike` | `git ls-files` grep for `smoke-workflow\|smoke-agent-workflow\|smoke-blocker-resume\|scripts/fixtures\|wf1-spike` = 0 hits; `ls scripts` confirms | ✅ PASS |
| RMV-17 | No `DESIGN_HANDOFF_WORKFLOWS.md` | `git ls-files` grep = 0 hits | ✅ PASS |
| RMV-18 | `rg -i workflow src README.md package.json` only in config-store(.test).ts | exactly 2 hits: `src/main/config-store.ts:42`, `src/main/config-store.test.ts:100` | ✅ PASS |
| RMV-20 | `SessionNamePoller` keeps the `spawnAgent` seam typed from `agent-spawn.ts` | `src/main/agent-spawn.ts:2-17` (types only); `src/main/session-name-poller.ts:1` imports from `./agent-spawn`; `src/main/index.ts:17,181,722-723` (`spawn: spawnAgent`); only diff to poller files is the import line | ✅ PASS |
| RMV-21 | `tasks:*` channels and `TaskBoard` unchanged | `git diff a6197fd..HEAD -- src/main/task-board.ts src/main/task-board.test.ts` empty; no `tasks:` lines in the `ipc-contract.ts` diff; no `tasks:`/`TaskBoard` lines in the `index.ts` diff | ✅ PASS |
| RMV-22 | Remaining suite passes | 2994 passed, 7 failed - all 7 in the machine baseline set (see Gate) | ✅ PASS |
| RMV-23 | `npm run build` succeeds | exit 0 (typecheck + electron-vite build) | ✅ PASS |

**Status**: ✅ All ACs covered. No spec-precision gaps: RMV-05/06/07 name exact values and the tests assert them.

---

## Discrimination Sensor

Approach: mutate the real `src/main/config-store.ts`, run `npx vitest run src/main/config-store.test.ts`, restore with `git checkout -- src/main/config-store.ts` after each run. Pre-sensor porcelain baseline `?? .specs/features/ado-triggers/`; post-sensor porcelain identical (diffed). Unmutated: 15/15 pass.

| # | File:line | Mutation | Result |
| - | --------- | -------- | ------ |
| 1 | `src/main/config-store.ts:43` | Drop the fallback line | ✅ Killed (3 failed) |
| 2 | `src/main/config-store.ts:43` | Fall back to `'agents'` instead of `'tree'` | ✅ Killed (3 failed) |
| 3 | `src/main/config-store.ts:43` | Fallback rebuilds `ui` from `DEFAULT_CONFIG.ui` (wipes other fields) | ✅ Killed (3 failed, `theme` assertion) |
| 4 | `src/main/config-store.ts:6` | Accept `'board'` as a valid direction | ✅ Killed (1 failed) |
| 5 | `src/main/config-store.ts:43` | Drop the condition (always `'tree'`) | ✅ Killed (3 failed, RMV-07 cases) |
| 6 | `src/main/config-store.ts:6` | Accept `'workflows'` as a valid direction | ✅ Killed (1 failed) |

**Sensor depth**: lightweight+ (6 mutations; not a P0 path)
**Result**: 6/6 killed - PASS ✅

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ fallback is 2 lines + constant |
| Surgical changes | ✅ incidental edits are comment rewording (`activity-hook-server.ts`, `binary-resolver.ts`, `post-create-hook.ts`, `prompt-library.ts`, `NewSessionDialog.tsx`, `SessionRail.css`, `vitest.config.ts`) and removal of `.dialog-desc` (0 remaining users) |
| No scope creep | ✅ user data on disk untouched; `TaskBoard` untouched |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ✅ |
| Per-layer Coverage Expectation (main logic 1:1 RMV-05..07 + edge) | ✅ |
| Every test maps to a requirement | ✅ new tests cite RMV-05/06/07; `status-bar.test.ts` loops updated to the remaining directions |
| Documented guidelines | ✅ `vitest.config.ts` (AD-003), `.github/workflows/ci.yml` |

---

## Edge Cases

- [x] Never-existing direction (`kanban`) → `'tree'` (`config-store.test.ts:100`)
- [x] Absent `ui.direction` → default `'tree'` (existing behavior, `config-store.test.ts:19`)

---

## Gate Check

- **Build**: `npm run build` → exit 0
- **Lint**: `npm run lint` → exit 0, 0 errors, 17 prettier warnings, all in files outside the diff (`scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`)
- **Tests**: `npx vitest run --maxWorkers=2` → 130 files (126 passed, 4 failed); 3001 tests: **2994 passed, 7 failed**
- **Failures (environment baseline, not regressions)**: `file-discard` (FDSC-05), `ignore-check` (FWIG-47), `path-limits` (BSLG-39, AC 17), `worktree-manager` (BSLG-21, BSLG-38, force-remove mixed dirt). All are real-git/longpaths tests in the known baseline set.
- **Test count delta**: decreased by design. 17 test files were deleted, each the test of a removed module (`src/main/{agent-command-builder,agent-step-runner,emit-result-schema,mcp-result-server,parse-envelope,run-state,workflow-ctx,workflow-loader,workflow-manager,workflow-run-store,workflow-scaffold}.test.ts`, `src/renderer/src/lib/workflow-run-view.test.ts`, 5 under `scripts/wf1-spike/`). RMV-22 allows this. +7 new cases in `config-store.test.ts`.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| RMV-01..07 | Implemented | ✅ Verified |
| RMV-10..18 | Implemented | ✅ Verified |
| RMV-20..23 | Implemented | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 20/20 requirements matched spec outcome, 0 spec-precision gaps
**Sensor**: 6/6 mutations killed
**Gate**: build 0, lint 0 errors, tests 2994 passed / 7 baseline env failures

**What works**: Board and Workflows fully removed from code, IPC, scripts, docs and deps; config fallback to Tree is tested and discriminating; session name poller and TaskBoard intact.

**Issues found**: none.

**Next steps**: UAT by hand (open the app, see four segments, pin a task, start a session), then PR.
