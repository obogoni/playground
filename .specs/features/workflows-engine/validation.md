# workflows-engine (WF2) Validation

**Date**: 2026-07-03
**Spec**: `.specs/features/workflows-engine/spec.md`
**Diff range**: `c083b2e..HEAD` (12 commits, `0fd6daf`→`f0a8cb6`)
**Verifier**: independent sub-agent (author ≠ verifier); evidence-or-zero; read-only over the real tree (mutations run in scratch, all reverted)

**Verdict: PASS ✅**

---

## Task Completion

All 12 feature commits present and building. Every WF2 requirement with an automated-testable surface is traced below to a `file:line` + assertion. Note: `.specs/features/workflows-engine/tasks.md` was already modified in the working tree at the start of this run (pre-existing, not touched here).

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ PASS = assertion targets the spec-defined outcome; convention = not unit-testable, covered by thin-shell/manual per `.specs/codebase/TESTING.md`.

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| **WF2-01** scan `~/.playground/workflows/`, id=folder name; missing/empty ⇒ empty list | `[]` (not error); subfolder names only | `workflow-loader.test.ts:52` `expect(await discoverWorkflows('nope-…')).toEqual([])`; `:59` empty root ⇒ `[]`; `:68` `expect((await discoverWorkflows(root)).sort()).toEqual(['alpha','beta'])` (loose `README.md` ignored); order preserved `workflow-manager.test.ts:108` `expect(defs.map(d=>d.id)).toEqual(['alpha','broken','omega'])` | ✅ PASS |
| **WF2-02** load+validate `workflow.ts` via esbuild bundle ⇒ `{meta,run}` | valid `{meta,run}`; relative imports bundled | `workflow-loader.test.ts:81` `expect(result.meta.name).toBe('Demo')` + `:83` `expect(typeof result.run).toBe('function')`; bundle mode `:110` relative helper ⇒ `expect(result.meta.name).toBe('FromHelper')` | ✅ PASS |
| **WF2-03** broken workflow ⇒ `{error}`, listed, non-fatal | listed as broken with message; others still load | `workflow-loader.test.ts:89` syntax error ⇒ `'error' in result`; `:97` missing run ⇒ error; `workflow-manager.test.ts:111` `expect(defs).toContainEqual({id:'broken',error:'SyntaxError: unexpected token'})` + valid alpha/omega still present | ✅ PASS |
| **WF2-04** `meta = {name,description?,inputs:[{key,label,required?}]}`; list returns valid+broken | rejects bad shape; both forms listed | `workflow-loader.test.ts:43` non-string name rejected; `:47` non-array inputs rejected; `:82` `inputs` `[{key,label}]` accepted; `workflow-manager.test.ts:109-111` both `{id,meta}` and `{id,error}` returned | ✅ PASS |
| **WF2-05** `ctx.worktree.*` delegates and returns results | delegates verbatim, returns result object | `workflow-ctx.test.ts:74` `expect(result).toBe(expected)` + `:75` `received` `['C:/repo','feature','main',undefined,undefined,undefined]`; remove `:88` `toBe(expected)`; changedFiles `:98` `toBe(files)` | ✅ PASS |
| **WF2-06** `ctx.sh` non-zero throws w/ evidence; `allowFail` returns; zero ⇒ `{code:0,…}` | throw carries `{code,stdout,stderr}`; allowFail returns them; zero ⇒ `{code:0,…}` | `workflow-ctx.test.ts:112` zero ⇒ `toEqual({code:0,stdout:'ok',stderr:''})` + cwd forwarded `:113`; `:121` non-zero `rejects.toMatchObject({code:2,stdout:'partial',stderr:'boom'})`; `:133` allowFail ⇒ `toEqual({code:1,stdout:'o',stderr:'e'})` | ✅ PASS |
| **WF2-07** `ctx.git.fetch` delegates, fails on git error | delegates opts; propagates error | `workflow-ctx.test.ts:151` `expect(received).toEqual({cwd:'C:/wt',remote:'origin',branch:'main'})`; `:161` `rejects.toThrow(/git fetch failed/)` | ✅ PASS |
| **WF2-08** `ctx.ado.getTask` fetches task+children via `$expand=Relations`; throws on auth | Hierarchy-Forward child refs; URL has `$expand=Relations`, no `fields=`; `{task,children}`; auth ⇒ throw | `ado-gateway.test.ts:93` `toEqual({ok:true,item:…,childRefs:[{id:101…},{id:102…}]})` + `:103-105` URL `$expand=Relations`/`api-version=7.1`/not `fields=`; `:124` 401 ⇒ auth failure + token cleared; `parseChildRefs` `:153` forward-only `[{id:5…},{id:6…}]`; `workflow-ctx.test.ts:175` parent auth ⇒ `rejects.toThrow(/az login/)`; `:188` child auth ⇒ `/token rejected/`; `:212-217` composes `{task,children}` w/ resolved details | ✅ PASS |
| **WF2-09** `ctx.notify` writes timeline line; `{toast:true}` also fires native toast | log line always; notifier only on toast | `workflow-ctx.test.ts:229` `expect(logs.map(l=>l.message)).toContain('hello')` + `:230` no toast ⇒ `notifierCalls` `[]`; `:241-242` toast ⇒ notifier called once, `notifierCalls[0].message).toBe('done')`. Real `electron.Notification` `index.ts:63` (convention — thin shell) | ✅ PASS |
| **WF2-10** auto-log every `ctx.*`; `ctx.log` line; `ctx.step` grouping | each primitive auto-emits step-started; nesting under label | `workflow-ctx.test.ts:294` `steps.map(s=>s.label)` arrayContaining all 7 primitive names; `:252` log ⇒ `[{message:'working',group:undefined}]`; `:264` `logs.find(l=>l.message==='inside').group).toBe('build')` + `:265` `'after'` group undefined; manager `:139` `stepLabels).toEqual(['phase'])`, `:166` nested log `group:'phase'` | ✅ PASS |
| **WF2-11** `ctx.input` exposes trigger values | frozen trigger object | `workflow-ctx.test.ts:274` `expect(ctx.input).toEqual({ticket:'123'})` + `:275` `Object.isFrozen` true + `:276` mutation throws | ✅ PASS |
| **WF2-12** pure reducer, guarded invalid transitions unchanged | each valid transition; invalid ⇒ same run ref | `run-state.test.ts:30-72` valid: running/step/done/failed(captures)/cancelled; `:78` out-of-order done `expect(next).toBe(run)` + pending; `:86,:92,:98,:104,:109` guarded `.toBe(run)`; `:117` purity — no mutation | ✅ PASS |
| **WF2-13** runner runs `run(ctx)` fail-fast, main-process, no rollback | done on success; halt (failed) on throw; no rollback | `workflow-manager.test.ts:132-133` statuses `running`…`done`; `:147` last emit `status:'done'`; throw path `:213` `failed`; no-rollback = absence-of-cleanup (verified by inspection — manager has no rollback code, `finally` only clears active slot `workflow-manager.ts:141-145`) | ✅ PASS (no-rollback via inspection, note below) |
| **WF2-14** cooperative cancellation at `ctx.*` ⇒ `cancelled` | next `ctx.*` throws before running/emitting; run ⇒ cancelled | `workflow-ctx.test.ts:317` cancelled ⇒ `rejects.toBeInstanceOf(CancellationError)` + `:318` `ran` false + `:319` `steps` `[]`; `:327` `ctx.log` halts; manager `:245` `status).toBe('cancelled')` + `:247` no `step-logged` recorded | ✅ PASS |
| **WF2-15** capture error, stdout, code on failure | error+stdout+code into run record | `workflow-manager.test.ts:214` `error).toBe('command exploded')` + `:216-221` failed event `{error,stdout:'partial output before the crash',code:3}`; reducer `run-state.test.ts:61-64` `error).toBe('boom')`, stdout/code captured | ✅ PASS |
| **WF2-16** ephemeral per-run JSON, atomic tmp+rename | round-trip full record+events; overwrite; mkdir | `workflow-run-store.test.ts:43` `expect(store.load('run-1')).toEqual(run)` (events incl.); `:58` re-save ⇒ latest; `:71` lists all; `:76` missing ⇒ null; `:85` creates dir. Atomic write `workflow-run-store.ts:35-36` tmp+`renameSync` | ✅ PASS |
| **WF2-17** serial runs; 2nd refused | 2nd `run()` rejects; 1st completes | `workflow-manager.test.ts:190` `rejects.toThrow(/already active/i)` + `:195` first ⇒ `done` | ✅ PASS |
| **WF2-18** `workflows:*`/`workflow:*` IPC mirrors `session:*` | 4 req/res + 3 stream channels; handle/emit wired | `ipc-contract.ts:94-100` (`list/run/cancel/reload`) + `:119-123` (`status/step/log`); `index.ts:230-233` `handle(...)` wiring; manager emits via shared `emitToWindow` `index.ts:227`. Convention (typecheck-gated thin shell) | ✅ convention — shaped per spec |
| **WF2-19** shared types in `src/shared/workflows.ts` | WorkflowMeta/Input/Def/RunStatus/WorkflowRun/StepEvent | `src/shared/workflows.ts:10,17,28,33,39,61` all six defined; consumed across every WF2 test + contract. Typecheck-gated | ✅ convention — shaped per spec |
| **WF2-20** end-to-end gate smoke over `workflows:run` | worktree.create→git.fetch→notify ⇒ done, streamed events, run-log written | `scripts/smoke-workflow.mjs:47-74` seeds fixture (create→fetch→notify toast); `:155` invokes `workflows:run`; `:177/180/181` checks `done` + ≥1 step + ≥1 log; `:186-190` checks run-log JSON persisted. Manual owner-run gate — **not executed here** | ✅ convention — shaped per spec |

