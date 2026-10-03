# Create Timeouts Validation

**Date**: 2026-10-03
**Spec**: `.specs/features/create-timeouts/spec.md` (CRTO-01..21)
**Diff range**: `fc19a3c..baa658b` (branch `feature/create-timeouts`, rebased on `origin/main` `fc19a3c`)
**Verifier**: independent sub-agent (author ≠ verifier); the authors' notes were read as claims, not evidence

## Validation: create-timeouts — PASS

Every AC has evidence, every asserted value is the spec's literal, and 12 of 12 unit mutants were
killed. No production defect found. Four follow-ups (thin smoke evidence, one spec-precision gap)
are recorded below under the owner's loop budget; none blocks.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T16 | ✅ Done | All marked `[x]` in `tasks.md`; one commit each (`1be2b22`..`d208b4b`), plus `baa658b` (the #162 diagnostics test's blocker moved off `hash-object --stdin`, which no longer blocks) |

---

## Spec-Anchored Acceptance Criteria

Test paths are relative to the repo root. `wmt` = `src/main/worktree-manager.test.ts`.

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| CRTO-01 | fetch, `merge --ff-only`, `fetch r b:base` each with 60000 ms | `wmt:1169` `expect(optsOf('fetch','origin','main')).toEqual({ timeoutMs: 60000 })`; `wmt:1170` merge `{ timeoutMs: 60000 }`; `wmt:1183` `fetch origin release:release` `{ timeoutMs: 60000 }`; `wmt:1156` `expect(REFRESH_TIMEOUT_MS).toBe(60000)`; `wmt:1158` `REAL_CREATE_DEPS` toStrictEqual with `refreshTimeoutMs: 60000`; local reads unbounded `wmt:1133` | ✅ PASS |
| CRTO-02 | `ok: false`, `Fetching {upstream} timed out after 60 s. Retry, or uncheck "Update base branch from remote" to skip.`, no `worktree add` | `wmt:1379` `toEqual({ ok: false, error: FETCH_TEXT })` with FETCH_TEXT the literal at `wmt:1253-1254`; no worktree: `wmt:1305` `existsSync(...)).toBe(false)`, `wmt:1306` branch not created; real hung credential helper: `wmt:1538-1544` (fetch text at a 2 s limit, no folder, not in `worktree list`); fixture proof `src/main/waiting-remote.fixture.test.ts:50` `isTimeout(err)).toBe(true)` | ✅ PASS |
| CRTO-03 | `Fast-forwarding "{base}" to {upstream} timed out after 60 s. …`, no `worktree add` | `wmt:1390` `toEqual({ ok: false, error: FF_TEXT })` (literal `wmt:1255-1256`); unchecked-base form `wmt:1339-1342`; no worktree `wmt:1323`, `wmt:1344` | ✅ PASS |
| CRTO-04 | recreate's branch still at its previous tip | `wmt:1367` `expect(git(repo,'rev-parse','feature/re').trim()).toBe(tipBefore)`; `wmt:1362` fetch text | ✅ PASS |
| CRTO-05 | dialog shows the text in its error line, stays open, Create enabled again | Main returns the exact texts (CRTO-02/03/10 rows). Dialog path unchanged for every `ok: false`: `NewWorktreeDialog.tsx:138` / `StartWorkDialog.tsx:189` `setError(result.error …)` then `setBusy(false)`; generic inline-error smoke `scripts/smoke-create.mjs:149` (dialog stays open with `.dialog-error`). No smoke drives a timeout into the dialog → follow-up F1 | ✅ PASS (code reading + generic smoke) |
| CRTO-06 | every git process starts with stdin at end of input | `src/main/git.test.ts:131` `expect(stdout.trim()).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')` (no `timeoutMs`; only an ended stdin returns) | ✅ PASS |
| CRTO-07 | hook command spawned with stdin ignored | `src/main/hook-shell.test.ts:104,107` `set /p` settles `< 5000` ms and prints `after-prompt`; `:118,122` `pause` likewise; source `hook-shell.ts:53` `stdio: ['ignore','pipe','pipe']` | ✅ PASS |
| CRTO-08 | reads EOF at once; settles with own exit code, no `timedOut` | `hook-shell.test.ts:132` `expect(result.code).toBe(3)`; `:133` `timedOut).toBeUndefined()`; `:105-106` code 0, no `timedOut` | ✅ PASS |
| CRTO-09 | `worktree add` with 600000 ms on new-branch, existing-branch, reuse, recreate | `wmt:1171`, `:1184` new branch; `:1194` empty base; `:1203` reuse; `:1216` recreate — each `toEqual({ timeoutMs: 600000 })`; `wmt:1157` `CHECKOUT_TIMEOUT_MS).toBe(600000)` | ✅ PASS |
| CRTO-10 | `Creating the worktree timed out after 10 min and git was stopped. Part of it may remain at {target}; remove it before retrying.`; hook not run | `wmt:1485-1488` exact text with `10 min` and `join(root,'repo-feature-t')`; all four paths `wmt:1440-1473`; hook not run `wmt:1505` `expect(shellCalls).toEqual([])` | ✅ PASS |
| CRTO-11 | push `worktrees:create-step` `{requestId, step}`: `refreshing-base`, `creating-worktree`, `running-hook` before each step | Steps: `wmt:1590` `toEqual(['refreshing-base','creating-worktree'])`; `post-create-hook.test.ts:388-389` `running-hook` heard before the shell runs; forwarding `post-create-hook.test.ts:316` `args[0][6]).toBe(onStep)`. Push wiring `src/main/index.ts:419-422` (code reading); end to end `smoke-create.mjs:338` 14.1 and `smoke-start-work.mjs:765` check 10 (label only reachable through the pushed event) | ✅ PASS |
| CRTO-12 | no `refreshing-base` when refresh off, empty base, or reuse | `wmt:1605`, `:1622`, `:1639` `toEqual(['creating-worktree'])` | ✅ PASS |
| CRTO-13 | no `running-hook` without a declared command or without a worktree | `post-create-hook.test.ts:407` (no command), `:425` (create failed), `:443` (conflict) | ✅ PASS |
| CRTO-14 | nothing pushed after an early end | `wmt:1673` `['refreshing-base']` after failed refresh; `:1690`, `:1707`, `:1722` `toEqual([])` for conflict, existing folder, empty name | ✅ PASS |
| CRTO-15 | run order, each at most once | exact-array `toEqual` at `wmt:1590`, `:1656`, `post-create-hook.test.ts:388`; mutant M8 (duplicate) killed | ✅ PASS |
| CRTO-16 | labels `Updating base branch from remote…`, `Creating worktree…`, `Running post-create command…`, `Preparing…`; ignore other requestIds | `src/renderer/src/lib/create-progress.test.ts:6,10,14,18` exact labels; `:34` other id `toBe(false)`; smoke `smoke-create.mjs:338`, `smoke-start-work.mjs:765` assert the hook label on screen. Refresh/checkout labels on screen not asserted by smoke → follow-up F2 | ✅ PASS |
| CRTO-17 | line removed on settle; later steps ignored | `create-progress.test.ts:38` `acceptsStep(null, …)).toBe(false)`; `use-create-progress.ts` `end()` nulls the id; dialogs call `progress.end()` (`NewWorktreeDialog.tsx:121,142`); smoke `smoke-create.mjs:370` / `smoke-start-work.mjs:797` `settled.progress === null` | ✅ PASS |
| CRTO-18 | no `requestId` → no event | `src/main/index.ts:419-422` `requestId === undefined ? undefined : …` (code reading); `wmt:1578`-family tests show no `onStep` means nothing heard; workflow ctx passes the decorator without an `onStep` (`index.ts:804`) | ✅ PASS (code reading) |
| CRTO-19 | backdrop click leaves the dialog open while busy | source `NewWorktreeDialog.tsx:155`, `StartWorkDialog.tsx:206` `onClick={busy ? undefined : …}`; smoke `smoke-create.mjs:355` 14.3, `smoke-start-work.mjs:782` check 12 `afterBackdrop.open === true` | ✅ PASS |
| CRTO-20 | Cancel disabled with tooltip `Wait for the create to finish` | `create-progress.test.ts:24` `BUSY_CANCEL_TITLE).toBe('Wait for the create to finish')`; source `NewWorktreeDialog.tsx:267-268`, `StartWorkDialog.tsx:332-333`; smoke `smoke-create.mjs:345` 14.2, `smoke-start-work.mjs:772` check 11 `cancelDisabled === true && cancelTitle === BUSY_TITLE`. Branch-exists sub-state: see ⚠️ G1 | ✅ PASS / ⚠️ G1 |
| CRTO-21 | after settle, Cancel and backdrop act as today (close, or continue WPC-14) | code reading: backdrop falls back to the pre-feature expression when `busy` is false (`NewWorktreeDialog.tsx:155`); Cancel only gains `disabled={busy}`; smoke `smoke-create.mjs:370` / `smoke-start-work.mjs:797` dialog closes on success and selects the new worktree | ✅ PASS |

