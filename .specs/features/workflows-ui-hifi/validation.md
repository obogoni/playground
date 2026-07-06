# Workflows UI — Hi-Fi Rebuild (WHF) Validation

**Date**: 2026-07-06
**Spec**: `.specs/features/workflows-ui-hifi/spec.md`
**Diff range**: `8fb9d05..c38f996` (11 commits, T1–T11)
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree; sensor mutations applied to scratch state and discarded (tree left clean).

**Verdict**: ✅ **PASS**

---

## Task Completion

All 11 commits in range present and mapped to the WHF ACs:

| Commit | Scope | ACs |
| ------ | ----- | --- |
| d256870 | StepEvent enrichment + step-finished reducer fold | WHF-01/02/03/07/08 |
| ddba92b | start/finish instrument seam + manager clock/stepId | WHF-01/02/05/06/07 |
| ba78590 | broadcast enriched stream + failure detail | WHF-04/07/08/09/10 |
| 8ca31fb | richer RunView fold (stepNodes/status/rollup) | WHF-11..20 data |
| a294d5b | extract relative-time helper | WHF-17/22 |
| 56022ff | pipeline glyph on segment | WHF-23 |
| 899ddc9 | consume workflow:run-started, retire pendingWf | WHF-08 |
| 01461e9 | hifi RunDetail (timeline/detail/respond/footer) | WHF-11..20 |
| a7bf88f | hifi rail — cards + RECENT RUNS | WHF-21/22/23 |
| 070da74 | hifi Run-workflow dialog | WHF-24 |
| c38f996 | implement-ticket ctx.step group for WHF-14 gate | WHF-14 |

---

## Spec-Anchored Acceptance Criteria — Backend (unit-tested, WHF-01..10)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| WHF-01 stepKind + monotonic stepId on start | each primitive carries its semantic `stepKind`; ids monotonic per run, reset between runs | `workflow-ctx.test.ts:574` — `expect(kindByLabel).toEqual({worktree.create:'worktree',…,agent:'agent'})`; `workflow-ctx.test.ts:596` — `expect(steps.map(s=>s.stepId)).toEqual([0,1,2])`; `workflow-manager.test.ts:649` — `expect(started.map(e=>e.stepId)).toEqual([0,1])`; `:667` reset → `toBe(0)` | ✅ PASS |
| WHF-02 step-finished + non-negative durationMs, matching stepId | finish event shares stepId, `durationMs ≥ 0` | `workflow-manager.test.ts:632` — `expect(finished[0].stepId).toBe(started[0].stepId)`; `:633` — `expect(finished[0].durationMs).toBeGreaterThanOrEqual(0)`; `workflow-ctx.test.ts:597` — matching finish ids `[0,1,2]` | ✅ PASS |
| WHF-03 reducer folds start/finish clock-free, ordered, guarded | appends when running (no status change / no clock), ignored when pending or terminal | `run-state.test.ts:180` — `expect(next.events.at(-1)?.durationMs).toBe(1400)` + status still `running`; `:187` ignored while pending `toBe(run)`; `:194` ignored after terminal; `:212` order `['run-started','step-started','step-finished']` | ✅ PASS |
| WHF-04 broadcast step-started AND step-finished on workflow:step | both event kinds reach the renderer channel | `workflow-manager.test.ts:736` — `expect(steps.some(s=>s.kind==='step-started')).toBe(true)`; `:737` — `…'step-finished'…toBe(true)` | ✅ PASS |
| WHF-05 agent {prompt,permission} on start, permission default read | start carries prompt + permission; missing permission → `read`; explicit passes through | `workflow-ctx.test.ts:644` — `expect(start?.agent).toEqual({prompt:'do it',permission:'read'})`; `:657` — `{prompt:'p',permission:'write'}`; `workflow-manager.test.ts:695` — `{prompt:'ship it',permission:'write'}` | ✅ PASS |
| WHF-06 agentResult {status,data,sessionId} on finish | finish carries the validated envelope by value | `workflow-ctx.test.ts:670` — `expect(finish?.agentResult).toEqual({status:'done',data:{summary:'ok'},sessionId:'sess-9'})`; `workflow-manager.test.ts:697` — `{status:'done',data:{summary:'shipped'},sessionId:'sess-7'}` | ✅ PASS |
| WHF-07 sessionId on blocked event | agent sessionId forwarded through requestInput → workflow:blocked payload | `workflow-ctx.test.ts:511` — `expect(reqSessions).toEqual(['s1'])`; `workflow-manager.test.ts:827` — blocked `payload` `toEqual({runId,question,sessionId:'sess-block-1'})` | ✅ PASS |
| WHF-08 workflow:run-started {runId,workflowId,input,startedAt} | event fires with the four-field payload | `workflow-manager.test.ts:713` — `expect(started?.payload).toEqual({runId,workflowId:'wf',input:{ticket:'42'},startedAt:expect.any(String)})` + `:719` startedAt not `''` | ✅ PASS |
| WHF-09 broadcast failed error/stdout/code on workflow:step | terminal failed StepEvent broadcast with evidence | `workflow-manager.test.ts:758` — `expect(failedStep).toMatchObject({kind:'failed',error:'command exploded',stdout:'partial output before the crash',code:3})` | ✅ PASS |
| WHF-10 agent failure detail surfaced (stdout/code from AgentStepError.detail) | agent failure maps `.detail.stdout/.code` onto failed event + broadcast | `workflow-manager.test.ts:789` — persisted failed `toMatchObject({stdout:'agent stdout tail',code:7})`; `:795` — broadcast `failedStep` same | ✅ PASS |

