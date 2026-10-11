# Files Stack Steady Neighbours Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/files-stack-steady-neighbours/spec.md`
**Design**: inline (no `design.md`): one pure rule in `diff-view.ts`, applied in `DiffViewer`'s `measure`
**Status**: Done

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: none in the repo (no `AGENTS.md` / `CONTRIBUTING.md`); the floor comes from `src/renderer/src/lib/diff-view.test.ts` and `scripts/smoke-files-diff.mjs` (a new smoke check first seen failing on the current build, as #150 did).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Renderer pure rule (`lib/diff-view.ts`) | unit | Every branch; 1:1 to FSTD-02, 03, 04, 07, 08, 09 | `src/renderer/src/lib/*.test.ts` | `npx vitest run src/renderer/src/lib/diff-view.test.ts` |
| Renderer component (`DiffViewer`) | e2e (CDP smoke) | FSTD-05 on a built app; check seen failing before the wiring | `scripts/smoke-files-*.mjs` | `SMOKE_ONLY=steady node scripts/smoke-files-diff.mjs` (seed, launch, drive, clean) |
| Measurements (`validation.md`) | none | Bench rows with their commit | `.specs/features/*/validation.md` | `node scripts/bench-sessions.mjs --sessions 0 --files-view --edit-interval 1000` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run src/renderer/src/lib/diff-view.test.ts` |
| Full | After tasks with the smoke | `npm test` + `SMOKE_ONLY=steady node scripts/smoke-files-diff.mjs` on a fresh build |
| Build | After the last task, before the PR | `npm run typecheck && npm run lint && npm test` |

---

## Execution Plan

### Phase 1: Measure

Confirms or overturns the cause before any production change. If it overturns it, stop and go back to
the owner (spec, Assumptions).

```
T1
```

### Phase 2: Fix and validate

```
T2 → T3 → T4 → T5
```

---

## Task Breakdown

### T1: Measure the written section's height over a re-read

**What**: Record the "before" measurement in `validation.md`: the written section's reported heights over re-reads, the neighbours' editor-node survival, and the bench edit loop's `cat-file` per `files:changed`
**Where**: `.specs/features/files-stack-steady-neighbours/validation.md`
**Depends on**: None
**Reuses**: `scripts/bench-sessions.mjs` (`--files-view --edit-interval`), the CDP helpers of `scripts/smoke-files-diff.mjs`
**Requirement**: FSTD-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `## Measurements` holds a "before" block with the commit, the window size, the written section's height series around at least 3 re-reads, how many neighbour editors were remounted, and the bench steady rows
- [x] The block states whether the hypothesis held (height leaves the pre-read value) - if not, STOP and report
- [x] No production file changed (`git status` shows only `.specs/`)

**Status**: ✅ Complete - hypothesis held (180 → 503 px for a median 216 ms on every re-read); bench 6.07 `cat-file` per `files:changed`; gate 3168 tests, lint 0 errors / 18 warnings

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): measure the stack's height jump on a re-read`

---

### T2: Add the held-height rule

**What**: A pure `reportedHeight(measured, held, pending)` in `diff-view.ts`: the held height while a fold reading is pending and one exists, the measured height otherwise
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: None
**Reuses**: `readingBeforeUpdate` / `FoldReading` semantics (pending = a reading exists)
**Requirement**: FSTD-02, FSTD-04, FSTD-07, FSTD-08, FSTD-09

**Tools**:

- MCP: NONE
- Skill: `tdd`

**Done when**:

- [x] Tests in `diff-view.test.ts` first, with literal heights: pending + held → held; pending + no held (first mount) → measured; not pending → measured; consecutive pending measurements keep the first held value
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/diff-view.test.ts`
- [x] Test count: previous count + new tests, none removed

**Status**: ✅ Complete - 4 tests seen failing (`reportedHeight is not a function`), then 95/95 in `diff-view.test.ts` (91 + 4)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): hold a fitted diff's height while its folds are pending`

---

### T3: Add the steady-neighbours smoke check

