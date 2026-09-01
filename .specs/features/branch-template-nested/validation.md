# Branch Template Aninhado — Validation Report

**Date**: 2026-09-01
**Spec**: `.specs/features/branch-template-nested/spec.md` (24 ACs: BRANCH-01..06, TEMPLATE-01..06, PARENT-01..05, DIALOG-01..04, CONFIG-01..03)
**Diff range**: `61e648d..HEAD` (base = `docs(specs): plan branch-template-nested`; 8 feature commits T1..T8)
**Verifier**: independent sub-agent (author ≠ verifier; read-only over the real tree; mutations only in scratch)

## Validation: PASS

Completion gate verdict: the feature is **verified done**. 23/24 ACs carry direct evidence (18 unit-asserted + CONFIG-01 build-gate + 4 renderer ACs wiring-evidenced per project convention); the single exception — PARENT-02 — is a spec-wording vs design tech-decision discrepancy (`{id,title}` payload instead of `WorkItemDetails title/type/state`) whose functional outcome is satisfied. Discrimination sensor: 3/3 mutations **killed**. Gate: typecheck 0 errors, lint 0 errors, **662/662 tests pass**. Non-blocking findings (spec wording reconciliation, CDP-smoke evidence pending, prettier warnings, one stale tasks.md bullet, one edge-case divergence) are fully documented in Code Quality and Fix Plans and do not block the merge.

---

## Task Completion

| Task | Scope | Status | Evidence |
| ---- | ----- | ------ | -------- |
| T1 | `taskIdFromBranch` last-segment rule + tests | ✅ | `src/shared/tasks.ts:50-56`, `src/shared/tasks.test.ts:115-162` |
| T2 | `branchNameFor` `{dev}`/`{usId}`/`{usSlug}` + tests | ✅ | `src/shared/tasks.ts:24-40`, `src/shared/tasks.test.ts:55-112` |
| T3 | `ado.devAlias` config field | ✅ | `src/shared/config.ts:60-61,91` |
| T4 | `parseParentRefs` + `parentRefs` in relations result | ✅ | `src/main/ado-gateway.ts:72-84,200`, tests `ado-gateway.test.ts:166-198` |
| T5 | `AdoGateway.parentOf` | ✅ | `src/main/ado-gateway.ts:211-220`, tests `ado-gateway.test.ts:240-287` |
| T6 | `tasks:parent` IPC channel + handler | ✅ | `src/shared/ipc-contract.ts:81-82`, `src/main/index.ts:214-220` |
| T7 | Start-work dialog parent resolution + guarded re-prefill | ✅ | `src/renderer/src/components/StartWorkDialog.tsx:47-54,79-119` |
| T8 | App threads `devAlias` into dialog | ✅ | `src/renderer/src/App.tsx:79,129,361,373` |

> ⚠️ `tasks.md:87` (T1 "Done when") states `feature/123-fix-456 → 456` ("last segment `fix-456`"), but the branch splits into `feature` / `123-fix-456` — the last segment's first standalone number is `123`, matching **spec BRANCH-04** (line 56) and the delivered test (`tasks.test.ts:122`). The **spec** (source of truth) and the implementation agree on `123`; only the tasks.md bullet is stale/incorrect.

---

## Spec-Anchored Acceptance Criteria (24)

Evidence-or-zero: each AC cites the assertion `file:line` with the exact expected value. `WIRING` = behavior guaranteed by renderer code inspection + typecheck, no unit assertion (per project renderer convention); `BUILD` = compile-time/typecheck evidence.

### BRANCH-01..06 — `taskIdFromBranch` last-segment rule