**Payload/conjunction rule**: every named field (`stepKind`, `stepId`, `durationMs`, `ok`, `agent.{prompt,permission}`, `agentResult.{status,data,sessionId}`, `detail`, run-started `{runId,workflowId,input,startedAt}`, failed `error/stdout/code`, blocked `sessionId`) is asserted on its VALUE via `toEqual`/`toMatchObject`/`toBe`, not merely on "emit was called". `ok:true`/`ok:false` both asserted (`workflow-ctx.test.ts:625/631`; fold `:210`). Detail payloads asserted by value (`workflow-ctx.test.ts:699` ado, `:719` files).

**Backend unit ACs: 10/10 matched the spec-defined outcome. No spec-precision gaps.**

## Spec-Anchored Acceptance Criteria — Renderer (data-path present; visual deferred to owner UI gate, WHF-11..24)

Project convention (spec §Out of Scope): renderer React components are hand-verified, not unit-tested. Their proof is deferred to the owner-run two-example UI gate. Verified here: the pure fold produces each field AND the component reads it (evidence = `file:line` in fold or component).

| AC | Data-path evidence (fold produces → component reads) | Result |
| -- | ---------------------------------------------------- | ------ |
| WHF-11 node timeline + glyphs + connectors | fold `stepStatus` (`workflow-run-view.ts:101`), tested `workflow-run-view.test.ts:291`; `RunDetail.tsx:214` StepRow + `:258` NodeGlyph by status | ✅ data-path present · visual deferred |
| WHF-12 kind tags | `StepNode.kind` set `workflow-run-view.ts:161`; `RunDetail.tsx:29` KIND_TAG + `:237` render | ✅ · deferred |
| WHF-13 durations | `durationMs` folded `workflow-run-view.ts:181`; `RunDetail.tsx:47` formatDuration + `:241` render | ✅ · deferred |
| WHF-14 group rows + rollup pill | `groupRollup` `workflow-run-view.ts:131`, tested `:325`; `RunDetail.tsx:126` groupRollup over children + `:229` group label row + mini pill | ✅ · deferred |
| WHF-15 step detail boxes (ado/files) | `StepNode.detail` folded `workflow-run-view.ts:183`, tested `workflow-run-view.test.ts:177`; `RunDetail.tsx:73` detailLines + `:275` DetailBox | ✅ · deferred (ado variant fold-tested + eyeball per design risk log) |
| WHF-16 agent detail box (pill+badge+prompt+data) | `agent`/`agentResult` folded `workflow-run-view.ts:161/182`, tested `:127/151`; `RunDetail.tsx:288` AgentBox (permission pill, emit badge, prompt, data entries) | ✅ · deferred |
| WHF-17 header + relative time + status pill pulse | `startedAt` folded `workflow-run-view.ts:205`, `relativeTime` tested `relative-time.test.ts`; `RunDetail.tsx:137` header + `:145` relativeTime + `:148` status pill w/ dot | ✅ · deferred |
| WHF-18 INPUTS strip | `input` folded `workflow-run-view.ts:204`, tested `workflow-run-view.test.ts:43`; `RunDetail.tsx:159` inputs strip / faint "no inputs" | ✅ · deferred |
| WHF-19 respond panel + session note | `blockedSessionId` folded `workflow-run-view.ts:246`, tested `workflow-run-view.test.ts:266`; `RunDetail.tsx:342` RespondPanel + `:360` session `--resume` note | ✅ · deferred |
| WHF-20 failed footer | `error/stdout/code` folded `workflow-run-view.ts:222`, tested `workflow-run-view.test.ts:230`; `RunDetail.tsx:395` FailedFooter | ✅ · deferred |
| WHF-21 hifi definition cards + rail header | `WorkflowsView.tsx:79` "N defined" + `:118` pipeline tile + `:141` play Run + `:146` broken tile/pill/error | ✅ · deferred |
| WHF-22 RECENT RUNS meta + relative time | `WorkflowsView.tsx:183` meta line + `:185` relativeTime | ✅ · deferred |
| WHF-23 pipeline glyph on segment | `Icon.tsx:25/158` `workflow-nodes` path; `TopBar.tsx:132` segment uses it (not git-fork) | ✅ · deferred |
| WHF-24 hifi run-workflow dialog | `WorkflowTriggerDialog.tsx:31` missingRequired + `:57` required `*` + `:62` placeholder=key + `:76` disabled + `:51` "just run it" | ✅ · deferred |