**Status**: ✅ All 20 ACs covered — 17 by unit/behavior tests matching the spec-defined outcome, 3 (WF2-18/19/20) by the documented thin-shell/manual convention with contract/types/script confirmed shaped per spec. No spec-precision gaps requiring fix tasks.

---

## Payload / Conjunction Rule (field values, not just "a call happened")

| Surface | Value-level assertion | Where |
| --- | --- | --- |
| `workflow:status` payload | `payload).toEqual({runId, status:'done'})` / `'failed'` / `'cancelled'` | `workflow-manager.test.ts:148,224,249` |
| `workflow:step` payload | `step.label` `['phase']` | `workflow-manager.test.ts:139` |
| `workflow:log` payload | `message` `['first','inside']`; nested `group:'phase'` | `workflow-manager.test.ts:143,166` |
| persisted `WorkflowRun` | `status`, ordered `events[].kind`, `seq` `[0..4]`, `startedAt`≠'', `finishedAt` truthy | `workflow-manager.test.ts:154-164`; round-trip `workflow-run-store.test.ts:43` |
| `ctx.sh` `{code,stdout,stderr}` | `toEqual`/`toMatchObject` on all three fields (zero, throw, allowFail) | `workflow-ctx.test.ts:112,121,133` |
| `ctx.ado.getTask` `{task,children}` | `result.task` object + `result.children` full `{ref,details}` array | `workflow-ctx.test.ts:212-217` |