| Criterion | Spec-defined outcome | file:line + assertion | Status |
| --------- | -------------------- | --------------------- | ------ |
| BRANCH-01 | `user/jdoe/10001-user-story/10002-nested-branch` → `10002` (leaf segment, not first) | `src/shared/tasks.test.ts:126-128` — `taskIdFromBranch('user/jdoe/10001-user-story/10002-nested-branch')` `.toBe(10002)` | ✅ PASS |
| BRANCH-02 | Single-id formats byte-identical: `feature/4821-add-oauth-refresh-token-rotation` → `4821`; `bugfix/12-fix-login` → `12` | `src/shared/tasks.test.ts:116-119` — `.toBe(4821)` / `.toBe(12)` | ✅ PASS |
| BRANCH-03 | Hand-typed branches: `user/otavio/4821-quick-spike` → `4821`; bare `4821` → `4821` | `src/shared/tasks.test.ts:143-146` — `.toBe(4821)` / `.toBe(4821)` | ✅ PASS |
| BRANCH-04 | Multi-number **within last segment**: first standalone wins — `feature/123-fix-456` → `123` | `src/shared/tasks.test.ts:121-123` — `.toBe(123)` | ✅ PASS |
| BRANCH-05 | No standalone 2+ digit in last segment → `null`: `main`, `feature/dark-mode`, `oauth2-rework`, `(detached abc1234)` | `src/shared/tasks.test.ts:159-162` (`.toBeNull()` `main`/`feature/dark-mode`); `:149` (`oauth2-rework`); `:151` (`(detached abc1234)`); `:135-137` (last-segment-no-number `user/jdoe/user-story`) | ✅ PASS |
| BRANCH-06 | Number adjacent to letter/digit → no match: `feature/sso2024migration` → `null` | `src/shared/tasks.test.ts:150` — `.toBeNull()` | ✅ PASS |

### TEMPLATE-01..06 — `branchNameFor` placeholders

| Criterion | Spec-defined outcome | file:line + assertion | Status |
| --------- | -------------------- | --------------------- | ------ |
| TEMPLATE-01 | `{dev}` ← `devAlias` (empty string when absent) | `src/shared/tasks.test.ts:56-60` — `'user/{dev}/{id}-{slug}'` + `{devAlias:'jdoe'}` → `'user/jdoe/10002-nested-branch'`; absent-alias case `:88-91` (parent-only ctx → `{dev}` segment dropped) | ✅ PASS |
| TEMPLATE-02 | `{usId}`/`{usSlug}` ← parent `id` / `slugOf(title)` (empty when absent) | `src/shared/tasks.test.ts:64-69` — `parent:{id:10001,title:'User story'}` → `'user/jdoe/10001-user-story/10002-nested-branch'`; absent-parent case `:84-86` (segment dropped) | ✅ PASS |
| TEMPLATE-03 | Full context + `user/{dev}/{usId}-{usSlug}/{id}-{slug}` → `user/<dev>/<us-id>-<slug-of-us>/<task-id>-<slug-of-task>` | `src/shared/tasks.test.ts:73-78` — `'user/jdoe/10001-configuracao-de-ambiente/10002-nested-branch'` | ✅ PASS |
| TEMPLATE-04 | Empty placeholder data → empty path segment dropped by sanitizer | `src/shared/tasks.test.ts:81-95` — no parent → `'user/jdoe/10002-nested-branch'`; no alias → `'user/10001-user-story/10002-nested-branch'`; whitespace alias `'   '` → `'user/10002-nested-branch'` | ✅ PASS |
| TEMPLATE-05 | Default / `{type}`/`{id}`/`{slug}`-only templates byte-identical **with ctx present** | `src/shared/tasks.test.ts:97-103` — `null` template + ctx → `'feature/4821-add-oauth-refresh-token-rotation'`; `'task/{id}'` + ctx → `'task/42'` | ✅ PASS |
| TEMPLATE-06 | Unknown placeholder passes through literally | `src/shared/tasks.test.ts:105-112` — `'{user}/{id}-{slug}'` + ctx → `'{user}/3-thing'` | ✅ PASS |

### PARENT-01..05 — ADO gateway + IPC