**Renderer ACs: 14/14 data-path present; visual fidelity deferred to owner two-example UI gate (per spec convention).**

---

## Discrimination Sensor

Sensor depth: **expanded (6 mutations)** — P1 MVP core enrichment logic. Each applied to scratch state, targeted test run, then `git checkout` restore (tree confirmed clean after each).

| # | File:line | Description | Killed? |
| - | --------- | ----------- | ------- |
| a | `run-state.ts:52` | step lifecycle fold guard → always-append (drop `running` guard) | ✅ Killed (3 fails: pending/terminal/blocked no-op) |
| b | `workflow-manager.ts:166` | `finishStep` durationMs → `-1` constant | ✅ Killed (WHF-02 non-negative durationMs) |
| c | `workflow-manager.ts:151` | `startStep` drop `#stepSeq++` (break monotonicity) | ✅ Killed (WHF-01 monotonic stepIds) |
| d | `workflow-ctx.ts:375` | agent onStart drop `?? 'read'` permission default | ✅ Killed (WHF-05 default permission read) |
| e | `workflow-run-view.ts:132` | `groupRollup` swap failed>blocked precedence | ✅ Killed (groupRollup "failed beats everything") |
| f | `workflow-run-view.ts:102` | `stepStatus` return 'done' regardless of `ok` | ✅ Killed (stepStatus "failed when finished and ok:false") |

**Result: 6/6 mutations killed — PASS. No surviving mutants.**

---

## Gate Check