**Status**: ✅ 21/21 ACs covered with spec-literal outcomes. ⚠️ 1 spec-precision gap flagged (G1).

### ⚠️ G1 — CRTO-20 in the branch-exists sub-state

While a reuse or recreate runs, the Cancel on screen is `BranchExistsChoice`'s
(`src/renderer/src/components/BranchExistsChoice.tsx:40`): disabled while busy, but with no
`Wait for the create to finish` tooltip. design.md (`BranchExistsChoice` row) scoped the tooltip to
the footer Cancel, and the spec's "the dialog's Cancel button" does not say which. Not a production
defect against the approved design; recorded as follow-up F3.

---

## Edge Cases

- [x] Fetch fails before its timeout keeps git's own line: `wmt:1402` `toEqual({ ok: false, error: gitFailureLine(direct) })`, `:1403` `/^fatal: /`
- [x] Recreate fetch timeout keeps the branch: `wmt:1367` (mutant M7 killed)
- [x] Checkout timeout does not run the hook: `wmt:1505`
- [x] Window closed while a create runs: `emitToWindow` drops the push when `mainWindow` is null (`index.ts:516-518`, `mainWindow = null` at `index.ts:269`); the create promise is independent of the push. Code reading only
- [x] Hook reads stdin then exits non-zero: `hook-shell.test.ts:132-133`
- [x] Step after settle ignored: `create-progress.test.ts:38`
- [x] Workflow create during a dialog create: workflow passes no `onStep` (CRTO-18 row) and the dialog filters by its own id (`create-progress.test.ts:34`)