| Criterion | Spec-defined outcome | file:line + assertion | Status |
| --------- | -------------------- | --------------------- | ------ |
| PARENT-01 | `getWorkItemWithRelations` exposes `parentRefs` from `Hierarchy-Reverse` (besides `childRefs`) | `src/main/ado-gateway.test.ts:166-198` (`parseParentRefs` maps only Reverse, tail id, parent org/project, `[]` for undefined); `:60-107` (`getWorkItemWithRelations` → `childRefs:[101,102]` **and** `parentRefs:[{id:7,...}]`); `:109-119` (no relations → `parentRefs:[]`) | ✅ PASS |
| PARENT-02 | Dialog requests parent of a Task with a US parent → app returns that parent's `WorkItemDetails` **(title/type/state)** | `src/main/ado-gateway.test.ts:240-248` — `.toEqual({ ok: true, parent: { id: 7, title: 'Parent story' } })` | ⚠️ **spec-precision gap** — the delivered `ParentOfResult.parent` is `{ id, title }` (`src/shared/tasks.ts:100-103`), **not** `WorkItemDetails { title, type, state }` as written in the AC. Design tech decision `design.md:181` ("Template only needs id + title; keeps the IPC payload minimal"). Functional intent met; spec wording not reconciled. |
| PARENT-03 | No parent → `null` | `src/main/ado-gateway.test.ts:250-255` — `.toEqual({ ok: true, parent: null })` | ✅ PASS |
| PARENT-04 | Auth failure / call errors → degrade to `null` rather than throw | Auth half: `src/main/ado-gateway.test.ts:280-287` — `.toEqual({ ok: false, reason: 'auth', error: ... })` + cached token cleared. Error half guaranteed in the **dialog**, not the gateway: `getWorkItemWithRelations` throws on non-auth HTTP/network errors (`src/main/ado-gateway.ts:185-187`) → `ipcMain.handle` rejects → renderer `.catch(() => setParent(null))` (`src/renderer/src/components/StartWorkDialog.tsx:113-115`); ok-but-non-auth result maps `result.ok ? result.parent : null` (`:110-111`) | ✅ PASS (auth unit-asserted at gateway; non-auth degrade = WIRING in dialog, no unit test per renderer convention) |
| PARENT-05 | Several Hierarchy-Reverse parents → first returned | `src/main/ado-gateway.test.ts:257-268` — `[parentLink(7), parentLink(8)]` → `.toEqual({ ok: true, parent: { id: 7, title: 'First story' } })` | ✅ PASS |

### DIALOG-01..04 — Start-work dialog wiring (renderer; no unit tests per project convention — `tasks.md:26`, spec `spec.md:114`)

| Criterion | Spec-defined outcome | file:line + evidence | Status |
| --------- | -------------------- | -------------------- | ------ |
| DIALOG-01 | On open: resolve parent + prefill from effective template (workspace `.app/` override → global) with `devAlias` + parent | `StartWorkDialog.tsx:47-50` (initial prefill w/ `{devAlias}`); `:79-102` (override effect re-runs `branchNameFor(..., branchOverride ?? branchTemplate, { devAlias, parent })`); `:106-119` (parent resolution on open) | ⚠️ WIRING (no unit assertion; typechecked) |
| DIALOG-02 | Pending resolution: prefill uses data so far; updates when parent arrives; never overwrites user-edited branch | `StartWorkDialog.tsx:47-50` (data-so-far prefill); `:102` (`parent` in effect deps → re-run on arrival); `:87` (`!branchEdited.current` guard) | ⚠️ WIRING (no unit assertion; typechecked) |
| DIALOG-03 | User edits branch field → template never re-applies | `StartWorkDialog.tsx:236-240` (`onChange` sets `branchEdited.current = true`); `:87` guard skips re-prefill | ⚠️ WIRING (no unit assertion; typechecked) |
| DIALOG-04 | Nested branch → live worktree-path preview reflects it | `StartWorkDialog.tsx:244-251` — `worktreePathFor(repoPath, branch, effectiveWorktreeTemplate)` derives from `branch` state (unchanged behavior) | ⚠️ WIRING (no unit assertion; typechecked) |

### CONFIG-01..03 — `ado.devAlias`

