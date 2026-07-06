# Workflows UI (WF5) — Independent Verification

**Verdict: PASS** (automated scope). The remaining owner-run UI smoke is out of scope for
automated verification — see "Remaining owner-run gate" below.

**Verifier**: independent (author ≠ verifier), read-only over the real tree; all mutations run
in scratch state and discarded (`git checkout --`). No source was fixed.

**Range covered**: `git diff 660180b..HEAD` on branch `feature/workflows-ui` — 11 commits
`5f0ad4d..1c5b84c` (10 task commits T1–T10 + one test-hardening commit `268759c`).

---

## 1. Gate check (deterministic)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Typecheck | `npm run typecheck` | **PASS** — exit 0, 0 errors |
| Lint | `npx eslint <12 WF5 files>` | **PASS** — exit 0, 0 errors, 1 prettier warning (`workflow-run-view.ts:72`, a line-wrap suggestion; tolerated per convention) |
| Tests | `npm test` (`vitest run`, all files) | **PASS** — 35 files, **440 passed** (baseline 422 + 18 new). Duration ~90s. No `tree.test.ts` (AD-005) flake observed. |

The +18 new tests = 12 in `workflow-run-view.test.ts` + 6 in `workflow-scaffold.test.ts`
(matches the "+18 expected → 440" gate target).

---

## 2. Spec-anchored coverage (evidence-or-zero)