- **Commands**: `npm run typecheck && npm run lint && npm test`, plus `npm run build`.
- **typecheck**: ✅ pass (typecheck:node + typecheck:web, exit 0)
- **lint**: ✅ 0 errors (18 pre-existing prettier warnings, all in `scripts/smoke-*.mjs` — not feature files, not a regression)
- **test**: ✅ **486 passed / 486**, **36 files / 36** (matches expected baseline). 0 failed, 0 skipped.
- **build**: ✅ built in ~3s (renderer + main bundles emitted)
- `tree.test.ts` (AD-005 real-git flake): did not flake this run — full suite green in one pass.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / no scope creep | ✅ additive StepEvent growth; `ok` flag justified as Tech Decision |
| Surgical changes, reuse-first | ✅ extends instrument/#apply/#emit/fold/dialog chassis per design |
| Matches patterns | ✅ pure reducer stays clock-free; clock/stepId in manager |
| Spec-anchored outcome check | ✅ asserted values match spec outcomes (backend 10/10) |
| Per-layer coverage | ✅ backend domain 1:1 AC mapping; renderer fold logic unit-tested, components hand-verified per convention |
| Every test maps to a requirement | ✅ new tests tagged WHF-01..10 / fold / relative-time; existing WF2/WF3/WF4 suites preserved |
| Documented guidelines | Project convention: renderer hand-verified (spec §Out of Scope) |

---

## Edge Cases

- [x] Running step pulses, no duration until finish — `stepStatus` running + `RunDetail.tsx:241` guards `node.finished`
- [x] Agent `data` absent when blocked — `AgentBox` `entries=[]` unless `done` (`RunDetail.tsx:297`); fold leaves `agentResult` undefined
- [x] `stdout`/`code` absent on failure — `FailedFooter` conditionals `RunDetail.tsx:403/404`; fold `workflow-run-view.test.ts:230` reads present case
- [x] Mixed group child statuses → worst-first precedence — `groupRollup` `workflow-run-view.test.ts:325`
- [x] Relative time crosses boundary — `relative-time.test.ts:21` (59s→just now, 61s→1m ago); 30s tick `RunDetail.tsx:106`

---

## Known SPEC_DEVIATION (author-reported, confirmed benign)

`@keyframes pulse` is materialised component-locally in `RunDetail.css:14` and `WorkflowsView.css:21` because `global.css` (lines 114/125/136) only defines `fadeIn`/`popIn`/`toastIn` — the handoff assumed `pulse` pre-existed. Confirmed benign: `pulse` is a name the handoff already referenced (no NEW named animation beyond the handoff's set was introduced), and no new color tokens/raster assets were added. Honors the handoff constraint "no new tokens/keyframes" in spirit — `pulse` is the handoff's own keyframe, just given a home. Recorded, not a gap.

---

## Requirement Traceability Update

| Requirement | Previous | New |
| ----------- | -------- | --- |
| WHF-01..10 (backend, unit) | Design | ✅ Verified (unit) |
| WHF-11..24 (renderer, hand-verified) | Design | ✅ Data-path Verified · visual deferred to owner two-example UI gate |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 10/10 backend unit ACs matched the spec-defined outcome (payload/conjunction rule satisfied — values asserted, not just calls); 14/14 renderer ACs have a present data path (fold produces the field, component reads it), visual fidelity deferred to the owner-run two-example UI gate per project convention. No spec-precision gaps.

**Sensor**: 6/6 mutations killed (reducer guard, manager duration, stepId monotonicity, permission default, group rollup precedence, step status).

**Gate**: typecheck ✅ · lint ✅ (0 errors) · test ✅ 486/486 (36 files) · build ✅.

**What works**: full backend enrichment (stepKind/stepId/durationMs/ok, agent envelope, failure evidence, run-started, sessionId-on-blocked) is unit-tested and spec-anchored; the pure renderer fold (stepStatus/groupRollup/StepNode/RunView seeding) is unit-tested; the hifi components consume every folded field.

**Issues found**: none.

**Next steps**: run the owner two-example UI gate (implement-ticket + review-pr + a deliberately-failing workflow) to close the hand-verified visual proof for WHF-11..24.