| Criterion | Spec-defined outcome | file:line + assertion | Status |
| --------- | -------------------- | --------------------- | ------ |
| CONFIG-01 | `AppConfig.ado` includes `devAlias: string`, default `''` | `src/shared/config.ts:60-61` (interface field), `:91` (`devAlias: ''` in `DEFAULT_CONFIG.ado`); round-trip via `src/main/config-store.test.ts:22,39` (`store.get()` `toEqual(DEFAULT_CONFIG)`) | ✅ PASS (BUILD/typecheck; no dedicated unit test per matrix "none") |
| CONFIG-02 | Empty/whitespace `devAlias` → `{dev}` renders empty (segment dropped) | `src/shared/tasks.test.ts:92-93` — `{ devAlias: '   ' }` → `'user/10002-nested-branch'`; absent-alias `:88-91` | ✅ PASS |
| CONFIG-03 | Set `devAlias` → `branchNameFor` uses it for `{dev}` | `src/shared/tasks.test.ts:56-60` (`'jdoe'` → `'user/jdoe/...'`); plumbing `src/renderer/src/App.tsx:129,361,373` | ✅ PASS |

**Tally**: 19/24 matched with concrete assertion/build-gate evidence (18 unit-asserted + CONFIG-01 build-gate) · 4/24 wiring-evidenced (DIALOG-01..04, renderer convention) · 1/24 spec-precision gap (PARENT-02).

---

## Edge Cases (spec.md:136-140)

| Edge case | Outcome required | Evidence | Status |
| --------- | ---------------- | -------- | ------ |
| Parent is Feature/Epic (not US) | Immediate parent id/title used regardless of type | `parentOf` has no type filter (`src/main/ado-gateway.ts:211-220`); first `Hierarchy-Reverse` parent wins by construction | ✅ by construction (no dedicated test) |
| Trailing/duplicated slashes | Last **non-empty** segment wins | `src/shared/tasks.test.ts:139-141` — `taskIdFromBranch('feature/4821/')` → `4821`; duplicated slashes handled by `split('/').filter(seg !== '')` (`tasks.ts:51`) | ✅ (trailing tested; duplicated by construction) |
| `{usSlug}` empty, `{usId}` present | Trailing separators trimmed (`10001-` → `10001`) | Segment trim `tasks.ts:37` (`segment.replace(/^-+|-+$/g, '')`); analogous `{id}-{slug}` empty test `tasks.test.ts:32-35` | ✅ by construction + analogous test |
| Pinned item has no live details (auth down) | Keep disabled-start; **parent resolution not attempted** | Disabled start preserved: details null → branch `''` (`StartWorkDialog.tsx:48-50`), `canCreate` needs non-empty branch (`:125`). **Divergence:** the `tasks:parent` effect (`:106-119`) fires regardless of `task.details` — resolution **is** attempted (harmless: degrades to `null`, no blocking) | ⚠️ minor spec divergence (outcome preserved; spurious IPC call) |
| Branch uses only parent slot (`user/<dev>/<us-id>-<slug>`) | Last segment number (US id) wins → tags `#<us-id>` | `src/shared/tasks.test.ts:131-133` — `'user/jdoe/10001-user-story'` → `.toBe(10001)` | ✅ PASS |

**Additional observations**:
- Spec Success Criteria `{repo}-{id}` folder template (spec.md:181): `taskIdFromBranch` is consumed by `worktreeNameFor`/`worktreePathFor` (`src/shared/worktrees.ts:31`) and tested at `worktree-manager.test.ts:205,244-245` for single-id branches; no unit test exercises the **nested** format through the folder template (leaf id `10002`). Shared logic is identical — by-construction coverage only.
- Spec Independent Test for PARENT (spec.md:97) mentions a "TaskBoard/`tasks:parent` handler test with a stubbed source (parent present / absent / auth-fail)". No such handler test was added — `index.ts:220` is a thin delegation (`parentOf`), and per the tasks.md matrix thin IPC shells carry no tests. Test-plan divergence, not an AC failure (the gateway layer IS unit-tested for those three outcomes).
- Discrimination depth note: within `tasks.test.ts`, the last-segment rule is discriminated by exactly **one** assertion (BRANCH-01). The `user/otavio/4821-quick-spike` and `feature/123-fix-456` cases do **not** distinguish last-segment vs whole-branch regex (single-number branches and first-in-whole-branch happen to agree). Confirmed empirically in the sensor (M1 killed only BRANCH-01).

---