---

## Discrimination Sensor

Scratch: a temporary `git worktree add --detach` of `baa658b` in a sibling folder, `node_modules`
junctioned. The targeted tests passed unmutated there first (4 files / 70 tests; `wmt -t CRTO` 29
tests). Each mutant was applied by script with an anchor that matched exactly once, run, and restored.

| # | File | Mutation | Killed by |
| - | ---- | -------- | --------- |
| M1 | `src/main/git.ts` | drop `started.child.stdin?.end()` | ✅ `git.test.ts` "gives git a stdin already at end of input (CRTO-06)" (hangs to 30 s) |
| M2 | `src/main/hook-shell.ts` | stdin back to `'pipe'` | ✅ 3 `hook-shell.test.ts` stdin tests (each hangs to 30 s) |
| M3 | `src/main/worktree-manager.ts` | base fetch without `timeoutMs` | ✅ 5 tests: bounded calls (CRTO-01, recreate), hung fetch (CRTO-02), recreate tip (CRTO-04), real credential helper |
| M4 | `src/main/worktree-manager.ts` | `worktree add` bounded only on `-b` paths | ✅ 4 tests: empty-base and reuse, bounded and hung |
| M5 | `src/main/worktree-manager.ts` | fast-forward timeout returns the fetch text | ✅ 3 CRTO-03 tests (both forms, real limit) |
| M6 | `src/main/worktree-manager.ts` | `isTimeout` check dropped on the checkout | ✅ 6 CRTO-10 tests incl. WPC-08 |
| M7 | `src/main/worktree-manager.ts` | recreate deletes the branch before the refresh | ✅ "keeps the existing branch at its tip when a recreate fetch hangs (CRTO-04)" |
| M8 | `src/main/worktree-manager.ts` | `creating-worktree` reported twice | ✅ 3 step tests (CRTO-12, CRTO-15) |
| M9 | `src/main/worktree-manager.ts` | `refreshing-base` reported up front whenever `updateBase` | ✅ 6 step tests (CRTO-12, CRTO-14) |
| M10 | `src/main/post-create-hook.ts` | `running-hook` before the declared-command check | ✅ "reports no running-hook when the repo declares no command" |
| M11 | `src/renderer/src/lib/create-progress.ts` | `acceptsStep` accepts when no request is in flight | ✅ "ignores every step when no request is in flight" |
| M12 | `src/main/worktree-manager.ts` | `limitText` switches to minutes at 60000 ms (`1 min`) | ✅ both "reads 60 s … with the real limit" tests |

Smoke mutants: 0 run. Batch 3 recorded six smoke mutants killed (T14: label, hook step with main
relaunch, Cancel, backdrop; T15: label, Cancel, backdrop), and nothing in production code needed a
seventh.