All emitted/persisted/returned structures assert on field **values/state**, not mere invocation. ✅

---

## Discrimination Sensor

Injected 6 behavior-level faults in scratch (edit → run targeted file → revert). Every mutation was killed; tree restored via `git checkout --` after each.

| # | File:line | Mutation | Test file | Killed? |
| --- | --- | --- | --- | --- |
| a | `run-state.ts:49` | Dropped `done` guard so an out-of-order transition mutates state | `run-state.test.ts` | ✅ Killed (1 failed) |
| b | `workflow-ctx.ts:187` | `if (false && …)` — `ctx.sh` returns instead of throwing on non-zero | `workflow-ctx.test.ts` | ✅ Killed (1 failed) |
| c | `workflow-ctx.ts:204` | `ctx.ado.getTask` returns empty instead of throwing on auth failure | `workflow-ctx.test.ts` | ✅ Killed (1 failed) |
| d | `workflow-manager.ts:97` | `if (false && …)` — removed the `activeRunId` serial guard | `workflow-manager.test.ts` | ✅ Killed (1 failed) |
| e | `run-state.ts:53` | Removed `error: event.error` so `failed` drops the error | `run-state.test.ts` | ✅ Killed (1 failed) |
| f | `ado-gateway.ts:59` | Inverted `!==`→`===` so `parseChildRefs` accepts non-Hierarchy-Forward | `ado-gateway.test.ts` | ✅ Killed (2 failed) |