## Discrimination Sensor (scratch `D:\temp\wt-sensor-brn01`, branch `sensor-brn01` @ b44fb77)

Mutated in scratch only (`git worktree` + `node_modules` junction to the real tree). Command: `npx vitest run src/shared/tasks.test.ts src/main/ado-gateway.test.ts` (baseline in scratch: 40/40 pass).

| Mutation | Area | Change | Expected victim | Result | Depth (tests failed) |
| -------- | ---- | ------ | --------------- | ------ | -------------------- |
| M1 | `taskIdFromBranch` | Reverted to whole-branch regex (drop last-segment split) | BRANCH-01 nested → 10002 | **KILLED** — `expected 10001 to be 10002` (`tasks.test.ts:128`). Note: `user/otavio/4821-quick-spike` still **passes** under whole-branch regex (single-number branch), so M1's predicted second victim does not discriminate. | 1 |
| M2 | `branchNameFor` | Removed `.replaceAll('{usId}', ...)` (usId never renders) | TEMPLATE-02/03 | **KILLED** — TEMPLATE-02 (`{usId}` literal in output), TEMPLATE-03, TEMPLATE-04 (empty-parent case keeps `{usId}` segment) all fail. | 3 |
| M3 | `parentOf` | Return `{ ok: true, parent: null }` unconditionally (ignore `parentRefs`) | PARENT-02 | **KILLED** — PARENT-02 and PARENT-05 fail (`expected {parent:{id:7,...}} to be {parent:null}`). | 2 |

**Sensor result**: 3 mutations, **3 killed / 0 survived**. No mutation slipped past the suite. Depth is shallow (1-3 tests each) but every regression vector is caught.

Scratch discarded (`worktree remove --force` + temp branch `sensor-brn01` deleted + leftover dir removed). Real tree re-verified: `git status --porcelain` **identical to baseline** (clean).

---

## Code Quality

| Check | Result |
| ----- | ------ |
| Surgical / no scope-creep | ✅ 12 files changed (385+/65−); every file is in the feature's declared scope (tasks/config/gateway/ipc/index/dialog/App + co-located tests + the two spec docs). No unrelated edits. |
| Design approach respected | ✅ **Approach A** (on-demand `parentOf` + `tasks:parent` IPC) — `design.md:45`; implemented via `ado-gateway.ts:211-220`, `ipc-contract.ts:81-82`, `index.ts:214-220`, `StartWorkDialog.tsx:106-119`. |
| Additive, non-breaking | ✅ `branchNameFor` optional `ctx` (`tasks.ts:27`); `GetWorkItemWithRelationsResult` gains a field (additive); existing callers/tests unchanged (`workflow-ctx.test.ts` fakes updated with `parentRefs: []` only). |
| Test conventions (TESTING.md) | ✅ Co-located `*.test.ts`; no mocks — injected `fetchFn` + seeded token cache (`ado-gateway.test.ts:9-14,206-238`); renderer components carry no unit tests (convention). |
| One shared `AdoGateway` instance | ✅ `index.ts:214-215,220` — hoisted const used by both `TaskBoard` and `tasks:parent` (no second `new AdoGateway()`; T6 requirement). |
| `spec.md` traceability | ✅ All 24 ACs marked **Verified** (`spec.md:148-171`). |
| Lint hygiene (feature files) | ⚠️ 0 errors, but **15 new prettier/prettier warnings** in feature test files (`ado-gateway.test.ts` ×6: 217,222,262-265; `tasks.test.ts` ×9: 65-77,99). 18 further warnings pre-exist in `scripts/*` (untouched). `npm run format` not applied to the new test code. |
| Doc consistency | ⚠️ `tasks.md:87` asserts `feature/123-fix-456 → 456` — contradicts spec BRANCH-04 (`→ 123`) and the delivered test. Spec + implementation are correct; tasks.md bullet is stale. |

---

## Gate Check (real tree, read-only)