**Sensor depth**: expanded (12 unit mutants)
**Result**: 12/12 killed — ✅

**Isolation**: real-tree `git status --porcelain` was empty before the sensor and empty after;
junction deleted before `git worktree remove`, then `git worktree prune`; the real `node_modules`
is intact. No Electron process was started.

---

## Deviations judged

- **`limitText` (SPEC_DEVIATION from design.md)**: correct. The spec's owner-confirmed texts read `60 s` and `10 min`; design's whole-minute rule would have printed `1 min`. Minutes past one minute satisfy both literals, and M12 proves the boundary is pinned.
- **T1 fixture helper (curl wait + `removeReleasedFolder`)**: sound. A shell function makes git's appended `get` an argument; holding `/wait` until `close()` releases the orphaned `git-remote-http` so the folder can be removed. Test-only code, no production impact.
- **T15 opening Start Work through the Tasks pane's React fiber prop**: acceptable for an offline smoke. It calls the real `onStartWork` and opens the real `StartWorkDialog`; it skips the card's button, which is outside CRTO. It is coupled to React internals (`__reactFiber$`), so it may break on a React upgrade (follow-up F4).
- **`pathCheck` moved into `createWorktreeWith`**: correct. The BSLG path-check tests changed call shape only (`git diff` shows no assertion change), and the path check still runs before any git write.
- **stdin ended inside the pacer callback, `.finally(end)` kept**: correct. `child` exists only on `run()`'s promise, so the end has to be inside the callback; the diagnostics end still fires once for a timed-out call (`git.test.ts:211` plus the start/end counts that follow). Side effect: a queued call's limit starts at spawn, and a hung call holds one of the four pacer slots until its limit. AD-059 records this; no AC is violated.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (the `ctx` threading in `worktree-manager.ts` is what the injected runner needs) |
| No scope creep | ✅ local reads stay unbounded, as Out of Scope says |
| Matches patterns | ✅ `emitToWindow` push like `tasks:changed`; IPC field optional like `updateBase` |
| Spec-anchored outcome check | ✅ every text, limit, label and tooltip asserted as a literal |
| Per-layer coverage | ✅ main create path 1:1; renderer components by CDP smoke by project convention |
| Every test maps to a spec item | ✅ 47 new tests, 0 removed |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md`, `vitest.config.ts` |

Privacy scan of the diff: no user paths, no real company or customer names.

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`
- **Result**: typecheck exit 0; lint exit 0, 0 errors / 18 warnings (unchanged from baseline); `npm test` 129 files, **2816 passed**, 0 failed, 0 skipped (234.8 s)
- **Tests added by the feature**: 47 `it(` added, 0 removed (`git diff fc19a3c..baa658b -- '*.test.ts'`); two `isTimeout` blockers moved from `hash-object --stdin` to a sleeping alias with the same assertion

---

## Follow-ups (owner's loop budget: thin smoke evidence is a follow-up, not a FAIL)

- **F1 (CRTO-05)**: no smoke check drives a timeout into a dialog. Evidence is the exact main-side texts plus the unchanged generic error path. A smoke with a hanging remote and a short limit would close it, but the limits are constants, so it would need a test-only override.
- **F2 (CRTO-16)**: both smokes assert only `Running post-create command…` on screen. `Creating worktree…` shows up in the recorded `seen` list but is not asserted, and `Updating base branch from remote…` is never driven, because the refresh is unticked. Both labels are pinned by `create-progress.test.ts`, and they reach the screen on the same channel as the hook label.
- **F3 (G1, CRTO-20)**: decide whether `BranchExistsChoice`'s busy Cancel should also carry `Wait for the create to finish`. If yes, it is a one-line change plus a smoke check; if no, narrow CRTO-20's wording to the footer Cancel.
- **F4**: the T15 smoke depends on the `__reactFiber$` internals; re-check it on a React upgrade.
- **Pre-existing, not this feature**: the whole `smoke-create.mjs` run is 12/14 on a fresh seed. The two CRWT create checks fail on the seed's missing remote because the refresh is on by default, and per T14 they fail the same way on the pre-feature build.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| CRTO-01..21 | Implemented | ✅ Verified (CRTO-20 with G1 follow-up) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 21/21 ACs matched the spec outcome; 1 spec-precision gap (G1)
**Sensor**: 12/12 unit mutants killed; 0 smoke mutants run (6 recorded killed in T14/T15)
**Gate**: 2816 passed, typecheck 0, lint 0 errors / 18 warnings