Re-derived independently from `spec.md` (WF5-01..25). Every AC has located code evidence and
its asserted/rendered value matches the spec-defined outcome. "unit" = an assertion in a test
file; "hand-verified" = implementing code located (proof deferred to the owner-run UI gate, per
the project's UI convention — mirrors WF4-15/16/17).

| AC | Type | Evidence (file:line) | Spec outcome matched? |
| -- | ---- | -------------------- | --------------------- |
| WF5-01 direction + 4th tab | hand-verified | `src/shared/config.ts:37` union has `'workflows'`; `TopBar.tsx:134-136` 4th tab → `onDirectionChange('workflows')`; `App.tsx:299-300` render branch | ✅ |
| WF5-02 list valid + broken | hand-verified | `WorkflowsView.tsx:93-122` — `'meta' in def` → name+desc+Run; else → id + `def.error`, no Run button | ✅ |
| WF5-03 broken never hides others | hand-verified | `WorkflowsView.tsx:93` `defs.map(...)` renders every entry | ✅ |
| WF5-04 session-lived across switch | unit + hand-verified | fold accumulation `workflow-run-view.ts:44-51` (upsert) unit-tested `...test.ts:113-121`; hook mounted above ternary `App.tsx:107` | ✅ |
| WF5-05 dialog from `meta.inputs` | hand-verified | `WorkflowTriggerDialog.tsx:46-59` one field per input, `input.label` label | ✅ |
| WF5-06 required gates submit | hand-verified | `WorkflowTriggerDialog.tsx:27` `missingRequired`; `:68` `disabled={missingRequired}` | ✅ |
| WF5-07 submit → `workflows:run {id,input}` | hand-verified | `WorkflowsView.tsx:158-159` `onRun(id,input)` → `App` `onRun={workflows.start}` → `use-workflow-runs.ts:91` `api.invoke('workflows:run',{id,input})` | ✅ |
| WF5-08 no-inputs → direct run `{}` | hand-verified | `WorkflowTriggerDialog.tsx:23-25` values init `{}`; `:43-45` empty-form note; Run enabled (missingRequired=false) submits `values`=`{}` | ✅ |
| WF5-09 subscribe/teardown by runId | hand-verified | `use-workflow-runs.ts:53-84` subscribes status/step/log/blocked, returns teardown of all four; per-`runId` folding in `upsert` | ✅ |
| WF5-10 `workflow:step` → labelled row | **unit** (fold) + hand-verified (render) | `workflow-run-view.test.ts:59-66` asserts `[{kind:'step',label:'create worktree',group:'g1'}]`; render `RunDetail.tsx:55-56` | ✅ |
| WF5-11 `workflow:log` → grouped line | **unit** (fold) + hand-verified (render) | `workflow-run-view.test.ts:68-76` asserts `[{kind:'log',message:'fetching',group:'g1'}]`; render `RunDetail.tsx:57-58` + `.grouped` class `:53` | ✅ |
| WF5-12 `workflow:status` → badge | **unit** (fold) + hand-verified (render) | `workflow-run-view.test.ts:17-21` status→`done`; idempotent `:23-28`; render `RunDetail.tsx:30` | ✅ |
| WF5-13 `failed` badge, no reason | hand-verified | `RunDetail.tsx:30` renders badge only; `RunView` carries no error field (`workflow-run-view.ts:18-26`) | ✅ |
| WF5-14 `workflow:blocked` → respond panel | **unit** (fold) + hand-verified (render) | `workflow-run-view.test.ts:92-99` sets `blocked` question; render `RunDetail.tsx:38-44` → `RespondPanel` shows `title`/`body` `:83-84` | ✅ |
| WF5-15 Abort → `{action:'abort'}` | hand-verified | `RunDetail.tsx:41` `onAbort` → `onRespond(runId,{action:'abort'})`; hook `use-workflow-runs.ts:101` `api.invoke('workflows:respond',{runId,decision})` | ✅ |
| WF5-16 guidance → `{action:'guidance',guidance}` + hide | hand-verified + unit (clear) | `RunDetail.tsx:42` `onGuidance`→`{action:'guidance',guidance}`; panel hidden once `blocked` cleared on resume — fold clear unit-tested `workflow-run-view.test.ts:30-37` | ✅ |
| WF5-17 `focus-run` → switch + open | hand-verified | `App.tsx:153-160` `on('workflow:focus-run')` → `setUi(direction:'workflows')` + `selectRun(runId)`, teardown via returned `off` | ✅ |
| WF5-18 Cancel → `workflows:cancel` → `cancelled` | hand-verified | `RunDetail.tsx:21` `canCancel = running||blocked`; `:31-35` Cancel → `onCancel`; hook `:97` `api.invoke('workflows:cancel',{runId})` | ✅ |
| WF5-19 Run disabled while active | hand-verified | `WorkflowsView.tsx:55` `runActive`; `:105` `disabled={runActive}` | ✅ |
| WF5-20 serial-conflict surfaced | hand-verified | `use-workflow-runs.ts:91-94` `.catch` → `setError`; `WorkflowsView.tsx:82-86` renders `error` | ✅ |
| WF5-21 Reload re-invokes `workflows:list` | hand-verified | Reload button `WorkflowsView.tsx:63-69` → `onReload={workflows.refresh}`; `use-workflow-runs.ts:43-48` `api.invoke('workflows:list')` | ✅ |
| WF5-22 New workflow → `workflows:scaffold` | hand-verified | `NewWorkflowDialog.tsx:26-39` `onCreate`; `WorkflowsView` `onScaffold={workflows.scaffold}`; `use-workflow-runs.ts:107` `api.invoke('workflows:scaffold',{name})` | ✅ |
| WF5-23 scaffold creates valid template, returns path | **unit** | `workflow-scaffold.test.ts:43-52` `{ok:true,id,path}` + file exists; `:54-67` generated TS compiles → valid `meta`+`run` | ✅ |
| WF5-24 scaffold rejects existing id, no overwrite | **unit** | `workflow-scaffold.test.ts:69-80` `ok:false`, `/already exists/`, sentinel byte-for-byte untouched | ✅ |
| WF5-25 success → list refresh + reveal | hand-verified | `use-workflow-runs.ts:108` `if(res.ok) refresh()`; main `index.ts:315` `shell.showItemInFolder(result.path)` | ✅ |

**Edge cases (spec §Edge Cases) — all implemented:** empty `defs` empty-state
(`WorkflowsView.tsx:90-92`); broken def not runnable (`:112-121`, no Run button); unknown-runId
create-or-update (`workflow-run-view.ts:45-47`, unit `...test.ts:103-111`); empty guidance
disables Send (`RunDetail.tsx:99`); empty/invalid scaffold id rejected creating nothing
(`workflow-scaffold.ts:49`, unit `...test.ts:82-89`); idempotent repeated status
(`workflow-run-view.ts:64-68`, unit `...test.ts:23-28`).

**Coverage conclusion:** 25/25 ACs implemented with located evidence; the 5 unit-testable
outcomes (WF5-10/11/12 fold half, WF5-23/24) carry passing assertions matching the spec; the
rest are implemented renderer/IPC wiring, hand-verified by design.

---

## 3. Discrimination sensor (tested seams only)

Each mutant was injected one at a time into the real file, its test run in isolation, then
`git checkout --` restored the file. Baseline for both files: 18/18 pass.

### `workflow-run-view.ts` (fold)

| # | Mutation | Result | Killed by |
| - | -------- | ------ | --------- |
| A1 | `status` fold: `blocked: r.blocked` (never clear) | **KILLED** — 2 failed | "clears blocked on resume", "clears blocked on terminal (cancelled)" |
| A2 | `step` fold: `timeline: r.timeline` (drop appended row) | **KILLED** — 3 failed | "appends a step row", "preserves arrival order", "unknown-runId step never throws" |
| A3 | `upsert` create branch: `return runs` (ignore create) | **KILLED** — 3 failed | "creates run defensively for unknown runId", "idempotent on repeated status", "unknown-runId step" |

### `workflow-scaffold.ts`

| # | Mutation | Result | Killed by |
| - | -------- | ------ | --------- |
| B1 | id-folder `mkdir(path,{recursive:true})` (removes EEXIST no-overwrite guard) | **KILLED** — 1 failed | "rejects an existing id without overwriting the existing file" |
| B2 | `sanitizeWorkflowId` drops the `^-+|-+$` trim | **KILLED** — 3 failed | "lowercases/trims edges", "keeps hyphens/returns '' for all-invalid", "rejects empty/invalid name creates nothing" |

**Sensor result: 5 injected / 5 killed / 0 survived.** The two tested seams discriminate
behavior-level changes on every mutated branch.

---

## 4. Ranked gap list

**None.** Gate green, every AC has located evidence, no surviving mutant.

(Not a gap — an explicitly deferred surface:) failure `error`/`stdout`/`code` are not surfaced
in the UI (spec Out of Scope; `failed` badge only). Renderer components carry no unit tests by
project convention; their final proof is the owner-run gate below.

---

## Remaining owner-run gate (out of scope for automated verification)

The two-example end-to-end UI smoke — **"review PR"** and **"implement ticket"** driven through
the Electron GUI with a live agent (trigger → live timeline → blocker respond/toast focus →
finish) — is the milestone's hand-verified gate. It requires a real display + live agent and is
the **owner-run** step, analogous to WF4-17. It is not part of this automated verification and
is recorded here as the one remaining PASS condition for the feature as a whole.