**Sensor depth**: P0-full (≥5 manual mutations across all core modules).
**Result**: 6/6 killed — PASS ✅

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code / no scope creep | ✅ Only loader/ctx/reducer/store/manager net-new; ADO gets one method; `ctx.git` is fetch-only per spec |
| Surgical changes / matches patterns | ✅ Mirrors `SessionManager` DI bag, `ConfigStore` atomic write, `ipc-contract` 3-map, no-shell `git` seam |
| Spec-anchored outcome check (values match spec) | ✅ 17/17 testable ACs |
| Per-layer coverage (pure/domain 1:1 ACs; shells hand-verified) | ✅ Pure seams direct-asserted; thin shells (`index.ts`, `electron.Notification`, smoke) hand-verified per convention |
| Every test maps to a spec AC / edge case | ✅ No unclaimed tests |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md` (pure-fn, temp-dir, injected-fake; no `vi.mock`) |

---

## Edge Cases

- [x] Missing/empty workflows dir ⇒ empty list (WF2-01) — `workflow-loader.test.ts:52,59`
- [x] `run(ctx)` throws ⇒ `failed`, evidence captured, worktrees left (WF2-13/15) — `workflow-manager.test.ts:198-225`
- [x] `ctx.sh` non-zero w/o `allowFail` ⇒ fail; with ⇒ continue (WF2-06) — `workflow-ctx.test.ts:116,128`
- [x] Cancel mid-run ⇒ stop at next `ctx.*` checkpoint (WF2-14) — `workflow-manager.test.ts:227-253`
- [x] ADO auth failure ⇒ throw (visible fail) (WF2-08) — `workflow-ctx.test.ts:166-189`
- [x] One broken folder ⇒ others still load (WF2-03) — `workflow-manager.test.ts:96-112`
- [x] 2nd concurrent run ⇒ refused (WF2-17) — `workflow-manager.test.ts:173-196`

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`
- **typecheck**: PASS (node + web projects, `tsc --noEmit`)
- **lint**: PASS — **0 errors**, 18 prettier warnings (pre-existing style in `smoke-*.mjs` + one in `workflows.ts`; non-blocking)
- **test**: **318 passed, 0 failed** across 27 files (matches expected 318)
- **Skipped**: none
- **Failures**: none

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| WF2-01 … WF2-17 | Pending | ✅ Verified (unit/behavior) |
| WF2-18 | Pending | ✅ Verified (contract + wiring; convention) |
| WF2-19 | Pending | ✅ Verified (types; typecheck-gated) |
| WF2-20 | Pending | ✅ Verified as shaped (smoke script present per spec; green run is the owner-run gate, not executed here) |

---

## Notes (non-blocking observations)

- **WF2-13 no-rollback** is an *absence* of behavior; it cannot be asserted through the DI fakes (no real side effect present). Confirmed by inspection: `WorkflowManager.run`'s `finally` only clears the active slot (`workflow-manager.ts:141-145`) — there is no cleanup/rollback path. Not a gap.
- **`ctx.ado.getTask`** silently drops a child whose details are absent from the batch (`workflow-ctx.ts:207-212`). The spec does not define this precisely; behavior is reasonable (best-effort children). No fix task.
- `src/main/ado-gateway.ts` contains a stray NUL byte (git reports it "binary"); pre-existing, unrelated to WF2, does not affect compilation or tests.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 20/20 ACs matched the spec-defined outcome (17 unit/behavior-tested, 3 by documented convention); 0 spec-precision gaps.
**Sensor**: 6/6 mutations killed (P0-full).
**Gate**: 318 passed, 0 failed; lint 0 errors; typecheck clean.

**What works**: discovery/loading (incl. broken-listing + esbuild bundle), all `ctx.*` primitives with value-level assertions, pure guarded reducer, serial fail-fast runner with cancellation + failure-evidence capture, atomic per-run persistence, and the full `workflows:*`/`workflow:*` IPC contract + wiring.

**Issues found**: none.

**Next steps**: Owner runs `node scripts/smoke-workflow.mjs` against a live dev app to close the WF2-20 manual gate. No fix tasks required.