**What**: A `SMOKE_ONLY=steady` section in the Files diff smoke: with the stack open and `fold/long.ts` folded, rewrite it in place 3 times and check that every other expanded section keeps the same `.monaco-diff-editor` node and that the written section never reports a height above its pre-read value
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T2
**Reuses**: `selectWorktree`, `check`, `liveDiffEditors`, the `fold/` seed
**Requirement**: FSTD-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The new checks run and are seen FAILING on the current build (recorded in `validation.md`)
- [x] The other `SMOKE_ONLY` sections are untouched

**Status**: ✅ Complete - 18a and 18b seen failing on the pre-fix build (3 removals; 151 → 3875 px); the full drive calls the section after the watch section and before section 14

**Tests**: e2e
**Gate**: full

**Commit**: `test(files): check that a rewrite leaves the stack's other editors`

---

### T4: Apply the rule in DiffViewer's measure

**What**: `measure` reports `reportedHeight(...)` to both `setHeight` and `onHeight`, with pending read from `pendingRef`; `onDidUpdateDiff` measures again right after re-applying the folds
**Where**: `src/renderer/src/components/DiffViewer.tsx`
**Depends on**: T3
**Reuses**: `reportedHeight` (T2), `pendingRef`
**Requirement**: FSTD-02, FSTD-03, FSTD-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] T3's smoke checks pass on a fresh build, and the full Files diff smoke still passes
- [x] Gate check passes: `npm test`
- [x] Test count: same as after T2

**Status**: ✅ Complete - steady 2/2, full drive 125/125, after-restart 1/1; `npm test` 3172 passed

**Tests**: e2e
**Gate**: full

**Commit**: `fix(files): keep the stack's neighbours mounted across a rewrite`

---

### T5: Measure after and record the decision

**What**: The "after" bench and smoke results in `validation.md`, and AD-062 in `STATE.md`
**Where**: `.specs/features/files-stack-steady-neighbours/validation.md`
**Depends on**: T4
**Reuses**: T1's measurement procedure
**Requirement**: FSTD-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Bench edit loop: at most 2 `cat-file` per `files:changed` over the steady rows (aggregate)
- [x] AD-062 recorded (number checked against open PRs first)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Status**: ✅ Complete - 2.00 over the steady rows (358/179; per row 120/60, 119/60, 119/59); no open upstream PR holds an AD; typecheck 0, lint 0 errors / 18 warnings, `npm test` 3172 at 3714ac2 (docs-only since)

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): record the steady stack's validation`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1
Phase 2:  T2 ------→ T3 ------→ T4 ------→ T5
```

---

## Fix Tasks (Verifier round 1)

### F1: Cover the release after the folds (18c)

**What**: Check 18c in `steadySection`: with All changes' Show unchanged pressed, a rewrite with 40 added lines grows the written section by exactly 40 Monaco lines; Hide unchanged is pressed back in `finally`
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T4
**Requirement**: FSTD-03

**Done when**:

- [x] 18c fails with the `measure()` after `applyFolds` removed (scratch worktree: 3851 → 3851 px) and passes on HEAD (3851 → 4611 px, +760 = 40 x 19)
- [x] `SMOKE_ONLY=steady` reads 3/3 and the full drive 126/126

**Tests**: e2e
**Gate**: full

**Status**: ✅ Complete

### F2: Word the bench target as the aggregate it is

**What**: "every steady row" becomes "over the steady rows (aggregate)" where the spec's Success Criteria and T5 say it, matching FSTD-06 and `bench-summary.mjs`
**Where**: `.specs/features/files-stack-steady-neighbours/spec.md`
**Depends on**: T5
**Requirement**: FSTD-06

**Done when**:

- [x] No "every steady row" left for the `cat-file` target in this feature's spec or tasks

**Tests**: none
**Gate**: build

**Status**: ✅ Complete

## Fix Tasks (Verifier round 2)

### F3: Pin the held height against a smaller measurement

**What**: The FSTD-02 test also asserts a pending measurement below the held height reports the held one (`reportedHeight(57, 180, pending)` is 180)
**Where**: `src/renderer/src/lib/diff-view.test.ts`
**Depends on**: T2
**Requirement**: FSTD-02

**Done when**:

- [x] The mutant `Math.min(last, measured)` while pending is killed (scratch worktree: 1 failed, 94 passed)
- [x] `diff-view.test.ts` 95/95 and `npm test` 3172 passed

**Tests**: unit
**Gate**: quick

**Status**: ✅ Complete