| Command | Result | Counts |
| ------- | ------ | ------ |
| `npm run typecheck` (node + web) | ✅ PASS | 0 errors |
| `npm run lint` | ✅ PASS (exit 0) | **0 errors, 33 warnings** (15 feature-introduced prettier warnings in `ado-gateway.test.ts`/`tasks.test.ts`; 18 pre-existing in `scripts/*`) |
| `npm test` | ✅ PASS | **662 passed, 0 failed** (44 files) — baseline 645 → **+17** (10 new in `tasks.test.ts` + 7 new in `ado-gateway.test.ts`), matching the expected post-feature count |

Failures: 0. `npm run typecheck && npm run lint && npm test` all green.

---

## Fix Plans (non-blocking)

Ranked by severity:

1. **PARENT-02 spec-precision** — the AC says the parent comes back as `WorkItemDetails` (title/type/state); the delivered contract is `{ id, title }` (`ParentOfResult`). Either update spec PARENT-02 to the agreed `{ id, title }` shape (design.md:181 already records the tech decision) or extend `parentOf` to include type/state. Recommend **spec wording update** — nothing downstream consumes type/state.
2. **Renderer ACs without runtime evidence (DIALOG-01..04, PARENT-04 error half)** — no unit tests by convention; the async re-prefill/guard behavior is wiring-only. Run the post-Execute **CDP smoke** (`tasks.md:37` manual gate) and attach its evidence; without it these 4 ACs rest on code inspection + typecheck.
3. **Prettier warnings in new test code (15)** — run `npm run format` on `src/shared/tasks.test.ts` + `src/main/ado-gateway.test.ts` (or `--fix`). Cosmetic; CI lint stays exit-0.
4. **`tasks.md:87` stale bullet** — fix the T1 "Done when" expectation to `feature/123-fix-456 → 123` (matches spec BRANCH-04).
5. **Edge case: parent resolution fired with no details** — gate the `tasks:parent` effect on `task.details` presence to honor the spec's "parent resolution is not attempted" (outcome already correct; removes a spurious IPC call under auth-down).
6. **Discrimination depth (M1)** — only BRANCH-01 separates last-segment from whole-branch parsing. Consider a second discriminating assertion (e.g. a multi-segment branch whose middle segment holds a different number) to make the rule resilient to test-order drift. Informational.

---

## Summary

**Verdict: ✅ Ready (PASS)** — feature is functionally complete, all 24 ACs are satisfied or spec-justified, gate is green (typecheck 0, lint 0 errors, 662/662 tests), the discrimination sensor killed 3/3 mutations, and the diff is surgical and additive. Remaining items are reconciliation/hygiene, not blockers: one spec-precision gap (PARENT-02 payload shape, design-justified), renderer ACs resting on wiring rather than runtime evidence (convention + CDP smoke pending), 15 prettier warnings in new test files, one stale `tasks.md` bullet, and a minor edge-case divergence (parent IPC fired without live details).

Ranked gaps: PARENT-02 spec wording → CDP smoke evidence for DIALOG-01..04 → prettier warnings → tasks.md:87 bullet → parent-resolution gating → discrimination depth (informational).

---

## Post-verification fixes (commits 757e191, c15589c)

All non-blocking gaps except the manual CDP smoke were closed in the same session:

| Gap | Fix | Commit |
| --- | --- | ------ |
| 1. PARENT-02 spec wording | `spec.md` PARENT-02 rewritten to the delivered `{ id, title }` contract (design tech decision) | 757e191 |
| 4. `tasks.md:87` stale bullet | T1 "Done when" corrected to `feature/123-fix-456 → 123` | 757e191 |
| 5. Parent resolution fired with no details | `StartWorkDialog.tsx` gates the `tasks:parent` effect on `task.details` presence (honors the spec edge case) | 757e191 |
| 3. Prettier warnings (15) | `prettier --write` on `tasks.test.ts` + `ado-gateway.test.ts` — lint back to the 18 pre-existing warnings only | c15589c |
| 2. CDP smoke (DIALOG-01..04 runtime evidence) | **OUTSTANDING — manual, owner-run** (`tasks.md:37` manual gate) | — |
| 6. Discrimination depth (M1) | informational; BRANCH-01 discriminates the last-segment rule | — |

Gate re-run after fixes: typecheck 0 errors, lint 0 errors / 18 pre-existing warnings, **662/662 tests pass**.